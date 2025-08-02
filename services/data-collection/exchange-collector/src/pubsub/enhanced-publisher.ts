/**
 * 高性能 Google Cloud Pub/Sub 发布者实现
 * Task 4.1: 实现高性能 Google Cloud Pub/Sub 发布者
 * 
 * 功能特性：
 * - 批量发送和压缩
 * - 发送失败重试机制
 * - 背压控制
 * - 高吞吐量优化
 */

import { EventEmitter } from 'events';
import { PubSub, Topic, PublishOptions } from '@google-cloud/pubsub';
import { BaseMonitor, BaseErrorHandler } from '@pixiu/shared-core';
import { MarketData } from '@pixiu/adapter-base';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * 发布者配置
 */
export interface EnhancedPublisherConfig {
  // Google Cloud 配置
  projectId: string;
  keyFilename?: string;
  useEmulator?: boolean;
  emulatorHost?: string;
  
  // 批处理配置
  batchingSettings: {
    maxMessages: number;        // 批次最大消息数 (默认: 1000)
    maxBytes: number;          // 批次最大字节数 (默认: 9MB)
    maxMilliseconds: number;   // 批次最大等待时间 (默认: 100ms)
    maxOutstandingMessages: number; // 最大待发送消息数 (默认: 10000)
    maxOutstandingBytes: number;    // 最大待发送字节数 (默认: 100MB)
  };
  
  // 重试配置
  retrySettings: {
    retryCodes: number[];      // 可重试的错误码
    maxRetries: number;        // 最大重试次数
    initialRetryDelayMillis: number;   // 初始重试延迟
    retryDelayMultiplier: number;      // 重试延迟倍数
    maxRetryDelayMillis: number;       // 最大重试延迟
    totalTimeoutMillis: number;        // 总超时时间
  };
  
  // 背压控制
  flowControlSettings: {
    maxOutstandingMessages: number;    // 最大待处理消息数
    maxOutstandingBytes: number;       // 最大待处理字节数
    allowExcessMessages: boolean;      // 是否允许超量消息
  };
  
  // 压缩配置
  compressionSettings: {
    enabled: boolean;          // 是否启用压缩
    threshold: number;         // 压缩阈值 (字节)
    algorithm: 'gzip';         // 压缩算法
  };
  
  // 性能优化
  optimizationSettings: {
    enableOrderingKey: boolean;        // 是否启用顺序键
    enableMessageDeduplication: boolean; // 是否启用消息去重
    messagePoolSize: number;           // 消息池大小
    connectionPoolSize: number;        // 连接池大小
  };
  
  // Topic 管理
  topicSettings: {
    autoCreateTopics: boolean;         // 是否自动创建 Topic
    topicRetentionHours: number;       // Topic 消息保留时间 (小时)
    topicPartitions: number;           // Topic 分区数
  };
}

/**
 * 发布结果
 */
export interface PublishResult {
  messageId: string;
  publishTime: number;
  retryCount: number;
  compressed: boolean;
  originalSize: number;
  compressedSize?: number;
}

/**
 * 批量发布结果
 */
export interface BatchPublishResult {
  totalMessages: number;
  successCount: number;
  failureCount: number;
  publishTime: number;
  results: PublishResult[];
  errors: Array<{ index: number; error: Error }>;
  compressionRatio?: number;
}

/**
 * 发布指标
 */
export interface PublisherMetrics {
  // 发布统计
  totalPublished: number;
  totalFailed: number;
  totalRetries: number;
  
  // 性能指标
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughputPerSecond: number;
  
  // 批处理指标
  averageBatchSize: number;
  batchUtilization: number;
  
  // 压缩指标
  compressionRatio: number;
  compressedMessages: number;
  
  // 错误指标
  errorRate: number;
  retryRate: number;
  
  // 背压指标
  backpressureEvents: number;
  queueDepth: number;
  queueUtilization: number;
}

/**
 * 待发送消息
 */
interface PendingMessage {
  id: string;
  topic: string;
  data: MarketData;
  attributes: Record<string, string>;
  orderingKey?: string;
  timestamp: number;
  retryCount: number;
  resolve: (result: PublishResult) => void;
  reject: (error: Error) => void;
}

/**
 * 高性能 Google Cloud Pub/Sub 发布者
 */
