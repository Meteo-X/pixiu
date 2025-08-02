/**
 * Mock adapters and components for pipeline testing
 */

import { EventEmitter } from 'events';
import { MarketData } from '@pixiu/adapter-base';
import { createMockMarketData } from '../fixtures/mock-market-data';

/**
 * 模拟适配器基类
 */
export abstract class MockAdapter extends EventEmitter {
  protected isConnected = false;
  protected isDestroyed = false;
  protected config: any;
  
  constructor(config: any = {}) {
    super();
    this.config = config;
  }
  
  abstract getName(): string;
  abstract getExchange(): string;
  
  async connect(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('Adapter is destroyed');
    }
    
    this.isConnected = true;
    this.emit('connected');
  }
  
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.emit('disconnected');
  }
  
  async destroy(): Promise<void> {
    await this.disconnect();
    this.isDestroyed = true;
    this.removeAllListeners();
    this.emit('destroyed');
  }
  
  isReady(): boolean {
    return this.isConnected && !this.isDestroyed;
  }
  
  getStatus(): string {
    if (this.isDestroyed) return 'destroyed';
    if (this.isConnected) return 'connected';
    return 'disconnected';
  }
}

/**
 * 模拟Binance适配器
 */
export class MockBinanceAdapter extends MockAdapter {
  private dataGeneratorTimer?: NodeJS.Timeout;
  private symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
  private dataTypes: string[] = ['ticker', 'orderbook', 'trade'];
  
  getName(): string {
    return 'mock-binance-adapter';
  }
  
  getExchange(): string {
    return 'binance';
  }
  
  /**
   * 开始生成模拟数据
   */
  startDataGeneration(intervalMs: number = 100): void {
    if (this.dataGeneratorTimer) {
      clearInterval(this.dataGeneratorTimer);
    }
    
    this.dataGeneratorTimer = setInterval(() => {
      if (this.isReady()) {
        this.generateRandomData();
      }
    }, intervalMs);
  }
  
  /**
   * 停止生成数据
   */
  stopDataGeneration(): void {
    if (this.dataGeneratorTimer) {
      clearInterval(this.dataGeneratorTimer);
      this.dataGeneratorTimer = undefined;
    }
  }
  
  /**
   * 发送特定数据
   */
  sendData(data: MarketData): void {
    if (this.isReady()) {
      this.emit('data', data);
    }
  }
  
  /**
   * 发送批量数据
   */
  sendBatchData(dataList: MarketData[]): void {
    if (this.isReady()) {
      dataList.forEach(data => this.emit('data', data));
    }
  }
  
  /**
   * 模拟连接错误
   */
  simulateConnectionError(): void {
    this.isConnected = false;
    this.emit('error', new Error('Simulated connection error'));
  }
  
  /**
   * 模拟数据错误
   */
  simulateDataError(): void {
    this.emit('error', new Error('Simulated data processing error'));
  }
  
  private generateRandomData(): void {
    const symbol = this.symbols[Math.floor(Math.random() * this.symbols.length)];
    const dataType = this.dataTypes[Math.floor(Math.random() * this.dataTypes.length)];
    
    const data = createMockMarketData({
      exchange: 'binance',
      symbol,
      type: dataType,
      data: {
        price: 45000 + (Math.random() - 0.5) * 1000,
        volume: Math.random() * 10
      }
    });
    
    this.emit('data', data);
  }
  
  async destroy(): Promise<void> {
    this.stopDataGeneration();
    await super.destroy();
  }
}

/**
 * 模拟Huobi适配器
 */
export class MockHuobiAdapter extends MockAdapter {
  private subscriptions = new Set<string>();
  
  getName(): string {
    return 'mock-huobi-adapter';
  }
  
  getExchange(): string {
    return 'huobi';
  }
  
  /**
   * 订阅符号
   */
  subscribe(symbol: string): void {
    this.subscriptions.add(symbol);
    this.emit('subscribed', symbol);
  }
  
