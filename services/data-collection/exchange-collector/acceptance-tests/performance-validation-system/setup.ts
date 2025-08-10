/**
 * 性能验证测试系统全局设置
 * 配置测试环境、性能监控、基线数据管理
 */

import { performance } from 'perf_hooks';
import { globalCache } from '@pixiu/shared-core';
import * as fs from 'fs-extra';
import * as path from 'path';

// 性能目标常量
export const PERFORMANCE_GOALS = {
  // 内存使用减少30% (从120MB → 78MB)
  MEMORY: {
    BASELINE_MB: 120,
    TARGET_MB: 78,
    REDUCTION_PERCENT: 30
  },
  
  // 吞吐量提升20% (从800 → 1500+ msg/sec)
  THROUGHPUT: {
    BASELINE_MSG_SEC: 800,
    TARGET_MSG_SEC: 1500,
    IMPROVEMENT_PERCENT: 87.5 // 实际目标更高
  },
  
  // 延迟降低15% (从45ms → 25ms)
  LATENCY: {
    BASELINE_MS: 45,
    TARGET_MS: 25,
    REDUCTION_PERCENT: 44.4 // 实际目标更高
  },
  
  // WebSocket延迟 <10ms (实际6.8ms)
  WEBSOCKET_LATENCY: {
    TARGET_MS: 10,
    ACTUAL_MS: 6.8
  },
  
  // 并发连接数
  CONCURRENT_CONNECTIONS: {
    TARGET: 1000
  }
};

// 测试环境配置
export const TEST_CONFIG = {
  // 测试持续时间
  TEST_DURATION: {
    SHORT: 30 * 1000,      // 30秒
    MEDIUM: 5 * 60 * 1000,  // 5分钟
    LONG: 30 * 60 * 1000,   // 30分钟
    STABILITY: 2 * 60 * 60 * 1000 // 2小时
  },
  
  // 采样间隔
  SAMPLING_INTERVAL: {
    HIGH_FREQUENCY: 100,    // 100ms
    NORMAL: 1000,          // 1s
    LOW_FREQUENCY: 5000    // 5s
  },
  
  // 报告目录
  REPORTS_DIR: path.join(__dirname, 'reports'),
  BASELINES_DIR: path.join(__dirname, 'reports', 'baselines'),
  BENCHMARKS_DIR: path.join(__dirname, 'reports', 'benchmarks'),
  
  // 测试服务器配置
  TEST_SERVER: {
    HOST: 'localhost',
    PORT: 8090,
    WS_PORT: 8091
  }
};

// 性能测试全局设置
declare global {
  var __PERFORMANCE_TEST_CONFIG__: {
    baselineData?: any;
    testStartTime: number;
    memoryBaseline: number;
    reportData: any[];
    context?: TestContext;
  };
}

// 全局测试上下文
export interface TestContext {
  testStartTime: number;
  testId: string;
  performanceMetrics: Map<string, any>;
  resourceMonitor: any;
  cleanup: (() => Promise<void>)[];
}

/**
 * 初始化测试环境
 */
export async function setupTestEnvironment(): Promise<TestContext> {
  const testId = `performance-test-${Date.now()}`;
  
  // 确保报告目录存在
  await fs.ensureDir(TEST_CONFIG.REPORTS_DIR);
  await fs.ensureDir(TEST_CONFIG.BASELINES_DIR);
  await fs.ensureDir(TEST_CONFIG.BENCHMARKS_DIR);
  
  const context: TestContext = {
    testStartTime: performance.now(),
    testId,
    performanceMetrics: new Map(),
    resourceMonitor: null,
    cleanup: []
  };
  
  global.__PERFORMANCE_TEST_CONFIG__.context = context;
  performance.mark('test-start');
  
  return context;
}

/**
 * 清理测试环境
 */
export async function cleanupTestEnvironment(): Promise<void> {
  const context = global.__PERFORMANCE_TEST_CONFIG__.context;
  if (!context) return;
  
  performance.mark('test-end');
  performance.measure('total-test-time', 'test-start', 'test-end');
  
  // 执行所有清理函数
  for (const cleanupFn of context.cleanup) {
    try {
      await cleanupFn();
    } catch (error) {
      console.warn('清理函数执行失败:', error);
    }
  }
  
  global.__PERFORMANCE_TEST_CONFIG__.context = undefined;
}

/**
 * 获取当前测试上下文
 */
export function getTestContext(): TestContext {
  const context = global.__PERFORMANCE_TEST_CONFIG__.context;
  if (!context) {
    throw new Error('测试上下文未初始化，请先调用 setupTestEnvironment()');
  }
  return context;
}

/**
 * 记录性能指标
 */
export function recordMetric(name: string, value: any, metadata?: any): void {
  const context = getTestContext();
  const timestamp = performance.now();
  
  if (!context.performanceMetrics.has(name)) {
    context.performanceMetrics.set(name, []);
  }
  
  context.performanceMetrics.get(name).push({
    value,
    timestamp,
    metadata
  });
  
  // 同时记录到全局报告数据
  global.__PERFORMANCE_TEST_CONFIG__.reportData.push({
    timestamp: Date.now(),
    testName: expect.getState().currentTestName || 'unknown',
    metricName: name,
    value,
    metadata
  });
}

