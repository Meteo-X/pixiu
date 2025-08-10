/**
 * DataFlow集成测试套件全局设置
 */

import 'jest-extended';
import { GlobalCache } from '@pixiu/shared-core';

// 扩展Jest匹配器
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toHaveLatencyLessThan(received: any, expected: number) {
    const latency = received.latency || received.averageLatency || 0;
    const pass = latency < expected;
    
    if (pass) {
      return {
        message: () => `expected latency ${latency}ms not to be less than ${expected}ms`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected latency ${latency}ms to be less than ${expected}ms`,
        pass: false,
      };
    }
  },

  toHaveThroughputGreaterThan(received: any, expected: number) {
    const throughput = received.throughput || received.current || 0;
    const pass = throughput > expected;
    
    if (pass) {
      return {
        message: () => `expected throughput ${throughput} not to be greater than ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected throughput ${throughput} to be greater than ${expected}`,
        pass: false,
      };
    }
  }
});

// 声明自定义匹配器类型
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toHaveLatencyLessThan(expected: number): R;
      toHaveThroughputGreaterThan(expected: number): R;
    }
  }
}

// 全局测试配置
const TEST_CONFIG = {
  // 性能基准
  PERFORMANCE_THRESHOLDS: {
    MAX_LATENCY_MS: 50,
    MIN_THROUGHPUT: 1000,
    MAX_MEMORY_MB: 100,
    MAX_ERROR_RATE: 0.01
  },
  
  // 测试超时
  TIMEOUTS: {
    UNIT: 5000,
    INTEGRATION: 10000, 
    E2E: 30000,
    PERFORMANCE: 60000,
    STRESS: 120000
  },
  
  // 测试数据
  TEST_DATA: {
    BATCH_SIZES: [1, 10, 50, 100, 500],
    MESSAGE_COUNTS: [100, 500, 1000, 5000],
    CONCURRENT_STREAMS: [1, 5, 10, 20]
  },
  
  // Mock服务端口
  MOCK_PORTS: {
    WEBSOCKET: 18080,
    REDIS: 16379,
    PUBSUB_EMULATOR: 18085
  }
};

// 导出测试配置供测试使用
(global as any).TEST_CONFIG = TEST_CONFIG;

// 测试环境设置
beforeAll(() => {
  console.log('🚀 DataFlow集成测试套件启动');
  console.log('📋 测试配置:', JSON.stringify(TEST_CONFIG, null, 2));
  
  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // 减少测试期间的日志噪声
  process.env.PUBSUB_EMULATOR_HOST = `localhost:${TEST_CONFIG.MOCK_PORTS.PUBSUB_EMULATOR}`;
});

// 每个测试前的设置
beforeEach(() => {
  // 重置所有模拟
  jest.clearAllMocks();
  jest.resetAllMocks();
  
  // 重置时间模拟
  jest.useFakeTimers();
});

// 每个测试后的清理
afterEach(async () => {
  // 恢复真实时间
  jest.useRealTimers();
  
  // 清理任何未完成的异步操作
  await new Promise(resolve => setImmediate(resolve));
});

// 全局清理
afterAll(async () => {
  console.log('🧹 DataFlow集成测试套件清理');
  
  // 清理全局缓存
  try {
    const globalCache = GlobalCache.getInstance();
    await globalCache.destroy();
  } catch (error) {
    console.warn('清理全局缓存时出错:', error.message);
  }
  
  // 等待所有异步操作完成
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('✅ DataFlow集成测试套件完成');
});

// 未捕获异常处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未捕获的Promise拒绝:', reason);
  console.error('在Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

// 导出常用工具函数
export const testUtils = {
  /**
   * 等待指定时间
   */
  wait: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * 等待条件满足
   */
  waitFor: async (
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) {
        return;
      }
      await testUtils.wait(interval);
    }
    
    throw new Error(`等待条件超时 (${timeout}ms)`);
  },
  
  /**
   * 生成测试用的市场数据
   */
  generateMarketData: (overrides: any = {}) => ({
    exchange: 'binance',
    symbol: 'BTCUSDT',
    type: 'trade',
    timestamp: Date.now(),
    receivedAt: Date.now(),
    data: {
      price: 50000 + Math.random() * 1000,
      quantity: Math.random() * 0.1,
      side: Math.random() > 0.5 ? 'buy' : 'sell'
    },
    metadata: {},
    ...overrides
  }),
  
  /**
   * 生成批量测试数据
   */
  generateBulkMarketData: (count: number, overrides: any = []) => {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push(testUtils.generateMarketData({
        ...overrides[i] || {},
        timestamp: Date.now() + i // 确保时间戳递增
      }));
    }
    return data;
  },
  
  /**
   * 测量函数执行时间
   */
  measureTime: async <T>(fn: () => Promise<T> | T): Promise<{ result: T; duration: number }> => {
    const startTime = process.hrtime.bigint();
    const result = await fn();
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒
    
    return { result, duration };
  },
  
  /**
   * 创建性能统计
   */
  createPerformanceStats: (durations: number[]) => {
    const sorted = durations.slice().sort((a, b) => a - b);
    return {
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
};