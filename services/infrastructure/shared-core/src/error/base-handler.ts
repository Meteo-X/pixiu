/**
 * 错误处理器基类
 * 提供统一的错误处理、恢复和监控功能
 */

import { EventEmitter } from 'events';
import {
  BaseError,
  ErrorSeverity,
  ErrorCategory,
  RecoveryStrategy,
  ErrorContext,
  ErrorMetadata,
  ErrorHandlerOptions,
  ErrorRecoveryResult,
  ErrorStatistics,
  ErrorHandler,
  ErrorFilter,
  ErrorTransformer
} from './types';

export class BaseErrorHandler extends EventEmitter {
  private handlers: Map<string, ErrorHandler> = new Map();
  private filters: ErrorFilter[] = [];
  private transformers: ErrorTransformer[] = [];
  private statistics: Map<string, any> = new Map();
  private circuitBreakers: Map<string, { failures: number; lastFailure: number; state: 'closed' | 'open' | 'half-open' }> = new Map();

  constructor(private options: ErrorHandlerOptions = {}) {
    super();
    this.options = {
      enableAutoRetry: true,
      defaultMaxRetries: 3,
      retryInterval: 1000,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      enableAlerting: true,
      enableLogging: true,
      logLevel: 'error',
      ...options
    };
  }

  /**
   * 处理错误
   */
  async handleError(error: Error, context: ErrorContext): Promise<ErrorRecoveryResult> {
    try {
      // 转换为标准错误格式
      const baseError = this.transformError(error, context);

      // 应用过滤器
      if (!this.shouldHandle(baseError)) {
        return {
          success: false,
          strategy: RecoveryStrategy.IGNORE,
          recoveryTime: 0
        };
      }

      // 记录错误统计
      this.recordError(baseError);

      // 检查熔断器状态
      if (this.isCircuitOpen(baseError)) {
        return {
          success: false,
          strategy: RecoveryStrategy.CIRCUIT_BREAK,
          recoveryTime: 0
        };
      }

      // 发出错误事件
      this.emit('error', baseError);

      // 执行恢复策略
      const result = await this.executeRecovery(baseError);

      // 更新熔断器状态
      this.updateCircuitBreaker(baseError, result.success);

      // 发出恢复结果事件
      this.emit('recovery', { error: baseError, result });

      return result;
    } catch (handlingError) {
      this.emit('handlingError', { originalError: error, handlingError });
      return {
        success: false,
        strategy: RecoveryStrategy.ESCALATE,
        recoveryTime: 0,
        recoveryError: handlingError as Error
      };
    }
  }

  /**
   * 注册错误处理器
   */
  registerHandler(pattern: string, handler: ErrorHandler): void {
    this.handlers.set(pattern, handler);
  }

  /**
   * 添加错误过滤器
   */
  addFilter(filter: ErrorFilter): void {
    this.filters.push(filter);
  }

  /**
   * 添加错误转换器
   */
  addTransformer(transformer: ErrorTransformer): void {
    this.transformers.push(transformer);
  }

  /**
   * 获取错误统计
   */
  getStatistics(timeWindow?: { start: number; end: number }): ErrorStatistics {
    // 实现错误统计逻辑
    const now = Date.now();
    const windowStart = timeWindow?.start || (now - 3600000); // 默认1小时
    const windowEnd = timeWindow?.end || now;

    return {
      totalErrors: 0,
      bySeverity: {
        [ErrorSeverity.LOW]: 0,
        [ErrorSeverity.MEDIUM]: 0,
        [ErrorSeverity.HIGH]: 0,
        [ErrorSeverity.CRITICAL]: 0
      },
      byCategory: Object.values(ErrorCategory).reduce((acc, cat) => {
        acc[cat] = 0;
        return acc;
      }, {} as Record<ErrorCategory, number>),
      byComponent: {},
      recoverySuccessRate: 0,
      averageRecoveryTime: 0,
      timeWindow: { start: windowStart, end: windowEnd }
    };
  }

  /**
   * 重置统计
   */
  resetStatistics(): void {
    this.statistics.clear();
  }

  /**
   * 转换错误为标准格式
   */
  private transformError(error: Error, context: ErrorContext): BaseError {
    // 如果已经是BaseError，直接返回
    if (this.isBaseError(error)) {
      return error as BaseError;
    }

    // 应用转换器
    for (const transformer of this.transformers) {
      const transformed = transformer(error, context);
      if (transformed) {
        return transformed;
      }
    }

    // 默认转换逻辑
    const metadata: ErrorMetadata = {
      severity: this.inferSeverity(error),
      category: this.inferCategory(error),
      recoveryStrategy: this.inferRecoveryStrategy(error),
      retryable: this.isRetryable(error),
      firstOccurred: Date.now(),
      lastOccurred: Date.now(),
      occurrenceCount: 1,
      alertRequired: true
    };

    const baseError: BaseError = {
      name: error.name,
      message: error.message,
      code: this.generateErrorCode(error, context),
      metadata,
      context,
      originalError: error,
      stack: error.stack
    };

    return baseError;
  }

  /**
   * 检查是否应该处理此错误
   */
  private shouldHandle(error: BaseError): boolean {
    return this.filters.every(filter => filter(error));
  }

  /**
   * 记录错误统计
   */
  private recordError(error: BaseError): void {
    const key = `${error.context.component}:${error.metadata.category}`;
    const stats = this.statistics.get(key) || {
      count: 0,
      lastOccurred: 0,
      severity: error.metadata.severity
    };

    stats.count++;
    stats.lastOccurred = Date.now();
    this.statistics.set(key, stats);
  }

