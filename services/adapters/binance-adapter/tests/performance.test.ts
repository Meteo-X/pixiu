/**
 * 性能和稳定性测试
 * 测试重构后适配器的性能表现和长期稳定性
 */

import { BinanceAdapter, createBinanceAdapter, BinanceConfig } from '../src';
import { globalCache } from '@pixiu/shared-core';
import { DataType, AdapterStatus } from '@pixiu/adapter-base';
import { EventEmitter } from 'events';

// Performance testing WebSocket mock
class PerformanceWebSocket extends EventEmitter {
  public readyState = 1; // Always open for performance tests
  public url = '';
  private _messageCount = 0;
  private _startTime = 0;
  
  constructor(url: string) {
    super();
    this.url = url;
    this._startTime = Date.now();
    
    // Immediately emit open
    process.nextTick(() => {
      this.emit('open');
    });
  }
  
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  
  send(data: string) {
    // Mock send - no actual network
  }
  
  // Performance testing helpers
  simulateHighFrequencyMessages(count: number, intervalMs: number = 1) {
    let sent = 0;
    const sendMessage = () => {
      if (sent >= count) return;
      
      const message = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: Date.now(),
          s: 'BTCUSDT',
          t: sent + 1,
          p: (50000 + Math.random() * 1000).toFixed(2),
          q: (Math.random()).toFixed(4),
          T: Date.now(),
          m: sent % 2 === 0
        }
      };
      
      this.emit('message', { data: JSON.stringify(message) });
      sent++;
      
      if (sent < count) {
        setTimeout(sendMessage, intervalMs);
      }
    };
    
    sendMessage();
  }
  
  simulateBurstMessages(burstSize: number, burstCount: number, burstIntervalMs: number = 100) {
    let bursts = 0;
    
    const sendBurst = () => {
      if (bursts >= burstCount) return;
      
      for (let i = 0; i < burstSize; i++) {
        const message = {
          stream: `symbol${bursts}usdt@trade`,
          data: {
            e: 'trade',
            E: Date.now(),
            s: `SYMBOL${bursts}USDT`,
            t: bursts * burstSize + i,
            p: (1000 + Math.random() * 100).toFixed(2),
            q: (Math.random()).toFixed(4),
            T: Date.now(),
            m: i % 2 === 0
          }
        };
        
        this.emit('message', { data: JSON.stringify(message) });
      }
      
      bursts++;
      if (bursts < burstCount) {
        setTimeout(sendBurst, burstIntervalMs);
      }
    };
    
    sendBurst();
  }
  
  simulateRandomMessages(totalCount: number, maxIntervalMs: number = 10) {
    let sent = 0;
    
    const sendRandomMessage = () => {
      if (sent >= totalCount) return;
      
      const symbols = ['BTC', 'ETH', 'BNB', 'ADA', 'DOT'];
      const events = ['trade', '24hrTicker', 'kline'];
      const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
      const randomEvent = events[Math.floor(Math.random() * events.length)];
      
      let message: any = {
        stream: `${randomSymbol.toLowerCase()}usdt@${randomEvent}`,
        data: {
          e: randomEvent,
          E: Date.now(),
          s: `${randomSymbol}USDT`
        }
      };
      
      // Add event-specific fields
      if (randomEvent === 'trade') {
        message.data = {
          ...message.data,
          t: sent + 1,
          p: (Math.random() * 100000).toFixed(2),
          q: (Math.random()).toFixed(4),
          T: Date.now(),
          m: Math.random() > 0.5
        };
      } else if (randomEvent === '24hrTicker') {
        message.data = {
          ...message.data,
          c: (Math.random() * 100000).toFixed(2),
          b: (Math.random() * 100000).toFixed(2),
          a: (Math.random() * 100000).toFixed(2),
          P: (Math.random() * 10 - 5).toFixed(2),
          v: (Math.random() * 10000).toFixed(2),
          h: (Math.random() * 100000).toFixed(2),
          l: (Math.random() * 100000).toFixed(2)
        };
      }
      
      this.emit('message', { data: JSON.stringify(message) });
      sent++;
      
      if (sent < totalCount) {
        const nextInterval = Math.random() * maxIntervalMs;
        setTimeout(sendRandomMessage, nextInterval);
      }
    };
    
    sendRandomMessage();
  }
  
  getMessageCount() {
    return this._messageCount;
  }
  
  getUptime() {
    return Date.now() - this._startTime;
  }
}

