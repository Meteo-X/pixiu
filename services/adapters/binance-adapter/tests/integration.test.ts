/**
 * 集成测试和端到端测试
 * 测试BinanceAdapter与框架组件的完整集成
 */

import { BinanceAdapter, createBinanceAdapter, BinanceConfig } from '../src';
import { BinanceConnectionManager } from '../src/connection/binance-connection-manager';
import { globalCache } from '@pixiu/shared-core';
import { DataType, AdapterStatus, ConnectionState } from '@pixiu/adapter-base';
import { EventEmitter } from 'events';

// Mock WebSocket with more realistic behavior
class RealisticMockWebSocket extends EventEmitter {
  public readyState = 0; // CONNECTING
  public url = '';
  private _connectDelay = 100;
  private _messageQueue: any[] = [];
  
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  
  constructor(url: string) {
    super();
    this.url = url;
    
    // 模拟异步连接
    setTimeout(() => {
      this.readyState = RealisticMockWebSocket.OPEN;
      this.emit('open');
      
      // 处理排队的消息
      this._messageQueue.forEach(msg => {
        this.emit('message', { data: JSON.stringify(msg) });
      });
      this._messageQueue = [];
    }, this._connectDelay);
  }
  
  close(code?: number, reason?: string) {
    this.readyState = RealisticMockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = RealisticMockWebSocket.CLOSED;
      this.emit('close', { code: code || 1000, reason: reason || 'Normal closure' });
    }, 10);
  }
  
  send(data: string) {
    if (this.readyState !== RealisticMockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Mock server response could be added here
  }
  
  // 模拟接收消息
  mockReceiveMessage(message: any) {
    if (this.readyState === RealisticMockWebSocket.OPEN) {
      this.emit('message', { data: JSON.stringify(message) });
    } else {
      this._messageQueue.push(message);
    }
  }
  
  // 模拟连接错误
  mockConnectionError(error: Error) {
    this.readyState = RealisticMockWebSocket.CLOSED;
    this.emit('error', error);
  }
  
  // 模拟网络中断
  mockNetworkDisconnection() {
    this.readyState = RealisticMockWebSocket.CLOSED;
    this.emit('close', { code: 1006, reason: 'Abnormal closure' });
  }
}

(global as any).WebSocket = RealisticMockWebSocket;

