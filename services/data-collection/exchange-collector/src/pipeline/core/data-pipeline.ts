/**
 * 数据管道核心接口和抽象基类
 * 提供通用的数据处理管道框架
 */

import { EventEmitter } from 'events';
import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor, BaseErrorHandler } from '@pixiu/shared-core';

/**
 * 管道阶段接口
 */
export interface PipelineStage {
  readonly name: string;
  readonly type: PipelineStageType;
  readonly config: StageConfig;
  
  process(data: PipelineData, context: PipelineContext): Promise<PipelineData | null>;
  initialize(config: StageConfig): Promise<void>;
  destroy(): Promise<void>;
  getMetrics(): StageMetrics;
  isHealthy(): boolean;
}

/**
 * 管道阶段类型
 */
export enum PipelineStageType {
  INPUT = 'input',
  TRANSFORM = 'transform',
  FILTER = 'filter',
  ROUTER = 'router',
  BUFFER = 'buffer',
  OUTPUT = 'output'
}

/**
 * 管道数据包装器
 */
export interface PipelineData {
  readonly id: string;
  readonly marketData: MarketData;
  readonly metadata: DataMetadata;
  readonly timestamp: number;
  readonly source: string;
  attributes: Record<string, any>;
}

/**
 * 数据元数据
 */
export interface DataMetadata {
  exchange: string;
  symbol: string;
  dataType: string;
  priority: number;
  retryCount: number;
  processingLatency?: number;
  routingKeys?: string[];
  bufferPolicy?: BufferPolicy;
}

/**
 * 缓冲策略
 */
export interface BufferPolicy {
  maxSize: number;
  maxAge: number;
  flushInterval: number;
  backpressureThreshold: number;
}

/**
 * 管道上下文
 */
export interface PipelineContext {
  readonly pipelineId: string;
  readonly stageIndex: number;
  readonly totalStages: number;
  readonly startTime: number;
  correlationId: string;
  properties: Record<string, any>;
  metrics: ContextMetrics;
}

/**
 * 上下文指标
 */
export interface ContextMetrics {
  processedStages: number;
  errors: number;
  warnings: number;
  totalLatency: number;
  stageLatencies: Map<string, number>;
}

/**
 * 阶段配置
 */
export interface StageConfig {
  enabled: boolean;
  name: string;
  parallel: boolean;
  timeout: number;
  retryCount: number;
  retryInterval: number;
  circuitBreaker?: CircuitBreakerConfig;
  rateLimit?: RateLimitConfig;
  [key: string]: any;
}

/**
 * 断路器配置
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  timeoutThreshold: number;
  resetTimeout: number;
}

/**
 * 限流配置
 */
export interface RateLimitConfig {
  maxRequests: number;
  timeWindow: number;
  burst: number;
}

/**
 * 阶段指标
 */
export interface StageMetrics {
  processedCount: number;
  errorCount: number;
  averageLatency: number;
  maxLatency: number;
  throughput: number;
  lastActivity: number;
  circuitBreakerState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

/**
 * 管道配置
 */
export interface PipelineConfig {
  readonly id: string;
  readonly name: string;
  stages: StageConfig[];
  errorHandling: ErrorHandlingConfig;
  monitoring: MonitoringConfig;
  performance: PerformanceConfig;
}

/**
 * 错误处理配置
 */
export interface ErrorHandlingConfig {
  strategy: 'FAIL_FAST' | 'CONTINUE' | 'RETRY';
  maxRetries: number;
  retryInterval: number;
  deadLetterQueue?: string;
  errorCallback?: (error: Error, data: PipelineData, context: PipelineContext) => Promise<void>;
}

/**
 * 监控配置
 */
export interface MonitoringConfig {
  enableMetrics: boolean;
  enableTracing: boolean;
  metricsInterval: number;
  healthCheckInterval: number;
  alertThresholds: AlertThresholds;
}

/**
 * 告警阈值
 */
export interface AlertThresholds {
  errorRate: number;
  latency: number;
  throughput: number;
  memoryUsage: number;
}

/**
 * 性能配置
 */
export interface PerformanceConfig {
  maxConcurrency: number;
  queueSize: number;
  backpressureStrategy: 'DROP' | 'BLOCK' | 'SPILL';
  memoryLimit: number;
  gcThreshold: number;
}

/**
 * 管道指标
 */
export interface PipelineMetrics {
  readonly id: string;
  readonly name: string;
  totalProcessed: number;
  totalErrors: number;
  averageLatency: number;
  currentThroughput: number;
  queueSize: number;
  memoryUsage: number;
  isHealthy: boolean;
  uptime: number;
  stageMetrics: Map<string, StageMetrics>;
}

/**
 * 数据管道抽象基类
 */
export abstract class DataPipeline extends EventEmitter {
  protected readonly config: PipelineConfig;
  protected readonly stages: PipelineStage[] = [];
  protected readonly monitor: BaseMonitor;
  protected readonly errorHandler: BaseErrorHandler;
  
