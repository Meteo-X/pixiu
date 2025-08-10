/**
 * 交易适配器基础实现类
 */

import { EventEmitter } from 'events';
import { BaseErrorHandler, ErrorCategory, ErrorSeverity, RecoveryStrategy } from '@pixiu/shared-core';
import {
  ExchangeAdapter,
  AdapterConfig,
  AdapterStatus,
  AdapterMetrics,
  SubscriptionConfig,
  SubscriptionInfo,
  MarketData,
  DataType,
  AdapterEventMap
} from '../interfaces/adapter';
import { ConnectionManager } from '../interfaces/connection';

export abstract class BaseAdapter extends EventEmitter implements ExchangeAdapter {
  public abstract readonly exchange: string;
  
  protected config!: AdapterConfig;
  protected status: AdapterStatus = AdapterStatus.DISCONNECTED;
  protected connectionManager?: ConnectionManager;
  protected errorHandler!: BaseErrorHandler;
  protected subscriptions = new Map<string, SubscriptionInfo>();
  protected metrics!: AdapterMetrics;
  
  private reconnectAttempts = 0;
  private heartbeatTimer?: NodeJS.Timeout;
  private lastHeartbeat = 0;

  constructor() {
    super();
    this.initializeErrorHandler();
    this.initializeMetrics();
  }

  /**
   * 获取当前状态
   */
  getStatus(): AdapterStatus {
    return this.status;
  }

  /**
   * 获取配置
   */
  getConfig(): AdapterConfig {
    return { ...this.config };
  }

  /**
   * 获取指标
   */
  getMetrics(): AdapterMetrics {
    return {
      ...this.metrics,
      averageLatency: this.calculateAverageLatency()
    };
  }

  /**
   * 初始化适配器
   */
  async initialize(config: AdapterConfig): Promise<void> {
    this.config = config;
    this.validateConfig();
    
    // 初始化连接管理器
    this.connectionManager = await this.createConnectionManager();
    this.setupConnectionEventHandlers();
    
    this.emit('initialized');
  }

  /**
   * 连接到交易所
   */
  async connect(): Promise<void> {
    if (this.status === AdapterStatus.CONNECTED) {
      return;
    }

    try {
      this.setStatus(AdapterStatus.CONNECTING);
      
      if (!this.connectionManager) {
        throw new Error('Connection manager not initialized');
      }

      await this.connectionManager.connect({
        url: this.config.endpoints.ws,
        timeout: this.config.connection.timeout,
        maxRetries: this.config.connection.maxRetries,
        retryInterval: this.config.connection.retryInterval,
        heartbeatInterval: this.config.connection.heartbeatInterval,
        heartbeatTimeout: this.config.connection.timeout
      });

      this.setStatus(AdapterStatus.CONNECTED);
      this.metrics.connectedAt = Date.now();
      this.reconnectAttempts = 0;
      
      // 启动心跳
      this.startHeartbeat();
      
      this.emit('connected');
    } catch (error) {
      this.setStatus(AdapterStatus.ERROR);
      await this.handleError(error as Error, 'connect');
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.status === AdapterStatus.DISCONNECTED) {
      return;
    }

    try {
      this.setStatus(AdapterStatus.DISCONNECTED);
      
      // 停止心跳
      this.stopHeartbeat();
      
      // 清理订阅
      await this.unsubscribeAll();
      
      // 断开连接
      if (this.connectionManager) {
        await this.connectionManager.disconnect();
      }
      
      this.emit('disconnected');
    } catch (error) {
      await this.handleError(error as Error, 'disconnect');
      throw error;
    }
  }

  /**
   * 订阅数据
   */
  async subscribe(config: SubscriptionConfig): Promise<SubscriptionInfo[]> {
    if (this.status !== AdapterStatus.CONNECTED) {
      throw new Error('Adapter is not connected');
    }

    const subscriptions: SubscriptionInfo[] = [];
    
    try {
      for (const symbol of config.symbols) {
        for (const dataType of config.dataTypes) {
          const subscription = await this.createSubscription(symbol, dataType);
          this.subscriptions.set(subscription.id, subscription);
          subscriptions.push(subscription);
          
          this.emit('subscribed', subscription);
        }
      }
      
      return subscriptions;
    } catch (error) {
      await this.handleError(error as Error, 'subscribe');
      throw error;
    }
  }

