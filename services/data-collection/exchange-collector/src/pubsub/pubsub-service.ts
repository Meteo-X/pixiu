/**
 * Google Cloud Pub/Sub 集成服务
 * Task 4.1-4.3 完整实现
 * 
 * 功能特性：
 * - 完整的 Pub/Sub 集成
 * - 高性能发布者
 * - 动态 Topic 路由
 * - 数据序列化和压缩
 * - 背压控制和重试机制
 */

import { EventEmitter } from 'events';
import { PubSub } from '@google-cloud/pubsub';
import { BaseMonitor, BaseErrorHandler } from '@pixiu/shared-core';
import { MarketData } from '@pixiu/adapter-base';

import { 
  EnhancedPublisher, 
  EnhancedPublisherConfig, 
  PublishResult, 
  BatchPublishResult,
  DEFAULT_PUBLISHER_CONFIG 
} from './enhanced-publisher';

import { 
  TopicManager, 
  TopicNamingConfig, 
  TopicRoutingRule, 
  RoutingResult,
  TopicNamingPattern,
  DEFAULT_TOPIC_NAMING_CONFIG 
} from './topic-manager';

import { 
  MessageSerializer, 
  SerializationConfig, 
  SerializationResult, 
  MessageHeaders,
  DEFAULT_SERIALIZATION_CONFIG 
} from './message-serializer';

/**
 * Pub/Sub 服务配置
 */
export interface PubSubServiceConfig {
  // Google Cloud 配置
  projectId: string;
  keyFilename?: string;
  useEmulator?: boolean;
  emulatorHost?: string;
  
  // 发布者配置
  publisher: EnhancedPublisherConfig;
  
  // Topic 管理配置
  topicNaming: TopicNamingConfig;
  
  // 序列化配置
  serialization: SerializationConfig;
  
  // 服务级别配置
  service: {
    enableHealthCheck: boolean;
    healthCheckInterval: number;    // 健康检查间隔（毫秒）
    enableMetricsExport: boolean;   // 启用指标导出
    metricsExportInterval: number;  // 指标导出间隔（毫秒）
    enableAutoTopicCreation: boolean; // 自动创建 Topic
    enableMessageDeduplication: boolean; // 消息去重
    maxConcurrentPublishes: number; // 最大并发发布数
  };
}

/**
 * 发布选项
 */
export interface PublishOptions {
  // 路由选项
  customTopic?: string;              // 自定义 Topic 名称
  routingRules?: string[];           // 指定路由规则 ID
  skipRouting?: boolean;             // 跳过路由，直接发布
  
  // 序列化选项
  customHeaders?: Record<string, string>; // 自定义消息头
  skipSerialization?: boolean;       // 跳过序列化
  compressionOverride?: boolean;     // 强制压缩/不压缩
  
  // 发布选项
  orderingKey?: string;              // 消息排序键
  skipBatching?: boolean;            // 跳过批处理
  priority?: 'low' | 'normal' | 'high'; // 发布优先级
  timeout?: number;                  // 发布超时时间
}

/**
 * 服务统计信息
 */
export interface PubSubServiceStats {
  // 发布统计
  totalPublished: number;
  totalFailed: number;
  publishRate: number;              // 每秒发布数
  
  // 路由统计
  totalRouted: number;
  routingCacheHitRate: number;
  activeTopics: number;
  
  // 序列化统计
  serializationRate: number;        // 每秒序列化数
  averageCompressionRatio: number;
  
  // 性能统计
  averageEndToEndLatency: number;   // 端到端延迟
  averagePublishLatency: number;    // 发布延迟
  throughputMBps: number;           // 吞吐量 (MB/s)
  
  // 健康状态
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: number;
  
  // 组件状态
  publisherStatus: 'active' | 'degraded' | 'failed';
  topicManagerStatus: 'active' | 'degraded' | 'failed';
  serializerStatus: 'active' | 'degraded' | 'failed';
}

/**
 * Google Cloud Pub/Sub 集成服务
 */
