/**
 * 数据管道核心功能测试
 */

import { BaseMonitor, BaseErrorHandler, globalCache } from '@pixiu/shared-core';
import { MarketData, DataType } from '@pixiu/adapter-base';
import {
  DataPipeline,
  PipelineConfig,
  PipelineStage,
  StageConfig,
  PipelineStageType,
  PipelineData,
  PipelineContext
} from '../../src/pipeline/core/data-pipeline';
import { BasePipelineStage } from '../../src/pipeline/core/pipeline-stage';

// Mock测试阶段
class MockStage extends BasePipelineStage {
  private processFunction?: (data: PipelineData, context: PipelineContext) => Promise<PipelineData | null>;

  constructor(name: string, type: PipelineStageType, config: StageConfig) {
    super(name, type, config);
  }

  setProcessFunction(fn: (data: PipelineData, context: PipelineContext) => Promise<PipelineData | null>) {
    this.processFunction = fn;
  }

  protected async doInitialize(config: StageConfig): Promise<void> {
    // Mock initialization
  }

  protected async doProcess(data: PipelineData, context: PipelineContext): Promise<PipelineData | null> {
    if (this.processFunction) {
      return this.processFunction(data, context);
    }
    return data;
  }

  protected async doDestroy(): Promise<void> {
    // Mock cleanup
  }
}

// Mock数据管道
class MockDataPipeline extends DataPipeline {
  private stageFactory: Map<string, () => PipelineStage> = new Map();

  setStageFactory(stageName: string, factory: () => PipelineStage) {
    this.stageFactory.set(stageName, factory);
  }

  protected async createStage(config: StageConfig): Promise<PipelineStage> {
    const factory = this.stageFactory.get(config.name);
    if (factory) {
      return factory();
    }
    
    return new MockStage(config.name, PipelineStageType.TRANSFORM, config);
  }
}

