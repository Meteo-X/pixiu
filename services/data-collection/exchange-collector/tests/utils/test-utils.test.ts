/**
 * TestUtils 测试
 * 验证测试工具函数的正确性
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { globalCache } from '@pixiu/shared-core';
import { TestUtils, TestTimeoutError } from './test-utils';

describe('TestUtils', () => {
  afterAll(async () => {
    await globalCache.destroy();
  });

  describe('waitFor', () => {
    it('should resolve when condition becomes true', async () => {
      let counter = 0;
      const condition = () => {
        counter++;
        return counter >= 3;
      };

      const startTime = Date.now();
      await TestUtils.waitFor(condition, 1000, 10);
      const endTime = Date.now();

      expect(counter).toBeGreaterThanOrEqual(3);
      expect(endTime - startTime).toBeLessThan(200); // Should be quick
    });

    it('should timeout when condition never becomes true', async () => {
      const condition = () => false;

      await expect(
        TestUtils.waitFor(condition, 100, 10)
      ).rejects.toThrow(TestTimeoutError);
    });

    it('should work with async conditions', async () => {
      let value = 0;
      const asyncCondition = async () => {
        await TestUtils.sleep(10);
        value++;
        return value >= 3;
      };

      await TestUtils.waitFor(asyncCondition, 1000, 50);
      expect(value).toBeGreaterThanOrEqual(3);
    });
  });

  describe('waitForEvent', () => {
    it('should resolve when event is emitted', async () => {
      const emitter = new EventEmitter();
      const testData = { message: 'test event' };

      // 异步触发事件
      setTimeout(() => {
        emitter.emit('test-event', testData);
      }, 50);

      const result = await TestUtils.waitForEvent(emitter, 'test-event', 1000);
      expect(result).toEqual(testData);
    });

    it('should timeout when event is not emitted', async () => {
      const emitter = new EventEmitter();

      await expect(
        TestUtils.waitForEvent(emitter, 'non-existent-event', 100)
      ).rejects.toThrow(TestTimeoutError);
    });
  });

  describe('sleep', () => {
    it('should delay execution for specified time', async () => {
      const startTime = Date.now();
      await TestUtils.sleep(100);
      const endTime = Date.now();

      const actualDelay = endTime - startTime;
      expect(actualDelay).toBeGreaterThanOrEqual(90); // Allow some variance
      expect(actualDelay).toBeLessThan(150);
    });
  });

  describe('createMarketData', () => {
    it('should create valid market data with defaults', () => {
      const data = TestUtils.createMarketData();

      expect(data.exchange).toBe('binance');
      expect(data.symbol).toBe('BTCUSDT');
      expect(data.timestamp).toBeDefined();
      expect(data.data).toBeDefined();
      expect(data.data.price).toBeDefined();
    });

    it('should accept overrides', () => {
      const overrides = {
        symbol: 'ETHUSDT',
        exchange: 'okex',
        data: {
          price: '3000.00',
          custom: 'value'
        }
      };

      const data = TestUtils.createMarketData(overrides);

      expect(data.symbol).toBe('ETHUSDT');
      expect(data.exchange).toBe('okex');
      expect(data.data.price).toBe('3000.00');
      expect((data.data as any).custom).toBe('value');
    });
  });

  describe('testPerformance', () => {
    it('should measure operation performance', async () => {
      const testOperation = () => {
        // 模拟一些工作
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      };

      const result = await TestUtils.testPerformance(
        testOperation,
        100, // 100 iterations
        10   // 10 warmup iterations
      );

      expect(result.duration).toBeGreaterThan(0);
      expect(result.averageLatency).toBeGreaterThan(0);
      expect(result.minLatency).toBeGreaterThanOrEqual(0);
      expect(result.maxLatency).toBeGreaterThanOrEqual(result.minLatency);
      expect(result.throughput).toBeGreaterThan(0);
      expect(result.memoryUsage).toBeDefined();
    });

    it('should handle async operations', async () => {
      const asyncOperation = async () => {
        await TestUtils.sleep(1);
        return 'completed';
      };

      const result = await TestUtils.testPerformance(
        asyncOperation,
        10,
        2
      );

      expect(result.averageLatency).toBeGreaterThan(1); // At least 1ms per operation
      expect(result.throughput).toBeLessThan(1000); // Less than 1000 ops/sec due to sleep
    });
  });

  describe('testConcurrency', () => {
    it('should test concurrent operations', async () => {
      let connectionCount = 0;
      
      const createConnection = async () => {
        await TestUtils.sleep(Math.random() * 10);
        connectionCount++;
      };

      const result = await TestUtils.testConcurrency(
        createConnection,
        20, // 20 connections total
        5   // 5 concurrent
      );

      expect(result.totalConnections).toBe(20);
      expect(result.successfulConnections).toBe(20);
      expect(result.failedConnections).toBe(0);
      expect(result.averageConnectionTime).toBeGreaterThan(0);
      expect(result.peakMemoryUsage).toBeGreaterThan(0);
      expect(connectionCount).toBe(20);
    });

    it('should handle connection failures', async () => {
      let attempts = 0;
      
      const faultyConnection = async () => {
        attempts++;
        if (attempts % 3 === 0) {
          throw new Error('Connection failed');
        }
        await TestUtils.sleep(1);
      };

      const result = await TestUtils.testConcurrency(
        faultyConnection,
        9, // 9 connections total
        3  // 3 concurrent
      );

      expect(result.totalConnections).toBe(9);
      expect(result.successfulConnections).toBe(6); // 2/3 success rate
      expect(result.failedConnections).toBe(3);
      expect(result.averageConnectionTime).toBeGreaterThan(0);
    });
  });

  describe('createHighFrequencyDataStream', () => {
    it('should generate high frequency data stream', async () => {
      const messages: any[] = [];
      const stream = TestUtils.createHighFrequencyDataStream(
        200,  // 200ms duration
        100,  // 100 msg/sec target
        ['BTCUSDT', 'ETHUSDT']
      );

      for await (const data of stream) {
        messages.push(data);
      }

      expect(messages.length).toBeGreaterThan(15); // Should get around 20 messages
      expect(messages.length).toBeLessThan(30);
      
      // Check data variety
      const symbols = [...new Set(messages.map(m => m.symbol))];
      expect(symbols.length).toBe(2);
      expect(symbols).toContain('BTCUSDT');
      expect(symbols).toContain('ETHUSDT');
    });
  });

  describe('simulateNetworkLatency', () => {
    it('should introduce random delay', async () => {
      const startTime = Date.now();
      await TestUtils.simulateNetworkLatency(10, 50);
      const endTime = Date.now();

      const delay = endTime - startTime;
      expect(delay).toBeGreaterThanOrEqual(8); // Allow some variance
      expect(delay).toBeLessThan(60);
    });
  });

  describe('simulateNetworkError', () => {
    it('should return true at specified error rate', () => {
      let errorCount = 0;
      const iterations = 1000;
      const errorRate = 0.1; // 10%

      for (let i = 0; i < iterations; i++) {
        if (TestUtils.simulateNetworkError(errorRate)) {
          errorCount++;
        }
      }

      const actualErrorRate = errorCount / iterations;
      expect(actualErrorRate).toBeGreaterThan(0.05); // At least 5%
      expect(actualErrorRate).toBeLessThan(0.15);    // At most 15%
    });

    it('should return false when error rate is 0', () => {
      for (let i = 0; i < 100; i++) {
        expect(TestUtils.simulateNetworkError(0)).toBe(false);
      }
    });

    it('should return true when error rate is 1', () => {
      for (let i = 0; i < 100; i++) {
        expect(TestUtils.simulateNetworkError(1)).toBe(true);
      }
    });
  });

  describe('formatPerformanceResult', () => {
    it('should format performance results correctly', () => {
      const result = {
        duration: 1234.56,
        averageLatency: 12.34,
        minLatency: 5.67,
        maxLatency: 25.89,
        throughput: 810.45,
        memoryUsage: {
          rss: 1024 * 1024 * 10,    // 10MB
          heapTotal: 1024 * 1024 * 8,
          heapUsed: 1024 * 1024 * 6, // 6MB
          external: 1024 * 1024 * 1,
          arrayBuffers: 1024 * 100
        }
      };

      const formatted = TestUtils.formatPerformanceResult(result);

      expect(formatted).toContain('1234.56ms');
      expect(formatted).toContain('12.34ms');
      expect(formatted).toContain('810.45 ops/sec');
      expect(formatted).toContain('6.00MB');
    });
  });

  describe('validateTestEnvironment', () => {
    it('should validate test environment', () => {
      const validation = TestUtils.validateTestEnvironment();

      expect(validation).toHaveProperty('isValid');
      expect(validation).toHaveProperty('issues');
      expect(validation).toHaveProperty('recommendations');
      expect(Array.isArray(validation.issues)).toBe(true);
      expect(Array.isArray(validation.recommendations)).toBe(true);
    });
  });

  describe('runStressTest', () => {
    it('should run stress test correctly', async () => {
      let operationCount = 0;
      
      const operation = async () => {
        operationCount++;
        await TestUtils.sleep(1);
        
        // Simulate occasional failure
        if (operationCount % 20 === 0) {
          throw new Error('Simulated error');
        }
      };

      const result = await TestUtils.runStressTest(operation, {
        durationMs: 200,
        targetThroughput: 50 // 50 ops/sec
      });

      expect(result.totalOperations).toBeGreaterThan(5);
      expect(result.successfulOperations).toBeGreaterThan(0);
      expect(result.failedOperations).toBeGreaterThanOrEqual(0);
      expect(result.throughput).toBeGreaterThan(0);
      expect(result.averageLatency).toBeGreaterThan(0);
      
      if (result.failedOperations > 0) {
        expect(result.errorsPerSecond).toBeGreaterThan(0);
      }
    });
  });
});