/**
 * 基于数据流管道的适配器集成实现
 * 使用统一的DataFlowManager系统重构数据处理逻辑
 */

import { EventEmitter } from 'events';
import { BaseErrorHandler, BaseMonitor } from '@pixiu/shared-core';
import { ExchangeAdapter, MarketData, AdapterStatus } from '@pixiu/adapter-base';
import { DataFlowManager, IDataFlowManager } from '../../dataflow';

/**
 * 管道集成配置
 */
export interface PipelineIntegrationConfig {
  /** 适配器配置 */
  adapterConfig: any;
  /** 监控配置 */
  monitoringConfig: {
    enableMetrics: boolean;
    enableHealthCheck: boolean;
    metricsInterval: number;
  };
}

export interface PipelineIntegrationMetrics {
  /** 适配器状态 */
  adapterStatus: AdapterStatus;
  /** 处理的消息数 */
  messagesProcessed: number;
  /** 发送到管道的消息数 */
  messagesSentToPipeline: number;
  /** 处理错误数 */
  processingErrors: number;
  /** 平均处理延迟 */
  averageProcessingLatency: number;
  /** 数据质量分数 */
  dataQualityScore: number;
  /** 最后活动时间 */
  lastActivity: number;
}

/**
 * 基于DataFlowManager的适配器集成基类
 */
export abstract class PipelineAdapterIntegration extends EventEmitter {
  protected adapter!: ExchangeAdapter;
  protected config!: PipelineIntegrationConfig;
  protected dataFlowManager!: IDataFlowManager;
  protected monitor!: BaseMonitor;
  protected errorHandler!: BaseErrorHandler;
  
  protected metrics!: PipelineIntegrationMetrics;
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
    dataFlowManager: IDataFlowManager,
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ): Promise<void> {
    this.config = config;
    this.dataFlowManager = dataFlowManager;
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
      
      this.monitor.log('info', 'Pipeline adapter integration initialized', {
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
      
      this.monitor.log('info', 'Pipeline adapter integration started', {
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
  getMetrics(): PipelineIntegrationMetrics {
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
   * 处理市场数据 - 核心重构点
   */
  private async processMarketData(marketData: MarketData): Promise<void> {
    try {
      const startTime = Date.now();
      
      // 更新指标
      this.metrics.messagesProcessed++;
      this.metrics.lastActivity = Date.now();
      
      // 添加调试日志（每100条消息记录一次）
      if (this.metrics.messagesProcessed % 100 === 0) {
        this.monitor.log('debug', `Processed ${this.metrics.messagesProcessed} messages from ${this.getExchangeName()}`);
      }
      
      // 基本数据验证
      if (!this.validateMarketData(marketData)) {
        this.metrics.processingErrors++;
        this.monitor.log('warn', `Invalid market data from ${this.getExchangeName()}: ${JSON.stringify(marketData)}`);
        return;
      }

      // 发送数据到数据流管道（替代直接的Pub/Sub发布）
      await this.dataFlowManager.processData(marketData, this.getExchangeName());
      
      this.metrics.messagesSentToPipeline++;
      
      // 更新处理延迟
      const processingTime = Date.now() - startTime;
      this.updateProcessingLatency(processingTime);
      
      // 发送处理完成事件（保持向后兼容性）
      this.emit('dataProcessed', marketData);
      
    } catch (error) {
      this.metrics.processingErrors++;
      this.monitor.log('error', `Error processing market data from ${this.getExchangeName()}: ${error}`);
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
   * 注册健康检查
   */
  private registerHealthCheck(): void {
    this.monitor.registerHealthCheck({
      name: `pipeline-adapter-${this.getExchangeName()}`,
      check: async () => {
        const isHealthy = this.isHealthy();
        return {
          name: `pipeline-adapter-${this.getExchangeName()}`,
          status: isHealthy ? 'healthy' : 'unhealthy',
          message: isHealthy ? 'Pipeline adapter is running normally' : 'Pipeline adapter is not healthy',
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
      name: `pipeline_adapter_messages_processed_total`,
      description: 'Total number of messages processed by pipeline adapter',
      type: 'counter',
      labels: ['exchange']
    });
    
    this.monitor.registerMetric({
      name: `pipeline_adapter_messages_sent_to_pipeline_total`,
      description: 'Total number of messages sent to data flow pipeline',
      type: 'counter',
      labels: ['exchange']
    });
    
    this.monitor.registerMetric({
      name: `pipeline_adapter_processing_latency_ms`,
      description: 'Processing latency in milliseconds for pipeline adapter',
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
    this.monitor.updateMetric('pipeline_adapter_messages_sent_to_pipeline_total', this.metrics.messagesSentToPipeline, { exchange: exchangeName });
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
      messagesSentToPipeline: 0,
      processingErrors: 0,
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