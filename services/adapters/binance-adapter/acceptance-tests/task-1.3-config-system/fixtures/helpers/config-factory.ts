/**
 * 配置工厂 - 用于生成各种测试配置
 */

import { BinanceAdapterConfig, BinanceCredentials } from '../../../../../src/config';

/**
 * 配置生成器选项
 */
export interface ConfigFactoryOptions {
  environment?: 'development' | 'testing' | 'production';
  withCredentials?: boolean;
  withSecretManager?: boolean;
  withGoogleCloud?: boolean;
  withInvalidData?: boolean;
  customOverrides?: Partial<BinanceAdapterConfig>;
}

/**
 * 配置工厂类
 */
export class ConfigFactory {
  /**
   * 创建基础有效配置
   */
  static createValidConfig(options: ConfigFactoryOptions = {}): BinanceAdapterConfig {
    const baseConfig: BinanceAdapterConfig = {
      wsEndpoint: 'wss://stream.binance.com:9443',
      restEndpoint: 'https://api.binance.com',
      environment: options.environment || 'testing',
      
      connection: {
        maxConnections: 5,
        maxStreamsPerConnection: 100,
        heartbeatInterval: 20000,
        pingTimeout: 25000,
        connectionTimeout: 30000
      },
      
      retry: {
        maxRetries: 10,
        initialDelay: 1000,
        maxDelay: 15000,
        backoffMultiplier: 2.0,
        jitter: true
      },
      
      subscriptions: {
        defaultSymbols: ['BTCUSDT', 'ETHUSDT'],
        supportedDataTypes: ['trade', 'kline_1m', 'ticker'],
        batchSubscription: {
          enabled: true,
          batchSize: 50,
          batchInterval: 1000
        },
        management: {
          autoResubscribe: true,
          subscriptionTimeout: 10000,
          maxConcurrentSubscriptions: 200
        }
      },
      
      logging: {
        level: 'info',
        format: 'json',
        structured: true
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
      }
    };

    // 添加凭据
    if (options.withCredentials) {
      baseConfig.credentials = this.createValidCredentials({
        useSecretManager: options.withSecretManager
      });
    }

    // 添加 Google Cloud 配置
    if (options.withGoogleCloud) {
      baseConfig.googleCloud = {
        projectId: 'test-project',
        pubsub: {
          enabled: true,
          emulatorHost: 'localhost:8085',
          topicPrefix: 'test-market',
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
              maxRetryDelay: 1000
            }
          }
        },
        monitoring: {
          enabled: true,
          metricPrefix: 'test/binance/adapter'
        }
      };
    }

    // 应用自定义覆盖
    if (options.customOverrides) {
      return this.deepMerge(baseConfig, options.customOverrides);
    }

    return baseConfig;
  }

  /**
   * 创建无效配置（用于测试验证）
   */
  static createInvalidConfig(type: 'missing-required' | 'wrong-types' | 'out-of-range'): Partial<BinanceAdapterConfig> {
    switch (type) {
      case 'missing-required':
        return {
          // 缺少必需的 wsEndpoint, restEndpoint, environment
          connection: {
            maxConnections: 5,
            maxStreamsPerConnection: 100,
            heartbeatInterval: 20000,
            pingTimeout: 25000,
            connectionTimeout: 30000
          }
        };

      case 'wrong-types':
        return {
          wsEndpoint: 'invalid-url' as any,
          restEndpoint: 'not-a-url' as any,
          environment: 'invalid-env' as any,
          connection: {
            maxConnections: 'not-a-number' as any,
            maxStreamsPerConnection: -1,
            heartbeatInterval: 0,
            pingTimeout: null as any,
            connectionTimeout: 'string' as any
          },
          retry: {
            maxRetries: -5,
            initialDelay: 0,
            maxDelay: 'invalid' as any,
            backoffMultiplier: 0.5,
            jitter: 'not-boolean' as any
          }
        };

      case 'out-of-range':
        return {
          wsEndpoint: 'wss://stream.binance.com:9443',
          restEndpoint: 'https://api.binance.com',
          environment: 'testing',
          connection: {
            maxConnections: 100, // 超出合理范围
            maxStreamsPerConnection: 10000, // 超出 Binance 限制
            heartbeatInterval: 100, // 太小
            pingTimeout: 500000, // 太大
            connectionTimeout: 1000000 // 太大
          },
          retry: {
            maxRetries: 10000, // 太大
            initialDelay: 50, // 太小
            maxDelay: 10000000, // 太大
            backoffMultiplier: 20.0, // 太大
            jitter: true
          }
        };

      default:
        throw new Error(`Unknown invalid config type: ${type}`);
    }
  }

  /**
   * 创建有效凭据
   */
  static createValidCredentials(options: { useSecretManager?: boolean } = {}): BinanceCredentials {
    if (options.useSecretManager) {
      return {
        useSecretManager: true,
        secretName: 'binance-test-credentials'
      };
    }

    return {
      apiKey: 'test-api-key-1234567890abcdefghijklmnopqrstuvwxyz',
      apiSecret: 'test-api-secret-zyxwvutsrqponmlkjihgfedcba0987654321',
      useSecretManager: false
    };
  }

  /**
   * 创建无效凭据
   */
  static createInvalidCredentials(type: 'too-short' | 'missing-secret-name' | 'invalid-secret-name'): BinanceCredentials {
    switch (type) {
      case 'too-short':
        return {
          apiKey: 'short',
          apiSecret: 'short',
          useSecretManager: false
        };

      case 'missing-secret-name':
        return {
          useSecretManager: true
          // 缺少 secretName
        };

      case 'invalid-secret-name':
        return {
          useSecretManager: true,
          secretName: 'invalid@secret#name!'
        };

      default:
        throw new Error(`Unknown invalid credentials type: ${type}`);
    }
  }

  /**
   * 创建环境特定配置
   */
  static createEnvironmentConfig(environment: 'development' | 'testing' | 'production'): BinanceAdapterConfig {
    const baseConfig = this.createValidConfig({ environment });

    switch (environment) {
      case 'development':
        return {
          ...baseConfig,
          connection: {
            ...baseConfig.connection,
            maxConnections: 2,
            maxStreamsPerConnection: 50
          },
          logging: {
            level: 'debug',
            format: 'text',
            structured: false
          },
          monitoring: {
            ...baseConfig.monitoring,
            prometheus: {
              ...baseConfig.monitoring.prometheus,
              port: 9091
            }
          }
        };

      case 'testing':
        return {
          ...baseConfig,
          connection: {
            ...baseConfig.connection,
            maxConnections: 1,
            maxStreamsPerConnection: 10,
            connectionTimeout: 10000
          },
          retry: {
            ...baseConfig.retry,
            maxRetries: 3,
            maxDelay: 5000
          },
          monitoring: {
            ...baseConfig.monitoring,
            prometheus: {
              enabled: false,
              port: 0,
              path: '/metrics'
            }
          }
        };

      case 'production':
        return {
          ...baseConfig,
          connection: {
            ...baseConfig.connection,
            maxConnections: 10,
            maxStreamsPerConnection: 1000
          },
          credentials: {
            useSecretManager: true,
            secretName: 'binance-prod-credentials'
          },
          logging: {
            level: 'info',
            format: 'json',
            structured: true
          },
          monitoring: {
            ...baseConfig.monitoring,
            healthCheck: {
              interval: 60000,
              timeout: 10000
            }
          }
        };

      default:
        return baseConfig;
    }
  }

  /**
   * 创建配置覆盖测试用例
   */
  static createConfigOverrideTestCases(): Array<{
    name: string;
    base: BinanceAdapterConfig;
    override: Partial<BinanceAdapterConfig>;
    expected: Partial<BinanceAdapterConfig>;
  }> {
    const baseConfig = this.createValidConfig();

    return [
      {
        name: 'simple field override',
        base: baseConfig,
        override: { environment: 'production' },
        expected: { environment: 'production' }
      },
      {
        name: 'nested object override',
        base: baseConfig,
        override: {
          connection: {
            maxConnections: 15,
            connectionTimeout: 45000
          }
        },
        expected: {
          connection: {
            ...baseConfig.connection,
            maxConnections: 15,
            connectionTimeout: 45000
          }
        }
      },
      {
        name: 'array override',
        base: baseConfig,
        override: {
          subscriptions: {
            defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']
          }
        },
        expected: {
          subscriptions: {
            ...baseConfig.subscriptions,
            defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']
          }
        }
      },
      {
        name: 'deep nested override',
        base: baseConfig,
        override: {
          subscriptions: {
            batchSubscription: {
              batchSize: 200
            }
          }
        },
        expected: {
          subscriptions: {
            ...baseConfig.subscriptions,
            batchSubscription: {
              ...baseConfig.subscriptions.batchSubscription,
              batchSize: 200
            }
          }
        }
      }
    ];
  }

  /**
   * 深度合并对象
   */
  private static deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = result[key];
        
        if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
            targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
          result[key] = this.deepMerge(targetValue, sourceValue);
        } else {
          result[key] = sourceValue as any;
        }
      }
    }
    
    return result;
  }
}

