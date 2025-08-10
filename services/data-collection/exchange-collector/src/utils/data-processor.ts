/**
 * 统一数据处理工具类
 * 整合所有重复的数据验证、标准化、解析逻辑
 */

import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor } from '@pixiu/shared-core';

export interface DataValidationResult {
  isValid: boolean;
  errors: string[];
  qualityScore: number;
}

export interface DataNormalizationOptions {
  /** 是否强制转换交易所名称为小写 */
  lowerCaseExchange?: boolean;
  /** 是否强制转换交易对名称为大写 */
  upperCaseSymbol?: boolean;
  /** 是否添加接收时间 */
  addReceiveTime?: boolean;
  /** 是否标准化数据类型 */
  normalizeDataType?: boolean;
}

export interface MessageParsingResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 统一数据处理器
 * 提供所有数据处理的通用功能
 */
export class UnifiedDataProcessor {
  private monitor: BaseMonitor;
  private validationCache = new Map<string, DataValidationResult>();
  private typeCache = new Map<string, string>();
  
  constructor(monitor: BaseMonitor) {
    this.monitor = monitor;
  }

  /**
   * 安全的JSON解析
   */
  parseJSON<T = any>(jsonString: string): MessageParsingResult<T> {
    try {
      const data = JSON.parse(jsonString);
      return { success: true, data };
    } catch (error) {
      this.monitor.log('warn', 'JSON parse failed', { 
        error: error.message,
        jsonString: jsonString.substring(0, 100) 
      });
      return { 
        success: false, 
        error: `JSON parse error: ${error.message}` 
      };
    }
  }

