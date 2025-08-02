/**
 * 统计信息报告器
 * 定时打印 WebSocket 接收和 Pub/Sub 发布统计信息
 */

import { EventEmitter } from 'events';
import { BaseMonitor } from '@pixiu/shared-core';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';

export interface StatsSnapshot {
  /** 时间戳 */
  timestamp: number;
  /** 适配器统计 */
  adapters: {
    [name: string]: {
      /** 适配器状态 */
      status: string;
      /** 是否健康 */
      healthy: boolean;
      /** WebSocket 接收的消息总数 */
      messagesReceived: number;
      /** 发布到 Pub/Sub 的消息总数 */
      messagesPublished: number;
      /** 处理错误数 */
      processingErrors: number;
      /** 发布错误数 */
      publishErrors: number;
      /** 平均处理延迟 (ms) */
      avgLatency: number;
      /** 最后活动时间 */
      lastActivity: number;
    };
  };
  /** 总计统计 */
  totals: {
    messagesReceived: number;
    messagesPublished: number;
    processingErrors: number;
    publishErrors: number;
    activeAdapters: number;
  };
}

export interface StatsDelta {
  /** 时间间隔 (ms) */
  intervalMs: number;
  /** 增量统计 */
  deltas: {
    [name: string]: {
      messagesReceived: number;
      messagesPublished: number;
      processingErrors: number;
      publishErrors: number;
    };
  };
  /** 速率统计 (每秒) */
  rates: {
    [name: string]: {
      messagesReceivedPerSec: number;
      messagesPublishedPerSec: number;
      errorRate: number;
    };
  };
  /** 总速率 */
  totalRates: {
    totalReceivedPerSec: number;
    totalPublishedPerSec: number;
    totalErrorRate: number;
  };
}

export interface StatsReporterConfig {
  /** 报告间隔 (ms) */
  reportInterval: number;
  /** 是否启用详细模式 */
  verbose: boolean;
  /** 是否显示零值 */
  showZeroValues: boolean;
  /** 日志级别 */
  logLevel: 'info' | 'debug';
}

/**
 * 统计信息报告器
 */
export class StatsReporter extends EventEmitter {
  private adapterRegistry: AdapterRegistry;
  private monitor: BaseMonitor;
  private config: StatsReporterConfig;
  
  private reportTimer?: NodeJS.Timeout;
  private isRunning = false;
  private lastSnapshot?: StatsSnapshot;
  private startTime: number;
  
  constructor(
    adapterRegistry: AdapterRegistry,
    monitor: BaseMonitor,
    config: Partial<StatsReporterConfig> = {}
  ) {
    super();
    
    this.adapterRegistry = adapterRegistry;
    this.monitor = monitor;
    this.startTime = Date.now();
    
    // 默认配置
    this.config = {
      reportInterval: 30000, // 30秒
      verbose: false,
      showZeroValues: false,
      logLevel: 'info',
      ...config
    };
  }

  /**
   * 启动统计报告
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.scheduleNextReport();
    
    this.monitor.log('info', 'Stats reporter started', {
      reportInterval: this.config.reportInterval,
      verbose: this.config.verbose
    });
  }

  /**
   * 停止统计报告
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.reportTimer) {
      clearTimeout(this.reportTimer);
      this.reportTimer = undefined;
    }
    
    this.monitor.log('info', 'Stats reporter stopped');
  }

  /**
   * 获取当前统计快照
   */
  getCurrentSnapshot(): StatsSnapshot {
    const registryStatus = this.adapterRegistry.getStatus();
    const timestamp = Date.now();
    
    const adapters: StatsSnapshot['adapters'] = {};
    let totalReceived = 0;
    let totalPublished = 0;
    let totalProcessingErrors = 0;
    let totalPublishErrors = 0;
    let activeAdapters = 0;

    for (const instanceStatus of registryStatus.instanceStatuses) {
      const metrics = instanceStatus.metrics;
      
      adapters[instanceStatus.name] = {
        status: instanceStatus.status,
        healthy: instanceStatus.healthy,
        messagesReceived: metrics.messagesProcessed,
        messagesPublished: metrics.messagesPublished,
        processingErrors: metrics.processingErrors,
        publishErrors: metrics.publishErrors,
        avgLatency: Math.round(metrics.averageProcessingLatency * 100) / 100,
        lastActivity: metrics.lastActivity
      };
      
      totalReceived += metrics.messagesProcessed;
      totalPublished += metrics.messagesPublished;
      totalProcessingErrors += metrics.processingErrors;
      totalPublishErrors += metrics.publishErrors;
      
      if (instanceStatus.healthy) {
        activeAdapters++;
      }
    }

    return {
      timestamp,
      adapters,
      totals: {
        messagesReceived: totalReceived,
        messagesPublished: totalPublished,
        processingErrors: totalProcessingErrors,
        publishErrors: totalPublishErrors,
        activeAdapters
      }
    };
  }

