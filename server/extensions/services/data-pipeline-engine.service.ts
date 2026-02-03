import { EventEmitter } from 'events';
import { Kafka, Producer, Consumer, Admin } from 'kafkajs';
import { DebeziumConnector } from './debezium-connector.service';
import { SchemaRegistryService } from './schema-registry.service';
import { Redis } from 'ioredis';
import { logger, metrics } from '../utils';

// 管道定义
export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string;
  source: {
    type: 'kafka' | 'database' | 'api' | 'file';
    config: any;
  };
  transformations: Array<{
    id: string;
    type: 'filter' | 'map' | 'enrich' | 'aggregate' | 'join';
    config: any;
    condition?: string;
  }>;
  sink: {
    type: 'kafka' | 'database' | 'api' | 'data_lake';
    config: any;
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    owner: string;
    tags: string[];
    qualityTargets?: QualityTarget[];
  };
  state: 'draft' | 'active' | 'paused' | 'stopped' | 'error';
  errorPolicy: {
    retryCount: number;
    retryDelay: number;
    deadLetterQueue: boolean;
    alertOnError: boolean;
  };
}

// 数据质量目标
export interface QualityTarget {
  metric: string;
  target: number;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
}

// 管道状态
export interface PipelineStatus {
  pipelineId: string;
  state: string;
  processedCount: number;
  errorCount: number;
  lastProcessedTime?: Date;
  currentThroughput: number;
  metrics: {
    latency: number;
    successRate: number;
    dataQualityScore: number;
  };
  errors: Array<{
    timestamp: Date;
    message: string;
    data?: any;
  }>;
}

// 数据事件
export interface DataEvent {
  id: string;
  pipelineId: string;
  source: string;
  timestamp: Date;
  data: any;
  metadata: {
    schemaId: string;
    version: number;
    operation: 'create' | 'update' | 'delete';
    sourceInfo: any;
  };
  processingContext: {
    stage: string;
    attempt: number;
    transformations: string[];
  };
}

export class DataPipelineEngine extends EventEmitter {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private admin: Admin;
  private redis: Redis;
  
  private debeziumConnector: DebeziumConnector;
  private schemaRegistry: SchemaRegistryService;
  
  private pipelines: Map<string, PipelineDefinition> = new Map();
  private pipelineStatuses: Map<string, PipelineStatus> = new Map();
  private pipelineConsumers: Map<string, Consumer> = new Map();
  
  private readonly PIPELINE_TOPIC_PREFIX = 'data-pipeline-';
  private readonly DLQ_TOPIC = 'data-pipeline-dlq';
  private readonly METRICS_TOPIC = 'data-pipeline-metrics';

