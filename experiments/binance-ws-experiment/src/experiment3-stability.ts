#!/usr/bin/env ts-node

import WebSocket from 'ws';
import { BinanceCombinedStream } from './types';
import { log, calculateLatency, saveDataSample, setupGracefulShutdown, formatBytes, colors } from './utils';

// 实验3：稳定性和重连测试
// 目标：测试长时间运行的稳定性、断线重连机制、延迟分析

const BINANCE_WS_URL = 'wss://stream.binance.com:9443';
const SYMBOL = 'btcusdt';
const STREAMS = [
  `${SYMBOL}@trade`,
  `${SYMBOL}@kline_1m`,
  `${SYMBOL}@kline_5m`,
];

// 连接统计
interface ConnectionStats {
  connectionAttempts: number;
  successfulConnections: number;
  connectionFailures: number;
  disconnections: number;
  reconnectDelays: number[];
  connectionDurations: number[];
  currentConnectionStart?: number;
}

// 延迟统计
interface LatencyStats {
  latencies: number[];
  buckets: {
    under50ms: number;
    under100ms: number;
    under200ms: number;
    under500ms: number;
    over500ms: number;
  };
  percentiles?: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

// 实验统计
const experimentStats = {
  startTime: Date.now(),
  messagesReceived: 0,
  bytesReceived: 0,
  errors: [] as Array<{ time: number; error: string }>,
  connectionStats: {
    connectionAttempts: 0,
    successfulConnections: 0,
    connectionFailures: 0,
    disconnections: 0,
    reconnectDelays: [],
    connectionDurations: [],
  } as ConnectionStats,
  latencyStats: {
    latencies: [],
    buckets: {
      under50ms: 0,
      under100ms: 0,
      under200ms: 0,
      under500ms: 0,
      over500ms: 0,
    },
  } as LatencyStats,
  dataGaps: [] as Array<{ start: number; end: number; duration: number }>,
};

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let lastMessageTime = Date.now();
let gapDetectionTimer: NodeJS.Timeout | null = null;

// 重连配置
const RECONNECT_CONFIG = {
  initialDelay: 1000,      // 初始延迟 1 秒
  maxDelay: 30000,         // 最大延迟 30 秒
  backoffMultiplier: 1.5,  // 退避倍数
  maxRetries: 100,         // 最大重试次数
};

let currentReconnectDelay = RECONNECT_CONFIG.initialDelay;
let reconnectAttempt = 0;

function connectWebSocket() {
  if (isShuttingDown) return;
  
  experimentStats.connectionStats.connectionAttempts++;
  const connectionStartTime = Date.now();
  
  const wsUrl = `${BINANCE_WS_URL}/stream?streams=${STREAMS.join('/')}`;
  log(`Connection attempt #${experimentStats.connectionStats.connectionAttempts} to: ${wsUrl}`, 'info');
  
  ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    experimentStats.connectionStats.successfulConnections++;
    experimentStats.connectionStats.currentConnectionStart = connectionStartTime;
    
    log(`${colors.green}WebSocket connection established (attempt #${experimentStats.connectionStats.connectionAttempts})${colors.reset}`, 'info');
    
    // 重置重连延迟
    currentReconnectDelay = RECONNECT_CONFIG.initialDelay;
    reconnectAttempt = 0;
    
    // 开始数据间隙检测
    startGapDetection();
  });
  
  ws.on('message', (data: WebSocket.Data) => {
    try {
      const messageSize = Buffer.byteLength(data.toString());
      experimentStats.bytesReceived += messageSize;
      experimentStats.messagesReceived++;
      lastMessageTime = Date.now();
      
      const message: BinanceCombinedStream<any> = JSON.parse(data.toString());
      
      if (message.stream && message.data) {
        const streamData = message.data;
        
        // 计算并分析延迟
        const latency = calculateLatency(streamData.E);
        analyzeLatency(latency);
        
        // 每1000条消息打印一次状态
        if (experimentStats.messagesReceived % 1000 === 0) {
          printStabilityStatus();
        }
      }
    } catch (error) {
      experimentStats.errors.push({
        time: Date.now(),
        error: String(error),
      });
    }
  });
  
  ws.on('error', (error) => {
    log(`${colors.red}WebSocket error: ${error}${colors.reset}`, 'error');
    experimentStats.errors.push({
      time: Date.now(),
      error: String(error),
    });
  });
  
  ws.on('close', (code, reason) => {
    const connectionDuration = experimentStats.connectionStats.currentConnectionStart
      ? Date.now() - experimentStats.connectionStats.currentConnectionStart
      : 0;
    
    if (connectionDuration > 0) {
      experimentStats.connectionStats.connectionDurations.push(connectionDuration);
    }
    
    experimentStats.connectionStats.disconnections++;
    log(`${colors.yellow}WebSocket closed. Code: ${code}, Reason: ${reason}${colors.reset}`, 'warn');
    log(`Connection duration: ${(connectionDuration / 1000).toFixed(2)}s`, 'info');
    
    stopGapDetection();
    
    // 自动重连
    if (!isShuttingDown && reconnectAttempt < RECONNECT_CONFIG.maxRetries) {
      scheduleReconnect();
    }
  });
  
  // Ping/Pong 处理
  ws.on('ping', () => {
    ws!.pong();
  });
  
  // 每30秒发送一次 ping 确保连接活跃
  const pingInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
}

