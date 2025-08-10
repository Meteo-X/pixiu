/**
 * 测试数据固件
 * 提供标准的测试数据样本
 */

import { DataType } from '@pixiu/adapter-base';
import { BinanceConfig } from '../../src';

/**
 * Binance消息格式的测试数据
 */
export const BinanceTestMessages = {
  /**
   * 交易数据消息
   */
  trade: {
    valid: {
      stream: 'btcusdt@trade',
      data: {
        e: 'trade',          // 事件类型
        E: 1699123456789,    // 事件时间
        s: 'BTCUSDT',        // 交易对
        t: 12345,            // 交易ID
        p: '50000.00',       // 价格
        q: '0.1',            // 数量
        b: 88,               // 买方订单ID
        a: 50,               // 卖方订单ID
        T: 1699123456789,    // 交易时间
        m: false,            // 是否为做市商买入
        M: true              // 忽略
      }
    },
    sellOrder: {
      stream: 'ethusdt@trade',
      data: {
        e: 'trade',
        E: 1699123456790,
        s: 'ETHUSDT',
        t: 12346,
        p: '3000.00',
        q: '0.5',
        b: 89,
        a: 51,
        T: 1699123456790,
        m: true,             // 做市商买入，所以是卖单
        M: true
      }
    },
    invalidPrice: {
      stream: 'btcusdt@trade',
      data: {
        e: 'trade',
        E: 1699123456789,
        s: 'BTCUSDT',
        t: 12345,
        p: 'invalid-price',  // 无效价格
        q: '0.1',
        T: 1699123456789,
        m: false
      }
    },
    missingFields: {
      stream: 'btcusdt@trade',
      data: {
        e: 'trade',
        s: 'BTCUSDT'
        // 缺少必要字段
      }
    }
  },

  /**
   * 24小时行情数据
   */
  ticker: {
    valid: {
      stream: 'btcusdt@ticker',
      data: {
        e: '24hrTicker',      // 事件类型
        E: 1699123456789,     // 事件时间
        s: 'BTCUSDT',         // 交易对
        p: '1000.00',         // 24小时价格变化
        P: '2.00',            // 24小时价格变化百分比
        w: '49500.00',        // 24小时加权平均价
        x: '48000.00',        // 前一交易日的收盘价
        c: '50000.00',        // 最新价格
        Q: '10.5',            // 最新成交量
        b: '49999.00',        // 最佳买价
        B: '5.0',             // 最佳买价数量
        a: '50001.00',        // 最佳卖价
        A: '3.0',             // 最佳卖价数量
        o: '49000.00',        // 开盘价
        h: '51000.00',        // 最高价
        l: '48500.00',        // 最低价
        v: '15000.0',         // 24小时成交量
        q: '750000000.00',    // 24小时成交额
        O: 1699037056789,     // 统计开始时间
        C: 1699123456789,     // 统计结束时间
        F: 158340,            // 第一笔交易ID
        L: 162351,            // 最后一笔交易ID
        n: 4012               // 交易笔数
      }
    },
    zeroPrices: {
      stream: 'ethusdt@ticker',
      data: {
        e: '24hrTicker',
        E: 1699123456789,
        s: 'ETHUSDT',
        p: '0.00',
        P: '0.00',
        c: '3000.00',
        b: '2999.00',
        a: '3001.00',
        o: '3000.00',
        h: '3000.00',
        l: '3000.00',
        v: '1000.0',
        q: '3000000.00'
      }
    }
  },

  /**
   * K线数据
   */
  kline: {
    oneMinute: {
      stream: 'btcusdt@kline_1m',
      data: {
        e: 'kline',           // 事件类型
        E: 1699123456789,     // 事件时间
        s: 'BTCUSDT',         // 交易对
        k: {
          t: 1699123440000,   // 开盘时间
          T: 1699123499999,   // 收盘时间
          s: 'BTCUSDT',       // 交易对
          i: '1m',            // K线间隔
          f: 100,             // 第一笔交易ID
          L: 200,             // 最后一笔交易ID
          o: '49900.00',      // 开盘价
          c: '50000.00',      // 收盘价
          h: '50100.00',      // 最高价
          l: '49850.00',      // 最低价
          v: '10.5',          // 成交量
          n: 101,             // 交易笔数
          x: true,            // 这根K线是否完结
          q: '524950.00',     // 成交额
          V: '5.0',           // 主动买入成交量
          Q: '249975.00',     // 主动买入成交额
          B: '0'              // 忽略此参数
        }
      }
    },
    fiveMinute: {
      stream: 'ethusdt@kline_5m',
      data: {
        e: 'kline',
        E: 1699123456789,
        s: 'ETHUSDT',
        k: {
          t: 1699123200000,
          T: 1699123499999,
          s: 'ETHUSDT',
          i: '5m',
          o: '2950.00',
          c: '3000.00',
          h: '3050.00',
          l: '2900.00',
          v: '50.0',
          x: false            // 未完结的K线
        }
      }
    },
    oneHour: {
      stream: 'bnbusdt@kline_1h',
      data: {
        e: 'kline',
        E: 1699123456789,
        s: 'BNBUSDT',
        k: {
          t: 1699120800000,
          T: 1699124399999,
          s: 'BNBUSDT',
          i: '1h',
          o: '240.00',
          c: '245.50',
          h: '248.00',
          l: '238.50',
          v: '1000.0',
          x: true
        }
      }
    },
    oneDay: {
      stream: 'adausdt@kline_1d',
      data: {
        e: 'kline',
        E: 1699123456789,
        s: 'ADAUSDT',
        k: {
          t: 1699056000000,
          T: 1699142399999,
          s: 'ADAUSDT',
          i: '1d',
          o: '0.3500',
          c: '0.3580',
          h: '0.3650',
          l: '0.3450',
          v: '1000000.0',
          x: false
        }
      }
    }
  },

  /**
   * 深度数据（Order Book）
   */
  depth: {
    valid: {
      stream: 'btcusdt@depth',
      data: {
        e: 'depthUpdate',     // 事件类型
        E: 1699123456789,     // 事件时间
        s: 'BTCUSDT',         // 交易对
        U: 157,               // 从上次推送至今新增的第一个 update Id
        u: 160,               // 从上次推送至今新增的最后一个 update Id
        b: [                  // 买单深度
          ['49990.00', '1.5'],
          ['49985.00', '2.0'],
          ['49980.00', '0.0'] // 数量为0表示移除该价位
        ],
        a: [                  // 卖单深度
          ['50010.00', '1.0'],
          ['50015.00', '1.8'],
          ['50020.00', '2.5']
        ]
      }
    }
  },

  /**
   * 无效或未知消息
   */
  invalid: {
    unknownEvent: {
      stream: 'btcusdt@unknown',
      data: {
        e: 'unknownEvent',
        s: 'BTCUSDT'
      }
    },
    noStream: {
      data: {
        e: 'trade',
        s: 'BTCUSDT'
      }
    },
    noData: {
      stream: 'btcusdt@trade'
    },
    emptyData: {
      stream: 'btcusdt@trade',
      data: {}
    },
    nullData: {
      stream: 'btcusdt@trade',
      data: null
    }
  }
};

