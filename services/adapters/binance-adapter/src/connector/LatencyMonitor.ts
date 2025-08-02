/**
 * 延迟监控器
 * 
 * 功能：
 * - 实时延迟计算
 * - 延迟分布统计
 * - 性能基准比较
 * - 延迟异常检测
 */

import { EventEmitter } from 'events';

// 延迟类型
export enum LatencyType {
  NETWORK = 'network',           // 网络延迟
  PROCESSING = 'processing',     // 处理延迟
  END_TO_END = 'end_to_end',    // 端到端延迟
  HEARTBEAT = 'heartbeat',       // 心跳延迟
  SUBSCRIPTION = 'subscription'   // 订阅延迟
}

// 延迟测量点
export interface LatencyMeasurement {
  type: LatencyType;
  value: number;        // 延迟值 (ms)
  timestamp: number;    // 测量时间戳
  source?: string;      // 数据源标识
  metadata?: Record<string, any>;
}

// 延迟统计信息
export interface LatencyStats {
  type: LatencyType;
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p90: number;
  p95: number;
  p99: number;
  standardDeviation: number;
  variance: number;
}

// 延迟分布桶
export interface LatencyBucket {
  range: string;        // 例如: "0-10ms"
  lowerBound: number;
  upperBound: number;
  count: number;
  percentage: number;
}

// 延迟趋势
export interface LatencyTrend {
  period: string;       // 时间段
  averageLatency: number;
  trendDirection: 'improving' | 'degrading' | 'stable';
  changePercentage: number;
}

// 延迟告警
export interface LatencyAlert {
  type: LatencyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

// 延迟监控配置
export interface LatencyMonitorConfig {
  // 采样配置
  sampling: {
    maxSamples: number;     // 最大样本数
    windowSize: number;     // 统计窗口大小 (ms)
    sampleInterval: number; // 采样间隔 (ms)
  };
  
  // 分桶配置
  buckets: {
    boundaries: number[];   // 分桶边界 (ms)
  };
  
  // 告警阈值
  thresholds: {
    [key in LatencyType]: {
      warning: number;      // 警告阈值 (ms)
      critical: number;     // 严重阈值 (ms)
      p95Warning: number;   // P95警告阈值 (ms)
      p99Critical: number;  // P99严重阈值 (ms)
    };
  };
  
  // 趋势分析
  trend: {
    enabled: boolean;
    windowCount: number;    // 趋势分析窗口数量
    significantChange: number; // 显著变化阈值 (%)
  };
  
  // 基准测试
  baseline: {
    enabled: boolean;
    targetLatency: Record<LatencyType, number>; // 目标延迟
    acceptableDeviation: number; // 可接受偏差 (%)
  };
}

export class LatencyMonitor extends EventEmitter {
  private config: LatencyMonitorConfig;
  private measurements: Map<LatencyType, LatencyMeasurement[]> = new Map();
  private stats: Map<LatencyType, LatencyStats> = new Map();
  private buckets: Map<LatencyType, LatencyBucket[]> = new Map();
  private trends: Map<LatencyType, LatencyTrend[]> = new Map();
  
  // 实时统计
  private currentWindow: Map<LatencyType, LatencyMeasurement[]> = new Map();
  private lastStatsUpdate = 0;
  private statsUpdateTimer: NodeJS.Timeout | null = null;

  constructor(config: LatencyMonitorConfig) {
    super();
    this.config = config;
    this.initializeDataStructures();
    this.startStatsUpdater();
  }

  /**
   * 初始化数据结构
   */
  private initializeDataStructures(): void {
    Object.values(LatencyType).forEach(type => {
      this.measurements.set(type, []);
      this.currentWindow.set(type, []);
      this.buckets.set(type, this.createEmptyBuckets());
      this.trends.set(type, []);
    });
  }

