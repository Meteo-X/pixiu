import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { 
  Exchange, 
  DataType, 
  MarketData, 
  ConnectionStatus, 
  ConnectionStats, 
  BinanceTradeStream, 
  BinanceKlineStream, 
  BinanceCombinedStream,
  ConnectionError,
  DataParsingError
} from '../types';
import { BinanceDataParser } from '../pipeline/parsers/binance-parser';
import { Logger } from '../utils/logger';

export interface BinanceConnectorConfig {
  wsEndpoint: string;
  symbols: string[];
  dataTypes: DataType[];
  maxStreamsPerConnection: number;
  reconnectDelay: number;
  maxReconnectDelay: number;
  heartbeatInterval: number;
  pingTimeout: number;
}

export class BinanceConnector extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private connectionStats: Map<string, ConnectionStats> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private currentReconnectDelay: number;
  private parser: BinanceDataParser;
  private logger: Logger;
  private isShuttingDown: boolean = false;

  constructor(
    private config: BinanceConnectorConfig,
    logger: Logger
  ) {
    super();
    this.currentReconnectDelay = config.reconnectDelay;
    this.parser = new BinanceDataParser();
    this.logger = logger.child({ component: 'BinanceConnector' });
  }

  async start(): Promise<void> {
    this.logger.info('Starting Binance connector', {
      symbols: this.config.symbols,
      dataTypes: this.config.dataTypes
    });

    try {
      await this.createConnections();
      this.logger.info('Binance connector started successfully');
    } catch (error) {
      this.logger.error('Failed to start Binance connector', { error });
      throw new ConnectionError('Failed to start Binance connector', error as Error);
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.info('Stopping Binance connector');

    // 清理重连定时器
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // 清理心跳定时器
    for (const interval of this.pingIntervals.values()) {
      clearInterval(interval);
    }
    this.pingIntervals.clear();

    // 关闭所有连接
    const closePromises = Array.from(this.connections.entries()).map(
      ([connectionId, ws]) => this.closeConnection(connectionId, ws)
    );

    await Promise.all(closePromises);
    this.logger.info('Binance connector stopped');
  }

  getStats(): Map<string, ConnectionStats> {
    return new Map(this.connectionStats);
  }

  private async createConnections(): Promise<void> {
    const streams = this.buildStreams();
    const connectionGroups = this.groupStreams(streams);

    const connectionPromises = connectionGroups.map((streamGroup, index) => 
      this.createConnection(`connection-${index}`, streamGroup)
    );

    await Promise.all(connectionPromises);
  }

  private buildStreams(): string[] {
    const streams: string[] = [];
    
    for (const symbol of this.config.symbols) {
      const normalizedSymbol = symbol.replace('/', '').toLowerCase();
      
      for (const dataType of this.config.dataTypes) {
        switch (dataType) {
          case DataType.TRADE:
            streams.push(`${normalizedSymbol}@trade`);
            break;
          case DataType.KLINE_1M:
            streams.push(`${normalizedSymbol}@kline_1m`);
            break;
          case DataType.KLINE_5M:
            streams.push(`${normalizedSymbol}@kline_5m`);
            break;
          case DataType.KLINE_15M:
            streams.push(`${normalizedSymbol}@kline_15m`);
            break;
          case DataType.KLINE_30M:
            streams.push(`${normalizedSymbol}@kline_30m`);
            break;
          case DataType.KLINE_1H:
            streams.push(`${normalizedSymbol}@kline_1h`);
            break;
          case DataType.KLINE_4H:
            streams.push(`${normalizedSymbol}@kline_4h`);
            break;
          case DataType.KLINE_1D:
            streams.push(`${normalizedSymbol}@kline_1d`);
            break;
        }
      }
    }

    return streams;
  }

  private groupStreams(streams: string[]): string[][] {
    const groups: string[][] = [];
    const maxStreamsPerConnection = this.config.maxStreamsPerConnection;

    for (let i = 0; i < streams.length; i += maxStreamsPerConnection) {
      groups.push(streams.slice(i, i + maxStreamsPerConnection));
    }

    return groups;
  }

  private async createConnection(connectionId: string, streams: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.config.wsEndpoint}/stream?streams=${streams.join('/')}`;
      
      this.logger.debug('Creating WebSocket connection', {
        connectionId,
        url: wsUrl,
        streamCount: streams.length
      });

      const ws = new WebSocket(wsUrl);
      
      // 初始化连接统计
      this.connectionStats.set(connectionId, {
        status: ConnectionStatus.CONNECTING,
        messagesReceived: 0,
        bytesReceived: 0,
        errors: 0,
        latency: {
          current: 0,
          average: 0,
          p95: 0
        }
      });

      ws.on('open', () => {
        this.handleConnectionOpen(connectionId, ws);
        resolve();
      });

      ws.on('message', (data) => {
        this.handleMessage(connectionId, data);
      });

      ws.on('error', (error) => {
        this.handleConnectionError(connectionId, error);
      });

      ws.on('close', (code, reason) => {
        this.handleConnectionClose(connectionId, code, reason.toString());
      });

      ws.on('ping', () => {
        ws.pong();
      });

      this.connections.set(connectionId, ws);

      // 连接超时处理
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.terminate();
          reject(new ConnectionError(`Connection timeout for ${connectionId}`));
        }
      }, this.config.pingTimeout);
    });
  }

  private handleConnectionOpen(connectionId: string, ws: WebSocket): void {
    this.logger.info('WebSocket connection established', { connectionId });
    
    const stats = this.connectionStats.get(connectionId)!;
    stats.status = ConnectionStatus.CONNECTED;
    stats.connectedAt = Date.now();
    
    // 重置重连延迟
    this.currentReconnectDelay = this.config.reconnectDelay;
    
    // 启动心跳
    this.startHeartbeat(connectionId, ws);
    
    this.emit('connectionOpen', connectionId);
  }

  private handleMessage(connectionId: string, data: WebSocket.Data): void {
    const stats = this.connectionStats.get(connectionId)!;
    
    try {
      const messageSize = Buffer.byteLength(data.toString());
      stats.messagesReceived++;
      stats.bytesReceived += messageSize;
      
      const message: BinanceCombinedStream<any> = JSON.parse(data.toString());
      
      if (message.stream && message.data) {
        const marketData = this.parser.parse(message);
        
        // 计算延迟
        const latency = Date.now() - message.data.E;
        this.updateLatencyStats(stats, latency);
        
        this.emit('data', marketData);
      }
    } catch (error) {
      stats.errors++;
      this.logger.error('Failed to parse message', {
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.emit('error', new DataParsingError(
        `Failed to parse message for ${connectionId}`,
        error as Error
      ));
    }
  }

  private handleConnectionError(connectionId: string, error: Error): void {
    this.logger.error('WebSocket connection error', { connectionId, error });
    
    const stats = this.connectionStats.get(connectionId)!;
    stats.status = ConnectionStatus.ERROR;
    stats.errors++;
    stats.lastError = {
      time: Date.now(),
      message: error.message
    };
    
    this.emit('connectionError', connectionId, error);
  }

  private handleConnectionClose(connectionId: string, code: number, reason: string): void {
    this.logger.warn('WebSocket connection closed', { connectionId, code, reason });
    
    const stats = this.connectionStats.get(connectionId)!;
    stats.status = ConnectionStatus.DISCONNECTED;
    
    // 清理心跳定时器
    const pingInterval = this.pingIntervals.get(connectionId);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(connectionId);
    }
    
    this.emit('connectionClose', connectionId, code, reason);
    
    // 自动重连
    if (!this.isShuttingDown) {
      this.scheduleReconnect(connectionId);
    }
  }

  private startHeartbeat(connectionId: string, ws: WebSocket): void {
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
        this.pingIntervals.delete(connectionId);
      }
    }, this.config.heartbeatInterval);
    
    this.pingIntervals.set(connectionId, pingInterval);
  }

  private scheduleReconnect(connectionId: string): void {
    if (this.reconnectTimers.has(connectionId)) {
      return;
    }

    this.logger.info('Scheduling reconnection', {
      connectionId,
      delay: this.currentReconnectDelay
    });

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(connectionId);
      await this.reconnectConnection(connectionId);
    }, this.currentReconnectDelay);

    this.reconnectTimers.set(connectionId, timer);

    // 增加重连延迟
    this.currentReconnectDelay = Math.min(
      this.currentReconnectDelay * 1.5,
      this.config.maxReconnectDelay
    );
  }

  private async reconnectConnection(connectionId: string): Promise<void> {
    try {
      this.logger.info('Attempting to reconnect', { connectionId });
      
      // 获取原来的流列表（这里简化处理，实际应该保存原始配置）
      const streams = this.buildStreams();
      const connectionIndex = parseInt(connectionId.split('-')[1]);
      const streamGroups = this.groupStreams(streams);
      const connectionStreams = streamGroups[connectionIndex] || [];

      await this.createConnection(connectionId, connectionStreams);
      
      this.logger.info('Reconnection successful', { connectionId });
    } catch (error) {
      this.logger.error('Reconnection failed', { connectionId, error });
      
      if (!this.isShuttingDown) {
        this.scheduleReconnect(connectionId);
      }
    }
  }

  private async closeConnection(connectionId: string, ws: WebSocket): Promise<void> {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      ws.once('close', () => resolve());
      ws.close();

      // 强制关闭超时
      setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.terminate();
        }
        resolve();
      }, 5000);
    });
  }

  private updateLatencyStats(stats: ConnectionStats, latency: number): void {
    stats.latency.current = latency;
    
    // 简化的延迟统计（实际应该使用滑动窗口）
    if (stats.latency.average === 0) {
      stats.latency.average = latency;
    } else {
      stats.latency.average = (stats.latency.average * 0.9) + (latency * 0.1);
    }
    
    // P95 计算简化
    stats.latency.p95 = Math.max(stats.latency.p95, latency);
  }
}