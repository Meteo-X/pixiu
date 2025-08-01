#!/usr/bin/env ts-node

import WebSocket from 'ws';
import { BinanceTradeStream, BinanceKlineStream } from './types';

const BINANCE_WS_URL = 'wss://stream.binance.com:9443';
const SYMBOL = 'btcusdt';
const STREAMS = [
  `${SYMBOL}@trade`,
  `${SYMBOL}@kline_1m`,
];

interface TestStats {
  connectedAt: number;
  messagesReceived: number;
  tradesReceived: number;
  klinesReceived: number;
  errors: number;
  latencies: number[];
}

function testBinanceWebSocket(): Promise<TestStats> {
  return new Promise((resolve, reject) => {
    const stats: TestStats = {
      connectedAt: 0,
      messagesReceived: 0,
      tradesReceived: 0,
      klinesReceived: 0,
      errors: 0,
      latencies: []
    };

    const wsUrl = `${BINANCE_WS_URL}/stream?streams=${STREAMS.join('/')}`;
    console.log(`🔌 Connecting to: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    let isConnected = false;

    // Set timeout for test
    const timeout = setTimeout(() => {
      if (!isConnected) {
        ws.close();
        reject(new Error('Connection timeout'));
      } else {
        ws.close();
        resolve(stats);
      }
    }, 10000); // 10 second test

    ws.on('open', () => {
      stats.connectedAt = Date.now();
      isConnected = true;
      console.log('✅ WebSocket connection established');
      console.log(`📡 Subscribed to streams: ${STREAMS.join(', ')}`);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        stats.messagesReceived++;
        const message = JSON.parse(data.toString());
        
        // Handle combined stream format
        if (message.stream && message.data) {
          const streamData = message.data;
          const latency = Date.now() - streamData.E;
          stats.latencies.push(latency);
          
          if (streamData.e === 'trade') {
            stats.tradesReceived++;
            const trade = streamData as BinanceTradeStream;
            console.log(`📈 [TRADE] ${trade.s}: ${trade.p} @ ${trade.q} (latency: ${latency}ms)`);
          } else if (streamData.e === 'kline') {
            stats.klinesReceived++;
            const kline = streamData as BinanceKlineStream;
            console.log(`📊 [KLINE] ${kline.k.s}: ${kline.k.o}->${kline.k.c} vol:${kline.k.v} (latency: ${latency}ms)`);
          }
        }
      } catch (error) {
        stats.errors++;
        console.error(`❌ Error parsing message: ${error}`);
      }
    });

    ws.on('error', (error) => {
      stats.errors++;
      console.error(`❌ WebSocket error: ${error}`);
      clearTimeout(timeout);
      reject(error);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed. Code: ${code}, Reason: ${reason}`);
      clearTimeout(timeout);
      
      if (isConnected) {
        resolve(stats);
      } else {
        reject(new Error(`Connection closed before establishing: ${code} ${reason}`));
      }
    });
  });
}

async function main() {
  console.log('🚀 Starting Binance WebSocket connection test...\n');
  
  try {
    const stats = await testBinanceWebSocket();
    
    // Calculate statistics
    const duration = Date.now() - stats.connectedAt;
    const avgLatency = stats.latencies.length > 0 
      ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length 
      : 0;
    const minLatency = stats.latencies.length > 0 ? Math.min(...stats.latencies) : 0;
    const maxLatency = stats.latencies.length > 0 ? Math.max(...stats.latencies) : 0;
    
    console.log('\n📊 Test Results:');
    console.log('================');
    console.log(`Duration: ${(duration / 1000).toFixed(2)} seconds`);
    console.log(`Messages received: ${stats.messagesReceived}`);
    console.log(`Trades received: ${stats.tradesReceived}`);
    console.log(`Klines received: ${stats.klinesReceived}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Average latency: ${avgLatency.toFixed(2)} ms`);
    console.log(`Min/Max latency: ${minLatency}/${maxLatency} ms`);
    console.log(`Messages per second: ${(stats.messagesReceived / (duration / 1000)).toFixed(2)}`);
    
    if (stats.messagesReceived > 0 && stats.errors === 0) {
      console.log('\n✅ Binance WebSocket connection test PASSED');
      process.exit(0);
    } else {
      console.log('\n❌ Binance WebSocket connection test FAILED');
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}