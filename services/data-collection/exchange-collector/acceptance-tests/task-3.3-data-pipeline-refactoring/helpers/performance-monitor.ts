/**
 * Performance monitoring utilities for pipeline testing
 */

import { EventEmitter } from 'events';
import { PerformanceBenchmark } from '../fixtures/performance-benchmarks';

/**
 * 性能指标收集器
 */
export interface PerformanceMetrics {
  timestamp: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    avg: number;
  };
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    gcPause?: number;
  };
  cpu: {
    usage: number;
  };
  errors: {
    count: number;
    rate: number;
  };
}

/**
 * 性能监控器
 */
export class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetrics[] = [];
  private latencies: number[] = [];
  private messageCounts: number[] = [];
  private byteCounts: number[] = [];
  private errorCounts: number[] = [];
  private gcPauses: number[] = [];
  private startTime: number = 0;
  private intervalTimer?: NodeJS.Timeout;
  private monitoringInterval: number = 1000; // 1 second
  private benchmark?: PerformanceBenchmark;
  
  constructor(options: {
    monitoringInterval?: number;
    benchmark?: PerformanceBenchmark;
  } = {}) {
    super();
    this.monitoringInterval = options.monitoringInterval || 1000;
    this.benchmark = options.benchmark;
  }
  
  /**
   * 开始性能监控
   */
  start(): void {
    this.startTime = Date.now();
    this.reset();
    
    // 设置GC监听
    this.setupGCMonitoring();
    
    // 开始定期收集指标
    this.intervalTimer = setInterval(() => {
      this.collectMetrics();
    }, this.monitoringInterval);
    
    this.emit('started');
  }
  
  /**
   * 停止性能监控
   */
  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    
    // 收集最后一次指标
    this.collectMetrics();
    
    this.emit('stopped', this.getReport());
  }
  
  /**
   * 记录延迟
   */
  recordLatency(latency: number): void {
    this.latencies.push(latency);
    this.emit('latencyRecorded', latency);
  }
  
  /**
   * 记录消息处理
   */
  recordMessage(messageSize: number = 0): void {
    this.messageCounts.push(Date.now());
    if (messageSize > 0) {
      this.byteCounts.push(messageSize);
    }
    this.emit('messageRecorded', messageSize);
  }
  
  /**
   * 记录错误
   */
  recordError(): void {
    this.errorCounts.push(Date.now());
    this.emit('errorRecorded');
  }
  
  /**
   * 获取当前指标
   */
  getCurrentMetrics(): PerformanceMetrics {
    const now = Date.now();
    const windowSize = this.monitoringInterval * 2; // 2x monitoring interval window
    const windowStart = now - windowSize;
    
    // 计算延迟统计
    const recentLatencies = this.latencies.slice(-1000); // 最近1000个延迟
    const latencyStats = this.calculateLatencyStats(recentLatencies);
    
    // 计算吞吐量
    const recentMessages = this.messageCounts.filter(time => time >= windowStart);
    const recentBytes = this.byteCounts.filter((_, index) => {
      return index < recentMessages.length && this.messageCounts[index] >= windowStart;
    });
    
    const throughputStats = this.calculateThroughputStats(recentMessages, recentBytes, windowSize);
    
    // 获取内存统计
    const memoryStats = this.getMemoryStats();
    
    // 计算CPU使用率（简化版本）
    const cpuStats = this.getCPUStats();
    
    // 计算错误统计
    const recentErrors = this.errorCounts.filter(time => time >= windowStart);
    const errorStats = this.calculateErrorStats(recentErrors, recentMessages.length);
    
    return {
      timestamp: now,
      latency: latencyStats,
      throughput: throughputStats,
      memory: memoryStats,
      cpu: cpuStats,
      errors: errorStats
    };
  }
  
  /**
   * 获取历史指标
   */
  getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metrics];
  }
  
  /**
   * 生成性能报告
   */
  getReport(): {
    duration: number;
    totalMessages: number;
    totalErrors: number;
    averageLatency: number;
    averageThroughput: number;
    peakMemoryUsage: number;
    benchmarkResults?: {
      passed: boolean;
      failures: string[];
    };
  } {
    const duration = Date.now() - this.startTime;
    const totalMessages = this.messageCounts.length;
    const totalErrors = this.errorCounts.length;
    
    const averageLatency = this.latencies.length > 0
      ? this.latencies.reduce((sum, lat) => sum + lat, 0) / this.latencies.length
      : 0;
    
    const averageThroughput = duration > 0 ? (totalMessages / duration) * 1000 : 0;
    
    const peakMemoryUsage = this.metrics.length > 0
      ? Math.max(...this.metrics.map(m => m.memory.heapUsed))
      : 0;
    
    let benchmarkResults;
    if (this.benchmark) {
      benchmarkResults = this.validateAgainstBenchmark();
    }
    
    return {
      duration,
      totalMessages,
      totalErrors,
      averageLatency,
      averageThroughput,
      peakMemoryUsage,
      benchmarkResults
    };
  }
  
  /**
   * 重置所有指标
   */
  reset(): void {
    this.metrics.length = 0;
    this.latencies.length = 0;
    this.messageCounts.length = 0;
    this.byteCounts.length = 0;
    this.errorCounts.length = 0;
    this.gcPauses.length = 0;
  }
  
  /**
   * 设置基准
   */
  setBenchmark(benchmark: PerformanceBenchmark): void {
    this.benchmark = benchmark;
  }
  
  /**
   * 收集指标
   */
  private collectMetrics(): void {
    const metrics = this.getCurrentMetrics();
    this.metrics.push(metrics);
    
    // 检查是否超过基准阈值
    if (this.benchmark) {
      this.checkBenchmarkViolations(metrics);
    }
    
    this.emit('metricsCollected', metrics);
  }
  
  /**
   * 计算延迟统计
   */
  private calculateLatencyStats(latencies: number[]): {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    avg: number;
  } {
    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
    }
    
    const sorted = [...latencies].sort((a, b) => a - b);
    const len = sorted.length;
    
    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      max: sorted[len - 1],
      avg: sorted.reduce((sum, val) => sum + val, 0) / len
    };
  }
  
  /**
   * 计算吞吐量统计
   */
  private calculateThroughputStats(
    messageTimestamps: number[],
    byteSizes: number[],
    windowSize: number
  ): {
    messagesPerSecond: number;
    bytesPerSecond: number;
  } {
    const messagesPerSecond = windowSize > 0 ? (messageTimestamps.length / windowSize) * 1000 : 0;
    const totalBytes = byteSizes.reduce((sum, size) => sum + size, 0);
    const bytesPerSecond = windowSize > 0 ? (totalBytes / windowSize) * 1000 : 0;
    
    return {
      messagesPerSecond,
      bytesPerSecond
    };
  }
  
  /**
   * 获取内存统计
   */
  private getMemoryStats(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    gcPause?: number;
  } {
    const memUsage = process.memoryUsage();
    const recentGCPause = this.gcPauses.slice(-1)[0];
    
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      gcPause: recentGCPause
    };
  }
  
  /**
   * 获取CPU统计（简化版本）
   */
  private getCPUStats(): { usage: number } {
    // 简化实现，实际应该使用更精确的CPU监控
    return { usage: 0 };
  }
  
  /**
   * 计算错误统计
   */
  private calculateErrorStats(
    errorTimestamps: number[],
    totalMessages: number
  ): {
    count: number;
    rate: number;
  } {
    const count = errorTimestamps.length;
    const rate = totalMessages > 0 ? count / totalMessages : 0;
    
    return { count, rate };
  }
  
  /**
   * 设置GC监控
   */
  private setupGCMonitoring(): void {
    if (global.gc) {
      // 简化版本的GC监控
      const originalGC = global.gc;
      global.gc = () => {
        const start = Date.now();
        originalGC();
        const pause = Date.now() - start;
        this.gcPauses.push(pause);
        this.emit('gcPause', pause);
      };
    }
  }
  
  /**
   * 验证基准
   */
  private validateAgainstBenchmark(): {
    passed: boolean;
    failures: string[];
  } {
    if (!this.benchmark) {
      return { passed: true, failures: [] };
    }
    
    const failures: string[] = [];
    const current = this.getCurrentMetrics();
    
    // 检查延迟
    if (current.latency.p50 > this.benchmark.thresholds.latency.p50) {
      failures.push(`P50 latency ${current.latency.p50}ms exceeds threshold ${this.benchmark.thresholds.latency.p50}ms`);
    }
    
    if (current.latency.p95 > this.benchmark.thresholds.latency.p95) {
      failures.push(`P95 latency ${current.latency.p95}ms exceeds threshold ${this.benchmark.thresholds.latency.p95}ms`);
    }
    
    if (current.latency.p99 > this.benchmark.thresholds.latency.p99) {
      failures.push(`P99 latency ${current.latency.p99}ms exceeds threshold ${this.benchmark.thresholds.latency.p99}ms`);
    }
    
    // 检查吞吐量
    if (current.throughput.messagesPerSecond < this.benchmark.thresholds.throughput.min) {
      failures.push(`Throughput ${current.throughput.messagesPerSecond} msg/s below minimum ${this.benchmark.thresholds.throughput.min} msg/s`);
    }
    
    // 检查内存
    if (current.memory.heapUsed > this.benchmark.thresholds.memory.maxHeapUsage) {
      failures.push(`Heap usage ${current.memory.heapUsed} bytes exceeds limit ${this.benchmark.thresholds.memory.maxHeapUsage} bytes`);
    }
    
    if (current.memory.gcPause && current.memory.gcPause > this.benchmark.thresholds.memory.maxGCPause) {
      failures.push(`GC pause ${current.memory.gcPause}ms exceeds limit ${this.benchmark.thresholds.memory.maxGCPause}ms`);
    }
    
    // 检查错误率
    if (current.errors.rate > this.benchmark.thresholds.errors.maxRate) {
      failures.push(`Error rate ${current.errors.rate} exceeds threshold ${this.benchmark.thresholds.errors.maxRate}`);
    }
    
    return {
      passed: failures.length === 0,
      failures
    };
  }
  
  /**
   * 检查基准违规
   */
  private checkBenchmarkViolations(metrics: PerformanceMetrics): void {
    if (!this.benchmark) return;
    
    const validation = this.validateAgainstBenchmark();
    if (!validation.passed) {
      this.emit('benchmarkViolation', {
        metrics,
        failures: validation.failures
      });
    }
  }
}

