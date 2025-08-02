/**
 * LatencyMonitor 单元测试
 */

import { LatencyMonitor, LatencyType } from '../LatencyMonitor';

describe('LatencyMonitor', () => {
  let latencyMonitor: LatencyMonitor;
  const mockConfig = {
    sampling: {
      maxSamples: 1000,
      windowSize: 60000, // 1分钟
      sampleInterval: 1000 // 1秒
    },
    buckets: {
      boundaries: [0, 10, 50, 100, 200, 500, 1000]
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

  beforeEach(() => {
    latencyMonitor = new LatencyMonitor(mockConfig);
  });

  afterEach(() => {
    latencyMonitor.stop();
    latencyMonitor.removeAllListeners();
  });

  describe('Latency Recording', () => {
    test('should record latency measurements', () => {
      latencyMonitor.recordNetworkLatency(75, 'test-connection');
      
      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
      expect(stats!.mean).toBe(75);
    });

    test('should handle multiple latency types', () => {
      latencyMonitor.recordNetworkLatency(50);
      latencyMonitor.recordProcessingLatency(5);
      latencyMonitor.recordEndToEndLatency(100);
      
      const networkStats = latencyMonitor.getStats(LatencyType.NETWORK);
      const processingStats = latencyMonitor.getStats(LatencyType.PROCESSING);
      const endToEndStats = latencyMonitor.getStats(LatencyType.END_TO_END);
      
      expect(networkStats!.count).toBe(1);
      expect(processingStats!.count).toBe(1);
      expect(endToEndStats!.count).toBe(1);
    });

    test('should reject invalid measurements', (done) => {
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

    test('should limit sample size', () => {
      // 添加超过最大样本数的测量
      for (let i = 0; i < 1500; i++) {
        latencyMonitor.recordNetworkLatency(i);
      }
      
      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(stats!.count).toBeLessThanOrEqual(mockConfig.sampling.maxSamples);
    });
  });

  describe('Statistical Calculations', () => {
    beforeEach(() => {
      // 添加一组已知的测量值
      const measurements = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      measurements.forEach(value => {
        latencyMonitor.recordNetworkLatency(value);
      });
    });

    test('should calculate basic statistics correctly', () => {
      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      
      expect(stats!.count).toBe(10);
      expect(stats!.min).toBe(10);
      expect(stats!.max).toBe(100);
      expect(stats!.mean).toBe(55);
      expect(stats!.sum).toBe(550);
    });

    test('should calculate percentiles correctly', () => {
      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      
      expect(stats!.median).toBe(50); // 中位数
      expect(stats!.p90).toBe(90);    // 90th百分位
      expect(stats!.p95).toBe(95);    // 95th百分位
      expect(stats!.p99).toBe(99);    // 99th百分位
    });

    test('should calculate standard deviation', () => {
      const stats = latencyMonitor.getStats(LatencyType.NETWORK);
      
      // 对于 [10,20,30,40,50,60,70,80,90,100] 的标准差约为 30.28
      expect(stats!.standardDeviation).toBeCloseTo(30.28, 1);
    });
  });

  describe('Bucket Distribution', () => {
    test('should distribute measurements into buckets', () => {
      // 添加一些测量值
      latencyMonitor.recordNetworkLatency(5);   // 0-10ms 桶
      latencyMonitor.recordNetworkLatency(25);  // 10-50ms 桶
      latencyMonitor.recordNetworkLatency(75);  // 50-100ms 桶
      latencyMonitor.recordNetworkLatency(150); // 100-200ms 桶
      
      const buckets = latencyMonitor.getBuckets(LatencyType.NETWORK);
      
      expect(buckets).toBeDefined();
      expect(buckets.length).toBeGreaterThan(0);
      
      // 检查分布
      const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
      expect(totalCount).toBe(4);
    });

    test('should calculate percentages correctly', () => {
      latencyMonitor.recordNetworkLatency(25);
      latencyMonitor.recordNetworkLatency(75);
      
      const buckets = latencyMonitor.getBuckets(LatencyType.NETWORK);
      const totalPercentage = buckets.reduce((sum, bucket) => sum + bucket.percentage, 0);
      
      expect(totalPercentage).toBeCloseTo(100, 1);
    });
  });

  describe('Threshold Alerts', () => {
    test('should emit warning alerts for high latency', (done) => {
      latencyMonitor.on('latency_alert', (alert) => {
        expect(alert.severity).toBe('high');
        expect(alert.type).toBe(LatencyType.NETWORK);
        expect(alert.value).toBe(150);
        done();
      });

      latencyMonitor.recordNetworkLatency(150); // 超过警告阈值100ms
    });

    test('should emit critical alerts for very high latency', (done) => {
      latencyMonitor.on('latency_alert', (alert) => {
        expect(alert.severity).toBe('critical');
        expect(alert.type).toBe(LatencyType.NETWORK);
        expect(alert.value).toBe(600);
        done();
      });

      latencyMonitor.recordNetworkLatency(600); // 超过严重阈值500ms
    });

    test('should emit P95 alerts', (done) => {
      // 先添加一些基础数据
      for (let i = 0; i < 100; i++) {
        latencyMonitor.recordNetworkLatency(50);
      }
      
      latencyMonitor.on('latency_alert', (alert) => {
        if (alert.message.includes('P95')) {
          expect(alert.severity).toBe('medium');
          done();
        }
      });

      // 添加一些高延迟值以推高P95
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordNetworkLatency(250);
      }
    });
  });

  describe('Trend Analysis', () => {
    test('should detect improving trends', (done) => {
      latencyMonitor.on('trend_detected', (data) => {
        if (data.trend.trendDirection === 'improving') {
          expect(data.trend.changePercentage).toBeLessThan(0);
          done();
        }
      });

      // 模拟趋势改善（延迟下降）
      // 第一个时间窗口
      for (let i = 0; i < 50; i++) {
        latencyMonitor.recordNetworkLatency(100);
      }
      
      // 等待一段时间后添加更好的延迟
      setTimeout(() => {
        for (let i = 0; i < 50; i++) {
          latencyMonitor.recordNetworkLatency(50);
        }
      }, 100);
    });

    test('should detect degrading trends', (done) => {
      latencyMonitor.on('trend_detected', (data) => {
        if (data.trend.trendDirection === 'degrading') {
          expect(data.trend.changePercentage).toBeGreaterThan(0);
          done();
        }
      });

      // 模拟趋势恶化（延迟上升）
      for (let i = 0; i < 50; i++) {
        latencyMonitor.recordNetworkLatency(50);
      }
      
      setTimeout(() => {
        for (let i = 0; i < 50; i++) {
          latencyMonitor.recordNetworkLatency(150);
        }
      }, 100);
    });
  });

  describe('Baseline Comparison', () => {
    test('should compare against baseline targets', () => {
      // 添加一些延迟测量
      latencyMonitor.recordNetworkLatency(60); // 高于目标50ms
      latencyMonitor.recordProcessingLatency(3); // 低于目标5ms
      
      const comparison = latencyMonitor.compareToBaseline();
      
      expect(comparison[LatencyType.NETWORK]).toBeDefined();
      expect(comparison[LatencyType.NETWORK].target).toBe(50);
      expect(comparison[LatencyType.NETWORK].actual).toBe(60);
      expect(comparison[LatencyType.NETWORK].deviation).toBeGreaterThan(0);
      
      expect(comparison[LatencyType.PROCESSING]).toBeDefined();
      expect(comparison[LatencyType.PROCESSING].performance).toBe('better');
    });

    test('should identify acceptable vs unacceptable performance', () => {
      // 添加接近目标的测量（在可接受偏差内）
      latencyMonitor.recordNetworkLatency(60); // 60ms vs 50ms target = 20% deviation
      
      const comparison = latencyMonitor.compareToBaseline();
      expect(comparison[LatencyType.NETWORK].acceptable).toBe(true); // 20% < 50% 可接受偏差
      
      // 添加远离目标的测量
      latencyMonitor.recordNetworkLatency(100); // 100ms vs 50ms = 100% deviation
      
      const comparison2 = latencyMonitor.compareToBaseline();
      expect(comparison2[LatencyType.NETWORK].acceptable).toBe(false); // 100% > 50% 可接受偏差
    });
  });

  describe('Data Management', () => {
    test('should cleanup old measurements', () => {
      // 添加一些测量
      for (let i = 0; i < 10; i++) {
        latencyMonitor.recordNetworkLatency(50);
      }
      
      const statsBefore = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(statsBefore!.count).toBe(10);
      
      // 清理所有数据
      latencyMonitor.cleanup(0);
      
      const statsAfter = latencyMonitor.getStats(LatencyType.NETWORK);
      expect(statsAfter!.count).toBe(0);
    });

    test('should reset all statistics', () => {
      latencyMonitor.recordNetworkLatency(50);
      latencyMonitor.recordProcessingLatency(10);
      
      expect(latencyMonitor.getStats(LatencyType.NETWORK)!.count).toBe(1);
      expect(latencyMonitor.getStats(LatencyType.PROCESSING)!.count).toBe(1);
      
      latencyMonitor.reset();
      
      expect(latencyMonitor.getStats(LatencyType.NETWORK)!.count).toBe(0);
      expect(latencyMonitor.getStats(LatencyType.PROCESSING)!.count).toBe(0);
    });
  });

  describe('Latency Summary', () => {
    test('should provide latency summary', () => {
      latencyMonitor.recordNetworkLatency(75);
      latencyMonitor.recordProcessingLatency(8);
      
      const summary = latencyMonitor.getLatencySummary();
      
      expect(summary[LatencyType.NETWORK]).toBeDefined();
      expect(summary[LatencyType.NETWORK].current).toBe(75);
      expect(summary[LatencyType.NETWORK].alertLevel).toBe('normal'); // 75 < 100 warning threshold
      
      expect(summary[LatencyType.PROCESSING]).toBeDefined();
      expect(summary[LatencyType.PROCESSING].current).toBe(8);
      expect(summary[LatencyType.PROCESSING].alertLevel).toBe('normal'); // 8 < 10 warning threshold
    });

    test('should indicate alert levels correctly', () => {
      latencyMonitor.recordNetworkLatency(600); // 超过critical阈值500
      
      const summary = latencyMonitor.getLatencySummary();
      expect(summary[LatencyType.NETWORK].alertLevel).toBe('critical');
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', (done) => {
      latencyMonitor.on('config_updated', (data) => {
        expect(data.config.sampling.maxSamples).toBe(2000);
        done();
      });

      latencyMonitor.updateConfig({
        sampling: {
          ...mockConfig.sampling,
          maxSamples: 2000
        }
      });

      expect(latencyMonitor.getConfig().sampling.maxSamples).toBe(2000);
    });
  });

  describe('Event Emission', () => {
    test('should emit latency_recorded events', (done) => {
      latencyMonitor.on('latency_recorded', (measurement) => {
        expect(measurement.type).toBe(LatencyType.NETWORK);
        expect(measurement.value).toBe(50);
        done();
      });

      latencyMonitor.recordNetworkLatency(50);
    });

    test('should emit stats_updated events', (done) => {
      latencyMonitor.on('stats_updated', (data) => {
        expect(data.timestamp).toBeDefined();
        expect(data.stats).toBeDefined();
        done();
      });

      latencyMonitor.recordNetworkLatency(50);
      
      // 等待统计更新
      setTimeout(() => {
        // 手动触发统计更新（正常情况下由定时器触发）
      }, 50);
    });
  });
});