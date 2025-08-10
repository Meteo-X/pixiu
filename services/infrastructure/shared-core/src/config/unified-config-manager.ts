import { EventEmitter } from 'eventemitter3';
import { join, resolve } from 'path';
import { readFileSync, existsSync, watchFile, unwatchFile } from 'fs';
import { parse as parseYaml } from 'yaml';
import Joi from 'joi';
import { merge } from 'lodash';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { DEFAULT_CONFIG_VALUES, CONFIG_VALIDATION_RULES } from './config-constants';

/**
 * 统一配置接口定义
 */
export interface UnifiedConfig {
  // 服务基础配置
  service: ServiceConfig;
  
  // 适配器配置（支持多个交易所）
  adapters: Record<string, AdapterConfig>;
  
  // 数据流配置
  dataflow: DataFlowConfig;
  
  // WebSocket代理配置
  websocket: WebSocketProxyConfig;
  
  // 监控配置
  monitoring: UnifiedMonitoringConfig;
  
  // Pub/Sub配置
  pubsub: UnifiedPubSubConfig;
  
  // 日志配置
  logging: LoggingConfig;
}

export interface ServiceConfig {
  name: string;
  version: string;
  environment: 'development' | 'test' | 'production';
  server: {
    port: number;
    host: string;
    enableCors: boolean;
    timeout?: number;
  };
}

export interface AdapterConfig {
  enabled: boolean;
  config: {
    endpoints: {
      ws: string;
      rest: string;
    };
    connection: {
      timeout: number;
      maxRetries: number;
      retryInterval: number;
      heartbeatInterval: number;
    };
  };
  subscription: {
    symbols: string[];
    dataTypes: string[];
    enableAllTickers: boolean;
    customParams: Record<string, any>;
  };
  extensions: Record<string, any>;
}

export interface DataFlowConfig {
  bufferSize: number;
  batchSize: number;
  flushInterval: number;
  enableCompression: boolean;
  enableMessageOrdering: boolean;
  performance: {
    maxMemoryUsage: number;
    gcThreshold: number;
    enableOptimization: boolean;
  };
}

export interface WebSocketProxyConfig {
  enabled: boolean;
  port: number;
  maxConnections: number;
  messageBuffer: number;
  enableHeartbeat: boolean;
  heartbeatInterval: number;
}

export interface UnifiedMonitoringConfig {
  enableMetrics: boolean;
  enableHealthCheck: boolean;
  metricsInterval: number;
  healthCheckInterval: number;
  statsReportInterval: number;
  verboseStats: boolean;
  showZeroValues: boolean;
  prometheus: {
    enabled: boolean;
    port: number;
    path: string;
  };
}

export interface UnifiedPubSubConfig {
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
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'silly';
  format: 'json' | 'simple' | 'combined';
  output: 'console' | 'file' | 'both';
  file?: {
    path: string;
    maxSize: string;
    maxFiles: number;
  };
}

/**
 * 配置验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 配置变更回调函数
 */
export type ConfigChangeCallback = (config: UnifiedConfig, changes: ConfigChange[]) => void;

export interface ConfigChange {
  path: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
}

/**
 * 统一配置管理器
 * 提供配置加载、合并、验证、热更新等功能
 */
export class UnifiedConfigManager extends EventEmitter {
  private currentConfig: UnifiedConfig | null = null;
  private configSources: Map<string, any> = new Map();
  private watchedFiles: Set<string> = new Set();
  private validationSchema: Joi.ObjectSchema;
  private jsonSchemaValidator: Ajv | null = null;

  constructor() {
    super();
    this.validationSchema = this.createValidationSchema();
  }

  /**
   * 加载配置
   */
  loadConfiguration(environment: string, configPaths?: string[]): UnifiedConfig {
    const defaultPaths = this.getDefaultConfigPaths(environment);
    const paths = configPaths || defaultPaths;

    // 清理之前的配置源
    this.configSources.clear();
    this.stopWatching();

    // 加载默认配置
    const defaultConfig = this.getDefaultConfiguration();
    this.configSources.set('default', defaultConfig);

    // 按优先级加载配置文件
    paths.forEach((path, index) => {
      if (existsSync(path)) {
        try {
          const config = this.loadConfigFile(path);
          this.configSources.set(`file-${index}`, config);
          
          // 监听配置文件变化
          this.watchConfigFile(path);
        } catch (error) {
          console.error(`Failed to load config from ${path}:`, error);
        }
      }
    });

    // 从环境变量加载覆盖配置
    const envConfig = this.loadEnvironmentConfig();
    if (Object.keys(envConfig).length > 0) {
      this.configSources.set('environment', envConfig);
    }

    // 合并所有配置
    const mergedConfig = this.mergeConfigurations(...Array.from(this.configSources.values()));
    
    // 验证配置
    const validation = this.validateConfiguration(mergedConfig);
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:', validation.warnings);
    }

