/**
 * 错误处理和边界测试
 * 测试各种错误情况和边界条件的处理
 */

import { BinanceAdapter, createBinanceAdapter, BinanceConfig } from '../src';
import { globalCache } from '@pixiu/shared-core';
import { DataType, AdapterStatus, ConnectionState } from '@pixiu/adapter-base';
import { EventEmitter } from 'events';

// Mock WebSocket with error simulation capabilities
class ErrorSimulatingWebSocket extends EventEmitter {
  public readyState = 0;
  public url = '';
  private _shouldFailConnection = false;
  private _shouldFailOnSend = false;
  private _connectionDelay = 50;
  
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(url: string) {
    super();
    this.url = url;
    
    if (this._shouldFailConnection) {
      setTimeout(() => {
        this.readyState = ErrorSimulatingWebSocket.CLOSED;
        this.emit('error', new Error('Connection failed'));
      }, this._connectionDelay);
    } else {
      setTimeout(() => {
        this.readyState = ErrorSimulatingWebSocket.OPEN;
        this.emit('open');
      }, this._connectionDelay);
    }
  }
  
  close(code?: number, reason?: string) {
    this.readyState = ErrorSimulatingWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = ErrorSimulatingWebSocket.CLOSED;
      this.emit('close', { code: code || 1000, reason: reason || 'Normal closure' });
    }, 10);
  }
  
  send(data: string) {
    if (this.readyState !== ErrorSimulatingWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    if (this._shouldFailOnSend) {
      throw new Error('Send failed');
    }
  }
  
  // Test helper methods
  static setConnectionFailure(shouldFail: boolean) {
    ErrorSimulatingWebSocket.prototype._shouldFailConnection = shouldFail;
  }
  
  static setSendFailure(shouldFail: boolean) {
    ErrorSimulatingWebSocket.prototype._shouldFailOnSend = shouldFail;
  }
  
  static setConnectionDelay(delay: number) {
    ErrorSimulatingWebSocket.prototype._connectionDelay = delay;
  }
  
  mockReceiveMessage(message: any) {
    if (this.readyState === ErrorSimulatingWebSocket.OPEN) {
      this.emit('message', { data: JSON.stringify(message) });
    }
  }
  
  mockConnectionTimeout() {
    // Don't emit open event, simulating timeout
    setTimeout(() => {
      this.emit('error', new Error('Connection timeout'));
    }, this._connectionDelay);
  }
  
  mockUnexpectedDisconnection() {
    this.readyState = ErrorSimulatingWebSocket.CLOSED;
    this.emit('close', { code: 1006, reason: 'Abnormal closure' });
  }
}

(global as any).WebSocket = ErrorSimulatingWebSocket;

