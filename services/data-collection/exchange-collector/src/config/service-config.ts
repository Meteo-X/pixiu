/**
 * Exchange Collector服务配置管理
 * 基于shared-core的配置管理框架
 */

import * as Joi from 'joi';
import { BaseConfigManager, BaseConfig, ConfigSource } from '@pixiu/shared-core';
import { DataType } from '@pixiu/adapter-base';
import { 
  AdapterConfiguration, 
  PartialAdapterConfiguration,
  AdapterType
} from './adapter-config';
import { 
  MultiAdapterConfigManager,
  ConfigMergeOptions,
  ConfigMergeResult 
} from './config-merger';

export interface ExchangeCollectorConfig extends BaseConfig {
  /** 服务配置 */
  server: {
    port: number;
    host: string;
    enableCors: boolean;
  };

  /** 适配器配置 - 通用格式 */
  adapters: {
    [exchangeName: string]: AdapterConfiguration;
  };

  /** Pub/Sub配置 */
  pubsub: {
    projectId: string;
    useEmulator: boolean;
    emulatorHost?: string;
    topicPrefix: string;
    publishSettings: {
      enableBatching: boolean;
      batchSize: number;
      batchTimeout: number;
      enableMessageOrdering: boolean;
      retrySettings: {
        maxRetries: number;
        initialRetryDelay: number;
        maxRetryDelay: number;
      };
    };
  };

  /** 监控配置 */
  monitoring: {
    enableMetrics: boolean;
    enableHealthCheck: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
    prometheus: {
      enabled: boolean;
      port: number;
      path: string;
    };
  };

  /** 日志配置 */
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    format: 'json' | 'text';
    output: 'console' | 'file' | 'both';
    file?: {
      path: string;
      maxSize: string;
      maxFiles: number;
    };
  };
}

/**
 * 配置验证Schema
 */
