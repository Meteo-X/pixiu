/**
 * WebSocket连接测试脚本
 */

const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws');

ws.on('open', function open() {
  console.log('✅ WebSocket连接已建立');
  console.log('📡 正在等待数据...\n');
});

ws.on('message', function message(data) {
  try {
    const parsedData = JSON.parse(data);
    console.log('📨 收到消息:', JSON.stringify(parsedData, null, 2));
    
    // 验证数据格式
    if (parsedData.type && parsedData.payload) {
      console.log('✅ 消息格式正确');
      
      const payload = parsedData.payload;
      if (payload.exchange && payload.symbol && payload.data) {
        console.log('✅ 数据载荷格式正确');
        console.log(`   交易所: ${payload.exchange}`);
        console.log(`   交易对: ${payload.symbol}`);
        console.log(`   数据类型: ${payload.type || 'unknown'}`);
        console.log(`   时间戳: ${payload.timestamp}`);
      } else {
        console.log('❌ 数据载荷格式不正确');
      }
    } else {
      console.log('❌ 消息格式不正确');
    }
    console.log('---');
    
    // 接收5条消息后关闭连接
    if (ws.messageCount === undefined) {
      ws.messageCount = 0;
    }
    ws.messageCount++;
    
    if (ws.messageCount >= 5) {
      console.log('📊 已接收5条消息，测试完成');
      ws.close();
    }
    
  } catch (error) {
    console.error('❌ JSON解析错误:', error.message);
    console.log('原始数据:', data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket错误:', err.message);
});

ws.on('close', function close() {
  console.log('🔌 WebSocket连接已关闭');
  process.exit(0);
});

// 10秒超时
setTimeout(() => {
  console.log('⏰ 测试超时，关闭连接');
  ws.close();
}, 10000);