/**
 * WebSocket Mock工具
 * 提供统一的WebSocket模拟功能供所有测试使用
 */

import { EventEmitter } from 'events';

export interface MockWebSocketOptions {
  /** 连接延迟（毫秒） */
  connectionDelay?: number;
  /** 是否模拟连接失败 */
  shouldFailConnection?: boolean;
  /** 是否模拟发送失败 */
  shouldFailOnSend?: boolean;
  /** 自动响应ping消息 */
  autoRespondToPing?: boolean;
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
}

export class MockWebSocket extends EventEmitter {
  public readyState = 0; // CONNECTING
  public url = '';
  public protocol = '';
  public extensions = '';
  
  private options: MockWebSocketOptions;
  private pingInterval?: NodeJS.Timeout;
  private messageQueue: any[] = [];
  private connectionTimeout?: NodeJS.Timeout;
  
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(url: string, protocols?: string | string[], options: MockWebSocketOptions = {}) {
    super();
    this.url = url;
    this.protocol = Array.isArray(protocols) ? protocols[0] || '' : protocols || '';
    this.options = {
      connectionDelay: 50,
      shouldFailConnection: false,
      shouldFailOnSend: false,
      autoRespondToPing: true,
      heartbeatInterval: 30000,
      ...options
    };

    this.initializeConnection();
  }

  private initializeConnection() {
    if (this.options.shouldFailConnection) {
      this.connectionTimeout = setTimeout(() => {
        this.readyState = MockWebSocket.CLOSED;
        const error = new Error('Connection failed');
        this.emit('error', error);
      }, this.options.connectionDelay);
    } else {
      this.connectionTimeout = setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit('open');
        
        // 开始心跳
        this.startHeartbeat();
        
        // 处理排队的消息
        this.processMessageQueue();
      }, this.options.connectionDelay);
    }
  }

  private startHeartbeat() {
    if (this.options.heartbeatInterval && this.options.heartbeatInterval > 0) {
      this.pingInterval = setInterval(() => {
        if (this.readyState === MockWebSocket.OPEN) {
          this.emit('ping');
          
          if (this.options.autoRespondToPing) {
            // 模拟自动pong响应
            setTimeout(() => {
              this.emit('pong');
            }, 1);
          }
        }
      }, this.options.heartbeatInterval);
    }
  }

  private processMessageQueue() {
    while (this.messageQueue.length > 0 && this.readyState === MockWebSocket.OPEN) {
      const message = this.messageQueue.shift();
      this.emit('message', { data: JSON.stringify(message) });
    }
  }

  send(data: string | Buffer | ArrayBuffer | Buffer[]): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error(`WebSocket is not open: readyState ${this.readyState} (${this.getReadyStateString()})`);
    }

    if (this.options.shouldFailOnSend) {
      throw new Error('Send operation failed');
    }

    // 在真实实现中，这里会发送数据
    // Mock实现中，我们可以触发一些事件或存储数据
    this.emit('send', data);
  }

  close(code = 1000, reason = 'Normal closure'): void {
    if (this.readyState === MockWebSocket.CLOSED || this.readyState === MockWebSocket.CLOSING) {
      return;
    }

    this.readyState = MockWebSocket.CLOSING;
    
    // 清理定时器
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', { 
        code, 
        reason, 
        wasClean: code === 1000 
      });
    }, 10);
  }

  ping(data?: Buffer): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.emit('ping', data);
    }
  }

  pong(data?: Buffer): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.emit('pong', data);
    }
  }

  terminate(): void {
    this.readyState = MockWebSocket.CLOSED;
    
    // 立即清理资源
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // 不发送close事件，模拟强制终止
    this.removeAllListeners();
  }

  // 测试辅助方法

  /**
   * 模拟接收消息
   */
  mockReceiveMessage(message: any): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.emit('message', { data: JSON.stringify(message) });
    } else {
      // 如果连接未建立，将消息加入队列
      this.messageQueue.push(message);
    }
  }

  /**
   * 模拟接收多条消息
   */
  mockReceiveMessages(messages: any[]): void {
    messages.forEach(message => this.mockReceiveMessage(message));
  }

  /**
   * 模拟连接错误
   */
  mockConnectionError(error?: Error): void {
    const err = error || new Error('Connection error');
    this.readyState = MockWebSocket.CLOSED;
    this.emit('error', err);
  }

  /**
   * 模拟网络中断
   */
  mockNetworkDisconnection(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', { 
      code: 1006, 
      reason: 'Abnormal closure',
      wasClean: false
    });
  }

  /**
   * 模拟连接超时
   */
  mockConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    
    this.connectionTimeout = setTimeout(() => {
      this.mockConnectionError(new Error('Connection timeout'));
    }, this.options.connectionDelay! * 2);
  }

  /**
   * 强制设置连接状态
   */
  setReadyState(state: number): void {
    this.readyState = state;
  }

  /**
   * 获取可读的连接状态字符串
   */
  getReadyStateString(): string {
    switch (this.readyState) {
      case MockWebSocket.CONNECTING:
        return 'CONNECTING';
      case MockWebSocket.OPEN:
        return 'OPEN';
      case MockWebSocket.CLOSING:
        return 'CLOSING';
      case MockWebSocket.CLOSED:
        return 'CLOSED';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * 获取排队消息的数量
   */
  getQueuedMessageCount(): number {
    return this.messageQueue.length;
  }

  /**
   * 清空消息队列
   */
  clearMessageQueue(): void {
    this.messageQueue = [];
  }

  /**
   * 手动触发连接建立（用于测试同步场景）
   */
  forceConnect(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    
    this.readyState = MockWebSocket.OPEN;
    this.emit('open');
    this.startHeartbeat();
    this.processMessageQueue();
  }

  /**
   * 模拟高频消息发送
   */
  simulateHighFrequencyMessages(count: number, intervalMs: number = 1): void {
    let sent = 0;
    const sendNext = () => {
      if (sent >= count || this.readyState !== MockWebSocket.OPEN) {
        return;
      }

      const message = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: Date.now(),
          s: 'BTCUSDT',
          t: sent + 1,
          p: (50000 + Math.random() * 1000).toFixed(2),
          q: (Math.random()).toFixed(4),
          T: Date.now(),
          m: sent % 2 === 0
        }
      };

      this.mockReceiveMessage(message);
      sent++;

      if (sent < count) {
        setTimeout(sendNext, intervalMs);
      }
    };

    sendNext();
  }

  /**
   * 模拟批量消息发送
   */
  simulateBatchMessages(messages: any[], batchSize: number = 10, intervalMs: number = 100): void {
    let processed = 0;
    
    const processBatch = () => {
      if (processed >= messages.length) {
        return;
      }

      const batch = messages.slice(processed, processed + batchSize);
      batch.forEach(message => this.mockReceiveMessage(message));
      
      processed += batch.length;
      
      if (processed < messages.length) {
        setTimeout(processBatch, intervalMs);
      }
    };

    processBatch();
  }
}

