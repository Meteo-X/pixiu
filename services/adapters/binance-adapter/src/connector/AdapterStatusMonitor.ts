/**
 * 适配器状态监控器
 * 
 * 功能：
 * - 实时状态监控
 * - 健康度评估
 * - 性能指标追踪
 * - 状态变化检测
 * - 监控数据聚合
 */

import { EventEmitter } from 'events';
import { 
  AdapterStatus, 
  ConnectionState, 
  ConnectionStats, 
  PerformanceStats, 
  HeartbeatStats,
  ErrorInfo 
} from '../types';
import { ErrorHandler, ErrorStats } from './ErrorHandler';
import { LatencyMonitor, LatencyStats } from './LatencyMonitor';

// 健康度评分因子
export interface HealthFactors {
  connectivity: number;    // 连接健康度 (0-1)
  latency: number;        // 延迟健康度 (0-1)
  throughput: number;     // 吞吐量健康度 (0-1)
  errorRate: number;      // 错误率健康度 (0-1)
  heartbeat: number;      // 心跳健康度 (0-1)
  stability: number;      // 稳定性健康度 (0-1)
}

// 适配器状态快照
export interface AdapterStatusSnapshot {
  timestamp: number;
  status: AdapterStatus;
  overallHealth: number;
  healthFactors: HealthFactors;
  connectionStats: ConnectionStats[];
  performanceStats: PerformanceStats;
  errorStats: ErrorStats;
  latencyStats: Record<string, LatencyStats>;
  subscriptionCount: number;
  uptime: number;
  metadata?: Record<string, any>;
}

// 状态变化事件
export interface StatusChangeEvent {
  timestamp: number;
  previousStatus: AdapterStatus;
  currentStatus: AdapterStatus;
  reason: string;
  metadata?: Record<string, any>;
}

// 健康度告警
export interface HealthAlert {
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  factor: keyof HealthFactors;
  value: number;
  threshold: number;
  message: string;
  snapshot: AdapterStatusSnapshot;
}

// 性能基准
export interface PerformanceBenchmark {
  messagesPerSecond: {
    target: number;
    warning: number;
    critical: number;
  };
  latency: {
    target: number;      // 目标延迟 (ms)
    warning: number;     // 警告阈值 (ms)
    critical: number;    // 严重阈值 (ms)
  };
  errorRate: {
    target: number;      // 目标错误率 (%)
    warning: number;     // 警告阈值 (%)
    critical: number;    // 严重阈值 (%)
  };
  connectionSuccess: {
    target: number;      // 目标连接成功率 (%)
    warning: number;     // 警告阈值 (%)
    critical: number;    // 严重阈值 (%)
  };
}

// 监控配置
export interface StatusMonitorConfig {
  updateInterval: number;     // 状态更新间隔 (ms)
  snapshotRetention: number;  // 快照保留数量
  healthThresholds: {
    warning: number;          // 健康度警告阈值
    critical: number;         // 健康度严重阈值
  };
  benchmarks: PerformanceBenchmark;
  alerting: {
    enabled: boolean;
    cooldownPeriod: number;   // 告警冷却期 (ms)
  };
}

export class AdapterStatusMonitor extends EventEmitter {
  private config: StatusMonitorConfig;
  private currentStatus: AdapterStatus = AdapterStatus.INITIALIZING;
  private snapshots: AdapterStatusSnapshot[] = [];
  private lastSnapshot: AdapterStatusSnapshot | null = null;
  
  // 监控组件
  private errorHandler: ErrorHandler | null = null;
  private latencyMonitor: LatencyMonitor | null = null;
  
  // 状态跟踪
  private startTime = Date.now();
  private lastStatusChange = Date.now();
  private statusHistory: StatusChangeEvent[] = [];
  
  // 告警管理
  private lastAlerts: Map<string, number> = new Map();
  
  // 定时器
  private updateTimer: NodeJS.Timeout | null = null;

  constructor(config: StatusMonitorConfig) {
    super();
    this.config = config;
    this.startMonitoring();
  }

  /**
   * 设置错误处理器
   */
  public setErrorHandler(errorHandler: ErrorHandler): void {
    this.errorHandler = errorHandler;
    
    // 监听错误处理器事件
    errorHandler.on('critical_error', (error) => {
      this.handleCriticalError(error);
    });
    
    errorHandler.on('high_error_rate', (data) => {
      this.handleHighErrorRate(data);
    });
  }

  /**
   * 设置延迟监控器
   */
  public setLatencyMonitor(latencyMonitor: LatencyMonitor): void {
    this.latencyMonitor = latencyMonitor;
    
    // 监听延迟告警
    latencyMonitor.on('latency_alert', (alert) => {
      this.handleLatencyAlert(alert);
    });
  }

