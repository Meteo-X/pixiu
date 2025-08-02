/**
 * 模拟适配器组件
 * 
 * 提供用于测试的模拟组件，包括模拟的连接管理器、数据源等
 */

import { EventEmitter } from 'events';
import { 
  ConnectionStats, 
  ConnectionState, 
  PerformanceStats, 
  AdapterStatus, 
  DataSubscription 
} from '../../../src/types';
import { LatencyType } from '../../../src/connector/LatencyMonitor';

/**
 * 模拟连接管理器
 */
export class MockConnectionManager extends EventEmitter {
  private connections: Map<string, MockConnection> = new Map();
  private subscriptions: DataSubscription[] = [];
  private isRunning = false;
  private simulationTimer: NodeJS.Timeout | null = null;

  constructor(private config: {
    connectionCount?: number;
    errorRate?: number;
    latencyRange?: [number, number];
    messageRate?: number;
  } = {}) {
    super();
    this.config = {
      connectionCount: 3,
      errorRate: 0.02, // 2% 错误率
      latencyRange: [20, 80],
      messageRate: 100, // 每秒100条消息
      ...config
    };
  }

  /**
   * 启动连接管理器
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // 创建模拟连接
    for (let i = 0; i < this.config.connectionCount!; i++) {
      const connection = new MockConnection(`mock-conn-${i}`, {
        errorRate: this.config.errorRate!,
        latencyRange: this.config.latencyRange!,
        messageRate: this.config.messageRate! / this.config.connectionCount!
      });
      
      this.connections.set(connection.getId(), connection);
      
      // 监听连接事件
      connection.on('message', (data) => {
        this.emit('data_received', {
          ...data,
          connectionId: connection.getId(),
          timestamp: Date.now()
        });
      });
      
      connection.on('error', (error) => {
        this.emit('error', {
          ...error,
          connectionId: connection.getId(),
          timestamp: Date.now()
        });
      });
      
      await connection.connect();
    }

    // 启动数据模拟
    this.startDataSimulation();
    
    this.emit('connected', {
      timestamp: Date.now(),
      connectionCount: this.connections.size
    });
  }

  /**
   * 停止连接管理器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }

    // 断开所有连接
    for (const connection of this.connections.values()) {
      await connection.disconnect();
    }
    
    this.connections.clear();
    this.subscriptions = [];
    
    this.emit('disconnected', {
      timestamp: Date.now(),
      reason: 'Manual stop'
    });
  }

  /**
   * 订阅数据流
   */
  async subscribe(subscriptions: DataSubscription[]): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Connection manager not running');
    }

    this.subscriptions.push(...subscriptions);
    
    // 为每个连接分配订阅
    const connectionsArray = Array.from(this.connections.values());
    subscriptions.forEach((subscription, index) => {
      const connection = connectionsArray[index % connectionsArray.length];
      connection.addSubscription(subscription);
    });

    this.emit('subscribed', {
      subscriptions,
      timestamp: Date.now()
    });
  }

  /**
   * 取消订阅
   */
  async unsubscribe(subscriptions: DataSubscription[]): Promise<void> {
    subscriptions.forEach(subscription => {
      const index = this.subscriptions.findIndex(s => 
        s.symbol === subscription.symbol && s.dataType === subscription.dataType
      );
      if (index !== -1) {
        this.subscriptions.splice(index, 1);
      }
    });

    // 从连接中移除订阅
    for (const connection of this.connections.values()) {
      subscriptions.forEach(subscription => {
        connection.removeSubscription(subscription);
      });
    }

    this.emit('unsubscribed', {
      subscriptions,
      timestamp: Date.now()
    });
  }

  /**
   * 获取连接统计
   */
  getConnectionStats(): ConnectionStats[] {
    return Array.from(this.connections.values()).map(conn => conn.getStats());
  }

  /**
   * 强制重连所有连接
   */
  async forceReconnectAll(): Promise<void> {
    const reconnectPromises = Array.from(this.connections.values()).map(async conn => {
      await conn.disconnect();
      await conn.connect();
    });
    
    await Promise.all(reconnectPromises);
  }

  /**
   * 模拟网络问题
   */
  simulateNetworkIssues(duration: number = 5000): void {
    this.connections.forEach(conn => {
      conn.simulateNetworkIssues(duration);
    });
  }

  /**
   * 模拟高延迟
   */
  simulateHighLatency(duration: number = 10000): void {
    this.connections.forEach(conn => {
      conn.simulateHighLatency(duration);
    });
  }

  /**
   * 启动数据模拟
   */
  private startDataSimulation(): void {
    this.simulationTimer = setInterval(() => {
      this.connections.forEach(conn => {
        conn.generateData();
      });
    }, 1000 / this.config.messageRate!);
  }
}

