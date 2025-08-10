/**
 * BinanceConnectionManager单元测试
 * 测试Binance特定的连接管理功能
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '../../src/connection/binance-connection-manager';
import { ConnectionState } from '@pixiu/adapter-base';
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
  
  send(data: string) {
    // Mock send
  }
  
  // Mock connection
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

describe('BinanceConnectionManager', () => {
  let connectionManager: BinanceConnectionManager;
  let mockConfig: BinanceConnectionConfig;

  beforeEach(() => {
    connectionManager = new BinanceConnectionManager();
    mockConfig = {
      url: 'wss://stream.binance.com:9443/ws',
      timeout: 5000,
      maxRetries: 3,
      retryInterval: 1000,
      heartbeatInterval: 30000,
      binance: {
        testnet: false,
        enableCompression: false,
        combinedStream: {
          streams: [],
          autoManage: true
        }
      }
    };
  });

  afterEach(async () => {
    if (connectionManager.isConnected()) {
      await connectionManager.disconnect();
    }
  });

  describe('基础连接管理', () => {
    it('应该能够建立基础WebSocket连接', async () => {
      const connectPromise = connectionManager.connect(mockConfig);
      
      // 模拟WebSocket连接成功
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      
      await connectPromise;
      
      expect(connectionManager.isConnected()).toBe(true);
      expect(connectionManager.getState()).toBe(ConnectionState.CONNECTED);
    });

    it('应该能够断开连接', async () => {
      // 先建立连接
      const connectPromise = connectionManager.connect(mockConfig);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      // 断开连接
      await connectionManager.disconnect();
      
      expect(connectionManager.isConnected()).toBe(false);
      expect(connectionManager.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('应该处理连接错误', async () => {
      const connectPromise = connectionManager.connect(mockConfig);
      
      // 模拟连接错误
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockError(new Error('Connection failed'));
      });
      
      await expect(connectPromise).rejects.toThrow('Connection failed');
      expect(connectionManager.getState()).toBe(ConnectionState.ERROR);
    });
  });

  describe('单流连接管理', () => {
    it('应该正确构建单流URL', async () => {
      const singleStreamConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: ['btcusdt@trade'],
            autoManage: true
          }
        }
      };

      const connectPromise = connectionManager.connect(singleStreamConfig);
      
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        expect(ws.url).toBe('wss://stream.binance.com:9443/ws/btcusdt@trade');
        ws.mockConnect();
      });
      
      await connectPromise;
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toEqual(['btcusdt@trade']);
    });

    it('应该支持动态添加单个流', async () => {
      // 建立基础连接
      const connectPromise = connectionManager.connect(mockConfig);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      // 添加流
      const addStreamPromise = connectionManager.addStream('btcusdt@trade');
      
      // 模拟重连
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      
      await addStreamPromise;
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toContain('btcusdt@trade');
    });

    it('应该支持移除流', async () => {
      // 建立带流的连接
      const configWithStream = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: ['btcusdt@trade'],
            autoManage: true
          }
        }
      };

      const connectPromise = connectionManager.connect(configWithStream);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      // 移除流
      const removeStreamPromise = connectionManager.removeStream('btcusdt@trade');
      
      // 模拟重连到基础连接
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      
      await removeStreamPromise;
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).not.toContain('btcusdt@trade');
    });

    it('不应该重复添加相同的流', async () => {
      // 建立基础连接
      const connectPromise = connectionManager.connect(mockConfig);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      // 添加流
      await connectionManager.addStream('btcusdt@trade');
      const firstCount = connectionManager.getActiveStreams().length;
      
      // 再次添加相同流
      await connectionManager.addStream('btcusdt@trade');
      const secondCount = connectionManager.getActiveStreams().length;
      
      expect(firstCount).toBe(secondCount);
    });

    it('不应该移除不存在的流', async () => {
      const initialStreams = connectionManager.getActiveStreams();
      
      await connectionManager.removeStream('nonexistent@trade');
      
      const finalStreams = connectionManager.getActiveStreams();
      expect(finalStreams).toEqual(initialStreams);
    });
  });

  describe('组合流连接管理', () => {
    it('应该正确构建组合流URL', async () => {
      const multiStreamConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: ['btcusdt@trade', 'ethusdt@trade', 'bnbusdt@ticker'],
            autoManage: true
          }
        }
      };

      const connectPromise = connectionManager.connect(multiStreamConfig);
      
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        expect(ws.url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/bnbusdt@ticker');
        ws.mockConnect();
      });
      
      await connectPromise;
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(3);
      expect(activeStreams).toContain('btcusdt@trade');
      expect(activeStreams).toContain('ethusdt@trade');
      expect(activeStreams).toContain('bnbusdt@ticker');
    });

    it('应该支持组合流中添加新流', async () => {
      const multiStreamConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: ['btcusdt@trade', 'ethusdt@trade'],
            autoManage: true
          }
        }
      };

      // 建立组合流连接
      const connectPromise = connectionManager.connect(multiStreamConfig);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      // 添加新流
      const addStreamPromise = connectionManager.addStream('bnbusdt@ticker');
      
      // 模拟重连
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        expect(ws.url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/bnbusdt@ticker');
        ws.mockConnect();
      });
      
      await addStreamPromise;
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(3);
      expect(activeStreams).toContain('bnbusdt@ticker');
    });

    it('应该支持从组合流中移除流', async () => {
      const multiStreamConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: ['btcusdt@trade', 'ethusdt@trade', 'bnbusdt@ticker'],
            autoManage: true
          }
        }
      };

      // 建立组合流连接
      const connectPromise = connectionManager.connect(multiStreamConfig);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      // 移除流
      const removeStreamPromise = connectionManager.removeStream('ethusdt@trade');
      
      // 模拟重连
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        expect(ws.url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/bnbusdt@ticker');
        ws.mockConnect();
      });
      
      await removeStreamPromise;
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(2);
      expect(activeStreams).not.toContain('ethusdt@trade');
    });
  });

  describe('URL构建测试', () => {
    it('应该正确处理基础URL', async () => {
      const config = {
        ...mockConfig,
        url: 'wss://stream.binance.com:9443/ws/someexistingstream'
      };

      const connectPromise = connectionManager.connect(config);
      
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        // 应该清理原有的路径
        expect(ws.url).toBe('wss://stream.binance.com:9443/ws');
        ws.mockConnect();
      });
      
      await connectPromise;
    });

    it('应该正确处理测试网URL', async () => {
      const testnetConfig = {
        ...mockConfig,
        url: 'wss://testnet.binance.vision/ws',
        binance: {
          ...mockConfig.binance!,
          testnet: true
        }
      };

      const connectPromise = connectionManager.connect(testnetConfig);
      
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        expect(ws.url).toBe('wss://testnet.binance.vision/ws');
        ws.mockConnect();
      });
      
      await connectPromise;
    });

    it('应该正确构建复杂的组合流URL', async () => {
      const complexConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: [
              'btcusdt@trade',
              'ethusdt@kline_1m',
              'bnbusdt@ticker',
              'adausdt@depth@100ms',
              'dotusdt@bookTicker'
            ],
            autoManage: true
          }
        }
      };

      const connectPromise = connectionManager.connect(complexConfig);
      
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        const expectedUrl = 'wss://stream.binance.com:9443/stream?streams=' +
          'btcusdt@trade/ethusdt@kline_1m/bnbusdt@ticker/adausdt@depth@100ms/dotusdt@bookTicker';
        expect(ws.url).toBe(expectedUrl);
        ws.mockConnect();
      });
      
      await connectPromise;
    });
  });

  describe('配置验证', () => {
    it('应该接受有效的Binance配置', async () => {
      const validConfig = {
        ...mockConfig,
        binance: {
          testnet: true,
          enableCompression: true,
          combinedStream: {
            streams: ['btcusdt@trade'],
            autoManage: false
          }
        }
      };

      await expect(connectionManager.connect(validConfig)).resolves.not.toThrow();
    });

    it('应该处理缺少binance配置的情况', async () => {
      const configWithoutBinance = {
        url: 'wss://stream.binance.com:9443/ws',
        timeout: 5000,
        maxRetries: 3,
        retryInterval: 1000,
        heartbeatInterval: 30000
      };

      const connectPromise = connectionManager.connect(configWithoutBinance);
      
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      
      await expect(connectPromise).resolves.not.toThrow();
    });
  });

  describe('自动管理流配置', () => {
    it('当autoManage为false时不应该自动重连', async () => {
      const manualConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: ['btcusdt@trade'],
            autoManage: false
          }
        }
      };

      // 建立连接
      const connectPromise = connectionManager.connect(manualConfig);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      const originalUrl = (connectionManager as any).ws.url;

      // 添加流（不应该触发重连）
      await connectionManager.addStream('ethusdt@trade');
      
      // URL应该保持不变
      expect((connectionManager as any).ws.url).toBe(originalUrl);
      
      // 但活跃流列表应该更新
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toContain('ethusdt@trade');
    });

    it('当autoManage为true时应该自动重连', async () => {
      const autoConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: ['btcusdt@trade'],
            autoManage: true
          }
        }
      };

      // 建立连接
      const connectPromise = connectionManager.connect(autoConfig);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      // 添加流（应该触发重连）
      const addStreamPromise = connectionManager.addStream('ethusdt@trade');
      
      // 模拟重连
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        expect(ws.url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade');
        ws.mockConnect();
      });
      
      await addStreamPromise;
    });
  });

  describe('边界条件测试', () => {
    it('应该处理空流列表', async () => {
      const emptyStreamConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: [],
            autoManage: true
          }
        }
      };

      const connectPromise = connectionManager.connect(emptyStreamConfig);
      
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        expect(ws.url).toBe('wss://stream.binance.com:9443/ws');
        ws.mockConnect();
      });
      
      await connectPromise;
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(0);
    });

    it('应该处理所有流都被移除的情况', async () => {
      const singleStreamConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: ['btcusdt@trade'],
            autoManage: true
          }
        }
      };

      // 建立连接
      const connectPromise = connectionManager.connect(singleStreamConfig);
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        ws.mockConnect();
      });
      await connectPromise;

      // 移除所有流
      await connectionManager.removeStream('btcusdt@trade');
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(0);
    });

    it('应该处理大量流的情况', async () => {
      const manyStreams = Array.from({ length: 100 }, (_, i) => `symbol${i}@trade`);
      const manyStreamConfig = {
        ...mockConfig,
        binance: {
          ...mockConfig.binance!,
          combinedStream: {
            streams: manyStreams,
            autoManage: true
          }
        }
      };

      const connectPromise = connectionManager.connect(manyStreamConfig);
      
      process.nextTick(() => {
        const ws = (connectionManager as any).ws as MockWebSocket;
        expect(ws.url).toContain('stream?streams=');
        expect(ws.url.split('/').length).toBe(manyStreams.length + 1); // +1 for the base URL part
        ws.mockConnect();
      });
      
      await connectPromise;
      
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toHaveLength(100);
    });
  });
});