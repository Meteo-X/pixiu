/**
 * Task 3.1 适配器注册系统 - 组件集成测试
 * 
 * 测试各组件之间的集成和交互：
 * - AdapterRegistry与依赖组件的集成
 * - ExchangeCollectorService与AdapterRegistry的集成
 * - 配置管理器与注册中心的集成
 * - 监控和错误处理的集成
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { globalCache, BaseErrorHandler, BaseMonitor, PubSubClientImpl } from '@pixiu/shared-core';

import { AdapterRegistry } from '../../../../src/adapters/registry/adapter-registry';
import { configManager } from '../../../../src/config/service-config';
import { 
  TestEnvironment,
  MockAdapterIntegration,
  createMockAdapterIntegration,
  testUtils
} from '../../fixtures/helpers/test-helpers';
import { 
  testIntegrationConfigs,
  testRegistryEntries,
  testMarketData
} from '../../fixtures/test-data/adapter-configs';

describe('Task 3.1 适配器注册系统 - 组件集成测试', () => {
  let testEnv: TestEnvironment;
  let adapterRegistry: AdapterRegistry;
  let pubsubClient: PubSubClientImpl;
  let monitor: BaseMonitor;
  let errorHandler: BaseErrorHandler;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup('test-config.yaml');
    
    // 初始化依赖组件
    const config = configManager.getConfig()!;
    
    monitor = new BaseMonitor({
      metrics: {
        enabled: config.monitoring.enableMetrics,
        endpoint: '0.0.0.0',
        port: config.monitoring.prometheus.port,
        path: config.monitoring.prometheus.path,
        labels: { service: 'test-exchange-collector' }
      },
      healthCheck: {
        enabled: config.monitoring.enableHealthCheck,
        endpoint: '0.0.0.0',
        port: config.server.port,
        path: '/health',
        interval: config.monitoring.healthCheckInterval
      },
      logging: {
        level: config.logging.level,
        format: config.logging.format,
        output: config.logging.output
      }
    });

    errorHandler = new BaseErrorHandler({
      enableAutoRetry: true,
      defaultMaxRetries: 3,
      retryInterval: 1000,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      enableLogging: true
    });

    pubsubClient = new PubSubClientImpl({
      projectId: config.pubsub.projectId,
      emulatorHost: config.pubsub.useEmulator ? config.pubsub.emulatorHost : undefined,
      ...config.pubsub.publishSettings
    });

    // 初始化适配器注册中心
    adapterRegistry = new AdapterRegistry();
  });

  afterAll(async () => {
    if (adapterRegistry) {
      await adapterRegistry.destroy();
    }
    if (pubsubClient) {
      await pubsubClient.close();
    }
    await testEnv.cleanup();
    globalCache.destroy();
  });

  describe('AdapterRegistry与依赖组件集成', () => {
    it('应该成功初始化并集成所有依赖组件', async () => {
      const registryConfig = {
        defaultConfig: {
          publishConfig: {
            topicPrefix: 'test-market-data',
            enableBatching: false,
            batchSize: 10,
            batchTimeout: 500
          },
          monitoringConfig: {
            enableMetrics: true,
            enableHealthCheck: true,
            metricsInterval: 5000
          }
        },
        autoStart: [],
        monitoring: {
          enableHealthCheck: true,
          healthCheckInterval: 5000,
          enableMetrics: true,
          metricsInterval: 5000
        }
      };

      await adapterRegistry.initialize(
        registryConfig,
        pubsubClient,
        monitor,
        errorHandler
      );

      // 验证初始化状态
      const status = adapterRegistry.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.registeredAdapters).toContain('binance');
      expect(status.enabledAdapters).toContain('binance');
    });

    it('应该正确集成监控组件', async () => {
      // 注册自定义适配器用于测试
      adapterRegistry.register('mock', createMockAdapterIntegration, testRegistryEntries.mock);

      // 创建适配器实例
      const instance = await adapterRegistry.createInstance('mock', testIntegrationConfigs.mockIntegration);
      expect(instance).toBeDefined();

      // 启动实例
      await adapterRegistry.startInstance('mock');

      // 验证监控集成
      const status = adapterRegistry.getStatus();
      const mockInstance = status.instanceStatuses.find(s => s.name === 'mock');
      expect(mockInstance).toBeDefined();
      expect(mockInstance!.healthy).toBe(true);
      expect(mockInstance!.metrics).toBeDefined();

      // 清理
      await adapterRegistry.stopInstance('mock');
      await adapterRegistry.destroyInstance('mock');
    });

    it('应该正确集成错误处理组件', async () => {
      let errorHandled = false;
      const originalHandleError = errorHandler.handleError;
      
      // 监听错误处理
      errorHandler.handleError = async (error: Error, context?: any) => {
        errorHandled = true;
        return originalHandleError.call(errorHandler, error, context);
      };

      // 注册测试适配器
      adapterRegistry.register('error-test', () => {
        const mockIntegration = createMockAdapterIntegration() as MockAdapterIntegration;
        
        // 模拟初始化时出错
        const originalInitialize = mockIntegration.initialize;
        mockIntegration.initialize = async (...args) => {
          await originalInitialize.apply(mockIntegration, args);
          // 模拟错误
          setTimeout(() => {
            mockIntegration.simulateError(new Error('Test error'));
          }, 100);
        };
        
        return mockIntegration;
      }, testRegistryEntries.mock);

      // 创建并启动实例
      const instance = await adapterRegistry.createInstance('error-test', testIntegrationConfigs.mockIntegration);
      await adapterRegistry.startInstance('error-test');

      // 等待错误被触发和处理
      await testUtils.sleep(200);

      // 验证错误被正确处理
      expect(errorHandled).toBe(true);

      // 恢复原始方法
      errorHandler.handleError = originalHandleError;

      // 清理
      await adapterRegistry.stopInstance('error-test');
      await adapterRegistry.destroyInstance('error-test');
    });

    it('应该正确集成Pub/Sub客户端', async () => {
      // 注册测试适配器
      adapterRegistry.register('pubsub-test', createMockAdapterIntegration, testRegistryEntries.mock);

      // 创建并启动实例
      const instance = await adapterRegistry.createInstance('pubsub-test', testIntegrationConfigs.mockIntegration);
      await adapterRegistry.startInstance('pubsub-test');

      // 模拟数据处理
      const mockInstance = instance as MockAdapterIntegration;
      mockInstance.simulateData(testMarketData.validTradeData);

      // 等待数据处理
      await testUtils.sleep(500);

      // 验证实例指标更新
      const metrics = instance.getMetrics();
      expect(metrics.messagesProcessed).toBeGreaterThan(0);

      // 清理
      await adapterRegistry.stopInstance('pubsub-test');
      await adapterRegistry.destroyInstance('pubsub-test');
    });
  });

  describe('配置管理器与注册中心集成', () => {
    it('应该从配置管理器正确加载适配器配置', async () => {
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config!.adapters).toHaveProperty('binance');

      const binanceConfig = configManager.getAdapterConfig('binance');
      expect(binanceConfig).toBeDefined();
      expect(binanceConfig!.enabled).toBe(true);
      expect(binanceConfig!.config.endpoints).toHaveProperty('ws');
      expect(binanceConfig!.config.endpoints).toHaveProperty('rest');
    });

    it('应该正确应用默认配置合并', async () => {
      const registryConfig = {
        defaultConfig: {
          publishConfig: {
            topicPrefix: 'default-prefix',
            enableBatching: true,
            batchSize: 100,
            batchTimeout: 1000
          },
          monitoringConfig: {
            enableMetrics: true,
            enableHealthCheck: false,
            metricsInterval: 30000
          }
        },
        autoStart: [],
        monitoring: {
          enableHealthCheck: true,
          healthCheckInterval: 5000,
          enableMetrics: true,
          metricsInterval: 5000
        }
      };

      // 重新初始化注册中心以应用新配置
      await adapterRegistry.destroy();
      adapterRegistry = new AdapterRegistry();
      await adapterRegistry.initialize(registryConfig, pubsubClient, monitor, errorHandler);

      // 注册测试适配器
      adapterRegistry.register('config-test', createMockAdapterIntegration, testRegistryEntries.mock);

      // 使用不完整的配置创建实例
      const partialConfig = {
        adapterConfig: testIntegrationConfigs.mockIntegration.adapterConfig,
        publishConfig: {
          topicPrefix: 'test-prefix'
          // 缺少其他字段，应该使用默认值
        },
        monitoringConfig: {
          enableMetrics: false
          // 缺少其他字段，应该使用默认值
        }
      };

      const instance = await adapterRegistry.createInstance('config-test', partialConfig as any);
      await adapterRegistry.startInstance('config-test');

      // 验证配置合并正确
      const metrics = instance.getMetrics();
      expect(metrics).toBeDefined();

      // 清理
      await adapterRegistry.stopInstance('config-test');
      await adapterRegistry.destroyInstance('config-test');
    });

    it('应该支持启用的适配器自动启动', async () => {
      const autoStartConfig = {
        defaultConfig: testIntegrationConfigs.mockIntegration,
        autoStart: ['mock-auto'],
        monitoring: {
          enableHealthCheck: true,
          healthCheckInterval: 5000,
          enableMetrics: true,
          metricsInterval: 5000
        }
      };

      // 重新初始化注册中心
      await adapterRegistry.destroy();
      adapterRegistry = new AdapterRegistry();

      // 注册自动启动适配器
      adapterRegistry.register('mock-auto', createMockAdapterIntegration, testRegistryEntries.mock);

      await adapterRegistry.initialize(autoStartConfig, pubsubClient, monitor, errorHandler);

      // 准备配置映射
      const configs = new Map();
      configs.set('mock-auto', testIntegrationConfigs.mockIntegration);

      // 启动自动启动适配器
      await adapterRegistry.startAutoAdapters(configs);

      // 验证适配器已自动启动
      const status = adapterRegistry.getStatus();
      expect(status.runningInstances).toContain('mock-auto');

      const instance = adapterRegistry.getInstance('mock-auto');
      expect(instance).toBeDefined();
      expect(instance!.isHealthy()).toBe(true);

      // 清理
      await adapterRegistry.stopInstance('mock-auto');
      await adapterRegistry.destroyInstance('mock-auto');
    });
  });

  describe('事件和状态传播集成', () => {
    it('应该正确传播适配器状态变更事件', async () => {
      const events: Array<{type: string, data: any}> = [];

      // 注册事件监听器
      adapterRegistry.on('instanceCreated', (name, instance) => {
        events.push({ type: 'instanceCreated', data: { name } });
      });

      adapterRegistry.on('instanceStarted', (name, instance) => {
        events.push({ type: 'instanceStarted', data: { name } });
      });

      adapterRegistry.on('instanceStopped', (name, instance) => {
        events.push({ type: 'instanceStopped', data: { name } });
      });

      adapterRegistry.on('instanceDestroyed', (name) => {
        events.push({ type: 'instanceDestroyed', data: { name } });
      });

      // 注册测试适配器
      adapterRegistry.register('event-test', createMockAdapterIntegration, testRegistryEntries.mock);

      // 执行生命周期操作
      const instance = await adapterRegistry.createInstance('event-test', testIntegrationConfigs.mockIntegration);
      await adapterRegistry.startInstance('event-test');
      await adapterRegistry.stopInstance('event-test');
      await adapterRegistry.destroyInstance('event-test');

      // 验证事件顺序
      expect(events).toHaveLength(4);
      expect(events[0].type).toBe('instanceCreated');
      expect(events[1].type).toBe('instanceStarted');
      expect(events[2].type).toBe('instanceStopped');
      expect(events[3].type).toBe('instanceDestroyed');
      
      events.forEach(event => {
        expect(event.data.name).toBe('event-test');
      });
    });

    it('应该正确传播适配器内部状态变更', async () => {
      const statusChanges: Array<{name: string, newStatus: any, oldStatus: any}> = [];

      // 监听状态变更事件
      adapterRegistry.on('instanceStatusChange', (name, newStatus, oldStatus) => {
        statusChanges.push({ name, newStatus, oldStatus });
      });

      // 注册测试适配器
      adapterRegistry.register('status-test', createMockAdapterIntegration, testRegistryEntries.mock);

      // 创建并启动实例
      const instance = await adapterRegistry.createInstance('status-test', testIntegrationConfigs.mockIntegration);
      await adapterRegistry.startInstance('status-test');

      // 模拟状态变更
      const mockInstance = instance as MockAdapterIntegration;
      mockInstance.getMockAdapter().forceStatus(3); // ERROR状态

      // 等待事件传播
      await testUtils.sleep(100);

      // 验证状态变更被捕获
      expect(statusChanges.length).toBeGreaterThan(0);
      
      const lastChange = statusChanges[statusChanges.length - 1];
      expect(lastChange.name).toBe('status-test');
      expect(lastChange.newStatus).toBe(3);

      // 清理
      await adapterRegistry.stopInstance('status-test');
      await adapterRegistry.destroyInstance('status-test');
    });

    it('应该正确处理数据处理事件', async () => {
      const dataEvents: Array<{name: string, data: any}> = [];

      // 监听数据处理事件
      adapterRegistry.on('instanceDataProcessed', (name, data) => {
        dataEvents.push({ name, data });
      });

      // 注册测试适配器
      adapterRegistry.register('data-test', createMockAdapterIntegration, testRegistryEntries.mock);

      // 创建并启动实例
      const instance = await adapterRegistry.createInstance('data-test', testIntegrationConfigs.mockIntegration);
      await adapterRegistry.startInstance('data-test');

      // 模拟数据处理
      const mockInstance = instance as MockAdapterIntegration;
      mockInstance.simulateData(testMarketData.validTradeData);

      // 等待数据处理
      await testUtils.sleep(500);

      // 验证数据处理事件
      expect(dataEvents.length).toBeGreaterThan(0);
      
      const dataEvent = dataEvents[0];
      expect(dataEvent.name).toBe('data-test');
      expect(dataEvent.data).toMatchObject({
        exchange: testMarketData.validTradeData.exchange,
        symbol: testMarketData.validTradeData.symbol,
        type: testMarketData.validTradeData.type
      });

      // 清理
      await adapterRegistry.stopInstance('data-test');
      await adapterRegistry.destroyInstance('data-test');
    });
  });

  describe('并发和资源管理集成', () => {
    it('应该正确处理并发适配器操作', async () => {
      // 注册多个测试适配器
      for (let i = 0; i < 5; i++) {
        adapterRegistry.register(`concurrent-${i}`, createMockAdapterIntegration, testRegistryEntries.mock);
      }

      // 并发创建实例
      const createPromises = [];
      for (let i = 0; i < 5; i++) {
        createPromises.push(
          adapterRegistry.createInstance(`concurrent-${i}`, testIntegrationConfigs.mockIntegration)
        );
      }

      const instances = await Promise.all(createPromises);
      expect(instances).toHaveLength(5);
      instances.forEach(instance => expect(instance).toBeDefined());

      // 并发启动实例
      const startPromises = [];
      for (let i = 0; i < 5; i++) {
        startPromises.push(adapterRegistry.startInstance(`concurrent-${i}`));
      }

      await Promise.all(startPromises);

      // 验证所有实例都在运行
      const status = adapterRegistry.getStatus();
      for (let i = 0; i < 5; i++) {
        expect(status.runningInstances).toContain(`concurrent-${i}`);
      }

      // 并发停止和销毁
      const stopPromises = [];
      for (let i = 0; i < 5; i++) {
        stopPromises.push(
          adapterRegistry.stopInstance(`concurrent-${i}`)
            .then(() => adapterRegistry.destroyInstance(`concurrent-${i}`))
        );
      }

      await Promise.all(stopPromises);

      // 验证所有实例已清理
      const finalStatus = adapterRegistry.getStatus();
      for (let i = 0; i < 5; i++) {
        expect(finalStatus.runningInstances).not.toContain(`concurrent-${i}`);
      }
    });

    it('应该正确管理资源和内存', async () => {
      const initialMemory = process.memoryUsage();

      // 创建和销毁多个适配器实例
      for (let cycle = 0; cycle < 3; cycle++) {
        // 注册适配器
        adapterRegistry.register(`memory-test-${cycle}`, createMockAdapterIntegration, testRegistryEntries.mock);

        // 创建并启动实例
        const instance = await adapterRegistry.createInstance(
          `memory-test-${cycle}`, 
          testIntegrationConfigs.mockIntegration
        );
        await adapterRegistry.startInstance(`memory-test-${cycle}`);

        // 模拟一些数据处理
        const mockInstance = instance as MockAdapterIntegration;
        for (let i = 0; i < 10; i++) {
          mockInstance.simulateData(testMarketData.validTradeData);
        }

        await testUtils.sleep(100);

        // 停止并销毁实例
        await adapterRegistry.stopInstance(`memory-test-${cycle}`);
        await adapterRegistry.destroyInstance(`memory-test-${cycle}`);
      }

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }

      await testUtils.sleep(1000);

      const finalMemory = process.memoryUsage();
      
      // 验证内存使用没有无限增长（允许合理的内存增长）
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const maxAllowedIncrease = 50 * 1024 * 1024; // 50MB
      
      expect(memoryIncrease).toBeLessThan(maxAllowedIncrease);
    });

    it('应该正确处理异常情况下的资源清理', async () => {
      // 注册会出错的适配器
      adapterRegistry.register('error-cleanup', () => {
        const mockIntegration = createMockAdapterIntegration() as MockAdapterIntegration;
        
        // 模拟启动时出错
        const originalStart = mockIntegration.start;
        mockIntegration.start = async () => {
          await originalStart.call(mockIntegration);
          throw new Error('Simulated startup error');
        };
        
        return mockIntegration;
      }, testRegistryEntries.mock);

      // 尝试创建和启动实例
      const instance = await adapterRegistry.createInstance('error-cleanup', testIntegrationConfigs.mockIntegration);
      
      // 启动应该失败
      await expect(adapterRegistry.startInstance('error-cleanup')).rejects.toThrow('Simulated startup error');

      // 验证实例状态
      const status = adapterRegistry.getStatus();
      expect(status.runningInstances).not.toContain('error-cleanup');

      // 清理应该仍然有效
      await expect(adapterRegistry.destroyInstance('error-cleanup')).resolves.not.toThrow();
    });
  });
});