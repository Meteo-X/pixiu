/**
 * 集成测试：Exchange数据管道 (Exchange Data Pipeline)
 * 
 * 测试目标：
 * 1. 验证Exchange数据管道的完整功能
 * 2. 验证与PubSub系统的集成
 * 3. 验证数据验证、转换、过滤流程
 * 4. 验证批处理和单条处理模式
 * 5. 验证管道工厂的不同配置
 */

import { globalCache } from '@pixiu/shared-core';
import { 
  ExchangeDataPipeline, 
  ExchangeDataPipelineFactory 
} from '../../src/pipeline/exchange-data-pipeline';
import {
  createMockMarketData,
  createMockMarketDataBatch,
  createMultiExchangeData,
  createInvalidMarketData,
  createPerformanceTestData
} from '../../fixtures/mock-market-data';
import {
  createDefaultRoutingRules,
  createMultiTargetRoutingRules
} from '../../fixtures/test-configurations';
import {
  MockMonitor,
  MockErrorHandler,
  MockPubSubClient
} from '../../helpers/pipeline-test-utils';

describe('Task 3.3 Integration - Exchange数据管道 (Exchange Data Pipeline)', () => {
  let pipeline: ExchangeDataPipeline;
  let mockMonitor: MockMonitor;
  let mockErrorHandler: MockErrorHandler;
  let mockPubSubClient: MockPubSubClient;

  beforeEach(() => {
    mockMonitor = new MockMonitor();
    mockErrorHandler = new MockErrorHandler();
    mockPubSubClient = new MockPubSubClient();
  });

  afterEach(async () => {
    if (pipeline) {
      await pipeline.destroy();
    }
    mockMonitor?.clearLogs();
    mockErrorHandler?.clearErrors();
    mockPubSubClient?.clearMessages();
  });

  afterAll(async () => {
    globalCache.destroy();
  });

  describe('标准管道集成 (Standard Pipeline Integration)', () => {
    test('should create and run standard pipeline successfully', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'standard-test',
        name: 'Standard Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test-topic'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      expect(pipeline.isHealthy()).toBe(true);

      const testData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      await pipeline.process(testData, 'test-source');

      // 验证数据处理和发布
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);
      
      const publishedData = publishedMessages[0];
      expect(publishedData.topic).toBe('test-topic-market-data-binance');
      expect(publishedData.data.exchange).toBe('binance');
      expect(publishedData.data.symbol).toBe('BTCUSDT');
    });

    test('should validate data according to business rules', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'validation-test',
        name: 'Validation Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'validation'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 测试有效数据
      const validData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker',
        timestamp: Date.now(),
        data: {
          price: 45000,
          volume: 1.5
        }
      });

      await pipeline.process(validData, 'validation-test');
      
      let publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);

      // 测试无效数据
      const invalidDataList = createInvalidMarketData();
      
      for (const invalidData of invalidDataList) {
        try {
          await pipeline.process(invalidData, 'validation-test');
        } catch (error) {
          // 预期的验证错误
        }
      }

      // 验证错误被正确处理
      const handledErrors = mockErrorHandler.getHandledErrors();
      expect(handledErrors.length).toBeGreaterThan(0);

      // 有效数据应该仍然只有一条
      publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);
    });

    test('should transform data correctly', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'transform-test',
        name: 'Transform Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'transform'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 发送需要转换的数据
      const rawData = createMockMarketData({
        exchange: 'BINANCE',    // 大写，应该转为小写
        symbol: 'btcusdt',      // 小写，应该转为大写
        type: 'ticker'
      });

      await pipeline.process(rawData, 'transform-test');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);

      const transformedData = publishedMessages[0].data;
      expect(transformedData.exchange).toBe('binance');  // 转换为小写
      expect(transformedData.symbol).toBe('BTCUSDT');    // 转换为大写
      expect(transformedData.receivedAt).toBeDefined();  // 添加接收时间
    });

    test('should filter data according to rules', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'filter-test',
        name: 'Filter Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'filter'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const testCases = [
        // 应该通过过滤器的数据
        createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: 'ticker',
          data: { price: 45000, volume: 1.5 }
        }),
        
        // 应该被过滤掉的测试数据
        createMockMarketData({
          exchange: 'test-exchange',
          symbol: 'TESTUSDT',
          type: 'ticker'
        }),
        
        // 应该被过滤掉的无效价格数据
        createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: 'ticker',
          data: { price: -100, volume: 1 }
        })
      ];

      for (const testData of testCases) {
        await pipeline.process(testData, 'filter-test');
      }

      // 只有第一条数据应该被发布
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);
      expect(publishedMessages[0].data.exchange).toBe('binance');
    });
  });

  describe('缓冲管道集成 (Buffered Pipeline Integration)', () => {
    test('should create and run buffered pipeline successfully', async () => {
      pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'buffered-test',
        name: 'Buffered Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'buffered',
        bufferSize: 10,
        batchTimeout: 1000,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 发送多条数据
      const testData = createMockMarketDataBatch(15, {
        exchange: 'binance',
        symbol: 'BTCUSDT'
      });

      for (const data of testData) {
        await pipeline.process(data, 'buffered-test');
      }

      // 等待缓冲区刷新
      await new Promise(resolve => setTimeout(resolve, 1200));

      // 验证批量发布
      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      expect(batchMessages.length).toBeGreaterThan(0);

      const totalPublished = batchMessages.reduce(
        (sum, batch) => sum + batch.messages.length,
        0
      );
      expect(totalPublished).toBe(15);
    });

    test('should handle multiple symbols in buffered mode', async () => {
      pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'multi-symbol-buffered',
        name: 'Multi Symbol Buffered Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'multi-symbol',
        bufferSize: 5,
        batchTimeout: 500,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      
      // 为每个交易对发送数据
      for (const symbol of symbols) {
        for (let i = 0; i < 3; i++) {
          const data = createMockMarketData({
            exchange: 'binance',
            symbol,
            sequence: i
          });
          await pipeline.process(data, 'multi-symbol-test');
        }
      }

      // 等待缓冲区刷新
      await new Promise(resolve => setTimeout(resolve, 700));

      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      expect(batchMessages.length).toBeGreaterThan(0);

      // 验证按交易对分组
      const publishedSymbols = new Set();
      batchMessages.forEach(batch => {
        batch.messages.forEach((msg: any) => {
          publishedSymbols.add(msg.data.symbol);
        });
      });

      expect(publishedSymbols.size).toBe(3);
      symbols.forEach(symbol => {
        expect(publishedSymbols.has(symbol)).toBe(true);
      });
    });

    test('should handle buffer overflow correctly', async () => {
      pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'overflow-test',
        name: 'Overflow Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'overflow',
        bufferSize: 5,    // 小缓冲区
        batchTimeout: 5000, // 长超时
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 发送超过缓冲区大小的数据
      const testData = createMockMarketDataBatch(12, {
        exchange: 'binance',
        symbol: 'BTCUSDT'
      });

      for (const data of testData) {
        await pipeline.process(data, 'overflow-test');
      }

      // 应该触发基于大小的刷新
      await new Promise(resolve => setTimeout(resolve, 200));

      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      expect(batchMessages.length).toBeGreaterThan(1); // 多次刷新

      const totalPublished = batchMessages.reduce(
        (sum, batch) => sum + batch.messages.length,
        0
      );
      expect(totalPublished).toBe(12);
    });
  });

  describe('路由管道集成 (Routing Pipeline Integration)', () => {
    test('should create and run routing pipeline successfully', async () => {
      const routingRules = createDefaultRoutingRules();
      
      pipeline = ExchangeDataPipelineFactory.createRoutingPipeline({
        id: 'routing-test',
        name: 'Routing Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'routing',
        routingRules
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 发送匹配不同路由规则的数据
      const testCases = [
        {
          data: createMockMarketData({
            exchange: 'binance',
            symbol: 'BTCUSDT',
            type: 'ticker'
          }),
          expectedTopic: 'routing-binance-ticker-data'
        },
        {
          data: createMockMarketData({
            exchange: 'huobi',
            symbol: 'BTCUSDT',
            type: 'ticker'
          }),
          expectedTopic: 'routing-btc-market-data'
        },
        {
          data: createMockMarketData({
            exchange: 'binance',
            symbol: 'ETHUSDT',
            type: 'ticker',
            data: { volume: 15 } // 高交易量
          }),
          expectedTopic: 'routing-high-volume-data'
        }
      ];

      for (const testCase of testCases) {
        await pipeline.process(testCase.data, 'routing-test');
      }

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(3);

      // 验证路由到正确的主题
      testCases.forEach((testCase, index) => {
        expect(publishedMessages[index].topic).toBe(testCase.expectedTopic);
      });
    });

    test('should handle multi-target routing', async () => {
      const multiTargetRules = createMultiTargetRoutingRules();
      
      pipeline = ExchangeDataPipelineFactory.createRoutingPipeline({
        id: 'multi-target-test',
        name: 'Multi Target Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'multi',
        routingRules: multiTargetRules
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const btcData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      await pipeline.process(btcData, 'multi-target-test');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      
      // 应该发布到多个目标
      expect(publishedMessages.length).toBeGreaterThan(1);
      
      const topics = publishedMessages.map(msg => msg.topic);
      expect(topics).toContain('multi-btc-primary');
      expect(topics).toContain('multi-btc-analytics');
      expect(topics).toContain('multi-btc-alerts');
    });

    test('should handle routing fallback', async () => {
      pipeline = ExchangeDataPipelineFactory.createRoutingPipeline({
        id: 'fallback-test',
        name: 'Fallback Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'fallback',
        routingRules: [] // 没有规则
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const unmatchedData = createMockMarketData({
        exchange: 'unknown-exchange',
        symbol: 'UNKNOWN',
        type: 'unknown'
      });

      await pipeline.process(unmatchedData, 'fallback-test');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);
      
      // 应该使用默认主题
      expect(publishedMessages[0].topic).toBe('fallback-market-data-unknown-exchange');
    });
  });

  describe('PubSub集成 (PubSub Integration)', () => {
    test('should publish messages with correct attributes', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'pubsub-test',
        name: 'PubSub Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'pubsub'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const testData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker',
        timestamp: 1640995200000 // 固定时间戳
      });

      await pipeline.process(testData, 'pubsub-test-source');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);

      const message = publishedMessages[0];
      expect(message.options.attributes).toEqual({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker',
        timestamp: '1640995200000',
        source: 'pubsub-test-source',
        processedAt: expect.any(String)
      });
    });

    test('should handle PubSub publish errors gracefully', async () => {
      // 创建会失败的PubSub客户端
      const failingPubSubClient = new MockPubSubClient();
      failingPubSubClient.publish = async () => {
        throw new Error('PubSub publish failed');
      };

      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'pubsub-error-test',
        name: 'PubSub Error Test Pipeline',
        pubsubClient: failingPubSubClient,
        topicPrefix: 'error'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const testData = createMockMarketData();

      await expect(pipeline.process(testData, 'error-test'))
        .rejects.toThrow('PubSub publish failed');

      // 验证错误被正确处理
      const handledErrors = mockErrorHandler.getHandledErrors();
      expect(handledErrors.length).toBeGreaterThan(0);
    });

    test('should handle batch publishing correctly', async () => {
      pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'batch-pubsub-test',
        name: 'Batch PubSub Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'batch',
        bufferSize: 5,
        batchTimeout: 500,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 发送多交易所数据
      const multiExchangeData = createMultiExchangeData();
      
      for (const data of multiExchangeData) {
        await pipeline.process(data, 'batch-test');
      }

      // 等待批处理
      await new Promise(resolve => setTimeout(resolve, 700));

      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      expect(batchMessages.length).toBeGreaterThan(0);

      // 验证按交易所分组
      const exchangeTopics = new Set();
      batchMessages.forEach(batch => {
        exchangeTopics.add(batch.topic);
      });

      expect(exchangeTopics.size).toBeGreaterThan(1);
    });
  });

  describe('性能和可扩展性 (Performance and Scalability)', () => {
    test('should handle high volume data processing', async () => {
      pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'performance-test',
        name: 'Performance Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'perf',
        bufferSize: 100,
        batchTimeout: 1000,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const startTime = Date.now();
      const messageCount = 1000;
      const testData = createPerformanceTestData(messageCount);

      // 批量处理数据
      const batchSize = 50;
      for (let i = 0; i < testData.length; i += batchSize) {
        const batch = testData.slice(i, i + batchSize);
        const promises = batch.map(data => 
          pipeline.process(data, 'performance-test')
        );
        await Promise.all(promises);
      }

      const processingTime = Date.now() - startTime;
      const throughput = (messageCount / processingTime) * 1000;

      expect(throughput).toBeGreaterThan(100); // 至少100 msg/s
      expect(processingTime).toBeLessThan(30000); // 30秒内完成

      // 等待所有数据被处理和发布
      await new Promise(resolve => setTimeout(resolve, 2000));

      const metrics = pipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(messageCount);
    });

    test('should maintain stability under continuous load', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'stability-test',
        name: 'Stability Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'stability'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const cycles = 10;
      const messagesPerCycle = 50;
      let totalProcessed = 0;

      for (let cycle = 0; cycle < cycles; cycle++) {
        const cycleData = createMockMarketDataBatch(messagesPerCycle, {
          exchange: 'binance',
          symbol: `CYCLE${cycle}USDT`
        });

        for (const data of cycleData) {
          await pipeline.process(data, `stability-test-cycle-${cycle}`);
          totalProcessed++;
        }

        // 检查管道健康状态
        expect(pipeline.isHealthy()).toBe(true);

        // 短暂休息
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const metrics = pipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(totalProcessed);
      expect(metrics.totalErrors).toBe(0);
    });

    test('should handle concurrent processing efficiently', async () => {
      pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'concurrent-test',
        name: 'Concurrent Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'concurrent',
        bufferSize: 50,
        batchTimeout: 1000,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const concurrentPromises: Promise<void>[] = [];
      const exchanges = ['binance', 'huobi', 'okx', 'coinbase'];
      const messagesPerExchange = 25;

      // 并发处理多个交易所的数据
      exchanges.forEach(exchange => {
        const promise = (async () => {
          for (let i = 0; i < messagesPerExchange; i++) {
            const data = createMockMarketData({
              exchange,
              symbol: 'BTCUSDT',
              sequence: i
            });
            await pipeline.process(data, `concurrent-${exchange}`);
          }
        })();
        
        concurrentPromises.push(promise);
      });

      await Promise.all(concurrentPromises);

      // 等待缓冲区刷新
      await new Promise(resolve => setTimeout(resolve, 1500));

      const metrics = pipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(exchanges.length * messagesPerExchange);

      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      const totalBatched = batchMessages.reduce(
        (sum, batch) => sum + batch.messages.length,
        0
      );
      expect(totalBatched).toBe(exchanges.length * messagesPerExchange);
    });
  });
});