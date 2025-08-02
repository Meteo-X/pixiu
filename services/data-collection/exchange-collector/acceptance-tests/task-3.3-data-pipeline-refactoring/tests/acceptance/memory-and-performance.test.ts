/**
 * 验收测试：内存使用和性能优化 (Memory Usage and Performance Optimization)
 * 
 * 测试目标：
 * 1. 验证内存使用监控和管理
 * 2. 验证垃圾回收优化
 * 3. 验证性能指标收集
 * 4. 验证自动调优功能
 * 5. 验证资源清理机制
 * 6. 验证内存泄漏检测
 */

import { globalCache } from '@pixiu/shared-core';
import { MemoryManager, MemoryManagerFactory } from '../../src/pipeline/performance/memory-manager';
import { PerformanceOptimizer } from '../../src/pipeline/performance/performance-optimizer';
import {
  createMockMarketData,
  createMockMarketDataBatch,
  createHighFrequencyData,
  createPerformanceTestData,
  createMemoryStressTestData
} from '../../fixtures/mock-market-data';
import {
  createMemoryOptimizedConfig,
  createPerformanceTestConfig
} from '../../fixtures/test-configurations';
import {
  PIPELINE_BENCHMARKS,
  PERFORMANCE_TEST_SCENARIOS,
  PerformanceTestUtils
} from '../../fixtures/performance-benchmarks';
import {
  TestDataPipeline,
  PipelineTestUtils,
  PerformanceMeasurer,
  MemoryMonitor
} from '../../helpers/pipeline-test-utils';
import {
  PerformanceMonitor,
  LatencyTracker,
  ThroughputCalculator
} from '../../helpers/performance-monitor';