/**
 * 配置验证测试用例生成器
 */
export class ValidationTestCaseGenerator {
  /**
   * 生成边界值测试用例
   */
  static generateBoundaryTestCases() {
    return {
      connection: {
        maxConnections: [
          { value: 0, valid: false, reason: 'below minimum' },
          { value: 1, valid: true, reason: 'minimum valid' },
          { value: 10, valid: true, reason: 'normal range' },
          { value: 20, valid: true, reason: 'maximum valid' },
          { value: 21, valid: false, reason: 'above maximum' }
        ],
        heartbeatInterval: [
          { value: 999, valid: false, reason: 'below minimum' },
          { value: 1000, valid: true, reason: 'minimum valid' },
          { value: 30000, valid: true, reason: 'normal range' },
          { value: 60000, valid: true, reason: 'maximum valid' },
          { value: 60001, valid: false, reason: 'above maximum' }
        ]
      },
      retry: {
        maxRetries: [
          { value: 0, valid: false, reason: 'below minimum' },
          { value: 1, valid: true, reason: 'minimum valid' },
          { value: 50, valid: true, reason: 'normal range' },
          { value: 1000, valid: true, reason: 'maximum valid' },
          { value: 1001, valid: false, reason: 'above maximum' }
        ],
        backoffMultiplier: [
          { value: 0.9, valid: false, reason: 'below minimum' },
          { value: 1.0, valid: true, reason: 'minimum valid' },
          { value: 2.0, valid: true, reason: 'normal range' },
          { value: 10.0, valid: true, reason: 'maximum valid' },
          { value: 10.1, valid: false, reason: 'above maximum' }
        ]
      }
    };
  }

