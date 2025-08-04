import { BaseMonitor } from '@pixiu/shared-core';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';
import { WebSocketMessage } from './websocket-server';

export interface MessageHandlerConfig {
  enableRateLimit: boolean;
  maxMessagesPerMinute: number;
  enableMessageValidation: boolean;
  logAllMessages: boolean;
}

export interface ClientSession {
  id: string;
  messageCount: number;
  lastMessageTime: number;
  subscriptions: Set<string>;
  metadata: Record<string, any>;
}

/**
 * WebSocket 消息处理器
 * 负责处理客户端消息的路由和处理逻辑
 */
export class WebSocketMessageHandler {
  private sessions = new Map<string, ClientSession>();
  private messageHandlers = new Map<string, (session: ClientSession, payload: any) => Promise<any>>();

  constructor(
    private config: MessageHandlerConfig,
    private monitor: BaseMonitor,
    private adapterRegistry: AdapterRegistry
  ) {
    this.setupMessageHandlers();
  }

  /**
   * 设置消息处理器
   */
  private setupMessageHandlers(): void {
    // 注册各种消息类型的处理器
    this.messageHandlers.set('ping', this.handlePing.bind(this));
    this.messageHandlers.set('subscribe', this.handleSubscribe.bind(this));
    this.messageHandlers.set('unsubscribe', this.handleUnsubscribe.bind(this));
    this.messageHandlers.set('getSubscriptions', this.handleGetSubscriptions.bind(this));
    this.messageHandlers.set('getAdapterStatus', this.handleGetAdapterStatus.bind(this));
    this.messageHandlers.set('getSystemStats', this.handleGetSystemStats.bind(this));
    this.messageHandlers.set('requestSnapshot', this.handleRequestSnapshot.bind(this));
  }

  /**
   * 创建或获取客户端会话
   */
  getOrCreateSession(connectionId: string): ClientSession {
    let session = this.sessions.get(connectionId);
    if (!session) {
      session = {
        id: connectionId,
        messageCount: 0,
        lastMessageTime: Date.now(),
        subscriptions: new Set(),
        metadata: {}
      };
      this.sessions.set(connectionId, session);
    }
    return session;
  }

  /**
   * 移除客户端会话
   */
  removeSession(connectionId: string): void {
    this.sessions.delete(connectionId);
  }

