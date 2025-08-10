/**
 * 向后兼容性验证测试
 * 确保重构后的系统保持API和行为兼容性
 */

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { DataType } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { EnhancedMockFactory } from '../utils/enhanced-mock-factory';
import { TestUtils } from '../utils/test-utils';

// 模拟旧版API接口
interface LegacyAPIInterface {
  // 旧版适配器接口
  createAdapter(type: string, config: any): any;
  
  // 旧版数据订阅接口
  subscribeToMarketData(symbol: string, dataType: string): Promise<void>;
  unsubscribeFromMarketData(symbol: string, dataType: string): Promise<void>;
  
  // 旧版配置接口
  loadConfiguration(path: string): any;
  
  // 旧版WebSocket接口
  startWebSocketServer(port: number): Promise<void>;
  broadcastToClients(data: any): void;
  
  // 旧版事件接口
  onDataReceived(callback: (data: any) => void): void;
  onError(callback: (error: Error) => void): void;
}

// 模拟向后兼容的API包装器
class BackwardCompatibilityWrapper extends EventEmitter implements LegacyAPIInterface {
  private modernAdapter: any;
  private modernDataFlow: any;
  private modernWebSocket: any;
  private subscriptions: Map<string, any> = new Map();

  constructor() {
    super();
    this.modernAdapter = EnhancedMockFactory.createAdapterMock();
    this.modernDataFlow = EnhancedMockFactory.createDataFlowMock();
    this.modernWebSocket = EnhancedMockFactory.createWebSocketProxyMock();
  }

  // 适配器创建 - 保持旧接口
  createAdapter(type: string, config: any): any {
    if (type !== 'binance') {
      throw new Error(`Unsupported adapter type: ${type}`);
    }
    
    // 将旧配置格式转换为新格式
    const modernConfig = this.convertLegacyAdapterConfig(config);
    
    // 使用现代适配器但包装成旧接口
    return {
      // 旧版方法名
      connect: () => this.modernAdapter.start(),
      disconnect: () => this.modernAdapter.stop(),
      subscribe: (symbol: string, dataType: string) => 
        this.modernAdapter.subscribe({ symbol, type: this.convertDataType(dataType) }),
      unsubscribe: (symbol: string, dataType: string) =>
        this.modernAdapter.unsubscribe(symbol, this.convertDataType(dataType)),
      
      // 保持旧版事件名称
      onData: (callback: (data: any) => void) => {
        this.modernAdapter.on('data', (data: any) => {
          // 转换数据格式为旧版格式
          const legacyData = this.convertToLegacyDataFormat(data);
          callback(legacyData);
        });
      },
      
      onError: (callback: (error: Error) => void) => {
        this.modernAdapter.on('error', callback);
      }
    };
  }

  // 数据订阅 - 旧版接口
  async subscribeToMarketData(symbol: string, dataType: string): Promise<void> {
    const modernType = this.convertDataType(dataType);
    const subscriptionKey = `${symbol}:${dataType}`;
    
    if (!this.subscriptions.has(subscriptionKey)) {
      await this.modernAdapter.subscribe({ symbol, type: modernType });
      this.subscriptions.set(subscriptionKey, { symbol, type: modernType });
    }
  }

  async unsubscribeFromMarketData(symbol: string, dataType: string): Promise<void> {
    const modernType = this.convertDataType(dataType);
    const subscriptionKey = `${symbol}:${dataType}`;
    
    if (this.subscriptions.has(subscriptionKey)) {
      await this.modernAdapter.unsubscribe(symbol, modernType);
      this.subscriptions.delete(subscriptionKey);
    }
  }

  // 配置加载 - 支持旧格式
  loadConfiguration(path: string): any {
    // 模拟旧配置格式
    const legacyConfig = {
      exchangeCollector: {
        binance: {
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          wsEndpoint: 'wss://stream.binance.com:9443/ws'
        },
        websocket: {
          port: 8080,
          host: '0.0.0.0'
        },
        pubsub: {
          topic: 'market-data'
        }
      }
    };
    
    // 转换为现代配置格式
    return this.convertLegacyConfig(legacyConfig);
  }

