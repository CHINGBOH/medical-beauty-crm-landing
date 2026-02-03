import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'events';
import { coreQueueService } from '../../core/queue/core-queue.service';
import { logger } from '../../utils/logger';

interface ClientInfo {
  ws: WebSocket;
  id: string;
  subscriptions: Set<string>;
  connectedAt: Date;
  lastActivity: Date;
}

export class QueueStatusWebSocketService extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Map<string, ClientInfo> = new Map();
  private broadcastInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30秒心跳

  constructor(server: Server) {
    super();
    
    // 创建WebSocket服务器
    this.wss = new WebSocketServer({
      server,
      path: '/ws/queue-status',
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
      }
    });

    this.setupWebSocketServer();
    this.startBroadcasting();
  }

  /**
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId(req);
      const clientInfo: ClientInfo = {
        ws,
        id: clientId,
        subscriptions: new Set(),
        connectedAt: new Date(),
        lastActivity: new Date()
      };

      this.clients.set(clientId, clientInfo);
      logger.info(`WebSocket客户端连接: ${clientId}`);

      // 发送欢迎消息
      this.sendToClient(clientId, {
        type: 'welcome',
        data: {
          clientId,
          timestamp: new Date().toISOString(),
          availableQueues: Object.keys(coreQueueService.getQueueConfigs())
        }
      });

      // 消息处理
      ws.on('message', (data: Buffer) => {
        this.handleMessage(clientId, data);
        clientInfo.lastActivity = new Date();
      });

      // 错误处理
      ws.on('error', (error) => {
        logger.error(`WebSocket错误 ${clientId}:`, error);
      });

      // 连接关闭
      ws.on('close', (code, reason) => {
        this.handleDisconnect(clientId, code, reason.toString());
      });

      // 心跳
      this.setupHeartbeat(clientId);
    });

    // 服务器错误处理
    this.wss.on('error', (error) => {
      logger.error('WebSocket服务器错误:', error);
    });
  }

  /**
   */
  private handleMessage(clientId: string, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message.data);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message.data);
          break;
          
        case 'get_status':
          this.handleGetStatus(clientId, message.data);
          break;
          
        case 'ping':
          this.handlePing(clientId);
          break;
          
        default:
          logger.warn(`未知的WebSocket消息类型: ${message.type}`);
      }
    } catch (error) {
      logger.error('WebSocket消息处理失败:', error);
      this.sendToClient(clientId, {
        type: 'error',
        data: {
          message: '消息格式错误',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   */
  private handleSubscribe(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { queueNames } = data;
    if (!Array.isArray(queueNames)) {
      this.sendToClient(clientId, {
        type: 'error',
        data: {
          message: 'queueNames必须是数组',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    for (const queueName of queueNames) {
      client.subscriptions.add(queueName);
    }

    logger.debug(`客户端 ${clientId} 订阅了队列: ${queueNames.join(', ')}`);
    
    this.sendToClient(clientId, {
      type: 'subscribed',
      data: {
        queueNames,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   */
  private handleUnsubscribe(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { queueNames } = data;
    if (!Array.isArray(queueNames)) {
      this.sendToClient(clientId, {
        type: 'error',
        data: {
          message: 'queueNames必须是数组',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    for (const queueName of queueNames) {
      client.subscriptions.delete(queueName);
    }

    logger.debug(`客户端 ${clientId} 取消订阅了队列: ${queueNames.join(', ')}`);
    
    this.sendToClient(clientId, {
      type: 'unsubscribed',
      data: {
        queueNames,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   */
  private async handleGetStatus(clientId: string, data: any): Promise<void> {
    const { queueName } = data;
    
    try {
      let status;
      if (queueName) {
        status = await coreQueueService.getQueueStatus(queueName);
      } else {
        status = await coreQueueService.getAllQueueStatus();
      }

      this.sendToClient(clientId, {
        type: 'status',
        data: {
          queueName,
          status,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'error',
        data: {
          message: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   */
  private handlePing(clientId: string): void {
    this.sendToClient(clientId, {
      type: 'pong',
      data: {
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   */
  private handleDisconnect(clientId: string, code: number, reason: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.info(`WebSocket客户端断开连接: ${clientId}`, {
        code,
        reason,
        duration: Date.now() - client.connectedAt.getTime()
      });
      
      this.emit('client_disconnected', clientId);
    }
  }

  /**
   */
  private setupHeartbeat(clientId: string): void {
    const interval = setInterval(() => {
      const client = this.clients.get(clientId);
      if (!client) {
        clearInterval(interval);
        return;
      }

      const inactiveTime = Date.now() - client.lastActivity.getTime();
      if (inactiveTime > this.HEARTBEAT_INTERVAL * 2) {
        // 客户端不活跃，断开连接
        client.ws.close(1000, '心跳超时');
        clearInterval(interval);
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   */
  private startBroadcasting(): void {
    this.broadcastInterval = setInterval(async () => {
      try {
        const status = await coreQueueService.getAllQueueStatus();
        
        // 广播给所有订阅了相关队列的客户端
        for (const [clientId, client] of this.clients) {
          if (client.subscriptions.size === 0) continue;
          
          const filteredStatus: any = {};
          for (const queueName of client.subscriptions) {
            if (status[queueName]) {
              filteredStatus[queueName] = status[queueName];
            }
          }
          
          if (Object.keys(filteredStatus).length > 0) {
            this.sendToClient(clientId, {
              type: 'queue_status',
              data: {
                status: filteredStatus,
                timestamp: new Date().toISOString()
              }
            });
          }
        }
      } catch (error) {
        logger.error('广播队列状态失败:', error);
      }
    }, 5000); // 每5秒广播一次
  }

  /**
   */
  async broadcastJobUpdate(queueName: string, jobId: string, update: any): Promise<void> {
    const message = {
      type: 'job_update',
      data: {
        queueName,
        jobId,
        update,
        timestamp: new Date().toISOString()
      }
    };

    // 发送给所有订阅了该队列的客户端
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(queueName)) {
        this.sendToClient(clientId, message);
      }
    }
  }

  /**
   */
  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error(`发送消息给客户端失败 ${clientId}:`, error);
    }
  }

  /**
   */
  private generateClientId(req: any): string {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const random = Math.random().toString(36).substr(2, 9);
    
    return require('crypto')
      .createHash('md5')
      .update(`${ip}-${userAgent}-${random}`)
      .digest('hex')
      .substr(0, 12);
  }

  /**
   */
  getClientStats() {
    return {
      totalClients: this.clients.size,
      clients: Array.from(this.clients.values()).map(client => ({
        id: client.id,
        subscriptions: Array.from(client.subscriptions),
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity
      }))
    };
  }

  /**
   */
  shutdown(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    // 关闭所有客户端连接
    for (const [clientId, client] of this.clients) {
      client.ws.close(1000, '服务器关闭');
    }
    this.clients.clear();

    // 关闭WebSocket服务器
    this.wss.close();
    
    logger.info('WebSocket服务已关闭');
  }
}
