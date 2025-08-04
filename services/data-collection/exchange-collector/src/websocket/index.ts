/**
 * WebSocket 模块入口
 * 导出所有 WebSocket 相关的类和接口
 */

export { 
  CollectorWebSocketServer, 
  WebSocketMessage, 
  ConnectionInfo 
} from './websocket-server';

export { 
  WebSocketConnectionPool, 
  PooledConnection, 
  ConnectionPoolConfig, 
  ConnectionPoolStats 
} from './connection-pool';

export { 
  WebSocketMessageHandler, 
  MessageHandlerConfig, 
  ClientSession 
} from './message-handler';

// 工厂函数
import { Server } from 'http';
import { BaseMonitor } from '@pixiu/shared-core';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';
import { CollectorWebSocketServer } from './websocket-server';
import { ConnectionPoolConfig } from './connection-pool';
import { MessageHandlerConfig } from './message-handler';

/**
 * 创建并配置 WebSocket 服务器
 */
export function createWebSocketServer(
  httpServer: Server,
  monitor: BaseMonitor,
  adapterRegistry: AdapterRegistry,
  options?: {
    connectionPool?: Partial<ConnectionPoolConfig>;
    messageHandler?: Partial<MessageHandlerConfig>;
  }
): CollectorWebSocketServer {
  
  // 默认连接池配置
  const defaultPoolConfig: ConnectionPoolConfig = {
    maxConnections: 1000,
    idleTimeout: 300000, // 5分钟
    cleanupInterval: 60000, // 1分钟
    enableMetrics: true
  };

  // 默认消息处理配置
  const defaultHandlerConfig: MessageHandlerConfig = {
    enableRateLimit: true,
    maxMessagesPerMinute: 60,
    enableMessageValidation: true,
    logAllMessages: false
  };

  const poolConfig = { ...defaultPoolConfig, ...options?.connectionPool };
  const handlerConfig = { ...defaultHandlerConfig, ...options?.messageHandler };

  // 创建 WebSocket 服务器
  const wsServer = new CollectorWebSocketServer(
    httpServer,
    monitor,
    adapterRegistry
  );

  monitor.log('info', 'WebSocket server created and configured', {
    poolConfig,
    handlerConfig
  });

  return wsServer;
}

/**
 * WebSocket 服务器配置接口
 */
export interface WebSocketServerConfig {
  connectionPool: ConnectionPoolConfig;
  messageHandler: MessageHandlerConfig;
  enableHeartbeat: boolean;
  heartbeatInterval: number;
  connectionTimeout: number;
}

/**
 * 默认 WebSocket 服务器配置
 */
export const DEFAULT_WEBSOCKET_CONFIG: WebSocketServerConfig = {
  connectionPool: {
    maxConnections: 1000,
    idleTimeout: 300000,
    cleanupInterval: 60000,
    enableMetrics: true
  },
  messageHandler: {
    enableRateLimit: true,
    maxMessagesPerMinute: 60,
    enableMessageValidation: true,
    logAllMessages: false
  },
  enableHeartbeat: true,
  heartbeatInterval: 30000,
  connectionTimeout: 60000
};