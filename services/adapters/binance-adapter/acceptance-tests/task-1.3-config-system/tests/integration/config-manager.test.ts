/**
 * 集成测试 - 配置管理器
 * 
 * 测试 ConfigManager 类的完整功能，包括：
 * - 配置管理器的初始化和生命周期
 * - 配置加载和验证集成
 * - 事件处理机制
 * - 配置热更新功能
 * - 与其他组件的集成
 */

import { resolve } from 'path';
import {
  ConfigManager,
  ConfigManagerEvent,
  createConfigManager,
  getConfigManager,
  destroyConfigManager,
  ConfigurationError
} from '../../../../../src/config';
import { ConfigFactory } from '../../fixtures/helpers/config-factory';
import { FileTestUtils, EnvTestUtils } from '../../fixtures/helpers/test-utils';

// Mock Secret Manager 以避免真实的 Google Cloud 调用
jest.mock('@google-cloud/secret-manager');

describe('集成测试 - 配置管理器', () => {
  let configManager: ConfigManager;

  afterEach(async () => {
    // 清理配置管理器
    if (configManager) {
      configManager.destroy();
    }
    destroyConfigManager();
    EnvTestUtils.restoreAll();
    await FileTestUtils.cleanupTempDir();
  });

  describe('配置管理器初始化', () => {
    test('应能创建配置管理器实例', () => {
      configManager = createConfigManager();
      
      expect(configManager).toBeInstanceOf(ConfigManager);
      expect(configManager.isConfigLoaded()).toBe(false);
    });

    test('应能使用选项创建配置管理器', () => {
      configManager = createConfigManager({
        enableValidation: false,
        enableSecretManager: false,
        preloadCredentials: true
      });
      
      expect(configManager).toBeInstanceOf(ConfigManager);
    });

    test('getConfigManager 应返回单例实例', () => {
      const manager1 = getConfigManager();
      const manager2 = getConfigManager();
      
      expect(manager1).toBe(manager2);
      expect(manager1).toBeInstanceOf(ConfigManager);
    });
  });

  describe('配置加载集成', () => {
    test('应能初始化并加载配置', async () => {
      EnvTestUtils.setTestEnvVars({ 'NODE_ENV': 'testing' });
      
      configManager = createConfigManager();
      await configManager.initialize();
      
      expect(configManager.isConfigLoaded()).toBe(true);
      
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.environment).toBe('testing');
    });

    test('应能使用配置文件初始化', async () => {
      const configData = ConfigFactory.createValidConfig({ environment: 'development' });
      const configFile = await FileTestUtils.createTempConfigFile(configData);
      
      configManager = createConfigManager({ configPath: configFile });
      await configManager.initialize();
      
      expect(configManager.isConfigLoaded()).toBe(true);
      
      const config = configManager.getConfig();
      expect(config.environment).toBe('development');
    });

    test('应在初始化失败时抛出错误', async () => {
      const nonExistentFile = '/path/to/nonexistent/config.json';
      
      configManager = createConfigManager({ configPath: nonExistentFile });
      
      await expect(configManager.initialize()).rejects.toThrow(ConfigurationError);
      expect(configManager.isConfigLoaded()).toBe(false);
    });

    test('应在配置验证失败时抛出错误', async () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('missing-required');
      const configFile = await FileTestUtils.createTempConfigFile(invalidConfig);
      
      configManager = createConfigManager({ 
        configPath: configFile,
        enableValidation: true 
      });
      
      await expect(configManager.initialize()).rejects.toThrow(ConfigurationError);
    });

    test('应在禁用验证时接受无效配置', async () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('missing-required');
      const configFile = await FileTestUtils.createTempConfigFile(invalidConfig);
      
      configManager = createConfigManager({ 
        configPath: configFile,
        enableValidation: false 
      });
      
      // 不应抛出错误
      await expect(configManager.initialize()).resolves.toBeUndefined();
      expect(configManager.isConfigLoaded()).toBe(true);
    });
  });

  describe('配置获取功能', () => {
    beforeEach(async () => {
      configManager = createConfigManager();
      await configManager.initialize();
    });

    test('getConfig 应返回加载的配置', () => {
      const config = configManager.getConfig();
      
      expect(config).toBeDefined();
      expect(config).toBeValidConfig();
    });

    test('getConfig 应在未初始化时抛出错误', () => {
      const uninitializedManager = createConfigManager();
      
      expect(() => uninitializedManager.getConfig()).toThrow('Configuration not loaded');
    });

    test('getConfigSummary 应返回不含敏感信息的配置摘要', () => {
      // 添加带凭据的配置
      const configWithCredentials = ConfigFactory.createValidConfig({ withCredentials: true });
      const summary = configManager.getConfigSummary();
      
      expect(summary).toBeDefined();
      expect(summary.environment).toBeDefined();
      expect(summary.wsEndpoint).toBeDefined();
      expect(summary.connection).toBeDefined();
      
      // 不应包含实际的 API 密钥
      if (summary.credentials) {
        expect(summary.credentials.apiKey).toBeUndefined();
        expect(summary.credentials.apiSecret).toBeUndefined();
        expect(typeof summary.credentials.hasApiKey).toBe('boolean');
        expect(typeof summary.credentials.hasApiSecret).toBe('boolean');
      }
    });
  });

  describe('配置验证集成', () => {
    test('validateCurrentConfig 应验证当前配置', async () => {
      configManager = createConfigManager();
      await configManager.initialize();
      
      const validation = configManager.validateCurrentConfig();
      
      expect(validation).toBeDefined();
      expect(typeof validation.valid).toBe('boolean');
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });

    test('validateCurrentConfig 应在未加载配置时返回错误', () => {
      configManager = createConfigManager();
      
      const validation = configManager.validateCurrentConfig();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].field).toBe('config');
      expect(validation.errors[0].message).toContain('Configuration not loaded');
    });
  });

  describe('配置更新功能', () => {
    beforeEach(async () => {
      configManager = createConfigManager();
      await configManager.initialize();
    });

    test('updateConfig 应更新现有配置', async () => {
      const originalConfig = configManager.getConfig();
      const update = { environment: 'production' as const };
      
      await configManager.updateConfig(update);
      
      const updatedConfig = configManager.getConfig();
      expect(updatedConfig.environment).toBe('production');
      expect(updatedConfig.wsEndpoint).toBe(originalConfig.wsEndpoint); // 其他字段保持不变
    });

    test('updateConfig 应在验证失败时拒绝更新', async () => {
      const invalidUpdate = { environment: 'invalid-env' as any };
      
      await expect(configManager.updateConfig(invalidUpdate))
        .rejects.toThrow(ConfigurationError);
      
      // 配置应保持不变
      const config = configManager.getConfig();
      expect(config.environment).not.toBe('invalid-env');
    });

    test('reloadConfig 应重新加载配置', async () => {
      const configFile = await FileTestUtils.createTempConfigFile(
        ConfigFactory.createValidConfig({ environment: 'development' })
      );
      
      configManager = createConfigManager({ configPath: configFile });
      await configManager.initialize();
      
      expect(configManager.getConfig().environment).toBe('development');
      
      // 更新配置文件
      await FileTestUtils.createTempConfigFile(
        ConfigFactory.createValidConfig({ environment: 'testing' }),
        'json',
        configFile.split('/').pop()
      );
      
      await configManager.reloadConfig();
      expect(configManager.getConfig().environment).toBe('testing');
    });
  });

  describe('事件处理机制', () => {
    beforeEach(() => {
      configManager = createConfigManager();
    });

    test('应在配置加载时触发 CONFIG_LOADED 事件', async () => {
      const eventHandler = jest.fn();
      configManager.on(ConfigManagerEvent.CONFIG_LOADED, eventHandler);
      
      await configManager.initialize();
      
      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(expect.any(Object));
    });

    test('应在配置更新时触发 CONFIG_UPDATED 事件', async () => {
      await configManager.initialize();
      
      const eventHandler = jest.fn();
      configManager.on(ConfigManagerEvent.CONFIG_UPDATED, eventHandler);
      
      await configManager.updateConfig({ environment: 'production' });
      
      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(expect.any(Object));
    });

    test('应在配置错误时触发 CONFIG_ERROR 事件', async () => {
      const eventHandler = jest.fn();
      configManager.on(ConfigManagerEvent.CONFIG_ERROR, eventHandler);
      
      // 使用不存在的配置文件触发错误
      configManager = createConfigManager({ configPath: '/nonexistent/config.json' });
      
      try {
        await configManager.initialize();
      } catch (error) {
        // 预期的错误
      }
      
      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    test('应支持多个事件监听器', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      configManager.on(ConfigManagerEvent.CONFIG_LOADED, handler1);
      configManager.on(ConfigManagerEvent.CONFIG_LOADED, handler2);
      
      await configManager.initialize();
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test('应能移除事件监听器', async () => {
      const eventHandler = jest.fn();
      
      configManager.on(ConfigManagerEvent.CONFIG_LOADED, eventHandler);
      configManager.off(ConfigManagerEvent.CONFIG_LOADED, eventHandler);
      
      await configManager.initialize();
      
      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe('凭据管理集成', () => {
    test('应能获取配置中的凭据', async () => {
      const configWithCredentials = ConfigFactory.createValidConfig({ 
        withCredentials: true,
        withSecretManager: false 
      });
      const configFile = await FileTestUtils.createTempConfigFile(configWithCredentials);
      
      configManager = createConfigManager({ 
        configPath: configFile,
        enableSecretManager: false 
      });
      await configManager.initialize();
      
      const credentials = await configManager.getCredentials();
      
      expect(credentials).toBeDefined();
      expect(credentials!.apiKey).toBeDefined();
      expect(credentials!.apiSecret).toBeDefined();
    });

    test('应在未初始化时拒绝获取凭据', async () => {
      configManager = createConfigManager();
      
      await expect(configManager.getCredentials())
        .rejects.toThrow('Config manager not initialized');
    });

    test('应在预加载凭据选项启用时预加载凭据', async () => {
      const configWithCredentials = ConfigFactory.createValidConfig({ 
        withCredentials: true,
        withSecretManager: false 
      });
      const configFile = await FileTestUtils.createTempConfigFile(configWithCredentials);
      
      configManager = createConfigManager({ 
        configPath: configFile,
        enableSecretManager: false,
        preloadCredentials: true 
      });
      
      const credentialsLoadedHandler = jest.fn();
      configManager.on(ConfigManagerEvent.CREDENTIALS_LOADED, credentialsLoadedHandler);
      
      await configManager.initialize();
      
      // 凭据应该已经被预加载
      expect(credentialsLoadedHandler).toHaveBeenCalled();
    });
  });

  describe('错误处理和恢复', () => {
    test('应在配置文件损坏时提供有用的错误信息', async () => {
      const corruptedFile = await FileTestUtils.createTempConfigFile('corrupted json', 'json');
      
      configManager = createConfigManager({ configPath: corruptedFile });
      
      try {
        await configManager.initialize();
        fail('Expected initialization to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).message).toContain('Failed to load config from file');
      }
    });

    test('应在验证错误时提供详细信息', async () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('wrong-types');
      const configFile = await FileTestUtils.createTempConfigFile(invalidConfig);
      
      configManager = createConfigManager({ 
        configPath: configFile,
        enableValidation: true 
      });
      
      try {
        await configManager.initialize();
        fail('Expected validation to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).message).toContain('Configuration validation failed');
      }
    });

    test('应能从配置更新错误中恢复', async () => {
      configManager = createConfigManager();
      await configManager.initialize();
      
      const originalConfig = configManager.getConfig();
      
      // 尝试无效更新
      try {
        await configManager.updateConfig({ environment: 'invalid' as any });
        fail('Expected update to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
      }
      
      // 配置应保持原状
      const currentConfig = configManager.getConfig();
      expect(currentConfig.environment).toBe(originalConfig.environment);
      
      // 应能进行后续的有效更新
      await configManager.updateConfig({ environment: 'production' });
      expect(configManager.getConfig().environment).toBe('production');
    });
  });

  describe('生命周期管理', () => {
    test('destroy 应清理资源', async () => {
      configManager = createConfigManager();
      await configManager.initialize();
      
      expect(configManager.isConfigLoaded()).toBe(true);
      
      configManager.destroy();
      
      expect(configManager.isConfigLoaded()).toBe(false);
      expect(() => configManager.getConfig()).toThrow();
    });

    test('destroy 应移除所有事件监听器', async () => {
      configManager = createConfigManager();
      
      const eventHandler = jest.fn();
      configManager.on(ConfigManagerEvent.CONFIG_LOADED, eventHandler);
      
      await configManager.initialize();
      expect(eventHandler).toHaveBeenCalledTimes(1);
      
      configManager.destroy();
      
      // 重新初始化不应触发之前的监听器
      configManager = createConfigManager();
      await configManager.initialize();
      
      expect(eventHandler).toHaveBeenCalledTimes(1); // 仍然是1次
    });

    test('全局配置管理器应能正确销毁和重建', () => {
      const manager1 = getConfigManager();
      destroyConfigManager();
      const manager2 = getConfigManager();
      
      expect(manager1).not.toBe(manager2);
    });
  });

  describe('并发访问测试', () => {
    test('应能处理并发的配置获取请求', async () => {
      configManager = createConfigManager();
      await configManager.initialize();
      
      const concurrentRequests = Array.from({ length: 10 }, () => 
        Promise.resolve(configManager.getConfig())
      );
      
      const configs = await Promise.all(concurrentRequests);
      
      // 所有返回的配置应该相同
      for (const config of configs) {
        expect(config).toEqual(configs[0]);
      }
    });

    test('应能处理并发的凭据获取请求', async () => {
      const configWithCredentials = ConfigFactory.createValidConfig({ 
        withCredentials: true,
        withSecretManager: false 
      });
      const configFile = await FileTestUtils.createTempConfigFile(configWithCredentials);
      
      configManager = createConfigManager({ 
        configPath: configFile,
        enableSecretManager: false 
      });
      await configManager.initialize();
      
      const concurrentRequests = Array.from({ length: 5 }, () => 
        configManager.getCredentials()
      );
      
      const credentialsResults = await Promise.all(concurrentRequests);
      
      // 所有返回的凭据应该相同
      for (const credentials of credentialsResults) {
        expect(credentials).toEqual(credentialsResults[0]);
      }
    });
  });
});