/**
 * 适配器集成基类
 * 处理适配器与exchange-collector服务的集成逻辑
 */

import { EventEmitter } from 'events';
import { BaseErrorHandler, BaseMonitor, PubSubClientImpl } from '@pixiu/shared-core';
import { ExchangeAdapter, MarketData, AdapterStatus } from '@pixiu/adapter-base';

export interface IntegrationConfig {
  /** 适配器配置 */
  adapterConfig: any;
  /** 数据发布配置 */
  publishConfig: {
    topicPrefix: string;
    enableBatching: boolean;
    batchSize: number;
    batchTimeout: number;
  };
  /** 监控配置 */
  monitoringConfig: {
    enableMetrics: boolean;
    enableHealthCheck: boolean;
    metricsInterval: number;
  };
}

export interface IntegrationMetrics {
  /** 适配器状态 */
  adapterStatus: AdapterStatus;
  /** 处理的消息数 */
  messagesProcessed: number;
  /** 发布的消息数 */
  messagesPublished: number;
  /** 处理错误数 */
  processingErrors: number;
  /** 发布错误数 */
  publishErrors: number;
  /** 平均处理延迟 */
  averageProcessingLatency: number;
  /** 数据质量分数 */
  dataQualityScore: number;
  /** 最后活动时间 */
  lastActivity: number;
}

/**
 * 适配器集成基类
 */
export abstract class AdapterIntegration extends EventEmitter {
  protected adapter!: ExchangeAdapter;
  protected config!: IntegrationConfig;
  protected pubsubClient!: PubSubClientImpl;
  protected monitor!: BaseMonitor;
  protected errorHandler!: BaseErrorHandler;
  
  protected metrics!: IntegrationMetrics;
  protected isInitialized = false;
  protected isRunning = false;
  
