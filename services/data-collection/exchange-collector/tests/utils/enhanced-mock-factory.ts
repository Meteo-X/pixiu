/**
 * 增强型Mock工厂
 * 为重构后的架构提供完整的Mock支持
 */

import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import {
  BaseAdapter,
  ConnectionManager,
  MarketData,
  AdapterStatus,
  ConnectionState,
  DataType
} from '@pixiu/adapter-base';
import { BaseMonitor } from '@pixiu/shared-core';

// 导入新架构类型
interface MockWebSocket extends EventEmitter {
  readyState: number;
  url: string;
  send: jest.MockedFunction<(data: string) => void>;
  close: jest.MockedFunction<(code?: number, reason?: string) => void>;
  ping: jest.MockedFunction<(data?: any) => void>;
  pong: jest.MockedFunction<(data?: any) => void>;
  terminate: jest.MockedFunction<() => void>;
}

interface MockDataFlow {
  processData: jest.MockedFunction<(data: MarketData, source?: string) => Promise<void>>;
  getStats: jest.MockedFunction<() => any>;
  registerChannel: jest.MockedFunction<(channel: any) => void>;
  start: jest.MockedFunction<() => void>;
  stop: jest.MockedFunction<() => Promise<void>>;
}

interface MockAdapter extends EventEmitter {
  getName: jest.MockedFunction<() => string>;
  getStatus: jest.MockedFunction<() => AdapterStatus>;
  initialize: jest.MockedFunction<(config: any) => Promise<void>>;
  start: jest.MockedFunction<() => Promise<void>>;
  stop: jest.MockedFunction<() => Promise<void>>;
  subscribe: jest.MockedFunction<(config: any) => Promise<void>>;
  unsubscribe: jest.MockedFunction<(symbol: string, type: DataType) => Promise<void>>;
}

interface MockConnectionManager extends EventEmitter {
  getState: jest.MockedFunction<() => ConnectionState>;
  connect: jest.MockedFunction<() => Promise<void>>;
  disconnect: jest.MockedFunction<() => Promise<void>>;
  isConnected: jest.MockedFunction<() => boolean>;
  send: jest.MockedFunction<(data: any) => Promise<void>>;
  setHeartbeatInterval: jest.MockedFunction<(interval: number) => void>;
}

interface MockWebSocketProxy extends EventEmitter {
  start: jest.MockedFunction<() => Promise<void>>;
  stop: jest.MockedFunction<() => Promise<void>>;
  getConnectionCount: jest.MockedFunction<() => number>;
  getStats: jest.MockedFunction<() => any>;
  broadcast: jest.MockedFunction<(data: any) => void>;
}

interface MockPerformanceMonitor {
  startTiming: jest.MockedFunction<(label: string) => void>;
  endTiming: jest.MockedFunction<(label: string) => number>;
  recordMetric: jest.MockedFunction<(name: string, value: number) => void>;
  getMetrics: jest.MockedFunction<() => Map<string, number>>;
  reset: jest.MockedFunction<() => void>;
}

/**
 * 增强型Mock工厂类
 */
export class EnhancedMockFactory {
  /**
   * 创建适配器Mock
   */
  static createAdapterMock(overrides: Partial<MockAdapter> = {}): MockAdapter {
    const mockAdapter = new EventEmitter() as MockAdapter;
    
    // 默认Mock实现
    mockAdapter.getName = jest.fn(() => 'MockAdapter');
    mockAdapter.getStatus = jest.fn(() => AdapterStatus.CONNECTED);
    mockAdapter.initialize = jest.fn(async () => {});
    mockAdapter.start = jest.fn(async () => {
      mockAdapter.emit('statusChanged', AdapterStatus.CONNECTED);
    });
    mockAdapter.stop = jest.fn(async () => {
      mockAdapter.emit('statusChanged', AdapterStatus.DISCONNECTED);
    });
    mockAdapter.subscribe = jest.fn(async () => {
      mockAdapter.emit('subscribed', { symbol: 'BTCUSDT', type: DataType.TICKER });
    });
    mockAdapter.unsubscribe = jest.fn(async () => {
      mockAdapter.emit('unsubscribed', { symbol: 'BTCUSDT', type: DataType.TICKER });
    });

    // 应用覆盖
    Object.assign(mockAdapter, overrides);
    
    return mockAdapter;
  }

