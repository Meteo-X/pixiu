/**
 * BinanceIntegration 单元测试
 */

import { BinanceIntegration } from '../src/adapters/binance/integration';
import { BaseErrorHandler, BaseMonitor, PubSubClientImpl, globalCache } from '@pixiu/shared-core';
import { BinanceAdapter } from '@pixiu/binance-adapter';
import { IntegrationConfig } from '../src/adapters/base/adapter-integration';

// Mock BinanceAdapter
jest.mock('@pixiu/binance-adapter');

describe('BinanceIntegration', () => {
  let integration: BinanceIntegration;
  let mockPubsubClient: jest.Mocked<PubSubClientImpl>;
  let mockMonitor: jest.Mocked<BaseMonitor>;
  let mockErrorHandler: jest.Mocked<BaseErrorHandler>;
  let mockAdapter: jest.Mocked<BinanceAdapter>;
  let config: IntegrationConfig;

  beforeEach(() => {
    // Create mocked dependencies
    mockPubsubClient = {
      publish: jest.fn(),
      publishBatch: jest.fn(),
      close: jest.fn()
    } as any;

    mockMonitor = {
      log: jest.fn(),
      registerHealthCheck: jest.fn(),
      registerMetric: jest.fn(),
      updateMetric: jest.fn(),
      observeHistogram: jest.fn()
    } as any;

    mockErrorHandler = {
      handleError: jest.fn()
    } as any;

    // Mock BinanceAdapter
    mockAdapter = {
      initialize: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      destroy: jest.fn(),
      subscribe: jest.fn(),
      getStatus: jest.fn().mockReturnValue('connected'),
      on: jest.fn(),
      off: jest.fn()
    } as any;

    (BinanceAdapter as jest.MockedClass<typeof BinanceAdapter>).mockImplementation(() => mockAdapter);

    config = {
      adapterConfig: {
        exchange: 'binance',
        endpoints: {
          ws: 'wss://stream.binance.com:9443/ws',
          rest: 'https://api.binance.com/api'
        },
        subscription: {
          symbols: ['BTCUSDT', 'ETHUSDT'],
          dataTypes: ['trade', 'ticker']
        }
      },
      publishConfig: {
        topicPrefix: 'market-data',
        enableBatching: true,
        batchSize: 100,
        batchTimeout: 1000
      },
      monitoringConfig: {
        enableMetrics: true,
        enableHealthCheck: true,
        metricsInterval: 30000
      }
    };

    integration = new BinanceIntegration();
  });

  afterEach(async () => {
    if (integration) {
      await integration.destroy();
    }
    globalCache.destroy();
    jest.clearAllMocks();
  });

  describe('初始化', () => {
    it('应该能够初始化 Binance 集成', async () => {
      await integration.initialize(
        config,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );

      expect(BinanceAdapter).toHaveBeenCalled();
      expect(mockAdapter.initialize).toHaveBeenCalledWith(config.adapterConfig);
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Adapter integration initialized',
        expect.objectContaining({
          exchange: 'binance',
          config
        })
      );
    });

    it('初始化失败时应该抛出错误', async () => {
      mockAdapter.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(
        integration.initialize(config, mockPubsubClient, mockMonitor, mockErrorHandler)
      ).rejects.toThrow('Init failed');
    });
  });

  describe('启动和停止', () => {
    beforeEach(async () => {
      await integration.initialize(
        config,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );
    });

    it('应该能够启动集成', async () => {
      await integration.start();

      expect(mockAdapter.connect).toHaveBeenCalled();
      expect(mockAdapter.subscribe).toHaveBeenCalledTimes(4); // 2 symbols * 2 dataTypes
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Adapter integration started',
        { exchange: 'binance' }
      );
    });

    it('应该正确订阅所有配置的数据类型', async () => {
      await integration.start();

      // 验证所有订阅调用
      expect(mockAdapter.subscribe).toHaveBeenCalledWith({
        symbols: ['BTCUSDT'],
        dataTypes: ['trade']
      });
      expect(mockAdapter.subscribe).toHaveBeenCalledWith({
        symbols: ['BTCUSDT'],
        dataTypes: ['ticker']
      });
      expect(mockAdapter.subscribe).toHaveBeenCalledWith({
        symbols: ['ETHUSDT'],
        dataTypes: ['trade']
      });
      expect(mockAdapter.subscribe).toHaveBeenCalledWith({
        symbols: ['ETHUSDT'],
        dataTypes: ['ticker']
      });

      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Binance subscriptions started',
        {
          symbols: ['BTCUSDT', 'ETHUSDT'],
          dataTypes: ['trade', 'ticker'],
          totalSubscriptions: 4
        }
      );
    });

    it('缺少订阅配置时应该抛出错误', async () => {
      const invalidConfig = {
        ...config,
        adapterConfig: {
          ...config.adapterConfig,
          subscription: undefined
        }
      };

      await integration.initialize(
        invalidConfig,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );

      await expect(integration.start()).rejects.toThrow('No subscription configuration found');
    });

    it('应该能够停止集成', async () => {
      await integration.start();
      await integration.stop();

      expect(mockAdapter.disconnect).toHaveBeenCalled();
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Adapter integration stopped',
        { exchange: 'binance' }
      );
    });

    it('未初始化时启动应该抛出错误', async () => {
      const uninitializedIntegration = new BinanceIntegration();
      
      await expect(uninitializedIntegration.start()).rejects.toThrow('Integration not initialized');
    });

    it('重复启动不应该造成问题', async () => {
      await integration.start();
      await integration.start(); // 第二次启动应该直接返回
      
      // connect 只应该被调用一次
      expect(mockAdapter.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('状态和健康检查', () => {
    beforeEach(async () => {
      await integration.initialize(
        config,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );
    });

    it('应该返回正确的适配器状态', () => {
      const status = integration.getAdapterStatus();
      expect(status).toBe('connected');
      expect(mockAdapter.getStatus).toHaveBeenCalled();
    });

    it('应该返回集成指标', () => {
      const metrics = integration.getMetrics();
      
      expect(metrics).toMatchObject({
        adapterStatus: expect.any(String),
        messagesProcessed: expect.any(Number),
        messagesPublished: expect.any(Number),
        processingErrors: expect.any(Number),
        publishErrors: expect.any(Number),
        averageProcessingLatency: expect.any(Number),
        dataQualityScore: expect.any(Number),
        lastActivity: expect.any(Number)
      });
    });

    it('运行中的健康实例应该返回 true', async () => {
      await integration.start();
      
      // Mock 最近活动
      const integration_any = integration as any;
      integration_any.metrics.lastActivity = Date.now();
      
      expect(integration.isHealthy()).toBe(true);
    });

    it('停止的实例应该返回 false', () => {
      expect(integration.isHealthy()).toBe(false);
    });
  });

  describe('交易所名称', () => {
    it('应该返回正确的交易所名称', () => {
      const integration_any = integration as any;
      expect(integration_any.getExchangeName()).toBe('binance');
    });
  });

  describe('清理和销毁', () => {
    beforeEach(async () => {
      await integration.initialize(
        config,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );
    });

    it('应该能够销毁集成', async () => {
      await integration.start();
      await integration.destroy();

      expect(mockAdapter.disconnect).toHaveBeenCalled();
      expect(mockAdapter.destroy).toHaveBeenCalled();
    });

    it('销毁未启动的集成不应该造成问题', async () => {
      await expect(integration.destroy()).resolves.not.toThrow();
    });
  });
});