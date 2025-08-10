/**
 * 连接池管理器
 * 提供高效的WebSocket连接管理、消息缓冲和性能优化
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { BaseMonitor } from '@pixiu/shared-core';

export interface PooledConnection {
  id: string;
  socket: WebSocket;
  connectedAt: number;
  lastActivity: number;
  messagesSent: number;
  bytesSent: number;
  errors: number;
  state: 'connecting' | 'open' | 'closing' | 'closed' | 'error';
  metadata: Record<string, any>;
}

export interface MessageBuffer {
  messages: any[];
  totalSize: number;
  lastFlushed: number;
  flushTimer?: NodeJS.Timeout;
}

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  errorConnections: number;
  totalMessagesSent: number;
  totalBytesSent: number;
  averageLatency: number;
  memoryUsage: number;
  bufferUtilization: number;
  connectionTurnover: number;
}

export interface PoolConfig {
  maxConnections: number;
  connectionTimeout: number;
  maxMessageBufferSize: number;
  maxBytesPerBuffer: number;
  flushInterval: number;
  enableBatching: boolean;
  batchSize: number;
  compressionEnabled: boolean;
  memoryThreshold: number; // MB
}

/**
 * 连接池管理器
 * 提供高性能、低内存的WebSocket连接管理
 */
export class ConnectionPoolManager extends EventEmitter {
  private connections: Map<string, PooledConnection> = new Map();
  private messageBuffers: Map<string, MessageBuffer> = new Map();
  private monitor: BaseMonitor;
  private config: PoolConfig;
  private isShuttingDown = false;

  // 性能监控
  private stats: PoolStats;
  private latencyStats: number[] = [];
  private cleanupInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  
  // 内存管理
  private memoryPressureActive = false;
  private gcInterval?: NodeJS.Timeout;

  constructor(monitor: BaseMonitor, config: Partial<PoolConfig> = {}) {
    super();
    this.monitor = monitor;
    
    // 默认配置
    this.config = {
      maxConnections: 1000,
      connectionTimeout: 60000, // 60秒
      maxMessageBufferSize: 100,
      maxBytesPerBuffer: 1024 * 1024, // 1MB
      flushInterval: 1000, // 1秒
      enableBatching: true,
      batchSize: 10,
      compressionEnabled: false,
      memoryThreshold: 512, // 512MB
      ...config
    };

    this.stats = this.createInitialStats();
    this.startMaintenanceTasks();
    
    this.monitor.log('info', 'Connection pool manager initialized', {
      config: this.config
    });
  }

  /**
   * 添加连接到池中
   */
  addConnection(connectionId: string, socket: WebSocket, metadata: Record<string, any> = {}): boolean {
    if (this.isShuttingDown) {
      return false;
    }

    if (this.connections.size >= this.config.maxConnections) {
      this.monitor.log('warn', 'Connection pool at capacity', {
        currentSize: this.connections.size,
        maxConnections: this.config.maxConnections
      });
      return false;
    }

    const connection: PooledConnection = {
      id: connectionId,
      socket,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      messagesSent: 0,
      bytesSent: 0,
      errors: 0,
      state: socket.readyState === WebSocket.OPEN ? 'open' : 'connecting',
      metadata: { ...metadata }
    };

    this.connections.set(connectionId, connection);
    this.stats.totalConnections++;
    
    // 设置连接事件监听
    this.setupConnectionHandlers(connection);
    
    // 如果启用批处理，初始化消息缓冲区
    if (this.config.enableBatching) {
      this.messageBuffers.set(connectionId, {
        messages: [],
        totalSize: 0,
        lastFlushed: Date.now()
      });
    }

    this.emit('connectionAdded', connectionId);
    this.updateStats();
    
    return true;
  }

