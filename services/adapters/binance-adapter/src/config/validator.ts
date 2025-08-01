/**
 * Binance 适配器配置验证器
 * 
 * 提供完整的配置验证功能，确保配置的正确性和安全性
 */

import { 
  BinanceAdapterConfig, 
  BinanceCredentials, 
  SubscriptionConfig, 
  LoggingConfig,
  ConfigurationError 
} from './index';

/**
 * 配置验证错误详情
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * 配置验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * 验证 URL 格式
 */
function isValidUrl(url: string, protocols: string[] = ['http:', 'https:', 'ws:', 'wss:']): boolean {
  try {
    const urlObj = new URL(url);
    return protocols.includes(urlObj.protocol);
  } catch {
    return false;
  }
}

/**
 * 验证正整数
 */
function isPositiveInteger(value: any): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * 验证数字范围
 */
function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * 验证基础配置
 */
function validateBasicConfig(config: BinanceAdapterConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // 验证 WebSocket 端点
  if (!config.wsEndpoint) {
    errors.push({
      field: 'wsEndpoint',
      message: 'WebSocket endpoint is required'
    });
  } else if (!isValidUrl(config.wsEndpoint, ['ws:', 'wss:'])) {
    errors.push({
      field: 'wsEndpoint',
      message: 'WebSocket endpoint must be a valid WebSocket URL (ws:// or wss://)',
      value: config.wsEndpoint
    });
  }
  
  // 验证 REST API 端点  
  if (!config.restEndpoint) {
    errors.push({
      field: 'restEndpoint',
      message: 'REST API endpoint is required'
    });
  } else if (!isValidUrl(config.restEndpoint, ['http:', 'https:'])) {
    errors.push({
      field: 'restEndpoint',
      message: 'REST API endpoint must be a valid HTTP URL (http:// or https://)',
      value: config.restEndpoint
    });
  }
  
  // 验证环境
  if (!config.environment) {
    errors.push({
      field: 'environment',
      message: 'Environment is required'
    });
  } else if (!['development', 'testing', 'production'].includes(config.environment)) {
    errors.push({
      field: 'environment',
      message: 'Environment must be one of: development, testing, production',
      value: config.environment
    });
  }
  
  return errors;
}

/**
 * 验证连接配置
 */
function validateConnectionConfig(config: BinanceAdapterConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const conn = config.connection;
  
  if (!conn) {
    errors.push({
      field: 'connection',
      message: 'Connection configuration is required'
    });
    return errors;
  }
  
  // 验证最大连接数
  if (!isPositiveInteger(conn.maxConnections)) {
    errors.push({
      field: 'connection.maxConnections',
      message: 'maxConnections must be a positive integer',
      value: conn.maxConnections
    });
  } else if (!isInRange(conn.maxConnections, 1, 20)) {
    errors.push({
      field: 'connection.maxConnections',
      message: 'maxConnections should be between 1 and 20',
      value: conn.maxConnections
    });
  }
  
  // 验证每连接最大流数
  if (!isPositiveInteger(conn.maxStreamsPerConnection)) {
    errors.push({
      field: 'connection.maxStreamsPerConnection',
      message: 'maxStreamsPerConnection must be a positive integer',
      value: conn.maxStreamsPerConnection
    });
  } else if (!isInRange(conn.maxStreamsPerConnection, 1, 1024)) {
    errors.push({
      field: 'connection.maxStreamsPerConnection',
      message: 'maxStreamsPerConnection should be between 1 and 1024 (Binance limit)',
      value: conn.maxStreamsPerConnection
    });
  }
  
  // 验证心跳间隔
  if (!isPositiveInteger(conn.heartbeatInterval)) {
    errors.push({
      field: 'connection.heartbeatInterval',
      message: 'heartbeatInterval must be a positive integer (milliseconds)',
      value: conn.heartbeatInterval
    });
  } else if (!isInRange(conn.heartbeatInterval, 1000, 60000)) {
    errors.push({
      field: 'connection.heartbeatInterval',
      message: 'heartbeatInterval should be between 1000ms and 60000ms',
      value: conn.heartbeatInterval
    });
  }
  
  // 验证 Ping 超时
  if (!isPositiveInteger(conn.pingTimeout)) {
    errors.push({
      field: 'connection.pingTimeout',
      message: 'pingTimeout must be a positive integer (milliseconds)',
      value: conn.pingTimeout
    });
  } else if (!isInRange(conn.pingTimeout, 5000, 120000)) {
    errors.push({
      field: 'connection.pingTimeout',
      message: 'pingTimeout should be between 5000ms and 120000ms',
      value: conn.pingTimeout
    });
  }
  
  // 验证连接超时
  if (!isPositiveInteger(conn.connectionTimeout)) {
    errors.push({
      field: 'connection.connectionTimeout',
      message: 'connectionTimeout must be a positive integer (milliseconds)',
      value: conn.connectionTimeout
    });
  } else if (!isInRange(conn.connectionTimeout, 5000, 60000)) {
    errors.push({
      field: 'connection.connectionTimeout',
      message: 'connectionTimeout should be between 5000ms and 60000ms',
      value: conn.connectionTimeout
    });
  }
  
  return errors;
}

