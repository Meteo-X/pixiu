/**
 * WebSocket 模块入口
 * 导出所有 WebSocket 相关的类和接口
 */

// 兼容的旧版本导出
export { 
  CollectorWebSocketServer, 
  WebSocketMessage, 
  ConnectionInfo 
} from './websocket-server';

// 新版本WebSocket代理导出
export {
  WebSocketProxy,
  SubscriptionManager,
  ProxyMessage,
  ClientConnection,
  SubscriptionFilter,
  ConnectionStats,
  HealthStatus
} from './websocket-proxy';

// 连接池管理器导出
export {
  ConnectionPoolManager,
  PooledConnection,
  PoolConfig,
  PoolStats
} from './connection-pool-manager';

// 保持向后兼容性的导出别名
export { ConnectionPoolManager as WebSocketConnectionPool } from './connection-pool-manager';
export type { PoolConfig as ConnectionPoolConfig, PoolStats as ConnectionPoolStats } from './connection-pool-manager';

// 工厂函数
import { Server } from 'http';
import { BaseMonitor } from '@pixiu/shared-core';
import { CollectorWebSocketServer } from './websocket-server';
import { WebSocketProxy } from './websocket-proxy';
import { PoolConfig } from './connection-pool-manager';

/**
 * 创建传统WebSocket服务器（兼容模式）
 * @deprecated 推荐使用 createWebSocketProxy
 */
export function createWebSocketServer(
  httpServer: Server,
  monitor: BaseMonitor,
  adapterRegistry?: any,
  options?: {
    connectionPool?: Partial<PoolConfig>;
  }
): CollectorWebSocketServer {
  const wsServer = new CollectorWebSocketServer(
    httpServer,
    monitor,
    adapterRegistry
  );

  monitor.log('info', 'WebSocket server created (compatibility mode)', {
    options
  });

  return wsServer;
}

/**
 * 创建新版WebSocket代理服务器（推荐）
 */
export function createWebSocketProxy(
  httpServer: Server,
  monitor: BaseMonitor,
  options?: {
    heartbeatInterval?: number;
    connectionTimeout?: number;
    maxConnections?: number;
    poolConfig?: Partial<PoolConfig>;
  }
): WebSocketProxy {
  const proxy = new WebSocketProxy(httpServer, monitor, options);
  
  monitor.log('info', 'WebSocket proxy created', {
    options
  });
  
  return proxy;
}

/**
 * WebSocket代理服务器配置接口
 */
export interface WebSocketProxyConfig {
  heartbeatInterval: number;
  connectionTimeout: number;
  maxConnections: number;
  poolConfig: PoolConfig;
}

/**
 * 默认WebSocket代理配置
 */
export const DEFAULT_PROXY_CONFIG: WebSocketProxyConfig = {
  heartbeatInterval: 30000, // 30秒
  connectionTimeout: 60000, // 60秒
  maxConnections: 1000,
  poolConfig: {
    maxConnections: 1000,
    connectionTimeout: 60000,
    maxMessageBufferSize: 100,
    maxBytesPerBuffer: 1024 * 1024, // 1MB
    flushInterval: 1000, // 1秒
    enableBatching: true,
    batchSize: 10,
    compressionEnabled: false,
    memoryThreshold: 512 // 512MB
  }
};

/**
 * WebSocket服务器配置接口（兼容模式）
 * @deprecated 使用 WebSocketProxyConfig
 */
export interface WebSocketServerConfig {
  enableHeartbeat: boolean;
  heartbeatInterval: number;
  connectionTimeout: number;
  maxConnections: number;
}

/**
 * 默认WebSocket服务器配置（兼容模式）
 * @deprecated 使用 DEFAULT_PROXY_CONFIG
 */
export const DEFAULT_WEBSOCKET_CONFIG: WebSocketServerConfig = {
  enableHeartbeat: true,
  heartbeatInterval: 30000,
  connectionTimeout: 60000,
  maxConnections: 1000
};