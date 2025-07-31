#!/usr/bin/env ts-node

import WebSocket from 'ws';
import { BinanceTradeStream, BinanceKlineStream, BinanceCombinedStream, ExperimentStats, KlineInterval } from './types';
import { log, calculateLatency, saveDataSample, saveExperimentStats, setupGracefulShutdown, formatBytes } from './utils';

// 实验2：多流测试
// 目标：测试多个交易对和不同时间粒度的 K 线数据

const BINANCE_WS_URL = 'wss://stream.binance.com:9443';

// 测试多个主流交易对
const SYMBOLS = ['btcusdt', 'ethusdt', 'bnbusdt'];

// 测试不同的 K 线时间间隔
const KLINE_INTERVALS: KlineInterval[] = ['1m', '5m', '1h'];

// 构建所有流
const STREAMS: string[] = [];
SYMBOLS.forEach(symbol => {
  // 每个交易对的成交流
  STREAMS.push(`${symbol}@trade`);
  
  // 每个交易对的不同时间间隔 K 线
  KLINE_INTERVALS.forEach(interval => {
    STREAMS.push(`${symbol}@kline_${interval}`);
  });
});

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

// 详细统计
const detailedStats = {
  bySymbol: {} as Record<string, { trades: number; klines: number }>,
  byInterval: {} as Record<string, number>,
  messageRates: [] as Array<{ time: number; rate: number }>,
};

// 初始化详细统计
SYMBOLS.forEach(symbol => {
  detailedStats.bySymbol[symbol.toUpperCase()] = { trades: 0, klines: 0 };
});
KLINE_INTERVALS.forEach(interval => {
  detailedStats.byInterval[interval] = 0;
});

// 数据样本收集
const dataSamples = {
  trades: {} as Record<string, BinanceTradeStream[]>,
  klines: {} as Record<string, BinanceKlineStream[]>,
};

// 消息速率计算
let lastMessageCount = 0;
let lastRateCheckTime = Date.now();

