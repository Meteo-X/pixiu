/**
 * 测试数据集
 * 提供各种预定义的测试数据用于不同测试场景
 */

import { MarketData } from '@pixiu/adapter-base';

/**
 * 基础交易数据模板
 */
export const BASIC_TRADE_DATA: MarketData = {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  type: 'trade',
  timestamp: Date.now(),
  receivedAt: Date.now(),
  data: {
    price: 50000,
    quantity: 0.1,
    side: 'buy',
    tradeId: 123456789,
    timestamp: Date.now()
  },
  metadata: {
    source: 'test-data',
    quality: 1.0
  }
};

/**
 * Ticker数据模板
 */
export const BASIC_TICKER_DATA: MarketData = {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  type: 'ticker',
  timestamp: Date.now(),
  receivedAt: Date.now(),
  data: {
    price: 50000,
    volume: 1000,
    high: 52000,
    low: 48000,
    change: 500,
    changePercent: 0.01
  },
  metadata: {
    source: 'test-data',
    quality: 1.0
  }
};

/**
 * 深度数据模板
 */
export const BASIC_DEPTH_DATA: MarketData = {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  type: 'depth',
  timestamp: Date.now(),
  receivedAt: Date.now(),
  data: {
    bids: [
      [49990, 0.5],
      [49980, 1.0],
      [49970, 1.5],
      [49960, 2.0],
      [49950, 2.5]
    ],
    asks: [
      [50010, 0.5],
      [50020, 1.0],
      [50030, 1.5],
      [50040, 2.0],
      [50050, 2.5]
    ],
    lastUpdateId: 987654321
  },
  metadata: {
    source: 'test-data',
    quality: 1.0
  }
};

/**
 * K线数据模板
 */
export const BASIC_KLINE_DATA: MarketData = {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  type: 'kline_1m',
  timestamp: Date.now(),
  receivedAt: Date.now(),
  data: {
    openTime: Date.now() - 60000,
    closeTime: Date.now(),
    open: 50000,
    high: 50500,
    low: 49500,
    close: 50200,
    volume: 100.5,
    trades: 250
  },
  metadata: {
    source: 'test-data',
    quality: 1.0
  }
};

/**
 * 多交易所测试数据
 */
export const MULTI_EXCHANGE_DATA: MarketData[] = [
  {
    ...BASIC_TRADE_DATA,
    exchange: 'binance',
    symbol: 'BTCUSDT',
    data: { ...BASIC_TRADE_DATA.data, price: 50000 }
  },
  {
    ...BASIC_TRADE_DATA,
    exchange: 'coinbase',
    symbol: 'BTC-USD',
    data: { ...BASIC_TRADE_DATA.data, price: 50050 }
  },
  {
    ...BASIC_TRADE_DATA,
    exchange: 'kraken',
    symbol: 'XBTUSD',
    data: { ...BASIC_TRADE_DATA.data, price: 49980 }
  }
];

/**
 * 多类型测试数据
 */
export const MULTI_TYPE_DATA: MarketData[] = [
  {
    ...BASIC_TRADE_DATA,
    type: 'trade',
    timestamp: Date.now()
  },
  {
    ...BASIC_TICKER_DATA,
    type: 'ticker',
    timestamp: Date.now() + 1
  },
  {
    ...BASIC_DEPTH_DATA,
    type: 'depth',
    timestamp: Date.now() + 2
  },
  {
    ...BASIC_KLINE_DATA,
    type: 'kline_1m',
    timestamp: Date.now() + 3
  }
];

/**
 * 高频交易数据生成器
 */
export function generateHighFrequencyTrades(
  count: number,
  symbol: string = 'BTCUSDT',
  basePrice: number = 50000
): MarketData[] {
  const trades: MarketData[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    const priceVariation = (Math.random() - 0.5) * 1000; // ±500价格波动
    const quantity = Math.random() * 1; // 0-1数量
    
    trades.push({
      exchange: 'binance',
      symbol,
      type: 'trade',
      timestamp: startTime + i,
      receivedAt: startTime + i,
      data: {
        price: basePrice + priceVariation,
        quantity,
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        tradeId: 1000000 + i,
        timestamp: startTime + i
      },
      metadata: {
        source: 'high-frequency-generator',
        sequence: i,
        quality: 1.0
      }
    });
  }
  
  return trades;
}

