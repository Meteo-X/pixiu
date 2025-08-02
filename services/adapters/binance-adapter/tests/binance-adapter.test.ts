/**
 * Binance适配器单元测试
 */

import { BinanceAdapter, createBinanceAdapter } from '../src';
import { globalCache } from '@pixiu/shared-core';
// 暂时注释掉adapter-base的导入，因为包依赖问题
// import { DataType, AdapterStatus } from '../../../infrastructure/adapter-base/src';

// 临时定义测试需要的枚举
enum DataType {
  TRADE = 'trade',
  TICKER = 'ticker',
  KLINE_1M = 'kline_1m',
  KLINE_5M = 'kline_5m'
}

enum AdapterStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting', 
  CONNECTED = 'connected',
  ERROR = 'error'
}

describe('BinanceAdapter', () => {
  let adapter: BinanceAdapter;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = createMockConfig({
      exchange: 'binance',
      endpoints: {
        ws: 'wss://stream.binance.com:9443/ws',
        rest: 'https://api.binance.com/api'
      }
    });

    adapter = new BinanceAdapter();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.destroy();
    }
  });

  describe('初始化', () => {
    it('应该能够初始化适配器', async () => {
      await adapter.initialize(mockConfig);
      
      expect(adapter.exchange).toBe('binance');
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
    });

    it('应该验证配置参数', async () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.endpoints.ws;

      await expect(adapter.initialize(invalidConfig)).rejects.toThrow();
    });
  });

  describe('连接管理', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('应该能够建立连接', async () => {
      // Mock连接成功
      const mockConnectionManager = {
        connect: jest.fn().mockResolvedValue(undefined),
        getState: jest.fn().mockReturnValue('connected'),
        disconnect: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn()
      };

      // 替换连接管理器
      (adapter as any).connectionManager = mockConnectionManager;

      const connectPromise = adapter.connect();
      
      // 模拟连接成功事件
      const statusChangeHandler = mockConnectionManager.on.mock.calls
        .find(call => call[0] === 'connected')?.[1];
      if (statusChangeHandler) {
        statusChangeHandler();
      }

      await connectPromise;
      
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
    });

    it('应该能够断开连接', async () => {
      // 先建立连接
      (adapter as any).status = AdapterStatus.CONNECTED;
      
      await adapter.disconnect();
      
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
    });
  });

  describe('订阅管理', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      (adapter as any).status = AdapterStatus.CONNECTED;
      
      // Mock连接管理器
      const mockConnectionManager = {
        send: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(true)
      };
      (adapter as any).connectionManager = mockConnectionManager;
    });

    it('应该能够订阅数据', async () => {
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]).toMatchObject({
        symbol: 'BTC/USDT',
        dataType: DataType.TRADE,
        active: true
      });
    });

    it('应该能够取消订阅', async () => {
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      await adapter.unsubscribe([subscriptions[0].id]);
      
      const activeSubscriptions = adapter.getSubscriptions();
      expect(activeSubscriptions).toHaveLength(0);
    });

    it('应该能够取消所有订阅', async () => {
      await adapter.subscribe({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        dataTypes: [DataType.TRADE, DataType.TICKER]
      });

      await adapter.unsubscribeAll();
      
      const activeSubscriptions = adapter.getSubscriptions();
      expect(activeSubscriptions).toHaveLength(0);
    });
  });

  describe('消息解析', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('应该能够解析交易数据', () => {
      const mockMessage = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: 1234567890,
          s: 'BTCUSDT',
          t: 12345,
          p: '50000.00',
          q: '0.1',
          T: 1234567890,
          m: false
        }
      };

      const result = (adapter as any).parseMessage(mockMessage);

      expect(result).toMatchObject({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        type: DataType.TRADE,
        data: {
          id: '12345',
          price: 50000,
          quantity: 0.1,
          side: 'buy'
        }
      });
    });

    it('应该能够解析行情数据', () => {
      const mockMessage = {
        stream: 'btcusdt@ticker',
        data: {
          e: '24hrTicker',
          E: 1234567890,
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

    it('应该忽略无效消息', () => {
      const invalidMessage = { invalid: 'message' };
      
      const result = (adapter as any).parseMessage(invalidMessage);
      
      expect(result).toBeNull();
    });
  });

  describe('工厂函数', () => {
    it('应该能够通过工厂函数创建适配器', () => {
      const adapter = createBinanceAdapter(mockConfig);
      
      expect(adapter).toBeInstanceOf(BinanceAdapter);
      expect(adapter.exchange).toBe('binance');
    });
  });

  describe('工具函数', () => {
    it('应该能够生成签名', () => {
      const query = 'symbol=BTCUSDT&side=BUY';
      const secret = 'test-secret';
      
      const signature = BinanceAdapter.generateSignature(query, secret);
      
      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
    });

    it('应该能够创建认证头部', () => {
      const headers = BinanceAdapter.createAuthHeaders('test-key', 1234567890, 'test-signature');
      
      expect(headers).toMatchObject({
        'X-MBX-APIKEY': 'test-key',
        'X-MBX-TIMESTAMP': '1234567890',
        'X-MBX-SIGNATURE': 'test-signature'
      });
    });
  });
});

// 清理全局缓存以确保Jest正常退出
afterAll(() => {
  globalCache.destroy();
});

// 本地测试工具函数
function createMockConfig(overrides = {}) {
  return {
    exchange: 'binance',
    endpoints: {
      ws: 'wss://mock.binance.com/ws',
      rest: 'https://mock.binance.com/api'
    },
    connection: {
      timeout: 5000,
      maxRetries: 3,
      retryInterval: 1000,
      heartbeatInterval: 30000
    },
    ...overrides
  };
}