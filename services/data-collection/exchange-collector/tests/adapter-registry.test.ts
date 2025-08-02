/**
 * AdapterRegistry 单元测试
 */

import { AdapterRegistry, AdapterRegistryConfig } from '../src/adapters/registry/adapter-registry';
import { BaseErrorHandler, BaseMonitor, PubSubClientImpl, globalCache } from '@pixiu/shared-core';
import { AdapterIntegration, IntegrationConfig } from '../src/adapters/base/adapter-integration';

// Mock classes
class MockAdapterIntegration extends AdapterIntegration {
  protected async createAdapter(_config: any): Promise<any> {
    return {
      initialize: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      destroy: jest.fn(),
      subscribe: jest.fn(),
      getStatus: jest.fn().mockReturnValue('connected'),
      on: jest.fn(),
      off: jest.fn()
    };
  }

  protected getExchangeName(): string {
    return 'test-exchange';
  }

  protected async startSubscriptions(): Promise<void> {
    // Mock implementation
  }
}

describe('AdapterRegistry', () => {
  let adapterRegistry: AdapterRegistry;
  let mockPubsubClient: jest.Mocked<PubSubClientImpl>;
  let mockMonitor: jest.Mocked<BaseMonitor>;
  let mockErrorHandler: jest.Mocked<BaseErrorHandler>;
  let mockConfig: AdapterRegistryConfig;

  beforeEach(() => {
    // Create mocked dependencies
    mockPubsubClient = {
      initialize: jest.fn(),
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

    mockConfig = {
      defaultConfig: {
        publishConfig: {
          topicPrefix: 'test',
          enableBatching: true,
          batchSize: 10,
          batchTimeout: 1000
        },
        monitoringConfig: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000
        }
      },
      autoStart: ['test-adapter'],
      monitoring: {
        enableHealthCheck: true,
        healthCheckInterval: 30000,
        enableMetrics: true,
        metricsInterval: 30000
      }
    };

    adapterRegistry = new AdapterRegistry();
  });

  afterEach(async () => {
    if (adapterRegistry) {
      await adapterRegistry.destroy();
    }
    globalCache.destroy();
  });

  describe('初始化', () => {
    it('应该能够初始化注册中心', async () => {
      await adapterRegistry.initialize(
        mockConfig,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );

      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Adapter registry initialized',
        expect.objectContaining({
          registeredAdapters: expect.any(Array),
          autoStartAdapters: mockConfig.autoStart
        })
      );
    });

    it('应该注册内置适配器', async () => {
      await adapterRegistry.initialize(
        mockConfig,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );

      const registeredAdapters = adapterRegistry.getRegisteredAdapters();
      expect(registeredAdapters).toContain('binance');
    });
  });

  describe('适配器注册', () => {
    beforeEach(async () => {
      await adapterRegistry.initialize(
        mockConfig,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );
    });

    it('应该能够注册新适配器', () => {
      const adapterName = 'test-adapter';
      const constructor = () => new MockAdapterIntegration();
      
      adapterRegistry.register(adapterName, constructor, {
        version: '1.0.0',
        description: 'Test adapter',
        supportedFeatures: ['test'],
        enabled: true
      });

      expect(adapterRegistry.hasAdapter(adapterName)).toBe(true);
      
      const entry = adapterRegistry.getRegistryEntry(adapterName);
      expect(entry).toMatchObject({
        version: '1.0.0',
        description: 'Test adapter',
        supportedFeatures: ['test'],
        enabled: true
      });
    });

    it('应该能够取消注册适配器', () => {
      const adapterName = 'test-adapter';
      const constructor = () => new MockAdapterIntegration();
      
      adapterRegistry.register(adapterName, constructor);
      expect(adapterRegistry.hasAdapter(adapterName)).toBe(true);
      
      adapterRegistry.unregister(adapterName);
      expect(adapterRegistry.hasAdapter(adapterName)).toBe(false);
    });

    it('应该能够启用/禁用适配器', () => {
      const adapterName = 'test-adapter';
      const constructor = () => new MockAdapterIntegration();
      
      adapterRegistry.register(adapterName, constructor, { enabled: true });
      expect(adapterRegistry.getRegistryEntry(adapterName)?.enabled).toBe(true);
      
      adapterRegistry.setAdapterEnabled(adapterName, false);
      expect(adapterRegistry.getRegistryEntry(adapterName)?.enabled).toBe(false);
    });
  });

  describe('实例管理', () => {
    beforeEach(async () => {
      await adapterRegistry.initialize(
        mockConfig,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );
      
      const constructor = () => new MockAdapterIntegration();
      adapterRegistry.register('test-adapter', constructor, { enabled: true });
    });

    it('应该能够创建适配器实例', async () => {
      const config: IntegrationConfig = {
        adapterConfig: { exchange: 'test' },
        publishConfig: {
          topicPrefix: 'test',
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

      const instance = await adapterRegistry.createInstance('test-adapter', config);
      expect(instance).toBeDefined();
      expect(adapterRegistry.getInstance('test-adapter')).toBe(instance);
    });

    it('创建不存在的适配器实例时应该抛出错误', async () => {
      const config: IntegrationConfig = {
        adapterConfig: { exchange: 'test' },
        publishConfig: {
          topicPrefix: 'test',
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

      await expect(
        adapterRegistry.createInstance('non-existent', config)
      ).rejects.toThrow('Adapter not found: non-existent');
    });

    it('创建已禁用适配器实例时应该抛出错误', async () => {
      adapterRegistry.setAdapterEnabled('test-adapter', false);
      
      const config: IntegrationConfig = {
        adapterConfig: { exchange: 'test' },
        publishConfig: {
          topicPrefix: 'test',
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

      await expect(
        adapterRegistry.createInstance('test-adapter', config)
      ).rejects.toThrow('Adapter is disabled: test-adapter');
    });

    it('应该能够启动适配器实例', async () => {
      const config: IntegrationConfig = {
        adapterConfig: { exchange: 'test' },
        publishConfig: {
          topicPrefix: 'test',
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

      await adapterRegistry.createInstance('test-adapter', config);
      await adapterRegistry.startInstance('test-adapter');

      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Adapter instance started',
        { name: 'test-adapter' }
      );
    });

    it('应该能够停止适配器实例', async () => {
      const config: IntegrationConfig = {
        adapterConfig: { exchange: 'test' },
        publishConfig: {
          topicPrefix: 'test',
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

      await adapterRegistry.createInstance('test-adapter', config);
      await adapterRegistry.startInstance('test-adapter');
      await adapterRegistry.stopInstance('test-adapter');

      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Adapter instance stopped',
        { name: 'test-adapter' }
      );
    });

    it('应该能够销毁适配器实例', async () => {
      const config: IntegrationConfig = {
        adapterConfig: { exchange: 'test' },
        publishConfig: {
          topicPrefix: 'test',
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

      await adapterRegistry.createInstance('test-adapter', config);
      await adapterRegistry.destroyInstance('test-adapter');

      expect(adapterRegistry.getInstance('test-adapter')).toBeUndefined();
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'Adapter instance destroyed',
        { name: 'test-adapter' }
      );
    });
  });

  describe('状态查询', () => {
    beforeEach(async () => {
      await adapterRegistry.initialize(
        mockConfig,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );
    });

    it('应该能够获取注册中心状态', () => {
      const status = adapterRegistry.getStatus();
      
      expect(status).toMatchObject({
        initialized: true,
        registeredAdapters: expect.any(Array),
        enabledAdapters: expect.any(Array),
        runningInstances: expect.any(Array),
        instanceStatuses: expect.any(Array)
      });
    });

    it('应该能够获取所有注册的适配器', () => {
      const adapters = adapterRegistry.getRegisteredAdapters();
      expect(Array.isArray(adapters)).toBe(true);
    });

    it('应该能够获取启用的适配器', () => {
      const enabledAdapters = adapterRegistry.getEnabledAdapters();
      expect(Array.isArray(enabledAdapters)).toBe(true);
    });
  });

  describe('自动启动', () => {
    beforeEach(async () => {
      await adapterRegistry.initialize(
        mockConfig,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );
    });

    it('应该能够启动自动启动的适配器', async () => {
      const constructor = () => new MockAdapterIntegration();
      adapterRegistry.register('test-adapter', constructor, { enabled: true });

      const configs = new Map<string, IntegrationConfig>();
      configs.set('test-adapter', {
        adapterConfig: { exchange: 'test' },
        publishConfig: {
          topicPrefix: 'test',
          enableBatching: false,
          batchSize: 1,
          batchTimeout: 1000
        },
        monitoringConfig: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000
        }
      });

      await adapterRegistry.startAutoAdapters(configs);
      
      expect(adapterRegistry.getInstance('test-adapter')).toBeDefined();
    });
  });

  describe('清理和销毁', () => {
    beforeEach(async () => {
      await adapterRegistry.initialize(
        mockConfig,
        mockPubsubClient,
        mockMonitor,
        mockErrorHandler
      );
    });

    it('应该能够停止所有实例', async () => {
      const constructor = () => new MockAdapterIntegration();
      adapterRegistry.register('test-adapter-1', constructor, { enabled: true });
      adapterRegistry.register('test-adapter-2', constructor, { enabled: true });

      const config: IntegrationConfig = {
        adapterConfig: { exchange: 'test' },
        publishConfig: {
          topicPrefix: 'test',
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

      await adapterRegistry.createInstance('test-adapter-1', config);
      await adapterRegistry.createInstance('test-adapter-2', config);
      await adapterRegistry.startInstance('test-adapter-1');
      await adapterRegistry.startInstance('test-adapter-2');

      await adapterRegistry.stopAllInstances();

      // 停止后应该销毁实例
      await adapterRegistry.destroyInstance('test-adapter-1');
      await adapterRegistry.destroyInstance('test-adapter-2');

      // 检查所有实例都已停止
      const status = adapterRegistry.getStatus();
      expect(status.runningInstances.length).toBe(0);
    });

    it('应该能够销毁注册中心', async () => {
      await adapterRegistry.destroy();
      
      const status = adapterRegistry.getStatus();
      expect(status.runningInstances.length).toBe(0);
    });
  });
});