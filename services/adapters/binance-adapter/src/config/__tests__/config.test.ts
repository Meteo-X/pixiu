/**
 * 配置系统单元测试
 */

import { 
  createDevelopmentConfig,
  createTestingConfig,
  createProductionConfig,
  loadConfigFromEnv,
  mergeConfigs,
  getEnvironmentConfig
} from '../index';
import { validateConfig, validateConfigOrThrow } from '../validator';
import { ConfigManager, ConfigManagerEvent } from '../manager';

describe('Binance Adapter Configuration System', () => {
  
  describe('Environment Configurations', () => {
    test('should create development configuration', () => {
      const config = createDevelopmentConfig();
      
      expect(config.environment).toBe('development');
      expect(config.wsEndpoint).toBe('wss://stream.binance.com:9443');
      expect(config.connection.maxConnections).toBe(2);
      expect(config.logging.level).toBe('debug');
      expect(config.logging.format).toBe('text');
    });

    test('should create testing configuration', () => {
      const config = createTestingConfig();
      
      expect(config.environment).toBe('testing');
      expect(config.wsEndpoint).toBe('wss://testnet.binance.vision/ws');
      expect(config.connection.maxConnections).toBe(1);
      expect(config.subscriptions.batchSubscription.enabled).toBe(false);
      expect(config.monitoring?.prometheus.enabled).toBe(false);
    });

    test('should create production configuration', () => {
      const config = createProductionConfig();
      
      expect(config.environment).toBe('production');
      expect(config.connection.maxConnections).toBe(10);
      expect(config.credentials?.useSecretManager).toBe(true);
      expect(config.logging.level).toBe('info');
      expect(config.logging.format).toBe('json');
    });
  });

  describe('Environment Detection', () => {
    const originalEnv = process.env['NODE_ENV'];

    afterEach(() => {
      if (originalEnv) {
        process.env['NODE_ENV'] = originalEnv;
      } else {
        delete process.env['NODE_ENV'];
      }
    });

    test('should detect development environment', () => {
      process.env['NODE_ENV'] = 'development';
      const config = getEnvironmentConfig();
      expect(config.environment).toBe('development');
    });

    test('should detect testing environment', () => {
      process.env['NODE_ENV'] = 'testing';
      const config = getEnvironmentConfig();
      expect(config.environment).toBe('testing');
    });

    test('should detect production environment', () => {
      process.env['NODE_ENV'] = 'production';
      const config = getEnvironmentConfig();
      expect(config.environment).toBe('production');
    });

    test('should default to development for unknown environment', () => {
      process.env['NODE_ENV'] = 'unknown';
      const config = getEnvironmentConfig();
      expect(config.environment).toBe('development');
    });
  });

  describe('Environment Variables Loading', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      // 恢复原始环境变量
      process.env = { ...originalEnv };
    });

    test('should load WebSocket endpoint from environment', () => {
      process.env['BINANCE_WS_ENDPOINT'] = 'wss://test.example.com';
      
      const config = loadConfigFromEnv();
      expect(config.wsEndpoint).toBe('wss://test.example.com');
    });

    test('should load connection config from environment', () => {
      process.env['BINANCE_MAX_CONNECTIONS'] = '5';
      process.env['BINANCE_MAX_STREAMS_PER_CONNECTION'] = '500';
      process.env['BINANCE_CONNECTION_TIMEOUT'] = '15000';
      
      const config = loadConfigFromEnv();
      expect(config.connection?.maxConnections).toBe(5);
      expect(config.connection?.maxStreamsPerConnection).toBe(500);
      expect(config.connection?.connectionTimeout).toBe(15000);
    });

    test('should load credentials config from environment', () => {
      process.env['BINANCE_API_KEY'] = 'test-key';
      process.env['BINANCE_API_SECRET'] = 'test-secret';
      process.env['BINANCE_USE_SECRET_MANAGER'] = 'true';
      process.env['BINANCE_SECRET_NAME'] = 'test-secret';
      
      const config = loadConfigFromEnv();
      expect(config.credentials?.apiKey).toBe('test-key');
      expect(config.credentials?.apiSecret).toBe('test-secret');
      expect(config.credentials?.useSecretManager).toBe(true);
      expect(config.credentials?.secretName).toBe('test-secret');
    });

    test('should load logging config from environment', () => {
      process.env['LOG_LEVEL'] = 'warn';
      process.env['LOG_FORMAT'] = 'json';
      
      const config = loadConfigFromEnv();
      expect(config.logging?.level).toBe('warn');
      expect(config.logging?.format).toBe('json');
    });
  });

  describe('Configuration Merging', () => {
    test('should merge configurations correctly', () => {
      const baseConfig = createDevelopmentConfig();
      const override1 = {
        connection: {
          ...baseConfig.connection,
          maxConnections: 10
        }
      };
      const override2 = {
        logging: {
          ...baseConfig.logging,
          level: 'error' as const
        }
      };
      
      const merged = mergeConfigs(baseConfig, override1, override2);
      
      expect(merged.connection.maxConnections).toBe(10);
      expect(merged.logging.level).toBe('error');
      expect(merged.environment).toBe(baseConfig.environment); // 未被覆盖的值保持不变
    });

    test('should deeply merge nested objects', () => {
      const baseConfig = createDevelopmentConfig();
      const override = {
        subscriptions: {
          ...baseConfig.subscriptions,
          batchSubscription: {
            ...baseConfig.subscriptions.batchSubscription,
            batchSize: 50
          }
        }
      };
      
      const merged = mergeConfigs(baseConfig, override);
      
      expect(merged.subscriptions.batchSubscription.batchSize).toBe(50);
      expect(merged.subscriptions.batchSubscription.enabled).toBe(
        baseConfig.subscriptions.batchSubscription.enabled
      ); // 其他值保持不变
    });
  });

  describe('Configuration Validation', () => {
    test('should validate correct configuration', () => {
      const config = createDevelopmentConfig();
      const result = validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid WebSocket endpoint', () => {
      const config = createDevelopmentConfig();
      config.wsEndpoint = 'invalid-url';
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'wsEndpoint')).toBe(true);
    });

    test('should detect invalid connection configuration', () => {
      const config = createDevelopmentConfig();
      config.connection.maxConnections = -1;
      config.connection.maxStreamsPerConnection = 2000; // 超过 Binance 限制
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'connection.maxConnections')).toBe(true);
      expect(result.errors.some(e => e.field === 'connection.maxStreamsPerConnection')).toBe(true);
    });

    test('should detect invalid retry configuration', () => {
      const config = createDevelopmentConfig();
      config.retry.maxRetries = 0;
      config.retry.maxDelay = 100; // 小于 initialDelay
      config.retry.backoffMultiplier = 0.5; // 小于 1.0
      
      const result = validateConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'retry.maxRetries')).toBe(true);
      expect(result.errors.some(e => e.field === 'retry.maxDelay')).toBe(true);
      expect(result.errors.some(e => e.field === 'retry.backoffMultiplier')).toBe(true);
    });

    test('should throw error for invalid configuration when using validateConfigOrThrow', () => {
      const config = createDevelopmentConfig();
      config.wsEndpoint = 'invalid-url';
      
      expect(() => validateConfigOrThrow(config)).toThrow();
    });

    test('should not throw error for valid configuration when using validateConfigOrThrow', () => {
      const config = createDevelopmentConfig();
      
      expect(() => validateConfigOrThrow(config)).not.toThrow();
    });
  });

  describe('ConfigManager', () => {
    let configManager: ConfigManager;

    afterEach(() => {
      if (configManager) {
        configManager.destroy();
      }
    });

    test('should initialize successfully', async () => {
      configManager = new ConfigManager({
        enableValidation: true,
        enableSecretManager: false
      });

      expect(configManager.isConfigLoaded()).toBe(false);
      
      await configManager.initialize();
      
      expect(configManager.isConfigLoaded()).toBe(true);
    });

    test('should get configuration after initialization', async () => {
      configManager = new ConfigManager({
        enableValidation: true,
        enableSecretManager: false
      });

      await configManager.initialize();
      
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.environment).toBeDefined();
    });

    test('should get configuration summary', async () => {
      configManager = new ConfigManager({
        enableValidation: true,
        enableSecretManager: false
      });

      await configManager.initialize();
      
      const summary = configManager.getConfigSummary();
      expect(summary).toBeDefined();
      expect(summary.environment).toBeDefined();
      expect(summary.subscriptions).toBeDefined();
    });

    test('should update configuration', async () => {
      configManager = new ConfigManager({
        enableValidation: true,
        enableSecretManager: false
      });

      await configManager.initialize();
      
      const originalConfig = configManager.getConfig();
      const originalLevel = originalConfig.logging.level;
      const newLevel = originalLevel === 'debug' ? 'info' : 'debug';
      
      await configManager.updateConfig({
        logging: {
          ...originalConfig.logging,
          level: newLevel
        }
      });
      
      const updatedConfig = configManager.getConfig();
      expect(updatedConfig.logging.level).toBe(newLevel);
    });

    test('should validate current configuration', async () => {
      configManager = new ConfigManager({
        enableValidation: true,
        enableSecretManager: false
      });

      await configManager.initialize();
      
      const validation = configManager.validateCurrentConfig();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should emit CONFIG_LOADED event on initialization', async () => {
      configManager = new ConfigManager({
        enableValidation: true,
        enableSecretManager: false
      });

      let eventEmitted = false;
      configManager.on(ConfigManagerEvent.CONFIG_LOADED, () => {
        eventEmitted = true;
      });

      await configManager.initialize();
      
      expect(eventEmitted).toBe(true);
    });

    test('should emit CONFIG_UPDATED event on configuration update', async () => {
      configManager = new ConfigManager({
        enableValidation: true,
        enableSecretManager: false
      });

      await configManager.initialize();
      
      let eventEmitted = false;
      configManager.on(ConfigManagerEvent.CONFIG_UPDATED, () => {
        eventEmitted = true;
      });

      await configManager.updateConfig({
        logging: {
          ...configManager.getConfig().logging,
          level: 'error'
        }
      });
      
      expect(eventEmitted).toBe(true);
    });

    test('should throw error when getting config before initialization', () => {
      configManager = new ConfigManager();
      
      expect(() => configManager.getConfig()).toThrow();
    });
  });
});