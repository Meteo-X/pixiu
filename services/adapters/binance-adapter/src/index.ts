/**
 * Binance Adapter SDK
 * Binance交易所适配器SDK
 */

export * from './binance-adapter';
export * from './connection/binance-connection-manager';

// 重新导出基础类型，方便使用
export {
  DataType,
  AdapterStatus,
  AdapterConfig,
  SubscriptionConfig,
  MarketData,
  TradeData,
  TickerData,
  KlineData,
  DepthData
} from '@pixiu/adapter-base';

// 版本信息
export const VERSION = '1.0.0';