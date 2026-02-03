import { Transform, PassThrough, pipeline } from 'stream';
import { EventEmitter } from 'events';
import * as avro from 'avsc';
import { logger } from '../utils/logger';

export interface DataSchema {
  id: string;
  version: number;
  schema: any;
  source: string;
  target: string;
  transformations: Transformation[];
}

export interface Transformation {
  field: string;
  operation: 'map' | 'filter' | 'enrich' | 'validate';
  config: any;
}

export class DataPipeline extends EventEmitter {
  private schemas: Map<string, DataSchema> = new Map();
  private pipelines: Map<string, Transform[]> = new Map();

  // 注册数据模式
  registerSchema(schema: DataSchema) {
    const key = `${schema.source}_${schema.target}_${schema.version}`;
    this.schemas.set(key, schema);
    
    // 创建对应的处理管道
    this.createPipeline(schema);
    
    logger.info(`注册数据模式: ${key}`);
  }

  // 创建数据处理管道
  private createPipeline(schema: DataSchema) {
    const transforms: Transform[] = [];
    const key = `${schema.source}_${schema.target}_${schema.version}`;

    // 1. 输入验证
    transforms.push(new Transform({
      objectMode: true,
      transform: (data, encoding, callback) => {
        try {
          // Avro模式验证
          const type = avro.Type.forSchema(schema.schema);
          const isValid = type.isValid(data);
          
          if (!isValid) {
            throw new Error('数据验证失败');
          }
          
          this.emit('data_validated', { data, schema });
          callback(null, data);
        } catch (error) {
          this.emit('validation_error', { data, error, schema });
          callback(error);
        }
      }
    }));

    // 2. 数据转换
    for (const transformation of schema.transformations) {
      transforms.push(this.createTransform(transformation));
    }

    // 3. 输出序列化
    transforms.push(new Transform({
      objectMode: true,
      transform: (data, encoding, callback) => {
        try {
          // 转换为目标格式
          const output = this.serializeForTarget(data, schema.target);
          this.emit('data_transformed', { data: output, schema });
          callback(null, output);
        } catch (error) {
          this.emit('transformation_error', { data, error, schema });
          callback(error);
        }
      }
    }));

    this.pipelines.set(key, transforms);
  }

  // 创建转换器
  private createTransform(transformation: Transformation): Transform {
    return new Transform({
      objectMode: true,
      transform: (data, encoding, callback) => {
        try {
          const result = this.applyTransformation(data, transformation);
          callback(null, result);
        } catch (error) {
          callback(error);
        }
      }
    });
  }

  // 应用转换规则
  private applyTransformation(data: any, transformation: Transformation): any {
    switch (transformation.operation) {
      case 'map':
        return this.mapField(data, transformation);
      case 'filter':
        return this.filterData(data, transformation);
      case 'enrich':
        return this.enrichData(data, transformation);
      case 'validate':
        return this.validateData(data, transformation);
      default:
        return data;
    }
  }

  // 字段映射
  private mapField(data: any, transformation: Transformation): any {
    const { field, config } = transformation;
    
    if (config.mapping) {
      // 字段重命名映射
      const mapped = { ...data };
      Object.entries(config.mapping).forEach(([from, to]: [string, string]) => {
        if (mapped[from] !== undefined) {
          mapped[to] = mapped[from];
          delete mapped[from];
        }
      });
      return mapped;
    }
    
    return data;
  }

  // 数据过滤
  private filterData(data: any, transformation: Transformation): any {
    const { config } = transformation;
    
    if (config.condition) {
      // 应用过滤条件
      const condition = new Function('data', `return ${config.condition}`); // 注意：生产环境应该用更安全的方式
      return condition(data) ? data : null; // 返回null表示过滤掉
    }
    
    return data;
  }

  // 数据增强
  private enrichData(data: any, transformation: Transformation): any {
    const { config } = transformation;
    
    if (config.enrichments) {
      const enriched = { ...data };
      
      for (const enrichment of config.enrichments) {
        if (enrichment.type === 'lookup') {
          // 查找表增强
          enriched[enrichment.targetField] = this.lookupValue(data, enrichment);
        } else if (enrichment.type === 'calculation') {
          // 计算字段
          enriched[enrichment.targetField] = this.calculateField(data, enrichment);
        }
      }
      
      return enriched;
    }
    
    return data;
  }

