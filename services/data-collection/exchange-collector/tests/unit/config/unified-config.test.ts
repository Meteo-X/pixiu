/**
 * UnifiedConfigManager 测试
 * 测试统一配置管理器的功能
 */

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { globalCache } from '@pixiu/shared-core';
import { EnhancedMockFactory } from '../../utils/enhanced-mock-factory';
import { TestUtils } from '../../utils/test-utils';

// Mock统一配置管理器
class MockUnifiedConfigManager {
  private config: any = {};
  private watchers: Map<string, () => void> = new Map();
  private schema: any = null;

  constructor() {
    this.setDefaultConfig();
  }

  // 设置默认配置
  private setDefaultConfig(): void {
    this.config = {
      server: {
        port: 3000,
        host: 'localhost',
        environment: 'development'
      },
      adapters: {
        binance: {
          enabled: true,
          wsUrl: 'wss://stream.binance.com:9443/ws',
          apiKey: '',
          apiSecret: '',
          heartbeat: {
            enabled: true,
            interval: 30000
          }
        }
      },
      dataflow: {
        enabled: true,
        batching: {
          enabled: true,
          batchSize: 10,
          maxWaitTime: 100
        },
        performance: {
          enableBackpressure: true,
          backpressureThreshold: 1000,
          maxQueueSize: 10000
        },
        monitoring: {
          enableMetrics: true,
          metricsInterval: 5000
        }
      },
      websocket: {
        server: {
          port: 8080,
          host: '0.0.0.0'
        },
        proxy: {
          enabled: true,
          targetUrl: 'ws://localhost:3001'
        }
      },
      logging: {
        level: 'info',
        format: 'json',
        destinations: ['console']
      }
    };
  }

  // 加载配置文件
  loadFromFile(filePath: string): void {
    if (!existsSync(filePath)) {
      throw new Error(`Configuration file not found: ${filePath}`);
    }

    try {
      const content = readFileSync(filePath, 'utf8');
      let fileConfig: any;

      if (filePath.endsWith('.json')) {
        fileConfig = JSON.parse(content);
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        // 简单的YAML解析（实际项目中应使用yaml库）
        fileConfig = this.parseSimpleYaml(content);
      } else {
        throw new Error(`Unsupported configuration file format: ${filePath}`);
      }

      this.mergeConfig(fileConfig);
    } catch (error) {
      throw new Error(`Failed to load configuration from ${filePath}: ${error.message}`);
    }
  }

