/**
 * 测试环境设置 - 增强版 (使用@pixiu/test-utils基础配置)
 * 在每个测试文件运行后执行的设置
 */

import { setupTests } from '@pixiu/test-utils';
import { globalCache } from '@pixiu/shared-core';
import { setupGlobalWebSocketMock } from './mocks/websocket-mock';

// 使用test-utils进行基础设置，包括环境变量和控制台过滤
setupTests({
  timeout: 30000, // 适配器测试需要较长超时
  console: 'quiet',
  enablePubSubMock: false, // binance-adapter不需要PubSub
  enableWebSocketMock: false, // 使用自定义WebSocket Mock
  enableGlobalCacheCleanup: false, // 手动处理缓存清理
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    JEST_WORKER_ID: process.env.JEST_WORKER_ID || '1'
  }
});

// 设置全局WebSocket Mock（项目特定）
setupGlobalWebSocketMock({
  connectionDelay: 50,
  shouldFailConnection: false,
  shouldFailOnSend: false,
  autoRespondToPing: true,
  heartbeatInterval: 30000
});

// 清理函数在每个测试后执行
afterEach(async () => {
  // 清理全局缓存
  try {
    globalCache.destroy();
  } catch (error) {
    // 忽略清理错误
  }
  
  // 清理定时器
  jest.clearAllTimers();
  
  // 清理Mock
  jest.clearAllMocks();
  
  // 强制垃圾回收（如果可用）
  if (global.gc) {
    global.gc();
  }
});

// 全局清理函数
afterAll(async () => {
  // 最终清理全局缓存
  try {
    globalCache.destroy();
  } catch (error) {
    // 忽略清理错误
  }
  
  // 清理所有定时器
  jest.clearAllTimers();
  
  // 恢复所有Mock
  jest.restoreAllMocks();
  
  // 等待一小段时间让异步操作完成
  await new Promise(resolve => setTimeout(resolve, 100));
});

// 设置特定环境的测试配置
if (process.env.CI) {
  // CI环境特定配置
  jest.setTimeout(60000); // CI中给更长的超时时间
}

// 测试工具函数
(global as any).testUtils = {
  // 等待函数
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // 等待条件满足
  waitFor: async (condition: () => boolean, timeout = 5000, interval = 50) => {
    const startTime = Date.now();
    while (!condition()) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Condition not met within ${timeout}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  },
  
  // 获取内存使用情况
  getMemoryUsage: () => {
    if (global.gc) global.gc();
    return process.memoryUsage();
  },
  
  // 性能测量工具
  measurePerformance: async <T>(fn: () => Promise<T>) => {
    const startTime = Date.now();
    const startCpu = process.cpuUsage();
    const startMemory = process.memoryUsage();
    
    const result = await fn();
    
    const endTime = Date.now();
    const endCpu = process.cpuUsage(startCpu);
    const endMemory = process.memoryUsage();
    
    return {
      result,
      metrics: {
        duration: endTime - startTime,
        cpuUsage: {
          user: endCpu.user,
          system: endCpu.system
        },
        memoryDelta: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal
        }
      }
    };
  }
};

// 扩展全局类型
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        wait: (ms: number) => Promise<void>;
        waitFor: (condition: () => boolean, timeout?: number, interval?: number) => Promise<void>;
        getMemoryUsage: () => NodeJS.MemoryUsage;
        measurePerformance: <T>(fn: () => Promise<T>) => Promise<{
          result: T;
          metrics: {
            duration: number;
            cpuUsage: { user: number; system: number };
            memoryDelta: { heapUsed: number; heapTotal: number };
          };
        }>;
      };
    }
  }
}

// Mock axios（如果需要）
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} })
  })),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} })
}));


// 导出以使此文件成为模块
export {};