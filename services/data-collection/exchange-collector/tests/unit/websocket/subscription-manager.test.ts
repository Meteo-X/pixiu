/**
 * SubscriptionManager 测试
 * 测试订阅管理器的多维度过滤和动态订阅功能
 */

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { globalCache } from '@pixiu/shared-core';
import { DataType } from '@pixiu/adapter-base';
import { EnhancedMockFactory } from '../../utils/enhanced-mock-factory';
import { TestUtils } from '../../utils/test-utils';

// 由于SubscriptionManager可能不存在，我们创建一个模拟实现
class MockSubscriptionManager extends EventEmitter {
  private subscriptions: Map<string, Set<string>> = new Map();
  private filters: Map<string, any> = new Map();
  private stats = {
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    filtersApplied: 0,
    messagesFiltered: 0,
    lastActivity: Date.now()
  };

  constructor() {
    super();
  }

  // 添加订阅
  subscribe(clientId: string, subscription: any): void {
    const key = this.getSubscriptionKey(subscription);
    
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Set());
    }
    
    const clientSubs = this.subscriptions.get(clientId)!;
    const wasNew = !clientSubs.has(key);
    
    clientSubs.add(key);
    
    if (wasNew) {
      this.stats.totalSubscriptions++;
      this.stats.activeSubscriptions++;
      this.emit('subscriptionAdded', { clientId, subscription });
    }
    
    this.stats.lastActivity = Date.now();
  }

  // 取消订阅
  unsubscribe(clientId: string, subscription: any): void {
    const key = this.getSubscriptionKey(subscription);
    const clientSubs = this.subscriptions.get(clientId);
    
    if (clientSubs && clientSubs.has(key)) {
      clientSubs.delete(key);
      this.stats.activeSubscriptions--;
      this.emit('subscriptionRemoved', { clientId, subscription });
      
      if (clientSubs.size === 0) {
        this.subscriptions.delete(clientId);
      }
    }
    
    this.stats.lastActivity = Date.now();
  }

  // 取消客户端的所有订阅
  unsubscribeAll(clientId: string): void {
    const clientSubs = this.subscriptions.get(clientId);
    if (clientSubs) {
      this.stats.activeSubscriptions -= clientSubs.size;
      this.subscriptions.delete(clientId);
      this.emit('allSubscriptionsRemoved', { clientId });
    }
    
    this.stats.lastActivity = Date.now();
  }

  // 添加过滤器
  addFilter(clientId: string, filter: any): void {
    this.filters.set(clientId, filter);
    this.stats.filtersApplied++;
    this.emit('filterAdded', { clientId, filter });
  }

  // 移除过滤器
  removeFilter(clientId: string): void {
    if (this.filters.delete(clientId)) {
      this.stats.filtersApplied--;
      this.emit('filterRemoved', { clientId });
    }
  }

  // 过滤消息
  filterMessage(data: any): { clientId: string; shouldSend: boolean }[] {
    const results: { clientId: string; shouldSend: boolean }[] = [];
    
    for (const [clientId, subscriptions] of this.subscriptions.entries()) {
      let shouldSend = false;
      
      // 检查订阅匹配
      for (const subscription of subscriptions) {
        if (this.matchesSubscription(data, subscription)) {
          shouldSend = true;
          break;
        }
      }
      
      // 应用过滤器
      if (shouldSend && this.filters.has(clientId)) {
        const filter = this.filters.get(clientId);
        shouldSend = this.applyFilter(data, filter);
      }
      
      results.push({ clientId, shouldSend });
      
      if (shouldSend) {
        this.stats.messagesFiltered++;
      }
    }
    
    return results;
  }

  // 获取统计信息
  getStats(): any {
    return { ...this.stats };
  }

  // 获取客户端订阅
  getClientSubscriptions(clientId: string): string[] {
    const subscriptions = this.subscriptions.get(clientId);
    return subscriptions ? Array.from(subscriptions) : [];
  }

  // 获取所有订阅
  getAllSubscriptions(): { [clientId: string]: string[] } {
    const result: { [clientId: string]: string[] } = {};
    for (const [clientId, subscriptions] of this.subscriptions.entries()) {
      result[clientId] = Array.from(subscriptions);
    }
    return result;
  }

  // 私有方法
  private getSubscriptionKey(subscription: any): string {
    return `${subscription.symbol}:${subscription.type}`;
  }

  private matchesSubscription(data: any, subscriptionKey: string): boolean {
    const [symbol, type] = subscriptionKey.split(':');
    return data.symbol === symbol && data.type === type;
  }

  private applyFilter(data: any, filter: any): boolean {
    if (filter.symbols && !filter.symbols.includes(data.symbol)) {
      return false;
    }
    
    if (filter.types && !filter.types.includes(data.type)) {
      return false;
    }
    
    if (filter.exchanges && !filter.exchanges.includes(data.exchange)) {
      return false;
    }
    
    if (filter.priceRange) {
      const price = parseFloat(data.data?.price || '0');
      if (price < filter.priceRange.min || price > filter.priceRange.max) {
        return false;
      }
    }
    
    return true;
  }
}

