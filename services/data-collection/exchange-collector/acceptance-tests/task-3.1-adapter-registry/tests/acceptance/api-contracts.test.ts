/**
 * Task 3.1 适配器注册系统 - API合约测试
 * 
 * 验证所有REST API端点的合约和行为：
 * - 健康检查API (/health, /health/ready, /health/live)
 * - 指标API (/metrics, /metrics/json)  
 * - 适配器管理API (/api/adapters/*)
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

describe('Task 3.1 适配器注册系统 - API合约测试', () => {
  let testEnv: TestEnvironment;
  let apiClient: ApiClient;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    apiClient = new ApiClient('http://127.0.0.1:18080');

    await testEnv.setup('test-config.yaml');
    await testEnv.startService();

    // Wait for service to be ready
    await testUtils.waitFor(async () => {
      const health = await apiClient.getHealthReady();
      return health.status === 200;
    }, 10000);
  });

  afterAll(async () => {
    await testEnv.cleanup();
    globalCache.destroy();
  });

  describe('健康检查API合约', () => {
    describe('GET /health', () => {
      it('应该返回服务健康状态', async () => {
        const response = await apiClient.getHealth();
        
        expect(response.status).toBe(200);
        testAssertions.assertHealthResponse(response.data);
        
        // 验证具体字段
        expect(response.data.status).toMatch(/^(healthy|unhealthy)$/);
        expect(response.data.service).toBe('exchange-collector');
        expect(new Date(response.data.timestamp)).toBeInstanceOf(Date);
        expect(response.data.checks.adapters).toHaveProperty('status');
        expect(response.data.checks.adapters).toHaveProperty('registeredCount');
        expect(response.data.checks.adapters).toHaveProperty('runningCount');
        expect(Array.isArray(response.data.checks.adapters.details)).toBe(true);
      });

      it('在没有运行适配器时应该返回unhealthy', async () => {
        // 停止所有适配器
        const adaptersResponse = await apiClient.getAdapters();
        for (const adapter of adaptersResponse.data.adapters) {
          if (adapter.running) {
            await apiClient.stopAdapter(adapter.name);
          }
        }
        
        await testUtils.sleep(1000);
        
        const response = await apiClient.getHealth();
        expect(response.status).toBe(503);
        expect(response.data.status).toBe('unhealthy');
        expect(response.data.checks.adapters.status).toBe('fail');
      });

      it('在有运行适配器时应该返回healthy', async () => {
        // 启动一个适配器
        await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        await testUtils.sleep(2000);
        
        const response = await apiClient.getHealth();
        expect(response.status).toBe(200);
        expect(response.data.status).toBe('healthy');
        expect(response.data.checks.adapters.status).toBe('pass');
      });
    });

    describe('GET /health/ready', () => {
      it('应该返回服务就绪状态', async () => {
        const response = await apiClient.getHealthReady();
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('ready');
        expect(response.data).toHaveProperty('timestamp');
        expect(response.data).toHaveProperty('details');
        expect(typeof response.data.ready).toBe('boolean');
        expect(new Date(response.data.timestamp)).toBeInstanceOf(Date);
        expect(response.data.details).toHaveProperty('initialized');
        expect(response.data.details).toHaveProperty('runningAdapters');
      });

      it('在服务初始化但无运行适配器时应该返回not ready', async () => {
        // 停止所有适配器
        const adaptersResponse = await apiClient.getAdapters();
        for (const adapter of adaptersResponse.data.adapters) {
          if (adapter.running) {
            await apiClient.stopAdapter(adapter.name);
          }
        }
        
        await testUtils.sleep(1000);
        
        const response = await apiClient.getHealthReady();
        expect(response.status).toBe(503);
        expect(response.data.ready).toBe(false);
        expect(response.data.details.initialized).toBe(true);
        expect(response.data.details.runningAdapters).toHaveLength(0);
      });
    });

    describe('GET /health/live', () => {
      it('应该始终返回服务存活状态', async () => {
        const response = await apiClient.getHealthLive();
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('alive');
        expect(response.data).toHaveProperty('timestamp');
        expect(response.data.alive).toBe(true);
        expect(new Date(response.data.timestamp)).toBeInstanceOf(Date);
      });
    });
  });

  describe('指标API合约', () => {
    describe('GET /metrics', () => {
      it('应该返回Prometheus格式的指标', async () => {
        const response = await apiClient.getMetrics();
        
        expect(response.status).toBe(200);
        expect(typeof response.data).toBe('string');
        
        // 验证Prometheus格式
        const lines = response.data.split('\n');
        const hasMetricLines = lines.some((line: string) => 
          line.startsWith('# HELP') || line.startsWith('# TYPE') || /^\w+/.test(line)
        );
        expect(hasMetricLines).toBe(true);
      });
    });

    describe('GET /metrics/json', () => {
      it('应该返回JSON格式的指标', async () => {
        const response = await apiClient.getMetricsJson();
        
        expect(response.status).toBe(200);
        testAssertions.assertMetricsResponse(response.data);
        
        // 验证具体指标结构
        expect(response.data.system.memory).toHaveProperty('used');
        expect(response.data.system.memory).toHaveProperty('free');
        expect(response.data.system.memory).toHaveProperty('total');
        expect(response.data.system.cpu).toHaveProperty('usage');
      });
    });
  });

  describe('适配器管理API合约', () => {
    describe('GET /api/adapters', () => {
      it('应该返回所有适配器列表', async () => {
        const response = await apiClient.getAdapters();
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('total');
        expect(response.data).toHaveProperty('running');
        expect(response.data).toHaveProperty('adapters');
        expect(typeof response.data.total).toBe('number');
        expect(typeof response.data.running).toBe('number');
        expect(Array.isArray(response.data.adapters)).toBe(true);
        
        // 验证适配器列表结构
        if (response.data.adapters.length > 0) {
          const adapter = response.data.adapters[0];
          testAssertions.assertAdapterResponse(adapter);
        }
      });

      it('应该包含内置的Binance适配器', async () => {
        const response = await apiClient.getAdapters();
        
        expect(response.status).toBe(200);
        const binanceAdapter = response.data.adapters.find((a: any) => a.name === 'binance');
        expect(binanceAdapter).toBeDefined();
        expect(binanceAdapter.name).toBe('binance');
        expect(binanceAdapter.version).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    describe('GET /api/adapters/:name', () => {
      it('应该返回特定适配器的详细信息', async () => {
        const response = await apiClient.getAdapter('binance');
        
        expect(response.status).toBe(200);
        testAssertions.assertAdapterResponse(response.data);
        
        // 验证Binance特定信息
        expect(response.data.name).toBe('binance');
        expect(response.data.supportedFeatures).toEqual(
          expect.arrayContaining(['websocket', 'trades', 'tickers'])
        );
      });

      it('对不存在的适配器应该返回404', async () => {
        const response = await apiClient.getAdapter('nonexistent');
        
        expect(response.status).toBe(404);
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toContain('not found');
      });
    });

    describe('POST /api/adapters/:name/start', () => {
      beforeEach(async () => {
        // 确保适配器未运行
        const response = await apiClient.getAdapter('binance');
        if (response.data.running) {
          await apiClient.stopAdapter('binance');
          await testUtils.sleep(1000);
        }
      });

      it('应该成功启动适配器', async () => {
        const response = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('success');
        expect(response.data).toHaveProperty('message');
        expect(response.data.success).toBe(true);
        expect(response.data.message).toContain('started successfully');
        
        // 验证适配器确实已启动
        await testUtils.sleep(2000);
        const adapterResponse = await apiClient.getAdapter('binance');
        expect(adapterResponse.data.running).toBe(true);
      });

      it('对不存在的适配器应该返回404', async () => {
        const response = await apiClient.startAdapter('nonexistent', testIntegrationConfigs.binanceIntegration);
        
        expect(response.status).toBe(404);
        expect(response.data.error).toContain('not found');
      });

      it('对已运行的适配器应该返回400', async () => {
        // 先启动适配器
        await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        await testUtils.sleep(2000);
        
        // 尝试再次启动
        const response = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        
        expect(response.status).toBe(400);
        expect(response.data.error).toContain('already running');
      });

      it('对无效配置应该返回400', async () => {
        const response = await apiClient.startAdapter('binance', {
          adapterConfig: null,
          publishConfig: null,
          monitoringConfig: null
        } as any);
        
        expect(response.status).toBe(400);
        expect(response.data.error).toContain('Invalid configuration');
      });
    });

    describe('POST /api/adapters/:name/stop', () => {
      beforeEach(async () => {
        // 确保适配器正在运行
        const response = await apiClient.getAdapter('binance');
        if (!response.data.running) {
          await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
          await testUtils.sleep(2000);
        }
      });

      it('应该成功停止适配器', async () => {
        const response = await apiClient.stopAdapter('binance');
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('success');
        expect(response.data).toHaveProperty('message');
        expect(response.data.success).toBe(true);
        expect(response.data.message).toContain('stopped successfully');
        
        // 验证适配器确实已停止
        await testUtils.sleep(1000);
        const adapterResponse = await apiClient.getAdapter('binance');
        expect(adapterResponse.data.running).toBe(false);
      });

      it('对不存在的适配器应该返回404', async () => {
        const response = await apiClient.stopAdapter('nonexistent');
        
        expect(response.status).toBe(404);
        expect(response.data.error).toContain('not found');
      });

      it('对未运行的适配器应该返回400', async () => {
        // 先停止适配器
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(1000);
        
        // 尝试再次停止
        const response = await apiClient.stopAdapter('binance');
        
        expect(response.status).toBe(400);
        expect(response.data.error).toContain('not running');
      });
    });

    describe('POST /api/adapters/:name/restart', () => {
      beforeEach(async () => {
        // 确保适配器正在运行
        const response = await apiClient.getAdapter('binance');
        if (!response.data.running) {
          await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
          await testUtils.sleep(2000);
        }
      });

      it('应该成功重启适配器', async () => {
        // 获取重启前的指标
        const beforeResponse = await apiClient.getAdapter('binance');
        const beforeMetrics = beforeResponse.data.metrics;
        
        const response = await apiClient.restartAdapter('binance');
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('success');
        expect(response.data).toHaveProperty('message');
        expect(response.data).toHaveProperty('previousMetrics');
        expect(response.data.success).toBe(true);
        expect(response.data.message).toContain('restarted successfully');
        
        // 验证适配器重启后仍在运行
        await testUtils.sleep(2000);
        const afterResponse = await apiClient.getAdapter('binance');
        expect(afterResponse.data.running).toBe(true);
        expect(afterResponse.data.status).toBe('connected');
      });

      it('对不存在的适配器应该返回404', async () => {
        const response = await apiClient.restartAdapter('nonexistent');
        
        expect(response.status).toBe(404);
        expect(response.data.error).toContain('not found');
      });

      it('对未运行的适配器应该返回400', async () => {
        // 停止适配器
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(1000);
        
        const response = await apiClient.restartAdapter('binance');
        
        expect(response.status).toBe(400);
        expect(response.data.error).toContain('not running');
      });
    });

    describe('PATCH /api/adapters/:name/enabled', () => {
      it('应该成功启用适配器', async () => {
        const response = await apiClient.setAdapterEnabled('binance', true);
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('success');
        expect(response.data).toHaveProperty('message');
        expect(response.data.success).toBe(true);
        expect(response.data.message).toContain('enabled successfully');
        
        // 验证适配器已启用
        const adapterResponse = await apiClient.getAdapter('binance');
        expect(adapterResponse.data.enabled).toBe(true);
      });

      it('应该成功禁用适配器', async () => {
        const response = await apiClient.setAdapterEnabled('binance', false);
        
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.message).toContain('disabled successfully');
        
        // 验证适配器已禁用
        const adapterResponse = await apiClient.getAdapter('binance');
        expect(adapterResponse.data.enabled).toBe(false);
      });

      it('对不存在的适配器应该返回404', async () => {
        const response = await apiClient.setAdapterEnabled('nonexistent', true);
        
        expect(response.status).toBe(404);
        expect(response.data.error).toContain('not found');
      });

      it('对无效enabled值应该返回400', async () => {
        const response = await apiClient.client.patch('/api/adapters/binance/enabled', {
          enabled: 'invalid'
        });
        
        expect(response.status).toBe(400);
        expect(response.data.error).toContain('Invalid enabled value');
      });
    });
  });

  describe('错误处理和边界情况', () => {
    it('应该正确处理并发请求', async () => {
      // 同时发送多个请求
      const promises = [
        apiClient.getAdapters(),
        apiClient.getAdapter('binance'),
        apiClient.getHealth(),
        apiClient.getMetricsJson()
      ];
      
      const responses = await Promise.all(promises);
      
      // 验证所有请求都成功
      responses.forEach(response => {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
      });
    });

    it('应该正确处理无效的HTTP方法', async () => {
      try {
        const response = await apiClient.client.delete('/api/adapters/binance');
        expect(response.status).toBe(404);
      } catch (error: any) {
        // axios可能会抛出错误，这也是可接受的
        expect(error.response?.status).toBe(404);
      }
    });

    it('应该正确处理无效的Content-Type', async () => {
      const response = await apiClient.client.post('/api/adapters/binance/start', 
        'invalid json', 
        {
          headers: { 'Content-Type': 'text/plain' }
        }
      );
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('应该正确处理大型请求体', async () => {
      const largeConfig = {
        ...testIntegrationConfigs.binanceIntegration,
        adapterConfig: {
          ...testIntegrationConfigs.binanceIntegration.adapterConfig,
          largeData: 'x'.repeat(1000000)  // 1MB of data
        }
      };
      
      const response = await apiClient.startAdapter('binance', largeConfig);
      
      // 应该处理大型请求而不崩溃
      expect([200, 400, 413]).toContain(response.status);
    });
  });
});