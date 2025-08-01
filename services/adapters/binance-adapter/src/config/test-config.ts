/**
 * 配置系统简单测试
 * 
 * 验证配置系统的核心功能是否正常工作
 */

import { 
  createDevelopmentConfig,
  createTestingConfig,
  createProductionConfig,
  loadConfigFromEnv,
  mergeConfigs,
  getEnvironmentConfig
} from './index';
import { validateConfig } from './validator';
import { ConfigManager } from './manager';

/**
 * 测试环境配置创建
 */
function testEnvironmentConfigs(): boolean {
  console.log('🧪 测试环境配置创建...');
  
  try {
    // 测试开发环境配置
    const devConfig = createDevelopmentConfig();
    if (devConfig.environment !== 'development') {
      throw new Error('开发环境配置错误');
    }
    console.log('✅ 开发环境配置正常');
    
    // 测试测试环境配置
    const testConfig = createTestingConfig();
    if (testConfig.environment !== 'testing') {
      throw new Error('测试环境配置错误');
    }
    console.log('✅ 测试环境配置正常');
    
    // 测试生产环境配置
    const prodConfig = createProductionConfig();
    if (prodConfig.environment !== 'production') {
      throw new Error('生产环境配置错误');
    }
    console.log('✅ 生产环境配置正常');
    
    return true;
  } catch (error) {
    console.error('❌ 环境配置测试失败:', error);
    return false;
  }
}

/**
 * 测试配置验证
 */
function testConfigValidation(): boolean {
  console.log('🧪 测试配置验证...');
  
  try {
    // 测试有效配置
    const validConfig = createDevelopmentConfig();
    const validResult = validateConfig(validConfig);
    if (!validResult.valid) {
      throw new Error(`有效配置验证失败: ${validResult.errors.map(e => e.message).join(', ')}`);
    }
    console.log('✅ 有效配置验证通过');
    
    // 测试无效配置
    const invalidConfig = {
      ...validConfig,
      wsEndpoint: 'invalid-url',
      connection: {
        ...validConfig.connection,
        maxConnections: -1
      }
    };
    
    const invalidResult = validateConfig(invalidConfig);
    if (invalidResult.valid) {
      throw new Error('无效配置应该验证失败');
    }
    if (invalidResult.errors.length === 0) {
      throw new Error('无效配置应该有错误信息');
    }
    console.log('✅ 无效配置验证正确失败');
    
    return true;
  } catch (error) {
    console.error('❌ 配置验证测试失败:', error);
    return false;
  }
}

/**
 * 测试环境变量加载
 */
function testEnvironmentVariables(): boolean {
  console.log('🧪 测试环境变量加载...');
  
  try {
    // 设置测试环境变量
    const originalEnv = { ...process.env };
    
    process.env['BINANCE_WS_ENDPOINT'] = 'wss://test.example.com';
    process.env['BINANCE_MAX_CONNECTIONS'] = '3';
    process.env['LOG_LEVEL'] = 'warn';
    
    // 加载环境变量配置
    const envConfig = loadConfigFromEnv();
    
    if (envConfig.wsEndpoint !== 'wss://test.example.com') {
      throw new Error('WebSocket 端点环境变量加载失败');
    }
    
    if (!envConfig.connection || envConfig.connection.maxConnections !== 3) {
      throw new Error('连接配置环境变量加载失败');
    }
    
    if (!envConfig.logging || envConfig.logging.level !== 'warn') {
      throw new Error('日志配置环境变量加载失败');
    }
    
    // 恢复原始环境变量
    process.env = originalEnv;
    
    console.log('✅ 环境变量加载正常');
    return true;
  } catch (error) {
    console.error('❌ 环境变量测试失败:', error);
    return false;
  }
}

/**
 * 测试配置合并
 */
