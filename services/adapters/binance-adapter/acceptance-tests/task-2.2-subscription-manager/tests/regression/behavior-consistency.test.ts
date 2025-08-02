/**
 * Regression Tests for Behavior Consistency (Task 2.2)
 * 
 * 验证行为一致性的回归测试
 * 
 * 测试范围:
 * - ✅ 订阅行为一致性
 * - ✅ 事件触发一致性
 * - ✅ 错误处理一致性
 * - ✅ 状态管理一致性
 * - ✅ 性能行为一致性
 * - ✅ 并发行为一致性
 * - ✅ 资源管理一致性
 */

import { SubscriptionManager } from '../../../../../src/subscription/SubscriptionManager';
import { StreamNameBuilder } from '../../../../../src/subscription/StreamNameBuilder';
import { 
  SubscriptionManagerConfig,
  SubscriptionStatus,
  SubscriptionEvent
} from '../../../../../src/subscription/interfaces';
import { DataType } from '../../../../../src/types';

describe('Behavior Consistency Regression Tests', () => {
  let subscriptionManager: SubscriptionManager;
  let streamBuilder: StreamNameBuilder;
  let mockConfig: SubscriptionManagerConfig;

  beforeEach(async () => {
    subscriptionManager = new SubscriptionManager();
    streamBuilder = new StreamNameBuilder();
    
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

  describe('RT-2.2.8: 订阅行为一致性', () => {
    it('应该在多次相同订阅操作中保持一致行为', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const results = [];

      // 执行多次相同的订阅操作
      for (let i = 0; i < 5; i++) {
        const result = await subscriptionManager.subscribe([subscription]);
        results.push(result);
      }

      // 第一次应该成功
      expect(results[0].success).toBe(true);
      expect(results[0].summary.successful).toBe(1);
      expect(results[0].summary.existing).toBe(0);

      // 后续操作应该检测到现有订阅
      for (let i = 1; i < results.length; i++) {
        expect(results[i].success).toBe(true);
        expect(results[i].summary.successful).toBe(0);
        expect(results[i].summary.existing).toBe(1);
      }

      // 总的活跃订阅数应该始终为1
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(1);
    });

    it('应该在不同订阅组合中保持一致的处理逻辑', async () => {
      const testCases = [
        // 单个订阅
        [testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE })],
        
        // 多个不同符号
        [
          testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
          testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TRADE })
        ],
        
        // 相同符号不同数据类型
        [
          testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
          testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TICKER })
        ],
        
        // 复杂组合
        [
          testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
          testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER }),
          testUtils.createTestSubscription({ symbol: 'BNBUSDT', dataType: DataType.KLINE_1M })
        ]
      ];

      for (const subscriptions of testCases) {
        // 清理之前的订阅
        await subscriptionManager.clearAllSubscriptions();

        // 执行订阅
        const result = await subscriptionManager.subscribe(subscriptions);

        // 验证一致的行为
        expect(result.success).toBe(true);
        expect(result.summary.successful).toBe(subscriptions.length);
        expect(result.summary.failed).toBe(0);
        expect(result.summary.existing).toBe(0);
        expect(result.successful).toHaveLength(subscriptions.length);

        // 验证所有订阅都处于活跃状态
        const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
        expect(activeSubscriptions).toHaveLength(subscriptions.length);
        
        activeSubscriptions.forEach(sub => {
          expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
          expect(sub.messageCount).toBe(0);
          expect(sub.errorCount).toBe(0);
        });
      }
    });

    it('应该在订阅取消操作中保持一致行为', async () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER }),
        testUtils.createTestSubscription({ symbol: 'BNBUSDT', dataType: DataType.KLINE_1M })
      ];

      // 添加订阅
      await subscriptionManager.subscribe(subscriptions);
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(3);

      // 逐一取消订阅
      for (let i = 0; i < subscriptions.length; i++) {
        const result = await subscriptionManager.unsubscribe([subscriptions[i]]);
        
        expect(result.success).toBe(true);
        expect(result.summary.successful).toBe(1);
        expect(result.summary.failed).toBe(0);
        
        const remainingCount = subscriptions.length - i - 1;
        expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(remainingCount);
      }

      // 尝试取消已经不存在的订阅
      const result = await subscriptionManager.unsubscribe([subscriptions[0]]);
      expect(result.success).toBe(true);
      expect(result.summary.successful).toBe(0);
      expect(result.summary.existing).toBe(1);
    });
  });

  describe('RT-2.2.9: 事件触发一致性', () => {
    it('应该为相同操作一致地触发事件', async () => {
      const eventLogs: Array<{ operation: string; events: string[] }> = [];

      // 监听所有事件
      const events = Object.values(SubscriptionEvent);
      const eventCounters = events.reduce((acc, event) => {
        acc[event] = 0;
        return acc;
      }, {} as Record<string, number>);

      events.forEach(event => {
        subscriptionManager.on(event, () => {
          eventCounters[event]++;
        });
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 执行多次相同的操作序列
      for (let round = 0; round < 3; round++) {
        const initialCounts = { ...eventCounters };

        // 添加订阅
        await subscriptionManager.subscribe([subscription]);
        
        // 发送数据
        subscriptionManager.handleStreamData('btcusdt@trade', { price: '50000' }, 'connection-1');
        
        // 取消订阅
        await subscriptionManager.unsubscribe([subscription]);

        // 记录事件变化
        const eventChanges: string[] = [];
        for (const event of events) {
          if (eventCounters[event] > initialCounts[event]) {
            eventChanges.push(event);
          }
        }

        eventLogs.push({
          operation: `round-${round}`,
          events: eventChanges
        });
      }

      // 验证每轮操作触发的事件一致
      for (let i = 1; i < eventLogs.length; i++) {
        expect(eventLogs[i].events).toEqual(eventLogs[0].events);
      }
    });

    it('应该在批量操作中一致地触发事件', async () => {
      const batchSizes = [1, 3, 5, 10];
      const eventCounts: number[] = [];

      for (const batchSize of batchSizes) {
        let addedEventCount = 0;
        let removedEventCount = 0;

        const addedHandler = () => { addedEventCount++; };
        const removedHandler = () => { removedEventCount++; };

        subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, addedHandler);
        subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_REMOVED, removedHandler);

        // 创建批量订阅
        const subscriptions = Array(batchSize).fill(null).map((_, i) => 
          testUtils.createTestSubscription({
            symbol: `SYMBOL${i}USDT`,
            dataType: DataType.TRADE
          })
        );

        // 批量添加
        await subscriptionManager.subscribe(subscriptions);
        
        // 批量移除
        await subscriptionManager.unsubscribe(subscriptions);

        // 清理监听器
        subscriptionManager.off(SubscriptionEvent.SUBSCRIPTION_ADDED, addedHandler);
        subscriptionManager.off(SubscriptionEvent.SUBSCRIPTION_REMOVED, removedHandler);

        // 批量操作应该触发一次添加事件和一次移除事件
        expect(addedEventCount).toBe(1);
        expect(removedEventCount).toBe(1);
        
        eventCounts.push(addedEventCount + removedEventCount);
      }

      // 无论批量大小如何，事件数量应该一致
      expect(eventCounts.every(count => count === 2)).toBe(true);
    });

    it('应该在错误场景中一致地触发事件', async () => {
      const errorEventCounts: number[] = [];

      const invalidSubscriptions = [
        testUtils.createTestSubscription({ symbol: 'INVALID-SYMBOL', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ANOTHER-INVALID', dataType: DataType.TRADE })
      ];

      for (let attempt = 0; attempt < 3; attempt++) {
        let errorEventCount = 0;
        
        const errorHandler = () => { errorEventCount++; };
        subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ERROR, errorHandler);

        try {
          await subscriptionManager.subscribe(invalidSubscriptions);
        } catch (error) {
          // 预期的错误
        }

        subscriptionManager.off(SubscriptionEvent.SUBSCRIPTION_ERROR, errorHandler);
        errorEventCounts.push(errorEventCount);
      }

      // 每次尝试应该产生相同数量的错误事件
      expect(errorEventCounts.every(count => count === errorEventCounts[0])).toBe(true);
    });
  });

  describe('RT-2.2.10: 错误处理一致性', () => {
    it('应该为相同错误条件产生一致的错误响应', async () => {
      const invalidSubscription = testUtils.createTestSubscription({
        symbol: 'INVALID-SYMBOL',
        dataType: DataType.TRADE
      });

      const errorResults = [];

      // 多次尝试相同的无效订阅
      for (let i = 0; i < 5; i++) {
        const result = await subscriptionManager.subscribe([invalidSubscription]);
        errorResults.push(result);
      }

      // 验证所有错误结果的一致性
      errorResults.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.summary.successful).toBe(0);
        expect(result.summary.failed).toBe(1);
        expect(result.failed).toHaveLength(1);
        
        const failure = result.failed[0];
        expect(failure.subscription).toEqual(invalidSubscription);
        expect(failure.error.message).toContain('Invalid symbol format');
        expect(failure.retryCount).toBe(0);
      });
    });

    it('应该在不同错误类型中保持一致的错误结构', async () => {
      const errorScenarios = [
        {
          name: 'invalid_symbol',
          subscription: testUtils.createTestSubscription({ 
            symbol: 'INVALID-SYMBOL', 
            dataType: DataType.TRADE 
          }),
          expectedMessage: 'Invalid symbol format'
        },
        {
          name: 'empty_symbol',
          subscription: testUtils.createTestSubscription({ 
            symbol: '', 
            dataType: DataType.TRADE 
          }),
          expectedMessage: 'Symbol must be a non-empty string'
        }
      ];

      for (const scenario of errorScenarios) {
        const result = await subscriptionManager.subscribe([scenario.subscription]);
        
        expect(result.success).toBe(false);
        expect(result.failed).toHaveLength(1);
        
        const failure = result.failed[0];
        expect(failure).toHaveProperty('subscription');
        expect(failure).toHaveProperty('error');
        expect(failure).toHaveProperty('retryCount');
        
        expect(failure.error).toHaveProperty('code');
        expect(failure.error).toHaveProperty('message');
        expect(failure.error).toHaveProperty('timestamp');
        expect(failure.error).toHaveProperty('retryable');
        
        expect(failure.error.message).toContain(scenario.expectedMessage);
        expect(typeof failure.error.timestamp).toBe('number');
        expect(typeof failure.error.retryable).toBe('boolean');
      }
    });

    it('应该在流名称构建错误中保持一致性', () => {
      const invalidScenarios = [
        { symbol: 'INVALID-SYMBOL', dataType: DataType.TRADE },
        { symbol: 'ANOTHER@INVALID', dataType: DataType.TRADE },
        { symbol: 'THIRD_INVALID', dataType: DataType.TRADE }
      ];

      invalidScenarios.forEach(scenario => {
        expect(() => streamBuilder.buildStreamName(scenario))
          .toThrow('Invalid symbol format');
      });
    });
  });

  describe('RT-2.2.11: 状态管理一致性', () => {
    it('应该在订阅生命周期中保持一致的状态转换', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 添加订阅
      await subscriptionManager.subscribe([subscription]);
      let activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);

      // 模拟数据接收，状态应该保持活跃
      subscriptionManager.handleStreamData('btcusdt@trade', { price: '50000' }, 'connection-1');
      activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
      expect(activeSubscriptions[0].messageCount).toBe(1);

      // 模拟错误，状态应该仍然活跃但有错误计数
      subscriptionManager.handleSubscriptionError('btcusdt@trade', new Error('Test error'), 'connection-1');
      activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
      expect(activeSubscriptions[0].errorCount).toBe(1);

      // 取消订阅后应该不再活跃
      await subscriptionManager.unsubscribe([subscription]);
      activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(0);
    });

    it('应该在批量操作中保持状态一致性', async () => {
      const subscriptions = Array(10).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      // 批量添加
      await subscriptionManager.subscribe(subscriptions);
      
      let activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(10);
      
      // 所有订阅应该处于相同的初始状态
      activeSubscriptions.forEach(sub => {
        expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
        expect(sub.messageCount).toBe(0);
        expect(sub.errorCount).toBe(0);
        expect(sub.subscribedAt).toBeGreaterThan(0);
        expect(sub.lastActiveAt).toBeGreaterThan(0);
      });

      // 为所有订阅生成相同的数据
      activeSubscriptions.forEach(sub => {
        subscriptionManager.handleStreamData(sub.streamName, { price: '50000' }, sub.connectionId);
      });

      activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      
      // 所有订阅的状态应该一致更新
      activeSubscriptions.forEach(sub => {
        expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
        expect(sub.messageCount).toBe(1);
        expect(sub.errorCount).toBe(0);
      });
    });

    it('应该在统计信息中保持数据一致性', async () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TICKER }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TRADE })
      ];

      await subscriptionManager.subscribe(subscriptions);

      const stats = subscriptionManager.getSubscriptionStats();

      // 验证统计数据的一致性
      expect(stats.total).toBe(3);
      expect(stats.byStatus[SubscriptionStatus.ACTIVE]).toBe(3);
      expect(stats.byDataType[DataType.TRADE]).toBe(2);
      expect(stats.byDataType[DataType.TICKER]).toBe(1);
      expect(stats.bySymbol['BTCUSDT']).toBe(2);
      expect(stats.bySymbol['ETHUSDT']).toBe(1);

      // 总计应该匹配各项分组的总和
      const statusTotal = Object.values(stats.byStatus).reduce((sum, count) => sum + count, 0);
      expect(statusTotal).toBe(stats.total);

      const typeTotal = Object.values(stats.byDataType).reduce((sum, count) => sum + count, 0);
      expect(typeTotal).toBe(stats.total);

      const symbolTotal = Object.values(stats.bySymbol).reduce((sum, count) => sum + count, 0);
      expect(symbolTotal).toBe(stats.total);
    });
  });

  describe('RT-2.2.12: 性能行为一致性', () => {
    it('应该在相同负载下保持一致的性能特征', async () => {
      const performanceMetrics: number[] = [];

      // 执行多轮相同的性能测试
      for (let round = 0; round < 5; round++) {
        await subscriptionManager.clearAllSubscriptions();

        const subscriptions = Array(50).fill(null).map((_, i) => 
          testUtils.createTestSubscription({
            symbol: `ROUND${round}SYMBOL${i}USDT`,
            dataType: DataType.TRADE
          })
        );

        const { duration } = testUtils.measurePerformance(async () => {
          await subscriptionManager.subscribe(subscriptions);
        });

        performanceMetrics.push(duration);
      }

      // 计算性能差异
      const average = performanceMetrics.reduce((sum, time) => sum + time, 0) / performanceMetrics.length;
      const maxDeviation = Math.max(...performanceMetrics.map(time => Math.abs(time - average)));

      // 性能差异应该在合理范围内（不超过平均值的50%）
      expect(maxDeviation).toBeLessThan(average * 0.5);
    });

    it('应该在不同数据规模下保持线性性能特征', async () => {
      const scales = [10, 20, 50, 100];
      const performanceResults: Array<{ scale: number; duration: number }> = [];

      for (const scale of scales) {
        await subscriptionManager.clearAllSubscriptions();

        const subscriptions = Array(scale).fill(null).map((_, i) => 
          testUtils.createTestSubscription({
            symbol: `SCALE${scale}SYMBOL${i}USDT`,
            dataType: DataType.TRADE
          })
        );

        const { duration } = testUtils.measurePerformance(async () => {
          await subscriptionManager.subscribe(subscriptions);
        });

        performanceResults.push({ scale, duration });
      }

      // 验证性能增长是可预测的（大致线性）
      for (let i = 1; i < performanceResults.length; i++) {
        const current = performanceResults[i];
        const previous = performanceResults[i - 1];
        
        const scaleRatio = current.scale / previous.scale;
        const timeRatio = current.duration / previous.duration;

        // 时间增长应该不超过规模增长的2倍（允许一些非线性开销）
        expect(timeRatio).toBeLessThan(scaleRatio * 2);
      }
    });
  });

  describe('RT-2.2.13: 并发行为一致性', () => {
    it('应该在并发操作中保持一致的结果', async () => {
      const concurrentOperations = Array(10).fill(null).map((_, i) => 
        subscriptionManager.subscribe([
          testUtils.createTestSubscription({
            symbol: `CONCURRENT${i}USDT`,
            dataType: DataType.TRADE
          })
        ])
      );

      const results = await Promise.all(concurrentOperations);

      // 所有并发操作都应该成功
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.summary.successful).toBe(1);
        expect(result.summary.failed).toBe(0);
      });

      // 最终状态应该包含所有订阅
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(10);
    });

    it('应该在并发数据处理中保持状态一致性', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 并发发送大量数据
      const dataPromises = Array(100).fill(null).map((_, i) => 
        Promise.resolve().then(() => {
          subscriptionManager.handleStreamData('btcusdt@trade', { price: `${50000 + i}` }, 'connection-1');
        })
      );

      await Promise.all(dataPromises);

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].messageCount).toBe(100);
    });
  });

  describe('RT-2.2.14: 资源管理一致性', () => {
    it('应该在多次清理操作中保持一致的内存释放', async () => {
      const memorySnapshots: number[] = [];

      for (let cycle = 0; cycle < 5; cycle++) {
        // 创建大量订阅
        const subscriptions = Array(200).fill(null).map((_, i) => 
          testUtils.createTestSubscription({
            symbol: `CYCLE${cycle}SYMBOL${i}USDT`,
            dataType: DataType.TRADE
          })
        );

        await subscriptionManager.subscribe(subscriptions);

        // 生成一些数据
        const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
        activeSubscriptions.forEach(sub => {
          subscriptionManager.handleStreamData(sub.streamName, { price: '50000' }, sub.connectionId);
        });

        // 清理所有订阅
        await subscriptionManager.clearAllSubscriptions();

        // 强制垃圾回收（如果可用）
        if (global.gc) {
          global.gc();
        }

        memorySnapshots.push(process.memoryUsage().heapUsed);
      }

      // 内存使用应该在相似水平，不应该持续增长
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      
      // 最后的内存使用不应该显著高于第一次（允许一些合理的增长）
      expect(lastSnapshot).toBeLessThan(firstSnapshot * 1.5);
    });

    it('应该在生命周期管理中保持一致的资源释放', async () => {
      for (let iteration = 0; iteration < 3; iteration++) {
        const manager = new SubscriptionManager();
        await manager.initialize(mockConfig);

        // 使用管理器
        const subscription = testUtils.createTestSubscription({
          symbol: 'BTCUSDT',
          dataType: DataType.TRADE
        });

        await manager.subscribe([subscription]);
        expect(manager.getActiveSubscriptions()).toHaveLength(1);

        // 销毁管理器
        await manager.destroy();

        // 销毁后应该无法使用
        await expect(manager.subscribe([subscription]))
          .rejects.toThrow('SubscriptionManager is not initialized');
      }
    });
  });
});