  /**
   * 检查熔断器是否开启
   */
  private isCircuitOpen(error: BaseError): boolean {
    if (!this.options.enableCircuitBreaker) {
      return false;
    }

    const key = `${error.context.component}:${error.context.operation}`;
    const breaker = this.circuitBreakers.get(key);

    if (!breaker) {
      return false;
    }

    return breaker.state === 'open' && 
           (Date.now() - breaker.lastFailure) < 60000; // 1分钟熔断时间
  }

  /**
   * 更新熔断器状态
   */
  private updateCircuitBreaker(error: BaseError, success: boolean): void {
    if (!this.options.enableCircuitBreaker) {
      return;
    }

    const key = `${error.context.component}:${error.context.operation}`;
    let breaker = this.circuitBreakers.get(key);

    if (!breaker) {
      breaker = { failures: 0, lastFailure: 0, state: 'closed' };
      this.circuitBreakers.set(key, breaker);
    }

    if (success) {
      breaker.failures = 0;
      breaker.state = 'closed';
    } else {
      breaker.failures++;
      breaker.lastFailure = Date.now();
      
      if (breaker.failures >= (this.options.circuitBreakerThreshold || 5)) {
        breaker.state = 'open';
      }
    }
  }

  /**
   * 执行恢复策略
   */
  private async executeRecovery(error: BaseError): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();
    const strategy = error.metadata.recoveryStrategy;

    try {
      // 查找特定的处理器
      const handler = this.findHandler(error);
      if (handler) {
        const result = await handler(error);
        return {
          ...result,
          recoveryTime: Date.now() - startTime
        };
      }

      // 使用默认恢复策略
      return this.executeDefaultRecovery(error, startTime);
    } catch (recoveryError) {
      return {
        success: false,
        strategy,
        recoveryTime: Date.now() - startTime,
        recoveryError: recoveryError as Error
      };
    }
  }

  /**
   * 执行默认恢复策略
   */
  private async executeDefaultRecovery(error: BaseError, startTime: number): Promise<ErrorRecoveryResult> {
    const strategy = error.metadata.recoveryStrategy;

    switch (strategy) {
      case RecoveryStrategy.IGNORE:
        return {
          success: true,
          strategy,
          recoveryTime: Date.now() - startTime
        };

      case RecoveryStrategy.RETRY:
        if (error.metadata.retryable && 
            (error.metadata.retryCount || 0) < (error.metadata.maxRetries || this.options.defaultMaxRetries || 3)) {
          // 实现重试逻辑
          await this.delay(this.options.retryInterval || 1000);
          return {
            success: true,
            strategy,
            recoveryTime: Date.now() - startTime,
            requiresFurtherAction: true
          };
        }
        break;

      case RecoveryStrategy.ESCALATE:
        this.emit('escalate', error);
        return {
          success: false,
          strategy,
          recoveryTime: Date.now() - startTime,
          requiresFurtherAction: true
        };

      default:
        return {
          success: false,
          strategy,
          recoveryTime: Date.now() - startTime
        };
    }

    return {
      success: false,
      strategy,
      recoveryTime: Date.now() - startTime
    };
  }

  /**
   * 查找匹配的错误处理器
   */
  private findHandler(error: BaseError): ErrorHandler | undefined {
    for (const [pattern, handler] of this.handlers) {
      if (this.matchesPattern(error, pattern)) {
        return handler;
      }
    }
    return undefined;
  }

  /**
   * 检查错误是否匹配模式
   */
  private matchesPattern(error: BaseError, pattern: string): boolean {
    // 实现模式匹配逻辑
    return pattern === '*' || 
           pattern === error.code ||
           pattern === error.metadata.category ||
           pattern === `${error.context.component}:${error.metadata.category}`;
  }

  // 辅助方法
  private isBaseError(error: any): boolean {
    return error && typeof error === 'object' && 'metadata' in error && 'context' in error;
  }

  private inferSeverity(error: Error): ErrorSeverity {
    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      return ErrorSeverity.HIGH;
    }
    if (error.message.toLowerCase().includes('timeout')) {
      return ErrorSeverity.MEDIUM;
    }
    return ErrorSeverity.LOW;
  }

  private inferCategory(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    
    if (message.includes('connection') || message.includes('connect')) {
      return ErrorCategory.CONNECTION;
    }
    if (message.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }
    if (message.includes('auth')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('network')) {
      return ErrorCategory.NETWORK;
    }
    
    return ErrorCategory.UNKNOWN;
  }

  private inferRecoveryStrategy(error: Error): RecoveryStrategy {
    const category = this.inferCategory(error);
    
    switch (category) {
      case ErrorCategory.CONNECTION:
      case ErrorCategory.NETWORK:
        return RecoveryStrategy.RETRY_WITH_BACKOFF;
      case ErrorCategory.TIMEOUT:
        return RecoveryStrategy.RETRY;
      case ErrorCategory.AUTHENTICATION:
        return RecoveryStrategy.ESCALATE;
      default:
        return RecoveryStrategy.IGNORE;
    }
  }

  private isRetryable(error: Error): boolean {
    const category = this.inferCategory(error);
    return [
      ErrorCategory.CONNECTION,
      ErrorCategory.NETWORK,
      ErrorCategory.TIMEOUT
    ].includes(category);
  }

  private generateErrorCode(error: Error, context: ErrorContext): string {
    return `${context.component.toUpperCase()}_${error.name.toUpperCase()}_${Date.now().toString(36)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}