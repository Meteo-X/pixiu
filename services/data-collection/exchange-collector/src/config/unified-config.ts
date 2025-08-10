/**
 * Exchange Collector统一配置实现
 * 基于shared-core的UnifiedConfigManager
 */

import { 
  UnifiedConfigManager, 
  UnifiedConfig, 
  getGlobalConfigManager,
  type ServiceConfig,
  type AdapterConfig,
  type DataFlowConfig,
  type WebSocketProxyConfig,
  type MonitoringConfig,
  type PubSubConfig,
  type LoggingConfig,
  DEFAULT_CONFIG_VALUES,
  createEnvMiddleware
} from '@pixiu/shared-core';
import { resolve } from 'path';

/**
 * Exchange Collector特定的配置接口
 */
export interface ExchangeCollectorConfig extends UnifiedConfig {
  // Exchange Collector特定的适配器配置
  adapters: {
    binance?: BinanceAdapterConfig;
    okx?: OkxAdapterConfig;
    bybit?: BybitAdapterConfig;
    [key: string]: AdapterConfig;
  };
  
  // 数据流特定配置
  dataflow: ExchangeDataFlowConfig;
  
  // 业务特定配置
  business: {
    enableDataPersistence: boolean;
    maxDataRetentionDays: number;
    enableRealTimeProcessing: boolean;
    dataQualityChecks: {
      enabled: boolean;
      maxLatencyMs: number;
      minDataFreshness: number;
    };
  };
}

export interface BinanceAdapterConfig extends AdapterConfig {
  extensions: {
    testnet: boolean;
    enableCompression: boolean;
    enableCombinedStream: boolean;
    maxStreamCount: number;
    apiRateLimit?: {
      requests: number;
      interval: number;
    };
  };
}

export interface OkxAdapterConfig extends AdapterConfig {
  extensions: {
    enablePrivateChannels: boolean;
    enablePublicChannels: boolean;
    compression: 'gzip' | 'deflate' | 'none';
  };
}

export interface BybitAdapterConfig extends AdapterConfig {
  extensions: {
    category: 'linear' | 'inverse' | 'option' | 'spot';
    enableDeepbook: boolean;
  };
}

export interface ExchangeDataFlowConfig extends DataFlowConfig {
  // Exchange特定的数据流配置
  exchange: {
    enableMultiExchange: boolean;
    crossExchangeValidation: boolean;
    dataAggregationStrategy: 'first' | 'latest' | 'merge';
    conflictResolution: 'priority' | 'timestamp' | 'manual';
  };
  
  // 数据类型特定配置
  dataTypes: {
    trade: {
      bufferSize: number;
      batchTimeout: number;
      enableDeduplication: boolean;
    };
    ticker: {
      bufferSize: number;
      batchTimeout: number;
      throttleInterval: number;
    };
    kline: {
      bufferSize: number;
      batchTimeout: number;
      intervals: string[];
    };
    orderbook: {
      bufferSize: number;
      batchTimeout: number;
      depth: number;
      enableSnapshot: boolean;
    };
  };
}

/**
 * Exchange Collector配置管理器
 */
export class ExchangeCollectorConfigManager {
  private configManager: UnifiedConfigManager;
  private currentConfig: ExchangeCollectorConfig | null = null;

  constructor() {
    this.configManager = getGlobalConfigManager();
  }

  /**
   * 初始化配置
   */
  async initialize(environment?: string): Promise<ExchangeCollectorConfig> {
    const env = environment || process.env.NODE_ENV || 'development';
    
    try {
      // 加载JSON Schema
      const schemaPath = resolve(__dirname, 'config-schema.json');
      this.configManager.loadJsonSchema(schemaPath);
      
      // 获取配置文件路径
      const configPaths = this.getConfigPaths(env);
      
      // 加载配置
      const baseConfig = this.configManager.loadConfiguration(env, configPaths);
      
      // 扩展为Exchange Collector特定配置
      this.currentConfig = this.extendToExchangeCollectorConfig(baseConfig);
      
      // 设置配置变更监听
      this.setupConfigChangeHandlers();
      
      return this.currentConfig;
    } catch (error) {
      throw new Error(`Failed to initialize Exchange Collector configuration: ${error}`);
    }
  }

  /**
   * 获取当前配置
   */
  getCurrentConfig(): ExchangeCollectorConfig | null {
    return this.currentConfig;
  }

  /**
   * 更新配置
   */
  updateConfig(path: string, value: any): void {
    this.configManager.updateConfiguration(path, value);
  }

  /**
   * 订阅配置变更
   */
  onConfigChange(callback: (config: ExchangeCollectorConfig) => void): () => void {
    return this.configManager.subscribeToChanges((config) => {
      this.currentConfig = this.extendToExchangeCollectorConfig(config);
      callback(this.currentConfig);
    });
  }

  /**
   * 获取适配器配置
   */
  getAdapterConfig(exchangeName: string): AdapterConfig | undefined {
    return this.currentConfig?.adapters[exchangeName];
  }

