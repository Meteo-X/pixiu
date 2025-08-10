/**
 * 测试数据生成器
 * 为测试提供各种类型的模拟数据
 */

export interface MarketData {
  exchange: string;
  symbol: string;
  type: string;
  timestamp: number;
  data: any;
  metadata?: {
    processedAt: number;
    version: string;
    source: string;
  };
}

export class TestDataGenerator {
  private static sequenceId = 0;

  /**
   * 生成唯一序列ID
   */
  private static getNextSequenceId(): number {
    return ++this.sequenceId;
  }

  /**
   * 生成基本的市场数据结构
   */
  static generateMarketData(type: string, symbol: string = 'BTCUSDT'): MarketData {
    return {
      exchange: 'binance',
      symbol: symbol.toUpperCase(),
      type,
      timestamp: Date.now(),
      data: this.generateDataForType(type),
      metadata: {
        processedAt: Date.now(),
        version: '1.0.0',
        source: 'test-generator'
      }
    };
  }

  /**
   * 根据数据类型生成相应的数据结构
   */
  static generateDataForType(type: string): any {
    switch (type) {
      case 'kline':
        return this.generateBinanceKlineData();
      case 'trade':
        return this.generateBinanceTradeData();
      case 'ticker':
        return this.generateBinanceTickerData();
      case 'depth':
        return this.generateBinanceDepthData();
      case 'aggTrade':
        return this.generateBinanceAggTradeData();
      default:
        return { type, generated: true, timestamp: Date.now() };
    }
  }

  /**
   * 生成Binance K线数据
   */
  static generateBinanceKlineData(): any {
    const now = Date.now();
    const openPrice = 45000 + Math.random() * 5000; // 45000-50000
    const priceVariation = openPrice * 0.02; // 2%变动范围
    
    return {
      t: now - 60000, // 开始时间
      T: now, // 结束时间
      s: 'BTCUSDT',
      i: '1m',
      f: 100 + this.getNextSequenceId(), // 第一笔成交ID
      L: 200 + this.getNextSequenceId(), // 最后一笔成交ID
      o: openPrice.toFixed(2), // 开盘价
      c: (openPrice + (Math.random() - 0.5) * priceVariation).toFixed(2), // 收盘价
      h: (openPrice + Math.random() * priceVariation).toFixed(2), // 最高价
      l: (openPrice - Math.random() * priceVariation).toFixed(2), // 最低价
      v: (Math.random() * 100).toFixed(6), // 成交量
      n: Math.floor(Math.random() * 1000), // 成交笔数
      x: true, // 是否已结束
      q: (Math.random() * 4500000).toFixed(8), // 成交额
      V: (Math.random() * 50).toFixed(6), // 主动买入成交量
      Q: (Math.random() * 2250000).toFixed(8), // 主动买入成交额
      B: '0' // 忽略此参数
    };
  }

  /**
   * 生成Binance交易数据
   */
  static generateBinanceTradeData(): any {
    const price = 45000 + Math.random() * 5000;
    const quantity = Math.random() * 10;
    
    return {
      e: 'trade',
      E: Date.now(), // 事件时间
      s: 'BTCUSDT',
      t: this.getNextSequenceId(), // 交易ID
      p: price.toFixed(2), // 成交价格
      q: quantity.toFixed(6), // 成交数量
      b: this.getNextSequenceId(), // 买方订单ID
      a: this.getNextSequenceId(), // 卖方订单ID
      T: Date.now() - Math.random() * 1000, // 成交时间
      m: Math.random() > 0.5, // 买方是否为做市方
      M: true // 忽略此字段
    };
  }