(global as any).WebSocket = PerformanceWebSocket;

describe('性能和稳定性测试', () => {
  let adapter: BinanceAdapter;
  let mockConfig: BinanceConfig;

  beforeEach(() => {
    mockConfig = {
      exchange: 'binance',
      endpoints: {
        ws: 'wss://stream.binance.com:9443/ws',
        rest: 'https://api.binance.com/api'
      },
      connection: {
        timeout: 10000,
        maxRetries: 5,
        retryInterval: 1000,
        heartbeatInterval: 30000
      },
      binance: {
        testnet: false,
        enableCompression: false,
        autoManageStreams: true
      }
    };

    adapter = new BinanceAdapter();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.destroy();
    }
  });

  describe('消息处理性能测试', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
      
      // 订阅多个数据流
      await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER]
      });
    });

    it('应该高效处理高频消息流', async () => {
      const messageCount = 10000;
      const receivedMessages: any[] = [];
      const processingTimes: number[] = [];

      adapter.on('data', (data) => {
        const processingTime = Date.now() - data.timestamp;
        processingTimes.push(processingTime);
        receivedMessages.push(data);
      });

      const connectionManager = (adapter as any).connectionManager;
      const ws = connectionManager.ws as PerformanceWebSocket;

      const startTime = Date.now();
      ws.simulateHighFrequencyMessages(messageCount, 1);

      // 等待所有消息处理完成
      await new Promise(resolve => {
        const checkCompletion = () => {
          if (receivedMessages.length >= messageCount) {
            resolve(undefined);
          } else {
            setTimeout(checkCompletion, 100);
          }
        };
        checkCompletion();
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // 性能断言
      expect(receivedMessages).toHaveLength(messageCount);
      expect(totalTime).toBeLessThan(30000); // 30秒内处理完10000条消息
      
      // 计算平均处理时间
      const avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
      expect(avgProcessingTime).toBeLessThan(10); // 平均处理时间小于10ms
      
      // 计算吞吐量
      const messagesPerSecond = messageCount / (totalTime / 1000);
      expect(messagesPerSecond).toBeGreaterThan(500); // 每秒处理超过500条消息
      
      console.log(`Performance metrics:
        - Total messages: ${messageCount}
        - Total time: ${totalTime}ms
        - Messages per second: ${messagesPerSecond.toFixed(2)}
        - Average processing time: ${avgProcessingTime.toFixed(2)}ms
        - Max processing time: ${Math.max(...processingTimes)}ms
        - Min processing time: ${Math.min(...processingTimes)}ms`);
    }, 60000);

    it('应该有效处理消息突发', async () => {
      const burstSize = 100;
      const burstCount = 20;
      const totalMessages = burstSize * burstCount;
      
      const receivedMessages: any[] = [];
      const burstTimestamps: number[] = [];

      adapter.on('data', (data) => {
        receivedMessages.push(data);
        
        // 记录每个突发的处理时间
        if (receivedMessages.length % burstSize === 0) {
          burstTimestamps.push(Date.now());
        }
      });

      const connectionManager = (adapter as any).connectionManager;
      const ws = connectionManager.ws as PerformanceWebSocket;

      const startTime = Date.now();
      ws.simulateBurstMessages(burstSize, burstCount, 200);

      // 等待所有突发处理完成
      await new Promise(resolve => {
        const checkCompletion = () => {
          if (receivedMessages.length >= totalMessages) {
            resolve(undefined);
          } else {
            setTimeout(checkCompletion, 100);
          }
        };
        checkCompletion();
      });

      const endTime = Date.now();

      expect(receivedMessages).toHaveLength(totalMessages);
      
      // 验证突发处理的稳定性
      const burstProcessingTimes = burstTimestamps.map((timestamp, index) => 
        index === 0 ? 0 : timestamp - burstTimestamps[index - 1]
      ).slice(1);

      const avgBurstInterval = burstProcessingTimes.reduce((a, b) => a + b, 0) / burstProcessingTimes.length;
      const burstVariance = burstProcessingTimes.reduce((acc, time) => 
        acc + Math.pow(time - avgBurstInterval, 2), 0) / burstProcessingTimes.length;

      console.log(`Burst performance metrics:
        - Burst size: ${burstSize}
        - Burst count: ${burstCount}
        - Average burst interval: ${avgBurstInterval.toFixed(2)}ms
        - Burst processing variance: ${burstVariance.toFixed(2)}
        - Total processing time: ${endTime - startTime}ms`);

      // 突发处理应该相对稳定
      expect(Math.sqrt(burstVariance)).toBeLessThan(avgBurstInterval * 0.5);
    }, 30000);

    it('应该保持随机消息流的处理稳定性', async () => {
      const messageCount = 5000;
      const receivedMessages: any[] = [];
      const processingLatencies: number[] = [];

      adapter.on('data', (data) => {
        const latency = Date.now() - data.receivedAt;
        processingLatencies.push(latency);
        receivedMessages.push(data);
      });

      const connectionManager = (adapter as any).connectionManager;
      const ws = connectionManager.ws as PerformanceWebSocket;

      const startTime = Date.now();
      ws.simulateRandomMessages(messageCount, 20);

      // 等待处理完成
      await new Promise(resolve => {
        const checkCompletion = () => {
          if (receivedMessages.length >= messageCount) {
            resolve(undefined);
          } else {
            setTimeout(checkCompletion, 100);
          }
        };
        checkCompletion();
      });

      const endTime = Date.now();

      expect(receivedMessages).toHaveLength(messageCount);

      // 分析延迟分布
      const sortedLatencies = processingLatencies.sort((a, b) => a - b);
      const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)];
      const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
      const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)];

      console.log(`Random message latency metrics:
        - P50 latency: ${p50}ms
        - P95 latency: ${p95}ms
        - P99 latency: ${p99}ms
        - Max latency: ${Math.max(...processingLatencies)}ms
        - Total processing time: ${endTime - startTime}ms`);

      expect(p95).toBeLessThan(50); // 95%的消息延迟小于50ms
      expect(p99).toBeLessThan(100); // 99%的消息延迟小于100ms
    }, 45000);
  });

  describe('内存使用测试', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
    });

    it('应该在长时间运行中保持稳定的内存使用', async () => {
      const symbols = Array.from({ length: 50 }, (_, i) => `SYMBOL${i}/USDT`);
      await adapter.subscribe({
        symbols,
        dataTypes: [DataType.TRADE, DataType.TICKER]
      });

      // 记录初始内存使用
      global.gc && global.gc();
      const initialMemory = process.memoryUsage();

      // 模拟长时间运行，处理大量消息
      const connectionManager = (adapter as any).connectionManager;
      const ws = connectionManager.ws as PerformanceWebSocket;

      let processedMessages = 0;
      adapter.on('data', () => {
        processedMessages++;
      });

      // 分批发送消息，模拟长时间运行
      for (let batch = 0; batch < 20; batch++) {
        ws.simulateHighFrequencyMessages(500, 1);
        
        // 等待该批次处理完成
        await new Promise(resolve => {
          const batchStart = processedMessages;
          const checkBatch = () => {
            if (processedMessages >= batchStart + 500) {
              resolve(undefined);
            } else {
              setTimeout(checkBatch, 50);
            }
          };
          checkBatch();
        });

        // 每5个批次检查一次内存
        if (batch % 5 === 4) {
          global.gc && global.gc();
          const currentMemory = process.memoryUsage();
          const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
          
          console.log(`Memory check after batch ${batch + 1}:
            - Heap used: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
            - Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB
            - Messages processed: ${processedMessages}`);

          // 内存增长应该在合理范围内
          expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // 小于100MB
        }
      }

      expect(processedMessages).toBe(10000);
    }, 120000);

    it('应该正确清理取消订阅后的资源', async () => {
      // 创建大量订阅
      const symbols = Array.from({ length: 100 }, (_, i) => `SYMBOL${i}/USDT`);
      const subscriptions = await adapter.subscribe({
        symbols,
        dataTypes: [DataType.TRADE, DataType.TICKER, DataType.KLINE_1M]
      });

      expect(subscriptions).toHaveLength(300);

      // 记录订阅后的内存
      global.gc && global.gc();
      const subscribeMemory = process.memoryUsage();

      // 逐批取消订阅
      const batchSize = 30;
      for (let i = 0; i < subscriptions.length; i += batchSize) {
        const batch = subscriptions.slice(i, i + batchSize);
        await adapter.unsubscribe(batch.map(sub => sub.id));

        // 验证订阅数量正确减少
        const remaining = adapter.getSubscriptions();
        expect(remaining).toHaveLength(subscriptions.length - i - batch.length);
      }

      // 验证所有订阅都被清理
      expect(adapter.getSubscriptions()).toHaveLength(0);
      expect((adapter as any).streamMap.size).toBe(0);

      // 检查内存是否被正确回收
      global.gc && global.gc();
      const finalMemory = process.memoryUsage();
      const memoryDiff = finalMemory.heapUsed - subscribeMemory.heapUsed;

      console.log(`Memory cleanup test:
        - Memory after subscribe: ${(subscribeMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        - Memory after unsubscribe: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        - Memory difference: ${(memoryDiff / 1024 / 1024).toFixed(2)}MB`);

      // 内存应该没有显著增长（考虑到GC可能不是立即的）
      expect(Math.abs(memoryDiff)).toBeLessThan(50 * 1024 * 1024); // 小于50MB差异
    }, 60000);
  });

  describe('连接稳定性测试', () => {
    it('应该在长时间连接中保持稳定', async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();

      let connectionEvents = 0;
      let errorEvents = 0;
      let dataEvents = 0;

      adapter.on('connected', () => connectionEvents++);
      adapter.on('error', () => errorEvents++);
      adapter.on('data', () => dataEvents++);

      await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      const connectionManager = (adapter as any).connectionManager;
      const ws = connectionManager.ws as PerformanceWebSocket;

      // 模拟长时间稳定运行
      const testDuration = 30000; // 30秒
      const startTime = Date.now();

      const messageInterval = setInterval(() => {
        if (Date.now() - startTime < testDuration) {
          ws.simulateHighFrequencyMessages(100, 2);
        } else {
          clearInterval(messageInterval);
        }
      }, 1000);

      // 等待测试完成
      await new Promise(resolve => setTimeout(resolve, testDuration + 2000));

      // 验证连接保持稳定
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      expect(connectionManager.isConnected()).toBe(true);
      
      // 应该收到大量数据但没有错误
      expect(dataEvents).toBeGreaterThan(1000);
      expect(errorEvents).toBe(0);
      
      console.log(`Stability test results:
        - Test duration: ${testDuration}ms
        - Connection events: ${connectionEvents}
        - Error events: ${errorEvents}
        - Data events: ${dataEvents}
        - Final status: ${adapter.getStatus()}`);
    }, 45000);

    it('应该正确处理连接状态变化的性能影响', async () => {
      const performanceMetrics: {
        operation: string;
        duration: number;
        timestamp: number;
      }[] = [];

      const measureOperation = async (name: string, operation: () => Promise<void>) => {
        const start = Date.now();
        await operation();
        const duration = Date.now() - start;
        performanceMetrics.push({
          operation: name,
          duration,
          timestamp: start
        });
        return duration;
      };

      // 测试各种操作的性能
      const initTime = await measureOperation('initialize', () => adapter.initialize(mockConfig));
      const connectTime = await measureOperation('connect', () => adapter.connect());
      const subscribeTime = await measureOperation('subscribe', () => adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER]
      }));
      const disconnectTime = await measureOperation('disconnect', () => adapter.disconnect());
      const reconnectTime = await measureOperation('reconnect', () => adapter.connect());

      // 性能断言
      expect(initTime).toBeLessThan(1000); // 初始化应该在1秒内完成
      expect(connectTime).toBeLessThan(2000); // 连接应该在2秒内完成
      expect(subscribeTime).toBeLessThan(1000); // 订阅应该在1秒内完成
      expect(disconnectTime).toBeLessThan(500); // 断开连接应该在0.5秒内完成
      expect(reconnectTime).toBeLessThan(2000); // 重连应该在2秒内完成

      console.log('Operation performance:');
      performanceMetrics.forEach(metric => {
        console.log(`  - ${metric.operation}: ${metric.duration}ms`);
      });

      // 清理
      await adapter.disconnect();
    }, 15000);
  });

  describe('并发性能测试', () => {
    it('应该高效处理并发订阅操作', async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();

      const concurrentOperations = 50;
      const subscribePromises: Promise<any>[] = [];

      const startTime = Date.now();

      // 并发创建多个订阅
      for (let i = 0; i < concurrentOperations; i++) {
        subscribePromises.push(
          adapter.subscribe({
            symbols: [`SYMBOL${i}/USDT`],
            dataTypes: [DataType.TRADE]
          })
        );
      }

      const results = await Promise.all(subscribePromises);
      const endTime = Date.now();

      const duration = endTime - startTime;
      const operationsPerSecond = concurrentOperations / (duration / 1000);

      expect(results.flat()).toHaveLength(concurrentOperations);
      expect(duration).toBeLessThan(5000); // 5秒内完成50个并发订阅
      
      console.log(`Concurrent subscription performance:
        - Operations: ${concurrentOperations}
        - Duration: ${duration}ms
        - Operations per second: ${operationsPerSecond.toFixed(2)}`);

      // 验证所有订阅都正确创建
      const allSubscriptions = adapter.getSubscriptions();
      expect(allSubscriptions).toHaveLength(concurrentOperations);
    }, 15000);

    it('应该高效处理并发取消订阅操作', async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();

      // 先创建大量订阅
      const symbols = Array.from({ length: 100 }, (_, i) => `SYMBOL${i}/USDT`);
      const subscriptions = await adapter.subscribe({
        symbols,
        dataTypes: [DataType.TRADE]
      });

      expect(subscriptions).toHaveLength(100);

      // 并发取消所有订阅
      const batchSize = 10;
      const unsubscribePromises: Promise<void>[] = [];

      const startTime = Date.now();

      for (let i = 0; i < subscriptions.length; i += batchSize) {
        const batch = subscriptions.slice(i, i + batchSize);
        unsubscribePromises.push(
          adapter.unsubscribe(batch.map(sub => sub.id))
        );
      }

      await Promise.all(unsubscribePromises);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(3000); // 3秒内完成所有取消订阅

      // 验证所有订阅都被取消
      expect(adapter.getSubscriptions()).toHaveLength(0);
      expect((adapter as any).streamMap.size).toBe(0);

      console.log(`Concurrent unsubscription performance:
        - Subscriptions: ${subscriptions.length}
        - Batches: ${Math.ceil(subscriptions.length / batchSize)}
        - Duration: ${duration}ms`);
    }, 15000);
  });

  describe('资源效率测试', () => {
    it('应该高效使用CPU资源', async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();

      await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER]
      });

      const connectionManager = (adapter as any).connectionManager;
      const ws = connectionManager.ws as PerformanceWebSocket;

      let processedMessages = 0;
      adapter.on('data', () => {
        processedMessages++;
      });

      // 记录CPU使用情况的开始时间
      const startTime = process.hrtime.bigint();
      const startCpuUsage = process.cpuUsage();

      // 处理大量消息
      const messageCount = 5000;
      ws.simulateHighFrequencyMessages(messageCount, 1);

      // 等待处理完成
      await new Promise(resolve => {
        const checkCompletion = () => {
          if (processedMessages >= messageCount) {
            resolve(undefined);
          } else {
            setTimeout(checkCompletion, 50);
          }
        };
        checkCompletion();
      });

      // 计算CPU使用情况
      const endTime = process.hrtime.bigint();
      const endCpuUsage = process.cpuUsage(startCpuUsage);

      const wallTime = Number(endTime - startTime) / 1e6; // 转换为毫秒
      const cpuTime = (endCpuUsage.user + endCpuUsage.system) / 1000; // 转换为毫秒
      const cpuEfficiency = (cpuTime / wallTime) * 100;

      console.log(`CPU efficiency metrics:
        - Messages processed: ${processedMessages}
        - Wall time: ${wallTime.toFixed(2)}ms
        - CPU time: ${cpuTime.toFixed(2)}ms
        - CPU efficiency: ${cpuEfficiency.toFixed(2)}%
        - Messages per CPU ms: ${(processedMessages / cpuTime).toFixed(2)}`);

      expect(processedMessages).toBe(messageCount);
      expect(cpuEfficiency).toBeLessThan(80); // CPU使用率应该合理
    }, 30000);
  });
});

// 清理资源
afterAll(() => {
  globalCache.destroy();
});