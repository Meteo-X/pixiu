/**
 * 数据转换器综合测试
 * 验证StandardDataTransformer和CompressionTransformer的功能
 */

import { StandardDataTransformer, CompressionTransformer } from '../../../services/data-collection/exchange-collector/src/dataflow/transformers/data-transformer';
import { TestDataGenerator, DataValidationUtils } from '@helpers/dataflow-test-utils';
import { TestPerformanceMonitor, PerformanceBenchmark } from '@helpers/test-performance-monitor';
import { 
  BASIC_TRADE_DATA, 
  BASIC_TICKER_DATA, 
  BASIC_DEPTH_DATA,
  ERROR_TEST_DATA,
  generateBulkDepthData,
  generateHighFrequencyTrades 
} from '@fixtures/test-data-sets';
import { testUtils } from '../../setup';

describe('数据转换器综合测试', () => {
  let standardTransformer: StandardDataTransformer;
  let compressionTransformer: CompressionTransformer;
  let dataGenerator: TestDataGenerator;
  let performanceMonitor: TestPerformanceMonitor;
  let benchmark: PerformanceBenchmark;

  beforeEach(() => {
    standardTransformer = new StandardDataTransformer();
    compressionTransformer = new CompressionTransformer();
    dataGenerator = TestDataGenerator.getInstance();
    performanceMonitor = new TestPerformanceMonitor();
    benchmark = new PerformanceBenchmark();
    
    dataGenerator.reset();
  });

  afterEach(() => {
    standardTransformer.resetStats();
    performanceMonitor.reset();
    benchmark.clear();
  });

  describe('StandardDataTransformer测试', () => {
    describe('数据标准化功能', () => {
      it('应该正确标准化交易所名称为小写', async () => {
        const testData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          exchange: 'BINANCE' // 大写
        });

        const result = await standardTransformer.transform(testData);

        expect(result.exchange).toBe('binance'); // 应该转换为小写
        expect(result.symbol).toBe(testData.symbol);
        expect(result.type).toBe(testData.type);
      });

      it('应该正确标准化交易对名称为大写', async () => {
        const testData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          symbol: 'btcusdt' // 小写
        });

        const result = await standardTransformer.transform(testData);

        expect(result.symbol).toBe('BTCUSDT'); // 应该转换为大写
        expect(result.exchange).toBe(testData.exchange);
        expect(result.type).toBe(testData.type);
      });

      it('应该标准化时间戳格式', async () => {
        const testData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          timestamp: '1640995200000' // 字符串时间戳
        });

        const result = await standardTransformer.transform(testData);

        expect(typeof result.timestamp).toBe('number');
        expect(result.timestamp).toBe(1640995200000);
        expect(result.receivedAt).toBeDefined();
      });

      it('应该标准化数据类型名称', async () => {
        const testCases = [
          { input: 'trades', expected: 'trade' },
          { input: '24hrTicker', expected: 'ticker' },
          { input: 'orderbook', expected: 'depth' },
          { input: 'partialBookDepth', expected: 'depth' }
        ];

        for (const { input, expected } of testCases) {
          const testData = dataGenerator.generateMarketData({
            ...BASIC_TRADE_DATA,
            type: input
          });

          const result = await standardTransformer.transform(testData);
          expect(result.type).toBe(expected);
        }
      });
    });

    describe('元数据添加功能', () => {
      it('应该添加处理时间元数据', async () => {
        const testData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
        const beforeProcessing = Date.now();

        const result = await standardTransformer.transform(testData);
        const afterProcessing = Date.now();

        expect(result.metadata).toBeDefined();
        expect(result.metadata.processedAt).toBeWithinRange(beforeProcessing, afterProcessing);
        expect(result.metadata.source).toBe('exchange-collector');
        expect(result.metadata.processingVersion).toBe('3.1.0');
      });

      it('应该计算数据延迟', async () => {
        const receivedAt = Date.now() - 1000; // 1秒前接收
        const testData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          receivedAt
        });

        const result = await standardTransformer.transform(testData);

        expect(result.metadata.latency).toBeGreaterThan(1000); // 延迟应该大于1秒
        expect(result.metadata.latency).toBeLessThan(2000); // 但不会太大
      });

      it('应该计算数据质量分数', async () => {
        // 测试高质量数据
        const highQualityData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          receivedAt: Date.now() - 100 // 很小的延迟
        });

        const highQualityResult = await standardTransformer.transform(highQualityData);
        expect(highQualityResult.metadata.qualityScore).toBeGreaterThan(0.8);

        // 测试低质量数据
        const lowQualityData = dataGenerator.generateMarketData({
          exchange: undefined, // 缺少字段
          symbol: 'BTCUSDT',
          type: 'trade',
          timestamp: Date.now(),
          receivedAt: Date.now() - 10000, // 很大的延迟
          data: { price: 50000, quantity: 0.1 }
        });

        try {
          const lowQualityResult = await standardTransformer.transform(lowQualityData);
          expect(lowQualityResult.metadata.qualityScore).toBeLessThan(0.5);
        } catch (error) {
          // 数据质量太差可能直接验证失败，这也是预期的
          expect(error.message).toContain('Data validation failed');
        }
      });

      it('应该保留并扩展现有元数据', async () => {
        const testData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          metadata: {
            originalSource: 'binance-websocket',
            customField: 'test-value'
          }
        });

        const result = await standardTransformer.transform(testData);

        expect(result.metadata.originalSource).toBe('binance-websocket');
        expect(result.metadata.customField).toBe('test-value');
        expect(result.metadata.processedAt).toBeDefined();
        expect(result.metadata.source).toBe('exchange-collector');
      });
    });

    describe('数据验证功能', () => {
      it('应该验证基本字段完整性', async () => {
        const validData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
        expect(standardTransformer.validate(validData)).toBe(true);

        // 测试各种无效数据
        const invalidCases = [
          ERROR_TEST_DATA.MISSING_EXCHANGE,
          ERROR_TEST_DATA.INVALID_TIMESTAMP,
          ERROR_TEST_DATA.MISSING_DATA
        ];

        for (const invalidData of invalidCases) {
          expect(standardTransformer.validate(invalidData as any)).toBe(false);
        }
      });

      it('应该验证特定数据类型', async () => {
        // 验证交易数据
        const validTradeData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          type: 'trade',
          data: {
            price: 50000,
            quantity: 0.1,
            side: 'buy'
          }
        });
        expect(standardTransformer.validate(validTradeData)).toBe(true);

        // 验证无效交易数据
        const invalidTradeData = dataGenerator.generateMarketData({
          ...BASIC_TRADE_DATA,
          type: 'trade',
          data: {
            price: -100, // 负价格
            quantity: 0.1
          }
        });
        expect(standardTransformer.validate(invalidTradeData)).toBe(false);

        // 验证Ticker数据
        const validTickerData = dataGenerator.generateMarketData({
          ...BASIC_TICKER_DATA,
          type: 'ticker',
          data: {
            price: 50000,
            volume: 1000
          }
        });
        expect(standardTransformer.validate(validTickerData)).toBe(true);

        // 验证深度数据
        const validDepthData = dataGenerator.generateMarketData({
          ...BASIC_DEPTH_DATA,
          type: 'depth',
          data: {
            bids: [[50000, 1], [49990, 2]],
            asks: [[50010, 1], [50020, 2]]
          }
        });
        expect(standardTransformer.validate(validDepthData)).toBe(true);
      });

      it('应该在验证失败时抛出异常', async () => {
        const invalidData = dataGenerator.generateMarketData(ERROR_TEST_DATA.MISSING_EXCHANGE as any);

        await expect(standardTransformer.transform(invalidData))
          .rejects
          .toThrow('Data validation failed');
      });
    });

    describe('性能和统计功能', () => {
      it('应该正确记录转换统计信息', async () => {
        const initialStats = standardTransformer.getStats();
        expect(initialStats.transformedCount).toBe(0);
        expect(initialStats.errorCount).toBe(0);

        // 成功转换
        const validData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
        await standardTransformer.transform(validData);

        let stats = standardTransformer.getStats();
        expect(stats.transformedCount).toBe(1);
        expect(stats.errorCount).toBe(0);
        expect(stats.averageLatency).toBeGreaterThan(0);

        // 失败转换
        const invalidData = dataGenerator.generateMarketData(ERROR_TEST_DATA.MISSING_EXCHANGE as any);
        
        try {
          await standardTransformer.transform(invalidData);
        } catch (error) {
          // 预期的异常
        }

        stats = standardTransformer.getStats();
        expect(stats.transformedCount).toBe(1); // 没有增加
        expect(stats.errorCount).toBe(1);
        expect(stats.lastActivity).toBeGreaterThan(initialStats.lastActivity);
      });

      it('应该在高频转换下保持性能', async () => {
        performanceMonitor.start('标准转换器性能测试');

        const testData = generateHighFrequencyTrades(1000, 'BTCUSDT', 50000);
        
        await benchmark.measureBatch(
          testData.map((data, index) => ({
            name: `transform-${index}`,
            fn: () => standardTransformer.transform(data)
          }))
        );

        const stats = benchmark.getStatistics();
        const performanceReport = performanceMonitor.stop();

        // 验证性能要求
        expect(stats?.average).toBeLessThan(5); // 平均转换时间 < 5ms
        expect(stats?.p95).toBeLessThan(10); // P95转换时间 < 10ms

        const transformerStats = standardTransformer.getStats();
        expect(transformerStats.transformedCount).toBe(1000);
        expect(transformerStats.errorCount).toBe(0);

        console.log('📊 标准转换器性能结果:');
        console.log(`  - 转换数量: ${transformerStats.transformedCount}`);
        console.log(`  - 平均延迟: ${stats?.average.toFixed(2)}ms`);
        console.log(`  - P95延迟: ${stats?.p95.toFixed(2)}ms`);
        console.log(`  - 内存使用: ${performanceReport.metrics.memoryUsage.growth.toFixed(2)}MB`);

        console.log('✅ 标准转换器性能测试完成');
      }, 15000);
    });
  });

  describe('CompressionTransformer测试', () => {
    describe('深度数据压缩功能', () => {
      it('应该压缩大型深度数据', async () => {
        // 创建大型深度数据 (1000层)
        const largeDepthData = generateBulkDepthData(1, 'BTCUSDT', 50000, 1000)[0];

        const result = await compressionTransformer.transform(largeDepthData);

        // 验证压缩结果
        expect(result.data._compressed).toBe(true);
        expect(result.data.bids).toHaveLength(50); // 压缩到50层
        expect(result.data.asks).toHaveLength(50);
        expect(result.data._originalSize.bids).toBe(1000);
        expect(result.data._originalSize.asks).toBe(1000);

        expect(result.metadata.compressed).toBe(true);
        expect(result.metadata.compressionRatio).toBe(0.1); // 50/500 = 0.1
      });

      it('应该不压缩小型深度数据', async () => {
        // 创建小型深度数据 (20层)
        const smallDepthData = dataGenerator.generateMarketData({
          ...BASIC_DEPTH_DATA,
          type: 'depth',
          data: {
            bids: Array.from({ length: 20 }, (_, i) => [50000 - i * 10, Math.random()]),
            asks: Array.from({ length: 20 }, (_, i) => [50000 + i * 10, Math.random()])
          }
        });

        const result = await compressionTransformer.transform(smallDepthData);

        // 验证没有压缩
        expect(result.data._compressed).toBeUndefined();
        expect(result.metadata.compressed).toBeUndefined();
        expect(result.data.bids).toHaveLength(20); // 保持原始大小
        expect(result.data.asks).toHaveLength(20);
      });

      it('应该不压缩非深度数据', async () => {
        const tradeData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
        const tickerData = dataGenerator.generateMarketData(BASIC_TICKER_DATA);

        const tradeResult = await compressionTransformer.transform(tradeData);
        const tickerResult = await compressionTransformer.transform(tickerData);

        // 验证没有压缩
        expect(tradeResult.data).toEqual(tradeData.data);
        expect(tickerResult.data).toEqual(tickerData.data);
        expect(tradeResult.metadata.compressed).toBeUndefined();
        expect(tickerResult.metadata.compressed).toBeUndefined();
      });
    });

    describe('压缩性能和统计', () => {
      it('应该正确计算压缩比率', async () => {
        const testCases = [
          { bids: 100, asks: 100, expected: 0.5 }, // (50+50)/(100+100)
          { bids: 200, asks: 300, expected: 0.2 }, // (50+50)/(200+300)
          { bids: 500, asks: 1000, expected: 0.067 } // (50+50)/(500+1000)
        ];

        for (const { bids, asks, expected } of testCases) {
          const depthData = dataGenerator.generateMarketData({
            type: 'depth',
            data: {
              bids: Array.from({ length: bids }, (_, i) => [50000 - i, Math.random()]),
              asks: Array.from({ length: asks }, (_, i) => [50000 + i, Math.random()])
            }
          });

          const result = await compressionTransformer.transform(depthData);

          if (bids + asks > 200) { // 只有大数据才会被压缩
            expect(result.metadata.compressionRatio).toBeCloseTo(expected, 2);
          }
        }
      });

      it('应该记录压缩统计信息', async () => {
        const initialStats = compressionTransformer.getStats();
        expect(initialStats.transformedCount).toBe(0);

        // 转换需要压缩的数据
        const largeDepthData = generateBulkDepthData(3, 'BTCUSDT', 50000, 500);
        
        for (const data of largeDepthData) {
          await compressionTransformer.transform(data);
        }

        const stats = compressionTransformer.getStats();
        expect(stats.transformedCount).toBe(3);
        expect(stats.errorCount).toBe(0);
        expect(stats.averageLatency).toBeGreaterThan(0);
      });

      it('应该在大数据量下保持压缩性能', async () => {
        performanceMonitor.start('压缩转换器性能测试');

        // 创建多个大型深度数据
        const largeDataSet = generateBulkDepthData(50, 'BTCUSDT', 50000, 1000);

        await benchmark.measureBatch(
          largeDataSet.map((data, index) => ({
            name: `compress-${index}`,
            fn: () => compressionTransformer.transform(data),
            metadata: { originalSize: data.data.bids.length + data.data.asks.length }
          }))
        );

        const stats = benchmark.getStatistics();
        const performanceReport = performanceMonitor.stop();

        // 验证压缩性能
        expect(stats?.average).toBeLessThan(20); // 平均压缩时间 < 20ms
        expect(stats?.p95).toBeLessThan(50); // P95压缩时间 < 50ms

        const transformerStats = compressionTransformer.getStats();
        expect(transformerStats.transformedCount).toBe(50);
        expect(transformerStats.errorCount).toBe(0);

        console.log('📊 压缩转换器性能结果:');
        console.log(`  - 压缩数量: ${transformerStats.transformedCount}`);
        console.log(`  - 平均延迟: ${stats?.average.toFixed(2)}ms`);
        console.log(`  - P95延迟: ${stats?.p95.toFixed(2)}ms`);
        console.log(`  - 内存使用: ${performanceReport.metrics.memoryUsage.growth.toFixed(2)}MB`);

        console.log('✅ 压缩转换器性能测试完成');
      }, 15000);
    });
  });

  describe('转换器链集成测试', () => {
    it('应该正确执行转换器链', async () => {
      // 创建大型深度数据并使用非标准格式
      const rawData = dataGenerator.generateMarketData({
        exchange: 'BINANCE', // 大写
        symbol: 'btcusdt', // 小写
        type: 'partialBookDepth', // 非标准类型
        timestamp: '1640995200000', // 字符串时间戳
        data: {
          bids: Array.from({ length: 1000 }, (_, i) => [50000 - i, Math.random()]),
          asks: Array.from({ length: 1000 }, (_, i) => [50000 + i, Math.random()])
        }
      });

      // 先应用标准转换器
      const standardized = await standardTransformer.transform(rawData);

      // 验证标准化结果
      expect(standardized.exchange).toBe('binance');
      expect(standardized.symbol).toBe('BTCUSDT');
      expect(standardized.type).toBe('depth');
      expect(typeof standardized.timestamp).toBe('number');
      expect(standardized.metadata.processedAt).toBeDefined();

      // 再应用压缩转换器
      const compressed = await compressionTransformer.transform(standardized);

      // 验证压缩结果
      expect(compressed.data._compressed).toBe(true);
      expect(compressed.data.bids).toHaveLength(50);
      expect(compressed.data.asks).toHaveLength(50);
      expect(compressed.metadata.compressed).toBe(true);

      // 验证标准化的结果被保留
      expect(compressed.exchange).toBe('binance');
      expect(compressed.symbol).toBe('BTCUSDT');
      expect(compressed.type).toBe('depth');
      expect(compressed.metadata.processedAt).toBeDefined();
      expect(compressed.metadata.qualityScore).toBeDefined();

      console.log('✅ 转换器链集成测试完成');
    });

    it('应该在转换器链中正确处理错误', async () => {
      // 测试标准转换器验证失败时，压缩转换器不会被执行
      const invalidData = dataGenerator.generateMarketData(ERROR_TEST_DATA.MISSING_DATA as any);

      try {
        await standardTransformer.transform(invalidData);
        fail('应该抛出验证异常');
      } catch (error) {
        expect(error.message).toContain('Data validation failed');
      }

      // 验证转换器统计信息正确记录
      const standardStats = standardTransformer.getStats();
      expect(standardStats.errorCount).toBe(1);
      expect(standardStats.transformedCount).toBe(0);

      const compressionStats = compressionTransformer.getStats();
      expect(compressionStats.transformedCount).toBe(0); // 压缩转换器没有被调用
    });

    it('应该在转换器链中保持高性能', async () => {
      performanceMonitor.start('转换器链性能测试');

      // 创建混合数据集（需要标准化和压缩的数据）
      const mixedDataSet = [
        ...generateHighFrequencyTrades(200, 'BTCUSDT', 50000), // 交易数据
        ...generateBulkDepthData(50, 'ETHUSDT', 3000, 500) // 大深度数据
      ];

      await benchmark.measureBatch(
        mixedDataSet.map((data, index) => ({
          name: `chain-transform-${index}`,
          fn: async () => {
            const standardized = await standardTransformer.transform(data);
            return await compressionTransformer.transform(standardized);
          },
          metadata: { dataType: data.type }
        }))
      );

      const stats = benchmark.getStatistics();
      const performanceReport = performanceMonitor.stop();

      // 验证转换器链性能
      expect(stats?.average).toBeLessThan(25); // 平均链转换时间 < 25ms
      expect(stats?.p95).toBeLessThan(60); // P95链转换时间 < 60ms

      console.log('📊 转换器链性能结果:');
      console.log(`  - 转换数量: ${mixedDataSet.length}`);
      console.log(`  - 平均延迟: ${stats?.average.toFixed(2)}ms`);
      console.log(`  - P95延迟: ${stats?.p95.toFixed(2)}ms`);
      console.log(`  - 内存使用: ${performanceReport.metrics.memoryUsage.growth.toFixed(2)}MB`);

      console.log('✅ 转换器链性能测试完成');
    }, 20000);
  });
});