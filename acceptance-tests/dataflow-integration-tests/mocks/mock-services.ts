/**
 * Mock服务集合
 * 提供测试期间需要的各种Mock服务实现
 */

import { EventEmitter } from 'events';
import WebSocket, { WebSocketServer } from 'ws';
import { createServer, Server } from 'http';

/**
 * Mock WebSocket服务器
 */
export class MockWebSocketServer extends EventEmitter {
  private server: WebSocketServer | null = null;
  private httpServer: Server | null = null;
  private connections: Set<WebSocket> = new Set();
  private port: number;
  private isRunning = false;

  constructor(port: number = 18080) {
    super();
    this.port = port;
  }

  /**
   * 启动WebSocket服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.httpServer = createServer();
        this.server = new WebSocketServer({ server: this.httpServer });

        this.server.on('connection', (ws: WebSocket) => {
          this.connections.add(ws);
          this.emit('connection', ws);

          ws.on('message', (data) => {
            this.emit('message', data, ws);
          });

          ws.on('close', () => {
            this.connections.delete(ws);
            this.emit('disconnect', ws);
          });

          ws.on('error', (error) => {
            this.emit('error', error, ws);
          });
        });

        this.httpServer.listen(this.port, () => {
          this.isRunning = true;
          this.emit('started', this.port);
          resolve();
        });

        this.httpServer.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 停止WebSocket服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // 关闭所有连接
    for (const ws of this.connections) {
      ws.close();
    }
    this.connections.clear();

    // 关闭服务器
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * 广播消息到所有连接
   */
  broadcast(message: any): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    
    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * 发送消息到特定连接
   */
  sendTo(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      ws.send(data);
    }
  }

  /**
   * 获取连接数
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * 获取所有连接
   */
  getConnections(): Set<WebSocket> {
    return new Set(this.connections);
  }

  /**
   * 获取服务器地址
   */
  getAddress(): string {
    return `ws://localhost:${this.port}`;
  }
}

/**
 * Mock Redis服务
 */
export class MockRedisService extends EventEmitter {
  private data: Map<string, { value: any; expiry?: number }> = new Map();
  private subscribers: Map<string, Set<(message: any) => void>> = new Map();
  private isConnected = false;

  /**
   * 连接到Redis（模拟）
   */
  async connect(): Promise<void> {
    this.isConnected = true;
    this.emit('connect');
  }

  /**
   * 断开Redis连接
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.data.clear();
    this.subscribers.clear();
    this.emit('disconnect');
  }

  /**
   * 设置键值
   */
  async set(key: string, value: any, ttl?: number): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const expiry = ttl ? Date.now() + (ttl * 1000) : undefined;
    this.data.set(key, { value, expiry });
    
    this.emit('set', key, value, ttl);
    return 'OK';
  }

  /**
   * 获取键值
   */
  async get(key: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const entry = this.data.get(key);
    
    if (!entry) {
      return null;
    }

    // 检查过期时间
    if (entry.expiry && Date.now() > entry.expiry) {
      this.data.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * 删除键
   */
  async del(key: string): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const deleted = this.data.delete(key);
    this.emit('del', key);
    return deleted ? 1 : 0;
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const entry = this.data.get(key);
    
    if (!entry) {
      return 0;
    }

    // 检查过期时间
    if (entry.expiry && Date.now() > entry.expiry) {
      this.data.delete(key);
      return 0;
    }

    return 1;
  }

  /**
   * 获取所有键
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const allKeys = Array.from(this.data.keys());
    
    // 简单的通配符匹配
    if (pattern === '*') {
      return allKeys;
    }

    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return allKeys.filter(key => regex.test(key));
  }

  /**
   * 发布消息
   */
  async publish(channel: string, message: any): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const subscribers = this.subscribers.get(channel);
    
    if (!subscribers || subscribers.size === 0) {
      return 0;
    }

    // 异步通知所有订阅者
    setImmediate(() => {
      for (const callback of subscribers) {
        try {
          callback(message);
        } catch (error) {
          this.emit('error', error);
        }
      }
    });

    this.emit('publish', channel, message);
    return subscribers.size;
  }

  /**
   * 订阅频道
   */
  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }

    this.subscribers.get(channel)!.add(callback);
    this.emit('subscribe', channel);
  }

  /**
   * 取消订阅
   */
  async unsubscribe(channel: string, callback?: (message: any) => void): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const subscribers = this.subscribers.get(channel);
    
    if (!subscribers) {
      return;
    }

    if (callback) {
      subscribers.delete(callback);
    } else {
      subscribers.clear();
    }

    if (subscribers.size === 0) {
      this.subscribers.delete(channel);
    }

    this.emit('unsubscribe', channel);
  }

  /**
   * 清空所有数据
   */
  async flushall(): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    this.data.clear();
    this.subscribers.clear();
    this.emit('flushall');
    return 'OK';
  }

  /**
   * 获取数据库大小
   */
  async dbsize(): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    return this.data.size;
  }

  /**
   * 获取内存使用情况
   */
  getMemoryUsage(): { keys: number; subscribers: number; totalChannels: number } {
    return {
      keys: this.data.size,
      subscribers: Array.from(this.subscribers.values()).reduce((total, subs) => total + subs.size, 0),
      totalChannels: this.subscribers.size
    };
  }
}

/**
 * Mock Pub/Sub模拟器
 */