/**
 * 延迟跟踪器
 */
export class LatencyTracker {
  private pendingRequests = new Map<string, number>();
  private completedLatencies: number[] = [];
  
  /**
   * 开始跟踪请求
   */
  start(requestId: string): void {
    this.pendingRequests.set(requestId, Date.now());
  }
  
  /**
   * 完成跟踪请求
   */
  end(requestId: string): number | null {
    const startTime = this.pendingRequests.get(requestId);
    if (!startTime) {
      return null;
    }
    
    const latency = Date.now() - startTime;
    this.completedLatencies.push(latency);
    this.pendingRequests.delete(requestId);
    
    return latency;
  }
  
  /**
   * 获取延迟统计
   */
  getStats(): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    if (this.completedLatencies.length === 0) {
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
    
    const sorted = [...this.completedLatencies].sort((a, b) => a - b);
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
   * 重置跟踪器
   */
  reset(): void {
    this.pendingRequests.clear();
    this.completedLatencies.length = 0;
  }
}

/**
 * 吞吐量计算器
 */
export class ThroughputCalculator {
  private messageTimestamps: number[] = [];
  private byteCounts: number[] = [];
  
  /**
   * 记录消息
   */
  recordMessage(messageSize: number = 0): void {
    this.messageTimestamps.push(Date.now());
    this.byteCounts.push(messageSize);
  }
  
  /**
   * 计算吞吐量
   */
  calculateThroughput(windowMs: number = 1000): {
    messagesPerSecond: number;
    bytesPerSecond: number;
    totalMessages: number;
    totalBytes: number;
  } {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    const recentMessageIndices = this.messageTimestamps
      .map((timestamp, index) => ({ timestamp, index }))
      .filter(({ timestamp }) => timestamp >= windowStart)
      .map(({ index }) => index);
    
    const recentMessages = recentMessageIndices.length;
    const recentBytes = recentMessageIndices
      .reduce((sum, index) => sum + this.byteCounts[index], 0);
    
    const messagesPerSecond = (recentMessages / windowMs) * 1000;
    const bytesPerSecond = (recentBytes / windowMs) * 1000;
    
    return {
      messagesPerSecond,
      bytesPerSecond,
      totalMessages: this.messageTimestamps.length,
      totalBytes: this.byteCounts.reduce((sum, bytes) => sum + bytes, 0)
    };
  }
  
  /**
   * 重置计算器
   */
  reset(): void {
    this.messageTimestamps.length = 0;
    this.byteCounts.length = 0;
  }
}