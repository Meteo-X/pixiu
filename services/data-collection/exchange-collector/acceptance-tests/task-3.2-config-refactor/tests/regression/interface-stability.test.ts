/**
 * Task 3.2 配置系统重构 - 接口稳定性回归测试
 * 验证配置系统API接口的向后兼容性和稳定性
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
import { validBinanceConfig } from '../../fixtures/test-data/adapter-configs';

describe('Task 3.2 配置系统重构 - 接口稳定性回归测试', () => {
  
  describe('AdapterConfigFactory接口稳定性', () => {
    
    test('createBaseConfig方法应该保持稳定的返回结构', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      
      // 验证核心接口结构
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('connection');
      expect(config).toHaveProperty('endpoints');
      
      // 验证connection子结构
      expect(config.connection).toHaveProperty('timeout');
      expect(config.connection).toHaveProperty('maxRetries');
      expect(config.connection).toHaveProperty('retryInterval');
      expect(config.connection).toHaveProperty('heartbeatInterval');
      
      // 验证endpoints子结构
      expect(config.endpoints).toHaveProperty('ws');
      expect(config.endpoints).toHaveProperty('rest');
      
      // 验证数据类型
      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.connection.timeout).toBe('number');
      expect(typeof config.connection.maxRetries).toBe('number');
      expect(typeof config.connection.retryInterval).toBe('number');
      expect(typeof config.connection.heartbeatInterval).toBe('number');
      expect(typeof config.endpoints.ws).toBe('string');
      expect(typeof config.endpoints.rest).toBe('string');
    });

    test('createBaseSubscription方法应该保持稳定的返回结构', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      
      // 验证核心字段存在
      expect(subscription).toHaveProperty('symbols');
      expect(subscription).toHaveProperty('dataTypes');
      expect(subscription).toHaveProperty('enableAllTickers');
      expect(subscription).toHaveProperty('customParams');
      
      // 验证数据类型
      expect(Array.isArray(subscription.symbols)).toBe(true);
      expect(Array.isArray(subscription.dataTypes)).toBe(true);
      expect(typeof subscription.enableAllTickers).toBe('boolean');
      expect(typeof subscription.customParams).toBe('object');
    });

    test('特定交易所配置工厂方法应该保持稳定', () => {
      const binanceConfig = AdapterConfigFactory.createBinanceConfig();
      const okxConfig = AdapterConfigFactory.createOkxConfig();
      
      // Binance配置结构验证
      expect(binanceConfig).toHaveProperty('config');
      expect(binanceConfig).toHaveProperty('subscription');
      expect(binanceConfig).toHaveProperty('extensions');
      
      // OKX配置结构验证
      expect(okxConfig).toHaveProperty('config');
      expect(okxConfig).toHaveProperty('subscription');
      expect(okxConfig).toHaveProperty('extensions');
      
      // 验证扩展字段类型
      expect(typeof binanceConfig.extensions).toBe('object');
      expect(typeof okxConfig.extensions).toBe('object');
    });

    test('createDefaultConfig方法应该支持所有已定义的适配器类型', () => {
      const adapterTypes = Object.values(AdapterType);
      
      adapterTypes.forEach(type => {
        const config = AdapterConfigFactory.createDefaultConfig(type);
        
        // 验证每种类型都返回有效配置
        expect(config).toHaveProperty('config');
        expect(config).toHaveProperty('subscription');
        
        // 验证配置结构完整性
        expect(config.config.enabled).toBeDefined();
        expect(config.config.endpoints).toBeDefined();
        expect(config.config.connection).toBeDefined();
        expect(config.subscription.symbols).toBeDefined();
        expect(config.subscription.dataTypes).toBeDefined();
      });
    });
  });

  describe('AdapterConfigValidator接口稳定性', () => {
    
    test('validateBaseConfig方法应该保持一致的验证行为', () => {
      const validConfig = AdapterConfigFactory.createBaseConfig();
      const errors = AdapterConfigValidator.validateBaseConfig(validConfig);
      
      // 验证返回类型
      expect(Array.isArray(errors)).toBe(true);
      expect(errors).toHaveLength(0);
      
      // 测试无效配置的验证行为
      const invalidConfig = { ...validConfig };
      invalidConfig.endpoints.ws = '';
      invalidConfig.connection.timeout = 100;
      
      const invalidErrors = AdapterConfigValidator.validateBaseConfig(invalidConfig);
      expect(Array.isArray(invalidErrors)).toBe(true);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors.every(error => typeof error === 'string')).toBe(true);
    });

    test('validateSubscriptionConfig方法应该保持一致的验证规则', () => {
      const validSubscription = AdapterConfigFactory.createBaseSubscription();
      validSubscription.symbols = ['BTCUSDT'];
      validSubscription.dataTypes = [DataType.TRADE];
      
      const errors = AdapterConfigValidator.validateSubscriptionConfig(validSubscription);
      expect(Array.isArray(errors)).toBe(true);
      expect(errors).toHaveLength(0);
      
      // 测试边界条件
      const emptySubscription = {
        symbols: [],
        dataTypes: [],
        enableAllTickers: false
      };
      
      const emptyErrors = AdapterConfigValidator.validateSubscriptionConfig(emptySubscription as any);
      expect(emptyErrors.some(error => error.includes('交易对列表不能为空'))).toBe(true);
      expect(emptyErrors.some(error => error.includes('数据类型列表不能为空'))).toBe(true);
    });

    test('特定交易所验证方法应该保持稳定', () => {
      // Binance扩展验证
      const validBinanceExt: BinanceExtensions = {
        testnet: false,
        enableCompression: true,
        maxStreamCount: 512
      };
      
      const binanceErrors = AdapterConfigValidator.validateBinanceExtensions(validBinanceExt);
      expect(Array.isArray(binanceErrors)).toBe(true);
      expect(binanceErrors).toHaveLength(0);
      
      // 无效Binance扩展
      const invalidBinanceExt: BinanceExtensions = {
        maxStreamCount: 2048 // 超过限制
      };
      
      const invalidBinanceErrors = AdapterConfigValidator.validateBinanceExtensions(invalidBinanceExt);
      expect(invalidBinanceErrors.length).toBeGreaterThan(0);
    });

    test('validateAdapterConfiguration方法应该提供完整验证', () => {
      const config = AdapterConfigFactory.createBinanceConfig();
      const errors = AdapterConfigValidator.validateAdapterConfiguration(
        AdapterType.BINANCE,
        config
      );
      
      expect(Array.isArray(errors)).toBe(true);
      expect(errors).toHaveLength(0);
      
      // 验证方法签名稳定性
      expect(typeof AdapterConfigValidator.validateAdapterConfiguration).toBe('function');
    });
  });

  describe('MultiAdapterConfigManager接口稳定性', () => {
    let manager: MultiAdapterConfigManager;

    beforeEach(() => {
      manager = new MultiAdapterConfigManager();
    });

    afterEach(() => {
      manager.clear();
    });

    test('addAdapterConfig方法应该保持稳定的签名和返回类型', () => {
      const result = manager.addAdapterConfig(
        'test-adapter',
        AdapterType.BINANCE,
        validBinanceConfig
      );

      // 验证返回类型结构
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('info');
      
      // 验证返回值类型
      expect(typeof result.config).toBe('object');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.info)).toBe(true);
    });

    test('核心CRUD操作应该保持接口稳定性', () => {
      // 创建
      const addResult = manager.addAdapterConfig('test', AdapterType.BINANCE, validBinanceConfig);
      expect(addResult.success).toBe(true);
      
      // 读取
      const config = manager.getAdapterConfig('test');
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      
      // 更新
      const updateResult = manager.updateAdapterConfig(
        'test',
        AdapterType.BINANCE,
        { config: { enabled: false } }
      );
      expect(updateResult.success).toBe(true);
      expect(typeof updateResult).toBe('object');
      
      // 删除
      const deleteResult = manager.removeAdapterConfig('test');
      expect(typeof deleteResult).toBe('boolean');
      expect(deleteResult).toBe(true);
    });

    test('批量操作接口应该保持稳定', () => {
      const configs = {
        'test1': { type: AdapterType.BINANCE, config: validBinanceConfig },
        'test2': { type: AdapterType.BINANCE, config: validBinanceConfig }
      };

      // 批量导入
      const batchResults = manager.batchImportConfigs(configs);
      expect(typeof batchResults).toBe('object');
      expect(Object.keys(batchResults)).toHaveLength(2);
      
      Object.values(batchResults).forEach(result => {
        expect(result).toHaveProperty('config');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('info');
      });

      // 获取所有配置
      const allConfigs = manager.getAllAdapterConfigs();
      expect(allConfigs).toBeInstanceOf(Map);
      
      // 导出配置
      const exported = manager.exportConfigs();
      expect(typeof exported).toBe('object');
      
      // 获取统计信息
      const stats = manager.getStats();
      expect(stats).toHaveProperty('totalAdapters');
      expect(stats).toHaveProperty('enabledAdapters');
      expect(stats).toHaveProperty('disabledAdapters');
      expect(stats).toHaveProperty('byType');
    });

    test('配置验证接口应该保持稳定', () => {
      manager.addAdapterConfig('test1', AdapterType.BINANCE, validBinanceConfig);
      
      const validationResults = manager.validateAllConfigs();
      expect(typeof validationResults).toBe('object');
      expect(validationResults).toHaveProperty('test1');
      expect(Array.isArray(validationResults['test1'])).toBe(true);
    });
  });

  describe('ExchangeCollectorConfigManager接口稳定性', () => {
    let configManager: ExchangeCollectorConfigManager;

    beforeEach(() => {
      configManager = new ExchangeCollectorConfigManager();
    });

    test('适配器配置管理接口应该保持稳定', () => {
      // 验证所有公开方法存在
      expect(typeof configManager.getAdapterConfig).toBe('function');
      expect(typeof configManager.getEnabledAdapters).toBe('function');
      expect(typeof configManager.isAdapterEnabled).toBe('function');
      expect(typeof configManager.setAdapterConfig).toBe('function');
      expect(typeof configManager.removeAdapterConfig).toBe('function');
      expect(typeof configManager.validateAdapterConfigs).toBe('function');
      expect(typeof configManager.getAdapterStats).toBe('function');
      expect(typeof configManager.batchImportAdapterConfigs).toBe('function');

      // 测试方法签名和返回类型
      const enabledAdapters = configManager.getEnabledAdapters();
      expect(Array.isArray(enabledAdapters)).toBe(true);
      
      const isEnabled = configManager.isAdapterEnabled('test');
      expect(typeof isEnabled).toBe('boolean');
      
      const stats = configManager.getAdapterStats();
      expect(typeof stats).toBe('object');
      expect(stats).toHaveProperty('totalAdapters');
    });

    test('配置系统核心接口应该保持稳定', () => {
      // 设置配置
      const setResult = configManager.setAdapterConfig(
        'interface-test',
        AdapterType.BINANCE,
        validBinanceConfig
      );
      
      expect(setResult).toHaveProperty('success');
      expect(setResult).toHaveProperty('errors');
      expect(setResult).toHaveProperty('config');
      expect(setResult).toHaveProperty('info');
      
      // 获取配置
      const config = configManager.getAdapterConfig('interface-test');
      expect(config === undefined || typeof config === 'object').toBe(true);
      
      // 移除配置
      const removeResult = configManager.removeAdapterConfig('interface-test');
      expect(typeof removeResult).toBe('boolean');
    });

    test('配置文件相关接口应该保持稳定', () => {
      // 验证配置获取方法存在
      expect(typeof configManager.getPubSubConfig).toBe('function');
      expect(typeof configManager.getMonitoringConfig).toBe('function');
      expect(typeof configManager.getLoggingConfig).toBe('function');
      
      // 验证返回类型
      const pubsubConfig = configManager.getPubSubConfig();
      const monitoringConfig = configManager.getMonitoringConfig();
      const loggingConfig = configManager.getLoggingConfig();
      
      expect(pubsubConfig === undefined || typeof pubsubConfig === 'object').toBe(true);
      expect(monitoringConfig === undefined || typeof monitoringConfig === 'object').toBe(true);
      expect(loggingConfig === undefined || typeof loggingConfig === 'object').toBe(true);
    });
  });

  describe('数据类型和枚举稳定性', () => {
    
    test('AdapterType枚举应该保持稳定', () => {
      // 验证核心交易所类型
      expect(AdapterType.BINANCE).toBe('binance');
      expect(AdapterType.OKEX).toBe('okx');
      expect(AdapterType.HUOBI).toBe('huobi');
      expect(AdapterType.COINBASE).toBe('coinbase');
      
      // 验证枚举值的数量和类型
      const adapterTypes = Object.values(AdapterType);
      expect(adapterTypes.length).toBeGreaterThanOrEqual(4);
      expect(adapterTypes.every(type => typeof type === 'string')).toBe(true);
    });

    test('DataType枚举应该保持稳定', () => {
      // 验证核心数据类型
      expect(DataType.TRADE).toBe('trade');
      expect(DataType.TICKER).toBe('ticker');
      expect(DataType.KLINE_1M).toBe('kline_1m');
      expect(DataType.DEPTH).toBe('depth');
      
      // 验证所有数据类型都是字符串
      const dataTypes = Object.values(DataType);
      expect(dataTypes.every(type => typeof type === 'string')).toBe(true);
    });

    test('配置接口类型应该保持结构稳定', () => {
      // AdapterConfiguration接口验证
      const config: AdapterConfiguration = validBinanceConfig;
      expect(config).toHaveProperty('config');
      expect(config).toHaveProperty('subscription');
      
      // BaseAdapterConfig接口验证
      const baseConfig: BaseAdapterConfig = config.config;
      expect(baseConfig).toHaveProperty('enabled');
      expect(baseConfig).toHaveProperty('connection');
      expect(baseConfig).toHaveProperty('endpoints');
      
      // BaseSubscriptionConfig接口验证
      const subscription: BaseSubscriptionConfig = config.subscription;
      expect(subscription).toHaveProperty('symbols');
      expect(subscription).toHaveProperty('dataTypes');
    });

    test('ConfigMergeResult接口应该保持稳定', () => {
      const manager = new MultiAdapterConfigManager();
      const result = manager.addAdapterConfig('type-test', AdapterType.BINANCE, validBinanceConfig);
      
      // 验证ConfigMergeResult接口
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('info');
      
      // 验证字段类型
      expect(typeof result.config).toBe('object');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.info)).toBe(true);
    });
  });

  describe('错误处理接口稳定性', () => {
    
    test('验证错误应该保持一致的格式', () => {
      const invalidConfig = {
        config: {
          enabled: true,
          endpoints: { ws: '', rest: '' }, // 无效URL
          connection: {
            timeout: -1, // 无效值
            maxRetries: -1,
            retryInterval: 100,
            heartbeatInterval: 1000
          }
        },
        subscription: {
          symbols: [], // 空数组
          dataTypes: ['invalid'] // 无效类型
        }
      };

      const manager = new MultiAdapterConfigManager();
      const result = manager.addAdapterConfig('error-test', AdapterType.BINANCE, invalidConfig as any);
      
      expect(result.success).toBe(false);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.every(error => typeof error === 'string')).toBe(true);
    });

    test('不存在的适配器错误应该保持一致', () => {
      const manager = new MultiAdapterConfigManager();
      const result = manager.updateAdapterConfig(
        'non-existent',
        AdapterType.BINANCE,
        { config: { enabled: false } }
      );
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('适配器 non-existent 不存在');
    });

    test('配置验证错误应该提供有用的信息', () => {
      const errors = AdapterConfigValidator.validateBaseConfig({
        enabled: true,
        endpoints: { ws: '', rest: '' },
        connection: {
          timeout: 100,
          maxRetries: -1,
          retryInterval: 100,
          heartbeatInterval: 1000
        }
      });
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.includes('不能为空'))).toBe(true);
      expect(errors.some(error => error.includes('不能少于'))).toBe(true);
    });
  });

  describe('默认值稳定性', () => {
    
    test('工厂方法应该返回一致的默认值', () => {
      const baseConfig1 = AdapterConfigFactory.createBaseConfig();
      const baseConfig2 = AdapterConfigFactory.createBaseConfig();
      
      // 验证默认值一致性
      expect(baseConfig1.enabled).toBe(baseConfig2.enabled);
      expect(baseConfig1.connection.timeout).toBe(baseConfig2.connection.timeout);
      expect(baseConfig1.connection.maxRetries).toBe(baseConfig2.connection.maxRetries);
      
      const subscription1 = AdapterConfigFactory.createBaseSubscription();
      const subscription2 = AdapterConfigFactory.createBaseSubscription();
      
      expect(subscription1.enableAllTickers).toBe(subscription2.enableAllTickers);
      expect(subscription1.symbols).toEqual(subscription2.symbols);
      expect(subscription1.dataTypes).toEqual(subscription2.dataTypes);
    });

    test('特定交易所配置应该有稳定的默认值', () => {
      const binance1 = AdapterConfigFactory.createBinanceConfig();
      const binance2 = AdapterConfigFactory.createBinanceConfig();
      
      expect(binance1.config.endpoints.ws).toBe(binance2.config.endpoints.ws);
      expect(binance1.config.endpoints.rest).toBe(binance2.config.endpoints.rest);
      expect(binance1.subscription.symbols).toEqual(binance2.subscription.symbols);
      
      const okx1 = AdapterConfigFactory.createOkxConfig();
      const okx2 = AdapterConfigFactory.createOkxConfig();
      
      expect(okx1.config.endpoints.ws).toBe(okx2.config.endpoints.ws);
      expect(okx1.config.endpoints.rest).toBe(okx2.config.endpoints.rest);
    });
  });
});