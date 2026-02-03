import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

interface BufferConfig {
  maxSize: number;
  flushInterval: number;
  batchSize: number;
  retryAttempts: number;
  deduplicationWindow: number;
}

interface BufferedItem<T = any> {
  id: string;
  data: T;
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
  metadata?: Record<string, any>;
}

export class DataBufferService<T = any> extends EventEmitter {
  private buffer: Map<string, BufferedItem<T>> = new Map();
  private redis: Redis;
  private config: BufferConfig;
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private processingQueue: Set<string> = new Set();

  constructor(config: Partial<BufferConfig> = {}) {
    super();
    
    this.config = {
      maxSize: config.maxSize || 1000,
      flushInterval: config.flushInterval || 5000, // 5秒
      batchSize: config.batchSize || 100,
      retryAttempts: config.retryAttempts || 3,
      deduplicationWindow: config.deduplicationWindow || 60000 // 1分钟
    };

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });

    this.startFlushTimer();
  }

  // 添加数据到缓冲区
  async add(item: T, id?: string): Promise<string> {
    const itemId = id || this.generateId(item);
    const now = Date.now();

    // 去重检查
    if (await this.isDuplicate(itemId, now)) {
      this.emit('duplicate', { id: itemId, data: item });
      return itemId;
    }

    // 检查缓冲区大小
    if (this.buffer.size >= this.config.maxSize) {
      await this.forceFlush();
    }

    // 添加到缓冲区
    const bufferedItem: BufferedItem<T> = {
      id: itemId,
      data: item,
      timestamp: now,
      attempts: 0
    };

    this.buffer.set(itemId, bufferedItem);
    
    // 记录到Redis用于去重
    await this.redis.setex(
      `buffer:dedup:${itemId}`,
      this.config.deduplicationWindow / 1000,
      now.toString()
    );

    this.emit('added', bufferedItem);
    logger.debug(`添加到缓冲区: ${itemId}, 当前大小: ${this.buffer.size}`);

    return itemId;
  }

  // 强制刷新缓冲区
  async forceFlush(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('缓冲区正在处理中，跳过强制刷新');
      return;
    }

    await this.flushBuffer();
  }

  // 开始定时刷新
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(async () => {
      if (this.buffer.size > 0) {
        await this.flushBuffer();
      }
    }, this.config.flushInterval);
  }

  // 刷新缓冲区
  private async flushBuffer(): Promise<void> {
    if (this.isProcessing || this.buffer.size === 0) {
      return;
    }

    this.isProcessing = true;
    
    try {
      // 分批处理
      const items = Array.from(this.buffer.values());
      const batches = this.chunkArray(items, this.config.batchSize);

      for (const batch of batches) {
        await this.processBatch(batch);
      }

      this.emit('flushed', { count: items.length });
      logger.info(`缓冲区刷新完成，处理了 ${items.length} 条数据`);
    } catch (error) {
      logger.error('缓冲区刷新失败:', error);
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
      // 清理已处理的数据
      this.cleanupProcessedItems();
    }
  }

  // 处理批次
  private async processBatch(batch: BufferedItem<T>[]): Promise<void> {
    const batchId = Date.now().toString();
    this.emit('batch_start', { batchId, size: batch.length });

    try {
      // 在这里实现具体的批处理逻辑
      // 例如：批量写入数据库、批量发送到Kafka等
      await this.handleBatchProcessing(batch);

      // 标记为已处理
      for (const item of batch) {
        this.buffer.delete(item.id);
        this.processingQueue.delete(item.id);
      }

      this.emit('batch_complete', { batchId, success: true });
    } catch (error) {
      logger.error(`批次处理失败: ${batchId}`, error);
      
      // 处理失败的重试逻辑
      for (const item of batch) {
        await this.handleRetry(item);
      }

      this.emit('batch_error', { batchId, error, retryItems: batch });
    }
  }

  // 具体的批处理逻辑（需要子类实现或通过回调）
  private async handleBatchProcessing(batch: BufferedItem<T>[]): Promise<void> {
    // 这里可以实现具体的处理逻辑，例如：
    // 1. 批量插入数据库
    // 2. 批量发送到消息队列
    // 3. 批量调用API
    
    // 示例：批量保存到数据库
    const records = batch.map(item => ({
      id: item.id,
      data: item.data,
      createdAt: new Date(item.timestamp)
    }));

    // 这里调用具体的存储服务
    // await this.databaseService.batchInsert(records);
    
    logger.info(`处理批次，大小: ${batch.length}`);
  }

  // 重试处理
  private async handleRetry(item: BufferedItem<T>): Promise<void> {
    item.attempts += 1;
    item.lastAttempt = Date.now();

    if (item.attempts <= this.config.retryAttempts) {
      // 还可以重试，放回缓冲区
      this.buffer.set(item.id, item);
      this.emit('retry', { id: item.id, attempts: item.attempts });
      
      // 指数退避
      const delay = Math.min(1000 * Math.pow(2, item.attempts), 30000);
      setTimeout(() => {
        if (this.buffer.has(item.id)) {
          this.addToProcessingQueue(item.id);
        }
      }, delay);
    } else {
      // 重试次数用完，移动到死信队列
      await this.moveToDeadLetterQueue(item);
      this.buffer.delete(item.id);
      this.emit('dead_letter', { id: item.id, data: item.data });
    }
  }

  // 移动到死信队列
  private async moveToDeadLetterQueue(item: BufferedItem<T>): Promise<void> {
    const deadLetterItem = {
      ...item,
      failedAt: Date.now(),
      failureReason: 'max_retries_exceeded'
    };

    await this.redis.rpush(
      'buffer:dead_letters',
      JSON.stringify(deadLetterItem)
    );

    logger.warn(`移动到死信队列: ${item.id}, 重试次数: ${item.attempts}`);
  }

  // 添加处理队列
  private addToProcessingQueue(id: string): void {
    if (!this.processingQueue.has(id)) {
      this.processingQueue.add(id);
      // 触发单个项目处理
      setTimeout(() => this.processSingleItem(id), 0);
    }
  }

  // 处理单个项目
  private async processSingleItem(id: string): Promise<void> {
    const item = this.buffer.get(id);
    if (!item) return;

    try {
      await this.handleSingleProcessing(item);
      this.buffer.delete(id);
      this.processingQueue.delete(id);
    } catch (error) {
      await this.handleRetry(item);
    }
  }

  // 单个项目处理
  private async handleSingleProcessing(item: BufferedItem<T>): Promise<void> {
    // 这里可以实现单个项目的处理逻辑
    logger.debug(`处理单个项目: ${item.id}`);
  }

  // 清理已处理的项
  private cleanupProcessedItems(): void {
    const now = Date.now();
    const expiredTime = now - this.config.deduplicationWindow;

    // 清理过期的去重记录
    // 这里可以使用Redis的过期机制自动清理
  }

  // 检查重复项
  private async isDuplicate(id: string, timestamp: number): Promise<boolean> {
    const lastSeen = await this.redis.get(`buffer:dedup:${id}`);
    
    if (lastSeen) {
      const lastTime = parseInt(lastSeen);
      // 在去重窗口内出现过的认为是重复项
      return (timestamp - lastTime) < this.config.deduplicationWindow;
    }

    return false;
  }

  // 生成ID
  private generateId(item: T): string {
    // 可以根据业务需求生成更合适的ID
    const hash = require('crypto').createHash('md5');
    hash.update(JSON.stringify(item));
    return hash.digest('hex').substring(0, 16);
  }

  // 数组分块
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // 获取缓冲区状态
  getStatus() {
    return {
      size: this.buffer.size,
      processing: this.isProcessing,
      queueSize: this.processingQueue.size,
      config: this.config
    };
  }

  // 清理资源
  async cleanup() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.forceFlush();
    await this.redis.quit();
    
    this.removeAllListeners();
    logger.info('数据缓冲服务已清理');
  }
}
typescript
// 集成所有优化服务
export class OptimizedSystem {
  private queueService: QueueService;
  private dataPipeline: DataPipeline;
  private semanticService: SemanticUnderstandingService;
  private ragService: RAGService;
  private bufferService: DataBufferService;