/**
 * 配置固件
 */
export const ConfigFixtures = {
  /**
   * 基础有效配置
   */
  basicValid: {
    exchange: 'binance',
    endpoints: {
      ws: 'wss://stream.binance.com:9443/ws',
      rest: 'https://api.binance.com/api'
    },
    connection: {
      timeout: 10000,
      maxRetries: 5,
      retryInterval: 2000,
      heartbeatInterval: 30000
    },
    binance: {
      testnet: false,
      enableCompression: false,
      autoManageStreams: true
    }
  } as BinanceConfig,

  /**
   * 测试网配置
   */
  testnet: {
    exchange: 'binance',
    endpoints: {
      ws: 'wss://testnet.binance.vision/ws',
      rest: 'https://testnet.binance.vision/api'
    },
    connection: {
      timeout: 5000,
      maxRetries: 3,
      retryInterval: 1000,
      heartbeatInterval: 30000
    },
    binance: {
      testnet: true,
      enableCompression: true,
      autoManageStreams: true
    }
  } as BinanceConfig,

  /**
   * 带初始订阅的配置
   */
  withSubscription: {
    exchange: 'binance',
    endpoints: {
      ws: 'wss://stream.binance.com:9443/ws',
      rest: 'https://api.binance.com/api'
    },
    subscription: {
      symbols: ['BTC/USDT', 'ETH/USDT'],
      dataTypes: [DataType.TRADE, DataType.TICKER]
    },
    binance: {
      autoManageStreams: true
    }
  } as BinanceConfig,

  /**
   * 无效配置样本
   */
  invalid: {
    empty: {} as BinanceConfig,
    
    noEndpoints: {
      exchange: 'binance'
    } as BinanceConfig,
    
    noWebSocket: {
      exchange: 'binance',
      endpoints: {
        rest: 'https://api.binance.com/api'
      }
    } as BinanceConfig,
    
    noRest: {
      exchange: 'binance',
      endpoints: {
        ws: 'wss://stream.binance.com:9443/ws'
      }
    } as BinanceConfig,
    
    invalidUrls: {
      exchange: 'binance',
      endpoints: {
        ws: 'invalid-url',
        rest: 'not-a-url'
      }
    } as BinanceConfig
  }
};

