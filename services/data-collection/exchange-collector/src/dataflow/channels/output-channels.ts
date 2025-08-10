/**
 * 输出通道实现
 * 提供统一的数据输出接口，支持PubSub、WebSocket、缓存等多种输出方式
 */

import { MarketData } from '@pixiu/adapter-base';
import { PubSubClientImpl, BaseMonitor } from '@pixiu/shared-core';
import { OutputChannel, ChannelStatus } from '../interfaces';
import { WebSocketProxy } from '../../websocket/websocket-proxy';
import { DataStreamCache } from '../../cache';
import { UnifiedDataProcessor } from '../../utils/data-processor';

/**
 * Pub/Sub输出通道
 */
export class PubSubOutputChannel implements OutputChannel {
  id: string;
  name: string;
  type = 'pubsub' as const;
  enabled: boolean;

  private pubsubClient: PubSubClientImpl;
  private monitor: BaseMonitor;
  private topicPrefix: string;
  private status: ChannelStatus;
  private dataProcessor: UnifiedDataProcessor;

  constructor(
    id: string,
    pubsubClient: PubSubClientImpl,
    monitor: BaseMonitor,
    options: {
      name?: string;
      topicPrefix?: string;
      enabled?: boolean;
    } = {}
  ) {
    this.id = id;
    this.name = options.name || `pubsub-channel-${id}`;
    this.enabled = options.enabled !== false;
    this.pubsubClient = pubsubClient;
    this.monitor = monitor;
    this.topicPrefix = options.topicPrefix || 'market-data';
    this.dataProcessor = new UnifiedDataProcessor(monitor);

    this.status = {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      connected: true, // PubSub通常总是连接的
      messagesSent: 0,
      errors: 0,
      lastActivity: 0,
      health: 'healthy'
    };
  }

  async output(data: MarketData, metadata?: Record<string, any>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const topicName = this.dataProcessor.buildTopicName(this.topicPrefix, data, 'by_type');
      const messageAttributes = this.dataProcessor.buildMessageAttributes(
        data, 
        'exchange-collector', 
        { 
          channelId: this.id, 
          channelType: this.type,
          ...(metadata && Object.fromEntries(
            Object.entries(metadata).map(([k, v]) => [k, String(v)])
          ))
        }
      );

      const messageId = await this.pubsubClient.publish(topicName, data, {
        attributes: messageAttributes
      });

      this.status.messagesSent++;
      this.status.lastActivity = Date.now();
      this.status.health = 'healthy';

      this.monitor.log('debug', 'Data sent to PubSub', {
        channelId: this.id,
        topicName,
        messageId,
        exchange: data.exchange,
        symbol: data.symbol,
        type: data.type
      });
    } catch (error) {
      this.status.errors++;
      this.status.health = 'unhealthy';

      this.monitor.log('error', 'Failed to send data to PubSub', {
        channelId: this.id,
        error: error.message,
        data: { exchange: data.exchange, symbol: data.symbol, type: data.type }
      });

      throw error;
    }
  }

  async close(): Promise<void> {
    this.enabled = false;
    this.status.connected = false;
    this.status.health = 'unhealthy';
    
    this.monitor.log('info', 'PubSub channel closed', { channelId: this.id });
  }

  getStatus(): ChannelStatus {
    return { ...this.status };
  }

  /**
   * 构建主题名称
   * @deprecated 使用 dataProcessor.buildTopicName 代替
   */
  private buildTopicName(data: MarketData): string {
    return this.dataProcessor.buildTopicName(this.topicPrefix, data, 'by_type');
  }

  /**
   * 构建消息属性
   * @deprecated 使用 dataProcessor.buildMessageAttributes 代替
   */
  private buildMessageAttributes(data: MarketData, metadata?: Record<string, any>): Record<string, string> {
    return this.dataProcessor.buildMessageAttributes(data, 'exchange-collector', {
      channelId: this.id,
      channelType: this.type,
      ...(metadata && Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [k, String(v)])
      ))
    });
  }

  /**
   * 获取数据类型名称
   * @deprecated 使用 dataProcessor.normalizeDataType 代替
   */
  private getDataTypeName(dataType: string): string {
    return this.dataProcessor.normalizeDataType(dataType);
  }
}

