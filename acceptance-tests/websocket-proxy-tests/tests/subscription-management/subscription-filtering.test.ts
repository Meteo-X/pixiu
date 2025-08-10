/**
 * 订阅过滤测试
 * 测试WebSocket代理的订阅过滤和消息路由功能
 */

import { TestServerFactory, TestServerInstance } from '../../mocks/test-server-setup';
import { WebSocketClient, WebSocketClientPool } from '../../helpers/websocket-client-simulator';
import { MessageGenerator } from '../../helpers/message-generator';
import { PerformanceMonitor } from '../../helpers/performance-monitor';
import { TEST_CONFIG } from '../../setup';

describe('WebSocket代理 - 订阅过滤管理', () => {
  let testServer: TestServerInstance;
  let perfMonitor: PerformanceMonitor;

  beforeAll(async () => {
    testServer = await TestServerFactory.createTestServer('subscription-filtering', {
      websocketConfig: {
        heartbeatInterval: 10000,
        connectionTimeout: 30000,
        maxConnections: 50
      }
    });
    perfMonitor = new PerformanceMonitor();
  });

  afterAll(async () => {
    if (perfMonitor) {
      perfMonitor.stopMonitoring();
    }
    await TestServerFactory.closeTestServer('subscription-filtering');
  });

  beforeEach(() => {
    perfMonitor.reset();
    perfMonitor.startMonitoring(1000);
  });

  afterEach(() => {
    perfMonitor.stopMonitoring();
  });

  describe('基础订阅功能', () => {
    let client: WebSocketClient;

    beforeEach(async () => {
      client = new WebSocketClient({
        url: testServer.wsUrl
      });
      await client.connect();
    });

    afterEach(async () => {
      if (client.isConnected()) {
        await client.disconnect();
      }
    });

    it('应该能够创建订阅过滤器', (done) => {
      client.on('subscribed', (message) => {
        expect(message.type).toBe('subscribed');
        expect(message.payload).toHaveProperty('filterId');
        expect(message.payload.filter).toEqual({
          exchange: ['binance'],
          symbols: ['BTCUSDT'],
          dataTypes: ['trade']
        });
        done();
      });

      client.subscribe({
        exchange: ['binance'],
        symbols: ['BTCUSDT'],
        dataTypes: ['trade']
      }).catch(done);
    });

    it('应该支持多个订阅过滤器', async () => {
      const subscriptions = [
        {
          exchange: ['binance'],
          symbols: ['BTCUSDT'],
          dataTypes: ['trade']
        },
        {
          exchange: ['okex'],
          symbols: ['ETHUSDT'],
          dataTypes: ['ticker']
        },
        {
          exchange: ['huobi'],
          symbols: ['BNBUSDT'],
          dataTypes: ['kline']
        }
      ];

      const subscriptionPromises: Array<Promise<void>> = [];

      for (const subscription of subscriptions) {
        const promise = new Promise<void>((resolve, reject) => {
          const handler = (message: any) => {
            if (message.type === 'subscribed') {
              expect(message.payload.filter).toEqual(subscription);
              client.off('subscribed', handler);
              resolve();
            }
          };
          client.on('subscribed', handler);
          
          setTimeout(() => reject(new Error('Subscription timeout')), 5000);
        });
        
        subscriptionPromises.push(promise);
        await client.subscribe(subscription);
      }

      await Promise.all(subscriptionPromises);
    });

    it('应该支持取消订阅', async () => {
      // 先创建订阅
      let filterId: string = '';
      
      const subscribePromise = new Promise<void>((resolve) => {
        client.on('subscribed', (message) => {
          filterId = message.payload.filterId;
          resolve();
        });
      });

      await client.subscribe({
        exchange: ['binance'],
        symbols: ['BTCUSDT'],
        dataTypes: ['trade']
      });

      await subscribePromise;

      // 取消订阅
      const unsubscribePromise = new Promise<void>((resolve) => {
        client.on('unsubscribed', (message) => {
          expect(message.payload.filterId).toBe(filterId);
          resolve();
        });
      });

      await client.unsubscribe(filterId);
      await unsubscribePromise;
    });
  });

  describe('交易所过滤测试', () => {
    let clientPool: WebSocketClientPool;
    let clientIds: string[] = [];

    beforeEach(async () => {
      clientPool = new WebSocketClientPool({
        url: testServer.wsUrl
      });
      clientIds = await clientPool.createClients(3);

      // 设置不同的交易所订阅
      const client1 = clientPool.getClient(clientIds[0]);
      const client2 = clientPool.getClient(clientIds[1]);
      const client3 = clientPool.getClient(clientIds[2]);

      if (client1) await client1.subscribe({ exchange: ['binance'] });
      if (client2) await client2.subscribe({ exchange: ['okex'] });
      if (client3) await client3.subscribe({ exchange: ['binance', 'okex'] });

      // 等待订阅完成
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterEach(async () => {
      await clientPool.closeAllClients();
    });

    it('应该只向订阅了相应交易所的客户端发送消息', async () => {
      const testMessages = [
        MessageGenerator.generateMarketDataMessage('trade', 'binance', 'BTCUSDT'),
        MessageGenerator.generateMarketDataMessage('trade', 'okex', 'ETHUSDT'),
        MessageGenerator.generateMarketDataMessage('trade', 'huobi', 'ADAUSDT')
      ];

      const receivedMessages = new Map<string, any[]>();
      clientIds.forEach(id => receivedMessages.set(id, []));

      // 设置消息收集器
      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        if (client) {
          client.on('message', (message) => {
            if (message.type === 'data') {
              receivedMessages.get(clientId)?.push(message.payload);
            }
          });
        }
      }

      // 发送测试消息
      for (const message of testMessages) {
        await testServer.dataflowManager.routeMessage(message);
      }

      // 等待消息处理
      await new Promise(resolve => setTimeout(resolve, 500));

      // 验证过滤结果
      const client1Messages = receivedMessages.get(clientIds[0]) || [];
      const client2Messages = receivedMessages.get(clientIds[1]) || [];
      const client3Messages = receivedMessages.get(clientIds[2]) || [];

      // 客户端1只应该收到binance消息
      expect(client1Messages).toHaveLength(1);
      expect(client1Messages[0].exchange).toBe('binance');

      // 客户端2只应该收到okex消息
      expect(client2Messages).toHaveLength(1);
      expect(client2Messages[0].exchange).toBe('okex');

      // 客户端3应该收到binance和okex消息
      expect(client3Messages).toHaveLength(2);
      const exchanges = client3Messages.map(msg => msg.exchange).sort();
      expect(exchanges).toEqual(['binance', 'okex']);
    });

    it('应该处理不匹配任何订阅的消息', async () => {
      const unmatchedMessage = MessageGenerator.generateMarketDataMessage('trade', 'coinbase', 'BTCUSDT');
      
      const receivedMessages = new Map<string, any[]>();
      clientIds.forEach(id => receivedMessages.set(id, []));

      // 设置消息收集器
      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        if (client) {
          client.on('message', (message) => {
            if (message.type === 'data') {
              receivedMessages.get(clientId)?.push(message.payload);
            }
          });
        }
      }

      await testServer.dataflowManager.routeMessage(unmatchedMessage);
      await new Promise(resolve => setTimeout(resolve, 300));

      // 验证没有客户端收到消息
      for (const messages of receivedMessages.values()) {
        expect(messages).toHaveLength(0);
      }
    });
  });

  describe('交易对过滤测试', () => {
    let client1: WebSocketClient;
    let client2: WebSocketClient;

    beforeEach(async () => {
      client1 = new WebSocketClient({ url: testServer.wsUrl });
      client2 = new WebSocketClient({ url: testServer.wsUrl });

      await client1.connect();
      await client2.connect();

      // 设置不同的交易对订阅
      await client1.subscribe({
        exchange: ['binance'],
        symbols: ['BTCUSDT', 'ETHUSDT']
      });

      await client2.subscribe({
        exchange: ['binance'],
        symbols: ['BNBUSDT', 'ADAUSDT']
      });

      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterEach(async () => {
      if (client1.isConnected()) await client1.disconnect();
      if (client2.isConnected()) await client2.disconnect();
    });

    it('应该根据交易对过滤消息', async () => {
      const testMessages = [
        MessageGenerator.generateMarketDataMessage('trade', 'binance', 'BTCUSDT'),
        MessageGenerator.generateMarketDataMessage('trade', 'binance', 'ETHUSDT'),
        MessageGenerator.generateMarketDataMessage('trade', 'binance', 'BNBUSDT'),
        MessageGenerator.generateMarketDataMessage('trade', 'binance', 'ADAUSDT'),
        MessageGenerator.generateMarketDataMessage('trade', 'binance', 'DOTUSDT') // 不匹配任何订阅
      ];

      const client1Messages: any[] = [];
      const client2Messages: any[] = [];

      client1.on('message', (message) => {
        if (message.type === 'data') {
          client1Messages.push(message.payload);
        }
      });

      client2.on('message', (message) => {
        if (message.type === 'data') {
          client2Messages.push(message.payload);
        }
      });

      // 发送测试消息
      for (const message of testMessages) {
        await testServer.dataflowManager.routeMessage(message);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 验证客户端1收到BTCUSDT和ETHUSDT
      expect(client1Messages).toHaveLength(2);
      const client1Symbols = client1Messages.map(msg => msg.symbol).sort();
      expect(client1Symbols).toEqual(['BTCUSDT', 'ETHUSDT']);

      // 验证客户端2收到BNBUSDT和ADAUSDT
      expect(client2Messages).toHaveLength(2);
      const client2Symbols = client2Messages.map(msg => msg.symbol).sort();
      expect(client2Symbols).toEqual(['ADAUSDT', 'BNBUSDT']);
    });
  });

  describe('数据类型过滤测试', () => {
    let client1: WebSocketClient;
    let client2: WebSocketClient;

    beforeEach(async () => {
      client1 = new WebSocketClient({ url: testServer.wsUrl });
      client2 = new WebSocketClient({ url: testServer.wsUrl });

      await client1.connect();
      await client2.connect();

      // 设置不同的数据类型订阅
      await client1.subscribe({
        exchange: ['binance'],
        dataTypes: ['trade', 'ticker']
      });

      await client2.subscribe({
        exchange: ['binance'],
        dataTypes: ['kline', 'depth']
      });

      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterEach(async () => {
      if (client1.isConnected()) await client1.disconnect();
      if (client2.isConnected()) await client2.disconnect();
    });

    it('应该根据数据类型过滤消息', async () => {
      const testMessages = [
        MessageGenerator.generateMarketDataMessage('trade', 'binance', 'BTCUSDT'),
        MessageGenerator.generateMarketDataMessage('ticker', 'binance', 'BTCUSDT'),
        MessageGenerator.generateMarketDataMessage('kline', 'binance', 'BTCUSDT'),
        MessageGenerator.generateMarketDataMessage('depth', 'binance', 'BTCUSDT'),
        MessageGenerator.generateMarketDataMessage('bookTicker', 'binance', 'BTCUSDT') // 不匹配任何订阅
      ];

      const client1Messages: any[] = [];
      const client2Messages: any[] = [];

      client1.on('message', (message) => {
        if (message.type === 'data') {
          client1Messages.push(message.payload);
        }
      });

      client2.on('message', (message) => {
        if (message.type === 'data') {
          client2Messages.push(message.payload);
        }
      });

      // 发送测试消息
      for (const message of testMessages) {
        await testServer.dataflowManager.routeMessage(message);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 验证客户端1收到trade和ticker
      expect(client1Messages).toHaveLength(2);
      const client1Types = client1Messages.map(msg => msg.type).sort();
      expect(client1Types).toEqual(['ticker', 'trade']);

      // 验证客户端2收到kline和depth
      expect(client2Messages).toHaveLength(2);
      const client2Types = client2Messages.map(msg => msg.type).sort();
      expect(client2Types).toEqual(['depth', 'kline']);
    });
  });

  describe('复合过滤条件测试', () => {
    let client: WebSocketClient;

    beforeEach(async () => {
      client = new WebSocketClient({ url: testServer.wsUrl });
      await client.connect();

      // 设置复合过滤条件
      await client.subscribe({
        exchange: ['binance', 'okex'],
        symbols: ['BTCUSDT', 'ETHUSDT'],
        dataTypes: ['trade', 'ticker']
      });

      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterEach(async () => {
      if (client.isConnected()) await client.disconnect();
    });

    it('应该同时满足所有过滤条件', async () => {
      const testMessages = MessageGenerator.generateSubscriptionTestMessages(
        50,
        ['binance', 'okex'],
        ['BTCUSDT', 'ETHUSDT'],
        ['trade', 'ticker']
      );

      const receivedMessages: any[] = [];

      client.on('message', (message) => {
        if (message.type === 'data') {
          receivedMessages.push(message.payload);
        }
      });

      // 发送测试消息
      await testServer.dataflowManager.routeMessages(testMessages);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证所有收到的消息都满足过滤条件
      expect(receivedMessages.length).toBeGreaterThan(0);
      
      for (const message of receivedMessages) {
        expect(['binance', 'okex']).toContain(message.exchange);
        expect(['BTCUSDT', 'ETHUSDT']).toContain(message.symbol);
        expect(['trade', 'ticker']).toContain(message.type);
      }

      // 验证消息匹配标记
      const matchingMessages = receivedMessages.filter(msg => msg.data.shouldMatch);
      const totalMatchingInTestData = testMessages.filter(msg => msg.data.shouldMatch).length;
      
      // 应该收到大部分匹配的消息
      expect(matchingMessages.length).toBeGreaterThan(totalMatchingInTestData * 0.8);
    });

    it('应该拒绝不满足条件的消息', async () => {
      const unmatchedMessages = [
        MessageGenerator.generateMarketDataMessage('trade', 'huobi', 'BTCUSDT'), // 错误交易所
        MessageGenerator.generateMarketDataMessage('trade', 'binance', 'BNBUSDT'), // 错误交易对
        MessageGenerator.generateMarketDataMessage('kline', 'binance', 'BTCUSDT'), // 错误数据类型
        MessageGenerator.generateMarketDataMessage('kline', 'huobi', 'BNBUSDT')    // 全部错误
      ];

      const receivedMessages: any[] = [];

      client.on('message', (message) => {
        if (message.type === 'data') {
          receivedMessages.push(message.payload);
        }
      });

      // 发送不匹配的消息
      for (const message of unmatchedMessages) {
        await testServer.dataflowManager.routeMessage(message);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 应该没有收到任何消息
      expect(receivedMessages).toHaveLength(0);
    });
  });

  describe('订阅统计和优化', () => {
    let clientPool: WebSocketClientPool;

    beforeEach(async () => {
      clientPool = new WebSocketClientPool({
        url: testServer.wsUrl
      });
    });

    afterEach(async () => {
      await clientPool.closeAllClients();
    });

    it('应该统计订阅数量和匹配率', async () => {
      const clientIds = await clientPool.createClients(5);

      // 创建不同的订阅
      for (let i = 0; i < clientIds.length; i++) {
        const client = clientPool.getClient(clientIds[i]);
        if (client) {
          await client.subscribe({
            exchange: ['binance'],
            symbols: [`SYMBOL_${i}`],
            dataTypes: ['trade']
          });
        }
      }

      // 发送测试消息
      const testMessages = [];
      for (let i = 0; i < 10; i++) {
        testMessages.push(
          MessageGenerator.generateMarketDataMessage(
            'trade', 
            'binance', 
            `SYMBOL_${i % 3}` // 只有前3个客户端会匹配
          )
        );
      }

      let totalMessagesReceived = 0;
      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        if (client) {
          client.on('message', (message) => {
            if (message.type === 'data') {
              totalMessagesReceived++;
            }
          });
        }
      }

      // 发送消息
      for (const message of testMessages) {
        await testServer.dataflowManager.routeMessage(message);
      }

      await new Promise(resolve => setTimeout(resolve, 800));

      // 验证统计数据
      const proxyStats = testServer.proxy.getConnectionStats();
      expect(proxyStats.activeConnections).toBe(5);
      expect(proxyStats.totalSubscriptions).toBe(5);

      // 验证匹配效率（应该有选择性地发送消息）
      expect(totalMessagesReceived).toBeGreaterThan(0);
      expect(totalMessagesReceived).toBeLessThan(testMessages.length * clientIds.length);
    });

    it('应该处理重复订阅优化', async () => {
      const clientIds = await clientPool.createClients(3);

      // 创建相同的订阅
      const identicalSubscription = {
        exchange: ['binance'],
        symbols: ['BTCUSDT'],
        dataTypes: ['trade']
      };

      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        if (client) {
          await client.subscribe(identicalSubscription);
        }
      }

      // 发送匹配的消息
      const testMessage = MessageGenerator.generateMarketDataMessage('trade', 'binance', 'BTCUSDT');
      
      let messageCount = 0;
      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        if (client) {
          client.on('message', (message) => {
            if (message.type === 'data') {
              messageCount++;
            }
          });
        }
      }

      await testServer.dataflowManager.routeMessage(testMessage);
      await new Promise(resolve => setTimeout(resolve, 300));

      // 所有客户端都应该收到消息
      expect(messageCount).toBe(3);
    });

    it('应该在客户端断开后清理订阅', async () => {
      const clientIds = await clientPool.createClients(3);

      // 创建订阅
      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        if (client) {
          await client.subscribe({
            exchange: ['binance'],
            symbols: ['BTCUSDT'],
            dataTypes: ['trade']
          });
        }
      }

      const initialStats = testServer.proxy.getConnectionStats();
      expect(initialStats.totalSubscriptions).toBe(3);

      // 断开一个客户端
      const clientToDisconnect = clientPool.getClient(clientIds[0]);
      if (clientToDisconnect) {
        await clientToDisconnect.disconnect();
      }

      // 等待清理
      await new Promise(resolve => setTimeout(resolve, 300));

      const finalStats = testServer.proxy.getConnectionStats();
      expect(finalStats.activeConnections).toBe(2);
      expect(finalStats.totalSubscriptions).toBe(2);
    });
  });

  describe('订阅过滤性能测试', () => {
    it('应该在高订阅数量下保持良好性能', async () => {
      const clientPool = new WebSocketClientPool({
        url: testServer.wsUrl
      });

      const clientCount = 20;
      const clientIds = await clientPool.createClients(clientCount);

      const startTime = Date.now();

      // 为每个客户端创建不同的订阅
      for (let i = 0; i < clientIds.length; i++) {
        const client = clientPool.getClient(clientIds[i]);
        if (client) {
          await client.subscribe({
            exchange: ['binance'],
            symbols: [`PAIR_${i}`],
            dataTypes: ['trade']
          });
        }
      }

      const subscriptionTime = Date.now() - startTime;
      expect(subscriptionTime).toBeLessThan(2000); // 2秒内完成所有订阅

      // 测试消息过滤性能
      const messageCount = 100;
      const filterStartTime = Date.now();

      for (let i = 0; i < messageCount; i++) {
        const message = MessageGenerator.generateMarketDataMessage(
          'trade',
          'binance',
          `PAIR_${i % clientCount}` // 轮询分配给不同客户端
        );
        await testServer.dataflowManager.routeMessage(message);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      const filteringTime = Date.now() - filterStartTime;

      // 过滤性能验证
      const avgFilteringTimePerMessage = filteringTime / messageCount;
      expect(avgFilteringTimePerMessage).toBeLessThan(10); // 每条消息过滤时间<10ms

      await clientPool.closeAllClients();
      
      global.collectTestMetric('subscription-filtering-performance', {
        clientCount,
        messageCount,
        subscriptionTime,
        filteringTime,
        avgFilteringTimePerMessage,
        performanceSummary: perfMonitor.getPerformanceSummary()
      });
    });
  });
});