/**
 * 验证重试配置
 */
function validateRetryConfig(config: BinanceAdapterConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const retry = config.retry;
  
  if (!retry) {
    errors.push({
      field: 'retry',
      message: 'Retry configuration is required'
    });
    return errors;
  }
  
  // 验证最大重试次数
  if (!isPositiveInteger(retry.maxRetries)) {
    errors.push({
      field: 'retry.maxRetries',
      message: 'maxRetries must be a positive integer',
      value: retry.maxRetries
    });
  } else if (!isInRange(retry.maxRetries, 1, 1000)) {
    errors.push({
      field: 'retry.maxRetries',
      message: 'maxRetries should be between 1 and 1000',
      value: retry.maxRetries
    });
  }
  
  // 验证初始延迟
  if (!isPositiveInteger(retry.initialDelay)) {
    errors.push({
      field: 'retry.initialDelay',
      message: 'initialDelay must be a positive integer (milliseconds)',
      value: retry.initialDelay
    });
  } else if (!isInRange(retry.initialDelay, 100, 10000)) {
    errors.push({
      field: 'retry.initialDelay',
      message: 'initialDelay should be between 100ms and 10000ms',
      value: retry.initialDelay
    });
  }
  
  // 验证最大延迟
  if (!isPositiveInteger(retry.maxDelay)) {
    errors.push({
      field: 'retry.maxDelay',
      message: 'maxDelay must be a positive integer (milliseconds)',
      value: retry.maxDelay
    });
  } else if (retry.maxDelay < retry.initialDelay) {
    errors.push({
      field: 'retry.maxDelay',
      message: 'maxDelay must be greater than or equal to initialDelay',
      value: retry.maxDelay
    });
  } else if (!isInRange(retry.maxDelay, 1000, 300000)) {
    errors.push({
      field: 'retry.maxDelay',
      message: 'maxDelay should be between 1000ms and 300000ms (5 minutes)',
      value: retry.maxDelay
    });
  }
  
  // 验证退避倍数
  if (typeof retry.backoffMultiplier !== 'number' || retry.backoffMultiplier < 1.0) {
    errors.push({
      field: 'retry.backoffMultiplier',
      message: 'backoffMultiplier must be a number >= 1.0',
      value: retry.backoffMultiplier
    });
  } else if (!isInRange(retry.backoffMultiplier, 1.0, 10.0)) {
    errors.push({
      field: 'retry.backoffMultiplier',
      message: 'backoffMultiplier should be between 1.0 and 10.0',
      value: retry.backoffMultiplier
    });
  }
  
  // 验证 jitter 
  if (typeof retry.jitter !== 'boolean') {
    errors.push({
      field: 'retry.jitter',
      message: 'jitter must be a boolean',
      value: retry.jitter
    });
  }
  
  return errors;
}

/**
 * 验证凭据配置
 */
function validateCredentials(credentials?: BinanceCredentials): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!credentials) {
    return errors; // 凭据是可选的（现货数据不需要）
  }
  
  // 如果使用 Secret Manager
  if (credentials.useSecretManager) {
    if (!credentials.secretName) {
      errors.push({
        field: 'credentials.secretName',
        message: 'secretName is required when useSecretManager is true'
      });
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(credentials.secretName)) {
      errors.push({
        field: 'credentials.secretName',
        message: 'secretName must be a valid secret name (alphanumeric, underscore, hyphen)',
        value: credentials.secretName
      });
    }
  }
  
  // 如果直接配置了 API Key
  if (credentials.apiKey && credentials.apiKey.length < 10) {
    errors.push({
      field: 'credentials.apiKey',
      message: 'apiKey seems too short (minimum 10 characters)'
    });
  }
  
  if (credentials.apiSecret && credentials.apiSecret.length < 10) {
    errors.push({
      field: 'credentials.apiSecret',
      message: 'apiSecret seems too short (minimum 10 characters)'
    });
  }
  
  return errors;
}

/**
 * 验证订阅配置
 */
