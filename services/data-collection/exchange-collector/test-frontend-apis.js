#!/usr/bin/env node
/**
 * 测试前端页面会调用的所有API端点
 */

const http = require('http');

async function callAPI(path, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
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
          resolve({ 
            success: res.statusCode === 200, 
            data: json, 
            statusCode: res.statusCode,
            path: path
          });
        } catch (e) {
          resolve({ 
            success: false, 
            error: 'Invalid JSON', 
            statusCode: res.statusCode,
            raw: data.substring(0, 200),
            path: path
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message, path: path });
    });

    req.setTimeout(5000, () => {
      resolve({ success: false, error: 'timeout', path: path });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function testFrontendAPIs() {
  console.log('🧪 测试前端页面使用的API端点...\n');
  
  const tests = [
    { path: '/health', desc: '🏥 健康检查' },
    { path: '/api/stats', desc: '📊 实时统计数据' },
    { path: '/api/subscriptions', desc: '📡 订阅管理' },
    { path: '/api/pubsub/status', desc: '🔄 PubSub状态' },
  ];

  const results = [];
  
  for (const test of tests) {
    process.stdout.write(`${test.desc}: `);
    const result = await callAPI(test.path);
    
    if (result.success) {
      console.log('✅ 成功');
      
      // 显示关键数据
      if (test.path === '/api/stats' && result.data.adapters) {
        const binance = result.data.adapters.binance;
        if (binance) {
          console.log(`  📈 Binance状态: ${binance.status}, 运行时间: ${Math.round(binance.uptime/1000)}s`);
        }
      } else if (test.path === '/api/subscriptions' && result.data.subscriptions) {
        console.log(`  📊 活跃订阅: ${result.data.subscriptions.length}个`);
        result.data.subscriptions.forEach(sub => {
          const msgs = sub.metrics?.messagesReceived || 0;
          console.log(`    • ${sub.exchange}/${sub.symbol}: ${msgs} 消息`);
        });
      } else if (test.path === '/api/pubsub/status') {
        console.log(`  🔄 PubSub状态: ${result.data.enabled ? '启用' : '禁用'}`);
      }
    } else {
      console.log(`❌ 失败 (${result.statusCode || result.error})`);
      if (result.raw) {
        console.log(`  原始响应: ${result.raw}`);
      }
    }
    
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📋 API测试总结:');
  const passed = results.filter(r => r.success).length;
  console.log(`✅ 通过: ${passed}/${results.length}`);
  
  if (passed === results.length) {
    console.log('\n🎉 所有前端API端点测试通过！');
    console.log('📱 前端页面现在可以正常显示以下数据:');
    console.log('• 实时连接状态');
    console.log('• Binance交易数据统计');
    console.log('• 订阅管理信息');
    console.log('• 系统控制状态');
    console.log('\n🌐 在浏览器中访问: http://localhost:3000');
  } else {
    console.log('\n⚠️  部分API测试失败，前端功能可能受限');
  }
  
  return passed === results.length;
}

testFrontendAPIs().catch(console.error);