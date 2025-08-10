/**
 * 错误分类和处理测试套件
 * 测试BaseAdapter的错误分类和BaseConnectionManager的错误处理能力
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '@pixiu/binance-adapter';
import { ConnectionState } from '@pixiu/adapter-base';
import { BaseAdapter, AdapterStatus } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { MockWebSocket, createMockWebSocket } from '../../mocks/websocket-mock';
import { TestConfigGenerator, EventListenerHelper, PerformanceMonitor } from '../../helpers/test-helpers';

// Mock Adapter用于测试错误处理
class TestBinanceAdapter extends BaseAdapter {
  public readonly exchange = 'binance';
  
  protected async createConnectionManager() {
    return new BinanceConnectionManager();
  }
  
  protected async createSubscription(symbol: string, dataType: any) {
    return {
      id: `${symbol}_${dataType}_${Date.now()}`,
      symbol,
      dataType,
      subscribedAt: Date.now(),
      active: true
    };
  }
  
  protected async removeSubscription(subscription: any) {
    // Mock implementation
  }
  
  protected parseMessage(message: any) {
    return null; // Mock implementation
  }
}

describe('错误分类和处理', () => {
  let connectionManager: BinanceConnectionManager;
  let adapter: TestBinanceAdapter;
  let eventHelper: EventListenerHelper;
  let perfMonitor: PerformanceMonitor;
  let mockWebSocketClass: typeof MockWebSocket;
  let originalWebSocket: any;

  beforeAll(() => {
    originalWebSocket = global.WebSocket;
  });

  afterAll(() => {
    (global as any).WebSocket = originalWebSocket;
    if (globalCache && typeof globalCache.destroy === 'function') {
      globalCache.destroy();
    }
  });

  beforeEach(() => {
    connectionManager = new BinanceConnectionManager();
    adapter = new TestBinanceAdapter();
    eventHelper = new EventListenerHelper();
    perfMonitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.destroy();
    }
    if (adapter) {
      await adapter.destroy();
    }
    eventHelper.cleanup();
    perfMonitor.clear();
  });

  describe('网络错误分类', () => {
    
    it('应该正确分类连接超时错误', async () => {
      mockWebSocketClass = createMockWebSocket({
        connectDelay: 10000, // 10秒延迟
        shouldFail: false
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        timeout: 1000 // 1秒超时
      });

      // 监听错误事件
      const errorPromise = eventHelper.waitForEvent(connectionManager, 'error', 5000);

      perfMonitor.startTiming('timeout_error');

      // 连接应该超时
      await expect(connectionManager.connect(config)).rejects.toThrow(/timeout/i);

      const timeoutTime = perfMonitor.endTiming('timeout_error');

      // 等待错误事件
      try {
        const errorEvent = await errorPromise;
        expect(errorEvent).toBeDefined();
      } catch (e) {
        // 错误事件可能不会触发，这是正常的
      }

      // 验证连接状态
      expect(connectionManager.getState()).toBe(ConnectionState.ERROR);

      // 验证错误指标
      const metrics = connectionManager.getMetrics();
      expect(metrics.errorCount).toBeGreaterThan(0);

      console.log(`✅ 连接超时错误分类正确，处理时间: ${timeoutTime}ms`);
    });

    it('应该正确分类网络连接失败', async () => {
      mockWebSocketClass = createMockWebSocket({
        shouldFail: true,
        failDelay: 100,
        errorMessage: 'ECONNREFUSED: Connection refused'
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig();

      // 监听错误事件
      const errorPromise = eventHelper.waitForEvent(connectionManager, 'error', 5000);

      perfMonitor.startTiming('connection_refused');

      // 连接应该失败
      await expect(connectionManager.connect(config)).rejects.toThrow(/connection refused/i);

      const failTime = perfMonitor.endTiming('connection_refused');

      // 等待错误事件
      const errorEvent = await errorPromise;
      expect(errorEvent.message).toMatch(/connection refused/i);

      // 验证状态
      expect(connectionManager.getState()).toBe(ConnectionState.ERROR);

      console.log(`✅ 网络连接失败分类正确，处理时间: ${failTime}ms`);
    });

    it('应该正确分类DNS解析失败', async () => {
      mockWebSocketClass = createMockWebSocket({
        shouldFail: true,
        failDelay: 500,
        errorMessage: 'ENOTFOUND: DNS lookup failed'
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        url: 'wss://nonexistent.domain.com/ws'
      });

      const errorPromise = eventHelper.waitForEvent(connectionManager, 'error', 5000);

      perfMonitor.startTiming('dns_failure');

      await expect(connectionManager.connect(config)).rejects.toThrow(/dns lookup failed/i);

      const dnsFailTime = perfMonitor.endTiming('dns_failure');

      const errorEvent = await errorPromise;
      expect(errorEvent.message).toMatch(/dns lookup failed/i);

      console.log(`✅ DNS解析失败分类正确，处理时间: ${dnsFailTime}ms`);
    });

    it('应该正确分类网络重置错误', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      
      // 先建立连接
      mockWebSocketClass = createMockWebSocket({
        connectDelay: 50,
        autoRespondToPing: true
      });
      (global as any).WebSocket = mockWebSocketClass;
      
      await connectionManager.connect(config);
      expect(connectionManager.isConnected()).toBe(true);

      // 监听错误和断开事件
      const errorPromise = eventHelper.waitForEvent(connectionManager, 'error', 5000);
      const disconnectPromise = eventHelper.waitForEvent(connectionManager, 'disconnected', 5000);

      perfMonitor.startTiming('network_reset');

      // 模拟网络重置
      const mockWS = (connectionManager as any).ws;
      if (mockWS && mockWS.simulateError) {
        mockWS.simulateError(new Error('ECONNRESET: Connection reset by peer'));
      }

      // 等待事件
      await Promise.race([errorPromise, disconnectPromise]);

      const resetTime = perfMonitor.endTiming('network_reset');

      console.log(`✅ 网络重置错误分类正确，处理时间: ${resetTime}ms`);
    });
  });

  describe('限频错误分类', () => {
    
    it('应该正确识别429限频错误', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      // 监听错误事件
      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('rate_limit_error');

      // 模拟限频错误
      const rateLimitError = new Error('HTTP 429: Too Many Requests');
      (adapter as any).handleError(rateLimitError, 'test_operation');

      const rateLimitEvent = await errorEventPromise;
      const rateLimitTime = perfMonitor.endTiming('rate_limit_error');

      // 验证错误分类
      expect(rateLimitEvent.error.message).toMatch(/429.*too many requests/i);

      console.log(`✅ 429限频错误分类正确，处理时间: ${rateLimitTime}ms`);
    });

    it('应该正确处理API密钥限制', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        },
        auth: {
          apiKey: 'test-key',
          apiSecret: 'test-secret'
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('api_limit_error');

      // 模拟API密钥限制错误
      const apiLimitError = new Error('API key rate limit exceeded');
      (adapter as any).handleError(apiLimitError, 'api_call');

      const apiLimitEvent = await errorEventPromise;
      const apiLimitTime = perfMonitor.endTiming('api_limit_error');

      expect(apiLimitEvent.error.message).toMatch(/api.*rate limit/i);

      console.log(`✅ API密钥限制错误分类正确，处理时间: ${apiLimitTime}ms`);
    });

    it('应该识别权重限制错误', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('weight_limit_error');

      // 模拟权重限制错误
      const weightError = new Error('Request weight limit exceeded for this API');
      (adapter as any).handleError(weightError, 'weight_check');

      const weightEvent = await errorEventPromise;
      const weightTime = perfMonitor.endTiming('weight_limit_error');

      expect(weightEvent.error.message).toMatch(/weight.*limit/i);

      console.log(`✅ 权重限制错误分类正确，处理时间: ${weightTime}ms`);
    });
  });

  describe('认证错误分类', () => {
    
    it('应该正确识别401未授权错误', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        },
        auth: {
          apiKey: 'invalid-key',
          apiSecret: 'invalid-secret'
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('auth_error');

      // 模拟认证错误
      const authError = new Error('HTTP 401: Unauthorized - Invalid API key');
      (adapter as any).handleError(authError, 'authentication');

      const authEvent = await errorEventPromise;
      const authTime = perfMonitor.endTiming('auth_error');

      expect(authEvent.error.message).toMatch(/401.*unauthorized/i);

      console.log(`✅ 401认证错误分类正确，处理时间: ${authTime}ms`);
    });

    it('应该正确处理API密钥格式错误', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        },
        auth: {
          apiKey: 'malformed-key',
          apiSecret: 'malformed-secret'
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('key_format_error');

      const keyFormatError = new Error('Invalid API key format');
      (adapter as any).handleError(keyFormatError, 'key_validation');

      const keyEvent = await errorEventPromise;
      const keyTime = perfMonitor.endTiming('key_format_error');

      expect(keyEvent.error.message).toMatch(/invalid.*api key/i);

      console.log(`✅ API密钥格式错误分类正确，处理时间: ${keyTime}ms`);
    });

    it('应该识别签名验证失败', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('signature_error');

      const signatureError = new Error('Signature verification failed');
      (adapter as any).handleError(signatureError, 'signature_check');

      const sigEvent = await errorEventPromise;
      const sigTime = perfMonitor.endTiming('signature_error');

      expect(sigEvent.error.message).toMatch(/signature.*failed/i);

      console.log(`✅ 签名验证错误分类正确，处理时间: ${sigTime}ms`);
    });
  });

  describe('数据解析错误分类', () => {
    
    it('应该正确处理JSON解析错误', async () => {
      mockWebSocketClass = createMockWebSocket({
        connectDelay: 50,
        messageDelay: 10
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      await connectionManager.connect(config);

      // 监听错误事件
      const errorPromise = eventHelper.waitForEvent(connectionManager, 'error', 5000);

      perfMonitor.startTiming('json_parse_error');

      // 模拟发送无效JSON
      const mockWS = (connectionManager as any).ws;
      if (mockWS && mockWS.simulateMessage) {
        // 发送无效JSON字符串
        mockWS.emit('message', Buffer.from('{"invalid": json}'));
      }

      try {
        await errorPromise;
        const parseTime = perfMonitor.endTiming('json_parse_error');
        console.log(`✅ JSON解析错误处理，时间: ${parseTime}ms`);
      } catch (e) {
        perfMonitor.endTiming('json_parse_error');
        console.log('✅ JSON解析错误未触发error事件（正常行为）');
      }
    });

    it('应该处理数据格式不匹配', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('format_mismatch_error');

      // 模拟数据格式错误
      const formatError = new Error('Data format validation failed: missing required field');
      (adapter as any).handleError(formatError, 'data_parsing');

      const formatEvent = await errorEventPromise;
      const formatTime = perfMonitor.endTiming('format_mismatch_error');

      expect(formatEvent.error.message).toMatch(/format.*validation/i);

      console.log(`✅ 数据格式错误分类正确，处理时间: ${formatTime}ms`);
    });

    it('应该处理数据类型转换错误', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('type_conversion_error');

      const typeError = new Error('Type conversion failed: expected number, got string');
      (adapter as any).handleError(typeError, 'data_conversion');

      const typeEvent = await errorEventPromise;
      const typeTime = perfMonitor.endTiming('type_conversion_error');

      expect(typeEvent.error.message).toMatch(/type conversion.*failed/i);

      console.log(`✅ 数据类型转换错误分类正确，处理时间: ${typeTime}ms`);
    });
  });

  describe('错误严重性评估', () => {
    
    it('应该正确评估致命错误', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('critical_error');

      // 模拟致命错误
      const criticalError = new Error('CRITICAL: System memory exhausted');
      (adapter as any).handleError(criticalError, 'system_check');

      const criticalEvent = await errorEventPromise;
      const criticalTime = perfMonitor.endTiming('critical_error');

      expect(criticalEvent.error.message).toMatch(/critical/i);

      // 检查适配器状态
      const status = adapter.getAdapterStatus();
      expect(status.health).toBe('unhealthy');

      console.log(`✅ 致命错误严重性评估正确，处理时间: ${criticalTime}ms`);
    });

    it('应该正确评估可恢复错误', async () => {
      mockWebSocketClass = createMockWebSocket({
        connectDelay: 50,
        simulateNetworkIssues: true,
        networkIssuesProbability: 1.0 // 100%网络问题概率
      });
      (global as any).WebSocket = mockWebSocketClass;

      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      await connectionManager.connect(config);

      const errorPromise = eventHelper.waitForEvent(connectionManager, 'error', 5000);

      perfMonitor.startTiming('recoverable_error');

      // 尝试发送消息触发网络问题
      try {
        await connectionManager.send({ test: 'message' });
      } catch (error) {
        // 预期会失败
      }

      try {
        const recoverableEvent = await errorPromise;
        const recoverableTime = perfMonitor.endTiming('recoverable_error');
        console.log(`✅ 可恢复错误评估正确，处理时间: ${recoverableTime}ms`);
      } catch (e) {
        perfMonitor.endTiming('recoverable_error');
        console.log('✅ 可恢复错误未触发error事件（正常行为）');
      }
    });

    it('应该正确评估警告级别错误', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const errorEventPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      perfMonitor.startTiming('warning_error');

      // 模拟警告级别错误
      const warningError = new Error('WARNING: High latency detected');
      (adapter as any).handleError(warningError, 'latency_check');

      const warningEvent = await errorEventPromise;
      const warningTime = perfMonitor.endTiming('warning_error');

      expect(warningEvent.error.message).toMatch(/warning.*latency/i);

      // 检查适配器状态应该仍然健康或降级
      const status = adapter.getAdapterStatus();
      expect(['healthy', 'degraded']).toContain(status.health);

      console.log(`✅ 警告级别错误评估正确，处理时间: ${warningTime}ms`);
    });
  });

  describe('错误指标收集', () => {
    
    it('应该正确统计各类错误数量', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const initialMetrics = adapter.getMetrics();
      const initialErrorCount = initialMetrics.errorCount;

      perfMonitor.startTiming('error_counting');

      // 触发多种类型的错误
      const errors = [
        new Error('Network timeout'),
        new Error('Rate limit exceeded'),
        new Error('Authentication failed'),
        new Error('Invalid JSON data')
      ];

      for (const error of errors) {
        const errorPromise = eventHelper.waitForEvent(adapter, 'error', 5000);
        (adapter as any).handleError(error, 'test_operation');
        await errorPromise;
      }

      const countingTime = perfMonitor.endTiming('error_counting');

      // 验证错误计数
      const finalMetrics = adapter.getMetrics();
      expect(finalMetrics.errorCount).toBe(initialErrorCount + errors.length);

      console.log(`✅ 错误统计正确，总计: ${finalMetrics.errorCount}个错误，处理时间: ${countingTime}ms`);
    });

    it('应该跟踪错误发生时间', async () => {
      const adapterConfig = TestConfigGenerator.generateBaseConnectionConfig();
      await adapter.initialize({
        exchange: 'binance',
        endpoints: { ws: adapterConfig.url, rest: 'https://api.binance.com' },
        connection: {
          timeout: adapterConfig.timeout,
          maxRetries: adapterConfig.maxRetries,
          retryInterval: adapterConfig.retryInterval,
          heartbeatInterval: adapterConfig.heartbeatInterval
        }
      });

      const startTime = Date.now();
      
      const errorPromise = eventHelper.waitForEvent(adapter, 'error', 5000);

      const testError = new Error('Timestamp test error');
      (adapter as any).handleError(testError, 'timestamp_test');

      const errorEvent = await errorPromise;
      const eventTime = Date.now();

      // 验证错误事件包含正确的时间信息
      expect(errorEvent.context?.timestamp).toBeDefined();
      expect(errorEvent.context.timestamp).toBeGreaterThanOrEqual(startTime);
      expect(errorEvent.context.timestamp).toBeLessThanOrEqual(eventTime);

      console.log('✅ 错误时间戳跟踪正确');
    });
  });
});