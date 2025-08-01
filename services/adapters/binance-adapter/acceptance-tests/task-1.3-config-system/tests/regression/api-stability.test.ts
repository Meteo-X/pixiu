/**
 * 回归测试 - API 接口稳定性测试
 * 
 * 确保配置系统的 API 接口保持向后兼容：
 * - 函数签名稳定性
 * - 返回值格式一致性
 * - 错误处理行为一致性
 * - 导出的公共 API 完整性
 */

import {
  // 核心配置接口
  BinanceAdapterConfig,
  BinanceCredentials,
  SubscriptionConfig,
  LoggingConfig,
  ConfigurationError,
  
  // 默认配置常量
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_SUBSCRIPTION_CONFIG,
  DEFAULT_LOGGING_CONFIG,
  DEFAULT_MONITORING_CONFIG,
  
  // 配置创建函数
  createDevelopmentConfig,
  createTestingConfig,
  createProductionConfig,
  
  // 配置加载函数
  loadConfig,
  loadConfigFromFile,
  loadConfigFromEnv,
  getEnvironmentConfig,
  mergeConfigs,
  
  // 配置验证函数
  validateConfig,
  validateConfigOrThrow,
  
  // 配置管理器
  ConfigManager,
  ConfigManagerEvent,
  createConfigManager,
  getConfigManager,
  destroyConfigManager,
  
  // Secret Manager 函数
  loadCredentialsFromSecretManager,
  checkSecretManagerAvailable,
  createOrUpdateSecret,
  deleteSecret,
  listBinanceSecrets,
  clearCredentialsCache,
  getCacheStats,
  cleanupExpiredCache
} from '../../../../../src/config';

