/**
 * Binance 适配器错误处理器
 * 
 * 功能：
 * - 统一错误分类和处理
 * - 错误恢复策略
 * - 错误统计和监控
 * - 智能故障检测
 */

import { EventEmitter } from 'events';
import { ErrorInfo } from './interfaces';
import { 
  AdapterError, 
  ConnectionError, 
  DataParsingError, 
  SubscriptionError,
  PubSubError 
} from '../types';

// 错误等级枚举
export enum ErrorSeverity {
  LOW = 'low',        // 轻微错误，不影响核心功能
  MEDIUM = 'medium',  // 中等错误，可能影响性能
  HIGH = 'high',      // 严重错误，影响核心功能
  CRITICAL = 'critical' // 致命错误，需要立即处理
}

// 错误分类
export enum ErrorCategory {
  CONNECTION = 'connection',     // 连接相关错误
  HEARTBEAT = 'heartbeat',      // 心跳相关错误
  PROTOCOL = 'protocol',        // 协议相关错误
  DATA_PARSING = 'data_parsing', // 数据解析错误
  SUBSCRIPTION = 'subscription', // 订阅管理错误
  PUBSUB = 'pubsub',            // Pub/Sub 错误
  CONFIG = 'config',            // 配置错误
  NETWORK = 'network',          // 网络错误
  AUTHENTICATION = 'authentication', // 认证错误
  RATE_LIMIT = 'rate_limit',    // 限流错误
  UNKNOWN = 'unknown'           // 未知错误
}

// 错误恢复策略
export enum RecoveryStrategy {
  IGNORE = 'ignore',           // 忽略错误
  RETRY = 'retry',             // 重试操作
  RECONNECT = 'reconnect',     // 重新连接
  RESET = 'reset',             // 重置组件
  ESCALATE = 'escalate',       // 上报错误
  CIRCUIT_BREAK = 'circuit_break' // 熔断
}

// 增强的错误信息
export interface EnhancedErrorInfo extends ErrorInfo {
  severity: ErrorSeverity;
  category: ErrorCategory;
  recoveryStrategy: RecoveryStrategy;
  retryCount: number;
  firstOccurred: number;
  lastOccurred: number;
  occurrenceCount: number;
  correlationId?: string;
  stackTrace?: string;
  metadata: Record<string, any>;
}

// 错误统计信息
export interface ErrorStats {
  total: number;
  byCategory: Record<ErrorCategory, number>;
  bySeverity: Record<ErrorSeverity, number>;
  byRecoveryStrategy: Record<RecoveryStrategy, number>;
  recentErrors: EnhancedErrorInfo[];
  errorRate: number; // 每分钟错误数
  criticalErrors: number;
  resolvedErrors: number;
  averageResolutionTime: number;
}

// 错误处理配置
export interface ErrorHandlerConfig {
  maxRecentErrors: number;
  errorRateWindow: number; // 统计窗口 (ms)
  criticalErrorThreshold: number; // 致命错误阈值
  retryLimits: Record<ErrorCategory, number>;
  circuitBreakerThreshold: number;
  alerting: {
    enabled: boolean;
    criticalErrorNotification: boolean;
    errorRateThreshold: number; // 错误率阈值
  };
}

export class ErrorHandler extends EventEmitter {
  private config: ErrorHandlerConfig;
  private errors: Map<string, EnhancedErrorInfo> = new Map();
  private recentErrors: EnhancedErrorInfo[] = [];
  private errorTimestamps: number[] = [];
  private circuitBreakerState = false;
  private circuitBreakerOpenTime = 0;
  private lastAlerts: Map<string, number> = new Map();
  private readonly CIRCUIT_BREAKER_RESET_TIME = 60000; // 1分钟

  constructor(config: ErrorHandlerConfig) {
    super();
    this.config = config;
  }

  /**
   * 处理错误
   */
  public handleError(error: Error | ErrorInfo, context?: Record<string, any>): EnhancedErrorInfo {
    const enhancedError = this.enhanceError(error, context);
    
    // 更新错误记录
    this.updateErrorRecord(enhancedError);
    
    // 更新统计
    this.updateErrorStats(enhancedError);
    
    // 检查熔断器状态
    this.checkCircuitBreaker();
    
    // 发射错误事件
    this.emit('error_handled', enhancedError);
    
    // 执行恢复策略
    this.executeRecoveryStrategy(enhancedError);
    
    return enhancedError;
  }

