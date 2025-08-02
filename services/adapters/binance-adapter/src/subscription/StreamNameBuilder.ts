/**
 * Binance 流名称构建器实现
 * 
 * 功能:
 * - 根据 Binance API 规范构建流名称
 * - 支持 trade、kline、ticker、depth 等数据类型
 * - 提供流名称验证和解析功能
 * - 生成组合流 URL
 */

import {
  IStreamNameBuilder,
  StreamNameBuildOptions,
  CombinedStreamConfig,
  BINANCE_STREAM_TYPES,
  BINANCE_KLINE_INTERVALS
} from './interfaces';
import {
  DataSubscription,
  DataType,
  KlineInterval
} from '../types';

export class StreamNameBuilder implements IStreamNameBuilder {
  private readonly defaultOptions: StreamNameBuildOptions = {
    forceLowercase: true,
    symbolSeparator: '',
    paramSeparator: '_',
    validate: true
  };

  /**
   * 构建单个流名称
   * 
   * Binance 流名称格式:
   * - Trade: {symbol}@trade (例: btcusdt@trade)
   * - Kline: {symbol}@kline_{interval} (例: btcusdt@kline_1m)
   * - Ticker: {symbol}@ticker (例: btcusdt@ticker)
   * - Depth: {symbol}@depth (例: btcusdt@depth)
   */
  public buildStreamName(
    subscription: DataSubscription,
    options: StreamNameBuildOptions = {}
  ): string {
    const opts = { ...this.defaultOptions, ...options };
    
    // 标准化交易对名称
    const symbol = this.normalizeSymbol(subscription.symbol, opts);
    
    // 根据数据类型构建流名称
    let streamName: string;
    
    switch (subscription.dataType) {
      case DataType.TRADE:
        streamName = `${symbol}@trade`;
        break;
        
      case DataType.TICKER:
        streamName = `${symbol}@ticker`;
        break;
        
      case DataType.DEPTH:
        streamName = this.buildDepthStreamName(symbol, subscription, opts);
        break;
        
      case DataType.KLINE_1M:
      case DataType.KLINE_5M:
      case DataType.KLINE_15M:
      case DataType.KLINE_30M:
      case DataType.KLINE_1H:
      case DataType.KLINE_4H:
      case DataType.KLINE_1D:
        streamName = this.buildKlineStreamName(symbol, subscription, opts);
        break;
        
      default:
        throw new Error(`Unsupported data type: ${subscription.dataType}`);
    }
    
    // 验证流名称格式
    if (opts.validate && !this.validateStreamName(streamName)) {
      throw new Error(`Invalid stream name format: ${streamName}`);
    }
    
    return streamName;
  }

  /**
   * 构建组合流 URL
   * 
   * Binance 组合流格式:
   * wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/btcusdt@kline_1m
   */
  public buildCombinedStreamUrl(
    streamNames: string[],
    baseUrl: string,
    config: Partial<CombinedStreamConfig> = {}
  ): string {
    if (streamNames.length === 0) {
      throw new Error('Stream names array cannot be empty');
    }

    // 应用最大流数量限制
    const maxStreams = config.maxStreams || 1024; // Binance 限制
    if (streamNames.length > maxStreams) {
      throw new Error(`Too many streams: ${streamNames.length} > ${maxStreams}`);
    }

    // 去重和验证
    const uniqueStreams = [...new Set(streamNames)];
    for (const streamName of uniqueStreams) {
      if (!this.validateStreamName(streamName)) {
        throw new Error(`Invalid stream name: ${streamName}`);
      }
    }

    // 构建 URL
    const streamsParam = uniqueStreams.join('/');
    const encodingOpts = config.encoding || {};
    
    let url = `${baseUrl}/stream?streams=${streamsParam}`;
    
    // 应用编码选项
    if (encodingOpts.encodeURI) {
      url = encodeURI(url);
    } else if (encodingOpts.encodeComponent) {
      const baseIndex = url.indexOf('?streams=');
      const base = url.substring(0, baseIndex + 9);
      const streams = url.substring(baseIndex + 9);
      url = base + encodeURIComponent(streams);
    }
    
    return url;
  }

  /**
   * 解析流名称，返回订阅信息
   */
  public parseStreamName(streamName: string): DataSubscription | null {
    if (!this.validateStreamName(streamName)) {
      return null;
    }

    try {
      const [symbolPart, typePart] = streamName.split('@');
      
      if (!symbolPart || !typePart) {
        return null;
      }

      const symbol = symbolPart.toUpperCase();
      
      // 解析数据类型
      let dataType: DataType;
      let params: any = {};

      if (typePart === 'trade') {
        dataType = DataType.TRADE;
      } else if (typePart === 'ticker') {
        dataType = DataType.TICKER;
      } else if (typePart === 'depth') {
        dataType = DataType.DEPTH;
      } else if (typePart.startsWith('kline_')) {
        const interval = typePart.replace('kline_', '') as KlineInterval;
        dataType = this.getKlineDataType(interval);
        params.interval = interval;
      } else if (typePart.startsWith('depth')) {
        dataType = DataType.DEPTH;
        // 解析深度参数 (如 depth5, depth10)
        const match = typePart.match(/depth(\d+)?(@\d+ms)?/);
        if (match) {
          if (match[1]) params.levels = parseInt(match[1]);
          if (match[2]) params.speed = match[2].replace('@', '');
        }
      } else {
        return null;
      }

      return {
        symbol,
        dataType,
        params: Object.keys(params).length > 0 ? params : undefined
      };
      
    } catch (error) {
      return null;
    }
  }

