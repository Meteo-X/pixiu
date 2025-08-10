/**
 * DataFlow系统Mock
 * 模拟WebSocket代理的DataFlow集成和消息路由
 */

import { EventEmitter } from 'events';

export interface MockDataFlowConfig {
  enableLatencySimulation?: boolean;
  minLatency?: number;
  maxLatency?: number;
  enableErrorSimulation?: boolean;
  errorRate?: number;
  messageBuffer?: boolean;
  bufferSize?: number;
  autoFlush?: boolean;
  flushInterval?: number;
}

export interface DataFlowMessage {
  type: string;
  exchange?: string;
  symbol?: string;
  timestamp: number;
  data: any;
  metadata?: Record<string, any>;
}

export interface MessageRouterConfig {
  routes: Map<string, string[]>; // channel -> clientIds
  filters: Map<string, any>; // filterId -> filter criteria
}

/**
 * Mock DataFlow Manager
 * 模拟消息路由和分发功能
 */
export class MockDataFlowManager extends EventEmitter {
  private config: Required<MockDataFlowConfig>;
  private messageBuffer: DataFlowMessage[] = [];
  private isRunning = false;
  private flushTimer?: NodeJS.Timeout;
  private stats = {
    messagesReceived: 0,
    messagesForwarded: 0,
    messagesDropped: 0,
    errors: 0,
    routingLatency: 0
  };

  constructor(config: MockDataFlowConfig = {}) {
    super();
    
    this.config = {
      enableLatencySimulation: false,
      minLatency: 1,
      maxLatency: 10,
      enableErrorSimulation: false,
      errorRate: 0.01, // 1%
      messageBuffer: true,
      bufferSize: 1000,
      autoFlush: true,
      flushInterval: 100,
      ...config
    };
  }

  /**
   * 启动DataFlow管理器
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    if (this.config.autoFlush && this.config.messageBuffer) {
      this.startAutoFlush();
    }
    
    this.emit('started');
  }

  /**
   * 停止DataFlow管理器
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // 刷新剩余消息
    this.flushMessages();
    
    this.emit('stopped');
  }

  /**
   * 接收消息并路由
   */
  async routeMessage(message: DataFlowMessage): Promise<void> {
    if (!this.isRunning) {
      throw new Error('DataFlow manager is not running');
    }

    this.stats.messagesReceived++;

    try {
      // 模拟错误
      if (this.config.enableErrorSimulation && Math.random() < this.config.errorRate) {
        this.stats.errors++;
        throw new Error('Simulated routing error');
      }

      // 模拟延迟
      if (this.config.enableLatencySimulation) {
        const latency = this.config.minLatency + 
          Math.random() * (this.config.maxLatency - this.config.minLatency);
        await this.delay(latency);
        this.stats.routingLatency = latency;
      }

      // 消息缓冲或直接转发
      if (this.config.messageBuffer) {
        this.addToBuffer(message);
      } else {
        await this.forwardMessage(message);
      }

    } catch (error) {
      this.stats.errors++;
      this.emit('routingError', error, message);
      throw error;
    }
  }

  /**
   * 批量路由消息
   */
  async routeMessages(messages: DataFlowMessage[]): Promise<void> {
    const routePromises = messages.map(message => this.routeMessage(message));
    await Promise.allSettled(routePromises);
  }

  /**
   * 模拟高频消息流
   */
  startHighFrequencyMessageStream(
    messagesPerSecond: number,
    durationMs: number,
    messageFactory: () => DataFlowMessage
  ): void {
    const interval = 1000 / messagesPerSecond;
    const endTime = Date.now() + durationMs;
    
    const sendMessage = () => {
      if (Date.now() >= endTime || !this.isRunning) {
        return;
      }
      
      const message = messageFactory();
      this.routeMessage(message).catch(error => {
        this.emit('streamError', error);
      });
      
      setTimeout(sendMessage, interval);
    };
    
    sendMessage();
  }

  /**
   * 获取统计信息
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      messagesReceived: 0,
      messagesForwarded: 0,
      messagesDropped: 0,
      errors: 0,
      routingLatency: 0
    };
  }

  /**
   * 设置错误模拟
   */
  setErrorSimulation(enabled: boolean, errorRate?: number): void {
    this.config.enableErrorSimulation = enabled;
    if (errorRate !== undefined) {
      this.config.errorRate = errorRate;
    }
  }

  /**
   * 设置延迟模拟
   */
  setLatencySimulation(enabled: boolean, minLatency?: number, maxLatency?: number): void {
    this.config.enableLatencySimulation = enabled;
    if (minLatency !== undefined) this.config.minLatency = minLatency;
    if (maxLatency !== undefined) this.config.maxLatency = maxLatency;
  }

  /**
   * 添加消息到缓冲区
   */
  private addToBuffer(message: DataFlowMessage): void {
    if (this.messageBuffer.length >= this.config.bufferSize) {
      // 缓冲区满，丢弃最旧的消息
      this.messageBuffer.shift();
      this.stats.messagesDropped++;
    }
    
    this.messageBuffer.push(message);
  }

  /**
   * 转发消息
   */
  private async forwardMessage(message: DataFlowMessage): Promise<void> {
    this.stats.messagesForwarded++;
    this.emit('messageForwarded', message);
  }

  /**
   * 刷新消息缓冲区
   */
  private async flushMessages(): Promise<void> {
    if (this.messageBuffer.length === 0) return;
    
    const messagesToFlush = this.messageBuffer.splice(0);
    
    for (const message of messagesToFlush) {
      await this.forwardMessage(message);
    }
    
    this.emit('bufferFlushed', messagesToFlush.length);
  }