describe('回归测试 - API 接口稳定性', () => {
  describe('核心接口结构稳定性', () => {
    test('BinanceAdapterConfig 接口应包含所有必需属性', () => {
      const config = createDevelopmentConfig();
      
      // 必需的顶级属性
      expect(config).toHaveProperty('wsEndpoint');
      expect(config).toHaveProperty('restEndpoint');
      expect(config).toHaveProperty('environment');
      expect(config).toHaveProperty('connection');
      expect(config).toHaveProperty('retry');
      expect(config).toHaveProperty('subscriptions');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('monitoring');
      
      // 类型检查
      expect(typeof config.wsEndpoint).toBe('string');
      expect(typeof config.restEndpoint).toBe('string');
      expect(typeof config.environment).toBe('string');
      expect(typeof config.connection).toBe('object');
      expect(typeof config.retry).toBe('object');
      expect(typeof config.subscriptions).toBe('object');
      expect(typeof config.logging).toBe('object');
      expect(typeof config.monitoring).toBe('object');
    });

    test('BinanceCredentials 接口应保持结构稳定', () => {
      const credentials: BinanceCredentials = {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        useSecretManager: false
      };
      
      expect(credentials).toHaveProperty('apiKey');
      expect(credentials).toHaveProperty('apiSecret');
      expect(credentials).toHaveProperty('useSecretManager');
      
      const secretManagerCredentials: BinanceCredentials = {
        useSecretManager: true,
        secretName: 'test-secret-name'
      };
      
      expect(secretManagerCredentials).toHaveProperty('useSecretManager');
      expect(secretManagerCredentials).toHaveProperty('secretName');
    });

    test('ConfigurationError 应保持错误结构稳定', () => {
      const error = new ConfigurationError('test message');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toHaveProperty('message');
      expect(error).toHaveProperty('name');
      expect(error.name).toBe('ConfigurationError');
      
      const errorWithCause = new ConfigurationError('test', new Error('cause'));
      expect(errorWithCause).toHaveProperty('cause');
      
      const errorWithDetails = new ConfigurationError('test', undefined, { detail: 'value' });
      expect(errorWithDetails).toHaveProperty('details');
    });
  });

  describe('默认配置常量稳定性', () => {
    test('DEFAULT_CONNECTION_CONFIG 结构应保持稳定', () => {
      const requiredFields = [
        'maxConnections',
        'maxStreamsPerConnection',
        'heartbeatInterval',
        'pingTimeout',
        'connectionTimeout'
      ];
      
      for (const field of requiredFields) {
        expect(DEFAULT_CONNECTION_CONFIG).toHaveProperty(field);
        expect(typeof DEFAULT_CONNECTION_CONFIG[field as keyof typeof DEFAULT_CONNECTION_CONFIG]).toBe('number');
      }
    });

    test('DEFAULT_RETRY_CONFIG 结构应保持稳定', () => {
      const requiredFields = [
        'maxRetries',
        'initialDelay',
        'maxDelay',
        'backoffMultiplier',
        'jitter'
      ];
      
      for (const field of requiredFields) {
        expect(DEFAULT_RETRY_CONFIG).toHaveProperty(field);
      }
      
      expect(typeof DEFAULT_RETRY_CONFIG.maxRetries).toBe('number');
      expect(typeof DEFAULT_RETRY_CONFIG.initialDelay).toBe('number');
      expect(typeof DEFAULT_RETRY_CONFIG.maxDelay).toBe('number');
      expect(typeof DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe('number');
      expect(typeof DEFAULT_RETRY_CONFIG.jitter).toBe('boolean');
    });

    test('DEFAULT_SUBSCRIPTION_CONFIG 结构应保持稳定', () => {
      expect(DEFAULT_SUBSCRIPTION_CONFIG).toHaveProperty('defaultSymbols');
      expect(DEFAULT_SUBSCRIPTION_CONFIG).toHaveProperty('supportedDataTypes');
      expect(DEFAULT_SUBSCRIPTION_CONFIG).toHaveProperty('batchSubscription');
      expect(DEFAULT_SUBSCRIPTION_CONFIG).toHaveProperty('management');
      
      expect(Array.isArray(DEFAULT_SUBSCRIPTION_CONFIG.defaultSymbols)).toBe(true);
      expect(Array.isArray(DEFAULT_SUBSCRIPTION_CONFIG.supportedDataTypes)).toBe(true);
      expect(typeof DEFAULT_SUBSCRIPTION_CONFIG.batchSubscription).toBe('object');
      expect(typeof DEFAULT_SUBSCRIPTION_CONFIG.management).toBe('object');
    });
  });

  describe('配置创建函数 API 稳定性', () => {
    test('createDevelopmentConfig 应返回一致的结构', () => {
      const config1 = createDevelopmentConfig();
      const config2 = createDevelopmentConfig();
      
      // 结构应该相同
      expect(Object.keys(config1).sort()).toEqual(Object.keys(config2).sort());
      
      // 值应该相同
      expect(config1).toEqual(config2);
      
      // 环境应该正确
      expect(config1.environment).toBe('development');
      expect(config2.environment).toBe('development');
    });

    test('createTestingConfig 应返回一致的结构', () => {
      const config = createTestingConfig();
      
      expect(config.environment).toBe('testing');
      expect(config).toHaveProperty('wsEndpoint');
      expect(config).toHaveProperty('restEndpoint');
      expect(config).toHaveProperty('connection');
      expect(config).toHaveProperty('retry');
      expect(config).toHaveProperty('subscriptions');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('monitoring');
    });

    test('createProductionConfig 应返回一致的结构', () => {
      const config = createProductionConfig();
      
      expect(config.environment).toBe('production');
      expect(config).toHaveProperty('credentials');
      expect(config.credentials?.useSecretManager).toBe(true);
    });
  });

  describe('配置加载函数 API 稳定性', () => {
    test('loadConfigFromEnv 应保持函数签名稳定', () => {
      // 函数应该不需要参数
      expect(() => loadConfigFromEnv()).not.toThrow();
      
      // 返回值应该是对象
      const result = loadConfigFromEnv();
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
    });

    test('getEnvironmentConfig 应保持函数签名稳定', () => {
      // 无参数调用
      const config1 = getEnvironmentConfig();
      expect(config1).toBeDefined();
      expect(config1.environment).toBeDefined();
      
      // 有参数调用
      const config2 = getEnvironmentConfig('development');
      expect(config2).toBeDefined();
      expect(config2.environment).toBe('development');
    });

    test('mergeConfigs 应保持函数签名稳定', () => {
      const base = createDevelopmentConfig();
      const override1 = { environment: 'testing' as const };
      const override2 = { logging: { level: 'warn' as const } };
      
      // 支持多个覆盖参数
      const merged = mergeConfigs(base, override1, override2);
      
      expect(merged.environment).toBe('testing');
      expect(merged.logging.level).toBe('warn');
    });
  });

  describe('配置验证函数 API 稳定性', () => {
    test('validateConfig 应返回一致的结果结构', () => {
      const config = createDevelopmentConfig();
      const result = validateConfig(config);
      
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    test('validateConfigOrThrow 应保持错误抛出行为', () => {
      const validConfig = createDevelopmentConfig();
      const invalidConfig = { wsEndpoint: 'invalid' } as any;
      
      // 有效配置不应抛出错误
      expect(() => validateConfigOrThrow(validConfig)).not.toThrow();
      
      // 无效配置应抛出 ConfigurationError
      expect(() => validateConfigOrThrow(invalidConfig)).toThrow(ConfigurationError);
    });
  });

  describe('ConfigManager API 稳定性', () => {
    test('ConfigManager 构造函数应保持选项结构稳定', () => {
      // 无参数构造
      const manager1 = createConfigManager();
      expect(manager1).toBeInstanceOf(ConfigManager);
      
      // 有选项构造
      const manager2 = createConfigManager({
        configPath: undefined,
        enableValidation: true,
        enableSecretManager: false,
        credentialsCacheTtl: 3600000,
        preloadCredentials: false
      });
      expect(manager2).toBeInstanceOf(ConfigManager);
      
      manager1.destroy();
      manager2.destroy();
    });

    test('ConfigManager 公共方法应保持稳定', () => {
      const manager = createConfigManager();
      
      // 检查所有公共方法存在
      expect(typeof manager.initialize).toBe('function');
      expect(typeof manager.getConfig).toBe('function');
      expect(typeof manager.getCredentials).toBe('function');
      expect(typeof manager.reloadConfig).toBe('function');
      expect(typeof manager.reloadCredentials).toBe('function');
      expect(typeof manager.updateConfig).toBe('function');
      expect(typeof manager.getConfigSummary).toBe('function');
      expect(typeof manager.validateCurrentConfig).toBe('function');
      expect(typeof manager.isConfigLoaded).toBe('function');
      expect(typeof manager.destroy).toBe('function');
      
      // EventEmitter 方法
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.off).toBe('function');
      expect(typeof manager.emit).toBe('function');
      
      manager.destroy();
    });

    test('ConfigManagerEvent 枚举应保持稳定', () => {
      const expectedEvents = [
        'config_loaded',
        'config_updated',
        'config_error',
        'credentials_loaded',
        'credentials_error'
      ];
      
      for (const event of expectedEvents) {
        expect(Object.values(ConfigManagerEvent)).toContain(event);
      }
    });

    test('全局 ConfigManager 函数应保持稳定', () => {
      expect(typeof getConfigManager).toBe('function');
      expect(typeof destroyConfigManager).toBe('function');
      expect(typeof createConfigManager).toBe('function');
      
      // 测试单例行为
      const manager1 = getConfigManager();
      const manager2 = getConfigManager();
      expect(manager1).toBe(manager2);
      
      destroyConfigManager();
      
      const manager3 = getConfigManager();
      expect(manager3).not.toBe(manager1);
    });
  });

  describe('Secret Manager API 稳定性', () => {
    test('Secret Manager 函数签名应保持稳定', () => {
      // 检查函数存在性和参数数量
      expect(loadCredentialsFromSecretManager.length).toBeGreaterThanOrEqual(2);
      expect(checkSecretManagerAvailable.length).toBe(1);
      expect(createOrUpdateSecret.length).toBe(3);
      expect(deleteSecret.length).toBe(2);
      expect(listBinanceSecrets.length).toBe(1);
      expect(clearCredentialsCache.length).toBeLessThanOrEqual(1);
      expect(getCacheStats.length).toBe(0);
      expect(cleanupExpiredCache.length).toBe(0);
    });

    test('getCacheStats 应返回一致的结构', () => {
      const stats = getCacheStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('expired');
      
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.expired).toBe('number');
    });
  });

  describe('向后兼容性测试', () => {
    test('旧版本的配置结构应仍然有效', () => {
      // 模拟旧版本可能的配置结构
      const legacyConfig = {
        wsEndpoint: 'wss://stream.binance.com:9443',
        restEndpoint: 'https://api.binance.com',
        environment: 'development',
        connection: {
          maxConnections: 5,
          maxStreamsPerConnection: 100,
          heartbeatInterval: 20000,
          pingTimeout: 25000,
          connectionTimeout: 30000
        },
        retry: {
          maxRetries: 10,
          initialDelay: 1000,
          maxDelay: 15000,
          backoffMultiplier: 2.0,
          jitter: true
        },
        subscriptions: {
          defaultSymbols: ['BTCUSDT'],
          supportedDataTypes: ['trade'],
          batchSubscription: {
            enabled: true,
            batchSize: 50,
            batchInterval: 1000
          },
          management: {
            autoResubscribe: true,
            subscriptionTimeout: 10000,
            maxConcurrentSubscriptions: 200
          }
        },
        logging: {
          level: 'info' as const,
          format: 'json' as const,
          structured: true
        },
        monitoring: {
          prometheus: {
            enabled: true,
            port: 9090,
            path: '/metrics'
          },
          healthCheck: {
            interval: 30000,
            timeout: 5000
          }
        }
      };
      
      // 旧配置应该通过验证
      const validation = validateConfig(legacyConfig);
      expect(validation.valid).toBe(true);
    });

    test('函数返回值格式应保持向后兼容', async () => {
      const config = await loadConfig();
      
      // 检查返回的配置对象具有预期的结构
      expect(config).toMatchObject({
        wsEndpoint: expect.any(String),
        restEndpoint: expect.any(String),
        environment: expect.stringMatching(/^(development|testing|production)$/),
        connection: expect.objectContaining({
          maxConnections: expect.any(Number),
          maxStreamsPerConnection: expect.any(Number),
          heartbeatInterval: expect.any(Number),
          pingTimeout: expect.any(Number),
          connectionTimeout: expect.any(Number)
        }),
        retry: expect.objectContaining({
          maxRetries: expect.any(Number),
          initialDelay: expect.any(Number),
          maxDelay: expect.any(Number),
          backoffMultiplier: expect.any(Number),
          jitter: expect.any(Boolean)
        }),
        subscriptions: expect.objectContaining({
          defaultSymbols: expect.any(Array),
          supportedDataTypes: expect.any(Array),
          batchSubscription: expect.any(Object),
          management: expect.any(Object)
        }),
        logging: expect.objectContaining({
          level: expect.stringMatching(/^(debug|info|warn|error)$/),
          format: expect.stringMatching(/^(json|text)$/),
          structured: expect.any(Boolean)
        }),
        monitoring: expect.objectContaining({
          prometheus: expect.any(Object),
          healthCheck: expect.any(Object)
        })
      });
    });
  });

  describe('错误处理 API 稳定性', () => {
    test('错误类型和消息格式应保持一致', async () => {
      // 测试配置文件不存在的错误
      try {
        await loadConfigFromFile('/nonexistent/file.json');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(error.message).toContain('Failed to load config from file');
      }
      
      // 测试验证错误
      try {
        validateConfigOrThrow({} as any);
        fail('Expected validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(error.message).toContain('Configuration validation failed');
      }
    });

    test('异步函数错误处理应保持一致', async () => {
      const manager = createConfigManager({
        configPath: '/nonexistent/config.json'
      });
      
      await expect(manager.initialize()).rejects.toThrow(ConfigurationError);
      
      manager.destroy();
    });
  });
});