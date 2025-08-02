/**
 * Mock market data for pipeline testing
 */

import { MarketData } from '@pixiu/adapter-base';
import { v4 as uuidv4 } from 'uuid';

/**
 * 创建模拟的市场数据
 */
export function createMockMarketData(overrides: Partial<MarketData> = {}): MarketData {
  const now = Date.now();
  
  return {
    id: uuidv4(),
    exchange: 'binance',
    symbol: 'BTCUSDT',
    type: 'ticker',
    timestamp: now,
    receivedAt: now,
    data: {
      price: 45000,
      volume: 1.5,
      high: 46000,
      low: 44000,
      change: 1000,
      changePercent: 2.27
    },
    sequence: 1,
    ...overrides
  };
}

/**
 * 创建批量模拟数据
 */
export function createMockMarketDataBatch(count: number, baseData: Partial<MarketData> = {}): MarketData[] {
  const batch: MarketData[] = [];
  const baseTimestamp = Date.now();
  
  for (let i = 0; i < count; i++) {
    batch.push(createMockMarketData({
      ...baseData,
      id: uuidv4(),
      timestamp: baseTimestamp + (i * 100), // 100ms 间隔
      sequence: i + 1
    }));
  }
  
  return batch;
}

/**
 * 创建不同交易所的数据
 */
export function createMultiExchangeData(): MarketData[] {
  const exchanges = ['binance', 'huobi', 'okx', 'coinbase'];
  const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT'];
  const types = ['ticker', 'orderbook', 'trade'];
  
  const data: MarketData[] = [];
  
  exchanges.forEach(exchange => {
    symbols.forEach(symbol => {
      types.forEach(type => {
        data.push(createMockMarketData({
          exchange,
          symbol,
          type,
          data: {
            price: Math.random() * 50000,
            volume: Math.random() * 10
          }
        }));
      });
    });
  });
  
  return data;
}

/**
 * 创建高频率数据模拟
 */
export function createHighFrequencyData(durationMs: number, intervalMs: number = 50): MarketData[] {
  const data: MarketData[] = [];
  const startTime = Date.now();
  const endTime = startTime + durationMs;
  let currentTime = startTime;
  let sequence = 1;
  
  while (currentTime < endTime) {
    data.push(createMockMarketData({
      timestamp: currentTime,
      sequence: sequence++,
      data: {
        price: 45000 + (Math.random() - 0.5) * 1000, // 价格波动
        volume: Math.random() * 5
      }
    }));
    currentTime += intervalMs;
  }
  
  return data;
}

/**
 * 创建带有错误的数据
 */
export function createInvalidMarketData(): MarketData[] {
  return [
    // 缺少必需字段
    createMockMarketData({
      exchange: '',
      symbol: '',
      type: ''
    }),
    // 无效时间戳
    createMockMarketData({
      timestamp: Date.now() + 3600000 // 未来时间
    }),
    // 负价格
    createMockMarketData({
      data: {
        price: -100,
        volume: 1
      }
    }),
    // 缺少数据字段
    createMockMarketData({
      data: null as any
    })
  ];
}

/**
 * 创建性能测试数据
 */
export function createPerformanceTestData(messageCount: number): MarketData[] {
  const data: MarketData[] = [];
  const exchanges = ['binance', 'huobi', 'okx'];
  const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
  
  for (let i = 0; i < messageCount; i++) {
    const exchange = exchanges[i % exchanges.length];
    const symbol = symbols[i % symbols.length];
    
    data.push(createMockMarketData({
      exchange,
      symbol,
      timestamp: Date.now() + i,
      sequence: i + 1,
      data: {
        price: 45000 + (Math.random() - 0.5) * 1000,
        volume: Math.random() * 10,
        high: 46000 + (Math.random() - 0.5) * 500,
        low: 44000 + (Math.random() - 0.5) * 500
      }
    }));
  }
  
  return data;
}

/**
 * 创建内存压力测试数据
 */
export function createMemoryStressTestData(sizeKB: number): MarketData {
  const largeString = 'x'.repeat(sizeKB * 1024); // 创建指定大小的字符串
  
  return createMockMarketData({
    data: {
      price: 45000,
      volume: 1,
      largeField: largeString // 大数据字段
    }
  });
}

/**
 * 数据统计辅助函数
 */
export class MockDataStats {
  static calculateDataSize(data: MarketData[]): number {
    const jsonString = JSON.stringify(data);
    return new Blob([jsonString]).size;
  }
  
  static getUniqueExchanges(data: MarketData[]): string[] {
    return [...new Set(data.map(d => d.exchange))];
  }
  
  static getUniqueSymbols(data: MarketData[]): string[] {
    return [...new Set(data.map(d => d.symbol))];
  }
  
  static groupByExchange(data: MarketData[]): Map<string, MarketData[]> {
    const grouped = new Map<string, MarketData[]>();
    
    data.forEach(item => {
      if (!grouped.has(item.exchange)) {
        grouped.set(item.exchange, []);
      }
      grouped.get(item.exchange)!.push(item);
    });
    
    return grouped;
  }
  
  static groupBySymbol(data: MarketData[]): Map<string, MarketData[]> {
    const grouped = new Map<string, MarketData[]>();
    
    data.forEach(item => {
      if (!grouped.has(item.symbol)) {
        grouped.set(item.symbol, []);
      }
      grouped.get(item.symbol)!.push(item);
    });
    
    return grouped;
  }
}