describe('DataPipeline', () => {
  let pipeline: MockDataPipeline;
  let monitor: BaseMonitor;
  let errorHandler: BaseErrorHandler;
  let config: PipelineConfig;

  beforeEach(() => {
    monitor = new BaseMonitor({
      metrics: { enabled: false, endpoint: '0.0.0.0', port: 9090, path: '/metrics' },
      healthCheck: { enabled: false, endpoint: '0.0.0.0', port: 8080, path: '/health' },
      logging: { level: 'info', format: 'json', output: 'console' }
    });

    errorHandler = new BaseErrorHandler({
      enableAutoRetry: false,
      defaultMaxRetries: 0,
      retryInterval: 1000,
      enableCircuitBreaker: false,
      enableLogging: false
    });

    config = {
      id: 'test-pipeline',
      name: 'Test Pipeline',
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
          name: 'transform',
          parallel: false,
          timeout: 5000,
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
      ],
      errorHandling: {
        strategy: 'CONTINUE',
        maxRetries: 3,
        retryInterval: 1000
      },
      monitoring: {
        enableMetrics: false,
        enableTracing: false,
        metricsInterval: 30000,
        healthCheckInterval: 30000,
        alertThresholds: {
          errorRate: 0.05,
          latency: 1000,
          throughput: 100,
          memoryUsage: 0.8
        }
      },
      performance: {
        maxConcurrency: 100,
        queueSize: 1000,
        backpressureStrategy: 'BLOCK',
        memoryLimit: 100 * 1024 * 1024,
        gcThreshold: 0.8
      }
    };

    pipeline = new MockDataPipeline(config, monitor, errorHandler);
  });

  afterEach(() => {
    globalCache.destroy();
  });

  describe('初始化和生命周期', () => {
    it('应该成功初始化管道', async () => {
      await pipeline.initialize();
      expect(pipeline.isHealthy()).toBe(false); // 未启动时不健康
    });

    it('应该成功启动和停止管道', async () => {
      await pipeline.initialize();
      await pipeline.start();
      expect(pipeline.isHealthy()).toBe(true);
      
      await pipeline.stop();
      expect(pipeline.isHealthy()).toBe(false);
    });

    it('应该成功销毁管道', async () => {
      await pipeline.initialize();
      await pipeline.start();
      await pipeline.destroy();
      expect(pipeline.isHealthy()).toBe(false);
    });

    it('应该在未初始化时抛出错误', async () => {
      await expect(pipeline.start()).rejects.toThrow('Pipeline not initialized');
    });

    it('应该在未启动时拒绝处理数据', async () => {
      await pipeline.initialize();
      
      const marketData: MarketData = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TRADE,
        timestamp: Date.now(),
        data: { price: 50000, volume: 1.5 }
      };

      await expect(pipeline.process(marketData, 'test')).rejects.toThrow('Pipeline not running');
    });
  });

  describe('数据处理', () => {
    beforeEach(async () => {
      await pipeline.initialize();
      await pipeline.start();
    });

    afterEach(async () => {
      await pipeline.destroy();
    });

    it('应该成功处理市场数据', async () => {
      const marketData: MarketData = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TRADE,
        timestamp: Date.now(),
        data: { price: 50000, volume: 1.5 }
      };

      let processedData: PipelineData | null = null;
      let processedContext: PipelineContext | null = null;

      pipeline.on('processed', (data, context) => {
        processedData = data;
        processedContext = context;
      });

      await pipeline.process(marketData, 'test-source');

      expect(processedData).toBeTruthy();
      expect(processedData?.marketData).toEqual(marketData);
      expect(processedData?.source).toBe('test-source');
      expect(processedContext).toBeTruthy();
      expect(processedContext?.pipelineId).toBe('test-pipeline');
    });

    it('应该正确传递数据到所有阶段', async () => {
      const processedStages: string[] = [];

      // 设置阶段处理函数
      pipeline.setStageFactory('input', () => {
        const stage = new MockStage('input', PipelineStageType.INPUT, config.stages[0]);
        stage.setProcessFunction(async (data, context) => {
          processedStages.push('input');
          return data;
        });
        return stage;
      });

      pipeline.setStageFactory('transform', () => {
        const stage = new MockStage('transform', PipelineStageType.TRANSFORM, config.stages[1]);
        stage.setProcessFunction(async (data, context) => {
          processedStages.push('transform');
          return {
            ...data,
            attributes: { ...data.attributes, transformed: true }
          };
        });
        return stage;
      });

      pipeline.setStageFactory('output', () => {
        const stage = new MockStage('output', PipelineStageType.OUTPUT, config.stages[2]);
        stage.setProcessFunction(async (data, context) => {
          processedStages.push('output');
          return data;
        });
        return stage;
      });

      // 重新初始化以使用新的阶段工厂
      await pipeline.destroy();
      pipeline = new MockDataPipeline(config, monitor, errorHandler);
      await pipeline.initialize();
      await pipeline.start();

      const marketData: MarketData = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TRADE,
        timestamp: Date.now(),
        data: { price: 50000, volume: 1.5 }
      };

      await pipeline.process(marketData, 'test-source');

      expect(processedStages).toEqual(['input', 'transform', 'output']);
    });

    it('应该处理阶段返回null的情况', async () => {
      pipeline.setStageFactory('transform', () => {
        const stage = new MockStage('transform', PipelineStageType.TRANSFORM, config.stages[1]);
        stage.setProcessFunction(async () => null); // 返回null终止处理
        return stage;
      });

      // 重新初始化
      await pipeline.destroy();
      pipeline = new MockDataPipeline(config, monitor, errorHandler);
      await pipeline.initialize();
      await pipeline.start();

      const marketData: MarketData = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TRADE,
        timestamp: Date.now(),
        data: { price: 50000, volume: 1.5 }
      };

      // 应该不抛出错误，即使中间阶段返回null
      await expect(pipeline.process(marketData, 'test-source')).resolves.not.toThrow();
    });
  });

  describe('错误处理', () => {
    beforeEach(async () => {
      await pipeline.initialize();
      await pipeline.start();
    });

    afterEach(async () => {
      await pipeline.destroy();
    });

    it('应该处理阶段处理错误', async () => {
      let errorCaught = false;
      let errorStage: string = '';

      pipeline.setStageFactory('transform', () => {
        const stage = new MockStage('transform', PipelineStageType.TRANSFORM, config.stages[1]);
        stage.setProcessFunction(async () => {
          throw new Error('Stage processing error');
        });
        return stage;
      });

      pipeline.on('stageError', (error, stage) => {
        errorCaught = true;
        errorStage = stage.name;
      });

      // 重新初始化
      await pipeline.destroy();
      pipeline = new MockDataPipeline(config, monitor, errorHandler);
      await pipeline.initialize();
      await pipeline.start();

      const marketData: MarketData = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TRADE,
        timestamp: Date.now(),
        data: { price: 50000, volume: 1.5 }
      };

      // 由于错误处理策略是CONTINUE，不应该抛出错误
      await expect(pipeline.process(marketData, 'test-source')).resolves.not.toThrow();
      expect(errorCaught).toBe(true);
      expect(errorStage).toBe('transform');
    });

    it('应该在FAIL_FAST策略下立即失败', async () => {
      // 修改错误处理策略
      const failFastConfig = {
        ...config,
        errorHandling: {
          ...config.errorHandling,
          strategy: 'FAIL_FAST' as const
        }
      };

      pipeline.setStageFactory('transform', () => {
        const stage = new MockStage('transform', PipelineStageType.TRANSFORM, failFastConfig.stages[1]);
        stage.setProcessFunction(async () => {
          throw new Error('Stage processing error');
        });
        return stage;
      });

      // 重新初始化
      await pipeline.destroy();
      pipeline = new MockDataPipeline(failFastConfig, monitor, errorHandler);
      await pipeline.initialize();
      await pipeline.start();

      const marketData: MarketData = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TRADE,
        timestamp: Date.now(),
        data: { price: 50000, volume: 1.5 }
      };

      await expect(pipeline.process(marketData, 'test-source')).rejects.toThrow('Stage processing error');
    });
  });

  describe('指标收集', () => {
    beforeEach(async () => {
      await pipeline.initialize();
      await pipeline.start();
    });

    afterEach(async () => {
      await pipeline.destroy();
    });

    it('应该收集管道指标', async () => {
      const metrics = pipeline.getMetrics();
      
      expect(metrics).toHaveProperty('id', 'test-pipeline');
      expect(metrics).toHaveProperty('name', 'Test Pipeline');
      expect(metrics).toHaveProperty('totalProcessed');
      expect(metrics).toHaveProperty('totalErrors');
      expect(metrics).toHaveProperty('averageLatency');
      expect(metrics).toHaveProperty('currentThroughput');
      expect(metrics).toHaveProperty('isHealthy');
    });

    it('应该正确更新处理计数', async () => {
      const initialMetrics = pipeline.getMetrics();
      expect(initialMetrics.totalProcessed).toBe(0);

      const marketData: MarketData = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TRADE,
        timestamp: Date.now(),
        data: { price: 50000, volume: 1.5 }
      };

      await pipeline.process(marketData, 'test-source');

      const updatedMetrics = pipeline.getMetrics();
      expect(updatedMetrics.totalProcessed).toBe(1);
    });
  });

  describe('健康检查', () => {
    it('应该在未运行时报告不健康', () => {
      expect(pipeline.isHealthy()).toBe(false);
    });

    it('应该在运行时报告健康', async () => {
      await pipeline.initialize();
      await pipeline.start();
      expect(pipeline.isHealthy()).toBe(true);
      await pipeline.destroy();
    });
  });
});