function connectWebSocket() {
  const wsUrl = `${BINANCE_WS_URL}/stream?streams=${STREAMS.join('/')}`;
  log(`Connecting to: ${wsUrl}`, 'info');
  log(`Total streams: ${STREAMS.length} (${SYMBOLS.length} symbols × ${1 + KLINE_INTERVALS.length} stream types)`, 'info');
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    log('WebSocket connection established', 'info');
    log(`Subscribed symbols: ${SYMBOLS.join(', ')}`, 'info');
    log(`Kline intervals: ${KLINE_INTERVALS.join(', ')}`, 'info');
    
    // 开始消息速率监控
    setInterval(calculateMessageRate, 1000);
  });
  
  ws.on('message', (data: WebSocket.Data) => {
    try {
      const messageSize = Buffer.byteLength(data.toString());
      stats.bytesReceived += messageSize;
      stats.messagesReceived++;
      
      const message: BinanceCombinedStream<any> = JSON.parse(data.toString());
      
      if (message.stream && message.data) {
        const streamData = message.data;
        
        // 计算延迟
        const latency = calculateLatency(streamData.E);
        stats.latencies.push(latency);
        
        // 处理不同类型的数据
        if (streamData.e === 'trade') {
          handleTradeData(streamData as BinanceTradeStream, message.stream);
        } else if (streamData.e === 'kline') {
          handleKlineData(streamData as BinanceKlineStream, message.stream);
        }
        
        // 每500条消息打印一次状态
        if (stats.messagesReceived % 500 === 0) {
          printDetailedStatus();
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
    ws.pong();
  });
  
  return ws;
}

function handleTradeData(trade: BinanceTradeStream, _stream: string) {
  stats.dataPoints.trades++;
  const symbol = trade.s;
  
  // 更新详细统计
  if (detailedStats.bySymbol[symbol]) {
    detailedStats.bySymbol[symbol].trades++;
  }
  
  // 收集样本（每个交易对最多10个）
  if (!dataSamples.trades[symbol]) {
    dataSamples.trades[symbol] = [];
  }
  if (dataSamples.trades[symbol].length < 10) {
    dataSamples.trades[symbol].push(trade);
  }
  
  // 只记录前几个交易，避免日志过多
  if (stats.dataPoints.trades <= 10) {
    const latency = calculateLatency(trade.E);
    log(`[TRADE] ${symbol}: Price=${trade.p}, Qty=${trade.q}, Latency=${latency}ms`, 'info');
  }
}

function handleKlineData(kline: BinanceKlineStream, _stream: string) {
  stats.dataPoints.klines++;
  const symbol = kline.s;
  const interval = kline.k.i;
  
  // 更新详细统计
  if (detailedStats.bySymbol[symbol]) {
    detailedStats.bySymbol[symbol].klines++;
  }
  detailedStats.byInterval[interval]++;
  
  // 收集样本（每个交易对每个时间间隔最多5个）
  const key = `${symbol}_${interval}`;
  if (!dataSamples.klines[key]) {
    dataSamples.klines[key] = [];
  }
  if (dataSamples.klines[key].length < 5) {
    dataSamples.klines[key].push(kline);
  }
  
  // 只记录已关闭的 K 线
  if (kline.k.x) {
    const latency = calculateLatency(kline.E);
    log(`[KLINE CLOSED] ${symbol} ${interval}: O=${kline.k.o}, C=${kline.k.c}, V=${kline.k.v}, Latency=${latency}ms`, 'info');
  }
}

function calculateMessageRate() {
  const now = Date.now();
  const timeDiff = (now - lastRateCheckTime) / 1000; // 秒
  const messageCount = stats.messagesReceived;
  const rate = (messageCount - lastMessageCount) / timeDiff;
  
  detailedStats.messageRates.push({ time: now, rate });
  
  lastMessageCount = messageCount;
  lastRateCheckTime = now;
}

function printDetailedStatus() {
  const runtime = (Date.now() - stats.connectionStartTime) / 1000;
  const avgLatency = stats.latencies.length > 0 
    ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length 
    : 0;
  
  // 计算最近的消息速率
  const recentRates = detailedStats.messageRates.slice(-10);
  const avgRate = recentRates.length > 0
    ? recentRates.reduce((a, b) => a + b.rate, 0) / recentRates.length
    : 0;
  
  console.log(`\n========== Detailed Status Update ==========`);
  console.log(`Runtime: ${runtime.toFixed(2)}s`);
  console.log(`Total messages: ${stats.messagesReceived}`);
  console.log(`Data received: ${formatBytes(stats.bytesReceived)}`);
  console.log(`Average message rate: ${avgRate.toFixed(2)} msg/s`);
  console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`\nData by type:`);
  console.log(`  - Trades: ${stats.dataPoints.trades}`);
  console.log(`  - Klines: ${stats.dataPoints.klines}`);
  
  console.log(`\nData by symbol:`);
  Object.entries(detailedStats.bySymbol).forEach(([symbol, data]) => {
    console.log(`  - ${symbol}: ${data.trades} trades, ${data.klines} klines`);
  });
  
  console.log(`\nKlines by interval:`);
  Object.entries(detailedStats.byInterval).forEach(([interval, count]) => {
    console.log(`  - ${interval}: ${count} updates`);
  });
  
  console.log(`\nErrors: ${stats.errors.length}`);
  console.log(`==========================================\n`);
}

// 主函数
function main() {
  log('Starting Binance WebSocket Experiment 2 - Multi-Stream Test', 'info');
  
  const ws = connectWebSocket();
  
  // 设置优雅关闭
  setupGracefulShutdown(() => {
    ws.close();
    
    // 保存数据样本
    saveDataSample(dataSamples.trades, 'multi-trade-samples.json');
    saveDataSample(dataSamples.klines, 'multi-kline-samples.json');
    
    // 保存详细统计
    saveDataSample(detailedStats, 'multi-detailed-stats.json');
    
    // 保存实验统计
    saveExperimentStats(stats, 'experiment2-multi');
  });
  
  // 运行60秒后自动停止（多流需要更长时间观察）
  setTimeout(() => {
    log('Experiment time limit reached (60s), shutting down...', 'warn');
    process.kill(process.pid, 'SIGINT');
  }, 60000);
}

// 运行实验
main();