  protected isRunning = false;
  protected isInitialized = false;
  protected metrics: PipelineMetrics;
  protected metricsTimer?: NodeJS.Timeout;
  protected healthCheckTimer?: NodeJS.Timeout;

  constructor(
    config: PipelineConfig,
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ) {
    super();
    this.config = config;
    this.monitor = monitor;
    this.errorHandler = errorHandler;
    this.metrics = this.initializeMetrics();
  }

  /**
   * 初始化管道
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.monitor.log('info', 'Initializing data pipeline', {
        pipelineId: this.config.id,
        pipelineName: this.config.name,
        stageCount: this.config.stages.length
      });

      // 创建并初始化所有阶段
      for (const stageConfig of this.config.stages) {
        const stage = await this.createStage(stageConfig);
        await stage.initialize(stageConfig);
        this.stages.push(stage);
      }

      // 注册监控指标
      this.registerMetrics();

      // 注册健康检查
      this.registerHealthCheck();

      this.isInitialized = true;
      this.emit('initialized');

      this.monitor.log('info', 'Data pipeline initialized', {
        pipelineId: this.config.id,
        stageCount: this.stages.length
      });
    } catch (error) {
      await this.handleError(error as Error, 'initialize');
      throw error;
    }
  }

  /**
   * 启动管道
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Pipeline not initialized');
    }

    if (this.isRunning) {
      return;
    }

    try {
      this.monitor.log('info', 'Starting data pipeline', {
        pipelineId: this.config.id
      });

      // 启动监控
      this.startMonitoring();

      this.isRunning = true;
      this.emit('started');

      this.monitor.log('info', 'Data pipeline started', {
        pipelineId: this.config.id
      });
    } catch (error) {
      await this.handleError(error as Error, 'start');
      throw error;
    }
  }

  /**
   * 停止管道
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.monitor.log('info', 'Stopping data pipeline', {
        pipelineId: this.config.id
      });

      // 停止监控
      this.stopMonitoring();

      this.isRunning = false;
      this.emit('stopped');

      this.monitor.log('info', 'Data pipeline stopped', {
        pipelineId: this.config.id
      });
    } catch (error) {
      await this.handleError(error as Error, 'stop');
      throw error;
    }
  }

  /**
   * 销毁管道
   */
  async destroy(): Promise<void> {
    try {
      await this.stop();

      // 销毁所有阶段
      for (const stage of this.stages) {
        await stage.destroy();
      }

      this.stages.length = 0;
      this.removeAllListeners();

      this.monitor.log('info', 'Data pipeline destroyed', {
        pipelineId: this.config.id
      });
    } catch (error) {
      await this.handleError(error as Error, 'destroy');
    }
  }

  /**
   * 处理数据
   */
  async process(marketData: MarketData, source: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Pipeline not running');
    }

    const pipelineData = this.createPipelineData(marketData, source);
    const context = this.createPipelineContext();

    try {
      await this.executeStages(pipelineData, context);
      this.updateMetrics(context);
      this.emit('processed', pipelineData, context);
    } catch (error) {
      await this.handleProcessingError(error as Error, pipelineData, context);
    }
  }

  /**
   * 获取管道指标
   */
  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  /**
   * 检查管道健康状态
   */
  isHealthy(): boolean {
    if (!this.isRunning) {
      return false;
    }

    // 检查所有阶段是否健康
    for (const stage of this.stages) {
      if (!stage.isHealthy()) {
        return false;
      }
    }

    // 检查性能指标
    const now = Date.now();
    if (now - this.metrics.uptime > 60000) { // 1分钟内无活动
      return false;
    }

    return true;
  }

  // 抽象方法，由子类实现
  protected abstract createStage(config: StageConfig): Promise<PipelineStage>;

  /**
   * 执行管道阶段
   */
  private async executeStages(data: PipelineData, context: PipelineContext): Promise<void> {
    let currentData: PipelineData | null = data;

    for (let i = 0; i < this.stages.length && currentData; i++) {
      const stage = this.stages[i];
      (context as any).stageIndex = i;

      try {
        const stageStartTime = Date.now();
        currentData = await stage.process(currentData, context);
        const stageLatency = Date.now() - stageStartTime;

        context.metrics.stageLatencies.set(stage.name, stageLatency);
        context.metrics.processedStages++;
      } catch (error) {
        context.metrics.errors++;
        await this.handleStageError(error as Error, stage, currentData!, context);
        
        if (this.config.errorHandling.strategy === 'FAIL_FAST') {
          throw error;
        }
      }
    }
  }

  /**
   * 创建管道数据
   */
  private createPipelineData(marketData: MarketData, source: string): PipelineData {
    return {
      id: this.generateId(),
      marketData,
      metadata: {
        exchange: marketData.exchange,
        symbol: marketData.symbol,
        dataType: marketData.type,
        priority: 1,
        retryCount: 0
      },
      timestamp: Date.now(),
      source,
      attributes: {}
    };
  }

