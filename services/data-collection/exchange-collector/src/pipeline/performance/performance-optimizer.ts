/**
 * 性能优化器
 * 提供管道性能监控、优化建议和自动调优功能
 */

import { EventEmitter } from 'events';
import { PipelineMetrics } from '../core/data-pipeline';
import { MemoryManager, MemoryStats } from './memory-manager';

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  throughput: number; // 吞吐量 (msg/s)
  latency: LatencyMetrics;
  memory: MemoryStats;
  cpu: CpuMetrics;
  pipeline: PipelineMetrics;
  timestamp: number;
}

/**
 * 延迟指标
 */
export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  average: number;
  max: number;
  min: number;
}

/**
 * CPU指标
 */
export interface CpuMetrics {
  usage: number; // CPU使用率 (0-1)
  loadAverage: number[];
  processCpuUsage: {
    user: number;
    system: number;
  };
}

/**
 * 性能优化建议
 */
export interface OptimizationSuggestion {
  id: string;
  type: 'MEMORY' | 'CPU' | 'THROUGHPUT' | 'LATENCY' | 'PIPELINE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  action: string;
  expectedImprovement: string;
  implementationCost: 'LOW' | 'MEDIUM' | 'HIGH';
  automated: boolean;
  parameters?: Record<string, any>;
}

/**
 * 性能阈值配置
 */
export interface PerformanceThresholds {
  throughput: {
    min: number;
    target: number;
    max: number;
  };
  latency: {
    p95Max: number;
    p99Max: number;
    averageMax: number;
  };
  memory: {
    heapUsageMax: number;
    gcFrequencyMax: number;
  };
  cpu: {
    usageMax: number;
    loadAverageMax: number;
  };
}

/**
 * 自动调优配置
 */
export interface AutoTuningConfig {
  enabled: boolean;
  aggressiveness: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  allowedActions: string[];
  maxConcurrentChanges: number;
  rollbackOnFailure: boolean;
  stabilizationPeriod: number; // 稳定期 (毫秒)
}

/**
 * 延迟统计收集器
 */
class LatencyCollector {
  private samples: number[] = [];
  private maxSamples: number;

  constructor(maxSamples = 1000) {
    this.maxSamples = maxSamples;
  }

  addSample(latency: number): void {
    this.samples.push(latency);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getMetrics(): LatencyMetrics {
    if (this.samples.length === 0) {
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        average: 0,
        max: 0,
        min: 0
      };
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      average: this.samples.reduce((sum, val) => sum + val, 0) / len,
      max: Math.max(...this.samples),
      min: Math.min(...this.samples)
    };
  }

  clear(): void {
    this.samples.length = 0;
  }

  private percentile(sortedArray: number[], p: number): number {
    const index = Math.ceil(sortedArray.length * p) - 1;
    return sortedArray[Math.max(0, index)];
  }
}

/**
 * 性能优化器
 */
export class PerformanceOptimizer extends EventEmitter {
  private memoryManager: MemoryManager;
  private latencyCollector: LatencyCollector;
  private performanceHistory: PerformanceMetrics[] = [];
  private suggestions: OptimizationSuggestion[] = [];
  private thresholds: PerformanceThresholds;
  private autoTuningConfig: AutoTuningConfig;
  private monitoringTimer?: NodeJS.Timeout;
  private appliedOptimizations = new Set<string>();
  private lastCpuUsage?: NodeJS.CpuUsage;

  constructor(
    memoryManager: MemoryManager,
    thresholds: PerformanceThresholds,
    autoTuningConfig: AutoTuningConfig
  ) {
    super();
    this.memoryManager = memoryManager;
    this.latencyCollector = new LatencyCollector();
    this.thresholds = thresholds;
    this.autoTuningConfig = autoTuningConfig;
  }

  /**
   * 启动性能监控
   */
  start(): void {
    if (this.monitoringTimer) {
      return;
    }

    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, 10000); // 每10秒收集一次指标

