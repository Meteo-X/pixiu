/**
 * Binance 适配器配置系统使用示例
 * 
 * 演示如何使用配置管理系统的各种功能
 */

import path from 'path';
import { 
  BinanceAdapterConfig,
  loadConfig,
  createDevelopmentConfig,
  createTestingConfig,
  createProductionConfig,
  getEnvironmentConfig,
  mergeConfigs
} from './index';
import { validateConfig, validateConfigOrThrow } from './validator';
import { ConfigManager, ConfigManagerEvent, getConfigManager } from './manager';
import { 
  loadCredentialsFromSecretManager,
  checkSecretManagerAvailable,
  getCacheStats,
  cleanupExpiredCache 
} from './secret-manager';

/**
 * 示例1：基本配置加载
 */
async function example1_BasicConfigLoading(): Promise<void> {
  console.log('\n=== 示例1：基本配置加载 ===');
  
  try {
    // 方法1：使用环境预设
    const devConfig = createDevelopmentConfig();
    console.log('开发环境配置:', {
      environment: devConfig.environment,
      wsEndpoint: devConfig.wsEndpoint,
      maxConnections: devConfig.connection.maxConnections
    });
    
    // 方法2：自动检测环境
    process.env['NODE_ENV'] = 'development';
    const autoConfig = getEnvironmentConfig();
    console.log('自动检测环境配置:', autoConfig.environment);
    
    // 方法3：从文件加载
    const configPath = path.join(__dirname, '../../config/development.yaml');
    const fileConfig = await loadConfig(configPath);
    console.log('从文件加载配置:', {
      environment: fileConfig.environment,
      subscriptions: fileConfig.subscriptions.defaultSymbols
    });
    
  } catch (error) {
    console.error('配置加载失败:', error);
  }
}

/**
 * 示例2：配置验证
 */
async function example2_ConfigValidation(): Promise<void> {
  console.log('\n=== 示例2：配置验证 ===');
  
  try {
    // 创建一个有效配置
    const validConfig = createDevelopmentConfig();
    const validationResult = validateConfig(validConfig);
    console.log('有效配置验证结果:', {
      valid: validationResult.valid,
      errorsCount: validationResult.errors.length,
      warningsCount: validationResult.warnings.length
    });
    
    // 创建一个无效配置
    const invalidConfig = {
      ...validConfig,
      wsEndpoint: 'invalid-url',
      connection: {
        ...validConfig.connection,
        maxConnections: -1 // 无效值
      }
    };
    
    const invalidResult = validateConfig(invalidConfig);
    console.log('无效配置验证结果:', {
      valid: invalidResult.valid,
      errors: invalidResult.errors.map(e => `${e.field}: ${e.message}`)
    });
    
  } catch (error) {
    console.error('配置验证失败:', error);
  }
}

/**
 * 示例3：配置合并
 */
async function example3_ConfigMerging(): Promise<void> {
  console.log('\n=== 示例3：配置合并 ===');
  
  try {
    // 基础配置
    const baseConfig = createDevelopmentConfig();
    
    // 环境变量覆盖
    process.env['BINANCE_MAX_CONNECTIONS'] = '3';
    process.env['LOG_LEVEL'] = 'warn';
    
    // 配置覆盖
    const overrides: Partial<BinanceAdapterConfig> = {
      subscriptions: {
        ...baseConfig.subscriptions,
        defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']
      }
    };
    
    // 合并配置
    const mergedConfig = mergeConfigs(baseConfig, overrides);
    
    console.log('合并后的配置:', {
      maxConnections: mergedConfig.connection.maxConnections,
      logLevel: mergedConfig.logging.level,
      symbols: mergedConfig.subscriptions.defaultSymbols
    });
    
  } catch (error) {
    console.error('配置合并失败:', error);
  }
}

/**
 * 示例4：配置管理器使用
 */