/**
 * WebSocket Mock工厂
 */
export class MockWebSocketFactory {
  private static defaultOptions: MockWebSocketOptions = {
    connectionDelay: 50,
    shouldFailConnection: false,
    shouldFailOnSend: false,
    autoRespondToPing: true,
    heartbeatInterval: 30000
  };

  /**
   * 创建标准的Mock WebSocket
   */
  static create(url: string, protocols?: string | string[], options?: MockWebSocketOptions): MockWebSocket {
    return new MockWebSocket(url, protocols, { ...this.defaultOptions, ...options });
  }

  /**
   * 创建总是连接失败的Mock WebSocket
   */
  static createFailingConnection(url: string, protocols?: string | string[]): MockWebSocket {
    return new MockWebSocket(url, protocols, {
      ...this.defaultOptions,
      shouldFailConnection: true,
      connectionDelay: 100
    });
  }

  /**
   * 创建发送失败的Mock WebSocket
   */
  static createFailingSend(url: string, protocols?: string | string[]): MockWebSocket {
    return new MockWebSocket(url, protocols, {
      ...this.defaultOptions,
      shouldFailOnSend: true
    });
  }

  /**
   * 创建高延迟的Mock WebSocket
   */
  static createSlowConnection(url: string, protocols?: string | string[], delay = 2000): MockWebSocket {
    return new MockWebSocket(url, protocols, {
      ...this.defaultOptions,
      connectionDelay: delay
    });
  }

  /**
   * 创建无心跳的Mock WebSocket
   */
  static createNoHeartbeat(url: string, protocols?: string | string[]): MockWebSocket {
    return new MockWebSocket(url, protocols, {
      ...this.defaultOptions,
      heartbeatInterval: 0
    });
  }

  /**
   * 设置默认选项
   */
  static setDefaultOptions(options: Partial<MockWebSocketOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * 重置默认选项
   */
  static resetDefaultOptions(): void {
    this.defaultOptions = {
      connectionDelay: 50,
      shouldFailConnection: false,
      shouldFailOnSend: false,
      autoRespondToPing: true,
      heartbeatInterval: 30000
    };
  }
}

/**
 * 全局WebSocket mock设置
 */
export function setupGlobalWebSocketMock(options?: MockWebSocketOptions): void {
  (global as any).WebSocket = class extends MockWebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, options);
    }
  };
}

/**
 * 恢复原始WebSocket
 */
export function restoreGlobalWebSocket(): void {
  delete (global as any).WebSocket;
}