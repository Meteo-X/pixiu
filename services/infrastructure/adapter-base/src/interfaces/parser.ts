/**
 * 数据解析器接口定义
 */

import { DataType, MarketData, TradeData, TickerData, KlineData, DepthData } from './adapter';

export interface ParseResult<T = any> {
  /** 是否解析成功 */
  success: boolean;
  /** 解析后的数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 原始数据 */
  rawData: any;
  /** 解析耗时（毫秒） */
  parseTime: number;
}

export interface ParserMetrics {
  /** 总解析次数 */
  totalParsed: number;
  /** 解析成功次数 */
  successCount: number;
  /** 解析失败次数 */
  errorCount: number;
  /** 成功率 */
  successRate: number;
  /** 平均解析时间（毫秒） */
  averageParseTime: number;
  /** 最后解析时间 */
  lastParseTime: number;
}

export interface ParserConfig {
  /** 是否启用数据验证 */
  enableValidation?: boolean;
  /** 是否启用数据标准化 */
  enableNormalization?: boolean;
  /** 时间戳格式 */
  timestampFormat?: 'unix' | 'unix_ms' | 'iso';
  /** 数字精度 */
  precision?: number;
  /** 自定义字段映射 */
  fieldMapping?: Record<string, string>;
}

/**
 * 数据解析器基类接口
 */
export interface DataParser {
  /** 获取支持的数据类型 */
  getSupportedTypes(): DataType[];
  
  /** 获取解析器配置 */
  getConfig(): ParserConfig;
  
  /** 获取解析指标 */
  getMetrics(): ParserMetrics;
  
  /** 解析原始数据 */
  parse(rawData: any, dataType: DataType): ParseResult<MarketData>;
  
  /** 验证数据格式 */
  validate(data: any, dataType: DataType): boolean;
  
  /** 标准化数据 */
  normalize(data: any): any;
  
  /** 重置指标 */
  resetMetrics(): void;
}

/**
 * 交易数据解析器接口
 */
export interface TradeParser extends DataParser {
  /** 解析交易数据 */
  parseTrade(rawData: any): ParseResult<TradeData>;
  
  /** 批量解析交易数据 */
  parseTrades(rawDataArray: any[]): ParseResult<TradeData[]>;
}

/**
 * 行情数据解析器接口
 */
export interface TickerParser extends DataParser {
  /** 解析行情数据 */
  parseTicker(rawData: any): ParseResult<TickerData>;
  
  /** 批量解析行情数据 */
  parseTickers(rawDataArray: any[]): ParseResult<TickerData[]>;
}

/**
 * K线数据解析器接口
 */
export interface KlineParser extends DataParser {
  /** 解析K线数据 */
  parseKline(rawData: any, interval: string): ParseResult<KlineData>;
  
  /** 批量解析K线数据 */
  parseKlines(rawDataArray: any[], interval: string): ParseResult<KlineData[]>;
}

/**
 * 深度数据解析器接口
 */
export interface DepthParser extends DataParser {
  /** 解析深度数据 */
  parseDepth(rawData: any): ParseResult<DepthData>;
  
  /** 合并深度数据 */
  mergeDepth(existingDepth: DepthData, update: DepthData): DepthData;
}

/**
 * 解析器工厂接口
 */
export interface ParserFactory {
  /** 创建解析器 */
  createParser(dataType: DataType, config?: ParserConfig): DataParser;
  
  /** 注册自定义解析器 */
  registerParser(dataType: DataType, parser: DataParser): void;
  
  /** 获取支持的数据类型 */
  getSupportedTypes(): DataType[];
  
  /** 检查是否支持某种数据类型 */
  supports(dataType: DataType): boolean;
}