/**
 * 通用适配器配置接口
 * 定义所有交易所适配器共用的配置结构
 */

import { DataType } from '@pixiu/adapter-base';

/**
 * 基础适配器配置
 */
export interface BaseAdapterConfig {
  /** 适配器是否启用 */
  enabled: boolean;
  
  /** 通用连接配置 */
  connection: {
    /** 连接超时时间（毫秒） */
    timeout: number;
    /** 最大重试次数 */
    maxRetries: number;
    /** 重试间隔（毫秒） */
    retryInterval: number;
    /** 心跳间隔（毫秒） */
    heartbeatInterval: number;
  };

  /** 端点配置 */
  endpoints: {
    /** WebSocket端点 */
    ws: string;
    /** REST API端点 */
    rest: string;
  };

  /** 认证配置 */
  auth?: {
    /** API密钥 */
    apiKey?: string;
    /** API密钥密文 */
    apiSecret?: string;
  };
}

/**
 * 通用订阅配置
 */
export interface BaseSubscriptionConfig {
  /** 订阅的交易对列表 */
  symbols: string[];
  
  /** 订阅的数据类型 */
  dataTypes: DataType[];
  
  /** 是否启用所有交易对的ticker数据 */
  enableAllTickers?: boolean;

  /** 自定义订阅参数 */
  customParams?: Record<string, any>;
}

/**
 * 适配器完整配置
 */
export interface AdapterConfiguration {
  /** 基础配置 */
  config: BaseAdapterConfig;
  
  /** 订阅配置 */
  subscription: BaseSubscriptionConfig;
  
  /** 适配器特定配置（扩展字段） */
  extensions?: Record<string, any>;
}

/**
 * 部分适配器配置（用于更新和合并）
 */
export interface PartialAdapterConfiguration {
  /** 基础配置 */
  config?: Partial<BaseAdapterConfig>;
  
  /** 订阅配置 */
  subscription?: Partial<BaseSubscriptionConfig>;
  
  /** 适配器特定配置（扩展字段） */
  extensions?: Record<string, any>;
}

/**
 * 支持的适配器类型
 */
export enum AdapterType {
  BINANCE = 'binance',
  // 预留其他交易所
  OKEX = 'okx',
  HUOBI = 'huobi',
  COINBASE = 'coinbase'
}

/**
 * Binance特定扩展配置
 */
export interface BinanceExtensions {
  /** 是否使用测试网 */
  testnet?: boolean;
  
  /** 是否启用压缩 */
  enableCompression?: boolean;
  
  /** 是否启用组合流 */
  enableCombinedStream?: boolean;
  
  /** 流数量限制 */
  maxStreamCount?: number;
}

/**
 * OKX特定扩展配置
 */
export interface OkxExtensions {
  /** 是否使用模拟交易 */
  simulated?: boolean;
  
  /** 账户类型 */
  accountType?: 'spot' | 'margin' | 'futures' | 'swap';
}

/**
 * 适配器配置工厂
 */
export class AdapterConfigFactory {
  
  /**
   * 创建默认的基础适配器配置
   */
  static createBaseConfig(): BaseAdapterConfig {
    return {
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
    };
  }

  /**
   * 创建默认的订阅配置
   */
  static createBaseSubscription(): BaseSubscriptionConfig {
    return {
      symbols: [],
      dataTypes: [DataType.TRADE, DataType.TICKER],
      enableAllTickers: false,
      customParams: {}
    };
  }

  /**
   * 为Binance创建默认配置
   */
  static createBinanceConfig(): AdapterConfiguration {
    const config = this.createBaseConfig();
    config.endpoints = {
      ws: 'wss://stream.binance.com:9443/ws',
      rest: 'https://api.binance.com/api'
    };

    const subscription = this.createBaseSubscription();
    subscription.symbols = ['BTCUSDT'];
    subscription.dataTypes = [DataType.TRADE, DataType.TICKER, DataType.KLINE_1M];

    const extensions: BinanceExtensions = {
      testnet: false,
      enableCompression: true,
      enableCombinedStream: true,
      maxStreamCount: 1024
    };

    return {
      config,
      subscription,
      extensions
    };
  }

