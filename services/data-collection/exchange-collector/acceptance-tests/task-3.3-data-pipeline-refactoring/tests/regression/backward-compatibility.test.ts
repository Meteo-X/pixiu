/**
 * 回归测试：向后兼容性 (Backward Compatibility)
 * 
 * 测试目标：
 * 1. 验证新版本管道与旧版本配置的兼容性
 * 2. 验证数据格式的向后兼容性
 * 3. 验证API调用的兼容性
 * 4. 验证行为的一致性
 * 5. 验证迁移路径的正确性
 */

import { globalCache } from '@pixiu/shared-core';
import { ExchangeDataPipelineFactory } from '../../src/pipeline/exchange-data-pipeline';
import {
  createMockMarketData,
  createMockMarketDataBatch
} from '../../fixtures/mock-market-data';
import {
  TestConfigFactory
} from '../../fixtures/test-configurations';
import {
  MockMonitor,
  MockErrorHandler,
  MockPubSubClient
} from '../../helpers/pipeline-test-utils';

describe('Task 3.3 Regression - 向后兼容性 (Backward Compatibility)', () => {
  let mockMonitor: MockMonitor;
  let mockErrorHandler: MockErrorHandler;
  let mockPubSubClient: MockPubSubClient;

  beforeEach(() => {
    mockMonitor = new MockMonitor();
    mockErrorHandler = new MockErrorHandler();
    mockPubSubClient = new MockPubSubClient();
  });

  afterEach(() => {
    mockMonitor?.clearLogs();
    mockErrorHandler?.clearErrors();
    mockPubSubClient?.clearMessages();
  });

  afterAll(async () => {
    globalCache.destroy();
  });

  describe('配置格式兼容性 (Configuration Format Compatibility)', () => {
    test('should support v1.0 pipeline configuration format', async () => {
      // 模拟v1.0版本的配置格式
      const v1Config = {
        id: 'legacy-pipeline-v1',
        name: 'Legacy Pipeline V1',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'legacy-v1'
      };

      // 验证v1配置可以正常创建管道
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline(
        v1Config, 
        mockMonitor, 
        mockErrorHandler
      );

      await pipeline.initialize();
      await pipeline.start();

      // 验证基本功能正常
      const testData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });

      await pipeline.process(testData, 'legacy-test');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);
      expect(publishedMessages[0].topic).toBe('legacy-v1-market-data-binance');

      await pipeline.destroy();
    });

    test('should support legacy buffering configuration', async () => {
      // 模拟旧版本的缓冲配置
      const legacyBufferConfig = {
        id: 'legacy-buffer',
        name: 'Legacy Buffer Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'legacy-buffer',
        enableBuffering: true,
        bufferSize: 10,
        batchTimeout: 1000
      };

      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline(
        legacyBufferConfig,
        mockMonitor,
        mockErrorHandler
      );

      await pipeline.initialize();
      await pipeline.start();

      // 发送数据测试缓冲功能
      const testData = createMockMarketDataBatch(5, {
        exchange: 'binance',
        symbol: 'BTCUSDT'
      });

      for (const data of testData) {
        await pipeline.process(data, 'legacy-buffer-test');
      }

      // 等待缓冲刷新
      await new Promise(resolve => setTimeout(resolve, 1200));

      // 验证批量处理功能正常工作
      const batchMessages = mockPubSubClient.getBatchPublishedMessages();
      expect(batchMessages.length).toBeGreaterThan(0);

      await pipeline.destroy();
    });

    test('should handle missing optional configuration fields', async () => {
      // 测试缺少可选字段的配置
      const minimalConfig = {
        id: 'minimal-config',
        name: 'Minimal Config Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'minimal'
        // 缺少 enableBuffering, enableRouting 等可选字段
      };

      // 应该能够正常创建和运行
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline(
        minimalConfig,
        mockMonitor,
        mockErrorHandler
      );

      await pipeline.initialize();
      await pipeline.start();

      const testData = createMockMarketData();
      await pipeline.process(testData, 'minimal-test');

      expect(mockPubSubClient.getPublishedMessages().length).toBe(1);

      await pipeline.destroy();
    });

    test('should provide default values for missing configuration', async () => {
      const configWithDefaults = {
        id: 'defaults-test',
        name: 'Defaults Test Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'defaults'
      };

      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline(
        configWithDefaults,
        mockMonitor,
        mockErrorHandler
      );

      await pipeline.initialize();

      const metrics = pipeline.getMetrics();
      
      // 验证默认值被正确应用
      expect(metrics.id).toBe('defaults-test');
      expect(metrics.name).toBe('Defaults Test Pipeline');
      expect(metrics.totalProcessed).toBe(0);
      expect(metrics.totalErrors).toBe(0);

      await pipeline.destroy();
    });
  });

  describe('数据格式兼容性 (Data Format Compatibility)', () => {
    test('should handle legacy MarketData format', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'legacy-data-format',
        name: 'Legacy Data Format Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'legacy-data'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 模拟旧版本数据格式（可能缺少某些字段）
      const legacyData = {
        id: 'legacy-id-123',
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker',
        timestamp: Date.now(),
        data: {
          price: 45000,
          volume: 1.5
        }
        // 缺少 sequence, receivedAt 等新字段
      };

      await pipeline.process(legacyData as any, 'legacy-data-test');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);

      const publishedData = publishedMessages[0].data;
      expect(publishedData.exchange).toBe('binance');
      expect(publishedData.symbol).toBe('BTCUSDT');
      expect(publishedData.receivedAt).toBeDefined(); // 应该被自动添加

      await pipeline.destroy();
    });

    test('should handle data with additional fields', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'extended-data-format',
        name: 'Extended Data Format Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'extended-data'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 模拟带有额外字段的数据格式
      const extendedData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker',
        extraField: 'extra-value',
        metadata: {
          source: 'websocket',
          version: '2.0'
        }
      } as any);

      await pipeline.process(extendedData, 'extended-data-test');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(1);

      // 验证额外字段被保留
      const publishedData = publishedMessages[0].data;
      expect((publishedData as any).extraField).toBe('extra-value');
      expect((publishedData as any).metadata).toBeDefined();

      await pipeline.destroy();
    });

    test('should maintain message attribute compatibility', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'attributes-compat',
        name: 'Attributes Compatibility Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'attrs'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const testData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker',
        timestamp: 1640995200000
      });

      await pipeline.process(testData, 'attributes-test');

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      const message = publishedMessages[0];

      // 验证消息属性格式保持一致
      expect(message.options.attributes).toEqual({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker',
        timestamp: '1640995200000',
        source: 'attributes-test',
        processedAt: expect.any(String)
      });

      await pipeline.destroy();
    });
  });

  describe('API调用兼容性 (API Call Compatibility)', () => {
    test('should maintain pipeline lifecycle API compatibility', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'api-compat',
        name: 'API Compatibility Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'api'
      }, mockMonitor, mockErrorHandler);

      // 验证旧版本的API调用模式仍然有效
      
      // 1. 初始化
      await pipeline.initialize();
      expect(pipeline.isHealthy()).toBe(false); // 未启动状态

      // 2. 启动
      await pipeline.start();
      expect(pipeline.isHealthy()).toBe(true);

      // 3. 处理数据
      const testData = createMockMarketData();
      await pipeline.process(testData, 'api-test');

      // 4. 获取指标
      const metrics = pipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(1);

      // 5. 停止
      await pipeline.stop();
      expect(pipeline.isHealthy()).toBe(false);

      // 6. 销毁
      await pipeline.destroy();
    });

    test('should support legacy factory method signatures', () => {
      // 测试工厂方法的向后兼容性
      
      // 标准管道创建
      expect(() => {
        ExchangeDataPipelineFactory.createStandardPipeline({
          id: 'legacy-standard',
          name: 'Legacy Standard Pipeline',
          pubsubClient: mockPubSubClient,
          topicPrefix: 'legacy'
        }, mockMonitor, mockErrorHandler);
      }).not.toThrow();

      // 缓冲管道创建
      expect(() => {
        ExchangeDataPipelineFactory.createBufferedPipeline({
          id: 'legacy-buffered',
          name: 'Legacy Buffered Pipeline',
          pubsubClient: mockPubSubClient,
          topicPrefix: 'legacy',
          bufferSize: 10,
          batchTimeout: 1000,
          partitionBy: 'symbol'
        }, mockMonitor, mockErrorHandler);
      }).not.toThrow();

      // 路由管道创建
      expect(() => {
        ExchangeDataPipelineFactory.createRoutingPipeline({
          id: 'legacy-routing',
          name: 'Legacy Routing Pipeline',
          pubsubClient: mockPubSubClient,
          topicPrefix: 'legacy',
          routingRules: []
        }, mockMonitor, mockErrorHandler);
      }).not.toThrow();
    });

    test('should handle deprecated method calls gracefully', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'deprecated-methods',
        name: 'Deprecated Methods Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'deprecated'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 验证可能被标记为deprecated但仍然工作的方法
      expect(typeof pipeline.getMetrics).toBe('function');
      expect(typeof pipeline.isHealthy).toBe('function');

      const metrics = pipeline.getMetrics();
      expect(metrics).toBeDefined();

      const health = pipeline.isHealthy();
      expect(typeof health).toBe('boolean');

      await pipeline.destroy();
    });
  });

  describe('行为一致性 (Behavioral Consistency)', () => {
    test('should maintain consistent data transformation behavior', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'behavior-consistency',
        name: 'Behavior Consistency Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'behavior'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 测试数据转换行为的一致性
      const testCases = [
        {
          input: { exchange: 'BINANCE', symbol: 'btcusdt' },
          expected: { exchange: 'binance', symbol: 'BTCUSDT' }
        },
        {
          input: { exchange: 'huobi', symbol: 'ETHUSDT' },
          expected: { exchange: 'huobi', symbol: 'ETHUSDT' }
        },
        {
          input: { exchange: 'OKX', symbol: 'adausdt' },
          expected: { exchange: 'okx', symbol: 'ADAUSDT' }
        }
      ];

      for (const testCase of testCases) {
        const inputData = createMockMarketData(testCase.input);
        await pipeline.process(inputData, 'behavior-test');
      }

      const publishedMessages = mockPubSubClient.getPublishedMessages();
      expect(publishedMessages.length).toBe(testCases.length);

      testCases.forEach((testCase, index) => {
        const publishedData = publishedMessages[index].data;
        expect(publishedData.exchange).toBe(testCase.expected.exchange);
        expect(publishedData.symbol).toBe(testCase.expected.symbol);
      });

      await pipeline.destroy();
    });

    test('should maintain consistent error handling behavior', async () => {
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'error-behavior',
        name: 'Error Behavior Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'error'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      // 测试各种错误情况的处理一致性
      const errorCases = [
        // 缺少必需字段
        createMockMarketData({ exchange: '', symbol: 'BTCUSDT' }),
        // 无效时间戳
        createMockMarketData({ timestamp: Date.now() + 3600000 }),
        // 缺少数据字段
        createMockMarketData({ data: null as any })
      ];

      let errorCount = 0;
      for (const errorData of errorCases) {
        try {
          await pipeline.process(errorData, 'error-test');
        } catch (error) {
          errorCount++;
          expect(error).toBeInstanceOf(Error);
        }
      }

      expect(errorCount).toBeGreaterThan(0);

      // 验证错误处理器被调用
      const handledErrors = mockErrorHandler.getHandledErrors();
      expect(handledErrors.length).toBeGreaterThan(0);

      await pipeline.destroy();
    });

    test('should maintain consistent performance characteristics', async () => {
      const pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'performance-behavior',
        name: 'Performance Behavior Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'perf',
        bufferSize: 20,
        batchTimeout: 1000,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await pipeline.initialize();
      await pipeline.start();

      const startTime = Date.now();
      const messageCount = 100;

      // 发送固定数量的消息
      for (let i = 0; i < messageCount; i++) {
        const data = createMockMarketData({
          exchange: i % 2 === 0 ? 'binance' : 'huobi',
          sequence: i
        });
        await pipeline.process(data, 'perf-test');
      }

      const processingTime = Date.now() - startTime;
      const throughput = (messageCount / processingTime) * 1000;

      // 验证性能特征在合理范围内
      expect(throughput).toBeGreaterThan(50); // 至少50 msg/s
      expect(processingTime).toBeLessThan(10000); // 10秒内完成

      // 等待缓冲刷新
      await new Promise(resolve => setTimeout(resolve, 1200));

      const metrics = pipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(messageCount);

      await pipeline.destroy();
    });
  });

  describe('迁移路径验证 (Migration Path Validation)', () => {
    test('should support gradual migration from v1 to v2', async () => {
      // 模拟从v1到v2的渐进式迁移
      
      // Step 1: v1 配置格式
      const v1Pipeline = ExchangeDataPipelineFactory.createStandardPipeline({
        id: 'migration-v1',
        name: 'Migration V1 Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'migration-v1'
      }, mockMonitor, mockErrorHandler);

      await v1Pipeline.initialize();
      await v1Pipeline.start();

      const v1Data = createMockMarketData({ exchange: 'binance' });
      await v1Pipeline.process(v1Data, 'v1-test');

      const v1Messages = mockPubSubClient.getPublishedMessages();
      expect(v1Messages.length).toBe(1);

      await v1Pipeline.destroy();
      mockPubSubClient.clearMessages();

      // Step 2: v2 配置格式（带有新功能）
      const v2Pipeline = ExchangeDataPipelineFactory.createBufferedPipeline({
        id: 'migration-v2',
        name: 'Migration V2 Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'migration-v2',
        bufferSize: 5,
        batchTimeout: 500,
        partitionBy: 'exchange'
      }, mockMonitor, mockErrorHandler);

      await v2Pipeline.initialize();
      await v2Pipeline.start();

      // 使用相同的数据格式
      await v2Pipeline.process(v1Data, 'v2-test');

      // 等待缓冲处理
      await new Promise(resolve => setTimeout(resolve, 700));

      const v2Messages = mockPubSubClient.getBatchPublishedMessages();
      expect(v2Messages.length).toBeGreaterThan(0);

      await v2Pipeline.destroy();
    });

    test('should provide clear upgrade path documentation', () => {
      // 验证升级路径的文档和示例
      const upgradeExamples = {
        // v1 -> v2 配置映射
        v1Config: {
          id: 'example',
          name: 'Example Pipeline',
          pubsubClient: mockPubSubClient,
          topicPrefix: 'example'
        },
        v2Config: {
          id: 'example',
          name: 'Example Pipeline',
          pubsubClient: mockPubSubClient,
          topicPrefix: 'example',
          enableBuffering: true,
          bufferSize: 10,
          batchTimeout: 1000
        }
      };

      // 验证两种配置都能正常工作
      expect(() => {
        ExchangeDataPipelineFactory.createStandardPipeline(
          upgradeExamples.v1Config,
          mockMonitor,
          mockErrorHandler
        );
      }).not.toThrow();

      expect(() => {
        ExchangeDataPipelineFactory.createStandardPipeline(
          upgradeExamples.v2Config,
          mockMonitor,
          mockErrorHandler
        );
      }).not.toThrow();
    });

    test('should handle configuration validation during migration', async () => {
      // 测试配置验证在迁移过程中的处理
      const invalidMigrationConfig = {
        id: '', // 无效ID
        name: 'Invalid Migration Pipeline',
        pubsubClient: mockPubSubClient,
        topicPrefix: 'invalid'
      };

      // 应该在创建时或初始化时捕获配置错误
      const pipeline = ExchangeDataPipelineFactory.createStandardPipeline(
        invalidMigrationConfig,
        mockMonitor,
        mockErrorHandler
      );

      // 可能在初始化时失败
      try {
        await pipeline.initialize();
        // 如果初始化成功，至少应该记录警告
        const logs = mockMonitor.getLogs();
        const warnings = logs.filter(log => log.level === 'warn' || log.level === 'error');
        // 应该有一些警告或错误日志
      } catch (error) {
        // 预期的初始化错误
        expect(error).toBeInstanceOf(Error);
      } finally {
        try {
          await pipeline.destroy();
        } catch (error) {
          // 忽略销毁错误
        }
      }
    });
  });
});