/**
 * API 服务类
 */

import {
  AdapterInfo,
  Subscription,
  SubscriptionRequest,
  RealTimeStats,
  PubSubStatus,
  PubSubToggleRequest,
} from '@/types';

class ApiService {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl = '/api', timeout = 10000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * 通用请求方法
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network request failed');
    }
  }

  // 适配器相关 API
  async getAdapters(): Promise<{
    adapters: AdapterInfo[];
    summary: any;
    timestamp: string;
  }> {
    return this.request('/adapters');
  }

  // 订阅相关 API
  async getSubscriptions(): Promise<{
    subscriptions: Subscription[];
    summary: any;
    timestamp: string;
  }> {
    return this.request('/subscriptions');
  }

  async addSubscription(subscription: SubscriptionRequest): Promise<any> {
    return this.request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });
  }

  async removeSubscription(exchange: string, symbol: string): Promise<any> {
    return this.request(`/subscriptions/${exchange}/${symbol}`, {
      method: 'DELETE',
    });
  }

  // 统计相关 API
  async getStats(): Promise<RealTimeStats> {
    return this.request('/stats');
  }

  /**
   * 创建 Server-Sent Events 连接
   */
  createStatsStream(onMessage: (data: RealTimeStats) => void): EventSource {
    const eventSource = new EventSource(`${this.baseUrl}/stats/stream`);

    eventSource.addEventListener('stats', (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Failed to parse stats stream data:', error);
      }
    });

    eventSource.addEventListener('error', (event) => {
      console.error('Stats stream error:', event);
    });

    return eventSource;
  }

  // PubSub 控制相关 API
  async getPubSubStatus(): Promise<{
    status: PubSubStatus;
    timestamp: string;
  }> {
    return this.request('/pubsub/status');
  }

  async togglePubSub(request: PubSubToggleRequest): Promise<any> {
    return this.request('/pubsub/toggle', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // 健康检查 API
  async getHealth(): Promise<any> {
    return fetch('/health').then(res => res.json());
  }
}

// 创建单例实例
export const apiService = new ApiService();
export default apiService;