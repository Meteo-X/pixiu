/**
 * Mock工厂类
 * 为测试提供标准化的Mock对象
 */

import { EventEmitter } from 'events';

export class MockFactory {
  /**
   * 创建模拟的BinanceAdapter
   */
  static createBinanceAdapter(overrides: Partial<any> = {}): jest.Mocked<any> {
    const baseAdapter = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue('connected'),
      getName: jest.fn().mockReturnValue('binance'),
      parseMessage: jest.fn().mockImplementation((message) => ({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'kline',
        timestamp: Date.now(),
        data: JSON.parse(message).data
      })),
      
      // EventEmitter方法
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
      
      // 配置和状态
      config: {
        exchange: 'binance',
        connection: { timeout: 10000 }
      },
      
      ...overrides
    };

    // 使基本的事件功能工作
    const eventEmitter = new EventEmitter();
    baseAdapter.on = eventEmitter.on.bind(eventEmitter);
    baseAdapter.off = eventEmitter.off.bind(eventEmitter);
    baseAdapter.emit = eventEmitter.emit.bind(eventEmitter);
    baseAdapter.removeAllListeners = eventEmitter.removeAllListeners.bind(eventEmitter);

    return baseAdapter as jest.Mocked<any>;
  }

  /**
   * 创建模拟的WebSocket连接
   */
  static createWebSocketConnection(overrides: Partial<any> = {}): jest.Mocked<any> {
    const mockWs = {
      send: jest.fn(),
      close: jest.fn(),
      terminate: jest.fn(),
      ping: jest.fn(),
      pong: jest.fn(),
      
      // 状态属性
      readyState: 1, // WebSocket.OPEN
      url: 'wss://stream.binance.com:9443/ws',
      protocol: '',
      
      // 事件监听
      on: jest.fn(),
      off: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      
      // 模拟事件触发
      triggerEvent: (event: string, data?: any) => {
        const handlers = mockWs.on.mock.calls.filter(call => call[0] === event);
        handlers.forEach(([, handler]) => handler(data));
      },
      
      ...overrides
    };

    // 设置默认的事件处理逻辑
    mockWs.on.mockImplementation((event: string, handler: Function) => {
      // 存储事件处理器以便后续触发
      if (!mockWs._eventHandlers) {
        mockWs._eventHandlers = new Map();
      }
      
      if (!mockWs._eventHandlers.has(event)) {
        mockWs._eventHandlers.set(event, []);
      }
      
      mockWs._eventHandlers.get(event).push(handler);
      return mockWs;
    });

    return mockWs as jest.Mocked<any>;
  }

  /**
   * 创建模拟的Pub/Sub客户端
   */
  static createPubSubClient(overrides: Partial<any> = {}): jest.Mocked<any> {
    return {
      publish: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
      subscribe: jest.fn().mockResolvedValue({ name: 'test-subscription' }),
      createTopic: jest.fn().mockResolvedValue({ name: 'test-topic' }),
      deleteTopic: jest.fn().mockResolvedValue(undefined),
      createSubscription: jest.fn().mockResolvedValue({ name: 'test-subscription' }),
      deleteSubscription: jest.fn().mockResolvedValue(undefined),
      
      // 主题管理
      topic: jest.fn().mockImplementation((topicName: string) => ({
        name: topicName,
        publish: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
        subscription: jest.fn().mockImplementation((subName: string) => ({
          name: subName,
          on: jest.fn()
        }))
      })),
      
      // 连接状态
      isConnected: jest.fn().mockReturnValue(true),
      close: jest.fn().mockResolvedValue(undefined),
      
      ...overrides
    } as jest.Mocked<any>;
  }

  /**
   * 创建模拟的适配器注册表
   */
  static createAdapterRegistry(overrides: Partial<any> = {}): jest.Mocked<any> {
    const registry = {
      registerAdapter: jest.fn().mockResolvedValue(undefined),
      unregisterAdapter: jest.fn().mockResolvedValue(undefined),
      getAdapter: jest.fn().mockImplementation((name: string) => 
        this.createBinanceAdapter({ getName: () => name })
      ),
      getAllAdapters: jest.fn().mockReturnValue(new Map()),
      startAll: jest.fn().mockResolvedValue(undefined),
      stopAll: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
      
      // 状态和统计
      getStats: jest.fn().mockReturnValue({
        total: 0,
        connected: 0,
        errors: {
          adapters: {},
          connections: 0
        }
      }),
      
      // 事件处理
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      
      ...overrides
    };

    // 添加事件功能
    const eventEmitter = new EventEmitter();
    registry.on = eventEmitter.on.bind(eventEmitter);
    registry.off = eventEmitter.off.bind(eventEmitter);
    registry.emit = eventEmitter.emit.bind(eventEmitter);

    return registry as jest.Mocked<any>;
  }

  /**
   * 创建模拟的WebSocket服务器
   */
  static createWebSocketServer(overrides: Partial<any> = {}): jest.Mocked<any> {
    return {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      broadcast: jest.fn(),
      broadcastToSubscribers: jest.fn(),
      
      // 连接管理
      getConnections: jest.fn().mockReturnValue(new Map()),
      getConnectionCount: jest.fn().mockReturnValue(0),
      
      // 订阅管理
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getSubscriptions: jest.fn().mockReturnValue(new Map()),
      
      // 统计信息
      getStats: jest.fn().mockReturnValue({
        connections: 0,
        subscriptions: 0,
        messagesSent: 0,
        messagesReceived: 0
      }),
      
      // 健康检查
      healthCheck: jest.fn().mockReturnValue(true),
      
      ...overrides
    } as jest.Mocked<any>;
  }

  /**
   * 创建模拟的配置管理器
   */
  static createConfigManager(overrides: Partial<any> = {}): jest.Mocked<any> {
    return {
      loadConfig: jest.fn().mockResolvedValue({
        adapters: {
          binance: {
            exchange: 'binance',
            connection: { timeout: 10000 }
          }
        },
        pubsub: {
          projectId: 'test-project',
          keyFile: 'test-key.json'
        }
      }),
      
      validateConfig: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
      mergeConfigs: jest.fn().mockImplementation((...configs) => 
        Object.assign({}, ...configs)
      ),
      
      // 配置监听
      watchConfig: jest.fn(),
      onConfigChange: jest.fn(),
      
      ...overrides
    } as jest.Mocked<any>;
  }

  /**
   * 创建模拟的性能监控器
   */
  static createPerformanceMonitor(overrides: Partial<any> = {}): jest.Mocked<any> {
    return {
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
      
      // 指标收集
      recordMetric: jest.fn(),
      recordLatency: jest.fn(),
      recordThroughput: jest.fn(),
      recordMemoryUsage: jest.fn(),
      
      // 获取统计
      getMetrics: jest.fn().mockReturnValue({
        latency: { avg: 10, p95: 20, p99: 50 },
        throughput: { current: 1000, peak: 1500 },
        memory: { current: 100, peak: 150 },
        errors: { total: 0, rate: 0 }
      }),
      
      getHealthStatus: jest.fn().mockReturnValue({
        status: 'healthy',
        checks: {
          memory: 'ok',
          latency: 'ok',
          throughput: 'ok'
        }
      }),
      
      ...overrides
    } as jest.Mocked<any>;
  }

  /**
   * 创建模拟的Redis客户端
   */
  static createRedisClient(overrides: Partial<any> = {}): jest.Mocked<any> {
    const mockData = new Map<string, any>();
    
    return {
      get: jest.fn().mockImplementation((key: string) => 
        Promise.resolve(mockData.get(key) || null)
      ),
      set: jest.fn().mockImplementation((key: string, value: any, ...options: any[]) => {
        mockData.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn().mockImplementation((key: string) => {
        const existed = mockData.has(key);
        mockData.delete(key);
        return Promise.resolve(existed ? 1 : 0);
      }),
      
      // Hash操作
      hget: jest.fn(),
      hset: jest.fn(),
      hgetall: jest.fn().mockResolvedValue({}),
      hdel: jest.fn(),
      
      // List操作
      lpush: jest.fn().mockResolvedValue(1),
      rpush: jest.fn().mockResolvedValue(1),
      lpop: jest.fn().mockResolvedValue(null),
      rpop: jest.fn().mockResolvedValue(null),
      lrange: jest.fn().mockResolvedValue([]),
      
      // 发布订阅
      publish: jest.fn().mockResolvedValue(0),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      
      // 连接管理
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      
      // 事务
      multi: jest.fn().mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue([])
      })),
      
      // 清理测试数据的辅助方法
      _clearMockData: () => mockData.clear(),
      _getMockData: () => new Map(mockData),
      
      ...overrides
    } as jest.Mocked<any>;
  }

  /**
   * 创建测试环境
   */
  static createTestEnvironment() {
    return {
      pubsubClient: this.createPubSubClient(),
      redisClient: this.createRedisClient(),
      webSocketServer: this.createWebSocketServer(),
      adapterRegistry: this.createAdapterRegistry(),
      performanceMonitor: this.createPerformanceMonitor(),
      configManager: this.createConfigManager(),
      
      // 清理所有Mock
      cleanup: () => {
        jest.clearAllMocks();
      }
    };
  }

  /**
   * 创建带有预设响应的Mock
   */
  static createMockWithResponses<T>(responses: Partial<T>): jest.Mocked<T> {
    const mock = {} as jest.Mocked<T>;
    
    Object.keys(responses).forEach(key => {
      const value = (responses as any)[key];
      
      if (typeof value === 'function') {
        mock[key as keyof T] = jest.fn().mockImplementation(value);
      } else if (value instanceof Promise) {
        mock[key as keyof T] = jest.fn().mockResolvedValue(value);
      } else {
        mock[key as keyof T] = jest.fn().mockReturnValue(value);
      }
    });
    
    return mock;
  }

  /**
   * 创建延迟响应的Mock
   */
  static createDelayedMock<T>(
    originalMock: jest.Mocked<T>,
    delays: Partial<Record<keyof T, number>>
  ): jest.Mocked<T> {
    Object.keys(delays).forEach(key => {
      const originalFn = originalMock[key];
      const delay = delays[key] || 0;
      
      if (jest.isMockFunction(originalFn)) {
        originalMock[key] = jest.fn().mockImplementation(async (...args: any[]) => {
          await new Promise(resolve => setTimeout(resolve, delay));
          return originalFn(...args);
        });
      }
    });
    
    return originalMock;
  }

  /**
   * 创建错误响应的Mock
   */
  static createErrorMock<T>(
    originalMock: jest.Mocked<T>,
    errors: Partial<Record<keyof T, Error | string>>
  ): jest.Mocked<T> {
    Object.keys(errors).forEach(key => {
      const error = errors[key];
      const errorToThrow = typeof error === 'string' ? new Error(error) : error;
      
      originalMock[key] = jest.fn().mockRejectedValue(errorToThrow);
    });
    
    return originalMock;
  }
}