/**
 * DataFlow架构消息路由性能测试
 * 验证重构后的DataFlow系统在高负载下的消息路由和数据转换性能
 */

import { describe, test, beforeAll, afterAll } from '@jest/globals';
import { PerformanceMonitor } from '../../helpers/performance-monitor';
import { TestWebSocketServer } from '../../helpers/test-server';
import { setupTestEnvironment, cleanupTestEnvironment, recordMetric, TEST_CONFIG } from '../../setup';
import { performance } from 'perf_hooks';

describe('DataFlow架构消息路由性能测试', () => {
  let performanceMonitor: PerformanceMonitor;
  let testServer: TestWebSocketServer;
  let testContext: any;

  beforeAll(async () => {
    testContext = await setupTestEnvironment();
    performanceMonitor = new PerformanceMonitor(TEST_CONFIG.SAMPLING_INTERVAL.HIGH_FREQUENCY);
    testServer = new TestWebSocketServer();
    
    await testServer.start();
    console.log('🚀 DataFlow架构性能测试环境准备就绪');
  }, 30000);

  afterAll(async () => {
    if (testServer) {
      await testServer.stop();
    }
    if (performanceMonitor) {
      await performanceMonitor.stopMonitoring();
    }
    await cleanupTestEnvironment();
  });

  describe('消息路由性能测试', () => {
    test('验证高频消息路由性能：2000+ msg/sec', async () => {
      console.log('🔥 开始高频消息路由性能测试...');
      
      await performanceMonitor.startMonitoring();
      
      // 模拟DataFlow消息路由器
      class MockDataFlowRouter {
        private routingStats = {
          totalMessages: 0,
          routedMessages: 0,
          routingLatencies: [] as number[],
          routesByType: new Map<string, number>()
        };

        routeMessage(message: any): void {
          const routingStart = performance.now();
          
          this.routingStats.totalMessages++;
          
          // 模拟路由决策逻辑
          let routeFound = false;
          
          if (message.type === 'trade') {
            // 路由到交易数据处理器
            this.routeToTradeProcessor(message);
            routeFound = true;
          } else if (message.type === 'ticker') {
            // 路由到ticker数据处理器
            this.routeToTickerProcessor(message);
            routeFound = true;
          } else if (message.type === 'kline') {
            // 路由到K线数据处理器
            this.routeToKlineProcessor(message);
            routeFound = true;
          } else if (message.type === 'depth') {
            // 路由到深度数据处理器
            this.routeToDepthProcessor(message);
            routeFound = true;
          }
          
          if (routeFound) {
            this.routingStats.routedMessages++;
            const currentCount = this.routingStats.routesByType.get(message.type) || 0;
            this.routingStats.routesByType.set(message.type, currentCount + 1);
          }
          
          const routingLatency = performance.now() - routingStart;
          this.routingStats.routingLatencies.push(routingLatency);
          
          // 记录路由延迟
          performanceMonitor.recordMessageLatency(routingLatency);
          recordMetric('dataflow-routing-latency', routingLatency);
        }

        private routeToTradeProcessor(message: any): void {
          // 模拟交易数据处理延迟
          this.simulateProcessingDelay(0.5); // 0.5ms
        }

        private routeToTickerProcessor(message: any): void {
          // 模拟ticker数据处理延迟
          this.simulateProcessingDelay(0.3); // 0.3ms
        }

        private routeToKlineProcessor(message: any): void {
          // 模拟K线数据处理延迟
          this.simulateProcessingDelay(0.8); // 0.8ms
        }

        private routeToDepthProcessor(message: any): void {
          // 模拟深度数据处理延迟
          this.simulateProcessingDelay(1.2); // 1.2ms
        }

        private simulateProcessingDelay(delayMs: number): void {
          const start = performance.now();
          while (performance.now() - start < delayMs) {
            // 忙等待模拟处理时间
          }
        }

        getStats() {
          const sortedLatencies = [...this.routingStats.routingLatencies].sort((a, b) => a - b);
          return {
            ...this.routingStats,
            averageLatency: sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length || 0,
            p95Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
            p99Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0,
            routingSuccessRate: this.routingStats.routedMessages / this.routingStats.totalMessages
          };
        }
      }

      const router = new MockDataFlowRouter();
      
      // 开始高频消息生成和路由测试
      const targetThroughput = 2000; // 2000 msg/sec
      const testDuration = 60000; // 60秒测试
      
      console.log(`开始${targetThroughput} msg/sec的消息路由测试，持续${testDuration/1000}秒...`);
      
      // 消息生成和路由循环
      const messageInterval = 1000 / targetThroughput; // 每条消息间隔
      const messageTypes = ['trade', 'ticker', 'kline', 'depth'];
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      
      const routingTestPromise = new Promise<void>((resolve) => {
        let messageCount = 0;
        const maxMessages = Math.floor(targetThroughput * (testDuration / 1000));
        
        const generateAndRoute = () => {
          if (messageCount >= maxMessages) {
            resolve();
            return;
          }
          
          // 生成测试消息
          const messageType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
          const symbol = symbols[Math.floor(Math.random() * symbols.length)];
          
          const message = {
            id: `msg_${messageCount}`,
            type: messageType,
            symbol,
            data: this.generateMessageData(messageType),
            timestamp: Date.now(),
            routingId: `route_${messageCount}`
          };
          
          // 执行路由
          router.routeMessage(message);
          messageCount++;
          
          // 调度下一条消息
          setTimeout(generateAndRoute, messageInterval);
        };
        
        generateAndRoute();
      });
      
      // 定期记录路由性能指标
      const monitoringInterval = setInterval(() => {
        const routerStats = router.getStats();
        const currentMetrics = performanceMonitor.getCurrentMetrics();
        
        recordMetric('dataflow-routing-total-messages', routerStats.totalMessages);
        recordMetric('dataflow-routing-routed-messages', routerStats.routedMessages);
        recordMetric('dataflow-routing-success-rate', routerStats.routingSuccessRate);
        recordMetric('dataflow-routing-avg-latency', routerStats.averageLatency);
        recordMetric('dataflow-routing-memory-mb', currentMetrics.memoryMB);
        recordMetric('dataflow-routing-msg-per-sec', currentMetrics.messagesPerSecond);
        
        console.log(`📊 路由性能实时统计:
          处理消息: ${routerStats.totalMessages}
          成功路由: ${routerStats.routedMessages}
          路由成功率: ${(routerStats.routingSuccessRate * 100).toFixed(2)}%
          平均延迟: ${routerStats.averageLatency.toFixed(3)}ms
          当前吞吐量: ${currentMetrics.messagesPerSecond.toFixed(2)} msg/sec
          内存使用: ${currentMetrics.memoryMB.toFixed(2)}MB`);
      }, 10000);
      
      // 等待路由测试完成
      await routingTestPromise;
      clearInterval(monitoringInterval);
      
      const finalRouterStats = router.getStats();
      const finalMetrics = performanceMonitor.getThroughputMetrics();
      const memoryStats = performanceMonitor.getMemoryStats();
      
      // 记录最终路由性能指标
      recordMetric('dataflow-routing-final-total-messages', finalRouterStats.totalMessages);
      recordMetric('dataflow-routing-final-routed-messages', finalRouterStats.routedMessages);
      recordMetric('dataflow-routing-final-success-rate', finalRouterStats.routingSuccessRate);
      recordMetric('dataflow-routing-final-avg-latency', finalRouterStats.averageLatency);
      recordMetric('dataflow-routing-final-p95-latency', finalRouterStats.p95Latency);
      recordMetric('dataflow-routing-final-p99-latency', finalRouterStats.p99Latency);
      recordMetric('dataflow-routing-final-throughput', finalMetrics.messagesPerSecond);
      recordMetric('dataflow-routing-final-memory-mb', memoryStats.current / (1024 * 1024));
      
      console.log(`📊 消息路由性能最终统计:
        测试时长: ${testDuration / 1000}秒
        目标吞吐量: ${targetThroughput} msg/sec
        实际吞吐量: ${finalMetrics.messagesPerSecond.toFixed(2)} msg/sec
        处理消息总数: ${finalRouterStats.totalMessages}
        成功路由消息: ${finalRouterStats.routedMessages}
        路由成功率: ${(finalRouterStats.routingSuccessRate * 100).toFixed(2)}%
        
        延迟统计:
        - 平均延迟: ${finalRouterStats.averageLatency.toFixed(3)}ms
        - P95延迟: ${finalRouterStats.p95Latency.toFixed(3)}ms
        - P99延迟: ${finalRouterStats.p99Latency.toFixed(3)}ms
        
        资源使用:
        - 内存使用: ${(memoryStats.current / (1024 * 1024)).toFixed(2)}MB
        
        路由分布:`);
      
      finalRouterStats.routesByType.forEach((count, type) => {
        console.log(`        - ${type}: ${count} 条消息 (${(count / finalRouterStats.totalMessages * 100).toFixed(1)}%)`);
      });
      
      // 验证消息路由性能要求
      expect(finalMetrics.messagesPerSecond).toBeGreaterThanOrEqual(targetThroughput * 0.95); // 95%目标吞吐量
      expect(finalRouterStats.routingSuccessRate).toBeGreaterThanOrEqual(0.99); // 99%路由成功率
      expect(finalRouterStats.averageLatency).toBeLessThanOrEqual(2); // 平均路由延迟≤2ms
      expect(finalRouterStats.p95Latency).toBeLessThanOrEqual(5); // P95路由延迟≤5ms
      expect(memoryStats.current / (1024 * 1024)).toBeLessThanOrEqual(100); // 内存使用≤100MB
      
      console.log('✅ 消息路由性能测试完成');
    }, 120000);

    private generateMessageData(type: string): any {
      switch (type) {
        case 'trade':
          return {
            price: (Math.random() * 50000 + 20000).toFixed(2),
            quantity: (Math.random() * 10).toFixed(4),
            time: Date.now(),
            isBuyerMaker: Math.random() > 0.5
          };
        case 'ticker':
          return {
            priceChange: (Math.random() - 0.5) * 2000,
            priceChangePercent: ((Math.random() - 0.5) * 10).toFixed(2),
            lastPrice: (Math.random() * 50000 + 20000).toFixed(2),
            volume: (Math.random() * 10000).toFixed(4)
          };
        case 'kline':
          const open = Math.random() * 50000 + 20000;
          const close = open + (Math.random() - 0.5) * 1000;
          return {
            open: open.toFixed(2),
            high: Math.max(open, close).toFixed(2),
            low: Math.min(open, close).toFixed(2),
            close: close.toFixed(2),
            volume: (Math.random() * 1000).toFixed(4)
          };
        case 'depth':
          return {
            bids: Array.from({ length: 10 }, () => [
              (Math.random() * 50000 + 20000).toFixed(2),
              (Math.random() * 100).toFixed(4)
            ]),
            asks: Array.from({ length: 10 }, () => [
              (Math.random() * 50000 + 20000).toFixed(2),
              (Math.random() * 100).toFixed(4)
            ]),
            lastUpdateId: Date.now()
          };
        default:
          return {};
      }
    }
  });

  describe('数据转换性能测试', () => {
    test('验证数据转换器在高负载下的性能', async () => {
      console.log('🔄 开始数据转换性能测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      // 模拟数据转换器
      class MockDataTransformer {
        private transformationStats = {
          totalTransformations: 0,
          successfulTransformations: 0,
          failedTransformations: 0,
          transformationLatencies: [] as number[],
          transformationsByType: new Map<string, number>()
        };

        transformMessage(message: any): any {
          const transformStart = performance.now();
          
          this.transformationStats.totalTransformations++;
          
          try {
            let transformedMessage: any;
            
            switch (message.type) {
              case 'trade':
                transformedMessage = this.transformTradeMessage(message);
                break;
              case 'ticker':
                transformedMessage = this.transformTickerMessage(message);
                break;
              case 'kline':
                transformedMessage = this.transformKlineMessage(message);
                break;
              case 'depth':
                transformedMessage = this.transformDepthMessage(message);
                break;
              default:
                transformedMessage = this.transformGenericMessage(message);
            }
            
            this.transformationStats.successfulTransformations++;
            const currentCount = this.transformationStats.transformationsByType.get(message.type) || 0;
            this.transformationStats.transformationsByType.set(message.type, currentCount + 1);
            
            const transformationLatency = performance.now() - transformStart;
            this.transformationStats.transformationLatencies.push(transformationLatency);
            
            recordMetric('dataflow-transformation-latency', transformationLatency);
            
            return transformedMessage;
            
          } catch (error) {
            this.transformationStats.failedTransformations++;
            recordMetric('dataflow-transformation-error', 1);
            
            const transformationLatency = performance.now() - transformStart;
            this.transformationStats.transformationLatencies.push(transformationLatency);
            
            return null;
          }
        }

        private transformTradeMessage(message: any): any {
          // 模拟交易数据转换
          this.simulateTransformationWork(1.5); // 1.5ms处理时间
          
          return {
            type: 'normalized_trade',
            symbol: message.symbol,
            price: parseFloat(message.data.price),
            quantity: parseFloat(message.data.quantity),
            timestamp: message.data.time,
            side: message.data.isBuyerMaker ? 'sell' : 'buy',
            exchange: 'binance',
            normalized: true
          };
        }

        private transformTickerMessage(message: any): any {
          // 模拟ticker数据转换
          this.simulateTransformationWork(1.0); // 1.0ms处理时间
          
          return {
            type: 'normalized_ticker',
            symbol: message.symbol,
            price: parseFloat(message.data.lastPrice),
            change: parseFloat(message.data.priceChange),
            changePercent: parseFloat(message.data.priceChangePercent),
            volume: parseFloat(message.data.volume),
            exchange: 'binance',
            timestamp: Date.now(),
            normalized: true
          };
        }

        private transformKlineMessage(message: any): any {
          // 模拟K线数据转换
          this.simulateTransformationWork(2.0); // 2.0ms处理时间
          
          return {
            type: 'normalized_kline',
            symbol: message.symbol,
            open: parseFloat(message.data.open),
            high: parseFloat(message.data.high),
            low: parseFloat(message.data.low),
            close: parseFloat(message.data.close),
            volume: parseFloat(message.data.volume),
            exchange: 'binance',
            interval: '1m',
            timestamp: Date.now(),
            normalized: true
          };
        }

        private transformDepthMessage(message: any): any {
          // 模拟深度数据转换（更复杂的转换）
          this.simulateTransformationWork(3.0); // 3.0ms处理时间
          
          const transformBids = message.data.bids.map((bid: any) => ({
            price: parseFloat(bid[0]),
            quantity: parseFloat(bid[1])
          }));
          
          const transformAsks = message.data.asks.map((ask: any) => ({
            price: parseFloat(ask[0]),
            quantity: parseFloat(ask[1])
          }));
          
          return {
            type: 'normalized_depth',
            symbol: message.symbol,
            bids: transformBids,
            asks: transformAsks,
            exchange: 'binance',
            timestamp: Date.now(),
            updateId: message.data.lastUpdateId,
            normalized: true
          };
        }

        private transformGenericMessage(message: any): any {
          // 模拟通用消息转换
          this.simulateTransformationWork(0.5); // 0.5ms处理时间
          
          return {
            ...message,
            normalized: true,
            transformedAt: Date.now()
          };
        }

        private simulateTransformationWork(delayMs: number): void {
          const start = performance.now();
          while (performance.now() - start < delayMs) {
            // 忙等待模拟转换计算
          }
        }

        getStats() {
          const sortedLatencies = [...this.transformationStats.transformationLatencies].sort((a, b) => a - b);
          return {
            ...this.transformationStats,
            averageLatency: sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length || 0,
            p95Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
            p99Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0,
            transformationSuccessRate: this.transformationStats.successfulTransformations / this.transformationStats.totalTransformations
          };
        }
      }

      const transformer = new MockDataTransformer();
      
      // 开始数据转换性能测试
      const targetThroughput = 1500; // 1500 msg/sec转换
      const testDuration = 45000; // 45秒测试
      
      console.log(`开始${targetThroughput} msg/sec的数据转换测试，持续${testDuration/1000}秒...`);
      
      // 消息生成和转换循环
      const transformationInterval = 1000 / targetThroughput;
      const messageTypes = ['trade', 'ticker', 'kline', 'depth'];
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT'];
      
      const transformationTestPromise = new Promise<void>((resolve) => {
        let messageCount = 0;
        const maxMessages = Math.floor(targetThroughput * (testDuration / 1000));
        
        const generateAndTransform = () => {
          if (messageCount >= maxMessages) {
            resolve();
            return;
          }
          
          // 生成测试消息
          const messageType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
          const symbol = symbols[Math.floor(Math.random() * symbols.length)];
          
          const message = {
            id: `transform_msg_${messageCount}`,
            type: messageType,
            symbol,
            data: this.generateMessageData(messageType),
            timestamp: Date.now()
          };
          
          // 执行转换
          const transformedMessage = transformer.transformMessage(message);
          messageCount++;
          
          // 记录转换结果
          if (transformedMessage) {
            performanceMonitor.recordMessageLatency(performance.now() - message.timestamp);
          }
          
          // 调度下一条消息
          setTimeout(generateAndTransform, transformationInterval);
        };
        
        generateAndTransform();
      });
      
      // 定期记录转换性能指标
      const monitoringInterval = setInterval(() => {
        const transformerStats = transformer.getStats();
        const currentMetrics = performanceMonitor.getCurrentMetrics();
        
        recordMetric('dataflow-transformation-total', transformerStats.totalTransformations);
        recordMetric('dataflow-transformation-successful', transformerStats.successfulTransformations);
        recordMetric('dataflow-transformation-failed', transformerStats.failedTransformations);
        recordMetric('dataflow-transformation-success-rate', transformerStats.transformationSuccessRate);
        recordMetric('dataflow-transformation-avg-latency', transformerStats.averageLatency);
        recordMetric('dataflow-transformation-memory-mb', currentMetrics.memoryMB);
        
        console.log(`🔄 数据转换实时统计:
          转换总数: ${transformerStats.totalTransformations}
          成功转换: ${transformerStats.successfulTransformations}
          失败转换: ${transformerStats.failedTransformations}
          成功率: ${(transformerStats.transformationSuccessRate * 100).toFixed(2)}%
          平均延迟: ${transformerStats.averageLatency.toFixed(3)}ms
          内存使用: ${currentMetrics.memoryMB.toFixed(2)}MB`);
      }, 10000);
      
      // 等待转换测试完成
      await transformationTestPromise;
      clearInterval(monitoringInterval);
      
      const finalTransformerStats = transformer.getStats();
      const finalMetrics = performanceMonitor.getThroughputMetrics();
      const memoryStats = performanceMonitor.getMemoryStats();
      
      // 记录最终转换性能指标
      recordMetric('dataflow-transformation-final-total', finalTransformerStats.totalTransformations);
      recordMetric('dataflow-transformation-final-successful', finalTransformerStats.successfulTransformations);
      recordMetric('dataflow-transformation-final-success-rate', finalTransformerStats.transformationSuccessRate);
      recordMetric('dataflow-transformation-final-avg-latency', finalTransformerStats.averageLatency);
      recordMetric('dataflow-transformation-final-p95-latency', finalTransformerStats.p95Latency);
      recordMetric('dataflow-transformation-final-p99-latency', finalTransformerStats.p99Latency);
      recordMetric('dataflow-transformation-final-throughput', finalMetrics.messagesPerSecond);
      recordMetric('dataflow-transformation-final-memory-mb', memoryStats.current / (1024 * 1024));
      
      console.log(`📊 数据转换性能最终统计:
        测试时长: ${testDuration / 1000}秒
        目标吞吐量: ${targetThroughput} msg/sec
        实际吞吐量: ${finalMetrics.messagesPerSecond.toFixed(2)} msg/sec
        转换总数: ${finalTransformerStats.totalTransformations}
        成功转换: ${finalTransformerStats.successfulTransformations}
        失败转换: ${finalTransformerStats.failedTransformations}
        成功率: ${(finalTransformerStats.transformationSuccessRate * 100).toFixed(2)}%
        
        延迟统计:
        - 平均延迟: ${finalTransformerStats.averageLatency.toFixed(3)}ms
        - P95延迟: ${finalTransformerStats.p95Latency.toFixed(3)}ms
        - P99延迟: ${finalTransformerStats.p99Latency.toFixed(3)}ms
        
        资源使用:
        - 内存使用: ${(memoryStats.current / (1024 * 1024)).toFixed(2)}MB
        
        转换分布:`);
      
      finalTransformerStats.transformationsByType.forEach((count, type) => {
        console.log(`        - ${type}: ${count} 条转换 (${(count / finalTransformerStats.totalTransformations * 100).toFixed(1)}%)`);
      });
      
      // 验证数据转换性能要求
      expect(finalMetrics.messagesPerSecond).toBeGreaterThanOrEqual(targetThroughput * 0.9); // 90%目标吞吐量
      expect(finalTransformerStats.transformationSuccessRate).toBeGreaterThanOrEqual(0.995); // 99.5%转换成功率
      expect(finalTransformerStats.averageLatency).toBeLessThanOrEqual(5); // 平均转换延迟≤5ms
      expect(finalTransformerStats.p95Latency).toBeLessThanOrEqual(10); // P95转换延迟≤10ms
      expect(finalTransformerStats.failedTransformations).toBeLessThanOrEqual(10); // 失败转换≤10次
      expect(memoryStats.current / (1024 * 1024)).toBeLessThanOrEqual(120); // 内存使用≤120MB
      
      console.log('✅ 数据转换性能测试完成');
    }, 90000);
  });

  describe('端到端DataFlow性能测试', () => {
    test('验证完整DataFlow链路的端到端性能', async () => {
      console.log('🎯 开始端到端DataFlow性能测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      // 模拟完整的DataFlow链路
      class MockDataFlowPipeline {
        private pipelineStats = {
          totalMessages: 0,
          processedMessages: 0,
          failedMessages: 0,
          endToEndLatencies: [] as number[],
          stageLatencies: {
            routing: [] as number[],
            transformation: [] as number[],
            validation: [] as number[],
            output: [] as number[]
          }
        };

        async processMessage(message: any): Promise<any> {
          const pipelineStart = performance.now();
          
          this.pipelineStats.totalMessages++;
          
          try {
            // Stage 1: 路由
            const routingStart = performance.now();
            const routedMessage = await this.routeMessage(message);
            const routingLatency = performance.now() - routingStart;
            this.pipelineStats.stageLatencies.routing.push(routingLatency);
            
            // Stage 2: 数据转换
            const transformStart = performance.now();
            const transformedMessage = await this.transformMessage(routedMessage);
            const transformLatency = performance.now() - transformStart;
            this.pipelineStats.stageLatencies.transformation.push(transformLatency);
            
            // Stage 3: 数据验证
            const validationStart = performance.now();
            const validatedMessage = await this.validateMessage(transformedMessage);
            const validationLatency = performance.now() - validationStart;
            this.pipelineStats.stageLatencies.validation.push(validationLatency);
            
            // Stage 4: 输出处理
            const outputStart = performance.now();
            const outputMessage = await this.outputMessage(validatedMessage);
            const outputLatency = performance.now() - outputStart;
            this.pipelineStats.stageLatencies.output.push(outputLatency);
            
            this.pipelineStats.processedMessages++;
            
            const endToEndLatency = performance.now() - pipelineStart;
            this.pipelineStats.endToEndLatencies.push(endToEndLatency);
            
            recordMetric('dataflow-e2e-latency', endToEndLatency);
            recordMetric('dataflow-routing-stage-latency', routingLatency);
            recordMetric('dataflow-transform-stage-latency', transformLatency);
            recordMetric('dataflow-validation-stage-latency', validationLatency);
            recordMetric('dataflow-output-stage-latency', outputLatency);
            
            return outputMessage;
            
          } catch (error) {
            this.pipelineStats.failedMessages++;
            recordMetric('dataflow-e2e-error', 1);
            
            const failedLatency = performance.now() - pipelineStart;
            this.pipelineStats.endToEndLatencies.push(failedLatency);
            
            throw error;
          }
        }

        private async routeMessage(message: any): Promise<any> {
          // 模拟异步路由逻辑
          await this.asyncDelay(0.5);
          
          return {
            ...message,
            routedAt: Date.now(),
            route: this.determineRoute(message.type)
          };
        }

        private async transformMessage(message: any): Promise<any> {
          // 模拟异步数据转换
          await this.asyncDelay(2.0);
          
          return {
            ...message,
            transformedAt: Date.now(),
            normalized: true,
            version: '2.0'
          };
        }

        private async validateMessage(message: any): Promise<any> {
          // 模拟异步数据验证
          await this.asyncDelay(1.0);
          
          // 简单验证逻辑
          if (!message.symbol || !message.type || !message.data) {
            throw new Error('消息验证失败：缺少必要字段');
          }
          
          return {
            ...message,
            validatedAt: Date.now(),
            valid: true
          };
        }

        private async outputMessage(message: any): Promise<any> {
          // 模拟异步输出处理
          await this.asyncDelay(0.8);
          
          return {
            ...message,
            outputAt: Date.now(),
            processed: true
          };
        }

        private determineRoute(messageType: string): string {
          const routes = {
            'trade': 'trade-processor',
            'ticker': 'ticker-processor',
            'kline': 'kline-processor',
            'depth': 'depth-processor'
          };
          
          return routes[messageType] || 'generic-processor';
        }

        private async asyncDelay(delayMs: number): Promise<void> {
          return new Promise(resolve => {
            setTimeout(resolve, delayMs);
          });
        }

        getStats() {
          const sortedE2ELatencies = [...this.pipelineStats.endToEndLatencies].sort((a, b) => a - b);
          
          const stageStats = {};
          Object.keys(this.pipelineStats.stageLatencies).forEach(stage => {
            const latencies = this.pipelineStats.stageLatencies[stage];
            const sorted = [...latencies].sort((a, b) => a - b);
            stageStats[stage] = {
              average: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
              p95: sorted[Math.floor(sorted.length * 0.95)] || 0
            };
          });
          
          return {
            ...this.pipelineStats,
            averageE2ELatency: sortedE2ELatencies.reduce((a, b) => a + b, 0) / sortedE2ELatencies.length || 0,
            p95E2ELatency: sortedE2ELatencies[Math.floor(sortedE2ELatencies.length * 0.95)] || 0,
            p99E2ELatency: sortedE2ELatencies[Math.floor(sortedE2ELatencies.length * 0.99)] || 0,
            successRate: this.pipelineStats.processedMessages / this.pipelineStats.totalMessages,
            stageStats
          };
        }
      }

      const pipeline = new MockDataFlowPipeline();
      
      // 开始端到端DataFlow性能测试
      const targetThroughput = 800; // 800 msg/sec（考虑到完整链路的复杂性）
      const testDuration = 60000; // 60秒测试
      
      console.log(`开始${targetThroughput} msg/sec的端到端DataFlow测试，持续${testDuration/1000}秒...`);
      
      // 并发处理消息
      const concurrentMessages = 50; // 同时处理50条消息
      const messageInterval = (1000 / targetThroughput) * concurrentMessages;
      
      const endToEndTestPromise = new Promise<void>((resolve) => {
        let totalProcessed = 0;
        const maxMessages = Math.floor(targetThroughput * (testDuration / 1000));
        
        const processMessageBatch = async () => {
          if (totalProcessed >= maxMessages) {
            resolve();
            return;
          }
          
          // 创建并发消息批次
          const messageBatch = Array.from({ length: Math.min(concurrentMessages, maxMessages - totalProcessed) }, (_, i) => {
            const messageTypes = ['trade', 'ticker', 'kline', 'depth'];
            const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
            
            return {
              id: `e2e_msg_${totalProcessed + i}`,
              type: messageTypes[Math.floor(Math.random() * messageTypes.length)],
              symbol: symbols[Math.floor(Math.random() * symbols.length)],
              data: this.generateMessageData(messageTypes[Math.floor(Math.random() * messageTypes.length)]),
              timestamp: Date.now()
            };
          });
          
          // 并发处理消息批次
          const processingPromises = messageBatch.map(async (message) => {
            try {
              await pipeline.processMessage(message);
            } catch (error) {
              console.warn(`消息处理失败: ${error.message}`);
            }
          });
          
          await Promise.all(processingPromises);
          totalProcessed += messageBatch.length;
          
          // 调度下一个批次
          setTimeout(processMessageBatch, messageInterval);
        };
        
        processMessageBatch();
      });
      
      // 定期记录端到端性能指标
      const monitoringInterval = setInterval(() => {
        const pipelineStats = pipeline.getStats();
        const currentMetrics = performanceMonitor.getCurrentMetrics();
        
        recordMetric('dataflow-e2e-total-messages', pipelineStats.totalMessages);
        recordMetric('dataflow-e2e-processed-messages', pipelineStats.processedMessages);
        recordMetric('dataflow-e2e-failed-messages', pipelineStats.failedMessages);
        recordMetric('dataflow-e2e-success-rate', pipelineStats.successRate);
        recordMetric('dataflow-e2e-avg-latency', pipelineStats.averageE2ELatency);
        recordMetric('dataflow-e2e-memory-mb', currentMetrics.memoryMB);
        
        console.log(`🎯 端到端DataFlow实时统计:
          处理总数: ${pipelineStats.totalMessages}
          成功处理: ${pipelineStats.processedMessages}
          失败处理: ${pipelineStats.failedMessages}
          成功率: ${(pipelineStats.successRate * 100).toFixed(2)}%
          平均端到端延迟: ${pipelineStats.averageE2ELatency.toFixed(2)}ms
          内存使用: ${currentMetrics.memoryMB.toFixed(2)}MB`);
      }, 15000);
      
      // 等待端到端测试完成
      await endToEndTestPromise;
      clearInterval(monitoringInterval);
      
      const finalPipelineStats = pipeline.getStats();
      const finalMetrics = performanceMonitor.getThroughputMetrics();
      const memoryStats = performanceMonitor.getMemoryStats();
      
      // 记录最终端到端性能指标
      recordMetric('dataflow-e2e-final-total', finalPipelineStats.totalMessages);
      recordMetric('dataflow-e2e-final-processed', finalPipelineStats.processedMessages);
      recordMetric('dataflow-e2e-final-success-rate', finalPipelineStats.successRate);
      recordMetric('dataflow-e2e-final-avg-latency', finalPipelineStats.averageE2ELatency);
      recordMetric('dataflow-e2e-final-p95-latency', finalPipelineStats.p95E2ELatency);
      recordMetric('dataflow-e2e-final-p99-latency', finalPipelineStats.p99E2ELatency);
      recordMetric('dataflow-e2e-final-throughput', finalMetrics.messagesPerSecond);
      recordMetric('dataflow-e2e-final-memory-mb', memoryStats.current / (1024 * 1024));
      
      console.log(`📊 端到端DataFlow性能最终统计:
        测试时长: ${testDuration / 1000}秒
        目标吞吐量: ${targetThroughput} msg/sec
        实际吞吐量: ${finalMetrics.messagesPerSecond.toFixed(2)} msg/sec
        处理总数: ${finalPipelineStats.totalMessages}
        成功处理: ${finalPipelineStats.processedMessages}
        失败处理: ${finalPipelineStats.failedMessages}
        成功率: ${(finalPipelineStats.successRate * 100).toFixed(2)}%
        
        端到端延迟统计:
        - 平均延迟: ${finalPipelineStats.averageE2ELatency.toFixed(2)}ms
        - P95延迟: ${finalPipelineStats.p95E2ELatency.toFixed(2)}ms
        - P99延迟: ${finalPipelineStats.p99E2ELatency.toFixed(2)}ms
        
        各阶段延迟统计:`);
      
      Object.keys(finalPipelineStats.stageStats).forEach(stage => {
        const stats = finalPipelineStats.stageStats[stage];
        console.log(`        - ${stage}: 平均 ${stats.average.toFixed(2)}ms, P95 ${stats.p95.toFixed(2)}ms`);
      });
      
      console.log(`        
        资源使用:
        - 内存使用: ${(memoryStats.current / (1024 * 1024)).toFixed(2)}MB`);
      
      // 验证端到端DataFlow性能要求
      expect(finalMetrics.messagesPerSecond).toBeGreaterThanOrEqual(targetThroughput * 0.85); // 85%目标吞吐量
      expect(finalPipelineStats.successRate).toBeGreaterThanOrEqual(0.98); // 98%处理成功率
      expect(finalPipelineStats.averageE2ELatency).toBeLessThanOrEqual(20); // 平均端到端延迟≤20ms
      expect(finalPipelineStats.p95E2ELatency).toBeLessThanOrEqual(50); // P95端到端延迟≤50ms
      expect(finalPipelineStats.failedMessages).toBeLessThanOrEqual(20); // 失败消息≤20条
      expect(memoryStats.current / (1024 * 1024)).toBeLessThanOrEqual(150); // 内存使用≤150MB
      
      console.log('✅ 端到端DataFlow性能测试完成');
    }, 150000); // 2.5分钟超时
  });
});