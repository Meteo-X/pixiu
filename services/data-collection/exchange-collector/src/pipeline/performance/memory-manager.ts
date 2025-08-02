/**
 * 内存管理器
 * 提供内存监控、垃圾回收优化和内存泄漏检测功能
 */

import { EventEmitter } from 'events';

/**
 * 内存使用统计
 */
export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
  heapUsagePercentage: number;
  memoryPressure: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * 内存管理配置
 */
export interface MemoryManagerConfig {
  maxHeapUsage: number; // 最大堆使用量 (字节)
  gcThreshold: number; // GC触发阈值 (0-1)
  monitoringInterval: number; // 监控间隔 (毫秒)
  enableAutoGC: boolean; // 启用自动GC
  enableMemoryProfiling: boolean; // 启用内存分析
  alertThresholds: {
    medium: number; // 中等压力阈值
    high: number; // 高压力阈值
    critical: number; // 临界压力阈值
  };
}

/**
 * 内存池配置
 */
export interface MemoryPoolConfig {
  initialSize: number;
  maxSize: number;
  objectFactory: () => any;
  resetFunction?: (obj: any) => void;
  validateFunction?: (obj: any) => boolean;
}

/**
 * 对象池实现
 */
class ObjectPool<T> {
  private pool: T[] = [];
  private inUse = new Set<T>();
  private config: MemoryPoolConfig;

  constructor(config: MemoryPoolConfig) {
    this.config = config;
    this.initialize();
  }

  /**
   * 获取对象
   */
  acquire(): T {
    let obj: T;
    
    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
    } else {
      obj = this.config.objectFactory();
    }
    
    this.inUse.add(obj);
    return obj;
  }

  /**
   * 释放对象
   */
  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      return;
    }
    
    this.inUse.delete(obj);
    
    // 验证对象
    if (this.config.validateFunction && !this.config.validateFunction(obj)) {
      return;
    }
    
    // 重置对象
    if (this.config.resetFunction) {
      this.config.resetFunction(obj);
    }
    
    // 检查池大小
    if (this.pool.length < this.config.maxSize) {
      this.pool.push(obj);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      poolSize: this.pool.length,
      inUseCount: this.inUse.size,
      totalCreated: this.pool.length + this.inUse.size
    };
  }

  /**
   * 清空池
   */
  clear(): void {
    this.pool.length = 0;
    this.inUse.clear();
  }

  /**
   * 初始化池
   */
  private initialize(): void {
    for (let i = 0; i < this.config.initialSize; i++) {
      this.pool.push(this.config.objectFactory());
    }
  }
}

/**
 * 内存管理器
 */
export class MemoryManager extends EventEmitter {
  private config: MemoryManagerConfig;
  private monitoringTimer?: NodeJS.Timeout;
  private objectPools = new Map<string, ObjectPool<any>>();
  private memoryHistory: MemoryStats[] = [];
  private maxHistorySize = 100;

  constructor(config: MemoryManagerConfig) {
    super();
    this.config = config;
  }

  /**
   * 启动内存监控
   */
  start(): void {
    if (this.monitoringTimer) {
      return;
    }

    this.monitoringTimer = setInterval(() => {
      this.monitor();
    }, this.config.monitoringInterval);

    this.emit('started');
  }

