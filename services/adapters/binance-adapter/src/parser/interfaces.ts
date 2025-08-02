/**
 * Data Parser Interfaces for Binance Adapter
 * 
 * 定义数据解析器的统一接口，用于将 Binance 原始数据转换为标准化格式
 */

import { Decimal } from 'decimal.js';
import { 
  BinanceTradeStream, 
  BinanceKlineStream, 
  BinanceTickerStream,
  BinanceCombinedStream,
  Exchange,
  DataType
} from '../types';

// ============================================================================
// 标准化数据格式 (与 exchange-collector 保持一致)
// ============================================================================

/**
 * 统一的市场数据接口
 */
export interface MarketData {
  exchange: Exchange;
  symbol: string;
  timestamp: number;
  type: DataType;
  data: TradeData | KlineData | TickerData | DepthData;
}

/**
 * 交易数据
 */
export interface TradeData {
  price: Decimal;
  quantity: Decimal;
  side: 'buy' | 'sell';
  tradeId: string;
  tradeTime: number;
  isBuyerMaker: boolean;
}

/**
 * K线数据
 */
export interface KlineData {
  interval: string;
  startTime: number;
  endTime: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  trades: number;
  closed: boolean;
  quoteVolume: Decimal;
  takerBuyBaseVolume: Decimal;
  takerBuyQuoteVolume: Decimal;
}

/**
 * 行情数据
 */
export interface TickerData {
  price: Decimal;
  bid: Decimal;
  ask: Decimal;
  bidSize: Decimal;
  askSize: Decimal;
  volume24h: Decimal;
  priceChange24h: Decimal;
  priceChangePercent24h: Decimal;
  high24h: Decimal;
  low24h: Decimal;
  open24h: Decimal;
  weightedAvgPrice24h: Decimal;
  trades24h: number;
  openTime: number;
  closeTime: number;
}

/**
 * 深度数据
 */
export interface DepthData {
  bids: Array<[Decimal, Decimal]>; // [price, quantity]
  asks: Array<[Decimal, Decimal]>;
  lastUpdateId: number;
}

// ============================================================================
// 解析器接口
// ============================================================================

/**
 * 数据解析器基础接口
 */
export interface IDataParser<TInput, TOutput> {
  /**
   * 解析单条消息
   * @param input 原始输入数据
   * @returns 标准化的输出数据
   */
  parse(input: TInput): TOutput;

  /**
   * 批量解析消息
   * @param inputs 原始输入数据数组
   * @returns 标准化的输出数据数组
   */
  parseBatch(inputs: TInput[]): TOutput[];

  /**
   * 验证输入数据格式
   * @param input 待验证的数据
   * @returns 是否为有效格式
   */
  validate(input: unknown): input is TInput;

  /**
   * 获取解析器统计信息
   */
  getStats(): ParserStats;
}

/**
 * Trade 数据解析器接口
 */
export interface ITradeParser extends IDataParser<BinanceTradeStream, MarketData> {
  /**
   * 解析单个 Trade 流数据
   */
  parse(input: BinanceTradeStream): MarketData;
}

/**
 * Kline 数据解析器接口
 */
export interface IKlineParser extends IDataParser<BinanceKlineStream, MarketData> {
  /**
   * 解析单个 Kline 流数据
   */
  parse(input: BinanceKlineStream): MarketData;
}

/**
 * Ticker 数据解析器接口
 */
export interface ITickerParser extends IDataParser<BinanceTickerStream, MarketData> {
  /**
   * 解析单个 Ticker 流数据
   */
  parse(input: BinanceTickerStream): MarketData;
}

/**
 * 组合流解析器接口
 */
export interface ICombinedStreamParser extends IDataParser<BinanceCombinedStream<any>, MarketData> {
  /**
   * 解析组合流数据
   */
  parse(input: BinanceCombinedStream<any>): MarketData;
}

/**
 * 数据标准化器接口
 */
export interface IDataNormalizer {
  /**
   * 标准化 Trade 数据
   */
  normalizeTrade(raw: BinanceTradeStream): TradeData;

  /**
   * 标准化 Kline 数据
   */
  normalizeKline(raw: BinanceKlineStream): KlineData;

  /**
   * 标准化 Ticker 数据
   */
  normalizeTicker(raw: BinanceTickerStream): TickerData;

  /**
   * 通用数据验证
   */
  validatePriceData(value: string | number): Decimal;
  validateQuantityData(value: string | number): Decimal;
  validateTimestamp(value: number): number;
}

// ============================================================================
// 解析器配置和统计
// ============================================================================

/**
 * 解析器配置
 */
export interface ParserConfig {
  /** 是否启用严格验证模式 */
  enableValidation?: boolean;

  /** 批量处理大小 */
  batchSize?: number;

  /** 每分钟最大错误数 */
  maxErrorsPerMinute?: number;

  /** 只处理已关闭的K线（仅用于 KlineParser） */
  onlyClosedKlines?: boolean;

  /** 数值精度设置 */
  precision?: {
    price: number;
    quantity: number;
  };

  /** 性能配置 */
  performance?: {
    enableCaching: boolean;
    cacheSize: number;
  };

  /** 错误处理配置 */
  errorHandling?: {
    continueOnError: boolean;
    logParsingErrors: boolean;
  };
}

/**
 * 解析器统计信息
 */
export interface ParserStats {
  /** 总处理消息数 */
  totalProcessed: number;

  /** 成功解析数 */
  successCount: number;

  /** 解析错误数 */
  errorCount: number;

  /** 验证失败数 */
  validationFailures: number;

  /** 解析性能统计 */
  performance: {
    averageParseTime: number; // 微秒
    p95ParseTime: number;
    p99ParseTime: number;
  };

  /** 错误统计 */
  errors: {
    byType: Record<string, number>;
    recent: ParsingError[];
  };

  /** 最后处理时间 */
  lastProcessedAt?: number;
}

/**
 * 解析错误信息
 */
export interface ParsingError {
  timestamp: number;
  message: string;
  type: string;
  input?: any;
  context?: Record<string, any>;
}

// ============================================================================
// 错误类型
// ============================================================================

/**
 * 数据解析错误基类
 */
export class DataParsingError extends Error {
  public code: string;
  public override cause?: Error;
  public context?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    cause?: Error,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'DataParsingError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
    if (context !== undefined) {
      this.context = context;
    }
  }
}

/**
 * 数据验证错误
 */
export class ValidationError extends DataParsingError {
  constructor(message: string, input?: any, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', undefined, { ...context, input });
    this.name = 'ValidationError';
  }
}

/**
 * 数据转换错误
 */
export class ConversionError extends DataParsingError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(message, 'CONVERSION_ERROR', cause, context);
    this.name = 'ConversionError';
  }
}

/**
 * 不支持的数据类型错误
 */
export class UnsupportedDataTypeError extends DataParsingError {
  constructor(dataType: string, context?: Record<string, any>) {
    super(`Unsupported data type: ${dataType}`, 'UNSUPPORTED_DATA_TYPE', undefined, context);
    this.name = 'UnsupportedDataTypeError';
  }
}