/**
 * Binance WebSocket连接管理器
 * 扩展BaseConnectionManager以支持Binance特定的连接功能
 */

import { BaseConnectionManager, ConnectionConfig, ConnectionState } from '@pixiu/adapter-base';
import { EventEmitter } from 'events';

export interface BinanceCombinedStreamConfig {
  /** 流名称列表 */
  streams: string[];
  /** 是否自动管理流 */
  autoManage?: boolean;
  /** 最大流数量限制 */
  maxStreams?: number;
  /** 批量操作延迟 (ms) */
  batchDelay?: number;
}

export interface BinanceConnectionConfig extends ConnectionConfig {
  /** Binance特定配置 */
  binance?: {
    /** 是否使用测试网 */
    testnet?: boolean;
    /** 是否启用数据压缩 */
    enableCompression?: boolean;
    /** 组合流配置 */
    combinedStream?: BinanceCombinedStreamConfig;
    /** 连接池配置 */
    connectionPool?: {
      /** 最大连接数 */
      maxConnections?: number;
      /** 连接超时 */
      connectionTimeout?: number;
      /** 空闲超时 */
      idleTimeout?: number;
    };
    /** 重连策略配置 */
    reconnectStrategy?: {
      /** 重连指数退避基数 */
      backoffBase?: number;
      /** 最大重连间隔 */
      maxRetryInterval?: number;
      /** 重连抖动 */
      jitter?: boolean;
    };
  };
}

export interface BinanceConnectionMetrics {
  /** 活跃流数量 */
  activeStreams: number;
  /** 流变更次数 */
  streamChanges: number;
  /** 重连次数 */
  reconnectCount: number;
  /** 消息处理延迟 */
  messageLatency: number;
  /** 流管理操作统计 */
  streamOperations: {
    additions: number;
    removals: number;
    modifications: number;
  };
}

export class BinanceConnectionManager extends BaseConnectionManager {
  private activeStreams = new Set<string>();
  private combinedStreamUrl?: string;
  private binanceConfig?: BinanceConnectionConfig['binance'];
  private connectionPool = new Map<string, any>();
  private streamBatchTimer?: NodeJS.Timeout;
  private pendingStreamOperations: Array<{ type: 'add' | 'remove'; stream: string }> = [];
  private binanceMetrics: BinanceConnectionMetrics = {
    activeStreams: 0,
    streamChanges: 0,
    reconnectCount: 0,
    messageLatency: 0,
    streamOperations: {
      additions: 0,
      removals: 0,
      modifications: 0
    }
  };

  /**
   * 获取Binance特定指标
   */
  getBinanceMetrics(): BinanceConnectionMetrics {
    this.binanceMetrics.activeStreams = this.activeStreams.size;
    return { ...this.binanceMetrics };
  }

  /**
   * 添加流到组合流
   */
  async addStream(streamName: string): Promise<void> {
    if (this.activeStreams.has(streamName)) {
      return;
    }

    // 检查流数量限制
    const maxStreams = this.binanceConfig?.combinedStream?.maxStreams ?? 1024;
    if (this.activeStreams.size >= maxStreams) {
      throw new Error(`Maximum stream limit (${maxStreams}) reached`);
    }

    this.activeStreams.add(streamName);
    this.binanceMetrics.streamOperations.additions++;
    this.binanceMetrics.streamChanges++;
    this.emit('streamAdded', streamName);
    
    if (this.binanceConfig?.combinedStream?.autoManage) {
      await this.scheduleStreamUpdate('add', streamName);
    }
  }

  /**
   * 从组合流中移除流
   */
  async removeStream(streamName: string): Promise<void> {
    if (!this.activeStreams.has(streamName)) {
      return;
    }

    this.activeStreams.delete(streamName);
    this.binanceMetrics.streamOperations.removals++;
    this.binanceMetrics.streamChanges++;
    this.emit('streamRemoved', streamName);
    
    if (this.binanceConfig?.combinedStream?.autoManage) {
      await this.scheduleStreamUpdate('remove', streamName);
    }
  }

  /**
   * 获取活跃的流列表
   */
  getActiveStreams(): string[] {
    return Array.from(this.activeStreams);
  }

  /**
   * 批量流操作调度器
   */
  private async scheduleStreamUpdate(type: 'add' | 'remove', streamName: string): Promise<void> {
    this.pendingStreamOperations.push({ type, stream: streamName });
    
    if (this.streamBatchTimer) {
      clearTimeout(this.streamBatchTimer);
    }
    
    const batchDelay = this.binanceConfig?.combinedStream?.batchDelay ?? 500;
    this.streamBatchTimer = setTimeout(() => {
      this.processPendingStreamOperations();
    }, batchDelay);
  }

