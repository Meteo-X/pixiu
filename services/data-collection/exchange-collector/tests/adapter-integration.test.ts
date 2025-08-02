/**
 * Exchange Collector适配器集成测试
 */

import { BinanceIntegration } from '../src/adapters';
import { globalCache } from '@pixiu/shared-core';
// 暂时注释掉跨项目导入，因为包依赖问题
// import { BaseMonitor, BaseErrorHandler, PubSubClientImpl } from '../../../infrastructure/shared-core/src';
// import { DataType } from '../../../infrastructure/adapter-base/src';

// 临时定义测试需要的枚举和接口
enum DataType {
  TRADE = 'trade',
  TICKER = 'ticker'
}

// Mock classes for testing
class MockBaseMonitor {
  log = jest.fn();
  registerHealthCheck = jest.fn();
  registerMetric = jest.fn();
  updateMetric = jest.fn();
  observeHistogram = jest.fn();
}

class MockBaseErrorHandler {
  handleError = jest.fn();
}

class MockPubSubClientImpl {
  publish = jest.fn();
  publishBatch = jest.fn();
  subscribe = jest.fn();
  close = jest.fn();
}

describe('Adapter Integration', () => {
  let integration: BinanceIntegration;
  let mockPubSubClient: jest.Mocked<MockPubSubClientImpl>;
  let mockMonitor: jest.Mocked<MockBaseMonitor>;
  let mockErrorHandler: jest.Mocked<MockBaseErrorHandler>;

  beforeEach(() => {
    // 创建模拟依赖
    mockPubSubClient = new MockPubSubClientImpl() as any;
    mockPubSubClient.publish.mockResolvedValue('mock-message-id');
    mockPubSubClient.publishBatch.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      failedMessageIds: [],
      publishTime: 100
    });
    mockPubSubClient.subscribe.mockResolvedValue(undefined);
    mockPubSubClient.close.mockResolvedValue(undefined);

    mockMonitor = new MockBaseMonitor() as any;
    
    mockErrorHandler = new MockBaseErrorHandler() as any;
    mockErrorHandler.handleError.mockResolvedValue({
      success: true,
      strategy: 'ignore',
      recoveryTime: 0
    });

    integration = new BinanceIntegration();
  });

  afterEach(async () => {
    if (integration) {
      await integration.destroy();
    }
  });

  describe('初始化和启动', () => {
    it('应该能够初始化集成', async () => {
      const config = {
        adapterConfig: {
          exchange: 'binance',
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          },
          connection: {
            timeout: 10000,
            maxRetries: 3,
            retryInterval: 5000,
            heartbeatInterval: 30000
          }
        },
        subscriptionConfig: {
          symbols: ['BTC/USDT'],
          dataTypes: [DataType.TRADE]
        },
        publishConfig: {
          topicPrefix: 'test-market-data',
          enableBatching: false,
          batchSize: 1,
          batchTimeout: 1000
        },
        monitoringConfig: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000
        }
      };

      await integration.initialize(
        config,
        mockPubSubClient as any,
        mockMonitor as any,
        mockErrorHandler as any
      );

      expect(mockMonitor.registerHealthCheck).toHaveBeenCalled();
      expect(mockMonitor.registerMetric).toHaveBeenCalled();
    });

    it('应该能够启动集成', async () => {
      const config = {
        adapterConfig: {
          exchange: 'binance',
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          },
          connection: {
            timeout: 10000,
            maxRetries: 3,
            retryInterval: 5000,
            heartbeatInterval: 30000
          }
        },
        subscriptionConfig: {
          symbols: ['BTC/USDT'],
          dataTypes: [DataType.TRADE]
        },
        publishConfig: {
          topicPrefix: 'test-market-data',
          enableBatching: false,
          batchSize: 1,
          batchTimeout: 1000
        },
        monitoringConfig: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000
        }
      };

      await integration.initialize(
        config,
        mockPubSubClient as any,
        mockMonitor as any,
        mockErrorHandler as any
      );

      // Mock适配器连接
      const mockAdapter = {
        connect: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockResolvedValue([{
          id: 'test-subscription',
          symbol: 'BTC/USDT',
          dataType: DataType.TRADE,
          subscribedAt: Date.now(),
          active: true
        }]),
        getStatus: jest.fn().mockReturnValue('connected'),
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn()
      };

      (integration as any).adapter = mockAdapter;

      await integration.start();

      expect(mockAdapter.connect).toHaveBeenCalled();
      expect(mockAdapter.subscribe).toHaveBeenCalledWith({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });
    });
  });

  describe('数据处理', () => {
    beforeEach(async () => {
      const config = {
        adapterConfig: {
          exchange: 'binance',
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          },
          connection: {
            timeout: 10000,
            maxRetries: 3,
            retryInterval: 5000,
            heartbeatInterval: 30000
          }
        },
        subscriptionConfig: {
          symbols: ['BTC/USDT'],
          dataTypes: [DataType.TRADE]
        },
        publishConfig: {
          topicPrefix: 'test-market-data',
          enableBatching: false,
          batchSize: 1,
          batchTimeout: 1000
        },
        monitoringConfig: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000
        }
      };

      await integration.initialize(
        config,
        mockPubSubClient as any,
        mockMonitor as any,
        mockErrorHandler as any
      );
    });

    it('应该能够处理和发布市场数据', async () => {
      const marketData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        type: DataType.TRADE
      });

      // 模拟数据处理
      await (integration as any).processMarketData(marketData);

      expect(mockPubSubClient.publish).toHaveBeenCalledWith(
        'test-market-data-market-data-binance',
        expect.objectContaining({
          exchange: 'binance',
          symbol: 'BTC/USDT',
          type: DataType.TRADE
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            exchange: 'binance',
            symbol: 'BTC/USDT',
            type: DataType.TRADE
          })
        })
      );
    });

    it('应该能够处理批量数据发布', async () => {
      // 配置为启用批处理
      const config = (integration as any).config;
      config.publishConfig.enableBatching = true;
      config.publishConfig.batchSize = 2;

      const marketData1 = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTC/USDT'
      });

      const marketData2 = createMockMarketData({
        exchange: 'binance',
        symbol: 'ETH/USDT'
      });

      // 添加数据到缓冲区
      await (integration as any).processMarketData(marketData1);
      await (integration as any).processMarketData(marketData2);

      expect(mockPubSubClient.publishBatch).toHaveBeenCalled();
    });
  });

  describe('健康检查', () => {
    beforeEach(async () => {
      const config = {
        adapterConfig: {
          exchange: 'binance',
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          },
          connection: {
            timeout: 10000,
            maxRetries: 3,
            retryInterval: 5000,
            heartbeatInterval: 30000
          }
        },
        subscriptionConfig: {
          symbols: ['BTC/USDT'],
          dataTypes: [DataType.TRADE]
        },
        publishConfig: {
          topicPrefix: 'test-market-data',
          enableBatching: false,
          batchSize: 1,
          batchTimeout: 1000
        },
        monitoringConfig: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000
        }
      };

      await integration.initialize(
        config,
        mockPubSubClient as any,
        mockMonitor as any,
        mockErrorHandler as any
      );
    });

    it('应该报告健康状态', () => {
      // Mock适配器状态
      const mockAdapter = {
        getStatus: jest.fn().mockReturnValue('connected')
      };
      (integration as any).adapter = mockAdapter;
      (integration as any).isRunning = true;
      (integration as any).metrics.lastActivity = Date.now();

      const isHealthy = integration.isHealthy();
      expect(isHealthy).toBe(true);
    });

    it('应该报告不健康状态', () => {
      // Mock适配器断开状态
      const mockAdapter = {
        getStatus: jest.fn().mockReturnValue('disconnected')
      };
      (integration as any).adapter = mockAdapter;
      (integration as any).isRunning = false;

      const isHealthy = integration.isHealthy();
      expect(isHealthy).toBe(false);
    });
  });

  describe('指标收集', () => {
    beforeEach(async () => {
      const config = {
        adapterConfig: {
          exchange: 'binance',
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          },
          connection: {
            timeout: 10000,
            maxRetries: 3,
            retryInterval: 5000,
            heartbeatInterval: 30000
          }
        },
        subscriptionConfig: {
          symbols: ['BTC/USDT'],
          dataTypes: [DataType.TRADE]
        },
        publishConfig: {
          topicPrefix: 'test-market-data',
          enableBatching: false,
          batchSize: 1,
          batchTimeout: 1000
        },
        monitoringConfig: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000
        }
      };

      await integration.initialize(
        config,
        mockPubSubClient as any,
        mockMonitor as any,
        mockErrorHandler as any
      );
    });

    it('应该收集处理指标', () => {
      const metrics = integration.getMetrics();

      expect(metrics).toMatchObject({
        messagesProcessed: expect.any(Number),
        messagesPublished: expect.any(Number),
        processingErrors: expect.any(Number),
        publishErrors: expect.any(Number),
        averageProcessingLatency: expect.any(Number),
        lastActivity: expect.any(Number)
      });
    });
  });
});

// 清理全局缓存以确保Jest正常退出
afterAll(() => {
  globalCache.destroy();
});

// 本地测试工具函数
function createMockMarketData(overrides = {}) {
  return {
    exchange: 'binance',
    symbol: 'BTC/USDT',
    type: 'trade',
    timestamp: Date.now(),
    data: {
      id: '12345',
      price: 50000,
      quantity: 0.1,
      side: 'buy'
    },
    receivedAt: Date.now(),
    ...overrides
  };
}