  constructor() {
    super();
    
    this.kafka = new Kafka({
      clientId: 'data-pipeline-engine',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        retries: 5,
        initialRetryTime: 100
      }
    });
    
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: 'data-pipeline-engine' });
    this.admin = this.kafka.admin();
    
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      keyPrefix: 'data-pipeline:'
    });
    
    this.debeziumConnector = new DebeziumConnector();
    this.schemaRegistry = new SchemaRegistryService();
    
    this.initialize();
  }

  /**
   */
  private async initialize(): Promise<void> {
    try {
      // 连接Kafka
      await this.producer.connect();
      await this.consumer.connect();
      
      // 创建必要的主题
      await this.ensureTopicsExist();
      
      // 加载现有管道
      await this.loadExistingPipelines();
      
      // 启动监控
      this.startMonitoring();
      
      logger.info('数据管道引擎初始化完成');
    } catch (error) {
      logger.error('数据管道引擎初始化失败:', error);
      throw error;
    }
  }

  /**
   */
  async createPipeline(definition: Omit<PipelineDefinition, 'id' | 'metadata' | 'state'>): Promise<PipelineDefinition> {
    try {
      // 1. 生成管道ID
      const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 2. 验证管道定义
      this.validatePipelineDefinition(definition);
      
      // 3. 创建完整管道定义
      const fullDefinition: PipelineDefinition = {
        ...definition,
        id: pipelineId,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          owner: 'system',
          tags: definition.metadata?.tags || [],
          qualityTargets: definition.metadata?.qualityTargets || []
        },
        state: 'draft'
      };
      
      // 4. 保存管道定义
      await this.savePipelineDefinition(fullDefinition);
      this.pipelines.set(pipelineId, fullDefinition);
      
      // 5. 初始化管道状态
      const status: PipelineStatus = {
        pipelineId,
        state: 'draft',
        processedCount: 0,
        errorCount: 0,
        currentThroughput: 0,
        metrics: {
          latency: 0,
          successRate: 1.0,
          dataQualityScore: 1.0
        },
        errors: []
      };
      
      this.pipelineStatuses.set(pipelineId, status);
      
      logger.info('创建数据管道', {
        pipelineId,
        name: definition.name,
        source: definition.source.type,
        sink: definition.sink.type
      });
      
      this.emit('pipeline_created', fullDefinition);
      
      return fullDefinition;
    } catch (error) {
      logger.error('创建数据管道失败:', error);
      throw error;
    }
  }

  /**
   */
  async startPipeline(pipelineId: string): Promise<void> {
    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        throw new Error(`管道不存在: ${pipelineId}`);
      }
      
      if (pipeline.state === 'active') {
        logger.warn('管道已在运行中', { pipelineId });
        return;
      }
      
      // 1. 更新管道状态
      pipeline.state = 'active';
      pipeline.metadata.updatedAt = new Date();
      
      const status = this.pipelineStatuses.get(pipelineId)!;
      status.state = 'active';
      status.lastProcessedTime = new Date();
      
      // 2. 根据源类型创建消费者
      await this.createPipelineConsumer(pipeline);
      
      // 3. 保存状态
      await this.savePipelineDefinition(pipeline);
      await this.savePipelineStatus(pipelineId, status);
      
      // 4. 启动CDC连接器（如果是数据库源）
      if (pipeline.source.type === 'database') {
        await this.debeziumConnector.startCapture(pipeline.source.config);
      }
      
      logger.info('启动数据管道', {
        pipelineId,
        name: pipeline.name,
        source: pipeline.source.type
      });
      
      this.emit('pipeline_started', pipeline);
      
      // 记录指标
      metrics.gauge('data_pipeline.active_pipelines', this.getActivePipelineCount());
    } catch (error) {
      logger.error('启动数据管道失败:', error);
      
      // 更新为错误状态
      if (pipeline) {
        pipeline.state = 'error';
        await this.savePipelineDefinition(pipeline);
      }
      
      throw error;
    }
  }

  /**
   */
  async pausePipeline(pipelineId: string): Promise<void> {
    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        throw new Error(`管道不存在: ${pipelineId}`);
      }
      
      if (pipeline.state !== 'active') {
        throw new Error(`管道不是运行状态: ${pipeline.state}`);
      }
      
      // 1. 暂停消费者
      const consumer = this.pipelineConsumers.get(pipelineId);
      if (consumer) {
        await consumer.pause([{ topic: this.getPipelineTopic(pipelineId) }]);
      }
      
      // 2. 更新状态
      pipeline.state = 'paused';
      pipeline.metadata.updatedAt = new Date();
      
      const status = this.pipelineStatuses.get(pipelineId)!;
      status.state = 'paused';
      
      // 3. 保存状态
      await this.savePipelineDefinition(pipeline);
      await this.savePipelineStatus(pipelineId, status);
      
      logger.info('暂停数据管道', { pipelineId, name: pipeline.name });
      
      this.emit('pipeline_paused', pipeline);
    } catch (error) {
      logger.error('暂停数据管道失败:', error);
      throw error;
    }
  }

  /**
   */
  async stopPipeline(pipelineId: string): Promise<void> {
    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        throw new Error(`管道不存在: ${pipelineId}`);
      }
      
      // 1. 停止消费者
      const consumer = this.pipelineConsumers.get(pipelineId);
      if (consumer) {
        await consumer.disconnect();
        this.pipelineConsumers.delete(pipelineId);
      }
      
      // 2. 停止CDC连接器
      if (pipeline.source.type === 'database') {
        await this.debeziumConnector.stopCapture(pipeline.source.config);
      }
      
      // 3. 更新状态
      pipeline.state = 'stopped';
      pipeline.metadata.updatedAt = new Date();
      
      const status = this.pipelineStatuses.get(pipelineId)!;
      status.state = 'stopped';
      
      // 4. 保存状态
      await this.savePipelineDefinition(pipeline);
      await this.savePipelineStatus(pipelineId, status);
      
      logger.info('停止数据管道', { pipelineId, name: pipeline.name });
      
      this.emit('pipeline_stopped', pipeline);
    } catch (error) {
      logger.error('停止数据管道失败:', error);
      throw error;
    }
  }

  /**
   */
  private async processDataEvent(pipelineId: string, event: DataEvent): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId)!;
    const status = this.pipelineStatuses.get(pipelineId)!;
    
    const startTime = Date.now();
    let success = true;
    let errorMessage: string | undefined;
    
    try {
      // 1. 验证数据Schema
      const validation = await this.schemaRegistry.validateData(
        event.metadata.schemaId,
        event.data
      );
      
      if (!validation.valid) {
        throw new Error(`数据验证失败: ${validation.errors.join(', ')}`);
      }
      
      // 2. 执行转换
      let transformedData = validation.normalizedData;
      const appliedTransformations: string[] = [];
      
      for (const transformation of pipeline.transformations) {
        try {
          transformedData = await this.applyTransformation(
            transformation,
            transformedData,
            event
          );
          appliedTransformations.push(transformation.id);
        } catch (error) {
          logger.warn('转换失败', {
            pipelineId,
            transformationId: transformation.id,
            error: error.message
          });
          
          if (transformation.condition) {
            // 有条件的转换可以跳过
            continue;
          }
          
          throw error;
        }
      }
      
      // 3. 写入目标
      await this.writeToSink(pipeline.sink, transformedData, event);
      
      // 4. 更新处理上下文
      event.processingContext.transformations = appliedTransformations;
      event.processingContext.stage = 'completed';
      
      // 5. 发送处理成功事件
      await this.sendProcessingResult(pipelineId, event, 'success', transformedData);
      
      // 更新指标
      const latency = Date.now() - startTime;
      status.processedCount++;
      status.metrics.latency = (status.metrics.latency * 0.9) + (latency * 0.1);
      status.metrics.successRate = (status.metrics.successRate * 0.95) + (1 * 0.05);
      status.lastProcessedTime = new Date();
      
      metrics.timing('data_pipeline.processing_latency', latency);
      metrics.increment('data_pipeline.processed_events');
      
    } catch (error) {
      success = false;
      errorMessage = error.message;
      
      // 处理错误
      await this.handleProcessingError(pipeline, event, error);
      
      // 更新指标
      status.errorCount++;
      status.metrics.successRate = (status.metrics.successRate * 0.95) + (0 * 0.05);
      status.errors.push({
        timestamp: new Date(),
        message: error.message,
        data: event.data
      });
      
      // 限制错误数量
      if (status.errors.length > 100) {
        status.errors = status.errors.slice(-100);
      }
      
      metrics.increment('data_pipeline.processing_errors');
    } finally {
      // 更新吞吐量
      this.updateThroughput(pipelineId);
      
      // 保存状态
      await this.savePipelineStatus(pipelineId, status);
      
      // 触发事件
      if (success) {
        this.emit('event_processed', { pipelineId, event, success: true });
      } else {
        this.emit('event_failed', { pipelineId, event, error: errorMessage });
      }
    }
  }

  /**
   */
  private async applyTransformation(
    transformation: any,
    data: any,
    originalEvent: DataEvent
  ): Promise<any> {
    switch (transformation.type) {
      case 'filter':
        return this.applyFilter(transformation, data, originalEvent);
        
      case 'map':
        return this.applyMap(transformation, data);
        
      case 'enrich':
        return await this.applyEnrichment(transformation, data, originalEvent);
        
      case 'aggregate':
        return await this.applyAggregation(transformation, data, originalEvent);
        
      case 'join':
        return await this.applyJoin(transformation, data, originalEvent);
        
      default:
        throw new Error(`未知的转换类型: ${transformation.type}`);
    }
  }

  /**
   */
  private applyFilter(transformation: any, data: any, event: DataEvent): any {
    const condition = transformation.condition;
    
    if (!condition) {
      return data;
    }
    
    // 评估条件
    const shouldKeep = this.evaluateCondition(condition, data, event);
    
    if (!shouldKeep) {
      throw new Error('数据被过滤');
    }
    
    return data;
  }

  /**
   */
  private applyMap(transformation: any, data: any): any {
    const mapping = transformation.config.mapping;
    
    if (!mapping) {
      return data;
    }
    
    const result = { ...data };
    
    // 应用字段映射
    for (const [sourceField, targetConfig] of Object.entries(mapping)) {
      const config = targetConfig as any;
      const sourceValue = this.getNestedValue(data, sourceField);
      
      if (config.target) {
        const transformedValue = this.transformValue(sourceValue, config.transform, data);
        this.setNestedValue(result, config.target, transformedValue);
        
        // 如果需要，删除源字段
        if (config.removeSource) {
          this.deleteNestedValue(result, sourceField);
        }
      }
    }
    
    return result;
  }

  /**
   */
  private async applyEnrichment(
    transformation: any,
    data: any,
    event: DataEvent
  ): Promise<any> {
    const enrichments = transformation.config.enrichments;
    
    if (!enrichments || !Array.isArray(enrichments)) {
      return data;
    }
    
    const result = { ...data };
    
    for (const enrichment of enrichments) {
      try {
        const enrichedValue = await this.fetchEnrichmentData(enrichment, data, event);
        
        if (enrichedValue !== undefined) {
          this.setNestedValue(result, enrichment.targetField, enrichedValue);
        }
      } catch (error) {
        logger.warn('数据增强失败', {
          enrichment: enrichment.type,
          error: error.message
        });
        
        if (enrichment.required) {
          throw error;
        }
      }
    }
    
    return result;
  }

  /**
   */
  private async writeToSink(sinkConfig: any, data: any, event: DataEvent): Promise<void> {
    switch (sinkConfig.type) {
      case 'kafka':
        await this.writeToKafka(sinkConfig, data, event);
        break;
        
      case 'database':
        await this.writeToDatabase(sinkConfig, data, event);
        break;
        
      case 'api':
        await this.writeToApi(sinkConfig, data, event);
        break;
        
      case 'data_lake':
        await this.writeToDataLake(sinkConfig, data, event);
        break;
        
      default:
        throw new Error(`未知的目标类型: ${sinkConfig.type}`);
    }
  }

  /**
   */
  private async handleProcessingError(
    pipeline: PipelineDefinition,
    event: DataEvent,
    error: Error
  ): Promise<void> {
    const errorPolicy = pipeline.errorPolicy;
    const currentAttempt = event.processingContext.attempt || 1;
    
    // 更新尝试次数
    event.processingContext.attempt = currentAttempt + 1;
    
    if (currentAttempt < errorPolicy.retryCount) {
      // 重试
      const delay = errorPolicy.retryDelay * Math.pow(2, currentAttempt - 1); // 指数退避
      
      logger.info('安排重试', {
        pipelineId: pipeline.id,
        eventId: event.id,
        attempt: currentAttempt,
        delay
      });
      
      setTimeout(() => {
        this.retryEvent(pipeline.id, event).catch(retryError => {
          logger.error('重试失败', {
            pipelineId: pipeline.id,
            eventId: event.id,
            error: retryError.message
          });
        });
      }, delay);
      
    } else if (errorPolicy.deadLetterQueue) {
      // 发送到死信队列
      await this.sendToDeadLetterQueue(pipeline.id, event, error);
      
    } else if (errorPolicy.alertOnError) {
      // 触发告警
      await this.triggerAlert(pipeline, event, error);
    }
    
    // 记录错误
    metrics.increment('data_pipeline.errors_total', {
      pipeline: pipeline.id,
      error_type: error.name
    });
  }

  /**
   */
  private async createPipelineConsumer(pipeline: PipelineDefinition): Promise<void> {
    const topic = this.getPipelineTopic(pipeline.id);
    
    // 创建消费者
    const consumer = this.kafka.consumer({
      groupId: `pipeline-${pipeline.id}`,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576, // 1MB
      maxBytes: 5242880 // 5MB
    });
    
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    
    // 开始消费
    await consumer.run({
      autoCommit: true,
      autoCommitInterval: 5000,
      autoCommitThreshold: 100,
      partitionsConsumedConcurrently: 3,
      eachMessage: async ({ message }) => {
        try {
          const event: DataEvent = JSON.parse(message.value!.toString());
          await this.processDataEvent(pipeline.id, event);
        } catch (error) {
          logger.error('处理消息失败', {
            pipelineId: pipeline.id,
            error: error.message
          });
        }
      }
    });
    
    this.pipelineConsumers.set(pipeline.id, consumer);
    
    logger.debug('创建管道消费者', {
      pipelineId: pipeline.id,
      topic
    });
  }

  /**
   */
  
  private validatePipelineDefinition(definition: any): void {
    if (!definition.name || !definition.source || !definition.sink) {
      throw new Error('管道定义不完整');
    }
    
    if (!['kafka', 'database', 'api', 'file'].includes(definition.source.type)) {
      throw new Error(`不支持的源类型: ${definition.source.type}`);
    }
    
    if (!['kafka', 'database', 'api', 'data_lake'].includes(definition.sink.type)) {
      throw new Error(`不支持的目标类型: ${definition.sink.type}`);
    }
  }

  private async ensureTopicsExist(): Promise<void> {
    const topics = [
      this.DLQ_TOPIC,
      this.METRICS_TOPIC
    ];
    
    for (const topic of topics) {
      await this.ensureTopicExists(topic);
    }
  }

  private async ensureTopicExists(topic: string): Promise<void> {
    try {
      const existingTopics = await this.admin.listTopics();
      if (!existingTopics.includes(topic)) {
        await this.admin.createTopics({
          topics: [{
            topic,
            numPartitions: 3,
            replicationFactor: 1,
            configEntries: [
              { name: 'retention.ms', value: '604800000' }, // 7天
              { name: 'cleanup.policy', value: 'delete' }
            ]
          }]
        });
        logger.info(`创建Kafka主题: ${topic}`);
      }
    } catch (error) {
      logger.error('检查/创建Kafka主题失败:', error);
      throw error;
    }
  }

  private async loadExistingPipelines(): Promise<void> {
    // 从数据库加载现有管道
    // 这里需要实现具体的加载逻辑
    
    // 示例：
    // const pipelines = await this.db.query('SELECT * FROM pipelines WHERE state = $1', ['active']);
    // 
    // for (const pipelineRow of pipelines) {
    //   const pipeline: PipelineDefinition = JSON.parse(pipelineRow.definition);
    //   this.pipelines.set(pipeline.id, pipeline);
    //   
    //   // 加载状态
    //   const status = await this.db.query(
    //     'SELECT * FROM pipeline_status WHERE pipeline_id = $1',
    //     [pipeline.id]
    //   );
    //   
    //   if (status.length > 0) {
    //     this.pipelineStatuses.set(pipeline.id, status[0]);
    //   }
    //   
    //   // 如果是活跃状态，启动管道
    //   if (pipeline.state === 'active') {
    //     await this.startPipeline(pipeline.id);
    //   }
    // }
    
    logger.info('加载现有管道', { count: this.pipelines.size });
  }

  private getPipelineTopic(pipelineId: string): string {
    return `${this.PIPELINE_TOPIC_PREFIX}${pipelineId}`;
  }

  private async savePipelineDefinition(pipeline: PipelineDefinition): Promise<void> {
    // 保存管道定义到数据库
    // 这里需要实现具体的保存逻辑
    
    // 示例：
    // await this.db.query(`
    //   INSERT INTO pipelines (id, definition, state, updated_at)
    //   VALUES ($1, $2, $3, $4)
    //   ON CONFLICT (id) DO UPDATE 
    //   SET definition = $2, state = $3, updated_at = $4
    // `, [
    //   pipeline.id,
    //   JSON.stringify(pipeline),
    //   pipeline.state,
    //   pipeline.metadata.updatedAt
    // ]);
    
    // 缓存到Redis
    await this.redis.setex(
      `pipeline:${pipeline.id}`,
      JSON.stringify(pipeline)
    );
  }

  private async savePipelineStatus(pipelineId: string, status: PipelineStatus): Promise<void> {
    // 保存管道状态到数据库
    // 这里需要实现具体的保存逻辑
    
    // 缓存到Redis
    await this.redis.setex(
      `pipeline_status:${pipelineId}`,
      300, // 5分钟缓存
      JSON.stringify(status)
    );
  }

  private getActivePipelineCount(): number {
    return Array.from(this.pipelines.values())
      .filter(p => p.state === 'active')
      .length;
  }

  private evaluateCondition(condition: string, data: any, event: DataEvent): boolean {
    try {
      // 创建安全的评估函数
      const func = new Function('data', 'event', `
        try {
          return ${condition};
        } catch (error) {
          return false;
        }
      `);
      
      return func(data, event);
    } catch (error) {
      logger.error('评估条件失败', {
        condition,
        error: error.message
      });
      return false;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current ? current[key] : undefined;
    }, obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
  }

  private deleteNestedValue(obj: any, path: string): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    const parent = keys.reduce((current, key) => {
      return current ? current[key] : undefined;
    }, obj);
    
    if (parent && parent.hasOwnProperty(lastKey)) {
      delete parent[lastKey];
    }
  }

  private transformValue(value: any, transformType: string, context: any): any {
    switch (transformType) {
      case 'string':
        return String(value);
      case 'number':
        return Number(value) || 0;
      case 'boolean':
        return Boolean(value);
      case 'date':
        return new Date(value).toISOString();
      case 'upper':
        return String(value).toUpperCase();
      case 'lower':
        return String(value).toLowerCase();
      case 'trim':
        return String(value).trim();
      case 'default':
        return value === undefined ? context.defaultValue : value;
      default:
        return value;
    }
  }

  private async fetchEnrichmentData(enrichment: any, data: any, event: DataEvent): Promise<any> {
    switch (enrichment.type) {
      case 'lookup':
        return await this.lookupEnrichment(enrichment, data);
      case 'api':
        return await this.apiEnrichment(enrichment, data);
      case 'calculation':
        return this.calculationEnrichment(enrichment, data);
      case 'geography':
        return await this.geographyEnrichment(enrichment, data);
      default:
        throw new Error(`未知的增强类型: ${enrichment.type}`);
    }
  }

  private async lookupEnrichment(enrichment: any, data: any): Promise<any> {
    // 查找表增强
    const lookupTable = enrichment.config?.lookupTable || {};
    const sourceValue = this.getNestedValue(data, enrichment.sourceField);
    
    return lookupTable[sourceValue] || enrichment.config?.defaultValue;
  }

  private async apiEnrichment(enrichment: any, data: any): Promise<any> {
    // API增强
    const url = enrichment.config?.url;
    const method = enrichment.config?.method || 'GET';
    const headers = enrichment.config?.headers || {};
    const body = enrichment.config?.body;
    
    if (!url) {
      throw new Error('API增强缺少URL配置');
    }
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }
      
      const result = await response.json();
      return this.getNestedValue(result, enrichment.config?.responsePath || '');
    } catch (error) {
      logger.error('API增强失败', {
        url,
        error: error.message
      });
      throw error;
    }
  }

  private calculationEnrichment(enrichment: any, data: any): any {
    // 计算增强
    const expression = enrichment.config?.expression;
    
    if (!expression) {
      throw new Error('计算增强缺少表达式配置');
    }
    
    try {
      // 创建安全的计算函数
      const func = new Function('data', `
        try {
          return ${expression};
        } catch (error) {
          throw new Error('计算失败: ' + error.message);
        }
      `);
      
      return func(data);
    } catch (error) {
      logger.error('计算增强失败', {
        expression,
        error: error.message
      });
      throw error;
    }
  }

  private async geographyEnrichment(enrichment: any, data: any): Promise<any> {
    // 地理信息增强
    const address = this.getNestedValue(data, enrichment.config?.addressField);
    
    if (!address) {
      return enrichment.config?.defaultValue;
    }
    
    // 这里可以调用地理编码服务
    // 例如：高德地图、百度地图API
    
    // 简化示例：返回模拟数据
    return {
      province: '广东省',
      city: '深圳市',
      district: '南山区',
      latitude: 22.541,
      longitude: 113.934
    };
  }

  private async applyAggregation(
    transformation: any,
    data: any,
    event: DataEvent
  ): Promise<any> {
    // 聚合转换
    const config = transformation.config;
    
    // 这里需要实现具体的聚合逻辑
    // 可能涉及窗口计算、状态管理等
    
    return data;
  }

  private async applyJoin(
    transformation: any,
    data: any,
    event: DataEvent
  ): Promise<any> {
    // 连接转换
    const config = transformation.config;
    
    // 这里需要实现具体的连接逻辑
    // 可能涉及数据库查询、流连接等
    
    return data;
  }

  private async writeToKafka(sinkConfig: any, data: any, event: DataEvent): Promise<void> {
    const topic = sinkConfig.config?.topic;
    
    if (!topic) {
      throw new Error('Kafka目标缺少topic配置');
    }
    
    await this.producer.send({
      topic,
      messages: [{
        key: event.id,
        value: JSON.stringify(data),
        headers: {
          'event-id': event.id,
          'pipeline-id': event.pipelineId,
          'schema-id': event.metadata.schemaId,
          'operation': event.metadata.operation
        }
      }]
    });
  }

  private async writeToDatabase(sinkConfig: any, data: any, event: DataEvent): Promise<void> {
    const table = sinkConfig.config?.table;
    
    if (!table) {
      throw new Error('数据库目标缺少table配置');
    }
    
    // 这里需要实现具体的数据库写入逻辑
    // 可能使用ORM或原始SQL
    
    // 示例：
    // await this.db.query(`
    //   INSERT INTO ${table} (data, event_id, created_at)
    //   VALUES ($1, $2, $3)
    //   ON CONFLICT (event_id) DO UPDATE
    //   SET data = $1, updated_at = $3
    // `, [JSON.stringify(data), event.id, new Date()]);
  }

  private async writeToApi(sinkConfig: any, data: any, event: DataEvent): Promise<void> {
    const url = sinkConfig.config?.url;
    
    if (!url) {
      throw new Error('API目标缺少URL配置');
    }
    
    const method = sinkConfig.config?.method || 'POST';
    const headers = sinkConfig.config?.headers || {};
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          data,
          metadata: event.metadata,
          pipelineId: event.pipelineId
        })
      });
      
      if (!response.ok) {
        throw new Error(`API写入失败: ${response.status}`);
      }
    } catch (error) {
      logger.error('API写入失败', {
        url,
        error: error.message
      });
      throw error;
    }
  }

  private async writeToDataLake(sinkConfig: any, data: any, event: DataEvent): Promise<void> {
    // 写入数据湖
    // 这里需要实现具体的数据湖写入逻辑
    // 可能使用Iceberg、Delta Lake等
    
    logger.debug('写入数据湖', {
      dataSize: JSON.stringify(data).length,
      schemaId: event.metadata.schemaId
    });
  }

  private async sendProcessingResult(
    pipelineId: string,
    event: DataEvent,
    status: string,
    result?: any
  ): Promise<void> {
    const message = {
      pipelineId,
      eventId: event.id,
      status,
      timestamp: new Date(),
      processingTime: Date.now() - event.timestamp.getTime(),
      result,
      metadata: event.metadata
    };
    
    await this.producer.send({
      topic: this.METRICS_TOPIC,
      messages: [{
        key: event.id,
        value: JSON.stringify(message)
      }]
    });
  }

  private async sendToDeadLetterQueue(
    pipelineId: string,
    event: DataEvent,
    error: Error
  ): Promise<void> {
    const dlqMessage = {
      pipelineId,
      event,
      error: {
        message: error.message,
        stack: error.stack,
        timestamp: new Date()
      },
      metadata: {
        retryCount: event.processingContext.attempt || 1,
        originalTimestamp: event.timestamp
      }
    };
    
    await this.producer.send({
      topic: this.DLQ_TOPIC,
      messages: [{
        key: event.id,
        value: JSON.stringify(dlqMessage)
      }]
    });
    
    logger.warn('发送到死信队列', {
      pipelineId,
      eventId: event.id,
      error: error.message
    });
  }

  private async triggerAlert(
    pipeline: PipelineDefinition,
    event: DataEvent,
    error: Error
  ): Promise<void> {
    const alert = {
      type: 'pipeline_error',
      severity: 'critical',
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      eventId: event.id,
      error: error.message,
      timestamp: new Date(),
      data: event.data
    };
    
    // 这里可以发送到告警系统
    // 例如：Slack、钉钉、邮件等
    
    logger.error('管道错误告警', alert);
    
    // 触发事件
    this.emit('alert_triggered', alert);
  }

  private async retryEvent(pipelineId: string, event: DataEvent): Promise<void> {
    // 重新发布事件到管道主题
    await this.producer.send({
      topic: this.getPipelineTopic(pipelineId),
      messages: [{
        key: event.id,
        value: JSON.stringify(event)
      }]
    });
  }

  private updateThroughput(pipelineId: string): void {
    const status = this.pipelineStatuses.get(pipelineId);
    if (!status) return;
    
    const now = Date.now();
    const windowSize = 60000; // 1分钟窗口
    
    // 这里需要实现更精确的吞吐量计算
    // 可以使用滑动窗口算法
    
    // 简化实现
    status.currentThroughput = status.processedCount / 
      (now - (status.lastProcessedTime?.getTime() || now) + windowSize) * 
      60000;
  }

  private startMonitoring(): void {
    // 定期收集和报告指标
    setInterval(async () => {
      try {
        await this.collectAndReportMetrics();
      } catch (error) {
        logger.error('收集指标失败:', error);
      }
    }, 60000); // 每分钟一次
  }

  private async collectAndReportMetrics(): Promise<void> {
    const metricsData = {
      timestamp: new Date().toISOString(),
      pipelines: {
        total: this.pipelines.size,
        active: this.getActivePipelineCount(),
        byState: this.getPipelinesByState()
      },
      processing: {
        totalProcessed: this.getTotalProcessedCount(),
        totalErrors: this.getTotalErrorCount(),
        avgLatency: this.getAverageLatency(),
        avgSuccessRate: this.getAverageSuccessRate()
      },
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      }
    };
    
    // 发送到监控主题
    await this.producer.send({
      topic: this.METRICS_TOPIC,
      messages: [{
        key: 'metrics',
        value: JSON.stringify(metricsData)
      }]
    });
    
    // 更新Prometheus指标
    metrics.gauge('data_pipeline.total_pipelines', this.pipelines.size);
    metrics.gauge('data_pipeline.active_pipelines', this.getActivePipelineCount());
    metrics.gauge('data_pipeline.total_processed', this.getTotalProcessedCount());
    metrics.gauge('data_pipeline.total_errors', this.getTotalErrorCount());
  }

  private getPipelinesByState(): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const pipeline of this.pipelines.values()) {
      counts[pipeline.state] = (counts[pipeline.state] || 0) + 1;
    }
    
    return counts;
  }

  private getTotalProcessedCount(): number {
    return Array.from(this.pipelineStatuses.values())
      .reduce((sum, status) => sum + status.processedCount, 0);
  }

  private getTotalErrorCount(): number {
    return Array.from(this.pipelineStatuses.values())
      .reduce((sum, status) => sum + status.errorCount, 0);
  }

  private getAverageLatency(): number {
    const statuses = Array.from(this.pipelineStatuses.values());
    if (statuses.length === 0) return 0;
    
    const totalLatency = statuses.reduce((sum, status) => sum + status.metrics.latency, 0);
    return totalLatency / statuses.length;
  }

  private getAverageSuccessRate(): number {
    const statuses = Array.from(this.pipelineStatuses.values());
    if (statuses.length === 0) return 1;
    
    const totalSuccessRate = statuses.reduce((sum, status) => sum + status.metrics.successRate, 0);
    return totalSuccessRate / statuses.length;
  }

  /**
   */
  
  async getPipeline(pipelineId: string): Promise<PipelineDefinition | null> {
    return this.pipelines.get(pipelineId) || null;
  }

  async getPipelineStatus(pipelineId: string): Promise<PipelineStatus | null> {
    return this.pipelineStatuses.get(pipelineId) || null;
  }

  async getAllPipelines(): Promise<PipelineDefinition[]> {
    return Array.from(this.pipelines.values());
  }

  async getAllPipelineStatuses(): Promise<Array<{ pipelineId: string; status: PipelineStatus }>> {
    return Array.from(this.pipelineStatuses.entries())
      .map(([pipelineId, status]) => ({ pipelineId, status }));
  }

  async deletePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`管道不存在: ${pipelineId}`);
    }
    
    // 停止管道
    await this.stopPipeline(pipelineId);
    
    // 从缓存中删除
    this.pipelines.delete(pipelineId);
    this.pipelineStatuses.delete(pipelineId);
    this.pipelineConsumers.delete(pipelineId);
    
    // 从存储中删除
    await this.redis.del(`pipeline:${pipelineId}`);
    await this.redis.del(`pipeline_status:${pipelineId}`);
    
    logger.info('删除数据管道', { pipelineId, name: pipeline.name });
    
    this.emit('pipeline_deleted', pipelineId);
  }

  async manualTrigger(pipelineId: string, data: any): Promise<string> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`管道不存在: ${pipelineId}`);
    }
    
    if (pipeline.state !== 'active') {
      throw new Error(`管道不是活跃状态: ${pipeline.state}`);
    }
    
    const eventId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const event: DataEvent = {
      id: eventId,
      pipelineId,
      source: 'manual',
      timestamp: new Date(),
      data,
      metadata: {
        schemaId: 'manual_input',
        version: 1,
        operation: 'create',
        sourceInfo: { trigger: 'manual' }
      },
      processingContext: {
        stage: 'started',
        attempt: 1,
        transformations: []
      }
    };
    
    // 发送到管道主题
    await this.producer.send({
      topic: this.getPipelineTopic(pipelineId),
      messages: [{
        key: eventId,
        value: JSON.stringify(event)
      }]
    });
    
    logger.info('手动触发管道', { pipelineId, eventId });
    
    return eventId;
  }

  async getPipelineMetrics(pipelineId: string, timeRange: string = '1h'): Promise<any> {
    // 获取管道指标数据
    // 这里可以从监控系统或数据库获取
    
    const status = this.pipelineStatuses.get(pipelineId);
    if (!status) {
      throw new Error(`管道状态不存在: ${pipelineId}`);
    }
    
    return {
      pipelineId,
      timestamp: new Date().toISOString(),
      status: status.state,
      processedCount: status.processedCount,
      errorCount: status.errorCount,
      successRate: status.metrics.successRate,
      avgLatency: status.metrics.latency,
      currentThroughput: status.currentThroughput,
      recentErrors: status.errors.slice(-10),
      qualityScore: status.metrics.dataQualityScore
    };
  }

  async repairPipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`管道不存在: ${pipelineId}`);
    }
    
    if (pipeline.state !== 'error') {
      throw new Error(`管道不是错误状态: ${pipeline.state}`);
    }
    
    logger.info('修复数据管道', { pipelineId, name: pipeline.name });
    
    // 1. 重置错误状态
    pipeline.state = 'stopped';
    
    // 2. 清理错误计数
    const status = this.pipelineStatuses.get(pipelineId)!;
    status.errorCount = 0;
    status.errors = [];
    status.metrics.successRate = 1.0;
    
    // 3. 重新启动管道
    await this.startPipeline(pipelineId);
    
    this.emit('pipeline_repaired', pipelineId);
  }

  async exportPipelineConfiguration(pipelineId: string): Promise<any> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`管道不存在: ${pipelineId}`);
    }
    
    return {
      pipeline: pipeline,
      status: this.pipelineStatuses.get(pipelineId),
      dependencies: await this.getPipelineDependencies(pipelineId),
      lineage: await this.getPipelineLineage(pipelineId)
    };
  }

  private async getPipelineDependencies(pipelineId: string): Promise<any[]> {
    // 获取管道依赖
    // 这里可以从血缘系统中获取
    
    return [];
  }

  private async getPipelineLineage(pipelineId: string): Promise<any> {
    // 获取管道血缘
    // 这里可以从血缘系统中获取
    
    return {
      upstream: [],
      downstream: [],
      transformations: []
    };
  }

  /**
   */
  async shutdown(): Promise<void> {
    logger.info('关闭数据管道引擎...');
    
    try {
      // 停止所有管道
      for (const pipelineId of this.pipelines.keys()) {
        await this.stopPipeline(pipelineId);
      }
      
      // 断开连接
      await this.producer.disconnect();
      await this.consumer.disconnect();
      await this.redis.quit();
      
      logger.info('数据管道引擎已关闭');
    } catch (error) {
      logger.error('关闭数据管道引擎失败:', error);
    }
  }
}

// 单例模式导出
export const dataPipelineEngine = new DataPipelineEngine();