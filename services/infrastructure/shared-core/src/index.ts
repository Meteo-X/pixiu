/**
 * Pixiu Shared Core Library
 * 量化交易系统核心共享库
 */

// 配置管理
export * from './config/types';
export * from './config/base-manager';
export * from './config/unified-config-manager';
export * from './config/config-constants';
export * from './config/env-utils';

// 错误处理
export {
  ErrorSeverity,
  ErrorCategory,
  RecoveryStrategy,
  type ErrorContext,
  type ErrorMetadata,
  type BaseError,
  type ErrorHandlerOptions,
  type ErrorRecoveryResult,
  type ErrorStatistics,
  type ErrorHandler as ErrorHandlerType,
  type ErrorFilter,
  type ErrorTransformer
} from './error/types';
export { BaseErrorHandler } from './error/base-handler';

// 监控系统
export * from './monitoring/types';
export * from './monitoring/base-monitor';

// Pub/Sub消息系统
export * from './pubsub/types';
export * from './pubsub/client';

// 通用工具
export * from './utils/retry';
export * from './utils/cache';

// 版本信息
export const VERSION = '1.0.0';