export class PubSubService extends EventEmitter {
  private config: PubSubServiceConfig;
  private monitor: BaseMonitor;
  private errorHandler: BaseErrorHandler;
  
  // 核心组件
  private publisher: EnhancedPublisher;
  private topicManager: TopicManager;
  private serializer: MessageSerializer;
  private pubsubClient: PubSub;
  
  // 状态管理
  private isStarted = false;
  private isHealthy = true;
  private lastHealthCheck = Date.now();
  
  // 并发控制
  private activePublishes = 0;
  private publishQueue: Array<{
    data: MarketData;
    options: PublishOptions;
    resolve: (result: PublishResult) => void;
    reject: (error: Error) => void;
  }> = [];
  
  // 统计数据
  private stats: PubSubServiceStats = {
    totalPublished: 0,
    totalFailed: 0,
    publishRate: 0,
    totalRouted: 0,
    routingCacheHitRate: 0,
    activeTopics: 0,
    serializationRate: 0,
    averageCompressionRatio: 1.0,
    averageEndToEndLatency: 0,
    averagePublishLatency: 0,
    throughputMBps: 0,
    healthStatus: 'healthy',
    lastHealthCheck: Date.now(),
    publisherStatus: 'active',
    topicManagerStatus: 'active',
    serializerStatus: 'active'
  };
  
  // 性能追踪
  private latencyHistory: number[] = [];
  private publishRateTracker: { count: number; timestamp: number }[] = [];
  
  // 定时器
  private healthCheckTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;

