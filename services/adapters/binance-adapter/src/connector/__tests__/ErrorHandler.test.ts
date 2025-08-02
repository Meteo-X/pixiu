/**
 * ErrorHandler 单元测试
 */

import { ErrorHandler, ErrorSeverity, ErrorCategory, RecoveryStrategy } from '../ErrorHandler';
import { ConnectionError, DataParsingError } from '../../types';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  const mockConfig = {
    maxRecentErrors: 10,
    errorRateWindow: 60000,
    criticalErrorThreshold: 5,
    retryLimits: {
      connection: 3,
      heartbeat: 2,
      protocol: 3,
      data_parsing: 0,
      subscription: 3,
      pubsub: 3,
      config: 0,
      network: 5,
      authentication: 1,
      rate_limit: 0,
      unknown: 1
    },
    circuitBreakerThreshold: 10,
    alerting: {
      enabled: true,
      criticalErrorNotification: true,
      errorRateThreshold: 5
    }
  };

  beforeEach(() => {
    errorHandler = new ErrorHandler(mockConfig);
  });

  afterEach(() => {
    errorHandler.removeAllListeners();
  });

  describe('Error Classification', () => {
    test('should correctly categorize connection errors', () => {
      const error = new ConnectionError('Connection failed');
      const enhancedError = errorHandler.handleError(error);
      
      expect(enhancedError.category).toBe(ErrorCategory.CONNECTION);
      expect(enhancedError.severity).toBe(ErrorSeverity.HIGH);
      expect(enhancedError.recoveryStrategy).toBe(RecoveryStrategy.RECONNECT);
    });

    test('should correctly categorize data parsing errors', () => {
      const error = new DataParsingError('Invalid JSON format');
      const enhancedError = errorHandler.handleError(error);
      
      expect(enhancedError.category).toBe(ErrorCategory.DATA_PARSING);
      expect(enhancedError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(enhancedError.recoveryStrategy).toBe(RecoveryStrategy.IGNORE);
    });

    test('should categorize unknown errors correctly', () => {
      const error = new Error('Some random error');
      const enhancedError = errorHandler.handleError(error);
      
      expect(enhancedError.category).toBe(ErrorCategory.UNKNOWN);
      expect(enhancedError.severity).toBe(ErrorSeverity.LOW);
    });

    test('should identify fatal errors', () => {
      const error = new Error('Authentication failed');
      const enhancedError = errorHandler.handleError(error);
      
      expect(enhancedError.fatal).toBe(true);
      expect(enhancedError.severity).toBe(ErrorSeverity.CRITICAL);
    });
  });

  describe('Error Statistics', () => {
    test('should track error counts correctly', () => {
      errorHandler.handleError(new ConnectionError('Connection error 1'));
      errorHandler.handleError(new ConnectionError('Connection error 2'));
      errorHandler.handleError(new DataParsingError('Parse error'));
      
      const stats = errorHandler.getErrorStats();
      
      expect(stats.total).toBe(3);
      expect(stats.byCategory[ErrorCategory.CONNECTION]).toBe(2);
      expect(stats.byCategory[ErrorCategory.DATA_PARSING]).toBe(1);
    });

    test('should calculate error rate correctly', () => {
      // 添加多个错误
      for (let i = 0; i < 5; i++) {
        errorHandler.handleError(new Error(`Error ${i}`));
      }
      
      const stats = errorHandler.getErrorStats();
      expect(stats.errorRate).toBeGreaterThan(0);
    });

    test('should maintain recent errors list', () => {
      // 添加超过最大数量的错误
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`Error ${i}`));
      }
      
      const stats = errorHandler.getErrorStats();
      expect(stats.recentErrors.length).toBeLessThanOrEqual(mockConfig.maxRecentErrors);
    });
  });

  describe('Recovery Strategies', () => {
    test('should emit retry events for retryable errors', (done) => {
      errorHandler.on('retry_requested', (error) => {
        expect(error.category).toBe(ErrorCategory.SUBSCRIPTION);
        expect(error.retryCount).toBe(0);
        done();
      });

      const error = new Error('subscription failed');
      errorHandler.handleError(error);
    });

    test('should emit reconnect events for connection errors', (done) => {
      errorHandler.on('reconnect_requested', (error) => {
        expect(error.category).toBe(ErrorCategory.CONNECTION);
        done();
      });

      errorHandler.handleError(new ConnectionError('Connection lost'));
    });

    test('should respect retry limits', () => {
      const retryEvents: any[] = [];
      const limitExceededEvents: any[] = [];
      
      errorHandler.on('retry_requested', (error) => retryEvents.push(error));
      errorHandler.on('retry_limit_exceeded', (error) => limitExceededEvents.push(error));

      // 添加多个相同的错误
      const error = new Error('subscription timeout');
      for (let i = 0; i < 5; i++) {
        errorHandler.handleError(error);
      }

      // 前3次应该请求重试，第4次开始应该超过限制
      expect(retryEvents.length).toBe(3);
      expect(limitExceededEvents.length).toBe(2);
    });
  });

  describe('Circuit Breaker', () => {
    test('should open circuit breaker when error rate is high', (done) => {
      errorHandler.on('circuit_breaker_opened', (data) => {
        expect(data.errorRate).toBeGreaterThan(mockConfig.circuitBreakerThreshold);
        done();
      });

      // 快速添加大量错误以触发熔断器
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`High frequency error ${i}`));
      }
    });

    test('should close circuit breaker after recovery period', (done) => {
      // 先触发熔断器
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`Error ${i}`));
      }

      expect(errorHandler.isCircuitBreakerOpen()).toBe(true);

      // 手动关闭熔断器来测试事件
      errorHandler.on('circuit_breaker_manual_close', () => {
        expect(errorHandler.isCircuitBreakerOpen()).toBe(false);
        done();
      });

      errorHandler.closeCircuitBreaker();
    });
  });

  describe('Critical Error Handling', () => {
    test('should emit critical error events', (done) => {
      errorHandler.on('critical_error', (error) => {
        expect(error.severity).toBe(ErrorSeverity.CRITICAL);
        done();
      });

      errorHandler.handleError(new Error('Authentication failed'));
    });

    test('should emit high error rate alerts', (done) => {
      errorHandler.on('high_error_rate', (data) => {
        expect(data.errorRate).toBeGreaterThan(mockConfig.alerting.errorRateThreshold);
        done();
      });

      // 快速添加错误以触发高错误率告警
      for (let i = 0; i < 8; i++) {
        errorHandler.handleError(new Error(`Rapid error ${i}`));
      }
    });
  });

  describe('Error Deduplication', () => {
    test('should track occurrence count for similar errors', () => {
      const error1 = new Error('Connection timeout');
      const error2 = new Error('Connection timeout');
      
      const enhanced1 = errorHandler.handleError(error1);
      const enhanced2 = errorHandler.handleError(error2);
      
      expect(enhanced1.occurrenceCount).toBe(1);
      expect(enhanced2.occurrenceCount).toBe(2);
      expect(enhanced1.correlationId).not.toBe(enhanced2.correlationId);
    });

    test('should update last occurrence time', (done) => {
      const error = new Error('Recurring error');
      
      const enhanced1 = errorHandler.handleError(error);
      
      // 稍等一下以确保时间戳不同
      setTimeout(() => {
        const enhanced2 = errorHandler.handleError(error);
        expect(enhanced2.lastOccurred).toBeGreaterThan(enhanced1.lastOccurred);
        expect(enhanced2.firstOccurred).toBe(enhanced1.firstOccurred);
        done();
      }, 10);
    });
  });

  describe('Cleanup and Maintenance', () => {
    test('should cleanup old errors', () => {
      // 添加一些错误
      for (let i = 0; i < 5; i++) {
        errorHandler.handleError(new Error(`Old error ${i}`));
      }
      
      const statsBefore = errorHandler.getErrorStats();
      expect(statsBefore.total).toBe(5);
      
      // 清理所有错误 (设置非常短的保留时间)
      errorHandler.cleanup(0);
      
      const statsAfter = errorHandler.getErrorStats();
      expect(statsAfter.total).toBe(0);
    });

    test('should reset all statistics', () => {
      // 添加一些错误和触发熔断器
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`Error ${i}`));
      }
      
      expect(errorHandler.getErrorStats().total).toBeGreaterThan(0);
      expect(errorHandler.isCircuitBreakerOpen()).toBe(true);
      
      errorHandler.reset();
      
      expect(errorHandler.getErrorStats().total).toBe(0);
      expect(errorHandler.isCircuitBreakerOpen()).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', (done) => {
      errorHandler.on('config_updated', (data) => {
        expect(data.config.maxRecentErrors).toBe(20);
        done();
      });

      errorHandler.updateConfig({
        maxRecentErrors: 20
      });

      expect(errorHandler.getConfig().maxRecentErrors).toBe(20);
    });
  });

  describe('Error Context and Metadata', () => {
    test('should preserve error context', () => {
      const context = {
        operation: 'subscribe',
        symbol: 'BTCUSDT',
        timestamp: Date.now()
      };
      
      const enhanced = errorHandler.handleError(new Error('Test error'), context);
      
      expect(enhanced.context).toMatchObject(context);
      expect(enhanced.metadata?.['handledAt']).toBeDefined();
    });

    test('should include stack trace for Error objects', () => {
      const error = new Error('Test error with stack');
      const enhanced = errorHandler.handleError(error);
      
      expect(enhanced.stackTrace).toBeDefined();
      expect(enhanced.stackTrace).toContain('Error: Test error with stack');
    });
  });
});