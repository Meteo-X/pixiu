/**
 * 适配器注册中心
 * 管理所有可用的适配器集成
 */

import { EventEmitter } from 'events';
import { BaseErrorHandler, BaseMonitor, PubSubClientImpl } from '@pixiu/shared-core';
import { AdapterIntegration, IntegrationConfig } from '../base/adapter-integration';
import { createBinanceIntegration } from '../binance/integration';

export type AdapterIntegrationConstructor = () => AdapterIntegration;

export interface RegistryEntry {
  /** 构造函数 */
  constructor: AdapterIntegrationConstructor;
  /** 版本 */
  version: string;
  /** 描述 */
  description: string;
  /** 支持的功能 */
  supportedFeatures: string[];
  /** 是否启用 */
  enabled: boolean;
  /** 元数据 */
  metadata?: Record<string, any>;
}

export interface AdapterRegistryConfig {
  /** 默认适配器配置 */
  defaultConfig: Partial<IntegrationConfig>;
  /** 自动启动的适配器列表 */
  autoStart: string[];
  /** 全局监控配置 */
  monitoring: {
    enableHealthCheck: boolean;
    healthCheckInterval: number;
    enableMetrics: boolean;
    metricsInterval: number;
  };
}

/**
 * 适配器注册中心
 */
export class AdapterRegistry extends EventEmitter {
  private entries = new Map<string, RegistryEntry>();
  private instances = new Map<string, AdapterIntegration>();
  private config!: AdapterRegistryConfig;
  private pubsubClient!: PubSubClientImpl;
  private monitor!: BaseMonitor;
  private errorHandler!: BaseErrorHandler;
  
  private isInitialized = false;
  private healthCheckTimer?: NodeJS.Timeout;

  /**
   * 初始化注册中心
   */
  async initialize(
    config: AdapterRegistryConfig,
    pubsubClient: PubSubClientImpl,
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ): Promise<void> {
    this.config = config;
    this.pubsubClient = pubsubClient;
    this.monitor = monitor;
    this.errorHandler = errorHandler;

    // 注册内置适配器
    this.registerBuiltinAdapters();
    
    // 启动健康检查
    this.startHealthCheck();
    
    this.isInitialized = true;
    this.emit('initialized');
    
    this.monitor.log('info', 'Adapter registry initialized', {
      registeredAdapters: Array.from(this.entries.keys()),
      autoStartAdapters: this.config.autoStart
    });
  }

  /**
   * 注册适配器
   */
  register(
    name: string,
    constructor: AdapterIntegrationConstructor,
    metadata: Partial<Omit<RegistryEntry, 'constructor'>> = {}
  ): void {
    const entry: RegistryEntry = {
      constructor,
      version: metadata.version || '1.0.0',
      description: metadata.description || `${name} adapter integration`,
      supportedFeatures: metadata.supportedFeatures || [],
      enabled: metadata.enabled !== false,
      metadata: metadata.metadata
    };

    this.entries.set(name, entry);
    this.emit('adapterRegistered', name, entry);
    
    this.monitor.log('info', 'Adapter registered', { name, entry });
  }

  /**
   * 取消注册适配器
   */
  unregister(name: string): void {
    const entry = this.entries.get(name);
    if (entry) {
      this.entries.delete(name);
      this.emit('adapterUnregistered', name, entry);
      
      this.monitor.log('info', 'Adapter unregistered', { name });
    }
  }