/**
 * WebSocket输出通道
 * 重构：统一使用WebSocketProxy进行消息转发
 */
export class WebSocketOutputChannel implements OutputChannel {
  id: string;
  name: string;
  type = 'websocket' as const;
  enabled: boolean;

  private webSocketProxy: WebSocketProxy;
  private monitor: BaseMonitor;
  private status: ChannelStatus;

  constructor(
    id: string,
    webSocketProxy: WebSocketProxy,
    monitor: BaseMonitor,
    options: {
      name?: string;
      enabled?: boolean;
    } = {}
  ) {
    this.id = id;
    this.name = options.name || `websocket-channel-${id}`;
    this.enabled = options.enabled !== false;
    this.webSocketProxy = webSocketProxy;
    this.monitor = monitor;

    this.status = {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      connected: true,
      messagesSent: 0,
      errors: 0,
      lastActivity: 0,
      health: 'healthy'
    };
  }

  async output(data: MarketData, metadata?: Record<string, any>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const websocketMessage = {
        type: data.type || 'market_data',
        exchange: data.exchange,
        symbol: data.symbol,
        data: data.data,
        timestamp: data.timestamp,
        metadata: {
          ...data.metadata,
          ...metadata,
          channelId: this.id,
          channelType: this.type
        }
      };

      // 使用WebSocketProxy进行消息转发
      const sentCount = this.webSocketProxy.forwardMessage(websocketMessage);

      this.status.messagesSent += sentCount;
      this.status.lastActivity = Date.now();
      this.status.health = 'healthy';

      this.monitor.log('debug', 'Data broadcast to WebSocket clients', {
        channelId: this.id,
        exchange: data.exchange,
        symbol: data.symbol,
        type: data.type,
        clientCount: this.webSocketServer.getConnectionCount()
      });
    } catch (error) {
      this.status.errors++;
      this.status.health = 'unhealthy';

      this.monitor.log('error', 'Failed to broadcast data to WebSocket', {
        channelId: this.id,
        error: error.message,
        data: { exchange: data.exchange, symbol: data.symbol, type: data.type }
      });

      throw error;
    }
  }

  async close(): Promise<void> {
    this.enabled = false;
    this.status.connected = false;
    this.status.health = 'unhealthy';
    
    this.monitor.log('info', 'WebSocket channel closed', { channelId: this.id });
  }

  getStatus(): ChannelStatus {
    return { ...this.status };
  }
}

/**
 * WebSocket代理输出通道
 * 使用WebSocketProxy进行高性能消息转发
 */
export class ProxyWebSocketOutputChannel implements OutputChannel {
  id: string;
  name: string;
  type = 'websocket' as const;
  enabled: boolean;

  private webSocketProxy: WebSocketProxy;
  private monitor: BaseMonitor;
  private status: ChannelStatus;

  constructor(
    id: string,
    webSocketProxy: WebSocketProxy,
    monitor: BaseMonitor,
    options: {
      name?: string;
      enabled?: boolean;
    } = {}
  ) {
    this.id = id;
    this.name = options.name || `proxy-websocket-channel-${id}`;
    this.enabled = options.enabled !== false;
    this.webSocketProxy = webSocketProxy;
    this.monitor = monitor;

    this.status = {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      connected: true,
      messagesSent: 0,
      errors: 0,
      lastActivity: 0,
      health: 'healthy'
    };

    // 监听代理事件
    this.setupProxyEventHandlers();
  }

