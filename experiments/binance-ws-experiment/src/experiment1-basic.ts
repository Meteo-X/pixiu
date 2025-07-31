#!/usr/bin/env ts-node

import WebSocket from 'ws';
import { BinanceTradeStream, BinanceKlineStream, ExperimentStats } from './types';
import { log, calculateLatency, saveDataSample, saveExperimentStats, setupGracefulShutdown, formatBytes } from './utils';

// 实验1：基础 WebSocket 连接测试
// 目标：测试单个交易对的 trade 和 kline 数据流

const BINANCE_WS_URL = 'wss://stream.binance.com:9443';
const SYMBOL = 'btcusdt';  // 使用 BTC/USDT 交易对
const STREAMS = [
  `${SYMBOL}@trade`,      // 成交数据流
  `${SYMBOL}@kline_1m`,   // 1分钟 K线数据流
];

// 实验统计
const stats: ExperimentStats = {
  connectionStartTime: Date.now(),
  messagesReceived: 0,
  bytesReceived: 0,
  latencies: [],
  errors: [],
  dataPoints: {
    trades: 0,
    klines: 0,
  },
};

// 数据样本收集
const dataSamples = {
  trades: [] as BinanceTradeStream[],
  klines: [] as BinanceKlineStream[],
};

function connectWebSocket() {
  const wsUrl = `${BINANCE_WS_URL}/stream?streams=${STREAMS.join('/')}`;
  log(`Connecting to: ${wsUrl}`, 'info');
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    log('WebSocket connection established', 'info');
    log(`Subscribed to streams: ${STREAMS.join(', ')}`, 'info');
  });
  
  ws.on('message', (data: WebSocket.Data) => {
    try {
      const messageSize = Buffer.byteLength(data.toString());
      stats.bytesReceived += messageSize;
      stats.messagesReceived++;
      
      const message = JSON.parse(data.toString());
      
      // Combined stream 格式处理
      if (message.stream && message.data) {
        const streamData = message.data;
        
        // 计算延迟
        const latency = calculateLatency(streamData.E);
        stats.latencies.push(latency);
        
        // 处理不同类型的数据
        if (streamData.e === 'trade') {
          stats.dataPoints.trades++;
          handleTradeData(streamData as BinanceTradeStream);
          
          // 收集前10个样本
          if (dataSamples.trades.length < 10) {
            dataSamples.trades.push(streamData as BinanceTradeStream);
          }
        } else if (streamData.e === 'kline') {
          stats.dataPoints.klines++;
          handleKlineData(streamData as BinanceKlineStream);
          
          // 收集前10个样本
          if (dataSamples.klines.length < 10) {
            dataSamples.klines.push(streamData as BinanceKlineStream);
          }
        }
        
        // 每100条消息打印一次状态
        if (stats.messagesReceived % 100 === 0) {
          printStatus();
        }
      }
    } catch (error) {
      log(`Error parsing message: ${error}`, 'error');
      stats.errors.push({
        time: Date.now(),
        error: String(error),
      });
    }
  });
  
  ws.on('error', (error) => {
    log(`WebSocket error: ${error}`, 'error');
    stats.errors.push({
      time: Date.now(),
      error: String(error),
    });
  });
  
  ws.on('close', (code, reason) => {
    log(`WebSocket closed. Code: ${code}, Reason: ${reason}`, 'warn');
  });
  
  // Ping/Pong 处理
  ws.on('ping', () => {
    log('Received ping from server', 'info');
    ws.pong();
  });
  
  return ws;
}

function handleTradeData(trade: BinanceTradeStream) {
  const latency = calculateLatency(trade.E);
  log(`[TRADE] Symbol: ${trade.s}, Price: ${trade.p}, Quantity: ${trade.q}, Latency: ${latency}ms`, 'info');
}

function handleKlineData(kline: BinanceKlineStream) {
  const latency = calculateLatency(kline.E);
  const k = kline.k;
  log(`[KLINE] Symbol: ${k.s}, Interval: ${k.i}, Open: ${k.o}, Close: ${k.c}, Volume: ${k.v}, Closed: ${k.x}, Latency: ${latency}ms`, 'info');
}

function printStatus() {
  const runtime = (Date.now() - stats.connectionStartTime) / 1000;
  const avgLatency = stats.latencies.length > 0 
    ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length 
    : 0;
  
  console.log(`\n----- Status Update -----`);
  console.log(`Runtime: ${runtime.toFixed(2)}s`);
  console.log(`Messages: ${stats.messagesReceived}`);
  console.log(`Data received: ${formatBytes(stats.bytesReceived)}`);
  console.log(`Trades: ${stats.dataPoints.trades}`);
  console.log(`Klines: ${stats.dataPoints.klines}`);
  console.log(`Avg latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`Errors: ${stats.errors.length}`);
  console.log(`------------------------\n`);
}

// 主函数
function main() {
  log('Starting Binance WebSocket Experiment 1 - Basic Connection', 'info');
  
  const ws = connectWebSocket();
  
  // 设置优雅关闭
  setupGracefulShutdown(() => {
    ws.close();
    
    // 保存数据样本
    saveDataSample(dataSamples.trades, 'trade-samples.json');
    saveDataSample(dataSamples.klines, 'kline-samples.json');
    
    // 保存实验统计
    saveExperimentStats(stats, 'experiment1-basic');
  });
  
  // 运行30秒后自动停止
  setTimeout(() => {
    log('Experiment time limit reached (30s), shutting down...', 'warn');
    process.kill(process.pid, 'SIGINT'); // 使用 SIGINT 触发优雅关闭
  }, 30000);
}

// 运行实验
main();