  /**
   * 记录延迟测量
   */
  public recordLatency(measurement: LatencyMeasurement): void {
    const { type, value, timestamp } = measurement;
    
    // 验证输入
    if (value < 0 || !Number.isFinite(value)) {
      this.emit('invalid_measurement', { measurement });
      return;
    }

    // 添加到当前窗口
    const currentMeasurements = this.currentWindow.get(type) || [];
    currentMeasurements.push(measurement);
    
    // 限制窗口大小
    if (currentMeasurements.length > this.config.sampling.maxSamples) {
      currentMeasurements.shift();
    }
    
    this.currentWindow.set(type, currentMeasurements);

    // 添加到历史记录
    const allMeasurements = this.measurements.get(type) || [];
    allMeasurements.push(measurement);
    
    // 清理过期数据
    const cutoff = timestamp - this.config.sampling.windowSize;
    const validMeasurements = allMeasurements.filter(m => m.timestamp > cutoff);
    this.measurements.set(type, validMeasurements);

    // 检查告警
    this.checkThresholds(type, value);

    // 发射事件
    this.emit('latency_recorded', measurement);
  }

  /**
   * 记录网络延迟
   */
  public recordNetworkLatency(latency: number, source?: string, metadata?: Record<string, any>): void {
    this.recordLatency({
      type: LatencyType.NETWORK,
      value: latency,
      timestamp: Date.now(),
      source,
      metadata
    });
  }

  /**
   * 记录处理延迟
   */
  public recordProcessingLatency(latency: number, source?: string, metadata?: Record<string, any>): void {
    this.recordLatency({
      type: LatencyType.PROCESSING,
      value: latency,
      timestamp: Date.now(),
      source,
      metadata
    });
  }

  /**
   * 记录端到端延迟
   */
  public recordEndToEndLatency(latency: number, source?: string, metadata?: Record<string, any>): void {
    this.recordLatency({
      type: LatencyType.END_TO_END,
      value: latency,
      timestamp: Date.now(),
      source,
      metadata
    });
  }

  /**
   * 计算延迟统计
   */
  private calculateStats(type: LatencyType): LatencyStats {
    const measurements = this.measurements.get(type) || [];
    
    if (measurements.length === 0) {
      return {
        type,
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        standardDeviation: 0,
        variance: 0
      };
    }

    const values = measurements.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / count;

    // 计算方差和标准差
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
    const standardDeviation = Math.sqrt(variance);

    // 计算百分位数
    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * count) - 1;
      return values[Math.max(0, Math.min(index, count - 1))];
    };

