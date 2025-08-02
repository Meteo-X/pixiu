/**
 * Binance 订阅管理器接口定义
 * 
 * 功能:
 * - 构建 Binance 流名称
 * - 管理多流组合订阅
 * - 处理动态订阅/取消订阅
 * - 流的生命周期管理
 */

import { EventEmitter } from 'events';
import { DataSubscription, DataType, KlineInterval } from '../types';

// ============================================================================
// 订阅管理器核心接口
// ============================================================================

/**
 * 订阅管理器主接口
 */
export interface ISubscriptionManager extends EventEmitter {
  /** 初始化订阅管理器 */
  initialize(config: SubscriptionManagerConfig): Promise<void>;

  /** 添加订阅 */
  subscribe(subscriptions: DataSubscription[]): Promise<SubscriptionResult>;

  /** 取消订阅 */
  unsubscribe(subscriptions: DataSubscription[]): Promise<SubscriptionResult>;

  /** 获取当前所有活跃订阅 */
  getActiveSubscriptions(): BinanceStreamSubscription[];

  /** 获取订阅统计信息 */
  getSubscriptionStats(): SubscriptionStats;

  /** 检查订阅是否存在 */
  hasSubscription(subscription: DataSubscription): boolean;

  /** 清空所有订阅 */
  clearAllSubscriptions(): Promise<void>;

  /** 获取指定连接的订阅列表 */
  getSubscriptionsByConnection(connectionId: string): BinanceStreamSubscription[];

  /** 迁移订阅到新连接 */
  migrateSubscriptions(fromConnectionId: string, toConnectionId: string): Promise<void>;
}

/**
 * 流名称构建器接口
 */
export interface IStreamNameBuilder {
  /** 构建单个流名称 */
  buildStreamName(subscription: DataSubscription): string;

  /** 构建组合流 URL */
  buildCombinedStreamUrl(streamNames: string[], baseUrl: string): string;

  /** 解析流名称，返回订阅信息 */
  parseStreamName(streamName: string): DataSubscription | null;

  /** 验证流名称格式 */
  validateStreamName(streamName: string): boolean;

  /** 获取支持的数据类型 */
  getSupportedDataTypes(): DataType[];
}

// ============================================================================
// 配置接口
// ============================================================================

/**
 * 订阅管理器配置
 */
export interface SubscriptionManagerConfig {
  /** 基础 WebSocket URL */
  baseWsUrl: string;

  /** 每个连接最大流数量 */
  maxStreamsPerConnection: number;

  /** 订阅超时时间 (ms) */
  subscriptionTimeout: number;

  /** 是否启用自动重新订阅 */
  autoResubscribe: boolean;

  /** 订阅失败重试配置 */
  retryConfig: SubscriptionRetryConfig;

  /** 流名称验证配置 */
  validation: StreamValidationConfig;
}

/**
 * 订阅重试配置
 */
export interface SubscriptionRetryConfig {
  /** 最大重试次数 */
  maxRetries: number;

  /** 初始重试延迟 (ms) */
  initialDelay: number;

  /** 最大重试延迟 (ms) */
  maxDelay: number;

  /** 退避倍数 */
  backoffMultiplier: number;

  /** 是否使用抖动 */
  jitter: boolean;
}

/**
 * 流验证配置
 */
export interface StreamValidationConfig {
  /** 是否启用严格验证 */
  strictValidation: boolean;

  /** 支持的交易对格式 */
  symbolPattern: RegExp;

  /** 最大订阅数量 */
  maxSubscriptions: number;

  /** 禁用的数据类型 */
  disabledDataTypes: DataType[];
}

// ============================================================================
// 数据结构
// ============================================================================

/**
 * Binance 流订阅信息
 */
export interface BinanceStreamSubscription {
  /** 原始订阅请求 */
  original: DataSubscription;

  /** Binance 流名称 */
  streamName: string;

  /** 所属连接 ID */
  connectionId: string;

  /** 订阅状态 */
  status: SubscriptionStatus;

  /** 订阅时间 */
  subscribedAt: number;

  /** 最后活跃时间 */
  lastActiveAt: number;

  /** 接收到的消息数 */
  messageCount: number;

  /** 错误次数 */
  errorCount: number;

  /** 最后错误信息 */
  lastError?: SubscriptionError;
}

/**
 * 订阅状态枚举
 */
export enum SubscriptionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  PAUSED = 'paused',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * 订阅操作结果
 */
export interface SubscriptionResult {
  /** 操作是否成功 */
  success: boolean;

  /** 成功的订阅 */
  successful: BinanceStreamSubscription[];

  /** 失败的订阅 */
  failed: SubscriptionFailure[];

  /** 已存在的订阅 */
  existing: BinanceStreamSubscription[];

  /** 操作摘要 */
  summary: {
    total: number;
    successful: number;
    failed: number;
    existing: number;
  };
}

/**
 * 订阅失败信息
 */
export interface SubscriptionFailure {
  /** 原始订阅请求 */
  subscription: DataSubscription;

  /** 错误信息 */
  error: SubscriptionError;

  /** 重试次数 */
  retryCount: number;
}

/**
 * 订阅错误
 */
