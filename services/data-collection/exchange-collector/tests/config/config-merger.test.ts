/**
 * 配置合并器单元测试
 */

import { MultiAdapterConfigManager } from '../../src/config/config-merger';
import { 
  AdapterConfigFactory, 
  AdapterType, 
  BinanceExtensions 
} from '../../src/config/adapter-config';
import { DataType } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';

describe('MultiAdapterConfigManager', () => {
  let manager: MultiAdapterConfigManager;

  beforeEach(() => {
    manager = new MultiAdapterConfigManager();
  });

  afterAll(() => {
    globalCache.destroy();
  });

  describe('addAdapterConfig', () => {
    it('应该添加有效的适配器配置', () => {
      const result = manager.addAdapterConfig(
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
              timeout: 15000,
              maxRetries: 5,
              retryInterval: 3000,
              heartbeatInterval: 20000
            }
          },
          subscription: {
            symbols: ['BTCUSDT', 'ETHUSDT'],
            dataTypes: [DataType.TRADE, DataType.TICKER]
          }
        }
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config.config.connection.timeout).toBe(15000);
      expect(result.config.subscription.symbols).toEqual(['BTCUSDT', 'ETHUSDT']);
    });

    it('应该检测配置错误', () => {
      const result = manager.addAdapterConfig(
        'binance',
        AdapterType.BINANCE,
        {
          config: {
            enabled: true,
            endpoints: {
              ws: '',  // 无效的WebSocket端点
              rest: 'https://api.binance.com/api'
            },
            connection: {
              timeout: 500,  // 超时时间过短
              maxRetries: 3,
              retryInterval: 5000,
              heartbeatInterval: 30000
            }
          },
          subscription: {
            symbols: [],  // 空的交易对列表
            dataTypes: [DataType.TRADE]
          }
        }
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('WebSocket端点不能为空');
      expect(result.errors).toContain('连接超时时间不能少于1000毫秒');
      expect(result.errors).toContain('订阅交易对列表不能为空');
    });

    it('应该使用默认配置填充缺失字段', () => {
      const result = manager.addAdapterConfig(
        'binance',
        AdapterType.BINANCE,
        {
          config: {
            enabled: true,
            endpoints: {
              ws: 'wss://stream.binance.com:9443/ws',
              rest: 'https://api.binance.com/api'
            }
            // 缺少connection配置，应该使用默认值
          },
          subscription: {
            symbols: ['BTCUSDT'],
            dataTypes: [DataType.TRADE]
            // 缺少其他字段，应该使用默认值
          }
        }
      );

      expect(result.success).toBe(true);
      expect(result.config.config.connection.timeout).toBe(10000);  // 默认值
      expect(result.config.config.connection.maxRetries).toBe(3);   // 默认值
      expect(result.config.subscription.enableAllTickers).toBe(false);  // 默认值
    });
  });

  describe('updateAdapterConfig', () => {
    beforeEach(() => {
      // 添加初始配置
      manager.addAdapterConfig(
        'binance',
        AdapterType.BINANCE,
        AdapterConfigFactory.createBinanceConfig()
      );
    });

    it('应该更新现有适配器配置', () => {
      const result = manager.updateAdapterConfig(
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

      expect(result.success).toBe(true);
      expect(result.config.config.connection.timeout).toBe(20000);
      expect(result.config.subscription.symbols).toEqual(['BTCUSDT', 'ETHUSDT', 'ADAUSDT']);
      
      // 其他字段应该保持不变
      expect(result.config.config.endpoints.ws).toBe('wss://stream.binance.com:9443/ws');
    });

    it('应该拒绝更新不存在的适配器', () => {
      const result = manager.updateAdapterConfig(
        'nonexistent',
        AdapterType.BINANCE,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('适配器 nonexistent 不存在');
    });
  });

  describe('getAdapterConfig', () => {
    it('应该返回存在的适配器配置', () => {
      const config = AdapterConfigFactory.createBinanceConfig();
      manager.addAdapterConfig('binance', AdapterType.BINANCE, config);

      const retrieved = manager.getAdapterConfig('binance');
      expect(retrieved).toBeDefined();
      expect(retrieved?.config.endpoints.ws).toBe('wss://stream.binance.com:9443/ws');
    });

    it('应该对不存在的适配器返回undefined', () => {
      const retrieved = manager.getAdapterConfig('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('removeAdapterConfig', () => {
    it('应该移除存在的适配器配置', () => {
      manager.addAdapterConfig('binance', AdapterType.BINANCE, AdapterConfigFactory.createBinanceConfig());
      
      const removed = manager.removeAdapterConfig('binance');
      expect(removed).toBe(true);
      
      const retrieved = manager.getAdapterConfig('binance');
      expect(retrieved).toBeUndefined();
    });

    it('应该对不存在的适配器返回false', () => {
      const removed = manager.removeAdapterConfig('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('validateAllConfigs', () => {
    it('应该验证所有适配器配置', () => {
      // 添加有效配置
      manager.addAdapterConfig('binance1', AdapterType.BINANCE, AdapterConfigFactory.createBinanceConfig());
      
      // 添加无效配置
      const invalidConfig = AdapterConfigFactory.createBinanceConfig();
      invalidConfig.config.endpoints.ws = '';
      manager.addAdapterConfig('binance2', AdapterType.BINANCE, invalidConfig, { validate: false });

      const results = manager.validateAllConfigs();
      
      expect(results['binance1']).toHaveLength(0);  // 有效配置
      expect(results['binance2'].length).toBeGreaterThan(0);  // 无效配置
      expect(results['binance2']).toContain('WebSocket端点不能为空');
    });
  });

  describe('batchImportConfigs', () => {
    it('应该批量导入多个配置', () => {
      const configs = {
        'binance': {
          type: AdapterType.BINANCE,
          config: {
            config: {
              enabled: true,
              endpoints: {
                ws: 'wss://stream.binance.com:9443/ws',
                rest: 'https://api.binance.com/api'
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
              }
            },
            subscription: {
              symbols: ['BTC-USDT'],
              dataTypes: [DataType.TRADE]
            }
          }
        }
      };

      const results = manager.batchImportConfigs(configs);
      
      expect(results['binance'].success).toBe(true);
      expect(results['okx'].success).toBe(true);
      expect(manager.getAllAdapterConfigs().size).toBe(2);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      // 添加启用的适配器
      const enabledConfig = AdapterConfigFactory.createBinanceConfig();
      manager.addAdapterConfig('binance1', AdapterType.BINANCE, enabledConfig);
      
      // 添加禁用的适配器
      const disabledConfig = AdapterConfigFactory.createBinanceConfig();
      disabledConfig.config.enabled = false;
      manager.addAdapterConfig('binance2', AdapterType.BINANCE, disabledConfig);
      
      // 添加OKX适配器
      manager.addAdapterConfig('okx', AdapterType.OKEX, AdapterConfigFactory.createOkxConfig());

      const stats = manager.getStats();
      
      expect(stats.totalAdapters).toBe(3);
      expect(stats.enabledAdapters).toBe(2);
      expect(stats.disabledAdapters).toBe(1);
      expect(stats.byType[AdapterType.BINANCE]).toBe(2);
      expect(stats.byType[AdapterType.OKEX]).toBe(1);
    });
  });

  describe('exportConfigs', () => {
    it('应该导出所有配置为JSON', () => {
      manager.addAdapterConfig('binance', AdapterType.BINANCE, AdapterConfigFactory.createBinanceConfig());
      manager.addAdapterConfig('okx', AdapterType.OKEX, AdapterConfigFactory.createOkxConfig());

      const exported = manager.exportConfigs();
      
      expect(Object.keys(exported)).toEqual(['binance', 'okx']);
      expect(exported['binance'].config.endpoints.ws).toBe('wss://stream.binance.com:9443/ws');
      expect(exported['okx'].config.endpoints.ws).toBe('wss://ws.okx.com:8443/ws/v5/public');
    });
  });

  describe('clear', () => {
    it('应该清空所有配置', () => {
      manager.addAdapterConfig('binance', AdapterType.BINANCE, AdapterConfigFactory.createBinanceConfig());
      manager.addAdapterConfig('okx', AdapterType.OKEX, AdapterConfigFactory.createOkxConfig());
      
      expect(manager.getAllAdapterConfigs().size).toBe(2);
      
      manager.clear();
      
      expect(manager.getAllAdapterConfigs().size).toBe(0);
    });
  });

  describe('深度合并测试', () => {
    it('应该深度合并嵌套配置', () => {
      const baseConfig = AdapterConfigFactory.createBinanceConfig();
      manager.addAdapterConfig('binance', AdapterType.BINANCE, baseConfig);

      const result = manager.updateAdapterConfig(
        'binance',
        AdapterType.BINANCE,
        {
          config: {
            connection: {
              timeout: 20000  // 只更新timeout，其他字段应该保留
            } as any
          },
          extensions: {
            testnet: true,  // 更新扩展配置的单个字段
            // enableCompression应该保留原值
          }
        }
      );

      expect(result.success).toBe(true);
      expect(result.config.config.connection.timeout).toBe(20000);
      expect(result.config.config.connection.maxRetries).toBe(3);  // 原值保留
      
      const extensions = result.config.extensions as BinanceExtensions;
      expect(extensions.testnet).toBe(true);  // 更新的值
      expect(extensions.enableCompression).toBe(true);  // 原值保留
    });
  });
});