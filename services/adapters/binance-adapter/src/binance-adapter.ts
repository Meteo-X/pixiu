/**
 * Binance交易所适配器实现
 * 基于adapter-base框架的简化实现
 */

import { createHmac } from 'crypto';
import WebSocket from 'ws';
import {
  BaseAdapter,
  BaseConnectionManager,
  AdapterConfig,
  AdapterStatus,
  DataType,
  SubscriptionInfo,
  SubscriptionConfig,
  MarketData,
  ConnectionManager,
  TradeData,
  TickerData,
  KlineData,
  DepthData
} from '@pixiu/adapter-base';

export interface BinanceConfig extends AdapterConfig {
  /** 订阅配置 */
  subscription?: SubscriptionConfig;
  /** Binance特定配置 */
  binance?: {
    /** 是否使用测试网 */
    testnet?: boolean;
    /** 是否启用数据压缩 */
    enableCompression?: boolean;
    /** 批量订阅大小 */
    batchSize?: number;
  };
}

export class BinanceAdapter extends BaseAdapter {
  public readonly exchange = 'binance';
  
  private streamId = 0;
  private streamMap = new Map<string, string>(); // subscription -> stream name
  private activeStreams = new Set<string>(); // 活跃的流名称
  private combinedStreamUrl?: string; // 组合流URL
  private ws?: WebSocket; // 直接WebSocket连接
  private reconnectTimer?: NodeJS.Timeout;
  private binanceReconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * 创建连接管理器
   */
  protected async createConnectionManager(): Promise<ConnectionManager> {
    return new BaseConnectionManager();
  }

  /**
   * 初始化方法（完全重写以使用直接WebSocket连接）
   */
  async initialize(config: BinanceConfig): Promise<void> {
    this.config = config;
    
    // 预处理订阅配置，构建流URL
    if (config.subscription?.symbols && config.subscription?.dataTypes) {
      // 为所有符号和数据类型预创建流
      for (const symbol of config.subscription.symbols) {
        for (const dataType of config.subscription.dataTypes) {
          const streamName = this.buildStreamName(symbol, dataType);
          this.activeStreams.add(streamName);
        }
      }
      
      // 构建初始组合流URL
      if (this.activeStreams.size > 0) {
        const streamArray = Array.from(this.activeStreams);
        this.combinedStreamUrl = this.buildCombinedStreamUrl(streamArray);
      }
    }
    
    // 基类会自动初始化指标
    
    this.emit('initialized');
  }

  /**
   * 连接方法（完全重写以使用直接WebSocket）
   */
  async connect(): Promise<void> {
    if (this.status === AdapterStatus.CONNECTED) {
      return;
    }

    if (!this.combinedStreamUrl) {
      throw new Error('No streams configured for connection');
    }

    this.status = AdapterStatus.CONNECTING;
    this.binanceReconnectAttempts = 0;
    
    return this.connectWebSocket();
  }

  /**
   * 直接WebSocket连接（参考实验代码）
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.combinedStreamUrl) {
        reject(new Error('No WebSocket URL configured'));
        return;
      }

      try {
        this.ws = new WebSocket(this.combinedStreamUrl);

        // 连接超时
        const timeout = setTimeout(() => {
          this.ws?.terminate();
          reject(new Error('Connection timeout'));
        }, this.config?.connection?.timeout || 10000);

        this.ws.on('open', () => {
          clearTimeout(timeout);
          this.status = AdapterStatus.CONNECTED;
          this.binanceReconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleWebSocketMessage(data);
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          this.emit('error', error);
          this.scheduleReconnect();
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          clearTimeout(timeout);
          this.status = AdapterStatus.DISCONNECTED;
          this.emit('disconnected', reason.toString());
          
          // 只有在非正常关闭时才重连
          if (code !== 1000 && this.status !== AdapterStatus.DISCONNECTED) {
            this.scheduleReconnect();
          }
        });

        // Ping/Pong处理（参考实验代码）
        this.ws.on('ping', () => {
          this.ws?.pong();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理WebSocket消息（参考实验代码）
   */
  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const messageSize = Buffer.byteLength(data.toString());
      const message = JSON.parse(data.toString());
      
      // 更新指标
      this.updateMetrics(messageSize);
      