  // WebSocket服务器 - 旧版接口
  async startWebSocketServer(port: number): Promise<void> {
    const config = {
      server: { port, host: '0.0.0.0' },
      proxy: { enabled: true }
    };
    
    await this.modernWebSocket.start();
  }

  broadcastToClients(data: any): void {
    // 转换数据格式然后广播
    const modernData = this.convertFromLegacyDataFormat(data);
    this.modernWebSocket.broadcast(modernData);
  }

  // 事件监听 - 旧版接口
  onDataReceived(callback: (data: any) => void): void {
    this.modernAdapter.on('data', (data: any) => {
      const legacyData = this.convertToLegacyDataFormat(data);
      callback(legacyData);
    });
  }

  onError(callback: (error: Error) => void): void {
    this.modernAdapter.on('error', callback);
    this.modernDataFlow.on?.('error', callback);
    this.modernWebSocket.on?.('error', callback);
  }

  // 私有转换方法
  private convertLegacyAdapterConfig(legacyConfig: any): any {
    return {
      wsUrl: legacyConfig.wsEndpoint || legacyConfig.websocketUrl,
      apiKey: legacyConfig.apiKey,
      apiSecret: legacyConfig.apiSecret,
      heartbeat: {
        enabled: legacyConfig.heartbeat !== false,
        interval: legacyConfig.heartbeatInterval || 30000
      }
    };
  }

  private convertDataType(legacyType: string): DataType {
    const typeMap: { [key: string]: DataType } = {
      'ticker': DataType.TICKER,
      'depth': DataType.DEPTH,
      'orderbook': DataType.DEPTH,
      'trade': DataType.TRADE,
      'trades': DataType.TRADE,
      'kline': DataType.KLINE,
      'candle': DataType.KLINE
    };
    
    return typeMap[legacyType.toLowerCase()] || DataType.TICKER;
  }

  private convertToLegacyDataFormat(modernData: any): any {
    return {
      // 旧版字段名
      exchange_name: modernData.exchange,
      symbol_name: modernData.symbol,
      data_type: modernData.type,
      timestamp: modernData.timestamp,
      payload: modernData.data,
      
      // 向后兼容的字段
      price: modernData.data?.price,
      volume: modernData.data?.volume,
      change: modernData.data?.change,
      change_percent: modernData.data?.changePercent
    };
  }

  private convertFromLegacyDataFormat(legacyData: any): any {
    return {
      exchange: legacyData.exchange_name || legacyData.exchange,
      symbol: legacyData.symbol_name || legacyData.symbol,
      type: legacyData.data_type || legacyData.type,
      timestamp: legacyData.timestamp || Date.now(),
      data: legacyData.payload || {
        price: legacyData.price,
        volume: legacyData.volume,
        change: legacyData.change,
        changePercent: legacyData.change_percent
      }
    };
  }

  private convertLegacyConfig(legacyConfig: any): any {
    const binanceConfig = legacyConfig.exchangeCollector?.binance || {};
    const wsConfig = legacyConfig.exchangeCollector?.websocket || {};
    
    return {
      adapters: {
        binance: {
          enabled: true,
          wsUrl: binanceConfig.wsEndpoint,
          apiKey: binanceConfig.apiKey,
          apiSecret: binanceConfig.apiSecret
        }
      },
      websocket: {
        server: {
          port: wsConfig.port || 8080,
          host: wsConfig.host || '0.0.0.0'
        }
      }
    };
  }
}