  /**
   * 为OKX创建默认配置
   */
  static createOkxConfig(): AdapterConfiguration {
    const config = this.createBaseConfig();
    config.endpoints = {
      ws: 'wss://ws.okx.com:8443/ws/v5/public',
      rest: 'https://www.okx.com'
    };

    const subscription = this.createBaseSubscription();
    subscription.symbols = ['BTC-USDT'];
    subscription.dataTypes = [DataType.TRADE, DataType.TICKER];

    const extensions: OkxExtensions = {
      simulated: false,
      accountType: 'spot'
    };

    return {
      config,
      subscription,
      extensions
    };
  }

  /**
   * 根据适配器类型创建默认配置
   */
  static createDefaultConfig(adapterType: AdapterType): AdapterConfiguration {
    switch (adapterType) {
      case AdapterType.BINANCE:
        return this.createBinanceConfig();
      case AdapterType.OKEX:
        return this.createOkxConfig();
      default:
        return {
          config: this.createBaseConfig(),
          subscription: this.createBaseSubscription()
        };
    }
  }
}

/**
 * 配置验证器
 */
export class AdapterConfigValidator {
  
  /**
   * 验证基础适配器配置
   */
  static validateBaseConfig(config: BaseAdapterConfig): string[] {
    const errors: string[] = [];

    if (!config.endpoints.ws) {
      errors.push('WebSocket端点不能为空');
    }

    if (!config.endpoints.rest) {
      errors.push('REST API端点不能为空');
    }

    if (config.connection.timeout < 1000) {
      errors.push('连接超时时间不能少于1000毫秒');
    }

    if (config.connection.maxRetries < 0) {
      errors.push('最大重试次数不能小于0');
    }

    if (config.connection.retryInterval < 1000) {
      errors.push('重试间隔不能少于1000毫秒');
    }

    if (config.connection.heartbeatInterval < 5000) {
      errors.push('心跳间隔不能少于5000毫秒');
    }

    return errors;
  }

  /**
   * 验证订阅配置
   */
  static validateSubscriptionConfig(subscription: BaseSubscriptionConfig): string[] {
    const errors: string[] = [];

    if (!subscription.symbols || subscription.symbols.length === 0) {
      errors.push('订阅交易对列表不能为空');
    }

    if (!subscription.dataTypes || subscription.dataTypes.length === 0) {
      errors.push('订阅数据类型列表不能为空');
    }

    // 验证数据类型是否有效
    const validDataTypes = Object.values(DataType);
    const invalidTypes = subscription.dataTypes.filter(type => !validDataTypes.includes(type));
    if (invalidTypes.length > 0) {
      errors.push(`无效的数据类型: ${invalidTypes.join(', ')}`);
    }

    return errors;
  }

  /**
   * 验证Binance特定配置
   */
  static validateBinanceExtensions(extensions?: BinanceExtensions): string[] {
    const errors: string[] = [];

    if (extensions?.maxStreamCount && extensions.maxStreamCount > 1024) {
      errors.push('Binance流数量不能超过1024');
    }

    return errors;
  }

  /**
   * 验证完整的适配器配置
   */
  static validateAdapterConfiguration(
    adapterType: AdapterType, 
    configuration: AdapterConfiguration
  ): string[] {
    const errors: string[] = [];

    // 验证基础配置
    errors.push(...this.validateBaseConfig(configuration.config));

    // 验证订阅配置
    errors.push(...this.validateSubscriptionConfig(configuration.subscription));

    // 验证特定扩展配置
    switch (adapterType) {
      case AdapterType.BINANCE:
        errors.push(...this.validateBinanceExtensions(configuration.extensions as BinanceExtensions));
        break;
    }

    return errors;
  }
}