function scheduleReconnect() {
  reconnectAttempt++;
  experimentStats.connectionStats.reconnectDelays.push(currentReconnectDelay);
  
  log(`${colors.cyan}Scheduling reconnect attempt #${reconnectAttempt} in ${currentReconnectDelay}ms...${colors.reset}`, 'info');
  
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, currentReconnectDelay);
  
  // 增加延迟，但不超过最大值
  currentReconnectDelay = Math.min(
    currentReconnectDelay * RECONNECT_CONFIG.backoffMultiplier,
    RECONNECT_CONFIG.maxDelay
  );
}

function analyzeLatency(latency: number) {
  experimentStats.latencyStats.latencies.push(latency);
  
  // 更新延迟分布
  if (latency < 50) {
    experimentStats.latencyStats.buckets.under50ms++;
  } else if (latency < 100) {
    experimentStats.latencyStats.buckets.under100ms++;
  } else if (latency < 200) {
    experimentStats.latencyStats.buckets.under200ms++;
  } else if (latency < 500) {
    experimentStats.latencyStats.buckets.under500ms++;
  } else {
    experimentStats.latencyStats.buckets.over500ms++;
  }
}

function calculatePercentiles() {
  const latencies = [...experimentStats.latencyStats.latencies].sort((a, b) => a - b);
  const len = latencies.length;
  
  if (len === 0) return;
  
  experimentStats.latencyStats.percentiles = {
    p50: latencies[Math.floor(len * 0.5)],
    p90: latencies[Math.floor(len * 0.9)],
    p95: latencies[Math.floor(len * 0.95)],
    p99: latencies[Math.floor(len * 0.99)],
  };
}

function startGapDetection() {
  gapDetectionTimer = setInterval(() => {
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    
    // 如果超过5秒没有收到消息，记录为数据间隙
    if (timeSinceLastMessage > 5000) {
      log(`${colors.red}Data gap detected: ${timeSinceLastMessage}ms since last message${colors.reset}`, 'warn');
      
      // 记录间隙开始
      if (experimentStats.dataGaps.length === 0 || 
          experimentStats.dataGaps[experimentStats.dataGaps.length - 1].end) {
        experimentStats.dataGaps.push({
          start: lastMessageTime,
          end: 0,
          duration: 0,
        });
      }
    } else {
      // 如果有未结束的间隙，结束它
      if (experimentStats.dataGaps.length > 0) {
        const lastGap = experimentStats.dataGaps[experimentStats.dataGaps.length - 1];
        if (!lastGap.end) {
          lastGap.end = now;
          lastGap.duration = lastGap.end - lastGap.start;
          log(`${colors.green}Data gap ended. Duration: ${lastGap.duration}ms${colors.reset}`, 'info');
        }
      }
    }
  }, 1000);
}

