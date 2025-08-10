import { globalCache } from '@pixiu/shared-core';

// 全局测试设置
beforeAll(async () => {
  // 设置测试环境
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // 减少测试日志噪音
  
  // 设置测试超时
  jest.setTimeout(60000);
});

// 全局清理
afterAll(async () => {
  // 清理shared-core缓存，防止Jest挂起
  if (globalCache && typeof globalCache.destroy === 'function') {
    await globalCache.destroy();
  }
  
  // 等待所有异步操作完成
  await new Promise(resolve => setTimeout(resolve, 100));
});

// 每个测试前的准备
beforeEach(async () => {
  // 清理模块缓存
  jest.clearAllMocks();
});

// 每个测试后的清理
afterEach(async () => {
  // 清理测试产生的定时器
  jest.clearAllTimers();
});

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

// 测试工具函数
global.TestUtils = {
  async waitFor(condition: () => boolean | Promise<boolean>, timeout = 5000, interval = 100): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`条件在${timeout}ms内未满足`);
  },
  
  generateTestId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
  
  async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1_000_000; // 转换为毫秒
    return { result, duration };
  }
};

// 类型声明
declare global {
  var TestUtils: {
    waitFor(condition: () => boolean | Promise<boolean>, timeout?: number, interval?: number): Promise<void>;
    generateTestId(): string;
    measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }>;
  };
}