  /**
   * 处理客户端消息
   */
  async handleMessage(connectionId: string, message: WebSocketMessage): Promise<WebSocketMessage | null> {
    try {
      const session = this.getOrCreateSession(connectionId);
      
      // 速率限制检查
      if (!this.checkRateLimit(session)) {
        return {
          type: 'error',
          payload: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many messages. Please slow down.'
          }
        };
      }

      // 消息验证
      if (this.config.enableMessageValidation && !this.validateMessage(message)) {
        return {
          type: 'error',
          payload: {
            code: 'INVALID_MESSAGE',
            message: 'Invalid message format'
          }
        };
      }

      // 更新会话统计
      session.messageCount++;
      session.lastMessageTime = Date.now();

      // 日志记录
      if (this.config.logAllMessages) {
        this.monitor.log('debug', 'Processing WebSocket message', {
          connectionId,
          messageType: message.type,
          messageCount: session.messageCount
        });
      }

      // 路由到具体的处理器
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        const result = await handler(session, message.payload);
        return result;
      } else {
        return {
          type: 'error',
          payload: {
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: `Unknown message type: ${message.type}`
          }
        };
      }
    } catch (error) {
      this.monitor.log('error', 'Error handling WebSocket message', {
        connectionId,
        messageType: message.type,
        error
      });

      return {
        type: 'error',
        payload: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      };
    }
  }

  /**
   * Ping 消息处理器
   */
  private async handlePing(session: ClientSession, _payload: any): Promise<WebSocketMessage> {
    return {
      type: 'pong',
      payload: {
        timestamp: Date.now(),
        sessionId: session.id
      }
    };
  }

  /**
   * 订阅消息处理器
   */
  private async handleSubscribe(session: ClientSession, payload: any): Promise<WebSocketMessage> {
    try {
      const { channels } = payload;
      
      if (!Array.isArray(channels)) {
        throw new Error('Channels must be an array');
      }

      const results: Array<{ channel: string; success: boolean; error?: string }> = [];

      for (const channel of channels) {
        try {
          if (typeof channel === 'string') {
            session.subscriptions.add(channel);
            results.push({ channel, success: true });
            
            this.monitor.log('debug', 'Client subscribed to channel', {
              sessionId: session.id,
              channel,
              totalSubscriptions: session.subscriptions.size
            });
          } else {
            results.push({ 
              channel: String(channel), 
              success: false, 
              error: 'Invalid channel format' 
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          results.push({ 
            channel: String(channel), 
            success: false, 
            error: message 
          });
        }
      }

      return {
        type: 'subscribed',
        payload: {
          results,
          totalSubscriptions: session.subscriptions.size
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Subscription failed: ${message}`);
    }
  }

  /**
   * 取消订阅消息处理器
   */
  private async handleUnsubscribe(session: ClientSession, payload: any): Promise<WebSocketMessage> {
    try {
      const { channels } = payload;
      
      if (!Array.isArray(channels)) {
        throw new Error('Channels must be an array');
      }

      const results: Array<{ channel: string; success: boolean }> = [];

      for (const channel of channels) {
        if (typeof channel === 'string') {
          const wasSubscribed = session.subscriptions.has(channel);
          session.subscriptions.delete(channel);
          results.push({ channel, success: wasSubscribed });
          
          if (wasSubscribed) {
            this.monitor.log('debug', 'Client unsubscribed from channel', {
              sessionId: session.id,
              channel,
              totalSubscriptions: session.subscriptions.size
            });
          }
        } else {
          results.push({ channel: String(channel), success: false });
        }
      }

      return {
        type: 'unsubscribed',
        payload: {
          results,
          totalSubscriptions: session.subscriptions.size
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Unsubscription failed: ${message}`);
    }
  }

  /**
   * 获取订阅列表处理器
   */
  private async handleGetSubscriptions(session: ClientSession, _payload: any): Promise<WebSocketMessage> {
    return {
      type: 'subscriptions',
      payload: {
        subscriptions: Array.from(session.subscriptions),
        count: session.subscriptions.size
      }
    };
  }

  /**
   * 获取适配器状态处理器
   */
  private async handleGetAdapterStatus(_session: ClientSession, _payload: any): Promise<WebSocketMessage> {
    try {
      const adapters = this.adapterRegistry.getAllInstances();
      const status = Array.from(adapters.entries()).map(([name, adapter]) => ({
        name,
        status: adapter.getAdapterStatus(),
        metrics: adapter.getMetrics(),
        healthy: adapter.isHealthy()
      }));

      return {
        type: 'adapterStatus',
        payload: {
          adapters: status,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get adapter status: ${message}`);
    }
  }

  /**
   * 获取系统统计处理器
   */
  private async handleGetSystemStats(_session: ClientSession, _payload: any): Promise<WebSocketMessage> {
    try {
      // 获取适配器统计
      const adapters = this.adapterRegistry.getAllInstances();
      const adapterStats = Array.from(adapters.entries()).map(([name, adapter]) => ({
        name,
        metrics: adapter.getMetrics()
      }));

      // 获取系统统计
      const systemStats = {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: process.cpuUsage(),
        timestamp: Date.now()
      };

      // 获取会话统计
      const sessionStats = {
        totalSessions: this.sessions.size,
        activeSessions: Array.from(this.sessions.values()).filter(
          s => Date.now() - s.lastMessageTime < 60000
        ).length,
        totalSubscriptions: Array.from(this.sessions.values()).reduce(
          (sum, s) => sum + s.subscriptions.size, 0
        )
      };

      return {
        type: 'systemStats',
        payload: {
          adapters: adapterStats,
          system: systemStats,
          sessions: sessionStats,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get system stats: ${message}`);
    }
  }

  /**
   * 请求快照数据处理器
   */
  private async handleRequestSnapshot(_session: ClientSession, payload: any): Promise<WebSocketMessage> {
    try {
      const { exchange, symbols } = payload;
      
      if (!exchange || !Array.isArray(symbols)) {
        throw new Error('Invalid snapshot request parameters');
      }

      const adapter = this.adapterRegistry.getInstance(exchange);
      if (!adapter) {
        throw new Error(`Adapter not found: ${exchange}`);
      }

      // 获取快照数据（这里需要适配器支持快照功能）
      const snapshot = {
        exchange,
        symbols,
        data: [], // 实际实现中需要从适配器获取数据
        timestamp: Date.now()
      };

      return {
        type: 'snapshot',
        payload: snapshot
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get snapshot: ${message}`);
    }
  }

  /**
   * 速率限制检查
   */
  private checkRateLimit(session: ClientSession): boolean {
    if (!this.config.enableRateLimit) {
      return true;
    }

    const now = Date.now();
    const timeWindow = 60000; // 1分钟
    const messagesInWindow = session.messageCount;

    // 重置计数器（简单实现，实际应该使用滑动窗口）
    if (now - session.lastMessageTime > timeWindow) {
      session.messageCount = 0;
    }

    return messagesInWindow < this.config.maxMessagesPerMinute;
  }

  /**
   * 消息验证
   */
  private validateMessage(message: WebSocketMessage): boolean {
    if (!message || typeof message !== 'object') {
      return false;
    }

    if (!message.type || typeof message.type !== 'string') {
      return false;
    }

    // 可以添加更多验证逻辑
    return true;
  }

  /**
   * 获取会话统计
   */
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
    totalSubscriptions: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const now = Date.now();
    const activeThreshold = 300000; // 5分钟

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => now - s.lastMessageTime < activeThreshold).length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
      totalSubscriptions: sessions.reduce((sum, s) => sum + s.subscriptions.size, 0)
    };
  }

  /**
   * 根据订阅查找会话
   */
  getSessionsBySubscription(channel: string): ClientSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.subscriptions.has(channel)
    );
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(maxIdleTime: number = 3600000): number {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastMessageTime > maxIdleTime) {
        expiredSessions.push(id);
      }
    }

    for (const id of expiredSessions) {
      this.sessions.delete(id);
    }

    if (expiredSessions.length > 0) {
      this.monitor.log('debug', 'Cleaned up expired sessions', {
        cleanedCount: expiredSessions.length,
        remainingCount: this.sessions.size
      });
    }

    return expiredSessions.length;
  }

  /**
   * 关闭消息处理器
   */
  close(): void {
    this.sessions.clear();
    this.messageHandlers.clear();
    this.monitor.log('info', 'WebSocket message handler closed');
  }
}