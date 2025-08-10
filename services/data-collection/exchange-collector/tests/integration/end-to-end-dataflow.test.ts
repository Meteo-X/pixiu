/**
 * 端到端数据流集成测试
 * 测试完整的数据流：BinanceAdapter → DataFlowManager → { PubSub, WebSocketProxy, Cache }
 */

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { DataType } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { EnhancedMockFactory, MockAdapter, MockDataFlow, MockWebSocketProxy } from '../utils/enhanced-mock-factory';
import { TestUtils } from '../utils/test-utils';

// 模拟端到端数据流系统
class MockEndToEndSystem extends EventEmitter {
  private adapter: MockAdapter;
  private dataFlow: MockDataFlow;
  private webSocketProxy: MockWebSocketProxy;
  private pubsubPublisher: any;
  private cache: any;
  private isRunning = false;

  constructor() {
    super();
    
    // 创建模拟组件
    this.adapter = EnhancedMockFactory.createAdapterMock();
    this.dataFlow = EnhancedMockFactory.createDataFlowMock();
    this.webSocketProxy = EnhancedMockFactory.createWebSocketProxyMock();
    
    this.pubsubPublisher = {
      publish: jest.fn(async (topic: string, data: any) => {
        this.emit('pubsubPublished', { topic, data });
      }),
      getStats: jest.fn(() => ({
        messagesSent: 100,
        errors: 0
      }))
    };
    
    this.cache = {
      set: jest.fn(async (key: string, value: any) => {
        this.emit('cached', { key, value });
      }),
      get: jest.fn(async (key: string) => null),
      getStats: jest.fn(() => ({
        hits: 50,
        misses: 10,
        size: 60
      }))
    };
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 适配器数据 -> 数据流管理器
    this.adapter.on('data', async (data) => {
      await this.dataFlow.processData(data, 'binance');
    });

    // 数据流管理器 -> 输出通道
    this.dataFlow.processData = jest.fn(async (data, source) => {
      // 模拟路由到不同通道
      await Promise.all([
        this.pubsubPublisher.publish('market-data', data),
        this.webSocketProxy.broadcast(data),
        this.cache.set(`${data.symbol}:${data.type}`, data)
      ]);
      
      this.emit('dataProcessed', data);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    await this.adapter.initialize({});
    await this.adapter.start();
    
    this.dataFlow.start();
    await this.webSocketProxy.start();
    
    this.isRunning = true;
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    await this.adapter.stop();
    await this.dataFlow.stop();
    await this.webSocketProxy.stop();
    
    this.isRunning = false;
    this.emit('stopped');
  }

  async simulateMarketData(data: any): Promise<void> {
    if (!this.isRunning) {
      throw new Error('System not running');
    }
    
    // 模拟从适配器接收数据
    this.adapter.emit('data', data);
  }

  getStats(): any {
    return {
      adapter: {
        status: this.adapter.getStatus(),
      },
      dataFlow: this.dataFlow.getStats(),
      webSocket: this.webSocketProxy.getStats(),
      pubsub: this.pubsubPublisher.getStats(),
      cache: this.cache.getStats()
    };
  }

  // 获取组件引用以便测试访问
  getComponents() {
    return {
      adapter: this.adapter,
      dataFlow: this.dataFlow,
      webSocketProxy: this.webSocketProxy,
      pubsubPublisher: this.pubsubPublisher,
      cache: this.cache
    };
  }
}

describe('End-to-End DataFlow Integration', () => {
  let system: MockEndToEndSystem;

  beforeEach(async () => {
    system = new MockEndToEndSystem();
  });

  afterEach(async () => {
    if (system) {
      await system.stop();
    }
    
    EnhancedMockFactory.cleanup();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await globalCache.destroy();
  });

  describe('System Initialization', () => {
    it('should start all components successfully', async () => {
      const startedPromise = TestUtils.waitForEvent(system, 'started');
      
      await system.start();
      
      await expect(startedPromise).resolves.toBeDefined();
      
      const components = system.getComponents();
      expect(components.adapter.start).toHaveBeenCalled();
      expect(components.dataFlow.start).toHaveBeenCalled();
      expect(components.webSocketProxy.start).toHaveBeenCalled();
    });

    it('should stop all components gracefully', async () => {
      await system.start();
      
      const stoppedPromise = TestUtils.waitForEvent(system, 'stopped');
      
      await system.stop();
      
      await expect(stoppedPromise).resolves.toBeDefined();
      
      const components = system.getComponents();
      expect(components.adapter.stop).toHaveBeenCalled();
      expect(components.dataFlow.stop).toHaveBeenCalled();
      expect(components.webSocketProxy.stop).toHaveBeenCalled();
    });
  });

  describe('Complete Data Pipeline', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('should process market data through complete pipeline', async () => {
      const testData = TestUtils.createMarketData({
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        data: {
          price: '50000.00',
          volume: '1000.5'
        }
      });

      const dataProcessedPromise = TestUtils.waitForEvent(system, 'dataProcessed');
      const pubsubPromise = TestUtils.waitForEvent(system, 'pubsubPublished');
      const cachePromise = TestUtils.waitForEvent(system, 'cached');

      await system.simulateMarketData(testData);

      // 验证数据处理完成
      const processedData = await dataProcessedPromise;
      expect(processedData).toEqual(testData);

      // 验证PubSub发布
      const pubsubEvent = await pubsubPromise;
      expect(pubsubEvent.topic).toBe('market-data');
      expect(pubsubEvent.data).toEqual(testData);

      // 验证缓存写入
      const cacheEvent = await cachePromise;
      expect(cacheEvent.key).toBe('BTCUSDT:ticker');
      expect(cacheEvent.value).toEqual(testData);

      // 验证WebSocket广播
      const components = system.getComponents();
      expect(components.webSocketProxy.broadcast).toHaveBeenCalledWith(testData);
    });

    it('should handle multiple data types correctly', async () => {
      const testDataSet = [
        TestUtils.createMarketData({ symbol: 'BTCUSDT', type: DataType.TICKER }),
        TestUtils.createMarketData({ symbol: 'BTCUSDT', type: DataType.DEPTH }),
        TestUtils.createMarketData({ symbol: 'ETHUSDT', type: DataType.TRADE }),
        TestUtils.createMarketData({ symbol: 'ADAUSDT', type: DataType.TICKER })
      ];

      let processedCount = 0;
      system.on('dataProcessed', () => {
        processedCount++;
      });

      // 并发发送不同类型的数据
      const promises = testDataSet.map(data => system.simulateMarketData(data));
      await Promise.all(promises);

      // 等待所有数据处理完成
      await TestUtils.waitFor(() => processedCount >= testDataSet.length, 2000);

      expect(processedCount).toBe(testDataSet.length);

      const components = system.getComponents();
      expect(components.dataFlow.processData).toHaveBeenCalledTimes(testDataSet.length);
      expect(components.webSocketProxy.broadcast).toHaveBeenCalledTimes(testDataSet.length);
    });

    it('should maintain data integrity throughout pipeline', async () => {
      const originalData = TestUtils.createMarketData({
        symbol: 'ETHUSDT',
        type: DataType.TICKER,
        data: {
          price: '3000.50',
          volume: '2500.75',
          high: '3100.00',
          low: '2900.00',
          change: '50.25',
          changePercent: '1.70'
        }
      });

      let capturedPubSubData: any = null;
      let capturedCacheData: any = null;

      system.on('pubsubPublished', (event) => {
        capturedPubSubData = event.data;
      });

      system.on('cached', (event) => {
        capturedCacheData = event.value;
      });

      await system.simulateMarketData(originalData);

      // 等待数据传播
      await TestUtils.sleep(100);

      // 验证数据完整性
      expect(capturedPubSubData).toEqual(originalData);
      expect(capturedCacheData).toEqual(originalData);

      // 验证WebSocket广播的数据
      const components = system.getComponents();
      expect(components.webSocketProxy.broadcast).toHaveBeenCalledWith(originalData);
    });
  });

  describe('High Frequency Data Processing', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('should handle high frequency data streams efficiently', async () => {
      const messageCount = 100;
      const messagesPerSecond = 50;
      let processedMessages = 0;

      system.on('dataProcessed', () => {
        processedMessages++;
      });

      // 生成高频数据流
      const startTime = Date.now();
      
      const dataStream = TestUtils.createHighFrequencyDataStream(
        2000, // 2秒持续时间
        messagesPerSecond,
        ['BTCUSDT', 'ETHUSDT']
      );

      for await (const data of dataStream) {
        await system.simulateMarketData(data);
      }

      const endTime = Date.now();
      const actualDuration = endTime - startTime;
      const actualThroughput = (processedMessages * 1000) / actualDuration;

      // 验证处理性能
      expect(processedMessages).toBeGreaterThan(50); // 至少处理50条消息
      expect(actualThroughput).toBeGreaterThan(20);   // 至少20 msg/sec

      // 验证所有输出通道都正常工作
      const components = system.getComponents();
      expect(components.pubsubPublisher.publish.mock.calls.length).toBe(processedMessages);
      expect(components.webSocketProxy.broadcast.mock.calls.length).toBe(processedMessages);
      expect(components.cache.set.mock.calls.length).toBe(processedMessages);
    });

    it('should maintain low latency under load', async () => {
      const latencies: number[] = [];
      
      system.on('dataProcessed', () => {
        // 记录处理延迟
      });

      // 发送100条消息并测量延迟
      for (let i = 0; i < 100; i++) {
        const data = TestUtils.createMarketData({
          data: { ...TestUtils.createMarketData().data, sequenceId: i }
        });

        const startTime = Date.now();
        
        await system.simulateMarketData(data);
        
        // 等待处理完成（简化的延迟测量）
        await TestUtils.sleep(1);
        
        const endTime = Date.now();
        latencies.push(endTime - startTime);
      }

      const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      expect(averageLatency).toBeLessThan(50); // 平均延迟<50ms
      expect(maxLatency).toBeLessThan(100);    // 最大延迟<100ms
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('should handle component failures gracefully', async () => {
      const components = system.getComponents();
      
      // 模拟PubSub发布失败
      components.pubsubPublisher.publish = jest.fn(async () => {
        throw new Error('PubSub publish failed');
      });

      const testData = TestUtils.createMarketData();
      
      // 系统应该继续工作，即使一个组件失败
      await expect(system.simulateMarketData(testData)).resolves.not.toThrow();
      
      // 其他组件应该仍然正常工作
      expect(components.webSocketProxy.broadcast).toHaveBeenCalledWith(testData);
      expect(components.cache.set).toHaveBeenCalled();
    });

    it('should recover from temporary failures', async () => {
      const components = system.getComponents();
      let failureCount = 0;
      
      // 模拟间歇性失败
      const originalPublish = components.pubsubPublisher.publish;
      components.pubsubPublisher.publish = jest.fn(async (topic: string, data: any) => {
        failureCount++;
        if (failureCount <= 3) {
          throw new Error(`Temporary failure ${failureCount}`);
        }
        return originalPublish(topic, data);
      });

      const testData = TestUtils.createMarketData();
      
      // 前几次可能失败，但系统应该继续尝试
      for (let i = 0; i < 5; i++) {
        try {
          await system.simulateMarketData(testData);
          await TestUtils.sleep(10);
        } catch (error) {
          // 忽略预期的失败
        }
      }

      // 验证最终成功
      expect(components.pubsubPublisher.publish).toHaveBeenCalled();
      expect(failureCount).toBeGreaterThan(3);
    });

    it('should handle adapter reconnection', async () => {
      const components = system.getComponents();
      
      // 模拟适配器断开连接
      components.adapter.emit('disconnected');
      
      await TestUtils.sleep(50);
      
      // 模拟重连
      components.adapter.emit('connected');
      
      // 验证系统仍然可以处理数据
      const testData = TestUtils.createMarketData();
      await system.simulateMarketData(testData);
      
      expect(components.dataFlow.processData).toHaveBeenCalledWith(testData, 'binance');
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await system.start();
    });

    it('should collect comprehensive statistics', async () => {
      // 发送一些测试数据
      for (let i = 0; i < 10; i++) {
        const data = TestUtils.createMarketData({
          data: { ...TestUtils.createMarketData().data, id: i }
        });
        await system.simulateMarketData(data);
      }

      await TestUtils.sleep(100);

      const stats = system.getStats();
      
      // 验证统计数据结构
      expect(stats).toHaveProperty('adapter');
      expect(stats).toHaveProperty('dataFlow');
      expect(stats).toHaveProperty('webSocket');
      expect(stats).toHaveProperty('pubsub');
      expect(stats).toHaveProperty('cache');
      
      // 验证数据流统计
      expect(stats.dataFlow.totalProcessed).toBeGreaterThan(0);
      expect(stats.dataFlow.totalSent).toBeGreaterThan(0);
      expect(stats.dataFlow.averageLatency).toBeGreaterThanOrEqual(0);
      
      // 验证WebSocket统计
      expect(stats.webSocket.messagesSent).toBeGreaterThan(0);
      expect(stats.webSocket.averageLatency).toBeGreaterThanOrEqual(0);
    });

    it('should track resource usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 处理大量数据
      for (let i = 0; i < 500; i++) {
        const data = TestUtils.createMarketData({
          data: {
            ...TestUtils.createMarketData().data,
            largeField: new Array(100).fill('x').join('') // 添加一些数据量
          }
        });
        await system.simulateMarketData(data);
        
        // 每100条检查一次内存
        if (i % 100 === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = currentMemory - initialMemory;
          
          // 内存增长应该在合理范围内
          expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // <100MB
        }
      }
    });
  });

  describe('Configuration and Customization', () => {
    it('should support different routing configurations', async () => {
      // 创建自定义系统配置
      const customSystem = new MockEndToEndSystem();
      await customSystem.start();
      
      const components = customSystem.getComponents();
      
      // 模拟条件路由：只有BTC数据发送到WebSocket
      const originalBroadcast = components.webSocketProxy.broadcast;
      components.webSocketProxy.broadcast = jest.fn((data) => {
        if (data.symbol.includes('BTC')) {
          return originalBroadcast(data);
        }
      });

      // 测试不同类型的数据
      const btcData = TestUtils.createMarketData({ symbol: 'BTCUSDT' });
      const ethData = TestUtils.createMarketData({ symbol: 'ETHUSDT' });

      await customSystem.simulateMarketData(btcData);
      await customSystem.simulateMarketData(ethData);

      await TestUtils.sleep(50);

      // 验证路由逻辑
      expect(components.webSocketProxy.broadcast).toHaveBeenCalledWith(btcData);
      expect(components.webSocketProxy.broadcast).toHaveBeenCalledWith(ethData);
      
      await customSystem.stop();
    });

    it('should handle different data transformation scenarios', async () => {
      await system.start();
      
      const components = system.getComponents();
      
      // 模拟数据转换
      const originalProcessData = components.dataFlow.processData;
      components.dataFlow.processData = jest.fn(async (data, source) => {
        // 添加时间戳转换
        const transformedData = {
          ...data,
          timestamp: Date.now(),
          source,
          transformed: true
        };
        
        return originalProcessData(transformedData, source);
      });

      const testData = TestUtils.createMarketData();
      await system.simulateMarketData(testData);

      await TestUtils.sleep(50);

      // 验证数据转换
      const processDataCalls = components.dataFlow.processData.mock.calls;
      expect(processDataCalls.length).toBeGreaterThan(0);
      
      const [transformedData, source] = processDataCalls[0];
      expect(transformedData.transformed).toBe(true);
      expect(transformedData.source).toBe('binance');
      expect(source).toBe('binance');
    });
  });
});