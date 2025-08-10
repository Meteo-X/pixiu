/**
 * DataFlowManager 测试
 * 测试统一数据流管理器的核心功能
 */

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { DataFlowManager } from '../../../src/dataflow/data-flow-manager';
import { MarketData, DataType } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { EnhancedMockFactory } from '../../utils/enhanced-mock-factory';
import { TestUtils } from '../../utils/test-utils';

// Mock接口定义
interface MockOutputChannel {
  id: string;
  name: string;
  type: string;
  send: jest.MockedFunction<(data: any) => Promise<void>>;
  close: jest.MockedFunction<() => Promise<void>>;
  getStatus: jest.MockedFunction<() => any>;
}

interface MockDataFlowConfig {
  enabled: boolean;
  batching: {
    enabled: boolean;
    batchSize: number;
    maxWaitTime: number;
  };
  performance: {
    enableBackpressure: boolean;
    backpressureThreshold: number;
    maxQueueSize: number;
  };
  monitoring: {
    enableMetrics: boolean;
    metricsInterval: number;
  };
}

describe('DataFlowManager', () => {
  let dataFlowManager: DataFlowManager;
  let mockMonitor: any;
  let mockChannels: MockOutputChannel[];
  let testConfig: MockDataFlowConfig;

  beforeEach(() => {
    dataFlowManager = new DataFlowManager();
    mockMonitor = EnhancedMockFactory.createBaseMonitorMock();
    
    // 创建测试配置
    testConfig = {
      enabled: true,
      batching: {
        enabled: true,
        batchSize: 10,
        maxWaitTime: 100
      },
      performance: {
        enableBackpressure: true,
        backpressureThreshold: 100,
        maxQueueSize: 1000
      },
      monitoring: {
        enableMetrics: true,
        metricsInterval: 1000
      }
    };

    // 创建Mock输出通道
    mockChannels = [
      createMockChannel('pubsub', 'PubSub Channel', 'pubsub'),
      createMockChannel('websocket', 'WebSocket Channel', 'websocket'),
      createMockChannel('cache', 'Cache Channel', 'cache')
    ];
  });

  afterEach(async () => {
    if (dataFlowManager) {
      await dataFlowManager.stop();
    }
    
    EnhancedMockFactory.cleanup();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await globalCache.destroy();
  });

  function createMockChannel(id: string, name: string, type: string): MockOutputChannel {
    return {
      id,
      name,
      type,
      send: jest.fn(async () => {}),
      close: jest.fn(async () => {}),
      getStatus: jest.fn(() => ({
        id,
        name,
        type,
        isActive: true,
        messagesSent: 0,
        lastActivity: Date.now()
      }))
    };
  }

  describe('Initialization', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(dataFlowManager.initialize(testConfig, mockMonitor)).resolves.not.toThrow();
      
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info', 
        'DataFlowManager initialized',
        expect.objectContaining({
          config: testConfig
        })
      );
    });

    it('should register default transformers during initialization', async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
      
      // 验证默认转换器被注册
      const logCalls = mockMonitor.log.mock.calls;
      const transformerCalls = logCalls.filter(call => 
        call[0] === 'info' && 
        call[1] === 'Data transformer registered'
      );
      
      expect(transformerCalls.length).toBeGreaterThanOrEqual(2); // Standard + Compression transformers
    });

    it('should emit started event when starting', async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
      
      const startedPromise = TestUtils.waitForEvent(dataFlowManager, 'started');
      dataFlowManager.start();
      
      await expect(startedPromise).resolves.toBeDefined();
      expect(mockMonitor.log).toHaveBeenCalledWith('info', 'DataFlowManager started');
    });
  });

  describe('Channel Management', () => {
    beforeEach(async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
    });

    it('should register output channels successfully', () => {
      const channelRegisteredPromise = TestUtils.waitForEvent(dataFlowManager, 'channelRegistered');
      
      dataFlowManager.registerChannel(mockChannels[0]);
      
      return expect(channelRegisteredPromise).resolves.toEqual(mockChannels[0]);
    });

    it('should track active channel count', () => {
      mockChannels.forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      const stats = dataFlowManager.getStats();
      expect(stats.activeChannels).toBe(mockChannels.length);
    });

    it('should unregister channels correctly', () => {
      dataFlowManager.registerChannel(mockChannels[0]);
      
      const initialStats = dataFlowManager.getStats();
      expect(initialStats.activeChannels).toBe(1);
      
      const channelUnregisteredPromise = TestUtils.waitForEvent(dataFlowManager, 'channelUnregistered');
      dataFlowManager.unregisterChannel(mockChannels[0].id);
      
      const finalStats = dataFlowManager.getStats();
      expect(finalStats.activeChannels).toBe(0);
      
      return expect(channelUnregisteredPromise).resolves.toBe(mockChannels[0].id);
    });

    it('should get channel statuses', () => {
      mockChannels.forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      const statuses = dataFlowManager.getChannelStatuses();
      expect(statuses).toHaveLength(mockChannels.length);
      
      statuses.forEach((status, index) => {
        expect(status.id).toBe(mockChannels[index].id);
        expect(status.name).toBe(mockChannels[index].name);
        expect(status.type).toBe(mockChannels[index].type);
      });
    });
  });

  describe('Data Processing', () => {
    beforeEach(async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
      mockChannels.forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });
      dataFlowManager.start();
    });

    it('should process market data successfully', async () => {
      const testData = TestUtils.createMarketData({
        symbol: 'BTCUSDT',
        type: DataType.TICKER
      });

      const dataProcessedPromise = TestUtils.waitForEvent(dataFlowManager, 'dataProcessed');
      
      await dataFlowManager.processData(testData, 'binance');
      
      const processedData = await dataProcessedPromise;
      expect(processedData).toBeDefined();
    });

    it('should handle batch processing correctly', async () => {
      const batchSize = testConfig.batching.batchSize;
      const testDataBatch = TestUtils.createMarketDataBatch(batchSize);
      
      let processedCount = 0;
      dataFlowManager.on('dataProcessed', () => {
        processedCount++;
      });

      // 发送一批数据
      for (const data of testDataBatch) {
        await dataFlowManager.processData(data);
      }

      // 等待处理完成
      await TestUtils.waitFor(() => processedCount >= batchSize, 2000);
      
      expect(processedCount).toBe(batchSize);
    });

    it('should apply data transformers', async () => {
      const testData = TestUtils.createMarketData();
      
      // 注册自定义转换器
      const mockTransformer = {
        name: 'test-transformer',
        transform: jest.fn(async (data: MarketData) => {
          return { ...data, transformed: true };
        })
      };
      
      dataFlowManager.registerTransformer(mockTransformer);
      
      await dataFlowManager.processData(testData);
      
      // 等待处理完成
      await TestUtils.sleep(100);
      
      expect(mockTransformer.transform).toHaveBeenCalledWith(
        testData,
        expect.objectContaining({
          source: undefined,
          queuedAt: expect.any(Number),
          processedAt: expect.any(Number)
        })
      );
    });

    it('should route data to appropriate channels', async () => {
      const testData = TestUtils.createMarketData();
      
      await dataFlowManager.processData(testData);
      
      // 等待处理完成
      await TestUtils.sleep(100);
      
      // 验证数据被路由到所有通道
      mockChannels.forEach(channel => {
        expect(channel.send).toHaveBeenCalled();
      });
    });
  });

  describe('Routing Rules Management', () => {
    beforeEach(async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
      mockChannels.forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });
    });

    it('should add routing rules', () => {
      const routingRule = {
        name: 'ticker-to-websocket',
        condition: (data: MarketData) => data.type === DataType.TICKER,
        targetChannels: ['websocket'],
        priority: 1
      };

      const ruleAddedPromise = TestUtils.waitForEvent(dataFlowManager, 'routingRuleAdded');
      
      dataFlowManager.addRoutingRule(routingRule);
      
      const stats = dataFlowManager.getStats();
      expect(stats.routingRules).toBe(1);
      
      return expect(ruleAddedPromise).resolves.toEqual(routingRule);
    });

    it('should remove routing rules', () => {
      const routingRule = {
        name: 'test-rule',
        condition: () => true,
        targetChannels: ['websocket'],
        priority: 1
      };

      dataFlowManager.addRoutingRule(routingRule);
      
      const ruleRemovedPromise = TestUtils.waitForEvent(dataFlowManager, 'routingRuleRemoved');
      
      dataFlowManager.removeRoutingRule('test-rule');
      
      const stats = dataFlowManager.getStats();
      expect(stats.routingRules).toBe(0);
      
      return expect(ruleRemovedPromise).resolves.toBe('test-rule');
    });
  });

  describe('Backpressure Management', () => {
    beforeEach(async () => {
      // 使用较低的阈值进行测试
      testConfig.performance.backpressureThreshold = 5;
      testConfig.performance.maxQueueSize = 10;
      
      await dataFlowManager.initialize(testConfig, mockMonitor);
      dataFlowManager.start();
    });

    it('should activate backpressure when threshold is exceeded', async () => {
      const backpressureActivatedPromise = TestUtils.waitForEvent(dataFlowManager, 'backpressureActivated');
      
      // 发送超过阈值的数据
      for (let i = 0; i < 10; i++) {
        await dataFlowManager.processData(TestUtils.createMarketData());
      }
      
      const queueSize = await backpressureActivatedPromise;
      expect(queueSize).toBeGreaterThanOrEqual(testConfig.performance.backpressureThreshold);
      
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'warn',
        'Backpressure activated',
        expect.objectContaining({
          queueSize: expect.any(Number),
          threshold: testConfig.performance.backpressureThreshold
        })
      );
    });

    it('should drop old data when queue is full', async () => {
      // 填满队列
      for (let i = 0; i < testConfig.performance.maxQueueSize + 5; i++) {
        await dataFlowManager.processData(TestUtils.createMarketData({
          data: { ...TestUtils.createMarketData().data, id: i }
        }));
      }

      const stats = dataFlowManager.getStats();
      expect(stats.currentQueueSize).toBeLessThanOrEqual(testConfig.performance.maxQueueSize);
      
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'debug',
        'Dropped old data due to queue overflow',
        expect.objectContaining({
          queueSize: expect.any(Number)
        })
      );
    });

    it('should deactivate backpressure when queue size reduces', async () => {
      // 激活背压
      for (let i = 0; i < 10; i++) {
        await dataFlowManager.processData(TestUtils.createMarketData());
      }

      await TestUtils.waitForEvent(dataFlowManager, 'backpressureActivated');
      
      // 等待队列处理
      const backpressureDeactivatedPromise = TestUtils.waitForEvent(
        dataFlowManager, 
        'backpressureDeactivated',
        5000
      );
      
      const queueSize = await backpressureDeactivatedPromise;
      expect(queueSize).toBeLessThan(testConfig.performance.backpressureThreshold);
      
      const stats = dataFlowManager.getStats();
      expect(stats.backpressureActive).toBe(false);
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
      mockChannels.forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });
      dataFlowManager.start();
    });

    it('should track processing statistics', async () => {
      const testDataBatch = TestUtils.createMarketDataBatch(20);
      
      // 处理数据批次
      for (const data of testDataBatch) {
        await dataFlowManager.processData(data);
      }
      
      // 等待处理完成
      await TestUtils.sleep(200);
      
      const stats = dataFlowManager.getStats();
      expect(stats.totalProcessed).toBeGreaterThan(0);
      expect(stats.totalSent).toBeGreaterThan(0);
      expect(stats.averageLatency).toBeGreaterThanOrEqual(0);
      expect(stats.lastActivity).toBeGreaterThan(0);
    });

    it('should calculate average latency correctly', async () => {
      const testData = TestUtils.createMarketData();
      
      // 模拟一些延迟
      const originalSend = mockChannels[0].send;
      mockChannels[0].send = jest.fn(async () => {
        await TestUtils.sleep(10);
      });
      
      await dataFlowManager.processData(testData);
      
      // 等待处理完成
      await TestUtils.sleep(100);
      
      const stats = dataFlowManager.getStats();
      expect(stats.averageLatency).toBeGreaterThan(0);
      expect(stats.averageLatency).toBeLessThan(100); // 应该在合理范围内
      
      mockChannels[0].send = originalSend;
    });

    it('should update metrics regularly', async () => {
      let statsUpdateCount = 0;
      
      dataFlowManager.on('statsUpdated', () => {
        statsUpdateCount++;
      });
      
      // 配置了1秒的指标间隔，等待至少一次更新
      await TestUtils.waitFor(() => statsUpdateCount > 0, 1500);
      
      expect(statsUpdateCount).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
      mockChannels.forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });
      dataFlowManager.start();
    });

    it('should handle transformer errors gracefully', async () => {
      const faultyTransformer = {
        name: 'faulty-transformer',
        transform: jest.fn(async () => {
          throw new Error('Transformation failed');
        })
      };
      
      dataFlowManager.registerTransformer(faultyTransformer);
      
      const testData = TestUtils.createMarketData();
      
      // 应该不抛出异常
      await expect(dataFlowManager.processData(testData)).resolves.not.toThrow();
      
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'error',
        'Data transformation error',
        expect.objectContaining({
          transformerName: 'faulty-transformer',
          error: 'Transformation failed'
        })
      );
    });

    it('should handle channel send errors', async () => {
      const errorEvents: any[] = [];
      
      dataFlowManager.on('processingError', (error, data) => {
        errorEvents.push({ error, data });
      });
      
      // 模拟通道发送失败
      mockChannels[0].send = jest.fn(async () => {
        throw new Error('Channel send failed');
      });
      
      const testData = TestUtils.createMarketData();
      await dataFlowManager.processData(testData);
      
      // 等待错误处理
      await TestUtils.waitFor(() => errorEvents.length > 0, 1000);
      
      expect(errorEvents[0].error.message).toContain('Channel send failed');
      expect(errorEvents[0].data).toEqual(testData);
    });

    it('should track error statistics', async () => {
      // 模拟通道错误
      mockChannels[0].send = jest.fn(async () => {
        throw new Error('Send error');
      });
      
      const testData = TestUtils.createMarketData();
      await dataFlowManager.processData(testData);
      
      // 等待处理完成
      await TestUtils.sleep(100);
      
      const stats = dataFlowManager.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
    });
  });

  describe('Lifecycle Management', () => {
    it('should stop gracefully', async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
      mockChannels.forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });
      dataFlowManager.start();
      
      // 添加一些待处理的数据
      for (let i = 0; i < 5; i++) {
        await dataFlowManager.processData(TestUtils.createMarketData());
      }
      
      const stoppedPromise = TestUtils.waitForEvent(dataFlowManager, 'stopped');
      
      await dataFlowManager.stop();
      
      await expect(stoppedPromise).resolves.toBeDefined();
      
      expect(mockMonitor.log).toHaveBeenCalledWith('info', 'DataFlowManager stopped');
      
      // 验证所有通道都被关闭
      mockChannels.forEach(channel => {
        expect(channel.close).toHaveBeenCalled();
      });
    });

    it('should drain queue before stopping', async () => {
      await dataFlowManager.initialize(testConfig, mockMonitor);
      mockChannels.forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });
      dataFlowManager.start();
      
      // 添加数据到队列
      const testDataBatch = TestUtils.createMarketDataBatch(10);
      for (const data of testDataBatch) {
        await dataFlowManager.processData(data);
      }
      
      const initialStats = dataFlowManager.getStats();
      const initialQueueSize = initialStats.currentQueueSize;
      
      expect(initialQueueSize).toBeGreaterThan(0);
      
      await dataFlowManager.stop();
      
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Draining processing queue',
        expect.objectContaining({
          remainingItems: expect.any(Number)
        })
      );
    });
  });
});