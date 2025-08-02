/**
 * 验收测试：数据路由和分发逻辑 (Data Routing and Distribution Logic)
 * 
 * 测试目标：
 * 1. 验证基于规则的数据路由功能
 * 2. 验证多目标数据分发
 * 3. 验证路由缓存性能
 * 4. 验证回退机制和容错处理
 * 5. 验证动态路由规则更新
 * 6. 验证复合路由条件
 */

import { globalCache } from '@pixiu/shared-core';
import { RouterStage, RoutingRule } from '../../src/pipeline/stages/router-stage';
import {
  createMockMarketData,
  createMultiExchangeData
} from '../../fixtures/mock-market-data';
import {
  createRouterStageConfig,
  createDefaultRoutingRules,
  createCompositeRoutingRules,
  createMultiTargetRoutingRules
} from '../../fixtures/test-configurations';
import { PipelineTestUtils } from '../../helpers/pipeline-test-utils';

describe('Task 3.3 - 数据路由和分发逻辑 (Data Routing and Distribution Logic)', () => {
  let routerStage: RouterStage;

  beforeEach(async () => {
    const config = createRouterStageConfig();
    routerStage = new RouterStage(config);
    await routerStage.initialize(config);
  });

  afterEach(async () => {
    if (routerStage) {
      await routerStage.destroy();
    }
  });

  afterAll(async () => {
    globalCache.destroy();
  });

  describe('基于规则的路由功能 (Rule-Based Routing)', () => {
    test('should route data based on exact match conditions', async () => {
      const marketData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await routerStage.process(pipelineData, context);

      expect(result).not.toBeNull();
      expect(result!.metadata.routingKeys).toBeDefined();
      expect(result!.metadata.routingKeys!.length).toBeGreaterThan(0);
      expect(result!.metadata.routingKeys).toContain('binance-ticker-data');
    });

    test('should route data based on pattern matching', async () => {
      const btcData = createMockMarketData({
        exchange: 'huobi',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(btcData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await routerStage.process(pipelineData, context);

      expect(result).not.toBeNull();
      expect(result!.metadata.routingKeys).toContain('btc-market-data');
    });

    test('should route data based on function conditions', async () => {
      const highVolumeData = createMockMarketData({
        exchange: 'binance',
        symbol: 'ETHUSDT',
        type: 'ticker',
        data: {
          price: 3000,
          volume: 15.5 // 高于阈值10
        }
      });

      const pipelineData = PipelineTestUtils.createPipelineData(highVolumeData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await routerStage.process(pipelineData, context);

      expect(result).not.toBeNull();
      expect(result!.metadata.routingKeys).toContain('high-volume-data');
    });

    test('should handle no matching rules with fallback', async () => {
      const unmatchedData = createMockMarketData({
        exchange: 'unknown-exchange',
        symbol: 'UNKNOWN',
        type: 'unknown'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(unmatchedData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await routerStage.process(pipelineData, context);

      expect(result).not.toBeNull();
      // 应该使用fallback目标
      expect(result!.attributes.routingTargets).toBeDefined();
    });

    test('should apply first match strategy correctly', async () => {
      // 创建匹配多个规则的数据
      const multiMatchData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT', // 匹配binance规则和BTC规则
        type: 'ticker'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(multiMatchData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await routerStage.process(pipelineData, context);

      expect(result).not.toBeNull();
      expect(result!.attributes.appliedRules).toHaveLength(1);
      expect(result!.attributes.appliedRules[0]).toBe('binance-ticker'); // 优先级最高的规则
    });
  });

  describe('复合路由条件 (Composite Routing Conditions)', () => {
    test('should handle AND composite conditions', async () => {
      // 创建符合复合条件的配置
      const compositeConfig = createRouterStageConfig({
        rules: createCompositeRoutingRules()
      });

      const compositeRouter = new RouterStage(compositeConfig);
      await compositeRouter.initialize(compositeConfig);

      const matchingData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(matchingData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await compositeRouter.process(pipelineData, context);

      expect(result).not.toBeNull();
      expect(result!.metadata.routingKeys).toContain('binance-btc-ticker');

      await compositeRouter.destroy();
    });

    test('should handle OR composite conditions', async () => {
      const orConditionRule: RoutingRule = {
        id: 'or-condition-test',
        name: 'OR Condition Test',
        enabled: true,
        priority: 100,
        condition: {
          type: 'composite',
          operator: 'OR',
          conditions: [
            {
              type: 'exact',
              field: 'exchange',
              value: 'binance'
            },
            {
              type: 'exact',
              field: 'exchange',
              value: 'huobi'
            }
          ]
        },
        target: {
          type: 'topic',
          destination: 'major-exchanges'
        }
      };

      const orConfig = createRouterStageConfig({
        rules: [orConditionRule]
      });

      const orRouter = new RouterStage(orConfig);
      await orRouter.initialize(orConfig);

      // 测试第一个条件匹配
      const binanceData = createMockMarketData({ exchange: 'binance' });
      const binancePipelineData = PipelineTestUtils.createPipelineData(binanceData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const binanceResult = await orRouter.process(binancePipelineData, context);
      expect(binanceResult!.metadata.routingKeys).toContain('major-exchanges');

      // 测试第二个条件匹配
      const huobiData = createMockMarketData({ exchange: 'huobi' });
      const huobiPipelineData = PipelineTestUtils.createPipelineData(huobiData, 'test-source');
      const huobiResult = await orRouter.process(huobiPipelineData, context);
      expect(huobiResult!.metadata.routingKeys).toContain('major-exchanges');

      await orRouter.destroy();
    });

    test('should handle nested composite conditions', async () => {
      const nestedRule: RoutingRule = {
        id: 'nested-condition',
        name: 'Nested Condition Test',
        enabled: true,
        priority: 100,
        condition: {
          type: 'composite',
          operator: 'AND',
          conditions: [
            {
              type: 'exact',
              field: 'exchange',
              value: 'binance'
            },
            {
              type: 'composite',
              operator: 'OR',
              conditions: [
                {
                  type: 'pattern',
                  field: 'symbol',
                  value: 'BTC.*'
                },
                {
                  type: 'pattern',
                  field: 'symbol',
                  value: 'ETH.*'
                }
              ]
            }
          ]
        },
        target: {
          type: 'topic',
          destination: 'binance-major-coins'
        }
      };

      const nestedConfig = createRouterStageConfig({
        rules: [nestedRule]
      });

      const nestedRouter = new RouterStage(nestedConfig);
      await nestedRouter.initialize(nestedConfig);

      const testData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(testData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await nestedRouter.process(pipelineData, context);
      expect(result!.metadata.routingKeys).toContain('binance-major-coins');

      await nestedRouter.destroy();
    });
  });

  describe('多目标数据分发 (Multi-Target Distribution)', () => {
    test('should distribute data to multiple targets', async () => {
      const multiTargetConfig = createRouterStageConfig({
        rules: createMultiTargetRoutingRules(),
        enableDuplication: true
      });

      const multiRouter = new RouterStage(multiTargetConfig);
      await multiRouter.initialize(multiTargetConfig);

      const btcData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(btcData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await multiRouter.process(pipelineData, context);

      expect(result).not.toBeNull();
      expect(result!.metadata.routingKeys).toEqual(['btc-primary', 'btc-analytics', 'btc-alerts']);

      const routingMetrics = multiRouter.getRoutingMetrics();
      expect(routingMetrics.duplications).toBeGreaterThan(0);

      await multiRouter.destroy();
    });

    test('should handle data duplication correctly', async () => {
      const config = createRouterStageConfig({
        rules: createMultiTargetRoutingRules(),
        enableDuplication: true
      });

      const duplicatingRouter = new RouterStage(config);
      await duplicatingRouter.initialize(config);

      const testData = createMockMarketData({
        symbol: 'BTCUSDT'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(testData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await duplicatingRouter.process(pipelineData, context);

      expect(result).not.toBeNull();
      expect(result!.attributes.duplicatedTargets).toBeDefined();

      await duplicatingRouter.destroy();
    });

    test('should handle all matches strategy', async () => {
      const allMatchesConfig = createRouterStageConfig({
        routingStrategy: 'all_matches',
        rules: [
          {
            id: 'rule1',
            name: 'Rule 1',
            enabled: true,
            priority: 100,
            condition: {
              type: 'exact',
              field: 'exchange',
              value: 'binance'
            },
            target: {
              type: 'topic',
              destination: 'target1'
            }
          },
          {
            id: 'rule2',
            name: 'Rule 2',
            enabled: true,
            priority: 90,
            condition: {
              type: 'pattern',
              field: 'symbol',
              value: 'BTC.*'
            },
            target: {
              type: 'topic',
              destination: 'target2'
            }
          }
        ]
      });

      const allMatchesRouter = new RouterStage(allMatchesConfig);
      await allMatchesRouter.initialize(allMatchesConfig);

      const matchingData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT'
      });

      const pipelineData = PipelineTestUtils.createPipelineData(matchingData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await allMatchesRouter.process(pipelineData, context);

      expect(result).not.toBeNull();
      expect(result!.attributes.appliedRules).toHaveLength(2);
      expect(result!.metadata.routingKeys).toEqual(['target1', 'target2']);

      await allMatchesRouter.destroy();
    });
  });

  describe('路由缓存性能 (Routing Cache Performance)', () => {
    test('should cache routing results for performance', async () => {
      const cacheConfig = createRouterStageConfig({
        enableCaching: true,
        cacheSize: 100,
        cacheTtl: 10000 // 10 seconds
      });

      const cachingRouter = new RouterStage(cacheConfig);
      await cachingRouter.initialize(cacheConfig);

      const testData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      // 第一次处理 - 缓存未命中
      const pipelineData1 = PipelineTestUtils.createPipelineData(testData, 'test-source');
      await cachingRouter.process(pipelineData1, context);

      // 第二次处理相同数据 - 缓存命中
      const pipelineData2 = PipelineTestUtils.createPipelineData(testData, 'test-source');
      await cachingRouter.process(pipelineData2, context);

      const metrics = cachingRouter.getRoutingMetrics();
      expect(metrics.cacheHits).toBeGreaterThan(0);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);

      await cachingRouter.destroy();
    });

    test('should clear cache when requested', async () => {
      const cacheConfig = createRouterStageConfig({
        enableCaching: true
      });

      const cachingRouter = new RouterStage(cacheConfig);
      await cachingRouter.initialize(cacheConfig);

      const testData = createMockMarketData();
      const pipelineData = PipelineTestUtils.createPipelineData(testData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      await cachingRouter.process(pipelineData, context);
      
      let metrics = cachingRouter.getRoutingMetrics();
      expect(metrics.cacheSize).toBeGreaterThan(0);

      cachingRouter.clearCache();
      
      metrics = cachingRouter.getRoutingMetrics();
      expect(metrics.cacheSize).toBe(0);

      await cachingRouter.destroy();
    });

    test('should handle cache TTL expiration', async () => {
      const shortTtlConfig = createRouterStageConfig({
        enableCaching: true,
        cacheTtl: 100 // 100ms
      });

      const ttlRouter = new RouterStage(shortTtlConfig);
      await ttlRouter.initialize(shortTtlConfig);

      const testData = createMockMarketData();
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      // 第一次处理
      const pipelineData1 = PipelineTestUtils.createPipelineData(testData, 'test-source');
      await ttlRouter.process(pipelineData1, context);

      // 等待TTL过期
      await PipelineTestUtils.wait(150);

      // 第二次处理 - 缓存应该已过期
      const pipelineData2 = PipelineTestUtils.createPipelineData(testData, 'test-source');
      await ttlRouter.process(pipelineData2, context);

      const metrics = ttlRouter.getRoutingMetrics();
      expect(metrics.cacheMisses).toBe(2); // 两次都是缓存未命中

      await ttlRouter.destroy();
    });
  });

  describe('动态路由规则管理 (Dynamic Routing Rule Management)', () => {
    test('should add new routing rules dynamically', async () => {
      const initialMetrics = routerStage.getRoutingMetrics();
      const initialRuleCount = initialMetrics.rulesCount;

      const newRule: RoutingRule = {
        id: 'dynamic-rule',
        name: 'Dynamic Rule',
        enabled: true,
        priority: 150,
        condition: {
          type: 'exact',
          field: 'exchange',
          value: 'okx'
        },
        target: {
          type: 'topic',
          destination: 'okx-data'
        }
      };

      routerStage.addRoutingRule(newRule);

      const updatedMetrics = routerStage.getRoutingMetrics();
      expect(updatedMetrics.rulesCount).toBe(initialRuleCount + 1);

      // 测试新规则是否生效
      const okxData = createMockMarketData({ exchange: 'okx' });
      const pipelineData = PipelineTestUtils.createPipelineData(okxData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await routerStage.process(pipelineData, context);
      expect(result!.metadata.routingKeys).toContain('okx-data');
    });

    test('should remove routing rules dynamically', async () => {
      const initialMetrics = routerStage.getRoutingMetrics();
      const initialRuleCount = initialMetrics.rulesCount;

      const removed = routerStage.removeRoutingRule('binance-ticker');
      expect(removed).toBe(true);

      const updatedMetrics = routerStage.getRoutingMetrics();
      expect(updatedMetrics.rulesCount).toBe(initialRuleCount - 1);

      // 测试规则是否已移除
      const binanceData = createMockMarketData({ exchange: 'binance' });
      const pipelineData = PipelineTestUtils.createPipelineData(binanceData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await routerStage.process(pipelineData, context);
      expect(result!.metadata.routingKeys).not.toContain('binance-ticker-data');
    });

    test('should update existing routing rules', async () => {
      const updated = routerStage.updateRoutingRule('binance-ticker', {
        enabled: false
      });
      expect(updated).toBe(true);

      // 测试规则是否已禁用
      const binanceData = createMockMarketData({ exchange: 'binance' });
      const pipelineData = PipelineTestUtils.createPipelineData(binanceData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await routerStage.process(pipelineData, context);
      expect(result!.metadata.routingKeys).not.toContain('binance-ticker-data');
    });
  });

  describe('错误处理和容错 (Error Handling and Fault Tolerance)', () => {
    test('should handle invalid routing conditions gracefully', async () => {
      const invalidRule: RoutingRule = {
        id: 'invalid-rule',
        name: 'Invalid Rule',
        enabled: true,
        priority: 100,
        condition: {
          type: 'function',
          field: 'custom',
          function: () => {
            throw new Error('Condition evaluation error');
          }
        },
        target: {
          type: 'topic',
          destination: 'error-target'
        }
      };

      routerStage.addRoutingRule(invalidRule);

      const testData = createMockMarketData();
      const pipelineData = PipelineTestUtils.createPipelineData(testData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      // 应该能处理错误而不崩溃
      await expect(routerStage.process(pipelineData, context)).rejects.toThrow();
    });

    test('should use fallback when no rules match', async () => {
      const fallbackConfig = createRouterStageConfig({
        rules: [], // 没有规则
        enableFallback: true,
        fallbackTarget: {
          type: 'topic',
          destination: 'fallback-topic'
        }
      });

      const fallbackRouter = new RouterStage(fallbackConfig);
      await fallbackRouter.initialize(fallbackConfig);

      const testData = createMockMarketData();
      const pipelineData = PipelineTestUtils.createPipelineData(testData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      const result = await fallbackRouter.process(pipelineData, context);
      expect(result!.metadata.routingKeys).toContain('fallback-topic');

      const metrics = fallbackRouter.getRoutingMetrics();
      expect(metrics.fallbackUsed).toBeGreaterThan(0);

      await fallbackRouter.destroy();
    });

    test('should handle routing stage health checks', async () => {
      expect(routerStage.isHealthy()).toBe(true);

      // 模拟不健康状态
      routerStage.setHealthy(false);
      expect(routerStage.isHealthy()).toBe(false);

      // 恢复健康状态
      routerStage.setHealthy(true);
      expect(routerStage.isHealthy()).toBe(true);
    });
  });

  describe('路由性能指标 (Routing Performance Metrics)', () => {
    test('should track routing metrics correctly', async () => {
      const testData = createMockMarketData({ exchange: 'binance' });
      const pipelineData = PipelineTestUtils.createPipelineData(testData, 'test-source');
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      await routerStage.process(pipelineData, context);

      const metrics = routerStage.getRoutingMetrics();
      expect(metrics.totalRouted).toBe(1);
      expect(metrics.rulesCount).toBeGreaterThan(0);
    });

    test('should track cache performance metrics', async () => {
      const cacheConfig = createRouterStageConfig({
        enableCaching: true
      });

      const cachingRouter = new RouterStage(cacheConfig);
      await cachingRouter.initialize(cacheConfig);

      const testData = createMockMarketData({ exchange: 'binance' });
      const context = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 1,
        startTime: Date.now(),
        correlationId: 'test-correlation',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      // 处理两次相同数据
      const pipelineData1 = PipelineTestUtils.createPipelineData(testData, 'test-source');
      await cachingRouter.process(pipelineData1, context);

      const pipelineData2 = PipelineTestUtils.createPipelineData(testData, 'test-source');
      await cachingRouter.process(pipelineData2, context);

      const metrics = cachingRouter.getRoutingMetrics();
      expect(metrics.totalRouted).toBe(2);
      expect(metrics.cacheHits).toBeGreaterThanOrEqual(1);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);

      await cachingRouter.destroy();
    });
  });
});