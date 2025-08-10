/**
 * 全局测试设置文件
 */

import { globalCache } from '@pixiu/shared-core';

// 设置测试超时
jest.setTimeout(30000);

// 全局测试前设置
beforeAll(async () => {
  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // 减少测试期间的日志输出
  
  // 模拟时间函数（可选）
  jest.useFakeTimers({
    advanceTimers: true,
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']
  });
  
  console.log('🧪 Starting BaseConnectionManager integration tests...');
});

// 全局测试后清理
afterAll(async () => {
  // 清理shared-core全局缓存以防止Jest挂起
  if (globalCache && typeof globalCache.destroy === 'function') {
    globalCache.destroy();
  }
  
  // 恢复真实计时器
  jest.useRealTimers();
  
  // 清理任何剩余的定时器
  jest.clearAllTimers();
  
  console.log('✅ BaseConnectionManager integration tests completed');
});

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', promise, '原因:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

// 防止测试泄露
afterEach(async () => {
  // 清理所有计时器
  jest.clearAllTimers();
  
  // 等待所有异步操作完成
  await new Promise(resolve => setImmediate(resolve));
});

// 测试工具函数
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    waitFor: (condition: () => boolean, timeout?: number) => Promise<void>;
    mockTimestamp: (timestamp?: number) => void;
    restoreTimestamp: () => void;
  };
}

// 导出测试工具函数
global.testUtils = {
  /**
   * 延迟函数
   */
  delay: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * 等待条件满足
   */
  waitFor: async (condition: () => boolean, timeout: number = 5000): Promise<void> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (condition()) {
        return;
      }
      await global.testUtils.delay(100);
    }
    throw new Error(`等待条件超时 (${timeout}ms)`);
  },
  
  /**
   * 模拟时间戳
   */
  mockTimestamp: (timestamp?: number): void => {
    const fixedTime = timestamp || 1640995200000; // 2022-01-01 00:00:00 UTC
    jest.spyOn(Date, 'now').mockReturnValue(fixedTime);
  },
  
  /**
   * 恢复真实时间戳
   */
  restoreTimestamp: (): void => {
    jest.restoreAllMocks();
  }
};