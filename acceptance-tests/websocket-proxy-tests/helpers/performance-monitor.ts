/**
 * 性能监控工具
 * 用于测试过程中收集和分析性能指标
 */

import { EventEmitter } from 'events';

export interface PerformanceMetrics {
  timestamp: number;
  cpu: {
    user: number;
    system: number;
    percent: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    utilization: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
  connections: {
    active: number;
    total: number;
    errors: number;
  };
  latency: {
    min: number;
    max: number;
    avg: number;
    p95: number;
    p99: number;
    samples: number;
  };
}

export interface PerformanceThresholds {
  maxMemoryUsage: number; // MB
  maxCpuUsage: number; // %
  maxLatency: number; // ms
  minThroughput: number; // messages/second
  maxErrorRate: number; // %
}

export interface PerformanceAlert {
  type: 'memory' | 'cpu' | 'latency' | 'throughput' | 'error_rate';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetrics[] = [];
  private latencyStats: number[] = [];
  private networkStats = {
    bytesReceived: 0,
    bytesSent: 0,
    packetsReceived: 0,
    packetsSent: 0
  };
  private connectionStats = {
    active: 0,
    total: 0,
    errors: 0
  };
  private thresholds: PerformanceThresholds;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;
  private alerts: PerformanceAlert[] = [];

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    super();
    
    this.thresholds = {
      maxMemoryUsage: 512, // 512MB
      maxCpuUsage: 80, // 80%
      maxLatency: 50, // 50ms
      minThroughput: 100, // 100 msg/s
      maxErrorRate: 5, // 5%
      ...thresholds
    };
  }

  /**
   * 开始性能监控
   */
  startMonitoring(intervalMs: number = 1000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    this.emit('monitoringStarted');
  }

  /**
   * 停止性能监控
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.emit('monitoringStopped');
  }

  /**
   * 记录延迟数据
   */
  recordLatency(latency: number): void {
    this.latencyStats.push(latency);
    
    // 保持最近的1000个延迟样本
    if (this.latencyStats.length > 1000) {
      this.latencyStats.shift();
    }

    // 检查延迟阈值
    if (latency > this.thresholds.maxLatency) {
      this.triggerAlert('latency', 'warning', 
        `延迟过高: ${latency}ms (阈值: ${this.thresholds.maxLatency}ms)`, 
        latency, this.thresholds.maxLatency
      );
    }
  }

  /**
   * 更新网络统计
   */
  updateNetworkStats(bytesReceived: number = 0, bytesSent: number = 0, packetsReceived: number = 0, packetsSent: number = 0): void {
    this.networkStats.bytesReceived += bytesReceived;
    this.networkStats.bytesSent += bytesSent;
    this.networkStats.packetsReceived += packetsReceived;
    this.networkStats.packetsSent += packetsSent;
  }

  /**
   * 更新连接统计
   */
  updateConnectionStats(active: number, total?: number, errors?: number): void {
    this.connectionStats.active = active;
    if (total !== undefined) this.connectionStats.total = total;
    if (errors !== undefined) this.connectionStats.errors = errors;
  }

