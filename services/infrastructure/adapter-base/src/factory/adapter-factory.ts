/**
 * 适配器工厂实现
 */

import { ExchangeAdapter, AdapterConfig } from '../interfaces/adapter';

export interface AdapterConstructor {
  new (): ExchangeAdapter;
}

export interface AdapterRegistryEntry {
  constructor: AdapterConstructor;
  version: string;
  description: string;
  supportedFeatures: string[];
  metadata?: Record<string, any>;
}

/**
 * 适配器注册中心
 */
export class AdapterRegistry {
  private adapters = new Map<string, AdapterRegistryEntry>();
  private aliases = new Map<string, string>();

  /**
   * 注册适配器
   */
  register(
    exchange: string, 
    constructor: AdapterConstructor, 
    metadata: Partial<AdapterRegistryEntry> = {}
  ): void {
    const entry: AdapterRegistryEntry = {
      constructor,
      version: metadata.version || '1.0.0',
      description: metadata.description || `${exchange} exchange adapter`,
      supportedFeatures: metadata.supportedFeatures || [],
      metadata: metadata.metadata
    };

    this.adapters.set(exchange.toLowerCase(), entry);
  }

  /**
   * 添加别名
   */
  addAlias(alias: string, exchange: string): void {
    this.aliases.set(alias.toLowerCase(), exchange.toLowerCase());
  }

  /**
   * 获取适配器注册信息
   */
  getEntry(exchange: string): AdapterRegistryEntry | undefined {
    const normalizedExchange = this.resolveExchange(exchange);
    return this.adapters.get(normalizedExchange);
  }

  /**
   * 检查是否支持某个交易所
   */
  supports(exchange: string): boolean {
    const normalizedExchange = this.resolveExchange(exchange);
    return this.adapters.has(normalizedExchange);
  }

  /**
   * 获取所有支持的交易所
   */
  getSupportedExchanges(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 获取所有别名
   */
  getAliases(): Map<string, string> {
    return new Map(this.aliases);
  }

  /**
   * 清除注册信息
   */
  clear(): void {
    this.adapters.clear();
    this.aliases.clear();
  }

  /**
   * 解析交易所名称（处理别名）
   */
  private resolveExchange(exchange: string): string {
    const normalized = exchange.toLowerCase();
    return this.aliases.get(normalized) || normalized;
  }
}

/**
 * 适配器工厂
 */
export class AdapterFactory {
  private registry: AdapterRegistry;

  constructor(registry?: AdapterRegistry) {
    this.registry = registry || new AdapterRegistry();
  }

  /**
   * 创建适配器实例
   */
  async create(exchange: string, config?: AdapterConfig): Promise<ExchangeAdapter> {
    const entry = this.registry.getEntry(exchange);
    if (!entry) {
      throw new Error(`Unsupported exchange: ${exchange}`);
    }

    try {
      const adapter = new entry.constructor();
      
      if (config) {
        await adapter.initialize(config);
      }
      
      return adapter;
    } catch (error) {
      throw new Error(`Failed to create adapter for ${exchange}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 批量创建适配器
   */
  async createBatch(configs: Array<{ exchange: string; config: AdapterConfig }>): Promise<ExchangeAdapter[]> {
    const adapters: ExchangeAdapter[] = [];
    
    for (const { exchange, config } of configs) {
      try {
        const adapter = await this.create(exchange, config);
        adapters.push(adapter);
      } catch (error) {
        // 记录错误但继续创建其他适配器
        console.error(`Failed to create adapter for ${exchange}:`, error);
      }
    }
    
    return adapters;
  }

  /**
   * 注册适配器
   */
  register(
    exchange: string, 
    constructor: AdapterConstructor, 
    metadata?: Partial<AdapterRegistryEntry>
  ): void {
    this.registry.register(exchange, constructor, metadata);
  }

  /**
   * 添加别名
   */
  addAlias(alias: string, exchange: string): void {
    this.registry.addAlias(alias, exchange);
  }

  /**
   * 检查是否支持某个交易所
   */
  supports(exchange: string): boolean {
    return this.registry.supports(exchange);
  }

  /**
   * 获取支持的交易所列表
   */
  getSupportedExchanges(): string[] {
    return this.registry.getSupportedExchanges();
  }

  /**
   * 获取适配器信息
   */
  getAdapterInfo(exchange: string): AdapterRegistryEntry | undefined {
    return this.registry.getEntry(exchange);
  }

  /**
   * 获取所有适配器信息
   */
  getAllAdapterInfo(): Map<string, AdapterRegistryEntry> {
    const result = new Map<string, AdapterRegistryEntry>();
    
    for (const exchange of this.registry.getSupportedExchanges()) {
      const entry = this.registry.getEntry(exchange);
      if (entry) {
        result.set(exchange, entry);
      }
    }
    
    return result;
  }

  /**
   * 验证适配器配置
   */
  validateConfig(exchange: string, config: AdapterConfig): string[] {
    const errors: string[] = [];
    
    if (!this.supports(exchange)) {
      errors.push(`Unsupported exchange: ${exchange}`);
      return errors;
    }

    // 基础配置验证
    if (!config.exchange) {
      errors.push('Exchange name is required');
    }
    
    if (!config.endpoints?.ws) {
      errors.push('WebSocket endpoint is required');
    }
    
    if (!config.connection?.timeout || config.connection.timeout <= 0) {
      errors.push('Valid connection timeout is required');
    }
    
    if (!config.connection?.maxRetries || config.connection.maxRetries < 0) {
      errors.push('Valid max retries count is required');
    }
    
    if (!config.connection?.retryInterval || config.connection.retryInterval <= 0) {
      errors.push('Valid retry interval is required');
    }

    return errors;
  }

  /**
   * 获取注册中心
   */
  getRegistry(): AdapterRegistry {
    return this.registry;
  }
}

/**
 * 全局适配器工厂实例
 */
export const globalAdapterFactory = new AdapterFactory();