/**
 * Binance WebSocket 连接管理器核心接口定义
 * 基于官方 ping/pong 规范设计
 */

import { EventEmitter } from 'events';
import { DataSubscription, AdapterStats } from '../types';

// ============================================================================
// 连接状态枚举
// ============================================================================

/**
 * WebSocket 连接状态
 */
export enum ConnectionState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATING = 'authenticating',
  SUBSCRIBING = 'subscribing',
  ACTIVE = 'active',
  HEARTBEAT_FAILED = 'heartbeat_failed',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  TERMINATED = 'terminated'
}

/**
 * 连接事件类型
 */
export enum ConnectionEvent {
  STATE_CHANGED = 'state_changed',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  DATA_RECEIVED = 'data_received',
  ERROR = 'error',
  HEARTBEAT_RECEIVED = 'heartbeat_received',
  HEARTBEAT_TIMEOUT = 'heartbeat_timeout',
  RECONNECT_SCHEDULED = 'reconnect_scheduled',
  HEALTH_CHANGED = 'health_changed'
}

// ============================================================================
// 配置接口
// ============================================================================

/**
 * 连接管理器配置
 */
export interface ConnectionManagerConfig {
  /** 连接池配置 */
  pool: ConnectionPoolConfig;
  
  /** 心跳配置 */
  heartbeat: HeartbeatConfig;
  
  /** 重连配置 */
  reconnect: ReconnectConfig;
  
  /** 监控配置 */
  monitoring: MonitoringConfig;
  
  /** WebSocket 端点 */
  wsEndpoint: string;
}

/**
 * 连接池配置
 */
export interface ConnectionPoolConfig {
  /** 最大连接数 */
  maxConnections: number;
  
  /** 每个连接最大流数 */
  maxStreamsPerConnection: number;
  
  /** 连接超时时间 (ms) */
  connectionTimeout: number;
  
  /** 空闲连接超时时间 (ms) */
  idleTimeout: number;
  
  /** 健康检查间隔 (ms) */
  healthCheckInterval: number;
}

/**
 * 心跳配置 (基于 Binance 官方规范)
 */
export interface HeartbeatConfig {
  /** Ping 超时阈值 (ms) - 超过此时间未收到 ping 视为异常 */
  pingTimeoutThreshold: number;
  
  /** 主动 Pong 发送间隔 (ms) - 可选的主动 pong */
  unsolicitedPongInterval?: number;
  
  /** 心跳健康检查间隔 (ms) */
  healthCheckInterval: number;
  
  /** Pong 响应超时时间 (ms) - 发送 pong 的最大允许时间 */
  pongResponseTimeout: number;
}

/**
 * 重连配置
 */
export interface ReconnectConfig {
  /** 初始重连延迟 (ms) */
  initialDelay: number;
  
  /** 最大重连延迟 (ms) */
  maxDelay: number;
  
  /** 退避倍数 */
  backoffMultiplier: number;
  
  /** 最大重试次数 */
  maxRetries: number;
  
  /** 是否添加随机抖动 */
  jitter: boolean;
  
  /** 重连计数器重置时间 (ms) - 成功连接此时间后重置重试计数 */
  resetAfter: number;
}

/**
 * 监控配置
 */
export interface MonitoringConfig {
  /** 指标更新间隔 (ms) */
  metricsInterval: number;
  
  /** 健康分数阈值 */
  healthScoreThreshold: number;
  
  /** 健康状况下降时是否告警 */
  alertOnHealthDrop: boolean;
  
  /** 延迟分桶配置 (ms) */
  latencyBuckets: number[];
}

// ============================================================================
// 统计和指标接口
// ============================================================================

/**
 * 连接统计信息
 */
export interface ConnectionStats {
  /** 连接 ID */
  connectionId: string;
  
  /** 当前状态 */
  state: ConnectionState;
  
  /** 连接建立时间 */
  connectedAt?: number;
  
  /** 运行时间 (ms) */
  uptime: number;
  
  /** 连接尝试次数 */
  connectionAttempts: number;
  
  /** 成功连接次数 */
  successfulConnections: number;
  
  /** 失败连接次数 */
  failedConnections: number;
  
