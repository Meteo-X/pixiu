// Binance WebSocket 数据类型定义

// Trade 数据类型
export interface BinanceTradeStream {
  e: 'trade';          // Event type
  E: number;           // Event time
  s: string;           // Symbol
  t: number;           // Trade ID
  p: string;           // Price
  q: string;           // Quantity
  T: number;           // Trade time
  m: boolean;          // Is the buyer the market maker?
  M?: boolean;         // Ignore
}

// Kline 数据类型
export interface BinanceKlineStream {
  e: 'kline';          // Event type
  E: number;           // Event time
  s: string;           // Symbol
  k: {
    t: number;         // Kline start time
    T: number;         // Kline close time
    s: string;         // Symbol
    i: string;         // Interval
    f: number;         // First trade ID
    L: number;         // Last trade ID
    o: string;         // Open price
    c: string;         // Close price
    h: string;         // High price
    l: string;         // Low price
    v: string;         // Base asset volume
    n: number;         // Number of trades
    x: boolean;        // Is this kline closed?
    q: string;         // Quote asset volume
    V: string;         // Taker buy base asset volume
    Q: string;         // Taker buy quote asset volume
    B?: string;        // Ignore
  };
}

// Combined Stream 数据类型
export interface BinanceCombinedStream<T> {
  stream: string;
  data: T;
}

// 支持的 Kline 间隔
export type KlineInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M';

// WebSocket 消息类型
export type BinanceWSMessage = BinanceTradeStream | BinanceKlineStream | BinanceCombinedStream<BinanceTradeStream | BinanceKlineStream>;

// 实验统计数据
export interface ExperimentStats {
  connectionStartTime: number;
  messagesReceived: number;
  bytesReceived: number;
  latencies: number[];
  errors: Array<{
    time: number;
    error: string;
  }>;
  dataPoints: {
    trades: number;
    klines: number;
  };
}