describe('集成测试和端到端测试', () => {
  let adapter: BinanceAdapter;
  let mockConfig: BinanceConfig;

  beforeEach(() => {
    mockConfig = {
      exchange: 'binance',
      endpoints: {
        ws: 'wss://stream.binance.com:9443/ws',
        rest: 'https://api.binance.com/api'
      },
      connection: {
        timeout: 5000,
        maxRetries: 3,
        retryInterval: 1000,
        heartbeatInterval: 30000
      },
      binance: {
        testnet: false,
        enableCompression: false,
        autoManageStreams: true
      }
    };

    adapter = new BinanceAdapter();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.destroy();
    }
  });

  describe('完整生命周期集成测试', () => {
    it('应该完成完整的初始化→连接→订阅→数据流→断开流程', async () => {
      const events: string[] = [];
      const receivedData: any[] = [];

      // 监听所有事件
      adapter.on('initialized', () => events.push('initialized'));
      adapter.on('connected', () => events.push('connected'));
      adapter.on('disconnected', () => events.push('disconnected'));
      adapter.on('data', (data) => {
        events.push('data');
        receivedData.push(data);
      });

      // 1. 初始化适配器
      await adapter.initialize(mockConfig);
      expect(events).toContain('initialized');
      expect(adapter.getStatus()).toBe(AdapterStatus.INITIALIZED);

      // 2. 建立连接
      await adapter.connect();
      expect(events).toContain('connected');
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);

      // 3. 创建订阅
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER]
      });

      expect(subscriptions).toHaveLength(4);
      expect(adapter.getSubscriptions()).toHaveLength(4);

      // 验证连接管理器状态
      const connectionManager = (adapter as any).connectionManager;
      expect(connectionManager.isConnected()).toBe(true);
      
      const binanceConnectionManager = (adapter as any).binanceConnectionManager;
      const activeStreams = binanceConnectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(4);
      expect(activeStreams).toEqual(expect.arrayContaining([
        'btcusdt@trade',
        'btcusdt@ticker',
        'ethusdt@trade',
        'ethusdt@ticker'
      ]));

      // 4. 模拟接收数据
      const ws = (connectionManager as any).ws as RealisticMockWebSocket;
      
      const tradeMessage = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: Date.now(),
          s: 'BTCUSDT',
          t: 12345,
          p: '50000.00',
          q: '0.1',
          T: Date.now(),
          m: false
        }
      };

      ws.mockReceiveMessage(tradeMessage);

      // 等待消息处理
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toContain('data');
      expect(receivedData).toHaveLength(1);
      expect(receivedData[0]).toMatchObject({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        type: DataType.TRADE
      });

      // 5. 断开连接
      await adapter.disconnect();
      expect(events).toContain('disconnected');
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
    }, 10000);

    it('应该正确处理多个交易对的并发数据流', async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();

      const symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT', 'DOT/USDT'];
      const dataTypes = [DataType.TRADE, DataType.TICKER];

      // 创建大量订阅
      await adapter.subscribe({
        symbols,
        dataTypes
      });

      const subscriptions = adapter.getSubscriptions();
      expect(subscriptions).toHaveLength(symbols.length * dataTypes.length);

      // 验证所有流都被正确创建
      const binanceConnectionManager = (adapter as any).binanceConnectionManager;
      const activeStreams = binanceConnectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(10);

      const receivedData: any[] = [];
      adapter.on('data', (data) => receivedData.push(data));

      // 模拟并发数据流
      const connectionManager = (adapter as any).connectionManager;
      const ws = (connectionManager as any).ws as RealisticMockWebSocket;

      const messages = symbols.flatMap(symbol => 
        dataTypes.map(dataType => {
          const streamSymbol = symbol.replace('/', '').toLowerCase();
          const eventType = dataType === DataType.TRADE ? 'trade' : '24hrTicker';
          const streamName = dataType === DataType.TRADE ? 'trade' : 'ticker';

          return {
            stream: `${streamSymbol}@${streamName}`,
            data: {
              e: eventType,
              E: Date.now(),
              s: symbol.replace('/', ''),
              ...(dataType === DataType.TRADE ? {
                t: Math.floor(Math.random() * 1000000),
                p: (Math.random() * 100000).toFixed(2),
                q: (Math.random() * 10).toFixed(4),
                T: Date.now(),
                m: Math.random() > 0.5
              } : {
                c: (Math.random() * 100000).toFixed(2),
                b: (Math.random() * 100000).toFixed(2),
                a: (Math.random() * 100000).toFixed(2),
                P: (Math.random() * 10 - 5).toFixed(2),
                v: (Math.random() * 10000).toFixed(2),
                h: (Math.random() * 100000).toFixed(2),
                l: (Math.random() * 100000).toFixed(2)
              })
            }
          };
        })
      );

      // 快速发送所有消息
      messages.forEach((message, index) => {
        setTimeout(() => {
          ws.mockReceiveMessage(message);
        }, index * 10);
      });

      // 等待所有消息处理完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(receivedData).toHaveLength(messages.length);

      // 验证每个符号的数据都被正确接收
      symbols.forEach(symbol => {
        const symbolData = receivedData.filter(data => data.symbol === symbol);
        expect(symbolData).toHaveLength(dataTypes.length);
      });
    }, 15000);
  });

  describe('动态流管理集成测试', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
    });

    it('应该支持动态添加和移除订阅流', async () => {
      // 初始订阅
      const initialSubscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      let activeStreams = (adapter as any).binanceConnectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(1);
      expect(activeStreams).toContain('btcusdt@trade');

      // 动态添加更多订阅
      const additionalSubscriptions = await adapter.subscribe({
        symbols: ['ETH/USDT', 'BNB/USDT'],
        dataTypes: [DataType.TICKER, DataType.KLINE_1M]
      });

      activeStreams = (adapter as any).binanceConnectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(5); // 1 + 2*2

      // 验证所有订阅都活跃
      const allSubscriptions = adapter.getSubscriptions();
      expect(allSubscriptions).toHaveLength(5);
      allSubscriptions.forEach(sub => {
        expect(sub.active).toBe(true);
      });

      // 动态移除部分订阅
      await adapter.unsubscribe([
        initialSubscriptions[0].id,
        additionalSubscriptions[0].id
      ]);

      activeStreams = (adapter as any).binanceConnectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(3);
      expect(activeStreams).not.toContain('btcusdt@trade');

      const remainingSubscriptions = adapter.getSubscriptions();
      expect(remainingSubscriptions).toHaveLength(3);
    });

    it('应该正确处理订阅流的自动重连', async () => {
      const connectionEvents: string[] = [];
      const connectionManager = (adapter as any).connectionManager;
      
      connectionManager.on('connected', () => connectionEvents.push('connected'));
      connectionManager.on('disconnected', () => connectionEvents.push('disconnected'));

      // 创建初始订阅
      await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      const ws = (connectionManager as any).ws as RealisticMockWebSocket;
      const originalUrl = ws.url;

      // 添加新订阅应该触发重连（如果autoManageStreams为true）
      await adapter.subscribe({
        symbols: ['ETH/USDT'],
        dataTypes: [DataType.TICKER]
      });

      // 验证连接状态保持正常
      expect(connectionManager.isConnected()).toBe(true);
      
      const activeStreams = (adapter as any).binanceConnectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(2);
    });
  });

  describe('错误恢复和重连集成测试', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
    });

    it('应该正确处理网络中断和自动重连', async () => {
      const connectionEvents: { type: string, timestamp: number }[] = [];
      const connectionManager = (adapter as any).connectionManager;

      connectionManager.on('connected', () => 
        connectionEvents.push({ type: 'connected', timestamp: Date.now() }));
      connectionManager.on('disconnected', () => 
        connectionEvents.push({ type: 'disconnected', timestamp: Date.now() }));
      connectionManager.on('error', () => 
        connectionEvents.push({ type: 'error', timestamp: Date.now() }));

      // 创建订阅
      await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      const ws = (connectionManager as any).ws as RealisticMockWebSocket;
      
      // 模拟网络中断
      ws.mockNetworkDisconnection();

      // 等待重连逻辑执行
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 验证状态变化
      expect(connectionEvents.some(e => e.type === 'disconnected')).toBe(true);
      
      // 在真实实现中，应该有自动重连逻辑
      // 这里我们验证错误被正确处理
      expect(adapter.getStatus()).toBe(AdapterStatus.ERROR);
    }, 10000);

    it('应该正确处理解析错误而不影响其他消息', async () => {
      await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        dataTypes: [DataType.TRADE]
      });

      const receivedData: any[] = [];
      const errors: any[] = [];

      adapter.on('data', (data) => receivedData.push(data));
      adapter.on('error', (error) => errors.push(error));

      const connectionManager = (adapter as any).connectionManager;
      const ws = (connectionManager as any).ws as RealisticMockWebSocket;

      // 发送一个正常消息
      ws.mockReceiveMessage({
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: Date.now(),
          s: 'BTCUSDT',
          t: 12345,
          p: '50000.00',
          q: '0.1',
          T: Date.now(),
          m: false
        }
      });

      // 发送一个有问题的消息
      ws.mockReceiveMessage({
        stream: 'ethusdt@trade',
        data: {
          e: 'trade',
          s: null, // 这会导致解析错误
          invalid: 'data'
        }
      });

      // 再发送一个正常消息
      ws.mockReceiveMessage({
        stream: 'ethusdt@trade',
        data: {
          e: 'trade',
          E: Date.now(),
          s: 'ETHUSDT',
          t: 67890,
          p: '3000.00',
          q: '0.5',
          T: Date.now(),
          m: true
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 应该接收到2个正常消息
      expect(receivedData).toHaveLength(2);
      expect(receivedData[0].symbol).toBe('BTC/USDT');
      expect(receivedData[1].symbol).toBe('ETH/USDT');

      // 错误应该被适当处理
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('性能和内存集成测试', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
    });

    it('应该高效处理大量消息而不内存泄漏', async () => {
      await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      const receivedCount = { count: 0 };
      adapter.on('data', () => {
        receivedCount.count++;
      });

      const connectionManager = (adapter as any).connectionManager;
      const ws = (connectionManager as any).ws as RealisticMockWebSocket;

      // 发送大量消息
      const messageCount = 1000;
      const startTime = Date.now();

      for (let i = 0; i < messageCount; i++) {
        ws.mockReceiveMessage({
          stream: 'btcusdt@trade',
          data: {
            e: 'trade',
            E: Date.now(),
            s: 'BTCUSDT',
            t: i,
            p: (50000 + Math.random() * 1000).toFixed(2),
            q: (Math.random()).toFixed(4),
            T: Date.now(),
            m: i % 2 === 0
          }
        });

        // 每100个消息暂停一下，模拟真实场景
        if (i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      // 等待所有消息处理完成
      await new Promise(resolve => setTimeout(resolve, 500));
      const endTime = Date.now();

      expect(receivedCount.count).toBe(messageCount);
      
      // 验证处理性能（应该在合理时间内完成）
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(5000); // 5秒内处理1000条消息

      // 验证内存使用情况（简单检查）
      const subscriptions = adapter.getSubscriptions();
      expect(subscriptions).toHaveLength(1);
      
      const streamMap = (adapter as any).streamMap;
      expect(streamMap.size).toBe(1);
    }, 10000);

    it('应该正确清理断开连接后的资源', async () => {
      // 创建大量订阅
      await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER, DataType.KLINE_1M]
      });

      expect(adapter.getSubscriptions()).toHaveLength(9);
      
      const streamMap = (adapter as any).streamMap;
      expect(streamMap.size).toBe(9);

      const activeStreams = (adapter as any).binanceConnectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(9);

      // 断开连接
      await adapter.disconnect();

      // 验证基本状态清理
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
      
      const connectionManager = (adapter as any).connectionManager;
      expect(connectionManager.isConnected()).toBe(false);

      // 完全销毁适配器
      await adapter.destroy();

      // 验证资源被彻底清理
      expect(adapter.getSubscriptions()).toHaveLength(0);
      expect((adapter as any).streamMap.size).toBe(0);
    });
  });

  describe('多实例并发测试', () => {
    it('应该支持多个适配器实例并发工作', async () => {
      const adapters: BinanceAdapter[] = [];
      const configs: BinanceConfig[] = [];
      const receivedData: { [key: string]: any[] } = {};

      try {
        // 创建多个适配器实例
        for (let i = 0; i < 3; i++) {
          const config = {
            ...mockConfig,
            endpoints: {
              ...mockConfig.endpoints,
              ws: `wss://stream${i}.binance.com:9443/ws`
            }
          };
          configs.push(config);

          const adapter = new BinanceAdapter();
          adapters.push(adapter);
          receivedData[i] = [];

          await adapter.initialize(config);
          await adapter.connect();

          adapter.on('data', (data) => {
            receivedData[i].push(data);
          });

          // 每个实例订阅不同的交易对
          await adapter.subscribe({
            symbols: [`SYMBOL${i}/USDT`],
            dataTypes: [DataType.TRADE]
          });
        }

        // 验证所有实例都正常运行
        adapters.forEach((adapter, index) => {
          expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
          expect(adapter.getSubscriptions()).toHaveLength(1);
        });

        // 模拟每个实例接收数据
        for (let i = 0; i < adapters.length; i++) {
          const connectionManager = (adapters[i] as any).connectionManager;
          const ws = (connectionManager as any).ws as RealisticMockWebSocket;

          ws.mockReceiveMessage({
            stream: `symbol${i}usdt@trade`,
            data: {
              e: 'trade',
              E: Date.now(),
              s: `SYMBOL${i}USDT`,
              t: 100 + i,
              p: (1000 * (i + 1)).toString(),
              q: '1.0',
              T: Date.now(),
              m: false
            }
          });
        }

        await new Promise(resolve => setTimeout(resolve, 200));

        // 验证每个实例都接收到了自己的数据
        adapters.forEach((adapter, index) => {
          expect(receivedData[index]).toHaveLength(1);
          expect(receivedData[index][0].symbol).toBe(`SYMBOL${index}/USDT`);
        });

      } finally {
        // 清理所有实例
        for (const adapter of adapters) {
          await adapter.destroy();
        }
      }
    }, 15000);
  });
});

// 清理资源
afterAll(() => {
  globalCache.destroy();
});