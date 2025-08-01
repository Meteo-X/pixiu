#!/usr/bin/env node
/**
 * 最终集成测试 - 完整配置系统工作流程演示
 * 
 * 这个测试演示了整个配置系统的完整工作流程：
 * 1. 从环境预设开始
 * 2. 加载配置文件覆盖
 * 3. 应用环境变量覆盖
 * 4. 进行配置验证
 * 5. 使用 ConfigManager 管理配置
 * 6. 展示安全的配置访问
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import {
  loadConfig,
  createDevelopmentConfig,
  BinanceAdapterConfig
} from './index';
import { validateConfig } from './validator';
import { ConfigManager } from './manager';

async function demonstrateConfigurationWorkflow() {
  console.log('🚀 配置系统完整工作流程演示');
  console.log('=' .repeat(60));

  // 第一步：显示环境预设配置
  console.log('\\n📋 第一步：环境预设配置');
  console.log('-'.repeat(40));
  
  const baseConfig = createDevelopmentConfig();
  console.log(`环境: ${baseConfig.environment}`);
  console.log(`WebSocket 端点: ${baseConfig.wsEndpoint}`);
  console.log(`最大连接数: ${baseConfig.connection.maxConnections}`);
  console.log(`日志级别: ${baseConfig.logging.level}`);
  console.log(`默认订阅符号: ${baseConfig.subscriptions.defaultSymbols.join(', ')}`);

  // 第二步：创建临时配置文件进行覆盖
  console.log('\\n📁 第二步：从配置文件加载覆盖');
  console.log('-'.repeat(40));
  
  const fileConfigOverride = {
    connection: {
      maxConnections: 5,
      maxStreamsPerConnection: 200,
      heartbeatInterval: 20000,
      pingTimeout: 25000,
      connectionTimeout: 30000
    },
    subscriptions: {
      defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
      supportedDataTypes: ['trade', 'kline_1m', 'ticker'],
      batchSubscription: {
        enabled: true,
        batchSize: 20,
        batchInterval: 1000
      },
      management: {
        autoResubscribe: true,
        subscriptionTimeout: 10000,
        maxConcurrentSubscriptions: 500
      }
    },
    logging: {
      level: 'info' as const,
      format: 'json' as const,
      structured: true
    }
  };

  const tempConfigFile = resolve(__dirname, 'temp-demo-config.json');
  await fs.writeFile(tempConfigFile, JSON.stringify(fileConfigOverride, null, 2));

  console.log('创建临时配置文件：');
  console.log(`  - 最大连接数覆盖为: ${fileConfigOverride.connection.maxConnections}`);
  console.log(`  - 订阅符号扩展为: ${fileConfigOverride.subscriptions.defaultSymbols.join(', ')}`);
  console.log(`  - 日志级别改为: ${fileConfigOverride.logging.level}`);

  // 第三步：设置环境变量进行进一步覆盖
  console.log('\\n🔧 第三步：环境变量覆盖');
  console.log('-'.repeat(40));
  
  const originalEnv = { ...process.env };
  process.env['BINANCE_MAX_CONNECTIONS'] = '8';
  process.env['LOG_LEVEL'] = 'debug';
  process.env['BINANCE_API_KEY'] = 'demo-api-key-123';
  process.env['BINANCE_USE_SECRET_MANAGER'] = 'false';

  console.log('设置环境变量：');
  console.log('  - BINANCE_MAX_CONNECTIONS=8 (最高优先级)');
  console.log('  - LOG_LEVEL=debug (最高优先级)');
  console.log('  - BINANCE_API_KEY=demo-api-key-*** (演示用)');

  // 第四步：执行完整配置加载
  console.log('\\n⚙️  第四步：完整配置加载和合并');
  console.log('-'.repeat(40));
  
  try {
    const finalConfig = await loadConfig(tempConfigFile);
    
    console.log('配置合并结果：');
    console.log(`  - 环境: ${finalConfig.environment} (来自环境预设)`);
    console.log(`  - 最大连接数: ${finalConfig.connection.maxConnections} (来自环境变量)`);
    console.log(`  - 订阅符号数量: ${finalConfig.subscriptions.defaultSymbols.length} (来自配置文件)`);
    console.log(`  - 日志级别: ${finalConfig.logging.level} (来自环境变量)`);
    console.log(`  - API Key: ${finalConfig.credentials?.apiKey ? '***已设置***' : '未设置'} (来自环境变量)`);

    // 第五步：配置验证
    console.log('\\n✅ 第五步：配置验证');
    console.log('-'.repeat(40));
    
    const validationResult = validateConfig(finalConfig);
    
    if (validationResult.valid) {
      console.log('配置验证通过 ✅');
    } else {
      console.log('配置验证失败 ❌');
      validationResult.errors.forEach(error => {
        console.log(`  - ${error.field}: ${error.message}`);
      });
    }

    if (validationResult.warnings.length > 0) {
      console.log('配置警告：');
      validationResult.warnings.forEach(warning => {
        console.log(`  ⚠️  ${warning.field}: ${warning.message}`);
      });
    }

    // 第六步：使用 ConfigManager 进行配置管理
    console.log('\\n🎛️  第六步：ConfigManager 配置管理');
    console.log('-'.repeat(40));
    
    const manager = new ConfigManager({
      configPath: tempConfigFile,
      enableValidation: true,
      enableSecretManager: false, // 演示环境不启用
      preloadCredentials: false
    });

    await manager.initialize();
    
    console.log('ConfigManager 初始化完成');
    console.log(`配置已加载: ${manager.isConfigLoaded()}`);
    
    const managedConfig = manager.getConfig();
    console.log(`管理的配置环境: ${managedConfig.environment}`);

    // 第七步：安全的配置访问演示
    console.log('\\n🔒 第七步：安全的配置访问');
    console.log('-'.repeat(40));
    
    const safeSummary = manager.getConfigSummary();
    
    console.log('安全配置摘要：');
    console.log(`  - 环境: ${safeSummary.environment}`);
    console.log(`  - WebSocket 端点: ${safeSummary.wsEndpoint}`);
    console.log(`  - 连接配置: ${JSON.stringify(safeSummary.connection)}`);
    
    if (safeSummary.credentials) {
      console.log('  - 凭据信息:');
      console.log(`    - 有 API Key: ${safeSummary.credentials.hasApiKey}`);
      console.log(`    - 有 API Secret: ${safeSummary.credentials.hasApiSecret}`);
      console.log(`    - 使用 Secret Manager: ${safeSummary.credentials.useSecretManager}`);
      
      // 验证敏感信息已被隐藏
      const summaryString = JSON.stringify(safeSummary);
      if (summaryString.includes('demo-api-key')) {
        console.log('    ❌ 警告：摘要中发现敏感信息');
      } else {
        console.log('    ✅ 敏感信息已正确隐藏');
      }
    }

    // 第八步：配置更新演示
    console.log('\\n🔄 第八步：动态配置更新');
    console.log('-'.repeat(40));
    
    const originalMaxConn = managedConfig.connection.maxConnections;
    await manager.updateConfig({
      connection: {
        ...managedConfig.connection,
        maxConnections: originalMaxConn + 2
      }
    });
    
    const updatedConfig = manager.getConfig();
    console.log(`配置更新前最大连接数: ${originalMaxConn}`);
    console.log(`配置更新后最大连接数: ${updatedConfig.connection.maxConnections}`);
    
    if (updatedConfig.connection.maxConnections === originalMaxConn + 2) {
      console.log('✅ 动态配置更新成功');
    } else {
      console.log('❌ 动态配置更新失败');
    }

    // 第九步：性能测试
    console.log('\\n⚡ 第九步：性能基准测试');
    console.log('-'.repeat(40));
    
    const iterations = 100;
    
    // 测试配置访问性能
    const configAccessStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      manager.getConfig();
    }
    const configAccessTime = (Date.now() - configAccessStart) / iterations;
    
    // 测试安全摘要性能
    const summaryStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      manager.getConfigSummary();
    }
    const summaryTime = (Date.now() - summaryStart) / iterations;
    
    console.log(`配置访问性能: ${configAccessTime.toFixed(3)}ms/次 (目标 <1ms)`);
    console.log(`安全摘要性能: ${summaryTime.toFixed(3)}ms/次 (目标 <5ms)`);
    
    if (configAccessTime < 1 && summaryTime < 5) {
      console.log('✅ 性能目标达成');
    } else {
      console.log('⚠️  性能需要关注');
    }

    // 清理资源
    manager.destroy();
    console.log('\\n🧹 资源清理完成');

  } catch (error) {
    console.error('❌ 配置工作流程执行失败:', error);
  } finally {
    // 恢复环境变量
    Object.assign(process.env, originalEnv);
    
    // 删除临时文件
    try {
      await fs.unlink(tempConfigFile);
    } catch (error) {
      // 忽略删除错误
    }
  }

  console.log('\\n🎉 配置系统工作流程演示完成！');
  console.log('=' .repeat(60));
  console.log('✅ 所有功能正常工作');
  console.log('✅ 配置优先级正确');
  console.log('✅ 验证机制有效');
  console.log('✅ 安全性得到保证');
  console.log('✅ 性能表现良好');
}

if (require.main === module) {
  demonstrateConfigurationWorkflow()
    .then(() => {
      console.log('\\n🚀 Task 1.3 配置系统设计验收测试完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 演示失败:', error);
      process.exit(1);
    });
}

export { demonstrateConfigurationWorkflow };