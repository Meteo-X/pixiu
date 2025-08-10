/**
 * 重构后的Binance适配器单元测试
 * 测试重构后的BinanceAdapter与框架的集成
 */

import { BinanceAdapter, createBinanceAdapter, BinanceConfig } from '../src';
import { BinanceConnectionManager } from '../src/connection/binance-connection-manager';
import { globalCache } from '@pixiu/shared-core';
import { DataType, AdapterStatus, ConnectionState } from '@pixiu/adapter-base';
import { EventEmitter } from 'events';

// Mock WebSocket for testing
class MockWebSocket extends EventEmitter {
  public readyState = 0;
  public url = '';
  
  constructor(url: string) {
    super();
    this.url = url;
  }
  
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  
  send(data: string) {
    // Mock send
  }
  
  mockConnect() {
    this.readyState = 1;
    this.emit('open');
  }
  
  mockError(error: Error) {
    this.emit('error', error);
  }
  
  mockMessage(data: any) {
    this.emit('message', { data: JSON.stringify(data) });
  }
}

// Mock全局WebSocket
(global as any).WebSocket = MockWebSocket;

describe('重构后的BinanceAdapter', () => {
  let adapter: BinanceAdapter;
  let mockConfig: BinanceConfig;

  beforeEach(() => {
    mockConfig = createMockConfig({
      exchange: 'binance',
      endpoints: {
        ws: 'wss://stream.binance.com:9443/ws',
        rest: 'https://api.binance.com/api'
      },
      binance: {
        testnet: false,
        autoManageStreams: true
      }
    });

    adapter = new BinanceAdapter();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.destroy();
    }
  });

  describe('框架集成和初始化', () => {
    it('应该正确使用BaseAdapter框架', async () => {
      await adapter.initialize(mockConfig);
      
      expect(adapter.exchange).toBe('binance');
      expect(adapter.getStatus()).toBe(AdapterStatus.INITIALIZED);
      
      // 验证连接管理器已创建
      const connectionManager = (adapter as any).connectionManager;
      expect(connectionManager).toBeDefined();
      expect(connectionManager).toBeInstanceOf(BinanceConnectionManager);
    });

    it('应该验证Binance特定配置参数', async () => {
      const invalidConfigs = [
        // 缺少endpoints
        { ...mockConfig, endpoints: undefined },
        // 缺少ws endpoint
        { ...mockConfig, endpoints: { rest: 'https://api.binance.com' } },
        // 缺少rest endpoint
        { ...mockConfig, endpoints: { ws: 'wss://stream.binance.com:9443/ws' } }
      ];

      for (const config of invalidConfigs) {
        await expect(adapter.initialize(config as any)).rejects.toThrow();
      }
    });

    it('应该正确处理初始化时的流配置', async () => {
      const configWithStreams = {
        ...mockConfig,
        subscription: {
          symbols: ['BTC/USDT', 'ETH/USDT'],
          dataTypes: [DataType.TRADE, DataType.TICKER]
        }
      };

      await adapter.initialize(configWithStreams);
      
      // 验证初始化事件被发出
      const emitSpy = jest.spyOn(adapter, 'emit');
      await adapter.initialize(configWithStreams);
      expect(emitSpy).toHaveBeenCalledWith('initialized');
    });
  });

  describe('连接管理集成', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('应该正确使用BinanceConnectionManager建立连接', async () => {
      const connectPromise = adapter.connect();
      
      // 模拟WebSocket连接成功
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) {
          ws.mockConnect();
        }
      });
      
      await connectPromise;
      
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      
      const connectionManager = (adapter as any).connectionManager;
      expect(connectionManager.isConnected()).toBe(true);
      expect(connectionManager.getState()).toBe(ConnectionState.CONNECTED);
    });

    it('应该能够断开连接并清理资源', async () => {
      // 先建立连接
      const connectPromise = adapter.connect();
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) ws.mockConnect();
      });
      await connectPromise;
      
      // 断开连接
      await adapter.disconnect();
      
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
      
      const connectionManager = (adapter as any).connectionManager;
      expect(connectionManager.isConnected()).toBe(false);
    });

    it('应该处理连接错误', async () => {
      const connectPromise = adapter.connect();
      
      // 模拟连接错误
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) {
          ws.mockError(new Error('Connection failed'));
        }
      });
      
      await expect(connectPromise).rejects.toThrow('Connection failed');
      expect(adapter.getStatus()).toBe(AdapterStatus.ERROR);
    });
  });

  describe('订阅管理与流管理集成', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      
      // 建立连接
      const connectPromise = adapter.connect();
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) ws.mockConnect();
      });
      await connectPromise;
    });

    it('应该正确创建订阅并添加到BinanceConnectionManager', async () => {
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        dataTypes: [DataType.TRADE]
      });

      expect(subscriptions).toHaveLength(2);
      
      // 验证订阅信息
      expect(subscriptions[0]).toMatchObject({
        symbol: 'BTC/USDT',
        dataType: DataType.TRADE,
        active: true
      });
      expect(subscriptions[1]).toMatchObject({
        symbol: 'ETH/USDT', 
        dataType: DataType.TRADE,
        active: true
      });
      
      // 验证流已添加到连接管理器
      const connectionManager = (adapter as any).binanceConnectionManager;
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toContain('btcusdt@trade');
      expect(activeStreams).toContain('ethusdt@trade');
    });

    it('应该支持多种数据类型订阅', async () => {
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER, DataType.KLINE_1M, DataType.KLINE_5M]
      });

      expect(subscriptions).toHaveLength(4);
      
      // 验证流名称构建正确
      const connectionManager = (adapter as any).binanceConnectionManager;
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toContain('btcusdt@trade');
      expect(activeStreams).toContain('btcusdt@ticker');
      expect(activeStreams).toContain('btcusdt@kline_1m');
      expect(activeStreams).toContain('btcusdt@kline_5m');
    });

    it('应该正确移除订阅和流', async () => {
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        dataTypes: [DataType.TRADE]
      });

      // 移除一个订阅
      await adapter.unsubscribe([subscriptions[0].id]);
      
      const activeSubscriptions = adapter.getSubscriptions();
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].symbol).toBe('ETH/USDT');
      
      // 验证对应的流也被移除
      const connectionManager = (adapter as any).binanceConnectionManager;
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).not.toContain('btcusdt@trade');
      expect(activeStreams).toContain('ethusdt@trade');
    });

    it('应该支持批量取消所有订阅', async () => {
      await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER]
      });

      // 验证订阅已创建
      expect(adapter.getSubscriptions()).toHaveLength(6);
      
      // 取消所有订阅
      await adapter.unsubscribeAll();
      
      expect(adapter.getSubscriptions()).toHaveLength(0);
      
      // 验证所有流都被移除
      const connectionManager = (adapter as any).binanceConnectionManager;
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(0);
    });

    it('应该正确处理重复订阅', async () => {
      // 第一次订阅
      const firstSubscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });
      
      // 再次订阅相同内容
      const secondSubscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });
      
      // 应该有两个不同的订阅ID
      expect(firstSubscriptions[0].id).not.toBe(secondSubscriptions[0].id);
      
      // 但流不应该重复添加（这由BinanceConnectionManager处理）
      const connectionManager = (adapter as any).binanceConnectionManager;
      const activeStreams = connectionManager.getActiveStreams();
      const tradeStreams = activeStreams.filter((stream: string) => stream === 'btcusdt@trade');
      expect(tradeStreams).toHaveLength(1);
    });
  });

  describe('消息解析和数据处理', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('应该正确解析Binance Combined Stream交易数据', () => {
      const mockMessage = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: 1699123456789,
          s: 'BTCUSDT',
          t: 12345,
          p: '50000.00',
          q: '0.1',
          T: 1699123456789,
          m: false // buyer是taker，所以是buy订单
        }
      };

      const result = (adapter as any).parseMessage(mockMessage);

      expect(result).toMatchObject({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        type: DataType.TRADE,
        timestamp: 1699123456789,
        data: {
          id: '12345',
          price: 50000,
          quantity: 0.1,
          side: 'buy',
          timestamp: 1699123456789
        }
      });
      expect(result.receivedAt).toBeCloseTo(Date.now(), -2);
    });

    it('应该正确解析24小时行情数据', () => {
      const mockMessage = {
        stream: 'btcusdt@ticker',
        data: {
          e: '24hrTicker',
          E: 1699123456789,
          s: 'BTCUSDT',
          c: '50000.00',    // 最新价格
          b: '49999.00',    // 最佳买价
          a: '50001.00',    // 最佳卖价
          P: '2.5',         // 24小时价格变化百分比
          v: '1000.0',      // 24小时成交量
          h: '51000.00',    // 24小时最高价
          l: '49000.00'     // 24小时最低价
        }
      };

      const result = (adapter as any).parseMessage(mockMessage);

      expect(result).toMatchObject({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        type: DataType.TICKER,
        timestamp: 1699123456789,
        data: {
          lastPrice: 50000,
          bidPrice: 49999,
          askPrice: 50001,
          change24h: 2.5,
          volume24h: 1000,
          high24h: 51000,
          low24h: 49000
        }
      });
    });

    it('应该正确解析K线数据', () => {
      const mockMessage = {
        stream: 'btcusdt@kline_1m',
        data: {
          e: 'kline',
          E: 1699123456789,
          s: 'BTCUSDT',
          k: {
            t: 1699123440000,    // 开盘时间
            T: 1699123499999,    // 收盘时间
            s: 'BTCUSDT',        // 交易对
            i: '1m',             // K线间隔
            o: '49900.00',       // 开盘价
            c: '50000.00',       // 收盘价
            h: '50100.00',       // 最高价
            l: '49850.00',       // 最低价
            v: '10.5',           // 成交量
            x: true              // 这根K线是否完结
          }
        }
      };

      const result = (adapter as any).parseMessage(mockMessage);

      expect(result).toMatchObject({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        type: DataType.KLINE_1M,
        data: {
          open: 49900,
          high: 50100,
          low: 49850,
          close: 50000,
          volume: 10.5,
          openTime: 1699123440000,
          closeTime: 1699123499999,
          interval: '1m'
        }
      });
    });

    it('应该正确映射不同的K线间隔', () => {
      const intervals = [
        { binance: '1m', expected: DataType.KLINE_1M },
        { binance: '5m', expected: DataType.KLINE_5M },
        { binance: '1h', expected: DataType.KLINE_1H },
        { binance: '1d', expected: DataType.KLINE_1D }
      ];

      intervals.forEach(({ binance, expected }) => {
        const mockMessage = {
          stream: `btcusdt@kline_${binance}`,
          data: {
            e: 'kline',
            E: 1699123456789,
            s: 'BTCUSDT',
            k: {
              i: binance,
              o: '50000.00',
              h: '50000.00',
              l: '50000.00',
              c: '50000.00',
              v: '1.0',
              t: 1699123440000,
              T: 1699123499999
            }
          }
        };

        const result = (adapter as any).parseMessage(mockMessage);
        expect(result.type).toBe(expected);
      });
    });

    it('应该正确处理sell订单（m=true）', () => {
      const mockMessage = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: 1699123456789,
          s: 'BTCUSDT',
          t: 12345,
          p: '50000.00',
          q: '0.1',
          T: 1699123456789,
          m: true // buyer是maker，所以是sell订单
        }
      };

      const result = (adapter as any).parseMessage(mockMessage);
      expect(result.data.side).toBe('sell');
    });

    it('应该忽略未知事件类型', () => {
      const mockMessage = {
        stream: 'btcusdt@unknown',
        data: {
          e: 'unknownEvent',
          s: 'BTCUSDT'
        }
      };
      
      const result = (adapter as any).parseMessage(mockMessage);
      expect(result).toBeNull();
    });

    it('应该忽略非Combined Stream格式消息', () => {
      const invalidMessages = [
        { invalid: 'message' },
        { stream: 'test', noData: true },
        { data: { e: 'trade' } }, // 缺少stream
        'invalid string message'
      ];
      
      invalidMessages.forEach(message => {
        const result = (adapter as any).parseMessage(message);
        expect(result).toBeNull();
      });
    });

    it('应该处理解析异常', () => {
      const mockMessage = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          // 缺少必需字段导致解析错误
          s: null
        }
      };

      expect(() => {
        (adapter as any).parseMessage(mockMessage);
      }).toThrow();
    });
  });

  describe('工厂函数和配置合并', () => {
    it('应该通过工厂函数创建正确配置的适配器', () => {
      const customConfig = {
        ...mockConfig,
        binance: {
          testnet: true,
          autoManageStreams: false
        }
      };
      
      const adapter = createBinanceAdapter(customConfig);
      
      expect(adapter).toBeInstanceOf(BinanceAdapter);
      expect(adapter.exchange).toBe('binance');
    });

    it('应该正确合并默认配置', () => {
      const minimalConfig = {
        endpoints: {
          ws: 'wss://custom.ws.url',
          rest: 'https://custom.rest.url'
        }
      } as BinanceConfig;
      
      const adapter = createBinanceAdapter(minimalConfig);
      
      // 验证默认值被正确设置
      expect(adapter.exchange).toBe('binance');
    });

    it('应该支持测试网配置', () => {
      const testnetConfig = {
        binance: {
          testnet: true
        }
      } as BinanceConfig;
      
      const adapter = createBinanceAdapter(testnetConfig);
      expect(adapter).toBeInstanceOf(BinanceAdapter);
    });

    it('应该处理无配置的情况', () => {
      const adapter = createBinanceAdapter();
      expect(adapter).toBeInstanceOf(BinanceAdapter);
      expect(adapter.exchange).toBe('binance');
    });
  });

  describe('工具函数和辅助方法', () => {
    it('应该正确生成HMAC-SHA256签名', () => {
      const query = 'symbol=BTCUSDT&side=BUY&type=LIMIT&quantity=1&price=50000';
      const secret = 'test-secret-key';
      
      const signature = BinanceAdapter.generateSignature(query, secret);
      
      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(64); // SHA256 hex string length
      
      // 验证签名的确定性
      const signature2 = BinanceAdapter.generateSignature(query, secret);
      expect(signature).toBe(signature2);
      
      // 验证不同输入产生不同签名
      const differentSignature = BinanceAdapter.generateSignature(query + '&test=1', secret);
      expect(signature).not.toBe(differentSignature);
    });

    it('应该正确创建Binance API认证头部', () => {
      const apiKey = 'test-api-key';
      const timestamp = 1699123456789;
      const signature = 'test-signature-hash';
      
      const headers = BinanceAdapter.createAuthHeaders(apiKey, timestamp, signature);
      
      expect(headers).toEqual({
        'X-MBX-APIKEY': apiKey,
        'X-MBX-TIMESTAMP': timestamp.toString(),
        'X-MBX-SIGNATURE': signature
      });
    });

    it('应该正确标准化交易对符号', () => {
      const testCases = [
        { input: 'BTCUSDT', expected: 'BTC/USDT' },
        { input: 'ETHUSDT', expected: 'ETH/USDT' },
        { input: 'BNBBTC', expected: 'BNB/BTC' },
        { input: 'ADAUSDC', expected: 'ADA/USDC' },
        { input: 'BTC/USDT', expected: 'BTC/USDT' }, // 已经是标准格式
        { input: 'btcusdt', expected: 'BTC/USDT' },   // 小写
      ];

      testCases.forEach(({ input, expected }) => {
        const result = (adapter as any).normalizeSymbol(input);
        expect(result).toBe(expected);
      });
    });

    it('应该正确构建流名称', () => {
      const testCases = [
        { symbol: 'BTC/USDT', dataType: DataType.TRADE, expected: 'btcusdt@trade' },
        { symbol: 'ETH/USDT', dataType: DataType.TICKER, expected: 'ethusdt@ticker' },
        { symbol: 'BNB/BTC', dataType: DataType.KLINE_1M, expected: 'bnbbtc@kline_1m' },
        { symbol: 'ADA/USDC', dataType: DataType.KLINE_5M, expected: 'adausdc@kline_5m' },
        { symbol: 'DOT/USDT', dataType: DataType.KLINE_1H, expected: 'dotusdt@kline_1h' },
        { symbol: 'LINK/USDT', dataType: DataType.KLINE_1D, expected: 'linkusdt@kline_1d' },
        { symbol: 'UNI/USDT', dataType: DataType.DEPTH, expected: 'uniusdt@depth' },
        { symbol: 'SUSHI/USDT', dataType: DataType.ORDER_BOOK, expected: 'sushiusdt@depth20@100ms' }
      ];

      testCases.forEach(({ symbol, dataType, expected }) => {
        const result = (adapter as any).buildStreamName(symbol, dataType);
        expect(result).toBe(expected);
      });
    });

    it('应该拒绝不支持的数据类型', () => {
      expect(() => {
        (adapter as any).buildStreamName('BTC/USDT', 'unsupported_type');
      }).toThrow('Unsupported data type');
    });

    it('应该拒绝不支持的K线间隔', () => {
      expect(() => {
        (adapter as any).mapInterval('15m'); // 不支持的间隔
      }).toThrow('Unsupported interval');
    });
  });

  describe('流名称与订阅ID映射', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      
      const connectPromise = adapter.connect();
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) ws.mockConnect();
      });
      await connectPromise;
    });

    it('应该正确维护订阅ID到流名称的映射', async () => {
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER]
      });

      // 验证streamMap被正确创建
      const streamMap = (adapter as any).streamMap;
      expect(streamMap.size).toBe(4);
      
      subscriptions.forEach(sub => {
        expect(streamMap.has(sub.id)).toBe(true);
        const streamName = streamMap.get(sub.id);
        expect(streamName).toBeTruthy();
        
        // 验证流名称格式正确
        if (sub.dataType === DataType.TRADE) {
          expect(streamName).toMatch(/@trade$/);
        } else if (sub.dataType === DataType.TICKER) {
          expect(streamName).toMatch(/@ticker$/);
        }
      });
    });

    it('应该在取消订阅时清理映射', async () => {
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      const streamMap = (adapter as any).streamMap;
      expect(streamMap.size).toBe(1);
      
      await adapter.unsubscribe([subscriptions[0].id]);
      
      expect(streamMap.size).toBe(0);
    });
  });
});

// 清理全局缓存以确保Jest正常退出
afterAll(() => {
  globalCache.destroy();
});

// 测试工具函数
function createMockConfig(overrides: Partial<BinanceConfig> = {}): BinanceConfig {
  return {
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
    },
    ...overrides
  } as BinanceConfig;
}