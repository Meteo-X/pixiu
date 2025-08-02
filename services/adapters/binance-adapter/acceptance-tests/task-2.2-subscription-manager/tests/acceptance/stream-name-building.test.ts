/**
 * Acceptance Tests for Stream Name Building (Task 2.2)
 * 
 * 验证 Binance 流名称构建逻辑的验收测试
 * 
 * 测试范围:
 * - ✅ Binance 流名称构建规范符合性
 * - ✅ 所有支持的数据类型流名称构建
 * - ✅ 流名称验证和格式检查
 * - ✅ 参数处理和定制化选项
 * - ✅ 错误处理和边界条件
 * - ✅ 性能要求验证
 */

import { StreamNameBuilder } from '@src/subscription/StreamNameBuilder';
import { DataType } from '@src/types';

describe('Stream Name Building - Acceptance Tests', () => {
  let streamBuilder: StreamNameBuilder;

  beforeEach(() => {
    streamBuilder = new StreamNameBuilder();
  });

  describe('AC-2.2.1: Binance 流名称构建规范符合性', () => {
    it('应该按照 Binance API 规范构建 trade 流名称', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const streamName = streamBuilder.buildStreamName(subscription);

      expect(streamName).toBe('btcusdt@trade');
      expect(streamName).toBeBinanceStreamName();
    });

    it('应该按照 Binance API 规范构建 ticker 流名称', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'ETHUSDT',
        dataType: DataType.TICKER
      });

      const streamName = streamBuilder.buildStreamName(subscription);

      expect(streamName).toBe('ethusdt@ticker');
      expect(streamName).toBeBinanceStreamName();
    });

    it('应该按照 Binance API 规范构建 depth 流名称', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BNBUSDT',
        dataType: DataType.DEPTH
      });

      const streamName = streamBuilder.buildStreamName(subscription);

      expect(streamName).toBe('bnbusdt@depth');
      expect(streamName).toBeBinanceStreamName();
    });

    it('应该按照 Binance API 规范构建带参数的 depth 流名称', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'ADAUSDT',
        dataType: DataType.DEPTH,
        params: { levels: 10, speed: '100ms' }
      });

      const streamName = streamBuilder.buildStreamName(subscription);

      expect(streamName).toBe('adausdt@depth10@100ms');
      expect(streamName).toBeBinanceStreamName();
    });

    it('应该按照 Binance API 规范构建各种 K线间隔的流名称', () => {
      const testCases = [
        { dataType: DataType.KLINE_1M, expected: 'btcusdt@kline_1m' },
        { dataType: DataType.KLINE_5M, expected: 'btcusdt@kline_5m' },
        { dataType: DataType.KLINE_15M, expected: 'btcusdt@kline_15m' },
        { dataType: DataType.KLINE_30M, expected: 'btcusdt@kline_30m' },
        { dataType: DataType.KLINE_1H, expected: 'btcusdt@kline_1h' },
        { dataType: DataType.KLINE_4H, expected: 'btcusdt@kline_4h' },
        { dataType: DataType.KLINE_1D, expected: 'btcusdt@kline_1d' }
      ];

      testCases.forEach(({ dataType, expected }) => {
        const subscription = testUtils.createTestSubscription({
          symbol: 'BTCUSDT',
          dataType
        });

        const streamName = streamBuilder.buildStreamName(subscription);

        expect(streamName).toBe(expected);
        expect(streamName).toBeBinanceStreamName();
      });
    });
  });

  describe('AC-2.2.2: 交易对格式处理', () => {
    it('应该正确处理不同格式的交易对名称', () => {
      const testCases = [
        { input: 'BTCUSDT', expected: 'btcusdt@trade' },
        { input: 'btcusdt', expected: 'btcusdt@trade' },
        { input: 'BtcUsdt', expected: 'btcusdt@trade' },
        { input: 'ETHBTC', expected: 'ethbtc@trade' },
        { input: 'BNBUSD', expected: 'bnbusd@trade' }
      ];

      testCases.forEach(({ input, expected }) => {
        const subscription = testUtils.createTestSubscription({
          symbol: input,
          dataType: DataType.TRADE
        });

        const streamName = streamBuilder.buildStreamName(subscription);
        expect(streamName).toBe(expected);
      });
    });

    it('应该拒绝无效的交易对格式', () => {
      const invalidSymbols = [
        'BTC-USDT',    // 包含分隔符
        'BTC_USDT',    // 包含下划线
        'BTC/USDT',    // 包含斜杠
        'BTC USDT',    // 包含空格
        'BTC@USDT',    // 包含特殊字符
        '',            // 空字符串
        '   ',         // 只有空格
        'B',           // 太短
        'VERYLONGSYMBOLNAME' // 太长（如果有长度限制）
      ];

      invalidSymbols.forEach(symbol => {
        const subscription = testUtils.createTestSubscription({
          symbol,
          dataType: DataType.TRADE
        });

        expect(() => streamBuilder.buildStreamName(subscription))
          .toThrow();
      });
    });
  });

  describe('AC-2.2.3: 参数处理和验证', () => {
    it('应该正确处理 K线自定义间隔参数', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.KLINE_1M,
        params: { interval: '3m' }
      });

      const streamName = streamBuilder.buildStreamName(subscription);
      expect(streamName).toBe('btcusdt@kline_3m');
    });

    it('应该正确处理 depth 的级别和速度参数', () => {
      const testCases = [
        { params: { levels: 5 }, expected: 'btcusdt@depth5' },
        { params: { levels: 10 }, expected: 'btcusdt@depth10' },
        { params: { levels: 20 }, expected: 'btcusdt@depth20' },
        { params: { speed: '100ms' }, expected: 'btcusdt@depth@100ms' },
        { params: { speed: '1000ms' }, expected: 'btcusdt@depth@1000ms' },
        { params: { levels: 5, speed: '100ms' }, expected: 'btcusdt@depth5@100ms' }
      ];

      testCases.forEach(({ params, expected }) => {
        const subscription = testUtils.createTestSubscription({
          symbol: 'BTCUSDT',
          dataType: DataType.DEPTH,
          params
        });

        const streamName = streamBuilder.buildStreamName(subscription);
        expect(streamName).toBe(expected);
      });
    });

    it('应该验证无效的 K线间隔参数', () => {
      const invalidIntervals = [
        'invalid',
        '0m',
        '99h',
        'abc',
        '',
        null,
        undefined
      ];

      invalidIntervals.forEach(interval => {
        const subscription = testUtils.createTestSubscription({
          symbol: 'BTCUSDT',
          dataType: DataType.KLINE_1M,
          params: { interval }
        });

        if (interval) { // Only test non-null/undefined values
          expect(() => streamBuilder.buildStreamName(subscription))
            .toThrow();
        }
      });
    });
  });

  describe('AC-2.2.4: 流名称构建选项', () => {
    it('应该支持自定义构建选项', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const options = {
        forceLowercase: false,
        symbolSeparator: '',
        paramSeparator: '-',
        validate: false
      };

      const streamName = streamBuilder.buildStreamName(subscription, options);
      
      // 注意：forceLowercase: false 但 Binance 要求小写，所以仍应是小写
      expect(streamName).toBe('btcusdt@trade');
    });

    it('应该支持禁用验证选项', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'INVALID-SYMBOL',
        dataType: DataType.TRADE
      });

      const options = { validate: false };

      // 禁用验证时不应抛出错误
      expect(() => streamBuilder.buildStreamName(subscription, options))
        .not.toThrow();
    });
  });

  describe('AC-2.2.5: 错误处理', () => {
    it('应该对不支持的数据类型抛出清晰的错误', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: 'unsupported_type' as DataType
      });

      expect(() => streamBuilder.buildStreamName(subscription))
        .toThrow('Unsupported data type: unsupported_type');
    });

    it('应该对无效的流名称格式抛出错误', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'INVALID@SYMBOL',
        dataType: DataType.TRADE
      });

      expect(() => streamBuilder.buildStreamName(subscription))
        .toThrow();
    });

    it('应该处理缺失的必需参数', () => {
      const invalidSubscriptions = [
        { symbol: undefined, dataType: DataType.TRADE },
        { symbol: null, dataType: DataType.TRADE },
        { symbol: '', dataType: DataType.TRADE },
        { symbol: 'BTCUSDT', dataType: undefined },
        { symbol: 'BTCUSDT', dataType: null }
      ];

      invalidSubscriptions.forEach(subscription => {
        expect(() => streamBuilder.buildStreamName(subscription as any))
          .toThrow();
      });
    });
  });

  describe('AC-2.2.6: 批量操作', () => {
    it('应该支持批量构建流名称', () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER }),
        testUtils.createTestSubscription({ symbol: 'BNBUSDT', dataType: DataType.KLINE_1M })
      ];

      const streamNames = streamBuilder.buildStreamNames(subscriptions);

      expect(streamNames).toEqual([
        'btcusdt@trade',
        'ethusdt@ticker',
        'bnbusdt@kline_1m'
      ]);

      streamNames.forEach(name => {
        expect(name).toBeBinanceStreamName();
      });
    });

    it('应该处理批量操作中的错误', () => {
      const subscriptions = [
        testUtils.createTestSubscription({ symbol: 'BTCUSDT', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'INVALID-SYMBOL', dataType: DataType.TRADE }),
        testUtils.createTestSubscription({ symbol: 'ETHUSDT', dataType: DataType.TICKER })
      ];

      expect(() => streamBuilder.buildStreamNames(subscriptions))
        .toThrow();
    });
  });

  describe('AC-2.2.7: 性能要求', () => {
    it('应该在性能阈值内构建单个流名称', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const { duration } = testUtils.measurePerformance(() => {
        streamBuilder.buildStreamName(subscription);
      });

      expect(duration).toMeetPerformanceThreshold(
        testConfig.thresholds.performance.streamNameBuilding,
        'μs'
      );
    });

    it('应该在性能阈值内批量构建流名称', () => {
      const subscriptions = Array(1000).fill(null).map((_, i) => 
        testUtils.createTestSubscription({
          symbol: `SYMBOL${i}USDT`,
          dataType: DataType.TRADE
        })
      );

      const { duration } = testUtils.measurePerformance(() => {
        streamBuilder.buildStreamNames(subscriptions);
      });

      // 批量操作应该在合理时间内完成
      expect(duration).toMeetPerformanceThreshold(100000, 'μs'); // 100ms
    });

    it('应该高效处理重复的流名称构建', () => {
      const subscription = testUtils.createTestSubscription({
        symbol: 'BTCUSDT',
        dataType: DataType.TRADE
      });

      const { duration } = testUtils.measurePerformance(() => {
        for (let i = 0; i < 10000; i++) {
          streamBuilder.buildStreamName(subscription);
        }
      });

      // 重复构建应该保持高性能
      expect(duration).toMeetPerformanceThreshold(50000, 'μs'); // 50ms for 10k operations
    });
  });

  describe('AC-2.2.8: 统计和监控', () => {
    it('应该提供流名称统计信息', () => {
      const streamNames = [
        'btcusdt@trade',
        'btcusdt@kline_1m',
        'ethusdt@trade',
        'ethusdt@ticker',
        'btcusdt@trade' // 重复
      ];

      const stats = streamBuilder.getStreamNameStats(streamNames);

      expect(stats).toEqual({
        total: 5,
        byType: {
          [DataType.TRADE]: 2,
          [DataType.KLINE_1M]: 1,
          [DataType.TICKER]: 1
        },
        bySymbol: {
          'BTCUSDT': 2,
          'ETHUSDT': 2
        },
        duplicates: ['btcusdt@trade']
      });
    });

    it('应该检测和报告重复的流名称', () => {
      const streamNames = [
        'btcusdt@trade',
        'ethusdt@trade',
        'btcusdt@trade',
        'bnbusdt@trade',
        'ethusdt@trade'
      ];

      const stats = streamBuilder.getStreamNameStats(streamNames);

      expect(stats.duplicates).toEqual(['btcusdt@trade', 'ethusdt@trade']);
      expect(stats.duplicates.length).toBe(2);
    });
  });
});