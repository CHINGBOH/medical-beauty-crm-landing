export class AsyncController {
  private queueService: QueueService;

  constructor() {
    this.queueService = new QueueService();
  }

  // 异步生成内容API
  async generateContentAsync(req: Request, res: Response) {
    try {
      const { projectType, contentType, tone, callbackUrl } = req.body;
      
      // 立即返回任务ID
      const job = await this.queueService.enqueueAIGeneration({
        type: 'content',
        data: { projectType, contentType, tone },
        priority: contentType === 'festival' ? 2 : 1 // 节日内容优先级更高
      });
      
      // 如果提供了回调URL，设置回调
      if (callbackUrl) {
        this.setupJobCallback(job, callbackUrl);
      }
      
      res.json({
        success: true,
        jobId: job.id,
        status: 'queued',
        estimatedTime: '30秒',
        checkUrl: `/api/jobs/${job.id}/status`
      });
    } catch (error) {
      res.status(500).json({ error: '任务提交失败' });
    }
  }

  // 检查任务状态
  async checkJobStatus(req: Request, res: Response) {
    const { jobId } = req.params;
    const queueName = req.query.queue as string;
    
    const queue = this.queueService.getQueue(queueName);
    const job = await queue.getJob(jobId);
    
    if (!job) {
      return res.json({ status: 'not_found' });
    }
    
    const state = await job.getState();
    const result = {
      jobId,
      status: state,
      progress: job.progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      timestamp: job.timestamp
    };
    
    // 如果是webhook请求，返回更详细的信息
    if (req.headers['x-webhook'] === 'true') {
      result.result = await job.finished(); // 等待任务完成
    }
    
    res.json(result);
  }

  private async setupJobCallback(job: Job, callbackUrl: string) {
    // 监听任务完成事件
    job.waitUntilFinished(this.queueService.getQueue('ai-generation')).then(async (result) => {
      try {
        await axios.post(callbackUrl, {
          jobId: job.id,
          status: 'completed',
          result,
          completedAt: new Date().toISOString()
        });
      } catch (error) {
        logger.error('回调通知失败:', error);
      }
    }).catch(async (error) => {
      try {
        await axios.post(callbackUrl, {
          jobId: job.id,
          status: 'failed',
          error: error.message,
          failedAt: new Date().toISOString()
        });
      } catch (err) {
        logger.error('失败回调通知失败:', err);
      }
    });
  }
}


