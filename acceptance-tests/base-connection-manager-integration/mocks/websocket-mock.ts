/**
 * WebSocket Mock实现
 * 用于模拟WebSocket连接行为进行测试
 */

import { EventEmitter } from 'events';

export enum MockWebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3
}

export interface MockWebSocketOptions {
  /** 连接延迟 (ms) */
  connectDelay?: number;
  /** 是否模拟连接失败 */
  shouldFail?: boolean;
  /** 连接失败延迟 (ms) */
  failDelay?: number;
  /** 错误信息 */
  errorMessage?: string;
  /** 是否自动响应ping */
  autoRespondToPing?: boolean;
  /** ping响应延迟 (ms) */
  pingResponseDelay?: number;
  /** 消息发送延迟 (ms) */
  messageDelay?: number;
  /** 模拟网络不稳定 */
  simulateNetworkIssues?: boolean;
  /** 网络问题概率 (0-1) */
  networkIssuesProbability?: number;
}

export class MockWebSocket extends EventEmitter {
  public readyState: MockWebSocketState = MockWebSocketState.CONNECTING;
  public url: string;
  public protocol: string = '';
  public extensions: string = '';
  public bufferedAmount: number = 0;
  
  private options: MockWebSocketOptions;
  private connectTimer?: NodeJS.Timeout;
  private messageQueue: Array<{ data: any; timestamp: number }> = [];
  private bytesSent: number = 0;
  private bytesReceived: number = 0;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;
  private connected: boolean = false;

  constructor(url: string, protocols?: string | string[], options: MockWebSocketOptions = {}) {
    super();
    this.url = url;
    this.options = {
      connectDelay: 100,
      shouldFail: false,
      failDelay: 500,
      autoRespondToPing: true,
      pingResponseDelay: 50,
      messageDelay: 10,
      simulateNetworkIssues: false,
      networkIssuesProbability: 0.1,
      ...options
    };
    
    // 模拟连接过程
    this.simulateConnection();
  }

  /**
   * 发送数据
   */
  send(data: string | Buffer | ArrayBuffer): void {
    if (this.readyState !== MockWebSocketState.OPEN) {
      throw new Error('WebSocket is not open');
    }

    // 模拟网络问题
    if (this.shouldSimulateNetworkIssue()) {
      this.emit('error', new Error('Network issue: message send failed'));
      return;
    }

    const size = Buffer.byteLength(data as any);
    this.bytesSent += size;
    this.messagesSent++;

    // 模拟发送延迟
    setTimeout(() => {
      this.emit('messageSent', { data, size, timestamp: Date.now() });
    }, this.options.messageDelay);
  }

  /**
   * 关闭连接
   */
  close(code: number = 1000, reason: string = 'Normal closure'): void {
    if (this.readyState === MockWebSocketState.CLOSING || this.readyState === MockWebSocketState.CLOSED) {
      return;
    }

    this.readyState = MockWebSocketState.CLOSING;
    
    setTimeout(() => {
      this.readyState = MockWebSocketState.CLOSED;
      this.connected = false;
      this.emit('close', code, Buffer.from(reason));
    }, 50);
  }

  /**
   * 发送ping
   */
  ping(data?: Buffer, mask?: boolean, callback?: (error?: Error) => void): void {
    if (this.readyState !== MockWebSocketState.OPEN) {
      const error = new Error('WebSocket is not open');
      if (callback) callback(error);
      return;
    }

    if (callback) callback();

    // 模拟自动pong响应
    if (this.options.autoRespondToPing) {
      setTimeout(() => {
        this.emit('pong', data || Buffer.alloc(0));
      }, this.options.pingResponseDelay);
    }
  }

  /**
   * 发送pong
   */
  pong(data?: Buffer, mask?: boolean, callback?: (error?: Error) => void): void {
    if (this.readyState !== MockWebSocketState.OPEN) {
      const error = new Error('WebSocket is not open');
      if (callback) callback(error);
      return;
    }

    if (callback) callback();
  }

