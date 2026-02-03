import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';
import { AIService } from './ai.service';

export class QueueService {
  private connection: IORedis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor() {
    this.connection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null
    });
  }

  // 初始化队列
  async initialize() {
    const queueConfigs = [
      { name: 'ai-generation', concurrency: 3 },
      { name: 'image-generation', concurrency: 2 },
      { name: 'wechat-sync', concurrency: 1 },
      { name: 'trigger-execution', concurrency: 5 },
      { name: 'data-pipeline', concurrency: 10 }
    ];

    for (const config of queueConfigs) {
      await this.createQueue(config.name, config.concurrency);
    }

    logger.info('消息队列初始化完成');
  }

  private async createQueue(name: string, concurrency: number) {
    // 创建队列
    const queue = new Queue(name, { connection: this.connection });
    this.queues.set(name, queue);

    // 创建工作线程
    const worker = new Worker(name, async (job: Job) => {
      return await this.processJob(name, job);
    }, { 
      connection: this.connection,
      concurrency,
      limiter: {
        max: 100,
        duration: 1000
      }
    });

    worker.on('completed', (job) => {
      logger.debug(`任务完成: ${job.name} ${job.id}`);
    });

    worker.on('failed', (job, error) => {
      logger.error(`任务失败: ${job?.name} ${job?.id}`, error);
    });

    this.workers.set(name, worker);
  }

  private async processJob(queueName: string, job: Job) {
    switch (queueName) {
      case 'ai-generation':
        return await this.processAIGeneration(job);
      case 'image-generation':
        return await this.processImageGeneration(job);
      case 'wechat-sync':
        return await this.processWechatSync(job);
      case 'trigger-execution':
        return await this.processTriggerExecution(job);
      case 'data-pipeline':
        return await this.processDataPipeline(job);
      default:
        throw new Error(`未知队列: ${queueName}`);
    }
  }

  // 异步处理AI生成
  async enqueueAIGeneration(task: {
    type: 'content' | 'analysis' | 'response';
    data: any;
    priority?: number;
  }) {
    const queue = this.queues.get('ai-generation');
    if (!queue) throw new Error('AI生成队列未初始化');
    
    return await queue.add(task.type, task.data, {
      priority: task.priority || 1,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 100, // 保留最近100个完成的任务
      removeOnFail: 1000
    });
  }

  // 异步处理图片生成
  async enqueueImageGeneration(task: {
    prompt: string;
    style: string;
    count: number;
    callbackUrl?: string;
  }) {
    const queue = this.queues.get('image-generation');
    if (!queue) throw new Error('图片生成队列未初始化');
    
    return await queue.add('generate-images', task, {
      attempts: 2,
      timeout: 30000 // 30秒超时
    });
  }

  // 处理AI生成任务
  private async processAIGeneration(job: Job) {
    const { type, data } = job.data;
    const aiService = new AIService();
    
    switch (type) {
      case 'content':
        return await aiService.generateXiaohongshuContent(data);
      case 'analysis':
        return await aiService.analyzePsychologicalType(data.conversation);
      case 'response':
        return await aiService.chatWithCustomer(data.messages, data.knowledgeBase);
      default:
        throw new Error(`未知的AI任务类型: ${type}`);
    }
  }

  // 其他处理方法...
}
