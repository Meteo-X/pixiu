/**
 * 增强的 Binance 适配器
 * 
 * 集成了完整的错误处理和监控功能：
 * - 统一错误处理
 * - 延迟监控
 * - 状态监控
 * - 数据解析错误处理
 * - 性能监控
 */

import { EventEmitter } from 'events';
import {
  ExchangeAdapter,
  AdapterConfig,
  DataSubscription,
  AdapterStatus,
  AdapterStats,
  AdapterEvent,
  AdapterEventHandler,
  ConnectionError,
  DataParsingError
} from './types';
import { ConnectionManager } from './connector/ConnectionManager';
import { ErrorHandler, ErrorHandlerConfig, ErrorSeverity, ErrorCategory } from './connector/ErrorHandler';
import { LatencyMonitor, LatencyMonitorConfig, LatencyType } from './connector/LatencyMonitor';
import { AdapterStatusMonitor, StatusMonitorConfig } from './connector/AdapterStatusMonitor';

export class BinanceAdapterEnhanced extends EventEmitter implements ExchangeAdapter {
  public readonly exchange = 'binance';
  
  private config: AdapterConfig;
  private connectionManager: ConnectionManager;
  private errorHandler: ErrorHandler;
  private latencyMonitor: LatencyMonitor;
  private statusMonitor: AdapterStatusMonitor;
  
  private isInitialized = false;
  private isStarted = false;
  private subscriptions = new Map<string, DataSubscription>();
  
  // 性能计数器
  private messageCount = 0;
  private lastMessageTime = 0;
  private processingTimes: number[] = [];

  constructor() {
    super();
  }

