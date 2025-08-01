/**
 * 简化的配置系统单元测试
 * 
 * 专注于核心功能，避免复杂的类型检查问题
 */

import { 
  createDevelopmentConfig,
  createTestingConfig,
  createProductionConfig,
  getEnvironmentConfig
} from '../index';
import { validateConfig } from '../validator';
import { ConfigManager } from '../manager';

describe('Binance Adapter Configuration - Core Features', () => {
  
  test('should create development configuration correctly', () => {
    const config = createDevelopmentConfig();
    
    expect(config.environment).toBe('development');
    expect(config.wsEndpoint).toBe('wss://stream.binance.com:9443');
    expect(config.connection.maxConnections).toBe(2);
    expect(config.logging.level).toBe('debug');
    expect(config.subscriptions.defaultSymbols).toContain('BTCUSDT');
  });

  test('should create testing configuration correctly', () => {
    const config = createTestingConfig();
    
    expect(config.environment).toBe('testing');
    expect(config.wsEndpoint).toBe('wss://testnet.binance.vision/ws');
    expect(config.connection.maxConnections).toBe(1);
    expect(config.subscriptions.batchSubscription.enabled).toBe(false);
  });

  test('should create production configuration correctly', () => {
    const config = createProductionConfig();
    
    expect(config.environment).toBe('production');
    expect(config.connection.maxConnections).toBe(10);
    expect(config.credentials?.useSecretManager).toBe(true);
  });

  test('should validate correct configuration', () => {
    const config = createDevelopmentConfig();
    const result = validateConfig(config);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should detect invalid configuration', () => {
    const config = createDevelopmentConfig();
    // 修改为无效值
    (config as any).wsEndpoint = 'invalid-url';
    (config as any).connection.maxConnections = -1;
    
    const result = validateConfig(config);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('should auto-detect environment from NODE_ENV', () => {
    const originalEnv = process.env['NODE_ENV'];
    
    try {
      process.env['NODE_ENV'] = 'production';
      const config = getEnvironmentConfig();
      expect(config.environment).toBe('production');
      
      process.env['NODE_ENV'] = 'development';
      const devConfig = getEnvironmentConfig();
      expect(devConfig.environment).toBe('development');
      
    } finally {
      if (originalEnv) {
        process.env['NODE_ENV'] = originalEnv;
      } else {
        delete process.env['NODE_ENV'];
      }
    }
  });

  test('should initialize ConfigManager successfully', async () => {
    const configManager = new ConfigManager({
      enableValidation: true,
      enableSecretManager: false
    });

    expect(configManager.isConfigLoaded()).toBe(false);
    
    await configManager.initialize();
    
    expect(configManager.isConfigLoaded()).toBe(true);
    
    const config = configManager.getConfig();
    expect(config).toBeDefined();
    expect(config.environment).toBeDefined();
    
    configManager.destroy();
  });

  test('should validate configuration through ConfigManager', async () => {
    const configManager = new ConfigManager({
      enableValidation: true,
      enableSecretManager: false
    });

    await configManager.initialize();
    
    const validation = configManager.validateCurrentConfig();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    
    configManager.destroy();
  });

  test('should get configuration summary without sensitive data', async () => {
    const configManager = new ConfigManager({
      enableValidation: true,
      enableSecretManager: false
    });

    await configManager.initialize();
    
    const summary = configManager.getConfigSummary();
    expect(summary).toBeDefined();
    expect(summary.environment).toBeDefined();
    expect(summary.subscriptions).toBeDefined();
    expect(summary.subscriptions.defaultSymbols).toBeDefined();
    
    // 确保敏感信息被隐藏
    if (summary.credentials) {
      expect(summary.credentials.hasApiKey).toBeDefined();
      expect(summary.credentials.hasApiSecret).toBeDefined();
      expect(summary.credentials.apiKey).toBeUndefined();
      expect(summary.credentials.apiSecret).toBeUndefined();
    }
    
    configManager.destroy();
  });

  test('should handle configuration updates', async () => {
    const configManager = new ConfigManager({
      enableValidation: true,
      enableSecretManager: false
    });

    await configManager.initialize();
    
    const originalConfig = configManager.getConfig();
    const originalLevel = originalConfig.logging.level;
    const newLevel = originalLevel === 'debug' ? 'info' : 'debug';
    
    await configManager.updateConfig({
      logging: {
        level: newLevel,
        format: originalConfig.logging.format,
        structured: originalConfig.logging.structured
      }
    });
    
    const updatedConfig = configManager.getConfig();
    expect(updatedConfig.logging.level).toBe(newLevel);
    
    configManager.destroy();
  });

  test('should throw error when accessing config before initialization', () => {
    const configManager = new ConfigManager();
    
    expect(() => configManager.getConfig()).toThrow();
    
    configManager.destroy();
  });
});