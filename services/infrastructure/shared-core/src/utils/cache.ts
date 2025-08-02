/**
 * 缓存工具
 * 提供内存缓存和分布式缓存支持
 */

export interface CacheOptions {
  /** 过期时间（毫秒） */
  ttl?: number;
  /** 最大缓存条目数 */
  maxSize?: number;
  /** 是否启用LRU淘汰 */
  enableLRU?: boolean;
  /** 是否在过期时自动清理 */
  autoCleanup?: boolean;
  /** 清理间隔（毫秒） */
  cleanupInterval?: number;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl?: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  memoryUsage?: number;
}

/**
 * 内存缓存实现
 */
export class MemoryCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats = {
    hits: 0,
    misses: 0
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private options: CacheOptions = {}) {
    this.options = {
      ttl: 60000, // 默认1分钟
      maxSize: 1000,
      enableLRU: true,
      autoCleanup: true,
      cleanupInterval: 30000, // 30秒清理一次
      ...options
    };

    if (this.options.autoCleanup) {
      this.startCleanup();
    }
  }

  /**
   * 设置缓存
   */
  set(key: string, value: T, ttl?: number): void {
    // 检查缓存大小限制
    if (this.options.maxSize && this.cache.size >= this.options.maxSize) {
      this.evictOldest();
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      ttl: ttl || this.options.ttl,
      accessCount: 0,
      lastAccessed: now
    };

    this.cache.set(key, entry);
  }

  /**
   * 获取缓存
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // 更新访问信息
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * 检查是否存在
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      totalRequests,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * 获取或设置缓存（如果不存在则调用工厂函数）
   */
  async getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * 批量获取
   */
  mget(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();
    
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }

    return result;
  }

  /**
   * 批量设置
   */
  mset(entries: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttl);
    }
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有值
   */
  values(): T[] {
    const result: T[] = [];
    
    for (const [key, entry] of this.cache) {
      if (!this.isExpired(entry)) {
        result.push(entry.value);
      } else {
        this.cache.delete(key);
      }
    }

    return result;
  }

  /**
   * 销毁缓存
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }

  /**
   * 检查条目是否过期
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    if (!entry.ttl) {
      return false;
    }
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * 淘汰最旧的条目
   */
  private evictOldest(): void {
    if (!this.options.enableLRU) {
      // 简单的FIFO淘汰
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
      return;
    }

    // LRU淘汰
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 启动自动清理
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * 清理过期条目
   */
  private cleanup(): void {
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  /**
   * 估算内存使用量
   */
  private estimateMemoryUsage(): number {
    let size = 0;
    
    for (const [key, entry] of this.cache) {
      // 粗略估算
      size += key.length * 2; // 字符串字节数
      size += JSON.stringify(entry.value).length * 2;
      size += 40; // 条目元数据大小
    }

    return size;
  }
}

/**
 * 缓存装饰器
 */
export function cacheable(options: CacheOptions & { key?: string } = {}) {
  const cache = new MemoryCache(options);
  
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = options.key || `${target.constructor.name}.${propertyKey}:${JSON.stringify(args)}`;
      
      return cache.getOrSet(cacheKey, () => originalMethod.apply(this, args), options.ttl);
    };

    return descriptor;
  };
}

/**
 * 全局缓存实例
 */
export const globalCache = new MemoryCache();