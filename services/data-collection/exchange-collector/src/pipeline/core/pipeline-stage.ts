/**
 * 管道阶段基类和具体实现
 * 提供各种类型的管道处理阶段
 */

import { EventEmitter } from 'events';
import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor } from '@pixiu/shared-core';
import {
  PipelineStage,
  PipelineStageType,
  PipelineData,
  PipelineContext,
  StageConfig,
  StageMetrics,
  CircuitBreakerConfig,
  RateLimitConfig
} from './data-pipeline';

/**
 * 管道阶段抽象基类
 */
export abstract class BasePipelineStage extends EventEmitter implements PipelineStage {
  public readonly name: string;
  public readonly type: PipelineStageType;
  public readonly config: StageConfig;

  protected monitor?: BaseMonitor;
  protected isInitialized = false;
  protected metrics: StageMetrics;
  protected circuitBreaker?: CircuitBreaker;
  protected rateLimiter?: RateLimiter;

  constructor(name: string, type: PipelineStageType, config: StageConfig) {
    super();
    this.name = name;
    this.type = type;
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * 初始化阶段
   */
  async initialize(config: StageConfig): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化断路器
      if (config.circuitBreaker?.enabled) {
        this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
      }

      // 初始化限流器
      if (config.rateLimit) {
        this.rateLimiter = new RateLimiter(config.rateLimit);
      }

      // 执行子类特定的初始化
      await this.doInitialize(config);

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 处理数据
   */
  async process(data: PipelineData, context: PipelineContext): Promise<PipelineData | null> {
    if (!this.isInitialized) {
      throw new Error(`Stage ${this.name} not initialized`);
    }

    if (!this.config.enabled) {
      return data;
    }

    try {
      // 检查断路器状态
      if (this.circuitBreaker && !this.circuitBreaker.canExecute()) {
        throw new Error(`Circuit breaker is open for stage ${this.name}`);
      }

      // 检查限流
      if (this.rateLimiter && !this.rateLimiter.tryAcquire()) {
        throw new Error(`Rate limit exceeded for stage ${this.name}`);
      }

      const startTime = Date.now();
      const result = await this.doProcess(data, context);
      const latency = Date.now() - startTime;

      // 更新指标
      this.updateMetrics(latency, false);

      // 记录成功
      if (this.circuitBreaker) {
        this.circuitBreaker.onSuccess();
      }

      this.emit('processed', data, result, latency);
      return result;
    } catch (error) {
      this.updateMetrics(0, true);
      
      if (this.circuitBreaker) {
        this.circuitBreaker.onFailure();
      }

      this.emit('error', error, data, context);
      throw error;
    }
  }

  /**
   * 销毁阶段
   */
  async destroy(): Promise<void> {
    try {
      await this.doDestroy();
      this.removeAllListeners();
      this.emit('destroyed');
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * 获取指标
   */
  getMetrics(): StageMetrics {
    return { ...this.metrics };
  }

  /**
   * 检查健康状态
   */
  isHealthy(): boolean {
    if (!this.isInitialized) {
      return false;
    }

    // 检查断路器状态
    if (this.circuitBreaker && this.circuitBreaker.isOpen()) {
      return false;
    }

    // 检查错误率
    const errorRate = this.metrics.processedCount > 0 
      ? this.metrics.errorCount / this.metrics.processedCount 
      : 0;
    
    if (errorRate > 0.1) { // 错误率超过10%
      return false;
    }

    // 检查最后活动时间
    if (Date.now() - this.metrics.lastActivity > 60000) { // 1分钟内无活动
      return false;
    }

    return true;
  }

  // 抽象方法，由子类实现
  protected abstract doInitialize(config: StageConfig): Promise<void>;
  protected abstract doProcess(data: PipelineData, context: PipelineContext): Promise<PipelineData | null>;
  protected abstract doDestroy(): Promise<void>;

  /**
   * 初始化指标
   */
  private initializeMetrics(): StageMetrics {
    return {
      processedCount: 0,
      errorCount: 0,
      averageLatency: 0,
      maxLatency: 0,
      throughput: 0,
      lastActivity: Date.now()
    };
  }

  /**
   * 更新指标
   */
  private updateMetrics(latency: number, isError: boolean): void {
    this.metrics.processedCount++;
    this.metrics.lastActivity = Date.now();

    if (isError) {
      this.metrics.errorCount++;
    } else {
      // 更新延迟指标
      if (latency > this.metrics.maxLatency) {
        this.metrics.maxLatency = latency;
      }

      const count = this.metrics.processedCount - this.metrics.errorCount;
      const currentAvg = this.metrics.averageLatency;
      this.metrics.averageLatency = count > 1 
        ? (currentAvg * (count - 1) + latency) / count 
        : latency;
    }
  }
}

/**
 * 输入阶段 - 数据接收
 */
export class InputStage extends BasePipelineStage {
  constructor(config: StageConfig) {
    super(config.name || 'input', PipelineStageType.INPUT, config);
  }

  protected async doInitialize(_config: StageConfig): Promise<void> {
    // 输入阶段特定的初始化逻辑
  }

  protected async doProcess(data: PipelineData, _context: PipelineContext): Promise<PipelineData | null> {
    // 输入阶段处理逻辑
    // 通常用于数据接收和初始验证
    return data;
  }

  protected async doDestroy(): Promise<void> {
    // 清理资源
  }
}

/**
 * 转换阶段 - 数据转换
 */
export class TransformStage extends BasePipelineStage {
  private transformer?: (data: MarketData) => Promise<MarketData>;

  constructor(config: StageConfig) {
    super(config.name || 'transform', PipelineStageType.TRANSFORM, config);
  }

  protected async doInitialize(config: StageConfig): Promise<void> {
    // 设置转换函数
    if (config.transformer) {
      this.transformer = config.transformer;
    }
  }

  protected async doProcess(data: PipelineData, _context: PipelineContext): Promise<PipelineData | null> {
    if (this.transformer) {
      const transformedMarketData = await this.transformer(data.marketData);
      return {
        ...data,
        marketData: transformedMarketData
      };
    }
    return data;
  }

  protected async doDestroy(): Promise<void> {
    this.transformer = undefined;
  }
}

/**
 * 过滤阶段 - 数据过滤
 */
export class FilterStage extends BasePipelineStage {
  private filter?: (data: MarketData) => Promise<boolean>;

  constructor(config: StageConfig) {
    super(config.name || 'filter', PipelineStageType.FILTER, config);
  }

  protected async doInitialize(config: StageConfig): Promise<void> {
    // 设置过滤函数
    if (config.filter) {
      this.filter = config.filter;
    }
  }

  protected async doProcess(data: PipelineData, _context: PipelineContext): Promise<PipelineData | null> {
    if (this.filter) {
      const shouldPass = await this.filter(data.marketData);
      return shouldPass ? data : null;
    }
    return data;
  }

  protected async doDestroy(): Promise<void> {
    this.filter = undefined;
  }
}

/**
 * 路由阶段 - 数据路由
 */
export class RouterStage extends BasePipelineStage {
  private router?: (data: MarketData) => Promise<string[]>;

  constructor(config: StageConfig) {
    super(config.name || 'router', PipelineStageType.ROUTER, config);
  }

  protected async doInitialize(config: StageConfig): Promise<void> {
    // 设置路由函数
    if (config.router) {
      this.router = config.router;
    }
  }

  protected async doProcess(data: PipelineData, _context: PipelineContext): Promise<PipelineData | null> {
    if (this.router) {
      const routingKeys = await this.router(data.marketData);
      return {
        ...data,
        metadata: {
          ...data.metadata,
          routingKeys
        }
      };
    }
    return data;
  }

  protected async doDestroy(): Promise<void> {
    this.router = undefined;
  }
}

/**
 * 输出阶段 - 数据输出
 */
export class OutputStage extends BasePipelineStage {
  private publisher?: (data: PipelineData[]) => Promise<void>;

  constructor(config: StageConfig) {
    super(config.name || 'output', PipelineStageType.OUTPUT, config);
  }

  protected async doInitialize(config: StageConfig): Promise<void> {
    // 设置发布函数
    if (config.publisher) {
      this.publisher = config.publisher;
    }
  }

  protected async doProcess(data: PipelineData, _context: PipelineContext): Promise<PipelineData | null> {
    if (this.publisher) {
      await this.publisher([data]);
    }
    return data;
  }

  protected async doDestroy(): Promise<void> {
    this.publisher = undefined;
  }
}

/**
 * 断路器实现
 */
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(private config: CircuitBreakerConfig) {}

  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN state
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) { // 连续3次成功则关闭断路器
        this.state = 'CLOSED';
      }
    }
  }

  onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  isOpen(): boolean {
    return this.state === 'OPEN';
  }

  getState(): string {
    return this.state;
  }
}

/**
 * 限流器实现
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(private config: RateLimitConfig) {
    this.tokens = config.maxRequests;
    this.lastRefill = Date.now();
  }

  tryAcquire(): boolean {
    this.refill();
    
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed >= this.config.timeWindow) {
      this.tokens = Math.min(
        this.config.maxRequests,
        this.tokens + Math.floor(elapsed / this.config.timeWindow) * this.config.maxRequests
      );
      this.lastRefill = now;
    }
  }
}