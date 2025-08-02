/**
 * Pipeline testing utilities and helpers
 */

import { EventEmitter } from 'events';
import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor, BaseErrorHandler } from '@pixiu/shared-core';
import {
  DataPipeline,
  PipelineConfig,
  PipelineStage,
  PipelineData,
  PipelineContext,
  StageConfig,
  PipelineStageType,
  StageMetrics
} from '../../src/pipeline/core/data-pipeline';

/**
 * 测试管道实现
 */
export class TestDataPipeline extends DataPipeline {
  private stageMocks = new Map<string, MockPipelineStage>();
  
  constructor(
    config: PipelineConfig,
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ) {
    super(config, monitor, errorHandler);
  }
  
  protected async createStage(config: StageConfig): Promise<PipelineStage> {
    const mockStage = new MockPipelineStage(config.name, config);
    this.stageMocks.set(config.name, mockStage);
    return mockStage;
  }
  
  /**
   * 获取模拟阶段
   */
  getMockStage(name: string): MockPipelineStage | undefined {
    return this.stageMocks.get(name);
  }
  
  /**
   * 获取所有模拟阶段
   */
  getAllMockStages(): MockPipelineStage[] {
    return Array.from(this.stageMocks.values());
  }
}

/**
 * 模拟管道阶段
 */
export class MockPipelineStage extends EventEmitter implements PipelineStage {
  public readonly name: string;
  public readonly type: PipelineStageType;
  public readonly config: StageConfig;
  
  private _isHealthy = true;
  private _metrics: StageMetrics;
  private _processFunction?: (data: PipelineData, context: PipelineContext) => Promise<PipelineData | null>;
  private _initializeFunction?: (config: StageConfig) => Promise<void>;
  private _destroyFunction?: () => Promise<void>;
  private _processedData: PipelineData[] = [];
  private _processedContexts: PipelineContext[] = [];
  private _errors: Error[] = [];
  
  constructor(name: string, config: StageConfig, type: PipelineStageType = PipelineStageType.TRANSFORM) {
    super();
    this.name = name;
    this.type = type;
    this.config = config;
    this._metrics = this.createInitialMetrics();
  }
  
  async process(data: PipelineData, context: PipelineContext): Promise<PipelineData | null> {
    try {
      this._processedData.push(data);
      this._processedContexts.push(context);
      this._metrics.processedCount++;
      
      const startTime = Date.now();
      
      let result: PipelineData | null = data;
      if (this._processFunction) {
        result = await this._processFunction(data, context);
      }
      
      const latency = Date.now() - startTime;
      this.updateLatencyMetrics(latency);
      
      this.emit('processed', data, context, result);
      return result;
    } catch (error) {
      this._errors.push(error as Error);
      this._metrics.errorCount++;
      this.emit('error', error, data, context);
      throw error;
    }
  }
  
  async initialize(config: StageConfig): Promise<void> {
    if (this._initializeFunction) {
      await this._initializeFunction(config);
    }
    this.emit('initialized', config);
  }
  
  async destroy(): Promise<void> {
    if (this._destroyFunction) {
      await this._destroyFunction();
    }
    this.emit('destroyed');
  }
  
  getMetrics(): StageMetrics {
    return { ...this._metrics };
  }
  
  isHealthy(): boolean {
    return this._isHealthy;
  }
  
  // Mock控制方法
  mockProcess(fn: (data: PipelineData, context: PipelineContext) => Promise<PipelineData | null>): void {
    this._processFunction = fn;
  }
  
  mockInitialize(fn: (config: StageConfig) => Promise<void>): void {
    this._initializeFunction = fn;
  }
  
  mockDestroy(fn: () => Promise<void>): void {
    this._destroyFunction = fn;
  }
  
  setHealthy(healthy: boolean): void {
    this._isHealthy = healthy;
  }
  
  simulateError(error: Error): void {
    this._errors.push(error);
    this._metrics.errorCount++;
    this.emit('error', error);
  }
  
  // 测试数据访问方法
  getProcessedData(): PipelineData[] {
    return [...this._processedData];
  }
  
  getProcessedContexts(): PipelineContext[] {
    return [...this._processedContexts];
  }
  
  getErrors(): Error[] {
    return [...this._errors];
  }
  
  reset(): void {
    this._processedData.length = 0;
    this._processedContexts.length = 0;
    this._errors.length = 0;
    this._metrics = this.createInitialMetrics();
    this._isHealthy = true;
  }
  
  private createInitialMetrics(): StageMetrics {
    return {
      processedCount: 0,
      errorCount: 0,
      averageLatency: 0,
      maxLatency: 0,
      throughput: 0,
      lastActivity: Date.now()
    };
  }
  
