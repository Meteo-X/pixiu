/**
 * 输出通道集成测试
 * 验证PubSub、WebSocket、Cache和Batch通道的功能
 */

import { 
  PubSubOutputChannel, 
  WebSocketOutputChannel, 
  CacheOutputChannel,
  BatchOutputChannel 
} from '../../../services/data-collection/exchange-collector/src/dataflow/channels/output-channels';
import { DataFlowTestManager, TestDataGenerator, MockOutputChannel } from '@helpers/dataflow-test-utils';
import { TestPerformanceMonitor, PerformanceBenchmark } from '@helpers/test-performance-monitor';
import { mockServiceManager } from '@mocks/mock-services';
import { 
  BASIC_TRADE_DATA, 
  BASIC_TICKER_DATA, 
  generateHighFrequencyTrades,
  generateStressTestData 
} from '@fixtures/test-data-sets';
import { testUtils } from '../../setup';

// Mock共享核心和适配器基础模块
jest.mock('@pixiu/shared-core', () => ({
  PubSubClientImpl: jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockResolvedValue('mock-message-id'),
    close: jest.fn().mockResolvedValue(undefined)
  })),
  BaseMonitor: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    registerMetric: jest.fn(),
    updateMetric: jest.fn()
  }))
}));

jest.mock('../../../services/data-collection/exchange-collector/src/websocket', () => ({
  CollectorWebSocketServer: jest.fn().mockImplementation(() => ({
    broadcast: jest.fn(),
    getConnectionCount: jest.fn().mockReturnValue(5),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('../../../services/data-collection/exchange-collector/src/cache', () => ({
  DataStreamCache: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn()
  }))
}));

describe('输出通道集成测试', () => {
  let testManager: DataFlowTestManager;
  let dataGenerator: TestDataGenerator;
  let performanceMonitor: TestPerformanceMonitor;
  let benchmark: PerformanceBenchmark;

  beforeAll(async () => {
    // 启动Mock服务
    await mockServiceManager.startAll({
      webSocket: { port: 18080 },
      redis: true,
      pubSub: true
    });
  });

  afterAll(async () => {
    await mockServiceManager.stopAll();
  });

  beforeEach(async () => {
    testManager = new DataFlowTestManager();
    dataGenerator = TestDataGenerator.getInstance();
    performanceMonitor = new TestPerformanceMonitor();
    benchmark = new PerformanceBenchmark();
    
    dataGenerator.reset();
  });

  afterEach(async () => {
    await testManager.cleanup();
    performanceMonitor.reset();
    benchmark.clear();
  });

  describe('PubSub输出通道测试', () => {
    it('应该成功发布消息到PubSub主题', async () => {
      const mockPubSubClient = {
        publish: jest.fn().mockResolvedValue('test-message-id')
      };
      
      const mockMonitor = {
        log: jest.fn()
      };

      const pubsubChannel = new PubSubOutputChannel(
        'test-pubsub',
        mockPubSubClient as any,
        mockMonitor as any,
        {
          name: 'Test PubSub Channel',
          topicPrefix: 'test-market-data'
        }
      );

      const testData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      
      await pubsubChannel.output(testData, { routedBy: 'test' });

      // 验证PubSub发布调用
      expect(mockPubSubClient.publish).toHaveBeenCalledTimes(1);
      
      const [topicName, publishedData, options] = mockPubSubClient.publish.mock.calls[0];
      expect(topicName).toBe('test-market-data-trade-binance');
      expect(publishedData).toEqual(testData);
      expect(options.attributes).toEqual(expect.objectContaining({
        exchange: testData.exchange,
        symbol: testData.symbol,
        type: testData.type,
        source: 'exchange-collector',
        channelId: 'test-pubsub',
        channelType: 'pubsub',
        routedBy: 'test'
      }));

      // 验证通道状态
      const status = pubsubChannel.getStatus();
      expect(status.messagesSent).toBe(1);
      expect(status.errors).toBe(0);
      expect(status.health).toBe('healthy');
    });

    it('应该正确构建不同数据类型的主题名称', async () => {
      const mockPubSubClient = {
        publish: jest.fn().mockResolvedValue('test-message-id')
      };
      
      const mockMonitor = { log: jest.fn() };

      const pubsubChannel = new PubSubOutputChannel(
        'topic-test',
        mockPubSubClient as any,
        mockMonitor as any
      );

      const testCases = [
        { type: 'trade', expectedTopic: 'market-data-trade-binance' },
        { type: 'ticker', expectedTopic: 'market-data-ticker-binance' },
        { type: 'depth', expectedTopic: 'market-data-depth-binance' },
        { type: 'kline_1m', expectedTopic: 'market-data-kline-binance' },
        { type: 'kline_5m', expectedTopic: 'market-data-kline-binance' }
      ];

      for (const { type, expectedTopic } of testCases) {
        const testData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          type
        });
        
        await pubsubChannel.output(testData);
        
        const lastCall = mockPubSubClient.publish.mock.calls[mockPubSubClient.publish.mock.calls.length - 1];
        expect(lastCall[0]).toBe(expectedTopic);
      }
    });

    it('应该处理发布失败并更新错误统计', async () => {
      const mockPubSubClient = {
        publish: jest.fn().mockRejectedValue(new Error('PubSub publish failed'))
      };
      
      const mockMonitor = { log: jest.fn() };

      const pubsubChannel = new PubSubOutputChannel(
        'error-test',
        mockPubSubClient as any,
        mockMonitor as any
      );

      const testData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      
      await expect(pubsubChannel.output(testData)).rejects.toThrow('PubSub publish failed');

      const status = pubsubChannel.getStatus();
      expect(status.messagesSent).toBe(0);
      expect(status.errors).toBe(1);
      expect(status.health).toBe('unhealthy');
    });
  });

  describe('WebSocket输出通道测试', () => {
    it('应该成功广播消息到WebSocket客户端', async () => {
      const mockWebSocketServer = {
        broadcast: jest.fn(),
        getConnectionCount: jest.fn().mockReturnValue(3)
      };
      
      const mockMonitor = { log: jest.fn() };

      const websocketChannel = new WebSocketOutputChannel(
        'test-websocket',
        mockWebSocketServer as any,
        mockMonitor as any,
        { name: 'Test WebSocket Channel' }
      );

      const testData = dataGenerator.generateMarketData(BASIC_TICKER_DATA);
      const metadata = { source: 'test-router' };
      
      await websocketChannel.output(testData, metadata);

      // 验证WebSocket广播调用
      expect(mockWebSocketServer.broadcast).toHaveBeenCalledTimes(1);
      
      const broadcastMessage = mockWebSocketServer.broadcast.mock.calls[0][0];
      expect(broadcastMessage.type).toBe(testData.type);
      expect(broadcastMessage.payload).toEqual(expect.objectContaining({
        type: testData.type,
        exchange: testData.exchange,
        symbol: testData.symbol,
        data: testData.data,
        timestamp: testData.timestamp,
        metadata: expect.objectContaining({
          ...testData.metadata,
          ...metadata,
          channelId: 'test-websocket',
          channelType: 'websocket'
        })
      }));

      // 验证通道状态
      const status = websocketChannel.getStatus();
      expect(status.messagesSent).toBe(1);
      expect(status.errors).toBe(0);
      expect(status.health).toBe('healthy');
    });

    it('应该处理广播失败', async () => {
      const mockWebSocketServer = {
        broadcast: jest.fn().mockImplementation(() => {
          throw new Error('WebSocket broadcast failed');
        }),
        getConnectionCount: jest.fn().mockReturnValue(0)
      };
      
      const mockMonitor = { log: jest.fn() };

      const websocketChannel = new WebSocketOutputChannel(
        'error-websocket',
        mockWebSocketServer as any,
        mockMonitor as any
      );

      const testData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      
      await expect(websocketChannel.output(testData)).rejects.toThrow('WebSocket broadcast failed');

      const status = websocketChannel.getStatus();
      expect(status.messagesSent).toBe(0);
      expect(status.errors).toBe(1);
      expect(status.health).toBe('unhealthy');
    });
  });

  describe('Cache输出通道测试', () => {
    it('应该成功缓存数据', async () => {
      const mockDataStreamCache = {
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn()
      };
      
      const mockMonitor = { log: jest.fn() };

      const cacheChannel = new CacheOutputChannel(
        'test-cache',
        mockDataStreamCache as any,
        mockMonitor as any,
        { name: 'Test Cache Channel' }
      );

      const testData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      const metadata = { priority: 'high' };
      
      await cacheChannel.output(testData, metadata);

      // 验证缓存设置调用
      expect(mockDataStreamCache.set).toHaveBeenCalledTimes(1);
      
      const [cacheKey, cacheData, exchange] = mockDataStreamCache.set.mock.calls[0];
      expect(cacheKey).toBe(`${testData.exchange}:${testData.symbol}:${testData.type}`);
      expect(cacheData).toEqual(expect.objectContaining({
        ...testData,
        metadata: expect.objectContaining({
          ...testData.metadata,
          ...metadata,
          channelId: 'test-cache',
          channelType: 'cache',
          cachedAt: expect.any(Number)
        })
      }));
      expect(exchange).toBe(testData.exchange);

      // 验证通道状态
      const status = cacheChannel.getStatus();
      expect(status.messagesSent).toBe(1);
      expect(status.errors).toBe(0);
      expect(status.health).toBe('healthy');
    });

    it('应该处理缓存失败', async () => {
      const mockDataStreamCache = {
        set: jest.fn().mockImplementation(() => {
          throw new Error('Cache set failed');
        })
      };
      
      const mockMonitor = { log: jest.fn() };

      const cacheChannel = new CacheOutputChannel(
        'error-cache',
        mockDataStreamCache as any,
        mockMonitor as any
      );

      const testData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      
      await expect(cacheChannel.output(testData)).rejects.toThrow('Cache set failed');

      const status = cacheChannel.getStatus();
      expect(status.messagesSent).toBe(0);
      expect(status.errors).toBe(1);
      expect(status.health).toBe('unhealthy');
    });
  });

  describe('Batch输出通道测试', () => {
    it('应该批量发送数据到目标通道', async () => {
      const targetChannel = testManager.createMockChannel('batch-target', {
        processingDelay: 10
      });

      const batchChannel = new BatchOutputChannel(
        'test-batch',
        targetChannel,
        { log: jest.fn() } as any,
        {
          name: 'Test Batch Channel',
          batchSize: 3,
          flushTimeout: 1000
        }
      );

      // 发送少于批次大小的数据
      const testData1 = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      const testData2 = dataGenerator.generateMarketData(BASIC_TICKER_DATA);
      
      await batchChannel.output(testData1);
      await batchChannel.output(testData2);

      // 此时应该还没有发送到目标通道
      expect(targetChannel.getOutputHistory()).toHaveLength(0);

      // 发送第三条数据，触发批量发送
      const testData3 = dataGenerator.generateMarketData({
        ...BASIC_TRADE_DATA,
        symbol: 'ETHUSDT'
      });
      
      await batchChannel.output(testData3);

      // 等待批次处理完成
      await testUtils.wait(100);

      // 验证目标通道收到了3条数据
      const targetHistory = targetChannel.getOutputHistory();
      expect(targetHistory).toHaveLength(3);
      
      // 验证数据顺序正确
      expect(targetHistory[0].data.symbol).toBe(testData1.symbol);
      expect(targetHistory[1].data.type).toBe(testData2.type);
      expect(targetHistory[2].data.symbol).toBe(testData3.symbol);

      // 验证批次元数据
      expect(targetHistory[0].metadata.batchedBy).toBe('test-batch');
      expect(targetHistory[0].metadata.batchSize).toBe(3);

      const status = batchChannel.getStatus();
      expect(status.messagesSent).toBe(3);
      expect(status.errors).toBe(0);
    });

    it('应该在超时时自动刷新批次', async () => {
      const targetChannel = testManager.createMockChannel('timeout-target');

      const batchChannel = new BatchOutputChannel(
        'timeout-batch',
        targetChannel,
        { log: jest.fn() } as any,
        {
          batchSize: 10, // 大批次大小
          flushTimeout: 100 // 很短的超时
        }
      );

      // 发送少量数据
      const testData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      await batchChannel.output(testData);

      // 等待超时刷新
      await testUtils.wait(150);

      // 验证即使没有达到批次大小也被发送了
      expect(targetChannel.getOutputHistory()).toHaveLength(1);
      expect(targetChannel.getOutputHistory()[0].data).toEqual(testData);
    });

    it('应该处理目标通道错误', async () => {
      const faultyTargetChannel = testManager.createMockChannel('faulty-target', {
        shouldFail: true,
        failureRate: 1.0
      });

      const batchChannel = new BatchOutputChannel(
        'error-batch',
        faultyTargetChannel,
        { log: jest.fn() } as any,
        { batchSize: 2, flushTimeout: 100 }
      );

      const testData1 = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      const testData2 = dataGenerator.generateMarketData(BASIC_TICKER_DATA);
      
      await batchChannel.output(testData1);
      await batchChannel.output(testData2); // 触发批量发送

      await testUtils.wait(100);

      const status = batchChannel.getStatus();
      expect(status.messagesSent).toBe(0); // 发送失败
      expect(status.errors).toBeGreaterThan(0);
      expect(status.health).toBe('unhealthy');
    });

    it('应该在关闭时刷新剩余数据', async () => {
      const targetChannel = testManager.createMockChannel('close-target');

      const batchChannel = new BatchOutputChannel(
        'close-batch',
        targetChannel,
        { log: jest.fn() } as any,
        { batchSize: 10, flushTimeout: 1000 }
      );

      // 发送少量数据
      const testData = dataGenerator.generateBulkMarketData(3, BASIC_TRADE_DATA);
      
      for (const data of testData) {
        await batchChannel.output(data);
      }

      // 关闭通道
      await batchChannel.close();

      // 验证剩余数据被刷新
      expect(targetChannel.getOutputHistory()).toHaveLength(3);
    });
  });

  describe('通道性能测试', () => {
    it('应该在高频输出下保持性能', async () => {
      performanceMonitor.start('通道性能测试');

      // 创建各种类型的通道进行性能测试
      const mockChannels = [
        testManager.createMockChannel('perf-mock-1', { processingDelay: 0 }),
        testManager.createMockChannel('perf-mock-2', { processingDelay: 1 }),
        testManager.createMockChannel('perf-mock-3', { processingDelay: 2 })
      ];

      // 生成高频测试数据
      const highFreqData = generateHighFrequencyTrades(1000, 'BTCUSDT', 50000);

      // 并发测试所有通道
      const channelTests = mockChannels.map(async (channel, index) => {
        const channelData = highFreqData.slice(index * 300, (index + 1) * 300);
        
        return await benchmark.measureBatch(
          channelData.map((data, dataIndex) => ({
            name: `channel-${index}-output-${dataIndex}`,
            fn: () => channel.output(data, { channelTest: true }),
            metadata: { channelId: channel.id }
          }))
        );
      });

      await Promise.all(channelTests);

      const stats = benchmark.getStatistics();
      const performanceReport = performanceMonitor.stop();

      // 验证通道性能
      expect(stats?.average).toBeLessThan(10); // 平均输出时间 < 10ms
      expect(stats?.p95).toBeLessThan(25); // P95输出时间 < 25ms

      // 验证所有数据都被正确输出
      const totalOutputs = mockChannels.reduce(
        (total, channel) => total + channel.getOutputHistory().length,
        0
      );
      expect(totalOutputs).toBe(900); // 3个通道 * 300条数据

      console.log('📊 通道性能测试结果:');
      console.log(`  - 测试通道: ${mockChannels.length}`);
      console.log(`  - 总输出量: ${totalOutputs}`);
      console.log(`  - 平均延迟: ${stats?.average.toFixed(2)}ms`);
      console.log(`  - P95延迟: ${stats?.p95.toFixed(2)}ms`);
      console.log(`  - 内存使用: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      console.log('✅ 通道性能测试完成');
    }, 20000);

    it('应该在压力测试下保持稳定', async () => {
      performanceMonitor.start('通道压力测试');

      // 创建多个不同配置的通道
      const channels = [
        testManager.createMockChannel('stress-fast', { processingDelay: 0 }),
        testManager.createMockChannel('stress-medium', { processingDelay: 5 }),
        testManager.createMockChannel('stress-slow', { processingDelay: 10 }),
        testManager.createMockChannel('stress-variable', { 
          processingDelay: 0,
          failureRate: 0.05 // 5%失败率
        })
      ];

      // 生成压力测试数据 (2000条/秒，持续2秒)
      const stressData = generateStressTestData(2000, 2);

      // 并发压力测试
      const stressPromises = channels.map(async (channel) => {
        const channelData = stressData.filter((_, index) => index % channels.length === channels.indexOf(channel));
        
        const promises = channelData.map(data => 
          channel.output(data, { stressTest: true }).catch(() => {
            // 忽略预期的失败
          })
        );
        
        return Promise.allSettled(promises);
      });

      await Promise.all(stressPromises);

      const performanceReport = performanceMonitor.stop();

      // 验证通道在压力下的稳定性
      channels.forEach((channel, index) => {
        const status = channel.getStatus();
        const successRate = status.messagesSent / (status.messagesSent + status.errors);
        
        if (channel.id !== 'stress-variable') {
          expect(successRate).toBeGreaterThan(0.99); // 非故障通道成功率 > 99%
        } else {
          expect(successRate).toBeGreaterThan(0.90); // 故障通道成功率 > 90%
        }
        
        console.log(`通道 ${channel.id}: 发送 ${status.messagesSent}, 错误 ${status.errors}, 成功率 ${(successRate * 100).toFixed(1)}%`);
      });

      // 验证内存使用合理
      expect(performanceReport.metrics.memoryUsage.growth).toBeLessThan(100); // 内存增长 < 100MB

      console.log('📊 通道压力测试结果:');
      console.log(`  - 测试数据量: ${stressData.length}`);
      console.log(`  - 测试通道数: ${channels.length}`);
      console.log(`  - 内存增长: ${performanceReport.metrics.memoryUsage.growth.toFixed(2)}MB`);
      console.log(`  - 测试持续时间: ${performanceReport.duration}ms`);

      console.log('✅ 通道压力测试完成');
    }, 30000);
  });

  describe('通道健康状态和监控', () => {
    it('应该正确报告通道健康状态', async () => {
      const healthyChannel = testManager.createMockChannel('healthy', {
        processingDelay: 1
      });

      const degradedChannel = testManager.createMockChannel('degraded', {
        processingDelay: 5,
        failureRate: 0.1 // 10%失败率
      });

      const unhealthyChannel = testManager.createMockChannel('unhealthy', {
        shouldFail: true,
        failureRate: 1.0 // 100%失败率
      });

      // 发送测试数据
      const testData = dataGenerator.generateBulkMarketData(20, BASIC_TRADE_DATA);

      for (const data of testData) {
        await healthyChannel.output(data).catch(() => {});
        await degradedChannel.output(data).catch(() => {});
        await unhealthyChannel.output(data).catch(() => {});
      }

      // 验证健康状态
      expect(healthyChannel.getStatus().health).toBe('healthy');
      expect(degradedChannel.getStatus().health).toBe('degraded');
      expect(unhealthyChannel.getStatus().health).toBe('unhealthy');

      // 验证统计数据
      const healthyStats = healthyChannel.getStatus();
      expect(healthyStats.messagesSent).toBe(20);
      expect(healthyStats.errors).toBe(0);

      const degradedStats = degradedChannel.getStatus();
      expect(degradedStats.messagesSent).toBeGreaterThan(0);
      expect(degradedStats.messagesSent).toBeLessThan(20);
      expect(degradedStats.errors).toBeGreaterThan(0);

      const unhealthyStats = unhealthyChannel.getStatus();
      expect(unhealthyStats.messagesSent).toBe(0);
      expect(unhealthyStats.errors).toBe(20);
    });

    it('应该提供详细的性能指标', async () => {
      const channel = testManager.createMockChannel('metrics', {
        processingDelay: 10 // 固定延迟便于测试
      });

      const testData = dataGenerator.generateBulkMarketData(50, BASIC_TRADE_DATA);
      
      for (const data of testData) {
        await channel.output(data);
      }

      const latencyStats = channel.getLatencyStats();
      
      // 验证延迟统计
      expect(latencyStats.min).toBeGreaterThanOrEqual(10);
      expect(latencyStats.max).toBeGreaterThan(latencyStats.min);
      expect(latencyStats.avg).toBeGreaterThanOrEqual(10);
      expect(latencyStats.p95).toBeGreaterThanOrEqual(latencyStats.avg);

      const outputHistory = channel.getOutputHistory();
      expect(outputHistory).toHaveLength(50);
      
      // 验证输出历史包含时间戳
      outputHistory.forEach(record => {
        expect(record.timestamp).toBeGreaterThan(0);
        expect(record.data).toBeDefined();
      });
    });
  });
});