  // 从环境变量加载配置
  loadFromEnvironment(): void {
    const envConfig: any = {};

    // 解析环境变量（以EXCHANGE_COLLECTOR_开头的）
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('EXCHANGE_COLLECTOR_')) {
        const configPath = key.replace('EXCHANGE_COLLECTOR_', '').toLowerCase();
        const value = process.env[key];
        
        // 将路径转换为嵌套对象
        this.setNestedValue(envConfig, configPath.split('_'), value);
      }
    });

    this.mergeConfig(envConfig);
  }

  // 获取配置值
  get<T = any>(path: string, defaultValue?: T): T {
    return this.getNestedValue(this.config, path.split('.'), defaultValue);
  }

  // 设置配置值
  set(path: string, value: any): void {
    this.setNestedValue(this.config, path.split('.'), value);
    this.notifyWatchers(path);
  }

  // 获取完整配置
  getAll(): any {
    return JSON.parse(JSON.stringify(this.config));
  }

  // 验证配置
  validate(schema?: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const configToValidate = schema || this.schema;

    if (!configToValidate) {
      return { isValid: true, errors };
    }

    // 简单的配置验证
    this.validateObject(this.config, configToValidate, '', errors);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 设置配置模式
  setSchema(schema: any): void {
    this.schema = schema;
  }

  // 监听配置变更
  watch(path: string, callback: (newValue: any, oldValue: any) => void): () => void {
    const watcherId = `${path}_${Date.now()}`;
    const oldValue = this.get(path);

    this.watchers.set(watcherId, () => {
      const newValue = this.get(path);
      if (newValue !== oldValue) {
        callback(newValue, oldValue);
      }
    });

    // 返回取消监听的函数
    return () => {
      this.watchers.delete(watcherId);
    };
  }

  // 保存配置到文件
  saveToFile(filePath: string): void {
    try {
      if (filePath.endsWith('.json')) {
        writeFileSync(filePath, JSON.stringify(this.config, null, 2));
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        writeFileSync(filePath, this.stringifyToYaml(this.config));
      } else {
        throw new Error(`Unsupported configuration file format: ${filePath}`);
      }
    } catch (error) {
      throw new Error(`Failed to save configuration to ${filePath}: ${error.message}`);
    }
  }

  // 重置配置为默认值
  reset(): void {
    this.config = {};
    this.setDefaultConfig();
    this.notifyAllWatchers();
  }

  // 私有方法
  private mergeConfig(newConfig: any): void {
    this.config = this.deepMerge(this.config, newConfig);
  }

  private deepMerge(target: any, source: any): any {
    if (typeof target !== 'object' || typeof source !== 'object') {
      return source;
    }

    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  private getNestedValue(obj: any, path: string[], defaultValue?: any): any {
    let current = obj;
    for (const key of path) {
      if (current == null || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[key];
    }
    return current !== undefined ? current : defaultValue;
  }

  private setNestedValue(obj: any, path: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (typeof current[path[i]] !== 'object') {
        current[path[i]] = {};
      }
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
  }

  private parseSimpleYaml(content: string): any {
    // 简化的YAML解析（实际项目中应使用专门的YAML库）
    const lines = content.split('\n');
    const result: any = {};
    const stack: any[] = [result];
    
    for (const line of lines) {
      if (line.trim() === '' || line.trim().startsWith('#')) continue;
      
      const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
      if (match) {
        const [, indent, key, value] = match;
        const depth = Math.floor(indent.length / 2);
        
        // 确保堆栈深度正确
        while (stack.length > depth + 1) {
          stack.pop();
        }
        
        const currentObj = stack[stack.length - 1];
        
        if (value.trim() === '') {
          currentObj[key.trim()] = {};
          stack.push(currentObj[key.trim()]);
        } else {
          // 简单类型转换
          let parsedValue: any = value.trim();
          if (parsedValue === 'true') parsedValue = true;
          else if (parsedValue === 'false') parsedValue = false;
          else if (!isNaN(Number(parsedValue))) parsedValue = Number(parsedValue);
          
          currentObj[key.trim()] = parsedValue;
        }
      }
    }
    
    return result;
  }

  private stringifyToYaml(obj: any, indent: number = 0): string {
    let result = '';
    const spaces = ' '.repeat(indent);
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          result += `${spaces}${key}:\n`;
          result += this.stringifyToYaml(value, indent + 2);
        } else {
          result += `${spaces}${key}: ${value}\n`;
        }
      }
    }
    
    return result;
  }

  private validateObject(obj: any, schema: any, path: string, errors: string[]): void {
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (obj[requiredField] === undefined) {
          errors.push(`Required field missing: ${path ? path + '.' : ''}${requiredField}`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (obj[key] !== undefined) {
          const fieldPath = path ? `${path}.${key}` : key;
          this.validateField(obj[key], subSchema as any, fieldPath, errors);
        }
      }
    }
  }

  private validateField(value: any, schema: any, path: string, errors: string[]): void {
    if (schema.type) {
      const expectedType = schema.type;
      const actualType = typeof value;
      
      if (expectedType === 'integer' && (!Number.isInteger(value) || actualType !== 'number')) {
        errors.push(`Invalid type for ${path}: expected integer, got ${actualType}`);
      } else if (expectedType === 'number' && actualType !== 'number') {
        errors.push(`Invalid type for ${path}: expected number, got ${actualType}`);
      } else if (expectedType !== 'integer' && expectedType !== actualType) {
        errors.push(`Invalid type for ${path}: expected ${expectedType}, got ${actualType}`);
      }
    }

    if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
      errors.push(`Value for ${path} is below minimum: ${value} < ${schema.minimum}`);
    }

    if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
      errors.push(`Value for ${path} is above maximum: ${value} > ${schema.maximum}`);
    }

    if (schema.properties && typeof value === 'object') {
      this.validateObject(value, schema, path, errors);
    }
  }

  private notifyWatchers(path: string): void {
    this.watchers.forEach(callback => {
      callback();
    });
  }

  private notifyAllWatchers(): void {
    this.watchers.forEach(callback => {
      callback();
    });
  }
}

