import { EventEmitter } from 'events';
import { Kafka, Producer, Consumer, Admin } from 'kafkajs';
import { SchemaRegistry, AvroSchema, SchemaType } from '@kafkajs/confluent-schema-registry';
import Ajv from 'ajv';
import * as avro from 'avsc';
import { Redis } from 'ioredis';
import { logger, metrics } from '../utils';

// 数据Schema定义
export interface DataSchema {
  id: string;
  version: number;
  name: string;
  namespace: string;
  description?: string;
  schema: AvroSchema;
  compatibility: 'BACKWARD' | 'FORWARD' | 'FULL' | 'NONE';
  source: string;
  target: string;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    owner: string;
    tags: string[];
    qualityRules?: QualityRule[];
  };
}

// 数据质量规则
export interface QualityRule {
  field: string;
  type: 'required' | 'pattern' | 'range' | 'enum' | 'custom';
  rule: any;
  errorMessage: string;
  severity: 'error' | 'warning';
}

// Schema变更事件
export interface SchemaChangeEvent {
  type: 'created' | 'updated' | 'deleted' | 'compatibility_violated';
  schemaId: string;
  version: number;
  change: any;
  timestamp: Date;
}

export class SchemaRegistryService extends EventEmitter {
  private registry: SchemaRegistry;
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private admin: Admin;
  private redis: Redis;
  private ajv: Ajv;
  
  private schemas: Map<string, DataSchema> = new Map();
  private schemaCache: Map<string, avro.Type> = new Map();
  
  private readonly SCHEMA_TOPIC = 'data-pipeline-schemas';
  private readonly CACHE_TTL = 3600; // 1小时缓存