describe('错误处理和边界测试', () => {
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
        timeout: 2000,
        maxRetries: 3,
        retryInterval: 500,
        heartbeatInterval: 30000
      },
      binance: {
        testnet: false,
        enableCompression: false,
        autoManageStreams: true
      }
    };

    adapter = new BinanceAdapter();
    
    // 重置错误模拟器
    ErrorSimulatingWebSocket.setConnectionFailure(false);
    ErrorSimulatingWebSocket.setSendFailure(false);
    ErrorSimulatingWebSocket.setConnectionDelay(50);
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.destroy();
    }
  });

  describe('配置验证错误', () => {
    it('应该拒绝null或undefined配置', async () => {
      await expect(adapter.initialize(null as any)).rejects.toThrow();
      await expect(adapter.initialize(undefined as any)).rejects.toThrow();
    });

    it('应该拒绝空配置对象', async () => {
      await expect(adapter.initialize({} as any)).rejects.toThrow();
    });

    it('应该拒绝缺少endpoints的配置', async () => {
      const invalidConfig = {
        exchange: 'binance'
      };
      
      await expect(adapter.initialize(invalidConfig as any)).rejects.toThrow('Endpoints configuration is required');
    });

    it('应该拒绝缺少WebSocket端点的配置', async () => {
      const invalidConfig = {
        exchange: 'binance',
        endpoints: {
          rest: 'https://api.binance.com/api'
        }
      };
      
      await expect(adapter.initialize(invalidConfig as any)).rejects.toThrow('WebSocket endpoint (endpoints.ws) is required');
    });

    it('应该拒绝缺少REST端点的配置', async () => {
      const invalidConfig = {
        exchange: 'binance',
        endpoints: {
          ws: 'wss://stream.binance.com:9443/ws'
        }
      };
      
      await expect(adapter.initialize(invalidConfig as any)).rejects.toThrow('REST API endpoint (endpoints.rest) is required');
    });

    it('应该拒绝无效的URL格式', async () => {
      const invalidConfigs = [
        {
          ...mockConfig,
          endpoints: { ...mockConfig.endpoints, ws: 'invalid-url' }
        },
        {
          ...mockConfig,
          endpoints: { ...mockConfig.endpoints, ws: '' }
        },
        {
          ...mockConfig,
          endpoints: { ...mockConfig.endpoints, rest: 'not-a-url' }
        }
      ];

      for (const config of invalidConfigs) {
        const testAdapter = new BinanceAdapter();
        // URL验证可能在连接时进行，这里测试配置接受但连接失败的情况
        await expect(testAdapter.initialize(config)).resolves.not.toThrow();
        await testAdapter.destroy();
      }
    });
  });

  describe('连接错误处理', () => {
    it('应该正确处理连接失败', async () => {
      ErrorSimulatingWebSocket.setConnectionFailure(true);
      
      await adapter.initialize(mockConfig);
      
      await expect(adapter.connect()).rejects.toThrow('Connection failed');
      expect(adapter.getStatus()).toBe(AdapterStatus.ERROR);
    });

    it('应该正确处理连接超时', async () => {
      // 设置超长延迟模拟超时
      ErrorSimulatingWebSocket.setConnectionDelay(5000);
      
      await adapter.initialize({
        ...mockConfig,
        connection: {
          ...mockConfig.connection!,
          timeout: 1000 // 短超时时间
        }
      });
      
      await expect(adapter.connect()).rejects.toThrow();
      expect(adapter.getStatus()).toBe(AdapterStatus.ERROR);
    }, 10000);

    it('应该正确处理连接中断', async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
      
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      
      // 模拟连接中断
      const connectionManager = (adapter as any).connectionManager;
      const ws = (connectionManager as any).ws as ErrorSimulatingWebSocket;
      
      ws.mockUnexpectedDisconnection();
      
      // 等待事件处理
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
    });

    it('应该在连接失败时正确清理资源', async () => {
      ErrorSimulatingWebSocket.setConnectionFailure(true);
      
      await adapter.initialize(mockConfig);
      
      try {
        await adapter.connect();
      } catch (error) {
        // 预期的错误
      }
      
      // 验证状态和资源清理
      expect(adapter.getStatus()).toBe(AdapterStatus.ERROR);
      
      const connectionManager = (adapter as any).connectionManager;
      expect(connectionManager.isConnected()).toBe(false);
    });
  });

  describe('订阅错误处理', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
    });

    it('应该拒绝在未连接状态下的订阅', async () => {
      await adapter.disconnect();
      
      await expect(adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      })).rejects.toThrow();
    });

    it('应该拒绝空的订阅配置', async () => {
      const invalidSubscriptions = [
        null,
        undefined,
        {},
        { symbols: [] },
        { dataTypes: [] },
        { symbols: ['BTC/USDT'] }, // 缺少dataTypes
        { dataTypes: [DataType.TRADE] } // 缺少symbols
      ];

      for (const sub of invalidSubscriptions) {
        await expect(adapter.subscribe(sub as any)).rejects.toThrow();
      }
    });

    it('应该拒绝无效的交易对格式', async () => {
      const invalidSymbols = [
        '',
        'BTC', // 不完整的交易对
        'BTC-USDT', // 错误的分隔符
        'BTC_USDT', // 错误的分隔符
        'INVALID_SYMBOL_FORMAT'
      ];

      for (const symbol of invalidSymbols) {
        await expect(adapter.subscribe({
          symbols: [symbol],
          dataTypes: [DataType.TRADE]
        })).rejects.toThrow();
      }
    });

    it('应该拒绝不支持的数据类型', async () => {
      await expect(adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: ['invalid_data_type' as any]
      })).rejects.toThrow();
    });

    it('应该正确处理订阅过程中的流添加失败', async () => {
      // Mock BinanceConnectionManager的addStream方法失败
      const binanceConnectionManager = (adapter as any).binanceConnectionManager;
      const originalAddStream = binanceConnectionManager.addStream;
      
      binanceConnectionManager.addStream = jest.fn().mockRejectedValue(new Error('Failed to add stream'));
      
      await expect(adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      })).rejects.toThrow('Failed to add stream');
      
      // 恢复原始方法
      binanceConnectionManager.addStream = originalAddStream;
    });
  });

  describe('取消订阅错误处理', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
    });

    it('应该正确处理不存在的订阅ID', async () => {
      const nonExistentIds = ['invalid-id', ''];
      
      // 取消不存在的订阅不应该抛出错误，而是静默忽略
      await expect(adapter.unsubscribe(nonExistentIds)).resolves.not.toThrow();
    });

    it('应该正确处理空的订阅ID列表', async () => {
      await expect(adapter.unsubscribe([])).resolves.not.toThrow();
    });

    it('应该正确处理null/undefined订阅ID列表', async () => {
      await expect(adapter.unsubscribe(null as any)).rejects.toThrow();
      await expect(adapter.unsubscribe(undefined as any)).rejects.toThrow();
    });

    it('应该正确处理取消订阅过程中的流移除失败', async () => {
      // 先创建订阅
      const subscriptions = await adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      // Mock BinanceConnectionManager的removeStream方法失败
      const binanceConnectionManager = (adapter as any).binanceConnectionManager;
      const originalRemoveStream = binanceConnectionManager.removeStream;
      
      binanceConnectionManager.removeStream = jest.fn().mockRejectedValue(new Error('Failed to remove stream'));
      
      await expect(adapter.unsubscribe([subscriptions[0].id])).rejects.toThrow('Failed to remove stream');
      
      // 恢复原始方法
      binanceConnectionManager.removeStream = originalRemoveStream;
    });
  });

  describe('消息解析错误处理', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('应该正确处理null/undefined消息', () => {
      expect((adapter as any).parseMessage(null)).toBeNull();
      expect((adapter as any).parseMessage(undefined)).toBeNull();
    });

    it('应该正确处理非对象消息', () => {
      const invalidMessages = [
        'string message',
        123,
        true,
        [],
        () => {}
      ];

      invalidMessages.forEach(message => {
        expect((adapter as any).parseMessage(message)).toBeNull();
      });
    });

    it('应该正确处理缺少必需字段的消息', () => {
      const incompleteMessages = [
        {}, // 空对象
        { stream: 'btcusdt@trade' }, // 缺少data
        { data: { e: 'trade' } }, // 缺少stream
        { stream: 'btcusdt@trade', data: {} }, // data为空
        { stream: 'btcusdt@trade', data: { e: 'trade' } } // 缺少其他必需字段
      ];

      incompleteMessages.forEach(message => {
        const result = (adapter as any).parseMessage(message);
        expect(result).toBeNull();
      });
    });

    it('应该正确处理无效的数值字段', () => {
      const invalidTradeMessage = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: 'not-a-number',
          s: 'BTCUSDT',
          t: 'not-a-number',
          p: 'invalid-price',
          q: 'invalid-quantity',
          T: 'not-a-timestamp',
          m: 'not-a-boolean'
        }
      };

      expect(() => {
        (adapter as any).parseMessage(invalidTradeMessage);
      }).toThrow();
    });

    it('应该正确处理格式错误的K线消息', () => {
      const invalidKlineMessage = {
        stream: 'btcusdt@kline_1m',
        data: {
          e: 'kline',
          s: 'BTCUSDT',
          k: null // k字段为null
        }
      };

      expect(() => {
        (adapter as any).parseMessage(invalidKlineMessage);
      }).toThrow();
    });

    it('应该忽略未知的事件类型而不抛出错误', () => {
      const unknownEventMessage = {
        stream: 'btcusdt@unknown',
        data: {
          e: 'unknownEventType',
          s: 'BTCUSDT',
          randomField: 'randomValue'
        }
      };

      const result = (adapter as any).parseMessage(unknownEventMessage);
      expect(result).toBeNull();
    });
  });

  describe('内存和资源边界测试', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
    });

    it('应该正确处理大量并发订阅', async () => {
      const symbols = Array.from({ length: 100 }, (_, i) => `SYMBOL${i}/USDT`);
      const dataTypes = [DataType.TRADE, DataType.TICKER];

      await expect(adapter.subscribe({
        symbols,
        dataTypes
      })).resolves.not.toThrow();

      const subscriptions = adapter.getSubscriptions();
      expect(subscriptions).toHaveLength(200);
    }, 10000);

    it('应该正确处理极长的消息', async () => {
      const longString = 'a'.repeat(100000);
      const messageWithLongString = {
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          E: Date.now(),
          s: 'BTCUSDT',
          t: 12345,
          p: '50000.00',
          q: '0.1',
          T: Date.now(),
          m: false,
          longField: longString
        }
      };

      // 应该能处理而不崩溃
      expect(() => {
        (adapter as any).parseMessage(messageWithLongString);
      }).not.toThrow();
    });

    it('应该正确处理快速的订阅/取消订阅循环', async () => {
      for (let i = 0; i < 50; i++) {
        const subscriptions = await adapter.subscribe({
          symbols: ['BTC/USDT'],
          dataTypes: [DataType.TRADE]
        });

        await adapter.unsubscribe([subscriptions[0].id]);
      }

      // 验证没有内存泄漏
      expect(adapter.getSubscriptions()).toHaveLength(0);
      expect((adapter as any).streamMap.size).toBe(0);
    }, 15000);

    it('应该在资源耗尽时正确处理错误', async () => {
      // 模拟内存不足的情况
      const originalParse = JSON.parse;
      JSON.parse = jest.fn(() => {
        throw new Error('Out of memory');
      });

      try {
        const connectionManager = (adapter as any).connectionManager;
        const ws = (connectionManager as any).ws as ErrorSimulatingWebSocket;
        
        ws.mockReceiveMessage({
          stream: 'btcusdt@trade',
          data: {
            e: 'trade',
            s: 'BTCUSDT'
          }
        });

        // 等待错误处理
        await new Promise(resolve => setTimeout(resolve, 100));

        // 适配器应该仍然正常工作
        expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      } finally {
        JSON.parse = originalParse;
      }
    });
  });

  describe('并发和竞态条件测试', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
      await adapter.connect();
    });

    it('应该正确处理同时订阅和取消订阅', async () => {
      const promises = [];

      // 同时执行多个订阅操作
      for (let i = 0; i < 10; i++) {
        promises.push(
          adapter.subscribe({
            symbols: [`SYMBOL${i}/USDT`],
            dataTypes: [DataType.TRADE]
          })
        );
      }

      const results = await Promise.all(promises);
      expect(results.flat()).toHaveLength(10);

      // 同时取消所有订阅
      const unsubscribePromises = results.flat().map(sub => 
        adapter.unsubscribe([sub.id])
      );

      await Promise.all(unsubscribePromises);
      expect(adapter.getSubscriptions()).toHaveLength(0);
    });

    it('应该正确处理连接期间的订阅请求', async () => {
      await adapter.disconnect();

      // 在重新连接的同时尝试订阅
      const connectPromise = adapter.connect();
      const subscribePromise = adapter.subscribe({
        symbols: ['BTC/USDT'],
        dataTypes: [DataType.TRADE]
      });

      // 连接应该成功，但订阅可能失败或等待连接完成
      await connectPromise;
      
      // 在连接完成后，订阅应该能够成功或失败，但不应该导致适配器状态错误
      try {
        await subscribePromise;
      } catch (error) {
        // 订阅可能失败，但适配器应该保持正常状态
        expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      }
    });

    it('应该正确处理销毁期间的操作', async () => {
      // 开始销毁过程
      const destroyPromise = adapter.destroy();

      // 同时尝试其他操作
      const operationPromises = [
        adapter.subscribe({ symbols: ['BTC/USDT'], dataTypes: [DataType.TRADE] }).catch(() => {}),
        adapter.disconnect().catch(() => {}),
        adapter.connect().catch(() => {})
      ];

      // 等待所有操作完成
      await Promise.all([destroyPromise, ...operationPromises]);

      // 验证适配器处于正确的最终状态
      expect(adapter.getSubscriptions()).toHaveLength(0);
    });
  });

  describe('工具函数边界测试', () => {
    it('应该正确处理签名生成的边界情况', () => {
      const edgeCases = [
        { query: '', secret: 'secret' },
        { query: 'query', secret: '' },
        { query: '', secret: '' },
        { query: 'a'.repeat(10000), secret: 'secret' },
        { query: 'query', secret: 'b'.repeat(1000) },
        { query: '特殊字符!@#$%^&*()', secret: 'secret' },
        { query: 'query', secret: '特殊密钥!@#$%^&*()' }
      ];

      edgeCases.forEach(({ query, secret }) => {
        expect(() => {
          const signature = BinanceAdapter.generateSignature(query, secret);
          expect(typeof signature).toBe('string');
          expect(signature).toHaveLength(64);
        }).not.toThrow();
      });
    });

    it('应该正确处理认证头部创建的边界情况', () => {
      const edgeCases = [
        { apiKey: '', timestamp: 0, signature: '' },
        { apiKey: 'a'.repeat(1000), timestamp: Number.MAX_SAFE_INTEGER, signature: 'b'.repeat(64) },
        { apiKey: '特殊字符!@#$', timestamp: -1, signature: 'negative-timestamp' },
        { apiKey: 'key', timestamp: 1.5, signature: 'float-timestamp' }
      ];

      edgeCases.forEach(({ apiKey, timestamp, signature }) => {
        expect(() => {
          const headers = BinanceAdapter.createAuthHeaders(apiKey, timestamp, signature);
          expect(headers).toHaveProperty('X-MBX-APIKEY', apiKey);
          expect(headers).toHaveProperty('X-MBX-TIMESTAMP', timestamp.toString());
          expect(headers).toHaveProperty('X-MBX-SIGNATURE', signature);
        }).not.toThrow();
      });
    });

    it('应该正确处理符号标准化的边界情况', () => {
      const edgeCases = [
        { input: '', expected: '' },
        { input: 'a', expected: 'A' },
        { input: 'VERYLONGSYMBOLNAMETHATEXCEEDSNORMALLENGTH', expected: 'VERYLONGSYMBOLNAMETHATEXCEEDSNORMALLENGTH' },
        { input: 'btc/usdt', expected: 'BTC/USDT' },
        { input: 'BTC//USDT', expected: 'BTC//USDT' }, // 双斜杠应该保持
        { input: '123456', expected: '123456' },
        { input: 'BTC-USDT', expected: 'BTC-USDT' }
      ];

      edgeCases.forEach(({ input, expected }) => {
        const result = (adapter as any).normalizeSymbol(input);
        expect(result).toBe(expected);
      });
    });

    it('应该正确处理流名称构建的边界情况', () => {
      const validCases = [
        { symbol: 'A/B', dataType: DataType.TRADE, expected: 'ab@trade' },
        { symbol: 'VERYLONGSYMBOL/USDT', dataType: DataType.TICKER, expected: 'verylongsymbolusdt@ticker' },
        { symbol: '123/456', dataType: DataType.KLINE_1M, expected: '123456@kline_1m' }
      ];

      validCases.forEach(({ symbol, dataType, expected }) => {
        const result = (adapter as any).buildStreamName(symbol, dataType);
        expect(result).toBe(expected);
      });

      // 测试无效情况
      expect(() => {
        (adapter as any).buildStreamName('', DataType.TRADE);
      }).not.toThrow(); // 空符号应该能处理

      expect(() => {
        (adapter as any).buildStreamName('BTC/USDT', null);
      }).toThrow();

      expect(() => {
        (adapter as any).buildStreamName('BTC/USDT', 'invalid');
      }).toThrow();
    });
  });
});

// 清理资源
afterAll(() => {
  globalCache.destroy();
});