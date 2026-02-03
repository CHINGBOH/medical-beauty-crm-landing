import { Job } from 'bullmq';
import { coreQueueService, JobPriority } from '../../core/queue/core-queue.service';
import { AIService } from '../ai.service';
import { ImageService } from '../image.service';
import { WechatService } from '../wechat.service';
import { TriggerService } from '../trigger.service';
import { DatabaseService } from '../database.service';
import { logger } from '../../utils/logger';

export class BusinessQueueService {
  private aiService: AIService;
  private imageService: ImageService;
  private wechatService: WechatService;
  private triggerService: TriggerService;
  private databaseService: DatabaseService;

  constructor() {
    this.aiService = new AIService();
    this.imageService = new ImageService();
    this.wechatService = new WechatService();
    this.triggerService = new TriggerService();
    this.databaseService = new DatabaseService();
  }

  /**
   */
  async initialize(): Promise<void> {
    // 1. AI内容生成队列
    await coreQueueService.registerWorker(
      'ai-content-generation',
      this.handleAIContentGeneration.bind(this)
    );

    // 2. AI图片生成队列
    await coreQueueService.registerWorker(
      'ai-image-generation',
      this.handleAIImageGeneration.bind(this)
    );

    // 3. 数据同步队列
    await coreQueueService.registerWorker(
      'data-sync',
      this.handleDataSync.bind(this)
    );

    // 4. 触发器执行队列
    await coreQueueService.registerWorker(
      'trigger-execution',
      this.handleTriggerExecution.bind(this)
    );

    // 5. 微信通知队列
    await coreQueueService.registerWorker(
      'wechat-notification',
      this.handleWechatNotification.bind(this)
    );

    logger.info('业务队列处理器初始化完成');
  }

  /**
   */
  private async handleAIContentGeneration(job: Job): Promise<any> {
    const { 
      type,           // 'content' | 'response' | 'analysis'
      projectType,    // 项目类型
      contentType,    // 内容类型
      tone,           // 语气
      prompt,         // 自定义提示词
      context,        // 上下文
      callback        // 回调信息
    } = job.data;

    // 报告进度
    await job.updateProgress(10);

    let result: any;
    
    switch (type) {
      case 'content':
        // 生成小红书内容
        result = await this.aiService.generateXiaohongshuContent({
          projectType,
          contentType,
          tone,
          keywords: context?.keywords
        });
        await job.updateProgress(50);
        break;
        
      case 'response':
        // 生成AI回复
        result = await this.aiService.chatWithCustomer(
          context.messages,
          context.knowledgeBase
        );
        await job.updateProgress(60);
        break;
        
      case 'analysis':
        // 心理分析
        result = await this.aiService.analyzePsychologicalType(
          context.conversation
        );
        await job.updateProgress(70);
        
        // 更新数据库
        if (result.psychologicalType && context.customerId) {
          await this.databaseService.updateCustomerPsychologicalType(
            context.customerId,
            result.psychologicalType,
            result.confidence
          );
        }
        break;
        
      default:
        throw new Error(`未知的AI任务类型: ${type}`);
    }

    await job.updateProgress(90);

    // 如果有回调，异步执行回调
    if (callback?.url) {
      this.executeCallback(callback.url, {
        jobId: job.id,
        status: 'completed',
        result,
        timestamp: new Date().toISOString()
      }).catch(error => {
        logger.error('回调执行失败:', error);
      });
    }

    await job.updateProgress(100);
    return result;
  }