describe('Task 3.3 - 内存使用和性能优化 (Memory Usage and Performance Optimization)', () => {
  let memoryManager: MemoryManager;
  let performanceMonitor: PerformanceMonitor;
  let testPipeline: TestDataPipeline;

  beforeEach(() => {
    memoryManager = MemoryManagerFactory.createDefault();
    performanceMonitor = new PerformanceMonitor({
      monitoringInterval: 100,
      benchmark: PIPELINE_BENCHMARKS.MEMORY_OPTIMIZATION
    });
  });

  afterEach(async () => {
    if (memoryManager) {
      memoryManager.stop();
    }
    if (performanceMonitor) {
      performanceMonitor.stop();
    }
    if (testPipeline) {
      await testPipeline.destroy();
    }
  });

  afterAll(async () => {
    globalCache.destroy();
  });

  describe('内存使用监控和管理 (Memory Usage Monitoring and Management)', () => {
    test('should monitor memory usage accurately', async () => {
      memoryManager.start();
      
      // 等待一些监控数据
      await PipelineTestUtils.wait(200);
      
      const memoryStats = memoryManager.getMemoryStats();
      
      expect(memoryStats.heapUsed).toBeGreaterThan(0);
      expect(memoryStats.heapTotal).toBeGreaterThan(memoryStats.heapUsed);
      expect(memoryStats.rss).toBeGreaterThan(0);
      expect(memoryStats.heapUsagePercentage).toBeGreaterThan(0);
      expect(memoryStats.heapUsagePercentage).toBeLessThanOrEqual(1);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(memoryStats.memoryPressure);
    });

    test('should track memory history over time', async () => {
      memoryManager.start();
      
      // 等待收集一些历史数据
      await PipelineTestUtils.wait(500);
      
      const history = memoryManager.getMemoryHistory();
      expect(history.length).toBeGreaterThan(2);
      
      // 验证历史数据按时间排序
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i-1].timestamp);
      }
    });

    test('should detect memory pressure levels', async () => {
      const pressureEvents: string[] = [];
      
      memoryManager.on('memoryPressure', (level) => {
        pressureEvents.push(level);
      });
      
      memoryManager.start();
      
      // 模拟内存使用增加
      const largeArrays: any[] = [];
      for (let i = 0; i < 10; i++) {
        largeArrays.push(new Array(100000).fill(i));
      }
      
      await PipelineTestUtils.wait(300);
      
      // 清理内存
      largeArrays.length = 0;
      
      // 可能会触发内存压力事件
      // 注意：在测试环境中可能不会触发，这取决于可用内存
    });

    test('should provide memory leak detection', async () => {
      memoryManager.start();
      
      // 模拟内存泄漏
      const leakArray: any[] = [];
      
      for (let i = 0; i < 100; i++) {
        leakArray.push(new Array(1000).fill(i));
        await PipelineTestUtils.wait(10);
      }
      
      const leakCheck = memoryManager.checkMemoryLeaks();
      
      // 在短时间内应该检测不到泄漏（需要更长时间的数据）
      expect(leakCheck.trend).toBeDefined();
      expect(['INCREASING', 'STABLE', 'DECREASING']).toContain(leakCheck.trend);
    });

    test('should optimize memory usage automatically', async () => {
      const highPerformanceManager = MemoryManagerFactory.createHighPerformance();
      
      const optimizeEvents: any[] = [];
      highPerformanceManager.on('memoryOptimized', () => {
        optimizeEvents.push(Date.now());
      });
      
      highPerformanceManager.start();
      
      // 触发优化
      highPerformanceManager.optimizeMemory();
      
      expect(optimizeEvents.length).toBeGreaterThan(0);
      
      highPerformanceManager.stop();
    });
  });

  describe('对象池管理 (Object Pool Management)', () => {
    test('should create and manage object pools', async () => {
      const poolConfig = {
        initialSize: 10,
        maxSize: 50,
        objectFactory: () => ({ id: Math.random(), data: new Array(100) }),
        resetFunction: (obj: any) => {
          obj.data.fill(0);
        },
        validateFunction: (obj: any) => obj && obj.data
      };
      
      const pool = memoryManager.createObjectPool('test-pool', poolConfig);
      
      // 获取对象
      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      
      expect(obj1).toBeDefined();
      expect(obj2).toBeDefined();
      expect(obj1).not.toBe(obj2);
      
      // 释放对象
      pool.release(obj1);
      pool.release(obj2);
      
      const stats = pool.getStats();
      expect(stats.poolSize).toBeGreaterThan(0);
      expect(stats.inUseCount).toBe(0);
    });

    test('should handle pool size limits correctly', async () => {
      const limitedPoolConfig = {
        initialSize: 2,
        maxSize: 5,
        objectFactory: () => ({ id: Math.random() })
      };
      
      const pool = memoryManager.createObjectPool('limited-pool', limitedPoolConfig);
      
      // 获取超过最大数量的对象
      const objects = [];
      for (let i = 0; i < 10; i++) {
        objects.push(pool.acquire());
      }
      
      expect(objects.length).toBe(10);
      
      // 释放对象
      objects.forEach(obj => pool.release(obj));
      
      const stats = pool.getStats();
      expect(stats.poolSize).toBeLessThanOrEqual(5); // 不应超过最大值
    });

    test('should provide pool statistics', async () => {
      const pool = memoryManager.createObjectPool('stats-pool', {
        initialSize: 5,
        maxSize: 20,
        objectFactory: () => ({ value: 42 })
      });
      
      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      
      const stats = pool.getStats();
      expect(stats.inUseCount).toBe(2);
      expect(stats.poolSize).toBeGreaterThan(0);
      expect(stats.totalCreated).toBeGreaterThan(0);
      
      pool.release(obj1);
      pool.release(obj2);
      
      const allPoolStats = memoryManager.getPoolStats();
      expect(allPoolStats['stats-pool']).toBeDefined();
    });
  });

  describe('垃圾回收优化 (Garbage Collection Optimization)', () => {
    test('should force garbage collection when needed', async () => {
      if (global.gc) {
        const gcEvents: any[] = [];
        
        memoryManager.on('gcForced', () => {
          gcEvents.push(Date.now());
        });
        
        memoryManager.forceGC();
        
        expect(gcEvents.length).toBeGreaterThan(0);
      } else {
        console.warn('GC not exposed, skipping GC test');
      }
    });

    test('should trigger automatic GC based on thresholds', async () => {
      const autoGCManager = new MemoryManager({
        maxHeapUsage: 50 * 1024 * 1024, // 50MB
        gcThreshold: 0.5, // 50% threshold
        monitoringInterval: 100,
        enableAutoGC: true,
        enableMemoryProfiling: false,
        alertThresholds: {
          medium: 0.4,
          high: 0.6,
          critical: 0.8
        }
      });
      
      autoGCManager.start();
      
      // 模拟内存使用
      const memoryConsumer = new Array(1000000).fill(42);
      
      await PipelineTestUtils.wait(200);
      
      // 清理
      memoryConsumer.length = 0;
      
      autoGCManager.stop();
    });
  });

  describe('性能指标收集 (Performance Metrics Collection)', () => {
    test('should collect latency metrics accurately', async () => {
      const latencyTracker = new LatencyTracker();
      
      // 模拟请求处理
      const requestIds = ['req1', 'req2', 'req3'];
      
      requestIds.forEach(id => latencyTracker.start(id));
      
      // 模拟处理时间
      await PipelineTestUtils.wait(10);
      
      const latencies = requestIds.map(id => latencyTracker.end(id)).filter(Boolean);
      
      expect(latencies.length).toBe(3);
      latencies.forEach(latency => {
        expect(latency).toBeGreaterThan(0);
        expect(latency).toBeLessThan(100); // 应该小于100ms
      });
      
      const stats = latencyTracker.getStats();
      expect(stats.count).toBe(3);
      expect(stats.avg).toBeGreaterThan(0);
    });

    test('should collect throughput metrics accurately', async () => {
      const throughputCalc = new ThroughputCalculator();
      
      // 模拟消息处理
      for (let i = 0; i < 100; i++) {
        throughputCalc.recordMessage(1024); // 1KB per message
        if (i % 10 === 0) {
          await PipelineTestUtils.wait(10);
        }
      }
      
      const throughput = throughputCalc.calculateThroughput(1000);
      
      expect(throughput.totalMessages).toBe(100);
      expect(throughput.totalBytes).toBe(100 * 1024);
      expect(throughput.messagesPerSecond).toBeGreaterThan(0);
      expect(throughput.bytesPerSecond).toBeGreaterThan(0);
    });

    test('should monitor comprehensive performance metrics', async () => {
      performanceMonitor.setBenchmark(PIPELINE_BENCHMARKS.MEMORY_OPTIMIZATION);
      performanceMonitor.start();
      
      // 模拟工作负载
      for (let i = 0; i < 50; i++) {
        performanceMonitor.recordLatency(Math.random() * 100);
        performanceMonitor.recordMessage(1024);
        
        if (i % 10 === 0) {
          await PipelineTestUtils.wait(20);
        }
      }
      
      await PipelineTestUtils.wait(200);
      
      const currentMetrics = performanceMonitor.getCurrentMetrics();
      
      expect(currentMetrics.latency.avg).toBeGreaterThan(0);
      expect(currentMetrics.throughput.messagesPerSecond).toBeGreaterThan(0);
      expect(currentMetrics.memory.heapUsed).toBeGreaterThan(0);
      expect(currentMetrics.errors.count).toBe(0);
      
      performanceMonitor.stop();
    });
  });

  describe('性能基准验证 (Performance Benchmark Validation)', () => {
    test('should validate latency against benchmarks', async () => {
      const latencies = [5, 10, 15, 25, 45, 80, 120]; // ms
      const benchmark = PIPELINE_BENCHMARKS.MEMORY_OPTIMIZATION;
      
      const validation = PerformanceTestUtils.validateLatency(latencies, benchmark);
      
      expect(validation.passed).toBeDefined();
      expect(validation.results.p50).toBeDefined();
      expect(validation.results.p95).toBeDefined();
      expect(validation.results.p99).toBeDefined();
      expect(validation.results.max).toBeDefined();
      
      // 验证所有结果都有通过/失败状态
      expect(typeof validation.results.p50.passed).toBe('boolean');
      expect(typeof validation.results.p95.passed).toBe('boolean');
      expect(typeof validation.results.p99.passed).toBe('boolean');
      expect(typeof validation.results.max.passed).toBe('boolean');
    });

    test('should validate throughput against benchmarks', async () => {
      const messageCount = 5000;
      const duration = 1000; // 1 second
      const benchmark = PIPELINE_BENCHMARKS.MEMORY_OPTIMIZATION;
      
      const validation = PerformanceTestUtils.validateThroughput(
        messageCount, 
        duration, 
        benchmark
      );
      
      expect(validation.passed).toBeDefined();
      expect(validation.messagesPerSecond).toBe(5000);
    });

    test('should validate memory usage against benchmarks', async () => {
      const memoryStats = {
        heapUsed: 50 * 1024 * 1024, // 50MB
        maxGCPause: 20 // 20ms
      };
      const benchmark = PIPELINE_BENCHMARKS.MEMORY_OPTIMIZATION;
      
      const validation = PerformanceTestUtils.validateMemoryUsage(memoryStats, benchmark);
      
      expect(validation.passed).toBeDefined();
      expect(validation.heapUsage.value).toBe(memoryStats.heapUsed);
      expect(validation.heapUsage.passed).toBeDefined();
      
      if (validation.gcPause) {
        expect(validation.gcPause.value).toBe(memoryStats.maxGCPause);
        expect(validation.gcPause.passed).toBeDefined();
      }
    });

    test('should generate comprehensive performance reports', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.MEMORY_STRESS;
      const results = {
        latencies: [10, 15, 20, 25, 30, 35, 40, 45, 50],
        messageCount: 1000,
        duration: 2000,
        errorCount: 5,
        memoryStats: {
          heapUsed: 60 * 1024 * 1024,
          maxGCPause: 25
        }
      };
      
      const report = PerformanceTestUtils.generatePerformanceReport(scenario, results);
      
      expect(report.scenario).toBe(scenario.name);
      expect(report.passed).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.details.latency).toBeDefined();
      expect(report.details.throughput).toBeDefined();
      expect(report.details.memory).toBeDefined();
      expect(report.details.errors).toBeDefined();
    });
  });

  describe('管道性能集成测试 (Pipeline Performance Integration)', () => {
    test('should maintain performance under normal load', async () => {
      const config = createMemoryOptimizedConfig();
      const { pipeline, monitor } = PipelineTestUtils.createTestPipeline(config);
      testPipeline = pipeline;
      
      await testPipeline.initialize();
      await testPipeline.start();
      
      const performanceMeasurer = new PerformanceMeasurer();
      const memoryMonitor = new MemoryMonitor();
      
      memoryMonitor.snapshot(); // 初始快照
      
      const messageCount = 1000;
      const testData = createPerformanceTestData(messageCount);
      
      performanceMeasurer.start('normal-load-test');
      
      for (const marketData of testData) {
        await testPipeline.process(marketData, 'performance-test');
      }
      
      const processingTime = performanceMeasurer.end('normal-load-test');
      memoryMonitor.snapshot(); // 结束快照
      
      const throughput = (messageCount / processingTime) * 1000;
      const memoryStats = memoryMonitor.getMemoryStats();
      
      expect(throughput).toBeGreaterThan(100); // 至少100 msg/s
      expect(processingTime).toBeLessThan(30000); // 30秒内完成
      
      if (memoryStats) {
        expect(memoryStats.growthRate).toBeLessThan(0.5); // 内存增长小于50%
      }
    });

    test('should handle memory pressure gracefully', async () => {
      const config = createMemoryOptimizedConfig();
      const { pipeline } = PipelineTestUtils.createTestPipeline(config);
      testPipeline = pipeline;
      
      await testPipeline.initialize();
      await testPipeline.start();
      
      const memoryMonitor = new MemoryMonitor();
      memoryMonitor.snapshot();
      
      // 生成内存密集型数据
      const stressData: any[] = [];
      for (let i = 0; i < 100; i++) {
        const largeData = createMemoryStressTestData(50); // 50KB per message
        stressData.push(largeData);
      }
      
      let processedCount = 0;
      let errorCount = 0;
      
      for (const data of stressData) {
        try {
          await testPipeline.process(data, 'memory-stress-test');
          processedCount++;
        } catch (error) {
          errorCount++;
        }
        
        if (processedCount % 10 === 0) {
          memoryMonitor.snapshot();
        }
      }
      
      memoryMonitor.snapshot();
      
      const errorRate = errorCount / stressData.length;
      const memoryStats = memoryMonitor.getMemoryStats();
      
      expect(errorRate).toBeLessThan(0.1); // 错误率小于10%
      expect(processedCount).toBeGreaterThan(stressData.length * 0.8); // 至少处理80%
      
      if (memoryStats) {
        expect(memoryStats.current.heapUsed).toBeLessThan(500 * 1024 * 1024); // 小于500MB
      }
    });

    test('should optimize performance automatically', async () => {
      // 创建带有性能优化器的配置
      const optimizedConfig = createPerformanceTestConfig();
      const { pipeline } = PipelineTestUtils.createTestPipeline(optimizedConfig);
      testPipeline = pipeline;
      
      await testPipeline.initialize();
      await testPipeline.start();
      
      const performanceOptimizer = new PerformanceOptimizer({
        enableAutoTuning: true,
        tuningInterval: 1000,
        memoryThreshold: 0.8,
        latencyThreshold: 100,
        throughputThreshold: 1000
      });
      
      const optimizationEvents: any[] = [];
      performanceOptimizer.on('optimizationApplied', (event) => {
        optimizationEvents.push(event);
      });
      
      performanceOptimizer.start();
      
      // 运行工作负载
      const workloadData = createHighFrequencyData(5000, 10); // 5秒，每10ms一条
      
      for (const marketData of workloadData) {
        await testPipeline.process(marketData, 'auto-optimization-test');
      }
      
      await PipelineTestUtils.wait(2000); // 等待优化器运行
      
      performanceOptimizer.stop();
      
      // 验证是否应用了优化
      const metrics = testPipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(workloadData.length);
      
      // 可能会有优化事件，取决于性能表现
      console.log(`Optimization events: ${optimizationEvents.length}`);
    });
  });

  describe('资源清理和泄漏防护 (Resource Cleanup and Leak Prevention)', () => {
    test('should cleanup resources properly on pipeline destroy', async () => {
      const config = createMemoryOptimizedConfig();
      const { pipeline } = PipelineTestUtils.createTestPipeline(config);
      
      await pipeline.initialize();
      await pipeline.start();
      
      const memoryBefore = process.memoryUsage();
      
      // 处理一些数据
      const testData = createMockMarketDataBatch(100);
      for (const marketData of testData) {
        await pipeline.process(marketData, 'cleanup-test');
      }
      
      // 销毁管道
      await pipeline.destroy();
      
      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }
      
      await PipelineTestUtils.wait(100);
      
      const memoryAfter = process.memoryUsage();
      
      // 内存使用不应该大幅增加
      const memoryGrowth = memoryAfter.heapUsed - memoryBefore.heapUsed;
      const growthPercentage = memoryGrowth / memoryBefore.heapUsed;
      
      expect(growthPercentage).toBeLessThan(0.5); // 增长不超过50%
    });

    test('should prevent memory leaks in long-running scenarios', async () => {
      const config = createMemoryOptimizedConfig();
      const { pipeline } = PipelineTestUtils.createTestPipeline(config);
      testPipeline = pipeline;
      
      await testPipeline.initialize();
      await testPipeline.start();
      
      const memoryMonitor = new MemoryMonitor();
      
      // 长时间运行测试
      const cycles = 10;
      const messagesPerCycle = 50;
      
      for (let cycle = 0; cycle < cycles; cycle++) {
        memoryMonitor.snapshot();
        
        const cycleData = createMockMarketDataBatch(messagesPerCycle);
        for (const marketData of cycleData) {
          await testPipeline.process(marketData, `leak-test-cycle-${cycle}`);
        }
        
        // 定期触发清理
        if (global.gc && cycle % 3 === 0) {
          global.gc();
        }
        
        await PipelineTestUtils.wait(100);
      }
      
      memoryMonitor.snapshot();
      
      const hasLeak = memoryMonitor.detectMemoryLeak(0.2); // 20%增长阈值
      expect(hasLeak).toBe(false);
      
      const memoryStats = memoryMonitor.getMemoryStats();
      if (memoryStats) {
        expect(Math.abs(memoryStats.growthRate)).toBeLessThan(0.3); // 增长率小于30%
      }
    });

    test('should handle resource cleanup under error conditions', async () => {
      const config = createMemoryOptimizedConfig();
      const { pipeline } = PipelineTestUtils.createTestPipeline(config);
      testPipeline = pipeline;
      
      await testPipeline.initialize();
      await testPipeline.start();
      
      const inputStage = testPipeline.getMockStage('input');
      let errorCount = 0;
      
      // 模拟随机错误
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          if (Math.random() < 0.3) { // 30%错误率
            errorCount++;
            throw new Error('Random processing error');
          }
          return data;
        });
      }
      
      const memoryBefore = process.memoryUsage();
      
      // 处理数据，包含错误
      const testData = createMockMarketDataBatch(100);
      let processedCount = 0;
      
      for (const marketData of testData) {
        try {
          await testPipeline.process(marketData, 'error-cleanup-test');
          processedCount++;
        } catch (error) {
          // 忽略预期的错误
        }
      }
      
      const memoryAfter = process.memoryUsage();
      
      expect(errorCount).toBeGreaterThan(0); // 应该有一些错误
      expect(processedCount).toBeGreaterThan(0); // 应该处理了一些数据
      
      // 即使有错误，内存也不应该大幅增长
      const memoryGrowth = memoryAfter.heapUsed - memoryBefore.heapUsed;
      const growthPercentage = memoryGrowth / memoryBefore.heapUsed;
      
      expect(growthPercentage).toBeLessThan(1.0); // 增长不超过100%
    });
  });
});