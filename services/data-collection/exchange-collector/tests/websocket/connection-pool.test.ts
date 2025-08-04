import WebSocket from 'ws';
import { BaseMonitor } from '@pixiu/shared-core';
import { WebSocketConnectionPool, ConnectionPoolConfig } from '../../src/websocket/connection-pool';

describe('WebSocketConnectionPool', () => {
  let pool: WebSocketConnectionPool;
  let monitor: BaseMonitor;
  let config: ConnectionPoolConfig;

  beforeEach(() => {
    monitor = {
      log: jest.fn()
    } as any;

    config = {
      maxConnections: 5,
      idleTimeout: 5000, // 5秒
      cleanupInterval: 1000, // 1秒
      enableMetrics: true
    };

    pool = new WebSocketConnectionPool(config, monitor);
  });

  afterEach(async () => {
    await pool.close();
  });

  describe('Connection Management', () => {
    it('should add connections successfully', () => {
      const mockSocket = new WebSocket('ws://example.com');
      const id = 'test-connection-1';
      const metadata = { userId: 'user1' };

      const result = pool.addConnection(id, mockSocket, metadata);

      expect(result).toBe(true);
      
      const connection = pool.getConnection(id);
      expect(connection).toBeDefined();
      expect(connection?.id).toBe(id);
      expect(connection?.metadata).toEqual(metadata);
    });

    it('should reject duplicate connection IDs', () => {
      const mockSocket1 = new WebSocket('ws://example.com');
      const mockSocket2 = new WebSocket('ws://example.com');
      const id = 'duplicate-id';

      const result1 = pool.addConnection(id, mockSocket1);
      const result2 = pool.addConnection(id, mockSocket2);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should enforce maximum connection limit', () => {
      const connections: WebSocket[] = [];
      const results: boolean[] = [];

      // 添加最大数量的连接
      for (let i = 0; i < config.maxConnections; i++) {
        const socket = new WebSocket('ws://example.com');
        connections.push(socket);
        results.push(pool.addConnection(`conn-${i}`, socket));
      }

      // 尝试添加超出限制的连接
      const extraSocket = new WebSocket('ws://example.com');
      const extraResult = pool.addConnection('extra-conn', extraSocket);

      expect(results.every(r => r === true)).toBe(true);
      expect(extraResult).toBe(false);
    });

    it('should remove connections successfully', () => {
      const mockSocket = new WebSocket('ws://example.com');
      const id = 'test-connection';

      pool.addConnection(id, mockSocket);
      expect(pool.getConnection(id)).toBeDefined();

      const result = pool.removeConnection(id);
      expect(result).toBe(true);
      expect(pool.getConnection(id)).toBeUndefined();
    });

    it('should return false when removing non-existent connection', () => {
      const result = pool.removeConnection('non-existent');
      expect(result).toBe(false);
    });

    it('should update last activity when getting connection', () => {
      const mockSocket = new WebSocket('ws://example.com');
      const id = 'test-connection';

      pool.addConnection(id, mockSocket);
      const connection1 = pool.getConnection(id);
      const firstActivity = connection1?.lastActivity;

      // 等待一点时间
      setTimeout(() => {
        const connection2 = pool.getConnection(id);
        const secondActivity = connection2?.lastActivity;

        expect(secondActivity).toBeGreaterThan(firstActivity!);
      }, 10);
    });
  });

  describe('Connection Filtering and Search', () => {
    beforeEach(() => {
      // 添加一些测试连接
      for (let i = 0; i < 3; i++) {
        const socket = new WebSocket('ws://example.com');
        // 模拟 OPEN 状态
        Object.defineProperty(socket, 'readyState', {
          value: WebSocket.OPEN,
          writable: false
        });
        
        pool.addConnection(`conn-${i}`, socket, {
          userId: `user${i}`,
          type: i % 2 === 0 ? 'admin' : 'regular'
        });
      }
    });

    it('should return active connections only', () => {
      const activeConnections = pool.getActiveConnections();
      expect(activeConnections).toHaveLength(3);
      
      activeConnections.forEach(conn => {
        expect(conn.socket.readyState).toBe(WebSocket.OPEN);
      });
    });

    it('should find connections by predicate', () => {
      const adminConnections = pool.findConnections(
        conn => conn.metadata.type === 'admin'
      );

      expect(adminConnections).toHaveLength(2);
      adminConnections.forEach(conn => {
        expect(conn.metadata.type).toBe('admin');
      });
    });

    it('should update connection metadata', () => {
      const id = 'conn-0';
      const newMetadata = { lastAction: 'login' };

      const result = pool.updateConnectionMetadata(id, newMetadata);
      expect(result).toBe(true);

      const connection = pool.getConnection(id);
      expect(connection?.metadata).toMatchObject({
        userId: 'user0',
        type: 'admin',
        lastAction: 'login'
      });
    });
  });

  describe('Broadcasting', () => {
    beforeEach(() => {
      // 添加一些测试连接
      for (let i = 0; i < 3; i++) {
        const socket = new WebSocket('ws://example.com');
        
        // 模拟 OPEN 状态
        Object.defineProperty(socket, 'readyState', {
          value: WebSocket.OPEN,
          writable: false
        });
        
        // 模拟 send 方法
        socket.send = jest.fn();
        
        pool.addConnection(`conn-${i}`, socket, { userId: `user${i}` });
      }
    });

    it('should broadcast to all active connections', () => {
      const message = 'Hello everyone!';
      const sentCount = pool.broadcast(message);

      expect(sentCount).toBe(3);
      
      const connections = pool.getActiveConnections();
      connections.forEach(conn => {
        expect(conn.socket.send).toHaveBeenCalledWith(message);
      });
    });

    it('should apply filter when broadcasting', () => {
      const message = 'Hello admins!';
      const filter = (conn: any) => conn.metadata.userId === 'user1';
      
      const sentCount = pool.broadcast(message, filter);
      expect(sentCount).toBe(1);
    });

    it('should send to specific connection', () => {
      const message = 'Hello user0!';
      const result = pool.sendToConnection('conn-0', message);

      expect(result).toBe(true);
      
      const connection = pool.getConnection('conn-0');
      expect(connection?.socket.send).toHaveBeenCalledWith(message);
    });

    it('should return false when sending to non-existent connection', () => {
      const result = pool.sendToConnection('non-existent', 'message');
      expect(result).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      // 添加一些连接
      for (let i = 0; i < 3; i++) {
        const socket = new WebSocket('ws://example.com');
        Object.defineProperty(socket, 'readyState', {
          value: i < 2 ? WebSocket.OPEN : WebSocket.CLOSED,
          writable: false
        });
        
        pool.addConnection(`conn-${i}`, socket);
      }

      const stats = pool.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.active).toBe(2);
      expect(stats.idle).toBe(1);
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('lastCleanup');
    });

    it('should provide capacity information', () => {
      // 添加一些连接
      for (let i = 0; i < 2; i++) {
        const socket = new WebSocket('ws://example.com');
        pool.addConnection(`conn-${i}`, socket);
      }

      const capacity = pool.getCapacityInfo();
      
      expect(capacity.used).toBe(2);
      expect(capacity.total).toBe(5);
      expect(capacity.available).toBe(3);
      expect(capacity.utilization).toBe(40);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when operating normally', async () => {
      // 添加一些连接但不超过阈值
      for (let i = 0; i < 2; i++) {
        const socket = new WebSocket('ws://example.com');
        Object.defineProperty(socket, 'readyState', {
          value: WebSocket.OPEN,
          writable: false
        });
        pool.addConnection(`conn-${i}`, socket);
      }

      const healthCheck = await pool.healthCheck();
      
      expect(healthCheck.healthy).toBe(true);
      expect(healthCheck.details).toHaveProperty('stats');
      expect(healthCheck.details).toHaveProperty('capacity');
      expect(healthCheck.details).toHaveProperty('timestamp');
    });

    it('should return unhealthy status when utilization is too high', async () => {
      // 添加接近最大数量的连接
      for (let i = 0; i < config.maxConnections; i++) {
        const socket = new WebSocket('ws://example.com');
        Object.defineProperty(socket, 'readyState', {
          value: WebSocket.OPEN,
          writable: false
        });
        pool.addConnection(`conn-${i}`, socket);
      }

      const healthCheck = await pool.healthCheck();
      
      expect(healthCheck.healthy).toBe(false);
      expect(healthCheck.details.capacity.utilization).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Cleanup Process', () => {
    beforeEach(() => {
      // 使用更短的清理间隔进行测试
      config.cleanupInterval = 100;
      config.idleTimeout = 200;
      
      if (pool) {
        pool.close();
      }
      
      pool = new WebSocketConnectionPool(config, monitor);
    });

    it('should clean up idle connections', (done) => {
      const socket = new WebSocket('ws://example.com');
      Object.defineProperty(socket, 'readyState', {
        value: WebSocket.OPEN,
        writable: false
      });
      socket.close = jest.fn();
      
      pool.addConnection('idle-conn', socket);
      expect(pool.getStats().total).toBe(1);

      // 等待超过空闲超时时间
      setTimeout(() => {
        expect(pool.getStats().total).toBe(0);
        expect(socket.close).toHaveBeenCalled();
        done();
      }, 300);
    });

    it('should clean up closed connections', (done) => {
      const socket = new WebSocket('ws://example.com');
      Object.defineProperty(socket, 'readyState', {
        value: WebSocket.CLOSED,
        writable: false
      });
      
      pool.addConnection('closed-conn', socket);
      expect(pool.getStats().total).toBe(1);

      // 等待清理过程运行
      setTimeout(() => {
        expect(pool.getStats().total).toBe(0);
        done();
      }, 150);
    });
  });

  describe('Close and Cleanup', () => {
    it('should close all connections when pool is closed', async () => {
      const sockets: WebSocket[] = [];
      
      // 添加一些连接
      for (let i = 0; i < 3; i++) {
        const socket = new WebSocket('ws://example.com');
        Object.defineProperty(socket, 'readyState', {
          value: WebSocket.OPEN,
          writable: false
        });
        socket.close = jest.fn();
        sockets.push(socket);
        
        pool.addConnection(`conn-${i}`, socket);
      }

      expect(pool.getStats().total).toBe(3);

      await pool.close();

      expect(pool.getStats().total).toBe(0);
      sockets.forEach(socket => {
        expect(socket.close).toHaveBeenCalledWith(1001, 'Pool shutting down');
      });
    });
  });
});