/**
 * 性能监控工具
 * 用于测试过程中监控和分析性能指标
 */

export interface PerformanceMetrics {
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  throughput: {
    current: number; // 当前吞吐量（messages/second）
    peak: number;    // 峰值吞吐量
    average: number; // 平均吞吐量
  };
  memory: {
    initial: number;  // 初始内存使用（bytes）
    current: number;  // 当前内存使用
    peak: number;     // 峰值内存使用
    growth: number;   // 内存增长
  };
  cpu: {
    usage: number;    // CPU使用率（百分比）
    peak: number;     // 峰值CPU使用率
  };
  errors: {
    total: number;    // 错误总数
    rate: number;     // 错误率（errors/second）
    types: Record<string, number>; // 按类型分类的错误数
  };
  connections: {
    active: number;   // 活跃连接数
    peak: number;     // 峰值连接数
    failed: number;   // 失败连接数
  };
}

export interface PerformanceBenchmark {
  name: string;
  target: number;
  actual: number;
  passed: boolean;
  improvement?: number; // 相对于基准的改进百分比
}

export class PerformanceMonitor {
  private startTime: number = 0;
  private samples: Array<{
    timestamp: number;
    memory: NodeJS.MemoryUsage;
    messageCount: number;
    errorCount: number;
    connectionCount: number;
  }> = [];
  
  private latencySamples: number[] = [];
  private errorCounts: Record<string, number> = {};
  private messageCount: number = 0;
  private errorCount: number = 0;
  private connectionCount: number = 0;
  private isMonitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;

  /**
   * 开始性能监控
   */
  startMonitoring(sampleInterval: number = 1000): void {
    if (this.isMonitoring) {
      throw new Error('监控已在运行中');
    }

    this.startTime = Date.now();
    this.isMonitoring = true;
    
    // 记录初始状态
    this.recordSample();
    
    // 定期采样
    this.monitoringInterval = setInterval(() => {
      this.recordSample();
    }, sampleInterval);
  }

