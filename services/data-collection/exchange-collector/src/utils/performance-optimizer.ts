/**
 * 性能优化工具
 * 提供内存管理、调用链优化等功能
 */

import { BaseMonitor } from '@pixiu/shared-core';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

export interface PerformanceMetrics {
  memory: MemoryStats;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  timestamp: number;
}

export interface OptimizationConfig {
  /** 内存清理阈值 (MB) */
  memoryThreshold: number;
  /** 缓存清理间隔 (ms) */
  cacheCleanupInterval: number;
  /** 启用内存监控 */
  enableMemoryMonitoring: boolean;
  /** 启用性能追踪 */
  enablePerformanceTracking: boolean;
}

/**
 * 性能优化器
 */
export class PerformanceOptimizer {
  private monitor: BaseMonitor;
  private config: OptimizationConfig;
  private startCpuUsage: NodeJS.CpuUsage;
  private cleanupInterval?: NodeJS.Timeout;
  private memoryCheckInterval?: NodeJS.Timeout;
  
  // 缓存管理
  private caches: Map<string, Map<any, any>> = new Map();
  private cacheLastCleanup = new Map<string, number>();

  constructor(monitor: BaseMonitor, config: Partial<OptimizationConfig> = {}) {
    this.monitor = monitor;
    this.startCpuUsage = process.cpuUsage();
    
    this.config = {
      memoryThreshold: 512, // 512MB
      cacheCleanupInterval: 300000, // 5分钟
      enableMemoryMonitoring: true,
      enablePerformanceTracking: true,
      ...config
    };

    this.startOptimization();
  }

  /**
   * 启动优化程序
   */
  private startOptimization(): void {
    if (this.config.enableMemoryMonitoring) {
      this.startMemoryMonitoring();
    }

    if (this.config.enablePerformanceTracking) {
      this.startPerformanceTracking();
    }
  }

  /**
   * 获取当前内存统计
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024)
    };
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      memory: this.getMemoryStats(),
      cpuUsage: process.cpuUsage(this.startCpuUsage),
      uptime: process.uptime(),
      timestamp: Date.now()
    };
  }

  /**
   * 注册缓存
   */
  registerCache(name: string, cache: Map<any, any>): void {
    this.caches.set(name, cache);
    this.cacheLastCleanup.set(name, Date.now());
  }

  /**
   * 清理所有缓存
   */
  clearAllCaches(): void {
    let totalCleared = 0;
    
    for (const [name, cache] of this.caches) {
      const size = cache.size;
      cache.clear();
      totalCleared += size;
      this.cacheLastCleanup.set(name, Date.now());
      
      this.monitor.log('debug', 'Cache cleared', { 
        cacheName: name, 
        itemsCleared: size 
      });
    }

    this.monitor.log('info', 'All caches cleared', { 
      totalItemsCleared: totalCleared,
      cacheCount: this.caches.size
    });
  }

  /**
   * 清理指定缓存
   */
  clearCache(name: string): void {
    const cache = this.caches.get(name);
    if (cache) {
      const size = cache.size;
      cache.clear();
      this.cacheLastCleanup.set(name, Date.now());
      
      this.monitor.log('debug', 'Cache cleared', { 
        cacheName: name, 
        itemsCleared: size 
      });
    }
  }

  /**
   * 强制垃圾回收
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      const beforeMemory = this.getMemoryStats();
      global.gc();
      const afterMemory = this.getMemoryStats();
      
      this.monitor.log('info', 'Garbage collection forced', {
        memoryBefore: beforeMemory.heapUsed,
        memoryAfter: afterMemory.heapUsed,
        memoryFreed: beforeMemory.heapUsed - afterMemory.heapUsed
      });
    } else {
      this.monitor.log('warn', 'Garbage collection not available. Start with --expose-gc flag.');
    }
  }

  /**
   * 检查内存使用情况
   */
  checkMemoryUsage(): boolean {
    const stats = this.getMemoryStats();
    const isHighMemory = stats.heapUsed > this.config.memoryThreshold;

    if (isHighMemory) {
      this.monitor.log('warn', 'High memory usage detected', {
        currentUsage: stats.heapUsed,
        threshold: this.config.memoryThreshold,
        stats
      });

      // 尝试清理缓存
      this.clearAllCaches();
      
      // 强制垃圾回收
      this.forceGarbageCollection();
    }

    return isHighMemory;
  }

  /**
   * 启动内存监控
   */
  private startMemoryMonitoring(): void {
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 60000); // 每分钟检查一次

    // 清理间隔
    this.cleanupInterval = setInterval(() => {
      this.performRoutineCleanup();
    }, this.config.cacheCleanupInterval);
  }

  /**
   * 启动性能追踪
   */
  private startPerformanceTracking(): void {
    setInterval(() => {
      const metrics = this.getPerformanceMetrics();
      this.monitor.log('debug', 'Performance metrics', { metrics });
    }, 300000); // 每5分钟记录一次
  }

  /**
   * 执行常规清理
   */
  private performRoutineCleanup(): void {
    const now = Date.now();
    let cleanedCaches = 0;

    for (const [name, lastCleanup] of this.cacheLastCleanup) {
      if (now - lastCleanup > this.config.cacheCleanupInterval) {
        this.clearCache(name);
        cleanedCaches++;
      }
    }

    if (cleanedCaches > 0) {
      this.monitor.log('info', 'Routine cache cleanup completed', {
        cleanedCaches,
        totalCaches: this.caches.size
      });
    }
  }

  /**
   * 停止优化程序
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = undefined;
    }

    this.monitor.log('info', 'Performance optimizer stopped');
  }
}

/**
 * 全局性能优化器实例
 */
export class GlobalPerformanceOptimizer {
  private static instance: PerformanceOptimizer | null = null;

  static getInstance(monitor?: BaseMonitor, config?: Partial<OptimizationConfig>): PerformanceOptimizer {
    if (!GlobalPerformanceOptimizer.instance) {
      if (!monitor) {
        throw new Error('Monitor is required for first initialization');
      }
      GlobalPerformanceOptimizer.instance = new PerformanceOptimizer(monitor, config);
    }
    return GlobalPerformanceOptimizer.instance;
  }

  static resetInstance(): void {
    if (GlobalPerformanceOptimizer.instance) {
      GlobalPerformanceOptimizer.instance.stop();
      GlobalPerformanceOptimizer.instance = null;
    }
  }
}

/**
 * 函数调用性能装饰器
 */
export function measurePerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const start = Date.now();
    const result = method.apply(this, args);
    const duration = Date.now() - start;

    if (this.monitor) {
      this.monitor.log('debug', 'Method performance', {
        className: target.constructor.name,
        methodName: propertyName,
        duration,
        args: args.length
      });
    }

    return result;
  };

  return descriptor;
}

/**
 * 异步函数调用性能装饰器
 */
export function measureAsyncPerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const start = Date.now();
    try {
      const result = await method.apply(this, args);
      const duration = Date.now() - start;

      if (this.monitor) {
        this.monitor.log('debug', 'Async method performance', {
          className: target.constructor.name,
          methodName: propertyName,
          duration,
          success: true,
          args: args.length
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      if (this.monitor) {
        this.monitor.log('debug', 'Async method performance (error)', {
          className: target.constructor.name,
          methodName: propertyName,
          duration,
          success: false,
          error: error.message,
          args: args.length
        });
      }

      throw error;
    }
  };

  return descriptor;
}