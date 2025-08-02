/**
 * 基于管道的适配器集成实现
 * 使用新的数据管道系统重构数据处理逻辑
 */

import { EventEmitter } from 'events';
import { BaseErrorHandler, BaseMonitor, PubSubClientImpl } from '@pixiu/shared-core';
import { ExchangeAdapter, MarketData, AdapterStatus } from '@pixiu/adapter-base';
import { ExchangeDataPipeline, ExchangeDataPipelineFactory } from '../../pipeline/exchange-data-pipeline';
import { IntegrationConfig, IntegrationMetrics } from './adapter-integration';

/**
 * 管道集成配置
 */
export interface PipelineIntegrationConfig extends IntegrationConfig {
  /** 管道配置 */
  pipelineConfig: {
    enableBuffering: boolean;
    bufferSize: number;
    batchTimeout: number;
    enableRouting: boolean;
    routingRules?: any[];
    partitionBy?: 'exchange' | 'symbol' | 'dataType';
  };
}

/**
 * 基于管道的适配器集成基类
 */
export abstract class PipelineAdapterIntegration extends EventEmitter {
  protected adapter!: ExchangeAdapter;
  protected config!: PipelineIntegrationConfig;
  protected pubsubClient!: PubSubClientImpl;
  protected monitor!: BaseMonitor;
  protected errorHandler!: BaseErrorHandler;
  protected dataPipeline!: ExchangeDataPipeline;
  
