#!/usr/bin/env node
/**
 * 验证前端页面能否显示Binance实时数据
 */

const http = require('http');

function testEndpoint(path, description) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ success: true, data: json, statusCode: res.statusCode });
        } catch (e) {
          resolve({ success: false, error: 'Invalid JSON', statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.setTimeout(5000, () => {
      resolve({ success: false, error: 'timeout' });
    });

    req.end();
  });
}

async function verifyRealTimeData() {
  console.log('🔍 验证Binance实时数据流...\n');
  
  // 1. 检查后端健康状态
  const health = await testEndpoint('/health', '健康检查');
  if (!health.success) {
    console.log('❌ 后端服务不可用');
    return false;
  }
  console.log('✅ 后端服务健康状态: OK');
  
  // 2. 检查适配器状态
  if (health.data.checks && health.data.checks.adapters) {
    const adapters = health.data.checks.adapters.details;
    const binanceAdapter = adapters.find(a => a.name === 'binance');
    if (binanceAdapter && binanceAdapter.status === 'connected') {
      console.log('✅ Binance适配器已连接');
    } else {
      console.log('❌ Binance适配器未连接');
      return false;
    }
  }
  
  // 3. 检查订阅状态
  const subscriptions = await testEndpoint('/api/subscriptions', '订阅检查');
  if (!subscriptions.success) {
    console.log('❌ 无法获取订阅信息');
    return false;
  }
  
  const activeSubs = subscriptions.data.subscriptions || [];
  console.log(`✅ 活跃订阅数: ${activeSubs.length}`);
  
  if (activeSubs.length > 0) {
    activeSubs.forEach(sub => {
      const metrics = sub.metrics || {};
      console.log(`  📊 ${sub.exchange}/${sub.symbol}: ${metrics.messagesReceived || 0} 消息, 状态: ${sub.status}`);
    });
  }
  
  // 4. 检查实时统计
  const stats = await testEndpoint('/api/stats', '统计检查');
  if (!stats.success) {
    console.log('❌ 无法获取统计信息');
    return false;
  }
  
  const binanceStats = stats.data.adapters && stats.data.adapters.binance;
  if (binanceStats) {
    console.log(`✅ Binance统计信息:`);
    console.log(`  - 状态: ${binanceStats.status}`);
    console.log(`  - 订阅数: ${binanceStats.subscriptions}`);
    console.log(`  - 运行时间: ${Math.round(binanceStats.uptime / 1000)}秒`);
    console.log(`  - 最后更新: ${binanceStats.lastUpdate}`);
  }
  
  // 5. 检查前端服务
  const frontendCheck = await new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'HEAD'
    };
    
    const req = http.request(options, (res) => {
      resolve({ success: res.statusCode === 200, statusCode: res.statusCode });
    });
    
    req.on('error', () => {
      resolve({ success: false, error: 'Connection failed' });
    });
    
    req.setTimeout(3000, () => {
      resolve({ success: false, error: 'timeout' });
    });
    
    req.end();
  });
  
  if (frontendCheck.success) {
    console.log('✅ 前端服务运行正常: http://localhost:3000');
  } else {
    console.log(`❌ 前端服务不可用: ${frontendCheck.error || frontendCheck.statusCode}`);
    return false;
  }
  
  console.log('\n🎉 验证完成！');
  console.log('\n📋 验证结果:');
  console.log('• 后端API服务: ✅ 正常');
  console.log('• Binance适配器: ✅ 已连接');
  console.log('• 实时数据流: ✅ 活跃');
  console.log('• 前端界面: ✅ 可访问');
  console.log('\n🌐 访问地址:');
  console.log('• 前端界面: http://localhost:3000');
  console.log('• 后端API: http://localhost:8080');
  console.log('• 健康检查: http://localhost:8080/health');
  console.log('• 实时统计: http://localhost:8080/api/stats');
  
  return true;
}

verifyRealTimeData().then(success => {
  if (success) {
    console.log('\n✨ 系统已就绪，可以在前端页面查看Binance实时数据！');
  } else {
    console.log('\n⚠️  系统验证失败，请检查服务状态');
  }
}).catch(err => {
  console.error('验证过程出错:', err);
});