/**
 * 缓冲阶段测试
 */

import { globalCache } from '@pixiu/shared-core';
import { DataType } from '@pixiu/adapter-base';
import { BufferStage, BufferStageConfig } from '../../src/pipeline/stages/buffer-stage';
import { PipelineData, PipelineContext, PipelineStageType } from '../../src/pipeline/core/data-pipeline';
import { PipelineDataFactory, PipelineContextFactory } from '../../src/pipeline/core/pipeline-context';

describe('BufferStage', () => {
  let bufferStage: BufferStage;
  let config: BufferStageConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      name: 'buffer',
      parallel: false,
      timeout: 5000,
      retryCount: 0,
      retryInterval: 1000,
      bufferPolicy: {
        maxSize: 100,
        maxAge: 5000,
        flushInterval: 1000,
        backpressureThreshold: 0.8
      },
      partitionBy: 'symbol',
      enableBackpressure: true,
      backpressureStrategy: 'BLOCK',
      enableCompression: false
    };

    bufferStage = new BufferStage(config);
  });

  afterEach(async () => {
    await bufferStage.destroy();
    globalCache.destroy();
  });

  describe('初始化和配置', () => {
    it('应该成功初始化缓冲阶段', async () => {
      await bufferStage.initialize(config);
      expect(bufferStage.isHealthy()).toBe(true);
    });

    it('应该正确设置缓冲策略', async () => {
      await bufferStage.initialize(config);
      const state = bufferStage.getBufferState();
      expect(state.maxSize).toBe(100);
    });
  });

  describe('数据缓冲', () => {
    beforeEach(async () => {
      await bufferStage.initialize(config);
    });

    it('应该成功缓冲数据', async () => {
      const pipelineData = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 50000, volume: 1.5 }
        },
        'test-source'
      );

      const context = PipelineContextFactory.create('test-pipeline', 1);
      
      const result = await bufferStage.process(pipelineData, context);
      
      // 缓冲阶段通常返回null，因为数据将通过批处理异步发送
      expect(result).toBeNull();
      
      const state = bufferStage.getBufferState();
      expect(state.size).toBe(1);
    });

    it('应该按分区键分组数据', async () => {
      const data1 = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 50000, volume: 1.5 }
        },
        'test-source'
      );

      const data2 = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'ETHUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 3000, volume: 2.0 }
        },
        'test-source'
      );

      const context = PipelineContextFactory.create('test-pipeline', 1);
      
      await bufferStage.process(data1, context);
      await bufferStage.process(data2, context);
      
      const state = bufferStage.getBufferState();
      expect(state.size).toBe(2);
      expect(state.partitionCount).toBe(2); // 两个不同的交易对
    });

    it('应该在达到最大大小时自动刷新', async () => {
      // 设置小的缓冲区大小
      const smallConfig = {
        ...config,
        bufferPolicy: {
          ...config.bufferPolicy,
          maxSize: 2
        }
      };

      let flushedData: any[] = [];
      smallConfig.flushCallback = async (data: any[]) => {
        flushedData = [...data];
      };

      const smallBufferStage = new BufferStage(smallConfig);
      await smallBufferStage.initialize(smallConfig);

      const context = PipelineContextFactory.create('test-pipeline', 1);

      // 添加超过最大大小的数据
      for (let i = 0; i < 3; i++) {
        const pipelineData = PipelineDataFactory.create(
          {
            exchange: 'binance',
            symbol: 'BTCUSDT',
            type: DataType.TRADE,
            timestamp: Date.now(),
            data: { price: 50000 + i, volume: 1.5 }
          },
          'test-source'
        );

        await smallBufferStage.process(pipelineData, context);
      }

      // 等待异步刷新
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(flushedData.length).toBeGreaterThan(0);
      
      await smallBufferStage.destroy();
    });
  });

  describe('分区管理', () => {
    beforeEach(async () => {
      await bufferStage.initialize(config);
    });

    it('应该支持按交易所分区', async () => {
      const exchangeConfig = {
        ...config,
        partitionBy: 'exchange' as const
      };

      const exchangeBufferStage = new BufferStage(exchangeConfig);
      await exchangeBufferStage.initialize(exchangeConfig);

      const binanceData = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 50000, volume: 1.5 }
        },
        'test-source'
      );

      const okxData = PipelineDataFactory.create(
        {
          exchange: 'okx',
          symbol: 'BTCUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 50001, volume: 1.5 }
        },
        'test-source'
      );

      const context = PipelineContextFactory.create('test-pipeline', 1);

      await exchangeBufferStage.process(binanceData, context);
      await exchangeBufferStage.process(okxData, context);

      const state = exchangeBufferStage.getBufferState();
      expect(state.partitionCount).toBe(2); // 两个不同的交易所

      await exchangeBufferStage.destroy();
    });

    it('应该支持自定义分区函数', async () => {
      const customConfig = {
        ...config,
        partitionBy: 'custom' as const,
        partitionFunction: (data: PipelineData) => `${data.metadata.exchange}-${data.metadata.dataType}`
      };

      const customBufferStage = new BufferStage(customConfig);
      await customBufferStage.initialize(customConfig);

      const tradeData = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 50000, volume: 1.5 }
        },
        'test-source'
      );

      const tickerData = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: DataType.TICKER,
          timestamp: Date.now(),
          data: { price: 50000, volume: 1.5 }
        },
        'test-source'
      );

      const context = PipelineContextFactory.create('test-pipeline', 1);

      await customBufferStage.process(tradeData, context);
      await customBufferStage.process(tickerData, context);

      const state = customBufferStage.getBufferState();
      expect(state.partitionCount).toBe(2); // 两个不同的分区

      await customBufferStage.destroy();
    });
  });

  describe('背压处理', () => {
    it('应该在启用背压时阻塞处理', async () => {
      const backpressureConfig = {
        ...config,
        bufferPolicy: {
          ...config.bufferPolicy,
          maxSize: 2,
          backpressureThreshold: 0.5 // 50%阈值
        },
        backpressureStrategy: 'BLOCK' as const
      };

      const backpressureStage = new BufferStage(backpressureConfig);
      await backpressureStage.initialize(backpressureConfig);

      const context = PipelineContextFactory.create('test-pipeline', 1);

      // 添加数据直到触发背压
      const data1 = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 50000, volume: 1.5 }
        },
        'test-source'
      );

      await backpressureStage.process(data1, context);

      const state = backpressureStage.getBufferState();
      expect(state.size).toBe(1);

      await backpressureStage.destroy();
    });

    it('应该在DROP策略下丢弃数据', async () => {
      const dropConfig = {
        ...config,
        bufferPolicy: {
          ...config.bufferPolicy,
          maxSize: 1,
          backpressureThreshold: 0.5
        },
        backpressureStrategy: 'DROP' as const
      };

      let droppedData: any = null;
      const dropStage = new BufferStage(dropConfig);
      
      dropStage.on('dataDropped', (data) => {
        droppedData = data;
      });

      await dropStage.initialize(dropConfig);

      const context = PipelineContextFactory.create('test-pipeline', 1);

      // 添加多个数据项
      for (let i = 0; i < 3; i++) {
        const data = PipelineDataFactory.create(
          {
            exchange: 'binance',
            symbol: 'BTCUSDT',
            type: DataType.TRADE,
            timestamp: Date.now(),
            data: { price: 50000 + i, volume: 1.5 }
          },
          'test-source'
        );

        await dropStage.process(data, context);
      }

      // 应该有数据被丢弃
      expect(droppedData).toBeTruthy();

      await dropStage.destroy();
    });
  });

  describe('手动操作', () => {
    beforeEach(async () => {
      await bufferStage.initialize(config);
    });

    it('应该支持手动刷新所有分区', async () => {
      let flushedCount = 0;
      config.flushCallback = async (data: any[]) => {
        flushedCount += data.length;
      };

      // 重新创建以使用回调
      await bufferStage.destroy();
      bufferStage = new BufferStage(config);
      await bufferStage.initialize(config);

      const context = PipelineContextFactory.create('test-pipeline', 1);

      // 添加一些数据
      for (let i = 0; i < 5; i++) {
        const data = PipelineDataFactory.create(
          {
            exchange: 'binance',
            symbol: `BTC${i}USDT`,
            type: DataType.TRADE,
            timestamp: Date.now(),
            data: { price: 50000 + i, volume: 1.5 }
          },
          'test-source'
        );

        await bufferStage.process(data, context);
      }

      await bufferStage.flushAllPartitions();
      expect(flushedCount).toBe(5);
    });

    it('应该支持清空指定分区', async () => {
      const context = PipelineContextFactory.create('test-pipeline', 1);

      const data = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 50000, volume: 1.5 }
        },
        'test-source'
      );

      await bufferStage.process(data, context);

      let initialState = bufferStage.getBufferState();
      expect(initialState.size).toBe(1);

      bufferStage.clearPartition('binance:BTCUSDT');

      let clearedState = bufferStage.getBufferState();
      expect(clearedState.size).toBe(0);
    });

    it('应该支持清空所有分区', async () => {
      const context = PipelineContextFactory.create('test-pipeline', 1);

      // 添加多个分区的数据
      for (let i = 0; i < 3; i++) {
        const data = PipelineDataFactory.create(
          {
            exchange: 'binance',
            symbol: `BTC${i}USDT`,
            type: DataType.TRADE,
            timestamp: Date.now(),
            data: { price: 50000 + i, volume: 1.5 }
          },
          'test-source'
        );

        await bufferStage.process(data, context);
      }

      let initialState = bufferStage.getBufferState();
      expect(initialState.size).toBe(3);
      expect(initialState.partitionCount).toBe(3);

      bufferStage.clearAllPartitions();

      let clearedState = bufferStage.getBufferState();
      expect(clearedState.size).toBe(0);
      expect(clearedState.partitionCount).toBe(0);
    });
  });

  describe('指标和状态', () => {
    beforeEach(async () => {
      await bufferStage.initialize(config);
    });

    it('应该提供详细的缓冲区状态', async () => {
      const state = bufferStage.getBufferState();
      
      expect(state).toHaveProperty('size');
      expect(state).toHaveProperty('maxSize');
      expect(state).toHaveProperty('partitionCount');
      expect(state).toHaveProperty('memoryUsage');
      expect(state).toHaveProperty('isBackpressured');
      expect(state).toHaveProperty('oldestTimestamp');
      expect(state).toHaveProperty('newestTimestamp');
    });

    it('应该正确计算内存使用量', async () => {
      const context = PipelineContextFactory.create('test-pipeline', 1);

      const initialState = bufferStage.getBufferState();
      const initialMemory = initialState.memoryUsage;

      const data = PipelineDataFactory.create(
        {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: DataType.TRADE,
          timestamp: Date.now(),
          data: { price: 50000, volume: 1.5 }
        },
        'test-source'
      );

      await bufferStage.process(data, context);

      const updatedState = bufferStage.getBufferState();
      expect(updatedState.memoryUsage).toBeGreaterThan(initialMemory);
    });

    it('应该提供阶段指标', () => {
      const metrics = bufferStage.getMetrics();
      
      expect(metrics).toHaveProperty('processedCount');
      expect(metrics).toHaveProperty('errorCount');
      expect(metrics).toHaveProperty('averageLatency');
      expect(metrics).toHaveProperty('maxLatency');
      expect(metrics).toHaveProperty('throughput');
      expect(metrics).toHaveProperty('lastActivity');
    });
  });
});