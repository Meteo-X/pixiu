/**
 * Jest 测试环境设置
 * 
 * 配置测试环境、全局变量和辅助函数
 */

import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// 全局测试配置
declare global {
  namespace NodeJS {
    interface Global {
      testStartTime: number;
      testTimeouts: NodeJS.Timeout[];
      testEventEmitters: any[];
      testConnections: any[];
    }
  }
}

// 测试环境初始化
beforeAll(async () => {
  console.log('🚀 启动 Task 2.4 错误处理和监控测试套件');
  
  // 设置测试超时
  jest.setTimeout(30000);
  
  // 初始化全局变量
  (global as any).testStartTime = Date.now();
  (global as any).testTimeouts = [];
  (global as any).testEventEmitters = [];
  (global as any).testConnections = [];
  
  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // 减少测试日志输出
});

// 测试环境清理
afterAll(async () => {
  console.log('🧹 清理测试环境');
  
  // 清理全局计时器
  const timeouts = (global as any).testTimeouts || [];
  timeouts.forEach((timeout: NodeJS.Timeout) => {
    clearTimeout(timeout);
  });
  
  // 清理事件监听器
  const emitters = (global as any).testEventEmitters || [];
  emitters.forEach((emitter: any) => {
    if (emitter && typeof emitter.removeAllListeners === 'function') {
      emitter.removeAllListeners();
    }
  });
  
  // 清理连接
  const connections = (global as any).testConnections || [];
  for (const conn of connections) {
    if (conn && typeof conn.close === 'function') {
      try {
        await conn.close();
      } catch (error) {
        // 忽略关闭错误
      }
    }
  }
  
  console.log(`✅ 测试完成，总耗时: ${Date.now() - (global as any).testStartTime}ms`);
});

// 每个测试前的设置
beforeEach(() => {
  // 重置全局状态
  (global as any).testTimeouts = [];
  (global as any).testEventEmitters = [];
  (global as any).testConnections = [];
});

// 每个测试后的清理
afterEach(async () => {
  // 清理当前测试的资源
  const timeouts = (global as any).testTimeouts || [];
  timeouts.forEach((timeout: NodeJS.Timeout) => {
    clearTimeout(timeout);
  });
  
  const emitters = (global as any).testEventEmitters || [];
  emitters.forEach((emitter: any) => {
    if (emitter && typeof emitter.removeAllListeners === 'function') {
      emitter.removeAllListeners();
    }
  });
  
  const connections = (global as any).testConnections || [];
  for (const conn of connections) {
    if (conn && typeof conn.close === 'function') {
      try {
        await conn.close();
      } catch (error) {
        // 忽略关闭错误
      }
    }
  }
});

// 全局工具函数
(global as any).addTestTimeout = (timeout: NodeJS.Timeout) => {
  (global as any).testTimeouts.push(timeout);
};

(global as any).addTestEventEmitter = (emitter: any) => {
  (global as any).testEventEmitters.push(emitter);
};

(global as any).addTestConnection = (connection: any) => {
  (global as any).testConnections.push(connection);
};

// 全局断言扩展
expect.extend({
  // 验证错误对象
  toBeValidError(received: any) {
    const pass = received && 
                 typeof received.message === 'string' &&
                 typeof received.timestamp === 'number' &&
                 received.timestamp > 0;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid error`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid error with message and timestamp`,
        pass: false,
      };
    }
  },
  
  // 验证延迟统计
  toBeValidLatencyStats(received: any) {
    const pass = received &&
                 typeof received.count === 'number' &&
                 typeof received.mean === 'number' &&
                 typeof received.min === 'number' &&
                 typeof received.max === 'number' &&
                 typeof received.p95 === 'number' &&
                 typeof received.p99 === 'number' &&
                 received.count >= 0;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be valid latency stats`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be valid latency stats`,
        pass: false,
      };
    }
  },
  
  // 验证健康度评分
  toBeValidHealthScore(received: number) {
    const pass = typeof received === 'number' &&
                 received >= 0 &&
                 received <= 1;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid health score`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid health score (0-1)`,
        pass: false,
      };
    }
  },
  
  // 验证事件最终被触发
  toHaveBeenTriggeredEventually(received: jest.Mock, timeout: number = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (received.mock.calls.length > 0) {
          clearInterval(checkInterval);
          resolve({
            message: () => `expected mock not to have been called`,
            pass: true,
          });
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve({
            message: () => `expected mock to have been called within ${timeout}ms`,
            pass: false,
          });
        }
      }, 100);
    });
  }
});

// TypeScript 类型声明
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidError(): R;
      toBeValidLatencyStats(): R;
      toBeValidHealthScore(): R;
      toHaveBeenTriggeredEventually(timeout?: number): Promise<R>;
    }
  }
}