  /**
   * 创建管道上下文
   */
  private createPipelineContext(): PipelineContext {
    return {
      pipelineId: this.config.id,
      stageIndex: 0,
      totalStages: this.stages.length,
      startTime: Date.now(),
      correlationId: this.generateId(),
      properties: {},
      metrics: {
        processedStages: 0,
        errors: 0,
        warnings: 0,
        totalLatency: 0,
        stageLatencies: new Map()
      }
    };
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): PipelineMetrics {
    return {
      id: this.config.id,
      name: this.config.name,
      totalProcessed: 0,
      totalErrors: 0,
      averageLatency: 0,
      currentThroughput: 0,
      queueSize: 0,
      memoryUsage: 0,
      isHealthy: true,
      uptime: Date.now(),
      stageMetrics: new Map()
    };
  }

  /**
   * 更新指标
   */
  private updateMetrics(context: PipelineContext): void {
    this.metrics.totalProcessed++;
    this.metrics.totalErrors += context.metrics.errors;
    
    const totalLatency = Date.now() - context.startTime;
    this.metrics.averageLatency = this.calculateAverageLatency(totalLatency);
    
    // 更新阶段指标
    for (const stage of this.stages) {
      this.metrics.stageMetrics.set(stage.name, stage.getMetrics());
    }
  }

  /**
   * 计算平均延迟
   */
  private calculateAverageLatency(newLatency: number): number {
    const count = this.metrics.totalProcessed;
    const currentAvg = this.metrics.averageLatency;
    return count > 1 ? (currentAvg * (count - 1) + newLatency) / count : newLatency;
  }

  /**
   * 注册监控指标
   */
  private registerMetrics(): void {
    if (!this.config.monitoring.enableMetrics) {
      return;
    }

    this.monitor.registerMetric({
      name: 'pipeline_processed_total',
      description: 'Total number of messages processed by pipeline',
      type: 'counter',
      labels: ['pipeline_id', 'pipeline_name']
    });

    this.monitor.registerMetric({
      name: 'pipeline_errors_total',
      description: 'Total number of errors in pipeline',
      type: 'counter',
      labels: ['pipeline_id', 'pipeline_name']
    });

    this.monitor.registerMetric({
      name: 'pipeline_latency_ms',
      description: 'Pipeline processing latency in milliseconds',
      type: 'histogram',
      labels: ['pipeline_id', 'pipeline_name']
    });
  }

  /**
   * 注册健康检查
   */
  private registerHealthCheck(): void {
    if (!this.config.monitoring.enableMetrics) {
      return;
    }

    this.monitor.registerHealthCheck({
      name: `pipeline-${this.config.id}`,
      check: async () => {
        const isHealthy = this.isHealthy();
        return {
          name: `pipeline-${this.config.id}`,
          status: isHealthy ? 'healthy' : 'unhealthy',
          message: isHealthy ? 'Pipeline is running normally' : 'Pipeline is not healthy',
          timestamp: Date.now(),
          duration: 0,
          metadata: this.getMetrics()
        };
      },
      interval: this.config.monitoring.healthCheckInterval,
      timeout: 5000,
      critical: true
    });
  }

  /**
   * 启动监控
   */
  private startMonitoring(): void {
    if (this.config.monitoring.enableMetrics) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics();
      }, this.config.monitoring.metricsInterval);
    }
  }

  /**
   * 停止监控
   */
  private stopMonitoring(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * 收集指标
   */
  private collectMetrics(): void {
    const labels = {
      pipeline_id: this.config.id,
      pipeline_name: this.config.name
    };

    this.monitor.updateMetric('pipeline_processed_total', this.metrics.totalProcessed, labels);
    this.monitor.updateMetric('pipeline_errors_total', this.metrics.totalErrors, labels);
  }

  /**
   * 处理阶段错误
   */
  private async handleStageError(
    error: Error,
    stage: PipelineStage,
    data: PipelineData,
    context: PipelineContext
  ): Promise<void> {
    this.monitor.log('error', 'Stage processing error', {
      pipelineId: this.config.id,
      stageName: stage.name,
      error: error.message,
      dataId: data.id
    });

    this.emit('stageError', error, stage, data, context);
  }

  /**
   * 处理处理错误
   */
  private async handleProcessingError(
    error: Error,
    data: PipelineData,
    context: PipelineContext
  ): Promise<void> {
    this.metrics.totalErrors++;
    
    await this.errorHandler.handleError(error, {
      component: `pipeline-${this.config.id}`,
      operation: 'process',
      timestamp: Date.now()
    });

    this.emit('processingError', error, data, context);
  }

  /**
   * 处理错误
   */
  private async handleError(error: Error, operation: string): Promise<void> {
    await this.errorHandler.handleError(error, {
      component: `pipeline-${this.config.id}`,
      operation,
      timestamp: Date.now()
    });

    this.emit('error', error);
  }
}