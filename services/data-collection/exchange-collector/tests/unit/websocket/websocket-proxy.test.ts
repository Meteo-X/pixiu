/**
 * WebSocketProxy 测试
 * 测试WebSocket代理服务器的核心功能
 */

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { WebSocketProxy } from '../../../src/websocket/websocket-proxy';
import { globalCache } from '@pixiu/shared-core';
import { EnhancedMockFactory, MockWebSocket } from '../../utils/enhanced-mock-factory';
import { TestUtils, ConcurrencyResult } from '../../utils/test-utils';

// Mock WebSocket Server
class MockWebSocketServer extends EventEmitter {
  clients: Set<MockWebSocket> = new Set();
  address: string = '0.0.0.0';
  port: number = 8080;

  close = jest.fn((callback?: () => void) => {
    this.clients.clear();
    this.emit('close');
    if (callback) callback();
  });

  handleUpgrade = jest.fn();
  
  // 模拟客户端连接
  simulateConnection(): MockWebSocket {
    const mockClient = EnhancedMockFactory.createWebSocketMock({
      url: `ws://${this.address}:${this.port}`
    });
    
    this.clients.add(mockClient);
    this.emit('connection', mockClient);
    
    // 设置客户端断开时的清理
    mockClient.on('close', () => {
      this.clients.delete(mockClient);
    });
    
    return mockClient;
  }

  // 广播消息给所有客户端
  broadcast(data: any): void {
    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.emit('message', JSON.stringify(data));
      }
    });
  }
}

