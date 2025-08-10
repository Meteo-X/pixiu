/**
 * MessageRouter 测试
 * 测试智能消息路由器的功能
 */

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { MessageRouter } from '../../../src/dataflow/routing/message-router';
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

interface RoutingRule {
  name: string;
  condition: (data: MarketData) => boolean;
  targetChannels: string[];
  priority: number;
}

describe('MessageRouter', () => {
  let messageRouter: MessageRouter;
  let mockMonitor: any;
  let mockChannels: MockOutputChannel[];

  beforeEach(() => {
    mockMonitor = EnhancedMockFactory.createBaseMonitorMock();
    messageRouter = new MessageRouter(mockMonitor);
    
    // 创建Mock输出通道
    mockChannels = [
      createMockChannel('pubsub', 'PubSub Channel', 'pubsub'),
      createMockChannel('websocket', 'WebSocket Channel', 'websocket'),
      createMockChannel('cache', 'Cache Channel', 'cache'),
      createMockChannel('analytics', 'Analytics Channel', 'analytics')
    ];

    // 注册所有通道
    mockChannels.forEach(channel => {
      messageRouter.registerChannel(channel);
    });
  });

  afterEach(() => {
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

  describe('Channel Management', () => {
    it('should register channels successfully', () => {
      const newRouter = new MessageRouter(mockMonitor);
      const testChannel = createMockChannel('test', 'Test Channel', 'test');
      
      newRouter.registerChannel(testChannel);
      
      const channels = newRouter.getChannels();
      expect(channels).toHaveLength(1);
      expect(channels[0]).toBe(testChannel);
    });

    it('should unregister channels successfully', () => {
      const initialChannelCount = messageRouter.getChannels().length;
      
      messageRouter.unregisterChannel(mockChannels[0].id);
      
      const remainingChannels = messageRouter.getChannels();
      expect(remainingChannels).toHaveLength(initialChannelCount - 1);
      expect(remainingChannels.find(ch => ch.id === mockChannels[0].id)).toBeUndefined();
    });

    it('should handle duplicate channel registration', () => {
      const duplicateChannel = { ...mockChannels[0] };
      
      // 尝试注册重复通道应该替换原有通道
      messageRouter.registerChannel(duplicateChannel);
      
      const channels = messageRouter.getChannels();
      const matchingChannels = channels.filter(ch => ch.id === mockChannels[0].id);
      expect(matchingChannels).toHaveLength(1);
    });

    it('should ignore unregistering non-existent channels', () => {
      const initialChannelCount = messageRouter.getChannels().length;
      
      messageRouter.unregisterChannel('non-existent-channel');
      
      const finalChannelCount = messageRouter.getChannels().length;
      expect(finalChannelCount).toBe(initialChannelCount);
    });
  });

  describe('Routing Rules Management', () => {
    it('should add routing rules successfully', () => {
      const rule: RoutingRule = {
        name: 'ticker-to-websocket',
        condition: (data: MarketData) => data.type === DataType.TICKER,
        targetChannels: ['websocket'],
        priority: 1
      };

      messageRouter.addRule(rule);
      
      // 通过尝试路由来验证规则是否生效
      const tickerData = TestUtils.createMarketData({
        type: DataType.TICKER,
        symbol: 'BTCUSDT'
      });

      return new Promise<void>((resolve) => {
        messageRouter.on('dataRouted', (data: MarketData, channelIds: string[]) => {
          expect(channelIds).toContain('websocket');
          expect(data).toBe(tickerData);
          resolve();
        });

        messageRouter.route(tickerData);
      });
    });

    it('should prioritize rules correctly', async () => {
      const routedChannels: string[][] = [];
      
      messageRouter.on('dataRouted', (data: MarketData, channelIds: string[]) => {
        routedChannels.push(channelIds);
      });

      // 添加低优先级规则
      messageRouter.addRule({
        name: 'low-priority',
        condition: (data: MarketData) => data.symbol === 'BTCUSDT',
        targetChannels: ['cache'],
        priority: 1
      });

      // 添加高优先级规则
      messageRouter.addRule({
        name: 'high-priority',
        condition: (data: MarketData) => data.symbol === 'BTCUSDT',
        targetChannels: ['pubsub'],
        priority: 10
      });

      const testData = TestUtils.createMarketData({
        symbol: 'BTCUSDT',
        type: DataType.TICKER
      });

      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(routedChannels[0]).toContain('pubsub'); // 高优先级规则先执行
    });

    it('should remove routing rules successfully', async () => {
      const rule: RoutingRule = {
        name: 'test-rule',
        condition: (data: MarketData) => data.symbol === 'TESTUSDT',
        targetChannels: ['websocket'],
        priority: 1
      };

      messageRouter.addRule(rule);
      messageRouter.removeRule('test-rule');

      let routeEventTriggered = false;
      messageRouter.on('dataRouted', () => {
        routeEventTriggered = true;
      });

      const testData = TestUtils.createMarketData({
        symbol: 'TESTUSDT'
      });

      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(routeEventTriggered).toBe(false);
    });

    it('should handle complex routing conditions', async () => {
      const routedData: MarketData[] = [];
      
      messageRouter.on('dataRouted', (data: MarketData) => {
        routedData.push(data);
      });

      // 复杂条件：BTC相关且价格大于50000
      messageRouter.addRule({
        name: 'btc-high-price',
        condition: (data: MarketData) => {
          return data.symbol.includes('BTC') && 
                 parseFloat(data.data.price || '0') > 50000;
        },
        targetChannels: ['analytics'],
        priority: 1
      });

      // 测试符合条件的数据
      const highPriceBtc = TestUtils.createMarketData({
        symbol: 'BTCUSDT',
        data: { price: '55000.00' }
      });

      // 测试不符合条件的数据
      const lowPriceBtc = TestUtils.createMarketData({
        symbol: 'BTCUSDT',
        data: { price: '45000.00' }
      });

      const nonBtc = TestUtils.createMarketData({
        symbol: 'ETHUSDT',
        data: { price: '60000.00' }
      });

      await messageRouter.route(highPriceBtc);
      await messageRouter.route(lowPriceBtc);
      await messageRouter.route(nonBtc);
      await TestUtils.sleep(100);

      expect(routedData).toHaveLength(1);
      expect(routedData[0].symbol).toBe('BTCUSDT');
      expect(routedData[0].data.price).toBe('55000.00');
    });
  });

  describe('Data Routing', () => {
    beforeEach(() => {
      // 设置基础路由规则
      messageRouter.addRule({
        name: 'ticker-to-websocket',
        condition: (data: MarketData) => data.type === DataType.TICKER,
        targetChannels: ['websocket'],
        priority: 1
      });

      messageRouter.addRule({
        name: 'all-to-cache',
        condition: () => true,
        targetChannels: ['cache'],
        priority: 0
      });
    });

    it('should route data to appropriate channels', async () => {
      const tickerData = TestUtils.createMarketData({
        type: DataType.TICKER,
        symbol: 'BTCUSDT'
      });

      await messageRouter.route(tickerData);
      await TestUtils.sleep(50);

      // 应该路由到websocket（匹配ticker规则）和cache（匹配所有数据规则）
      expect(mockChannels.find(ch => ch.id === 'websocket')!.send).toHaveBeenCalledWith(tickerData);
      expect(mockChannels.find(ch => ch.id === 'cache')!.send).toHaveBeenCalledWith(tickerData);
    });

    it('should handle routing to multiple channels', async () => {
      messageRouter.addRule({
        name: 'btc-to-multiple',
        condition: (data: MarketData) => data.symbol.includes('BTC'),
        targetChannels: ['pubsub', 'analytics'],
        priority: 2
      });

      const btcData = TestUtils.createMarketData({
        symbol: 'BTCUSDT'
      });

      await messageRouter.route(btcData);
      await TestUtils.sleep(50);

      expect(mockChannels.find(ch => ch.id === 'pubsub')!.send).toHaveBeenCalledWith(btcData);
      expect(mockChannels.find(ch => ch.id === 'analytics')!.send).toHaveBeenCalledWith(btcData);
    });

    it('should handle routing when no rules match', async () => {
      // 移除所有规则
      messageRouter.removeRule('ticker-to-websocket');
      messageRouter.removeRule('all-to-cache');

      let routeEventTriggered = false;
      messageRouter.on('dataRouted', () => {
        routeEventTriggered = true;
      });

      const testData = TestUtils.createMarketData();
      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(routeEventTriggered).toBe(false);
      
      // 验证没有通道收到数据
      mockChannels.forEach(channel => {
        expect(channel.send).not.toHaveBeenCalled();
      });
    });

    it('should handle routing to non-existent channels', async () => {
      let errorEventTriggered = false;
      
      messageRouter.on('routingError', (error: Error) => {
        errorEventTriggered = true;
        expect(error.message).toContain('Channel not found');
      });

      messageRouter.addRule({
        name: 'non-existent-channel',
        condition: () => true,
        targetChannels: ['non-existent'],
        priority: 1
      });

      const testData = TestUtils.createMarketData();
      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(errorEventTriggered).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      messageRouter.addRule({
        name: 'test-rule',
        condition: () => true,
        targetChannels: ['websocket', 'cache'],
        priority: 1
      });
    });

    it('should handle channel send errors', async () => {
      const channelErrors: { channelId: string; error: Error }[] = [];
      
      messageRouter.on('channelError', (channelId: string, error: Error) => {
        channelErrors.push({ channelId, error });
      });

      // 模拟websocket通道发送失败
      mockChannels.find(ch => ch.id === 'websocket')!.send = jest.fn(async () => {
        throw new Error('WebSocket send failed');
      });

      const testData = TestUtils.createMarketData();
      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(channelErrors).toHaveLength(1);
      expect(channelErrors[0].channelId).toBe('websocket');
      expect(channelErrors[0].error.message).toBe('WebSocket send failed');

      // 其他通道应该仍然正常工作
      expect(mockChannels.find(ch => ch.id === 'cache')!.send).toHaveBeenCalledWith(testData);
    });

    it('should handle rule condition errors', async () => {
      let routingErrorTriggered = false;
      
      messageRouter.on('routingError', (error: Error) => {
        routingErrorTriggered = true;
        expect(error.message).toContain('condition evaluation failed');
      });

      // 添加会抛出异常的规则条件
      messageRouter.addRule({
        name: 'faulty-rule',
        condition: () => {
          throw new Error('Condition evaluation failed');
        },
        targetChannels: ['websocket'],
        priority: 10
      });

      const testData = TestUtils.createMarketData();
      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(routingErrorTriggered).toBe(true);
      
      // 应该记录错误
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'error',
        'Routing rule condition error',
        expect.objectContaining({
          ruleName: 'faulty-rule',
          error: expect.any(String)
        })
      );
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency routing efficiently', async () => {
      messageRouter.addRule({
        name: 'high-freq-rule',
        condition: () => true,
        targetChannels: ['cache'],
        priority: 1
      });

      const messageCount = 1000;
      const startTime = Date.now();

      // 并发发送大量消息
      const promises = [];
      for (let i = 0; i < messageCount; i++) {
        const data = TestUtils.createMarketData({
          data: { ...TestUtils.createMarketData().data, id: i }
        });
        promises.push(messageRouter.route(data));
      }

      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (messageCount * 1000) / duration;

      expect(throughput).toBeGreaterThan(500); // 至少500 msg/sec
      expect(mockChannels.find(ch => ch.id === 'cache')!.send).toHaveBeenCalledTimes(messageCount);
    });

    it('should maintain performance with many routing rules', async () => {
      // 添加大量路由规则
      for (let i = 0; i < 100; i++) {
        messageRouter.addRule({
          name: `rule-${i}`,
          condition: (data: MarketData) => data.data.id === i,
          targetChannels: ['cache'],
          priority: i
        });
      }

      const testData = TestUtils.createMarketData({
        data: { ...TestUtils.createMarketData().data, id: 50 }
      });

      const startTime = Date.now();
      await messageRouter.route(testData);
      const endTime = Date.now();

      const latency = endTime - startTime;
      expect(latency).toBeLessThan(100); // 路由延迟应该小于100ms

      expect(mockChannels.find(ch => ch.id === 'cache')!.send).toHaveBeenCalledWith(testData);
    });
  });

  describe('Event System', () => {
    it('should emit dataRouted event correctly', async () => {
      let eventData: any = null;
      let eventChannels: string[] = [];
      
      messageRouter.on('dataRouted', (data: MarketData, channelIds: string[]) => {
        eventData = data;
        eventChannels = channelIds;
      });

      messageRouter.addRule({
        name: 'test-rule',
        condition: () => true,
        targetChannels: ['websocket', 'cache'],
        priority: 1
      });

      const testData = TestUtils.createMarketData();
      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(eventData).toBe(testData);
      expect(eventChannels).toEqual(['websocket', 'cache']);
    });

    it('should emit channelError events for failed sends', async () => {
      const errorEvents: Array<{channelId: string, error: Error}> = [];
      
      messageRouter.on('channelError', (channelId: string, error: Error) => {
        errorEvents.push({ channelId, error });
      });

      messageRouter.addRule({
        name: 'error-test',
        condition: () => true,
        targetChannels: ['websocket'],
        priority: 1
      });

      // 模拟发送失败
      mockChannels.find(ch => ch.id === 'websocket')!.send = jest.fn(async () => {
        throw new Error('Send failed');
      });

      const testData = TestUtils.createMarketData();
      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].channelId).toBe('websocket');
      expect(errorEvents[0].error.message).toBe('Send failed');
    });

    it('should emit routingError events for routing failures', async () => {
      const routingErrors: Error[] = [];
      
      messageRouter.on('routingError', (error: Error) => {
        routingErrors.push(error);
      });

      // 添加无效的路由规则
      messageRouter.addRule({
        name: 'invalid-channel-rule',
        condition: () => true,
        targetChannels: ['invalid-channel'],
        priority: 1
      });

      const testData = TestUtils.createMarketData();
      await messageRouter.route(testData);
      await TestUtils.sleep(50);

      expect(routingErrors).toHaveLength(1);
      expect(routingErrors[0].message).toContain('Channel not found');
    });
  });
});