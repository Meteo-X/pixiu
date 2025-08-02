/**
 * 数据缓冲阶段实现
 * 提供高性能的数据缓冲和批处理功能
 */

import { BasePipelineStage } from '../core/pipeline-stage';
import {
  PipelineStageType,
  PipelineData,
  PipelineContext,
  StageConfig,
  BufferPolicy
} from '../core/data-pipeline';

/**
 * 缓冲阶段配置
 */
export interface BufferStageConfig extends StageConfig {
  bufferPolicy: BufferPolicy;
  partitionBy?: 'exchange' | 'symbol' | 'dataType' | 'custom';
  partitionFunction?: (data: PipelineData) => string;
  flushCallback?: (data: PipelineData[]) => Promise<void>;
  enableBackpressure: boolean;
  backpressureStrategy: 'DROP' | 'BLOCK' | 'SPILL';
  spillPath?: string;
  enableCompression: boolean;
  compressionAlgorithm?: 'gzip' | 'deflate' | 'br';
}

/**
 * 缓冲区状态
 */
export interface BufferState {
  size: number;
  maxSize: number;
  oldestTimestamp: number;
  newestTimestamp: number;
  partitionCount: number;
  memoryUsage: number;
  isBackpressured: boolean;
}

/**
 * 分区缓冲区
 */
class PartitionBuffer {
  private buffer: PipelineData[] = [];
  private lastFlush = Date.now();
  private memoryUsage = 0;

  constructor(private partition: string, private policy: BufferPolicy) {}

  add(data: PipelineData): boolean {
    if (this.buffer.length >= this.policy.maxSize) {
      return false; // 缓冲区已满
    }

    this.buffer.push(data);
    this.memoryUsage += this.estimateSize(data);
    return true;
  }

  shouldFlush(): boolean {
    const now = Date.now();
    const sizeThreshold = this.buffer.length >= this.policy.maxSize;
    const timeThreshold = (now - this.lastFlush) >= this.policy.flushInterval;
    const ageThreshold = this.buffer.length > 0 && 
      (now - this.buffer[0].timestamp) >= this.policy.maxAge;

    return sizeThreshold || timeThreshold || ageThreshold;
  }

  flush(): PipelineData[] {
    const data = [...this.buffer];
    this.buffer.length = 0;
    this.lastFlush = Date.now();
    this.memoryUsage = 0;
    return data;
  }

  getState(): {
    partition: string;
    size: number;
    memoryUsage: number;
    oldestTimestamp: number;
    newestTimestamp: number;
  } {
    return {
      partition: this.partition,
      size: this.buffer.length,
      memoryUsage: this.memoryUsage,
      oldestTimestamp: this.buffer.length > 0 ? this.buffer[0].timestamp : 0,
      newestTimestamp: this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].timestamp : 0
    };
  }

  clear(): void {
    this.buffer.length = 0;
    this.memoryUsage = 0;
  }

  size(): number {
    return this.buffer.length;
  }

  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  private estimateSize(data: PipelineData): number {
    // 估算数据大小（简化版本）
    return JSON.stringify(data).length * 2; // 假设Unicode字符平均2字节
  }
}

/**
 * 缓冲阶段实现
 */
export class BufferStage extends BasePipelineStage {
  private bufferConfig: BufferStageConfig;
  private partitions = new Map<string, PartitionBuffer>();
  private flushTimer?: NodeJS.Timeout;
  private backpressureActive = false;
  private totalMemoryUsage = 0;
  private flushInProgress = false;

  constructor(config: BufferStageConfig) {
    super(config.name || 'buffer', PipelineStageType.BUFFER, config);
    this.bufferConfig = config;
  }

  protected async doInitialize(config: StageConfig): Promise<void> {
    this.bufferConfig = config as BufferStageConfig;
    
    // 启动定时刷新
    this.startFlushTimer();
    
    this.emit('bufferInitialized', {
      partitionBy: this.bufferConfig.partitionBy,
      bufferPolicy: this.bufferConfig.bufferPolicy
    });
  }

  protected async doProcess(data: PipelineData, context: PipelineContext): Promise<PipelineData | null> {
    // 检查背压
    if (this.shouldApplyBackpressure()) {
      return this.handleBackpressure(data, context);
    }

    // 确定分区
    const partitionKey = this.getPartitionKey(data);
    let partition = this.partitions.get(partitionKey);

    if (!partition) {
      partition = new PartitionBuffer(partitionKey, this.bufferConfig.bufferPolicy);
      this.partitions.set(partitionKey, partition);
    }

    // 添加到缓冲区
    const added = partition.add(data);
    if (!added) {
      // 缓冲区已满，触发刷新
      await this.flushPartition(partitionKey);
      // 重试添加
      partition.add(data);
    }

    this.updateMemoryUsage();

    // 检查是否需要刷新
    if (partition.shouldFlush()) {
      setImmediate(() => this.flushPartition(partitionKey));
    }

    this.emit('dataBuffered', {
      partitionKey,
      bufferSize: partition.size(),
      totalPartitions: this.partitions.size
    });

    // 缓冲阶段通常返回null，因为数据将通过批处理异步发送
    return null;
  }

  protected async doDestroy(): Promise<void> {
    // 停止定时器
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // 刷新所有缓冲区
    await this.flushAllPartitions();

    // 清理分区
    this.partitions.clear();
    this.totalMemoryUsage = 0;
  }

