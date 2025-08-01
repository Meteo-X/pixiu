import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as Joi from 'joi';
import { ServiceConfig, DataType } from '../types';

// 配置验证 Schema
const configSchema = Joi.object({
  server: Joi.object({
    port: Joi.number().port().default(8080),
    host: Joi.string().default('0.0.0.0')
  }).default(),
  
  exchanges: Joi.object().pattern(
    Joi.string(),
    Joi.object({
      wsEndpoint: Joi.string().uri().required(),
      restEndpoint: Joi.string().uri(),
      symbols: Joi.array().items(Joi.string()).min(1).required(),
      dataTypes: Joi.array().items(
        Joi.string().valid(...Object.values(DataType))
      ).min(1).required(),
      connections: Joi.object({
        max: Joi.number().min(1).max(20).default(5),
        streamsPerConnection: Joi.number().min(1).max(1024).default(1000)
      }).default()
    })
  ).min(1).required(),
  
  googleCloud: Joi.object({
    projectId: Joi.string().required(),
    pubsub: Joi.object({
      enabled: Joi.boolean().default(true),
      emulatorHost: Joi.string(),
      topicPrefix: Joi.string().default('market-data'),
      publishSettings: Joi.object({
        enableMessageOrdering: Joi.boolean().default(false),
        batchSettings: Joi.object({
          maxMessages: Joi.number().min(1).default(100),
          maxBytes: Joi.number().min(1).default(1048576),
          maxLatency: Joi.number().min(1).default(100)
        }).default(),
        retrySettings: Joi.object({
          maxRetries: Joi.number().min(0).default(3),
          initialRetryDelay: Joi.number().min(1).default(100),
          maxRetryDelay: Joi.number().min(1000).default(60000)
        }).default()
      }).default()
    }).default()
  }).required(),
  
  monitoring: Joi.object({
    prometheus: Joi.object({
      enabled: Joi.boolean().default(true),
      port: Joi.number().port().default(9090),
      path: Joi.string().default('/metrics')
    }).default(),
    healthCheck: Joi.object({
      interval: Joi.number().min(1000).default(30000),
      timeout: Joi.number().min(1000).default(5000)
    }).default()
  }).default(),
  
  logging: Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    format: Joi.string().valid('json', 'simple').default('json'),
    file: Joi.object({
      enabled: Joi.boolean().default(false),
      path: Joi.string().default('./logs/app.log'),
      maxSize: Joi.string().default('100m'),
      maxFiles: Joi.number().min(1).default(5)
    }).default()
  }).default(),
  
  connection: Joi.object({
    maxConnectionsPerExchange: Joi.number().min(1).max(50).default(10),
    maxStreamsPerConnection: Joi.number().min(1).max(1024).default(1000),
    reconnectDelay: Joi.number().min(100).default(1000),
    maxReconnectDelay: Joi.number().min(1000).default(30000),
    heartbeatInterval: Joi.number().min(5000).default(30000),
    pingTimeout: Joi.number().min(1000).default(10000)
  }).default()
});

export class ConfigManager {
  private static instance: ConfigManager;
  private config: ServiceConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public getConfig(): ServiceConfig {
    return this.config;
  }

  public getExchangeConfig(exchange: string) {
    return this.config.exchanges[exchange];
  }

  private loadConfig(): ServiceConfig {
    const env = process.env.NODE_ENV || 'development';
    const configFile = process.env.CONFIG_FILE || `config/${env}.yaml`;
    
    let configData: any = {};
    
    // 尝试从文件加载配置
    if (fs.existsSync(configFile)) {
      const fileContent = fs.readFileSync(configFile, 'utf-8');
      if (configFile.endsWith('.yaml') || configFile.endsWith('.yml')) {
        configData = yaml.parse(fileContent);
      } else {
        configData = JSON.parse(fileContent);
      }
    }
    
    // 环境变量覆盖
    this.overrideWithEnv(configData);
    
    // 验证配置
    const { error, value } = configSchema.validate(configData, {
      allowUnknown: false,
      stripUnknown: true
    });
    
    if (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
    
    return value as ServiceConfig;
  }

  private overrideWithEnv(config: any): void {
    // 服务器配置
    if (process.env.PORT) {
      config.server = config.server || {};
      config.server.port = parseInt(process.env.PORT, 10);
    }
    
    if (process.env.HOST) {
      config.server = config.server || {};
      config.server.host = process.env.HOST;
    }
    
    // Google Cloud 配置
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      config.googleCloud = config.googleCloud || { pubsub: {} };
      config.googleCloud.projectId = process.env.GOOGLE_CLOUD_PROJECT;
    }
    
    if (process.env.PUBSUB_EMULATOR_HOST) {
      config.googleCloud = config.googleCloud || { pubsub: {} };
      config.googleCloud.pubsub.emulatorHost = process.env.PUBSUB_EMULATOR_HOST;
    }
    
    // 日志配置
    if (process.env.LOG_LEVEL) {
      config.logging = config.logging || {};
      config.logging.level = process.env.LOG_LEVEL;
    }
    
    // Binance 配置
    if (process.env.BINANCE_SYMBOLS) {
      config.exchanges = config.exchanges || {};
      config.exchanges.binance = config.exchanges.binance || {
        wsEndpoint: 'wss://stream.binance.com:9443',
        dataTypes: ['trade', 'kline_1m']
      };
      config.exchanges.binance.symbols = process.env.BINANCE_SYMBOLS.split(',');
    }
  }

  public reload(): void {
    this.config = this.loadConfig();
  }
}

// 默认配置
export const defaultConfig: Partial<ServiceConfig> = {
  server: {
    port: 8080,
    host: '0.0.0.0'
  },
  
  exchanges: {
    binance: {
      wsEndpoint: 'wss://stream.binance.com:9443',
      symbols: ['BTC/USDT', 'ETH/USDT'],
      dataTypes: [DataType.TRADE, DataType.KLINE_1M],
      connections: {
        max: 5,
        streamsPerConnection: 1000
      }
    }
  },
  
  googleCloud: {
    projectId: 'pixiu-trading-dev',
    pubsub: {
      enabled: true,
      emulatorHost: 'localhost:8085',
      topicPrefix: 'market-data',
      publishSettings: {
        enableMessageOrdering: false,
        batchSettings: {
          maxMessages: 100,
          maxBytes: 1048576,
          maxLatency: 100
        },
        retrySettings: {
          maxRetries: 3,
          initialRetryDelay: 100,
          maxRetryDelay: 60000
        }
      }
    }
  },
  
  monitoring: {
    prometheus: {
      enabled: true,
      port: 9090,
      path: '/metrics'
    },
    healthCheck: {
      interval: 30000,
      timeout: 5000
    }
  },
  
  logging: {
    level: 'info',
    format: 'json'
  },
  
  connection: {
    maxConnectionsPerExchange: 10,
    maxStreamsPerConnection: 1000,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    heartbeatInterval: 30000,
    pingTimeout: 10000
  }
};

// 导出单例实例
export const config = ConfigManager.getInstance();