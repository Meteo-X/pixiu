/**
 * 消息序列化器
 * Task 4.3: 实现数据序列化和压缩
 * 
 * 功能特性：
 * - JSON 序列化
 * - 数据压缩
 * - 消息头管理
 * - 序列化性能优化
 */

import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor } from '@pixiu/shared-core';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

/**
 * 序列化格式
 */
export enum SerializationFormat {
  JSON = 'json',
  JSON_COMPACT = 'json_compact',
  MSGPACK = 'msgpack',
  PROTOBUF = 'protobuf',
  AVRO = 'avro'
}

/**
 * 压缩算法
 */
export enum CompressionAlgorithm {
  NONE = 'none',
  GZIP = 'gzip',
  DEFLATE = 'deflate',
  LZ4 = 'lz4',
  BROTLI = 'brotli'
}

/**
 * 序列化配置
 */
export interface SerializationConfig {
  // 基础配置
  format: SerializationFormat;
  compression: CompressionAlgorithm;
  compressionLevel?: number;        // 压缩级别 (1-9)
  
  // 性能优化
  enableCaching: boolean;           // 是否启用缓存
  cacheSize: number;               // 缓存大小
  enablePooling: boolean;          // 是否启用对象池
  poolSize: number;                // 对象池大小
  
  // 压缩配置
  compressionThreshold: number;     // 压缩阈值（字节）
  batchCompression: boolean;        // 批量压缩
  adaptiveCompression: boolean;     // 自适应压缩
  
  // 序列化选项
  includeMetadata: boolean;         // 是否包含元数据
  timestampPrecision: 'ms' | 'us' | 'ns'; // 时间戳精度
  numberPrecision: number;          // 数字精度
  
  // 验证选项
  enableValidation: boolean;        // 是否启用验证
  strictMode: boolean;             // 严格模式
}

/**
 * 序列化结果
 */
export interface SerializationResult {
  data: Buffer;
  originalSize: number;
  serializedSize: number;
  compressionRatio?: number;
  serializationTime: number;
  compressionTime?: number;
  format: SerializationFormat;
  compression: CompressionAlgorithm;
  metadata: {
    version: string;
    timestamp: number;
    checksum?: string;
  };
}

/**
 * 反序列化结果
 */
export interface DeserializationResult {
  data: MarketData;
  deserializationTime: number;
  decompressionTime?: number;
  validationPassed: boolean;
  metadata: {
    originalFormat: SerializationFormat;
    originalCompression: CompressionAlgorithm;
    checksumValid?: boolean;
  };
}

/**
 * 序列化统计
 */
export interface SerializationStats {
  totalSerialized: number;
  totalDeserialized: number;
  averageSerializationTime: number;
  averageDeserializationTime: number;
  averageCompressionRatio: number;
  cacheHitRate: number;
  errorCount: number;
  
  // 按格式统计
  formatStats: Map<SerializationFormat, {
    count: number;
    averageSize: number;
    averageTime: number;
  }>;
  
  // 按压缩算法统计
  compressionStats: Map<CompressionAlgorithm, {
    count: number;
    averageRatio: number;
    averageTime: number;
  }>;
}

/**
 * 消息头
 */
export interface MessageHeaders {
  // 基础信息
  messageId: string;
  timestamp: number;
  version: string;
  
  // 序列化信息
  format: SerializationFormat;
  compression: CompressionAlgorithm;
  originalSize: number;
  compressedSize?: number;
  
  // 数据信息
  exchange: string;
  symbol: string;
  dataType: string;
  
  // 质量信息
  checksum?: string;
  signature?: string;
  
  // 路由信息
  routingKey?: string;
  topicName?: string;
  
  // 自定义属性
  custom?: Record<string, string>;
}

/**
 * 消息序列化器
 */
export class MessageSerializer {
  private config: SerializationConfig;
  private monitor: BaseMonitor;
  
  // 缓存
  private serializationCache: Map<string, Buffer> = new Map();
  private cacheHitCount = 0;
  private cacheMissCount = 0;
  
  // 对象池
  private bufferPool: Buffer[] = [];
  private resultPool: SerializationResult[] = [];
  
  // 统计信息
  private stats: SerializationStats = {
    totalSerialized: 0,
    totalDeserialized: 0,
    averageSerializationTime: 0,
    averageDeserializationTime: 0,
    averageCompressionRatio: 1.0,
    cacheHitRate: 0,
    errorCount: 0,
    formatStats: new Map(),
    compressionStats: new Map()
  };
  
