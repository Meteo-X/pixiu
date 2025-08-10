/**
 * DataFlow监控系统
 * 提供统一的监控指标收集、健康检查和告警功能
 */

import { EventEmitter } from 'events';
import { BaseMonitor } from '@pixiu/shared-core';
import { DataFlowStats, ChannelStatus, IDataFlowManager } from '../interfaces';

export interface DataFlowMonitorConfig {
  /** 监控间隔 */
  monitoringInterval: number;
  /** 健康检查间隔 */
  healthCheckInterval: number;
  /** 指标收集是否启用 */
  enableMetrics: boolean;
  /** 告警阈值配置 */
  alertThresholds: {
    /** 错误率阈值 */
    errorRateThreshold: number;
    /** 队列大小阈值 */
    queueSizeThreshold: number;
    /** 延迟阈值 */
    latencyThreshold: number;
    /** 通道错误阈值 */
    channelErrorThreshold: number;
  };
  /** 性能基准配置 */
  performanceBaseline: {
    /** 期望的最大处理延迟 */
    maxLatency: number;
    /** 期望的最小吞吐量 */
    minThroughput: number;
    /** 期望的最大错误率 */
    maxErrorRate: number;
  };
}

export interface MonitoringAlert {
  id: string;
  type: 'warning' | 'critical';
  component: 'dataflow' | 'channel' | 'router' | 'transformer';
  message: string;
  details: any;
  timestamp: number;
  resolved: boolean;
}

export interface PerformanceMetrics {
  /** 当前性能评分 (0-100) */
  performanceScore: number;
  /** 吞吐量指标 */
  throughput: {
    current: number;
    average: number;
    peak: number;
  };
  /** 延迟指标 */
  latency: {
    current: number;
    p50: number;
    p95: number;
    p99: number;
  };
  /** 资源利用率 */
  resourceUtilization: {
    memoryUsage: number;
    cpuUsage: number;
    queueUtilization: number;
  };
  /** 可靠性指标 */
  reliability: {
    uptime: number;
    errorRate: number;
    successRate: number;
  };
}

/**
 * DataFlow监控器
 */
export class DataFlowMonitor extends EventEmitter {
  private config: DataFlowMonitorConfig;
  private monitor: BaseMonitor;
  private dataFlowManager: IDataFlowManager;
  private alerts: Map<string, MonitoringAlert> = new Map();
  private performanceHistory: PerformanceMetrics[] = [];
  private monitoringTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private isRunning = false;

  // 性能指标缓存
  private latencyHistory: number[] = [];
  private throughputHistory: Array<{ timestamp: number; count: number }> = [];
  private lastStatsSnapshot?: DataFlowStats;

  constructor(
    dataFlowManager: IDataFlowManager,
    monitor: BaseMonitor,
    config: Partial<DataFlowMonitorConfig> = {}
  ) {
    super();
    this.dataFlowManager = dataFlowManager;
    this.monitor = monitor;
    this.config = this.buildConfig(config);
    this.setupDataFlowEventListeners();
  }

