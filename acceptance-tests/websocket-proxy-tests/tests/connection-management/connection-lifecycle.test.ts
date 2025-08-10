/**
 * 连接生命周期测试
 * 测试WebSocket连接的完整生命周期管理
 */

import { TestServerFactory, TestServerInstance } from '../../mocks/test-server-setup';
import { WebSocketClient, WebSocketClientPool } from '../../helpers/websocket-client-simulator';
import { PerformanceMonitor } from '../../helpers/performance-monitor';
import { TEST_CONFIG } from '../../setup';

describe('WebSocket代理 - 连接生命周期管理', () => {
  let testServer: TestServerInstance;
  let perfMonitor: PerformanceMonitor;

  beforeAll(async () => {
    testServer = await TestServerFactory.createTestServer('connection-lifecycle', {
      websocketConfig: {
        heartbeatInterval: 2000,
        connectionTimeout: 10000,
        maxConnections: 200
      }
    });
    perfMonitor = new PerformanceMonitor({
      maxMemoryUsage: 512,
      maxLatency: 50
    });
  });

  afterAll(async () => {
    if (perfMonitor) {
      perfMonitor.stopMonitoring();
    }
    await TestServerFactory.closeTestServer('connection-lifecycle');
  });

  beforeEach(() => {
    perfMonitor.reset();
    perfMonitor.startMonitoring(500);
  });

  afterEach(() => {
    perfMonitor.stopMonitoring();
  });

  describe('连接状态管理', () => {
    it('应该正确跟踪连接状态变化', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      const stateChanges: string[] = [];
      
      // 监听状态变化
      client.on('connected', () => stateChanges.push('connected'));
      client.on('close', () => stateChanges.push('closed'));
      client.on('error', () => stateChanges.push('error'));

      // 连接
      expect(client.getMetrics().status).toBe('disconnected');
      
      await client.connect();
      expect(client.getMetrics().status).toBe('connected');
      expect(client.isConnected()).toBe(true);

      // 断开
      await client.disconnect();
      expect(client.getMetrics().status).toBe('disconnected');
      expect(client.isConnected()).toBe(false);

      expect(stateChanges).toEqual(['connected', 'closed']);
    });

    it('应该维护准确的连接时间戳', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      const beforeConnect = Date.now();
      await client.connect();
      const afterConnect = Date.now();

      const metrics = client.getMetrics();
      expect(metrics.connectedAt).toBeGreaterThanOrEqual(beforeConnect);
      expect(metrics.connectedAt).toBeLessThanOrEqual(afterConnect);
      expect(metrics.lastActivity).toBeGreaterThanOrEqual(metrics.connectedAt);

      await client.disconnect();
    });

    it('应该正确计算连接持续时间', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      await client.connect();
      const connectTime = client.getMetrics().connectedAt;

      // 等待一段时间
      await new Promise(resolve => setTimeout(resolve, 1000));

      await client.disconnect();
      
      const duration = Date.now() - connectTime;
      expect(duration).toBeGreaterThan(900); // 至少900ms
      expect(duration).toBeLessThan(2000); // 不超过2秒
    });

    it('应该在服务器端正确维护连接统计', async () => {
      const initialStats = testServer.proxy.getConnectionStats();
      const clients: WebSocketClient[] = [];

      // 创建多个连接
      for (let i = 0; i < 5; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });
        await client.connect();
        clients.push(client);
        
        const currentStats = testServer.proxy.getConnectionStats();
        expect(currentStats.activeConnections).toBe(initialStats.activeConnections + i + 1);
        expect(currentStats.totalConnections).toBe(initialStats.totalConnections + i + 1);
      }

      // 逐个断开连接
      for (let i = 0; i < 5; i++) {
        await clients[i].disconnect();
        
        // 等待服务器处理断开事件
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const currentStats = testServer.proxy.getConnectionStats();
        expect(currentStats.activeConnections).toBe(5 - i - 1);
      }
    });
  });

  describe('连接活动监控', () => {
    let client: WebSocketClient;

    beforeEach(async () => {
      client = new WebSocketClient({
        url: testServer.wsUrl,
        pingInterval: 500
      });
      await client.connect();
    });

    afterEach(async () => {
      if (client.isConnected()) {
        await client.disconnect();
      }
    });

    it('应该更新最后活动时间', async () => {
      const initialActivity = client.getMetrics().lastActivity;

      // 发送消息更新活动时间
      await client.sendMessage({ type: 'test' });

      const updatedActivity = client.getMetrics().lastActivity;
      expect(updatedActivity).toBeGreaterThan(initialActivity);
    });

    it('应该通过心跳保持连接活跃', (done) => {
      const initialActivity = client.getMetrics().lastActivity;
      let heartbeatReceived = false;

      client.on('pong', () => {
        heartbeatReceived = true;
        const currentActivity = client.getMetrics().lastActivity;
        expect(currentActivity).toBeGreaterThan(initialActivity);
        done();
      });

      // 自动心跳应该在500ms内触发
      setTimeout(() => {
        if (!heartbeatReceived) {
          done(new Error('Heartbeat not received within expected time'));
        }
      }, 1000);
    });

    it('应该检测到空闲连接', async () => {
      const initialActivity = client.getMetrics().lastActivity;

      // 等待足够长时间确保没有活动
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 此时心跳应该已经更新了活动时间
      const currentActivity = client.getMetrics().lastActivity;
      expect(currentActivity).toBeGreaterThan(initialActivity);
    });
  });

  describe('重连机制测试', () => {
    it('应该支持自动重连', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl,
        reconnect: true,
        reconnectInterval: 500,
        maxReconnectAttempts: 3
      });

      await client.connect();
      expect(client.isConnected()).toBe(true);

      // 模拟连接断开
      const reconnectPromise = new Promise<void>((resolve, reject) => {
        client.on('reconnected', () => resolve());
        client.on('reconnectFailed', reject);
        
        setTimeout(() => reject(new Error('Reconnect timeout')), 5000);
      });

      // 强制断开连接触发重连
      (client as any).ws.terminate();

      await reconnectPromise;
      expect(client.isConnected()).toBe(true);
      expect(client.getMetrics().reconnectAttempts).toBeGreaterThan(0);

      await client.disconnect();
    });

    it('应该在超过最大重连次数后停止重连', async () => {
      const client = new WebSocketClient({
        url: 'ws://localhost:65535/ws', // 无效端口
        reconnect: true,
        reconnectInterval: 100,
        maxReconnectAttempts: 2,
        connectionTimeout: 500
      });

      const failedPromise = new Promise<void>((resolve) => {
        client.on('reconnectFailed', () => resolve());
      });

      try {
        await client.connect();
      } catch (error) {
        // 预期的连接失败
      }

      await failedPromise;
      
      const metrics = client.getMetrics();
      expect(metrics.reconnectAttempts).toBeGreaterThanOrEqual(2);
      expect(client.isConnected()).toBe(false);
    });

    it('应该在重连期间缓存消息', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl,
        reconnect: true,
        reconnectInterval: 200,
        maxReconnectAttempts: 3
      });

      await client.connect();
      
      // 断开连接
      (client as any).ws.terminate();

      // 在重连期间尝试发送消息（应该被缓存）
      const messagePromise = client.sendMessage({ type: 'test', data: 'cached' });

      // 等待重连
      await new Promise<void>((resolve) => {
        client.on('reconnected', resolve);
      });

      // 消息应该在重连后发送
      await expect(messagePromise).resolves.toBeGreaterThan(0);
      
      await client.disconnect();
    });
  });

  describe('并发连接生命周期测试', () => {
    it('应该正确管理多个连接的生命周期', async () => {
      const clientPool = new WebSocketClientPool({
        url: testServer.wsUrl,
        reconnect: false
      });

      // 创建10个并发连接
      const clientIds = await clientPool.createClients(10);
      expect(clientIds.length).toBe(10);

      const poolStats = clientPool.getPoolStats();
      expect(poolStats.connectedClients).toBe(10);
      expect(poolStats.totalClients).toBe(10);

      // 验证每个客户端都已连接
      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        expect(client?.isConnected()).toBe(true);
      }

      // 关闭所有连接
      await clientPool.closeAllClients();

      const finalPoolStats = clientPool.getPoolStats();
      expect(finalPoolStats.connectedClients).toBe(0);
      expect(finalPoolStats.totalClients).toBe(0);
    });

    it('应该处理连接的交错生命周期', async () => {
      const clients: WebSocketClient[] = [];
      const connectionTimes: number[] = [];

      // 创建连接，每个间隔100ms
      for (let i = 0; i < 5; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });
        
        const startTime = Date.now();
        await client.connect();
        const endTime = Date.now();
        
        connectionTimes.push(endTime - startTime);
        clients.push(client);
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 验证所有连接都处于活跃状态
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(5);

      // 随机顺序断开连接
      const disconnectOrder = [2, 0, 4, 1, 3];
      for (const index of disconnectOrder) {
        await clients[index].disconnect();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 验证所有连接都已断开
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(0);

      // 验证连接时间都在合理范围内
      for (const time of connectionTimes) {
        expect(time).toBeLessThan(1000);
      }
    });
  });

  describe('资源清理验证', () => {
    it('应该在连接关闭后清理所有资源', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const clients: WebSocketClient[] = [];

      // 创建大量连接
      for (let i = 0; i < 50; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });
        await client.connect();
        
        // 发送一些消息产生活动
        await client.sendMessage({ type: 'test', data: `message_${i}` });
        
        clients.push(client);
      }

      const peakMemory = process.memoryUsage().heapUsed;
      
      // 关闭所有连接
      const disconnectPromises = clients.map(client => client.disconnect());
      await Promise.all(disconnectPromises);

      // 等待资源清理
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 强制垃圾收集
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryReduction = peakMemory - finalMemory;
      
      // 应该有显著的内存释放
      expect(memoryReduction).toBeGreaterThan(0);
      expect(finalMemory).toBeLessThan(peakMemory * 1.1); // 不超过峰值的110%
    });

    it('应该清理服务器端的连接引用', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      await client.connect();
      const connectionId = client.getMetrics().id;
      
      // 验证服务器端有连接记录
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(1);

      await client.disconnect();
      
      // 等待服务器处理
      await new Promise(resolve => setTimeout(resolve, 200));

      // 验证服务器端连接已清理
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(0);
    });
  });

  describe('连接统计和指标', () => {
    it('应该维护准确的连接统计信息', async () => {
      const initialStats = testServer.proxy.getConnectionStats();
      const clients: WebSocketClient[] = [];

      // 创建连接并发送消息
      for (let i = 0; i < 3; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });
        await client.connect();
        
        // 发送不同数量的消息
        for (let j = 0; j <= i; j++) {
          await client.sendMessage({ type: 'test', data: `msg_${j}` });
        }
        
        clients.push(client);
      }

      const midStats = testServer.proxy.getConnectionStats();
      expect(midStats.activeConnections).toBe(3);
      expect(midStats.totalConnections).toBe(initialStats.totalConnections + 3);

      // 断开连接
      const disconnectPromises = clients.map(client => client.disconnect());
      await Promise.all(disconnectPromises);

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalStats = testServer.proxy.getConnectionStats();
      expect(finalStats.activeConnections).toBe(0);
    });

    it('应该计算平均连接持续时间', async () => {
      const connectionDurations: number[] = [];
      const clients: WebSocketClient[] = [];

      for (let i = 0; i < 5; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });
        
        const startTime = Date.now();
        await client.connect();
        
        // 每个连接持续不同时间
        await new Promise(resolve => setTimeout(resolve, (i + 1) * 200));
        
        await client.disconnect();
        const duration = Date.now() - startTime;
        connectionDurations.push(duration);
        
        clients.push(client);
      }

      // 验证持续时间递增
      for (let i = 1; i < connectionDurations.length; i++) {
        expect(connectionDurations[i]).toBeGreaterThan(connectionDurations[i - 1]);
      }

      const averageDuration = connectionDurations.reduce((a, b) => a + b, 0) / connectionDurations.length;
      expect(averageDuration).toBeGreaterThan(0);
    });
  });

  describe('性能指标验证', () => {
    it('连接生命周期性能应该在可接受范围内', async () => {
      const metrics = {
        connectionLatencies: [] as number[],
        disconnectionLatencies: [] as number[],
        memoryUsages: [] as number[]
      };

      for (let i = 0; i < 20; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });

        // 测量连接延迟
        const connectStart = Date.now();
        await client.connect();
        const connectLatency = Date.now() - connectStart;
        metrics.connectionLatencies.push(connectLatency);

        // 记录内存使用
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        metrics.memoryUsages.push(memoryUsage);

        // 测量断开延迟
        const disconnectStart = Date.now();
        await client.disconnect();
        const disconnectLatency = Date.now() - disconnectStart;
        metrics.disconnectionLatencies.push(disconnectLatency);
      }

      // 验证性能指标
      const avgConnectLatency = metrics.connectionLatencies.reduce((a, b) => a + b, 0) / metrics.connectionLatencies.length;
      const avgDisconnectLatency = metrics.disconnectionLatencies.reduce((a, b) => a + b, 0) / metrics.disconnectionLatencies.length;
      const maxMemoryUsage = Math.max(...metrics.memoryUsages);

      expect(avgConnectLatency).toBeLessThan(100); // 平均连接延迟 < 100ms
      expect(avgDisconnectLatency).toBeLessThan(50); // 平均断开延迟 < 50ms
      expect(maxMemoryUsage).toBeLessThan(512); // 内存使用 < 512MB

      // 记录性能数据
      global.collectTestMetric('connection-lifecycle-performance', {
        avgConnectLatency,
        avgDisconnectLatency,
        maxMemoryUsage,
        performanceSummary: perfMonitor.getPerformanceSummary()
      });
    });
  });
});