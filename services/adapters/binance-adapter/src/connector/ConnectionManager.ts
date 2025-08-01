/**
 * Binance WebSocket 连接管理器 - 主管理器
 * 
 * 功能:
 * - 统一管理所有 WebSocket 连接
 * - 处理订阅分发和负载均衡
 * - 提供高级管理功能和监控
 * - 集成所有底层组件
 */

import { EventEmitter } from 'events';
import {
  IConnectionManager,
  ConnectionManagerConfig,
  ConnectionEvent,
  IBinanceConnection,
  IConnectionPool
} from './interfaces';
import { DataSubscription } from '../types';
import { ConnectionPool } from './ConnectionPool';

export class ConnectionManager extends EventEmitter implements IConnectionManager {
  private config: ConnectionManagerConfig;
  private connectionPool: IConnectionPool;
  private isInitialized = false;
  private isRunning = false;
  
  // 订阅管理
  private activeSubscriptions = new Map<string, {
    subscription: DataSubscription;
    connectionId: string;
    subscribedAt: number;
  }>();
  
  // 监控和统计
  private startTime: number = 0;
  private totalSubscriptionRequests = 0;
  private totalUnsubscriptionRequests = 0;
  private subscriptionErrors = 0;
  
  // 定时器
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * 初始化连接管理器
   */
  public async initialize(config: ConnectionManagerConfig): Promise<void> {
    if (this.isInitialized) {
      throw new Error('ConnectionManager is already initialized');
    }

    this.config = { ...config };
    
    // 创建连接池
    this.connectionPool = new ConnectionPool(
      config.wsEndpoint,
      config.pool,
      config.heartbeat,
      config.reconnect
    );

    // 设置连接池事件监听
    this.setupConnectionPoolEventHandlers();

    this.isInitialized = true;
  }

  /**
   * 启动连接管理器
   */
  public async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ConnectionManager must be initialized before starting');
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();

    // 启动连接池
    await this.connectionPool.start();

    // 启动定时任务
    this.startPeriodicTasks();