  /**
   * 处理待处理的流操作
   */
  private async processPendingStreamOperations(): Promise<void> {
    if (this.pendingStreamOperations.length === 0) {
      return;
    }

    try {
      await this.reconnectWithStreams();
      this.binanceMetrics.streamOperations.modifications++;
      this.pendingStreamOperations = [];
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * 使用新的流列表重新连接
   */
  private async reconnectWithStreams(): Promise<void> {
    if (this.activeStreams.size === 0) {
      return;
    }

    const currentConfig = this.getConfig();
    const originalUrl = currentConfig.url.split('?')[0].replace('/stream', '');
    const newUrl = this.buildCombinedStreamUrl(Array.from(this.activeStreams), originalUrl);
    
    // 更新URL并重连
    const newConfig = { ...currentConfig, url: newUrl };
    
    // 断开现有连接
    if (this.isConnected()) {
      await this.disconnect();
    }
    
    // 重新连接
    this.binanceMetrics.reconnectCount++;
    await super.connect(newConfig);
  }

  /**
   * 构建Binance组合流URL
   */
  private buildCombinedStreamUrl(streams: string[], baseUrl: string): string {
    // 移除可能的WebSocket路径
    const cleanBaseUrl = baseUrl.replace(/\/ws.*$/, '');
    
    if (streams.length === 0) {
      return `${cleanBaseUrl}/ws`;
    } else if (streams.length === 1) {
      return `${cleanBaseUrl}/ws/${streams[0]}`;
    } else {
      // 组合流格式: wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade
      const streamParam = streams.join('/');
      return `${cleanBaseUrl}/stream?streams=${streamParam}`;
    }
  }

  /**
   * 高级连接池管理
   */
  private async manageConnectionPool(): Promise<void> {
    const poolConfig = this.binanceConfig?.connectionPool;
    if (!poolConfig) {
      return;
    }

    // 清理空闲连接
    const now = Date.now();
    const idleTimeout = poolConfig.idleTimeout ?? 300000; // 5分钟默认
    
    for (const [id, connection] of this.connectionPool) {
      if (now - connection.lastActivity > idleTimeout) {
        this.connectionPool.delete(id);
      }
    }
  }

  /**
   * 智能重连策略
   */
  async reconnect(): Promise<void> {
    const strategy = this.binanceConfig?.reconnectStrategy;
    if (strategy) {
      // 计算指数退避延迟
      const baseDelay = this.getConfig().retryInterval;
      const backoffBase = strategy.backoffBase ?? 2;
      const maxDelay = strategy.maxRetryInterval ?? 30000;
      
      let delay = Math.min(baseDelay * Math.pow(backoffBase, this.binanceMetrics.reconnectCount), maxDelay);
      
      // 添加抖动以避免雷群效应
      if (strategy.jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    return super.reconnect();
  }

  /**
   * 实时性能监控
   */
  private trackMessageLatency(startTime: number): void {
    const latency = Date.now() - startTime;
    // 使用指数移动平均更新延迟
    this.binanceMetrics.messageLatency = this.binanceMetrics.messageLatency === 0 
      ? latency 
      : this.binanceMetrics.messageLatency * 0.9 + latency * 0.1;
  }

  /**
   * 健康检查增强
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    const baseHealth = await super.ping().then(
      latency => ({ healthy: true, latency }),
      error => ({ healthy: false, error: error.message })
    );
    
    const binanceHealth = {
      activeStreams: this.activeStreams.size,
      metrics: this.getBinanceMetrics(),
      connectionPool: {
        size: this.connectionPool.size,
        health: 'good'
      }
    };
    
    return {
      healthy: baseHealth.healthy && this.activeStreams.size > 0,
      details: {
        ...baseHealth,
        binance: binanceHealth
      }
    };
  }

  /**
   * 重写连接方法以支持Binance特定的URL构建
   */
  async connect(config: BinanceConnectionConfig): Promise<void> {
    this.binanceConfig = config.binance;
    
    // 如果配置了组合流，构建组合流URL
    if (config.binance?.combinedStream?.streams.length) {
      this.activeStreams = new Set(config.binance.combinedStream.streams);
      const finalConfig = {
        ...config,
        url: this.buildCombinedStreamUrl(Array.from(this.activeStreams), config.url)
      };
      return await super.connect(finalConfig);
    } else {
      return await super.connect(config);
    }
  }

  /**
   * 优雅关闭连接
   */
  async destroy(): Promise<void> {
    // 清理定时器
    if (this.streamBatchTimer) {
      clearTimeout(this.streamBatchTimer);
    }
    
    // 清理连接池
    this.connectionPool.clear();
    
    // 重置指标
    this.binanceMetrics = {
      activeStreams: 0,
      streamChanges: 0,
      reconnectCount: 0,
      messageLatency: 0,
      streamOperations: {
        additions: 0,
        removals: 0,
        modifications: 0
      }
    };
    
    return super.destroy();
  }
}