  // 执行数据管道
  async processData(source: string, target: string, data: any, version = 1): Promise<any> {
    const key = `${source}_${target}_${version}`;
    const pipeline = this.pipelines.get(key);
    
    if (!pipeline) {
      throw new Error(`找不到对应的数据管道: ${key}`);
    }

    return new Promise((resolve, reject) => {
      const streams = [...pipeline];
      const passthrough = new PassThrough({ objectMode: true });
      
      // 构建管道链
      let current = passthrough;
      for (const stream of streams) {
        current = current.pipe(stream);
      }
      
      // 收集结果
      const results: any[] = [];
      current.on('data', (chunk) => {
        if (chunk !== null) { // 过滤掉的数据为null
          results.push(chunk);
        }
      });
      
      current.on('end', () => {
        resolve(results.length === 1 ? results[0] : results);
      });
      
      current.on('error', (error) => {
        reject(error);
      });
      
      // 开始处理
      passthrough.write(data);
      passthrough.end();
    });
  }

  // 双向解析：Airtable ↔ 内部格式
  async createBidirectionalParser(source: string, target: string) {
    // 正向解析：源 -> 目标
    const forwardSchema: DataSchema = {
      id: `${source}_to_${target}`,
      version: 1,
      schema: this.getSchemaDefinition(source),
      source,
      target,
      transformations: this.getTransformations(source, target)
    };

    // 反向解析：目标 -> 源
    const reverseSchema: DataSchema = {
      id: `${target}_to_${source}`,
      version: 1,
      schema: this.getSchemaDefinition(target),
      source: target,
      target: source,
      transformations: this.getTransformations(target, source, true)
    };

    this.registerSchema(forwardSchema);
    this.registerSchema(reverseSchema);

    return {
      forward: (data: any) => this.processData(source, target, data),
      reverse: (data: any) => this.processData(target, source, data)
    };
  }

  // 获取模式定义
  private getSchemaDefinition(type: string): any {
    const schemas = {
      airtable: {
        type: 'record',
        name: 'AirtableLead',
        fields: [
          { name: '姓名', type: 'string' },
          { name: '手机号', type: 'string' },
          { name: '微信', type: ['string', 'null'] },
          { name: '意向项目', type: ['string', 'null'] },
          { name: '预算', type: ['string', 'null'] },
          { name: '来源渠道', type: 'string' },
          { name: '状态', type: 'string' }
        ]
      },
      internal: {
        type: 'record',
        name: 'InternalLead',
        fields: [
          { name: 'name', type: ['string', 'null'] },
          { name: 'phone', type: 'string' },
          { name: 'wechat', type: ['string', 'null'] },
          { name: 'interest', type: ['string', 'null'] },
          { name: 'budget', type: ['string', 'null'] },
          { name: 'source', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'psychologicalType', type: ['string', 'null'] },
          { name: 'customerTier', type: ['string', 'null'] }
        ]
      },
      wechat: {
        type: 'record',
        name: 'WechatCustomer',
        fields: [
          { name: 'external_userid', type: 'string' },
          { name: 'name', type: ['string', 'null'] },
          { name: 'remark', type: ['string', 'null'] },
          { name: 'remark_mobiles', type: { type: 'array', items: 'string' } },
          { name: 'tag_id', type: { type: 'array', items: 'string' } }
        ]
      }
    };

    return schemas[type as keyof typeof schemas];
  }

  // 获取转换规则
  private getTransformations(source: string, target: string, reverse = false): Transformation[] {
    const transformations: Record<string, Transformation[]> = {
      'airtable_internal': [
        {
          field: '*',
          operation: 'map',
          config: {
            mapping: {
              '姓名': 'name',
              '手机号': 'phone',
              '微信': 'wechat',
              '意向项目': 'interest',
              '预算': 'budget',
              '来源渠道': 'source',
              '状态': 'status'
            }
          }
        },
        {
          field: 'psychologicalType',
          operation: 'enrich',
          config: {
            enrichments: [
              {
                type: 'lookup',
                sourceField: 'interest',
                targetField: 'psychologicalType',
                lookupTable: {
                  '超皮秒': 'greed',
                  '热玛吉': 'security',
                  '水光针': 'sensitive'
                },
                defaultValue: 'fear'
              }
            ]
          }
        }
      ],
      'internal_airtable': [
        {
          field: '*',
          operation: 'map',
          config: {
            mapping: {
              'name': '姓名',
              'phone': '手机号',
              'wechat': '微信',
              'interest': '意向项目',
              'budget': '预算',
              'source': '来源渠道',
              'status': '状态'
            }
          }
        }
      ]
    };

    const key = reverse ? `${target}_${source}` : `${source}_${target}`;
    return transformations[key] || [];
  }
}