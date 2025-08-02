/**
 * 监控系统核心类型定义
 */

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface MetricDefinition {
  name: string;
  description: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  unit?: string;
  labels?: string[];
}

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  timestamp: number;
  duration: number;
  metadata?: Record<string, any>;
}

export interface HealthCheckDefinition {
  name: string;
  check: () => Promise<HealthCheckResult>;
  interval: number;
  timeout: number;
  critical: boolean;
}

export interface LogLevel {
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel['level'];
  message: string;
  component: string;
  context?: Record<string, any>;
  error?: Error;
  traceId?: string;
  requestId?: string;
}

export interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    endpoint: string;
    port: number;
    path: string;
    labels?: Record<string, string>;
  };
  healthCheck: {
    enabled: boolean;
    endpoint: string;
    port: number;
    path: string;
    interval: number;
  };
  logging: {
    level: LogLevel['level'];
    format: 'json' | 'text';
    output: 'console' | 'file' | 'both';
    file?: {
      path: string;
      maxSize: string;
      maxFiles: number;
    };
  };
}

export interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  duration: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  enabled: boolean;
}

export interface Alert {
  id: string;
  rule: AlertRule;
  status: 'firing' | 'resolved';
  startTime: number;
  endTime?: number;
  value: number;
  labels: Record<string, string>;
}

export type MetricCollector = () => MetricValue[];
export type HealthChecker = () => Promise<HealthCheckResult>;
export type AlertHandler = (alert: Alert) => Promise<void>;