  /** 重连次数 */
  reconnectAttempts: number;
  
  /** 当前订阅数 */
  activeSubscriptions: number;
  
  /** 最后一次错误 */
  lastError?: ErrorInfo;
}

/**
 * 心跳统计信息 (严格按照官方规范)
 */
export interface HeartbeatStats {
  /** 收到的 ping 次数 */
  pingsReceived: number;
  
  /** 发送的 pong 次数 */
  pongsSent: number;
  
  /** 主动发送的 pong 次数 */
  unsolicitedPongsSent: number;
  
  /** 心跳超时次数 */
  heartbeatTimeouts: number;
  
  /** 最后收到 ping 的时间 */
  lastPingTime?: number;
  
  /** 最后发送 pong 的时间 */
  lastPongTime?: number;
  
  /** 平均 pong 响应时间 (ms) */
  avgPongResponseTime: number;
  
  /** 最大 pong 响应时间 (ms) */
  maxPongResponseTime: number;
  
  /** 当前心跳健康分数 (0-1) */
  healthScore: number;
}

/**
 * 性能统计信息
 */
export interface PerformanceStats {
  /** 接收的消息数 */
  messagesReceived: number;
  
  /** 接收的字节数 */
  bytesReceived: number;
  
  /** 每秒消息数 (当前) */
  messagesPerSecond: number;
  
  /** 每秒字节数 (当前) */
  bytesPerSecond: number;
  
  /** 延迟统计 (ms) */
  latency: {
    current: number;
    average: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  
  /** 延迟分布 */
  latencyDistribution: Record<string, number>;
}

/**
 * 错误信息
 */
export interface ErrorInfo {
  /** 错误时间戳 */
  timestamp: number;
  
  /** 错误消息 */
  message: string;
  
  /** 错误代码 */
  code: string;
  
  /** 错误类型 */
  type: 'CONNECTION' | 'HEARTBEAT' | 'PROTOCOL' | 'DATA' | 'UNKNOWN';
  
  /** 错误上下文 */
  context?: Record<string, any>;
  
  /** 是否致命错误 */
  fatal: boolean;
}

// ============================================================================
// 核心接口定义
// ============================================================================

/**
 * 心跳管理器接口 (严格按照 Binance 官方规范)
 */
export interface IHeartbeatManager {
  /** 处理服务器发送的 ping */
  handlePing(payload: Buffer): void;
  
  /** 发送主动 pong (payload 为空) */
  sendUnsolicitedPong(): void;
  
  /** 检查心跳超时 */
  checkHeartbeatTimeout(): boolean;
  
  /** 获取心跳统计 */
  getStats(): HeartbeatStats;
  
  /** 获取健康分数 */
  getHealthScore(): number;
  
  /** 重置心跳统计 */
  reset(): void;
  
  /** 启动心跳管理 */
  start(): void;
  
  /** 停止心跳管理 */
  stop(): void;
}

/**
 * 重连策略接口
 */
export interface IReconnectStrategy {
  /** 计算下次重连延迟 */
  getNextDelay(): number;
  
  /** 是否应该重连 */
  shouldReconnect(error: ErrorInfo): boolean;
  
  /** 重置重连计数器 */
  reset(): void;
  
  /** 获取重连统计 */
  getStats(): {
    attempts: number;
    lastAttemptTime: number;
    nextRetryTime: number;
    currentDelay: number;
  };
}

/**
 * 单个 WebSocket 连接接口
 */
export interface IBinanceConnection extends EventEmitter {
  /** 连接 ID */
  readonly id: string;
  
  /** 当前状态 */
  readonly state: ConnectionState;
  
  /** 连接到服务器 */
  connect(): Promise<void>;
  
  /** 断开连接 */
  disconnect(reason?: string): Promise<void>;
  
  /** 添加订阅 */
  subscribe(subscriptions: DataSubscription[]): Promise<void>;
  
  /** 移除订阅 */
  unsubscribe(subscriptions: DataSubscription[]): Promise<void>;
  
  /** 获取连接统计 */
  getStats(): ConnectionStats;
  
