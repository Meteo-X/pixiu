/**
 * 真实世界场景测试
 * 
 * 模拟和验证真实世界中可能遇到的各种场景：
 * - 网络中断和恢复
 * - 高负载和压力情况
 * - 服务降级场景
 * - 故障恢复流程
 * - 长时间运行稳定性
 * - 异常处理场景
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  ErrorHandler, 
  ErrorHandlerConfig, 
  ErrorCategory, 
  ErrorSeverity 
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

describe('真实世界场景测试', () => {
  let errorHandler: ErrorHandler;
  let latencyMonitor: LatencyMonitor;
  let statusMonitor: AdapterStatusMonitor;

  beforeEach(() => {
    const errorConfig: ErrorHandlerConfig = {
      maxRecentErrors: 100,
      errorRateWindow: 60000,
      criticalErrorThreshold: 10,
      retryLimits: {
        connection: 5,
        heartbeat: 3,
        protocol: 3,
        data_parsing: 0,
        subscription: 3,
        pubsub: 3,
        config: 0,
        network: 5,
        authentication: 1,
        rate_limit: 0,
        unknown: 2
      },
      circuitBreakerThreshold: 20,
      alerting: {
        enabled: true,
        criticalErrorNotification: true,
        errorRateThreshold: 10
      }
    };

    const latencyConfig: LatencyMonitorConfig = {
      sampling: {
        maxSamples: 5000,
        windowSize: 600000, // 10分钟窗口
        sampleInterval: 5000 // 5秒统计更新
      },
      buckets: {
        boundaries: [0, 5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000]
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
        significantChange: 25
      },
      baseline: {
        enabled: true,
        targetLatency: {
          [LatencyType.NETWORK]: 30,
          [LatencyType.PROCESSING]: 3,
          [LatencyType.END_TO_END]: 50,
          [LatencyType.HEARTBEAT]: 20000,
          [LatencyType.SUBSCRIPTION]: 1000
        },
        acceptableDeviation: 100
      }
    };

    const statusConfig: StatusMonitorConfig = {
      updateInterval: 5000,
      snapshotRetention: 100,
      healthThresholds: {
        warning: 0.75,
        critical: 0.4
      },
      benchmarks: {
        messagesPerSecond: {
          target: 5000,
          warning: 2000,
          critical: 500
        },
        latency: {
          target: 30,
          warning: 100,
          critical: 500
        },
        errorRate: {
          target: 0.5,
          warning: 2,
          critical: 5
        },
        connectionSuccess: {
          target: 99.5,
          warning: 98,
          critical: 95
        }
      },
      alerting: {
        enabled: true,
        cooldownPeriod: 10000
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

  describe('REQ-2.4.55: 网络中断和恢复场景', () => {
    test('应该正确处理网络中断场景', async () => {
      // 阶段1：正常运行
      statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Normal operation');
      
      for (let i = 0; i < 50; i++) {
        latencyMonitor.recordNetworkLatency(20 + Math.random() * 10);
        latencyMonitor.recordProcessingLatency(2 + Math.random() * 2);
      }

      const normalSnapshot = statusMonitor.createSnapshot();
      expect(normalSnapshot.overallHealth).toBeGreaterThan(0.8);

      // 阶段2：网络开始不稳定
      statusMonitor.updateStatus(AdapterStatus.CONNECTING, 'Network instability detected');
      
      for (let i = 0; i < 20; i++) {
        // 模拟网络延迟增加
        latencyMonitor.recordNetworkLatency(100 + Math.random() * 200);
        
        // 模拟间歇性连接错误
        if (i % 3 === 0) {
          errorHandler.handleError(new Error('Connection timeout'));
        }
      }

      // 阶段3：网络完全中断
      statusMonitor.updateStatus(AdapterStatus.DISCONNECTED, 'Network disconnected');
      
      for (let i = 0; i < 10; i++) {
        errorHandler.handleError(new Error('Network unreachable'));
        errorHandler.handleError(new Error('Connection failed'));
      }

      const disconnectedSnapshot = statusMonitor.createSnapshot();
      expect(disconnectedSnapshot.overallHealth).toBeLessThan(0.5);
      expect(disconnectedSnapshot.healthFactors.connectivity).toBeLessThan(0.3);

      // 阶段4：网络恢复
      statusMonitor.updateStatus(AdapterStatus.CONNECTING, 'Attempting reconnection');
      
      // 模拟重连过程中的延迟和错误
      for (let i = 0; i < 15; i++) {
        if (i < 10) {
          // 初期重连延迟较高
          latencyMonitor.recordNetworkLatency(300 + Math.random() * 200);
          if (i % 2 === 0) {
            errorHandler.handleError(new Error('Reconnection failed'));
          }
        } else {
          // 后期连接稳定
          latencyMonitor.recordNetworkLatency(30 + Math.random() * 20);
        }
      }

      statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Connection restored');
      
      // 阶段5：完全恢复
      for (let i = 0; i < 30; i++) {
        latencyMonitor.recordNetworkLatency(25 + Math.random() * 15);
        latencyMonitor.recordProcessingLatency(3 + Math.random() * 2);
      }

      const recoveredSnapshot = statusMonitor.createSnapshot();
      expect(recoveredSnapshot.overallHealth).toBeGreaterThan(0.7);

      // 验证整个过程的状态变化
      const statusHistory = statusMonitor.getStatusHistory();
      const expectedStatuses = [
        AdapterStatus.ACTIVE,
        AdapterStatus.CONNECTING,
        AdapterStatus.DISCONNECTED,
        AdapterStatus.CONNECTING,
        AdapterStatus.ACTIVE
      ];

      expectedStatuses.forEach((expectedStatus, index) => {
        expect(statusHistory[index].currentStatus).toBe(expectedStatus);
      });
    });

    test('应该在网络抖动时保持稳定', () => {
      let reconnectCount = 0;
      let retryCount = 0;

      errorHandler.on('reconnect_requested', () => {
        reconnectCount++;
      });

      errorHandler.on('retry_requested', () => {
        retryCount++;
      });

      // 模拟网络抖动：间歇性连接问题
      for (let cycle = 0; cycle < 10; cycle++) {
        // 正常期间
        for (let i = 0; i < 20; i++) {
          latencyMonitor.recordNetworkLatency(30 + Math.random() * 20);
        }

        // 抖动期间
        for (let i = 0; i < 5; i++) {
          latencyMonitor.recordNetworkLatency(200 + Math.random() * 300);
          if (i % 2 === 0) {
            errorHandler.handleError(new Error('Connection timeout'));
          }
        }
      }

      // 验证系统响应
      expect(reconnectCount).toBeGreaterThan(0);
      expect(reconnectCount).toBeLessThan(30); // 不应该过度重连

      const snapshot = statusMonitor.createSnapshot();
      expect(snapshot.healthFactors.stability).toBeGreaterThan(0.3); // 应该保持一定稳定性
    });
  });

  describe('REQ-2.4.56: 高负载和压力场景', () => {
    test('应该在高消息量场景下保持性能', () => {
      const messageCount = 10000;
      const startTime = Date.now();

      // 模拟高频消息处理
      for (let i = 0; i < messageCount; i++) {
        // 正常延迟分布
        const networkLatency = 20 + Math.random() * 60; // 20-80ms
        const processingLatency = 1 + Math.random() * 8; // 1-9ms
        
        latencyMonitor.recordNetworkLatency(networkLatency);
        latencyMonitor.recordProcessingLatency(processingLatency);
        
        // 偶发错误（1%错误率）
        if (Math.random() < 0.01) {
          errorHandler.handleError(new Error(`Processing error ${i}`));
        }

        // 定期创建快照
        if (i % 1000 === 0) {
          statusMonitor.createSnapshot();
        }
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      const messagesPerSecond = messageCount / (processingTime / 1000);

      // 验证性能指标
      expect(messagesPerSecond).toBeGreaterThan(1000); // 至少1000消息/秒

      const finalSnapshot = statusMonitor.createSnapshot();
      expect(finalSnapshot.overallHealth).toBeGreaterThan(0.7);
      expect(finalSnapshot.healthFactors.throughput).toBeGreaterThan(0.6);
      expect(finalSnapshot.healthFactors.latency).toBeGreaterThan(0.6);

      // 验证错误率在可接受范围内
      const errorStats = errorHandler.getErrorStats();
      const errorRate = (errorStats.total / messageCount) * 100;
      expect(errorRate).toBeLessThan(2); // 错误率小于2%
    });

    test('应该在延迟峰值场景下触发适当告警', (done) => {
      let criticalAlerts = 0;
      let warningAlerts = 0;

      latencyMonitor.on('latency_alert', (alert) => {
        if (alert.severity === 'critical') {
          criticalAlerts++;
        } else if (alert.severity === 'high') {
          warningAlerts++;
        }
      });

      statusMonitor.on('health_alert', (alert) => {
        if (alert.factor === 'latency') {
          expect(alert.value).toBeLessThan(1.0);
        }
      });

      // 模拟延迟峰值场景
      const scenarios = [
        { duration: 50, latencyRange: [20, 60] },   // 正常阶段
        { duration: 20, latencyRange: [100, 300] }, // 警告阶段
        { duration: 10, latencyRange: [500, 1000] }, // 严重阶段
        { duration: 30, latencyRange: [30, 80] }    // 恢复阶段
      ];

      let messageIndex = 0;
      scenarios.forEach((scenario, scenarioIndex) => {
        setTimeout(() => {
          for (let i = 0; i < scenario.duration; i++) {
            const latency = scenario.latencyRange[0] + 
                          Math.random() * (scenario.latencyRange[1] - scenario.latencyRange[0]);
            latencyMonitor.recordNetworkLatency(latency);
            messageIndex++;
          }

          if (scenarioIndex === scenarios.length - 1) {
            // 所有场景完成，验证结果
            setTimeout(() => {
              expect(warningAlerts).toBeGreaterThan(0);
              expect(criticalAlerts).toBeGreaterThan(0);
              
              const snapshot = statusMonitor.createSnapshot();
              expect(snapshot.healthFactors.latency).toBeLessThan(0.9); // 延迟健康度应该受影响
              done();
            }, 1000);
          }
        }, scenarioIndex * 500);
      });
    }, 15000);

    test('应该在连接池耗尽场景下正确处理', () => {
      // 模拟大量连接请求导致连接池耗尽
      const connectionStats: ConnectionStats[] = [];
      
      // 创建接近极限的连接统计
      for (let i = 0; i < 5; i++) {
        connectionStats.push({
          connectionId: `high-load-conn-${i}`,
          state: i < 3 ? ConnectionState.ACTIVE : ConnectionState.ERROR,
          connectedAt: Date.now() - 300000,
          lastActivity: Date.now() - (i * 10000),
          messagesSent: 1000 + i * 200,
          messagesReceived: 10000 + i * 2000,
          bytesReceived: 500000 + i * 100000,
          latency: 50 + i * 50,
          activeSubscriptions: 50 + i * 10,
          connectionAttempts: i < 3 ? 1 : 5 + i,
          successfulConnections: i < 3 ? 1 : 1,
          lastError: i >= 3 ? new Error('Connection pool exhausted') : undefined
        });
      }

      // 记录连接相关错误
      for (let i = 0; i < 20; i++) {
        errorHandler.handleError(new Error('Too many connections'));
        errorHandler.handleError(new Error('Connection pool full'));
      }

      const snapshot = statusMonitor.createSnapshot(connectionStats);
      
      expect(snapshot.healthFactors.connectivity).toBeLessThan(0.8);
      expect(snapshot.errorStats.byCategory[ErrorCategory.CONNECTION]).toBeGreaterThan(10);
      
      // 验证恢复策略
      const errorStats = errorHandler.getErrorStats();
      expect(errorStats.byRecoveryStrategy.reconnect).toBeGreaterThan(10);
    });
  });

  describe('REQ-2.4.57: 服务降级场景', () => {
    test('应该在服务质量下降时实施降级策略', () => {
      let circuitBreakerTriggered = false;
      let degradationDetected = false;

      errorHandler.on('circuit_breaker_opened', () => {
        circuitBreakerTriggered = true;
      });

      statusMonitor.on('health_alert', (alert) => {
        if (alert.severity === 'critical' && alert.value < 0.4) {
          degradationDetected = true;
        }
      });

      // 阶段1：逐步降级
      const degradationPhases = [
        { errorCount: 5, latencyMultiplier: 1.5 },
        { errorCount: 10, latencyMultiplier: 2.0 },
        { errorCount: 15, latencyMultiplier: 3.0 },
        { errorCount: 25, latencyMultiplier: 5.0 }
      ];

      degradationPhases.forEach((phase, index) => {
        // 增加错误
        for (let i = 0; i < phase.errorCount; i++) {
          errorHandler.handleError(new Error(`Degradation phase ${index} error ${i}`));
        }

        // 增加延迟
        for (let i = 0; i < 20; i++) {
          const baseLatency = 30;
          const degradedLatency = baseLatency * phase.latencyMultiplier;
          latencyMonitor.recordNetworkLatency(degradedLatency + Math.random() * 50);
        }

        statusMonitor.createSnapshot();
      });

      expect(circuitBreakerTriggered).toBe(true);
      expect(degradationDetected).toBe(true);

      const finalSnapshot = statusMonitor.createSnapshot();
      expect(finalSnapshot.overallHealth).toBeLessThan(0.5);
    });

    test('应该在部分功能失效时继续工作', () => {
      // 模拟部分功能失效场景
      const scenarios = [
        { name: 'subscription_failure', errorType: 'Subscribe failed', impact: 0.3 },
        { name: 'parsing_issues', errorType: 'Parse error', impact: 0.2 },
        { name: 'pubsub_delays', errorType: 'PubSub timeout', impact: 0.4 }
      ];

      scenarios.forEach(scenario => {
        // 模拟特定功能的错误
        for (let i = 0; i < 10; i++) {
          errorHandler.handleError(new Error(scenario.errorType));
        }

        // 其他功能正常
        for (let i = 0; i < 50; i++) {
          latencyMonitor.recordNetworkLatency(25 + Math.random() * 15);
          latencyMonitor.recordProcessingLatency(2 + Math.random() * 3);
        }
      });

      const snapshot = statusMonitor.createSnapshot();
      
      // 系统应该仍然部分可用
      expect(snapshot.overallHealth).toBeGreaterThan(0.3);
      expect(snapshot.overallHealth).toBeLessThan(0.8);

      // 验证错误分布
      const errorStats = errorHandler.getErrorStats();
      expect(errorStats.byCategory[ErrorCategory.SUBSCRIPTION]).toBeGreaterThan(0);
      expect(errorStats.byCategory[ErrorCategory.DATA_PARSING]).toBeGreaterThan(0);
      expect(errorStats.byCategory[ErrorCategory.PUBSUB]).toBeGreaterThan(0);
    });
  });

  describe('REQ-2.4.58: 故障恢复流程', () => {
    test('应该实现完整的故障恢复流程', async () => {
      const recoveryEvents: string[] = [];

      // 监听各种恢复事件
      errorHandler.on('retry_requested', () => {
        recoveryEvents.push('retry_requested');
      });

      errorHandler.on('reconnect_requested', () => {
        recoveryEvents.push('reconnect_requested');
      });

      errorHandler.on('circuit_breaker_opened', () => {
        recoveryEvents.push('circuit_breaker_opened');
      });

      errorHandler.on('circuit_breaker_closed', () => {
        recoveryEvents.push('circuit_breaker_closed');
      });

      statusMonitor.on('status_changed', (event) => {
        recoveryEvents.push(`status_${event.currentStatus}`);
      });

      // 阶段1：故障发生
      statusMonitor.updateStatus(AdapterStatus.ERROR, 'System failure detected');
      
      for (let i = 0; i < 25; i++) {
        errorHandler.handleError(new Error(`System failure ${i}`));
        latencyMonitor.recordNetworkLatency(800 + Math.random() * 400);
      }

      // 等待熔断器触发
      await new Promise(resolve => setTimeout(resolve, 100));

      // 阶段2：恢复尝试
      statusMonitor.updateStatus(AdapterStatus.CONNECTING, 'Recovery attempt');
      
      // 模拟逐步恢复
      for (let attempt = 0; attempt < 5; attempt++) {
        for (let i = 0; i < 10; i++) {
          // 恢复期间延迟逐步改善
          const recoveryLatency = 400 - (attempt * 60) + Math.random() * 100;
          latencyMonitor.recordNetworkLatency(Math.max(50, recoveryLatency));
          
          // 错误逐步减少
          if (Math.random() < (0.8 - attempt * 0.15)) {
            errorHandler.handleError(new Error(`Recovery attempt ${attempt} error ${i}`));
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 阶段3：完全恢复
      statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'System recovered');
      
      for (let i = 0; i < 30; i++) {
        latencyMonitor.recordNetworkLatency(30 + Math.random() * 20);
        latencyMonitor.recordProcessingLatency(3 + Math.random() * 2);
      }

      // 验证恢复流程
      expect(recoveryEvents).toContain('circuit_breaker_opened');
      expect(recoveryEvents).toContain('reconnect_requested');
      expect(recoveryEvents).toContain('status_error');
      expect(recoveryEvents).toContain('status_connecting');
      expect(recoveryEvents).toContain('status_active');

      const finalSnapshot = statusMonitor.createSnapshot();
      expect(finalSnapshot.overallHealth).toBeGreaterThan(0.7);
      expect(finalSnapshot.status).toBe(AdapterStatus.ACTIVE);
    });

    test('应该支持渐进式恢复策略', () => {
      // 模拟渐进式恢复：从严重故障逐步恢复到正常
      const recoveryStages = [
        { stage: 'critical', healthTarget: 0.2, errors: 30, latency: [500, 1000] },
        { stage: 'degraded', healthTarget: 0.4, errors: 15, latency: [200, 400] },
        { stage: 'warning', healthTarget: 0.6, errors: 8, latency: [100, 200] },
        { stage: 'stable', healthTarget: 0.8, errors: 2, latency: [30, 80] }
      ];

      const healthProgression: number[] = [];

      recoveryStages.forEach((stage, index) => {
        // 生成当前阶段的错误
        for (let i = 0; i < stage.errors; i++) {
          errorHandler.handleError(new Error(`Recovery stage ${stage.stage} error ${i}`));
        }

        // 生成当前阶段的延迟
        for (let i = 0; i < 20; i++) {
          const latency = stage.latency[0] + Math.random() * (stage.latency[1] - stage.latency[0]);
          latencyMonitor.recordNetworkLatency(latency);
        }

        const snapshot = statusMonitor.createSnapshot();
        healthProgression.push(snapshot.overallHealth);

        // 更新状态
        if (stage.stage === 'critical') {
          statusMonitor.updateStatus(AdapterStatus.ERROR, 'Critical failure');
        } else if (stage.stage === 'degraded') {
          statusMonitor.updateStatus(AdapterStatus.CONNECTING, 'Recovery in progress');
        } else if (stage.stage === 'stable') {
          statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Recovery complete');
        }
      });

      // 验证健康度逐步提升
      for (let i = 1; i < healthProgression.length; i++) {
        expect(healthProgression[i]).toBeGreaterThanOrEqual(healthProgression[i - 1] * 0.8);
      }

      expect(healthProgression[0]).toBeLessThan(0.4); // 开始时健康度低
      expect(healthProgression[healthProgression.length - 1]).toBeGreaterThan(0.7); // 结束时健康度高
    });
  });

  describe('REQ-2.4.59: 长时间运行稳定性', () => {
    test('应该在长时间运行中保持性能稳定', () => {
      const samplingPoints = 20;
      const operationsPerPoint = 500;
      const performanceMetrics: number[] = [];
      const healthMetrics: number[] = [];

      for (let point = 0; point < samplingPoints; point++) {
        const startTime = performance.now();

        // 模拟正常运行期间的各种操作
        for (let i = 0; i < operationsPerPoint; i++) {
          // 正常延迟分布
          latencyMonitor.recordNetworkLatency(25 + Math.random() * 30);
          latencyMonitor.recordProcessingLatency(2 + Math.random() * 4);
          
          // 偶发错误（0.5%错误率）
          if (Math.random() < 0.005) {
            const errorTypes = [
              'Temporary network glitch',
              'Minor parsing issue',
              'Transient connection problem'
            ];
            const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
            errorHandler.handleError(new Error(errorType));
          }
        }

        const endTime = performance.now();
        const operationTime = endTime - startTime;
        performanceMetrics.push(operationTime);

        // 记录健康度
        const snapshot = statusMonitor.createSnapshot();
        healthMetrics.push(snapshot.overallHealth);

        // 定期清理（模拟内存管理）
        if (point % 5 === 0) {
          errorHandler.cleanup(300000); // 清理5分钟前的数据
          latencyMonitor.cleanup(600000); // 清理10分钟前的数据
        }
      }

      // 分析性能稳定性
      const avgPerformance = performanceMetrics.reduce((sum, val) => sum + val, 0) / performanceMetrics.length;
      const performanceVariance = performanceMetrics.reduce((sum, val) => sum + Math.pow(val - avgPerformance, 2), 0) / performanceMetrics.length;
      const performanceStdDev = Math.sqrt(performanceVariance);

      // 性能应该稳定（标准差不超过平均值的50%）
      expect(performanceStdDev).toBeLessThan(avgPerformance * 0.5);

      // 分析健康度稳定性
      const avgHealth = healthMetrics.reduce((sum, val) => sum + val, 0) / healthMetrics.length;
      const minHealth = Math.min(...healthMetrics);
      const maxHealth = Math.max(...healthMetrics);

      // 健康度应该保持在合理范围内
      expect(avgHealth).toBeGreaterThan(0.8);
      expect(minHealth).toBeGreaterThan(0.7);
      expect(maxHealth - minHealth).toBeLessThan(0.3); // 波动范围小于30%
    });

    test('应该正确处理内存清理和数据轮转', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const memorySnapshots: number[] = [];

      // 长时间运行模拟
      for (let cycle = 0; cycle < 50; cycle++) {
        // 每个周期生成数据
        for (let i = 0; i < 200; i++) {
          latencyMonitor.recordNetworkLatency(Math.random() * 100);
          latencyMonitor.recordProcessingLatency(Math.random() * 20);
          
          if (i % 20 === 0) {
            errorHandler.handleError(new Error(`Cycle ${cycle} error ${i}`));
          }
        }

        statusMonitor.createSnapshot();

        // 定期清理
        if (cycle % 10 === 0) {
          errorHandler.cleanup(60000);
          latencyMonitor.cleanup(300000);
          
          // 记录内存使用
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // 内存增长应该可控（小于100MB）
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024);

      // 验证数据仍然可用
      const errorStats = errorHandler.getErrorStats();
      const latencyStats = latencyMonitor.getStats(LatencyType.NETWORK);
      const snapshot = statusMonitor.getLatestSnapshot();

      expect(errorStats.total).toBeGreaterThan(0);
      expect(latencyStats?.count).toBeGreaterThan(0);
      expect(snapshot).toBeDefined();
    });
  });

  describe('REQ-2.4.60: 异常处理场景', () => {
    test('应该处理极端异常输入', () => {
      const extremeInputs = [
        // 极大值
        { latency: Number.MAX_SAFE_INTEGER, description: 'Maximum safe integer latency' },
        { latency: 1e10, description: 'Very large latency' },
        
        // 边界值
        { latency: 0, description: 'Zero latency' },
        { latency: 0.1, description: 'Very small latency' },
        
        // 特殊值
        { latency: NaN, description: 'NaN latency' },
        { latency: Infinity, description: 'Infinite latency' },
        { latency: -100, description: 'Negative latency' }
      ];

      let validRecords = 0;
      let invalidRecords = 0;

      extremeInputs.forEach(input => {
        try {
          latencyMonitor.recordNetworkLatency(input.latency);
          if (isFinite(input.latency) && input.latency >= 0) {
            validRecords++;
          }
        } catch (error) {
          // 应该优雅处理，不抛出异常
          expect(error).toBeUndefined();
        }
      });

      // 验证系统仍然可用
      latencyMonitor.recordNetworkLatency(50);
      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(stats).toBeDefined();
      expect(stats!.count).toBeGreaterThan(0);
    });

    test('应该处理并发访问冲突', async () => {
      const concurrentOperations = 20;
      const operationsPerWorker = 100;

      const workers = Array.from({ length: concurrentOperations }, async (_, workerId) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            for (let i = 0; i < operationsPerWorker; i++) {
              try {
                // 混合操作类型
                if (i % 3 === 0) {
                  errorHandler.handleError(new Error(`Concurrent worker ${workerId} error ${i}`));
                } else if (i % 3 === 1) {
                  latencyMonitor.recordNetworkLatency(Math.random() * 100);
                } else {
                  statusMonitor.createSnapshot();
                }
              } catch (error) {
                // 记录但不失败
                console.warn(`Worker ${workerId} operation ${i} failed:`, error);
              }
            }
            resolve();
          }, Math.random() * 100); // 随机延迟启动
        });
      });

      await Promise.all(workers);

      // 验证系统状态一致性
      const errorStats = errorHandler.getErrorStats();
      const latencyStats = latencyMonitor.getStats(LatencyType.NETWORK);
      const snapshots = statusMonitor.getSnapshots();

      expect(errorStats.total).toBeGreaterThan(0);
      expect(latencyStats?.count).toBeGreaterThan(0);
      expect(snapshots.length).toBeGreaterThan(0);

      // 验证数据完整性
      expect(errorStats.total).toBeLessThanOrEqual(concurrentOperations * operationsPerWorker);
      expect(latencyStats!.count).toBeLessThanOrEqual(concurrentOperations * operationsPerWorker);
    });

    test('应该处理资源耗尽场景', () => {
      // 模拟内存压力
      const largeDataSets: any[] = [];
      
      try {
        // 快速生成大量数据
        for (let i = 0; i < 1000; i++) {
          // 生成大量监控数据
          for (let j = 0; j < 100; j++) {
            latencyMonitor.recordNetworkLatency(Math.random() * 1000);
            errorHandler.handleError(new Error(`Resource pressure test ${i}-${j}`));
          }

          statusMonitor.createSnapshot();

          // 模拟内存压力
          largeDataSets.push(new Array(1000).fill(`data-${i}`));
        }
      } catch (error) {
        // 系统应该优雅处理资源压力
        console.warn('Resource pressure detected:', error);
      }

      // 执行清理
      errorHandler.cleanup(0);
      latencyMonitor.cleanup(0);

      // 清理测试数据
      largeDataSets.length = 0;

      // 验证系统仍然响应
      latencyMonitor.recordNetworkLatency(50);
      errorHandler.handleError(new Error('Post-cleanup test'));
      const snapshot = statusMonitor.createSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.overallHealth).toBeGreaterThanOrEqual(0);
    });

    test('应该处理配置热更新异常', () => {
      const invalidConfigs = [
        // ErrorHandler 无效配置
        { maxRecentErrors: -1 },
        { errorRateWindow: 0 },
        { circuitBreakerThreshold: -5 },
        
        // LatencyMonitor 无效配置  
        { sampling: { maxSamples: 0 } },
        { buckets: { boundaries: [] } },
        { thresholds: null },
        
        // StatusMonitor 无效配置
        { updateInterval: -1000 },
        { healthThresholds: { warning: 2.0, critical: 3.0 } },
        { snapshotRetention: -10 }
      ];

      // 记录原始配置
      const originalErrorConfig = errorHandler.getConfig();
      const originalLatencyConfig = latencyMonitor.getConfig();
      const originalStatusConfig = statusMonitor.getConfig();

      invalidConfigs.forEach((invalidConfig, index) => {
        try {
          if (index < 3) {
            errorHandler.updateConfig(invalidConfig);
          } else if (index < 6) {
            latencyMonitor.updateConfig(invalidConfig);
          } else {
            statusMonitor.updateConfig(invalidConfig);
          }
        } catch (error) {
          // 应该优雅处理无效配置
          expect(error).toBeDefined();
        }
      });

      // 验证系统仍然使用有效配置
      const currentErrorConfig = errorHandler.getConfig();
      const currentLatencyConfig = latencyMonitor.getConfig();
      const currentStatusConfig = statusMonitor.getConfig();

      // 配置应该保持合理性（可能回退到默认值或拒绝无效值）
      expect(currentErrorConfig.maxRecentErrors).toBeGreaterThan(0);
      expect(currentLatencyConfig.sampling.maxSamples).toBeGreaterThan(0);
      expect(currentStatusConfig.updateInterval).toBeGreaterThan(0);

      // 系统应该仍然正常工作
      errorHandler.handleError(new Error('Config test error'));
      latencyMonitor.recordNetworkLatency(50);
      const snapshot = statusMonitor.createSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.overallHealth).toBeGreaterThanOrEqual(0);
    });
  });
});