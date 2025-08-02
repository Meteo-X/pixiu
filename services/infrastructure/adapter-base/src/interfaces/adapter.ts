/**
 * 交易适配器统一接口定义
 */

import { EventEmitter } from 'events';

export enum AdapterStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export enum DataType {
  TRADE = 'trade',
  TICKER = 'ticker',
  KLINE_1M = 'kline_1m',
  KLINE_5M = 'kline_5m',
  KLINE_1H = 'kline_1h',
  KLINE_1D = 'kline_1d',
  DEPTH = 'depth',
  ORDER_BOOK = 'orderbook'
}

export interface AdapterConfig {
  /** 交易所名称 */
  exchange: string;
  /** API端点配置 */
  endpoints: {
    ws: string;
    rest: string;
  };
  /** 连接配置 */
  connection: {
    timeout: number;
    maxRetries: number;
    retryInterval: number;
    heartbeatInterval: number;
  };
  /** 认证配置 */
  auth?: {
    apiKey?: string;
    apiSecret?: string;
  };
  /** 代理配置 */
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  /** 自定义标签 */
  labels?: Record<string, string>;
}

export interface SubscriptionConfig {
  /** 交易对列表 */
  symbols: string[];
  /** 数据类型列表 */
  dataTypes: DataType[];
  /** 是否启用数据压缩 */
  enableCompression?: boolean;
  /** 是否启用数据聚合 */
  enableAggregation?: boolean;
  /** 批量订阅大小 */
  batchSize?: number;
}

export interface AdapterMetrics {
  /** 连接状态 */
  status: AdapterStatus;
  /** 连接时间 */
  connectedAt?: number;
  /** 最后心跳时间 */
  lastHeartbeat?: number;
  /** 接收消息数 */
  messagesReceived: number;
  /** 发送消息数 */
  messagesSent: number;
  /** 错误数 */
  errorCount: number;
  /** 重连次数 */
  reconnectCount: number;
  /** 平均延迟（毫秒） */
  averageLatency: number;
  /** 数据质量分数 */
  dataQualityScore: number;
}

export interface AdapterEventMap {
  /** 连接状态变化 */
  statusChange: (status: AdapterStatus, previousStatus: AdapterStatus) => void;
  /** 接收到数据 */
  data: (data: MarketData) => void;
  /** 发生错误 */
  error: (error: Error) => void;
  /** 连接建立 */
  connected: () => void;
  /** 连接断开 */
  disconnected: (reason?: string) => void;
  /** 开始重连 */
  reconnecting: (attempt: number) => void;
  /** 收到心跳 */
  heartbeat: (timestamp: number) => void;
  /** 订阅成功 */
  subscribed: (subscription: SubscriptionInfo) => void;
  /** 取消订阅 */
  unsubscribed: (subscription: SubscriptionInfo) => void;
}

export interface SubscriptionInfo {
  /** 订阅ID */
  id: string;
  /** 交易对 */
  symbol: string;
  /** 数据类型 */
  dataType: DataType;
  /** 订阅时间 */
  subscribedAt: number;
  /** 是否活跃 */
  active: boolean;
}

export interface MarketData {
  /** 交易所 */
  exchange: string;
  /** 交易对 */
  symbol: string;
  /** 数据类型 */
  type: DataType;
  /** 时间戳 */
  timestamp: number;
  /** 数据内容 */
  data: any;
  /** 接收时间 */
  receivedAt: number;
  /** 延迟（毫秒） */
  latency?: number;
}

export interface TradeData {
  /** 交易ID */
  id: string;
  /** 价格 */
  price: number;
  /** 数量 */
  quantity: number;
  /** 买卖方向 */
  side: 'buy' | 'sell';
  /** 交易时间 */
  timestamp: number;
}

export interface TickerData {
  /** 最新价格 */
  lastPrice: number;
  /** 买一价 */
  bidPrice: number;
  /** 卖一价 */
  askPrice: number;
  /** 24小时涨跌幅 */
  change24h: number;
  /** 24小时成交量 */
  volume24h: number;
  /** 最高价 */
  high24h: number;
  /** 最低价 */
  low24h: number;
}

export interface KlineData {
  /** 开盘价 */
  open: number;
  /** 最高价 */
  high: number;
  /** 最低价 */
  low: number;
  /** 收盘价 */
  close: number;
  /** 成交量 */
  volume: number;
  /** 开盘时间 */
  openTime: number;
  /** 收盘时间 */
  closeTime: number;
  /** 时间间隔 */
  interval: string;
}

export interface DepthData {
  /** 买盘 */
  bids: Array<[number, number]>; // [price, quantity]
  /** 卖盘 */
  asks: Array<[number, number]>; // [price, quantity]
  /** 更新时间 */
  updateTime: number;
}

/**
 * 交易适配器接口
 */
export interface ExchangeAdapter extends EventEmitter {
  /** 交易所名称 */
  readonly exchange: string;
  
  /** 获取当前状态 */
  getStatus(): AdapterStatus;
  
  /** 获取配置 */
  getConfig(): AdapterConfig;
  
  /** 获取指标 */
  getMetrics(): AdapterMetrics;
  
  /** 初始化适配器 */
  initialize(config: AdapterConfig): Promise<void>;
  
  /** 连接到交易所 */
  connect(): Promise<void>;
  
  /** 断开连接 */
  disconnect(): Promise<void>;
  
  /** 订阅数据 */
  subscribe(config: SubscriptionConfig): Promise<SubscriptionInfo[]>;
  
  /** 取消订阅 */
  unsubscribe(subscriptionIds: string[]): Promise<void>;
  
  /** 取消所有订阅 */
  unsubscribeAll(): Promise<void>;
  
  /** 获取活跃订阅 */
  getSubscriptions(): SubscriptionInfo[];
  
  /** 发送心跳 */
  sendHeartbeat(): Promise<void>;
  
  /** 重新连接 */
  reconnect(): Promise<void>;
  
  /** 销毁适配器 */
  destroy(): Promise<void>;
  
  /** 设置事件监听器 */
  on<K extends keyof AdapterEventMap>(event: K, listener: AdapterEventMap[K]): this;
  
  /** 移除事件监听器 */
  off<K extends keyof AdapterEventMap>(event: K, listener: AdapterEventMap[K]): this;
  
  /** 触发事件 */
  emit<K extends keyof AdapterEventMap>(event: K, ...args: Parameters<AdapterEventMap[K]>): boolean;
}