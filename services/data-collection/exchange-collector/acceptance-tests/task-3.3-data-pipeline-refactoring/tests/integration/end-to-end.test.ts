/**
 * 端到端集成测试：完整数据管道流程 (End-to-End Pipeline Flow)
 * 
 * 测试目标：
 * 1. 验证从适配器到PubSub的完整数据流
 * 2. 验证多个管道组件的协同工作
 * 3. 验证实际应用场景下的系统行为
 * 4. 验证错误恢复和系统稳定性
 * 5. 验证性能和资源使用
 */

import { globalCache } from '@pixiu/shared-core';
import { ExchangeDataPipelineFactory } from '../../src/pipeline/exchange-data-pipeline';
import { MemoryManagerFactory } from '../../src/pipeline/performance/memory-manager';
import { PerformanceOptimizerFactory } from '../../src/pipeline/performance/performance-optimizer';
import {
  createMockMarketData,
  createHighFrequencyData,
  createMultiExchangeData,
  MockDataStats
} from '../../fixtures/mock-market-data';
import {
  createDefaultRoutingRules,
  TestConfigFactory
} from '../../fixtures/test-configurations';
import {
  PERFORMANCE_TEST_SCENARIOS,
  PerformanceTestUtils
} from '../../fixtures/performance-benchmarks';
import {
  MockAdapterFactory,
  AdapterTestHelper
} from '../../helpers/mock-adapters';
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

