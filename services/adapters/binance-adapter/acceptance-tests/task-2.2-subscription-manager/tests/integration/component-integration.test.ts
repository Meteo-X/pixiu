/**
 * Integration Tests for Component Integration (Task 2.2)
 * 
 * 验证订阅管理器与其他组件集成的测试
 * 
 * 测试范围:
 * - ✅ StreamNameBuilder 与 SubscriptionManager 集成
 * - ✅ 事件系统集成和通信
 * - ✅ 配置系统集成
 * - ✅ 错误处理链集成
 * - ✅ 性能监控集成
 * - ✅ 生命周期管理集成
 */

import { EventEmitter } from 'events';
import { SubscriptionManager } from '../../../../../src/subscription/SubscriptionManager';
import { StreamNameBuilder } from '../../../../../src/subscription/StreamNameBuilder';
import { 
  SubscriptionManagerConfig,
  SubscriptionStatus,
  SubscriptionEvent,
  IStreamNameBuilder,
  ISubscriptionManager
} from '../../../../../src/subscription/interfaces';
import { DataType } from '../../../../../src/types';

describe('Component Integration Tests', () => {
  let subscriptionManager: SubscriptionManager;
  let streamBuilder: StreamNameBuilder;
  let mockConfig: SubscriptionManagerConfig;

  beforeEach(async () => {
    subscriptionManager = new SubscriptionManager();
    streamBuilder = new StreamNameBuilder();
    
    mockConfig = testUtils.createTestConfig({
      baseWsUrl: 'wss://stream.binance.com:9443',
      maxStreamsPerConnection: 50,
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

  describe('IT-2.2.1: StreamNameBuilder 与 SubscriptionManager 集成', () => {
    it('应该正确集成流名称构建和订阅管理', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 使用 StreamNameBuilder 构建流名称
      const expectedStreamName = streamBuilder.buildStreamName(subscription);
      expect(expectedStreamName).toBe('btcusdt@trade');

      // 订阅管理器应该内部使用相同的构建逻辑
      await subscriptionManager.subscribe([subscription]);

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].streamName).toBe(expectedStreamName);
    });

    it('应该支持复杂参数的流名称构建和订阅', async () => {
      const complexSubscriptions = [
        testUtils.createTestSubscription({
          symbol: 'BTCUSDT',
          dataType: DataType.DEPTH,
          params: { levels: 10, speed: '100ms' }
        }),
        testUtils.createTestSubscription({
          symbol: 'ETHUSDT',
          dataType: DataType.KLINE_5M,
          params: { interval: '5m' }
        })
      ];

      // 验证流名称构建
      const expectedStreamNames = complexSubscriptions.map(sub => 
        streamBuilder.buildStreamName(sub)
      );
      expect(expectedStreamNames).toEqual([
        'btcusdt@depth10@100ms',
        'ethusdt@kline_5m'
      ]);

      // 验证订阅管理器集成
      await subscriptionManager.subscribe(complexSubscriptions);

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(2);
      
      const actualStreamNames = activeSubscriptions.map(sub => sub.streamName);
      expect(actualStreamNames).toEqual(expect.arrayContaining(expectedStreamNames));
    });

    it('应该一致处理流名称验证', async () => {
      const invalidSubscription = testUtils.createTestSubscription({
        symbol: 'INVALID-SYMBOL',
        dataType: DataType.TRADE
      });

      // StreamNameBuilder 应该抛出错误
      expect(() => streamBuilder.buildStreamName(invalidSubscription))
        .toThrow();

      // SubscriptionManager 也应该处理相同的错误
      const result = await subscriptionManager.subscribe([invalidSubscription]);
      
      expect(result.success).toBe(false);
      expect(result.summary.failed).toBe(1);
      expect(result.failed[0].error.message).toContain('Invalid symbol format');
    });

    it('应该支持批量流名称操作集成', async () => {
      const subscriptions = Array(50).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: i % 2 === 0 ? DataType.TRADE : DataType.TICKER
        })
      );

      // 使用 StreamNameBuilder 批量构建
      const expectedStreamNames = streamBuilder.buildStreamNames(subscriptions);
      expect(expectedStreamNames).toHaveLength(50);

      // 订阅管理器应该能处理相同的批量操作
      await subscriptionManager.subscribe(subscriptions);

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(50);
      
      const actualStreamNames = activeSubscriptions.map(sub => sub.streamName);
      expect(actualStreamNames).toEqual(expect.arrayContaining(expectedStreamNames));
    });
  });

  describe('IT-2.2.2: 事件系统集成', () => {
    it('应该正确发出和处理所有生命周期事件', async () => {
      const eventLog: Array<{ event: string; data: any; timestamp: number }> = [];
      
      // 监听所有相关事件
      Object.values(SubscriptionEvent).forEach(event => {
        subscriptionManager.on(event, (data) => {
          eventLog.push({ event, data, timestamp: Date.now() });
        });
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 执行完整的生命周期
      await subscriptionManager.subscribe([subscription]);
      
      // 模拟数据接收
      subscriptionManager.handleStreamData('btcusdt@trade', { price: '50000' }, 'connection-1');
      
      // 模拟错误
      subscriptionManager.handleSubscriptionError('btcusdt@trade', new Error('Test error'), 'connection-1');
      
      await subscriptionManager.unsubscribe([subscription]);

      // 等待事件处理
      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证事件序列
      const eventTypes = eventLog.map(log => log.event);
      expect(eventTypes).toContain(SubscriptionEvent.SUBSCRIPTION_ADDED);
      expect(eventTypes).toContain(SubscriptionEvent.STREAM_DATA_RECEIVED);
      expect(eventTypes).toContain(SubscriptionEvent.SUBSCRIPTION_ERROR);
      expect(eventTypes).toContain(SubscriptionEvent.SUBSCRIPTION_REMOVED);
    });

    it('应该支持事件过滤和条件处理', async () => {
      let tradeEventCount = 0;
      let tickerEventCount = 0;

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        if (data.result && data.result.successful) {
          data.result.successful.forEach((sub: any) => {
            if (sub.original.dataType === DataType.TRADE) {
              tradeEventCount++;
            } else if (sub.original.dataType === DataType.TICKER) {
              tickerEventCount++;
            }
          });
        }
      });

      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'BNBUSDT', dataType: DataType.TICKER })
      ];

      await subscriptionManager.subscribe(subscriptions);

      expect(tradeEventCount).toBe(2);
      expect(tickerEventCount).toBe(1);
    });

    it('应该处理事件监听器的动态添加和移除', async () => {
      let eventCount = 0;
      
      const handler1 = () => { eventCount++; };
      const handler2 = () => { eventCount += 10; };

      // 添加第一个监听器
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, handler1);
      
      const subscription1 = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });
      
      await subscriptionManager.subscribe([subscription1]);
      expect(eventCount).toBe(1);

      // 添加第二个监听器
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, handler2);
      
      const subscription2 = testUtils.createTestSubscription({
        symbol: 'ETHUSDT',
        dataType: DataType.TRADE
      });
      
      await subscriptionManager.subscribe([subscription2]);
      expect(eventCount).toBe(12); // 1 + 1 + 10

      // 移除第一个监听器
      subscriptionManager.off(SubscriptionEvent.SUBSCRIPTION_ADDED, handler1);
      
      const subscription3 = testUtils.createTestSubscription({
        symbol: 'BNBUSDT',
        dataType: DataType.TRADE
      });
      
      await subscriptionManager.subscribe([subscription3]);
      expect(eventCount).toBe(22); // 12 + 10
    });

    it('应该处理事件错误和异常', async () => {
      let errorCaught = false;

      // 添加会抛出错误的监听器
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, () => {
        throw new Error('Handler error');
      });

      // 添加错误处理
      subscriptionManager.on('error', () => {
        errorCaught = true;
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 订阅应该仍然成功，即使事件处理器出错
      await expect(subscriptionManager.subscribe([subscription]))
        .resolves.not.toThrow();

      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(1);
    });
  });

  describe('IT-2.2.3: 配置系统集成', () => {
    it('应该正确应用所有配置参数', async () => {
      const customConfig = testUtils.createTestConfig({
        maxStreamsPerConnection: 5,
        subscriptionTimeout: 3000,
        validation: {
          strictValidation: true,
          symbolPattern: /^[A-Z]+USDT$/,
          maxSubscriptions: 10,
          disabledDataTypes: [DataType.DEPTH]
        }
      });

      const newManager = new SubscriptionManager();
      await newManager.initialize(customConfig);

      // 测试禁用的数据类型
      const depthSubscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.DEPTH
      });

      const result = await newManager.subscribe([depthSubscription]);
      expect(result.success).toBe(false);
      expect(result.failed[0].error.message).toContain('Data type is disabled');

      // 测试符号验证模式
      const invalidSymbolSubscription = testUtils.createTestSubscription({
        symbol: 'BTCBTC',
        dataType: DataType.TRADE
      });

      const result2 = await newManager.subscribe([invalidSymbolSubscription]);
      expect(result2.success).toBe(false);

      // 测试订阅数量限制
      const manySubscriptions = Array(11).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      await expect(newManager.subscribe(manySubscriptions))
        .rejects.toThrow('Would exceed maximum subscriptions');

      await newManager.destroy();
    });

    it('应该支持配置的运行时验证', async () => {
      const invalidConfigs = [
        {
          ...mockConfig,
          maxStreamsPerConnection: 0
        },
        {
          ...mockConfig,
          subscriptionTimeout: -1
        },
        {
          ...mockConfig,
          validation: {
            ...mockConfig.validation,
            maxSubscriptions: 0
          }
        }
      ];

      for (const invalidConfig of invalidConfigs) {
        const newManager = new SubscriptionManager();
        
        await expect(newManager.initialize(invalidConfig))
          .rejects.toThrow();
        
        await newManager.destroy();
      }
    });

    it('应该支持配置的默认值和覆盖', async () => {
      const minimalConfig = {
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
      };

      const newManager = new SubscriptionManager();
      await newManager.initialize(minimalConfig);

      // 应该能正常工作
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await expect(newManager.subscribe([subscription]))
        .resolves.not.toThrow();

      await newManager.destroy();
    });
  });

  describe('IT-2.2.4: 错误处理链集成', () => {
    it('应该在完整的错误处理链中传播错误', async () => {
      const errorLog: any[] = [];

      // 监听各种错误事件
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ERROR, (data) => {
        errorLog.push({ type: 'subscription_error', data });
      });

      subscriptionManager.on('error', (error) => {
        errorLog.push({ type: 'general_error', error });
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 模拟不同类型的错误
      const networkError = new Error('Network connection lost');
      subscriptionManager.handleSubscriptionError('btcusdt@trade', networkError, 'connection-1');

      const parseError = new Error('Invalid JSON data');
      subscriptionManager.handleSubscriptionError('btcusdt@trade', parseError, 'connection-1');

      // 验证错误传播
      expect(errorLog).toHaveLength(2);
      expect(errorLog[0].data.error.message).toBe('Network connection lost');
      expect(errorLog[1].data.error.message).toBe('Invalid JSON data');

      // 验证订阅状态更新
      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions[0].errorCount).toBe(2);
    });

    it('应该处理级联错误场景', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 模拟多个连续错误
      for (let i = 0; i < 5; i++) {
        subscriptionManager.handleSubscriptionError(
          'btcusdt@trade', 
          new Error(`Error ${i + 1}`), 
          'connection-1'
        );
      }

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions[0].errorCount).toBe(5);
      expect(activeSubscriptions[0].lastError?.message).toBe('Error 5');
    });

    it('应该支持错误恢复和重置', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 产生错误
      subscriptionManager.handleSubscriptionError('btcusdt@trade', new Error('Test error'), 'connection-1');
      
      let activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions[0].errorCount).toBe(1);

      // 成功接收数据应该表明恢复
      subscriptionManager.handleStreamData('btcusdt@trade', { price: '50000' }, 'connection-1');
      
      activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions[0].messageCount).toBe(1);
      expect(activeSubscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('IT-2.2.5: 性能监控集成', () => {
    it('应该集成性能指标收集', async () => {
      const performanceMetrics: any[] = [];

      // 监控统计更新事件
      subscriptionManager.on(SubscriptionEvent.STATS_UPDATED, (data) => {
        performanceMetrics.push({
          timestamp: data.timestamp,
          stats: data.stats
        });
      });

      // 创建订阅并生成活动
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 生成流数据
      for (let i = 0; i < 10; i++) {
        subscriptionManager.handleStreamData('btcusdt@trade', { price: `${50000 + i}` }, 'connection-1');
      }

      // 等待统计更新
      await testUtils.waitFor(() => performanceMetrics.length > 0, 6000);

      if (performanceMetrics.length > 0) {
        const latestMetrics = performanceMetrics[performanceMetrics.length - 1];
        expect(latestMetrics.stats.total).toBe(1);
        expect(latestMetrics.stats.averageMessageRate).toBeGreaterThanOrEqual(0);
      }
    });

    it('应该监控内存使用和资源管理', async () => {
      const memBefore = process.memoryUsage().heapUsed;

      // 创建大量订阅
      const subscriptions = Array(200).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      await subscriptionManager.subscribe(subscriptions);

      // 生成大量数据
      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      activeSubscriptions.forEach(sub => {
        for (let i = 0; i < 5; i++) {
          subscriptionManager.handleStreamData(sub.streamName, { price: `${50000 + i}` }, sub.connectionId);
        }
      });

      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = memAfter - memBefore;

      // 内存使用应该在合理范围内
      expect(memDiff).toBeLessThan(50 * 1024 * 1024); // 50MB

      // 清理应该释放大部分内存
      await subscriptionManager.clearAllSubscriptions();
      
      // 强制垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
      }

      const memAfterCleanup = process.memoryUsage().heapUsed;
      expect(memAfterCleanup).toBeLessThan(memAfter);
    });

    it('应该集成延迟和吞吐量监控', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 测量数据处理延迟
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < 100; i++) {
        subscriptionManager.handleStreamData('btcusdt@trade', { price: `${50000 + i}` }, 'connection-1');
      }

      const endTime = process.hrtime.bigint();
      const processingTime = Number(endTime - startTime) / 1000; // 微秒

      // 处理100条消息应该很快
      expect(processingTime).toBeLessThan(10000); // 10ms

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions[0].messageCount).toBe(100);
    });
  });

  describe('IT-2.2.6: 生命周期管理集成', () => {
    it('应该正确管理完整的组件生命周期', async () => {
      const lifecycleEvents: string[] = [];

      // 监听生命周期事件
      subscriptionManager.on('initialized', () => {
        lifecycleEvents.push('initialized');
      });

      // 创建新的管理器以测试完整生命周期
      const newManager = new SubscriptionManager();

      // 初始化
      await newManager.initialize(mockConfig);
      
      // 使用
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await newManager.subscribe([subscription]);
      expect(newManager.getActiveSubscriptions()).toHaveLength(1);

      // 销毁
      await newManager.destroy();

      // 验证生命周期
      expect(lifecycleEvents).toContain('initialized');
      
      // 销毁后应该无法使用
      await expect(newManager.subscribe([subscription]))
        .rejects.toThrow('SubscriptionManager is not initialized');
    });

    it('应该支持优雅关闭和资源清理', async () => {
      const subscriptions = Array(50).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      await subscriptionManager.subscribe(subscriptions);
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(50);

      // 优雅关闭
      const shutdownStart = Date.now();
      await subscriptionManager.destroy();
      const shutdownTime = Date.now() - shutdownStart;

      // 关闭应该及时完成
      expect(shutdownTime).toBeLessThan(1000); // 1秒内

      // 资源应该被清理
      expect(subscriptionManager.listenerCount(SubscriptionEvent.SUBSCRIPTION_ADDED)).toBe(0);
    });

    it('应该处理异常情况下的生命周期管理', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 模拟异常情况
      subscriptionManager.handleSubscriptionError('btcusdt@trade', new Error('Critical error'), 'connection-1');

      // 即使有错误，也应该能正常销毁
      await expect(subscriptionManager.destroy())
        .resolves.not.toThrow();
    });
  });
});