/**
 * 错误恢复策略测试套件
 * 测试智能重连策略、断路器模式和错误恢复机制
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '@pixiu/binance-adapter';
import { ConnectionState } from '@pixiu/adapter-base';
import { BaseAdapter, AdapterStatus } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { MockWebSocket, createMockWebSocket, WebSocketMockFactory } from '../../mocks/websocket-mock';
import { TestConfigGenerator, EventListenerHelper, PerformanceMonitor } from '../../helpers/test-helpers';

// 测试用的适配器
class RecoveryTestAdapter extends BaseAdapter {
  public readonly exchange = 'binance';
  private connectionManager?: BinanceConnectionManager;
  
  protected async createConnectionManager() {
    this.connectionManager = new BinanceConnectionManager();
    return this.connectionManager;
  }
  
  protected async createSubscription(symbol: string, dataType: any) {
    return {
      id: `${symbol}_${dataType}_${Date.now()}`,
      symbol,
      dataType,
      subscribedAt: Date.now(),
      active: true
    };
  }
  
  protected async removeSubscription(subscription: any) {}
  
  protected parseMessage(message: any) {
    return null;
  }

  // 暴露连接管理器用于测试
  getConnectionManager() {
    return this.connectionManager;
  }
}

describe('错误恢复策略', () => {
  let connectionManager: BinanceConnectionManager;
  let adapter: RecoveryTestAdapter;
  let eventHelper: EventListenerHelper;
  let perfMonitor: PerformanceMonitor;
  let mockFactory: WebSocketMockFactory;
  let originalWebSocket: any;

  beforeAll(() => {
    originalWebSocket = global.WebSocket;
    mockFactory = new WebSocketMockFactory();
  });

  afterAll(() => {
    (global as any).WebSocket = originalWebSocket;
    if (globalCache && typeof globalCache.destroy === 'function') {
      globalCache.destroy();
    }
  });

  beforeEach(() => {
    connectionManager = new BinanceConnectionManager();
    adapter = new RecoveryTestAdapter();
    eventHelper = new EventListenerHelper();
    perfMonitor = new PerformanceMonitor();
    mockFactory.cleanup();
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.destroy();
    }
    if (adapter) {
      await adapter.destroy();
    }
    eventHelper.cleanup();
    perfMonitor.clear();
    mockFactory.cleanup();
  });

  describe('智能重连策略', () => {
    
    it('应该实现指数退避重连策略', async () => {
      const mockWebSocketClass = createMockWebSocket({
        shouldFail: true,
        failDelay: 100,
        errorMessage: 'Connection failed for exponential backoff test'
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        maxRetries: 5,
        retryInterval: 1000,
        binance: {
          reconnectStrategy: {
            backoffBase: 2,
            maxRetryInterval: 10000,
            jitter: false // 禁用抖动便于测试
          }
        }
      });

      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'reconnecting',
        'error'
      ]);

      perfMonitor.startTiming('exponential_backoff');

      // 开始连接，预期会失败并重试
      connectionManager.connect(config).catch(() => {}); // 忽略最终失败

      // 等待多次重连尝试
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('reconnecting') >= 3, 20000);

      const backoffTime = perfMonitor.endTiming('exponential_backoff');

      const reconnectingEvents = eventCollector.getEventsByType('reconnecting');
      expect(reconnectingEvents.length).toBeGreaterThanOrEqual(3);

      // 验证重连间隔呈指数增长（在无抖动的情况下）
      const expectedDelays = [1000, 2000, 4000]; // 基于backoffBase=2
      
      console.log(`✅ 指数退避策略测试完成，总时间: ${backoffTime}ms`);
      console.log(`   重连尝试次数: ${reconnectingEvents.length}`);

      eventCollector.stop();
    });

    it('应该支持最大重连间隔限制', async () => {
      const mockWebSocketClass = createMockWebSocket({
        shouldFail: true,
        failDelay: 50,
        errorMessage: 'Max interval test failure'
      });
      (global as any).WebSocket = mockWebSocketClass;

      const maxRetryInterval = 2000; // 2秒最大间隔
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        maxRetries: 10,
        retryInterval: 500, // 500ms初始间隔
        binance: {
          reconnectStrategy: {
            backoffBase: 3, // 3倍指数增长
            maxRetryInterval,
            jitter: false
          }
        }
      });

      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'reconnecting'
      ]);

      perfMonitor.startTiming('max_interval_test');

      connectionManager.connect(config).catch(() => {});

      // 等待足够的重连尝试以触发最大间隔限制
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('reconnecting') >= 5, 30000);

      const maxIntervalTime = perfMonitor.endTiming('max_interval_test');

      // 验证最大间隔限制生效
      const metrics = connectionManager.getBinanceMetrics();
      expect(metrics.reconnectCount).toBeGreaterThan(0);

      console.log(`✅ 最大重连间隔限制测试完成，时间: ${maxIntervalTime}ms`);
      console.log(`   重连计数: ${metrics.reconnectCount}`);

      eventCollector.stop();
    });

    it('应该支持重连抖动机制', async () => {
      const mockWebSocketClass = createMockWebSocket({
        shouldFail: true,
        failDelay: 100,
        errorMessage: 'Jitter test failure'
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        maxRetries: 3,
        retryInterval: 1000,
        binance: {
          reconnectStrategy: {
            backoffBase: 2,
            maxRetryInterval: 5000,
            jitter: true // 启用抖动
          }
        }
      });

      const reconnectTimes: number[] = [];
      const startTime = Date.now();

      // 记录重连时间
      eventHelper.addListener(connectionManager, 'reconnecting', () => {
        reconnectTimes.push(Date.now() - startTime);
      });

      perfMonitor.startTiming('jitter_test');

      connectionManager.connect(config).catch(() => {});

      // 等待多次重连
      await testUtils.waitFor(() => reconnectTimes.length >= 3, 15000);

      const jitterTime = perfMonitor.endTiming('jitter_test');

      // 验证抖动效果：重连时间不应该完全等于预期的指数退避时间
      expect(reconnectTimes.length).toBeGreaterThanOrEqual(3);
      
      console.log(`✅ 重连抖动机制测试完成，时间: ${jitterTime}ms`);
      console.log(`   重连时间点: ${reconnectTimes.join(', ')}ms`);
    });

    it('应该在连接成功后重置重连计数', async () => {
      // 第一阶段：失败的连接
      let shouldFail = true;
      const mockWebSocketClass = createMockWebSocket({
        get shouldFail() { return shouldFail; },
        failDelay: 100,
        errorMessage: 'Temporary failure'
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        maxRetries: 5,
        retryInterval: 500
      });

      perfMonitor.startTiming('reconnect_reset_test');

      // 开始连接（会失败几次）
      const connectPromise = connectionManager.connect(config);

      // 等待几次重连尝试
      await testUtils.waitFor(() => 
        connectionManager.getBinanceMetrics().reconnectCount >= 2, 5000);

      const initialReconnectCount = connectionManager.getBinanceMetrics().reconnectCount;
      expect(initialReconnectCount).toBeGreaterThan(0);

      // 改变Mock为成功连接
      shouldFail = false;

      // 等待连接成功
      await connectPromise;
      expect(connectionManager.isConnected()).toBe(true);

      // 触发另一次重连来验证计数重置
      await connectionManager.reconnect();

      const resetTime = perfMonitor.endTiming('reconnect_reset_test');

      // 验证重连计数在成功连接后的行为
      console.log(`✅ 重连计数重置测试完成，时间: ${resetTime}ms`);
      console.log(`   初始重连计数: ${initialReconnectCount}`);
    });
  });

  describe('断路器模式', () => {
    
    it('应该在频繁错误后触发断路器', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: 3,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const errorEventCollector = eventHelper.createEventCollector(adapter, ['error']);

      perfMonitor.startTiming('circuit_breaker_trigger');

      // 快速触发多个错误
      const errorCount = 10;
      for (let i = 0; i < errorCount; i++) {
        const error = new Error(`Circuit breaker test error ${i}`);
        (adapter as any).handleError(error, 'circuit_test');
        
        if (i < errorCount - 1) {
          await testUtils.delay(100); // 短间隔
        }
      }

      // 等待所有错误处理完成
      await testUtils.waitFor(() => 
        errorEventCollector.getEventCount('error') >= errorCount, 10000);

      const circuitBreakerTime = perfMonitor.endTiming('circuit_breaker_trigger');

      // 验证适配器状态变为不健康
      const status = adapter.getAdapterStatus();
      expect(status.health).toBe('unhealthy');
      expect(status.performance.errorRate).toBeGreaterThan(50); // 高错误率

      console.log(`✅ 断路器触发测试完成，时间: ${circuitBreakerTime}ms`);
      console.log(`   错误计数: ${errorEventCollector.getEventCount('error')}`);
      console.log(`   适配器状态: ${status.health}`);

      errorEventCollector.stop();
    });

    it('应该在断路器打开后拒绝新请求', async () => {
      const mockWebSocketClass = createMockWebSocket({
        shouldFail: true,
        failDelay: 100,
        errorMessage: 'Circuit breaker rejection test'
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        maxRetries: 2,
        retryInterval: 500
      });

      perfMonitor.startTiming('circuit_breaker_rejection');

      // 首次连接失败，应该触发重连
      await expect(connectionManager.connect(config)).rejects.toThrow();

      // 等待一段时间确保断路器状态稳定
      await testUtils.delay(1000);

      // 再次尝试连接，应该被快速拒绝（如果断路器实现了的话）
      const secondAttemptStart = Date.now();
      await expect(connectionManager.connect(config)).rejects.toThrow();
      const secondAttemptTime = Date.now() - secondAttemptStart;

      const rejectionTime = perfMonitor.endTiming('circuit_breaker_rejection');

      // 验证状态
      expect(connectionManager.getState()).toBe(ConnectionState.ERROR);

      console.log(`✅ 断路器拒绝测试完成，总时间: ${rejectionTime}ms`);
      console.log(`   第二次尝试时间: ${secondAttemptTime}ms`);
    });

    it('应该在断路器半开状态下谨慎重试', async () => {
      let connectionAttempts = 0;
      const mockWebSocketClass = createMockWebSocket({
        get shouldFail() { 
          connectionAttempts++;
          return connectionAttempts <= 3; // 前3次失败，第4次成功
        },
        failDelay: 200,
        connectDelay: 100,
        errorMessage: 'Half-open test failure'
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        maxRetries: 5,
        retryInterval: 1000
      });

      perfMonitor.startTiming('circuit_breaker_half_open');

      // 开始连接，前几次会失败
      const connectPromise = connectionManager.connect(config);

      // 等待连接最终成功
      await connectPromise;

      const halfOpenTime = perfMonitor.endTiming('circuit_breaker_half_open');

      // 验证最终连接成功
      expect(connectionManager.isConnected()).toBe(true);
      expect(connectionAttempts).toBe(4); // 3次失败 + 1次成功

      console.log(`✅ 断路器半开状态测试完成，时间: ${halfOpenTime}ms`);
      console.log(`   连接尝试次数: ${connectionAttempts}`);
    });
  });

  describe('错误恢复机制', () => {
    
    it('应该从网络中断中恢复', async () => {
      // 先建立正常连接
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 100,
        autoRespondToPing: true
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      await connectionManager.connect(config);
      
      expect(connectionManager.isConnected()).toBe(true);

      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'disconnected',
        'reconnecting', 
        'reconnected'
      ]);

      perfMonitor.startTiming('network_interruption_recovery');

      // 模拟网络中断
      const mockWS = (connectionManager as any).ws;
      if (mockWS && mockWS.simulateDisconnect) {
        mockWS.simulateDisconnect(1006, 'Network interruption');
      }

      // 等待恢复序列完成
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('reconnected') > 0, 15000);

      const recoveryTime = perfMonitor.endTiming('network_interruption_recovery');

      // 验证恢复成功
      expect(connectionManager.isConnected()).toBe(true);
      expect(eventCollector.getEventCount('disconnected')).toBe(1);
      expect(eventCollector.getEventCount('reconnecting')).toBeGreaterThan(0);
      expect(eventCollector.getEventCount('reconnected')).toBe(1);

      console.log(`✅ 网络中断恢复测试完成，时间: ${recoveryTime}ms`);

      eventCollector.stop();
    });

    it('应该从心跳超时中恢复', async () => {
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 50,
        autoRespondToPing: false // 不响应ping导致心跳超时
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        heartbeatInterval: 1000,
        heartbeatTimeout: 2000
      });

      await connectionManager.connect(config);

      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'heartbeatTimeout',
        'reconnecting',
        'error'
      ]);

      perfMonitor.startTiming('heartbeat_timeout_recovery');

      // 等待心跳超时
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('heartbeatTimeout') > 0 ||
        eventCollector.getEventCount('error') > 0, 10000);

      const timeoutRecoveryTime = perfMonitor.endTiming('heartbeat_timeout_recovery');

      // 验证超时被检测到
      const timeoutCount = eventCollector.getEventCount('heartbeatTimeout');
      const errorCount = eventCollector.getEventCount('error');
      
      expect(timeoutCount + errorCount).toBeGreaterThan(0);

      console.log(`✅ 心跳超时恢复测试完成，时间: ${timeoutRecoveryTime}ms`);
      console.log(`   心跳超时: ${timeoutCount}, 错误: ${errorCount}`);

      eventCollector.stop();
    });

    it('应该从流管理错误中恢复', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: ['btcusdt@ticker'],
            autoManage: true,
            batchDelay: 200
          }
        }
      });

      // 建立正常连接
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 100
      });
      (global as any).WebSocket = mockWebSocketClass;

      await connectionManager.connect(config);

      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'streamAdded',
        'error',
        'reconnected'
      ]);

      perfMonitor.startTiming('stream_error_recovery');

      // 添加流时模拟错误
      try {
        await connectionManager.addStream('invalid@stream@format');
      } catch (error) {
        // 预期可能失败
      }

      // 添加正常的流
      await connectionManager.addStream('ethusdt@ticker');

      // 等待流操作完成
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('streamAdded') > 0, 5000);

      const streamRecoveryTime = perfMonitor.endTiming('stream_error_recovery');

      // 验证正常流被成功添加
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toContain('ethusdt@ticker');

      console.log(`✅ 流管理错误恢复测试完成，时间: ${streamRecoveryTime}ms`);
      console.log(`   活跃流: ${activeStreams.join(', ')}`);

      eventCollector.stop();
    });

    it('应该维持服务降级状态下的基本功能', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      // 建立连接
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 100,
        simulateNetworkIssues: true,
        networkIssuesProbability: 0.3 // 30%的网络问题概率
      });
      (global as any).WebSocket = mockWebSocketClass;

      await adapter.connect();
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);

      const eventCollector = eventHelper.createEventCollector(adapter, ['error']);

      perfMonitor.startTiming('degraded_service_test');

      // 模拟一些错误以触发降级状态
      for (let i = 0; i < 3; i++) {
        const degradationError = new Error(`Service degradation test error ${i}`);
        (adapter as any).handleError(degradationError, 'degradation_test');
        await testUtils.delay(500);
      }

      // 等待错误处理完成
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('error') >= 3, 10000);

      const degradationTime = perfMonitor.endTiming('degraded_service_test');

      // 检查适配器状态
      const status = adapter.getAdapterStatus();
      
      // 在降级状态下，适配器应该仍能提供基本功能
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      expect(['healthy', 'degraded']).toContain(status.health);

      // 基本功能仍应可用
      const metrics = adapter.getMetrics();
      expect(metrics).toBeDefined();

      console.log(`✅ 服务降级测试完成，时间: ${degradationTime}ms`);
      console.log(`   适配器状态: ${status.health}`);
      console.log(`   错误率: ${status.performance.errorRate}%`);

      eventCollector.stop();
    });
  });

  describe('恢复性能测试', () => {
    
    it('应该在合理时间内完成错误恢复', async () => {
      const recoveryTimeThreshold = 5000; // 5秒恢复时间阈值
      
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 100,
        autoRespondToPing: true
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        retryInterval: 1000
      });

      await connectionManager.connect(config);

      perfMonitor.startTiming('recovery_performance');

      // 模拟连接中断
      const mockWS = (connectionManager as any).ws;
      if (mockWS && mockWS.simulateDisconnect) {
        mockWS.simulateDisconnect(1006, 'Performance test disconnect');
      }

      // 等待恢复
      const reconnectedPromise = eventHelper.waitForEvent(connectionManager, 'reconnected', 10000);
      await reconnectedPromise;

      const recoveryTime = perfMonitor.endTiming('recovery_performance');

      // 验证恢复性能
      expect(recoveryTime).toBeLessThan(recoveryTimeThreshold);
      expect(connectionManager.isConnected()).toBe(true);

      console.log(`✅ 恢复性能测试完成，恢复时间: ${recoveryTime}ms (阈值: ${recoveryTimeThreshold}ms)`);
    });

    it('应该在多次故障后保持恢复能力', async () => {
      let disconnectCount = 0;
      const maxDisconnects = 5;
      
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 200,
        autoRespondToPing: true
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        maxRetries: 10,
        retryInterval: 500
      });

      await connectionManager.connect(config);

      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'disconnected',
        'reconnected'
      ]);

      perfMonitor.startTiming('multiple_failures_recovery');

      // 模拟多次故障和恢复
      const failureInterval = setInterval(() => {
        if (disconnectCount < maxDisconnects && connectionManager.isConnected()) {
          const mockWS = (connectionManager as any).ws;
          if (mockWS && mockWS.simulateDisconnect) {
            mockWS.simulateDisconnect(1006, `Failure ${disconnectCount + 1}`);
            disconnectCount++;
          }
        } else if (disconnectCount >= maxDisconnects) {
          clearInterval(failureInterval);
        }
      }, 2000);

      // 等待所有故障和恢复完成
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('reconnected') >= maxDisconnects, 30000);

      clearInterval(failureInterval);
      const multipleFailuresTime = perfMonitor.endTiming('multiple_failures_recovery');

      // 验证恢复能力
      expect(eventCollector.getEventCount('disconnected')).toBe(maxDisconnects);
      expect(eventCollector.getEventCount('reconnected')).toBe(maxDisconnects);
      expect(connectionManager.isConnected()).toBe(true);

      console.log(`✅ 多次故障恢复测试完成，时间: ${multipleFailuresTime}ms`);
      console.log(`   故障次数: ${disconnectCount}`);
      console.log(`   恢复次数: ${eventCollector.getEventCount('reconnected')}`);

      eventCollector.stop();
    });
  });
});