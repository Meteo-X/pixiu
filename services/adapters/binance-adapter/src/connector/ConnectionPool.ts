/**
 * Binance WebSocket 连接池管理器
 * 
 * 功能:
 * - 管理多个 WebSocket 连接
 * - 智能负载均衡
 * - 连接健康监控
 * - 自动清理和优化
 * - 容错和故障转移
 */

import { EventEmitter } from 'events';
import {
  IConnectionPool,
  IBinanceConnection,
  ConnectionPoolConfig,
  HeartbeatConfig,
  ReconnectConfig,
  ConnectionEvent,
  ConnectionState
} from './interfaces';
import { DataSubscription } from '../types';
import { BinanceConnection } from './BinanceConnection';

export class ConnectionPool extends EventEmitter implements IConnectionPool {
  private connections = new Map<string, IBinanceConnection>();
  private config: ConnectionPoolConfig;
  private wsEndpoint: string;
  private heartbeatConfig: HeartbeatConfig;
  private reconnectConfig: ReconnectConfig;
  
  // 监控和清理
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  // 负载均衡状态
  private lastSelectedConnectionIndex = 0;
  private connectionCreationInProgress = new Set<Promise<IBinanceConnection>>();

  constructor(
    wsEndpoint: string,
    config: ConnectionPoolConfig,
    heartbeatConfig: HeartbeatConfig,
    reconnectConfig: ReconnectConfig
  ) {
    super();
    
    this.wsEndpoint = wsEndpoint;
    this.config = config;
    this.heartbeatConfig = heartbeatConfig;
    this.reconnectConfig = reconnectConfig;
  }

  /**
   * 启动连接池
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // 启动健康检查
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // 启动清理任务
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.config.idleTimeout / 2); // 每半个空闲超时时间运行一次
  }

  /**
   * 停止连接池
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // 清理定时器
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 关闭所有连接
    const disconnectPromises = Array.from(this.connections.values()).map(conn => 
      conn.disconnect('Pool shutdown')
    );

    await Promise.allSettled(disconnectPromises);
    this.connections.clear();
  }

  /**
   * 获取可用连接
   * 使用智能负载均衡算法选择最佳连接
   */
  public async getAvailableConnection(subscriptionCount = 1): Promise<IBinanceConnection> {
    // 首先尝试找到现有的健康连接
    const availableConnection = this.findBestAvailableConnection(subscriptionCount);
    if (availableConnection) {
      return availableConnection;
    }

    // 如果没有可用连接且未达到最大连接数，创建新连接
    if (this.connections.size < this.config.maxConnections) {
      return await this.createConnection();
    }

    // 如果达到最大连接数，等待现有连接变为可用或创建新连接替换不健康的连接
    return await this.waitForAvailableConnectionOrReplace(subscriptionCount);
  }

  /**
   * 创建新连接
   */
  public async createConnection(): Promise<IBinanceConnection> {
    if (this.connections.size >= this.config.maxConnections) {
      throw new Error(`Connection pool limit reached: ${this.config.maxConnections}`);
    }

    // 检查是否已有相同的连接创建正在进行
    const existingCreation = Array.from(this.connectionCreationInProgress)[0];
    if (existingCreation) {
      return await existingCreation;
    }

    const creationPromise = this.doCreateConnection();
    this.connectionCreationInProgress.add(creationPromise);

    try {
      const connection = await creationPromise;
      this.connectionCreationInProgress.delete(creationPromise);
      return connection;
    } catch (error) {
      this.connectionCreationInProgress.delete(creationPromise);
      throw error;
    }
  }

  /**
   * 移除连接
   */
  public async removeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    this.connections.delete(connectionId);
    
    try {
      await connection.disconnect('Removed from pool');
      
      // 如果连接有 destroy 方法，调用它进行清理
      if ('destroy' in connection && typeof connection.destroy === 'function') {
        (connection as any).destroy();
      }
      
    } catch (error) {
      // 忽略断开连接时的错误
    }

