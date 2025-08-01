// Core interfaces for Binance Adapter
// Based on experiments/binance-ws-experiment and exchange-collector types

// ============================================================================
// Data Types (duplicated from exchange-collector for independence)
// ============================================================================

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

export enum Exchange {
  BINANCE = 'binance',
  OKX = 'okx',
  BYBIT = 'bybit'
}

// ============================================================================
// Exchange Adapter Core Interfaces
// ============================================================================

/**
 * Unified interface for all exchange adapters
 */
export interface ExchangeAdapter {
  /** Unique identifier for the exchange */
  readonly exchange: string;
  
  /** Initialize the adapter with configuration */
  initialize(config: AdapterConfig): Promise<void>;
  
  /** Subscribe to market data streams */
  subscribe(subscriptions: DataSubscription[]): Promise<void>;
  
  /** Unsubscribe from market data streams */
  unsubscribe(subscriptions: DataSubscription[]): Promise<void>;
  
  /** Get current connection status */
  getStatus(): AdapterStatus;
  
  /** Get connection statistics */
  getStats(): AdapterStats;
  
  /** Start the adapter */
  start(): Promise<void>;
  
  /** Stop the adapter gracefully */
  stop(): Promise<void>;
  
  /** Register event handlers */
  on(event: AdapterEvent, handler: AdapterEventHandler): void;
  
  /** Remove event handlers */
  off(event: AdapterEvent, handler: AdapterEventHandler): void;
}

/**
 * Data subscription model
 */
export interface DataSubscription {
  /** Symbol to subscribe to (e.g., 'BTCUSDT') */
  symbol: string;
  
  /** Type of data to subscribe to */
  dataType: DataType;
  
  /** Additional parameters specific to data type */
  params?: SubscriptionParams;
}

/**
 * Parameters for specific subscription types
 */
export interface SubscriptionParams {
  /** For kline subscriptions - interval (1m, 5m, 1h, etc.) */
  interval?: string;
  
  /** For depth subscriptions - update speed */
  speed?: string;
  
  /** For depth subscriptions - number of levels */
  levels?: number;
}

/**
 * Adapter configuration
 */
export interface AdapterConfig {
  /** WebSocket endpoint URL */
  wsEndpoint: string;
  
  /** REST API endpoint URL (optional) */
  restEndpoint?: string;
  
  /** Connection configuration */
  connection: ConnectionConfig;
  
  /** Retry configuration */
  retry: RetryConfig;
  
  /** Google Cloud configuration */
  googleCloud?: GoogleCloudConfig;
  
  /** Monitoring configuration */
  monitoring?: MonitoringConfig;
}

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  /** Maximum number of concurrent connections */
  maxConnections: number;
  
  /** Maximum streams per connection */
  maxStreamsPerConnection: number;
  
  /** Heartbeat interval in milliseconds */
  heartbeatInterval: number;
  
  /** Ping timeout in milliseconds */
  pingTimeout: number;
  
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  
  /** Initial retry delay in milliseconds */
  initialDelay: number;
  
  /** Maximum retry delay in milliseconds */
  maxDelay: number;
  
  /** Backoff multiplier */
  backoffMultiplier: number;
  
  /** Whether to use jitter */
  jitter: boolean;
}

/**
 * Google Cloud configuration
 */
export interface GoogleCloudConfig {
  /** Google Cloud project ID */
  projectId: string;
  
  /** Pub/Sub configuration */
  pubsub: PubSubConfig;
  
  /** Monitoring configuration */
  monitoring: GCPMonitoringConfig;
}

/**
 * Google Cloud Pub/Sub configuration
 */
export interface PubSubConfig {
  /** Whether Pub/Sub is enabled */
  enabled: boolean;
  
  /** Emulator host for development */
  emulatorHost?: string;
  
  /** Topic naming prefix */
  topicPrefix: string;
  
  /** Publish settings */
  publishSettings: PubSubPublishSettings;
}

/**
 * Pub/Sub publish settings
 */
export interface PubSubPublishSettings {
  /** Enable message ordering */
  enableMessageOrdering: boolean;
  
  /** Batch settings */
  batchSettings: {
    maxMessages: number;
    maxBytes: number;
    maxLatency: number;
  };
  
  /** Retry settings */
  retrySettings: {
    maxRetries: number;
    initialRetryDelay: number;
    maxRetryDelay: number;
  };
}

/**
 * Google Cloud Monitoring configuration
 */
export interface GCPMonitoringConfig {
  /** Whether monitoring is enabled */
  enabled: boolean;
  
  /** Metric name prefix */
  metricPrefix: string;
  
  /** Custom labels to add to all metrics */
  customLabels?: Record<string, string>;
}

/**
 * General monitoring configuration
 */
export interface MonitoringConfig {
  /** Prometheus configuration */
  prometheus: {
    enabled: boolean;
    port: number;
    path: string;
  };
  
  /** Health check configuration */
  healthCheck: {
    interval: number;
    timeout: number;
  };
}

// ============================================================================
// Adapter Status and Statistics
// ============================================================================

/**
 * Adapter status enumeration
 */
export enum AdapterStatus {
  INITIALIZING = 'initializing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  SUBSCRIBING = 'subscribing',
  ACTIVE = 'active',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  STOPPED = 'stopped'
}

/**
 * Adapter statistics
 */
export interface AdapterStats {
  /** Current status */
  status: AdapterStatus;
  
  /** Connection statistics */
  connection: ConnectionStats;
  
  /** Message statistics */
  messages: MessageStats;
  
  /** Performance statistics */
  performance: PerformanceStats;
  
  /** Error statistics */
  errors: ErrorStats;
  
