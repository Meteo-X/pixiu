/**
 * 增强测试工具集
 * 为重构后的架构测试提供实用工具函数
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import { MarketData } from '@pixiu/adapter-base';
import { EnhancedMockFactory } from './enhanced-mock-factory';

/**
 * 测试超时错误
 */
export class TestTimeoutError extends Error {
  constructor(message: string, timeout: number) {
    super(`${message} (timeout: ${timeout}ms)`);
    this.name = 'TestTimeoutError';
  }
}

/**
 * 性能测试结果
 */
export interface PerformanceResult {
  duration: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  throughput: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

/**
 * 并发测试结果
 */
export interface ConcurrencyResult {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  averageConnectionTime: number;
  peakMemoryUsage: number;
}

/**
 * 测试工具类
 */
export class TestUtils {
  /**
   * 等待条件满足或超时
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 50,
    errorMessage?: string
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) {
        return;
      }
      await this.sleep(interval);
    }
    
    throw new TestTimeoutError(
      errorMessage || 'Condition not met within timeout',
      timeout
    );
  }

  /**
   * 等待事件触发
   */
  static async waitForEvent<T = any>(
    emitter: EventEmitter,
    eventName: string,
    timeout: number = 5000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        emitter.removeListener(eventName, onEvent);
        reject(new TestTimeoutError(`Event '${eventName}' not received`, timeout));
      }, timeout);

      const onEvent = (data: T) => {
        clearTimeout(timeoutId);
        resolve(data);
      };

