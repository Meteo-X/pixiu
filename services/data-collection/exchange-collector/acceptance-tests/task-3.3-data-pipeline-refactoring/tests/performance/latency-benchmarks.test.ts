/**
 * 性能基准测试：延迟基准 (Latency Benchmarks)
 * 
 * 测试目标：
 * 1. 验证管道处理延迟满足实时性要求
 * 2. 测量不同负载下的延迟分布
 * 3. 验证P95、P99延迟指标
 * 4. 识别延迟热点和瓶颈
 * 5. 验证延迟一致性和稳定性
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
  PerformanceMeasurer
} from '../../helpers/pipeline-test-utils';
import {
  PerformanceMonitor
} from '../../helpers/performance-monitor';

interface LatencyMeasurement {
  timestamp: number;
  messageId: string;
  startTime: number;
  endTime: number;
  latency: number;
  stage: string;
}

class LatencyTracker {
  private measurements: LatencyMeasurement[] = [];
  private pendingMessages = new Map<string, number>();

  startTracking(messageId: string): void {
    this.pendingMessages.set(messageId, Date.now());
  }

  endTracking(messageId: string, stage: string = 'complete'): number {
    const startTime = this.pendingMessages.get(messageId);
    if (!startTime) return -1;

    const endTime = Date.now();
    const latency = endTime - startTime;

    this.measurements.push({
      timestamp: endTime,
      messageId,
      startTime,
      endTime,
      latency,
      stage
    });

    this.pendingMessages.delete(messageId);
    return latency;
  }

  getLatencies(): number[] {
    return this.measurements.map(m => m.latency);
  }

  getStatistics() {
    const latencies = this.getLatencies().sort((a, b) => a - b);
    if (latencies.length === 0) return null;

    return {
      count: latencies.length,
      min: latencies[0],
      max: latencies[latencies.length - 1],
      avg: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      p50: latencies[Math.floor(latencies.length * 0.5)],
      p95: latencies[Math.floor(latencies.length * 0.95)],
      p99: latencies[Math.floor(latencies.length * 0.99)]
    };
  }

  clear(): void {
    this.measurements = [];
    this.pendingMessages.clear();
  }
}

describe('Task 3.3 Performance - 延迟基准 (Latency Benchmarks)', () => {
  let mockMonitor: MockMonitor;
  let mockErrorHandler: MockErrorHandler;
  let mockPubSubClient: MockPubSubClient;
  let memoryManager: any;
  let performanceOptimizer: any;
  let latencyTracker: LatencyTracker;

  beforeEach(() => {
    mockMonitor = new MockMonitor();
    mockErrorHandler = new MockErrorHandler();
    mockPubSubClient = new MockPubSubClient();
    memoryManager = MemoryManagerFactory.createDefault();
    performanceOptimizer = PerformanceOptimizerFactory.createDefault(memoryManager);
    latencyTracker = new LatencyTracker();
  });

  afterEach(async () => {
    mockMonitor?.clearLogs();
    mockErrorHandler?.clearErrors();
    mockPubSubClient?.clearMessages();
    latencyTracker?.clear();
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

  describe('基础延迟基准 (Basic Latency Benchmarks)', () => {
    test('should meet low latency requirements for real-time processing', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.LOW_LATENCY;
      
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'low-latency-test',
        name: 'Low Latency Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'latency'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 预热
      const warmupData = createMockMarketDataBatch(50, { exchange: 'binance' });
      for (const data of warmupData) {
        await pipeline.process(data, 'warmup');
      }

      // 单消息延迟测试
      const testMessages = 100;
      const latencies: number[] = [];

      for (let i = 0; i < testMessages; i++) {
        const messageId = `latency-test-${i}`;
        const testData = createMockMarketData({
          id: messageId,
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: 'ticker',
          sequence: i
        });

        latencyTracker.startTracking(messageId);
        
        await pipeline.process(testData, 'latency-test');
        
        const latency = latencyTracker.endTracking(messageId);
        if (latency > 0) {
          latencies.push(latency);
        }

        // 适当间隔避免批处理影响
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const stats = latencyTracker.getStatistics();
      expect(stats).not.toBeNull();

      if (stats) {
        // 验证延迟要求
        expect(stats.p95).toBeLessThan(scenario.requirements.maxLatencyP95);
        expect(stats.p99).toBeLessThan(scenario.requirements.maxLatencyP99);
        expect(stats.avg).toBeLessThan(scenario.requirements.maxLatencyP95 * 0.5);

        console.log(`Low Latency Test Results:
          Messages: ${stats.count}
          Average: ${stats.avg.toFixed(2)}ms
          P50: ${stats.p50}ms
          P95: ${stats.p95}ms (Req: <${scenario.requirements.maxLatencyP95}ms)
          P99: ${stats.p99}ms (Req: <${scenario.requirements.maxLatencyP99}ms)
          Min/Max: ${stats.min}ms / ${stats.max}ms
        `);
      }

      await pipeline.destroy();
    });

    test('should maintain consistent latency under steady load', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'consistent-latency-test',
        name: 'Consistent Latency Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'consistent'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const performanceMonitor = new PerformanceMonitor({
        monitoringInterval: 100
      });
      performanceMonitor.start();

      // 持续负载测试
      const testDuration = 5000; // 5秒
      const messageInterval = 50; // 每50ms一条消息
      const expectedMessages = testDuration / messageInterval;

      const startTime = Date.now();
      let messageIndex = 0;

      while (Date.now() - startTime < testDuration) {
        const messageId = `consistent-test-${messageIndex}`;
        const testData = createMockMarketData({
          id: messageId,
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: messageIndex
        });

        latencyTracker.startTracking(messageId);
        
        await pipeline.process(testData, 'consistent-test');
        
        const latency = latencyTracker.endTracking(messageId);
        performanceMonitor.recordLatency(latency);

        messageIndex++;
        await new Promise(resolve => setTimeout(resolve, messageInterval));
      }

      performanceMonitor.stop();

      const stats = latencyTracker.getStatistics();
      expect(stats).not.toBeNull();

      if (stats) {
        // 验证延迟一致性
        const latencyVariance = this.calculateVariance(latencyTracker.getLatencies());
        const latencyStdDev = Math.sqrt(latencyVariance);
        const coefficientOfVariation = latencyStdDev / stats.avg;

        expect(coefficientOfVariation).toBeLessThan(1.0); // 变异系数小于1
        expect(stats.max - stats.min).toBeLessThan(stats.avg * 5); // 最大最小差异不超过平均值的5倍

        console.log(`Consistent Latency Test Results:
          Duration: ${testDuration}ms
          Messages: ${stats.count}
          Expected: ~${expectedMessages}
          Average Latency: ${stats.avg.toFixed(2)}ms
          Std Deviation: ${latencyStdDev.toFixed(2)}ms
          Coefficient of Variation: ${coefficientOfVariation.toFixed(3)}
          Range: ${stats.min}ms - ${stats.max}ms
        `);
      }

      await pipeline.destroy();
    });

    test('should handle burst traffic with acceptable latency spikes', async () => {
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'burst-latency-test',
        name: 'Burst Latency Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'burst',
        bufferSize: 50,
        batchTimeout: 200,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 测试场景：正常->突发->恢复
      const scenarios = [
        { phase: 'normal', messageCount: 20, interval: 100 },
        { phase: 'burst', messageCount: 100, interval: 5 },
        { phase: 'recovery', messageCount: 20, interval: 100 }
      ];

      const phaseResults: any[] = [];

      for (const scenario of scenarios) {
        latencyTracker.clear();
        
        for (let i = 0; i < scenario.messageCount; i++) {
          const messageId = `${scenario.phase}-${i}`;
          const testData = createMockMarketData({
            id: messageId,
            exchange: 'binance',
            symbol: 'BTCUSDT',
            sequence: i
          });

          latencyTracker.startTracking(messageId);
          
          await pipeline.process(testData, `${scenario.phase}-test`);
          
          latencyTracker.endTracking(messageId);

          if (scenario.interval > 0) {
            await new Promise(resolve => setTimeout(resolve, scenario.interval));
          }
        }

        // 等待缓冲处理
        if (scenario.phase === 'burst') {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const phaseStats = latencyTracker.getStatistics();
        if (phaseStats) {
          phaseResults.push({
            phase: scenario.phase,
            stats: phaseStats
          });
        }
      }

      // 验证突发流量处理
      const normalPhase = phaseResults.find(r => r.phase === 'normal');
      const burstPhase = phaseResults.find(r => r.phase === 'burst');
      const recoveryPhase = phaseResults.find(r => r.phase === 'recovery');

      if (normalPhase && burstPhase && recoveryPhase) {
        // 突发期间延迟可以增加，但不应该过高
        expect(burstPhase.stats.p95).toBeLessThan(normalPhase.stats.p95 * 10);
        
        // 恢复阶段延迟应该回到正常水平
        const recoveryRatio = recoveryPhase.stats.avg / normalPhase.stats.avg;
        expect(recoveryRatio).toBeLessThan(2.0);

        console.log(`Burst Traffic Latency Test Results:
          Normal Phase - Avg: ${normalPhase.stats.avg.toFixed(2)}ms, P95: ${normalPhase.stats.p95}ms
          Burst Phase - Avg: ${burstPhase.stats.avg.toFixed(2)}ms, P95: ${burstPhase.stats.p95}ms
          Recovery Phase - Avg: ${recoveryPhase.stats.avg.toFixed(2)}ms, P95: ${recoveryPhase.stats.p95}ms
          Recovery Ratio: ${recoveryRatio.toFixed(2)}x
        `);
      }

      await pipeline.destroy();
    });
  });

  describe('缓冲延迟分析 (Buffering Latency Analysis)', () => {
    test('should measure buffering impact on latency', async () => {
      const bufferSizes = [10, 50, 100, 200];
      const results: any[] = [];

      for (const bufferSize of bufferSizes) {
        const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
          id: `buffer-latency-${bufferSize}`,
          name: `Buffer Latency Test ${bufferSize}`,
          pubsubClient: mockPubSubClient,
          topicPrefix: 'buffer',
          bufferSize,
          batchTimeout: 1000,
          partitionBy: 'symbol'
        }, mockMonitor, mockErrorHandler);

        await pipeline.initialize();
        await pipeline.start();

        latencyTracker.clear();

        // 发送测试数据
        const testMessages = 50;
        for (let i = 0; i < testMessages; i++) {
          const messageId = `buffer-${bufferSize}-${i}`;
          const testData = createMockMarketData({
            id: messageId,
            exchange: 'binance',
            symbol: 'BTCUSDT',
            sequence: i
          });

          latencyTracker.startTracking(messageId);
          
          await pipeline.process(testData, 'buffer-latency-test');
          
          latencyTracker.endTracking(messageId);
        }

        // 等待缓冲刷新
        await new Promise(resolve => setTimeout(resolve, 1200));

        const stats = latencyTracker.getStatistics();
        if (stats) {
          results.push({
            bufferSize,
            stats
          });
        }

        await pipeline.destroy();
        mockPubSubClient.clearMessages();
      }

      // 分析缓冲大小对延迟的影响
      console.log('Buffer Size vs Latency Analysis:');
      results.forEach(result => {
        console.log(`  Buffer ${result.bufferSize}: Avg=${result.stats.avg.toFixed(2)}ms, P95=${result.stats.p95}ms, P99=${result.stats.p99}ms`);
      });

      // 验证缓冲延迟趋势合理
      expect(results.length).toBe(bufferSizes.length);
      
      // 较大的缓冲区可能有较高的延迟，但应该在合理范围内
      const maxLatencyResult = results.reduce((max, current) => 
        current.stats.p95 > max.stats.p95 ? current : max
      );
      expect(maxLatencyResult.stats.p95).toBeLessThan(2000); // 最大P95延迟不超过2秒
    });

    test('should measure timeout-based vs size-based flush latency', async () => {
      // 场景1：基于大小的刷新
      const sizePipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'size-flush-test',
        name: 'Size Flush Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'size',
        bufferSize: 10,
        batchTimeout: 10000, // 很长的超时
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await sizePipeline.initialize();
      await sizePipeline.start();

      latencyTracker.clear();

      // 发送恰好触发大小刷新的数据
      for (let i = 0; i < 10; i++) {
        const messageId = `size-flush-${i}`;
        const testData = createMockMarketData({
          id: messageId,
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i
        });

        latencyTracker.startTracking(messageId);
        await sizePipeline.process(testData, 'size-flush-test');
        latencyTracker.endTracking(messageId);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
      const sizeFlushStats = latencyTracker.getStatistics();

      await sizePipeline.destroy();

      // 场景2：基于超时的刷新
      const timeoutPipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'timeout-flush-test',
        name: 'Timeout Flush Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'timeout',
        bufferSize: 1000, // 很大的缓冲区
        batchTimeout: 200,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await timeoutPipeline.initialize();
      await timeoutPipeline.start();

      latencyTracker.clear();
      mockPubSubClient.clearMessages();

      // 发送少量数据触发超时刷新
      for (let i = 0; i < 5; i++) {
        const messageId = `timeout-flush-${i}`;
        const testData = createMockMarketData({
          id: messageId,
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i
        });

        latencyTracker.startTracking(messageId);
        await timeoutPipeline.process(testData, 'timeout-flush-test');
        latencyTracker.endTracking(messageId);
      }

      await new Promise(resolve => setTimeout(resolve, 400));
      const timeoutFlushStats = latencyTracker.getStatistics();

      await timeoutPipeline.destroy();

      // 比较两种刷新策略的延迟特征
      if (sizeFlushStats && timeoutFlushStats) {
        console.log(`Flush Strategy Latency Comparison:
          Size-based Flush - Avg: ${sizeFlushStats.avg.toFixed(2)}ms, P95: ${sizeFlushStats.p95}ms
          Timeout-based Flush - Avg: ${timeoutFlushStats.avg.toFixed(2)}ms, P95: ${timeoutFlushStats.p95}ms
        `);

        // 基于大小的刷新通常延迟更低
        expect(sizeFlushStats.avg).toBeLessThan(timeoutFlushStats.avg * 2);
      }
    });
  });

  describe('路由延迟分析 (Routing Latency Analysis)', () => {
    test('should measure routing rule evaluation latency', async () => {
      const pipeline = ExchangeDataPipelineFactory.createRoutingPipeline({
        id: 'routing-latency-test',
        name: 'Routing Latency Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'routing',
        routingRules: [
          {
            id: 'binance-rule',
            name: 'Binance Rule',
            condition: { type: 'exact', field: 'exchange', value: 'binance' },
            target: { type: 'topic', destination: 'binance-data' },
            enabled: true,
            priority: 100
          },
          {
            id: 'btc-pattern',
            name: 'BTC Pattern',
            condition: { type: 'pattern', field: 'symbol', value: 'BTC*' },
            target: { type: 'topic', destination: 'btc-data' },
            enabled: true,
            priority: 90
          },
          {
            id: 'high-volume',
            name: 'High Volume',
            condition: { 
              type: 'function', 
              field: 'data', 
              value: (data: any) => data.volume > 10
            },
            target: { type: 'topic', destination: 'high-volume-data' },
            enabled: true,
            priority: 80
          }
        ]
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const routingTestCases = [
        {
          name: 'exact-match',
          data: createMockMarketData({ exchange: 'binance', symbol: 'ETHUSDT' })
        },
        {
          name: 'pattern-match',
          data: createMockMarketData({ exchange: 'huobi', symbol: 'BTCUSDT' })
        },
        {
          name: 'function-match',
          data: createMockMarketData({ 
            exchange: 'okx', 
            symbol: 'ADAUSDT',
            data: { volume: 15 }
          })
        },
        {
          name: 'no-match',
          data: createMockMarketData({ 
            exchange: 'unknown', 
            symbol: 'UNKNOWN',
            data: { volume: 1 }
          })
        }
      ];

      const routingResults: any[] = [];

      for (const testCase of routingTestCases) {
        latencyTracker.clear();

        // 重复测试每种路由情况
        const iterations = 20;
        for (let i = 0; i < iterations; i++) {
          const messageId = `${testCase.name}-${i}`;
          testCase.data.id = messageId;

          latencyTracker.startTracking(messageId);
          await pipeline.process(testCase.data, 'routing-latency-test');
          latencyTracker.endTracking(messageId);
        }

        const stats = latencyTracker.getStatistics();
        if (stats) {
          routingResults.push({
            type: testCase.name,
            stats
          });
        }
      }

      // 分析不同路由类型的延迟
      console.log('Routing Rule Evaluation Latency:');
      routingResults.forEach(result => {
        console.log(`  ${result.type}: Avg=${result.stats.avg.toFixed(2)}ms, P95=${result.stats.p95}ms`);
      });

      // 验证路由延迟在合理范围内
      routingResults.forEach(result => {
        expect(result.stats.avg).toBeLessThan(50); // 平均延迟小于50ms
        expect(result.stats.p95).toBeLessThan(100); // P95延迟小于100ms
      });

      await pipeline.destroy();
    });
  });

  describe('端到端延迟基准 (End-to-End Latency Benchmarks)', () => {
    test('should measure complete pipeline latency', async () => {
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'e2e-latency-test',
        name: 'End-to-End Latency Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'e2e',
        bufferSize: 20,
        batchTimeout: 500,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      memoryManager.start();
      performanceOptimizer.start();

      // 端到端延迟测试：包括所有处理阶段
      const e2eTestMessages = 100;
      const e2eLatencies: number[] = [];

      for (let i = 0; i < e2eTestMessages; i++) {
        const messageId = `e2e-${i}`;
        const testData = createMockMarketData({
          id: messageId,
          exchange: i % 2 === 0 ? 'binance' : 'huobi',
          symbol: 'BTCUSDT',
          sequence: i
        });

        // 记录开始时间
        const startTime = Date.now();
        
        await pipeline.process(testData, 'e2e-latency-test');
        
        // 记录处理完成时间
        const processingLatency = Date.now() - startTime;
        e2eLatencies.push(processingLatency);

        // 适当间隔
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // 等待缓冲处理完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 计算端到端延迟统计
      const e2eStats = this.calculateLatencyStatistics(e2eLatencies);

      console.log(`End-to-End Latency Test Results:
        Messages: ${e2eTestMessages}
        Average: ${e2eStats.avg.toFixed(2)}ms
        P50: ${e2eStats.p50}ms
        P95: ${e2eStats.p95}ms
        P99: ${e2eStats.p99}ms
        Min/Max: ${e2eStats.min}ms / ${e2eStats.max}ms
      `);

      // 验证端到端延迟要求
      expect(e2eStats.avg).toBeLessThan(100); // 平均延迟小于100ms
      expect(e2eStats.p95).toBeLessThan(500); // P95延迟小于500ms
      expect(e2eStats.p99).toBeLessThan(1000); // P99延迟小于1秒

      await pipeline.destroy();
    });
  });

  // 辅助方法
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateLatencyStatistics(latencies: number[]) {
    const sorted = latencies.slice().sort((a, b) => a - b);
    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sorted.reduce((sum, l) => sum + l, 0) / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
});