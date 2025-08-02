/**
 * 回归测试：接口稳定性 (Interface Stability)
 * 
 * 测试目标：
 * 1. 验证管道API接口的向后兼容性
 * 2. 验证数据结构的稳定性
 * 3. 验证配置接口的一致性
 * 4. 验证事件接口的兼容性
 * 5. 验证错误类型的稳定性
 */

import { globalCache } from '@pixiu/shared-core';
import {
  DataPipeline,
  PipelineStage,
  PipelineData,
  PipelineContext,
  PipelineConfig,
  PipelineMetrics,
  StageConfig,
  StageMetrics,
  PipelineStageType
} from '../../src/pipeline/core/data-pipeline';
import {
  BufferStage,
  BufferStageConfig
} from '../../src/pipeline/stages/buffer-stage';
import {
  RouterStage,
  RouterStageConfig,
  RoutingRule
} from '../../src/pipeline/stages/router-stage';
import {
  ExchangeDataPipeline,
  ExchangeDataPipelineFactory
} from '../../src/pipeline/exchange-data-pipeline';
import {
  createMockMarketData
} from '../../fixtures/mock-market-data';
import {
  createBasePipelineConfig,
  createBufferStageConfig,
  createRouterStageConfig
} from '../../fixtures/test-configurations';
import {
  TestDataPipeline,
  MockMonitor,
  MockErrorHandler,
  MockPubSubClient
} from '../../helpers/pipeline-test-utils';

