/**
 * WebSocket连接管理器基础实现
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { retry } from '@pixiu/shared-core';
import {
  ConnectionManager,
  ConnectionConfig,
  ConnectionState,
  ConnectionMetrics,
  ConnectionEventMap
} from '../interfaces/connection';

export class BaseConnectionManager extends EventEmitter implements ConnectionManager {
  private ws?: WebSocket;
  private config!: ConnectionConfig;
  private state: ConnectionState = ConnectionState.IDLE;
  private metrics!: ConnectionMetrics;
  private heartbeatTimer?: NodeJS.Timeout;
  private heartbeatTimeoutTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private latencyHistory: number[] = [];
  private lastPingTime = 0;

  constructor() {
    super();
    this.initializeMetrics();
  }

  /**
   * 获取连接状态
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * 获取连接配置
   */
  getConfig(): ConnectionConfig {
    return { ...this.config };
  }

  /**
   * 获取连接指标
   */
  getMetrics(): ConnectionMetrics {
    return {
      ...this.metrics,
      averageRTT: this.calculateAverageRTT()
    };
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && 
           this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 连接
   */
  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config;
    
    if (this.isConnected()) {
      return;
    }

    this.setState(ConnectionState.CONNECTING);

    try {
      await this.establishConnection();
      this.setState(ConnectionState.CONNECTED);
      this.metrics.connectedAt = Date.now();
      this.reconnectAttempts = 0;
      
      this.startHeartbeat();
      this.emit('connected');
    } catch (error) {
      this.setState(ConnectionState.ERROR);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.state === ConnectionState.DISCONNECTED) {
      return;
    }

    this.setState(ConnectionState.DISCONNECTING);
    
    this.stopHeartbeat();
    this.clearReconnectTimer();
    
    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = undefined;
    }
    
    this.setState(ConnectionState.DISCONNECTED);
    this.emit('disconnected', 'Normal closure');
  }

  /**
   * 重新连接
   */
  async reconnect(): Promise<void> {
    if (this.state === ConnectionState.RECONNECTING) {
      return;
    }

    this.setState(ConnectionState.RECONNECTING);
    this.reconnectAttempts++;
    
    this.emit('reconnecting', this.reconnectAttempts);
    
    // 关闭现有连接
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    
    // 等待重连间隔
    await this.delay(this.config.retryInterval);
    
    try {
      await this.establishConnection();
      this.setState(ConnectionState.CONNECTED);
      this.metrics.connectedAt = Date.now();
      
      this.startHeartbeat();
      this.emit('reconnected');
    } catch (error) {
      if (this.reconnectAttempts < this.config.maxRetries) {
        // 调度下次重连
        this.scheduleReconnect();
      } else {
        this.setState(ConnectionState.ERROR);
        this.emit('error', new Error(`Max reconnect attempts (${this.config.maxRetries}) exceeded`));
      }
    }
  }

  /**
   * 发送消息
   */
  async send(message: any): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Connection is not established');
    }

    const data = typeof message === 'string' ? message : JSON.stringify(message);
    await this.sendRaw(data);
  }

  /**
   * 发送原始数据
   */
  async sendRaw(data: string | Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not open'));
        return;
      }

      this.ws.send(data, (error) => {
        if (error) {
          this.metrics.errorCount++;
          reject(error);
        } else {
          this.metrics.messagesSent++;
          this.metrics.bytesSent += Buffer.byteLength(data);
          this.updateLastActivity();
          resolve();
        }
      });
    });
  }

  /**
   * 发送心跳
   */
  async ping(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not open'));
        return;
      }

      this.lastPingTime = Date.now();
      
      this.ws.ping((error: Error | undefined) => {
        if (error) {
          reject(error);
        }
      });

      // 设置pong监听器
      const pongHandler = () => {
        const latency = Date.now() - this.lastPingTime;
        this.updateLatency(latency);
        this.ws?.off('pong', pongHandler);
        resolve(latency);
      };

      this.ws.on('pong', pongHandler);

      // 设置超时
      setTimeout(() => {
        this.ws?.off('pong', pongHandler);
        reject(new Error('Ping timeout'));
      }, this.config.heartbeatTimeout);
    });
  }

  /**
   * 设置心跳间隔
   */
  setHeartbeatInterval(interval: number): void {
    this.config.heartbeatInterval = interval;
    
    if (this.isConnected()) {
      this.stopHeartbeat();
      this.startHeartbeat();
    }
  }

  /**
   * 获取连接延迟
   */
  getLatency(): number {
    return this.calculateAverageRTT();
  }

  /**
   * 销毁连接
   */
  async destroy(): Promise<void> {
    await this.disconnect();
    this.removeAllListeners();
  }

  /**
   * 建立WebSocket连接
   */
  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      try {
        // 创建WebSocket连接
        const wsOptions: WebSocket.ClientOptions = {
          headers: this.config.headers,
          handshakeTimeout: this.config.timeout
        };

        // 配置代理
        if (this.config.proxy) {
          // 这里可以配置代理逻辑
        }

        this.ws = new WebSocket(this.config.url, wsOptions);

        // 连接成功
        this.ws.on('open', () => {
          clearTimeout(connectTimeout);
          this.setupEventHandlers();
          resolve();
        });

        // 连接失败
        this.ws.on('error', (error) => {
          clearTimeout(connectTimeout);
          this.metrics.errorCount++;
          reject(error);
        });

      } catch (error) {
        clearTimeout(connectTimeout);
        reject(error);
      }
    });
  }

  /**
   * 设置WebSocket事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.ws) {
      return;
    }

    // 接收消息
    this.ws.on('message', (data) => {
      this.metrics.messagesReceived++;
      this.metrics.bytesReceived += Buffer.from(data as ArrayBuffer).length;
      this.updateLastActivity();
      
      try {
        const message = data.toString();
        const parsed = JSON.parse(message);
        this.emit('message', parsed);
      } catch (error) {
        // 如果JSON解析失败，发送原始数据
        this.emit('message', data.toString());
      }
    });

    // 连接关闭
    this.ws.on('close', (code, reason) => {
      this.stopHeartbeat();
      
      const wasConnected = this.state === ConnectionState.CONNECTED;
      this.setState(ConnectionState.DISCONNECTED);
      
      if (wasConnected && code !== 1000) {
        // 非正常关闭，尝试重连
        this.scheduleReconnect();
      }
      
      this.emit('disconnected', reason.toString());
    });

    // 连接错误
    this.ws.on('error', (error) => {
      this.metrics.errorCount++;
      this.emit('error', error);
    });

    // Pong响应
    this.ws.on('pong', () => {
      const latency = Date.now() - this.lastPingTime;
      this.updateLatency(latency);
      this.emit('heartbeat', latency);
    });
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    if (this.config.heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat();
      }, this.config.heartbeatInterval);
    }
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = undefined;
    }
  }

  /**
   * 发送心跳
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      await this.ping();
    } catch (error) {
      this.emit('heartbeatTimeout');
      // 心跳失败，可能需要重连
      if (this.isConnected()) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * 调度重连
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    
    if (this.reconnectAttempts < this.config.maxRetries) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnect();
      }, this.config.retryInterval);
    }
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * 设置连接状态
   */
  private setState(newState: ConnectionState): void {
    const oldState = this.state;
    this.state = newState;
    this.metrics.state = newState;
    
    this.emit('stateChange', newState, oldState);
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): void {
    this.metrics = {
      state: this.state,
      lastActivity: Date.now(),
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      reconnectAttempts: 0,
      errorCount: 0,
      averageRTT: 0
    };
  }

  /**
   * 更新最后活动时间
   */
  private updateLastActivity(): void {
    this.metrics.lastActivity = Date.now();
  }

  /**
   * 更新延迟
   */
  private updateLatency(latency: number): void {
    this.latencyHistory.push(latency);
    
    // 只保留最近100个延迟数据
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }
  }

  /**
   * 计算平均往返时间
   */
  private calculateAverageRTT(): number {
    if (this.latencyHistory.length === 0) {
      return 0;
    }
    
    const sum = this.latencyHistory.reduce((acc, latency) => acc + latency, 0);
    return sum / this.latencyHistory.length;
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}