  /**
   * 更新适配器状态
   */
  public updateStatus(newStatus: AdapterStatus, reason?: string, metadata?: Record<string, any>): void {
    if (this.currentStatus === newStatus) {
      return;
    }

    const previousStatus = this.currentStatus;
    this.currentStatus = newStatus;
    
    const statusChangeEvent: StatusChangeEvent = {
      timestamp: Date.now(),
      previousStatus,
      currentStatus: newStatus,
      reason: reason || 'Status updated',
      metadata
    };

    // 记录状态变化
    this.statusHistory.push(statusChangeEvent);
    if (this.statusHistory.length > 100) {
      this.statusHistory.shift();
    }

    this.lastStatusChange = Date.now();

    // 发射状态变化事件
    this.emit('status_changed', statusChangeEvent);

    // 立即创建快照
    this.createSnapshot();
  }

  /**
   * 创建状态快照
   */
  public createSnapshot(connectionStats?: ConnectionStats[], performanceStats?: PerformanceStats): AdapterStatusSnapshot {
    const timestamp = Date.now();
    const uptime = timestamp - this.startTime;
    
    // 获取各种统计信息
    const errorStats = this.errorHandler?.getErrorStats() || this.getDefaultErrorStats();
    const latencyStats = this.latencyMonitor?.getAllStats() || {};
    
    // 计算健康度因子
    const healthFactors = this.calculateHealthFactors(
      connectionStats || [],
      performanceStats,
      errorStats,
      latencyStats
    );
    
    // 计算总体健康度
    const overallHealth = this.calculateOverallHealth(healthFactors);
    
    const snapshot: AdapterStatusSnapshot = {
      timestamp,
      status: this.currentStatus,
      overallHealth,
      healthFactors,
      connectionStats: connectionStats || [],
      performanceStats: performanceStats || this.getDefaultPerformanceStats(),
      errorStats,
      latencyStats,
      subscriptionCount: this.calculateSubscriptionCount(connectionStats || []),
      uptime,
      metadata: {
        lastStatusChange: this.lastStatusChange,
        statusChangeCount: this.statusHistory.length
      }
    };

    // 添加到快照历史
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.config.snapshotRetention) {
      this.snapshots.shift();
    }

    this.lastSnapshot = snapshot;

    // 检查健康度告警
    this.checkHealthAlerts(snapshot);

    // 发射快照事件
    this.emit('snapshot_created', snapshot);