/**
 * 批量深度数据生成器
 */
export function generateBulkDepthData(
  count: number,
  symbol: string = 'BTCUSDT',
  basePrice: number = 50000,
  depthLevels: number = 20
): MarketData[] {
  const depthData: MarketData[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    const bids: [number, number][] = [];
    const asks: [number, number][] = [];
    
    // 生成买单深度
    for (let j = 0; j < depthLevels; j++) {
      bids.push([
        basePrice - (j + 1) * 10,
        Math.random() * 10
      ]);
    }
    
    // 生成卖单深度
    for (let j = 0; j < depthLevels; j++) {
      asks.push([
        basePrice + (j + 1) * 10,
        Math.random() * 10
      ]);
    }
    
    depthData.push({
      exchange: 'binance',
      symbol,
      type: 'depth',
      timestamp: startTime + i,
      receivedAt: startTime + i,
      data: {
        bids,
        asks,
        lastUpdateId: 900000000 + i
      },
      metadata: {
        source: 'bulk-depth-generator',
        sequence: i,
        levels: depthLevels,
        quality: 1.0
      }
    });
  }
  
  return depthData;
}

/**
 * 压力测试数据生成器
 */
export function generateStressTestData(
  messagesPerSecond: number,
  durationSeconds: number,
  dataTypes: string[] = ['trade', 'ticker', 'depth']
): MarketData[] {
  const totalMessages = messagesPerSecond * durationSeconds;
  const data: MarketData[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < totalMessages; i++) {
    const timestamp = startTime + Math.floor(i / messagesPerSecond) * 1000 + (i % messagesPerSecond);
    const dataType = dataTypes[i % dataTypes.length];
    
    let messageData: MarketData;
    
    switch (dataType) {
      case 'trade':
        messageData = {
          ...BASIC_TRADE_DATA,
          timestamp,
          receivedAt: timestamp,
          data: {
            ...BASIC_TRADE_DATA.data,
            price: 50000 + (Math.random() - 0.5) * 1000,
            quantity: Math.random() * 1,
            tradeId: 1000000 + i
          }
        };
        break;
        
      case 'ticker':
        messageData = {
          ...BASIC_TICKER_DATA,
          timestamp,
          receivedAt: timestamp,
          data: {
            ...BASIC_TICKER_DATA.data,
            price: 50000 + (Math.random() - 0.5) * 1000
          }
        };
        break;
        
      case 'depth':
        messageData = {
          ...BASIC_DEPTH_DATA,
          timestamp,
          receivedAt: timestamp,
          data: {
            ...BASIC_DEPTH_DATA.data,
            lastUpdateId: 900000000 + i
          }
        };
        break;
        
      default:
        messageData = {
          ...BASIC_TRADE_DATA,
          type: dataType,
          timestamp,
          receivedAt: timestamp
        };
    }
    
    messageData.metadata = {
      ...messageData.metadata,
      stressTest: true,
      sequence: i,
      messagesPerSecond,
      durationSeconds
    };
    
    data.push(messageData);
  }
  
  return data;
}

/**
 * 错误测试数据集
 */
export const ERROR_TEST_DATA = {
  MISSING_EXCHANGE: {
    // @ts-ignore
    exchange: undefined,
    symbol: 'BTCUSDT',
    type: 'trade',
    timestamp: Date.now(),
    data: { price: 50000, quantity: 0.1 }
  },
  
  INVALID_TIMESTAMP: {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    type: 'trade',
    timestamp: -1,
    data: { price: 50000, quantity: 0.1 }
  },
  
  MISSING_DATA: {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    type: 'trade',
    timestamp: Date.now(),
    // @ts-ignore
    data: undefined
  },
  
  INVALID_PRICE: {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    type: 'trade',
    timestamp: Date.now(),
    data: { price: -100, quantity: 0.1 }
  },
  
  MALFORMED_DATA: {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    type: 'trade',
    timestamp: Date.now(),
    data: 'not an object'
  }
};

