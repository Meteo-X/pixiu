/**
 * 完整DataFlow端到端集成测试
 * 验证从BinanceAdapter到各输出通道的完整数据流路径
 */

import { DataFlowTestManager, TestDataGenerator, MockOutputChannel } from '@helpers/dataflow-test-utils';
import { TestPerformanceMonitor } from '@helpers/test-performance-monitor';
import { mockServiceManager } from '@mocks/mock-services';
import { BASIC_TRADE_DATA, MULTI_TYPE_DATA, generateHighFrequencyTrades } from '@fixtures/test-data-sets';
import { testUtils } from '../../setup';

describe('DataFlow端到端集成测试', () => {
  let testManager: DataFlowTestManager;
  let dataGenerator: TestDataGenerator;
  let performanceMonitor: TestPerformanceMonitor;

  beforeAll(async () => {
    // 启动Mock服务
    await mockServiceManager.startAll({
      webSocket: { port: 18080 },
      redis: true,
      pubSub: true
    });
    
    console.log('🚀 Mock服务已启动');
  });

  afterAll(async () => {
    // 停止Mock服务
    await mockServiceManager.stopAll();
    console.log('🛑 Mock服务已停止');
  });

  beforeEach(async () => {
    testManager = new DataFlowTestManager();
    dataGenerator = TestDataGenerator.getInstance();
    performanceMonitor = new TestPerformanceMonitor();
    
    // 重置数据生成器
    dataGenerator.reset();
  });

  afterEach(async () => {
    await testManager.cleanup();
    performanceMonitor.reset();
  });

  describe('基础端到端数据流', () => {
    it('应该成功处理单个市场数据从输入到输出', async () => {
      // 创建DataFlowManager
      const dataFlowManager = await testManager.createDataFlowManager();
      
      // 创建Mock输出通道
      const pubsubChannel = testManager.createMockChannel('pubsub-test', {
        type: 'pubsub',
        name: 'Test PubSub Channel'
      });
      
      const websocketChannel = testManager.createMockChannel('websocket-test', {
        type: 'websocket',
        name: 'Test WebSocket Channel'
      });
      
      const cacheChannel = testManager.createMockChannel('cache-test', {
        type: 'cache',
        name: 'Test Cache Channel'
      });

      // 注册通道到数据流管理器
      dataFlowManager.registerChannel(pubsubChannel);
      dataFlowManager.registerChannel(websocketChannel);
      dataFlowManager.registerChannel(cacheChannel);

      // 创建路由规则 - 所有数据路由到所有通道
      const catchAllRule = testManager.createCatchAllRule([
        'pubsub-test',
        'websocket-test', 
        'cache-test'
      ]);
      dataFlowManager.addRoutingRule(catchAllRule);

      // 启动数据流管理器
      dataFlowManager.start();

      // 发送测试数据
      const testData = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
      
      await dataFlowManager.processData(testData);
      
      // 等待处理完成
      await testManager.waitForProcessing(2000);

      // 验证每个通道都收到了数据
      expect(pubsubChannel.getOutputHistory()).toHaveLength(1);
      expect(websocketChannel.getOutputHistory()).toHaveLength(1);
      expect(cacheChannel.getOutputHistory()).toHaveLength(1);

      // 验证输出数据内容
      const pubsubOutput = pubsubChannel.getOutputHistory()[0];
      expect(pubsubOutput.data.exchange).toBe(testData.exchange);
      expect(pubsubOutput.data.symbol).toBe(testData.symbol);
      expect(pubsubOutput.data.type).toBe(testData.type);

      // 验证元数据被正确添加
      expect(pubsubOutput.data.metadata).toBeDefined();
      expect(pubsubOutput.data.metadata.processedAt).toBeDefined();
      expect(pubsubOutput.data.metadata.qualityScore).toBeDefined();

      console.log('✅ 单个数据流测试完成');
    }, 10000);

    it('应该处理多种数据类型的混合流', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();
      
      // 创建专门的通道用于不同数据类型
      const tradeChannel = testManager.createMockChannel('trade-channel');
      const tickerChannel = testManager.createMockChannel('ticker-channel');
      const depthChannel = testManager.createMockChannel('depth-channel');
      const generalChannel = testManager.createMockChannel('general-channel');

      // 注册通道
      [tradeChannel, tickerChannel, depthChannel, generalChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 创建基于类型的路由规则
      const tradeRule = testManager.createTypeRule('trade', ['trade-channel', 'general-channel']);
      const tickerRule = testManager.createTypeRule('ticker', ['ticker-channel', 'general-channel']);
      const depthRule = testManager.createTypeRule('depth', ['depth-channel', 'general-channel']);

      dataFlowManager.addRoutingRule(tradeRule);
      dataFlowManager.addRoutingRule(tickerRule);
      dataFlowManager.addRoutingRule(depthRule);

      dataFlowManager.start();

      // 发送混合类型数据
      const mixedData = MULTI_TYPE_DATA.map(template => 
        dataGenerator.generateMarketData(template)
      );

      for (const data of mixedData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(3000);

      // 验证路由结果
      expect(tradeChannel.getOutputHistory()).toHaveLength(1); // 只有trade数据
      expect(tickerChannel.getOutputHistory()).toHaveLength(1); // 只有ticker数据
      expect(depthChannel.getOutputHistory()).toHaveLength(1); // 只有depth数据
      expect(generalChannel.getOutputHistory()).toHaveLength(4); // 所有类型数据

      // 验证数据内容正确性
      const tradeOutput = tradeChannel.getOutputHistory()[0];
      expect(tradeOutput.data.type).toBe('trade');
      
      const tickerOutput = tickerChannel.getOutputHistory()[0];
      expect(tickerOutput.data.type).toBe('ticker');

      console.log('✅ 混合数据类型流测试完成');
    }, 15000);

    it('应该处理高频数据流保持低延迟', async () => {
      performanceMonitor.start('高频数据流测试');
      
      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: true,
          batchSize: 50,
          flushTimeout: 100
        },
        performance: {
          maxQueueSize: 10000,
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 8000
        }
      });

      const fastChannel = testManager.createMockChannel('fast-channel', {
        processingDelay: 1 // 最小延迟
      });
      
      dataFlowManager.registerChannel(fastChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['fast-channel']));
      dataFlowManager.start();

      // 生成高频数据 (1000条/秒)
      const highFreqData = generateHighFrequencyTrades(1000, 'BTCUSDT', 50000);
      const startTime = Date.now();

      // 快速发送所有数据
      for (const data of highFreqData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(10000);
      const endTime = Date.now();

      const totalLatency = endTime - startTime;
      const averageLatency = totalLatency / highFreqData.length;

      // 验证处理结果
      expect(fastChannel.getOutputHistory()).toHaveLength(1000);
      
      // 验证延迟性能
      expect(averageLatency).toBeLessThan(50); // 平均延迟小于50ms
      
      const latencyStats = fastChannel.getLatencyStats();
      expect(latencyStats.p95).toBeLessThan(100); // P95延迟小于100ms

      const performanceReport = performanceMonitor.stop();
      console.log('📊 高频数据流性能报告:');
      console.log(`  - 处理数量: ${highFreqData.length}`);
      console.log(`  - 总延迟: ${totalLatency}ms`);
      console.log(`  - 平均延迟: ${averageLatency.toFixed(2)}ms`);
      console.log(`  - P95延迟: ${latencyStats.p95.toFixed(2)}ms`);
      console.log(`  - 内存增长: ${performanceReport.metrics.memoryUsage.growth.toFixed(2)}MB`);

      console.log('✅ 高频数据流延迟测试完成');
    }, 20000);

    it('应该在多通道并发输出时保持数据完整性', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: false, // 禁用批处理以便精确验证
          batchSize: 1,
          flushTimeout: 0
        }
      });

      // 创建多个并发通道
      const channels = [];
      for (let i = 0; i < 5; i++) {
        const channel = testManager.createMockChannel(`concurrent-channel-${i}`, {
          processingDelay: Math.random() * 10 // 随机延迟模拟真实环境
        });
        channels.push(channel);
        dataFlowManager.registerChannel(channel);
      }

      // 创建路由到所有通道的规则
      const channelIds = channels.map(c => c.id);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(channelIds));
      dataFlowManager.start();

      // 发送测试数据集
      const testDataSet = dataGenerator.generateBulkMarketData(100, BASIC_TRADE_DATA, {
        sequential: true,
        timeGap: 1
      });

      for (const data of testDataSet) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(5000);

      // 验证所有通道都收到了相同数量的数据
      for (const channel of channels) {
        expect(channel.getOutputHistory()).toHaveLength(testDataSet.length);
      }

      // 验证数据完整性 - 每个通道的数据应该与输入一致
      const firstChannelHistory = channels[0].getOutputHistory();
      
      for (let i = 0; i < testDataSet.length; i++) {
        const originalData = testDataSet[i];
        const outputData = firstChannelHistory[i].data;
        
        expect(outputData.exchange).toBe(originalData.exchange);
        expect(outputData.symbol).toBe(originalData.symbol);
        expect(outputData.type).toBe(originalData.type);
        expect(outputData.data).toEqual(expect.objectContaining(originalData.data));
      }

      // 验证所有通道输出一致性
      for (let i = 1; i < channels.length; i++) {
        const channelHistory = channels[i].getOutputHistory();
        expect(channelHistory).toHaveLength(firstChannelHistory.length);
        
        // 比较关键数据字段
        for (let j = 0; j < channelHistory.length; j++) {
          expect(channelHistory[j].data.symbol).toBe(firstChannelHistory[j].data.symbol);
          expect(channelHistory[j].data.type).toBe(firstChannelHistory[j].data.type);
        }
      }

      console.log(`✅ 并发通道数据完整性测试完成 (${channels.length}个通道, ${testDataSet.length}条数据)`);
    }, 15000);
  });

  describe('端到端故障恢复测试', () => {
    it('应该在单个通道故障时继续处理其他通道', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建正常通道和故障通道
      const normalChannel = testManager.createMockChannel('normal-channel');
      const faultyChannel = testManager.createMockChannel('faulty-channel', {
        shouldFail: true,
        failureRate: 1.0 // 100%失败率
      });
      const backupChannel = testManager.createMockChannel('backup-channel');

      [normalChannel, faultyChannel, backupChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 路由到所有通道
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule([
        'normal-channel', 
        'faulty-channel',
        'backup-channel'
      ]));

      dataFlowManager.start();

      // 监听通道错误事件
      let channelErrors = 0;
      dataFlowManager.on('channelError', (channelId, error) => {
        channelErrors++;
        expect(channelId).toBe('faulty-channel');
      });

      // 发送测试数据
      const testData = dataGenerator.generateBulkMarketData(10, BASIC_TRADE_DATA);
      
      for (const data of testData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(3000);

      // 验证正常通道和备份通道收到了数据
      expect(normalChannel.getOutputHistory()).toHaveLength(10);
      expect(backupChannel.getOutputHistory()).toHaveLength(10);
      
      // 验证故障通道没有成功输出
      expect(faultyChannel.getOutputHistory()).toHaveLength(0);
      
      // 验证错误事件被触发
      expect(channelErrors).toBeGreaterThan(0);

      console.log('✅ 通道故障恢复测试完成');
    }, 10000);

    it('应该在网络中断恢复后重新建立连接', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建模拟网络问题的通道
      const networkChannel = testManager.createMockChannel('network-channel', {
        failureRate: 0.5, // 50%故障率模拟网络不稳定
        processingDelay: 100
      });

      dataFlowManager.registerChannel(networkChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['network-channel']));
      dataFlowManager.start();

      // 发送第一批数据（网络不稳定）
      const firstBatch = dataGenerator.generateBulkMarketData(20, BASIC_TRADE_DATA);
      
      for (const data of firstBatch) {
        await dataFlowManager.processData(data).catch(() => {
          // 忽略网络错误
        });
      }

      await testManager.waitForProcessing(3000);
      const firstBatchSuccess = networkChannel.getOutputHistory().length;

      // 修复网络问题
      networkChannel.setFailureMode(false, 0);

      // 发送第二批数据（网络正常）
      const secondBatch = dataGenerator.generateBulkMarketData(20, BASIC_TRADE_DATA);
      
      for (const data of secondBatch) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(3000);
      const totalSuccess = networkChannel.getOutputHistory().length;

      // 验证网络恢复后处理正常
      expect(firstBatchSuccess).toBeLessThan(firstBatch.length); // 第一批有失败
      expect(totalSuccess).toBe(firstBatchSuccess + secondBatch.length); // 第二批全部成功

      console.log(`✅ 网络中断恢复测试完成 (第一批: ${firstBatchSuccess}/${firstBatch.length}, 第二批: ${secondBatch.length}/${secondBatch.length})`);
    }, 15000);
  });

  describe('端到端性能验证', () => {
    it('应该满足吞吐量>1000条/秒的要求', async () => {
      performanceMonitor.start('吞吐量基准测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: true,
          batchSize: 100,
          flushTimeout: 50
        },
        performance: {
          maxQueueSize: 50000,
          processingTimeout: 10000,
          enableBackpressure: true,
          backpressureThreshold: 40000
        }
      });

      const throughputChannel = testManager.createMockChannel('throughput-channel', {
        processingDelay: 0 // 最小延迟
      });

      dataFlowManager.registerChannel(throughputChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['throughput-channel']));
      dataFlowManager.start();

      // 生成2000条测试数据
      const throughputTestData = generateHighFrequencyTrades(2000, 'BTCUSDT', 50000);
      
      const startTime = Date.now();
      
      // 快速批量发送
      const sendPromises = throughputTestData.map(data => 
        dataFlowManager.processData(data)
      );
      
      await Promise.all(sendPromises);
      await testManager.waitForProcessing(10000);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // 秒
      const throughput = throughputTestData.length / duration;

      // 验证吞吐量要求
      expect(throughput).toBeGreaterThan(1000);
      expect(throughputChannel.getOutputHistory()).toHaveLength(2000);

      const performanceReport = performanceMonitor.stop();
      
      console.log('📊 吞吐量测试结果:');
      console.log(`  - 处理数量: ${throughputTestData.length}`);
      console.log(`  - 处理时间: ${duration.toFixed(2)}s`);
      console.log(`  - 吞吐量: ${throughput.toFixed(0)}条/秒`);
      console.log(`  - 内存使用: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);
      
      expect(throughput).toHaveThroughputGreaterThan(1000);

      console.log('✅ 吞吐量基准测试完成');
    }, 30000);

    it('应该满足P95延迟<50ms的要求', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: false, // 禁用批处理以测量单个消息延迟
          batchSize: 1,
          flushTimeout: 0
        }
      });

      const latencyChannel = testManager.createMockChannel('latency-channel', {
        processingDelay: 1 // 最小延迟
      });

      dataFlowManager.registerChannel(latencyChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['latency-channel']));
      dataFlowManager.start();

      const latencies: number[] = [];
      const testCount = 100;

      // 逐个发送并测量延迟
      for (let i = 0; i < testCount; i++) {
        const data = dataGenerator.generateMarketData(BASIC_TRADE_DATA);
        const startTime = Date.now();
        
        await dataFlowManager.processData(data);
        await testUtils.waitFor(() => latencyChannel.getOutputHistory().length > i, 1000);
        
        const endTime = Date.now();
        latencies.push(endTime - startTime);
        
        // 小间隔避免过度压力
        await testUtils.wait(10);
      }

      // 计算延迟统计
      const sortedLatencies = latencies.slice().sort((a, b) => a - b);
      const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      console.log('📊 延迟测试结果:');
      console.log(`  - 样本数量: ${testCount}`);
      console.log(`  - 平均延迟: ${avgLatency.toFixed(2)}ms`);
      console.log(`  - P95延迟: ${p95Latency.toFixed(2)}ms`);
      console.log(`  - 最大延迟: ${maxLatency.toFixed(2)}ms`);

      // 验证延迟要求
      expect(p95Latency).toBeLessThan(50);
      expect(avgLatency).toHaveLatencyLessThan(25);

      console.log('✅ 延迟基准测试完成');
    }, 20000);
  });
});