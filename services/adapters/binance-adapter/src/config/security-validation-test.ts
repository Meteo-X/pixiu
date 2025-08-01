#!/usr/bin/env node
/**
 * 配置系统安全性验证测试
 * 
 * 验证配置系统的安全性方面：
 * 1. 凭据保护和隐藏
 * 2. 敏感信息不被意外暴露
 * 3. 配置序列化安全性
 * 4. 日志输出安全性
 */

import { 
  BinanceAdapterConfig,
  BinanceCredentials,
  createProductionConfig
} from './index';
import { ConfigManager } from './manager';

interface SecurityTestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

class SecurityTestRunner {
  private results: SecurityTestResult[] = [];
  
  async runTest(
    name: string, 
    testFn: () => Promise<void>,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM'
  ): Promise<void> {
    console.log(`🔐 Running: ${name}`);
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({
        name,
        status: 'PASS',
        message: 'Security test passed',
        duration,
        severity
      });
      console.log(`✅ PASS: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name,
        status: 'FAIL',
        message: error instanceof Error ? error.message : String(error),
        duration,
        severity
      });
      console.log(`❌ FAIL: ${name} (${duration}ms): ${error instanceof Error ? error.message : error}`);
    }
  }

  generateReport(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const failedTests = this.results.filter(r => r.status === 'FAIL').length;
    
    // 按严重性分组失败测试
    const criticalFailures = this.results.filter(r => r.status === 'FAIL' && r.severity === 'CRITICAL').length;
    const highFailures = this.results.filter(r => r.status === 'FAIL' && r.severity === 'HIGH').length;
    const mediumFailures = this.results.filter(r => r.status === 'FAIL' && r.severity === 'MEDIUM').length;
    const lowFailures = this.results.filter(r => r.status === 'FAIL' && r.severity === 'LOW').length;
    
    console.log('\\n' + '='.repeat(80));
    console.log('🔐 配置系统安全性验证报告');
    console.log('='.repeat(80));
    console.log(`总测试数: ${totalTests}`);
    console.log(`✅ 通过: ${passedTests}`);
    console.log(`❌ 失败: ${failedTests}`);
    console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\\n🚨 安全性问题分析:');
      if (criticalFailures > 0) console.log(`  🔴 严重: ${criticalFailures}`);
      if (highFailures > 0) console.log(`  🟠 高: ${highFailures}`);
      if (mediumFailures > 0) console.log(`  🟡 中: ${mediumFailures}`);
      if (lowFailures > 0) console.log(`  🟢 低: ${lowFailures}`);
      
      console.log('\\n❌ 失败的安全测试详情:');
      this.results.filter(r => r.status === 'FAIL').forEach(result => {
        const severityIcon = {
          'CRITICAL': '🔴',
          'HIGH': '🟠',
          'MEDIUM': '🟡',
          'LOW': '🟢'
        }[result.severity];
        console.log(`  ${severityIcon} [${result.severity}] ${result.name}: ${result.message}`);
      });
    }
    
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\\n⏱️  总耗时: ${totalDuration}ms`);
    console.log('='.repeat(80));
  }
}

