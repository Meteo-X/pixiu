/**
 * 性能基准测试：内存基准 (Memory Benchmarks)
 * 
 * 测试目标：
 * 1. 验证管道内存使用控制在合理范围内
 * 2. 检测内存泄漏和内存增长异常
 * 3. 验证垃圾回收效率和内存回收
 * 4. 测试不同负载下的内存使用模式
 * 5. 验证内存优化策略的有效性
 */

import { globalCache } from '@pixiu/shared-core';
import { ExchangeDataPipelineFactory } from '../../src/pipeline/exchange-data-pipeline';
import { MemoryManagerFactory } from '../../src/pipeline/performance/memory-manager';
import { PerformanceOptimizerFactory } from '../../src/pipeline/performance/performance-optimizer';
import {
  createMockMarketData,
  createHighFrequencyData,
  createMockMarketDataBatch
} from '../../fixtures/mock-market-data';
import {
  PERFORMANCE_TEST_SCENARIOS,
  PerformanceTestUtils
} from '../../fixtures/performance-benchmarks';
import {
  MockMonitor,
  MockErrorHandler,
  MockPubSubClient,
  MemoryMonitor
} from '../../helpers/pipeline-test-utils';

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

class DetailedMemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private baselineSnapshot: MemorySnapshot | null = null;

  snapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers
    };

    this.snapshots.push(snapshot);
    
    if (!this.baselineSnapshot) {
      this.baselineSnapshot = snapshot;
    }

    return snapshot;
  }

  getMemoryGrowth(): number {
    if (!this.baselineSnapshot || this.snapshots.length === 0) return 0;
    const latest = this.snapshots[this.snapshots.length - 1];
    return (latest.heapUsed - this.baselineSnapshot.heapUsed) / this.baselineSnapshot.heapUsed;
  }

  getMemoryTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.snapshots.length < 3) return 'stable';
    
    const recent = this.snapshots.slice(-3);
    const deltas = [];
    
    for (let i = 1; i < recent.length; i++) {
      deltas.push(recent[i].heapUsed - recent[i-1].heapUsed);
    }
    
    const avgDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
    
    if (avgDelta > 1024 * 1024) return 'increasing'; // 1MB增长
    if (avgDelta < -1024 * 1024) return 'decreasing'; // 1MB减少
    return 'stable';
  }

  getLeakDetectionScore(): number {
    if (this.snapshots.length < 5) return 0;
    
    // 计算内存使用趋势的斜率
    const points = this.snapshots.slice(-5).map((s, i) => ({ x: i, y: s.heapUsed }));
    const n = points.length;
    
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // 标准化斜率为泄漏分数 (0-100)
    return Math.min(100, Math.max(0, slope / (1024 * 1024) * 10));
  }

  getDetailedStats() {
    if (this.snapshots.length === 0) return null;
    
    const latest = this.snapshots[this.snapshots.length - 1];
    const baseline = this.baselineSnapshot || this.snapshots[0];
    
    return {
      baseline: baseline,
      latest: latest,
      growth: this.getMemoryGrowth(),
      trend: this.getMemoryTrend(),
      leakScore: this.getLeakDetectionScore(),
      snapshotCount: this.snapshots.length,
      timespan: latest.timestamp - baseline.timestamp
    };
  }

  clear(): void {
    this.snapshots = [];
    this.baselineSnapshot = null;
  }

  forceGC(): void {
    if (global.gc) {
      global.gc();
    }
  }
}

