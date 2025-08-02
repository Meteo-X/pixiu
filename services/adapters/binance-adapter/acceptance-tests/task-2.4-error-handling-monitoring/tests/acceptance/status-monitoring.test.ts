/**
 * 适配器状态监控验收测试
 * 
 * 验证适配器状态监控器的所有功能需求：
 * - 实时状态监控和快照
 * - 健康度评估和评分
 * - 状态变化检测和历史记录
 * - 健康度告警系统
 * - 性能基准比较
 * - 监控数据聚合
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  AdapterStatusMonitor, 
  StatusMonitorConfig,
  AdapterStatusSnapshot,
  HealthFactors,
  HealthAlert,
  StatusChangeEvent
} from '../../../../src/connector/AdapterStatusMonitor';
import { 
  ErrorHandler, 
  ErrorHandlerConfig 
} from '../../../../src/connector/ErrorHandler';
import { 
  LatencyMonitor, 
  LatencyMonitorConfig,
  LatencyType 
} from '../../../../src/connector/LatencyMonitor';
import { 
  AdapterStatus, 
  ConnectionState, 
  ConnectionStats, 
  PerformanceStats 
} from '../../../../src/types';

describe('适配器状态监控器验收测试', () => {
  let statusMonitor: AdapterStatusMonitor;
  let errorHandler: ErrorHandler;
  let latencyMonitor: LatencyMonitor;
  let config: StatusMonitorConfig;

  beforeEach(() => {
    config = {
      updateInterval: 1000, // 1秒，测试时缩短间隔
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
        cooldownPeriod: 5000 // 5秒冷却期
      }
    };

    // 创建依赖组件
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

    errorHandler = new ErrorHandler(errorConfig);
    latencyMonitor = new LatencyMonitor(latencyConfig);
    statusMonitor = new AdapterStatusMonitor(config);

    // 设置组件关联
    statusMonitor.setErrorHandler(errorHandler);
    statusMonitor.setLatencyMonitor(latencyMonitor);

    // 添加到全局清理
    (global as any).addTestEventEmitter(statusMonitor);
    (global as any).addTestEventEmitter(errorHandler);
    (global as any).addTestEventEmitter(latencyMonitor);
  });

  afterEach(() => {
    statusMonitor.stop();
    latencyMonitor.stop();
    errorHandler.reset();
    latencyMonitor.reset();
    statusMonitor.reset();
  });

  describe('REQ-2.4.18: 状态监控和快照', () => {
    test('应该正确跟踪适配器状态变化', (done) => {
      statusMonitor.on('status_changed', (event: StatusChangeEvent) => {
        expect(event.previousStatus).toBe(AdapterStatus.INITIALIZING);
        expect(event.currentStatus).toBe(AdapterStatus.CONNECTING);
        expect(event.reason).toBe('Starting connection');
        expect(event.timestamp).toBeCloseTo(Date.now(), -2);
        done();
      });

      statusMonitor.updateStatus(AdapterStatus.CONNECTING, 'Starting connection');
    });

    test('应该创建完整的状态快照', () => {
      // 设置一些测试数据
      const connectionStats: ConnectionStats[] = [
        {
          connectionId: 'test-conn-1',
          state: ConnectionState.ACTIVE,
          connectedAt: Date.now() - 60000,
          lastActivity: Date.now(),
          messagesSent: 10,
          messagesReceived: 100,
          bytesReceived: 5000,
          latency: 50,
          activeSubscriptions: 5,
          connectionAttempts: 1,
          successfulConnections: 1,
          lastError: undefined
        }
      ];

      const performanceStats: PerformanceStats = {
        latency: {
          current: 50,
          average: 45,
          min: 20,
          max: 80,
          p50: 45,
          p90: 70,
          p95: 75,
          p99: 80
        },
        processingTime: {
          average: 5,
          p95: 8,
          p99: 12
        },
        messagesPerSecond: 800
      };

      // 记录一些延迟数据
      latencyMonitor.recordNetworkLatency(50);
      latencyMonitor.recordProcessingLatency(5);

      const snapshot = statusMonitor.createSnapshot(connectionStats, performanceStats);

      expect(snapshot.timestamp).toBeCloseTo(Date.now(), -2);
      expect(snapshot.status).toBe(AdapterStatus.INITIALIZING);
      expect(snapshot.overallHealth).toBeValidHealthScore();
      expect(snapshot.healthFactors).toBeDefined();
      expect(snapshot.connectionStats).toEqual(connectionStats);
      expect(snapshot.performanceStats).toEqual(performanceStats);
      expect(snapshot.subscriptionCount).toBe(5);
      expect(snapshot.uptime).toBeGreaterThan(0);
    });

    test('应该限制快照历史记录数量', () => {
      // 创建超过保留限制的快照
      for (let i = 0; i < 15; i++) {
        statusMonitor.createSnapshot();
        statusMonitor.updateStatus(
          i % 2 === 0 ? AdapterStatus.ACTIVE : AdapterStatus.CONNECTING,
          `Test update ${i}`
        );
      }

      const snapshots = statusMonitor.getSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(config.snapshotRetention);
    });

    test('应该正确记录状态变化历史', () => {
      const statuses = [
        AdapterStatus.CONNECTING,
        AdapterStatus.ACTIVE,
        AdapterStatus.SUBSCRIBING,
        AdapterStatus.ACTIVE,
        AdapterStatus.ERROR
      ];

      statuses.forEach((status, index) => {
        statusMonitor.updateStatus(status, `Step ${index}`);
      });

      const history = statusMonitor.getStatusHistory();
      expect(history).toHaveLength(statuses.length);
      
      // 验证历史顺序和内容
      statuses.forEach((expectedStatus, index) => {
        expect(history[index].currentStatus).toBe(expectedStatus);
        expect(history[index].reason).toBe(`Step ${index}`);
      });
    });
  });

  describe('REQ-2.4.19: 健康度评估', () => {
    test('应该正确计算连接健康度', () => {
      const goodConnectionStats: ConnectionStats[] = [
        {
          connectionId: 'conn-1',
          state: ConnectionState.ACTIVE,
          connectedAt: Date.now() - 60000,
          lastActivity: Date.now(),
          messagesSent: 10,
          messagesReceived: 100,
          bytesReceived: 5000,
          latency: 50,
          activeSubscriptions: 5,
          connectionAttempts: 1,
          successfulConnections: 1,
          lastError: undefined
        },
        {
          connectionId: 'conn-2',
          state: ConnectionState.ACTIVE,
          connectedAt: Date.now() - 30000,
          lastActivity: Date.now(),
          messagesSent: 5,
          messagesReceived: 50,
          bytesReceived: 2500,
          latency: 40,
          activeSubscriptions: 3,
          connectionAttempts: 1,
          successfulConnections: 1,
          lastError: undefined
        }
      ];

      const snapshot = statusMonitor.createSnapshot(goodConnectionStats);
      
      expect(snapshot.healthFactors.connectivity).toBeValidHealthScore();
      expect(snapshot.healthFactors.connectivity).toBeGreaterThan(0.8); // 应该很健康
    });

    test('应该正确计算延迟健康度', () => {
      // 记录良好的延迟数据
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordNetworkLatency(30 + Math.random() * 10); // 30-40ms
      }

      const snapshot = statusMonitor.createSnapshot();
      
      expect(snapshot.healthFactors.latency).toBeValidHealthScore();
      expect(snapshot.healthFactors.latency).toBeGreaterThan(0.8); // 应该很健康
    });

    test('应该正确计算错误率健康度', () => {
      // 记录一些错误
      for (let i = 0; i < 3; i++) {
        errorHandler.handleError(new Error(`Test error ${i}`));
      }

      const snapshot = statusMonitor.createSnapshot();
      
      expect(snapshot.healthFactors.errorRate).toBeValidHealthScore();
      // 错误率健康度应该受到影响
      expect(snapshot.healthFactors.errorRate).toBeLessThan(1.0);
    });

    test('应该正确计算吞吐量健康度', () => {
      const highThroughputPerf: PerformanceStats = {
        latency: {
          current: 50,
          average: 45,
          min: 20,
          max: 80,
          p50: 45,
          p90: 70,
          p95: 75,
          p99: 80
        },
        processingTime: {
          average: 5,
          p95: 8,
          p99: 12
        },
        messagesPerSecond: 1200 // 超过目标1000
      };

      const snapshot = statusMonitor.createSnapshot([], highThroughputPerf);
      
      expect(snapshot.healthFactors.throughput).toBeValidHealthScore();
      expect(snapshot.healthFactors.throughput).toBeGreaterThan(0.9);
    });

    test('应该正确计算总体健康度', () => {
      // 设置良好的条件
      const goodConnectionStats: ConnectionStats[] = [{
        connectionId: 'test',
        state: ConnectionState.ACTIVE,
        connectedAt: Date.now() - 60000,
        lastActivity: Date.now(),
        messagesSent: 10,
        messagesReceived: 100,
        bytesReceived: 5000,
        latency: 30,
        activeSubscriptions: 5,
        connectionAttempts: 1,
        successfulConnections: 1,
        lastError: undefined
      }];

      const goodPerformanceStats: PerformanceStats = {
        latency: {
          current: 30,
          average: 35,
          min: 20,
          max: 50,
          p50: 35,
          p90: 45,
          p95: 48,
          p99: 50
        },
        processingTime: {
          average: 3,
          p95: 5,
          p99: 8
        },
        messagesPerSecond: 1100
      };

      latencyMonitor.recordNetworkLatency(30);
      latencyMonitor.recordProcessingLatency(3);

      const snapshot = statusMonitor.createSnapshot(goodConnectionStats, goodPerformanceStats);
      
      expect(snapshot.overallHealth).toBeValidHealthScore();
      expect(snapshot.overallHealth).toBeGreaterThan(0.8); // 应该很健康
    });

    test('应该检测健康度下降', () => {
      // 创建不健康的条件
      const poorConnectionStats: ConnectionStats[] = [{
        connectionId: 'test',
        state: ConnectionState.DISCONNECTED,
        connectedAt: Date.now() - 60000,
        lastActivity: Date.now() - 30000,
        messagesSent: 5,
        messagesReceived: 10,
        bytesReceived: 500,
        latency: 500,
        activeSubscriptions: 0,
        connectionAttempts: 5,
        successfulConnections: 1,
        lastError: new Error('Connection failed')
      }];

      const poorPerformanceStats: PerformanceStats = {
        latency: {
          current: 800,
          average: 750,
          min: 500,
          max: 1000,
          p50: 750,
          p90: 900,
          p95: 950,
          p99: 1000
        },
        processingTime: {
          average: 50,
          p95: 80,
          p99: 100
        },
        messagesPerSecond: 50 // 远低于目标
      };

      // 记录高延迟
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordNetworkLatency(600 + Math.random() * 200);
      }

      // 记录错误
      for (let i = 0; i < 8; i++) {
        errorHandler.handleError(new Error(`Test error ${i}`));
      }

      const snapshot = statusMonitor.createSnapshot(poorConnectionStats, poorPerformanceStats);
      
      expect(snapshot.overallHealth).toBeLessThan(0.5); // 健康度应该很低
      expect(snapshot.healthFactors.connectivity).toBeLessThan(0.5);
      expect(snapshot.healthFactors.latency).toBeLessThan(0.5);
      expect(snapshot.healthFactors.throughput).toBeLessThan(0.5);
    });
  });

  describe('REQ-2.4.20: 健康度告警', () => {
    test('应该触发健康度警告告警', (done) => {
      statusMonitor.on('health_alert', (alert: HealthAlert) => {
        expect(alert.severity).toBe('warning');
        expect(alert.factor).toBe('overallHealth');
        expect(alert.value).toBeLessThan(config.healthThresholds.warning);
        expect(alert.message).toContain('below warning threshold');
        done();
      });

      // 创建导致健康度警告的条件
      for (let i = 0; i < 15; i++) {
        latencyMonitor.recordNetworkLatency(400 + Math.random() * 100); // 高延迟
        errorHandler.handleError(new Error(`Warning test error ${i}`));
      }

      // 触发快照创建
      statusMonitor.createSnapshot();
    });

    test('应该触发健康度严重告警', (done) => {
      statusMonitor.on('health_alert', (alert: HealthAlert) => {
        if (alert.severity === 'critical') {
          expect(alert.factor).toBe('overallHealth');
          expect(alert.value).toBeLessThan(config.healthThresholds.critical);
          expect(alert.message).toContain('critically low');
          done();
        }
      });

      // 创建导致健康度严重的条件
      for (let i = 0; i < 25; i++) {
        latencyMonitor.recordNetworkLatency(800 + Math.random() * 200); // 非常高的延迟
        errorHandler.handleError(new Error(`Critical test error ${i}`));
      }

      const criticalConnectionStats: ConnectionStats[] = [{
        connectionId: 'test',
        state: ConnectionState.ERROR,
        connectedAt: Date.now() - 60000,
        lastActivity: Date.now() - 30000,
        messagesSent: 1,
        messagesReceived: 2,
        bytesReceived: 100,
        latency: 1000,
        activeSubscriptions: 0,
        connectionAttempts: 10,
        successfulConnections: 1,
        lastError: new Error('Critical connection failure')
      }];

      const criticalPerformanceStats: PerformanceStats = {
        latency: {
          current: 1000,
          average: 900,
          min: 500,
          max: 1500,
          p50: 900,
          p90: 1200,
          p95: 1400,
          p99: 1500
        },
        processingTime: {
          average: 100,
          p95: 150,
          p99: 200
        },
        messagesPerSecond: 10 // 非常低的吞吐量
      };

      statusMonitor.createSnapshot(criticalConnectionStats, criticalPerformanceStats);
    });

    test('应该为特定健康因子触发告警', (done) => {
      let latencyAlertReceived = false;
      
      statusMonitor.on('health_alert', (alert: HealthAlert) => {
        if (alert.factor === 'latency' && !latencyAlertReceived) {
          expect(alert.severity).toBe('error');
          expect(alert.value).toBeLessThan(config.healthThresholds.critical);
          latencyAlertReceived = true;
          done();
        }
      });

      // 专门创建延迟问题
      for (let i = 0; i < 20; i++) {
        latencyMonitor.recordNetworkLatency(800 + Math.random() * 200);
      }

      statusMonitor.createSnapshot();
    });

    test('应该实施告警冷却期', (done) => {
      let alertCount = 0;
      
      statusMonitor.on('health_alert', (alert: HealthAlert) => {
        alertCount++;
      });

      // 第一次触发告警
      for (let i = 0; i < 20; i++) {
        latencyMonitor.recordNetworkLatency(600);
        errorHandler.handleError(new Error(`Cooldown test ${i}`));
      }
      statusMonitor.createSnapshot();

      // 立即再次触发（应该被冷却期阻止）
      setTimeout(() => {
        for (let i = 0; i < 10; i++) {
          latencyMonitor.recordNetworkLatency(700);
          errorHandler.handleError(new Error(`Cooldown test 2 ${i}`));
        }
        statusMonitor.createSnapshot();
        
        expect(alertCount).toBe(1); // 应该只有一个告警
        done();
      }, 1000);
    }, 10000);
  });

  describe('REQ-2.4.21: 错误和延迟集成', () => {
    test('应该响应错误处理器的致命错误', (done) => {
      statusMonitor.on('health_alert', (alert: HealthAlert) => {
        if (alert.severity === 'critical' && alert.factor === 'errorRate') {
          expect(alert.message).toContain('Critical error occurred');
          done();
        }
      });

      // 触发致命错误
      errorHandler.handleError(new Error('Authentication failed'));
    });

    test('应该响应错误处理器的高错误率', (done) => {
      statusMonitor.on('health_alert', (alert: HealthAlert) => {
        if (alert.factor === 'errorRate' && alert.message.includes('High error rate')) {
          done();
        }
      });

      // 触发高错误率
      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(new Error(`High rate error ${i}`));
      }
    });

    test('应该响应延迟监控器的告警', (done) => {
      statusMonitor.on('health_alert', (alert: HealthAlert) => {
        if (alert.factor === 'latency' && alert.message.includes('Latency alert')) {
          done();
        }
      });

      // 触发延迟告警
      latencyMonitor.recordNetworkLatency(600); // 超过500ms严重阈值
    });
  });

  describe('REQ-2.4.22: 运行时间和稳定性', () => {
    test('应该正确跟踪运行时间', () => {
      const startTime = Date.now();
      
      // 等待一小段时间
      setTimeout(() => {
        const uptime = statusMonitor.getUptime();
        expect(uptime).toBeGreaterThan(0);
        expect(uptime).toBeCloseTo(Date.now() - startTime, -2);
      }, 100);
    });

    test('应该计算稳定性健康度', () => {
      // 让监控器运行一段时间
      setTimeout(() => {
        const snapshot = statusMonitor.createSnapshot();
        expect(snapshot.healthFactors.stability).toBeValidHealthScore();
        expect(snapshot.healthFactors.stability).toBeGreaterThan(0.3); // 新启动的系统
      }, 100);
    });

    test('应该跟踪状态变化对稳定性的影响', () => {
      // 频繁的状态变化应该降低稳定性
      const statuses = [
        AdapterStatus.CONNECTING,
        AdapterStatus.ACTIVE,
        AdapterStatus.ERROR,
        AdapterStatus.CONNECTING,
        AdapterStatus.ACTIVE,
        AdapterStatus.DISCONNECTING,
        AdapterStatus.CONNECTING
      ];

      statuses.forEach(status => {
        statusMonitor.updateStatus(status, 'Stability test');
      });

      const snapshot = statusMonitor.createSnapshot();
      expect(snapshot.healthFactors.stability).toBeLessThan(0.8); // 不稳定
    });
  });

  describe('REQ-2.4.23: 健康度趋势', () => {
    test('应该提供健康度趋势数据', () => {
      // 创建一些历史快照
      for (let i = 0; i < 5; i++) {
        statusMonitor.createSnapshot();
        // 模拟时间流逝
        setTimeout(() => {}, 100);
      }

      const trend = statusMonitor.getHealthTrend(10); // 10分钟内的趋势
      
      expect(Array.isArray(trend)).toBe(true);
      trend.forEach(point => {
        expect(point.timestamp).toBeGreaterThan(0);
        expect(point.health).toBeValidHealthScore();
      });
    });

    test('应该支持自定义趋势时间窗口', () => {
      // 创建多个快照
      for (let i = 0; i < 10; i++) {
        statusMonitor.createSnapshot();
      }

      const shortTrend = statusMonitor.getHealthTrend(5); // 5分钟
      const longTrend = statusMonitor.getHealthTrend(60); // 60分钟

      expect(shortTrend.length).toBeLessThanOrEqual(longTrend.length);
    });
  });

  describe('REQ-2.4.24: 配置管理', () => {
    test('应该支持运行时配置更新', (done) => {
      statusMonitor.on('config_updated', (data) => {
        expect(data.config.healthThresholds.warning).toBe(0.6);
        expect(data.timestamp).toBeCloseTo(Date.now(), -2);
        done();
      });

      const newConfig = {
        healthThresholds: {
          warning: 0.6,
          critical: 0.3
        }
      };

      statusMonitor.updateConfig(newConfig);
    });

    test('配置更新应该重启监控', () => {
      const originalConfig = statusMonitor.getConfig();
      
      const newConfig = {
        updateInterval: 2000
      };

      statusMonitor.updateConfig(newConfig);
      
      const updatedConfig = statusMonitor.getConfig();
      expect(updatedConfig.updateInterval).toBe(2000);
      expect(updatedConfig.healthThresholds).toEqual(originalConfig.healthThresholds);
    });
  });

  describe('REQ-2.4.25: 性能要求', () => {
    test('快照创建性能应满足要求', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        statusMonitor.createSnapshot();
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // 平均快照创建时间应小于5ms
      expect(avgTime).toBeLessThan(5);
    });

    test('健康度计算性能应满足要求', () => {
      // 设置复杂的测试数据
      const connectionStats: ConnectionStats[] = Array.from({ length: 10 }, (_, i) => ({
        connectionId: `conn-${i}`,
        state: ConnectionState.ACTIVE,
        connectedAt: Date.now() - 60000,
        lastActivity: Date.now(),
        messagesSent: 100,
        messagesReceived: 1000,
        bytesReceived: 50000,
        latency: 50,
        activeSubscriptions: 5,
        connectionAttempts: 1,
        successfulConnections: 1,
        lastError: undefined
      }));

      // 记录大量延迟数据
      for (let i = 0; i < 1000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 100);
      }

      // 记录一些错误
      for (let i = 0; i < 50; i++) {
        errorHandler.handleError(new Error(`Performance test error ${i}`));
      }

      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        statusMonitor.createSnapshot(connectionStats);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / 100;

      // 复杂快照的平均创建时间应小于10ms
      expect(avgTime).toBeLessThan(10);
    });

    test('内存使用应保持合理', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 创建大量快照
      for (let i = 0; i < 1000; i++) {
        statusMonitor.createSnapshot();
        statusMonitor.updateStatus(
          i % 2 === 0 ? AdapterStatus.ACTIVE : AdapterStatus.CONNECTING,
          `Memory test ${i}`
        );
      }

      const afterSnapshots = process.memoryUsage().heapUsed;
      const memoryIncrease = afterSnapshots - initialMemory;
      
      // 内存增长应该合理（小于20MB）
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);

      // 重置应该清理内存
      statusMonitor.reset();
      
      if (global.gc) {
        global.gc();
      }

      const afterReset = process.memoryUsage().heapUsed;
      expect(afterReset).toBeLessThan(afterSnapshots);
    });
  });

  describe('REQ-2.4.26: 边界情况', () => {
    test('应该处理空连接统计', () => {
      const snapshot = statusMonitor.createSnapshot([]);
      
      expect(snapshot.healthFactors.connectivity).toBeValidHealthScore();
      expect(snapshot.subscriptionCount).toBe(0);
    });

    test('应该处理未设置监控器的情况', () => {
      const isolatedMonitor = new AdapterStatusMonitor(config);
      (global as any).addTestEventEmitter(isolatedMonitor);
      
      const snapshot = isolatedMonitor.createSnapshot();
      
      expect(snapshot.overallHealth).toBeValidHealthScore();
      expect(snapshot.errorStats).toBeDefined();
      expect(snapshot.latencyStats).toBeDefined();
    });

    test('应该正确处理重置操作', () => {
      // 创建一些状态和快照
      statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Test');
      statusMonitor.createSnapshot();
      statusMonitor.createSnapshot();

      expect(statusMonitor.getSnapshots().length).toBeGreaterThan(0);
      expect(statusMonitor.getStatusHistory().length).toBeGreaterThan(0);
      expect(statusMonitor.getUptime()).toBeGreaterThan(0);

      // 重置
      statusMonitor.reset();

      expect(statusMonitor.getSnapshots().length).toBe(0);
      expect(statusMonitor.getStatusHistory().length).toBe(0);
      expect(statusMonitor.getCurrentStatus()).toBe(AdapterStatus.INITIALIZING);
    });

    test('应该处理快速状态变化', () => {
      const statuses = [
        AdapterStatus.CONNECTING,
        AdapterStatus.ACTIVE,
        AdapterStatus.SUBSCRIBING,
        AdapterStatus.ACTIVE,
        AdapterStatus.ERROR,
        AdapterStatus.CONNECTING,
        AdapterStatus.ACTIVE
      ];

      // 快速状态变化
      statuses.forEach((status, index) => {
        statusMonitor.updateStatus(status, `Rapid change ${index}`);
      });

      const history = statusMonitor.getStatusHistory();
      expect(history.length).toBe(statuses.length);
      
      // 验证所有状态变化都被记录
      statuses.forEach((expectedStatus, index) => {
        expect(history[index].currentStatus).toBe(expectedStatus);
      });
    });
  });
});