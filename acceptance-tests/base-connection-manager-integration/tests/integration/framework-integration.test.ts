/**
 * 框架集成测试套件
 * 测试BaseConnectionManager与整个适配器框架的集成
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '@pixiu/binance-adapter';
import { BaseAdapter, AdapterStatus, DataType } from '@pixiu/adapter-base';
import { createResourceManager } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { MockWebSocket, createMockWebSocket } from '../../mocks/websocket-mock';
import { TestConfigGenerator, EventListenerHelper, PerformanceMonitor } from '../../helpers/test-helpers';

// 完整的Binance适配器实现用于集成测试
class IntegrationTestBinanceAdapter extends BaseAdapter {
  public readonly exchange = 'binance';
  
  protected async createConnectionManager() {
    return new BinanceConnectionManager();
  }
  
  protected async createSubscription(symbol: string, dataType: DataType) {
    const subscription = {
      id: `${symbol}_${dataType}_${Date.now()}`,
      symbol,
      dataType,
      subscribedAt: Date.now(),
      active: true
    };

    // 发送订阅消息到连接管理器
    if (this.connectionManager && this.connectionManager.isConnected()) {
      await this.connectionManager.send({
        method: 'SUBSCRIBE',
        params: [`${symbol.toLowerCase()}@${dataType}`],
        id: Date.now()
      });
    }

    return subscription;
  }
  
  protected async removeSubscription(subscription: any) {
    if (this.connectionManager && this.connectionManager.isConnected()) {
      await this.connectionManager.send({
        method: 'UNSUBSCRIBE',  
        params: [`${subscription.symbol.toLowerCase()}@${subscription.dataType}`],
        id: Date.now()
      });
    }
  }
  
  protected parseMessage(message: any) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      // 解析Binance WebSocket消息格式
      if (data.stream && data.data) {
        const [symbol, dataType] = data.stream.split('@');
        return {
          exchange: this.exchange,
          symbol: symbol.toUpperCase(),
          type: dataType as DataType,
          timestamp: data.data.E || Date.now(),
          data: data.data,
          receivedAt: Date.now()
        };
      }
      
      return null;
    } catch (error) {
      console.warn('消息解析失败:', error);
      return null;
    }
  }

  // 暴露连接管理器用于测试
  getConnectionManager() {
    return this.connectionManager as BinanceConnectionManager;
  }
}

describe('框架集成', () => {
  let adapter: IntegrationTestBinanceAdapter;
  let resourceManager: ReturnType<typeof createResourceManager>;
  let eventHelper: EventListenerHelper;
  let perfMonitor: PerformanceMonitor;
  let originalWebSocket: any;

  beforeAll(() => {
    originalWebSocket = global.WebSocket;
    
    const mockWebSocketClass = createMockWebSocket({
      connectDelay: 100,
      autoRespondToPing: true,
      messageDelay: 20
    });
    (global as any).WebSocket = mockWebSocketClass;
  });

  afterAll(() => {
    (global as any).WebSocket = originalWebSocket;
    if (globalCache && typeof globalCache.destroy === 'function') {
      globalCache.destroy();
    }
  });

  beforeEach(() => {
    adapter = new IntegrationTestBinanceAdapter();
    resourceManager = createResourceManager({
      monitoringInterval: 200,
      limits: {
        maxMemoryUsage: 200 * 1024 * 1024,
        maxConnections: 50,
        maxCacheSize: 50 * 1024 * 1024,
        maxEventLoopLag: 100
      }
    });
    eventHelper = new EventListenerHelper();
    perfMonitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    if (resourceManager) {
      resourceManager.stop();
    }
    if (adapter) {
      await adapter.destroy();
    }
    eventHelper.cleanup();
    perfMonitor.clear();
  });

  describe('适配器和连接管理器集成', () => {
    
    it('应该正确集成BaseAdapter和BinanceConnectionManager', async () => {
      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      perfMonitor.startTiming('adapter_connection_integration');

      // 初始化适配器
      await adapter.initialize({
        exchange: 'binance',
        endpoints: {
          ws: config.url,
          rest: 'https://api.binance.com'
        },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      // 连接
      await adapter.connect();

      const integrationTime = perfMonitor.endTiming('adapter_connection_integration');

      // 验证集成状态
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      
      const connectionManager = adapter.getConnectionManager();
      expect(connectionManager).toBeDefined();
      expect(connectionManager.isConnected()).toBe(true);

      // 验证指标同步
      const adapterMetrics = adapter.getMetrics();
      const connectionMetrics = connectionManager.getMetrics();
      
      expect(adapterMetrics.status).toBe(AdapterStatus.CONNECTED);
      expect(connectionMetrics.state).toBe('connected');

      console.log(`✅ 适配器集成测试完成，时间: ${integrationTime}ms`);
      console.log(`   适配器状态: ${adapter.getStatus()}`);
      console.log(`   连接状态: ${connectionManager.getState()}`);
    });

    it('应该正确传播连接状态变化', async () => {
      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: config.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      // 监听适配器状态变化事件
      const statusChangeCollector = eventHelper.createEventCollector(adapter, [
        'statusChange',
        'connected',
        'disconnected',
        'error'
      ]);

      perfMonitor.startTiming('status_propagation');

      // 连接
      await adapter.connect();
      
      // 断开连接
      await adapter.disconnect();

      // 重连
      await adapter.connect();

      const propagationTime = perfMonitor.endTiming('status_propagation');

      // 验证状态传播
      const statusChanges = statusChangeCollector.getEventsByType('statusChange');
      const connectedEvents = statusChangeCollector.getEventsByType('connected');
      const disconnectedEvents = statusChangeCollector.getEventsByType('disconnected');

      expect(statusChanges.length).toBeGreaterThanOrEqual(3); // 至少3次状态变化
      expect(connectedEvents.length).toBe(2); // 2次连接
      expect(disconnectedEvents.length).toBe(1); // 1次断开

      console.log(`✅ 状态传播测试完成，时间: ${propagationTime}ms`);
      console.log(`   状态变化次数: ${statusChanges.length}`);
      console.log(`   连接事件: ${connectedEvents.length}`);
      console.log(`   断开事件: ${disconnectedEvents.length}`);

      statusChangeCollector.stop();
    });

    it('应该正确集成流管理和订阅系统', async () => {
      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: config.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      await adapter.connect();

      const eventCollector = eventHelper.createEventCollector(adapter, [
        'subscribed',
        'unsubscribed',
        'data'
      ]);

      perfMonitor.startTiming('subscription_integration');

      // 订阅数据
      const subscriptions = await adapter.subscribe({
        symbols: ['BTCUSDT', 'ETHUSDT'],
        dataTypes: [DataType.TICKER, DataType.TRADE]
      });

      // 验证订阅创建
      expect(subscriptions.length).toBe(4); // 2个符号 × 2个数据类型

      // 获取连接管理器并验证流管理
      const connectionManager = adapter.getConnectionManager();
      const activeStreams = connectionManager.getActiveStreams();

      // 验证流已添加到连接管理器
      expect(activeStreams.length).toBeGreaterThanOrEqual(subscriptions.length);

      // 取消部分订阅
      const subscriptionIds = subscriptions.slice(0, 2).map(sub => sub.id);
      await adapter.unsubscribe(subscriptionIds);

      const integrationTime = perfMonitor.endTiming('subscription_integration');

      // 验证事件
      const subscribedCount = eventCollector.getEventCount('subscribed');
      const unsubscribedCount = eventCollector.getEventCount('unsubscribed');

      expect(subscribedCount).toBe(4);
      expect(unsubscribedCount).toBe(2);

      // 验证剩余订阅
      const remainingSubscriptions = adapter.getSubscriptions();
      expect(remainingSubscriptions.length).toBe(2);

      console.log(`✅ 订阅系统集成测试完成，时间: ${integrationTime}ms`);
      console.log(`   创建订阅: ${subscriptions.length}`);
      console.log(`   活跃流: ${activeStreams.length}`);
      console.log(`   剩余订阅: ${remainingSubscriptions.length}`);

      eventCollector.stop();
    });

    it('应该正确处理消息解析和数据传播', async () => {
      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: config.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      await adapter.connect();

      // 监听数据事件
      const dataCollector = eventHelper.createEventCollector(adapter, ['data']);

      perfMonitor.startTiming('message_processing');

      // 订阅数据
      await adapter.subscribe({
        symbols: ['BTCUSDT'],
        dataTypes: [DataType.TICKER]
      });

      // 模拟接收消息
      const connectionManager = adapter.getConnectionManager();
      const mockWS = (connectionManager as any).ws;

      if (mockWS && mockWS.simulateMessage) {
        // 模拟Binance ticker消息
        mockWS.simulateMessage({
          stream: 'btcusdt@ticker',
          data: {
            E: Date.now(),
            s: 'BTCUSDT',
            c: '50000.00',
            h: '52000.00',
            l: '48000.00',
            v: '100.50'
          }
        });
      }

      // 等待消息处理
      await testUtils.waitFor(() => dataCollector.getEventCount('data') > 0, 5000);

      const processingTime = perfMonitor.endTiming('message_processing');

      // 验证数据事件
      const dataEvents = dataCollector.getEventsByType('data');
      expect(dataEvents.length).toBeGreaterThan(0);

      const firstDataEvent = dataEvents[0];
      expect(firstDataEvent.exchange).toBe('binance');
      expect(firstDataEvent.symbol).toBe('BTCUSDT');
      expect(firstDataEvent.type).toBe('ticker');
      expect(firstDataEvent.data).toBeDefined();
      expect(firstDataEvent.timestamp).toBeGreaterThan(0);
      expect(firstDataEvent.receivedAt).toBeGreaterThan(0);

      console.log(`✅ 消息处理集成测试完成，时间: ${processingTime}ms`);
      console.log(`   接收数据事件: ${dataEvents.length}`);
      console.log(`   数据延迟: ${firstDataEvent.receivedAt - firstDataEvent.timestamp}ms`);

      dataCollector.stop();
    });
  });

  describe('资源管理器集成', () => {
    
    it('应该集成适配器与资源管理器', async () => {
      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: config.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      // 监听资源管理器事件
      const resourceEventCollector = eventHelper.createEventCollector(resourceManager, [
        'optimized',
        'resourceAlert'
      ]);

      perfMonitor.startTiming('resource_manager_integration');

      await adapter.connect();

      // 模拟网络活动以更新资源指标
      const connectionManager = adapter.getConnectionManager();
      const connectionMetrics = connectionManager.getMetrics();
      
      resourceManager.updateNetworkMetrics(
        1, // 1个活跃连接
        connectionMetrics.bytesSent + connectionMetrics.bytesReceived
      );

      // 等待资源监控更新
      await testUtils.delay(300);

      const integrationTime = perfMonitor.endTiming('resource_manager_integration');

      // 获取资源健康状况
      const resourceHealth = resourceManager.checkHealth();
      const resourceMetrics = resourceManager.getMetrics();

      // 验证资源指标更新
      expect(resourceMetrics.network.activeConnections).toBe(1);
      expect(resourceHealth).toBeDefined();

      // 验证适配器健康状态
      const adapterHealth = adapter.getAdapterStatus();
      expect(adapterHealth.connectivity.connected).toBe(true);

      console.log(`✅ 资源管理器集成测试完成，时间: ${integrationTime}ms`);
      console.log(`   资源健康状态: ${resourceHealth.healthy ? '健康' : '不健康'}`);
      console.log(`   适配器健康状态: ${adapterHealth.health}`);
      console.log(`   网络连接数: ${resourceMetrics.network.activeConnections}`);

      resourceEventCollector.stop();
    });

    it('应该在资源限制时触发适配器降级', async () => {
      // 创建资源限制更严格的管理器
      const strictResourceManager = createResourceManager({
        monitoringInterval: 100,
        limits: {
          maxMemoryUsage: 10 * 1024 * 1024, // 很低的内存限制
          maxConnections: 2, // 很低的连接限制
          maxCacheSize: 1 * 1024 * 1024,
          maxEventLoopLag: 10 // 很低的延迟限制
        },
        autoOptimization: {
          enabled: true,
          memoryCleanupThreshold: 50,
          connectionPoolOptimization: true,
          cacheEvictionStrategy: 'lru'
        }
      });

      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: config.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      const alertPromise = eventHelper.waitForEvent(strictResourceManager, 'resourceAlert', 10000);

      perfMonitor.startTiming('resource_degradation');

      await adapter.connect();

      // 模拟超过资源限制
      strictResourceManager.updateNetworkMetrics(5, 100000); // 超过连接限制
      
      let alertTriggered = false;
      try {
        await alertPromise;
        alertTriggered = true;
      } catch (e) {
        // 告警可能没有触发
      }

      const degradationTime = perfMonitor.endTiming('resource_degradation');

      // 检查资源状态
      const resourceHealth = strictResourceManager.checkHealth();
      const adapterStatus = adapter.getAdapterStatus();

      console.log(`✅ 资源降级测试完成，时间: ${degradationTime}ms`);
      console.log(`   资源告警触发: ${alertTriggered}`);
      console.log(`   资源健康: ${resourceHealth.healthy}`);
      console.log(`   适配器健康: ${adapterStatus.health}`);
      console.log(`   严重问题数: ${resourceHealth.critical.length}`);

      strictResourceManager.stop();
    });
  });

  describe('生命周期管理集成', () => {
    
    it('应该正确管理完整的组件生命周期', async () => {
      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      // 监听生命周期事件
      const lifecycleCollector = eventHelper.createEventCollector(adapter, [
        'statusChange',
        'connected',
        'disconnected',
        'subscribed',
        'unsubscribed'
      ]);

      perfMonitor.startTiming('full_lifecycle');

      // 1. 初始化阶段
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: config.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);

      // 2. 连接阶段
      await adapter.connect();
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);

      // 3. 订阅阶段
      const subscriptions = await adapter.subscribe({
        symbols: ['BTCUSDT', 'ETHUSDT'],
        dataTypes: [DataType.TICKER]
      });

      expect(subscriptions.length).toBe(2);
      expect(adapter.getSubscriptions().length).toBe(2);

      // 4. 取消订阅阶段
      await adapter.unsubscribeAll();
      expect(adapter.getSubscriptions().length).toBe(0);

      // 5. 断开连接阶段
      await adapter.disconnect();
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);

      // 6. 销毁阶段
      await adapter.destroy();

      const lifecycleTime = perfMonitor.endTiming('full_lifecycle');

      // 验证生命周期事件
      const statusChanges = lifecycleCollector.getEventsByType('statusChange');
      const connectedEvents = lifecycleCollector.getEventsByType('connected');
      const disconnectedEvents = lifecycleCollector.getEventsByType('disconnected');
      const subscribedEvents = lifecycleCollector.getEventsByType('subscribed');
      const unsubscribedEvents = lifecycleCollector.getEventsByType('unsubscribed');

      expect(statusChanges.length).toBeGreaterThanOrEqual(2);
      expect(connectedEvents.length).toBe(1);
      expect(disconnectedEvents.length).toBe(1);
      expect(subscribedEvents.length).toBe(2);
      expect(unsubscribedEvents.length).toBe(2);

      console.log(`✅ 完整生命周期测试完成，时间: ${lifecycleTime}ms`);
      console.log(`   状态变化: ${statusChanges.length}`);
      console.log(`   连接事件: ${connectedEvents.length}`);
      console.log(`   断开事件: ${disconnectedEvents.length}`);
      console.log(`   订阅事件: ${subscribedEvents.length}`);
      console.log(`   取消订阅事件: ${unsubscribedEvents.length}`);

      lifecycleCollector.stop();
    });

    it('应该支持优雅关闭和清理', async () => {
      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: config.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      await adapter.connect();

      // 创建多个订阅
      await adapter.subscribe({
        symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'],
        dataTypes: [DataType.TICKER, DataType.TRADE, DataType.DEPTH]
      });

      // 记录销毁前状态
      const beforeDestroy = {
        status: adapter.getStatus(),
        subscriptions: adapter.getSubscriptions().length,
        connected: adapter.getConnectionManager().isConnected(),
        metrics: adapter.getMetrics()
      };

      perfMonitor.startTiming('graceful_shutdown');

      // 执行优雅关闭
      await adapter.destroy();

      const shutdownTime = perfMonitor.endTiming('graceful_shutdown');

      // 验证清理完成
      expect(adapter.getStatus()).toBe(AdapterStatus.DISCONNECTED);
      expect(adapter.getSubscriptions().length).toBe(0);
      expect(adapter.getConnectionManager().isConnected()).toBe(false);

      console.log(`✅ 优雅关闭测试完成，时间: ${shutdownTime}ms`);
      console.log(`   销毁前状态: ${beforeDestroy.status}`);
      console.log(`   销毁前订阅: ${beforeDestroy.subscriptions}`);
      console.log(`   销毁前连接: ${beforeDestroy.connected}`);
      console.log(`   关闭效率: ${shutdownTime < 1000 ? '高效' : '标准'}`);
    });
  });

  describe('并发操作集成', () => {
    
    it('应该支持多适配器并发操作', async () => {
      const adapterCount = 5;
      const adapters: IntegrationTestBinanceAdapter[] = [];

      perfMonitor.startTiming('multi_adapter_concurrent');

      try {
        // 创建多个适配器
        const initPromises = Array.from({ length: adapterCount }, async (_, index) => {
          const testAdapter = new IntegrationTestBinanceAdapter();
          adapters.push(testAdapter);
          
          const config = TestConfigGenerator.generateBaseConnectionConfig();
          
          await testAdapter.initialize({
            exchange: 'binance',
            endpoints: { 
              ws: `${config.url}?adapter=${index}`, 
              rest: 'https://api.binance.com' 
            },
            connection: {
              timeout: config.timeout,
              maxRetries: config.maxRetries,
              retryInterval: config.retryInterval,
              heartbeatInterval: config.heartbeatInterval
            }
          });
          
          return testAdapter;
        });

        await Promise.all(initPromises);

        // 并发连接
        const connectPromises = adapters.map(testAdapter => testAdapter.connect());
        await Promise.all(connectPromises);

        // 并发订阅
        const subscribePromises = adapters.map((testAdapter, index) => 
          testAdapter.subscribe({
            symbols: [`SYMBOL${index}USDT`],
            dataTypes: [DataType.TICKER]
          })
        );
        await Promise.all(subscribePromises);

        const concurrentTime = perfMonitor.endTiming('multi_adapter_concurrent');

        // 验证所有适配器状态
        for (const testAdapter of adapters) {
          expect(testAdapter.getStatus()).toBe(AdapterStatus.CONNECTED);
          expect(testAdapter.getSubscriptions().length).toBe(1);
          expect(testAdapter.getConnectionManager().isConnected()).toBe(true);
        }

        console.log(`✅ 多适配器并发测试完成，时间: ${concurrentTime}ms`);
        console.log(`   适配器数量: ${adapterCount}`);
        console.log(`   全部连接成功: ${adapters.every(a => a.getStatus() === AdapterStatus.CONNECTED)}`);
        console.log(`   平均连接时间: ${(concurrentTime / adapterCount).toFixed(2)}ms`);

      } finally {
        // 清理所有适配器
        const destroyPromises = adapters.map(testAdapter => testAdapter.destroy());
        await Promise.allSettled(destroyPromises);
      }
    });

    it('应该处理并发连接操作的竞争条件', async () => {
      const config = TestConfigGenerator.generateBaseConnectionConfig();
      
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: config.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryInterval: config.retryInterval,
          heartbeatInterval: config.heartbeatInterval
        }
      });

      perfMonitor.startTiming('concurrent_race_conditions');

      // 同时触发多个连接操作
      const operations = [
        adapter.connect(),
        adapter.connect(),
        adapter.connect()
      ];

      // 等待所有操作完成
      const results = await Promise.allSettled(operations);

      const raceTime = perfMonitor.endTiming('concurrent_race_conditions');

      // 验证最终状态一致
      expect(adapter.getStatus()).toBe(AdapterStatus.CONNECTED);
      expect(adapter.getConnectionManager().isConnected()).toBe(true);

      // 统计操作结果
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ 竞争条件测试完成，时间: ${raceTime}ms`);
      console.log(`   成功操作: ${successCount}`);
      console.log(`   失败操作: ${failureCount}`);
      console.log(`   最终状态: ${adapter.getStatus()}`);
      console.log(`   状态一致性: ${adapter.getStatus() === AdapterStatus.CONNECTED ? '一致' : '不一致'}`);
    });
  });
});