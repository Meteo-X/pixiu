/**
 * Data Normalizer for Binance Adapter
 * 
 * 负责将 Binance 原始数据转换为标准化格式
 */

import { Decimal } from 'decimal.js';
import { 
  BinanceTradeStream, 
  BinanceKlineStream, 
  BinanceTickerStream 
} from '../types';
import { 
  IDataNormalizer,
  TradeData,
  KlineData,
  TickerData,
  ValidationError,
  ConversionError
} from './interfaces';

/**
 * Binance 数据标准化器实现
 */
export class DataNormalizer implements IDataNormalizer {
  private readonly config: {
    pricePrecision: number;
    quantityPrecision: number;
    enableValidation: boolean;
  };

  constructor(config?: Partial<typeof DataNormalizer.prototype.config>) {
    this.config = {
      pricePrecision: 8,
      quantityPrecision: 8,
      enableValidation: true,
      ...config
    };

    // 配置 Decimal.js
    Decimal.set({
      precision: Math.max(this.config.pricePrecision, this.config.quantityPrecision) + 2,
      rounding: Decimal.ROUND_HALF_UP
    });
  }

  /**
   * 标准化 Trade 数据
   */
  normalizeTrade(raw: BinanceTradeStream): TradeData {
    try {
      if (this.config.enableValidation) {
        this.validateTradeData(raw);
      }

      return {
        price: this.validatePriceData(raw.p),
        quantity: this.validateQuantityData(raw.q),
        side: raw.m ? 'sell' : 'buy', // m = true means buyer is market maker (so it's a sell)
        tradeId: raw.t.toString(),
        tradeTime: this.validateTimestamp(raw.T),
        isBuyerMaker: raw.m
      };
    } catch (error) {
      throw new ConversionError(
        `Failed to normalize trade data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { rawData: raw }
      );
    }
  }

  /**
   * 标准化 Kline 数据
   */
  normalizeKline(raw: BinanceKlineStream): KlineData {
    try {
      if (this.config.enableValidation) {
        this.validateKlineData(raw);
      }

      const klineData = raw.k;
      
      return {
        interval: klineData.i,
        startTime: this.validateTimestamp(klineData.t),
        endTime: this.validateTimestamp(klineData.T),
        open: this.validatePriceData(klineData.o),
        high: this.validatePriceData(klineData.h),
        low: this.validatePriceData(klineData.l),
        close: this.validatePriceData(klineData.c),
        volume: this.validateQuantityData(klineData.v),
        trades: klineData.n,
        closed: klineData.x,
        quoteVolume: this.validateQuantityData(klineData.q),
        takerBuyBaseVolume: this.validateQuantityData(klineData.V),
        takerBuyQuoteVolume: this.validateQuantityData(klineData.Q)
      };
    } catch (error) {
      throw new ConversionError(
        `Failed to normalize kline data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { rawData: raw }
      );
    }
  }

