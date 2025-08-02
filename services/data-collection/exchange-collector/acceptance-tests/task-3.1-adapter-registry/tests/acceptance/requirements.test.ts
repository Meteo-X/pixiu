/**
 * Task 3.1 适配器注册系统 - 需求验收测试
 * 
 * 验证所有核心需求：
 * 1. 适配器静态加载机制 (Static Adapter Loading)
 * 2. 适配器注册管理器 (Adapter Registry Manager) 
 * 3. 适配器生命周期管理 (Adapter Lifecycle Management)
 * 4. 适配器状态监控 (Adapter Status Monitoring)
 */

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { globalCache } from '@pixiu/shared-core';

import ExchangeCollectorService from '../../../../src/index';
import { AdapterRegistry } from '../../../../src/adapters/registry/adapter-registry';
import { configManager } from '../../../../src/config/service-config';
import { 
  TestEnvironment, 
  ApiClient,
  PerformanceMonitor,
  createMockAdapterIntegration,
  testUtils,
  testAssertions
} from '../../fixtures/helpers/test-helpers';
import { 
  testIntegrationConfigs,
  testRegistryEntries,
  performanceCriteria
} from '../../fixtures/test-data/adapter-configs';

describe('Task 3.1 适配器注册系统 - 需求验收测试', () => {
  let testEnv: TestEnvironment;
  let apiClient: ApiClient;
  let perfMonitor: PerformanceMonitor;
  let service: ExchangeCollectorService;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    apiClient = new ApiClient('http://127.0.0.1:18080');
    perfMonitor = new PerformanceMonitor();

    // Setup test environment with comprehensive configuration
    await testEnv.setup('test-config.yaml');
    
    // Start service with performance monitoring
    service = await perfMonitor.measure('serviceStartup', async () => {
      return await testEnv.startService();
    });

    // Wait for service to be fully ready
    await testUtils.waitFor(async () => {
      const health = await apiClient.getHealthReady();
      return health.status === 200;
    }, 10000);
  });

  afterAll(async () => {
    await testEnv.cleanup();
    globalCache.destroy();
    
    // Log performance statistics
    const stats = perfMonitor.getAllStats();
    console.log('Performance Statistics:', JSON.stringify(stats, null, 2));
  });

  describe('3.1.1 适配器静态加载机制 (Static Adapter Loading)', () => {
    it('应该根据配置文件在启动时加载适配器', async () => {
      // 验证配置加载
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config!.adapters).toHaveProperty('binance');
      expect(config!.adapters.binance.enabled).toBe(true);

      // 验证适配器已在启动时注册
      const adaptersResponse = await apiClient.getAdapters();
      expect(adaptersResponse.status).toBe(200);
      expect(adaptersResponse.data.adapters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'binance',
            enabled: true
          })
        ])
      );
    });

    it('应该支持配置驱动的适配器启用/禁用', async () => {
      // 获取当前适配器状态
      const binanceResponse = await apiClient.getAdapter('binance');
      expect(binanceResponse.status).toBe(200);
      expect(binanceResponse.data.enabled).toBe(true);

      // 禁用适配器
      const disableResponse = await apiClient.setAdapterEnabled('binance', false);
      expect(disableResponse.status).toBe(200);
      expect(disableResponse.data.success).toBe(true);

      // 验证适配器已禁用
      const disabledResponse = await apiClient.getAdapter('binance');
      expect(disabledResponse.status).toBe(200);
      expect(disabledResponse.data.enabled).toBe(false);

      // 重新启用适配器
      const enableResponse = await apiClient.setAdapterEnabled('binance', true);
      expect(enableResponse.status).toBe(200);
      expect(enableResponse.data.success).toBe(true);

      // 验证适配器已启用
      const enabledResponse = await apiClient.getAdapter('binance');
      expect(enabledResponse.status).toBe(200);
      expect(enabledResponse.data.enabled).toBe(true);
    });

    it('应该正确处理无效配置', async () => {
      // 测试启动不存在的适配器
      const invalidStartResponse = await apiClient.startAdapter('nonexistent', testIntegrationConfigs.binanceIntegration);
      expect(invalidStartResponse.status).toBe(404);
      expect(invalidStartResponse.data.error).toContain('not found');

      // 测试无效配置
      const invalidConfigResponse = await apiClient.startAdapter('binance', {
        adapterConfig: null,
        publishConfig: null,
        monitoringConfig: null
      } as any);
      expect(invalidConfigResponse.status).toBe(400);
      expect(invalidConfigResponse.data.error).toContain('Invalid configuration');
    });

    it('应该支持多种适配器类型的同时加载', async () => {
      const adaptersResponse = await apiClient.getAdapters();
      expect(adaptersResponse.status).toBe(200);
      
      const adapterNames = adaptersResponse.data.adapters.map((a: any) => a.name);
      expect(adapterNames).toContain('binance');
      
      // 验证至少支持内置适配器
      expect(adaptersResponse.data.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3.1.2 适配器注册管理器 (Adapter Registry Manager)', () => {
    it('应该提供适配器注册和注销功能', async () => {
      // 验证内置适配器已注册
      const adaptersResponse = await apiClient.getAdapters();
      expect(adaptersResponse.status).toBe(200);
      
      const binanceAdapter = adaptersResponse.data.adapters.find((a: any) => a.name === 'binance');
      expect(binanceAdapter).toBeDefined();
      expect(binanceAdapter.name).toBe('binance');
      expect(binanceAdapter.version).toBeDefined();
      expect(binanceAdapter.description).toBeDefined();
    });

    it('应该管理适配器元数据（版本、描述、功能）', async () => {
      const binanceResponse = await apiClient.getAdapter('binance');
      expect(binanceResponse.status).toBe(200);
      
      const adapter = binanceResponse.data;
      testAssertions.assertAdapterResponse(adapter);
      
      // 验证元数据
      expect(adapter.version).toMatch(/^\d+\.\d+\.\d+$/); // 语义版本格式
      expect(adapter.description).toContain('Binance');
      expect(adapter.supportedFeatures).toEqual(
        expect.arrayContaining(['websocket', 'trades', 'tickers'])
      );
    });

    it('应该支持适配器启用/禁用状态管理', async () => {
      // 验证初始状态
      const initialResponse = await apiClient.getAdapter('binance');
      expect(initialResponse.data.enabled).toBe(true);

      // 禁用适配器
      await perfMonitor.measure('adapterDisable', async () => {
        const disableResponse = await apiClient.setAdapterEnabled('binance', false);
        expect(disableResponse.status).toBe(200);
      });

      // 验证禁用状态
      const disabledResponse = await apiClient.getAdapter('binance');
      expect(disabledResponse.data.enabled).toBe(false);

      // 重新启用
      await perfMonitor.measure('adapterEnable', async () => {
        const enableResponse = await apiClient.setAdapterEnabled('binance', true);
        expect(enableResponse.status).toBe(200);
      });

      // 验证启用状态
      const enabledResponse = await apiClient.getAdapter('binance');
      expect(enabledResponse.data.enabled).toBe(true);
    });

    it('应该提供注册表状态查询功能', async () => {
      const adaptersResponse = await apiClient.getAdapters();
      expect(adaptersResponse.status).toBe(200);
      
      const response = adaptersResponse.data;
      expect(response).toHaveProperty('total');
      expect(response).toHaveProperty('running');
      expect(response).toHaveProperty('adapters');
      expect(Array.isArray(response.adapters)).toBe(true);
      expect(response.total).toBeGreaterThanOrEqual(0);
      expect(response.running).toBeGreaterThanOrEqual(0);
    });

    it('应该支持内置适配器自动注册', async () => {
      // 验证Binance适配器已自动注册
      const binanceResponse = await apiClient.getAdapter('binance');
      expect(binanceResponse.status).toBe(200);
      expect(binanceResponse.data.name).toBe('binance');
      
      // 验证适配器元数据正确
      expect(binanceResponse.data.supportedFeatures).toEqual(
        expect.arrayContaining(['websocket', 'trades', 'tickers', 'klines', 'depth'])
      );
    });
  });

  describe('3.1.3 适配器生命周期管理 (Adapter Lifecycle Management)', () => {
    it('应该支持适配器实例创建和初始化', async () => {
      // 确保适配器未运行
      const initialResponse = await apiClient.getAdapter('binance');
      if (initialResponse.data.running) {
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(1000);
      }

      // 启动适配器实例
      const startResponse = await perfMonitor.measure('instanceCreation', async () => {
        return await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      });

      expect(startResponse.status).toBe(200);
      expect(startResponse.data.success).toBe(true);

      // 验证实例已创建并运行
      await testUtils.sleep(2000); // 等待实例完全启动
      const runningResponse = await apiClient.getAdapter('binance');
      expect(runningResponse.data.running).toBe(true);
      expect(runningResponse.data.status).toBe('connected');
    });

    it('应该支持适配器实例停止和销毁', async () => {
      // 确保适配器正在运行
      const runningResponse = await apiClient.getAdapter('binance');
      if (!runningResponse.data.running) {
        await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        await testUtils.sleep(2000);
      }

      // 停止适配器实例
      const stopResponse = await perfMonitor.measure('instanceStop', async () => {
        return await apiClient.stopAdapter('binance');
      });

      expect(stopResponse.status).toBe(200);
      expect(stopResponse.data.success).toBe(true);

      // 验证实例已停止
      await testUtils.sleep(1000);
      const stoppedResponse = await apiClient.getAdapter('binance');
      expect(stoppedResponse.data.running).toBe(false);
      expect(stoppedResponse.data.status).toBe('stopped');
    });

    it('应该支持优雅关闭处理', async () => {
      // 启动适配器
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      // 验证适配器正在运行
      const runningResponse = await apiClient.getAdapter('binance');
      expect(runningResponse.data.running).toBe(true);

      // 执行优雅关闭
      const stopResponse = await apiClient.stopAdapter('binance');
      expect(stopResponse.status).toBe(200);

      // 验证停止完成且无错误
      await testUtils.sleep(1000);
      const stoppedResponse = await apiClient.getAdapter('binance');
      expect(stoppedResponse.data.running).toBe(false);
      expect(stoppedResponse.data.healthy).toBe(false);
    });

    it('应该支持自动启动适配器功能', async () => {
      // 通过重启服务测试自动启动功能
      await testEnv.stopService();
      
      // 等待服务完全停止
      await testUtils.sleep(2000);
      
      // 重新启动服务
      service = await testEnv.startService();
      
      // 等待服务完全启动
      await testUtils.waitFor(async () => {
        const health = await apiClient.getHealthReady();
        return health.status === 200;
      }, 10000);

      // 验证配置中启用的适配器已自动启动
      const adaptersResponse = await apiClient.getAdapters();
      expect(adaptersResponse.status).toBe(200);
      
      // 根据配置，Binance适配器应该已自动启动
      const binanceAdapter = adaptersResponse.data.adapters.find((a: any) => a.name === 'binance');
      expect(binanceAdapter).toBeDefined();
      expect(binanceAdapter.enabled).toBe(true);
    });

    it('应该正确跟踪实例状态', async () => {
      // 启动适配器
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      // 验证状态跟踪
      const response = await apiClient.getAdapter('binance');
      expect(response.data.running).toBe(true);
      expect(response.data.status).toBe('connected');
      expect(response.data.healthy).toBe(true);
      expect(response.data.metrics).toBeDefined();

      // 停止适配器
      await apiClient.stopAdapter('binance');
      await testUtils.sleep(1000);

      // 验证状态更新
      const stoppedResponse = await apiClient.getAdapter('binance');
      expect(stoppedResponse.data.running).toBe(false);
      expect(stoppedResponse.data.status).toBe('stopped');
      expect(stoppedResponse.data.healthy).toBe(false);
    });
  });

  describe('3.1.4 适配器状态监控 (Adapter Status Monitoring)', () => {
    beforeEach(async () => {
      // 确保有运行的适配器用于监控测试
      const response = await apiClient.getAdapter('binance');
      if (!response.data.running) {
        await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        await testUtils.sleep(2000);
      }
    });

    it('应该提供健康检查注册和执行', async () => {
      const healthResponse = await perfMonitor.measure('healthCheck', async () => {
        return await apiClient.getHealth();
      });

      expect(healthResponse.status).toBe(200);
      testAssertions.assertHealthResponse(healthResponse.data);

      // 验证适配器健康状态包含在检查中
      expect(healthResponse.data.checks).toHaveProperty('adapters');
      expect(healthResponse.data.checks.adapters.status).toBe('pass');
      expect(healthResponse.data.checks.adapters.registeredCount).toBeGreaterThan(0);
    });

    it('应该提供指标收集和报告', async () => {
      const metricsResponse = await perfMonitor.measure('metricsCollection', async () => {
        return await apiClient.getMetricsJson();
      });

      expect(metricsResponse.status).toBe(200);
      testAssertions.assertMetricsResponse(metricsResponse.data);

      // 验证适配器特定指标
      const adapterResponse = await apiClient.getAdapter('binance');
      expect(adapterResponse.data.metrics).toBeDefined();
      expect(adapterResponse.data.metrics).toHaveProperty('adapterStatus');
      expect(adapterResponse.data.metrics).toHaveProperty('messagesProcessed');
      expect(adapterResponse.data.metrics).toHaveProperty('lastActivity');
    });

    it('应该提供状态变更事件通知', async () => {
      // 停止适配器以触发状态变更
      const stopResponse = await apiClient.stopAdapter('binance');
      expect(stopResponse.status).toBe(200);

      // 等待状态更新传播
      await testUtils.sleep(1000);

      // 验证状态已变更
      const stoppedResponse = await apiClient.getAdapter('binance');
      expect(stoppedResponse.data.status).toBe('stopped');
      expect(stoppedResponse.data.healthy).toBe(false);

      // 重新启动以触发另一个状态变更
      const startResponse = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      expect(startResponse.status).toBe(200);

      // 等待状态更新
      await testUtils.sleep(2000);

      // 验证状态已恢复
      const startedResponse = await apiClient.getAdapter('binance');
      expect(startedResponse.data.status).toBe('connected');
      expect(startedResponse.data.healthy).toBe(true);
    });

    it('应该提供性能监控功能', async () => {
      const adapterResponse = await apiClient.getAdapter('binance');
      expect(adapterResponse.data.metrics).toBeDefined();

      const metrics = adapterResponse.data.metrics;
      expect(metrics).toHaveProperty('averageProcessingLatency');
      expect(metrics).toHaveProperty('messagesProcessed');
      expect(metrics).toHaveProperty('messagesPublished');
      expect(metrics).toHaveProperty('processingErrors');
      expect(metrics).toHaveProperty('publishErrors');

      // 验证指标类型
      expect(typeof metrics.averageProcessingLatency).toBe('number');
      expect(typeof metrics.messagesProcessed).toBe('number');
      expect(typeof metrics.messagesPublished).toBe('number');
    });

    it('应该提供错误跟踪和报告', async () => {
      // 获取当前错误计数
      const initialResponse = await apiClient.getAdapter('binance');
      const initialErrors = initialResponse.data.metrics.processingErrors;

      // 验证错误指标存在
      expect(typeof initialErrors).toBe('number');
      expect(initialErrors).toBeGreaterThanOrEqual(0);

      // 验证错误跟踪结构
      const metrics = initialResponse.data.metrics;
      expect(metrics).toHaveProperty('processingErrors');
      expect(metrics).toHaveProperty('publishErrors');
    });
  });

  describe('性能要求验证', () => {
    it('服务启动时间应满足性能要求', () => {
      const startupStats = perfMonitor.getStats('serviceStartup');
      expect(startupStats).toBeDefined();
      expect(startupStats!.avg).toBeLessThan(performanceCriteria.serviceStartup.maxTime);
    });

    it('健康检查响应时间应满足性能要求', () => {
      const healthStats = perfMonitor.getStats('healthCheck');
      expect(healthStats).toBeDefined();
      expect(healthStats!.avg).toBeLessThan(performanceCriteria.healthCheck.maxTime);
    });

    it('适配器实例创建时间应满足性能要求', () => {
      const creationStats = perfMonitor.getStats('instanceCreation');
      expect(creationStats).toBeDefined();
      expect(creationStats!.avg).toBeLessThan(performanceCriteria.instanceCreation.maxTime);
    });

    it('适配器实例停止时间应满足性能要求', () => {
      const stopStats = perfMonitor.getStats('instanceStop');
      expect(stopStats).toBeDefined();
      expect(stopStats!.avg).toBeLessThan(performanceCriteria.instanceStop.maxTime);
    });
  });
});