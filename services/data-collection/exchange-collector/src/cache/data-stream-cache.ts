import { BaseMonitor } from '@pixiu/shared-core';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  source: string;
  key: string;
}

export interface CacheConfig {
  maxSize: number;
  ttl: number; // 生存时间（毫秒）
  cleanupInterval: number; // 清理间隔（毫秒）
  enableMetrics: boolean;
}

export interface CacheMetrics {
  totalEntries: number;
  totalKeys: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  lastCleanup: number;
  memoryUsage: number;
}

export interface QueryOptions {
  limit?: number;
  fromTimestamp?: number;
  toTimestamp?: number;
  sources?: string[];
}

/**
 * 数据流缓存类
 * 负责缓存实时市场数据，支持快速查询和自动清理
 */
export class DataStreamCache {
  private cache = new Map<string, CacheEntry<any>[]>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private metrics: CacheMetrics = {
    totalEntries: 0,
    totalKeys: 0,
    hitCount: 0,
    missCount: 0,
    evictionCount: 0,
    lastCleanup: Date.now(),
    memoryUsage: 0
  };

  constructor(
    private config: CacheConfig,
    private monitor: BaseMonitor
  ) {
    this.startCleanupProcess();
    this.monitor.log('info', 'DataStreamCache initialized', {
      config: this.config
    });
  }

