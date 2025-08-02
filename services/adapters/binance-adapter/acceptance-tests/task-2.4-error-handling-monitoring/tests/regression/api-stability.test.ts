/**
 * API 稳定性回归测试
 * 
 * 确保错误处理和监控组件的 API 在未来版本中保持稳定：
 * - 公共接口不变
 * - 行为兼容性
 * - 配置向后兼容
 * - 事件接口稳定
 * - 数据格式一致
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  ErrorHandler, 
  ErrorHandlerConfig, 
  ErrorSeverity, 
  ErrorCategory, 
  RecoveryStrategy,
  EnhancedErrorInfo
} from '../../../../src/connector/ErrorHandler';
import { 
  LatencyMonitor, 
  LatencyMonitorConfig, 
  LatencyType, 
  LatencyMeasurement,
  LatencyStats,
  LatencyAlert
} from '../../../../src/connector/LatencyMonitor';
import { 
  AdapterStatusMonitor, 
  StatusMonitorConfig,
  AdapterStatusSnapshot,
  HealthFactors,
  HealthAlert
} from '../../../../src/connector/AdapterStatusMonitor';

describe('API 稳定性回归测试', () => {
  let errorHandler: ErrorHandler;
  let latencyMonitor: LatencyMonitor;
  let statusMonitor: AdapterStatusMonitor;

  beforeEach(() => {
    const errorConfig: ErrorHandlerConfig = {
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

    const latencyConfig: LatencyMonitorConfig = {
      sampling: {
        maxSamples: 1000,
        windowSize: 300000,
        sampleInterval: 1000
      },
      buckets: {
        boundaries: [0, 10, 50, 100, 200, 500, 1000, 2000, 5000]
      },
      thresholds: {
        [LatencyType.NETWORK]: {
          warning: 100,
          critical: 500,
          p95Warning: 200,
          p99Critical: 1000
        },
        [LatencyType.PROCESSING]: {
          warning: 10,
          critical: 50,
          p95Warning: 20,
          p99Critical: 100
        },
        [LatencyType.END_TO_END]: {
          warning: 150,
          critical: 750,
          p95Warning: 300,
          p99Critical: 1500
        },
        [LatencyType.HEARTBEAT]: {
          warning: 30000,
          critical: 60000,
          p95Warning: 45000,
          p99Critical: 90000
        },
        [LatencyType.SUBSCRIPTION]: {
          warning: 5000,
          critical: 15000,
          p95Warning: 10000,
          p99Critical: 30000
        }
      },
      trend: {
        enabled: true,
        windowCount: 24,
        significantChange: 20
      },
      baseline: {
        enabled: true,
        targetLatency: {
          [LatencyType.NETWORK]: 50,
          [LatencyType.PROCESSING]: 5,
          [LatencyType.END_TO_END]: 100,
          [LatencyType.HEARTBEAT]: 20000,
          [LatencyType.SUBSCRIPTION]: 2000
        },
        acceptableDeviation: 50
      }
    };

    const statusConfig: StatusMonitorConfig = {
      updateInterval: 1000,
      snapshotRetention: 10,
      healthThresholds: {
        warning: 0.7,
        critical: 0.4
      },
      benchmarks: {
        messagesPerSecond: {
          target: 1000,
          warning: 500,
          critical: 100
        },
        latency: {
          target: 50,
          warning: 100,
          critical: 500
        },
        errorRate: {
          target: 1,
          warning: 5,
          critical: 10
        },
        connectionSuccess: {
          target: 99,
          warning: 95,
          critical: 90
        }
      },
      alerting: {
        enabled: true,
        cooldownPeriod: 5000
      }
    };

    errorHandler = new ErrorHandler(errorConfig);
    latencyMonitor = new LatencyMonitor(latencyConfig);
    statusMonitor = new AdapterStatusMonitor(statusConfig);

    statusMonitor.setErrorHandler(errorHandler);
    statusMonitor.setLatencyMonitor(latencyMonitor);

    // 添加到全局清理
    (global as any).addTestEventEmitter(errorHandler);
    (global as any).addTestEventEmitter(latencyMonitor);
    (global as any).addTestEventEmitter(statusMonitor);
  });

  afterEach(() => {
    statusMonitor.stop();
    latencyMonitor.stop();
    errorHandler.reset();
    latencyMonitor.reset();
    statusMonitor.reset();
  });

  describe('REQ-2.4.49: ErrorHandler API 稳定性', () => {
    test('公共方法签名应保持稳定', () => {
      // 验证核心方法存在且签名正确
      expect(typeof errorHandler.handleError).toBe('function');
      expect(typeof errorHandler.getErrorStats).toBe('function');
      expect(typeof errorHandler.reset).toBe('function');
      expect(typeof errorHandler.cleanup).toBe('function');
      expect(typeof errorHandler.isCircuitBreakerOpen).toBe('function');
      expect(typeof errorHandler.openCircuitBreaker).toBe('function');
      expect(typeof errorHandler.closeCircuitBreaker).toBe('function');
      expect(typeof errorHandler.getConfig).toBe('function');
      expect(typeof errorHandler.updateConfig).toBe('function');

      // 验证方法参数和返回值类型
      const error = new Error('Test error');
      const enhancedError = errorHandler.handleError(error);
      
      expect(enhancedError).toHaveProperty('timestamp');
      expect(enhancedError).toHaveProperty('message');
      expect(enhancedError).toHaveProperty('severity');
      expect(enhancedError).toHaveProperty('category');
      expect(enhancedError).toHaveProperty('recoveryStrategy');
      expect(enhancedError).toHaveProperty('correlationId');
    });

    test('错误统计数据结构应保持稳定', () => {
      errorHandler.handleError(new Error('Test error'));
      const stats = errorHandler.getErrorStats();

      // 验证统计数据结构
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byCategory');
      expect(stats).toHaveProperty('bySeverity');
      expect(stats).toHaveProperty('byRecoveryStrategy');
      expect(stats).toHaveProperty('recentErrors');
      expect(stats).toHaveProperty('errorRate');
      expect(stats).toHaveProperty('criticalErrors');
      expect(stats).toHaveProperty('resolvedErrors');
      expect(stats).toHaveProperty('averageResolutionTime');

      // 验证分类枚举值
      expect(stats.byCategory).toHaveProperty(ErrorCategory.CONNECTION);
      expect(stats.byCategory).toHaveProperty(ErrorCategory.DATA_PARSING);
      expect(stats.byCategory).toHaveProperty(ErrorCategory.SUBSCRIPTION);

      // 验证严重程度枚举值
      expect(stats.bySeverity).toHaveProperty(ErrorSeverity.LOW);
      expect(stats.bySeverity).toHaveProperty(ErrorSeverity.MEDIUM);
      expect(stats.bySeverity).toHaveProperty(ErrorSeverity.HIGH);
      expect(stats.bySeverity).toHaveProperty(ErrorSeverity.CRITICAL);

      // 验证恢复策略枚举值
      expect(stats.byRecoveryStrategy).toHaveProperty(RecoveryStrategy.IGNORE);
      expect(stats.byRecoveryStrategy).toHaveProperty(RecoveryStrategy.RETRY);
      expect(stats.byRecoveryStrategy).toHaveProperty(RecoveryStrategy.RECONNECT);
    });

    test('配置对象结构应保持稳定', () => {
      const config = errorHandler.getConfig();

      // 验证配置结构
      expect(config).toHaveProperty('maxRecentErrors');
      expect(config).toHaveProperty('errorRateWindow');
      expect(config).toHaveProperty('criticalErrorThreshold');
      expect(config).toHaveProperty('retryLimits');
      expect(config).toHaveProperty('circuitBreakerThreshold');
      expect(config).toHaveProperty('alerting');

      // 验证嵌套配置结构
      expect(config.retryLimits).toHaveProperty('connection');
      expect(config.retryLimits).toHaveProperty('data_parsing');
      expect(config.alerting).toHaveProperty('enabled');
      expect(config.alerting).toHaveProperty('criticalErrorNotification');
    });

    test('事件接口应保持稳定', (done) => {
      let eventCount = 0;
      const expectedEvents = [
        'error_handled',
        'critical_error',
        'retry_requested',
        'config_updated'
      ];

      expectedEvents.forEach(eventName => {
        errorHandler.on(eventName, () => {
          eventCount++;
          if (eventCount === expectedEvents.length) {
            done();
          }
        });
      });

      // 触发各种事件
      errorHandler.handleError(new Error('Authentication failed')); // critical_error + error_handled
      errorHandler.handleError(new Error('Subscribe failed')); // retry_requested + error_handled
      errorHandler.updateConfig({ maxRecentErrors: 20 }); // config_updated
    });

    test('枚举值应保持稳定', () => {
      // 验证 ErrorSeverity 枚举
      expect(ErrorSeverity.LOW).toBe('low');
      expect(ErrorSeverity.MEDIUM).toBe('medium');
      expect(ErrorSeverity.HIGH).toBe('high');
      expect(ErrorSeverity.CRITICAL).toBe('critical');

      // 验证 ErrorCategory 枚举
      expect(ErrorCategory.CONNECTION).toBe('connection');
      expect(ErrorCategory.DATA_PARSING).toBe('data_parsing');
      expect(ErrorCategory.SUBSCRIPTION).toBe('subscription');
      expect(ErrorCategory.PUBSUB).toBe('pubsub');

      // 验证 RecoveryStrategy 枚举
      expect(RecoveryStrategy.IGNORE).toBe('ignore');
      expect(RecoveryStrategy.RETRY).toBe('retry');
      expect(RecoveryStrategy.RECONNECT).toBe('reconnect');
      expect(RecoveryStrategy.ESCALATE).toBe('escalate');
    });
  });

  describe('REQ-2.4.50: LatencyMonitor API 稳定性', () => {
    test('公共方法签名应保持稳定', () => {
      // 验证核心方法存在
      expect(typeof latencyMonitor.recordLatency).toBe('function');
      expect(typeof latencyMonitor.recordNetworkLatency).toBe('function');
      expect(typeof latencyMonitor.recordProcessingLatency).toBe('function');
      expect(typeof latencyMonitor.recordEndToEndLatency).toBe('function');
      expect(typeof latencyMonitor.getStats).toBe('function');
      expect(typeof latencyMonitor.getAllStats).toBe('function');
      expect(typeof latencyMonitor.getBuckets).toBe('function');
      expect(typeof latencyMonitor.getTrends).toBe('function');
      expect(typeof latencyMonitor.getLatencySummary).toBe('function');
      expect(typeof latencyMonitor.compareToBaseline).toBe('function');
      expect(typeof latencyMonitor.getConfig).toBe('function');
      expect(typeof latencyMonitor.updateConfig).toBe('function');
      expect(typeof latencyMonitor.reset).toBe('function');
      expect(typeof latencyMonitor.cleanup).toBe('function');
      expect(typeof latencyMonitor.stop).toBe('function');
    });

    test('延迟统计数据结构应保持稳定', () => {
      latencyMonitor.recordNetworkLatency(50);
      const stats = latencyMonitor.getStats(LatencyType.NETWORK);

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('type');
      expect(stats).toHaveProperty('count');
      expect(stats).toHaveProperty('sum');
      expect(stats).toHaveProperty('min');
      expect(stats).toHaveProperty('max');
      expect(stats).toHaveProperty('mean');
      expect(stats).toHaveProperty('median');
      expect(stats).toHaveProperty('p90');
      expect(stats).toHaveProperty('p95');
      expect(stats).toHaveProperty('p99');
      expect(stats).toHaveProperty('standardDeviation');
      expect(stats).toHaveProperty('variance');
    });

    test('延迟分桶数据结构应保持稳定', () => {
      latencyMonitor.recordNetworkLatency(75);
      const buckets = latencyMonitor.getBuckets(LatencyType.NETWORK);

      expect(Array.isArray(buckets)).toBe(true);
      expect(buckets.length).toBeGreaterThan(0);

      buckets.forEach(bucket => {
        expect(bucket).toHaveProperty('range');
        expect(bucket).toHaveProperty('lowerBound');
        expect(bucket).toHaveProperty('upperBound');
        expect(bucket).toHaveProperty('count');
        expect(bucket).toHaveProperty('percentage');
      });
    });

    test('延迟摘要数据结构应保持稳定', () => {
      latencyMonitor.recordNetworkLatency(60);
      latencyMonitor.recordProcessingLatency(8);

      const summary = latencyMonitor.getLatencySummary();

      expect(summary).toHaveProperty(LatencyType.NETWORK);
      expect(summary).toHaveProperty(LatencyType.PROCESSING);

      Object.values(summary).forEach(typeSummary => {
        expect(typeSummary).toHaveProperty('current');
        expect(typeSummary).toHaveProperty('p95');
        expect(typeSummary).toHaveProperty('p99');
        expect(typeSummary).toHaveProperty('trend');
        expect(typeSummary).toHaveProperty('alertLevel');
      });
    });

    test('延迟类型枚举应保持稳定', () => {
      expect(LatencyType.NETWORK).toBe('network');
      expect(LatencyType.PROCESSING).toBe('processing');
      expect(LatencyType.END_TO_END).toBe('end_to_end');
      expect(LatencyType.HEARTBEAT).toBe('heartbeat');
      expect(LatencyType.SUBSCRIPTION).toBe('subscription');
    });

    test('事件接口应保持稳定', (done) => {
      let eventCount = 0;
      const expectedEvents = [
        'latency_recorded',
        'latency_alert',
        'stats_updated',
        'config_updated'
      ];

      expectedEvents.forEach(eventName => {
        latencyMonitor.on(eventName, () => {
          eventCount++;
          if (eventCount === expectedEvents.length) {
            done();
          }
        });
      });

      // 触发事件
      latencyMonitor.recordNetworkLatency(600); // latency_alert + latency_recorded
      latencyMonitor.updateConfig({ 
        sampling: { maxSamples: 2000, windowSize: 300000, sampleInterval: 1000 }
      }); // config_updated
      
      // stats_updated 由内部定时器触发
      setTimeout(() => {
        if (eventCount < expectedEvents.length) {
          // 手动触发 stats_updated
          latencyMonitor.recordNetworkLatency(50);
        }
      }, 1500);
    }, 10000);
  });

  describe('REQ-2.4.51: AdapterStatusMonitor API 稳定性', () => {
    test('公共方法签名应保持稳定', () => {
      // 验证核心方法存在
      expect(typeof statusMonitor.setErrorHandler).toBe('function');
      expect(typeof statusMonitor.setLatencyMonitor).toBe('function');
      expect(typeof statusMonitor.updateStatus).toBe('function');
      expect(typeof statusMonitor.createSnapshot).toBe('function');
      expect(typeof statusMonitor.getCurrentStatus).toBe('function');
      expect(typeof statusMonitor.getLatestSnapshot).toBe('function');
      expect(typeof statusMonitor.getSnapshots).toBe('function');
      expect(typeof statusMonitor.getStatusHistory).toBe('function');
      expect(typeof statusMonitor.getUptime).toBe('function');
      expect(typeof statusMonitor.getHealthTrend).toBe('function');
      expect(typeof statusMonitor.getConfig).toBe('function');
      expect(typeof statusMonitor.updateConfig).toBe('function');
      expect(typeof statusMonitor.reset).toBe('function');
      expect(typeof statusMonitor.stop).toBe('function');
    });

    test('状态快照数据结构应保持稳定', () => {
      const snapshot = statusMonitor.createSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('status');
      expect(snapshot).toHaveProperty('overallHealth');
      expect(snapshot).toHaveProperty('healthFactors');
      expect(snapshot).toHaveProperty('connectionStats');
      expect(snapshot).toHaveProperty('performanceStats');
      expect(snapshot).toHaveProperty('errorStats');
      expect(snapshot).toHaveProperty('latencyStats');
      expect(snapshot).toHaveProperty('subscriptionCount');
      expect(snapshot).toHaveProperty('uptime');
      expect(snapshot).toHaveProperty('metadata');

      // 验证健康度因子结构
      expect(snapshot.healthFactors).toHaveProperty('connectivity');
      expect(snapshot.healthFactors).toHaveProperty('latency');
      expect(snapshot.healthFactors).toHaveProperty('throughput');
      expect(snapshot.healthFactors).toHaveProperty('errorRate');
      expect(snapshot.healthFactors).toHaveProperty('heartbeat');
      expect(snapshot.healthFactors).toHaveProperty('stability');
    });

    test('健康度告警数据结构应保持稳定', (done) => {
      statusMonitor.on('health_alert', (alert: HealthAlert) => {
        expect(alert).toHaveProperty('timestamp');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('factor');
        expect(alert).toHaveProperty('value');
        expect(alert).toHaveProperty('threshold');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('snapshot');

        // 验证严重程度枚举值
        expect(['info', 'warning', 'error', 'critical']).toContain(alert.severity);

        done();
      });

      // 触发健康度告警
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`Alert test ${i}`));
      }
      statusMonitor.createSnapshot();
    });

    test('状态历史数据结构应保持稳定', () => {
      statusMonitor.updateStatus('connecting' as any, 'Test status change');
      statusMonitor.updateStatus('active' as any, 'Another status change');

      const history = statusMonitor.getStatusHistory();
      
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      history.forEach(event => {
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('previousStatus');
        expect(event).toHaveProperty('currentStatus');
        expect(event).toHaveProperty('reason');
        expect(event).toHaveProperty('metadata');
      });
    });

    test('健康度趋势数据结构应保持稳定', () => {
      // 创建一些历史数据
      for (let i = 0; i < 5; i++) {
        statusMonitor.createSnapshot();
      }

      const trend = statusMonitor.getHealthTrend(60);
      
      expect(Array.isArray(trend)).toBe(true);
      
      trend.forEach(point => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('health');
        expect(typeof point.timestamp).toBe('number');
        expect(typeof point.health).toBe('number');
        expect(point.health).toBeGreaterThanOrEqual(0);
        expect(point.health).toBeLessThanOrEqual(1);
      });
    });

    test('事件接口应保持稳定', (done) => {
      let eventCount = 0;
      const expectedEvents = [
        'status_changed',
        'snapshot_created',
        'health_alert',
        'config_updated'
      ];

      expectedEvents.forEach(eventName => {
        statusMonitor.on(eventName, () => {
          eventCount++;
          if (eventCount === expectedEvents.length) {
            done();
          }
        });
      });

      // 触发事件
      statusMonitor.updateStatus('connecting' as any, 'Test'); // status_changed
      statusMonitor.createSnapshot(); // snapshot_created
      
      // 触发健康告警
      for (let i = 0; i < 20; i++) {
        errorHandler.handleError(new Error(`Health alert test ${i}`));
      }
      statusMonitor.createSnapshot(); // health_alert
      
      statusMonitor.updateConfig({ 
        healthThresholds: { warning: 0.6, critical: 0.3 }
      }); // config_updated
    }, 10000);
  });

  describe('REQ-2.4.52: 向后兼容性', () => {
    test('配置对象应支持部分更新', () => {
      const originalErrorConfig = errorHandler.getConfig();
      const originalLatencyConfig = latencyMonitor.getConfig();
      const originalStatusConfig = statusMonitor.getConfig();

      // 部分配置更新
      errorHandler.updateConfig({ maxRecentErrors: 50 });
      latencyMonitor.updateConfig({ 
        sampling: { ...originalLatencyConfig.sampling, maxSamples: 2000 }
      });
      statusMonitor.updateConfig({ 
        healthThresholds: { warning: 0.6, critical: 0.3 }
      });

      // 验证其他配置保持不变
      const updatedErrorConfig = errorHandler.getConfig();
      const updatedLatencyConfig = latencyMonitor.getConfig();
      const updatedStatusConfig = statusMonitor.getConfig();

      expect(updatedErrorConfig.maxRecentErrors).toBe(50);
      expect(updatedErrorConfig.errorRateWindow).toBe(originalErrorConfig.errorRateWindow);
      expect(updatedErrorConfig.alerting).toEqual(originalErrorConfig.alerting);

      expect(updatedLatencyConfig.sampling.maxSamples).toBe(2000);
      expect(updatedLatencyConfig.buckets).toEqual(originalLatencyConfig.buckets);
      expect(updatedLatencyConfig.thresholds).toEqual(originalLatencyConfig.thresholds);

      expect(updatedStatusConfig.healthThresholds.warning).toBe(0.6);
      expect(updatedStatusConfig.updateInterval).toBe(originalStatusConfig.updateInterval);
      expect(updatedStatusConfig.benchmarks).toEqual(originalStatusConfig.benchmarks);
    });

    test('数据格式应保持向后兼容', () => {
      // 记录一些数据
      errorHandler.handleError(new Error('Test error'));
      latencyMonitor.recordNetworkLatency(75);
      const snapshot = statusMonitor.createSnapshot();

      // 验证数据格式符合预期结构
      const errorStats = errorHandler.getErrorStats();
      const latencyStats = latencyMonitor.getStats(LatencyType.NETWORK);

      // 错误统计格式验证
      expect(typeof errorStats.total).toBe('number');
      expect(typeof errorStats.errorRate).toBe('number');
      expect(Array.isArray(errorStats.recentErrors)).toBe(true);
      expect(typeof errorStats.byCategory).toBe('object');

      // 延迟统计格式验证
      expect(typeof latencyStats!.count).toBe('number');
      expect(typeof latencyStats!.mean).toBe('number');
      expect(typeof latencyStats!.p95).toBe('number');
      expect(latencyStats!.type).toBe(LatencyType.NETWORK);

      // 快照格式验证
      expect(typeof snapshot.timestamp).toBe('number');
      expect(typeof snapshot.overallHealth).toBe('number');
      expect(typeof snapshot.uptime).toBe('number');
      expect(Array.isArray(snapshot.connectionStats)).toBe(true);
    });

    test('错误处理行为应保持一致', () => {
      // 测试相同的错误类型产生一致的分类和恢复策略
      const connectionError1 = errorHandler.handleError(new Error('Connection failed'));
      const connectionError2 = errorHandler.handleError(new Error('Connection timeout'));

      expect(connectionError1.category).toBe(ErrorCategory.CONNECTION);
      expect(connectionError2.category).toBe(ErrorCategory.CONNECTION);
      expect(connectionError1.recoveryStrategy).toBe(RecoveryStrategy.RECONNECT);
      expect(connectionError2.recoveryStrategy).toBe(RecoveryStrategy.RECONNECT);

      const parsingError1 = errorHandler.handleError(new Error('JSON parse error'));
      const parsingError2 = errorHandler.handleError(new Error('Invalid format'));

      expect(parsingError1.category).toBe(ErrorCategory.DATA_PARSING);
      expect(parsingError2.category).toBe(ErrorCategory.DATA_PARSING);
      expect(parsingError1.recoveryStrategy).toBe(RecoveryStrategy.IGNORE);
      expect(parsingError2.recoveryStrategy).toBe(RecoveryStrategy.IGNORE);
    });

    test('延迟阈值行为应保持一致', (done) => {
      let alertCount = 0;
      
      latencyMonitor.on('latency_alert', (alert) => {
        alertCount++;
        if (alert.value > 500) {
          expect(alert.severity).toBe('critical');
        } else if (alert.value > 100) {
          expect(alert.severity).toBe('high');
        }
        
        if (alertCount === 2) {
          done();
        }
      });

      // 触发不同级别的告警
      latencyMonitor.recordNetworkLatency(150); // 警告级
      latencyMonitor.recordNetworkLatency(600); // 严重级
    });
  });

  describe('REQ-2.4.53: 接口契约稳定性', () => {
    test('方法返回值类型应保持稳定', () => {
      // ErrorHandler 返回值类型
      const enhancedError = errorHandler.handleError(new Error('Test'));
      expect(enhancedError).toBeInstanceOf(Object);
      expect(typeof enhancedError.timestamp).toBe('number');
      expect(typeof enhancedError.message).toBe('string');

      const errorStats = errorHandler.getErrorStats();
      expect(typeof errorStats.total).toBe('number');
      expect(Array.isArray(errorStats.recentErrors)).toBe(true);

      // LatencyMonitor 返回值类型
      latencyMonitor.recordNetworkLatency(50);
      const latencyStats = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(latencyStats).toBeInstanceOf(Object);
      expect(typeof latencyStats!.mean).toBe('number');

      const allStats = latencyMonitor.getAllStats();
      expect(typeof allStats).toBe('object');

      // AdapterStatusMonitor 返回值类型
      const snapshot = statusMonitor.createSnapshot();
      expect(snapshot).toBeInstanceOf(Object);
      expect(typeof snapshot.overallHealth).toBe('number');

      const uptime = statusMonitor.getUptime();
      expect(typeof uptime).toBe('number');
    });

    test('异常处理行为应保持稳定', () => {
      // 测试无效输入的处理
      expect(() => {
        latencyMonitor.recordLatency({
          type: LatencyType.NETWORK,
          value: -10, // 无效值
          timestamp: Date.now()
        });
      }).not.toThrow(); // 应该优雅处理，不抛出异常

      expect(() => {
        errorHandler.handleError(null as any);
      }).not.toThrow(); // 应该优雅处理 null 错误

      expect(() => {
        statusMonitor.updateStatus(null as any, 'Test');
      }).not.toThrow(); // 应该优雅处理无效状态
    });

    test('配置验证行为应保持稳定', () => {
      // 测试配置更新的验证
      expect(() => {
        errorHandler.updateConfig({ maxRecentErrors: -1 });
      }).not.toThrow(); // 应该优雅处理无效配置

      expect(() => {
        latencyMonitor.updateConfig({ 
          sampling: { maxSamples: 0, windowSize: 1000, sampleInterval: 100 }
        });
      }).not.toThrow();

      expect(() => {
        statusMonitor.updateConfig({ 
          healthThresholds: { warning: 1.5, critical: 2.0 } // 无效阈值
        });
      }).not.toThrow();
    });
  });

  describe('REQ-2.4.54: 性能特征稳定性', () => {
    test('基本操作性能应保持在预期范围内', () => {
      // 错误处理性能
      const errorStartTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        errorHandler.handleError(new Error(`Performance test ${i}`));
      }
      const errorEndTime = performance.now();
      const errorAvgTime = (errorEndTime - errorStartTime) / 1000;
      expect(errorAvgTime).toBeLessThan(2); // 应该保持在2ms以内

      // 延迟记录性能
      const latencyStartTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 100);
      }
      const latencyEndTime = performance.now();
      const latencyAvgTime = (latencyEndTime - latencyStartTime) / 1000;
      expect(latencyAvgTime).toBeLessThan(0.5); // 应该保持在0.5ms以内

      // 状态快照性能
      const snapshotStartTime = performance.now();
      for (let i = 0; i < 100; i++) {
        statusMonitor.createSnapshot();
      }
      const snapshotEndTime = performance.now();
      const snapshotAvgTime = (snapshotEndTime - snapshotStartTime) / 100;
      expect(snapshotAvgTime).toBeLessThan(10); // 应该保持在10ms以内
    });

    test('内存使用特征应保持稳定', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // 执行大量操作
      for (let i = 0; i < 5000; i++) {
        errorHandler.handleError(new Error(`Memory test ${i}`));
        latencyMonitor.recordNetworkLatency(Math.random() * 100);
        if (i % 50 === 0) {
          statusMonitor.createSnapshot();
        }
      }

      const afterOperations = process.memoryUsage().heapUsed;
      const memoryIncrease = afterOperations - initialMemory;

      // 内存增长应该在合理范围内（小于50MB）
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      // 清理后内存应该释放
      errorHandler.cleanup();
      latencyMonitor.cleanup();

      if (global.gc) {
        global.gc();
      }

      const afterCleanup = process.memoryUsage().heapUsed;
      expect(afterCleanup).toBeLessThan(afterOperations);
    });
  });
});