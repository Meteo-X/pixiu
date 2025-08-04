import { BaseMonitor } from '@pixiu/shared-core';
import { DataStreamCache, CacheConfig } from '../../src/cache/data-stream-cache';

describe('DataStreamCache', () => {
  let cache: DataStreamCache;
  let monitor: BaseMonitor;
  let config: CacheConfig;

  beforeEach(() => {
    monitor = {
      log: jest.fn()
    } as any;

    config = {
      maxSize: 5,
      ttl: 1000, // 1秒
      cleanupInterval: 500, // 0.5秒
      enableMetrics: true
    };

    cache = new DataStreamCache(config, monitor);
  });

  afterEach(() => {
    cache.close();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve data', () => {
      const testData = { symbol: 'BTCUSDT', price: 50000 };
      cache.set('test-key', testData, 'test-source');

      const entries = cache.get('test-key');
      expect(entries).toHaveLength(1);
      expect(entries[0].data).toEqual(testData);
      expect(entries[0].source).toBe('test-source');
      expect(entries[0].key).toBe('test-key');
      expect(entries[0].timestamp).toBeCloseTo(Date.now(), -2);
    });

    it('should return empty array for non-existent keys', () => {
      const entries = cache.get('non-existent');
      expect(entries).toHaveLength(0);
    });

    it('should check if key exists', () => {
      expect(cache.has('test-key')).toBe(false);
      
      cache.set('test-key', { value: 1 }, 'source');
      expect(cache.has('test-key')).toBe(true);
    });

    it('should get latest data', () => {
      cache.set('test-key', { value: 1 }, 'source');
      cache.set('test-key', { value: 2 }, 'source');
      cache.set('test-key', { value: 3 }, 'source');

      const latest = cache.getLatestData('test-key');
      expect(latest).toEqual({ value: 3 });

      const latestEntries = cache.getLatest('test-key', 2);
      expect(latestEntries).toHaveLength(2);
      expect(latestEntries[0].data).toEqual({ value: 3 });
      expect(latestEntries[1].data).toEqual({ value: 2 });
    });

    it('should return null for latest data of non-existent key', () => {
      const latest = cache.getLatestData('non-existent');
      expect(latest).toBeNull();
    });
  });

  describe('Size Limiting', () => {
    it('should enforce maximum size per key', () => {
      const key = 'test-key';
      
      // 添加超过最大数量的条目
      for (let i = 0; i < config.maxSize + 3; i++) {
        cache.set(key, { value: i }, 'source');
      }

      const entries = cache.get(key);
      expect(entries).toHaveLength(config.maxSize);
      
      // 验证最新的条目被保留
      const values = entries.map(e => (e.data as any).value).sort((a, b) => b - a);
      const expectedValues = Array.from({ length: config.maxSize }, (_, i) => config.maxSize + 3 - 1 - i);
      expect(values).toEqual(expectedValues);
    });
  });

  describe('Time-based Operations', () => {
    it('should filter by timestamp range', () => {
      const now = Date.now();
      const key = 'test-key';

      // 手动设置时间戳
      cache.set(key, { value: 1 }, 'source');
      
      // 稍等一下以确保时间戳不同
      setTimeout(() => {
        cache.set(key, { value: 2 }, 'source');
        
        setTimeout(() => {
          cache.set(key, { value: 3 }, 'source');
          
          const allEntries = cache.get(key);
          expect(allEntries).toHaveLength(3);

          // 测试时间范围过滤
          const recentEntries = cache.getTimeRange(key, now + 5, Date.now());
          expect(recentEntries.length).toBeGreaterThan(0);
          expect(recentEntries.length).toBeLessThanOrEqual(3);
        }, 5);
      }, 5);
    });

    it('should expire old entries automatically', (done) => {
      const key = 'test-key';
      cache.set(key, { value: 1 }, 'source');
      
      expect(cache.get(key)).toHaveLength(1);

      // 等待超过TTL时间
      setTimeout(() => {
        const entries = cache.get(key);
        expect(entries).toHaveLength(0);
        done();
      }, config.ttl + 100);
    });
  });

  describe('Source-based Operations', () => {
    it('should filter by source', () => {
      const key = 'test-key';
      
      cache.set(key, { value: 1 }, 'source-a');
      cache.set(key, { value: 2 }, 'source-b');
      cache.set(key, { value: 3 }, 'source-a');

      const sourceAEntries = cache.getBySource(key, 'source-a');
      expect(sourceAEntries).toHaveLength(2);
      expect(sourceAEntries.every(e => e.source === 'source-a')).toBe(true);

      const sourceBEntries = cache.getBySource(key, 'source-b');
      expect(sourceBEntries).toHaveLength(1);
      expect(sourceBEntries[0].source).toBe('source-b');
    });

    it('should support multiple source filtering', () => {
      const key = 'test-key';
      
      cache.set(key, { value: 1 }, 'source-a');
      cache.set(key, { value: 2 }, 'source-b');
      cache.set(key, { value: 3 }, 'source-c');

      const entries = cache.get(key, { sources: ['source-a', 'source-c'] });
      expect(entries).toHaveLength(2);
      expect(entries.every(e => ['source-a', 'source-c'].includes(e.source))).toBe(true);
    });
  });

  describe('Query Options', () => {
    beforeEach(() => {
      const key = 'test-key';
      cache.set(key, { value: 1 }, 'source-a');
      cache.set(key, { value: 2 }, 'source-b');
      cache.set(key, { value: 3 }, 'source-a');
      cache.set(key, { value: 4 }, 'source-c');
    });

    it('should limit results', () => {
      const entries = cache.get('test-key', { limit: 2 });
      expect(entries).toHaveLength(2);
    });

    it('should combine multiple filters', () => {
      const entries = cache.get('test-key', {
        sources: ['source-a'],
        limit: 1
      });
      
      expect(entries).toHaveLength(1);
      expect(entries[0].source).toBe('source-a');
    });

    it('should sort by timestamp (newest first)', () => {
      const entries = cache.get('test-key');
      
      // 验证按时间戳降序排列
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i-1].timestamp).toBeGreaterThanOrEqual(entries[i].timestamp);
      }
    });
  });

  describe('Statistics and Metrics', () => {
    it('should provide key statistics', () => {
      const key = 'test-key';
      
      // 空统计
      let stats = cache.getKeyStats(key);
      expect(stats.count).toBe(0);
      expect(stats.oldest).toBeNull();
      expect(stats.newest).toBeNull();
      expect(stats.sources).toEqual([]);

      // 添加数据
      cache.set(key, { value: 1 }, 'source-a');
      cache.set(key, { value: 2 }, 'source-b');
      cache.set(key, { value: 3 }, 'source-a');

      stats = cache.getKeyStats(key);
      expect(stats.count).toBe(3);
      expect(stats.oldest).toBeLessThanOrEqual(stats.newest!);
      expect(stats.sources).toEqual(expect.arrayContaining(['source-a', 'source-b']));
    });

    it('should provide cache metrics', () => {
      cache.set('key1', { value: 1 }, 'source');
      cache.set('key2', { value: 2 }, 'source');
      cache.get('key1'); // hit
      cache.get('non-existent'); // miss

      const metrics = cache.getMetrics();
      expect(metrics.totalEntries).toBe(2);
      expect(metrics.totalKeys).toBe(2);
      expect(metrics.hitCount).toBe(1);
      expect(metrics.missCount).toBe(1);
      expect(metrics.memoryUsage).toBeGreaterThan(0);
    });

    it('should provide cache summary', () => {
      cache.set('key1', { value: 1 }, 'source');
      cache.set('key1', { value: 2 }, 'source');
      cache.get('key1'); // hit

      const summary = cache.getSummary();
      expect(summary.totalEntries).toBe(2);
      expect(summary.totalKeys).toBe(1);
      expect(summary.hitRate).toBe(1.0);
      expect(summary.averageEntriesPerKey).toBe(2);
      expect(summary.oldestEntry).toBeLessThanOrEqual(summary.newestEntry!);
    });
  });

  describe('Management Operations', () => {
    it('should delete specific keys', () => {
      cache.set('key1', { value: 1 }, 'source');
      cache.set('key2', { value: 2 }, 'source');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);

      const deletedAgain = cache.delete('key1');
      expect(deletedAgain).toBe(false);
    });

    it('should clear all cache', () => {
      cache.set('key1', { value: 1 }, 'source');
      cache.set('key2', { value: 2 }, 'source');

      expect(cache.keys()).toHaveLength(2);

      cache.clear();
      expect(cache.keys()).toHaveLength(0);
      expect(cache.getMetrics().totalEntries).toBe(0);
      expect(cache.getMetrics().totalKeys).toBe(0);
    });

    it('should list all keys', () => {
      cache.set('key1', { value: 1 }, 'source');
      cache.set('key2', { value: 2 }, 'source');
      cache.set('key3', { value: 3 }, 'source');

      const keys = cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toEqual(expect.arrayContaining(['key1', 'key2', 'key3']));
    });
  });

  describe('Health Check', () => {
    it('should perform health check', async () => {
      const healthCheck = await cache.healthCheck();
      
      expect(healthCheck).toHaveProperty('healthy');
      expect(healthCheck).toHaveProperty('details');
      expect(healthCheck.details).toHaveProperty('metrics');
      expect(healthCheck.details).toHaveProperty('summary');
      expect(healthCheck.details).toHaveProperty('config');
      expect(healthCheck.details).toHaveProperty('timestamp');
    });

    it('should report healthy status for normal usage', async () => {
      cache.set('key1', { value: 1 }, 'source');
      cache.set('key2', { value: 2 }, 'source');

      const healthCheck = await cache.healthCheck();
      expect(healthCheck.healthy).toBe(true);
    });
  });

  describe('Cleanup Process', () => {
    it('should perform automatic cleanup', (done) => {
      const key = 'test-key';
      cache.set(key, { value: 1 }, 'source');
      
      expect(cache.get(key)).toHaveLength(1);

      // 等待清理进程运行
      setTimeout(() => {
        const entries = cache.get(key);
        expect(entries).toHaveLength(0);
        done();
      }, config.cleanupInterval + config.ttl + 100);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully when storing data', () => {
      // 测试循环引用对象
      const circularObj: any = { value: 1 };
      circularObj.self = circularObj;

      expect(() => {
        cache.set('circular', circularObj, 'source');
      }).not.toThrow();

      // 仍然应该能够获取数据
      const entries = cache.get('circular');
      expect(entries).toHaveLength(1);
    });

    it('should handle errors gracefully when getting data', () => {
      // 即使内部出错，也应该返回空数组而不是抛出异常
      expect(() => {
        cache.get('any-key');
      }).not.toThrow();
    });
  });
});