  constructor() {
    super();
    
    // 初始化Schema Registry
    this.registry = new SchemaRegistry({
      host: process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081'
    });
    
    // 初始化Kafka
    this.kafka = new Kafka({
      clientId: 'schema-registry-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        retries: 5,
        initialRetryTime: 100
      }
    });
    
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: 'schema-registry-group' });
    this.admin = this.kafka.admin();
    
    // 初始化Redis
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });
    
    // 初始化JSON Schema验证器
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    });
    
    this.initialize();
  }

  /**
   */
  private async initialize(): Promise<void> {
    try {
      // 连接Kafka
      await this.producer.connect();
      await this.consumer.connect();
      
      // 创建Schema主题（如果不存在）
      await this.ensureTopicExists(this.SCHEMA_TOPIC);
      
      // 订阅Schema变更
      await this.consumer.subscribe({ 
        topic: this.SCHEMA_TOPIC,
        fromBeginning: true 
      });
      
      // 处理Schema变更消息
      await this.consumer.run({
        eachMessage: async ({ message }) => {
          await this.handleSchemaChangeMessage(message);
        }
      });
      
      // 加载基础Schema
      await this.loadBaseSchemas();
      
      logger.info('Schema Registry服务初始化完成');
    } catch (error) {
      logger.error('Schema Registry服务初始化失败:', error);
      throw error;
    }
  }

  /**
   */
  async registerSchema(schema: Omit<DataSchema, 'id' | 'version' | 'metadata'>): Promise<DataSchema> {
    try {
      // 1. 验证Schema格式
      this.validateSchema(schema.schema);
      
      // 2. 生成Schema ID
      const schemaId = this.generateSchemaId(schema.name, schema.source, schema.target);
      const version = await this.getNextVersion(schemaId);
      
      // 3. 检查兼容性
      const existingSchema = this.schemas.get(schemaId);
      if (existingSchema) {
        const isCompatible = await this.checkCompatibility(
          existingSchema.schema,
          schema.schema,
          existingSchema.compatibility
        );
        
        if (!isCompatible) {
          throw new Error(`Schema变更不兼容 (${existingSchema.compatibility})`);
        }
      }
      
      // 4. 创建完整Schema对象
      const fullSchema: DataSchema = {
        ...schema,
        id: schemaId,
        version,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          owner: 'system',
          tags: schema.metadata?.tags || [],
          qualityRules: schema.metadata?.qualityRules || []
        }
      };
      
      // 5. 注册到Schema Registry
      const registeredId = await this.registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(fullSchema.schema)
      });
      
      // 6. 缓存Schema
      this.schemas.set(schemaId, fullSchema);
      const avroType = avro.Type.forSchema(fullSchema.schema);
      this.schemaCache.set(schemaId, avroType);
      
      // 7. 缓存到Redis
      await this.redis.setex(
        `schema:${schemaId}:${version}`,
        this.CACHE_TTL,
        JSON.stringify(fullSchema)
      );
      
      // 8. 发送变更事件
      await this.publishSchemaChange({
        type: existingSchema ? 'updated' : 'created',
        schemaId,
        version,
        change: {
          oldSchema: existingSchema?.schema,
          newSchema: fullSchema.schema
        },
        timestamp: new Date()
      });
      
      logger.info('Schema注册成功', {
        schemaId,
        version,
        name: schema.name,
        source: schema.source,
        target: schema.target
      });
      
      return fullSchema;
    } catch (error) {
      logger.error('Schema注册失败:', error);
      throw error;
    }
  }

  /**
   */
  async getSchema(schemaId: string, version?: number): Promise<DataSchema> {
    // 检查内存缓存
    const cachedSchema = this.schemas.get(schemaId);
    if (cachedSchema && (!version || cachedSchema.version === version)) {
      return cachedSchema;
    }
    
    // 检查Redis缓存
    const cacheKey = version ? `schema:${schemaId}:${version}` : `schema:${schemaId}:latest`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const schema = JSON.parse(cached);
      this.schemas.set(schemaId, schema);
      return schema;
    }
    
    // 从Schema Registry获取
    try {
      const schema = await this.fetchFromRegistry(schemaId, version);
      
      // 缓存结果
      this.schemas.set(schemaId, schema);
      await this.redis.setex(
        `schema:${schemaId}:${schema.version}`,
        this.CACHE_TTL,
        JSON.stringify(schema)
      );
      
      return schema;
    } catch (error) {
      logger.error('获取Schema失败:', error);
      throw error;
    }
  }

  /**
   */
  async validateData(schemaId: string, data: any): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    normalizedData: any;
  }> {
    try {
      const schema = await this.getSchema(schemaId);
      const avroType = this.getAvroType(schemaId, schema.schema);
      
      const result = {
        valid: true,
        errors: [] as string[],
        warnings: [] as string[],
        normalizedData: data
      };
      
      // 1. Avro Schema验证
      const isValidAvro = avroType.isValid(data);
      if (!isValidAvro) {
        result.valid = false;
        result.errors.push('数据不符合Avro Schema格式');
        return result;
      }
      
      // 2. 数据质量规则验证
      if (schema.metadata.qualityRules) {
        for (const rule of schema.metadata.qualityRules) {
          const ruleResult = this.applyQualityRule(data, rule);
          if (!ruleResult.valid) {
            if (rule.severity === 'error') {
              result.valid = false;
              result.errors.push(ruleResult.message);
            } else {
              result.warnings.push(ruleResult.message);
            }
          }
        }
      }
      
      // 3. 数据标准化
      result.normalizedData = this.normalizeData(data, schema);
      
      // 记录验证指标
      metrics.increment('data_pipeline.validation.total');
      if (result.valid) {
        metrics.increment('data_pipeline.validation.success');
      } else {
        metrics.increment('data_pipeline.validation.failed');
      }
      
      return result;
    } catch (error) {
      logger.error('数据验证失败:', error);
      throw error;
    }
  }

  /**
   */
  async transformData(
    sourceSchemaId: string,
    targetSchemaId: string,
    data: any,
    options?: {
      strict?: boolean;
      fillMissing?: boolean;
      removeExtra?: boolean;
    }
  ): Promise<{
    success: boolean;
    data: any;
    transformations: Array<{
      field: string;
      operation: string;
      from: any;
      to: any;
    }>;
    warnings: string[];
  }> {
    try {
      const sourceSchema = await this.getSchema(sourceSchemaId);
      const targetSchema = await this.getSchema(targetSchemaId);
      
      const transformations: Array<{
        field: string;
        operation: string;
        from: any;
        to: any;
      }> = [];
      
      const warnings: string[] = [];
      
      // 获取字段映射配置
      const fieldMappings = await this.getFieldMappings(sourceSchemaId, targetSchemaId);
      
      // 执行转换
      const transformedData = this.performTransformation(
        data,
        sourceSchema,
        targetSchema,
        fieldMappings,
        options || {},
        transformations,
        warnings
      );
      
      // 验证转换后的数据
      const validation = await this.validateData(targetSchemaId, transformedData);
      
      if (!validation.valid && options?.strict) {
        throw new Error(`转换后数据验证失败: ${validation.errors.join(', ')}`);
      }
      
      warnings.push(...validation.warnings);
      
      logger.debug('数据转换完成', {
        sourceSchemaId,
        targetSchemaId,
        fieldsTransformed: transformations.length,
        warnings: warnings.length
      });
      
      return {
        success: true,
        data: transformedData,
        transformations,
        warnings
      };
    } catch (error) {
      logger.error('数据转换失败:', error);
      throw error;
    }
  }

  /**
   */
  async getDataLineage(
    schemaId: string,
    dataId?: string
  ): Promise<{
    schema: DataSchema;
    upstream: Array<{
      schemaId: string;
      relationship: string;
      timestamp: Date;
    }>;
    downstream: Array<{
      schemaId: string;
      relationship: string;
      timestamp: Date;
    }>;
    transformations: Array<{
      id: string;
      sourceSchema: string;
      targetSchema: string;
      timestamp: Date;
      success: boolean;
    }>;
  }> {
    try {
      const schema = await this.getSchema(schemaId);
      
      // 从数据库获取血缘关系
      // 这里需要实现具体的血缘查询逻辑
      
      const lineage = {
        schema,
        upstream: [] as Array<{
          schemaId: string;
          relationship: string;
          timestamp: Date;
        }>,
        downstream: [] as Array<{
          schemaId: string;
          relationship: string;
          timestamp: Date;
        }>,
        transformations: [] as Array<{
          id: string;
          sourceSchema: string;
          targetSchema: string;
          timestamp: Date;
          success: boolean;
        }>
      };
      
      // 示例：获取相关的转换记录
      // const transformations = await this.db.query(`
      //   SELECT * FROM data_transformations 
      //   WHERE source_schema = $1 OR target_schema = $1
      //   ORDER BY timestamp DESC
      //   LIMIT 50
      // `, [schemaId]);
      
      // for (const trans of transformations) {
      //   lineage.transformations.push({
      //     id: trans.id,
      //     sourceSchema: trans.source_schema,
      //     targetSchema: trans.target_schema,
      //     timestamp: trans.timestamp,
      //     success: trans.success
      //   });
      // }
      
      return lineage;
    } catch (error) {
      logger.error('获取数据血缘失败:', error);
      throw error;
    }
  }

  /**
   */
  async exportSchemaDocumentation(schemaId: string): Promise<any> {
    const schema = await this.getSchema(schemaId);
    
    return {
      id: schema.id,
      name: schema.name,
      version: schema.version,
      description: schema.description,
      source: schema.source,
      target: schema.target,
      compatibility: schema.compatibility,
      fields: this.extractSchemaFields(schema.schema),
      qualityRules: schema.metadata.qualityRules,
      examples: await this.getSchemaExamples(schemaId),
      lineage: await this.getDataLineage(schemaId),
      metadata: {
        createdAt: schema.metadata.createdAt,
        updatedAt: schema.metadata.updatedAt,
        owner: schema.metadata.owner,
        tags: schema.metadata.tags
      }
    };
  }

  /**
   */
  
  private validateSchema(schema: AvroSchema): void {
    try {
      // 验证Avro Schema格式
      avro.Type.forSchema(schema);
    } catch (error) {
      throw new Error(`无效的Avro Schema: ${error.message}`);
    }
  }

  private generateSchemaId(name: string, source: string, target: string): string {
    const hash = require('crypto')
      .createHash('md5')
      .update(`${name}:${source}:${target}`)
      .digest('hex')
      .substring(0, 12);
    
    return `${name}_${hash}`;
  }

  private async getNextVersion(schemaId: string): Promise<number> {
    const existingSchema = this.schemas.get(schemaId);
    if (existingSchema) {
      return existingSchema.version + 1;
    }
    
    // 从数据库获取最新版本
    // const result = await this.db.query(
    //   'SELECT MAX(version) as max_version FROM schemas WHERE id = $1',
    //   [schemaId]
    // );
    
    // return (result[0]?.max_version || 0) + 1;
    
    return 1;
  }

  private async checkCompatibility(
    oldSchema: AvroSchema,
    newSchema: AvroSchema,
    compatibility: string
  ): Promise<boolean> {
    try {
      const oldType = avro.Type.forSchema(oldSchema);
      const newType = avro.Type.forSchema(newSchema);
      
      switch (compatibility) {
        case 'BACKWARD':
          // 新Schema可以读取旧数据
          return this.checkBackwardCompatibility(oldType, newType);
          
        case 'FORWARD':
          // 旧Schema可以读取新数据
          return this.checkForwardCompatibility(oldType, newType);
          
        case 'FULL':
          return this.checkBackwardCompatibility(oldType, newType) && 
                 this.checkForwardCompatibility(oldType, newType);
          
        case 'NONE':
          return true;
          
        default:
          return true;
      }
    } catch (error) {
      logger.error('兼容性检查失败:', error);
      return false;
    }
  }

  private checkBackwardCompatibility(oldType: avro.Type, newType: avro.Type): boolean {
    // 实现后向兼容性检查
    // 简化实现，实际应该更复杂
    return true;
  }

  private checkForwardCompatibility(oldType: avro.Type, newType: avro.Type): boolean {
    // 实现前向兼容性检查
    // 简化实现，实际应该更复杂
    return true;
  }

  private async publishSchemaChange(event: SchemaChangeEvent): Promise<void> {
    try {
      await this.producer.send({
        topic: this.SCHEMA_TOPIC,
        messages: [{
          key: event.schemaId,
          value: JSON.stringify(event),
          headers: {
            'event-type': 'schema-change',
            'schema-id': event.schemaId,
            'version': event.version.toString()
          }
        }]
      });
      
      logger.debug('Schema变更事件已发布', {
        schemaId: event.schemaId,
        version: event.version,
        type: event.type
      });
    } catch (error) {
      logger.error('发布Schema变更事件失败:', error);
    }
  }

  private async handleSchemaChangeMessage(message: any): Promise<void> {
    try {
      const event: SchemaChangeEvent = JSON.parse(message.value.toString());
      
      // 更新本地缓存
      if (event.type === 'created' || event.type === 'updated') {
        // 重新加载Schema
        await this.getSchema(event.schemaId, event.version);
      } else if (event.type === 'deleted') {
        this.schemas.delete(event.schemaId);
        this.schemaCache.delete(event.schemaId);
        await this.redis.del(`schema:${event.schemaId}:*`);
      }
      
      // 触发事件
      this.emit('schema-change', event);
      
      logger.debug('处理Schema变更事件', {
        schemaId: event.schemaId,
        type: event.type
      });
    } catch (error) {
      logger.error('处理Schema变更消息失败:', error);
    }
  }

  private async ensureTopicExists(topic: string): Promise<void> {
    try {
      const topics = await this.admin.listTopics();
      if (!topics.includes(topic)) {
        await this.admin.createTopics({
          topics: [{
            topic,
            numPartitions: 3,
            replicationFactor: 1
          }]
        });
        logger.info(`创建Kafka主题: ${topic}`);
      }
    } catch (error) {
      logger.error('检查/创建Kafka主题失败:', error);
      throw error;
    }
  }

  private async loadBaseSchemas(): Promise<void> {
    // 加载基础Schema定义
    const baseSchemas = [
      // Airtable Schema
      {
        name: 'airtable_lead',
        source: 'airtable',
        target: 'internal',
        schema: {
          type: 'record',
          name: 'AirtableLead',
          namespace: 'com.medbeauty.airtable',
          fields: [
            { name: '姓名', type: ['string', 'null'], default: null },
            { name: '手机号', type: 'string' },
            { name: '微信', type: ['string', 'null'], default: null },
            { name: '意向项目', type: ['string', 'null'], default: null },
            { name: '预算', type: ['string', 'null'], default: null },
            { name: '来源渠道', type: 'string', default: 'chat' },
            { name: '状态', type: 'string', default: '新线索' },
            { name: '创建时间', type: 'string' },
            { name: '更新时间', type: 'string' }
          ]
        } as AvroSchema,
        compatibility: 'BACKWARD' as const,
        metadata: {
          tags: ['airtable', 'lead', 'crm'],
          qualityRules: [
            {
              field: '手机号',
              type: 'pattern',
              rule: '^1[3-9]\\d{9}$',
              errorMessage: '手机号格式不正确',
              severity: 'error'
            }
          ]
        }
      },
      
      // 内部客户Schema
      {
        name: 'internal_customer',
        source: 'internal',
        target: 'internal',
        schema: {
          type: 'record',
          name: 'InternalCustomer',
          namespace: 'com.medbeauty.internal',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'name', type: ['string', 'null'], default: null },
            { name: 'phone', type: 'string' },
            { name: 'wechat', type: ['string', 'null'], default: null },
            { name: 'email', type: ['string', 'null'], default: null },
            { name: 'interest', type: ['string', 'null'], default: null },
            { name: 'budget', type: ['string', 'null'], default: null },
            { name: 'source', type: 'string', default: 'unknown' },
            { name: 'status', type: 'string', default: 'new' },
            { name: 'psychologicalType', type: ['string', 'null'], default: null },
            { name: 'customerTier', type: ['string', 'null'], default: null },
            { name: 'tags', type: { type: 'array', items: 'string' }, default: [] },
            { name: 'createdAt', type: 'string' },
            { name: 'updatedAt', type: 'string' },
            { name: 'metadata', type: ['string', 'null'], default: null }
          ]
        } as AvroSchema,
        compatibility: 'BACKWARD' as const,
        metadata: {
          tags: ['customer', 'crm', 'internal'],
          qualityRules: [
            {
              field: 'phone',
              type: 'required',
              rule: true,
              errorMessage: '手机号不能为空',
              severity: 'error'
            }
          ]
        }
      },
      
      // 企业微信Schema
      {
        name: 'wechat_customer',
        source: 'wechat',
        target: 'internal',
        schema: {
          type: 'record',
          name: 'WechatCustomer',
          namespace: 'com.medbeauty.wechat',
          fields: [
            { name: 'external_userid', type: 'string' },
            { name: 'name', type: ['string', 'null'], default: null },
            { name: 'avatar', type: ['string', 'null'], default: null },
            { name: 'gender', type: ['int', 'null'], default: null },
            { name: 'unionid', type: ['string', 'null'], default: null },
            { name: 'remark', type: ['string', 'null'], default: null },
            { name: 'remark_mobiles', type: { type: 'array', items: 'string' }, default: [] },
            { name: 'tag_id', type: { type: 'array', items: 'string' }, default: [] },
            { name: 'add_way', type: ['int', 'null'], default: null },
            { name: 'state', type: ['string', 'null'], default: null },
            { name: 'createtime', type: 'long' }
          ]
        } as AvroSchema,
        compatibility: 'BACKWARD' as const,
        metadata: {
          tags: ['wechat', 'customer', 'external'],
          qualityRules: []
        }
      }
    ];
    
    for (const schemaDef of baseSchemas) {
      try {
        await this.registerSchema(schemaDef);
      } catch (error) {
        logger.warn('加载基础Schema失败:', error);
      }
    }
  }

  private async fetchFromRegistry(schemaId: string, version?: number): Promise<DataSchema> {
    // 从Schema Registry获取Schema
    // 这里需要实现具体的获取逻辑
    
    // 示例：通过REST API获取
    // const response = await fetch(
    //   `${process.env.SCHEMA_REGISTRY_URL}/schemas/ids/${schemaId}/versions/${version || 'latest'}`
    // );
    // 
    // if (!response.ok) {
    //   throw new Error(`Schema不存在: ${schemaId}`);
    // }
    // 
    // const data = await response.json();
    // return JSON.parse(data.schema);
    
    throw new Error('Schema Registry获取未实现');
  }

  private getAvroType(schemaId: string, schema: AvroSchema): avro.Type {
    if (this.schemaCache.has(schemaId)) {
      return this.schemaCache.get(schemaId)!;
    }
    
    const avroType = avro.Type.forSchema(schema);
    this.schemaCache.set(schemaId, avroType);
    return avroType;
  }

  private applyQualityRule(data: any, rule: QualityRule): { valid: boolean; message: string } {
    const value = this.getNestedValue(data, rule.field);
    
    switch (rule.type) {
      case 'required':
        const isValid = value !== null && value !== undefined && value !== '';
        return {
          valid: isValid,
          message: isValid ? '' : rule.errorMessage
        };
        
      case 'pattern':
        if (value === null || value === undefined || value === '') {
          return { valid: true, message: '' };
        }
        
        const regex = new RegExp(rule.rule);
        const matches = regex.test(String(value));
        return {
          valid: matches,
          message: matches ? '' : rule.errorMessage
        };
        
      case 'range':
        if (value === null || value === undefined) {
          return { valid: true, message: '' };
        }
        
        const numValue = Number(value);
        const [min, max] = rule.rule;
        const inRange = !isNaN(numValue) && numValue >= min && numValue <= max;
        return {
          valid: inRange,
          message: inRange ? '' : rule.errorMessage
        };
        
      case 'enum':
        if (value === null || value === undefined) {
          return { valid: true, message: '' };
        }
        
        const inEnum = rule.rule.includes(value);
        return {
          valid: inEnum,
          message: inEnum ? '' : rule.errorMessage
        };
        
      case 'custom':
        // 自定义规则，可以是函数
        try {
          const customRule = new Function('value', 'data', `return ${rule.rule}`);
          const valid = customRule(value, data);
          return {
            valid: !!valid,
            message: valid ? '' : rule.errorMessage
          };
        } catch (error) {
          return {
            valid: false,
            message: `自定义规则执行失败: ${error.message}`
          };
        }
        
      default:
        return { valid: true, message: '' };
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current ? current[key] : undefined;
    }, obj);
  }

  private normalizeData(data: any, schema: DataSchema): any {
    // 数据标准化处理
    const normalized = { ...data };
    
    // 处理时间字段
    if (normalized.createdAt && typeof normalized.createdAt === 'string') {
      normalized.createdAt = new Date(normalized.createdAt).toISOString();
    }
    
    if (normalized.updatedAt && typeof normalized.updatedAt === 'string') {
      normalized.updatedAt = new Date(normalized.updatedAt).toISOString();
    }
    
    // 处理手机号格式
    if (normalized.phone) {
      normalized.phone = normalized.phone.replace(/[^\d]/g, '');
    }
    
    // 处理空值
    Object.keys(normalized).forEach(key => {
      if (normalized[key] === '' || normalized[key] === undefined) {
        normalized[key] = null;
      }
    });
    
    return normalized;
  }

  private async getFieldMappings(sourceSchemaId: string, targetSchemaId: string): Promise<any> {
    // 获取字段映射配置
    // 这里可以从数据库或配置文件中获取
    
    const mappings: Record<string, Record<string, any>> = {
      'airtable_lead_internal_customer': {
        '姓名': { target: 'name', transform: 'direct' },
        '手机号': { target: 'phone', transform: 'direct' },
        '微信': { target: 'wechat', transform: 'direct' },
        '意向项目': { target: 'interest', transform: 'direct' },
        '预算': { target: 'budget', transform: 'direct' },
        '来源渠道': { target: 'source', transform: 'direct' },
        '状态': { target: 'status', transform: 'status_mapping' },
        '创建时间': { target: 'createdAt', transform: 'timestamp' },
        '更新时间': { target: 'updatedAt', transform: 'timestamp' }
      },
      'wechat_customer_internal_customer': {
        'external_userid': { target: 'wechat', transform: 'direct' },
        'name': { target: 'name', transform: 'direct' },
        'remark': { target: 'name', transform: 'prefer_remark' },
        'remark_mobiles': { target: 'phone', transform: 'first_mobile' },
        'tag_id': { target: 'tags', transform: 'direct' },
        'createtime': { target: 'createdAt', transform: 'wechat_timestamp' }
      }
    };
    
    const mappingKey = `${sourceSchemaId}_${targetSchemaId}`.replace(/_/g, '');
    return mappings[mappingKey] || {};
  }

  private performTransformation(
    data: any,
    sourceSchema: DataSchema,
    targetSchema: DataSchema,
    fieldMappings: any,
    options: any,
    transformations: Array<any>,
    warnings: string[]
  ): any {
    const result: any = {};
    
    // 遍历目标Schema的所有字段
    const targetFields = this.extractSchemaFields(targetSchema.schema);
    
    for (const targetField of targetFields) {
      const mapping = fieldMappings[targetField.name];
      
      if (mapping) {
        // 有映射关系
        const sourceValue = this.getNestedValue(data, mapping.target);
        const transformedValue = this.applyTransformation(
          sourceValue,
          mapping.transform,
          data,
          transformations,
          targetField.name
        );
        
        result[targetField.name] = transformedValue;
      } else if (options.fillMissing) {
        // 填充默认值
        result[targetField.name] = targetField.default !== undefined 
          ? targetField.default 
          : null;
        
        warnings.push(`字段 ${targetField.name} 无映射，使用默认值`);
      } else if (options.removeExtra) {
        // 不包含未映射的字段
        continue;
      }
    }
    
    // 添加系统字段
    result._metadata = {
      sourceSchema: sourceSchema.id,
      targetSchema: targetSchema.id,
      transformedAt: new Date().toISOString(),
      transformationId: require('crypto').randomUUID()
    };
    
    return result;
  }

  private applyTransformation(
    value: any,
    transformType: string,
    originalData: any,
    transformations: Array<any>,
    targetField: string
  ): any {
    let transformedValue = value;
    
    switch (transformType) {
      case 'direct':
        // 直接复制
        break;
        
      case 'status_mapping':
        // 状态映射
        const statusMap: Record<string, string> = {
          '新线索': 'new',
          '已联系': 'contacted',
          '已预约': 'scheduled',
          '已到店': 'visited',
          '已成交': 'converted',
          '已流失': 'lost'
        };
        transformedValue = statusMap[value] || 'unknown';
        break;
        
      case 'timestamp':
        // 时间戳转换
        try {
          transformedValue = new Date(value).toISOString();
        } catch (error) {
          transformedValue = new Date().toISOString();
        }
        break;
        
      case 'wechat_timestamp':
        // 企业微信时间戳（秒转毫秒）
        transformedValue = new Date(Number(value) * 1000).toISOString();
        break;
        
      case 'prefer_remark':
        // 优先使用备注名
        transformedValue = originalData.remark || originalData.name || value;
        break;
        
      case 'first_mobile':
        // 使用第一个手机号
        transformedValue = Array.isArray(value) && value.length > 0 ? value[0] : null;
        break;
        
      default:
        transformedValue = value;
    }
    
    transformations.push({
      field: targetField,
      operation: transformType,
      from: value,
      to: transformedValue
    });
    
    return transformedValue;
  }

  private extractSchemaFields(schema: AvroSchema): Array<{
    name: string;
    type: string;
    default?: any;
    doc?: string;
  }> {
    if (schema.type !== 'record') {
      return [];
    }
    
    return (schema.fields || []).map(field => ({
      name: field.name,
      type: typeof field.type === 'string' ? field.type : JSON.stringify(field.type),
      default: field.default,
      doc: field.doc
    }));
  }

  private async getSchemaExamples(schemaId: string): Promise<any[]> {
    // 获取Schema示例数据
    // 这里可以从数据库获取
    
    const examples: Record<string, any[]> = {
      'airtable_lead': [
        {
          姓名: '张三',
          手机号: '13800138000',
          微信: 'zhangsan123',
          意向项目: '超皮秒',
          预算: '5000-8000',
          来源渠道: 'chat',
          状态: '新线索',
          创建时间: '2026-02-03T10:00:00Z',
          更新时间: '2026-02-03T10:00:00Z'
        }
      ],
      'internal_customer': [
        {
          id: 'cust_001',
          name: '张三',
          phone: '13800138000',
          wechat: 'zhangsan123',
          interest: '超皮秒',
          budget: '5000-8000',
          source: 'chat',
          status: 'new',
          psychologicalType: 'greed',
          customerTier: 'A',
          tags: ['vip', 'high_value'],
          createdAt: '2026-02-03T10:00:00Z',
          updatedAt: '2026-02-03T10:00:00Z'
        }
      ]
    };
    
    return examples[schemaId.split('_')[0]] || [];
  }

  /**
   */
  
  async getStatistics(): Promise<any> {
    return {
      totalSchemas: this.schemas.size,
      cacheSize: this.schemaCache.size,
      redisStatus: await this.redis.ping(),
      kafkaStatus: {
        producer: this.producer.isIdle(),
        consumer: this.consumer.isIdle()
      },
      recentActivity: await this.getRecentActivity()
    };
  }

  private async getRecentActivity(): Promise<any[]> {
    // 获取最近的活动记录
    // 这里可以从数据库获取
    
    return [
      {
        timestamp: new Date().toISOString(),
        type: 'schema_validation',
        count: 15,
        successRate: 0.93
      }
    ];
  }

  /**
   */
  async shutdown(): Promise<void> {
    logger.info('关闭Schema Registry服务...');
    
    try {
      await this.producer.disconnect();
      await this.consumer.disconnect();
      await this.redis.quit();
      
      logger.info('Schema Registry服务已关闭');
    } catch (error) {
      logger.error('关闭Schema Registry服务失败:', error);
    }
  }
}

// 单例模式导出
export const schemaRegistryService = new SchemaRegistryService();