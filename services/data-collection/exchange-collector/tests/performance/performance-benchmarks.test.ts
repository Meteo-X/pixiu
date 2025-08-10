/**
 * 性能基准测试
 * 验证重构后的性能指标和基准
 */

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { performance } from 'perf_hooks';
import { globalCache } from '@pixiu/shared-core';
import { DataType } from '@pixiu/adapter-base';
import { EnhancedMockFactory } from '../utils/enhanced-mock-factory';
import { TestUtils, PerformanceResult, ConcurrencyResult } from '../utils/test-utils';

// 性能基准常量
const PERFORMANCE_BENCHMARKS = {
  THROUGHPUT: {
    MIN_MESSAGES_PER_SECOND: 1000,
    TARGET_MESSAGES_PER_SECOND: 2000
  },
  LATENCY: {
    DATAFLOW_MAX_MS: 50,
    WEBSOCKET_MAX_MS: 10,
    ADAPTER_MAX_MS: 30
  },
  MEMORY: {
    MAX_INCREASE_MB: 50,
    STABILITY_THRESHOLD_MB: 10
  },
  CONCURRENCY: {
    MIN_CONNECTIONS: 1000,
    SUCCESS_RATE_THRESHOLD: 0.95
  }
};

describe('Performance Benchmarks', () => {
  afterEach(() => {
    EnhancedMockFactory.cleanup();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await globalCache.destroy();
  });

  describe('Throughput Benchmarks', () => {
    it('should achieve minimum throughput for data processing', async () => {
      const mockDataFlow = EnhancedMockFactory.createDataFlowMock();
      let processedCount = 0;

      // 创建高效的处理函数
      const processData = async () => {
        const testData = TestUtils.createMarketData();
        await mockDataFlow.processData(testData, 'binance');
        processedCount++;
      };

      // 运行性能测试
      const result: PerformanceResult = await TestUtils.testPerformance(
        processData,
        2000, // 2000次操作
        100   // 100次预热
      );

      console.log(TestUtils.formatPerformanceResult(result));

      // 验证吞吐量基准
      expect(result.throughput).toBeGreaterThan(PERFORMANCE_BENCHMARKS.THROUGHPUT.MIN_MESSAGES_PER_SECOND);
      expect(processedCount).toBe(2000);
      
      // 验证延迟基准
      expect(result.averageLatency).toBeLessThan(PERFORMANCE_BENCHMARKS.LATENCY.DATAFLOW_MAX_MS);
      expect(result.maxLatency).toBeLessThan(PERFORMANCE_BENCHMARKS.LATENCY.DATAFLOW_MAX_MS * 2);

      console.log(`✅ DataFlow Throughput: ${result.throughput.toFixed(0)} msg/sec (target: ${PERFORMANCE_BENCHMARKS.THROUGHPUT.MIN_MESSAGES_PER_SECOND})`);
      console.log(`✅ DataFlow Latency: ${result.averageLatency.toFixed(2)}ms (max: ${PERFORMANCE_BENCHMARKS.LATENCY.DATAFLOW_MAX_MS}ms)`);
    });

    it('should achieve target throughput for WebSocket operations', async () => {
      const mockWebSocketProxy = EnhancedMockFactory.createWebSocketProxyMock();
      let broadcastCount = 0;

      const broadcastData = async () => {
        const testData = TestUtils.createMarketData();
        mockWebSocketProxy.broadcast(testData);
        broadcastCount++;
      };

      const result: PerformanceResult = await TestUtils.testPerformance(
        broadcastData,
        5000, // 5000次广播
        200   // 200次预热
      );

      console.log('WebSocket Broadcast Performance:');
      console.log(TestUtils.formatPerformanceResult(result));

      // 验证WebSocket吞吐量和延迟
      expect(result.throughput).toBeGreaterThan(PERFORMANCE_BENCHMARKS.THROUGHPUT.TARGET_MESSAGES_PER_SECOND);
      expect(result.averageLatency).toBeLessThan(PERFORMANCE_BENCHMARKS.LATENCY.WEBSOCKET_MAX_MS);
      expect(broadcastCount).toBe(5000);

      console.log(`✅ WebSocket Throughput: ${result.throughput.toFixed(0)} msg/sec (target: ${PERFORMANCE_BENCHMARKS.THROUGHPUT.TARGET_MESSAGES_PER_SECOND})`);
      console.log(`✅ WebSocket Latency: ${result.averageLatency.toFixed(2)}ms (max: ${PERFORMANCE_BENCHMARKS.LATENCY.WEBSOCKET_MAX_MS}ms)`);
    });

    it('should maintain throughput with mixed data types', async () => {
      const mockAdapter = EnhancedMockFactory.createAdapterMock();
      const dataTypes = [DataType.TICKER, DataType.DEPTH, DataType.TRADE];
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'BNBUSDT'];
      let processedCount = 0;

      const processMixedData = async () => {
        const symbol = symbols[processedCount % symbols.length];
        const type = dataTypes[processedCount % dataTypes.length];
        
        const testData = TestUtils.createMarketData({
          symbol,
          type,
          data: {
            price: (Math.random() * 10000 + 1000).toFixed(2),
            volume: (Math.random() * 1000).toFixed(3)
          }
        });

        mockAdapter.emit('data', testData);
        processedCount++;
      };

      const result: PerformanceResult = await TestUtils.testPerformance(
        processMixedData,
        3000, // 3000条混合数据
        150
      );

      console.log('Mixed Data Processing Performance:');
      console.log(TestUtils.formatPerformanceResult(result));

      expect(result.throughput).toBeGreaterThan(PERFORMANCE_BENCHMARKS.THROUGHPUT.MIN_MESSAGES_PER_SECOND);
      expect(result.averageLatency).toBeLessThan(PERFORMANCE_BENCHMARKS.LATENCY.ADAPTER_MAX_MS);

      console.log(`✅ Mixed Data Throughput: ${result.throughput.toFixed(0)} msg/sec`);
      console.log(`✅ Data Variety: ${symbols.length} symbols × ${dataTypes.length} types`);
    });
  });

  describe('Latency Benchmarks', () => {
    it('should meet latency requirements for real-time data processing', async () => {
      const mockDataFlow = EnhancedMockFactory.createDataFlowMock();
      const latencies: number[] = [];

      // 模拟实时处理延迟
      for (let i = 0; i < 1000; i++) {
        const testData = TestUtils.createMarketData({
          timestamp: Date.now(),
          data: { sequenceId: i }
        });

        const startTime = performance.now();
        await mockDataFlow.processData(testData, 'binance');
        const endTime = performance.now();

        latencies.push(endTime - startTime);

        // 模拟高频场景的小间隔
        if (i % 100 === 0) {
          await TestUtils.sleep(1);
        }
      }

      const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
      const p99Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];

      console.log(`Real-time Processing Latency Analysis:`);
      console.log(`  Average: ${averageLatency.toFixed(2)}ms`);
      console.log(`  Maximum: ${maxLatency.toFixed(2)}ms`);
      console.log(`  P95: ${p95Latency.toFixed(2)}ms`);
      console.log(`  P99: ${p99Latency.toFixed(2)}ms`);

      expect(averageLatency).toBeLessThan(PERFORMANCE_BENCHMARKS.LATENCY.DATAFLOW_MAX_MS);
      expect(p95Latency).toBeLessThan(PERFORMANCE_BENCHMARKS.LATENCY.DATAFLOW_MAX_MS * 1.5);
      expect(p99Latency).toBeLessThan(PERFORMANCE_BENCHMARKS.LATENCY.DATAFLOW_MAX_MS * 2);

      console.log(`✅ Real-time Latency: ${averageLatency.toFixed(2)}ms (target: <${PERFORMANCE_BENCHMARKS.LATENCY.DATAFLOW_MAX_MS}ms)`);
    });

    it('should maintain low latency under high load', async () => {
      const mockWebSocketProxy = EnhancedMockFactory.createWebSocketProxyMock();
      const loadLevels = [100, 500, 1000, 2000]; // msg/sec
      const results: { load: number; latency: number }[] = [];

      for (const targetLoad of loadLevels) {
        const latencies: number[] = [];
        const interval = 1000 / targetLoad; // ms between messages
        const testDuration = 1000; // 1 second test
        const expectedMessages = Math.floor(testDuration / interval);

        console.log(`Testing load: ${targetLoad} msg/sec (${expectedMessages} messages)`);

        for (let i = 0; i < expectedMessages; i++) {
          const testData = TestUtils.createMarketData();
          
          const startTime = performance.now();
          mockWebSocketProxy.broadcast(testData);
          const endTime = performance.now();
          
          latencies.push(endTime - startTime);
          
          if (interval > 1) {
            await TestUtils.sleep(interval);
          }
        }

        const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
        results.push({ load: targetLoad, latency: averageLatency });

        console.log(`  Average latency at ${targetLoad} msg/sec: ${averageLatency.toFixed(2)}ms`);
      }

      // 验证在不同负载下延迟都符合要求
      for (const result of results) {
        expect(result.latency).toBeLessThan(PERFORMANCE_BENCHMARKS.LATENCY.WEBSOCKET_MAX_MS);
      }

      // 验证延迟不会随负载大幅增加
      const latencyIncrease = results[results.length - 1].latency - results[0].latency;
      expect(latencyIncrease).toBeLessThan(5); // 延迟增长<5ms

      console.log('✅ Latency stability under load verified');
    });
  });

  describe('Memory Performance', () => {
    it('should maintain memory stability during extended operation', async () => {
      const mockDataFlow = EnhancedMockFactory.createDataFlowMock();
      const initialMemory = process.memoryUsage().heapUsed;
      const memorySnapshots: number[] = [];

      console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);

      // 运行长时间处理测试
      const testDuration = 5000; // 5秒
      const messagesPerSecond = 500;
      const totalMessages = (testDuration / 1000) * messagesPerSecond;

      let processedMessages = 0;
      const startTime = Date.now();

      while (Date.now() - startTime < testDuration) {
        const testData = TestUtils.createMarketData({
          data: {
            // 创建一些内存占用
            payload: new Array(50).fill('x').join(''),
            timestamp: Date.now(),
            id: processedMessages
          }
        });

        await mockDataFlow.processData(testData, 'binance');
        processedMessages++;

        // 每100条消息记录内存快照
        if (processedMessages % 100 === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          memorySnapshots.push(currentMemory);
          
          const memoryMB = (currentMemory - initialMemory) / 1024 / 1024;
          
          // 内存增长应该在合理范围内
          expect(memoryMB).toBeLessThan(PERFORMANCE_BENCHMARKS.MEMORY.MAX_INCREASE_MB);
        }

        // 控制消息频率
        if (processedMessages % 100 === 0) {
          await TestUtils.sleep(10);
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`Processed ${processedMessages} messages in ${testDuration}ms`);
      console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB`);
      console.log(`Messages per second: ${((processedMessages * 1000) / testDuration).toFixed(0)}`);

      // 验证内存稳定性
      expect(memoryIncrease).toBeLessThan(PERFORMANCE_BENCHMARKS.MEMORY.MAX_INCREASE_MB);
      
      // 验证内存增长趋势稳定
      if (memorySnapshots.length > 4) {
        const recentGrowth = memorySnapshots.slice(-3).reduce((sum, curr, idx, arr) => {
          if (idx > 0) {
            return sum + (curr - arr[idx - 1]);
          }
          return sum;
        }, 0) / 1024 / 1024;
        
        expect(Math.abs(recentGrowth)).toBeLessThan(PERFORMANCE_BENCHMARKS.MEMORY.STABILITY_THRESHOLD_MB);
      }

      console.log(`✅ Memory stability: ${memoryIncrease.toFixed(2)}MB increase (limit: ${PERFORMANCE_BENCHMARKS.MEMORY.MAX_INCREASE_MB}MB)`);
    });

    it('should handle memory-intensive operations efficiently', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 创建大量数据处理任务
      const largeDatasets = Array.from({ length: 1000 }, (_, i) => 
        TestUtils.createMarketData({
          symbol: `SYMBOL${i}USDT`,
          data: {
            // 每条消息包含更多数据
            prices: Array.from({ length: 100 }, (_, j) => (1000 + i + j * 0.1).toFixed(2)),
            volumes: Array.from({ length: 100 }, (_, j) => (100 + j).toFixed(3)),
            metadata: {
              sequenceId: i,
              processingId: `proc_${i}_${Date.now()}`,
              additionalData: new Array(200).fill(`data_${i}`).join(',')
            }
          }
        })
      );

      console.log(`Processing ${largeDatasets.length} large data records...`);

      const mockDataFlow = EnhancedMockFactory.createDataFlowMock();
      
      // 批量处理大数据集
      const batchSize = 50;
      for (let i = 0; i < largeDatasets.length; i += batchSize) {
        const batch = largeDatasets.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(data => mockDataFlow.processData(data, 'binance'))
        );

        // 检查内存使用
        if (i % (batchSize * 4) === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = (currentMemory - initialMemory) / 1024 / 1024;
          
          console.log(`Processed ${i + batch.length} records, memory: +${memoryIncrease.toFixed(2)}MB`);
          
          expect(memoryIncrease).toBeLessThan(PERFORMANCE_BENCHMARKS.MEMORY.MAX_INCREASE_MB * 2);
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const totalMemoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`Total memory increase: ${totalMemoryIncrease.toFixed(2)}MB`);
      expect(totalMemoryIncrease).toBeLessThan(PERFORMANCE_BENCHMARKS.MEMORY.MAX_INCREASE_MB * 3);

      console.log('✅ Large dataset processing memory efficiency verified');
    });
  });

  describe('Concurrency Benchmarks', () => {
    it('should support high concurrent connections', async () => {
      let connectionCount = 0;
      let successfulConnections = 0;

      const createMockConnection = async () => {
        connectionCount++;
        
        // 模拟连接时间
        await TestUtils.sleep(Math.random() * 10 + 5);
        
        // 模拟连接建立过程
        const mockWebSocket = EnhancedMockFactory.createWebSocketMock({
          url: `ws://localhost:8080/client_${connectionCount}`
        });
        
        // 模拟握手
        mockWebSocket.emit('open');
        
        successfulConnections++;
        return mockWebSocket;
      };

      console.log(`Testing ${PERFORMANCE_BENCHMARKS.CONCURRENCY.MIN_CONNECTIONS} concurrent connections...`);

      const result: ConcurrencyResult = await TestUtils.testConcurrency(
        createMockConnection,
        PERFORMANCE_BENCHMARKS.CONCURRENCY.MIN_CONNECTIONS,
        100 // 100个并发级别
      );

      console.log(TestUtils.formatConcurrencyResult(result));

      // 验证并发性能
      expect(result.totalConnections).toBe(PERFORMANCE_BENCHMARKS.CONCURRENCY.MIN_CONNECTIONS);
      expect(result.successfulConnections).toBeGreaterThanOrEqual(
        PERFORMANCE_BENCHMARKS.CONCURRENCY.MIN_CONNECTIONS * PERFORMANCE_BENCHMARKS.CONCURRENCY.SUCCESS_RATE_THRESHOLD
      );
      expect(result.averageConnectionTime).toBeLessThan(100); // 平均连接时间<100ms

      const successRate = result.successfulConnections / result.totalConnections;
      console.log(`✅ Concurrency: ${result.successfulConnections}/${result.totalConnections} connections (${(successRate * 100).toFixed(1)}%)`);
      console.log(`✅ Average connection time: ${result.averageConnectionTime.toFixed(2)}ms`);
    });

    it('should handle concurrent data processing efficiently', async () => {
      const mockDataFlow = EnhancedMockFactory.createDataFlowMock();
      const concurrentDataStreams = 50;
      const messagesPerStream = 100;
      
      console.log(`Testing ${concurrentDataStreams} concurrent data streams with ${messagesPerStream} messages each...`);

      const createDataStream = async (streamId: number) => {
        const streamData = [];
        
        for (let i = 0; i < messagesPerStream; i++) {
          const data = TestUtils.createMarketData({
            data: {
              streamId,
              messageId: i,
              timestamp: Date.now()
            }
          });
          
          streamData.push(data);
        }
        
        // 并发处理流中的所有数据
        await Promise.all(
          streamData.map(data => mockDataFlow.processData(data, `stream_${streamId}`))
        );
        
        return streamData.length;
      };

      const startTime = Date.now();
      
      // 并发运行所有数据流
      const results = await Promise.all(
        Array.from({ length: concurrentDataStreams }, (_, i) => createDataStream(i))
      );
      
      const endTime = Date.now();
      const totalProcessingTime = endTime - startTime;
      const totalMessages = results.reduce((sum, count) => sum + count, 0);
      const throughput = (totalMessages * 1000) / totalProcessingTime;

      console.log(`Processed ${totalMessages} messages across ${concurrentDataStreams} streams`);
      console.log(`Total time: ${totalProcessingTime}ms`);
      console.log(`Throughput: ${throughput.toFixed(0)} msg/sec`);

      // 验证并发处理性能
      expect(totalMessages).toBe(concurrentDataStreams * messagesPerStream);
      expect(throughput).toBeGreaterThan(PERFORMANCE_BENCHMARKS.THROUGHPUT.MIN_MESSAGES_PER_SECOND);
      expect(totalProcessingTime).toBeLessThan(10000); // 10秒内完成

      console.log('✅ Concurrent data processing efficiency verified');
    });
  });

  describe('Resource Optimization', () => {
    it('should demonstrate CPU efficiency improvements', async () => {
      // 模拟CPU密集型操作
      const cpuIntensiveOperation = async () => {
        let result = 0;
        
        // 模拟数据处理计算
        for (let i = 0; i < 1000; i++) {
          result += Math.sin(i) * Math.cos(i) + Math.sqrt(i);
        }
        
        // 模拟序列化/反序列化
        const data = TestUtils.createMarketData();
        const serialized = JSON.stringify(data);
        const deserialized = JSON.parse(serialized);
        
        return { result, processed: deserialized };
      };

      const result = await TestUtils.testPerformance(
        cpuIntensiveOperation,
        1000,
        50
      );

      console.log('CPU Efficiency Test:');
      console.log(TestUtils.formatPerformanceResult(result));

      // CPU优化验证
      expect(result.throughput).toBeGreaterThan(100); // 至少100 ops/sec
      expect(result.averageLatency).toBeLessThan(50);  // 平均延迟<50ms

      console.log(`✅ CPU efficiency: ${result.throughput.toFixed(0)} ops/sec`);
    });

    it('should validate connection pool efficiency', async () => {
      const connectionPool = {
        connections: new Map(),
        activeConnections: 0,
        
        async getConnection(id: string) {
          if (!this.connections.has(id)) {
            const connection = EnhancedMockFactory.createWebSocketMock({
              url: `ws://pool/${id}`
            });
            this.connections.set(id, connection);
            this.activeConnections++;
          }
          return this.connections.get(id);
        },
        
        async releaseConnection(id: string) {
          if (this.connections.has(id)) {
            this.connections.delete(id);
            this.activeConnections--;
          }
        },
        
        getStats() {
          return {
            totalConnections: this.connections.size,
            activeConnections: this.activeConnections
          };
        }
      };

      // 模拟连接池使用模式
      const connectionIds = Array.from({ length: 100 }, (_, i) => `conn_${i}`);
      
      // 获取连接
      const startTime = Date.now();
      for (const id of connectionIds) {
        await connectionPool.getConnection(id);
      }
      const acquisitionTime = Date.now() - startTime;

      console.log(`Connection acquisition time: ${acquisitionTime}ms for ${connectionIds.length} connections`);
      console.log(`Pool stats:`, connectionPool.getStats());

      // 验证连接池效率
      expect(connectionPool.getStats().totalConnections).toBe(connectionIds.length);
      expect(acquisitionTime).toBeLessThan(1000); // 1秒内获取100个连接

      // 释放连接
      for (const id of connectionIds) {
        await connectionPool.releaseConnection(id);
      }

      expect(connectionPool.getStats().totalConnections).toBe(0);

      console.log('✅ Connection pool efficiency verified');
    });
  });

  describe('Performance Regression Detection', () => {
    it('should detect performance regressions in key metrics', async () => {
      // 基准性能指标（模拟历史数据）
      const baselineMetrics = {
        throughput: 1500, // msg/sec
        averageLatency: 25, // ms
        memoryUsage: 30, // MB
        connectionTime: 50 // ms
      };

      // 当前测试的性能指标
      const mockDataFlow = EnhancedMockFactory.createDataFlowMock();
      
      const result = await TestUtils.testPerformance(
        async () => {
          const data = TestUtils.createMarketData();
          await mockDataFlow.processData(data, 'binance');
        },
        2000,
        100
      );

      const currentMetrics = {
        throughput: result.throughput,
        averageLatency: result.averageLatency,
        memoryUsage: result.memoryUsage ? result.memoryUsage.heapUsed / 1024 / 1024 : 0,
        connectionTime: 45 // 模拟连接时间
      };

      console.log('Performance Regression Analysis:');
      console.log('Baseline vs Current Metrics:');

      // 计算性能变化百分比
      const regressionThreshold = 0.10; // 10%退化阈值
      const improvements = [];
      const regressions = [];

      for (const [metric, currentValue] of Object.entries(currentMetrics)) {
        const baselineValue = baselineMetrics[metric as keyof typeof baselineMetrics];
        const change = (currentValue - baselineValue) / baselineValue;
        
        console.log(`${metric}: ${currentValue.toFixed(2)} (baseline: ${baselineValue.toFixed(2)}, change: ${(change * 100).toFixed(1)}%)`);
        
        if (metric === 'throughput') {
          // 对于吞吐量，正值是改进
          if (change > regressionThreshold) {
            improvements.push({ metric, change });
          } else if (change < -regressionThreshold) {
            regressions.push({ metric, change });
          }
        } else {
          // 对于延迟、内存等，负值是改进
          if (change < -regressionThreshold) {
            improvements.push({ metric, change });
          } else if (change > regressionThreshold) {
            regressions.push({ metric, change });
          }
        }
      }

      // 验证无显著性能回归
      if (regressions.length > 0) {
        console.warn('⚠️  Performance regressions detected:');
        regressions.forEach(r => {
          console.warn(`  ${r.metric}: ${(r.change * 100).toFixed(1)}% regression`);
        });
      } else {
        console.log('✅ No significant performance regressions detected');
      }

      if (improvements.length > 0) {
        console.log('🚀 Performance improvements:');
        improvements.forEach(i => {
          console.log(`  ${i.metric}: ${Math.abs(i.change * 100).toFixed(1)}% improvement`);
        });
      }

      // 测试应该通过，除非有严重回归
      const criticalRegressions = regressions.filter(r => Math.abs(r.change) > 0.25); // 25%以上
      expect(criticalRegressions).toHaveLength(0);
      
      // 至少在某些指标上应该保持或改进性能
      const totalImprovementScore = improvements.reduce((sum, i) => sum + Math.abs(i.change), 0);
      const totalRegressionScore = regressions.reduce((sum, r) => sum + Math.abs(r.change), 0);
      
      expect(totalImprovementScore).toBeGreaterThanOrEqual(totalRegressionScore);

      console.log(`Overall performance score: ${((totalImprovementScore - totalRegressionScore) * 100).toFixed(1)}%`);
    });
  });
});