  /**
   * 从池中移除连接
   */
  removeConnection(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    try {
      // 清理消息缓冲
      const buffer = this.messageBuffers.get(connectionId);
      if (buffer) {
        if (buffer.flushTimer) {
          clearTimeout(buffer.flushTimer);
        }
        // 立即刷新剩余消息
        if (buffer.messages.length > 0) {
          this.flushBufferSync(connectionId, buffer);
        }
        this.messageBuffers.delete(connectionId);
      }

      // 关闭连接
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.close(1000, 'Connection removed from pool');
      }

      this.connections.delete(connectionId);
      this.emit('connectionRemoved', connectionId);
      this.updateStats();
      
      return true;
    } catch (error) {
      this.monitor.log('error', 'Error removing connection from pool', {
        connectionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 发送消息到指定连接
   */
  async sendMessage(connectionId: string, message: any): Promise<boolean> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.state !== 'open') {
      return false;
    }

    const startTime = Date.now();

    try {
      if (this.config.enableBatching) {
        return await this.sendMessageBuffered(connectionId, message);
      } else {
        return await this.sendMessageDirect(connection, message, startTime);
      }
    } catch (error) {
      connection.errors++;
      this.stats.totalMessagesSent++; // 计入失败统计
      this.monitor.log('error', 'Failed to send message', {
        connectionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 批量发送消息到多个连接
   */
  async broadcastMessage(message: any, targetConnections?: string[]): Promise<number> {
    const targets = targetConnections || Array.from(this.connections.keys());
    const activeTargets = targets.filter(id => {
      const conn = this.connections.get(id);
      return conn && conn.state === 'open';
    });

    if (activeTargets.length === 0) {
      return 0;
    }

    const startTime = Date.now();
    let successCount = 0;

    // 并发发送消息
    const sendPromises = activeTargets.map(async (connectionId) => {
      try {
        const sent = await this.sendMessage(connectionId, message);
        if (sent) successCount++;
        return sent;
      } catch (error) {
        this.monitor.log('debug', 'Broadcast to connection failed', {
          connectionId,
          error: error.message
        });
        return false;
      }
    });

    await Promise.allSettled(sendPromises);

    // 更新性能统计
    const latency = Date.now() - startTime;
    this.updateLatencyStats(latency);

    this.monitor.log('debug', 'Message broadcast completed', {
      targetCount: activeTargets.length,
      successCount,
      latency
    });

    return successCount;
  }

  /**
   * 获取连接池统计信息
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * 获取连接信息
   */
  getConnection(connectionId: string): PooledConnection | undefined {
    const conn = this.connections.get(connectionId);
    return conn ? { ...conn } : undefined;
  }

  /**
   * 获取所有活跃连接ID
   */
  getActiveConnections(): string[] {
    const activeConnections: string[] = [];
    for (const [id, conn] of this.connections) {
      if (conn.state === 'open') {
        activeConnections.push(id);
      }
    }
    return activeConnections;
  }

  /**
   * 强制刷新所有消息缓冲区
   */
  async flushAllBuffers(): Promise<void> {
    const flushPromises: Promise<void>[] = [];
    
    for (const [connectionId, buffer] of this.messageBuffers) {
      if (buffer.messages.length > 0) {
        flushPromises.push(this.flushBuffer(connectionId, buffer));
      }
    }

    await Promise.allSettled(flushPromises);
  }

  /**
   * 关闭连接池
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    
    this.monitor.log('info', 'Shutting down connection pool', {
      activeConnections: this.stats.activeConnections
    });

    // 停止维护任务
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    if (this.gcInterval) clearInterval(this.gcInterval);

    // 刷新所有缓冲区
    await this.flushAllBuffers();

    // 关闭所有连接
    const closePromises: Promise<void>[] = [];
    for (const [connectionId, connection] of this.connections) {
      closePromises.push(
        new Promise<void>((resolve) => {
          if (connection.socket.readyState === WebSocket.OPEN) {
            connection.socket.once('close', () => resolve());
            connection.socket.close(1001, 'Server shutdown');
            // 设置超时避免无限等待
            setTimeout(() => resolve(), 5000);
          } else {
            resolve();
          }
        })
      );
    }

    await Promise.allSettled(closePromises);
    
    this.connections.clear();
    this.messageBuffers.clear();
    
    this.monitor.log('info', 'Connection pool shutdown completed');
    this.emit('shutdown');
  }

  /**
   * 设置连接处理器
   */
  private setupConnectionHandlers(connection: PooledConnection): void {
    const { socket, id: connectionId } = connection;

    socket.on('open', () => {
      connection.state = 'open';
      this.updateStats();
    });

    socket.on('close', (code, reason) => {
      connection.state = 'closed';
      this.removeConnection(connectionId);
    });

    socket.on('error', (error) => {
      connection.state = 'error';
      connection.errors++;
      this.monitor.log('error', 'Connection error in pool', {
        connectionId,
        error: error.message
      });
    });

    socket.on('pong', () => {
      connection.lastActivity = Date.now();
    });
  }

  /**
   * 直接发送消息
   */
  private async sendMessageDirect(connection: PooledConnection, message: any, startTime: number): Promise<boolean> {
    return new Promise((resolve) => {
      const messageStr = JSON.stringify(message);
      const messageSize = Buffer.byteLength(messageStr, 'utf8');

      connection.socket.send(messageStr, (error) => {
        const latency = Date.now() - startTime;
        
        if (error) {
          connection.errors++;
          this.updateLatencyStats(latency);
          resolve(false);
        } else {
          connection.messagesSent++;
          connection.bytesSent += messageSize;
          connection.lastActivity = Date.now();
          this.stats.totalMessagesSent++;
          this.stats.totalBytesSent += messageSize;
          this.updateLatencyStats(latency);
          resolve(true);
        }
      });
    });
  }

  /**
   * 缓冲发送消息
   */
  private async sendMessageBuffered(connectionId: string, message: any): Promise<boolean> {
    const buffer = this.messageBuffers.get(connectionId);
    if (!buffer) {
      return false;
    }

    const messageStr = JSON.stringify(message);
    const messageSize = Buffer.byteLength(messageStr, 'utf8');

    // 检查缓冲区限制
    if (buffer.messages.length >= this.config.maxMessageBufferSize ||
        buffer.totalSize + messageSize > this.config.maxBytesPerBuffer) {
      // 先刷新缓冲区
      await this.flushBuffer(connectionId, buffer);
    }

    // 添加消息到缓冲区
    buffer.messages.push(message);
    buffer.totalSize += messageSize;

    // 如果达到批处理大小，立即刷新
    if (buffer.messages.length >= this.config.batchSize) {
      await this.flushBuffer(connectionId, buffer);
    } else if (!buffer.flushTimer) {
      // 设置定时刷新
      buffer.flushTimer = setTimeout(() => {
        this.flushBuffer(connectionId, buffer).catch(error => {
          this.monitor.log('error', 'Buffered flush error', {
            connectionId,
            error: error.message
          });
        });
      }, this.config.flushInterval);
    }

    return true;
  }

  /**
   * 刷新消息缓冲区
   */
  private async flushBuffer(connectionId: string, buffer: MessageBuffer): Promise<void> {
    if (buffer.messages.length === 0) {
      return;
    }

    const connection = this.connections.get(connectionId);
    if (!connection || connection.state !== 'open') {
      buffer.messages = [];
      buffer.totalSize = 0;
      return;
    }

    if (buffer.flushTimer) {
      clearTimeout(buffer.flushTimer);
      buffer.flushTimer = undefined;
    }

    const messagesToSend = buffer.messages.splice(0);
    const bytesToSend = buffer.totalSize;
    buffer.totalSize = 0;
    buffer.lastFlushed = Date.now();

    const startTime = Date.now();

    try {
      // 如果只有一条消息，直接发送
      if (messagesToSend.length === 1) {
        const messageStr = JSON.stringify(messagesToSend[0]);
        await this.sendWebSocketMessage(connection.socket, messageStr);
        
        connection.messagesSent++;
        connection.bytesSent += bytesToSend;
        this.stats.totalMessagesSent++;
        this.stats.totalBytesSent += bytesToSend;
      } else {
        // 批量发送
        const batchMessage = {
          type: 'batch',
          messages: messagesToSend,
          count: messagesToSend.length,
          timestamp: Date.now()
        };
        
        const messageStr = JSON.stringify(batchMessage);
        await this.sendWebSocketMessage(connection.socket, messageStr);
        
        connection.messagesSent += messagesToSend.length;
        connection.bytesSent += bytesToSend;
        this.stats.totalMessagesSent += messagesToSend.length;
        this.stats.totalBytesSent += bytesToSend;
      }

      connection.lastActivity = Date.now();
      const latency = Date.now() - startTime;
      this.updateLatencyStats(latency);

    } catch (error) {
      connection.errors++;
      this.monitor.log('error', 'Buffer flush error', {
        connectionId,
        messageCount: messagesToSend.length,
        error: error.message
      });
    }
  }

  /**
   * 同步刷新缓冲区（用于关闭时）
   */
  private flushBufferSync(connectionId: string, buffer: MessageBuffer): void {
    if (buffer.messages.length === 0) {
      return;
    }

    const connection = this.connections.get(connectionId);
    if (!connection || connection.state !== 'open') {
      return;
    }

    try {
      const batchMessage = {
        type: 'batch_final',
        messages: buffer.messages,
        count: buffer.messages.length,
        timestamp: Date.now()
      };

      const messageStr = JSON.stringify(batchMessage);
      connection.socket.send(messageStr);

      connection.messagesSent += buffer.messages.length;
      connection.bytesSent += buffer.totalSize;
      this.stats.totalMessagesSent += buffer.messages.length;
      this.stats.totalBytesSent += buffer.totalSize;

    } catch (error) {
      this.monitor.log('error', 'Sync buffer flush error', {
        connectionId,
        error: error.message
      });
    }
  }

  /**
   * 发送WebSocket消息的Promise包装
   */
  private sendWebSocketMessage(socket: WebSocket, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.send(message, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 启动维护任务
   */
  private startMaintenanceTasks(): void {
    // 连接清理任务
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadConnections();
    }, 30000); // 30秒

    // 指标更新任务
    this.metricsInterval = setInterval(() => {
      this.updateStats();
      this.emit('metricsUpdated', this.getStats());
    }, 60000); // 60秒

    // 内存管理任务
    this.gcInterval = setInterval(() => {
      this.checkMemoryPressure();
    }, 10000); // 10秒
  }

  /**
   * 清理死连接
   */
  private cleanupDeadConnections(): void {
    const now = Date.now();
    const deadConnections: string[] = [];

    for (const [connectionId, connection] of this.connections) {
      // 检查连接状态
      if (connection.state === 'closed' || connection.state === 'error') {
        deadConnections.push(connectionId);
        continue;
      }

      // 检查超时
      if (now - connection.lastActivity > this.config.connectionTimeout) {
        deadConnections.push(connectionId);
        continue;
      }

      // 发送心跳检测
      if (connection.state === 'open') {
        try {
          connection.socket.ping();
        } catch (error) {
          deadConnections.push(connectionId);
        }
      }
    }

    // 清理死连接
    for (const connectionId of deadConnections) {
      this.removeConnection(connectionId);
    }

    if (deadConnections.length > 0) {
      this.monitor.log('debug', 'Cleaned up dead connections', {
        count: deadConnections.length,
        remaining: this.connections.size
      });
    }
  }

  /**
   * 检查内存压力
   */
  private checkMemoryPressure(): void {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

    const wasUnderPressure = this.memoryPressureActive;
    this.memoryPressureActive = heapUsedMB > this.config.memoryThreshold;

    if (this.memoryPressureActive && !wasUnderPressure) {
      this.monitor.log('warn', 'Memory pressure detected', {
        heapUsedMB,
        threshold: this.config.memoryThreshold
      });
      
      // 触发垃圾收集
      if (global.gc) {
        global.gc();
      }
      
      // 刷新所有缓冲区以释放内存
      this.flushAllBuffers().catch(error => {
        this.monitor.log('error', 'Failed to flush buffers during memory pressure', {
          error: error.message
        });
      });
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    let activeCount = 0;
    let errorCount = 0;

    for (const connection of this.connections.values()) {
      switch (connection.state) {
        case 'open':
          activeCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
    }

    this.stats.activeConnections = activeCount;
    this.stats.errorConnections = errorCount;
    this.stats.averageLatency = this.calculateAverageLatency();
    this.stats.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    this.stats.bufferUtilization = this.calculateBufferUtilization();
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
   * 计算平均延迟
   */
  private calculateAverageLatency(): number {
    if (this.latencyStats.length === 0) return 0;
    const sum = this.latencyStats.reduce((a, b) => a + b, 0);
    return sum / this.latencyStats.length;
  }

  /**
   * 计算缓冲区利用率
   */
  private calculateBufferUtilization(): number {
    if (this.messageBuffers.size === 0) return 0;
    
    let totalMessages = 0;
    let totalCapacity = 0;
    
    for (const buffer of this.messageBuffers.values()) {
      totalMessages += buffer.messages.length;
      totalCapacity += this.config.maxMessageBufferSize;
    }
    
    return totalCapacity > 0 ? (totalMessages / totalCapacity) * 100 : 0;
  }

  /**
   * 创建初始统计信息
   */
  private createInitialStats(): PoolStats {
    return {
      totalConnections: 0,
      activeConnections: 0,
      errorConnections: 0,
      totalMessagesSent: 0,
      totalBytesSent: 0,
      averageLatency: 0,
      memoryUsage: 0,
      bufferUtilization: 0,
      connectionTurnover: 0
    };
  }
}

// 事件类型声明
declare interface ConnectionPoolManager {
  on(event: 'connectionAdded', listener: (connectionId: string) => void): this;
  on(event: 'connectionRemoved', listener: (connectionId: string) => void): this;
  on(event: 'metricsUpdated', listener: (stats: PoolStats) => void): this;
  on(event: 'shutdown', listener: () => void): this;
  emit(event: string, ...args: any[]): boolean;
}