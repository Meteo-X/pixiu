import request from 'supertest';
import express from 'express';
import { BaseMonitor } from '@pixiu/shared-core';
import { AdapterRegistry } from '../../src/adapters/registry/adapter-registry';
import { DataStreamCache } from '../../src/cache';
import { createSubscriptionRouter } from '../../src/api/subscriptions';

describe('Subscription API', () => {
  let app: express.Application;
  let adapterRegistry: AdapterRegistry;
  let monitor: BaseMonitor;
  let dataStreamCache: DataStreamCache;

  beforeEach(() => {
    // 创建模拟对象
    monitor = {
      log: jest.fn()
    } as any;

    // 模拟适配器注册中心
    const mockAdapter = {
      getMetrics: jest.fn().mockReturnValue({
        adapterStatus: 'CONNECTED',
        messagesReceived: 1000,
        bytesReceived: 50000,
        errorCount: 0
      }),
      isHealthy: jest.fn().mockReturnValue(true),
      getAdapterStatus: jest.fn().mockReturnValue('CONNECTED')
    };

    adapterRegistry = {
      getAllInstances: jest.fn().mockReturnValue(new Map([
        ['binance', mockAdapter]
      ])),
      getInstance: jest.fn().mockImplementation((exchange) => {
        if (exchange === 'binance') return mockAdapter;
        return null;
      })
    } as any;

    // 模拟数据流缓存
    dataStreamCache = {
      getSummary: jest.fn().mockReturnValue({
        totalEntries: 100,
        totalKeys: 10,
        hitRate: 0.95,
        averageEntriesPerKey: 10,
        oldestEntry: Date.now() - 300000,
        newestEntry: Date.now()
      })
    } as any;

    // 创建 Express 应用
    app = express();
    app.use(express.json());
    app.use('/api/subscriptions', createSubscriptionRouter(adapterRegistry, monitor, dataStreamCache));
  });

  describe('GET /api/subscriptions', () => {
    it('should return list of subscriptions', async () => {
      const response = await request(app)
        .get('/api/subscriptions')
        .expect(200);

      expect(response.body).toHaveProperty('subscriptions');
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.subscriptions)).toBe(true);
      
      expect(response.body.summary).toHaveProperty('total');
      expect(response.body.summary).toHaveProperty('active');
      expect(response.body.summary).toHaveProperty('paused');
      expect(response.body.summary).toHaveProperty('error');
    });

    it('should include subscription details', async () => {
      const response = await request(app)
        .get('/api/subscriptions')
        .expect(200);

      if (response.body.subscriptions.length > 0) {
        const subscription = response.body.subscriptions[0];
        expect(subscription).toHaveProperty('exchange');
        expect(subscription).toHaveProperty('symbol');
        expect(subscription).toHaveProperty('dataTypes');
        expect(subscription).toHaveProperty('status');
        expect(subscription).toHaveProperty('metrics');
        
        expect(subscription.metrics).toHaveProperty('messagesReceived');
        expect(subscription.metrics).toHaveProperty('lastUpdate');
        expect(subscription.metrics).toHaveProperty('bytesReceived');
        expect(subscription.metrics).toHaveProperty('errorCount');
      }
    });
  });

  describe('POST /api/subscriptions', () => {
    it('should add new subscription successfully', async () => {
      const newSubscription = {
        exchange: 'binance',
        symbol: 'ETHUSDT',
        dataTypes: ['ticker', 'depth']
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .send(newSubscription)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('subscription');
      expect(response.body).toHaveProperty('message');
      
      expect(response.body.subscription).toMatchObject({
        exchange: newSubscription.exchange,
        symbol: newSubscription.symbol,
        dataTypes: newSubscription.dataTypes,
        status: 'active'
      });
    });

    it('should return 400 for invalid request body', async () => {
      const invalidSubscription = {
        exchange: 'binance',
        // missing symbol and dataTypes
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .send(invalidSubscription)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for unknown exchange', async () => {
      const subscription = {
        exchange: 'unknown-exchange',
        symbol: 'BTCUSDT',
        dataTypes: ['ticker']
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .send(subscription)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Exchange not found');
    });
  });

  describe('DELETE /api/subscriptions/:exchange/:symbol', () => {
    it('should delete subscription successfully', async () => {
      const response = await request(app)
        .delete('/api/subscriptions/binance/BTCUSDT')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for unknown exchange', async () => {
      const response = await request(app)
        .delete('/api/subscriptions/unknown-exchange/BTCUSDT')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Exchange not found');
    });
  });

  describe('POST /api/subscriptions/batch', () => {
    it('should execute batch operations successfully', async () => {
      const batchOperation = {
        action: 'start',
        subscriptions: [
          { exchange: 'binance', symbol: 'BTCUSDT' },
          { exchange: 'binance', symbol: 'ETHUSDT' }
        ]
      };

      const response = await request(app)
        .post('/api/subscriptions/batch')
        .send(batchOperation)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('summary');
      
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.summary).toHaveProperty('total');
      expect(response.body.summary).toHaveProperty('successful');
      expect(response.body.summary).toHaveProperty('failed');
    });

    it('should validate batch operation request', async () => {
      const invalidBatch = {
        action: 'invalid-action',
        subscriptions: []
      };

      const response = await request(app)
        .post('/api/subscriptions/batch')
        .send(invalidBatch)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle mixed success/failure results', async () => {
      const batchOperation = {
        action: 'start',
        subscriptions: [
          { exchange: 'binance', symbol: 'BTCUSDT' },
          { exchange: 'unknown-exchange', symbol: 'ETHUSDT' }
        ]
      };

      const response = await request(app)
        .post('/api/subscriptions/batch')
        .send(batchOperation)
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0].success).toBe(true);
      expect(response.body.results[1].success).toBe(false);
      expect(response.body.results[1]).toHaveProperty('error');
      
      expect(response.body.summary.successful).toBe(1);
      expect(response.body.summary.failed).toBe(1);
    });

    it('should support different batch actions', async () => {
      const actions = ['start', 'stop', 'delete'];
      
      for (const action of actions) {
        const batchOperation = {
          action,
          subscriptions: [
            { exchange: 'binance', symbol: 'BTCUSDT' }
          ]
        };

        const response = await request(app)
          .post('/api/subscriptions/batch')
          .send(batchOperation)
          .expect(200);

        expect(response.body.results[0].success).toBe(true);
      }
    });
  });

  describe('GET /api/subscriptions/stats', () => {
    it('should return subscription statistics', async () => {
      const response = await request(app)
        .get('/api/subscriptions/stats')
        .expect(200);

      expect(response.body).toHaveProperty('totalAdapters');
      expect(response.body).toHaveProperty('totalSubscriptions');
      expect(response.body).toHaveProperty('activeSubscriptions');
      expect(response.body).toHaveProperty('errorSubscriptions');
      expect(response.body).toHaveProperty('byExchange');
      expect(response.body).toHaveProperty('cacheStats');
      expect(response.body).toHaveProperty('timestamp');
      
      expect(typeof response.body.totalAdapters).toBe('number');
      expect(typeof response.body.totalSubscriptions).toBe('number');
      expect(typeof response.body.activeSubscriptions).toBe('number');
      expect(typeof response.body.errorSubscriptions).toBe('number');
      expect(typeof response.body.byExchange).toBe('object');
    });

    it('should include exchange-specific statistics', async () => {
      const response = await request(app)
        .get('/api/subscriptions/stats')
        .expect(200);

      expect(response.body.byExchange).toHaveProperty('binance');
      
      const binanceStats = response.body.byExchange.binance;
      expect(binanceStats).toHaveProperty('subscriptions');
      expect(binanceStats).toHaveProperty('status');
      expect(binanceStats).toHaveProperty('metrics');
    });

    it('should include cache statistics', async () => {
      const response = await request(app)
        .get('/api/subscriptions/stats')
        .expect(200);

      expect(response.body.cacheStats).toHaveProperty('totalEntries');
      expect(response.body.cacheStats).toHaveProperty('totalKeys');
      expect(response.body.cacheStats).toHaveProperty('hitRate');
      expect(response.body.cacheStats).toHaveProperty('averageEntriesPerKey');
    });
  });

  describe('Error Handling', () => {
    it('should handle adapter registry errors gracefully', async () => {
      // 模拟适配器注册中心错误
      (adapterRegistry.getAllInstances as jest.Mock).mockImplementation(() => {
        throw new Error('Registry error');
      });

      const response = await request(app)
        .get('/api/subscriptions')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    it('should handle individual adapter errors', async () => {
      // 模拟单个适配器错误
      const mockAdapter = {
        getMetrics: jest.fn().mockImplementation(() => {
          throw new Error('Adapter error');
        }),
        isHealthy: jest.fn().mockReturnValue(false)
      };

      (adapterRegistry.getAllInstances as jest.Mock).mockReturnValue(new Map([
        ['error-exchange', mockAdapter]
      ]));

      const response = await request(app)
        .get('/api/subscriptions')
        .expect(200);

      // 即使有错误，API 也应该返回成功，但不包含错误适配器的数据
      expect(response.body).toHaveProperty('subscriptions');
      expect(monitor.log).toHaveBeenCalledWith(
        'error',
        'Error getting subscriptions for adapter',
        expect.objectContaining({
          exchange: 'error-exchange'
        })
      );
    });

    it('should validate subscription data types', async () => {
      const invalidSubscription = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        dataTypes: 'not-an-array' // 应该是数组
      };

      const response = await request(app)
        .post('/api/subscriptions')
        .send(invalidSubscription)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('dataTypes are required');
    });
  });
});