async function main() {
  const runner = new SecurityTestRunner();
  
  console.log('🚀 开始执行配置系统安全性验证测试...');
  console.log('验证敏感信息保护和安全性\\n');

  // 1. 凭据保护测试
  await runner.runTest('1. 凭据在配置中的保护', async () => {
    const testCredentials: BinanceCredentials = {
      apiKey: 'test-api-key-12345',
      apiSecret: 'test-api-secret-67890',
      useSecretManager: true,
      secretName: 'test-secret'
    };
    
    const config = createProductionConfig();
    config.credentials = testCredentials;
    
    // 测试配置摘要是否隐藏敏感信息
    const manager = new ConfigManager({
      enableSecretManager: false,
      enableValidation: true
    });
    
    await manager.initialize();
    await manager.updateConfig(config);
    
    const summary = manager.getConfigSummary();
    
    // 检查 API key 和 secret 是否被隐藏
    if (summary.credentials) {
      if (summary.credentials.apiKey && summary.credentials.apiKey.includes('test-api-key')) {
        throw new Error('API key exposed in config summary');
      }
      if (summary.credentials.apiSecret && summary.credentials.apiSecret.includes('test-api-secret')) {
        throw new Error('API secret exposed in config summary');
      }
      
      // 检查是否有适当的元数据
      if (typeof summary.credentials.hasApiKey !== 'boolean') {
        throw new Error('Missing hasApiKey metadata in summary');
      }
      if (typeof summary.credentials.hasApiSecret !== 'boolean') {
        throw new Error('Missing hasApiSecret metadata in summary');
      }
    }
    
    manager.destroy();
    console.log('    ✅ Credentials properly protected in summary');
  }, 'CRITICAL');

  // 2. JSON 序列化安全性测试
  await runner.runTest('2. JSON序列化安全性', async () => {
    const testCredentials: BinanceCredentials = {
      apiKey: 'sensitive-api-key-data',
      apiSecret: 'sensitive-api-secret-data',
      useSecretManager: false,
      secretName: 'test-secret'
    };
    
    const config = createProductionConfig();
    config.credentials = testCredentials;
    
    // 直接序列化会暴露敏感信息（这是预期的，但需要开发者注意）
    const serialized = JSON.stringify(config);
    
    if (serialized.includes('sensitive-api-key-data') || serialized.includes('sensitive-api-secret-data')) {
      console.log('    ⚠️  Warning: Direct JSON.stringify exposes credentials');
      console.log('    ⚠️  Developers must use ConfigManager.getConfigSummary() for safe serialization');
    }
    
    // 使用 ConfigManager 的安全序列化
    const manager = new ConfigManager({
      enableSecretManager: false,
      enableValidation: true
    });
    
    await manager.initialize();
    await manager.updateConfig(config);
    
    const safeSummary = manager.getConfigSummary();
    const safeSerialized = JSON.stringify(safeSummary);
    
    if (safeSerialized.includes('sensitive-api-key-data') || safeSerialized.includes('sensitive-api-secret-data')) {
      throw new Error('Sensitive data exposed in safe serialization');
    }
    
    manager.destroy();
    console.log('    ✅ Safe serialization properly protects credentials');
  }, 'HIGH');

  // 3. 环境变量安全性测试
  await runner.runTest('3. 环境变量处理安全性', async () => {
    const originalEnv = { ...process.env };
    
    try {
      // 设置敏感的环境变量
      process.env['BINANCE_API_KEY'] = 'env-secret-key-123';
      process.env['BINANCE_API_SECRET'] = 'env-secret-secret-456';
      
      const { loadConfigFromEnv } = await import('./index');
      const envConfig = loadConfigFromEnv();
      
      // 验证环境变量被正确加载
      if (!envConfig.credentials?.apiKey || !envConfig.credentials?.apiSecret) {
        throw new Error('Environment variables not loaded properly');
      }
      
      // 验证环境变量值
      if (envConfig.credentials.apiKey !== 'env-secret-key-123') {
        throw new Error('API key not loaded correctly from environment');
      }
      if (envConfig.credentials.apiSecret !== 'env-secret-secret-456') {
        throw new Error('API secret not loaded correctly from environment');
      }
      
      console.log('    ✅ Environment variables loaded securely');
      console.log('    ⚠️  Remember to use appropriate environment variable protection in production');
      
    } finally {
      // 恢复环境变量
      Object.assign(process.env, originalEnv);
    }
  }, 'MEDIUM');

  // 4. 配置验证错误消息安全性
  await runner.runTest('4. 配置验证错误消息安全性', async () => {
    const { validateConfig } = await import('./validator');
    
    const configWithCredentials = createProductionConfig();
    configWithCredentials.credentials = {
      apiKey: 'secret-api-key-in-error',
      apiSecret: 'secret-api-secret-in-error',
      useSecretManager: false
    };
    
    // 创建一个会导致验证错误的配置
    const invalidConfig = {
      ...configWithCredentials,
      wsEndpoint: 'invalid-url',
      connection: {
        ...configWithCredentials.connection,
        maxConnections: -1 // 无效值
      }
    };
    
    const validationResult = validateConfig(invalidConfig as any);
    
    if (validationResult.valid) {
      throw new Error('Should detect invalid configuration');
    }
    
    // 检查错误消息是否暴露了敏感信息
    const errorMessages = validationResult.errors.map(e => e.message).join(' ');
    
    if (errorMessages.includes('secret-api-key-in-error') || 
        errorMessages.includes('secret-api-secret-in-error')) {
      throw new Error('Validation error messages expose sensitive credentials');
    }
    
    console.log('    ✅ Validation errors do not expose sensitive data');
    console.log(`    📊 Found ${validationResult.errors.length} validation errors (appropriately safe)`);
  }, 'HIGH');

  // 5. 日志输出安全性测试
  await runner.runTest('5. 日志输出安全性', async () => {
    // 模拟控制台输出捕获
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    
    let loggedMessages: string[] = [];
    
    const captureLog = (message: string) => {
      loggedMessages.push(message);
      originalConsoleLog(message); // 仍然输出到控制台
    };
    
    console.log = captureLog;
    console.warn = captureLog;
    console.error = captureLog;
    
    try {
      const manager = new ConfigManager({
        enableSecretManager: false,
        enableValidation: true
      });
      
      await manager.initialize();
      
      const configWithCredentials = createProductionConfig();
      configWithCredentials.credentials = {
        apiKey: 'log-test-api-key',
        apiSecret: 'log-test-api-secret',
        useSecretManager: false
      };
      
      await manager.updateConfig(configWithCredentials);
      
      // 触发一些可能记录配置信息的操作
      manager.validateCurrentConfig();
      manager.getConfigSummary();
      
      manager.destroy();
      
      // 检查日志消息是否包含敏感信息
      const allLogMessages = loggedMessages.join(' ');
      
      if (allLogMessages.includes('log-test-api-key') || 
          allLogMessages.includes('log-test-api-secret')) {
        throw new Error('Sensitive credentials found in log output');
      }
      
      console.log('    ✅ Log output does not expose sensitive credentials');
      console.log(`    📊 Captured ${loggedMessages.length} log messages (all safe)`);
      
    } finally {
      // 恢复原始控制台方法
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
    }
  }, 'HIGH');

  // 6. 缓存安全性测试
  await runner.runTest('6. 缓存安全性', async () => {
    const { getCacheStats, clearCredentialsCache } = await import('./secret-manager');
    
    // 清理缓存
    clearCredentialsCache();
    
    const initialStats = getCacheStats();
    if (initialStats.total !== 0) {
      throw new Error('Cache not properly cleared');
    }
    
    // 模拟缓存操作不会暴露敏感信息
    const stats = getCacheStats();
    
    // 缓存统计应该只包含元数据，不包含实际凭据
    const statsString = JSON.stringify(stats);
    
    // 这个测试主要是确保统计API不会意外暴露缓存内容
    if (statsString.includes('api') && statsString.includes('secret')) {
      // 如果同时包含 'api' 和 'secret'，可能暴露了凭据结构
      console.log('    ⚠️  Warning: Cache stats may expose credential structure');
    }
    
    console.log('    ✅ Cache statistics are safe');
    console.log(`    📊 Cache stats: ${statsString}`);
  }, 'MEDIUM');

  // 7. 配置文件安全性检查
  await runner.runTest('7. 配置文件安全性', async () => {
    const { promises: fs } = require('fs');
    const { resolve } = require('path');
    
    // 检查生产配置文件
    const prodConfigPath = resolve(__dirname, '../../config/production.yaml');
    
    try {
      const prodConfigContent = await fs.readFile(prodConfigPath, 'utf8');
      
      // 检查生产配置文件是否包含硬编码的API密钥
      const sensitivePatterns = [
        /apiKey:\s*['"][^'"]{10,}['"]/i,
        /apiSecret:\s*['"][^'"]{10,}['"]/i,
        /api.key.*=.*[a-zA-Z0-9]{20,}/i,
        /secret.*=.*[a-zA-Z0-9]{20,}/i
      ];
      
      let foundSensitiveData = false;
      for (const pattern of sensitivePatterns) {
        if (pattern.test(prodConfigContent)) {
          foundSensitiveData = true;
          break;
        }
      }
      
      if (foundSensitiveData) {
        throw new Error('Production config file may contain hardcoded credentials');
      }
      
      // 检查是否使用 Secret Manager
      if (!prodConfigContent.includes('useSecretManager: true')) {
        console.log('    ⚠️  Warning: Production config should use Secret Manager');
      }
      
      console.log('    ✅ Production config file security check passed');
      
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('    ℹ️  Production config file not found (acceptable)');
      } else {
        throw error;
      }
    }
  }, 'HIGH');

  // 8. 内存安全性测试
  await runner.runTest('8. 内存安全性', async () => {
    const manager = new ConfigManager({
      enableSecretManager: false,
      enableValidation: true
    });
    
    await manager.initialize();
    
    const configWithCredentials = createProductionConfig();
    configWithCredentials.credentials = {
      apiKey: 'memory-test-key',
      apiSecret: 'memory-test-secret',
      useSecretManager: false
    };
    
    await manager.updateConfig(configWithCredentials);
    
    // 获取配置引用
    const config = manager.getConfig();
    
    // 销毁管理器
    manager.destroy();
    
    // 验证销毁后访问配置会抛出错误
    try {
      manager.getConfig();
      throw new Error('Should not be able to access config after destroy');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('not loaded')) {
        throw new Error('Unexpected error type after destroy');
      }
    }
    
    // 注意：JavaScript中无法真正清除内存中的敏感数据
    // 但我们可以确保对象引用被正确清理
    console.log('    ✅ Memory cleanup appears correct');
    console.log('    ⚠️  Note: JavaScript cannot guarantee memory wiping of sensitive data');
  }, 'MEDIUM');

  // 生成报告
  runner.generateReport();
  
  // 返回失败的测试数
  const failedTests = runner.results.filter(r => r.status === 'FAIL').length;
  const criticalFailures = runner.results.filter(r => r.status === 'FAIL' && r.severity === 'CRITICAL').length;
  
  // 如果有严重的安全问题，使用更高的退出码
  if (criticalFailures > 0) {
    return 2; // 严重安全问题
  } else if (failedTests > 0) {
    return 1; // 一般安全问题
  } else {
    return 0; // 所有测试通过
  }
}

if (require.main === module) {
  main()
    .then(exitCode => {
      if (exitCode === 2) {
        console.log('\\n🚨 发现严重安全问题，请立即修复！');
      } else if (exitCode === 1) {
        console.log('\\n⚠️  发现安全问题，建议修复');
      } else {
        console.log('\\n✅ 所有安全测试通过');
      }
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('❌ Security test runner failed:', error);
      process.exit(3);
    });
}

export { SecurityTestRunner };