/**
 * StreamNameBuilder 单元测试
 */

import { StreamNameBuilder } from '../StreamNameBuilder';
import { DataType, DataSubscription } from '../../types';

describe('StreamNameBuilder', () => {
  let builder: StreamNameBuilder;

  beforeEach(() => {
    builder = new StreamNameBuilder();
  });

  describe('buildStreamName', () => {
    it('应该正确构建 trade 流名称', () => {
      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      };

      const streamName = builder.buildStreamName(subscription);
      expect(streamName).toBe('btcusdt@trade');
    });

    it('应该正确构建 ticker 流名称', () => {
      const subscription: DataSubscription = {
        symbol: 'ETHUSDT',
        dataType: DataType.TICKER
      };

      const streamName = builder.buildStreamName(subscription);
      expect(streamName).toBe('ethusdt@ticker');
    });

    it('应该正确构建 kline 流名称', () => {
      const subscription: DataSubscription = {
        symbol: 'BNBUSDT',
        dataType: DataType.KLINE_1M
      };

      const streamName = builder.buildStreamName(subscription);
      expect(streamName).toBe('bnbusdt@kline_1m');
    });

    it('应该正确构建带参数的 kline 流名称', () => {
      const subscription: DataSubscription = {
        symbol: 'ADAUSDT',
        dataType: DataType.KLINE_5M,
        params: { interval: '5m' }
      };

      const streamName = builder.buildStreamName(subscription);
      expect(streamName).toBe('adausdt@kline_5m');
    });

    it('应该正确构建 depth 流名称', () => {
      const subscription: DataSubscription = {
        symbol: 'DOTUSDT',
        dataType: DataType.DEPTH
      };

      const streamName = builder.buildStreamName(subscription);
      expect(streamName).toBe('dotusdt@depth');
    });

    it('应该正确构建带参数的 depth 流名称', () => {
      const subscription: DataSubscription = {
        symbol: 'LINKUSDT',
        dataType: DataType.DEPTH,
        params: { levels: 5, speed: '100ms' }
      };

      const streamName = builder.buildStreamName(subscription);
      expect(streamName).toBe('linkusdt@depth5@100ms');
    });

    it('应该处理无效的数据类型', () => {
      const subscription: DataSubscription = {
        symbol: 'BTCUSDT',
        dataType: 'invalid' as DataType
      };

      expect(() => builder.buildStreamName(subscription))
        .toThrow('Unsupported data type: invalid');
    });

    it('应该处理无效的交易对格式', () => {
      const subscription: DataSubscription = {
        symbol: 'INVALID-SYMBOL',
        dataType: DataType.TRADE
      };

      expect(() => builder.buildStreamName(subscription))
        .toThrow('Invalid symbol format: INVALID-SYMBOL');
    });
  });

  describe('buildCombinedStreamUrl', () => {
    it('应该正确构建组合流 URL', () => {
      const streamNames = ['btcusdt@trade', 'ethusdt@trade', 'bnbusdt@kline_1m'];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = builder.buildCombinedStreamUrl(streamNames, baseUrl);
      expect(url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/bnbusdt@kline_1m');
    });

    it('应该处理重复的流名称', () => {
      const streamNames = ['btcusdt@trade', 'btcusdt@trade', 'ethusdt@trade'];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = builder.buildCombinedStreamUrl(streamNames, baseUrl);
      expect(url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade');
    });

    it('应该处理空的流名称数组', () => {
      const streamNames: string[] = [];
      const baseUrl = 'wss://stream.binance.com:9443';

      expect(() => builder.buildCombinedStreamUrl(streamNames, baseUrl))
        .toThrow('Stream names array cannot be empty');
    });

    it('应该处理超过最大流数量', () => {
      const streamNames = Array(2000).fill('btcusdt@trade');
      const baseUrl = 'wss://stream.binance.com:9443';

      expect(() => builder.buildCombinedStreamUrl(streamNames, baseUrl))
        .toThrow('Too many streams: 2000 > 1024');
    });
  });

  describe('parseStreamName', () => {
    it('应该正确解析 trade 流名称', () => {
      const streamName = 'btcusdt@trade';
      const parsed = builder.parseStreamName(streamName);

      expect(parsed).toEqual({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });
    });

    it('应该正确解析 kline 流名称', () => {
      const streamName = 'ethusdt@kline_1m';
      const parsed = builder.parseStreamName(streamName);

      expect(parsed).toEqual({
        symbol: 'ETHUSDT',
        dataType: DataType.KLINE_1M,
        params: { interval: '1m' }
      });
    });

    it('应该正确解析 depth 流名称', () => {
      const streamName = 'bnbusdt@depth5';
      const parsed = builder.parseStreamName(streamName);

      expect(parsed).toEqual({
        symbol: 'BNBUSDT',
        dataType: DataType.DEPTH,
        params: { levels: 5 }
      });
    });

    it('应该处理无效的流名称', () => {
      const streamName = 'invalid-stream-name';
      const parsed = builder.parseStreamName(streamName);

      expect(parsed).toBeNull();
    });
  });

  describe('validateStreamName', () => {
    it('应该验证有效的流名称', () => {
      const validNames = [
        'btcusdt@trade',
        'ethusdt@ticker',
        'bnbusdt@kline_1m',
        'adausdt@depth5',
        'dotusdt@depth10@100ms'
      ];

      validNames.forEach(name => {
        expect(builder.validateStreamName(name)).toBe(true);
      });
    });

    it('应该拒绝无效的流名称', () => {
      const invalidNames = [
        '',
        'btc@',
        '@trade',
        'BTC-USDT@trade',
        'btcusdt@invalid',
        'btcusdt@kline_',
        'btcusdt@kline_xyz'
      ];

      invalidNames.forEach(name => {
        expect(builder.validateStreamName(name)).toBe(false);
      });
    });
  });

  describe('getSupportedDataTypes', () => {
    it('应该返回支持的数据类型列表', () => {
      const types = builder.getSupportedDataTypes();
      
      expect(types).toContain(DataType.TRADE);
      expect(types).toContain(DataType.TICKER);
      expect(types).toContain(DataType.KLINE_1M);
      expect(types).toContain(DataType.DEPTH);
    });
  });

  describe('buildStreamNames', () => {
    it('应该批量构建流名称', () => {
      const subscriptions: DataSubscription[] = [
        { symbol: 'BTCUSDT', dataType: DataType.TRADE },
        { symbol: 'ETHUSDT', dataType: DataType.TICKER },
        { symbol: 'BNBUSDT', dataType: DataType.KLINE_1M }
      ];

      const streamNames = builder.buildStreamNames(subscriptions);
      
      expect(streamNames).toEqual([
        'btcusdt@trade',
        'ethusdt@ticker',
        'bnbusdt@kline_1m'
      ]);
    });
  });

  describe('getStreamNameStats', () => {
    it('应该计算流名称统计信息', () => {
      const streamNames = [
        'btcusdt@trade',
        'btcusdt@kline_1m',
        'ethusdt@trade',
        'ethusdt@ticker',
        'btcusdt@trade' // 重复
      ];

      const stats = builder.getStreamNameStats(streamNames);
      
      expect(stats.total).toBe(5);
      expect(stats.duplicates).toEqual(['btcusdt@trade']);
      expect(stats.bySymbol['BTCUSDT']).toBe(2);
      expect(stats.bySymbol['ETHUSDT']).toBe(2);
      expect(stats.byType[DataType.TRADE]).toBe(2);
    });
  });
});