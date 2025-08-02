/**
 * 错误处理核心类型定义
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  CONNECTION = 'connection',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  CONFIGURATION = 'configuration',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  DATA_PARSING = 'data_parsing',
  BUSINESS_LOGIC = 'business_logic',
  EXTERNAL_API = 'external_api',
  DATABASE = 'database',
  PUBSUB = 'pubsub',
  UNKNOWN = 'unknown'
}

export enum RecoveryStrategy {
  IGNORE = 'ignore',
  RETRY = 'retry',
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  RECONNECT = 'reconnect',
  RESET_COMPONENT = 'reset_component',
  ESCALATE = 'escalate',
  CIRCUIT_BREAK = 'circuit_break',
  FALLBACK = 'fallback'
}

export interface ErrorContext {
  /** 组件名称 */
  component: string;
  /** 操作名称 */
  operation: string;
  /** 错误发生时间 */
  timestamp: number;
  /** 相关数据 */
  data?: Record<string, any>;
  /** 用户会话ID */
  sessionId?: string;
  /** 请求ID */
  requestId?: string;
  /** 追踪ID */
  traceId?: string;
}

export interface ErrorMetadata {
  /** 错误严重程度 */
  severity: ErrorSeverity;
  /** 错误分类 */
  category: ErrorCategory;
  /** 恢复策略 */
  recoveryStrategy: RecoveryStrategy;
  /** 是否可重试 */
  retryable: boolean;
  /** 重试次数 */
  retryCount?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 首次发生时间 */
  firstOccurred?: number;
  /** 最后发生时间 */
  lastOccurred?: number;
  /** 发生次数 */
  occurrenceCount?: number;
  /** 是否需要告警 */
  alertRequired?: boolean;
  /** 预期恢复时间 */
  expectedRecoveryTime?: number;
}

export interface BaseError extends Error {
  /** 错误代码 */
  code: string;
  /** 错误元数据 */
  metadata: ErrorMetadata;
  /** 错误上下文 */
  context: ErrorContext;
  /** 原始错误 */
  originalError?: Error;
  /** 错误堆栈增强信息 */
  enhancedStack?: string;
}

export interface ErrorHandlerOptions {
  /** 是否启用自动重试 */
  enableAutoRetry?: boolean;
  /** 默认重试次数 */
  defaultMaxRetries?: number;
  /** 重试间隔（毫秒） */
  retryInterval?: number;
  /** 是否启用熔断 */
  enableCircuitBreaker?: boolean;
  /** 熔断阈值 */
  circuitBreakerThreshold?: number;
  /** 是否启用告警 */
  enableAlerting?: boolean;
  /** 是否记录错误日志 */
  enableLogging?: boolean;
  /** 日志级别 */
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface ErrorRecoveryResult {
  /** 是否恢复成功 */
  success: boolean;
  /** 恢复策略 */
  strategy: RecoveryStrategy;
  /** 恢复耗时（毫秒） */
  recoveryTime: number;
  /** 恢复后的数据 */
  recoveredData?: any;
  /** 恢复过程中的错误 */
  recoveryError?: Error;
  /** 是否需要进一步处理 */
  requiresFurtherAction?: boolean;
}

export interface ErrorStatistics {
  /** 总错误数 */
  totalErrors: number;
  /** 按严重程度统计 */
  bySeverity: Record<ErrorSeverity, number>;
  /** 按分类统计 */
  byCategory: Record<ErrorCategory, number>;
  /** 按组件统计 */
  byComponent: Record<string, number>;
  /** 恢复成功率 */
  recoverySuccessRate: number;
  /** 平均恢复时间 */
  averageRecoveryTime: number;
  /** 统计时间窗口 */
  timeWindow: {
    start: number;
    end: number;
  };
}

export type ErrorHandler = (error: BaseError) => Promise<ErrorRecoveryResult>;

export type ErrorFilter = (error: BaseError) => boolean;

export type ErrorTransformer = (error: Error, context: ErrorContext) => BaseError;