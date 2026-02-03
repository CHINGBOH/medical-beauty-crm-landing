import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { EventEmitter } from 'events';
import { logger, metrics } from '../../utils';

// 队列配置接口
export interface QueueConfig {
  name: string;
  concurrency: number;  // 并发数
  limiter?: {
    max: number;        // 每秒最大任务数
    duration: number;   // 时间窗口(ms)
  };
  defaultJobOptions?: {
    attempts: number;   // 重试次数
    backoff: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete: number | boolean;  // 完成后保留数量
    removeOnFail: number | boolean;      // 失败后保留数量
    priority: number;   // 优先级 1-10
  };
}

// 任务优先级枚举
export enum JobPriority {
  LOW = 5,
  NORMAL = 3,
  HIGH = 1,
  CRITICAL = 0
}

// 队列状态
export interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
  workers: number;
}

export class CoreQueueService extends EventEmitter {
  private redis: IORedis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private events: Map<string, QueueEvents> = new Map();
  private connection: IORedis.Redis;
  private redisAvailable = false;
  private initialized = false;
  
  // 队列配置
  private readonly queueConfigs: Record<string, QueueConfig> = {
    'ai-content-generation': {
      name: 'ai-content-generation',
      concurrency: 3,  // AI生成资源消耗大，限制并发
      limiter: {
        max: 10,
        duration: 1000
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 1000,
        priority: JobPriority.NORMAL
      }
    },
    'ai-image-generation': {
      name: 'ai-image-generation',
      concurrency: 2,  // 图片生成更耗资源
      limiter: {
        max: 5,
        duration: 1000
      },
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 3000
        },
        removeOnComplete: 50,
        removeOnFail: 500,
        priority: JobPriority.NORMAL
      }
    },
    'data-sync': {
      name: 'data-sync',
      concurrency: 5,  // 数据同步可以高并发
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: 1000,
        removeOnFail: 10000,
        priority: JobPriority.LOW
      }
    },
    'trigger-execution': {
      name: 'trigger-execution',
      concurrency: 10,  // 触发器执行需要快速响应
      defaultJobOptions: {
        attempts: 1,    // 触发器失败后不需要重试
        backoff: {
          type: 'fixed',
          delay: 0
        },
        removeOnComplete: 10000,
        removeOnFail: 10000,
        priority: JobPriority.HIGH
      }
    },
    'wechat-notification': {
      name: 'wechat-notification',
      concurrency: 3,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 500,
        removeOnFail: 1000,
        priority: JobPriority.HIGH  // 通知需要高优先级
      }
    }
  };

  constructor() {
    super();
    
    // 创建Redis连接（生产环境应使用连接池）
    this.connection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectionName: 'bullmq-core',
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });

    // 创建用于监听的Redis连接
    this.redis = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectionName: 'bullmq-events',
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });

    this.connection.on('error', (error) => {
      logger.warn('Redis连接异常 (core):', error);
    });

    this.redis.on('error', (error) => {
      logger.warn('Redis连接异常 (events):', error);
    });
  }

  /**
   */
  async initialize(): Promise<void> {
    try {
      logger.info('开始初始化消息队列...');

      try {
        await this.connection.connect();
        await this.redis.connect();
        this.redisAvailable = true;
      } catch (error) {
        logger.warn('Redis未就绪，跳过消息队列初始化。', error);
        return;
      }
      
      // 初始化每个队列
      for (const config of Object.values(this.queueConfigs)) {
        await this.createQueue(config);
      }
      
      // 启动监控
      await this.startMonitoring();
      
      logger.info('消息队列初始化完成');
      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      logger.error('消息队列初始化失败:', error);
      throw error;
    }
  }

  getQueueConfigs(): Record<string, QueueConfig> {
    return this.queueConfigs;
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   */
  private async createQueue(config: QueueConfig): Promise<void> {
    const { name } = config;
    
    try {
      // 1. 创建队列
      const queue = new Queue(name, {
        connection: this.connection,
        defaultJobOptions: config.defaultJobOptions
      });
      this.queues.set(name, queue);
      
      // 2. 创建队列事件监听
      const events = new QueueEvents(name, { connection: this.redis });
      this.events.set(name, events);
      
      // 3. 创建工作线程（需要业务逻辑注入）
      // 这里只创建队列，工作线程在业务层注册
      
      // 4. 设置队列事件监听
      this.setupQueueEvents(queue, events);
      
      logger.info(`队列创建成功: ${name}`);
    } catch (error) {
      logger.error(`创建队列失败 ${name}:`, error);
      throw error;
    }
  }

  /**
   */
  private setupQueueEvents(queue: Queue, events: QueueEvents): void {
    const queueName = queue.name;
    
    // 任务添加
    events.on('added', ({ jobId, name: jobName }) => {
      logger.debug(`任务添加到队列 ${queueName}: ${jobId} (${jobName})`);
      metrics.increment(`queue.${queueName}.added`);
      this.emit('job:added', { queueName, jobId, jobName });
    });
    
    // 任务开始
    events.on('active', ({ jobId, prev }) => {
      logger.debug(`任务开始执行 ${queueName}: ${jobId}`);
      metrics.increment(`queue.${queueName}.active`);
      this.emit('job:active', { queueName, jobId, prev });
    });
    
    // 任务完成
    events.on('completed', ({ jobId, returnvalue }) => {
      logger.debug(`任务完成 ${queueName}: ${jobId}`);
      metrics.increment(`queue.${queueName}.completed`);
      metrics.timing(`queue.${queueName}.duration`, Date.now() - parseInt(jobId.split('-')[0]));
      this.emit('job:completed', { queueName, jobId, result: returnvalue });
    });
    
    // 任务失败
    events.on('failed', ({ jobId, failedReason }) => {
      logger.warn(`任务失败 ${queueName}: ${jobId}`, { failedReason });
      metrics.increment(`queue.${queueName}.failed`);
      this.emit('job:failed', { queueName, jobId, reason: failedReason });
    });
    
    // 任务进度
    events.on('progress', ({ jobId, data }) => {
      logger.debug(`任务进度 ${queueName}: ${jobId} -> ${data}%`);
      this.emit('job:progress', { queueName, jobId, progress: data });
    });
    
    // 队列暂停/恢复
    events.on('paused', () => {
      logger.info(`队列暂停 ${queueName}`);
      this.emit('queue:paused', queueName);
    });
    
    events.on('resumed', () => {
      logger.info(`队列恢复 ${queueName}`);
      this.emit('queue:resumed', queueName);
    });
  }

  /**
   */
  async registerWorker<T = any>(
    queueName: string,
    processor: (job: Job<T>) => Promise<any>
  ): Promise<void> {
    const config = this.queueConfigs[queueName];
    if (!config) {
      throw new Error(`队列 ${queueName} 未配置`);
    }
    
    if (this.workers.has(queueName)) {
      logger.warn(`队列 ${queueName} 已存在工作线程，正在替换`);
      await this.removeWorker(queueName);
    }
    
    // 创建工作线程
    const worker = new Worker(
      queueName,
      async (job: Job<T>) => {
        try {
          logger.info(`开始处理任务 ${queueName}: ${job.id}`, {
            data: this.sanitizeJobData(job.data)
          });
          
          const startTime = Date.now();
          const result = await processor(job);
          const duration = Date.now() - startTime;
          
          logger.info(`任务完成 ${queueName}: ${job.id}`, {
            duration: `${duration}ms`,
            resultSize: JSON.stringify(result)?.length || 0
          });
          
          return result;
        } catch (error) {
          logger.error(`任务处理失败 ${queueName}: ${job.id}`, error);
          throw error;
        }
      },
      {
        connection: this.connection,
        concurrency: config.concurrency,
        limiter: config.limiter,
        autorun: true
      }
    );
    
    // 设置工作线程事件
    worker.on('failed', (job, error) => {
      if (job) {
        logger.error(`工作线程任务失败 ${queueName}: ${job.id}`, {
          error: error.message,
          attempts: job.attemptsMade,
          attemptsRemaining: job.opts.attempts - job.attemptsMade
        });
      }
    });
    
    this.workers.set(queueName, worker);
    logger.info(`工作线程注册成功: ${queueName} (并发数: ${config.concurrency})`);
  }

  /**
   */
  async enqueue<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: {
      priority?: JobPriority;
      delay?: number;  // 延迟执行(ms)
      jobId?: string;  // 自定义任务ID
      attempts?: number;
      removeOnComplete?: boolean | number;
      removeOnFail?: boolean | number;
    }
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }
    
    const jobId = options?.jobId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const job = await queue.add(
      jobName,
      data,
      {
        jobId,
        priority: options?.priority || JobPriority.NORMAL,
        delay: options?.delay,
        attempts: options?.attempts,
        removeOnComplete: options?.removeOnComplete,
        removeOnFail: options?.removeOnFail
      }
    );
    
    logger.debug(`任务入队成功: ${queueName} -> ${job.id}`);
    return job;
  }

  /**
   */
  async bulkEnqueue<T = any>(
    queueName: string,
    jobs: Array<{
      name: string;
      data: T;
      options?: {
        priority?: JobPriority;
        delay?: number;
        jobId?: string;
      };
    }>
  ): Promise<Job<T>[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }
    
    const jobPromises = jobs.map(job => 
      queue.add(job.name, job.data, {
        jobId: job.options?.jobId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        priority: job.options?.priority || JobPriority.NORMAL,
        delay: job.options?.delay
      })
    );
    
    const results = await Promise.all(jobPromises);
    logger.info(`批量任务入队成功: ${queueName} -> ${results.length} 个任务`);
    return results;
  }

  /**
   */
  async getJobStatus(queueName: string, jobId: string): Promise<{
    id: string;
    name: string;
    data: any;
    state: string;
    progress: number;
    returnvalue: any;
    failedReason: string;
    timestamp: number;
    processedOn: number;
    finishedOn: number;
    attemptsMade: number;
  }> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }
    
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`任务 ${jobId} 不存在`);
    }
    
    const state = await job.getState();
    
    return {
      id: job.id!,
      name: job.name,
      data: this.sanitizeJobData(job.data),
      state,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn || 0,
      finishedOn: job.finishedOn || 0,
      attemptsMade: job.attemptsMade
    };
  }

  /**
   */
  async getQueueStatus(queueName: string): Promise<QueueStatus> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }
    
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      isPaused
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused()
    ]);
    
    const worker = this.workers.get(queueName);
    
    return {
      name: queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      isPaused,
      workers: worker ? 1 : 0
    };
  }

  /**
   */
  async getAllQueueStatus(): Promise<Record<string, QueueStatus>> {
    const status: Record<string, QueueStatus> = {};
    
    for (const [name] of this.queues) {
      status[name] = await this.getQueueStatus(name);
    }
    
    return status;
  }

  /**
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }
    
    await queue.pause();
    logger.info(`队列已暂停: ${queueName}`);
  }

  /**
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }
    
    await queue.resume();
    logger.info(`队列已恢复: ${queueName}`);
  }

  /**
   */
  async cleanQueue(
    queueName: string,
    grace: number = 1000 * 60 * 60,  // 1小时
    status: 'completed' | 'wait' | 'active' | 'delayed' | 'failed' = 'completed'
  ): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }
    
    const cleaned = await queue.clean(grace, status);
    logger.info(`队列清理完成: ${queueName} -> 清理了 ${cleaned.length} 个 ${status} 状态的任务`);
    return cleaned.length;
  }

  /**
   */
  async retryFailedJobs(queueName: string, count: number = 100): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }
    
    const failedJobs = await queue.getFailed(0, count);
    const retryPromises = failedJobs.map(job => job.retry());
    
    await Promise.all(retryPromises);
    logger.info(`重试失败任务: ${queueName} -> ${retryPromises.length} 个任务`);
    return retryPromises.length;
  }

  /**
   */
  async removeWorker(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (worker) {
      await worker.close();
      this.workers.delete(queueName);
      logger.info(`工作线程已移除: ${queueName}`);
    }
  }

  /**
   */
  private async startMonitoring(): Promise<void> {
    // 定期收集指标
    setInterval(async () => {
      try {
        const status = await this.getAllQueueStatus();
        
        // 记录到监控系统
        for (const [name, stats] of Object.entries(status)) {
          metrics.gauge(`queue.${name}.waiting`, stats.waiting);
          metrics.gauge(`queue.${name}.active`, stats.active);
          metrics.gauge(`queue.${name}.delayed`, stats.delayed);
          metrics.gauge(`queue.${name}.failed`, stats.failed);
        }
      } catch (error) {
        logger.error('队列监控收集失败:', error);
      }
    }, 30000); // 每30秒收集一次
  }

  /**
   */
  private sanitizeJobData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'auth'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field] !== undefined) {
        sanitized[field] = '***REDACTED***';
      }
    }
    
    return sanitized;
  }

  /**
   */
  async shutdown(): Promise<void> {
    logger.info('开始关闭消息队列服务...');
    
    // 关闭工作线程
    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.info(`工作线程已关闭: ${name}`);
    }
    
    // 关闭队列事件监听
    for (const [name, events] of this.events) {
      await events.close();
      logger.info(`队列事件监听已关闭: ${name}`);
    }
    
    // 关闭队列
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`队列已关闭: ${name}`);
    }
    
    // 关闭Redis连接
    if (this.redisAvailable) {
      await this.connection.quit();
      await this.redis.quit();
    }
    this.initialized = false;
    
    logger.info('消息队列服务已完全关闭');
  }
}

// 单例模式导出
export const coreQueueService = new CoreQueueService();