describe('Task 3.3 Integration - 端到端管道流程 (End-to-End Pipeline Flow)', () => {
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

  describe('完整数据流验证 (Complete Data Flow Validation)', () => {
    test('should process complete flow from adapter to PubSub', async () => {
      // 创建完整的管道配置
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'e2e-complete-flow',
        name: 'End-to-End Complete Flow Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'e2e'
      }, mockMonitor, mockErrorHandler);

      // 创建模拟适配器
      const adapters = [
        MockAdapterFactory.createBinanceAdapter(),
        MockAdapterFactory.createHuobiAdapter()
      ];

      await pipeline.initialize();
      await pipeline.start();

      await Promise.all(adapters.map(adapter => adapter.connect()));

      // 模拟真实的数据流
      const testScenarios = [
        {
          adapter: adapters[0],
          data: createMockMarketData({
            exchange: 'binance',
            symbol: 'BTCUSDT',
            type: 'ticker',
            data: { price: 45000, volume: 1.5 }
          })
        },
        {
          adapter: adapters[1],
          data: createMockMarketData({
            exchange: 'huobi',
            symbol: 'ETHUSDT',
            type: 'orderbook',
            data: { 
              bids: [[2800, 10], [2799, 5]], 
              asks: [[2801, 8], [2802, 12]] 
            }
          })
        }
      ];

      const processedResults: any[] = [];
      pipeline.on('processed', (data, context) => {
        processedResults.push({ data, context });
      });

      // 处理数据
      for (const scenario of testScenarios) {
        await pipeline.process(scenario.data, scenario.adapter.getName());
      }

      // 验证处理结果
      expect(processedResults.length).toBe(2);

      // 验证PubSub发布
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(2);

      // 验证数据转换和属性
      const binanceMessage = publishedMessages.find(msg => 
        msg.data.exchange === 'binance'
      );
      expect(binanceMessage).toBeDefined();
      expect(binanceMessage!.topic).toBe('e2e-market-data-binance');
      expect(binanceMessage!.options.attributes.exchange).toBe('binance');
      expect(binanceMessage!.options.attributes.symbol).toBe('BTCUSDT');

      const huobiMessage = publishedMessages.find(msg => 
        msg.data.exchange === 'huobi'
      );
      expect(huobiMessage).toBeDefined();
      expect(huobiMessage!.topic).toBe('e2e-market-data-huobi');

      // 清理
      await Promise.all(adapters.map(adapter => adapter.destroy()));
      await pipeline.destroy();
    });

    test('should handle complex routing and buffering flow', async () => {
      // 创建带路由和缓冲的复杂管道
      const routingPipeline = ExchangeDataPipelineFactory.createRoutingPipeline({
        id: 'e2e-complex-flow',
        name: 'End-to-End Complex Flow Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'complex',
        routingRules: createDefaultRoutingRules()
      }, mockMonitor, mockErrorHandler);

      const bufferedPipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'e2e-buffered-flow',
        name: 'End-to-End Buffered Flow Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'buffered',
        bufferSize: 5,
        batchTimeout: 1000,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await Promise.all([
        routingPipeline.initialize(),
        bufferedPipeline.initialize()
      ]);

      await Promise.all([
        routingPipeline.start(),
        bufferedPipeline.start()
      ]);

      // 创建多种数据类型
      const testData = [
        // 触发Binance路由的数据
        createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: 'ticker'
        }),
        // 触发BTC模式匹配的数据
        createMockMarketData({
          exchange: 'huobi',
          symbol: 'BTCUSDT',
          type: 'trade'
        }),
        // 触发高交易量路由的数据
        createMockMarketData({
          exchange: 'okx',
          symbol: 'ETHUSDT',
          type: 'ticker',
          data: { volume: 15 }
        })
      ];

      // 路由管道处理
      for (const data of testData) {
        await routingPipeline.process(data, 'routing-test');
      }

      // 缓冲管道处理
      const batchData = Array.from({ length: 7 }, (_, i) => 
        createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i
        })
      );

      for (const data of batchData) {
        await bufferedPipeline.process(data, 'buffering-test');
      }

      // 等待缓冲刷新
      await new Promise(resolve => setTimeout(resolve, 1200));

      // 验证路由结果
      const routingMessages = mockPubSubClient.getMessagesByTopic('complex-binance-ticker-data');
      expect(routingMessages.length).toBeGreaterThan(0);

      // 验证批处理结果
      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      expect(batchMessages.length).toBeGreaterThan(0);

      await Promise.all([
        routingPipeline.destroy(),
        bufferedPipeline.destroy()
      ]);
    });
  });

  describe('实际场景模拟 (Real-World Scenario Simulation)', () => {
    test('should simulate cryptocurrency exchange data flow', async () => {
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'crypto-exchange-sim',
        name: 'Cryptocurrency Exchange Simulation',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'crypto',
        bufferSize: 20,
        batchTimeout: 500,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 启动性能监控
      memoryManager.start();
      performanceOptimizer.start();

      const performanceMonitor = new PerformanceMonitor({
        monitoringInterval: 200
      });
      performanceMonitor.start();

      // 模拟真实交易所数据
      const exchanges = ['binance', 'huobi', 'okx', 'coinbase'];
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT'];
      const dataTypes = ['ticker', 'orderbook', 'trade'];

      const simulationDuration = 5000; // 5秒
      const messageInterval = 50; // 每50ms一条消息
      const messagesCount = simulationDuration / messageInterval;

      const startTime = Date.now();
      let processedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < messagesCount; i++) {
        const exchange = exchanges[i % exchanges.length];
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const dataType = dataTypes[Math.floor(Math.random() * dataTypes.length)];

        const marketData = createMockMarketData({
          exchange,
          symbol,
          type: dataType,
          sequence: i,
          data: {
            price: 1000 + Math.random() * 50000,
            volume: Math.random() * 10,
            timestamp: Date.now()
          }
        });

        try {
          await pipeline.process(marketData, `crypto-sim-${exchange}`);
          processedCount++;
          
          // 记录性能指标
          performanceMonitor.recordMessage(JSON.stringify(marketData).length);
          performanceMonitor.recordLatency(Math.random() * 50);
        } catch (error) {
          errorCount++;
        }

        // 模拟实时间隔
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      const processingTime = Date.now() - startTime;
      const throughput = (processedCount / processingTime) * 1000;

      // 等待所有缓冲区刷新
      await new Promise(resolve => setTimeout(resolve, 1000));

      performanceMonitor.stop();

      // 验证性能指标
      expect(throughput).toBeGreaterThan(50); // 至少50 msg/s
      expect(errorCount).toBe(0);
      expect(processedCount).toBe(messagesCount);

      // 验证批量发布
      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      expect(batchMessages.length).toBeGreaterThan(0);

      const totalBatched = batchMessages.reduce(
        (sum, batch) => sum + batch.messages.length,
        0
      );
      expect(totalBatched).toBe(messagesCount);

      // 验证按交易所分组
      const exchangeGroups = new Set();
      batchMessages.forEach(batch => {
        if (batch.messages.length > 0) {
          const exchange = (batch.messages[0] as any).data.exchange;
          exchangeGroups.add(exchange);
        }
      });
      expect(exchangeGroups.size).toBe(exchanges.length);

      await pipeline.destroy();
    });

    test('should handle market volatility scenario', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'market-volatility-sim',
        name: 'Market Volatility Simulation',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'volatility'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 模拟市场波动：价格剧烈变化
      const basePrice = 45000;
      const volatilityEvents = [
        // 正常交易期
        { duration: 1000, volatility: 0.01, frequency: 100 },
        // 高波动期
        { duration: 500, volatility: 0.05, frequency: 50 },
        // 极端波动期
        { duration: 300, volatility: 0.1, frequency: 20 },
        // 恢复期
        { duration: 1000, volatility: 0.02, frequency: 80 }
      ];

      let messageSequence = 0;
      const allMessages: any[] = [];

      for (const event of volatilityEvents) {
        const eventStartTime = Date.now();
        
        while (Date.now() - eventStartTime < event.duration) {
          const priceChange = (Math.random() - 0.5) * event.volatility * basePrice;
          const currentPrice = basePrice + priceChange;
          
          const marketData = createMockMarketData({
            exchange: 'binance',
            symbol: 'BTCUSDT',
            type: 'ticker',
            sequence: messageSequence++,
            data: {
              price: currentPrice,
              volume: Math.random() * 5,
              change: priceChange,
              changePercent: (priceChange / basePrice) * 100
            }
          });

          await pipeline.process(marketData, 'volatility-sim');
          allMessages.push(marketData);

          await new Promise(resolve => setTimeout(resolve, event.frequency));
        }
      }

      // 验证所有消息都被处理
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(allMessages.length);

      // 验证价格数据的连续性
      const prices = publishedMessages.map(msg => msg.data.data.price);
      expect(prices.every(price => price > 0)).toBe(true);

      // 验证高波动期的数据
      const highVolatilityMessages = publishedMessages.filter(msg => 
        Math.abs(msg.data.data.changePercent) > 3 // 3%以上的变化
      );
      expect(highVolatilityMessages.length).toBeGreaterThan(0);

      await pipeline.destroy();
    });
  });

  describe('错误恢复和稳定性 (Error Recovery and Stability)', () => {
    test('should recover from system failures gracefully', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'failure-recovery',
        name: 'Failure Recovery Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'recovery'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const unstableAdapter = MockAdapterFactory.createUnstableAdapter();
      await unstableAdapter.connect();

      unstableAdapter.setErrorRate(0.3); // 30%错误率
      unstableAdapter.setDisconnectProbability(0.1); // 10%断连概率

      let successCount = 0;
      let errorCount = 0;
      const totalMessages = 50;

      pipeline.on('processed', () => {
        successCount++;
      });

      pipeline.on('processingError', () => {
        errorCount++;
      });

      // 发送数据并模拟各种故障
      for (let i = 0; i < totalMessages; i++) {
        const data = createMockMarketData({
          exchange: 'mock-unstable',
          symbol: 'TESTUSDT',
          sequence: i
        });

        try {
          // 模拟适配器不稳定行为
          if (Math.random() < 0.1) {
            unstableAdapter.simulateConnectionError();
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          if (Math.random() < 0.05) {
            unstableAdapter.simulateDataError();
          }

          await pipeline.process(data, 'unstable-adapter');
        } catch (error) {
          // 预期的错误
        }

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 验证系统恢复能力
      expect(successCount + errorCount).toBeGreaterThan(0);
      expect(pipeline.isHealthy()).toBe(true);

      // 验证错误处理
      const handledErrors = mockErrorHandler.getHandledErrors();
      expect(handledErrors.length).toBeGreaterThan(0);

      await unstableAdapter.destroy();
      await pipeline.destroy();
    });

    test('should maintain stability under memory pressure', async () => {
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'memory-pressure',
        name: 'Memory Pressure Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'memory',
        bufferSize: 100,
        batchTimeout: 2000,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const memoryMonitor = new MemoryMonitor();
      memoryManager.start();

      memoryMonitor.snapshot();

      // 生成内存密集型数据
      const largeDataSize = 1024; // 1KB per message
      const messageCount = 500;

      for (let i = 0; i < messageCount; i++) {
        const largeData = createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i,
          data: {
            price: 45000,
            volume: 1,
            largeField: 'x'.repeat(largeDataSize) // 大数据字段
          }
        });

        await pipeline.process(largeData, 'memory-pressure-test');

        // 定期检查内存
        if (i % 50 === 0) {
          memoryMonitor.snapshot();
        }
      }

      // 等待缓冲区处理
      await new Promise(resolve => setTimeout(resolve, 3000));

      memoryMonitor.snapshot();

      // 验证内存使用
      const memoryStats = memoryMonitor.getMemoryStats();
      expect(memoryStats).toBeDefined();

      if (memoryStats) {
        expect(memoryStats.current.heapUsed).toBeGreaterThan(0);
        expect(memoryStats.growthRate).toBeLessThan(2.0); // 内存增长不超过200%
      }

      // 验证系统稳定性
      expect(pipeline.isHealthy()).toBe(true);

      const metrics = pipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(messageCount);

      await pipeline.destroy();
    });
  });

  describe('性能基准验证 (Performance Benchmark Validation)', () => {
    test('should meet performance benchmarks under load', async () => {
      const scenario = PERFORMANCE_TEST_SCENARIOS.HIGH_THROUGHPUT;
      
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'benchmark-test',
        name: 'Performance Benchmark Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'benchmark',
        bufferSize: 200,
        batchTimeout: 1000,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const performanceMeasurer = new PerformanceMeasurer();
      const latencies: number[] = [];

      // 预热
      const warmupData = createHighFrequencyData(scenario.warmupTime, 100);
      for (const data of warmupData) {
        await pipeline.process(data, 'warmup');
      }

      // 正式测试
      performanceMeasurer.start('benchmark-test');
      const testStartTime = Date.now();

      const testData = createHighFrequencyData(scenario.duration, 
        scenario.duration / scenario.messageCount);

      for (let i = 0; i < testData.length; i++) {
        const messageStart = Date.now();
        await pipeline.process(testData[i], 'benchmark-test');
        const messageLatency = Date.now() - messageStart;
        latencies.push(messageLatency);
      }

      const totalTime = performanceMeasurer.end('benchmark-test');
      const actualDuration = Date.now() - testStartTime;

      // 等待所有数据处理完成
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 生成性能报告
      const results = {
        latencies,
        messageCount: testData.length,
        duration: actualDuration,
        errorCount: 0,
        memoryStats: {
          heapUsed: process.memoryUsage().heapUsed
        }
      };

      const report = PerformanceTestUtils.generatePerformanceReport(scenario, results);

      console.log(`Performance Test Results:
        Scenario: ${report.scenario}
        Passed: ${report.passed}
        Summary: ${report.summary}
        
        Latency Details:
        - P50: ${report.details.latency.results.p50.value}ms (Passed: ${report.details.latency.results.p50.passed})
        - P95: ${report.details.latency.results.p95.value}ms (Passed: ${report.details.latency.results.p95.passed})
        - P99: ${report.details.latency.results.p99.value}ms (Passed: ${report.details.latency.results.p99.passed})
        
        Throughput: ${report.details.throughput.messagesPerSecond.toFixed(2)} msg/s (Passed: ${report.details.throughput.passed})
      `);

      // 验证基本性能要求
      expect(report.details.throughput.messagesPerSecond).toBeGreaterThan(100);
      expect(report.details.latency.results.p95.value).toBeLessThan(1000);

      await pipeline.destroy();
    });
  });
});