/**
 * 模拟单个连接
 */
export class MockConnection extends EventEmitter {
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private connectedAt: number = 0;
  private lastActivity: number = 0;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;
  private bytesReceived: number = 0;
  private latency: number = 0;
  private subscriptions: DataSubscription[] = [];
  private connectionAttempts: number = 0;
  private successfulConnections: number = 0;
  private lastError: Error | undefined;
  private networkIssuesUntil: number = 0;
  private highLatencyUntil: number = 0;

  constructor(
    private connectionId: string,
    private config: {
      errorRate: number;
      latencyRange: [number, number];
      messageRate: number;
    }
  ) {
    super();
  }

  /**
   * 连接
   */
  async connect(): Promise<void> {
    this.connectionAttempts++;
    
    // 模拟连接延迟
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    
    // 模拟连接失败
    if (this.networkIssuesUntil > Date.now() || Math.random() < this.config.errorRate) {
      this.lastError = new Error('Connection failed');
      this.state = ConnectionState.ERROR;
      this.emit('error', this.lastError);
      throw this.lastError;
    }

    this.state = ConnectionState.ACTIVE;
    this.connectedAt = Date.now();
    this.lastActivity = Date.now();
    this.successfulConnections++;
    this.lastError = undefined;
    
    this.emit('connected', {
      connectionId: this.connectionId,
      timestamp: Date.now()
    });
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.state = ConnectionState.DISCONNECTED;
    this.emit('disconnected', {
      connectionId: this.connectionId,
      timestamp: Date.now()
    });
  }

  /**
   * 添加订阅
   */
  addSubscription(subscription: DataSubscription): void {
    this.subscriptions.push(subscription);
  }

  /**
   * 移除订阅
   */
  removeSubscription(subscription: DataSubscription): void {
    const index = this.subscriptions.findIndex(s => 
      s.symbol === subscription.symbol && s.dataType === subscription.dataType
    );
    if (index !== -1) {
      this.subscriptions.splice(index, 1);
    }
  }

  /**
   * 生成模拟数据
   */
  generateData(): void {
    if (this.state !== ConnectionState.ACTIVE || this.subscriptions.length === 0) {
      return;
    }

    this.subscriptions.forEach(subscription => {
      // 模拟数据生成错误
      if (Math.random() < this.config.errorRate) {
        const error = new Error(`Data generation error for ${subscription.symbol}`);
        this.lastError = error;
        this.emit('error', error);
        return;
      }

      // 计算延迟
      let currentLatency = this.config.latencyRange[0] + 
        Math.random() * (this.config.latencyRange[1] - this.config.latencyRange[0]);
      
      // 模拟高延迟条件
      if (this.highLatencyUntil > Date.now()) {
        currentLatency *= 5;
      }
      
      this.latency = currentLatency;

      // 生成模拟数据
      const data = this.generateMockData(subscription);
      const messageSize = JSON.stringify(data).length;
      
      this.messagesReceived++;
      this.bytesReceived += messageSize;
      this.lastActivity = Date.now();

      this.emit('message', {
        streamName: `${subscription.symbol.toLowerCase()}@${subscription.dataType}`,
        dataType: subscription.dataType,
        data,
        latency: currentLatency,
        messageSize,
        timestamp: Date.now()
      });
    });
  }

  /**
   * 模拟网络问题
   */
  simulateNetworkIssues(duration: number): void {
    this.networkIssuesUntil = Date.now() + duration;
    this.state = ConnectionState.ERROR;
    this.lastError = new Error('Network issues detected');
  }

  /**
   * 模拟高延迟
   */
  simulateHighLatency(duration: number): void {
    this.highLatencyUntil = Date.now() + duration;
  }

  /**
   * 获取连接统计
   */
  getStats(): ConnectionStats {
    return {
      connectionId: this.connectionId,
      state: this.state,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      bytesReceived: this.bytesReceived,
      latency: this.latency,
      activeSubscriptions: this.subscriptions.length,
      connectionAttempts: this.connectionAttempts,
      successfulConnections: this.successfulConnections,
      lastError: this.lastError
    };
  }

  /**
   * 获取连接ID
   */
  getId(): string {
    return this.connectionId;
  }

