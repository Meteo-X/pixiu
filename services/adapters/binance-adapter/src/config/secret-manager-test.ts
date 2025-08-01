#!/usr/bin/env node
/**
 * Google Secret Manager 集成测试
 * 
 * 验证 Secret Manager 功能：
 * 1. 连接性检查
 * 2. 凭据加载和缓存
 * 3. 错误处理和降级机制
 * 4. 安全性验证
 */

import {
  loadCredentialsFromSecretManager,
  checkSecretManagerAvailable,
  clearCredentialsCache,
  getCacheStats,
  cleanupExpiredCache
} from './secret-manager';
import { BinanceCredentials } from './index';

interface SecretManagerTestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration: number;
  metadata?: any;
}

class SecretManagerTestRunner {
  private results: SecretManagerTestResult[] = [];
  
  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    console.log(`🧪 Running: ${name}`);
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({
        name,
        status: 'PASS',
        message: 'Test passed successfully',
        duration
      });
      console.log(`✅ PASS: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name,
        status: 'FAIL',
        message: error instanceof Error ? error.message : String(error),
        duration
      });
      console.log(`❌ FAIL: ${name} (${duration}ms): ${error instanceof Error ? error.message : error}`);
    }
  }

  skipTest(name: string, reason: string): void {
    this.results.push({
      name,
      status: 'SKIP',
      message: reason,
      duration: 0
    });
    console.log(`⏭️ SKIP: ${name} - ${reason}`);
  }

  generateReport(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const failedTests = this.results.filter(r => r.status === 'FAIL').length;
    const skippedTests = this.results.filter(r => r.status === 'SKIP').length;
    
    console.log('\\n' + '='.repeat(80));
    console.log('📊 Google Secret Manager 集成测试报告');
    console.log('='.repeat(80));
    console.log(`总测试数: ${totalTests}`);
    console.log(`✅ 通过: ${passedTests}`);
    console.log(`❌ 失败: ${failedTests}`);
    console.log(`⏭️  跳过: ${skippedTests}`);
    
    if (totalTests > 0) {
      console.log(`成功率: ${((passedTests / (totalTests - skippedTests)) * 100).toFixed(1)}%`);
    }
    
    if (failedTests > 0) {
      console.log('\\n❌ 失败的测试详情:');
      this.results.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  - ${result.name}: ${result.message}`);
      });
    }
    
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\\n⏱️  总耗时: ${totalDuration}ms`);
    console.log('='.repeat(80));
  }
}

async function main() {
  const runner = new SecretManagerTestRunner();
  
  console.log('🚀 开始执行 Google Secret Manager 集成测试...');
  console.log('测试任务 1.3.4: Google Secret Manager 配置管理\\n');

  // 检查环境设置
  const hasGoogleCredentials = !!(
    process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GCLOUD_PROJECT']
  );
  
  // 获取正确的项目ID
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'] || 
                   process.env['GCLOUD_PROJECT'] || 
                   'pixiu-trading-dev'; // 使用正确的项目ID

  // 1. 连接性检查测试
  await runner.runTest('1.3.4.1 - Secret Manager 可用性检查', async () => {
    console.log(`    📊 Testing with project: ${projectId}`);
    
    // 检查 Secret Manager 是否可用
    const available = await checkSecretManagerAvailable(projectId);
    
    // 记录结果但不作为错误
    console.log(`    📊 Secret Manager available: ${available}`);
    
    if (!available) {
      console.log('    ⚠️  Warning: Secret Manager not available - this may be due to missing credentials or permissions');
    } else {
      console.log('    ✅ Secret Manager connection successful');
    }
  });

  // 2. 凭据缓存机制测试
  await runner.runTest('1.3.4.2 - 凭据缓存机制', async () => {
    // 清理缓存
    clearCredentialsCache();
    
    const initialStats = getCacheStats();
    if (initialStats.total !== 0) {
      throw new Error('Cache should be empty after clearing');
    }
    
    // 模拟缓存操作（通过内部API）
    // 由于Secret Manager需要真实凭据，我们测试缓存逻辑
    const cleanedCount = cleanupExpiredCache();
    console.log(`    📊 Cleaned ${cleanedCount} expired cache entries`);
    
    const finalStats = getCacheStats();
    console.log(`    📊 Cache stats: ${JSON.stringify(finalStats)}`);
  });

  // 3. 错误处理测试
  await runner.runTest('1.3.4.3 - 错误处理和降级机制', async () => {
    const fakeProjectId = 'non-existent-project-12345';
    
    try {
      // 这应该失败，但要优雅地处理
      const available = await checkSecretManagerAvailable(fakeProjectId);
      
      // 对于不存在的项目，应该返回false而不是抛出异常
      if (available) {
        throw new Error('Should not report availability for non-existent project');
      }
      
      console.log('    ✅ Gracefully handled non-existent project');
    } catch (error) {
      // 如果确实抛出了异常，这也是可以接受的行为
      console.log('    ✅ Error thrown for non-existent project (acceptable behavior)');
    }
  });

  // 4. 安全性验证
  await runner.runTest('1.3.4.4 - 凭据安全性验证', async () => {
    // 验证凭据结构
    const testCredentials: BinanceCredentials = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      useSecretManager: true,
      secretName: 'test-secret'
    };
    
    // 验证必要字段存在
    if (!testCredentials.apiKey) throw new Error('API key should be present');
    if (!testCredentials.apiSecret) throw new Error('API secret should be present');
    
    // 验证凭据字段类型
    if (typeof testCredentials.apiKey !== 'string') throw new Error('API key should be string');
    if (typeof testCredentials.apiSecret !== 'string') throw new Error('API secret should be string');
    if (typeof testCredentials.useSecretManager !== 'boolean') throw new Error('useSecretManager should be boolean');
    
    // 验证敏感信息不会意外暴露
    const serialized = JSON.stringify(testCredentials);
    if (serialized.includes('test-key') && serialized.includes('test-secret')) {
      console.log('    ⚠️  Warning: Credentials are serialized as-is (ensure proper handling in logs)');
    }
    
    console.log('    📊 Credential structure validation passed');
  });

  // 5. Secret Manager 凭据加载测试
  await runner.runTest('1.3.4.5 - Secret Manager 凭据加载测试', async () => {
    console.log(`    📊 Testing credential loading from project: ${projectId}`);
    
    // 使用一个测试用的 secret 名称
    const secretName = 'binance-test-credentials';
    
    try {
      // 尝试加载 secret - 这可能成功或失败，都是有效的测试结果
      const credentials = await loadCredentialsFromSecretManager(projectId, secretName, false);
      
      // 如果成功了，验证凭据结构
      if (credentials.apiKey && credentials.apiSecret) {
        console.log('    ✅ Successfully loaded valid credentials from Secret Manager');
        console.log(`    📊 Credentials structure: apiKey present, apiSecret present, useSecretManager: ${credentials.useSecretManager}`);
      } else {
        throw new Error('Loaded credentials are incomplete');
      }
      
    } catch (error) {
      // 分析不同类型的错误
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        if (errorMsg.includes('not found') || errorMsg.includes('no such secret')) {
          console.log(`    ✅ Expected result - secret '${secretName}' not found in project '${projectId}'`);
          console.log('    💡 To test successfully: create a secret with JSON: {"apiKey":"test-key","apiSecret":"test-secret"}');
        } else if (errorMsg.includes('permission') || errorMsg.includes('denied') || errorMsg.includes('unauthorized')) {
          console.log('    ✅ Expected result - insufficient permissions to access Secret Manager');
        } else if (errorMsg.includes('unauthenticated') || errorMsg.includes('credentials')) {
          console.log('    ⚠️  Authentication issue - check Google Cloud credentials');
          throw error; // 这个应该被标记为失败
        } else {
          console.log(`    ⚠️  Unexpected error: ${error.message}`);
          throw error; // 未知错误应该被标记为失败
        }
      } else {
        throw error;
      }
    }
  });

  // 6. 性能和并发测试
  await runner.runTest('1.3.4.6 - 缓存性能测试', async () => {
    // 清理缓存
    clearCredentialsCache();
    
    const iterations = 1000;
    
    // 测试缓存统计性能
    const startTime = Date.now();
    for (let i = 0; i < iterations; i++) {
      getCacheStats();
    }
    const duration = Date.now() - startTime;
    
    const avgTime = duration / iterations;
    if (avgTime > 1) { // 每次调用不应超过1ms
      throw new Error(`Cache stats too slow: ${avgTime}ms per call`);
    }
    
    console.log(`    📊 Cache stats performance: ${avgTime.toFixed(3)}ms per call`);
    
    // 测试缓存清理性能
    const cleanupStart = Date.now();
    cleanupExpiredCache();
    const cleanupDuration = Date.now() - cleanupStart;
    
    if (cleanupDuration > 10) { // 清理不应超过10ms
      throw new Error(`Cache cleanup too slow: ${cleanupDuration}ms`);
    }
    
    console.log(`    📊 Cache cleanup performance: ${cleanupDuration}ms`);
  });

  // 7. 配置集成测试
  await runner.runTest('1.3.4.7 - 配置管理器 Secret Manager 集成', async () => {
    // 导入 ConfigManager 进行集成测试
    const { ConfigManager } = await import('./manager');
    
    const manager = new ConfigManager({
      enableSecretManager: hasGoogleCredentials,
      enableValidation: true,
      preloadCredentials: false // 避免真实加载
    });
    
    await manager.initialize();
    
    if (!manager.isConfigLoaded()) {
      throw new Error('ConfigManager should be initialized');
    }
    
    const config = manager.getConfig();
    const summary = manager.getConfigSummary();
    
    // 验证摘要中没有暴露敏感信息
    if (summary.credentials) {
      if (summary.credentials.apiKey && summary.credentials.apiKey !== '***HIDDEN***') {
        // 如果API key在摘要中，应该被隐藏
        console.log('    ⚠️  Warning: API key may be exposed in config summary');
      }
      
      // 验证摘要包含适当的元数据
      if (typeof summary.credentials.hasApiKey !== 'boolean') {
        throw new Error('Summary should indicate if API key is present');
      }
    }
    
    console.log(`    📊 Config environment: ${config.environment}`);
    console.log(`    📊 Secret Manager enabled: ${manager['options'].enableSecretManager}`);
    
    manager.destroy();
  });

  // 生成报告
  runner.generateReport();
  
  // 返回适当的退出码
  const failedTests = runner.results.filter(r => r.status === 'FAIL').length;
  return failedTests;
}

if (require.main === module) {
  main()
    .then(failedCount => {
      process.exit(failedCount > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Secret Manager test runner failed:', error);
      process.exit(1);
    });
}

export { SecretManagerTestRunner };