/**
 * AdapterStatusMonitor 单元测试
 */

import { AdapterStatusMonitor } from '../AdapterStatusMonitor';
import { ErrorHandler } from '../ErrorHandler';
import { LatencyMonitor } from '../LatencyMonitor';
import { AdapterStatus } from '../../types';
import { ConnectionState, ConnectionStats } from '../interfaces';

describe('AdapterStatusMonitor', () => {
  let statusMonitor: AdapterStatusMonitor;
  let errorHandler: ErrorHandler;
  let latencyMonitor: LatencyMonitor;
  
  const mockConfig = {
    updateInterval: 100, // 更快的更新间隔用于测试
    snapshotRetention: 5,
    healthThresholds: {
      warning: 0.7,
      critical: 0.4
    },
    benchmarks: {
      messagesPerSecond: {
        target: 1000,
        warning: 500,
        critical: 100
      },
      latency: {
        target: 50,
        warning: 100,
        critical: 500
      },
      errorRate: {
        target: 1,
        warning: 5,
        critical: 10
      },
      connectionSuccess: {
        target: 99,
        warning: 95,
        critical: 90
      }
    },
    alerting: {
      enabled: true,
      cooldownPeriod: 100 // 较短的冷却期用于测试
    }
  };

  const mockErrorHandlerConfig = {
    maxRecentErrors: 10,
    errorRateWindow: 60000,
    criticalErrorThreshold: 5,
    retryLimits: {
      connection: 3,
      heartbeat: 2,
      protocol: 3,
      data_parsing: 0,
      subscription: 3,
      pubsub: 3,
      config: 0,
      network: 5,
      authentication: 1,
      rate_limit: 0,
      unknown: 1
    },
    circuitBreakerThreshold: 10,
    alerting: {
      enabled: true,
      criticalErrorNotification: true,
      errorRateThreshold: 5
    }
  };

  const mockLatencyConfig = {
    sampling: { maxSamples: 100, windowSize: 60000, sampleInterval: 1000 },
    buckets: { boundaries: [0, 10, 50, 100, 200, 500] },
    thresholds: {
      network: { warning: 100, critical: 500, p95Warning: 200, p99Critical: 1000 },
      processing: { warning: 10, critical: 50, p95Warning: 20, p99Critical: 100 },
      end_to_end: { warning: 150, critical: 750, p95Warning: 300, p99Critical: 1500 },
      heartbeat: { warning: 30000, critical: 60000, p95Warning: 45000, p99Critical: 90000 },
      subscription: { warning: 5000, critical: 15000, p95Warning: 10000, p99Critical: 30000 }
    },
    trend: { enabled: false, windowCount: 5, significantChange: 20 },
    baseline: { 
      enabled: false, 
      targetLatency: {
        network: 50,
        processing: 5,
        end_to_end: 100,
        heartbeat: 20000,
        subscription: 2000
      }, 
      acceptableDeviation: 50 
    }
  };

  beforeEach(() => {
    statusMonitor = new AdapterStatusMonitor(mockConfig);
    errorHandler = new ErrorHandler(mockErrorHandlerConfig);
    latencyMonitor = new LatencyMonitor(mockLatencyConfig);
    
    statusMonitor.setErrorHandler(errorHandler);
    statusMonitor.setLatencyMonitor(latencyMonitor);
  });

  afterEach(() => {
    statusMonitor.stop();
    latencyMonitor.stop();
    statusMonitor.removeAllListeners();
    errorHandler.removeAllListeners();
    latencyMonitor.removeAllListeners();
  });

  describe('Status Management', () => {
    test('should update adapter status', (done) => {
      statusMonitor.on('status_changed', (event) => {
        expect(event.previousStatus).toBe(AdapterStatus.INITIALIZING);
        expect(event.currentStatus).toBe(AdapterStatus.ACTIVE);
        expect(event.reason).toBe('Test status change');
        done();
      });

      statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Test status change');
    });

    test('should not emit event for same status', () => {
      let eventCount = 0;
      statusMonitor.on('status_changed', () => {
        eventCount++;
      });

      statusMonitor.updateStatus(AdapterStatus.ACTIVE);
      statusMonitor.updateStatus(AdapterStatus.ACTIVE); // 相同状态，不应触发事件

      expect(eventCount).toBe(1);
    });

    test('should track status history', () => {
      statusMonitor.updateStatus(AdapterStatus.CONNECTING);
      statusMonitor.updateStatus(AdapterStatus.ACTIVE);
      statusMonitor.updateStatus(AdapterStatus.ERROR);

      const history = statusMonitor.getStatusHistory();
      expect(history.length).toBe(3);
      expect(history[0]?.currentStatus).toBe(AdapterStatus.CONNECTING);
      expect(history[1]?.currentStatus).toBe(AdapterStatus.ACTIVE);
      expect(history[2]?.currentStatus).toBe(AdapterStatus.ERROR);
    });
  });

  describe('Snapshot Creation', () => {
    test('should create status snapshots', () => {
      const mockConnectionStats: ConnectionStats[] = [{
        connectionId: 'test-conn-1',
        state: ConnectionState.ACTIVE,
        connectedAt: Date.now(),
        uptime: 10000,
        connectionAttempts: 1,
        successfulConnections: 1,
        failedConnections: 0,
        reconnectAttempts: 0,
        activeSubscriptions: 5,
        lastError: undefined
      }];

      const mockPerformanceStats = {
        latency: {
          current: 50,
          average: 45,
          min: 20,
          max: 80,
          p50: 45,
          p90: 70,
          p95: 75,
          p99: 80
        },
        processingTime: {
          average: 5,
          p95: 8,
          p99: 10
        }
      };

      statusMonitor.updateStatus(AdapterStatus.ACTIVE);
      const snapshot = statusMonitor.createSnapshot(mockConnectionStats, mockPerformanceStats);

      expect(snapshot.status).toBe(AdapterStatus.ACTIVE);
      expect(snapshot.overallHealth).toBeGreaterThan(0);
      expect(snapshot.connectionStats).toEqual(mockConnectionStats);
      expect(snapshot.performanceStats).toEqual(mockPerformanceStats);
      expect(snapshot.subscriptionCount).toBe(5);
    });

    test('should maintain snapshot history', () => {
      for (let i = 0; i < 10; i++) {
        statusMonitor.createSnapshot();
      }

      const snapshots = statusMonitor.getSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(mockConfig.snapshotRetention);
    });

    test('should emit snapshot_created events', (done) => {
      statusMonitor.on('snapshot_created', (snapshot) => {
        expect(snapshot.timestamp).toBeDefined();
        expect(snapshot.healthFactors).toBeDefined();
        done();
      });

      statusMonitor.createSnapshot();
    });
  });

  describe('Health Score Calculation', () => {
    test('should calculate connectivity health', () => {
      const mockConnectionStats: ConnectionStats[] = [
        {
          connectionId: 'conn-1',
          state: ConnectionState.ACTIVE,
          connectionAttempts: 10,
          successfulConnections: 9,
          connectedAt: Date.now(),
          uptime: 10000,
          failedConnections: 1,
          reconnectAttempts: 0,
          activeSubscriptions: 5,
          lastError: undefined
        },
        {
          connectionId: 'conn-2',
          state: ConnectionState.DISCONNECTED,
          connectionAttempts: 5,
          successfulConnections: 3,
          connectedAt: undefined,
          uptime: 0,
          failedConnections: 2,
          reconnectAttempts: 1,
          activeSubscriptions: 0,
          lastError: undefined
        }
      ];

      const snapshot = statusMonitor.createSnapshot(mockConnectionStats);
      
      // 连接健康度应该反映50%的连接处于活跃状态和90%的成功率
      expect(snapshot.healthFactors.connectivity).toBeGreaterThan(0.5);
      expect(snapshot.healthFactors.connectivity).toBeLessThan(1.0);
    });

    test('should calculate error rate health', () => {
      // 添加一些错误
      for (let i = 0; i < 3; i++) {
        errorHandler.handleError(new Error(`Test error ${i}`));
      }

      const snapshot = statusMonitor.createSnapshot();
      
      // 错误率健康度应该受到错误数量影响
      expect(snapshot.healthFactors.errorRate).toBeLessThan(1.0);
    });

    test('should calculate overall health score', () => {
      statusMonitor.updateStatus(AdapterStatus.ACTIVE);
      
      const mockConnectionStats: ConnectionStats[] = [{
        connectionId: 'test-conn',
        state: ConnectionState.ACTIVE,
        connectedAt: Date.now(),
        uptime: 10000,
        connectionAttempts: 1,
        successfulConnections: 1,
        failedConnections: 0,
        reconnectAttempts: 0,
        activeSubscriptions: 3,
        lastError: undefined
      }];

      const snapshot = statusMonitor.createSnapshot(mockConnectionStats);
      
      expect(snapshot.overallHealth).toBeGreaterThan(0);
      expect(snapshot.overallHealth).toBeLessThanOrEqual(1);
    });
  });

  describe('Health Alerts', () => {
    test('should emit health alerts for low overall health', (done) => {
      statusMonitor.on('health_alert', (alert) => {
        expect(alert.severity).toBe('critical');
        expect(alert.factor).toBe('overallHealth');
        done();
      });

      // 创建一个低健康度的场景
      const poorConnectionStats: ConnectionStats[] = [{
        connectionId: 'poor-conn',
        state: ConnectionState.ERROR,
        connectedAt: undefined,
        uptime: 0,
        connectionAttempts: 5,
        successfulConnections: 0,
        failedConnections: 5,
        reconnectAttempts: 3,
        activeSubscriptions: 0,
        lastError: {
          timestamp: Date.now(),
          message: 'Connection failed',
          code: 'CONN_FAILED',
          type: 'CONNECTION',
          fatal: false
        }
      }];

      statusMonitor.createSnapshot(poorConnectionStats);
    });

    test('should respect alert cooldown period', () => {
      let alertCount = 0;
      statusMonitor.on('health_alert', () => {
        alertCount++;
      });

      // 创建多个低健康度快照
      const poorStats: ConnectionStats[] = [{
        connectionId: 'poor-conn',
        state: ConnectionState.ERROR,
        connectedAt: undefined,
        uptime: 0,
        connectionAttempts: 5,
        successfulConnections: 0,
        failedConnections: 5,
        reconnectAttempts: 3,
        activeSubscriptions: 0,
        lastError: undefined
      }];

      statusMonitor.createSnapshot(poorStats);
      statusMonitor.createSnapshot(poorStats); // 应该被冷却期阻止

      expect(alertCount).toBeLessThanOrEqual(1);
    });
  });

  describe('Integration with Error Handler', () => {
    test('should respond to critical errors', (done) => {
      statusMonitor.on('health_alert', (alert) => {
        expect(alert.message).toContain('Critical error occurred');
        done();
      });

      // 触发致命错误
      errorHandler.handleError(new Error('Authentication failed'));
    });

    test('should respond to high error rates', (done) => {
      statusMonitor.on('health_alert', (alert) => {
        expect(alert.message).toContain('High error rate detected');
        done();
      });

      // 快速添加多个错误以触发高错误率
      for (let i = 0; i < 8; i++) {
        errorHandler.handleError(new Error(`Rapid error ${i}`));
      }
    });
  });

  describe('Integration with Latency Monitor', () => {
    test('should respond to latency alerts', (done) => {
      statusMonitor.on('health_alert', (alert) => {
        expect(alert.message).toContain('Latency alert');
        done();
      });

      // 触发延迟告警
      latencyMonitor.recordNetworkLatency(600); // 超过critical阈值
    });
  });

  describe('Utility Functions', () => {
    test('should calculate uptime correctly', () => {
      const startTime = Date.now();
      
      setTimeout(() => {
        const uptime = statusMonitor.getUptime();
        expect(uptime).toBeGreaterThan(0);
        expect(uptime).toBeLessThan(1000); // 应该小于1秒
      }, 50);
    });

    test('should provide health trend data', () => {
      // 创建一些快照
      for (let i = 0; i < 5; i++) {
        statusMonitor.createSnapshot();
      }

      const trend = statusMonitor.getHealthTrend(1); // 1分钟内的趋势
      expect(Array.isArray(trend)).toBe(true);
      trend.forEach(point => {
        expect(point.timestamp).toBeDefined();
        expect(point.health).toBeGreaterThanOrEqual(0);
        expect(point.health).toBeLessThanOrEqual(1);
      });
    });

    test('should reset monitor state', () => {
      statusMonitor.updateStatus(AdapterStatus.ACTIVE);
      statusMonitor.createSnapshot();
      
      expect(statusMonitor.getSnapshots().length).toBeGreaterThan(0);
      expect(statusMonitor.getStatusHistory().length).toBeGreaterThan(0);
      
      statusMonitor.reset();
      
      expect(statusMonitor.getCurrentStatus()).toBe(AdapterStatus.INITIALIZING);
      expect(statusMonitor.getSnapshots().length).toBe(0);
      expect(statusMonitor.getStatusHistory().length).toBe(0);
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', (done) => {
      statusMonitor.on('config_updated', (data) => {
        expect(data.config.updateInterval).toBe(200);
        done();
      });

      statusMonitor.updateConfig({
        updateInterval: 200
      });

      expect(statusMonitor.getConfig().updateInterval).toBe(200);
    });
  });

  describe('Subscription Count Calculation', () => {
    test('should calculate total subscription count from connection stats', () => {
      const mockConnectionStats: ConnectionStats[] = [
        {
          connectionId: 'conn-1',
          state: ConnectionState.ACTIVE,
          activeSubscriptions: 5,
          connectedAt: Date.now(),
          uptime: 10000,
          connectionAttempts: 1,
          successfulConnections: 1,
          failedConnections: 0,
          reconnectAttempts: 0,
          lastError: undefined
        },
        {
          connectionId: 'conn-2',
          state: ConnectionState.ACTIVE,
          activeSubscriptions: 3,
          connectedAt: Date.now(),
          uptime: 8000,
          connectionAttempts: 1,
          successfulConnections: 1,
          failedConnections: 0,
          reconnectAttempts: 0,
          lastError: undefined
        }
      ];

      const snapshot = statusMonitor.createSnapshot(mockConnectionStats);
      expect(snapshot.subscriptionCount).toBe(8); // 5 + 3
    });
  });
});