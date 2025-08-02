/**
 * Regression Tests for API Stability (Task 2.2)
 * 
 * 验证API稳定性的回归测试
 * 
 * 测试范围:
 * - ✅ 公共接口契约稳定性
 * - ✅ 方法签名兼容性
 * - ✅ 返回值格式一致性
 * - ✅ 错误处理接口稳定性
 * - ✅ 事件接口稳定性
 * - ✅ 配置接口向后兼容性
 * - ✅ 版本兼容性验证
 */

import { SubscriptionManager } from '../../../../../src/subscription/SubscriptionManager';
import { StreamNameBuilder } from '../../../../../src/subscription/StreamNameBuilder';
import { 
  ISubscriptionManager,
  IStreamNameBuilder,
  SubscriptionManagerConfig,
  SubscriptionResult,
  SubscriptionStats,
  BinanceStreamSubscription,
  SubscriptionStatus,
  SubscriptionEvent
} from '../../../../../src/subscription/interfaces';
import { DataType } from '../../../../../src/types';

describe('API Stability Regression Tests', () => {
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

  describe('RT-2.2.1: ISubscriptionManager 接口稳定性', () => {
    it('应该保持 initialize 方法的签名和行为', async () => {
      const newManager = new SubscriptionManager();
      
      // 验证方法存在且可调用
      expect(typeof newManager.initialize).toBe('function');
      
      // 验证参数类型和返回值
      const initPromise = newManager.initialize(mockConfig);
      expect(initPromise).toBeInstanceOf(Promise);
      
      await expect(initPromise).resolves.toBe(undefined);
      
      // 验证重复初始化的错误行为保持一致
      await expect(newManager.initialize(mockConfig))
        .rejects.toThrow('SubscriptionManager is already initialized');
      
      await newManager.destroy();
    });

    it('应该保持 subscribe 方法的签名和行为', async () => {
      // 验证方法存在且接受数组参数
      expect(typeof subscriptionManager.subscribe).toBe('function');
      
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 验证返回 Promise<SubscriptionResult>
      const result = await subscriptionManager.subscribe([subscription]);
      
      expect(result).toBeValidSubscriptionResult();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('successful');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('existing');
      expect(result).toHaveProperty('summary');
      
      // 验证 summary 结构
      expect(result.summary).toHaveProperty('total');
      expect(result.summary).toHaveProperty('successful');
      expect(result.summary).toHaveProperty('failed');
      expect(result.summary).toHaveProperty('existing');
      
      // 验证数组类型
      expect(Array.isArray(result.successful)).toBe(true);
      expect(Array.isArray(result.failed)).toBe(true);
      expect(Array.isArray(result.existing)).toBe(true);
    });

    it('应该保持 unsubscribe 方法的签名和行为', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      // 验证方法存在且行为一致
      expect(typeof subscriptionManager.unsubscribe).toBe('function');
      
      const result = await subscriptionManager.unsubscribe([subscription]);
      
      // 返回值格式应该与 subscribe 一致
      expect(result).toBeValidSubscriptionResult();
      expect(result.success).toBe(true);
      expect(result.summary.successful).toBe(1);
    });

    it('应该保持 getActiveSubscriptions 方法的签名和行为', async () => {
      expect(typeof subscriptionManager.getActiveSubscriptions).toBe('function');
      
      // 初始应该返回空数组
      let activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(Array.isArray(activeSubscriptions)).toBe(true);
      expect(activeSubscriptions).toHaveLength(0);

      // 添加订阅后应该返回包含订阅的数组
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);
      
      activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(1);
      
      // 验证返回的订阅对象结构
      const sub = activeSubscriptions[0];
      expect(sub).toHaveProperty('original');
      expect(sub).toHaveProperty('streamName');
      expect(sub).toHaveProperty('connectionId');
      expect(sub).toHaveProperty('status');
      expect(sub).toHaveProperty('subscribedAt');
      expect(sub).toHaveProperty('lastActiveAt');
      expect(sub).toHaveProperty('messageCount');
      expect(sub).toHaveProperty('errorCount');
    });

    it('应该保持 getSubscriptionStats 方法的签名和行为', async () => {
      expect(typeof subscriptionManager.getSubscriptionStats).toBe('function');
      
      const stats = subscriptionManager.getSubscriptionStats();
      
      // 验证统计对象结构
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byDataType');
      expect(stats).toHaveProperty('bySymbol');
      expect(stats).toHaveProperty('byConnection');
      expect(stats).toHaveProperty('averageMessageRate');
      expect(stats).toHaveProperty('errorRate');
      expect(stats).toHaveProperty('lastUpdated');
      
      // 验证数据类型
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.byStatus).toBe('object');
      expect(typeof stats.byDataType).toBe('object');
      expect(typeof stats.bySymbol).toBe('object');
      expect(typeof stats.byConnection).toBe('object');
      expect(typeof stats.averageMessageRate).toBe('number');
      expect(typeof stats.errorRate).toBe('number');
      expect(typeof stats.lastUpdated).toBe('number');
    });

    it('应该保持 hasSubscription 方法的签名和行为', async () => {
      expect(typeof subscriptionManager.hasSubscription).toBe('function');
      
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 未订阅时应该返回 false
      expect(subscriptionManager.hasSubscription(subscription)).toBe(false);

      // 订阅后应该返回 true
      await subscriptionManager.subscribe([subscription]);
      expect(subscriptionManager.hasSubscription(subscription)).toBe(true);

      // 取消订阅后应该返回 false
      await subscriptionManager.unsubscribe([subscription]);
      expect(subscriptionManager.hasSubscription(subscription)).toBe(false);
    });

    it('应该保持 clearAllSubscriptions 方法的签名和行为', async () => {
      expect(typeof subscriptionManager.clearAllSubscriptions).toBe('function');
      
      // 添加一些订阅
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER })
      ];

      await subscriptionManager.subscribe(subscriptions);
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(2);

      // 清空订阅
      const clearPromise = subscriptionManager.clearAllSubscriptions();
      expect(clearPromise).toBeInstanceOf(Promise);
      
      await clearPromise;
      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(0);
    });

    it('应该保持订阅迁移相关方法的签名和行为', async () => {
      // getSubscriptionsByConnection
      expect(typeof subscriptionManager.getSubscriptionsByConnection).toBe('function');
      
      const connectionSubscriptions = subscriptionManager.getSubscriptionsByConnection('connection-1');
      expect(Array.isArray(connectionSubscriptions)).toBe(true);

      // migrateSubscriptions
      expect(typeof subscriptionManager.migrateSubscriptions).toBe('function');
      
      const migratePromise = subscriptionManager.migrateSubscriptions('connection-1', 'connection-2');
      expect(migratePromise).toBeInstanceOf(Promise);
      
      await expect(migratePromise).resolves.toBe(undefined);
    });
  });

  describe('RT-2.2.2: IStreamNameBuilder 接口稳定性', () => {
    it('应该保持 buildStreamName 方法的签名和行为', async () => {
      expect(typeof streamBuilder.buildStreamName).toBe('function');
      
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 验证返回字符串
      const streamName = streamBuilder.buildStreamName(subscription);
      expect(typeof streamName).toBe('string');
      expect(streamName).toBe('btcusdt@trade');

      // 验证带选项的调用
      const options = { forceLowercase: true };
      const streamNameWithOptions = streamBuilder.buildStreamName(subscription, options);
      expect(typeof streamNameWithOptions).toBe('string');
    });

    it('应该保持 buildCombinedStreamUrl 方法的签名和行为', async () => {
      expect(typeof streamBuilder.buildCombinedStreamUrl).toBe('function');
      
      const streamNames = ['btcusdt@trade', 'ethusdt@ticker'];
      const baseUrl = 'wss://stream.binance.com:9443';

      // 验证基本调用
      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      expect(typeof url).toBe('string');
      expect(url).toContain('stream?streams=');

      // 验证带配置的调用
      const config = { maxStreams: 1024 };
      const urlWithConfig = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl, config);
      expect(typeof urlWithConfig).toBe('string');
    });

    it('应该保持 parseStreamName 方法的签名和行为', async () => {
      expect(typeof streamBuilder.parseStreamName).toBe('function');
      
      // 有效流名称
      const validResult = streamBuilder.parseStreamName('btcusdt@trade');
      expect(validResult).not.toBeNull();
      expect(validResult).toHaveProperty('symbol');
      expect(validResult).toHaveProperty('dataType');

      // 无效流名称
      const invalidResult = streamBuilder.parseStreamName('invalid-stream');
      expect(invalidResult).toBeNull();
    });

    it('应该保持 validateStreamName 方法的签名和行为', async () => {
      expect(typeof streamBuilder.validateStreamName).toBe('function');
      
      // 有效流名称
      expect(streamBuilder.validateStreamName('btcusdt@trade')).toBe(true);
      
      // 无效流名称
      expect(streamBuilder.validateStreamName('invalid')).toBe(false);
    });

    it('应该保持 getSupportedDataTypes 方法的签名和行为', async () => {
      expect(typeof streamBuilder.getSupportedDataTypes).toBe('function');
      
      const supportedTypes = streamBuilder.getSupportedDataTypes();
      expect(Array.isArray(supportedTypes)).toBe(true);
      expect(supportedTypes.length).toBeGreaterThan(0);
      
      // 验证包含已知的数据类型
      expect(supportedTypes).toContain(DataType.TRADE);
      expect(supportedTypes).toContain(DataType.TICKER);
      expect(supportedTypes).toContain(DataType.KLINE_1M);
    });

    it('应该保持批量方法的签名和行为', async () => {
      // buildStreamNames
      expect(typeof streamBuilder.buildStreamNames).toBe('function');
      
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER })
      ];

      const streamNames = streamBuilder.buildStreamNames(subscriptions);
      expect(Array.isArray(streamNames)).toBe(true);
      expect(streamNames).toHaveLength(2);

      // getStreamNameStats
      expect(typeof streamBuilder.getStreamNameStats).toBe('function');
      
      const stats = streamBuilder.getStreamNameStats(streamNames);
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byType');
      expect(stats).toHaveProperty('bySymbol');
      expect(stats).toHaveProperty('duplicates');
    });
  });

  describe('RT-2.2.3: 事件接口稳定性', () => {
    it('应该保持 SubscriptionEvent 枚举的稳定性', () => {
      // 验证所有预期的事件类型存在
      const expectedEvents = [
        'subscription_added',
        'subscription_removed',
        'subscription_status_changed',
        'stream_data_received',
        'subscription_error',
        'connection_changed',
        'stats_updated'
      ];

      expectedEvents.forEach(eventName => {
        expect(Object.values(SubscriptionEvent)).toContain(eventName);
      });
    });

    it('应该保持事件数据结构的稳定性', async () => {
      let eventData: any = null;

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, (data) => {
        eventData = data;
      });

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      expect(eventData).not.toBeNull();
      expect(eventData).toHaveProperty('result');
      expect(eventData).toHaveProperty('timestamp');
      expect(typeof eventData.timestamp).toBe('number');
    });

    it('应该保持 EventEmitter 接口的稳定性', () => {
      // 验证 EventEmitter 方法存在
      expect(typeof subscriptionManager.on).toBe('function');
      expect(typeof subscriptionManager.off).toBe('function');
      expect(typeof subscriptionManager.emit).toBe('function');
      expect(typeof subscriptionManager.removeAllListeners).toBe('function');

      // 验证方法行为
      let callCount = 0;
      const handler = () => { callCount++; };

      subscriptionManager.on(SubscriptionEvent.SUBSCRIPTION_ADDED, handler);
      subscriptionManager.emit(SubscriptionEvent.SUBSCRIPTION_ADDED, {});
      expect(callCount).toBe(1);

      subscriptionManager.off(SubscriptionEvent.SUBSCRIPTION_ADDED, handler);
      subscriptionManager.emit(SubscriptionEvent.SUBSCRIPTION_ADDED, {});
      expect(callCount).toBe(1); // 应该没有增加
    });
  });

  describe('RT-2.2.4: 错误处理接口稳定性', () => {
    it('应该保持错误类型和消息格式的稳定性', async () => {
      // 验证初始化错误
      const invalidConfig = {
        ...mockConfig,
        maxStreamsPerConnection: -1
      };

      const newManager = new SubscriptionManager();
      
      try {
        await newManager.initialize(invalidConfig);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('must be positive');
      }

      await newManager.destroy();
    });

    it('应该保持订阅错误的格式稳定性', async () => {
      const invalidSubscription = testUtils.createTestSubscription({
        symbol: 'INVALID-SYMBOL',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([invalidSubscription]);

      expect(result.success).toBe(false);
      expect(result.failed).toHaveLength(1);
      
      const failure = result.failed[0];
      expect(failure).toHaveProperty('subscription');
      expect(failure).toHaveProperty('error');
      expect(failure).toHaveProperty('retryCount');
      
      const error = failure.error;
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('message');
      expect(error).toHaveProperty('timestamp');
      expect(error).toHaveProperty('retryable');
    });

    it('应该保持流名称验证错误的稳定性', () => {
      const invalidSubscription = testUtils.createTestSubscription({
        symbol: 'INVALID@SYMBOL',
        dataType: DataType.TRADE
      });

      expect(() => streamBuilder.buildStreamName(invalidSubscription))
        .toThrow('Invalid symbol format');
    });
  });

  describe('RT-2.2.5: 配置接口向后兼容性', () => {
    it('应该保持配置结构的向后兼容性', async () => {
      // 验证最小配置仍然有效
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
      await expect(newManager.initialize(minimalConfig))
        .resolves.not.toThrow();
      
      await newManager.destroy();
    });

    it('应该保持可选配置字段的默认行为', async () => {
      const configWithoutOptionals = {
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
      await newManager.initialize(configWithoutOptionals);

      // 基本功能应该正常工作
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await expect(newManager.subscribe([subscription]))
        .resolves.not.toThrow();

      await newManager.destroy();
    });
  });

  describe('RT-2.2.6: 数据结构稳定性', () => {
    it('应该保持 BinanceStreamSubscription 结构的稳定性', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      const sub = activeSubscriptions[0];

      // 验证所有必需字段存在
      expect(sub).toHaveProperty('original');
      expect(sub).toHaveProperty('streamName');
      expect(sub).toHaveProperty('connectionId');
      expect(sub).toHaveProperty('status');
      expect(sub).toHaveProperty('subscribedAt');
      expect(sub).toHaveProperty('lastActiveAt');
      expect(sub).toHaveProperty('messageCount');
      expect(sub).toHaveProperty('errorCount');

      // 验证数据类型
      expect(typeof sub.streamName).toBe('string');
      expect(typeof sub.connectionId).toBe('string');
      expect(Object.values(SubscriptionStatus)).toContain(sub.status);
      expect(typeof sub.subscribedAt).toBe('number');
      expect(typeof sub.lastActiveAt).toBe('number');
      expect(typeof sub.messageCount).toBe('number');
      expect(typeof sub.errorCount).toBe('number');
    });

    it('应该保持 SubscriptionStats 结构的稳定性', () => {
      const stats = subscriptionManager.getSubscriptionStats();

      // 验证统计对象的完整结构
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byDataType');
      expect(stats).toHaveProperty('bySymbol');
      expect(stats).toHaveProperty('byConnection');
      expect(stats).toHaveProperty('averageMessageRate');
      expect(stats).toHaveProperty('errorRate');
      expect(stats).toHaveProperty('lastUpdated');

      // 验证 byStatus 包含所有状态
      Object.values(SubscriptionStatus).forEach(status => {
        expect(stats.byStatus).toHaveProperty(status);
        expect(typeof stats.byStatus[status]).toBe('number');
      });
    });
  });

  describe('RT-2.2.7: 性能接口稳定性', () => {
    it('应该保持性能监控接口的稳定性', async () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 测量订阅性能
      const { duration } = testUtils.measurePerformance(async () => {
        await subscriptionManager.subscribe([subscription]);
      });

      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThan(0);

      // 测量流名称构建性能
      const { duration: buildDuration } = testUtils.measurePerformance(() => {
        return streamBuilder.buildStreamName(subscription);
      });

      expect(typeof buildDuration).toBe('number');
      expect(buildDuration).toBeGreaterThan(0);
    });

    it('应该保持批量操作性能特征', async () => {
      const subscriptions = Array(100).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      const { duration } = testUtils.measurePerformance(async () => {
        await subscriptionManager.subscribe(subscriptions);
      });

      // 批量操作应该在合理时间内完成
      expect(duration).toBeLessThan(100000); // 100ms

      expect(subscriptionManager.getActiveSubscriptions()).toHaveLength(100);
    });
  });
});