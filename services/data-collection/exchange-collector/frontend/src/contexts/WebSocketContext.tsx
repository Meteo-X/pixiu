/**
 * WebSocket Context
 */

import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { WebSocketService } from '@/services/websocket';
import {
  WebSocketState,
  WebSocketMessage,
  WebSocketContextType,
  WebSocketConnectionStatus,
} from '@/types';

// WebSocket 状态管理
interface WebSocketAction {
  type: 'SET_STATUS' | 'SET_ERROR' | 'SET_RECONNECTING' | 'INCREMENT_ATTEMPTS' | 'RESET_ATTEMPTS';
  payload?: any;
}

const initialState: WebSocketState = {
  status: 'disconnected',
  error: null,
  lastConnected: null,
  reconnectAttempts: 0,
  isReconnecting: false,
};

function webSocketReducer(state: WebSocketState, action: WebSocketAction): WebSocketState {
  switch (action.type) {
    case 'SET_STATUS':
      return {
        ...state,
        status: action.payload,
        error: action.payload === 'connected' ? null : state.error,
        lastConnected: action.payload === 'connected' ? new Date() : state.lastConnected,
        isReconnecting: false,
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        status: 'error',
      };
    case 'SET_RECONNECTING':
      return {
        ...state,
        isReconnecting: action.payload,
      };
    case 'INCREMENT_ATTEMPTS':
      return {
        ...state,
        reconnectAttempts: state.reconnectAttempts + 1,
        isReconnecting: true,
      };
    case 'RESET_ATTEMPTS':
      return {
        ...state,
        reconnectAttempts: 0,
        isReconnecting: false,
      };
    default:
      return state;
  }
}

// Context 创建
const WebSocketContext = createContext<WebSocketContextType | null>(null);

// Provider 组件属性
interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

// Provider 组件
export function WebSocketProvider({
  children,
  url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
  autoConnect = true,
  reconnectInterval = 5000,
  maxReconnectAttempts = 10,
}: WebSocketProviderProps) {
  const [state, dispatch] = useReducer(webSocketReducer, initialState);
  const wsServiceRef = useRef<WebSocketService | null>(null);
  const messageSubscribersRef = useRef<Set<(message: WebSocketMessage) => void>>(new Set());

  // 初始化 WebSocket 服务
  useEffect(() => {
    wsServiceRef.current = new WebSocketService({
      url,
      reconnectInterval,
      maxReconnectAttempts,
      heartbeatInterval: 30000,
      enableHeartbeat: true,
    });

    // 监听连接状态变化
    const unsubscribeStatus = wsServiceRef.current.onStatusChange(
      (status: WebSocketConnectionStatus) => {
        dispatch({ type: 'SET_STATUS', payload: status });
      }
    );

    // 监听消息
    const unsubscribeMessage = wsServiceRef.current.subscribe((message: WebSocketMessage) => {
      messageSubscribersRef.current.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          console.error('Error in message subscriber:', error);
        }
      });
    });

    // 自动连接
    if (autoConnect) {
      wsServiceRef.current.connect();
    }

    // 清理函数
    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      wsServiceRef.current?.destroy();
    };
  }, [url, reconnectInterval, maxReconnectAttempts, autoConnect]);

  // 发送消息
  const sendMessage = useCallback((message: WebSocketMessage) => {
    wsServiceRef.current?.sendMessage(message);
  }, []);

  // 连接
  const connect = useCallback(() => {
    wsServiceRef.current?.connect();
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    wsServiceRef.current?.disconnect();
  }, []);

  // 订阅消息
  const subscribe = useCallback((callback: (message: WebSocketMessage) => void) => {
    messageSubscribersRef.current.add(callback);
    return () => {
      messageSubscribersRef.current.delete(callback);
    };
  }, []);

  // 检查是否已连接
  const isConnected = state.status === 'connected';

  const contextValue: WebSocketContextType = {
    state,
    sendMessage,
    connect,
    disconnect,
    subscribe,
    isConnected,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Hook 用于使用 WebSocket Context
export function useWebSocket(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export default WebSocketContext;