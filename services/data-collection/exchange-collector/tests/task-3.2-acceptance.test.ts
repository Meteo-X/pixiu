/**
 * Task 3.2 配置系统重构 - 接受测试
 * 验证所有核心需求的实现
 */

import { 
  AdapterConfigFactory, 
  AdapterConfigValidator, 
  AdapterType,
  BinanceExtensions,
  OkxExtensions 
} from '../src/config/adapter-config';
import { 
  MultiAdapterConfigManager
} from '../src/config/config-merger';
import { ExchangeCollectorConfigManager } from '../src/config/service-config';
import { DataType } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';

describe('Task 3.2 配置系统重构 - 接受测试', () => {
  let configManager: ExchangeCollectorConfigManager;
  let adapterManager: MultiAdapterConfigManager;

  beforeEach(() => {
    configManager = new ExchangeCollectorConfigManager();
    adapterManager = new MultiAdapterConfigManager();
  });

  afterAll(() => {
    globalCache.destroy();
  });

  describe('需求1: 移除交易所特定配置', () => {
    it('应该实现通用的适配器配置结构', () => {
      const baseConfig = AdapterConfigFactory.createBaseConfig();
      
      // 验证通用配置结构
      expect(baseConfig).toHaveProperty('enabled');
      expect(baseConfig).toHaveProperty('endpoints');
      expect(baseConfig).toHaveProperty('connection');
      expect(baseConfig.endpoints).toHaveProperty('ws');
      expect(baseConfig.endpoints).toHaveProperty('rest');
      expect(baseConfig.connection).toHaveProperty('timeout');
      expect(baseConfig.connection).toHaveProperty('maxRetries');
      expect(baseConfig.connection).toHaveProperty('retryInterval');
      expect(baseConfig.connection).toHaveProperty('heartbeatInterval');
    });

    it('应该支持扩展字段处理交易所特异性', () => {
      const binanceConfig = AdapterConfigFactory.createBinanceConfig();
      const okxConfig = AdapterConfigFactory.createOkxConfig();
      
      // 验证Binance扩展配置
      expect(binanceConfig.extensions).toBeDefined();
      const binanceExt = binanceConfig.extensions as BinanceExtensions;
      expect(binanceExt).toHaveProperty('testnet');
      expect(binanceExt).toHaveProperty('enableCompression');
      expect(binanceExt).toHaveProperty('enableCombinedStream');
      expect(binanceExt).toHaveProperty('maxStreamCount');
      
      // 验证OKX扩展配置
      expect(okxConfig.extensions).toBeDefined();
      const okxExt = okxConfig.extensions as OkxExtensions;
      expect(okxExt).toHaveProperty('simulated');
      expect(okxExt).toHaveProperty('accountType');
    });

    it('应该移除了直接的交易所特定配置', () => {
      const baseConfig = AdapterConfigFactory.createBaseConfig();
      
      // 验证基础配置中没有特定交易所字段
      expect(baseConfig).not.toHaveProperty('binance');
      expect(baseConfig).not.toHaveProperty('okx');
      expect(baseConfig).not.toHaveProperty('huobi');
      expect(baseConfig).not.toHaveProperty('testnet');
      expect(baseConfig).not.toHaveProperty('enableCompression');
    });
  });

  describe('需求2: 实现通用订阅配置格式', () => {
    it('应该实现统一的订阅配置结构', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      
      // 验证统一订阅配置格式
      expect(subscription).toHaveProperty('symbols');
      expect(subscription).toHaveProperty('dataTypes');
      expect(subscription).toHaveProperty('enableAllTickers');
      expect(subscription).toHaveProperty('customParams');
      expect(Array.isArray(subscription.symbols)).toBe(true);
      expect(Array.isArray(subscription.dataTypes)).toBe(true);
      expect(typeof subscription.enableAllTickers).toBe('boolean');
      expect(typeof subscription.customParams).toBe('object');
    });

    it('应该支持所有标准数据类型', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      subscription.symbols = ['BTCUSDT']; // 需要至少一个交易对
      subscription.dataTypes = [
        DataType.TRADE,
        DataType.TICKER,
        DataType.KLINE_1M,
        DataType.KLINE_5M,
        DataType.KLINE_1H,
        DataType.DEPTH
      ];
      
      const errors = AdapterConfigValidator.validateSubscriptionConfig(subscription);
      expect(errors).toHaveLength(0);
    });

    it('应该支持自定义订阅参数', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      subscription.symbols = ['BTCUSDT']; // 需要至少一个交易对
      subscription.customParams = {
        depth: 20,
        interval: '100ms',
        aggregateLimit: 1000
      };
      
      const errors = AdapterConfigValidator.validateSubscriptionConfig(subscription);
      expect(errors).toHaveLength(0);
      expect(subscription.customParams.depth).toBe(20);
      expect(subscription.customParams.interval).toBe('100ms');
    });
  });

  describe('需求3: 实现配置验证和合并逻辑', () => {
    it('应该实现全面的配置验证机制', () => {
      const invalidConfig = AdapterConfigFactory.createBinanceConfig();
      invalidConfig.config.endpoints.ws = '';
      invalidConfig.config.connection.timeout = 500;
      invalidConfig.subscription.symbols = [];
      
      const errors = AdapterConfigValidator.validateAdapterConfiguration(
        AdapterType.BINANCE, 
        invalidConfig
      );
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.includes('WebSocket端点不能为空'))).toBe(true);
      expect(errors.some(error => error.includes('连接超时时间不能少于1000毫秒'))).toBe(true);
      expect(errors.some(error => error.includes('订阅交易对列表不能为空'))).toBe(true);
    });

    it('应该实现深度合并功能', () => {
      const result = adapterManager.addAdapterConfig(
        'binance',
        AdapterType.BINANCE,
        AdapterConfigFactory.createBinanceConfig()
      );
      expect(result.success).toBe(true);

      const updateResult = adapterManager.updateAdapterConfig(
        'binance',
        AdapterType.BINANCE,
        {
          config: {
            connection: {
              timeout: 20000
            } as any
          },
          subscription: {
            symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
          }
        }
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.config.config.connection.timeout).toBe(20000);
      expect(updateResult.config.config.connection.maxRetries).toBe(3); // 保留原值
      expect(updateResult.config.subscription.symbols).toEqual(['BTCUSDT', 'ETHUSDT', 'ADAUSDT']);
    });

    it('应该支持配置合并选项控制', () => {
      const baseConfig = AdapterConfigFactory.createBinanceConfig();
      const result = adapterManager.addAdapterConfig(
        'test',
        AdapterType.BINANCE,
        baseConfig,
        { override: false, deep: true, validate: true }
      );
      
      expect(result.success).toBe(true);
      expect(result.info).toContain('配置合并完成');
      expect(result.info).toContain('配置验证通过');
    });

    it('应该提供详细的错误报告', () => {
      const result = adapterManager.addAdapterConfig(
        'invalid',
        AdapterType.BINANCE,
        {
          config: {
            enabled: true,
            endpoints: {
              ws: '',
              rest: ''
            },
            connection: {
              timeout: 100,
              maxRetries: -1,
              retryInterval: 100,
              heartbeatInterval: 1000
            }
          },
          subscription: {
            symbols: [],
            dataTypes: []
          }
        }
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('WebSocket端点不能为空');
      expect(result.errors).toContain('REST API端点不能为空');
      expect(result.errors).toContain('连接超时时间不能少于1000毫秒');
      expect(result.errors).toContain('最大重试次数不能小于0');
    });
  });

  describe('需求4: 支持多适配器配置管理', () => {
    it('应该支持多适配器CRUD操作', () => {
      // 添加Binance适配器
      const binanceResult = adapterManager.addAdapterConfig(
        'binance',
        AdapterType.BINANCE,
        AdapterConfigFactory.createBinanceConfig()
      );
      expect(binanceResult.success).toBe(true);

      // 添加OKX适配器
      const okxResult = adapterManager.addAdapterConfig(
        'okx',
        AdapterType.OKEX,
        AdapterConfigFactory.createOkxConfig()
      );
      expect(okxResult.success).toBe(true);

      // 获取配置
      const binanceConfig = adapterManager.getAdapterConfig('binance');
      const okxConfig = adapterManager.getAdapterConfig('okx');
      expect(binanceConfig).toBeDefined();
      expect(okxConfig).toBeDefined();

      // 移除配置
      const removeResult = adapterManager.removeAdapterConfig('okx');
      expect(removeResult).toBe(true);
      expect(adapterManager.getAdapterConfig('okx')).toBeUndefined();
    });

    it('应该支持批量配置操作', () => {
      const configs = {
        'binance': {
          type: AdapterType.BINANCE,
          config: {
            config: {
              enabled: true,
              endpoints: {
                ws: 'wss://stream.binance.com:9443/ws',
                rest: 'https://api.binance.com/api'
              },
              connection: {
                timeout: 10000,
                maxRetries: 3,
                retryInterval: 5000,
                heartbeatInterval: 30000
              }
            },
            subscription: {
              symbols: ['BTCUSDT'],
              dataTypes: [DataType.TRADE]
            }
          }
        },
        'okx': {
          type: AdapterType.OKEX,
          config: {
            config: {
              enabled: true,
              endpoints: {
                ws: 'wss://ws.okx.com:8443/ws/v5/public',
                rest: 'https://www.okx.com'
              },
              connection: {
                timeout: 10000,
                maxRetries: 3,
                retryInterval: 5000,
                heartbeatInterval: 30000
              }
            },
            subscription: {
              symbols: ['BTC-USDT'],
              dataTypes: [DataType.TRADE]
            }
          }
        }
      };

      const results = adapterManager.batchImportConfigs(configs);
      expect(results['binance'].success).toBe(true);
      expect(results['okx'].success).toBe(true);
    });

    it('应该提供配置统计和管理功能', () => {
      // 添加测试配置
      adapterManager.addAdapterConfig('binance1', AdapterType.BINANCE, AdapterConfigFactory.createBinanceConfig());
      const disabledConfig = AdapterConfigFactory.createBinanceConfig();
      disabledConfig.config.enabled = false;
      adapterManager.addAdapterConfig('binance2', AdapterType.BINANCE, disabledConfig);
      adapterManager.addAdapterConfig('okx', AdapterType.OKEX, AdapterConfigFactory.createOkxConfig());

      const stats = adapterManager.getStats();
      expect(stats.totalAdapters).toBe(3);
      expect(stats.enabledAdapters).toBe(2);
      expect(stats.disabledAdapters).toBe(1);
      expect(stats.byType[AdapterType.BINANCE]).toBe(2);
      expect(stats.byType[AdapterType.OKEX]).toBe(1);
    });

    it('应该支持配置导入导出', () => {
      // 添加测试配置
      adapterManager.addAdapterConfig('binance', AdapterType.BINANCE, AdapterConfigFactory.createBinanceConfig());
      adapterManager.addAdapterConfig('okx', AdapterType.OKEX, AdapterConfigFactory.createOkxConfig());

      // 导出配置
      const exported = adapterManager.exportConfigs();
      expect(Object.keys(exported)).toEqual(['binance', 'okx']);
      expect(exported['binance'].config.endpoints.ws).toBe('wss://stream.binance.com:9443/ws');
      expect(exported['okx'].config.endpoints.ws).toBe('wss://ws.okx.com:8443/ws/v5/public');

      // 清空配置
      adapterManager.clear();
      expect(adapterManager.getAllAdapterConfigs().size).toBe(0);
    });

    it('应该验证所有适配器配置', () => {
      // 添加有效配置
      adapterManager.addAdapterConfig('valid', AdapterType.BINANCE, AdapterConfigFactory.createBinanceConfig());
      
      // 添加无效配置（绕过验证）
      const invalidConfig = AdapterConfigFactory.createBinanceConfig();
      invalidConfig.config.endpoints.ws = '';
      adapterManager.addAdapterConfig('invalid', AdapterType.BINANCE, invalidConfig, { validate: false });

      const validationResults = adapterManager.validateAllConfigs();
      expect(validationResults['valid']).toHaveLength(0);
      expect(validationResults['invalid'].length).toBeGreaterThan(0);
      expect(validationResults['invalid']).toContain('WebSocket端点不能为空');
    });
  });

  describe('系统集成验证', () => {
    it('应该与ExchangeCollectorConfigManager正确集成', () => {
      // Mock getConfig方法
      jest.spyOn(configManager, 'getConfig').mockReturnValue({
        name: 'exchange-collector',
        version: '1.0.0',
        environment: 'test',
        server: { port: 8080, host: '0.0.0.0', enableCors: true },
        adapters: {},
        pubsub: {
          projectId: 'test',
          useEmulator: true,
          emulatorHost: 'localhost:8085',
          topicPrefix: 'test',
          publishSettings: {
            enableBatching: true,
            batchSize: 100,
            batchTimeout: 1000,
            enableMessageOrdering: false,
            retrySettings: { maxRetries: 3, initialRetryDelay: 1000, maxRetryDelay: 60000 }
          }
        },
        monitoring: {
          enableMetrics: true,
          enableHealthCheck: true,
          metricsInterval: 30000,
          healthCheckInterval: 30000,
          prometheus: { enabled: true, port: 9090, path: '/metrics' }
        },
        logging: { level: 'info' as const, format: 'json' as const, output: 'console' as const }
      } as any);

      // Mock config属性
      (configManager as any).config = {
        adapters: {}
      };

      jest.spyOn(configManager, 'emit').mockImplementation(() => true);

      const result = configManager.setAdapterConfig(
        'binance',
        AdapterType.BINANCE,
        {
          config: {
            enabled: true,
            endpoints: {
              ws: 'wss://stream.binance.com:9443/ws',
              rest: 'https://api.binance.com/api'
            },
            connection: {
              timeout: 10000,
              maxRetries: 3,
              retryInterval: 5000,
              heartbeatInterval: 30000
            }
          },
          subscription: {
            symbols: ['BTCUSDT'],
            dataTypes: [DataType.TRADE]
          }
        }
      );

      expect(result.success).toBe(true);
      expect(configManager.emit).toHaveBeenCalled();
    });

    it('应该维持向后兼容性', () => {
      const enabled = configManager.getEnabledAdapters();
      expect(Array.isArray(enabled)).toBe(true);

      const stats = configManager.getAdapterStats();
      expect(stats).toHaveProperty('totalAdapters');
      expect(stats).toHaveProperty('enabledAdapters');
      expect(stats).toHaveProperty('disabledAdapters');
      expect(stats).toHaveProperty('byType');
    });
  });

  describe('验收标准确认', () => {
    it('✅ 需求1完成: 移除交易所特定配置', () => {
      expect(AdapterConfigFactory.createBaseConfig).toBeDefined();
      expect(AdapterConfigFactory.createBinanceConfig().extensions).toBeDefined();
      expect(AdapterConfigFactory.createOkxConfig().extensions).toBeDefined();
    });

    it('✅ 需求2完成: 实现通用订阅配置格式', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      expect(subscription).toHaveProperty('symbols');
      expect(subscription).toHaveProperty('dataTypes');
      expect(subscription).toHaveProperty('customParams');
    });

    it('✅ 需求3完成: 实现配置验证和合并逻辑', () => {
      expect(AdapterConfigValidator.validateAdapterConfiguration).toBeDefined();
      expect(MultiAdapterConfigManager).toBeDefined();
    });

    it('✅ 需求4完成: 支持多适配器配置管理', () => {
      expect(configManager.setAdapterConfig).toBeDefined();
      expect(configManager.getAdapterStats).toBeDefined();
      expect(configManager.batchImportAdapterConfigs).toBeDefined();
    });
  });
});