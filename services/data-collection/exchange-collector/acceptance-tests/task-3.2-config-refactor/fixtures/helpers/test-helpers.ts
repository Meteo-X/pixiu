/**
 * 测试辅助工具函数
 * 提供配置系统测试所需的通用工具和模拟功能
 */

import * as yaml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { 
  AdapterConfiguration, 
  PartialAdapterConfiguration,
  AdapterType 
} from '../../../../../../src/config/adapter-config';
import { MultiAdapterConfigManager } from '../../../../../../src/config/config-merger';
import { ExchangeCollectorConfigManager } from '../../../../../../src/config/service-config';

/**
 * 配置测试辅助类
 */
export class ConfigTestHelper {
  
  /**
   * 深度克隆对象
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * 创建临时配置文件
   */
  static async createTempConfigFile(
    config: any, 
    format: 'yaml' | 'json' = 'yaml'
  ): Promise<string> {
    const tempDir = path.join(__dirname, '..', 'temp');
    
    // 确保临时目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = `test-config-${Date.now()}.${format}`;
    const filePath = path.join(tempDir, fileName);
    
    const content = format === 'yaml' 
      ? yaml.stringify(config)
      : JSON.stringify(config, null, 2);
    
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  /**
   * 清理临时文件
   */
  static cleanupTempFiles(): void {
    const tempDir = path.join(__dirname, '..', 'temp');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      files.forEach(file => {
        const filePath = path.join(tempDir, file);
        fs.unlinkSync(filePath);
      });
    }
  }

  /**
   * 验证配置对象结构
   */
  static validateConfigStructure(config: any): boolean {
    return !!(
      config &&
      typeof config === 'object' &&
      config.config &&
      config.subscription &&
      config.config.enabled !== undefined &&
      config.config.endpoints &&
      config.config.connection &&
      Array.isArray(config.subscription.symbols) &&
      Array.isArray(config.subscription.dataTypes)
    );
  }

  /**
   * 比较两个配置对象
   */
  static compareConfigs(config1: any, config2: any): {
    isEqual: boolean;
    differences: string[];
  } {
    const differences: string[] = [];
    
    const compare = (obj1: any, obj2: any, path = ''): void => {
      if (obj1 === obj2) return;
      
      if (typeof obj1 !== typeof obj2) {
        differences.push(`${path}: 类型不匹配 (${typeof obj1} vs ${typeof obj2})`);
        return;
      }

      if (obj1 === null || obj2 === null) {
        differences.push(`${path}: null值不匹配`);
        return;
      }

      if (typeof obj1 === 'object') {
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        
        const allKeys = new Set([...keys1, ...keys2]);
        
        allKeys.forEach(key => {
          const newPath = path ? `${path}.${key}` : key;
          
          if (!keys1.includes(key)) {
            differences.push(`${newPath}: 第一个对象中缺少键`);
          } else if (!keys2.includes(key)) {
            differences.push(`${newPath}: 第二个对象中缺少键`);
          } else {
            compare(obj1[key], obj2[key], newPath);
          }
        });
      } else {
        differences.push(`${path}: 值不匹配 (${obj1} vs ${obj2})`);
      }
    };

    compare(config1, config2);
    
    return {
      isEqual: differences.length === 0,
      differences
    };
  }

  /**
   * 生成测试用的环境变量
   */
  static setTestEnvironmentVariables(vars: Record<string, string>): () => void {
    const originalVars: Record<string, string | undefined> = {};
    
    Object.keys(vars).forEach(key => {
      originalVars[key] = process.env[key];
      process.env[key] = vars[key];
    });

    // 返回清理函数
    return () => {
      Object.keys(originalVars).forEach(key => {
        if (originalVars[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalVars[key];
        }
      });
    };
  }

  /**
   * 模拟配置加载错误
   */
  static mockConfigLoadError(errorMessage: string): jest.SpyInstance {
    return jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error(errorMessage);
    });
  }

  /**
   * 创建内存使用监控器
   */
  static createMemoryMonitor(): {
    start: () => void;
    stop: () => NodeJS.MemoryUsage;
    getUsage: () => NodeJS.MemoryUsage;
  } {
    let initialMemory: NodeJS.MemoryUsage;
    
    return {
      start: () => {
        if (global.gc) global.gc();
        initialMemory = process.memoryUsage();
      },
      stop: () => {
        if (global.gc) global.gc();
        return process.memoryUsage();
      },
      getUsage: () => process.memoryUsage()
    };
  }

  /**
   * 创建性能计时器
   */
  static createPerformanceTimer(): {
    start: () => void;
    end: () => number;
    mark: (label: string) => void;
    getMarks: () => { [label: string]: number };
  } {
    let startTime: number;
    const marks: { [label: string]: number } = {};
    
    return {
      start: () => {
        startTime = performance.now();
      },
      end: () => {
        return performance.now() - startTime;
      },
      mark: (label: string) => {
        marks[label] = performance.now() - startTime;
      },
      getMarks: () => ({ ...marks })
    };
  }

  /**
   * 等待指定时间
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 重试机制
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (i < maxRetries) {
          await this.wait(delay);
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * 生成随机配置数据
   */
  static generateRandomConfig(
    type: AdapterType = AdapterType.BINANCE
  ): AdapterConfiguration {
    const randomSymbols = Array.from(
      { length: Math.floor(Math.random() * 10) + 1 },
      (_, i) => `RANDOM${i}USDT`
    );

    return {
      config: {
        enabled: Math.random() > 0.5,
        connection: {
          timeout: Math.floor(Math.random() * 20000) + 5000,
          maxRetries: Math.floor(Math.random() * 10),
          retryInterval: Math.floor(Math.random() * 10000) + 1000,
          heartbeatInterval: Math.floor(Math.random() * 60000) + 5000
        },
        endpoints: {
          ws: `wss://random-${Math.random().toString(36).substr(2, 9)}.com/ws`,
          rest: `https://random-${Math.random().toString(36).substr(2, 9)}.com/api`
        }
      },
      subscription: {
        symbols: randomSymbols,
        dataTypes: ['trade', 'ticker', 'kline_1m'].slice(0, Math.floor(Math.random() * 3) + 1) as any,
        enableAllTickers: Math.random() > 0.5
      }
    };
  }
}