function stopGapDetection() {
  if (gapDetectionTimer) {
    clearInterval(gapDetectionTimer);
    gapDetectionTimer = null;
  }
}

function printStabilityStatus() {
  const runtime = (Date.now() - experimentStats.startTime) / 1000;
  const avgLatency = experimentStats.latencyStats.latencies.length > 0
    ? experimentStats.latencyStats.latencies.reduce((a, b) => a + b, 0) / experimentStats.latencyStats.latencies.length
    : 0;
  
  calculatePercentiles();
  
  console.log(`\n${colors.bright}========== Stability Status Report ==========${colors.reset}`);
  console.log(`Runtime: ${runtime.toFixed(2)}s`);
  console.log(`Messages received: ${experimentStats.messagesReceived}`);
  console.log(`Data received: ${formatBytes(experimentStats.bytesReceived)}`);
  
  console.log(`\n${colors.cyan}Connection Statistics:${colors.reset}`);
  console.log(`  Connection attempts: ${experimentStats.connectionStats.connectionAttempts}`);
  console.log(`  Successful connections: ${experimentStats.connectionStats.successfulConnections}`);
  console.log(`  Disconnections: ${experimentStats.connectionStats.disconnections}`);
  console.log(`  Average connection duration: ${
    experimentStats.connectionStats.connectionDurations.length > 0
      ? (experimentStats.connectionStats.connectionDurations.reduce((a, b) => a + b, 0) / 
         experimentStats.connectionStats.connectionDurations.length / 1000).toFixed(2)
      : 0
  }s`);
  
  console.log(`\n${colors.cyan}Latency Analysis:${colors.reset}`);
  console.log(`  Average latency: ${avgLatency.toFixed(2)}ms`);
  if (experimentStats.latencyStats.percentiles) {
    console.log(`  P50: ${experimentStats.latencyStats.percentiles.p50}ms`);
    console.log(`  P90: ${experimentStats.latencyStats.percentiles.p90}ms`);
    console.log(`  P95: ${experimentStats.latencyStats.percentiles.p95}ms`);
    console.log(`  P99: ${experimentStats.latencyStats.percentiles.p99}ms`);
  }
  
  console.log(`\n${colors.cyan}Latency Distribution:${colors.reset}`);
  const total = Object.values(experimentStats.latencyStats.buckets).reduce((a, b) => a + b, 0);
  Object.entries(experimentStats.latencyStats.buckets).forEach(([bucket, count]) => {
    const percentage = total > 0 ? (count / total * 100).toFixed(2) : '0';
    console.log(`  ${bucket}: ${count} (${percentage}%)`);
  });
  
  console.log(`\n${colors.cyan}Data Quality:${colors.reset}`);
  console.log(`  Data gaps: ${experimentStats.dataGaps.length}`);
  console.log(`  Total gap duration: ${
    experimentStats.dataGaps.reduce((sum, gap) => sum + gap.duration, 0)
  }ms`);
  console.log(`  Errors: ${experimentStats.errors.length}`);
  
  console.log(`${colors.bright}==========================================${colors.reset}\n`);
}

// 主函数
function main() {
  log(`${colors.bright}Starting Binance WebSocket Experiment 3 - Stability Test${colors.reset}`, 'info');
  log('This experiment will run for 3 minutes to test connection stability', 'info');
  
  connectWebSocket();
  
  // 设置优雅关闭
  setupGracefulShutdown(() => {
    isShuttingDown = true;
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    
    if (ws) {
      ws.close();
    }
    
    stopGapDetection();
    
    // 保存详细统计
    saveDataSample(experimentStats, 'stability-test-results.json');
    
    // 打印最终报告
    printStabilityStatus();
  });
  
  // 运行3分钟后自动停止
  setTimeout(() => {
    log('Experiment time limit reached (3 minutes), shutting down...', 'warn');
    process.kill(process.pid, 'SIGINT');
  }, 180000);
}

// 运行实验
main();