const configSchema = Joi.object({
  name: Joi.string().default('exchange-collector'),
  version: Joi.string().default('1.0.0'),
  environment: Joi.string().default('development'),

  server: Joi.object({
    port: Joi.number().port().default(8080),
    host: Joi.string().default('0.0.0.0'),
    enableCors: Joi.boolean().default(true)
  }).default(),

  adapters: Joi.object().pattern(
    Joi.string(),
    Joi.object({
      config: Joi.object({
        enabled: Joi.boolean().default(true),
        endpoints: Joi.object({
          ws: Joi.string().uri().required(),
          rest: Joi.string().uri().required()
        }).required(),
        connection: Joi.object({
          timeout: Joi.number().min(1000).default(10000),
          maxRetries: Joi.number().min(0).default(3),
          retryInterval: Joi.number().min(1000).default(5000),
          heartbeatInterval: Joi.number().min(5000).default(30000)
        }).default(),
        auth: Joi.object({
          apiKey: Joi.string(),
          apiSecret: Joi.string()
        }).optional()
      }).required(),
      subscription: Joi.object({
        symbols: Joi.array().items(Joi.string()).min(1).required(),
        dataTypes: Joi.array().items(
          Joi.string().valid(...Object.values(DataType))
        ).min(1).required(),
        enableAllTickers: Joi.boolean().default(false),
        customParams: Joi.object().optional()
      }).required(),
      extensions: Joi.object().optional()
    })
  ).min(1).required(),

  pubsub: Joi.object({
    projectId: Joi.string().required(),
    useEmulator: Joi.boolean().default(false),
    emulatorHost: Joi.string().when('useEmulator', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    topicPrefix: Joi.string().default('market-data'),
    publishSettings: Joi.object({
      enableBatching: Joi.boolean().default(true),
      batchSize: Joi.number().min(1).default(100),
      batchTimeout: Joi.number().min(100).default(1000),
      enableMessageOrdering: Joi.boolean().default(false),
      retrySettings: Joi.object({
        maxRetries: Joi.number().min(0).default(3),
        initialRetryDelay: Joi.number().min(100).default(1000),
        maxRetryDelay: Joi.number().min(1000).default(60000)
      }).default()
    }).default()
  }).required(),

  monitoring: Joi.object({
    enableMetrics: Joi.boolean().default(true),
    enableHealthCheck: Joi.boolean().default(true),
    metricsInterval: Joi.number().min(1000).default(30000),
    healthCheckInterval: Joi.number().min(1000).default(30000),
    prometheus: Joi.object({
      enabled: Joi.boolean().default(true),
      port: Joi.number().port().default(9090),
      path: Joi.string().default('/metrics')
    }).default()
  }).default(),

  logging: Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info'),
    format: Joi.string().valid('json', 'text').default('json'),
    output: Joi.string().valid('console', 'file', 'both').default('console'),
    file: Joi.object({
      path: Joi.string().default('./logs/exchange-collector.log'),
      maxSize: Joi.string().default('100m'),
      maxFiles: Joi.number().min(1).default(5)
    }).when('output', {
      is: Joi.string().pattern(/file/),
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }).default()
});

/**
 * Exchange Collector配置管理器
 */
export class ExchangeCollectorConfigManager extends BaseConfigManager<ExchangeCollectorConfig> {
  
  private multiAdapterManager: MultiAdapterConfigManager;

  constructor() {
    super({
      enableValidation: true,
      enableHotReload: true,
      enableEnvOverride: true,
      cacheTtl: 300000 // 5分钟
    });

    this.multiAdapterManager = new MultiAdapterConfigManager();

    // 添加Joi验证器
    this.addValidator((config) => {
      const { error } = configSchema.validate(config, {
        allowUnknown: false,
        stripUnknown: true,
        abortEarly: false
      });

      if (error) {
        return error.details.map(detail => detail.message);
      }

      return true;
    });
  }

  /**
   * 获取默认配置源
   */
  protected getDefaultSources(): ConfigSource[] {
    const env = process.env.NODE_ENV || 'development';
    
    return [
      // 默认配置
      { type: 'default', source: 'default', priority: 1 },
      // 环境特定配置文件
      { type: 'file', source: `config/${env}.yaml`, priority: 2 },
      // 通用配置文件
      { type: 'file', source: 'config/config.yaml', priority: 3 },
      // 环境变量
      { type: 'env', source: 'EXCHANGE_COLLECTOR', priority: 4 }
    ];
  }

  /**
   * 获取默认配置
   */
  protected getDefaultConfig(): Partial<ExchangeCollectorConfig> {
    return {
      name: 'exchange-collector',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      
      server: {
        port: 8080,
        host: '0.0.0.0',
        enableCors: true
      },

      adapters: {},

      pubsub: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT || 'pixiu-trading-dev',
        useEmulator: process.env.NODE_ENV !== 'production',
        emulatorHost: process.env.PUBSUB_EMULATOR_HOST || 'localhost:8085',
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
        level: process.env.LOG_LEVEL as any || 'info',
        format: 'json',
        output: 'console'
      }
    };
  }

  /**
   * 应用环境变量覆盖
   */
  protected applyEnvOverrides(config: any): any {
    const overrides = super.applyEnvOverrides(config);

    // 服务器配置
    if (process.env.PORT) {
      overrides.server = overrides.server || {};
      overrides.server.port = parseInt(process.env.PORT, 10);
    }

    if (process.env.HOST) {
      overrides.server = overrides.server || {};
      overrides.server.host = process.env.HOST;
    }

    // Pub/Sub配置
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      overrides.pubsub = overrides.pubsub || {};
      overrides.pubsub.projectId = process.env.GOOGLE_CLOUD_PROJECT;
    }

    if (process.env.PUBSUB_EMULATOR_HOST) {
      overrides.pubsub = overrides.pubsub || {};
      overrides.pubsub.useEmulator = true;
      overrides.pubsub.emulatorHost = process.env.PUBSUB_EMULATOR_HOST;
    }

    // 日志配置
    if (process.env.LOG_LEVEL) {
      overrides.logging = overrides.logging || {};
      overrides.logging.level = process.env.LOG_LEVEL;
    }

    // Binance配置（从环境变量）
    if (process.env.BINANCE_SYMBOLS) {
      overrides.adapters = overrides.adapters || {};
      overrides.adapters.binance = overrides.adapters.binance || {
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
          symbols: process.env.BINANCE_SYMBOLS.split(','),
          dataTypes: [DataType.TRADE, DataType.TICKER],
          customParams: {}
        },
        extensions: {
          testnet: false,
          enableCompression: true
        }
      };
    }

    return overrides;
  }

  /**
   * 获取适配器配置
   */
  getAdapterConfig(exchangeName: string): AdapterConfiguration | undefined {
    const config = this.getConfig();
    return config?.adapters[exchangeName];
  }

  /**
   * 获取启用的适配器列表
   */
  getEnabledAdapters(): string[] {
    const config = this.getConfig();
    if (!config) return [];

    return Object.entries(config.adapters)
      .filter(([, adapterConfig]) => adapterConfig.config.enabled)
      .map(([name]) => name);
  }

  /**
   * 检查适配器是否启用
   */
  isAdapterEnabled(exchangeName: string): boolean {
    const adapterConfig = this.getAdapterConfig(exchangeName);
    return adapterConfig?.config.enabled || false;
  }

  /**
   * 添加或更新适配器配置
   */
  setAdapterConfig(
    exchangeName: string, 
    adapterType: AdapterType, 
    configuration: PartialAdapterConfiguration,
    options?: Partial<ConfigMergeOptions>
  ): ConfigMergeResult {
    const result = this.multiAdapterManager.addAdapterConfig(
      exchangeName, 
      adapterType, 
      configuration, 
      options
    );

    if (result.success) {
      // 更新内部配置对象
      if (this.config) {
        this.config.adapters[exchangeName] = result.config;
        this.emit('config', { type: 'update', config: this.config });
      }
    }

    return result;
  }

  /**
   * 移除适配器配置
   */
  removeAdapterConfig(exchangeName: string): boolean {
    if (this.config && this.config.adapters[exchangeName]) {
      delete this.config.adapters[exchangeName];
      this.emit('config', { type: 'update', config: this.config });
      return this.multiAdapterManager.removeAdapterConfig(exchangeName);
    }
    return false;
  }

  /**
   * 验证所有适配器配置
   */
  validateAdapterConfigs(): { [adapterName: string]: string[] } {
    return this.multiAdapterManager.validateAllConfigs();
  }

  /**
   * 获取适配器配置统计信息
   */
  getAdapterStats() {
    return this.multiAdapterManager.getStats();
  }

  /**
   * 批量导入适配器配置
   */
  batchImportAdapterConfigs(
    configs: { [adapterName: string]: { type: AdapterType; config: PartialAdapterConfiguration } },
    options?: Partial<ConfigMergeOptions>
  ): { [adapterName: string]: ConfigMergeResult } {
    const results = this.multiAdapterManager.batchImportConfigs(configs, options);
    
    // 更新主配置
    if (this.config) {
      for (const [adapterName, result] of Object.entries(results)) {
        if (result.success) {
          this.config.adapters[adapterName] = result.config;
        }
      }
      this.emit('config', { type: 'update', config: this.config });
    }

    return results;
  }

  /**
   * 获取Pub/Sub配置
   */
  getPubSubConfig() {
    return this.get('pubsub');
  }

  /**
   * 获取监控配置
   */
  getMonitoringConfig() {
    return this.get('monitoring');
  }

  /**
   * 获取日志配置
   */
  getLoggingConfig() {
    return this.get('logging');
  }
}

/**
 * 全局配置管理器实例
 */
export const configManager = new ExchangeCollectorConfigManager();