  async output(data: MarketData, metadata?: Record<string, any>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const forwardMessage = {
        type: data.type || 'market_data',
        exchange: data.exchange,
        symbol: data.symbol,
        data: data.data,
        timestamp: data.timestamp,
        metadata: {
          ...data.metadata,
          ...metadata,
          channelId: this.id,
          channelType: this.type,
          routedAt: Date.now()
        }
      };

      // 使用代理转发消息（代理内部会处理订阅过滤）
      const sentCount = this.webSocketProxy.forwardMessage(forwardMessage);

      this.status.messagesSent += sentCount;
      this.status.lastActivity = Date.now();
      this.status.health = sentCount > 0 ? 'healthy' : 'degraded';

      this.monitor.log('debug', 'Data forwarded via WebSocket proxy', {
        channelId: this.id,
        exchange: data.exchange,
        symbol: data.symbol,
        type: data.type,
        sentCount,
        totalConnections: this.webSocketProxy.getConnectionStats().activeConnections
      });
    } catch (error) {
      this.status.errors++;
      this.status.health = 'unhealthy';

      this.monitor.log('error', 'Failed to forward data via WebSocket proxy', {
        channelId: this.id,
        error: error.message,
        data: { exchange: data.exchange, symbol: data.symbol, type: data.type }
      });

      throw error;
    }
  }

  async close(): Promise<void> {
    this.enabled = false;
    this.status.connected = false;
    this.status.health = 'unhealthy';
    
    this.monitor.log('info', 'Proxy WebSocket channel closed', { channelId: this.id });
  }

  getStatus(): ChannelStatus {
    const proxyHealth = this.webSocketProxy.healthCheck();
    return { 
      ...this.status,
      health: this.enabled ? proxyHealth.status : 'unhealthy',
      connected: this.enabled && proxyHealth.status !== 'unhealthy'
    };
  }

  /**
   * 获取代理统计信息
   */
  getProxyStats() {
    return this.webSocketProxy.getConnectionStats();
  }

  /**
   * 设置代理事件处理器
   */
  private setupProxyEventHandlers(): void {
    this.webSocketProxy.on('messageForwarded', (message, sentCount) => {
      // 可以在这里添加额外的统计逻辑
      this.monitor.log('debug', 'Message forwarded by proxy', {
        channelId: this.id,
        messageType: message.type,
        sentCount
      });
    });

    this.webSocketProxy.on('connectionEstablished', (connectionId) => {
      this.monitor.log('debug', 'New connection to proxy', {
        channelId: this.id,
        connectionId
      });
    });

    this.webSocketProxy.on('connectionClosed', (connectionId, duration) => {
      this.monitor.log('debug', 'Connection closed on proxy', {
        channelId: this.id,
        connectionId,
        duration
      });
    });
  }
}

/**
 * 缓存输出通道
 */
export class CacheOutputChannel implements OutputChannel {
  id: string;
  name: string;
  type = 'cache' as const;
  enabled: boolean;

  private dataStreamCache: DataStreamCache;
  private monitor: BaseMonitor;
  private status: ChannelStatus;

  constructor(
    id: string,
    dataStreamCache: DataStreamCache,
    monitor: BaseMonitor,
    options: {
      name?: string;
      enabled?: boolean;
    } = {}
  ) {
    this.id = id;
    this.name = options.name || `cache-channel-${id}`;
    this.enabled = options.enabled !== false;
    this.dataStreamCache = dataStreamCache;
    this.monitor = monitor;

    this.status = {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      connected: true,
      messagesSent: 0,
      errors: 0,
      lastActivity: 0,
      health: 'healthy'
    };
  }

  async output(data: MarketData, metadata?: Record<string, any>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const cacheKey = `${data.exchange}:${data.symbol}:${data.type}`;
      const cacheData = {
        ...data,
        metadata: {
          ...data.metadata,
          ...metadata,
          channelId: this.id,
          channelType: this.type,
          cachedAt: Date.now()
        }
      };

      this.dataStreamCache.set(cacheKey, cacheData, data.exchange);

      this.status.messagesSent++;
      this.status.lastActivity = Date.now();
      this.status.health = 'healthy';

      this.monitor.log('debug', 'Data cached', {
        channelId: this.id,
        cacheKey,
        exchange: data.exchange,
        symbol: data.symbol,
        type: data.type
      });
    } catch (error) {
      this.status.errors++;
      this.status.health = 'unhealthy';

      this.monitor.log('error', 'Failed to cache data', {
        channelId: this.id,
        error: error.message,
        data: { exchange: data.exchange, symbol: data.symbol, type: data.type }
      });

      throw error;
    }
  }

  async close(): Promise<void> {
    this.enabled = false;
    this.status.connected = false;
    this.status.health = 'unhealthy';
    
    this.monitor.log('info', 'Cache channel closed', { channelId: this.id });
  }

  getStatus(): ChannelStatus {
    return { ...this.status };
  }
}

