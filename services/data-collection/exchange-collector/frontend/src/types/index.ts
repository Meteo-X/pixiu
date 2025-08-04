/**
 * 类型定义入口文件
 */

export * from './api';
export * from './websocket';

// 通用工具类型
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

// 主题类型
export type ThemeMode = 'light' | 'dark' | 'system';