  /**
   * 增强错误信息
   */
  private enhanceError(error: Error | ErrorInfo, context?: Record<string, any>): EnhancedErrorInfo {
    const timestamp = Date.now();
    let errorInfo: ErrorInfo;

    if (error instanceof Error) {
      errorInfo = {
        timestamp,
        message: error.message,
        code: this.extractErrorCode(error),
        type: this.determineErrorType(error),
        ...(context && { context }),
        fatal: this.isFatalError(error)
      };
    } else {
      errorInfo = { ...error, context: { ...error.context, ...context } };
    }

    // 分类错误
    const category = this.categorizeError(errorInfo);
    const severity = this.determineSeverity(errorInfo, category);
    const recoveryStrategy = this.determineRecoveryStrategy(category, severity);

    // 生成唯一键用于去重和跟踪
    const errorKey = this.generateErrorKey(errorInfo);
    const existingError = this.errors.get(errorKey);

    const enhancedError: EnhancedErrorInfo = {
      ...errorInfo,
      severity,
      category,
      recoveryStrategy,
      retryCount: existingError ? existingError.retryCount + 1 : 0,
      firstOccurred: existingError ? existingError.firstOccurred : timestamp,
      lastOccurred: timestamp,
      occurrenceCount: existingError ? existingError.occurrenceCount + 1 : 1,
      correlationId: this.generateCorrelationId(),
      ...(error instanceof Error && error.stack && { stackTrace: error.stack }),
      metadata: {
        ...context,
        errorKey,
        handledAt: timestamp
      }
    };

    return enhancedError;
  }

  /**
   * 更新错误记录
   */
  private updateErrorRecord(error: EnhancedErrorInfo): void {
    const errorKey = error.metadata?.['errorKey'];
    if (errorKey) {
      this.errors.set(errorKey, error);
    }

    // 添加到最近错误列表
    this.recentErrors.unshift(error);
    if (this.recentErrors.length > this.config.maxRecentErrors) {
      this.recentErrors.splice(this.config.maxRecentErrors);
    }

    // 记录错误时间戳用于计算错误率
    this.errorTimestamps.push(error.timestamp);
    const cutoff = Date.now() - this.config.errorRateWindow;
    this.errorTimestamps = this.errorTimestamps.filter(ts => ts > cutoff);
  }

  /**
   * 更新错误统计
   */
  private updateErrorStats(error: EnhancedErrorInfo): void {
    // 检查是否需要告警
    if (this.config.alerting.enabled) {
      if (error.severity === ErrorSeverity.CRITICAL && this.config.alerting.criticalErrorNotification) {
        this.emit('critical_error', error);
      }

      const errorRate = this.calculateErrorRate();
      const alertKey = 'high_error_rate';
      const now = Date.now();
      const lastAlert = this.lastAlerts.get(alertKey);
      
      if (errorRate > this.config.alerting.errorRateThreshold && 
          (!lastAlert || (now - lastAlert) > 5000)) { // 5秒冷却期
        this.lastAlerts.set(alertKey, now);
        this.emit('high_error_rate', {
          errorRate,
          threshold: this.config.alerting.errorRateThreshold,
          recentErrors: this.recentErrors.slice(0, 10)
        });
      }
    }
  }