  /** Subscription statistics */
  subscriptions: SubscriptionStats;
}

/**
 * Connection statistics
 */
export interface ConnectionStats {
  /** Connection start time */
  connectedAt?: number;
  
  /** Connection uptime in milliseconds */
  uptime: number;
  
  /** Total connection attempts */
  totalConnections: number;
  
  /** Failed connection attempts */
  failedConnections: number;
  
  /** Number of reconnections */
  reconnections: number;
  
  /** Last connection error */
  lastError?: ErrorInfo;
}

/**
 * Message statistics
 */
export interface MessageStats {
  /** Total messages received */
  received: number;
  
  /** Total messages processed successfully */
  processed: number;
  
  /** Total messages sent to Pub/Sub */
  sent: number;
  
  /** Total bytes received */
  bytesReceived: number;
  
  /** Messages per second (current) */
  messagesPerSecond: number;
  
  /** Bytes per second (current) */
  bytesPerSecond: number;
}

/**
 * Performance statistics
 */
export interface PerformanceStats {
  /** Latency statistics in milliseconds */
  latency: {
    current: number;
    average: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  
  /** Processing time statistics in microseconds */
  processingTime: {
    average: number;
    p95: number;
    p99: number;
  };
}

/**
 * Error statistics
 */
export interface ErrorStats {
  /** Total errors */
  total: number;
  
  /** Connection errors */
  connection: number;
  
  /** Parsing errors */
  parsing: number;
  
  /** Pub/Sub errors */
  pubsub: number;
  
  /** Last error */
  lastError?: ErrorInfo;
  
  /** Recent errors (last 10) */
  recent: ErrorInfo[];
}

/**
 * Subscription statistics
 */
export interface SubscriptionStats {
  /** Total active subscriptions */
  active: number;
  
  /** Subscriptions by data type */
  byType: Record<string, number>;
  
  /** Subscriptions by symbol */
  bySymbol: Record<string, number>;
}

/**
 * Error information
 */
export interface ErrorInfo {
  /** Error timestamp */
  timestamp: number;
  
  /** Error message */
  message: string;
  
  /** Error code */
  code?: string;
  
  /** Error context */
  context?: Record<string, any>;
}

// ============================================================================
// Event System
// ============================================================================

/**
 * Adapter events
 */
export enum AdapterEvent {
  /** Adapter status changed */
  STATUS_CHANGED = 'status_changed',
  
  /** Connection established */
  CONNECTED = 'connected',
  
  /** Connection lost */
  DISCONNECTED = 'disconnected',
  
  /** Data received */
  DATA = 'data',
  
  /** Error occurred */
  ERROR = 'error',
  
  /** Subscription added */
  SUBSCRIBED = 'subscribed',
  
  /** Subscription removed */
  UNSUBSCRIBED = 'unsubscribed'
}

/**
 * Event handler function type
 */
export type AdapterEventHandler = (data: any) => void;

// ============================================================================
// Binance-Specific Types (from experiments)
// ============================================================================

/**
 * Binance WebSocket stream data types
 */
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

export interface BinanceTickerStream {
  e: '24hrTicker';     // Event type
  E: number;           // Event time
  s: string;           // Symbol
  p: string;           // Price change
  P: string;           // Price change percent
  w: string;           // Weighted average price
  x: string;           // First trade(F)-1 price (first trade before the 24hr rolling window)
  c: string;           // Last price
  Q: string;           // Last quantity
  b: string;           // Best bid price
  B: string;           // Best bid quantity
  a: string;           // Best ask price
  A: string;           // Best ask quantity
  o: string;           // Open price
  h: string;           // High price
  l: string;           // Low price
  v: string;           // Total traded base asset volume
  q: string;           // Total traded quote asset volume
  O: number;           // Statistics open time
  C: number;           // Statistics close time
  F: number;           // First trade ID
  L: number;           // Last trade Id
  n: number;           // Total count of trades
}

/**
 * Combined stream wrapper
 */
export interface BinanceCombinedStream<T> {
  stream: string;
  data: T;
}

/**
 * Union type for all Binance WebSocket messages
 */
export type BinanceWSMessage = 
  | BinanceTradeStream 
  | BinanceKlineStream 
  | BinanceTickerStream
  | BinanceCombinedStream<BinanceTradeStream | BinanceKlineStream | BinanceTickerStream>;

/**
 * Supported Kline intervals
 */
export type KlineInterval = 
  | '1m' | '3m' | '5m' | '15m' | '30m' 
  | '1h' | '2h' | '4h' | '6h' | '8h' | '12h' 
  | '1d' | '3d' | '1w' | '1M';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base adapter error
 */
export class AdapterError extends Error {
  public code: string;
  public override cause?: Error;
  public context?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    cause?: Error,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
    if (context !== undefined) {
      this.context = context;
    }
  }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends AdapterError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(message, 'CONNECTION_ERROR', cause, context);
    this.name = 'ConnectionError';
  }
}

/**
 * Data parsing errors
 */
export class DataParsingError extends AdapterError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(message, 'DATA_PARSING_ERROR', cause, context);
    this.name = 'DataParsingError';
  }
}

/**
 * Subscription management errors
 */
export class SubscriptionError extends AdapterError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(message, 'SUBSCRIPTION_ERROR', cause, context);
    this.name = 'SubscriptionError';
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AdapterError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(message, 'CONFIGURATION_ERROR', cause, context);
    this.name = 'ConfigurationError';
  }
}

/**
 * Google Cloud Pub/Sub errors
 */
export class PubSubError extends AdapterError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(message, 'PUBSUB_ERROR', cause, context);
    this.name = 'PubSubError';
  }
}