/**
 * Binance WebSocket 心跳管理器
 * 严格按照官方 ping/pong 规范实现
 * 
 * 官方规范:
 * - 服务器每 20 秒发送 ping frame
 * - 客户端收到 ping 后必须立即发送 pong frame，并复制 ping 的 payload
 * - 如果服务器 60 秒内未收到 pong frame，将断开连接
 * - 允许发送主动 pong frame (payload 为空)，但不能阻止断开
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { IHeartbeatManager, HeartbeatConfig, HeartbeatStats, ConnectionEvent } from './interfaces';

export class HeartbeatManager extends EventEmitter implements IHeartbeatManager {
  private config: HeartbeatConfig;
  private ws: WebSocket;
  private stats: HeartbeatStats;
  
  // 定时器
  private healthCheckTimer?: NodeJS.Timeout;
  private unsolicitedPongTimer?: NodeJS.Timeout;
  
  // 状态跟踪
  private isRunning = false;
  private pongResponseTimes: number[] = [];
  
  constructor(ws: WebSocket, config: HeartbeatConfig) {
    super();
    this.ws = ws;
    this.config = config;
    this.stats = this.initializeStats();
    
    this.setupWebSocketHandlers();
  }

  /**
   * 初始化统计数据
   */
  private initializeStats(): HeartbeatStats {
    return {
      pingsReceived: 0,
      pongsSent: 0,
      unsolicitedPongsSent: 0,
      heartbeatTimeouts: 0,
      lastPingTime: undefined,
      lastPongTime: undefined,
      avgPongResponseTime: 0,
      maxPongResponseTime: 0,
      healthScore: 1.0
    };
  }

  /**
   * 设置 WebSocket 事件处理器
   */
  private setupWebSocketHandlers(): void {
    // 处理服务器发送的 ping (严格按照官方规范)
    this.ws.on('ping', (payload: Buffer) => {
      this.handlePing(payload);
    });

    // 监听连接状态变化
    this.ws.on('close', () => {
      this.stop();
    });

    this.ws.on('error', (error) => {
      this.emit(ConnectionEvent.ERROR, {
        type: 'HEARTBEAT',
        message: `Heartbeat WebSocket error: ${error.message}`,
        error
      });
    });
  }

  /**
   * 处理服务器发送的 ping (核心方法，严格按照官方规范)
   */
  public handlePing(payload: Buffer): void {
    const pingTime = Date.now();
    this.stats.lastPingTime = pingTime;
    this.stats.pingsReceived++;

    // 立即发送 pong，复制完整的 ping payload (官方要求)
    const pongStartTime = process.hrtime.bigint();
    
    try {
      this.ws.pong(payload);
      
      const pongEndTime = process.hrtime.bigint();
      const responseTime = Number(pongEndTime - pongStartTime) / 1_000_000; // 转换为毫秒
      
      this.stats.lastPongTime = Date.now();
      this.stats.pongsSent++;
      
      // 更新响应时间统计
      this.updatePongResponseTime(responseTime);
      
      // 发射心跳事件
      this.emit(ConnectionEvent.HEARTBEAT_RECEIVED, {
        timestamp: pingTime,
        pingTime,
        pongTime: this.stats.lastPongTime,
        responseTime,
        payload
      });
      
      // 更新健康分数
      this.updateHealthScore();
      
    } catch (error) {
      this.emit(ConnectionEvent.ERROR, {
        type: 'HEARTBEAT',
        message: `Failed to send pong: ${error}`,
        error,
        context: { payloadSize: payload.length }
      });
    }
  }

  /**
   * 发送主动 pong (官方允许，payload 为空)
   */
  public sendUnsolicitedPong(): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.pong(); // 空 payload 的主动 pong
      this.stats.unsolicitedPongsSent++;
      
      this.emit(ConnectionEvent.HEARTBEAT_RECEIVED, {
        timestamp: Date.now(),
        unsolicited: true
      });
      
    } catch (error) {
      this.emit(ConnectionEvent.ERROR, {
        type: 'HEARTBEAT',
        message: `Failed to send unsolicited pong: ${error}`,
        error
      });
    }
  }

  /**
   * 检查心跳超时
   * 如果超过配置的阈值时间未收到 ping，视为心跳超时
   */
  public checkHeartbeatTimeout(): boolean {
    if (!this.stats.lastPingTime) {
      return false; // 还未收到第一个 ping
    }

    const timeSinceLastPing = Date.now() - this.stats.lastPingTime;
    const isTimeout = timeSinceLastPing > this.config.pingTimeoutThreshold;

    if (isTimeout) {
      this.stats.heartbeatTimeouts++;
      this.updateHealthScore();
      
      this.emit(ConnectionEvent.HEARTBEAT_TIMEOUT, {
        timestamp: Date.now(),
        lastPingTime: this.stats.lastPingTime,
        timeoutDuration: timeSinceLastPing,
        threshold: this.config.pingTimeoutThreshold
      });
    }

    return isTimeout;
  }

  /**
   * 更新 pong 响应时间统计
   */
  private updatePongResponseTime(responseTime: number): void {
    this.pongResponseTimes.push(responseTime);
    
    // 保持最近 100 个响应时间记录
    if (this.pongResponseTimes.length > 100) {
      this.pongResponseTimes.shift();
    }

    // 计算统计数据
    this.stats.avgPongResponseTime = 
      this.pongResponseTimes.reduce((sum, time) => sum + time, 0) / this.pongResponseTimes.length;
    
    this.stats.maxPongResponseTime = Math.max(...this.pongResponseTimes);
  }

  /**
   * 更新健康分数 (0-1，1 为最健康)
   */
  private updateHealthScore(): void {
    const factors = {
      // 响应时间因子 (响应时间越短越好)
      responseTime: Math.max(0, 1 - this.stats.avgPongResponseTime / this.config.pongResponseTimeout),
      
      // 心跳频率因子 (是否按时收到 ping)
      heartbeatFrequency: this.calculateHeartbeatFrequencyScore(),
      
      // 超时因子 (超时次数越少越好)
      timeout: Math.max(0, 1 - this.stats.heartbeatTimeouts / 10),
      
      // Pong 成功率因子
      pongSuccessRate: this.stats.pingsReceived > 0 ? 
        this.stats.pongsSent / this.stats.pingsReceived : 1
    };

    // 加权计算总健康分数
    const weights = {
      responseTime: 0.3,
      heartbeatFrequency: 0.4,
      timeout: 0.2,
      pongSuccessRate: 0.1
    };

    const oldScore = this.stats.healthScore;
    this.stats.healthScore = Object.entries(factors).reduce(
      (score, [key, value]) => score + value * weights[key as keyof typeof weights], 
      0
    );

    // 如果健康分数有显著变化，发射事件
    if (Math.abs(this.stats.healthScore - oldScore) > 0.1) {
      this.emit(ConnectionEvent.HEALTH_CHANGED, {
        timestamp: Date.now(),
        oldScore,
        newScore: this.stats.healthScore,
        factors
      });
    }
  }

  /**
   * 计算心跳频率分数
   * 基于是否按预期频率收到 ping (服务器应该每 20 秒发送一次)
   */
  private calculateHeartbeatFrequencyScore(): number {
    if (!this.stats.lastPingTime || this.stats.pingsReceived < 2) {
      return 1.0; // 刚开始连接，给满分
    }

    const expectedInterval = 20000; // 20 秒
    const actualInterval = (Date.now() - this.stats.lastPingTime);
    
    // 如果实际间隔接近预期间隔，分数高
    const deviation = Math.abs(actualInterval - expectedInterval) / expectedInterval;
    return Math.max(0, 1 - deviation);
  }

  /**
   * 启动心跳管理
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // 启动健康检查定时器
    this.healthCheckTimer = setInterval(() => {
      this.checkHeartbeatTimeout();
      this.updateHealthScore();
    }, this.config.healthCheckInterval);

    // 如果配置了主动 pong，启动定时器
    if (this.config.unsolicitedPongInterval) {
      this.unsolicitedPongTimer = setInterval(() => {
        this.sendUnsolicitedPong();
      }, this.config.unsolicitedPongInterval);
    }
  }

  /**
   * 停止心跳管理
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // 清理定时器
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    if (this.unsolicitedPongTimer) {
      clearInterval(this.unsolicitedPongTimer);
      this.unsolicitedPongTimer = undefined;
    }

    // 移除所有事件监听器
    this.removeAllListeners();
  }

  /**
   * 重置心跳统计
   */
  public reset(): void {
    this.stats = this.initializeStats();
    this.pongResponseTimes = [];
  }

  /**
   * 获取心跳统计
   */
  public getStats(): HeartbeatStats {
    return { ...this.stats };
  }

  /**
   * 获取当前健康分数
   */
  public getHealthScore(): number {
    return this.stats.healthScore;
  }

  /**
   * 检查心跳是否健康
   */
  public isHealthy(): boolean {
    return this.stats.healthScore > 0.7 && !this.checkHeartbeatTimeout();
  }

  /**
   * 获取详细的诊断信息
   */
  public getDiagnostics(): {
    isHealthy: boolean;
    lastPingAge: number | null;
    avgResponseTime: number;
    heartbeatTimeouts: number;
    healthScore: number;
    factors: Record<string, number>;
  } {
    const lastPingAge = this.stats.lastPingTime ? 
      Date.now() - this.stats.lastPingTime : null;

    return {
      isHealthy: this.isHealthy(),
      lastPingAge,
      avgResponseTime: this.stats.avgPongResponseTime,
      heartbeatTimeouts: this.stats.heartbeatTimeouts,
      healthScore: this.stats.healthScore,
      factors: {
        responseTime: Math.max(0, 1 - this.stats.avgPongResponseTime / this.config.pongResponseTimeout),
        heartbeatFrequency: this.calculateHeartbeatFrequencyScore(),
        timeout: Math.max(0, 1 - this.stats.heartbeatTimeouts / 10),
        pongSuccessRate: this.stats.pingsReceived > 0 ? 
          this.stats.pongsSent / this.stats.pingsReceived : 1
      }
    };
  }
}