  /**
   * 检查熔断器状态
   */
  private checkCircuitBreaker(): void {
    const errorRate = this.calculateErrorRate();
    
    if (!this.circuitBreakerState && errorRate > this.config.circuitBreakerThreshold) {
      this.circuitBreakerState = true;
      this.circuitBreakerOpenTime = Date.now();
      this.emit('circuit_breaker_opened', {
        errorRate,
        threshold: this.config.circuitBreakerThreshold,
        timestamp: Date.now()
      });
    } else if (this.circuitBreakerState) {
      const elapsed = Date.now() - this.circuitBreakerOpenTime;
      if (elapsed > this.CIRCUIT_BREAKER_RESET_TIME && errorRate < this.config.circuitBreakerThreshold / 2) {
        this.circuitBreakerState = false;
        this.emit('circuit_breaker_closed', {
          errorRate,
          downtime: elapsed,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * 执行恢复策略
   */
  private executeRecoveryStrategy(error: EnhancedErrorInfo): void {
    switch (error.recoveryStrategy) {
      case RecoveryStrategy.IGNORE:
        // 仅记录，不采取行动
        break;

      case RecoveryStrategy.RETRY:
        if (error.retryCount < (this.config.retryLimits[error.category] || 3)) {
          this.emit('retry_requested', error);
        } else {
          this.emit('retry_limit_exceeded', error);
        }
        break;

      case RecoveryStrategy.RECONNECT:
        this.emit('reconnect_requested', error);
        break;

      case RecoveryStrategy.RESET:
        this.emit('reset_requested', error);
        break;

      case RecoveryStrategy.ESCALATE:
        this.emit('escalation_requested', error);
        break;

      case RecoveryStrategy.CIRCUIT_BREAK:
        if (!this.circuitBreakerState) {
          this.circuitBreakerState = true;
          this.circuitBreakerOpenTime = Date.now();
          this.emit('circuit_breaker_triggered', error);
        }
        break;
    }
  }

  /**
   * 分类错误
   */
  private categorizeError(error: ErrorInfo): ErrorCategory {
    const message = error.message.toLowerCase();
    const code = error.code?.toLowerCase() || '';

    if (message.includes('connect') || message.includes('connection') || code.includes('conn')) {
      return ErrorCategory.CONNECTION;
    }
    if (message.includes('heartbeat') || message.includes('ping') || message.includes('pong')) {
      return ErrorCategory.HEARTBEAT;
    }
    if (message.includes('parse') || message.includes('json') || message.includes('format')) {
      return ErrorCategory.DATA_PARSING;
    }
    if (message.includes('subscribe') || message.includes('subscription')) {
      return ErrorCategory.SUBSCRIPTION;
    }
    if (message.includes('pubsub') || message.includes('publish')) {
      return ErrorCategory.PUBSUB;
    }
    if (message.includes('config') || message.includes('setting')) {
      return ErrorCategory.CONFIG;
    }
    if (message.includes('network') || message.includes('timeout') || message.includes('dns')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('auth') || message.includes('credential')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('rate') || message.includes('limit') || code === '429') {
      return ErrorCategory.RATE_LIMIT;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * 确定错误严重程度
   */
  private determineSeverity(error: ErrorInfo, category: ErrorCategory): ErrorSeverity {
    if (error.fatal) {
      return ErrorSeverity.CRITICAL;
    }

    switch (category) {
      case ErrorCategory.CONNECTION:
      case ErrorCategory.HEARTBEAT:
        return ErrorSeverity.HIGH;
      
      case ErrorCategory.DATA_PARSING:
      case ErrorCategory.SUBSCRIPTION:
        return ErrorSeverity.MEDIUM;
      
      case ErrorCategory.PUBSUB:
        return ErrorSeverity.HIGH;
      
      case ErrorCategory.RATE_LIMIT:
        return ErrorSeverity.MEDIUM;
      
      case ErrorCategory.CONFIG:
      case ErrorCategory.AUTHENTICATION:
        return ErrorSeverity.CRITICAL;
      
      default:
        return ErrorSeverity.LOW;
    }
  }

  /**
   * 确定恢复策略
   */
  private determineRecoveryStrategy(category: ErrorCategory, severity: ErrorSeverity): RecoveryStrategy {
    if (severity === ErrorSeverity.CRITICAL) {
      return RecoveryStrategy.ESCALATE;
    }

    switch (category) {
      case ErrorCategory.CONNECTION:
      case ErrorCategory.HEARTBEAT:
        return RecoveryStrategy.RECONNECT;
      
      case ErrorCategory.DATA_PARSING:
        return RecoveryStrategy.IGNORE; // 继续处理其他消息
      
      case ErrorCategory.SUBSCRIPTION:
        return RecoveryStrategy.RETRY;
      
      case ErrorCategory.PUBSUB:
        return RecoveryStrategy.RETRY;
      
      case ErrorCategory.RATE_LIMIT:
        return RecoveryStrategy.CIRCUIT_BREAK;
      
      case ErrorCategory.NETWORK:
        return RecoveryStrategy.RETRY;
      
      default:
        return RecoveryStrategy.IGNORE;
    }
  }

  /**
   * 提取错误代码
   */
  private extractErrorCode(error: Error): string {
    if ('code' in error) {
      return (error as any).code;
    }
    if (error instanceof AdapterError) {
      return error.code;
    }
    return 'UNKNOWN';
  }

  /**
   * 确定错误类型
   */
  private determineErrorType(error: Error): ErrorInfo['type'] {
    if (error instanceof ConnectionError) return 'CONNECTION';
    if (error instanceof DataParsingError) return 'DATA';
    if (error instanceof SubscriptionError) return 'PROTOCOL';
    if (error instanceof PubSubError) return 'UNKNOWN';
    return 'UNKNOWN';
  }

  /**
   * 判断是否为致命错误
   */
  private isFatalError(error: Error): boolean {
    const fatalMessages = [
      'authentication failed',
      'invalid api key',
      'configuration error',
      'critical system error'
    ];
    
    return fatalMessages.some(msg => 
      error.message.toLowerCase().includes(msg)
    );
  }

  /**
   * 生成错误键
   */
  private generateErrorKey(error: ErrorInfo): string {
    const key = `${error.code || 'UNKNOWN'}_${error.type}_${error.message.substring(0, 50)}`;
    return Buffer.from(key).toString('base64').substring(0, 32);
  }

  /**
   * 生成关联ID
   */
  private generateCorrelationId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * 计算错误率
   */
  private calculateErrorRate(): number {
    return this.errorTimestamps.length / (this.config.errorRateWindow / 60000); // 每分钟错误数
  }

  /**
   * 获取错误统计
   */
  public getErrorStats(): ErrorStats {
    // 使用recentErrors的长度作为总数，而不是errors map的大小（去重后的）
    const stats: ErrorStats = {
      total: this.recentErrors.length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      byRecoveryStrategy: {} as Record<RecoveryStrategy, number>,
      recentErrors: [...this.recentErrors],
      errorRate: this.calculateErrorRate(),
      criticalErrors: 0,
      resolvedErrors: 0,
      averageResolutionTime: 0
    };

    // 初始化计数器
    Object.values(ErrorCategory).forEach(cat => {
      stats.byCategory[cat] = 0;
    });
    Object.values(ErrorSeverity).forEach(sev => {
      stats.bySeverity[sev] = 0;
    });
    Object.values(RecoveryStrategy).forEach(strat => {
      stats.byRecoveryStrategy[strat] = 0;
    });

    // 统计最近错误
    for (const error of this.recentErrors) {
      stats.byCategory[error.category]++;
      stats.bySeverity[error.severity]++;
      stats.byRecoveryStrategy[error.recoveryStrategy]++;

      if (error.severity === ErrorSeverity.CRITICAL) {
        stats.criticalErrors++;
      }
    }

    return stats;
  }

  /**
   * 清理旧错误记录
   */
  public cleanup(maxAge: number = 3600000): void { // 默认1小时
    const cutoff = Date.now() - maxAge;
    
    // 清理错误记录
    for (const [key, error] of this.errors.entries()) {
      if (error.lastOccurred < cutoff) {
        this.errors.delete(key);
      }
    }

    // 清理最近错误
    this.recentErrors = this.recentErrors.filter(error => error.timestamp > cutoff);

    // 清理时间戳
    this.errorTimestamps = this.errorTimestamps.filter(ts => ts > cutoff);
  }

  /**
   * 重置错误统计
   */
  public reset(): void {
    this.errors.clear();
    this.recentErrors = [];
    this.errorTimestamps = [];
    this.circuitBreakerState = false;
    this.circuitBreakerOpenTime = 0;
  }

  /**
   * 检查熔断器状态
   */
  public isCircuitBreakerOpen(): boolean {
    return this.circuitBreakerState;
  }

  /**
   * 手动打开熔断器
   */
  public openCircuitBreaker(): void {
    this.circuitBreakerState = true;
    this.circuitBreakerOpenTime = Date.now();
    this.emit('circuit_breaker_manual_open', { timestamp: Date.now() });
  }

  /**
   * 手动关闭熔断器
   */
  public closeCircuitBreaker(): void {
    this.circuitBreakerState = false;
    this.emit('circuit_breaker_manual_close', { timestamp: Date.now() });
  }

  /**
   * 获取配置
   */
  public getConfig(): ErrorHandlerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', { config: this.config, timestamp: Date.now() });
  }
}