  /**
   * 启动自动刷新
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushMessages();
    }, this.config.flushInterval);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Mock WebSocket输出通道
 * 模拟WebSocketOutputChannel功能
 */
export class MockWebSocketOutputChannel extends EventEmitter {
  private proxy: MockWebSocketProxy | null = null;
  private isConnected = false;
  private stats = {
    messagesSent: 0,
    messagesReceived: 0,
    errors: 0
  };

  constructor(private channelId: string) {
    super();
  }

  /**
   * 连接到WebSocket代理
   */
  connect(proxy: MockWebSocketProxy): void {
    this.proxy = proxy;
    this.isConnected = true;
    
    // 监听代理事件
    proxy.on('clientMessage', (clientId: string, message: any) => {
      this.stats.messagesReceived++;
      this.emit('messageFromClient', clientId, message);
    });
    
    this.emit('connected');
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.proxy) {
      // 清理事件监听器
      this.proxy.removeAllListeners('clientMessage');
      this.proxy = null;
    }
    
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * 发送消息到代理
   */
  async sendToProxy(message: any, targetClients?: string[]): Promise<number> {
    if (!this.isConnected || !this.proxy) {
      throw new Error('Output channel is not connected');
    }

    try {
      const sentCount = await this.proxy.forwardMessage(message, targetClients);
      this.stats.messagesSent++;
      return sentCount;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0
    };
  }
}

/**
 * Mock WebSocket代理
 * 模拟WebSocketProxy功能用于测试
 */
export class MockWebSocketProxy extends EventEmitter {
  private connections: Map<string, any> = new Map();
  private subscriptions: Map<string, any[]> = new Map();
  private isRunning = false;
  private stats = {
    totalConnections: 0,
    activeConnections: 0,
    messagesForwarded: 0,
    errors: 0
  };

  /**
   * 启动代理
   */
  start(): void {
    this.isRunning = true;
    this.emit('started');
  }

  /**
   * 停止代理
   */
  stop(): void {
    this.isRunning = false;
    this.connections.clear();
    this.subscriptions.clear();
    this.emit('stopped');
  }

  /**
   * 模拟客户端连接
   */
  simulateClientConnection(clientId: string, subscriptions: any[] = []): void {
    if (!this.isRunning) return;

    this.connections.set(clientId, {
      id: clientId,
      connectedAt: Date.now(),
      active: true
    });

    this.subscriptions.set(clientId, subscriptions);
    this.stats.totalConnections++;
    this.stats.activeConnections = this.connections.size;

    this.emit('clientConnected', clientId);
  }

  /**
   * 模拟客户端断开
   */
  simulateClientDisconnection(clientId: string): void {
    if (this.connections.has(clientId)) {
      this.connections.delete(clientId);
      this.subscriptions.delete(clientId);
      this.stats.activeConnections = this.connections.size;

      this.emit('clientDisconnected', clientId);
    }
  }

  /**
   * 转发消息
   */
  async forwardMessage(message: any, targetClients?: string[]): Promise<number> {
    if (!this.isRunning) {
      throw new Error('Proxy is not running');
    }

    const clients = targetClients || Array.from(this.connections.keys());
    const matchingClients = this.getMatchingClients(message, clients);
    
    // 模拟消息发送
    for (const clientId of matchingClients) {
      this.emit('messageToClient', clientId, message);
    }

    this.stats.messagesForwarded++;
    return matchingClients.length;
  }

  /**
   * 获取匹配的客户端
   */
  private getMatchingClients(message: any, clients: string[]): string[] {
    const matching: string[] = [];
    
    for (const clientId of clients) {
      const clientSubscriptions = this.subscriptions.get(clientId) || [];
      
      for (const subscription of clientSubscriptions) {
        if (this.messageMatchesSubscription(message, subscription)) {
          matching.push(clientId);
          break;
        }
      }
    }
    
    return matching;
  }

  /**
   * 检查消息是否匹配订阅
   */
  private messageMatchesSubscription(message: any, subscription: any): boolean {
    // 简化的匹配逻辑
    if (subscription.exchange && message.exchange && !subscription.exchange.includes(message.exchange)) {
      return false;
    }
    
    if (subscription.symbols && message.symbol && !subscription.symbols.includes(message.symbol)) {
      return false;
    }
    
    if (subscription.dataTypes && message.type && !subscription.dataTypes.includes(message.type)) {
      return false;
    }
    
    return true;
  }

  /**
   * 获取统计信息
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * 获取连接数
   */
  getConnectionCount(): number {
    return this.connections.size;
  }
}

/**
 * Mock监控系统
 * 模拟BaseMonitor功能
 */
export class MockMonitor {
  private logs: Array<{
    level: string;
    message: string;
    data?: any;
    timestamp: number;
  }> = [];
  
  private metrics: Map<string, any> = new Map();

  /**
   * 记录日志
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    this.logs.push({
      level,
      message,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 记录指标
   */
  recordMetric(name: string, value: any): void {
    this.metrics.set(name, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * 获取日志
   */
  getLogs(): typeof this.logs {
    return [...this.logs];
  }

  /**
   * 获取指标
   */
  getMetrics(): Map<string, any> {
    return new Map(this.metrics);
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.logs = [];
    this.metrics.clear();
  }

  /**
   * 获取错误日志数量
   */
  getErrorCount(): number {
    return this.logs.filter(log => log.level === 'error').length;
  }

  /**
   * 获取警告日志数量
   */
  getWarningCount(): number {
    return this.logs.filter(log => log.level === 'warn').length;
  }
}