  /**
   * 存储数据到缓存
   */
  set<T>(key: string, data: T, source: string): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        source,
        key
      };

      if (!this.cache.has(key)) {
        this.cache.set(key, []);
        this.metrics.totalKeys++;
      }

      const entries = this.cache.get(key)!;
      entries.push(entry);
      this.metrics.totalEntries++;

      // 限制单个键的条目数量
      if (entries.length > this.config.maxSize) {
        const removed = entries.shift();
        if (removed) {
          this.metrics.evictionCount++;
          this.metrics.totalEntries--;
        }
      }

      // 更新内存使用量估算
      this.updateMemoryUsage();

      if (this.config.enableMetrics) {
        this.monitor.log('debug', 'Cache entry added', {
          key,
          source,
          entriesCount: entries.length,
          timestamp: entry.timestamp
        });
      }
    } catch (error) {
      this.monitor.log('error', 'Error adding cache entry', {
        key,
        source,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * 从缓存获取数据
   */
  get<T>(key: string, options: QueryOptions = {}): CacheEntry<T>[] {
    try {
      const entries = this.cache.get(key);
      
      if (!entries || entries.length === 0) {
        this.metrics.missCount++;
        return [];
      }

      this.metrics.hitCount++;
      
      // 清理过期数据
      this.cleanExpired(key);
      
      let result = [...entries] as CacheEntry<T>[];

      // 应用过滤器
      if (options.fromTimestamp) {
        result = result.filter(entry => entry.timestamp >= options.fromTimestamp!);
      }

      if (options.toTimestamp) {
        result = result.filter(entry => entry.timestamp <= options.toTimestamp!);
      }

      if (options.sources && options.sources.length > 0) {
        result = result.filter(entry => options.sources!.includes(entry.source));
      }

      // 按时间戳排序（最新的在前）
      result.sort((a, b) => b.timestamp - a.timestamp);

      // 限制返回数量
      if (options.limit && options.limit > 0) {
        result = result.slice(0, options.limit);
      }

      if (this.config.enableMetrics) {
        this.monitor.log('debug', 'Cache hit', {
          key,
          foundEntries: entries.length,
          filteredEntries: result.length,
          options
        });
      }

      return result;
    } catch (error) {
      this.monitor.log('error', 'Error getting cache entries', {
        key,
        options,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.metrics.missCount++;
      return [];
    }
  }

  /**
   * 获取最新的数据条目
   */
  getLatest<T>(key: string, count: number = 1): CacheEntry<T>[] {
    return this.get<T>(key, { limit: count });
  }

  /**
   * 获取最新的数据值（不包含元数据）
   */
  getLatestData<T>(key: string): T | null {
    const entries = this.getLatest<T>(key, 1);
    return entries.length > 0 ? entries[0].data : null;
  }

  /**
   * 获取指定时间范围内的数据
   */
  getTimeRange<T>(key: string, fromTimestamp: number, toTimestamp: number): CacheEntry<T>[] {
    return this.get<T>(key, { fromTimestamp, toTimestamp });
  }

  /**
   * 获取指定来源的数据
   */
  getBySource<T>(key: string, source: string, options: QueryOptions = {}): CacheEntry<T>[] {
    return this.get<T>(key, { ...options, sources: [source] });
  }

  /**
   * 检查缓存中是否存在指定键
   */
  has(key: string): boolean {
    const entries = this.cache.get(key);
    return entries !== undefined && entries.length > 0;
  }

  /**
   * 获取所有缓存的键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取键的统计信息
   */
  getKeyStats(key: string): { 
    count: number; 
    oldest: number | null; 
    newest: number | null;
    sources: string[];
  } {
    const entries = this.cache.get(key) || [];
    
    if (entries.length === 0) {
      return { count: 0, oldest: null, newest: null, sources: [] };
    }

    const timestamps = entries.map(e => e.timestamp);
    const sources = [...new Set(entries.map(e => e.source))];

    return {
      count: entries.length,
      oldest: Math.min(...timestamps),
      newest: Math.max(...timestamps),
      sources
    };
  }

  /**
   * 删除指定键的所有数据
   */
  delete(key: string): boolean {
    const entries = this.cache.get(key);
    if (entries) {
      this.metrics.totalEntries -= entries.length;
      this.metrics.totalKeys--;
      this.cache.delete(key);
      this.updateMemoryUsage();
      
      this.monitor.log('debug', 'Cache key deleted', {
        key,
        removedEntries: entries.length
      });
      
      return true;
    }
    return false;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    const totalEntries = this.metrics.totalEntries;
    const totalKeys = this.metrics.totalKeys;
    
    this.cache.clear();
    this.metrics.totalEntries = 0;
    this.metrics.totalKeys = 0;
    this.metrics.evictionCount += totalEntries;
    this.updateMemoryUsage();

    this.monitor.log('info', 'Cache cleared', {
      removedEntries: totalEntries,
      removedKeys: totalKeys
    });
  }

  /**
   * 获取缓存指标
   */
  getMetrics(): CacheMetrics {
    this.updateMemoryUsage();
    return { ...this.metrics };
  }

  /**
   * 获取缓存统计摘要
   */
  getSummary(): {
    totalEntries: number;
    totalKeys: number;
    hitRate: number;
    averageEntriesPerKey: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const hitRate = this.metrics.hitCount + this.metrics.missCount > 0
      ? this.metrics.hitCount / (this.metrics.hitCount + this.metrics.missCount)
      : 0;

    const averageEntriesPerKey = this.metrics.totalKeys > 0
      ? this.metrics.totalEntries / this.metrics.totalKeys
      : 0;

    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const entries of this.cache.values()) {
      for (const entry of entries) {
        if (oldestEntry === null || entry.timestamp < oldestEntry) {
          oldestEntry = entry.timestamp;
        }
        if (newestEntry === null || entry.timestamp > newestEntry) {
          newestEntry = entry.timestamp;
        }
      }
    }

    return {
      totalEntries: this.metrics.totalEntries,
      totalKeys: this.metrics.totalKeys,
      hitRate,
      averageEntriesPerKey,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * 清理过期数据
   */
  private cleanExpired(key: string): void {
    const entries = this.cache.get(key);
    if (!entries) return;

    const now = Date.now();
    const validEntries = entries.filter(entry => now - entry.timestamp <= this.config.ttl);
    
    if (validEntries.length !== entries.length) {
      const removedCount = entries.length - validEntries.length;
      this.cache.set(key, validEntries);
      this.metrics.totalEntries -= removedCount;
      this.metrics.evictionCount += removedCount;

      if (validEntries.length === 0) {
        this.cache.delete(key);
        this.metrics.totalKeys--;
      }

      if (this.config.enableMetrics) {
        this.monitor.log('debug', 'Expired entries cleaned', {
          key,
          removedCount,
          remainingCount: validEntries.length
        });
      }
    }
  }

  /**
   * 启动清理进程
   */
  private startCleanupProcess(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * 执行定期清理
   */
  private performCleanup(): void {
    const startTime = Date.now();
    let totalRemoved = 0;
    let keysRemoved = 0;

    const keys = Array.from(this.cache.keys());
    
    for (const key of keys) {
      const entriesBefore = this.cache.get(key)?.length || 0;
      this.cleanExpired(key);
      const entriesAfter = this.cache.get(key)?.length || 0;
      
      totalRemoved += entriesBefore - entriesAfter;
      
      if (entriesBefore > 0 && entriesAfter === 0) {
        keysRemoved++;
      }
    }

    this.metrics.lastCleanup = Date.now();
    this.updateMemoryUsage();

    const duration = Date.now() - startTime;

    if (this.config.enableMetrics) {
      this.monitor.log('debug', 'Cache cleanup completed', {
        duration,
        totalRemoved,
        keysRemoved,
        remainingEntries: this.metrics.totalEntries,
        remainingKeys: this.metrics.totalKeys
      });
    }
  }

  /**
   * 更新内存使用量估算
   */
  private updateMemoryUsage(): void {
    let totalSize = 0;
    
    for (const [key, entries] of this.cache) {
      // 估算键的大小
      totalSize += key.length * 2; // 假设每个字符2字节
      
      // 估算条目的大小
      for (const entry of entries) {
        totalSize += 24; // 基础对象开销
        totalSize += entry.key.length * 2;
        totalSize += (entry.source || '').length * 2;
        totalSize += 8; // timestamp 数字
        
        // 估算数据大小（简化）
        try {
          totalSize += JSON.stringify(entry.data).length * 2;
        } catch {
          totalSize += 100; // 默认估算
        }
      }
    }
    
    this.metrics.memoryUsage = totalSize;
  }

  /**
   * 执行健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const metrics = this.getMetrics();
      const summary = this.getSummary();
      
      const healthy = 
        metrics.totalEntries < this.config.maxSize * this.metrics.totalKeys * 0.9 && // 使用率不超过90%
        metrics.memoryUsage < 100 * 1024 * 1024; // 内存使用不超过100MB

      return {
        healthy,
        details: {
          metrics,
          summary,
          config: this.config,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * 关闭缓存
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.clear();
    this.monitor.log('info', 'DataStreamCache closed');
  }
}