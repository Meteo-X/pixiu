/**
 * 基础连接功能测试套件
 * 测试BaseConnectionManager和BinanceConnectionManager的基本连接功能
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '@pixiu/binance-adapter';
import { ConnectionState } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { MockWebSocket, createMockWebSocket } from '../../mocks/websocket-mock';
import { TestConfigGenerator, EventListenerHelper, PerformanceMonitor } from '../../helpers/test-helpers';

describe('BinanceConnectionManager - 基础连接功能', () => {
  let connectionManager: BinanceConnectionManager;
  let eventHelper: EventListenerHelper;
  let perfMonitor: PerformanceMonitor;
  let mockWebSocketClass: typeof MockWebSocket;
  let originalWebSocket: any;

  beforeAll(() => {
    // 备份原始WebSocket
    originalWebSocket = global.WebSocket;
    
    // 创建Mock WebSocket类
    mockWebSocketClass = createMockWebSocket({
      connectDelay: 100,
      autoRespondToPing: true,
      pingResponseDelay: 50
    });
    
    // 替换全局WebSocket
    (global as any).WebSocket = mockWebSocketClass;
  });

  afterAll(() => {
    // 恢复原始WebSocket
    (global as any).WebSocket = originalWebSocket;
    
    // 清理共享缓存
    if (globalCache && typeof globalCache.destroy === 'function') {
      globalCache.destroy();
    }
  });

  beforeEach(() => {
    connectionManager = new BinanceConnectionManager();
    eventHelper = new EventListenerHelper();
    perfMonitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    // 清理连接管理器
    if (connectionManager) {
      await connectionManager.destroy();
    }
    
    // 清理事件监听器
    eventHelper.cleanup();
    
    // 清理性能监控
    perfMonitor.clear();
  });

  describe('连接生命周期管理', () => {
    
    it('应该成功建立基础WebSocket连接', async () => {
      // 准备测试配置
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      
      // 监听连接事件
      const connectedPromise = eventHelper.waitForEvent(connectionManager, 'connected', 5000);
      
      // 开始性能计时
      perfMonitor.startTiming('connection_establishment');
      
      // 执行连接
      await connectionManager.connect(config);
      
      // 等待连接建立
      await connectedPromise;
      const connectionTime = perfMonitor.endTiming('connection_establishment');
      
      // 验证连接状态
      expect(connectionManager.getState()).toBe(ConnectionState.CONNECTED);
      expect(connectionManager.isConnected()).toBe(true);
      
      // 验证连接配置
      const actualConfig = connectionManager.getConfig();
      expect(actualConfig.url).toBe(config.url);
      expect(actualConfig.timeout).toBe(config.timeout);
      
      // 验证性能指标
      expect(connectionTime).toBeLessThan(1000); // 连接时间应小于1秒
      
      console.log(`✅ 连接建立时间: ${connectionTime}ms`);
    });

    it('应该正确处理连接超时', async () => {
      // 创建会超时的Mock WebSocket
      const timeoutMockClass = createMockWebSocket({
        connectDelay: 10000, // 10秒延迟，超过超时设置
        shouldFail: false
      });
      (global as any).WebSocket = timeoutMockClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        timeout: 2000 // 2秒超时
      });

      perfMonitor.startTiming('connection_timeout');

      // 连接应该超时
      await expect(connectionManager.connect(config)).rejects.toThrow(/timeout/i);
      
      const timeoutTime = perfMonitor.endTiming('connection_timeout');
      
      // 验证状态
      expect(connectionManager.getState()).toBe(ConnectionState.ERROR);
      expect(connectionManager.isConnected()).toBe(false);
      
      // 验证超时时间合理
      expect(timeoutTime).toBeGreaterThan(1900); // 接近2秒
      expect(timeoutTime).toBeLessThan(3000); // 但不会太长
      
      console.log(`✅ 连接超时处理时间: ${timeoutTime}ms`);
    });

    it('应该正确处理连接失败', async () => {
      // 创建会失败的Mock WebSocket
      const failMockClass = createMockWebSocket({
        shouldFail: true,
        failDelay: 200,
        errorMessage: 'Mock connection failure'
      });
      (global as any).WebSocket = failMockClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig();

      // 监听错误事件
      const errorPromise = eventHelper.waitForEvent(connectionManager, 'error', 5000);

      // 连接应该失败
      await expect(connectionManager.connect(config)).rejects.toThrow('Mock connection failure');
      
      // 等待错误事件
      const errorEvent = await errorPromise;
      expect(errorEvent).toBeDefined();
      
      // 验证状态
      expect(connectionManager.getState()).toBe(ConnectionState.ERROR);
      expect(connectionManager.isConnected()).toBe(false);
      
      // 验证指标
      const metrics = connectionManager.getMetrics();
      expect(metrics.errorCount).toBeGreaterThan(0);
      
      console.log('✅ 连接失败正确处理');
    });

    it('应该正确断开连接', async () => {
      // 先建立连接
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      await connectionManager.connect(config);
      
      expect(connectionManager.isConnected()).toBe(true);
      
      // 监听断开事件
      const disconnectedPromise = eventHelper.waitForEvent(connectionManager, 'disconnected', 5000);
      
      perfMonitor.startTiming('disconnection');
      
      // 执行断开
      await connectionManager.disconnect();
      
      // 等待断开事件
      await disconnectedPromise;
      const disconnectionTime = perfMonitor.endTiming('disconnection');
      
      // 验证状态
      expect(connectionManager.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(connectionManager.isConnected()).toBe(false);
      
      // 验证断开时间
      expect(disconnectionTime).toBeLessThan(500); // 断开应该很快
      
      console.log(`✅ 连接断开时间: ${disconnectionTime}ms`);
    });

    it('应该支持重复连接调用', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      
      // 第一次连接
      await connectionManager.connect(config);
      expect(connectionManager.isConnected()).toBe(true);
      
      // 第二次连接调用应该没有问题
      await connectionManager.connect(config);
      expect(connectionManager.isConnected()).toBe(true);
      
      // 状态应该保持连接
      expect(connectionManager.getState()).toBe(ConnectionState.CONNECTED);
      
      console.log('✅ 重复连接调用正确处理');
    });

    it('应该支持重复断开调用', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      await connectionManager.connect(config);
      
      // 第一次断开
      await connectionManager.disconnect();
      expect(connectionManager.isConnected()).toBe(false);
      
      // 第二次断开调用应该没有问题
      await connectionManager.disconnect();
      expect(connectionManager.isConnected()).toBe(false);
      
      // 状态应该保持断开
      expect(connectionManager.getState()).toBe(ConnectionState.DISCONNECTED);
      
      console.log('✅ 重复断开调用正确处理');
    });
  });

  describe('心跳和延迟测试', () => {
    
    it('应该正确发送心跳和接收pong', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        heartbeatInterval: 1000, // 1秒心跳
        heartbeatTimeout: 500
      });
      
      await connectionManager.connect(config);
      
      // 监听心跳事件
      const heartbeatPromise = eventHelper.waitForEvent(connectionManager, 'heartbeat', 10000);
      
      perfMonitor.startTiming('heartbeat_latency');
      
      // 手动发送心跳
      const latency = await connectionManager.ping();
      perfMonitor.recordValue('heartbeat_latency', latency);
      
      // 等待心跳事件
      const heartbeatEvent = await heartbeatPromise;
      expect(heartbeatEvent).toBeDefined();
      
      // 验证延迟合理
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(1000); // 延迟应该小于1秒
      
      // 验证指标更新
      const metrics = connectionManager.getMetrics();
      expect(metrics.averageRTT).toBeGreaterThan(0);
      
      console.log(`✅ 心跳延迟: ${latency}ms`);
    });

    it('应该正确处理心跳超时', async () => {
      // 创建不响应pong的Mock WebSocket
      const noPongMockClass = createMockWebSocket({
        autoRespondToPing: false // 不响应ping
      });
      (global as any).WebSocket = noPongMockClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        heartbeatTimeout: 1000 // 1秒心跳超时
      });
      
      await connectionManager.connect(config);
      
      // 监听心跳超时事件
      const timeoutPromise = eventHelper.waitForEvent(connectionManager, 'heartbeatTimeout', 5000);
      
      // 发送心跳（应该超时）
      await expect(connectionManager.ping()).rejects.toThrow(/timeout/i);
      
      // 等待超时事件
      const timeoutEvent = await timeoutPromise;
      expect(timeoutEvent).toBeDefined();
      
      console.log('✅ 心跳超时正确处理');
    });

    it('应该支持动态调整心跳间隔', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        heartbeatInterval: 5000 // 5秒
      });
      
      await connectionManager.connect(config);
      
      // 获取原始配置
      const originalConfig = connectionManager.getConfig();
      expect(originalConfig.heartbeatInterval).toBe(5000);
      
      // 调整心跳间隔
      connectionManager.setHeartbeatInterval(2000); // 改为2秒
      
      // 验证配置更新
      const updatedConfig = connectionManager.getConfig();
      expect(updatedConfig.heartbeatInterval).toBe(2000);
      
      console.log('✅ 动态心跳间隔调整成功');
    });
  });

  describe('配置验证和错误处理', () => {
    
    it('应该验证必需的配置参数', async () => {
      // 测试缺少URL的配置
      const invalidConfig = {
        ...TestConfigGenerator.generateBinanceConnectionConfig(),
        url: '' // 空URL
      };
      
      await expect(connectionManager.connect(invalidConfig)).rejects.toThrow();
      
      console.log('✅ 配置验证正确工作');
    });

    it('应该正确处理无效的URL', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        url: 'invalid-url'
      });
      
      await expect(connectionManager.connect(config)).rejects.toThrow();
      expect(connectionManager.getState()).toBe(ConnectionState.ERROR);
      
      console.log('✅ 无效URL处理正确');
    });

    it('应该支持自定义头部和代理配置', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        headers: {
          'Custom-Header': 'test-value',
          'User-Agent': 'Custom-User-Agent'
        },
        proxy: {
          host: 'proxy.example.com',
          port: 8080,
          username: 'proxyuser',
          password: 'proxypass'
        }
      });
      
      await connectionManager.connect(config);
      
      // 验证连接成功（Mock不会实际使用代理）
      expect(connectionManager.isConnected()).toBe(true);
      
      // 验证配置保存
      const savedConfig = connectionManager.getConfig();
      expect(savedConfig.headers?.['Custom-Header']).toBe('test-value');
      expect(savedConfig.proxy?.host).toBe('proxy.example.com');
      
      console.log('✅ 自定义头部和代理配置支持正常');
    });
  });

  describe('连接指标和统计', () => {
    
    it('应该正确收集连接指标', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      
      // 连接前获取指标
      const beforeMetrics = connectionManager.getMetrics();
      expect(beforeMetrics.state).toBe(ConnectionState.IDLE);
      expect(beforeMetrics.connectedAt).toBeUndefined();
      
      // 建立连接
      await connectionManager.connect(config);
      
      // 连接后获取指标
      const afterMetrics = connectionManager.getMetrics();
      expect(afterMetrics.state).toBe(ConnectionState.CONNECTED);
      expect(afterMetrics.connectedAt).toBeGreaterThan(0);
      expect(afterMetrics.lastActivity).toBeGreaterThan(0);
      
      // 发送一些数据以测试统计
      await connectionManager.send({ test: 'message' });
      
      // 验证统计更新
      const finalMetrics = connectionManager.getMetrics();
      expect(finalMetrics.messagesSent).toBeGreaterThan(0);
      expect(finalMetrics.bytesSent).toBeGreaterThan(0);
      
      console.log('✅ 连接指标收集正确');
      console.log(`   - 消息发送: ${finalMetrics.messagesSent}`);
      console.log(`   - 字节发送: ${finalMetrics.bytesSent}`);
    });

    it('应该正确计算平均往返时间', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      await connectionManager.connect(config);
      
      // 发送多个ping以计算平均RTT
      const latencies: number[] = [];
      for (let i = 0; i < 5; i++) {
        const latency = await connectionManager.ping();
        latencies.push(latency);
        await testUtils.delay(100); // 间隔100ms
      }
      
      // 获取指标中的平均RTT
      const metrics = connectionManager.getMetrics();
      expect(metrics.averageRTT).toBeGreaterThan(0);
      
      // 验证平均值合理
      const calculatedAverage = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      expect(Math.abs(metrics.averageRTT - calculatedAverage)).toBeLessThan(10); // 误差在10ms内
      
      console.log(`✅ 平均RTT计算正确: ${metrics.averageRTT}ms`);
    });

    it('应该正确更新最后活动时间', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      await connectionManager.connect(config);
      
      const initialMetrics = connectionManager.getMetrics();
      const initialActivity = initialMetrics.lastActivity;
      
      // 等待一段时间
      await testUtils.delay(500);
      
      // 发送消息更新活动时间
      await connectionManager.send({ update: 'activity' });
      
      const updatedMetrics = connectionManager.getMetrics();
      expect(updatedMetrics.lastActivity).toBeGreaterThan(initialActivity);
      
      console.log('✅ 活动时间更新正确');
    });
  });

  describe('并发连接测试', () => {
    
    it('应该支持多个连接管理器实例', async () => {
      const config1 = TestConfigGenerator.generateBinanceConnectionConfig({
        url: 'wss://stream1.binance.com:9443/ws'
      });
      const config2 = TestConfigGenerator.generateBinanceConnectionConfig({
        url: 'wss://stream2.binance.com:9443/ws'
      });
      
      const manager1 = new BinanceConnectionManager();
      const manager2 = new BinanceConnectionManager();
      
      try {
        // 并行连接
        await Promise.all([
          manager1.connect(config1),
          manager2.connect(config2)
        ]);
        
        // 验证两个连接都成功
        expect(manager1.isConnected()).toBe(true);
        expect(manager2.isConnected()).toBe(true);
        
        // 验证连接配置不同
        expect(manager1.getConfig().url).toBe(config1.url);
        expect(manager2.getConfig().url).toBe(config2.url);
        
        console.log('✅ 多实例并发连接支持正常');
        
      } finally {
        // 清理连接
        await Promise.all([
          manager1.destroy(),
          manager2.destroy()
        ]);
      }
    });

    it('应该正确处理连接状态竞争条件', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      
      // 快速连续调用连接和断开
      const operations = [
        connectionManager.connect(config),
        connectionManager.disconnect(),
        connectionManager.connect(config)
      ];
      
      // 等待所有操作完成
      await Promise.allSettled(operations);
      
      // 最终状态应该是连接的（因为最后一个操作是connect）
      // 但也可能因为竞争条件而处于其他状态
      const finalState = connectionManager.getState();
      expect([
        ConnectionState.CONNECTED,
        ConnectionState.DISCONNECTED,
        ConnectionState.CONNECTING
      ]).toContain(finalState);
      
      console.log(`✅ 竞争条件处理，最终状态: ${finalState}`);
    });
  });
});