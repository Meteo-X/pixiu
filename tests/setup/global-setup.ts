/**
 * Jest全局设置
 * 在所有测试开始前运行
 */

import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('🚀 Setting up global test environment...');
  
  try {
    // 设置环境变量
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error'; // 测试时减少日志输出
    
    // 启动测试用的Pub/Sub模拟器
    console.log('📡 Starting Pub/Sub emulator...');
    process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
    
    // 检查Docker是否可用，如果可用则启动测试服务
    try {
      execSync('docker --version', { stdio: 'ignore' });
      console.log('🐳 Docker is available, starting test services...');
      
      // 启动测试数据库和Redis
      execSync('docker-compose -f ../deployment/docker-compose/docker-compose.test.yml up -d', {
        stdio: 'inherit',
        cwd: __dirname
      });
      
      // 等待服务启动
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.log('⚠️  Docker not available, using mock services for tests');
    }
    
    console.log('✅ Global setup completed');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}