/**
 * Exchange Collector 独立运行版本
 * 绕过workspace依赖，提供基本的Web服务和API
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { PubSub } from '@google-cloud/pubsub';
import { BinanceConnector, BinanceMarketData } from './binance-connector';

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'exchange-collector'
  });
});

// 真实数据统计
let messageCount = 0;
let bytesReceived = 0;
const startTime = Date.now();

// PubSub配置
const pubsubClient = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'pixiu-trading-dev'
});
let pubsubEnabled = true;
let pubsubMessageCount = 0;

// API路由
app.get('/api/status', (_req, res) => {
  const subscribedStreams = binanceConnector.getSubscribedStreams();
  const isConnected = binanceConnector.isConnectedToBinance();
  
  res.json({
    status: 'running',
    mode: 'standalone',
    activeAdapters: isConnected ? 1 : 0,
    totalSubscriptions: subscribedStreams.length,
    systemHealth: binanceStatus === 'connected' ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    binanceStatus: binanceStatus,
    messagesReceived: messageCount
  });
});

app.get('/api/adapters', (_req, res) => {
  const isConnected = binanceConnector.isConnectedToBinance();
  const subscribedStreams = binanceConnector.getSubscribedStreams();
  
  const adapters = [{
    name: 'binance',
    status: binanceStatus,
    lastUpdate: lastBinanceData ? new Date(lastBinanceData.timestamp).toISOString() : new Date().toISOString(),
    subscriptions: subscribedStreams.length,
    isHealthy: isConnected,
    connectionStatus: binanceStatus,
    metrics: {
      messagesReceived: messageCount,
      bytesReceived: bytesReceived,
      errorsCount: 0,
      uptime: process.uptime()
    },
    subscribedStreams: subscribedStreams
  }];
  
  res.json({
    adapters: adapters,
    total: adapters.length,
    active: adapters.filter(a => a.status === 'connected').length
  });
});

app.get('/api/subscriptions', (_req, res) => {
  const subscribedStreams = binanceConnector.getSubscribedStreams();
  const subscriptions = subscribedStreams.map(stream => {
    const [symbol, type] = stream.split('@');
    return {
      symbol: symbol.toUpperCase(),
      type: type,
      status: binanceStatus === 'connected' ? 'active' : 'inactive',
      exchange: 'binance'
    };
  });
  
  res.json({
    subscriptions: subscriptions,
    total: subscriptions.length,
    active: subscriptions.filter((s: any) => s.status === 'active').length
  });
});

app.get('/api/subscriptions/stats', (_req, res) => {
  const subscribedStreams = binanceConnector.getSubscribedStreams();
  const byType = subscribedStreams.reduce((acc, stream) => {
    const type = stream.split('@')[1];
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  res.json({
    total: subscribedStreams.length,
    byExchange: { binance: subscribedStreams.length },
    byType: byType,
    activeConnections: binanceConnector.isConnectedToBinance() ? 1 : 0
  });
});

// WebSocket服务器信息
app.get('/api/websocket/status', (_req, res) => {
  res.json({
    status: 'available',
    port: port,
    clients: wsClients.size,
    endpoint: '/ws'
  });
});

// PubSub API路由 (真实PubSub集成)
app.get('/api/pubsub/status', (_req, res) => {
  res.json({
    status: {
      enabled: pubsubEnabled,
      connected: binanceConnector.isConnectedToBinance(),
      topicsCount: 7,
      messagesPublished: pubsubMessageCount,
      lastPublished: lastBinanceData ? new Date(lastBinanceData.timestamp).toISOString() : null,
      errorCount: 0,
      config: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT || 'pixiu-trading-dev',
        useEmulator: false,
        topicPrefix: 'market-data'
      }
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/api/pubsub/toggle', (req, res) => {
  const { enabled, reason } = req.body;
  pubsubEnabled = enabled;
  
  res.json({
    success: true,
    message: `PubSub has been ${enabled ? 'enabled' : 'disabled'}${reason ? ` (${reason})` : ''}`,
    status: {
      enabled: pubsubEnabled,
      connected: binanceConnector.isConnectedToBinance(),
      topicsCount: 7,
      messagesPublished: pubsubMessageCount,
      lastPublished: lastBinanceData ? new Date(lastBinanceData.timestamp).toISOString() : null,
      errorCount: 0,
      config: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT || 'pixiu-trading-dev',
        useEmulator: false,
        topicPrefix: 'market-data'
      }
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/api/pubsub/topics', (_req, res) => {
  const subscribedStreams = binanceConnector.getSubscribedStreams();
  const topics = subscribedStreams.map(stream => {
    const [symbol, type] = stream.split('@');
    return {
      name: `market-data-${symbol}-${type}`,
      symbol: symbol.toUpperCase(),
      type: type,
      messagesPublished: Math.floor(pubsubMessageCount / subscribedStreams.length),
      lastMessage: lastBinanceData ? new Date(lastBinanceData.timestamp).toISOString() : null,
      status: pubsubEnabled ? 'active' : 'disabled'
    };
  });

  res.json({
    topics: topics,
    total: topics.length,
    active: topics.filter(t => t.status === 'active').length,
    timestamp: new Date().toISOString()
  });
});

// 统计信息
app.get('/api/stats', (_req, res) => {
  const memoryInfo = process.memoryUsage();
  const isConnected = binanceConnector.isConnectedToBinance();
  const subscribedStreams = binanceConnector.getSubscribedStreams();
  
  res.json({
    adapters: {
      binance: {
        status: binanceStatus,
        subscriptions: subscribedStreams.length,
        messagesPerSecond: messageCount > 0 ? ((messageCount * 1000) / (Date.now() - startTime)).toFixed(1) : '0.0',
        bytesPerSecond: bytesReceived > 0 ? ((bytesReceived * 1000) / (Date.now() - startTime)).toFixed(0) : '0',
        errorRate: 0,
        uptime: process.uptime(),
        lastUpdate: lastBinanceData ? new Date(lastBinanceData.timestamp).toISOString() : new Date().toISOString(),
        subscribedStreams: subscribedStreams
      }
    },
    system: {
      totalSubscriptions: subscribedStreams.length,
      totalAdapters: 1,
      activeAdapters: isConnected ? 1 : 0,
      totalMessagesReceived: messageCount,
      totalBytesReceived: bytesReceived,
      systemUptime: process.uptime(),
      memoryUsage: {
        used: memoryInfo.heapUsed,
        total: memoryInfo.heapTotal,
        percentage: Math.round((memoryInfo.heapUsed / memoryInfo.heapTotal) * 100)
      }
    },
    cache: {
      totalEntries: 0,
      hitRate: 0,
      memoryUsage: 0,
      keyCount: 0
    },
    timestamp: new Date().toISOString()
  });
});

// 服务前端应用
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// WebSocket客户端管理
const wsClients = new Set<any>();

// 创建Binance连接器
const binanceConnector = new BinanceConnector();
let binanceStatus = 'disconnected';
let lastBinanceData: BinanceMarketData | null = null;

// 创建HTTP服务器
const server = createServer(app);

// 创建WebSocket服务器
const wss = new WebSocketServer({ 
  server, 
  path: '/ws'
});

// 设置Binance连接器事件监听
binanceConnector.on('connected', () => {
  binanceStatus = 'connected';
  console.log('🟢 Binance connector is now connected');
  
  // 通知所有WebSocket客户端
  broadcastToClients({
    type: 'binance_status',
    timestamp: new Date().toISOString(),
    status: 'connected',
    message: 'Connected to Binance real-time data stream'
  });
});

binanceConnector.on('disconnected', () => {
  binanceStatus = 'disconnected';
  console.log('🔴 Binance connector disconnected');
  
  // 通知所有WebSocket客户端
  broadcastToClients({
    type: 'binance_status',
    timestamp: new Date().toISOString(),
    status: 'disconnected',
    message: 'Disconnected from Binance data stream'
  });
});

binanceConnector.on('data', (marketData: BinanceMarketData) => {
  lastBinanceData = marketData;
  
  // 更新统计数据
  messageCount++;
  const messageSize = JSON.stringify(marketData).length;
  bytesReceived += messageSize;
  
  // 发布到Google Cloud PubSub
  if (pubsubEnabled) {
    publishToPubSub(marketData).catch(error => {
      console.error('❌ Failed to publish to PubSub:', error);
    });
  }
  
  // 转发真实市场数据给WebSocket客户端
  broadcastToClients({
    type: marketData.type,
    timestamp: new Date(marketData.timestamp).toISOString(),
    exchange: marketData.exchange,
    symbol: marketData.symbol,
    price: marketData.price.toString(),
    volume: marketData.volume?.toString() || '0',
    side: marketData.side,
    change24h: marketData.change24h?.toString(),
    data: {
      high24h: marketData.high24h?.toString(),
      low24h: marketData.low24h?.toString(),
      tradeId: marketData.tradeId
    }
  });
  
  // 每100条消息记录一次
  if (messageCount % 100 === 0) {
    console.log(`📊 Received ${messageCount} messages from Binance (${(bytesReceived / 1024).toFixed(1)}KB total)`);
    console.log(`📡 Published ${pubsubMessageCount} messages to PubSub`);
  }
});

binanceConnector.on('error', (error) => {
  console.error('❌ Binance connector error:', error);
  binanceStatus = 'error';
  
  // 通知所有WebSocket客户端
  broadcastToClients({
    type: 'binance_status',
    timestamp: new Date().toISOString(),
    status: 'error',
    message: `Binance connection error: ${error.message}`
  });
});

// 广播消息给所有WebSocket客户端
function broadcastToClients(message: any) {
  const messageStr = JSON.stringify(message);
  wsClients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(messageStr);
    }
  });
}

// 发布到Google Cloud PubSub
async function publishToPubSub(marketData: BinanceMarketData) {
  try {
    const topicName = `market-data-${marketData.symbol.toLowerCase()}-${marketData.type}`;
    
    // 准备PubSub消息
    const pubsubMessage = {
      exchange: marketData.exchange,
      symbol: marketData.symbol,
      type: marketData.type,
      timestamp: marketData.timestamp,
      price: marketData.price,
      volume: marketData.volume,
      side: marketData.side,
      change24h: marketData.change24h,
      high24h: marketData.high24h,
      low24h: marketData.low24h,
      tradeId: marketData.tradeId
    };
    
    // 发布消息
    const messageId = await pubsubClient
      .topic(topicName)
      .publishMessage({
        data: Buffer.from(JSON.stringify(pubsubMessage)),
        attributes: {
          exchange: marketData.exchange,
          symbol: marketData.symbol,
          type: marketData.type,
          timestamp: marketData.timestamp.toString()
        }
      });
    
    pubsubMessageCount++;
    
    // 每50条PubSub消息记录一次
    if (pubsubMessageCount % 50 === 0) {
      console.log(`📡 Published message ${pubsubMessageCount} to topic ${topicName} (messageId: ${messageId})`);
    }
  } catch (error) {
    console.error('❌ PubSub publish error:', error);
    throw error;
  }
}

wss.on('connection', (ws, req) => {
  console.log(`🔌 WebSocket client connected from ${req.socket.remoteAddress}`);
  wsClients.add(ws);

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Exchange Collector WebSocket',
    timestamp: new Date().toISOString()
  }));

  // 发送初始状态信息
  ws.send(JSON.stringify({
    type: 'binance_status',
    timestamp: new Date().toISOString(),
    status: binanceStatus,
    message: `Binance connector status: ${binanceStatus}`
  }));

  // 如果有最新的Binance数据，发送给新连接的客户端
  if (lastBinanceData) {
    ws.send(JSON.stringify({
      type: lastBinanceData.type,
      timestamp: new Date(lastBinanceData.timestamp).toISOString(),
      exchange: lastBinanceData.exchange,
      symbol: lastBinanceData.symbol,
      price: lastBinanceData.price.toString(),
      volume: lastBinanceData.volume?.toString() || '0',
      side: lastBinanceData.side,
      change24h: lastBinanceData.change24h?.toString(),
      data: {
        high24h: lastBinanceData.high24h?.toString(),
        low24h: lastBinanceData.low24h?.toString(),
        tradeId: lastBinanceData.tradeId
      }
    }));
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📨 Received message:', data);
      
      // 回复确认
      ws.send(JSON.stringify({
        type: 'ack',
        originalType: data.type,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    wsClients.delete(ws);
  });
});

// 启动Binance连接器
binanceConnector.connect().then(() => {
  console.log('✅ Binance connector initialized successfully');
}).catch(error => {
  console.error('❌ Failed to initialize Binance connector:', error);
});

// 启动服务器
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Exchange Collector (Standalone) running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🌐 Web interface: http://localhost:${port}`);
  console.log(`📡 API base: http://localhost:${port}/api`);
  console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/ws`);
  console.log(`🔗 Connecting to Binance real-time data streams...`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  binanceConnector.disconnect();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  binanceConnector.disconnect();
  process.exit(0);
});