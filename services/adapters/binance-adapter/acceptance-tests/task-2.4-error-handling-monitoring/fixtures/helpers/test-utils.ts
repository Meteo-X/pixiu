/**
 * 测试工具类
 * 
 * 提供测试中常用的工具函数和辅助方法
 */

import { EventEmitter } from 'events';
import { 
  ErrorHandler, 
  ErrorHandlerConfig, 
  ErrorSeverity, 
  ErrorCategory 
} from '../../../src/connector/ErrorHandler';
import { 
  LatencyMonitor, 
  LatencyMonitorConfig, 
  LatencyType 
} from '../../../src/connector/LatencyMonitor';
import { 
  AdapterStatusMonitor, 
  StatusMonitorConfig 
} from '../../../src/connector/AdapterStatusMonitor';
import { 
  AdapterStatus, 
  ConnectionState, 
  ConnectionStats 
} from '../../../src/types';

/**
 * 测试数据生成器
 */
export class TestDataGenerator {
  /**
   * 生成随机错误消息
   */
  static generateRandomError(category?: ErrorCategory): Error {
    const errorMessages = {
      [ErrorCategory.CONNECTION]: [
        'Connection timeout',
        'Connection refused',
        'Connection lost',
        'Network unreachable',
        'Connection reset by peer'
      ],
      [ErrorCategory.DATA_PARSING]: [
        'Invalid JSON format',
        'Parse error',
        'Malformed data',
        'Unexpected token',
        'Schema validation failed'
      ],
      [ErrorCategory.SUBSCRIPTION]: [
        'Subscribe failed',
        'Subscription timeout',
        'Invalid subscription',
        'Subscription limit exceeded',
        'Stream not available'
      ],
      [ErrorCategory.PUBSUB]: [
        'PubSub timeout',
        'Publish failed',
        'Topic not found',
        'Permission denied',
        'Message too large'
      ],
      [ErrorCategory.NETWORK]: [
        'Network timeout',
        'DNS resolution failed',
        'Network congestion',
        'Packet loss detected',
        'Bandwidth exceeded'
      ],
      [ErrorCategory.AUTHENTICATION]: [
        'Authentication failed',
        'Invalid API key',
        'Token expired',
        'Permission denied',
        'Credentials invalid'
      ],
      [ErrorCategory.RATE_LIMIT]: [
        'Rate limit exceeded',
        'Too many requests',
        'Request quota exceeded',
        'Throttling active',
        'API limit reached'
      ]
    };

    if (category && errorMessages[category]) {
      const messages = errorMessages[category];
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      return new Error(randomMessage);
    }

    // 随机选择一个分类
    const categories = Object.keys(errorMessages) as ErrorCategory[];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    return this.generateRandomError(randomCategory);
  }

  /**
   * 生成随机延迟值
   */
  static generateRandomLatency(type: LatencyType, distribution: 'normal' | 'high' | 'critical' = 'normal'): number {
    const baseLatencies = {
      [LatencyType.NETWORK]: { normal: 50, high: 200, critical: 800 },
      [LatencyType.PROCESSING]: { normal: 5, high: 25, critical: 100 },
      [LatencyType.END_TO_END]: { normal: 80, high: 300, critical: 1200 },
      [LatencyType.HEARTBEAT]: { normal: 20000, high: 40000, critical: 80000 },
      [LatencyType.SUBSCRIPTION]: { normal: 1500, high: 8000, critical: 20000 }
    };

    const base = baseLatencies[type][distribution];
    const variance = base * 0.3; // 30% 变化范围
    return base + (Math.random() - 0.5) * variance;
  }

  /**
   * 生成连接统计数据
   */
  static generateConnectionStats(count: number, options: {
    activeRatio?: number;
    errorRatio?: number;
    latencyRange?: [number, number];
  } = {}): ConnectionStats[] {
    const {
      activeRatio = 0.8,
      errorRatio = 0.1,
      latencyRange = [20, 100]
    } = options;

    const stats: ConnectionStats[] = [];
    
    for (let i = 0; i < count; i++) {
      const isActive = Math.random() < activeRatio;
      const hasError = Math.random() < errorRatio;
      const latency = latencyRange[0] + Math.random() * (latencyRange[1] - latencyRange[0]);

      stats.push({
        connectionId: `test-conn-${i}`,
        state: isActive && !hasError ? ConnectionState.ACTIVE : 
               hasError ? ConnectionState.ERROR : ConnectionState.CONNECTING,
        connectedAt: Date.now() - Math.random() * 300000, // 0-5分钟前
        lastActivity: Date.now() - Math.random() * 60000,  // 0-1分钟前
        messagesSent: Math.floor(Math.random() * 1000),
        messagesReceived: Math.floor(Math.random() * 10000),
        bytesReceived: Math.floor(Math.random() * 1000000),
        latency: Math.round(latency),
        activeSubscriptions: Math.floor(Math.random() * 20),
        connectionAttempts: hasError ? Math.floor(Math.random() * 5) + 1 : 1,
        successfulConnections: 1,
        lastError: hasError ? new Error(`Connection ${i} error`) : undefined
      });
    }

    return stats;
  }
}

