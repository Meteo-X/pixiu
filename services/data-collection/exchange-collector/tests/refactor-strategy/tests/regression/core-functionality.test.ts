/**
 * 核心功能回归测试
 * 确保重构过程中现有功能不受影响
 */

import { BinanceAdapter } from '@pixiu/binance-adapter';
import { AdapterRegistry } from '../../src/adapters/registry/adapter-registry';
import { ExchangeCollectorService } from '../../src/index';
import { MockFactory } from '../utils/mock-factory';
import { TestDataGenerator } from '../fixtures/test-data-generator';

describe('核心功能回归测试套件', () => {
  let adapterRegistry: AdapterRegistry;
  let binanceAdapter: BinanceAdapter;
  let testConfig: any;

  beforeAll(async () => {
    testConfig = {
      exchange: 'binance',
      connection: {
        timeout: 10000,
        retryAttempts: 3
      },
      subscriptions: ['BTCUSDT@kline_1m', 'ETHUSDT@trade']
    };
  });

  beforeEach(async () => {
    adapterRegistry = new AdapterRegistry();
    binanceAdapter = new BinanceAdapter(testConfig);
  });

  afterEach(async () => {
    if (binanceAdapter) {
      await binanceAdapter.disconnect();
    }
    if (adapterRegistry) {
      await adapterRegistry.shutdown();
    }
  });

  describe('WebSocket连接建立和数据接收', () => {
    test('应能成功建立WebSocket连接', async () => {
      // 使用Mock WebSocket避免实际连接
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      const connectPromise = binanceAdapter.connect();
      
      // 模拟连接成功
      mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1]?.();
      
      await expect(connectPromise).resolves.toBeUndefined();
      expect(binanceAdapter.getStatus()).toBe('connected');
    });

    test('应能正确接收和解析实时数据', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      const testMarketData = TestDataGenerator.generateBinanceKlineData();
      
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);
      
      // 连接适配器
      await binanceAdapter.connect();
      
      // 设置数据接收监听
      const receivedData: any[] = [];
      binanceAdapter.on('data', (data) => {
        receivedData.push(data);
      });

      // 模拟接收数据
      const rawMessage = JSON.stringify({
        stream: 'btcusdt@kline_1m',
        data: testMarketData
      });
      
      mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(rawMessage);

      // 验证数据正确处理
      await TestUtils.waitFor(() => receivedData.length > 0);
      
      expect(receivedData).toHaveLength(1);
      expect(receivedData[0]).toMatchObject({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'kline',
        timestamp: expect.any(Number),
        data: expect.any(Object)
      });
    });

    test('应能处理连接错误和重连', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      const errorsSpy = jest.fn();
      binanceAdapter.on('error', errorsSpy);

      // 启动连接
      const connectPromise = binanceAdapter.connect();
      
      // 模拟连接错误
      const testError = new Error('Connection failed');
      mockWs.on.mock.calls.find(call => call[0] === 'error')?.[1]?.(testError);

      await expect(connectPromise).rejects.toThrow('Connection failed');
      expect(errorsSpy).toHaveBeenCalledWith(testError);
    });
  });

  describe('Pub/Sub消息发布和订阅', () => {
    let mockPubSubClient: any;
    let exchangeCollectorService: ExchangeCollectorService;

    beforeEach(async () => {
      mockPubSubClient = MockFactory.createPubSubClient();
      exchangeCollectorService = new ExchangeCollectorService({
        pubsub: mockPubSubClient,
        adapters: {
          binance: testConfig
        }
      });
    });

    test('应能正确发布消息到各个主题', async () => {
      const testMarketData = TestDataGenerator.generateMarketData('kline', 'BTCUSDT');
      
      // 启动服务
      await exchangeCollectorService.start();
      
      // 模拟数据处理
      await exchangeCollectorService.processMarketData('binance', testMarketData);
      
      // 验证消息发布
      expect(mockPubSubClient.publish).toHaveBeenCalledWith(
        'market-data-kline',
        expect.objectContaining({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: 'kline'
        })
      );
    });

    test('应能处理消息发布失败', async () => {
      // 模拟发布失败
      mockPubSubClient.publish.mockRejectedValue(new Error('Publish failed'));
      
      const testMarketData = TestDataGenerator.generateMarketData('trade', 'ETHUSDT');
      
      await exchangeCollectorService.start();
      
      // 不应该抛出异常，应该优雅处理
      await expect(
        exchangeCollectorService.processMarketData('binance', testMarketData)
      ).resolves.toBeUndefined();
      
      // 应该记录错误但继续运行
      expect(exchangeCollectorService.getStats().errors.pubsub).toBeGreaterThan(0);
    });

    test('消息格式应符合现有标准', async () => {
      const testData = TestDataGenerator.generateMarketData('ticker', 'BTCUSDT');
      
      await exchangeCollectorService.start();
      await exchangeCollectorService.processMarketData('binance', testData);
      
      const publishCall = mockPubSubClient.publish.mock.calls[0];
      const publishedMessage = publishCall[1];
      
      // 验证消息结构
      expect(publishedMessage).toMatchObject({
        id: expect.any(String),
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker',
        timestamp: expect.any(Number),
        data: expect.any(Object),
        metadata: expect.objectContaining({
          processedAt: expect.any(Number),
          version: expect.any(String)
        })
      });
    });
  });

  describe('多适配器并发处理', () => {
    test('应能同时处理多个适配器', async () => {
      const adapters = ['binance', 'okex', 'huobi'];
      const mockAdapters = adapters.map(name => {
        const mock = MockFactory.createBinanceAdapter();
        mock.getName = jest.fn().mockReturnValue(name);
        return mock;
      });

      // 注册多个适配器
      for (let i = 0; i < adapters.length; i++) {
        await adapterRegistry.registerAdapter(adapters[i], mockAdapters[i]);
      }

      // 启动所有适配器
      await adapterRegistry.startAll();

      // 验证所有适配器都已启动
      for (const adapterName of adapters) {
        const adapter = adapterRegistry.getAdapter(adapterName);
        expect(adapter).toBeDefined();
        expect(adapter.connect).toHaveBeenCalled();
      }
    });

    test('应能隔离适配器错误', async () => {
      const workingAdapter = MockFactory.createBinanceAdapter();
      const failingAdapter = MockFactory.createBinanceAdapter();
      
      // 设置一个适配器失败
      failingAdapter.connect.mockRejectedValue(new Error('Adapter failed'));
      
      await adapterRegistry.registerAdapter('working', workingAdapter);
      await adapterRegistry.registerAdapter('failing', failingAdapter);

      await adapterRegistry.startAll();

      // 验证工作的适配器不受影响
      expect(workingAdapter.connect).toHaveBeenCalled();
      expect(adapterRegistry.getAdapter('working')).toBeDefined();
      
      // 验证失败的适配器被正确处理
      expect(adapterRegistry.getStats().errors.adapters.failing).toBeGreaterThan(0);
    });

    test('应能管理资源隔离', async () => {
      const adapter1 = MockFactory.createBinanceAdapter();
      const adapter2 = MockFactory.createBinanceAdapter();
      
      await adapterRegistry.registerAdapter('adapter1', adapter1);
      await adapterRegistry.registerAdapter('adapter2', adapter2);
      
      await adapterRegistry.startAll();

      // 模拟第一个适配器处理大量数据
      for (let i = 0; i < 1000; i++) {
        const testData = TestDataGenerator.generateMarketData('kline', `SYMBOL${i}`);
        adapter1.emit('data', testData);
      }

      // 验证第二个适配器仍然响应
      const testResponse = await adapterRegistry.getAdapter('adapter2').getStatus();
      expect(testResponse).toBeDefined();
    });
  });

  describe('错误处理和恢复机制', () => {
    test('应能从网络中断中恢复', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      await binanceAdapter.connect();
      
      // 模拟网络中断
      mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1]?.(1006, 'Network error');
      
      // 验证重连尝试
      await TestUtils.waitFor(() => {
        return (global.WebSocket as jest.Mock).mock.calls.length > 1;
      });
      
      expect(global.WebSocket).toHaveBeenCalledTimes(2); // 原始连接 + 重连
    });

    test('应能处理数据解析错误', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      await binanceAdapter.connect();
      
      const errorData: any[] = [];
      binanceAdapter.on('error', (error) => {
        errorData.push(error);
      });

      // 发送无效JSON
      mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.('invalid json');
      
      // 适配器应该继续工作，不应崩溃
      expect(binanceAdapter.getStatus()).toBe('connected');
      
      // 发送有效数据验证适配器仍在工作
      const validData = JSON.stringify({
        stream: 'btcusdt@kline_1m',
        data: TestDataGenerator.generateBinanceKlineData()
      });
      
      const receivedData: any[] = [];
      binanceAdapter.on('data', (data) => {
        receivedData.push(data);
      });
      
      mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(validData);
      
      await TestUtils.waitFor(() => receivedData.length > 0);
      expect(receivedData).toHaveLength(1);
    });
  });

  describe('性能基准验证', () => {
    test('消息处理延迟应在可接受范围内', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      await binanceAdapter.connect();
      
      const latencies: number[] = [];
      
      binanceAdapter.on('data', () => {
        const endTime = Date.now();
        const latency = endTime - startTime;
        latencies.push(latency);
      });

      // 发送100条测试消息
      for (let i = 0; i < 100; i++) {
        const startTime = Date.now();
        const testData = JSON.stringify({
          stream: 'btcusdt@kline_1m',
          data: TestDataGenerator.generateBinanceKlineData()
        });
        
        mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testData);
      }

      await TestUtils.waitFor(() => latencies.length === 100);
      
      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
      
      expect(avgLatency).toBeLessThan(10); // 平均延迟小于10ms
      expect(p95Latency).toBeLessThan(50); // P95延迟小于50ms
    });

    test('内存使用应保持稳定', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      await binanceAdapter.connect();
      
      // 处理大量数据
      for (let i = 0; i < 10000; i++) {
        const testData = JSON.stringify({
          stream: `symbol${i}@kline_1m`,
          data: TestDataGenerator.generateBinanceKlineData()
        });
        
        mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testData);
      }

      // 等待处理完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // 内存增长应该在合理范围内（小于50MB）
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});