/**
 * 基础消息转发测试
 * 测试WebSocket代理的消息转发功能
 */

import { TestServerFactory, TestServerInstance } from '../../mocks/test-server-setup';
import { WebSocketClient, WebSocketClientPool } from '../../helpers/websocket-client-simulator';
import { MessageGenerator } from '../../helpers/message-generator';
import { PerformanceMonitor } from '../../helpers/performance-monitor';
import { TEST_CONFIG } from '../../setup';

describe('WebSocket代理 - 基础消息转发', () => {
  let testServer: TestServerInstance;
  let perfMonitor: PerformanceMonitor;

  beforeAll(async () => {
    testServer = await TestServerFactory.createTestServer('message-forwarding', {
      websocketConfig: {
        heartbeatInterval: 10000,
        connectionTimeout: 30000,
        maxConnections: 100
      },
      dataflowConfig: {
        enableLatencySimulation: false
      }
    });
    perfMonitor = new PerformanceMonitor({
      maxLatency: TEST_CONFIG.PERFORMANCE_THRESHOLDS.messageLatency
    });
  });

  afterAll(async () => {
    if (perfMonitor) {
      perfMonitor.stopMonitoring();
    }
    await TestServerFactory.closeTestServer('message-forwarding');
  });

  beforeEach(() => {
    perfMonitor.reset();
    perfMonitor.startMonitoring(1000);
    testServer.dataflowManager.resetStats();
  });

  afterEach(() => {
    perfMonitor.stopMonitoring();
  });

  describe('单客户端消息转发', () => {
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

    it('应该能够转发简单消息', (done) => {
      const testMessage = MessageGenerator.generateMarketDataMessage('trade', 'binance', 'BTCUSDT');
      
      client.on('message', (message) => {
        if (message.type === 'data' && message.payload) {
          expect(message.payload.type).toBe('trade');
          expect(message.payload.exchange).toBe('binance');
          expect(message.payload.symbol).toBe('BTCUSDT');
          expect(message.payload.data).toBeDefined();
          expect(message.timestamp).toBeDefined();
          done();
        }
      });

      // 模拟从DataFlow收到消息并转发
      testServer.dataflowManager.routeMessage(testMessage).catch(done);
    });

    it('应该保持消息完整性', (done) => {
      const originalMessage = MessageGenerator.generateMarketDataMessage('ticker', 'okex', 'ETHUSDT');
      const originalData = JSON.parse(JSON.stringify(originalMessage.data));
      
      client.on('message', (message) => {
        if (message.type === 'data' && message.payload) {
          // 验证消息数据未被修改
          expect(message.payload.data).toEqual(originalData);
          expect(message.payload.timestamp).toBe(originalMessage.timestamp);
          done();
        }
      });

      testServer.dataflowManager.routeMessage(originalMessage).catch(done);
    });

    it('应该处理不同大小的消息', async () => {
      const messageSizes = [
        TEST_CONFIG.TEST_DATA.smallMessageSize,
        TEST_CONFIG.TEST_DATA.mediumMessageSize,
        TEST_CONFIG.TEST_DATA.largeMessageSize
      ];

      for (const size of messageSizes) {
        const message = MessageGenerator.generateSizedMessage(size, 'size_test');
        const receivedMessages: any[] = [];

        const messagePromise = new Promise<void>((resolve) => {
          client.on('message', (msg) => {
            if (msg.type === 'data' && msg.payload && msg.payload.type === 'size_test') {
              receivedMessages.push(msg);
              resolve();
            }
          });
        });

        await testServer.dataflowManager.routeMessage(message);
        await messagePromise;

        expect(receivedMessages).toHaveLength(1);
        const receivedMessage = receivedMessages[0];
        expect(receivedMessage.payload.payload.size).toBe(size);
      }
    });

    it('应该在合理时间内转发消息', async () => {
      const testMessage = MessageGenerator.generateMarketDataMessage('trade', 'binance', 'BTCUSDT');
      const latencies: number[] = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        
        const messagePromise = new Promise<void>((resolve) => {
          client.on('message', (msg) => {
            if (msg.type === 'data' && msg.payload && msg.payload.data.testIndex === i) {
              const latency = Date.now() - startTime;
              latencies.push(latency);
              perfMonitor.recordLatency(latency);
              resolve();
            }
          });
        });

        const testMsg = { ...testMessage, data: { ...testMessage.data, testIndex: i } };
        await testServer.dataflowManager.routeMessage(testMsg);
        await messagePromise;
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.messageLatency);

      const maxLatency = Math.max(...latencies);
      expect(maxLatency).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.messageLatency * 2);
    });

    it('应该处理特殊字符和Unicode消息', (done) => {
      const specialMessage = {
        type: 'special_chars',
        exchange: 'binance',
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        data: {
          chinese: '比特币',
          emoji: '🚀💰📈',
          special: '!@#$%^&*()_+-={}[]|\\:";\'<>?,./',
          unicode: '\u0048\u0065\u006c\u006c\u006f\u0020\u4e16\u754c'
        }
      };

      client.on('message', (message) => {
        if (message.type === 'data' && message.payload && message.payload.type === 'special_chars') {
          expect(message.payload.data.chinese).toBe('比特币');
          expect(message.payload.data.emoji).toBe('🚀💰📈');
          expect(message.payload.data.special).toBe('!@#$%^&*()_+-={}[]|\\:";\'<>?,./')
          expect(message.payload.data.unicode).toBe('\u0048\u0065\u006c\u006c\u006f\u0020\u4e16\u754c');
          done();
        }
      });

      testServer.dataflowManager.routeMessage(specialMessage).catch(done);
    });
  });

  describe('多客户端消息转发', () => {
    let clientPool: WebSocketClientPool;
    let clientIds: string[] = [];

    beforeEach(async () => {
      clientPool = new WebSocketClientPool({
        url: testServer.wsUrl
      });
      clientIds = await clientPool.createClients(5);
    });

    afterEach(async () => {
      await clientPool.closeAllClients();
    });

    it('应该向所有连接的客户端广播消息', (done) => {
      const testMessage = MessageGenerator.generateMarketDataMessage('broadcast_test');
      const receivedCounts = new Map<string, number>();
      let completedClients = 0;

      // 监听每个客户端的消息
      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        if (client) {
          client.on('message', (message) => {
            if (message.type === 'data' && message.payload && message.payload.type === 'broadcast_test') {
              receivedCounts.set(clientId, (receivedCounts.get(clientId) || 0) + 1);
              completedClients++;
              
              if (completedClients === clientIds.length) {
                // 验证所有客户端都收到了消息
                expect(receivedCounts.size).toBe(clientIds.length);
                for (const count of receivedCounts.values()) {
                  expect(count).toBe(1);
                }
                done();
              }
            }
          });
        }
      }

      testServer.dataflowManager.routeMessage(testMessage).catch(done);
    });

    it('应该支持批量消息转发', async () => {
      const messageCount = 20;
      const messages = MessageGenerator.generateBatchMessages({
        messageCount,
        messageTypes: ['batch_test'],
        exchanges: ['binance'],
        symbols: ['BTCUSDT'],
        dataTypes: ['trade'],
        sizeRange: { min: 100, max: 1000 },
        timeRange: { start: Date.now(), end: Date.now() + 1000 }
      });

      const receivedMessages = new Map<string, any[]>();

      // 为每个客户端设置消息收集器
      for (const clientId of clientIds) {
        const client = clientPool.getClient(clientId);
        if (client) {
          receivedMessages.set(clientId, []);
          client.on('message', (message) => {
            if (message.type === 'data' && message.payload && message.payload.type === 'batch_test') {
              receivedMessages.get(clientId)?.push(message);
            }
          });
        }
      }

      // 批量发送消息
      await testServer.dataflowManager.routeMessages(messages);

      // 等待消息传递完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证每个客户端都收到了所有消息
      for (const [clientId, clientMessages] of receivedMessages) {
        expect(clientMessages).toHaveLength(messageCount);
      }
    });

    it('应该在客户端断开时停止向其转发消息', async () => {
      const testMessage = MessageGenerator.generateMarketDataMessage('disconnect_test');
      
      // 断开一个客户端
      const disconnectClientId = clientIds[0];
      const disconnectClient = clientPool.getClient(disconnectClientId);
      await disconnectClient?.disconnect();

      // 等待服务器处理断开事件
      await new Promise(resolve => setTimeout(resolve, 200));

      const remainingClientIds = clientIds.slice(1);
      const receivedCounts = new Map<string, number>();
      let completedClients = 0;

      // 监听剩余客户端的消息
      for (const clientId of remainingClientIds) {
        const client = clientPool.getClient(clientId);
        if (client && client.isConnected()) {
          client.on('message', (message) => {
            if (message.type === 'data' && message.payload && message.payload.type === 'disconnect_test') {
              receivedCounts.set(clientId, (receivedCounts.get(clientId) || 0) + 1);
              completedClients++;
            }
          });
        }
      }

      await testServer.dataflowManager.routeMessage(testMessage);
      
      // 等待消息传递
      await new Promise(resolve => setTimeout(resolve, 500));

      // 验证只有连接的客户端收到了消息
      expect(receivedCounts.size).toBe(remainingClientIds.length);
      expect(receivedCounts.has(disconnectClientId)).toBe(false);
    });
  });

  describe('消息格式和协议测试', () => {
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

    it('应该使用正确的消息格式', (done) => {
      const testMessage = MessageGenerator.generateMarketDataMessage('format_test');

      client.on('message', (message) => {
        if (message.type === 'data' && message.payload && message.payload.type === 'format_test') {
          // 验证代理消息格式
          expect(message).toHaveProperty('type', 'data');
          expect(message).toHaveProperty('payload');
          expect(message).toHaveProperty('timestamp');
          expect(typeof message.timestamp).toBe('number');
          
          // 验证有效载荷格式
          expect(message.payload).toHaveProperty('type');
          expect(message.payload).toHaveProperty('exchange');
          expect(message.payload).toHaveProperty('symbol');
          expect(message.payload).toHaveProperty('timestamp');
          expect(message.payload).toHaveProperty('data');
          
          done();
        }
      });

      testServer.dataflowManager.routeMessage(testMessage).catch(done);
    });

    it('应该保持消息时间戳的准确性', (done) => {
      const originalTimestamp = Date.now();
      const testMessage = {
        type: 'timestamp_test',
        exchange: 'binance',
        symbol: 'BTCUSDT',
        timestamp: originalTimestamp,
        data: { test: true }
      };

      client.on('message', (message) => {
        if (message.type === 'data' && message.payload && message.payload.type === 'timestamp_test') {
          // 原始时间戳应该被保留
          expect(message.payload.timestamp).toBe(originalTimestamp);
          
          // 代理时间戳应该是新的
          expect(message.timestamp).toBeGreaterThanOrEqual(originalTimestamp);
          expect(message.timestamp).toBeLessThanOrEqual(Date.now());
          
          done();
        }
      });

      testServer.dataflowManager.routeMessage(testMessage).catch(done);
    });

    it('应该处理空或null数据', (done) => {
      const testCases = [
        { data: null },
        { data: undefined },
        { data: {} },
        { data: [] }
      ];

      let completedTests = 0;

      client.on('message', (message) => {
        if (message.type === 'data' && message.payload && message.payload.type === 'null_data_test') {
          completedTests++;
          
          if (completedTests === testCases.length) {
            done();
          }
        }
      });

      // 发送所有测试用例
      for (const testData of testCases) {
        const testMessage = {
          type: 'null_data_test',
          exchange: 'binance',
          symbol: 'BTCUSDT',
          timestamp: Date.now(),
          ...testData
        };
        
        testServer.dataflowManager.routeMessage(testMessage).catch(done);
      }
    });
  });

  describe('消息转发性能测试', () => {
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

    it('应该能够处理高频消息转发', async () => {
      const messageCount = 100;
      const messagesPerSecond = 50;
      const messages = MessageGenerator.generateHighFrequencyMessages(
        2000, // 2秒持续时间
        messagesPerSecond,
        'high_frequency_test'
      );

      const receivedMessages: any[] = [];
      const latencies: number[] = [];

      client.on('message', (message) => {
        if (message.type === 'data' && message.payload && message.payload.type === 'high_frequency_test') {
          const receivedTime = Date.now();
          const sentTime = message.payload.timestamp;
          const latency = receivedTime - sentTime;
          
          receivedMessages.push(message);
          latencies.push(latency);
          perfMonitor.recordLatency(latency);
        }
      });

      // 高频发送消息
      const startTime = Date.now();
      for (const message of messages) {
        await testServer.dataflowManager.routeMessage(message);
        
        // 控制发送频率
        const expectedTime = startTime + (messages.indexOf(message) * (1000 / messagesPerSecond));
        const currentTime = Date.now();
        if (currentTime < expectedTime) {
          await new Promise(resolve => setTimeout(resolve, expectedTime - currentTime));
        }
      }

      // 等待所有消息处理完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证消息接收
      expect(receivedMessages.length).toBeGreaterThan(messages.length * 0.9); // 至少90%的消息

      // 验证延迟性能
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.messageLatency);

      const maxLatency = Math.max(...latencies);
      expect(maxLatency).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.messageLatency * 3);
    });

    it('应该维持稳定的吞吐量', async () => {
      const messageCount = 200;
      const batchSize = 10;
      const batches = Math.ceil(messageCount / batchSize);
      
      const throughputMeasurements: number[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const batchMessages = [];
        
        for (let i = 0; i < batchSize; i++) {
          batchMessages.push(
            MessageGenerator.generateMarketDataMessage('throughput_test', 'binance', 'BTCUSDT')
          );
        }

        const batchStartTime = Date.now();
        
        // 发送批次消息
        for (const message of batchMessages) {
          await testServer.dataflowManager.routeMessage(message);
        }

        const batchEndTime = Date.now();
        const batchDuration = batchEndTime - batchStartTime;
        const batchThroughput = (batchSize / batchDuration) * 1000; // messages/second
        
        throughputMeasurements.push(batchThroughput);

        // 批次间短暂暂停
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 验证吞吐量稳定性
      const avgThroughput = throughputMeasurements.reduce((a, b) => a + b, 0) / throughputMeasurements.length;
      const minThroughput = Math.min(...throughputMeasurements);
      const maxThroughput = Math.max(...throughputMeasurements);

      // 吞吐量变化不应该太大
      const throughputVariation = (maxThroughput - minThroughput) / avgThroughput;
      expect(throughputVariation).toBeLessThan(0.5); // 变化不超过50%

      expect(avgThroughput).toBeGreaterThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.minThroughput);
    });
  });

  describe('错误处理和容错测试', () => {
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

    it('应该处理无效的消息格式', async () => {
      const invalidMessages = [
        undefined,
        null,
        '',
        'invalid json',
        { /* 缺少必要字段 */ },
        { type: null, data: undefined }
      ];

      for (const invalidMessage of invalidMessages) {
        try {
          await testServer.dataflowManager.routeMessage(invalidMessage as any);
        } catch (error) {
          // 预期的错误，应该被正确处理
          expect(error).toBeDefined();
        }
      }

      // 验证服务器仍然正常工作
      const validMessage = MessageGenerator.generateMarketDataMessage('recovery_test');
      let messageReceived = false;

      client.on('message', (message) => {
        if (message.type === 'data' && message.payload && message.payload.type === 'recovery_test') {
          messageReceived = true;
        }
      });

      await testServer.dataflowManager.routeMessage(validMessage);
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(messageReceived).toBe(true);
    });

    it('应该在转发错误后继续正常工作', async () => {
      // 启用错误模拟
      testServer.dataflowManager.setErrorSimulation(true, 0.5); // 50%错误率

      const messageCount = 10;
      const receivedMessages: any[] = [];

      client.on('message', (message) => {
        if (message.type === 'data' && message.payload && message.payload.type === 'error_recovery_test') {
          receivedMessages.push(message);
        }
      });

      // 发送多条消息，部分会失败
      for (let i = 0; i < messageCount; i++) {
        const message = MessageGenerator.generateMarketDataMessage('error_recovery_test');
        try {
          await testServer.dataflowManager.routeMessage(message);
        } catch (error) {
          // 预期的错误
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 关闭错误模拟
      testServer.dataflowManager.setErrorSimulation(false);

      // 发送正常消息验证恢复
      const recoveryMessage = MessageGenerator.generateMarketDataMessage('final_recovery_test');
      let recoveryReceived = false;

      client.on('message', (message) => {
        if (message.type === 'data' && message.payload && message.payload.type === 'final_recovery_test') {
          recoveryReceived = true;
        }
      });

      await testServer.dataflowManager.routeMessage(recoveryMessage);
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(recoveryReceived).toBe(true);
      
      // 应该有一些消息成功转发
      expect(receivedMessages.length).toBeGreaterThan(0);
      expect(receivedMessages.length).toBeLessThan(messageCount);
    });
  });

  describe('消息转发统计验证', () => {
    it('应该正确统计转发的消息数量', async () => {
      const client = new WebSocketClient({
        url: testServer.wsUrl
      });
      await client.connect();

      const messageCount = 20;
      const initialStats = testServer.proxy.getConnectionStats();

      for (let i = 0; i < messageCount; i++) {
        const message = MessageGenerator.generateMarketDataMessage('stats_test');
        await testServer.dataflowManager.routeMessage(message);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const finalStats = testServer.proxy.getConnectionStats();
      const messagesForwarded = finalStats.messagesForwarded - initialStats.messagesForwarded;

      expect(messagesForwarded).toBeGreaterThanOrEqual(messageCount);

      await client.disconnect();
    });

    it('应该记录性能指标', () => {
      const perfSummary = perfMonitor.getPerformanceSummary();
      const dataflowStats = testServer.dataflowManager.getStats();

      global.collectTestMetric('message-forwarding-performance', {
        performanceSummary: perfSummary,
        dataflowStats,
        proxyStats: testServer.proxy.getConnectionStats()
      });

      // 验证性能在可接受范围内
      if (perfSummary.avgLatency > 0) {
        expect(perfSummary.avgLatency).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.messageLatency);
      }
    });
  });
});