    return snapshot;
  }

  /**
   * 计算健康度因子
   */
  private calculateHealthFactors(
    connectionStats: ConnectionStats[],
    performanceStats?: PerformanceStats,
    errorStats?: ErrorStats,
    latencyStats?: Record<string, LatencyStats>
  ): HealthFactors {
    
    // 连接健康度
    const connectivity = this.calculateConnectivityHealth(connectionStats);
    
    // 延迟健康度
    const latency = this.calculateLatencyHealth(latencyStats);
    
    // 吞吐量健康度
    const throughput = this.calculateThroughputHealth(performanceStats);
    
    // 错误率健康度
    const errorRate = this.calculateErrorRateHealth(errorStats);
    
    // 心跳健康度
    const heartbeat = this.calculateHeartbeatHealth(connectionStats);
    
    // 稳定性健康度
    const stability = this.calculateStabilityHealth();

    return {
      connectivity,
      latency,
      throughput,
      errorRate,
      heartbeat,
      stability
    };
  }

  /**
   * 计算连接健康度
   */
  private calculateConnectivityHealth(connectionStats: ConnectionStats[]): number {
    if (connectionStats.length === 0) {
      return this.currentStatus === AdapterStatus.ACTIVE ? 0.5 : 0;
    }

    const activeConnections = connectionStats.filter(stat => 
      stat.state === ConnectionState.ACTIVE || stat.state === ConnectionState.CONNECTED
    ).length;
    
    const totalConnections = connectionStats.length;
    const connectionRatio = activeConnections / totalConnections;
    
    // 考虑连接成功率
    const totalAttempts = connectionStats.reduce((sum, stat) => sum + stat.connectionAttempts, 0);
    const successfulConnections = connectionStats.reduce((sum, stat) => sum + stat.successfulConnections, 0);
    const successRate = totalAttempts > 0 ? successfulConnections / totalAttempts : 1;
    
    return (connectionRatio * 0.7) + (successRate * 0.3);
  }

  /**
   * 计算延迟健康度
   */
  private calculateLatencyHealth(latencyStats?: Record<string, LatencyStats>): number {
    if (!latencyStats || Object.keys(latencyStats).length === 0) {
      return 0.8; // 默认中等健康度
    }

    const { target, warning } = this.config.benchmarks.latency;
    
    // 计算网络延迟健康度
    const networkStats = latencyStats['network'];
    if (!networkStats || networkStats.count === 0) {
      return 0.8;
    }

    const avgLatency = networkStats.mean;
    
    if (avgLatency <= target) {
      return 1.0;
    } else if (avgLatency <= warning) {
      return 1.0 - ((avgLatency - target) / (warning - target)) * 0.3;
    } else {
      return Math.max(0, 0.7 - ((avgLatency - warning) / warning) * 0.7);
    }
  }

  /**
   * 计算吞吐量健康度
   */
  private calculateThroughputHealth(performanceStats?: PerformanceStats): number {
    if (!performanceStats) {
      return 0.8;
    }

    const { target, warning } = this.config.benchmarks.messagesPerSecond;
    const actualThroughput = performanceStats.messagesPerSecond || 0;
    
    if (actualThroughput >= target) {
      return 1.0;
    } else if (actualThroughput >= warning) {
      return 0.7 + ((actualThroughput - warning) / (target - warning)) * 0.3;
    } else {
      return Math.max(0, (actualThroughput / warning) * 0.7);
    }
  }

  /**
   * 计算错误率健康度
   */
  private calculateErrorRateHealth(errorStats?: ErrorStats): number {
    if (!errorStats) {
      return 1.0;
    }

    const { target, warning, critical } = this.config.benchmarks.errorRate;
    const actualErrorRate = errorStats.errorRate;
    
    if (actualErrorRate <= target) {
      return 1.0;
    } else if (actualErrorRate <= warning) {
      return 1.0 - ((actualErrorRate - target) / (warning - target)) * 0.3;
    } else if (actualErrorRate <= critical) {
      return 0.7 - ((actualErrorRate - warning) / (critical - warning)) * 0.5;
    } else {
      return Math.max(0, 0.2 - ((actualErrorRate - critical) / critical) * 0.2);
    }
  }

  /**
   * 计算心跳健康度
   */
  private calculateHeartbeatHealth(connectionStats: ConnectionStats[]): number {
    if (connectionStats.length === 0) {
      return 0.8;
    }

    // 这里需要获取心跳统计，暂时使用连接统计作为代理
    const healthyConnections = connectionStats.filter(stat => 
      stat.state === ConnectionState.ACTIVE && !stat.lastError
    ).length;
    
    return healthyConnections / connectionStats.length;
  }

  /**
   * 计算稳定性健康度
   */
  private calculateStabilityHealth(): number {
    const uptime = Date.now() - this.startTime;
    const timeSinceLastChange = Date.now() - this.lastStatusChange;
    
    // 运行时间稳定性 (运行时间越长越稳定)
    const uptimeScore = Math.min(uptime / 3600000, 1); // 1小时为满分
    
    // 状态变化稳定性 (状态变化越少越稳定)
    const changeFrequency = this.statusHistory.length / (uptime / 3600000); // 每小时变化次数
    const stabilityScore = Math.max(0, 1 - changeFrequency / 10); // 10次/小时为最低分
    
    // 当前状态稳定性
    const currentStateScore = timeSinceLastChange / 300000; // 5分钟稳定为满分
    
    return (uptimeScore * 0.4) + (stabilityScore * 0.4) + (Math.min(currentStateScore, 1) * 0.2);
  }

  /**
   * 计算总体健康度
   */
  private calculateOverallHealth(factors: HealthFactors): number {
    // 加权平均计算总体健康度
    const weights = {
      connectivity: 0.25,
      latency: 0.20,
      throughput: 0.15,
      errorRate: 0.20,
      heartbeat: 0.10,
      stability: 0.10
    };

    return Object.entries(factors).reduce((total, [factor, value]) => {
      const weight = weights[factor as keyof HealthFactors];
      return total + (value * weight);
    }, 0);
  }

  /**
   * 检查健康度告警
   */
  private checkHealthAlerts(snapshot: AdapterStatusSnapshot): void {
    if (!this.config.alerting.enabled) {
      return;
    }

    const { warning, critical } = this.config.healthThresholds;
    
    // 检查总体健康度
    if (snapshot.overallHealth <= critical) {
      this.emitHealthAlert('critical', 'overallHealth', snapshot.overallHealth, critical, 
        `Overall health ${(snapshot.overallHealth * 100).toFixed(1)}% is critically low`, snapshot);
    } else if (snapshot.overallHealth <= warning) {
      this.emitHealthAlert('warning', 'overallHealth', snapshot.overallHealth, warning,
        `Overall health ${(snapshot.overallHealth * 100).toFixed(1)}% is below warning threshold`, snapshot);
    }

    // 检查各个健康因子
    Object.entries(snapshot.healthFactors).forEach(([factor, value]) => {
      if (value <= critical) {
        this.emitHealthAlert('error', factor as keyof HealthFactors, value, critical,
          `${factor} health ${(value * 100).toFixed(1)}% is critically low`, snapshot);
      } else if (value <= warning) {
        this.emitHealthAlert('warning', factor as keyof HealthFactors, value, warning,
          `${factor} health ${(value * 100).toFixed(1)}% is below warning threshold`, snapshot);
      }
    });
  }

  /**
   * 发射健康度告警
   */
  private emitHealthAlert(
    severity: HealthAlert['severity'], 
    factor: keyof HealthFactors, 
    value: number, 
    threshold: number, 
    message: string, 
    snapshot: AdapterStatusSnapshot
  ): void {
    const alertKey = `${factor}_${severity}`;
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(alertKey);
    
    // 检查冷却期
    if (lastAlert && (now - lastAlert) < this.config.alerting.cooldownPeriod) {
      return;
    }

    const alert: HealthAlert = {
      timestamp: now,
      severity,
      factor,
      value,
      threshold,
      message,
      snapshot
    };

    this.lastAlerts.set(alertKey, now);
    this.emit('health_alert', alert);
  }

  /**
   * 处理致命错误
   */
  private handleCriticalError(error: any): void {
    this.emitHealthAlert('critical', 'errorRate', 1, 0,
      `Critical error occurred: ${error.message}`, this.lastSnapshot!);
  }

  /**
   * 处理高错误率
   */
  private handleHighErrorRate(data: any): void {
    this.emitHealthAlert('error', 'errorRate', data.errorRate, data.threshold,
      `High error rate detected: ${data.errorRate} errors/min`, this.lastSnapshot!);
  }

  /**
   * 处理延迟告警
   */
  private handleLatencyAlert(alert: any): void {
    const severity = alert.severity === 'critical' ? 'critical' : 'warning';
    this.emitHealthAlert(severity as HealthAlert['severity'], 'latency', alert.value, alert.threshold,
      `Latency alert: ${alert.message}`, this.lastSnapshot!);
  }

  /**
   * 计算订阅数量
   */
  private calculateSubscriptionCount(connectionStats: ConnectionStats[]): number {
    return connectionStats.reduce((total, stat) => total + stat.activeSubscriptions, 0);
  }

  /**
   * 获取默认错误统计
   */
  private getDefaultErrorStats(): ErrorStats {
    return {
      total: 0,
      connection: 0,
      parsing: 0,
      pubsub: 0,
      lastError: undefined,
      recent: []
    };
  }

  /**
   * 获取默认性能统计
   */
  private getDefaultPerformanceStats(): PerformanceStats {
    return {
      latency: {
        current: 0,
        average: 0,
        min: 0,
        max: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0
      },
      processingTime: {
        average: 0,
        p95: 0,
        p99: 0
      }
    };
  }

  /**
   * 开始监控
   */
  private startMonitoring(): void {
    this.updateTimer = setInterval(() => {
      this.createSnapshot();
    }, this.config.updateInterval);
  }

  /**
   * 获取当前状态
   */
  public getCurrentStatus(): AdapterStatus {
    return this.currentStatus;
  }

  /**
   * 获取最新快照
   */
  public getLatestSnapshot(): AdapterStatusSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * 获取历史快照
   */
  public getSnapshots(limit?: number): AdapterStatusSnapshot[] {
    if (limit) {
      return this.snapshots.slice(-limit);
    }
    return [...this.snapshots];
  }

  /**
   * 获取状态历史
   */
  public getStatusHistory(): StatusChangeEvent[] {
    return [...this.statusHistory];
  }

  /**
   * 获取运行时间
   */
  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 获取健康度趋势
   */
  public getHealthTrend(minutes: number = 60): Array<{timestamp: number, health: number}> {
    const cutoff = Date.now() - (minutes * 60000);
    return this.snapshots
      .filter(snapshot => snapshot.timestamp > cutoff)
      .map(snapshot => ({
        timestamp: snapshot.timestamp,
        health: snapshot.overallHealth
      }));
  }

  /**
   * 重置监控器
   */
  public reset(): void {
    this.snapshots = [];
    this.lastSnapshot = null;
    this.statusHistory = [];
    this.lastAlerts.clear();
    this.startTime = Date.now();
    this.lastStatusChange = Date.now();
    this.currentStatus = AdapterStatus.INITIALIZING;
  }

  /**
   * 停止监控
   */
  public stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * 获取配置
   */
  public getConfig(): StatusMonitorConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<StatusMonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // 重启监控器以应用新配置
    this.stop();
    this.startMonitoring();
    
    this.emit('config_updated', { config: this.config, timestamp: Date.now() });
  }
}