  // 性能追踪
  private serializationTimes: number[] = [];
  private compressionRatios: number[] = [];

  constructor(config: SerializationConfig, monitor: BaseMonitor) {
    this.config = config;
    this.monitor = monitor;
    this.initializePools();
  }

  /**
   * 序列化市场数据
   */
  async serialize(data: MarketData, headers?: Partial<MessageHeaders>): Promise<SerializationResult> {
    const startTime = Date.now();
    
    try {
      // 生成缓存键
      const cacheKey = this.generateCacheKey(data);
      
      // 检查缓存
      if (this.config.enableCaching) {
        const cached = this.serializationCache.get(cacheKey);
        if (cached) {
          this.cacheHitCount++;
          return this.createCachedResult(cached, startTime);
        }
        this.cacheMissCount++;
      }
      
      // 执行序列化
      const result = await this.performSerialization(data, headers, startTime);
      
      // 缓存结果
      if (this.config.enableCaching) {
        this.cacheSerializationResult(cacheKey, result.data);
      }
      
      // 更新统计
      this.updateSerializationStats(result);
      
      return result;
      
    } catch (error) {
      this.stats.errorCount++;
      this.monitor.log('error', 'Serialization failed', { data, error });
      throw error;
    }
  }

  /**
   * 批量序列化
   */
  async serializeBatch(
    dataList: MarketData[], 
    headersTemplate?: Partial<MessageHeaders>
  ): Promise<SerializationResult[]> {
    const startTime = Date.now();
    
    try {
      const results: SerializationResult[] = [];
      
      if (this.config.batchCompression && this.config.compression !== CompressionAlgorithm.NONE) {
        // 批量压缩模式
        results.push(...await this.serializeBatchWithCompression(dataList, headersTemplate));
      } else {
        // 逐个处理模式
        const serializationPromises = dataList.map(data => 
          this.serialize(data, headersTemplate)
        );
        results.push(...await Promise.all(serializationPromises));
      }
      
      this.monitor.log('debug', 'Batch serialization completed', {
        count: dataList.length,
        totalTime: Date.now() - startTime,
        averageSize: results.reduce((sum, r) => sum + r.serializedSize, 0) / results.length
      });
      
      return results;
      
    } catch (error) {
      this.monitor.log('error', 'Batch serialization failed', { 
        count: dataList.length, 
        error 
      });
      throw error;
    }
  }

  /**
   * 反序列化数据
   */
  async deserialize(buffer: Buffer, headers: MessageHeaders): Promise<DeserializationResult> {
    const startTime = Date.now();
    
    try {
      let data: Buffer = buffer;
      let decompressionTime = 0;
      
      // 解压缩
      if (headers.compression !== CompressionAlgorithm.NONE) {
        const decompressStart = Date.now();
        data = await this.decompress(data, headers.compression);
        decompressionTime = Date.now() - decompressStart;
      }
      
      // 反序列化
      const marketData = await this.performDeserialization(data, headers.format);
      
      // 验证
      const validationPassed = this.config.enableValidation ? 
        this.validateDeserializedData(marketData, headers) : true;
      
      const result: DeserializationResult = {
        data: marketData,
        deserializationTime: Date.now() - startTime,
        decompressionTime: decompressionTime > 0 ? decompressionTime : undefined,
        validationPassed,
        metadata: {
          originalFormat: headers.format,
          originalCompression: headers.compression,
          checksumValid: headers.checksum ? this.validateChecksum(buffer, headers.checksum) : undefined
        }
      };
      
      // 更新统计
      this.updateDeserializationStats(result);
      
      return result;
      
    } catch (error) {
      this.stats.errorCount++;
      this.monitor.log('error', 'Deserialization failed', { headers, error });
      throw error;
    }
  }

