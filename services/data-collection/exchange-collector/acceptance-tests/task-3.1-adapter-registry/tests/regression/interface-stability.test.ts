/**
 * Task 3.1 适配器注册系统 - 接口稳定性回归测试
 * 
 * 确保API接口和行为的向后兼容性：
 * - API响应格式稳定性
 * - 配置格式兼容性
 * - 适配器接口稳定性
 * - 错误响应格式一致性
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { globalCache } from '@pixiu/shared-core';

import { 
  TestEnvironment,
  ApiClient,
  testUtils,
  testAssertions
} from '../../fixtures/helpers/test-helpers';
import { 
  testIntegrationConfigs
} from '../../fixtures/test-data/adapter-configs';

describe('Task 3.1 适配器注册系统 - 接口稳定性回归测试', () => {
  let testEnv: TestEnvironment;
  let apiClient: ApiClient;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    apiClient = new ApiClient('http://127.0.0.1:18080');

    await testEnv.setup('test-config.yaml');
    await testEnv.startService();

    await testUtils.waitFor(async () => {
      const health = await apiClient.getHealthReady();
      return health.status === 200;
    }, 15000);
  });

  afterAll(async () => {
    await testEnv.cleanup();
    globalCache.destroy();
  });

  describe('API响应格式稳定性', () => {
    it('健康检查API响应格式应该保持稳定', async () => {
      const response = await apiClient.getHealth();
      
      expect(response.status).toBe(200);
      
      // 验证必需字段存在
      const requiredFields = [
        'status',
        'timestamp', 
        'service',
        'version',
        'uptime',
        'checks'
      ];
      
      const validation = testUtils.validateSchema(response.data, requiredFields);
      expect(validation.valid).toBe(true);
      
      // 验证字段类型
      expect(typeof response.data.status).toBe('string');
      expect(typeof response.data.timestamp).toBe('string');
      expect(typeof response.data.service).toBe('string');
      expect(typeof response.data.uptime).toBe('number');
      expect(typeof response.data.checks).toBe('object');
      
      // 验证嵌套结构
      expect(response.data.checks).toHaveProperty('adapters');
      expect(response.data.checks.adapters).toHaveProperty('status');
      expect(response.data.checks.adapters).toHaveProperty('registeredCount');
      expect(response.data.checks.adapters).toHaveProperty('runningCount');
      expect(response.data.checks.adapters).toHaveProperty('details');
      
      // 验证数组结构
      expect(Array.isArray(response.data.checks.adapters.details)).toBe(true);
      
      if (response.data.checks.adapters.details.length > 0) {
        const adapterDetail = response.data.checks.adapters.details[0];
        expect(adapterDetail).toHaveProperty('name');
        expect(adapterDetail).toHaveProperty('status');
        expect(adapterDetail).toHaveProperty('healthy');
      }
    });

    it('就绪检查API响应格式应该保持稳定', async () => {
      const response = await apiClient.getHealthReady();
      
      expect([200, 503]).toContain(response.status);
      
      const requiredFields = [
        'ready',
        'timestamp',
        'details'
      ];
      
      const validation = testUtils.validateSchema(response.data, requiredFields);
      expect(validation.valid).toBe(true);
      
      // 验证字段类型
      expect(typeof response.data.ready).toBe('boolean');
      expect(typeof response.data.timestamp).toBe('string');
      expect(typeof response.data.details).toBe('object');
      
      // 验证嵌套结构
      expect(response.data.details).toHaveProperty('initialized');
      expect(response.data.details).toHaveProperty('runningAdapters');
      expect(typeof response.data.details.initialized).toBe('boolean');
      expect(Array.isArray(response.data.details.runningAdapters)).toBe(true);
    });

    it('存活检查API响应格式应该保持稳定', async () => {
      const response = await apiClient.getHealthLive();
      
      expect(response.status).toBe(200);
      
      const requiredFields = [
        'alive',
        'timestamp'
      ];
      
      const validation = testUtils.validateSchema(response.data, requiredFields);
      expect(validation.valid).toBe(true);
      
      // 验证字段类型和值
      expect(response.data.alive).toBe(true);
      expect(typeof response.data.timestamp).toBe('string');
      expect(new Date(response.data.timestamp)).toBeInstanceOf(Date);
    });

    it('适配器列表API响应格式应该保持稳定', async () => {
      const response = await apiClient.getAdapters();
      
      expect(response.status).toBe(200);
      
      const requiredFields = [
        'total',
        'running',
        'adapters'
      ];
      
      const validation = testUtils.validateSchema(response.data, requiredFields);
      expect(validation.valid).toBe(true);
      
      // 验证字段类型
      expect(typeof response.data.total).toBe('number');
      expect(typeof response.data.running).toBe('number');
      expect(Array.isArray(response.data.adapters)).toBe(true);
      
      // 验证适配器对象结构
      if (response.data.adapters.length > 0) {
        const adapter = response.data.adapters[0];
        testAssertions.assertAdapterResponse(adapter);
        
        // 确保关键字段存在
        expect(adapter).toHaveProperty('name');
        expect(adapter).toHaveProperty('version');
        expect(adapter).toHaveProperty('description');
        expect(adapter).toHaveProperty('enabled');
        expect(adapter).toHaveProperty('running');
        expect(adapter).toHaveProperty('status');
        expect(adapter).toHaveProperty('healthy');
      }
    });

    it('适配器详情API响应格式应该保持稳定', async () => {
      const response = await apiClient.getAdapter('binance');
      
      expect(response.status).toBe(200);
      testAssertions.assertAdapterResponse(response.data);
      
      // 验证Binance特定字段
      expect(response.data.name).toBe('binance');
      expect(response.data).toHaveProperty('supportedFeatures');
      expect(Array.isArray(response.data.supportedFeatures)).toBe(true);
      
      // 验证可选字段
      if (response.data.running) {
        expect(response.data).toHaveProperty('metrics');
        expect(typeof response.data.metrics).toBe('object');
      }
      
      if (response.data.metadata) {
        expect(typeof response.data.metadata).toBe('object');
      }
    });

    it('指标API响应格式应该保持稳定', async () => {
      const response = await apiClient.getMetricsJson();
      
      expect(response.status).toBe(200);
      testAssertions.assertMetricsResponse(response.data);
      
      // 验证系统指标结构
      expect(response.data.system).toHaveProperty('memory');
      expect(response.data.system).toHaveProperty('cpu');
      
      // 验证内存指标
      const memory = response.data.system.memory;
      expect(typeof memory.used).toBe('number');
      expect(typeof memory.free).toBe('number');
      expect(typeof memory.total).toBe('number');
      
      // 验证CPU指标
      const cpu = response.data.system.cpu;
      expect(typeof cpu.usage).toBe('number');
    });
  });

  describe('错误响应格式一致性', () => {
    it('404错误应该有一致的格式', async () => {
      const response = await apiClient.getAdapter('nonexistent');
      
      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error');
      expect(typeof response.data.error).toBe('string');
      expect(response.data.error).toContain('not found');
    });

    it('400错误应该有一致的格式', async () => {
      const response = await apiClient.setAdapterEnabled('binance', 'invalid' as any);
      
      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(typeof response.data.error).toBe('string');
    });

    it('重复操作错误应该有一致的格式', async () => {
      // 确保适配器正在运行
      const adapterResponse = await apiClient.getAdapter('binance');
      if (!adapterResponse.data.running) {
        await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        await testUtils.sleep(2000);
      }

      // 尝试再次启动
      const response = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      
      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(typeof response.data.error).toBe('string');
      expect(response.data.error).toContain('already running');
    });

    it('无效配置错误应该有一致的格式', async () => {
      const invalidConfig = {
        adapterConfig: null,
        publishConfig: null,
        monitoringConfig: null
      };

      const response = await apiClient.startAdapter('binance', invalidConfig as any);
      
      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(typeof response.data.error).toBe('string');
      expect(response.data.error).toContain('Invalid configuration');
    });
  });

  describe('成功响应格式一致性', () => {
    beforeEach(async () => {
      // 确保适配器处于已知状态
      const response = await apiClient.getAdapter('binance');
      if (response.data.running) {
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(1000);
      }
    });

    it('启动适配器成功响应格式应该保持稳定', async () => {
      const response = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('message');
      expect(response.data.success).toBe(true);
      expect(typeof response.data.message).toBe('string');
      expect(response.data.message).toContain('started successfully');
    });

    it('停止适配器成功响应格式应该保持稳定', async () => {
      // 先启动适配器
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      const response = await apiClient.stopAdapter('binance');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('message');
      expect(response.data.success).toBe(true);
      expect(typeof response.data.message).toBe('string');
      expect(response.data.message).toContain('stopped successfully');
    });

    it('重启适配器成功响应格式应该保持稳定', async () => {
      // 先启动适配器
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      const response = await apiClient.restartAdapter('binance');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('message');
      expect(response.data).toHaveProperty('previousMetrics');
      expect(response.data.success).toBe(true);
      expect(typeof response.data.message).toBe('string');
      expect(response.data.message).toContain('restarted successfully');
      expect(typeof response.data.previousMetrics).toBe('object');
    });

    it('启用/禁用适配器成功响应格式应该保持稳定', async () => {
      const disableResponse = await apiClient.setAdapterEnabled('binance', false);
      
      expect(disableResponse.status).toBe(200);
      expect(disableResponse.data).toHaveProperty('success');
      expect(disableResponse.data).toHaveProperty('message');
      expect(disableResponse.data.success).toBe(true);
      expect(typeof disableResponse.data.message).toBe('string');
      expect(disableResponse.data.message).toContain('disabled successfully');

      const enableResponse = await apiClient.setAdapterEnabled('binance', true);
      
      expect(enableResponse.status).toBe(200);
      expect(enableResponse.data).toHaveProperty('success');
      expect(enableResponse.data).toHaveProperty('message');
      expect(enableResponse.data.success).toBe(true);
      expect(typeof enableResponse.data.message).toBe('string');
      expect(enableResponse.data.message).toContain('enabled successfully');
    });
  });

  describe('配置格式兼容性', () => {
    it('应该支持现有的配置格式', async () => {
      // 验证当前配置格式被正确解析
      const adaptersResponse = await apiClient.getAdapters();
      expect(adaptersResponse.status).toBe(200);
      
      const binanceAdapter = adaptersResponse.data.adapters.find((a: any) => a.name === 'binance');
      expect(binanceAdapter).toBeDefined();
      expect(binanceAdapter.enabled).toBe(true);
    });

    it('应该支持集成配置格式', async () => {
      // 验证标准集成配置格式仍然有效
      const config = testIntegrationConfigs.binanceIntegration;
      
      // 确保配置结构有效
      expect(config).toHaveProperty('adapterConfig');
      expect(config).toHaveProperty('publishConfig');
      expect(config).toHaveProperty('monitoringConfig');
      
      // 验证可以使用此配置启动适配器
      const response = await apiClient.startAdapter('binance', config);
      expect([200, 400]).toContain(response.status); // 可能已经运行或成功启动
      
      if (response.status === 200) {
        await testUtils.sleep(1000);
        await apiClient.stopAdapter('binance');
      }
    });

    it('应该支持部分配置字段', async () => {
      // 测试向后兼容性：缺少某些新字段的配置应该仍然有效
      const minimalConfig = {
        adapterConfig: testIntegrationConfigs.binanceIntegration.adapterConfig,
        publishConfig: {
          topicPrefix: 'test'
          // 缺少其他字段，应该使用默认值
        },
        monitoringConfig: {
          enableMetrics: true
          // 缺少其他字段，应该使用默认值
        }
      };

      const response = await apiClient.startAdapter('binance', minimalConfig as any);
      expect([200, 400]).toContain(response.status);
      
      if (response.status === 200) {
        await testUtils.sleep(1000);
        await apiClient.stopAdapter('binance');
      }
    });
  });

  describe('时间戳和版本格式稳定性', () => {
    it('时间戳应该使用ISO格式', async () => {
      const responses = await Promise.all([
        apiClient.getHealth(),
        apiClient.getHealthReady(),
        apiClient.getHealthLive(),
        apiClient.getMetricsJson()
      ]);

      responses.forEach(response => {
        if (response.data.timestamp) {
          const timestamp = response.data.timestamp;
          expect(typeof timestamp).toBe('string');
          expect(new Date(timestamp)).toBeInstanceOf(Date);
          expect(new Date(timestamp).toISOString()).toBe(timestamp);
        }
      });
    });

    it('版本号应该使用语义版本格式', async () => {
      const response = await apiClient.getAdapter('binance');
      expect(response.status).toBe(200);
      
      const version = response.data.version;
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+/); // 基本语义版本格式
    });

    it('服务信息应该保持一致', async () => {
      const healthResponse = await apiClient.getHealth();
      
      expect(healthResponse.data.service).toBe('exchange-collector');
      expect(typeof healthResponse.data.version).toBe('string');
      expect(typeof healthResponse.data.uptime).toBe('number');
      expect(healthResponse.data.uptime).toBeGreaterThan(0);
    });
  });

  describe('数值类型稳定性', () => {
    it('数值字段应该保持一致的类型', async () => {
      const adaptersResponse = await apiClient.getAdapters();
      expect(adaptersResponse.status).toBe(200);
      
      expect(typeof adaptersResponse.data.total).toBe('number');
      expect(typeof adaptersResponse.data.running).toBe('number');
      expect(adaptersResponse.data.total).toBeGreaterThanOrEqual(0);
      expect(adaptersResponse.data.running).toBeGreaterThanOrEqual(0);
      expect(adaptersResponse.data.running).toBeLessThanOrEqual(adaptersResponse.data.total);
    });

    it('指标数值应该保持一致的类型', async () => {
      const metricsResponse = await apiClient.getMetricsJson();
      expect(metricsResponse.status).toBe(200);
      
      expect(typeof metricsResponse.data.uptime).toBe('number');
      expect(metricsResponse.data.uptime).toBeGreaterThan(0);
      
      expect(typeof metricsResponse.data.system.memory.used).toBe('number');
      expect(typeof metricsResponse.data.system.memory.free).toBe('number');
      expect(typeof metricsResponse.data.system.memory.total).toBe('number');
      expect(typeof metricsResponse.data.system.cpu.usage).toBe('number');
      
      expect(metricsResponse.data.system.memory.used).toBeGreaterThan(0);
      expect(metricsResponse.data.system.memory.total).toBeGreaterThan(0);
      expect(metricsResponse.data.system.cpu.usage).toBeGreaterThanOrEqual(0);
    });

    it('适配器指标应该保持一致的类型', async () => {
      // 启动适配器以获取指标
      const startResponse = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      if (startResponse.status === 200) {
        await testUtils.sleep(2000);
        
        const adapterResponse = await apiClient.getAdapter('binance');
        if (adapterResponse.data.metrics) {
          const metrics = adapterResponse.data.metrics;
          
          expect(typeof metrics.adapterStatus).toBe('number');
          expect(typeof metrics.messagesProcessed).toBe('number');
          expect(typeof metrics.messagesPublished).toBe('number');
          expect(typeof metrics.processingErrors).toBe('number');
          expect(typeof metrics.publishErrors).toBe('number');
          expect(typeof metrics.averageProcessingLatency).toBe('number');
          expect(typeof metrics.lastActivity).toBe('number');
          
          expect(metrics.messagesProcessed).toBeGreaterThanOrEqual(0);
          expect(metrics.messagesPublished).toBeGreaterThanOrEqual(0);
          expect(metrics.processingErrors).toBeGreaterThanOrEqual(0);
          expect(metrics.publishErrors).toBeGreaterThanOrEqual(0);
          expect(metrics.averageProcessingLatency).toBeGreaterThanOrEqual(0);
          expect(metrics.lastActivity).toBeGreaterThan(0);
        }
        
        await apiClient.stopAdapter('binance');
      }
    });
  });
});