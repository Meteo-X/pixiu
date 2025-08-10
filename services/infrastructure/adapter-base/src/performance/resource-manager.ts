/**
 * 资源管理器
 * 负责监控和优化适配器的资源使用
 */

import { EventEmitter } from 'events';

export interface ResourceMetrics {
  /** 内存使用统计 */
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    peak: number;
  };
  /** 网络资源统计 */
  network: {
    activeConnections: number;
    totalBytes: number;
    throughput: number; // bytes/second
  };
  /** CPU使用统计 */
  cpu: {
    usage: number; // percentage
    eventLoopLag: number; // milliseconds
  };
  /** 缓存统计 */
  cache: {
    size: number;
    hitRate: number;
    evictions: number;
  };
}

export interface ResourceLimits {
  maxMemoryUsage: number; // bytes
  maxConnections: number;
  maxCacheSize: number;
  maxEventLoopLag: number; // milliseconds
}

export interface ResourceOptimizationConfig {
  /** 监控间隔 */
  monitoringInterval: number;
  /** 资源限制 */
  limits: ResourceLimits;
  /** 自动优化 */
  autoOptimization: {
    enabled: boolean;
    memoryCleanupThreshold: number; // percentage
    connectionPoolOptimization: boolean;
    cacheEvictionStrategy: 'lru' | 'lfu' | 'ttl';
  };
}

export class ResourceManager extends EventEmitter {
  private metrics: ResourceMetrics;
  private config: ResourceOptimizationConfig;
  private monitoringTimer?: NodeJS.Timeout;
  private lastCpuUsage?: NodeJS.CpuUsage;
  private throughputHistory: number[] = [];

  constructor(config: ResourceOptimizationConfig) {
    super();
    this.config = config;
    this.metrics = this.initializeMetrics();
    this.startMonitoring();
  }

  /**
   * 获取当前资源指标
   */
  getMetrics(): ResourceMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * 检查资源健康状况
   */
  checkHealth(): {
    healthy: boolean;
    warnings: string[];
    critical: string[];
  } {
    const warnings: string[] = [];
    const critical: string[] = [];
    
    // 检查内存使用
    const memoryUsagePercent = (this.metrics.memory.heapUsed / this.config.limits.maxMemoryUsage) * 100;
    if (memoryUsagePercent > 90) {
      critical.push(`内存使用率过高: ${memoryUsagePercent.toFixed(1)}%`);
    } else if (memoryUsagePercent > 80) {
      warnings.push(`内存使用率较高: ${memoryUsagePercent.toFixed(1)}%`);
    }
    
    // 检查连接数
    if (this.metrics.network.activeConnections >= this.config.limits.maxConnections) {
      critical.push(`连接数达到上限: ${this.metrics.network.activeConnections}`);
    }
    
    // 检查事件循环延迟
    if (this.metrics.cpu.eventLoopLag > this.config.limits.maxEventLoopLag) {
      warnings.push(`事件循环延迟过高: ${this.metrics.cpu.eventLoopLag}ms`);
    }
    
    return {
      healthy: critical.length === 0,
      warnings,
      critical
    };
  }

  /**
   * 执行资源优化
   */
  async optimizeResources(): Promise<void> {
    if (!this.config.autoOptimization.enabled) {
      return;
    }

    const health = this.checkHealth();
    
    // 内存优化
    if (this.shouldCleanupMemory()) {
      await this.performMemoryCleanup();
    }
    
    // 连接池优化
    if (this.config.autoOptimization.connectionPoolOptimization) {
      await this.optimizeConnectionPool();
    }
    
    // 缓存优化
    await this.optimizeCache();
    
    this.emit('optimized', {
      timestamp: Date.now(),
      actions: ['memory', 'connections', 'cache'],
      healthBefore: health,
      healthAfter: this.checkHealth()
    });
  }

  /**
   * 设置资源监听器
   */
  onResourceAlert(callback: (alert: {
    type: 'warning' | 'critical';
    resource: string;
    value: number;
    threshold: number;
    timestamp: number;
  }) => void): void {
    this.on('resourceAlert', callback);
  }

