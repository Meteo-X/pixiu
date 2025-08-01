/**
 * Binance WebSocket 连接管理器工具函数
 * 
 * 提供各种实用工具函数
 */

import { ErrorInfo } from './interfaces';

/**
 * 格式化字节大小
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 格式化持续时间 (毫秒)
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * 计算延迟 (基于事件时间戳)
 */
export function calculateLatency(eventTime: number): number {
  return Math.max(0, Date.now() - eventTime);
}

/**
 * 计算百分位数
 */
export function calculatePercentiles(values: number[]): {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
} {
  if (values.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;
  
  return {
    p50: sorted[Math.floor(len * 0.5)] || 0,
    p90: sorted[Math.floor(len * 0.9)] || 0,
    p95: sorted[Math.floor(len * 0.95)] || 0,
    p99: sorted[Math.floor(len * 0.99)] || 0
  };
}

/**
 * 计算移动平均
 */
export class MovingAverage {
  private values: number[] = [];
  private maxSize: number;
  
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }
  
  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }
  
  getAverage(): number {
    if (this.values.length === 0) return 0;
    return this.values.reduce((sum, val) => sum + val, 0) / this.values.length;
  }
  
  getCount(): number {
    return this.values.length;
  }
  
  reset(): void {
    this.values = [];
  }
}

/**
 * 速率限制器
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  
  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  
  /**
   * 尝试消费 tokens
   */
  tryConsume(tokens = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }
  
  /**
   * 获取下次可以消费的时间
   */
  getTimeUntilRefill(tokens = 1): number {
    this.refill();
    
    if (this.tokens >= tokens) {
      return 0;
    }
    
    const neededTokens = tokens - this.tokens;
    return (neededTokens / this.refillRate) * 1000; // 转换为毫秒
  }
  
  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // 转换为秒
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * 重试器
 */
export class Retrier {
  private attempts = 0;
  private readonly maxAttempts: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly backoffMultiplier: number;
  private readonly jitter: boolean;
  
  constructor(options: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    jitter?: boolean;
  }) {
    this.maxAttempts = options.maxAttempts;
    this.baseDelay = options.baseDelay;
    this.maxDelay = options.maxDelay || options.baseDelay * 10;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter || false;
  }
  
  /**
   * 执行重试逻辑
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.attempts = 0;
    
    while (this.attempts < this.maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        this.attempts++;
        
        if (this.attempts >= this.maxAttempts) {
          throw error;
        }
        
        const delay = this.calculateDelay();
        await this.sleep(delay);
      }
    }
    
    throw new Error('Max attempts reached');
  }
  
  private calculateDelay(): number {
    let delay = this.baseDelay * Math.pow(this.backoffMultiplier, this.attempts - 1);
    delay = Math.min(delay, this.maxDelay);
    
    if (this.jitter) {
      const jitterRange = delay * 0.1;
      const jitterOffset = (Math.random() - 0.5) * 2 * jitterRange;
      delay += jitterOffset;
    }
    
    return Math.max(0, delay);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建错误信息
 */
export function createErrorInfo(
  error: any,
  type: ErrorInfo['type'],
  context?: Record<string, any>
): ErrorInfo {
  return {
    timestamp: Date.now(),
    message: error.message || String(error),
    code: error.code || 'UNKNOWN',
    type,
    context,
    fatal: false
  };
}

/**
 * 检查错误是否可重试
 */
export function isRetryableError(error: ErrorInfo): boolean {
  // 基于错误类型判断
  if (error.type === 'CONNECTION' || error.type === 'HEARTBEAT') {
    return true;
  }
  
  // 基于错误代码判断
  const retryableCodes = [
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'NETWORK_ERROR',
    'HEARTBEAT_TIMEOUT'
  ];
  
  return retryableCodes.some(code => 
    error.code.toUpperCase().includes(code)
  );
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 超时执行
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * 安全解析 JSON
 */
export function safeJsonParse<T = any>(json: string): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(json);
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 截断字符串
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * 深度合并对象
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (isObject(sourceValue) && isObject(targetValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }
  
  return result;
}

function isObject(item: any): item is Record<string, any> {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * 生成随机抖动
 */
export function addJitter(value: number, jitterPercent = 0.1): number {
  const jitterRange = value * jitterPercent;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(0, value + jitter);
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  
  const debounced = ((...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  }) as T & { cancel: () => void };
  
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  
  return debounced;
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  let previous = 0;
  
  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - previous);
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func(...args);
      }, remaining);
    }
  }) as T & { cancel: () => void };
  
  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    previous = 0;
  };
  
  return throttled;
}

/**
 * 循环缓冲区
 */
export class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private tail = 0;
  private size = 0;
  private readonly capacity: number;
  
  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }
  
  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    
    if (this.size < this.capacity) {
      this.size++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }
  
  getAll(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity;
      result.push(this.buffer[index]);
    }
    return result;
  }
  
  getSize(): number {
    return this.size;
  }
  
  isFull(): boolean {
    return this.size === this.capacity;
  }
  
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
}

/**
 * 事件发射器辅助类
 */
export class EventBus {
  private events = new Map<string, Array<(...args: any[]) => void>>();
  
  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
  }
  
  off(event: string, listener: (...args: any[]) => void): void {
    const listeners = this.events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  emit(event: string, ...args: any[]): void {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for '${event}':`, error);
        }
      });
    }
  }
  
  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
  
  getListenerCount(event: string): number {
    return this.events.get(event)?.length || 0;
  }
}

/**
 * 性能监控工具
 */
export class PerformanceMonitor {
  private measurements = new Map<string, number[]>();
  
  start(name: string): () => number {
    const startTime = process.hrtime.bigint();
    
    return () => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000; // 转换为毫秒
      
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      
      const measurements = this.measurements.get(name)!;
      measurements.push(duration);
      
      // 保持最近 1000 次测量
      if (measurements.length > 1000) {
        measurements.shift();
      }
      
      return duration;
    };
  }
  
  getStats(name: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    percentiles: { p50: number; p90: number; p95: number; p99: number };
  } | null {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) {
      return null;
    }
    
    const sorted = [...measurements].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      count,
      average: sum / count,
      min: sorted[0],
      max: sorted[count - 1],
      percentiles: calculatePercentiles(sorted)
    };
  }
  
  reset(name?: string): void {
    if (name) {
      this.measurements.delete(name);
    } else {
      this.measurements.clear();
    }
  }
}