  /**
   * 标准化 Ticker 数据
   */
  normalizeTicker(raw: BinanceTickerStream): TickerData {
    try {
      if (this.config.enableValidation) {
        this.validateTickerData(raw);
      }

      return {
        price: this.validatePriceData(raw.c),
        bid: this.validatePriceData(raw.b),
        ask: this.validatePriceData(raw.a),
        bidSize: this.validateQuantityData(raw.B),
        askSize: this.validateQuantityData(raw.A),
        volume24h: this.validateQuantityData(raw.v),
        priceChange24h: this.validatePriceData(raw.p),
        priceChangePercent24h: this.validatePriceData(raw.P),
        high24h: this.validatePriceData(raw.h),
        low24h: this.validatePriceData(raw.l),
        open24h: this.validatePriceData(raw.o),
        weightedAvgPrice24h: this.validatePriceData(raw.w),
        trades24h: raw.n,
        openTime: this.validateTimestamp(raw.O),
        closeTime: this.validateTimestamp(raw.C)
      };
    } catch (error) {
      throw new ConversionError(
        `Failed to normalize ticker data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { rawData: raw }
      );
    }
  }

  /**
   * 验证和转换价格数据
   */
  validatePriceData(value: string | number): Decimal {
    try {
      if (value === null || value === undefined) {
        throw new ValidationError('Price value cannot be null or undefined');
      }

      const decimal = new Decimal(value);
      
      if (decimal.isNaN()) {
        throw new ValidationError(`Invalid price value: ${value}`);
      }

      if (decimal.isNegative()) {
        throw new ValidationError(`Price cannot be negative: ${value}`);
      }

      return decimal;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`Failed to parse price value: ${value}`, undefined, { originalValue: value });
    }
  }

  /**
   * 验证和转换数量数据
   */
  validateQuantityData(value: string | number): Decimal {
    try {
      if (value === null || value === undefined) {
        throw new ValidationError('Quantity value cannot be null or undefined');
      }

      const decimal = new Decimal(value);
      
      if (decimal.isNaN()) {
        throw new ValidationError(`Invalid quantity value: ${value}`);
      }

      if (decimal.isNegative()) {
        throw new ValidationError(`Quantity cannot be negative: ${value}`);
      }

      return decimal;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`Failed to parse quantity value: ${value}`, undefined, { originalValue: value });
    }
  }

  /**
   * 验证时间戳
   */
  validateTimestamp(value: number): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new ValidationError(`Invalid timestamp: ${value}`);
    }

    // 检查是否为合理的时间戳（不能太早也不能太远）
    const now = Date.now();
    const minTimestamp = now - 24 * 60 * 60 * 1000; // 24小时前
    const maxTimestamp = now + 60 * 60 * 1000; // 1小时后

    if (value < minTimestamp || value > maxTimestamp) {
      throw new ValidationError(`Timestamp out of reasonable range: ${value}`);
    }

    return value;
  }

  /**
   * 验证 Trade 数据格式
   */
  private validateTradeData(data: BinanceTradeStream): void {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Trade data must be a valid object');
    }

    if (data.e !== 'trade') {
      throw new ValidationError(`Expected event type 'trade', got: ${data.e}`);
    }

    const requiredFields = ['E', 's', 't', 'p', 'q', 'T', 'm'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new ValidationError(`Missing required field: ${field}`);
      }
    }

    if (typeof data.s !== 'string' || !data.s) {
      throw new ValidationError('Symbol must be a non-empty string');
    }

    if (!Number.isInteger(data.t) || data.t <= 0) {
      throw new ValidationError('Trade ID must be a positive integer');
    }

    if (typeof data.m !== 'boolean') {
      throw new ValidationError('Market maker flag must be a boolean');
    }
  }

  /**
   * 验证 Kline 数据格式
   */
  private validateKlineData(data: BinanceKlineStream): void {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Kline data must be a valid object');
    }

    if (data.e !== 'kline') {
      throw new ValidationError(`Expected event type 'kline', got: ${data.e}`);
    }

    if (!data.k || typeof data.k !== 'object') {
      throw new ValidationError('Kline data must contain a valid k object');
    }

    const kline = data.k;
    const requiredFields = ['t', 'T', 's', 'i', 'o', 'c', 'h', 'l', 'v', 'n', 'x', 'q', 'V', 'Q'];
    for (const field of requiredFields) {
      if (!(field in kline)) {
        throw new ValidationError(`Missing required kline field: ${field}`);
      }
    }

    if (typeof kline.s !== 'string' || !kline.s) {
      throw new ValidationError('Kline symbol must be a non-empty string');
    }

    if (typeof kline.i !== 'string' || !kline.i) {
      throw new ValidationError('Kline interval must be a non-empty string');
    }

    if (typeof kline.x !== 'boolean') {
      throw new ValidationError('Kline closed flag must be a boolean');
    }

    if (!Number.isInteger(kline.n) || kline.n < 0) {
      throw new ValidationError('Number of trades must be a non-negative integer');
    }
  }

  /**
   * 验证 Ticker 数据格式
   */
  private validateTickerData(data: BinanceTickerStream): void {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Ticker data must be a valid object');
    }

    if (data.e !== '24hrTicker') {
      throw new ValidationError(`Expected event type '24hrTicker', got: ${data.e}`);
    }

    const requiredFields = ['E', 's', 'p', 'P', 'w', 'c', 'Q', 'b', 'B', 'a', 'A', 'o', 'h', 'l', 'v', 'q', 'O', 'C', 'n'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new ValidationError(`Missing required ticker field: ${field}`);
      }
    }

    if (typeof data.s !== 'string' || !data.s) {
      throw new ValidationError('Ticker symbol must be a non-empty string');
    }

    if (!Number.isInteger(data.n) || data.n < 0) {
      throw new ValidationError('Number of trades must be a non-negative integer');
    }
  }
}