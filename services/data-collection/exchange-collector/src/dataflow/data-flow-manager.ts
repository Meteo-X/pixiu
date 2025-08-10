/**
 * 数据流管理器
 * 统一管理数据流处理，包括路由、转换和输出
 */

import { EventEmitter } from 'events';
import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor } from '@pixiu/shared-core';
import {
  IDataFlowManager,
  DataFlowConfig,
  DataFlowStats,
  OutputChannel,
  RoutingRule,
  DataTransformer,
  ChannelStatus,
  DataFlowEvents
} from './interfaces';
import { MessageRouter } from './routing/message-router';
import { StandardDataTransformer, CompressionTransformer } from './transformers/data-transformer';

interface QueueItem {
  data: MarketData;
  source?: string;
  timestamp: number;
}

/**
 * 数据流管理器实现
 */
export class DataFlowManager extends EventEmitter implements IDataFlowManager {
  private config!: DataFlowConfig;
  private monitor!: BaseMonitor;
  private router!: MessageRouter;
  private transformers: Map<string, DataTransformer> = new Map();
  private stats: DataFlowStats;
  private isRunning = false;
  private processingQueue: QueueItem[] = [];
  private isProcessing = false;
  private backpressureActive = false;

  // 性能监控
  private latencyStats: number[] = [];
  private maxLatencyWindow = 100; // 保留最近100次处理的延迟数据

  constructor() {
    super();
    this.stats = this.createInitialStats();
  }

  /**
   * 初始化数据流管理器
   */
  async initialize(config: DataFlowConfig, monitor: BaseMonitor): Promise<void> {
    this.config = config;
    this.monitor = monitor;

    // 初始化消息路由器
    this.router = new MessageRouter(monitor);
    this.setupRouterEvents();

    // 注册默认转换器
    this.registerTransformer(new StandardDataTransformer());
    this.registerTransformer(new CompressionTransformer());

    this.monitor.log('info', 'DataFlowManager initialized', {
      config: this.config,
      transformers: Array.from(this.transformers.keys())
    });
  }

  /**
   * 启动数据流管理器
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startProcessingLoop();
    this.startMetricsCollection();

    this.monitor.log('info', 'DataFlowManager started');
    this.emit('started');
  }

  /**
   * 停止数据流管理器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // 处理剩余队列中的数据
    await this.drainQueue();

    // 关闭所有通道
    const channels = this.router.getChannels();
    await Promise.allSettled(channels.map(channel => channel.close()));

    this.monitor.log('info', 'DataFlowManager stopped');
    this.emit('stopped');
  }

  /**
   * 注册输出通道
   */
  registerChannel(channel: OutputChannel): void {
    this.router.registerChannel(channel);
    this.stats.activeChannels++;

    this.monitor.log('info', 'Output channel registered', {
      channelId: channel.id,
      channelType: channel.type,
      channelName: channel.name
    });

    this.emit('channelRegistered', channel);
  }

  /**
   * 注销输出通道
   */
  unregisterChannel(channelId: string): void {
    this.router.unregisterChannel(channelId);
    this.stats.activeChannels = Math.max(0, this.stats.activeChannels - 1);

    this.monitor.log('info', 'Output channel unregistered', { channelId });
    this.emit('channelUnregistered', channelId);
  }

  /**
   * 添加路由规则
   */
  addRoutingRule(rule: RoutingRule): void {
    this.router.addRule(rule);
    this.stats.routingRules++;

    this.monitor.log('info', 'Routing rule added', {
      ruleName: rule.name,
      targets: rule.targetChannels,
      priority: rule.priority
    });

    this.emit('routingRuleAdded', rule);
  }

  /**
   * 移除路由规则
   */
  removeRoutingRule(ruleName: string): void {
    this.router.removeRule(ruleName);
    this.stats.routingRules = Math.max(0, this.stats.routingRules - 1);

    this.monitor.log('info', 'Routing rule removed', { ruleName });
    this.emit('routingRuleRemoved', ruleName);
  }

  /**
   * 注册数据转换器
   */
  registerTransformer(transformer: DataTransformer): void {
    this.transformers.set(transformer.name, transformer);

    this.monitor.log('info', 'Data transformer registered', {
      transformerName: transformer.name
    });

    this.emit('transformerRegistered', transformer);
  }

  /**
   * 处理市场数据
   */
  async processData(data: MarketData, source?: string): Promise<void> {
    if (!this.config.enabled || !this.isRunning) {
      return;
    }

    // 检查背压
    if (this.config.performance.enableBackpressure && 
        this.processingQueue.length >= this.config.performance.backpressureThreshold) {
      
      if (!this.backpressureActive) {
        this.backpressureActive = true;
        this.monitor.log('warn', 'Backpressure activated', {
          queueSize: this.processingQueue.length,
          threshold: this.config.performance.backpressureThreshold
        });
        this.emit('backpressureActivated', this.processingQueue.length);
      }
      
      // 在背压状态下，丢弃最旧的数据
      if (this.processingQueue.length >= this.config.performance.maxQueueSize) {
        const dropped = this.processingQueue.shift();
        this.monitor.log('debug', 'Dropped old data due to queue overflow', {
          droppedData: dropped?.data.symbol,
          queueSize: this.processingQueue.length
        });
      }
    }

    // 将数据添加到处理队列
    this.processingQueue.push({
      data,
      source,
      timestamp: Date.now()
    });

    this.stats.currentQueueSize = this.processingQueue.length;
  }

