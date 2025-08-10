/**
 * 简化的Binance WebSocket连接器
 * 基于现有Binance适配器代码，去除workspace依赖
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface BinanceMarketData {
  type: 'trade' | 'ticker' | 'kline';
  exchange: string;
  symbol: string;
  timestamp: number;
  price: number;
  volume?: number;
  side?: 'buy' | 'sell';
  change24h?: number;
  high24h?: number;
  low24h?: number;
  tradeId?: string;
}

export class BinanceConnector extends EventEmitter {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnected = false;
  private subscribedStreams = new Set<string>();
  private streamStats = new Map<string, { count: number; lastUpdate: string | null }>();

  // Binance WebSocket端点
  private readonly baseUrl = 'wss://stream.binance.com:9443';

  constructor() {
    super();
    this.setupDefaultSubscriptions();
  }

  /**
   * 设置默认订阅
   */
  private setupDefaultSubscriptions(): void {
    // 订阅热门交易对的ticker和trade数据
    const symbols = ['btcusdt', 'ethusdt', 'bnbusdt', 'adausdt', 'solusdt'];
    
    // 添加ticker流
    symbols.forEach(symbol => {
      this.subscribedStreams.add(`${symbol}@ticker`);
    });

    // 添加部分trade流
    ['btcusdt', 'ethusdt'].forEach(symbol => {
      this.subscribedStreams.add(`${symbol}@trade`);
    });
  }

  /**
   * 连接到Binance WebSocket
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const streams = Array.from(this.subscribedStreams).join('/');
    const url = `${this.baseUrl}/stream?streams=${streams}`;

    console.log(`🔗 Connecting to Binance WebSocket: ${url}`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        const timeout = setTimeout(() => {
          this.ws?.close();
          reject(new Error('Binance connection timeout'));
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log('✅ Connected to Binance WebSocket');
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          clearTimeout(timeout);
          this.isConnected = false;
          console.log(`❌ Binance WebSocket closed: ${code} ${reason}`);
          this.emit('disconnected');
          this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          console.error('❌ Binance WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('ping', () => {
          this.ws?.pong();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      // Binance Combined Stream格式: {stream: string, data: object}
      if (message.stream && message.data) {
        // 更新流统计
        this.updateStreamStats(message.stream);
        
        const marketData = this.parseMessage(message);
        if (marketData) {
          this.emit('data', marketData);
        }
      }
    } catch (error) {
      console.error('Error parsing Binance message:', error);
    }
  }

  /**
   * 更新流统计信息
   */
  private updateStreamStats(stream: string): void {
    const stats = this.streamStats.get(stream) || { count: 0, lastUpdate: null };
    stats.count++;
    stats.lastUpdate = new Date().toISOString();
    this.streamStats.set(stream, stats);
  }

  /**
   * 解析Binance消息
   */
  private parseMessage(message: any): BinanceMarketData | null {
    const { data } = message;
    const eventType = data.e;
    const symbol = data.s?.toUpperCase() || 'UNKNOWN';

    try {
      switch (eventType) {
        case 'trade':
          return {
            type: 'trade',
            exchange: 'binance',
            symbol,
            timestamp: data.T,
            price: parseFloat(data.p),
            volume: parseFloat(data.q),
            side: data.m ? 'sell' : 'buy', // m=true表示买方是maker，所以是卖单
            tradeId: data.t.toString()
          };

        case '24hrTicker':
          return {
            type: 'ticker',
            exchange: 'binance',
            symbol,
            timestamp: data.E,
            price: parseFloat(data.c), // 最新价格
            volume: parseFloat(data.v), // 24小时成交量
            change24h: parseFloat(data.P), // 24小时价格变化百分比
            high24h: parseFloat(data.h), // 24小时最高价
            low24h: parseFloat(data.l) // 24小时最低价
          };

        default:
          // 忽略其他事件类型
          return null;
      }
    } catch (error) {
      console.error('Error parsing market data:', error);
      return null;
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.isConnected = false;
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnect attempts (${this.maxReconnectAttempts}) exceeded`);
      this.emit('error', new Error('Max reconnect attempts exceeded'));
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // 指数退避，最大30秒
    this.reconnectAttempts++;
    
    console.log(`🔄 Reconnecting to Binance in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnect failed:', error);
      });
    }, delay);
  }

  /**
   * 获取连接状态
   */
  isConnectedToBinance(): boolean {
    return this.isConnected;
  }

  /**
   * 获取订阅的流
   */
  getSubscribedStreams(): string[] {
    return Array.from(this.subscribedStreams);
  }

  /**
   * 获取流统计信息
   */
  getStreamStats(): Record<string, { count: number; lastUpdate: string | null }> {
    const stats: Record<string, { count: number; lastUpdate: string | null }> = {};
    for (const [stream, stat] of this.streamStats.entries()) {
      stats[stream] = { ...stat };
    }
    return stats;
  }
}