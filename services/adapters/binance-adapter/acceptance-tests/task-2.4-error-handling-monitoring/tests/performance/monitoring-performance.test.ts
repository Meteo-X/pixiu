/**
 * 监控系统性能测试
 * 
 * 验证错误处理和监控系统的性能要求：
 * - 错误处理性能
 * - 延迟监控性能
 * - 状态监控性能
 * - 内存使用和泄漏
 * - 高负载下的稳定性
 * - 并发处理能力
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
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
  AdapterStatusMonitor, 
  StatusMonitorConfig 
} from '../../../../src/connector/AdapterStatusMonitor';
import { 
  AdapterStatus, 
  ConnectionState, 
  ConnectionStats 
} from '../../../../src/types';

describe('监控系统性能测试', () => {
  let errorHandler: ErrorHandler;
  let latencyMonitor: LatencyMonitor;
  let statusMonitor: AdapterStatusMonitor;

  beforeEach(() => {
    // 性能测试配置
    const errorConfig: ErrorHandlerConfig = {
      maxRecentErrors: 1000,
      errorRateWindow: 60000,
      criticalErrorThreshold: 50,
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
      circuitBreakerThreshold: 100,
      alerting: {
        enabled: true,
        criticalErrorNotification: true,
        errorRateThreshold: 50
      }
    };

    const latencyConfig: LatencyMonitorConfig = {
      sampling: {
        maxSamples: 10000,
        windowSize: 300000,
        sampleInterval: 100 // 更频繁的更新用于性能测试
      },
      buckets: {
        boundaries: [0, 1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
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
      updateInterval: 100, // 更频繁的更新
      snapshotRetention: 100,
      healthThresholds: {
        warning: 0.7,
        critical: 0.4
      },
      benchmarks: {
        messagesPerSecond: {
          target: 10000, // 高吞吐量目标
          warning: 5000,
          critical: 1000
        },
        latency: {
          target: 10,
          warning: 50,
          critical: 200
        },
        errorRate: {
          target: 0.1,
          warning: 1,
          critical: 5
        },
        connectionSuccess: {
          target: 99.9,
          warning: 99,
          critical: 95
        }
      },
      alerting: {
        enabled: true,
        cooldownPeriod: 1000 // 短冷却期用于性能测试
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

  describe('REQ-2.4.43: 错误处理性能', () => {
    test('单个错误处理应该在1ms内完成', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        errorHandler.handleError(new Error(`Performance test error ${i}`));
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(1); // 平均处理时间 < 1ms
    });

    test('高频错误处理应该保持稳定性能', () => {
      const batchSize = 1000;
      const batchCount = 10;
      const times: number[] = [];

      for (let batch = 0; batch < batchCount; batch++) {
        const startTime = performance.now();
        
        for (let i = 0; i < batchSize; i++) {
          errorHandler.handleError(new Error(`Batch ${batch} error ${i}`));
        }
        
        const endTime = performance.now();
        times.push((endTime - startTime) / batchSize);
      }

      // 计算标准差，验证性能稳定性
      const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
      const variance = times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / times.length;
      const stdDev = Math.sqrt(variance);

      expect(mean).toBeLessThan(1); // 平均时间 < 1ms
      expect(stdDev).toBeLessThan(0.5); // 标准差 < 0.5ms，确保稳定性
    });

    test('错误统计查询应该在10ms内完成', () => {
      // 先生成大量错误数据
      for (let i = 0; i < 10000; i++) {
        errorHandler.handleError(new Error(`Stats test error ${i}`));
      }

      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        errorHandler.getErrorStats();
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(10); // 平均查询时间 < 10ms
    });

    test('内存使用应该随着清理操作保持稳定', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 生成大量错误
      for (let cycle = 0; cycle < 10; cycle++) {
        for (let i = 0; i < 1000; i++) {
          errorHandler.handleError(new Error(`Memory test ${cycle}-${i}`));
        }
        
        // 定期清理
        if (cycle % 3 === 0) {
          errorHandler.cleanup(30000); // 清理30秒前的数据
        }
      }

      // 强制垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // 内存增长应该合理（小于50MB）
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('并发错误处理应该保持性能', async () => {
      const concurrency = 10;
      const errorsPerWorker = 1000;
      
      const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
        const startTime = performance.now();
        
        for (let i = 0; i < errorsPerWorker; i++) {
          errorHandler.handleError(new Error(`Concurrent worker ${workerIndex} error ${i}`));
        }
        
        const endTime = performance.now();
        return (endTime - startTime) / errorsPerWorker;
      });

      const results = await Promise.all(workers);
      const maxTime = Math.max(...results);
      const avgTime = results.reduce((sum, time) => sum + time, 0) / results.length;

      expect(avgTime).toBeLessThan(2); // 并发情况下平均时间 < 2ms
      expect(maxTime).toBeLessThan(5); // 最大时间 < 5ms
    });
  });

  describe('REQ-2.4.44: 延迟监控性能', () => {
    test('单次延迟记录应该在0.1ms内完成', () => {
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 100);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(0.1); // 平均记录时间 < 0.1ms
    });

    test('延迟统计计算应该在100ms内完成', () => {
      // 生成大量延迟数据
      for (let i = 0; i < 50000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 1000);
        if (i % 5 === 0) {
          latencyMonitor.recordProcessingLatency(Math.random() * 50);
        }
      }

      const startTime = performance.now();
      
      const stats = latencyMonitor.getAllStats();
      const buckets = latencyMonitor.getBuckets(LatencyType.NETWORK);
      const summary = latencyMonitor.getLatencySummary();
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(100); // 总计算时间 < 100ms
      expect(Object.keys(stats)).toHaveLength(5); // 验证数据完整性
      expect(buckets.length).toBeGreaterThan(0);
      expect(Object.keys(summary)).toHaveLength(5);
    });

    test('高频延迟记录应该保持低延迟', () => {
      const highFrequencyTest = () => {
        const batchSize = 1000;
        const startTime = performance.now();
        
        for (let i = 0; i < batchSize; i++) {
          latencyMonitor.recordNetworkLatency(i % 100);
          latencyMonitor.recordProcessingLatency(i % 20);
        }
        
        const endTime = performance.now();
        return (endTime - startTime) / batchSize;
      };

      // 执行多轮测试
      const rounds = 20;
      const times: number[] = [];
      
      for (let round = 0; round < rounds; round++) {
        times.push(highFrequencyTest());
      }

      const maxTime = Math.max(...times);
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;

      expect(avgTime).toBeLessThan(0.05); // 平均时间 < 0.05ms
      expect(maxTime).toBeLessThan(0.2); // 最大时间 < 0.2ms
    });

    test('延迟分布计算应该高效', () => {
      // 生成跨越所有分桶的数据
      const bucketBoundaries = [0, 10, 50, 100, 200, 500, 1000, 2000, 5000];
      for (let boundary of bucketBoundaries) {
        for (let i = 0; i < 1000; i++) {
          latencyMonitor.recordNetworkLatency(boundary + Math.random() * 5);
        }
      }

      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        latencyMonitor.getBuckets(LatencyType.NETWORK);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(5); // 平均分布计算时间 < 5ms
    });

    test('趋势分析应该有合理性能', () => {
      // 生成历史数据
      for (let hour = 0; hour < 24; hour++) {
        for (let i = 0; i < 100; i++) {
          latencyMonitor.recordNetworkLatency(50 + hour * 2 + Math.random() * 10);
        }
        
        // 模拟时间推进（通过直接调用内部方法或等待）
        if (hour % 6 === 0) {
          // 触发趋势分析
          latencyMonitor.getStats(LatencyType.NETWORK);
        }
      }

      const startTime = performance.now();
      
      for (let i = 0; i < 50; i++) {
        latencyMonitor.getTrends(LatencyType.NETWORK);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / 50;

      expect(avgTime).toBeLessThan(2); // 趋势查询时间 < 2ms
    });
  });

  describe('REQ-2.4.45: 状态监控性能', () => {
    test('状态快照创建应该在50ms内完成', () => {
      // 准备复杂的测试数据
      const connectionStats: ConnectionStats[] = Array.from({ length: 20 }, (_, i) => ({
        connectionId: `perf-test-conn-${i}`,
        state: ConnectionState.ACTIVE,
        connectedAt: Date.now() - 60000,
        lastActivity: Date.now(),
        messagesSent: 100 + i * 10,
        messagesReceived: 1000 + i * 100,
        bytesReceived: 50000 + i * 5000,
        latency: 50 + i,
        activeSubscriptions: 5 + i,
        connectionAttempts: 1,
        successfulConnections: 1,
        lastError: undefined
      }));

      // 生成延迟和错误数据
      for (let i = 0; i < 1000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 100);
        if (i % 10 === 0) {
          errorHandler.handleError(new Error(`Snapshot test error ${i}`));
        }
      }

      const iterations = 20;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        statusMonitor.createSnapshot(connectionStats);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(50); // 平均快照创建时间 < 50ms
    });

    test('健康度计算应该高效', () => {
      // 设置复杂的监控状态
      for (let i = 0; i < 5000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 200);
        latencyMonitor.recordProcessingLatency(Math.random() * 20);
        
        if (i % 50 === 0) {
          errorHandler.handleError(new Error(`Health test error ${i}`));
        }
      }

      const connectionStats: ConnectionStats[] = Array.from({ length: 50 }, (_, i) => ({
        connectionId: `health-test-conn-${i}`,
        state: i % 10 === 0 ? ConnectionState.ERROR : ConnectionState.ACTIVE,
        connectedAt: Date.now() - 60000,
        lastActivity: Date.now(),
        messagesSent: 100,
        messagesReceived: 1000,
        bytesReceived: 50000,
        latency: 50 + Math.random() * 100,
        activeSubscriptions: 5,
        connectionAttempts: i % 10 === 0 ? 3 : 1,
        successfulConnections: 1,
        lastError: i % 10 === 0 ? new Error('Test error') : undefined
      }));

      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const snapshot = statusMonitor.createSnapshot(connectionStats);
        expect(snapshot.overallHealth).toBeValidHealthScore();
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(20); // 健康度计算时间 < 20ms
    });

    test('历史数据查询应该快速', () => {
      // 生成历史快照
      for (let i = 0; i < 200; i++) {
        statusMonitor.createSnapshot();
        statusMonitor.updateStatus(
          i % 3 === 0 ? AdapterStatus.ACTIVE : AdapterStatus.CONNECTING,
          `Performance test ${i}`
        );
      }

      const iterations = 200;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        statusMonitor.getSnapshots(50);
        statusMonitor.getHealthTrend(60);
        statusMonitor.getStatusHistory();
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(5); // 历史查询时间 < 5ms
    });

    test('告警处理应该不影响主要性能', () => {
      let alertCount = 0;
      statusMonitor.on('health_alert', () => {
        alertCount++;
      });

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        // 混合正常和异常条件
        if (i % 10 === 0) {
          // 触发告警条件
          for (let j = 0; j < 20; j++) {
            errorHandler.handleError(new Error(`Alert trigger ${i}-${j}`));
            latencyMonitor.recordNetworkLatency(500 + Math.random() * 200);
          }
        } else {
          // 正常条件
          latencyMonitor.recordNetworkLatency(Math.random() * 50);
        }
        
        statusMonitor.createSnapshot();
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(10); // 即使在告警条件下，性能仍应可接受
      expect(alertCount).toBeGreaterThan(0); // 确保告警被触发
    });
  });

  describe('REQ-2.4.46: 内存使用优化', () => {
    test('长期运行应该保持稳定的内存使用', () => {
      const memorySnapshots: number[] = [];
      
      // 初始内存
      memorySnapshots.push(process.memoryUsage().heapUsed);

      // 模拟长期运行
      for (let cycle = 0; cycle < 20; cycle++) {
        // 每个周期生成一些数据
        for (let i = 0; i < 500; i++) {
          latencyMonitor.recordNetworkLatency(Math.random() * 100);
          if (i % 20 === 0) {
            errorHandler.handleError(new Error(`Long run error ${cycle}-${i}`));
          }
        }
        
        statusMonitor.createSnapshot();
        
        // 定期清理
        if (cycle % 5 === 0) {
          errorHandler.cleanup(60000);
          latencyMonitor.cleanup(300000);
        }
        
        // 记录内存使用
        if (cycle % 4 === 0) {
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }

      // 分析内存趋势
      const memoryGrowth = memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0];
      const avgMemoryPerCycle = memoryGrowth / 20;

      // 内存增长应该线性且可控（每周期小于1MB）
      expect(avgMemoryPerCycle).toBeLessThan(1024 * 1024);
    });

    test('清理操作应该有效释放内存', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 生成大量数据
      for (let i = 0; i < 20000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 1000);
        errorHandler.handleError(new Error(`Cleanup test error ${i}`));
        
        if (i % 100 === 0) {
          statusMonitor.createSnapshot();
        }
      }

      const afterDataGeneration = process.memoryUsage().heapUsed;
      const memoryIncrease = afterDataGeneration - initialMemory;

      // 执行清理
      errorHandler.cleanup(0); // 清理所有错误
      latencyMonitor.cleanup(0); // 清理所有延迟数据
      statusMonitor.reset(); // 重置状态监控

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }

      const afterCleanup = process.memoryUsage().heapUsed;
      const memoryRecovered = afterDataGeneration - afterCleanup;
      const recoveryRate = memoryRecovered / memoryIncrease;

      // 应该回收至少60%的内存
      expect(recoveryRate).toBeGreaterThan(0.6);
      expect(memoryRecovered).toBeGreaterThan(0);
    });

    test('监控组件应该有合理的内存占用', () => {
      const baselineMemory = process.memoryUsage().heapUsed;
      
      // 创建多个监控实例（模拟多个适配器）
      const monitors: any[] = [];
      
      for (let i = 0; i < 10; i++) {
        const errorHandler = new ErrorHandler({
          maxRecentErrors: 100,
          errorRateWindow: 60000,
          criticalErrorThreshold: 10,
          retryLimits: {
            connection: 3, heartbeat: 2, protocol: 2, data_parsing: 0,
            subscription: 2, pubsub: 2, config: 0, network: 3,
            authentication: 1, rate_limit: 0, unknown: 1
          },
          circuitBreakerThreshold: 20,
          alerting: { enabled: true, criticalErrorNotification: true, errorRateThreshold: 10 }
        });

        const latencyMonitor = new LatencyMonitor({
          sampling: { maxSamples: 1000, windowSize: 300000, sampleInterval: 1000 },
          buckets: { boundaries: [0, 10, 50, 100, 200, 500, 1000] },
          thresholds: {
            [LatencyType.NETWORK]: { warning: 100, critical: 500, p95Warning: 200, p99Critical: 1000 },
            [LatencyType.PROCESSING]: { warning: 10, critical: 50, p95Warning: 20, p99Critical: 100 },
            [LatencyType.END_TO_END]: { warning: 150, critical: 750, p95Warning: 300, p99Critical: 1500 },
            [LatencyType.HEARTBEAT]: { warning: 30000, critical: 60000, p95Warning: 45000, p99Critical: 90000 },
            [LatencyType.SUBSCRIPTION]: { warning: 5000, critical: 15000, p95Warning: 10000, p99Critical: 30000 }
          },
          trend: { enabled: false, windowCount: 24, significantChange: 20 },
          baseline: { enabled: false, targetLatency: {} as any, acceptableDeviation: 50 }
        });

        monitors.push({ errorHandler, latencyMonitor });
        (global as any).addTestEventEmitter(errorHandler);
        (global as any).addTestEventEmitter(latencyMonitor);
      }

      const afterCreation = process.memoryUsage().heapUsed;
      const memoryPerMonitor = (afterCreation - baselineMemory) / 10;

      // 每个监控实例应该小于5MB
      expect(memoryPerMonitor).toBeLessThan(5 * 1024 * 1024);

      // 清理
      monitors.forEach(({ errorHandler, latencyMonitor }) => {
        errorHandler.reset();
        latencyMonitor.stop();
        latencyMonitor.reset();
      });
    });
  });

  describe('REQ-2.4.47: 高负载压力测试', () => {
    test('应该处理每秒10000个错误', () => {
      const errorsPerSecond = 10000;
      const testDuration = 2; // 2秒
      const totalErrors = errorsPerSecond * testDuration;
      
      const startTime = performance.now();
      
      for (let i = 0; i < totalErrors; i++) {
        errorHandler.handleError(new Error(`High load error ${i}`));
      }
      
      const endTime = performance.now();
      const actualDuration = (endTime - startTime) / 1000;
      const actualRate = totalErrors / actualDuration;

      expect(actualRate).toBeGreaterThan(errorsPerSecond * 0.8); // 至少80%的目标性能
      expect(errorHandler.getErrorStats().total).toBe(totalErrors);
    });

    test('应该处理每秒50000个延迟记录', () => {
      const recordsPerSecond = 50000;
      const testDuration = 2; // 2秒
      const totalRecords = recordsPerSecond * testDuration;
      
      const startTime = performance.now();
      
      for (let i = 0; i < totalRecords; i++) {
        const latencyType = [LatencyType.NETWORK, LatencyType.PROCESSING][i % 2];
        latencyMonitor.recordLatency({
          type: latencyType,
          value: Math.random() * 100,
          timestamp: Date.now()
        });
      }
      
      const endTime = performance.now();
      const actualDuration = (endTime - startTime) / 1000;
      const actualRate = totalRecords / actualDuration;

      expect(actualRate).toBeGreaterThan(recordsPerSecond * 0.8);
      
      const networkStats = latencyMonitor.getStats(LatencyType.NETWORK);
      const processingStats = latencyMonitor.getStats(LatencyType.PROCESSING);
      const totalCount = (networkStats?.count || 0) + (processingStats?.count || 0);
      
      expect(totalCount).toBeGreaterThan(totalRecords * 0.9); // 考虑到采样限制
    });

    test('应该在高负载下保持查询性能', () => {
      // 先建立高负载基础数据
      for (let i = 0; i < 50000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 200);
        if (i % 50 === 0) {
          errorHandler.handleError(new Error(`Query load test ${i}`));
        }
        if (i % 100 === 0) {
          statusMonitor.createSnapshot();
        }
      }

      // 在持续负载下测试查询性能
      const queryStartTime = performance.now();
      
      const promises = Array.from({ length: 100 }, async (_, i) => {
        const start = performance.now();
        
        // 并发执行各种查询
        const [errorStats, latencyStats, latencySummary, snapshot] = await Promise.all([
          Promise.resolve(errorHandler.getErrorStats()),
          Promise.resolve(latencyMonitor.getAllStats()),
          Promise.resolve(latencyMonitor.getLatencySummary()),
          Promise.resolve(statusMonitor.getLatestSnapshot())
        ]);
        
        const end = performance.now();
        return end - start;
      });

      return Promise.all(promises).then(queryTimes => {
        const queryEndTime = performance.now();
        const totalQueryTime = queryEndTime - queryStartTime;
        
        const avgQueryTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
        const maxQueryTime = Math.max(...queryTimes);

        expect(avgQueryTime).toBeLessThan(50); // 平均查询时间 < 50ms
        expect(maxQueryTime).toBeLessThan(200); // 最大查询时间 < 200ms
        expect(totalQueryTime / 100).toBeLessThan(100); // 整体平均 < 100ms
      });
    });

    test('应该在极限负载下保持系统稳定', () => {
      const extremeLoad = () => {
        // 模拟极限条件
        const promises: Promise<any>[] = [];
        
        // 大量错误
        promises.push(Promise.resolve().then(() => {
          for (let i = 0; i < 5000; i++) {
            errorHandler.handleError(new Error(`Extreme load error ${i}`));
          }
        }));
        
        // 大量延迟记录
        promises.push(Promise.resolve().then(() => {
          for (let i = 0; i < 20000; i++) {
            latencyMonitor.recordNetworkLatency(Math.random() * 1000);
          }
        }));
        
        // 大量状态更新
        promises.push(Promise.resolve().then(() => {
          for (let i = 0; i < 100; i++) {
            statusMonitor.createSnapshot();
          }
        }));
        
        return Promise.all(promises);
      };

      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed;
      
      return extremeLoad().then(() => {
        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;
        
        const totalTime = endTime - startTime;
        const memoryIncrease = endMemory - startMemory;
        
        // 系统应该在合理时间内完成
        expect(totalTime).toBeLessThan(10000); // 10秒内完成
        
        // 内存增长应该可控
        expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // 小于200MB
        
        // 系统应该仍然响应
        const finalStats = errorHandler.getErrorStats();
        expect(finalStats.total).toBeGreaterThan(0);
        
        const latencyStats = latencyMonitor.getStats(LatencyType.NETWORK);
        expect(latencyStats?.count).toBeGreaterThan(0);
        
        const snapshot = statusMonitor.getLatestSnapshot();
        expect(snapshot).toBeDefined();
      });
    });
  });

  describe('REQ-2.4.48: 并发性能', () => {
    test('多线程并发访问应该保持性能', async () => {
      const workerCount = 8;
      const operationsPerWorker = 1000;
      
      const workers = Array.from({ length: workerCount }, async (_, workerId) => {
        const startTime = performance.now();
        
        for (let i = 0; i < operationsPerWorker; i++) {
          // 混合操作
          if (i % 3 === 0) {
            errorHandler.handleError(new Error(`Worker ${workerId} error ${i}`));
          }
          if (i % 2 === 0) {
            latencyMonitor.recordNetworkLatency(Math.random() * 100);
          }
          if (i % 10 === 0) {
            statusMonitor.createSnapshot();
          }
          if (i % 20 === 0) {
            // 查询操作
            errorHandler.getErrorStats();
            latencyMonitor.getStats(LatencyType.NETWORK);
          }
        }
        
        const endTime = performance.now();
        return endTime - startTime;
      });

      const results = await Promise.all(workers);
      const avgWorkerTime = results.reduce((sum, time) => sum + time, 0) / workerCount;
      const maxWorkerTime = Math.max(...results);

      // 并发情况下性能不应该显著下降
      expect(avgWorkerTime).toBeLessThan(5000); // 平均5秒内完成
      expect(maxWorkerTime).toBeLessThan(8000); // 最长8秒内完成

      // 验证数据完整性
      const finalErrorStats = errorHandler.getErrorStats();
      const finalLatencyStats = latencyMonitor.getStats(LatencyType.NETWORK);
      
      expect(finalErrorStats.total).toBeGreaterThan(workerCount * operationsPerWorker / 4); // 至少记录了部分错误
      expect(finalLatencyStats?.count).toBeGreaterThan(workerCount * operationsPerWorker / 4); // 至少记录了部分延迟
    });
  });
});