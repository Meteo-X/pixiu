import * as fs from 'fs';
import * as path from 'path';
import { ExperimentStats } from './types';

// 日志颜色
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// 带时间戳的日志
export function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const timestamp = new Date().toISOString();
  const colorMap = {
    info: colors.blue,
    warn: colors.yellow,
    error: colors.red,
  };
  console.log(`${colorMap[level]}[${timestamp}] ${message}${colors.reset}`);
}

// 计算延迟
export function calculateLatency(eventTime: number): number {
  return Date.now() - eventTime;
}

// 格式化字节大小
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 保存数据到文件
export function saveDataSample(data: any, filename: string): void {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  log(`Data sample saved to ${filePath}`, 'info');
}

// 保存实验统计
export function saveExperimentStats(stats: ExperimentStats, experimentName: string): void {
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${experimentName}-${timestamp}.json`;
  const filePath = path.join(logsDir, filename);
  
  // 计算统计数据
  const avgLatency = stats.latencies.length > 0 
    ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length 
    : 0;
  const minLatency = stats.latencies.length > 0 ? Math.min(...stats.latencies) : 0;
  const maxLatency = stats.latencies.length > 0 ? Math.max(...stats.latencies) : 0;
  
  const report = {
    ...stats,
    duration: Date.now() - stats.connectionStartTime,
    statistics: {
      avgLatency,
      minLatency,
      maxLatency,
      messagesPerSecond: stats.messagesReceived / ((Date.now() - stats.connectionStartTime) / 1000),
    },
  };
  
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  log(`Experiment stats saved to ${filePath}`, 'info');
  
  // 打印统计摘要
  console.log(`\n${colors.green}========== Experiment Summary ==========${colors.reset}`);
  console.log(`Duration: ${(report.duration / 1000).toFixed(2)} seconds`);
  console.log(`Messages received: ${report.messagesReceived}`);
  console.log(`Bytes received: ${formatBytes(report.bytesReceived)}`);
  console.log(`Average latency: ${report.statistics.avgLatency.toFixed(2)} ms`);
  console.log(`Min/Max latency: ${report.statistics.minLatency} / ${report.statistics.maxLatency} ms`);
  console.log(`Messages per second: ${report.statistics.messagesPerSecond.toFixed(2)}`);
  console.log(`Errors: ${report.errors.length}`);
  console.log(`${colors.green}========================================${colors.reset}\n`);
}

// 优雅关闭处理
export function setupGracefulShutdown(cleanup: () => void): void {
  let isShuttingDown = false;
  
  const shutdown = () => {
    if (!isShuttingDown) {
      isShuttingDown = true;
      log('Shutting down gracefully...', 'warn');
      cleanup();
      process.exit(0);
    }
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}