  /**
   * 终止连接
   */
  terminate(): void {
    this.readyState = MockWebSocketState.CLOSED;
    this.connected = false;
    this.removeAllListeners();
    
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
  }

  /**
   * 模拟接收消息
   */
  simulateMessage(data: any): void {
    if (this.readyState !== MockWebSocketState.OPEN) {
      return;
    }

    const size = Buffer.byteLength(JSON.stringify(data));
    this.bytesReceived += size;
    this.messagesReceived++;
    
    this.messageQueue.push({ data, timestamp: Date.now() });
    
    setTimeout(() => {
      this.emit('message', Buffer.from(JSON.stringify(data)));
    }, this.options.messageDelay);
  }

  /**
   * 模拟连接错误
   */
  simulateError(error?: Error): void {
    const errorToEmit = error || new Error(this.options.errorMessage || 'Mock WebSocket error');
    this.emit('error', errorToEmit);
  }

  /**
   * 模拟连接中断
   */
  simulateDisconnect(code: number = 1006, reason: string = 'Connection lost'): void {
    this.readyState = MockWebSocketState.CLOSED;
    this.connected = false;
    this.emit('close', code, Buffer.from(reason));
  }

  /**
   * 获取连接统计
   */
  getStats(): {
    bytesSent: number;
    bytesReceived: number;
    messagesSent: number;
    messagesReceived: number;
    connected: boolean;
    readyState: MockWebSocketState;
    messageQueueLength: number;
  } {
    return {
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      connected: this.connected,
      readyState: this.readyState,
      messageQueueLength: this.messageQueue.length
    };
  }

  /**
   * 重置统计数据
   */
  resetStats(): void {
    this.bytesSent = 0;
    this.bytesReceived = 0;
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.messageQueue = [];
  }

  /**
   * 模拟连接过程
   */
  private simulateConnection(): void {
    const delay = this.options.shouldFail ? this.options.failDelay! : this.options.connectDelay!;
    
    this.connectTimer = setTimeout(() => {
      if (this.options.shouldFail) {
        this.readyState = MockWebSocketState.CLOSED;
        this.emit('error', new Error(this.options.errorMessage || 'Connection failed'));
      } else {
        this.readyState = MockWebSocketState.OPEN;
        this.connected = true;
        this.emit('open');
      }
    }, delay);
  }

  /**
   * 判断是否应该模拟网络问题
   */
  private shouldSimulateNetworkIssue(): boolean {
    return this.options.simulateNetworkIssues! && 
           Math.random() < this.options.networkIssuesProbability!;
  }
}

/**
 * Mock WebSocket构造函数
 */
export function createMockWebSocket(options: MockWebSocketOptions = {}) {
  return class extends MockWebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, options);
    }
  };
}

/**
 * WebSocket Mock工厂
 */
export class WebSocketMockFactory {
  private mocks = new Map<string, MockWebSocket>();
  private defaultOptions: MockWebSocketOptions = {};

  /**
   * 设置默认选项
   */
  setDefaultOptions(options: MockWebSocketOptions): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * 创建Mock WebSocket
   */
  create(url: string, options: MockWebSocketOptions = {}): MockWebSocket {
    const finalOptions = { ...this.defaultOptions, ...options };
    const mock = new MockWebSocket(url, undefined, finalOptions);
    this.mocks.set(url, mock);
    return mock;
  }

  /**
   * 获取已创建的Mock
   */
  get(url: string): MockWebSocket | undefined {
    return this.mocks.get(url);
  }

  /**
   * 清理所有Mock
   */
  cleanup(): void {
    for (const mock of this.mocks.values()) {
      mock.terminate();
    }
    this.mocks.clear();
  }

  /**
   * 获取所有Mock的统计信息
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [url, mock] of this.mocks) {
      stats[url] = mock.getStats();
    }
    return stats;
  }
}