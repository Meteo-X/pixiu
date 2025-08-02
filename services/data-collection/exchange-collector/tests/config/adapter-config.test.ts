/**
 * 适配器配置单元测试
 */

import { 
  AdapterConfigFactory, 
  AdapterConfigValidator, 
  AdapterType, 
  BinanceExtensions,
  OkxExtensions 
} from '../../src/config/adapter-config';
import { DataType } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';

describe('AdapterConfigFactory', () => {
  afterAll(() => {
    globalCache.destroy();
  });

  describe('createBaseConfig', () => {
    it('应该创建默认的基础适配器配置', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      
      expect(config).toEqual({
        enabled: true,
        connection: {
          timeout: 10000,
          maxRetries: 3,
          retryInterval: 5000,
          heartbeatInterval: 30000
        },
        endpoints: {
          ws: '',
          rest: ''
        }
      });
    });
  });

  describe('createBaseSubscription', () => {
    it('应该创建默认的订阅配置', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      
      expect(subscription).toEqual({
        symbols: [],
        dataTypes: [DataType.TRADE, DataType.TICKER],
        enableAllTickers: false,
        customParams: {}
      });
    });
  });

  describe('createBinanceConfig', () => {
    it('应该创建Binance默认配置', () => {
      const config = AdapterConfigFactory.createBinanceConfig();
      
      expect(config.config.endpoints.ws).toBe('wss://stream.binance.com:9443/ws');
      expect(config.config.endpoints.rest).toBe('https://api.binance.com/api');
      expect(config.subscription.symbols).toEqual(['BTCUSDT']);
      expect(config.subscription.dataTypes).toContain(DataType.TRADE);
      expect(config.subscription.dataTypes).toContain(DataType.TICKER);
      expect(config.subscription.dataTypes).toContain(DataType.KLINE_1M);
      
      const extensions = config.extensions as BinanceExtensions;
      expect(extensions.testnet).toBe(false);
      expect(extensions.enableCompression).toBe(true);
      expect(extensions.enableCombinedStream).toBe(true);
      expect(extensions.maxStreamCount).toBe(1024);
    });
  });

  describe('createOkxConfig', () => {
    it('应该创建OKX默认配置', () => {
      const config = AdapterConfigFactory.createOkxConfig();
      
      expect(config.config.endpoints.ws).toBe('wss://ws.okx.com:8443/ws/v5/public');
      expect(config.config.endpoints.rest).toBe('https://www.okx.com');
      expect(config.subscription.symbols).toEqual(['BTC-USDT']);
      
      const extensions = config.extensions as OkxExtensions;
      expect(extensions.simulated).toBe(false);
      expect(extensions.accountType).toBe('spot');
    });
  });

  describe('createDefaultConfig', () => {
    it('应该根据适配器类型创建默认配置', () => {
      const binanceConfig = AdapterConfigFactory.createDefaultConfig(AdapterType.BINANCE);
      expect(binanceConfig.config.endpoints.ws).toContain('binance');
      
      const okxConfig = AdapterConfigFactory.createDefaultConfig(AdapterType.OKEX);
      expect(okxConfig.config.endpoints.ws).toContain('okx');
    });
  });
});

