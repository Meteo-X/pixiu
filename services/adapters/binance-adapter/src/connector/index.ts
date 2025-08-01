/**
 * Binance WebSocket 连接管理器 - 入口文件
 * 
 * 导出所有核心类和接口
 */

// 核心接口
export * from './interfaces';

// 核心类
export { HeartbeatManager } from './HeartbeatManager';
export { ReconnectStrategy } from './ReconnectStrategy';
export { BinanceConnection } from './BinanceConnection';
export { ConnectionPool } from './ConnectionPool';
export { ConnectionManager } from './ConnectionManager';

// 配置管理
export * from './config';

// 工具函数
export * from './utils';

// 便捷导入
export {
  createDefaultConfig,
  getConfigPreset,
  validateConfig,
  CONFIG_PRESETS
} from './config';

export {
  formatBytes,
  formatDuration,
  calculateLatency,
  calculatePercentiles,
  MovingAverage,
  RateLimiter,
  Retrier,
  CircularBuffer,
  PerformanceMonitor
} from './utils';