describe('Task 3.3 Performance - 内存基准 (Memory Benchmarks)', () => {
  let mockMonitor: MockMonitor;
  let mockErrorHandler: MockErrorHandler;
  let mockPubSubClient: MockPubSubClient;
  let memoryManager: any;
  let performanceOptimizer: any;
  let detailedMemoryMonitor: DetailedMemoryMonitor;

  beforeEach(() => {
    mockMonitor = new MockMonitor();
    mockErrorHandler = new MockErrorHandler();
    mockPubSubClient = new MockPubSubClient();
    memoryManager = MemoryManagerFactory.createDefault();
    performanceOptimizer = PerformanceOptimizerFactory.createDefault(memoryManager);
    detailedMemoryMonitor = new DetailedMemoryMonitor();
  });

  afterEach(async () => {
    mockMonitor?.clearLogs();
    mockErrorHandler?.clearErrors();
    mockPubSubClient?.clearMessages();
    detailedMemoryMonitor?.clear();
    if (memoryManager) {
      memoryManager.stop();
    }
    if (performanceOptimizer) {
      performanceOptimizer.stop();
    }
    
    // 强制垃圾回收
    if (global.gc) {
      global.gc();
    }
  });

  afterAll(async () => {
    globalCache.destroy();
  });

  describe('基础内存使用基准 (Basic Memory Usage Benchmarks)', () => {
    test('should maintain reasonable memory usage during normal operation', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'memory-baseline-test',
        name: 'Memory Baseline Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'memory'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 启动内存管理
      memoryManager.start();
      performanceOptimizer.start();

      // 建立基线
      detailedMemoryMonitor.snapshot();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 正常负载测试
      const normalLoadMessages = 200;
      for (let i = 0; i < normalLoadMessages; i++) {
        const testData = createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i
        });

        await pipeline.process(testData, 'memory-baseline-test');

        // 定期采样内存
        if (i % 50 === 0) {
          detailedMemoryMonitor.snapshot();
        }
      }

      // 等待处理完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 强制垃圾回收并采样
      detailedMemoryMonitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 100));
      detailedMemoryMonitor.snapshot();

      const memStats = detailedMemoryMonitor.getDetailedStats();
      expect(memStats).not.toBeNull();

      if (memStats) {
        // 验证内存增长合理
        expect(memStats.growth).toBeLessThan(0.5); // 内存增长不超过50%
        expect(memStats.leakScore).toBeLessThan(20); // 泄漏分数较低
        
        console.log(`Memory Baseline Test Results:
          Baseline Heap: ${(memStats.baseline.heapUsed / 1024 / 1024).toFixed(2)} MB
          Latest Heap: ${(memStats.latest.heapUsed / 1024 / 1024).toFixed(2)} MB
          Memory Growth: ${(memStats.growth * 100).toFixed(2)}%
          Memory Trend: ${memStats.trend}
          Leak Score: ${memStats.leakScore.toFixed(1)}/100
          Test Duration: ${memStats.timespan}ms
        `);
      }

      await pipeline.destroy();
    });

    test('should handle large message processing without excessive memory growth', async () => {
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'large-message-test',
        name: 'Large Message Memory Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'large',
        bufferSize: 50,
        batchTimeout: 1000,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      memoryManager.start();
      performanceOptimizer.start();

      detailedMemoryMonitor.snapshot();

      // 处理大消息
      const largeMessageCount = 100;
      const largeDataSize = 10 * 1024; // 10KB per message

      for (let i = 0; i < largeMessageCount; i++) {
        const largeData = createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i,
          data: {
            price: 45000,
            volume: 1.5,
            largeField: 'x'.repeat(largeDataSize),
            metadata: {
              timestamp: Date.now(),
              extra: 'y'.repeat(1024)
            }
          }
        });

        await pipeline.process(largeData, 'large-message-test');

        // 频繁采样内存
        if (i % 10 === 0) {
          detailedMemoryMonitor.snapshot();
        }
      }

      // 等待缓冲区刷新
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 强制垃圾回收
      detailedMemoryMonitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 200));
      detailedMemoryMonitor.snapshot();

      const memStats = detailedMemoryMonitor.getDetailedStats();
      
      if (memStats) {
        // 验证大消息处理的内存控制
        expect(memStats.growth).toBeLessThan(2.0); // 内存增长不超过200%
        expect(memStats.leakScore).toBeLessThan(30); // 允许稍高的泄漏分数
        
        const totalDataSize = largeMessageCount * largeDataSize;
        const memoryEfficiency = totalDataSize / memStats.latest.heapUsed;
        
        console.log(`Large Message Memory Test Results:
          Messages: ${largeMessageCount}
          Total Data Size: ${(totalDataSize / 1024 / 1024).toFixed(2)} MB
          Memory Growth: ${(memStats.growth * 100).toFixed(2)}%
          Memory Efficiency: ${memoryEfficiency.toFixed(3)}
          Leak Score: ${memStats.leakScore.toFixed(1)}/100
        `);
      }

      await pipeline.destroy();
    });

    test('should demonstrate effective garbage collection', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'gc-test',
        name: 'Garbage Collection Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'gc'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      memoryManager.start();
      performanceOptimizer.start();

      // 初始基线
      detailedMemoryMonitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 100));
      detailedMemoryMonitor.snapshot();

      // 阶段1：创建大量短期对象
      for (let cycle = 0; cycle < 5; cycle++) {
        console.log(`GC Test Cycle ${cycle + 1}/5`);
        
        // 快速创建大量对象
        for (let i = 0; i < 100; i++) {
          const tempData = createMockMarketData({
            exchange: 'binance',
            symbol: 'BTCUSDT',
            sequence: cycle * 100 + i,
            data: {
              temporary: new Array(1000).fill(Math.random()),
              metadata: {
                cycle,
                iteration: i,
                timestamp: Date.now()
              }
            }
          });

          await pipeline.process(tempData, 'gc-test');
        }

        // 采样内存使用
        detailedMemoryMonitor.snapshot();

        // 强制垃圾回收
        detailedMemoryMonitor.forceGC();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // GC后采样
        detailedMemoryMonitor.snapshot();
      }

      const memStats = detailedMemoryMonitor.getDetailedStats();
      
      if (memStats) {
        console.log(`Garbage Collection Test Results:
          Initial Heap: ${(memStats.baseline.heapUsed / 1024 / 1024).toFixed(2)} MB
          Final Heap: ${(memStats.latest.heapUsed / 1024 / 1024).toFixed(2)} MB
          Net Growth: ${(memStats.growth * 100).toFixed(2)}%
          Memory Trend: ${memStats.trend}
          Leak Score: ${memStats.leakScore.toFixed(1)}/100
        `);

        // 验证垃圾回收有效
        expect(memStats.growth).toBeLessThan(0.3); // 净增长小于30%
        expect(memStats.trend).not.toBe('increasing'); // 趋势不应该是持续增长
      }

      await pipeline.destroy();
    });
  });

  describe('内存压力测试 (Memory Stress Tests)', () => {
    test('should handle memory pressure gracefully', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.MEMORY_STRESS;
      
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'memory-stress-test',
        name: 'Memory Stress Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'stress',
        bufferSize: 200,
        batchTimeout: 500,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      memoryManager.start();
      performanceOptimizer.start();

      detailedMemoryMonitor.snapshot();

      // 高强度内存压力测试
      const stressPhases = [
        { name: 'warmup', messageCount: 100, dataSize: 1024 },
        { name: 'pressure', messageCount: 500, dataSize: 5120 },
        { name: 'extreme', messageCount: 200, dataSize: 10240 },
        { name: 'recovery', messageCount: 100, dataSize: 1024 }
      ];

      const phaseResults: any[] = [];

      for (const phase of stressPhases) {
        console.log(`Memory Stress Phase: ${phase.name}`);
        
        const phaseStart = detailedMemoryMonitor.snapshot();
        
        for (let i = 0; i < phase.messageCount; i++) {
          const stressData = createMockMarketData({
            exchange: i % 3 === 0 ? 'binance' : i % 3 === 1 ? 'huobi' : 'okx',
            symbol: 'BTCUSDT',
            sequence: i,
            data: {
              price: 45000 + Math.random() * 1000,
              volume: Math.random() * 10,
              stressField: 'x'.repeat(phase.dataSize),
              metadata: {
                phase: phase.name,
                iteration: i,
                timestamp: Date.now(),
                randomData: new Array(100).fill(Math.random())
              }
            }
          });

          await pipeline.process(stressData, `stress-${phase.name}`);

          // 定期内存采样
          if (i % 25 === 0) {
            detailedMemoryMonitor.snapshot();
          }
        }

        // 阶段结束时强制GC并采样
        detailedMemoryMonitor.forceGC();
        await new Promise(resolve => setTimeout(resolve, 200));
        const phaseEnd = detailedMemoryMonitor.snapshot();

        phaseResults.push({
          phase: phase.name,
          startHeap: phaseStart.heapUsed,
          endHeap: phaseEnd.heapUsed,
          growth: (phaseEnd.heapUsed - phaseStart.heapUsed) / phaseStart.heapUsed,
          messages: phase.messageCount,
          dataSize: phase.dataSize
        });

        // 等待缓冲处理
        await new Promise(resolve => setTimeout(resolve, 700));
      }

      const finalStats = detailedMemoryMonitor.getDetailedStats();

      // 验证内存压力测试结果
      if (finalStats) {
        expect(finalStats.growth).toBeLessThan(3.0); // 总体增长不超过300%
        expect(finalStats.leakScore).toBeLessThan(50); // 泄漏分数合理
        expect(pipeline.isHealthy()).toBe(true); // 管道保持健康
      }

      console.log('Memory Stress Test Phase Results:');
      phaseResults.forEach(result => {
        console.log(`  ${result.phase}: ${(result.startHeap / 1024 / 1024).toFixed(2)}MB -> ${(result.endHeap / 1024 / 1024).toFixed(2)}MB (${(result.growth * 100).toFixed(2)}%)`);
      });

      await pipeline.destroy();
    });

    test('should detect and prevent memory leaks', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'leak-detection-test',
        name: 'Memory Leak Detection Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'leak'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      memoryManager.start();
      performanceOptimizer.start();

      detailedMemoryMonitor.snapshot();

      // 模拟可能导致内存泄漏的操作模式
      const leakTestCycles = 20;
      const messagesPerCycle = 50;

      for (let cycle = 0; cycle < leakTestCycles; cycle++) {
        // 每个周期创建可能泄漏的对象
        const cycleObjects: any[] = [];
        
        for (let i = 0; i < messagesPerCycle; i++) {
          const testData = createMockMarketData({
            exchange: 'binance',
            symbol: 'BTCUSDT',
            sequence: cycle * messagesPerCycle + i,
            data: {
              cycleRef: cycle,
              persistentData: new Array(500).fill(`cycle-${cycle}-msg-${i}`)
            }
          });

          // 模拟可能的循环引用
          const leakyObject = {
            data: testData,
            cycle,
            refs: cycleObjects
          };
          cycleObjects.push(leakyObject);

          await pipeline.process(testData, 'leak-detection-test');
        }

        // 每个周期后采样内存
        detailedMemoryMonitor.snapshot();
        
        // 定期强制GC
        if (cycle % 5 === 0) {
          detailedMemoryMonitor.forceGC();
          await new Promise(resolve => setTimeout(resolve, 100));
          detailedMemoryMonitor.snapshot();
        }
      }

      // 最终GC并检查
      detailedMemoryMonitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 300));
      detailedMemoryMonitor.snapshot();

      const leakStats = detailedMemoryMonitor.getDetailedStats();

      if (leakStats) {
        console.log(`Memory Leak Detection Test Results:
          Test Cycles: ${leakTestCycles}
          Total Messages: ${leakTestCycles * messagesPerCycle}
          Memory Growth: ${(leakStats.growth * 100).toFixed(2)}%
          Memory Trend: ${leakStats.trend}
          Leak Score: ${leakStats.leakScore.toFixed(1)}/100
          Final Heap: ${(leakStats.latest.heapUsed / 1024 / 1024).toFixed(2)} MB
        `);

        // 验证没有严重的内存泄漏
        expect(leakStats.leakScore).toBeLessThan(60); // 泄漏分数不过高
        expect(leakStats.growth).toBeLessThan(2.0); // 增长不超过200%
        
        // 如果泄漏分数很高，应该记录警告
        if (leakStats.leakScore > 40) {
          console.warn(`High memory leak score detected: ${leakStats.leakScore}`);
        }
      }

      await pipeline.destroy();
    });
  });

  describe('内存优化验证 (Memory Optimization Validation)', () => {
    test('should demonstrate memory manager effectiveness', async () => {
      // 测试1：无内存管理器
      const pipelineWithoutManager = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'no-memory-manager',
        name: 'No Memory Manager Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'no-mgr',
        bufferSize: 100,
        batchTimeout: 1000,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipelineWithoutManager.initialize();
      await pipelineWithoutManager.start();

      detailedMemoryMonitor.clear();
      detailedMemoryMonitor.snapshot();

      const testMessages = 300;
      for (let i = 0; i < testMessages; i++) {
        const testData = createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i,
          data: {
            largeField: 'x'.repeat(2048)
          }
        });

        await pipelineWithoutManager.process(testData, 'no-manager-test');

        if (i % 30 === 0) {
          detailedMemoryMonitor.snapshot();
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1200));
      const noManagerStats = detailedMemoryMonitor.getDetailedStats();

      await pipelineWithoutManager.destroy();
      mockPubSubClient.clearMessages();

      // 测试2：有内存管理器
      const pipelineWithManager = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'with-memory-manager',
        name: 'With Memory Manager Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'with-mgr',
        bufferSize: 100,
        batchTimeout: 1000,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipelineWithManager.initialize();
      await pipelineWithManager.start();

      memoryManager.start();
      performanceOptimizer.start();

      detailedMemoryMonitor.clear();
      detailedMemoryMonitor.snapshot();

      for (let i = 0; i < testMessages; i++) {
        const testData = createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i,
          data: {
            largeField: 'x'.repeat(2048)
          }
        });

        await pipelineWithManager.process(testData, 'with-manager-test');

        if (i % 30 === 0) {
          detailedMemoryMonitor.snapshot();
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1200));
      const withManagerStats = detailedMemoryMonitor.getDetailedStats();

      await pipelineWithManager.destroy();

      // 比较结果
      if (noManagerStats && withManagerStats) {
        const memoryImprovement = (noManagerStats.growth - withManagerStats.growth) / noManagerStats.growth;
        
        console.log(`Memory Manager Effectiveness Test:
          Without Manager - Growth: ${(noManagerStats.growth * 100).toFixed(2)}%, Leak Score: ${noManagerStats.leakScore.toFixed(1)}
          With Manager - Growth: ${(withManagerStats.growth * 100).toFixed(2)}%, Leak Score: ${withManagerStats.leakScore.toFixed(1)}
          Memory Improvement: ${(memoryImprovement * 100).toFixed(2)}%
        `);

        // 验证内存管理器的效果
        expect(withManagerStats.growth).toBeLessThanOrEqual(noManagerStats.growth);
        expect(withManagerStats.leakScore).toBeLessThanOrEqual(noManagerStats.leakScore);
      }
    });

    test('should validate buffer memory optimization', async () => {
      const bufferConfigs = [
        { size: 50, timeout: 2000 },
        { size: 100, timeout: 1000 },
        { size: 200, timeout: 500 },
        { size: 500, timeout: 200 }
      ];

      const results: any[] = [];

      for (const config of bufferConfigs) {
        const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
          id: `buffer-opt-${config.size}`,
          name: `Buffer Optimization Test ${config.size}`,
          pubsubClient: mockPubSubClient,
          topicPrefix: 'buffer-opt',
          bufferSize: config.size,
          batchTimeout: config.timeout,
          partitionBy: 'symbol'
        }, mockMonitor, mockErrorHandler);

        await pipeline.initialize();
        await pipeline.start();

        memoryManager.start();
        performanceOptimizer.start();

        detailedMemoryMonitor.clear();
        detailedMemoryMonitor.snapshot();

        const testMessages = 400;
        for (let i = 0; i < testMessages; i++) {
          const testData = createMockMarketData({
            exchange: 'binance',
            symbol: 'BTCUSDT',
            sequence: i
          });

          await pipeline.process(testData, 'buffer-optimization-test');

          if (i % 50 === 0) {
            detailedMemoryMonitor.snapshot();
          }
        }

        await new Promise(resolve => setTimeout(resolve, config.timeout + 500));

        detailedMemoryMonitor.forceGC();
        await new Promise(resolve => setTimeout(resolve, 100));
        const finalSnapshot = detailedMemoryMonitor.snapshot();

        const stats = detailedMemoryMonitor.getDetailedStats();
        if (stats) {
          results.push({
            bufferSize: config.size,
            timeout: config.timeout,
            memoryGrowth: stats.growth,
            leakScore: stats.leakScore,
            finalHeap: finalSnapshot.heapUsed
          });
        }

        await pipeline.destroy();
        mockPubSubClient.clearMessages();
      }

      // 分析缓冲配置对内存的影响
      console.log('Buffer Memory Optimization Results:');
      results.forEach(result => {
        console.log(`  Buffer ${result.bufferSize} (${result.timeout}ms): Growth=${(result.memoryGrowth * 100).toFixed(2)}%, Heap=${(result.finalHeap / 1024 / 1024).toFixed(2)}MB`);
      });

      // 验证合理的内存使用模式
      results.forEach(result => {
        expect(result.memoryGrowth).toBeLessThan(1.5); // 增长不超过150%
        expect(result.leakScore).toBeLessThan(40); // 泄漏分数合理
      });
    });
  });
});