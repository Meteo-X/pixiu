/**
 * WebSocket 相关类型定义
 */

export type WebSocketConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketState {
  status: WebSocketConnectionStatus;
  error: string | null;
  lastConnected: Date | null;
  reconnectAttempts: number;
  isReconnecting: boolean;
}

export interface WebSocketMessage {
  type: 'market_data' | 'system_update' | 'stats_update' | 'error' | 'ping' | 'pong' | 'trade' | 'ticker' | 'kline' | 'depth' | 'welcome' | 'binance_status';
  exchange?: string;
  symbol?: string;
  data?: any;
  timestamp: string;
  payload?: WebSocketMessage; // 支持嵌套消息格式
  // 市场数据字段
  price?: string | number;
  volume?: string | number;
  side?: string;
  change24h?: string | number;
}

export interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  enableHeartbeat?: boolean;
}

// WebSocket Context 类型
export interface WebSocketContextType {
  state: WebSocketState;
  sendMessage: (message: WebSocketMessage) => void;
  connect: () => void;
  disconnect: () => void;
  subscribe: (callback: (message: WebSocketMessage) => void) => () => void;
  isConnected: boolean;
}