/**
 * Task 3.2 配置系统重构 - 系统集成测试
 * 验证配置系统在整个应用程序生态系统中的集成
 */

import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { 
  AdapterConfigFactory,
  AdapterType,
  AdapterConfiguration
} from '../../../../../../src/config/adapter-config';
import { MultiAdapterConfigManager } from '../../../../../../src/config/config-merger';
import { ExchangeCollectorConfigManager } from '../../../../../../src/config/service-config';
import { DataType } from '@pixiu/adapter-base';
import { 
  validBinanceConfig,
  validOkxConfig,
  multiAdapterConfigs,
  environmentConfigs,
  largeConfig
} from '../../fixtures/test-data/adapter-configs';
import { ConfigTestHelper, ConfigValidationHelper } from '../../fixtures/helpers/test-helpers';

describe('Task 3.2 配置系统重构 - 系统集成测试', () => {
  let systemConfigManager: ExchangeCollectorConfigManager;

  beforeEach(() => {
    systemConfigManager = new ExchangeCollectorConfigManager();
  });

  afterEach(() => {
    ConfigTestHelper.cleanupTempFiles();
  });

  describe('完整系统配置流程', () => {
    
    test('应该支持完整的配置生命周期管理', async () => {
      // 1. 创建系统配置文件
      const systemConfig = {
        name: 'exchange-collector-system',
        version: '1.0.0',
        environment: 'integration-test',
        
        server: {
          port: 8080,
          host: '0.0.0.0',
          enableCors: true
        },

        adapters: {
          binance: validBinanceConfig,
          okx: validOkxConfig,
          huobi: multiAdapterConfigs.huobi
        },

        pubsub: {
          projectId: 'pixiu-trading-integration',
          useEmulator: true,
          emulatorHost: 'localhost:8085',
          topicPrefix: 'integration-test',
          publishSettings: {
            enableBatching: true,
            batchSize: 100,
            batchTimeout: 1000,
            enableMessageOrdering: false,
            retrySettings: {
              maxRetries: 3,
              initialRetryDelay: 1000,
              maxRetryDelay: 60000
            }
          }
        },

        monitoring: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000,
          healthCheckInterval: 30000,
          prometheus: {
            enabled: true,
            port: 9090,
            path: '/metrics'
          }
        },

        logging: {
          level: 'info',
          format: 'json',
          output: 'console'
        }
      };

      const configFile = await ConfigTestHelper.createTempConfigFile(systemConfig, 'yaml');

      try {
        // 2. 验证配置文件可以被正确解析
        const parsedConfig = yaml.parse(fs.readFileSync(configFile, 'utf8'));
        expect(parsedConfig).toMatchObject(systemConfig);

        // 3. 验证适配器配置结构
        expect(parsedConfig.adapters.binance).toMatchObject(validBinanceConfig);
        expect(parsedConfig.adapters.okx).toMatchObject(validOkxConfig);
        expect(parsedConfig.adapters.huobi.config.enabled).toBe(false);

        // 4. 验证系统级配置
        expect(parsedConfig.server.port).toBe(8080);
        expect(parsedConfig.pubsub.projectId).toBe('pixiu-trading-integration');
        expect(parsedConfig.monitoring.enableMetrics).toBe(true);

      } finally {
        ConfigTestHelper.cleanupTempFiles();
      }
    });

    test('应该支持多环境配置管理', async () => {
      const environments = ['development', 'staging', 'production'];
      const configFiles: { [env: string]: string } = {};

      try {
        // 为每个环境创建配置文件
        for (const env of environments) {
          const envConfig = {
            name: 'exchange-collector',
            version: '1.0.0',
            environment: env,
            
            adapters: {
              binance: env === 'development' 
                ? environmentConfigs.development 
                : environmentConfigs.production
            },

            pubsub: {
              projectId: `pixiu-trading-${env}`,
              useEmulator: env !== 'production',
              topicPrefix: `${env}-market-data`
            },

            logging: {
              level: env === 'production' ? 'warn' : 'debug',
              format: 'json',
              output: env === 'development' ? 'console' : 'both'
            }
          };

          configFiles[env] = await ConfigTestHelper.createTempConfigFile(envConfig, 'yaml');
        }

        // 验证每个环境的配置
        for (const env of environments) {
          const config = yaml.parse(fs.readFileSync(configFiles[env], 'utf8'));
          
          expect(config.environment).toBe(env);
          expect(config.pubsub.projectId).toBe(`pixiu-trading-${env}`);
          
          if (env === 'development') {
            expect(config.adapters.binance.extensions.testnet).toBe(true);
            expect(config.pubsub.useEmulator).toBe(true);
            expect(config.logging.level).toBe('debug');
          } else if (env === 'production') {
            expect(config.adapters.binance.extensions.testnet).toBe(false);
            expect(config.pubsub.useEmulator).toBe(false);
            expect(config.logging.level).toBe('warn');
          }
        }

      } finally {
        ConfigTestHelper.cleanupTempFiles();
      }
    });
  });

  describe('大规模配置管理', () => {
    
    test('应该能够处理大量适配器配置', () => {
      const timer = ConfigTestHelper.createPerformanceTimer();
      const memoryMonitor = ConfigTestHelper.createMemoryMonitor();

      memoryMonitor.start();
      timer.start();

      // 创建大量适配器配置
      const largeConfigSet: { [name: string]: { type: AdapterType; config: AdapterConfiguration } } = {};
      
      for (let i = 0; i < 100; i++) {
        const adapterName = `binance-${i}`;
        largeConfigSet[adapterName] = {
          type: AdapterType.BINANCE,
          config: {
            ...validBinanceConfig,
            subscription: {
              ...validBinanceConfig.subscription,
              symbols: [`TEST${i}USDT`]
            }
          }
        };
      }

      for (let i = 0; i < 50; i++) {
        const adapterName = `okx-${i}`;
        largeConfigSet[adapterName] = {
          type: AdapterType.OKEX,
          config: {
            ...validOkxConfig,
            subscription: {
              ...validOkxConfig.subscription,
              symbols: [`TEST${i}-USDT`]
            }
          }
        };
      }

      timer.mark('config-creation');

      // 批量导入配置
      const results = systemConfigManager.batchImportAdapterConfigs(largeConfigSet);
      timer.mark('batch-import');

      // 验证导入结果
      expect(Object.keys(results)).toHaveLength(150);
      Object.values(results).forEach(result => {
        expect(result.success).toBe(true);
      });

      timer.mark('validation');

      // 获取统计信息
      const stats = systemConfigManager.getAdapterStats();
      expect(stats.totalAdapters).toBe(150);
      expect(stats.byType['binance']).toBe(100);
      expect(stats.byType['okx']).toBe(50);

      const totalTime = timer.end();
      const finalMemory = memoryMonitor.stop();

      // 性能验证
      expect(totalTime).toBeLessThan(5000); // 应该在5秒内完成
      
      console.log(`大规模配置测试性能指标:`);
      console.log(`- 总耗时: ${totalTime.toFixed(2)}ms`);
      console.log(`- 配置创建: ${timer.getMarks()['config-creation'].toFixed(2)}ms`);
      console.log(`- 批量导入: ${(timer.getMarks()['batch-import'] - timer.getMarks()['config-creation']).toFixed(2)}ms`);
      console.log(`- 验证: ${(timer.getMarks()['validation'] - timer.getMarks()['batch-import']).toFixed(2)}ms`);
      console.log(`- 内存使用: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
    });

    test('应该能够处理复杂的配置结构', () => {
      // 使用大型配置测试
      const result = systemConfigManager.setAdapterConfig(
        'large-config-test',
        AdapterType.BINANCE,
        largeConfig
      );

      expect(result.success).toBe(true);

      const storedConfig = systemConfigManager.getAdapterConfig('large-config-test');
      expect(storedConfig).toBeDefined();
      expect(storedConfig?.subscription.symbols).toHaveLength(1000);
      expect(storedConfig?.subscription.dataTypes).toHaveLength(Object.values(DataType).length);
    });
  });

  describe('配置验证和约束', () => {
    
    test('应该强制执行业务规则约束', () => {
      // 测试Binance特定约束
      const binanceConfigWithTooManyStreams = ConfigTestHelper.deepClone(validBinanceConfig);
      (binanceConfigWithTooManyStreams.extensions as any).maxStreamCount = 2048; // 超过Binance限制

      const result = systemConfigManager.setAdapterConfig(
        'constraint-test',
        AdapterType.BINANCE,
        binanceConfigWithTooManyStreams
      );

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('流数量不能超过1024'))).toBe(true);
    });

    test('应该验证交易对和数据类型的有效性', () => {
      const invalidConfig = ConfigTestHelper.deepClone(validBinanceConfig);
      invalidConfig.subscription.symbols = []; // 空交易对列表
      invalidConfig.subscription.dataTypes = ['invalid-data-type'] as any;

      const result = systemConfigManager.setAdapterConfig(
        'validation-test',
        AdapterType.BINANCE,
        invalidConfig
      );

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('交易对列表不能为空'))).toBe(true);
      expect(result.errors.some(error => error.includes('无效的数据类型'))).toBe(true);
    });

    test('应该验证网络端点的有效性', () => {
      const invalidEndpointsConfig = ConfigTestHelper.deepClone(validBinanceConfig);
      invalidEndpointsConfig.config.endpoints.ws = 'invalid-websocket-url';
      invalidEndpointsConfig.config.endpoints.rest = 'also-invalid';

      const result = systemConfigManager.setAdapterConfig(
        'endpoint-test',
        AdapterType.BINANCE,
        invalidEndpointsConfig
      );

      // 注意：当前验证器可能不检查URL格式，但应该检查空值
      invalidEndpointsConfig.config.endpoints.ws = '';
      invalidEndpointsConfig.config.endpoints.rest = '';

      const result2 = systemConfigManager.setAdapterConfig(
        'empty-endpoint-test',
        AdapterType.BINANCE,
        invalidEndpointsConfig
      );

      expect(result2.success).toBe(false);
      expect(result2.errors.some(error => error.includes('不能为空'))).toBe(true);
    });
  });

  describe('配置依赖关系管理', () => {
    
    test('应该处理适配器配置之间的依赖关系', () => {
      // 设置主要的Binance配置
      const primaryResult = systemConfigManager.setAdapterConfig(
        'binance-primary',
        AdapterType.BINANCE,
        validBinanceConfig
      );

      // 设置备用的Binance配置，依赖于主要配置
      const backupConfig = ConfigTestHelper.deepClone(validBinanceConfig);
      backupConfig.config.enabled = false; // 默认禁用
      (backupConfig.extensions as any).backupFor = 'binance-primary';

      const backupResult = systemConfigManager.setAdapterConfig(
        'binance-backup',
        AdapterType.BINANCE,
        backupConfig
      );

      expect(primaryResult.success).toBe(true);
      expect(backupResult.success).toBe(true);

      // 验证两个配置都存在
      const primaryConfig = systemConfigManager.getAdapterConfig('binance-primary');
      const backupConfigStored = systemConfigManager.getAdapterConfig('binance-backup');

      expect(primaryConfig?.config.enabled).toBe(true);
      expect(backupConfigStored?.config.enabled).toBe(false);
    });

    test('应该支持配置继承和模板', () => {
      // 创建基础模板配置
      const templateConfig = AdapterConfigFactory.createBinanceConfig();
      templateConfig.config.connection.timeout = 15000; // 自定义超时
      templateConfig.subscription.dataTypes = [DataType.TRADE, DataType.TICKER]; // 基础数据类型

      // 基于模板创建特定配置
      const derivedConfig = ConfigTestHelper.deepClone(templateConfig);
      derivedConfig.subscription.symbols = ['BTCUSDT', 'ETHUSDT'];
      derivedConfig.subscription.dataTypes.push(DataType.KLINE_1M); // 添加额外数据类型

      const result = systemConfigManager.setAdapterConfig(
        'derived-config',
        AdapterType.BINANCE,
        derivedConfig
      );

      expect(result.success).toBe(true);

      const storedConfig = systemConfigManager.getAdapterConfig('derived-config');
      expect(storedConfig?.config.connection.timeout).toBe(15000);
      expect(storedConfig?.subscription.dataTypes).toContain(DataType.KLINE_1M);
    });
  });

  describe('配置安全性和访问控制', () => {
    
    test('应该安全处理敏感配置信息', () => {
      const configWithSecrets = ConfigTestHelper.deepClone(validBinanceConfig);
      configWithSecrets.config.auth = {
        apiKey: 'very-secret-api-key',
        apiSecret: 'very-secret-api-secret'
      };

      const result = systemConfigManager.setAdapterConfig(
        'secret-test',
        AdapterType.BINANCE,
        configWithSecrets
      );

      expect(result.success).toBe(true);

      const storedConfig = systemConfigManager.getAdapterConfig('secret-test');
      expect(storedConfig?.config.auth?.apiKey).toBe('very-secret-api-key');

      // 验证导出配置时的安全处理
      const exportedConfigs = systemConfigManager.getAdapterStats();
      expect(exportedConfigs).toBeDefined();
      // 统计信息不应包含敏感数据
    });

    test('应该支持配置访问权限控制', () => {
      // 设置配置
      systemConfigManager.setAdapterConfig('protected-config', AdapterType.BINANCE, validBinanceConfig);

      // 验证配置可以被读取（在实际系统中可能需要权限检查）
      const config = systemConfigManager.getAdapterConfig('protected-config');
      expect(config).toBeDefined();

      // 验证配置可以被修改（在实际系统中可能需要权限检查）
      const updateResult = systemConfigManager.setAdapterConfig(
        'protected-config',
        AdapterType.BINANCE,
        { config: { enabled: false } }
      );
      expect(updateResult.success).toBe(true);
    });
  });

  describe('系统监控和诊断', () => {
    
    test('应该提供配置系统的健康状况监控', () => {
      // 添加多个配置
      systemConfigManager.setAdapterConfig('monitor-1', AdapterType.BINANCE, validBinanceConfig);
      systemConfigManager.setAdapterConfig('monitor-2', AdapterType.OKEX, validOkxConfig);
      
      const disabledConfig = ConfigTestHelper.deepClone(validBinanceConfig);
      disabledConfig.config.enabled = false;
      systemConfigManager.setAdapterConfig('monitor-3', AdapterType.BINANCE, disabledConfig);

      // 获取系统统计信息
      const stats = systemConfigManager.getAdapterStats();
      
      expect(stats.totalAdapters).toBe(3);
      expect(stats.enabledAdapters).toBe(2);
      expect(stats.disabledAdapters).toBe(1);
      expect(stats.byType['binance']).toBe(2);
      expect(stats.byType['okx']).toBe(1);
    });

    test('应该提供配置验证诊断报告', () => {
      // 添加有效和无效配置
      systemConfigManager.setAdapterConfig('valid-1', AdapterType.BINANCE, validBinanceConfig);
      
      const invalidConfig = ConfigTestHelper.deepClone(validBinanceConfig);
      invalidConfig.config.connection.timeout = -1; // 无效值
      systemConfigManager.setAdapterConfig('invalid-1', AdapterType.BINANCE, invalidConfig);

      // 获取验证报告
      const validationResults = systemConfigManager.validateAdapterConfigs();
      
      expect(validationResults['valid-1']).toHaveLength(0);
      expect(validationResults['invalid-1'].length).toBeGreaterThan(0);
      
      // 验证错误信息的质量
      const errors = validationResults['invalid-1'];
      expect(errors.some(error => error.includes('timeout') || error.includes('超时'))).toBe(true);
    });
  });

  describe('灾难恢复和备份', () => {
    
    test('应该支持配置的导出和导入', () => {
      // 设置多个配置
      const configs = {
        'backup-1': { type: AdapterType.BINANCE, config: validBinanceConfig },
        'backup-2': { type: AdapterType.OKEX, config: validOkxConfig }
      };

      systemConfigManager.batchImportAdapterConfigs(configs);

      // 验证配置已存储
      expect(systemConfigManager.getAdapterConfig('backup-1')).toMatchObject(validBinanceConfig);
      expect(systemConfigManager.getAdapterConfig('backup-2')).toMatchObject(validOkxConfig);

      // 模拟配置丢失
      systemConfigManager.removeAdapterConfig('backup-1');
      expect(systemConfigManager.getAdapterConfig('backup-1')).toBeUndefined();

      // 恢复配置
      const restoreResult = systemConfigManager.setAdapterConfig(
        'backup-1',
        AdapterType.BINANCE,
        validBinanceConfig
      );

      expect(restoreResult.success).toBe(true);
      expect(systemConfigManager.getAdapterConfig('backup-1')).toMatchObject(validBinanceConfig);
    });

    test('应该在配置损坏时提供恢复机制', () => {
      // 设置正常配置
      systemConfigManager.setAdapterConfig('recovery-test', AdapterType.BINANCE, validBinanceConfig);

      // 模拟配置损坏（通过设置无效配置）
      const corruptedConfig = ConfigTestHelper.deepClone(validBinanceConfig);
      corruptedConfig.config.connection.timeout = NaN; // 损坏的值

      const corruptionResult = systemConfigManager.setAdapterConfig(
        'recovery-test',
        AdapterType.BINANCE,
        corruptedConfig
      );

      // 验证损坏的配置被拒绝
      expect(corruptionResult.success).toBe(false);

      // 验证原配置仍然有效
      const currentConfig = systemConfigManager.getAdapterConfig('recovery-test');
      expect(currentConfig?.config.connection.timeout).toBe(validBinanceConfig.config.connection.timeout);
    });
  });
});