  private updateLatencyMetrics(latency: number): void {
    this._metrics.maxLatency = Math.max(this._metrics.maxLatency, latency);
    this._metrics.averageLatency = this._metrics.processedCount > 1
      ? (this._metrics.averageLatency * (this._metrics.processedCount - 1) + latency) / this._metrics.processedCount
      : latency;
    this._metrics.lastActivity = Date.now();
  }
}

/**
 * 模拟监控器
 */
export class MockMonitor extends EventEmitter implements BaseMonitor {
  private logs: Array<{ level: string; message: string; data?: any; timestamp: number }> = [];
  private metrics = new Map<string, { value: number; labels?: Record<string, string> }>();
  private healthChecks = new Map<string, any>();
  
  log(level: string, message: string, data?: any): void {
    const logEntry = {
      level,
      message,
      data,
      timestamp: Date.now()
    };
    this.logs.push(logEntry);
    this.emit('log', logEntry);
  }
  
  registerMetric(metric: {
    name: string;
    description: string;
    type: 'counter' | 'gauge' | 'histogram';
    labels?: string[];
  }): void {
    this.emit('metricRegistered', metric);
  }
  
  updateMetric(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.set(name, { value, labels });
    this.emit('metricUpdated', { name, value, labels });
  }
  
  registerHealthCheck(healthCheck: {
    name: string;
    check: () => Promise<any>;
    interval: number;
    timeout: number;
    critical: boolean;
  }): void {
    this.healthChecks.set(healthCheck.name, healthCheck);
    this.emit('healthCheckRegistered', healthCheck);
  }
  
  // 测试辅助方法
  getLogs(): Array<{ level: string; message: string; data?: any; timestamp: number }> {
    return [...this.logs];
  }
  
  getLogsByLevel(level: string): Array<{ level: string; message: string; data?: any; timestamp: number }> {
    return this.logs.filter(log => log.level === level);
  }
  
  getMetrics(): Map<string, { value: number; labels?: Record<string, string> }> {
    return new Map(this.metrics);
  }
  
  getHealthChecks(): Map<string, any> {
    return new Map(this.healthChecks);
  }
  
  clearLogs(): void {
    this.logs.length = 0;
  }
  
  clearMetrics(): void {
    this.metrics.clear();
  }
}

/**
 * 模拟错误处理器
 */
export class MockErrorHandler extends EventEmitter implements BaseErrorHandler {
  private handledErrors: Array<{
    error: Error;
    context: any;
    timestamp: number;
    strategy: string;
  }> = [];
  
  async handleError(error: Error, context: any): Promise<void> {
    const handledError = {
      error,
      context,
      timestamp: Date.now(),
      strategy: 'mock'
    };
    
    this.handledErrors.push(handledError);
    this.emit('errorHandled', handledError);
  }
  
  // 测试辅助方法
  getHandledErrors(): Array<{ error: Error; context: any; timestamp: number; strategy: string }> {
    return [...this.handledErrors];
  }
  
  getErrorsByType(errorType: string): Array<{ error: Error; context: any; timestamp: number; strategy: string }> {
    return this.handledErrors.filter(handled => handled.error.constructor.name === errorType);
  }
  
  clearErrors(): void {
    this.handledErrors.length = 0;
  }
}

/**
 * 模拟PubSub客户端
 */
export class MockPubSubClient extends EventEmitter {
  private publishedMessages: Array<{
    topic: string;
    data: any;
    options?: any;
    timestamp: number;
  }> = [];
  
  private batchPublishedMessages: Array<{
    topic: string;
    messages: any[];
    timestamp: number;
  }> = [];
  
  async publish(topic: string, data: any, options?: any): Promise<string> {
    const message = {
      topic,
      data,
      options,
      timestamp: Date.now()
    };
    
    this.publishedMessages.push(message);
    this.emit('published', message);
    
    return `message-id-${Date.now()}`;
  }
  
  async publishBatch(topic: string, messages: any[]): Promise<{ successCount: number; failureCount: number }> {
    const batchMessage = {
      topic,
      messages,
      timestamp: Date.now()
    };
    
    this.batchPublishedMessages.push(batchMessage);
    this.emit('batchPublished', batchMessage);
    
    return {
      successCount: messages.length,
      failureCount: 0
    };
  }
  
  // 测试辅助方法
  getPublishedMessages(): Array<{ topic: string; data: any; options?: any; timestamp: number }> {
    return [...this.publishedMessages];
  }
  
  getBatchPublishedMessages(): Array<{ topic: string; messages: any[]; timestamp: number }> {
    return [...this.batchPublishedMessages];
  }
  
  getMessagesByTopic(topic: string): Array<{ topic: string; data: any; options?: any; timestamp: number }> {
    return this.publishedMessages.filter(msg => msg.topic === topic);
  }
  
