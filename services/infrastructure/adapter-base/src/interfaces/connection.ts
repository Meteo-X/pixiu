/**
 * 连接管理接口定义
 */

import { EventEmitter } from 'events';

export enum ConnectionState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

export interface ConnectionConfig {
  /** 连接URL */
  url: string;
  /** 连接超时（毫秒） */
  timeout: number;
  /** 最大重连次数 */
  maxRetries: number;
  /** 重连间隔（毫秒） */
  retryInterval: number;
  /** 心跳间隔（毫秒） */
  heartbeatInterval: number;
  /** 心跳超时（毫秒） */
  heartbeatTimeout: number;
  /** 是否启用压缩 */
  enableCompression?: boolean;
  /** 自定义头部 */
  headers?: Record<string, string>;
  /** 代理配置 */
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
}

export interface ConnectionMetrics {
  /** 连接状态 */
  state: ConnectionState;
  /** 连接开始时间 */
  connectedAt?: number;
  /** 最后活动时间 */
  lastActivity: number;
  /** 发送字节数 */
  bytesSent: number;
  /** 接收字节数 */
  bytesReceived: number;
  /** 发送消息数 */
  messagesSent: number;
  /** 接收消息数 */
  messagesReceived: number;
  /** 重连次数 */
  reconnectAttempts: number;
  /** 错误次数 */
  errorCount: number;
  /** 平均往返时间（毫秒） */
  averageRTT: number;
}

export interface ConnectionEventMap {
  /** 连接状态变化 */
  stateChange: (newState: ConnectionState, oldState: ConnectionState) => void;
  /** 连接建立 */
  connected: () => void;
  /** 连接断开 */
  disconnected: (reason?: string) => void;
  /** 接收到消息 */
  message: (message: any) => void;
  /** 发生错误 */
  error: (error: Error) => void;
  /** 开始重连 */
  reconnecting: (attempt: number) => void;
  /** 重连成功 */
  reconnected: () => void;
  /** 心跳检测 */
  heartbeat: (latency: number) => void;
  /** 心跳超时 */
  heartbeatTimeout: () => void;
}

/**
 * 连接管理器接口
 */
export interface ConnectionManager extends EventEmitter {
  /** 获取连接状态 */
  getState(): ConnectionState;
  
  /** 获取连接配置 */
  getConfig(): ConnectionConfig;
  
  /** 获取连接指标 */
  getMetrics(): ConnectionMetrics;
  
  /** 是否已连接 */
  isConnected(): boolean;
  
  /** 连接 */
  connect(config: ConnectionConfig): Promise<void>;
  
  /** 断开连接 */
  disconnect(): Promise<void>;
  
  /** 重新连接 */
  reconnect(): Promise<void>;
  
  /** 发送消息 */
  send(message: any): Promise<void>;
  
  /** 发送原始数据 */
  sendRaw(data: string | Buffer): Promise<void>;
  
  /** 发送心跳 */
  ping(): Promise<number>; // 返回延迟时间
  
  /** 设置心跳间隔 */
  setHeartbeatInterval(interval: number): void;
  
  /** 获取连接延迟 */
  getLatency(): number;
  
  /** 销毁连接 */
  destroy(): Promise<void>;
  
  /** 设置事件监听器 */
  on<K extends keyof ConnectionEventMap>(event: K, listener: ConnectionEventMap[K]): this;
  
  /** 移除事件监听器 */
  off<K extends keyof ConnectionEventMap>(event: K, listener: ConnectionEventMap[K]): this;
  
  /** 触发事件 */
  emit<K extends keyof ConnectionEventMap>(event: K, ...args: Parameters<ConnectionEventMap[K]>): boolean;
}