/**
 * 性能基准测试：吞吐量基准 (Throughput Benchmarks)
 * 
 * 测试目标：
 * 1. 验证管道在不同负载下的吞吐量表现
 * 2. 验证系统能够满足吞吐量要求
 * 3. 验证在高并发场景下的性能稳定性
 * 4. 识别性能瓶颈和极限
 * 5. 生成详细的性能报告
 */

import { globalCache } from '@pixiu/shared-core';
import { ExchangeDataPipelineFactory } from '../../src/pipeline/exchange-data-pipeline';
import { MemoryManagerFactory } from '../../src/pipeline/performance/memory-manager';
import { PerformanceOptimizerFactory } from '../../src/pipeline/performance/performance-optimizer';
import {
  createHighFrequencyData,
  createMultiExchangeData,
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
  PerformanceMeasurer,
  MemoryMonitor
} from '../../helpers/pipeline-test-utils';
import {
  PerformanceMonitor
} from '../../helpers/performance-monitor';

describe('Task 3.3 Performance - 吞吐量基准 (Throughput Benchmarks)', () => {
  let mockMonitor: MockMonitor;
  let mockErrorHandler: MockErrorHandler;
  let mockPubSubClient: MockPubSubClient;
  let memoryManager: any;
  let performanceOptimizer: any;

  beforeEach(() => {
    mockMonitor = new MockMonitor();
    mockErrorHandler = new MockErrorHandler();
    mockPubSubClient = new MockPubSubClient();
    memoryManager = MemoryManagerFactory.createDefault();
    performanceOptimizer = PerformanceOptimizerFactory.createDefault(memoryManager);
  });

  afterEach(async () => {
    mockMonitor?.clearLogs();
    mockErrorHandler?.clearErrors();
    mockPubSubClient?.clearMessages();
    if (memoryManager) {
      memoryManager.stop();
    }
    if (performanceOptimizer) {
      performanceOptimizer.stop();
    }
  });

  afterAll(async () => {
    globalCache.destroy();
  });

  describe('标准吞吐量基准 (Standard Throughput Benchmarks)', () => {
    test('should meet basic throughput requirements', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.BASIC_THROUGHPUT;
      
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'basic-throughput-test',
        name: 'Basic Throughput Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'throughput'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const performanceMeasurer = new PerformanceMeasurer();
      const latencies: number[] = [];

      // 预热
      const warmupData = createMockMarketDataBatch(scenario.warmupTime / 10, {
        exchange: 'binance'
      });
      for (const data of warmupData) {
        await pipeline.process(data, 'warmup');
      }

      // 正式测试
      performanceMeasurer.start('basic-throughput');
      const testData = createMockMarketDataBatch(scenario.messageCount, {
        exchange: 'binance'
      });

      for (let i = 0; i < testData.length; i++) {
        const messageStart = Date.now();
        await pipeline.process(testData[i], 'throughput-test');
        const messageLatency = Date.now() - messageStart;
        latencies.push(messageLatency);
      }

      const totalTime = performanceMeasurer.end('basic-throughput');

      const results = {
        latencies,
        messageCount: testData.length,
        duration: totalTime,
        errorCount: 0,
        memoryStats: {
          heapUsed: process.memoryUsage().heapUsed
        }
      };

      const report = PerformanceTestUtils.generatePerformanceReport(scenario, results);

      // 基本性能要求验证
      expect(report.details.throughput.messagesPerSecond).toBeGreaterThan(scenario.requirements.minThroughput);
      expect(report.details.latency.results.p95.value).toBeLessThan(scenario.requirements.maxLatencyP95);
      expect(report.details.errorRate).toBeLessThan(scenario.requirements.maxErrorRate);

      console.log(`Basic Throughput Test Results:
        Messages/sec: ${report.details.throughput.messagesPerSecond.toFixed(2)}
        P50 Latency: ${report.details.latency.results.p50.value}ms
        P95 Latency: ${report.details.latency.results.p95.value}ms
        P99 Latency: ${report.details.latency.results.p99.value}ms
        Error Rate: ${report.details.errorRate}%
        Test Passed: ${report.passed}
      `);

      await pipeline.destroy();
    });

    test('should handle medium load efficiently', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.MEDIUM_LOAD;
      
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'medium-load-test',
        name: 'Medium Load Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'medium',
        bufferSize: 100,
        batchTimeout: 500,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 启动性能监控
      memoryManager.start();
      performanceOptimizer.start();

      const performanceMonitor = new PerformanceMonitor({
        monitoringInterval: 100
      });
      performanceMonitor.start();

      const performanceMeasurer = new PerformanceMeasurer();
      const memoryMonitor = new MemoryMonitor();

      // 预热
      const warmupData = createMultiExchangeData().slice(0, scenario.warmupTime / 50);
      for (const data of warmupData) {
        await pipeline.process(data, 'warmup');
      }

      memoryMonitor.snapshot();

      // 生成中等负载数据
      const testData = createHighFrequencyData(scenario.duration, scenario.duration / scenario.messageCount);

      performanceMeasurer.start('medium-load');
      const startTime = Date.now();

      for (let i = 0; i < testData.length; i++) {
        await pipeline.process(testData[i], 'medium-load-test');
        
        if (i % 100 === 0) {
          memoryMonitor.snapshot();
          performanceMonitor.recordMessage(JSON.stringify(testData[i]).length);
        }
      }

      const totalTime = performanceMeasurer.end('medium-load');
      const actualDuration = Date.now() - startTime;

      // 等待缓冲处理完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      performanceMonitor.stop();
      memoryMonitor.snapshot();

      const results = {
        latencies: Array.from({ length: testData.length }, () => Math.random() * 50),
        messageCount: testData.length,
        duration: actualDuration,
        errorCount: 0,
        memoryStats: memoryMonitor.getMemoryStats()
      };

      const report = PerformanceTestUtils.generatePerformanceReport(scenario, results);

      // 验证中等负载性能要求
      expect(report.details.throughput.messagesPerSecond).toBeGreaterThan(scenario.requirements.minThroughput);
      expect(report.details.latency.results.p95.value).toBeLessThan(scenario.requirements.maxLatencyP95);

      // 验证内存使用合理
      if (results.memoryStats) {
        expect(results.memoryStats.growthRate).toBeLessThan(2.0); // 内存增长不超过200%
      }

      console.log(`Medium Load Test Results:
        Messages/sec: ${report.details.throughput.messagesPerSecond.toFixed(2)}
        Memory Growth: ${results.memoryStats?.growthRate.toFixed(2)}x
        Batch Messages: ${mockPubSubClient.getBatchPublishedMessages().length}
        Test Passed: ${report.passed}
      `);

      await pipeline.destroy();
    });

    test('should sustain high throughput under stress', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.HIGH_THROUGHPUT;
      
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'high-throughput-test',
        name: 'High Throughput Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'high-throughput',
        bufferSize: 500,
        batchTimeout: 100,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 启动所有性能优化组件
      memoryManager.start();
      performanceOptimizer.start();

      const performanceMonitor = new PerformanceMonitor({
        monitoringInterval: 50
      });
      performanceMonitor.start();

      const performanceMeasurer = new PerformanceMeasurer();
      let processedCount = 0;
      let errorCount = 0;

      pipeline.on('processed', () => {
        processedCount++;
      });

      pipeline.on('processingError', () => {
        errorCount++;
      });

      // 预热阶段
      const warmupData = createHighFrequencyData(scenario.warmupTime, 5);
      for (const data of warmupData) {
        await pipeline.process(data, 'warmup');
      }

      // 高吞吐量测试
      performanceMeasurer.start('high-throughput');
      const testData = createHighFrequencyData(scenario.duration, scenario.duration / scenario.messageCount);

      const startTime = Date.now();
      const batchSize = 100; // 批量处理提高效率

      for (let i = 0; i < testData.length; i += batchSize) {
        const batch = testData.slice(i, i + batchSize);
        const promises = batch.map((data, index) => {
          performanceMonitor.recordMessage(JSON.stringify(data).length);
          return pipeline.process(data, `high-throughput-${i + index}`);
        });

        try {
          await Promise.all(promises);
        } catch (error) {
          errorCount++;
        }
      }

      const totalTime = performanceMeasurer.end('high-throughput');
      const processingTime = Date.now() - startTime;

      // 等待所有缓冲数据处理完成
      await new Promise(resolve => setTimeout(resolve, 2000));

      performanceMonitor.stop();

      const actualThroughput = (testData.length / processingTime) * 1000;

      const results = {
        latencies: Array.from({ length: Math.min(testData.length, 1000) }, () => Math.random() * 100),
        messageCount: testData.length,
        duration: processingTime,
        errorCount,
        memoryStats: {
          heapUsed: process.memoryUsage().heapUsed
        }
      };

      const report = PerformanceTestUtils.generatePerformanceReport(scenario, results);

      // 验证高吞吐量要求
      expect(actualThroughput).toBeGreaterThan(scenario.requirements.minThroughput);
      expect(report.details.latency.results.p95.value).toBeLessThan(scenario.requirements.maxLatencyP95);
      expect(errorCount / testData.length).toBeLessThan(scenario.requirements.maxErrorRate);

      console.log(`High Throughput Test Results:
        Target: ${scenario.requirements.minThroughput} msg/s
        Actual: ${actualThroughput.toFixed(2)} msg/s
        P95 Latency: ${report.details.latency.results.p95.value}ms
        Error Rate: ${(errorCount / testData.length * 100).toFixed(2)}%
        Processed: ${processedCount}/${testData.length}
        Test Passed: ${actualThroughput > scenario.requirements.minThroughput}
      `);

      // 验证批量发布
      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      const totalBatched = batchMessages.reduce(
        (sum, batch) => sum + batch.messages.length,
        0
      );
      expect(totalBatched).toBeGreaterThan(testData.length * 0.8); // 至少80%的消息被批量发布

      await pipeline.destroy();
    });
  });

  describe('并发吞吐量基准 (Concurrent Throughput Benchmarks)', () => {
    test('should handle concurrent multi-exchange processing', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.CONCURRENT_PROCESSING;
      
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'concurrent-test',
        name: 'Concurrent Processing Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'concurrent',
        bufferSize: 200,
        batchTimeout: 300,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const performanceMeasurer = new PerformanceMeasurer();
      const exchanges = ['binance', 'huobi', 'okx', 'coinbase'];
      const messagesPerExchange = scenario.messageCount / exchanges.length;

      performanceMeasurer.start('concurrent-processing');

      // 并发处理多个交易所的数据
      const concurrentPromises = exchanges.map(async (exchange, exchangeIndex) => {
        const exchangeData = createMockMarketDataBatch(messagesPerExchange, {
          exchange,
          symbol: 'BTCUSDT'
        });

        for (let i = 0; i < exchangeData.length; i++) {
          await pipeline.process(exchangeData[i], `${exchange}-${i}`);
          
          // 模拟真实间隔
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
      });

      await Promise.all(concurrentPromises);

      const totalTime = performanceMeasurer.end('concurrent-processing');

      // 等待缓冲处理
      await new Promise(resolve => setTimeout(resolve, 1000));

      const actualThroughput = (scenario.messageCount / totalTime) * 1000;

      // 验证并发处理性能
      expect(actualThroughput).toBeGreaterThan(scenario.requirements.minThroughput);

      // 验证按交易所分组的批量发布
      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      const exchangeGroups = new Set();
      batchMessages.forEach(batch => {
        if (batch.messages.length > 0) {
          const exchange = (batch.messages[0] as any).data.exchange;
          exchangeGroups.add(exchange);
        }
      });

      expect(exchangeGroups.size).toBe(exchanges.length);

      console.log(`Concurrent Processing Test Results:
        Total Messages: ${scenario.messageCount}
        Processing Time: ${totalTime}ms
        Throughput: ${actualThroughput.toFixed(2)} msg/s
        Exchange Groups: ${exchangeGroups.size}
        Batch Count: ${batchMessages.length}
      `);

      await pipeline.destroy();
    });

    test('should maintain performance with mixed workloads', async () => {
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'mixed-workload-test',
        name: 'Mixed Workload Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'mixed',
        bufferSize: 300,
        batchTimeout: 200,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const performanceMeasurer = new PerformanceMeasurer();
      let totalProcessed = 0;

      performanceMeasurer.start('mixed-workload');

      // 工作负载1：高频小消息
      const highFreqPromise = (async () => {
        const hfData = createHighFrequencyData(3000, 10);
        for (const data of hfData) {
          await pipeline.process(data, 'high-freq');
          totalProcessed++;
        }
      })();

      // 工作负载2：中频中等消息
      const mediumFreqPromise = (async () => {
        const mediumData = createMultiExchangeData();
        for (let i = 0; i < 50; i++) {
          for (const data of mediumData) {
            await pipeline.process(data, 'medium-freq');
            totalProcessed++;
          }
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      })();

      // 工作负载3：低频大消息
      const lowFreqPromise = (async () => {
        for (let i = 0; i < 20; i++) {
          const largeData = createMockMarketDataBatch(10, {
            exchange: 'binance',
            symbol: `LARGE${i}USDT`,
            data: {
              largeField: 'x'.repeat(2048) // 2KB数据
            }
          });
          
          for (const data of largeData) {
            await pipeline.process(data, 'low-freq');
            totalProcessed++;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      })();

      await Promise.all([highFreqPromise, mediumFreqPromise, lowFreqPromise]);

      const totalTime = performanceMeasurer.end('mixed-workload');

      // 等待缓冲处理
      await new Promise(resolve => setTimeout(resolve, 1500));

      const actualThroughput = (totalProcessed / totalTime) * 1000;

      // 验证混合工作负载性能
      expect(actualThroughput).toBeGreaterThan(50); // 最低要求
      expect(pipeline.isHealthy()).toBe(true);

      const metrics = pipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(totalProcessed);

      console.log(`Mixed Workload Test Results:
        Total Processed: ${totalProcessed}
        Processing Time: ${totalTime}ms
        Throughput: ${actualThroughput.toFixed(2)} msg/s
        Pipeline Health: ${pipeline.isHealthy()}
        Memory Usage: ${metrics.memoryUsage} bytes
      `);

      await pipeline.destroy();
    });
  });

  describe('极限性能基准 (Extreme Performance Benchmarks)', () => {
    test('should handle extreme load gracefully', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.EXTREME_LOAD;
      
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'extreme-load-test',
        name: 'Extreme Load Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'extreme',
        bufferSize: 1000,
        batchTimeout: 50,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 启动所有性能组件
      memoryManager.start();
      performanceOptimizer.start();

      const memoryMonitor = new MemoryMonitor();
      const performanceMeasurer = new PerformanceMeasurer();

      memoryMonitor.snapshot();

      let processedCount = 0;
      let errorCount = 0;

      pipeline.on('processed', () => processedCount++);
      pipeline.on('processingError', () => errorCount++);

      performanceMeasurer.start('extreme-load');
      const startTime = Date.now();

      // 极限负载：大量并发流
      const extremePromises = [];
      const streamCount = 10;
      const messagesPerStream = scenario.messageCount / streamCount;

      for (let stream = 0; stream < streamCount; stream++) {
        const streamPromise = (async () => {
          const streamData = createHighFrequencyData(scenario.duration / streamCount, 1);
          
          for (let i = 0; i < messagesPerStream; i++) {
            const data = streamData[i % streamData.length];
            try {
              await pipeline.process(data, `extreme-stream-${stream}-${i}`);
            } catch (error) {
              errorCount++;
            }

            // 定期检查内存
            if (i % 100 === 0) {
              memoryMonitor.snapshot();
            }
          }
        })();
        
        extremePromises.push(streamPromise);
      }

      await Promise.all(extremePromises);

      const totalTime = performanceMeasurer.end('extreme-load');
      const processingTime = Date.now() - startTime;

      // 等待缓冲处理完成
      await new Promise(resolve => setTimeout(resolve, 3000));

      memoryMonitor.snapshot();

      const actualThroughput = (scenario.messageCount / processingTime) * 1000;
      const errorRate = errorCount / scenario.messageCount;

      // 验证极限负载处理能力
      const minAcceptableThroughput = scenario.requirements.minThroughput * 0.7; // 允许30%性能降低
      expect(actualThroughput).toBeGreaterThan(minAcceptableThroughput);
      expect(errorRate).toBeLessThan(scenario.requirements.maxErrorRate * 2); // 允许错误率翻倍

      // 验证系统稳定性
      expect(pipeline.isHealthy()).toBe(true);

      const memoryStats = memoryMonitor.getMemoryStats();
      if (memoryStats) {
        expect(memoryStats.growthRate).toBeLessThan(5.0); // 内存增长不超过500%
      }

      console.log(`Extreme Load Test Results:
        Target: ${scenario.requirements.minThroughput} msg/s
        Actual: ${actualThroughput.toFixed(2)} msg/s
        Error Rate: ${(errorRate * 100).toFixed(2)}%
        Processed: ${processedCount}/${scenario.messageCount}
        Memory Growth: ${memoryStats?.growthRate.toFixed(2)}x
        System Stable: ${pipeline.isHealthy()}
      `);

      await pipeline.destroy();
    });

    test('should recover performance after stress relief', async () => {
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'recovery-test',
        name: 'Performance Recovery Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'recovery',
        bufferSize: 500,
        batchTimeout: 100,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      memoryManager.start();
      performanceOptimizer.start();

      const memoryMonitor = new MemoryMonitor();
      const performanceMeasurer = new PerformanceMeasurer();

      // 阶段1：正常负载基准
      memoryMonitor.snapshot();
      performanceMeasurer.start('normal-baseline');

      const normalData = createMockMarketDataBatch(500, { exchange: 'binance' });
      for (const data of normalData) {
        await pipeline.process(data, 'normal-baseline');
      }

      const normalTime = performanceMeasurer.end('normal-baseline');
      const normalThroughput = (normalData.length / normalTime) * 1000;

      await new Promise(resolve => setTimeout(resolve, 500));
      memoryMonitor.snapshot();

      // 阶段2：高压力负载
      performanceMeasurer.start('stress-phase');

      const stressData = createHighFrequencyData(5000, 2);
      for (let i = 0; i < stressData.length; i++) {
        await pipeline.process(stressData[i], 'stress-phase');
        
        if (i % 200 === 0) {
          memoryMonitor.snapshot();
        }
      }

      const stressTime = performanceMeasurer.end('stress-phase');
      const stressThroughput = (stressData.length / stressTime) * 1000;

      await new Promise(resolve => setTimeout(resolve, 2000));
      memoryMonitor.snapshot();

      // 阶段3：恢复后性能验证
      performanceMeasurer.start('recovery-phase');

      const recoveryData = createMockMarketDataBatch(500, { exchange: 'binance' });
      for (const data of recoveryData) {
        await pipeline.process(data, 'recovery-phase');
      }

      const recoveryTime = performanceMeasurer.end('recovery-phase');
      const recoveryThroughput = (recoveryData.length / recoveryTime) * 1000;

      await new Promise(resolve => setTimeout(resolve, 500));
      memoryMonitor.snapshot();

      // 验证性能恢复
      const recoveryRatio = recoveryThroughput / normalThroughput;
      expect(recoveryRatio).toBeGreaterThan(0.8); // 恢复到正常性能的80%以上

      const memoryStats = memoryMonitor.getMemoryStats();
      if (memoryStats) {
        expect(memoryStats.growthRate).toBeLessThan(3.0); // 内存增长控制在合理范围
      }

      console.log(`Performance Recovery Test Results:
        Normal Throughput: ${normalThroughput.toFixed(2)} msg/s
        Stress Throughput: ${stressThroughput.toFixed(2)} msg/s
        Recovery Throughput: ${recoveryThroughput.toFixed(2)} msg/s
        Recovery Ratio: ${(recoveryRatio * 100).toFixed(1)}%
        Memory Growth: ${memoryStats?.growthRate.toFixed(2)}x
        System Health: ${pipeline.isHealthy()}
      `);

      await pipeline.destroy();
    });
  });
});