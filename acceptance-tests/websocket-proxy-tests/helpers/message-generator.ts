/**
 * 消息生成器
 * 生成各种类型和频率的测试消息，用于WebSocket代理测试
 */

export interface MessageTemplate {
  type: string;
  exchange?: string;
  symbol?: string;
  dataType?: string;
  payload: any;
  size?: number;
  frequency?: number;
}

export interface MarketDataMessage {
  type: string;
  exchange: string;
  symbol: string;
  timestamp: number;
  data: any;
}

export interface BatchMessageConfig {
  messageCount: number;
  messageTypes: string[];
  exchanges: string[];
  symbols: string[];
  dataTypes: string[];
  sizeRange: { min: number; max: number };
  timeRange: { start: number; end: number };
}

/**
 * 消息生成器类
 */
export class MessageGenerator {
  private static readonly DEFAULT_EXCHANGES = ['binance', 'okex', 'huobi', 'coinbase'];
  private static readonly DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOTUSDT'];
  private static readonly DEFAULT_DATA_TYPES = ['trade', 'kline', 'ticker', 'depth', 'bookTicker'];

  /**
   * 生成单个市场数据消息
   */
  static generateMarketDataMessage(
    type: string = 'trade',
    exchange: string = 'binance',
    symbol: string = 'BTCUSDT'
  ): MarketDataMessage {
    const timestamp = Date.now();
    let data: any;

    switch (type) {
      case 'trade':
        data = this.generateTradeData(symbol);
        break;
      case 'kline':
        data = this.generateKlineData(symbol);
        break;
      case 'ticker':
        data = this.generateTickerData(symbol);
        break;
      case 'depth':
        data = this.generateDepthData(symbol);
        break;
      case 'bookTicker':
        data = this.generateBookTickerData(symbol);
        break;
      default:
        data = { message: 'Generic market data' };
    }

    return {
      type,
      exchange,
      symbol,
      timestamp,
      data
    };
  }