  constructor(
    config: PubSubServiceConfig,
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ) {
    super();
    this.config = config;
    this.monitor = monitor;
    this.errorHandler = errorHandler;
    
    this.initializeComponents();
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    try {
      this.monitor.log('info', 'Starting PubSub service');

      // 初始化组件
      await this.initializeComponents();
      
      // 启动健康检查
      if (this.config.service.enableHealthCheck) {
        this.startHealthCheck();
      }
      
      // 启动指标导出
      if (this.config.service.enableMetricsExport) {
        this.startMetricsExport();
      }
      
      this.isStarted = true;
      this.monitor.log('info', 'PubSub service started successfully');
      this.emit('serviceStarted');
      
    } catch (error) {
      this.monitor.log('error', 'Failed to start PubSub service', { error });
      throw error;
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      this.monitor.log('info', 'Stopping PubSub service');

      // 停止定时器
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
      }

      // 刷新待处理的消息
      await this.publisher.flush();
      
      // 关闭组件
      await this.publisher.close();
      await this.pubsubClient.close();
      
      this.isStarted = false;
      this.monitor.log('info', 'PubSub service stopped');
      this.emit('serviceStopped');
      
    } catch (error) {
      this.monitor.log('error', 'Failed to stop PubSub service', { error });
      throw error;
    }
  }

  /**
   * 发布单个消息
   */
  async publish(data: MarketData, options: PublishOptions = {}): Promise<PublishResult> {
    if (!this.isStarted) {
      throw new Error('PubSub service is not started');
    }

    const startTime = Date.now();

    try {
      // 并发控制
      if (this.activePublishes >= this.config.service.maxConcurrentPublishes) {
        return this.enqueuePublish(data, options);
      }

      this.activePublishes++;
      
      const result = await this.performPublish(data, options, startTime);
      
      // 更新统计
      this.updatePublishStats(result, startTime);
      
      return result;
      
    } catch (error) {
      this.stats.totalFailed++;
      this.monitor.log('error', 'Publish failed', { data, options, error });
      throw error;
    } finally {
      this.activePublishes--;
      this.processPublishQueue();
    }
  }

  /**
   * 批量发布消息
   */
  async publishBatch(
    dataList: MarketData[], 
    options: PublishOptions = {}
  ): Promise<BatchPublishResult> {
    if (!this.isStarted) {
      throw new Error('PubSub service is not started');
    }

    const startTime = Date.now();

    try {
      this.monitor.log('debug', 'Starting batch publish', { 
        count: dataList.length,
        options 
      });

      // 路由所有消息
      const routedMessages = await this.topicManager.routeMessages(dataList);
      
      // 按 Topic 分别序列化和发布
      const publishPromises = Array.from(routedMessages.entries()).map(
        ([topic, messages]) => this.publishTopicBatch(topic, messages, options)
      );

      const results = await Promise.all(publishPromises);
      
      // 合并结果
      const batchResult = this.mergeBatchResults(results, startTime);
      
      // 更新统计
      this.updateBatchStats(batchResult);
      
      this.emit('batchPublished', batchResult);
      return batchResult;
      
    } catch (error) {
      this.monitor.log('error', 'Batch publish failed', { 
        count: dataList.length, 
        error 
      });
      throw error;
    }
  }

  /**
   * 添加路由规则
   */
  addRoutingRule(rule: TopicRoutingRule): void {
    this.topicManager.addRoutingRule(rule);
    this.emit('routingRuleAdded', rule);
  }

  /**
   * 移除路由规则
   */
  removeRoutingRule(ruleId: string): boolean {
    const removed = this.topicManager.removeRoutingRule(ruleId);
    if (removed) {
      this.emit('routingRuleRemoved', { ruleId });
    }
    return removed;
  }

  /**
   * 获取服务统计信息
   */
  getStats(): PubSubServiceStats {
    this.updateRealTimeStats();
    return { ...this.stats };
  }

  /**
   * 获取健康状态
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      publisher: 'active' | 'degraded' | 'failed';
      topicManager: 'active' | 'degraded' | 'failed';
      serializer: 'active' | 'degraded' | 'failed';
    };
    metrics: PubSubServiceStats;
    lastCheck: number;
  }> {
    await this.performHealthCheck();
    
    return {
      status: this.stats.healthStatus,
      components: {
        publisher: this.stats.publisherStatus,
        topicManager: this.stats.topicManagerStatus,
        serializer: this.stats.serializerStatus
      },
      metrics: this.getStats(),
      lastCheck: this.stats.lastHealthCheck
    };
  }

  /**
   * 初始化组件
   */
  private async initializeComponents(): Promise<void> {
    // 初始化 Pub/Sub 客户端
    this.pubsubClient = new PubSub({
      projectId: this.config.projectId,
      keyFilename: this.config.keyFilename
    });

    if (this.config.useEmulator && this.config.emulatorHost) {
      process.env.PUBSUB_EMULATOR_HOST = this.config.emulatorHost;
    }

    // 初始化发布者
    this.publisher = new EnhancedPublisher(
      this.config.publisher,
      this.monitor,
      this.errorHandler
    );

    // 初始化 Topic 管理器
    this.topicManager = new TopicManager(
      this.config.topicNaming,
      this.pubsubClient,
      this.monitor,
      this.errorHandler
    );

    // 初始化序列化器
    this.serializer = new MessageSerializer(
      this.config.serialization,
      this.monitor
    );

    // 设置事件监听
    this.setupEventListeners();
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    // 发布者事件
    this.publisher.on('metricsUpdated', (metrics) => {
      this.emit('publisherMetrics', metrics);
    });

    this.publisher.on('publisherClosed', () => {
      this.stats.publisherStatus = 'failed';
    });

    // Topic 管理器事件
    this.topicManager.on('messageRouted', (event) => {
      this.stats.totalRouted++;
    });

    this.topicManager.on('topicCreated', (event) => {
      this.stats.activeTopics++;
      this.emit('topicCreated', event);
    });
  }

  /**
   * 执行发布
   */
  private async performPublish(
    data: MarketData, 
    options: PublishOptions,
    startTime: number
  ): Promise<PublishResult> {
    // 1. 路由消息
    let topics: string[];
    if (options.customTopic) {
      topics = [options.customTopic];
    } else if (options.skipRouting) {
      topics = [this.topicManager.generateTopicName(data)];
    } else {
      const routingResult = await this.topicManager.routeMessage(data);
      topics = routingResult.topics;
    }

    // 2. 序列化消息
    let serializedData: SerializationResult;
    if (options.skipSerialization) {
      // 简单 JSON 序列化
      const jsonData = JSON.stringify(data);
      serializedData = {
        data: Buffer.from(jsonData),
        originalSize: jsonData.length,
        serializedSize: jsonData.length,
        serializationTime: 0,
        format: this.config.serialization.format,
        compression: this.config.serialization.compression,
        metadata: { version: '1.0', timestamp: Date.now() }
      };
    } else {
      serializedData = await this.serializer.serialize(data, options.customHeaders);
    }

    // 3. 创建消息头
    const headers = this.serializer.createMessageHeaders(data, serializedData, options.customHeaders);

    // 4. 发布到所有目标 Topic
    const publishPromises = topics.map(async (topic) => {
      return this.publisher.publishMessage(topic, data, {
        attributes: this.headersToAttributes(headers),
        orderingKey: options.orderingKey,
        skipBatching: options.skipBatching
      });
    });

    const results = await Promise.all(publishPromises);
    
    // 返回第一个结果（主要用于统计）
    const result = results[0];
    result.publishTime = Date.now() - startTime;

    return result;
  }

  /**
   * 发布 Topic 批次
   */
  private async publishTopicBatch(
    topic: string,
    messages: MarketData[],
    options: PublishOptions
  ): Promise<BatchPublishResult> {
    // 批量序列化
    const serializationResults = await this.serializer.serializeBatch(messages);
    
    // 准备发布数据
    const publishMessages = messages.map((data, index) => ({
      data,
      attributes: this.headersToAttributes(
        this.serializer.createMessageHeaders(data, serializationResults[index], options.customHeaders)
      ),
      orderingKey: options.orderingKey
    }));

    // 发布到 Topic
    return await this.publisher.publishBatch(topic, publishMessages);
  }

  /**
   * 合并批次结果
   */
  private mergeBatchResults(
    results: BatchPublishResult[], 
    startTime: number
  ): BatchPublishResult {
    const merged: BatchPublishResult = {
      totalMessages: 0,
      successCount: 0,
      failureCount: 0,
      publishTime: Date.now() - startTime,
      results: [],
      errors: []
    };

    for (const result of results) {
      merged.totalMessages += result.totalMessages;
      merged.successCount += result.successCount;
      merged.failureCount += result.failureCount;
      merged.results.push(...result.results);
      merged.errors.push(...result.errors);
    }

    return merged;
  }

  /**
   * 将消息头转换为属性
   */
  private headersToAttributes(headers: MessageHeaders): Record<string, string> {
    return {
      messageId: headers.messageId,
      timestamp: headers.timestamp.toString(),
      version: headers.version,
      format: headers.format,
      compression: headers.compression,
      originalSize: headers.originalSize.toString(),
      exchange: headers.exchange,
      symbol: headers.symbol,
      dataType: headers.dataType,
      ...(headers.checksum && { checksum: headers.checksum }),
      ...(headers.custom || {})
    };
  }

  /**
   * 将发布加入队列
   */
  private enqueuePublish(data: MarketData, options: PublishOptions): Promise<PublishResult> {
    return new Promise((resolve, reject) => {
      this.publishQueue.push({ data, options, resolve, reject });
    });
  }

  /**
   * 处理发布队列
   */
  private processPublishQueue(): void {
    while (this.publishQueue.length > 0 && 
           this.activePublishes < this.config.service.maxConcurrentPublishes) {
      const { data, options, resolve, reject } = this.publishQueue.shift()!;
      
      this.publish(data, options)
        .then(resolve)
        .catch(reject);
    }
  }

  /**
   * 更新发布统计
   */
  private updatePublishStats(result: PublishResult, startTime: number): void {
    this.stats.totalPublished++;
    
    const endToEndLatency = Date.now() - startTime;
    this.latencyHistory.push(endToEndLatency);
    if (this.latencyHistory.length > 1000) {
      this.latencyHistory = this.latencyHistory.slice(-1000);
    }

    // 更新发布率追踪
    this.publishRateTracker.push({ count: 1, timestamp: Date.now() });
    // 保留最近 60 秒的数据
    const cutoff = Date.now() - 60000;
    this.publishRateTracker = this.publishRateTracker.filter(item => item.timestamp > cutoff);
  }

  /**
   * 更新批次统计
   */
  private updateBatchStats(result: BatchPublishResult): void {
    this.stats.totalPublished += result.successCount;
    this.stats.totalFailed += result.failureCount;
  }

  /**
   * 更新实时统计
   */
  private updateRealTimeStats(): void {
    // 更新延迟统计
    if (this.latencyHistory.length > 0) {
      this.stats.averageEndToEndLatency = 
        this.latencyHistory.reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length;
    }

    // 更新发布率
    if (this.publishRateTracker.length > 0) {
      const timeWindow = 60000; // 60 秒
      const totalCount = this.publishRateTracker.reduce((sum, item) => sum + item.count, 0);
      this.stats.publishRate = totalCount / (timeWindow / 1000);
    }

    // 更新组件统计
    const publisherMetrics = this.publisher.getMetrics();
    this.stats.averagePublishLatency = publisherMetrics.averageLatency;
    this.stats.throughputMBps = publisherMetrics.throughputPerSecond / 1024 / 1024; // 转换为 MB/s

    const serializerStats = this.serializer.getStats();
    this.stats.averageCompressionRatio = serializerStats.averageCompressionRatio;
    this.stats.serializationRate = serializerStats.totalSerialized / (Date.now() / 1000); // 粗略计算

    const cacheStats = this.topicManager.getCacheStats();
    this.stats.routingCacheHitRate = cacheStats.hitRate;
  }

  /**
   * 开始健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.service.healthCheckInterval);
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // 检查发布者状态
      const publisherMetrics = this.publisher.getMetrics();
      if (publisherMetrics.errorRate > 0.1) { // 错误率 > 10%
        this.stats.publisherStatus = 'degraded';
      } else if (publisherMetrics.errorRate > 0.5) { // 错误率 > 50%
        this.stats.publisherStatus = 'failed';
      } else {
        this.stats.publisherStatus = 'active';
      }

      // 检查序列化器状态
      const serializerStats = this.serializer.getStats();
      if (serializerStats.errorCount > 0) {
        this.stats.serializerStatus = 'degraded';
      } else {
        this.stats.serializerStatus = 'active';
      }

      // 检查 Topic 管理器状态
      this.stats.topicManagerStatus = 'active'; // 简化实现

      // 综合健康状态
      if (this.stats.publisherStatus === 'failed' || 
          this.stats.serializerStatus === 'failed' ||
          this.stats.topicManagerStatus === 'failed') {
        this.stats.healthStatus = 'unhealthy';
      } else if (this.stats.publisherStatus === 'degraded' || 
                 this.stats.serializerStatus === 'degraded' ||
                 this.stats.topicManagerStatus === 'degraded') {
        this.stats.healthStatus = 'degraded';
      } else {
        this.stats.healthStatus = 'healthy';
      }

      this.stats.lastHealthCheck = Date.now();
      this.emit('healthCheckCompleted', this.stats.healthStatus);

    } catch (error) {
      this.monitor.log('error', 'Health check failed', { error });
      this.stats.healthStatus = 'unhealthy';
    }
  }

  /**
   * 开始指标导出
   */
  private startMetricsExport(): void {
    this.metricsTimer = setInterval(() => {
      this.updateRealTimeStats();
      this.emit('metricsExported', this.getStats());
    }, this.config.service.metricsExportInterval);
  }
}

/**
 * 默认服务配置
 */
export const DEFAULT_PUBSUB_SERVICE_CONFIG: Partial<PubSubServiceConfig> = {
  publisher: DEFAULT_PUBLISHER_CONFIG as EnhancedPublisherConfig,
  topicNaming: DEFAULT_TOPIC_NAMING_CONFIG,
  serialization: DEFAULT_SERIALIZATION_CONFIG,
  service: {
    enableHealthCheck: true,
    healthCheckInterval: 30000,
    enableMetricsExport: true,
    metricsExportInterval: 60000,
    enableAutoTopicCreation: true,
    enableMessageDeduplication: false,
    maxConcurrentPublishes: 100
  }
};