  /**
   * 生成类型验证测试用例
   */
  static generateTypeValidationTestCases() {
    return {
      wsEndpoint: [
        { value: 'wss://stream.binance.com:9443', valid: true, reason: 'valid WebSocket URL' },
        { value: 'ws://localhost:8080', valid: true, reason: 'valid local WebSocket URL' },
        { value: 'https://api.binance.com', valid: false, reason: 'HTTP URL not allowed' },
        { value: 'invalid-url', valid: false, reason: 'not a valid URL' },
        { value: '', valid: false, reason: 'empty string' },
        { value: null, valid: false, reason: 'null value' }
      ],
      environment: [
        { value: 'development', valid: true, reason: 'valid environment' },
        { value: 'testing', valid: true, reason: 'valid environment' },
        { value: 'production', valid: true, reason: 'valid environment' },
        { value: 'staging', valid: false, reason: 'invalid environment' },
        { value: '', valid: false, reason: 'empty string' },
        { value: null, valid: false, reason: 'null value' }
      ],
      logging: {
        level: [
          { value: 'debug', valid: true, reason: 'valid log level' },
          { value: 'info', valid: true, reason: 'valid log level' },
          { value: 'warn', valid: true, reason: 'valid log level' },
          { value: 'error', valid: true, reason: 'valid log level' },
          { value: 'trace', valid: false, reason: 'invalid log level' },
          { value: '', valid: false, reason: 'empty string' }
        ],
        format: [
          { value: 'json', valid: true, reason: 'valid format' },
          { value: 'text', valid: true, reason: 'valid format' },
          { value: 'xml', valid: false, reason: 'invalid format' },
          { value: '', valid: false, reason: 'empty string' }
        ]
      }
    };
  }
}