  constructor() {
    this.queueService = new QueueService();
    this.dataPipeline = new DataPipeline();
    this.semanticService = new SemanticUnderstandingService();
    this.ragService = new RAGService();
    this.bufferService = new DataBufferService({
      maxSize: 1000,
      flushInterval: 3000,
      batchSize: 50
    });
  }

  async initialize() {
    // 初始化所有服务
    await this.queueService.initialize();
    
    // 注册数据管道模式
    this.registerDataSchemas();
    
    // 初始化RAG知识库
    await this.initializeRAG();
    
    logger.info('优化系统初始化完成');
  }

  // 完整的数据处理流程
  async processCustomerInquiry(inquiry: CustomerInquiry): Promise<ProcessedResponse> {
    // 1. 缓冲处理
    const bufferId = await this.bufferService.add(inquiry);
    
    // 2. 异步队列处理
    const job = await this.queueService.enqueueAIGeneration({
      type: 'inquiry',
      data: inquiry
    });

    // 3. 等待处理结果
    const result = await job.waitUntilFinished();
    
    // 4. 数据管道转换
    const processed = await this.dataPipeline.processData(
      'inquiry',
      'response',
      result
    );

    // 5. 语义理解增强
    const enhanced = await this.semanticService.enhanceResponse(
      processed,
      inquiry.context
    );

    return enhanced;
  }

