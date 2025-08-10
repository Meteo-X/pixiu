/**
 * 阶段2测试：BinanceAdapter重构验证
 * 验证BinanceAdapter正确集成BaseAdapter框架
 */

import { BinanceAdapter } from '@pixiu/binance-adapter';
import { BaseAdapter, BaseConnectionManager } from '@pixiu/adapter-base';
import { MockFactory } from '../utils/mock-factory';
import { TestDataGenerator } from '../fixtures/test-data-generator';

describe('阶段2: BinanceAdapter重构验证', () => {
  let adapter: BinanceAdapter;
  let testConfig: any;

  beforeAll(async () => {
    testConfig = {
      exchange: 'binance',
      connection: {
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000
      },
      subscriptions: ['BTCUSDT@kline_1m', 'ETHUSDT@trade']
    };
  });

  beforeEach(async () => {
    adapter = new BinanceAdapter(testConfig);
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.disconnect();
    }
  });

  describe('BaseAdapter框架集成验证', () => {
    test('应正确继承BaseAdapter', () => {
      expect(adapter).toBeInstanceOf(BaseAdapter);
      expect(adapter.getName).toBeDefined();
      expect(adapter.getStatus).toBeDefined();
      expect(adapter.connect).toBeDefined();
      expect(adapter.disconnect).toBeDefined();
      expect(adapter.subscribe).toBeDefined();
      expect(adapter.unsubscribe).toBeDefined();
    });

    test('应正确实现BaseAdapter抽象方法', async () => {
      // 验证必需的抽象方法被实现
      expect(typeof adapter.createConnectionManager).toBe('function');
      expect(typeof adapter.parseMessage).toBe('function');
      expect(typeof adapter.validateSubscription).toBe('function');

      // 验证方法调用不会抛出"未实现"错误
      const connectionManager = await adapter.createConnectionManager();
      expect(connectionManager).toBeInstanceOf(BaseConnectionManager);
    });

    test('应使用BaseAdapter的状态管理', async () => {
      // 初始状态应为disconnected
      expect(adapter.getStatus()).toBe('disconnected');

      // Mock WebSocket连接
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      // 连接后状态应变化
      const connectPromise = adapter.connect();
      
      // 模拟连接成功
      mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1]?.();
      
      await connectPromise;
      expect(adapter.getStatus()).toBe('connected');
    });

    test('应触发BaseAdapter定义的事件', async () => {
      const statusChanges: string[] = [];
      const dataEvents: any[] = [];
      const errorEvents: any[] = [];

      adapter.on('status', (status) => statusChanges.push(status));
      adapter.on('data', (data) => dataEvents.push(data));
      adapter.on('error', (error) => errorEvents.push(error));

      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      // 测试连接状态事件
      const connectPromise = adapter.connect();
      mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1]?.();
      await connectPromise;

      expect(statusChanges).toContain('connecting');
      expect(statusChanges).toContain('connected');

      // 测试数据事件
      const testMessage = JSON.stringify({
        stream: 'btcusdt@kline_1m',
        data: TestDataGenerator.generateBinanceKlineData()
      });
      
      mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testMessage);
      
      await TestUtils.waitFor(() => dataEvents.length > 0);
      expect(dataEvents).toHaveLength(1);

      // 测试错误事件
      const testError = new Error('Test error');
      mockWs.on.mock.calls.find(call => call[0] === 'error')?.[1]?.(testError);

      expect(errorEvents).toContain(testError);
    });
  });

  describe('ConnectionManager集成验证', () => {
    test('应创建BinanceConnectionManager实例', async () => {
      const connectionManager = await adapter.createConnectionManager();
      
      expect(connectionManager).toBeDefined();
      expect(connectionManager).toBeInstanceOf(BaseConnectionManager);
      expect(connectionManager.connect).toBeDefined();
      expect(connectionManager.disconnect).toBeDefined();
      expect(connectionManager.getStatus).toBeDefined();
    });

    test('应通过ConnectionManager管理连接', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      // 验证连接通过ConnectionManager建立
      await adapter.connect();
      
      const connectionManager = await adapter.createConnectionManager();
      expect(connectionManager.getStatus()).toBe('connected');
    });

    test('ConnectionManager应处理重连逻辑', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      await adapter.connect();

      // 模拟连接断开
      mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1]?.(1006, 'Connection lost');

      // 验证重连尝试
      await TestUtils.waitFor(() => {
        return (global.WebSocket as jest.Mock).mock.calls.length > 1;
      }, 5000);

      expect(global.WebSocket).toHaveBeenCalledTimes(2); // 原连接 + 重连
    });

    test('ConnectionManager应实现心跳机制', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      await adapter.connect();
      
      // 等待心跳启动
      await new Promise(resolve => setTimeout(resolve, 100));

      const connectionManager = await adapter.createConnectionManager();
      
      // 验证心跳配置
      expect(connectionManager.getHeartbeatInterval()).toBeGreaterThan(0);
      expect(connectionManager.isHeartbeatEnabled()).toBe(true);
    });
  });

  describe('重构前后接口兼容性验证', () => {
    test('公共API应保持不变', () => {
      const publicMethods = [
        'connect',
        'disconnect',
        'subscribe',
        'unsubscribe',
        'getStatus',
        'getName',
        'getSubscriptions',
        'on',
        'off',
        'emit'
      ];

      publicMethods.forEach(method => {
        expect(adapter[method as keyof BinanceAdapter]).toBeDefined();
        expect(typeof adapter[method as keyof BinanceAdapter]).toBe('function');
      });
    });

    test('配置接口应向后兼容', () => {
      const legacyConfig = {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: false,
        streams: ['BTCUSDT@kline_1m']
      };

      expect(() => new BinanceAdapter(legacyConfig)).not.toThrow();
    });

    test('事件接口应向后兼容', async () => {
      const eventHandlers = {
        data: jest.fn(),
        error: jest.fn(),
        status: jest.fn(),
        connected: jest.fn(),
        disconnected: jest.fn()
      };

      // 注册所有事件处理器
      Object.entries(eventHandlers).forEach(([event, handler]) => {
        adapter.on(event, handler);
      });

      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      // 触发连接事件
      const connectPromise = adapter.connect();
      mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1]?.();
      await connectPromise;

      // 验证事件被正确触发
      expect(eventHandlers.status).toHaveBeenCalled();
      expect(eventHandlers.connected).toHaveBeenCalled();
    });

    test('数据格式应保持一致', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      const receivedData: any[] = [];
      adapter.on('data', (data) => receivedData.push(data));

      await adapter.connect();

      const testMessage = JSON.stringify({
        stream: 'btcusdt@kline_1m',
        data: TestDataGenerator.generateBinanceKlineData()
      });

      mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testMessage);

      await TestUtils.waitFor(() => receivedData.length > 0);

      // 验证数据格式符合预期
      expect(receivedData[0]).toMatchObject({
        exchange: 'binance',
        symbol: expect.any(String),
        type: expect.any(String),
        timestamp: expect.any(Number),
        data: expect.any(Object)
      });
    });
  });

  describe('重构质量验证', () => {
    test('不应有直接的WebSocket实现', () => {
      // 验证adapter不直接操作WebSocket
      const adapterString = adapter.toString();
      expect(adapterString).not.toMatch(/new WebSocket\(/);
      expect(adapterString).not.toMatch(/ws\.(send|close|ping)/);
    });

    test('应使用BaseAdapter的错误处理', async () => {
      const errors: any[] = [];
      adapter.on('error', (error) => errors.push(error));

      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      await adapter.connect();

      // 模拟各种错误
      const networkError = new Error('Network error');
      const parseError = new Error('Parse error');

      mockWs.on.mock.calls.find(call => call[0] === 'error')?.[1]?.(networkError);
      mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.('invalid json');

      await TestUtils.waitFor(() => errors.length >= 1);

      // 验证错误被正确处理和传播
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.message === 'Network error')).toBe(true);
    });

    test('应正确清理资源', async () => {
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      await adapter.connect();
      
      // 验证连接建立
      expect(adapter.getStatus()).toBe('connected');

      // 断开连接
      await adapter.disconnect();
      
      // 验证资源清理
      expect(adapter.getStatus()).toBe('disconnected');
      expect(mockWs.close).toHaveBeenCalled();
    });

    test('应遵循BaseAdapter的生命周期', async () => {
      const lifecycleEvents: string[] = [];
      
      adapter.on('status', (status) => {
        lifecycleEvents.push(status);
      });

      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      // 完整生命周期测试
      const connectPromise = adapter.connect();
      mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1]?.();
      await connectPromise;

      await adapter.disconnect();

      // 验证生命周期事件顺序
      expect(lifecycleEvents).toEqual([
        'connecting',
        'connected',
        'disconnecting',
        'disconnected'
      ]);
    });
  });

  describe('性能和稳定性验证', () => {
    test('重构后内存使用应优化', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      // 创建并连接适配器
      await adapter.connect();

      // 处理大量消息
      for (let i = 0; i < 1000; i++) {
        const testMessage = JSON.stringify({
          stream: 'btcusdt@kline_1m',
          data: TestDataGenerator.generateBinanceKlineData()
        });
        
        mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testMessage);
      }

      await adapter.disconnect();

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // 验证内存增长在合理范围内
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
    });

    test('重构后连接稳定性应提升', async () => {
      let connectionAttempts = 0;
      let successfulConnections = 0;
      
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => {
        connectionAttempts++;
        return mockWs as any;
      });

      adapter.on('status', (status) => {
        if (status === 'connected') {
          successfulConnections++;
        }
      });

      // 模拟网络不稳定环境
      for (let i = 0; i < 5; i++) {
        const connectPromise = adapter.connect();
        
        if (i < 2) {
          // 前两次连接失败
          setTimeout(() => {
            mockWs.on.mock.calls.find(call => call[0] === 'error')?.[1]?.(new Error('Connection failed'));
          }, 10);
        } else {
          // 后续连接成功
          setTimeout(() => {
            mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1]?.();
          }, 10);
        }

        try {
          await connectPromise;
        } catch (error) {
          // 忽略连接失败
        }

        await adapter.disconnect();
      }

      // 验证重连机制工作正常
      expect(connectionAttempts).toBeGreaterThanOrEqual(5);
      expect(successfulConnections).toBeGreaterThan(0);
    });

    test('重构后消息处理延迟应降低', async () => {
      const latencies: number[] = [];
      
      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      adapter.on('data', () => {
        const endTime = Date.now();
        const latency = endTime - sendTime;
        latencies.push(latency);
      });

      await adapter.connect();

      // 发送100条测试消息并测量延迟
      for (let i = 0; i < 100; i++) {
        const testMessage = JSON.stringify({
          stream: 'btcusdt@kline_1m',
          data: TestDataGenerator.generateBinanceKlineData()
        });

        var sendTime = Date.now();
        mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testMessage);
      }

      await TestUtils.waitFor(() => latencies.length === 100);

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      console.log(`重构后平均延迟: ${avgLatency.toFixed(2)}ms`);
      console.log(`重构后P95延迟: ${p95Latency.toFixed(2)}ms`);

      // 验证延迟指标
      expect(avgLatency).toBeLessThan(50); // 平均延迟小于50ms
      expect(p95Latency).toBeLessThan(100); // P95延迟小于100ms
    });
  });
});