  /**
   * 创建连接管理器Mock
   */
  static createConnectionManagerMock(overrides: Partial<MockConnectionManager> = {}): MockConnectionManager {
    const mockManager = new EventEmitter() as MockConnectionManager;
    
    let currentState = ConnectionState.DISCONNECTED;
    
    mockManager.getState = jest.fn(() => currentState);
    mockManager.connect = jest.fn(async () => {
      currentState = ConnectionState.CONNECTED;
      mockManager.emit('stateChanged', ConnectionState.CONNECTED);
    });
    mockManager.disconnect = jest.fn(async () => {
      currentState = ConnectionState.DISCONNECTED;
      mockManager.emit('stateChanged', ConnectionState.DISCONNECTED);
    });
    mockManager.isConnected = jest.fn(() => currentState === ConnectionState.CONNECTED);
    mockManager.send = jest.fn(async () => {});
    mockManager.setHeartbeatInterval = jest.fn(() => {});

    Object.assign(mockManager, overrides);
    
    return mockManager;
  }

  /**
   * 创建DataFlow Mock
   */
  static createDataFlowMock(overrides: Partial<MockDataFlow> = {}): MockDataFlow {
    const mockDataFlow: MockDataFlow = {
      processData: jest.fn(async () => {}),
      getStats: jest.fn(() => ({
        totalProcessed: 1000,
        totalSent: 995,
        totalErrors: 5,
        averageLatency: 15.5,
        currentQueueSize: 2,
        backpressureActive: false,
        activeChannels: 3,
        routingRules: 2,
        lastActivity: Date.now()
      })),
      registerChannel: jest.fn(() => {}),
      start: jest.fn(() => {}),
      stop: jest.fn(async () => {})
    };

    Object.assign(mockDataFlow, overrides);
    
    return mockDataFlow;
  }

  /**
   * 创建WebSocket Mock
   */
  static createWebSocketMock(overrides: Partial<MockWebSocket> = {}): MockWebSocket {
    const mockWs = new EventEmitter() as MockWebSocket;
    
    mockWs.readyState = 1; // WebSocket.OPEN
    mockWs.url = 'ws://localhost:8080';
    mockWs.send = jest.fn(() => {});
    mockWs.close = jest.fn((code, reason) => {
      mockWs.readyState = 3; // WebSocket.CLOSED
      mockWs.emit('close', code || 1000, reason || 'Normal closure');
    });
    mockWs.ping = jest.fn(() => {
      mockWs.emit('pong');
    });
    mockWs.pong = jest.fn(() => {});
    mockWs.terminate = jest.fn(() => {
      mockWs.readyState = 3;
      mockWs.emit('close', 1006, 'Connection terminated');
    });

    Object.assign(mockWs, overrides);
    
    return mockWs;
  }

  /**
   * 创建WebSocket代理Mock
   */
  static createWebSocketProxyMock(overrides: Partial<MockWebSocketProxy> = {}): MockWebSocketProxy {
    const mockProxy = new EventEmitter() as MockWebSocketProxy;
    
    let connectionCount = 0;
    
    mockProxy.start = jest.fn(async () => {
      mockProxy.emit('started');
    });
    mockProxy.stop = jest.fn(async () => {
      mockProxy.emit('stopped');
    });
    mockProxy.getConnectionCount = jest.fn(() => connectionCount);
    mockProxy.getStats = jest.fn(() => ({
      activeConnections: connectionCount,
      totalConnections: connectionCount + 10,
      messagesSent: 5000,
      messagesReceived: 100,
      averageLatency: 6.8,
      uptime: Date.now() - 3600000 // 1小时
    }));
    mockProxy.broadcast = jest.fn(() => {});

    // 模拟连接管理
    mockProxy.on = jest.fn((event, listener) => {
      if (event === 'connection') {
        // 模拟新连接
        setTimeout(() => {
          connectionCount++;
          const mockSocket = EnhancedMockFactory.createWebSocketMock();
          listener(mockSocket);
        }, 10);
      }
      return EventEmitter.prototype.on.call(mockProxy, event, listener);
    });

    Object.assign(mockProxy, overrides);
    
    return mockProxy;
  }

