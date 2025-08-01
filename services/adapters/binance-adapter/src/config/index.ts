/**
 * Binance 适配器配置系统
 * 
 * 提供完整的配置管理功能，包括：
 * - 配置结构设计
 * - 配置加载和验证
 * - 环境变量支持
 * - 开发/生产环境预设
 * - Google Secret Manager 集成
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { 
  AdapterConfig, 
  ConnectionConfig, 
  RetryConfig, 
  MonitoringConfig,
  ConfigurationError 
} from '../types';

// 重新导出 ConfigurationError
export { ConfigurationError } from '../types';

/**
 * Binance 适配器特定配置
 */
export interface BinanceAdapterConfig extends AdapterConfig {
  /** Binance WebSocket 端点 */
  wsEndpoint: string;
  
  /** Binance REST API 端点 */
  restEndpoint: string;
  
  /** 环境标识 */
  environment: 'development' | 'testing' | 'production';
  
  /** API 凭据配置 */
  credentials?: BinanceCredentials;
  
  /** 订阅配置 */
  subscriptions: SubscriptionConfig;
  
  /** 日志配置 */
  logging: LoggingConfig;
}

/**
 * Binance API 凭据
 */
export interface BinanceCredentials {
  /** API Key (可选，现货数据不需要) */
  apiKey?: string;
  
  /** API Secret (可选，现货数据不需要) */
  apiSecret?: string;
  
  /** 从 Secret Manager 加载 */
  useSecretManager?: boolean;
  
  /** Secret Manager 中的 secret 名称 */
  secretName?: string;
}

/**
 * 订阅配置
 */
export interface SubscriptionConfig {
  /** 默认订阅符号 */
  defaultSymbols: string[];
  
  /** 支持的数据类型 */
  supportedDataTypes: string[];
  
  /** 批量订阅设置 */
  batchSubscription: {
    /** 是否启用批量订阅 */
    enabled: boolean;
    
    /** 批量大小 */
    batchSize: number;
    
    /** 批量间隔 (毫秒) */
    batchInterval: number;
  };
  
  /** 订阅管理 */
  management: {
    /** 自动重新订阅失败的流 */
    autoResubscribe: boolean;
    
    /** 订阅超时时间 */
    subscriptionTimeout: number;
    
    /** 最大并发订阅数 */
    maxConcurrentSubscriptions: number;
  };
}

/**
 * 日志配置
 */
export interface LoggingConfig {
  /** 日志级别 */
  level: 'debug' | 'info' | 'warn' | 'error';
  
  /** 输出格式 */
  format: 'json' | 'text';
  
  /** 是否启用结构化日志 */
  structured: boolean;
}

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 默认连接配置
 */
export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  maxConnections: 5,
  maxStreamsPerConnection: 1000,
  heartbeatInterval: 20000,
  pingTimeout: 25000,
  connectionTimeout: 30000
};

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 50,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2.0,
  jitter: true
};

/**
 * 默认订阅配置
 */
export const DEFAULT_SUBSCRIPTION_CONFIG: SubscriptionConfig = {
  defaultSymbols: ['BTCUSDT', 'ETHUSDT'],
  supportedDataTypes: ['trade', 'kline_1m', 'kline_5m', 'ticker'],
  batchSubscription: {
    enabled: true,
    batchSize: 100,
    batchInterval: 1000
  },
  management: {
    autoResubscribe: true,
    subscriptionTimeout: 10000,
    maxConcurrentSubscriptions: 5000
  }
};

/**
 * 默认日志配置
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: 'info',
  format: 'json',
  structured: true
};

/**
 * 默认监控配置
 */
export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  prometheus: {
    enabled: true,
    port: 9090,
    path: '/metrics'
  },
  healthCheck: {
    interval: 30000,
    timeout: 5000
  }
};

// ============================================================================
// 配置预设
// ============================================================================

/**
 * 开发环境配置
 */
export function createDevelopmentConfig(): BinanceAdapterConfig {
  return {
    wsEndpoint: 'wss://stream.binance.com:9443',
    restEndpoint: 'https://api.binance.com',
    environment: 'development',
    
    connection: {
      ...DEFAULT_CONNECTION_CONFIG,
      maxConnections: 2,
      maxStreamsPerConnection: 100
    },
    
    retry: {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 10,
      maxDelay: 10000
    },
    
    subscriptions: {
      ...DEFAULT_SUBSCRIPTION_CONFIG,
      defaultSymbols: ['BTCUSDT'],
      batchSubscription: {
        ...DEFAULT_SUBSCRIPTION_CONFIG.batchSubscription,
        batchSize: 10
      }
    },
    
    logging: {
      ...DEFAULT_LOGGING_CONFIG,
      level: 'debug',
      format: 'text'
    },
    
    monitoring: {
      ...DEFAULT_MONITORING_CONFIG,
      prometheus: {
        ...DEFAULT_MONITORING_CONFIG.prometheus,
        port: 9091
      }
    }
  };
}

/**
 * 测试环境配置
 */