export interface SubscriptionError {
  /** 错误代码 */
  code: SubscriptionErrorCode;

  /** 错误消息 */
  message: string;

  /** 错误时间 */
  timestamp: number;

  /** 错误上下文 */
  context?: Record<string, any>;

  /** 是否可重试 */
  retryable: boolean;
}

/**
 * 订阅错误代码
 */
export enum SubscriptionErrorCode {
  INVALID_STREAM_NAME = 'INVALID_STREAM_NAME',
  UNSUPPORTED_DATA_TYPE = 'UNSUPPORTED_DATA_TYPE',
  SYMBOL_NOT_FOUND = 'SYMBOL_NOT_FOUND',
  CONNECTION_NOT_AVAILABLE = 'CONNECTION_NOT_AVAILABLE',
  MAX_STREAMS_EXCEEDED = 'MAX_STREAMS_EXCEEDED',
  SUBSCRIPTION_TIMEOUT = 'SUBSCRIPTION_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 订阅统计信息
 */
export interface SubscriptionStats {
  /** 总订阅数 */
  total: number;

  /** 按状态分组 */
  byStatus: Record<SubscriptionStatus, number>;

  /** 按数据类型分组 */
  byDataType: Record<string, number>;

  /** 按交易对分组 */
  bySymbol: Record<string, number>;

  /** 按连接分组 */
  byConnection: Record<string, number>;

  /** 平均消息率 */
  averageMessageRate: number;

  /** 错误率 */
  errorRate: number;

  /** 最后更新时间 */
  lastUpdated: number;
}

// ============================================================================
// 事件定义
// ============================================================================

/**
 * 订阅管理器事件
 */
export enum SubscriptionEvent {
  /** 订阅添加 */
  SUBSCRIPTION_ADDED = 'subscription_added',

  /** 订阅移除 */
  SUBSCRIPTION_REMOVED = 'subscription_removed',

  /** 订阅状态变更 */
  SUBSCRIPTION_STATUS_CHANGED = 'subscription_status_changed',

  /** 流数据接收 */
  STREAM_DATA_RECEIVED = 'stream_data_received',

  /** 订阅错误 */
  SUBSCRIPTION_ERROR = 'subscription_error',

  /** 连接变更 */
  CONNECTION_CHANGED = 'connection_changed',

  /** 统计更新 */
  STATS_UPDATED = 'stats_updated'
}

/**
 * 事件数据类型
 */
export interface SubscriptionEventData {
  subscriptionAdded: {
    subscription: BinanceStreamSubscription;
    connectionId: string;
  };

  subscriptionRemoved: {
    subscription: BinanceStreamSubscription;
    reason: string;
  };

  subscriptionStatusChanged: {
    subscription: BinanceStreamSubscription;
    oldStatus: SubscriptionStatus;
    newStatus: SubscriptionStatus;
    reason?: string;
  };

  streamDataReceived: {
    streamName: string;
    data: any;
    messageCount: number;
    connectionId: string;
  };

  subscriptionError: {
    subscription: DataSubscription;
    error: SubscriptionError;
    connectionId?: string;
  };

  connectionChanged: {
    subscriptions: BinanceStreamSubscription[];
    oldConnectionId: string;
    newConnectionId: string;
  };

  statsUpdated: {
    stats: SubscriptionStats;
    timestamp: number;
  };
}

// ============================================================================
// Binance 特定类型
// ============================================================================

/**
 * Binance 流类型映射
 */
export const BINANCE_STREAM_TYPES = {
  [DataType.TRADE]: 'trade',
  [DataType.TICKER]: '24hrTicker',
  [DataType.DEPTH]: 'depth',
  [DataType.KLINE_1M]: 'kline_1m',
  [DataType.KLINE_5M]: 'kline_5m',
  [DataType.KLINE_15M]: 'kline_15m',
  [DataType.KLINE_30M]: 'kline_30m',
  [DataType.KLINE_1H]: 'kline_1h',
  [DataType.KLINE_4H]: 'kline_4h',
  [DataType.KLINE_1D]: 'kline_1d'
} as const;

/**
 * Binance K线间隔映射
 */
export const BINANCE_KLINE_INTERVALS: Record<DataType, KlineInterval> = {
  [DataType.KLINE_1M]: '1m',
  [DataType.KLINE_5M]: '5m',
  [DataType.KLINE_15M]: '15m',
  [DataType.KLINE_30M]: '30m',
  [DataType.KLINE_1H]: '1h',
  [DataType.KLINE_4H]: '4h',
  [DataType.KLINE_1D]: '1d'
} as any;

/**
 * 流名称构建选项
 */
export interface StreamNameBuildOptions {
  /** 强制小写 */
  forceLowercase?: boolean;

  /** 符号分隔符 */
  symbolSeparator?: string;

  /** 参数分隔符 */
  paramSeparator?: string;

  /** 是否验证格式 */
  validate?: boolean;
}

/**
 * 组合流配置
 */
export interface CombinedStreamConfig {
  /** 流名称列表 */
  streams: string[];

  /** 最大流数量 */
  maxStreams?: number;

  /** URL 编码选项 */
  encoding?: {
    encodeURI?: boolean;
    encodeComponent?: boolean;
  };
}