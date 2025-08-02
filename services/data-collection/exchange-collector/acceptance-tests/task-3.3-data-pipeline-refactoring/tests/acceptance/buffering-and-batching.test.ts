/**
 * 验收测试：数据缓冲和批处理 (Data Buffering and Batch Processing)
 * 
 * 测试目标：
 * 1. 验证分区缓冲功能
 * 2. 验证基于大小和时间的刷新策略
 * 3. 验证背压处理机制
 * 4. 验证内存高效的批处理
 * 5. 验证并发访问处理
 * 6. 验证缓冲状态监控
 */

import { globalCache } from '@pixiu/shared-core';
import { BufferStage, BufferStageConfig } from '../../src/pipeline/stages/buffer-stage';
import {
  createMockMarketData,
  createMockMarketDataBatch,
  createHighFrequencyData,
  createMemoryStressTestData
} from '../../fixtures/mock-market-data';
import {
  createBufferStageConfig,
  createHighFrequencyConfig
} from '../../fixtures/test-configurations';
import { PipelineTestUtils } from '../../helpers/pipeline-test-utils';

describe('Task 3.3 - 数据缓冲和批处理 (Data Buffering and Batch Processing)', () => {
  let bufferStage: BufferStage;
  let flushedBatches: any[] = [];

  beforeEach(async () => {
    flushedBatches = [];
    
    const config = createBufferStageConfig({
      flushCallback: async (data) => {
        flushedBatches.push({
          timestamp: Date.now(),
          data: [...data],
          count: data.length
        });
      }
    });
    
    bufferStage = new BufferStage(config);
    await bufferStage.initialize(config);
  });

  afterEach(async () => {
    if (bufferStage) {
      await bufferStage.destroy();
    }
    flushedBatches = [];
  });

  afterAll(async () => {
    globalCache.destroy();
  });

  describe('分区缓冲功能 (Partitioned Buffering)', () => {
    test('should create separate partitions by exchange', async () => {
      const exchanges = ['binance', 'huobi', 'okx'];
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

      // 配置按交易所分区
      const exchangePartitionConfig = createBufferStageConfig({
        partitionBy: 'exchange',
        flushCallback: async (data) => {
          flushedBatches.push({
            exchange: data[0]?.metadata?.exchange,
            count: data.length,
            data: [...data]
          });
        }
      });

      const exchangeBuffer = new BufferStage(exchangePartitionConfig);
      await exchangeBuffer.initialize(exchangePartitionConfig);

      // 发送不同交易所的数据
      for (const exchange of exchanges) {
        const marketData = createMockMarketData({ exchange });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await exchangeBuffer.process(pipelineData, context);
      }

      const bufferState = exchangeBuffer.getBufferState();
      expect(bufferState.partitionCount).toBe(exchanges.length);
      expect(bufferState.size).toBe(exchanges.length);

      await exchangeBuffer.destroy();
    });

    test('should create separate partitions by symbol', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
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

      // 配置按交易对分区
      const symbolPartitionConfig = createBufferStageConfig({
        partitionBy: 'symbol',
        flushCallback: async (data) => {
          flushedBatches.push({
            symbol: data[0]?.metadata?.symbol,
            count: data.length,
            data: [...data]
          });
        }
      });

      const symbolBuffer = new BufferStage(symbolPartitionConfig);
      await symbolBuffer.initialize(symbolPartitionConfig);

      // 发送不同交易对的数据
      for (const symbol of symbols) {
        const marketData = createMockMarketData({ 
          exchange: 'binance',
          symbol 
        });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await symbolBuffer.process(pipelineData, context);
      }

      const bufferState = symbolBuffer.getBufferState();
      expect(bufferState.partitionCount).toBe(symbols.length);

      await symbolBuffer.destroy();
    });

    test('should create partitions using custom function', async () => {
      const customPartitionConfig = createBufferStageConfig({
        partitionBy: 'custom',
        partitionFunction: (data) => {
          // 自定义分区：高价值和低价值
          const price = data.marketData.data?.price || 0;
          return price > 10000 ? 'high-value' : 'low-value';
        }
      });

      const customBuffer = new BufferStage(customPartitionConfig);
      await customBuffer.initialize(customPartitionConfig);

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

      // 发送高价值数据
      const highValueData = createMockMarketData({
        data: { price: 50000, volume: 1 }
      });
      const highValuePipelineData = PipelineTestUtils.createPipelineData(highValueData, 'test-source');
      await customBuffer.process(highValuePipelineData, context);

      // 发送低价值数据
      const lowValueData = createMockMarketData({
        data: { price: 1000, volume: 1 }
      });
      const lowValuePipelineData = PipelineTestUtils.createPipelineData(lowValueData, 'test-source');
      await customBuffer.process(lowValuePipelineData, context);

      const bufferState = customBuffer.getBufferState();
      expect(bufferState.partitionCount).toBe(2);

      await customBuffer.destroy();
    });
  });

  describe('刷新策略 (Flush Strategies)', () => {
    test('should flush buffer based on size threshold', async () => {
      const sizeBasedConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 3,
          maxAge: 60000, // 1 minute
          flushInterval: 30000, // 30 seconds
          backpressureThreshold: 0.8
        },
        flushCallback: async (data) => {
          flushedBatches.push({
            trigger: 'size',
            count: data.length,
            data: [...data]
          });
        }
      });

      const sizeBuffer = new BufferStage(sizeBasedConfig);
      await sizeBuffer.initialize(sizeBasedConfig);

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

      // 发送3个消息触发大小阈值
      for (let i = 0; i < 3; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await sizeBuffer.process(pipelineData, context);
      }

      // 等待可能的异步刷新
      await PipelineTestUtils.wait(100);

      expect(flushedBatches.length).toBeGreaterThan(0);
      expect(flushedBatches[0].count).toBe(3);

      await sizeBuffer.destroy();
    });

    test('should flush buffer based on time threshold', async () => {
      const timeBasedConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 100,
          maxAge: 500, // 500ms max age
          flushInterval: 200, // 200ms flush interval
          backpressureThreshold: 0.8
        },
        flushCallback: async (data) => {
          flushedBatches.push({
            trigger: 'time',
            count: data.length,
            timestamp: Date.now(),
            data: [...data]
          });
        }
      });

      const timeBuffer = new BufferStage(timeBasedConfig);
      await timeBuffer.initialize(timeBasedConfig);

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

      // 发送少量数据
      const marketData = createMockMarketData();
      const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
      await timeBuffer.process(pipelineData, context);

      // 等待时间触发刷新
      await PipelineTestUtils.wait(700);

      expect(flushedBatches.length).toBeGreaterThan(0);
      expect(flushedBatches[0].count).toBe(1);

      await timeBuffer.destroy();
    });

    test('should flush buffer based on data age', async () => {
      const ageBasedConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 100,
          maxAge: 300, // 300ms max age
          flushInterval: 1000,
          backpressureThreshold: 0.8
        },
        flushCallback: async (data) => {
          flushedBatches.push({
            trigger: 'age',
            count: data.length,
            oldestTimestamp: Math.min(...data.map(d => d.timestamp)),
            data: [...data]
          });
        }
      });

      const ageBuffer = new BufferStage(ageBasedConfig);
      await ageBuffer.initialize(ageBasedConfig);

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

      // 发送数据
      const marketData = createMockMarketData();
      const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
      await ageBuffer.process(pipelineData, context);

      // 等待数据老化
      await PipelineTestUtils.wait(500);

      // 发送另一个数据触发老化检查
      const newMarketData = createMockMarketData();
      const newPipelineData = PipelineTestUtils.createPipelineData(newMarketData, 'test-source');
      await ageBuffer.process(newPipelineData, context);

      expect(flushedBatches.length).toBeGreaterThan(0);

      await ageBuffer.destroy();
    });

    test('should support manual flush operations', async () => {
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

      // 添加一些数据到缓冲区
      for (let i = 0; i < 5; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await bufferStage.process(pipelineData, context);
      }

      // 手动刷新所有分区
      await bufferStage.flushAllPartitions();

      expect(flushedBatches.length).toBeGreaterThan(0);
      
      const totalFlushedCount = flushedBatches.reduce((sum, batch) => sum + batch.count, 0);
      expect(totalFlushedCount).toBe(5);
    });
  });

  describe('背压处理机制 (Backpressure Handling)', () => {
    test('should handle BLOCK backpressure strategy', async () => {
      const blockConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 3,
          maxAge: 60000,
          flushInterval: 30000,
          backpressureThreshold: 0.6 // 60% threshold
        },
        enableBackpressure: true,
        backpressureStrategy: 'BLOCK'
      });

      const blockBuffer = new BufferStage(blockConfig);
      await blockBuffer.initialize(blockConfig);

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

      let processedCount = 0;
      const processingPromises: Promise<any>[] = [];

      // 发送足够的数据触发背压
      for (let i = 0; i < 5; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        
        const promise = blockBuffer.process(pipelineData, context).then(() => {
          processedCount++;
        });
        
        processingPromises.push(promise);
      }

      // 等待所有处理完成
      await Promise.all(processingPromises);

      expect(processedCount).toBe(5);

      await blockBuffer.destroy();
    });

    test('should handle DROP backpressure strategy', async () => {
      const dropConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 2,
          maxAge: 60000,
          flushInterval: 30000,
          backpressureThreshold: 0.5 // 50% threshold
        },
        enableBackpressure: true,
        backpressureStrategy: 'DROP'
      });

      const dropBuffer = new BufferStage(dropConfig);
      await dropBuffer.initialize(dropConfig);

      let droppedCount = 0;
      dropBuffer.on('dataDropped', (data, reason) => {
        expect(reason).toBe('backpressure');
        droppedCount++;
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

      // 发送超过容量的数据
      for (let i = 0; i < 10; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await dropBuffer.process(pipelineData, context);
      }

      const bufferState = dropBuffer.getBufferState();
      expect(bufferState.isBackpressured).toBe(true);
      expect(droppedCount).toBeGreaterThan(0);

      await dropBuffer.destroy();
    });

    test('should handle SPILL backpressure strategy', async () => {
      const spillConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 2,
          maxAge: 60000,
          flushInterval: 30000,
          backpressureThreshold: 0.5
        },
        enableBackpressure: true,
        backpressureStrategy: 'SPILL',
        spillPath: '/tmp/buffer-spill'
      });

      const spillBuffer = new BufferStage(spillConfig);
      await spillBuffer.initialize(spillConfig);

      let spilledCount = 0;
      spillBuffer.on('dataSpilled', () => {
        spilledCount++;
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

      // 发送超过容量的数据
      for (let i = 0; i < 5; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await spillBuffer.process(pipelineData, context);
      }

      expect(spilledCount).toBeGreaterThan(0);

      await spillBuffer.destroy();
    });
  });

  describe('内存高效批处理 (Memory-Efficient Batch Processing)', () => {
    test('should handle large batches efficiently', async () => {
      const largeBatchConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 1000,
          maxAge: 10000,
          flushInterval: 5000,
          backpressureThreshold: 0.8
        },
        flushCallback: async (data) => {
          flushedBatches.push({
            count: data.length,
            totalSize: JSON.stringify(data).length,
            timestamp: Date.now()
          });
        }
      });

      const largeBatchBuffer = new BufferStage(largeBatchConfig);
      await largeBatchBuffer.initialize(largeBatchConfig);

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

      const batchData = createMockMarketDataBatch(500);
      
      for (const marketData of batchData) {
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await largeBatchBuffer.process(pipelineData, context);
      }

      // 手动刷新
      await largeBatchBuffer.flushAllPartitions();

      expect(flushedBatches.length).toBeGreaterThan(0);
      const totalProcessed = flushedBatches.reduce((sum, batch) => sum + batch.count, 0);
      expect(totalProcessed).toBe(500);

      await largeBatchBuffer.destroy();
    });

    test('should monitor memory usage during buffering', async () => {
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

      const initialState = bufferStage.getBufferState();
      const initialMemory = initialState.memoryUsage;

      // 添加一些数据
      for (let i = 0; i < 10; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await bufferStage.process(pipelineData, context);
      }

      const filledState = bufferStage.getBufferState();
      expect(filledState.memoryUsage).toBeGreaterThan(initialMemory);
      expect(filledState.size).toBe(10);
    });

    test('should handle memory-intensive data efficiently', async () => {
      const memoryConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 10,
          maxAge: 10000,
          flushInterval: 5000,
          backpressureThreshold: 0.7
        },
        enableBackpressure: true,
        backpressureStrategy: 'BLOCK'
      });

      const memoryBuffer = new BufferStage(memoryConfig);
      await memoryBuffer.initialize(memoryConfig);

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

      // 发送内存密集型数据
      for (let i = 0; i < 5; i++) {
        const largeData = createMemoryStressTestData(10); // 10KB per message
        const pipelineData = PipelineTestUtils.createPipelineData(largeData, 'test-source');
        await memoryBuffer.process(pipelineData, context);
      }

      const bufferState = memoryBuffer.getBufferState();
      expect(bufferState.memoryUsage).toBeGreaterThan(50000); // Should be > 50KB

      await memoryBuffer.destroy();
    });
  });

  describe('并发访问处理 (Concurrent Access Handling)', () => {
    test('should handle concurrent data processing safely', async () => {
      const concurrentConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 50,
          maxAge: 5000,
          flushInterval: 2000,
          backpressureThreshold: 0.8
        }
      });

      const concurrentBuffer = new BufferStage(concurrentConfig);
      await concurrentBuffer.initialize(concurrentConfig);

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

      const concurrentPromises: Promise<any>[] = [];
      const concurrentCount = 20;

      // 并发发送数据
      for (let i = 0; i < concurrentCount; i++) {
        const marketData = createMockMarketData({ 
          sequence: i + 1,
          exchange: i % 2 === 0 ? 'binance' : 'huobi' // 两个交易所
        });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        
        const promise = concurrentBuffer.process(pipelineData, context);
        concurrentPromises.push(promise);
      }

      await Promise.all(concurrentPromises);

      const bufferState = concurrentBuffer.getBufferState();
      expect(bufferState.size).toBe(concurrentCount);
      expect(bufferState.partitionCount).toBe(2); // binance 和 huobi

      await concurrentBuffer.destroy();
    });

    test('should handle concurrent flush operations safely', async () => {
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

      // 添加数据
      for (let i = 0; i < 10; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await bufferStage.process(pipelineData, context);
      }

      // 并发刷新操作
      const flushPromises = [
        bufferStage.flushAllPartitions(),
        bufferStage.flushAllPartitions(),
        bufferStage.flushAllPartitions()
      ];

      await Promise.all(flushPromises);

      // 验证没有重复刷新
      const totalFlushed = flushedBatches.reduce((sum, batch) => sum + batch.count, 0);
      expect(totalFlushed).toBe(10); // 只刷新一次
    });
  });

  describe('高频数据处理 (High-Frequency Data Processing)', () => {
    test('should handle high-frequency data streams', async () => {
      const highFreqConfig = createHighFrequencyConfig();
      const highFreqBuffer = new BufferStage(highFreqConfig);
      
      let flushCount = 0;
      const modifiedConfig = {
        ...highFreqConfig,
        flushCallback: async (data) => {
          flushCount++;
          flushedBatches.push({
            flushIndex: flushCount,
            count: data.length,
            timestamp: Date.now()
          });
        }
      };

      await highFreqBuffer.initialize(modifiedConfig);

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

      // 生成高频数据
      const highFreqData = createHighFrequencyData(2000, 50); // 2秒内，每50ms一条
      
      for (const marketData of highFreqData) {
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await highFreqBuffer.process(pipelineData, context);
      }

      // 等待自动刷新
      await PipelineTestUtils.wait(1000);

      expect(flushCount).toBeGreaterThan(0);
      
      await highFreqBuffer.destroy();
    });

    test('should maintain performance under high load', async () => {
      const performanceConfig = createBufferStageConfig({
        bufferPolicy: {
          maxSize: 1000,
          maxAge: 1000,
          flushInterval: 500,
          backpressureThreshold: 0.9
        },
        enableCompression: true,
        compressionAlgorithm: 'gzip'
      });

      const performanceBuffer = new BufferStage(performanceConfig);
      await performanceBuffer.initialize(performanceConfig);

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

      const startTime = Date.now();
      const messageCount = 1000;

      // 高负载测试
      for (let i = 0; i < messageCount; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await performanceBuffer.process(pipelineData, context);
      }

      const processingTime = Date.now() - startTime;
      const throughput = (messageCount / processingTime) * 1000; // messages per second

      expect(throughput).toBeGreaterThan(100); // 至少100 msg/s
      expect(processingTime).toBeLessThan(30000); // 30秒内完成

      await performanceBuffer.destroy();
    });
  });

  describe('缓冲状态监控 (Buffer State Monitoring)', () => {
    test('should provide accurate buffer state information', async () => {
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

      const initialState = bufferStage.getBufferState();
      expect(initialState.size).toBe(0);
      expect(initialState.partitionCount).toBe(0);
      expect(initialState.isBackpressured).toBe(false);

      // 添加数据到多个分区
      const exchanges = ['binance', 'huobi'];
      for (const exchange of exchanges) {
        for (let i = 0; i < 3; i++) {
          const marketData = createMockMarketData({ 
            exchange,
            sequence: i + 1 
          });
          const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
          await bufferStage.process(pipelineData, context);
        }
      }

      const filledState = bufferStage.getBufferState();
      expect(filledState.size).toBe(6);
      expect(filledState.partitionCount).toBe(2);
      expect(filledState.memoryUsage).toBeGreaterThan(0);
      expect(filledState.oldestTimestamp).toBeGreaterThan(0);
      expect(filledState.newestTimestamp).toBeGreaterThanOrEqual(filledState.oldestTimestamp);
    });

    test('should emit buffer events correctly', async () => {
      const events: string[] = [];
      
      bufferStage.on('dataBuffered', () => events.push('dataBuffered'));
      bufferStage.on('partitionFlushed', () => events.push('partitionFlushed'));
      bufferStage.on('allPartitionsCleared', () => events.push('allPartitionsCleared'));

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

      // 添加数据
      const marketData = createMockMarketData();
      const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
      await bufferStage.process(pipelineData, context);

      expect(events).toContain('dataBuffered');

      // 刷新分区
      await bufferStage.flushAllPartitions();
      expect(events).toContain('partitionFlushed');

      // 清空所有分区
      bufferStage.clearAllPartitions();
      expect(events).toContain('allPartitionsCleared');
    });

    test('should track buffer metrics accurately', async () => {
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

      const initialMetrics = bufferStage.getMetrics();
      expect(initialMetrics.processedCount).toBe(0);

      // 处理一些数据
      for (let i = 0; i < 5; i++) {
        const marketData = createMockMarketData({ sequence: i + 1 });
        const pipelineData = PipelineTestUtils.createPipelineData(marketData, 'test-source');
        await bufferStage.process(pipelineData, context);
      }

      const updatedMetrics = bufferStage.getMetrics();
      expect(updatedMetrics.processedCount).toBe(5);
      expect(updatedMetrics.errorCount).toBe(0);
      expect(updatedMetrics.lastActivity).toBeGreaterThan(initialMetrics.lastActivity);
    });
  });
});