  /**
   * 取消订阅
   */
  unsubscribe(symbol: string): void {
    this.subscriptions.delete(symbol);
    this.emit('unsubscribed', symbol);
  }
  
  /**
   * 获取订阅列表
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
  
  /**
   * 发送订阅数据
   */
  sendSubscriptionData(): void {
    this.subscriptions.forEach(symbol => {
      const data = createMockMarketData({
        exchange: 'huobi',
        symbol,
        type: 'ticker'
      });
      this.emit('data', data);
    });
  }
}

/**
 * 模拟高频数据适配器
 */
export class MockHighFrequencyAdapter extends MockAdapter {
  private messageRate = 1000; // messages per second
  private isGenerating = false;
  private messageCount = 0;
  
  getName(): string {
    return 'mock-high-frequency-adapter';
  }
  
  getExchange(): string {
    return 'mock-hft';
  }
  
  /**
   * 设置消息频率
   */
  setMessageRate(messagesPerSecond: number): void {
    this.messageRate = messagesPerSecond;
  }
  
  /**
   * 开始高频数据生成
   */
  startHighFrequencyGeneration(): void {
    if (this.isGenerating) return;
    
    this.isGenerating = true;
    this.messageCount = 0;
    
    const intervalMs = 1000 / this.messageRate;
    
    const generate = () => {
      if (!this.isGenerating || !this.isReady()) return;
      
      const data = createMockMarketData({
        exchange: 'mock-hft',
        symbol: 'BTCUSDT',
        type: 'trade',
        sequence: ++this.messageCount,
        data: {
          price: 45000 + (Math.random() - 0.5) * 100,
          volume: Math.random() * 0.1,
          timestamp: Date.now()
        }
      });
      
      this.emit('data', data);
      
      setTimeout(generate, intervalMs);
    };
    
    generate();
  }
  
  /**
   * 停止高频数据生成
   */
  stopHighFrequencyGeneration(): void {
    this.isGenerating = false;
  }
  
  /**
   * 获取消息统计
   */
  getMessageStats(): { count: number; rate: number } {
    return {
      count: this.messageCount,
      rate: this.messageRate
    };
  }
}

/**
 * 模拟不稳定适配器
 */
export class MockUnstableAdapter extends MockAdapter {
  private errorRate = 0.1; // 10% error rate
  private disconnectProbability = 0.05; // 5% chance to disconnect
  private reconnectDelay = 1000; // 1 second
  
  getName(): string {
    return 'mock-unstable-adapter';
  }
  
  getExchange(): string {
    return 'mock-unstable';
  }
  
  /**
   * 设置错误率
   */
  setErrorRate(rate: number): void {
    this.errorRate = Math.max(0, Math.min(1, rate));
  }
  
  /**
   * 设置断连概率
   */
  setDisconnectProbability(probability: number): void {
    this.disconnectProbability = Math.max(0, Math.min(1, probability));
  }
  
  /**
   * 发送可能失败的数据
   */
  sendUnstableData(): void {
    if (!this.isReady()) return;
    
    // 模拟随机断连
    if (Math.random() < this.disconnectProbability) {
      this.simulateRandomDisconnect();
      return;
    }
    
    // 模拟随机错误
    if (Math.random() < this.errorRate) {
      this.emit('error', new Error('Random processing error'));
      return;
    }
    
    // 发送正常数据
    const data = createMockMarketData({
      exchange: 'mock-unstable',
      symbol: 'TESTUSDT',
      type: 'ticker'
    });
    
    this.emit('data', data);
  }
  
  /**
   * 模拟随机断连和重连
   */
  private async simulateRandomDisconnect(): Promise<void> {
    await this.disconnect();
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.emit('error', error);
      }
    }, this.reconnectDelay);
  }
}

/**
 * 模拟适配器工厂
 */
export class MockAdapterFactory {
  /**
   * 创建Binance适配器
   */
  static createBinanceAdapter(config: any = {}): MockBinanceAdapter {
    return new MockBinanceAdapter(config);
  }
  
