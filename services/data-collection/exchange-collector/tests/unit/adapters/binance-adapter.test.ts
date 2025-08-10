/**
 * BinanceAdapter 测试 - 支持新的adapter-base框架
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { BinanceAdapter } from '@pixiu/binance-adapter';
import { DataType, AdapterStatus, ConnectionState } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { EnhancedMockFactory, MockConnectionManager } from '../../utils/enhanced-mock-factory';
import { TestUtils } from '../../utils/test-utils';

describe('BinanceAdapter - Framework Integration', () => {
  let adapter: BinanceAdapter;
  let mockConnectionManager: MockConnectionManager;

  beforeAll(() => {
    // 设置全局WebSocket Mock
    EnhancedMockFactory.setupGlobalWebSocketMock();
  });

  beforeEach(() => {
    // 创建适配器实例（新的无参构造函数）
    adapter = new BinanceAdapter();
    
    // 创建连接管理器Mock
    mockConnectionManager = EnhancedMockFactory.createConnectionManagerMock();
  });

  afterEach(async () => {
    // 清理资源
    if (adapter) {
      try {
        await adapter.stop();
      } catch (error) {
        // 忽略停止时的错误
      }
    }
    
    EnhancedMockFactory.cleanup();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // 全局清理，防止Jest挂起
    await globalCache.destroy();
  });

  describe('Adapter Base Integration', () => {
    it('should inherit from BaseAdapter correctly', () => {
      expect(adapter).toBeDefined();
      expect(typeof adapter.initialize).toBe('function');
      expect(typeof adapter.start).toBe('function');
      expect(typeof adapter.stop).toBe('function');
      expect(typeof adapter.subscribe).toBe('function');
      expect(typeof adapter.unsubscribe).toBe('function');
    });

    it('should have correct adapter name', () => {
      expect(adapter.getName()).toBe('binance');
    });

    it('should start with DISCONNECTED status', () => {
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
    });

    it('should initialize with configuration', async () => {
      const config = TestUtils.createTestConfig({
        binance: {
          wsUrl: 'wss://stream.binance.com:9443/ws',
          apiKey: 'test-key',
          apiSecret: 'test-secret'
        }
      });

      await expect(adapter.initialize(config.binance)).resolves.not.toThrow();
      expect(adapter.getStatus()).toBe(AdapterStatus.INITIALIZED);
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      const config = TestUtils.createTestConfig();
      await adapter.initialize(config.binance);
    });

    it('should start successfully', async () => {
      const statusChanges: AdapterStatus[] = [];
      adapter.on('statusChanged', (status: AdapterStatus) => {
        statusChanges.push(status);
      });

      await adapter.start();

      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      expect(statusChanges).toContain(AdapterStatus.CONNECTING);
      expect(statusChanges).toContain(AdapterStatus.CONNECTED);
    });

    it('should handle connection lifecycle correctly', async () => {
      const events: string[] = [];
      
      adapter.on('statusChanged', (status: AdapterStatus) => {
        events.push(`status:${status}`);
      });

      adapter.on('connected', () => {
        events.push('connected');
      });

      adapter.on('disconnected', () => {
        events.push('disconnected');
      });

      // 启动连接
      await adapter.start();
      await TestUtils.sleep(50);

      // 停止连接
      await adapter.stop();
      await TestUtils.sleep(50);

      // 验证事件序列
      expect(events).toContain('status:' + AdapterStatus.CONNECTING);
      expect(events).toContain('status:' + AdapterStatus.CONNECTED);
      expect(events).toContain('connected');
      expect(events).toContain('status:' + AdapterStatus.DISCONNECTED);
      expect(events).toContain('disconnected');
    });

    it('should handle reconnection on connection loss', async () => {
      await adapter.start();
      
      const reconnectSpy = jest.spyOn(adapter, 'start');
      
      // 模拟连接丢失
      adapter.emit('error', new Error('Connection lost'));
      
      // 等待重连逻辑触发
      await TestUtils.waitFor(() => reconnectSpy.mock.calls.length > 0, 2000);
      
      expect(reconnectSpy).toHaveBeenCalled();
    });
  });

  describe('Data Subscription Management', () => {
    beforeEach(async () => {
      const config = TestUtils.createTestConfig();
      await adapter.initialize(config.binance);
      await adapter.start();
    });

    it('should subscribe to market data successfully', async () => {
      const subscriptionEvents: any[] = [];
      
      adapter.on('subscribed', (event) => {
        subscriptionEvents.push(event);
      });

      const subscriptionConfig = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER
      };

      await adapter.subscribe(subscriptionConfig);

      await TestUtils.waitFor(() => subscriptionEvents.length > 0, 1000);
      
      const subscriptionEvent = subscriptionEvents[0];
      expect(subscriptionEvent.symbol).toBe('BTCUSDT');
      expect(subscriptionEvent.type).toBe(DataType.TICKER);
    });

    it('should handle multiple subscriptions', async () => {
      const subscriptions = [
        { symbol: 'BTCUSDT', type: DataType.TICKER },
        { symbol: 'ETHUSDT', type: DataType.DEPTH },
        { symbol: 'ADAUSDT', type: DataType.TRADE }
      ];

      const subscriptionPromises = subscriptions.map(sub => adapter.subscribe(sub));
      await Promise.all(subscriptionPromises);

      // 验证所有订阅都成功
      for (const sub of subscriptions) {
        const isSubscribed = await TestUtils.waitForEvent(
          adapter,
          'subscribed',
          1000
        ).catch(() => false);
        
        expect(isSubscribed).toBeTruthy();
      }
    });

    it('should unsubscribe from market data', async () => {
      // 先订阅
      await adapter.subscribe({ symbol: 'BTCUSDT', type: DataType.TICKER });

      const unsubscribeEvents: any[] = [];
      adapter.on('unsubscribed', (event) => {
        unsubscribeEvents.push(event);
      });

      // 取消订阅
      await adapter.unsubscribe('BTCUSDT', DataType.TICKER);

      await TestUtils.waitFor(() => unsubscribeEvents.length > 0, 1000);
      
      const unsubscribeEvent = unsubscribeEvents[0];
      expect(unsubscribeEvent.symbol).toBe('BTCUSDT');
      expect(unsubscribeEvent.type).toBe(DataType.TICKER);
    });
  });

  describe('Data Processing and Events', () => {
    beforeEach(async () => {
      const config = TestUtils.createTestConfig();
      await adapter.initialize(config.binance);
      await adapter.start();
    });

    it('should emit data events when receiving market data', async () => {
      const dataEvents: any[] = [];
      
      adapter.on('data', (data) => {
        dataEvents.push(data);
      });

      // 订阅数据
      await adapter.subscribe({ symbol: 'BTCUSDT', type: DataType.TICKER });
      
      // 模拟接收到数据（通过底层连接管理器）
      const mockData = {
        stream: 'btcusdt@ticker',
        data: {
          s: 'BTCUSDT',
          p: '50000.00',
          P: '2.5',
          c: '51250.00',
          v: '1000.5'
        }
      };

      // 触发数据事件
      adapter.emit('rawData', JSON.stringify(mockData));
      
      await TestUtils.waitFor(() => dataEvents.length > 0, 1000);
      
      const receivedData = dataEvents[0];
      expect(receivedData.symbol).toBe('BTCUSDT');
      expect(receivedData.type).toBe(DataType.TICKER);
      expect(receivedData.exchange).toBe('binance');
      expect(receivedData.data.price).toBeDefined();
    });

    it('should handle parsing errors gracefully', async () => {
      const errorEvents: Error[] = [];
      
      adapter.on('error', (error) => {
        errorEvents.push(error);
      });

      // 发送无效JSON
      adapter.emit('rawData', 'invalid json data');
      
      await TestUtils.waitFor(() => errorEvents.length > 0, 1000);
      
      expect(errorEvents[0]).toBeInstanceOf(Error);
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED); // 应该继续保持连接
    });

    it('should handle different data types correctly', async () => {
      const dataByType: { [key in DataType]?: any[] } = {};
      
      adapter.on('data', (data) => {
        if (!dataByType[data.type]) {
          dataByType[data.type] = [];
        }
        dataByType[data.type]!.push(data);
      });

      // 订阅不同类型的数据
      const subscriptions = [
        { symbol: 'BTCUSDT', type: DataType.TICKER },
        { symbol: 'BTCUSDT', type: DataType.DEPTH },
        { symbol: 'BTCUSDT', type: DataType.TRADE }
      ];

      await Promise.all(subscriptions.map(sub => adapter.subscribe(sub)));

      // 模拟不同类型的数据
      const mockDataTypes = [
        {
          stream: 'btcusdt@ticker',
          data: { s: 'BTCUSDT', c: '50000' }
        },
        {
          stream: 'btcusdt@depth',
          data: { s: 'BTCUSDT', bids: [], asks: [] }
        },
        {
          stream: 'btcusdt@trade',
          data: { s: 'BTCUSDT', p: '50000', q: '0.1' }
        }
      ];

      for (const mockData of mockDataTypes) {
        adapter.emit('rawData', JSON.stringify(mockData));
      }

      // 等待所有数据类型都收到
      await TestUtils.waitFor(() => 
        Object.keys(dataByType).length >= 3,
        2000
      );

      expect(dataByType[DataType.TICKER]).toBeDefined();
      expect(dataByType[DataType.DEPTH]).toBeDefined();
      expect(dataByType[DataType.TRADE]).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      const config = TestUtils.createTestConfig();
      await adapter.initialize(config.binance);
    });

    it('should handle initialization errors', async () => {
      const invalidConfig = { wsUrl: 'invalid-url' };
      
      await expect(adapter.initialize(invalidConfig)).rejects.toThrow();
      expect(adapter.getStatus()).toBe(AdapterStatus.ERROR);
    });

    it('should handle connection errors', async () => {
      const errorEvents: Error[] = [];
      
      adapter.on('error', (error) => {
        errorEvents.push(error);
      });

      // 模拟连接错误
      const connectionError = new Error('Connection failed');
      adapter.emit('error', connectionError);
      
      await TestUtils.waitFor(() => errorEvents.length > 0, 1000);
      
      expect(errorEvents[0]).toBe(connectionError);
      expect(adapter.getStatus()).toBe(AdapterStatus.ERROR);
    });

    it('should attempt recovery after errors', async () => {
      await adapter.start();
      
      const recoveryAttempts: string[] = [];
      adapter.on('recovery', (attempt) => {
        recoveryAttempts.push(attempt);
      });

      // 触发多次错误以测试恢复机制
      for (let i = 0; i < 3; i++) {
        adapter.emit('error', new Error(`Network error ${i + 1}`));
        await TestUtils.sleep(100);
      }

      // 等待恢复尝试
      await TestUtils.waitFor(() => recoveryAttempts.length > 0, 2000);
      
      expect(recoveryAttempts.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Resource Management', () => {
    beforeEach(async () => {
      const config = TestUtils.createTestConfig();
      await adapter.initialize(config.binance);
      await adapter.start();
    });

    it('should handle high-frequency data efficiently', async () => {
      const dataEvents: any[] = [];
      const startTime = Date.now();
      
      adapter.on('data', (data) => {
        dataEvents.push(data);
      });

      await adapter.subscribe({ symbol: 'BTCUSDT', type: DataType.TICKER });

      // 模拟高频数据
      const dataStream = TestUtils.createHighFrequencyDataStream(1000, 500); // 500 msg/sec for 1 second
      
      for await (const data of dataStream) {
        adapter.emit('rawData', JSON.stringify({
          stream: 'btcusdt@ticker',
          data: {
            s: data.symbol,
            c: data.data.price,
            v: data.data.volume
          }
        }));
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (dataEvents.length * 1000) / duration;
      
      expect(throughput).toBeGreaterThan(400); // 至少400 msg/sec
      expect(dataEvents.length).toBeGreaterThan(400);
    });

    it('should maintain memory stability under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      await adapter.subscribe({ symbol: 'BTCUSDT', type: DataType.TICKER });

      // 生成大量数据
      for (let i = 0; i < 10000; i++) {
        adapter.emit('rawData', JSON.stringify({
          stream: 'btcusdt@ticker',
          data: {
            s: 'BTCUSDT',
            c: (50000 + i).toString(),
            v: '100.0'
          }
        }));

        if (i % 1000 === 0) {
          // 每1000条检查一次内存
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = currentMemory - initialMemory;
          
          // 内存增长不应该超过50MB
          expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        }
      }
    });

    it('should clean up resources properly on stop', async () => {
      // 创建多个订阅
      const subscriptions = [
        { symbol: 'BTCUSDT', type: DataType.TICKER },
        { symbol: 'ETHUSDT', type: DataType.TICKER },
        { symbol: 'ADAUSDT', type: DataType.TICKER }
      ];

      await Promise.all(subscriptions.map(sub => adapter.subscribe(sub)));

      const beforeStopMemory = process.memoryUsage().heapUsed;
      
      await adapter.stop();
      
      // 等待清理完成
      await TestUtils.sleep(100);
      
      const afterStopMemory = process.memoryUsage().heapUsed;
      
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
      
      // 内存应该有所释放（考虑到GC的延迟，这个检查比较宽松）
      const memoryDelta = afterStopMemory - beforeStopMemory;
      expect(Math.abs(memoryDelta)).toBeLessThan(10 * 1024 * 1024); // 10MB tolerance
    });
  });

  describe('Integration with adapter-base Framework', () => {
    it('should emit framework-standard events', async () => {
      const config = TestUtils.createTestConfig();
      const events: string[] = [];

      // 监听框架标准事件
      const standardEvents = ['statusChanged', 'connected', 'disconnected', 'data', 'error', 'subscribed', 'unsubscribed'];
      
      standardEvents.forEach(eventName => {
        adapter.on(eventName, () => {
          events.push(eventName);
        });
      });

      await adapter.initialize(config.binance);
      await adapter.start();
      await adapter.subscribe({ symbol: 'BTCUSDT', type: DataType.TICKER });
      await adapter.unsubscribe('BTCUSDT', DataType.TICKER);
      await adapter.stop();

      // 验证所有关键事件都被触发
      expect(events).toContain('statusChanged');
      expect(events).toContain('connected');
      expect(events).toContain('subscribed');
      expect(events).toContain('unsubscribed');
      expect(events).toContain('disconnected');
    });

    it('should support framework configuration schema', async () => {
      const frameworkConfig = {
        wsUrl: 'wss://stream.binance.com:9443/ws',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        heartbeat: {
          enabled: true,
          interval: 30000
        },
        reconnect: {
          enabled: true,
          maxAttempts: 5,
          delay: 1000
        }
      };

      await expect(adapter.initialize(frameworkConfig)).resolves.not.toThrow();
      expect(adapter.getStatus()).toBe(AdapterStatus.INITIALIZED);
    });
  });
});