export function createTestingConfig(): BinanceAdapterConfig {
  return {
    wsEndpoint: 'wss://testnet.binance.vision/ws',
    restEndpoint: 'https://testnet.binance.vision/api',
    environment: 'testing',
    
    connection: {
      ...DEFAULT_CONNECTION_CONFIG,
      maxConnections: 1,
      maxStreamsPerConnection: 10,
      connectionTimeout: 10000
    },
    
    retry: {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 3,
      maxDelay: 5000,
      initialDelay: 500
    },
    
    subscriptions: {
      ...DEFAULT_SUBSCRIPTION_CONFIG,
      defaultSymbols: ['BTCUSDT'],
      batchSubscription: {
        ...DEFAULT_SUBSCRIPTION_CONFIG.batchSubscription,
        batchSize: 5,
        enabled: false
      },
      management: {
        ...DEFAULT_SUBSCRIPTION_CONFIG.management,
        maxConcurrentSubscriptions: 50
      }
    },
    
    logging: {
      ...DEFAULT_LOGGING_CONFIG,
      level: 'debug'
    },
    
    monitoring: {
      ...DEFAULT_MONITORING_CONFIG,
      prometheus: {
        enabled: false,
        port: 0,
        path: '/metrics'
      }
    }
  };
}

/**
 * 生产环境配置
 */
export function createProductionConfig(): BinanceAdapterConfig {
  return {
    wsEndpoint: 'wss://stream.binance.com:9443',
    restEndpoint: 'https://api.binance.com',
    environment: 'production',
    
    connection: {
      ...DEFAULT_CONNECTION_CONFIG,
      maxConnections: 10,
      maxStreamsPerConnection: 1000
    },
    
    retry: DEFAULT_RETRY_CONFIG,
    
    subscriptions: DEFAULT_SUBSCRIPTION_CONFIG,
    
    credentials: {
      useSecretManager: true,
      secretName: 'binance-api-credentials'
    },
    
    logging: {
      ...DEFAULT_LOGGING_CONFIG,
      level: 'info'
    },
    
    monitoring: {
      ...DEFAULT_MONITORING_CONFIG,
      healthCheck: {
        interval: 60000,
        timeout: 10000
      }
    }
  };
}

// ============================================================================
// 配置加载和验证
// ============================================================================

/**
 * 从文件加载配置
 */
