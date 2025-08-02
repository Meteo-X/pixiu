/**
 * 配置管理器基类
 * 提供统一的配置加载、验证、热更新等功能
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { merge, cloneDeep } from 'lodash';
import {
  BaseConfig,
  ConfigSource,
  ConfigManagerOptions,
  ConfigLoadResult,
  ConfigUpdateEvent,
  ConfigValidator,
  ConfigTransformer,
  ConfigEventHandler
} from './types';

export abstract class BaseConfigManager<T extends BaseConfig = BaseConfig> extends EventEmitter {
  protected config: T | null = null;
  protected options: ConfigManagerOptions;
  protected validators: ConfigValidator<T>[] = [];
  protected transformers: ConfigTransformer<T>[] = [];
  protected loadTimestamp = 0;

  constructor(options: ConfigManagerOptions = {}) {
    super();
    this.options = {
      enableValidation: true,
      enableHotReload: false,
      enableEnvOverride: true,
      cacheTtl: 60000, // 1分钟
      enableEncryption: false,
      ...options
    };
  }

  /**
   * 加载配置
   */
  async load(): Promise<ConfigLoadResult<T>> {
    try {
      const sources = this.options.sources || this.getDefaultSources();
      let mergedConfig: any = {};
      const usedSources: ConfigSource[] = [];

      // 按优先级排序并合并配置
      const sortedSources = sources.sort((a, b) => a.priority - b.priority);
      
      for (const source of sortedSources) {
        try {
          const sourceConfig = await this.loadFromSource(source);
          if (sourceConfig) {
            mergedConfig = merge(mergedConfig, sourceConfig);
            usedSources.push(source);
          }
        } catch (error) {
          this.emit('error', new Error(`Failed to load config from ${source.source}: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      // 环境变量覆盖
      if (this.options.enableEnvOverride) {
        mergedConfig = this.applyEnvOverrides(mergedConfig);
      }

      // 应用转换器
      for (const transformer of this.transformers) {
        mergedConfig = transformer(mergedConfig);
      }

      // 验证配置
      const validationErrors: string[] = [];
      if (this.options.enableValidation) {
        for (const validator of this.validators) {
          const result = validator(mergedConfig);
          if (result !== true) {
            if (typeof result === 'string') {
              validationErrors.push(result);
            } else if (Array.isArray(result)) {
              validationErrors.push(...result);
            }
          }
        }
      }

      this.config = mergedConfig as T;
      this.loadTimestamp = Date.now();

      const loadResult: ConfigLoadResult<T> = {
        config: this.config,
        sources: usedSources,
        timestamp: this.loadTimestamp,
        hasValidationErrors: validationErrors.length > 0,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined
      };

      // 发出事件
      const event: ConfigUpdateEvent<T> = {
        type: validationErrors.length > 0 ? 'validation_failed' : 'loaded',
        config: this.config,
        timestamp: this.loadTimestamp
      };
      this.emit('config', event);

      return loadResult;
    } catch (error) {
      const event: ConfigUpdateEvent<T> = {
        type: 'error',
        error: error as Error,
        timestamp: Date.now()
      };
      this.emit('config', event);
      throw error;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): T | null {
    return this.config ? cloneDeep(this.config) : null;
  }

  /**
   * 获取配置的某个属性
   */
  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.config?.[key];
  }

  /**
   * 检查配置是否有效
   */
  isValid(): boolean {
    return this.config !== null && this.loadTimestamp > 0;
  }

  /**
   * 添加配置验证器
   */
  addValidator(validator: ConfigValidator<T>): void {
    this.validators.push(validator);
  }

  /**
   * 添加配置转换器
   */
  addTransformer(transformer: ConfigTransformer<T>): void {
    this.transformers.push(transformer);
  }

  /**
   * 监听配置更新事件
   */
  onConfigUpdate(handler: ConfigEventHandler<T>): void {
    this.on('config', handler);
  }

  /**
   * 重新加载配置
   */
  async reload(): Promise<ConfigLoadResult<T>> {
    return this.load();
  }

  /**
   * 从配置源加载配置
   */
  protected async loadFromSource(source: ConfigSource): Promise<any> {
    switch (source.type) {
      case 'file':
        return this.loadFromFile(source.source);
      case 'env':
        return this.loadFromEnv(source.source);
      case 'default':
        return this.getDefaultConfig();
      default:
        throw new Error(`Unsupported config source type: ${source.type}`);
    }
  }

  /**
   * 从文件加载配置
   */
  protected loadFromFile(filePath: string): any {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.json':
        return JSON.parse(content);
      case '.yaml':
      case '.yml':
        return yaml.parse(content);
      default:
        throw new Error(`Unsupported config file format: ${ext}`);
    }
  }

  /**
   * 从环境变量加载配置
   */
  protected loadFromEnv(prefix: string): any {
    const config: any = {};
    const envPrefix = prefix.toUpperCase() + '_';

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(envPrefix)) {
        const configKey = key.slice(envPrefix.length).toLowerCase();
        const keyPath = configKey.split('_');
        this.setNestedValue(config, keyPath, value);
      }
    }

    return config;
  }

  /**
   * 应用环境变量覆盖
   */
  protected applyEnvOverrides(config: any): any {
    // 子类可以重写此方法来实现特定的环境变量覆盖逻辑
    return config;
  }

  /**
   * 设置嵌套对象值
   */
  private setNestedValue(obj: any, path: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    current[path[path.length - 1]] = this.parseValue(value);
  }

  /**
   * 解析环境变量值
   */
  private parseValue(value: string): any {
    // 尝试解析为数字
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    // 尝试解析为布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;
    // 尝试解析为JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        // 如果解析失败，返回原始字符串
      }
    }
    return value;
  }

  // 抽象方法，由子类实现
  protected abstract getDefaultSources(): ConfigSource[];
  protected abstract getDefaultConfig(): Partial<T>;
}