  /**
   * 启动监控
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    if (this.config.enableMetrics) {
      this.registerMetrics();
      this.startMetricsCollection();
    }

    this.startHealthCheck();
    this.startPerformanceTracking();

    this.monitor.log('info', 'DataFlow monitor started', {
      monitoringInterval: this.config.monitoringInterval,
      healthCheckInterval: this.config.healthCheckInterval,
      enableMetrics: this.config.enableMetrics
    });

    this.emit('started');
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.monitor.log('info', 'DataFlow monitor stopped');
    this.emit('stopped');
  }

  /**
   * 获取当前告警
   */
  getAlerts(): MonitoringAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): MonitoringAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): PerformanceMetrics | null {
    if (this.performanceHistory.length === 0) {
      return null;
    }
    return this.performanceHistory[this.performanceHistory.length - 1];
  }

  /**
   * 获取性能历史
   */
  getPerformanceHistory(limit = 100): PerformanceMetrics[] {
    return this.performanceHistory.slice(-limit);
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  /**
   * 构建配置
   */
  private buildConfig(userConfig: Partial<DataFlowMonitorConfig>): DataFlowMonitorConfig {
    return {
      monitoringInterval: userConfig.monitoringInterval || 5000,
      healthCheckInterval: userConfig.healthCheckInterval || 30000,
      enableMetrics: userConfig.enableMetrics !== false,
      alertThresholds: {
        errorRateThreshold: userConfig.alertThresholds?.errorRateThreshold || 0.05,
        queueSizeThreshold: userConfig.alertThresholds?.queueSizeThreshold || 8000,
        latencyThreshold: userConfig.alertThresholds?.latencyThreshold || 1000,
        channelErrorThreshold: userConfig.alertThresholds?.channelErrorThreshold || 10
      },
      performanceBaseline: {
        maxLatency: userConfig.performanceBaseline?.maxLatency || 50,
        minThroughput: userConfig.performanceBaseline?.minThroughput || 100,
        maxErrorRate: userConfig.performanceBaseline?.maxErrorRate || 0.01
      }
    };
  }

  /**
   * 注册监控指标
   */
  private registerMetrics(): void {
    this.monitor.registerMetric({
      name: 'dataflow_performance_score',
      description: 'DataFlow performance score (0-100)',
      type: 'gauge'
    });

    this.monitor.registerMetric({
      name: 'dataflow_throughput_current',
      description: 'Current DataFlow throughput (messages/sec)',
      type: 'gauge'
    });

    this.monitor.registerMetric({
      name: 'dataflow_latency_p95',
      description: 'DataFlow 95th percentile latency',
      type: 'gauge'
    });

    this.monitor.registerMetric({
      name: 'dataflow_active_alerts_total',
      description: 'Total number of active DataFlow alerts',
      type: 'gauge'
    });

    this.monitor.registerMetric({
      name: 'dataflow_channel_health_score',
      description: 'DataFlow channel health score (0-1)',
      type: 'gauge'
    });
  }

  /**
   * 启动指标收集
   */
  private startMetricsCollection(): void {
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoringInterval);
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * 启动性能跟踪
   */
  private startPerformanceTracking(): void {
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, this.config.monitoringInterval);
  }

  /**
   * 收集指标
   */
  private collectMetrics(): void {
    try {
      const stats = this.dataFlowManager.getStats();
      const channels = this.dataFlowManager.getChannelStatuses();
      const performance = this.getPerformanceMetrics();

      if (performance) {
        this.monitor.updateMetric('dataflow_performance_score', performance.performanceScore);
        this.monitor.updateMetric('dataflow_throughput_current', performance.throughput.current);
        this.monitor.updateMetric('dataflow_latency_p95', performance.latency.p95);
      }

      const activeAlerts = this.getActiveAlerts().length;
      this.monitor.updateMetric('dataflow_active_alerts_total', activeAlerts);

      const channelHealthScore = this.calculateChannelHealthScore(channels);
      this.monitor.updateMetric('dataflow_channel_health_score', channelHealthScore);

      // 检查告警条件
      this.checkAlerts(stats, channels, performance);

    } catch (error) {
      this.monitor.log('error', 'Failed to collect DataFlow metrics', { 
        error: error.message 
      });
    }
  }

  /**
   * 执行健康检查
   */
  private performHealthCheck(): void {
    try {
      const stats = this.dataFlowManager.getStats();
      const channels = this.dataFlowManager.getChannelStatuses();
      
      // 检查数据流健康状态
      const isHealthy = this.assessOverallHealth(stats, channels);
      
      if (!isHealthy) {
        this.createAlert('critical', 'dataflow', 'DataFlow system is unhealthy', {
          stats,
          unhealthyChannels: channels.filter(c => c.health !== 'healthy').length
        });
      }

    } catch (error) {
      this.monitor.log('error', 'Health check failed', { error: error.message });
    }
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(): void {
    try {
      const stats = this.dataFlowManager.getStats();
      const channels = this.dataFlowManager.getChannelStatuses();

      // 计算吞吐量
      const throughput = this.calculateThroughput(stats);
      
      // 计算延迟分位数
      const latencyPercentiles = this.calculateLatencyPercentiles();
      
      // 计算资源利用率
      const resourceUtilization = this.calculateResourceUtilization(stats);
      
      // 计算可靠性指标
      const reliability = this.calculateReliability(stats);
      
      // 计算总体性能评分
      const performanceScore = this.calculatePerformanceScore(
        throughput,
        latencyPercentiles,
        resourceUtilization,
        reliability
      );

      const metrics: PerformanceMetrics = {
        performanceScore,
        throughput: {
          current: throughput.current,
          average: throughput.average,
          peak: throughput.peak
        },
        latency: latencyPercentiles,
        resourceUtilization,
        reliability
      };

      // 保存性能历史
      this.performanceHistory.push(metrics);
      if (this.performanceHistory.length > 1000) { // 保留最近1000个数据点
        this.performanceHistory.shift();
      }

      this.lastStatsSnapshot = { ...stats };

    } catch (error) {
      this.monitor.log('error', 'Failed to update performance metrics', { 
        error: error.message 
      });
    }
  }

  /**
   * 检查告警条件
   */
  private checkAlerts(
    stats: DataFlowStats, 
    channels: ChannelStatus[], 
    performance: PerformanceMetrics | null
  ): void {
    // 检查错误率
    if (stats.totalProcessed > 0) {
      const errorRate = stats.totalErrors / stats.totalProcessed;
      if (errorRate > this.config.alertThresholds.errorRateThreshold) {
        this.createAlert('warning', 'dataflow', 'High error rate detected', {
          errorRate,
          threshold: this.config.alertThresholds.errorRateThreshold
        });
      }
    }

    // 检查队列大小
    if (stats.currentQueueSize > this.config.alertThresholds.queueSizeThreshold) {
      this.createAlert('critical', 'dataflow', 'Queue size threshold exceeded', {
        currentSize: stats.currentQueueSize,
        threshold: this.config.alertThresholds.queueSizeThreshold
      });
    }

    // 检查延迟
    if (performance && performance.latency.p95 > this.config.alertThresholds.latencyThreshold) {
      this.createAlert('warning', 'dataflow', 'High latency detected', {
        p95Latency: performance.latency.p95,
        threshold: this.config.alertThresholds.latencyThreshold
      });
    }

    // 检查通道错误
    const unhealthyChannels = channels.filter(c => c.health !== 'healthy');
    if (unhealthyChannels.length > this.config.alertThresholds.channelErrorThreshold) {
      this.createAlert('warning', 'channel', 'Multiple unhealthy channels', {
        unhealthyCount: unhealthyChannels.length,
        channels: unhealthyChannels.map(c => ({ id: c.id, health: c.health }))
      });
    }

    // 检查背压状态
    if (stats.backpressureActive) {
      this.createAlert('warning', 'dataflow', 'Backpressure is active', {
        queueSize: stats.currentQueueSize
      });
    }
  }

  /**
   * 创建告警
   */
  private createAlert(
    type: 'warning' | 'critical',
    component: string,
    message: string,
    details: any
  ): void {
    const alertId = `${component}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: MonitoringAlert = {
      id: alertId,
      type,
      component: component as any,
      message,
      details,
      timestamp: Date.now(),
      resolved: false
    };

    this.alerts.set(alertId, alert);
    this.emit('alertCreated', alert);

    this.monitor.log(type === 'critical' ? 'error' : 'warn', 
      `DataFlow alert: ${message}`, { alertId, details }
    );
  }

  /**
   * 计算通道健康评分
   */
  private calculateChannelHealthScore(channels: ChannelStatus[]): number {
    if (channels.length === 0) return 1;
    
    const healthyChannels = channels.filter(c => c.health === 'healthy').length;
    return healthyChannels / channels.length;
  }

  /**
   * 评估总体健康状态
   */
  private assessOverallHealth(stats: DataFlowStats, channels: ChannelStatus[]): boolean {
    // 检查基本指标
    if (stats.backpressureActive) return false;
    
    // 检查通道健康
    const channelHealthScore = this.calculateChannelHealthScore(channels);
    if (channelHealthScore < 0.8) return false; // 80%的通道必须健康
    
    // 检查错误率
    if (stats.totalProcessed > 100) { // 只在有足够样本时检查
      const errorRate = stats.totalErrors / stats.totalProcessed;
      if (errorRate > this.config.performanceBaseline.maxErrorRate) return false;
    }
    
    return true;
  }

  /**
   * 计算吞吐量指标
   */
  private calculateThroughput(stats: DataFlowStats) {
    const now = Date.now();
    
    // 记录当前吞吐量数据点
    this.throughputHistory.push({
      timestamp: now,
      count: stats.totalProcessed
    });
    
    // 清理旧数据（保留最近5分钟）
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    this.throughputHistory = this.throughputHistory.filter(p => p.timestamp > fiveMinutesAgo);
    
    if (this.throughputHistory.length < 2) {
      return { current: 0, average: 0, peak: 0 };
    }
    
    // 计算当前吞吐量（最近30秒）
    const thirtySecondsAgo = now - 30 * 1000;
    const recentPoints = this.throughputHistory.filter(p => p.timestamp > thirtySecondsAgo);
    const current = recentPoints.length >= 2 
      ? (recentPoints[recentPoints.length - 1].count - recentPoints[0].count) / 30 
      : 0;
    
    // 计算平均和峰值吞吐量
    const intervals = [];
    for (let i = 1; i < this.throughputHistory.length; i++) {
      const timeDiff = (this.throughputHistory[i].timestamp - this.throughputHistory[i-1].timestamp) / 1000;
      const countDiff = this.throughputHistory[i].count - this.throughputHistory[i-1].count;
      if (timeDiff > 0) {
        intervals.push(countDiff / timeDiff);
      }
    }
    
    const average = intervals.length > 0 
      ? intervals.reduce((sum, rate) => sum + rate, 0) / intervals.length 
      : 0;
    const peak = intervals.length > 0 ? Math.max(...intervals) : 0;
    
    return { current, average, peak };
  }

  /**
   * 计算延迟分位数
   */
  private calculateLatencyPercentiles() {
    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    
    if (sorted.length === 0) {
      return { current: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const current = sorted[sorted.length - 1] || 0;
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    
    return { current, p50, p95, p99 };
  }

  /**
   * 计算资源利用率
   */
  private calculateResourceUtilization(stats: DataFlowStats) {
    return {
      memoryUsage: 0, // 暂时不实现
      cpuUsage: 0,    // 暂时不实现
      queueUtilization: stats.currentQueueSize / 10000 // 假设最大队列为10000
    };
  }

  /**
   * 计算可靠性指标
   */
  private calculateReliability(stats: DataFlowStats) {
    const uptime = Date.now() - (stats.lastActivity || Date.now()); // 简化计算
    const errorRate = stats.totalProcessed > 0 ? stats.totalErrors / stats.totalProcessed : 0;
    const successRate = 1 - errorRate;
    
    return {
      uptime: Math.max(0, uptime),
      errorRate,
      successRate
    };
  }

  /**
   * 计算总体性能评分
   */
  private calculatePerformanceScore(
    throughput: any,
    latency: any,
    resourceUtilization: any,
    reliability: any
  ): number {
    // 各项指标权重
    const weights = {
      throughput: 0.3,
      latency: 0.3,
      resource: 0.2,
      reliability: 0.2
    };

    // 计算各项评分（0-100）
    const throughputScore = Math.min(100, (throughput.current / this.config.performanceBaseline.minThroughput) * 100);
    const latencyScore = Math.max(0, 100 - (latency.p95 / this.config.performanceBaseline.maxLatency) * 100);
    const resourceScore = Math.max(0, 100 - resourceUtilization.queueUtilization * 100);
    const reliabilityScore = reliability.successRate * 100;

    // 加权平均
    const totalScore = 
      throughputScore * weights.throughput +
      latencyScore * weights.latency +
      resourceScore * weights.resource +
      reliabilityScore * weights.reliability;

    return Math.round(Math.max(0, Math.min(100, totalScore)));
  }

  /**
   * 设置DataFlow事件监听
   */
  private setupDataFlowEventListeners(): void {
    this.dataFlowManager.on('dataProcessed', (data, stats) => {
      // 记录处理延迟
      if (data.receivedAt) {
        const latency = Date.now() - data.receivedAt;
        this.latencyHistory.push(latency);
        if (this.latencyHistory.length > 1000) {
          this.latencyHistory.shift();
        }
      }
    });

    this.dataFlowManager.on('channelError', (channelId, error) => {
      this.createAlert('warning', 'channel', 'Channel error occurred', {
        channelId,
        error: error.message
      });
    });

    this.dataFlowManager.on('backpressureActivated', (queueSize) => {
      this.createAlert('warning', 'dataflow', 'Backpressure activated', { queueSize });
    });

    this.dataFlowManager.on('backpressureDeactivated', (queueSize) => {
      // 解决相关的背压告警
      const backpressureAlerts = Array.from(this.alerts.values())
        .filter(alert => alert.message.includes('Backpressure') && !alert.resolved);
      
      backpressureAlerts.forEach(alert => {
        this.resolveAlert(alert.id);
      });
    });
  }
}