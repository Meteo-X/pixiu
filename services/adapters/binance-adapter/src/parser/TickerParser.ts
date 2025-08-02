/**
 * Ticker Parser for Binance Adapter
 * 
 * 负责解析 Binance 24hr Ticker 数据流
 */

import { BinanceTickerStream, Exchange, DataType } from '../types';
import { 
  ITickerParser,
  MarketData,
  ParserStats,
  ParsingError,
  ValidationError,
  DataParsingError
} from './interfaces';
import { DataNormalizer } from './DataNormalizer';

/**
 * Binance Ticker 数据解析器
 */
export class TickerParser implements ITickerParser {
  private readonly normalizer: DataNormalizer;
  private readonly stats: ParserStats;
  private readonly config: {
    enableValidation: boolean;
    batchSize: number;
    maxErrorsPerMinute: number;
  };

  constructor(config?: Partial<TickerParser['config']>) {
    this.normalizer = new DataNormalizer();
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
   * 解析单个 Ticker 流数据
   */
  parse(input: BinanceTickerStream): MarketData {
    const startTime = this.getHighResolutionTime();
    
    try {
      this.stats.totalProcessed++;

      // 验证输入数据
      if (this.config.enableValidation && !this.validate(input)) {
        this.stats.validationFailures++;
        throw new ValidationError('Invalid ticker data format', input);
      }

      // 标准化数据
      const tickerData = this.normalizer.normalizeTicker(input);

      // 构建标准化市场数据
      const marketData: MarketData = {
        exchange: Exchange.BINANCE,
        symbol: input.s.toUpperCase(),
        timestamp: input.E, // 事件时间
        type: DataType.TICKER,
        data: tickerData
      };

      this.stats.successCount++;
      this.updatePerformanceStats(startTime);
      this.stats.lastProcessedAt = Date.now();

      return marketData;

    } catch (error) {
      this.handleError(error as Error, input);
      throw error;
    }
  }

  /**
   * 批量解析 Ticker 数据
   */
  parseBatch(inputs: BinanceTickerStream[]): MarketData[] {
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
  validate(input: unknown): input is BinanceTickerStream {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const data = input as any;

    // 检查事件类型
    if (data.e !== '24hrTicker') {
      return false;
    }

    // 检查必需字段存在性
    const requiredFields = [
      'E', 's', 'p', 'P', 'w', 'x', 'c', 'Q', 'b', 'B', 'a', 'A', 'o', 'h', 'l', 'v', 'q', 'O', 'C', 'F', 'L', 'n'
    ];
    
    for (const field of requiredFields) {
      if (!(field in data)) {
        return false;
      }
    }

    // 检查基础数据类型
    if (typeof data.E !== 'number' || data.E <= 0) {
      return false;
    }

    if (typeof data.s !== 'string' || !data.s) {
      return false;
    }

    if (typeof data.n !== 'number' || data.n < 0) {
      return false;
    }

    if (typeof data.F !== 'number' || data.F < 0) {
      return false;
    }

    if (typeof data.L !== 'number' || data.L < 0) {
      return false;
    }

    if (typeof data.O !== 'number' || data.O <= 0) {
      return false;
    }

    if (typeof data.C !== 'number' || data.C <= 0) {
      return false;
    }

    // 验证价格字段格式
    const priceFields = ['p', 'P', 'w', 'x', 'c', 'Q', 'b', 'B', 'a', 'A', 'o', 'h', 'l', 'v', 'q'];
    for (const field of priceFields) {
      if (typeof data[field] !== 'string' || !data[field]) {
        return false;
      }
      try {
        const value = parseFloat(data[field]);
        if (isNaN(value)) {
          return false;
        }
        // 某些字段可以为负数（如价格变化），某些不能
        if (['b', 'B', 'a', 'A', 'o', 'h', 'l', 'c', 'v', 'q', 'Q', 'w'].includes(field) && value < 0) {
          return false;
        }
      } catch {
        return false;
      }
    }

    // 验证时间戳合理性
    const now = Date.now();
    if (data.E > now + 60000 || data.E < now - 24 * 60 * 60 * 1000) {
      return false;
    }

    if (data.O > now + 60000 || data.O < now - 48 * 60 * 60 * 1000) { // 开盘时间可以更早
      return false;
    }

    if (data.C > now + 60000 || data.C < now - 24 * 60 * 60 * 1000) {
      return false;
    }

    // 验证开盘时间小于收盘时间
    if (data.O >= data.C) {
      return false;
    }

    // 验证价格逻辑关系
    try {
      const open = parseFloat(data.o);
      const close = parseFloat(data.c);
      const high = parseFloat(data.h);
      const low = parseFloat(data.l);
      const bid = parseFloat(data.b);
      const ask = parseFloat(data.a);

      // 最高价应该 >= max(开盘价, 收盘价)，最低价应该 <= min(开盘价, 收盘价)
      if (high < Math.max(open, close) || low > Math.min(open, close)) {
        return false;
      }

      // 买价应该 <= 最新价 <= 卖价 (在正常市场条件下)
      if (bid > close || ask < close) {
        // 警告但不拒绝，因为在极端市场条件下可能出现
        // console.warn('Unusual bid/ask/price relationship', { bid, ask, close });
      }

      // 买价应该 < 卖价
      if (bid >= ask) {
        return false;
      }
    } catch {
      return false;
    }

    return true;
  }

  /**
   * 获取解析器统计信息
   */
  getStats(): ParserStats {
    return {
      ...this.stats,
      performance: { ...this.stats.performance },
      errors: {
        byType: { ...this.stats.errors.byType },
        recent: [...this.stats.errors.recent]
      }
    };
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