async function example4_ConfigManagerUsage(): Promise<void> {
  console.log('\n=== 示例4：配置管理器使用 ===');
  
  try {
    // 创建配置管理器
    const configManager = new ConfigManager({
      enableValidation: true,
      enableSecretManager: false, // 示例中禁用 Secret Manager
      preloadCredentials: false
    });
    
    // 监听事件
    configManager.on(ConfigManagerEvent.CONFIG_LOADED, (config) => {
      console.log('配置已加载:', config.environment);
    });
    
    configManager.on(ConfigManagerEvent.CONFIG_ERROR, (error) => {
      console.error('配置错误:', error.message);
    });
    
    // 初始化
    await configManager.initialize();
    
    // 获取配置
    const config = configManager.getConfig();
    console.log('当前配置环境:', config.environment);
    
    // 获取配置摘要
    const summary = configManager.getConfigSummary();
    console.log('配置摘要:', {
      environment: summary.environment,
      defaultSymbols: summary.subscriptions.defaultSymbols,
      hasCredentials: !!summary.credentials
    });
    
    // 验证配置
    const validation = configManager.validateCurrentConfig();
    console.log('配置验证:', {
      valid: validation.valid,
      warningsCount: validation.warnings.length
    });
    
    // 更新配置
    await configManager.updateConfig({
      logging: {
        ...config.logging,
        level: 'error'
      }
    });
    
    console.log('更新后的日志级别:', configManager.getConfig().logging.level);
    
    // 销毁
    configManager.destroy();
    
  } catch (error) {
    console.error('配置管理器示例失败:', error);
  }
}

/**
 * 示例5：Secret Manager 集成
 */
async function example5_SecretManagerIntegration(): Promise<void> {
  console.log('\n=== 示例5：Secret Manager 集成 ===');
  
  try {
    const projectId = process.env['GOOGLE_CLOUD_PROJECT'] || 'pixiu-trading-dev';
    
    // 检查 Secret Manager 可用性
    const available = await checkSecretManagerAvailable(projectId);
    console.log('Secret Manager 可用性:', available);
    
    if (!available) {
      console.log('Secret Manager 不可用，跳过凭据加载示例');
      return;
    }
    
    // 尝试加载凭据（这需要实际的 Secret Manager 配置）
    try {
      const credentials = await loadCredentialsFromSecretManager(
        projectId,
        'binance-api-credentials'
      );
      console.log('凭据加载成功:', {
        hasApiKey: !!credentials.apiKey,
        hasApiSecret: !!credentials.apiSecret,
        useSecretManager: credentials.useSecretManager
      });
    } catch (error) {
      console.log('凭据加载失败（预期的）:', error.message);
    }
    
    // 获取缓存统计
    const cacheStats = getCacheStats();
    console.log('缓存统计:', cacheStats);
    
    // 清理过期缓存
    const cleanedCount = cleanupExpiredCache();
    console.log('清理过期缓存项数:', cleanedCount);
    
  } catch (error) {
    console.error('Secret Manager 示例失败:', error);
  }
}

/**
 * 示例6：全局配置管理器
 */
async function example6_GlobalConfigManager(): Promise<void> {
  console.log('\n=== 示例6：全局配置管理器 ===');
  
  try {
    // 获取全局配置管理器实例
    const globalManager = getConfigManager({
      enableValidation: true,
      enableSecretManager: false
    });
    
    // 初始化
    await globalManager.initialize();
    
    // 在应用的其他地方也可以获取同一实例
    const sameInstance = getConfigManager();
    console.log('是否为同一实例:', globalManager === sameInstance);
    
    // 获取配置
    const config = sameInstance.getConfig();
    console.log('全局配置环境:', config.environment);
    
  } catch (error) {
    console.error('全局配置管理器示例失败:', error);
  }
}

/**
 * 运行所有示例
 */
async function runAllExamples(): Promise<void> {
  console.log('🚀 Binance 适配器配置系统示例');
  
  await example1_BasicConfigLoading();
  await example2_ConfigValidation();
  await example3_ConfigMerging();
  await example4_ConfigManagerUsage();
  await example5_SecretManagerIntegration();
  await example6_GlobalConfigManager();
  
  console.log('\n✅ 所有示例运行完成');
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  example1_BasicConfigLoading,
  example2_ConfigValidation,
  example3_ConfigMerging,
  example4_ConfigManagerUsage,
  example5_SecretManagerIntegration,
  example6_GlobalConfigManager,
  runAllExamples
};