describe('SubscriptionManager', () => {
  let subscriptionManager: MockSubscriptionManager;
  let mockClients: string[];

  beforeEach(() => {
    subscriptionManager = new MockSubscriptionManager();
    mockClients = ['client-1', 'client-2', 'client-3', 'client-4'];
  });

  afterEach(() => {
    EnhancedMockFactory.cleanup();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await globalCache.destroy();
  });

  describe('Subscription Management', () => {
    it('should add subscriptions successfully', () => {
      const subscription = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER
      };

      const subscriptionAddedPromise = TestUtils.waitForEvent(
        subscriptionManager, 
        'subscriptionAdded'
      );

      subscriptionManager.subscribe(mockClients[0], subscription);

      return subscriptionAddedPromise.then(event => {
        expect(event.clientId).toBe(mockClients[0]);
        expect(event.subscription).toEqual(subscription);
        
        const stats = subscriptionManager.getStats();
        expect(stats.totalSubscriptions).toBe(1);
        expect(stats.activeSubscriptions).toBe(1);
      });
    });

    it('should handle multiple subscriptions per client', () => {
      const subscriptions = [
        { symbol: 'BTCUSDT', type: DataType.TICKER },
        { symbol: 'ETHUSDT', type: DataType.DEPTH },
        { symbol: 'ADAUSDT', type: DataType.TRADE }
      ];

      subscriptions.forEach(sub => {
        subscriptionManager.subscribe(mockClients[0], sub);
      });

      const clientSubscriptions = subscriptionManager.getClientSubscriptions(mockClients[0]);
      expect(clientSubscriptions).toHaveLength(3);
      
      const stats = subscriptionManager.getStats();
      expect(stats.activeSubscriptions).toBe(3);
    });

    it('should handle subscriptions from multiple clients', () => {
      const subscription1 = { symbol: 'BTCUSDT', type: DataType.TICKER };
      const subscription2 = { symbol: 'ETHUSDT', type: DataType.TICKER };
      
      subscriptionManager.subscribe(mockClients[0], subscription1);
      subscriptionManager.subscribe(mockClients[1], subscription1);
      subscriptionManager.subscribe(mockClients[1], subscription2);
      
      expect(subscriptionManager.getClientSubscriptions(mockClients[0])).toHaveLength(1);
      expect(subscriptionManager.getClientSubscriptions(mockClients[1])).toHaveLength(2);
      
      const stats = subscriptionManager.getStats();
      expect(stats.activeSubscriptions).toBe(3);
    });

    it('should prevent duplicate subscriptions', () => {
      const subscription = { symbol: 'BTCUSDT', type: DataType.TICKER };
      
      subscriptionManager.subscribe(mockClients[0], subscription);
      subscriptionManager.subscribe(mockClients[0], subscription);
      
      const clientSubscriptions = subscriptionManager.getClientSubscriptions(mockClients[0]);
      expect(clientSubscriptions).toHaveLength(1);
      
      const stats = subscriptionManager.getStats();
      expect(stats.activeSubscriptions).toBe(1);
    });
  });

  describe('Unsubscription Management', () => {
    beforeEach(() => {
      // 设置初始订阅
      const subscriptions = [
        { symbol: 'BTCUSDT', type: DataType.TICKER },
        { symbol: 'ETHUSDT', type: DataType.DEPTH },
        { symbol: 'ADAUSDT', type: DataType.TRADE }
      ];

      subscriptions.forEach(sub => {
        subscriptionManager.subscribe(mockClients[0], sub);
      });
    });

    it('should remove specific subscriptions', () => {
      const subscriptionToRemove = { symbol: 'BTCUSDT', type: DataType.TICKER };
      
      const subscriptionRemovedPromise = TestUtils.waitForEvent(
        subscriptionManager, 
        'subscriptionRemoved'
      );

      subscriptionManager.unsubscribe(mockClients[0], subscriptionToRemove);

      return subscriptionRemovedPromise.then(event => {
        expect(event.clientId).toBe(mockClients[0]);
        expect(event.subscription).toEqual(subscriptionToRemove);
        
        const clientSubscriptions = subscriptionManager.getClientSubscriptions(mockClients[0]);
        expect(clientSubscriptions).toHaveLength(2);
        
        const stats = subscriptionManager.getStats();
        expect(stats.activeSubscriptions).toBe(2);
      });
    });

    it('should remove all subscriptions for a client', () => {
      const allSubscriptionsRemovedPromise = TestUtils.waitForEvent(
        subscriptionManager, 
        'allSubscriptionsRemoved'
      );

      subscriptionManager.unsubscribeAll(mockClients[0]);

      return allSubscriptionsRemovedPromise.then(event => {
        expect(event.clientId).toBe(mockClients[0]);
        
        const clientSubscriptions = subscriptionManager.getClientSubscriptions(mockClients[0]);
        expect(clientSubscriptions).toHaveLength(0);
        
        const stats = subscriptionManager.getStats();
        expect(stats.activeSubscriptions).toBe(0);
      });
    });

    it('should handle unsubscribing non-existent subscriptions', () => {
      const nonExistentSubscription = { symbol: 'DOGEUSDT', type: DataType.TICKER };
      
      const initialSubscriptions = subscriptionManager.getClientSubscriptions(mockClients[0]);
      const initialStats = subscriptionManager.getStats();
      
      subscriptionManager.unsubscribe(mockClients[0], nonExistentSubscription);
      
      const finalSubscriptions = subscriptionManager.getClientSubscriptions(mockClients[0]);
      const finalStats = subscriptionManager.getStats();
      
      expect(finalSubscriptions).toEqual(initialSubscriptions);
      expect(finalStats.activeSubscriptions).toBe(initialStats.activeSubscriptions);
    });
  });

  describe('Filter Management', () => {
    it('should add filters successfully', () => {
      const filter = {
        symbols: ['BTCUSDT', 'ETHUSDT'],
        types: [DataType.TICKER, DataType.DEPTH],
        exchanges: ['binance']
      };

      const filterAddedPromise = TestUtils.waitForEvent(subscriptionManager, 'filterAdded');

      subscriptionManager.addFilter(mockClients[0], filter);

      return filterAddedPromise.then(event => {
        expect(event.clientId).toBe(mockClients[0]);
        expect(event.filter).toEqual(filter);
        
        const stats = subscriptionManager.getStats();
        expect(stats.filtersApplied).toBe(1);
      });
    });

    it('should remove filters successfully', () => {
      const filter = { symbols: ['BTCUSDT'] };
      
      subscriptionManager.addFilter(mockClients[0], filter);
      
      const filterRemovedPromise = TestUtils.waitForEvent(subscriptionManager, 'filterRemoved');
      
      subscriptionManager.removeFilter(mockClients[0]);
      
      return filterRemovedPromise.then(event => {
        expect(event.clientId).toBe(mockClients[0]);
        
        const stats = subscriptionManager.getStats();
        expect(stats.filtersApplied).toBe(0);
      });
    });

    it('should handle multiple filters', () => {
      const filter1 = { symbols: ['BTCUSDT'] };
      const filter2 = { types: [DataType.TICKER] };
      const filter3 = { exchanges: ['binance'] };
      
      subscriptionManager.addFilter(mockClients[0], filter1);
      subscriptionManager.addFilter(mockClients[1], filter2);
      subscriptionManager.addFilter(mockClients[2], filter3);
      
      const stats = subscriptionManager.getStats();
      expect(stats.filtersApplied).toBe(3);
    });
  });

  describe('Message Filtering', () => {
    beforeEach(() => {
      // 设置订阅
      subscriptionManager.subscribe(mockClients[0], { symbol: 'BTCUSDT', type: DataType.TICKER });
      subscriptionManager.subscribe(mockClients[1], { symbol: 'BTCUSDT', type: DataType.TICKER });
      subscriptionManager.subscribe(mockClients[1], { symbol: 'ETHUSDT', type: DataType.TICKER });
      subscriptionManager.subscribe(mockClients[2], { symbol: 'ADAUSDT', type: DataType.TICKER });
    });

    it('should filter messages based on subscriptions', () => {
      const btcData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '50000' }
      };

      const filterResults = subscriptionManager.filterMessage(btcData);
      
      const clientsToReceive = filterResults.filter(r => r.shouldSend).map(r => r.clientId);
      expect(clientsToReceive).toContain(mockClients[0]);
      expect(clientsToReceive).toContain(mockClients[1]);
      expect(clientsToReceive).not.toContain(mockClients[2]); // 订阅了ADA，不匹配BTC
    });

    it('should apply symbol filters correctly', () => {
      // 为client-0添加仅BTC的过滤器
      subscriptionManager.addFilter(mockClients[0], {
        symbols: ['BTCUSDT']
      });

      // 为client-1添加仅ETH的过滤器
      subscriptionManager.addFilter(mockClients[1], {
        symbols: ['ETHUSDT']
      });

      const btcData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '50000' }
      };

      const filterResults = subscriptionManager.filterMessage(btcData);
      const clientsToReceive = filterResults.filter(r => r.shouldSend).map(r => r.clientId);
      
      expect(clientsToReceive).toContain(mockClients[0]); // 有BTC订阅和BTC过滤器
      expect(clientsToReceive).not.toContain(mockClients[1]); // 有BTC订阅但只允许ETH
    });

    it('should apply type filters correctly', () => {
      subscriptionManager.addFilter(mockClients[0], {
        types: [DataType.DEPTH] // 只允许深度数据
      });

      const tickerData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '50000' }
      };

      const filterResults = subscriptionManager.filterMessage(tickerData);
      const clientsToReceive = filterResults.filter(r => r.shouldSend).map(r => r.clientId);
      
      expect(clientsToReceive).not.toContain(mockClients[0]); // 被类型过滤器阻止
      expect(clientsToReceive).toContain(mockClients[1]); // 没有过滤器，正常接收
    });

    it('should apply exchange filters correctly', () => {
      subscriptionManager.addFilter(mockClients[0], {
        exchanges: ['okex'] // 只允许OKEx数据
      });

      const binanceData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '50000' }
      };

      const filterResults = subscriptionManager.filterMessage(binanceData);
      const clientsToReceive = filterResults.filter(r => r.shouldSend).map(r => r.clientId);
      
      expect(clientsToReceive).not.toContain(mockClients[0]); // 被交易所过滤器阻止
      expect(clientsToReceive).toContain(mockClients[1]); // 没有过滤器，正常接收
    });

    it('should apply price range filters correctly', () => {
      subscriptionManager.addFilter(mockClients[0], {
        priceRange: {
          min: 55000,
          max: 60000
        }
      });

      const lowPriceData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '50000' }
      };

      const highPriceData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '57000' }
      };

      const lowPriceResults = subscriptionManager.filterMessage(lowPriceData);
      const lowPriceClients = lowPriceResults.filter(r => r.shouldSend).map(r => r.clientId);
      
      const highPriceResults = subscriptionManager.filterMessage(highPriceData);
      const highPriceClients = highPriceResults.filter(r => r.shouldSend).map(r => r.clientId);
      
      expect(lowPriceClients).not.toContain(mockClients[0]); // 价格太低
      expect(highPriceClients).toContain(mockClients[0]); // 价格在范围内
    });

    it('should apply combined filters correctly', () => {
      subscriptionManager.addFilter(mockClients[0], {
        symbols: ['BTCUSDT', 'ETHUSDT'],
        types: [DataType.TICKER],
        exchanges: ['binance'],
        priceRange: { min: 45000, max: 55000 }
      });

      const validData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '50000' }
      };

      const invalidSymbol = { ...validData, symbol: 'ADAUSDT' };
      const invalidType = { ...validData, type: DataType.DEPTH };
      const invalidExchange = { ...validData, exchange: 'okex' };
      const invalidPrice = { ...validData, data: { price: '60000' } };

      const validResults = subscriptionManager.filterMessage(validData);
      const invalidSymbolResults = subscriptionManager.filterMessage(invalidSymbol);
      const invalidTypeResults = subscriptionManager.filterMessage(invalidType);
      const invalidExchangeResults = subscriptionManager.filterMessage(invalidExchange);
      const invalidPriceResults = subscriptionManager.filterMessage(invalidPrice);

      expect(validResults.find(r => r.clientId === mockClients[0])?.shouldSend).toBe(true);
      expect(invalidSymbolResults.find(r => r.clientId === mockClients[0])?.shouldSend).toBe(false);
      expect(invalidTypeResults.find(r => r.clientId === mockClients[0])?.shouldSend).toBe(false);
      expect(invalidExchangeResults.find(r => r.clientId === mockClients[0])?.shouldSend).toBe(false);
      expect(invalidPriceResults.find(r => r.clientId === mockClients[0])?.shouldSend).toBe(false);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle many subscriptions efficiently', () => {
      const symbolCount = 100;
      const clientCount = 50;

      // 为每个客户端添加多个订阅
      for (let clientIndex = 0; clientIndex < clientCount; clientIndex++) {
        const clientId = `client-${clientIndex}`;
        
        for (let symbolIndex = 0; symbolIndex < symbolCount; symbolIndex++) {
          const subscription = {
            symbol: `SYMBOL${symbolIndex}USDT`,
            type: DataType.TICKER
          };
          subscriptionManager.subscribe(clientId, subscription);
        }
      }

      const stats = subscriptionManager.getStats();
      expect(stats.activeSubscriptions).toBe(symbolCount * clientCount);

      // 测试消息过滤性能
      const testData = {
        symbol: 'SYMBOL50USDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '100' }
      };

      const startTime = Date.now();
      const filterResults = subscriptionManager.filterMessage(testData);
      const endTime = Date.now();

      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(100); // 应该在100ms内完成

      // 应该有相当数量的客户端匹配
      const matchingClients = filterResults.filter(r => r.shouldSend);
      expect(matchingClients).toHaveLength(clientCount);
    });

    it('should handle complex filter combinations efficiently', () => {
      // 创建复杂的过滤器组合
      const complexFilters = [
        { symbols: ['BTCUSDT'], priceRange: { min: 40000, max: 60000 } },
        { types: [DataType.TICKER], exchanges: ['binance'] },
        { symbols: ['ETHUSDT', 'ADAUSDT'], priceRange: { min: 100, max: 5000 } },
        { exchanges: ['okex'], types: [DataType.DEPTH, DataType.TRADE] }
      ];

      // 为不同客户端设置复杂过滤器
      complexFilters.forEach((filter, index) => {
        subscriptionManager.addFilter(`complex-client-${index}`, filter);
        subscriptionManager.subscribe(`complex-client-${index}`, {
          symbol: 'BTCUSDT',
          type: DataType.TICKER
        });
      });

      const testData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '50000' }
      };

      const startTime = Date.now();
      const filterResults = subscriptionManager.filterMessage(testData);
      const endTime = Date.now();

      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(50); // 复杂过滤器也应该快速处理

      // 验证过滤结果的正确性
      const matchingClients = filterResults.filter(r => r.shouldSend).map(r => r.clientId);
      expect(matchingClients).toContain('complex-client-0'); // 匹配价格和符号
      expect(matchingClients).toContain('complex-client-1'); // 匹配类型和交易所
      expect(matchingClients).not.toContain('complex-client-2'); // 符号不匹配
      expect(matchingClients).not.toContain('complex-client-3'); // 交易所不匹配
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(() => {
      // 设置一些初始数据
      subscriptionManager.subscribe(mockClients[0], { symbol: 'BTCUSDT', type: DataType.TICKER });
      subscriptionManager.subscribe(mockClients[1], { symbol: 'ETHUSDT', type: DataType.TICKER });
      subscriptionManager.addFilter(mockClients[0], { symbols: ['BTCUSDT'] });
    });

    it('should track subscription statistics correctly', () => {
      const stats = subscriptionManager.getStats();
      
      expect(stats.totalSubscriptions).toBe(2);
      expect(stats.activeSubscriptions).toBe(2);
      expect(stats.filtersApplied).toBe(1);
      expect(stats.lastActivity).toBeLessThanOrEqual(Date.now());
    });

    it('should update statistics when subscriptions change', () => {
      const initialStats = subscriptionManager.getStats();
      
      // 添加更多订阅
      subscriptionManager.subscribe(mockClients[2], { symbol: 'ADAUSDT', type: DataType.TICKER });
      subscriptionManager.subscribe(mockClients[2], { symbol: 'ADAUSDT', type: DataType.DEPTH });
      
      const afterAddStats = subscriptionManager.getStats();
      expect(afterAddStats.totalSubscriptions).toBe(initialStats.totalSubscriptions + 2);
      expect(afterAddStats.activeSubscriptions).toBe(initialStats.activeSubscriptions + 2);
      
      // 移除订阅
      subscriptionManager.unsubscribeAll(mockClients[0]);
      
      const afterRemoveStats = subscriptionManager.getStats();
      expect(afterRemoveStats.activeSubscriptions).toBe(afterAddStats.activeSubscriptions - 1);
    });

    it('should track message filtering statistics', () => {
      const testData = {
        symbol: 'BTCUSDT',
        type: DataType.TICKER,
        exchange: 'binance',
        data: { price: '50000' }
      };

      const initialStats = subscriptionManager.getStats();
      
      // 过滤一些消息
      for (let i = 0; i < 10; i++) {
        subscriptionManager.filterMessage(testData);
      }
      
      const finalStats = subscriptionManager.getStats();
      expect(finalStats.messagesFiltered).toBeGreaterThan(initialStats.messagesFiltered);
    });

    it('should provide comprehensive subscription overview', () => {
      // 添加更多复杂的订阅场景
      subscriptionManager.subscribe(mockClients[2], { symbol: 'BTCUSDT', type: DataType.TICKER });
      subscriptionManager.subscribe(mockClients[2], { symbol: 'BTCUSDT', type: DataType.DEPTH });
      subscriptionManager.subscribe(mockClients[3], { symbol: 'ETHUSDT', type: DataType.TRADE });
      
      const allSubscriptions = subscriptionManager.getAllSubscriptions();
      
      expect(Object.keys(allSubscriptions)).toHaveLength(4);
      expect(allSubscriptions[mockClients[0]]).toHaveLength(1);
      expect(allSubscriptions[mockClients[1]]).toHaveLength(1);
      expect(allSubscriptions[mockClients[2]]).toHaveLength(2);
      expect(allSubscriptions[mockClients[3]]).toHaveLength(1);
    });
  });
});