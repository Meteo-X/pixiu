/**
 * 模拟数据生成器 - 用于开发测试
 */

export interface MockTradeData {
  price: string;
  quantity: string;
  side: 'buy' | 'sell';
  tradeId: string;
}

export interface MockTickerData {
  price: string;
  priceChange24h: string;
  priceChangePercent24h: string;
  volume24h: string;
  high24h: string;
  low24h: string;
}

export interface MockKlineData {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  interval: string;
}

export interface MockDepthData {
  bids: Array<[string, string]>; // [price, quantity]
  asks: Array<[string, string]>;
}

// 生成随机价格变动
function generatePriceMovement(basePrice: number, volatility: number = 0.001): number {
  const change = (Math.random() - 0.5) * 2 * volatility;
  return basePrice * (1 + change);
}

// 生成随机数量
function generateQuantity(min: number = 0.1, max: number = 10): string {
  return (Math.random() * (max - min) + min).toFixed(6);
}

// 模拟交易数据生成器
export function generateMockTradeData(_symbol: string, basePrice: number): MockTradeData {
  const price = generatePriceMovement(basePrice);
  return {
    price: price.toFixed(2),
    quantity: generateQuantity(),
    side: Math.random() > 0.5 ? 'buy' : 'sell',
    tradeId: Math.random().toString(36).substr(2, 9),
  };
}

// 模拟价格行情数据生成器
export function generateMockTickerData(_symbol: string, basePrice: number): MockTickerData {
  const currentPrice = generatePriceMovement(basePrice);
  const change24h = (currentPrice - basePrice) / basePrice;
  
  return {
    price: currentPrice.toFixed(2),
    priceChange24h: (currentPrice - basePrice).toFixed(2),
    priceChangePercent24h: (change24h * 100).toFixed(2),
    volume24h: (Math.random() * 1000000 + 500000).toFixed(2),
    high24h: (currentPrice * (1 + Math.random() * 0.05)).toFixed(2),
    low24h: (currentPrice * (1 - Math.random() * 0.05)).toFixed(2),
  };
}

// 模拟K线数据生成器
export function generateMockKlineData(_symbol: string, basePrice: number): MockKlineData {
  const open = basePrice;
  const close = generatePriceMovement(basePrice);
  const high = Math.max(open, close) * (1 + Math.random() * 0.02);
  const low = Math.min(open, close) * (1 - Math.random() * 0.02);
  
  return {
    open: open.toFixed(2),
    high: high.toFixed(2),
    low: low.toFixed(2),
    close: close.toFixed(2),
    volume: (Math.random() * 1000 + 100).toFixed(2),
    interval: '1m',
  };
}

// 模拟订单簿深度数据生成器
export function generateMockDepthData(_symbol: string, basePrice: number): MockDepthData {
  const bids: Array<[string, string]> = [];
  const asks: Array<[string, string]> = [];
  
  // 生成买盘数据
  for (let i = 0; i < 10; i++) {
    const price = (basePrice * (1 - (i + 1) * 0.001)).toFixed(2);
    const quantity = generateQuantity(1, 50);
    bids.push([price, quantity]);
  }
  
  // 生成卖盘数据
  for (let i = 0; i < 10; i++) {
    const price = (basePrice * (1 + (i + 1) * 0.001)).toFixed(2);
    const quantity = generateQuantity(1, 50);
    asks.push([price, quantity]);
  }
  
  return { bids, asks };
}

// 模拟数据生成器主类
export class MockDataGenerator {
  private symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  private basePrices = {
    BTCUSDT: 45000,
    ETHUSDT: 3000,
    BNBUSDT: 300,
  };
  private intervals: NodeJS.Timeout[] = [];

  // 开始生成模拟数据
  startGeneration(onMessage: (message: any) => void, intervalMs: number = 1000) {
    this.symbols.forEach(symbol => {
      const interval = setInterval(() => {
        const basePrice = this.basePrices[symbol as keyof typeof this.basePrices];
        const messageTypes = ['trade', 'ticker', 'kline', 'depth'];
        const randomType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
        
        let data;
        switch (randomType) {
          case 'trade':
            data = generateMockTradeData(symbol, basePrice);
            break;
          case 'ticker':
            data = generateMockTickerData(symbol, basePrice);
            break;
          case 'kline':
            data = generateMockKlineData(symbol, basePrice);
            break;
          case 'depth':
            data = generateMockDepthData(symbol, basePrice);
            break;
          default:
            data = generateMockTradeData(symbol, basePrice);
        }
        
        const message = {
          type: randomType,
          exchange: 'binance',
          symbol,
          data,
          timestamp: new Date().toISOString(),
        };
        
        onMessage(message);
      }, intervalMs + Math.random() * intervalMs); // 添加一些随机性
      
      this.intervals.push(interval);
    });
  }

  // 停止生成数据
  stopGeneration() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }
}