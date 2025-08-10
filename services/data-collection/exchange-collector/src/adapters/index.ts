/**
 * 适配器集成层导出
 */

// 基础集成类
export * from './base/adapter-integration';

// 具体适配器实现
export * from './binance/dataflow-integration';

// 注册中心
export * from './registry/adapter-registry';

// 重新导出adapter-base的核心类型
export {
  DataType,
  AdapterStatus,
  MarketData,
  TradeData,
  TickerData,
  KlineData,
  DepthData
} from '@pixiu/adapter-base';