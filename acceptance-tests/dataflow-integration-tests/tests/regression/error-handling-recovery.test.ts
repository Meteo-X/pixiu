/**
 * DataFlow错误处理和恢复测试
 * 验证组件故障恢复、网络中断处理等场景
 */

import { DataFlowTestManager, TestDataGenerator } from '@helpers/dataflow-test-utils';
import { TestPerformanceMonitor, PerformanceBenchmark } from '@helpers/test-performance-monitor';
import { 
  generateHighFrequencyTrades,
  generateStressTestData,
  ERROR_TEST_DATA,
  BASIC_TRADE_DATA 
} from '@fixtures/test-data-sets';
import { testUtils } from '../../setup';

describe('DataFlow错误处理和恢复测试', () => {
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

  describe('组件故障恢复测试', () => {
    it('应该在单个通道故障时继续处理其他通道', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        errorHandling: {
          retryCount: 3,
          retryDelay: 100,
          enableCircuitBreaker: false,
          circuitBreakerThreshold: 10
        }
      });

      // 创建正常通道和故障通道
      const normalChannel1 = testManager.createMockChannel('normal-1');
      const normalChannel2 = testManager.createMockChannel('normal-2');
      const faultyChannel = testManager.createMockChannel('faulty', {
        shouldFail: true,
        failureRate: 1.0 // 100%失败率
      });

      [normalChannel1, normalChannel2, faultyChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      dataFlowManager.addRoutingRule(testManager.createCatchAllRule([
        'normal-1',
        'normal-2', 
        'faulty'
      ]));

      dataFlowManager.start();

      let channelErrorCount = 0;
      dataFlowManager.on('channelError', (channelId, error) => {
        expect(channelId).toBe('faulty');
        channelErrorCount++;
      });

      // 发送测试数据
      const recoveryTestData = generateHighFrequencyTrades(50, 'BTCUSDT', 50000);
      
      for (const data of recoveryTestData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(3000);

      // 验证故障隔离
      expect(normalChannel1.getOutputHistory()).toHaveLength(50);
      expect(normalChannel2.getOutputHistory()).toHaveLength(50);
      expect(faultyChannel.getOutputHistory()).toHaveLength(0); // 故障通道没有输出

      // 验证错误事件被触发
      expect(channelErrorCount).toBeGreaterThan(0);

      // 验证数据流管理器统计
      const stats = dataFlowManager.getStats();
      expect(stats.totalProcessed).toBe(50);
      expect(stats.totalErrors).toBeGreaterThan(0);

      console.log(`✅ 单通道故障隔离测试完成 - 错误事件: ${channelErrorCount}`);
    });

    it('应该在多个通道故障时保持部分功能', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建混合状态的通道
      const healthyChannel = testManager.createMockChannel('healthy');
      const intermittentChannel1 = testManager.createMockChannel('intermittent-1', {
        failureRate: 0.5 // 50%失败率
      });
      const intermittentChannel2 = testManager.createMockChannel('intermittent-2', {
        failureRate: 0.3 // 30%失败率
      });
      const deadChannel = testManager.createMockChannel('dead', {
        shouldFail: true,
        failureRate: 1.0
      });

      [healthyChannel, intermittentChannel1, intermittentChannel2, deadChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      dataFlowManager.addRoutingRule(testManager.createCatchAllRule([
        'healthy',
        'intermittent-1',
        'intermittent-2',
        'dead'
      ]));

      dataFlowManager.start();

      const errorsByChannel = new Map();
      dataFlowManager.on('channelError', (channelId, error) => {
        const currentCount = errorsByChannel.get(channelId) || 0;
        errorsByChannel.set(channelId, currentCount + 1);
      });

      // 发送大量测试数据
      const partialFailureData = generateHighFrequencyTrades(100, 'BTCUSDT', 50000);
      
      for (const data of partialFailureData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(5000);

      // 分析故障模式
      const channelResults = {
        healthy: healthyChannel.getOutputHistory().length,
        intermittent1: intermittentChannel1.getOutputHistory().length,
        intermittent2: intermittentChannel2.getOutputHistory().length,
        dead: deadChannel.getOutputHistory().length
      };

      console.log('📊 多通道故障测试结果:');
      console.log(`  - 健康通道输出: ${channelResults.healthy}`);
      console.log(`  - 间歇故障通道1: ${channelResults.intermittent1}`);
      console.log(`  - 间歇故障通道2: ${channelResults.intermittent2}`);
      console.log(`  - 死亡通道输出: ${channelResults.dead}`);

      // 验证故障容错能力
      expect(channelResults.healthy).toBe(100); // 健康通道应该处理所有数据
      expect(channelResults.intermittent1).toBeGreaterThan(30); // 间歇故障通道应该有部分输出
      expect(channelResults.intermittent1).toBeLessThan(80);
      expect(channelResults.intermittent2).toBeGreaterThan(50); // 较低故障率的通道输出更多
      expect(channelResults.dead).toBe(0); // 完全故障的通道无输出

      // 验证错误分布
      expect(errorsByChannel.get('healthy')).toBeUndefined(); // 健康通道无错误
      expect(errorsByChannel.get('dead')).toBeGreaterThan(50); // 死亡通道大量错误

      console.log('✅ 多通道故障容错测试完成');
    });

    it('应该支持故障通道的恢复', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建可恢复的故障通道
      const recoverableChannel = testManager.createMockChannel('recoverable', {
        shouldFail: true,
        failureRate: 1.0 // 初始完全故障
      });

      const stableChannel = testManager.createMockChannel('stable');

      [recoverableChannel, stableChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      dataFlowManager.addRoutingRule(testManager.createCatchAllRule([
        'recoverable',
        'stable'
      ]));

      dataFlowManager.start();

      // 第一阶段：故障状态
      console.log('📊 阶段1: 通道故障状态');
      const failureData = generateHighFrequencyTrades(30, 'BTCUSDT', 50000);
      
      for (const data of failureData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(2000);

      const failureResults = {
        recoverable: recoverableChannel.getOutputHistory().length,
        stable: stableChannel.getOutputHistory().length
      };

      expect(failureResults.recoverable).toBe(0); // 故障通道无输出
      expect(failureResults.stable).toBe(30); // 稳定通道正常工作

      // 第二阶段：通道恢复
      console.log('📊 阶段2: 通道恢复');
      recoverableChannel.setFailureMode(false, 0); // 恢复通道

      const recoveryData = generateHighFrequencyTrades(30, 'ETHUSDT', 3000);
      
      for (const data of recoveryData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(2000);

      const recoveryResults = {
        recoverable: recoverableChannel.getOutputHistory().length,
        stable: stableChannel.getOutputHistory().length
      };

      console.log('📊 故障恢复测试结果:');
      console.log(`  - 故障阶段 - 可恢复通道: ${failureResults.recoverable}, 稳定通道: ${failureResults.stable}`);
      console.log(`  - 恢复阶段 - 可恢复通道: ${recoveryResults.recoverable}, 稳定通道: ${recoveryResults.stable}`);

      // 验证恢复能力
      expect(recoveryResults.recoverable).toBe(30); // 恢复后应该处理新数据
      expect(recoveryResults.stable).toBe(60); // 稳定通道继续工作

      console.log('✅ 故障通道恢复测试完成');
    });
  });

  describe('网络中断处理测试', () => {
    it('应该处理网络不稳定场景', async () => {
      performanceMonitor.start('网络不稳定测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        errorHandling: {
          retryCount: 3,
          retryDelay: 50,
          enableCircuitBreaker: false,
          circuitBreakerThreshold: 10
        }
      });

      // 模拟网络不稳定的通道
      const unstableChannel = testManager.createMockChannel('unstable-network', {
        failureRate: 0.2, // 20%网络失败率
        processingDelay: 10 // 网络延迟
      });

      const localChannel = testManager.createMockChannel('local');

      [unstableChannel, localChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 创建不同路由策略
      const networkRule = testManager.createRoutingRule(
        'network-priority',
        (data) => data.symbol === 'BTCUSDT',
        ['unstable-network', 'local'], // 网络通道优先，本地备用
        { priority: 100 }
      );

      const localRule = testManager.createRoutingRule(
        'local-backup',
        () => true,
        ['local'], // 所有数据都路由到本地备用
        { priority: 50 }
      );

      dataFlowManager.addRoutingRule(networkRule);
      dataFlowManager.addRoutingRule(localRule);
      dataFlowManager.start();

      let networkErrors = 0;
      dataFlowManager.on('channelError', (channelId, error) => {
        if (channelId === 'unstable-network') {
          networkErrors++;
        }
      });

      // 发送测试数据
      const networkTestData = generateHighFrequencyTrades(200, 'BTCUSDT', 50000);
      
      for (const data of networkTestData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(5000);

      const performanceReport = performanceMonitor.stop();
      const networkResults = {
        unstableSuccess: unstableChannel.getOutputHistory().length,
        localTotal: localChannel.getOutputHistory().length,
        networkErrors
      };

      console.log('📊 网络不稳定测试结果:');
      console.log(`  - 不稳定网络成功: ${networkResults.unstableSuccess}`);
      console.log(`  - 本地备用总量: ${networkResults.localTotal}`);
      console.log(`  - 网络错误次数: ${networkResults.networkErrors}`);
      console.log(`  - 网络成功率: ${((networkResults.unstableSuccess / networkTestData.length) * 100).toFixed(1)}%`);
      console.log(`  - 内存使用: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      // 验证网络不稳定处理
      expect(networkResults.unstableSuccess).toBeGreaterThan(100); // 部分网络请求成功
      expect(networkResults.unstableSuccess).toBeLessThan(200); // 但不是全部成功
      expect(networkResults.localTotal).toBe(200); // 本地备用处理所有数据
      expect(networkResults.networkErrors).toBeGreaterThan(0); // 确实有网络错误

      console.log('✅ 网络不稳定处理测试完成');
    });

    it('应该在网络完全中断后恢复', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        errorHandling: {
          retryCount: 2,
          retryDelay: 100,
          enableCircuitBreaker: true,
          circuitBreakerThreshold: 5
        }
      });

      // 模拟网络通道（可控制连接状态）
      const networkChannel = testManager.createMockChannel('network-service', {
        shouldFail: true,
        failureRate: 1.0 // 初始网络完全中断
      });

      const offlineChannel = testManager.createMockChannel('offline-storage');

      [networkChannel, offlineChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      dataFlowManager.addRoutingRule(testManager.createCatchAllRule([
        'network-service',
        'offline-storage'
      ]));

      dataFlowManager.start();

      // 第一阶段：网络中断
      console.log('📊 阶段1: 网络完全中断');
      const disconnectedData = generateHighFrequencyTrades(40, 'BTCUSDT', 50000);
      
      for (const data of disconnectedData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(3000);

      const disconnectedResults = {
        network: networkChannel.getOutputHistory().length,
        offline: offlineChannel.getOutputHistory().length
      };

      expect(disconnectedResults.network).toBe(0); // 网络通道无输出
      expect(disconnectedResults.offline).toBe(40); // 离线存储处理所有数据

      // 第二阶段：网络恢复
      console.log('📊 阶段2: 网络连接恢复');
      networkChannel.setFailureMode(false, 0); // 恢复网络

      const reconnectedData = generateHighFrequencyTrades(40, 'ETHUSDT', 3000);
      
      for (const data of reconnectedData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(3000);

      const reconnectedResults = {
        network: networkChannel.getOutputHistory().length,
        offline: offlineChannel.getOutputHistory().length
      };

      console.log('📊 网络中断恢复测试结果:');
      console.log(`  - 中断期间 - 网络: ${disconnectedResults.network}, 离线: ${disconnectedResults.offline}`);
      console.log(`  - 恢复期间 - 网络: ${reconnectedResults.network}, 离线: ${reconnectedResults.offline}`);

      // 验证网络恢复能力
      expect(reconnectedResults.network).toBe(40); // 网络恢复后处理新数据
      expect(reconnectedResults.offline).toBe(80); // 离线存储持续工作

      console.log('✅ 网络中断恢复测试完成');
    });

    it('应该在网络超时时进行降级', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        performance: {
          maxQueueSize: 5000,
          processingTimeout: 3000, // 较短的超时时间
          enableBackpressure: true,
          backpressureThreshold: 4000
        }
      });

      // 模拟慢速网络通道
      const slowNetworkChannel = testManager.createMockChannel('slow-network', {
        processingDelay: 200 // 很慢的网络响应
      });

      const fastLocalChannel = testManager.createMockChannel('fast-local', {
        processingDelay: 1 // 快速本地处理
      });

      [slowNetworkChannel, fastLocalChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 优先使用网络，但本地作为备用
      const primaryRule = testManager.createRoutingRule(
        'primary-network',
        () => true,
        ['slow-network'],
        { priority: 100 }
      );

      const fallbackRule = testManager.createRoutingRule(
        'fallback-local',
        () => true,
        ['fast-local'],
        { priority: 50 }
      );

      dataFlowManager.addRoutingRule(primaryRule);
      dataFlowManager.addRoutingRule(fallbackRule);
      dataFlowManager.start();

      let backpressureActivated = false;
      dataFlowManager.on('backpressureActivated', () => {
        backpressureActivated = true;
        console.log('⚠️  慢速网络导致背压激活');
      });

      // 快速发送大量数据导致网络处理不过来
      const timeoutTestData = generateHighFrequencyTrades(100, 'BTCUSDT', 50000);
      const startTime = Date.now();
      
      for (const data of timeoutTestData) {
        await dataFlowManager.processData(data);
      }

      // 等待处理完成（或超时）
      await testManager.waitForProcessing(10000);
      
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;

      const timeoutResults = {
        slowNetwork: slowNetworkChannel.getOutputHistory().length,
        fastLocal: fastLocalChannel.getOutputHistory().length,
        backpressureActivated,
        processingTime
      };

      console.log('📊 网络超时降级测试结果:');
      console.log(`  - 慢速网络处理量: ${timeoutResults.slowNetwork}`);
      console.log(`  - 快速本地处理量: ${timeoutResults.fastLocal}`);
      console.log(`  - 背压是否激活: ${timeoutResults.backpressureActivated ? '是' : '否'}`);
      console.log(`  - 总处理时间: ${timeoutResults.processingTime.toFixed(2)}s`);

      // 验证超时降级行为
      expect(timeoutResults.fastLocal).toBe(100); // 本地通道应该处理所有数据
      expect(timeoutResults.slowNetwork).toBeLessThanOrEqual(100); // 慢速网络可能处理不完

      // 如果激活背压，说明超时处理正常工作
      if (timeoutResults.backpressureActivated) {
        console.log('✅ 背压机制正确处理了网络超时');
      }

      console.log('✅ 网络超时降级测试完成');
    }, 20000);
  });

  describe('数据格式错误处理测试', () => {
    it('应该正确处理和过滤异常数据', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      const validationChannel = testManager.createMockChannel('validation');
      dataFlowManager.registerChannel(validationChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['validation']));
      dataFlowManager.start();

      let processingErrors = 0;
      dataFlowManager.on('processingError', (error, data) => {
        processingErrors++;
        console.log(`数据处理错误: ${error.message} - 数据: ${JSON.stringify(data).substring(0, 100)}`);
      });

      // 混合有效和无效数据
      const mixedData = [
        // 有效数据
        dataGenerator.generateMarketData(BASIC_TRADE_DATA),
        dataGenerator.generateMarketData(BASIC_TRADE_DATA),
        
        // 无效数据
        ERROR_TEST_DATA.MISSING_EXCHANGE,
        ERROR_TEST_DATA.INVALID_TIMESTAMP,
        ERROR_TEST_DATA.MISSING_DATA,
        ERROR_TEST_DATA.INVALID_PRICE,
        ERROR_TEST_DATA.MALFORMED_DATA,
        
        // 更多有效数据
        dataGenerator.generateMarketData(BASIC_TRADE_DATA),
        dataGenerator.generateMarketData(BASIC_TRADE_DATA)
      ] as any[];

      console.log(`📊 发送混合数据 - 有效: 4, 无效: 5`);

      for (const data of mixedData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(2000);

      const stats = dataFlowManager.getStats();
      const validOutputs = validationChannel.getOutputHistory().length;

      console.log('📊 数据格式错误处理结果:');
      console.log(`  - 输入数据总量: ${mixedData.length}`);
      console.log(`  - 处理错误次数: ${processingErrors}`);
      console.log(`  - 有效输出数量: ${validOutputs}`);
      console.log(`  - 统计处理总数: ${stats.totalProcessed}`);
      console.log(`  - 统计错误总数: ${stats.totalErrors}`);

      // 验证错误数据过滤
      expect(processingErrors).toBe(5); // 应该有5个处理错误
      expect(validOutputs).toBe(4); // 只有4条有效数据被输出
      expect(stats.totalProcessed).toBe(4); // 统计中只计入有效处理
      expect(stats.totalErrors).toBe(5); // 错误统计正确

      console.log('✅ 数据格式错误过滤测试完成');
    });

    it('应该处理数据转换异常', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 注册会抛出异常的转换器
      const faultyTransformer = {
        name: 'faulty-transformer',
        transform: jest.fn().mockImplementation((data) => {
          if (data.symbol === 'ERROR_TRIGGER') {
            throw new Error('Transformer processing error');
          }
          return data;
        }),
        validate: jest.fn().mockReturnValue(true),
        getStats: jest.fn().mockReturnValue({
          transformedCount: 0,
          errorCount: 0,
          averageLatency: 0,
          lastActivity: 0
        })
      };

      dataFlowManager.registerTransformer(faultyTransformer as any);

      const transformChannel = testManager.createMockChannel('transform-test');
      dataFlowManager.registerChannel(transformChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['transform-test']));
      dataFlowManager.start();

      // 发送会触发转换器异常的数据
      const transformTestData = [
        dataGenerator.generateMarketData({ symbol: 'BTCUSDT' }), // 正常数据
        dataGenerator.generateMarketData({ symbol: 'ERROR_TRIGGER' }), // 触发异常
        dataGenerator.generateMarketData({ symbol: 'ETHUSDT' }), // 正常数据
        dataGenerator.generateMarketData({ symbol: 'ERROR_TRIGGER' }), // 再次异常
        dataGenerator.generateMarketData({ symbol: 'ADAUSDT' }) // 正常数据
      ];

      for (const data of transformTestData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(2000);

      const transformResults = {
        totalInputs: transformTestData.length,
        validOutputs: transformChannel.getOutputHistory().length,
        transformerCalls: faultyTransformer.transform.mock.calls.length
      };

      console.log('📊 数据转换异常处理结果:');
      console.log(`  - 输入数据量: ${transformResults.totalInputs}`);
      console.log(`  - 有效输出量: ${transformResults.validOutputs}`);
      console.log(`  - 转换器调用次数: ${transformResults.transformerCalls}`);

      // 验证转换异常处理
      expect(transformResults.transformerCalls).toBe(5); // 转换器被调用5次
      expect(transformResults.validOutputs).toBe(3); // 只有3条数据成功输出（异常的被跳过）

      console.log('✅ 数据转换异常处理测试完成');
    });
  });

  describe('资源耗尽处理测试', () => {
    it('应该处理内存不足情况', async () => {
      performanceMonitor.start('内存不足处理测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        performance: {
          maxQueueSize: 500, // 很小的队列限制
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 300
        }
      });

      const memoryChannel = testManager.createMockChannel('memory-limited', {
        processingDelay: 20 // 稍慢的处理以累积队列
      });

      dataFlowManager.registerChannel(memoryChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['memory-limited']));
      dataFlowManager.start();

      let backpressureEvents = 0;
      let droppedData = 0;

      dataFlowManager.on('backpressureActivated', (queueSize) => {
        backpressureEvents++;
        console.log(`⚠️  内存压力 - 队列大小: ${queueSize}`);
      });

      // 快速发送大量数据模拟内存压力
      const memoryStressData = generateStressTestData(2000, 1); // 2000条/秒

      console.log(`📊 开始内存压力测试 - ${memoryStressData.length}条数据`);

      for (const data of memoryStressData) {
        try {
          await dataFlowManager.processData(data);
        } catch (error) {
          droppedData++;
          // 在内存不足时可能抛出异常，这是预期的
        }
      }

      await testManager.waitForProcessing(10000);

      const performanceReport = performanceMonitor.stop();
      const finalStats = dataFlowManager.getStats();
      const processedData = memoryChannel.getOutputHistory().length;

      console.log('📊 内存不足处理结果:');
      console.log(`  - 输入数据量: ${memoryStressData.length}`);
      console.log(`  - 成功处理量: ${processedData}`);
      console.log(`  - 丢弃数据量: ${droppedData}`);
      console.log(`  - 背压激活次数: ${backpressureEvents}`);
      console.log(`  - 最终队列大小: ${finalStats.currentQueueSize}`);
      console.log(`  - 内存峰值: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      // 验证内存不足处理
      expect(backpressureEvents).toBeGreaterThan(0); // 应该激活背压
      expect(processedData).toBeGreaterThan(0); // 应该有数据被处理
      expect(processedData).toBeLessThan(memoryStressData.length); // 但不是全部
      expect(finalStats.currentQueueSize).toBeLessThan(100); // 最终队列应该清理

      console.log('✅ 内存不足处理测试完成');
    }, 25000);

    it('应该在CPU过载时进行流量控制', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        batching: {
          enabled: true,
          batchSize: 10,
          flushTimeout: 100
        },
        performance: {
          maxQueueSize: 2000,
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 1500
        }
      });

      // 创建CPU密集型处理的通道
      const cpuIntensiveChannel = testManager.createMockChannel('cpu-intensive', {
        processingDelay: 50 // 模拟CPU密集型处理
      });

      const lightChannel = testManager.createMockChannel('light-processing', {
        processingDelay: 1
      });

      [cpuIntensiveChannel, lightChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // CPU密集型数据路由到慢通道，其他路由到快通道
      const cpuRule = testManager.createRoutingRule(
        'cpu-intensive-rule',
        (data) => data.type === 'depth', // 深度数据需要CPU密集处理
        ['cpu-intensive'],
        { priority: 100 }
      );

      const lightRule = testManager.createRoutingRule(
        'light-rule',
        (data) => data.type !== 'depth',
        ['light-processing'],
        { priority: 50 }
      );

      dataFlowManager.addRoutingRule(cpuRule);
      dataFlowManager.addRoutingRule(lightRule);
      dataFlowManager.start();

      let throttlingActivated = false;
      dataFlowManager.on('backpressureActivated', () => {
        throttlingActivated = true;
        console.log('⚠️  CPU过载流量控制激活');
      });

      // 发送混合负载数据
      const cpuData = Array.from({ length: 100 }, () => 
        dataGenerator.generateMarketData({ type: 'depth' })
      );
      const lightData = Array.from({ length: 100 }, () =>
        dataGenerator.generateMarketData({ type: 'trade' })
      );

      const mixedLoad = [...cpuData, ...lightData].sort(() => Math.random() - 0.5);

      console.log(`📊 CPU过载测试 - CPU密集: ${cpuData.length}, 轻量: ${lightData.length}`);

      const startTime = Date.now();
      
      for (const data of mixedLoad) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(15000);
      
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;

      const cpuResults = {
        cpuIntensiveProcessed: cpuIntensiveChannel.getOutputHistory().length,
        lightProcessed: lightChannel.getOutputHistory().length,
        throttlingActivated,
        processingTime
      };

      console.log('📊 CPU过载流量控制结果:');
      console.log(`  - CPU密集处理量: ${cpuResults.cpuIntensiveProcessed}`);
      console.log(`  - 轻量处理量: ${cpuResults.lightProcessed}`);
      console.log(`  - 流量控制激活: ${cpuResults.throttlingActivated ? '是' : '否'}`);
      console.log(`  - 总处理时间: ${cpuResults.processingTime.toFixed(2)}s`);

      // 验证CPU过载控制
      expect(cpuResults.lightProcessed).toBe(100); // 轻量数据应该全部处理
      // CPU密集型数据可能因为背压而部分处理
      expect(cpuResults.cpuIntensiveProcessed).toBeGreaterThan(0);

      console.log('✅ CPU过载流量控制测试完成');
    }, 30000);
  });

  describe('配置错误处理测试', () => {
    it('应该处理无效配置并使用默认值', async () => {
      // 测试使用无效/缺失配置创建DataFlowManager
      const invalidConfig = {
        enabled: true,
        batching: {
          enabled: true,
          batchSize: -10, // 无效的批次大小
          flushTimeout: -100 // 无效的超时
        },
        performance: {
          maxQueueSize: 0, // 无效的队列大小
          processingTimeout: -1000, // 无效的超时
          enableBackpressure: true,
          backpressureThreshold: -500 // 无效的阈值
        },
        monitoring: {
          enableMetrics: true,
          metricsInterval: 0, // 无效的间隔
          enableLatencyTracking: true
        },
        errorHandling: {
          retryCount: -1, // 无效的重试次数
          retryDelay: -100, // 无效的延迟
          enableCircuitBreaker: true,
          circuitBreakerThreshold: -10 // 无效的阈值
        }
      };

      let dataFlowManager;
      
      try {
        dataFlowManager = await testManager.createDataFlowManager(invalidConfig as any);
        
        // 如果成功创建，验证是否使用了合理的默认值
        const testChannel = testManager.createMockChannel('config-test');
        dataFlowManager.registerChannel(testChannel);
        dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['config-test']));
        dataFlowManager.start();

        // 发送一些数据测试是否正常工作
        const configTestData = generateHighFrequencyTrades(20, 'BTCUSDT', 50000);
        
        for (const data of configTestData) {
          await dataFlowManager.processData(data);
        }

        await testManager.waitForProcessing(2000);

        const configResults = {
          processed: testChannel.getOutputHistory().length,
          stats: dataFlowManager.getStats()
        };

        console.log('📊 配置错误处理结果:');
        console.log(`  - 处理数据量: ${configResults.processed}`);
        console.log(`  - 系统是否正常: ${configResults.processed > 0 ? '是' : '否'}`);

        // 验证即使配置无效，系统仍能工作（使用默认值）
        expect(configResults.processed).toBeGreaterThan(0);

        console.log('✅ 无效配置fallback测试完成');
        
      } catch (error) {
        // 如果创建失败，验证错误处理是否合理
        console.log(`配置验证错误: ${error.message}`);
        expect(error.message).toContain('Invalid'); // 应该包含验证错误信息
        
        console.log('✅ 配置验证错误测试完成');
      }
    });

    it('应该处理缺失依赖的情况', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 尝试注册指向不存在通道的路由规则
      const invalidRule = testManager.createRoutingRule(
        'invalid-dependency',
        () => true,
        ['non-existent-channel-1', 'non-existent-channel-2'],
        { priority: 100 }
      );

      // 这应该不会抛出异常
      dataFlowManager.addRoutingRule(invalidRule);
      dataFlowManager.start();

      // 发送数据测试系统稳定性
      const dependencyTestData = generateHighFrequencyTrades(10, 'BTCUSDT', 50000);
      
      for (const data of dependencyTestData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(1000);

      const stats = dataFlowManager.getStats();

      console.log('📊 缺失依赖处理结果:');
      console.log(`  - 路由规则数: ${stats.routingRules}`);
      console.log(`  - 活跃通道数: ${stats.activeChannels}`);
      console.log(`  - 处理数据量: ${stats.totalProcessed}`);

      // 验证系统在缺失依赖时的稳定性
      expect(stats.routingRules).toBe(1); // 规则应该被注册
      expect(stats.activeChannels).toBe(0); // 但没有可用通道
      // 数据不会被处理，但系统不应该崩溃
      expect(stats.totalProcessed).toBe(0);

      console.log('✅ 缺失依赖处理测试完成');
    });
  });
});