  /**
   * 生成批量消息
   */
  static generateBatchMessages(config: BatchMessageConfig): MarketDataMessage[] {
    const messages: MarketDataMessage[] = [];
    
    for (let i = 0; i < config.messageCount; i++) {
      const type = this.randomChoice(config.messageTypes);
      const exchange = this.randomChoice(config.exchanges);
      const symbol = this.randomChoice(config.symbols);
      
      const message = this.generateMarketDataMessage(type, exchange, symbol);
      
      // 添加时间戳变化
      if (config.timeRange) {
        const timeOffset = Math.random() * (config.timeRange.end - config.timeRange.start);
        message.timestamp = config.timeRange.start + timeOffset;
      }
      
      messages.push(message);
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 生成大小可控的消息
   */
  static generateSizedMessage(targetSizeBytes: number, type: string = 'data'): any {
    const baseMessage = {
      type,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9)
    };

    const baseSize = JSON.stringify(baseMessage).length;
    const paddingSize = Math.max(0, targetSizeBytes - baseSize - 50); // 50字节缓冲

    return {
      ...baseMessage,
      payload: {
        data: 'x'.repeat(paddingSize),
        size: targetSizeBytes
      }
    };
  }

  /**
   * 生成性能测试消息序列
   */
  static generatePerformanceTestMessages(
    messageCount: number,
    messageSize: number = 1024,
    messageType: string = 'performance_test'
  ): any[] {
    const messages: any[] = [];
    
    for (let i = 0; i < messageCount; i++) {
      const message = {
        type: messageType,
        sequenceId: i,
        timestamp: Date.now() + i, // 确保时间递增
        testData: this.generateTestPayload(messageSize),
        metadata: {
          messageIndex: i,
          totalMessages: messageCount,
          expectedSize: messageSize
        }
      };
      
      messages.push(message);
    }
    
    return messages;
  }

  /**
   * 生成订阅过滤测试消息
   */
  static generateSubscriptionTestMessages(
    messageCount: number = 100,
    targetExchanges: string[] = ['binance', 'okex'],
    targetSymbols: string[] = ['BTCUSDT', 'ETHUSDT'],
    targetTypes: string[] = ['trade', 'ticker']
  ): MarketDataMessage[] {
    const messages: MarketDataMessage[] = [];
    const allExchanges = [...this.DEFAULT_EXCHANGES];
    const allSymbols = [...this.DEFAULT_SYMBOLS];
    const allTypes = [...this.DEFAULT_DATA_TYPES];

    for (let i = 0; i < messageCount; i++) {
      // 50%的消息匹配目标过滤条件
      const shouldMatch = Math.random() < 0.5;
      
      const exchange = shouldMatch 
        ? this.randomChoice(targetExchanges)
        : this.randomChoice(allExchanges.filter(e => !targetExchanges.includes(e)));
      
      const symbol = shouldMatch
        ? this.randomChoice(targetSymbols)
        : this.randomChoice(allSymbols.filter(s => !targetSymbols.includes(s)));
      
      const type = shouldMatch
        ? this.randomChoice(targetTypes)
        : this.randomChoice(allTypes.filter(t => !targetTypes.includes(t)));

      const message = this.generateMarketDataMessage(type, exchange, symbol);
      message.data = {
        ...message.data,
        shouldMatch,
        testIndex: i
      };

      messages.push(message);
    }

    return messages;
  }

  /**
   * 生成高频消息流
   */
  static generateHighFrequencyMessages(
    durationMs: number,
    messagesPerSecond: number,
    messageType: string = 'high_frequency'
  ): any[] {
    const messages: any[] = [];
    const intervalMs = 1000 / messagesPerSecond;
    const messageCount = Math.floor(durationMs / intervalMs);
    
    const startTime = Date.now();
    
    for (let i = 0; i < messageCount; i++) {
      const timestamp = startTime + (i * intervalMs);
      
      messages.push({
        type: messageType,
        sequenceId: i,
        timestamp,
        frequency: messagesPerSecond,
        data: {
          price: 50000 + (Math.random() - 0.5) * 1000,
          volume: Math.random() * 10,
          change: (Math.random() - 0.5) * 5
        }
      });
    }
    
    return messages;
  }

  /**
   * 生成WebSocket协议消息
   */
  static generateWebSocketMessages(): {
    ping: any;
    pong: any;
    subscribe: any;
    unsubscribe: any;
    error: any;
    welcome: any;
  } {
    return {
      ping: { type: 'ping', timestamp: Date.now() },
      pong: { type: 'pong', timestamp: Date.now() },
      subscribe: {
        type: 'subscribe',
        payload: {
          exchange: ['binance'],
          symbols: ['BTCUSDT'],
          dataTypes: ['trade']
        }
      },
      unsubscribe: {
        type: 'unsubscribe',
        payload: { filterId: 'test_filter_123' }
      },
      error: {
        type: 'error',
        payload: { message: 'Test error message', code: 'TEST_ERROR' }
      },
      welcome: {
        type: 'welcome',
        payload: {
          connectionId: 'test_connection_123',
          serverTime: Date.now(),
          version: '1.0.0'
        }
      }
    };
  }

  /**
   * 生成压力测试消息
   */
  static generateStressTestMessages(
    clientCount: number,
    messagesPerClient: number,
    messageSize: number = 1024
  ): Map<string, any[]> {
    const clientMessages = new Map<string, any[]>();
    
    for (let clientId = 0; clientId < clientCount; clientId++) {
      const messages: any[] = [];
      
      for (let msgId = 0; msgId < messagesPerClient; msgId++) {
        messages.push({
          type: 'stress_test',
          clientId: `client_${clientId}`,
          messageId: msgId,
          timestamp: Date.now() + msgId,
          payload: this.generateTestPayload(messageSize),
          metadata: {
            clientIndex: clientId,
            messageIndex: msgId,
            totalClients: clientCount,
            messagesPerClient: messagesPerClient
          }
        });
      }
      
      clientMessages.set(`client_${clientId}`, messages);
    }
    
    return clientMessages;
  }

  /**
   * 生成延迟测试消息
   */
  static generateLatencyTestMessage(): {
    request: any;
    validateResponse: (response: any) => { isValid: boolean; latency: number };
  } {
    const requestId = Math.random().toString(36).substr(2, 12);
    const sentTime = Date.now();
    
    const request = {
      type: 'latency_test',
      requestId,
      sentTime,
      payload: { test: 'latency measurement' }
    };

    const validateResponse = (response: any) => {
      const receivedTime = Date.now();
      const isValid = response.type === 'latency_response' && 
                     response.requestId === requestId;
      const latency = receivedTime - sentTime;
      
      return { isValid, latency };
    };

    return { request, validateResponse };
  }

  // 私有辅助方法

  /**
   * 生成交易数据
   */
  private static generateTradeData(symbol: string): any {
    return {
      symbol,
      price: (50000 + Math.random() * 10000).toFixed(2),
      quantity: (Math.random() * 10).toFixed(4),
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      tradeId: Math.floor(Math.random() * 1000000),
      time: Date.now()
    };
  }

  /**
   * 生成K线数据
   */
  private static generateKlineData(symbol: string): any {
    const basePrice = 50000 + Math.random() * 10000;
    
    return {
      symbol,
      interval: '1m',
      openTime: Date.now() - 60000,
      closeTime: Date.now(),
      openPrice: basePrice.toFixed(2),
      highPrice: (basePrice * 1.01).toFixed(2),
      lowPrice: (basePrice * 0.99).toFixed(2),
      closePrice: (basePrice + (Math.random() - 0.5) * 100).toFixed(2),
      volume: (Math.random() * 1000).toFixed(4),
      quoteAssetVolume: (Math.random() * 50000000).toFixed(2)
    };
  }

  /**
   * 生成Ticker数据
   */
  private static generateTickerData(symbol: string): any {
    const price = 50000 + Math.random() * 10000;
    
    return {
      symbol,
      priceChange: ((Math.random() - 0.5) * 1000).toFixed(2),
      priceChangePercent: ((Math.random() - 0.5) * 5).toFixed(2),
      weightedAvgPrice: price.toFixed(2),
      lastPrice: price.toFixed(2),
      lastQty: (Math.random() * 10).toFixed(4),
      bidPrice: (price * 0.9999).toFixed(2),
      askPrice: (price * 1.0001).toFixed(2),
      openPrice: (price - (Math.random() - 0.5) * 100).toFixed(2),
      highPrice: (price * 1.02).toFixed(2),
      lowPrice: (price * 0.98).toFixed(2),
      volume: (Math.random() * 10000).toFixed(4),
      quoteVolume: (Math.random() * 500000000).toFixed(2),
      count: Math.floor(Math.random() * 100000)
    };
  }

  /**
   * 生成深度数据
   */
  private static generateDepthData(symbol: string): any {
    const basePrice = 50000 + Math.random() * 10000;
    const bids: [string, string][] = [];
    const asks: [string, string][] = [];
    
    // 生成买单
    for (let i = 0; i < 20; i++) {
      const price = (basePrice - i * 0.1).toFixed(2);
      const quantity = (Math.random() * 10).toFixed(4);
      bids.push([price, quantity]);
    }
    
    // 生成卖单
    for (let i = 0; i < 20; i++) {
      const price = (basePrice + i * 0.1).toFixed(2);
      const quantity = (Math.random() * 10).toFixed(4);
      asks.push([price, quantity]);
    }
    
    return {
      symbol,
      bids,
      asks,
      lastUpdateId: Math.floor(Math.random() * 1000000)
    };
  }

  /**
   * 生成BookTicker数据
   */
  private static generateBookTickerData(symbol: string): any {
    const basePrice = 50000 + Math.random() * 10000;
    
    return {
      symbol,
      bidPrice: (basePrice * 0.9999).toFixed(2),
      bidQty: (Math.random() * 10).toFixed(4),
      askPrice: (basePrice * 1.0001).toFixed(2),
      askQty: (Math.random() * 10).toFixed(4),
      updateId: Math.floor(Math.random() * 1000000)
    };
  }

  /**
   * 随机选择数组中的元素
   */
  private static randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * 生成测试载荷
   */
  private static generateTestPayload(targetSize: number): string {
    const baseData = { 
      test: true, 
      random: Math.random(),
      timestamp: Date.now() 
    };
    
    const baseSize = JSON.stringify(baseData).length;
    const paddingSize = Math.max(0, targetSize - baseSize - 10); // 10字节缓冲
    
    return JSON.stringify({
      ...baseData,
      padding: 'x'.repeat(paddingSize)
    });
  }
}