export class MockPubSubEmulator extends EventEmitter {
  private topics: Map<string, Set<(message: any) => void>> = new Map();
  private messageHistory: Map<string, Array<{ message: any; timestamp: number; attributes?: any }>> = new Map();
  private isRunning = false;

  /**
   * 启动Pub/Sub模拟器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.emit('started');
  }

  /**
   * 停止Pub/Sub模拟器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.topics.clear();
    this.messageHistory.clear();
    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * 发布消息到主题
   */
  async publish(
    topicName: string, 
    data: any, 
    options?: { attributes?: Record<string, string> }
  ): Promise<string> {
    if (!this.isRunning) {
      throw new Error('PubSub emulator not running');
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 记录消息历史
    if (!this.messageHistory.has(topicName)) {
      this.messageHistory.set(topicName, []);
    }
    
    this.messageHistory.get(topicName)!.push({
      message: data,
      timestamp: Date.now(),
      attributes: options?.attributes
    });

    // 通知订阅者
    const subscribers = this.topics.get(topicName);
    if (subscribers) {
      setImmediate(() => {
        for (const callback of subscribers) {
          try {
            callback({ data, attributes: options?.attributes, messageId });
          } catch (error) {
            this.emit('error', error);
          }
        }
      });
    }

    this.emit('publish', topicName, data, options);
    return messageId;
  }

  /**
   * 订阅主题
   */
  async subscribe(
    topicName: string, 
    callback: (message: any) => void
  ): Promise<void> {
    if (!this.isRunning) {
      throw new Error('PubSub emulator not running');
    }

    if (!this.topics.has(topicName)) {
      this.topics.set(topicName, new Set());
    }

    this.topics.get(topicName)!.add(callback);
    this.emit('subscribe', topicName);
  }

  /**
   * 取消订阅
   */
  async unsubscribe(
    topicName: string, 
    callback?: (message: any) => void
  ): Promise<void> {
    if (!this.isRunning) {
      throw new Error('PubSub emulator not running');
    }

    const subscribers = this.topics.get(topicName);
    
    if (!subscribers) {
      return;
    }

    if (callback) {
      subscribers.delete(callback);
    } else {
      subscribers.clear();
    }

    if (subscribers.size === 0) {
      this.topics.delete(topicName);
    }

    this.emit('unsubscribe', topicName);
  }

  /**
   * 获取主题的消息历史
   */
  getMessageHistory(topicName: string, limit?: number): Array<{ message: any; timestamp: number; attributes?: any }> {
    const history = this.messageHistory.get(topicName) || [];
    
    if (limit) {
      return history.slice(-limit);
    }
    
    return [...history];
  }

  /**
   * 清空主题消息历史
   */
  clearMessageHistory(topicName?: string): void {
    if (topicName) {
      this.messageHistory.delete(topicName);
    } else {
      this.messageHistory.clear();
    }
  }

  /**
   * 获取所有主题
   */
  getTopics(): string[] {
    return Array.from(this.topics.keys());
  }

  /**
   * 获取主题统计
   */
  getTopicStats(topicName: string) {
    return {
      subscribers: this.topics.get(topicName)?.size || 0,
      messages: this.messageHistory.get(topicName)?.length || 0,
      exists: this.topics.has(topicName)
    };
  }

  /**
   * 获取所有统计信息
   */
  getAllStats() {
    const stats = {
      totalTopics: this.topics.size,
      totalSubscribers: 0,
      totalMessages: 0,
      topics: {} as Record<string, any>
    };

    for (const [topicName, subscribers] of this.topics.entries()) {
      const messages = this.messageHistory.get(topicName)?.length || 0;
      
      stats.totalSubscribers += subscribers.size;
      stats.totalMessages += messages;
      
      stats.topics[topicName] = {
        subscribers: subscribers.size,
        messages
      };
    }

    return stats;
  }
}

/**
 * Mock服务管理器
 */
export class MockServiceManager {
  private webSocketServer?: MockWebSocketServer;
  private redisService?: MockRedisService;
  private pubSubEmulator?: MockPubSubEmulator;

  /**
   * 启动所有Mock服务
   */
  async startAll(config: {
    webSocket?: { port: number };
    redis?: boolean;
    pubSub?: boolean;
  } = {}): Promise<void> {
    const promises: Promise<void>[] = [];

    if (config.webSocket) {
      this.webSocketServer = new MockWebSocketServer(config.webSocket.port);
      promises.push(this.webSocketServer.start());
    }

    if (config.redis) {
      this.redisService = new MockRedisService();
      promises.push(this.redisService.connect());
    }

    if (config.pubSub) {
      this.pubSubEmulator = new MockPubSubEmulator();
      promises.push(this.pubSubEmulator.start());
    }

    await Promise.all(promises);
  }

  /**
   * 停止所有Mock服务
   */
  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.webSocketServer) {
      promises.push(this.webSocketServer.stop());
    }

    if (this.redisService) {
      promises.push(this.redisService.disconnect());
    }

    if (this.pubSubEmulator) {
      promises.push(this.pubSubEmulator.stop());
    }

    await Promise.all(promises);

    this.webSocketServer = undefined;
    this.redisService = undefined;
    this.pubSubEmulator = undefined;
  }

  /**
   * 获取Mock服务实例
   */
  getServices() {
    return {
      webSocket: this.webSocketServer,
      redis: this.redisService,
      pubSub: this.pubSubEmulator
    };
  }
}

// 导出全局Mock服务管理器实例
export const mockServiceManager = new MockServiceManager();