  /**
   * 检查适配器是否启用
   */
  isAdapterEnabled(exchangeName: string): boolean {
    const config = this.getAdapterConfig(exchangeName);
    return config?.enabled ?? false;
  }

  /**
   * 获取启用的适配器列表
   */
  getEnabledAdapters(): string[] {
    if (!this.currentConfig) return [];
    
    return Object.entries(this.currentConfig.adapters)
      .filter(([_, config]) => config?.enabled)
      .map(([name, _]) => name);
  }

  /**
   * 验证适配器配置
   */
  validateAdapterConfig(exchangeName: string): { valid: boolean; errors: string[] } {
    const config = this.getAdapterConfig(exchangeName);
    const errors: string[] = [];

    if (!config) {
      errors.push(`Adapter configuration not found: ${exchangeName}`);
      return { valid: false, errors };
    }

    if (!config.config.endpoints.ws) {
      errors.push(`WebSocket endpoint not configured for ${exchangeName}`);
    }

    if (!config.config.endpoints.rest) {
      errors.push(`REST endpoint not configured for ${exchangeName}`);
    }

    if (config.subscription.symbols.length === 0 && !config.subscription.enableAllTickers) {
      errors.push(`No symbols configured for ${exchangeName} and all tickers disabled`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取数据流配置
   */
  getDataFlowConfig(): ExchangeDataFlowConfig {
    return this.currentConfig?.dataflow ?? this.getDefaultDataFlowConfig();
  }

  /**
   * 销毁配置管理器
   */
  destroy(): void {
    this.configManager.destroy();
    this.currentConfig = null;
  }

  // ====== 私有方法 ======

  private getConfigPaths(environment: string): string[] {
    const basePath = resolve(__dirname, '../..');
    return [
      resolve(basePath, 'config', 'default.yaml'),
      resolve(basePath, 'config', `${environment}.yaml`),
      resolve(basePath, 'config', 'local.yaml')
    ];
  }

  private extendToExchangeCollectorConfig(baseConfig: UnifiedConfig): ExchangeCollectorConfig {
    const defaultBusinessConfig = {
      enableDataPersistence: true,
      maxDataRetentionDays: 7,
      enableRealTimeProcessing: true,
      dataQualityChecks: {
        enabled: true,
        maxLatencyMs: 1000,
        minDataFreshness: 5000
      }
    };

    const defaultDataFlowConfig = this.getDefaultDataFlowConfig();

    return {
      ...baseConfig,
      dataflow: {
        ...defaultDataFlowConfig,
        ...baseConfig.dataflow
      } as ExchangeDataFlowConfig,
      business: defaultBusinessConfig,
      adapters: baseConfig.adapters || {}
    } as ExchangeCollectorConfig;
  }

  private getDefaultDataFlowConfig(): ExchangeDataFlowConfig {
    return {
      ...DEFAULT_CONFIG_VALUES.dataflow,
      exchange: {
        enableMultiExchange: true,
        crossExchangeValidation: false,
        dataAggregationStrategy: 'latest',
        conflictResolution: 'timestamp'
      },
      dataTypes: {
        trade: {
          bufferSize: 500,
          batchTimeout: 100,
          enableDeduplication: true
        },
        ticker: {
          bufferSize: 200,
          batchTimeout: 500,
          throttleInterval: 1000
        },
        kline: {
          bufferSize: 300,
          batchTimeout: 1000,
          intervals: ['1m', '5m', '15m', '1h', '1d']
        },
        orderbook: {
          bufferSize: 100,
          batchTimeout: 50,
          depth: 20,
          enableSnapshot: true
        }
      }
    };
  }

  private setupConfigChangeHandlers(): void {
    this.configManager.on('configLoaded', (config) => {
      console.log('Configuration loaded successfully');
    });

    this.configManager.on('configChanged', (config, changes) => {
      console.log('Configuration changed:', changes.map(c => c.path));
      
      // 检查是否有关键配置变更需要重启服务
      const criticalPaths = [
        'service.server.port',
        'pubsub.projectId',
        'adapters'
      ];
      
      const hasCriticalChanges = changes.some(change => 
        criticalPaths.some(path => change.path.startsWith(path))
      );
      
      if (hasCriticalChanges) {
        console.warn('Critical configuration changes detected. Service restart may be required.');
      }
    });
  }
}

// 全局单例
let globalExchangeCollectorConfigManager: ExchangeCollectorConfigManager | null = null;

/**
 * 获取全局Exchange Collector配置管理器
 */
export function getExchangeCollectorConfigManager(): ExchangeCollectorConfigManager {
  if (!globalExchangeCollectorConfigManager) {
    globalExchangeCollectorConfigManager = new ExchangeCollectorConfigManager();
  }
  return globalExchangeCollectorConfigManager;
}

/**
 * 重置全局配置管理器（主要用于测试）
 */
export function resetExchangeCollectorConfigManager(): void {
  if (globalExchangeCollectorConfigManager) {
    globalExchangeCollectorConfigManager.destroy();
    globalExchangeCollectorConfigManager = null;
  }
}