  clearMessages(): void {
    this.publishedMessages.length = 0;
    this.batchPublishedMessages.length = 0;
  }
}

/**
 * 性能度量工具
 */
export class PerformanceMeasurer {
  private measurements = new Map<string, number[]>();
  private startTimes = new Map<string, number>();
  
  /**
   * 开始度量
   */
  start(label: string): void {
    this.startTimes.set(label, Date.now());
  }
  
  /**
   * 结束度量
   */
  end(label: string): number {
    const startTime = this.startTimes.get(label);
    if (!startTime) {
      throw new Error(`No start time found for label: ${label}`);
    }
    
    const duration = Date.now() - startTime;
    
    if (!this.measurements.has(label)) {
      this.measurements.set(label, []);
    }
    
    this.measurements.get(label)!.push(duration);
    this.startTimes.delete(label);
    
    return duration;
  }
  
  /**
   * 获取度量结果
   */
  getMeasurements(label: string): number[] {
    return this.measurements.get(label) || [];
  }
  
  /**
   * 获取统计信息
   */
  getStats(label: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const measurements = this.getMeasurements(label);
    if (measurements.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }
    
    const sorted = [...measurements].sort((a, b) => a - b);
    const count = sorted.length;
    
    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sorted.reduce((sum, val) => sum + val, 0) / count,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)]
    };
  }
  
  /**
   * 清除度量结果
   */
  clear(label?: string): void {
    if (label) {
      this.measurements.delete(label);
      this.startTimes.delete(label);
    } else {
      this.measurements.clear();
      this.startTimes.clear();
    }
  }
}

/**
 * 内存监控工具
 */
export class MemoryMonitor {
  private snapshots: Array<{
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    rss: number;
  }> = [];
  
  /**
   * 拍摄内存快照
   */
  snapshot(): void {
    const memUsage = process.memoryUsage();
    this.snapshots.push({
      timestamp: Date.now(),
      ...memUsage
    });
  }
  
  /**
   * 获取内存快照
   */
  getSnapshots() {
    return [...this.snapshots];
  }
  
  /**
   * 获取内存使用统计
   */
  getMemoryStats() {
    if (this.snapshots.length === 0) {
      return null;
    }
    
    const latest = this.snapshots[this.snapshots.length - 1];
    const first = this.snapshots[0];
    const growth = latest.heapUsed - first.heapUsed;
    const growthRate = first.heapUsed > 0 ? growth / first.heapUsed : 0;
    
    return {
      current: latest,
      initial: first,
      growth,
      growthRate,
      peakHeapUsed: Math.max(...this.snapshots.map(s => s.heapUsed)),
      peakRSS: Math.max(...this.snapshots.map(s => s.rss))
    };
  }
  
  /**
   * 检测内存泄漏
   */
  detectMemoryLeak(threshold: number = 0.1): boolean {
    const stats = this.getMemoryStats();
    return stats ? Math.abs(stats.growthRate) > threshold : false;
  }
  
  /**
   * 清除快照
   */
  clear(): void {
    this.snapshots.length = 0;
  }
}

/**
 * 测试工具工厂
 */
export class PipelineTestUtils {
  /**
   * 创建测试管道
   */
  static createTestPipeline(config: PipelineConfig): {
    pipeline: TestDataPipeline;
    monitor: MockMonitor;
    errorHandler: MockErrorHandler;
  } {
    const monitor = new MockMonitor();
    const errorHandler = new MockErrorHandler();
    const pipeline = new TestDataPipeline(config, monitor, errorHandler);
    
    return { pipeline, monitor, errorHandler };
  }
  
  /**
   * 创建管道数据
   */
  static createPipelineData(marketData: MarketData, source: string = 'test'): PipelineData {
    return {
      id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
   * 等待指定时间
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 等待事件触发
   */
  static async waitForEvent(
    emitter: EventEmitter, 
    event: string, 
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);
      
      emitter.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }
  
  /**
   * 等待多个事件
   */
  static async waitForEvents(
    emitter: EventEmitter,
    events: string[],
    timeout: number = 5000
  ): Promise<any[]> {
    const promises = events.map(event => this.waitForEvent(emitter, event, timeout));
    return Promise.all(promises);
  }
  
  /**
   * 运行性能测试
   */
  static async runPerformanceTest(
    testFunction: () => Promise<void>,
    iterations: number = 100
  ): Promise<{
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    throughput: number;
  }> {
    const times: number[] = [];
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      const iterationStart = Date.now();
      await testFunction();
      times.push(Date.now() - iterationStart);
    }
    
    const totalTime = Date.now() - startTime;
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const throughput = (iterations / totalTime) * 1000; // iterations per second
    
    return {
      totalTime,
      averageTime,
      minTime,
      maxTime,
      throughput
    };
  }
}