  /**
   * 初始化适配器
   */
  public async initialize(config: AdapterConfig): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Adapter is already initialized');
    }

    this.config = config;

    try {
      // 初始化错误处理器
      this.errorHandler = new ErrorHandler(this.createErrorHandlerConfig());
      this.setupErrorHandlerEvents();

      // 初始化延迟监控器
      this.latencyMonitor = new LatencyMonitor(this.createLatencyMonitorConfig());
      this.setupLatencyMonitorEvents();

      // 初始化状态监控器
      this.statusMonitor = new AdapterStatusMonitor(this.createStatusMonitorConfig());
      this.setupStatusMonitorEvents();

      // 设置监控器之间的关联
      this.statusMonitor.setErrorHandler(this.errorHandler);
      this.statusMonitor.setLatencyMonitor(this.latencyMonitor);

      // 初始化连接管理器
      this.connectionManager = new ConnectionManager();
      await this.connectionManager.initialize(this.createConnectionManagerConfig());
      this.setupConnectionManagerEvents();

      // 更新状态
      this.statusMonitor.updateStatus(AdapterStatus.CONNECTING, 'Initialization completed');
      this.isInitialized = true;

      this.emit(AdapterEvent.STATUS_CHANGED, {
        status: AdapterStatus.CONNECTING,
        timestamp: Date.now()
      });

    } catch (error) {
      const enhancedError = this.errorHandler?.handleError(error, {
        operation: 'initialize',
        config: this.config
      });
      
      this.statusMonitor?.updateStatus(AdapterStatus.ERROR, 'Initialization failed', {
        error: enhancedError
      });
      
      throw new ConnectionError(`Failed to initialize adapter: ${error.message}`, error);
    }
  }

  /**
   * 启动适配器
   */
  public async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Adapter must be initialized before starting');
    }

    if (this.isStarted) {
      return;
    }

    try {
      this.statusMonitor.updateStatus(AdapterStatus.CONNECTING, 'Starting adapter');
      
      // 启动连接管理器
      await this.connectionManager.start();
      
      this.isStarted = true;
      this.statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Adapter started successfully');
      
      this.emit(AdapterEvent.CONNECTED, {
        timestamp: Date.now(),
        endpoint: this.config.wsEndpoint
      });

    } catch (error) {
      const enhancedError = this.errorHandler.handleError(error, {
        operation: 'start'
      });
      
      this.statusMonitor.updateStatus(AdapterStatus.ERROR, 'Failed to start', {
        error: enhancedError
      });
      
      throw new ConnectionError(`Failed to start adapter: ${error.message}`, error);
    }
  }

  /**
   * 停止适配器
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      this.statusMonitor.updateStatus(AdapterStatus.DISCONNECTING, 'Stopping adapter');
      
      // 停止连接管理器
      await this.connectionManager.stop();
      
      // 停止监控器
      this.latencyMonitor.stop();
      this.statusMonitor.stop();
      
      this.isStarted = false;
      this.statusMonitor.updateStatus(AdapterStatus.STOPPED, 'Adapter stopped');
      
      this.emit(AdapterEvent.DISCONNECTED, {
        timestamp: Date.now(),
        reason: 'Manual stop'
      });

    } catch (error) {
      const enhancedError = this.errorHandler.handleError(error, {
        operation: 'stop'
      });
      
      this.statusMonitor.updateStatus(AdapterStatus.ERROR, 'Failed to stop gracefully', {
        error: enhancedError
      });
      
      throw error;
    }
  }

  /**
   * 订阅数据流
   */
  public async subscribe(subscriptions: DataSubscription[]): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Adapter must be started before subscribing');
    }

    const startTime = performance.now();

    try {
      this.statusMonitor.updateStatus(AdapterStatus.SUBSCRIBING, 'Adding subscriptions');
      
      // 记录订阅延迟
      const subscriptionStartTime = Date.now();
      
      await this.connectionManager.subscribe(subscriptions);
      
      const subscriptionLatency = Date.now() - subscriptionStartTime;
      this.latencyMonitor.recordLatency({
        type: LatencyType.SUBSCRIPTION,
        value: subscriptionLatency,
        timestamp: Date.now(),
        metadata: {
          operation: 'subscribe',
          subscriptionCount: subscriptions.length
        }
      });
      
      // 更新本地订阅记录
      subscriptions.forEach(sub => {
        const key = this.getSubscriptionKey(sub);
        this.subscriptions.set(key, sub);
      });
      
      this.statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Subscriptions added successfully');
      
      this.emit(AdapterEvent.SUBSCRIBED, {
        subscriptions,
        timestamp: Date.now()
      });

    } catch (error) {
      const enhancedError = this.errorHandler.handleError(error, {
        operation: 'subscribe',
        subscriptions
      });
      
      this.statusMonitor.updateStatus(AdapterStatus.ACTIVE, 'Subscription failed', {
        error: enhancedError
      });
      
      throw error;
    } finally {
      // 记录处理时间
      const processingTime = performance.now() - startTime;
      this.recordProcessingTime(processingTime);
    }
  }

  /**
   * 取消订阅
   */
  public async unsubscribe(subscriptions: DataSubscription[]): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Adapter must be started before unsubscribing');
    }

    const startTime = performance.now();

    try {
      await this.connectionManager.unsubscribe(subscriptions);
      
      // 更新本地订阅记录
      subscriptions.forEach(sub => {
        const key = this.getSubscriptionKey(sub);
        this.subscriptions.delete(key);
      });
      
      this.emit(AdapterEvent.UNSUBSCRIBED, {
        subscriptions,
        timestamp: Date.now()
      });

    } catch (error) {
      const enhancedError = this.errorHandler.handleError(error, {
        operation: 'unsubscribe',
        subscriptions
      });
      
      throw error;
    } finally {
      const processingTime = performance.now() - startTime;
      this.recordProcessingTime(processingTime);
    }
  }

  /**
   * 获取适配器状态
   */
  public getStatus(): AdapterStatus {
    return this.statusMonitor?.getCurrentStatus() || AdapterStatus.INITIALIZING;
  }

  /**
   * 获取适配器统计
   */
  public getStats(): AdapterStats {
    const connectionManagerStats = this.connectionManager?.getDetailedStats();
    const errorStats = this.errorHandler?.getErrorStats();
    const latencyStats = this.latencyMonitor?.getAllStats();
    const statusSnapshot = this.statusMonitor?.getLatestSnapshot();
    
    return {
      status: this.getStatus(),
      connection: {
        connectedAt: statusSnapshot?.timestamp,
        uptime: this.statusMonitor?.getUptime() || 0,
        totalConnections: connectionManagerStats?.manager?.totalConnections || 0,
        failedConnections: 0, // 从错误统计中获取
        reconnections: 0, // 从连接统计中获取
        lastError: errorStats?.lastError
      },
      messages: {
        received: this.messageCount,
        processed: this.messageCount, // 暂时假设所有消息都被处理
        sent: 0, // Pub/Sub 发送统计
        bytesReceived: 0, // 需要从连接管理器获取
        messagesPerSecond: this.calculateMessagesPerSecond(),
        bytesPerSecond: 0
      },
      performance: {
        latency: latencyStats?.network || {
          current: 0,
          average: 0,
          min: 0,
          max: 0,
          p50: 0,
          p90: 0,
          p95: 0,
          p99: 0
        },
        processingTime: {
          average: this.calculateAverageProcessingTime(),
          p95: this.calculatePercentileProcessingTime(95),
          p99: this.calculatePercentileProcessingTime(99)
        }
      },
      errors: {
        total: errorStats?.total || 0,
        connection: errorStats?.byCategory?.connection || 0,
        parsing: errorStats?.byCategory?.data_parsing || 0,
        pubsub: errorStats?.byCategory?.pubsub || 0,
        lastError: errorStats?.lastError,
        recent: errorStats?.recentErrors || []
      },
      subscriptions: {
        active: this.subscriptions.size,
        byType: this.getSubscriptionsByType(),
        bySymbol: this.getSubscriptionsBySymbol()
      }
    };
  }

  /**
   * 注册事件处理器
   */
  public on(event: AdapterEvent, handler: AdapterEventHandler): void {
    super.on(event, handler);
  }

  /**
   * 移除事件处理器
   */
  public off(event: AdapterEvent, handler: AdapterEventHandler): void {
    super.off(event, handler);
  }

  // ============================================================================
  // 私有方法 - 配置创建
  // ============================================================================

  private createErrorHandlerConfig(): ErrorHandlerConfig {
    return {
      maxRecentErrors: 100,
      errorRateWindow: 60000, // 1分钟
      criticalErrorThreshold: 10,
      retryLimits: {
        connection: 5,
        heartbeat: 3,
        protocol: 3,
        data_parsing: 0, // 数据解析错误不重试
        subscription: 3,
        pubsub: 3,
        config: 0,
        network: 5,
        authentication: 1,
        rate_limit: 0,
        unknown: 1
      },
      circuitBreakerThreshold: 20, // 20错误/分钟
      alerting: {
        enabled: true,
        criticalErrorNotification: true,
        errorRateThreshold: 10 // 10错误/分钟
      }
    };
  }

  private createLatencyMonitorConfig(): LatencyMonitorConfig {
    return {
      sampling: {
        maxSamples: 10000,
        windowSize: 300000, // 5分钟
        sampleInterval: 1000 // 1秒
      },
      buckets: {
        boundaries: [0, 10, 50, 100, 200, 500, 1000, 2000, 5000]
      },
      thresholds: {
        [LatencyType.NETWORK]: {
          warning: 100,
          critical: 500,
          p95Warning: 200,
          p99Critical: 1000
        },
        [LatencyType.PROCESSING]: {
          warning: 10,
          critical: 50,
          p95Warning: 20,
          p99Critical: 100
        },
        [LatencyType.END_TO_END]: {
          warning: 150,
          critical: 750,
          p95Warning: 300,
          p99Critical: 1500
        },
        [LatencyType.HEARTBEAT]: {
          warning: 30000,
          critical: 60000,
          p95Warning: 45000,
          p99Critical: 90000
        },
        [LatencyType.SUBSCRIPTION]: {
          warning: 5000,
          critical: 15000,
          p95Warning: 10000,
          p99Critical: 30000
        }
      },
      trend: {
        enabled: true,
        windowCount: 24, // 24小时
        significantChange: 20 // 20%变化
      },
      baseline: {
        enabled: true,
        targetLatency: {
          [LatencyType.NETWORK]: 50,
          [LatencyType.PROCESSING]: 5,
          [LatencyType.END_TO_END]: 100,
          [LatencyType.HEARTBEAT]: 20000,
          [LatencyType.SUBSCRIPTION]: 2000
        },
        acceptableDeviation: 50 // 50%偏差
      }
    };
  }

  private createStatusMonitorConfig(): StatusMonitorConfig {
    return {
      updateInterval: 5000, // 5秒
      snapshotRetention: 720, // 保留1小时 (5秒间隔)
      healthThresholds: {
        warning: 0.7,
        critical: 0.4
      },
      benchmarks: {
        messagesPerSecond: {
          target: 1000,
          warning: 500,
          critical: 100
        },
        latency: {
          target: 50,
          warning: 100,
          critical: 500
        },
        errorRate: {
          target: 1, // 1%
          warning: 5, // 5%
          critical: 10 // 10%
        },
        connectionSuccess: {
          target: 99, // 99%
          warning: 95, // 95%
          critical: 90 // 90%
        }
      },
      alerting: {
        enabled: true,
        cooldownPeriod: 300000 // 5分钟冷却期
      }
    };
  }

  private createConnectionManagerConfig(): any {
    return {
      wsEndpoint: this.config.wsEndpoint,
      pool: this.config.connection,
      heartbeat: {
        pingTimeoutThreshold: this.config.connection.pingTimeout,
        healthCheckInterval: 10000,
        pongResponseTimeout: 5000
      },
      reconnect: this.config.retry,
      monitoring: {
        metricsInterval: 5000,
        healthScoreThreshold: 0.7,
        alertOnHealthDrop: true,
        latencyBuckets: [10, 50, 100, 200, 500, 1000]
      }
    };
  }

  // ============================================================================
  // 私有方法 - 事件处理
  // ============================================================================

  private setupErrorHandlerEvents(): void {
    this.errorHandler.on('critical_error', (error) => {
      this.emit(AdapterEvent.ERROR, error);
    });

    this.errorHandler.on('circuit_breaker_opened', (data) => {
      this.statusMonitor.updateStatus(AdapterStatus.ERROR, 'Circuit breaker opened', data);
    });

    this.errorHandler.on('retry_requested', (error) => {
      // 处理重试请求
      this.handleRetryRequest(error);
    });

    this.errorHandler.on('reconnect_requested', (error) => {
      // 处理重连请求
      this.handleReconnectRequest(error);
    });
  }

  private setupLatencyMonitorEvents(): void {
    this.latencyMonitor.on('latency_alert', (alert) => {
      this.emit(AdapterEvent.ERROR, {
        timestamp: alert.timestamp,
        message: alert.message,
        code: 'LATENCY_ALERT',
        type: 'PERFORMANCE',
        context: alert
      });
    });

    this.latencyMonitor.on('trend_detected', (trend) => {
      if (trend.trend.trendDirection === 'degrading') {
        this.emit(AdapterEvent.ERROR, {
          timestamp: trend.timestamp,
          message: `Performance degradation detected in ${trend.type}`,
          code: 'PERFORMANCE_DEGRADATION',
          type: 'PERFORMANCE',
          context: trend
        });
      }
    });
  }

  private setupStatusMonitorEvents(): void {
    this.statusMonitor.on('status_changed', (event) => {
      this.emit(AdapterEvent.STATUS_CHANGED, event);
    });

    this.statusMonitor.on('health_alert', (alert) => {
      this.emit(AdapterEvent.ERROR, {
        timestamp: alert.timestamp,
        message: alert.message,
        code: 'HEALTH_ALERT',
        type: 'MONITORING',
        context: alert
      });
    });
  }

  private setupConnectionManagerEvents(): void {
    // 转发连接管理器事件
    this.connectionManager.on('connected', (data) => {
      this.emit(AdapterEvent.CONNECTED, data);
    });

    this.connectionManager.on('disconnected', (data) => {
      this.emit(AdapterEvent.DISCONNECTED, data);
    });

    this.connectionManager.on('error', (error) => {
      const enhancedError = this.errorHandler.handleError(error, {
        source: 'connection_manager'
      });
      this.emit(AdapterEvent.ERROR, enhancedError);
    });

    this.connectionManager.on('data_received', (data) => {
      this.handleDataReceived(data);
    });
  }

  // ============================================================================
  // 私有方法 - 数据处理
  // ============================================================================

  private handleDataReceived(data: any): void {
    const startTime = performance.now();
    
    try {
      // 记录网络延迟
      if (data.latency && data.latency > 0) {
        this.latencyMonitor.recordNetworkLatency(data.latency, data.connectionId, {
          streamName: data.streamName,
          dataType: data.dataType
        });
      }

      // 更新消息计数
      this.messageCount++;
      this.lastMessageTime = Date.now();

      // 发射数据事件
      this.emit(AdapterEvent.DATA, {
        timestamp: data.timestamp,
        streamName: data.streamName,
        dataType: data.dataType,
        size: data.messageSize,
        latency: data.latency
      });

    } catch (error) {
      // 处理数据解析错误
      const enhancedError = this.errorHandler.handleError(
        new DataParsingError(`Failed to process received data: ${error.message}`, error),
        {
          source: 'data_processing',
          rawData: data
        }
      );
    } finally {
      // 记录处理延迟
      const processingTime = performance.now() - startTime;
      this.latencyMonitor.recordProcessingLatency(processingTime, 'data_processing');
      this.recordProcessingTime(processingTime);
    }
  }

  private handleRetryRequest(error: any): void {
    // 实现重试逻辑
    setTimeout(() => {
      // 根据错误类型决定重试操作
    }, 1000);
  }

  private handleReconnectRequest(error: any): void {
    // 实现重连逻辑
    this.connectionManager.forceReconnectAll().catch(err => {
      this.errorHandler.handleError(err, {
        source: 'reconnect_request',
        originalError: error
      });
    });
  }

  // ============================================================================
  // 私有方法 - 工具函数
  // ============================================================================

  private getSubscriptionKey(subscription: DataSubscription): string {
    return `${subscription.symbol}:${subscription.dataType}:${JSON.stringify(subscription.params || {})}`;
  }

  private recordProcessingTime(time: number): void {
    this.processingTimes.push(time);
    if (this.processingTimes.length > 1000) {
      this.processingTimes.shift();
    }
  }

  private calculateMessagesPerSecond(): number {
    const now = Date.now();
    const timeWindow = 60000; // 1分钟
    if (now - this.lastMessageTime > timeWindow) {
      return 0;
    }
    // 简化计算，实际应该基于时间窗口
    return this.messageCount / ((now - (this.statusMonitor?.getUptime() || now)) / 1000);
  }

  private calculateAverageProcessingTime(): number {
    if (this.processingTimes.length === 0) return 0;
    return this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
  }

  private calculatePercentileProcessingTime(percentile: number): number {
    if (this.processingTimes.length === 0) return 0;
    const sorted = [...this.processingTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  private getSubscriptionsByType(): Record<string, number> {
    const byType: Record<string, number> = {};
    for (const subscription of this.subscriptions.values()) {
      byType[subscription.dataType] = (byType[subscription.dataType] || 0) + 1;
    }
    return byType;
  }

  private getSubscriptionsBySymbol(): Record<string, number> {
    const bySymbol: Record<string, number> = {};
    for (const subscription of this.subscriptions.values()) {
      bySymbol[subscription.symbol] = (bySymbol[subscription.symbol] || 0) + 1;
    }
    return bySymbol;
  }

  /**
   * 获取详细监控数据 (用于调试和运维)
   */
  public getDetailedMonitoringData(): any {
    return {
      adapter: {
        status: this.getStatus(),
        stats: this.getStats(),
        uptime: this.statusMonitor?.getUptime(),
        subscriptionCount: this.subscriptions.size
      },
      errors: this.errorHandler?.getErrorStats(),
      latency: this.latencyMonitor?.getAllStats(),
      status: this.statusMonitor?.getLatestSnapshot(),
      healthTrend: this.statusMonitor?.getHealthTrend(),
      connections: this.connectionManager?.getDetailedStats()
    };
  }

  /**
   * 执行健康检查
   */
  public async performHealthCheck(): Promise<boolean> {
    try {
      const connectionHealth = await this.connectionManager.performHealthCheck();
      const snapshot = this.statusMonitor.getLatestSnapshot();
      const overallHealth = snapshot?.overallHealth || 0;
      
      return connectionHealth && overallHealth > 0.5 && this.isStarted;
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'health_check' });
      return false;
    }
  }
}