      // 解析市场数据
      const marketData = this.parseMessage(message);
      if (marketData) {
        this.emit('data', marketData);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * 更新适配器指标
   */
  private updateMetrics(messageSize: number = 0): void {
    if (this.metrics) {
      this.metrics.messagesReceived++;
      this.metrics.status = this.status;
    }
  }

  /**
   * 调度重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.binanceReconnectAttempts >= this.maxReconnectAttempts) {
      this.status = AdapterStatus.ERROR;
      this.emit('error', new Error(`Max reconnect attempts (${this.maxReconnectAttempts}) exceeded`));
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.binanceReconnectAttempts), 30000); // 指数退避，最大30秒
    this.binanceReconnectAttempts++;
    
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket().catch(error => {
        this.emit('error', error);
      });
    }, delay);
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = undefined;
    }

    this.status = AdapterStatus.DISCONNECTED;
    this.emit('disconnected', 'Manual disconnect');
  }




  /**
   * 创建订阅
   */
  protected async createSubscription(symbol: string, dataType: DataType): Promise<SubscriptionInfo> {
    const subscriptionId = `${symbol}:${dataType}:${++this.streamId}`;
    const streamName = this.buildStreamName(symbol, dataType);
    
    this.streamMap.set(subscriptionId, streamName);
    this.activeStreams.add(streamName);
    
    // 重新建立包含新流的连接
    await this.reconnectWithStreams();

    return {
      id: subscriptionId,
      symbol: this.normalizeSymbol(symbol),
      dataType,
      subscribedAt: Date.now(),
      active: true
    };
  }

  /**
   * 移除订阅
   */
  protected async removeSubscription(subscription: SubscriptionInfo): Promise<void> {
    const streamName = this.streamMap.get(subscription.id);
    if (streamName) {
      this.streamMap.delete(subscription.id);
      this.activeStreams.delete(streamName);
      
      // 重新建立不包含该流的连接
      await this.reconnectWithStreams();
    }
  }

  /**
   * 重新连接包含所有活跃流的WebSocket
   */
  private async reconnectWithStreams(): Promise<void> {
    if (this.activeStreams.size === 0) {
      return;
    }

    // 构建组合流URL
    const streamArray = Array.from(this.activeStreams);
    this.combinedStreamUrl = this.buildCombinedStreamUrl(streamArray);
    
    // 断开现有连接
    if (this.connectionManager?.isConnected()) {
      await this.connectionManager.disconnect();
    }
    
    // 使用新的URL重新连接
    const config = this.getConfig() as BinanceConfig;
    const newConfig = {
      ...config.connection,
      url: this.combinedStreamUrl,
      heartbeatTimeout: config.connection.heartbeatInterval * 2
    };
    
    await this.connectionManager?.connect(newConfig);
  }

  /**
   * 构建组合流URL
   */
  private buildCombinedStreamUrl(streams: string[]): string {
    const baseUrl = this.getConfig().endpoints?.ws?.replace('/ws', '') || 'wss://stream.binance.com:9443';
    if (streams.length === 1) {
      return `${baseUrl}/ws/${streams[0]}`;
    } else {
      // 组合流格式
      const streamParam = streams.join('/');
      return `${baseUrl}/stream?streams=${streamParam}`;
    }
  }

  /**
   * 解析Binance消息
   */
  protected parseMessage(message: any): MarketData | null {
    try {
      // Binance Combined Stream 格式: {stream: string, data: object}
      if (message.stream && message.data) {
        return this.parseCombinedStreamMessage(message);
      }

      // 忽略其他消息类型（ping/pong等）
      return null;
    } catch (error) {
      // 解析错误会在基类中处理
      throw error;
    }
  }

  /**
   * 解析Binance Combined Stream消息
   */
  private parseCombinedStreamMessage(message: any): MarketData | null {
    const { stream, data } = message;
    
    // 根据data.e字段识别事件类型（参考实验代码）
    const eventType = data.e;
    const symbol = this.normalizeSymbol(data.s);
    
    let dataType: DataType;
    let parsedData: any;

    switch (eventType) {
      case 'trade':
        dataType = DataType.TRADE;
        parsedData = this.parseTradeData(data);
        break;
      
      case 'kline':
        const interval = data.k.i; // 从kline数据中获取间隔
        dataType = this.mapInterval(interval);
        parsedData = this.parseKlineData(data.k);
        break;
      
      case '24hrTicker':
        dataType = DataType.TICKER;
        parsedData = this.parseTickerData(data);
        break;
      
      default:
        // 未知事件类型，忽略
        return null;
    }

    return {
      exchange: this.exchange,
      symbol,
      type: dataType,
      timestamp: data.E || data.T || Date.now(),
      data: parsedData,
      receivedAt: Date.now()
    };
  }

  /**
   * 解析交易数据
   */
  private parseTradeData(data: any): TradeData {
    return {
      id: data.t.toString(),           // 交易ID
      price: parseFloat(data.p),       // 价格
      quantity: parseFloat(data.q),    // 数量
      side: data.m ? 'sell' : 'buy',   // m=true表示买方是maker，所以是卖单
      timestamp: data.T                // 交易时间
    };
  }

  /**
   * 解析24小时ticker数据
   */
  private parseTickerData(data: any): TickerData {
    return {
      lastPrice: parseFloat(data.c),       // 最新价格
      bidPrice: parseFloat(data.b),        // 最佳买价
      askPrice: parseFloat(data.a),        // 最佳卖价
      change24h: parseFloat(data.P),       // 24小时价格变化百分比
      volume24h: parseFloat(data.v),       // 24小时成交量
      high24h: parseFloat(data.h),         // 24小时最高价
      low24h: parseFloat(data.l)           // 24小时最低价
    };
  }

  /**
   * 解析K线数据
   */
  private parseKlineData(data: any): KlineData {
    return {
      open: parseFloat(data.o),
      high: parseFloat(data.h),
      low: parseFloat(data.l),
      close: parseFloat(data.c),
      volume: parseFloat(data.v),
      openTime: data.t,
      closeTime: data.T,
      interval: data.i
    };
  }

  /**
   * 解析深度数据
   */
  private parseDepthData(data: any): DepthData {
    return {
      bids: data.b?.map((bid: string[]) => [parseFloat(bid[0]), parseFloat(bid[1])]) || [],
      asks: data.a?.map((ask: string[]) => [parseFloat(ask[0]), parseFloat(ask[1])]) || [],
      updateTime: data.E
    };
  }

  /**
   * 构建Binance流名称
   */
  private buildStreamName(symbol: string, dataType: DataType): string {
    const normalizedSymbol = symbol.replace('/', '').toLowerCase();
    
    switch (dataType) {
      case DataType.TRADE:
        return `${normalizedSymbol}@trade`;
      case DataType.TICKER:
        // Binance使用24hrTicker而不是ticker
        return `${normalizedSymbol}@ticker`;
      case DataType.KLINE_1M:
        return `${normalizedSymbol}@kline_1m`;
      case DataType.KLINE_5M:
        return `${normalizedSymbol}@kline_5m`;
      case DataType.KLINE_1H:
        return `${normalizedSymbol}@kline_1h`;
      case DataType.KLINE_1D:
        return `${normalizedSymbol}@kline_1d`;
      case DataType.DEPTH:
        return `${normalizedSymbol}@depth`;
      case DataType.ORDER_BOOK:
        return `${normalizedSymbol}@depth20@100ms`;
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }

  /**
   * 标准化交易对名称
   */
  private normalizeSymbol(symbol: string): string {
    // Binance使用BTCUSDT格式，转换为BTC/USDT标准格式
    if (symbol.includes('/')) {
      return symbol.toUpperCase();
    }
    
    // 简单的启发式方法来分割交易对
    const commonQuotes = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB', 'USDC'];
    for (const quote of commonQuotes) {
      if (symbol.toUpperCase().endsWith(quote)) {
        const base = symbol.slice(0, -quote.length).toUpperCase();
        return `${base}/${quote}`;
      }
    }
    
    return symbol.toUpperCase();
  }

  /**
   * 映射时间间隔
   */
  private mapInterval(interval: string): DataType {
    switch (interval) {
      case '1m':
        return DataType.KLINE_1M;
      case '5m':
        return DataType.KLINE_5M;
      case '1h':
        return DataType.KLINE_1H;
      case '1d':
        return DataType.KLINE_1D;
      default:
        throw new Error(`Unsupported interval: ${interval}`);
    }
  }

  /**
   * 生成签名（用于认证API）
   */
  public static generateSignature(query: string, secret: string): string {
    return createHmac('sha256', secret).update(query).digest('hex');
  }

  /**
   * 创建认证头部
   */
  public static createAuthHeaders(apiKey: string, timestamp: number, signature: string): Record<string, string> {
    return {
      'X-MBX-APIKEY': apiKey,
      'X-MBX-TIMESTAMP': timestamp.toString(),
      'X-MBX-SIGNATURE': signature
    };
  }
}

/**
 * 创建Binance适配器工厂函数
 */
export function createBinanceAdapter(config?: BinanceConfig): BinanceAdapter {
  const adapter = new BinanceAdapter();
  
  if (config) {
    // 设置默认的Binance配置
    const defaultConfig: BinanceConfig = {
      ...config,
      exchange: 'binance',
      endpoints: {
        ws: config.binance?.testnet 
          ? 'wss://testnet.binance.vision/ws'
          : 'wss://stream.binance.com:9443/ws',
        rest: config.binance?.testnet
          ? 'https://testnet.binance.vision/api'
          : 'https://api.binance.com/api'
      }
    };

    adapter.initialize(defaultConfig);
  }
  
  return adapter;
}