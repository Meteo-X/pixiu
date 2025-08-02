/**
 * Parser Factory for Binance Adapter
 * 
 * 提供便捷的解析器创建和管理功能
 */

import { DataType } from '../types';
import { 
  IDataParser,
  ITradeParser,
  IKlineParser,
  ITickerParser,
  ICombinedStreamParser,
  ParserConfig,
  UnsupportedDataTypeError
} from './interfaces';
import { TradeParser } from './TradeParser';
import { KlineParser } from './KlineParser';
import { TickerParser } from './TickerParser';
import { CombinedStreamParser } from './CombinedStreamParser';

/**
 * 解析器工厂类
 */
export class ParserFactory {
  private static instance?: ParserFactory;
  private readonly parsers: Map<string, IDataParser<any, any>>;
  private readonly config: ParserConfig;

  private constructor(config?: ParserConfig) {
    this.parsers = new Map();
    this.config = config || {};
  }

  /**
   * 获取工厂单例实例
   */
  static getInstance(config?: ParserConfig): ParserFactory {
    if (!ParserFactory.instance) {
      ParserFactory.instance = new ParserFactory(config);
    }
    return ParserFactory.instance;
  }

  /**
   * 创建新的工厂实例（非单例）
   */
  static create(config?: ParserConfig): ParserFactory {
    return new ParserFactory(config);
  }

  /**
   * 获取或创建 Trade 解析器
   */
  getTradeParser(): ITradeParser {
    const key = 'trade';
    if (!this.parsers.has(key)) {
      this.parsers.set(key, new TradeParser(this.config));
    }
    return this.parsers.get(key) as ITradeParser;
  }

  /**
   * 获取或创建 Kline 解析器
   */
  getKlineParser(): IKlineParser {
    const key = 'kline';
    if (!this.parsers.has(key)) {
      this.parsers.set(key, new KlineParser(this.config));
    }
    return this.parsers.get(key) as IKlineParser;
  }

  /**
   * 获取或创建 Ticker 解析器
   */
  getTickerParser(): ITickerParser {
    const key = 'ticker';
    if (!this.parsers.has(key)) {
      this.parsers.set(key, new TickerParser(this.config));
    }
    return this.parsers.get(key) as ITickerParser;
  }

  /**
   * 获取或创建 Combined Stream 解析器
   */
  getCombinedStreamParser(): ICombinedStreamParser {
    const key = 'combined';
    if (!this.parsers.has(key)) {
      this.parsers.set(key, new CombinedStreamParser(this.config));
    }
    return this.parsers.get(key) as ICombinedStreamParser;
  }

  /**
   * 根据数据类型获取相应的解析器
   */
  getParserByDataType(dataType: DataType): IDataParser<any, any> {
    switch (dataType) {
      case DataType.TRADE:
        return this.getTradeParser();
      
      case DataType.KLINE_1M:
      case DataType.KLINE_5M:
      case DataType.KLINE_15M:
      case DataType.KLINE_30M:
      case DataType.KLINE_1H:
      case DataType.KLINE_4H:
      case DataType.KLINE_1D:
        return this.getKlineParser();
      
      case DataType.TICKER:
        return this.getTickerParser();
      
      default:
        throw new UnsupportedDataTypeError(dataType as string);
    }
  }

  /**
   * 创建独立的解析器实例（不缓存）
   */
  createTradeParser(config?: ParserConfig): ITradeParser {
    return new TradeParser({ ...this.config, ...config });
  }

  createKlineParser(config?: ParserConfig): IKlineParser {
    return new KlineParser({ ...this.config, ...config });
  }

  createTickerParser(config?: ParserConfig): ITickerParser {
    return new TickerParser({ ...this.config, ...config });
  }

  createCombinedStreamParser(config?: ParserConfig): ICombinedStreamParser {
    return new CombinedStreamParser({ ...this.config, ...config });
  }

  /**
   * 获取所有缓存的解析器
   */
  getAllParsers(): Map<string, IDataParser<any, any>> {
    return new Map(this.parsers);
  }

  /**
   * 获取所有解析器的统计信息
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [key, parser] of this.parsers) {
      stats[key] = parser.getStats();
    }
    
    return stats;
  }

  /**
   * 重置所有解析器的统计信息
   */
  resetAllStats(): void {
    for (const parser of this.parsers.values()) {
      if ('resetStats' in parser && typeof parser.resetStats === 'function') {
        parser.resetStats();
      }
    }
  }

  /**
   * 清理工厂（清除所有缓存的解析器）
   */
  cleanup(): void {
    this.parsers.clear();
  }

  /**
   * 验证数据类型是否支持
   */
  isDataTypeSupported(dataType: string): boolean {
    try {
      this.getParserByDataType(dataType as DataType);
      return true;
    } catch (error) {
      if (error instanceof UnsupportedDataTypeError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * 获取支持的数据类型列表
   */
  getSupportedDataTypes(): DataType[] {
    return [
      DataType.TRADE,
      DataType.KLINE_1M,
      DataType.KLINE_5M,
      DataType.KLINE_15M,
      DataType.KLINE_30M,
      DataType.KLINE_1H,
      DataType.KLINE_4H,
      DataType.KLINE_1D,
      DataType.TICKER
    ];
  }

  /**
   * 获取工厂配置
   */
  getConfig(): ParserConfig {
    return { ...this.config };
  }

  /**
   * 更新工厂配置（影响新创建的解析器）
   */
  updateConfig(config: ParserConfig): void {
    Object.assign(this.config, config);
  }
}