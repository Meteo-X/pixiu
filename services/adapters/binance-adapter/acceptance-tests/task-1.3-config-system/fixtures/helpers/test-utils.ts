/**
 * 测试工具函数
 * 提供各种测试辅助功能
 */

import { promises as fs } from 'fs';
import { resolve, join } from 'path';
import { BinanceAdapterConfig } from '../../../../../src/config';

/**
 * 文件操作工具
 */
export class FileTestUtils {
  /**
   * 创建临时配置文件
   */
  static async createTempConfigFile(
    content: any,
    extension: 'json' | 'yaml' = 'json',
    filename?: string
  ): Promise<string> {
    const tempDir = resolve(__dirname, '../test-data/temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const fileName = filename || `test-config-${Date.now()}.${extension}`;
    const filePath = join(tempDir, fileName);
    
    let fileContent: string;
    if (extension === 'json') {
      fileContent = JSON.stringify(content, null, 2);
    } else {
      // 对于 YAML，我们需要导入 js-yaml
      const yaml = require('js-yaml');
      fileContent = yaml.dump(content);
    }
    
    await fs.writeFile(filePath, fileContent, 'utf8');
    return filePath;
  }

  /**
   * 删除临时文件
   */
  static async removeTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // 忽略文件不存在的错误
      if ((error as any).code !== 'ENOENT') {
        console.warn('Failed to remove temp file:', filePath, error);
      }
    }
  }

  /**
   * 清理临时目录
   */
  static async cleanupTempDir(): Promise<void> {
    const tempDir = resolve(__dirname, '../test-data/temp');
    try {
      const files = await fs.readdir(tempDir);
      await Promise.all(files.map(file => 
        fs.unlink(join(tempDir, file)).catch(() => {})
      ));
    } catch (error) {
      // 目录不存在，忽略错误
    }
  }

  /**
   * 检查文件是否存在
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 读取测试配置文件
   */
  static async readTestConfigFile(filename: string): Promise<string> {
    const filePath = resolve(__dirname, '../config-samples', filename);
    return fs.readFile(filePath, 'utf8');
  }
}

/**
 * 环境变量工具
 */
export class EnvTestUtils {
  private static originalEnv: Record<string, string | undefined> = {};

  /**
   * 设置测试环境变量
   */
  static setTestEnvVars(vars: Record<string, string>): void {
    for (const [key, value] of Object.entries(vars)) {
      if (!(key in this.originalEnv)) {
        this.originalEnv[key] = process.env[key];
      }
      process.env[key] = value;
    }
  }

  /**
   * 清理测试环境变量
   */
  static clearTestEnvVars(keys?: string[]): void {
    const keysToRestore = keys || Object.keys(this.originalEnv);
    
    for (const key of keysToRestore) {
      if (key in this.originalEnv) {
        const originalValue = this.originalEnv[key];
        if (originalValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalValue;
        }
        delete this.originalEnv[key];
      }
    }
  }

  /**
   * 创建带环境变量的测试上下文
   */
  static withEnvVars<T>(
    vars: Record<string, string>,
    testFn: () => T | Promise<T>
  ): () => Promise<T> {
    return async () => {
      this.setTestEnvVars(vars);
      try {
        return await testFn();
      } finally {
        this.clearTestEnvVars(Object.keys(vars));
      }
    };
  }

  /**
   * 恢复所有环境变量
   */
  static restoreAll(): void {
    this.clearTestEnvVars();
  }
}

/**
 * 配置比较工具
 */
export class ConfigComparisonUtils {
  /**
   * 深度比较两个配置对象
   */
  static deepCompare(obj1: any, obj2: any, path = ''): string[] {
    const differences: string[] = [];

    if (obj1 === obj2) {
      return differences;
    }

    if (typeof obj1 !== typeof obj2) {
      differences.push(`${path}: type mismatch (${typeof obj1} vs ${typeof obj2})`);
      return differences;
    }

    if (obj1 === null || obj2 === null) {
      differences.push(`${path}: null value mismatch`);
      return differences;
    }

    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      if (obj1.length !== obj2.length) {
        differences.push(`${path}: array length mismatch (${obj1.length} vs ${obj2.length})`);
      }
      
      const maxLength = Math.max(obj1.length, obj2.length);
      for (let i = 0; i < maxLength; i++) {
        const newPath = `${path}[${i}]`;
        differences.push(...this.deepCompare(obj1[i], obj2[i], newPath));
      }
      return differences;
    }

    if (typeof obj1 === 'object' && typeof obj2 === 'object') {
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);
      const allKeys = new Set([...keys1, ...keys2]);

