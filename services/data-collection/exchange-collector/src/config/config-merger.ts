/**
 * 配置合并和管理逻辑
 * 处理多适配器配置的合并、验证和管理
 */

import { 
  AdapterConfiguration, 
  PartialAdapterConfiguration,
  AdapterType, 
  AdapterConfigFactory, 
  AdapterConfigValidator
} from './adapter-config';

/**
 * 配置合并选项
 */
export interface ConfigMergeOptions {
  /** 是否覆盖现有配置 */
  override: boolean;
  
  /** 是否递归合并 */
  deep: boolean;
  
  /** 是否验证合并后的配置 */
  validate: boolean;
  
  /** 是否保留扩展字段 */
  preserveExtensions: boolean;
}

/**
 * 配置合并结果
 */
export interface ConfigMergeResult {
  /** 合并后的配置 */
  config: AdapterConfiguration;
  
  /** 验证错误列表 */
  errors: string[];
  
  /** 是否合并成功 */
  success: boolean;
  
  /** 合并信息 */
  info: string[];
}

/**
 * 多适配器配置管理器
 */
export class MultiAdapterConfigManager {
  
  private adapterConfigs: Map<string, AdapterConfiguration> = new Map();
  private defaultOptions: ConfigMergeOptions = {
    override: true,
    deep: true,
    validate: true,
    preserveExtensions: true
  };

  /**
   * 添加适配器配置
   */
  addAdapterConfig(
    adapterName: string, 
    adapterType: AdapterType, 
    configuration: PartialAdapterConfiguration,
    options: Partial<ConfigMergeOptions> = {}
  ): ConfigMergeResult {
    const mergeOptions = { ...this.defaultOptions, ...options };
    
    // 获取默认配置
    const defaultConfig = AdapterConfigFactory.createDefaultConfig(adapterType);
    
    // 合并配置
    const mergeResult = this.mergeConfigurations(defaultConfig, configuration, mergeOptions);
    
    if (mergeResult.success) {
      this.adapterConfigs.set(adapterName, mergeResult.config);
    }
    
    return mergeResult;
  }

  /**
   * 更新适配器配置
   */
  updateAdapterConfig(
    adapterName: string,
    adapterType: AdapterType,
    updates: PartialAdapterConfiguration,
    options: Partial<ConfigMergeOptions> = {}
  ): ConfigMergeResult {
    const existingConfig = this.adapterConfigs.get(adapterName);
    if (!existingConfig) {
      return {
        config: {} as AdapterConfiguration,
        errors: [`适配器 ${adapterName} 不存在`],
        success: false,
        info: []
      };
    }

    const mergeOptions = { ...this.defaultOptions, ...options };
    const mergeResult = this.mergeConfigurations(existingConfig, updates, mergeOptions);
    
    if (mergeResult.success) {
      // 验证合并后的配置是否符合适配器类型要求
      const typeValidationErrors = AdapterConfigValidator.validateAdapterConfiguration(
        adapterType, 
        mergeResult.config
      );
      if (typeValidationErrors.length > 0) {
        mergeResult.errors.push(...typeValidationErrors);
        mergeResult.success = false;
      } else {
        this.adapterConfigs.set(adapterName, mergeResult.config);
      }
    }
    
    return mergeResult;
  }

  /**
   * 获取适配器配置
   */
  getAdapterConfig(adapterName: string): AdapterConfiguration | undefined {
    return this.adapterConfigs.get(adapterName);
  }

  /**
   * 获取所有适配器配置
   */
  getAllAdapterConfigs(): Map<string, AdapterConfiguration> {
    return new Map(this.adapterConfigs);
  }

  /**
   * 移除适配器配置
   */
  removeAdapterConfig(adapterName: string): boolean {
    return this.adapterConfigs.delete(adapterName);
  }

  /**
   * 验证所有适配器配置
   */
  validateAllConfigs(): { [adapterName: string]: string[] } {
    const validationResults: { [adapterName: string]: string[] } = {};

    for (const [adapterName, config] of this.adapterConfigs) {
      // 尝试推断适配器类型
      const adapterType = this.inferAdapterType(adapterName, config);
      validationResults[adapterName] = AdapterConfigValidator.validateAdapterConfiguration(
        adapterType, 
        config
      );
    }

    return validationResults;
  }