  /**
   * 获取当前性能指标
   */
  getCurrentMetrics(): PerformanceMetrics {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;

    return {
      timestamp: Date.now(),
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        percent: this.calculateCpuPercent(cpuUsage)
      },
      memory: {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        external: memoryUsage.external / 1024 / 1024,
        rss: memoryUsage.rss / 1024 / 1024,
        utilization: (heapUsedMB / heapTotalMB) * 100
      },
      network: { ...this.networkStats },
      connections: { ...this.connectionStats },
      latency: this.calculateLatencyStats()
    };
  }

  /**
   * 获取历史性能数据
   */
  getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * 获取性能摘要
   */
  getPerformanceSummary(): {
    duration: number;
    avgMemoryUsage: number;
    peakMemoryUsage: number;
    avgCpuUsage: number;
    peakCpuUsage: number;
    avgLatency: number;
    peakLatency: number;
    totalAlerts: number;
    criticalAlerts: number;
    throughput: number;
  } {
    if (this.metrics.length === 0) {
      return {
        duration: 0,
        avgMemoryUsage: 0,
        peakMemoryUsage: 0,
        avgCpuUsage: 0,
        peakCpuUsage: 0,
        avgLatency: 0,
        peakLatency: 0,
        totalAlerts: 0,
        criticalAlerts: 0,
        throughput: 0
      };
    }

    const firstMetric = this.metrics[0];
    const lastMetric = this.metrics[this.metrics.length - 1];
    const duration = lastMetric.timestamp - firstMetric.timestamp;

    const memoryUsages = this.metrics.map(m => m.memory.heapUsed);
    const cpuUsages = this.metrics.map(m => m.cpu.percent);
    const latencies = this.metrics.map(m => m.latency.avg).filter(l => l > 0);

    const totalMessages = this.networkStats.packetsReceived + this.networkStats.packetsSent;
    const throughput = duration > 0 ? (totalMessages / duration) * 1000 : 0;

    return {
      duration,
      avgMemoryUsage: this.calculateAverage(memoryUsages),
      peakMemoryUsage: Math.max(...memoryUsages),
      avgCpuUsage: this.calculateAverage(cpuUsages),
      peakCpuUsage: Math.max(...cpuUsages),
      avgLatency: this.calculateAverage(latencies),
      peakLatency: Math.max(...latencies, 0),
      totalAlerts: this.alerts.length,
      criticalAlerts: this.alerts.filter(a => a.severity === 'critical').length,
      throughput
    };
  }

  /**
   * 获取告警列表
   */
  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * 检查是否超过阈值
   */
  checkThresholds(): { passed: boolean; violations: string[] } {
    const current = this.getCurrentMetrics();
    const violations: string[] = [];

    // 检查内存使用
    if (current.memory.heapUsed > this.thresholds.maxMemoryUsage) {
      violations.push(`内存使用超过阈值: ${current.memory.heapUsed.toFixed(1)}MB > ${this.thresholds.maxMemoryUsage}MB`);
    }

    // 检查CPU使用
    if (current.cpu.percent > this.thresholds.maxCpuUsage) {
      violations.push(`CPU使用超过阈值: ${current.cpu.percent.toFixed(1)}% > ${this.thresholds.maxCpuUsage}%`);
    }

    // 检查延迟
    if (current.latency.avg > this.thresholds.maxLatency) {
      violations.push(`平均延迟超过阈值: ${current.latency.avg.toFixed(1)}ms > ${this.thresholds.maxLatency}ms`);
    }

    return {
      passed: violations.length === 0,
      violations
    };
  }

  /**
   * 生成性能报告
   */
  generateReport(): {
    summary: ReturnType<PerformanceMonitor['getPerformanceSummary']>;
    metrics: PerformanceMetrics[];
    alerts: PerformanceAlert[];
    thresholds: PerformanceThresholds;
    violations: string[];
  } {
    const summary = this.getPerformanceSummary();
    const thresholdCheck = this.checkThresholds();

    return {
      summary,
      metrics: this.getMetricsHistory(),
      alerts: this.getAlerts(),
      thresholds: this.thresholds,
      violations: thresholdCheck.violations
    };
  }

  /**
   * 重置所有统计数据
   */
  reset(): void {
    this.metrics = [];
    this.latencyStats = [];
    this.networkStats = {
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0
    };
    this.connectionStats = {
      active: 0,
      total: 0,
      errors: 0
    };
    this.alerts = [];
    this.emit('reset');
  }

  /**
   * 收集性能指标
   */
  private collectMetrics(): void {
    const metrics = this.getCurrentMetrics();
    this.metrics.push(metrics);

    // 保持最近的1000个指标样本
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }

    // 检查阈值并触发告警
    this.checkAndTriggerAlerts(metrics);

    this.emit('metricsCollected', metrics);
  }

  /**
   * 检查并触发告警
   */
  private checkAndTriggerAlerts(metrics: PerformanceMetrics): void {
    // 内存告警
    if (metrics.memory.heapUsed > this.thresholds.maxMemoryUsage) {
      const severity = metrics.memory.heapUsed > this.thresholds.maxMemoryUsage * 1.5 ? 'critical' : 'warning';
      this.triggerAlert('memory', severity,
        `内存使用过高: ${metrics.memory.heapUsed.toFixed(1)}MB`,
        metrics.memory.heapUsed, this.thresholds.maxMemoryUsage
      );
    }

    // CPU告警
    if (metrics.cpu.percent > this.thresholds.maxCpuUsage) {
      const severity = metrics.cpu.percent > this.thresholds.maxCpuUsage * 1.2 ? 'critical' : 'warning';
      this.triggerAlert('cpu', severity,
        `CPU使用过高: ${metrics.cpu.percent.toFixed(1)}%`,
        metrics.cpu.percent, this.thresholds.maxCpuUsage
      );
    }

    // 错误率告警
    const errorRate = this.connectionStats.total > 0 
      ? (this.connectionStats.errors / this.connectionStats.total) * 100 
      : 0;
    
    if (errorRate > this.thresholds.maxErrorRate) {
      this.triggerAlert('error_rate', 'critical',
        `错误率过高: ${errorRate.toFixed(1)}%`,
        errorRate, this.thresholds.maxErrorRate
      );
    }
  }

  /**
   * 触发告警
   */
  private triggerAlert(
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    message: string,
    value: number,
    threshold: number
  ): void {
    const alert: PerformanceAlert = {
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: Date.now()
    };

    this.alerts.push(alert);
    
    // 保持最近的100个告警
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    this.emit('alert', alert);
  }

  /**
   * 计算CPU使用率
   */
  private calculateCpuPercent(cpuUsage: NodeJS.CpuUsage): number {
    // 这是一个简化的CPU计算，实际应用中可能需要更复杂的逻辑
    const totalTime = cpuUsage.user + cpuUsage.system;
    return Math.min(100, (totalTime / 1000000) * 100); // 转换为百分比
  }

  /**
   * 计算延迟统计
   */
  private calculateLatencyStats(): PerformanceMetrics['latency'] {
    if (this.latencyStats.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p95: 0,
        p99: 0,
        samples: 0
      };
    }

    const sorted = [...this.latencyStats].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
      samples: sorted.length
    };
  }

  /**
   * 计算平均值
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }
}

/**
 * 性能基准测试工具
 */
