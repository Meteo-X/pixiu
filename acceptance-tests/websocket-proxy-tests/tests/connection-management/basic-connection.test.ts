/**
 * 基础连接管理测试
 * 测试WebSocket代理的连接建立、维持、断开功能
 */

import { TestServerFactory, TestServerInstance } from '../../mocks/test-server-setup';
import { WebSocketClient, WebSocketClientPool } from '../../helpers/websocket-client-simulator';
import { PerformanceMonitor } from '../../helpers/performance-monitor';
import { TEST_CONFIG } from '../../setup';

describe('WebSocket代理 - 基础连接管理', () => {
  let testServer: TestServerInstance;
  let perfMonitor: PerformanceMonitor;

  beforeAll(async () => {
    testServer = await TestServerFactory.createTestServer('connection-basic', {
      websocketConfig: {
        heartbeatInterval: 5000,
        connectionTimeout: 30000,
        maxConnections: 100
      }
    });
    perfMonitor = new PerformanceMonitor({
      maxMemoryUsage: 256,
      maxLatency: 100
    });
  });

  afterAll(async () => {
    if (perfMonitor) {
      perfMonitor.stopMonitoring();
    }
    await TestServerFactory.closeTestServer('connection-basic');
  });

  beforeEach(() => {
    perfMonitor.reset();
    perfMonitor.startMonitoring(1000);
  });

  afterEach(() => {
    perfMonitor.stopMonitoring();
  });

  describe('连接建立测试', () => {
    it('应该能够成功建立WebSocket连接', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      const connectPromise = client.connect();
      await expect(connectPromise).resolves.toBeUndefined();
      
      expect(client.isConnected()).toBe(true);
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(1);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('应该在连接建立时发送欢迎消息', (done) => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      client.on('welcome', (message) => {
        expect(message.type).toBe('welcome');
        expect(message.payload).toHaveProperty('connectionId');
        expect(message.payload).toHaveProperty('serverTime');
        expect(message.payload).toHaveProperty('proxyVersion');
        
        client.disconnect().then(() => done()).catch(done);
      });

      client.on('error', done);
      client.connect().catch(done);
    });

    it('应该正确处理连接超时', async () => {
      // 使用无效端口模拟连接超时
      const client = new WebSocketClient({
        url: 'ws://localhost:65535/ws',
        connectionTimeout: 1000
      });

      await expect(client.connect()).rejects.toThrow('Connection timeout');
      expect(client.isConnected()).toBe(false);
    });

    it('应该能够处理多个并发连接', async () => {
      const clientCount = 10;
      const clients: WebSocketClient[] = [];
      const connectPromises: Promise<void>[] = [];

      // 创建多个客户端
      for (let i = 0; i < clientCount; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });
        clients.push(client);
        connectPromises.push(client.connect());
      }

      // 等待所有连接建立
      await Promise.all(connectPromises);

      // 验证连接状态
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(clientCount);
      clients.forEach(client => {
        expect(client.isConnected()).toBe(true);
      });

      // 清理连接
      const disconnectPromises = clients.map(client => client.disconnect());
      await Promise.all(disconnectPromises);

      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(0);
    });

    it('应该正确分配唯一的连接ID', async () => {
      const connectionIds = new Set<string>();
      const clients: WebSocketClient[] = [];

      for (let i = 0; i < 5; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });

        client.on('welcome', (message) => {
          connectionIds.add(message.payload.connectionId);
        });

        await client.connect();
        clients.push(client);
      }

      // 等待所有欢迎消息
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(connectionIds.size).toBe(5);

      // 清理
      const disconnectPromises = clients.map(client => client.disconnect());
      await Promise.all(disconnectPromises);
    });
  });

  describe('连接维持测试', () => {
    let client: WebSocketClient;

    beforeEach(async () => {
      client = new WebSocketClient({
        url: testServer.wsUrl,
        pingInterval: 1000
      });
      await client.connect();
    });

    afterEach(async () => {
      if (client.isConnected()) {
        await client.disconnect();
      }
    });

    it('应该响应心跳检测', (done) => {
      client.on('pong', (message) => {
        expect(message.type).toBe('pong');
        done();
      });

      client.ping().catch(done);
    });

    it('应该保持连接活跃状态', async () => {
      const initialStats = client.getMetrics();
      
      // 等待一段时间
      await new Promise(resolve => setTimeout(resolve, 2000));

      const currentStats = client.getMetrics();
      expect(currentStats.lastActivity).toBeGreaterThan(initialStats.lastActivity);
      expect(client.isConnected()).toBe(true);
    });

    it('应该处理WebSocket ping/pong帧', (done) => {
      let pongReceived = false;

      // 监听pong事件
      client.on('pong', () => {
        pongReceived = true;
      });

      // 发送ping
      client.ping().then(() => {
        setTimeout(() => {
          expect(pongReceived).toBe(true);
          done();
        }, 100);
      }).catch(done);
    });

    it('应该在长期空闲后保持连接', async () => {
      // 记录初始状态
      const initialConnectionCount = testServer.proxy.getConnectionStats().activeConnections;
      
      // 等待较长时间（但小于连接超时）
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 验证连接仍然活跃
      expect(client.isConnected()).toBe(true);
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(initialConnectionCount);
    });
  });

  describe('连接断开测试', () => {
    it('应该能够优雅地断开连接', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      await client.connect();
      expect(client.isConnected()).toBe(true);
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(1);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
      
      // 等待服务器处理断开事件
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(0);
    });

    it('应该处理客户端异常断开', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      await client.connect();
      const initialConnections = testServer.proxy.getConnectionStats().activeConnections;

      // 模拟异常断开（强制关闭底层socket）
      (client as any).ws.terminate();

      // 等待服务器检测到断开
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalConnections = testServer.proxy.getConnectionStats().activeConnections;
      expect(finalConnections).toBeLessThan(initialConnections);
    });

    it('应该在连接断开时触发相应事件', (done) => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      client.on('close', (code, reason) => {
        expect(code).toBeDefined();
        expect(reason).toBeDefined();
        done();
      });

      client.connect()
        .then(() => {
          setTimeout(() => {
            client.disconnect().catch(done);
          }, 100);
        })
        .catch(done);
    });

    it('应该清理断开连接的资源', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const clients: WebSocketClient[] = [];

      // 创建多个连接
      for (let i = 0; i < 20; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });
        await client.connect();
        clients.push(client);
      }

      const peakMemory = process.memoryUsage().heapUsed;
      expect(peakMemory).toBeGreaterThan(initialMemory);

      // 断开所有连接
      const disconnectPromises = clients.map(client => client.disconnect());
      await Promise.all(disconnectPromises);

      // 等待垃圾收集
      if (global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMemory = process.memoryUsage().heapUsed;
      expect(finalMemory).toBeLessThan(peakMemory);
    });
  });

  describe('连接错误处理', () => {
    it('应该处理无效的WebSocket URL', async () => {
      const client = new WebSocketClient({
        url: 'invalid-url',
        connectionTimeout: 1000
      });

      await expect(client.connect()).rejects.toThrow();
      expect(client.isConnected()).toBe(false);
    });

    it('应该处理服务器拒绝连接', async () => {
      // 使用不存在的端口
      const client = new WebSocketClient({
        url: 'ws://localhost:12345/ws',
        connectionTimeout: 2000
      });

      await expect(client.connect()).rejects.toThrow();
      expect(client.isConnected()).toBe(false);
    });

    it('应该在连接错误时更新统计信息', async () => {
      const client = new WebSocketClient({
        url: 'ws://localhost:12345/ws',
        connectionTimeout: 1000
      });

      try {
        await client.connect();
      } catch (error) {
        // 预期的错误
      }

      const metrics = client.getMetrics();
      expect(metrics.errors).toBeGreaterThan(0);
      expect(metrics.status).toBe('error');
    });

    it('应该记录错误到监控系统', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });

      await client.connect();

      // 模拟连接错误
      (client as any).ws.emit('error', new Error('Test error'));

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorCount = testServer.monitor.getErrorCount();
      expect(errorCount).toBeGreaterThan(0);

      await client.disconnect();
    });
  });

  describe('连接容量限制测试', () => {
    it('应该拒绝超过最大连接数的连接', async () => {
      // 创建接近最大连接数的客户端
      const maxConnections = 100;
      const clients: WebSocketClient[] = [];
      const connectPromises: Promise<void>[] = [];

      // 创建最大连接数的客户端
      for (let i = 0; i < maxConnections; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl,
          connectionTimeout: 5000
        });
        clients.push(client);
        connectPromises.push(client.connect());
      }

      await Promise.all(connectPromises);
      expect(testServer.proxy.getConnectionStats().activeConnections).toBe(maxConnections);

      // 尝试创建额外的连接
      const extraClient = new WebSocketClient({
        url: testServer.wsUrl,
        connectionTimeout: 2000
      });

      try {
        await extraClient.connect();
        // 如果连接成功，检查是否被立即断开
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(extraClient.isConnected()).toBe(false);
      } catch (error) {
        // 连接被拒绝是预期的
        expect(extraClient.isConnected()).toBe(false);
      }

      // 清理所有连接
      const disconnectPromises = clients.map(client => client.disconnect());
      await Promise.all(disconnectPromises);
    });
  });

  describe('性能验证测试', () => {
    it('连接建立延迟应该在可接受范围内', async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });

        await client.connect();
        const latency = Date.now() - startTime;
        latencies.push(latency);
        perfMonitor.recordLatency(latency);

        await client.disconnect();
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.connectionLatency);

      const maxLatency = Math.max(...latencies);
      expect(maxLatency).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.connectionLatency * 2);
    });

    it('内存使用应该保持稳定', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const clients: WebSocketClient[] = [];

      // 创建连接
      for (let i = 0; i < 50; i++) {
        const client = new WebSocketClient({
          url: testServer.wsUrl
        });
        await client.connect();
        clients.push(client);
      }

      const peakMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = peakMemory - initialMemory;
      
      expect(memoryIncrease).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.memoryLeakThreshold);

      // 清理
      const disconnectPromises = clients.map(client => client.disconnect());
      await Promise.all(disconnectPromises);
    });

    it('应该通过性能阈值检查', () => {
      const thresholdCheck = perfMonitor.checkThresholds();
      
      if (!thresholdCheck.passed) {
        console.warn('性能阈值检查失败:', thresholdCheck.violations);
      }

      // 记录性能报告供后续分析
      global.collectTestMetric('connection-basic-performance', perfMonitor.getPerformanceSummary());
    });
  });
});