  /**
   * 创建消息头
   */
  createMessageHeaders(
    data: MarketData,
    result: SerializationResult,
    custom?: Record<string, string>
  ): MessageHeaders {
    return {
      messageId: this.generateMessageId(),
      timestamp: Date.now(),
      version: '1.0',
      format: result.format,
      compression: result.compression,
      originalSize: result.originalSize,
      compressedSize: result.compressionRatio ? result.serializedSize : undefined,
      exchange: data.exchange,
      symbol: data.symbol,
      dataType: data.type,
      checksum: this.calculateChecksum(result.data),
      custom
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): SerializationStats {
    this.updateRealTimeStats();
    return { ...this.stats };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.serializationCache.clear();
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
  }

  /**
   * 执行序列化
   */
  private async performSerialization(
    data: MarketData,
    headers: Partial<MessageHeaders> | undefined,
    startTime: number
  ): Promise<SerializationResult> {
    // 准备数据
    const serializedData = await this.serializeData(data, this.config.format);
    const originalSize = serializedData.length;
    
    let finalData = serializedData;
    let compressionTime = 0;
    let compressionRatio: number | undefined;
    
    // 压缩处理
    if (this.shouldCompress(serializedData)) {
      const compressStart = Date.now();
      finalData = await this.compress(serializedData, this.config.compression);
      compressionTime = Date.now() - compressStart;
      compressionRatio = originalSize / finalData.length;
    }
    
    const result: SerializationResult = {
      data: finalData,
      originalSize,
      serializedSize: finalData.length,
      compressionRatio,
      serializationTime: Date.now() - startTime,
      compressionTime: compressionTime > 0 ? compressionTime : undefined,
      format: this.config.format,
      compression: this.config.compression,
      metadata: {
        version: '1.0',
        timestamp: Date.now(),
        checksum: this.calculateChecksum(finalData)
      }
    };
    
    return result;
  }

  /**
   * 批量压缩序列化
   */
  private async serializeBatchWithCompression(
    dataList: MarketData[],
    headersTemplate?: Partial<MessageHeaders>
  ): Promise<SerializationResult[]> {
    // 先序列化所有数据
    const serializedList = await Promise.all(
      dataList.map(data => this.serializeData(data, this.config.format))
    );
    
    // 合并所有数据进行批量压缩
    const combinedData = Buffer.concat(serializedList);
    const compressedData = await this.compress(combinedData, this.config.compression);
    
    // 计算每个消息的压缩后大小（简化分配）
    const totalOriginalSize = serializedList.reduce((sum, buf) => sum + buf.length, 0);
    const compressionRatio = totalOriginalSize / compressedData.length;
    
    // 创建结果
    return serializedList.map((serialized, index) => ({
      data: compressedData.slice(
        Math.floor(index * compressedData.length / serializedList.length),
        Math.floor((index + 1) * compressedData.length / serializedList.length)
      ),
      originalSize: serialized.length,
      serializedSize: Math.floor(serialized.length / compressionRatio),
      compressionRatio,
      serializationTime: 0, // 批量操作中无法精确计算
      compressionTime: 0,
      format: this.config.format,
      compression: this.config.compression,
      metadata: {
        version: '1.0',
        timestamp: Date.now()
      }
    }));
  }

  /**
   * 序列化数据
   */
  private async serializeData(data: MarketData, format: SerializationFormat): Promise<Buffer> {
    switch (format) {
      case SerializationFormat.JSON:
        return Buffer.from(JSON.stringify(data, null, 2));
        
      case SerializationFormat.JSON_COMPACT:
        return Buffer.from(JSON.stringify(data));
        
      case SerializationFormat.MSGPACK:
        // 需要安装 msgpack 库
        // const msgpack = require('msgpack');
        // return Buffer.from(msgpack.encode(data));
        throw new Error('MessagePack format requires msgpack library');
        
      case SerializationFormat.PROTOBUF:
        // 需要 protobuf 定义和库
        throw new Error('Protobuf format requires schema definition');
        
      case SerializationFormat.AVRO:
        // 需要 avro 库和 schema
        throw new Error('Avro format requires schema definition');
        
      default:
        return Buffer.from(JSON.stringify(data));
    }
  }

  /**
   * 反序列化数据
   */
  private async performDeserialization(buffer: Buffer, format: SerializationFormat): Promise<MarketData> {
    switch (format) {
      case SerializationFormat.JSON:
      case SerializationFormat.JSON_COMPACT:
        return JSON.parse(buffer.toString());
        
      case SerializationFormat.MSGPACK:
        // const msgpack = require('msgpack');
        // return msgpack.decode(buffer);
        throw new Error('MessagePack format requires msgpack library');
        
      case SerializationFormat.PROTOBUF:
        throw new Error('Protobuf format requires schema definition');
        
      case SerializationFormat.AVRO:
        throw new Error('Avro format requires schema definition');
        
      default:
        return JSON.parse(buffer.toString());
    }
  }

  /**
   * 压缩数据
   */
  private async compress(data: Buffer, algorithm: CompressionAlgorithm): Promise<Buffer> {
    switch (algorithm) {
      case CompressionAlgorithm.GZIP:
        return await gzip(data, { level: this.config.compressionLevel || 6 });
        
      case CompressionAlgorithm.DEFLATE:
        return await deflate(data, { level: this.config.compressionLevel || 6 });
        
      case CompressionAlgorithm.LZ4:
        // 需要 lz4 库
        throw new Error('LZ4 compression requires lz4 library');
        
      case CompressionAlgorithm.BROTLI:
        // 需要 brotli 库或 Node.js 内置支持
        const brotli = require('zlib').brotliCompress;
        return new Promise((resolve, reject) => {
          brotli(data, (err: Error | null, result: Buffer) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        
      case CompressionAlgorithm.NONE:
      default:
        return data;
    }
  }

  /**
   * 解压缩数据
   */
  private async decompress(data: Buffer, algorithm: CompressionAlgorithm): Promise<Buffer> {
    switch (algorithm) {
      case CompressionAlgorithm.GZIP:
        return await gunzip(data);
        
      case CompressionAlgorithm.DEFLATE:
        return await inflate(data);
        
      case CompressionAlgorithm.LZ4:
        throw new Error('LZ4 decompression requires lz4 library');
        
      case CompressionAlgorithm.BROTLI:
        const brotli = require('zlib').brotliDecompress;
        return new Promise((resolve, reject) => {
          brotli(data, (err: Error | null, result: Buffer) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        
      case CompressionAlgorithm.NONE:
      default:
        return data;
    }
  }

  /**
   * 判断是否应该压缩
   */
  private shouldCompress(data: Buffer): boolean {
    if (this.config.compression === CompressionAlgorithm.NONE) {
      return false;
    }
    
    if (data.length < this.config.compressionThreshold) {
      return false;
    }
    
    // 自适应压缩：根据历史压缩比决定
    if (this.config.adaptiveCompression) {
      const avgRatio = this.stats.averageCompressionRatio;
      // 如果平均压缩比小于 1.2，说明压缩效果不好
      return avgRatio > 1.2;
    }
    
    return true;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(data: MarketData): string {
    // 简化的缓存键生成，实际应用中可能需要更复杂的逻辑
    const key = `${data.exchange}-${data.symbol}-${data.type}-${JSON.stringify(data.data)}`;
    return require('crypto').createHash('md5').update(key).digest('hex');
  }

  /**
   * 缓存序列化结果
   */
  private cacheSerializationResult(key: string, data: Buffer): void {
    if (this.serializationCache.size >= this.config.cacheSize) {
      // 删除最早的缓存项
      const firstKey = this.serializationCache.keys().next().value;
      this.serializationCache.delete(firstKey);
    }
    
    this.serializationCache.set(key, data);
  }

  /**
   * 创建缓存结果
   */
  private createCachedResult(data: Buffer, startTime: number): SerializationResult {
    return {
      data,
      originalSize: data.length,
      serializedSize: data.length,
      serializationTime: Date.now() - startTime,
      format: this.config.format,
      compression: this.config.compression,
      metadata: {
        version: '1.0',
        timestamp: Date.now()
      }
    };
  }

  /**
   * 验证反序列化数据
   */
  private validateDeserializedData(data: MarketData, headers: MessageHeaders): boolean {
    if (!this.config.strictMode) {
      return true;
    }
    
    // 基本字段验证
    if (!data.exchange || !data.symbol || !data.type || !data.timestamp) {
      return false;
    }
    
    // 头部数据一致性验证
    if (data.exchange !== headers.exchange || 
        data.symbol !== headers.symbol || 
        data.type !== headers.dataType) {
      return false;
    }
    
    return true;
  }

  /**
   * 计算校验和
   */
  private calculateChecksum(data: Buffer): string {
    return require('crypto').createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * 验证校验和
   */
  private validateChecksum(data: Buffer, expectedChecksum: string): boolean {
    const actualChecksum = this.calculateChecksum(data);
    return actualChecksum === expectedChecksum;
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 更新序列化统计
   */
  private updateSerializationStats(result: SerializationResult): void {
    this.stats.totalSerialized++;
    
    // 更新平均序列化时间
    this.serializationTimes.push(result.serializationTime);
    if (this.serializationTimes.length > 1000) {
      this.serializationTimes = this.serializationTimes.slice(-1000);
    }
    
    // 更新压缩比
    if (result.compressionRatio) {
      this.compressionRatios.push(result.compressionRatio);
      if (this.compressionRatios.length > 1000) {
        this.compressionRatios = this.compressionRatios.slice(-1000);
      }
    }
    
    // 更新格式统计
    const formatStats = this.stats.formatStats.get(result.format) || {
      count: 0,
      averageSize: 0,
      averageTime: 0
    };
    
    formatStats.count++;
    formatStats.averageSize = (formatStats.averageSize * (formatStats.count - 1) + result.serializedSize) / formatStats.count;
    formatStats.averageTime = (formatStats.averageTime * (formatStats.count - 1) + result.serializationTime) / formatStats.count;
    
    this.stats.formatStats.set(result.format, formatStats);
    
    // 更新压缩统计
    if (result.compressionRatio) {
      const compressionStats = this.stats.compressionStats.get(result.compression) || {
        count: 0,
        averageRatio: 0,
        averageTime: 0
      };
      
      compressionStats.count++;
      compressionStats.averageRatio = (compressionStats.averageRatio * (compressionStats.count - 1) + result.compressionRatio) / compressionStats.count;
      compressionStats.averageTime = (compressionStats.averageTime * (compressionStats.count - 1) + (result.compressionTime || 0)) / compressionStats.count;
      
      this.stats.compressionStats.set(result.compression, compressionStats);
    }
  }

  /**
   * 更新反序列化统计
   */
  private updateDeserializationStats(result: DeserializationResult): void {
    this.stats.totalDeserialized++;
  }

  /**
   * 更新实时统计
   */
  private updateRealTimeStats(): void {
    // 更新平均序列化时间
    if (this.serializationTimes.length > 0) {
      this.stats.averageSerializationTime = 
        this.serializationTimes.reduce((sum, time) => sum + time, 0) / this.serializationTimes.length;
    }
    
    // 更新平均压缩比
    if (this.compressionRatios.length > 0) {
      this.stats.averageCompressionRatio = 
        this.compressionRatios.reduce((sum, ratio) => sum + ratio, 0) / this.compressionRatios.length;
    }
    
    // 更新缓存命中率
    const totalCacheRequests = this.cacheHitCount + this.cacheMissCount;
    this.stats.cacheHitRate = totalCacheRequests > 0 ? this.cacheHitCount / totalCacheRequests : 0;
  }

  /**
   * 初始化对象池
   */
  private initializePools(): void {
    if (this.config.enablePooling) {
      // 初始化 Buffer 池
      for (let i = 0; i < this.config.poolSize; i++) {
        this.bufferPool.push(Buffer.alloc(1024)); // 1KB 初始大小
      }
    }
  }

  /**
   * 从池中获取 Buffer
   */
  private getPooledBuffer(size: number): Buffer {
    if (this.config.enablePooling && this.bufferPool.length > 0) {
      const buffer = this.bufferPool.pop()!;
      if (buffer.length >= size) {
        return buffer.slice(0, size);
      }
    }
    return Buffer.alloc(size);
  }

  /**
   * 将 Buffer 归还到池中
   */
  private returnBufferToPool(buffer: Buffer): void {
    if (this.config.enablePooling && this.bufferPool.length < this.config.poolSize) {
      this.bufferPool.push(buffer);
    }
  }
}

/**
 * 默认序列化配置
 */
export const DEFAULT_SERIALIZATION_CONFIG: SerializationConfig = {
  format: SerializationFormat.JSON_COMPACT,
  compression: CompressionAlgorithm.GZIP,
  compressionLevel: 6,
  enableCaching: true,
  cacheSize: 10000,
  enablePooling: true,
  poolSize: 1000,
  compressionThreshold: 1024, // 1KB
  batchCompression: false,
  adaptiveCompression: true,
  includeMetadata: true,
  timestampPrecision: 'ms',
  numberPrecision: 8,
  enableValidation: true,
  strictMode: false
};