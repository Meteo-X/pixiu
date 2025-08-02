/**
 * Task 3.1 适配器注册系统 - 负载测试
 * 
 * 验证系统在高负载下的性能表现：
 * - 大量并发API请求处理
 * - 多适配器并发管理
 * - 内存和CPU使用优化
 * - 响应时间和吞吐量基准
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { globalCache } from '@pixiu/shared-core';

import { 
  TestEnvironment,
  ApiClient,
  PerformanceMonitor,
  testUtils,
  createMockAdapterIntegration
} from '../../fixtures/helpers/test-helpers';
import { 
  testIntegrationConfigs,
  performanceCriteria
} from '../../fixtures/test-data/adapter-configs';

describe('Task 3.1 适配器注册系统 - 负载测试', () => {
  let testEnv: TestEnvironment;
  let apiClient: ApiClient;
  let perfMonitor: PerformanceMonitor;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    apiClient = new ApiClient('http://127.0.0.1:18080');
    perfMonitor = new PerformanceMonitor();

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

  describe('API响应性能基准', () => {
    it('健康检查API应该在高并发下保持快速响应', async () => {
      const concurrency = 100;
      const requestsPerBatch = 10;
      const batches = concurrency / requestsPerBatch;

      // 预热
      await apiClient.getHealth();

      const allResults: number[] = [];

      // 分批执行以避免系统过载
      for (let batch = 0; batch < batches; batch++) {
        const batchPromises = [];
        
        for (let i = 0; i < requestsPerBatch; i++) {
          batchPromises.push(
            perfMonitor.measure(`healthCheck_${batch}_${i}`, async () => {
              const response = await apiClient.getHealth();
              expect(response.status).toBe(200);
              return response;
            })
          );
        }

        await Promise.all(batchPromises);
        
        // 短暂延迟避免过载
        await testUtils.sleep(100);
      }

      // 收集所有测量结果
      for (let batch = 0; batch < batches; batch++) {
        for (let i = 0; i < requestsPerBatch; i++) {
          const stats = perfMonitor.getStats(`healthCheck_${batch}_${i}`);
          if (stats) {
            allResults.push(stats.avg);
          }
        }
      }

      // 计算统计信息
      const avgResponseTime = allResults.reduce((sum, time) => sum + time, 0) / allResults.length;
      const maxResponseTime = Math.max(...allResults);
      const p95ResponseTime = allResults.sort((a, b) => a - b)[Math.floor(allResults.length * 0.95)];

      console.log(`Health Check Performance - Avg: ${avgResponseTime}ms, Max: ${maxResponseTime}ms, P95: ${p95ResponseTime}ms`);

      // 验证性能要求
      expect(avgResponseTime).toBeLessThan(performanceCriteria.healthCheck.maxTime);
      expect(p95ResponseTime).toBeLessThan(performanceCriteria.healthCheck.maxTime * 2);
    });

    it('适配器列表API应该在高并发下保持快速响应', async () => {
      const concurrency = 50;
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          perfMonitor.measure(`getAdapters_${i}`, async () => {
            const response = await apiClient.getAdapters();
            expect(response.status).toBe(200);
            expect(response.data.adapters).toBeDefined();
            return response;
          })
        );
      }

      await Promise.all(promises);

      // 验证性能
      const stats = perfMonitor.getStats('getAdapters_0');
      expect(stats!.avg).toBeLessThan(performanceCriteria.apiResponse.maxTime);
    });

    it('适配器详情API应该在高并发下保持快速响应', async () => {
      const concurrency = 50;
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          perfMonitor.measure(`getAdapter_${i}`, async () => {
            const response = await apiClient.getAdapter('binance');
            expect(response.status).toBe(200);
            expect(response.data.name).toBe('binance');
            return response;
          })
        );
      }

      await Promise.all(promises);

      // 验证性能
      const stats = perfMonitor.getStats('getAdapter_0');
      expect(stats!.avg).toBeLessThan(performanceCriteria.apiResponse.maxTime);
    });

    it('指标API应该在高并发下保持快速响应', async () => {
      const concurrency = 30;
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          perfMonitor.measure(`getMetrics_${i}`, async () => {
            const response = await apiClient.getMetricsJson();
            expect(response.status).toBe(200);
            expect(response.data.timestamp).toBeDefined();
            return response;
          })
        );
      }

      await Promise.all(promises);

      // 验证性能
      const stats = perfMonitor.getStats('getMetrics_0');
      expect(stats!.avg).toBeLessThan(performanceCriteria.apiResponse.maxTime);
    });
  });

  describe('适配器操作性能基准', () => {
    beforeEach(async () => {
      // 确保适配器处于已知状态
      const response = await apiClient.getAdapter('binance');
      if (response.data.running) {
        await apiClient.stopAdapter('binance');
        await testUtils.sleep(1000);
      }
    });

    it('适配器启动应该满足性能要求', async () => {
      const startTime = await perfMonitor.measure('adapterStartPerformance', async () => {
        const response = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        expect(response.status).toBe(200);
        
        // 等待适配器完全启动
        await testUtils.waitFor(async () => {
          const adapterResponse = await apiClient.getAdapter('binance');
          return adapterResponse.data.running && adapterResponse.data.status === 'connected';
        }, 10000);
        
        return response;
      });

      const stats = perfMonitor.getStats('adapterStartPerformance');
      expect(stats!.avg).toBeLessThan(performanceCriteria.instanceStart.maxTime);
    });

    it('适配器停止应该满足性能要求', async () => {
      // 先启动适配器
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      const stopTime = await perfMonitor.measure('adapterStopPerformance', async () => {
        const response = await apiClient.stopAdapter('binance');
        expect(response.status).toBe(200);
        
        // 等待适配器完全停止
        await testUtils.waitFor(async () => {
          const adapterResponse = await apiClient.getAdapter('binance');
          return !adapterResponse.data.running;
        }, 5000);
        
        return response;
      });

      const stats = perfMonitor.getStats('adapterStopPerformance');
      expect(stats!.avg).toBeLessThan(performanceCriteria.instanceStop.maxTime);
    });

    it('适配器重启应该满足性能要求', async () => {
      // 先启动适配器
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      const restartTime = await perfMonitor.measure('adapterRestartPerformance', async () => {
        const response = await apiClient.restartAdapter('binance');
        expect(response.status).toBe(200);
        
        // 等待重启完成
        await testUtils.sleep(3000);
        
        const adapterResponse = await apiClient.getAdapter('binance');
        expect(adapterResponse.data.running).toBe(true);
        
        return response;
      });

      const stats = perfMonitor.getStats('adapterRestartPerformance');
      expect(stats!.avg).toBeLessThan(performanceCriteria.instanceStart.maxTime + performanceCriteria.instanceStop.maxTime);
    });
  });

  describe('多适配器并发管理', () => {
    it('应该支持多个适配器并发操作', async () => {
      const adapterCount = Math.min(5, performanceCriteria.concurrentOperations.maxAdapters);
      const adapterNames: string[] = [];

      // 创建多个测试适配器配置
      for (let i = 0; i < adapterCount; i++) {
        adapterNames.push(`load-test-${i}`);
      }

      try {
        // 并发启动多个适配器
        const startPromises = adapterNames.map(name => 
          perfMonitor.measure(`concurrentStart_${name}`, async () => {
            const config = {
              ...testIntegrationConfigs.mockIntegration,
              adapterConfig: {
                ...testIntegrationConfigs.mockIntegration.adapterConfig,
                exchange: name
              }
            };
            
            const response = await apiClient.startAdapter('binance', config);
            if (response.status === 200) {
              await testUtils.sleep(1000);
            }
            return response;
          })
        );

        const startResults = await Promise.allSettled(startPromises);
        
        // 验证大部分启动成功（由于使用同一个binance适配器，可能只有一个成功）
        const successfulStarts = startResults.filter(result => 
          result.status === 'fulfilled' && result.value.status === 200
        );
        
        expect(successfulStarts.length).toBeGreaterThanOrEqual(1);

        // 验证性能
        const startStats = perfMonitor.getStats('concurrentStart_load-test-0');
        if (startStats) {
          expect(startStats.avg).toBeLessThan(performanceCriteria.instanceStart.maxTime * 2);
        }

        // 验证系统稳定性
        const healthResponse = await apiClient.getHealth();
        expect([200, 503]).toContain(healthResponse.status);

      } finally {
        // 清理：停止所有可能启动的适配器
        const adaptersResponse = await apiClient.getAdapters();
        for (const adapter of adaptersResponse.data.adapters) {
          if (adapter.running) {
            await apiClient.stopAdapter(adapter.name).catch(() => {});
          }
        }
      }
    });

    it('应该处理大量并发API请求', async () => {
      // 启动一个适配器用于测试
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(2000);

      const totalRequests = 200;
      const batchSize = 20;
      const batches = totalRequests / batchSize;

      let successfulRequests = 0;
      let failedRequests = 0;

      for (let batch = 0; batch < batches; batch++) {
        const batchPromises = [];
        
        for (let i = 0; i < batchSize; i++) {
          const requestType = i % 4;
          let promise;
          
          switch (requestType) {
            case 0:
              promise = apiClient.getHealth();
              break;
            case 1:
              promise = apiClient.getAdapters();
              break;
            case 2:
              promise = apiClient.getAdapter('binance');
              break;
            case 3:
              promise = apiClient.getMetricsJson();
              break;
            default:
              promise = apiClient.getHealth();
          }
          
          batchPromises.push(
            promise.then(response => {
              if (response.status >= 200 && response.status < 300) {
                successfulRequests++;
              } else {
                failedRequests++;
              }
              return response;
            }).catch(() => {
              failedRequests++;
            })
          );
        }

        await Promise.allSettled(batchPromises);
        
        // 短暂延迟避免过载
        await testUtils.sleep(50);
      }

      // 验证成功率
      const successRate = successfulRequests / (successfulRequests + failedRequests);
      expect(successRate).toBeGreaterThan(0.95); // 至少95%成功率

      console.log(`Concurrent API Test - Success: ${successfulRequests}, Failed: ${failedRequests}, Rate: ${(successRate * 100).toFixed(2)}%`);

      // 验证系统仍然稳定
      const finalHealthResponse = await apiClient.getHealth();
      expect([200, 503]).toContain(finalHealthResponse.status);

      // 清理
      await apiClient.stopAdapter('binance');
    });
  });

  describe('内存和资源使用', () => {
    it('应该在高负载下保持合理的内存使用', async () => {
      const initialMemory = process.memoryUsage();

      // 执行高负载操作
      for (let cycle = 0; cycle < 5; cycle++) {
        // 启动适配器
        const startResponse = await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
        if (startResponse.status === 200) {
          await testUtils.sleep(1000);
        }

        // 执行大量API请求
        const promises = [];
        for (let i = 0; i < 50; i++) {
          promises.push(apiClient.getHealth());
          promises.push(apiClient.getAdapters());
          if (i % 10 === 0) {
            promises.push(apiClient.getMetricsJson());
          }
        }

        await Promise.allSettled(promises);

        // 停止适配器
        const binanceResponse = await apiClient.getAdapter('binance');
        if (binanceResponse.data.running) {
          await apiClient.stopAdapter('binance');
          await testUtils.sleep(500);
        }
      }

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }

      await testUtils.sleep(2000);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // 允许合理的内存增长
      const maxAllowedIncrease = 200 * 1024 * 1024; // 200MB
      expect(memoryIncrease).toBeLessThan(maxAllowedIncrease);

      console.log(`Memory Usage - Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB, Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB, Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    it('应该在长时间运行下保持稳定', async () => {
      const duration = 30000; // 30秒
      const interval = 1000;   // 每秒一次
      const iterations = duration / interval;

      const memorySnapshots: number[] = [];
      const responseTimeSamples: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        // 执行一些操作
        await apiClient.getHealth();
        if (i % 5 === 0) {
          await apiClient.getAdapters();
        }
        if (i % 10 === 0) {
          await apiClient.getMetricsJson();
        }

        const responseTime = Date.now() - startTime;
        responseTimeSamples.push(responseTime);

        // 记录内存使用
        const memory = process.memoryUsage();
        memorySnapshots.push(memory.heapUsed);

        await testUtils.sleep(interval - (Date.now() - startTime));
      }

      // 分析响应时间稳定性
      const avgResponseTime = responseTimeSamples.reduce((sum, time) => sum + time, 0) / responseTimeSamples.length;
      const maxResponseTime = Math.max(...responseTimeSamples);
      
      expect(avgResponseTime).toBeLessThan(performanceCriteria.apiResponse.maxTime);
      expect(maxResponseTime).toBeLessThan(performanceCriteria.apiResponse.maxTime * 3);

      // 分析内存稳定性
      const memoryTrend = memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0];
      const maxMemoryIncrease = 50 * 1024 * 1024; // 50MB
      
      expect(memoryTrend).toBeLessThan(maxMemoryIncrease);

      console.log(`Stability Test - Avg Response: ${avgResponseTime}ms, Max Response: ${maxResponseTime}ms, Memory Trend: ${(memoryTrend / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('吞吐量基准', () => {
    it('应该支持高吞吐量的API请求', async () => {
      const testDuration = 10000; // 10秒
      const startTime = Date.now();
      let requestCount = 0;
      let errorCount = 0;

      // 启动适配器用于测试
      await apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration);
      await testUtils.sleep(1000);

      // 持续发送请求直到时间结束
      const promises: Promise<any>[] = [];
      
      while (Date.now() - startTime < testDuration) {
        const requestType = requestCount % 3;
        let promise;
        
        switch (requestType) {
          case 0:
            promise = apiClient.getHealth();
            break;
          case 1:
            promise = apiClient.getAdapters();
            break;
          case 2:
            promise = apiClient.getAdapter('binance');
            break;
          default:
            promise = apiClient.getHealth();
        }
        
        promises.push(
          promise.then(response => {
            if (response.status >= 200 && response.status < 300) {
              return 'success';
            } else {
              errorCount++;
              return 'error';
            }
          }).catch(() => {
            errorCount++;
            return 'error';
          })
        );
        
        requestCount++;
        
        // 控制并发数量，避免过载
        if (promises.length >= 50) {
          await Promise.allSettled(promises.splice(0, 25));
        }
      }

      // 等待所有剩余请求完成
      await Promise.allSettled(promises);

      const actualDuration = Date.now() - startTime;
      const throughput = (requestCount / actualDuration) * 1000; // 请求/秒
      const errorRate = errorCount / requestCount;

      console.log(`Throughput Test - Requests: ${requestCount}, Duration: ${actualDuration}ms, Throughput: ${throughput.toFixed(2)} req/s, Error Rate: ${(errorRate * 100).toFixed(2)}%`);

      // 验证吞吐量要求
      expect(throughput).toBeGreaterThan(50); // 至少50请求/秒
      expect(errorRate).toBeLessThan(0.05);   // 错误率小于5%

      // 清理
      await apiClient.stopAdapter('binance');
    });
  });
});