    this.emit('manager_started', {
      timestamp: Date.now(),
      config: this.config
    });
  }

  /**
   * 停止连接管理器
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // 停止定时任务
    this.stopPeriodicTasks();

    // 停止连接池
    await this.connectionPool.stop();

    // 清理订阅信息
    this.activeSubscriptions.clear();

    this.emit('manager_stopped', {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime
    });
  }

  /**
   * 添加订阅
   */
  public async subscribe(subscriptions: DataSubscription[]): Promise<void> {
    if (!this.isRunning) {
      throw new Error('ConnectionManager is not running');
    }

    this.totalSubscriptionRequests++;

    try {
      // 过滤已存在的订阅
      const newSubscriptions = subscriptions.filter(sub => 
        !this.activeSubscriptions.has(this.getSubscriptionKey(sub))
      );

      if (newSubscriptions.length === 0) {
        return; // 所有订阅都已存在
      }

      // 按连接分组订阅 (负载均衡)
      const subscriptionsByConnection = await this.distributeSubscriptions(newSubscriptions);

      // 并行处理所有连接的订阅
      const subscriptionPromises = Array.from(subscriptionsByConnection.entries()).map(
        async ([connectionId, connSubs]) => {
          const connection = this.findConnectionById(connectionId);
          if (!connection) {
            throw new Error(`Connection ${connectionId} not found`);
          }

          await connection.subscribe(connSubs);

          // 更新订阅记录
          connSubs.forEach(sub => {
            this.activeSubscriptions.set(this.getSubscriptionKey(sub), {
              subscription: sub,
              connectionId,
              subscribedAt: Date.now()
            });
          });
        }
      );

      await Promise.all(subscriptionPromises);

      this.emit('subscriptions_added', {
        timestamp: Date.now(),
        subscriptions: newSubscriptions,
        totalActiveSubscriptions: this.activeSubscriptions.size
      });

    } catch (error) {
      this.subscriptionErrors++;
      this.emit('subscription_error', {
        timestamp: Date.now(),
        error: error.message,
        subscriptions
      });
      throw error;
    }
  }

  /**
   * 移除订阅
   */
  public async unsubscribe(subscriptions: DataSubscription[]): Promise<void> {
    if (!this.isRunning) {
      throw new Error('ConnectionManager is not running');
    }

    this.totalUnsubscriptionRequests++;

    try {
      // 按连接分组需要取消的订阅
      const subscriptionsByConnection = new Map<string, DataSubscription[]>();

      for (const subscription of subscriptions) {
        const key = this.getSubscriptionKey(subscription);
        const subInfo = this.activeSubscriptions.get(key);
        
        if (subInfo) {
          const connectionId = subInfo.connectionId;
          if (!subscriptionsByConnection.has(connectionId)) {
            subscriptionsByConnection.set(connectionId, []);
          }
          subscriptionsByConnection.get(connectionId)!.push(subscription);
        }
      }

      // 并行处理所有连接的取消订阅
      const unsubscriptionPromises = Array.from(subscriptionsByConnection.entries()).map(
        async ([connectionId, connSubs]) => {
          const connection = this.findConnectionById(connectionId);
          if (connection) {
            await connection.unsubscribe(connSubs);
          }

          // 更新订阅记录
          connSubs.forEach(sub => {
            this.activeSubscriptions.delete(this.getSubscriptionKey(sub));
          });
        }
      );

      await Promise.all(unsubscriptionPromises);

      this.emit('subscriptions_removed', {
        timestamp: Date.now(),
        subscriptions,
        totalActiveSubscriptions: this.activeSubscriptions.size
      });

    } catch (error) {
      this.subscriptionErrors++;
      this.emit('unsubscription_error', {
        timestamp: Date.now(),
        error: error.message,
        subscriptions
      });
      throw error;
    }
  }

  /**
   * 获取管理器状态
   */
  public getStatus() {
    const poolStats = this.connectionPool.getPoolStats();
    const overallHealthScore = this.calculateOverallHealthScore();

    return {
      isRunning: this.isRunning,
      connectionCount: poolStats.totalConnections,
      totalSubscriptions: poolStats.totalSubscriptions,
      healthyConnections: poolStats.healthyConnections,
      overallHealthScore
    };
  }

  /**
   * 获取详细统计
   */
  public getDetailedStats() {
    const poolStats = this.connectionPool.getDetailedStats();
    const uptime = this.isRunning ? Date.now() - this.startTime : 0;

    return {
      manager: {
        uptime,
        totalConnections: poolStats.pool.totalConnections,
        totalSubscriptions: this.activeSubscriptions.size,
        overallHealthScore: this.calculateOverallHealthScore(),
        subscriptionRequests: this.totalSubscriptionRequests,
        unsubscriptionRequests: this.totalUnsubscriptionRequests,
        subscriptionErrors: this.subscriptionErrors
      },
      connections: poolStats.connections.map(conn => conn.stats),
      performance: this.calculateAggregatedPerformanceStats(poolStats.connections),
      errors: this.getRecentErrors(poolStats.connections),
      subscriptions: this.getSubscriptionDistribution(),
      loadBalancing: this.connectionPool.getLoadBalancingInfo()
    };
  }

  /**
   * 强制重连所有连接
   */
  public async forceReconnectAll(): Promise<void> {
    const connections = this.connectionPool.getAllConnections();
    
    this.emit('force_reconnect_started', {
      timestamp: Date.now(),
      connectionCount: connections.length
    });

    // 并行重连所有连接
    const reconnectPromises = connections.map(async (connection) => {
      try {
        await connection.disconnect('Force reconnect');
        await connection.connect();
      } catch (error) {
        this.emit('reconnect_error', {
          connectionId: connection.id,
          timestamp: Date.now(),
          error: error.message
        });
      }
    });

    await Promise.allSettled(reconnectPromises);

    // 恢复所有订阅
    await this.restoreAllSubscriptions();

    this.emit('force_reconnect_completed', {
      timestamp: Date.now(),
      connectionCount: connections.length
    });
  }

  /**
   * 执行健康检查
   */
  public async performHealthCheck(): Promise<boolean> {
    await this.connectionPool.performHealthCheck();
    
    const status = this.getStatus();
    const isHealthy = status.overallHealthScore > 0.7 && 
                     status.healthyConnections > 0 &&
                     this.isRunning;

    this.emit('health_check_completed', {
      timestamp: Date.now(),
      isHealthy,
      status
    });

    return isHealthy;
  }

  // ============================================================================
  // 私有方法 - 订阅管理
  // ============================================================================

  /**
   * 分发订阅到不同连接 (负载均衡)
   */
  private async distributeSubscriptions(subscriptions: DataSubscription[]): Promise<Map<string, DataSubscription[]>> {
    const distribution = new Map<string, DataSubscription[]>();

    for (const subscription of subscriptions) {
      // 获取最合适的连接
      const connection = await this.connectionPool.getAvailableConnection(1);
      const connectionId = connection.id;

      if (!distribution.has(connectionId)) {
        distribution.set(connectionId, []);
      }
      distribution.get(connectionId)!.push(subscription);
    }

    return distribution;
  }

  /**
   * 根据 ID 查找连接
   */
  private findConnectionById(connectionId: string): IBinanceConnection | null {
    return this.connectionPool.getAllConnections().find(conn => conn.id === connectionId) || null;
  }

  /**
   * 恢复所有订阅
   */
  private async restoreAllSubscriptions(): Promise<void> {
    if (this.activeSubscriptions.size === 0) {
      return;
    }

    const subscriptions = Array.from(this.activeSubscriptions.values()).map(info => info.subscription);
    
    // 清除当前订阅记录
    this.activeSubscriptions.clear();
    
    // 重新订阅
    await this.subscribe(subscriptions);
  }

  /**
   * 获取订阅键
   */
  private getSubscriptionKey(subscription: DataSubscription): string {
    return `${subscription.symbol}:${subscription.dataType}:${JSON.stringify(subscription.params || {})}`;
  }

  // ============================================================================
  // 私有方法 - 事件处理
  // ============================================================================

  /**
   * 设置连接池事件处理器
   */
  private setupConnectionPoolEventHandlers(): void {
    // 转发重要事件
    const eventsToForward = [
      ConnectionEvent.CONNECTED,
      ConnectionEvent.DISCONNECTED,
      ConnectionEvent.ERROR,
      ConnectionEvent.HEARTBEAT_TIMEOUT,
      'connection_created',
      'connection_removed',
      'health_check_completed',
      'idle_cleanup_completed'
    ];

    eventsToForward.forEach(event => {
      this.connectionPool.on(event, (data) => {
        this.emit(event, data);
      });
    });

    // 处理订阅迁移需求
    this.connectionPool.on('subscription_migration_needed', async (data) => {
      await this.handleSubscriptionMigration(data.sourceConnectionId);
    });

    // 处理不健康连接
    this.connectionPool.on('unhealthy_connection_detected', (data) => {
      this.emit('unhealthy_connection_detected', data);
    });
  }

  /**
   * 处理订阅迁移
   */
  private async handleSubscriptionMigration(sourceConnectionId: string): Promise<void> {
    // 找到需要迁移的订阅
    const subscriptionsToMigrate = Array.from(this.activeSubscriptions.entries())
      .filter(([_, info]) => info.connectionId === sourceConnectionId)
      .map(([_, info]) => info.subscription);

    if (subscriptionsToMigrate.length === 0) {
      return;
    }

    this.emit('subscription_migration_started', {
      timestamp: Date.now(),
      sourceConnectionId,
      subscriptionCount: subscriptionsToMigrate.length
    });

    try {
      // 移除原订阅记录
      subscriptionsToMigrate.forEach(sub => {
        this.activeSubscriptions.delete(this.getSubscriptionKey(sub));
      });

      // 重新分发订阅
      await this.subscribe(subscriptionsToMigrate);

      this.emit('subscription_migration_completed', {
        timestamp: Date.now(),
        sourceConnectionId,
        subscriptionCount: subscriptionsToMigrate.length
      });

    } catch (error) {
      this.emit('subscription_migration_failed', {
        timestamp: Date.now(),
        sourceConnectionId,
        subscriptionCount: subscriptionsToMigrate.length,
        error: error.message
      });
    }
  }

  // ============================================================================
  // 私有方法 - 监控和统计
  // ============================================================================

  /**
   * 启动定期任务
   */
  private startPeriodicTasks(): void {
    // 健康检查
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.monitoring.healthCheck.interval);

    // 指标更新
    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, this.config.monitoring.metricsInterval);
  }

  /**
   * 停止定期任务
   */
  private stopPeriodicTasks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  /**
   * 更新指标
   */
  private updateMetrics(): void {
    const status = this.getStatus();
    
    this.emit('metrics_updated', {
      timestamp: Date.now(),
      status,
      detailedStats: this.getDetailedStats()
    });
  }

  /**
   * 计算总体健康分数
   */
  private calculateOverallHealthScore(): number {
    const connections = this.connectionPool.getAllConnections();
    
    if (connections.length === 0) {
      return 0;
    }

    const totalScore = connections.reduce((sum, conn) => sum + conn.getHealthScore(), 0);
    const avgConnectionHealth = totalScore / connections.length;

    // 考虑连接池的整体状态
    const poolStats = this.connectionPool.getPoolStats();
    const healthyRatio = poolStats.healthyConnections / poolStats.totalConnections;
    const loadFactor = poolStats.totalSubscriptions / (poolStats.totalConnections * this.config.pool.maxStreamsPerConnection);

    // 综合评分
    return (avgConnectionHealth * 0.6) + (healthyRatio * 0.3) + ((1 - loadFactor) * 0.1);
  }

  /**
   * 计算聚合性能统计
   */
  private calculateAggregatedPerformanceStats(connections: any[]) {
    if (connections.length === 0) {
      return {
        totalMessagesReceived: 0,
        totalBytesReceived: 0,
        avgMessagesPerSecond: 0,
        avgBytesPerSecond: 0,
        avgLatency: 0,
        p95Latency: 0
      };
    }

    const aggregated = connections.reduce((acc, conn) => {
      const perf = conn.performanceStats;
      return {
        totalMessagesReceived: acc.totalMessagesReceived + perf.messagesReceived,
        totalBytesReceived: acc.totalBytesReceived + perf.bytesReceived,
        totalMessagesPerSecond: acc.totalMessagesPerSecond + perf.messagesPerSecond,
        totalBytesPerSecond: acc.totalBytesPerSecond + perf.bytesPerSecond,
        latencySum: acc.latencySum + perf.latency.average,
        p95LatencySum: acc.p95LatencySum + perf.latency.p95
      };
    }, {
      totalMessagesReceived: 0,
      totalBytesReceived: 0,
      totalMessagesPerSecond: 0,
      totalBytesPerSecond: 0,
      latencySum: 0,
      p95LatencySum: 0
    });

    return {
      totalMessagesReceived: aggregated.totalMessagesReceived,
      totalBytesReceived: aggregated.totalBytesReceived,
      avgMessagesPerSecond: aggregated.totalMessagesPerSecond,
      avgBytesPerSecond: aggregated.totalBytesPerSecond,
      avgLatency: aggregated.latencySum / connections.length,
      p95Latency: aggregated.p95LatencySum / connections.length
    };
  }

  /**
   * 获取最近的错误
   */
  private getRecentErrors(connections: any[]) {
    const allErrors = connections
      .filter(conn => conn.stats.lastError)
      .map(conn => ({
        connectionId: conn.id,
        ...conn.stats.lastError
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20); // 最近 20 个错误

    return allErrors;
  }

  /**
   * 获取订阅分布
   */
  private getSubscriptionDistribution() {
    const distribution = new Map<string, number>();
    
    for (const info of this.activeSubscriptions.values()) {
      const count = distribution.get(info.connectionId) || 0;
      distribution.set(info.connectionId, count + 1);
    }

    return Array.from(distribution.entries()).map(([connectionId, count]) => ({
      connectionId,
      subscriptionCount: count
    }));
  }

  /**
   * 获取配置信息
   */
  public getConfig(): ConnectionManagerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置 (部分更新)
   */
  public updateConfig(newConfig: Partial<ConnectionManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    this.emit('config_updated', {
      timestamp: Date.now(),
      newConfig: this.config
    });
  }
}