  private messageBuffer: MarketData[] = [];
  private batchTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this.initializeMetrics();
  }

  /**
   * 初始化集成
   */
  async initialize(
    config: IntegrationConfig,
    pubsubClient: PubSubClientImpl,
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ): Promise<void> {
    this.config = config;
    this.pubsubClient = pubsubClient;
    this.monitor = monitor;
    this.errorHandler = errorHandler;

    try {
      // 创建适配器实例
      this.adapter = await this.createAdapter(config.adapterConfig);
      
      // 设置适配器事件处理
      this.setupAdapterEvents();
      
      // 注册健康检查
      this.registerHealthCheck();
      
      // 注册指标
      this.registerMetrics();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      this.monitor.log('info', 'Adapter integration initialized', {
        exchange: this.getExchangeName(),
        config: this.config
      });
    } catch (error) {
      await this.handleError(error as Error, 'initialize');
      throw error;
    }
  }

  /**
   * 启动集成
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Integration not initialized');
    }

    if (this.isRunning) {
      return;
    }

    try {
      // 连接适配器
      await this.adapter.connect();
      
      // 开始订阅
      await this.startSubscriptions();
      
      // 启动指标收集
      this.startMetricsCollection();
      
      this.isRunning = true;
      this.emit('started');
      
      this.monitor.log('info', 'Adapter integration started', {
        exchange: this.getExchangeName()
      });
    } catch (error) {
      await this.handleError(error as Error, 'start');
      throw error;
    }
  }

  /**
   * 停止集成
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // 停止指标收集
      this.stopMetricsCollection();
      
      // 发布剩余的缓冲消息
      await this.flushMessageBuffer();
      
      // 断开适配器连接
      await this.adapter.disconnect();
      
      this.isRunning = false;
      this.emit('stopped');
      
      this.monitor.log('info', 'Adapter integration stopped', {
        exchange: this.getExchangeName()
      });
    } catch (error) {
      await this.handleError(error as Error, 'stop');
      throw error;
    }
  }

  /**
   * 销毁集成
   */
  async destroy(): Promise<void> {
    try {
      await this.stop();
      
      if (this.adapter) {
        await this.adapter.destroy();
      }
      
      this.removeAllListeners();
    } catch (error) {
      await this.handleError(error as Error, 'destroy');
    }
  }

  /**
   * 获取集成指标
   */
  getMetrics(): IntegrationMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取适配器状态
   */
  getAdapterStatus(): AdapterStatus {
    return this.adapter?.getStatus() || AdapterStatus.DISCONNECTED;
  }

  /**
   * 检查是否健康
   */
  isHealthy(): boolean {
    return this.isRunning && 
           this.adapter?.getStatus() === AdapterStatus.CONNECTED &&
           (Date.now() - this.metrics.lastActivity) < 60000; // 1分钟内有活动
  }

  // 抽象方法，由子类实现
  protected abstract createAdapter(config: any): Promise<ExchangeAdapter>;
  protected abstract getExchangeName(): string;
  protected abstract startSubscriptions(): Promise<void>;

  /**
   * 设置适配器事件处理
   */
  private setupAdapterEvents(): void {
    this.adapter.on('statusChange', (newStatus, oldStatus) => {
      this.metrics.adapterStatus = newStatus;
      this.emit('adapterStatusChange', newStatus, oldStatus);
      
      this.monitor.log('info', 'Adapter status changed', {
        exchange: this.getExchangeName(),
        oldStatus,
        newStatus
      });
    });

    this.adapter.on('data', (marketData) => {
      this.processMarketData(marketData);
    });

    this.adapter.on('error', (error) => {
      this.handleError(error, 'adapter');
    });

    this.adapter.on('connected', () => {
      this.emit('adapterConnected');
    });

    this.adapter.on('disconnected', (reason) => {
      this.emit('adapterDisconnected', reason);
    });
  }

  /**
   * 处理市场数据
   */
  private async processMarketData(marketData: MarketData): Promise<void> {
    try {
      const startTime = Date.now();
      
      // 更新指标
      this.metrics.messagesProcessed++;
      this.metrics.lastActivity = Date.now();
      
      // 数据质量检查
      if (!this.validateMarketData(marketData)) {
        this.metrics.processingErrors++;
        return;
      }

      // 数据标准化
      const normalizedData = this.normalizeMarketData(marketData);
      
      // 添加到缓冲区或直接发布
      if (this.config.publishConfig.enableBatching) {
        this.addToBuffer(normalizedData);
      } else {
        await this.publishMarketData(normalizedData);
      }
      
      // 更新处理延迟
      const processingTime = Date.now() - startTime;
      this.updateProcessingLatency(processingTime);
      
      this.emit('dataProcessed', normalizedData);
    } catch (error) {
      this.metrics.processingErrors++;
      await this.handleError(error as Error, 'processMarketData');
    }
  }

  /**
   * 验证市场数据
   */
  private validateMarketData(data: MarketData): boolean {
    return !!(data.exchange && data.symbol && data.type && data.timestamp && data.data);
  }

  /**
   * 标准化市场数据
   */
  private normalizeMarketData(data: MarketData): MarketData {
    return {
      ...data,
      exchange: data.exchange.toLowerCase(),
      symbol: data.symbol.toUpperCase(),
      receivedAt: data.receivedAt || Date.now()
    };
  }

  /**
   * 添加到缓冲区
   */
  private addToBuffer(data: MarketData): void {
    this.messageBuffer.push(data);
    
    if (this.messageBuffer.length >= this.config.publishConfig.batchSize) {
      this.flushMessageBuffer();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushMessageBuffer();
      }, this.config.publishConfig.batchTimeout);
    }
  }

  /**
   * 发布缓冲区消息
   */
  private async flushMessageBuffer(): Promise<void> {
    if (this.messageBuffer.length === 0) {
      return;
    }

    const messages = this.messageBuffer.splice(0);
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    try {
      // 按数据类型分组发布
      const messagesByType = new Map<string, MarketData[]>();
      
      for (const message of messages) {
        const topicName = this.buildTopicNameFromData(message);
        if (!messagesByType.has(topicName)) {
          messagesByType.set(topicName, []);
        }
        messagesByType.get(topicName)!.push(message);
      }

      // 分别发布每种数据类型
      let totalSuccessCount = 0;
      let totalFailureCount = 0;
      
      for (const [topicName, typeMessages] of messagesByType) {
        const batchResult = await this.pubsubClient.publishBatch(
          topicName,
          typeMessages.map(data => ({ data, options: { attributes: this.buildMessageAttributes(data) } }))
        );
        
        totalSuccessCount += batchResult.successCount;
        totalFailureCount += batchResult.failureCount;
      }
      
      this.metrics.messagesPublished += totalSuccessCount;
      this.metrics.publishErrors += totalFailureCount;
      
      this.emit('batchPublished', {
        successCount: totalSuccessCount,
        failureCount: totalFailureCount
      });
    } catch (error) {
      this.metrics.publishErrors += messages.length;
      await this.handleError(error as Error, 'flushMessageBuffer');
    }
  }

  /**
   * 发布单个市场数据
   */
  private async publishMarketData(data: MarketData): Promise<void> {
    try {
      const topicName = this.buildTopicNameFromData(data);
      const messageId = await this.pubsubClient.publish(topicName, data, {
        attributes: this.buildMessageAttributes(data)
      });
      
      this.metrics.messagesPublished++;
      this.emit('dataPublished', { data, messageId });
    } catch (error) {
      this.metrics.publishErrors++;
      await this.handleError(error as Error, 'publishMarketData');
    }
  }


  /**
   * 根据市场数据构建主题名称
   */
  private buildTopicNameFromData(data: MarketData): string {
    const dataTypeName = this.getDataTypeName(data.type);
    return `${this.config.publishConfig.topicPrefix}-${dataTypeName}-${this.getExchangeName()}`;
  }

  /**
   * 获取数据类型名称
   */
  private getDataTypeName(dataType: string): string {
    // 将枚举值转换为topic名称
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
   * 构建消息属性
   */
  private buildMessageAttributes(data: MarketData): Record<string, string> {
    return {
      exchange: data.exchange,
      symbol: data.symbol,
      type: data.type,
      timestamp: data.timestamp.toString(),
      source: 'exchange-collector'
    };
  }

  /**
   * 注册健康检查
   */
  private registerHealthCheck(): void {
    this.monitor.registerHealthCheck({
      name: `adapter-${this.getExchangeName()}`,
      check: async () => {
        const isHealthy = this.isHealthy();
        return {
          name: `adapter-${this.getExchangeName()}`,
          status: isHealthy ? 'healthy' : 'unhealthy',
          message: isHealthy ? 'Adapter is running normally' : 'Adapter is not healthy',
          timestamp: Date.now(),
          duration: 0,
          metadata: this.getMetrics()
        };
      },
      interval: 30000,
      timeout: 5000,
      critical: true
    });
  }

  /**
   * 注册指标
   */
  private registerMetrics(): void {
    
    this.monitor.registerMetric({
      name: `adapter_messages_processed_total`,
      description: 'Total number of messages processed by adapter',
      type: 'counter',
      labels: ['exchange']
    });
    
    this.monitor.registerMetric({
      name: `adapter_messages_published_total`,
      description: 'Total number of messages published by adapter',
      type: 'counter',
      labels: ['exchange']
    });
    
    this.monitor.registerMetric({
      name: `adapter_processing_latency_ms`,
      description: 'Processing latency in milliseconds',
      type: 'histogram',
      labels: ['exchange']
    });
    
    this.monitor.registerMetric({
      name: `adapter_status`,
      description: 'Adapter status (0=disconnected, 1=connecting, 2=connected, 3=error)',
      type: 'gauge',
      labels: ['exchange']
    });
  }

  /**
   * 启动指标收集
   */
  private startMetricsCollection(): void {
    if (!this.config.monitoringConfig.enableMetrics) {
      return;
    }

    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, this.config.monitoringConfig.metricsInterval);
  }

  /**
   * 停止指标收集
   */
  private stopMetricsCollection(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
  }

  /**
   * 更新指标
   */
  private updateMetrics(): void {
    const exchangeName = this.getExchangeName();
    
    this.monitor.updateMetric('adapter_messages_processed_total', this.metrics.messagesProcessed, { exchange: exchangeName });
    this.monitor.updateMetric('adapter_messages_published_total', this.metrics.messagesPublished, { exchange: exchangeName });
    this.monitor.updateMetric('adapter_status', this.getStatusNumber(this.metrics.adapterStatus), { exchange: exchangeName });
  }

  /**
   * 获取状态数字
   */
  private getStatusNumber(status: AdapterStatus): number {
    switch (status) {
      case AdapterStatus.DISCONNECTED: return 0;
      case AdapterStatus.CONNECTING: return 1;
      case AdapterStatus.CONNECTED: return 2;
      case AdapterStatus.RECONNECTING: return 1;
      case AdapterStatus.ERROR: return 3;
      default: return 0;
    }
  }

  /**
   * 更新处理延迟
   */
  private updateProcessingLatency(latency: number): void {
    this.monitor.observeHistogram('adapter_processing_latency_ms', latency, {
      exchange: this.getExchangeName()
    });
    
    // 更新平均延迟
    const currentAvg = this.metrics.averageProcessingLatency;
    const totalMessages = this.metrics.messagesProcessed;
    this.metrics.averageProcessingLatency = totalMessages > 1
      ? (currentAvg * (totalMessages - 1) + latency) / totalMessages
      : latency;
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): void {
    this.metrics = {
      adapterStatus: AdapterStatus.DISCONNECTED,
      messagesProcessed: 0,
      messagesPublished: 0,
      processingErrors: 0,
      publishErrors: 0,
      averageProcessingLatency: 0,
      dataQualityScore: 1.0,
      lastActivity: Date.now()
    };
  }

  /**
   * 处理错误
   */
  private async handleError(error: Error, operation: string): Promise<void> {
    try {
      await this.errorHandler.handleError(error, {
        component: `adapter-integration-${this.getExchangeName()}`,
        operation,
        timestamp: Date.now()
      });
    } catch (handlingError) {
      this.emit('error', error);
    }
  }
}