/**
 * Binance 适配器配置管理器
 * 
 * 提供统一的配置管理接口，整合：
 * - 配置加载和验证
 * - Secret Manager 集成
 * - 配置热更新
 * - 配置监控
 */

import { EventEmitter } from 'events';
import { 
  BinanceAdapterConfig, 
  BinanceCredentials,
  loadConfig, 
  mergeConfigs
} from './index';
import { validateConfig, validateConfigOrThrow } from './validator';
import { 
  loadCredentialsFromSecretManager,
  checkSecretManagerAvailable,
  clearCredentialsCache 
} from './secret-manager';

/**
 * 配置管理器事件
 */
export enum ConfigManagerEvent {
  CONFIG_LOADED = 'config_loaded',
  CONFIG_UPDATED = 'config_updated',
  CONFIG_ERROR = 'config_error',
  CREDENTIALS_LOADED = 'credentials_loaded',
  CREDENTIALS_ERROR = 'credentials_error'
}

/**
 * 配置管理器选项
 */
export interface ConfigManagerOptions {
  /** 配置文件路径 */
  configPath?: string | undefined;
  
  /** 是否启用配置验证 */
  enableValidation?: boolean;
  
  /** 是否启用 Secret Manager */
  enableSecretManager?: boolean;
  
  /** 凭据缓存 TTL (毫秒) */
  credentialsCacheTtl?: number;
  
  /** 是否在启动时预加载凭据 */
  preloadCredentials?: boolean;
}

/**
 * 配置管理器
 */
export class ConfigManager extends EventEmitter {
  private config: BinanceAdapterConfig | null = null;
  private credentials: BinanceCredentials | null = null;
  private options: {
    configPath: string | undefined;
    enableValidation: boolean;
    enableSecretManager: boolean;
    credentialsCacheTtl: number;
    preloadCredentials: boolean;
  };
  private isInitialized = false;

  constructor(options: ConfigManagerOptions = {}) {
    super();
    
    this.options = {
      configPath: options.configPath,
      enableValidation: options.enableValidation ?? true,
      enableSecretManager: options.enableSecretManager ?? true,
      credentialsCacheTtl: options.credentialsCacheTtl ?? 3600000, // 1 hour
      preloadCredentials: options.preloadCredentials ?? false
    };
  }

  /**
   * 初始化配置管理器
   */
  async initialize(): Promise<void> {
    try {
      // 加载配置
      await this.loadConfiguration();
      
      // 预加载凭据（如果启用）
      if (this.options.preloadCredentials) {
        await this.loadCredentials();
      }
      
      this.isInitialized = true;
      this.emit(ConfigManagerEvent.CONFIG_LOADED, this.config);
      
    } catch (error) {
      this.emit(ConfigManagerEvent.CONFIG_ERROR, error);
      throw error;
    }
  }

  /**
   * 加载配置
   */
  private async loadConfiguration(): Promise<void> {
    // 加载基础配置
    this.config = await loadConfig(this.options.configPath);
    
    // 验证配置
    if (this.options.enableValidation) {
      validateConfigOrThrow(this.config);
    }
  }

  /**
   * 加载凭据
   */
  private async loadCredentials(): Promise<BinanceCredentials | null> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    // 如果配置中没有凭据或不使用 Secret Manager
    if (!this.config.credentials?.useSecretManager || !this.options.enableSecretManager) {
      this.credentials = this.config.credentials || null;
      return this.credentials;
    }