      emitter.once(eventName, onEvent);
    });
  }

  /**
   * 等待多个事件
   */
  static async waitForEvents(
    events: Array<{ emitter: EventEmitter; event: string }>,
    timeout: number = 5000
  ): Promise<any[]> {
    const promises = events.map(({ emitter, event }) =>
      this.waitForEvent(emitter, event, timeout)
    );
    
    return Promise.all(promises);
  }

  /**
   * 异步延迟
   */
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建测试用的市场数据
   */
  static createMarketData(overrides: Partial<MarketData> = {}): MarketData {
    return EnhancedMockFactory.createMarketDataMock(overrides);
  }

  /**
   * 创建测试用的市场数据流
   */
  static createMarketDataStream(
    count: number,
    intervalMs: number = 100,
    baseData: Partial<MarketData> = {}
  ): AsyncGenerator<MarketData> {
    return this.generateMarketDataStream(count, intervalMs, baseData);
  }

  /**
   * 生成市场数据流
   */
  private static async *generateMarketDataStream(
    count: number,
    intervalMs: number,
    baseData: Partial<MarketData>
  ): AsyncGenerator<MarketData> {
    for (let i = 0; i < count; i++) {
      await this.sleep(intervalMs);
      
      yield this.createMarketData({
        ...baseData,
        timestamp: Date.now(),
        data: {
          symbol: baseData.symbol || 'BTCUSDT',
          price: ((50000 + Math.random() * 1000)).toFixed(2),
          volume: ((1000 + Math.random() * 500)).toFixed(2),
          change: (Math.random() * 10 - 5).toFixed(2),
          changePercent: (Math.random() * 0.1 - 0.05).toFixed(4),
          ...baseData.data
        }
      });
    }
  }

  /**
   * 创建高频数据流（用于性能测试）
   */
  static createHighFrequencyDataStream(
    durationMs: number,
    targetThroughput: number = 1000,
    symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
  ): AsyncGenerator<MarketData> {
    return this.generateHighFrequencyData(durationMs, targetThroughput, symbols);
  }

  /**
   * 生成高频数据
   */
  private static async *generateHighFrequencyData(
    durationMs: number,
    targetThroughput: number,
    symbols: string[]
  ): AsyncGenerator<MarketData> {
    const intervalMs = 1000 / targetThroughput;
    const endTime = Date.now() + durationMs;
    let messageCount = 0;

    while (Date.now() < endTime) {
      const symbol = symbols[messageCount % symbols.length];
      
      yield this.createMarketData({
        symbol,
        data: {
          symbol,
          price: (50000 + Math.sin(messageCount * 0.01) * 1000).toFixed(2),
          volume: (1000 + Math.random() * 500).toFixed(2),
          change: (Math.random() * 10 - 5).toFixed(2),
          changePercent: (Math.random() * 0.1 - 0.05).toFixed(4)
        }
      });

      messageCount++;
      
      if (intervalMs > 1) {
        await this.sleep(intervalMs);
      }
    }
  }

  /**
   * 测试性能
   */
  static async testPerformance<T>(
    operation: () => Promise<T> | T,
    iterations: number = 1000,
    warmupIterations: number = 100
  ): Promise<PerformanceResult> {
    const latencies: number[] = [];
    const startMemory = process.memoryUsage();
    
    // 预热
    for (let i = 0; i < warmupIterations; i++) {
      await operation();
    }

    // 正式测试
    const overallStart = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      latencies.push(end - start);
    }
    
    const overallEnd = performance.now();
    const overallDuration = overallEnd - overallStart;
    const endMemory = process.memoryUsage();

    return {
      duration: overallDuration,
      averageLatency: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      minLatency: Math.min(...latencies),
      maxLatency: Math.max(...latencies),
      throughput: (iterations * 1000) / overallDuration,
      memoryUsage: {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
        arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
      }
    };
  }

  /**
   * 测试并发连接
   */
  static async testConcurrency(
    createConnection: () => Promise<void>,
    maxConnections: number = 1000,
    concurrencyLevel: number = 100
  ): Promise<ConcurrencyResult> {
    const results: boolean[] = [];
    const connectionTimes: number[] = [];
    let peakMemoryUsage = 0;

    // 分批创建连接以控制并发级别
    for (let batch = 0; batch < maxConnections; batch += concurrencyLevel) {
      const batchSize = Math.min(concurrencyLevel, maxConnections - batch);
      const batchPromises: Promise<void>[] = [];

      for (let i = 0; i < batchSize; i++) {
        batchPromises.push(
          this.measureConnectionTime(createConnection)
            .then(({ success, duration }) => {
              results.push(success);
              if (success) {
                connectionTimes.push(duration);
              }
            })
        );
      }

      await Promise.allSettled(batchPromises);
      
      // 记录内存使用峰值
      const currentMemory = process.memoryUsage().heapUsed;
      peakMemoryUsage = Math.max(peakMemoryUsage, currentMemory);
    }

    const successfulConnections = results.filter(r => r).length;
    const failedConnections = results.filter(r => !r).length;

    return {
      totalConnections: maxConnections,
      successfulConnections,
      failedConnections,
      averageConnectionTime: connectionTimes.length > 0 
        ? connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length 
        : 0,
      peakMemoryUsage
    };
  }

  /**
   * 测量连接时间
   */
  private static async measureConnectionTime(
    createConnection: () => Promise<void>
  ): Promise<{ success: boolean; duration: number }> {
    const start = performance.now();
    
    try {
      await createConnection();
      const end = performance.now();
      return { success: true, duration: end - start };
    } catch (error) {
      const end = performance.now();
      return { success: false, duration: end - start };
    }
  }

  /**
   * 创建测试配置
   */
  static createTestConfig(overrides: any = {}): any {
    return EnhancedMockFactory.createUnifiedConfigMock(overrides);
  }

  /**
   * 模拟网络延迟
   */
  static async simulateNetworkLatency(
    minMs: number = 10,
    maxMs: number = 50
  ): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await this.sleep(delay);
  }

  /**
   * 模拟网络错误
   */
  static simulateNetworkError(errorRate: number = 0.1): boolean {
    return Math.random() < errorRate;
  }

  /**
   * 创建压力测试场景
   */
  static async runStressTest<T>(
    operation: () => Promise<T>,
    options: {
      durationMs: number;
      targetThroughput: number;
      maxErrors?: number;
      errorThreshold?: number;
    }
  ): Promise<{
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageLatency: number;
    errorsPerSecond: number;
    throughput: number;
  }> {
    const { durationMs, targetThroughput, maxErrors = 100, errorThreshold = 0.05 } = options;
    const intervalMs = 1000 / targetThroughput;
    const endTime = Date.now() + durationMs;
    
    let totalOperations = 0;
    let successfulOperations = 0;
    let failedOperations = 0;
    const latencies: number[] = [];

    while (Date.now() < endTime && failedOperations < maxErrors) {
      const start = performance.now();
      
      try {
        await operation();
        successfulOperations++;
        const end = performance.now();
        latencies.push(end - start);
      } catch (error) {
        failedOperations++;
      }
      
      totalOperations++;
      
      // 检查错误率
      const errorRate = failedOperations / totalOperations;
      if (errorRate > errorThreshold && totalOperations > 100) {
        console.warn(`Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(errorThreshold * 100).toFixed(2)}%`);
        break;
      }
      
      if (intervalMs > 1) {
        await this.sleep(intervalMs);
      }
    }

    const actualDuration = Math.min(Date.now() - (Date.now() - durationMs), durationMs);

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageLatency: latencies.length > 0 
        ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length 
        : 0,
      errorsPerSecond: (failedOperations * 1000) / actualDuration,
      throughput: (totalOperations * 1000) / actualDuration
    };
  }

  /**
   * 验证测试环境
   */
  static validateTestEnvironment(): {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 检查Node.js版本
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 16) {
      issues.push(`Node.js version ${nodeVersion} is too old (minimum: 16)`);
    }

    // 检查可用内存
    const totalMemory = require('os').totalmem();
    const availableMemory = require('os').freemem();
    const memoryUsagePercent = ((totalMemory - availableMemory) / totalMemory) * 100;
    
    if (memoryUsagePercent > 80) {
      issues.push(`High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
      recommendations.push('Consider closing other applications or increasing available memory');
    }

    // 检查测试运行环境
    if (process.env.NODE_ENV !== 'test') {
      recommendations.push('Set NODE_ENV=test for optimal test performance');
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * 格式化测试结果
   */
  static formatPerformanceResult(result: PerformanceResult): string {
    return `
Performance Test Results:
- Duration: ${result.duration.toFixed(2)}ms
- Average Latency: ${result.averageLatency.toFixed(2)}ms
- Min Latency: ${result.minLatency.toFixed(2)}ms
- Max Latency: ${result.maxLatency.toFixed(2)}ms
- Throughput: ${result.throughput.toFixed(2)} ops/sec
${result.memoryUsage ? `- Memory Delta: ${(result.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB` : ''}
    `.trim();
  }

  /**
   * 格式化并发测试结果
   */
  static formatConcurrencyResult(result: ConcurrencyResult): string {
    return `
Concurrency Test Results:
- Total Connections: ${result.totalConnections}
- Successful: ${result.successfulConnections} (${((result.successfulConnections / result.totalConnections) * 100).toFixed(2)}%)
- Failed: ${result.failedConnections} (${((result.failedConnections / result.totalConnections) * 100).toFixed(2)}%)
- Average Connection Time: ${result.averageConnectionTime.toFixed(2)}ms
- Peak Memory Usage: ${(result.peakMemoryUsage / 1024 / 1024).toFixed(2)}MB
    `.trim();
  }
}

// 导出接口类型
export { PerformanceResult, ConcurrencyResult };