    return {
      type,
      count,
      sum,
      min: values[0],
      max: values[count - 1],
      mean,
      median: percentile(50),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      standardDeviation,
      variance
    };
  }

  /**
   * 更新分桶统计
   */
  private updateBuckets(type: LatencyType): void {
    const measurements = this.measurements.get(type) || [];
    const boundaries = this.config.buckets.boundaries;
    const buckets: LatencyBucket[] = [];

    // 创建分桶
    for (let i = 0; i < boundaries.length - 1; i++) {
      const lowerBound = boundaries[i]!;
      const upperBound = boundaries[i + 1]!;
      const count = measurements.filter(m => 
        m.value >= lowerBound && m.value < upperBound
      ).length;

      buckets.push({
        range: `${lowerBound}-${upperBound}ms`,
        lowerBound,
        upperBound,
        count,
        percentage: measurements.length > 0 ? (count / measurements.length) * 100 : 0
      });
    }

    // 处理超出最大边界的数据
    const maxBoundary = boundaries[boundaries.length - 1]!;
    const overflowCount = measurements.filter(m => m.value >= maxBoundary).length;
    if (overflowCount > 0) {
      buckets.push({
        range: `${maxBoundary}+ms`,
        lowerBound: maxBoundary,
        upperBound: Infinity,
        count: overflowCount,
        percentage: measurements.length > 0 ? (overflowCount / measurements.length) * 100 : 0
      });
    }

    this.buckets.set(type, buckets);
  }

  /**
   * 分析趋势
   */
  private analyzeTrend(type: LatencyType): void {
    if (!this.config.trend.enabled) {
      return;
    }

    const stats = this.stats.get(type);
    if (!stats || stats.count === 0) {
      return;
    }

    const trends = this.trends.get(type) || [];
    const currentPeriod = new Date().toISOString().substring(0, 13); // 按小时分组

    // 添加当前统计到趋势
    const existingTrend = trends.find(t => t.period === currentPeriod);
    if (existingTrend) {
      existingTrend.averageLatency = stats.mean;
    } else {
      trends.push({
        period: currentPeriod,
        averageLatency: stats.mean,
        trendDirection: 'stable',
        changePercentage: 0
      });
    }

    // 保持趋势记录数量
    if (trends.length > this.config.trend.windowCount) {
      trends.shift();
    }

    // 计算趋势方向
    if (trends.length >= 2) {
      const current = trends[trends.length - 1];
      const previous = trends[trends.length - 2];
      
      if (current && previous) {
        const changePercentage = ((current.averageLatency - previous.averageLatency) / previous.averageLatency) * 100;
        
        current.changePercentage = changePercentage;

        if (Math.abs(changePercentage) < this.config.trend.significantChange) {
          current.trendDirection = 'stable';
        } else if (changePercentage > 0) {
          current.trendDirection = 'degrading';
        } else {
          current.trendDirection = 'improving';
        }

          // 发射趋势事件
          if (current.trendDirection !== 'stable') {
            this.emit('trend_detected', {
              type,
              trend: current,
              timestamp: Date.now()
            });
          }
        }
      }
    }

    this.trends.set(type, trends);
  }

  /**
   * 检查阈值告警
   */
  private checkThresholds(type: LatencyType, value: number): void {
    const thresholds = this.config.thresholds[type];
    if (!thresholds) {
      return;
    }

    const stats = this.stats.get(type);
    
    // 检查单个值阈值
    if (value > thresholds.critical) {
      this.emitAlert(type, 'critical', `Latency ${value}ms exceeds critical threshold ${thresholds.critical}ms`, value, thresholds.critical);
    } else if (value > thresholds.warning) {
      this.emitAlert(type, 'high', `Latency ${value}ms exceeds warning threshold ${thresholds.warning}ms`, value, thresholds.warning);
    }

    // 检查百分位数阈值
    if (stats) {
      if (stats.p99 > thresholds.p99Critical) {
        this.emitAlert(type, 'critical', `P99 latency ${stats.p99}ms exceeds critical threshold ${thresholds.p99Critical}ms`, stats.p99, thresholds.p99Critical);
      } else if (stats.p95 > thresholds.p95Warning) {
        this.emitAlert(type, 'medium', `P95 latency ${stats.p95}ms exceeds warning threshold ${thresholds.p95Warning}ms`, stats.p95, thresholds.p95Warning);
      }
    }
  }

  /**
   * 发射告警事件
   */
  private emitAlert(type: LatencyType, severity: LatencyAlert['severity'], message: string, value: number, threshold: number, metadata?: Record<string, any>): void {
    const alert: LatencyAlert = {
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: Date.now(),
      ...(metadata && { metadata })
    };

    this.emit('latency_alert', alert);
  }

  /**
   * 创建空分桶
   */
  private createEmptyBuckets(): LatencyBucket[] {
    const boundaries = this.config.buckets.boundaries;
    const buckets: LatencyBucket[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      buckets.push({
        range: `${boundaries[i]}-${boundaries[i + 1]}ms`,
        lowerBound: boundaries[i],
        upperBound: boundaries[i + 1],
        count: 0,
        percentage: 0
      });
    }

    return buckets;
  }

  /**
   * 启动统计更新器
   */
  private startStatsUpdater(): void {
    this.statsUpdateTimer = setInterval(() => {
      this.updateAllStats();
    }, this.config.sampling.sampleInterval);
  }

  /**
   * 更新所有统计
   */
  private updateAllStats(): void {
    Object.values(LatencyType).forEach(type => {
      const stats = this.calculateStats(type);
      this.stats.set(type, stats);
      this.updateBuckets(type);
      this.analyzeTrend(type);
    });

    this.lastStatsUpdate = Date.now();
    this.emit('stats_updated', {
      timestamp: this.lastStatsUpdate,
      stats: this.getAllStats()
    });
  }

  /**
   * 获取指定类型的统计
   */
  public getStats(type: LatencyType): LatencyStats | undefined {
    return this.stats.get(type);
  }

  /**
   * 获取所有统计
   */
  public getAllStats(): Record<string, LatencyStats> {
    const result: Record<string, LatencyStats> = {};
    for (const [type, stats] of this.stats.entries()) {
      result[type] = stats;
    }
    return result;
  }

  /**
   * 获取分桶统计
   */
  public getBuckets(type: LatencyType): LatencyBucket[] {
    return this.buckets.get(type) || [];
  }

  /**
   * 获取趋势信息
   */
  public getTrends(type: LatencyType): LatencyTrend[] {
    return this.trends.get(type) || [];
  }

  /**
   * 获取实时延迟摘要
   */
  public getLatencySummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    for (const [type, stats] of this.stats.entries()) {
      summary[type] = {
        current: stats.mean,
        p95: stats.p95,
        p99: stats.p99,
        trend: this.getTrends(type).slice(-1)[0]?.trendDirection || 'stable',
        alertLevel: this.determineAlertLevel(type, stats)
      };
    }

    return summary;
  }

  /**
   * 确定告警级别
   */
  private determineAlertLevel(type: LatencyType, stats: LatencyStats): string {
    const thresholds = this.config.thresholds[type];
    if (!thresholds) {
      return 'normal';
    }

    if (stats.p99 > thresholds.p99Critical || stats.mean > thresholds.critical) {
      return 'critical';
    }
    if (stats.p95 > thresholds.p95Warning || stats.mean > thresholds.warning) {
      return 'warning';
    }

    return 'normal';
  }

  /**
   * 重置统计
   */
  public reset(): void {
    this.measurements.clear();
    this.currentWindow.clear();
    this.stats.clear();
    this.buckets.clear();
    this.trends.clear();
    this.initializeDataStructures();
  }

  /**
   * 清理过期数据
   */
  public cleanup(maxAge: number = 3600000): void { // 默认1小时
    const cutoff = Date.now() - maxAge;
    
    for (const [type, measurements] of this.measurements.entries()) {
      const validMeasurements = measurements.filter(m => m.timestamp > cutoff);
      this.measurements.set(type, validMeasurements);
    }

    // 重新计算统计
    this.updateAllStats();
  }

  /**
   * 停止监控
   */
  public stop(): void {
    if (this.statsUpdateTimer) {
      clearInterval(this.statsUpdateTimer);
      this.statsUpdateTimer = null;
    }
  }

  /**
   * 获取配置
   */
  public getConfig(): LatencyMonitorConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<LatencyMonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', { config: this.config, timestamp: Date.now() });
  }

  /**
   * 执行基准测试比较
   */
  public compareToBaseline(): Record<string, any> {
    if (!this.config.baseline.enabled) {
      return {};
    }

    const comparison: Record<string, any> = {};
    
    for (const [type, stats] of this.stats.entries()) {
      const target = this.config.baseline.targetLatency[type];
      if (target && stats.count > 0) {
        const deviation = ((stats.mean - target) / target) * 100;
        const acceptable = Math.abs(deviation) <= this.config.baseline.acceptableDeviation;
        
        comparison[type] = {
          target,
          actual: stats.mean,
          deviation,
          acceptable,
          performance: deviation < 0 ? 'better' : deviation > this.config.baseline.acceptableDeviation ? 'worse' : 'acceptable'
        };
      }
    }

    return comparison;
  }
}