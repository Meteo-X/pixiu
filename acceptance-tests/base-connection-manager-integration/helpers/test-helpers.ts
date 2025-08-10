/**
 * 测试辅助工具函数
 */

import { EventEmitter } from 'events';
import { ConnectionState, ConnectionConfig } from '@pixiu/adapter-base';
import { BinanceConnectionConfig, BinanceConnectionMetrics } from '@pixiu/binance-adapter';

/**
 * 测试配置生成器
 */
export class TestConfigGenerator {
  
  /**
   * 生成基础连接配置
   */
  static generateBaseConnectionConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
    return {
      url: 'wss://stream.binance.com:9443/ws',
      timeout: 5000,
      maxRetries: 3,
      retryInterval: 1000,
      heartbeatInterval: 30000,
      heartbeatTimeout: 10000,
      enableCompression: false,
      headers: {
        'User-Agent': 'Pixiu/1.0'
      },
      ...overrides
    };
  }

  /**
   * 生成Binance连接配置
   */
  static generateBinanceConnectionConfig(overrides: Partial<BinanceConnectionConfig> = {}): BinanceConnectionConfig {
    const baseConfig = this.generateBaseConnectionConfig();
    
    return {
      ...baseConfig,
      binance: {
        testnet: true,
        enableCompression: true,
        combinedStream: {
          streams: ['btcusdt@ticker', 'ethusdt@ticker'],
          autoManage: true,
          maxStreams: 200,
          batchDelay: 500
        },
        connectionPool: {
          maxConnections: 5,
          connectionTimeout: 10000,
          idleTimeout: 300000
        },
        reconnectStrategy: {
          backoffBase: 2,
          maxRetryInterval: 30000,
          jitter: true
        }
      },
      ...overrides
    };
  }

  /**
   * 生成测试用的流名称列表
   */
  static generateStreamNames(count: number = 10, prefix: string = 'btcusdt'): string[] {
    const types = ['@ticker', '@trade', '@depth', '@kline_1m', '@kline_5m'];
    const symbols = ['btcusdt', 'ethusdt', 'adausdt', 'bnbusdt', 'xrpusdt'];
    const streams: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const symbol = symbols[i % symbols.length];
      const type = types[i % types.length];
      streams.push(`${symbol}${type}`);
    }
    
    return streams;
  }

  /**
   * 生成压力测试配置
   */
  static generateStressTestConfig(
    connectionCount: number = 10,
    streamsPerConnection: number = 50
  ): BinanceConnectionConfig[] {
    const configs: BinanceConnectionConfig[] = [];
    
    for (let i = 0; i < connectionCount; i++) {
      const streams = this.generateStreamNames(streamsPerConnection, `conn${i}`);
      configs.push(this.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams,
            autoManage: true,
            maxStreams: streamsPerConnection * 2,
            batchDelay: 200
          }
        }
      }));
    }
    
    return configs;
  }
}

/**
 * 事件监听器辅助类
 */
export class EventListenerHelper {
  private listeners = new Map<EventEmitter, Array<{ event: string; listener: Function }>>();

  /**
   * 添加事件监听器
   */
  addListener(emitter: EventEmitter, event: string, listener: Function): void {
    emitter.on(event, listener as any);
    
    if (!this.listeners.has(emitter)) {
      this.listeners.set(emitter, []);
    }
    
    this.listeners.get(emitter)!.push({ event, listener });
  }