/**
 * 测试事件收集器
 */
export class EventCollector {
  private events: Array<{ event: string; data: any; timestamp: number }> = [];
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  /**
   * 开始收集指定事件
   */
  startCollecting(eventNames: string[]): void {
    eventNames.forEach(eventName => {
      this.emitter.on(eventName, (data) => {
        this.events.push({
          event: eventName,
          data,
          timestamp: Date.now()
        });
      });
    });
  }

  /**
   * 获取收集到的事件
   */
  getEvents(eventName?: string): Array<{ event: string; data: any; timestamp: number }> {
    if (eventName) {
      return this.events.filter(e => e.event === eventName);
    }
    return [...this.events];
  }

  /**
   * 等待特定事件
   */
  waitForEvent(eventName: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event ${eventName} not received within ${timeout}ms`));
      }, timeout);

      const handler = (data: any) => {
        clearTimeout(timer);
        this.emitter.removeListener(eventName, handler);
        resolve(data);
      };

      this.emitter.on(eventName, handler);
    });
  }

  /**
   * 等待多个事件
   */
  waitForEvents(eventNames: string[], timeout: number = 5000): Promise<any[]> {
    const promises = eventNames.map(eventName => this.waitForEvent(eventName, timeout));
    return Promise.all(promises);
  }

  /**
   * 清空事件记录
   */
  clear(): void {
    this.events = [];
  }

  /**
   * 获取事件统计
   */
  getEventStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.events.forEach(event => {
      stats[event.event] = (stats[event.event] || 0) + 1;
    });
    return stats;
  }
}

/**
 * 性能测试工具
 */
export class PerformanceTester {
  private startTime: number = 0;
  private endTime: number = 0;
  private measurements: number[] = [];

  /**
   * 开始计时
   */
  start(): void {
    this.startTime = performance.now();
  }

  /**
   * 结束计时
   */
  end(): number {
    this.endTime = performance.now();
    const duration = this.endTime - this.startTime;
    this.measurements.push(duration);
    return duration;
  }

  /**
   * 测试函数执行时间
   */
  async measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    this.start();
    const result = await fn();
    const duration = this.end();
    return { result, duration };
  }

  /**
   * 测试同步函数执行时间
   */
  measure<T>(fn: () => T): { result: T; duration: number } {
    this.start();
    const result = fn();
    const duration = this.end();
    return { result, duration };
  }

  /**
   * 批量性能测试
   */
  async batchTest<T>(fn: () => T, iterations: number): Promise<{
    results: T[];
    durations: number[];
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
  }> {
    const results: T[] = [];
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { result, duration } = this.measure(fn);
      results.push(result);
      durations.push(duration);
    }

    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    return {
      results,
      durations,
      avgDuration,
      minDuration,
      maxDuration
    };
  }

  /**
   * 获取所有测量值的统计
   */
  getStats(): {
    count: number;
    total: number;
    average: number;
    min: number;
    max: number;
    stdDev: number;
  } {
    if (this.measurements.length === 0) {
      return { count: 0, total: 0, average: 0, min: 0, max: 0, stdDev: 0 };
    }

    const count = this.measurements.length;
    const total = this.measurements.reduce((sum, val) => sum + val, 0);
    const average = total / count;
    const min = Math.min(...this.measurements);
    const max = Math.max(...this.measurements);
    
    const variance = this.measurements.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return { count, total, average, min, max, stdDev };
  }

  /**
   * 重置测量数据
   */
  reset(): void {
    this.measurements = [];
    this.startTime = 0;
    this.endTime = 0;
  }
}

/**
 * 监控组件工厂
 */
export class MonitoringFactory {
  /**
   * 创建默认错误处理器
   */
  static createErrorHandler(overrides: Partial<ErrorHandlerConfig> = {}): ErrorHandler {
    const defaultConfig: ErrorHandlerConfig = {
      maxRecentErrors: 50,
      errorRateWindow: 60000,
      criticalErrorThreshold: 10,
      retryLimits: {
        connection: 3,
        heartbeat: 2,
        protocol: 2,
        data_parsing: 0,
        subscription: 2,
        pubsub: 2,
        config: 0,
        network: 3,
        authentication: 1,
        rate_limit: 0,
        unknown: 1
      },
      circuitBreakerThreshold: 15,
      alerting: {
        enabled: true,
        criticalErrorNotification: true,
        errorRateThreshold: 8
      }
    };

    const config = { ...defaultConfig, ...overrides };
    return new ErrorHandler(config);
  }

  /**
   * 创建默认延迟监控器
   */
  static createLatencyMonitor(overrides: Partial<LatencyMonitorConfig> = {}): LatencyMonitor {
    const defaultConfig: LatencyMonitorConfig = {
      sampling: {
        maxSamples: 2000,
        windowSize: 300000,
        sampleInterval: 2000
      },
      buckets: {
        boundaries: [0, 10, 50, 100, 200, 500, 1000, 2000, 5000]
      },
      thresholds: {
        [LatencyType.NETWORK]: {
          warning: 100,
          critical: 500,
          p95Warning: 200,
          p99Critical: 1000
        },
        [LatencyType.PROCESSING]: {
          warning: 10,
          critical: 50,
          p95Warning: 20,
          p99Critical: 100
        },
        [LatencyType.END_TO_END]: {
          warning: 150,
          critical: 750,
          p95Warning: 300,
          p99Critical: 1500
        },
        [LatencyType.HEARTBEAT]: {
          warning: 30000,
          critical: 60000,
          p95Warning: 45000,
          p99Critical: 90000
        },
        [LatencyType.SUBSCRIPTION]: {
          warning: 5000,
          critical: 15000,
          p95Warning: 10000,
          p99Critical: 30000
        }
      },
      trend: {
        enabled: true,
        windowCount: 24,
        significantChange: 20
      },
      baseline: {
        enabled: true,
        targetLatency: {
          [LatencyType.NETWORK]: 50,
          [LatencyType.PROCESSING]: 5,
          [LatencyType.END_TO_END]: 100,
          [LatencyType.HEARTBEAT]: 20000,
          [LatencyType.SUBSCRIPTION]: 2000
        },
        acceptableDeviation: 50
      }
    };

    const config = { ...defaultConfig, ...overrides };
    return new LatencyMonitor(config);
  }

  /**
   * 创建默认状态监控器
   */
  static createStatusMonitor(overrides: Partial<StatusMonitorConfig> = {}): AdapterStatusMonitor {
    const defaultConfig: StatusMonitorConfig = {
      updateInterval: 2000,
      snapshotRetention: 50,
      healthThresholds: {
        warning: 0.7,
        critical: 0.4
      },
      benchmarks: {
        messagesPerSecond: {
          target: 2000,
          warning: 1000,
          critical: 200
        },
        latency: {
          target: 50,
          warning: 100,
          critical: 500
        },
        errorRate: {
          target: 1,
          warning: 3,
          critical: 8
        },
        connectionSuccess: {
          target: 99,
          warning: 95,
          critical: 90
        }
      },
      alerting: {
        enabled: true,
        cooldownPeriod: 5000
      }
    };

    const config = { ...defaultConfig, ...overrides };
    return new AdapterStatusMonitor(config);
  }

  /**
   * 创建完整的监控系统
   */
  static createMonitoringSystem(configs: {
    errorHandler?: Partial<ErrorHandlerConfig>;
    latencyMonitor?: Partial<LatencyMonitorConfig>;
    statusMonitor?: Partial<StatusMonitorConfig>;
  } = {}): {
    errorHandler: ErrorHandler;
    latencyMonitor: LatencyMonitor;
    statusMonitor: AdapterStatusMonitor;
  } {
    const errorHandler = this.createErrorHandler(configs.errorHandler);
    const latencyMonitor = this.createLatencyMonitor(configs.latencyMonitor);
    const statusMonitor = this.createStatusMonitor(configs.statusMonitor);

    // 设置组件关联
    statusMonitor.setErrorHandler(errorHandler);
    statusMonitor.setLatencyMonitor(latencyMonitor);

    return { errorHandler, latencyMonitor, statusMonitor };
  }
}

/**
 * 测试场景模拟器
 */
export class ScenarioSimulator {
  /**
   * 模拟正常运行场景
   */
  static simulateNormalOperation(monitors: {
    errorHandler: ErrorHandler;
    latencyMonitor: LatencyMonitor;
    statusMonitor: AdapterStatusMonitor;
  }, duration: number = 1000): void {
    const { errorHandler, latencyMonitor, statusMonitor } = monitors;
    
    statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Normal operation');
    
    for (let i = 0; i < duration; i++) {
      // 正常延迟分布
      latencyMonitor.recordNetworkLatency(TestDataGenerator.generateRandomLatency(LatencyType.NETWORK, 'normal'));
      latencyMonitor.recordProcessingLatency(TestDataGenerator.generateRandomLatency(LatencyType.PROCESSING, 'normal'));
      
      // 偶发错误（1%）
      if (Math.random() < 0.01) {
        errorHandler.handleError(TestDataGenerator.generateRandomError());
      }
      
      // 定期快照
      if (i % 100 === 0) {
        statusMonitor.createSnapshot();
      }
    }
  }

  /**
   * 模拟高负载场景
   */
  static simulateHighLoad(monitors: {
    errorHandler: ErrorHandler;
    latencyMonitor: LatencyMonitor;
    statusMonitor: AdapterStatusMonitor;
  }, duration: number = 500): void {
    const { errorHandler, latencyMonitor, statusMonitor } = monitors;
    
    statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'High load detected');
    
    for (let i = 0; i < duration; i++) {
      // 高延迟分布
      latencyMonitor.recordNetworkLatency(TestDataGenerator.generateRandomLatency(LatencyType.NETWORK, 'high'));
      latencyMonitor.recordProcessingLatency(TestDataGenerator.generateRandomLatency(LatencyType.PROCESSING, 'high'));
      
      // 更多错误（5%）
      if (Math.random() < 0.05) {
        errorHandler.handleError(TestDataGenerator.generateRandomError());
      }
      
      // 更频繁快照
      if (i % 50 === 0) {
        statusMonitor.createSnapshot();
      }
    }
  }

  /**
   * 模拟故障场景
   */
  static simulateFailure(monitors: {
    errorHandler: ErrorHandler;
    latencyMonitor: LatencyMonitor;
    statusMonitor: AdapterStatusMonitor;
  }, duration: number = 200): void {
    const { errorHandler, latencyMonitor, statusMonitor } = monitors;
    
    statusMonitor.updateStatus(AdapterStatus.ERROR, 'System failure');
    
    for (let i = 0; i < duration; i++) {
      // 严重延迟
      latencyMonitor.recordNetworkLatency(TestDataGenerator.generateRandomLatency(LatencyType.NETWORK, 'critical'));
      latencyMonitor.recordProcessingLatency(TestDataGenerator.generateRandomLatency(LatencyType.PROCESSING, 'critical'));
      
      // 大量错误（20%）
      if (Math.random() < 0.2) {
        errorHandler.handleError(TestDataGenerator.generateRandomError(ErrorCategory.CONNECTION));
      }
      
      // 频繁快照
      if (i % 25 === 0) {
        statusMonitor.createSnapshot();
      }
    }
  }

  /**
   * 模拟恢复场景
   */
  static simulateRecovery(monitors: {
    errorHandler: ErrorHandler;
    latencyMonitor: LatencyMonitor;
    statusMonitor: AdapterStatusMonitor;
  }, phases: number = 5): void {
    const { errorHandler, latencyMonitor, statusMonitor } = monitors;
    
    statusMonitor.updateStatus(AdapterStatus.CONNECTING, 'Recovery in progress');
    
    for (let phase = 0; phase < phases; phase++) {
      const recoveryRatio = (phase + 1) / phases;
      
      for (let i = 0; i < 50; i++) {
        // 延迟逐步改善
        const networkLatency = TestDataGenerator.generateRandomLatency(LatencyType.NETWORK, 'critical') * (1 - recoveryRatio * 0.8);
        const processingLatency = TestDataGenerator.generateRandomLatency(LatencyType.PROCESSING, 'critical') * (1 - recoveryRatio * 0.8);
        
        latencyMonitor.recordNetworkLatency(networkLatency);
        latencyMonitor.recordProcessingLatency(processingLatency);
        
        // 错误率逐步降低
        const errorRate = 0.15 * (1 - recoveryRatio);
        if (Math.random() < errorRate) {
          errorHandler.handleError(TestDataGenerator.generateRandomError());
        }
      }
      
      statusMonitor.createSnapshot();
    }
    
    statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Recovery complete');
  }
}

/**
 * 断言工具
 */
export class AssertionHelpers {
  /**
   * 断言健康度在合理范围内
   */
  static assertHealthInRange(health: number, min: number = 0, max: number = 1): void {
    if (health < min || health > max) {
      throw new Error(`Health ${health} is not in range [${min}, ${max}]`);
    }
  }

  /**
   * 断言性能指标在预期范围内
   */
  static assertPerformanceInRange(value: number, target: number, tolerance: number = 0.2): void {
    const minValue = target * (1 - tolerance);
    const maxValue = target * (1 + tolerance);
    
    if (value < minValue || value > maxValue) {
      throw new Error(`Performance value ${value} is not within ${tolerance * 100}% of target ${target}`);
    }
  }

  /**
   * 断言错误率在可接受范围内
   */
  static assertErrorRateAcceptable(errorRate: number, maxAcceptable: number = 5): void {
    if (errorRate > maxAcceptable) {
      throw new Error(`Error rate ${errorRate}% exceeds maximum acceptable rate ${maxAcceptable}%`);
    }
  }

  /**
   * 断言延迟分布合理
   */
  static assertLatencyDistribution(stats: any, expectedMean: number, tolerance: number = 0.3): void {
    if (!stats || typeof stats.mean !== 'number') {
      throw new Error('Invalid latency stats');
    }
    
    this.assertPerformanceInRange(stats.mean, expectedMean, tolerance);
    
    if (stats.p95 > stats.p99) {
      throw new Error('P95 cannot be greater than P99');
    }
    
    if (stats.min > stats.max) {
      throw new Error('Min cannot be greater than max');
    }
  }

  /**
   * 断言事件序列符合预期
   */
  static assertEventSequence(events: Array<{ event: string; timestamp: number }>, expectedSequence: string[]): void {
    const actualSequence = events.map(e => e.event);
    
    if (actualSequence.length < expectedSequence.length) {
      throw new Error(`Expected ${expectedSequence.length} events, got ${actualSequence.length}`);
    }
    
    for (let i = 0; i < expectedSequence.length; i++) {
      if (actualSequence[i] !== expectedSequence[i]) {
        throw new Error(`Expected event ${expectedSequence[i]} at position ${i}, got ${actualSequence[i]}`);
      }
    }
    
    // 验证时间序列
    for (let i = 1; i < events.length; i++) {
      if (events[i].timestamp < events[i - 1].timestamp) {
        throw new Error(`Event timestamps are not in chronological order`);
      }
    }
  }
}

/**
 * 内存监控工具
 */
export class MemoryMonitor {
  private initialMemory: number;
  private snapshots: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];

  constructor() {
    this.initialMemory = process.memoryUsage().heapUsed;
  }

  /**
   * 拍摄内存快照
   */
  snapshot(): NodeJS.MemoryUsage {
    const usage = process.memoryUsage();
    this.snapshots.push({
      timestamp: Date.now(),
      usage
    });
    return usage;
  }

  /**
   * 获取内存增长量
   */
  getMemoryGrowth(): number {
    const currentMemory = process.memoryUsage().heapUsed;
    return currentMemory - this.initialMemory;
  }

  /**
   * 获取内存使用趋势
   */
  getMemoryTrend(): Array<{ timestamp: number; heapUsed: number; growth: number }> {
    return this.snapshots.map(snapshot => ({
      timestamp: snapshot.timestamp,
      heapUsed: snapshot.usage.heapUsed,
      growth: snapshot.usage.heapUsed - this.initialMemory
    }));
  }

  /**
   * 强制垃圾回收（如果可用）
   */
  forceGC(): void {
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * 检查是否存在内存泄漏
   */
  checkMemoryLeak(maxGrowthMB: number = 50): boolean {
    const growthBytes = this.getMemoryGrowth();
    const growthMB = growthBytes / (1024 * 1024);
    return growthMB > maxGrowthMB;
  }

  /**
   * 重置基准内存
   */
  reset(): void {
    this.initialMemory = process.memoryUsage().heapUsed;
    this.snapshots = [];
  }
}