  /**
   */
  private async handleAIImageGeneration(job: Job): Promise<any> {
    const {
      prompt,
      style = 'elegant',
      count = 3,
      size = 'square',
      projectType,
      callback
    } = job.data;

    // 报告进度
    await job.updateProgress(5);

    try {
      // 生成图片
      const images: string[] = [];
      for (let i = 0; i < count; i++) {
        const imageUrl = await this.imageService.generateImage({
          prompt: `${prompt} - 配图${i + 1}`,
          style,
          size
        });
        images.push(imageUrl);
        
        // 更新进度
        const progress = 5 + Math.floor((i + 1) / count * 90);
        await job.updateProgress(progress);
      }

      // 记录到数据库
      if (projectType) {
        await this.databaseService.recordImageGeneration({
          jobId: job.id!,
          projectType,
          imageCount: images.length,
          style
        });
      }

      // 回调
      if (callback?.url) {
        this.executeCallback(callback.url, {
          jobId: job.id,
          status: 'completed',
          images,
          timestamp: new Date().toISOString()
        });
      }

      await job.updateProgress(100);
      return { images, count: images.length };
    } catch (error) {
      // 生成失败时使用占位图
      logger.error('图片生成失败，使用占位图:', error);
      
      const placeholderImages = Array(count).fill(
        `https://via.placeholder.com/800x800/B8A68D/FFFFFF?text=${encodeURIComponent(projectType || '医美配图')}`
      );

      await job.updateProgress(100);
      return { images: placeholderImages, count, fallback: true };
    }
  }

  /**
   */
  private async handleDataSync(job: Job): Promise<any> {
    const {
      type,           // 'airtable_sync' | 'wechat_sync' | 'customer_sync'
      direction,      // 'push' | 'pull' | 'bidirectional'
      data,
      filters,
      callback
    } = job.data;

    // 报告进度
    await job.updateProgress(10);

    let result: any;
    let syncedCount = 0;

    switch (type) {
      case 'airtable_sync':
        if (direction === 'push') {
          // 推送到Airtable
          syncedCount = await this.databaseService.syncToAirtable(data);
        } else if (direction === 'pull') {
          // 从Airtable拉取
          syncedCount = await this.databaseService.syncFromAirtable(filters);
        }
        break;
        
      case 'wechat_sync':
        // 同步企业微信客户
        syncedCount = await this.wechatService.syncCustomersToDatabase();
        break;
        
      case 'customer_sync':
        // 客户数据同步
        syncedCount = await this.databaseService.syncCustomerData(data);
        break;
        
      default:
        throw new Error(`未知的数据同步类型: ${type}`);
    }

    await job.updateProgress(90);

    result = { 
      syncedCount,
      timestamp: new Date().toISOString()
    };

    // 回调
    if (callback?.url) {
      this.executeCallback(callback.url, {
        jobId: job.id,
        status: 'completed',
        result,
        timestamp: new Date().toISOString()
      });
    }

    await job.updateProgress(100);
    return result;
  }