  /**
   * 生成模拟市场数据
   */
  private generateMockData(subscription: DataSubscription): any {
    const baseData = {
      symbol: subscription.symbol,
      timestamp: Date.now()
    };

    switch (subscription.dataType) {
      case 'trade':
        return {
          ...baseData,
          price: (Math.random() * 50000 + 30000).toFixed(2),
          quantity: (Math.random() * 10).toFixed(6),
          side: Math.random() > 0.5 ? 'buy' : 'sell',
          tradeId: Math.floor(Math.random() * 1000000)
        };

      case 'ticker':
        return {
          ...baseData,
          priceChange: (Math.random() * 2000 - 1000).toFixed(2),
          priceChangePercent: (Math.random() * 10 - 5).toFixed(2),
          lastPrice: (Math.random() * 50000 + 30000).toFixed(2),
          volume: (Math.random() * 100000).toFixed(2),
          high: (Math.random() * 55000 + 30000).toFixed(2),
          low: (Math.random() * 45000 + 25000).toFixed(2)
        };

      case 'kline':
        return {
          ...baseData,
          interval: subscription.params?.interval || '1m',
          openTime: Date.now() - 60000,
          closeTime: Date.now(),
          open: (Math.random() * 50000 + 30000).toFixed(2),
          high: (Math.random() * 55000 + 30000).toFixed(2),
          low: (Math.random() * 45000 + 25000).toFixed(2),
          close: (Math.random() * 50000 + 30000).toFixed(2),
          volume: (Math.random() * 100000).toFixed(6)
        };

      case 'depth':
        return {
          ...baseData,
          lastUpdateId: Math.floor(Math.random() * 1000000),
          bids: Array.from({ length: 20 }, () => [
            (Math.random() * 50000 + 29000).toFixed(2),
            (Math.random() * 10).toFixed(6)
          ]),
          asks: Array.from({ length: 20 }, () => [
            (Math.random() * 50000 + 31000).toFixed(2),
            (Math.random() * 10).toFixed(6)
          ])
        };

      default:
        return baseData;
    }
  }
}

/**
 * 模拟PubSub服务
 */
export class MockPubSubService extends EventEmitter {
  private publishedMessages: Array<{
    topic: string;
    data: any;
    timestamp: number;
    messageId: string;
  }> = [];
  private subscriptionHandlers: Map<string, Function[]> = new Map();
  private config: {
    publishLatency: [number, number];
    errorRate: number;
    batchSize: number;
  };

  constructor(config: {
    publishLatency?: [number, number];
    errorRate?: number;
    batchSize?: number;
  } = {}) {
    super();
    this.config = {
      publishLatency: [5, 50],
      errorRate: 0.01,
      batchSize: 100,
      ...config
    };
  }

  /**
   * 发布消息
   */
  async publish(topic: string, data: any): Promise<string> {
    // 模拟发布延迟
    const latency = this.config.publishLatency[0] + 
      Math.random() * (this.config.publishLatency[1] - this.config.publishLatency[0]);
    
    await new Promise(resolve => setTimeout(resolve, latency));

    // 模拟发布错误
    if (Math.random() < this.config.errorRate) {
      const error = new Error(`Failed to publish to topic ${topic}`);
      this.emit('error', error);
      throw error;
    }

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const message = {
      topic,
      data,
      timestamp: Date.now(),
      messageId
    };

    this.publishedMessages.push(message);

    // 触发订阅处理器
    const handlers = this.subscriptionHandlers.get(topic) || [];
    handlers.forEach(handler => {
      setTimeout(() => handler(data), Math.random() * 10);
    });

    this.emit('message_published', {
      topic,
      messageId,
      latency,
      timestamp: Date.now()
    });

    return messageId;
  }

  /**
   * 批量发布消息
   */
  async publishBatch(messages: Array<{ topic: string; data: any }>): Promise<string[]> {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const messageIds: string[] = [];

    // 模拟批量处理延迟
    const batchLatency = Math.max(...this.config.publishLatency) * Math.min(messages.length, this.config.batchSize);
    await new Promise(resolve => setTimeout(resolve, batchLatency));

    for (const message of messages) {
      try {
        const messageId = await this.publish(message.topic, message.data);
        messageIds.push(messageId);
      } catch (error) {
        // 记录失败但继续处理其他消息
        this.emit('batch_item_failed', {
          batchId,
          topic: message.topic,
          error: error.message
        });
      }
    }

    this.emit('batch_published', {
      batchId,
      messageCount: messageIds.length,
      failedCount: messages.length - messageIds.length,
      latency: batchLatency,
      timestamp: Date.now()
    });

    return messageIds;
  }

