/**
 * Jest 测试环境设置
 * 
 * 配置全局测试环境，包括：
 * - 环境变量设置
 * - Mock 对象初始化
 * - 全局 beforeAll/afterAll 钩子
 * - 测试工具函数
 */

import { resolve } from 'path';

// 设置测试环境变量
process.env.NODE_ENV = 'testing';
process.env.GOOGLE_CLOUD_PROJECT = 'pixiu-trading-test';
process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';

// 配置文件路径
process.env.CONFIG_ROOT = resolve(__dirname, 'fixtures/config-samples');

// 日志级别设置（静默模式用于测试）
process.env.LOG_LEVEL = 'error';

// Secret Manager 测试配置
process.env.SECRET_MANAGER_MOCK = 'true';

// 全局测试钩子
beforeAll(async () => {
  // 清理环境变量中的敏感信息
  delete process.env.BINANCE_API_KEY;
  delete process.env.BINANCE_API_SECRET;
  
  // 设置测试超时
  jest.setTimeout(30000);
});

afterAll(async () => {
  // 清理测试资源
  // 这里可以添加清理逻辑
});

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 扩展 Jest 匹配器
expect.extend({
  /**
   * 检查配置对象是否有效
   */
  toBeValidConfig(received: any) {
    const pass = received && 
                 typeof received === 'object' &&
                 typeof received.wsEndpoint === 'string' &&
                 typeof received.restEndpoint === 'string' &&
                 typeof received.environment === 'string';
    
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid config`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid config`,
        pass: false,
      };
    }
  },
  
  /**
   * 检查是否为有效的 URL
   */
  toBeValidUrl(received: string, protocols: string[] = ['http:', 'https:', 'ws:', 'wss:']) {
    let pass = false;
    let actualProtocol = '';
    
    try {
      const url = new URL(received);
      actualProtocol = url.protocol;
      pass = protocols.includes(url.protocol);
    } catch (e) {
      pass = false;
    }
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid URL with protocols ${protocols.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid URL with protocols ${protocols.join(', ')}, but got protocol: ${actualProtocol}`,
        pass: false,
      };
    }
  },
  
  /**
   * 检查是否为正整数
   */
  toBePositiveInteger(received: any) {
    const pass = Number.isInteger(received) && received > 0;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a positive integer`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a positive integer`,
        pass: false,
      };
    }
  },
  
  /**
   * 检查数值是否在指定范围内
   */
  toBeInRange(received: number, min: number, max: number) {
    const pass = received >= min && received <= max;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be in range [${min}, ${max}]`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be in range [${min}, ${max}]`,
        pass: false,
      };
    }
  }
});

// 声明自定义匹配器类型
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidConfig(): R;
      toBeValidUrl(protocols?: string[]): R;
      toBePositiveInteger(): R;
      toBeInRange(min: number, max: number): R;
    }
  }
}

// 导出测试工具函数
export const TestHelpers = {
  /**
   * 创建临时环境变量
   */
  withEnvVars<T>(envVars: Record<string, string>, fn: () => T): T {
    const originalVars: Record<string, string | undefined> = {};
    
    // 保存原始值
    for (const key of Object.keys(envVars)) {
      originalVars[key] = process.env[key];
    }
    
    try {
      // 设置新值
      for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
      }
      
      return fn();
    } finally {
      // 恢复原始值
      for (const [key, originalValue] of Object.entries(originalVars)) {
        if (originalValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalValue;
        }
      }
    }
  },
  
  /**
   * 异步版本的 withEnvVars
   */
  async withEnvVarsAsync<T>(envVars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
    const originalVars: Record<string, string | undefined> = {};
    
    // 保存原始值
    for (const key of Object.keys(envVars)) {
      originalVars[key] = process.env[key];
    }
    
    try {
      // 设置新值
      for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
      }
      
      return await fn();
    } finally {
      // 恢复原始值
      for (const [key, originalValue] of Object.entries(originalVars)) {
        if (originalValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalValue;
        }
      }
    }
  },
  
  /**
   * 等待指定时间
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * 生成随机字符串
   */
  randomString(length = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  
  /**
   * 深度克隆对象
   */
  deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
};