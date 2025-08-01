/**
 * 验收测试 - 配置加载逻辑测试
 * 
 * 验证任务 1.3 中的配置加载功能：
 * - 从文件加载配置（JSON/YAML）
 * - 从环境变量加载配置
 * - 配置优先级和合并逻辑
 * - 错误处理和异常情况
 */

import { resolve } from 'path';
import {
  loadConfig,
  loadConfigFromFile,
  loadConfigFromEnv,
  getEnvironmentConfig,
  ConfigurationError
} from '../../../../../src/config';
import { ConfigFactory } from '../../fixtures/helpers/config-factory';
import { FileTestUtils, EnvTestUtils } from '../../fixtures/helpers/test-utils';

describe('验收测试 - 配置加载逻辑', () => {
  // 清理环境变量
  afterEach(() => {
    EnvTestUtils.restoreAll();
  });

  describe('文件配置加载', () => {
    test('应能从 JSON 文件加载配置', async () => {
      const configPath = resolve(__dirname, '../../fixtures/config-samples/valid-production.json');
      const config = await loadConfigFromFile(configPath);
      
      expect(config).toBeDefined();
      expect(config.wsEndpoint).toBe('wss://stream.binance.com:9443');
      expect(config.restEndpoint).toBe('https://api.binance.com');
      expect(config.environment).toBe('production');
      
      // 验证嵌套配置
      expect(config.connection?.maxConnections).toBe(10);
      expect(config.retry?.maxRetries).toBe(50);
      expect(config.credentials?.useSecretManager).toBe(true);
      expect(config.credentials?.secretName).toBe('binance-prod-credentials');
    });

    test('应能从 YAML 文件加载配置', async () => {
      const configPath = resolve(__dirname, '../../fixtures/config-samples/valid-development.yaml');
      const config = await loadConfigFromFile(configPath);
      
      expect(config).toBeDefined();
      expect(config.wsEndpoint).toBe('wss://stream.binance.com:9443');
      expect(config.restEndpoint).toBe('https://api.binance.com');
      expect(config.environment).toBe('development');
      
      // 验证 YAML 特定的数据结构
      expect(Array.isArray(config.subscriptions?.defaultSymbols)).toBe(true);
      expect(config.subscriptions?.defaultSymbols).toContain('BTCUSDT');
      expect(config.subscriptions?.defaultSymbols).toContain('ETHUSDT');
    });

    test('应能加载部分配置文件', async () => {
      const configPath = resolve(__dirname, '../../fixtures/config-samples/partial-override.yaml');
      const config = await loadConfigFromFile(configPath);
      
      expect(config).toBeDefined();
      // 部分配置应该只包含覆盖的字段
      expect(config.connection?.maxConnections).toBe(8);
      expect(config.connection?.connectionTimeout).toBe(45000);
      expect(config.retry?.maxRetries).toBe(20);
      expect(config.logging?.level).toBe('warn');
      
      // 未指定的字段应该不存在
      expect(config.wsEndpoint).toBeUndefined();
      expect(config.restEndpoint).toBeUndefined();
    });

    test('应拒绝不支持的文件格式', async () => {
      const tempFile = await FileTestUtils.createTempConfigFile(
        { test: 'data' },
        'json',
        'test.txt'
      );
      
      try {
        await expect(loadConfigFromFile(tempFile))
          .rejects
          .toThrow(ConfigurationError);
        await expect(loadConfigFromFile(tempFile))
          .rejects
          .toThrow('Unsupported config file format: .txt');
      } finally {
        await FileTestUtils.removeTempFile(tempFile);
      }
    });

    test('应处理文件不存在的情况', async () => {
      const nonExistentFile = '/path/to/nonexistent/config.json';
      
      await expect(loadConfigFromFile(nonExistentFile))
        .rejects
        .toThrow(ConfigurationError);
      await expect(loadConfigFromFile(nonExistentFile))
        .rejects
        .toThrow('Failed to load config from file');
    });

    test('应处理 JSON 格式错误', async () => {
      const invalidJsonFile = await FileTestUtils.createTempConfigFile(
        'invalid json content',
        'json',
        'invalid.json'
      );
      // 手动写入无效的 JSON 内容
      const fs = require('fs').promises;
      await fs.writeFile(invalidJsonFile, '{ invalid json }', 'utf8');
      
      try {
        await expect(loadConfigFromFile(invalidJsonFile))
          .rejects
          .toThrow(ConfigurationError);
      } finally {
        await FileTestUtils.removeTempFile(invalidJsonFile);
      }
    });

    test('应处理 YAML 格式错误', async () => {
      const invalidYamlFile = await FileTestUtils.createTempConfigFile(
        'invalid yaml content',
        'yaml',
        'invalid.yaml'
      );
      // 手动写入无效的 YAML 内容
      const fs = require('fs').promises;
      await fs.writeFile(invalidYamlFile, '  invalid:\n    yaml:\n  content', 'utf8');
      
      try {
        await expect(loadConfigFromFile(invalidYamlFile))
          .rejects
          .toThrow(ConfigurationError);
      } finally {
        await FileTestUtils.removeTempFile(invalidYamlFile);
      }
    });
  });

  describe('环境变量配置加载', () => {
    test('应能从环境变量加载基础配置', () => {
      EnvTestUtils.setTestEnvVars({
        'BINANCE_WS_ENDPOINT': 'wss://testnet.binance.vision/ws',
        'BINANCE_REST_ENDPOINT': 'https://testnet.binance.vision/api',
        'NODE_ENV': 'testing'
      });
      
      const config = loadConfigFromEnv();
      
      expect(config.wsEndpoint).toBe('wss://testnet.binance.vision/ws');
      expect(config.restEndpoint).toBe('https://testnet.binance.vision/api');
      expect(config.environment).toBe('testing');
    });

    test('应能从环境变量加载连接配置', () => {
      EnvTestUtils.setTestEnvVars({
        'BINANCE_MAX_CONNECTIONS': '8',
        'BINANCE_MAX_STREAMS_PER_CONNECTION': '500',
        'BINANCE_CONNECTION_TIMEOUT': '20000'
      });
      
      const config = loadConfigFromEnv();
      
      expect(config.connection?.maxConnections).toBe(8);
      expect(config.connection?.maxStreamsPerConnection).toBe(500);
      expect(config.connection?.connectionTimeout).toBe(20000);
      
      // 其他字段应使用默认值
      expect(config.connection?.heartbeatInterval).toBe(20000);
      expect(config.connection?.pingTimeout).toBe(25000);
    });

    test('应能从环境变量加载重试配置', () => {
      EnvTestUtils.setTestEnvVars({
        'BINANCE_MAX_RETRIES': '25',
        'BINANCE_INITIAL_DELAY': '500',
        'BINANCE_MAX_DELAY': '20000'
      });
      
      const config = loadConfigFromEnv();
      
      expect(config.retry?.maxRetries).toBe(25);
      expect(config.retry?.initialDelay).toBe(500);
      expect(config.retry?.maxDelay).toBe(20000);
      
      // 其他字段应使用默认值
      expect(config.retry?.backoffMultiplier).toBe(2.0);
      expect(config.retry?.jitter).toBe(true);
    });

    test('应能从环境变量加载凭据配置', () => {
      EnvTestUtils.setTestEnvVars({
        'BINANCE_API_KEY': 'test-api-key-from-env',
        'BINANCE_API_SECRET': 'test-api-secret-from-env',
        'BINANCE_USE_SECRET_MANAGER': 'true',
        'BINANCE_SECRET_NAME': 'binance-env-credentials'
      });
      
      const config = loadConfigFromEnv();
      
      expect(config.credentials?.apiKey).toBe('test-api-key-from-env');
      expect(config.credentials?.apiSecret).toBe('test-api-secret-from-env');
      expect(config.credentials?.useSecretManager).toBe(true);
      expect(config.credentials?.secretName).toBe('binance-env-credentials');
    });

    test('应能从环境变量加载日志配置', () => {
      EnvTestUtils.setTestEnvVars({
        'LOG_LEVEL': 'warn',
        'LOG_FORMAT': 'text'
      });
      
      const config = loadConfigFromEnv();
      
      expect(config.logging?.level).toBe('warn');
      expect(config.logging?.format).toBe('text');
      expect(config.logging?.structured).toBe(true); // 默认值
    });

    test('应正确处理布尔值环境变量', () => {
      // 测试各种布尔值表示
      const testCases = [
        { value: 'true', expected: true },
        { value: 'false', expected: false },
        { value: 'TRUE', expected: true },
        { value: 'FALSE', expected: false },
        { value: '1', expected: false }, // 只有 'true'/'false' 被识别
        { value: '0', expected: false },
        { value: '', expected: false }
      ];
      
      for (const testCase of testCases) {
        EnvTestUtils.setTestEnvVars({
          'BINANCE_USE_SECRET_MANAGER': testCase.value
        });
        
        const config = loadConfigFromEnv();
        expect(config.credentials?.useSecretManager).toBe(testCase.expected);
        
        EnvTestUtils.clearTestEnvVars(['BINANCE_USE_SECRET_MANAGER']);
      }
    });

    test('应正确处理数值环境变量', () => {
      // 测试数值转换
      EnvTestUtils.setTestEnvVars({
        'BINANCE_MAX_CONNECTIONS': '15',
        'BINANCE_CONNECTION_TIMEOUT': '30000'
      });
      
      const config = loadConfigFromEnv();
      
      expect(config.connection?.maxConnections).toBe(15);
      expect(config.connection?.connectionTimeout).toBe(30000);
      expect(typeof config.connection?.maxConnections).toBe('number');
      expect(typeof config.connection?.connectionTimeout).toBe('number');
    });

    test('应在没有环境变量时返回空配置', () => {
      // 确保没有设置任何相关环境变量
      const relevantVars = [
        'BINANCE_WS_ENDPOINT', 'BINANCE_REST_ENDPOINT', 'NODE_ENV',
        'BINANCE_MAX_CONNECTIONS', 'LOG_LEVEL'
      ];
      
      for (const varName of relevantVars) {
        delete process.env[varName];
      }
      
      const config = loadConfigFromEnv();
      
      expect(Object.keys(config)).toHaveLength(0);
    });
  });

  describe('环境预设配置', () => {
    test('getEnvironmentConfig 应根据 NODE_ENV 返回正确配置', () => {
      const environments = ['development', 'testing', 'production'] as const;
      
      for (const env of environments) {
        const config = getEnvironmentConfig(env);
        expect(config.environment).toBe(env);
      }
    });

    test('getEnvironmentConfig 应使用 process.env.NODE_ENV 作为默认值', () => {
      EnvTestUtils.setTestEnvVars({ 'NODE_ENV': 'production' });
      
      const config = getEnvironmentConfig();
      expect(config.environment).toBe('production');
    });

    test('getEnvironmentConfig 应在未设置环境时默认为 development', () => {
      delete process.env.NODE_ENV;
      
      const config = getEnvironmentConfig();
      expect(config.environment).toBe('development');
    });

    test('getEnvironmentConfig 应处理无效环境值', () => {
      const config = getEnvironmentConfig('invalid-env' as any);
      expect(config.environment).toBe('development'); // 默认值
    });
  });

  describe('完整配置加载', () => {
    test('loadConfig 应按正确优先级合并配置', async () => {
      // 创建临时配置文件
      const fileConfig = {
        environment: 'testing',
        connection: { maxConnections: 7 },
        logging: { level: 'debug' }
      };
      const configFile = await FileTestUtils.createTempConfigFile(fileConfig);
      
      // 设置环境变量（优先级最高）
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'production', // 应该被环境变量覆盖
        'BINANCE_MAX_CONNECTIONS': '12', // 应该覆盖文件配置
        'LOG_LEVEL': 'error' // 应该覆盖文件配置
      });
      
      try {
        const config = await loadConfig(configFile);
        
        // 环境变量应该有最高优先级
        expect(config.environment).toBe('production'); // 来自环境变量
        expect(config.connection.maxConnections).toBe(12); // 来自环境变量
        expect(config.logging.level).toBe('error'); // 来自环境变量
        
        // 基础配置应该来自环境预设
        expect(config.wsEndpoint).toBe('wss://stream.binance.com:9443');
        expect(config.restEndpoint).toBe('https://api.binance.com');
        
      } finally {
        await FileTestUtils.removeTempFile(configFile);
      }
    });

    test('loadConfig 应在没有配置文件时仅使用环境预设和环境变量', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'testing',
        'BINANCE_MAX_CONNECTIONS': '3'
      });
      
      const config = await loadConfig(); // 不提供配置文件
      
      expect(config.environment).toBe('testing');
      expect(config.connection.maxConnections).toBe(3);
      
      // 应该包含测试环境的默认值
      expect(config.wsEndpoint).toBe('wss://testnet.binance.vision/ws');
      expect(config.monitoring.prometheus.enabled).toBe(false);
    });

    test('loadConfig 应正确处理不存在的配置文件', async () => {
      const nonExistentFile = '/path/to/nonexistent/config.json';
      
      await expect(loadConfig(nonExistentFile))
        .rejects
        .toThrow(ConfigurationError);
    });

    test('loadConfig 应保证配置完整性', async () => {
      // 测试只有部分字段的配置文件
      const partialConfig = {
        connection: { maxConnections: 5 },
        logging: { level: 'info' }
      };
      const configFile = await FileTestUtils.createTempConfigFile(partialConfig);
      
      try {
        const config = await loadConfig(configFile);
        
        // 应该包含所有必需字段
        expect(config.wsEndpoint).toBeDefined();
        expect(config.restEndpoint).toBeDefined();
        expect(config.environment).toBeDefined();
        expect(config.connection).toBeDefined();
        expect(config.retry).toBeDefined();
        expect(config.subscriptions).toBeDefined();
        expect(config.logging).toBeDefined();
        expect(config.monitoring).toBeDefined();
        
        // 部分覆盖应该生效
        expect(config.connection.maxConnections).toBe(5);
        expect(config.logging.level).toBe('info');
        
      } finally {
        await FileTestUtils.removeTempFile(configFile);
      }
    });
  });

  describe('配置加载性能', () => {
    test('文件配置加载应在合理时间内完成', async () => {
      const configPath = resolve(__dirname, '../../fixtures/config-samples/valid-development.yaml');
      
      const startTime = Date.now();
      await loadConfigFromFile(configPath);
      const endTime = Date.now();
      
      const loadTime = endTime - startTime;
      expect(loadTime).toBeLessThan(100); // 应在 100ms 内完成
    });

    test('环境变量配置加载应在合理时间内完成', () => {
      EnvTestUtils.setTestEnvVars({
        'BINANCE_WS_ENDPOINT': 'wss://stream.binance.com:9443',
        'BINANCE_REST_ENDPOINT': 'https://api.binance.com',
        'NODE_ENV': 'testing',
        'BINANCE_MAX_CONNECTIONS': '5',
        'LOG_LEVEL': 'info'
      });
      
      const startTime = Date.now();
      loadConfigFromEnv();
      const endTime = Date.now();
      
      const loadTime = endTime - startTime;
      expect(loadTime).toBeLessThan(10); // 应在 10ms 内完成
    });

    test('完整配置加载应在合理时间内完成', async () => {
      const configPath = resolve(__dirname, '../../fixtures/config-samples/valid-production.json');
      
      const startTime = Date.now();
      await loadConfig(configPath);
      const endTime = Date.now();
      
      const loadTime = endTime - startTime;
      expect(loadTime).toBeLessThan(200); // 应在 200ms 内完成
    });
  });
});