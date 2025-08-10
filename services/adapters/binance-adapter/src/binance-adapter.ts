/**
 * Binance交易所适配器实现
 * 基于adapter-base框架的简化实现
 */

import { createHmac } from 'crypto';
import {
  BaseAdapter,
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
import { BinanceConnectionManager, BinanceCombinedStreamConfig } from './connection/binance-connection-manager';

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
    /** 是否自动管理组合流 */
    autoManageStreams?: boolean;
    /** 组合流配置（内部使用） */
    combinedStream?: BinanceCombinedStreamConfig;
  };
}

export class BinanceAdapter extends BaseAdapter {
  public readonly exchange = 'binance';
  
  private streamId = 0;
  private streamMap = new Map<string, string>(); // subscription -> stream name
  private binanceConnectionManager?: BinanceConnectionManager;

  /**
   * 创建连接管理器
   */
  protected async createConnectionManager(): Promise<ConnectionManager> {
    this.binanceConnectionManager = new BinanceConnectionManager();
    return this.binanceConnectionManager;
  }

  /**
   * 初始化方法
   */
  async initialize(config: BinanceConfig): Promise<void> {
    // 验证配置
    this.validateBinanceConfig(config);
    
    // 准备初始化流列表
    const initialStreams: string[] = [];
    if (config.subscription?.symbols && config.subscription?.dataTypes) {
      // 为所有符号和数据类型预创建流
      for (const symbol of config.subscription.symbols) {
        for (const dataType of config.subscription.dataTypes) {
          const streamName = this.buildStreamName(symbol, dataType);
          initialStreams.push(streamName);
        }
      }
    }
    
    // 扩展配置以包含Binance特定选项
    const binanceConfig: BinanceConfig = {
      ...config,
      binance: {
        ...config.binance,
        combinedStream: {
          streams: initialStreams,
          autoManage: config.binance?.autoManageStreams ?? true
        }
      }
    };
    
    // 调用基类初始化
    await super.initialize(binanceConfig);
    
    this.emit('initialized');
  }

  /**
   * 验证Binance特定配置参数
   */
  private validateBinanceConfig(config: BinanceConfig): void {
    if (!config) {
      throw new Error('Configuration is required');
    }

    if (!config.endpoints) {
      throw new Error('Endpoints configuration is required');
    }

    if (!config.endpoints.ws) {
      throw new Error('WebSocket endpoint (endpoints.ws) is required');
    }

    if (!config.endpoints.rest) {
      throw new Error('REST API endpoint (endpoints.rest) is required');
    }
  }










  /**
   * 创建订阅
   */
  protected async createSubscription(symbol: string, dataType: DataType): Promise<SubscriptionInfo> {
    const subscriptionId = `${symbol}:${dataType}:${++this.streamId}`;
    const streamName = this.buildStreamName(symbol, dataType);
    
    this.streamMap.set(subscriptionId, streamName);
    
    // 使用BinanceConnectionManager添加流
    if (this.binanceConnectionManager) {
      await this.binanceConnectionManager.addStream(streamName);
    }

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
      
      // 使用BinanceConnectionManager移除流
      if (this.binanceConnectionManager) {
        await this.binanceConnectionManager.removeStream(streamName);
      }
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
    const defaultEndpoints = {
      ws: config.binance?.testnet 
        ? 'wss://testnet.binance.vision/ws'
        : 'wss://stream.binance.com:9443/ws',
      rest: config.binance?.testnet
        ? 'https://testnet.binance.vision/api'
        : 'https://api.binance.com/api'
    };
    
    const defaultConnection = {
      timeout: 10000,
      maxRetries: 5,
      retryInterval: 2000,
      heartbeatInterval: 30000
    };
    
    const defaultBinance = {
      autoManageStreams: true
    };
    
    const defaultConfig: BinanceConfig = {
      ...config,
      exchange: 'binance',
      endpoints: {
        ...defaultEndpoints,
        ...config.endpoints
      },
      connection: {
        ...defaultConnection,
        ...config.connection
      },
      binance: {
        ...defaultBinance,
        ...config.binance
      }
    };

    adapter.initialize(defaultConfig);
  }
  
  return adapter;
}