  /**
   * 验证流名称格式
   */
  public validateStreamName(streamName: string): boolean {
    if (!streamName || typeof streamName !== 'string') {
      return false;
    }

    // Binance 流名称模式
    const patterns = [
      /^[a-z0-9]+@trade$/,                    // trade
      /^[a-z0-9]+@ticker$/,                   // ticker  
      /^[a-z0-9]+@depth(\d+)?(@\d+ms)?$/,     // depth
      /^[a-z0-9]+@kline_[1-9]\d*[mhd]$/,      // kline
    ];

    return patterns.some(pattern => pattern.test(streamName));
  }

  /**
   * 获取支持的数据类型
   */
  public getSupportedDataTypes(): DataType[] {
    return Object.keys(BINANCE_STREAM_TYPES) as DataType[];
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 标准化交易对名称
   */
  private normalizeSymbol(symbol: string, options: StreamNameBuildOptions): string {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Symbol must be a non-empty string');
    }

    let normalized = symbol.trim();
    
    // 移除分隔符
    if (options.symbolSeparator) {
      normalized = normalized.replace(new RegExp(options.symbolSeparator, 'g'), '');
    }
    
    // 强制小写（Binance 要求）
    if (options.forceLowercase) {
      normalized = normalized.toLowerCase();
    }
    
    // 验证交易对格式
    if (!/^[a-zA-Z0-9]+$/.test(normalized)) {
      throw new Error(`Invalid symbol format: ${symbol}`);
    }
    
    return normalized;
  }

  /**
   * 构建 Kline 流名称
   */
  private buildKlineStreamName(
    symbol: string,
    subscription: DataSubscription,
    options: StreamNameBuildOptions
  ): string {
    const interval = BINANCE_KLINE_INTERVALS[subscription.dataType];
    
    if (!interval) {
      throw new Error(`No interval mapping for data type: ${subscription.dataType}`);
    }

    // 支持自定义间隔参数
    const customInterval = subscription.params?.interval;
    const finalInterval = customInterval || interval;
    
    // 验证间隔格式
    if (!this.validateKlineInterval(finalInterval)) {
      throw new Error(`Invalid kline interval: ${finalInterval}`);
    }

    return `${symbol}@kline${options.paramSeparator}${finalInterval}`;
  }

  /**
   * 构建 Depth 流名称
   */
  private buildDepthStreamName(
    symbol: string,
    subscription: DataSubscription,
    _options: StreamNameBuildOptions
  ): string {
    let streamName = `${symbol}@depth`;
    
    // 添加深度级别参数
    if (subscription.params?.levels) {
      streamName += subscription.params.levels;
    }
    
    // 添加更新速度参数
    if (subscription.params?.speed) {
      streamName += `@${subscription.params.speed}`;
    }
    
    return streamName;
  }

  /**
   * 验证 K线间隔格式
   */
  private validateKlineInterval(interval: string): boolean {
    const validIntervals = [
      '1m', '3m', '5m', '15m', '30m',
      '1h', '2h', '4h', '6h', '8h', '12h',
      '1d', '3d', '1w', '1M'
    ];
    
    return validIntervals.includes(interval);
  }

  /**
   * 根据间隔获取 K线数据类型
   */
  private getKlineDataType(interval: KlineInterval): DataType {
    const mapping: Record<KlineInterval, DataType> = {
      '1m': DataType.KLINE_1M,
      '5m': DataType.KLINE_5M,
      '15m': DataType.KLINE_15M,
      '30m': DataType.KLINE_30M,
      '1h': DataType.KLINE_1H,
      '4h': DataType.KLINE_4H,
      '1d': DataType.KLINE_1D
    } as any;
    
    return mapping[interval];
  }

  /**
   * 批量构建流名称
   */
  public buildStreamNames(
    subscriptions: DataSubscription[],
    options: StreamNameBuildOptions = {}
  ): string[] {
    return subscriptions.map(sub => this.buildStreamName(sub, options));
  }

  /**
   * 获取流名称统计信息
   */
  public getStreamNameStats(streamNames: string[]): {
    total: number;
    byType: Record<string, number>;
    bySymbol: Record<string, number>;
    duplicates: string[];
  } {
    const stats = {
      total: streamNames.length,
      byType: {} as Record<string, number>,
      bySymbol: {} as Record<string, number>,
      duplicates: [] as string[]
    };

    const seen = new Set<string>();
    
    for (const streamName of streamNames) {
      // 检查重复
      if (seen.has(streamName)) {
        stats.duplicates.push(streamName);
        continue;
      }
      seen.add(streamName);

      // 解析并统计
      const subscription = this.parseStreamName(streamName);
      if (subscription) {
        // 按类型统计
        const type = subscription.dataType;
        stats.byType[type] = (stats.byType[type] || 0) + 1;
        
        // 按交易对统计
        const symbol = subscription.symbol;
        stats.bySymbol[symbol] = (stats.bySymbol[symbol] || 0) + 1;
      }
    }

    return stats;
  }
}