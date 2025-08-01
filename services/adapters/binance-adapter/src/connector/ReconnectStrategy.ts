/**
 * Binance WebSocket 重连策略实现
 * 
 * 功能:
 * - 指数退避算法
 * - 随机抖动防止雷群效应
 * - 智能重连判断
 * - 重连计数器自动重置
 */

import { IReconnectStrategy, ReconnectConfig, ErrorInfo } from './interfaces';

export class ReconnectStrategy implements IReconnectStrategy {
  private config: ReconnectConfig;
  private attempts = 0;
  private lastAttemptTime = 0;
  private currentDelay: number;
  private lastSuccessfulConnection = 0;

  constructor(config: ReconnectConfig) {
    this.config = { ...config };
    this.currentDelay = config.initialDelay;
  }

  /**
   * 计算下次重连延迟
   * 使用指数退避 + 随机抖动算法
   */
  public getNextDelay(): number {
    // 检查是否需要重置重连计数器
    this.checkAndResetCounter();

    this.attempts++;
    this.lastAttemptTime = Date.now();

    // 计算基础延迟 (指数退避)
    let delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this.attempts - 1),
      this.config.maxDelay
    );

    // 添加随机抖动 (±25%) 防止雷群效应
    if (this.config.jitter) {
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(100, delay + jitter); // 最小 100ms
    }

    this.currentDelay = Math.round(delay);
    return this.currentDelay;
  }

  /**
   * 判断是否应该重连
   * 基于错误类型和重试次数决定
   */
  public shouldReconnect(error: ErrorInfo): boolean {
    // 检查重试次数限制
    if (this.attempts >= this.config.maxRetries) {
      return false;
    }

    // 基于错误类型判断
    switch (error.type) {
      case 'CONNECTION':
        // 网络连接错误，通常应该重连
        return this.shouldReconnectForConnectionError(error);
        
      case 'HEARTBEAT':
        // 心跳超时，应该重连
        return true;
        
      case 'PROTOCOL':
        // 协议错误，需要根据具体错误码判断
        return this.shouldReconnectForProtocolError(error);
        
      case 'DATA':
        // 数据解析错误，通常不需要重连
        return false;
        
      default:
        // 未知错误，保守起见不重连
        return false;
    }
  }

  /**
   * 重置重连计数器
   * 成功连接一段时间后重置
   */
  public reset(): void {
    this.attempts = 0;
    this.currentDelay = this.config.initialDelay;
    this.lastSuccessfulConnection = Date.now();
  }

  /**
   * 获取重连统计信息
   */
  public getStats() {
    return {
      attempts: this.attempts,
      lastAttemptTime: this.lastAttemptTime,
      nextRetryTime: this.lastAttemptTime + this.currentDelay,
      currentDelay: this.currentDelay
    };
  }

  /**
   * 记录成功连接
   * 用于重连计数器重置判断
   */
  public recordSuccessfulConnection(): void {
    this.lastSuccessfulConnection = Date.now();
  }

  /**
   * 检查并重置重连计数器
   * 如果距离上次成功连接超过配置时间，重置计数器
   */
  private checkAndResetCounter(): void {
    if (this.lastSuccessfulConnection > 0) {
      const timeSinceSuccess = Date.now() - this.lastSuccessfulConnection;
      if (timeSinceSuccess > this.config.resetAfter) {
        this.attempts = 0;
        this.currentDelay = this.config.initialDelay;
      }
    }
  }

  /**
   * 判断连接错误是否应该重连
   */
  private shouldReconnectForConnectionError(error: ErrorInfo): boolean {
    // 基于错误代码和消息判断
    const message = error.message.toLowerCase();
    const code = error.code?.toLowerCase();

    // 明确不应该重连的情况
    const noReconnectPatterns = [
      'authentication failed',
      'invalid api key',
      'unauthorized',
      'forbidden',
      'rate limit exceeded permanently'
    ];

    if (noReconnectPatterns.some(pattern => 
      message.includes(pattern) || code?.includes(pattern)
    )) {
      return false;
    }

    // 应该重连的网络错误
    const reconnectPatterns = [
      'network error',
      'connection timeout',
      'connection refused',
      'connection reset',
      'dns error',
      'socket hang up',
      'econnreset',
      'enotfound',
      'etimedout'
    ];

    return reconnectPatterns.some(pattern => 
      message.includes(pattern) || code?.includes(pattern)
    );
  }

  /**
   * 判断协议错误是否应该重连
   */
  private shouldReconnectForProtocolError(error: ErrorInfo): boolean {
    const code = error.code?.toLowerCase();
    const message = error.message.toLowerCase();

    // WebSocket 关闭代码判断
    if (code && code.startsWith('ws_')) {
      const closeCode = parseInt(code.replace('ws_', ''));
      
      // 基于 WebSocket 关闭代码判断
      switch (closeCode) {
        case 1000: // Normal Closure
        case 1001: // Going Away
          return true;
          
        case 1002: // Protocol Error
        case 1003: // Unsupported Data
          return false;
          
        case 1006: // Abnormal Closure
        case 1011: // Internal Error
        case 1012: // Service Restart
        case 1013: // Try Again Later
        case 1014: // Bad Gateway
          return true;
          
        case 1008: // Policy Violation
        case 1009: // Message Too Big
        case 1010: // Mandatory Extension
          return false;
          
        default:
          // 未知关闭代码，保守重连
          return true;
      }
    }

    // 基于错误消息判断
    const noReconnectMessages = [
      'invalid frame',
      'protocol violation',
      'message too large',
      'invalid utf8'
    ];

    return !noReconnectMessages.some(pattern => message.includes(pattern));
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<ReconnectConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // 如果当前延迟超过新的最大延迟，调整它
    if (this.currentDelay > this.config.maxDelay) {
      this.currentDelay = this.config.maxDelay;
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): ReconnectConfig {
    return { ...this.config };
  }

  /**
   * 预估下次重连时间
   */
  public estimateNextRetryTime(): number {
    if (this.attempts === 0) {
      return Date.now() + this.config.initialDelay;
    }
    
    const baseDelay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this.attempts),
      this.config.maxDelay
    );
    
    return Date.now() + baseDelay;
  }

  /**
   * 获取重连进度信息
   */
  public getProgress(): {
    currentAttempt: number;
    maxAttempts: number;
    progressPercentage: number;
    timeToNextRetry: number;
    estimatedTotalTime: number;
  } {
    const timeToNextRetry = Math.max(0, 
      (this.lastAttemptTime + this.currentDelay) - Date.now()
    );

    // 估算总重连时间 (所有重试的累计时间)
    let estimatedTotalTime = 0;
    for (let i = 1; i <= this.config.maxRetries; i++) {
      const delay = Math.min(
        this.config.initialDelay * Math.pow(this.config.backoffMultiplier, i - 1),
        this.config.maxDelay
      );
      estimatedTotalTime += delay;
    }

    return {
      currentAttempt: this.attempts,
      maxAttempts: this.config.maxRetries,
      progressPercentage: (this.attempts / this.config.maxRetries) * 100,
      timeToNextRetry,
      estimatedTotalTime
    };
  }

  /**
   * 检查是否处于重连冷却期
   */
  public isInCooldown(): boolean {
    if (this.lastAttemptTime === 0) {
      return false;
    }
    
    const timeSinceLastAttempt = Date.now() - this.lastAttemptTime;
    return timeSinceLastAttempt < this.currentDelay;
  }

  /**
   * 强制触发下次重连 (跳过当前延迟)
   */
  public forceNextRetry(): void {
    this.lastAttemptTime = Date.now() - this.currentDelay;
  }

  /**
   * 获取调试信息
   */
  public getDebugInfo(): {
    config: ReconnectConfig;
    state: {
      attempts: number;
      currentDelay: number;
      lastAttemptTime: number;
      lastSuccessfulConnection: number;
      isInCooldown: boolean;
      timeToNextRetry: number;
    };
    progress: ReturnType<typeof this.getProgress>;
  } {
    return {
      config: this.getConfig(),
      state: {
        attempts: this.attempts,
        currentDelay: this.currentDelay,
        lastAttemptTime: this.lastAttemptTime,
        lastSuccessfulConnection: this.lastSuccessfulConnection,
        isInCooldown: this.isInCooldown(),
        timeToNextRetry: Math.max(0, (this.lastAttemptTime + this.currentDelay) - Date.now())
      },
      progress: this.getProgress()
    };
  }
}