  /**
   * 创建Huobi适配器
   */
  static createHuobiAdapter(config: any = {}): MockHuobiAdapter {
    return new MockHuobiAdapter(config);
  }
  
  /**
   * 创建高频适配器
   */
  static createHighFrequencyAdapter(config: any = {}): MockHighFrequencyAdapter {
    return new MockHighFrequencyAdapter(config);
  }
  
  /**
   * 创建不稳定适配器
   */
  static createUnstableAdapter(config: any = {}): MockUnstableAdapter {
    return new MockUnstableAdapter(config);
  }
  
  /**
   * 创建多个适配器
   */
  static createMultipleAdapters(count: number = 3): MockAdapter[] {
    const adapters: MockAdapter[] = [];
    
    for (let i = 0; i < count; i++) {
      const adapterType = i % 3;
      switch (adapterType) {
        case 0:
          adapters.push(new MockBinanceAdapter({ id: `binance-${i}` }));
          break;
        case 1:
          adapters.push(new MockHuobiAdapter({ id: `huobi-${i}` }));
          break;
        case 2:
          adapters.push(new MockHighFrequencyAdapter({ id: `hft-${i}` }));
          break;
      }
    }
    
    return adapters;
  }
}

/**
 * 适配器测试助手
 */
export class AdapterTestHelper {
  /**
   * 等待适配器连接
   */
  static async waitForConnection(adapter: MockAdapter, timeout: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (adapter.isReady()) {
        resolve();
        return;
      }
      
      const timer = setTimeout(() => {
        reject(new Error(`Adapter connection timeout after ${timeout}ms`));
      }, timeout);
      
      adapter.once('connected', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  
  /**
   * 等待适配器数据
   */
  static async waitForData(
    adapter: MockAdapter, 
    count: number = 1, 
    timeout: number = 5000
  ): Promise<MarketData[]> {
    return new Promise((resolve, reject) => {
      const receivedData: MarketData[] = [];
      
      const timer = setTimeout(() => {
        reject(new Error(`Data timeout: received ${receivedData.length}/${count} messages`));
      }, timeout);
      
      const onData = (data: MarketData) => {
        receivedData.push(data);
        if (receivedData.length >= count) {
          clearTimeout(timer);
          adapter.off('data', onData);
          resolve(receivedData);
        }
      };
      
      adapter.on('data', onData);
    });
  }
  
  /**
   * 测试适配器稳定性
   */
  static async testAdapterStability(
    adapter: MockAdapter,
    duration: number = 10000,
    expectedMessageRate?: number
  ): Promise<{
    messagesReceived: number;
    errorsReceived: number;
    disconnections: number;
    actualRate: number;
    stability: number;
  }> {
    return new Promise((resolve) => {
      let messagesReceived = 0;
      let errorsReceived = 0;
      let disconnections = 0;
      
      const startTime = Date.now();
      
      const onData = () => messagesReceived++;
      const onError = () => errorsReceived++;
      const onDisconnected = () => disconnections++;
      
      adapter.on('data', onData);
      adapter.on('error', onError);
      adapter.on('disconnected', onDisconnected);
      
      setTimeout(() => {
        adapter.off('data', onData);
        adapter.off('error', onError);
        adapter.off('disconnected', onDisconnected);
        
        const actualDuration = Date.now() - startTime;
        const actualRate = (messagesReceived / actualDuration) * 1000;
        
        let stability = 1.0;
        if (expectedMessageRate) {
          const rateDeviation = Math.abs(actualRate - expectedMessageRate) / expectedMessageRate;
          stability *= Math.max(0, 1 - rateDeviation);
        }
        
        if (errorsReceived > 0) {
          stability *= Math.max(0, 1 - (errorsReceived / messagesReceived));
        }
        
        if (disconnections > 0) {
          stability *= Math.max(0, 1 - (disconnections * 0.1));
        }
        
        resolve({
          messagesReceived,
          errorsReceived,
          disconnections,
          actualRate,
          stability
        });
      }, duration);
    });
  }
}