function validateSubscriptionConfig(subscriptions: SubscriptionConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!subscriptions) {
    errors.push({
      field: 'subscriptions',
      message: 'Subscription configuration is required'
    });
    return errors;
  }
  
  // 验证默认符号
  if (!Array.isArray(subscriptions.defaultSymbols)) {
    errors.push({
      field: 'subscriptions.defaultSymbols',
      message: 'defaultSymbols must be an array'
    });
  } else if (subscriptions.defaultSymbols.length === 0) {
    errors.push({
      field: 'subscriptions.defaultSymbols',
      message: 'defaultSymbols must not be empty'
    });
  } else {
    // 验证符号格式
    for (const symbol of subscriptions.defaultSymbols) {
      if (typeof symbol !== 'string' || !/^[A-Z]{2,}[A-Z]{2,}$/.test(symbol)) {
        errors.push({
          field: 'subscriptions.defaultSymbols',
          message: `Invalid symbol format: ${symbol}. Expected format: BTCUSDT`,
          value: symbol
        });
      }
    }
  }
  
  // 验证支持的数据类型
  if (!Array.isArray(subscriptions.supportedDataTypes)) {
    errors.push({
      field: 'subscriptions.supportedDataTypes',
      message: 'supportedDataTypes must be an array'
    });
  } else if (subscriptions.supportedDataTypes.length === 0) {
    errors.push({
      field: 'subscriptions.supportedDataTypes',
      message: 'supportedDataTypes must not be empty'
    });
  }
  
  // 验证批量订阅配置
  const batch = subscriptions.batchSubscription;
  if (batch) {
    if (typeof batch.enabled !== 'boolean') {
      errors.push({
        field: 'subscriptions.batchSubscription.enabled',
        message: 'enabled must be a boolean'
      });
    }
    
    if (!isPositiveInteger(batch.batchSize)) {
      errors.push({
        field: 'subscriptions.batchSubscription.batchSize',
        message: 'batchSize must be a positive integer',
        value: batch.batchSize
      });
    } else if (!isInRange(batch.batchSize, 1, 1000)) {
      errors.push({
        field: 'subscriptions.batchSubscription.batchSize',
        message: 'batchSize should be between 1 and 1000',
        value: batch.batchSize
      });
    }
    
    if (!isPositiveInteger(batch.batchInterval)) {
      errors.push({
        field: 'subscriptions.batchSubscription.batchInterval',
        message: 'batchInterval must be a positive integer (milliseconds)',
        value: batch.batchInterval
      });
    } else if (!isInRange(batch.batchInterval, 100, 60000)) {
      errors.push({
        field: 'subscriptions.batchSubscription.batchInterval',
        message: 'batchInterval should be between 100ms and 60000ms',
        value: batch.batchInterval
      });
    }
  }
  
  // 验证管理配置
  const mgmt = subscriptions.management;
  if (mgmt) {
    if (typeof mgmt.autoResubscribe !== 'boolean') {
      errors.push({
        field: 'subscriptions.management.autoResubscribe',
        message: 'autoResubscribe must be a boolean'
      });
    }
    
    if (!isPositiveInteger(mgmt.subscriptionTimeout)) {
      errors.push({
        field: 'subscriptions.management.subscriptionTimeout',
        message: 'subscriptionTimeout must be a positive integer (milliseconds)',
        value: mgmt.subscriptionTimeout
      });
    } else if (!isInRange(mgmt.subscriptionTimeout, 1000, 60000)) {
      errors.push({
        field: 'subscriptions.management.subscriptionTimeout',
        message: 'subscriptionTimeout should be between 1000ms and 60000ms',
        value: mgmt.subscriptionTimeout
      });
    }
    
    if (!isPositiveInteger(mgmt.maxConcurrentSubscriptions)) {
      errors.push({
        field: 'subscriptions.management.maxConcurrentSubscriptions',
        message: 'maxConcurrentSubscriptions must be a positive integer',
        value: mgmt.maxConcurrentSubscriptions
      });
    } else if (!isInRange(mgmt.maxConcurrentSubscriptions, 1, 10000)) {
      errors.push({
        field: 'subscriptions.management.maxConcurrentSubscriptions',
        message: 'maxConcurrentSubscriptions should be between 1 and 10000',
        value: mgmt.maxConcurrentSubscriptions
      });
    }
  }
  
  return errors;
}

/**
 * 验证日志配置
 */
function validateLoggingConfig(logging: LoggingConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!logging) {
    errors.push({
      field: 'logging',
      message: 'Logging configuration is required'
    });
    return errors;
  }
  
  // 验证日志级别
  if (!['debug', 'info', 'warn', 'error'].includes(logging.level)) {
    errors.push({
      field: 'logging.level',
      message: 'level must be one of: debug, info, warn, error',
      value: logging.level
    });
  }
  
  // 验证格式
  if (!['json', 'text'].includes(logging.format)) {
    errors.push({
      field: 'logging.format',
      message: 'format must be one of: json, text',
      value: logging.format
    });
  }
  
  // 验证结构化日志标志
  if (typeof logging.structured !== 'boolean') {
    errors.push({
      field: 'logging.structured',
      message: 'structured must be a boolean'
    });
  }
  
  // 日志配置的其他验证可以在这里添加
  
  return errors;
}

