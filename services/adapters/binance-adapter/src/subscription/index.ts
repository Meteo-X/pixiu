/**
 * Binance 订阅管理器模块导出
 * 
 * 提供完整的订阅管理功能:
 * - 流名称构建和验证
 * - 多流组合订阅
 * - 动态订阅管理
 * - 订阅统计和监控
 */

// 导出主要类
export { SubscriptionManager } from './SubscriptionManager';
export { StreamNameBuilder } from './StreamNameBuilder';

// 导出接口和类型
export * from './interfaces';

// 导出默认配置
export const DEFAULT_SUBSCRIPTION_CONFIG = {
  baseWsUrl: 'wss://stream.binance.com:9443',
  maxStreamsPerConnection: 1024,
  subscriptionTimeout: 10000,
  autoResubscribe: true,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2.0,
    jitter: true
  },
  validation: {
    strictValidation: true,
    symbolPattern: /^[A-Z0-9]+$/,
    maxSubscriptions: 5000,
    disabledDataTypes: []
  }
};

// 工厂函数
export function createSubscriptionManager(
  config?: Partial<import('./interfaces').SubscriptionManagerConfig>
): SubscriptionManager {
  const manager = new SubscriptionManager();
  
  if (config) {
    // 合并配置
    const finalConfig = {
      ...DEFAULT_SUBSCRIPTION_CONFIG,
      ...config,
      retryConfig: {
        ...DEFAULT_SUBSCRIPTION_CONFIG.retryConfig,
        ...config.retryConfig
      },
      validation: {
        ...DEFAULT_SUBSCRIPTION_CONFIG.validation,
        ...config.validation
      }
    };
    
    manager.initialize(finalConfig);
  }
  
  return manager;
}

// 工厂函数：创建流名称构建器
export function createStreamNameBuilder(): StreamNameBuilder {
  return new StreamNameBuilder();
}