export class EnhancedPublisher extends EventEmitter {
  private client: PubSub;
  private topics: Map<string, Topic> = new Map();
  private config: EnhancedPublisherConfig;
  private monitor: BaseMonitor;
  private errorHandler: BaseErrorHandler;
  
  // 批处理队列
  private messageQueue: PendingMessage[] = [];
  private batchTimer?: NodeJS.Timeout;
  private isProcessingBatch = false;
  
  // 性能统计
  private metrics: PublisherMetrics = {
    totalPublished: 0,
    totalFailed: 0,
    totalRetries: 0,
    averageLatency: 0,
    p95Latency: 0,
    p99Latency: 0,
    throughputPerSecond: 0,
    averageBatchSize: 0,
    batchUtilization: 0,
    compressionRatio: 1.0,
    compressedMessages: 0,
    errorRate: 0,
    retryRate: 0,
    backpressureEvents: 0,
    queueDepth: 0,
    queueUtilization: 0
  };
  
  // 性能追踪
  private latencyHistory: number[] = [];
  private lastThroughputUpdate = Date.now();
  private messagesSinceLastUpdate = 0;
  
  // 消息池
  private messagePool: PendingMessage[] = [];
  
  constructor(
    config: EnhancedPublisherConfig,
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ) {
    super();
    this.config = config;
    this.monitor = monitor;
    this.errorHandler = errorHandler;
    this.initializeClient();
    this.startMetricsCollection();
  }

  /**
   * 发布单个消息
   */
  async publishMessage(
    topic: string,
    data: MarketData,
    options: {
      attributes?: Record<string, string>;
      orderingKey?: string;
      skipBatching?: boolean;
    } = {}
  ): Promise<PublishResult> {
    return new Promise((resolve, reject) => {
      const messageId = this.generateMessageId();
      const message = this.createPendingMessage(
        messageId,
        topic,
        data,
        options.attributes || {},
        options.orderingKey,
        resolve,
        reject
      );

      // 如果跳过批处理或队列已满，直接发送
      if (options.skipBatching || this.shouldBypassBatching()) {
        this.publishSingleMessage(message);
        return;
      }

      // 加入批处理队列
      this.addToBatch(message);
    });
  }

