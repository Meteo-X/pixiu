/**
 * Integration Tests for Event System (Task 2.2)
 * 
 * 验证事件系统集成和通信的测试
 * 
 * 测试范围:
 * - ✅ 事件发布和订阅机制
 * - ✅ 事件数据完整性和格式
 * - ✅ 异步事件处理
 * - ✅ 事件序列和时序
 * - ✅ 错误事件处理
 * - ✅ 性能事件监控
 * - ✅ 事件系统可靠性
 */

import { EventEmitter } from 'events';
import { SubscriptionManager } from '../../../../../src/subscription/SubscriptionManager';
import { 
  SubscriptionManagerConfig,
  SubscriptionStatus,
  SubscriptionEvent,
  SubscriptionEventData,
  BinanceStreamSubscription
} from '../../../../../src/subscription/interfaces';
import { DataType } from '../../../../../src/types';

describe('Event System Integration Tests', () => {
  let subscriptionManager: SubscriptionManager;
  let mockConfig: SubscriptionManagerConfig;

  beforeEach(async () => {
    subscriptionManager = new SubscriptionManager();
    
    mockConfig = testUtils.createTestConfig({
      baseWsUrl: 'wss://stream.binance.com:9443',
      maxStreamsPerConnection: 100,
      subscriptionTimeout: 5000,
      autoResubscribe: true,
      retryConfig: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: true
      },
      validation: {
        strictValidation: true,
        symbolPattern: /^[A-Z0-9]+$/,
        maxSubscriptions: 1000,
        disabledDataTypes: []
      }
    });

    await subscriptionManager.initialize(mockConfig);
  });

  afterEach(async () => {
    if (subscriptionManager) {
      await subscriptionManager.destroy();
    }
  });

  describe('IT-2.2.7: 基础事件发布订阅', () => {
    it('应该正确发布和接收订阅添加事件', async () => {
      const eventDataCollected: any[] = [];

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        eventDataCollected.push(data);
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      expect(eventDataCollected).toHaveLength(1);
      
      const eventData = eventDataCollected[0];
      expect(eventData).toHaveProperty('result');
      expect(eventData).toHaveProperty('timestamp');
      expect(eventData.result).toBeValidSubscriptionResult();
      expect(eventData.result.successful).toHaveLength(1);
    });

    it('应该正确发布和接收订阅移除事件', async () => {
      const addedEvents: any[] = [];
      const removedEvents: any[] = [];

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        addedEvents.push(data);
      });

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_REMOVED, (data) => {
        removedEvents.push(data);
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 添加订阅
      await subscriptionManager.subscribe([subscription]);
      expect(addedEvents).toHaveLength(1);

      // 移除订阅
      await subscriptionManager.unsubscribe([subscription]);
      expect(removedEvents).toHaveLength(1);

      const removeEventData = removedEvents[0];
      expect(removeEventData).toHaveProperty('result');
      expect(removeEventData).toHaveProperty('timestamp');
      expect(removeEventData.result.successful).toHaveLength(1);
    });

    it('应该正确发布流数据接收事件', async () => {
      const dataEvents: any[] = [];

      subscriptionManager.on(SubscriptionEvent.STREAM_DATA_RECEIVED, (data) => {
        dataEvents.push(data);
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 模拟流数据
      const mockData = { 
        e: 'trade', 
        s: 'BTCUSDT', 
        p: '50000', 
        q: '0.1',
        T: Date.now()
      };

      subscriptionManager.handleStreamData('btcusdt@trade', mockData, 'connection-1');

      expect(dataEvents).toHaveLength(1);
      
      const eventData = dataEvents[0];
      expect(eventData).toHaveProperty('streamName', 'btcusdt@trade');
      expect(eventData).toHaveProperty('data', mockData);
      expect(eventData).toHaveProperty('connectionId', 'connection-1');
      expect(eventData).toHaveProperty('messageCount', 1);
    });

    it('应该正确发布订阅错误事件', async () => {
      const errorEvents: any[] = [];

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ERROR, (data) => {
        errorEvents.push(data);
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 模拟错误
      const mockError = new Error('WebSocket connection lost');
      subscriptionManager.handleSubscriptionError('btcusdt@trade', mockError, 'connection-1');

      expect(errorEvents).toHaveLength(1);
      
      const eventData = errorEvents[0];
      expect(eventData).toHaveProperty('subscription');
      expect(eventData).toHaveProperty('error');
      expect(eventData).toHaveProperty('connectionId', 'connection-1');
      expect(eventData.error.message).toBe('WebSocket connection lost');
    });
  });

  describe('IT-2.2.8: 事件数据完整性', () => {
    it('应该在事件数据中包含完整的订阅信息', async () => {
      let capturedEventData: any = null;

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        capturedEventData = data;
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE,
        params: { customParam: 'test' }
      });

      await subscriptionManager.subscribe([subscription]);

      expect(capturedEventData).not.toBeNull();
      expect(capturedEventData.result.successful).toHaveLength(1);
      
      const subscribedData = capturedEventData.result.successful[0];
      expect(subscribedData.original).toEqual(subscription);
      expect(subscribedData.streamName).toBe('btcusdt@trade');
      expect(subscribedData.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscribedData.connectionId).toBeDefined();
      expect(subscribedData.subscribedAt).toBeGreaterThan(0);
    });

    it('应该在连接变更事件中包含迁移详情', async () => {
      let connectionChangeData: any = null;

      subscriptionManager.on(SubscriptionEvent.CONNECTION_CHANGED, (data) => {
        connectionChangeData = data;
      });

      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER })
      ];

      await subscriptionManager.subscribe(subscriptions);

      // 执行迁移
      await subscriptionManager.migrateSubscriptions('connection-1', 'connection-2');

      expect(connectionChangeData).not.toBeNull();
      expect(connectionChangeData.subscriptions).toHaveLength(2);
      expect(connectionChangeData.oldConnectionId).toBe('connection-1');
      expect(connectionChangeData.newConnectionId).toBe('connection-2');
      
      connectionChangeData.subscriptions.forEach((sub: BinanceStreamSubscription) => {
        expect(sub.connectionId).toBe('connection-2');
      });
    });

    it('应该在统计更新事件中包含准确的指标', async () => {
      let statsData: any = null;

      subscriptionManager.on(SubscriptionEvent.STATS_UPDATED, (data) => {
        statsData = data;
      });

      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER }),
        testUtils.createTestSubscription({ symbol: 'BNBUSDT', dataType: DataType.KLINE_1M })
      ];

      await subscriptionManager.subscribe(subscriptions);

      // 等待统计更新事件
      await testUtils.waitFor(() => statsData !== null, 6000);

      if (statsData) {
        expect(statsData.stats).toBeDefined();
        expect(statsData.timestamp).toBeGreaterThan(0);
        expect(statsData.stats.total).toBe(3);
        expect(statsData.stats.byDataType[DataType.TRADE]).toBe(1);
        expect(statsData.stats.byDataType[DataType.TICKER]).toBe(1);
        expect(statsData.stats.byDataType[DataType.KLINE_1M]).toBe(1);
      }
    });

    it('应该确保事件时间戳的准确性', async () => {
      const eventTimestamps: number[] = [];

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        eventTimestamps.push(data.timestamp);
      });

      const subscription1 = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const beforeFirst = Date.now();
      await subscriptionManager.subscribe([subscription1]);
      const afterFirst = Date.now();

      await new Promise(resolve => setTimeout(resolve, 10));

      const subscription2 = testUtils.createTestSubscription({
        symbol: 'ETHUSDT',
        dataType: DataType.TRADE
      });

      const beforeSecond = Date.now();
      await subscriptionManager.subscribe([subscription2]);
      const afterSecond = Date.now();

      expect(eventTimestamps).toHaveLength(2);
      expect(eventTimestamps[0]).toBeGreaterThanOrEqual(beforeFirst);
      expect(eventTimestamps[0]).toBeLessThanOrEqual(afterFirst);
      expect(eventTimestamps[1]).toBeGreaterThanOrEqual(beforeSecond);
      expect(eventTimestamps[1]).toBeLessThanOrEqual(afterSecond);
      expect(eventTimestamps[1]).toBeGreaterThan(eventTimestamps[0]);
    });
  });

  describe('IT-2.2.9: 异步事件处理', () => {
    it('应该支持异步事件处理器', async () => {
      const processedEvents: any[] = [];
      let processingOrder: number[] = [];

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, async (data) => {
        processingOrder.push(1);
        await new Promise(resolve => setTimeout(resolve, 50));
        processedEvents.push({ type: 'added', data });
        processingOrder.push(2);
      });

      subscriptionManager.on(SubscriptionEvent.STREAM_DATA_RECEIVED, async (data) => {
        processingOrder.push(3);
        await new Promise(resolve => setTimeout(resolve, 20));
        processedEvents.push({ type: 'data', data });
        processingOrder.push(4);
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);
      
      // 立即发送数据，不等待订阅事件处理完成
      subscriptionManager.handleStreamData('btcusdt@trade', { price: '50000' }, 'connection-1');

      // 等待所有异步处理完成
      await testUtils.waitFor(() => processedEvents.length === 2, 200);

      expect(processedEvents).toHaveLength(2);
      expect(processedEvents.find(e => e.type === 'added')).toBeDefined();
      expect(processedEvents.find(e => e.type === 'data')).toBeDefined();
    });

    it('应该处理并发事件处理器', async () => {
      const handler1Results: any[] = [];
      const handler2Results: any[] = [];

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, async (data) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        handler1Results.push(data.timestamp);
      });

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, async (data) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 30));
        handler2Results.push(data.timestamp);
      });

      const subscriptions = Array(5).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      await subscriptionManager.subscribe(subscriptions);

      // 等待所有处理器完成
      await testUtils.waitFor(() => 
        handler1Results.length === 1 && handler2Results.length === 1, 
        200
      );

      expect(handler1Results).toHaveLength(1);
      expect(handler2Results).toHaveLength(1);
      expect(handler1Results[0]).toBe(handler2Results[0]); // 相同的时间戳
    });

    it('应该处理事件处理器中的异常', async () => {
      let normalHandlerCalled = false;
      const errorHandlerResults: any[] = [];

      // 正常处理器
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        normalHandlerCalled = true;
      });

      // 会抛出异常的处理器
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async handler error');
      });

      // 错误处理
      subscriptionManager.on('error', (error) => {
        errorHandlerResults.push(error);
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 正常处理器应该仍然被调用
      expect(normalHandlerCalled).toBe(true);
      
      // 订阅应该成功
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(1);
    });
  });

  describe('IT-2.2.10: 事件序列和时序', () => {
    it('应该保持正确的事件时序', async () => {
      const eventSequence: Array<{ event: string; timestamp: number }> = [];

      // 监听所有相关事件
      const events = [
        SubscriptionEvent.SUBSCRIPTION_ADDED,
        SubscriptionEvent.STREAM_DATA_RECEIVED,
        SubscriptionEvent.SUBSCRIPTION_ERROR,
        SubscriptionEvent.SUBSCRIPTION_REMOVED
      ];

      events.forEach(event => {
        subscriptionManager.on(event, (data) => {
          eventSequence.push({ 
            event, 
            timestamp: data.timestamp || Date.now() 
          });
        });
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 执行完整的生命周期
      await subscriptionManager.subscribe([subscription]);
      
      subscriptionManager.handleStreamData('btcusdt@trade', { price: '50000' }, 'connection-1');
      subscriptionManager.handleSubscriptionError('btcusdt@trade', new Error('Test error'), 'connection-1');
      
      await subscriptionManager.unsubscribe([subscription]);

      // 验证事件序列
      expect(eventSequence.length).toBeGreaterThanOrEqual(4);
      
      // 验证时间戳递增
      for (let i = 1; i < eventSequence.length; i++) {
        expect(eventSequence[i].timestamp).toBeGreaterThanOrEqual(eventSequence[i-1].timestamp);
      }

      // 验证事件顺序逻辑
      const eventTypes = eventSequence.map(e => e.event);
      const addedIndex = eventTypes.indexOf(SubscriptionEvent.SUBSCRIPTION_ADDED);
      const removedIndex = eventTypes.lastIndexOf(SubscriptionEvent.SUBSCRIPTION_REMOVED);
      
      expect(addedIndex).toBeLessThan(removedIndex);
    });

    it('应该处理快速连续事件', async () => {
      const dataEvents: any[] = [];

      subscriptionManager.on(SubscriptionEvent.STREAM_DATA_RECEIVED, (data) => {
        dataEvents.push({
          messageCount: data.messageCount,
          timestamp: Date.now()
        });
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 快速发送多条数据
      for (let i = 0; i < 10; i++) {
        subscriptionManager.handleStreamData('btcusdt@trade', { price: `${50000 + i}` }, 'connection-1');
      }

      expect(dataEvents).toHaveLength(10);
      
      // 验证消息计数递增
      for (let i = 0; i < dataEvents.length; i++) {
        expect(dataEvents[i].messageCount).toBe(i + 1);
      }
    });

    it('应该处理批量操作的事件', async () => {
      const batchEvents: any[] = [];

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        batchEvents.push({
          type: 'batch',
          successful: data.result.successful.length,
          failed: data.result.failed.length,
          timestamp: data.timestamp
        });
      });

      const subscriptions = Array(5).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      await subscriptionManager.subscribe(subscriptions);

      expect(batchEvents).toHaveLength(1);
      expect(batchEvents[0].successful).toBe(5);
      expect(batchEvents[0].failed).toBe(0);
    });
  });

  describe('IT-2.2.11: 性能事件监控', () => {
    it('应该监控事件处理性能', async () => {
      const performanceMetrics: any[] = [];

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        const processingStart = process.hrtime.bigint();
        
        // 模拟一些处理
        JSON.stringify(data);
        
        const processingEnd = process.hrtime.bigint();
        const duration = Number(processingEnd - processingStart) / 1000; // 微秒

        performanceMetrics.push({
          event: 'subscription_added',
          duration,
          dataSize: JSON.stringify(data).length
        });
      });

      const subscriptions = Array(20).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      await subscriptionManager.subscribe(subscriptions);

      expect(performanceMetrics).toHaveLength(1);
      expect(performanceMetrics[0].duration).toBeLessThan(1000); // 1ms
      expect(performanceMetrics[0].dataSize).toBeGreaterThan(0);
    });

    it('应该处理高频事件场景', async () => {
      let eventCount = 0;
      const startTime = Date.now();

      subscriptionManager.on(SubscriptionEvent.STREAM_DATA_RECEIVED, () => {
        eventCount++;
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 发送大量数据事件
      for (let i = 0; i < 1000; i++) {
        subscriptionManager.handleStreamData('btcusdt@trade', { price: `${50000 + i}` }, 'connection-1');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(eventCount).toBe(1000);
      expect(duration).toBeLessThan(100); // 100ms内处理1000个事件
    });

    it('应该控制事件系统的内存使用', async () => {
      const memBefore = process.memoryUsage().heapUsed;

      // 创建大量事件监听器
      const handlers: Array<() => void> = [];
      
      for (let i = 0; i < 100; i++) {
        const handler = () => { /* 空处理器 */ };
        handlers.push(handler);
        subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, handler);
      }

      // 触发事件
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 清理监听器
      handlers.forEach(handler => {
        subscriptionManager.off(SubscriptionEvent.SUBSCRIPTION_ADDED, handler);
      });

      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = memAfter - memBefore;

      // 内存增长应该在合理范围内
      expect(memDiff).toBeLessThan(10 * 1024 * 1024); // 10MB
    });
  });

  describe('IT-2.2.12: 事件系统可靠性', () => {
    it('应该在错误条件下保持事件系统稳定', async () => {
      const successfulEvents: any[] = [];
      let errorCount = 0;

      // 正常处理器
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        successfulEvents.push(data);
      });

      // 错误处理器
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, () => {
        errorCount++;
        throw new Error('Intentional error');
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 多次订阅操作
      for (let i = 0; i < 5; i++) {
        const testSub = testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        });
        
        await subscriptionManager.subscribe([testSub]);
      }

      // 正常处理器应该仍然工作
      expect(successfulEvents).toHaveLength(5);
      expect(errorCount).toBe(5);
      
      // 订阅管理器应该仍然功能正常
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(5);
    });

    it('应该处理事件循环和重入', async () => {
      let recursionDepth = 0;
      const maxDepth = 3;

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, async (data) => {
        recursionDepth++;
        
        if (recursionDepth <= maxDepth) {
          // 在事件处理器中触发新的订阅
          const newSub = testUtils.createTestSubscription({
            symbol: `RECURSIVE${recursionDepth}USDT`,
            dataType: DataType.TRADE
          });
          
          await subscriptionManager.subscribe([newSub]);
        }
      });

      const initialSubscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([initialSubscription]);

      // 应该创建了多个订阅（原始 + 递归创建的）
      expect(subscriptionManager.getActiveSubscriptions().length).toBeGreaterThan(1);
      expect(recursionDepth).toBe(maxDepth + 1);
    });

    it('应该在高负载下保持事件系统性能', async () => {
      const eventCounts = {
        added: 0,
        data: 0,
        error: 0
      };

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, () => {
        eventCounts.added++;
      });

      subscriptionManager.on(SubscriptionEvent.STREAM_DATA_RECEIVED, () => {
        eventCounts.data++;
      });

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ERROR, () => {
        eventCounts.error++;
      });

      // 创建大量订阅
      const subscriptions = Array(50).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      const startTime = Date.now();
      await subscriptionManager.subscribe(subscriptions);

      // 为每个订阅生成数据和错误
      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      activeSubscriptions.forEach(sub => {
        // 数据事件
        for (let i = 0; i < 5; i++) {
          subscriptionManager.handleStreamData(sub.streamName, { price: `${50000 + i}` }, sub.connectionId);
        }
        
        // 错误事件
        subscriptionManager.handleSubscriptionError(sub.streamName, new Error('Test error'), sub.connectionId);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 验证事件计数
      expect(eventCounts.added).toBe(1); // 批量操作产生1个事件
      expect(eventCounts.data).toBe(250); // 50 * 5
      expect(eventCounts.error).toBe(50); // 50 * 1

      // 性能要求
      expect(duration).toBeLessThan(1000); // 1秒内完成
    });
  });
});