  /**
   * 生成Binance Ticker数据
   */
  static generateBinanceTickerData(): any {
    const basePrice = 45000;
    const change = (Math.random() - 0.5) * 2000; // -1000 到 +1000
    
    return {
      e: '24hrTicker',
      E: Date.now(),
      s: 'BTCUSDT',
      p: change.toFixed(2), // 24小时价格变动
      P: (change / basePrice * 100).toFixed(3), // 24小时价格变动百分比
      w: (basePrice + change * 0.5).toFixed(2), // 加权平均价
      x: basePrice.toFixed(2), // 前一日收盘价
      c: (basePrice + change).toFixed(2), // 最新成交价
      Q: (Math.random() * 10).toFixed(6), // 最新成交价成交量
      b: (basePrice + change - 1).toFixed(2), // 最优买单价
      B: (Math.random() * 10).toFixed(6), // 最优买单价数量
      a: (basePrice + change + 1).toFixed(2), // 最优卖单价
      A: (Math.random() * 10).toFixed(6), // 最优卖单价数量
      o: basePrice.toFixed(2), // 24小时内第一笔成交价
      h: (basePrice + Math.abs(change) + Math.random() * 500).toFixed(2), // 24小时内最高价
      l: (basePrice - Math.abs(change) - Math.random() * 500).toFixed(2), // 24小时内最低价
      v: (Math.random() * 10000).toFixed(6), // 24小时内成交量
      q: (Math.random() * 450000000).toFixed(8), // 24小时内成交额
      O: Date.now() - 24 * 60 * 60 * 1000, // 统计开始时间
      C: Date.now(), // 统计结束时间
      F: this.getNextSequenceId(), // 24小时内第一笔成交ID
      L: this.getNextSequenceId(), // 24小时内最后一笔成交ID
      n: Math.floor(Math.random() * 100000) // 24小时内成交数
    };
  }

  /**
   * 生成Binance深度数据
   */
  static generateBinanceDepthData(): any {
    const basePrice = 45000;
    const bids = [];
    const asks = [];
    
    // 生成买单
    for (let i = 0; i < 20; i++) {
      const price = basePrice - i * 0.01;
      const quantity = Math.random() * 10;
      bids.push([price.toFixed(2), quantity.toFixed(6)]);
    }
    
    // 生成卖单
    for (let i = 0; i < 20; i++) {
      const price = basePrice + i * 0.01;
      const quantity = Math.random() * 10;
      asks.push([price.toFixed(2), quantity.toFixed(6)]);
    }
    
    return {
      e: 'depthUpdate',
      E: Date.now(),
      s: 'BTCUSDT',
      U: this.getNextSequenceId(), // 从上次推送至今新增的第一个更新Id
      u: this.getNextSequenceId(), // 从上次推送至今新增的最后一个更新Id
      b: bids,
      a: asks
    };
  }

  /**
   * 生成Binance聚合交易数据
   */
  static generateBinanceAggTradeData(): any {
    const price = 45000 + Math.random() * 5000;
    const quantity = Math.random() * 10;
    
    return {
      e: 'aggTrade',
      E: Date.now(), // 事件时间
      s: 'BTCUSDT',
      a: this.getNextSequenceId(), // 聚合交易ID
      p: price.toFixed(2), // 成交价格
      q: quantity.toFixed(6), // 成交数量
      f: this.getNextSequenceId(), // 第一个交易ID
      l: this.getNextSequenceId(), // 最后一个交易ID
      T: Date.now() - Math.random() * 1000, // 成交时间
      m: Math.random() > 0.5, // 买方是否为做市方
      M: true // 忽略此字段
    };
  }

  /**
   * 生成批量市场数据
   */
  static generateBatchMarketData(
    count: number,
    types: string[] = ['kline', 'trade', 'ticker'],
    symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']
  ): MarketData[] {
    const data: MarketData[] = [];
    
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      data.push(this.generateMarketData(type, symbol));
    }
    
