/**
 * API 数据获取 Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '@/services/api';
import { AsyncState } from '@/types';

// 通用 API Hook
export function useApi<T>(
  apiCall: () => Promise<T>,
  dependencies: React.DependencyList = [],
  options: {
    immediate?: boolean;
    refreshInterval?: number;
  } = {}
) {
  const {
    immediate = true,
    refreshInterval,
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  const intervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    if (!mountedRef.current) return;
    
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await apiCall();
      if (mountedRef.current) {
        setState({
          data: result,
          loading: false,
          error: null,
          lastUpdated: new Date(),
        });
      }
    } catch (error) {
      if (mountedRef.current) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
      }
    }
  }, [apiCall]);

  // 初始加载
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, ...dependencies]);

  // 定时刷新
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      intervalRef.current = window.setInterval(execute, refreshInterval);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [execute, refreshInterval]);

  // 清理
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    execute,
    refresh: execute,
  };
}

// 适配器数据 Hook
export function useAdapters(refreshInterval = 30000) {
  return useApi(
    () => apiService.getAdapters(),
    [],
    { refreshInterval }
  );
}

// 订阅数据 Hook
export function useSubscriptions(refreshInterval = 10000) {
  return useApi(
    () => apiService.getSubscriptions(),
    [],
    { refreshInterval }
  );
}

// 统计数据 Hook
export function useStats(refreshInterval = 5000) {
  return useApi(
    () => apiService.getStats(),
    [],
    { refreshInterval }
  );
}

// PubSub 状态 Hook
export function usePubSubStatus(refreshInterval = 15000) {
  return useApi(
    () => apiService.getPubSubStatus(),
    [],
    { refreshInterval }
  );
}