  /**
   * 验证市场数据完整性和有效性
   */
  validateMarketData(data: MarketData, useCache = true): DataValidationResult {
    const cacheKey = this.generateValidationCacheKey(data);
    
    if (useCache && this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    const errors: string[] = [];
    let qualityScore = 1.0;

    // 基本字段验证
    if (!data.exchange || typeof data.exchange !== 'string') {
      errors.push('Missing or invalid exchange field');
      qualityScore -= 0.3;
    }

    if (!data.symbol || typeof data.symbol !== 'string') {
      errors.push('Missing or invalid symbol field');
      qualityScore -= 0.3;
    }

    if (!data.type || typeof data.type !== 'string') {
      errors.push('Missing or invalid type field');
      qualityScore -= 0.3;
    }

    if (!data.timestamp || typeof data.timestamp !== 'number' || data.timestamp <= 0) {
      errors.push('Missing or invalid timestamp field');
      qualityScore -= 0.3;
    }

    // 时间戳合理性验证
    if (data.timestamp) {
      const now = Date.now();
      const timeDiff = Math.abs(now - data.timestamp);
      
      if (timeDiff > 300000) { // 超过5分钟
        errors.push('Timestamp too far from current time');
        qualityScore -= 0.2;
      }
    }

    // 数据内容验证
    if (!data.data || typeof data.data !== 'object') {
      errors.push('Missing or invalid data field');
      qualityScore -= 0.3;
    } else {
      const dataValidation = this.validateDataByType(data.type, data.data);
      errors.push(...dataValidation.errors);
      qualityScore *= dataValidation.qualityScore;
    }

    // 数据延迟验证
    if (data.receivedAt && data.timestamp) {
      const latency = data.receivedAt - data.timestamp;
      if (latency > 5000) { // 超过5秒延迟
        errors.push('High data latency detected');
        qualityScore -= 0.1;
      }
    }

    const result: DataValidationResult = {
      isValid: errors.length === 0,
      errors,
      qualityScore: Math.max(0, Math.min(1, qualityScore))
    };

    if (useCache) {
      this.validationCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * 标准化市场数据
   */
  normalizeMarketData(
    data: MarketData, 
    options: DataNormalizationOptions = {}
  ): MarketData {
    const defaults: Required<DataNormalizationOptions> = {
      lowerCaseExchange: true,
      upperCaseSymbol: true,
      addReceiveTime: true,
      normalizeDataType: true
    };

    const finalOptions = { ...defaults, ...options };

    const normalized: MarketData = {
      ...data,
      // 标准化交易所名称
      exchange: finalOptions.lowerCaseExchange 
        ? data.exchange.toLowerCase() 
        : data.exchange,
      
      // 标准化交易对名称
      symbol: finalOptions.upperCaseSymbol 
        ? data.symbol.toUpperCase() 
        : data.symbol,
      
      // 确保时间戳为数字
      timestamp: typeof data.timestamp === 'string' 
        ? parseInt(data.timestamp) 
        : data.timestamp,
      
      // 添加接收时间
      receivedAt: finalOptions.addReceiveTime 
        ? (data.receivedAt || Date.now()) 
        : data.receivedAt,
      
      // 标准化数据类型
      type: finalOptions.normalizeDataType 
        ? this.normalizeDataType(data.type) 
        : data.type
    };

    return normalized;
  }

  /**
   * 标准化数据类型
   */
  normalizeDataType(type: string): string {
    if (this.typeCache.has(type)) {
      return this.typeCache.get(type)!;
    }

    const typeMap: Record<string, string> = {
      'trade': 'trade',
      'trades': 'trade',
      'ticker': 'ticker',
      '24hrTicker': 'ticker',
      'kline': 'kline',
      'kline_1m': 'kline_1m',
      'kline_5m': 'kline_5m',
      'kline_15m': 'kline_15m',
      'kline_1h': 'kline_1h',
      'kline_4h': 'kline_4h',
      'kline_1d': 'kline_1d',
      'depth': 'depth',
      'orderbook': 'depth',
      'partialBookDepth': 'depth'
    };

    const normalized = typeMap[type] || type.toLowerCase();
    this.typeCache.set(type, normalized);
    return normalized;
  }

  /**
   * 根据数据类型构建主题名称
   */
  buildTopicName(
    prefix: string, 
    data: MarketData, 
    strategy: 'by_type' | 'by_exchange' | 'by_symbol' = 'by_type'
  ): string {
    switch (strategy) {
      case 'by_type':
        const dataTypeName = this.getDataTypeName(data.type);
        return `${prefix}-${dataTypeName}-${data.exchange}`;
      
      case 'by_exchange':
        return `${prefix}-${data.exchange}`;
      
      case 'by_symbol':
        return `${prefix}-${data.exchange}-${data.symbol.replace('/', '-')}`;
      
      default:
        return `${prefix}-${data.exchange}`;
    }
  }

  /**
   * 构建消息属性
   */
  buildMessageAttributes(
    data: MarketData, 
    source: string = 'exchange-collector',
    additionalAttributes: Record<string, string> = {}
  ): Record<string, string> {
    return {
      exchange: data.exchange,
      symbol: data.symbol,
      type: data.type,
      timestamp: data.timestamp.toString(),
      source,
      processedAt: Date.now().toString(),
      ...additionalAttributes
    };
  }

  /**
   * 计算数据质量分数
   */
  calculateQualityScore(data: MarketData): number {
    let score = 1.0;
    
    // 基于数据完整性
    if (!data.exchange || !data.symbol || !data.type) score -= 0.3;
    if (!data.timestamp || !data.data) score -= 0.3;
    if (!data.receivedAt) score -= 0.1;
    
    // 基于数据延迟
    if (data.receivedAt && data.timestamp) {
      const latency = data.receivedAt - data.timestamp;
      if (latency > 5000) score -= 0.2; // 超过5秒延迟
      else if (latency > 1000) score -= 0.1; // 超过1秒延迟
    }
    
    // 基于数据有效性
    const validation = this.validateDataByType(data.type, data.data);
    score *= validation.qualityScore;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 获取验证统计信息
   */
  getValidationStats(): {
    cacheSize: number;
    typeCacheSize: number;
    memoryUsage: number;
  } {
    return {
      cacheSize: this.validationCache.size,
      typeCacheSize: this.typeCache.size,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
    };
  }

  /**
   * 清理缓存
   */
  clearCaches(): void {
    this.validationCache.clear();
    this.typeCache.clear();
  }

  /**
   * 根据数据类型验证数据
   */
  private validateDataByType(type: string, data: any): DataValidationResult {
    const errors: string[] = [];
    let qualityScore = 1.0;

    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        errors: ['Data is null or not an object'],
        qualityScore: 0
      };
    }

    switch (type) {
      case 'trade':
        if (!data.price || typeof data.price !== 'number' || data.price <= 0) {
          errors.push('Invalid trade price');
          qualityScore -= 0.4;
        }
        if (!data.quantity || typeof data.quantity !== 'number' || data.quantity <= 0) {
          errors.push('Invalid trade quantity');
          qualityScore -= 0.4;
        }
        break;

      case 'ticker':
        if (!data.price || typeof data.price !== 'number' || data.price <= 0) {
          errors.push('Invalid ticker price');
          qualityScore -= 0.5;
        }
        break;

      case 'depth':
        if (!Array.isArray(data.bids)) {
          errors.push('Invalid depth bids data');
          qualityScore -= 0.3;
        }
        if (!Array.isArray(data.asks)) {
          errors.push('Invalid depth asks data');
          qualityScore -= 0.3;
        }
        break;

      default:
        // 对于未知类型，只做基本验证
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      qualityScore
    };
  }

  /**
   * 获取数据类型名称（用于主题命名）
   */
  private getDataTypeName(dataType: string): string {
    switch (dataType) {
      case 'trade':
        return 'trade';
      case 'ticker':
        return 'ticker';
      case 'kline_1m':
      case 'kline_5m':
      case 'kline_1h':
      case 'kline_1d':
        return 'kline';
      case 'depth':
      case 'orderbook':
        return 'depth';
      default:
        return dataType.toLowerCase();
    }
  }

  /**
   * 生成验证缓存键
   */
  private generateValidationCacheKey(data: MarketData): string {
    return `${data.exchange}-${data.symbol}-${data.type}`;
  }
}

/**
 * 全局数据处理器实例（单例）
 */
export class GlobalDataProcessor {
  private static instance: UnifiedDataProcessor | null = null;

  static getInstance(monitor?: BaseMonitor): UnifiedDataProcessor {
    if (!GlobalDataProcessor.instance) {
      if (!monitor) {
        throw new Error('Monitor is required for first initialization');
      }
      GlobalDataProcessor.instance = new UnifiedDataProcessor(monitor);
    }
    return GlobalDataProcessor.instance;
  }

  static resetInstance(): void {
    GlobalDataProcessor.instance = null;
  }
}

/**
 * 便捷函数：验证市场数据
 */
export function validateMarketData(data: MarketData, monitor: BaseMonitor): DataValidationResult {
  const processor = GlobalDataProcessor.getInstance(monitor);
  return processor.validateMarketData(data);
}

/**
 * 便捷函数：标准化市场数据
 */
export function normalizeMarketData(
  data: MarketData, 
  monitor: BaseMonitor,
  options?: DataNormalizationOptions
): MarketData {
  const processor = GlobalDataProcessor.getInstance(monitor);
  return processor.normalizeMarketData(data, options);
}

/**
 * 便捷函数：安全的JSON解析
 */
export function parseJSON<T = any>(jsonString: string, monitor: BaseMonitor): MessageParsingResult<T> {
  const processor = GlobalDataProcessor.getInstance(monitor);
  return processor.parseJSON<T>(jsonString);
}