  /**
   * 计算统计增量
   */
  private calculateDelta(current: StatsSnapshot, previous: StatsSnapshot): StatsDelta {
    const intervalMs = current.timestamp - previous.timestamp;
    const intervalSec = intervalMs / 1000;
    
    const deltas: StatsDelta['deltas'] = {};
    const rates: StatsDelta['rates'] = {};
    
    let totalReceivedDelta = 0;
    let totalPublishedDelta = 0;
    let totalErrorDelta = 0;

    for (const [name, currentStats] of Object.entries(current.adapters)) {
      const previousStats = previous.adapters[name];
      if (!previousStats) continue;
      
      const receivedDelta = currentStats.messagesReceived - previousStats.messagesReceived;
      const publishedDelta = currentStats.messagesPublished - previousStats.messagesPublished;
      const processingErrorDelta = currentStats.processingErrors - previousStats.processingErrors;
      const publishErrorDelta = currentStats.publishErrors - previousStats.publishErrors;
      
      deltas[name] = {
        messagesReceived: receivedDelta,
        messagesPublished: publishedDelta,
        processingErrors: processingErrorDelta,
        publishErrors: publishErrorDelta
      };
      
      rates[name] = {
        messagesReceivedPerSec: Math.round((receivedDelta / intervalSec) * 100) / 100,
        messagesPublishedPerSec: Math.round((publishedDelta / intervalSec) * 100) / 100,
        errorRate: Math.round(((processingErrorDelta + publishErrorDelta) / intervalSec) * 100) / 100
      };
      
      totalReceivedDelta += receivedDelta;
      totalPublishedDelta += publishedDelta;
      totalErrorDelta += processingErrorDelta + publishErrorDelta;
    }

    return {
      intervalMs,
      deltas,
      rates,
      totalRates: {
        totalReceivedPerSec: Math.round((totalReceivedDelta / intervalSec) * 100) / 100,
        totalPublishedPerSec: Math.round((totalPublishedDelta / intervalSec) * 100) / 100,
        totalErrorRate: Math.round((totalErrorDelta / intervalSec) * 100) / 100
      }
    };
  }

  /**
   * 安排下次报告
   */
  private scheduleNextReport(): void {
    if (!this.isRunning) {
      return;
    }

    this.reportTimer = setTimeout(() => {
      this.generateReport();
      this.scheduleNextReport();
    }, this.config.reportInterval);
  }

  /**
   * 生成统计报告
   */
  private generateReport(): void {
    try {
      const currentSnapshot = this.getCurrentSnapshot();
      const uptimeMs = currentSnapshot.timestamp - this.startTime;
      const uptimeMin = Math.floor(uptimeMs / 60000);
      const uptimeSec = Math.floor((uptimeMs % 60000) / 1000);

      if (this.lastSnapshot) {
        // 计算增量并生成详细报告
        const delta = this.calculateDelta(currentSnapshot, this.lastSnapshot);
        this.generateDeltaReport(currentSnapshot, delta, uptimeMin, uptimeSec);
      } else {
        // 首次报告，只显示累计数据
        this.generateInitialReport(currentSnapshot, uptimeMin, uptimeSec);
      }

      this.lastSnapshot = currentSnapshot;
      this.emit('reportGenerated', currentSnapshot);
    } catch (error) {
      this.monitor.log('error', 'Failed to generate stats report', { error });
    }
  }

