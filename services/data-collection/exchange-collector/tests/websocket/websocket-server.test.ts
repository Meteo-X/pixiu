import { Server } from 'http';
import WebSocket from 'ws';
import express from 'express';
import { BaseMonitor } from '@pixiu/shared-core';
import { AdapterRegistry } from '../../src/adapters/registry/adapter-registry';
import { CollectorWebSocketServer } from '../../src/websocket/websocket-server';

describe('CollectorWebSocketServer', () => {
  let app: express.Application;
  let server: Server;
  let wsServer: CollectorWebSocketServer;
  let monitor: BaseMonitor;
  let adapterRegistry: AdapterRegistry;
  let port: number;

  beforeEach((done) => {
    // 创建 Express 应用和 HTTP 服务器
    app = express();
    server = app.listen(0, () => {
      const address = server.address();
      port = typeof address === 'string' ? parseInt(address) : address?.port || 0;
      
      // 创建模拟对象
      monitor = {
        log: jest.fn()
      } as any;

      adapterRegistry = {
        getAllInstances: jest.fn().mockReturnValue(new Map()),
        getInstance: jest.fn().mockReturnValue(null)
      } as any;

      // 创建 WebSocket 服务器
      wsServer = new CollectorWebSocketServer(server, monitor, adapterRegistry);
      
      done();
    });
  });

  afterEach(async () => {
    if (wsServer) {
      await wsServer.close();
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('Connection Management', () => {
    it('should accept WebSocket connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      
      ws.on('open', () => {
        expect(wsServer.getConnectionCount()).toBe(1);
        ws.close();
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(wsServer.getConnectionCount()).toBe(0);
          done();
        }, 100);
      });

      ws.on('error', done);
    });

    it('should send welcome message on connection', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'welcome') {
          expect(message.payload).toHaveProperty('connectionId');
          expect(message.payload).toHaveProperty('serverTime');
          ws.close();
          done();
        }
      });

      ws.on('error', done);
    });

    it('should handle multiple connections', (done) => {
      const connections: WebSocket[] = [];
      let connectedCount = 0;

      const handleConnection = () => {
        connectedCount++;
        if (connectedCount === 3) {
          expect(wsServer.getConnectionCount()).toBe(3);
          
          // 关闭所有连接
          connections.forEach(ws => ws.close());
          
          setTimeout(() => {
            expect(wsServer.getConnectionCount()).toBe(0);
            done();
          }, 100);
        }
      };

      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(`ws://localhost:${port}/ws`);
        connections.push(ws);
        
        ws.on('open', handleConnection);
        ws.on('error', done);
      }
    });
  });

  describe('Message Handling', () => {
    let ws: WebSocket;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${port}/ws`);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle ping/pong messages', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'pong') {
          expect(message.type).toBe('pong');
          done();
        }
      });

      ws.send(JSON.stringify({ type: 'ping' }));
    });

    it('should handle subscription messages', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'subscribed') {
          expect(message.payload).toHaveProperty('channel', 'test-channel');
          done();
        }
      });

      ws.send(JSON.stringify({
        type: 'subscribe',
        payload: { channel: 'test-channel' }
      }));
    });

    it('should handle unsubscription messages', (done) => {
      let subscriptionReceived = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'subscribed' && !subscriptionReceived) {
          subscriptionReceived = true;
          // 发送取消订阅消息
          ws.send(JSON.stringify({
            type: 'unsubscribe',
            payload: { channel: 'test-channel' }
          }));
        } else if (message.type === 'unsubscribed') {
          expect(message.payload).toHaveProperty('channel', 'test-channel');
          done();
        }
      });

      // 先订阅
      ws.send(JSON.stringify({
        type: 'subscribe',
        payload: { channel: 'test-channel' }
      }));
    });

    it('should handle stats request', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'stats') {
          expect(message.payload).toHaveProperty('connections');
          expect(message.payload).toHaveProperty('subscriptions');
          expect(message.payload).toHaveProperty('server');
          done();
        }
      });

      ws.send(JSON.stringify({ type: 'getStats' }));
    });

    it('should handle invalid messages gracefully', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') {
          expect(message.payload).toHaveProperty('message', 'Invalid message format');
          done();
        }
      });

      // 发送无效的 JSON
      ws.send('invalid json');
    });

    it('should handle unknown message types', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'welcome') {
          return; // 忽略欢迎消息
        }
        
        expect(message.type).toBe('error');
        expect(message.payload.message).toContain('Unknown message type');
        done();
      });

      ws.send(JSON.stringify({
        type: 'unknown-type',
        payload: {}
      }));
    });
  });

  describe('Broadcasting', () => {
    let clients: WebSocket[] = [];

    beforeEach((done) => {
      let connectedCount = 0;
      const targetCount = 3;

      for (let i = 0; i < targetCount; i++) {
        const ws = new WebSocket(`ws://localhost:${port}/ws`);
        clients.push(ws);
        
        ws.on('open', () => {
          connectedCount++;
          if (connectedCount === targetCount) {
            done();
          }
        });
        
        ws.on('error', done);
      }
    });

    afterEach(() => {
      clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
      clients = [];
    });

    it('should broadcast to all connected clients', (done) => {
      let receivedCount = 0;
      const expectedCount = 3;

      clients.forEach(ws => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'test-broadcast') {
            receivedCount++;
            if (receivedCount === expectedCount) {
              done();
            }
          }
        });
      });

      // 等待所有连接建立后再广播
      setTimeout(() => {
        wsServer.broadcast({
          type: 'test-broadcast',
          payload: { message: 'Hello everyone!' }
        });
      }, 100);
    });

    it('should broadcast market data to subscribed clients', (done) => {
      let receivedCount = 0;
      let subscriptionsCompleted = 0;

      // 前两个客户端订阅市场数据
      for (let i = 0; i < 2; i++) {
        clients[i].on('message', (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'subscribed') {
            subscriptionsCompleted++;
            if (subscriptionsCompleted === 2) {
              // 广播市场数据
              wsServer.broadcastMarketData({
                symbol: 'BTCUSDT',
                price: 50000
              });
            }
          } else if (message.type === 'marketData') {
            receivedCount++;
            expect(message.payload).toHaveProperty('symbol', 'BTCUSDT');
            if (receivedCount === 2) {
              done();
            }
          }
        });

        // 订阅市场数据频道
        clients[i].send(JSON.stringify({
          type: 'subscribe',
          payload: { channel: 'marketData' }
        }));
      }

      // 第三个客户端不订阅，应该收不到消息
      clients[2].on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'marketData') {
          done(new Error('Client should not receive unsubscribed messages'));
        }
      });
    });
  });

  describe('Server Statistics', () => {
    it('should provide accurate server statistics', () => {
      const stats = wsServer.getServerStats();
      
      expect(stats).toHaveProperty('connections');
      expect(stats).toHaveProperty('subscriptions');
      expect(stats).toHaveProperty('server');
      
      expect(stats.connections).toHaveProperty('total');
      expect(stats.connections).toHaveProperty('active');
      expect(stats.connections).toHaveProperty('avgDuration');
      
      expect(stats.subscriptions).toHaveProperty('total');
      expect(stats.subscriptions).toHaveProperty('channels');
      
      expect(stats.server).toHaveProperty('uptime');
      expect(stats.server).toHaveProperty('memory');
      expect(stats.server).toHaveProperty('timestamp');
    });

    it('should update connection count correctly', (done) => {
      expect(wsServer.getConnectionCount()).toBe(0);
      
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      
      ws.on('open', () => {
        expect(wsServer.getConnectionCount()).toBe(1);
        ws.close();
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(wsServer.getConnectionCount()).toBe(0);
          done();
        }, 100);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      
      ws.on('open', () => {
        // 强制触发错误
        (ws as any).emit('error', new Error('Test error'));
      });

      // WebSocket 应该被清理
      setTimeout(() => {
        expect(wsServer.getConnectionCount()).toBe(0);
        done();
      }, 100);
    });

    it('should clean up connections on server close', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      
      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          expect(wsServer.getConnectionCount()).toBe(1);
          resolve();
        });
      });

      await wsServer.close();
      expect(wsServer.getConnectionCount()).toBe(0);
    });
  });
});