    this.emit('connection_removed', {
      connectionId,
      timestamp: Date.now(),
      reason: 'Manual removal'
    });
  }

  /**
   * 获取所有连接
   */
  public getAllConnections(): IBinanceConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * 获取健康连接数
   */
  public getHealthyConnectionCount(): number {
    return Array.from(this.connections.values()).filter(conn => conn.isHealthy()).length;
  }

  /**
   * 执行健康检查
   */
  public async performHealthCheck(): Promise<void> {
    const connections = Array.from(this.connections.values());
    const unhealthyConnections: IBinanceConnection[] = [];
    const healthReports: Array<{
      connectionId: string;
      isHealthy: boolean;
      healthScore: number;
      state: ConnectionState;
    }> = [];

    for (const connection of connections) {
      const isHealthy = connection.isHealthy();
      const healthScore = connection.getHealthScore();
      const state = connection.state;

      healthReports.push({
        connectionId: connection.id,
        isHealthy,
        healthScore,
        state
      });

      if (!isHealthy) {
        unhealthyConnections.push(connection);
      }
    }

    // 发射健康检查事件
    this.emit('health_check_completed', {
      timestamp: Date.now(),
      totalConnections: connections.length,
      healthyConnections: connections.length - unhealthyConnections.length,
      reports: healthReports
    });

    // 处理不健康的连接
    for (const connection of unhealthyConnections) {
      await this.handleUnhealthyConnection(connection);
    }
  }

  /**
   * 清理空闲连接
   */
  public async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const connectionsToRemove: IBinanceConnection[] = [];

    for (const connection of this.connections.values()) {
      const stats = connection.getStats();
      
      // 检查连接是否空闲太久
      const isIdle = stats.activeSubscriptions === 0;
      const idleTime = now - (stats.connectedAt || now);
      const isIdleTooLong = isIdle && idleTime > this.config.idleTimeout;
      
      // 检查连接是否处于错误状态太久
      const isInErrorState = stats.state === ConnectionState.ERROR || 
                            stats.state === ConnectionState.TERMINATED;

      if (isIdleTooLong || isInErrorState) {
        connectionsToRemove.push(connection);
      }
    }

    // 但是至少保留一个连接 (如果池中只有空闲连接)
    if (connectionsToRemove.length === this.connections.size && this.connections.size > 0) {
      connectionsToRemove.pop(); // 保留最后一个连接
    }

    // 移除标记的连接
    for (const connection of connectionsToRemove) {
      await this.removeConnection(connection.id);
    }

    if (connectionsToRemove.length > 0) {
      this.emit('idle_cleanup_completed', {
        timestamp: Date.now(),
        removedConnections: connectionsToRemove.length,
        remainingConnections: this.connections.size
      });
    }
  }

  /**
   * 获取池统计信息
   */
  public getPoolStats() {
    const connections = Array.from(this.connections.values());
    const healthyCount = connections.filter(conn => conn.isHealthy()).length;
    const activeCount = connections.filter(conn => conn.state === ConnectionState.ACTIVE).length;
    const idleCount = connections.filter(conn => conn.getActiveSubscriptionCount() === 0).length;
    const totalSubscriptions = connections.reduce((sum, conn) => sum + conn.getActiveSubscriptionCount(), 0);

    return {
      totalConnections: connections.length,
      healthyConnections: healthyCount,
      activeConnections: activeCount,
      idleConnections: idleCount,
      totalSubscriptions
    };
  }

  // ============================================================================
  // 私有方法 - 连接管理
  // ============================================================================

  /**
   * 实际创建连接的方法
   */
  private async doCreateConnection(): Promise<IBinanceConnection> {
    const connection = new BinanceConnection(
      this.wsEndpoint,
      this.heartbeatConfig,
      this.reconnectConfig,
      this.config.maxStreamsPerConnection,
      this.config.connectionTimeout
    );

    // 设置连接事件监听器
    this.setupConnectionEventHandlers(connection);

    try {
      await connection.connect();
      this.connections.set(connection.id, connection);
      
      this.emit('connection_created', {
        connectionId: connection.id,
        timestamp: Date.now(),
        endpoint: this.wsEndpoint
      });

      return connection;
    } catch (error) {
      // 清理失败的连接
      if ('destroy' in connection && typeof connection.destroy === 'function') {
        (connection as any).destroy();
      }
      throw error;
    }
  }

  /**
   * 设置连接事件处理器
   */
  private setupConnectionEventHandlers(connection: IBinanceConnection): void {
    // 转发重要事件
    const eventsToForward = [
      ConnectionEvent.CONNECTED,
      ConnectionEvent.DISCONNECTED,
      ConnectionEvent.ERROR,
      ConnectionEvent.HEARTBEAT_TIMEOUT
    ];

    eventsToForward.forEach(event => {
      connection.on(event, (data) => {
        this.emit(event, { ...data, poolId: 'main' });
      });
    });

    // 特殊处理状态变更事件
    connection.on(ConnectionEvent.STATE_CHANGED, (data) => {
      this.emit(ConnectionEvent.STATE_CHANGED, { ...data, poolId: 'main' });
      
      // 如果连接变为错误状态，触发健康检查
      if (data.newState === ConnectionState.ERROR || data.newState === ConnectionState.TERMINATED) {
        setImmediate(() => this.performHealthCheck());
      }
    });
  }

  /**
   * 查找最佳可用连接
   * 使用加权负载均衡算法
   */
  private findBestAvailableConnection(subscriptionCount: number): IBinanceConnection | null {
    const healthyConnections = Array.from(this.connections.values())
      .filter(conn => conn.canAcceptMoreSubscriptions(subscriptionCount));

    if (healthyConnections.length === 0) {
      return null;
    }

    // 计算每个连接的权重分数
    const connectionScores = healthyConnections.map(conn => {
      const stats = conn.getStats();
      const healthScore = conn.getHealthScore();
      const loadScore = 1 - (stats.activeSubscriptions / this.config.maxStreamsPerConnection);
      const performanceStats = conn.getPerformanceStats();
      const latencyScore = Math.max(0, 1 - performanceStats.latency.average / 200);

      // 综合评分 (健康度 40%, 负载 40%, 延迟 20%)
      const totalScore = (healthScore * 0.4) + (loadScore * 0.4) + (latencyScore * 0.2);

      return { connection: conn, score: totalScore };
    });

    // 选择评分最高的连接
    connectionScores.sort((a, b) => b.score - a.score);
    return connectionScores[0].connection;
  }

  /**
   * 等待可用连接或替换不健康连接
   */
  private async waitForAvailableConnectionOrReplace(subscriptionCount: number): Promise<IBinanceConnection> {
    // 首先尝试等待现有连接变为可用 (最多等待 5 秒)
    const waitTimeout = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < waitTimeout) {
      const availableConnection = this.findBestAvailableConnection(subscriptionCount);
      if (availableConnection) {
        return availableConnection;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100)); // 等待 100ms
    }

    // 如果等待后仍无可用连接，尝试替换最不健康的连接
    const unhealthyConnection = this.findLeastHealthyConnection();
    if (unhealthyConnection) {
      await this.removeConnection(unhealthyConnection.id);
      return await this.createConnection();
    }

    // 最后手段：抛出错误
    throw new Error('No available connections and cannot create new connection');
  }

  /**
   * 查找最不健康的连接
   */
  private findLeastHealthyConnection(): IBinanceConnection | null {
    const connections = Array.from(this.connections.values());
    if (connections.length === 0) {
      return null;
    }

    let leastHealthy = connections[0];
    let lowestScore = leastHealthy.getHealthScore();

    for (const connection of connections) {
      const score = connection.getHealthScore();
      if (score < lowestScore) {
        lowestScore = score;
        leastHealthy = connection;
      }
    }

    // 只有当最不健康的连接确实很不健康时才返回它
    return lowestScore < 0.3 ? leastHealthy : null;
  }

  /**
   * 处理不健康的连接
   */
  private async handleUnhealthyConnection(connection: IBinanceConnection): Promise<void> {
    const healthScore = connection.getHealthScore();
    const stats = connection.getStats();

    this.emit('unhealthy_connection_detected', {
      connectionId: connection.id,
      timestamp: Date.now(),
      healthScore,
      state: stats.state,
      activeSubscriptions: stats.activeSubscriptions
    });

    // 如果连接严重不健康且有订阅，尝试迁移订阅到其他连接
    if (healthScore < 0.2 && stats.activeSubscriptions > 0) {
      await this.migrateSubscriptions(connection);
    }

    // 如果连接处于终止状态或长时间不健康，移除它
    if (stats.state === ConnectionState.TERMINATED || 
        stats.state === ConnectionState.ERROR ||
        healthScore < 0.1) {
      await this.removeConnection(connection.id);
    }
  }

  /**
   * 迁移订阅到其他连接
   */
  private async migrateSubscriptions(sourceConnection: IBinanceConnection): Promise<void> {
    // 这是一个简化的实现
    // 在实际应用中，需要从 ConnectionManager 层面处理订阅迁移
    // 因为订阅信息通常在更高层维护
    
    this.emit('subscription_migration_needed', {
      sourceConnectionId: sourceConnection.id,
      timestamp: Date.now(),
      activeSubscriptions: sourceConnection.getActiveSubscriptionCount()
    });
  }

  /**
   * 获取详细的池统计信息
   */
  public getDetailedStats() {
    const connections = Array.from(this.connections.values());
    
    return {
      pool: this.getPoolStats(),
      connections: connections.map(conn => ({
        id: conn.id,
        state: conn.state,
        healthScore: conn.getHealthScore(),
        isHealthy: conn.isHealthy(),
        stats: conn.getStats(),
        heartbeatStats: conn.getHeartbeatStats(),
        performanceStats: conn.getPerformanceStats()
      })),
      config: this.config
    };
  }

  /**
   * 获取负载均衡信息
   */
  public getLoadBalancingInfo() {
    const connections = Array.from(this.connections.values());
    
    return {
      totalConnections: connections.length,
      totalCapacity: connections.length * this.config.maxStreamsPerConnection,
      usedCapacity: connections.reduce((sum, conn) => sum + conn.getActiveSubscriptionCount(), 0),
      availableCapacity: connections.reduce((sum, conn) => {
        const available = this.config.maxStreamsPerConnection - conn.getActiveSubscriptionCount();
        return sum + (conn.isHealthy() ? available : 0);
      }, 0),
      connectionDistribution: connections.map(conn => ({
        id: conn.id,
        subscriptions: conn.getActiveSubscriptionCount(),
        capacity: this.config.maxStreamsPerConnection,
        utilization: conn.getActiveSubscriptionCount() / this.config.maxStreamsPerConnection,
        isHealthy: conn.isHealthy()
      }))
    };
  }
}