  /**
   * 停止内存监控
   */
  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    this.emit('stopped');
  }

  /**
   * 获取当前内存统计
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsagePercentage = memUsage.heapUsed / memUsage.heapTotal;
    
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
      heapUsagePercentage,
      memoryPressure: this.calculateMemoryPressure(heapUsagePercentage)
    };
  }

  /**
   * 获取内存历史
   */
  getMemoryHistory(): MemoryStats[] {
    return [...this.memoryHistory];
  }

  /**
   * 强制垃圾回收
   */
  forceGC(): void {
    if (global.gc) {
      global.gc();
      this.emit('gcForced');
    } else {
      console.warn('Garbage collection not exposed. Use --expose-gc flag.');
    }
  }

  /**
   * 创建对象池
   */
  createObjectPool<T>(name: string, config: MemoryPoolConfig): ObjectPool<T> {
    const pool = new ObjectPool<T>(config);
    this.objectPools.set(name, pool);
    this.emit('poolCreated', name, pool.getStats());
    return pool;
  }

  /**
   * 获取对象池
   */
  getObjectPool<T>(name: string): ObjectPool<T> | undefined {
    return this.objectPools.get(name);
  }

  /**
   * 移除对象池
   */
  removeObjectPool(name: string): void {
    const pool = this.objectPools.get(name);
    if (pool) {
      pool.clear();
      this.objectPools.delete(name);
      this.emit('poolRemoved', name);
    }
  }

  /**
   * 获取所有对象池统计
   */
  getPoolStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, pool] of this.objectPools) {
      stats[name] = pool.getStats();
    }
    
    return stats;
  }

  /**
   * 检查内存泄漏
   */
  checkMemoryLeaks(): {
    suspected: boolean;
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    details: string;
  } {
    if (this.memoryHistory.length < 10) {
      return {
        suspected: false,
        trend: 'STABLE',
        details: 'Not enough data to analyze'
      };
    }

    const recent = this.memoryHistory.slice(-10);
    const older = this.memoryHistory.slice(-20, -10);
    
    const recentAvg = recent.reduce((sum, stat) => sum + stat.heapUsed, 0) / recent.length;
    const olderAvg = older.reduce((sum, stat) => sum + stat.heapUsed, 0) / older.length;
    
    const growthRate = (recentAvg - olderAvg) / olderAvg;
    
    let trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    if (growthRate > 0.1) {
      trend = 'INCREASING';
    } else if (growthRate < -0.1) {
      trend = 'DECREASING';
    } else {
      trend = 'STABLE';
    }
    
    const suspected = trend === 'INCREASING' && growthRate > 0.2;
    
    return {
      suspected,
      trend,
      details: `Growth rate: ${(growthRate * 100).toFixed(2)}%`
    };
  }

  /**
   * 优化内存使用
   */
  optimizeMemory(): void {
    // 清理对象池
    for (const pool of this.objectPools.values()) {
      const stats = pool.getStats();
      if (stats.poolSize > stats.inUseCount * 2) {
        // 如果池中空闲对象太多，减少池大小
        pool.clear();
      }
    }

    // 强制垃圾回收
    if (this.config.enableAutoGC) {
      const stats = this.getMemoryStats();
      if (stats.heapUsagePercentage > this.config.gcThreshold) {
        this.forceGC();
      }
    }

    this.emit('memoryOptimized');
  }

  /**
   * 监控内存使用
   */
  private monitor(): void {
    const stats = this.getMemoryStats();
    
    // 更新历史记录
    this.memoryHistory.push(stats);
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }

    // 检查内存压力
    this.checkMemoryPressure(stats);

    // 自动优化
    if (stats.memoryPressure === 'HIGH' || stats.memoryPressure === 'CRITICAL') {
      this.optimizeMemory();
    }

    // 检查内存泄漏
    const leakCheck = this.checkMemoryLeaks();
    if (leakCheck.suspected) {
      this.emit('memoryLeakSuspected', leakCheck);
    }

    this.emit('memoryStats', stats);
  }

  /**
   * 检查内存压力
   */
  private checkMemoryPressure(stats: MemoryStats): void {
    const pressure = stats.memoryPressure;
    
    switch (pressure) {
      case 'MEDIUM':
        this.emit('memoryPressure', 'medium', stats);
        break;
      case 'HIGH':
        this.emit('memoryPressure', 'high', stats);
        break;
      case 'CRITICAL':
        this.emit('memoryPressure', 'critical', stats);
        break;
    }
  }

  /**
   * 计算内存压力
   */
  private calculateMemoryPressure(heapUsagePercentage: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const thresholds = this.config.alertThresholds;
    
    if (heapUsagePercentage >= thresholds.critical) {
      return 'CRITICAL';
    } else if (heapUsagePercentage >= thresholds.high) {
      return 'HIGH';
    } else if (heapUsagePercentage >= thresholds.medium) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }
}

/**
 * 内存管理器工厂
 */
export class MemoryManagerFactory {
  /**
   * 创建默认内存管理器
   */
  static createDefault(): MemoryManager {
    return new MemoryManager({
      maxHeapUsage: 1024 * 1024 * 1024, // 1GB
      gcThreshold: 0.8,
      monitoringInterval: 10000,
      enableAutoGC: true,
      enableMemoryProfiling: false,
      alertThresholds: {
        medium: 0.6,
        high: 0.8,
        critical: 0.9
      }
    });
  }

  /**
   * 创建高性能内存管理器
   */
  static createHighPerformance(): MemoryManager {
    return new MemoryManager({
      maxHeapUsage: 2 * 1024 * 1024 * 1024, // 2GB
      gcThreshold: 0.9,
      monitoringInterval: 5000,
      enableAutoGC: true,
      enableMemoryProfiling: true,
      alertThresholds: {
        medium: 0.7,
        high: 0.85,
        critical: 0.95
      }
    });
  }

  /**
   * 创建节约内存管理器
   */
  static createMemoryEfficient(): MemoryManager {
    return new MemoryManager({
      maxHeapUsage: 512 * 1024 * 1024, // 512MB
      gcThreshold: 0.6,
      monitoringInterval: 15000,
      enableAutoGC: true,
      enableMemoryProfiling: false,
      alertThresholds: {
        medium: 0.5,
        high: 0.7,
        critical: 0.8
      }
    });
  }
}