    return data;
  }

  /**
   * 生成高频数据序列
   */
  static generateHighFrequencyData(
    duration: number, // 持续时间（毫秒）
    frequency: number = 10 // 频率（每秒消息数）
  ): MarketData[] {
    const data: MarketData[] = [];
    const interval = 1000 / frequency;
    const count = Math.floor(duration / interval);
    
    const startTime = Date.now();
    
    for (let i = 0; i < count; i++) {
      const timestamp = startTime + i * interval;
      const marketData = this.generateMarketData('trade', 'BTCUSDT');
      marketData.timestamp = timestamp;
      data.push(marketData);
    }
    
    return data;
  }

  /**
   * 生成错误数据样本
   */
  static generateErrorData(): Array<{ type: string; data: any; expectedError: string }> {
    return [
      {
        type: 'invalid_json',
        data: '{ invalid json }',
        expectedError: 'JSON解析错误'
      },
      {
        type: 'missing_fields',
        data: { stream: 'btcusdt@kline_1m' }, // 缺少data字段
        expectedError: '缺少必需字段'
      },
      {
        type: 'invalid_symbol',
        data: {
          stream: 'invalid@kline_1m',
          data: this.generateBinanceKlineData()
        },
        expectedError: '无效的交易对'
      },
      {
        type: 'invalid_timestamp',
        data: {
          stream: 'btcusdt@kline_1m',
          data: { ...this.generateBinanceKlineData(), t: 'invalid' }
        },
        expectedError: '无效的时间戳'
      },
      {
        type: 'empty_data',
        data: null,
        expectedError: '空数据'
      }
    ];
  }

  /**
   * 生成性能测试数据
   */
  static generatePerformanceTestData(options: {
    messageCount: number;
    messageSize: 'small' | 'medium' | 'large';
    dataTypes?: string[];
  }): MarketData[] {
    const { messageCount, messageSize, dataTypes = ['kline', 'trade'] } = options;
    const data: MarketData[] = [];
    
    for (let i = 0; i < messageCount; i++) {
      const type = dataTypes[i % dataTypes.length];
      const baseData = this.generateMarketData(type, `SYMBOL${i % 100}`);
      
      // 根据消息大小调整数据
      if (messageSize === 'large') {
        baseData.data.extraData = this.generateLargeDataPayload();
      } else if (messageSize === 'medium') {
        baseData.data.extraData = this.generateMediumDataPayload();
      }
      
      data.push(baseData);
    }
    
    return data;
  }

  /**
   * 生成大型数据负载
   */
  private static generateLargeDataPayload(): any {
    const payload: any = {};
    
    // 添加大量字段模拟复杂数据
    for (let i = 0; i < 100; i++) {
      payload[`field${i}`] = `value${i}`.repeat(100); // 每个字段约500字节
    }
    
    return payload;
  }

  /**
   * 生成中型数据负载
   */
  private static generateMediumDataPayload(): any {
    const payload: any = {};
    
    for (let i = 0; i < 20; i++) {
      payload[`field${i}`] = `value${i}`.repeat(20); // 每个字段约100字节
    }
    
    return payload;
  }

  /**
   * 生成边界条件测试数据
   */
  static generateEdgeCaseData(): Array<{ description: string; data: any }> {
    return [
      {
        description: '极大价格值',
        data: {
          stream: 'btcusdt@kline_1m',
          data: {
            ...this.generateBinanceKlineData(),
            o: '999999999.99999999',
            c: '999999999.99999999',
            h: '999999999.99999999',
            l: '999999999.99999999'
          }
        }
      },
      {
        description: '极小价格值',
        data: {
          stream: 'btcusdt@kline_1m',
          data: {
            ...this.generateBinanceKlineData(),
            o: '0.00000001',
            c: '0.00000001',
            h: '0.00000001',
            l: '0.00000001'
          }
        }
      },
      {
        description: '极大交易量',
        data: {
          stream: 'btcusdt@kline_1m',
          data: {
            ...this.generateBinanceKlineData(),
            v: '999999999.99999999',
            q: '999999999999999.99999999'
          }
        }
      },
      {
        description: '零交易量',
        data: {
          stream: 'btcusdt@kline_1m',
          data: {
            ...this.generateBinanceKlineData(),
            v: '0',
            q: '0',
            n: 0
          }
        }
      },
      {
        description: '未来时间戳',
        data: {
          stream: 'btcusdt@kline_1m',
          data: {
            ...this.generateBinanceKlineData(),
            t: Date.now() + 365 * 24 * 60 * 60 * 1000, // 一年后
            T: Date.now() + 365 * 24 * 60 * 60 * 1000 + 60000
          }
        }
      },
      {
        description: '过去时间戳',
        data: {
          stream: 'btcusdt@kline_1m',
          data: {
            ...this.generateBinanceKlineData(),
            t: Date.now() - 365 * 24 * 60 * 60 * 1000, // 一年前
            T: Date.now() - 365 * 24 * 60 * 60 * 1000 + 60000
          }
        }
      }
    ];
  }

  /**
   * 生成压力测试数据
   */
  static generateStressTestData(): {
    concurrentConnections: any[];
    highFrequencyMessages: MarketData[];
    largeMessageBatch: MarketData[];
  } {
    return {
      concurrentConnections: Array.from({ length: 100 }, (_, i) => ({
        id: `connection_${i}`,
        subscriptions: [`SYMBOL${i}@kline_1m`, `SYMBOL${i}@trade`]
      })),
      highFrequencyMessages: this.generateHighFrequencyData(60000, 1000), // 1分钟，1000msg/s
      largeMessageBatch: this.generateBatchMarketData(10000, ['kline', 'trade', 'ticker'])
    };
  }

  /**
   * 重置序列ID（用于测试隔离）
   */
  static resetSequenceId(): void {
    this.sequenceId = 0;
  }
}