      for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj1)) {
          differences.push(`${newPath}: missing in first object`);
        } else if (!(key in obj2)) {
          differences.push(`${newPath}: missing in second object`);
        } else {
          differences.push(...this.deepCompare(obj1[key], obj2[key], newPath));
        }
      }
      return differences;
    }

    differences.push(`${path}: value mismatch (${obj1} vs ${obj2})`);
    return differences;
  }

  /**
   * 检查配置是否包含所有必需字段
   */
  static validateRequiredFields(config: any, requiredFields: string[]): string[] {
    const missing: string[] = [];
    
    for (const field of requiredFields) {
      const fieldParts = field.split('.');
      let current = config;
      
      for (let i = 0; i < fieldParts.length; i++) {
        const part = fieldParts[i];
        if (current === null || current === undefined || !(part in current)) {
          missing.push(field);
          break;
        }
        current = current[part];
      }
    }
    
    return missing;
  }

  /**
   * 提取配置的敏感信息（用于测试日志输出）
   */
  static sanitizeConfigForLogging(config: BinanceAdapterConfig): any {
    const sanitized = JSON.parse(JSON.stringify(config));
    
    // 隐藏敏感信息
    if (sanitized.credentials) {
      if (sanitized.credentials.apiKey) {
        sanitized.credentials.apiKey = '***HIDDEN***';
      }
      if (sanitized.credentials.apiSecret) {
        sanitized.credentials.apiSecret = '***HIDDEN***';
      }
    }
    
    return sanitized;
  }
}

/**
 * 性能测试工具
 */
export class PerformanceTestUtils {
  /**
   * 测量函数执行时间
   */
  static async measureExecutionTime<T>(
    fn: () => Promise<T> | T,
    iterations = 1
  ): Promise<{ result: T; avgTime: number; totalTime: number; iterations: number }> {
    const startTime = process.hrtime.bigint();
    let result: T;
    
    for (let i = 0; i < iterations; i++) {
      result = await fn();
    }
    
    const endTime = process.hrtime.bigint();
    const totalTime = Number(endTime - startTime) / 1000000; // 转换为毫秒
    const avgTime = totalTime / iterations;
    
    return {
      result: result!,
      avgTime,
      totalTime,
      iterations
    };
  }

  /**
   * 测量内存使用量
   */
  static measureMemoryUsage<T>(fn: () => T): { result: T; memoryUsed: number } {
    const beforeMem = process.memoryUsage();
    const result = fn();
    const afterMem = process.memoryUsage();
    
    const memoryUsed = afterMem.heapUsed - beforeMem.heapUsed;
    
    return {
      result,
      memoryUsed
    };
  }

  /**
   * 并发测试工具
   */
  static async runConcurrentTests<T>(
    testFn: () => Promise<T>,
    concurrency: number,
    iterations: number
  ): Promise<{
    results: T[];
    totalTime: number;
    avgTime: number;
    errors: Error[];
  }> {
    const startTime = Date.now();
    const results: T[] = [];
    const errors: Error[] = [];
    
    const tasks = Array.from({ length: iterations }, async () => {
      try {
        const result = await testFn();
        results.push(result);
      } catch (error) {
        errors.push(error as Error);
      }
    });
    
    // 控制并发数
    const chunks = [];
    for (let i = 0; i < tasks.length; i += concurrency) {
      chunks.push(tasks.slice(i, i + concurrency));
    }
    
    for (const chunk of chunks) {
      await Promise.all(chunk);
    }
    
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / iterations;
    
    return {
      results,
      totalTime,
      avgTime,
      errors
    };
  }
}

/**
 * 错误测试工具
 */
export class ErrorTestUtils {
  /**
   * 验证错误类型和消息
   */
  static expectError(
    fn: () => void | Promise<void>,
    expectedErrorType?: new (...args: any[]) => Error,
    expectedMessage?: string | RegExp
  ): void {
    if (fn.constructor.name === 'AsyncFunction') {
      expect(fn()).rejects.toThrow();
      if (expectedErrorType) {
        expect(fn()).rejects.toThrow(expectedErrorType);
      }
      if (expectedMessage) {
        expect(fn()).rejects.toThrow(expectedMessage);
      }
    } else {
      expect(fn).toThrow();
      if (expectedErrorType) {
        expect(fn).toThrow(expectedErrorType);
      }
      if (expectedMessage) {
        expect(fn).toThrow(expectedMessage);
      }
    }
  }

  /**
   * 创建自定义错误
   */
  static createError(
    message: string,
    code?: string | number,
    additionalProperties?: Record<string, any>
  ): Error {
    const error = new Error(message) as any;
    if (code) {
      error.code = code;
    }
    if (additionalProperties) {
      Object.assign(error, additionalProperties);
    }
    return error;
  }
}

/**
 * 模拟工具
 */
export class MockUtils {
  /**
   * 创建 Jest spy 的便捷方法
   */
  static createMockFunction<T extends (...args: any[]) => any>(
    implementation?: T
  ): jest.MockedFunction<T> {
    return jest.fn(implementation) as jest.MockedFunction<T>;
  }

  /**
   * 模拟定时器
   */
  static useFakeTimers(): void {
    jest.useFakeTimers();
  }

  /**
   * 恢复真实定时器
   */
  static useRealTimers(): void {
    jest.useRealTimers();
  }

  /**
   * 推进定时器
   */
  static advanceTimersByTime(ms: number): void {
    jest.advanceTimersByTime(ms);
  }

  /**
   * 运行所有定时器
   */
  static runAllTimers(): void {
    jest.runAllTimers();
  }
}