  /**
   */
  private async handleTriggerExecution(job: Job): Promise<any> {
    const {
      triggerId,
      customerIds,
      context,
      immediate = false,
      callback
    } = job.data;

    // 报告进度
    await job.updateProgress(5);

    // 获取触发器配置
    const trigger = await this.triggerService.getTrigger(triggerId);
    if (!trigger) {
      throw new Error(`触发器不存在: ${triggerId}`);
    }

    // 获取目标客户
    const customers = await this.databaseService.getCustomersByIds(customerIds);
    await job.updateProgress(20);

    const results = [];
    const totalCustomers = customers.length;

    // 批量执行触发器
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      
      try {
        const triggerResult = await this.triggerService.executeTrigger(
          trigger,
          customer,
          context
        );
        
        results.push({
          customerId: customer.id,
          success: true,
          result: triggerResult,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        results.push({
          customerId: customer.id,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }

      // 更新进度
      const progress = 20 + Math.floor((i + 1) / totalCustomers * 75);
      await job.updateProgress(progress);
    }

    // 记录执行日志
    await this.triggerService.logTriggerExecution(
      triggerId,
      results,
      immediate
    );

    await job.updateProgress(98);

    const result = {
      triggerId,
      total: totalCustomers,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      timestamp: new Date().toISOString()
    };

    // 回调
    if (callback?.url) {
      this.executeCallback(callback.url, {
        jobId: job.id,
        status: 'completed',
        result,
        timestamp: new Date().toISOString()
      });
    }

    await job.updateProgress(100);
    return result;
  }

  /**
   */
  private async handleWechatNotification(job: Job): Promise<any> {
    const {
      type,           // 'message' | 'template' | 'broadcast'
      target,         // 目标客户
      content,        // 内容
      templateId,     // 模板ID
      schedule,       // 发送时间
      callback
    } = job.data;

    // 延迟发送
    if (schedule && new Date(schedule) > new Date()) {
      const delay = new Date(schedule).getTime() - Date.now();
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    await job.updateProgress(10);

    let result: any;
    let successCount = 0;
    let failCount = 0;

    switch (type) {
      case 'message':
        // 发送单条消息
        for (const userId of target) {
          try {
            await this.wechatService.sendMessageToCustomer(userId, content);
            successCount++;
          } catch (error) {
            failCount++;
            logger.error(`微信消息发送失败: ${userId}`, error);
          }
        }
        break;
        
      case 'template':
        // 发送模板消息
        for (const userId of target) {
          try {
            await this.wechatService.sendTemplateMessage(
              userId,
              templateId!,
              content
            );
            successCount++;
          } catch (error) {
            failCount++;
            logger.error(`微信模板消息发送失败: ${userId}`, error);
          }
        }
        break;
        
      case 'broadcast':
        // 群发消息
        const broadcastResult = await this.wechatService.broadcastMessage(
          target,
          content
        );
        successCount = broadcastResult.success;
        failCount = broadcastResult.fail;
        break;
        
      default:
        throw new Error(`未知的微信通知类型: ${type}`);
    }

    await job.updateProgress(90);

    result = {
      type,
      total: target.length,
      success: successCount,
      failed: failCount,
      timestamp: new Date().toISOString()
    };

    // 回调
    if (callback?.url) {
      this.executeCallback(callback.url, {
        jobId: job.id,
        status: 'completed',
        result,
        timestamp: new Date().toISOString()
      });
    }

    await job.updateProgress(100);
    return result;
  }

  /**
   */
  private async executeCallback(url: string, data: any): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Callback-Signature': this.generateCallbackSignature(data)
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`回调请求失败: ${response.status}`);
      }

      logger.debug(`回调执行成功: ${url}`);
    } catch (error) {
      logger.error('回调执行失败:', error);
      
      // 记录失败的回调，后续可以重试
      await this.databaseService.recordFailedCallback({
        url,
        data,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   */
  private generateCallbackSignature(data: any): string {
    const secret = process.env.CALLBACK_SECRET || 'default-secret';
    const payload = JSON.stringify(data);
    return require('crypto')
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   */
  async generateContentAsync(params: {
    projectType: string;
    contentType: string;
    tone: string;
    keywords?: string[];
    callbackUrl?: string;
    priority?: JobPriority;
  }): Promise<{ jobId: string; statusUrl: string }> {
    const job = await coreQueueService.enqueue(
      'ai-content-generation',
      'generate_content',
      {
        type: 'content',
        projectType: params.projectType,
        contentType: params.contentType,
        tone: params.tone,
        context: {
          keywords: params.keywords
        },
        callback: params.callbackUrl ? {
          url: params.callbackUrl,
          method: 'POST'
        } : undefined
      },
      {
        priority: params.priority || JobPriority.NORMAL
      }
    );

    return {
      jobId: job.id!,
      statusUrl: `/api/queue/jobs/${job.id}/status`
    };
  }

  /**
   */
  async bulkSyncCustomers(customerIds: string[]): Promise<{ jobId: string }> {
    const chunks = this.chunkArray(customerIds, 100); // 每批100个
    
    const jobs = await coreQueueService.bulkEnqueue(
      'data-sync',
      chunks.map((chunk, index) => ({
        name: 'sync_customer_batch',
        data: {
          type: 'customer_sync',
          data: chunk,
          batch: index + 1,
          total: chunks.length
        },
        options: {
          priority: JobPriority.LOW
        }
      }))
    );

    return {
      jobId: jobs[0].id! // 返回第一个任务的ID用于跟踪
    };
  }

  /**
   */
  async sendUrgentNotification(params: {
    customerIds: string[];
    message: string;
  }): Promise<{ jobId: string }> {
    const job = await coreQueueService.enqueue(
      'wechat-notification',
      'urgent_notification',
      {
        type: 'message',
        target: params.customerIds,
        content: params.message,
        immediate: true
      },
      {
        priority: JobPriority.CRITICAL,
        attempts: 5,  // 紧急通知需要多次重试
        removeOnFail: false  // 保留失败记录
      }
    );

    return { jobId: job.id! };
  }

  /**
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// 单例模式导出
export const businessQueueService = new BusinessQueueService();
