/**
 * DataFlow性能基准测试
 */

import { DataFlowManager } from '../data-flow-manager';
import { StandardDataTransformer } from '../transformers/data-transformer';
import { BaseMonitor } from '@pixiu/shared-core';
import { performance } from 'perf_hooks';

// Mock dependencies
jest.mock('@pixiu/shared-core');

describe('DataFlow Performance Tests', () => {
  let dataFlowManager: DataFlowManager;
  let mockMonitor: jest.Mocked<BaseMonitor>;

  beforeEach(async () => {
    mockMonitor = {
      log: jest.fn(),
      registerHealthCheck: jest.fn(),
      registerMetric: jest.fn(),
      updateMetric: jest.fn(),
      observeHistogram: jest.fn()
    } as any;

    dataFlowManager = new DataFlowManager();
    
    const config = {
      enabled: true,
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
      },
      monitoring: {
        enableMetrics: true,
        metricsInterval: 1000,
        enableLatencyTracking: true
      },
      errorHandling: {
        retryCount: 3,
        retryDelay: 100,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 10
      }
    };

    await dataFlowManager.initialize(config, mockMonitor);
    dataFlowManager.start();
  });

  afterEach(async () => {
    if (dataFlowManager) {
      await dataFlowManager.stop();
    }
  });

  describe('throughput benchmarks', () => {
    it('should handle 1000 messages/second', async () => {
      const mockChannel = createMockChannel();
      const rule = createCatchAllRule(['test-channel']);
      
      dataFlowManager.registerChannel(mockChannel);
      dataFlowManager.addRoutingRule(rule);

      const messageCount = 1000;
      const testDuration = 1000; // 1 second
      const messages = generateTestMessages(messageCount);
      
      const startTime = performance.now();
      
      // Send all messages as quickly as possible
      const promises = messages.map(message => 
        dataFlowManager.processData(message)
      );
      
      await Promise.all(promises);
      
      // Wait for processing to complete
      await waitForProcessing(2000);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const messagesPerSecond = (messageCount / duration) * 1000;
      
      console.log(`Processed ${messageCount} messages in ${duration.toFixed(2)}ms`);
      console.log(`Throughput: ${messagesPerSecond.toFixed(2)} messages/second`);
      
      // Should process at least 500 messages per second
      expect(messagesPerSecond).toBeGreaterThan(500);
      expect(mockChannel.output).toHaveBeenCalledTimes(messageCount);
    }, 10000);

    it('should handle burst traffic', async () => {
      const mockChannel = createMockChannel();
      const rule = createCatchAllRule(['test-channel']);
      
      dataFlowManager.registerChannel(mockChannel);
      dataFlowManager.addRoutingRule(rule);

      // Send bursts of messages
      const burstSize = 100;
      const burstCount = 5;
      const burstInterval = 200; // ms between bursts
      
      let totalMessages = 0;
      const startTime = performance.now();
      
      for (let burst = 0; burst < burstCount; burst++) {
        const messages = generateTestMessages(burstSize);
        
        const promises = messages.map(message => 
          dataFlowManager.processData(message)
        );
        
        await Promise.all(promises);
        totalMessages += burstSize;
        
        if (burst < burstCount - 1) {
          await new Promise(resolve => setTimeout(resolve, burstInterval));
        }
      }
      
      // Wait for all processing to complete
      await waitForProcessing(3000);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`Processed ${totalMessages} messages in ${burstCount} bursts`);
      console.log(`Total duration: ${duration.toFixed(2)}ms`);
      
      expect(mockChannel.output).toHaveBeenCalledTimes(totalMessages);
      
      const stats = dataFlowManager.getStats();
      expect(stats.totalProcessed).toBe(totalMessages);
    }, 15000);
  });

  describe('latency benchmarks', () => {
    it('should maintain low latency under load', async () => {
      const mockChannel = createMockChannel();
      const rule = createCatchAllRule(['test-channel']);
      
      dataFlowManager.registerChannel(mockChannel);
      dataFlowManager.addRoutingRule(rule);

      const messageCount = 100;
      const latencies: number[] = [];
      
      for (let i = 0; i < messageCount; i++) {
        const message = {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: 'trade',
          timestamp: Date.now(),
          receivedAt: Date.now(),
          data: {
            price: 50000 + Math.random() * 1000,
            quantity: Math.random() * 0.1,
            side: Math.random() > 0.5 ? 'buy' : 'sell'
          }
        };
        
        const startTime = performance.now();
        await dataFlowManager.processData(message);
        const endTime = performance.now();
        
        latencies.push(endTime - startTime);
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      await waitForProcessing(1000);
      
      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const p95Latency = calculatePercentile(latencies, 95);
      
      console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`Max latency: ${maxLatency.toFixed(2)}ms`);
      console.log(`95th percentile latency: ${p95Latency.toFixed(2)}ms`);
      
      // Performance requirements
      expect(avgLatency).toBeLessThan(50); // Average < 50ms
      expect(p95Latency).toBeLessThan(100); // P95 < 100ms
      expect(maxLatency).toBeLessThan(200); // Max < 200ms
    }, 10000);
  });

  describe('memory usage tests', () => {
    it('should not leak memory under sustained load', async () => {
      const mockChannel = createMockChannel();
      const rule = createCatchAllRule(['test-channel']);
      
      dataFlowManager.registerChannel(mockChannel);
      dataFlowManager.addRoutingRule(rule);

      const initialMemory = process.memoryUsage();
      
      // Process messages for a period of time
      const duration = 5000; // 5 seconds
      const interval = 10; // 10ms between messages
      const startTime = Date.now();
      
      const sendMessages = async () => {
        while (Date.now() - startTime < duration) {
          const message = generateRandomMessage();
          await dataFlowManager.processData(message);
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      };
      
      await sendMessages();
      await waitForProcessing(1000);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);
      
      console.log(`Initial memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Final memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Memory growth: ${memoryGrowthMB.toFixed(2)}MB`);
      
      // Memory growth should be reasonable (less than 50MB for this test)
      expect(memoryGrowthMB).toBeLessThan(50);
    }, 15000);
  });

  describe('backpressure handling', () => {
    it('should handle backpressure gracefully', async () => {
      // Create a slower mock channel
      const slowMockChannel = {
        id: 'slow-channel',
        name: 'Slow Channel',
        type: 'custom' as const,
        enabled: true,
        output: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 50)) // 50ms delay
        ),
        close: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({
          id: 'slow-channel',
          name: 'Slow Channel',
          type: 'custom',
          enabled: true,
          connected: true,
          messagesSent: 0,
          errors: 0,
          lastActivity: Date.now(),
          health: 'healthy' as const
        })
      };

      const rule = createCatchAllRule(['slow-channel']);
      
      dataFlowManager.registerChannel(slowMockChannel);
      dataFlowManager.addRoutingRule(rule);

      let backpressureActivated = false;
      dataFlowManager.on('backpressureActivated', () => {
        backpressureActivated = true;
      });

      // Send many messages quickly to trigger backpressure
      const messageCount = 200;
      const messages = generateTestMessages(messageCount);
      
      const promises = messages.map(message => 
        dataFlowManager.processData(message).catch(() => {
          // Ignore errors from backpressure
        })
      );
      
      await Promise.allSettled(promises);
      
      expect(backpressureActivated).toBe(true);
      
      // Wait for queue to drain
      await waitForProcessing(10000);
      
      const stats = dataFlowManager.getStats();
      console.log(`Final queue size: ${stats.currentQueueSize}`);
      console.log(`Messages processed: ${stats.totalProcessed}`);
      console.log(`Messages sent: ${stats.totalSent}`);
      
      // Queue should eventually drain
      expect(stats.currentQueueSize).toBeLessThan(50);
    }, 20000);
  });
});

