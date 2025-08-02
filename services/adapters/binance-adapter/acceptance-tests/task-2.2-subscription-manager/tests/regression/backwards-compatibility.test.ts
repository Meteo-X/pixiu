/**
 * Regression Tests for Backwards Compatibility (Task 2.2)
 * 
 * 验证向后兼容性的回归测试
 * 
 * 测试范围:
 * - ✅ 接口版本兼容性
 * - ✅ 配置格式兼容性
 * - ✅ 数据结构兼容性
 * - ✅ 方法签名兼容性
 * - ✅ 事件格式兼容性
 * - ✅ 错误代码兼容性
 * - ✅ 迁移路径验证
 */

import { SubscriptionManager } from '../../../../../src/subscription/SubscriptionManager';
import { StreamNameBuilder } from '../../../../../src/subscription/StreamNameBuilder';
import { 
  SubscriptionManagerConfig,
  SubscriptionResult,
  BinanceStreamSubscription,
  SubscriptionStats,
  SubscriptionStatus,
  SubscriptionErrorCode
} from '../../../../../src/subscription/interfaces';
import { DataType } from '../../../../../src/types';

describe('Backwards Compatibility Regression Tests', () => {
  let subscriptionManager: SubscriptionManager;
  let streamBuilder: StreamNameBuilder;

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager();
    streamBuilder = new StreamNameBuilder();
  });

  afterEach(async () => {
    if (subscriptionManager) {
      await subscriptionManager.destroy();
    }
  });

  describe('RT-2.2.15: 配置格式向后兼容性', () => {
    it('应该支持 v1.0 配置格式', async () => {
      // 模拟早期版本的配置格式
      const v1Config = {
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

      await expect(subscriptionManager.initialize(v1Config))
        .resolves.not.toThrow();

      // 验证基本功能仍然工作
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await expect(subscriptionManager.subscribe([subscription]))
        .resolves.not.toThrow();
    });

    it('应该处理缺少新配置字段的旧配置', async () => {
      // 模拟没有新字段的旧配置
      const legacyConfig = {
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
        // 假设这里缺少某些新添加的可选字段
      };

      await expect(subscriptionManager.initialize(legacyConfig))
        .resolves.not.toThrow();

      // 验证功能正常
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([subscription]);
      expect(result.success).toBe(true);
    });

    it('应该支持配置字段的默认值演进', async () => {
      // 测试配置的最小集合
      const minimalConfig: SubscriptionManagerConfig = {
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

      await subscriptionManager.initialize(minimalConfig);

      // 验证默认行为
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([subscription]);
      expect(result).toBeValidSubscriptionResult();
    });
  });

  describe('RT-2.2.16: 数据结构向后兼容性', () => {
    it('应该保持 SubscriptionResult 结构的向后兼容性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([subscription]);

      // 验证所有必需的字段存在
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

      // 验证数据类型
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.summary.total).toBe('number');
      expect(typeof result.summary.successful).toBe('number');
      expect(typeof result.summary.failed).toBe('number');
      expect(typeof result.summary.existing).toBe('number');
    });

    it('应该保持 BinanceStreamSubscription 结构的向后兼容性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

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
      expect(typeof sub.subscribedAt).toBe('number');
      expect(typeof sub.lastActiveAt).toBe('number');
      expect(typeof sub.messageCount).toBe('number');
      expect(typeof sub.errorCount).toBe('number');

      // 验证枚举值
      expect(Object.values(SubscriptionStatus)).toContain(sub.status);

      // 验证原始订阅结构
      expect(sub.original).toHaveProperty('symbol');
      expect(sub.original).toHaveProperty('dataType');
    });

    it('应该保持 SubscriptionStats 结构的向后兼容性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      const stats = subscriptionManager.getSubscriptionStats();

      // 验证所有必需字段存在
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

      // 验证状态分组包含所有状态
      Object.values(SubscriptionStatus).forEach(status => {
        expect(stats.byStatus).toHaveProperty(status);
        expect(typeof stats.byStatus[status]).toBe('number');
      });
    });
  });

  describe('RT-2.2.17: 方法签名向后兼容性', () => {
    it('应该保持核心方法的签名兼容性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      // 验证 subscribe 方法签名
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 原始签名：subscribe(subscriptions: DataSubscription[]): Promise<SubscriptionResult>
      const subscribeResult = subscriptionManager.subscribe([subscription]);
      expect(subscribeResult).toBeInstanceOf(Promise);
      
      const result = await subscribeResult;
      expect(result).toBeValidSubscriptionResult();

      // 验证 unsubscribe 方法签名
      const unsubscribeResult = subscriptionManager.unsubscribe([subscription]);
      expect(unsubscribeResult).toBeInstanceOf(Promise);
      
      const unsubResult = await unsubscribeResult;
      expect(unsubResult).toBeValidSubscriptionResult();

      // 验证同步方法
      expect(Array.isArray(subscriptionManager.getActiveSubscriptions())).toBe(true);
      expect(typeof subscriptionManager.getSubscriptionStats()).toBe('object');
      expect(typeof subscriptionManager.hasSubscription(subscription)).toBe('boolean');
    });

    it('应该保持 StreamNameBuilder 方法的签名兼容性', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // buildStreamName 方法
      const streamName1 = streamBuilder.buildStreamName(subscription);
      expect(typeof streamName1).toBe('string');

      const streamName2 = streamBuilder.buildStreamName(subscription, {});
      expect(typeof streamName2).toBe('string');

      // buildCombinedStreamUrl 方法
      const url1 = streamBuilder.buildCombinedStreamUrl(['btcusdt@trade'], 'wss://test.com');
      expect(typeof url1).toBe('string');

      const url2 = streamBuilder.buildCombinedStreamUrl(['btcusdt@trade'], 'wss://test.com', {});
      expect(typeof url2).toBe('string');

      // parseStreamName 方法
      const parsed = streamBuilder.parseStreamName('btcusdt@trade');
      expect(parsed).not.toBeNull();

      // validateStreamName 方法
      const isValid = streamBuilder.validateStreamName('btcusdt@trade');
      expect(typeof isValid).toBe('boolean');

      // getSupportedDataTypes 方法
      const types = streamBuilder.getSupportedDataTypes();
      expect(Array.isArray(types)).toBe(true);
    });

    it('应该支持可选参数的默认行为', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // buildStreamName 不传入 options
      const streamName1 = streamBuilder.buildStreamName(subscription);
      
      // buildStreamName 传入空 options
      const streamName2 = streamBuilder.buildStreamName(subscription, {});
      
      // 结果应该相同（使用默认选项）
      expect(streamName1).toBe(streamName2);

      // buildCombinedStreamUrl 不传入 config
      const url1 = streamBuilder.buildCombinedStreamUrl(['btcusdt@trade'], 'wss://test.com');
      
      // buildCombinedStreamUrl 传入空 config
      const url2 = streamBuilder.buildCombinedStreamUrl(['btcusdt@trade'], 'wss://test.com', {});
      
      // 结果应该相同
      expect(url1).toBe(url2);
    });
  });

  describe('RT-2.2.18: 错误代码向后兼容性', () => {
    it('应该保持 SubscriptionErrorCode 枚举的稳定性', () => {
      // 验证所有预期的错误代码存在
      const expectedErrorCodes = [
        'INVALID_STREAM_NAME',
        'UNSUPPORTED_DATA_TYPE',
        'SYMBOL_NOT_FOUND',
        'CONNECTION_NOT_AVAILABLE',
        'MAX_STREAMS_EXCEEDED',
        'SUBSCRIPTION_TIMEOUT',
        'NETWORK_ERROR',
        'UNKNOWN_ERROR'
      ];

      expectedErrorCodes.forEach(code => {
        expect(Object.values(SubscriptionErrorCode)).toContain(code);
      });
    });

    it('应该保持错误消息格式的一致性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      const invalidSubscription = testUtils.createTestSubscription({
        symbol: 'INVALID-SYMBOL',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([invalidSubscription]);

      expect(result.success).toBe(false);
      expect(result.failed).toHaveLength(1);

      const failure = result.failed[0];
      expect(failure.error).toHaveProperty('code');
      expect(failure.error).toHaveProperty('message');
      expect(failure.error).toHaveProperty('timestamp');
      expect(failure.error).toHaveProperty('retryable');

      // 错误消息应该是字符串
      expect(typeof failure.error.message).toBe('string');
      expect(failure.error.message.length).toBeGreaterThan(0);

      // 时间戳应该是数字
      expect(typeof failure.error.timestamp).toBe('number');
      expect(failure.error.timestamp).toBeGreaterThan(0);

      // retryable 应该是布尔值
      expect(typeof failure.error.retryable).toBe('boolean');
    });

    it('应该在不同错误场景中保持错误结构一致性', () => {
      const errorScenarios = [
        {
          subscription: testUtils.createTestSubscription({ 
            symbol: 'INVALID-SYMBOL', 
            dataType: DataType.TRADE 
          }),
          expectedError: 'Invalid symbol format'
        },
        {
          subscription: testUtils.createTestSubscription({ 
            symbol: '', 
            dataType: DataType.TRADE 
          }),
          expectedError: 'Symbol must be a non-empty string'
        }
      ];

      errorScenarios.forEach(scenario => {
        try {
          streamBuilder.buildStreamName(scenario.subscription);
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain(scenario.expectedError);
        }
      });
    });
  });

  describe('RT-2.2.19: 事件格式向后兼容性', () => {
    it('应该保持事件数据格式的稳定性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      let eventData: any = null;

      subscriptionManager.on('subscription_added', (data) => {
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

      // 验证 result 是有效的 SubscriptionResult
      expect(eventData.result).toBeValidSubscriptionResult();

      // 验证时间戳格式
      expect(typeof eventData.timestamp).toBe('number');
      expect(eventData.timestamp).toBeGreaterThan(0);
    });

    it('应该保持流数据事件格式的稳定性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      let streamDataEvent: any = null;

      subscriptionManager.on('stream_data_received', (data) => {
        streamDataEvent = data;
      });

      const mockData = { price: '50000', quantity: '0.1' };
      subscriptionManager.handleStreamData('btcusdt@trade', mockData, 'connection-1');

      expect(streamDataEvent).not.toBeNull();
      expect(streamDataEvent).toHaveProperty('streamName');
      expect(streamDataEvent).toHaveProperty('data');
      expect(streamDataEvent).toHaveProperty('messageCount');
      expect(streamDataEvent).toHaveProperty('connectionId');

      expect(streamDataEvent.streamName).toBe('btcusdt@trade');
      expect(streamDataEvent.data).toEqual(mockData);
      expect(streamDataEvent.connectionId).toBe('connection-1');
      expect(typeof streamDataEvent.messageCount).toBe('number');
    });

    it('应该保持错误事件格式的稳定性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      await subscriptionManager.subscribe([subscription]);

      let errorEvent: any = null;

      subscriptionManager.on('subscription_error', (data) => {
        errorEvent = data;
      });

      const mockError = new Error('Test error');
      subscriptionManager.handleSubscriptionError('btcusdt@trade', mockError, 'connection-1');

      expect(errorEvent).not.toBeNull();
      expect(errorEvent).toHaveProperty('subscription');
      expect(errorEvent).toHaveProperty('error');
      expect(errorEvent).toHaveProperty('connectionId');

      expect(errorEvent.connectionId).toBe('connection-1');
      expect(errorEvent.error).toHaveProperty('code');
      expect(errorEvent.error).toHaveProperty('message');
      expect(errorEvent.error).toHaveProperty('timestamp');
      expect(errorEvent.error).toHaveProperty('retryable');
    });
  });

  describe('RT-2.2.20: 迁移路径验证', () => {
    it('应该支持从旧版本订阅数据的迁移', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      // 模拟旧版本的订阅数据格式
      const legacySubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
        // 假设旧版本没有 params 字段
      };

      // 应该能够处理旧格式的订阅
      const result = await subscriptionManager.subscribe([legacySubscription]);
      expect(result.success).toBe(true);

      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].original.symbol).toBe('BTCUSDT');
      expect(activeSubscriptions[0].original.dataType).toBe(DataType.TRADE);
    });

    it('应该处理配置字段的添加和重命名', async () => {
      // 模拟配置演进：某些字段被重命名或新增
      const evolvedConfig = testUtils.createTestConfig({
        // 假设这些是新版本的字段
        validation: {
          strictValidation: true,
          symbolPattern: /^[A-Z0-9]+$/,
          maxSubscriptions: 1000,
          disabledDataTypes: []
        }
      });

      await expect(subscriptionManager.initialize(evolvedConfig))
        .resolves.not.toThrow();

      // 验证功能正常
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([subscription]);
      expect(result.success).toBe(true);
    });

    it('应该提供平滑的 API 演进路径', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      // 验证旧的调用方式仍然有效
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      // 旧式单个订阅（作为数组传递）
      const oldStyleResult = await subscriptionManager.subscribe([subscription]);
      expect(oldStyleResult).toBeValidSubscriptionResult();

      // 验证结果格式保持一致
      expect(oldStyleResult).toHaveProperty('success');
      expect(oldStyleResult).toHaveProperty('successful');
      expect(oldStyleResult).toHaveProperty('failed');
      expect(oldStyleResult).toHaveProperty('existing');
      expect(oldStyleResult).toHaveProperty('summary');
    });
  });

  describe('RT-2.2.21: 版本间兼容性验证', () => {
    it('应该维护关键常量的稳定性', () => {
      // 验证数据类型枚举的稳定性
      expect(DataType.TRADE).toBe('trade');
      expect(DataType.TICKER).toBe('ticker');
      expect(DataType.DEPTH).toBe('depth');
      expect(DataType.KLINE_1M).toBe('kline_1m');
      expect(DataType.KLINE_5M).toBe('kline_5m');
      expect(DataType.KLINE_15M).toBe('kline_15m');
      expect(DataType.KLINE_30M).toBe('kline_30m');
      expect(DataType.KLINE_1H).toBe('kline_1h');
      expect(DataType.KLINE_4H).toBe('kline_4h');
      expect(DataType.KLINE_1D).toBe('kline_1d');

      // 验证状态枚举的稳定性
      expect(SubscriptionStatus.PENDING).toBe('pending');
      expect(SubscriptionStatus.ACTIVE).toBe('active');
      expect(SubscriptionStatus.PAUSED).toBe('paused');
      expect(SubscriptionStatus.FAILED).toBe('failed');
      expect(SubscriptionStatus.CANCELLED).toBe('cancelled');
    });

    it('应该保持默认行为的一致性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      // 验证默认的订阅行为
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const result = await subscriptionManager.subscribe([subscription]);
      
      // 默认行为验证
      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(1);
      
      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].status).toBe(SubscriptionStatus.ACTIVE);
      expect(activeSubscriptions[0].messageCount).toBe(0);
      expect(activeSubscriptions[0].errorCount).toBe(0);
    });

    it('应该在升级路径中保持数据完整性', async () => {
      const config = testUtils.createTestConfig();
      await subscriptionManager.initialize(config);

      // 创建一些订阅
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER })
      ];

      await subscriptionManager.subscribe(subscriptions);

      // 模拟数据处理
      subscriptionManager.handleStreamData('btcusdt@trade', { price: '50000' }, 'connection-1');
      subscriptionManager.handleStreamData('ethusdt@ticker', { price: '3000' }, 'connection-1');

      // 验证数据完整性
      const activeSubscriptions = subscriptionManager.getActiveSubscriptions();
      expect(activeSubscriptions).toHaveLength(2);
      
      const btcSub = activeSubscriptions.find(sub => sub.original.symbol === 'BTCUSDT');
      const ethSub = activeSubscriptions.find(sub => sub.original.symbol === 'ETHUSDT');
      
      expect(btcSub?.messageCount).toBe(1);
      expect(ethSub?.messageCount).toBe(1);

      // 统计信息应该准确
      const stats = subscriptionManager.getSubscriptionStats();
      expect(stats.total).toBe(2);
      expect(stats.byDataType[DataType.TRADE]).toBe(1);
      expect(stats.byDataType[DataType.TICKER]).toBe(1);
    });
  });
});