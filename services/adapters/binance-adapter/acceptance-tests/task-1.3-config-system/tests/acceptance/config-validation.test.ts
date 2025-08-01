/**
 * 验收测试 - 配置验证逻辑测试
 * 
 * 验证任务 1.3 中的配置验证功能：
 * - 有效配置通过验证
 * - 无效配置被正确拒绝
 * - 详细的验证错误信息
 * - 边界值和极端情况测试
 * - 警告信息生成
 */

import {
  validateConfig,
  validateConfigOrThrow,
  ConfigurationError
} from '../../../../../src/config';
import { ConfigFactory, ValidationTestCaseGenerator } from '../../fixtures/helpers/config-factory';

describe('验收测试 - 配置验证逻辑', () => {
  describe('有效配置验证', () => {
    test('完整的有效配置应通过验证', () => {
      const config = ConfigFactory.createValidConfig();
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('开发环境配置应通过验证', () => {
      const config = ConfigFactory.createEnvironmentConfig('development');
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('测试环境配置应通过验证', () => {
      const config = ConfigFactory.createEnvironmentConfig('testing');
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('生产环境配置应通过验证', () => {
      const config = ConfigFactory.createEnvironmentConfig('production');
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('带凭据的配置应通过验证', () => {
      const config = ConfigFactory.createValidConfig({ 
        withCredentials: true,
        withSecretManager: false 
      });
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('使用 Secret Manager 的配置应通过验证', () => {
      const config = ConfigFactory.createValidConfig({ 
        withCredentials: true,
        withSecretManager: true 
      });
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('带 Google Cloud 配置的配置应通过验证', () => {
      const config = ConfigFactory.createValidConfig({ withGoogleCloud: true });
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('无效配置验证 - 缺少必需字段', () => {
    test('缺少必需字段的配置应被拒绝', () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('missing-required');
      const result = validateConfig(invalidConfig as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // 检查具体的错误信息
      const errorFields = result.errors.map(e => e.field);
      expect(errorFields).toContain('wsEndpoint');
      expect(errorFields).toContain('restEndpoint');
      expect(errorFields).toContain('environment');
    });

    test('缺少 WebSocket 端点应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      delete (config as any).wsEndpoint;
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const wsError = result.errors.find(e => e.field === 'wsEndpoint');
      expect(wsError?.message).toContain('WebSocket endpoint is required');
    });

    test('缺少 REST 端点应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      delete (config as any).restEndpoint;
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const restError = result.errors.find(e => e.field === 'restEndpoint');
      expect(restError?.message).toContain('REST API endpoint is required');
    });

    test('缺少环境标识应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      delete (config as any).environment;
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const envError = result.errors.find(e => e.field === 'environment');
      expect(envError?.message).toContain('Environment is required');
    });
  });

  describe('无效配置验证 - 错误类型', () => {
    test('错误类型的配置应被拒绝', () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('wrong-types');
      const result = validateConfig(invalidConfig as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('无效的 WebSocket URL 应报告错误', () => {
      const testCases = ValidationTestCaseGenerator.generateTypeValidationTestCases().wsEndpoint;
      
      for (const testCase of testCases) {
        if (!testCase.valid) {
          const config = ConfigFactory.createValidConfig();
          config.wsEndpoint = testCase.value as string;
          
          const result = validateConfig(config);
          
          expect(result.valid).toBe(false);
          const wsError = result.errors.find(e => e.field === 'wsEndpoint');
          expect(wsError).toBeDefined();
          expect(wsError?.message).toContain('WebSocket');
        }
      }
    });

    test('无效的环境值应报告错误', () => {
      const testCases = ValidationTestCaseGenerator.generateTypeValidationTestCases().environment;
      
      for (const testCase of testCases) {
        if (!testCase.valid) {
          const config = ConfigFactory.createValidConfig();
          config.environment = testCase.value as any;
          
          const result = validateConfig(config);
          
          expect(result.valid).toBe(false);
          const envError = result.errors.find(e => e.field === 'environment');
          expect(envError).toBeDefined();
          expect(envError?.message).toContain('must be one of: development, testing, production');
        }
      }
    });

    test('无效的日志级别应报告错误', () => {
      const testCases = ValidationTestCaseGenerator.generateTypeValidationTestCases().logging.level;
      
      for (const testCase of testCases) {
        if (!testCase.valid) {
          const config = ConfigFactory.createValidConfig();
          config.logging.level = testCase.value as any;
          
          const result = validateConfig(config);
          
          expect(result.valid).toBe(false);
          const levelError = result.errors.find(e => e.field === 'logging.level');
          expect(levelError).toBeDefined();
          expect(levelError?.message).toContain('must be one of: debug, info, warn, error');
        }
      }
    });

    test('非数字的连接配置应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.connection.maxConnections = 'not-a-number' as any;
      config.connection.connectionTimeout = null as any;
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      
      const maxConnError = result.errors.find(e => e.field === 'connection.maxConnections');
      expect(maxConnError?.message).toContain('must be a positive integer');
      
      const timeoutError = result.errors.find(e => e.field === 'connection.connectionTimeout');
      expect(timeoutError?.message).toContain('must be a positive integer');
    });
  });

  describe('无效配置验证 - 超出范围', () => {
    test('超出范围的配置应被拒绝', () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('out-of-range');
      const result = validateConfig(invalidConfig as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('连接数边界值验证', () => {
      const testCases = ValidationTestCaseGenerator.generateBoundaryTestCases().connection.maxConnections;
      
      for (const testCase of testCases) {
        const config = ConfigFactory.createValidConfig();
        config.connection.maxConnections = testCase.value;
        
        const result = validateConfig(config);
        
        if (testCase.valid) {
          const maxConnError = result.errors.find(e => e.field === 'connection.maxConnections');
          expect(maxConnError).toBeUndefined();
        } else {
          expect(result.valid).toBe(false);
          const maxConnError = result.errors.find(e => e.field === 'connection.maxConnections');
          expect(maxConnError).toBeDefined();
        }
      }
    });

    test('心跳间隔边界值验证', () => {
      const testCases = ValidationTestCaseGenerator.generateBoundaryTestCases().connection.heartbeatInterval;
      
      for (const testCase of testCases) {
        const config = ConfigFactory.createValidConfig();
        config.connection.heartbeatInterval = testCase.value;
        
        const result = validateConfig(config);
        
        if (testCase.valid) {
          const heartbeatError = result.errors.find(e => e.field === 'connection.heartbeatInterval');
          expect(heartbeatError).toBeUndefined();
        } else {
          expect(result.valid).toBe(false);
          const heartbeatError = result.errors.find(e => e.field === 'connection.heartbeatInterval');
          expect(heartbeatError).toBeDefined();
        }
      }
    });

    test('重试次数边界值验证', () => {
      const testCases = ValidationTestCaseGenerator.generateBoundaryTestCases().retry.maxRetries;
      
      for (const testCase of testCases) {
        const config = ConfigFactory.createValidConfig();
        config.retry.maxRetries = testCase.value;
        
        const result = validateConfig(config);
        
        if (testCase.valid) {
          const retriesError = result.errors.find(e => e.field === 'retry.maxRetries');
          expect(retriesError).toBeUndefined();
        } else {
          expect(result.valid).toBe(false);
          const retriesError = result.errors.find(e => e.field === 'retry.maxRetries');
          expect(retriesError).toBeDefined();
        }
      }
    });

    test('退避倍数边界值验证', () => {
      const testCases = ValidationTestCaseGenerator.generateBoundaryTestCases().retry.backoffMultiplier;
      
      for (const testCase of testCases) {
        const config = ConfigFactory.createValidConfig();
        config.retry.backoffMultiplier = testCase.value;
        
        const result = validateConfig(config);
        
        if (testCase.valid) {
          const multiplierError = result.errors.find(e => e.field === 'retry.backoffMultiplier');
          expect(multiplierError).toBeUndefined();
        } else {
          expect(result.valid).toBe(false);
          const multiplierError = result.errors.find(e => e.field === 'retry.backoffMultiplier');
          expect(multiplierError).toBeDefined();
        }
      }
    });

    test('最大延迟小于初始延迟应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.retry.initialDelay = 5000;
      config.retry.maxDelay = 3000; // 小于初始延迟
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const maxDelayError = result.errors.find(e => e.field === 'retry.maxDelay');
      expect(maxDelayError?.message).toContain('must be greater than or equal to initialDelay');
    });
  });

  describe('凭据配置验证', () => {
    test('有效的直接凭据应通过验证', () => {
      const config = ConfigFactory.createValidConfig();
      config.credentials = ConfigFactory.createValidCredentials({ useSecretManager: false });
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
    });

    test('有效的 Secret Manager 凭据应通过验证', () => {
      const config = ConfigFactory.createValidConfig();
      config.credentials = ConfigFactory.createValidCredentials({ useSecretManager: true });
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
    });

    test('过短的 API 密钥应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.credentials = ConfigFactory.createInvalidCredentials('too-short');
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const apiKeyError = result.errors.find(e => e.field === 'credentials.apiKey');
      expect(apiKeyError?.message).toContain('seems too short');
      
      const apiSecretError = result.errors.find(e => e.field === 'credentials.apiSecret');
      expect(apiSecretError?.message).toContain('seems too short');
    });

    test('使用 Secret Manager 但缺少 secret 名称应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.credentials = ConfigFactory.createInvalidCredentials('missing-secret-name');
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const secretNameError = result.errors.find(e => e.field === 'credentials.secretName');
      expect(secretNameError?.message).toContain('secretName is required when useSecretManager is true');
    });

    test('无效的 secret 名称应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.credentials = ConfigFactory.createInvalidCredentials('invalid-secret-name');
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const secretNameError = result.errors.find(e => e.field === 'credentials.secretName');
      expect(secretNameError?.message).toContain('must be a valid secret name');
    });
  });

  describe('订阅配置验证', () => {
    test('空的默认符号数组应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.subscriptions.defaultSymbols = [];
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const symbolsError = result.errors.find(e => e.field === 'subscriptions.defaultSymbols');
      expect(symbolsError?.message).toContain('must not be empty');
    });

    test('无效的符号格式应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.subscriptions.defaultSymbols = ['BTCUSDT', 'invalid-symbol', 'ETH'];
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const symbolErrors = result.errors.filter(e => e.field === 'subscriptions.defaultSymbols');
      expect(symbolErrors.length).toBeGreaterThan(0);
      expect(symbolErrors.some(e => e.message.includes('invalid-symbol'))).toBe(true);
    });

    test('空的支持数据类型数组应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.subscriptions.supportedDataTypes = [];
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const typesError = result.errors.find(e => e.field === 'subscriptions.supportedDataTypes');
      expect(typesError?.message).toContain('must not be empty');
    });

    test('无效的批量配置应报告错误', () => {
      const config = ConfigFactory.createValidConfig();
      config.subscriptions.batchSubscription.batchSize = 0;
      config.subscriptions.batchSubscription.batchInterval = -100;
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      
      const batchSizeError = result.errors.find(e => e.field === 'subscriptions.batchSubscription.batchSize');
      expect(batchSizeError?.message).toContain('must be a positive integer');
      
      const intervalError = result.errors.find(e => e.field === 'subscriptions.batchSubscription.batchInterval');
      expect(intervalError?.message).toContain('must be a positive integer');
    });
  });

  describe('Google Cloud 配置验证', () => {
    test('无效的项目 ID 应报告错误', () => {
      const config = ConfigFactory.createValidConfig({ withGoogleCloud: true });
      config.googleCloud!.projectId = 'INVALID-PROJECT-ID'; // 大写字母无效
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const projectIdError = result.errors.find(e => e.field === 'googleCloud.projectId');
      expect(projectIdError?.message).toContain('must be a valid Google Cloud project ID');
    });

    test('无效的 Pub/Sub 模拟器主机应报告错误', () => {
      const config = ConfigFactory.createValidConfig({ withGoogleCloud: true });
      config.googleCloud!.pubsub.emulatorHost = 'invalid-host-format';
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      const hostError = result.errors.find(e => e.field === 'googleCloud.pubsub.emulatorHost');
      expect(hostError?.message).toContain('must be a valid host:port');
    });
  });

  describe('配置警告生成', () => {
    test('生产环境不使用 Secret Manager 应生成警告', () => {
      const config = ConfigFactory.createEnvironmentConfig('production');
      delete config.credentials; // 不使用任何凭据配置
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      
      const secretManagerWarning = result.warnings.find(w => w.field === 'credentials');
      expect(secretManagerWarning?.message).toContain('should use Secret Manager');
    });

    test('生产环境使用 debug 日志级别应生成警告', () => {
      const config = ConfigFactory.createEnvironmentConfig('production');
      config.logging.level = 'debug';
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      
      const debugWarning = result.warnings.find(w => w.field === 'logging.level');
      expect(debugWarning?.message).toContain('Debug logging in production may impact performance');
    });

    test('过多连接数应生成警告', () => {
      const config = ConfigFactory.createValidConfig();
      config.connection.maxConnections = 15; // 超过建议值
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      const connectionWarning = result.warnings.find(w => w.field === 'connection.maxConnections');
      expect(connectionWarning?.message).toContain('High number of connections may impact performance');
    });

    test('过于频繁的心跳应生成警告', () => {
      const config = ConfigFactory.createValidConfig();
      config.connection.heartbeatInterval = 3000; // 小于建议值
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      const heartbeatWarning = result.warnings.find(w => w.field === 'connection.heartbeatInterval');
      expect(heartbeatWarning?.message).toContain('Very frequent heartbeat may increase network overhead');
    });

    test('过多默认符号应生成警告', () => {
      const config = ConfigFactory.createValidConfig();
      // 生成超过 100 个符号
      config.subscriptions.defaultSymbols = Array.from({ length: 150 }, (_, i) => `SYM${i}USDT`);
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      const symbolsWarning = result.warnings.find(w => w.field === 'subscriptions.defaultSymbols');
      expect(symbolsWarning?.message).toContain('Large number of default symbols may impact startup time');
    });
  });

  describe('validateConfigOrThrow 函数', () => {
    test('有效配置应不抛出异常', () => {
      const config = ConfigFactory.createValidConfig();
      
      expect(() => validateConfigOrThrow(config)).not.toThrow();
    });

    test('无效配置应抛出 ConfigurationError', () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('missing-required');
      
      expect(() => validateConfigOrThrow(invalidConfig as any))
        .toThrow(ConfigurationError);
    });

    test('抛出的错误应包含详细的验证信息', () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('missing-required');
      
      try {
        validateConfigOrThrow(invalidConfig as any);
        fail('Expected ConfigurationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        const configError = error as ConfigurationError;
        expect(configError.message).toContain('Configuration validation failed');
        expect(configError.message).toContain('wsEndpoint');
        expect(configError.message).toContain('restEndpoint');
      }
    });

    test('有警告的有效配置应输出警告到控制台', () => {
      const config = ConfigFactory.createEnvironmentConfig('production');
      config.logging.level = 'debug'; // 会生成警告
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      try {
        validateConfigOrThrow(config);
        
        expect(consoleSpy).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('Configuration warnings:');
        
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });
});