function testConfigMerging(): boolean {
  console.log('🧪 测试配置合并...');
  
  try {
    const baseConfig = createDevelopmentConfig();
    const override1 = {
      connection: {
        ...baseConfig.connection,
        maxConnections: 10
      }
    };
    const override2 = {
      logging: {
        ...baseConfig.logging,
        level: 'error' as const
      }
    };
    
    const mergedConfig = mergeConfigs(baseConfig, override1, override2);
    
    if (mergedConfig.connection.maxConnections !== 10) {
      throw new Error('连接配置合并失败');
    }
    
    if (mergedConfig.logging.level !== 'error') {
      throw new Error('日志配置合并失败');
    }
    
    // 验证其他配置没有被影响
    if (mergedConfig.environment !== baseConfig.environment) {
      throw new Error('基础配置被意外修改');
    }
    
    console.log('✅ 配置合并正常');
    return true;
  } catch (error) {
    console.error('❌ 配置合并测试失败:', error);
    return false;
  }
}

/**
 * 测试自动环境检测
 */
function testAutoEnvironmentDetection(): boolean {
  console.log('🧪 测试自动环境检测...');
  
  try {
    const originalEnv = process.env['NODE_ENV'];
    
    // 测试开发环境
    process.env['NODE_ENV'] = 'development';
    const devConfig = getEnvironmentConfig();
    if (devConfig.environment !== 'development') {
      throw new Error('开发环境自动检测失败');
    }
    
    // 测试生产环境
    process.env['NODE_ENV'] = 'production';
    const prodConfig = getEnvironmentConfig();
    if (prodConfig.environment !== 'production') {
      throw new Error('生产环境自动检测失败');
    }
    
    // 测试默认环境
    process.env['NODE_ENV'] = 'unknown';
    const defaultConfig = getEnvironmentConfig();
    if (defaultConfig.environment !== 'development') {
      throw new Error('默认环境检测失败');
    }
    
    // 恢复原始环境变量
    if (originalEnv) {
      process.env['NODE_ENV'] = originalEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
    
    console.log('✅ 自动环境检测正常');
    return true;
  } catch (error) {
    console.error('❌ 自动环境检测测试失败:', error);
    return false;
  }
}

/**
 * 测试配置管理器基本功能
 */
async function testConfigManagerBasics(): Promise<boolean> {
  console.log('🧪 测试配置管理器基本功能...');
  
  try {
    const configManager = new ConfigManager({
      enableValidation: true,
      enableSecretManager: false,
      preloadCredentials: false
    });
    
    // 测试初始化前状态
    if (configManager.isConfigLoaded()) {
      throw new Error('配置管理器初始化前不应已加载配置');
    }
    
    // 初始化
    await configManager.initialize();
    
    // 测试初始化后状态
    if (!configManager.isConfigLoaded()) {
      throw new Error('配置管理器初始化后应已加载配置');
    }
    
    // 获取配置
    const config = configManager.getConfig();
    if (!config || !config.environment) {
      throw new Error('配置获取失败');
    }
    
    // 获取配置摘要
    const summary = configManager.getConfigSummary();
    if (!summary || summary.environment !== config.environment) {
      throw new Error('配置摘要获取失败');
    }
    
    // 验证配置
    const validation = configManager.validateCurrentConfig();
    if (!validation.valid) {
      throw new Error('配置验证失败');
    }
    
    // 更新配置
    const originalLogLevel = config.logging.level;
    await configManager.updateConfig({
      logging: {
        ...config.logging,
        level: originalLogLevel === 'debug' ? 'info' : 'debug'
      }
    });
    
    const updatedConfig = configManager.getConfig();
    if (updatedConfig.logging.level === originalLogLevel) {
      throw new Error('配置更新失败');
    }
    
    // 销毁
    configManager.destroy();
    
    console.log('✅ 配置管理器基本功能正常');
    return true;
  } catch (error) {
    console.error('❌ 配置管理器测试失败:', error);
    return false;
  }
}

/**
 * 运行所有测试
 */
async function runAllTests(): Promise<void> {
  console.log('🚀 开始配置系统测试');
  console.log('=====================================');
  
  const results = [
    testEnvironmentConfigs(),
    testConfigValidation(),
    testEnvironmentVariables(),
    testConfigMerging(),
    testAutoEnvironmentDetection(),
    await testConfigManagerBasics()
  ];
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('=====================================');
  console.log(`🏁 测试完成: ${passed}/${total} 通过`);
  
  if (passed === total) {
    console.log('🎉 所有测试通过！配置系统正常工作');
  } else {
    console.log('⚠️  部分测试失败，请检查配置系统');
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行所有测试
if (require.main === module) {
  runAllTests().catch(console.error);
}

export { runAllTests };