  /**
   * 批量发布消息
   */
  async publishBatch(
    topic: string,
    messages: Array<{
      data: MarketData;
      attributes?: Record<string, string>;
      orderingKey?: string;
    }>
  ): Promise<BatchPublishResult> {
    const startTime = Date.now();
    const results: PublishResult[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    try {
      // 确保 Topic 存在
      await this.ensureTopicExists(topic);
      const topicClient = this.getTopicClient(topic);

      // 准备消息
      const publishMessages = await Promise.all(
        messages.map(async (msg, index) => {
          try {
            const serializedData = JSON.stringify(msg.data);
            let messageData = Buffer.from(serializedData);
            let compressed = false;
            let originalSize = messageData.length;
            let compressedSize = originalSize;

            // 压缩处理
            if (this.shouldCompress(messageData)) {
              messageData = await gzip(messageData);
              compressed = true;
              compressedSize = messageData.length;
              
              if (!msg.attributes) {
                msg.attributes = {};
              }
              msg.attributes.compressed = 'gzip';
            }

            return {
              data: messageData,
              attributes: {
                ...msg.attributes,
                timestamp: Date.now().toString(),
                messageId: this.generateMessageId()
              },
              orderingKey: msg.orderingKey,
              metadata: {
                index,
                compressed,
                originalSize,
                compressedSize
              }
            };
          } catch (error) {
            errors.push({ index, error: error as Error });
            return null;
          }
        })
      );

      // 过滤失败的消息
      const validMessages = publishMessages.filter(msg => msg !== null);
      
      if (validMessages.length === 0) {
        throw new Error('No valid messages to publish');
      }

      // 发布消息
      const publishPromises = validMessages.map(async (msg) => {
        try {
          const [messageId] = await topicClient.publishMessage({
            data: msg!.data,
            attributes: msg!.attributes,
            orderingKey: msg!.orderingKey
          });

          const result: PublishResult = {
            messageId,
            publishTime: Date.now() - startTime,
            retryCount: 0,
            compressed: msg!.metadata.compressed,
            originalSize: msg!.metadata.originalSize,
            compressedSize: msg!.metadata.compressedSize
          };

          results.push(result);
          return result;
        } catch (error) {
          errors.push({ index: msg!.metadata.index, error: error as Error });
          throw error;
        }
      });

      await Promise.allSettled(publishPromises);
      
      const batchResult: BatchPublishResult = {
        totalMessages: messages.length,
        successCount: results.length,
        failureCount: errors.length,
        publishTime: Date.now() - startTime,
        results,
        errors
      };

      // 计算压缩比
      if (results.some(r => r.compressed)) {
        const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
        const totalCompressed = results.reduce((sum, r) => sum + (r.compressedSize || r.originalSize), 0);
        batchResult.compressionRatio = totalOriginal / totalCompressed;
      }

      // 更新指标
      this.updateBatchMetrics(batchResult);

      this.emit('batchPublished', batchResult);
      return batchResult;

    } catch (error) {
      this.monitor.log('error', 'Batch publish failed', { 
        topic, 
        messageCount: messages.length,
        error 
      });
      throw error;
    }
  }

  /**
   * 获取发布指标
   */
  getMetrics(): PublisherMetrics {
    this.updateRealTimeMetrics();
    return { ...this.metrics };
  }

  /**
   * 获取 Topic 统计信息
   */
  async getTopicStats(topicName: string): Promise<{
    exists: boolean;
    messageCount?: number;
    subscriptionCount?: number;
    retentionHours?: number;
  }> {
    try {
      const topic = this.getTopicClient(topicName);
      const [exists] = await topic.exists();
      
      if (!exists) {
        return { exists: false };
      }

      // 获取 Topic 元数据
      const [metadata] = await topic.getMetadata();
      
      return {
        exists: true,
        retentionHours: metadata.messageRetentionDuration ? 
          parseInt(metadata.messageRetentionDuration.seconds) / 3600 : undefined
      };
    } catch (error) {
      this.monitor.log('error', 'Failed to get topic stats', { topic: topicName, error });
      return { exists: false };
    }
  }

  /**
   * 刷新待处理的消息
   */
  async flush(): Promise<void> {
    if (this.messageQueue.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * 关闭发布者
   */
  async close(): Promise<void> {
    // 刷新待处理消息
    await this.flush();
    
    // 清理定时器
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // 关闭客户端
    await this.client.close();
    
    this.emit('publisherClosed');
  }

  /**
   * 初始化客户端
   */
  private initializeClient(): void {
    const clientOptions: any = {
      projectId: this.config.projectId
    };

    // 配置模拟器
    if (this.config.useEmulator && this.config.emulatorHost) {
      process.env.PUBSUB_EMULATOR_HOST = this.config.emulatorHost;
    }

    // 配置认证
    if (this.config.keyFilename) {
      clientOptions.keyFilename = this.config.keyFilename;
    }

    this.client = new PubSub(clientOptions);
  }

  /**
   * 确保 Topic 存在
   */
  private async ensureTopicExists(topicName: string): Promise<void> {
    if (!this.config.topicSettings.autoCreateTopics) {
      return;
    }

    try {
      const topic = this.client.topic(topicName);
      const [exists] = await topic.exists();
      
      if (!exists) {
        await this.client.createTopic(topicName);
        this.monitor.log('info', 'Topic created', { topic: topicName });
      }
    } catch (error: any) {
      if (error.code === 6) { // Already exists
        return;
      }
      throw error;
    }
  }

  /**
   * 获取 Topic 客户端
   */
  private getTopicClient(topicName: string): Topic {
    if (!this.topics.has(topicName)) {
      const topic = this.client.topic(topicName, {
        batching: {
          maxMessages: this.config.batchingSettings.maxMessages,
          maxBytes: this.config.batchingSettings.maxBytes,
          maxMilliseconds: this.config.batchingSettings.maxMilliseconds
        },
        gaxOpts: {
          retry: {
            retryCodes: this.config.retrySettings.retryCodes,
            backoffSettings: {
              initialRetryDelayMillis: this.config.retrySettings.initialRetryDelayMillis,
              retryDelayMultiplier: this.config.retrySettings.retryDelayMultiplier,
              maxRetryDelayMillis: this.config.retrySettings.maxRetryDelayMillis,
              totalTimeoutMillis: this.config.retrySettings.totalTimeoutMillis
            }
          }
        }
      });
      this.topics.set(topicName, topic);
    }
    return this.topics.get(topicName)!;
  }

  /**
   * 创建待发送消息
   */
  private createPendingMessage(
    id: string,
    topic: string,
    data: MarketData,
    attributes: Record<string, string>,
    orderingKey: string | undefined,
    resolve: (result: PublishResult) => void,
    reject: (error: Error) => void
  ): PendingMessage {
    // 从消息池获取或创建新消息
    const message = this.messagePool.pop() || {} as PendingMessage;
    
    message.id = id;
    message.topic = topic;
    message.data = data;
    message.attributes = attributes;
    message.orderingKey = orderingKey;
    message.timestamp = Date.now();
    message.retryCount = 0;
    message.resolve = resolve;
    message.reject = reject;
    
    return message;
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 判断是否应该绕过批处理
   */
  private shouldBypassBatching(): boolean {
    // 队列已满
    if (this.messageQueue.length >= this.config.batchingSettings.maxMessages) {
      this.metrics.backpressureEvents++;
      return true;
    }

    // 背压控制
    if (this.isBackpressureActive()) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否处于背压状态
   */
  private isBackpressureActive(): boolean {
    const queueBytes = this.estimateQueueSize();
    const utilization = this.messageQueue.length / this.config.flowControlSettings.maxOutstandingMessages;
    
    return (
      this.messageQueue.length >= this.config.flowControlSettings.maxOutstandingMessages ||
      queueBytes >= this.config.flowControlSettings.maxOutstandingBytes ||
      (utilization > 0.8 && !this.config.flowControlSettings.allowExcessMessages)
    );
  }

  /**
   * 估算队列大小
   */
  private estimateQueueSize(): number {
    return this.messageQueue.reduce((total, msg) => {
      return total + JSON.stringify(msg.data).length;
    }, 0);
  }

  /**
   * 添加到批处理队列
   */
  private addToBatch(message: PendingMessage): void {
    this.messageQueue.push(message);
    
    // 更新队列指标
    this.metrics.queueDepth = this.messageQueue.length;
    this.metrics.queueUtilization = this.messageQueue.length / this.config.batchingSettings.maxMessages;

    // 如果队列满了，立即处理
    if (this.messageQueue.length >= this.config.batchingSettings.maxMessages) {
      this.processBatch();
      return;
    }

    // 设置批处理定时器
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.config.batchingSettings.maxMilliseconds);
    }
  }

  /**
   * 处理批处理队列
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessingBatch || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingBatch = true;
    
    // 清理定时器
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    const batch = this.messageQueue.splice(0, this.config.batchingSettings.maxMessages);
    const batchStartTime = Date.now();

    try {
      // 按 Topic 分组
      const topicGroups = new Map<string, PendingMessage[]>();
      for (const message of batch) {
        if (!topicGroups.has(message.topic)) {
          topicGroups.set(message.topic, []);
        }
        topicGroups.get(message.topic)!.push(message);
      }

      // 并发发布到不同 Topic
      const publishPromises = Array.from(topicGroups.entries()).map(
        ([topic, messages]) => this.publishTopicBatch(topic, messages)
      );

      await Promise.all(publishPromises);

      // 更新批处理指标
      const batchTime = Date.now() - batchStartTime;
      this.updateBatchProcessingMetrics(batch.length, batchTime);

    } catch (error) {
      this.monitor.log('error', 'Batch processing failed', { 
        batchSize: batch.length, 
        error 
      });
      
      // 重试或失败处理
      this.handleBatchFailure(batch, error as Error);
    } finally {
      this.isProcessingBatch = false;
      
      // 如果还有消息，继续处理
      if (this.messageQueue.length > 0) {
        setImmediate(() => this.processBatch());
      }
    }
  }

  /**
   * 发布单个 Topic 的批次
   */
  private async publishTopicBatch(topic: string, messages: PendingMessage[]): Promise<void> {
    await this.ensureTopicExists(topic);
    const topicClient = this.getTopicClient(topic);

    const publishPromises = messages.map(async (message) => {
      try {
        const result = await this.publishSingleMessageToTopic(topicClient, message);
        message.resolve(result);
        this.returnMessageToPool(message);
      } catch (error) {
        await this.handleMessageFailure(message, error as Error);
      }
    });

    await Promise.allSettled(publishPromises);
  }

  /**
   * 发布单个消息到 Topic
   */
  private async publishSingleMessageToTopic(
    topicClient: Topic, 
    message: PendingMessage
  ): Promise<PublishResult> {
    const startTime = Date.now();
    
    try {
      let messageData = Buffer.from(JSON.stringify(message.data));
      let compressed = false;
      let originalSize = messageData.length;
      let compressedSize = originalSize;

      // 压缩处理
      if (this.shouldCompress(messageData)) {
        messageData = await gzip(messageData);
        compressed = true;
        compressedSize = messageData.length;
        message.attributes.compressed = 'gzip';
      }

      // 添加元数据
      message.attributes.timestamp = message.timestamp.toString();
      message.attributes.messageId = message.id;

      const publishOptions: any = {
        data: messageData,
        attributes: message.attributes
      };

      if (message.orderingKey && this.config.optimizationSettings.enableOrderingKey) {
        publishOptions.orderingKey = message.orderingKey;
      }

      const [messageId] = await topicClient.publishMessage(publishOptions);

      const result: PublishResult = {
        messageId,
        publishTime: Date.now() - startTime,
        retryCount: message.retryCount,
        compressed,
        originalSize,
        compressedSize: compressed ? compressedSize : undefined
      };

      // 更新统计
      this.updatePublishMetrics(result);

      return result;
    } catch (error) {
      this.metrics.totalFailed++;
      throw error;
    }
  }

  /**
   * 发布单个消息（绕过批处理）
   */
  private async publishSingleMessage(message: PendingMessage): Promise<void> {
    try {
      await this.ensureTopicExists(message.topic);
      const topicClient = this.getTopicClient(message.topic);
      const result = await this.publishSingleMessageToTopic(topicClient, message);
      message.resolve(result);
    } catch (error) {
      await this.handleMessageFailure(message, error as Error);
    } finally {
      this.returnMessageToPool(message);
    }
  }

  /**
   * 处理消息发送失败
   */
  private async handleMessageFailure(message: PendingMessage, error: Error): Promise<void> {
    message.retryCount++;
    this.metrics.totalRetries++;

    // 判断是否应该重试
    if (this.shouldRetry(message, error)) {
      // 延迟重试
      const delay = this.calculateRetryDelay(message.retryCount);
      setTimeout(() => {
        this.addToBatch(message);
      }, delay);
      
      this.monitor.log('warn', 'Message retry scheduled', {
        messageId: message.id,
        retryCount: message.retryCount,
        delay
      });
    } else {
      // 重试次数耗尽，返回失败
      message.reject(error);
      this.returnMessageToPool(message);
      
      this.monitor.log('error', 'Message publish failed permanently', {
        messageId: message.id,
        retryCount: message.retryCount,
        error
      });
    }
  }

  /**
   * 处理批次失败
   */
  private handleBatchFailure(batch: PendingMessage[], error: Error): void {
    for (const message of batch) {
      this.handleMessageFailure(message, error);
    }
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(message: PendingMessage, error: Error): boolean {
    if (message.retryCount >= this.config.retrySettings.maxRetries) {
      return false;
    }

    // 检查错误码是否可重试
    const errorCode = (error as any).code;
    return this.config.retrySettings.retryCodes.includes(errorCode);
  }

  /**
   * 计算重试延迟
   */
  private calculateRetryDelay(retryCount: number): number {
    const delay = this.config.retrySettings.initialRetryDelayMillis * 
      Math.pow(this.config.retrySettings.retryDelayMultiplier, retryCount - 1);
    return Math.min(delay, this.config.retrySettings.maxRetryDelayMillis);
  }

  /**
   * 判断是否应该压缩
   */
  private shouldCompress(data: Buffer): boolean {
    return this.config.compressionSettings.enabled && 
           data.length >= this.config.compressionSettings.threshold;
  }

  /**
   * 更新发布指标
   */
  private updatePublishMetrics(result: PublishResult): void {
    this.metrics.totalPublished++;
    this.messagesSinceLastUpdate++;

    // 更新延迟统计
    this.latencyHistory.push(result.publishTime);
    if (this.latencyHistory.length > 1000) {
      this.latencyHistory = this.latencyHistory.slice(-1000);
    }

    // 更新压缩统计
    if (result.compressed) {
      this.metrics.compressedMessages++;
      if (result.compressedSize) {
        const ratio = result.originalSize / result.compressedSize;
        this.metrics.compressionRatio = 
          (this.metrics.compressionRatio * (this.metrics.compressedMessages - 1) + ratio) / 
          this.metrics.compressedMessages;
      }
    }
  }

  /**
   * 更新批处理指标
   */
  private updateBatchMetrics(result: BatchPublishResult): void {
    const totalBatches = Math.ceil(this.metrics.totalPublished / this.metrics.averageBatchSize) || 1;
    this.metrics.averageBatchSize = 
      (this.metrics.averageBatchSize * (totalBatches - 1) + result.successCount) / totalBatches;
    
    this.metrics.batchUtilization = 
      result.successCount / this.config.batchingSettings.maxMessages;

    if (result.compressionRatio) {
      this.metrics.compressionRatio = 
        (this.metrics.compressionRatio + result.compressionRatio) / 2;
    }
  }

  /**
   * 更新批处理过程指标
   */
  private updateBatchProcessingMetrics(batchSize: number, processingTime: number): void {
    const totalBatches = Math.ceil(this.metrics.totalPublished / this.metrics.averageBatchSize) || 1;
    this.metrics.averageBatchSize = 
      (this.metrics.averageBatchSize * (totalBatches - 1) + batchSize) / totalBatches;
  }

  /**
   * 更新实时指标
   */
  private updateRealTimeMetrics(): void {
    const now = Date.now();
    const timeDiff = now - this.lastThroughputUpdate;
    
    // 更新吞吐量（每秒）
    if (timeDiff >= 1000) {
      this.metrics.throughputPerSecond = 
        (this.messagesSinceLastUpdate * 1000) / timeDiff;
      this.messagesSinceLastUpdate = 0;
      this.lastThroughputUpdate = now;
    }

    // 更新延迟百分位数
    if (this.latencyHistory.length > 0) {
      const sorted = [...this.latencyHistory].sort((a, b) => a - b);
      this.metrics.averageLatency = 
        sorted.reduce((sum, lat) => sum + lat, 0) / sorted.length;
      this.metrics.p95Latency = sorted[Math.floor(sorted.length * 0.95)];
      this.metrics.p99Latency = sorted[Math.floor(sorted.length * 0.99)];
    }

    // 更新错误率
    const total = this.metrics.totalPublished + this.metrics.totalFailed;
    this.metrics.errorRate = total > 0 ? this.metrics.totalFailed / total : 0;
    this.metrics.retryRate = total > 0 ? this.metrics.totalRetries / total : 0;

    // 更新队列指标
    this.metrics.queueDepth = this.messageQueue.length;
    this.metrics.queueUtilization = 
      this.messageQueue.length / this.config.batchingSettings.maxMessages;
  }

  /**
   * 将消息归还到对象池
   */
  private returnMessageToPool(message: PendingMessage): void {
    if (this.messagePool.length < this.config.optimizationSettings.messagePoolSize) {
      // 清理消息数据
      message.data = {} as MarketData;
      message.attributes = {};
      message.resolve = () => {};
      message.reject = () => {};
      
      this.messagePool.push(message);
    }
  }

  /**
   * 开始指标收集
   */
  private startMetricsCollection(): void {
    // 每30秒更新一次指标
    setInterval(() => {
      this.updateRealTimeMetrics();
      this.emit('metricsUpdated', this.getMetrics());
    }, 30000);
  }
}

/**
 * 默认配置
 */
export const DEFAULT_PUBLISHER_CONFIG: Partial<EnhancedPublisherConfig> = {
  batchingSettings: {
    maxMessages: 1000,
    maxBytes: 9 * 1024 * 1024, // 9MB
    maxMilliseconds: 100,
    maxOutstandingMessages: 10000,
    maxOutstandingBytes: 100 * 1024 * 1024 // 100MB
  },
  retrySettings: {
    retryCodes: [10, 13, 14], // ABORTED, INTERNAL, UNAVAILABLE
    maxRetries: 3,
    initialRetryDelayMillis: 100,
    retryDelayMultiplier: 2.0,
    maxRetryDelayMillis: 60000,
    totalTimeoutMillis: 600000
  },
  flowControlSettings: {
    maxOutstandingMessages: 10000,
    maxOutstandingBytes: 100 * 1024 * 1024,
    allowExcessMessages: false
  },
  compressionSettings: {
    enabled: true,
    threshold: 1024, // 1KB
    algorithm: 'gzip'
  },
  optimizationSettings: {
    enableOrderingKey: true,
    enableMessageDeduplication: false,
    messagePoolSize: 1000,
    connectionPoolSize: 10
  },
  topicSettings: {
    autoCreateTopics: true,
    topicRetentionHours: 168, // 7 days
    topicPartitions: 1
  }
};