beforeAll(async () => {
  // 初始化全局性能测试配置
  global.__PERFORMANCE_TEST_CONFIG__ = {
    testStartTime: Date.now(),
    memoryBaseline: process.memoryUsage().heapUsed,
    reportData: []
  };

  // 确保目录存在
  await fs.ensureDir(TEST_CONFIG.REPORTS_DIR);
  await fs.ensureDir(TEST_CONFIG.BASELINES_DIR);
  await fs.ensureDir(TEST_CONFIG.BENCHMARKS_DIR);

  // 加载性能基线数据（如果存在）
  const baselinePath = path.join(TEST_CONFIG.BASELINES_DIR, 'performance-baseline.json');
  if (await fs.pathExists(baselinePath)) {
    try {
      const baselineData = await fs.readJSON(baselinePath);
      global.__PERFORMANCE_TEST_CONFIG__.baselineData = baselineData;
      console.log('✓ 已加载性能基线数据');
    } catch (error) {
      console.warn('⚠️ 加载性能基线数据失败:', error);
    }
  } else {
    console.log('ℹ️ 未找到性能基线数据，将创建新的基线');
  }

  // 设置性能监控
  if (typeof process.env.NODE_ENV === 'undefined') {
    process.env.NODE_ENV = 'test';
  }

  console.log('🚀 性能测试环境初始化完成');
});

afterAll(async () => {
  try {
    // 清理全局缓存
    if (globalCache && typeof globalCache.destroy === 'function') {
      await globalCache.destroy();
    }

    // 保存性能测试报告数据
    if (global.__PERFORMANCE_TEST_CONFIG__?.reportData?.length > 0) {
      const reportsDir = path.join(__dirname, 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const reportPath = path.join(reportsDir, `performance-test-data-${Date.now()}.json`);
      fs.writeFileSync(
        reportPath, 
        JSON.stringify(global.__PERFORMANCE_TEST_CONFIG__.reportData, null, 2)
      );
      console.log(`📊 性能测试数据已保存到: ${reportPath}`);
    }

    // 显示内存使用统计
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDiff = finalMemory - global.__PERFORMANCE_TEST_CONFIG__.memoryBaseline;
    console.log(`📈 内存使用变化: ${(memoryDiff / 1024 / 1024).toFixed(2)} MB`);

    console.log('✅ 性能测试环境清理完成');
  } catch (error) {
    console.error('❌ 性能测试环境清理失败:', error);
  }
});

// Jest配置增强
jest.setTimeout(120000); // 2分钟超时

// 自定义性能匹配器
expect.extend({
  toBeWithinPerformanceRange(received: number, expected: number, tolerance: number = 0.1) {
    const lowerBound = expected * (1 - tolerance);
    const upperBound = expected * (1 + tolerance);
    const pass = received >= lowerBound && received <= upperBound;
    
    return {
      message: () => 
        `Expected ${received} to be within ${(tolerance * 100)}% of ${expected} (${lowerBound.toFixed(2)} - ${upperBound.toFixed(2)})`,
      pass
    };
  },

  toBeFasterThan(received: number, expected: number) {
    const pass = received < expected;
    return {
      message: () => 
        `Expected ${received}ms to be faster than ${expected}ms`,
      pass
    };
  },

  toUseLessMemoryThan(received: number, expected: number) {
    const pass = received < expected;
    return {
      message: () => 
        `Expected ${(received / 1024 / 1024).toFixed(2)}MB to use less memory than ${(expected / 1024 / 1024).toFixed(2)}MB`,
      pass
    };
  },

  toHaveThroughputGreaterThan(received: number, expected: number) {
    const pass = received > expected;
    return {
      message: () => 
        `Expected throughput ${received} msg/sec to be greater than ${expected} msg/sec`,
      pass
    };
  }
});

// TypeScript类型扩展
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinPerformanceRange(expected: number, tolerance?: number): R;
      toBeFasterThan(expected: number): R;
      toUseLessMemoryThan(expected: number): R;
      toHaveThroughputGreaterThan(expected: number): R;
    }
  }
}

// 性能工具函数
export const performanceUtils = {
  // 记录性能指标
  recordMetric: (name: string, value: number, unit: string = 'ms') => {
    global.__PERFORMANCE_TEST_CONFIG__.reportData.push({
      timestamp: Date.now(),
      testName: expect.getState().currentTestName || 'unknown',
      metricName: name,
      value,
      unit
    });
  },

  // 测量执行时间
  measureTime: async <T>(fn: () => Promise<T> | T): Promise<{ result: T; duration: number }> => {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1_000_000; // 转换为毫秒
    return { result, duration };
  },

  // 获取内存使用情况
  getMemoryUsage: () => {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    };
  },

  // 强制垃圾回收（如果可用）
  forceGC: () => {
    if (global.gc) {
      global.gc();
    } else {
      console.warn('垃圾回收不可用，请使用 --expose-gc 参数运行测试');
    }
  },

  // 等待系统稳定
  waitForStability: async (duration: number = 1000) => {
    await new Promise(resolve => setTimeout(resolve, duration));
  }
};

export default performanceUtils;