  /**
   * 创建适配器实例
   */
  async createInstance(name: string, config: IntegrationConfig): Promise<AdapterIntegration> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error(`Adapter not found: ${name}`);
    }

    if (!entry.enabled) {
      throw new Error(`Adapter is disabled: ${name}`);
    }

    try {
      const instance = entry.constructor();
      
      // 合并默认配置
      const finalConfig = this.mergeConfigs(this.config.defaultConfig, config);
      
      await instance.initialize(
        finalConfig,
        this.pubsubClient,
        this.monitor,
        this.errorHandler
      );

      this.instances.set(name, instance);
      this.setupInstanceEvents(name, instance);
      
      this.emit('instanceCreated', name, instance);
      
      this.monitor.log('info', 'Adapter instance created', { name });
      
      return instance;
    } catch (error) {
      this.monitor.log('error', 'Failed to create adapter instance', { name, error });
      throw error;
    }
  }

  /**
   * 启动适配器实例
   */
  async startInstance(name: string): Promise<void> {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(`Adapter instance not found: ${name}`);
    }

    try {
      await instance.start();
      this.emit('instanceStarted', name, instance);
      
      this.monitor.log('info', 'Adapter instance started', { name });
    } catch (error) {
      this.monitor.log('error', 'Failed to start adapter instance', { name, error });
      throw error;
    }
  }

  /**
   * 停止适配器实例
   */
  async stopInstance(name: string): Promise<void> {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(`Adapter instance not found: ${name}`);
    }

    try {
      await instance.stop();
      this.emit('instanceStopped', name, instance);
      
      this.monitor.log('info', 'Adapter instance stopped', { name });
    } catch (error) {
      this.monitor.log('error', 'Failed to stop adapter instance', { name, error });
      throw error;
    }
  }

  /**
   * 销毁适配器实例
   */
  async destroyInstance(name: string): Promise<void> {
    const instance = this.instances.get(name);
    if (!instance) {
      return;
    }

    try {
      await instance.destroy();
      this.instances.delete(name);
      this.emit('instanceDestroyed', name);
      
      this.monitor.log('info', 'Adapter instance destroyed', { name });
    } catch (error) {
      this.monitor.log('error', 'Failed to destroy adapter instance', { name, error });
      throw error;
    }
  }

  /**
   * 获取适配器实例
   */
  getInstance(name: string): AdapterIntegration | undefined {
    return this.instances.get(name);
  }

  /**
   * 获取所有实例
   */
  getAllInstances(): Map<string, AdapterIntegration> {
    return new Map(this.instances);
  }

  /**
   * 获取注册信息
   */
  getRegistryEntry(name: string): RegistryEntry | undefined {
    return this.entries.get(name);
  }

  /**
   * 获取所有注册的适配器
   */
  getRegisteredAdapters(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * 获取启用的适配器
   */
  getEnabledAdapters(): string[] {
    return Array.from(this.entries.entries())
      .filter(([, entry]) => entry.enabled)
      .map(([name]) => name);
  }

  /**
   * 检查适配器是否存在
   */
  hasAdapter(name: string): boolean {
    return this.entries.has(name);
  }

  /**
   * 启用/禁用适配器
   */
  setAdapterEnabled(name: string, enabled: boolean): void {
    const entry = this.entries.get(name);
    if (entry) {
      entry.enabled = enabled;
      this.emit('adapterEnabledChanged', name, enabled);
      
      this.monitor.log('info', 'Adapter enabled status changed', { name, enabled });
    }
  }

  /**
   * 启动自动启动的适配器
   */
  async startAutoAdapters(configs: Map<string, IntegrationConfig>): Promise<void> {
    const startPromises = this.config.autoStart.map(async (name) => {
      try {
        const config = configs.get(name);
        if (!config) {
          this.monitor.log('warn', 'No config found for auto-start adapter', { name });
          return;
        }

        await this.createInstance(name, config);
        await this.startInstance(name);
      } catch (error) {
        this.monitor.log('error', 'Failed to auto-start adapter', { name, error });
      }
    });

    await Promise.allSettled(startPromises);
  }

  /**
   * 停止所有实例
   */
  async stopAllInstances(): Promise<void> {
    const stopPromises = Array.from(this.instances.keys()).map(name => 
      this.stopInstance(name).catch(error => 
        this.monitor.log('error', 'Failed to stop instance during shutdown', { name, error })
      )
    );

    await Promise.allSettled(stopPromises);
  }

  /**
   * 销毁注册中心
   */
  async destroy(): Promise<void> {
    // 停止健康检查
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // 销毁所有实例
    const destroyPromises = Array.from(this.instances.keys()).map(name => 
      this.destroyInstance(name)
    );

    await Promise.allSettled(destroyPromises);
    
    this.removeAllListeners();
  }

  /**
   * 获取注册中心状态
   */
  getStatus() {
    const instanceStatuses = Array.from(this.instances.entries()).map(([name, instance]) => ({
      name,
      status: instance.getAdapterStatus(),
      healthy: instance.isHealthy(),
      metrics: instance.getMetrics()
    }));

    return {
      initialized: this.isInitialized,
      registeredAdapters: this.getRegisteredAdapters(),
      enabledAdapters: this.getEnabledAdapters(),
      runningInstances: Array.from(this.instances.keys()),
      instanceStatuses
    };
  }

  /**
   * 注册内置适配器
   */
  private registerBuiltinAdapters(): void {
    // 注册Binance适配器
    const binanceMetadata = {
      version: '1.0.0',
      description: 'Binance exchange adapter integration',
      supportedFeatures: ['websocket', 'trades', 'tickers', 'klines', 'depth'],
      enabled: true
    };
    this.register('binance', createBinanceIntegration, binanceMetadata);

    // 这里可以注册其他内置适配器
    // this.register('okx', createOkxIntegration, { ... });
    // this.register('huobi', createHuobiIntegration, { ... });
  }

  /**
   * 设置实例事件
   */
  private setupInstanceEvents(name: string, instance: AdapterIntegration): void {
    instance.on('error', (error) => {
      this.emit('instanceError', name, error);
    });

    instance.on('adapterStatusChange', (newStatus, oldStatus) => {
      this.emit('instanceStatusChange', name, newStatus, oldStatus);
    });

    instance.on('dataProcessed', (data) => {
      this.emit('instanceDataProcessed', name, data);
    });
  }

  /**
   * 合并配置
   */
  private mergeConfigs(defaultConfig: Partial<IntegrationConfig>, userConfig: IntegrationConfig): IntegrationConfig {
    return {
      ...defaultConfig,
      ...userConfig,
      publishConfig: {
        ...defaultConfig.publishConfig,
        ...userConfig.publishConfig
      },
      monitoringConfig: {
        ...defaultConfig.monitoringConfig,
        ...userConfig.monitoringConfig
      }
    };
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    if (!this.config.monitoring.enableHealthCheck) {
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.monitoring.healthCheckInterval);
  }

  /**
   * 执行健康检查
   */
  private performHealthCheck(): void {
    for (const [name, instance] of this.instances) {
      const isHealthy = instance.isHealthy();
      if (!isHealthy) {
        this.emit('instanceUnhealthy', name, instance);
        
        this.monitor.log('warn', 'Adapter instance is unhealthy', {
          name,
          status: instance.getAdapterStatus(),
          metrics: instance.getMetrics()
        });
      }
    }
  }
}