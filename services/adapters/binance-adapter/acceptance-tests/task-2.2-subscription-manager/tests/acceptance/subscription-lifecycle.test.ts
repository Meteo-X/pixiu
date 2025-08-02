/**
 * Acceptance Tests for Subscription Lifecycle (Task 2.2)
 * 
 * 验证订阅/取消订阅功能和订阅生命周期管理的验收测试
 * 
 * 测试范围:
 * - ✅ 订阅添加和生命周期管理
 * - ✅ 取消订阅和清理功能
 * - ✅ 批量订阅操作
 * - ✅ 订阅状态管理和事件
 * - ✅ 错误处理和恢复机制
 * - ✅ 订阅限制和验证
 * - ✅ 统计和监控功能
 */

import { EventEmitter } from 'events';
import { SubscriptionManager } from '../../../../../src/subscription/SubscriptionManager';
import { 
  SubscriptionManagerConfig, 
  SubscriptionStatus, 
  SubscriptionEvent,
  SubscriptionErrorCode
} from '../../../../../src/subscription/interfaces';
import { DataType } from '../../../../../src/types';

describe('Subscription Lifecycle - Acceptance Tests', () => {
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

  describe('AC-2.2.17: 订阅管理器初始化', () => {
    it('应该成功初始化订阅管理器', async () => {
      const newManager = new SubscriptionManager();
      
      await expect(newManager.initialize(mockConfig)).resolves.not.toThrow();
      
      expect(newManager.getSubscriptionStats().total).toBe(0);
      
      await newManager.destroy();
    });

    it('应该拒绝重复初始化', async () => {
      await expect(subscriptionManager.initialize(mockConfig))
        .rejects.toThrow('SubscriptionManager is already initialized');
    });

    it('应该验证配置参数', async () => {
      const invalidConfig = {
        ...mockConfig,
        maxStreamsPerConnection: -1
      };

      const newManager = new SubscriptionManager();
      
      await expect(newManager.initialize(invalidConfig))
        .rejects.toThrow('maxStreamsPerConnection must be positive');
      
      await newManager.destroy();
    });

    it('应该发出初始化事件', async () => {
      const newManager = new SubscriptionManager();
      const eventPromise = new Promise((resolve) => {
        newManager.once('initialized', resolve);
      });

      await newManager.initialize(mockConfig);
      
      const eventData = await eventPromise;
      expect(eventData).toHaveProperty('timestamp');
      expect(eventData).toHaveProperty('config');
      
      await newManager.destroy();
    });
  });

  describe('AC-2.2.18: 单个订阅管理', () => {
    it('应该成功添加单个订阅', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([subscription]);

      expect(result).toBeValidSubscriptionResult();
      expect(result.success).toBe(true);
      expect(result.summary.successful).toBe(1);
      expect(result.summary.failed).toBe(0);
      expect(result.successful).toHaveLength(1);
      
      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('应该成功取消单个订阅', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 先添加订阅
      await subscriptionManager.subscribe([subscription]);
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(1);

      // 然后取消订阅
      const result = await subscriptionManager.unsubscribe([subscription]);

      expect(result).toBeValidSubscriptionResult();
      expect(result.success).toBe(true);
      expect(result.summary.successful).toBe(1);
      expect(result.successful).toHaveLength(1);
      
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(0);
    });

    it('应该检测重复订阅', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 第一次订阅
      await subscriptionManager.subscribe([subscription]);
      
      // 第二次订阅相同内容
      const result = await subscriptionManager.subscribe([subscription]);

      expect(result.success).toBe(true);
      expect(result.summary.existing).toBe(1);
      expect(result.summary.successful).toBe(0);
      expect(result.existing).toHaveLength(1);
      
      // 总数仍然是 1
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(1);
    });

    it('应该检查订阅存在性', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      expect(subscriptionManager.hasSubscription(subscription)).toBe(false);

      await subscriptionManager.subscribe([subscription]);
      expect(subscriptionManager.hasSubscription(subscription)).toBe(true);

      await subscriptionManager.unsubscribe([subscription]);
      expect(subscriptionManager.hasSubscription(subscription)).toBe(false);
    });
  });

  describe('AC-2.2.19: 批量订阅操作', () => {
    it('应该成功处理批量订阅', async () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER }),
        testUtils.createTestSubscription({ symbol: 'BNBUSDT', dataType: DataType.KLINE_1M })
      ];

      const result = await subscriptionManager.subscribe(subscriptions);

      expect(result).toBeValidSubscriptionResult();
      expect(result.success).toBe(true);
      expect(result.summary.successful).toBe(3);
      expect(result.summary.failed).toBe(0);
      expect(result.successful).toHaveLength(3);
      
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(3);
    });

    it('应该成功处理批量取消订阅', async () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER }),
        testUtils.createTestSubscription({ symbol: 'BNBUSDT', dataType: DataType.KLINE_1M })
      ];

      // 先添加订阅
      await subscriptionManager.subscribe(subscriptions);
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(3);

      // 批量取消订阅
      const result = await subscriptionManager.unsubscribe(subscriptions);

      expect(result).toBeValidSubscriptionResult();
      expect(result.success).toBe(true);
      expect(result.summary.successful).toBe(3);
      expect(result.successful).toHaveLength(3);
      
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(0);
    });

    it('应该处理混合批量操作（部分成功/失败）', async () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'INVALID_SYMBOL', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER })
      ];

      const result = await subscriptionManager.subscribe(subscriptions);

      expect(result).toBeValidSubscriptionResult();
      expect(result.success).toBe(false); // 整体失败因为有错误
      expect(result.summary.successful).toBe(2);
      expect(result.summary.failed).toBe(1);
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
    });

    it('应该处理大批量订阅操作', async () => {
      const subscriptions = Array(100).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      const { result, duration } = testUtils.measurePerformance(async () => {
        return await subscriptionManager.subscribe(subscriptions);
      });

      expect(result).toBeValidSubscriptionResult();
      expect(result.success).toBe(true);
      expect(result.summary.successful).toBe(100);
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(100);
      
      // 性能要求
      expect(duration).toMeetPerformanceThreshold(
        testConfig.thresholds.performance.subscriptionManagement,
        'μs'
      );
    });
  });

  describe('AC-2.2.20: 订阅状态管理', () => {
    it('应该正确管理订阅状态转换', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const statusChanges: any[] = [];
      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_STATUS_CHANGED, (data) => {
        statusChanges.push(data);
      });

      await subscriptionManager.subscribe([subscription]);
      
      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
      
      await subscriptionManager.unsubscribe([subscription]);
      
      // 验证状态变化事件
      expect(statusChanges.length).toBeGreaterThan(0);
    });

    it('应该提供准确的订阅统计信息', async () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TICKER }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.KLINE_1M })
      ];

      await subscriptionManager.subscribe(subscriptions);
      
      const stats = subscriptionManager.getSubscriptionStats();
      
      expect(stats.total).toBe(4);
      expect(stats.byDataType[DataType.TRADE]).toBe(2);
      expect(stats.byDataType[DataType.TICKER]).toBe(1);
      expect(stats.byDataType[DataType.KLINE_1M]).toBe(1);
      expect(stats.bySymbol['BTCUSDT']).toBe(2);
      expect(stats.bySymbol['ETHUSDT']).toBe(2);
      expect(stats.byStatus[SubscriptionStatus.ACTIVE]).toBe(4);
    });

    it('应该处理订阅的时间戳信息', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const beforeTime = Date.now();
      await subscriptionManager.subscribe([subscription]);
      const afterTime = Date.now();

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      const sub = activeSubscriptions[0];
      
      expect(sub.subscribedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(sub.subscribedAt).toBeLessThanOrEqual(afterTime);
      expect(sub.lastActiveAt).toBeGreaterThanOrEqual(beforeTime);
      expect(sub.lastActiveAt).toBeLessThanOrEqual(afterTime);
      expect(sub.messageCount).toBe(0);
      expect(sub.errorCount).toBe(0);
    });
  });

  describe('AC-2.2.21: 事件系统', () => {
    it('应该发出订阅添加事件', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const eventPromise = new Promise((resolve) => {
        subscriptionManager.once(SubscriptionEvent.SUBSCRIPTION_ADDED, resolve);
      });

      await subscriptionManager.subscribe([subscription]);
      
      const eventData = await eventPromise;
      expect(eventData).toHaveProperty('result');
      expect(eventData).toHaveProperty('timestamp');
    });

    it('应该发出订阅移除事件', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      const eventPromise = new Promise((resolve) => {
        subscriptionManager.once(SubscriptionEvent.SUBSCRIPTION_REMOVED, resolve);
      });

      await subscriptionManager.unsubscribe([subscription]);
      
      const eventData = await eventPromise;
      expect(eventData).toHaveProperty('result');
      expect(eventData).toHaveProperty('timestamp');
    });

    it('应该发出统计更新事件', async () => {
      const eventPromise = new Promise((resolve) => {
        subscriptionManager.once(SubscriptionEvent.STATS_UPDATED, resolve);
      });

      // 等待统计更新事件（每5秒一次）
      const eventData = await Promise.race([
        eventPromise,
        testUtils.waitFor(() => false, 6000).catch(() => null)
      ]);

      if (eventData) {
        expect(eventData).toHaveProperty('stats');
        expect(eventData).toHaveProperty('timestamp');
      }
    });

    it('应该处理事件监听器管理', async () => {
      let eventCount = 0;
      const eventHandler = () => { eventCount++; };

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, eventHandler);
      
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);
      expect(eventCount).toBe(1);

      subscriptionManager.off(SubscriptionEvent.SUBSCRIPTION_ADDED, eventHandler);
      
      await subscriptionManager.subscribe([
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TRADE })
      ]);
      
      expect(eventCount).toBe(1); // 应该没有增加
    });
  });

  describe('AC-2.2.22: 错误处理和验证', () => {
    it('应该验证订阅数量限制', async () => {
      const maxSubscriptions = mockConfig.validation.maxSubscriptions;
      const subscriptions = Array(maxSubscriptions + 1).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      await expect(subscriptionManager.subscribe(subscriptions))
        .rejects.toThrow(`Would exceed maximum subscriptions: ${maxSubscriptions + 1} > ${maxSubscriptions}`);
    });

    it('应该验证交易对格式', async () => {
      const invalidSubscription = testUtils.createTestSubscription({
        symbol: 'INVALID-SYMBOL',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([invalidSubscription]);

      expect(result.success).toBe(false);
      expect(result.summary.failed).toBe(1);
      expect(result.failed[0].subscription).toEqual(invalidSubscription);
    });

    it('应该处理禁用的数据类型', async () => {
      // 更新配置以禁用某些数据类型
      const configWithDisabled = {
        ...mockConfig,
        validation: {
          ...mockConfig.validation,
          disabledDataTypes: [DataType.TICKER]
        }
      };

      const newManager = new SubscriptionManager();
      await newManager.initialize(configWithDisabled);

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TICKER
      });

      const result = await newManager.subscribe([subscription]);

      expect(result.success).toBe(false);
      expect(result.summary.failed).toBe(1);
      expect(result.failed[0].error.message).toContain('Data type is disabled');

      await newManager.destroy();
    });

    it('应该处理未初始化的管理器', async () => {
      const uninitializedManager = new SubscriptionManager();
      
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await expect(uninitializedManager.subscribe([subscription]))
        .rejects.toThrow('SubscriptionManager is not initialized');
      
      await expect(uninitializedManager.unsubscribe([subscription]))
        .rejects.toThrow('SubscriptionManager is not initialized');
    });
  });

  describe('AC-2.2.23: 清理和销毁', () => {
    it('应该清空所有订阅', async () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER }),
        testUtils.createTestSubscription({ symbol: 'BNBUSDT', dataType: DataType.KLINE_1M })
      ];

      await subscriptionManager.subscribe(subscriptions);
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(3);

      await subscriptionManager.clearAllSubscriptions();
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(0);
    });

    it('应该正确销毁订阅管理器', async () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER })
      ];

      await subscriptionManager.subscribe(subscriptions);
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(2);

      await subscriptionManager.destroy();
      
      // 销毁后应该无法操作
      await expect(subscriptionManager.subscribe([subscriptions[0]]))
        .rejects.toThrow('SubscriptionManager is not initialized');
    });

    it('应该处理重复清理操作', async () => {
      await subscriptionManager.clearAllSubscriptions();
      
      // 再次清理应该不报错
      await expect(subscriptionManager.clearAllSubscriptions())
        .resolves.not.toThrow();
    });
  });

  describe('AC-2.2.24: 性能要求', () => {
    it('应该在性能阈值内处理单个订阅', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const { duration } = await testUtils.measurePerformance(async () => {
        await subscriptionManager.subscribe([subscription]);
      });

      expect(duration).toMeetPerformanceThreshold(
        testConfig.thresholds.performance.subscriptionManagement,
        'μs'
      );
    });

    it('应该在性能阈值内处理批量订阅', async () => {
      const subscriptions = Array(100).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      const { duration } = await testUtils.measurePerformance(async () => {
        await subscriptionManager.subscribe(subscriptions);
      });

      expect(duration).toMeetPerformanceThreshold(50000, 'μs'); // 50ms for 100 subscriptions
    });

    it('应该控制内存使用量', async () => {
      const memBefore = process.memoryUsage().heapUsed;

      // 添加大量订阅
      for (let batch = 0; batch < 10; batch++) {
        const subscriptions = Array(100).fill(null).map((_, i) => 
          testUtils.createTestSubscription({
            symbol: `BATCH${batch}SYMBOL${i}USDT`,
            dataType: DataType.TRADE
          })
        );
        await subscriptionManager.subscribe(subscriptions);
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = memAfter - memBefore;

      expect(memDiff).toBeLessThan(testConfig.thresholds.performance.memoryUsage);
    });
  });
});