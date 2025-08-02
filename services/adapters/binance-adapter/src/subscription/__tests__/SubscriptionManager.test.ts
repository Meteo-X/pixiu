/**
 * SubscriptionManager 单元测试
 */

import { SubscriptionManager } from '../SubscriptionManager';
import { DataType, DataSubscription } from '../../types';
import { SubscriptionManagerConfig, SubscriptionStatus } from '../interfaces';

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;
  let config: SubscriptionManagerConfig;

  beforeEach(async () => {
    config = {
      baseWsUrl: 'wss://stream.binance.com:9443',
      maxStreamsPerConnection: 1024,
      subscriptionTimeout: 10000,
      autoResubscribe: true,
      retryConfig: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2.0,
        jitter: true
      },
      validation: {
        strictValidation: true,
        symbolPattern: /^[A-Z0-9]+$/,
        maxSubscriptions: 5000,
        disabledDataTypes: []
      }
    };

    manager = new SubscriptionManager();
    await manager.initialize(config);
  });

  afterEach(async () => {
    await manager.destroy();
  });

  describe('初始化', () => {
    it('应该正确初始化', async () => {
      const newManager = new SubscriptionManager();
      await expect(newManager.initialize(config)).resolves.not.toThrow();
      await newManager.destroy();
    });

    it('应该拒绝重复初始化', async () => {
      await expect(manager.initialize(config)).rejects.toThrow('already initialized');
    });
  });

  describe('订阅管理', () => {
    it('应该成功添加订阅', async () => {
      const subscriptions: DataSubscription[] = [
        { symbol: 'BTCUSDT', dataType: DataType.TRADE },
        { symbol: 'ETHUSDT', dataType: DataType.TICKER }
      ];

      const result = await manager.subscribe(subscriptions);

      expect(result.success).toBe(true);
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.summary.successful).toBe(2);
    });

    it('应该检测已存在的订阅', async () => {
      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      };

      // 第一次添加
      await manager.subscribe([subscription]);

      // 第二次添加相同订阅
      const result = await manager.subscribe([subscription]);

      expect(result.existing).toHaveLength(1);
      expect(result.successful).toHaveLength(0);
      expect(result.summary.existing).toBe(1);
    });

    it('应该成功移除订阅', async () => {
      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      };

      // 先添加订阅
      await manager.subscribe([subscription]);

      // 然后移除
      const result = await manager.unsubscribe([subscription]);

      expect(result.success).toBe(true);
      expect(result.successful).toHaveLength(1);
      expect(result.summary.successful).toBe(1);
    });

    it('应该处理移除不存在的订阅', async () => {
      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      };

      const result = await manager.unsubscribe([subscription]);

      expect(result.summary.existing).toBe(1);
      expect(result.summary.successful).toBe(0);
    });
  });

  describe('订阅验证', () => {
    it('应该拒绝禁用的数据类型', async () => {
      const configWithDisabled = {
        ...config,
        validation: {
          ...config.validation,
          disabledDataTypes: [DataType.TRADE]
        }
      };

      const newManager = new SubscriptionManager();
      await newManager.initialize(configWithDisabled);

      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      };

      const result = await newManager.subscribe([subscription]);

      expect(result.success).toBe(false);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error.message).toContain('Data type is disabled');

      await newManager.destroy();
    });

    it('应该验证交易对格式', async () => {
      const subscription: DataSubscription = {
        symbol: 'invalid-symbol',
        dataType: DataType.TRADE
      };

      const result = await manager.subscribe([subscription]);

      expect(result.success).toBe(false);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error.message).toContain('Invalid symbol format');
    });

    it('应该限制最大订阅数量', async () => {
      const limitedConfig = {
        ...config,
        validation: {
          ...config.validation,
          maxSubscriptions: 1
        }
      };

      const newManager = new SubscriptionManager();
      await newManager.initialize(limitedConfig);

      const subscriptions: DataSubscription[] = [
        { symbol: 'BTCUSDT', dataType: DataType.TRADE },
        { symbol: 'ETHUSDT', dataType: DataType.TRADE }
      ];

      await expect(newManager.subscribe(subscriptions))
        .rejects.toThrow('Would exceed maximum subscriptions');

      await newManager.destroy();
    });
  });

  describe('统计和监控', () => {
    it('应该提供正确的统计信息', async () => {
      const subscriptions: DataSubscription[] = [
        { symbol: 'BTCUSDT', dataType: DataType.TRADE },
        { symbol: 'ETHUSDT', dataType: DataType.TRADE },
        { symbol: 'BNBUSDT', dataType: DataType.TICKER }
      ];

      await manager.subscribe(subscriptions);

      const stats = manager.getSubscriptionStats();

      expect(stats.total).toBe(3);
      expect(stats.byStatus[SubscriptionStatus.ACTIVE]).toBe(3);
      expect(stats.byDataType[DataType.TRADE]).toBe(2);
      expect(stats.byDataType[DataType.TICKER]).toBe(1);
      expect(stats.bySymbol['BTCUSDT']).toBe(1);
      expect(stats.bySymbol['ETHUSDT']).toBe(1);
      expect(stats.bySymbol['BNBUSDT']).toBe(1);
    });

    it('应该正确检查订阅存在性', async () => {
      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      };

      expect(manager.hasSubscription(subscription)).toBe(false);

      await manager.subscribe([subscription]);

      expect(manager.hasSubscription(subscription)).toBe(true);
    });

    it('应该返回活跃订阅列表', async () => {
      const subscriptions: DataSubscription[] = [
        { symbol: 'BTCUSDT', dataType: DataType.TRADE },
        { symbol: 'ETHUSDT', dataType: DataType.TICKER }
      ];

      await manager.subscribe(subscriptions);

      const active = manager.getActiveSubscriptions();

      expect(active).toHaveLength(2);
      expect(active.every(sub => sub.status === SubscriptionStatus.ACTIVE)).toBe(true);
    });
  });

  describe('连接管理', () => {
    it('应该按连接分组订阅', async () => {
      const subscriptions: DataSubscription[] = [
        { symbol: 'BTCUSDT', dataType: DataType.TRADE },
        { symbol: 'ETHUSDT', dataType: DataType.TRADE }
      ];

      await manager.subscribe(subscriptions);

      // 假设所有订阅都分配到同一个连接
      const connectionSubs = manager.getSubscriptionsByConnection('connection-1');

      expect(connectionSubs).toHaveLength(2);
    });

    it('应该支持订阅迁移', async () => {
      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      };

      await manager.subscribe([subscription]);

      // 迁移订阅
      await manager.migrateSubscriptions('connection-1', 'connection-2');

      const oldConnectionSubs = manager.getSubscriptionsByConnection('connection-1');
      const newConnectionSubs = manager.getSubscriptionsByConnection('connection-2');

      expect(oldConnectionSubs).toHaveLength(0);
      expect(newConnectionSubs).toHaveLength(1);
      expect(newConnectionSubs[0]?.connectionId).toBe('connection-2');
    });
  });

  describe('清理和销毁', () => {
    it('应该清空所有订阅', async () => {
      const subscriptions: DataSubscription[] = [
        { symbol: 'BTCUSDT', dataType: DataType.TRADE },
        { symbol: 'ETHUSDT', dataType: DataType.TICKER }
      ];

      await manager.subscribe(subscriptions);
      expect(manager.getActiveSubscriptions()).toHaveLength(2);

      await manager.clearAllSubscriptions();
      expect(manager.getActiveSubscriptions()).toHaveLength(0);
    });

    it('应该正确销毁管理器', async () => {
      const subscriptions: DataSubscription[] = [
        { symbol: 'BTCUSDT', dataType: DataType.TRADE }
      ];

      await manager.subscribe(subscriptions);
      await expect(manager.destroy()).resolves.not.toThrow();
    });
  });

  describe('事件处理', () => {
    it('应该发出订阅事件', (done) => {
      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      };

      manager.once('subscription_added', (data) => {
        expect(data.result.successful).toHaveLength(1);
        done();
      });

      manager.subscribe([subscription]);
    });

    it('应该处理流数据', () => {
      const streamData = { test: 'data' };
      
      // 这个方法需要先有订阅存在
      manager.handleStreamData('btcusdt@trade', streamData, 'connection-1');
      
      // 由于没有匹配的订阅，应该不会有副作用
      expect(true).toBe(true); // 简单验证不抛错
    });
  });
});