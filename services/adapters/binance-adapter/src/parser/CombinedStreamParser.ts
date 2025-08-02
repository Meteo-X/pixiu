/**
 * Combined Stream Parser for Binance Adapter
 * 
 * 负责解析 Binance Combined Stream 数据，将其分发到相应的数据解析器
 */

import { 
  BinanceCombinedStream, 
  BinanceTradeStream, 
  BinanceKlineStream, 
  BinanceTickerStream 
} from '../types';
import { 
  ICombinedStreamParser,
  MarketData,
  ParserStats,
  ParsingError,
  ValidationError,
  DataParsingError,
  UnsupportedDataTypeError
} from './interfaces';
import { TradeParser } from './TradeParser';
import { KlineParser } from './KlineParser';
import { TickerParser } from './TickerParser';

/**
 * Binance Combined Stream 数据解析器
 */
export class CombinedStreamParser implements ICombinedStreamParser {
  private readonly tradeParser: TradeParser;
  private readonly klineParser: KlineParser;
  private readonly tickerParser: TickerParser;
  private readonly stats: ParserStats;
  private readonly config: {
    enableValidation: boolean;
    batchSize: number;
    maxErrorsPerMinute: number;
  };

  constructor(config?: Partial<CombinedStreamParser['config']>) {
    this.tradeParser = new TradeParser(config);
    this.klineParser = new KlineParser(config);
    this.tickerParser = new TickerParser(config);
    
    this.config = {
      enableValidation: true,
      batchSize: 100,
      maxErrorsPerMinute: 10,
      ...config
    };

    this.stats = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      validationFailures: 0,
      performance: {
        averageParseTime: 0,
        p95ParseTime: 0,
        p99ParseTime: 0
      },
      errors: {
        byType: {},
        recent: []
      }
    };
  }

  /**
   * 解析组合流数据
   */
  parse(input: BinanceCombinedStream<any>): MarketData {
    const startTime = this.getHighResolutionTime();
    
    try {
      this.stats.totalProcessed++;

      // 验证输入数据
      if (this.config.enableValidation && !this.validate(input)) {
        this.stats.validationFailures++;
        throw new ValidationError('Invalid combined stream data format', input);
      }

      // 根据数据类型分发到相应的解析器
      const result = this.delegateToParser(input);

      this.stats.successCount++;
      this.updatePerformanceStats(startTime);
      this.stats.lastProcessedAt = Date.now();

      return result;

    } catch (error) {
      this.handleError(error as Error, input);
      throw error;
    }
  }

  /**
   * 批量解析组合流数据
   */
  parseBatch(inputs: BinanceCombinedStream<any>[]): MarketData[] {
    if (!Array.isArray(inputs)) {
      throw new ValidationError('Input must be an array');
    }

    if (inputs.length === 0) {
      return [];
    }

    if (inputs.length > this.config.batchSize) {
      throw new ValidationError(`Batch size exceeds limit: ${inputs.length} > ${this.config.batchSize}`);
    }

    const results: MarketData[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    for (let i = 0; i < inputs.length; i++) {
      try {
        const input = inputs[i];
        if (input) {
          const result = this.parse(input);
          results.push(result);
        }
      } catch (error) {
        errors.push({ index: i, error: error as Error });
      }
    }

    if (errors.length > 0) {
      throw new DataParsingError(
        `Batch parsing failed for ${errors.length}/${inputs.length} items`,
        'BATCH_PARSING_ERROR',
        undefined,
        { 
          errors: errors.map(e => ({ index: e.index, message: e.error.message })),
          successCount: results.length
        }
      );
    }

    return results;
  }

  /**
   * 验证输入数据格式
   */
  validate(input: unknown): input is BinanceCombinedStream<any> {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const data = input as any;

    // 检查组合流必需字段
    if (typeof data.stream !== 'string' || !data.stream) {
      return false;
    }

    if (!data.data || typeof data.data !== 'object') {
      return false;
    }

    // 验证流名称格式 (symbol@stream_type 或 symbol@stream_type@params)
    const streamPattern = /^[a-z0-9]+@(trade|kline_\w+|24hrTicker|depth\d*(@\w+)?)$/;
    if (!streamPattern.test(data.stream)) {
      return false;
    }

    return true;
  }

  /**
   * 获取解析器统计信息
   */
  getStats(): ParserStats {
    const tradeStats = this.tradeParser.getStats();
    const klineStats = this.klineParser.getStats();
    const tickerStats = this.tickerParser.getStats();

    const maxTime = Math.max(
      this.stats.lastProcessedAt || 0,
      tradeStats.lastProcessedAt || 0,
      klineStats.lastProcessedAt || 0,
      tickerStats.lastProcessedAt || 0
    );

    const result: ParserStats = {
      totalProcessed: this.stats.totalProcessed,
      successCount: this.stats.successCount,
      errorCount: this.stats.errorCount,
      validationFailures: this.stats.validationFailures,
      performance: { ...this.stats.performance },
      errors: {
        byType: {
          ...this.stats.errors.byType,
          ...tradeStats.errors.byType,
          ...klineStats.errors.byType,
          ...tickerStats.errors.byType
        },
        recent: [
          ...this.stats.errors.recent,
          ...tradeStats.errors.recent.slice(-10),
          ...klineStats.errors.recent.slice(-10),
          ...tickerStats.errors.recent.slice(-10)
        ].slice(-50)
      }
    };

    if (maxTime > 0) {
      result.lastProcessedAt = maxTime;
    }

    return result;
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats.totalProcessed = 0;
    this.stats.successCount = 0;
    this.stats.errorCount = 0;
    this.stats.validationFailures = 0;
    this.stats.performance = {
      averageParseTime: 0,
      p95ParseTime: 0,
      p99ParseTime: 0
    };
    this.stats.errors = {
      byType: {},
      recent: []
    };
    delete this.stats.lastProcessedAt;

    // 重置子解析器统计
    this.tradeParser.resetStats();
    this.klineParser.resetStats();
    this.tickerParser.resetStats();
  }

  /**
   * 获取子解析器统计信息
   */
  getDetailedStats(): {
    combined: ParserStats;
    trade: ParserStats;
    kline: ParserStats;
    ticker: ParserStats;
  } {
    return {
      combined: this.getStats(),
      trade: this.tradeParser.getStats(),
      kline: this.klineParser.getStats(),
      ticker: this.tickerParser.getStats()
    };
  }

  /**
   * 将数据分发到相应的解析器
   */
  private delegateToParser(input: BinanceCombinedStream<any>): MarketData {
    const { stream, data } = input;
    
    // 解析流名称以确定数据类型
    const streamType = this.extractStreamType(stream);

    switch (streamType) {
      case 'trade':
        return this.tradeParser.parse(data as BinanceTradeStream);
      
      case 'kline':
        return this.klineParser.parse(data as BinanceKlineStream);
      
      case 'ticker':
        return this.tickerParser.parse(data as BinanceTickerStream);
      
      default:
        throw new UnsupportedDataTypeError(streamType, { stream, streamType });
    }
  }

  /**
   * 从流名称提取数据类型
   */
  private extractStreamType(stream: string): string {
    // 流名称格式: symbol@type 或 symbol@type@params
    const parts = stream.split('@');
    if (parts.length < 2) {
      throw new ValidationError(`Invalid stream name format: ${stream}`);
    }

    const type = parts[1];
    if (!type) {
      throw new ValidationError(`Missing stream type in: ${stream}`);
    }

    // 标准化类型名称
    if (type === 'trade') {
      return 'trade';
    } else if (type.startsWith('kline_')) {
      return 'kline';
    } else if (type === '24hrTicker') {
      return 'ticker';
    } else if (type.startsWith('depth')) {
      return 'depth'; // 暂不支持，将来可以添加
    } else {
      throw new UnsupportedDataTypeError(type, { stream, extractedType: type });
    }
  }

  /**
   * 处理解析错误
   */
  private handleError(error: Error, input?: any): void {
    this.stats.errorCount++;

    const errorType = error.constructor.name;
    this.stats.errors.byType[errorType] = (this.stats.errors.byType[errorType] || 0) + 1;

    const parsingError: ParsingError = {
      timestamp: Date.now(),
      message: error.message,
      type: errorType,
      input: input ? this.sanitizeInput(input) : undefined
    };

    this.stats.errors.recent.push(parsingError);

    // 保持最近错误列表大小
    if (this.stats.errors.recent.length > 50) {
      this.stats.errors.recent = this.stats.errors.recent.slice(-50);
    }
  }

  /**
   * 更新性能统计
   */
  private updatePerformanceStats(startTime: number): void {
    const duration = this.getHighResolutionTime() - startTime;
    
    // 简单的移动平均
    const alpha = 0.1;
    this.stats.performance.averageParseTime = 
      this.stats.performance.averageParseTime * (1 - alpha) + duration * alpha;

    // 简化的 P95/P99 估算
    if (duration > this.stats.performance.p95ParseTime) {
      this.stats.performance.p95ParseTime = duration;
    }
    if (duration > this.stats.performance.p99ParseTime) {
      this.stats.performance.p99ParseTime = duration;
    }
  }

  /**
   * 获取高精度时间（微秒）
   */
  private getHighResolutionTime(): number {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds * 1_000_000 + nanoseconds / 1_000;
  }

  /**
   * 清理输入数据以避免敏感信息泄露
   */
  private sanitizeInput(input: any): any {
    if (typeof input !== 'object' || input === null) {
      return input;
    }

    // 创建浅拷贝并移除可能敏感的字段
    const sanitized = { ...input };
    
    // 保留关键字段用于调试，但限制字符串长度
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      }
    }

    return sanitized;
  }
}