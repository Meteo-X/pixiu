/**
 * 消息路由综合测试套件
 * 验证MessageRouter的各种路由规则、多路由目标、条件路由和动态路由功能
 */

import { DataFlowTestManager, TestDataGenerator, MockOutputChannel } from '@helpers/dataflow-test-utils';
import { TestPerformanceMonitor, PerformanceBenchmark } from '@helpers/test-performance-monitor';
import { ROUTING_TEST_DATA, MULTI_EXCHANGE_DATA, generateHighFrequencyTrades } from '@fixtures/test-data-sets';
import { testUtils } from '../../setup';

describe('消息路由综合测试', () => {
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

  describe('基础路由规则测试', () => {
    it('应该正确执行基于交易所的路由规则', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建不同交易所的专用通道
      const binanceChannel = testManager.createMockChannel('binance-channel');
      const coinbaseChannel = testManager.createMockChannel('coinbase-channel'); 
      const krakenChannel = testManager.createMockChannel('kraken-channel');

      [binanceChannel, coinbaseChannel, krakenChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 创建交易所路由规则
      const binanceRule = testManager.createExchangeRule('binance', ['binance-channel']);
      const coinbaseRule = testManager.createExchangeRule('coinbase', ['coinbase-channel']);
      const krakenRule = testManager.createExchangeRule('kraken', ['kraken-channel']);

      [binanceRule, coinbaseRule, krakenRule].forEach(rule => {
        dataFlowManager.addRoutingRule(rule);
      });

      dataFlowManager.start();

      // 发送多交易所数据
      for (const data of MULTI_EXCHANGE_DATA) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(2000);

      // 验证路由结果
      expect(binanceChannel.getOutputHistory()).toHaveLength(1);
      expect(coinbaseChannel.getOutputHistory()).toHaveLength(1);
      expect(krakenChannel.getOutputHistory()).toHaveLength(1);

      // 验证路由到的数据交易所正确
      expect(binanceChannel.getOutputHistory()[0].data.exchange).toBe('binance');
      expect(coinbaseChannel.getOutputHistory()[0].data.exchange).toBe('coinbase');
      expect(krakenChannel.getOutputHistory()[0].data.exchange).toBe('kraken');

      console.log('✅ 交易所路由规则测试完成');
    });

    it('应该正确执行基于数据类型的路由规则', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建数据类型专用通道
      const tradeChannel = testManager.createMockChannel('trade-channel');
      const tickerChannel = testManager.createMockChannel('ticker-channel');
      const depthChannel = testManager.createMockChannel('depth-channel');
      const klineChannel = testManager.createMockChannel('kline-channel');

      [tradeChannel, tickerChannel, depthChannel, klineChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 创建类型路由规则
      const tradeRule = testManager.createTypeRule('trade', ['trade-channel']);
      const tickerRule = testManager.createTypeRule('ticker', ['ticker-channel']);
      const depthRule = testManager.createTypeRule('depth', ['depth-channel']);
      const klineRule = testManager.createTypeRule('kline_1m', ['kline-channel']);

      [tradeRule, tickerRule, depthRule, klineRule].forEach(rule => {
        dataFlowManager.addRoutingRule(rule);
      });

      dataFlowManager.start();

      // 发送不同类型的数据
      for (const data of ROUTING_TEST_DATA.TYPE_ROUTING) {
        await dataFlowManager.processData(data);
      }

      // 添加K线数据测试
      const klineData = dataGenerator.generateMarketData({ type: 'kline_1m' });
      await dataFlowManager.processData(klineData);

      await testManager.waitForProcessing(3000);

      // 验证每个通道收到正确类型的数据
      expect(tradeChannel.getOutputHistory()).toHaveLength(1);
      expect(tradeChannel.getOutputHistory()[0].data.type).toBe('trade');

      expect(tickerChannel.getOutputHistory()).toHaveLength(1);
      expect(tickerChannel.getOutputHistory()[0].data.type).toBe('ticker');

      expect(depthChannel.getOutputHistory()).toHaveLength(1);
      expect(depthChannel.getOutputHistory()[0].data.type).toBe('depth');

      expect(klineChannel.getOutputHistory()).toHaveLength(1);
      expect(klineChannel.getOutputHistory()[0].data.type).toBe('kline_1m');

      console.log('✅ 数据类型路由规则测试完成');
    });

    it('应该正确执行基于交易对的路由规则', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建交易对专用通道
      const btcChannel = testManager.createMockChannel('btc-channel');
      const ethChannel = testManager.createMockChannel('eth-channel');
      const adaChannel = testManager.createMockChannel('ada-channel');

      [btcChannel, ethChannel, adaChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 创建交易对路由规则
      const btcRule = testManager.createRoutingRule(
        'btc-pairs',
        (data) => data.symbol.includes('BTC'),
        ['btc-channel'],
        { priority: 10 }
      );

      const ethRule = testManager.createRoutingRule(
        'eth-pairs', 
        (data) => data.symbol.includes('ETH'),
        ['eth-channel'],
        { priority: 10 }
      );

      const adaRule = testManager.createRoutingRule(
        'ada-pairs',
        (data) => data.symbol.includes('ADA'),
        ['ada-channel'],
        { priority: 10 }
      );

      [btcRule, ethRule, adaRule].forEach(rule => {
        dataFlowManager.addRoutingRule(rule);
      });

      dataFlowManager.start();

      // 发送不同交易对的数据
      const symbolTestData = [
        dataGenerator.generateMarketData({ symbol: 'BTCUSDT' }),
        dataGenerator.generateMarketData({ symbol: 'ETHUSDT' }),
        dataGenerator.generateMarketData({ symbol: 'ADAUSDT' }),
        dataGenerator.generateMarketData({ symbol: 'BTCETH' }), // 应该路由到BTC通道
      ];

      for (const data of symbolTestData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(2000);

      // 验证路由结果
      expect(btcChannel.getOutputHistory()).toHaveLength(2); // BTCUSDT 和 BTCETH
      expect(ethChannel.getOutputHistory()).toHaveLength(1); // ETHUSDT
      expect(adaChannel.getOutputHistory()).toHaveLength(1); // ADAUSDT

      // 验证路由的交易对正确
      const btcOutputs = btcChannel.getOutputHistory();
      expect(btcOutputs.some(output => output.data.symbol === 'BTCUSDT')).toBe(true);
      expect(btcOutputs.some(output => output.data.symbol === 'BTCETH')).toBe(true);

      console.log('✅ 交易对路由规则测试完成');
    });
  });

  describe('复合路由规则测试', () => {
    it('应该正确执行多条件复合路由规则', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建复合条件通道
      const premiumChannel = testManager.createMockChannel('premium-channel');
      const standardChannel = testManager.createMockChannel('standard-channel');
      const basicChannel = testManager.createMockChannel('basic-channel');

      [premiumChannel, standardChannel, basicChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 创建复合路由规则
      // Premium: Binance + BTC + Trade
      const premiumRule = testManager.createRoutingRule(
        'premium-routing',
        (data) => data.exchange === 'binance' && 
                  data.symbol.includes('BTC') && 
                  data.type === 'trade',
        ['premium-channel'],
        { priority: 100 }
      );

      // Standard: Binance + Any symbol + Any type
      const standardRule = testManager.createRoutingRule(
        'standard-routing',
        (data) => data.exchange === 'binance',
        ['standard-channel'],
        { priority: 50 }
      );

      // Basic: Everything else
      const basicRule = testManager.createCatchAllRule(['basic-channel']);
      basicRule.priority = 1;

      [premiumRule, standardRule, basicRule].forEach(rule => {
        dataFlowManager.addRoutingRule(rule);
      });

      dataFlowManager.start();

      // 发送测试数据
      const testData = [
        // 应该路由到premium
        dataGenerator.generateMarketData({
          exchange: 'binance', 
          symbol: 'BTCUSDT', 
          type: 'trade'
        }),
        // 应该路由到standard（不匹配premium的type条件）
        dataGenerator.generateMarketData({
          exchange: 'binance',
          symbol: 'ETHUSDT',
          type: 'ticker'
        }),
        // 应该路由到basic（不匹配任何高优先级规则）
        dataGenerator.generateMarketData({
          exchange: 'coinbase',
          symbol: 'BTCUSD',
          type: 'trade'
        })
      ];

      for (const data of testData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(2000);

      // 验证复合路由结果
      expect(premiumChannel.getOutputHistory()).toHaveLength(1);
      expect(standardChannel.getOutputHistory()).toHaveLength(2); // premium也会路由到standard (多规则匹配)
      expect(basicChannel.getOutputHistory()).toHaveLength(3); // 所有数据都会路由到basic (catch-all)

      // 验证premium通道收到的是正确的数据
      const premiumData = premiumChannel.getOutputHistory()[0].data;
      expect(premiumData.exchange).toBe('binance');
      expect(premiumData.symbol).toContain('BTC');
      expect(premiumData.type).toBe('trade');

      console.log('✅ 复合路由规则测试完成');
    });

    it('应该按优先级正确执行路由规则', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      const highPriorityChannel = testManager.createMockChannel('high-priority');
      const mediumPriorityChannel = testManager.createMockChannel('medium-priority'); 
      const lowPriorityChannel = testManager.createMockChannel('low-priority');

      [highPriorityChannel, mediumPriorityChannel, lowPriorityChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 创建不同优先级的规则（都匹配同样的数据）
      const highPriorityRule = testManager.createRoutingRule(
        'high-priority-rule',
        (data) => data.symbol === 'BTCUSDT',
        ['high-priority'],
        { priority: 100 }
      );

      const mediumPriorityRule = testManager.createRoutingRule(
        'medium-priority-rule', 
        (data) => data.symbol === 'BTCUSDT',
        ['medium-priority'],
        { priority: 50 }
      );

      const lowPriorityRule = testManager.createRoutingRule(
        'low-priority-rule',
        (data) => data.symbol === 'BTCUSDT',
        ['low-priority'],
        { priority: 10 }
      );

      // 故意乱序添加规则测试排序
      dataFlowManager.addRoutingRule(lowPriorityRule);
      dataFlowManager.addRoutingRule(highPriorityRule);
      dataFlowManager.addRoutingRule(mediumPriorityRule);

      dataFlowManager.start();

      // 发送匹配所有规则的数据
      const testData = dataGenerator.generateMarketData({ symbol: 'BTCUSDT' });
      await dataFlowManager.processData(testData);

      await testManager.waitForProcessing(1000);

      // 所有优先级的规则都应该被执行（因为都匹配）
      expect(highPriorityChannel.getOutputHistory()).toHaveLength(1);
      expect(mediumPriorityChannel.getOutputHistory()).toHaveLength(1);
      expect(lowPriorityChannel.getOutputHistory()).toHaveLength(1);

      console.log('✅ 路由规则优先级测试完成');
    });
  });

  describe('动态路由管理测试', () => {
    it('应该支持运行时添加和删除路由规则', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      const dynamicChannel = testManager.createMockChannel('dynamic-channel');
      const staticChannel = testManager.createMockChannel('static-channel');

      [dynamicChannel, staticChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 初始只有静态规则
      const staticRule = testManager.createRoutingRule(
        'static-rule',
        (data) => data.type === 'trade',
        ['static-channel']
      );

      dataFlowManager.addRoutingRule(staticRule);
      dataFlowManager.start();

      // 发送数据 - 应该只路由到静态通道
      let testData = dataGenerator.generateMarketData({ type: 'trade', symbol: 'BTCUSDT' });
      await dataFlowManager.processData(testData);
      await testManager.waitForProcessing(1000);

      expect(staticChannel.getOutputHistory()).toHaveLength(1);
      expect(dynamicChannel.getOutputHistory()).toHaveLength(0);

      // 动态添加新规则
      const dynamicRule = testManager.createRoutingRule(
        'dynamic-rule',
        (data) => data.symbol === 'BTCUSDT',
        ['dynamic-channel'],
        { priority: 200 }
      );

      dataFlowManager.addRoutingRule(dynamicRule);

      // 发送数据 - 现在应该路由到两个通道
      testData = dataGenerator.generateMarketData({ type: 'trade', symbol: 'BTCUSDT' });
      await dataFlowManager.processData(testData);
      await testManager.waitForProcessing(1000);

      expect(staticChannel.getOutputHistory()).toHaveLength(2);
      expect(dynamicChannel.getOutputHistory()).toHaveLength(1);

      // 动态删除规则
      dataFlowManager.removeRoutingRule('dynamic-rule');

      // 发送数据 - 应该又只路由到静态通道
      testData = dataGenerator.generateMarketData({ type: 'trade', symbol: 'BTCUSDT' });
      await dataFlowManager.processData(testData);
      await testManager.waitForProcessing(1000);

      expect(staticChannel.getOutputHistory()).toHaveLength(3);
      expect(dynamicChannel.getOutputHistory()).toHaveLength(1); // 没有增加

      console.log('✅ 动态路由管理测试完成');
    });

    it('应该支持运行时修改通道状态', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      const enabledChannel = testManager.createMockChannel('enabled-channel', {
        enabled: true
      });
      const disabledChannel = testManager.createMockChannel('disabled-channel', {
        enabled: false
      });

      [enabledChannel, disabledChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      const testRule = testManager.createCatchAllRule(['enabled-channel', 'disabled-channel']);
      dataFlowManager.addRoutingRule(testRule);
      dataFlowManager.start();

      // 发送数据 - 只有启用的通道应该接收
      let testData = dataGenerator.generateMarketData();
      await dataFlowManager.processData(testData);
      await testManager.waitForProcessing(1000);

      expect(enabledChannel.getOutputHistory()).toHaveLength(1);
      expect(disabledChannel.getOutputHistory()).toHaveLength(0);

      // 启用禁用的通道
      disabledChannel.enabled = true;

      // 发送数据 - 现在两个通道都应该接收
      testData = dataGenerator.generateMarketData();
      await dataFlowManager.processData(testData);
      await testManager.waitForProcessing(1000);

      expect(enabledChannel.getOutputHistory()).toHaveLength(2);
      expect(disabledChannel.getOutputHistory()).toHaveLength(1);

      // 禁用第一个通道
      enabledChannel.enabled = false;

      // 发送数据 - 现在只有原来禁用的通道接收
      testData = dataGenerator.generateMarketData();
      await dataFlowManager.processData(testData);
      await testManager.waitForProcessing(1000);

      expect(enabledChannel.getOutputHistory()).toHaveLength(2); // 没有增加
      expect(disabledChannel.getOutputHistory()).toHaveLength(2);

      console.log('✅ 动态通道状态测试完成');
    });
  });

  describe('路由性能测试', () => {
    it('应该在高频消息下保持低路由延迟', async () => {
      performanceMonitor.start('路由性能测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        monitoring: {
          enableMetrics: true,
          metricsInterval: 100,
          enableLatencyTracking: true
        }
      });

      // 创建多个目标通道
      const routingChannels = [];
      for (let i = 0; i < 10; i++) {
        const channel = testManager.createMockChannel(`routing-channel-${i}`, {
          processingDelay: 0
        });
        routingChannels.push(channel);
        dataFlowManager.registerChannel(channel);
      }

      // 创建复杂路由规则矩阵
      const exchanges = ['binance', 'coinbase', 'kraken'];
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      const types = ['trade', 'ticker'];

      let ruleIndex = 0;
      for (const exchange of exchanges) {
        for (const symbol of symbols) {
          for (const type of types) {
            const targetChannels = routingChannels
              .slice(ruleIndex % 3, (ruleIndex % 3) + 3)
              .map(c => c.id);

            const rule = testManager.createRoutingRule(
              `complex-rule-${ruleIndex}`,
              (data) => data.exchange === exchange && 
                        data.symbol === symbol && 
                        data.type === type,
              targetChannels,
              { priority: 100 - ruleIndex }
            );

            dataFlowManager.addRoutingRule(rule);
            ruleIndex++;
          }
        }
      }

      dataFlowManager.start();

      // 生成高频测试数据
      const highFreqMessages = generateHighFrequencyTrades(1000, 'BTCUSDT', 50000)
        .map(data => ({
          ...data,
          exchange: exchanges[Math.floor(Math.random() * exchanges.length)],
          symbol: symbols[Math.floor(Math.random() * symbols.length)],
          type: types[Math.floor(Math.random() * types.length)]
        }));

      // 批量发送并测量路由延迟
      const routingLatencies = await benchmark.measureBatch(
        highFreqMessages.map((data, index) => ({
          name: `route-message-${index}`,
          fn: () => dataFlowManager.processData(data),
          metadata: { exchange: data.exchange, symbol: data.symbol, type: data.type }
        }))
      );

      await testManager.waitForProcessing(5000);

      const routingStats = benchmark.getStatistics();
      const performanceReport = performanceMonitor.stop();

      // 验证路由性能
      expect(routingStats?.average).toBeLessThan(10); // 平均路由延迟 < 10ms
      expect(routingStats?.p95).toBeLessThan(20); // P95路由延迟 < 20ms

      // 验证消息都被正确路由
      const totalOutputs = routingChannels.reduce(
        (total, channel) => total + channel.getOutputHistory().length, 
        0
      );
      expect(totalOutputs).toBeGreaterThan(highFreqMessages.length); // 多路由会产生更多输出

      console.log('📊 路由性能测试结果:');
      console.log(`  - 消息数量: ${highFreqMessages.length}`);
      console.log(`  - 规则数量: ${ruleIndex}`);
      console.log(`  - 平均路由延迟: ${routingStats?.average.toFixed(2)}ms`);
      console.log(`  - P95路由延迟: ${routingStats?.p95.toFixed(2)}ms`);
      console.log(`  - 总输出数量: ${totalOutputs}`);
      console.log(`  - 内存使用: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      console.log('✅ 路由性能测试完成');
    }, 30000);

    it('应该支持大量路由规则而不影响性能', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      // 创建大量通道
      const massChannels = [];
      for (let i = 0; i < 100; i++) {
        const channel = testManager.createMockChannel(`mass-channel-${i}`, {
          processingDelay: 0
        });
        massChannels.push(channel);
        dataFlowManager.registerChannel(channel);
      }

      // 创建大量路由规则（1000个规则）
      const ruleCount = 1000;
      const symbols = Array.from({ length: 100 }, (_, i) => `SYMBOL${i}`);
      
      for (let i = 0; i < ruleCount; i++) {
        const targetChannel = massChannels[i % massChannels.length];
        const symbol = symbols[i % symbols.length];
        
        const rule = testManager.createRoutingRule(
          `mass-rule-${i}`,
          (data) => data.symbol === symbol,
          [targetChannel.id],
          { priority: ruleCount - i }
        );
        
        dataFlowManager.addRoutingRule(rule);
      }

      dataFlowManager.start();

      // 测试路由查找性能
      const routingTestData = Array.from({ length: 100 }, (_, i) => 
        dataGenerator.generateMarketData({
          symbol: symbols[Math.floor(Math.random() * symbols.length)]
        })
      );

      const startTime = Date.now();
      
      for (const data of routingTestData) {
        await dataFlowManager.processData(data);
      }
      
      await testManager.waitForProcessing(5000);
      
      const endTime = Date.now();
      const totalLatency = endTime - startTime;
      const avgLatencyPerMessage = totalLatency / routingTestData.length;

      // 验证大规模路由性能
      expect(avgLatencyPerMessage).toBeLessThan(50); // 即使有1000个规则，平均延迟仍要 < 50ms

      // 验证路由正确性
      const totalOutputs = massChannels.reduce(
        (total, channel) => total + channel.getOutputHistory().length,
        0
      );
      expect(totalOutputs).toBe(routingTestData.length); // 确保所有消息都被路由

      console.log('📊 大规模路由测试结果:');
      console.log(`  - 规则数量: ${ruleCount}`);
      console.log(`  - 通道数量: ${massChannels.length}`);
      console.log(`  - 消息数量: ${routingTestData.length}`);
      console.log(`  - 总延迟: ${totalLatency}ms`);
      console.log(`  - 平均延迟: ${avgLatencyPerMessage.toFixed(2)}ms/消息`);
      console.log(`  - 路由输出: ${totalOutputs}`);

      console.log('✅ 大规模路由测试完成');
    }, 20000);
  });

  describe('错误和边界情况测试', () => {
    it('应该正确处理路由规则条件异常', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      const safeChannel = testManager.createMockChannel('safe-channel');
      const errorChannel = testManager.createMockChannel('error-channel');

      [safeChannel, errorChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      // 创建会抛出异常的路由规则
      const faultyRule = testManager.createRoutingRule(
        'faulty-rule',
        (data) => {
          if (data.symbol === 'ERROR_TRIGGER') {
            throw new Error('路由条件异常');
          }
          return true;
        },
        ['error-channel'],
        { priority: 100 }
      );

      // 创建安全的兜底规则
      const safeRule = testManager.createCatchAllRule(['safe-channel']);
      safeRule.priority = 1;

      dataFlowManager.addRoutingRule(faultyRule);
      dataFlowManager.addRoutingRule(safeRule);
      dataFlowManager.start();

      // 监听路由错误
      let routingErrors = 0;
      dataFlowManager.on('routingError', (error, data) => {
        routingErrors++;
        expect(error.message).toContain('路由条件异常');
        expect(data.symbol).toBe('ERROR_TRIGGER');
      });

      // 发送会触发异常的数据
      const errorData = dataGenerator.generateMarketData({ symbol: 'ERROR_TRIGGER' });
      await dataFlowManager.processData(errorData);

      // 发送正常数据
      const normalData = dataGenerator.generateMarketData({ symbol: 'BTCUSDT' });
      await dataFlowManager.processData(normalData);

      await testManager.waitForProcessing(2000);

      // 验证异常处理
      expect(routingErrors).toBe(1);
      expect(errorChannel.getOutputHistory()).toHaveLength(0); // 异常规则不应该输出
      expect(safeChannel.getOutputHistory()).toHaveLength(2); // 兜底规则应该处理所有数据

      console.log('✅ 路由规则异常处理测试完成');
    });

    it('应该处理目标通道不存在的情况', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      const existingChannel = testManager.createMockChannel('existing-channel');
      dataFlowManager.registerChannel(existingChannel);

      // 创建指向不存在通道的路由规则
      const invalidRule = testManager.createRoutingRule(
        'invalid-rule',
        () => true,
        ['non-existent-channel', 'existing-channel'], // 一个存在，一个不存在
        { priority: 100 }
      );

      dataFlowManager.addRoutingRule(invalidRule);
      dataFlowManager.start();

      // 发送数据
      const testData = dataGenerator.generateMarketData();
      await dataFlowManager.processData(testData);

      await testManager.waitForProcessing(1000);

      // 验证已存在的通道仍然工作
      expect(existingChannel.getOutputHistory()).toHaveLength(1);

      console.log('✅ 不存在通道处理测试完成');
    });

    it('应该处理空路由规则列表', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();

      const orphanChannel = testManager.createMockChannel('orphan-channel');
      dataFlowManager.registerChannel(orphanChannel);
      dataFlowManager.start();

      // 没有添加任何路由规则
      const testData = dataGenerator.generateMarketData();
      await dataFlowManager.processData(testData);

      await testManager.waitForProcessing(1000);

      // 验证没有路由规则时，数据不会被路由到任何通道
      expect(orphanChannel.getOutputHistory()).toHaveLength(0);

      console.log('✅ 空路由规则处理测试完成');
    });
  });
});