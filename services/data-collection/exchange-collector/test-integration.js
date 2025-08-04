#!/usr/bin/env node
/**
 * 简单的前后端集成测试脚本
 */

const http = require('http');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAPI(path, description) {
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
        if (res.statusCode === 200) {
          console.log(`✅ ${description}: OK (${res.statusCode})`);
          resolve({ success: true, data: data.substring(0, 100) });
        } else {
          console.log(`❌ ${description}: Failed (${res.statusCode})`);
          resolve({ success: false, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      console.log(`❌ ${description}: Error - ${err.message}`);
      resolve({ success: false, error: err.message });
    });

    req.setTimeout(5000, () => {
      console.log(`❌ ${description}: Timeout`);
      resolve({ success: false, error: 'timeout' });
    });

    req.end();
  });
}

async function runTests() {
  console.log('🚀 开始前后端集成测试...\n');
  
  // 等待后端服务启动
  console.log('等待后端服务启动...');
  await delay(3000);
  
  const tests = [
    { path: '/health', desc: '健康检查端点' },
    { path: '/api/stats', desc: '统计数据API' },
    { path: '/api/subscriptions', desc: '订阅管理API' },
    { path: '/api/pubsub/status', desc: 'PubSub状态API' },
  ];

  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const result = await testAPI(test.path, test.desc);
    if (result.success) {
      passed++;
    }
    await delay(500); // 避免请求过于频繁
  }
  
  console.log(`\n📊 测试结果: ${passed}/${total} 通过`);
  
  if (passed === total) {
    console.log('🎉 所有API端点测试通过！');
    return true;
  } else {
    console.log('⚠️  部分API端点测试失败，请检查后端服务');
    return false;
  }
}

// 运行测试
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});