/**
 * Trade Parser for Binance Adapter
 * 
 * 负责解析 Binance Trade 数据流
 */

import { BinanceTradeStream, Exchange, DataType } from '../types';
import { 
  ITradeParser,
  MarketData,
  ParserStats,
  ParsingError,
  ValidationError,
  DataParsingError
} from './interfaces';
import { DataNormalizer } from './DataNormalizer';

/**
 * Binance Trade 数据解析器
 */
export class TradeParser implements ITradeParser {
  private readonly normalizer: DataNormalizer;
  private readonly stats: ParserStats;
  private readonly config: {
    enableValidation: boolean;
    batchSize: number;
    maxErrorsPerMinute: number;
  };

  constructor(config?: Partial<TradeParser['config']>) {
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
   * 解析单个 Trade 流数据
   */
  parse(input: BinanceTradeStream): MarketData {
    const startTime = this.getHighResolutionTime();
    
    try {
      this.stats.totalProcessed++;

      // 验证输入数据
      if (this.config.enableValidation && !this.validate(input)) {
        this.stats.validationFailures++;
        throw new ValidationError('Invalid trade data format', input);
      }

      // 标准化数据
      const tradeData = this.normalizer.normalizeTrade(input);

      // 构建标准化市场数据
      const marketData: MarketData = {
        exchange: Exchange.BINANCE,
        symbol: input.s.toUpperCase(),
        timestamp: input.E, // 事件时间
        type: DataType.TRADE,
        data: tradeData
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
   * 批量解析 Trade 数据
   */
  parseBatch(inputs: BinanceTradeStream[]): MarketData[] {
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
  validate(input: unknown): input is BinanceTradeStream {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const data = input as any;

    // 检查必需字段
    const requiredFields = ['e', 'E', 's', 't', 'p', 'q', 'T', 'm'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        return false;
      }
    }

    // 检查事件类型
    if (data.e !== 'trade') {
      return false;
    }

    // 检查数据类型
    if (typeof data.E !== 'number' || data.E <= 0) {
      return false;
    }

    if (typeof data.s !== 'string' || !data.s) {
      return false;
    }

    if (typeof data.t !== 'number' || data.t <= 0) {
      return false;
    }

    if (typeof data.p !== 'string' || !data.p) {
      return false;
    }

    if (typeof data.q !== 'string' || !data.q) {
      return false;
    }

    if (typeof data.T !== 'number' || data.T <= 0) {
      return false;
    }

    if (typeof data.m !== 'boolean') {
      return false;
    }

    // 验证价格和数量格式
    try {
      const price = parseFloat(data.p);
      const quantity = parseFloat(data.q);
      
      if (isNaN(price) || price <= 0) {
        return false;
      }

      if (isNaN(quantity) || quantity <= 0) {
        return false;
      }
    } catch {
      return false;
    }

    // 验证时间戳合理性
    const now = Date.now();
    if (data.E > now + 60000 || data.E < now - 24 * 60 * 60 * 1000) { // 1分钟后或24小时前
      return false;
    }

    if (data.T > now + 60000 || data.T < now - 24 * 60 * 60 * 1000) {
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

    // 简化的 P95/P99 估算（实际实现可能需要更复杂的算法）
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