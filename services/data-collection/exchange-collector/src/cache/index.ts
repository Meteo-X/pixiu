/**
 * 缓存模块入口
 * 导出所有缓存相关的类和接口
 */

export {
  DataStreamCache,
  CacheEntry,
  CacheConfig,
  CacheMetrics,
  QueryOptions
} from './data-stream-cache';

// 工厂函数和默认配置
import { BaseMonitor } from '@pixiu/shared-core';
import { DataStreamCache, CacheConfig } from './data-stream-cache';

/**
 * 创建数据流缓存实例
 */
export function createDataStreamCache(
  monitor: BaseMonitor,
  options?: Partial<CacheConfig>
): DataStreamCache {
  const defaultConfig: CacheConfig = {
    maxSize: 1000,
    ttl: 300000, // 5分钟
    cleanupInterval: 60000, // 1分钟
    enableMetrics: true
  };

  const config = { ...defaultConfig, ...options };
  
  return new DataStreamCache(config, monitor);
}

/**
 * 默认缓存配置
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,
  ttl: 300000,
  cleanupInterval: 60000,
  enableMetrics: true
};

/**
 * 高性能缓存配置（较大缓存容量，较长TTL）
 */
export const HIGH_PERFORMANCE_CACHE_CONFIG: CacheConfig = {
  maxSize: 5000,
  ttl: 900000, // 15分钟
  cleanupInterval: 120000, // 2分钟
  enableMetrics: true
};

/**
 * 低内存缓存配置（较小缓存容量，较短TTL）
 */
export const LOW_MEMORY_CACHE_CONFIG: CacheConfig = {
  maxSize: 200,
  ttl: 60000, // 1分钟
  cleanupInterval: 30000, // 30秒
  enableMetrics: false
};