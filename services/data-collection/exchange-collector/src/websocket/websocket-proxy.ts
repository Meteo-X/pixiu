/**
 * WebSocket代理服务器
 * 专注于纯前端连接代理，不处理业务逻辑
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'events';
import { BaseMonitor } from '@pixiu/shared-core';
import { ConnectionPoolManager, PoolConfig } from './connection-pool-manager';
import { parseJSON } from '../utils/data-processor';

export interface ProxyMessage {
  type: string;
  payload?: any;
  timestamp?: number;
}

export interface ClientConnection {
  id: string;
  socket: WebSocket;
  connectedAt: number;
  lastActivity: number;
  subscriptions: SubscriptionFilter[];
  metadata: Record<string, any>;
}

export interface SubscriptionFilter {
  exchange?: string[];
  symbols?: string[];
  dataTypes?: string[];
  clientId: string;
  filterId?: string;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  totalSubscriptions: number;
  averageConnectionDuration: number;
  messagesForwarded: number;
  errorsEncountered: number;
  lastActivity: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  connections: number;
  uptime: number;
  lastError?: {
    message: string;
    timestamp: number;
  };
  performance: {
    avgLatency: number;
    memoryUsage: number;
    cpuUsage?: number;
  };
}

/**
 * 订阅管理器
 * 高效的订阅过滤和匹配机制
 */
export class SubscriptionManager extends EventEmitter {
  private subscriptions: Map<string, SubscriptionFilter[]> = new Map();
  private stats = {
    totalSubscriptions: 0,
    activeFilters: 0,
    matchOperations: 0,
    lastActivity: 0
  };

