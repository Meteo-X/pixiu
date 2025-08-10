/**
 * 数据转换器实现
 * 负责数据格式标准化、验证和元数据添加
 * 重构：使用统一数据处理器减少重复代码
 */

import { MarketData } from '@pixiu/adapter-base';
import { DataTransformer, TransformerStats } from '../interfaces';
import { UnifiedDataProcessor } from '../../utils/data-processor';
import { BaseMonitor } from '@pixiu/shared-core';

/**
 * 标准数据转换器
 * 提供数据标准化、验证和元数据添加功能
 */
export class StandardDataTransformer implements DataTransformer {
  name = 'standard-transformer';
  
  private stats: TransformerStats = {
    transformedCount: 0,
    errorCount: 0,
    averageLatency: 0,
    lastActivity: 0
  };

  private processor: UnifiedDataProcessor;

  constructor(monitor: BaseMonitor) {
    this.processor = new UnifiedDataProcessor(monitor);
  }

  /**
   * 转换市场数据
   */
  async transform(data: MarketData, context?: any): Promise<MarketData> {
    const startTime = Date.now();
    
    try {
      // 使用统一处理器进行数据标准化
      const normalized = this.processor.normalizeMarketData(data);
      
      // 添加元数据
      const enriched = this.enrichWithMetadata(normalized, context);
      
      // 使用统一处理器进行数据验证
      const validation = this.processor.validateMarketData(enriched);
      if (!validation.isValid) {
        throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
      }
      
      // 更新统计信息
      this.updateStats(Date.now() - startTime, false);
      
      return enriched;
    } catch (error) {
      this.updateStats(Date.now() - startTime, true);
      throw error;
    }
  }

  /**
   * 验证数据完整性和有效性
   * @deprecated 使用统一处理器代替
   */
  validate(data: MarketData): boolean {
    const validation = this.processor.validateMarketData(data);
    return validation.isValid;
  }

  /**
   * 获取转换器统计信息
   */
  getStats(): TransformerStats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      transformedCount: 0,
      errorCount: 0,
      averageLatency: 0,
      lastActivity: 0
    };
  }

  /**
   * 标准化数据格式
   * @deprecated 使用统一处理器代替
   */
  private normalizeData(data: MarketData): MarketData {
    return this.processor.normalizeMarketData(data);
  }

  /**
   * 添加元数据
   */
  private enrichWithMetadata(data: MarketData, context?: any): MarketData {
    const metadata = {
      // 数据处理时间
      processedAt: Date.now(),
      // 数据延迟（处理时间 - 接收时间）
      latency: Date.now() - (data.receivedAt || data.timestamp),
      // 数据来源
      source: 'exchange-collector',
      // 处理版本
      processingVersion: '4.1.0',
      // 数据质量分数（使用统一处理器）
      qualityScore: this.processor.calculateQualityScore(data),
      // 上下文信息
      ...(context && { context })
    };

    return {
      ...data,
      metadata: {
        ...data.metadata,
        ...metadata
      }
    };
  }

  /**
   * 标准化数据类型
   * @deprecated 使用统一处理器代替
   */
  private normalizeDataType(type: string): string {
    return this.processor.normalizeDataType(type);
  }

  /**
   * 根据数据类型验证数据
   * @deprecated 使用统一处理器代替
   */
  private validateDataByType(data: MarketData): boolean {
    const validation = this.processor.validateMarketData(data);
    return validation.isValid;
  }

  /**
   * 计算数据质量分数
   * @deprecated 使用统一处理器代替
   */
  private calculateQualityScore(data: MarketData): number {
    return this.processor.calculateQualityScore(data);
  }

  /**
   * 更新统计信息
   */
  private updateStats(latency: number, isError: boolean): void {
    if (isError) {
      this.stats.errorCount++;
    } else {
      this.stats.transformedCount++;
      
      // 更新平均延迟
      const totalLatency = this.stats.averageLatency * (this.stats.transformedCount - 1) + latency;
      this.stats.averageLatency = totalLatency / this.stats.transformedCount;
    }
    
    this.stats.lastActivity = Date.now();
  }
}

/**
 * 压缩数据转换器
 * 用于大数据量的压缩处理
 */
export class CompressionTransformer implements DataTransformer {
  name = 'compression-transformer';
  
  private stats: TransformerStats = {
    transformedCount: 0,
    errorCount: 0,
    averageLatency: 0,
    lastActivity: 0
  };

  async transform(data: MarketData, context?: any): Promise<MarketData> {
    const startTime = Date.now();
    
    try {
      // 对于大型数据（如深度数据）进行压缩
      let processedData = data;
      
      if (data.type === 'depth' && this.shouldCompress(data.data)) {
        processedData = {
          ...data,
          data: this.compressDepthData(data.data),
          metadata: {
            ...data.metadata,
            compressed: true,
            compressionRatio: this.calculateCompressionRatio(data.data)
          }
        };
      }
      
      this.updateStats(Date.now() - startTime, false);
      return processedData;
    } catch (error) {
      this.updateStats(Date.now() - startTime, true);
      throw error;
    }
  }

  validate(data: MarketData): boolean {
    // 简单验证，主要由标准转换器处理
    return !!(data && data.data);
  }

  getStats(): TransformerStats {
    return { ...this.stats };
  }

  /**
   * 判断是否需要压缩
   */
  private shouldCompress(data: any): boolean {
    if (!data.bids || !data.asks) return false;
    
    // 如果订单簿层数超过100层，进行压缩
    return (data.bids.length + data.asks.length) > 200;
  }

  /**
   * 压缩深度数据
   */
  private compressDepthData(data: any): any {
    return {
      ...data,
      // 只保留前50层买卖盘数据
      bids: data.bids.slice(0, 50),
      asks: data.asks.slice(0, 50),
      // 添加压缩标记
      _compressed: true,
      _originalSize: {
        bids: data.bids.length,
        asks: data.asks.length
      }
    };
  }

  /**
   * 计算压缩比率
   */
  private calculateCompressionRatio(originalData: any): number {
    const originalSize = (originalData.bids?.length || 0) + (originalData.asks?.length || 0);
    const compressedSize = Math.min(50, originalData.bids?.length || 0) + 
                          Math.min(50, originalData.asks?.length || 0);
    
    return originalSize > 0 ? compressedSize / originalSize : 1;
  }

  private updateStats(latency: number, isError: boolean): void {
    if (isError) {
      this.stats.errorCount++;
    } else {
      this.stats.transformedCount++;
      
      // 更新平均延迟
      const totalLatency = this.stats.averageLatency * (this.stats.transformedCount - 1) + latency;
      this.stats.averageLatency = totalLatency / this.stats.transformedCount;
    }
    
    this.stats.lastActivity = Date.now();
  }
}