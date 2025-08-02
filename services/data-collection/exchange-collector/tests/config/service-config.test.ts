/**
 * 服务配置管理器单元测试
 */

import { ExchangeCollectorConfigManager } from '../../src/config/service-config';
import { AdapterType } from '../../src/config/adapter-config';
import { DataType } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';

describe('ExchangeCollectorConfigManager', () => {
  let configManager: ExchangeCollectorConfigManager;

  beforeEach(() => {
    configManager = new ExchangeCollectorConfigManager();
    
    // Mock 配置加载
    jest.spyOn(configManager, 'load').mockResolvedValue({ 
      config: {} as any,
      sources: [],
      timestamp: Date.now(),
      hasValidationErrors: false
    });
    jest.spyOn(configManager, 'getConfig').mockReturnValue({
      name: 'exchange-collector',
      version: '1.0.0',
      environment: 'test',
      server: {
        port: 8080,
        host: '0.0.0.0',
        enableCors: true
      },
      adapters: {
        binance: {
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
            dataTypes: [DataType.TRADE, DataType.TICKER],
            enableAllTickers: false,
            customParams: {}
          },
          extensions: {
            testnet: false,
            enableCompression: true
          }
        }
      },
      pubsub: {
        projectId: 'test-project',
        useEmulator: true,
        emulatorHost: 'localhost:8085',
        topicPrefix: 'market-data',
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
        level: 'info' as const,
        format: 'json' as const,
        output: 'console' as const
      }
    });
  });

  afterAll(() => {
    globalCache.destroy();
  });

  describe('getAdapterConfig', () => {
    it('应该返回存在的适配器配置', () => {
      const config = configManager.getAdapterConfig('binance');
      
      expect(config).toBeDefined();
      expect(config?.config.enabled).toBe(true);
      expect(config?.config.endpoints.ws).toBe('wss://stream.binance.com:9443/ws');
      expect(config?.subscription.symbols).toEqual(['BTCUSDT']);
    });

    it('应该对不存在的适配器返回undefined', () => {
      const config = configManager.getAdapterConfig('nonexistent');
      expect(config).toBeUndefined();
    });
  });

  describe('getEnabledAdapters', () => {
    it('应该返回启用的适配器列表', () => {
      const enabledAdapters = configManager.getEnabledAdapters();
      expect(enabledAdapters).toEqual(['binance']);
    });

    it('应该过滤禁用的适配器', () => {
      // 修改mock返回禁用的适配器
      const mockConfig = configManager.getConfig()!;
      mockConfig.adapters.binance.config.enabled = false;
      mockConfig.adapters.okx = {
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
          dataTypes: [DataType.TRADE],
          enableAllTickers: false,
          customParams: {}
        }
      };

      jest.spyOn(configManager, 'getConfig').mockReturnValue(mockConfig);
      
      const enabledAdapters = configManager.getEnabledAdapters();
      expect(enabledAdapters).toEqual(['okx']);
    });
  });

  describe('isAdapterEnabled', () => {
    it('应该返回适配器启用状态', () => {
      expect(configManager.isAdapterEnabled('binance')).toBe(true);
      expect(configManager.isAdapterEnabled('nonexistent')).toBe(false);
    });
  });

  describe('setAdapterConfig', () => {
    it('应该设置新的适配器配置', () => {
      jest.spyOn(configManager, 'emit').mockImplementation(() => true);
      
      const result = configManager.setAdapterConfig(
        'okx',
        AdapterType.OKEX,
        {
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
      );

      expect(result.success).toBe(true);
      expect(result.config.config.endpoints.ws).toBe('wss://ws.okx.com:8443/ws/v5/public');
      expect(configManager.emit).toHaveBeenCalled();
    });

    it('应该处理配置验证错误', () => {
      jest.spyOn(configManager, 'emit').mockImplementation(() => true);
      
      const result = configManager.setAdapterConfig(
        'invalid',
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
      expect(configManager.emit).not.toHaveBeenCalled();
    });
  });

  describe('removeAdapterConfig', () => {
    it('应该移除存在的适配器配置', () => {
      jest.spyOn(configManager, 'emit').mockImplementation(() => true);
      
      const result = configManager.removeAdapterConfig('binance');
      
      expect(result).toBe(true);
      expect(configManager.emit).toHaveBeenCalled();
    });

    it('应该对不存在的适配器返回false', () => {
      jest.spyOn(configManager, 'emit').mockImplementation(() => true);
      
      const result = configManager.removeAdapterConfig('nonexistent');
      
      expect(result).toBe(false);
      expect(configManager.emit).not.toHaveBeenCalled();
    });
  });

  describe('validateAdapterConfigs', () => {
    it('应该验证所有适配器配置', () => {
      const results = configManager.validateAdapterConfigs();
      
      expect(results).toHaveProperty('binance');
      expect(results['binance']).toEqual([]);  // 无错误表示配置有效
    });
  });

  describe('getAdapterStats', () => {
    it('应该返回适配器统计信息', () => {
      const stats = configManager.getAdapterStats();
      
      expect(stats.totalAdapters).toBe(1);
      expect(stats.enabledAdapters).toBe(1);
      expect(stats.disabledAdapters).toBe(0);
      expect(stats.byType).toHaveProperty(AdapterType.BINANCE);
    });
  });

  describe('batchImportAdapterConfigs', () => {
    it('应该批量导入适配器配置', () => {
      jest.spyOn(configManager, 'emit').mockImplementation(() => true);
      
      const configs = {
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
        },
        'huobi': {
          type: AdapterType.BINANCE,  // 使用Binance作为默认类型
          config: {
            config: {
              enabled: true,
              endpoints: {
                ws: 'wss://api.huobi.pro/ws',
                rest: 'https://api.huobi.pro'
              },
              connection: {
                timeout: 10000,
                maxRetries: 3,
                retryInterval: 5000,
                heartbeatInterval: 30000
              }
            },
            subscription: {
              symbols: ['btcusdt'],
              dataTypes: [DataType.TRADE]
            }
          }
        }
      };

      const results = configManager.batchImportAdapterConfigs(configs);
      
      expect(results['okx'].success).toBe(true);
      expect(results['huobi'].success).toBe(true);
      expect(configManager.emit).toHaveBeenCalled();
    });
  });

  describe('getPubSubConfig', () => {
    it('应该返回Pub/Sub配置', () => {
      const pubsubConfig = configManager.getPubSubConfig();
      
      expect(pubsubConfig).toBeDefined();
      expect(pubsubConfig?.projectId).toBe('test-project');
      expect(pubsubConfig?.useEmulator).toBe(true);
      expect(pubsubConfig?.topicPrefix).toBe('market-data');
    });
  });

  describe('getMonitoringConfig', () => {
    it('应该返回监控配置', () => {
      const monitoringConfig = configManager.getMonitoringConfig();
      
      expect(monitoringConfig).toBeDefined();
      expect(monitoringConfig?.enableMetrics).toBe(true);
      expect(monitoringConfig?.enableHealthCheck).toBe(true);
      expect(monitoringConfig?.prometheus.enabled).toBe(true);
    });
  });

  describe('getLoggingConfig', () => {
    it('应该返回日志配置', () => {
      const loggingConfig = configManager.getLoggingConfig();
      
      expect(loggingConfig).toBeDefined();
      expect(loggingConfig?.level).toBe('info');
      expect(loggingConfig?.format).toBe('json');
      expect(loggingConfig?.output).toBe('console');
    });
  });

  describe('环境变量覆盖测试', () => {
    beforeEach(() => {
      // 清除之前的mock
      jest.restoreAllMocks();
      
      // 重新创建配置管理器以测试环境变量覆盖
      configManager = new ExchangeCollectorConfigManager();
    });

    it('应该从环境变量设置Binance配置', () => {
      // 设置环境变量
      process.env.BINANCE_SYMBOLS = 'BTCUSDT,ETHUSDT,ADAUSDT';
      process.env.LOG_LEVEL = 'debug';
      process.env.PORT = '9000';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project-override';
      
      const config = (configManager as any).getDefaultConfig();
      const overrides = (configManager as any).applyEnvOverrides(config);
      
      expect(overrides.server.port).toBe(9000);
      expect(overrides.pubsub.projectId).toBe('test-project-override');
      expect(overrides.logging.level).toBe('debug');
      expect(overrides.adapters.binance.subscription.symbols).toEqual(['BTCUSDT', 'ETHUSDT', 'ADAUSDT']);
      
      // 清理环境变量
      delete process.env.BINANCE_SYMBOLS;
      delete process.env.LOG_LEVEL;
      delete process.env.PORT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
    });
  });
});