/**
 * 性能基准数据集
 */
export const PERFORMANCE_BENCHMARKS = {
  LATENCY_TEST: {
    LOW_LATENCY: generateHighFrequencyTrades(100, 'BTCUSDT', 50000),
    MEDIUM_LATENCY: generateHighFrequencyTrades(500, 'ETHUSDT', 3000),
    HIGH_LATENCY: generateHighFrequencyTrades(1000, 'ADAUSDT', 1)
  },
  
  THROUGHPUT_TEST: {
    SMALL_BATCH: generateStressTestData(100, 1),
    MEDIUM_BATCH: generateStressTestData(500, 1),
    LARGE_BATCH: generateStressTestData(1000, 1),
    EXTREME_BATCH: generateStressTestData(5000, 1)
  },
  
  MEMORY_TEST: {
    LARGE_DEPTH: generateBulkDepthData(10, 'BTCUSDT', 50000, 1000),
    DEEP_HISTORY: generateHighFrequencyTrades(10000, 'BTCUSDT', 50000)
  }
};

/**
 * 路由测试数据集
 */
export const ROUTING_TEST_DATA = {
  // 按交易所路由
  EXCHANGE_ROUTING: [
    { ...BASIC_TRADE_DATA, exchange: 'binance' },
    { ...BASIC_TRADE_DATA, exchange: 'coinbase' },
    { ...BASIC_TRADE_DATA, exchange: 'kraken' }
  ],
  
  // 按类型路由
  TYPE_ROUTING: [
    { ...BASIC_TRADE_DATA, type: 'trade' },
    { ...BASIC_TICKER_DATA, type: 'ticker' },
    { ...BASIC_DEPTH_DATA, type: 'depth' }
  ],
  
  // 按交易对路由
  SYMBOL_ROUTING: [
    { ...BASIC_TRADE_DATA, symbol: 'BTCUSDT' },
    { ...BASIC_TRADE_DATA, symbol: 'ETHUSDT' },
    { ...BASIC_TRADE_DATA, symbol: 'ADAUSDT' }
  ],
  
  // 复合条件路由
  COMPOSITE_ROUTING: [
    { ...BASIC_TRADE_DATA, exchange: 'binance', symbol: 'BTCUSDT', type: 'trade' },
    { ...BASIC_TICKER_DATA, exchange: 'binance', symbol: 'BTCUSDT', type: 'ticker' },
    { ...BASIC_TRADE_DATA, exchange: 'coinbase', symbol: 'ETHUSDT', type: 'trade' }
  ]
};

/**
 * 获取随机测试数据
 */
export function getRandomTestData(): MarketData {
  const datasets = [BASIC_TRADE_DATA, BASIC_TICKER_DATA, BASIC_DEPTH_DATA, BASIC_KLINE_DATA];
  const randomDataset = datasets[Math.floor(Math.random() * datasets.length)];
  
  return {
    ...randomDataset,
    timestamp: Date.now(),
    receivedAt: Date.now(),
    data: {
      ...randomDataset.data,
      ...(randomDataset.type === 'trade' && {
        price: 50000 + (Math.random() - 0.5) * 1000,
        quantity: Math.random() * 1
      })
    },
    metadata: {
      ...randomDataset.metadata,
      random: true,
      generated: Date.now()
    }
  };
}

/**
 * 创建测试数据样本
 */
export function createTestSample(
  template: MarketData,
  modifications: Partial<MarketData> = {}
): MarketData {
  return {
    ...template,
    ...modifications,
    timestamp: modifications.timestamp || Date.now(),
    receivedAt: modifications.receivedAt || Date.now(),
    data: {
      ...template.data,
      ...modifications.data
    },
    metadata: {
      ...template.metadata,
      ...modifications.metadata,
      sample: true,
      created: Date.now()
    }
  };
}