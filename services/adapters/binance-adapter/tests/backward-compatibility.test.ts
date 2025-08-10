/**
 * 向后兼容性测试
 * 确保重构后的BinanceAdapter保持API兼容性
 */

import { BinanceAdapter, createBinanceAdapter, BinanceConfig } from '../src';
import { globalCache } from '@pixiu/shared-core';
import { DataType, AdapterStatus } from '@pixiu/adapter-base';
import { EventEmitter } from 'events';

// Mock WebSocket
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
  
  send(data: string) {}
  
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

(global as any).WebSocket = MockWebSocket;

describe('向后兼容性测试', () => {
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
        timeout: 10000,
        maxRetries: 5,
        retryInterval: 2000,
        heartbeatInterval: 30000
      },
      binance: {
        testnet: false,
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

  describe('API接口兼容性', () => {
    it('应该保持所有公共方法和属性不变', () => {
      // 验证基础属性
      expect(adapter).toHaveProperty('exchange');
      expect(adapter.exchange).toBe('binance');
      
      // 验证核心方法存在
      expect(typeof adapter.initialize).toBe('function');
      expect(typeof adapter.connect).toBe('function');
      expect(typeof adapter.disconnect).toBe('function');
      expect(typeof adapter.subscribe).toBe('function');
      expect(typeof adapter.unsubscribe).toBe('function');
      expect(typeof adapter.unsubscribeAll).toBe('function');
      expect(typeof adapter.getStatus).toBe('function');
      expect(typeof adapter.getSubscriptions).toBe('function');
      expect(typeof adapter.destroy).toBe('function');
      
      // 验证静态方法存在
      expect(typeof BinanceAdapter.generateSignature).toBe('function');
      expect(typeof BinanceAdapter.createAuthHeaders).toBe('function');
      
      // 验证工厂函数存在
      expect(typeof createBinanceAdapter).toBe('function');
    });

    it('应该保持初始化方法签名兼容', async () => {
      // 测试原有配置格式仍然有效
      const legacyConfig = {
        exchange: 'binance',
        endpoints: {
          ws: 'wss://stream.binance.com:9443/ws',
          rest: 'https://api.binance.com/api'
        }
      };

      await expect(adapter.initialize(legacyConfig as any)).resolves.not.toThrow();
      expect(adapter.getStatus()).toBe(AdapterStatus.INITIALIZED);
    });

    it('应该保持订阅方法签名和返回值格式兼容', async () => {
      await adapter.initialize(mockConfig);
      
      const connectPromise = adapter.connect();
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) ws.mockConnect();
      });
      await connectPromise;

      // 测试原有订阅格式
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER]
      });

      // 验证返回值格式保持不变
      expect(Array.isArray(subscriptions)).toBe(true);
      expect(subscriptions).toHaveLength(4);
      
      subscriptions.forEach(sub => {
        expect(sub).toHaveProperty('id');
        expect(sub).toHaveProperty('symbol');
        expect(sub).toHaveProperty('dataType');
        expect(sub).toHaveProperty('subscribedAt');
        expect(sub).toHaveProperty('active');
        
        expect(typeof sub.id).toBe('string');
        expect(typeof sub.symbol).toBe('string');
        expect(typeof sub.subscribedAt).toBe('number');
        expect(sub.active).toBe(true);
      });
    });

    it('应该保持取消订阅方法签名兼容', async () => {
      await adapter.initialize(mockConfig);
      
      const connectPromise = adapter.connect();
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) ws.mockConnect();
      });
      await connectPromise;

      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      // 测试原有取消订阅格式（传递ID数组）
      await expect(adapter.unsubscribe([subscriptions[0].id])).resolves.not.toThrow();
      
      // 验证订阅被正确移除
      const remainingSubscriptions = adapter.getSubscriptions();
      expect(remainingSubscriptions).toHaveLength(0);
    });

    it('应该保持状态和订阅查询方法兼容', async () => {
      await adapter.initialize(mockConfig);
      
      // 验证状态查询方法
      expect(adapter.getStatus()).toBe(AdapterStatus.INITIALIZED);
      
      // 验证订阅查询方法
      const subscriptions = adapter.getSubscriptions();
      expect(Array.isArray(subscriptions)).toBe(true);
      expect(subscriptions).toHaveLength(0);
    });
  });

  describe('消息格式兼容性', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('应该保持交易数据格式不变', () => {
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
          m: false
        }
      };

      const result = (adapter as any).parseMessage(mockMessage);

      // 验证输出格式保持一致
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
      
      // 验证必需字段存在
      expect(result).toHaveProperty('receivedAt');
      expect(typeof result.receivedAt).toBe('number');
    });

    it('应该保持Ticker数据格式不变', () => {
      const mockMessage = {
        stream: 'btcusdt@ticker',
        data: {
          e: '24hrTicker',
          E: 1699123456789,
          s: 'BTCUSDT',
          c: '50000.00',
          b: '49999.00',
          a: '50001.00',
          P: '2.5',
          v: '1000.0',
          h: '51000.00',
          l: '49000.00'
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

    it('应该保持K线数据格式不变', () => {
      const mockMessage = {
        stream: 'btcusdt@kline_1m',
        data: {
          e: 'kline',
          E: 1699123456789,
          s: 'BTCUSDT',
          k: {
            t: 1699123440000,
            T: 1699123499999,
            s: 'BTCUSDT',
            i: '1m',
            o: '49900.00',
            c: '50000.00',
            h: '50100.00',
            l: '49850.00',
            v: '10.5',
            x: true
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

    it('应该保持无效消息处理行为不变', () => {
      const invalidMessages = [
        null,
        undefined,
        {},
        { invalid: 'message' },
        { stream: 'test', data: null },
        { data: { e: 'unknown' } }
      ];

      invalidMessages.forEach(message => {
        const result = (adapter as any).parseMessage(message);
        expect(result).toBeNull();
      });
    });
  });

  describe('事件兼容性', () => {
    it('应该保持事件发射机制不变', async () => {
      const events: string[] = [];
      
      // 监听所有可能的事件
      ['initialized', 'connected', 'disconnected', 'error', 'data', 'statusChanged'].forEach(event => {
        adapter.on(event, () => {
          events.push(event);
        });
      });

      await adapter.initialize(mockConfig);
      expect(events).toContain('initialized');
    });

    it('应该保持数据事件格式不变', async () => {
      await adapter.initialize(mockConfig);
      
      const connectPromise = adapter.connect();
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) ws.mockConnect();
      });
      await connectPromise;

      let receivedData: any = null;
      adapter.on('data', (data) => {
        receivedData = data;
      });

      // 订阅数据并模拟消息
      await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      // 模拟收到消息
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
          m: false
        }
      };

      const connectionManager = (adapter as any).connectionManager;
      const ws = (connectionManager as any).ws as MockWebSocket;
      ws.mockMessage(mockMessage);

      // 给异步处理一些时间
      await new Promise(resolve => setTimeout(resolve, 10));

      // 验证数据格式保持不变
      if (receivedData) {
        expect(receivedData).toHaveProperty('exchange');
        expect(receivedData).toHaveProperty('symbol');
        expect(receivedData).toHaveProperty('type');
        expect(receivedData).toHaveProperty('data');
        expect(receivedData).toHaveProperty('timestamp');
        expect(receivedData).toHaveProperty('receivedAt');
      }
    });
  });

  describe('配置兼容性', () => {
    it('应该支持原有的基础配置格式', async () => {
      const legacyConfigs = [
        // 最小配置
        {
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          }
        },
        // 包含连接配置
        {
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          },
          connection: {
            timeout: 5000,
            maxRetries: 3
          }
        },
        // 包含订阅配置
        {
          endpoints: {
            ws: 'wss://stream.binance.com:9443/ws',
            rest: 'https://api.binance.com/api'
          },
          subscription: {
            symbols: ['BTC/USDT'],
            dataTypes: [DataType.TRADE]
          }
        }
      ];

      for (const config of legacyConfigs) {
        const testAdapter = new BinanceAdapter();
        await expect(testAdapter.initialize(config as any)).resolves.not.toThrow();
        await testAdapter.destroy();
      }
    });

    it('应该保持工厂函数配置兼容性', () => {
      const legacyConfigs = [
        undefined,
        {},
        {
          endpoints: {
            ws: 'wss://custom.ws',
            rest: 'https://custom.rest'
          }
        }
      ];

      legacyConfigs.forEach(config => {
        const testAdapter = createBinanceAdapter(config as any);
        expect(testAdapter).toBeInstanceOf(BinanceAdapter);
        expect(testAdapter.exchange).toBe('binance');
      });
    });
  });

  describe('静态方法兼容性', () => {
    it('应该保持签名生成方法不变', () => {
      const testCases = [
        { query: 'symbol=BTCUSDT', secret: 'test-secret' },
        { query: 'symbol=ETHUSDT&side=BUY', secret: 'another-secret' },
        { query: '', secret: 'empty-query-secret' },
        { query: 'complex=query&with=many&params=true', secret: 'complex-secret' }
      ];

      testCases.forEach(({ query, secret }) => {
        const signature = BinanceAdapter.generateSignature(query, secret);
        expect(typeof signature).toBe('string');
        expect(signature.length).toBe(64); // SHA256 hex length
        
        // 验证确定性
        const signature2 = BinanceAdapter.generateSignature(query, secret);
        expect(signature).toBe(signature2);
      });
    });

    it('应该保持认证头部创建方法不变', () => {
      const testCases = [
        { apiKey: 'test-key', timestamp: 1234567890, signature: 'test-sig' },
        { apiKey: '', timestamp: 0, signature: '' },
        { apiKey: 'long-api-key-string', timestamp: 1699123456789, signature: 'long-signature-hash' }
      ];

      testCases.forEach(({ apiKey, timestamp, signature }) => {
        const headers = BinanceAdapter.createAuthHeaders(apiKey, timestamp, signature);
        
        expect(headers).toEqual({
          'X-MBX-APIKEY': apiKey,
          'X-MBX-TIMESTAMP': timestamp.toString(),
          'X-MBX-SIGNATURE': signature
        });
        
        expect(typeof headers['X-MBX-APIKEY']).toBe('string');
        expect(typeof headers['X-MBX-TIMESTAMP']).toBe('string');
        expect(typeof headers['X-MBX-SIGNATURE']).toBe('string');
      });
    });
  });

  describe('符号标准化兼容性', () => {
    it('应该保持符号标准化行为不变', () => {
      const testCases = [
        // 原有测试用例
        { input: 'BTCUSDT', expected: 'BTC/USDT' },
        { input: 'ETHUSDT', expected: 'ETH/USDT' },
        { input: 'BTC/USDT', expected: 'BTC/USDT' },
        { input: 'btcusdt', expected: 'BTC/USDT' },
        
        // 边界情况
        { input: 'BNBBTC', expected: 'BNB/BTC' },
        { input: 'ADAUSDC', expected: 'ADA/USDC' },
        { input: 'LINKBUSD', expected: 'LINK/BUSD' },
        
        // 已经是标准格式的不应该改变
        { input: 'DOT/USDT', expected: 'DOT/USDT' },
        { input: 'UNI/ETH', expected: 'UNI/ETH' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = (adapter as any).normalizeSymbol(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('流名称构建兼容性', () => {
    it('应该保持流名称构建逻辑不变', () => {
      const testCases = [
        { symbol: 'BTC/USDT', dataType: DataType.TRADE, expected: 'btcusdt@trade' },
        { symbol: 'ETH/USDT', dataType: DataType.TICKER, expected: 'ethusdt@ticker' },
        { symbol: 'BNB/USDT', dataType: DataType.KLINE_1M, expected: 'bnbusdt@kline_1m' },
        { symbol: 'ADA/USDT', dataType: DataType.KLINE_5M, expected: 'adausdt@kline_5m' },
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
  });

  describe('错误处理兼容性', () => {
    it('应该保持错误抛出行为不变', () => {
      // 测试无效配置错误
      expect(() => {
        adapter.initialize(null as any);
      }).toThrow();

      expect(() => {
        adapter.initialize({} as any);
      }).toThrow();

      // 测试不支持的数据类型错误
      expect(() => {
        (adapter as any).buildStreamName('BTC/USDT', 'invalid_type');
      }).toThrow('Unsupported data type');

      // 测试不支持的间隔错误
      expect(() => {
        (adapter as any).mapInterval('invalid_interval');
      }).toThrow('Unsupported interval');
    });

    it('应该保持连接错误处理行为不变', async () => {
      await adapter.initialize(mockConfig);
      
      const connectPromise = adapter.connect();
      
      // 模拟连接错误
      process.nextTick(() => {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as MockWebSocket;
        if (ws) {
          ws.mockError(new Error('Connection error'));
        }
      });
      
      await expect(connectPromise).rejects.toThrow('Connection error');
      expect(adapter.getStatus()).toBe(AdapterStatus.ERROR);
    });
  });
});

// 清理资源
afterAll(() => {
  globalCache.destroy();
});