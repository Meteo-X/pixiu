/**
 * WebSocket客户端模拟器
 * 支持1000+并发连接的高性能测试客户端
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface ClientConfig {
  url: string;
  connectionTimeout?: number;
  messageTimeout?: number;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
  metadata?: Record<string, any>;
}

export interface ConnectionMetrics {
  id: string;
  connectedAt: number;
  lastActivity: number;
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  errors: number;
  reconnectAttempts: number;
  averageLatency: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export interface MessageStats {
  totalSent: number;
  totalReceived: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  latencyP95: number;
  latencyP99: number;
  messageTypes: Map<string, number>;
  errorCount: number;
}

/**
 * 单个WebSocket客户端模拟器
 */
export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<ClientConfig>;
  private metrics: ConnectionMetrics;
  private latencyStats: number[] = [];
  private pingInterval?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;
  private messageQueue: Array<{ message: any, timestamp: number }> = [];
  private isReconnecting = false;

  constructor(config: ClientConfig) {
    super();
    
    this.config = {
      connectionTimeout: 10000,
      messageTimeout: 5000,
      reconnect: true,
      reconnectInterval: 1000,
      maxReconnectAttempts: 5,
      pingInterval: 30000,
      metadata: {},
      ...config
    };

    this.metrics = {
      id: this.generateId(),
      connectedAt: 0,
      lastActivity: 0,
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      errors: 0,
      reconnectAttempts: 0,
      averageLatency: 0,
      status: 'disconnected'
    };
  }

  /**
   * 连接到WebSocket服务器
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.metrics.status = 'connecting';
        this.ws = new WebSocket(this.config.url);

        const connectionTimeout = setTimeout(() => {
          this.handleError(new Error('Connection timeout'));
          reject(new Error('Connection timeout'));
        }, this.config.connectionTimeout);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.metrics.connectedAt = Date.now();
          this.metrics.lastActivity = Date.now();
          this.metrics.status = 'connected';
          this.startPingInterval();
          this.flushMessageQueue();
          this.emit('connected', this.metrics.id);
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          this.handleClose(code, reason.toString());
        });

        this.ws.on('error', (error) => {
          clearTimeout(connectionTimeout);
          this.handleError(error);
          reject(error);
        });

        this.ws.on('pong', () => {
          this.metrics.lastActivity = Date.now();
        });

      } catch (error) {
        this.handleError(error as Error);
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.once('close', () => {
          this.cleanup();
          resolve();
        });
        this.ws.close(1000, 'Client disconnect');
      } else {
        this.cleanup();
        resolve();
      }
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(message: any): Promise<number> {
    const startTime = Date.now();
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.config.reconnect && !this.isReconnecting) {
        // 将消息加入队列，等待重连后发送
        this.messageQueue.push({ message, timestamp: startTime });
        this.attemptReconnect();
        return 0;
      } else {
        throw new Error('WebSocket is not connected');
      }
    }

    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message);
      const messageSize = Buffer.byteLength(messageStr, 'utf8');

      // 设置消息超时
      const messageTimeout = setTimeout(() => {
        reject(new Error('Message send timeout'));
      }, this.config.messageTimeout);

      try {
        this.ws!.send(messageStr, (error) => {
          clearTimeout(messageTimeout);
          const latency = Date.now() - startTime;
          
          if (error) {
            this.metrics.errors++;
            reject(error);
          } else {
            this.metrics.messagesSent++;
            this.metrics.bytesSent += messageSize;
            this.metrics.lastActivity = Date.now();
            this.updateLatencyStats(latency);
            resolve(latency);
          }
        });
      } catch (error) {
        clearTimeout(messageTimeout);
        this.metrics.errors++;
        reject(error);
      }
    });
  }

  /**
   * 发送订阅请求
   */
  async subscribe(filter: { exchange?: string[], symbols?: string[], dataTypes?: string[] }): Promise<void> {
    await this.sendMessage({
      type: 'subscribe',
      payload: filter
    });
  }

  /**
   * 发送取消订阅请求
   */
  async unsubscribe(filterId?: string): Promise<void> {
    await this.sendMessage({
      type: 'unsubscribe',
      payload: { filterId }
    });
  }

  /**
   * 发送Ping消息
   */
  async ping(): Promise<number> {
    return this.sendMessage({ type: 'ping' });
  }

  /**
   * 获取连接指标
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取消息统计
   */
  getMessageStats(): MessageStats {
    const latencies = [...this.latencyStats].sort((a, b) => a - b);
    const messageTypes = new Map<string, number>();
    
    return {
      totalSent: this.metrics.messagesSent,
      totalReceived: this.metrics.messagesReceived,
      averageLatency: this.metrics.averageLatency,
      minLatency: latencies[0] || 0,
      maxLatency: latencies[latencies.length - 1] || 0,
      latencyP95: latencies[Math.floor(latencies.length * 0.95)] || 0,
      latencyP99: latencies[Math.floor(latencies.length * 0.99)] || 0,
      messageTypes,
      errorCount: this.metrics.errors
    };
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.metrics.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 处理接收的消息
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const messageStr = data.toString();
      const messageSize = Buffer.byteLength(messageStr, 'utf8');
      const message = JSON.parse(messageStr);
      
      this.metrics.messagesReceived++;
      this.metrics.bytesReceived += messageSize;
      this.metrics.lastActivity = Date.now();
      
      this.emit('message', message);
      
      // 特殊处理某些消息类型
      if (message.type === 'pong') {
        this.emit('pong', message);
      } else if (message.type === 'welcome') {
        this.emit('welcome', message);
      } else if (message.type === 'subscribed') {
        this.emit('subscribed', message);
      } else if (message.type === 'unsubscribed') {
        this.emit('unsubscribed', message);
      } else if (message.type === 'error') {
        this.emit('error', new Error(message.payload?.message || 'Server error'));
      }
      
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
    }
  }

  /**
   * 处理连接关闭
   */
  private handleClose(code: number, reason: string): void {
    this.metrics.status = 'disconnected';
    this.stopPingInterval();
    
    this.emit('close', code, reason);
    
    // 自动重连
    if (this.config.reconnect && !this.isReconnecting && this.metrics.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.attemptReconnect();
    }
  }

  /**
   * 处理连接错误
   */
  private handleError(error: Error): void {
    this.metrics.errors++;
    this.metrics.status = 'error';
    this.emit('error', error);
  }

  /**
   * 尝试重连
   */
  private attemptReconnect(): void {
    if (this.isReconnecting || this.metrics.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }

    this.isReconnecting = true;
    this.metrics.reconnectAttempts++;
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
        this.isReconnecting = false;
        this.emit('reconnected', this.metrics.id);
      } catch (error) {
        this.isReconnecting = false;
        this.emit('reconnectFailed', error);
      }
    }, this.config.reconnectInterval * this.metrics.reconnectAttempts);
  }

  /**
   * 启动心跳检测
   */
  private startPingInterval(): void {
    if (this.config.pingInterval > 0) {
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, this.config.pingInterval);
    }
  }

  /**
   * 停止心跳检测
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.stopPingInterval();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws = null;
    this.metrics.status = 'disconnected';
  }

  /**
   * 刷新消息队列
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const { message } = this.messageQueue.shift()!;
      this.sendMessage(message).catch(error => {
        this.emit('error', error);
      });
    }
  }

  /**
   * 更新延迟统计
   */
  private updateLatencyStats(latency: number): void {
    this.latencyStats.push(latency);
    if (this.latencyStats.length > 100) {
      this.latencyStats.shift();
    }
    
    const sum = this.latencyStats.reduce((a, b) => a + b, 0);
    this.metrics.averageLatency = sum / this.latencyStats.length;
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * WebSocket客户端池管理器
 * 支持大量并发连接的管理
 */
export class WebSocketClientPool extends EventEmitter {
  private clients: Map<string, WebSocketClient> = new Map();
  private config: ClientConfig;
  private isStarted = false;

  constructor(config: ClientConfig) {
    super();
    this.config = config;
  }

  /**
   * 创建指定数量的并发连接
   */
  async createClients(count: number): Promise<string[]> {
    const clientIds: string[] = [];
    const connectPromises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      const client = new WebSocketClient(this.config);
      const clientId = client.getMetrics().id;
      
      this.clients.set(clientId, client);
      clientIds.push(clientId);
      
      // 设置客户端事件监听
      this.setupClientEventHandlers(client);
      
      // 批量连接，避免同时发起太多连接
      connectPromises.push(client.connect());
      
      // 每10个连接暂停一下，避免过度负载
      if (i > 0 && i % 10 === 0) {
        await this.delay(100);
      }
    }

    // 等待所有连接建立
    await Promise.allSettled(connectPromises);
    
    this.isStarted = true;
    this.emit('poolReady', clientIds);
    
    return clientIds;
  }

  /**
   * 关闭所有客户端连接
   */
  async closeAllClients(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    const disconnectPromises: Promise<void>[] = [];
    
    for (const client of this.clients.values()) {
      disconnectPromises.push(client.disconnect());
    }

    await Promise.allSettled(disconnectPromises);
    
    this.clients.clear();
    this.isStarted = false;
    this.emit('poolClosed');
  }

  /**
   * 获取客户端实例
   */
  getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * 获取所有客户端ID
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * 获取已连接的客户端ID列表
   */
  getConnectedClientIds(): string[] {
    const connectedIds: string[] = [];
    for (const [id, client] of this.clients) {
      if (client.isConnected()) {
        connectedIds.push(id);
      }
    }
    return connectedIds;
  }

  /**
   * 广播消息到所有客户端
   */
  async broadcastMessage(message: any): Promise<{ success: number, failed: number }> {
    const promises: Promise<number>[] = [];
    let success = 0;
    let failed = 0;

    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        promises.push(
          client.sendMessage(message)
            .then((latency) => {
              success++;
              return latency;
            })
            .catch(() => {
              failed++;
              return 0;
            })
        );
      }
    }

    await Promise.allSettled(promises);
    return { success, failed };
  }

  /**
   * 获取池统计信息
   */
  getPoolStats(): {
    totalClients: number;
    connectedClients: number;
    disconnectedClients: number;
    errorClients: number;
    totalMessagesSent: number;
    totalMessagesReceived: number;
    averageLatency: number;
  } {
    let connectedCount = 0;
    let disconnectedCount = 0;
    let errorCount = 0;
    let totalMessagesSent = 0;
    let totalMessagesReceived = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const client of this.clients.values()) {
      const metrics = client.getMetrics();
      
      switch (metrics.status) {
        case 'connected':
          connectedCount++;
          break;
        case 'disconnected':
          disconnectedCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
      
      totalMessagesSent += metrics.messagesSent;
      totalMessagesReceived += metrics.messagesReceived;
      
      if (metrics.averageLatency > 0) {
        totalLatency += metrics.averageLatency;
        latencyCount++;
      }
    }

    return {
      totalClients: this.clients.size,
      connectedClients: connectedCount,
      disconnectedClients: disconnectedCount,
      errorClients: errorCount,
      totalMessagesSent,
      totalMessagesReceived,
      averageLatency: latencyCount > 0 ? totalLatency / latencyCount : 0
    };
  }

  /**
   * 设置客户端事件处理器
   */
  private setupClientEventHandlers(client: WebSocketClient): void {
    const clientId = client.getMetrics().id;
    
    client.on('connected', () => {
      this.emit('clientConnected', clientId);
    });
    
    client.on('message', (message) => {
      this.emit('clientMessage', clientId, message);
    });
    
    client.on('error', (error) => {
      this.emit('clientError', clientId, error);
    });
    
    client.on('close', (code, reason) => {
      this.emit('clientClosed', clientId, code, reason);
    });
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}