  /**
   * 获取数据流统计信息
   */
  getStats(): DataFlowStats {
    return {
      ...this.stats,
      averageLatency: this.calculateAverageLatency()
    };
  }

  /**
   * 获取所有通道状态
   */
  getChannelStatuses(): ChannelStatus[] {
    return this.router.getChannels().map(channel => channel.getStatus());
  }

  /**
   * 启动处理循环
   */
  private startProcessingLoop(): void {
    const processNextBatch = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.processBatch();
      } catch (error) {
        this.monitor.log('error', 'Processing batch error', { error: error.message });
      }

      // 继续下一轮处理
      setImmediate(processNextBatch);
    };

    processNextBatch();
  }

  /**
   * 处理数据批次
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batchSize = this.config.batching.enabled ? 
        Math.min(this.config.batching.batchSize, this.processingQueue.length) : 1;
      
      const batch = this.processingQueue.splice(0, batchSize);
      
      // 并发处理批次中的所有数据
      const processingPromises = batch.map(item => this.processItem(item));
      await Promise.allSettled(processingPromises);

      // 更新队列大小
      this.stats.currentQueueSize = this.processingQueue.length;

      // 检查是否可以取消背压
      if (this.backpressureActive && 
          this.processingQueue.length < this.config.performance.backpressureThreshold * 0.8) {
        this.backpressureActive = false;
        this.stats.backpressureActive = false;
        this.monitor.log('info', 'Backpressure deactivated', {
          queueSize: this.processingQueue.length
        });
        this.emit('backpressureDeactivated', this.processingQueue.length);
      }

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 处理单个数据项
   */
  private async processItem(item: QueueItem): Promise<void> {
    const startTime = Date.now();

    try {
      // 应用数据转换器
      let transformedData = item.data;
      for (const transformer of this.transformers.values()) {
        try {
          transformedData = await transformer.transform(transformedData, {
            source: item.source,
            queuedAt: item.timestamp,
            processedAt: startTime
          });
        } catch (transformError) {
          this.monitor.log('error', 'Data transformation error', {
            transformerName: transformer.name,
            error: transformError.message,
            data: { exchange: item.data.exchange, symbol: item.data.symbol }
          });
          // 继续使用之前的数据
        }
      }

      // 路由数据到输出通道
      await this.router.route(transformedData);

      // 更新统计信息
      this.updateProcessingStats(startTime, false);
      this.emit('dataProcessed', transformedData, this.getStats());

    } catch (error) {
      this.updateProcessingStats(startTime, true);
      this.monitor.log('error', 'Data processing error', {
        error: error.message,
        data: { exchange: item.data.exchange, symbol: item.data.symbol, type: item.data.type }
      });
      
      this.emit('processingError', error, item.data);
    }
  }

  /**
   * 更新处理统计信息
   */
  private updateProcessingStats(startTime: number, isError: boolean): void {
    const processingTime = Date.now() - startTime;
    
    if (isError) {
      this.stats.totalErrors++;
    } else {
      this.stats.totalProcessed++;
      this.stats.totalSent++; // 假设路由成功意味着发送成功
    }

    // 记录延迟
    this.latencyStats.push(processingTime);
    if (this.latencyStats.length > this.maxLatencyWindow) {
      this.latencyStats.shift();
    }

    this.stats.lastActivity = Date.now();
  }

  /**
   * 计算平均延迟
   */
  private calculateAverageLatency(): number {
    if (this.latencyStats.length === 0) {
      return 0;
    }

    const sum = this.latencyStats.reduce((acc, latency) => acc + latency, 0);
    return sum / this.latencyStats.length;
  }

  /**
   * 排空处理队列
   */
  private async drainQueue(): Promise<void> {
    this.monitor.log('info', 'Draining processing queue', {
      remainingItems: this.processingQueue.length
    });

    while (this.processingQueue.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * 设置路由器事件监听
   */
  private setupRouterEvents(): void {
    this.router.on('dataRouted', (data: MarketData, channelIds: string[]) => {
      this.emit('routingRuleMatched', channelIds.join(','), data);
    });

    this.router.on('channelError', (channelId: string, error: Error) => {
      this.emit('channelError', channelId, error);
    });

    this.router.on('routingError', (error: Error, data: MarketData) => {
      this.monitor.log('error', 'Routing error', {
        error: error.message,
        data: { exchange: data.exchange, symbol: data.symbol, type: data.type }
      });
    });
  }

  /**
   * 启动指标收集
   */
  private startMetricsCollection(): void {
    if (!this.config.monitoring.enableMetrics) {
      return;
    }

    setInterval(() => {
      this.stats.backpressureActive = this.backpressureActive;
      this.emit('statsUpdated', this.getStats());
    }, this.config.monitoring.metricsInterval);
  }

  /**
   * 创建初始统计信息
   */
  private createInitialStats(): DataFlowStats {
    return {
      totalProcessed: 0,
      totalSent: 0,
      totalErrors: 0,
      averageLatency: 0,
      currentQueueSize: 0,
      backpressureActive: false,
      activeChannels: 0,
      routingRules: 0,
      lastActivity: Date.now()
    };
  }
}

// 声明事件类型以支持TypeScript
declare interface DataFlowManager {
  on<K extends keyof DataFlowEvents>(event: K, listener: DataFlowEvents[K]): this;
  emit<K extends keyof DataFlowEvents>(event: K, ...args: Parameters<DataFlowEvents[K]>): boolean;
}