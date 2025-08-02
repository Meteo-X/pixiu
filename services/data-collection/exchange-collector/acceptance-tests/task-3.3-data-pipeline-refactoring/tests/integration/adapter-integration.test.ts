/**
 * 集成测试：适配器集成 (Adapter Integration)
 * 
 * 测试目标：
 * 1. 验证管道与适配器的完整集成
 * 2. 验证数据从适配器到管道的流向
 * 3. 验证多适配器并发处理
 * 4. 验证适配器错误处理
 * 5. 验证适配器生命周期管理
 */

import { globalCache } from '@pixiu/shared-core';
import { ExchangeDataPipeline, ExchangeDataPipelineFactory } from '../../src/pipeline/exchange-data-pipeline';
import {
  createMockMarketData,
  createMultiExchangeData,
  createHighFrequencyData
} from '../../fixtures/mock-market-data';
import {
  MockAdapterFactory,
  MockBinanceAdapter,
  MockHuobiAdapter,
  MockHighFrequencyAdapter,
  MockUnstableAdapter,
  AdapterTestHelper
} from '../../helpers/mock-adapters';
import {
  MockMonitor,
  MockErrorHandler,
  MockPubSubClient
} from '../../helpers/pipeline-test-utils';

describe('Task 3.3 Integration - 适配器集成 (Adapter Integration)', () => {
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

  describe('单个适配器集成 (Single Adapter Integration)', () => {
    test('should integrate with Binance adapter successfully', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'binance-integration-test',
        name: 'Binance Integration Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const binanceAdapter = MockAdapterFactory.createBinanceAdapter();
      await binanceAdapter.connect();

      // 监听管道处理的数据
      let processedDataCount = 0;
      pipeline.on('processed', () => {
        processedDataCount++;
      });

      // 从适配器发送数据到管道
      const testData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      await pipeline.process(testData, 'binance-adapter');

      expect(processedDataCount).toBe(1);

      // 验证数据已发布到PubSub
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBeGreaterThan(0);
      expect(publishedMessages[0].data.exchange).toBe('binance');
      expect(publishedMessages[0].data.symbol).toBe('BTCUSDT');

      await binanceAdapter.destroy();
    });

    test('should handle adapter data validation correctly', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'validation-test',
        name: 'Data Validation Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const adapter = MockAdapterFactory.createBinanceAdapter();
      await adapter.connect();

      // 发送无效数据
      const invalidData = createMockMarketData({
        exchange: '', // 无效交易所
        symbol: '',   // 无效交易对
        timestamp: Date.now() + 3600000 // 未来时间戳
      });

      await expect(pipeline.process(invalidData, 'binance-adapter'))
        .rejects.toThrow();

      // 验证错误被正确处理
      const handledErrors = mockErrorHandler.getHandledErrors();
      expect(handledErrors.length).toBeGreaterThan(0);

      await adapter.destroy();
    });

    test('should transform adapter data correctly', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'transformation-test',
        name: 'Data Transformation Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 发送混合大小写的数据
      const rawData = createMockMarketData({
        exchange: 'BINANCE',  // 大写
        symbol: 'btcusdt',    // 小写
        type: 'ticker'
      });

      await pipeline.process(rawData, 'binance-adapter');

      // 验证数据已被标准化
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBeGreaterThan(0);
      
      const transformedData = publishedMessages[0].data;
      expect(transformedData.exchange).toBe('binance'); // 应该被转换为小写
      expect(transformedData.symbol).toBe('BTCUSDT');   // 应该被转换为大写
    });
  });

  describe('多适配器集成 (Multi-Adapter Integration)', () => {
    test('should handle multiple adapters concurrently', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'multi-adapter-test',
        name: 'Multi-Adapter Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 创建多个适配器
      const binanceAdapter = MockAdapterFactory.createBinanceAdapter();
      const huobiAdapter = MockAdapterFactory.createHuobiAdapter();
      
      await Promise.all([
        binanceAdapter.connect(),
        huobiAdapter.connect()
      ]);

      const processedData: any[] = [];
      pipeline.on('processed', (data) => {
        processedData.push(data);
      });

      // 并发发送来自不同适配器的数据
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const binanceData = createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          sequence: i
        });
        promises.push(pipeline.process(binanceData, 'binance-adapter'));

        const huobiData = createMockMarketData({
          exchange: 'huobi',
          symbol: 'ETHUSDT',
          sequence: i
        });
        promises.push(pipeline.process(huobiData, 'huobi-adapter'));
      }

      await Promise.all(promises);

      expect(processedData.length).toBe(10);

      // 验证数据来自不同交易所
      const exchanges = new Set(processedData.map(d => d.marketData.exchange));
      expect(exchanges.has('binance')).toBe(true);
      expect(exchanges.has('huobi')).toBe(true);

      await Promise.all([
        binanceAdapter.destroy(),
        huobiAdapter.destroy()
      ]);
    });

    test('should isolate adapter errors correctly', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'error-isolation-test',
        name: 'Error Isolation Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const stableAdapter = MockAdapterFactory.createBinanceAdapter();
      const unstableAdapter = MockAdapterFactory.createUnstableAdapter();
      
      await Promise.all([
        stableAdapter.connect(),
        unstableAdapter.connect()
      ]);

      const processedData: any[] = [];
      const errorData: any[] = [];

      pipeline.on('processed', (data) => {
        processedData.push(data);
      });

      pipeline.on('processingError', (error, data) => {
        errorData.push({ error, data });
      });

      // 发送正常数据
      const stableData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT'
      });
      await pipeline.process(stableData, 'stable-adapter');

      // 发送可能失败的数据
      for (let i = 0; i < 10; i++) {
        const unstableData = createMockMarketData({
          exchange: 'mock-unstable',
          symbol: 'TESTUSDT'
        });
        
        try {
          await pipeline.process(unstableData, 'unstable-adapter');
        } catch (error) {
          // 忽略预期的错误
        }
      }

      // 再次发送正常数据，验证管道仍然正常工作
      const anotherStableData = createMockMarketData({
        exchange: 'binance',
        symbol: 'ETHUSDT'
      });
      await pipeline.process(anotherStableData, 'stable-adapter');

      // 验证正常数据被处理
      const binanceMessages = processedData.filter(d => 
        d.marketData.exchange === 'binance'
      );
      expect(binanceMessages.length).toBe(2);

      await Promise.all([
        stableAdapter.destroy(),
        unstableAdapter.destroy()
      ]);
    });

    test('should handle adapter disconnections gracefully', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'disconnection-test',
        name: 'Disconnection Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const adapter1 = MockAdapterFactory.createBinanceAdapter();
      const adapter2 = MockAdapterFactory.createHuobiAdapter();
      
      await Promise.all([adapter1.connect(), adapter2.connect()]);

      // 发送初始数据
      await pipeline.process(createMockMarketData({
        exchange: 'binance'
      }), 'adapter1');

      // 模拟adapter1断连
      await adapter1.disconnect();

      // adapter2应该仍然正常工作
      await pipeline.process(createMockMarketData({
        exchange: 'huobi'
      }), 'adapter2');

      // 验证管道仍然可以处理来自正常适配器的数据
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(2);

      await Promise.all([
        adapter1.destroy(),
        adapter2.destroy()
      ]);
    });
  });

  describe('高频数据集成 (High-Frequency Data Integration)', () => {
    test('should handle high-frequency data from adapters', async () => {
      pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'high-freq-test',
        name: 'High Frequency Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test',
        bufferSize: 100,
        batchTimeout: 1000,
        partitionBy: 'symbol'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const hftAdapter = MockAdapterFactory.createHighFrequencyAdapter();
      await hftAdapter.connect();

      // 设置高频率消息生成
      hftAdapter.setMessageRate(500); // 500 msg/s

      const processedMessages: any[] = [];
      pipeline.on('processed', (data) => {
        processedMessages.push(data);
      });

      // 开始高频数据生成
      hftAdapter.startHighFrequencyGeneration();

      // 生成高频数据并发送到管道
      const highFreqData = createHighFrequencyData(2000, 20); // 2秒，每20ms一条
      
      for (const data of highFreqData) {
        await pipeline.process(data, 'hft-adapter');
      }

      // 等待缓冲刷新
      await new Promise(resolve => setTimeout(resolve, 1500));

      hftAdapter.stopHighFrequencyGeneration();

      // 验证批量发布
      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      expect(batchMessages.length).toBeGreaterThan(0);

      const totalBatchedMessages = batchMessages.reduce(
        (sum, batch) => sum + batch.messages.length, 
        0
      );
      expect(totalBatchedMessages).toBeGreaterThan(0);

      await hftAdapter.destroy();
    });

    test('should maintain performance under high-frequency load', async () => {
      pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'performance-test',
        name: 'Performance Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test',
        bufferSize: 500,
        batchTimeout: 500,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const startTime = Date.now();
      const messageCount = 1000;
      const testData = createHighFrequencyData(5000, 5); // 5秒，每5ms一条

      let processedCount = 0;
      pipeline.on('processed', () => {
        processedCount++;
      });

      // 并发处理高频数据
      const batchSize = 50;
      for (let i = 0; i < testData.length; i += batchSize) {
        const batch = testData.slice(i, i + batchSize);
        const promises = batch.map(data => 
          pipeline.process(data, 'performance-test-adapter')
        );
        await Promise.all(promises);
      }

      const processingTime = Date.now() - startTime;
      const throughput = (testData.length / processingTime) * 1000;

      expect(throughput).toBeGreaterThan(100); // 至少100 msg/s
      expect(processingTime).toBeLessThan(30000); // 30秒内完成
    });
  });

  describe('适配器生命周期管理 (Adapter Lifecycle Management)', () => {
    test('should handle adapter startup and shutdown correctly', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'lifecycle-test',
        name: 'Lifecycle Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const adapter = MockAdapterFactory.createBinanceAdapter();
      
      // 测试适配器启动
      expect(adapter.getStatus()).toBe('disconnected');
      
      await adapter.connect();
      expect(adapter.getStatus()).toBe('connected');
      expect(adapter.isReady()).toBe(true);

      // 测试数据处理
      const testData = createMockMarketData({ exchange: 'binance' });
      await pipeline.process(testData, 'lifecycle-adapter');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);

      // 测试适配器关闭
      await adapter.disconnect();
      expect(adapter.getStatus()).toBe('disconnected');
      expect(adapter.isReady()).toBe(false);

      // 测试适配器销毁
      await adapter.destroy();
      expect(adapter.getStatus()).toBe('destroyed');
    });

    test('should handle adapter reconnection scenarios', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'reconnection-test',
        name: 'Reconnection Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const adapter = MockAdapterFactory.createUnstableAdapter();
      await adapter.connect();

      const connectionEvents: string[] = [];
      adapter.on('connected', () => connectionEvents.push('connected'));
      adapter.on('disconnected', () => connectionEvents.push('disconnected'));
      adapter.on('error', () => connectionEvents.push('error'));

      // 模拟不稳定连接
      adapter.setDisconnectProbability(0.3); // 30%断连概率
      adapter.setErrorRate(0.2); // 20%错误率

      // 发送数据并处理连接问题
      for (let i = 0; i < 20; i++) {
        try {
          adapter.sendUnstableData();
          
          if (adapter.isReady()) {
            const data = createMockMarketData({
              exchange: 'mock-unstable',
              sequence: i
            });
            await pipeline.process(data, 'unstable-adapter');
          }
        } catch (error) {
          // 忽略预期的错误
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 验证有连接事件发生
      expect(connectionEvents.length).toBeGreaterThan(0);

      await adapter.destroy();
    });

    test('should handle multiple adapter lifecycle events', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'multi-lifecycle-test',
        name: 'Multi Lifecycle Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const adapters = MockAdapterFactory.createMultipleAdapters(3);
      const adapterStates = new Map<string, string>();

      // 监听所有适配器的状态变化
      adapters.forEach(adapter => {
        adapterStates.set(adapter.getName(), 'created');
        
        adapter.on('connected', () => {
          adapterStates.set(adapter.getName(), 'connected');
        });
        
        adapter.on('disconnected', () => {
          adapterStates.set(adapter.getName(), 'disconnected');
        });
        
        adapter.on('destroyed', () => {
          adapterStates.set(adapter.getName(), 'destroyed');
        });
      });

      // 启动所有适配器
      await Promise.all(adapters.map(adapter => adapter.connect()));
      
      // 验证所有适配器已连接
      adapters.forEach(adapter => {
        expect(adapterStates.get(adapter.getName())).toBe('connected');
      });

      // 发送测试数据
      const testPromises = adapters.map(async (adapter, index) => {
        const data = createMockMarketData({
          exchange: adapter.getExchange(),
          sequence: index
        });
        return pipeline.process(data, adapter.getName());
      });

      await Promise.all(testPromises);

      // 验证数据处理
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(adapters.length);

      // 关闭所有适配器
      await Promise.all(adapters.map(adapter => adapter.destroy()));
      
      // 验证所有适配器已销毁
      adapters.forEach(adapter => {
        expect(adapterStates.get(adapter.getName())).toBe('destroyed');
      });
    });
  });

  describe('适配器错误处理集成 (Adapter Error Handling Integration)', () => {
    test('should handle adapter data errors gracefully', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'error-handling-test',
        name: 'Error Handling Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const adapter = MockAdapterFactory.createBinanceAdapter();
      await adapter.connect();

      let errorCount = 0;
      pipeline.on('processingError', () => {
        errorCount++;
      });

      // 发送正常数据
      const validData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT'
      });
      await pipeline.process(validData, 'error-test-adapter');

      // 发送无效数据
      const invalidData = createMockMarketData({
        exchange: '',
        symbol: '',
        data: null as any
      });

      await expect(pipeline.process(invalidData, 'error-test-adapter'))
        .rejects.toThrow();

      // 验证管道仍能处理后续正常数据
      const anotherValidData = createMockMarketData({
        exchange: 'binance',
        symbol: 'ETHUSDT'
      });
      await pipeline.process(anotherValidData, 'error-test-adapter');

      // 验证错误处理
      expect(errorCount).toBeGreaterThan(0);
      
      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(2); // 只有有效数据被发布

      await adapter.destroy();
    });

    test('should aggregate errors from multiple adapters', async () => {
      pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'multi-error-test',
        name: 'Multi Error Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const adapters = [
        MockAdapterFactory.createBinanceAdapter(),
        MockAdapterFactory.createUnstableAdapter(),
        MockAdapterFactory.createHuobiAdapter()
      ];

      await Promise.all(adapters.map(adapter => adapter.connect()));

      let totalErrors = 0;
      pipeline.on('processingError', () => {
        totalErrors++;
      });

      // 从每个适配器发送数据，包括一些错误数据
      for (const adapter of adapters) {
        // 正常数据
        const validData = createMockMarketData({
          exchange: adapter.getExchange()
        });
        await pipeline.process(validData, adapter.getName());

        // 错误数据
        if (adapter.getName().includes('unstable')) {
          try {
            const errorData = createMockMarketData({
              exchange: '',
              symbol: ''
            });
            await pipeline.process(errorData, adapter.getName());
          } catch (error) {
            // 预期的错误
          }
        }
      }

      // 验证错误被正确聚合
      const handledErrors = mockErrorHandler.getHandledErrors();
      expect(handledErrors.length).toBeGreaterThan(0);

      await Promise.all(adapters.map(adapter => adapter.destroy()));
    });
  });
});