    this.emit('started');
  }

  /**
   * 停止性能监控
   */
  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    this.emit('stopped');
  }

  /**
   * 记录处理延迟
   */
  recordLatency(latency: number): void {
    this.latencyCollector.addSample(latency);
  }

  /**
   * 获取当前性能指标
   */
  getCurrentMetrics(): PerformanceMetrics {
    return {
      throughput: this.calculateThroughput(),
      latency: this.latencyCollector.getMetrics(),
      memory: this.memoryManager.getMemoryStats(),
      cpu: this.getCpuMetrics(),
      pipeline: {} as PipelineMetrics, // 需要从外部传入
      timestamp: Date.now()
    };
  }

  /**
   * 获取性能历史
   */
  getPerformanceHistory(): PerformanceMetrics[] {
    return [...this.performanceHistory];
  }

  /**
   * 获取优化建议
   */
  getOptimizationSuggestions(): OptimizationSuggestion[] {
    return [...this.suggestions];
  }

  /**
   * 应用优化建议
   */
  async applyOptimization(suggestionId: string): Promise<boolean> {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (!suggestion) {
      return false;
    }

    try {
      await this.executeOptimization(suggestion);
      this.appliedOptimizations.add(suggestionId);
      this.emit('optimizationApplied', suggestion);
      return true;
    } catch (error) {
      this.emit('optimizationFailed', suggestion, error);
      return false;
    }
  }

  /**
   * 自动优化
   */
  async autoOptimize(): Promise<void> {
    if (!this.autoTuningConfig.enabled) {
      return;
    }

    const applicableSuggestions = this.suggestions.filter(s => 
      s.automated && 
      !this.appliedOptimizations.has(s.id) &&
      this.isActionAllowed(s.action)
    );

    // 按严重性排序
    applicableSuggestions.sort((a, b) => {
      const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    // 限制并发更改数量
    const toApply = applicableSuggestions.slice(0, this.autoTuningConfig.maxConcurrentChanges);

    for (const suggestion of toApply) {
      await this.applyOptimization(suggestion.id);
    }
  }

  /**
   * 收集性能指标
   */
  private collectMetrics(): void {
    const metrics = this.getCurrentMetrics();
    
    // 更新历史记录
    this.performanceHistory.push(metrics);
    if (this.performanceHistory.length > 100) {
      this.performanceHistory.shift();
    }

    // 分析性能问题
    this.analyzePerfomance(metrics);

    // 自动优化
    if (this.autoTuningConfig.enabled) {
      this.autoOptimize();
    }

    this.emit('metricsCollected', metrics);
  }

  /**
   * 分析性能问题
   */
  private analyzePerfomance(metrics: PerformanceMetrics): void {
    this.suggestions = [];

    // 内存分析
    this.analyzeMemory(metrics.memory);

    // CPU分析
    this.analyzeCpu(metrics.cpu);

    // 延迟分析
    this.analyzeLatency(metrics.latency);

    // 吞吐量分析
    this.analyzeThroughput(metrics.throughput);

    this.emit('analysisCompleted', this.suggestions);
  }

  /**
   * 分析内存使用
   */
  private analyzeMemory(memory: MemoryStats): void {
    if (memory.heapUsagePercentage > this.thresholds.memory.heapUsageMax) {
      this.suggestions.push({
        id: 'memory-heap-usage-high',
        type: 'MEMORY',
        severity: memory.heapUsagePercentage > 0.9 ? 'CRITICAL' : 'HIGH',
        title: '堆内存使用率过高',
        description: `当前堆内存使用率为 ${(memory.heapUsagePercentage * 100).toFixed(1)}%`,
        action: 'INCREASE_GC_FREQUENCY',
        expectedImprovement: '降低内存使用率 10-20%',
        implementationCost: 'LOW',
        automated: true,
        parameters: { gcThreshold: 0.7 }
      });
    }

    if (memory.memoryPressure === 'HIGH' || memory.memoryPressure === 'CRITICAL') {
      this.suggestions.push({
        id: 'memory-pressure-high',
        type: 'MEMORY',
        severity: memory.memoryPressure === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        title: '内存压力过大',
        description: `当前内存压力级别: ${memory.memoryPressure}`,
        action: 'ENABLE_OBJECT_POOLING',
        expectedImprovement: '减少内存分配开销 20-30%',
        implementationCost: 'MEDIUM',
        automated: true
      });
    }
  }

  /**
   * 分析CPU使用
   */
  private analyzeCpu(cpu: CpuMetrics): void {
    if (cpu.usage > this.thresholds.cpu.usageMax) {
      this.suggestions.push({
        id: 'cpu-usage-high',
        type: 'CPU',
        severity: cpu.usage > 0.9 ? 'CRITICAL' : 'HIGH',
        title: 'CPU使用率过高',
        description: `当前CPU使用率为 ${(cpu.usage * 100).toFixed(1)}%`,
        action: 'ENABLE_BATCH_PROCESSING',
        expectedImprovement: '降低CPU使用率 15-25%',
        implementationCost: 'MEDIUM',
        automated: true,
        parameters: { batchSize: 100, batchTimeout: 1000 }
      });
    }

    const loadAvg = cpu.loadAverage[0];
    if (loadAvg > this.thresholds.cpu.loadAverageMax) {
      this.suggestions.push({
        id: 'load-average-high',
        type: 'CPU',
        severity: 'MEDIUM',
        title: '系统负载过高',
        description: `1分钟平均负载: ${loadAvg.toFixed(2)}`,
        action: 'REDUCE_CONCURRENCY',
        expectedImprovement: '降低系统负载 10-20%',
        implementationCost: 'LOW',
        automated: true,
        parameters: { maxConcurrency: 50 }
      });
    }
  }

  /**
   * 分析延迟
   */
  private analyzeLatency(latency: LatencyMetrics): void {
    if (latency.p95 > this.thresholds.latency.p95Max) {
      this.suggestions.push({
        id: 'latency-p95-high',
        type: 'LATENCY',
        severity: 'HIGH',
        title: 'P95延迟过高',
        description: `P95延迟: ${latency.p95.toFixed(2)}ms`,
        action: 'OPTIMIZE_PIPELINE_STAGES',
        expectedImprovement: '降低P95延迟 20-30%',
        implementationCost: 'MEDIUM',
        automated: false
      });
    }

    if (latency.average > this.thresholds.latency.averageMax) {
      this.suggestions.push({
        id: 'latency-average-high',
        type: 'LATENCY',
        severity: 'MEDIUM',
        title: '平均延迟过高',
        description: `平均延迟: ${latency.average.toFixed(2)}ms`,
        action: 'ENABLE_PIPELINE_PARALLELISM',
        expectedImprovement: '降低平均延迟 15-25%',
        implementationCost: 'HIGH',
        automated: false
      });
    }
  }

  /**
   * 分析吞吐量
   */
  private analyzeThroughput(throughput: number): void {
    if (throughput < this.thresholds.throughput.min) {
      this.suggestions.push({
        id: 'throughput-low',
        type: 'THROUGHPUT',
        severity: 'MEDIUM',
        title: '吞吐量偏低',
        description: `当前吞吐量: ${throughput.toFixed(1)} msg/s`,
        action: 'INCREASE_BUFFER_SIZE',
        expectedImprovement: '提升吞吐量 20-40%',
        implementationCost: 'LOW',
        automated: true,
        parameters: { bufferSize: 2000, batchTimeout: 500 }
      });
    }
  }

  /**
   * 计算吞吐量
   */
  private calculateThroughput(): number {
    // 简化实现，实际应该基于时间窗口计算
    return 0;
  }

  /**
   * 获取CPU指标
   */
  private getCpuMetrics(): CpuMetrics {
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();

    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    const usage = totalCpuTime / 1000000; // 转换为秒

    return {
      usage: Math.min(usage / 10, 1), // 简化计算
      loadAverage: require('os').loadavg(),
      processCpuUsage: {
        user: cpuUsage.user / 1000,
        system: cpuUsage.system / 1000
      }
    };
  }

  /**
   * 执行优化
   */
  private async executeOptimization(suggestion: OptimizationSuggestion): Promise<void> {
    switch (suggestion.action) {
      case 'INCREASE_GC_FREQUENCY':
        this.memoryManager.forceGC();
        break;
        
      case 'ENABLE_OBJECT_POOLING':
        // 通知系统启用对象池
        this.emit('enableObjectPooling');
        break;
        
      case 'ENABLE_BATCH_PROCESSING':
        // 通知系统启用批处理
        this.emit('enableBatchProcessing', suggestion.parameters);
        break;
        
      case 'REDUCE_CONCURRENCY':
        // 通知系统降低并发度
        this.emit('reduceConcurrency', suggestion.parameters);
        break;
        
      case 'INCREASE_BUFFER_SIZE':
        // 通知系统增加缓冲区大小
        this.emit('increaseBufferSize', suggestion.parameters);
        break;
        
      default:
        throw new Error(`Unknown optimization action: ${suggestion.action}`);
    }
  }

  /**
   * 检查动作是否被允许
   */
  private isActionAllowed(action: string): boolean {
    return this.autoTuningConfig.allowedActions.includes(action);
  }
}

/**
 * 性能优化器工厂
 */
export class PerformanceOptimizerFactory {
  /**
   * 创建默认性能优化器
   */
  static createDefault(memoryManager: MemoryManager): PerformanceOptimizer {
    return new PerformanceOptimizer(
      memoryManager,
      {
        throughput: { min: 100, target: 1000, max: 5000 },
        latency: { p95Max: 100, p99Max: 200, averageMax: 50 },
        memory: { heapUsageMax: 0.8, gcFrequencyMax: 10 },
        cpu: { usageMax: 0.8, loadAverageMax: 2.0 }
      },
      {
        enabled: true,
        aggressiveness: 'MODERATE',
        allowedActions: [
          'INCREASE_GC_FREQUENCY',
          'ENABLE_OBJECT_POOLING',
          'ENABLE_BATCH_PROCESSING',
          'INCREASE_BUFFER_SIZE'
        ],
        maxConcurrentChanges: 2,
        rollbackOnFailure: true,
        stabilizationPeriod: 60000
      }
    );
  }

  /**
   * 创建高性能优化器
   */
  static createHighPerformance(memoryManager: MemoryManager): PerformanceOptimizer {
    return new PerformanceOptimizer(
      memoryManager,
      {
        throughput: { min: 500, target: 2000, max: 10000 },
        latency: { p95Max: 50, p99Max: 100, averageMax: 25 },
        memory: { heapUsageMax: 0.9, gcFrequencyMax: 5 },
        cpu: { usageMax: 0.9, loadAverageMax: 4.0 }
      },
      {
        enabled: true,
        aggressiveness: 'AGGRESSIVE',
        allowedActions: [
          'INCREASE_GC_FREQUENCY',
          'ENABLE_OBJECT_POOLING',
          'ENABLE_BATCH_PROCESSING',
          'REDUCE_CONCURRENCY',
          'INCREASE_BUFFER_SIZE'
        ],
        maxConcurrentChanges: 3,
        rollbackOnFailure: true,
        stabilizationPeriod: 30000
      }
    );
  }
}