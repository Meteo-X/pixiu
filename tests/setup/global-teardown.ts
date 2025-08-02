/**
 * Jest全局清理
 * 在所有测试结束后运行
 */

import { execSync } from 'child_process';

export default async function globalTeardown() {
  console.log('🧹 Cleaning up global test environment...');
  
  try {
    // 停止测试服务
    try {
      execSync('docker-compose -f ../deployment/docker-compose/docker-compose.test.yml down', {
        stdio: 'inherit',
        cwd: __dirname
      });
    } catch (error) {
      // Docker服务可能不存在，忽略错误
    }
    
    console.log('✅ Global teardown completed');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // 不抛出错误，避免影响测试结果
  }
}