  /**
   * 创建性能监控Mock
   */
  static createPerformanceMonitorMock(overrides: Partial<MockPerformanceMonitor> = {}): MockPerformanceMonitor {
    const metrics = new Map<string, number>();
    const timings = new Map<string, number>();
    
    const mockMonitor: MockPerformanceMonitor = {
      startTiming: jest.fn((label: string) => {
        timings.set(label, Date.now());
      }),
      endTiming: jest.fn((label: string) => {
        const startTime = timings.get(label);
        if (startTime) {
          const duration = Date.now() - startTime;
          timings.delete(label);
          metrics.set(label, duration);
          return duration;
        }
        return 0;
      }),
      recordMetric: jest.fn((name: string, value: number) => {
        metrics.set(name, value);
      }),
      getMetrics: jest.fn(() => new Map(metrics)),
      reset: jest.fn(() => {
        metrics.clear();
        timings.clear();
      })
    };

    Object.assign(mockMonitor, overrides);
    
    return mockMonitor;
  }

  /**
   * 创建BaseMonitor Mock
   */
  static createBaseMonitorMock(): jest.Mocked<BaseMonitor> {
    return {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      startTiming: jest.fn(),
      endTiming: jest.fn(),
      recordMetric: jest.fn(),
      getMetrics: jest.fn(() => ({})),
      createChildMonitor: jest.fn(() => EnhancedMockFactory.createBaseMonitorMock())
    } as any;
  }

  /**
   * 创建市场数据Mock
   */
  static createMarketDataMock(overrides: Partial<MarketData> = {}): MarketData {
    const defaultData: MarketData = {
      exchange: 'binance',
      symbol: 'BTCUSDT',
      type: DataType.TICKER,
      timestamp: Date.now(),
      data: {
        symbol: 'BTCUSDT',
        price: '50000.00',
        volume: '1000.5',
        change: '2.5',
        changePercent: '0.05'
      }
    };

    return { ...defaultData, ...overrides };
  }

  /**
   * 批量创建市场数据
   */
  static createMarketDataBatch(count: number, baseOverrides: Partial<MarketData> = {}): MarketData[] {
    return Array.from({ length: count }, (_, index) => 
      this.createMarketDataMock({
        ...baseOverrides,
        timestamp: Date.now() - (count - index) * 1000,
        data: {
          ...baseOverrides.data,
          price: (50000 + index * 10).toString(),
          volume: (1000 + index * 5).toString()
        }
      })
    );
  }

  /**
   * 创建配置Mock
   */
  static createUnifiedConfigMock(overrides: any = {}): any {
    const defaultConfig = {
      server: {
        port: 3000,
        host: 'localhost'
      },
      adapters: {
        binance: {
          enabled: true,
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          wsUrl: 'wss://stream.binance.com:9443/ws'
        }
      },
      dataflow: {
        enabled: true,
        batching: {
          enabled: true,
          batchSize: 10,
          maxWaitTime: 100
        },
        performance: {
          enableBackpressure: true,
          backpressureThreshold: 1000,
          maxQueueSize: 10000
        },
        monitoring: {
          enableMetrics: true,
          metricsInterval: 5000
        }
      },
      websocket: {
        server: {
          port: 8080,
          host: '0.0.0.0'
        },
        proxy: {
          enabled: true,
          targetUrl: 'ws://localhost:3001'
        },
        subscription: {
          maxSubscriptions: 100,
          enableFiltering: true
        }
      }
    };

    return { ...defaultConfig, ...overrides };
  }

  /**
   * 设置全局WebSocket Mock
   */
  static setupGlobalWebSocketMock(): MockWebSocket {
    const mockWs = this.createWebSocketMock();
    
    // Mock全局WebSocket构造函数
    const mockWebSocketConstructor = jest.fn(() => mockWs);
    (global as any).WebSocket = mockWebSocketConstructor;
    
    return mockWs;
  }

  /**
   * 清理所有Mock
   */
  static cleanup(): void {
    jest.clearAllMocks();
    jest.resetAllMocks();
    
    // 清理全局Mock
    if ((global as any).WebSocket && typeof (global as any).WebSocket.mockClear === 'function') {
      (global as any).WebSocket.mockClear();
    }
  }
}

// 导出类型定义供其他测试文件使用
export type {
  MockWebSocket,
  MockDataFlow,
  MockAdapter,
  MockConnectionManager,
  MockWebSocketProxy,
  MockPerformanceMonitor
};