  /**
   * 合并两个配置对象
   */
  private mergeConfigurations(
    baseConfig: AdapterConfiguration,
    overrideConfig: PartialAdapterConfiguration,
    options: ConfigMergeOptions
  ): ConfigMergeResult {
    const result: ConfigMergeResult = {
      config: {} as AdapterConfiguration,
      errors: [],
      success: false,
      info: []
    };

    try {
      // 深度合并配置
      const mergedConfig = options.deep 
        ? this.deepMerge(baseConfig, overrideConfig, options)
        : { ...baseConfig, ...overrideConfig };

      result.config = mergedConfig as AdapterConfiguration;
      result.info.push('配置合并完成');

      // 验证合并后的配置
      if (options.validate) {
        // 基础验证
        if (result.config.config) {
          result.errors.push(...AdapterConfigValidator.validateBaseConfig(result.config.config));
        }
        
        if (result.config.subscription) {
          result.errors.push(...AdapterConfigValidator.validateSubscriptionConfig(result.config.subscription));
        }
      }

      result.success = result.errors.length === 0;
      
      if (result.success) {
        result.info.push('配置验证通过');
      }

    } catch (error) {
      result.errors.push(`配置合并失败: ${error instanceof Error ? error.message : String(error)}`);
      result.success = false;
    }

    return result;
  }

  /**
   * 深度合并对象
   */
  private deepMerge(
    target: any, 
    source: any, 
    options: ConfigMergeOptions
  ): any {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (this.isObject(sourceValue) && this.isObject(targetValue)) {
          // 递归合并对象
          result[key] = this.deepMerge(targetValue, sourceValue, options);
        } else if (options.override || targetValue === undefined) {
          // 覆盖或设置新值
          result[key] = sourceValue;
        }
        // 如果不覆盖且目标值存在，保持原值
      }
    }

    return result;
  }

  /**
   * 检查是否为对象
   */
  private isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * 推断适配器类型
   */
  private inferAdapterType(adapterName: string, config: AdapterConfiguration): AdapterType {
    const name = adapterName.toLowerCase();
    
    if (name.includes('binance')) {
      return AdapterType.BINANCE;
    } else if (name.includes('okx') || name.includes('okex')) {
      return AdapterType.OKEX;
    }
    
    // 根据WebSocket端点推断
    const wsEndpoint = config.config?.endpoints?.ws?.toLowerCase() || '';
    if (wsEndpoint.includes('binance')) {
      return AdapterType.BINANCE;
    } else if (wsEndpoint.includes('okx')) {
      return AdapterType.OKEX;
    }

    // 默认返回Binance类型
    return AdapterType.BINANCE;
  }

  /**
   * 批量导入配置
   */
  batchImportConfigs(
    configs: { [adapterName: string]: { type: AdapterType; config: PartialAdapterConfiguration } },
    options: Partial<ConfigMergeOptions> = {}
  ): { [adapterName: string]: ConfigMergeResult } {
    const results: { [adapterName: string]: ConfigMergeResult } = {};

    for (const [adapterName, { type, config }] of Object.entries(configs)) {
      results[adapterName] = this.addAdapterConfig(adapterName, type, config, options);
    }

    return results;
  }

  /**
   * 导出所有配置为JSON
   */
  exportConfigs(): { [adapterName: string]: AdapterConfiguration } {
    const exported: { [adapterName: string]: AdapterConfiguration } = {};
    
    for (const [adapterName, config] of this.adapterConfigs) {
      exported[adapterName] = JSON.parse(JSON.stringify(config));
    }

    return exported;
  }

  /**
   * 清空所有配置
   */
  clear(): void {
    this.adapterConfigs.clear();
  }

  /**
   * 获取配置统计信息
   */
  getStats(): {
    totalAdapters: number;
    enabledAdapters: number;
    disabledAdapters: number;
    byType: { [type: string]: number };
  } {
    const stats = {
      totalAdapters: this.adapterConfigs.size,
      enabledAdapters: 0,
      disabledAdapters: 0,
      byType: {} as { [type: string]: number }
    };

    for (const [adapterName, config] of this.adapterConfigs) {
      if (config.config.enabled) {
        stats.enabledAdapters++;
      } else {
        stats.disabledAdapters++;
      }

      const type = this.inferAdapterType(adapterName, config);
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    }

    return stats;
  }
}