/**
 * 订阅配置固件
 */
export const SubscriptionFixtures = {
  /**
   * 单个交易对，单个数据类型
   */
  single: {
    symbols: ['BTC/USDT'],
    dataTypes: [DataType.TRADE]
  },

  /**
   * 多个交易对，多个数据类型
   */
  multiple: {
    symbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'],
    dataTypes: [DataType.TRADE, DataType.TICKER, DataType.KLINE_1M]
  },

  /**
   * 所有支持的数据类型
   */
  allDataTypes: {
    symbols: ['BTC/USDT'],
    dataTypes: [
      DataType.TRADE,
      DataType.TICKER, 
      DataType.KLINE_1M,
      DataType.KLINE_5M,
      DataType.KLINE_1H,
      DataType.KLINE_1D,
      DataType.DEPTH,
      DataType.ORDER_BOOK
    ]
  },

  /**
   * 大量交易对
   */
  manySymbols: {
    symbols: Array.from({ length: 50 }, (_, i) => `SYMBOL${i}/USDT`),
    dataTypes: [DataType.TRADE]
  },

  /**
   * 无效订阅配置
   */
  invalid: {
    empty: {},
    noSymbols: { dataTypes: [DataType.TRADE] },
    noDataTypes: { symbols: ['BTC/USDT'] },
    emptySymbols: { symbols: [], dataTypes: [DataType.TRADE] },
    emptyDataTypes: { symbols: ['BTC/USDT'], dataTypes: [] },
    invalidSymbols: { symbols: [''], dataTypes: [DataType.TRADE] },
    invalidDataTypes: { symbols: ['BTC/USDT'], dataTypes: ['invalid'] }
  }
};

/**
 * 性能测试数据生成器
 */
export class PerformanceDataGenerator {
  /**
   * 生成高频交易数据
   */
  static generateTradeMessages(count: number, symbol = 'BTCUSDT', basePrice = 50000): any[] {
    const messages = [];
    const startTime = Date.now();

    for (let i = 0; i < count; i++) {
      const price = basePrice + (Math.random() - 0.5) * basePrice * 0.02; // ±1% 波动
      const quantity = Math.random() * 10;

      messages.push({
        stream: `${symbol.toLowerCase()}@trade`,
        data: {
          e: 'trade',
          E: startTime + i,
          s: symbol,
          t: i + 1,
          p: price.toFixed(2),
          q: quantity.toFixed(4),
          T: startTime + i,
          m: i % 2 === 0
        }
      });
    }

    return messages;
  }

  /**
   * 生成多交易对数据
   */
  static generateMultiSymbolMessages(symbols: string[], messageCount: number): any[] {
    const messages: any[] = [];

    symbols.forEach((symbol, symbolIndex) => {
      const symbolMessages = this.generateTradeMessages(
        Math.floor(messageCount / symbols.length),
        symbol,
        1000 * (symbolIndex + 1)
      );
      messages.push(...symbolMessages);
    });

    // 随机打乱消息顺序，模拟真实环境
    return messages.sort(() => Math.random() - 0.5);
  }