describe('AdapterConfigValidator', () => {
  afterAll(() => {
    globalCache.destroy();
  });

  describe('validateBaseConfig', () => {
    it('应该验证有效的基础配置', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      config.endpoints.ws = 'wss://example.com/ws';
      config.endpoints.rest = 'https://api.example.com';
      
      const errors = AdapterConfigValidator.validateBaseConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('应该检测WebSocket端点缺失', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      config.endpoints.rest = 'https://api.example.com';
      
      const errors = AdapterConfigValidator.validateBaseConfig(config);
      expect(errors).toContain('WebSocket端点不能为空');
    });

    it('应该检测REST端点缺失', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      config.endpoints.ws = 'wss://example.com/ws';
      
      const errors = AdapterConfigValidator.validateBaseConfig(config);
      expect(errors).toContain('REST API端点不能为空');
    });

    it('应该检测连接超时时间过短', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      config.endpoints.ws = 'wss://example.com/ws';
      config.endpoints.rest = 'https://api.example.com';
      config.connection.timeout = 500;
      
      const errors = AdapterConfigValidator.validateBaseConfig(config);
      expect(errors).toContain('连接超时时间不能少于1000毫秒');
    });

    it('应该检测重试次数为负数', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      config.endpoints.ws = 'wss://example.com/ws';
      config.endpoints.rest = 'https://api.example.com';
      config.connection.maxRetries = -1;
      
      const errors = AdapterConfigValidator.validateBaseConfig(config);
      expect(errors).toContain('最大重试次数不能小于0');
    });

    it('应该检测重试间隔过短', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      config.endpoints.ws = 'wss://example.com/ws';
      config.endpoints.rest = 'https://api.example.com';
      config.connection.retryInterval = 500;
      
      const errors = AdapterConfigValidator.validateBaseConfig(config);
      expect(errors).toContain('重试间隔不能少于1000毫秒');
    });

    it('应该检测心跳间隔过短', () => {
      const config = AdapterConfigFactory.createBaseConfig();
      config.endpoints.ws = 'wss://example.com/ws';
      config.endpoints.rest = 'https://api.example.com';
      config.connection.heartbeatInterval = 1000;
      
      const errors = AdapterConfigValidator.validateBaseConfig(config);
      expect(errors).toContain('心跳间隔不能少于5000毫秒');
    });
  });

  describe('validateSubscriptionConfig', () => {
    it('应该验证有效的订阅配置', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      subscription.symbols = ['BTCUSDT'];
      subscription.dataTypes = [DataType.TRADE];
      
      const errors = AdapterConfigValidator.validateSubscriptionConfig(subscription);
      expect(errors).toHaveLength(0);
    });

    it('应该检测交易对列表为空', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      subscription.dataTypes = [DataType.TRADE];
      
      const errors = AdapterConfigValidator.validateSubscriptionConfig(subscription);
      expect(errors).toContain('订阅交易对列表不能为空');
    });

    it('应该检测数据类型列表为空', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      subscription.symbols = ['BTCUSDT'];
      subscription.dataTypes = [];
      
      const errors = AdapterConfigValidator.validateSubscriptionConfig(subscription);
      expect(errors).toContain('订阅数据类型列表不能为空');
    });

    it('应该检测无效的数据类型', () => {
      const subscription = AdapterConfigFactory.createBaseSubscription();
      subscription.symbols = ['BTCUSDT'];
      subscription.dataTypes = ['invalid' as DataType];
      
      const errors = AdapterConfigValidator.validateSubscriptionConfig(subscription);
      expect(errors.some(error => error.includes('无效的数据类型'))).toBe(true);
    });
  });

  describe('validateBinanceExtensions', () => {
    it('应该验证有效的Binance扩展配置', () => {
      const extensions: BinanceExtensions = {
        testnet: false,
        enableCompression: true,
        maxStreamCount: 512
      };
      
      const errors = AdapterConfigValidator.validateBinanceExtensions(extensions);
      expect(errors).toHaveLength(0);
    });

    it('应该检测流数量超限', () => {
      const extensions: BinanceExtensions = {
        maxStreamCount: 2048
      };
      
      const errors = AdapterConfigValidator.validateBinanceExtensions(extensions);
      expect(errors).toContain('Binance流数量不能超过1024');
    });

    it('应该允许空扩展配置', () => {
      const errors = AdapterConfigValidator.validateBinanceExtensions(undefined);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateAdapterConfiguration', () => {
    it('应该验证完整的Binance配置', () => {
      const config = AdapterConfigFactory.createBinanceConfig();
      
      const errors = AdapterConfigValidator.validateAdapterConfiguration(
        AdapterType.BINANCE, 
        config
      );
      expect(errors).toHaveLength(0);
    });

    it('应该检测Binance配置中的多个错误', () => {
      const config = AdapterConfigFactory.createBinanceConfig();
      config.config.endpoints.ws = '';
      config.config.connection.timeout = 500;
      config.subscription.symbols = [];
      (config.extensions as BinanceExtensions).maxStreamCount = 2048;
      
      const errors = AdapterConfigValidator.validateAdapterConfiguration(
        AdapterType.BINANCE, 
        config
      );
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('WebSocket端点不能为空');
      expect(errors).toContain('连接超时时间不能少于1000毫秒');
      expect(errors).toContain('订阅交易对列表不能为空');
      expect(errors).toContain('Binance流数量不能超过1024');
    });
  });
});