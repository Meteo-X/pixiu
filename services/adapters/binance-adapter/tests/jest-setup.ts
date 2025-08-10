/**
 * Jest全局设置文件
 * 在所有测试运行前执行的全局配置
 */

// 设置Node.js环境变量
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // 减少测试期间的日志输出

// 设置时区为UTC，确保时间测试的一致性
process.env.TZ = 'UTC';

// Mock全局对象和函数
global.console = {
  ...console,
  // 在测试环境中降低日志级别
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: console.error // 保留错误日志用于调试
};

// 设置全局超时
const GLOBAL_TIMEOUT = 30000;
jest.setTimeout(GLOBAL_TIMEOUT);

// Mock WebSocket - 基础设置，具体测试会覆盖
(global as any).WebSocket = jest.fn().mockImplementation(() => ({
  readyState: 1,
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
}));

// Mock performance.now() 如果不存在
if (typeof performance === 'undefined') {
  (global as any).performance = {
    now: jest.fn(() => Date.now())
  };
}

// Mock TextEncoder/TextDecoder if needed
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
}

// 增强Jest匹配器
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toBeValidTimestamp(received: number) {
    const pass = typeof received === 'number' && 
                 received > 0 && 
                 received <= Date.now() + 1000; // 允许小范围的未来时间戳
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid timestamp`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid timestamp`,
        pass: false,
      };
    }
  },
  
  toBeValidUrl(received: string) {
    let isValid = false;
    try {
      new URL(received);
      isValid = true;
    } catch {}
    
    if (isValid) {
      return {
        message: () => `expected ${received} not to be a valid URL`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid URL`,
        pass: false,
      };
    }
  }
});

// 扩展Jest类型声明
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toBeValidTimestamp(): R;
      toBeValidUrl(): R;
    }
  }
}

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // 在测试环境中不退出进程，让Jest处理
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // 在测试环境中不退出进程，让Jest处理
});

// 内存泄漏检测辅助工具
let initialHeapUsed: number;

beforeAll(() => {
  // 运行垃圾收集
  if (global.gc) {
    global.gc();
  }
  initialHeapUsed = process.memoryUsage().heapUsed;
});

afterAll(() => {
  // 检查内存使用情况
  if (global.gc) {
    global.gc();
  }
  const finalHeapUsed = process.memoryUsage().heapUsed;
  const memoryGrowth = finalHeapUsed - initialHeapUsed;
  
  // 如果内存增长超过100MB，输出警告
  if (memoryGrowth > 100 * 1024 * 1024) {
    console.warn(`Memory growth detected: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
  }
});

// 设置测试开始时间
const testStartTime = Date.now();
console.log(`Test suite started at: ${new Date(testStartTime).toISOString()}`);

export {};