    try {
      const { secretName } = this.config.credentials;
      if (!secretName) {
        throw new Error('Secret name not specified in credentials configuration');
      }

      // 获取项目 ID
      const projectId = this.getGoogleCloudProjectId();
      if (!projectId) {
        throw new Error('Google Cloud project ID not configured');
      }

      // 检查 Secret Manager 是否可用
      const available = await checkSecretManagerAvailable(projectId);
      if (!available) {
        console.warn('Secret Manager not available, using configuration credentials');
        this.credentials = this.config.credentials;
        return this.credentials;
      }

      // 从 Secret Manager 加载凭据
      this.credentials = await loadCredentialsFromSecretManager(
        projectId,
        secretName,
        true, // 启用缓存
        this.options.credentialsCacheTtl
      );

      this.emit(ConfigManagerEvent.CREDENTIALS_LOADED, this.credentials);
      return this.credentials;

    } catch (error) {
      this.emit(ConfigManagerEvent.CREDENTIALS_ERROR, error);
      
      // 降级到配置文件中的凭据
      console.warn('Failed to load credentials from Secret Manager, using configuration credentials:', error);
      this.credentials = this.config.credentials;
      return this.credentials;
    }
  }

  /**
   * 获取 Google Cloud 项目 ID
   */
  private getGoogleCloudProjectId(): string | undefined {
    // 优先级：环境变量 > Google Cloud 配置 > 默认值
    return process.env['GOOGLE_CLOUD_PROJECT'] ||
           process.env['GCLOUD_PROJECT'] ||
           this.config?.googleCloud?.projectId;
  }

  /**
   * 获取当前配置
   */
  getConfig(): BinanceAdapterConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * 获取凭据
   */
  async getCredentials(): Promise<BinanceCredentials | null> {
    if (!this.isInitialized) {
      throw new Error('Config manager not initialized. Call initialize() first.');
    }

    // 如果凭据已加载，直接返回
    if (this.credentials) {
      return this.credentials;
    }

    // 懒加载凭据
    return await this.loadCredentials();
  }

  /**
   * 重新加载配置
   */
  async reloadConfig(): Promise<void> {
    try {
      const oldConfig = this.config;
      await this.loadConfiguration();
      
      // 如果配置有变化，清除凭据缓存
      if (JSON.stringify(oldConfig?.credentials) !== JSON.stringify(this.config?.credentials)) {
        clearCredentialsCache();
        this.credentials = null;
        
        // 重新加载凭据（如果之前已经加载过）
        if (this.options.preloadCredentials || this.credentials !== null) {
          await this.loadCredentials();
        }
      }
      
      this.emit(ConfigManagerEvent.CONFIG_UPDATED, this.config);
      
    } catch (error) {
      this.emit(ConfigManagerEvent.CONFIG_ERROR, error);
      throw error;
    }
  }

  /**
   * 重新加载凭据
   */
  async reloadCredentials(): Promise<void> {
    try {
      // 清除缓存
      if (this.config?.credentials?.secretName) {
        clearCredentialsCache(this.config.credentials.secretName);
      }
      
      this.credentials = null;
      await this.loadCredentials();
      
    } catch (error) {
      this.emit(ConfigManagerEvent.CREDENTIALS_ERROR, error);
      throw error;
    }
  }

  /**
   * 更新配置
   */
  async updateConfig(configOverrides: Partial<BinanceAdapterConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    try {
      // 合并配置
      const newConfig = mergeConfigs(this.config, configOverrides);
      
      // 验证新配置
      if (this.options.enableValidation) {
        validateConfigOrThrow(newConfig);
      }
      
      this.config = newConfig;
      this.emit(ConfigManagerEvent.CONFIG_UPDATED, this.config);
      
    } catch (error) {
      this.emit(ConfigManagerEvent.CONFIG_ERROR, error);
      throw error;
    }
  }

  /**
   * 获取配置摘要（隐藏敏感信息）
   */
  getConfigSummary(): any {
    if (!this.config) {
      return null;
    }

    return {
      environment: this.config.environment,
      wsEndpoint: this.config.wsEndpoint,
      restEndpoint: this.config.restEndpoint,
      connection: this.config.connection,
      retry: this.config.retry,
      subscriptions: {
        defaultSymbols: this.config.subscriptions.defaultSymbols,
        supportedDataTypes: this.config.subscriptions.supportedDataTypes,
        batchSubscription: this.config.subscriptions.batchSubscription,
        management: this.config.subscriptions.management
      },
      logging: this.config.logging,
      monitoring: this.config.monitoring,
      credentials: this.config.credentials ? {
        useSecretManager: this.config.credentials.useSecretManager,
        secretName: this.config.credentials.secretName,
        hasApiKey: !!this.config.credentials.apiKey,
        hasApiSecret: !!this.config.credentials.apiSecret
      } : null,
      googleCloud: this.config.googleCloud ? {
        projectId: this.config.googleCloud.projectId,
        pubsub: {
          enabled: this.config.googleCloud.pubsub.enabled,
          topicPrefix: this.config.googleCloud.pubsub.topicPrefix,
          emulatorHost: this.config.googleCloud.pubsub.emulatorHost
        },
        monitoring: {
          enabled: this.config.googleCloud.monitoring.enabled,
          metricPrefix: this.config.googleCloud.monitoring.metricPrefix
        }
      } : null
    };
  }

  /**
   * 验证当前配置
   */
  validateCurrentConfig(): { valid: boolean; errors: any[]; warnings: any[] } {
    if (!this.config) {
      return {
        valid: false,
        errors: [{ field: 'config', message: 'Configuration not loaded' }],
        warnings: []
      };
    }

    return validateConfig(this.config);
  }

  /**
   * 检查是否已初始化
   */
  isConfigLoaded(): boolean {
    return this.isInitialized && this.config !== null;
  }

  /**
   * 销毁配置管理器
   */
  destroy(): void {
    this.removeAllListeners();
    this.config = null;
    this.credentials = null;
    this.isInitialized = false;
  }
}

/**
 * 创建配置管理器实例（单例模式）
 */
let globalConfigManager: ConfigManager | null = null;

/**
 * 获取全局配置管理器实例
 */
export function getConfigManager(options?: ConfigManagerOptions): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(options);
  }
  return globalConfigManager;
}

/**
 * 销毁全局配置管理器实例
 */
export function destroyConfigManager(): void {
  if (globalConfigManager) {
    globalConfigManager.destroy();
    globalConfigManager = null;
  }
}

/**
 * 创建配置管理器实例（工厂函数）
 */
export function createConfigManager(options?: ConfigManagerOptions): ConfigManager {
  return new ConfigManager(options);
}