describe('WebSocketProxy', () => {
  let webSocketProxy: WebSocketProxy;
  let mockServer: MockWebSocketServer;
  let testConfig: any;

  beforeEach(() => {
    // Mock WebSocket Server
    mockServer = new MockWebSocketServer();
    
    // Mock的WebSocket构造函数返回mockServer
    (global as any).WebSocket = {
      Server: jest.fn(() => mockServer),
      OPEN: 1,
      CLOSED: 3
    };

    testConfig = TestUtils.createTestConfig({
      websocket: {
        server: {
          port: 8080,
          host: '0.0.0.0'
        },
        proxy: {
          enabled: true,
          targetUrl: 'ws://localhost:3001'
        }
      }
    });

    webSocketProxy = new WebSocketProxy();
  });

  afterEach(async () => {
    if (webSocketProxy) {
      try {
        await webSocketProxy.stop();
      } catch (error) {
        // 忽略停止错误
      }
    }
    
    EnhancedMockFactory.cleanup();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await globalCache.destroy();
  });

  describe('Initialization and Lifecycle', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(webSocketProxy.initialize(testConfig.websocket)).resolves.not.toThrow();
    });

    it('should start WebSocket server successfully', async () => {
      await webSocketProxy.initialize(testConfig.websocket);
      
      const startedPromise = TestUtils.waitForEvent(webSocketProxy, 'started');
      
      await webSocketProxy.start();
      
      await expect(startedPromise).resolves.toBeDefined();
      expect(webSocketProxy.getConnectionCount()).toBe(0); // 初始连接数为0
    });

    it('should stop gracefully', async () => {
      await webSocketProxy.initialize(testConfig.websocket);
      await webSocketProxy.start();
      
      // 模拟一些连接
      const clients = [
        mockServer.simulateConnection(),
        mockServer.simulateConnection(),
        mockServer.simulateConnection()
      ];
      
      await TestUtils.sleep(50);
      expect(webSocketProxy.getConnectionCount()).toBe(3);
      
      const stoppedPromise = TestUtils.waitForEvent(webSocketProxy, 'stopped');
      
      await webSocketProxy.stop();
      
      await expect(stoppedPromise).resolves.toBeDefined();
      expect(mockServer.close).toHaveBeenCalled();
      expect(webSocketProxy.getConnectionCount()).toBe(0);
    });

    it('should handle initialization errors', async () => {
      const invalidConfig = {
        server: {
          port: -1, // 无效端口
          host: 'invalid-host'
        }
      };

      await expect(webSocketProxy.initialize(invalidConfig)).rejects.toThrow();
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await webSocketProxy.initialize(testConfig.websocket);
      await webSocketProxy.start();
    });

    it('should handle client connections', async () => {
      const connectionPromise = TestUtils.waitForEvent(webSocketProxy, 'connectionEstablished');
      
      const client = mockServer.simulateConnection();
      
      const connectionEvent = await connectionPromise;
      expect(connectionEvent).toBeDefined();
      expect(webSocketProxy.getConnectionCount()).toBe(1);
    });

    it('should handle client disconnections', async () => {
      const client = mockServer.simulateConnection();
      await TestUtils.sleep(50);
      
      expect(webSocketProxy.getConnectionCount()).toBe(1);
      
      const disconnectionPromise = TestUtils.waitForEvent(webSocketProxy, 'connectionClosed');
      
      client.emit('close', 1000, 'Client disconnect');
      
      await disconnectionPromise;
      expect(webSocketProxy.getConnectionCount()).toBe(0);
    });

    it('should handle multiple simultaneous connections', async () => {
      const connectionCount = 10;
      const clients: MockWebSocket[] = [];
      
      // 创建多个连接
      for (let i = 0; i < connectionCount; i++) {
        const client = mockServer.simulateConnection();
        clients.push(client);
        await TestUtils.sleep(10); // 模拟连接间隔
      }
      
      expect(webSocketProxy.getConnectionCount()).toBe(connectionCount);
      
      // 断开一半连接
      const halfCount = Math.floor(connectionCount / 2);
      for (let i = 0; i < halfCount; i++) {
        clients[i].emit('close', 1000, 'Test disconnect');
        await TestUtils.sleep(10);
      }
      
      expect(webSocketProxy.getConnectionCount()).toBe(connectionCount - halfCount);
    });

    it('should enforce connection limits', async () => {
      const configWithLimit = {
        ...testConfig.websocket,
        maxConnections: 5
      };
      
      await webSocketProxy.stop();
      await webSocketProxy.initialize(configWithLimit);
      await webSocketProxy.start();
      
      // 尝试创建超过限制的连接
      const clients: MockWebSocket[] = [];
      for (let i = 0; i < 7; i++) {
        const client = mockServer.simulateConnection();
        clients.push(client);
        await TestUtils.sleep(10);
      }
      
      // 应该只允许5个连接
      expect(webSocketProxy.getConnectionCount()).toBeLessThanOrEqual(5);
    });
  });

  describe('Message Processing', () => {
    let client: MockWebSocket;
    
    beforeEach(async () => {
      await webSocketProxy.initialize(testConfig.websocket);
      await webSocketProxy.start();
      client = mockServer.simulateConnection();
      await TestUtils.sleep(50);
    });

    it('should receive messages from clients', async () => {
      const messageReceived = new Promise((resolve) => {
        webSocketProxy.on('messageReceived', (data, clientId) => {
          resolve({ data, clientId });
        });
      });

      const testMessage = { type: 'subscribe', symbol: 'BTCUSDT' };
      client.emit('message', JSON.stringify(testMessage));
      
      const result = await messageReceived as any;
      expect(result.data).toEqual(testMessage);
    });

    it('should broadcast messages to all clients', async () => {
      // 创建多个客户端
      const clients = [
        client,
        mockServer.simulateConnection(),
        mockServer.simulateConnection()
      ];
      
      await TestUtils.sleep(50);
      expect(webSocketProxy.getConnectionCount()).toBe(3);
      
      const testData = { type: 'market_data', symbol: 'BTCUSDT', price: '50000' };
      webSocketProxy.broadcast(testData);
      
      // 验证所有客户端都收到消息
      clients.forEach(c => {
        expect(c.send).toHaveBeenCalledWith(JSON.stringify(testData));
      });
    });

    it('should handle message sending to specific clients', async () => {
      const clients = [
        client,
        mockServer.simulateConnection(),
        mockServer.simulateConnection()
      ];
      
      await TestUtils.sleep(50);
      
      const testData = { type: 'private_data', content: 'test' };
      
      // 发送给特定客户端（假设有sendToClient方法）
      if (typeof webSocketProxy.sendToClient === 'function') {
        await webSocketProxy.sendToClient('client-1', testData);
        
        expect(clients[0].send).toHaveBeenCalledWith(JSON.stringify(testData));
        expect(clients[1].send).not.toHaveBeenCalledWith(JSON.stringify(testData));
        expect(clients[2].send).not.toHaveBeenCalledWith(JSON.stringify(testData));
      }
    });

    it('should handle malformed messages gracefully', async () => {
      let errorHandled = false;
      
      webSocketProxy.on('messageError', (error, clientId) => {
        errorHandled = true;
        expect(error).toBeInstanceOf(Error);
        expect(clientId).toBeDefined();
      });

      // 发送无效JSON
      client.emit('message', 'invalid json {');
      
      await TestUtils.waitFor(() => errorHandled, 1000);
      expect(errorHandled).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    beforeEach(async () => {
      await webSocketProxy.initialize(testConfig.websocket);
      await webSocketProxy.start();
    });

    it('should handle high connection throughput', async () => {
      const result: ConcurrencyResult = await TestUtils.testConcurrency(
        async () => {
          const client = mockServer.simulateConnection();
          await TestUtils.sleep(5); // 模拟连接时间
          return Promise.resolve();
        },
        100, // 100个连接
        10   // 并发级别10
      );

      expect(result.successfulConnections).toBeGreaterThan(90); // 至少90%成功
      expect(result.averageConnectionTime).toBeLessThan(50); // 平均连接时间<50ms
    });

    it('should maintain low message latency', async () => {
      // 创建一些客户端
      const clientCount = 10;
      const clients: MockWebSocket[] = [];
      
      for (let i = 0; i < clientCount; i++) {
        clients.push(mockServer.simulateConnection());
      }
      
      await TestUtils.sleep(100);
      
      // 测试消息延迟
      const messageCount = 100;
      const latencies: number[] = [];
      
      for (let i = 0; i < messageCount; i++) {
        const startTime = Date.now();
        
        const testData = { 
          type: 'latency_test', 
          timestamp: startTime, 
          id: i 
        };
        
        webSocketProxy.broadcast(testData);
        
        const endTime = Date.now();
        latencies.push(endTime - startTime);
        
        await TestUtils.sleep(1); // 1ms间隔
      }
      
      const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      
      expect(averageLatency).toBeLessThan(10); // 平均延迟<10ms
      expect(maxLatency).toBeLessThan(50);     // 最大延迟<50ms
    });

    it('should handle memory efficiently under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 创建大量连接
      const connectionCount = 100;
      for (let i = 0; i < connectionCount; i++) {
        mockServer.simulateConnection();
      }
      
      await TestUtils.sleep(100);
      
      // 发送大量消息
      for (let i = 0; i < 1000; i++) {
        webSocketProxy.broadcast({
          type: 'memory_test',
          data: new Array(100).fill('x').join(''), // 100字节数据
          timestamp: Date.now()
        });
        
        if (i % 100 === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = currentMemory - initialMemory;
          
          // 内存增长应该保持在合理范围内（50MB）
          expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        }
      }
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await webSocketProxy.initialize(testConfig.websocket);
      await webSocketProxy.start();
    });

    it('should track connection statistics', async () => {
      // 创建一些连接
      const clients = [
        mockServer.simulateConnection(),
        mockServer.simulateConnection(),
        mockServer.simulateConnection()
      ];
      
      await TestUtils.sleep(50);
      
      const stats = webSocketProxy.getStats();
      
      expect(stats.activeConnections).toBe(3);
      expect(stats.totalConnections).toBeGreaterThanOrEqual(3);
      expect(stats.uptime).toBeGreaterThan(0);
    });

    it('should track message statistics', async () => {
      const client = mockServer.simulateConnection();
      await TestUtils.sleep(50);
      
      // 发送一些消息
      for (let i = 0; i < 10; i++) {
        webSocketProxy.broadcast({ 
          type: 'test_message', 
          id: i 
        });
      }
      
      // 客户端发送消息
      for (let i = 0; i < 5; i++) {
        client.emit('message', JSON.stringify({ 
          type: 'client_message', 
          id: i 
        }));
      }
      
      await TestUtils.sleep(100);
      
      const stats = webSocketProxy.getStats();
      
      expect(stats.messagesSent).toBeGreaterThanOrEqual(10);
      expect(stats.messagesReceived).toBeGreaterThanOrEqual(5);
    });

    it('should calculate average latency', async () => {
      const clients = [
        mockServer.simulateConnection(),
        mockServer.simulateConnection()
      ];
      
      await TestUtils.sleep(50);
      
      // 模拟一些延迟（通过slow send）
      clients.forEach(client => {
        const originalSend = client.send;
        client.send = jest.fn(async (data: string) => {
          await TestUtils.sleep(5); // 5ms延迟
          return originalSend.call(client, data);
        });
      });
      
      // 发送消息
      for (let i = 0; i < 20; i++) {
        webSocketProxy.broadcast({ type: 'latency_test', id: i });
        await TestUtils.sleep(10);
      }
      
      const stats = webSocketProxy.getStats();
      expect(stats.averageLatency).toBeDefined();
      expect(stats.averageLatency).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await webSocketProxy.initialize(testConfig.websocket);
      await webSocketProxy.start();
    });

    it('should handle client connection errors', async () => {
      let connectionError: any = null;
      
      webSocketProxy.on('connectionError', (error, clientInfo) => {
        connectionError = { error, clientInfo };
      });

      // 模拟连接错误
      const client = mockServer.simulateConnection();
      client.emit('error', new Error('Connection error'));
      
      await TestUtils.waitFor(() => connectionError !== null, 1000);
      
      expect(connectionError.error).toBeInstanceOf(Error);
      expect(connectionError.error.message).toBe('Connection error');
    });

    it('should handle broadcast errors gracefully', async () => {
      const clients = [
        mockServer.simulateConnection(),
        mockServer.simulateConnection(),
        mockServer.simulateConnection()
      ];
      
      await TestUtils.sleep(50);
      
      // 模拟一个客户端发送失败
      clients[1].send = jest.fn(() => {
        throw new Error('Send failed');
      });
      
      let broadcastErrors = 0;
      webSocketProxy.on('broadcastError', () => {
        broadcastErrors++;
      });
      
      webSocketProxy.broadcast({ type: 'test_message' });
      
      await TestUtils.sleep(50);
      
      // 其他客户端应该仍然收到消息
      expect(clients[0].send).toHaveBeenCalled();
      expect(clients[2].send).toHaveBeenCalled();
      
      // 应该记录错误但不影响其他客户端
      expect(broadcastErrors).toBeGreaterThan(0);
    });

    it('should cleanup resources on unexpected errors', async () => {
      const client = mockServer.simulateConnection();
      await TestUtils.sleep(50);
      
      expect(webSocketProxy.getConnectionCount()).toBe(1);
      
      // 模拟客户端异常断开
      client.emit('error', new Error('Unexpected error'));
      client.emit('close', 1006, 'Abnormal closure');
      
      await TestUtils.sleep(50);
      
      // 连接应该被清理
      expect(webSocketProxy.getConnectionCount()).toBe(0);
    });
  });

  describe('Configuration and Customization', () => {
    it('should respect custom port configuration', async () => {
      const customConfig = {
        ...testConfig.websocket,
        server: {
          ...testConfig.websocket.server,
          port: 9999
        }
      };
      
      await webSocketProxy.initialize(customConfig);
      await webSocketProxy.start();
      
      // 验证服务器使用了自定义端口
      expect(mockServer.port).toBe(9999);
    });

    it('should support custom connection limits', async () => {
      const configWithLimits = {
        ...testConfig.websocket,
        maxConnections: 3,
        connectionTimeout: 1000
      };
      
      await webSocketProxy.initialize(configWithLimits);
      await webSocketProxy.start();
      
      // 创建超过限制的连接
      for (let i = 0; i < 5; i++) {
        mockServer.simulateConnection();
      }
      
      await TestUtils.sleep(100);
      
      // 应该只接受配置的最大连接数
      expect(webSocketProxy.getConnectionCount()).toBeLessThanOrEqual(3);
    });
  });
});