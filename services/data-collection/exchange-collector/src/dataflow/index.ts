/**
 * 数据流管理系统导出
 */

// 核心接口
export * from './interfaces';

// 数据流管理器
export { DataFlowManager } from './data-flow-manager';

// 工厂类
export { DataFlowManagerFactory, createDataFlowManager } from './factory';
export type { DataFlowSetupOptions } from './factory';

// 消息路由器
export { MessageRouter, RoutingRuleFactory } from './routing/message-router';
export type { RouterStats } from './routing/message-router';

// 数据转换器
export { StandardDataTransformer, CompressionTransformer } from './transformers/data-transformer';

// 输出通道
export {
  PubSubOutputChannel,
  WebSocketOutputChannel,
  CacheOutputChannel,
  BatchOutputChannel
} from './channels/output-channels';

// 监控系统
export { DataFlowMonitor } from './monitoring';
export type { 
  DataFlowMonitorConfig,
  MonitoringAlert,
  PerformanceMetrics 
} from './monitoring';