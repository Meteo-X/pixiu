/**
 * Unit Tests for DataNormalizer
 */

import { Decimal } from 'decimal.js';
import { DataNormalizer } from '../DataNormalizer';
import { ValidationError, ConversionError } from '../interfaces';
import { BinanceTradeStream, BinanceKlineStream, BinanceTickerStream } from '../../types';

describe('DataNormalizer', () => {
  let normalizer: DataNormalizer;

  beforeEach(() => {
    normalizer = new DataNormalizer();
  });

  describe('normalizeTrade', () => {
    const now = Date.now();
    const validTradeData: BinanceTradeStream = {
      e: 'trade',
      E: now,
      s: 'BTCUSDT',
      t: 123456789,
      p: '45000.50',
      q: '0.001',
      T: now,
      m: false,
      M: true
    };

    it('应该正确标准化有效的交易数据', () => {
      const result = normalizer.normalizeTrade(validTradeData);

      expect(result.price).toBeInstanceOf(Decimal);
      expect(result.price.toString()).toBe('45000.5');
      expect(result.quantity).toBeInstanceOf(Decimal);
      expect(result.quantity.toString()).toBe('0.001');
      expect(result.side).toBe('buy'); // m = false 表示买方
      expect(result.tradeId).toBe('123456789');
      expect(result.tradeTime).toBe(now);
      expect(result.isBuyerMaker).toBe(false);
    });

    it('应该正确处理卖方交易', () => {
      const sellTradeData = { ...validTradeData, m: true };
      const result = normalizer.normalizeTrade(sellTradeData);

      expect(result.side).toBe('sell'); // m = true 表示卖方
      expect(result.isBuyerMaker).toBe(true);
    });

    it('应该抛出错误当价格为无效值时', () => {
      const invalidTradeData = { ...validTradeData, p: 'invalid' };
      expect(() => normalizer.normalizeTrade(invalidTradeData))
        .toThrow(ConversionError);
    });

    it('应该抛出错误当数量为负数时', () => {
      const invalidTradeData = { ...validTradeData, q: '-1.0' };
      expect(() => normalizer.normalizeTrade(invalidTradeData))
        .toThrow(ConversionError);
    });
  });

  describe('normalizeKline', () => {
    const now = Date.now();
    const validKlineData: BinanceKlineStream = {
      e: 'kline',
      E: now,
      s: 'BTCUSDT',
      k: {
        t: now - 60000,
        T: now,
        s: 'BTCUSDT',
        i: '1m',
        f: 100,
        L: 200,
        o: '45000.00',
        c: '45100.00',
        h: '45150.00',
        l: '44950.00',
        v: '10.5',
        n: 150,
        x: true,
        q: '472575.0',
        V: '5.2',
        Q: '234287.5',
        B: '0'
      }
    };

    it('应该正确标准化有效的K线数据', () => {
      const result = normalizer.normalizeKline(validKlineData);

      expect(result.interval).toBe('1m');
      expect(result.startTime).toBe(now - 60000);
      expect(result.endTime).toBe(now);
      expect(result.open).toBeInstanceOf(Decimal);
      expect(result.open.toString()).toBe('45000');
      expect(result.close).toBeInstanceOf(Decimal);
      expect(result.close.toString()).toBe('45100');
      expect(result.high).toBeInstanceOf(Decimal);
      expect(result.high.toString()).toBe('45150');
      expect(result.low).toBeInstanceOf(Decimal);
      expect(result.low.toString()).toBe('44950');
      expect(result.volume).toBeInstanceOf(Decimal);
      expect(result.volume.toString()).toBe('10.5');
      expect(result.trades).toBe(150);
      expect(result.closed).toBe(true);
    });

    it('应该抛出错误当开盘价无效时', () => {
      const invalidKlineData = { 
        ...validKlineData, 
        k: { ...validKlineData.k, o: 'invalid' } 
      };
      expect(() => normalizer.normalizeKline(invalidKlineData))
        .toThrow(ConversionError);
    });
  });

  describe('normalizeTicker', () => {
    const now = Date.now();
    const validTickerData: BinanceTickerStream = {
      e: '24hrTicker',
      E: now,
      s: 'BTCUSDT',
      p: '1000.00',
      P: '2.27',
      w: '44500.00',
      x: '44000.00',
      c: '45000.00',
      Q: '0.5',
      b: '44990.00',
      B: '1.2',
      a: '45010.00',
      A: '0.8',
      o: '44000.00',
      h: '45200.00',
      l: '43800.00',
      v: '1000.5',
      q: '44525000.0',
      O: now - 23 * 60 * 60 * 1000,
      C: now,
      F: 100000,
      L: 200000,
      n: 50000
    };

    it('应该正确标准化有效的Ticker数据', () => {
      const result = normalizer.normalizeTicker(validTickerData);

      expect(result.price).toBeInstanceOf(Decimal);
      expect(result.price.toString()).toBe('45000');
      expect(result.bid).toBeInstanceOf(Decimal);
      expect(result.bid.toString()).toBe('44990');
      expect(result.ask).toBeInstanceOf(Decimal);
      expect(result.ask.toString()).toBe('45010');
      expect(result.volume24h).toBeInstanceOf(Decimal);
      expect(result.volume24h.toString()).toBe('1000.5');
      expect(result.priceChange24h).toBeInstanceOf(Decimal);
      expect(result.priceChange24h.toString()).toBe('1000');
      expect(result.trades24h).toBe(50000);
      expect(result.openTime).toBe(now - 23 * 60 * 60 * 1000);
      expect(result.closeTime).toBe(now);
    });
  });

  describe('validatePriceData', () => {
    it('应该接受有效的价格字符串', () => {
      const result = normalizer.validatePriceData('45000.50');
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('45000.5');
    });

    it('应该接受有效的价格数字', () => {
      const result = normalizer.validatePriceData(45000.50);
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('45000.5');
    });

    it('应该抛出错误当价格为null时', () => {
      expect(() => normalizer.validatePriceData(null as any))
        .toThrow(ValidationError);
    });

    it('应该抛出错误当价格为负数时', () => {
      expect(() => normalizer.validatePriceData('-100'))
        .toThrow(ValidationError);
    });

    it('应该抛出错误当价格为NaN时', () => {
      expect(() => normalizer.validatePriceData('invalid'))
        .toThrow(ValidationError);
    });
  });

  describe('validateQuantityData', () => {
    it('应该接受有效的数量', () => {
      const result = normalizer.validateQuantityData('10.5');
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('10.5');
    });

    it('应该接受零数量', () => {
      const result = normalizer.validateQuantityData('0');
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('0');
    });

    it('应该抛出错误当数量为负数时', () => {
      expect(() => normalizer.validateQuantityData('-1'))
        .toThrow(ValidationError);
    });
  });

  describe('validateTimestamp', () => {
    const now = Date.now();

    it('应该接受当前时间戳', () => {
      const result = normalizer.validateTimestamp(now);
      expect(result).toBe(now);
    });

    it('应该接受过去的合理时间戳', () => {
      const pastTime = now - 60000; // 1分钟前
      const result = normalizer.validateTimestamp(pastTime);
      expect(result).toBe(pastTime);
    });

    it('应该抛出错误当时间戳为负数时', () => {
      expect(() => normalizer.validateTimestamp(-1))
        .toThrow(ValidationError);
    });

    it('应该抛出错误当时间戳太远时', () => {
      const tooOld = now - 25 * 60 * 60 * 1000; // 25小时前
      expect(() => normalizer.validateTimestamp(tooOld))
        .toThrow(ValidationError);
    });

    it('应该抛出错误当时间戳为小数时', () => {
      expect(() => normalizer.validateTimestamp(now + 0.5))
        .toThrow(ValidationError);
    });
  });

  describe('配置选项', () => {
    it('应该支持自定义配置', () => {
      const customNormalizer = new DataNormalizer({
        enableValidation: false,
        pricePrecision: 4,
        quantityPrecision: 6
      });

      // 在禁用验证模式下，应该能处理一些边界情况
      const result = customNormalizer.validatePriceData('45000.123456789');
      expect(result).toBeInstanceOf(Decimal);
    });
  });
});