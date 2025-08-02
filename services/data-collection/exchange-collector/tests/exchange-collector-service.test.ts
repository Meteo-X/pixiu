/**
 * ExchangeCollectorService 单元测试
 */

import ExchangeCollectorService from '../src/index';
import { configManager } from '../src/config/service-config';
import { globalCache } from '@pixiu/shared-core';

// Mock dependencies
jest.mock('../src/config/service-config');
jest.mock('@pixiu/shared-core');

describe('ExchangeCollectorService', () => {
  let service: ExchangeCollectorService;
  
  const mockConfig = {
    name: 'exchange-collector',
    version: '1.0.0',
    environment: 'test',
    server: {
      port: 8080,
      host: '0.0.0.0',
      enableCors: true
    },
    adapters: {
      binance: {
        enabled: true,
        config: {
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
        subscription: {
          symbols: ['BTCUSDT'],
          dataTypes: ['trade', 'ticker']
        }
      }
    },
    pubsub: {
      projectId: 'test-project',
      useEmulator: true,
      emulatorHost: 'localhost:8085',
      topicPrefix: 'market-data',
      publishSettings: {
        enableBatching: true,
        batchSize: 100,
        batchTimeout: 1000,
        enableMessageOrdering: false,
        retrySettings: {
          maxRetries: 3,
          initialRetryDelay: 1000,
          maxRetryDelay: 60000
        }
      }
    },
    monitoring: {
      enableMetrics: true,
      enableHealthCheck: true,
      metricsInterval: 30000,
      healthCheckInterval: 30000,
      prometheus: {
        enabled: true,
        port: 9090,
        path: '/metrics'
      }
    },
    logging: {
      level: 'info' as const,
      format: 'json' as const,
      output: 'console' as const
    }
  };

  beforeEach(() => {
    // Mock configManager
    (configManager.load as jest.Mock).mockResolvedValue(undefined);
    (configManager.getConfig as jest.Mock).mockReturnValue(mockConfig);
    (configManager.getEnabledAdapters as jest.Mock).mockReturnValue(['binance']);

    service = new ExchangeCollectorService();
  });

  afterEach(async () => {
    if (service) {
      try {
        await service.stop();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    globalCache.destroy();
    jest.clearAllMocks();
  });

  describe('初始化', () => {
    it('应该能够成功初始化服务', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
      
      expect(configManager.load).toHaveBeenCalled();
      expect(configManager.getConfig).toHaveBeenCalled();
      expect(configManager.getEnabledAdapters).toHaveBeenCalled();
    });

    it('配置加载失败时应该抛出错误', async () => {
      (configManager.getConfig as jest.Mock).mockReturnValue(null);
      
      await expect(service.initialize()).rejects.toThrow('Failed to load configuration');
    });

    it('应该正确初始化所有组件', async () => {
      await service.initialize();
      
      // 验证各组件初始化调用
      expect(configManager.load).toHaveBeenCalled();
    });
  });

  describe('启动和停止', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('应该能够启动服务', async () => {
      // 由于我们无法直接mock Express app，这个测试主要验证方法不抛错误
      await expect(service.start()).resolves.not.toThrow();
    });

    it('应该能够停止服务', async () => {
      await expect(service.stop()).resolves.not.toThrow();
    });

    it('重复停止不应该造成问题', async () => {
      await service.stop();
      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('错误处理', () => {
    it('初始化失败时应该正确处理错误', async () => {
      (configManager.load as jest.Mock).mockRejectedValue(new Error('Config load failed'));
      
      await expect(service.initialize()).rejects.toThrow('Config load failed');
    });

    it('应该设置进程信号处理器', () => {
      // 验证优雅关闭设置
      const processOn = jest.spyOn(process, 'on');
      
      new ExchangeCollectorService();
      
      expect(processOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOn).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOn).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      
      processOn.mockRestore();
    });
  });
});