  /**
   * 订阅主题
   */
  subscribe(topic: string, handler: Function): void {
    if (!this.subscriptionHandlers.has(topic)) {
      this.subscriptionHandlers.set(topic, []);
    }
    this.subscriptionHandlers.get(topic)!.push(handler);

    this.emit('subscribed', {
      topic,
      timestamp: Date.now()
    });
  }

  /**
   * 取消订阅
   */
  unsubscribe(topic: string, handler: Function): void {
    const handlers = this.subscriptionHandlers.get(topic);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.subscriptionHandlers.delete(topic);
      }
    }

    this.emit('unsubscribed', {
      topic,
      timestamp: Date.now()
    });
  }

  /**
   * 获取发布统计
   */
  getPublishStats(): {
    totalMessages: number;
    messagesByTopic: Record<string, number>;
    recentMessages: any[];
    averageLatency: number;
  } {
    const messagesByTopic: Record<string, number> = {};
    let totalLatency = 0;

    this.publishedMessages.forEach(msg => {
      messagesByTopic[msg.topic] = (messagesByTopic[msg.topic] || 0) + 1;
    });

    // 计算平均延迟（基于配置）
    const avgLatency = (this.config.publishLatency[0] + this.config.publishLatency[1]) / 2;

    return {
      totalMessages: this.publishedMessages.length,
      messagesByTopic,
      recentMessages: this.publishedMessages.slice(-10),
      averageLatency: avgLatency
    };
  }

  /**
   * 清理历史消息
   */
  cleanup(maxAge: number = 3600000): void {
    const cutoff = Date.now() - maxAge;
    this.publishedMessages = this.publishedMessages.filter(msg => msg.timestamp > cutoff);
  }

  /**
   * 重置服务
   */
  reset(): void {
    this.publishedMessages = [];
    this.subscriptionHandlers.clear();
  }

  /**
   * 模拟服务故障
   */
  simulateServiceFailure(duration: number = 5000): void {
    const originalErrorRate = this.config.errorRate;
    this.config.errorRate = 1.0; // 100% 错误率

    setTimeout(() => {
      this.config.errorRate = originalErrorRate;
      this.emit('service_recovered', {
        duration,
        timestamp: Date.now()
      });
    }, duration);

    this.emit('service_failure', {
      duration,
      timestamp: Date.now()
    });
  }
}

/**
 * 模拟适配器配置
 */
export function createMockAdapterConfig(overrides: any = {}) {
  return {
    wsEndpoint: 'wss://mock.binance.com/ws',
    connection: {
      maxConnections: 3,
      maxSubscriptionsPerConnection: 200,
      pingInterval: 180000,
      pingTimeout: 10000,
      reconnectDelay: 1000,
      maxReconnectAttempts: 5
    },
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    },
    pubsub: {
      topicPrefix: 'test-binance',
      projectId: 'test-project',
      enableBatching: true,
      batchSize: 100
    },
    ...overrides
  };
}

/**
 * 模拟性能统计
 */
export function createMockPerformanceStats(scenario: 'normal' | 'degraded' | 'critical' = 'normal'): PerformanceStats {
  const scenarios = {
    normal: {
      latencyBase: 50,
      latencyVariance: 20,
      processingBase: 5,
      processingVariance: 3,
      messagesPerSecond: 1000
    },
    degraded: {
      latencyBase: 150,
      latencyVariance: 50,
      processingBase: 15,
      processingVariance: 8,
      messagesPerSecond: 400
    },
    critical: {
      latencyBase: 500,
      latencyVariance: 200,
      processingBase: 50,
      processingVariance: 25,
      messagesPerSecond: 100
    }
  };

  const config = scenarios[scenario];
  
  return {
    latency: {
      current: config.latencyBase + Math.random() * config.latencyVariance,
      average: config.latencyBase,
      min: config.latencyBase - config.latencyVariance / 2,
      max: config.latencyBase + config.latencyVariance,
      p50: config.latencyBase,
      p90: config.latencyBase + config.latencyVariance * 0.7,
      p95: config.latencyBase + config.latencyVariance * 0.8,
      p99: config.latencyBase + config.latencyVariance * 0.9
    },
    processingTime: {
      average: config.processingBase,
      p95: config.processingBase + config.processingVariance * 0.8,
      p99: config.processingBase + config.processingVariance
    },
    messagesPerSecond: config.messagesPerSecond + Math.random() * 100
  };
}