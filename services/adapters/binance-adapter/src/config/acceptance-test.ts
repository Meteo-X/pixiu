#!/usr/bin/env node
/**
 * 完整的配置系统验收测试
 * 
 * 该脚本验证Task 1.3的所有功能：
 * 1. 配置结构设计
 * 2. 配置加载和验证逻辑
 * 3. 环境特定配置文件
 * 4. Google Secret Manager集成
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { 
  loadConfig, 
  loadConfigFromFile, 
  loadConfigFromEnv,
  mergeConfigs,
  createDevelopmentConfig,
  createTestingConfig,
  createProductionConfig,
  ConfigurationError
} from './index';
import { validateConfig } from './validator';
import { ConfigManager } from './manager';

// 测试结果收集器
interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration: number;
  error?: Error;
}

class AcceptanceTestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  public getResults(): TestResult[] {
    return this.results;
  }

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    console.log(`🧪 Running: ${name}`);
    this.startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - this.startTime;
      this.results.push({
        name,
        status: 'PASS',
        message: 'Test passed successfully',
        duration
      });
      console.log(`✅ PASS: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - this.startTime;
      this.results.push({
        name,
        status: 'FAIL',
        message: error instanceof Error ? error.message : String(error),
        duration,
        error: error instanceof Error ? error : new Error(String(error))
      });
      console.log(`❌ FAIL: ${name} (${duration}ms): ${error instanceof Error ? error.message : error}`);
    }
  }

  generateReport(): void {
    const results = this.getResults();
    const totalTests = results.length;
    const passedTests = results.filter(r => r.status === 'PASS').length;
    const failedTests = results.filter(r => r.status === 'FAIL').length;
    const skippedTests = results.filter(r => r.status === 'SKIP').length;
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 配置系统验收测试报告');
    console.log('='.repeat(80));
    console.log(`总测试数: ${totalTests}`);
    console.log(`✅ 通过: ${passedTests}`);
    console.log(`❌ 失败: ${failedTests}`);
    console.log(`⏭️  跳过: ${skippedTests}`);
    console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ 失败的测试详情:');
      results.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  - ${result.name}: ${result.message}`);
      });
    }
    
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\\n⏱️  总耗时: ${totalDuration}ms`);
    console.log('='.repeat(80));
  }
}

async function main() {
  const runner = new AcceptanceTestRunner();
  
  console.log('🚀 开始执行配置系统验收测试...');
  console.log('测试任务 1.3: 配置系统设计\\n');

  // 1. 配置结构设计测试
  await runner.runTest('1.3.1 - 验证配置接口和类型定义', async () => {
    const devConfig = createDevelopmentConfig();
    const testConfig = createTestingConfig();
    const prodConfig = createProductionConfig();
    
    // 验证必要字段存在
    const requiredFields = ['wsEndpoint', 'restEndpoint', 'environment', 'connection', 'retry', 'subscriptions', 'logging', 'monitoring'];
    for (const config of [devConfig, testConfig, prodConfig]) {
      for (const field of requiredFields) {
        if (!(field in config)) {
          throw new Error(`Missing required field: ${field} in ${config.environment} config`);
        }
      }
    }
    
    // 验证类型正确性
    if (typeof devConfig.wsEndpoint !== 'string') throw new Error('wsEndpoint should be string');
    if (typeof devConfig.connection.maxConnections !== 'number') throw new Error('maxConnections should be number');
    if (!Array.isArray(devConfig.subscriptions.defaultSymbols)) throw new Error('defaultSymbols should be array');
  });

  await runner.runTest('1.3.1 - 验证默认配置值合理性', async () => {
    const devConfig = createDevelopmentConfig();
    
    // 验证开发环境配置合理性
    if (devConfig.connection.maxConnections > 10) throw new Error('Development max connections too high');
    if (devConfig.logging.level !== 'debug') throw new Error('Development should use debug logging');
    if (devConfig.subscriptions.defaultSymbols.length > 5) throw new Error('Development should have limited symbols');
    
    const prodConfig = createProductionConfig();
    
    // 验证生产环境配置合理性
    if (prodConfig.connection.maxConnections < 5) throw new Error('Production max connections too low');
    if (prodConfig.logging.level === 'debug') throw new Error('Production should not use debug logging');
    if (!prodConfig.credentials?.useSecretManager) throw new Error('Production should use Secret Manager');
  });

  // 2. 配置加载和验证逻辑测试
  await runner.runTest('1.3.2 - 从JSON文件加载配置', async () => {
    // 创建临时JSON配置文件
    const tempConfig = {
      wsEndpoint: 'wss://test.example.com',
      restEndpoint: 'https://test.example.com',
      environment: 'testing',
      connection: { maxConnections: 3 },
      retry: { maxRetries: 5 },
      subscriptions: {
        defaultSymbols: ['BTCUSDT'],
        supportedDataTypes: ['trade'],
        batchSubscription: { enabled: true, batchSize: 10, batchInterval: 1000 },
        management: { autoResubscribe: true, subscriptionTimeout: 10000, maxConcurrentSubscriptions: 100 }
      },
      logging: { level: 'info', format: 'json', structured: true }
    };
    
    const tempFile = resolve(__dirname, 'temp-test-config.json');
    await fs.writeFile(tempFile, JSON.stringify(tempConfig, null, 2));
    
    try {
      const config = await loadConfigFromFile(tempFile);
      if (config.wsEndpoint !== 'wss://test.example.com') throw new Error('Failed to load wsEndpoint');
      if (config.environment !== 'testing') throw new Error('Failed to load environment');
      if (config.connection?.maxConnections !== 3) throw new Error('Failed to load connection config');
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  });

  await runner.runTest('1.3.2 - 从YAML文件加载配置', async () => {
    const configPath = resolve(__dirname, '../../config/development.yaml');
    const config = await loadConfigFromFile(configPath);
    
    if (!config.wsEndpoint) throw new Error('Failed to load wsEndpoint from YAML');
    if (config.environment !== 'development') throw new Error('Failed to load environment from YAML');
    if (!Array.isArray(config.subscriptions?.defaultSymbols)) throw new Error('Failed to load array from YAML');
  });

  await runner.runTest('1.3.2 - 从环境变量加载配置', async () => {
    const originalEnv = { ...process.env };
    
    try {
      process.env['BINANCE_WS_ENDPOINT'] = 'wss://env.example.com';
      process.env['BINANCE_REST_ENDPOINT'] = 'https://env.example.com';
      process.env['NODE_ENV'] = 'testing';
      process.env['BINANCE_MAX_CONNECTIONS'] = '7';
      process.env['LOG_LEVEL'] = 'warn';
      
      const config = loadConfigFromEnv();
      
      if (config.wsEndpoint !== 'wss://env.example.com') throw new Error('Failed to load wsEndpoint from env');
      if (config.environment !== 'testing') throw new Error('Failed to load environment from env');
      if (config.connection?.maxConnections !== 7) throw new Error('Failed to load maxConnections from env');
      if (config.logging?.level !== 'warn') throw new Error('Failed to load logging level from env');
    } finally {
      // 恢复环境变量
      Object.assign(process.env, originalEnv);
    }
  });

  await runner.runTest('1.3.2 - 配置优先级和合并逻辑', async () => {
    const baseConfig = createDevelopmentConfig();
    const override1 = { 
      connection: { 
        ...baseConfig.connection,
        maxConnections: 15 
      } 
    };
    const override2 = { 
      logging: { 
        ...baseConfig.logging,
        level: 'error' as const 
      } 
    };
    
    const merged = mergeConfigs(baseConfig, override1, override2);
    
    if (merged.connection.maxConnections !== 15) throw new Error('Failed to merge connection config');
    if (merged.logging.level !== 'error') throw new Error('Failed to merge logging config');
    if (merged.environment !== 'development') throw new Error('Base config fields lost during merge');
  });

  await runner.runTest('1.3.2 - 配置验证和错误处理', async () => {
    const invalidConfig = {
      wsEndpoint: 'invalid-url',
      restEndpoint: 'invalid-url',
      environment: 'invalid-env',
      connection: { maxConnections: -1 },
      retry: { maxRetries: 0 },
      subscriptions: { defaultSymbols: [], supportedDataTypes: [] },
      logging: { level: 'invalid-level', format: 'invalid-format', structured: true }
    } as any;
    
    const result = validateConfig(invalidConfig);
    
    if (result.valid) throw new Error('Should detect invalid configuration');
    if (result.errors.length === 0) throw new Error('Should return validation errors');
    
    // 检查特定错误
    const hasUrlError = result.errors.some(e => e.field.includes('Endpoint'));
    const hasEnvError = result.errors.some(e => e.field === 'environment');
    if (!hasUrlError || !hasEnvError) throw new Error('Missing expected validation errors');
  });

  // 3. 环境特定配置文件测试
  await runner.runTest('1.3.3 - 开发环境配置文件结构', async () => {
    const devConfigPath = resolve(__dirname, '../../config/development.yaml');
    const exists = await fs.access(devConfigPath).then(() => true).catch(() => false);
    if (!exists) throw new Error('Development config file not found');
    
    const config = await loadConfigFromFile(devConfigPath);
    if (config.environment !== 'development') throw new Error('Development config has wrong environment');
    if (config.logging?.level !== 'debug') throw new Error('Development should use debug logging');
  });

  await runner.runTest('1.3.3 - 生产环境配置文件结构', async () => {
    const prodConfigPath = resolve(__dirname, '../../config/production.yaml');
    const exists = await fs.access(prodConfigPath).then(() => true).catch(() => false);
    if (!exists) throw new Error('Production config file not found');
    
    const config = await loadConfigFromFile(prodConfigPath);
    if (config.environment !== 'production') throw new Error('Production config has wrong environment');
    if (config.credentials?.useSecretManager !== true) throw new Error('Production should use Secret Manager');
  });

  await runner.runTest('1.3.3 - 测试环境配置合理性', async () => {
    const testConfig = createTestingConfig();
    
    // 测试环境应该有适当的资源限制
    if (testConfig.connection.maxConnections > 5) throw new Error('Test env should have limited connections');
    if (testConfig.retry.maxRetries > 10) throw new Error('Test env should have limited retries');
    if (testConfig.subscriptions.batchSubscription.enabled) throw new Error('Test env should disable batch subscription');
  });

  // 4. ConfigManager集成测试
  await runner.runTest('1.3.4 - ConfigManager基本功能', async () => {
    const manager = new ConfigManager({
      enableSecretManager: false, // 禁用Secret Manager避免认证问题
      enableValidation: true
    });
    
    await manager.initialize();
    
    if (!manager.isConfigLoaded()) throw new Error('Config should be loaded after initialization');
    
    const config = manager.getConfig();
    if (!config.wsEndpoint) throw new Error('Config should have wsEndpoint');
    
    const summary = manager.getConfigSummary();
    if (!summary.environment) throw new Error('Summary should include environment');
    
    // 测试配置验证
    const validation = manager.validateCurrentConfig();
    if (!validation.valid && validation.errors.length > 0) {
      throw new Error(`Config validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }
    
    manager.destroy();
  });

  await runner.runTest('1.3.4 - ConfigManager配置更新', async () => {
    const manager = new ConfigManager({
      enableSecretManager: false,
      enableValidation: true
    });
    
    await manager.initialize();
    
    const originalMaxConnections = manager.getConfig().connection.maxConnections;
    
    await manager.updateConfig({
      connection: { 
        ...manager.getConfig().connection,
        maxConnections: originalMaxConnections + 5 
      }
    });
    
    const newMaxConnections = manager.getConfig().connection.maxConnections;
    if (newMaxConnections !== originalMaxConnections + 5) {
      throw new Error('Config update failed');
    }
    
    manager.destroy();
  });

  // 5. 完整配置加载流程测试
  await runner.runTest('1.3.5 - 完整配置加载流程', async () => {
    const originalEnv = { ...process.env };
    
    try {
      // 设置环境变量
      process.env['NODE_ENV'] = 'development';
      process.env['BINANCE_MAX_CONNECTIONS'] = '8';
      
      // 从开发环境配置文件加载
      const configPath = resolve(__dirname, '../../config/development.yaml');
      const config = await loadConfig(configPath);
      
      // 验证配置合并正确
      if (config.environment !== 'development') throw new Error('Environment not loaded correctly');
      if (config.connection.maxConnections !== 8) throw new Error('Environment variable override failed');
      if (!config.wsEndpoint) throw new Error('Base config not loaded');
      
      // 验证配置完整性
      const validation = validateConfig(config);
      if (!validation.valid) {
        throw new Error(`Loaded config is invalid: ${validation.errors.map(e => e.message).join(', ')}`);
      }
      
    } finally {
      Object.assign(process.env, originalEnv);
    }
  });

  // 6. 性能测试
  await runner.runTest('1.3.6 - 配置加载性能测试', async () => {
    const configPath = resolve(__dirname, '../../config/development.yaml');
    
    // 测试文件加载性能
    const fileLoadStart = Date.now();
    for (let i = 0; i < 10; i++) {
      await loadConfigFromFile(configPath);
    }
    const fileLoadTime = (Date.now() - fileLoadStart) / 10;
    
    if (fileLoadTime > 50) throw new Error(`File loading too slow: ${fileLoadTime}ms per load`);
    
    // 测试环境变量加载性能
    const envLoadStart = Date.now();
    for (let i = 0; i < 1000; i++) {
      loadConfigFromEnv();
    }
    const envLoadTime = (Date.now() - envLoadStart) / 1000;
    
    if (envLoadTime > 1) throw new Error(`Environment loading too slow: ${envLoadTime}ms per load`);
    
    console.log(`    📊 Performance metrics - File: ${fileLoadTime.toFixed(2)}ms, Env: ${envLoadTime.toFixed(3)}ms`);
  });

  // 7. 错误处理测试
  await runner.runTest('1.3.7 - 错误处理能力', async () => {
    // 测试不存在的文件
    try {
      await loadConfigFromFile('/nonexistent/config.json');
      throw new Error('Should throw error for nonexistent file');
    } catch (error) {
      if (!(error instanceof ConfigurationError)) {
        throw new Error('Should throw ConfigurationError');
      }
    }
    
    // 测试无效JSON
    const invalidJsonFile = resolve(__dirname, 'invalid-temp.json');
    await fs.writeFile(invalidJsonFile, '{ invalid json }');
    
    try {
      await loadConfigFromFile(invalidJsonFile);
      throw new Error('Should throw error for invalid JSON');
    } catch (error) {
      if (!(error instanceof ConfigurationError)) {
        throw new Error('Should throw ConfigurationError for invalid JSON');
      }
    } finally {
      await fs.unlink(invalidJsonFile).catch(() => {});
    }
  });

  // 生成报告
  runner.generateReport();
  
  // 返回适当的退出码
  const failedTests = runner.getResults().filter(r => r.status === 'FAIL').length;
  process.exit(failedTests > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Acceptance test runner failed:', error);
    process.exit(1);
  });
}

export { AcceptanceTestRunner };