  /**
   * 创建事件等待器
   */
  waitForEvent(
    emitter: EventEmitter, 
    event: string, 
    timeout: number = 5000,
    condition?: (data: any) => boolean
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for event '${event}' after ${timeout}ms`));
      }, timeout);

      const listener = (data: any) => {
        if (!condition || condition(data)) {
          cleanup();
          resolve(data);
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        emitter.off(event, listener);
      };

      this.addListener(emitter, event, listener);
    });
  }

  /**
   * 等待多个事件
   */
  waitForEvents(
    emitter: EventEmitter,
    events: string[],
    timeout: number = 5000
  ): Promise<Record<string, any>> {
    const eventPromises = events.map(event => 
      this.waitForEvent(emitter, event, timeout)
        .then(data => ({ [event]: data }))
    );

    return Promise.all(eventPromises)
      .then(results => Object.assign({}, ...results));
  }

  /**
   * 创建事件收集器
   */
  createEventCollector(emitter: EventEmitter, events: string[]): {
    events: Array<{ event: string; data: any; timestamp: number }>;
    getEventsByType: (eventType: string) => any[];
    getEventCount: (eventType?: string) => number;
    clear: () => void;
    stop: () => void;
  } {
    const collectedEvents: Array<{ event: string; data: any; timestamp: number }> = [];
    
    const collectors = events.map(event => {
      const listener = (data: any) => {
        collectedEvents.push({
          event,
          data,
          timestamp: Date.now()
        });
      };
      this.addListener(emitter, event, listener);
      return { event, listener };
    });

    return {
      events: collectedEvents,
      
      getEventsByType: (eventType: string) => 
        collectedEvents.filter(e => e.event === eventType).map(e => e.data),
        
      getEventCount: (eventType?: string) => 
        eventType 
          ? collectedEvents.filter(e => e.event === eventType).length
          : collectedEvents.length,
          
      clear: () => {
        collectedEvents.length = 0;
      },
      
      stop: () => {
        collectors.forEach(({ event, listener }) => {
          emitter.off(event, listener as any);
        });
      }
    };
  }

  /**
   * 清理所有监听器
   */
  cleanup(): void {
    for (const [emitter, listeners] of this.listeners) {
      for (const { event, listener } of listeners) {
        emitter.off(event, listener as any);
      }
    }
    this.listeners.clear();
  }
}

/**
 * 性能监控辅助类
 */
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();
  private startTimes = new Map<string, number>();

  /**
   * 开始计时
   */
  startTiming(operation: string): void {
    this.startTimes.set(operation, Date.now());
  }

  /**
   * 结束计时
   */
  endTiming(operation: string): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) {
      throw new Error(`No start time found for operation: ${operation}`);
    }

    const duration = Date.now() - startTime;
    
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(duration);
    
    this.startTimes.delete(operation);
    return duration;
  }

  /**
   * 记录值
   */
  recordValue(metric: string, value: number): void {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(value);
  }

  /**
   * 获取统计信息
   */
  getStats(metric: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    median: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics.get(metric);
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sorted.reduce((sum, val) => sum + val, 0) / count,
      median: sorted[Math.floor(count / 2)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)]
    };
  }

  /**
   * 获取所有指标的统计信息
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const metric of this.metrics.keys()) {
      stats[metric] = this.getStats(metric);
    }
    return stats;
  }

  /**
   * 清理指标
   */
  clear(): void {
    this.metrics.clear();
    this.startTimes.clear();
  }

  /**
   * 创建性能断言
   */
  createPerformanceAssertion(metric: string) {
    return {
      toBeFasterThan: (maxDuration: number) => {
        const stats = this.getStats(metric);
        if (!stats) {
          throw new Error(`No metrics found for: ${metric}`);
        }
        if (stats.avg > maxDuration) {
          throw new Error(
            `Performance assertion failed: ${metric} average (${stats.avg}ms) exceeded ${maxDuration}ms`
          );
        }
      },
      
      toHaveMaxLatency: (maxLatency: number) => {
        const stats = this.getStats(metric);
        if (!stats) {
          throw new Error(`No metrics found for: ${metric}`);
        }
        if (stats.max > maxLatency) {
          throw new Error(
            `Performance assertion failed: ${metric} max (${stats.max}ms) exceeded ${maxLatency}ms`
          );
        }
      },
      
      toHave95thPercentileBelow: (threshold: number) => {
        const stats = this.getStats(metric);
        if (!stats) {
          throw new Error(`No metrics found for: ${metric}`);
        }
        if (stats.p95 > threshold) {
          throw new Error(
            `Performance assertion failed: ${metric} 95th percentile (${stats.p95}ms) exceeded ${threshold}ms`
          );
        }
      }
    };
  }
}

/**
 * 内存监控辅助类
 */
export class MemoryMonitor {
  private baseline?: NodeJS.MemoryUsage;
  private snapshots: Array<{ timestamp: number; memory: NodeJS.MemoryUsage }> = [];

  /**
   * 记录基线内存使用
   */
  recordBaseline(): void {
    // 强制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
    }
    
    this.baseline = process.memoryUsage();
    this.snapshots = [];
  }

  /**
   * 拍摄内存快照
   */
  takeSnapshot(): NodeJS.MemoryUsage {
    const memory = process.memoryUsage();
    this.snapshots.push({
      timestamp: Date.now(),
      memory
    });
    return memory;
  }

  /**
   * 检查内存泄漏
   */
  checkForMemoryLeaks(threshold: number = 50 * 1024 * 1024): {
    hasLeak: boolean;
    heapGrowth: number;
    externalGrowth: number;
    totalGrowth: number;
  } {
    if (!this.baseline) {
      throw new Error('No baseline recorded. Call recordBaseline() first.');
    }

    const current = process.memoryUsage();
    const heapGrowth = current.heapUsed - this.baseline.heapUsed;
    const externalGrowth = current.external - this.baseline.external;
    const totalGrowth = heapGrowth + externalGrowth;

    return {
      hasLeak: totalGrowth > threshold,
      heapGrowth,
      externalGrowth,
      totalGrowth
    };
  }

  /**
   * 获取内存使用趋势
   */
  getMemoryTrend(): {
    trend: 'increasing' | 'decreasing' | 'stable';
    avgGrowthRate: number;
    maxHeapUsed: number;
    minHeapUsed: number;
  } | null {
    if (this.snapshots.length < 2) {
      return null;
    }

    const heapValues = this.snapshots.map(s => s.memory.heapUsed);
    const growthRates: number[] = [];
    
    for (let i = 1; i < this.snapshots.length; i++) {
      const prev = this.snapshots[i - 1];
      const curr = this.snapshots[i];
      const timeDiff = curr.timestamp - prev.timestamp;
      const memDiff = curr.memory.heapUsed - prev.memory.heapUsed;
      growthRates.push(memDiff / timeDiff);
    }

    const avgGrowthRate = growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (avgGrowthRate > 1000) { // 1KB/ms threshold
      trend = 'increasing';
    } else if (avgGrowthRate < -1000) {
      trend = 'decreasing';
    }

    return {
      trend,
      avgGrowthRate,
      maxHeapUsed: Math.max(...heapValues),
      minHeapUsed: Math.min(...heapValues)
    };
  }

  /**
   * 强制垃圾回收并等待
   */
  async forceGC(): Promise<void> {
    if (global.gc) {
      global.gc();
      // 等待垃圾回收完成
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  /**
   * 清理快照
   */
  clear(): void {
    this.baseline = undefined;
    this.snapshots = [];
  }
}

/**
 * 网络条件模拟器
 */
export class NetworkConditionSimulator {
  
  /**
   * 模拟网络延迟
   */
  static simulateLatency(baseLatency: number, jitter: number = 0.1): number {
    const variation = baseLatency * jitter * (Math.random() - 0.5);
    return Math.max(0, baseLatency + variation);
  }

  /**
   * 模拟数据包丢失
   */
  static simulatePacketLoss(probability: number = 0.05): boolean {
    return Math.random() < probability;
  }

  /**
   * 模拟带宽限制
   */
  static simulateBandwidthLimit(dataSize: number, bandwidthKbps: number): number {
    // 返回传输时间（毫秒）
    return (dataSize * 8) / (bandwidthKbps * 1024) * 1000;
  }

  /**
   * 模拟网络中断
   */
  static simulateNetworkOutage(duration: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, duration);
    });
  }
}