/**
 * Unit Tests for TradeParser
 */

import { TradeParser } from '../TradeParser';
import { ValidationError, DataParsingError } from '../interfaces';
import { BinanceTradeStream, Exchange, DataType } from '../../types';

describe('TradeParser', () => {
  let parser: TradeParser;

  beforeEach(() => {
    parser = new TradeParser();
  });

  describe('parse', () => {
    const validTradeStream: BinanceTradeStream = {
      e: 'trade',
      E: Date.now(),
      s: 'BTCUSDT',
      t: 123456789,
      p: '45000.50',
      q: '0.001',
      T: Date.now(),
      m: false,
      M: true
    };

    it('应该正确解析有效的交易数据', () => {
      const result = parser.parse(validTradeStream);

      expect(result.exchange).toBe(Exchange.BINANCE);
      expect(result.symbol).toBe('BTCUSDT');
      expect(result.type).toBe(DataType.TRADE);
      expect(result.timestamp).toBe(validTradeStream.E);
      expect(result.data).toHaveProperty('price');
      expect(result.data).toHaveProperty('quantity');
      expect(result.data).toHaveProperty('side');
      expect(result.data).toHaveProperty('tradeId');
      expect(result.data).toHaveProperty('tradeTime');
      expect(result.data).toHaveProperty('isBuyerMaker');
    });

    it('应该正确处理买方交易', () => {
      const buyTrade = { ...validTradeStream, m: false };
      const result = parser.parse(buyTrade);

      expect((result.data as any).side).toBe('buy');
      expect((result.data as any).isBuyerMaker).toBe(false);
    });

    it('应该正确处理卖方交易', () => {
      const sellTrade = { ...validTradeStream, m: true };
      const result = parser.parse(sellTrade);

      expect((result.data as any).side).toBe('sell');
      expect((result.data as any).isBuyerMaker).toBe(true);
    });

    it('应该正确处理小写交易对', () => {
      const lowerCaseTrade = { ...validTradeStream, s: 'btcusdt' };
      const result = parser.parse(lowerCaseTrade);

      expect(result.symbol).toBe('BTCUSDT');
    });

    it('应该更新统计信息', () => {
      const initialStats = parser.getStats();
      parser.parse(validTradeStream);
      const updatedStats = parser.getStats();

      expect(updatedStats.totalProcessed).toBe(initialStats.totalProcessed + 1);
      expect(updatedStats.successCount).toBe(initialStats.successCount + 1);
      expect(updatedStats.lastProcessedAt).toBeGreaterThan(0);
    });

    it('应该在验证失败时抛出错误', () => {
      const invalidTrade = { ...validTradeStream, e: 'invalid' };
      expect(() => parser.parse(invalidTrade as any))
        .toThrow(ValidationError);
    });

    it('应该在数据无效时更新错误统计', () => {
      const initialStats = parser.getStats();
      try {
        parser.parse({ ...validTradeStream, p: 'invalid' } as any);
      } catch (error) {
        // 预期的错误
      }
      const updatedStats = parser.getStats();

      expect(updatedStats.errorCount).toBe(initialStats.errorCount + 1);
      expect(updatedStats.totalProcessed).toBe(initialStats.totalProcessed + 1);
    });
  });

  describe('parseBatch', () => {
    const validTrades: BinanceTradeStream[] = [
      {
        e: 'trade',
        E: Date.now(),
        s: 'BTCUSDT',
        t: 1,
        p: '45000.00',
        q: '0.001',
        T: Date.now(),
        m: false
      },
      {
        e: 'trade',
        E: Date.now(),
        s: 'ETHUSDT',
        t: 2,
        p: '3000.00',
        q: '0.01',
        T: Date.now(),
        m: true
      }
    ];

    it('应该正确批量解析有效数据', () => {
      const results = parser.parseBatch(validTrades);

      expect(results).toHaveLength(2);
      expect(results[0]?.symbol).toBe('BTCUSDT');
      expect(results[1]?.symbol).toBe('ETHUSDT');
      expect((results[0]?.data as any).side).toBe('buy');
      expect((results[1]?.data as any).side).toBe('sell');
    });

    it('应该处理空数组', () => {
      const results = parser.parseBatch([]);
      expect(results).toHaveLength(0);
    });

    it('应该在批量大小超限时抛出错误', () => {
      const largeBatch = new Array(101).fill(validTrades[0]);
      expect(() => parser.parseBatch(largeBatch))
        .toThrow(ValidationError);
    });

    it('应该在输入不是数组时抛出错误', () => {
      expect(() => parser.parseBatch('not array' as any))
        .toThrow(ValidationError);
    });

    it('应该在批量中包含无效数据时抛出错误', () => {
      const mixedBatch = [
        validTrades[0],
        { ...validTrades[1], p: 'invalid' } as any
      ];
      expect(() => parser.parseBatch(mixedBatch))
        .toThrow(DataParsingError);
    });
  });

  describe('validate', () => {
    const validTrade: BinanceTradeStream = {
      e: 'trade',
      E: Date.now(),
      s: 'BTCUSDT',
      t: 123456789,
      p: '45000.50',
      q: '0.001',
      T: Date.now(),
      m: false
    };

    it('应该验证有效的交易数据', () => {
      expect(parser.validate(validTrade)).toBe(true);
    });

    it('应该拒绝null或undefined', () => {
      expect(parser.validate(null)).toBe(false);
      expect(parser.validate(undefined)).toBe(false);
    });

    it('应该拒绝非对象类型', () => {
      expect(parser.validate('string')).toBe(false);
      expect(parser.validate(123)).toBe(false);
      expect(parser.validate(true)).toBe(false);
    });

    it('应该拒绝错误的事件类型', () => {
      expect(parser.validate({ ...validTrade, e: 'kline' })).toBe(false);
    });

    it('应该拒绝缺少必需字段', () => {
      const { e, ...missingEvent } = validTrade;
      expect(parser.validate(missingEvent)).toBe(false);

      const { s, ...missingSymbol } = validTrade;
      expect(parser.validate(missingSymbol)).toBe(false);

      const { p, ...missingPrice } = validTrade;
      expect(parser.validate(missingPrice)).toBe(false);
    });

    it('应该拒绝无效的数据类型', () => {
      expect(parser.validate({ ...validTrade, E: 'invalid' })).toBe(false);
      expect(parser.validate({ ...validTrade, t: 'invalid' })).toBe(false);
      expect(parser.validate({ ...validTrade, m: 'invalid' })).toBe(false);
    });

    it('应该拒绝无效的价格和数量', () => {
      expect(parser.validate({ ...validTrade, p: '' })).toBe(false);
      expect(parser.validate({ ...validTrade, p: 'invalid' })).toBe(false);
      expect(parser.validate({ ...validTrade, p: '-100' })).toBe(false);
      expect(parser.validate({ ...validTrade, q: '0' })).toBe(false);
      expect(parser.validate({ ...validTrade, q: '-1' })).toBe(false);
    });

    it('应该拒绝不合理的时间戳', () => {
      const now = Date.now();
      const tooOld = now - 25 * 60 * 60 * 1000; // 25小时前
      const tooFuture = now + 2 * 60 * 1000; // 2分钟后

      expect(parser.validate({ ...validTrade, E: tooOld })).toBe(false);
      expect(parser.validate({ ...validTrade, E: tooFuture })).toBe(false);
      expect(parser.validate({ ...validTrade, T: tooOld })).toBe(false);
      expect(parser.validate({ ...validTrade, T: tooFuture })).toBe(false);
    });
  });

  describe('getStats', () => {
    it('应该返回初始统计信息', () => {
      const stats = parser.getStats();

      expect(stats.totalProcessed).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.validationFailures).toBe(0);
      expect(stats.performance.averageParseTime).toBe(0);
      expect(stats.errors.byType).toEqual({});
      expect(stats.errors.recent).toEqual([]);
      expect(stats.lastProcessedAt).toBeUndefined();
    });

    it('应该返回统计信息的副本', () => {
      const stats1 = parser.getStats();
      const stats2 = parser.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1.errors.byType).not.toBe(stats2.errors.byType);
      expect(stats1.errors.recent).not.toBe(stats2.errors.recent);
    });
  });

  describe('resetStats', () => {
    it('应该重置所有统计信息', () => {
      // 先生成一些统计数据
      const validTrade: BinanceTradeStream = {
        e: 'trade',
        E: Date.now(),
        s: 'BTCUSDT',
        t: 123456789,
        p: '45000.50',
        q: '0.001',
        T: Date.now(),
        m: false
      };

      parser.parse(validTrade);
      
      // 验证有统计数据
      let stats = parser.getStats();
      expect(stats.totalProcessed).toBeGreaterThan(0);

      // 重置
      parser.resetStats();

      // 验证重置后的状态
      stats = parser.getStats();
      expect(stats.totalProcessed).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.validationFailures).toBe(0);
      expect(stats.performance.averageParseTime).toBe(0);
      expect(stats.errors.byType).toEqual({});
      expect(stats.errors.recent).toEqual([]);
      expect(stats.lastProcessedAt).toBeUndefined();
    });
  });

  describe('配置选项', () => {
    it('应该支持禁用验证', () => {
      const noValidationParser = new TradeParser({
        enableValidation: false
      });

      const invalidTrade = {
        e: 'trade',
        E: Date.now(),
        s: 'BTCUSDT',
        t: 123456789,
        p: '45000.50',
        q: '0.001',
        T: Date.now(),
        m: false,
        invalidField: 'should not cause error'
      };

      // 应该不抛出验证错误
      expect(() => noValidationParser.parse(invalidTrade as any)).not.toThrow(ValidationError);
    });

    it('应该支持自定义批量大小', () => {
      const customParser = new TradeParser({
        batchSize: 10
      });

      const largeBatch = new Array(11).fill({
        e: 'trade',
        E: Date.now(),
        s: 'BTCUSDT',
        t: 123456789,
        p: '45000.50',
        q: '0.001',
        T: Date.now(),
        m: false
      });

      expect(() => customParser.parseBatch(largeBatch))
        .toThrow(ValidationError);
    });
  });
});