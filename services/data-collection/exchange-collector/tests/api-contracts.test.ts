/**
 * Task 3.2 配置系统重构 - API契约测试
 * 验证所有配置管理API的契约和接口稳定性
 */

import { 
  AdapterConfigFactory,
  AdapterConfigValidator,
  AdapterType,
  AdapterConfiguration,
  PartialAdapterConfiguration,
  BaseAdapterConfig,
  BaseSubscriptionConfig,
  BinanceExtensions,
  OkxExtensions
} from '../../../../../../src/config/adapter-config';
import { 
  MultiAdapterConfigManager,
  ConfigMergeOptions,
  ConfigMergeResult 
} from '../../../../../../src/config/config-merger';
import { ExchangeCollectorConfigManager } from '../../../../../../src/config/service-config';
import { DataType } from '@pixiu/adapter-base';
import { 
  validBinanceConfig,
  validOkxConfig,
  minimalConfig
} from '../../fixtures/test-data/adapter-configs';

describe('Task 3.2 配置系统重构 - API契约测试', () => {
  
  describe('AdapterConfigFactory API契约', () => {
    
    test('createBaseConfig() 应该返回标准基础配置', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      
      // 验证返回类型和结构
      expect(config).toMatchObject({
        enabled: expect.any(Boolean),
        connection: {
          timeout: expect.any(Number),
          maxRetries: expect.any(Number),
          retryInterval: expect.any(Number),
          heartbeatInterval: expect.any(Number)
        },
        endpoints: {
          ws: expect.any(String),
          rest: expect.any(String)
        }
      });

      // 验证默认值
      expect(config.enabled).toBe(true);
      expect(config.connection.timeout).toBe(10000);
      expect(config.connection.maxRetries).toBe(3);
      expect(config.connection.retryInterval).toBe(5000);
      expect(config.connection.heartbeatInterval).toBe(30000);
    });

    test('createBaseSubscription() 应该返回标准订阅配置', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      
      expect(subscription).toMatchObject({
        symbols: expect.any(Array),
        dataTypes: expect.any(Array),
        enableAllTickers: expect.any(Boolean),
        customParams: expect.any(Object)
      });

      expect(subscription.symbols).toHaveLength(0);
      expect(subscription.dataTypes).toContain(DataType.TRADE);
      expect(subscription.dataTypes).toContain(DataType.TICKER);
      expect(subscription.enableAllTickers).toBe(false);
    });

    test('createBinanceConfig() 应该返回完整的Binance配置', () => {
      const config = AdapterConfigFactory.createBinanceConfig();
      
      expect(config).toMatchObject({
        config: expect.objectContaining({
          enabled: true,
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          }
        }),
        subscription: expect.objectContaining({
          symbols: ['BTCUSDT'],
          dataTypes: expect.arrayContaining([DataType.TRADE, DataType.TICKER, DataType.KLINE_1M])
        }),
        extensions: expect.objectContaining({
          testnet: false,
          enableCompression: true,
          enableCombinedStream: true,
          maxStreamCount: 1024
        })
      });
    });

    test('createOkxConfig() 应该返回完整的OKX配置', () => {
      const config = AdapterConfigFactory.createOkxConfig();
      
      expect(config).toMatchObject({
        config: expect.objectContaining({
          enabled: true,
          endpoints: {
            ws: 'wss://ws.okx.com:8443/ws/v5/public',
            rest: 'https://www.okx.com'
          }
        }),
        subscription: expect.objectContaining({
          symbols: ['BTC-USDT'],
          dataTypes: expect.arrayContaining([DataType.TRADE, DataType.TICKER])
        }),
        extensions: expect.objectContaining({
          simulated: false,
          accountType: 'spot'
        })
      });
    });

    test('createDefaultConfig() 应该根据适配器类型返回正确配置', () => {
      const binanceConfig = AdapterConfigFactory.createDefaultConfig(AdapterType.BINANCE);
      const okxConfig = AdapterConfigFactory.createDefaultConfig(AdapterType.OKEX);
      const defaultConfig = AdapterConfigFactory.createDefaultConfig('unknown' as AdapterType);

      expect(binanceConfig.extensions).toHaveProperty('testnet');
      expect(okxConfig.extensions).toHaveProperty('accountType');
      expect(defaultConfig.extensions).toBeUndefined();
    });
  });

  describe('AdapterConfigValidator API契约', () => {
    
    test('validateBaseConfig() 应该返回验证错误数组', () => {
      const validConfig = AdapterConfigFactory.createBaseConfig();
      const validErrors = AdapterConfigValidator.validateBaseConfig(validConfig);
      expect(Array.isArray(validErrors)).toBe(true);
      expect(validErrors).toHaveLength(0);

      const invalidConfig = {
        ...validConfig,
        endpoints: { ws: '', rest: '' },
        connection: { ...validConfig.connection, timeout: 100 }
      };
      const invalidErrors = AdapterConfigValidator.validateBaseConfig(invalidConfig);
      expect(Array.isArray(invalidErrors)).toBe(true);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors.every(error => typeof error === 'string')).toBe(true);
    });

    test('validateSubscriptionConfig() 应该验证订阅配置', () => {
      const validSubscription = AdapterConfigFactory.createBaseSubscription();
      validSubscription.symbols = ['BTCUSDT'];
      validSubscription.dataTypes = [DataType.TRADE];
      
      const validErrors = AdapterConfigValidator.validateSubscriptionConfig(validSubscription);
      expect(validErrors).toHaveLength(0);

      const invalidSubscription = {
        symbols: [],
        dataTypes: ['invalid-type']
      };
      const invalidErrors = AdapterConfigValidator.validateSubscriptionConfig(invalidSubscription as any);
      expect(invalidErrors.length).toBeGreaterThan(0);
    });

    test('validateBinanceExtensions() 应该验证Binance特定配置', () => {
      const validExtensions: BinanceExtensions = {
        testnet: false,
        enableCompression: true,
        maxStreamCount: 512
      };
      
      const validErrors = AdapterConfigValidator.validateBinanceExtensions(validExtensions);
      expect(validErrors).toHaveLength(0);

      const invalidExtensions: BinanceExtensions = {
        maxStreamCount: 2048 // 超过限制
      };
      
      const invalidErrors = AdapterConfigValidator.validateBinanceExtensions(invalidExtensions);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors[0]).toContain('流数量不能超过1024');
    });

    test('validateAdapterConfiguration() 应该进行完整验证', () => {
      const errors = AdapterConfigValidator.validateAdapterConfiguration(
        AdapterType.BINANCE,
        validBinanceConfig
      );
      
      expect(Array.isArray(errors)).toBe(true);
      expect(errors).toHaveLength(0);
    });
  });

  describe('MultiAdapterConfigManager API契约', () => {
    let manager: MultiAdapterConfigManager;

    beforeEach(() => {
      manager = new MultiAdapterConfigManager();
    });

    afterEach(() => {
      manager.clear();
    });

    test('addAdapterConfig() 应该返回ConfigMergeResult', () => {
      const result = manager.addAdapterConfig(
        'test-adapter',
        AdapterType.BINANCE,
        validBinanceConfig
      );

      expect(result).toMatchObject({
        config: expect.any(Object),
        errors: expect.any(Array),
        success: expect.any(Boolean),
        info: expect.any(Array)
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toMatchObject(validBinanceConfig);
    });

    test('updateAdapterConfig() 应该返回ConfigMergeResult', () => {
      // 先添加配置
      manager.addAdapterConfig('test', AdapterType.BINANCE, validBinanceConfig);

      const update: PartialAdapterConfiguration = {
        config: { enabled: false }
      };

      const result = manager.updateAdapterConfig('test', AdapterType.BINANCE, update);

      expect(result).toMatchObject({
        config: expect.any(Object),
        errors: expect.any(Array),
        success: expect.any(Boolean),
        info: expect.any(Array)
      });

      expect(result.success).toBe(true);
      expect(result.config.config.enabled).toBe(false);
    });

    test('getAdapterConfig() 应该返回AdapterConfiguration或undefined', () => {
      manager.addAdapterConfig('test', AdapterType.BINANCE, validBinanceConfig);

      const config = manager.getAdapterConfig('test');
      expect(config).toMatchObject(validBinanceConfig);

      const nonExistent = manager.getAdapterConfig('non-existent');
      expect(nonExistent).toBeUndefined();
    });

    test('getAllAdapterConfigs() 应该返回Map<string, AdapterConfiguration>', () => {
      manager.addAdapterConfig('binance', AdapterType.BINANCE, validBinanceConfig);
      manager.addAdapterConfig('okx', AdapterType.OKEX, validOkxConfig);

      const allConfigs = manager.getAllAdapterConfigs();
      
      expect(allConfigs).toBeInstanceOf(Map);
      expect(allConfigs.size).toBe(2);
      expect(allConfigs.has('binance')).toBe(true);
      expect(allConfigs.has('okx')).toBe(true);
    });

    test('removeAdapterConfig() 应该返回boolean', () => {
      manager.addAdapterConfig('test', AdapterType.BINANCE, validBinanceConfig);

      const removed = manager.removeAdapterConfig('test');
      expect(typeof removed).toBe('boolean');
      expect(removed).toBe(true);

      const notRemoved = manager.removeAdapterConfig('non-existent');
      expect(notRemoved).toBe(false);
    });

    test('validateAllConfigs() 应该返回验证结果映射', () => {
      manager.addAdapterConfig('valid', AdapterType.BINANCE, validBinanceConfig);
      
      const results = manager.validateAllConfigs();
      
      expect(typeof results).toBe('object');
      expect(results).toHaveProperty('valid');
      expect(Array.isArray(results['valid'])).toBe(true);
      expect(results['valid']).toHaveLength(0);
    });

    test('batchImportConfigs() 应该返回批量结果', () => {
      const configs = {
        'adapter1': { type: AdapterType.BINANCE, config: validBinanceConfig },
        'adapter2': { type: AdapterType.OKEX, config: validOkxConfig }
      };

      const results = manager.batchImportConfigs(configs);

      expect(typeof results).toBe('object');
      expect(results).toHaveProperty('adapter1');
      expect(results).toHaveProperty('adapter2');
      expect(results['adapter1']).toMatchObject({
        config: expect.any(Object),
        errors: expect.any(Array),
        success: expect.any(Boolean),
        info: expect.any(Array)
      });
    });

    test('getStats() 应该返回统计信息', () => {
      manager.addAdapterConfig('binance', AdapterType.BINANCE, validBinanceConfig);
      manager.addAdapterConfig('okx', AdapterType.OKEX, validOkxConfig);

      const stats = manager.getStats();

      expect(stats).toMatchObject({
        totalAdapters: expect.any(Number),
        enabledAdapters: expect.any(Number),
        disabledAdapters: expect.any(Number),
        byType: expect.any(Object)
      });

      expect(stats.totalAdapters).toBe(2);
      expect(stats.enabledAdapters + stats.disabledAdapters).toBe(stats.totalAdapters);
    });

    test('exportConfigs() 应该返回序列化的配置', () => {
      manager.addAdapterConfig('test', AdapterType.BINANCE, validBinanceConfig);

      const exported = manager.exportConfigs();

      expect(typeof exported).toBe('object');
      expect(exported).toHaveProperty('test');
      expect(exported['test']).toMatchObject(validBinanceConfig);
      
      // 验证是深拷贝
      exported['test'].config.enabled = false;
      const original = manager.getAdapterConfig('test');
      expect(original?.config.enabled).toBe(true);
    });

    test('clear() 应该清空所有配置', () => {
      manager.addAdapterConfig('test', AdapterType.BINANCE, validBinanceConfig);
      expect(manager.getAllAdapterConfigs().size).toBe(1);

      manager.clear();
      expect(manager.getAllAdapterConfigs().size).toBe(0);
    });
  });

  describe('ExchangeCollectorConfigManager API契约', () => {
    let configManager: ExchangeCollectorConfigManager;

    beforeEach(() => {
      configManager = new ExchangeCollectorConfigManager();
    });

    test('getAdapterConfig() 应该返回适配器配置', () => {
      // 由于这是单元测试，我们无法真正加载配置文件
      // 我们测试方法存在性和返回类型
      const result = configManager.getAdapterConfig('non-existent');
      expect(result === undefined || typeof result === 'object').toBe(true);
    });

    test('getEnabledAdapters() 应该返回字符串数组', () => {
      const enabled = configManager.getEnabledAdapters();
      expect(Array.isArray(enabled)).toBe(true);
      expect(enabled.every(name => typeof name === 'string')).toBe(true);
    });

    test('isAdapterEnabled() 应该返回boolean', () => {
      const result = configManager.isAdapterEnabled('test');
      expect(typeof result).toBe('boolean');
    });

    test('setAdapterConfig() 应该返回ConfigMergeResult', () => {
      const result = configManager.setAdapterConfig(
        'test',
        AdapterType.BINANCE,
        validBinanceConfig
      );

      expect(result).toMatchObject({
        config: expect.any(Object),
        errors: expect.any(Array),
        success: expect.any(Boolean),
        info: expect.any(Array)
      });
    });

    test('removeAdapterConfig() 应该返回boolean', () => {
      const result = configManager.removeAdapterConfig('test');
      expect(typeof result).toBe('boolean');
    });

    test('validateAdapterConfigs() 应该返回验证结果', () => {
      const results = configManager.validateAdapterConfigs();
      expect(typeof results).toBe('object');
    });

    test('getAdapterStats() 应该返回统计信息', () => {
      const stats = configManager.getAdapterStats();
      expect(stats).toMatchObject({
        totalAdapters: expect.any(Number),
        enabledAdapters: expect.any(Number),
        disabledAdapters: expect.any(Number),
        byType: expect.any(Object)
      });
    });

    test('batchImportAdapterConfigs() 应该返回批量结果', () => {
      const configs = {
        'test': { type: AdapterType.BINANCE, config: validBinanceConfig }
      };

      const results = configManager.batchImportAdapterConfigs(configs);
      expect(typeof results).toBe('object');
      expect(results).toHaveProperty('test');
    });
  });

  describe('类型安全和接口契约', () => {
    
    test('AdapterType枚举应该包含所有支持的交易所', () => {
      expect(AdapterType.BINANCE).toBe('binance');
      expect(AdapterType.OKEX).toBe('okx');
      expect(AdapterType.HUOBI).toBe('huobi');
      expect(AdapterType.COINBASE).toBe('coinbase');
    });

    test('DataType枚举应该包含所有数据类型', () => {
      const dataTypes = Object.values(DataType);
      expect(dataTypes).toContain('trade');
      expect(dataTypes).toContain('ticker');
      expect(dataTypes).toContain('kline_1m');
      expect(dataTypes).toContain('depth');
    });

    test('ConfigMergeOptions应该有正确的默认值', () => {
      const manager = new MultiAdapterConfigManager();
      
      // 测试默认选项通过行为验证
      const result = manager.addAdapterConfig(
        'test',
        AdapterType.BINANCE,
        { config: { enabled: false } }
      );

      expect(result.success).toBe(true); // 验证默认启用验证
    });

    test('接口应该支持可选字段', () => {
      const minimalConfig: AdapterConfiguration = {
        config: {
          enabled: true,
          connection: {
            timeout: 5000,
            maxRetries: 1,
            retryInterval: 1000,
            heartbeatInterval: 10000
          },
          endpoints: {
            ws: 'wss://example.com/ws',
            rest: 'https://example.com/api'
          }
          // auth 是可选的
        },
        subscription: {
          symbols: ['TEST'],
          dataTypes: [DataType.TRADE]
          // enableAllTickers 有默认值
          // customParams 是可选的
        }
        // extensions 是可选的
      };

      const errors = AdapterConfigValidator.validateAdapterConfiguration(
        AdapterType.BINANCE,
        minimalConfig
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('错误处理契约', () => {
    
    test('无效参数应该返回合适的错误信息', () => {
      const manager = new MultiAdapterConfigManager();
      
      const result = manager.updateAdapterConfig(
        'non-existent',
        AdapterType.BINANCE,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('适配器 non-existent 不存在');
    });

    test('验证错误应该提供中文错误信息', () => {
      const invalidConfig = {
        enabled: true,
        connection: {
          timeout: 100, // 太小
          maxRetries: -1, // 负数
          retryInterval: 100, // 太小
          heartbeatInterval: 1000 // 太小
        },
        endpoints: {
          ws: '', // 空字符串
          rest: '' // 空字符串
        }
      };

      const errors = AdapterConfigValidator.validateBaseConfig(invalidConfig);
      expect(errors.some(error => error.includes('不能为空'))).toBe(true);
      expect(errors.some(error => error.includes('不能少于'))).toBe(true);
    });
  });
});