  protected metrics!: IntegrationMetrics;
  protected isInitialized = false;
  protected isRunning = false;
  private metricsTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this.initializeMetrics();
  }

  /**
   * 初始化集成
   */
  async initialize(
    config: PipelineIntegrationConfig,
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
      
      // 创建数据管道
      this.dataPipeline = this.createDataPipeline();
      await this.dataPipeline.initialize();
      
      // 设置适配器事件处理
      this.setupAdapterEvents();
      
      // 设置管道事件处理
      this.setupPipelineEvents();
      
      // 注册健康检查
      this.registerHealthCheck();
      
      // 注册指标
      this.registerMetrics();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      this.monitor.log('info', 'Pipeline adapter integration initialized', {
        exchange: this.getExchangeName(),
        pipelineId: this.dataPipeline.getMetrics().id,
        enableBuffering: config.pipelineConfig.enableBuffering,
        enableRouting: config.pipelineConfig.enableRouting
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
      // 启动数据管道
      await this.dataPipeline.start();
      
      // 连接适配器
      await this.adapter.connect();
      
      // 开始订阅
      await this.startSubscriptions();
      
      // 启动指标收集
      this.startMetricsCollection();
      
      this.isRunning = true;
      this.emit('started');
      
      this.monitor.log('info', 'Pipeline adapter integration started', {
        exchange: this.getExchangeName(),
        pipelineId: this.dataPipeline.getMetrics().id
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
      
      // 停止数据管道
      await this.dataPipeline.stop();
      
      // 断开适配器连接
      await this.adapter.disconnect();
      
      this.isRunning = false;
      this.emit('stopped');
      
      this.monitor.log('info', 'Pipeline adapter integration stopped', {
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
      
      if (this.dataPipeline) {
        await this.dataPipeline.destroy();
      }
      
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
    const pipelineMetrics = this.dataPipeline?.getMetrics();
    
    if (pipelineMetrics) {
      // 合并管道指标和适配器指标
      this.metrics.messagesProcessed = pipelineMetrics.totalProcessed;
      this.metrics.processingErrors = pipelineMetrics.totalErrors;
      this.metrics.averageProcessingLatency = pipelineMetrics.averageLatency;
    }
    
    return { ...this.metrics };
  }

  /**
   * 获取管道指标
   */
  getPipelineMetrics() {
    return this.dataPipeline?.getMetrics();
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
    const adapterHealthy = this.isRunning && 
                          this.adapter?.getStatus() === AdapterStatus.CONNECTED &&
                          (Date.now() - this.metrics.lastActivity) < 60000;
    
    const pipelineHealthy = this.dataPipeline?.isHealthy() || false;
    
    return adapterHealthy && pipelineHealthy;
  }

  // 抽象方法，由子类实现
  protected abstract createAdapter(config: any): Promise<ExchangeAdapter>;
  protected abstract getExchangeName(): string;
  protected abstract startSubscriptions(): Promise<void>;

  /**
   * 创建数据管道
   */
  private createDataPipeline(): ExchangeDataPipeline {
    const pipelineConfig = this.config.pipelineConfig;
    
    if (pipelineConfig.enableRouting && pipelineConfig.routingRules) {
      // 创建路由管道
      return ExchangeDataPipelineFactory.createRoutingPipeline({
        id: `${this.getExchangeName()}-routing-pipeline`,
        name: `${this.getExchangeName()} Routing Pipeline`,
        pubsubClient: this.pubsubClient,
        topicPrefix: this.config.publishConfig.topicPrefix,
        routingRules: pipelineConfig.routingRules
      }, this.monitor, this.errorHandler);
    } else if (pipelineConfig.enableBuffering) {
      // 创建缓冲管道
      return ExchangeDataPipelineFactory.createBufferedPipeline({
        id: `${this.getExchangeName()}-buffered-pipeline`,
        name: `${this.getExchangeName()} Buffered Pipeline`,
        pubsubClient: this.pubsubClient,
        topicPrefix: this.config.publishConfig.topicPrefix,
        bufferSize: pipelineConfig.bufferSize,
        batchTimeout: pipelineConfig.batchTimeout,
        partitionBy: pipelineConfig.partitionBy || 'symbol'
      }, this.monitor, this.errorHandler);
    } else {
      // 创建标准管道
      return ExchangeDataPipelineFactory.createStandardPipeline({
        id: `${this.getExchangeName()}-standard-pipeline`,
        name: `${this.getExchangeName()} Standard Pipeline`,
        pubsubClient: this.pubsubClient,
        topicPrefix: this.config.publishConfig.topicPrefix,
        enableBuffering: false
      }, this.monitor, this.errorHandler);
    }
  }

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
   * 设置管道事件处理
   */
  private setupPipelineEvents(): void {
    this.dataPipeline.on('processed', (data) => {
      this.metrics.messagesPublished++;
      this.emit('dataProcessed', data);
    });

    this.dataPipeline.on('processingError', (error, data) => {
      this.metrics.processingErrors++;
      this.emit('processingError', error, data);
    });

    this.dataPipeline.on('stageError', (error, stage, data) => {
      this.monitor.log('warn', 'Pipeline stage error', {
        exchange: this.getExchangeName(),
        stageName: stage.name,
        error: error.message,
        dataId: data.id
      });
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
      
      // 使用管道处理数据
      await this.dataPipeline.process(marketData, this.getExchangeName());
      
      // 更新处理延迟
      const processingTime = Date.now() - startTime;
      this.updateProcessingLatency(processingTime);
      
      this.emit('dataReceived', marketData);
    } catch (error) {
      this.metrics.processingErrors++;
      await this.handleError(error as Error, 'processMarketData');
    }
  }

  /**
   * 注册健康检查
   */
  private registerHealthCheck(): void {
    this.monitor.registerHealthCheck({
      name: `pipeline-adapter-${this.getExchangeName()}`,
      check: async () => {
        const isHealthy = this.isHealthy();
        const pipelineMetrics = this.getPipelineMetrics();
        
        return {
          name: `pipeline-adapter-${this.getExchangeName()}`,
          status: isHealthy ? 'healthy' : 'unhealthy',
          message: isHealthy ? 'Pipeline adapter is running normally' : 'Pipeline adapter is not healthy',
          timestamp: Date.now(),
          duration: 0,
          metadata: {
            adapter: this.getMetrics(),
            pipeline: pipelineMetrics
          }
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
      name: `pipeline_adapter_messages_processed_total`,
      description: 'Total number of messages processed by pipeline adapter',
      type: 'counter',
      labels: ['exchange']
    });
    
    this.monitor.registerMetric({
      name: `pipeline_adapter_messages_published_total`,
      description: 'Total number of messages published by pipeline adapter',
      type: 'counter',
      labels: ['exchange']
    });
    
    this.monitor.registerMetric({
      name: `pipeline_adapter_processing_latency_ms`,
      description: 'Processing latency in milliseconds',
      type: 'histogram',
      labels: ['exchange']
    });
    
    this.monitor.registerMetric({
      name: `pipeline_adapter_status`,
      description: 'Pipeline adapter status (0=disconnected, 1=connecting, 2=connected, 3=error)',
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
    
    this.monitor.updateMetric('pipeline_adapter_messages_processed_total', this.metrics.messagesProcessed, { exchange: exchangeName });
    this.monitor.updateMetric('pipeline_adapter_messages_published_total', this.metrics.messagesPublished, { exchange: exchangeName });
    this.monitor.updateMetric('pipeline_adapter_status', this.getStatusNumber(this.metrics.adapterStatus), { exchange: exchangeName });
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
    this.monitor.observeHistogram('pipeline_adapter_processing_latency_ms', latency, {
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
        component: `pipeline-adapter-integration-${this.getExchangeName()}`,
        operation,
        timestamp: Date.now()
      });
    } catch (handlingError) {
      this.emit('error', error);
    }
  }
}