  /**
   * 取消订阅
   */
  async unsubscribe(subscriptionIds: string[]): Promise<void> {
    try {
      for (const id of subscriptionIds) {
        const subscription = this.subscriptions.get(id);
        if (subscription) {
          await this.removeSubscription(subscription);
          this.subscriptions.delete(id);
          
          this.emit('unsubscribed', subscription);
        }
      }
    } catch (error) {
      await this.handleError(error as Error, 'unsubscribe');
      throw error;
    }
  }

  /**
   * 取消所有订阅
   */
  async unsubscribeAll(): Promise<void> {
    const subscriptionIds = Array.from(this.subscriptions.keys());
    await this.unsubscribe(subscriptionIds);
  }

  /**
   * 获取活跃订阅
   */
  getSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.active);
  }

  /**
   * 发送心跳
   */
  async sendHeartbeat(): Promise<void> {
    try {
      if (this.connectionManager && this.status === AdapterStatus.CONNECTED) {
        const latency = await this.connectionManager.ping();
        this.lastHeartbeat = Date.now();
        this.updateLatency(latency);
        
        this.emit('heartbeat', this.lastHeartbeat);
      }
    } catch (error) {
      await this.handleError(error as Error, 'heartbeat');
    }
  }

  /**
   * 重新连接
   */
  async reconnect(): Promise<void> {
    if (this.status === AdapterStatus.RECONNECTING) {
      return;
    }

    try {
      this.setStatus(AdapterStatus.RECONNECTING);
      this.reconnectAttempts++;
      this.metrics.reconnectCount++;
      
      this.emit('reconnecting', this.reconnectAttempts);
      
      // 断开现有连接
      if (this.connectionManager) {
        await this.connectionManager.disconnect();
      }
      
      // 等待重连间隔
      await this.delay(this.config.connection.retryInterval);
      
      // 重新连接
      await this.connect();
      
      // 恢复订阅
      await this.restoreSubscriptions();
      
    } catch (error) {
      if (this.reconnectAttempts < this.config.connection.maxRetries) {
        // 继续重试
        setTimeout(() => this.reconnect(), this.config.connection.retryInterval);
      } else {
        this.setStatus(AdapterStatus.ERROR);
        await this.handleError(error as Error, 'reconnect');
      }
    }
  }

  /**
   * 销毁适配器
   */
  async destroy(): Promise<void> {
    try {
      await this.disconnect();
      
      if (this.connectionManager) {
        await this.connectionManager.destroy();
      }
      
      this.removeAllListeners();
    } catch (error) {
      await this.handleError(error as Error, 'destroy');
    }
  }

  // 抽象方法，由子类实现
  protected abstract createConnectionManager(): Promise<ConnectionManager>;
  protected abstract createSubscription(symbol: string, dataType: DataType): Promise<SubscriptionInfo>;
  protected abstract removeSubscription(subscription: SubscriptionInfo): Promise<void>;
  protected abstract parseMessage(message: any): MarketData | null;

  /**
   * 初始化错误处理器
   */
  private initializeErrorHandler(): void {
    this.errorHandler = new BaseErrorHandler({
      enableAutoRetry: true,
      defaultMaxRetries: 3,
      enableCircuitBreaker: true
    });

    // 注册通用错误处理器
    this.errorHandler.registerHandler('*', async (error) => {
      this.metrics.errorCount++;
      
      return {
        success: false,
        strategy: RecoveryStrategy.ESCALATE,
        recoveryTime: 0
      };
    });
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): void {
    this.metrics = {
      status: this.status,
      messagesReceived: 0,
      messagesSent: 0,
      errorCount: 0,
      reconnectCount: 0,
      averageLatency: 0,
      dataQualityScore: 1.0
    };
  }

  /**
   * 设置连接事件处理器
   */
  private setupConnectionEventHandlers(): void {
    if (!this.connectionManager) {
      return;
    }

    this.connectionManager.on('connected', () => {
      this.setStatus(AdapterStatus.CONNECTED);
    });

    this.connectionManager.on('disconnected', (reason) => {
      this.setStatus(AdapterStatus.DISCONNECTED);
      this.emit('disconnected', reason);
    });

    this.connectionManager.on('message', (message) => {
      this.handleMessage(message);
    });

    this.connectionManager.on('error', (error) => {
      this.handleError(error, 'connection');
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: any): void {
    try {
      this.metrics.messagesReceived++;
      
      const marketData = this.parseMessage(message);
      if (marketData) {
        marketData.receivedAt = Date.now();
        marketData.latency = this.calculateMessageLatency(marketData);
        
        this.emit('data', marketData);
      }
    } catch (error) {
      this.handleError(error as Error, 'message_parsing');
    }
  }

  /**
   * 处理错误
   */
  private async handleError(error: Error, operation: string, context?: any): Promise<void> {
    try {
      // 更新错误统计
      this.metrics.errorCount++;
      
      // 分类错误
      const errorCategory = this.classifyError(error);
      
      const result = await this.errorHandler.handleError(error, {
        component: this.exchange,
        operation,
        timestamp: Date.now()
      });
      
      if (result.strategy === RecoveryStrategy.RETRY && operation === 'connect') {
        this.metrics.reconnectCount++;
        setTimeout(() => {
          this.connect().catch(() => {});
        }, 5000);
      }
      
      this.emit('error', {
        error,
        result,
        category: errorCategory,
        operation,
        context
      });
    } catch (handlingError) {
      // 错误处理失败，直接发出错误事件
      this.emit('error', error);
    }
  }

  /**
   * 分类错误
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('econnreset') || message.includes('enotfound')) {
      return 'network';
    } else if (message.includes('429') || message.includes('rate limit')) {
      return 'rateLimit';
    } else if (message.includes('401') || message.includes('unauthorized') || message.includes('auth')) {
      return 'authentication';
    } else if (message.includes('json') || message.includes('parse') || message.includes('data')) {
      return 'data';
    } else {
      return 'unknown';
    }
  }

  /**
   * 获取适配器状态摘要
   */
  getAdapterStatus(): {
    status: AdapterStatus;
    health: 'healthy' | 'degraded' | 'unhealthy';
    performance: {
      latency: number;
      errorRate: number;
      uptime: number;
    };
    connectivity: {
      connected: boolean;
      reconnectCount: number;
      lastConnected?: number;
    };
  } {
    const now = Date.now();
    const uptime = this.metrics.connectedAt ? now - this.metrics.connectedAt : 0;
    const totalMessages = this.metrics.messagesSent + this.metrics.messagesReceived;
    const errorRate = totalMessages > 0 ? (this.metrics.errorCount / totalMessages) * 100 : 0;
    
    let health: 'healthy' | 'degraded' | 'unhealthy';
    if (this.status === AdapterStatus.CONNECTED && errorRate < 1) {
      health = 'healthy';
    } else if (this.status === AdapterStatus.CONNECTED && errorRate < 5) {
      health = 'degraded';
    } else {
      health = 'unhealthy';
    }
    
    return {
      status: this.status,
      health,
      performance: {
        latency: this.metrics.averageLatency,
        errorRate: Math.round(errorRate * 100) / 100,
        uptime
      },
      connectivity: {
        connected: this.status === AdapterStatus.CONNECTED,
        reconnectCount: this.metrics.reconnectCount,
        lastConnected: this.metrics.connectedAt
      }
    };
  }

  /**
   * 设置状态
   */
  private setStatus(newStatus: AdapterStatus): void {
    const previousStatus = this.status;
    this.status = newStatus;
    this.metrics.status = newStatus;
    
    this.emit('statusChange', newStatus, previousStatus);
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.connection.heartbeatInterval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * 恢复订阅
   */
  private async restoreSubscriptions(): Promise<void> {
    const activeSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub => sub.active);
    
    // 重新订阅
    for (const subscription of activeSubscriptions) {
      try {
        await this.createSubscription(subscription.symbol, subscription.dataType);
      } catch (error) {
        await this.handleError(error as Error, 'restore_subscription');
      }
    }
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (!this.config.exchange) {
      throw new Error('Exchange name is required');
    }
    if (!this.config.endpoints.ws) {
      throw new Error('WebSocket endpoint is required');
    }
    if (!this.config.connection.timeout || this.config.connection.timeout <= 0) {
      throw new Error('Valid connection timeout is required');
    }
  }

  /**
   * 计算平均延迟
   */
  private calculateAverageLatency(): number {
    // 简化实现，实际应该维护延迟历史
    return this.metrics.averageLatency;
  }

  /**
   * 更新延迟指标
   */
  private updateLatency(latency: number): void {
    const currentAvg = this.metrics.averageLatency;
    const totalMessages = this.metrics.messagesReceived;
    
    this.metrics.averageLatency = totalMessages > 0 
      ? (currentAvg * (totalMessages - 1) + latency) / totalMessages
      : latency;
  }

  /**
   * 计算消息延迟
   */
  private calculateMessageLatency(marketData: MarketData): number {
    return marketData.receivedAt - marketData.timestamp;
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}