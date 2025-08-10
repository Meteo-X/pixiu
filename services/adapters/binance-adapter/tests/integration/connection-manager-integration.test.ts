/**
 * BinanceConnectionManager集成测试
 * 验证BaseConnectionManager集成的完整性和正确性
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '../../src/connection/binance-connection-manager';
import { ConnectionState } from '@pixiu/adapter-base';

describe('BinanceConnectionManager集成测试', () => {
  let connectionManager: BinanceConnectionManager;
  const testConfig: BinanceConnectionConfig = {
    url: 'wss://testnet.binance.vision/ws',
    timeout: 10000,
    maxRetries: 3,
    retryInterval: 1000,
    heartbeatInterval: 30000,
    heartbeatTimeout: 10000,
    binance: {
      testnet: true,
      enableCompression: false,
      combinedStream: {
        streams: ['btcusdt@trade', 'ethusdt@ticker'],
        autoManage: true,
        maxStreams: 100,
        batchDelay: 500
      },
      connectionPool: {
        maxConnections: 10,
        connectionTimeout: 5000,
        idleTimeout: 300000
      },
      reconnectStrategy: {
        backoffBase: 2,
        maxRetryInterval: 30000,
        jitter: true
      }
    }
  };

  beforeEach(() => {
    connectionManager = new BinanceConnectionManager();
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.destroy();
    }
  });

  describe('基础连接功能', () => {
    test('应该能够成功建立连接', async () => {
      const connectPromise = connectionManager.connect(testConfig);
      
      // 验证状态变化
      expect(connectionManager.getState()).toBe(ConnectionState.CONNECTING);
      
      // 等待连接完成（使用较短的超时时间用于测试）
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('连接超时')), 15000)
      );
      
      await expect(Promise.race([connectPromise, timeoutPromise])).resolves.not.toThrow();
      expect(connectionManager.getState()).toBe(ConnectionState.CONNECTED);
      expect(connectionManager.isConnected()).toBe(true);
    });

    test('应该正确构建组合流URL', async () => {
      await connectionManager.connect(testConfig);
      
      const config = connectionManager.getConfig();
      expect(config.url).toContain('stream?streams=');
      expect(config.url).toContain('btcusdt@trade');
      expect(config.url).toContain('ethusdt@ticker');
    });
  });

  describe('流管理功能', () => {
    beforeEach(async () => {
      await connectionManager.connect(testConfig);
    });

    test('应该能够动态添加流', async () => {
      const initialStreams = connectionManager.getActiveStreams();
      const initialCount = initialStreams.length;
      
      await connectionManager.addStream('bnbusdt@trade');
      
      const updatedStreams = connectionManager.getActiveStreams();
      expect(updatedStreams.length).toBe(initialCount + 1);
      expect(updatedStreams).toContain('bnbusdt@trade');
    });

    test('应该能够动态移除流', async () => {
      const initialStreams = connectionManager.getActiveStreams();
      const streamToRemove = initialStreams[0];
      
      await connectionManager.removeStream(streamToRemove);
      
      const updatedStreams = connectionManager.getActiveStreams();
      expect(updatedStreams.length).toBe(initialStreams.length - 1);
      expect(updatedStreams).not.toContain(streamToRemove);
    });

    test('应该防止重复添加相同的流', async () => {
      const initialStreams = connectionManager.getActiveStreams();
      const existingStream = initialStreams[0];
      
      await connectionManager.addStream(existingStream);
      
      const updatedStreams = connectionManager.getActiveStreams();
      expect(updatedStreams.length).toBe(initialStreams.length);
    });

    test('应该处理流数量限制', async () => {
      // 尝试添加超过限制的流
      const promises = [];
      for (let i = 0; i < 200; i++) {
        promises.push(connectionManager.addStream(`test${i}@trade`));
      }
      
      // 应该有一些添加操作失败
      const results = await Promise.allSettled(promises);
      const rejectedCount = results.filter(r => r.status === 'rejected').length;
      expect(rejectedCount).toBeGreaterThan(0);
    });
  });

  describe('性能指标和监控', () => {
    beforeEach(async () => {
      await connectionManager.connect(testConfig);
    });

    test('应该收集Binance特定指标', () => {
      const metrics = connectionManager.getBinanceMetrics();
      
      expect(metrics).toHaveProperty('activeStreams');
      expect(metrics).toHaveProperty('streamChanges');
      expect(metrics).toHaveProperty('reconnectCount');
      expect(metrics).toHaveProperty('messageLatency');
      expect(metrics).toHaveProperty('streamOperations');
      
      expect(metrics.activeStreams).toBeGreaterThanOrEqual(0);
      expect(metrics.streamOperations).toHaveProperty('additions');
      expect(metrics.streamOperations).toHaveProperty('removals');
      expect(metrics.streamOperations).toHaveProperty('modifications');
    });

    test('应该跟踪流操作统计', async () => {
      const initialMetrics = connectionManager.getBinanceMetrics();
      
      await connectionManager.addStream('newstream@trade');
      await connectionManager.removeStream('newstream@trade');
      
      const updatedMetrics = connectionManager.getBinanceMetrics();
      expect(updatedMetrics.streamOperations.additions).toBe(initialMetrics.streamOperations.additions + 1);
      expect(updatedMetrics.streamOperations.removals).toBe(initialMetrics.streamOperations.removals + 1);
    });
  });

  describe('错误处理和恢复', () => {
    test('应该处理连接错误', async () => {
      const invalidConfig = {
        ...testConfig,
        url: 'wss://invalid.url'
      };
      
      await expect(connectionManager.connect(invalidConfig)).rejects.toThrow();
      expect(connectionManager.getState()).toBe(ConnectionState.ERROR);
    });

    test('应该实现智能重连策略', async () => {
      // 建立初始连接
      await connectionManager.connect(testConfig);
      
      // 模拟连接断开
      const connectionMetrics = connectionManager.getMetrics();
      const initialReconnectCount = connectionMetrics.reconnectAttempts;
      
      // 触发重连（这里需要模拟网络中断）
      await connectionManager.reconnect();
      
      const updatedMetrics = connectionManager.getBinanceMetrics();
      expect(updatedMetrics.reconnectCount).toBe(initialReconnectCount + 1);
    });
  });

  describe('健康检查', () => {
    beforeEach(async () => {
      await connectionManager.connect(testConfig);
    });

    test('应该提供健康检查功能', async () => {
      const healthCheck = await connectionManager.healthCheck();
      
      expect(healthCheck).toHaveProperty('healthy');
      expect(healthCheck).toHaveProperty('details');
      expect(healthCheck.details).toHaveProperty('binance');
      
      if (connectionManager.isConnected()) {
        expect(healthCheck.healthy).toBe(true);
        expect(healthCheck.details.binance).toHaveProperty('activeStreams');
        expect(healthCheck.details.binance).toHaveProperty('metrics');
      }
    });
  });

  describe('事件系统', () => {
    test('应该正确发出流管理事件', async () => {
      const streamAddedEvents: string[] = [];
      const streamRemovedEvents: string[] = [];
      
      connectionManager.on('streamAdded', (streamName) => {
        streamAddedEvents.push(streamName);
      });
      
      connectionManager.on('streamRemoved', (streamName) => {
        streamRemovedEvents.push(streamName);
      });
      
      await connectionManager.connect(testConfig);
      await connectionManager.addStream('test@trade');
      await connectionManager.removeStream('test@trade');
      
      expect(streamAddedEvents).toContain('test@trade');
      expect(streamRemovedEvents).toContain('test@trade');
    });
  });

  describe('资源管理', () => {
    test('应该正确清理资源', async () => {
      await connectionManager.connect(testConfig);
      const initialState = connectionManager.getState();
      expect(initialState).toBe(ConnectionState.CONNECTED);
      
      await connectionManager.destroy();
      
      const finalState = connectionManager.getState();
      expect(finalState).toBe(ConnectionState.DISCONNECTED);
      
      // 验证指标已重置
      const metrics = connectionManager.getBinanceMetrics();
      expect(metrics.activeStreams).toBe(0);
      expect(metrics.streamChanges).toBe(0);
    });
  });

  describe('批量操作优化', () => {
    beforeEach(async () => {
      await connectionManager.connect(testConfig);
    });

    test('应该批量处理流变更', async () => {
      const initialMetrics = connectionManager.getBinanceMetrics();
      
      // 快速连续添加多个流
      const addPromises = [
        connectionManager.addStream('stream1@trade'),
        connectionManager.addStream('stream2@trade'),
        connectionManager.addStream('stream3@trade')
      ];
      
      await Promise.all(addPromises);
      
      // 等待批量处理完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const updatedMetrics = connectionManager.getBinanceMetrics();
      expect(updatedMetrics.streamOperations.modifications).toBeGreaterThan(initialMetrics.streamOperations.modifications);
    });
  });
});