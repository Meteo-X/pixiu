/**
 * Binance交易所适配器实现
 * 基于adapter-base框架的简化实现
 */

import { createHmac } from 'crypto';
import {
  BaseAdapter,
  BaseConnectionManager,
  AdapterConfig,
  DataType,
  SubscriptionInfo,
  MarketData,
  ConnectionManager,
  TradeData,
  TickerData,
  KlineData,
  DepthData
} from '@pixiu/adapter-base';

export interface BinanceConfig extends AdapterConfig {
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

  /**
   * 创建连接管理器
   */
  protected async createConnectionManager(): Promise<ConnectionManager> {
    return new BaseConnectionManager();
  }

  /**
   * 创建订阅
   */
  protected async createSubscription(symbol: string, dataType: DataType): Promise<SubscriptionInfo> {
    const subscriptionId = `${symbol}:${dataType}:${++this.streamId}`;
    const streamName = this.buildStreamName(symbol, dataType);
    
    this.streamMap.set(subscriptionId, streamName);
    
    // 发送订阅消息到Binance WebSocket
    await this.connectionManager?.send({
      method: 'SUBSCRIBE',
      params: [streamName],
      id: this.streamId
    });

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
      await this.connectionManager?.send({
        method: 'UNSUBSCRIBE',
        params: [streamName],
        id: ++this.streamId
      });
      
      this.streamMap.delete(subscription.id);
    }
  }

  /**
   * 解析Binance消息
   */
  protected parseMessage(message: any): MarketData | null {
    try {
      // 处理订阅确认消息
      if (message.result === null && message.id) {
        return null;
      }

      // 处理数据流消息
      if (message.stream && message.data) {
        return this.parseStreamMessage(message);
      }

      return null;
    } catch (error) {
      // 解析错误会在基类中处理
      throw error;
    }
  }

  /**
   * 解析数据流消息
   */
  private parseStreamMessage(message: any): MarketData | null {
    const { stream, data } = message;
    const [symbolPart, typePart] = stream.split('@');
    const symbol = this.normalizeSymbol(symbolPart);
    
    let dataType: DataType;
    let parsedData: any;

    if (typePart === 'trade') {
      dataType = DataType.TRADE;
      parsedData = this.parseTradeData(data);
    } else if (typePart === 'ticker') {
      dataType = DataType.TICKER;
      parsedData = this.parseTickerData(data);
    } else if (typePart.startsWith('kline_')) {
      const interval = typePart.replace('kline_', '');
      dataType = this.mapInterval(interval);
      parsedData = this.parseKlineData(data.k);
    } else if (typePart.endsWith('@depth')) {
      dataType = DataType.DEPTH;
      parsedData = this.parseDepthData(data);
    } else {
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
      id: data.t.toString(),
      price: parseFloat(data.p),
      quantity: parseFloat(data.q),
      side: data.m ? 'sell' : 'buy', // m=true表示买方是maker
      timestamp: data.T
    };
  }

  /**
   * 解析行情数据
   */
  private parseTickerData(data: any): TickerData {
    return {
      lastPrice: parseFloat(data.c),
      bidPrice: parseFloat(data.b),
      askPrice: parseFloat(data.a),
      change24h: parseFloat(data.P),
      volume24h: parseFloat(data.v),
      high24h: parseFloat(data.h),
      low24h: parseFloat(data.l)
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
          ? 'wss://testnet.binance.vision/ws-api/v3'
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