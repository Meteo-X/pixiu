/**
 * 测试服务器 - 用于性能测试的模拟WebSocket和HTTP服务
 */

import * as http from 'http';
import * as WebSocket from 'ws';
import * as express from 'express';
import { EventEmitter } from 'events';
import { TEST_CONFIG } from '../setup';

export interface TestMessage {
  id: string;
  type: 'trade' | 'kline' | 'ticker' | 'depth';
  symbol: string;
  data: any;
  timestamp: number;
}

export interface ServerMetrics {
  connectionsCount: number;
  messagesReceived: number;
  messagesSent: number;
  startTime: number;
  bytesReceived: number;
  bytesSent: number;
}

export class TestWebSocketServer extends EventEmitter {
  private httpServer: http.Server;
  private wsServer: WebSocket.Server;
  private clients: Set<WebSocket> = new Set();
  private metrics: ServerMetrics;
  private messageGenerationInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private port = TEST_CONFIG.TEST_SERVER.WS_PORT,
    private host = TEST_CONFIG.TEST_SERVER.HOST
  ) {
    super();
    
    const app = express();
    
    // 健康检查端点
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        connections: this.clients.size,
        metrics: this.metrics
      });
    });

    // 性能指标端点
    app.get('/metrics', (req, res) => {
      res.json(this.getMetrics());
    });

    this.httpServer = http.createServer(app);
    this.wsServer = new WebSocket.Server({ server: this.httpServer });
    
    this.metrics = {
      connectionsCount: 0,
      messagesReceived: 0,
      messagesSent: 0,
      startTime: Date.now(),
      bytesReceived: 0,
      bytesSent: 0
    };

    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wsServer.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      this.metrics.connectionsCount++;
      
      console.log(`WebSocket客户端连接，当前连接数: ${this.clients.size}`);
      this.emit('connection', ws);

      ws.on('message', (data: WebSocket.Data) => {
        this.metrics.messagesReceived++;
        this.metrics.bytesReceived += Buffer.isBuffer(data) ? data.length : String(data).length;
        
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.warn('解析WebSocket消息失败:', error);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`WebSocket客户端断开，当前连接数: ${this.clients.size}`);
        this.emit('disconnection', ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
        this.clients.delete(ws);
        this.emit('error', error);
      });

      // 发送欢迎消息
      this.sendToClient(ws, {
        id: `welcome-${Date.now()}`,
        type: 'ticker',
        symbol: 'SYSTEM',
        data: { message: 'WebSocket连接建立' },
        timestamp: Date.now()
      });
    });
  }

  private handleClientMessage(ws: WebSocket, message: any): void {
    // 处理订阅请求
    if (message.method === 'SUBSCRIBE' && message.params) {
      console.log(`客户端订阅: ${JSON.stringify(message.params)}`);
      
      // 确认订阅
      this.sendToClient(ws, {
        id: `sub-confirm-${Date.now()}`,
        type: 'ticker',
        symbol: message.params[0] || 'BTCUSDT',
        data: { subscribed: message.params },
        timestamp: Date.now()
      });
    }

    // 处理取消订阅请求
    if (message.method === 'UNSUBSCRIBE' && message.params) {
      console.log(`客户端取消订阅: ${JSON.stringify(message.params)}`);
    }

    this.emit('message', ws, message);
  }

  private sendToClient(ws: WebSocket, message: TestMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(message);
      ws.send(data);
      
      this.metrics.messagesSent++;
      this.metrics.bytesSent += data.length;
    }
  }

  /**
   * 启动测试服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('测试服务器已经在运行中');
    }

    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, this.host, () => {
        this.isRunning = true;
        console.log(`🚀 测试WebSocket服务器启动: ws://${this.host}:${this.port}`);
        this.emit('started');
        resolve();
      });

      this.httpServer.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 停止测试服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.stopMessageGeneration();

    // 关闭所有WebSocket连接
    for (const client of this.clients) {
      client.terminate();
    }
    this.clients.clear();

    // 关闭WebSocket服务器
    this.wsServer.close();

    // 关闭HTTP服务器
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        this.isRunning = false;
        console.log('✅ 测试WebSocket服务器已停止');
        this.emit('stopped');
        resolve();
      });
    });
  }

  /**
   * 开始自动生成测试消息
   */
  startMessageGeneration(interval = 100, messageTypes: Array<'trade' | 'kline' | 'ticker' | 'depth'> = ['trade', 'ticker']): void {
    if (this.messageGenerationInterval) {
      clearInterval(this.messageGenerationInterval);
    }

    console.log(`开始生成测试消息，间隔: ${interval}ms`);

    this.messageGenerationInterval = setInterval(() => {
      if (this.clients.size === 0) return;

      const messageType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
      const message = this.generateTestMessage(messageType);
      
      this.broadcastMessage(message);
    }, interval);
  }

  /**
   * 停止自动生成测试消息
   */
  stopMessageGeneration(): void {
    if (this.messageGenerationInterval) {
      clearInterval(this.messageGenerationInterval);
      this.messageGenerationInterval = undefined;
      console.log('停止生成测试消息');
    }
  }

  /**
   * 生成测试消息
   */
  private generateTestMessage(type: 'trade' | 'kline' | 'ticker' | 'depth'): TestMessage {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT'];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    
    let data: any;
    switch (type) {
      case 'trade':
        data = {
          price: (Math.random() * 50000 + 20000).toFixed(2),
          quantity: (Math.random() * 10).toFixed(4),
          time: Date.now(),
          isBuyerMaker: Math.random() > 0.5
        };
        break;
        
      case 'kline':
        const open = Math.random() * 50000 + 20000;
        const close = open + (Math.random() - 0.5) * 1000;
        data = {
          openTime: Date.now() - 60000,
          closeTime: Date.now(),
          symbol,
          open: open.toFixed(2),
          high: Math.max(open, close).toFixed(2),
          low: Math.min(open, close).toFixed(2),
          close: close.toFixed(2),
          volume: (Math.random() * 1000).toFixed(4)
        };
        break;
        
      case 'ticker':
        data = {
          symbol,
          priceChange: (Math.random() - 0.5) * 2000,
          priceChangePercent: ((Math.random() - 0.5) * 10).toFixed(2),
          lastPrice: (Math.random() * 50000 + 20000).toFixed(2),
          volume: (Math.random() * 10000).toFixed(4),
          count: Math.floor(Math.random() * 10000)
        };
        break;
        
      case 'depth':
        const generateDepthLevel = () => [
          (Math.random() * 50000 + 20000).toFixed(2),
          (Math.random() * 100).toFixed(4)
        ];
        data = {
          bids: Array.from({ length: 10 }, generateDepthLevel),
          asks: Array.from({ length: 10 }, generateDepthLevel),
          lastUpdateId: Date.now()
        };
        break;
    }

    return {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      symbol,
      data,
      timestamp: Date.now()
    };
  }

  /**
   * 向所有客户端广播消息
   */
  broadcastMessage(message: TestMessage): void {
    const data = JSON.stringify(message);
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
        this.metrics.messagesSent++;
        this.metrics.bytesSent += data.length;
      }
    }
  }

  /**
   * 生成高频消息流
   */
  startHighFrequencyStream(messagesPerSecond = 1000): void {
    const interval = 1000 / messagesPerSecond;
    this.startMessageGeneration(interval, ['trade', 'ticker']);
  }

  /**
   * 模拟网络延迟
   */
  simulateNetworkDelay(delayMs = 50): void {
    // 在实际实现中，这里会添加网络延迟模拟
    console.log(`模拟网络延迟: ${delayMs}ms`);
  }

  /**
   * 获取服务器指标
   */
  getMetrics(): ServerMetrics & {
    uptime: number;
    messagesPerSecond: number;
    bytesPerSecond: number;
  } {
    const uptime = Date.now() - this.metrics.startTime;
    const uptimeSeconds = uptime / 1000;
    
    return {
      ...this.metrics,
      uptime,
      messagesPerSecond: uptimeSeconds > 0 ? this.metrics.messagesSent / uptimeSeconds : 0,
      bytesPerSecond: uptimeSeconds > 0 ? this.metrics.bytesSent / uptimeSeconds : 0
    };
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): {
    totalConnections: number;
    activeConnections: number;
    serverRunning: boolean;
  } {
    return {
      totalConnections: this.metrics.connectionsCount,
      activeConnections: this.clients.size,
      serverRunning: this.isRunning
    };
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics = {
      connectionsCount: 0,
      messagesReceived: 0,
      messagesSent: 0,
      startTime: Date.now(),
      bytesReceived: 0,
      bytesSent: 0
    };
  }
}