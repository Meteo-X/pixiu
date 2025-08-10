/**
 * 性能监控核心工具
 * 提供实时性能指标收集、分析和报告功能
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import * as pidusage from 'pidusage';
import { recordMetric, TEST_CONFIG } from '../setup';

export interface PerformanceSnapshot {
  timestamp: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  cpu: {
    usage: number;
    elapsed: number;
  };
  custom: Record<string, number>;
}

export interface ThroughputMetrics {
  messagesProcessed: number;
  startTime: number;
  endTime: number;
  messagesPerSecond: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
}

export class PerformanceMonitor extends EventEmitter {
  private isMonitoring = false;
  private snapshots: PerformanceSnapshot[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private startTime = 0;
  private messageCount = 0;
  private latencyMeasurements: number[] = [];
  
  constructor(private samplingInterval = TEST_CONFIG.SAMPLING_INTERVAL.NORMAL) {
    super();
  }

  /**
   * 开始性能监控
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      throw new Error('性能监控已经在运行中');
    }

    this.isMonitoring = true;
    this.startTime = performance.now();
    this.snapshots = [];
    this.messageCount = 0;
    this.latencyMeasurements = [];

    console.log('🚀 开始性能监控...');
    
    this.monitoringInterval = setInterval(async () => {
      await this.captureSnapshot();
    }, this.samplingInterval);

    // 记录开始时间
    performance.mark('monitoring-start');
    recordMetric('monitoring-started', Date.now());
  }

  /**
   * 停止性能监控
   */
  async stopMonitoring(): Promise<PerformanceSnapshot[]> {
    if (!this.isMonitoring) {
      throw new Error('性能监控未在运行中');
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // 最后一次快照
    await this.captureSnapshot();
    
    performance.mark('monitoring-end');
    performance.measure('monitoring-duration', 'monitoring-start', 'monitoring-end');
    
    const totalDuration = performance.now() - this.startTime;
    recordMetric('monitoring-stopped', Date.now());
    recordMetric('total-monitoring-duration', totalDuration);

    console.log(`✅ 性能监控已停止，采集了 ${this.snapshots.length} 个快照`);
    
    return this.snapshots;
  }

  /**
   * 捕获性能快照
   */
  private async captureSnapshot(): Promise<PerformanceSnapshot> {
    const timestamp = performance.now();
    const memoryUsage = process.memoryUsage();
    
    let cpuUsage = { usage: 0, elapsed: 0 };
    try {
      const stats = await pidusage(process.pid);
      cpuUsage = { usage: stats.cpu, elapsed: stats.elapsed };
    } catch (error) {
      console.warn('获取CPU使用率失败:', error);
    }

    const snapshot: PerformanceSnapshot = {
      timestamp,
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
        external: memoryUsage.external
      },
      cpu: cpuUsage,
      custom: {}
    };

    this.snapshots.push(snapshot);
    this.emit('snapshot', snapshot);

    return snapshot;
  }

  /**
   * 记录消息处理延迟
   */
  recordMessageLatency(latencyMs: number): void {
    this.latencyMeasurements.push(latencyMs);
    this.messageCount++;
    
    recordMetric('message-latency', latencyMs);
    recordMetric('message-processed', this.messageCount);
  }

  /**
   * 获取吞吐量指标
   */
  getThroughputMetrics(): ThroughputMetrics {
    const endTime = performance.now();
    const durationSeconds = (endTime - this.startTime) / 1000;
    
    const sortedLatencies = [...this.latencyMeasurements].sort((a, b) => a - b);
    const averageLatency = sortedLatencies.length > 0 
      ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length 
      : 0;
    
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);
    
    return {
      messagesProcessed: this.messageCount,
      startTime: this.startTime,
      endTime,
      messagesPerSecond: durationSeconds > 0 ? this.messageCount / durationSeconds : 0,
      averageLatency,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0
    };
  }

  /**
   * 获取内存使用统计
   */
  getMemoryStats(): {
    peak: number;
    average: number;
    current: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  } {
    if (this.snapshots.length === 0) {
      const current = process.memoryUsage().heapUsed;
      return { peak: current, average: current, current, trend: 'stable' };
    }

    const memoryValues = this.snapshots.map(s => s.memory.heapUsed);
    const peak = Math.max(...memoryValues);
    const average = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;
    const current = memoryValues[memoryValues.length - 1];
    
    // 计算趋势 - 比较最近25%的数据点
    const recentCount = Math.max(1, Math.floor(memoryValues.length * 0.25));
    const recentValues = memoryValues.slice(-recentCount);
    const earlierValues = memoryValues.slice(0, recentCount);
    
    const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const earlierAvg = earlierValues.reduce((a, b) => a + b, 0) / earlierValues.length;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    const changePercent = (recentAvg - earlierAvg) / earlierAvg;
    
    if (changePercent > 0.05) trend = 'increasing';
    else if (changePercent < -0.05) trend = 'decreasing';

    return { peak, average, current, trend };
  }

  /**
   * 获取性能报告
   */
  generateReport(): {
    monitoring: {
      duration: number;
      samplesCollected: number;
      samplingInterval: number;
    };
    memory: ReturnType<PerformanceMonitor['getMemoryStats']>;
    throughput: ThroughputMetrics;
    cpu: {
      average: number;
      peak: number;
    };
  } {
    const throughput = this.getThroughputMetrics();
    const memory = this.getMemoryStats();
    
    const cpuValues = this.snapshots.map(s => s.cpu.usage);
    const avgCpu = cpuValues.length > 0 ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : 0;
    const peakCpu = cpuValues.length > 0 ? Math.max(...cpuValues) : 0;

    return {
      monitoring: {
        duration: throughput.endTime - throughput.startTime,
        samplesCollected: this.snapshots.length,
        samplingInterval: this.samplingInterval
      },
      memory,
      throughput,
      cpu: {
        average: avgCpu,
        peak: peakCpu
      }
    };
  }

  /**
   * 重置监控数据
   */
  reset(): void {
    this.snapshots = [];
    this.messageCount = 0;
    this.latencyMeasurements = [];
  }

  /**
   * 获取实时性能指标
   */
  getCurrentMetrics(): {
    memoryMB: number;
    messagesPerSecond: number;
    averageLatencyMs: number;
    cpuUsage: number;
  } {
    const throughput = this.getThroughputMetrics();
    const latestSnapshot = this.snapshots[this.snapshots.length - 1];
    
    return {
      memoryMB: latestSnapshot ? latestSnapshot.memory.heapUsed / (1024 * 1024) : 0,
      messagesPerSecond: throughput.messagesPerSecond,
      averageLatencyMs: throughput.averageLatency,
      cpuUsage: latestSnapshot ? latestSnapshot.cpu.usage : 0
    };
  }
}