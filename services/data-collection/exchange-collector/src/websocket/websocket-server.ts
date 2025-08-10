import { WebSocketServer, WebSocket, RawData } from 'ws';
import { Server } from 'http';
import { BaseMonitor } from '@pixiu/shared-core';

export interface WebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: number;
}

export interface ConnectionInfo {
  id: string;
  socket: WebSocket;
  connectedAt: number;
  lastActivity: number;
  subscriptions: Set<string>;
}

/**
 * Exchange Collector WebSocket 服务器 (已重构为兼容模式)
 * 保持向后兼容性，实际功能由WebSocketProxy处理
 * @deprecated 请使用 WebSocketProxy 代替
 */
export class CollectorWebSocketServer {
  private wss: WebSocketServer;
  private connections: Map<string, ConnectionInfo> = new Map();
  private connectionCounter = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30秒心跳
  private readonly CONNECTION_TIMEOUT = 60000; // 60秒超时

  constructor(
    server: Server,
    private monitor: BaseMonitor,
    // 移除 AdapterRegistry 依赖，保持兼容性
    private adapterRegistry?: any
  ) {
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      clientTracking: false // 我们自己管理连接
    });
    
    this.setupEventHandlers();
    this.startHeartbeat();
    
    this.monitor.log('info', 'WebSocket server initialized (compatibility mode)', {
      path: '/ws'
    });
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', (ws, req) => {
      const connectionId = this.generateConnectionId();
      const clientIP = req.socket.remoteAddress;
      
      try {
        // 创建连接信息
        const connectionInfo: ConnectionInfo = {
          id: connectionId,
          socket: ws,
          connectedAt: Date.now(),
          lastActivity: Date.now(),
          subscriptions: new Set()
        };
        
        this.connections.set(connectionId, connectionInfo);
        
        this.monitor.log('info', 'WebSocket client connected', {
          connectionId,
          clientIP,
          totalConnections: this.connections.size
        });

        // 发送欢迎消息
        this.sendToConnection(connectionId, {
          type: 'welcome',
          payload: {
            connectionId,
            serverTime: Date.now()
          }
        });

        // 设置消息处理
        ws.on('message', (data) => {
          this.handleMessage(connectionId, data);
        });

        // 设置关闭处理
        ws.on('close', (code, reason) => {
          this.handleDisconnection(connectionId, code, reason);
        });

        // 设置错误处理
        ws.on('error', (error) => {
          this.handleConnectionError(connectionId, error);
        });

        // 设置 pong 处理（心跳响应）
        ws.on('pong', () => {
          this.updateLastActivity(connectionId);
        });

      } catch (error) {
        this.monitor.log('error', 'Error setting up WebSocket connection', { 
          error, 
          connectionId,
          clientIP 
        });
        ws.close(1011, 'Server error');
      }
    });

    this.wss.on('error', (error) => {
      this.monitor.log('error', 'WebSocket server error', { error });
    });
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(connectionId: string, data: RawData): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      this.updateLastActivity(connectionId);
      
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      
      this.monitor.log('debug', 'WebSocket message received', {
        connectionId,
        messageType: message.type
      });

      switch (message.type) {
        case 'ping':
          this.sendToConnection(connectionId, { type: 'pong' });
          break;
          
        case 'subscribe':
          this.handleSubscription(connectionId, message.payload);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscription(connectionId, message.payload);
          break;
          
        case 'getStats':
          this.handleStatsRequest(connectionId);
          break;
          
        default:
          this.monitor.log('warn', 'Unknown WebSocket message type', {
            connectionId,
            messageType: message.type
          });
      }
    } catch (error) {
      this.monitor.log('error', 'Error handling WebSocket message', {
        connectionId,
        error
      });
      
      this.sendToConnection(connectionId, {
        type: 'error',
        payload: {
          message: 'Invalid message format'
        }
      });
    }
  }

  /**
   * 处理订阅请求
   */
  private handleSubscription(connectionId: string, payload: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      const { channel } = payload;
      if (typeof channel === 'string') {
        connection.subscriptions.add(channel);
        
        this.sendToConnection(connectionId, {
          type: 'subscribed',
          payload: { channel }
        });
        
        this.monitor.log('debug', 'Client subscribed to channel', {
          connectionId,
          channel,
          totalSubscriptions: connection.subscriptions.size
        });
      }
    } catch (error) {
      this.monitor.log('error', 'Error handling subscription', {
        connectionId,
        error
      });
    }
  }

  /**
   * 处理取消订阅请求
   */
  private handleUnsubscription(connectionId: string, payload: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      const { channel } = payload;
      if (typeof channel === 'string') {
        connection.subscriptions.delete(channel);
        
        this.sendToConnection(connectionId, {
          type: 'unsubscribed',
          payload: { channel }
        });
        
        this.monitor.log('debug', 'Client unsubscribed from channel', {
          connectionId,
          channel,
          totalSubscriptions: connection.subscriptions.size
        });
      }
    } catch (error) {
      this.monitor.log('error', 'Error handling unsubscription', {
        connectionId,
        error
      });
    }
  }

  /**
   * 处理统计信息请求
   */
  private handleStatsRequest(connectionId: string): void {
    try {
      const stats = this.getServerStats();
      this.sendToConnection(connectionId, {
        type: 'stats',
        payload: stats
      });
    } catch (error) {
      this.monitor.log('error', 'Error handling stats request', {
        connectionId,
        error
      });
    }
  }

  /**
   * 处理连接断开
   */
  private handleDisconnection(connectionId: string, code: number, reason: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      const duration = Date.now() - connection.connectedAt;
      
      this.monitor.log('info', 'WebSocket client disconnected', {
        connectionId,
        code,
        reason: reason.toString(),
        duration,
        totalConnections: this.connections.size - 1
      });
      
      this.connections.delete(connectionId);
    }
  }

  /**
   * 处理连接错误
   */
  private handleConnectionError(connectionId: string, error: Error): void {
    this.monitor.log('error', 'WebSocket connection error', {
      connectionId,
      error
    });
    
    // 清理连接
    this.connections.delete(connectionId);
  }

  /**
   * 向指定连接发送消息
   */
  private sendToConnection(connectionId: string, message: WebSocketMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const messageWithTimestamp = {
        ...message,
        timestamp: Date.now()
      };
      
      connection.socket.send(JSON.stringify(messageWithTimestamp));
      return true;
    } catch (error) {
      this.monitor.log('error', 'Error sending message to connection', {
        connectionId,
        error
      });
      return false;
    }
  }

  /**
   * 广播消息到所有连接的客户端
   */
  broadcast(message: WebSocketMessage, channel?: string): number {
    let sentCount = 0;
    const messageWithTimestamp = {
      ...message,
      timestamp: Date.now()
    };
    
    for (const [connectionId, connection] of this.connections) {
      // 如果指定了频道，只发送给订阅了该频道的客户端
      if (channel && !connection.subscriptions.has(channel)) {
        continue;
      }
      
      if (connection.socket.readyState === WebSocket.OPEN) {
        try {
          connection.socket.send(JSON.stringify(messageWithTimestamp));
          sentCount++;
        } catch (error) {
          this.monitor.log('error', 'Error broadcasting to connection', {
            connectionId,
            error
          });
          // 标记连接为待清理
          this.connections.delete(connectionId);
        }
      }
    }
    
    if (sentCount > 0) {
      this.monitor.log('debug', 'Message broadcast completed', {
        messageType: message.type,
        sentCount,
        channel
      });
    }
    
    return sentCount;
  }

  /**
   * 广播市场数据 (兼容模式)
   * @deprecated 使用 WebSocketProxy.forwardMessage 代替
   */
  broadcastMarketData(data: any): void {
    this.broadcast({
      type: 'marketData',
      payload: data
    }, 'marketData');
  }

  /**
   * 广播连接状态更新 (兼容模式)
   * @deprecated 使用 WebSocketProxy.forwardMessage 代替
   */
  broadcastConnectionStatus(status: any): void {
    this.broadcast({
      type: 'connectionStatus',
      payload: status
    }, 'connectionStatus');
  }

  /**
   * 广播系统指标 (兼容模式)
   * @deprecated 使用 WebSocketProxy.forwardMessage 代替
   */
  broadcastMetrics(metrics: any): void {
    this.broadcast({
      type: 'metrics',
      payload: metrics
    }, 'metrics');
  }

  /**
   * 启动心跳检查
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const deadConnections: string[] = [];
      
      for (const [connectionId, connection] of this.connections) {
        if (connection.socket.readyState === WebSocket.OPEN) {
          // 检查是否超时
          if (now - connection.lastActivity > this.CONNECTION_TIMEOUT) {
            deadConnections.push(connectionId);
            continue;
          }
          
          // 发送 ping
          try {
            connection.socket.ping();
          } catch (error) {
            deadConnections.push(connectionId);
          }
        } else {
          deadConnections.push(connectionId);
        }
      }
      
      // 清理死连接
      for (const connectionId of deadConnections) {
        this.connections.delete(connectionId);
        this.monitor.log('debug', 'Cleaned up dead WebSocket connection', {
          connectionId
        });
      }
      
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * 更新连接活动时间
   */
  private updateLastActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = Date.now();
    }
  }

  /**
   * 生成连接ID
   */
  private generateConnectionId(): string {
    return `ws_${Date.now()}_${++this.connectionCounter}`;
  }

  /**
   * 获取服务器统计信息
   */
  public getServerStats(): any {
    const connections = Array.from(this.connections.values());
    const now = Date.now();
    
    // 简化的适配器状态（兼容模式）
    const adapterStats = this.adapterRegistry ? 
      Array.from(this.adapterRegistry.getAllInstances?.() || new Map()).map(([name, adapter]) => ({
        name,
        status: adapter?.getAdapterStatus?.() || 'unknown',
        metrics: adapter?.getMetrics?.() || {}
      })) : [];
    
    return {
      connections: {
        total: connections.length,
        active: connections.filter(c => c.socket.readyState === WebSocket.OPEN).length,
        avgDuration: connections.length > 0 
          ? connections.reduce((sum, c) => sum + (now - c.connectedAt), 0) / connections.length 
          : 0
      },
      subscriptions: {
        total: connections.reduce((sum, c) => sum + c.subscriptions.size, 0),
        channels: [...new Set(connections.flatMap(c => Array.from(c.subscriptions)))]
      },
      adapters: adapterStats,
      server: {
        uptime: process.uptime() * 1000,
        memory: process.memoryUsage(),
        timestamp: now
      }
    };
  }

  /**
   * 获取连接数量
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * 关闭 WebSocket 服务器
   */
  public async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // 关闭所有连接
    for (const [connectionId, connection] of this.connections) {
      try {
        connection.socket.close(1001, 'Server shutting down');
      } catch (error) {
        this.monitor.log('error', 'Error closing WebSocket connection', {
          connectionId,
          error
        });
      }
    }
    
    this.connections.clear();

    // 关闭 WebSocket 服务器
    return new Promise<void>((resolve) => {
      this.wss.close(() => {
        this.monitor.log('info', 'WebSocket server closed');
        resolve();
      });
    });
  }
}