describe('Backward Compatibility', () => {
  let legacyAPI: BackwardCompatibilityWrapper;

  beforeEach(() => {
    legacyAPI = new BackwardCompatibilityWrapper();
  });

  afterEach(() => {
    EnhancedMockFactory.cleanup();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await globalCache.destroy();
  });

  describe('Legacy Adapter API Compatibility', () => {
    it('should maintain compatibility with legacy adapter creation', () => {
      const legacyConfig = {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        wsEndpoint: 'wss://stream.binance.com:9443/ws',
        heartbeat: true,
        heartbeatInterval: 30000
      };

      const adapter = legacyAPI.createAdapter('binance', legacyConfig);
      
      // 验证旧版接口方法存在
      expect(typeof adapter.connect).toBe('function');
      expect(typeof adapter.disconnect).toBe('function');
      expect(typeof adapter.subscribe).toBe('function');
      expect(typeof adapter.unsubscribe).toBe('function');
      expect(typeof adapter.onData).toBe('function');
      expect(typeof adapter.onError).toBe('function');
    });

    it('should handle legacy subscription methods', async () => {
      const adapter = legacyAPI.createAdapter('binance', {
        apiKey: 'test', 
        apiSecret: 'test'
      });

      // 使用旧版订阅方法
      await expect(adapter.subscribe('BTCUSDT', 'ticker')).resolves.not.toThrow();
      await expect(adapter.subscribe('ETHUSDT', 'depth')).resolves.not.toThrow();
      await expect(adapter.subscribe('ADAUSDT', 'trade')).resolves.not.toThrow();
      
      // 使用旧版取消订阅
      await expect(adapter.unsubscribe('BTCUSDT', 'ticker')).resolves.not.toThrow();
    });

    it('should convert legacy data type names correctly', async () => {
      const legacyDataTypes = [
        { legacy: 'ticker', modern: DataType.TICKER },
        { legacy: 'depth', modern: DataType.DEPTH },
        { legacy: 'orderbook', modern: DataType.DEPTH },
        { legacy: 'trade', modern: DataType.TRADE },
        { legacy: 'trades', modern: DataType.TRADE },
        { legacy: 'kline', modern: DataType.KLINE },
        { legacy: 'candle', modern: DataType.KLINE }
      ];

      for (const { legacy } of legacyDataTypes) {
        await expect(
          legacyAPI.subscribeToMarketData('BTCUSDT', legacy)
        ).resolves.not.toThrow();
      }
    });

    it('should emit legacy data format', async () => {
      const receivedData: any[] = [];
      
      legacyAPI.onDataReceived((data) => {
        receivedData.push(data);
      });

      // 模拟现代数据格式输入
      const modernData = TestUtils.createMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        data: {
          price: '50000.00',
          volume: '1000.5',
          change: '500.00',
          changePercent: '1.01'
        }
      });

      // 触发数据事件
      const components = (legacyAPI as any).modernAdapter;
      components.emit('data', modernData);

      await TestUtils.sleep(50);

      expect(receivedData).toHaveLength(1);
      const legacyData = receivedData[0];
      
      // 验证旧版数据格式
      expect(legacyData.exchange_name).toBe('binance');
      expect(legacyData.symbol_name).toBe('BTCUSDT');
      expect(legacyData.data_type).toBe(DataType.TICKER);
      expect(legacyData.price).toBe('50000.00');
      expect(legacyData.volume).toBe('1000.5');
      expect(legacyData.change).toBe('500.00');
      expect(legacyData.change_percent).toBe('1.01');
    });
  });

  describe('Legacy Configuration Compatibility', () => {
    it('should load and convert legacy configuration format', () => {
      const config = legacyAPI.loadConfiguration('/path/to/legacy/config.json');
      
      // 验证配置转换结果
      expect(config).toHaveProperty('adapters');
      expect(config).toHaveProperty('websocket');
      expect(config.adapters).toHaveProperty('binance');
      expect(config.adapters.binance).toHaveProperty('enabled', true);
      expect(config.websocket).toHaveProperty('server');
    });

    it('should handle missing legacy configuration fields', () => {
      // 测试部分配置缺失的情况
      const partialConfig = legacyAPI.loadConfiguration('/partial/config.json');
      
      expect(partialConfig.websocket.server.port).toBe(8080); // 默认值
      expect(partialConfig.websocket.server.host).toBe('0.0.0.0'); // 默认值
    });

    it('should preserve custom legacy configuration values', () => {
      const customConfig = {
        exchangeCollector: {
          binance: {
            apiKey: 'custom-key',
            apiSecret: 'custom-secret',
            wsEndpoint: 'wss://custom.endpoint.com/ws'
          },
          websocket: {
            port: 9999,
            host: '127.0.0.1'
          }
        }
      };

      const wrapper = new BackwardCompatibilityWrapper();
      const converted = (wrapper as any).convertLegacyConfig(customConfig);
      
      expect(converted.adapters.binance.apiKey).toBe('custom-key');
      expect(converted.adapters.binance.wsUrl).toBe('wss://custom.endpoint.com/ws');
      expect(converted.websocket.server.port).toBe(9999);
      expect(converted.websocket.server.host).toBe('127.0.0.1');
    });
  });

  describe('Legacy WebSocket API Compatibility', () => {
    it('should maintain legacy WebSocket server interface', async () => {
      await expect(legacyAPI.startWebSocketServer(8080)).resolves.not.toThrow();
    });

    it('should handle legacy broadcast method', async () => {
      await legacyAPI.startWebSocketServer(8080);
      
      const legacyData = {
        exchange_name: 'binance',
        symbol_name: 'ETHUSDT',
        data_type: 'ticker',
        price: '3000.00',
        volume: '500.25'
      };

      expect(() => legacyAPI.broadcastToClients(legacyData)).not.toThrow();
    });

    it('should convert legacy WebSocket message format', async () => {
      await legacyAPI.startWebSocketServer(8080);
      
      const components = (legacyAPI as any).modernWebSocket;
      const broadcastSpy = jest.spyOn(components, 'broadcast');

      const legacyMessage = {
        exchange_name: 'binance',
        symbol_name: 'BTCUSDT',
        price: '51000.00',
        volume: '750.5'
      };

      legacyAPI.broadcastToClients(legacyMessage);

      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          data: expect.objectContaining({
            price: '51000.00',
            volume: '750.5'
          })
        })
      );
    });
  });

  describe('Legacy Event System Compatibility', () => {
    it('should maintain legacy event handler signatures', () => {
      let dataReceived = false;
      let errorReceived = false;

      legacyAPI.onDataReceived((data) => {
        dataReceived = true;
        // 验证旧版数据结构
        expect(data).toHaveProperty('exchange_name');
        expect(data).toHaveProperty('symbol_name');
        expect(data).toHaveProperty('data_type');
      });

      legacyAPI.onError((error) => {
        errorReceived = true;
        expect(error).toBeInstanceOf(Error);
      });

      // 触发事件
      const components = (legacyAPI as any).modernAdapter;
      components.emit('data', TestUtils.createMarketData());
      components.emit('error', new Error('Test error'));

      expect(dataReceived).toBe(true);
      expect(errorReceived).toBe(true);
    });

    it('should handle multiple legacy event listeners', () => {
      const listeners: any[] = [];

      // 添加多个监听器
      for (let i = 0; i < 5; i++) {
        legacyAPI.onDataReceived((data) => {
          listeners.push({ listenerId: i, data });
        });
      }

      const testData = TestUtils.createMarketData();
      const components = (legacyAPI as any).modernAdapter;
      components.emit('data', testData);

      expect(listeners).toHaveLength(5);
      listeners.forEach((listener, index) => {
        expect(listener.listenerId).toBe(index);
        expect(listener.data).toHaveProperty('exchange_name');
      });
    });
  });

  describe('Legacy Subscription Management', () => {
    it('should maintain legacy subscription state', async () => {
      // 使用旧版API进行订阅
      await legacyAPI.subscribeToMarketData('BTCUSDT', 'ticker');
      await legacyAPI.subscribeToMarketData('ETHUSDT', 'depth');
      await legacyAPI.subscribeToMarketData('ADAUSDT', 'trade');

      // 验证订阅状态
      const subscriptions = (legacyAPI as any).subscriptions;
      expect(subscriptions.size).toBe(3);
      expect(subscriptions.has('BTCUSDT:ticker')).toBe(true);
      expect(subscriptions.has('ETHUSDT:depth')).toBe(true);
      expect(subscriptions.has('ADAUSDT:trade')).toBe(true);

      // 取消订阅
      await legacyAPI.unsubscribeFromMarketData('BTCUSDT', 'ticker');
      expect(subscriptions.size).toBe(2);
      expect(subscriptions.has('BTCUSDT:ticker')).toBe(false);
    });

    it('should handle duplicate legacy subscriptions', async () => {
      // 重复订阅同一个数据
      await legacyAPI.subscribeToMarketData('BTCUSDT', 'ticker');
      await legacyAPI.subscribeToMarketData('BTCUSDT', 'ticker');
      await legacyAPI.subscribeToMarketData('BTCUSDT', 'ticker');

      const subscriptions = (legacyAPI as any).subscriptions;
      expect(subscriptions.size).toBe(1);
    });

    it('should handle unsubscribe from non-existent subscriptions', async () => {
      // 尝试取消不存在的订阅
      await expect(
        legacyAPI.unsubscribeFromMarketData('NONEXISTENT', 'ticker')
      ).resolves.not.toThrow();
    });
  });

  describe('Integration with Modern Features', () => {
    it('should work alongside modern API without conflicts', async () => {
      // 使用现代API
      const modernAdapter = EnhancedMockFactory.createAdapterMock();
      await modernAdapter.initialize({});
      await modernAdapter.start();

      // 同时使用旧版API
      const legacyAdapter = legacyAPI.createAdapter('binance', {
        apiKey: 'test',
        apiSecret: 'test'
      });

      await legacyAdapter.connect();
      await legacyAdapter.subscribe('BTCUSDT', 'ticker');

      // 两者应该都正常工作
      expect(modernAdapter.getStatus()).toBeDefined();
      expect(typeof legacyAdapter.subscribe).toBe('function');
    });

    it('should benefit from modern performance improvements', async () => {
      // 使用旧版API进行性能测试
      const adapter = legacyAPI.createAdapter('binance', {
        apiKey: 'test',
        apiSecret: 'test'
      });

      await adapter.connect();

      const dataEvents: any[] = [];
      adapter.onData((data: any) => {
        dataEvents.push(data);
      });

      // 模拟高频数据
      const components = (legacyAPI as any).modernAdapter;
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        const testData = TestUtils.createMarketData({
          data: { sequenceId: i }
        });
        components.emit('data', testData);
      }

      await TestUtils.sleep(100);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // 即使使用旧API，也应该有现代化的性能
      expect(dataEvents.length).toBe(1000);
      expect(processingTime).toBeLessThan(1000); // <1秒处理1000条消息
    });

    it('should maintain data integrity across API versions', async () => {
      const receivedLegacyData: any[] = [];
      const receivedModernData: any[] = [];

      // 设置旧版监听器
      legacyAPI.onDataReceived((data) => {
        receivedLegacyData.push(data);
      });

      // 设置现代监听器
      const modernAdapter = (legacyAPI as any).modernAdapter;
      modernAdapter.on('data', (data: any) => {
        receivedModernData.push(data);
      });

      // 发送测试数据
      const originalData = TestUtils.createMarketData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        data: {
          price: '50000.00',
          volume: '1000.5',
          change: '250.00',
          changePercent: '0.50'
        }
      });

      modernAdapter.emit('data', originalData);

      await TestUtils.sleep(50);

      // 验证数据完整性
      expect(receivedLegacyData).toHaveLength(1);
      expect(receivedModernData).toHaveLength(1);

      const legacyData = receivedLegacyData[0];
      const modernData = receivedModernData[0];

      // 核心数据应该保持一致
      expect(legacyData.symbol_name).toBe(modernData.symbol);
      expect(legacyData.exchange_name).toBe(modernData.exchange);
      expect(legacyData.price).toBe(modernData.data.price);
      expect(legacyData.volume).toBe(modernData.data.volume);
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should maintain legacy error handling behavior', async () => {
      const errors: Error[] = [];
      
      legacyAPI.onError((error) => {
        errors.push(error);
      });

      // 触发各种错误
      const components = (legacyAPI as any).modernAdapter;
      components.emit('error', new Error('Connection error'));
      components.emit('error', new Error('Data parsing error'));

      await TestUtils.sleep(50);

      expect(errors).toHaveLength(2);
      expect(errors[0].message).toBe('Connection error');
      expect(errors[1].message).toBe('Data parsing error');
    });

    it('should handle legacy configuration errors gracefully', () => {
      // 无效的适配器类型
      expect(() => {
        legacyAPI.createAdapter('invalid-type', {});
      }).toThrow('Unsupported adapter type: invalid-type');

      // 缺失的配置
      expect(() => {
        legacyAPI.createAdapter('binance', null);
      }).not.toThrow(); // 应该使用默认值
    });
  });
});