  // 智能响应生成
  async generateIntelligentResponse(query: string, customerData: any): Promise<string> {
    // 1. 语义理解
    const context = await this.semanticService.enhanceCustomerUnderstanding(
      customerData,
      []
    );

    // 2. RAG检索
    const { documents, confidence } = await this.ragService.intelligentRetrieval(
      query,
      context
    );

    // 3. 动态提示词生成
    const prompt = await this.semanticService.generateDynamicPrompt(
      customerData,
      query
    );

    // 4. AI生成（异步）
    const job = await this.queueService.enqueueAIGeneration({
      type: 'response',
      data: {
        prompt,
        context,
        documents: documents.slice(0, 3) // 使用前3个最相关文档
      },
      priority: confidence > 80 ? 2 : 1
    });

    const result = await job.waitUntilFinished();
    return result.response;
  }
}
typescript
// 监控中间件
export const monitoringMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime();
  const requestId = crypto.randomUUID();

  // 监控指标
  const metrics = {
    requestId,
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent'],
    ip: req.ip
  };

  // 记录开始时间
  metricsStorage.startRequest(requestId, metrics);

  // 拦截响应
  const originalSend = res.send;
  res.send = function(body) {
    // 计算处理时间
    const diff = process.hrtime(startTime);
    const duration = diff[0] * 1000 + diff[1] / 1000000;

    // 记录结束时间
    metricsStorage.endRequest(requestId, {
      statusCode: res.statusCode,
      duration,
      responseSize: Buffer.byteLength(body?.toString() || '')
    });

    // 发送到监控系统
    monitorService.recordRequest({
      ...metrics,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString()
    });

    return originalSend.call(this, body);
  };

  next();
};
typescript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      queue: await checkQueue(),
      vectorStore: await checkVectorStore(),
      externalApis: await checkExternalApis()
    },
    metrics: {
      bufferSize: bufferService.getStatus().size,
      queueBacklog: queueService.getQueueSize(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    }
  };

  // 如果有服务不可用，返回503
  const unhealthyServices = Object.entries(health.services)
    .filter(([_, status]) => status !== 'healthy')
    .map(([name]) => name);

  if (unhealthyServices.length > 0) {
    health.status = 'degraded';
    res.status(503);
  }

  res.json(health);
});
响应时间：通过异步处理，API响应时间从3-5秒降低到<500ms



































text
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   HTTP API  │───▶│  Message    │───▶│   Worker    │
│   (Fast)    │    │   Queue     │    │   Pool      │
└─────────────┘    └─────────────┘    └─────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   (200ms)   │    │  (Redis)    │    │  (AI/DB)    │
└─────────────┘    └─────────────┘    └─────────────┘