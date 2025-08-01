/**
 * Binance WebSocket 单连接管理器
 * 
 * 功能:
 * - 完整的连接生命周期管理
 * - 严格按照官方规范的心跳处理
 * - 智能重连机制
 * - 订阅管理和负载均衡
 * - 全面的监控和统计
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  IBinanceConnection,
  ConnectionState,
  ConnectionEvent,
  ConnectionStats,
  HeartbeatStats,
  PerformanceStats,
  ErrorInfo,
  HeartbeatConfig,
  ReconnectConfig,
  StateChangeEventData,
  ConnectionEventData,
  DisconnectionEventData,
  DataReceivedEventData
} from './interfaces';
import { DataSubscription, BinanceWSMessage, BinanceCombinedStream } from '../types';
import { HeartbeatManager } from './HeartbeatManager';
import { ReconnectStrategy } from './ReconnectStrategy';

export class BinanceConnection extends EventEmitter implements IBinanceConnection {
  public readonly id: string;
  
  private _state: ConnectionState = ConnectionState.IDLE;
  private ws: WebSocket | null = null;
  private wsEndpoint: string;
  
  // 管理器
  private heartbeatManager: HeartbeatManager | null = null;
  private reconnectStrategy: ReconnectStrategy;
  
  // 配置
  private heartbeatConfig: HeartbeatConfig;
  private reconnectConfig: ReconnectConfig;
  private maxStreamsPerConnection: number;
  private connectionTimeout: number;
  
  // 订阅管理
  private activeSubscriptions = new Map<string, DataSubscription>();
  private pendingSubscriptions = new Set<string>();
  
  // 统计和监控
  private stats: ConnectionStats;
  private performanceStats: PerformanceStats;
  private recentErrors: ErrorInfo[] = [];
  
  // 定时器和状态
  private connectionTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  
  // 性能监控
  private messageBuffer: Array<{ timestamp: number; size: number; latency: number }> = [];
  private readonly BUFFER_SIZE = 1000;

  constructor(
    wsEndpoint: string,
    heartbeatConfig: HeartbeatConfig,
    reconnectConfig: ReconnectConfig,
    maxStreamsPerConnection = 1000,
    connectionTimeout = 30000
  ) {
    super();
    
    this.id = uuidv4();
    this.wsEndpoint = wsEndpoint;
    this.heartbeatConfig = heartbeatConfig;
    this.reconnectConfig = reconnectConfig;
    this.maxStreamsPerConnection = maxStreamsPerConnection;
    this.connectionTimeout = connectionTimeout;
    
    this.reconnectStrategy = new ReconnectStrategy(reconnectConfig);
    this.stats = this.initializeStats();
    this.performanceStats = this.initializePerformanceStats();
    
    this.startMetricsCollection();
  }

  /**
   * 获取当前连接状态
   */
  public get state(): ConnectionState {
    return this._state;
  }

  /**
   * 连接到 Binance WebSocket
   */
  public async connect(): Promise<void> {
    if (this._state !== ConnectionState.IDLE && this._state !== ConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect from state: ${this._state}`);
    }

    this.setState(ConnectionState.CONNECTING);
    this.stats.connectionAttempts++;

    try {
      await this.establishConnection();
      this.setupWebSocketHandlers();
      this.setState(ConnectionState.CONNECTED);
      
      // 等待连接稳定后开始心跳管理
      await this.waitForConnectionStability();
      
      this.setState(ConnectionState.ACTIVE);
      this.stats.successfulConnections++;
      this.stats.connectedAt = Date.now();
      this.reconnectStrategy.recordSuccessfulConnection();
      
      this.emit(ConnectionEvent.CONNECTED, this.createConnectionEventData());
      
    } catch (error) {
      this.stats.failedConnections++;
      const errorInfo = this.createErrorInfo(error, 'CONNECTION');
      this.handleConnectionError(errorInfo);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  public async disconnect(reason = 'Manual disconnect'): Promise<void> {
    if (this._state === ConnectionState.DISCONNECTED || this._state === ConnectionState.TERMINATED) {
      return;
    }

    this.isShuttingDown = true;
    this.setState(ConnectionState.DISCONNECTING);

    try {
      this.cleanup();
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, reason);
      }
      
      this.setState(ConnectionState.DISCONNECTED);
      
      this.emit(ConnectionEvent.DISCONNECTED, {
        connectionId: this.id,
        timestamp: Date.now(),
        reason,
        wasExpected: true,
        willReconnect: false
      } as DisconnectionEventData);
      
    } catch (error) {
      const errorInfo = this.createErrorInfo(error, 'CONNECTION');
      this.addError(errorInfo);
      this.setState(ConnectionState.ERROR);
    }
  }

  /**
   * 添加订阅
   */
  public async subscribe(subscriptions: DataSubscription[]): Promise<void> {
    if (this._state !== ConnectionState.ACTIVE) {
      throw new Error(`Cannot subscribe in state: ${this._state}`);
    }

    const newSubscriptions = subscriptions.filter(sub => 
      !this.activeSubscriptions.has(this.getSubscriptionKey(sub))
    );

    if (newSubscriptions.length === 0) {
      return; // 所有订阅都已存在
    }

    // 检查容量限制
    const totalSubscriptions = this.activeSubscriptions.size + newSubscriptions.length;
    if (totalSubscriptions > this.maxStreamsPerConnection) {
      throw new Error(`Subscription limit exceeded: ${totalSubscriptions} > ${this.maxStreamsPerConnection}`);
    }

    this.setState(ConnectionState.SUBSCRIBING);

    try {
      // 构建订阅消息
      const streams = newSubscriptions.map(sub => this.buildStreamName(sub));
      await this.sendSubscriptionMessage('SUBSCRIBE', streams);
      
      // 更新订阅状态
      newSubscriptions.forEach(sub => {
        const key = this.getSubscriptionKey(sub);
        this.activeSubscriptions.set(key, sub);
        this.pendingSubscriptions.add(key);
      });

      this.setState(ConnectionState.ACTIVE);
      
      // 发射订阅事件
      newSubscriptions.forEach(sub => {
        this.emit(ConnectionEvent.SUBSCRIBED, {
          connectionId: this.id,
          subscription: sub,
          timestamp: Date.now()
        });
      });

    } catch (error) {
      this.setState(ConnectionState.ACTIVE);
      const errorInfo = this.createErrorInfo(error, 'PROTOCOL');
      this.addError(errorInfo);
      throw error;
    }
  }

  /**
   * 移除订阅
   */
  public async unsubscribe(subscriptions: DataSubscription[]): Promise<void> {
    if (this._state !== ConnectionState.ACTIVE) {
      throw new Error(`Cannot unsubscribe in state: ${this._state}`);
    }

    const existingSubscriptions = subscriptions.filter(sub => 
      this.activeSubscriptions.has(this.getSubscriptionKey(sub))
    );

    if (existingSubscriptions.length === 0) {
      return; // 没有需要取消的订阅
    }

    try {
      // 构建取消订阅消息
      const streams = existingSubscriptions.map(sub => this.buildStreamName(sub));
      await this.sendSubscriptionMessage('UNSUBSCRIBE', streams);
      
      // 更新订阅状态
      existingSubscriptions.forEach(sub => {
        const key = this.getSubscriptionKey(sub);
        this.activeSubscriptions.delete(key);
        this.pendingSubscriptions.delete(key);
      });

      // 发射取消订阅事件
      existingSubscriptions.forEach(sub => {
        this.emit(ConnectionEvent.UNSUBSCRIBED, {
          connectionId: this.id,
          subscription: sub,
          timestamp: Date.now()
        });
      });

    } catch (error) {
      const errorInfo = this.createErrorInfo(error, 'PROTOCOL');
      this.addError(errorInfo);
      throw error;
    }
  }

  /**
   * 获取连接统计
   */
  public getStats(): ConnectionStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * 获取心跳统计
   */
  public getHeartbeatStats(): HeartbeatStats {
    return this.heartbeatManager?.getStats() || this.getEmptyHeartbeatStats();
  }

  /**
   * 获取性能统计
   */
  public getPerformanceStats(): PerformanceStats {
    this.updatePerformanceStats();
    return { ...this.performanceStats };
  }

  /**
   * 获取健康分数
   */
  public getHealthScore(): number {
    if (!this.heartbeatManager) {
      return this._state === ConnectionState.ACTIVE ? 0.8 : 0.0;
    }
    
    const heartbeatScore = this.heartbeatManager.getHealthScore();
    const connectionScore = this.calculateConnectionHealthScore();
    const performanceScore = this.calculatePerformanceHealthScore();
    
    // 加权平均
    return (heartbeatScore * 0.5) + (connectionScore * 0.3) + (performanceScore * 0.2);
  }

  /**
   * 检查连接是否健康
   */
  public isHealthy(): boolean {
    return this.getHealthScore() > 0.7 && 
           this._state === ConnectionState.ACTIVE && 
           (this.heartbeatManager?.isHealthy() ?? false);
  }

  /**
   * 获取当前订阅数
   */
  public getActiveSubscriptionCount(): number {
    return this.activeSubscriptions.size;
  }

  /**
   * 检查是否可以接受更多订阅
   */
  public canAcceptMoreSubscriptions(count: number): boolean {
    return (this.activeSubscriptions.size + count) <= this.maxStreamsPerConnection &&
           this._state === ConnectionState.ACTIVE &&
           this.isHealthy();
  }

  // ============================================================================
  // 私有方法 - 连接管理
  // ============================================================================

  /**
   * 建立 WebSocket 连接
   */
  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.buildWebSocketUrl();
      this.ws = new WebSocket(url);

      // 设置连接超时
      this.connectionTimer = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.terminate();
          reject(new Error(`Connection timeout after ${this.connectionTimeout}ms`));
        }
      }, this.connectionTimeout);

      this.ws.once('open', () => {
        if (this.connectionTimer) {
          clearTimeout(this.connectionTimer);
          this.connectionTimer = null;
        }
        resolve();
      });

      this.ws.once('error', (error) => {
        if (this.connectionTimer) {
          clearTimeout(this.connectionTimer);
          this.connectionTimer = null;
        }
        reject(error);
      });
    });
  }

  /**
   * 设置 WebSocket 事件处理器
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    // 创建心跳管理器
    this.heartbeatManager = new HeartbeatManager(this.ws, this.heartbeatConfig);
    
    // 转发心跳事件
    this.heartbeatManager.on(ConnectionEvent.HEARTBEAT_RECEIVED, (data) => {
      this.emit(ConnectionEvent.HEARTBEAT_RECEIVED, { ...data, connectionId: this.id });
    });
    
    this.heartbeatManager.on(ConnectionEvent.HEARTBEAT_TIMEOUT, (data) => {
      this.emit(ConnectionEvent.HEARTBEAT_TIMEOUT, { ...data, connectionId: this.id });
      this.handleHeartbeatTimeout();
    });
    
    this.heartbeatManager.on(ConnectionEvent.ERROR, (errorInfo) => {
      this.addError(errorInfo);
    });

    // 消息处理
    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    // 错误处理
    this.ws.on('error', (error) => {
      const errorInfo = this.createErrorInfo(error, 'CONNECTION');
      this.handleConnectionError(errorInfo);
    });

    // 关闭处理
    this.ws.on('close', (code, reason) => {
      this.handleConnectionClose(code, reason.toString());
    });

    // 启动心跳管理
    this.heartbeatManager.start();
  }

  /**
   * 等待连接稳定 (收到第一个心跳)
   */
  private async waitForConnectionStability(): Promise<void> {
    return new Promise((resolve) => {
      // 如果在 30 秒内收到心跳，认为连接稳定
      const stabilityTimeout = setTimeout(() => {
        resolve(); // 即使没收到心跳也继续，可能服务器心跳间隔较长
      }, 30000);

      const onHeartbeat = () => {
        clearTimeout(stabilityTimeout);
        this.heartbeatManager?.off(ConnectionEvent.HEARTBEAT_RECEIVED, onHeartbeat);
        resolve();
      };

      this.heartbeatManager?.once(ConnectionEvent.HEARTBEAT_RECEIVED, onHeartbeat);
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: WebSocket.Data): void {
    const timestamp = Date.now();
    const messageSize = Buffer.byteLength(data.toString());
    
    try {
      const message: BinanceWSMessage = JSON.parse(data.toString());
      let latency = 0;
      let streamName = '';
      let dataType = '';

      // 解析不同类型的消息
      if ('stream' in message && 'data' in message) {
        // Combined stream message
        const combinedMessage = message as BinanceCombinedStream<any>;
        streamName = combinedMessage.stream;
        
        if (combinedMessage.data && combinedMessage.data.E) {
          latency = timestamp - combinedMessage.data.E;
        }
        
        // 从流名称解析数据类型
        dataType = this.parseDataTypeFromStream(streamName);
        
      } else if ('e' in message) {
        // Direct stream message
        streamName = `${message.s?.toLowerCase() || 'unknown'}@${message.e}`;
        dataType = message.e;
        
        if ('E' in message && typeof message.E === 'number') {
          latency = timestamp - message.E;
        }
      }

      // 更新统计
      this.performanceStats.messagesReceived++;
      this.performanceStats.bytesReceived += messageSize;
      
      // 添加到消息缓冲区
      this.messageBuffer.push({ timestamp, size: messageSize, latency });
      if (this.messageBuffer.length > this.BUFFER_SIZE) {
        this.messageBuffer.shift();
      }

      // 发射数据接收事件
      this.emit(ConnectionEvent.DATA_RECEIVED, {
        connectionId: this.id,
        timestamp,
        messageSize,
        latency,
        streamName,
        dataType
      } as DataReceivedEventData);

    } catch (error) {
      const errorInfo = this.createErrorInfo(error, 'DATA', {
        messageSize,
        rawMessage: data.toString().substring(0, 500) // 限制大小
      });
      this.addError(errorInfo);
    }
  }

  /**
   * 处理连接错误
   */
  private handleConnectionError(errorInfo: ErrorInfo): void {
    this.addError(errorInfo);
    this.emit(ConnectionEvent.ERROR, errorInfo);

    if (this._state === ConnectionState.ACTIVE && !this.isShuttingDown) {
      this.scheduleReconnect(errorInfo);
    }
  }

  /**
   * 处理心跳超时
   */
  private handleHeartbeatTimeout(): void {
    if (this._state === ConnectionState.ACTIVE && !this.isShuttingDown) {
      const errorInfo: ErrorInfo = {
        timestamp: Date.now(),
        message: 'Heartbeat timeout - no ping received from server',
        code: 'HEARTBEAT_TIMEOUT',
        type: 'HEARTBEAT',
        fatal: false
      };
      
      this.scheduleReconnect(errorInfo);
    }
  }

  /**
   * 处理连接关闭
   */
  private handleConnectionClose(code: number, reason: string): void {
    this.cleanup();
    
    const wasExpected = this.isShuttingDown || this._state === ConnectionState.DISCONNECTING;
    
    if (!wasExpected && !this.isShuttingDown) {
      this.setState(ConnectionState.DISCONNECTED);
      
      const errorInfo: ErrorInfo = {
        timestamp: Date.now(),
        message: `Connection closed unexpectedly: ${reason}`,
        code: `WS_${code}`,
        type: 'CONNECTION',
        fatal: false,
        context: { closeCode: code, closeReason: reason }
      };
      
      this.emit(ConnectionEvent.DISCONNECTED, {
        connectionId: this.id,
        timestamp: Date.now(),
        reason: `Code: ${code}, Reason: ${reason}`,
        wasExpected: false,
        willReconnect: true
      } as DisconnectionEventData);
      
      this.scheduleReconnect(errorInfo);
    } else {
      this.setState(ConnectionState.DISCONNECTED);
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(errorInfo: ErrorInfo): void {
    if (this.isShuttingDown || !this.reconnectStrategy.shouldReconnect(errorInfo)) {
      this.setState(ConnectionState.TERMINATED);
      return;
    }

    this.setState(ConnectionState.RECONNECTING);
    this.stats.reconnectAttempts++;

    const delay = this.reconnectStrategy.getNextDelay();
    
    this.emit(ConnectionEvent.RECONNECT_SCHEDULED, {
      connectionId: this.id,
      timestamp: Date.now(),
      delay,
      attempt: this.stats.reconnectAttempts,
      reason: errorInfo.message
    });

    this.reconnectTimer = setTimeout(async () => {
      if (!this.isShuttingDown) {
        try {
          await this.connect();
          await this.restoreSubscriptions();
        } catch (error) {
          const reconnectError = this.createErrorInfo(error, 'CONNECTION');
          this.handleConnectionError(reconnectError);
        }
      }
    }, delay);
  }

  /**
   * 恢复订阅
   */
  private async restoreSubscriptions(): Promise<void> {
    if (this.activeSubscriptions.size === 0) {
      return;
    }

    try {
      const subscriptions = Array.from(this.activeSubscriptions.values());
      await this.subscribe(subscriptions);
    } catch (error) {
      const errorInfo = this.createErrorInfo(error, 'PROTOCOL');
      this.addError(errorInfo);
    }
  }

  // ============================================================================
  // 私有方法 - 工具函数
  // ============================================================================

  /**
   * 构建 WebSocket URL
   */
  private buildWebSocketUrl(): string {
    const streams = Array.from(this.activeSubscriptions.values())
      .map(sub => this.buildStreamName(sub));
    
    if (streams.length === 0) {
      return this.wsEndpoint + '/ws';
    }
    
    return `${this.wsEndpoint}/stream?streams=${streams.join('/')}`;
  }

  /**
   * 构建流名称
   */
  private buildStreamName(subscription: DataSubscription): string {
    const symbol = subscription.symbol.toLowerCase();
    
    switch (subscription.dataType) {
      case 'trade':
        return `${symbol}@trade`;
      case 'ticker':
        return `${symbol}@ticker`;
      case 'depth':
        const levels = subscription.params?.levels || 20;
        const speed = subscription.params?.speed || '100ms';
        return `${symbol}@depth${levels}@${speed}`;
      default:
        // K线数据
        if (subscription.dataType.startsWith('kline_')) {
          const interval = subscription.dataType.replace('kline_', '');
          return `${symbol}@kline_${interval}`;
        }
        return `${symbol}@${subscription.dataType}`;
    }
  }

  /**
   * 获取订阅键
   */
  private getSubscriptionKey(subscription: DataSubscription): string {
    return `${subscription.symbol}:${subscription.dataType}`;
  }

  /**
   * 从流名称解析数据类型
   */
  private parseDataTypeFromStream(streamName: string): string {
    const parts = streamName.split('@');
    return parts.length > 1 ? parts[1] : 'unknown';
  }

  /**
   * 发送订阅消息
   */
  private async sendSubscriptionMessage(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', streams: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const message = {
      method,
      params: streams,
      id: Date.now()
    };

    return new Promise((resolve, reject) => {
      this.ws!.send(JSON.stringify(message), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 设置连接状态
   */
  private setState(newState: ConnectionState): void {
    if (this._state === newState) return;

    const oldState = this._state;
    this._state = newState;

    this.emit(ConnectionEvent.STATE_CHANGED, {
      connectionId: this.id,
      oldState,
      newState,
      timestamp: Date.now()
    } as StateChangeEventData);
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    // 清理定时器
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 停止心跳管理
    if (this.heartbeatManager) {
      this.heartbeatManager.stop();
      this.heartbeatManager = null;
    }

    // 清理 WebSocket
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }
  }

  /**
   * 初始化统计数据
   */
  private initializeStats(): ConnectionStats {
    return {
      connectionId: this.id,
      state: this._state,
      connectedAt: undefined,
      uptime: 0,
      connectionAttempts: 0,
      successfulConnections: 0,
      failedConnections: 0,
      reconnectAttempts: 0,
      activeSubscriptions: 0,
      lastError: undefined
    };
  }

  /**
   * 初始化性能统计
   */
  private initializePerformanceStats(): PerformanceStats {
    return {
      messagesReceived: 0,
      bytesReceived: 0,
      messagesPerSecond: 0,
      bytesPerSecond: 0,
      latency: {
        current: 0,
        average: 0,
        min: 0,
        max: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0
      },
      latencyDistribution: {}
    };
  }

  /**
   * 更新统计数据
   */
  private updateStats(): void {
    this.stats.state = this._state;
    this.stats.activeSubscriptions = this.activeSubscriptions.size;
    this.stats.uptime = this.stats.connectedAt ? Date.now() - this.stats.connectedAt : 0;
  }

  /**
   * 更新性能统计
   */
  private updatePerformanceStats(): void {
    if (this.messageBuffer.length === 0) return;

    // 计算最近一分钟的统计
    const oneMinuteAgo = Date.now() - 60000;
    const recentMessages = this.messageBuffer.filter(msg => msg.timestamp > oneMinuteAgo);
    
    if (recentMessages.length > 0) {
      this.performanceStats.messagesPerSecond = recentMessages.length / 60;
      this.performanceStats.bytesPerSecond = 
        recentMessages.reduce((sum, msg) => sum + msg.size, 0) / 60;

      // 计算延迟统计
      const latencies = recentMessages.map(msg => msg.latency).filter(lat => lat > 0);
      if (latencies.length > 0) {
        latencies.sort((a, b) => a - b);
        
        this.performanceStats.latency = {
          current: latencies[latencies.length - 1] || 0,
          average: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
          min: latencies[0],
          max: latencies[latencies.length - 1],
          p50: latencies[Math.floor(latencies.length * 0.5)],
          p90: latencies[Math.floor(latencies.length * 0.9)],
          p95: latencies[Math.floor(latencies.length * 0.95)],
          p99: latencies[Math.floor(latencies.length * 0.99)]
        };
      }
    }
  }

  private calculateConnectionHealthScore(): number {
    const successRate = this.stats.connectionAttempts > 0 ? 
      this.stats.successfulConnections / this.stats.connectionAttempts : 1;
    const errorRate = this.recentErrors.length / 100; // 最近错误率
    const uptimeScore = Math.min(this.stats.uptime / 3600000, 1); // 运行时间分数 (小时)
    
    return Math.max(0, successRate - errorRate + uptimeScore * 0.2);
  }

  private calculatePerformanceHealthScore(): number {
    const avgLatency = this.performanceStats.latency.average;
    const latencyScore = Math.max(0, 1 - avgLatency / 200); // 200ms 作为基准
    const throughputScore = Math.min(this.performanceStats.messagesPerSecond / 100, 1); // 100 msg/s 作为基准
    
    return (latencyScore * 0.7) + (throughputScore * 0.3);
  }

  private createErrorInfo(error: any, type: ErrorInfo['type'], context?: Record<string, any>): ErrorInfo {
    return {
      timestamp: Date.now(),
      message: error.message || String(error),
      code: error.code || 'UNKNOWN',
      type,
      context,
      fatal: false
    };
  }

  private addError(errorInfo: ErrorInfo): void {
    this.recentErrors.push(errorInfo);
    
    // 保持最近 50 个错误
    if (this.recentErrors.length > 50) {
      this.recentErrors.shift();
    }
    
    this.stats.lastError = errorInfo;
  }

  private createConnectionEventData(): ConnectionEventData {
    return {
      connectionId: this.id,
      timestamp: Date.now(),
      endpoint: this.wsEndpoint,
      subscriptions: Array.from(this.activeSubscriptions.values())
    };
  }

  private getEmptyHeartbeatStats(): HeartbeatStats {
    return {
      pingsReceived: 0,
      pongsSent: 0,
      unsolicitedPongsSent: 0,
      heartbeatTimeouts: 0,
      lastPingTime: undefined,
      lastPongTime: undefined,
      avgPongResponseTime: 0,
      maxPongResponseTime: 0,
      healthScore: 0
    };
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateStats();
      this.updatePerformanceStats();
    }, 10000); // 每 10 秒更新一次指标
  }

  /**
   * 析构函数 - 清理所有资源
   */
  public destroy(): void {
    this.isShuttingDown = true;
    this.cleanup();
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    
    this.setState(ConnectionState.TERMINATED);
    this.removeAllListeners();
  }
}