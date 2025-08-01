/**
 * 验收测试 - 配置结构设计验证
 * 
 * 验证任务 1.3 中的配置结构设计是否满足需求：
 * - 配置接口和类型定义的完整性
 * - 默认配置值的正确性
 * - 环境特定配置的结构
 * - 配置合并逻辑的正确性
 */

import {
  BinanceAdapterConfig,
  BinanceCredentials,
  SubscriptionConfig,
  LoggingConfig,
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_SUBSCRIPTION_CONFIG,
  DEFAULT_LOGGING_CONFIG,
  DEFAULT_MONITORING_CONFIG,
  createDevelopmentConfig,
  createTestingConfig,
  createProductionConfig,
  mergeConfigs
} from '../../../../../src/config';
import { ConfigFactory } from '../../fixtures/helpers/config-factory';

describe('验收测试 - 配置结构设计', () => {
  describe('核心接口定义验证', () => {
    test('BinanceAdapterConfig 接口应包含所有必需字段', () => {
      const config = ConfigFactory.createValidConfig();
      
      // 验证基础字段
      expect(config).toHaveProperty('wsEndpoint');
      expect(config).toHaveProperty('restEndpoint');
      expect(config).toHaveProperty('environment');
      
      // 验证配置对象
      expect(config).toHaveProperty('connection');
      expect(config).toHaveProperty('retry');
      expect(config).toHaveProperty('subscriptions');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('monitoring');
      
      // 验证类型
      expect(typeof config.wsEndpoint).toBe('string');
      expect(typeof config.restEndpoint).toBe('string');
      expect(typeof config.environment).toBe('string');
      expect(typeof config.connection).toBe('object');
      expect(typeof config.retry).toBe('object');
      expect(typeof config.subscriptions).toBe('object');
      expect(typeof config.logging).toBe('object');
      expect(typeof config.monitoring).toBe('object');
    });

    test('BinanceCredentials 接口应正确定义凭据结构', () => {
      // 测试直接凭据
      const directCredentials: BinanceCredentials = {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        useSecretManager: false
      };
      
      expect(directCredentials).toHaveProperty('apiKey');
      expect(directCredentials).toHaveProperty('apiSecret');
      expect(directCredentials).toHaveProperty('useSecretManager');
      expect(directCredentials.useSecretManager).toBe(false);
      
      // 测试 Secret Manager 凭据
      const secretManagerCredentials: BinanceCredentials = {
        useSecretManager: true,
        secretName: 'binance-credentials'
      };
      
      expect(secretManagerCredentials).toHaveProperty('useSecretManager');
      expect(secretManagerCredentials).toHaveProperty('secretName');
      expect(secretManagerCredentials.useSecretManager).toBe(true);
      expect(secretManagerCredentials.secretName).toBe('binance-credentials');
    });

    test('SubscriptionConfig 接口应正确定义订阅配置结构', () => {
      const subscriptions = ConfigFactory.createValidConfig().subscriptions;
      
      // 基础字段
      expect(subscriptions).toHaveProperty('defaultSymbols');
      expect(subscriptions).toHaveProperty('supportedDataTypes');
      expect(subscriptions).toHaveProperty('batchSubscription');
      expect(subscriptions).toHaveProperty('management');
      
      // 验证数组类型
      expect(Array.isArray(subscriptions.defaultSymbols)).toBe(true);
      expect(Array.isArray(subscriptions.supportedDataTypes)).toBe(true);
      
      // 验证批量订阅配置
      const batch = subscriptions.batchSubscription;
      expect(batch).toHaveProperty('enabled');
      expect(batch).toHaveProperty('batchSize');
      expect(batch).toHaveProperty('batchInterval');
      expect(typeof batch.enabled).toBe('boolean');
      expect(typeof batch.batchSize).toBe('number');
      expect(typeof batch.batchInterval).toBe('number');
      
      // 验证管理配置
      const mgmt = subscriptions.management;
      expect(mgmt).toHaveProperty('autoResubscribe');
      expect(mgmt).toHaveProperty('subscriptionTimeout');
      expect(mgmt).toHaveProperty('maxConcurrentSubscriptions');
      expect(typeof mgmt.autoResubscribe).toBe('boolean');
      expect(typeof mgmt.subscriptionTimeout).toBe('number');
      expect(typeof mgmt.maxConcurrentSubscriptions).toBe('number');
    });

    test('LoggingConfig 接口应正确定义日志配置结构', () => {
      const logging = ConfigFactory.createValidConfig().logging;
      
      expect(logging).toHaveProperty('level');
      expect(logging).toHaveProperty('format');
      expect(logging).toHaveProperty('structured');
      
      expect(['debug', 'info', 'warn', 'error']).toContain(logging.level);
      expect(['json', 'text']).toContain(logging.format);
      expect(typeof logging.structured).toBe('boolean');
    });
  });

  describe('默认配置值验证', () => {
    test('DEFAULT_CONNECTION_CONFIG 应提供合理的默认连接配置', () => {
      expect(DEFAULT_CONNECTION_CONFIG.maxConnections).toBePositiveInteger();
      expect(DEFAULT_CONNECTION_CONFIG.maxStreamsPerConnection).toBePositiveInteger();
      expect(DEFAULT_CONNECTION_CONFIG.heartbeatInterval).toBePositiveInteger();
      expect(DEFAULT_CONNECTION_CONFIG.pingTimeout).toBePositiveInteger();
      expect(DEFAULT_CONNECTION_CONFIG.connectionTimeout).toBePositiveInteger();
      
      // 验证合理的数值范围
      expect(DEFAULT_CONNECTION_CONFIG.maxConnections).toBeInRange(1, 20);
      expect(DEFAULT_CONNECTION_CONFIG.maxStreamsPerConnection).toBeInRange(1, 1024);
      expect(DEFAULT_CONNECTION_CONFIG.heartbeatInterval).toBeInRange(5000, 60000);
      expect(DEFAULT_CONNECTION_CONFIG.pingTimeout).toBeInRange(5000, 120000);
      expect(DEFAULT_CONNECTION_CONFIG.connectionTimeout).toBeInRange(5000, 60000);
      
      // 验证逻辑关系
      expect(DEFAULT_CONNECTION_CONFIG.pingTimeout)
        .toBeGreaterThan(DEFAULT_CONNECTION_CONFIG.heartbeatInterval);
    });

    test('DEFAULT_RETRY_CONFIG 应提供合理的默认重试配置', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBePositiveInteger();
      expect(DEFAULT_RETRY_CONFIG.initialDelay).toBePositiveInteger();
      expect(DEFAULT_RETRY_CONFIG.maxDelay).toBePositiveInteger();
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBeGreaterThan(1.0);
      expect(typeof DEFAULT_RETRY_CONFIG.jitter).toBe('boolean');
      
      // 验证数值范围
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBeInRange(1, 1000);
      expect(DEFAULT_RETRY_CONFIG.initialDelay).toBeInRange(100, 10000);
      expect(DEFAULT_RETRY_CONFIG.maxDelay).toBeInRange(1000, 300000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBeInRange(1.0, 10.0);
      
      // 验证逻辑关系
      expect(DEFAULT_RETRY_CONFIG.maxDelay)
        .toBeGreaterThanOrEqual(DEFAULT_RETRY_CONFIG.initialDelay);
    });

    test('DEFAULT_SUBSCRIPTION_CONFIG 应提供合理的默认订阅配置', () => {
      expect(Array.isArray(DEFAULT_SUBSCRIPTION_CONFIG.defaultSymbols)).toBe(true);
      expect(DEFAULT_SUBSCRIPTION_CONFIG.defaultSymbols.length).toBeGreaterThan(0);
      expect(Array.isArray(DEFAULT_SUBSCRIPTION_CONFIG.supportedDataTypes)).toBe(true);
      expect(DEFAULT_SUBSCRIPTION_CONFIG.supportedDataTypes.length).toBeGreaterThan(0);
      
      // 验证符号格式
      for (const symbol of DEFAULT_SUBSCRIPTION_CONFIG.defaultSymbols) {
        expect(symbol).toMatch(/^[A-Z]{2,}[A-Z]{2,}$/);
      }
      
      // 验证批量订阅配置
      const batch = DEFAULT_SUBSCRIPTION_CONFIG.batchSubscription;
      expect(typeof batch.enabled).toBe('boolean');
      expect(batch.batchSize).toBePositiveInteger();
      expect(batch.batchInterval).toBePositiveInteger();
      
      // 验证管理配置
      const mgmt = DEFAULT_SUBSCRIPTION_CONFIG.management;
      expect(typeof mgmt.autoResubscribe).toBe('boolean');
      expect(mgmt.subscriptionTimeout).toBePositiveInteger();
      expect(mgmt.maxConcurrentSubscriptions).toBePositiveInteger();
    });

    test('DEFAULT_LOGGING_CONFIG 应提供合理的默认日志配置', () => {
      expect(['debug', 'info', 'warn', 'error']).toContain(DEFAULT_LOGGING_CONFIG.level);
      expect(['json', 'text']).toContain(DEFAULT_LOGGING_CONFIG.format);
      expect(typeof DEFAULT_LOGGING_CONFIG.structured).toBe('boolean');
    });

    test('DEFAULT_MONITORING_CONFIG 应提供合理的默认监控配置', () => {
      expect(typeof DEFAULT_MONITORING_CONFIG.prometheus.enabled).toBe('boolean');
      expect(DEFAULT_MONITORING_CONFIG.prometheus.port).toBePositiveInteger();
      expect(DEFAULT_MONITORING_CONFIG.prometheus.port).toBeInRange(1, 65535);
      expect(DEFAULT_MONITORING_CONFIG.prometheus.path).toMatch(/^\/[a-zA-Z0-9_-]*$/);
      
      expect(DEFAULT_MONITORING_CONFIG.healthCheck.interval).toBePositiveInteger();
      expect(DEFAULT_MONITORING_CONFIG.healthCheck.timeout).toBePositiveInteger();
      expect(DEFAULT_MONITORING_CONFIG.healthCheck.timeout)
        .toBeLessThan(DEFAULT_MONITORING_CONFIG.healthCheck.interval);
    });
  });

  describe('环境特定配置验证', () => {
    test('createDevelopmentConfig 应创建适合开发环境的配置', () => {
      const config = createDevelopmentConfig();
      
      expect(config.environment).toBe('development');
      expect(config.wsEndpoint).toBeValidUrl(['wss:']);
      expect(config.restEndpoint).toBeValidUrl(['https:']);
      
      // 开发环境特有的配置
      expect(config.connection.maxConnections).toBeLessThanOrEqual(5);
      expect(config.connection.maxStreamsPerConnection).toBeLessThanOrEqual(200);
      expect(config.retry.maxRetries).toBeLessThanOrEqual(20);
      expect(config.logging.level).toBe('debug');
      expect(config.logging.format).toBe('text');
      
      // 监控端口应该不同于生产环境
      expect(config.monitoring.prometheus.port).not.toBe(9090);
    });

    test('createTestingConfig 应创建适合测试环境的配置', () => {
      const config = createTestingConfig();
      
      expect(config.environment).toBe('testing');
      expect(config.wsEndpoint).toBeValidUrl(['wss:']);
      expect(config.restEndpoint).toBeValidUrl(['https:']);
      
      // 测试环境特有的配置 - 更小的值用于快速测试
      expect(config.connection.maxConnections).toBeLessThanOrEqual(2);
      expect(config.connection.maxStreamsPerConnection).toBeLessThanOrEqual(50);
      expect(config.connection.connectionTimeout).toBeLessThanOrEqual(15000);
      expect(config.retry.maxRetries).toBeLessThanOrEqual(5);
      expect(config.retry.maxDelay).toBeLessThanOrEqual(10000);
      
      // 测试环境应该禁用 Prometheus
      expect(config.monitoring.prometheus.enabled).toBe(false);
    });

    test('createProductionConfig 应创建适合生产环境的配置', () => {
      const config = createProductionConfig();
      
      expect(config.environment).toBe('production');
      expect(config.wsEndpoint).toBeValidUrl(['wss:']);
      expect(config.restEndpoint).toBeValidUrl(['https:']);
      
      // 生产环境特有的配置 - 更高的性能和容量
      expect(config.connection.maxConnections).toBeGreaterThanOrEqual(5);
      expect(config.connection.maxStreamsPerConnection).toBeGreaterThanOrEqual(500);
      expect(config.retry.maxRetries).toBeGreaterThanOrEqual(30);
      
      // 生产环境应该使用 Secret Manager
      expect(config.credentials?.useSecretManager).toBe(true);
      expect(config.credentials?.secretName).toBeDefined();
      
      // 日志配置应该适合生产环境
      expect(config.logging.level).toBe('info');
      expect(config.logging.format).toBe('json');
      expect(config.logging.structured).toBe(true);
      
      // 监控配置应该启用
      expect(config.monitoring.prometheus.enabled).toBe(true);
      expect(config.monitoring.prometheus.port).toBe(9090);
    });
  });

  describe('配置合并逻辑验证', () => {
    test('mergeConfigs 应正确合并基础字段', () => {
      const baseConfig = ConfigFactory.createValidConfig();
      const override = { environment: 'production' as const };
      
      const merged = mergeConfigs(baseConfig, override);
      
      expect(merged.environment).toBe('production');
      expect(merged.wsEndpoint).toBe(baseConfig.wsEndpoint);
      expect(merged.restEndpoint).toBe(baseConfig.restEndpoint);
    });

    test('mergeConfigs 应正确合并嵌套对象', () => {
      const baseConfig = ConfigFactory.createValidConfig();
      const override = {
        connection: {
          maxConnections: 15,
          connectionTimeout: 45000
        }
      };
      
      const merged = mergeConfigs(baseConfig, override);
      
      expect(merged.connection.maxConnections).toBe(15);
      expect(merged.connection.connectionTimeout).toBe(45000);
      // 其他字段应保持不变
      expect(merged.connection.maxStreamsPerConnection)
        .toBe(baseConfig.connection.maxStreamsPerConnection);
      expect(merged.connection.heartbeatInterval)
        .toBe(baseConfig.connection.heartbeatInterval);
    });

    test('mergeConfigs 应正确合并深度嵌套对象', () => {
      const baseConfig = ConfigFactory.createValidConfig();
      const override = {
        subscriptions: {
          batchSubscription: {
            batchSize: 200
          }
        }
      };
      
      const merged = mergeConfigs(baseConfig, override);
      
      expect(merged.subscriptions.batchSubscription.batchSize).toBe(200);
      // 其他字段应保持不变
      expect(merged.subscriptions.batchSubscription.enabled)
        .toBe(baseConfig.subscriptions.batchSubscription.enabled);
      expect(merged.subscriptions.batchSubscription.batchInterval)
        .toBe(baseConfig.subscriptions.batchSubscription.batchInterval);
      expect(merged.subscriptions.defaultSymbols)
        .toEqual(baseConfig.subscriptions.defaultSymbols);
    });

    test('mergeConfigs 应支持多层合并', () => {
      const baseConfig = ConfigFactory.createValidConfig();
      const override1 = { environment: 'production' as const };
      const override2 = {
        connection: { maxConnections: 10 }
      };
      const override3 = {
        logging: { level: 'warn' as const }
      };
      
      const merged = mergeConfigs(baseConfig, override1, override2, override3);
      
      expect(merged.environment).toBe('production');
      expect(merged.connection.maxConnections).toBe(10);
      expect(merged.logging.level).toBe('warn');
      
      // 基础配置应保持不变
      expect(merged.wsEndpoint).toBe(baseConfig.wsEndpoint);
      expect(merged.retry).toEqual(baseConfig.retry);
    });

    test('mergeConfigs 应正确处理数组覆盖', () => {
      const baseConfig = ConfigFactory.createValidConfig();
      const override = {
        subscriptions: {
          defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
          supportedDataTypes: ['trade', 'ticker']
        }
      };
      
      const merged = mergeConfigs(baseConfig, override);
      
      expect(merged.subscriptions.defaultSymbols).toEqual(['BTCUSDT', 'ETHUSDT', 'BNBUSDT']);
      expect(merged.subscriptions.supportedDataTypes).toEqual(['trade', 'ticker']);
    });

    test('mergeConfigs 应正确处理 null 和 undefined 值', () => {
      const baseConfig = ConfigFactory.createValidConfig();
      const override = {
        credentials: {
          apiKey: undefined,
          useSecretManager: true,
          secretName: 'test-secret'
        }
      };
      
      const merged = mergeConfigs(baseConfig, override);
      
      expect(merged.credentials?.useSecretManager).toBe(true);
      expect(merged.credentials?.secretName).toBe('test-secret');
    });
  });

  describe('配置一致性验证', () => {
    test('所有环境预设配置都应该符合基础配置结构', () => {
      const configs = [
        createDevelopmentConfig(),
        createTestingConfig(),
        createProductionConfig()
      ];
      
      for (const config of configs) {
        expect(config).toBeValidConfig();
        expect(config.wsEndpoint).toBeValidUrl(['wss:']);
        expect(config.restEndpoint).toBeValidUrl(['https:']);
        expect(['development', 'testing', 'production']).toContain(config.environment);
      }
    });

    test('不同环境配置之间应该有明显差异', () => {
      const devConfig = createDevelopmentConfig();
      const testConfig = createTestingConfig();
      const prodConfig = createProductionConfig();
      
      // 环境标识应该不同
      expect(devConfig.environment).toBe('development');
      expect(testConfig.environment).toBe('testing');
      expect(prodConfig.environment).toBe('production');
      
      // 连接数配置应该不同（测试 < 开发 < 生产）
      expect(testConfig.connection.maxConnections)
        .toBeLessThan(devConfig.connection.maxConnections);
      expect(devConfig.connection.maxConnections)
        .toBeLessThanOrEqual(prodConfig.connection.maxConnections);
      
      // 日志级别应该有差异
      expect(devConfig.logging.level).toBe('debug');
      expect(prodConfig.logging.level).toBe('info');
      
      // 监控配置应该有差异
      expect(testConfig.monitoring.prometheus.enabled).toBe(false);
      expect(prodConfig.monitoring.prometheus.enabled).toBe(true);
    });

    test('所有默认常量应该相互兼容', () => {
      // 心跳和超时的关系
      expect(DEFAULT_CONNECTION_CONFIG.pingTimeout)
        .toBeGreaterThan(DEFAULT_CONNECTION_CONFIG.heartbeatInterval);
      
      // 重试延迟的关系
      expect(DEFAULT_RETRY_CONFIG.maxDelay)
        .toBeGreaterThanOrEqual(DEFAULT_RETRY_CONFIG.initialDelay);
      
      // 健康检查超时应该小于间隔
      expect(DEFAULT_MONITORING_CONFIG.healthCheck.timeout)
        .toBeLessThan(DEFAULT_MONITORING_CONFIG.healthCheck.interval);
    });
  });
});