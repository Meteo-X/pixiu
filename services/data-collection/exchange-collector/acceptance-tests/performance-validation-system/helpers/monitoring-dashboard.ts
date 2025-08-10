/**
 * 性能监控仪表板
 * 提供实时性能数据展示和告警功能
 */

import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { TEST_CONFIG, PERFORMANCE_GOALS } from '../setup';

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
  threshold: number;
  duration: number; // 持续时间(ms)
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

export interface DashboardMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  trend: 'up' | 'down' | 'stable';
  status: 'healthy' | 'warning' | 'critical';
}

export interface DashboardData {
  timestamp: number;
  systemMetrics: {
    memory: {
      current: number;
      target: number;
      usage: number;
      trend: 'up' | 'down' | 'stable';
    };
    throughput: {
      current: number;
      target: number;
      messagesPerSecond: number;
      trend: 'up' | 'down' | 'stable';
    };
    latency: {
      current: number;
      target: number;
      averageMs: number;
      p95Ms: number;
      trend: 'up' | 'down' | 'stable';
    };
    websocket: {
      connections: number;
      latencyMs: number;
      status: 'healthy' | 'warning' | 'critical';
    };
  };
  alerts: Alert[];
  performanceScore: {
    overall: number;
    memory: number;
    throughput: number;
    latency: number;
    stability: number;
  };
}

export class PerformanceMonitoringDashboard extends EventEmitter {
  private metrics: Map<string, DashboardMetric[]> = new Map();
  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private activeAlerts: Map<string, Alert> = new Map();
  private dashboardData: DashboardData | null = null;
  private monitoringInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor() {
    super();
    this.initializeDefaultAlertRules();
  }

