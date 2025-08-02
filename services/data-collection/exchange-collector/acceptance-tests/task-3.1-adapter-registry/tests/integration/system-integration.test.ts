/**
 * Task 3.1 适配器注册系统 - 系统集成测试
 * 
 * 端到端的系统集成测试：
 * - 完整的服务启动和配置加载流程
 * - 真实环境下的适配器生命周期管理
 * - 服务间通信和数据流验证
 * - 故障恢复和错误处理测试
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { globalCache } from '@pixiu/shared-core';

import ExchangeCollectorService from '../../../../src/index';
import { 
  TestEnvironment,
  ApiClient,
  PerformanceMonitor,
  testUtils,
  testAssertions
} from '../../fixtures/helpers/test-helpers';
import { 
  testIntegrationConfigs,
  performanceCriteria
} from '../../fixtures/test-data/adapter-configs';

describe('Task 3.1 适配器注册系统 - 系统集成测试', () => {
  let testEnv: TestEnvironment;
  let apiClient: ApiClient;
  let perfMonitor: PerformanceMonitor;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    apiClient = new ApiClient('http://127.0.0.1:18080');
    perfMonitor = new PerformanceMonitor();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    globalCache.destroy();
  });

  describe('服务启动和配置加载', () => {
    it('应该使用完整配置成功启动服务', async () => {
      await testEnv.setup('test-config.yaml');
      
      const service = await perfMonitor.measure('fullServiceStartup', async () => {
        return await testEnv.startService();
      });

      expect(service).toBeInstanceOf(ExchangeCollectorService);

      // 等待服务完全就绪
      await testUtils.waitFor(async () => {
        const health = await apiClient.getHealthReady();
        return health.status === 200;
      }, 15000);

      // 验证服务状态
      const healthResponse = await apiClient.getHealth();
      expect(healthResponse.status).toBe(200);
      testAssertions.assertHealthResponse(healthResponse.data);

      await testEnv.stopService();
    });

    it('应该使用最小配置成功启动服务', async () => {
      await testEnv.setup('minimal-config.yaml');
      
      const service = await testEnv.startService();
      expect(service).toBeInstanceOf(ExchangeCollectorService);

      // 验证基本功能可用
      await testUtils.waitFor(async () => {
        const live = await apiClient.getHealthLive();
        return live.status === 200;
      }, 10000);

      const liveResponse = await apiClient.getHealthLive();
      expect(liveResponse.status).toBe(200);
      expect(liveResponse.data.alive).toBe(true);

      await testEnv.stopService();
    });

    it('应该支持多适配器配置启动', async () => {
      await testEnv.setup('multi-adapter-config.yaml');
      
      const service = await testEnv.startService();
      expect(service).toBeInstanceOf(ExchangeCollectorService);

      // 等待服务就绪
      await testUtils.waitFor(async () => {
        const ready = await apiClient.getHealthReady();
        return ready.status === 200;
      }, 15000);

      // 验证多个适配器已注册
      const adaptersResponse = await apiClient.getAdapters();
      expect(adaptersResponse.status).toBe(200);
      expect(adaptersResponse.data.total).toBeGreaterThan(1);

      // 验证特定适配器存在
      const binanceAdapter = adaptersResponse.data.adapters.find((a: any) => a.name === 'binance');
      expect(binanceAdapter).toBeDefined();
      expect(binanceAdapter.enabled).toBe(true);

      await testEnv.stopService();
    });

    it('应该正确处理配置错误', async () => {
      await testEnv.setup('invalid-config.yaml');
      
      // 服务启动应该失败或运行异常
      try {
        const service = await testEnv.startService();
        
        // 如果服务启动成功，检查是否处于不健康状态
        const healthResponse = await apiClient.getHealth();
        if (healthResponse.status === 200) {
          // 服务可能启动但处于不健康状态
          expect(healthResponse.data.status).toBe('unhealthy');
        }
        
        await testEnv.stopService();
      } catch (error) {
        // 预期的配置错误导致启动失败
        expect(error).toBeDefined();
      }
    });
  });

  describe('端到端适配器生命周期管理', () => {
    beforeAll(async () => {
      await testEnv.setup('test-config.yaml');
      await testEnv.startService();
      
      await testUtils.waitFor(async () => {
        const health = await apiClient.getHealthReady();
        return health.status === 200;
      }, 15000);
    });

    afterAll(async () => {
      await testEnv.stopService();
    });

    it('应该支持完整的适配器生命周期', async () => {
      // 验证初始状态
      let adapterResponse = await apiClient.getAdapter('binance');
      expect(adapterResponse.status).toBe(200);
      expect(adapterResponse.data.enabled).toBe(true);

      // 如果适配器正在运行，先停止它
      if (adapterResponse.data.running) {
        const stopResponse = await apiClient.stopAdapter('binance');
        expect(stopResponse.status).toBe(200);
        await testUtils.sleep(1000);
      }

      // 1. 启动适配器
      const startResponse = await perfMonitor.measure('e2eAdapterStart', async () => {
        return await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      });

      expect(startResponse.status).toBe(200);
      expect(startResponse.data.success).toBe(true);

      // 等待适配器完全启动
      await testUtils.waitFor(async () => {
        const response = await apiClient.getAdapter('binance');
        return response.data.running && response.data.status === 'connected';
      }, 10000);

      // 2. 验证运行状态
      adapterResponse = await apiClient.getAdapter('binance');
      expect(adapterResponse.data.running).toBe(true);
      expect(adapterResponse.data.status).toBe('connected');
      expect(adapterResponse.data.healthy).toBe(true);

      // 3. 验证指标收集
      expect(adapterResponse.data.metrics).toBeDefined();
      expect(adapterResponse.data.metrics.adapterStatus).toBe(2); // CONNECTED
      expect(adapterResponse.data.metrics.lastActivity).toBeGreaterThan(0);

      // 4. 重启适配器
      const restartResponse = await perfMonitor.measure('e2eAdapterRestart', async () => {
        return await apiClient.restartAdapter('binance');
      });

      expect(restartResponse.status).toBe(200);
      expect(restartResponse.data.success).toBe(true);

      // 等待重启完成
      await testUtils.sleep(3000);

      // 验证重启后状态
      adapterResponse = await apiClient.getAdapter('binance');
      expect(adapterResponse.data.running).toBe(true);
      expect(adapterResponse.data.status).toBe('connected');

      // 5. 停止适配器
      const stopResponse = await perfMonitor.measure('e2eAdapterStop', async () => {
        return await apiClient.stopAdapter('binance');
      });

      expect(stopResponse.status).toBe(200);
      expect(stopResponse.data.success).toBe(true);

      // 验证停止状态
      await testUtils.sleep(1000);
      adapterResponse = await apiClient.getAdapter('binance');
      expect(adapterResponse.data.running).toBe(false);
      expect(adapterResponse.data.status).toBe('stopped');
    });

    it('应该支持适配器并发操作', async () => {
      // 确保适配器处于停止状态
      const initialResponse = await apiClient.getAdapter('binance');
      if (initialResponse.data.running) {
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(1000);
      }

      // 并发启动多个操作
      const operations = [
        apiClient.getAdapter('binance'),
        apiClient.getAdapters(),
        apiClient.getHealth(),
        apiClient.getMetricsJson()
      ];

      const responses = await Promise.all(operations);

      // 验证所有操作都成功
      responses.forEach((response, index) => {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
      });

      // 验证数据一致性
      const adapterResponse = responses[0];
      const adaptersResponse = responses[1];
      const healthResponse = responses[2];

      expect(adapterResponse.data.name).toBe('binance');
      expect(adaptersResponse.data.adapters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'binance' })
        ])
      );
      expect(healthResponse.data.service).toBe('exchange-collector');
    });

    it('应该正确处理适配器状态变更的传播', async () => {
      // 停止适配器（如果正在运行）
      let adapterResponse = await apiClient.getAdapter('binance');
      if (adapterResponse.data.running) {
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(1000);
      }

      // 启动适配器
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      // 验证健康检查反映了适配器状态
      const healthResponse = await apiClient.getHealth();
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.data.status).toBe('healthy');
      expect(healthResponse.data.checks.adapters.status).toBe('pass');
      expect(healthResponse.data.checks.adapters.runningCount).toBeGreaterThan(0);

      // 停止适配器
      await apiClient.stopAdapter('binance');
      await testUtils.sleep(1000);

      // 验证健康检查反映了变更
      const unhealthyResponse = await apiClient.getHealth();
      expect(unhealthyResponse.status).toBe(503);
      expect(unhealthyResponse.data.status).toBe('unhealthy');
      expect(unhealthyResponse.data.checks.adapters.status).toBe('fail');
      expect(unhealthyResponse.data.checks.adapters.runningCount).toBe(0);
    });
  });

  describe('故障恢复和错误处理', () => {
    beforeAll(async () => {
      await testEnv.setup('test-config.yaml');
      await testEnv.startService();
      
      await testUtils.waitFor(async () => {
        const health = await apiClient.getHealthReady();
        return health.status === 200;
      }, 15000);
    });

    afterAll(async () => {
      await testEnv.stopService();
    });

    it('应该正确处理API错误和恢复', async () => {
      // 测试不存在的适配器
      const notFoundResponse = await apiClient.getAdapter('nonexistent');
      expect(notFoundResponse.status).toBe(404);
      expect(notFoundResponse.data.error).toContain('not found');

      // 验证服务仍然正常
      const healthResponse = await apiClient.getHealth();
      expect(healthResponse.status).toBe(200);

      // 测试无效操作
      const invalidStartResponse = await apiClient.startAdapter('nonexistent', testIntegrationConfigs.binanceIntegration);
      expect(invalidStartResponse.status).toBe(404);

      // 验证服务仍然正常
      const healthResponse2 = await apiClient.getHealth();
      expect(healthResponse2.status).toBe(200);
    });

    it('应该处理适配器启动失败', async () => {
      // 确保适配器停止
      const binanceResponse = await apiClient.getAdapter('binance');
      if (binanceResponse.data.running) {
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(1000);
      }

      // 尝试使用无效配置启动适配器
      const invalidConfig = {
        adapterConfig: {
          exchange: 'binance',
          endpoints: {
            ws: 'invalid-url',
            rest: 'invalid-url'
          },
          connection: {
            timeout: -1000,
            maxRetries: -1,
            retryInterval: -500,
            heartbeatInterval: -10000
          },
          subscription: {
            symbols: [],
            dataTypes: []
          }
        },
        publishConfig: testIntegrationConfigs.binanceIntegration.publishConfig,
        monitoringConfig: testIntegrationConfigs.binanceIntegration.monitoringConfig
      };

      const failedStartResponse = await apiClient.startAdapter('binance', invalidConfig);
      
      // 启动可能失败或成功但适配器处于错误状态
      if (failedStartResponse.status === 200) {
        // 等待可能的错误状态
        await testUtils.sleep(2000);
        
        const adapterStatus = await apiClient.getAdapter('binance');
        // 适配器可能启动但处于不健康状态
        expect(adapterStatus.data.healthy).toBe(false);
      } else {
        // 启动直接失败
        expect(failedStartResponse.status).toBeGreaterThanOrEqual(400);
      }

      // 验证系统仍然稳定
      const healthResponse = await apiClient.getHealth();
      expect([200, 503]).toContain(healthResponse.status); // 可能healthy或unhealthy，但不应该崩溃
    });

    it('应该支持服务重启后的状态恢复', async () => {
      // 启动适配器
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      // 验证运行状态
      const preRestartResponse = await apiClient.getAdapter('binance');
      expect(preRestartResponse.data.running).toBe(true);

      // 重启服务
      await testEnv.stopService();
      await testUtils.sleep(2000);
      
      await testEnv.startService();
      await testUtils.waitFor(async () => {
        const health = await apiClient.getHealthReady();
        return health.status === 200;
      }, 15000);

      // 验证适配器配置仍然存在
      const postRestartResponse = await apiClient.getAdapter('binance');
      expect(postRestartResponse.status).toBe(200);
      expect(postRestartResponse.data.name).toBe('binance');
      expect(postRestartResponse.data.enabled).toBe(true);

      // 注意：实例状态可能重置，但配置应该保持
      expect(postRestartResponse.data.version).toBe(preRestartResponse.data.version);
      expect(postRestartResponse.data.description).toBe(preRestartResponse.data.description);
    });

    it('应该处理高负载情况', async () => {
      // 启动适配器
      const startResponse = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      if (startResponse.status === 200) {
        await testUtils.sleep(2000);
      }

      // 生成高频率的API请求
      const requests = [];
      const requestCount = 50;
      
      for (let i = 0; i < requestCount; i++) {
        requests.push(apiClient.getAdapter('binance'));
        requests.push(apiClient.getHealth());
        if (i % 10 === 0) {
          requests.push(apiClient.getAdapters());
        }
      }

      const responses = await Promise.allSettled(requests);

      // 验证大部分请求成功
      const successfulResponses = responses.filter(result => 
        result.status === 'fulfilled' && 
        (result.value as any).status >= 200 && 
        (result.value as any).status < 300
      );

      const successRate = successfulResponses.length / responses.length;
      expect(successRate).toBeGreaterThan(0.9); // 至少90%成功率

      // 验证服务仍然稳定
      const finalHealthResponse = await apiClient.getHealth();
      expect([200, 503]).toContain(finalHealthResponse.status);
    });
  });

  describe('性能和资源使用', () => {
    it('端到端性能应满足要求', async () => {
      await testEnv.setup('test-config.yaml');
      
      // 测试服务启动性能
      const service = await perfMonitor.measure('e2eServiceStartup', async () => {
        return await testEnv.startService();
      });

      await testUtils.waitFor(async () => {
        const health = await apiClient.getHealthReady();
        return health.status === 200;
      }, 15000);

      // 测试API响应性能
      await perfMonitor.measure('e2eHealthCheck', async () => {
        await apiClient.getHealth();
      });

      await perfMonitor.measure('e2eGetAdapters', async () => {
        await apiClient.getAdapters();
      });

      await perfMonitor.measure('e2eGetMetrics', async () => {
        await apiClient.getMetricsJson();
      });

      // 验证性能指标
      const startupStats = perfMonitor.getStats('e2eServiceStartup');
      expect(startupStats!.avg).toBeLessThan(performanceCriteria.serviceStartup.maxTime);

      const healthStats = perfMonitor.getStats('e2eHealthCheck');
      expect(healthStats!.avg).toBeLessThan(performanceCriteria.healthCheck.maxTime);

      const apiStats = perfMonitor.getStats('e2eGetAdapters');
      expect(apiStats!.avg).toBeLessThan(performanceCriteria.apiResponse.maxTime);

      await testEnv.stopService();
    });

    it('应该在长时间运行后保持稳定', async () => {
      await testEnv.setup('test-config.yaml');
      await testEnv.startService();
      
      await testUtils.waitFor(async () => {
        const health = await apiClient.getHealthReady();
        return health.status === 200;
      }, 15000);

      const initialMemory = process.memoryUsage();

      // 模拟长时间运行的操作
      for (let cycle = 0; cycle < 10; cycle++) {
        // 启动适配器
        await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        await testUtils.sleep(500);

        // 执行一些操作
        await apiClient.getAdapters();
        await apiClient.getHealth();
        await apiClient.getMetricsJson();

        // 停止适配器
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(500);
      }

      // 检查内存使用
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // 允许合理的内存增长（例如缓存、日志等）
      const maxAllowedIncrease = 100 * 1024 * 1024; // 100MB
      expect(memoryIncrease).toBeLessThan(maxAllowedIncrease);

      // 验证服务仍然响应
      const finalHealthResponse = await apiClient.getHealth();
      expect([200, 503]).toContain(finalHealthResponse.status);

      await testEnv.stopService();
    });
  });
});