export class PerformanceBenchmark {
  private startTime: number = 0;
  private endTime: number = 0;
  private operations: number = 0;
  private errors: number = 0;
  private monitor: PerformanceMonitor;

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    this.monitor = new PerformanceMonitor(thresholds);
  }

  /**
   * 开始基准测试
   */
  start(): void {
    this.startTime = Date.now();
    this.operations = 0;
    this.errors = 0;
    this.monitor.reset();
    this.monitor.startMonitoring(1000);
  }

  /**
   * 结束基准测试
   */
  end(): {
    duration: number;
    operations: number;
    errors: number;
    throughput: number;
    errorRate: number;
    performanceReport: ReturnType<PerformanceMonitor['generateReport']>;
  } {
    this.endTime = Date.now();
    this.monitor.stopMonitoring();

    const duration = this.endTime - this.startTime;
    const throughput = duration > 0 ? (this.operations / duration) * 1000 : 0;
    const errorRate = this.operations > 0 ? (this.errors / this.operations) * 100 : 0;

    return {
      duration,
      operations: this.operations,
      errors: this.errors,
      throughput,
      errorRate,
      performanceReport: this.monitor.generateReport()
    };
  }

  /**
   * 记录一次操作
   */
  recordOperation(success: boolean = true, latency?: number): void {
    this.operations++;
    if (!success) {
      this.errors++;
    }
    if (latency !== undefined) {
      this.monitor.recordLatency(latency);
    }
  }

  /**
   * 更新连接统计
   */
  updateConnectionStats(active: number, total?: number, errors?: number): void {
    this.monitor.updateConnectionStats(active, total, errors);
  }

  /**
   * 获取性能监控器
   */
  getMonitor(): PerformanceMonitor {
    return this.monitor;
  }
}