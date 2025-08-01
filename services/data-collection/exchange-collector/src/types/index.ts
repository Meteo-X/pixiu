import { Decimal } from 'decimal.js';

// 数据类型枚举
export enum DataType {
  TRADE = 'trade',
  KLINE_1M = 'kline_1m',
  KLINE_5M = 'kline_5m',
  KLINE_15M = 'kline_15m',
  KLINE_30M = 'kline_30m',
  KLINE_1H = 'kline_1h',
  KLINE_4H = 'kline_4h',
  KLINE_1D = 'kline_1d',
  TICKER = 'ticker',
  DEPTH = 'depth'
}

// 交易所枚举
export enum Exchange {
  BINANCE = 'binance',
  OKX = 'okx',
  BYBIT = 'bybit'
}

// 统一的市场数据接口
export interface MarketData {
  exchange: Exchange;
  symbol: string;
  timestamp: number;
  type: DataType;
  data: TradeData | KlineData | TickerData | DepthData;
}

// 交易数据
export interface TradeData {
  price: Decimal;
  quantity: Decimal;
  side: 'buy' | 'sell';
  tradeId: string;
  tradeTime: number;
  isBuyerMaker: boolean;
}

// K线数据
export interface KlineData {
  interval: string;
  startTime: number;
  endTime: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  trades: number;
  closed: boolean;
  quoteVolume: Decimal;
  takerBuyBaseVolume: Decimal;
  takerBuyQuoteVolume: Decimal;
}

// 行情数据
export interface TickerData {
  price: Decimal;
  bid: Decimal;
  ask: Decimal;
  bidSize: Decimal;
  askSize: Decimal;
  volume24h: Decimal;
  priceChange24h: Decimal;
  priceChangePercent24h: Decimal;
}

// 深度数据
export interface DepthData {
  bids: Array<[Decimal, Decimal]>; // [price, quantity]
  asks: Array<[Decimal, Decimal]>;
  lastUpdateId: number;
}

// Binance 原始数据类型
export interface BinanceTradeStream {
  e: 'trade';
  E: number;
  s: string;
  t: number;
  p: string;
  q: string;
  T: number;
  m: boolean;
  M?: boolean;
}

export interface BinanceKlineStream {
  e: 'kline';
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    f: number;
    L: number;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    n: number;
    x: boolean;
    q: string;
    V: string;
    Q: string;
    B?: string;
  };
}

export interface BinanceCombinedStream<T> {
  stream: string;
  data: T;
}

// 连接状态
export enum ConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

// 连接统计
export interface ConnectionStats {
  status: ConnectionStatus;
  connectedAt?: number;
  messagesReceived: number;
  bytesReceived: number;
  errors: number;
  lastError?: {
    time: number;
    message: string;
  };
  latency: {
    current: number;
    average: number;
    p95: number;
  };
}

// 连接配置
export interface ConnectionConfig {
  maxConnectionsPerExchange: number;
  maxStreamsPerConnection: number;
  reconnectDelay: number;
  maxReconnectDelay: number;
  heartbeatInterval: number;
  pingTimeout: number;
}

// 服务配置
export interface ServiceConfig {
  server: {
    port: number;
    host: string;
  };
  exchanges: {
    [key: string]: ExchangeConfig;
  };
  googleCloud: GoogleCloudConfig;
  monitoring: MonitoringConfig;
  logging: LoggingConfig;
  connection: ConnectionConfig;
}

export interface ExchangeConfig {
  wsEndpoint: string;
  restEndpoint?: string;
  symbols: string[];
  dataTypes: DataType[];
  connections: {
    max: number;
    streamsPerConnection: number;
  };
}

export interface GoogleCloudConfig {
  projectId: string;
  pubsub: {
    enabled: boolean;
    emulatorHost?: string;
    topicPrefix: string;
    publishSettings: {
      enableMessageOrdering: boolean;
      batchSettings: {
        maxMessages: number;
        maxBytes: number;
        maxLatency: number;
      };
      retrySettings: {
        maxRetries: number;
        initialRetryDelay: number;
        maxRetryDelay: number;
      };
    };
  };
}

export interface MonitoringConfig {
  prometheus: {
    enabled: boolean;
    port: number;
    path: string;
  };
  healthCheck: {
    interval: number;
    timeout: number;
  };
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'simple';
  file?: {
    enabled: boolean;
    path: string;
    maxSize: string;
    maxFiles: number;
  };
}

// 指标接口
export interface Metrics {
  connections: {
    active: number;
    total: number;
    failures: number;
    reconnects: number;
  };
  messages: {
    received: number;
    processed: number;
    sent: number;
    errors: number;
  };
  latency: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
  };
}

// 错误类型
export class ExchangeCollectorError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ExchangeCollectorError';
  }
}

export class ConnectionError extends ExchangeCollectorError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
  }
}

export class DataParsingError extends ExchangeCollectorError {
  constructor(message: string, cause?: Error) {
    super(message, 'DATA_PARSING_ERROR', cause);
    this.name = 'DataParsingError';
  }
}

export class PubSubError extends ExchangeCollectorError {
  constructor(message: string, cause?: Error) {
    super(message, 'PUBSUB_ERROR', cause);
    this.name = 'PubSubError';
  }
}