export async function loadConfigFromFile(configPath: string): Promise<Partial<BinanceAdapterConfig>> {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const ext = path.extname(configPath).toLowerCase();
    
    switch (ext) {
      case '.json':
        return JSON.parse(content);
      case '.yaml':
      case '.yml':
        return yaml.load(content) as Partial<BinanceAdapterConfig>;
      default:
        throw new ConfigurationError(`Unsupported config file format: ${ext}`, undefined, { configPath });
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to load config from file: ${configPath}`,
      error as Error,
      { configPath }
    );
  }
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(): Partial<BinanceAdapterConfig> {
  const config: Partial<BinanceAdapterConfig> = {};
  
  // 基本配置
  if (process.env['BINANCE_WS_ENDPOINT']) {
    config.wsEndpoint = process.env['BINANCE_WS_ENDPOINT'];
  }
  if (process.env['BINANCE_REST_ENDPOINT']) {
    config.restEndpoint = process.env['BINANCE_REST_ENDPOINT'];
  }
  if (process.env['NODE_ENV']) {
    config.environment = process.env['NODE_ENV'] as 'development' | 'testing' | 'production';
  }
  
  // 连接配置
  if (process.env['BINANCE_MAX_CONNECTIONS'] || 
      process.env['BINANCE_MAX_STREAMS_PER_CONNECTION'] || 
      process.env['BINANCE_CONNECTION_TIMEOUT']) {
    config.connection = {
      maxConnections: process.env['BINANCE_MAX_CONNECTIONS'] ? 
        parseInt(process.env['BINANCE_MAX_CONNECTIONS']) : DEFAULT_CONNECTION_CONFIG.maxConnections,
      maxStreamsPerConnection: process.env['BINANCE_MAX_STREAMS_PER_CONNECTION'] ? 
        parseInt(process.env['BINANCE_MAX_STREAMS_PER_CONNECTION']) : DEFAULT_CONNECTION_CONFIG.maxStreamsPerConnection,
      heartbeatInterval: DEFAULT_CONNECTION_CONFIG.heartbeatInterval,
      pingTimeout: DEFAULT_CONNECTION_CONFIG.pingTimeout,
      connectionTimeout: process.env['BINANCE_CONNECTION_TIMEOUT'] ? 
        parseInt(process.env['BINANCE_CONNECTION_TIMEOUT']) : DEFAULT_CONNECTION_CONFIG.connectionTimeout
    };
  }
  
  // 重试配置
  if (process.env['BINANCE_MAX_RETRIES'] || 
      process.env['BINANCE_INITIAL_DELAY'] || 
      process.env['BINANCE_MAX_DELAY']) {
    config.retry = {
      maxRetries: process.env['BINANCE_MAX_RETRIES'] ? 
        parseInt(process.env['BINANCE_MAX_RETRIES']) : DEFAULT_RETRY_CONFIG.maxRetries,
      initialDelay: process.env['BINANCE_INITIAL_DELAY'] ? 
        parseInt(process.env['BINANCE_INITIAL_DELAY']) : DEFAULT_RETRY_CONFIG.initialDelay,
      maxDelay: process.env['BINANCE_MAX_DELAY'] ? 
        parseInt(process.env['BINANCE_MAX_DELAY']) : DEFAULT_RETRY_CONFIG.maxDelay,
      backoffMultiplier: DEFAULT_RETRY_CONFIG.backoffMultiplier,
      jitter: DEFAULT_RETRY_CONFIG.jitter
    };
  }
  
  // 凭据配置
  if (process.env['BINANCE_API_KEY'] || 
      process.env['BINANCE_API_SECRET'] || 
      process.env['BINANCE_USE_SECRET_MANAGER'] || 
      process.env['BINANCE_SECRET_NAME']) {
    const credentials: Partial<BinanceCredentials> = {};
    
    if (process.env['BINANCE_API_KEY']) {
      credentials.apiKey = process.env['BINANCE_API_KEY'];
    }
    if (process.env['BINANCE_API_SECRET']) {
      credentials.apiSecret = process.env['BINANCE_API_SECRET'];
    }
    if (process.env['BINANCE_USE_SECRET_MANAGER']) {
      credentials.useSecretManager = process.env['BINANCE_USE_SECRET_MANAGER'] === 'true';
    }
    if (process.env['BINANCE_SECRET_NAME']) {
      credentials.secretName = process.env['BINANCE_SECRET_NAME'];
    }
    
    config.credentials = credentials;
  }
  
  // 日志配置
  if (process.env['LOG_LEVEL'] || process.env['LOG_FORMAT']) {
    config.logging = {
      level: (process.env['LOG_LEVEL'] as 'debug' | 'info' | 'warn' | 'error') || DEFAULT_LOGGING_CONFIG.level,
      format: (process.env['LOG_FORMAT'] as 'json' | 'text') || DEFAULT_LOGGING_CONFIG.format,
      structured: DEFAULT_LOGGING_CONFIG.structured
    };
  }
  
  return config;
}

/**
 * 合并配置
 */
export function mergeConfigs(
  baseConfig: BinanceAdapterConfig,
  ...overrides: Partial<BinanceAdapterConfig>[]
): BinanceAdapterConfig {
  let result = { ...baseConfig };
  
  for (const override of overrides) {
    // 基础字段合并
    if (override.wsEndpoint) result.wsEndpoint = override.wsEndpoint;
    if (override.restEndpoint) result.restEndpoint = override.restEndpoint;
    if (override.environment) result.environment = override.environment;
    
    // 连接配置合并
    if (override.connection) {
      result.connection = { ...result.connection, ...override.connection };
    }
    
    // 重试配置合并
    if (override.retry) {
      result.retry = { ...result.retry, ...override.retry };
    }
    
    // 订阅配置合并
    if (override.subscriptions) {
      result.subscriptions = {
        ...result.subscriptions,
        ...override.subscriptions,
        batchSubscription: override.subscriptions.batchSubscription ? {
          ...result.subscriptions.batchSubscription,
          ...override.subscriptions.batchSubscription
        } : result.subscriptions.batchSubscription,
        management: override.subscriptions.management ? {
          ...result.subscriptions.management,
          ...override.subscriptions.management
        } : result.subscriptions.management
      };
    }
    
    // 日志配置合并
    if (override.logging) {
      result.logging = { ...result.logging, ...override.logging };
    }
    
    // 监控配置合并
    if (override.monitoring) {
      result.monitoring = result.monitoring ? 
        { ...result.monitoring, ...override.monitoring } : 
        override.monitoring;
    }
    
    // 凭据配置合并
    if (override.credentials) {
      result.credentials = { ...result.credentials, ...override.credentials };
    }
    
    // Google Cloud 配置合并
    if (override.googleCloud) {
      result.googleCloud = { ...result.googleCloud, ...override.googleCloud };
    }
  }
  
  return result;
}

/**
 * 获取环境预设配置
 */
export function getEnvironmentConfig(environment?: string): BinanceAdapterConfig {
  const env = environment || process.env['NODE_ENV'] || 'development';
  
  switch (env) {
    case 'testing':
      return createTestingConfig();
    case 'production':
      return createProductionConfig();
    case 'development':
    default:
      return createDevelopmentConfig();
  }
}

/**
 * 加载完整配置
 * 按优先级合并：环境预设 < 配置文件 < 环境变量
 */
export async function loadConfig(configPath?: string): Promise<BinanceAdapterConfig> {
  // 1. 获取环境预设配置
  const baseConfig = getEnvironmentConfig();
  
  // 2. 加载配置文件（如果提供）
  let fileConfig: Partial<BinanceAdapterConfig> = {};
  if (configPath) {
    fileConfig = await loadConfigFromFile(configPath);
  }
  
  // 3. 加载环境变量配置
  const envConfig = loadConfigFromEnv();
  
  // 4. 合并配置
  return mergeConfigs(baseConfig, fileConfig, envConfig);
}