describe('UnifiedConfigManager', () => {
  let configManager: MockUnifiedConfigManager;
  let tempDir: string;
  let tempConfigFile: string;

  beforeEach(() => {
    configManager = new MockUnifiedConfigManager();
    
    // 创建临时目录和文件
    tempDir = join(tmpdir(), 'exchange-collector-test', Date.now().toString());
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    tempConfigFile = join(tempDir, 'test-config.json');
  });

  afterEach(() => {
    // 清理临时文件
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    
    // 清理环境变量
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('EXCHANGE_COLLECTOR_')) {
        delete process.env[key];
      }
    });
    
    EnhancedMockFactory.cleanup();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await globalCache.destroy();
  });

  describe('Default Configuration', () => {
    it('should load default configuration correctly', () => {
      const config = configManager.getAll();
      
      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('localhost');
      expect(config.adapters.binance.enabled).toBe(true);
      expect(config.dataflow.enabled).toBe(true);
      expect(config.websocket.server.port).toBe(8080);
    });

    it('should get specific configuration values', () => {
      expect(configManager.get('server.port')).toBe(3000);
      expect(configManager.get('adapters.binance.enabled')).toBe(true);
      expect(configManager.get('dataflow.batching.batchSize')).toBe(10);
      expect(configManager.get('nonexistent.path', 'default')).toBe('default');
    });

    it('should return default value for missing paths', () => {
      expect(configManager.get('missing.path')).toBeUndefined();
      expect(configManager.get('missing.path', 'fallback')).toBe('fallback');
      expect(configManager.get('missing.nested.deeply.nested', 42)).toBe(42);
    });
  });

  describe('Configuration Setting and Getting', () => {
    it('should set and get configuration values', () => {
      configManager.set('server.port', 4000);
      expect(configManager.get('server.port')).toBe(4000);
      
      configManager.set('newSection.newValue', 'test');
      expect(configManager.get('newSection.newValue')).toBe('test');
    });

    it('should handle complex nested objects', () => {
      const complexConfig = {
        database: {
          primary: {
            host: 'localhost',
            port: 5432,
            credentials: {
              username: 'admin',
              password: 'secret'
            }
          },
          replica: {
            host: 'replica-host',
            port: 5433
          }
        }
      };
      
      configManager.set('database', complexConfig.database);
      
      expect(configManager.get('database.primary.host')).toBe('localhost');
      expect(configManager.get('database.primary.credentials.username')).toBe('admin');
      expect(configManager.get('database.replica.port')).toBe(5433);
    });

    it('should preserve existing configuration when setting new values', () => {
      const originalPort = configManager.get('server.port');
      const originalHost = configManager.get('server.host');
      
      configManager.set('server.environment', 'production');
      
      expect(configManager.get('server.port')).toBe(originalPort);
      expect(configManager.get('server.host')).toBe(originalHost);
      expect(configManager.get('server.environment')).toBe('production');
    });
  });

  describe('File-based Configuration', () => {
    it('should load configuration from JSON file', () => {
      const testConfig = {
        server: {
          port: 5000,
          host: '0.0.0.0'
        },
        custom: {
          value: 'from-file'
        }
      };
      
      writeFileSync(tempConfigFile, JSON.stringify(testConfig, null, 2));
      
      configManager.loadFromFile(tempConfigFile);
      
      expect(configManager.get('server.port')).toBe(5000);
      expect(configManager.get('server.host')).toBe('0.0.0.0');
      expect(configManager.get('custom.value')).toBe('from-file');
      
      // 确保其他默认值仍然存在
      expect(configManager.get('adapters.binance.enabled')).toBe(true);
    });

    it('should load configuration from YAML file', () => {
      const yamlConfigFile = join(tempDir, 'test-config.yaml');
      const yamlContent = `
server:
  port: 6000
  host: "127.0.0.1"
  environment: production
adapters:
  binance:
    enabled: false
    apiKey: "test-key"
custom:
  yaml:
    value: true
    number: 42
`;
      
      writeFileSync(yamlConfigFile, yamlContent);
      
      configManager.loadFromFile(yamlConfigFile);
      
      expect(configManager.get('server.port')).toBe(6000);
      expect(configManager.get('server.host')).toBe('127.0.0.1');
      expect(configManager.get('server.environment')).toBe('production');
      expect(configManager.get('adapters.binance.enabled')).toBe(false);
      expect(configManager.get('adapters.binance.apiKey')).toBe('test-key');
      expect(configManager.get('custom.yaml.value')).toBe(true);
      expect(configManager.get('custom.yaml.number')).toBe(42);
    });

    it('should handle missing configuration files', () => {
      const nonExistentFile = join(tempDir, 'missing.json');
      
      expect(() => {
        configManager.loadFromFile(nonExistentFile);
      }).toThrow('Configuration file not found');
    });

    it('should handle malformed configuration files', () => {
      const malformedFile = join(tempDir, 'malformed.json');
      writeFileSync(malformedFile, '{ invalid json');
      
      expect(() => {
        configManager.loadFromFile(malformedFile);
      }).toThrow('Failed to load configuration');
    });

    it('should save configuration to file', () => {
      configManager.set('server.port', 7000);
      configManager.set('test.section', { value: 'saved' });
      
      const saveFile = join(tempDir, 'saved-config.json');
      configManager.saveToFile(saveFile);
      
      expect(existsSync(saveFile)).toBe(true);
      
      // 验证保存的内容
      const savedContent = JSON.parse(readFileSync(saveFile, 'utf8'));
      expect(savedContent.server.port).toBe(7000);
      expect(savedContent.test.section.value).toBe('saved');
    });
  });

  describe('Environment Variable Configuration', () => {
    it('should load configuration from environment variables', () => {
      // 设置环境变量
      process.env.EXCHANGE_COLLECTOR_SERVER_PORT = '8000';
      process.env.EXCHANGE_COLLECTOR_SERVER_HOST = '0.0.0.0';
      process.env.EXCHANGE_COLLECTOR_ADAPTERS_BINANCE_ENABLED = 'false';
      process.env.EXCHANGE_COLLECTOR_DATAFLOW_BATCHING_BATCHSIZE = '20';
      
      configManager.loadFromEnvironment();
      
      expect(configManager.get('server.port')).toBe('8000');
      expect(configManager.get('server.host')).toBe('0.0.0.0');
      expect(configManager.get('adapters.binance.enabled')).toBe('false');
      expect(configManager.get('dataflow.batching.batchsize')).toBe('20');
    });

    it('should handle complex nested environment variables', () => {
      process.env.EXCHANGE_COLLECTOR_DATABASE_PRIMARY_HOST = 'prod-db';
      process.env.EXCHANGE_COLLECTOR_DATABASE_PRIMARY_PORT = '5432';
      process.env.EXCHANGE_COLLECTOR_DATABASE_REPLICA_HOST = 'replica-db';
      
      configManager.loadFromEnvironment();
      
      expect(configManager.get('database.primary.host')).toBe('prod-db');
      expect(configManager.get('database.primary.port')).toBe('5432');
      expect(configManager.get('database.replica.host')).toBe('replica-db');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration against schema', () => {
      const schema = {
        type: 'object',
        required: ['server', 'adapters'],
        properties: {
          server: {
            type: 'object',
            required: ['port', 'host'],
            properties: {
              port: { type: 'integer', minimum: 1, maximum: 65535 },
              host: { type: 'string' }
            }
          },
          adapters: {
            type: 'object',
            properties: {
              binance: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' }
                }
              }
            }
          }
        }
      };
      
      configManager.setSchema(schema);
      
      const validationResult = configManager.validate();
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });

    it('should detect validation errors', () => {
      const schema = {
        type: 'object',
        required: ['requiredField'],
        properties: {
          server: {
            type: 'object',
            properties: {
              port: { type: 'integer', minimum: 1000, maximum: 9999 }
            }
          }
        }
      };
      
      configManager.setSchema(schema);
      configManager.set('server.port', 100); // 违反最小值约束
      
      const validationResult = configManager.validate();
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
      expect(validationResult.errors.some(err => err.includes('requiredField'))).toBe(true);
      expect(validationResult.errors.some(err => err.includes('minimum'))).toBe(true);
    });

    it('should validate type constraints', () => {
      const schema = {
        type: 'object',
        properties: {
          server: {
            type: 'object',
            properties: {
              port: { type: 'integer' },
              host: { type: 'string' },
              enabled: { type: 'boolean' }
            }
          }
        }
      };
      
      configManager.setSchema(schema);
      configManager.set('server.port', 'invalid'); // 应该是数字
      configManager.set('server.enabled', 'yes'); // 应该是布尔值
      
      const validationResult = configManager.validate();
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.some(err => err.includes('server.port'))).toBe(true);
    });
  });

  describe('Configuration Watching', () => {
    it('should watch for configuration changes', async () => {
      let changedValue: any = null;
      let oldValue: any = null;
      
      const unwatch = configManager.watch('server.port', (newVal, oldVal) => {
        changedValue = newVal;
        oldValue = oldVal;
      });
      
      const initialPort = configManager.get('server.port');
      configManager.set('server.port', 9000);
      
      // 模拟异步变更通知
      await TestUtils.sleep(10);
      
      expect(oldValue).toBe(initialPort);
      expect(changedValue).toBe(9000);
      
      unwatch();
    });

    it('should stop watching after unwatch is called', async () => {
      let changeCount = 0;
      
      const unwatch = configManager.watch('server.host', () => {
        changeCount++;
      });
      
      configManager.set('server.host', 'host1');
      await TestUtils.sleep(10);
      expect(changeCount).toBe(1);
      
      unwatch();
      
      configManager.set('server.host', 'host2');
      await TestUtils.sleep(10);
      expect(changeCount).toBe(1); // 不应该再增加
    });

    it('should handle multiple watchers', async () => {
      const changes1: any[] = [];
      const changes2: any[] = [];
      
      const unwatch1 = configManager.watch('adapters.binance.enabled', (newVal) => {
        changes1.push(newVal);
      });
      
      const unwatch2 = configManager.watch('adapters.binance.enabled', (newVal) => {
        changes2.push(newVal);
      });
      
      configManager.set('adapters.binance.enabled', false);
      await TestUtils.sleep(10);
      
      expect(changes1).toHaveLength(1);
      expect(changes2).toHaveLength(1);
      expect(changes1[0]).toBe(false);
      expect(changes2[0]).toBe(false);
      
      unwatch1();
      unwatch2();
    });
  });

  describe('Configuration Reset', () => {
    it('should reset configuration to defaults', () => {
      // 修改配置
      configManager.set('server.port', 9999);
      configManager.set('custom.value', 'modified');
      configManager.set('adapters.binance.enabled', false);
      
      expect(configManager.get('server.port')).toBe(9999);
      expect(configManager.get('custom.value')).toBe('modified');
      expect(configManager.get('adapters.binance.enabled')).toBe(false);
      
      // 重置
      configManager.reset();
      
      expect(configManager.get('server.port')).toBe(3000);
      expect(configManager.get('custom.value')).toBeUndefined();
      expect(configManager.get('adapters.binance.enabled')).toBe(true);
    });

    it('should notify watchers on reset', async () => {
      let notified = false;
      
      configManager.set('server.port', 8888);
      
      const unwatch = configManager.watch('server.port', () => {
        notified = true;
      });
      
      configManager.reset();
      await TestUtils.sleep(10);
      
      expect(notified).toBe(true);
      expect(configManager.get('server.port')).toBe(3000);
      
      unwatch();
    });
  });

  describe('Configuration Merging', () => {
    it('should merge multiple configuration sources correctly', () => {
      // 设置环境变量
      process.env.EXCHANGE_COLLECTOR_SERVER_PORT = '5000';
      process.env.EXCHANGE_COLLECTOR_CUSTOM_ENV = 'env-value';
      
      // 从环境变量加载
      configManager.loadFromEnvironment();
      
      // 从文件加载
      const fileConfig = {
        server: {
          host: 'file-host'
        },
        custom: {
          file: 'file-value'
        }
      };
      
      writeFileSync(tempConfigFile, JSON.stringify(fileConfig));
      configManager.loadFromFile(tempConfigFile);
      
      // 手动设置
      configManager.set('custom.manual', 'manual-value');
      
      // 验证合并结果
      expect(configManager.get('server.port')).toBe('5000'); // 来自环境变量
      expect(configManager.get('server.host')).toBe('file-host'); // 来自文件
      expect(configManager.get('custom.env')).toBe('env-value'); // 来自环境变量
      expect(configManager.get('custom.file')).toBe('file-value'); // 来自文件
      expect(configManager.get('custom.manual')).toBe('manual-value'); // 手动设置
      expect(configManager.get('adapters.binance.enabled')).toBe(true); // 默认值保留
    });

    it('should handle configuration precedence correctly', () => {
      // 文件配置
      const fileConfig = {
        server: { port: 4000, host: 'file-host' }
      };
      writeFileSync(tempConfigFile, JSON.stringify(fileConfig));
      configManager.loadFromFile(tempConfigFile);
      
      // 环境变量配置（应该覆盖文件）
      process.env.EXCHANGE_COLLECTOR_SERVER_PORT = '5000';
      configManager.loadFromEnvironment();
      
      // 手动设置（应该覆盖环境变量）
      configManager.set('server.port', 6000);
      
      expect(configManager.get('server.port')).toBe(6000); // 手动设置最高优先级
      expect(configManager.get('server.host')).toBe('file-host'); // 文件设置保留
    });
  });
});