describe('Task 3.3 Regression - 接口稳定性 (Interface Stability)', () => {
  afterAll(async () => {
    globalCache.destroy();
  });

  describe('核心管道接口稳定性 (Core Pipeline Interface Stability)', () => {
    test('should maintain DataPipeline abstract class interface', () => {
      // 验证DataPipeline抽象类的核心方法签名
      const config = createBasePipelineConfig();
      const monitor = new MockMonitor();
      const errorHandler = new MockErrorHandler();
      
      const pipeline = new TestDataPipeline(config, monitor, errorHandler);

      // 验证核心方法存在
      expect(typeof pipeline.initialize).toBe('function');
      expect(typeof pipeline.start).toBe('function');
      expect(typeof pipeline.stop).toBe('function');
      expect(typeof pipeline.destroy).toBe('function');
      expect(typeof pipeline.process).toBe('function');
      expect(typeof pipeline.getMetrics).toBe('function');
      expect(typeof pipeline.isHealthy).toBe('function');

      // 验证事件发射器接口
      expect(typeof pipeline.on).toBe('function');
      expect(typeof pipeline.emit).toBe('function');
      expect(typeof pipeline.removeListener).toBe('function');
    });

    test('should maintain PipelineConfig interface structure', () => {
      const config: PipelineConfig = createBasePipelineConfig();

      // 验证必需字段
      expect(typeof config.id).toBe('string');
      expect(typeof config.name).toBe('string');
      expect(Array.isArray(config.stages)).toBe(true);
      expect(typeof config.errorHandling).toBe('object');
      expect(typeof config.monitoring).toBe('object');
      expect(typeof config.performance).toBe('object');

      // 验证错误处理配置结构
      expect(typeof config.errorHandling.strategy).toBe('string');
      expect(typeof config.errorHandling.maxRetries).toBe('number');
      expect(typeof config.errorHandling.retryInterval).toBe('number');

      // 验证监控配置结构
      expect(typeof config.monitoring.enableMetrics).toBe('boolean');
      expect(typeof config.monitoring.enableTracing).toBe('boolean');
      expect(typeof config.monitoring.metricsInterval).toBe('number');
      expect(typeof config.monitoring.healthCheckInterval).toBe('number');
      expect(typeof config.monitoring.alertThresholds).toBe('object');

      // 验证性能配置结构
      expect(typeof config.performance.maxConcurrency).toBe('number');
      expect(typeof config.performance.queueSize).toBe('number');
      expect(typeof config.performance.backpressureStrategy).toBe('string');
      expect(typeof config.performance.memoryLimit).toBe('number');
      expect(typeof config.performance.gcThreshold).toBe('number');
    });

    test('should maintain PipelineData interface structure', () => {
      const marketData = createMockMarketData();
      const pipelineData: PipelineData = {
        id: 'test-id',
        marketData,
        metadata: {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          dataType: 'ticker',
          priority: 1,
          retryCount: 0
        },
        timestamp: Date.now(),
        source: 'test-source',
        attributes: {}
      };

      // 验证必需字段
      expect(typeof pipelineData.id).toBe('string');
      expect(typeof pipelineData.marketData).toBe('object');
      expect(typeof pipelineData.metadata).toBe('object');
      expect(typeof pipelineData.timestamp).toBe('number');
      expect(typeof pipelineData.source).toBe('string');
      expect(typeof pipelineData.attributes).toBe('object');

      // 验证只读字段
      expect(() => {
        (pipelineData as any).id = 'new-id';
      }).not.toThrow(); // TypeScript只读，运行时可修改

      // 验证metadata结构
      expect(typeof pipelineData.metadata.exchange).toBe('string');
      expect(typeof pipelineData.metadata.symbol).toBe('string');
      expect(typeof pipelineData.metadata.dataType).toBe('string');
      expect(typeof pipelineData.metadata.priority).toBe('number');
      expect(typeof pipelineData.metadata.retryCount).toBe('number');
    });

    test('should maintain PipelineContext interface structure', () => {
      const context: PipelineContext = {
        pipelineId: 'test-pipeline',
        stageIndex: 0,
        totalStages: 3,
        startTime: Date.now(),
        correlationId: 'correlation-123',
        properties: {},
        metrics: {
          processedStages: 0,
          errors: 0,
          warnings: 0,
          totalLatency: 0,
          stageLatencies: new Map()
        }
      };

      // 验证必需字段
      expect(typeof context.pipelineId).toBe('string');
      expect(typeof context.stageIndex).toBe('number');
      expect(typeof context.totalStages).toBe('number');
      expect(typeof context.startTime).toBe('number');
      expect(typeof context.correlationId).toBe('string');
      expect(typeof context.properties).toBe('object');
      expect(typeof context.metrics).toBe('object');

      // 验证metrics结构
      expect(typeof context.metrics.processedStages).toBe('number');
      expect(typeof context.metrics.errors).toBe('number');
      expect(typeof context.metrics.warnings).toBe('number');
      expect(typeof context.metrics.totalLatency).toBe('number');
      expect(context.metrics.stageLatencies instanceof Map).toBe(true);
    });

    test('should maintain PipelineMetrics interface structure', async () => {
      const config = createBasePipelineConfig();
      const monitor = new MockMonitor();
      const errorHandler = new MockErrorHandler();
      const pipeline = new TestDataPipeline(config, monitor, errorHandler);

      await pipeline.initialize();
      const metrics: PipelineMetrics = pipeline.getMetrics();

      // 验证必需字段
      expect(typeof metrics.id).toBe('string');
      expect(typeof metrics.name).toBe('string');
      expect(typeof metrics.totalProcessed).toBe('number');
      expect(typeof metrics.totalErrors).toBe('number');
      expect(typeof metrics.averageLatency).toBe('number');
      expect(typeof metrics.currentThroughput).toBe('number');
      expect(typeof metrics.queueSize).toBe('number');
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(typeof metrics.isHealthy).toBe('boolean');
      expect(typeof metrics.uptime).toBe('number');
      expect(metrics.stageMetrics instanceof Map).toBe(true);

      await pipeline.destroy();
    });
  });

  describe('管道阶段接口稳定性 (Pipeline Stage Interface Stability)', () => {
    test('should maintain PipelineStage interface structure', async () => {
      const config = createBufferStageConfig();
      const stage = new BufferStage(config);

      // 验证接口方法
      expect(typeof stage.process).toBe('function');
      expect(typeof stage.initialize).toBe('function');
      expect(typeof stage.destroy).toBe('function');
      expect(typeof stage.getMetrics).toBe('function');
      expect(typeof stage.isHealthy).toBe('function');

      // 验证只读属性
      expect(typeof stage.name).toBe('string');
      expect(typeof stage.type).toBe('string');
      expect(typeof stage.config).toBe('object');

      // 验证阶段类型枚举
      expect(Object.values(PipelineStageType)).toContain(stage.type);

      await stage.destroy();
    });

    test('should maintain StageConfig interface structure', () => {
      const stageConfig: StageConfig = {
        enabled: true,
        name: 'test-stage',
        parallel: false,
        timeout: 5000,
        retryCount: 3,
        retryInterval: 1000
      };

      // 验证必需字段
      expect(typeof stageConfig.enabled).toBe('boolean');
      expect(typeof stageConfig.name).toBe('string');
      expect(typeof stageConfig.parallel).toBe('boolean');
      expect(typeof stageConfig.timeout).toBe('number');
      expect(typeof stageConfig.retryCount).toBe('number');
      expect(typeof stageConfig.retryInterval).toBe('number');

      // 验证可选字段的兼容性
      const extendedConfig: StageConfig = {
        ...stageConfig,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          timeoutThreshold: 1000,
          resetTimeout: 30000
        },
        rateLimit: {
          maxRequests: 100,
          timeWindow: 1000,
          burst: 10
        }
      };

      expect(typeof extendedConfig.circuitBreaker).toBe('object');
      expect(typeof extendedConfig.rateLimit).toBe('object');
    });

    test('should maintain StageMetrics interface structure', async () => {
      const config = createBufferStageConfig();
      const stage = new BufferStage(config);
      await stage.initialize(config);

      const metrics: StageMetrics = stage.getMetrics();

      // 验证必需字段
      expect(typeof metrics.processedCount).toBe('number');
      expect(typeof metrics.errorCount).toBe('number');
      expect(typeof metrics.averageLatency).toBe('number');
      expect(typeof metrics.maxLatency).toBe('number');
      expect(typeof metrics.throughput).toBe('number');
      expect(typeof metrics.lastActivity).toBe('number');

      // 验证可选字段
      if (metrics.circuitBreakerState) {
        expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(metrics.circuitBreakerState);
      }

      await stage.destroy();
    });
  });

  describe('缓冲阶段接口稳定性 (Buffer Stage Interface Stability)', () => {
    test('should maintain BufferStageConfig interface structure', () => {
      const bufferConfig: BufferStageConfig = createBufferStageConfig();

      // 验证继承的StageConfig字段
      expect(typeof bufferConfig.enabled).toBe('boolean');
      expect(typeof bufferConfig.name).toBe('string');
      expect(typeof bufferConfig.timeout).toBe('number');

      // 验证BufferStage特定字段
      expect(typeof bufferConfig.bufferPolicy).toBe('object');
      expect(typeof bufferConfig.enableBackpressure).toBe('boolean');
      expect(typeof bufferConfig.backpressureStrategy).toBe('string');
      expect(typeof bufferConfig.enableCompression).toBe('boolean');

      // 验证bufferPolicy结构
      expect(typeof bufferConfig.bufferPolicy.maxSize).toBe('number');
      expect(typeof bufferConfig.bufferPolicy.maxAge).toBe('number');
      expect(typeof bufferConfig.bufferPolicy.flushInterval).toBe('number');
      expect(typeof bufferConfig.bufferPolicy.backpressureThreshold).toBe('number');

      // 验证可选字段
      if (bufferConfig.partitionBy) {
        expect(['exchange', 'symbol', 'dataType', 'custom']).toContain(bufferConfig.partitionBy);
      }

      if (bufferConfig.compressionAlgorithm) {
        expect(['gzip', 'deflate', 'br']).toContain(bufferConfig.compressionAlgorithm);
      }
    });

    test('should maintain BufferStage public API', async () => {
      const config = createBufferStageConfig();
      const bufferStage = new BufferStage(config);
      await bufferStage.initialize(config);

      // 验证公共方法
      expect(typeof bufferStage.getBufferState).toBe('function');
      expect(typeof bufferStage.flushAllPartitions).toBe('function');
      expect(typeof bufferStage.flushPartition).toBe('function');
      expect(typeof bufferStage.clearPartition).toBe('function');
      expect(typeof bufferStage.clearAllPartitions).toBe('function');

      // 验证方法返回类型
      const bufferState = bufferStage.getBufferState();
      expect(typeof bufferState.size).toBe('number');
      expect(typeof bufferState.maxSize).toBe('number');
      expect(typeof bufferState.partitionCount).toBe('number');
      expect(typeof bufferState.memoryUsage).toBe('number');
      expect(typeof bufferState.isBackpressured).toBe('boolean');

      await bufferStage.destroy();
    });
  });

  describe('路由阶段接口稳定性 (Router Stage Interface Stability)', () => {
    test('should maintain RouterStageConfig interface structure', () => {
      const routerConfig: RouterStageConfig = createRouterStageConfig();

      // 验证继承的StageConfig字段
      expect(typeof routerConfig.enabled).toBe('boolean');
      expect(typeof routerConfig.name).toBe('string');

      // 验证RouterStage特定字段
      expect(Array.isArray(routerConfig.rules)).toBe(true);
      expect(typeof routerConfig.enableFallback).toBe('boolean');
      expect(typeof routerConfig.routingStrategy).toBe('string');
      expect(typeof routerConfig.enableCaching).toBe('boolean');
      expect(typeof routerConfig.enableDuplication).toBe('boolean');

      // 验证路由策略值
      expect(['first_match', 'all_matches', 'priority_based']).toContain(routerConfig.routingStrategy);

      // 验证可选字段
      if (routerConfig.cacheSize) {
        expect(typeof routerConfig.cacheSize).toBe('number');
      }
      if (routerConfig.cacheTtl) {
        expect(typeof routerConfig.cacheTtl).toBe('number');
      }
    });

    test('should maintain RoutingRule interface structure', () => {
      const routingRule: RoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: {
          type: 'exact',
          field: 'exchange',
          value: 'binance'
        },
        target: {
          type: 'topic',
          destination: 'test-topic'
        },
        enabled: true,
        priority: 100
      };

      // 验证必需字段
      expect(typeof routingRule.id).toBe('string');
      expect(typeof routingRule.name).toBe('string');
      expect(typeof routingRule.condition).toBe('object');
      expect(typeof routingRule.target).toBe('object');
      expect(typeof routingRule.enabled).toBe('boolean');
      expect(typeof routingRule.priority).toBe('number');

      // 验证condition结构
      expect(['exact', 'pattern', 'function', 'composite']).toContain(routingRule.condition.type);
      expect(['exchange', 'symbol', 'dataType', 'custom']).toContain(routingRule.condition.field);

      // 验证target结构
      expect(['topic', 'queue', 'pipeline', 'function']).toContain(routingRule.target.type);
      expect(typeof routingRule.target.destination).toBeTruthy();
    });

    test('should maintain RouterStage public API', async () => {
      const config = createRouterStageConfig();
      const routerStage = new RouterStage(config);
      await routerStage.initialize(config);

      // 验证公共方法
      expect(typeof routerStage.addRoutingRule).toBe('function');
      expect(typeof routerStage.removeRoutingRule).toBe('function');
      expect(typeof routerStage.updateRoutingRule).toBe('function');
      expect(typeof routerStage.getRoutingMetrics).toBe('function');
      expect(typeof routerStage.clearCache).toBe('function');

      // 验证方法返回类型
      const metrics = routerStage.getRoutingMetrics();
      expect(typeof metrics.totalRouted).toBe('number');
      expect(typeof metrics.cacheHits).toBe('number');
      expect(typeof metrics.cacheMisses).toBe('number');
      expect(typeof metrics.cacheHitRate).toBe('number');
      expect(typeof metrics.rulesCount).toBe('number');

      await routerStage.destroy();
    });
  });

  describe('Exchange管道接口稳定性 (Exchange Pipeline Interface Stability)', () => {
    test('should maintain ExchangeDataPipeline interface structure', async () => {
      const mockPubSubClient = new MockPubSubClient();
      const monitor = new MockMonitor();
      const errorHandler = new MockErrorHandler();

      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'interface-test',
        name: 'Interface Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, monitor, errorHandler);

      // 验证继承的DataPipeline方法
      expect(typeof pipeline.initialize).toBe('function');
      expect(typeof pipeline.start).toBe('function');
      expect(typeof pipeline.stop).toBe('function');
      expect(typeof pipeline.destroy).toBe('function');
      expect(typeof pipeline.process).toBe('function');
      expect(typeof pipeline.getMetrics).toBe('function');
      expect(typeof pipeline.isHealthy).toBe('function');

      await pipeline.destroy();
    });

    test('should maintain ExchangeDataPipelineFactory static methods', () => {
      // 验证工厂方法存在
      expect(typeof ExchangeDataPipelineFactory.createStandardPipeline).toBe('function');
      expect(typeof ExchangeDataPipelineFactory.createBufferedPipeline).toBe('function');
      expect(typeof ExchangeDataPipelineFactory.createRoutingPipeline).toBe('function');

      // 验证工厂方法返回正确类型
      const mockPubSubClient = new MockPubSubClient();
      const monitor = new MockMonitor();
      const errorHandler = new MockErrorHandler();

      const standardPipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'test',
        name: 'Test',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'test'
      }, monitor, errorHandler);

      expect(standardPipeline).toBeInstanceOf(ExchangeDataPipeline);
    });
  });

  describe('事件接口稳定性 (Event Interface Stability)', () => {
    test('should maintain pipeline event interfaces', async () => {
      const config = createBasePipelineConfig();
      const monitor = new MockMonitor();
      const errorHandler = new MockErrorHandler();
      const pipeline = new TestDataPipeline(config, monitor, errorHandler);

      const events: string[] = [];

      // 验证标准事件
      pipeline.on('initialized', () => events.push('initialized'));
      pipeline.on('started', () => events.push('started'));
      pipeline.on('stopped', () => events.push('stopped'));
      pipeline.on('processed', () => events.push('processed'));
      pipeline.on('error', () => events.push('error'));

      await pipeline.initialize();
      expect(events).toContain('initialized');

      await pipeline.start();
      expect(events).toContain('started');

      await pipeline.stop();
      expect(events).toContain('stopped');

      await pipeline.destroy();
    });

    test('should maintain stage event interfaces', async () => {
      const config = createBufferStageConfig();
      const bufferStage = new BufferStage(config);

      const events: string[] = [];

      // 验证缓冲阶段特定事件
      bufferStage.on('bufferInitialized', () => events.push('bufferInitialized'));
      bufferStage.on('dataBuffered', () => events.push('dataBuffered'));
      bufferStage.on('partitionFlushed', () => events.push('partitionFlushed'));
      bufferStage.on('dataDropped', () => events.push('dataDropped'));

      await bufferStage.initialize(config);
      expect(events).toContain('bufferInitialized');

      await bufferStage.destroy();
    });
  });

  describe('错误类型稳定性 (Error Type Stability)', () => {
    test('should maintain consistent error types and messages', async () => {
      const config = createBasePipelineConfig();
      const monitor = new MockMonitor();
      const errorHandler = new MockErrorHandler();
      const pipeline = new TestDataPipeline(config, monitor, errorHandler);

      // 测试未初始化错误
      await expect(pipeline.start()).rejects.toThrow('Pipeline not initialized');

      await pipeline.initialize();
      await pipeline.start();

      // 测试未运行错误
      await pipeline.stop();
      await expect(pipeline.process(createMockMarketData(), 'test'))
        .rejects.toThrow('Pipeline not running');

      await pipeline.destroy();
    });

    test('should maintain error handling patterns', async () => {
      const config = createBasePipelineConfig({
        errorHandling: {
          strategy: 'CONTINUE',
          maxRetries: 3,
          retryInterval: 100
        }
      });

      const monitor = new MockMonitor();
      const errorHandler = new MockErrorHandler();
      const pipeline = new TestDataPipeline(config, monitor, errorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 配置阶段抛出错误
      const inputStage = pipeline.getMockStage('input');
      if (inputStage) {
        inputStage.mockProcess(async () => {
          throw new Error('Test processing error');
        });
      }

      // 验证错误处理不中断管道
      await expect(pipeline.process(createMockMarketData(), 'test'))
        .rejects.toThrow('Test processing error');

      // 验证管道仍然健康
      expect(pipeline.isHealthy()).toBe(true);

      await pipeline.destroy();
    });
  });

  describe('配置向后兼容性 (Configuration Backward Compatibility)', () => {
    test('should support legacy configuration formats', () => {
      // 测试最小配置
      const minimalConfig = {
        id: 'minimal',
        name: 'Minimal Pipeline',
        stages: [],
        errorHandling: {
          strategy: 'FAIL_FAST' as const,
          maxRetries: 0,
          retryInterval: 0
        },
        monitoring: {
          enableMetrics: false,
          enableTracing: false,
          metricsInterval: 10000,
          healthCheckInterval: 30000,
          alertThresholds: {
            errorRate: 1.0,
            latency: 10000,
            throughput: 1,
            memoryUsage: 1.0
          }
        },
        performance: {
          maxConcurrency: 1,
          queueSize: 1,
          backpressureStrategy: 'BLOCK' as const,
          memoryLimit: 10 * 1024 * 1024,
          gcThreshold: 0.9
        }
      };

      // 验证配置结构兼容性
      expect(() => {
        const monitor = new MockMonitor();
        const errorHandler = new MockErrorHandler();
        new TestDataPipeline(minimalConfig, monitor, errorHandler);
      }).not.toThrow();
    });

    test('should handle optional configuration fields gracefully', () => {
      const configWithOptionals = createBasePipelineConfig({
        stages: [
          {
            enabled: true,
            name: 'test-stage',
            parallel: false,
            timeout: 5000,
            retryCount: 3,
            retryInterval: 1000,
            // 可选字段
            circuitBreaker: {
              enabled: true,
              failureThreshold: 5,
              timeoutThreshold: 1000,
              resetTimeout: 30000
            }
          }
        ]
      });

      expect(() => {
        const monitor = new MockMonitor();
        const errorHandler = new MockErrorHandler();
        new TestDataPipeline(configWithOptionals, monitor, errorHandler);
      }).not.toThrow();
    });
  });
});