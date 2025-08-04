import { WebSocket } from 'ws';
import { BaseMonitor } from '@pixiu/shared-core';

export interface PooledConnection {
  id: string;
  socket: WebSocket;
  lastActivity: number;
  metadata: Record<string, any>;
}

export interface ConnectionPoolConfig {
  maxConnections: number;
  idleTimeout: number;
  cleanupInterval: number;
  enableMetrics: boolean;
}

export interface ConnectionPoolStats {
  total: number;
  active: number;
  idle: number;
  errors: number;
  lastCleanup: number;
}

/**
 * WebSocket 连接池管理器
 * 负责管理和监控 WebSocket 连接的生命周期
 */
export class WebSocketConnectionPool {
  private connections = new Map<string, PooledConnection>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stats: ConnectionPoolStats = {
    total: 0,
    active: 0,
    idle: 0,
    errors: 0,
    lastCleanup: Date.now()
  };

  constructor(
    private config: ConnectionPoolConfig,
    private monitor: BaseMonitor
  ) {
    this.startCleanupProcess();
    
    this.monitor.log('info', 'WebSocket connection pool initialized', {
      maxConnections: config.maxConnections,
      idleTimeout: config.idleTimeout
    });
  }

  /**
   * 添加连接到连接池
   */
  addConnection(id: string, socket: WebSocket, metadata: Record<string, any> = {}): boolean {
    try {
      // 检查是否超过最大连接数
      if (this.connections.size >= this.config.maxConnections) {
        this.monitor.log('warn', 'Connection pool at capacity', {
          current: this.connections.size,
          max: this.config.maxConnections
        });
        return false;
      }

      // 检查连接是否已存在
      if (this.connections.has(id)) {
        this.monitor.log('warn', 'Connection already exists in pool', { id });
        return false;
      }

      const pooledConnection: PooledConnection = {
        id,
        socket,
        lastActivity: Date.now(),
        metadata: { ...metadata }
      };

      this.connections.set(id, pooledConnection);
      this.updateStats();

      // 设置连接事件监听
      this.setupConnectionEvents(pooledConnection);

      if (this.config.enableMetrics) {
        this.monitor.log('debug', 'Connection added to pool', {
          id,
          totalConnections: this.connections.size,
          metadata
        });
      }

      return true;
    } catch (error) {
      this.monitor.log('error', 'Error adding connection to pool', { id, error });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * 从连接池中移除连接
   */
  removeConnection(id: string): boolean {
    try {
      const connection = this.connections.get(id);
      if (!connection) {
        return false;
      }

      // 关闭 WebSocket 连接
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.close(1000, 'Connection removed from pool');
      }

      this.connections.delete(id);
      this.updateStats();

      if (this.config.enableMetrics) {
        this.monitor.log('debug', 'Connection removed from pool', {
          id,
          totalConnections: this.connections.size
        });
      }

      return true;
    } catch (error) {
      this.monitor.log('error', 'Error removing connection from pool', { id, error });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * 获取连接
   */
  getConnection(id: string): PooledConnection | undefined {
    const connection = this.connections.get(id);
    if (connection) {
      connection.lastActivity = Date.now();
    }
    return connection;
  }

  /**
   * 获取所有活跃连接
   */
  getActiveConnections(): PooledConnection[] {
    return Array.from(this.connections.values()).filter(
      conn => conn.socket.readyState === WebSocket.OPEN
    );
  }

  /**
   * 广播消息到所有活跃连接
   */
  broadcast(message: string | Buffer, filter?: (connection: PooledConnection) => boolean): number {
    let sentCount = 0;
    const deadConnections: string[] = [];

    for (const [id, connection] of this.connections) {
      try {
        // 应用过滤器
        if (filter && !filter(connection)) {
          continue;
        }

        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.send(message);
          connection.lastActivity = Date.now();
          sentCount++;
        } else {
          deadConnections.push(id);
        }
      } catch (error) {
        this.monitor.log('error', 'Error broadcasting to connection', { id, error });
        deadConnections.push(id);
        this.stats.errors++;
      }
    }

    // 清理死连接
    for (const id of deadConnections) {
      this.removeConnection(id);
    }

    if (this.config.enableMetrics && sentCount > 0) {
      this.monitor.log('debug', 'Broadcast completed', {
        sentCount,
        totalConnections: this.connections.size,
        cleanedConnections: deadConnections.length
      });
    }

    return sentCount;
  }

  /**
   * 向特定连接发送消息
   */
  sendToConnection(id: string, message: string | Buffer): boolean {
    try {
      const connection = this.connections.get(id);
      if (!connection) {
        return false;
      }

      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(message);
        connection.lastActivity = Date.now();
        return true;
      } else {
        // 连接已死，清理它
        this.removeConnection(id);
        return false;
      }
    } catch (error) {
      this.monitor.log('error', 'Error sending message to connection', { id, error });
      this.stats.errors++;
      this.removeConnection(id);
      return false;
    }
  }

  /**
   * 根据元数据查找连接
   */
  findConnections(predicate: (connection: PooledConnection) => boolean): PooledConnection[] {
    return Array.from(this.connections.values()).filter(predicate);
  }

  /**
   * 更新连接元数据
   */
  updateConnectionMetadata(id: string, metadata: Record<string, any>): boolean {
    const connection = this.connections.get(id);
    if (connection) {
      Object.assign(connection.metadata, metadata);
      connection.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  /**
   * 获取连接池统计信息
   */
  getStats(): ConnectionPoolStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * 设置连接事件监听
   */
  private setupConnectionEvents(connection: PooledConnection): void {
    const { socket } = connection;

    socket.on('close', () => {
      this.removeConnection(connection.id);
    });

    socket.on('error', (error) => {
      this.monitor.log('error', 'WebSocket connection error in pool', { 
        id: connection.id, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.stats.errors++;
      this.removeConnection(connection.id);
    });

    socket.on('message', () => {
      connection.lastActivity = Date.now();
    });

    socket.on('pong', () => {
      connection.lastActivity = Date.now();
    });
  }

  /**
   * 启动清理进程
   */
  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.config.cleanupInterval);
  }

  /**
   * 清理空闲连接
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    const idleConnections: string[] = [];

    for (const [id, connection] of this.connections) {
      const idleTime = now - connection.lastActivity;
      
      if (idleTime > this.config.idleTimeout) {
        idleConnections.push(id);
      } else if (connection.socket.readyState !== WebSocket.OPEN) {
        idleConnections.push(id);
      }
    }

    for (const id of idleConnections) {
      this.removeConnection(id);
    }

    this.stats.lastCleanup = now;

    if (this.config.enableMetrics && idleConnections.length > 0) {
      this.monitor.log('debug', 'Cleanup completed', {
        cleanedConnections: idleConnections.length,
        totalConnections: this.connections.size
      });
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    const connections = Array.from(this.connections.values());
    
    this.stats.total = connections.length;
    this.stats.active = connections.filter(
      conn => conn.socket.readyState === WebSocket.OPEN
    ).length;
    this.stats.idle = this.stats.total - this.stats.active;
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const closePromises: Promise<void>[] = [];

    for (const [, connection] of this.connections) {
      closePromises.push(
        new Promise<void>((resolve) => {
          if (connection.socket.readyState === WebSocket.OPEN) {
            connection.socket.close(1001, 'Pool shutting down');
            connection.socket.once('close', () => resolve());
          } else {
            resolve();
          }
        })
      );
    }

    await Promise.all(closePromises);
    this.connections.clear();
    this.updateStats();

    this.monitor.log('info', 'WebSocket connection pool closed');
  }

  /**
   * 获取连接池容量信息
   */
  getCapacityInfo(): { used: number; total: number; available: number; utilization: number } {
    const used = this.connections.size;
    const total = this.config.maxConnections;
    const available = total - used;
    const utilization = total > 0 ? (used / total) * 100 : 0;

    return { used, total, available, utilization };
  }

  /**
   * 执行健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = this.getStats();
      const capacity = this.getCapacityInfo();
      
      const healthy = 
        capacity.utilization < 90 && // 使用率不超过90%
        stats.errors < 10 && // 错误数不超过10
        stats.active >= 0; // 至少有0个活跃连接（基本检查）

      return {
        healthy,
        details: {
          stats,
          capacity,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.monitor.log('error', 'Error during connection pool health check', { error: message });
      return {
        healthy: false,
        details: { error: message }
      };
    }
  }
}