  /**
   * 停止性能监控
   */
  stopMonitoring(): PerformanceMetrics {
    if (!this.isMonitoring) {
      throw new Error('监控未在运行');
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // 记录最终状态
    this.recordSample();
    
    return this.getMetrics();
  }

  /**
   * 记录延迟样本
   */
  recordLatency(latency: number): void {
    this.latencySamples.push(latency);
  }

  /**
   * 记录消息处理
   */
  recordMessage(): void {
    this.messageCount++;
  }

  /**
   * 记录错误
   */
  recordError(errorType: string = 'unknown'): void {
    this.errorCount++;
    this.errorCounts[errorType] = (this.errorCounts[errorType] || 0) + 1;
  }

  /**
   * 记录连接数变化
   */
  recordConnectionChange(count: number): void {
    this.connectionCount = count;
  }

  /**
   * 获取当前性能指标
   */
  getMetrics(): PerformanceMetrics {
    const duration = (Date.now() - this.startTime) / 1000; // 秒
    const memoryUsages = this.samples.map(s => s.memory.heapUsed);
    const initialMemory = memoryUsages[0] || 0;
    const currentMemory = memoryUsages[memoryUsages.length - 1] || 0;
    const peakMemory = Math.max(...memoryUsages);

    return {
      latency: this.calculateLatencyStats(),
      throughput: {
        current: duration > 0 ? this.messageCount / duration : 0,
        peak: this.calculatePeakThroughput(),
        average: duration > 0 ? this.messageCount / duration : 0
      },
      memory: {
        initial: initialMemory,
        current: currentMemory,
        peak: peakMemory,
        growth: currentMemory - initialMemory
      },
      cpu: {
        usage: this.calculateCurrentCpuUsage(),
        peak: this.calculatePeakCpuUsage()
      },
      errors: {
        total: this.errorCount,
        rate: duration > 0 ? this.errorCount / duration : 0,
        types: { ...this.errorCounts }
      },
      connections: {
        active: this.connectionCount,
        peak: Math.max(...this.samples.map(s => s.connectionCount), 0),
        failed: this.errorCounts['connection'] || 0
      }
    };
  }

  /**
   * 计算延迟统计
   */
  private calculateLatencyStats() {
    if (this.latencySamples.length === 0) {
      return {
        min: 0, max: 0, avg: 0,
        p50: 0, p90: 0, p95: 0, p99: 0
      };
    }

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      min: sorted[0],
      max: sorted[len - 1],
      avg: sorted.reduce((sum, val) => sum + val, 0) / len,
      p50: sorted[Math.floor(len * 0.5)],
      p90: sorted[Math.floor(len * 0.9)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)]
    };
  }

  /**
   * 计算峰值吞吐量
   */
  private calculatePeakThroughput(): number {
    if (this.samples.length < 2) return 0;

    let peakThroughput = 0;
    
    for (let i = 1; i < this.samples.length; i++) {
      const prev = this.samples[i - 1];
      const curr = this.samples[i];
      
      const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // 秒
      const messageDiff = curr.messageCount - prev.messageCount;
      
      if (timeDiff > 0) {
        const throughput = messageDiff / timeDiff;
        peakThroughput = Math.max(peakThroughput, throughput);
      }
    }
    
    return peakThroughput;
  }

  /**
   * 计算当前CPU使用率（简化实现）
   */
  private calculateCurrentCpuUsage(): number {
    // 在测试环境中，这是一个简化的实现
    // 实际生产中可能需要更复杂的CPU监控
    const usage = process.cpuUsage();
    return (usage.user + usage.system) / 1000000; // 转换为毫秒
  }

  /**
   * 计算峰值CPU使用率
   */
  private calculatePeakCpuUsage(): number {
    // 简化实现，返回当前使用率的1.5倍作为估计
    return this.calculateCurrentCpuUsage() * 1.5;
  }

  /**
   * 记录性能样本
   */
  private recordSample(): void {
    this.samples.push({
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      messageCount: this.messageCount,
      errorCount: this.errorCount,
      connectionCount: this.connectionCount
    });
  }

  /**
   * 比较性能基准
   */
  static compareBenchmarks(
    beforeMetrics: PerformanceMetrics,
    afterMetrics: PerformanceMetrics,
    targets: {
      memoryReduction?: number; // 内存减少目标百分比
      throughputImprovement?: number; // 吞吐量提升目标百分比
      latencyReduction?: number; // 延迟降低目标百分比
    }
  ): PerformanceBenchmark[] {
    const benchmarks: PerformanceBenchmark[] = [];

    // 内存使用对比
    if (targets.memoryReduction !== undefined) {
      const memoryReduction = (beforeMetrics.memory.peak - afterMetrics.memory.peak) / beforeMetrics.memory.peak;
      benchmarks.push({
        name: '内存使用减少',
        target: targets.memoryReduction,
        actual: memoryReduction,
        passed: memoryReduction >= targets.memoryReduction,
        improvement: memoryReduction
      });
    }

    // 吞吐量对比
    if (targets.throughputImprovement !== undefined) {
      const throughputImprovement = (afterMetrics.throughput.peak - beforeMetrics.throughput.peak) / beforeMetrics.throughput.peak;
      benchmarks.push({
        name: '吞吐量提升',
        target: targets.throughputImprovement,
        actual: throughputImprovement,
        passed: throughputImprovement >= targets.throughputImprovement,
        improvement: throughputImprovement
      });
    }

    // 延迟对比
    if (targets.latencyReduction !== undefined) {
      const latencyReduction = (beforeMetrics.latency.avg - afterMetrics.latency.avg) / beforeMetrics.latency.avg;
      benchmarks.push({
        name: '平均延迟降低',
        target: targets.latencyReduction,
        actual: latencyReduction,
        passed: latencyReduction >= targets.latencyReduction,
        improvement: latencyReduction
      });
    }

    return benchmarks;
  }

  /**
   * 生成性能报告
   */
  generateReport(metrics: PerformanceMetrics): string {
    const duration = (Date.now() - this.startTime) / 1000;
    
    return `
性能监控报告
============

监控时长: ${duration.toFixed(2)}秒
消息处理总数: ${this.messageCount}

延迟统计:
- 平均延迟: ${metrics.latency.avg.toFixed(2)}ms
- P95延迟: ${metrics.latency.p95.toFixed(2)}ms
- P99延迟: ${metrics.latency.p99.toFixed(2)}ms
- 最大延迟: ${metrics.latency.max.toFixed(2)}ms

吞吐量:
- 平均吞吐量: ${metrics.throughput.average.toFixed(2)} msg/s
- 峰值吞吐量: ${metrics.throughput.peak.toFixed(2)} msg/s

内存使用:
- 初始内存: ${(metrics.memory.initial / 1024 / 1024).toFixed(2)}MB
- 当前内存: ${(metrics.memory.current / 1024 / 1024).toFixed(2)}MB
- 峰值内存: ${(metrics.memory.peak / 1024 / 1024).toFixed(2)}MB
- 内存增长: ${(metrics.memory.growth / 1024 / 1024).toFixed(2)}MB

错误统计:
- 错误总数: ${metrics.errors.total}
- 错误率: ${metrics.errors.rate.toFixed(4)} errors/s
- 错误类型分布: ${JSON.stringify(metrics.errors.types, null, 2)}

连接统计:
- 当前连接数: ${metrics.connections.active}
- 峰值连接数: ${metrics.connections.peak}
- 失败连接数: ${metrics.connections.failed}
`;
  }

  /**
   * 重置监控数据
   */
  reset(): void {
    if (this.isMonitoring) {
      throw new Error('无法在监控运行时重置数据');
    }

    this.samples = [];
    this.latencySamples = [];
    this.errorCounts = {};
    this.messageCount = 0;
    this.errorCount = 0;
    this.connectionCount = 0;
    this.startTime = 0;
  }

  /**
   * 导出性能数据
   */
  exportData(): {
    samples: typeof this.samples;
    latencySamples: number[];
    summary: PerformanceMetrics;
  } {
    return {
      samples: [...this.samples],
      latencySamples: [...this.latencySamples],
      summary: this.getMetrics()
    };
  }

  /**
   * 创建性能快照
   */
  createSnapshot(name: string): {
    name: string;
    timestamp: number;
    metrics: PerformanceMetrics;
  } {
    return {
      name,
      timestamp: Date.now(),
      metrics: this.getMetrics()
    };
  }
}