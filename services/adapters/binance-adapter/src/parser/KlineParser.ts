/**
 * Kline Parser for Binance Adapter
 * 
 * 负责解析 Binance Kline 数据流
 */

import { BinanceKlineStream, Exchange, DataType } from '../types';
import { 
  IKlineParser,
  MarketData,
  ParserStats,
  ParsingError,
  ValidationError,
  DataParsingError
} from './interfaces';
import { DataNormalizer } from './DataNormalizer';

/**
 * Binance Kline 数据解析器
 */
export class KlineParser implements IKlineParser {
  private readonly normalizer: DataNormalizer;
  private readonly stats: ParserStats;
  private readonly config: {
    enableValidation: boolean;
    batchSize: number;
    maxErrorsPerMinute: number;
    onlyClosedKlines: boolean;
  };

  constructor(config?: Partial<KlineParser['config']>) {
    this.normalizer = new DataNormalizer();
    this.config = {
      enableValidation: true,
      batchSize: 100,
      maxErrorsPerMinute: 10,
      onlyClosedKlines: false, // 设置为 true 则只处理已关闭的 K线
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
   * 解析单个 Kline 流数据
   */
  parse(input: BinanceKlineStream): MarketData {
    const startTime = this.getHighResolutionTime();
    
    try {
      this.stats.totalProcessed++;

      // 验证输入数据
      if (this.config.enableValidation && !this.validate(input)) {
        this.stats.validationFailures++;
        throw new ValidationError('Invalid kline data format', input);
      }

      // 如果配置为只处理已关闭的 K线，跳过未关闭的
      if (this.config.onlyClosedKlines && !input.k.x) {
        throw new ValidationError('Kline is not closed', input, { closed: input.k.x });
      }

      // 标准化数据
      const klineData = this.normalizer.normalizeKline(input);

      // 确定数据类型（基于间隔）
      const dataType = this.getDataTypeFromInterval(input.k.i);

      // 构建标准化市场数据
      const marketData: MarketData = {
        exchange: Exchange.BINANCE,
        symbol: input.s.toUpperCase(),
        timestamp: input.E, // 事件时间
        type: dataType,
        data: klineData
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
   * 批量解析 Kline 数据
   */
  parseBatch(inputs: BinanceKlineStream[]): MarketData[] {
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
  validate(input: unknown): input is BinanceKlineStream {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const data = input as any;

    // 检查顶层必需字段
    if (data.e !== 'kline' || typeof data.E !== 'number' || typeof data.s !== 'string') {
      return false;
    }

    // 检查 k 对象
    if (!data.k || typeof data.k !== 'object') {
      return false;
    }

    const kline = data.k;

    // 检查 kline 必需字段
    const requiredFields = ['t', 'T', 's', 'i', 'o', 'c', 'h', 'l', 'v', 'n', 'x', 'q', 'V', 'Q'];
    for (const field of requiredFields) {
      if (!(field in kline)) {
        return false;
      }
    }

    // 检查数据类型
    if (typeof kline.t !== 'number' || kline.t <= 0) {
      return false;
    }

    if (typeof kline.T !== 'number' || kline.T <= 0) {
      return false;
    }

    if (typeof kline.s !== 'string' || !kline.s) {
      return false;
    }

    if (typeof kline.i !== 'string' || !kline.i) {
      return false;
    }

    if (typeof kline.x !== 'boolean') {
      return false;
    }

    if (typeof kline.n !== 'number' || kline.n < 0) {
      return false;
    }

    // 验证价格字段格式
    const priceFields = ['o', 'c', 'h', 'l'];
    for (const field of priceFields) {
      if (typeof kline[field] !== 'string' || !kline[field]) {
        return false;
      }
      try {
        const price = parseFloat(kline[field]);
        if (isNaN(price) || price <= 0) {
          return false;
        }
      } catch {
        return false;
      }
    }

    // 验证数量字段格式
    const volumeFields = ['v', 'q', 'V', 'Q'];
    for (const field of volumeFields) {
      if (typeof kline[field] !== 'string' || !kline[field]) {
        return false;
      }
      try {
        const volume = parseFloat(kline[field]);
        if (isNaN(volume) || volume < 0) {
          return false;
        }
      } catch {
        return false;
      }
    }

    // 验证时间戳合理性
    const now = Date.now();
    if (kline.t > now + 60000 || kline.t < now - 24 * 60 * 60 * 1000) {
      return false;
    }

    if (kline.T > now + 60000 || kline.T < now - 24 * 60 * 60 * 1000) {
      return false;
    }

    // 验证开始时间小于结束时间
    if (kline.t >= kline.T) {
      return false;
    }

    // 验证价格逻辑关系 (high >= max(open, close), low <= min(open, close))
    try {
      const open = parseFloat(kline.o);
      const close = parseFloat(kline.c);
      const high = parseFloat(kline.h);
      const low = parseFloat(kline.l);

      if (high < Math.max(open, close) || low > Math.min(open, close)) {
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
   * 根据间隔确定数据类型
   */
  private getDataTypeFromInterval(interval: string): DataType {
    const intervalMap: Record<string, DataType> = {
      '1m': DataType.KLINE_1M,
      '5m': DataType.KLINE_5M,
      '15m': DataType.KLINE_15M,
      '30m': DataType.KLINE_30M,
      '1h': DataType.KLINE_1H,
      '4h': DataType.KLINE_4H,
      '1d': DataType.KLINE_1D
    };

    const dataType = intervalMap[interval];
    if (!dataType) {
      throw new ValidationError(`Unsupported kline interval: ${interval}`);
    }

    return dataType;
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