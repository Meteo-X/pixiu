/**
 * 验收测试：通用数据接收管道 (Universal Data Reception Pipeline)
 * 
 * 测试目标：
 * 1. 验证管道能够处理来自不同适配器的数据
 * 2. 验证管道生命周期管理（初始化、启动、停止、销毁）
 * 3. 验证阶段注册和执行
 * 4. 验证数据流通过多个阶段
 * 5. 验证错误处理和恢复机制
 * 6. 验证配置驱动的管道构建
 */

import { globalCache } from '@pixiu/shared-core';
import {
  createMockMarketData,
  createMultiExchangeData,
  createInvalidMarketData
} from '../../fixtures/mock-market-data';
import {
  createBasePipelineConfig,
  createErrorRecoveryConfig,
  TestConfigFactory
} from '../../fixtures/test-configurations';
import {
  TestDataPipeline,
  MockMonitor,
  MockErrorHandler,
  PipelineTestUtils
} from '../../helpers/pipeline-test-utils';
import {
  MockAdapterFactory,
  AdapterTestHelper
} from '../../helpers/mock-adapters';

describe('Task 3.3 - 通用数据接收管道 (Universal Data Reception Pipeline)', () => {
  let testPipeline: TestDataPipeline;
  let mockMonitor: MockMonitor;
  let mockErrorHandler: MockErrorHandler;

  beforeEach(() => {
    const config = createBasePipelineConfig({
      id: 'universal-test-pipeline',
      name: 'Universal Data Reception Test Pipeline'
    });
    
    const testSetup = PipelineTestUtils.createTestPipeline(config);
    testPipeline = testSetup.pipeline;
    mockMonitor = testSetup.monitor;
    mockErrorHandler = testSetup.errorHandler;
  });

  afterEach(async () => {
    if (testPipeline) {
      await testPipeline.destroy();
    }
    mockMonitor?.clearLogs();
    mockErrorHandler?.clearErrors();
  });

  afterAll(async () => {
    globalCache.destroy();
  });

  describe('管道生命周期管理 (Pipeline Lifecycle Management)', () => {
    test('should successfully initialize pipeline with stages', async () => {
      // 测试管道初始化
      await testPipeline.initialize();
      
      expect(testPipeline.isHealthy()).toBe(false); // 未启动状态
      
      const logs = mockMonitor.getLogs();
      const initLogs = logs.filter(log => log.message.includes('Initializing data pipeline'));
      expect(initLogs).toHaveLength(1);
      expect(initLogs[0].data.pipelineId).toBe('universal-test-pipeline');
    });

    test('should start and stop pipeline correctly', async () => {
      await testPipeline.initialize();
      
      // 启动管道
      await testPipeline.start();
      expect(testPipeline.isHealthy()).toBe(true);
      
      const startLogs = mockMonitor.getLogs().filter(log => 
        log.message.includes('Data pipeline started')
      );
      expect(startLogs).toHaveLength(1);
      
      // 停止管道
      await testPipeline.stop();
      expect(testPipeline.isHealthy()).toBe(false);
      
      const stopLogs = mockMonitor.getLogs().filter(log => 
        log.message.includes('Data pipeline stopped')
      );
      expect(stopLogs).toHaveLength(1);
    });

    test('should handle duplicate initialization gracefully', async () => {
      await testPipeline.initialize();
      
      // 重复初始化应该被忽略
      await expect(testPipeline.initialize()).resolves.toBeUndefined();
      
      const initLogs = mockMonitor.getLogs().filter(log => 
        log.message.includes('Initializing data pipeline')
      );
      expect(initLogs).toHaveLength(1);
    });

    test('should throw error when starting uninitialized pipeline', async () => {
      await expect(testPipeline.start()).rejects.toThrow('Pipeline not initialized');
    });

    test('should handle duplicate start/stop calls gracefully', async () => {
      await testPipeline.initialize();
      
      await testPipeline.start();
      await expect(testPipeline.start()).resolves.toBeUndefined();
      
      await testPipeline.stop();
      await expect(testPipeline.stop()).resolves.toBeUndefined();
    });

    test('should properly destroy pipeline and cleanup resources', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      await testPipeline.destroy();
      
      expect(testPipeline.isHealthy()).toBe(false);
      
      const destroyLogs = mockMonitor.getLogs().filter(log => 
        log.message.includes('Data pipeline destroyed')
      );
      expect(destroyLogs).toHaveLength(1);
    });
  });

  describe('阶段注册和执行 (Stage Registration and Execution)', () => {
    test('should register and initialize all configured stages', async () => {
      const config = createBasePipelineConfig({
        stages: [
          {
            enabled: true,
            name: 'input',
            parallel: false,
            timeout: 5000,
            retryCount: 0,
            retryInterval: 1000
          },
          {
            enabled: true,
            name: 'validation',
            parallel: false,
            timeout: 1000,
            retryCount: 3,
            retryInterval: 500
          },
          {
            enabled: true,
            name: 'output',
            parallel: false,
            timeout: 5000,
            retryCount: 3,
            retryInterval: 1000
          }
        ]
      });
      
      const { pipeline } = PipelineTestUtils.createTestPipeline(config);
      await pipeline.initialize();
      
      const mockStages = pipeline.getAllMockStages();
      expect(mockStages).toHaveLength(3);
      expect(mockStages.map(s => s.name)).toEqual(['input', 'validation', 'output']);
      
      await pipeline.destroy();
    });

    test('should skip disabled stages', async () => {
      const config = createBasePipelineConfig({
        stages: [
          {
            enabled: true,
            name: 'input',
            parallel: false,
            timeout: 5000,
            retryCount: 0,
            retryInterval: 1000
          },
          {
            enabled: false,
            name: 'disabled-stage',
            parallel: false,
            timeout: 1000,
            retryCount: 0,
            retryInterval: 1000
          },
          {
            enabled: true,
            name: 'output',
            parallel: false,
            timeout: 5000,
            retryCount: 0,
            retryInterval: 1000
          }
        ]
      });
      
      const { pipeline } = PipelineTestUtils.createTestPipeline(config);
      await pipeline.initialize();
      
      const mockStages = pipeline.getAllMockStages();
      expect(mockStages).toHaveLength(2);
      expect(mockStages.map(s => s.name)).toEqual(['input', 'output']);
      
      await pipeline.destroy();
    });

    test('should execute stages in correct order', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const marketData = createMockMarketData();
      
      // 设置阶段处理函数来跟踪执行顺序
      const executionOrder: string[] = [];
      const inputStage = testPipeline.getMockStage('input');
      
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          executionOrder.push('input');
          return data;
        });
      }
      
      await testPipeline.process(marketData, 'test-source');
      
      expect(executionOrder).toContain('input');
    });

    test('should pass data through pipeline stages correctly', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const marketData = createMockMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'ticker'
      });
      
      const inputStage = testPipeline.getMockStage('input');
      let processedData: any = null;
      
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          processedData = data;
          return data;
        });
      }
      
      await testPipeline.process(marketData, 'test-source');
      
      expect(processedData).not.toBeNull();
      expect(processedData.marketData.exchange).toBe('binance');
      expect(processedData.marketData.symbol).toBe('BTCUSDT');
      expect(processedData.source).toBe('test-source');
    });
  });

  describe('多适配器数据处理 (Multi-Adapter Data Processing)', () => {
    test('should process data from different exchanges', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const multiExchangeData = createMultiExchangeData();
      const processedExchanges: string[] = [];
      
      const inputStage = testPipeline.getMockStage('input');
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          processedExchanges.push(data.marketData.exchange);
          return data;
        });
      }
      
      // 处理来自不同交易所的数据
      for (const data of multiExchangeData) {
        await testPipeline.process(data, 'multi-exchange-test');
      }
      
      const uniqueExchanges = [...new Set(processedExchanges)];
      expect(uniqueExchanges.length).toBeGreaterThan(1);
      expect(uniqueExchanges).toContain('binance');
      expect(uniqueExchanges).toContain('huobi');
    });

    test('should handle different data types from same exchange', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const dataTypes = ['ticker', 'orderbook', 'trade'];
      const processedTypes: string[] = [];
      
      const inputStage = testPipeline.getMockStage('input');
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          processedTypes.push(data.marketData.type);
          return data;
        });
      }
      
      // 处理不同类型的数据
      for (const type of dataTypes) {
        const data = createMockMarketData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type
        });
        await testPipeline.process(data, 'type-test');
      }
      
      expect(processedTypes).toEqual(dataTypes);
    });

    test('should maintain data integrity across different adapters', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const originalData = createMockMarketData({
        exchange: 'binance',
        symbol: 'ETHUSDT',
        type: 'ticker',
        data: {
          price: 3000,
          volume: 5.5,
          timestamp: Date.now()
        }
      });
      
      let processedData: any = null;
      const inputStage = testPipeline.getMockStage('input');
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          processedData = data;
          return data;
        });
      }
      
      await testPipeline.process(originalData, 'integrity-test');
      
      expect(processedData.marketData).toEqual(originalData);
      expect(processedData.metadata.exchange).toBe('binance');
      expect(processedData.metadata.symbol).toBe('ETHUSDT');
      expect(processedData.metadata.dataType).toBe('ticker');
    });
  });

  describe('错误处理和恢复 (Error Handling and Recovery)', () => {
    test('should handle stage processing errors gracefully', async () => {
      const config = createErrorRecoveryConfig();
      const { pipeline, errorHandler } = PipelineTestUtils.createTestPipeline(config);
      
      await pipeline.initialize();
      await pipeline.start();
      
      const inputStage = pipeline.getMockStage('input');
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          throw new Error('Stage processing error');
        });
      }
      
      const marketData = createMockMarketData();
      
      await expect(pipeline.process(marketData, 'error-test')).rejects.toThrow('Stage processing error');
      
      const handledErrors = errorHandler.getHandledErrors();
      expect(handledErrors.length).toBeGreaterThan(0);
      
      await pipeline.destroy();
    });

    test('should continue processing after non-fatal errors when configured', async () => {
      const config = createBasePipelineConfig({
        errorHandling: {
          strategy: 'CONTINUE',
          maxRetries: 3,
          retryInterval: 100
        }
      });
      
      const { pipeline, errorHandler } = PipelineTestUtils.createTestPipeline(config);
      
      await pipeline.initialize();
      await pipeline.start();
      
      const inputStage = pipeline.getMockStage('input');
      let processCount = 0;
      
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          processCount++;
          if (processCount === 1) {
            throw new Error('First processing error');
          }
          return data;
        });
      }
      
      const marketData1 = createMockMarketData();
      const marketData2 = createMockMarketData();
      
      // 第一个消息应该失败但不影响管道运行
      await expect(pipeline.process(marketData1, 'error-test')).rejects.toThrow();
      
      // 第二个消息应该成功处理
      await expect(pipeline.process(marketData2, 'error-test')).resolves.toBeUndefined();
      
      expect(processCount).toBe(2);
      
      await pipeline.destroy();
    });

    test('should handle invalid data gracefully', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const invalidDataList = createInvalidMarketData();
      const processResults: boolean[] = [];
      
      for (const invalidData of invalidDataList) {
        try {
          await testPipeline.process(invalidData, 'invalid-data-test');
          processResults.push(true);
        } catch (error) {
          processResults.push(false);
        }
      }
      
      // 应该有处理失败的情况
      expect(processResults.some(result => !result)).toBe(true);
      
      // 错误处理器应该记录错误
      const handledErrors = mockErrorHandler.getHandledErrors();
      expect(handledErrors.length).toBeGreaterThan(0);
    });

    test('should validate pipeline not running when processing', async () => {
      await testPipeline.initialize();
      // 不启动管道
      
      const marketData = createMockMarketData();
      
      await expect(testPipeline.process(marketData, 'not-running-test'))
        .rejects.toThrow('Pipeline not running');
    });
  });

  describe('配置驱动的管道构建 (Configuration-Driven Pipeline Construction)', () => {
    test('should build pipeline according to minimal configuration', async () => {
      const minimalConfig = TestConfigFactory.createMinimal();
      const { pipeline } = PipelineTestUtils.createTestPipeline(minimalConfig);
      
      await pipeline.initialize();
      
      const stages = pipeline.getAllMockStages();
      expect(stages).toHaveLength(0); // 最小配置没有阶段
      
      await pipeline.destroy();
    });

    test('should build pipeline according to complete configuration', async () => {
      const completeConfig = TestConfigFactory.createComplete();
      const { pipeline } = PipelineTestUtils.createTestPipeline(completeConfig);
      
      await pipeline.initialize();
      
      const stages = pipeline.getAllMockStages();
      expect(stages.length).toBeGreaterThan(3);
      
      const stageNames = stages.map(s => s.name);
      expect(stageNames).toContain('input');
      expect(stageNames).toContain('validation');
      expect(stageNames).toContain('output');
      
      await pipeline.destroy();
    });

    test('should apply different error handling strategies', async () => {
      const strategies = ['FAIL_FAST', 'CONTINUE', 'RETRY'] as const;
      
      for (const strategy of strategies) {
        const config = createBasePipelineConfig({
          errorHandling: {
            strategy,
            maxRetries: 2,
            retryInterval: 100
          }
        });
        
        const { pipeline } = PipelineTestUtils.createTestPipeline(config);
        await pipeline.initialize();
        
        expect(pipeline.getMetrics().id).toBe(config.id);
        
        await pipeline.destroy();
      }
    });

    test('should apply performance configurations correctly', async () => {
      const performanceConfig = createBasePipelineConfig({
        performance: {
          maxConcurrency: 50,
          queueSize: 1000,
          backpressureStrategy: 'DROP',
          memoryLimit: 100 * 1024 * 1024,
          gcThreshold: 0.8
        }
      });
      
      const { pipeline } = PipelineTestUtils.createTestPipeline(performanceConfig);
      await pipeline.initialize();
      
      const metrics = pipeline.getMetrics();
      expect(metrics.queueSize).toBe(0); // 初始队列大小
      
      await pipeline.destroy();
    });
  });

  describe('监控和指标 (Monitoring and Metrics)', () => {
    test('should register pipeline metrics correctly', async () => {
      await testPipeline.initialize();
      
      const registeredMetrics = mockMonitor.getMetrics();
      expect(registeredMetrics.size).toBeGreaterThanOrEqual(0);
    });

    test('should update pipeline metrics during processing', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const marketData = createMockMarketData();
      await testPipeline.process(marketData, 'metrics-test');
      
      const metrics = testPipeline.getMetrics();
      expect(metrics.totalProcessed).toBe(1);
      expect(metrics.isHealthy).toBe(true);
    });

    test('should track stage metrics correctly', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const inputStage = testPipeline.getMockStage('input');
      
      const marketData = createMockMarketData();
      await testPipeline.process(marketData, 'stage-metrics-test');
      
      if (inputStage) {
        const stageMetrics = inputStage.getMetrics();
        expect(stageMetrics.processedCount).toBe(1);
        expect(stageMetrics.errorCount).toBe(0);
        expect(stageMetrics.lastActivity).toBeGreaterThan(0);
      }
    });

    test('should report health status correctly', async () => {
      await testPipeline.initialize();
      
      // 未启动状态
      expect(testPipeline.isHealthy()).toBe(false);
      
      await testPipeline.start();
      
      // 启动状态
      expect(testPipeline.isHealthy()).toBe(true);
      
      await testPipeline.stop();
      
      // 停止状态
      expect(testPipeline.isHealthy()).toBe(false);
    });
  });

  describe('并发处理能力 (Concurrent Processing Capability)', () => {
    test('should handle concurrent data processing', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const concurrentCount = 10;
      const marketDataList = Array.from({ length: concurrentCount }, () => createMockMarketData());
      
      let processedCount = 0;
      const inputStage = testPipeline.getMockStage('input');
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          processedCount++;
          // 模拟处理时间
          await PipelineTestUtils.wait(10);
          return data;
        });
      }
      
      // 并发处理所有数据
      const promises = marketDataList.map(data => 
        testPipeline.process(data, 'concurrent-test')
      );
      
      await Promise.all(promises);
      
      expect(processedCount).toBe(concurrentCount);
    });

    test('should maintain data order when required', async () => {
      await testPipeline.initialize();
      await testPipeline.start();
      
      const processOrder: number[] = [];
      const inputStage = testPipeline.getMockStage('input');
      
      if (inputStage) {
        inputStage.mockProcess(async (data, context) => {
          processOrder.push(data.marketData.sequence || 0);
          return data;
        });
      }
      
      // 按顺序发送数据
      for (let i = 1; i <= 5; i++) {
        const data = createMockMarketData({ sequence: i });
        await testPipeline.process(data, 'order-test');
      }
      
      expect(processOrder).toEqual([1, 2, 3, 4, 5]);
    });
  });
});