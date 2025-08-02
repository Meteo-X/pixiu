/**
 * Jest测试环境设置
 * 为Task 3.2配置系统重构验收测试提供全局设置和工具
 */

import { globalCache } from '@pixiu/shared-core';

// 全局测试配置
const TEST_CONFIG = {
  timeout: 30000,
  retries: 3,
  mockDelay: 100,
  maxMemoryUsage: 256 * 1024 * 1024, // 256MB
  enableDebugLogs: process.env.DEBUG_TESTS === 'true'
};

// 全局测试工具
global.TEST_CONFIG = TEST_CONFIG;

// 测试开始前的设置
beforeAll(async () => {
  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // 减少测试日志噪音
  
  console.log('🚀 开始Task 3.2配置系统重构验收测试');
  console.log(`📊 测试配置: ${JSON.stringify(TEST_CONFIG, null, 2)}`);
  
  // 记录测试开始时间
  global.testStartTime = Date.now();
});

// 每个测试用例前的设置
beforeEach(async () => {
  // 清理内存缓存
  if (globalCache && typeof globalCache.clear === 'function') {
    globalCache.clear();
  }
  
  // 重置模块缓存中的配置相关模块
  Object.keys(require.cache).forEach(key => {
    if (key.includes('config') || key.includes('adapter')) {
      delete require.cache[key];
    }
  });
});

// 每个测试用例后的清理
afterEach(async () => {
  // 清理定时器
  jest.clearAllTimers();
  
  // 清理模拟函数
  jest.clearAllMocks();
  
  // 检查内存使用
  const memUsage = process.memoryUsage();
  if (memUsage.heapUsed > TEST_CONFIG.maxMemoryUsage) {
    console.warn(`⚠️  内存使用超过阈值: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    
    // 强制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
    }
  }
});

// 测试结束后的清理
afterAll(async () => {
  // 清理shared-core缓存
  if (globalCache && typeof globalCache.destroy === 'function') {
    await globalCache.destroy();
  }
  
  // 计算测试执行时间
  const testDuration = Date.now() - global.testStartTime;
  console.log(`✅ Task 3.2配置系统重构验收测试完成 (耗时: ${testDuration}ms)`);
  
  // 清理环境变量
  delete process.env.TEST_BINANCE_API_KEY;
  delete process.env.TEST_BINANCE_API_SECRET;
  delete process.env.TEST_CONFIG_PATH;
});

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 自定义Jest匹配器
expect.extend({
  // 验证配置对象格式
  toBeValidConfig(received: any, expectedSchema?: any) {
    const pass = received && 
                 typeof received === 'object' && 
                 received.config && 
                 received.subscription;
    
    if (pass) {
      return {
        message: () => `期望 ${received} 不是有效的配置对象`,
        pass: true,
      };
    } else {
      return {
        message: () => `期望 ${received} 是有效的配置对象，但缺少必要字段`,
        pass: false,
      };
    }
  },

  // 验证适配器类型
  toBeValidAdapterType(received: string) {
    const validTypes = ['binance', 'okx', 'huobi', 'coinbase'];
    const pass = validTypes.includes(received.toLowerCase());
    
    if (pass) {
      return {
        message: () => `期望 ${received} 不是有效的适配器类型`,
        pass: true,
      };
    } else {
      return {
        message: () => `期望 ${received} 是有效的适配器类型，有效类型: ${validTypes.join(', ')}`,
        pass: false,
      };
    }
  },

  // 验证配置合并结果
  toBeSuccessfulMergeResult(received: any) {
    const pass = received && 
                 typeof received === 'object' && 
                 received.success === true &&
                 received.config &&
                 Array.isArray(received.errors) &&
                 received.errors.length === 0;
    
    if (pass) {
      return {
        message: () => `期望合并结果不成功`,
        pass: true,
      };
    } else {
      return {
        message: () => `期望合并结果成功，但收到: ${JSON.stringify(received)}`,
        pass: false,
      };
    }
  }
});

// 声明全局类型
declare global {
  const TEST_CONFIG: typeof TEST_CONFIG;
  var testStartTime: number;
  
  namespace jest {
    interface Matchers<R> {
      toBeValidConfig(expectedSchema?: any): R;
      toBeValidAdapterType(): R;
      toBeSuccessfulMergeResult(): R;
    }
  }
}

export {};