  /** 获取心跳统计 */
  getHeartbeatStats(): HeartbeatStats;
  
  /** 获取性能统计 */
  getPerformanceStats(): PerformanceStats;
  
  /** 获取健康分数 */
  getHealthScore(): number;
  
  /** 检查连接是否健康 */
  isHealthy(): boolean;
  
  /** 获取当前订阅数 */
  getActiveSubscriptionCount(): number;
  
  /** 检查是否可以添加更多订阅 */
  canAcceptMoreSubscriptions(count: number): boolean;
}

/**
 * 连接池接口
 */
export interface IConnectionPool extends EventEmitter {
  /** 获取可用连接 */
  getAvailableConnection(subscriptionCount: number): Promise<IBinanceConnection>;
  
  /** 创建新连接 */
  createConnection(): Promise<IBinanceConnection>;
  
  /** 移除连接 */
  removeConnection(connectionId: string): Promise<void>;
  
  /** 获取所有连接 */
  getAllConnections(): IBinanceConnection[];
  
  /** 获取健康连接数 */
  getHealthyConnectionCount(): number;
  
  /** 执行健康检查 */
  performHealthCheck(): Promise<void>;
  
  /** 清理空闲连接 */
  cleanupIdleConnections(): Promise<void>;
  
  /** 获取池统计 */
  getPoolStats(): {
    totalConnections: number;
    healthyConnections: number;
    activeConnections: number;
    idleConnections: number;
    totalSubscriptions: number;
  };
}

/**
 * 连接管理器主接口
 */
export interface IConnectionManager extends EventEmitter {
  /** 初始化管理器 */
  initialize(config: ConnectionManagerConfig): Promise<void>;
  
  /** 启动管理器 */
  start(): Promise<void>;
  
  /** 停止管理器 */
  stop(): Promise<void>;
  
  /** 添加订阅 */
  subscribe(subscriptions: DataSubscription[]): Promise<void>;
  
  /** 移除订阅 */
  unsubscribe(subscriptions: DataSubscription[]): Promise<void>;
  
  /** 获取管理器状态 */
  getStatus(): {
    isRunning: boolean;
    connectionCount: number;
    totalSubscriptions: number;
    healthyConnections: number;
    overallHealthScore: number;
  };
  
  /** 获取详细统计 */
  getDetailedStats(): {
    manager: {
      uptime: number;
      totalConnections: number;
      totalSubscriptions: number;
      overallHealthScore: number;
    };
    connections: ConnectionStats[];
    performance: PerformanceStats;
    errors: ErrorInfo[];
  };
  
  /** 强制重连所有连接 */
  forceReconnectAll(): Promise<void>;
  
  /** 执行健康检查 */
  performHealthCheck(): Promise<boolean>;
}

// ============================================================================
// 事件数据接口
// ============================================================================

/**
 * 状态变更事件数据
 */
export interface StateChangeEventData {
  connectionId: string;
  oldState: ConnectionState;
  newState: ConnectionState;
  timestamp: number;
  reason?: string;
}

/**
 * 连接事件数据
 */
export interface ConnectionEventData {
  connectionId: string;
  timestamp: number;
  endpoint: string;
  subscriptions?: DataSubscription[];
}

/**
 * 断开事件数据
 */
export interface DisconnectionEventData {
  connectionId: string;
  timestamp: number;
  reason: string;
  wasExpected: boolean;
  willReconnect: boolean;
  nextReconnectTime?: number;
}

/**
 * 数据接收事件数据
 */
export interface DataReceivedEventData {
  connectionId: string;
  timestamp: number;
  messageSize: number;
  latency: number;
  streamName: string;
  dataType: string;
}

/**
 * 心跳事件数据
 */
export interface HeartbeatEventData {
  connectionId: string;
  timestamp: number;
  pingTime?: number;
  pongTime?: number;
  responseTime?: number;
  payload?: Buffer;
}

/**
 * 健康状况变更事件数据
 */
export interface HealthChangeEventData {
  connectionId: string;
  timestamp: number;
  oldScore: number;
  newScore: number;
  factors: {
    uptime: number;
    latency: number;
    heartbeat: number;
    errors: number;
  };
}