/**
 * 模拟适配器管理器
 */
export class MockAdapterManager {
  private configs: Map<string, AdapterConfiguration> = new Map();
  private validationErrors: Map<string, string[]> = new Map();

  /**
   * 添加模拟配置
   */
  addMockConfig(name: string, config: AdapterConfiguration): void {
    this.configs.set(name, config);
  }

  /**
   * 设置验证错误
   */
  setValidationErrors(name: string, errors: string[]): void {
    this.validationErrors.set(name, errors);
  }

  /**
   * 获取配置
   */
  getConfig(name: string): AdapterConfiguration | undefined {
    return this.configs.get(name);
  }

  /**
   * 模拟验证
   */
  validate(name: string): string[] {
    return this.validationErrors.get(name) || [];
  }

  /**
   * 清理
   */
  clear(): void {
    this.configs.clear();
    this.validationErrors.clear();
  }
}

/**
 * 配置验证工具
 */
export class ConfigValidationHelper {
  
  /**
   * 验证必需字段
   */
  static validateRequiredFields(config: any, requiredFields: string[]): string[] {
    const errors: string[] = [];
    
    requiredFields.forEach(field => {
      const value = this.getNestedValue(config, field);
      if (value === undefined || value === null) {
        errors.push(`缺少必需字段: ${field}`);
      }
    });
    
    return errors;
  }

  /**
   * 获取嵌套对象值
   */
  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key];
    }, obj);
  }

  /**
   * 验证数据类型
   */
  static validateDataTypes(config: any, typeMapping: Record<string, string>): string[] {
    const errors: string[] = [];
    
    Object.entries(typeMapping).forEach(([field, expectedType]) => {
      const value = this.getNestedValue(config, field);
      if (value !== undefined && typeof value !== expectedType) {
        errors.push(`字段 ${field} 类型错误，期望 ${expectedType}，实际 ${typeof value}`);
      }
    });
    
    return errors;
  }

  /**
   * 验证数值范围
   */
  static validateNumberRanges(config: any, ranges: Record<string, { min?: number; max?: number }>): string[] {
    const errors: string[] = [];
    
    Object.entries(ranges).forEach(([field, range]) => {
      const value = this.getNestedValue(config, field);
      if (typeof value === 'number') {
        if (range.min !== undefined && value < range.min) {
          errors.push(`字段 ${field} 值 ${value} 小于最小值 ${range.min}`);
        }
        if (range.max !== undefined && value > range.max) {
          errors.push(`字段 ${field} 值 ${value} 大于最大值 ${range.max}`);
        }
      }
    });
    
    return errors;
  }
}

/**
 * 测试数据生成器
 */
export class TestDataGenerator {
  
  /**
   * 生成随机字符串
   */
  static randomString(length: number = 10): string {
    return Math.random().toString(36).substring(2, 2 + length);
  }

  /**
   * 生成随机数字
   */
  static randomNumber(min: number = 0, max: number = 1000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 生成随机布尔值
   */
  static randomBoolean(): boolean {
    return Math.random() > 0.5;
  }

  /**
   * 生成随机数组
   */
  static randomArray<T>(generator: () => T, minLength: number = 1, maxLength: number = 10): T[] {
    const length = this.randomNumber(minLength, maxLength);
    return Array.from({ length }, generator);
  }

  /**
   * 从数组中随机选择元素
   */
  static randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * 生成随机交易对
   */
  static randomSymbol(): string {
    const bases = ['BTC', 'ETH', 'ADA', 'DOT', 'LINK', 'UNI', 'MATIC'];
    const quotes = ['USDT', 'BUSD', 'BTC', 'ETH'];
    return `${this.randomChoice(bases)}${this.randomChoice(quotes)}`;
  }
}

/**
 * 清理测试环境
 */
export function cleanupTestEnvironment(): void {
  // 清理临时文件
  ConfigTestHelper.cleanupTempFiles();
  
  // 重置环境变量
  const testEnvVars = Object.keys(process.env).filter(key => key.startsWith('TEST_'));
  testEnvVars.forEach(key => {
    delete process.env[key];
  });
  
  // 清理模块缓存
  Object.keys(require.cache).forEach(key => {
    if (key.includes('config') || key.includes('test')) {
      delete require.cache[key];
    }
  });
}