  /**
   * 启动监控仪表板
   */
  async startMonitoring(intervalMs = 5000): Promise<void> {
    if (this.isRunning) {
      throw new Error('监控仪表板已在运行中');
    }

    console.log('🚀 启动性能监控仪表板...');
    this.isRunning = true;

    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
      await this.checkAlerts();
      await this.updateDashboard();
      this.emit('dashboard-update', this.dashboardData);
    }, intervalMs);

    this.emit('monitoring-started');
  }

  /**
   * 停止监控仪表板
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 停止性能监控仪表板...');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.isRunning = false;
    this.emit('monitoring-stopped');
  }

  /**
   * 添加性能指标
   */
  addMetric(name: string, value: number, unit: string = '', metadata?: any): void {
    const trend = this.calculateTrend(name, value);
    const status = this.determineStatus(name, value);
    
    const metric: DashboardMetric = {
      name,
      value,
      unit,
      timestamp: performance.now(),
      trend,
      status
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricHistory = this.metrics.get(name)!;
    metricHistory.push(metric);

    // 保留最近1000个数据点
    if (metricHistory.length > 1000) {
      metricHistory.splice(0, metricHistory.length - 1000);
    }

    // 触发告警检查
    this.checkMetricAlerts(name, value);
  }

  /**
   * 获取当前仪表板数据
   */
  getDashboardData(): DashboardData | null {
    return this.dashboardData;
  }

  /**
   * 获取历史指标数据
   */
  getMetricHistory(name: string, duration?: number): DashboardMetric[] {
    const metrics = this.metrics.get(name) || [];
    
    if (!duration) {
      return metrics;
    }

    const cutoffTime = performance.now() - duration;
    return metrics.filter(metric => metric.timestamp >= cutoffTime);
  }

  /**
   * 添加告警规则
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    console.log(`➕ 添加告警规则: ${rule.name}`);
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * 获取所有告警历史
   */
  getAllAlerts(): Alert[] {
    return [...this.alerts];
  }

  /**
   * 生成性能报告
   */
  async generateReport(): Promise<string> {
    const reportData = {
      timestamp: Date.now(),
      dashboardData: this.dashboardData,
      metrics: Object.fromEntries(this.metrics),
      alerts: this.alerts,
      summary: this.generateSummary()
    };

    const reportPath = path.join(TEST_CONFIG.REPORTS_DIR, `performance-dashboard-report-${Date.now()}.json`);
    await fs.writeJSON(reportPath, reportData, { spaces: 2 });

    console.log(`📊 性能监控报告已生成: ${reportPath}`);
    return reportPath;
  }

  /**
   * 初始化默认告警规则
   */
  private initializeDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'memory-usage-high',
        name: '内存使用率过高',
        metric: 'memory-usage-mb',
        condition: 'greater_than',
        threshold: PERFORMANCE_GOALS.MEMORY.TARGET_MB * 1.5, // 117MB
        duration: 30000, // 30秒
        severity: 'warning',
        enabled: true
      },
      {
        id: 'memory-usage-critical',
        name: '内存使用率严重过高',
        metric: 'memory-usage-mb',
        condition: 'greater_than',
        threshold: PERFORMANCE_GOALS.MEMORY.TARGET_MB * 2, // 156MB
        duration: 10000, // 10秒
        severity: 'critical',
        enabled: true
      },
      {
        id: 'throughput-low',
        name: '吞吐量过低',
        metric: 'throughput-msg-sec',
        condition: 'less_than',
        threshold: PERFORMANCE_GOALS.THROUGHPUT.TARGET_MSG_SEC * 0.8, // 1200 msg/sec
        duration: 60000, // 1分钟
        severity: 'warning',
        enabled: true
      },
      {
        id: 'latency-high',
        name: '延迟过高',
        metric: 'latency-avg-ms',
        condition: 'greater_than',
        threshold: PERFORMANCE_GOALS.LATENCY.TARGET_MS * 2, // 50ms
        duration: 30000, // 30秒
        severity: 'warning',
        enabled: true
      },
      {
        id: 'websocket-latency-high',
        name: 'WebSocket延迟过高',
        metric: 'websocket-latency-ms',
        condition: 'greater_than',
        threshold: PERFORMANCE_GOALS.WEBSOCKET_LATENCY.TARGET_MS * 2, // 20ms
        duration: 20000, // 20秒
        severity: 'warning',
        enabled: true
      },
      {
        id: 'connection-drops',
        name: '连接断开频繁',
        metric: 'connection-drops',
        condition: 'greater_than',
        threshold: 10,
        duration: 60000, // 1分钟
        severity: 'critical',
        enabled: true
      }
    ];

    this.alertRules = defaultRules;
  }

  /**
   * 收集系统指标
   */
  private async collectMetrics(): Promise<void> {
    // 收集内存指标
    const memoryUsage = process.memoryUsage();
    this.addMetric('memory-heap-used', memoryUsage.heapUsed);
    this.addMetric('memory-heap-total', memoryUsage.heapTotal);
    this.addMetric('memory-rss', memoryUsage.rss);
    this.addMetric('memory-usage-mb', memoryUsage.heapUsed / (1024 * 1024), 'MB');

    // 收集CPU指标（如果可用）
    try {
      const pidusage = require('pidusage');
      const stats = await pidusage(process.pid);
      this.addMetric('cpu-usage', stats.cpu, '%');
    } catch (error) {
      // pidusage不可用时忽略CPU指标
    }

    // 收集Node.js进程指标
    const activeHandles = (process as any)._getActiveHandles?.()?.length || 0;
    const activeRequests = (process as any)._getActiveRequests?.()?.length || 0;
    
    this.addMetric('active-handles', activeHandles);
    this.addMetric('active-requests', activeRequests);

    // 收集GC指标（如果可用）
    if (global.gc) {
      const gcBefore = process.memoryUsage();
      global.gc();
      const gcAfter = process.memoryUsage();
      const gcReclaimed = gcBefore.heapUsed - gcAfter.heapUsed;
      
      this.addMetric('gc-reclaimed', gcReclaimed);
    }
  }

  /**
   * 检查告警规则
   */
  private async checkAlerts(): Promise<void> {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      const metrics = this.getMetricHistory(rule.metric, rule.duration);
      if (metrics.length === 0) continue;

      const recentMetrics = metrics.slice(-5); // 检查最近5个数据点
      const triggerAlert = recentMetrics.some(metric => 
        this.evaluateCondition(metric.value, rule.condition, rule.threshold)
      );

      if (triggerAlert && !this.activeAlerts.has(rule.id)) {
        // 触发新告警
        const latestMetric = recentMetrics[recentMetrics.length - 1];
        const alert: Alert = {
          id: `${rule.id}-${Date.now()}`,
          ruleId: rule.id,
          severity: rule.severity,
          message: `${rule.name}: ${latestMetric.value}${latestMetric.unit} ${rule.condition.replace('_', ' ')} ${rule.threshold}${latestMetric.unit}`,
          metric: rule.metric,
          value: latestMetric.value,
          threshold: rule.threshold,
          timestamp: Date.now(),
          resolved: false
        };

        this.activeAlerts.set(rule.id, alert);
        this.alerts.push(alert);
        
        console.log(`🚨 告警触发: ${alert.message}`);
        this.emit('alert-triggered', alert);
      } else if (!triggerAlert && this.activeAlerts.has(rule.id)) {
        // 解决告警
        const alert = this.activeAlerts.get(rule.id)!;
        alert.resolved = true;
        alert.resolvedAt = Date.now();
        
        this.activeAlerts.delete(rule.id);
        
        console.log(`✅ 告警已解决: ${alert.message}`);
        this.emit('alert-resolved', alert);
      }
    }
  }

  /**
   * 检查单个指标的告警
   */
  private checkMetricAlerts(metricName: string, value: number): void {
    const relevantRules = this.alertRules.filter(rule => 
      rule.enabled && rule.metric === metricName
    );

    for (const rule of relevantRules) {
      const shouldAlert = this.evaluateCondition(value, rule.condition, rule.threshold);
      
      if (shouldAlert) {
        // 立即告警（用于严重问题）
        if (rule.severity === 'critical' && !this.activeAlerts.has(rule.id)) {
          const alert: Alert = {
            id: `${rule.id}-${Date.now()}`,
            ruleId: rule.id,
            severity: rule.severity,
            message: `${rule.name}: ${value} ${rule.condition.replace('_', ' ')} ${rule.threshold}`,
            metric: rule.metric,
            value,
            threshold: rule.threshold,
            timestamp: Date.now(),
            resolved: false
          };

          this.activeAlerts.set(rule.id, alert);
          this.alerts.push(alert);
          
          console.log(`🚨 紧急告警: ${alert.message}`);
          this.emit('critical-alert', alert);
        }
      }
    }
  }

  /**
   * 更新仪表板数据
   */
  private async updateDashboard(): Promise<void> {
    const now = performance.now();
    
    // 获取最新指标
    const memoryMetrics = this.getMetricHistory('memory-usage-mb', 60000); // 1分钟内
    const throughputMetrics = this.getMetricHistory('throughput-msg-sec', 60000);
    const latencyMetrics = this.getMetricHistory('latency-avg-ms', 60000);
    const websocketLatencyMetrics = this.getMetricHistory('websocket-latency-ms', 60000);
    const connectionMetrics = this.getMetricHistory('active-connections', 60000);

    const currentMemory = this.getLatestMetricValue(memoryMetrics);
    const currentThroughput = this.getLatestMetricValue(throughputMetrics);
    const currentLatency = this.getLatestMetricValue(latencyMetrics);
    const currentWebSocketLatency = this.getLatestMetricValue(websocketLatencyMetrics);
    const currentConnections = this.getLatestMetricValue(connectionMetrics);

    // 计算性能得分
    const performanceScore = this.calculatePerformanceScore({
      memory: currentMemory,
      throughput: currentThroughput,
      latency: currentLatency
    });

    this.dashboardData = {
      timestamp: now,
      systemMetrics: {
        memory: {
          current: currentMemory,
          target: PERFORMANCE_GOALS.MEMORY.TARGET_MB,
          usage: (currentMemory / PERFORMANCE_GOALS.MEMORY.TARGET_MB) * 100,
          trend: this.calculateTrend('memory-usage-mb', currentMemory)
        },
        throughput: {
          current: currentThroughput,
          target: PERFORMANCE_GOALS.THROUGHPUT.TARGET_MSG_SEC,
          messagesPerSecond: currentThroughput,
          trend: this.calculateTrend('throughput-msg-sec', currentThroughput)
        },
        latency: {
          current: currentLatency,
          target: PERFORMANCE_GOALS.LATENCY.TARGET_MS,
          averageMs: currentLatency,
          p95Ms: this.getLatestMetricValue(this.getMetricHistory('latency-p95-ms', 60000)),
          trend: this.calculateTrend('latency-avg-ms', currentLatency)
        },
        websocket: {
          connections: currentConnections,
          latencyMs: currentWebSocketLatency,
          status: this.determineWebSocketStatus(currentWebSocketLatency, currentConnections)
        }
      },
      alerts: this.getActiveAlerts(),
      performanceScore
    };
  }

  /**
   * 计算指标趋势
   */
  private calculateTrend(metricName: string, currentValue: number): 'up' | 'down' | 'stable' {
    const history = this.getMetricHistory(metricName, 300000); // 5分钟历史
    if (history.length < 3) return 'stable';

    const recent = history.slice(-3).map(m => m.value);
    const older = history.slice(-6, -3).map(m => m.value);
    
    if (recent.length < 3 || older.length < 3) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const changePercent = (recentAvg - olderAvg) / olderAvg;
    
    if (changePercent > 0.05) return 'up';
    if (changePercent < -0.05) return 'down';
    return 'stable';
  }

  /**
   * 确定指标状态
   */
  private determineStatus(metricName: string, value: number): 'healthy' | 'warning' | 'critical' {
    // 基于性能目标确定状态
    switch (metricName) {
      case 'memory-usage-mb':
        if (value > PERFORMANCE_GOALS.MEMORY.TARGET_MB * 2) return 'critical';
        if (value > PERFORMANCE_GOALS.MEMORY.TARGET_MB * 1.5) return 'warning';
        return 'healthy';
        
      case 'throughput-msg-sec':
        if (value < PERFORMANCE_GOALS.THROUGHPUT.TARGET_MSG_SEC * 0.5) return 'critical';
        if (value < PERFORMANCE_GOALS.THROUGHPUT.TARGET_MSG_SEC * 0.8) return 'warning';
        return 'healthy';
        
      case 'latency-avg-ms':
        if (value > PERFORMANCE_GOALS.LATENCY.TARGET_MS * 3) return 'critical';
        if (value > PERFORMANCE_GOALS.LATENCY.TARGET_MS * 2) return 'warning';
        return 'healthy';
        
      default:
        return 'healthy';
    }
  }

  /**
   * 确定WebSocket状态
   */
  private determineWebSocketStatus(latency: number, connections: number): 'healthy' | 'warning' | 'critical' {
    if (latency > PERFORMANCE_GOALS.WEBSOCKET_LATENCY.TARGET_MS * 3 || connections < 10) {
      return 'critical';
    }
    if (latency > PERFORMANCE_GOALS.WEBSOCKET_LATENCY.TARGET_MS * 2 || connections < 50) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * 获取最新指标值
   */
  private getLatestMetricValue(metrics: DashboardMetric[]): number {
    return metrics.length > 0 ? metrics[metrics.length - 1].value : 0;
  }

  /**
   * 评估告警条件
   */
  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    switch (condition) {
      case 'greater_than':
        return value > threshold;
      case 'less_than':
        return value < threshold;
      case 'equals':
        return value === threshold;
      case 'not_equals':
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * 计算性能评分
   */
  private calculatePerformanceScore(metrics: {
    memory: number;
    throughput: number;
    latency: number;
  }): {
    overall: number;
    memory: number;
    throughput: number;
    latency: number;
    stability: number;
  } {
    // 内存评分
    const memoryScore = Math.max(0, Math.min(100, 
      100 - ((metrics.memory - PERFORMANCE_GOALS.MEMORY.TARGET_MB) / PERFORMANCE_GOALS.MEMORY.TARGET_MB) * 100
    ));

    // 吞吐量评分
    const throughputScore = Math.min(100, 
      (metrics.throughput / PERFORMANCE_GOALS.THROUGHPUT.TARGET_MSG_SEC) * 100
    );

    // 延迟评分
    const latencyScore = Math.max(0, Math.min(100,
      100 - ((metrics.latency - PERFORMANCE_GOALS.LATENCY.TARGET_MS) / PERFORMANCE_GOALS.LATENCY.TARGET_MS) * 100
    ));

    // 稳定性评分（基于告警数量）
    const activeAlertCount = this.getActiveAlerts().length;
    const stabilityScore = Math.max(0, 100 - activeAlertCount * 20);

    // 综合评分
    const overallScore = (memoryScore + throughputScore + latencyScore + stabilityScore) / 4;

    return {
      overall: overallScore,
      memory: memoryScore,
      throughput: throughputScore,
      latency: latencyScore,
      stability: stabilityScore
    };
  }

  /**
   * 生成摘要报告
   */
  private generateSummary(): any {
    const totalAlerts = this.alerts.length;
    const activeAlerts = this.getActiveAlerts().length;
    const resolvedAlerts = totalAlerts - activeAlerts;
    
    const criticalAlerts = this.alerts.filter(a => a.severity === 'critical' && !a.resolved).length;
    const warningAlerts = this.alerts.filter(a => a.severity === 'warning' && !a.resolved).length;
    
    return {
      monitoringDuration: this.isRunning ? Date.now() - (this.alerts[0]?.timestamp || Date.now()) : 0,
      totalMetrics: this.metrics.size,
      totalAlerts,
      activeAlerts,
      resolvedAlerts,
      criticalAlerts,
      warningAlerts,
      performanceScore: this.dashboardData?.performanceScore?.overall || 0,
      status: criticalAlerts > 0 ? 'critical' : warningAlerts > 0 ? 'warning' : 'healthy'
    };
  }
}