  /**
   * 添加订阅
   */
  addSubscription(filter: SubscriptionFilter): void {
    const clientId = filter.clientId;
    
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, []);
    }
    
    const clientSubscriptions = this.subscriptions.get(clientId)!;
    clientSubscriptions.push(filter);
    
    this.stats.totalSubscriptions++;
    this.stats.activeFilters = this.getTotalFilters();
    this.stats.lastActivity = Date.now();
    
    this.emit('subscriptionAdded', filter);
  }

  /**
   * 移除订阅
   */
  removeSubscription(clientId: string, filterId?: string): void {
    const clientSubscriptions = this.subscriptions.get(clientId);
    if (!clientSubscriptions) {
      return;
    }

    if (filterId) {
      // 移除特定过滤器
      const index = clientSubscriptions.findIndex(f => f.filterId === filterId);
      if (index !== -1) {
        const removedFilter = clientSubscriptions.splice(index, 1)[0];
        this.stats.totalSubscriptions--;
        this.emit('subscriptionRemoved', removedFilter);
      }
    } else {
      // 移除客户端所有订阅
      const removedCount = clientSubscriptions.length;
      this.subscriptions.delete(clientId);
      this.stats.totalSubscriptions -= removedCount;
      this.emit('clientUnsubscribed', clientId, removedCount);
    }
    
    this.stats.activeFilters = this.getTotalFilters();
    this.stats.lastActivity = Date.now();
  }

  /**
   * 获取匹配的客户端
   */
  getMatchingClients(message: any): string[] {
    this.stats.matchOperations++;
    const matchedClients: string[] = [];
    
    for (const [clientId, filters] of this.subscriptions) {
      for (const filter of filters) {
        if (this.isMessageMatching(message, filter)) {
          matchedClients.push(clientId);
          break; // 一个客户端只需要匹配一次
        }
      }
    }
    
    return matchedClients;
  }

  /**
   * 获取订阅统计信息
   */
  getSubscriptionStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * 清理客户端订阅
   */
  clearClientSubscriptions(clientId: string): void {
    this.removeSubscription(clientId);
  }

  /**
   * 检查消息是否匹配过滤器
   */
  private isMessageMatching(message: any, filter: SubscriptionFilter): boolean {
    // 检查交易所
    if (filter.exchange && filter.exchange.length > 0) {
      if (!message.exchange || !filter.exchange.includes(message.exchange)) {
        return false;
      }
    }
    
    // 检查符号
    if (filter.symbols && filter.symbols.length > 0) {
      if (!message.symbol || !filter.symbols.includes(message.symbol)) {
        return false;
      }
    }
    
    // 检查数据类型
    if (filter.dataTypes && filter.dataTypes.length > 0) {
      if (!message.type || !filter.dataTypes.includes(message.type)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 获取总过滤器数量
   */
  private getTotalFilters(): number {
    let total = 0;
    for (const filters of this.subscriptions.values()) {
      total += filters.length;
    }
    return total;
  }
}

/**
 * WebSocket代理服务器
 * 专注于连接管理和消息转发，不处理业务逻辑
 */
export class WebSocketProxy extends EventEmitter {
  private wss: WebSocketServer;
  private connections: Map<string, ClientConnection> = new Map();
  private subscriptionManager: SubscriptionManager;
  private connectionPool: ConnectionPoolManager;
  private monitor: BaseMonitor;
  private connectionCounter = 0;
  private isRunning = false;

  // 配置参数
  private readonly HEARTBEAT_INTERVAL = 30000; // 30秒心跳
  private readonly CONNECTION_TIMEOUT = 60000; // 60秒超时
  private readonly MAX_CONNECTIONS = 1000; // 最大连接数

  // 监控数据
  private stats: ConnectionStats;
  private heartbeatInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  constructor(
    server: Server,
    monitor: BaseMonitor,
    options: {
      heartbeatInterval?: number;
      connectionTimeout?: number;
      maxConnections?: number;
      poolConfig?: Partial<PoolConfig>;
    } = {}
  ) {
    super();
    
    this.monitor = monitor;
    this.subscriptionManager = new SubscriptionManager();
    
    // 应用配置选项
    if (options.heartbeatInterval) this.HEARTBEAT_INTERVAL = options.heartbeatInterval;
    if (options.connectionTimeout) this.CONNECTION_TIMEOUT = options.connectionTimeout;
    if (options.maxConnections) this.MAX_CONNECTIONS = options.maxConnections;

    // 创建连接池管理器
    const poolConfig: Partial<PoolConfig> = {
      maxConnections: this.MAX_CONNECTIONS,
      connectionTimeout: this.CONNECTION_TIMEOUT,
      enableBatching: true,
      batchSize: 10,
      flushInterval: 1000,
      ...options.poolConfig
    };
    this.connectionPool = new ConnectionPoolManager(monitor, poolConfig);

    // 初始化统计信息
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalSubscriptions: 0,
      averageConnectionDuration: 0,
      messagesForwarded: 0,
      errorsEncountered: 0,
      lastActivity: Date.now()
    };

    // 创建WebSocket服务器
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      clientTracking: false,
      maxPayload: 1024 * 1024 // 1MB最大负载
    });

    this.setupEventHandlers();
    this.setupSubscriptionManagerEvents();
    this.setupConnectionPoolEvents();
    
    this.monitor.log('info', 'WebSocket proxy initialized', {
      path: '/ws',
      maxConnections: this.MAX_CONNECTIONS,
      heartbeatInterval: this.HEARTBEAT_INTERVAL,
      poolConfig
    });
  }

  /**
   * 启动代理服务器
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startHeartbeat();
    this.startMetricsCollection();
    
    this.monitor.log('info', 'WebSocket proxy started');
    this.emit('started');
  }

  /**
   * 停止代理服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // 停止定时任务
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    // 关闭连接池
    await this.connectionPool.shutdown();
    
    this.connections.clear();

    // 关闭WebSocket服务器
    return new Promise<void>((resolve) => {
      this.wss.close(() => {
        this.monitor.log('info', 'WebSocket proxy stopped');
        this.emit('stopped');
        resolve();
      });
    });
  }

  /**
   * 处理新WebSocket连接
   */
  handleConnection(socket: WebSocket): string {
    const connectionId = this.generateConnectionId();
    
    // 使用连接池添加连接
    const added = this.connectionPool.addConnection(connectionId, socket, {
      userAgent: socket.protocol,
      connectedAt: Date.now()
    });

    if (!added) {
      socket.close(1013, 'Server at capacity');
      this.stats.errorsEncountered++;
      return '';
    }

    const connection: ClientConnection = {
      id: connectionId,
      socket,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      subscriptions: [],
      metadata: {}
    };

    this.connections.set(connectionId, connection);
    this.stats.totalConnections++;
    this.stats.activeConnections = this.connections.size;
    this.stats.lastActivity = Date.now();

    this.monitor.log('info', 'Client connected to proxy', {
      connectionId,
      totalConnections: this.connections.size
    });

    // 发送欢迎消息
    this.connectionPool.sendMessage(connectionId, {
      type: 'welcome',
      payload: {
        connectionId,
        serverTime: Date.now(),
        proxyVersion: '1.0.0'
      }
    });

    this.emit('connectionEstablished', connectionId);
    return connectionId;
  }

  /**
   * 处理连接断开
   */
  handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    const duration = Date.now() - connection.connectedAt;
    
    // 清理订阅
    this.subscriptionManager.clearClientSubscriptions(connectionId);
    
    // 从连接池中移除
    this.connectionPool.removeConnection(connectionId);
    
    this.connections.delete(connectionId);
    this.stats.activeConnections = this.connections.size;
    
    // 更新平均连接时长
    this.updateAverageConnectionDuration();

    this.monitor.log('info', 'Client disconnected from proxy', {
      connectionId,
      duration,
      totalConnections: this.connections.size
    });

    this.emit('connectionClosed', connectionId, duration);
  }

  /**
   * 订阅管理
   */
  subscribe(connectionId: string, filter: Omit<SubscriptionFilter, 'clientId'>): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    const subscriptionFilter: SubscriptionFilter = {
      ...filter,
      clientId: connectionId,
      filterId: this.generateFilterId()
    };

    connection.subscriptions.push(subscriptionFilter);
    this.subscriptionManager.addSubscription(subscriptionFilter);
    
    this.stats.totalSubscriptions++;
    this.stats.lastActivity = Date.now();

    this.connectionPool.sendMessage(connectionId, {
      type: 'subscribed',
      payload: {
        filterId: subscriptionFilter.filterId,
        filter: {
          exchange: filter.exchange,
          symbols: filter.symbols,
          dataTypes: filter.dataTypes
        }
      }
    });

    this.monitor.log('debug', 'Client subscription added', {
      connectionId,
      filter: subscriptionFilter
    });
  }

  /**
   * 取消订阅
   */
  unsubscribe(connectionId: string, filterId?: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    if (filterId) {
      // 移除特定订阅
      const index = connection.subscriptions.findIndex(s => s.filterId === filterId);
      if (index !== -1) {
        connection.subscriptions.splice(index, 1);
        this.subscriptionManager.removeSubscription(connectionId, filterId);
        this.stats.totalSubscriptions--;
      }
    } else {
      // 移除所有订阅
      const removedCount = connection.subscriptions.length;
      connection.subscriptions = [];
      this.subscriptionManager.removeSubscription(connectionId);
      this.stats.totalSubscriptions -= removedCount;
    }

    this.connectionPool.sendMessage(connectionId, {
      type: 'unsubscribed',
      payload: { filterId }
    });

    this.monitor.log('debug', 'Client subscription removed', {
      connectionId,
      filterId
    });
  }

  /**
   * 转发消息
   * 从DataFlow接收消息并转发给匹配的客户端
   */
  forwardMessage(message: any, targetClients?: string[]): number {
    if (!this.isRunning || !message) {
      return 0;
    }

    const startTime = Date.now();
    let sentCount = 0;

    try {
      const proxyMessage: ProxyMessage = {
        type: message.type || 'data',
        payload: message,
        timestamp: Date.now()
      };

      // 确定目标客户端
      const clientsToSend = targetClients || this.subscriptionManager.getMatchingClients(message);

      // 使用连接池批量发送消息
      sentCount = await this.connectionPool.broadcastMessage(proxyMessage, clientsToSend);

      // 更新统计信息
      this.stats.messagesForwarded += sentCount;
      this.stats.lastActivity = Date.now();
      
      const latency = Date.now() - startTime;
      this.updateLatencyStats(latency);

      if (sentCount > 0) {
        this.monitor.log('debug', 'Message forwarded', {
          messageType: message.type,
          sentCount,
          totalClients: clientsToSend.length,
          latency
        });
      }

      this.emit('messageForwarded', message, sentCount);
      return sentCount;

    } catch (error) {
      this.stats.errorsEncountered++;
      this.monitor.log('error', 'Message forwarding error', {
        error: error.message,
        messageType: message.type
      });
      return 0;
    }
  }

  /**
   * 获取连接统计信息
   */
  getConnectionStats(): ConnectionStats {
    const poolStats = this.connectionPool.getStats();
    return { 
      ...this.stats,
      activeConnections: poolStats.activeConnections,
      totalConnections: poolStats.totalConnections,
      messagesForwarded: poolStats.totalMessagesSent,
      averageConnectionDuration: this.stats.averageConnectionDuration
    };
  }

  /**
   * 健康检查
   */
  healthCheck(): HealthStatus {
    const poolStats = this.connectionPool.getStats();
    const uptime = Date.now() - (this.stats.lastActivity - this.stats.totalConnections * 1000);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (this.stats.errorsEncountered > 100 || poolStats.averageLatency > 50) {
      status = 'degraded';
    }
    if (this.stats.errorsEncountered > 1000 || poolStats.averageLatency > 100 || !this.isRunning) {
      status = 'unhealthy';
    }

    return {
      status,
      connections: poolStats.activeConnections,
      uptime,
      performance: {
        avgLatency: poolStats.averageLatency,
        memoryUsage: poolStats.memoryUsage
      }
    };
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', (ws, req) => {
      const connectionId = this.handleConnection(ws);
      if (!connectionId) return;

      const clientIP = req.socket.remoteAddress;
      
      // 设置消息处理
      ws.on('message', (data) => {
        this.handleClientMessage(connectionId, data);
      });

      // 设置关闭处理
      ws.on('close', (code, reason) => {
        this.handleDisconnection(connectionId);
      });

      // 设置错误处理
      ws.on('error', (error) => {
        this.monitor.log('error', 'WebSocket connection error', {
          connectionId,
          clientIP,
          error: error.message
        });
        this.stats.errorsEncountered++;
        this.handleDisconnection(connectionId);
      });

      // 设置 pong 处理（心跳响应）
      ws.on('pong', () => {
        this.updateLastActivity(connectionId);
      });
    });

    this.wss.on('error', (error) => {
      this.monitor.log('error', 'WebSocket server error', { error: error.message });
      this.stats.errorsEncountered++;
    });
  }

  /**
   * 设置订阅管理器事件
   */
  private setupSubscriptionManagerEvents(): void {
    this.subscriptionManager.on('subscriptionAdded', (filter) => {
      this.emit('subscriptionAdded', filter);
    });

    this.subscriptionManager.on('subscriptionRemoved', (filter) => {
      this.emit('subscriptionRemoved', filter);
    });
  }

  /**
   * 设置连接池事件处理器
   */
  private setupConnectionPoolEvents(): void {
    this.connectionPool.on('connectionAdded', (connectionId) => {
      this.monitor.log('debug', 'Connection added to pool', { connectionId });
    });

    this.connectionPool.on('connectionRemoved', (connectionId) => {
      this.monitor.log('debug', 'Connection removed from pool', { connectionId });
    });

    this.connectionPool.on('metricsUpdated', (poolStats) => {
      this.emit('metricsUpdated', {
        proxy: this.getConnectionStats(),
        pool: poolStats,
        subscriptions: this.subscriptionManager.getSubscriptionStats(),
        health: this.healthCheck()
      });
    });

    this.connectionPool.on('shutdown', () => {
      this.monitor.log('info', 'Connection pool shutdown completed');
    });
  }

  /**
   * 处理客户端消息
   */
  private handleClientMessage(connectionId: string, data: RawData): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      this.updateLastActivity(connectionId);
      
      // 使用统一数据处理器进行安全的JSON解析
      const parseResult = parseJSON(data.toString(), this.monitor);
      if (!parseResult.success) {
        this.monitor.log('error', 'Failed to parse client message', {
          connectionId,
          error: parseResult.error
        });
        return;
      }
      
      const message = parseResult.data as ProxyMessage;
      
      switch (message.type) {
        case 'ping':
          this.sendToConnection(connectionId, { type: 'pong' });
          break;
          
        case 'subscribe':
          if (message.payload) {
            this.subscribe(connectionId, message.payload);
          }
          break;
          
        case 'unsubscribe':
          this.unsubscribe(connectionId, message.payload?.filterId);
          break;
          
        case 'getStats':
          this.connectionPool.sendMessage(connectionId, {
            type: 'stats',
            payload: {
              connection: this.getConnectionStats(),
              subscription: this.subscriptionManager.getSubscriptionStats(),
              health: this.healthCheck(),
              pool: this.connectionPool.getStats()
            }
          });
          break;
          
        default:
          this.monitor.log('warn', 'Unknown message type from client', {
            connectionId,
            messageType: message.type
          });
      }
    } catch (error) {
      this.monitor.log('error', 'Error handling client message', {
        connectionId,
        error: error.message
      });
      
      this.connectionPool.sendMessage(connectionId, {
        type: 'error',
        payload: { message: 'Invalid message format' }
      });
    }
  }

  /**
   * 向指定连接发送消息 (已废弃，使用连接池代替)
   * @deprecated 使用 connectionPool.sendMessage 代替
   */
  private sendToConnection(connectionId: string, message: ProxyMessage): boolean {
    this.connectionPool.sendMessage(connectionId, message);
    return true;
  }

  /**
   * 启动心跳检查 (已简化，主要功能由连接池处理)
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      // 连接池已经处理了心跳检查，这里只需要同步连接状态
      this.syncConnectionsWithPool();
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * 同步连接状态与连接池
   */
  private syncConnectionsWithPool(): void {
    const activePoolConnections = this.connectionPool.getActiveConnections();
    const proxyConnectionIds = Array.from(this.connections.keys());
    
    // 移除连接池中不存在的连接
    for (const connectionId of proxyConnectionIds) {
      if (!activePoolConnections.includes(connectionId)) {
        this.connections.delete(connectionId);
        this.subscriptionManager.clearClientSubscriptions(connectionId);
      }
    }
    
    this.stats.activeConnections = activePoolConnections.length;
  }

  /**
   * 启动指标收集
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.emit('metricsUpdated', {
        stats: this.getConnectionStats(),
        subscriptions: this.subscriptionManager.getSubscriptionStats(),
        health: this.healthCheck()
      });
    }, 60000); // 每分钟更新一次指标
  }

  /**
   * 更新最后活动时间
   */
  private updateLastActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = Date.now();
    }
  }

  /**
   * 更新平均连接时长
   */
  private updateAverageConnectionDuration(): void {
    if (this.stats.totalConnections === 0) {
      this.stats.averageConnectionDuration = 0;
      return;
    }

    const totalDuration = Array.from(this.connections.values())
      .reduce((sum, conn) => sum + (Date.now() - conn.connectedAt), 0);
    
    this.stats.averageConnectionDuration = totalDuration / this.connections.size || 0;
  }

  /**
   * 更新延迟统计
   */
  private updateLatencyStats(latency: number): void {
    this.latencyStats.push(latency);
    if (this.latencyStats.length > 100) {
      this.latencyStats.shift();
    }
  }

  /**
   * 生成连接ID
   */
  private generateConnectionId(): string {
    return `proxy_${Date.now()}_${++this.connectionCounter}`;
  }

  /**
   * 生成过滤器ID
   */
  private generateFilterId(): string {
    return `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 声明事件类型以支持TypeScript
declare interface WebSocketProxy {
  on(event: 'started', listener: () => void): this;
  on(event: 'stopped', listener: () => void): this;
  on(event: 'connectionEstablished', listener: (connectionId: string) => void): this;
  on(event: 'connectionClosed', listener: (connectionId: string, duration: number) => void): this;
  on(event: 'messageForwarded', listener: (message: any, sentCount: number) => void): this;
  on(event: 'subscriptionAdded', listener: (filter: SubscriptionFilter) => void): this;
  on(event: 'subscriptionRemoved', listener: (filter: SubscriptionFilter) => void): this;
  on(event: 'metricsUpdated', listener: (metrics: any) => void): this;
  emit(event: string, ...args: any[]): boolean;
}