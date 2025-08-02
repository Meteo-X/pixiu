/**
 * 监控系统基类
 * 提供统一的指标收集、健康检查和日志记录功能
 */

import { EventEmitter } from 'events';
import { register, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';
import * as winston from 'winston';
import {
  MetricValue,
  MetricDefinition,
  HealthCheckResult,
  HealthCheckDefinition,
  LogEntry,
  MonitoringConfig,
  AlertRule,
  Alert,
  MetricCollector,
  HealthChecker,
  AlertHandler
} from './types';

export class BaseMonitor extends EventEmitter {
  private metrics: Map<string, any> = new Map();
  private healthChecks: Map<string, HealthCheckDefinition> = new Map();
  private alerts: Map<string, AlertRule> = new Map();
  private alertHandlers: AlertHandler[] = [];
  private logger!: winston.Logger;
  private healthCheckInterval?: NodeJS.Timeout;
  private alertCheckInterval?: NodeJS.Timeout;

  constructor(private config: MonitoringConfig) {
    super();
    this.setupLogger();
    this.setupMetrics();
    this.startHealthChecks();
    this.startAlertChecking();
  }

  /**
   * 注册指标
   */
  registerMetric(definition: MetricDefinition): void {
    const { name, description, type, labels = [] } = definition;

    let metric;
    switch (type) {
      case 'counter':
        metric = new Counter({
          name,
          help: description,
          labelNames: labels,
          registers: [register]
        });
        break;
      case 'gauge':
        metric = new Gauge({
          name,
          help: description,
          labelNames: labels,
          registers: [register]
        });
        break;
      case 'histogram':
        metric = new Histogram({
          name,
          help: description,
          labelNames: labels,
          registers: [register]
        });
        break;
      case 'summary':
        metric = new Summary({
          name,
          help: description,
          labelNames: labels,
          registers: [register]
        });
        break;
      default:
        throw new Error(`Unsupported metric type: ${type}`);
    }

    this.metrics.set(name, metric);
    this.log('debug', `Registered metric: ${name}`, { type, description });
  }

  /**
   * 更新指标值
   */
  updateMetric(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      this.log('warn', `Metric not found: ${name}`);
      return;
    }

    try {
      if (labels) {
        metric.labels(labels).set(value);
      } else {
        metric.set(value);
      }
    } catch (error) {
      this.log('error', `Failed to update metric ${name}`, { error, value, labels });
    }
  }

  /**
   * 增加计数器
   */
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.constructor.name !== 'Counter') {
      this.log('warn', `Counter metric not found: ${name}`);
      return;
    }

    try {
      if (labels) {
        metric.labels(labels).inc(value);
      } else {
        metric.inc(value);
      }
    } catch (error) {
      this.log('error', `Failed to increment counter ${name}`, { error, value, labels });
    }
  }

  /**
   * 记录直方图
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.constructor.name !== 'Histogram') {
      this.log('warn', `Histogram metric not found: ${name}`);
      return;
    }

    try {
      if (labels) {
        metric.labels(labels).observe(value);
      } else {
        metric.observe(value);
      }
    } catch (error) {
      this.log('error', `Failed to observe histogram ${name}`, { error, value, labels });
    }
  }

  /**
   * 注册健康检查
   */
  registerHealthCheck(definition: HealthCheckDefinition): void {
    this.healthChecks.set(definition.name, definition);
    this.log('debug', `Registered health check: ${definition.name}`, {
      interval: definition.interval,
      timeout: definition.timeout,
      critical: definition.critical
    });
  }

  /**
   * 执行单个健康检查
   */
  async runHealthCheck(name: string): Promise<HealthCheckResult> {
    const definition = this.healthChecks.get(name);
    if (!definition) {
      throw new Error(`Health check not found: ${name}`);
    }

    const startTime = Date.now();
    try {
      const result = await Promise.race([
        definition.check(),
        this.timeout(definition.timeout, `Health check ${name} timed out`)
      ]) as HealthCheckResult;

      this.log('debug', `Health check completed: ${name}`, {
        status: result.status,
        duration: result.duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: HealthCheckResult = {
        name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: startTime,
        duration
      };

      this.log('error', `Health check failed: ${name}`, { error, duration });
      return result;
    }
  }

  /**
   * 执行所有健康检查
   */
  async runAllHealthChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    
    for (const [name, definition] of this.healthChecks) {
      try {
        const result = await this.runHealthCheck(name);
        results.push(result);
      } catch (error) {
        results.push({
          name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
          duration: 0
        });
      }
    }

    return results;
  }

  /**
   * 获取整体健康状态
   */
  async getOverallHealth(): Promise<{ status: 'healthy' | 'unhealthy' | 'degraded'; checks: HealthCheckResult[] }> {
    const checks = await this.runAllHealthChecks();
    
    const criticalFailures = checks.filter(check => {
      const definition = this.healthChecks.get(check.name);
      return definition?.critical && check.status === 'unhealthy';
    });

    const anyFailures = checks.some(check => check.status === 'unhealthy');
    const anyDegraded = checks.some(check => check.status === 'degraded');

    let status: 'healthy' | 'unhealthy' | 'degraded';
    if (criticalFailures.length > 0) {
      status = 'unhealthy';
    } else if (anyFailures || anyDegraded) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return { status, checks };
  }

  /**
   * 记录日志
   */
  log(level: 'error' | 'warn' | 'info' | 'debug' | 'trace', message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      component: 'monitor',
      context,
      traceId: context?.traceId,
      requestId: context?.requestId
    };

    this.logger.log(level, message, context);
    this.emit('log', entry);
  }

  /**
   * 注册告警规则
   */
  registerAlert(rule: AlertRule): void {
    this.alerts.set(rule.name, rule);
    this.log('debug', `Registered alert rule: ${rule.name}`, {
      condition: rule.condition,
      threshold: rule.threshold,
      severity: rule.severity
    });
  }

  /**
   * 添加告警处理器
   */
  addAlertHandler(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  /**
   * 获取指标数据
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
    register.clear();
  }

  /**
   * 设置日志记录器
   */
  private setupLogger(): void {
    const { level, format, output, file } = this.config.logging;

    const transports: winston.transport[] = [];

    if (output === 'console' || output === 'both') {
      transports.push(new winston.transports.Console({
        format: format === 'json' 
          ? winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            )
          : winston.format.combine(
              winston.format.timestamp(),
              winston.format.simple()
            )
      }));
    }

    if ((output === 'file' || output === 'both') && file) {
      transports.push(new winston.transports.File({
        filename: file.path,
        maxsize: this.parseSize(file.maxSize),
        maxFiles: file.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    this.logger = winston.createLogger({
      level,
      transports
    });
  }

  /**
   * 设置指标收集
   */
  private setupMetrics(): void {
    if (this.config.metrics.enabled) {
      // 收集默认指标
      collectDefaultMetrics({ register });

      // 注册基础指标
      this.registerMetric({
        name: 'app_info',
        description: 'Application information',
        type: 'gauge',
        labels: ['version', 'environment']
      });
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthChecks(): void {
    if (this.config.healthCheck.enabled && this.config.healthCheck.interval > 0) {
      this.healthCheckInterval = setInterval(async () => {
        try {
          const results = await this.runAllHealthChecks();
          this.emit('healthCheck', results);
        } catch (error) {
          this.log('error', 'Health check execution failed', { error });
        }
      }, this.config.healthCheck.interval);
    }
  }

  /**
   * 启动告警检查
   */
  private startAlertChecking(): void {
    // 实现告警检查逻辑
    this.alertCheckInterval = setInterval(async () => {
      // 检查告警规则
      for (const [name, rule] of this.alerts) {
        if (!rule.enabled) continue;
        
        try {
          // 这里需要根据规则条件检查指标值
          // 简化实现，实际应该根据规则条件查询指标
          await this.checkAlertRule(rule);
        } catch (error) {
          this.log('error', `Alert rule check failed: ${name}`, { error });
        }
      }
    }, 10000); // 每10秒检查一次
  }

  /**
   * 检查告警规则
   */
  private async checkAlertRule(rule: AlertRule): Promise<void> {
    // 简化的告警检查实现
    // 实际实现需要根据规则条件查询相应的指标值
  }

  /**
   * 超时工具函数
   */
  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * 解析文件大小字符串
   */
  private parseSize(size: string): number {
    const units: Record<string, number> = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024
    };

    const match = size.toLowerCase().match(/^(\d+)([a-z]+)$/);
    if (!match) {
      return parseInt(size, 10);
    }

    const [, value, unit] = match;
    return parseInt(value, 10) * (units[unit] || 1);
  }
}