/**
 * 验证 Google Cloud 配置
 */
function validateGoogleCloudConfig(config: BinanceAdapterConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const gc = config.googleCloud;
  
  if (!gc) {
    return errors; // Google Cloud 配置是可选的
  }
  
  // 验证项目 ID
  if (!gc.projectId || typeof gc.projectId !== 'string') {
    errors.push({
      field: 'googleCloud.projectId',
      message: 'projectId must be a non-empty string'
    });
  } else if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(gc.projectId)) {
    errors.push({
      field: 'googleCloud.projectId',
      message: 'projectId must be a valid Google Cloud project ID',
      value: gc.projectId
    });
  }
  
  // 验证 Pub/Sub 配置
  if (gc.pubsub) {
    const pubsub = gc.pubsub;
    
    if (typeof pubsub.enabled !== 'boolean') {
      errors.push({
        field: 'googleCloud.pubsub.enabled',
        message: 'enabled must be a boolean'
      });
    }
    
    if (pubsub.emulatorHost && !isValidUrl(`http://${pubsub.emulatorHost}`)) {
      errors.push({
        field: 'googleCloud.pubsub.emulatorHost',
        message: 'emulatorHost must be a valid host:port',
        value: pubsub.emulatorHost
      });
    }
    
    if (!pubsub.topicPrefix || typeof pubsub.topicPrefix !== 'string') {
      errors.push({
        field: 'googleCloud.pubsub.topicPrefix',
        message: 'topicPrefix must be a non-empty string'
      });
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(pubsub.topicPrefix)) {
      errors.push({
        field: 'googleCloud.pubsub.topicPrefix',
        message: 'topicPrefix must be a valid topic prefix (alphanumeric, underscore, hyphen)',
        value: pubsub.topicPrefix
      });
    }
  }
  
  return errors;
}

/**
 * 生成配置验证警告
 */
function generateWarnings(config: BinanceAdapterConfig): ValidationError[] {
  const warnings: ValidationError[] = [];
  
  // 生产环境警告
  if (config.environment === 'production') {
    if (!config.credentials?.useSecretManager) {
      warnings.push({
        field: 'credentials',
        message: 'Production environment should use Secret Manager for credentials'
      });
    }
    
    if (config.logging.level === 'debug') {
      warnings.push({
        field: 'logging.level',
        message: 'Debug logging in production may impact performance'
      });
    }
    
    if (!config.googleCloud?.monitoring?.enabled) {
      warnings.push({
        field: 'googleCloud.monitoring.enabled',
        message: 'Production environment should enable Google Cloud Monitoring'
      });
    }
  }
  
  // 性能警告
  if (config.connection.maxConnections > 10) {
    warnings.push({
      field: 'connection.maxConnections',
      message: 'High number of connections may impact performance',
      value: config.connection.maxConnections
    });
  }
  
  if (config.connection.heartbeatInterval < 5000) {
    warnings.push({
      field: 'connection.heartbeatInterval',
      message: 'Very frequent heartbeat may increase network overhead',
      value: config.connection.heartbeatInterval
    });
  }
  
  // 订阅警告
  if (config.subscriptions.defaultSymbols.length > 100) {
    warnings.push({
      field: 'subscriptions.defaultSymbols',
      message: 'Large number of default symbols may impact startup time',
      value: config.subscriptions.defaultSymbols.length
    });
  }
  
  return warnings;
}

/**
 * 验证完整配置
 */
export function validateConfig(config: BinanceAdapterConfig): ValidationResult {
  const errors: ValidationError[] = [];
  
  // 执行各个验证
  errors.push(...validateBasicConfig(config));
  errors.push(...validateConnectionConfig(config));
  errors.push(...validateRetryConfig(config));
  errors.push(...validateCredentials(config.credentials));
  errors.push(...validateSubscriptionConfig(config.subscriptions));
  errors.push(...validateLoggingConfig(config.logging));
  errors.push(...validateGoogleCloudConfig(config));
  
  // 生成警告
  const warnings = generateWarnings(config);
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 验证配置并抛出错误（如果无效）
 */
export function validateConfigOrThrow(config: BinanceAdapterConfig): void {
  const result = validateConfig(config);
  
  if (!result.valid) {
    const errorMessage = result.errors
      .map(error => `${error.field}: ${error.message}`)
      .join('; ');
    
    throw new ConfigurationError(
      `Configuration validation failed: ${errorMessage}`,
      undefined,
      { validationErrors: result.errors }
    );
  }
  
  // 输出警告到控制台
  if (result.warnings.length > 0) {
    console.warn('Configuration warnings:');
    for (const warning of result.warnings) {
      console.warn(`  - ${warning.field}: ${warning.message}`);
    }
  }
}