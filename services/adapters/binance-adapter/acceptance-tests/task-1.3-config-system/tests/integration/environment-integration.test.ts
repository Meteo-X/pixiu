/**
 * 集成测试 - 环境变量集成
 * 
 * 测试配置系统与环境变量的完整集成：
 * - 环境变量到配置的映射
 * - 不同环境下的集成行为
 * - 环境变量优先级处理
 * - 配置文件与环境变量的协同工作
 * - 运行时环境变量变更的处理
 */

import {
  loadConfig,
  loadConfigFromEnv,
  getEnvironmentConfig,
  ConfigManager,
  createConfigManager,
  BinanceAdapterConfig
} from '../../../../../src/config';
import { ConfigFactory } from '../../fixtures/helpers/config-factory';
import { EnvTestUtils, FileTestUtils } from '../../fixtures/helpers/test-utils';

describe('集成测试 - 环境变量集成', () => {
  afterEach(() => {
    EnvTestUtils.restoreAll();
  });

  afterAll(async () => {
    await FileTestUtils.cleanupTempDir();
  });

  describe('环境变量映射验证', () => {
    test('应正确映射所有支持的环境变量', () => {
      const testEnvVars = {
        // 基础配置
        'BINANCE_WS_ENDPOINT': 'wss://test.binance.com/ws',
        'BINANCE_REST_ENDPOINT': 'https://test.binance.com/api',
        'NODE_ENV': 'testing',
        
        // 连接配置
        'BINANCE_MAX_CONNECTIONS': '8',
        'BINANCE_MAX_STREAMS_PER_CONNECTION': '200',
        'BINANCE_CONNECTION_TIMEOUT': '25000',
        
        // 重试配置
        'BINANCE_MAX_RETRIES': '15',
        'BINANCE_INITIAL_DELAY': '750',
        'BINANCE_MAX_DELAY': '12000',
        
        // 凭据配置
        'BINANCE_API_KEY': 'env-api-key-12345',
        'BINANCE_API_SECRET': 'env-api-secret-67890',
        'BINANCE_USE_SECRET_MANAGER': 'true',
        'BINANCE_SECRET_NAME': 'env-credentials',
        
        // 日志配置
        'LOG_LEVEL': 'warn',
        'LOG_FORMAT': 'text'
      };

      EnvTestUtils.setTestEnvVars(testEnvVars);
      
      const config = loadConfigFromEnv();

      // 验证基础配置映射
      expect(config.wsEndpoint).toBe('wss://test.binance.com/ws');
      expect(config.restEndpoint).toBe('https://test.binance.com/api');
      expect(config.environment).toBe('testing');

      // 验证连接配置映射
      expect(config.connection?.maxConnections).toBe(8);
      expect(config.connection?.maxStreamsPerConnection).toBe(200);
      expect(config.connection?.connectionTimeout).toBe(25000);

      // 验证重试配置映射
      expect(config.retry?.maxRetries).toBe(15);
      expect(config.retry?.initialDelay).toBe(750);
      expect(config.retry?.maxDelay).toBe(12000);

      // 验证凭据配置映射
      expect(config.credentials?.apiKey).toBe('env-api-key-12345');
      expect(config.credentials?.apiSecret).toBe('env-api-secret-67890');
      expect(config.credentials?.useSecretManager).toBe(true);
      expect(config.credentials?.secretName).toBe('env-credentials');

      // 验证日志配置映射
      expect(config.logging?.level).toBe('warn');
      expect(config.logging?.format).toBe('text');
    });

    test('应正确处理部分环境变量配置', () => {
      EnvTestUtils.setTestEnvVars({
        'BINANCE_WS_ENDPOINT': 'wss://partial.binance.com/ws',
        'BINANCE_MAX_CONNECTIONS': '6',
        'LOG_LEVEL': 'debug'
      });

      const config = loadConfigFromEnv();

      // 设置的变量应该被映射
      expect(config.wsEndpoint).toBe('wss://partial.binance.com/ws');
      expect(config.connection?.maxConnections).toBe(6);
      expect(config.logging?.level).toBe('debug');

      // 未设置的变量应该不存在
      expect(config.restEndpoint).toBeUndefined();
      expect(config.environment).toBeUndefined();
      expect(config.connection?.maxStreamsPerConnection).toBeUndefined();
    });

    test('应正确处理无效的环境变量值', () => {
      EnvTestUtils.setTestEnvVars({
        'BINANCE_MAX_CONNECTIONS': 'not-a-number',
        'BINANCE_CONNECTION_TIMEOUT': 'invalid',
        'BINANCE_USE_SECRET_MANAGER': 'maybe'
      });

      const config = loadConfigFromEnv();

      // 无效的数字应该被转换为 NaN
      expect(config.connection?.maxConnections).toBeNaN();
      expect(config.connection?.connectionTimeout).toBeNaN();

      // 无效的布尔值应该被转换为 false
      expect(config.credentials?.useSecretManager).toBe(false);
    });
  });

  describe('环境特定集成行为', () => {
    test('开发环境集成应正常工作', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'development',
        'BINANCE_MAX_CONNECTIONS': '3',
        'LOG_LEVEL': 'debug'
      });

      const config = await loadConfig();

      expect(config.environment).toBe('development');
      expect(config.connection.maxConnections).toBe(3); // 环境变量覆盖
      expect(config.logging.level).toBe('debug'); // 环境变量覆盖

      // 开发环境的其他默认值应该保持
      expect(config.wsEndpoint).toMatch(/binance\.com/);
      expect(config.monitoring.prometheus.port).not.toBe(9090); // 开发环境特殊端口
    });

    test('测试环境集成应正常工作', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'testing',
        'BINANCE_WS_ENDPOINT': 'wss://testnet.binance.vision/ws',
        'BINANCE_MAX_RETRIES': '5'
      });

      const config = await loadConfig();

      expect(config.environment).toBe('testing');
      expect(config.wsEndpoint).toBe('wss://testnet.binance.vision/ws'); // 环境变量覆盖
      expect(config.retry.maxRetries).toBe(5); // 环境变量覆盖

      // 测试环境的特殊配置
      expect(config.monitoring.prometheus.enabled).toBe(false);
    });

    test('生产环境集成应正常工作', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'production',
        'BINANCE_SECRET_NAME': 'prod-binance-creds',
        'LOG_LEVEL': 'error'
      });

      const config = await loadConfig();

      expect(config.environment).toBe('production');
      expect(config.logging.level).toBe('error'); // 环境变量覆盖

      // 生产环境应该启用 Secret Manager
      expect(config.credentials?.useSecretManager).toBe(true);
      expect(config.credentials?.secretName).toBe('prod-binance-creds'); // 环境变量覆盖
    });
  });

  describe('配置优先级集成测试', () => {
    test('环境变量应覆盖配置文件设置', async () => {
      // 创建配置文件
      const fileConfig = {
        wsEndpoint: 'wss://file.binance.com/ws',
        environment: 'development',
        connection: { maxConnections: 2 },
        logging: { level: 'info' }
      };
      const configFile = await FileTestUtils.createTempConfigFile(fileConfig);

      // 设置环境变量
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'production', // 覆盖文件中的 environment
        'BINANCE_MAX_CONNECTIONS': '10', // 覆盖文件中的 maxConnections
        'LOG_LEVEL': 'error' // 覆盖文件中的 level
      });

      const config = await loadConfig(configFile);

      // 环境变量应该优先
      expect(config.environment).toBe('production');
      expect(config.connection.maxConnections).toBe(10);
      expect(config.logging.level).toBe('error');

      // 文件中未被覆盖的配置应该保持
      expect(config.wsEndpoint).toBe('wss://file.binance.com/ws');
    });

    test('应正确处理三层配置合并（环境预设 < 文件 < 环境变量）', async () => {
      // 设置环境变量决定基础预设
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'testing'
      });

      // 创建部分覆盖配置文件
      const fileConfig = {
        connection: { maxConnections: 7 },
        subscriptions: { 
          defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'] 
        }
      };
      const configFile = await FileTestUtils.createTempConfigFile(fileConfig);

      // 添加环境变量覆盖
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'testing', // 确定环境预设
        'BINANCE_MAX_CONNECTIONS': '12', // 覆盖文件配置
        'LOG_LEVEL': 'warn' // 覆盖环境预设
      });

      const config = await loadConfig(configFile);

      // 验证三层合并结果
      expect(config.environment).toBe('testing'); // 来自环境预设
      expect(config.wsEndpoint).toBe('wss://testnet.binance.vision/ws'); // 来自测试环境预设
      expect(config.subscriptions.defaultSymbols).toEqual(['BTCUSDT', 'ETHUSDT', 'BNBUSDT']); // 来自文件
      expect(config.connection.maxConnections).toBe(12); // 来自环境变量
      expect(config.logging.level).toBe('warn'); // 来自环境变量
    });
  });

  describe('ConfigManager 环境变量集成', () => {
    let configManager: ConfigManager;

    afterEach(() => {
      if (configManager) {
        configManager.destroy();
      }
    });

    test('ConfigManager 应正确处理环境变量', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'development',
        'BINANCE_MAX_CONNECTIONS': '4',
        'LOG_LEVEL': 'debug',
        'BINANCE_USE_SECRET_MANAGER': 'false'
      });

      configManager = createConfigManager();
      await configManager.initialize();

      const config = configManager.getConfig();

      expect(config.environment).toBe('development');
      expect(config.connection.maxConnections).toBe(4);
      expect(config.logging.level).toBe('debug');
    });

    test('ConfigManager 应能重新加载环境变量配置', async () => {
      // 初始环境变量
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'development',
        'BINANCE_MAX_CONNECTIONS': '3'
      });

      configManager = createConfigManager();
      await configManager.initialize();

      expect(configManager.getConfig().connection.maxConnections).toBe(3);

      // 模拟运行时环境变量变更
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'development',
        'BINANCE_MAX_CONNECTIONS': '8'
      });

      // 重新加载配置
      await configManager.reloadConfig();

      expect(configManager.getConfig().connection.maxConnections).toBe(8);
    });

    test('ConfigManager 应能处理环境变量和配置文件的组合', async () => {
      const fileConfig = {
        logging: { level: 'info' },
        subscriptions: { defaultSymbols: ['BTCUSDT'] }
      };
      const configFile = await FileTestUtils.createTempConfigFile(fileConfig);

      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'testing',
        'LOG_LEVEL': 'error', // 覆盖文件配置
        'BINANCE_MAX_CONNECTIONS': '6'
      });

      configManager = createConfigManager({ configPath: configFile });
      await configManager.initialize();

      const config = configManager.getConfig();

      expect(config.environment).toBe('testing');
      expect(config.logging.level).toBe('error'); // 环境变量覆盖
      expect(config.connection.maxConnections).toBe(6); // 环境变量
      expect(config.subscriptions.defaultSymbols).toEqual(['BTCUSDT']); // 文件配置
    });
  });

  describe('动态环境变量处理', () => {
    test('应能检测并响应环境变量变更', async () => {
      // 初始设置
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'development',
        'LOG_LEVEL': 'info'
      });

      let config1 = await loadConfig();
      expect(config1.logging.level).toBe('info');

      // 变更环境变量
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'development',
        'LOG_LEVEL': 'debug'
      });

      let config2 = await loadConfig();
      expect(config2.logging.level).toBe('debug');
    });

    test('应能处理环境变量的添加和移除', async () => {
      // 初始状态：没有特定环境变量
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'testing'
      });

      let config1 = await loadConfig();
      expect(config1.connection.maxConnections).toBe(1); // 测试环境默认值

      // 添加环境变量
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'testing',
        'BINANCE_MAX_CONNECTIONS': '5'
      });

      let config2 = await loadConfig();
      expect(config2.connection.maxConnections).toBe(5);

      // 移除环境变量
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'testing'
      });

      let config3 = await loadConfig();
      expect(config3.connection.maxConnections).toBe(1); // 回到默认值
    });
  });

  describe('环境变量验证集成', () => {
    test('无效的环境变量应在验证时被捕获', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'invalid-environment',
        'BINANCE_WS_ENDPOINT': 'not-a-url',
        'BINANCE_MAX_CONNECTIONS': '-1'
      });

      const configManager = createConfigManager({ enableValidation: true });

      await expect(configManager.initialize()).rejects.toThrow();
    });

    test('有效的环境变量配置应通过验证', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'production',
        'BINANCE_WS_ENDPOINT': 'wss://stream.binance.com:9443',
        'BINANCE_REST_ENDPOINT': 'https://api.binance.com',
        'BINANCE_MAX_CONNECTIONS': '8',
        'LOG_LEVEL': 'info'
      });

      const configManager = createConfigManager({ enableValidation: true });

      await expect(configManager.initialize()).resolves.toBeUndefined();
      expect(configManager.isConfigLoaded()).toBe(true);

      configManager.destroy();
    });
  });

  describe('环境变量安全性', () => {
    test('敏感环境变量应被正确处理', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'development',
        'BINANCE_API_KEY': 'sensitive-api-key',
        'BINANCE_API_SECRET': 'sensitive-api-secret'
      });

      const configManager = createConfigManager();
      await configManager.initialize();

      // 配置摘要不应包含敏感信息
      const summary = configManager.getConfigSummary();
      
      expect(summary.credentials?.hasApiKey).toBe(true);
      expect(summary.credentials?.hasApiSecret).toBe(true);
      expect(summary.credentials?.apiKey).toBeUndefined();
      expect(summary.credentials?.apiSecret).toBeUndefined();

      configManager.destroy();
    });

    test('生产环境应警告直接配置凭据', async () => {
      EnvTestUtils.setTestEnvVars({
        'NODE_ENV': 'production',
        'BINANCE_API_KEY': 'prod-api-key',
        'BINANCE_API_SECRET': 'prod-api-secret',
        'BINANCE_USE_SECRET_MANAGER': 'false' // 不使用 Secret Manager
      });

      const config = await loadConfig();
      const configManager = createConfigManager({ enableValidation: true });
      await configManager.initialize();

      const validation = configManager.validateCurrentConfig();
      
      expect(validation.valid).toBe(true);
      expect(validation.warnings.length).toBeGreaterThan(0);

      const secretManagerWarning = validation.warnings.find(w => 
        w.field === 'credentials' && w.message.includes('Secret Manager')
      );
      expect(secretManagerWarning).toBeDefined();

      configManager.destroy();
    });
  });

  describe('跨平台环境变量处理', () => {
    test('应正确处理不同平台的环境变量格式', () => {
      // 模拟不同的环境变量格式
      const testCases = [
        { 'NODE_ENV': 'development' },
        { 'node_env': 'development' }, // 小写（某些系统）
        { 'NODE_ENV': 'DEVELOPMENT' }, // 大写值
      ];

      for (const envVars of testCases) {
        EnvTestUtils.clearTestEnvVars();
        EnvTestUtils.setTestEnvVars(envVars);

        const config = loadConfigFromEnv();
        
        // 只有标准格式的 NODE_ENV 应该被识别
        if (envVars['NODE_ENV']) {
          expect(config.environment).toBe(envVars['NODE_ENV'].toLowerCase());
        } else {
          expect(config.environment).toBeUndefined();
        }
      }
    });

    test('应正确处理环境变量中的特殊字符', () => {
      EnvTestUtils.setTestEnvVars({
        'BINANCE_WS_ENDPOINT': 'wss://stream.binance.com:9443/ws?param=value',
        'BINANCE_SECRET_NAME': 'binance-prod-credentials-v2'
      });

      const config = loadConfigFromEnv();

      expect(config.wsEndpoint).toBe('wss://stream.binance.com:9443/ws?param=value');
      expect(config.credentials?.secretName).toBe('binance-prod-credentials-v2');
    });
  });
});