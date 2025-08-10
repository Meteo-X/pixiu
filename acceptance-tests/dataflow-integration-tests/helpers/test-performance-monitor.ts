/**
 * 测试性能监控工具
 * 用于测试期间的性能指标收集和分析
 */

import { EventEmitter } from 'events';

export interface PerformanceSnapshot {
  timestamp: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  processTime: number;
  activeHandles: number;
  activeRequests: number;
}

export interface PerformanceReport {
  testName: string;
  duration: number;
  snapshots: PerformanceSnapshot[];
  metrics: {
    memoryUsage: {
      initial: number;
      peak: number;
      final: number;
      growth: number;
    };
    cpuUsage: {
      average: number;
      peak: number;
    };
    handles: {
      initial: number;
      peak: number;
      final: number;
      leaked: number;
    };
  };
  warnings: string[];
  recommendations: string[];
}

/**
 * 测试性能监控器
 */
export class TestPerformanceMonitor extends EventEmitter {
  private snapshots: PerformanceSnapshot[] = [];
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private testName = '';
  private startTime = 0;

  /**
   * 开始性能监控
   */
  start(testName: string, interval = 100): void {
    if (this.isMonitoring) {
      this.stop();
    }

    this.testName = testName;
    this.startTime = Date.now();
    this.snapshots = [];
    this.isMonitoring = true;

    // 立即拍摄一次快照
    this.takeSnapshot();

    // 定期拍摄性能快照
    this.monitoringInterval = setInterval(() => {
      this.takeSnapshot();
    }, interval);

    this.emit('started', { testName, interval });
  }

  /**
   * 停止性能监控并生成报告
   */
  stop(): PerformanceReport {
    if (!this.isMonitoring) {
      throw new Error('性能监控未启动');
    }

    // 最后拍摄一次快照
    this.takeSnapshot();

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.isMonitoring = false;
    const duration = Date.now() - this.startTime;

    const report = this.generateReport(duration);
    this.emit('stopped', report);

    return report;
  }