/**
 * 批处理输出通道
 * 将多个消息批量发送到目标通道
 */
export class BatchOutputChannel implements OutputChannel {
  id: string;
  name: string;
  type = 'custom' as const;
  enabled: boolean;

  private targetChannel: OutputChannel;
  private monitor: BaseMonitor;
  private batchSize: number;
  private flushTimeout: number;
  private buffer: Array<{ data: MarketData; metadata?: Record<string, any> }> = [];
  private flushTimer?: NodeJS.Timeout;
  private status: ChannelStatus;

  constructor(
    id: string,
    targetChannel: OutputChannel,
    monitor: BaseMonitor,
    options: {
      name?: string;
      enabled?: boolean;
      batchSize?: number;
      flushTimeout?: number;
    } = {}
  ) {
    this.id = id;
    this.name = options.name || `batch-channel-${id}`;
    this.enabled = options.enabled !== false;
    this.targetChannel = targetChannel;
    this.monitor = monitor;
    this.batchSize = options.batchSize || 10;
    this.flushTimeout = options.flushTimeout || 1000;

    this.status = {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      connected: true,
      messagesSent: 0,
      errors: 0,
      lastActivity: 0,
      health: 'healthy'
    };
  }

  async output(data: MarketData, metadata?: Record<string, any>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.buffer.push({ data, metadata });
    this.status.lastActivity = Date.now();

    // 检查是否需要立即刷新
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    } else if (!this.flushTimer) {
      // 设置超时刷新
      this.flushTimer = setTimeout(() => {
        this.flush().catch(error => {
          this.monitor.log('error', 'Batch flush error', {
            channelId: this.id,
            error: error.message
          });
        });
      }, this.flushTimeout);
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    // 刷新剩余数据
    if (this.buffer.length > 0) {
      await this.flush();
    }

    this.enabled = false;
    this.status.connected = false;
    this.status.health = 'unhealthy';
    
    this.monitor.log('info', 'Batch channel closed', { channelId: this.id });
  }

  getStatus(): ChannelStatus {
    return {
      ...this.status,
      // 添加批处理特有的状态信息
      messagesSent: this.status.messagesSent,
      errors: this.status.errors
    };
  }

  /**
   * 刷新缓冲区
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const itemsToFlush = this.buffer.splice(0);
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    try {
      // 并发发送所有数据
      const sendPromises = itemsToFlush.map(({ data, metadata }) =>
        this.targetChannel.output(data, {
          ...metadata,
          batchedBy: this.id,
          batchSize: itemsToFlush.length
        }).catch(error => {
          this.status.errors++;
          this.monitor.log('error', 'Batch item send failed', {
            channelId: this.id,
            targetChannel: this.targetChannel.id,
            error: error.message
          });
          throw error;
        })
      );

      const results = await Promise.allSettled(sendPromises);
      
      // 统计成功和失败数量
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.length - successCount;

      this.status.messagesSent += successCount;
      
      if (failureCount > 0) {
        this.status.health = 'degraded';
      } else {
        this.status.health = 'healthy';
      }

      this.monitor.log('debug', 'Batch flushed', {
        channelId: this.id,
        batchSize: itemsToFlush.length,
        successCount,
        failureCount
      });
    } catch (error) {
      this.status.errors++;
      this.status.health = 'unhealthy';
      
      this.monitor.log('error', 'Batch flush failed', {
        channelId: this.id,
        batchSize: itemsToFlush.length,
        error: error.message
      });

      throw error;
    }
  }
}