    this.currentConfig = mergedConfig;
    this.emit('configLoaded', mergedConfig);
    
    return mergedConfig;
  }

  /**
   * 合并多个配置对象
   */
  mergeConfigurations(...configs: Partial<UnifiedConfig>[]): UnifiedConfig {
    return merge({}, ...configs) as UnifiedConfig;
  }

  /**
   * 验证配置
   */
  validateConfiguration(config: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // JSON Schema验证
    if (this.jsonSchemaValidator) {
      const valid = this.jsonSchemaValidator.validate('config', config);
      if (!valid && this.jsonSchemaValidator.errors) {
        this.jsonSchemaValidator.errors.forEach(error => {
          const path = error.instancePath ? error.instancePath.substring(1) : 'root';
          errors.push(`${path}: ${error.message}`);
        });
      }
    }

    // Joi验证作为备用
    if (errors.length === 0) {
      const { error } = this.validationSchema.validate(config, {
        allowUnknown: true,
        abortEarly: false
      });

      if (error) {
        error.details.forEach(detail => {
          errors.push(`${detail.path.join('.')}: ${detail.message}`);
        });
      }
    }

    // 业务逻辑验证
    this.performBusinessValidation(config, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 加载JSON Schema用于配置验证
   */
  loadJsonSchema(schemaPath: string): void {
    try {
      if (existsSync(schemaPath)) {
        const schemaContent = readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);
        
        this.jsonSchemaValidator = new Ajv({ allErrors: true });
        addFormats(this.jsonSchemaValidator);
        
        this.jsonSchemaValidator.addSchema(schema, 'config');
        console.log(`JSON Schema loaded from ${schemaPath}`);
      }
    } catch (error) {
      console.warn(`Failed to load JSON Schema from ${schemaPath}:`, error);
    }
  }

  /**
   * 获取默认配置
   */
  getDefaultConfiguration(): UnifiedConfig {
    return {
      ...DEFAULT_CONFIG_VALUES,
      adapters: {},
    } as UnifiedConfig;
  }

  /**
   * 动态更新配置
   */
  updateConfiguration(path: string, value: any): void {
    if (!this.currentConfig) {
      throw new Error('No configuration loaded');
    }

    const pathParts = path.split('.');
    const oldValue = this.getNestedValue(this.currentConfig, pathParts);
    
    this.setNestedValue(this.currentConfig, pathParts, value);
    
    // 重新验证配置
    const validation = this.validateConfiguration(this.currentConfig);
    if (!validation.valid) {
      // 回滚更改
      this.setNestedValue(this.currentConfig, pathParts, oldValue);
      throw new Error(`Configuration update failed validation: ${validation.errors.join(', ')}`);
    }

    const change: ConfigChange = {
      path,
      oldValue,
      newValue: value,
      timestamp: new Date()
    };

    this.emit('configChanged', this.currentConfig, [change]);
  }

  /**
   * 订阅配置变更
   */
  subscribeToChanges(callback: ConfigChangeCallback): () => void {
    this.on('configChanged', callback);
    return () => this.off('configChanged', callback);
  }

  /**
   * 获取当前配置
   */
  getCurrentConfiguration(): UnifiedConfig | null {
    return this.currentConfig;
  }

  /**
   * 销毁配置管理器
   */
  destroy(): void {
    this.stopWatching();
    this.removeAllListeners();
    this.currentConfig = null;
    this.configSources.clear();
  }

  // ====== 私有方法 ======

  private getDefaultConfigPaths(environment: string): string[] {
    const basePath = process.cwd();
    return [
      resolve(basePath, 'config', 'default.yaml'),
      resolve(basePath, 'config', `${environment}.yaml`),
      resolve(basePath, 'config', 'local.yaml')
    ];
  }

  private loadConfigFile(filePath: string): any {
    const content = readFileSync(filePath, 'utf-8');
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'yaml':
      case 'yml':
        return parseYaml(content);
      case 'json':
        return JSON.parse(content);
      default:
        throw new Error(`Unsupported config file format: ${ext}`);
    }
  }

  private loadEnvironmentConfig(): Partial<UnifiedConfig> {
    // 使用统一的环境变量处理工具
    const { EnvironmentProcessor } = require('./env-utils');
    return EnvironmentProcessor.buildConfigFromEnv();
  }

  private watchConfigFile(filePath: string): void {
    if (this.watchedFiles.has(filePath)) {
      return;
    }

    this.watchedFiles.add(filePath);
    watchFile(filePath, { interval: 1000 }, () => {
      try {
        const newConfig = this.loadConfigFile(filePath);
        const fileName = filePath.split('/').pop();
        this.configSources.set(`file-${fileName}`, newConfig);
        
        // 重新合并配置
        const mergedConfig = this.mergeConfigurations(...Array.from(this.configSources.values()));
        
        // 验证新配置
        const validation = this.validateConfiguration(mergedConfig);
        if (validation.valid) {
          const oldConfig = this.currentConfig;
          this.currentConfig = mergedConfig;
          
          // 计算变更
          const changes = this.calculateChanges(oldConfig!, mergedConfig);
          if (changes.length > 0) {
            this.emit('configChanged', mergedConfig, changes);
          }
        } else {
          console.error('Config file change validation failed:', validation.errors);
        }
      } catch (error) {
        console.error(`Error reloading config file ${filePath}:`, error);
      }
    });
  }

  private stopWatching(): void {
    this.watchedFiles.forEach(filePath => {
      unwatchFile(filePath);
    });
    this.watchedFiles.clear();
  }

  private createValidationSchema(): Joi.ObjectSchema {
    return Joi.object({
      service: Joi.object({
        name: Joi.string().required(),
        version: Joi.string().required(),
        environment: Joi.string().valid('development', 'test', 'production').required(),
        server: Joi.object({
          port: Joi.number().port().required(),
          host: Joi.string().required(),
          enableCors: Joi.boolean().required(),
          timeout: Joi.number().positive().optional()
        }).required()
      }).required(),
      
      adapters: Joi.object().pattern(
        Joi.string(),
        Joi.object({
          enabled: Joi.boolean().required(),
          config: Joi.object({
            endpoints: Joi.object({
              ws: Joi.string().uri().required(),
              rest: Joi.string().uri().required()
            }).required(),
            connection: Joi.object({
              timeout: Joi.number().positive().required(),
              maxRetries: Joi.number().min(0).required(),
              retryInterval: Joi.number().positive().required(),
              heartbeatInterval: Joi.number().positive().required()
            }).required()
          }).required(),
          subscription: Joi.object({
            symbols: Joi.array().items(Joi.string()).required(),
            dataTypes: Joi.array().items(Joi.string()).required(),
            enableAllTickers: Joi.boolean().required(),
            customParams: Joi.object().required()
          }).required(),
          extensions: Joi.object().required()
        })
      ).required(),
      
      dataflow: Joi.object({
        bufferSize: Joi.number().positive().required(),
        batchSize: Joi.number().positive().required(),
        flushInterval: Joi.number().positive().required(),
        enableCompression: Joi.boolean().required(),
        enableMessageOrdering: Joi.boolean().required(),
        performance: Joi.object({
          maxMemoryUsage: Joi.number().positive().required(),
          gcThreshold: Joi.number().min(0).max(1).required(),
          enableOptimization: Joi.boolean().required()
        }).required()
      }).required(),
      
      websocket: Joi.object({
        enabled: Joi.boolean().required(),
        port: Joi.number().port().required(),
        maxConnections: Joi.number().positive().required(),
        messageBuffer: Joi.number().positive().required(),
        enableHeartbeat: Joi.boolean().required(),
        heartbeatInterval: Joi.number().positive().required()
      }).required(),
      
      monitoring: Joi.object({
        enableMetrics: Joi.boolean().required(),
        enableHealthCheck: Joi.boolean().required(),
        metricsInterval: Joi.number().positive().required(),
        healthCheckInterval: Joi.number().positive().required(),
        statsReportInterval: Joi.number().positive().required(),
        verboseStats: Joi.boolean().required(),
        showZeroValues: Joi.boolean().required(),
        prometheus: Joi.object({
          enabled: Joi.boolean().required(),
          port: Joi.number().port().required(),
          path: Joi.string().required()
        }).required()
      }).required(),
      
      pubsub: Joi.object({
        projectId: Joi.string().required(),
        useEmulator: Joi.boolean().required(),
        emulatorHost: Joi.string().optional(),
        topicPrefix: Joi.string().required(),
        publishSettings: Joi.object({
          enableBatching: Joi.boolean().required(),
          batchSize: Joi.number().positive().required(),
          batchTimeout: Joi.number().positive().required(),
          enableMessageOrdering: Joi.boolean().required(),
          retrySettings: Joi.object({
            maxRetries: Joi.number().min(0).required(),
            initialRetryDelay: Joi.number().positive().required(),
            maxRetryDelay: Joi.number().positive().required()
          }).required()
        }).required()
      }).required(),
      
      logging: Joi.object({
        level: Joi.string().valid('error', 'warn', 'info', 'debug', 'silly').required(),
        format: Joi.string().valid('json', 'simple', 'combined').required(),
        output: Joi.string().valid('console', 'file', 'both').required(),
        file: Joi.object({
          path: Joi.string().required(),
          maxSize: Joi.string().required(),
          maxFiles: Joi.number().positive().required()
        }).optional()
      }).required()
    });
  }

  private performBusinessValidation(config: any, errors: string[], warnings: string[]): void {
    // 检查适配器配置的一致性
    Object.entries(config.adapters || {}).forEach(([name, adapterConfig]: [string, any]) => {
      if (adapterConfig.enabled && (!adapterConfig.config || !adapterConfig.config.endpoints)) {
        errors.push(`Enabled adapter ${name} must have valid endpoint configuration`);
      }
      
      if (adapterConfig.subscription?.symbols?.length === 0 && !adapterConfig.subscription?.enableAllTickers) {
        warnings.push(`Adapter ${name} has no symbols configured and all tickers are disabled`);
      }
    });

    // 检查端口冲突
    const ports = [
      config.service?.server?.port,
      config.websocket?.port,
      config.monitoring?.prometheus?.port
    ].filter(Boolean);

    if (new Set(ports).size !== ports.length) {
      errors.push('Port conflicts detected between services');
    }

    // 检查Pub/Sub配置
    if (config.pubsub?.useEmulator && !config.pubsub?.emulatorHost) {
      warnings.push('Pub/Sub emulator is enabled but no emulator host is specified');
    }

    // 检查性能配置
    if (config.dataflow?.performance?.maxMemoryUsage < 100 * 1024 * 1024) { // 100MB
      warnings.push('Data flow max memory usage is set very low, may cause frequent GC');
    }
  }

  private getNestedValue(obj: any, path: string[]): any {
    return path.reduce((current, key) => current?.[key], obj);
  }

  private setNestedValue(obj: any, path: string[], value: any): void {
    const lastKey = path.pop()!;
    const target = path.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  private calculateChanges(oldConfig: UnifiedConfig, newConfig: UnifiedConfig): ConfigChange[] {
    const changes: ConfigChange[] = [];
    const timestamp = new Date();

    // 简单的深度比较实现
    const compareObjects = (old: any, updated: any, basePath = ''): void => {
      const allKeys = new Set([...Object.keys(old || {}), ...Object.keys(updated || {})]);
      
      allKeys.forEach(key => {
        const currentPath = basePath ? `${basePath}.${key}` : key;
        const oldValue = old?.[key];
        const newValue = updated?.[key];
        
        if (typeof oldValue !== typeof newValue || 
            (typeof oldValue !== 'object' && oldValue !== newValue)) {
          changes.push({
            path: currentPath,
            oldValue,
            newValue,
            timestamp
          });
        } else if (typeof oldValue === 'object' && oldValue !== null && newValue !== null) {
          compareObjects(oldValue, newValue, currentPath);
        }
      });
    };

    compareObjects(oldConfig, newConfig);
    return changes;
  }
}

// 全局单例实例
let globalConfigManager: UnifiedConfigManager | null = null;

/**
 * 获取全局配置管理器实例
 */
export function getGlobalConfigManager(): UnifiedConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new UnifiedConfigManager();
  }
  return globalConfigManager;
}

/**
 * 重置全局配置管理器（主要用于测试）
 */
export function resetGlobalConfigManager(): void {
  if (globalConfigManager) {
    globalConfigManager.destroy();
    globalConfigManager = null;
  }
}