  /**
   * 手动拍摄性能快照
   */
  takeSnapshot(): PerformanceSnapshot {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      processTime: process.uptime(),
      activeHandles: (process as any)._getActiveHandles?.()?.length || 0,
      activeRequests: (process as any)._getActiveRequests?.()?.length || 0
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * 获取当前内存使用量（MB）
   */
  getCurrentMemoryMB(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / (1024 * 1024);
  }

  /**
   * 检查内存泄漏
   */
  checkMemoryLeak(thresholdMB = 50): boolean {
    if (this.snapshots.length < 2) {
      return false;
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const growthMB = (last.memory.heapUsed - first.memory.heapUsed) / (1024 * 1024);

    return growthMB > thresholdMB;
  }

  /**
   * 获取性能统计
   */
  getStats() {
    if (this.snapshots.length === 0) {
      return null;
    }

    const memoryUsages = this.snapshots.map(s => s.memory.heapUsed);
    const cpuUsages = this.snapshots.map(s => s.cpu.user + s.cpu.system);
    const handles = this.snapshots.map(s => s.activeHandles);

    return {
      memory: {
        current: memoryUsages[memoryUsages.length - 1] / (1024 * 1024),
        peak: Math.max(...memoryUsages) / (1024 * 1024),
        average: (memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length) / (1024 * 1024),
        growth: (memoryUsages[memoryUsages.length - 1] - memoryUsages[0]) / (1024 * 1024)
      },
      cpu: {
        peak: Math.max(...cpuUsages),
        average: cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length
      },
      handles: {
        current: handles[handles.length - 1],
        peak: Math.max(...handles),
        average: handles.reduce((a, b) => a + b, 0) / handles.length
      },
      snapshots: this.snapshots.length,
      duration: this.snapshots.length > 0 ? 
        this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp : 0
    };
  }

  /**
   * 生成性能报告
   */
  private generateReport(duration: number): PerformanceReport {
    if (this.snapshots.length === 0) {
      throw new Error('没有性能快照数据');
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    const memoryUsages = this.snapshots.map(s => s.memory.heapUsed);
    const cpuUsages = this.snapshots.map((s, i) => {
      if (i === 0) return 0;
      const prev = this.snapshots[i - 1];
      return ((s.cpu.user - prev.cpu.user) + (s.cpu.system - prev.cpu.system)) / 1000000; // 转换为秒
    }).filter(cpu => cpu > 0);

    const handles = this.snapshots.map(s => s.activeHandles);

    const metrics = {
      memoryUsage: {
        initial: first.memory.heapUsed / (1024 * 1024),
        peak: Math.max(...memoryUsages) / (1024 * 1024),
        final: last.memory.heapUsed / (1024 * 1024),
        growth: (last.memory.heapUsed - first.memory.heapUsed) / (1024 * 1024)
      },
      cpuUsage: {
        average: cpuUsages.length > 0 ? cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length : 0,
        peak: cpuUsages.length > 0 ? Math.max(...cpuUsages) : 0
      },
      handles: {
        initial: first.activeHandles,
        peak: Math.max(...handles),
        final: last.activeHandles,
        leaked: last.activeHandles - first.activeHandles
      }
    };

    const warnings: string[] = [];
    const recommendations: string[] = [];

    // 分析潜在问题
    if (metrics.memoryUsage.growth > 50) {
      warnings.push(`内存增长过多: ${metrics.memoryUsage.growth.toFixed(2)}MB`);
      recommendations.push('检查是否存在内存泄漏，确保及时清理资源');
    }

    if (metrics.handles.leaked > 10) {
      warnings.push(`句柄泄漏: ${metrics.handles.leaked}个未关闭的句柄`);
      recommendations.push('确保所有异步资源都被正确关闭');
    }

    if (metrics.cpuUsage.peak > 0.8) {
      warnings.push(`CPU使用率过高: ${(metrics.cpuUsage.peak * 100).toFixed(1)}%`);
      recommendations.push('优化算法复杂度或考虑异步处理');
    }

    if (metrics.memoryUsage.peak > 200) {
      warnings.push(`内存使用峰值过高: ${metrics.memoryUsage.peak.toFixed(2)}MB`);
      recommendations.push('考虑使用流处理或分批处理大量数据');
    }

    return {
      testName: this.testName,
      duration,
      snapshots: [...this.snapshots],
      metrics,
      warnings,
      recommendations
    };
  }

  /**
   * 强制垃圾回收（如果可用）
   */
  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * 重置监控器状态
   */
  reset(): void {
    if (this.isMonitoring) {
      this.stop();
    }
    this.snapshots = [];
    this.testName = '';
    this.startTime = 0;
  }
}

/**
 * 性能基准测试工具
 */
export class PerformanceBenchmark {
  private measurements: Array<{ name: string; duration: number; metadata?: any }> = [];

  /**
   * 测量函数执行时间
   */
  async measure<T>(name: string, fn: () => Promise<T> | T, metadata?: any): Promise<T> {
    const startTime = process.hrtime.bigint();
    
    try {
      const result = await fn();
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒
      
      this.measurements.push({ name, duration, metadata });
      return result;
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;
      
      this.measurements.push({ 
        name: `${name} (error)`, 
        duration, 
        metadata: { ...metadata, error: error.message } 
      });
      
      throw error;
    }
  }

  /**
   * 批量测量多个操作
   */
  async measureBatch<T>(
    operations: Array<{ name: string; fn: () => Promise<T> | T; metadata?: any }>
  ): Promise<T[]> {
    const results = [];
    
    for (const op of operations) {
      const result = await this.measure(op.name, op.fn, op.metadata);
      results.push(result);
    }
    
    return results;
  }

  /**
   * 并发测量多个操作
   */
  async measureConcurrent<T>(
    operations: Array<{ name: string; fn: () => Promise<T> | T; metadata?: any }>
  ): Promise<T[]> {
    const promises = operations.map(op => this.measure(op.name, op.fn, op.metadata));
    return Promise.all(promises);
  }

  /**
   * 获取测量结果
   */
  getResults() {
    return [...this.measurements];
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    if (this.measurements.length === 0) {
      return null;
    }

    const durations = this.measurements.map(m => m.duration);
    const sorted = durations.slice().sort((a, b) => a - b);

    return {
      count: this.measurements.length,
      total: durations.reduce((a, b) => a + b, 0),
      average: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * 清除所有测量结果
   */
  clear(): void {
    this.measurements = [];
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    const stats = this.getStatistics();
    if (!stats) {
      return '没有测量数据';
    }

    let report = `\n📊 性能基准报告\n`;
    report += `===================\n`;
    report += `测量次数: ${stats.count}\n`;
    report += `总时间: ${stats.total.toFixed(2)}ms\n`;
    report += `平均时间: ${stats.average.toFixed(2)}ms\n`;
    report += `最小时间: ${stats.min.toFixed(2)}ms\n`;
    report += `最大时间: ${stats.max.toFixed(2)}ms\n`;
    report += `50分位数: ${stats.p50.toFixed(2)}ms\n`;
    report += `95分位数: ${stats.p95.toFixed(2)}ms\n`;
    report += `99分位数: ${stats.p99.toFixed(2)}ms\n`;
    
    report += `\n详细测量结果:\n`;
    this.measurements.forEach((m, i) => {
      report += `${i + 1}. ${m.name}: ${m.duration.toFixed(2)}ms\n`;
      if (m.metadata) {
        report += `   元数据: ${JSON.stringify(m.metadata)}\n`;
      }
    });

    return report;
  }
}