  /**
   * 生成混合类型数据
   */
  static generateMixedTypeMessages(symbol: string, count: number): any[] {
    const messages = [];
    const startTime = Date.now();
    const types = ['trade', 'ticker', 'kline'];

    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      const timestamp = startTime + i * 100;

      switch (type) {
        case 'trade':
          messages.push({
            stream: `${symbol.toLowerCase()}@trade`,
            data: {
              e: 'trade',
              E: timestamp,
              s: symbol,
              t: i + 1,
              p: (50000 + Math.random() * 1000).toFixed(2),
              q: (Math.random() * 10).toFixed(4),
              T: timestamp,
              m: i % 2 === 0
            }
          });
          break;

        case 'ticker':
          messages.push({
            stream: `${symbol.toLowerCase()}@ticker`,
            data: {
              e: '24hrTicker',
              E: timestamp,
              s: symbol,
              c: (50000 + Math.random() * 1000).toFixed(2),
              b: (49999 + Math.random() * 1000).toFixed(2),
              a: (50001 + Math.random() * 1000).toFixed(2),
              P: (Math.random() * 10 - 5).toFixed(2),
              v: (Math.random() * 10000).toFixed(2),
              h: (51000 + Math.random() * 1000).toFixed(2),
              l: (49000 + Math.random() * 1000).toFixed(2)
            }
          });
          break;

        case 'kline':
          messages.push({
            stream: `${symbol.toLowerCase()}@kline_1m`,
            data: {
              e: 'kline',
              E: timestamp,
              s: symbol,
              k: {
                t: timestamp - 60000,
                T: timestamp,
                s: symbol,
                i: '1m',
                o: (49900 + Math.random() * 200).toFixed(2),
                c: (50000 + Math.random() * 200).toFixed(2),
                h: (50100 + Math.random() * 200).toFixed(2),
                l: (49850 + Math.random() * 200).toFixed(2),
                v: (Math.random() * 100).toFixed(2),
                x: true
              }
            }
          });
          break;
      }
    }

    return messages;
  }
}

/**
 * 测试断言辅助函数
 */
export class TestAssertions {
  /**
   * 验证解析后的交易数据格式
   */
  static assertTradeData(data: any, expectedSymbol: string) {
    expect(data).toMatchObject({
      exchange: 'binance',
      symbol: expectedSymbol,
      type: DataType.TRADE,
      data: expect.objectContaining({
        id: expect.any(String),
        price: expect.any(Number),
        quantity: expect.any(Number),
        side: expect.stringMatching(/^(buy|sell)$/),
        timestamp: expect.any(Number)
      }),
      timestamp: expect.any(Number),
      receivedAt: expect.any(Number)
    });
  }

  /**
   * 验证解析后的行情数据格式
   */
  static assertTickerData(data: any, expectedSymbol: string) {
    expect(data).toMatchObject({
      exchange: 'binance',
      symbol: expectedSymbol,
      type: DataType.TICKER,
      data: expect.objectContaining({
        lastPrice: expect.any(Number),
        bidPrice: expect.any(Number),
        askPrice: expect.any(Number),
        change24h: expect.any(Number),
        volume24h: expect.any(Number),
        high24h: expect.any(Number),
        low24h: expect.any(Number)
      }),
      timestamp: expect.any(Number),
      receivedAt: expect.any(Number)
    });
  }

  /**
   * 验证解析后的K线数据格式
   */
  static assertKlineData(data: any, expectedSymbol: string, expectedType: DataType) {
    expect(data).toMatchObject({
      exchange: 'binance',
      symbol: expectedSymbol,
      type: expectedType,
      data: expect.objectContaining({
        open: expect.any(Number),
        high: expect.any(Number),
        low: expect.any(Number),
        close: expect.any(Number),
        volume: expect.any(Number),
        openTime: expect.any(Number),
        closeTime: expect.any(Number),
        interval: expect.any(String)
      }),
      timestamp: expect.any(Number),
      receivedAt: expect.any(Number)
    });
  }

  /**
   * 验证订阅信息格式
   */
  static assertSubscriptionInfo(subscription: any, expectedSymbol: string, expectedDataType: DataType) {
    expect(subscription).toMatchObject({
      id: expect.any(String),
      symbol: expectedSymbol,
      dataType: expectedDataType,
      subscribedAt: expect.any(Number),
      active: true
    });
  }
}

/**
 * 时间工具
 */
export class TestTimeUtils {
  /**
   * 等待指定时间
   */
  static wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 等待条件满足
   */
  static async waitFor(condition: () => boolean, timeout = 5000, interval = 50): Promise<void> {
    const startTime = Date.now();
    
    while (!condition()) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Condition not met within ${timeout}ms`);
      }
      await this.wait(interval);
    }
  }

  /**
   * 测量执行时间
   */
  static async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    
    return { result, duration };
  }
}