/**
 * 监控系统集成测试
 * 
 * 验证错误处理器、延迟监控器和状态监控器之间的集成：
 * - 组件间事件传播
 * - 数据流集成
 * - 错误处理链路
 * - 监控数据聚合
 * - 告警系统协调
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  ErrorHandler, 
  ErrorHandlerConfig, 
  ErrorSeverity, 
  ErrorCategory 
} from '../../../../src/connector/ErrorHandler';
import { 
  LatencyMonitor, 
  LatencyMonitorConfig, 
  LatencyType 
} from '../../../../src/connector/LatencyMonitor';
import { 
  AdapterStatusMonitor, 
  StatusMonitorConfig 
} from '../../../../src/connector/AdapterStatusMonitor';
import { 
  AdapterStatus, 
  ConnectionState, 
  ConnectionStats 
} from '../../../../src/types';

describe('监控系统集成测试', () => {
  let errorHandler: ErrorHandler;
  let latencyMonitor: LatencyMonitor;
  let statusMonitor: AdapterStatusMonitor;

  beforeEach(() => {
    // 创建标准配置
    const errorConfig: ErrorHandlerConfig = {
      maxRecentErrors: 20,
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
      snapshotRetention: 20,
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
        cooldownPeriod: 3000
      }
    };

    // 创建组件
    errorHandler = new ErrorHandler(errorConfig);
    latencyMonitor = new LatencyMonitor(latencyConfig);
    statusMonitor = new AdapterStatusMonitor(statusConfig);

    // 设置集成关系
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

  describe('REQ-2.4.27: 组件间事件传播', () => {
    test('错误处理器的致命错误应该触发状态监控器告警', (done) => {
      statusMonitor.on('health_alert', (alert) => {
        if (alert.message.includes('Critical error occurred')) {
          expect(alert.severity).toBe('critical');
          expect(alert.factor).toBe('errorRate');
          done();
        }
      });

      // 触发致命错误
      errorHandler.handleError(new Error('Authentication failed'));
    });

    test('错误处理器的高错误率应该影响状态监控器健康度', (done) => {
      let highErrorRateDetected = false;
      
      statusMonitor.on('health_alert', (alert) => {
        if (alert.message.includes('High error rate detected') && !highErrorRateDetected) {
          expect(alert.factor).toBe('errorRate');
          highErrorRateDetected = true;
          done();
        }
      });

      // 触发高错误率
      for (let i = 0; i < 10; i++) {
        errorHandler.handleError(new Error(`High rate error ${i}`));
      }
    });

    test('延迟监控器的告警应该触发状态监控器响应', (done) => {
      statusMonitor.on('health_alert', (alert) => {
        if (alert.message.includes('Latency alert')) {
          expect(alert.factor).toBe('latency');
          done();
        }
      });

      // 触发延迟告警
      latencyMonitor.recordNetworkLatency(600); // 超过500ms严重阈值
    });

    test('延迟趋势退化应该影响状态监控器', (done) => {
      statusMonitor.on('health_alert', (alert) => {
        if (alert.message.includes('Performance degradation detected')) {
          expect(alert.factor).toBe('latency');
          done();
        }
      });

      // 模拟性能退化
      for (let i = 0; i < 5; i++) {
        latencyMonitor.recordNetworkLatency(50); // 基线
      }

      setTimeout(() => {
        for (let i = 0; i < 5; i++) {
          latencyMonitor.recordNetworkLatency(150); // 退化
        }
      }, 100);
    }, 10000);

    test('熔断器打开应该影响整体健康度', (done) => {
      statusMonitor.on('status_changed', (event) => {
        if (event.reason === 'Circuit breaker opened') {
          expect(event.currentStatus).toBe(AdapterStatus.ERROR);
          done();
        }
      });

      // 触发熔断器
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`Circuit breaker test ${i}`));
      }
    });
  });

  describe('REQ-2.4.28: 数据流集成', () => {
    test('错误统计应该正确集成到状态快照中', () => {
      // 生成各种类型的错误
      errorHandler.handleError(new Error('Connection failed'));
      errorHandler.handleError(new Error('Parse error'));
      errorHandler.handleError(new Error('Subscribe failed'));

      const snapshot = statusMonitor.createSnapshot();
      
      expect(snapshot.errorStats.total).toBe(3);
      expect(snapshot.errorStats.byCategory[ErrorCategory.CONNECTION]).toBe(1);
      expect(snapshot.errorStats.byCategory[ErrorCategory.DATA_PARSING]).toBe(1);
      expect(snapshot.errorStats.byCategory[ErrorCategory.SUBSCRIPTION]).toBe(1);
    });

    test('延迟统计应该正确集成到状态快照中', () => {
      // 记录各种类型的延迟
      latencyMonitor.recordNetworkLatency(75);
      latencyMonitor.recordProcessingLatency(8);
      latencyMonitor.recordEndToEndLatency(120);

      const snapshot = statusMonitor.createSnapshot();
      
      expect(snapshot.latencyStats[LatencyType.NETWORK]).toBeDefined();
      expect(snapshot.latencyStats[LatencyType.PROCESSING]).toBeDefined();
      expect(snapshot.latencyStats[LatencyType.END_TO_END]).toBeDefined();
      
      expect(snapshot.latencyStats[LatencyType.NETWORK].mean).toBe(75);
      expect(snapshot.latencyStats[LatencyType.PROCESSING].mean).toBe(8);
      expect(snapshot.latencyStats[LatencyType.END_TO_END].mean).toBe(120);
    });

    test('健康度计算应该综合考虑错误率和延迟', () => {
      // 设置良好的基线
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordNetworkLatency(30 + Math.random() * 10);
      }

      const goodSnapshot = statusMonitor.createSnapshot();
      const goodHealth = goodSnapshot.overallHealth;

      // 增加错误和延迟
      for (let i = 0; i < 5; i++) {
        errorHandler.handleError(new Error(`Test error ${i}`));
        latencyMonitor.recordNetworkLatency(200 + Math.random() * 100);
      }

      const degradedSnapshot = statusMonitor.createSnapshot();
      const degradedHealth = degradedSnapshot.overallHealth;

      expect(degradedHealth).toBeLessThan(goodHealth);
      expect(degradedSnapshot.healthFactors.errorRate).toBeLessThan(1.0);
      expect(degradedSnapshot.healthFactors.latency).toBeLessThan(1.0);
    });

    test('监控数据应该在组件间保持一致性', () => {
      // 记录一些数据
      const errors = ['Connection failed', 'Parse error', 'Network timeout'];
      errors.forEach(msg => errorHandler.handleError(new Error(msg)));

      const latencies = [45, 67, 89, 34, 56];
      latencies.forEach(lat => latencyMonitor.recordNetworkLatency(lat));

      // 从不同组件获取数据
      const errorStats = errorHandler.getErrorStats();
      const latencyStats = latencyMonitor.getStats(LatencyType.NETWORK);
      const snapshot = statusMonitor.createSnapshot();

      // 验证数据一致性
      expect(snapshot.errorStats.total).toBe(errorStats.total);
      expect(snapshot.latencyStats[LatencyType.NETWORK].count).toBe(latencyStats!.count);
      expect(snapshot.latencyStats[LatencyType.NETWORK].mean).toBe(latencyStats!.mean);
    });
  });

  describe('REQ-2.4.29: 错误处理链路集成', () => {
    test('连接错误应该触发完整的处理链路', (done) => {
      let errorHandled = false;
      let reconnectRequested = false;
      let healthImpacted = false;

      errorHandler.on('error_handled', (error) => {
        expect(error.category).toBe(ErrorCategory.CONNECTION);
        expect(error.recoveryStrategy).toBe('reconnect');
        errorHandled = true;
        checkCompletion();
      });

      errorHandler.on('reconnect_requested', (error) => {
        expect(error.category).toBe(ErrorCategory.CONNECTION);
        reconnectRequested = true;
        checkCompletion();
      });

      statusMonitor.on('snapshot_created', (snapshot) => {
        if (snapshot.healthFactors.connectivity < 1.0) {
          healthImpacted = true;
          checkCompletion();
        }
      });

      function checkCompletion() {
        if (errorHandled && reconnectRequested && healthImpacted) {
          done();
        }
      }

      // 触发连接错误
      const connectionStats: ConnectionStats[] = [{
        connectionId: 'test-conn',
        state: ConnectionState.ERROR,
        connectedAt: Date.now() - 60000,
        lastActivity: Date.now() - 30000,
        messagesSent: 5,
        messagesReceived: 10,
        bytesReceived: 500,
        latency: 1000,
        activeSubscriptions: 0,
        connectionAttempts: 3,
        successfulConnections: 1,
        lastError: new Error('Connection failed')
      }];

      errorHandler.handleError(new Error('Connection failed'));
      statusMonitor.createSnapshot(connectionStats);
    }, 10000);

    test('数据解析错误应该被忽略但记录在统计中', () => {
      const retryMock = jest.fn();
      const reconnectMock = jest.fn();
      
      errorHandler.on('retry_requested', retryMock);
      errorHandler.on('reconnect_requested', reconnectMock);

      errorHandler.handleError(new Error('Invalid JSON format'));

      const stats = errorHandler.getErrorStats();
      expect(stats.byCategory[ErrorCategory.DATA_PARSING]).toBe(1);
      expect(retryMock).not.toHaveBeenCalled();
      expect(reconnectMock).not.toHaveBeenCalled();

      const snapshot = statusMonitor.createSnapshot();
      expect(snapshot.errorStats.byCategory.data_parsing).toBe(1);
    });

    test('认证错误应该触发严重告警并上报', (done) => {
      let criticalErrorEmitted = false;
      let escalationRequested = false;
      let criticalHealthAlert = false;

      errorHandler.on('critical_error', (error) => {
        expect(error.severity).toBe(ErrorSeverity.CRITICAL);
        expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
        criticalErrorEmitted = true;
        checkCompletion();
      });

      errorHandler.on('escalation_requested', (error) => {
        expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
        escalationRequested = true;
        checkCompletion();
      });

      statusMonitor.on('health_alert', (alert) => {
        if (alert.severity === 'critical' && alert.message.includes('Critical error occurred')) {
          criticalHealthAlert = true;
          checkCompletion();
        }
      });

      function checkCompletion() {
        if (criticalErrorEmitted && escalationRequested && criticalHealthAlert) {
          done();
        }
      }

      errorHandler.handleError(new Error('Authentication failed'));
    });

    test('限流错误应该触发熔断器并影响状态', (done) => {
      let circuitBreakerTriggered = false;
      let statusChanged = false;

      errorHandler.on('circuit_breaker_triggered', (error) => {
        expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
        circuitBreakerTriggered = true;
        checkCompletion();
      });

      statusMonitor.on('status_changed', (event) => {
        if (event.reason === 'Circuit breaker opened') {
          statusChanged = true;
          checkCompletion();
        }
      });

      function checkCompletion() {
        if (circuitBreakerTriggered && statusChanged) {
          done();
        }
      }

      errorHandler.handleError(new Error('Rate limit exceeded'));
    });
  });

  describe('REQ-2.4.30: 监控数据聚合', () => {
    test('应该正确聚合多源监控数据', () => {
      // 模拟复杂的监控场景
      const connectionStats: ConnectionStats[] = [
        {
          connectionId: 'conn-1',
          state: ConnectionState.ACTIVE,
          connectedAt: Date.now() - 120000,
          lastActivity: Date.now(),
          messagesSent: 50,
          messagesReceived: 500,
          bytesReceived: 25000,
          latency: 45,
          activeSubscriptions: 10,
          connectionAttempts: 1,
          successfulConnections: 1,
          lastError: undefined
        },
        {
          connectionId: 'conn-2',
          state: ConnectionState.ACTIVE,
          connectedAt: Date.now() - 90000,
          lastActivity: Date.now(),
          messagesSent: 30,
          messagesReceived: 300,
          bytesReceived: 15000,
          latency: 52,
          activeSubscriptions: 8,
          connectionAttempts: 2,
          successfulConnections: 1,
          lastError: undefined
        }
      ];

      // 记录各种延迟
      const networkLatencies = [40, 45, 50, 55, 48];
      const processingLatencies = [3, 5, 4, 6, 4];
      
      networkLatencies.forEach(lat => latencyMonitor.recordNetworkLatency(lat));
      processingLatencies.forEach(lat => latencyMonitor.recordProcessingLatency(lat));

      // 记录一些错误
      errorHandler.handleError(new Error('Minor connection hiccup'));
      errorHandler.handleError(new Error('Temporary parsing issue'));

      const snapshot = statusMonitor.createSnapshot(connectionStats);

      // 验证聚合结果
      expect(snapshot.subscriptionCount).toBe(18); // 10 + 8
      expect(snapshot.connectionStats).toHaveLength(2);
      expect(snapshot.errorStats.total).toBe(2);
      expect(snapshot.latencyStats[LatencyType.NETWORK].count).toBe(5);
      expect(snapshot.latencyStats[LatencyType.PROCESSING].count).toBe(5);
      
      // 验证健康度综合计算
      expect(snapshot.overallHealth).toBeValidHealthScore();
      expect(snapshot.healthFactors.connectivity).toBeGreaterThan(0.8);
      expect(snapshot.healthFactors.latency).toBeGreaterThan(0.8);
    });

    test('应该提供统一的监控摘要', () => {
      // 设置测试数据
      latencyMonitor.recordNetworkLatency(65);
      latencyMonitor.recordProcessingLatency(7);
      errorHandler.handleError(new Error('Test error'));

      const latencySummary = latencyMonitor.getLatencySummary();
      const errorStats = errorHandler.getErrorStats();
      const snapshot = statusMonitor.createSnapshot();

      // 验证数据可以统一访问
      expect(latencySummary[LatencyType.NETWORK]).toBeDefined();
      expect(latencySummary[LatencyType.PROCESSING]).toBeDefined();
      expect(errorStats.total).toBe(1);
      expect(snapshot.overallHealth).toBeValidHealthScore();

      // 验证数据关联性
      expect(snapshot.latencyStats[LatencyType.NETWORK].mean).toBe(
        latencySummary[LatencyType.NETWORK].current
      );
    });

    test('应该支持历史数据聚合', () => {
      // 创建历史快照
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordNetworkLatency(50 + i * 5);
        if (i % 3 === 0) {
          errorHandler.handleError(new Error(`Historical error ${i}`));
        }
        statusMonitor.createSnapshot();
      }

      const snapshots = statusMonitor.getSnapshots();
      const healthTrend = statusMonitor.getHealthTrend(30);

      expect(snapshots.length).toBe(10);
      expect(healthTrend.length).toBeGreaterThan(0);
      
      // 验证趋势数据
      healthTrend.forEach(point => {
        expect(point.health).toBeValidHealthScore();
        expect(point.timestamp).toBeGreaterThan(0);
      });
    });
  });

  describe('REQ-2.4.31: 告警系统协调', () => {
    test('不同组件的告警应该协调避免重复', (done) => {
      let errorHandlerAlerts = 0;
      let latencyMonitorAlerts = 0;
      let statusMonitorAlerts = 0;

      errorHandler.on('critical_error', () => {
        errorHandlerAlerts++;
      });

      latencyMonitor.on('latency_alert', () => {
        latencyMonitorAlerts++;
      });

      statusMonitor.on('health_alert', () => {
        statusMonitorAlerts++;
      });

      // 触发会导致多个告警的条件
      errorHandler.handleError(new Error('Authentication failed')); // 致命错误
      latencyMonitor.recordNetworkLatency(600); // 延迟告警

      setTimeout(() => {
        expect(errorHandlerAlerts).toBeGreaterThan(0);
        expect(latencyMonitorAlerts).toBeGreaterThan(0);
        expect(statusMonitorAlerts).toBeGreaterThan(0);
        
        // 状态监控器应该聚合这些告警而不是重复发送
        expect(statusMonitorAlerts).toBeLessThan(errorHandlerAlerts + latencyMonitorAlerts);
        done();
      }, 1000);
    }, 10000);

    test('告警优先级应该正确处理', (done) => {
      const alerts: any[] = [];

      statusMonitor.on('health_alert', (alert) => {
        alerts.push(alert);
      });

      // 触发不同严重程度的问题
      errorHandler.handleError(new Error('Connection timeout')); // 中等严重
      errorHandler.handleError(new Error('Authentication failed')); // 致命
      latencyMonitor.recordNetworkLatency(150); // 警告级延迟
      latencyMonitor.recordNetworkLatency(600); // 严重级延迟

      setTimeout(() => {
        expect(alerts.length).toBeGreaterThan(0);
        
        // 应该有致命级别的告警
        const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
        expect(criticalAlerts.length).toBeGreaterThan(0);
        
        done();
      }, 1000);
    }, 10000);

    test('告警风暴保护应该生效', (done) => {
      let alertCount = 0;

      statusMonitor.on('health_alert', () => {
        alertCount++;
      });

      // 在短时间内触发大量相似告警
      for (let i = 0; i < 20; i++) {
        errorHandler.handleError(new Error(`Storm test ${i}`));
        latencyMonitor.recordNetworkLatency(500 + Math.random() * 100);
      }

      setTimeout(() => {
        // 由于冷却期，告警数量应该被限制
        expect(alertCount).toBeLessThan(20);
        expect(alertCount).toBeGreaterThan(0);
        done();
      }, 1000);
    }, 10000);
  });

  describe('REQ-2.4.32: 配置同步', () => {
    test('组件配置更新应该保持同步', (done) => {
      let configUpdateCount = 0;

      const configHandler = () => {
        configUpdateCount++;
        if (configUpdateCount === 3) {
          done();
        }
      };

      errorHandler.on('config_updated', configHandler);
      latencyMonitor.on('config_updated', configHandler);
      statusMonitor.on('config_updated', configHandler);

      // 同时更新所有组件配置
      errorHandler.updateConfig({ circuitBreakerThreshold: 15 });
      latencyMonitor.updateConfig({ 
        thresholds: {
          ...latencyMonitor.getConfig().thresholds,
          [LatencyType.NETWORK]: {
            warning: 80,
            critical: 400,
            p95Warning: 160,
            p99Critical: 800
          }
        }
      });
      statusMonitor.updateConfig({ 
        healthThresholds: { warning: 0.6, critical: 0.3 } 
      });
    });

    test('配置更新应该立即生效', () => {
      // 更新错误处理器配置
      errorHandler.updateConfig({ circuitBreakerThreshold: 5 });

      // 触发熔断器
      for (let i = 0; i < 6; i++) {
        errorHandler.handleError(new Error(`Config test ${i}`));
      }

      expect(errorHandler.isCircuitBreakerOpen()).toBe(true);

      // 更新延迟监控器配置
      latencyMonitor.updateConfig({
        thresholds: {
          ...latencyMonitor.getConfig().thresholds,
          [LatencyType.NETWORK]: {
            warning: 20, // 降低阈值
            critical: 50,
            p95Warning: 40,
            p99Critical: 100
          }
        }
      });

      // 触发新的延迟告警
      const alertHandler = jest.fn();
      latencyMonitor.on('latency_alert', alertHandler);
      
      latencyMonitor.recordNetworkLatency(25); // 现在应该触发告警
      expect(alertHandler).toHaveBeenCalled();
    });
  });

  describe('REQ-2.4.33: 性能集成', () => {
    test('集成监控的性能开销应该可接受', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        // 模拟正常的监控活动
        if (i % 10 === 0) {
          errorHandler.handleError(new Error(`Performance test error ${i}`));
        }
        latencyMonitor.recordNetworkLatency(50 + Math.random() * 20);
        if (i % 5 === 0) {
          statusMonitor.createSnapshot();
        }
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // 平均每次操作应该小于1ms
      expect(avgTime).toBeLessThan(1);
    });

    test('监控数据查询性能应该满足要求', () => {
      // 生成大量监控数据
      for (let i = 0; i < 5000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 100);
        if (i % 100 === 0) {
          errorHandler.handleError(new Error(`Data test ${i}`));
        }
      }

      // 创建多个快照
      for (let i = 0; i < 50; i++) {
        statusMonitor.createSnapshot();
      }

      const queryStartTime = performance.now();

      // 执行各种查询操作
      for (let i = 0; i < 100; i++) {
        errorHandler.getErrorStats();
        latencyMonitor.getAllStats();
        latencyMonitor.getLatencySummary();
        statusMonitor.getLatestSnapshot();
        statusMonitor.getHealthTrend(60);
      }

      const queryEndTime = performance.now();
      const avgQueryTime = (queryEndTime - queryStartTime) / 100;

      // 平均查询时间应该小于5ms
      expect(avgQueryTime).toBeLessThan(5);
    });

    test('内存使用应该在集成环境中保持稳定', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // 运行大量监控操作
      for (let i = 0; i < 10000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 200);
        
        if (i % 50 === 0) {
          errorHandler.handleError(new Error(`Memory test ${i}`));
        }
        
        if (i % 100 === 0) {
          statusMonitor.createSnapshot();
        }
      }

      const afterOperations = process.memoryUsage().heapUsed;
      const memoryIncrease = afterOperations - initialMemory;

      // 内存增长应该合理（小于100MB）
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);

      // 清理操作
      errorHandler.cleanup();
      latencyMonitor.cleanup();
      statusMonitor.reset();

      if (global.gc) {
        global.gc();
      }

      const afterCleanup = process.memoryUsage().heapUsed;
      expect(afterCleanup).toBeLessThan(afterOperations);
    });
  });
});