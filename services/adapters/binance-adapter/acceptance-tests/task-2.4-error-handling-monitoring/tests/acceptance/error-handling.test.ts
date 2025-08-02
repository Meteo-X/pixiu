/**
 * 错误处理验收测试
 * 
 * 验证错误处理器的所有功能需求：
 * - 错误分类和增强
 * - 错误恢复策略
 * - 熔断器机制
 * - 错误统计和监控
 * - 告警系统
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { 
  ErrorHandler, 
  ErrorHandlerConfig, 
  ErrorSeverity, 
  ErrorCategory, 
  RecoveryStrategy,
  EnhancedErrorInfo 
} from '../../../../src/connector/ErrorHandler';
import { ErrorInfo } from '../../../../src/connector/interfaces';

describe('错误处理器验收测试', () => {
  let errorHandler: ErrorHandler;
  let config: ErrorHandlerConfig;
  let mockEvents: jest.Mock[];

  beforeEach(() => {
    config = {
      maxRecentErrors: 10,
      errorRateWindow: 60000,
      criticalErrorThreshold: 5,
      retryLimits: {
        connection: 3,
        heartbeat: 2,
        protocol: 2,
        data_parsing: 0,
        subscription: 2,
        pubsub: 2,
        config: 0,
        network: 3,
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

    errorHandler = new ErrorHandler(config);
    mockEvents = [];
    
    // 添加到全局清理
    (global as any).addTestEventEmitter(errorHandler);
  });

  afterEach(() => {
    mockEvents.forEach(mock => mock.mockClear());
    errorHandler.reset();
  });

  describe('REQ-2.4.1: 错误分类和增强', () => {
    test('应该正确分类连接错误', () => {
      const error = new Error('Connection failed');
      const enhancedError = errorHandler.handleError(error);

      expect(enhancedError).toBeValidError();
      expect(enhancedError.category).toBe(ErrorCategory.CONNECTION);
      expect(enhancedError.severity).toBe(ErrorSeverity.HIGH);
      expect(enhancedError.recoveryStrategy).toBe(RecoveryStrategy.RECONNECT);
      expect(enhancedError.correlationId).toBeDefined();
      expect(enhancedError.metadata).toBeDefined();
    });

    test('应该正确分类数据解析错误', () => {
      const error = new Error('JSON parse error');
      const enhancedError = errorHandler.handleError(error);

      expect(enhancedError.category).toBe(ErrorCategory.DATA_PARSING);
      expect(enhancedError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(enhancedError.recoveryStrategy).toBe(RecoveryStrategy.IGNORE);
    });

    test('应该正确分类认证错误为致命', () => {
      const error = new Error('Authentication failed');
      const enhancedError = errorHandler.handleError(error);

      expect(enhancedError.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(enhancedError.severity).toBe(ErrorSeverity.CRITICAL);
      expect(enhancedError.recoveryStrategy).toBe(RecoveryStrategy.ESCALATE);
      expect(enhancedError.fatal).toBe(true);
    });

    test('应该增强错误信息包含完整上下文', () => {
      const context = { connectionId: 'test-123', operation: 'subscribe' };
      const error = new Error('Network timeout');
      const enhancedError = errorHandler.handleError(error, context);

      expect(enhancedError.context).toEqual(expect.objectContaining(context));
      expect(enhancedError.timestamp).toBeCloseTo(Date.now(), -2);
      expect(enhancedError.firstOccurred).toBe(enhancedError.lastOccurred);
      expect(enhancedError.occurrenceCount).toBe(1);
      expect(enhancedError.retryCount).toBe(0);
    });

    test('应该跟踪重复错误的发生次数', () => {
      const error = new Error('Same error message');
      
      const first = errorHandler.handleError(error);
      const second = errorHandler.handleError(error);
      const third = errorHandler.handleError(error);

      expect(first.occurrenceCount).toBe(1);
      expect(second.occurrenceCount).toBe(2);
      expect(third.occurrenceCount).toBe(3);
      expect(second.retryCount).toBe(1);
      expect(third.retryCount).toBe(2);
    });
  });

  describe('REQ-2.4.2: 错误恢复策略', () => {
    test('应该为连接错误请求重连', (done) => {
      errorHandler.on('reconnect_requested', (error) => {
        expect(error.category).toBe(ErrorCategory.CONNECTION);
        done();
      });

      const error = new Error('Connection lost');
      errorHandler.handleError(error);
    });

    test('应该为订阅错误请求重试', (done) => {
      errorHandler.on('retry_requested', (error) => {
        expect(error.category).toBe(ErrorCategory.SUBSCRIPTION);
        done();
      });

      const error = new Error('Subscription failed');
      errorHandler.handleError(error);
    });

    test('应该在达到重试限制后停止重试', (done) => {
      let retryCount = 0;
      
      errorHandler.on('retry_requested', () => {
        retryCount++;
      });

      errorHandler.on('retry_limit_exceeded', (error) => {
        expect(retryCount).toBe(2); // subscription 的重试限制
        expect(error.retryCount).toBe(2);
        done();
      });

      const error = new Error('Subscription failed');
      // 触发多次同样的错误
      errorHandler.handleError(error);
      errorHandler.handleError(error);
      errorHandler.handleError(error); // 这次应该超过限制
    });

    test('应该忽略数据解析错误', () => {
      const retryMock = jest.fn();
      const reconnectMock = jest.fn();
      
      errorHandler.on('retry_requested', retryMock);
      errorHandler.on('reconnect_requested', reconnectMock);

      const error = new Error('Invalid JSON format');
      errorHandler.handleError(error);

      expect(retryMock).not.toHaveBeenCalled();
      expect(reconnectMock).not.toHaveBeenCalled();
    });

    test('应该为限流错误触发熔断', (done) => {
      errorHandler.on('circuit_breaker_triggered', (error) => {
        expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
        done();
      });

      const error = new Error('Rate limit exceeded');
      errorHandler.handleError(error);
    });
  });

  describe('REQ-2.4.3: 熔断器机制', () => {
    test('应该在错误率过高时打开熔断器', (done) => {
      errorHandler.on('circuit_breaker_opened', (data) => {
        expect(data.errorRate).toBeGreaterThan(config.circuitBreakerThreshold);
        expect(errorHandler.isCircuitBreakerOpen()).toBe(true);
        done();
      });

      // 快速生成大量错误触发熔断器
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`Test error ${i}`));
      }
    });

    test('应该在错误率降低后自动关闭熔断器', (done) => {
      // 先打开熔断器
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`Test error ${i}`));
      }

      expect(errorHandler.isCircuitBreakerOpen()).toBe(true);

      errorHandler.on('circuit_breaker_closed', (data) => {
        expect(data.errorRate).toBeLessThan(config.circuitBreakerThreshold / 2);
        expect(errorHandler.isCircuitBreakerOpen()).toBe(false);
        done();
      });

      // 模拟时间过去和错误率降低
      setTimeout(() => {
        // 清理错误时间戳模拟时间过去
        errorHandler.cleanup(1000);
      }, 100);
    }, 10000);

    test('应该支持手动控制熔断器状态', () => {
      expect(errorHandler.isCircuitBreakerOpen()).toBe(false);

      errorHandler.openCircuitBreaker();
      expect(errorHandler.isCircuitBreakerOpen()).toBe(true);

      errorHandler.closeCircuitBreaker();
      expect(errorHandler.isCircuitBreakerOpen()).toBe(false);
    });
  });

  describe('REQ-2.4.4: 错误统计和监控', () => {
    test('应该准确统计各类错误数量', () => {
      // 创建不同类型的错误
      errorHandler.handleError(new Error('Connection failed')); // CONNECTION
      errorHandler.handleError(new Error('Parse error')); // DATA_PARSING
      errorHandler.handleError(new Error('Subscribe failed')); // SUBSCRIPTION
      errorHandler.handleError(new Error('Critical config error')); // CONFIG

      const stats = errorHandler.getErrorStats();
      
      expect(stats.total).toBe(4);
      expect(stats.byCategory[ErrorCategory.CONNECTION]).toBe(1);
      expect(stats.byCategory[ErrorCategory.DATA_PARSING]).toBe(1);
      expect(stats.byCategory[ErrorCategory.SUBSCRIPTION]).toBe(1);
      expect(stats.byCategory[ErrorCategory.CONFIG]).toBe(1);
      expect(stats.criticalErrors).toBe(1); // CONFIG 错误是 CRITICAL
    });

    test('应该正确计算错误率', () => {
      const startTime = Date.now();
      
      // 在短时间内生成错误
      for (let i = 0; i < 5; i++) {
        errorHandler.handleError(new Error(`Test error ${i}`));
      }

      const stats = errorHandler.getErrorStats();
      expect(stats.errorRate).toBeGreaterThan(0);
      expect(stats.total).toBe(5);
    });

    test('应该维护最近错误列表', () => {
      const errorCount = 15;
      
      for (let i = 0; i < errorCount; i++) {
        errorHandler.handleError(new Error(`Test error ${i}`));
      }

      const stats = errorHandler.getErrorStats();
      expect(stats.recentErrors).toHaveLength(config.maxRecentErrors);
      expect(stats.recentErrors[0].message).toContain('14'); // 最新的错误在前
    });

    test('应该按严重程度统计错误', () => {
      errorHandler.handleError(new Error('Connection failed')); // HIGH
      errorHandler.handleError(new Error('Parse error')); // MEDIUM  
      errorHandler.handleError(new Error('Authentication failed')); // CRITICAL
      errorHandler.handleError(new Error('Unknown error')); // LOW

      const stats = errorHandler.getErrorStats();
      expect(stats.bySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.LOW]).toBe(1);
    });

    test('应该按恢复策略统计错误', () => {
      errorHandler.handleError(new Error('Connection failed')); // RECONNECT
      errorHandler.handleError(new Error('Parse error')); // IGNORE
      errorHandler.handleError(new Error('Subscribe failed')); // RETRY
      errorHandler.handleError(new Error('Critical error')); // ESCALATE

      const stats = errorHandler.getErrorStats();
      expect(stats.byRecoveryStrategy[RecoveryStrategy.RECONNECT]).toBe(1);
      expect(stats.byRecoveryStrategy[RecoveryStrategy.IGNORE]).toBe(1);
      expect(stats.byRecoveryStrategy[RecoveryStrategy.RETRY]).toBe(1);
      expect(stats.byRecoveryStrategy[RecoveryStrategy.ESCALATE]).toBe(1);
    });
  });

  describe('REQ-2.4.5: 告警系统', () => {
    test('应该为致命错误发送告警', (done) => {
      errorHandler.on('critical_error', (error) => {
        expect(error.severity).toBe(ErrorSeverity.CRITICAL);
        expect(error.message).toContain('Authentication failed');
        done();
      });

      const error = new Error('Authentication failed');
      errorHandler.handleError(error);
    });

    test('应该在错误率过高时发送告警', (done) => {
      errorHandler.on('high_error_rate', (data) => {
        expect(data.errorRate).toBeGreaterThan(config.alerting.errorRateThreshold);
        expect(data.threshold).toBe(config.alerting.errorRateThreshold);
        expect(data.recentErrors).toHaveLength(10);
        done();
      });

      // 快速生成错误触发高错误率告警
      for (let i = 0; i < 10; i++) {
        errorHandler.handleError(new Error(`High rate error ${i}`));
      }
    });

    test('应该实施告警冷却期避免重复告警', (done) => {
      let alertCount = 0;
      
      errorHandler.on('high_error_rate', () => {
        alertCount++;
      });

      // 触发高错误率
      for (let i = 0; i < 10; i++) {
        errorHandler.handleError(new Error(`Alert test error ${i}`));
      }

      // 再次触发（应该被冷却期阻止）
      setTimeout(() => {
        for (let i = 0; i < 5; i++) {
          errorHandler.handleError(new Error(`Cooldown test error ${i}`));
        }
        
        // 验证只有一次告警
        expect(alertCount).toBe(1);
        done();
      }, 1000);
    }, 10000);

    test('应该在冷却期后重新发送告警', (done) => {
      let alertCount = 0;
      
      errorHandler.on('high_error_rate', () => {
        alertCount++;
        if (alertCount === 2) {
          done();
        }
      });

      // 第一次触发
      for (let i = 0; i < 10; i++) {
        errorHandler.handleError(new Error(`First alert ${i}`));
      }

      // 等待冷却期结束后再次触发
      setTimeout(() => {
        for (let i = 0; i < 10; i++) {
          errorHandler.handleError(new Error(`Second alert ${i}`));
        }
      }, 6000); // 超过5秒冷却期
    }, 15000);
  });

  describe('REQ-2.4.6: 性能要求', () => {
    test('错误处理性能应满足要求', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        errorHandler.handleError(new Error(`Performance test ${i}`));
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // 平均处理时间应小于1ms
      expect(avgTime).toBeLessThan(1);
    });

    test('内存使用应保持稳定', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 生成大量错误
      for (let i = 0; i < 10000; i++) {
        errorHandler.handleError(new Error(`Memory test ${i}`));
      }

      // 清理旧数据
      errorHandler.cleanup();
      
      // 强制垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // 内存增长应该合理（小于10MB）
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('REQ-2.4.7: 配置管理', () => {
    test('应该支持运行时配置更新', (done) => {
      errorHandler.on('config_updated', (data) => {
        expect(data.config.circuitBreakerThreshold).toBe(20);
        expect(data.timestamp).toBeCloseTo(Date.now(), -2);
        done();
      });

      const newConfig = { circuitBreakerThreshold: 20 };
      errorHandler.updateConfig(newConfig);
      
      const currentConfig = errorHandler.getConfig();
      expect(currentConfig.circuitBreakerThreshold).toBe(20);
    });

    test('应该保持配置完整性', () => {
      const originalConfig = errorHandler.getConfig();
      const partialConfig = { maxRecentErrors: 50 };
      
      errorHandler.updateConfig(partialConfig);
      
      const updatedConfig = errorHandler.getConfig();
      expect(updatedConfig.maxRecentErrors).toBe(50);
      expect(updatedConfig.errorRateWindow).toBe(originalConfig.errorRateWindow);
      expect(updatedConfig.alerting).toEqual(originalConfig.alerting);
    });
  });

  describe('REQ-2.4.8: 边界情况处理', () => {
    test('应该处理空错误消息', () => {
      const error = new Error('');
      const enhancedError = errorHandler.handleError(error);

      expect(enhancedError.message).toBe('');
      expect(enhancedError.category).toBe(ErrorCategory.UNKNOWN);
      expect(enhancedError).toBeValidError();
    });

    test('应该处理非Error对象', () => {
      const errorInfo: ErrorInfo = {
        timestamp: Date.now(),
        message: 'Custom error info',
        code: 'CUSTOM',
        type: 'UNKNOWN',
        fatal: false
      };

      const enhancedError = errorHandler.handleError(errorInfo);
      expect(enhancedError.message).toBe('Custom error info');
      expect(enhancedError.code).toBe('CUSTOM');
    });

    test('应该处理极大数量的并发错误', () => {
      const concurrentErrors = 100;
      const promises: Promise<EnhancedErrorInfo>[] = [];

      for (let i = 0; i < concurrentErrors; i++) {
        promises.push(Promise.resolve(
          errorHandler.handleError(new Error(`Concurrent error ${i}`))
        ));
      }

      return Promise.all(promises).then(results => {
        expect(results).toHaveLength(concurrentErrors);
        results.forEach(result => {
          expect(result).toBeValidError();
        });
      });
    });

    test('应该正确处理清理操作', () => {
      // 生成一些错误
      for (let i = 0; i < 5; i++) {
        errorHandler.handleError(new Error(`Cleanup test ${i}`));
      }

      const beforeCleanup = errorHandler.getErrorStats();
      expect(beforeCleanup.total).toBe(5);

      // 清理所有数据
      errorHandler.cleanup(0); // 清理所有数据

      const afterCleanup = errorHandler.getErrorStats();
      expect(afterCleanup.total).toBe(0);
      expect(afterCleanup.recentErrors).toHaveLength(0);
    });

    test('应该正确处理重置操作', () => {
      // 设置一些状态
      for (let i = 0; i < 10; i++) {
        errorHandler.handleError(new Error(`Reset test ${i}`));
      }
      
      errorHandler.openCircuitBreaker();
      
      expect(errorHandler.getErrorStats().total).toBe(10);
      expect(errorHandler.isCircuitBreakerOpen()).toBe(true);

      // 重置
      errorHandler.reset();

      expect(errorHandler.getErrorStats().total).toBe(0);
      expect(errorHandler.isCircuitBreakerOpen()).toBe(false);
    });
  });
});