  /**
   * 停止资源监控
   */
  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): ResourceMetrics {
    return {
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        peak: 0
      },
      network: {
        activeConnections: 0,
        totalBytes: 0,
        throughput: 0
      },
      cpu: {
        usage: 0,
        eventLoopLag: 0
      },
      cache: {
        size: 0,
        hitRate: 0,
        evictions: 0
      }
    };
  }

  /**
   * 开始监控
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      this.updateMetrics();
      this.checkAndEmitAlerts();
      
      if (this.config.autoOptimization.enabled) {
        this.optimizeResources();
      }
    }, this.config.monitoringInterval);
  }

  /**
   * 更新指标
   */
  private updateMetrics(): void {
    // 更新内存指标
    const memUsage = process.memoryUsage();
    this.metrics.memory = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      peak: Math.max(this.metrics.memory.peak, memUsage.heapUsed)
    };

    // 更新CPU指标
    const currentCpuUsage = process.cpuUsage();
    if (this.lastCpuUsage) {
      const cpuPercent = process.cpuUsage(this.lastCpuUsage);
      this.metrics.cpu.usage = ((cpuPercent.user + cpuPercent.system) / 1000000) * 100;
    }
    this.lastCpuUsage = currentCpuUsage;

    // 更新事件循环延迟（简化实现）
    const start = Date.now();
    setImmediate(() => {
      this.metrics.cpu.eventLoopLag = Date.now() - start;
    });

    // 更新网络吞吐量
    this.updateNetworkThroughput();
  }

  /**
   * 更新网络吞吐量
   */
  private updateNetworkThroughput(): void {
    this.throughputHistory.push(this.metrics.network.totalBytes);
    
    // 只保留最近10个数据点
    if (this.throughputHistory.length > 10) {
      this.throughputHistory.shift();
    }
    
    if (this.throughputHistory.length >= 2) {
      const timeDiff = this.config.monitoringInterval / 1000; // 转换为秒
      const bytesDiff = this.throughputHistory[this.throughputHistory.length - 1] - 
                       this.throughputHistory[this.throughputHistory.length - 2];
      this.metrics.network.throughput = bytesDiff / timeDiff;
    }
  }

  /**
   * 检查并发出告警
   */
  private checkAndEmitAlerts(): void {
    const health = this.checkHealth();
    
    // 发出警告
    health.warnings.forEach(warning => {
      this.emit('resourceAlert', {
        type: 'warning',
        resource: 'general',
        value: 0,
        threshold: 0,
        timestamp: Date.now(),
        message: warning
      });
    });
    
    // 发出严重告警
    health.critical.forEach(critical => {
      this.emit('resourceAlert', {
        type: 'critical',
        resource: 'general',
        value: 0,
        threshold: 0,
        timestamp: Date.now(),
        message: critical
      });
    });
  }

  /**
   * 判断是否需要内存清理
   */
  private shouldCleanupMemory(): boolean {
    const memoryUsagePercent = (this.metrics.memory.heapUsed / this.config.limits.maxMemoryUsage) * 100;
    return memoryUsagePercent > this.config.autoOptimization.memoryCleanupThreshold;
  }

  /**
   * 执行内存清理
   */
  private async performMemoryCleanup(): Promise<void> {
    // 触发垃圾收集（如果可用）
    if (global.gc) {
      global.gc();
    }
    
    // 清理事件监听器
    this.removeAllListeners('tempEvent');
    
    this.emit('memoryCleanup', {
      timestamp: Date.now(),
      beforeCleanup: this.metrics.memory.heapUsed
    });
  }

  /**
   * 优化连接池
   */
  private async optimizeConnectionPool(): Promise<void> {
    // 这里应该实现具体的连接池优化逻辑
    // 例如关闭空闲连接、重新平衡连接等
    this.emit('connectionPoolOptimized', {
      timestamp: Date.now(),
      activeConnections: this.metrics.network.activeConnections
    });
  }

  /**
   * 优化缓存
   */
  private async optimizeCache(): Promise<void> {
    // 根据配置的缓存逐出策略执行缓存清理
    const strategy = this.config.autoOptimization.cacheEvictionStrategy;
    
    this.emit('cacheOptimized', {
      timestamp: Date.now(),
      strategy,
      cacheSize: this.metrics.cache.size
    });
  }

  /**
   * 更新网络指标
   */
  updateNetworkMetrics(activeConnections: number, totalBytes: number): void {
    this.metrics.network.activeConnections = activeConnections;
    this.metrics.network.totalBytes = totalBytes;
  }

  /**
   * 更新缓存指标
   */
  updateCacheMetrics(size: number, hitRate: number, evictions: number): void {
    this.metrics.cache = { size, hitRate, evictions };
  }
}

/**
 * 创建资源管理器实例
 */
export function createResourceManager(config?: Partial<ResourceOptimizationConfig>): ResourceManager {
  const defaultConfig: ResourceOptimizationConfig = {
    monitoringInterval: 10000, // 10秒
    limits: {
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      maxConnections: 1000,
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      maxEventLoopLag: 100 // 100ms
    },
    autoOptimization: {
      enabled: true,
      memoryCleanupThreshold: 80, // 80%
      connectionPoolOptimization: true,
      cacheEvictionStrategy: 'lru'
    }
  };

  return new ResourceManager({ ...defaultConfig, ...config });
}

export default ResourceManager;