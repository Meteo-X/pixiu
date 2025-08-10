/**
 * 数据流管理系统核心接口定义
 */

import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor } from '@pixiu/shared-core';

/**
 * 输出通道接口
 */
export interface OutputChannel {
  /** 通道唯一标识 */
  id: string;
  /** 通道名称 */
  name: string;
  /** 通道类型 */
  type: 'pubsub' | 'websocket' | 'cache' | 'custom';
  /** 是否启用 */
  enabled: boolean;
  /** 输出数据到通道 */
  output(data: MarketData, metadata?: Record<string, any>): Promise<void>;
  /** 关闭通道 */
  close(): Promise<void>;
  /** 获取通道状态 */
  getStatus(): ChannelStatus;
}

/**
 * 通道状态
 */
export interface ChannelStatus {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  connected: boolean;
  messagesSent: number;
  errors: number;
  lastActivity: number;
  health: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * 消息路由规则接口
 */
export interface RoutingRule {
  /** 规则名称 */
  name: string;
  /** 匹配条件 */
  condition: (data: MarketData) => boolean;
  /** 目标通道ID列表 */
  targetChannels: string[];
  /** 数据转换函数 */
  transform?: (data: MarketData) => MarketData;
  /** 是否启用 */
  enabled: boolean;
  /** 优先级（数字越大优先级越高） */
  priority: number;
}

/**
 * 数据流配置
 */
export interface DataFlowConfig {
  /** 全局启用状态 */
  enabled: boolean;
  /** 批处理配置 */
  batching: {
    enabled: boolean;
    batchSize: number;
    flushTimeout: number;
  };
  /** 性能配置 */
  performance: {
    maxQueueSize: number;
    processingTimeout: number;
    enableBackpressure: boolean;
    backpressureThreshold: number;
  };
  /** 监控配置 */
  monitoring: {
    enableMetrics: boolean;
    metricsInterval: number;
    enableLatencyTracking: boolean;
  };
  /** 错误处理配置 */
  errorHandling: {
    retryCount: number;
    retryDelay: number;
    enableCircuitBreaker: boolean;
    circuitBreakerThreshold: number;
  };
}

/**
 * 数据转换器接口
 */
export interface DataTransformer {
  /** 转换器名称 */
  name: string;
  /** 转换数据 */
  transform(data: MarketData, context?: any): Promise<MarketData>;
  /** 验证数据 */
  validate(data: MarketData): boolean;
  /** 获取转换器统计信息 */
  getStats(): TransformerStats;
}

/**
 * 转换器统计信息
 */
export interface TransformerStats {
  transformedCount: number;
  errorCount: number;
  averageLatency: number;
  lastActivity: number;
}

/**
 * 数据流管理器接口
 */
export interface IDataFlowManager {
  /** 初始化数据流管理器 */
  initialize(config: DataFlowConfig, monitor: BaseMonitor): Promise<void>;
  
  /** 注册输出通道 */
  registerChannel(channel: OutputChannel): void;
  
  /** 注销输出通道 */
  unregisterChannel(channelId: string): void;
  
  /** 添加路由规则 */
  addRoutingRule(rule: RoutingRule): void;
  
  /** 移除路由规则 */
  removeRoutingRule(ruleName: string): void;
  
  /** 注册数据转换器 */
  registerTransformer(transformer: DataTransformer): void;
  
  /** 处理市场数据 */
  processData(data: MarketData, source?: string): Promise<void>;
  
  /** 获取数据流统计信息 */
  getStats(): DataFlowStats;
  
  /** 获取所有通道状态 */
  getChannelStatuses(): ChannelStatus[];
  
  /** 启动数据流管理器 */
  start(): void;
  
  /** 停止数据流管理器 */
  stop(): Promise<void>;
}

/**
 * 数据流统计信息
 */
export interface DataFlowStats {
  /** 处理的消息总数 */
  totalProcessed: number;
  /** 成功发送的消息数 */
  totalSent: number;
  /** 错误数 */
  totalErrors: number;
  /** 平均处理延迟 */
  averageLatency: number;
  /** 队列大小 */
  currentQueueSize: number;
  /** 背压状态 */
  backpressureActive: boolean;
  /** 活跃通道数 */
  activeChannels: number;
  /** 路由规则数 */
  routingRules: number;
  /** 最后处理时间 */
  lastActivity: number;
}

/**
 * 数据流事件类型
 */
export interface DataFlowEvents {
  'dataProcessed': (data: MarketData, stats: DataFlowStats) => void;
  'channelError': (channelId: string, error: Error) => void;
  'backpressureActivated': (queueSize: number) => void;
  'backpressureDeactivated': (queueSize: number) => void;
  'routingRuleMatched': (ruleName: string, data: MarketData) => void;
  'statsUpdated': (stats: DataFlowStats) => void;
}