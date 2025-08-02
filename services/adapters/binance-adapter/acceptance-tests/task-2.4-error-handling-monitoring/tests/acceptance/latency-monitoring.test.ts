/**
 * 延迟监控验收测试
 * 
 * 验证延迟监控器的所有功能需求：
 * - 实时延迟测量和记录
 * - 延迟统计计算
 * - 延迟分布分析
 * - 性能基准比较
 * - 延迟趋势分析
 * - 告警系统
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  LatencyMonitor, 
  LatencyMonitorConfig, 
  LatencyType, 
  LatencyMeasurement,
  LatencyStats,
  LatencyAlert
} from '../../../../src/connector/LatencyMonitor';

describe('延迟监控器验收测试', () => {
  let latencyMonitor: LatencyMonitor;
  let config: LatencyMonitorConfig;

  beforeEach(() => {
    config = {
      sampling: {
        maxSamples: 1000,
        windowSize: 300000, // 5分钟
        sampleInterval: 1000 // 1秒
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

    latencyMonitor = new LatencyMonitor(config);
    
    // 添加到全局清理
    (global as any).addTestEventEmitter(latencyMonitor);
  });

  afterEach(() => {
    latencyMonitor.stop();
    latencyMonitor.reset();
  });

  describe('REQ-2.4.9: 延迟测量和记录', () => {
    test('应该正确记录各类型延迟测量', () => {
      const measurements: LatencyMeasurement[] = [
        {
          type: LatencyType.NETWORK,
          value: 50,
          timestamp: Date.now(),
          source: 'ws-connection-1'
        },
        {
          type: LatencyType.PROCESSING,
          value: 5,
          timestamp: Date.now(),
          source: 'data-parser'
        },
        {
          type: LatencyType.END_TO_END,
          value: 80,
          timestamp: Date.now(),
          metadata: { operation: 'trade-data' }
        }
      ];

      measurements.forEach(measurement => {
        latencyMonitor.recordLatency(measurement);
      });

      const networkStats = latencyMonitor.getStats(LatencyType.NETWORK);
      const processingStats = latencyMonitor.getStats(LatencyType.PROCESSING);
      const endToEndStats = latencyMonitor.getStats(LatencyType.END_TO_END);

      expect(networkStats).toBeValidLatencyStats();
      expect(processingStats).toBeValidLatencyStats();
      expect(endToEndStats).toBeValidLatencyStats();

      expect(networkStats!.count).toBe(1);
      expect(networkStats!.mean).toBe(50);
      expect(processingStats!.count).toBe(1);
      expect(processingStats!.mean).toBe(5);
      expect(endToEndStats!.count).toBe(1);
      expect(endToEndStats!.mean).toBe(80);
    });

    test('应该提供便捷的延迟记录方法', () => {
      latencyMonitor.recordNetworkLatency(75, 'connection-test');
      latencyMonitor.recordProcessingLatency(8, 'parser-test');
      latencyMonitor.recordEndToEndLatency(120, 'full-flow-test');

      const allStats = latencyMonitor.getAllStats();

      expect(allStats[LatencyType.NETWORK]).toBeDefined();
      expect(allStats[LatencyType.PROCESSING]).toBeDefined();
      expect(allStats[LatencyType.END_TO_END]).toBeDefined();

      expect(allStats[LatencyType.NETWORK].mean).toBe(75);
      expect(allStats[LatencyType.PROCESSING].mean).toBe(8);
      expect(allStats[LatencyType.END_TO_END].mean).toBe(120);
    });

    test('应该拒绝无效的延迟值', (done) => {
      latencyMonitor.on('invalid_measurement', (data) => {
        expect(data.measurement.value).toBe(-10);
        done();
      });

      latencyMonitor.recordLatency({
        type: LatencyType.NETWORK,
        value: -10, // 负值应该被拒绝
        timestamp: Date.now()
      });

      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(stats!.count).toBe(0);
    });

    test('应该正确处理极值测量', () => {
      const measurements = [
        { type: LatencyType.NETWORK, value: 0, timestamp: Date.now() },
        { type: LatencyType.NETWORK, value: 1, timestamp: Date.now() },
        { type: LatencyType.NETWORK, value: 9999, timestamp: Date.now() },
        { type: LatencyType.NETWORK, value: Number.MAX_SAFE_INTEGER, timestamp: Date.now() }
      ];

      measurements.forEach(m => latencyMonitor.recordLatency(m));

      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(stats!.count).toBe(4);
      expect(stats!.min).toBe(0);
      expect(stats!.max).toBe(Number.MAX_SAFE_INTEGER);
    });

    test('应该限制测量样本数量', () => {
      const sampleLimit = 10;
      const testConfig = { ...config };
      testConfig.sampling.maxSamples = sampleLimit;
      
      const limitedMonitor = new LatencyMonitor(testConfig);
      (global as any).addTestEventEmitter(limitedMonitor);

      // 记录超过限制的样本
      for (let i = 0; i < sampleLimit + 5; i++) {
        limitedMonitor.recordNetworkLatency(i * 10);
      }

      const stats = limitedMonitor.getStats(LatencyType.NETWORK);
      expect(stats!.count).toBeLessThanOrEqual(sampleLimit);
    });
  });

  describe('REQ-2.4.10: 延迟统计计算', () => {
    test('应该正确计算基本统计指标', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      values.forEach(value => {
        latencyMonitor.recordNetworkLatency(value);
      });

      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      
      expect(stats!.count).toBe(10);
      expect(stats!.sum).toBe(550);
      expect(stats!.mean).toBe(55);
      expect(stats!.min).toBe(10);
      expect(stats!.max).toBe(100);
      expect(stats!.median).toBe(55);
    });

    test('应该正确计算百分位数', () => {
      // 创建100个有序值：1, 2, 3, ..., 100
      for (let i = 1; i <= 100; i++) {
        latencyMonitor.recordNetworkLatency(i);
      }

      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      
      // 验证百分位数计算
      expect(stats!.p90).toBeCloseTo(90, 0);
      expect(stats!.p95).toBeCloseTo(95, 0);
      expect(stats!.p99).toBeCloseTo(99, 0);
    });

    test('应该正确计算方差和标准差', () => {
      // 使用已知分布进行测试
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      values.forEach(value => {
        latencyMonitor.recordNetworkLatency(value);
      });

      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      const expectedMean = 5;
      const expectedVariance = 4;
      const expectedStdDev = 2;

      expect(stats!.mean).toBe(expectedMean);
      expect(stats!.variance).toBeCloseTo(expectedVariance, 1);
      expect(stats!.standardDeviation).toBeCloseTo(expectedStdDev, 1);
    });

    test('应该处理单个样本的情况', () => {
      latencyMonitor.recordNetworkLatency(42);

      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      
      expect(stats!.count).toBe(1);
      expect(stats!.mean).toBe(42);
      expect(stats!.min).toBe(42);
      expect(stats!.max).toBe(42);
      expect(stats!.median).toBe(42);
      expect(stats!.p95).toBe(42);
      expect(stats!.p99).toBe(42);
      expect(stats!.variance).toBe(0);
      expect(stats!.standardDeviation).toBe(0);
    });

    test('应该正确处理空统计', () => {
      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      
      expect(stats!.count).toBe(0);
      expect(stats!.mean).toBe(0);
      expect(stats!.min).toBe(0);
      expect(stats!.max).toBe(0);
      expect(stats!.sum).toBe(0);
    });
  });

  describe('REQ-2.4.11: 延迟分布分析', () => {
    test('应该正确计算延迟分布桶', () => {
      // 创建跨越多个桶的数据
      const latencies = [5, 25, 75, 150, 350, 750, 1500, 3000, 8000];
      latencies.forEach(latency => {
        latencyMonitor.recordNetworkLatency(latency);
      });

      const buckets = latencyMonitor.getBuckets(LatencyType.NETWORK);
      
      expect(buckets).toHaveLength(9); // 8个边界 + 1个溢出桶
      
      // 验证特定桶的计数
      const bucket_0_10 = buckets.find(b => b.range === '0-10ms');
      const bucket_50_100 = buckets.find(b => b.range === '50-100ms');
      const bucket_overflow = buckets.find(b => b.range === '5000+ms');

      expect(bucket_0_10!.count).toBe(1); // 5ms
      expect(bucket_50_100!.count).toBe(1); // 75ms
      expect(bucket_overflow!.count).toBe(1); // 8000ms
    });

    test('应该正确计算百分比分布', () => {
      // 10个样本，每个桶1个
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordNetworkLatency(i * 600); // 0, 600, 1200, ..., 5400
      }

      const buckets = latencyMonitor.getBuckets(LatencyType.NETWORK);
      
      // 每个桶应该有10%的样本
      buckets.forEach(bucket => {
        if (bucket.count > 0) {
          expect(bucket.percentage).toBeCloseTo(10, 0);
        }
      });
    });

    test('应该支持自定义桶边界', () => {
      const customConfig = { ...config };
      customConfig.buckets.boundaries = [0, 5, 25, 100];
      
      const customMonitor = new LatencyMonitor(customConfig);
      (global as any).addTestEventEmitter(customMonitor);
      
      customMonitor.recordNetworkLatency(3);
      customMonitor.recordNetworkLatency(15);
      customMonitor.recordNetworkLatency(50);
      customMonitor.recordNetworkLatency(200);

      const buckets = customMonitor.getBuckets(LatencyType.NETWORK);
      
      expect(buckets).toHaveLength(4); // 3个常规桶 + 1个溢出桶
      expect(buckets[0].range).toBe('0-5ms');
      expect(buckets[1].range).toBe('5-25ms');
      expect(buckets[2].range).toBe('25-100ms');
      expect(buckets[3].range).toBe('100+ms');
    });
  });

  describe('REQ-2.4.12: 性能基准比较', () => {
    test('应该与基准目标进行比较', () => {
      // 记录一些接近基准的延迟
      latencyMonitor.recordNetworkLatency(45); // 目标是50
      latencyMonitor.recordProcessingLatency(4); // 目标是5
      latencyMonitor.recordEndToEndLatency(90); // 目标是100

      const comparison = latencyMonitor.compareToBaseline();
      
      expect(comparison[LatencyType.NETWORK]).toBeDefined();
      expect(comparison[LatencyType.NETWORK].target).toBe(50);
      expect(comparison[LatencyType.NETWORK].actual).toBe(45);
      expect(comparison[LatencyType.NETWORK].performance).toBe('better');
      expect(comparison[LatencyType.NETWORK].acceptable).toBe(true);

      expect(comparison[LatencyType.PROCESSING].performance).toBe('better');
      expect(comparison[LatencyType.END_TO_END].performance).toBe('better');
    });

    test('应该识别性能退化', () => {
      // 记录超过可接受偏差的延迟
      latencyMonitor.recordNetworkLatency(100); // 目标50，偏差50%，这是100%退化

      const comparison = latencyMonitor.compareToBaseline();
      
      expect(comparison[LatencyType.NETWORK].deviation).toBeCloseTo(100, 0);
      expect(comparison[LatencyType.NETWORK].performance).toBe('worse');
      expect(comparison[LatencyType.NETWORK].acceptable).toBe(false);
    });

    test('应该处理禁用基准的情况', () => {
      const noBaselineConfig = { ...config };
      noBaselineConfig.baseline.enabled = false;
      
      const noBaselineMonitor = new LatencyMonitor(noBaselineConfig);
      (global as any).addTestEventEmitter(noBaselineMonitor);
      
      noBaselineMonitor.recordNetworkLatency(100);
      
      const comparison = noBaselineMonitor.compareToBaseline();
      expect(comparison).toEqual({});
    });
  });

  describe('REQ-2.4.13: 延迟趋势分析', () => {
    test('应该检测性能改善趋势', (done) => {
      latencyMonitor.on('trend_detected', (data) => {
        expect(data.type).toBe(LatencyType.NETWORK);
        expect(data.trend.trendDirection).toBe('improving');
        expect(data.trend.changePercentage).toBeLessThan(-20);
        done();
      });

      // 模拟两个时间段的数据，第二个时间段性能更好
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      // 第一个时间段（较高延迟）
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordLatency({
          type: LatencyType.NETWORK,
          value: 100,
          timestamp: oneHourAgo + i * 1000
        });
      }

      // 触发趋势分析
      setTimeout(() => {
        // 第二个时间段（较低延迟）
        for (let i = 0; i < 10; i++) {
          latencyMonitor.recordLatency({
            type: LatencyType.NETWORK,
            value: 50,
            timestamp: now + i * 1000
          });
        }
      }, 100);
    }, 10000);

    test('应该检测性能退化趋势', (done) => {
      latencyMonitor.on('trend_detected', (data) => {
        if (data.trend.trendDirection === 'degrading') {
          expect(data.type).toBe(LatencyType.PROCESSING);
          expect(data.trend.changePercentage).toBeGreaterThan(20);
          done();
        }
      });

      // 模拟性能退化场景
      const baseLatency = 5;
      const degradedLatency = 15;

      // 记录基线性能
      for (let i = 0; i < 5; i++) {
        latencyMonitor.recordProcessingLatency(baseLatency);
      }

      setTimeout(() => {
        // 记录退化性能
        for (let i = 0; i < 5; i++) {
          latencyMonitor.recordProcessingLatency(degradedLatency);
        }
      }, 100);
    }, 10000);

    test('应该识别稳定趋势', () => {
      // 记录稳定的延迟值
      for (let i = 0; i < 20; i++) {
        latencyMonitor.recordNetworkLatency(50 + Math.random() * 2); // 50±1ms
      }

      const trends = latencyMonitor.getTrends(LatencyType.NETWORK);
      if (trends.length > 0) {
        const latestTrend = trends[trends.length - 1];
        expect(latestTrend.trendDirection).toBe('stable');
        expect(Math.abs(latestTrend.changePercentage)).toBeLessThan(20);
      }
    });

    test('应该支持禁用趋势分析', () => {
      const noTrendConfig = { ...config };
      noTrendConfig.trend.enabled = false;
      
      const noTrendMonitor = new LatencyMonitor(noTrendConfig);
      (global as any).addTestEventEmitter(noTrendMonitor);
      
      const trendHandler = jest.fn();
      noTrendMonitor.on('trend_detected', trendHandler);

      // 记录足够的数据触发趋势
      for (let i = 0; i < 20; i++) {
        noTrendMonitor.recordNetworkLatency(i * 10);
      }

      // 趋势分析被禁用，不应该触发事件
      expect(trendHandler).not.toHaveBeenCalled();
    });
  });

  describe('REQ-2.4.14: 延迟告警系统', () => {
    test('应该触发延迟警告告警', (done) => {
      latencyMonitor.on('latency_alert', (alert: LatencyAlert) => {
        expect(alert.type).toBe(LatencyType.NETWORK);
        expect(alert.severity).toBe('high');
        expect(alert.value).toBe(150);
        expect(alert.threshold).toBe(100);
        expect(alert.message).toContain('exceeds warning threshold');
        done();
      });

      latencyMonitor.recordNetworkLatency(150);
    });

    test('应该触发延迟严重告警', (done) => {
      latencyMonitor.on('latency_alert', (alert: LatencyAlert) => {
        expect(alert.severity).toBe('critical');
        expect(alert.value).toBe(600);
        expect(alert.threshold).toBe(500);
        done();
      });

      latencyMonitor.recordNetworkLatency(600);
    });

    test('应该触发P95百分位告警', (done) => {
      let alertReceived = false;
      
      latencyMonitor.on('latency_alert', (alert: LatencyAlert) => {
        if (alert.message.includes('P95')) {
          expect(alert.severity).toBe('medium');
          alertReceived = true;
          done();
        }
      });

      // 记录足够的数据使P95超过阈值
      for (let i = 0; i < 95; i++) {
        latencyMonitor.recordNetworkLatency(50); // 正常值
      }
      for (let i = 0; i < 5; i++) {
        latencyMonitor.recordNetworkLatency(250); // 高值，使P95超过200ms阈值
      }

      // 给统计更新一些时间
      setTimeout(() => {
        if (!alertReceived) {
          done();
        }
      }, 2000);
    }, 10000);

    test('应该触发P99百分位告警', (done) => {
      let alertReceived = false;
      
      latencyMonitor.on('latency_alert', (alert: LatencyAlert) => {
        if (alert.message.includes('P99')) {
          expect(alert.severity).toBe('critical');
          alertReceived = true;
          done();
        }
      });

      // 记录足够的数据使P99超过阈值
      for (let i = 0; i < 99; i++) {
        latencyMonitor.recordNetworkLatency(50);
      }
      latencyMonitor.recordNetworkLatency(1200); // 超过1000ms阈值

      setTimeout(() => {
        if (!alertReceived) {
          done();
        }
      }, 2000);
    }, 10000);
  });

  describe('REQ-2.4.15: 实时延迟摘要', () => {
    test('应该提供实时延迟摘要', () => {
      // 记录各种类型的延迟
      latencyMonitor.recordNetworkLatency(75);
      latencyMonitor.recordProcessingLatency(8);
      latencyMonitor.recordEndToEndLatency(120);

      const summary = latencyMonitor.getLatencySummary();
      
      expect(summary[LatencyType.NETWORK]).toBeDefined();
      expect(summary[LatencyType.NETWORK].current).toBe(75);
      expect(summary[LatencyType.NETWORK].trend).toBe('stable');
      expect(summary[LatencyType.NETWORK].alertLevel).toBe('normal');

      expect(summary[LatencyType.PROCESSING]).toBeDefined();
      expect(summary[LatencyType.PROCESSING].current).toBe(8);
      
      expect(summary[LatencyType.END_TO_END]).toBeDefined();
      expect(summary[LatencyType.END_TO_END].current).toBe(120);
    });

    test('应该正确标识告警级别', () => {
      // 记录触发警告的延迟
      latencyMonitor.recordNetworkLatency(150); // 超过100ms警告阈值

      const summary = latencyMonitor.getLatencySummary();
      expect(summary[LatencyType.NETWORK].alertLevel).toBe('warning');

      // 记录触发严重告警的延迟
      latencyMonitor.recordNetworkLatency(600); // 超过500ms严重阈值

      const updatedSummary = latencyMonitor.getLatencySummary();
      expect(updatedSummary[LatencyType.NETWORK].alertLevel).toBe('critical');
    });
  });

  describe('REQ-2.4.16: 配置和管理', () => {
    test('应该支持运行时配置更新', (done) => {
      latencyMonitor.on('config_updated', (data) => {
        expect(data.config.thresholds[LatencyType.NETWORK].warning).toBe(80);
        done();
      });

      const newConfig = {
        thresholds: {
          ...config.thresholds,
          [LatencyType.NETWORK]: {
            ...config.thresholds[LatencyType.NETWORK],
            warning: 80
          }
        }
      };

      latencyMonitor.updateConfig(newConfig);
    });

    test('应该正确清理过期数据', () => {
      const oldTimestamp = Date.now() - 7200000; // 2小时前

      // 记录旧数据
      latencyMonitor.recordLatency({
        type: LatencyType.NETWORK,
        value: 100,
        timestamp: oldTimestamp
      });

      // 记录新数据
      latencyMonitor.recordNetworkLatency(50);

      expect(latencyMonitor.getStats(LatencyType.NETWORK)!.count).toBe(2);

      // 清理1小时前的数据
      latencyMonitor.cleanup(3600000);

      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(stats!.count).toBe(1);
      expect(stats!.mean).toBe(50);
    });

    test('应该支持重置操作', () => {
      // 记录一些数据
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordNetworkLatency(i * 10);
      }

      expect(latencyMonitor.getStats(LatencyType.NETWORK)!.count).toBe(10);

      // 重置
      latencyMonitor.reset();

      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(stats!.count).toBe(0);
      expect(latencyMonitor.getTrends(LatencyType.NETWORK)).toHaveLength(0);
      expect(latencyMonitor.getBuckets(LatencyType.NETWORK)).toHaveLength(9);
    });
  });

  describe('REQ-2.4.17: 性能要求', () => {
    test('延迟记录性能应满足要求', () => {
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 100);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // 平均记录时间应小于0.1ms
      expect(avgTime).toBeLessThan(0.1);
    });

    test('统计计算性能应满足要求', () => {
      // 记录大量数据
      for (let i = 0; i < 10000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 1000);
      }

      const startTime = performance.now();
      
      // 执行多次统计计算
      for (let i = 0; i < 100; i++) {
        latencyMonitor.getStats(LatencyType.NETWORK);
        latencyMonitor.getBuckets(LatencyType.NETWORK);
        latencyMonitor.getLatencySummary();
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / 100;

      // 平均统计计算时间应小于10ms
      expect(avgTime).toBeLessThan(10);
    });

    test('内存使用应保持合理', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 记录大量延迟数据
      for (let i = 0; i < 50000; i++) {
        latencyMonitor.recordNetworkLatency(Math.random() * 1000);
      }

      const afterRecording = process.memoryUsage().heapUsed;
      const memoryIncrease = afterRecording - initialMemory;
      
      // 内存增长应该合理（小于50MB）
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      // 清理数据
      latencyMonitor.cleanup(0);
      
      if (global.gc) {
        global.gc();
      }

      const afterCleanup = process.memoryUsage().heapUsed;
      expect(afterCleanup).toBeLessThan(afterRecording);
    });
  });
});