  /**
   * 生成初始报告
   */
  private generateInitialReport(snapshot: StatsSnapshot, uptimeMin: number, uptimeSec: number): void {
    const report = [];
    
    report.push(`=== Exchange Collector 统计报告 ===`);
    report.push(`运行时间: ${uptimeMin}分${uptimeSec}秒, 活跃适配器: ${snapshot.totals.activeAdapters}`);
    
    for (const [name, stats] of Object.entries(snapshot.adapters)) {
      const status = stats.healthy ? 'OK' : 'ERROR';
      const errors = stats.processingErrors + stats.publishErrors;
      report.push(`${name}: ${status} | WebSocket接收: ${stats.messagesReceived} | Pub/Sub发布: ${stats.messagesPublished} | 错误: ${errors} | 延迟: ${stats.avgLatency.toFixed(1)}ms`);
    }
    
    const totalErrors = snapshot.totals.processingErrors + snapshot.totals.publishErrors;
    report.push(`总计: 接收 ${snapshot.totals.messagesReceived}, 发布 ${snapshot.totals.messagesPublished}, 错误 ${totalErrors}`);
    report.push(`=====================================`);

    // 输出为单个日志消息
    this.monitor.log(this.config.logLevel, report.join('\n'));
  }

  /**
   * 生成增量报告
   */
  private generateDeltaReport(
    snapshot: StatsSnapshot, 
    delta: StatsDelta, 
    uptimeMin: number, 
    uptimeSec: number
  ): void {
    const intervalSec = Math.round(delta.intervalMs / 1000);
    const report = [];
    
    report.push(`=== Exchange Collector 实时统计报告 ===`);
    report.push(`运行时间: ${uptimeMin}分${uptimeSec}秒, 统计间隔: ${intervalSec}秒, 活跃适配器: ${snapshot.totals.activeAdapters}`);

    for (const [name, stats] of Object.entries(snapshot.adapters)) {
      const rates = delta.rates[name];
      if (!rates) continue;
      
      // 如果配置为不显示零值，且该适配器无活动，则跳过
      if (!this.config.showZeroValues && rates.messagesReceivedPerSec === 0 && rates.messagesPublishedPerSec === 0) {
        continue;
      }
      
      const status = stats.healthy ? 'OK' : 'ERROR';
      const errors = stats.processingErrors + stats.publishErrors;
      report.push(`${name}: ${status} | 接收速率: ${rates.messagesReceivedPerSec}/秒 | 发布速率: ${rates.messagesPublishedPerSec}/秒 | 错误速率: ${rates.errorRate}/秒`);
      report.push(`  累计: 接收 ${stats.messagesReceived}, 发布 ${stats.messagesPublished}, 错误 ${errors}, 延迟 ${stats.avgLatency.toFixed(1)}ms`);
    }

    report.push(`总速率: 接收 ${delta.totalRates.totalReceivedPerSec}/秒, 发布 ${delta.totalRates.totalPublishedPerSec}/秒, 错误 ${delta.totalRates.totalErrorRate}/秒`);
    report.push(`总累计: 接收 ${snapshot.totals.messagesReceived}, 发布 ${snapshot.totals.messagesPublished}, 错误 ${snapshot.totals.processingErrors + snapshot.totals.publishErrors}`);

    // 如果启用详细模式，添加额外信息
    if (this.config.verbose) {
      report.push('详细信息:');
      for (const [name, stats] of Object.entries(snapshot.adapters)) {
        const lastActivityAgo = Math.round((snapshot.timestamp - stats.lastActivity) / 1000);
        report.push(`  ${name}: 状态=${stats.status}, 最后活动=${lastActivityAgo}秒前, 处理错误=${stats.processingErrors}, 发布错误=${stats.publishErrors}`);
      }
    }
    
    report.push(`=====================================`);

    // 输出为单个日志消息
    this.monitor.log(this.config.logLevel, report.join('\n'));
  }

  /**
   * 获取配置
   */
  getConfig(): StatsReporterConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<StatsReporterConfig>): void {
    this.config = { ...this.config, ...config };
    
    // 如果报告间隔改变，重新安排定时器
    if (config.reportInterval && this.isRunning) {
      this.stop();
      this.start();
    }
  }
}