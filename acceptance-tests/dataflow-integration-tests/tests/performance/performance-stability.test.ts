/**
 * DataFlow性能和稳定性测试
 * 验证吞吐量、延迟、背压处理和内存稳定性
 */

import { DataFlowTestManager, TestDataGenerator } from '@helpers/dataflow-test-utils';
import { TestPerformanceMonitor, PerformanceBenchmark } from '@helpers/test-performance-monitor';
import { 
  generateHighFrequencyTrades,
  generateStressTestData,
  generateBulkDepthData,
  PERFORMANCE_BENCHMARKS
} from '@fixtures/test-data-sets';
import { testUtils } from '../../setup';

describe('DataFlow性能和稳定性测试', () => {
  let testManager: DataFlowTestManager;
  let dataGenerator: TestDataGenerator;
  let performanceMonitor: TestPerformanceMonitor;
  let benchmark: PerformanceBenchmark;

  beforeEach(async () => {
    testManager = new DataFlowTestManager();
    dataGenerator = TestDataGenerator.getInstance();
    performanceMonitor = new TestPerformanceMonitor();
    benchmark = new PerformanceBenchmark();
    
    dataGenerator.reset();
  });

  afterEach(async () => {
    await testManager.cleanup();
    performanceMonitor.reset();
    benchmark.clear();
  });

  describe('吞吐量性能测试', () => {
    it('应该达到1000条/秒的基准吞吐量', async () => {
      performanceMonitor.start('基准吞吐量测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: true,
          batchSize: 100,
          flushTimeout: 50
        },
        performance: {
          maxQueueSize: 50000,
          processingTimeout: 10000,
          enableBackpressure: false, // 禁用背压以测试最大吞吐量
          backpressureThreshold: 40000
        },
        monitoring: {
          enableMetrics: true,
          metricsInterval: 1000,
          enableLatencyTracking: true
        }
      });

      const throughputChannel = testManager.createMockChannel('throughput', {
        processingDelay: 0 // 最小处理延迟
      });

      dataFlowManager.registerChannel(throughputChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['throughput']));
      dataFlowManager.start();

      // 生成测试数据 (2000条消息)
      const throughputData = generateHighFrequencyTrades(2000, 'BTCUSDT', 50000);
      
      console.log(`📊 开始吞吐量测试 - ${throughputData.length}条消息`);
      
      const startTime = Date.now();
      
      // 批量发送所有消息
      const sendPromises = throughputData.map((data, index) => 
        benchmark.measure(`send-${index}`, () => dataFlowManager.processData(data))
      );
      
      await Promise.all(sendPromises);
      await testManager.waitForProcessing(15000);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // 秒
      const actualThroughput = throughputData.length / duration;

      const benchmarkStats = benchmark.getStatistics();
      const performanceReport = performanceMonitor.stop();

      // 验证吞吐量要求
      expect(actualThroughput).toBeGreaterThan(1000);
      expect(throughputChannel.getOutputHistory()).toHaveLength(throughputData.length);

      console.log('📊 基准吞吐量测试结果:');
      console.log(`  - 处理消息数: ${throughputData.length}`);
      console.log(`  - 处理时间: ${duration.toFixed(2)}s`);
      console.log(`  - 实际吞吐量: ${actualThroughput.toFixed(0)}条/秒`);
      console.log(`  - 平均发送延迟: ${benchmarkStats?.average.toFixed(2)}ms`);
      console.log(`  - 内存峰值: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);
      console.log(`  - 内存增长: ${performanceReport.metrics.memoryUsage.growth.toFixed(2)}MB`);

      // 性能验收标准
      expect(actualThroughput).toHaveThroughputGreaterThan(1000);
      expect(benchmarkStats?.average).toBeLessThan(50);

      console.log('✅ 基准吞吐量测试通过');
    }, 60000);

    it('应该在5000条/秒的极限吞吐量下保持稳定', async () => {
      performanceMonitor.start('极限吞吐量测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: true,
          batchSize: 200,
          flushTimeout: 20
        },
        performance: {
          maxQueueSize: 100000,
          processingTimeout: 15000,
          enableBackpressure: true,
          backpressureThreshold: 80000
        },
        monitoring: {
          enableMetrics: true,
          metricsInterval: 500,
          enableLatencyTracking: true
        }
      });

      // 创建多个并发通道
      const extremeChannels = [];
      for (let i = 0; i < 5; i++) {
        const channel = testManager.createMockChannel(`extreme-${i}`, {
          processingDelay: 0
        });
        extremeChannels.push(channel);
        dataFlowManager.registerChannel(channel);
      }

      const channelIds = extremeChannels.map(c => c.id);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(channelIds));
      dataFlowManager.start();

      // 生成极限测试数据 (10000条消息)
      const extremeData = generateStressTestData(5000, 2); // 5000条/秒 * 2秒

      console.log(`📊 开始极限吞吐量测试 - ${extremeData.length}条消息`);

      let backpressureActivated = false;
      let backpressureDeactivated = false;
      
      dataFlowManager.on('backpressureActivated', (queueSize) => {
        backpressureActivated = true;
        console.log(`⚠️  背压激活 - 队列大小: ${queueSize}`);
      });

      dataFlowManager.on('backpressureDeactivated', (queueSize) => {
        backpressureDeactivated = true;
        console.log(`✅ 背压解除 - 队列大小: ${queueSize}`);
      });

      const startTime = Date.now();
      
      // 模拟真实的高频流 - 分批发送
      const batchSize = 500;
      for (let i = 0; i < extremeData.length; i += batchSize) {
        const batch = extremeData.slice(i, i + batchSize);
        const batchPromises = batch.map(data => 
          dataFlowManager.processData(data).catch(error => {
            // 在极限负载下可能会有一些失败，记录但不中断测试
            console.warn(`处理失败: ${error.message}`);
          })
        );
        
        await Promise.allSettled(batchPromises);
        
        // 小间隔以模拟真实流量模式
        if (i + batchSize < extremeData.length) {
          await testUtils.wait(100);
        }
      }

      await testManager.waitForProcessing(30000);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const actualThroughput = extremeData.length / duration;

      const performanceReport = performanceMonitor.stop();
      const finalStats = dataFlowManager.getStats();

      // 计算总输出量
      const totalOutputs = extremeChannels.reduce(
        (total, channel) => total + channel.getOutputHistory().length,
        0
      );

      // 计算成功率
      const successRate = totalOutputs / (extremeData.length * extremeChannels.length);

      console.log('📊 极限吞吐量测试结果:');
      console.log(`  - 输入消息数: ${extremeData.length}`);
      console.log(`  - 处理时间: ${duration.toFixed(2)}s`);
      console.log(`  - 实际吞吐量: ${actualThroughput.toFixed(0)}条/秒`);
      console.log(`  - 总输出量: ${totalOutputs}`);
      console.log(`  - 成功率: ${(successRate * 100).toFixed(1)}%`);
      console.log(`  - 背压激活: ${backpressureActivated ? '是' : '否'}`);
      console.log(`  - 最终队列大小: ${finalStats.currentQueueSize}`);
      console.log(`  - 处理错误数: ${finalStats.totalErrors}`);
      console.log(`  - 内存峰值: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      // 极限性能验收标准 (相对宽松)
      expect(actualThroughput).toBeGreaterThan(3000); // 至少3000条/秒
      expect(successRate).toBeGreaterThan(0.9); // 成功率 > 90%
      expect(finalStats.currentQueueSize).toBeLessThan(1000); // 队列最终应该接近清空

      console.log('✅ 极限吞吐量测试通过');
    }, 90000);
  });

  describe('延迟性能测试', () => {
    it('应该保持P95延迟小于50ms', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: false, // 禁用批处理以测量端到端延迟
          batchSize: 1,
          flushTimeout: 0
        },
        performance: {
          maxQueueSize: 10000,
          processingTimeout: 5000,
          enableBackpressure: false,
          backpressureThreshold: 8000
        }
      });

      const latencyChannel = testManager.createMockChannel('latency', {
        processingDelay: 1 // 最小延迟
      });

      dataFlowManager.registerChannel(latencyChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['latency']));
      dataFlowManager.start();

      const testCount = 200;
      const latencies: number[] = [];

      console.log(`📊 开始延迟测试 - ${testCount}条消息`);

      // 逐条发送并测量端到端延迟
      for (let i = 0; i < testCount; i++) {
        const data = dataGenerator.generateMarketData({
          symbol: 'BTCUSDT',
          type: 'trade',
          receivedAt: Date.now()
        });

        const startTime = Date.now();
        
        await dataFlowManager.processData(data);
        
        // 等待处理完成
        await testUtils.waitFor(() => latencyChannel.getOutputHistory().length > i, 2000);
        
        const endTime = Date.now();
        const latency = endTime - startTime;
        latencies.push(latency);
        
        // 避免过快发送
        await testUtils.wait(5);
      }

      // 计算延迟统计
      const sortedLatencies = latencies.slice().sort((a, b) => a - b);
      const stats = {
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p50: sortedLatencies[Math.floor(sortedLatencies.length * 0.5)],
        p95: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)],
        p99: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)]
      };

      console.log('📊 延迟测试结果:');
      console.log(`  - 样本数量: ${testCount}`);
      console.log(`  - 最小延迟: ${stats.min.toFixed(2)}ms`);
      console.log(`  - 平均延迟: ${stats.avg.toFixed(2)}ms`);
      console.log(`  - 最大延迟: ${stats.max.toFixed(2)}ms`);
      console.log(`  - P50延迟: ${stats.p50.toFixed(2)}ms`);
      console.log(`  - P95延迟: ${stats.p95.toFixed(2)}ms`);
      console.log(`  - P99延迟: ${stats.p99.toFixed(2)}ms`);

      // 延迟验收标准
      expect(stats.p95).toBeLessThan(50); // P95 < 50ms
      expect(stats.avg).toBeLessThan(25); // 平均 < 25ms
      expect(stats.max).toBeLessThan(200); // 最大 < 200ms

      expect(stats).toHaveLatencyLessThan(50);

      console.log('✅ 延迟性能测试通过');
    }, 30000);

    it('应该在负载下保持延迟稳定性', async () => {
      performanceMonitor.start('负载延迟测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: true,
          batchSize: 50,
          flushTimeout: 100
        },
        performance: {
          maxQueueSize: 20000,
          processingTimeout: 10000,
          enableBackpressure: true,
          backpressureThreshold: 15000
        }
      });

      const loadChannels = [];
      for (let i = 0; i < 3; i++) {
        const channel = testManager.createMockChannel(`load-${i}`, {
          processingDelay: Math.random() * 5 // 0-5ms随机延迟
        });
        loadChannels.push(channel);
        dataFlowManager.registerChannel(channel);
      }

      const channelIds = loadChannels.map(c => c.id);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(channelIds));
      dataFlowManager.start();

      // 生成负载测试数据
      const loadData = generateHighFrequencyTrades(1500, 'BTCUSDT', 50000);
      
      // 持续发送负载的同时测量延迟
      const latencyMeasurements: Array<{ timestamp: number; latency: number }> = [];
      
      const loadSendingPromise = (async () => {
        for (const data of loadData) {
          await dataFlowManager.processData(data);
          await testUtils.wait(1); // 1ms间隔
        }
      })();

      // 在负载发送期间定期测量延迟
      const latencyTestingPromise = (async () => {
        for (let i = 0; i < 50; i++) {
          await testUtils.wait(100); // 每100ms测一次
          
          const testData = dataGenerator.generateMarketData({
            symbol: 'TESTLATENCY',
            type: 'trade'
          });

          const startTime = Date.now();
          await dataFlowManager.processData(testData);
          
          // 等待这个特定测试数据被处理
          let processed = false;
          const timeout = Date.now() + 3000;
          
          while (!processed && Date.now() < timeout) {
            const found = loadChannels.some(channel => 
              channel.getOutputHistory().some(output => 
                output.data.symbol === 'TESTLATENCY'
              )
            );
            
            if (found) {
              processed = true;
              const endTime = Date.now();
              latencyMeasurements.push({
                timestamp: startTime,
                latency: endTime - startTime
              });
            } else {
              await testUtils.wait(10);
            }
          }
        }
      })();

      await Promise.all([loadSendingPromise, latencyTestingPromise]);
      await testManager.waitForProcessing(10000);

      const performanceReport = performanceMonitor.stop();

      // 分析负载下的延迟变化
      const latencies = latencyMeasurements.map(m => m.latency);
      const latencyStats = {
        count: latencies.length,
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        std: Math.sqrt(latencies.reduce((sum, lat) => sum + Math.pow(lat - latencies.reduce((a, b) => a + b, 0) / latencies.length, 2), 0) / latencies.length)
      };

      console.log('📊 负载延迟测试结果:');
      console.log(`  - 负载数据量: ${loadData.length}`);
      console.log(`  - 延迟测量次数: ${latencyStats.count}`);
      console.log(`  - 平均延迟: ${latencyStats.avg.toFixed(2)}ms`);
      console.log(`  - 最小延迟: ${latencyStats.min.toFixed(2)}ms`);
      console.log(`  - 最大延迟: ${latencyStats.max.toFixed(2)}ms`);
      console.log(`  - 延迟标准差: ${latencyStats.std.toFixed(2)}ms`);
      console.log(`  - 内存峰值: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      // 负载下延迟验收标准
      expect(latencyStats.avg).toBeLessThan(100); // 负载下平均延迟 < 100ms
      expect(latencyStats.max).toBeLessThan(500); // 负载下最大延迟 < 500ms
      expect(latencyStats.std).toBeLessThan(50); // 延迟标准差 < 50ms (稳定性)

      console.log('✅ 负载延迟测试通过');
    }, 60000);
  });

  describe('背压处理测试', () => {
    it('应该在队列达到阈值时激活背压', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: false,
          batchSize: 1,
          flushTimeout: 0
        },
        performance: {
          maxQueueSize: 1000,
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 500 // 较低的阈值
        }
      });

      // 创建慢速通道以造成队列积压
      const slowChannel = testManager.createMockChannel('slow', {
        processingDelay: 50 // 50ms延迟
      });

      dataFlowManager.registerChannel(slowChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['slow']));
      dataFlowManager.start();

      let backpressureActivated = false;
      let backpressureDeactivated = false;
      let maxQueueSize = 0;

      dataFlowManager.on('backpressureActivated', (queueSize) => {
        backpressureActivated = true;
        maxQueueSize = Math.max(maxQueueSize, queueSize);
        console.log(`⚠️  背压激活 - 队列大小: ${queueSize}`);
      });

      dataFlowManager.on('backpressureDeactivated', (queueSize) => {
        backpressureDeactivated = true;
        console.log(`✅ 背压解除 - 队列大小: ${queueSize}`);
      });

      // 快速发送大量数据造成积压
      const backpressureData = generateHighFrequencyTrades(800, 'BTCUSDT', 50000);
      
      console.log(`📊 开始背压测试 - 快速发送${backpressureData.length}条消息`);

      const startTime = Date.now();
      
      // 极快速度发送数据
      const sendPromises = backpressureData.map(data => 
        dataFlowManager.processData(data).catch(() => {
          // 背压激活时可能会有失败，这是预期的
        })
      );

      await Promise.allSettled(sendPromises);
      
      // 等待队列处理完成
      await testManager.waitForProcessing(30000);
      
      const endTime = Date.now();
      const stats = dataFlowManager.getStats();

      console.log('📊 背压测试结果:');
      console.log(`  - 发送数据量: ${backpressureData.length}`);
      console.log(`  - 处理时间: ${((endTime - startTime) / 1000).toFixed(2)}s`);
      console.log(`  - 背压激活: ${backpressureActivated ? '是' : '否'}`);
      console.log(`  - 背压解除: ${backpressureDeactivated ? '是' : '否'}`);
      console.log(`  - 最大队列大小: ${maxQueueSize}`);
      console.log(`  - 最终队列大小: ${stats.currentQueueSize}`);
      console.log(`  - 总处理数: ${stats.totalProcessed}`);
      console.log(`  - 总错误数: ${stats.totalErrors}`);
      console.log(`  - 输出历史: ${slowChannel.getOutputHistory().length}`);

      // 背压验收标准
      expect(backpressureActivated).toBe(true); // 应该激活背压
      expect(maxQueueSize).toBeGreaterThan(500); // 队列应该超过阈值
      expect(stats.currentQueueSize).toBeLessThan(100); // 最终队列应该接近清空
      expect(slowChannel.getOutputHistory().length).toBeGreaterThan(0); // 应该有数据被处理

      console.log('✅ 背压处理测试通过');
    }, 45000);

    it('应该在背压下智能丢弃数据', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        performance: {
          maxQueueSize: 200, // 很小的队列
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 100
        }
      });

      const tinyChannel = testManager.createMockChannel('tiny', {
        processingDelay: 100 // 很慢的处理
      });

      dataFlowManager.registerChannel(tinyChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['tiny']));
      dataFlowManager.start();

      // 发送超过队列容量的数据
      const overflowData = generateHighFrequencyTrades(500, 'BTCUSDT', 50000);
      
      let droppedCount = 0;
      
      for (const data of overflowData) {
        try {
          await dataFlowManager.processData(data);
        } catch (error) {
          droppedCount++;
        }
      }

      await testManager.waitForProcessing(20000);

      const stats = dataFlowManager.getStats();
      const processedCount = tinyChannel.getOutputHistory().length;

      console.log('📊 背压数据丢弃测试结果:');
      console.log(`  - 发送数据量: ${overflowData.length}`);
      console.log(`  - 丢弃数据量: ${droppedCount}`);
      console.log(`  - 实际处理量: ${processedCount}`);
      console.log(`  - 最终队列大小: ${stats.currentQueueSize}`);
      console.log(`  - 丢弃率: ${((droppedCount / overflowData.length) * 100).toFixed(1)}%`);

      // 验证数据丢弃机制
      expect(processedCount).toBeLessThan(overflowData.length); // 不是所有数据都被处理
      expect(processedCount).toBeGreaterThan(0); // 但确实处理了一些数据
      expect(stats.currentQueueSize).toBeLessThan(50); // 队列没有无限增长

      console.log('✅ 背压数据丢弃测试通过');
    }, 30000);
  });

  describe('内存稳定性测试', () => {
    it('应该在长时间运行下保持内存稳定', async () => {
      performanceMonitor.start('内存稳定性测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: true,
          batchSize: 100,
          flushTimeout: 100
        },
        performance: {
          maxQueueSize: 10000,
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 8000
        }
      });

      const memoryChannel = testManager.createMockChannel('memory', {
        processingDelay: 1
      });

      dataFlowManager.registerChannel(memoryChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['memory']));
      dataFlowManager.start();

      const initialMemory = process.memoryUsage();
      console.log(`📊 开始内存稳定性测试 - 初始内存: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

      // 模拟长时间运行 - 持续发送数据
      const testDuration = 10000; // 10秒
      const messageInterval = 50; // 50ms发送一条
      const startTime = Date.now();
      let messageCount = 0;

      while (Date.now() - startTime < testDuration) {
        // 发送各种类型的数据
        const dataTypes = ['trade', 'ticker', 'depth'];
        const dataType = dataTypes[messageCount % dataTypes.length];
        
        let testData;
        if (dataType === 'depth') {
          // 偶尔发送大型深度数据测试内存管理
          testData = generateBulkDepthData(1, 'BTCUSDT', 50000, 200)[0];
        } else {
          testData = dataGenerator.generateMarketData({
            type: dataType,
            symbol: messageCount % 2 === 0 ? 'BTCUSDT' : 'ETHUSDT'
          });
        }

        await dataFlowManager.processData(testData);
        messageCount++;

        await testUtils.wait(messageInterval);

        // 每1000条消息检查一次内存
        if (messageCount % 100 === 0) {
          const currentMemory = process.memoryUsage();
          console.log(`📊 消息 ${messageCount}, 内存: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        }
      }

      await testManager.waitForProcessing(5000);

      // 强制垃圾回收
      if (performanceMonitor.forceGC()) {
        await testUtils.wait(1000);
      }

      const finalMemory = process.memoryUsage();
      const performanceReport = performanceMonitor.stop();
      const memoryGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024);

      console.log('📊 内存稳定性测试结果:');
      console.log(`  - 测试时长: ${testDuration}ms`);
      console.log(`  - 发送消息数: ${messageCount}`);
      console.log(`  - 处理消息数: ${memoryChannel.getOutputHistory().length}`);
      console.log(`  - 初始内存: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  - 最终内存: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  - 内存增长: ${memoryGrowth.toFixed(2)}MB`);
      console.log(`  - 内存峰值: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      // 内存稳定性验收标准
      expect(memoryGrowth).toBeLessThan(100); // 内存增长 < 100MB
      expect(performanceReport.metrics.memoryUsage.peak).toBeLessThan(200); // 峰值内存 < 200MB
      expect(memoryChannel.getOutputHistory().length).toBeGreaterThan(messageCount * 0.8); // 至少处理80%的消息

      console.log('✅ 内存稳定性测试通过');
    }, 30000);

    it('应该正确清理资源避免内存泄漏', async () => {
      const initialMemory = process.memoryUsage();
      
      // 创建并销毁多个DataFlowManager实例
      const iterations = 5;
      const memorySnapshots = [];

      for (let i = 0; i < iterations; i++) {
        console.log(`📊 资源清理测试 - 迭代 ${i + 1}/${iterations}`);
        
        const manager = new DataFlowTestManager();
        const dataFlowManager = await manager.createDataFlowManager();

        // 创建一些通道和规则
        for (let j = 0; j < 3; j++) {
          const channel = manager.createMockChannel(`test-${i}-${j}`);
          dataFlowManager.registerChannel(channel);
        }

        dataFlowManager.addRoutingRule(manager.createCatchAllRule(['test-0-0', 'test-0-1']));
        dataFlowManager.start();

        // 发送一些数据
        const testData = generateHighFrequencyTrades(200, 'BTCUSDT', 50000);
        for (const data of testData) {
          await dataFlowManager.processData(data);
        }

        await manager.waitForProcessing(2000);

        // 清理资源
        await manager.cleanup();

        // 强制垃圾回收
        if (global.gc) {
          global.gc();
          await testUtils.wait(500);
        }

        const currentMemory = process.memoryUsage();
        memorySnapshots.push(currentMemory.heapUsed);
        
        console.log(`  当前内存: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      }

      const finalMemory = process.memoryUsage();
      const totalGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024);

      // 分析内存增长趋势
      const growthTrend = memorySnapshots.map((memory, index) => 
        index === 0 ? 0 : (memory - memorySnapshots[0]) / (1024 * 1024)
      );

      console.log('📊 资源清理测试结果:');
      console.log(`  - 迭代次数: ${iterations}`);
      console.log(`  - 初始内存: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  - 最终内存: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  - 总内存增长: ${totalGrowth.toFixed(2)}MB`);
      console.log(`  - 内存增长趋势: [${growthTrend.map(g => g.toFixed(1)).join(', ')}]MB`);

      // 资源清理验收标准
      expect(totalGrowth).toBeLessThan(50); // 总增长 < 50MB
      
      // 检查内存增长趋势不是线性上升的（表明有清理）
      const lastFewGrowths = growthTrend.slice(-3);
      const avgGrowthRate = lastFewGrowths.reduce((a, b) => a + b, 0) / lastFewGrowths.length;
      expect(avgGrowthRate).toBeLessThan(30); // 平均增长率 < 30MB

      console.log('✅ 资源清理测试通过');
    }, 45000);
  });

  describe('并发和竞态条件测试', () => {
    it('应该在高并发下保持数据一致性', async () => {
      performanceMonitor.start('并发一致性测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: false, // 禁用批处理以便更好地测试并发
          batchSize: 1,
          flushTimeout: 0
        },
        performance: {
          maxQueueSize: 50000,
          processingTimeout: 10000,
          enableBackpressure: false,
          backpressureThreshold: 40000
        }
      });

      // 创建多个并发通道
      const concurrentChannels = [];
      for (let i = 0; i < 8; i++) {
        const channel = testManager.createMockChannel(`concurrent-${i}`, {
          processingDelay: Math.random() * 3 // 随机延迟0-3ms
        });
        concurrentChannels.push(channel);
        dataFlowManager.registerChannel(channel);
      }

      const channelIds = concurrentChannels.map(c => c.id);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(channelIds));
      dataFlowManager.start();

      // 生成测试数据
      const concurrencyData = generateHighFrequencyTrades(2000, 'BTCUSDT', 50000);
      
      console.log(`📊 开始并发一致性测试 - ${concurrencyData.length}条消息`);

      // 高并发发送数据
      const concurrentPromises = concurrencyData.map((data, index) => 
        dataFlowManager.processData({
          ...data,
          metadata: { ...data.metadata, sequenceId: index } // 添加序列ID以验证一致性
        })
      );

      await Promise.all(concurrentPromises);
      await testManager.waitForProcessing(15000);

      const performanceReport = performanceMonitor.stop();
      const stats = dataFlowManager.getStats();

      // 验证数据一致性
      const totalOutputs = concurrentChannels.reduce(
        (total, channel) => total + channel.getOutputHistory().length,
        0
      );

      // 每个消息应该被路由到所有通道
      const expectedOutputs = concurrencyData.length * concurrentChannels.length;
      
      // 收集所有输出的序列ID
      const allSequenceIds = new Set();
      concurrentChannels.forEach(channel => {
        channel.getOutputHistory().forEach(output => {
          const sequenceId = output.data.metadata?.sequenceId;
          if (sequenceId !== undefined) {
            allSequenceIds.add(sequenceId);
          }
        });
      });

      console.log('📊 并发一致性测试结果:');
      console.log(`  - 输入消息数: ${concurrencyData.length}`);
      console.log(`  - 并发通道数: ${concurrentChannels.length}`);
      console.log(`  - 预期输出数: ${expectedOutputs}`);
      console.log(`  - 实际输出数: ${totalOutputs}`);
      console.log(`  - 唯一序列ID数: ${allSequenceIds.size}`);
      console.log(`  - 处理成功率: ${((totalOutputs / expectedOutputs) * 100).toFixed(1)}%`);
      console.log(`  - 数据完整性: ${((allSequenceIds.size / concurrencyData.length) * 100).toFixed(1)}%`);
      console.log(`  - 内存峰值: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      // 并发一致性验收标准
      expect(totalOutputs).toBeGreaterThan(expectedOutputs * 0.95); // 至少95%的输出
      expect(allSequenceIds.size).toBe(concurrencyData.length); // 所有消息都应该有输出
      expect(stats.totalErrors).toBeLessThan(concurrencyData.length * 0.01); // 错误率 < 1%

      console.log('✅ 并发一致性测试通过');
    }, 45000);
  });
});