// Helper functions
function createMockChannel() {
  return {
    id: 'test-channel',
    name: 'Test Channel',
    type: 'custom' as const,
    enabled: true,
    output: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue({
      id: 'test-channel',
      name: 'Test Channel',
      type: 'custom',
      enabled: true,
      connected: true,
      messagesSent: 0,
      errors: 0,
      lastActivity: Date.now(),
      health: 'healthy' as const
    })
  };
}

function createCatchAllRule(channels: string[]) {
  return {
    name: 'catch-all',
    condition: () => true,
    targetChannels: channels,
    enabled: true,
    priority: 1
  };
}

function generateTestMessages(count: number) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push(generateRandomMessage());
  }
  return messages;
}

function generateRandomMessage() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT'];
  const types = ['trade', 'ticker', 'depth'];
  
  return {
    exchange: 'binance',
    symbol: symbols[Math.floor(Math.random() * symbols.length)],
    type: types[Math.floor(Math.random() * types.length)],
    timestamp: Date.now(),
    receivedAt: Date.now(),
    data: {
      price: 50000 + Math.random() * 10000,
      quantity: Math.random() * 0.1,
      side: Math.random() > 0.5 ? 'buy' : 'sell'
    }
  };
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

function waitForProcessing(timeout: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, timeout));
}

afterAll(() => {
  jest.clearAllMocks();
});