  /**
   * 获取缓冲区状态
   */
  getBufferState(): BufferState {
    let totalSize = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;

    for (const partition of this.partitions.values()) {
      const state = partition.getState();
      totalSize += state.size;
      if (state.oldestTimestamp > 0 && state.oldestTimestamp < oldestTimestamp) {
        oldestTimestamp = state.oldestTimestamp;
      }
      if (state.newestTimestamp > newestTimestamp) {
        newestTimestamp = state.newestTimestamp;
      }
    }

    return {
      size: totalSize,
      maxSize: this.bufferConfig.bufferPolicy.maxSize * this.partitions.size,
      oldestTimestamp,
      newestTimestamp,
      partitionCount: this.partitions.size,
      memoryUsage: this.totalMemoryUsage,
      isBackpressured: this.backpressureActive
    };
  }

  /**
   * 手动刷新所有缓冲区
   */
  async flushAllPartitions(): Promise<void> {
    if (this.flushInProgress) {
      return;
    }

    this.flushInProgress = true;
    try {
      const flushPromises: Promise<void>[] = [];
      
      for (const partitionKey of this.partitions.keys()) {
        flushPromises.push(this.flushPartition(partitionKey));
      }

      await Promise.all(flushPromises);
    } finally {
      this.flushInProgress = false;
    }
  }

  /**
   * 手动刷新指定分区
   */
  async flushPartition(partitionKey: string): Promise<void> {
    const partition = this.partitions.get(partitionKey);
    if (!partition || partition.isEmpty()) {
      return;
    }

    try {
      const data = partition.flush();
      
      if (this.bufferConfig.flushCallback) {
        await this.bufferConfig.flushCallback(data);
      }

      this.emit('partitionFlushed', {
        partitionKey,
        dataCount: data.length,
        totalPartitions: this.partitions.size
      });

      this.updateMemoryUsage();
    } catch (error) {
      this.emit('flushError', error, partitionKey);
      throw error;
    }
  }

  /**
   * 清空指定分区
   */
  clearPartition(partitionKey: string): void {
    const partition = this.partitions.get(partitionKey);
    if (partition) {
      partition.clear();
      this.updateMemoryUsage();
      this.emit('partitionCleared', partitionKey);
    }
  }

  /**
   * 清空所有分区
   */
  clearAllPartitions(): void {
    for (const partition of this.partitions.values()) {
      partition.clear();
    }
    this.totalMemoryUsage = 0;
    this.emit('allPartitionsCleared');
  }

  /**
   * 获取分区键
   */
  private getPartitionKey(data: PipelineData): string {
    if (this.bufferConfig.partitionFunction) {
      return this.bufferConfig.partitionFunction(data);
    }

    switch (this.bufferConfig.partitionBy) {
      case 'exchange':
        return data.metadata.exchange;
      case 'symbol':
        return `${data.metadata.exchange}:${data.metadata.symbol}`;
      case 'dataType':
        return `${data.metadata.exchange}:${data.metadata.dataType}`;
      default:
        return 'default';
    }
  }

  /**
   * 检查是否应该应用背压
   */
  private shouldApplyBackpressure(): boolean {
    if (!this.bufferConfig.enableBackpressure) {
      return false;
    }

    const threshold = this.bufferConfig.bufferPolicy.backpressureThreshold;
    const totalSize = Array.from(this.partitions.values())
      .reduce((sum, partition) => sum + partition.size(), 0);
    
    const maxTotalSize = this.bufferConfig.bufferPolicy.maxSize * this.partitions.size;
    const usage = maxTotalSize > 0 ? totalSize / maxTotalSize : 0;

    this.backpressureActive = usage >= threshold;
    return this.backpressureActive;
  }

  /**
   * 处理背压
   */
  private async handleBackpressure(
    data: PipelineData, 
    context: PipelineContext
  ): Promise<PipelineData | null> {
    switch (this.bufferConfig.backpressureStrategy) {
      case 'DROP':
        this.emit('dataDropped', data, 'backpressure');
        return null;
        
      case 'BLOCK':
        // 等待直到有空间
        while (this.shouldApplyBackpressure()) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return this.doProcess(data, context);
        
      case 'SPILL':
        await this.spillToDisk(data);
        return null;
        
      default:
        throw new Error(`Unknown backpressure strategy: ${this.bufferConfig.backpressureStrategy}`);
    }
  }

  /**
   * 溢写到磁盘（简化实现）
   */
  private async spillToDisk(data: PipelineData): Promise<void> {
    // 简化实现，实际应该写入磁盘文件
    this.emit('dataSpilled', data);
  }

  /**
   * 启动刷新定时器
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(async () => {
      try {
        const partitionsToFlush: string[] = [];
        
        for (const [partitionKey, partition] of this.partitions) {
          if (partition.shouldFlush()) {
            partitionsToFlush.push(partitionKey);
          }
        }

        for (const partitionKey of partitionsToFlush) {
          await this.flushPartition(partitionKey);
        }
      } catch (error) {
        this.emit('timerFlushError', error);
      }
    }, Math.min(this.bufferConfig.bufferPolicy.flushInterval, 1000));
  }

  /**
   * 更新内存使用量
   */
  private updateMemoryUsage(): void {
    this.totalMemoryUsage = Array.from(this.partitions.values())
      .reduce((sum, partition) => sum + partition.getState().memoryUsage, 0);
  }
}