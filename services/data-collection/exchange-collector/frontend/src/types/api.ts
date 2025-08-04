/**
 * API 类型定义
 */

// 基础响应类型
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

// 适配器相关类型
export interface AdapterInfo {
  name: string;
  status: 'active' | 'inactive' | 'error';
  config: Record<string, unknown>;
  subscriptions: string[];
  metrics: AdapterMetrics;
  lastUpdate: string;
}

export interface AdapterMetrics {
  messagesReceived: number;
  bytesReceived: number;
  errorCount: number;
  uptime: number;
  subscriptionCount: number;
}

// 订阅相关类型
export interface Subscription {
  exchange: string;
  symbol: string;
  dataTypes: string[];
  status: 'active' | 'paused' | 'error';
  metrics: {
    messagesReceived: number;
    lastUpdate: string | null;
    bytesReceived: number;
    errorCount: number;
  };
}

export interface SubscriptionRequest {
  exchange: string;
  symbol: string;
  dataTypes: string[];
}

// 统计相关类型
export interface RealTimeStats {
  adapters: {
    [exchangeName: string]: {
      status: 'connected' | 'disconnected' | 'error';
      subscriptions: number;
      messagesPerSecond: number;
      bytesPerSecond: number;
      errorRate: number;
      uptime: number;
      lastUpdate: string;
    };
  };
  system: {
    totalSubscriptions: number;
    totalAdapters: number;
    activeAdapters: number;
    totalMessagesReceived: number;
    totalBytesReceived: number;
    systemUptime: number;
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
  };
  cache: {
    totalEntries: number;
    hitRate: number;
    memoryUsage: number;
    keyCount: number;
  };
  timestamp: string;
}

// PubSub 相关类型
export interface PubSubStatus {
  enabled: boolean;
  totalTopics: number;
  publishedMessages: number;
  publishErrors: number;
  lastPublishTime: string | null;
  publishRate: number;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  emulatorMode: boolean;
  topics: Array<{
    name: string;
    messageCount: number;
    lastMessage: string | null;
    subscriptions: number;
  }>;
}

export interface PubSubToggleRequest {
  enabled: boolean;
  reason?: string;
}