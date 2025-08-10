/**
 * DataFlowManager测试
 */

import { DataFlowManager } from '../data-flow-manager';
import { StandardDataTransformer } from '../transformers/data-transformer';
import { MessageRouter } from '../routing/message-router';
import { BaseMonitor } from '@pixiu/shared-core';

// Mock dependencies
jest.mock('@pixiu/shared-core');

describe('DataFlowManager', () => {
  let dataFlowManager: DataFlowManager;
  let mockMonitor: jest.Mocked<BaseMonitor>;

  beforeEach(() => {
    mockMonitor = {
      log: jest.fn(),
      registerHealthCheck: jest.fn(),
      registerMetric: jest.fn(),
      updateMetric: jest.fn(),
      observeHistogram: jest.fn()
    } as any;

    dataFlowManager = new DataFlowManager();
  });

  afterEach(async () => {
    if (dataFlowManager) {
      await dataFlowManager.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const config = {
        enabled: true,
        batching: {
          enabled: false,
          batchSize: 10,
          flushTimeout: 1000
        },
        performance: {
          maxQueueSize: 1000,
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 800
        },
        monitoring: {
          enableMetrics: true,
          metricsInterval: 5000,
          enableLatencyTracking: true
        },
        errorHandling: {
          retryCount: 3,
          retryDelay: 1000,
          enableCircuitBreaker: true,
          circuitBreakerThreshold: 10
        }
      };

      await dataFlowManager.initialize(config, mockMonitor);
      
      expect(mockMonitor.log).toHaveBeenCalledWith(
        'info',
        'DataFlowManager initialized',
        expect.any(Object)
      );
    });

    it('should register default transformers', async () => {
      const config = {
        enabled: true,
        batching: { enabled: false, batchSize: 10, flushTimeout: 1000 },
        performance: { maxQueueSize: 1000, processingTimeout: 5000, enableBackpressure: false, backpressureThreshold: 800 },
        monitoring: { enableMetrics: false, metricsInterval: 5000, enableLatencyTracking: false },
        errorHandling: { retryCount: 3, retryDelay: 1000, enableCircuitBreaker: false, circuitBreakerThreshold: 10 }
      };

      await dataFlowManager.initialize(config, mockMonitor);
      
      // Should have standard and compression transformers
      const stats = dataFlowManager.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('channel management', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        batching: { enabled: false, batchSize: 10, flushTimeout: 1000 },
        performance: { maxQueueSize: 1000, processingTimeout: 5000, enableBackpressure: false, backpressureThreshold: 800 },
        monitoring: { enableMetrics: false, metricsInterval: 5000, enableLatencyTracking: false },
        errorHandling: { retryCount: 3, retryDelay: 1000, enableCircuitBreaker: false, circuitBreakerThreshold: 10 }
      };

      await dataFlowManager.initialize(config, mockMonitor);
    });

    it('should register output channel', () => {
      const mockChannel = {
        id: 'test-channel',
        name: 'Test Channel',
        type: 'custom' as const,
        enabled: true,
        output: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({
          id: 'test-channel',
          name: 'Test Channel',
          type: 'custom',
          enabled: true,
          connected: true,
          messagesSent: 0,
          errors: 0,
          lastActivity: Date.now(),
          health: 'healthy' as const
        })
      };

      dataFlowManager.registerChannel(mockChannel);
      
      const channels = dataFlowManager.getChannelStatuses();
      expect(channels).toHaveLength(1);
      expect(channels[0].id).toBe('test-channel');
    });

    it('should unregister output channel', () => {
      const mockChannel = {
        id: 'test-channel',
        name: 'Test Channel',
        type: 'custom' as const,
        enabled: true,
        output: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({
          id: 'test-channel',
          name: 'Test Channel',
          type: 'custom',
          enabled: true,
          connected: true,
          messagesSent: 0,
          errors: 0,
          lastActivity: Date.now(),
          health: 'healthy' as const
        })
      };

      dataFlowManager.registerChannel(mockChannel);
      expect(dataFlowManager.getChannelStatuses()).toHaveLength(1);
      
      dataFlowManager.unregisterChannel('test-channel');
      expect(dataFlowManager.getChannelStatuses()).toHaveLength(0);
    });
  });

  describe('routing rules', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        batching: { enabled: false, batchSize: 10, flushTimeout: 1000 },
        performance: { maxQueueSize: 1000, processingTimeout: 5000, enableBackpressure: false, backpressureThreshold: 800 },
        monitoring: { enableMetrics: false, metricsInterval: 5000, enableLatencyTracking: false },
        errorHandling: { retryCount: 3, retryDelay: 1000, enableCircuitBreaker: false, circuitBreakerThreshold: 10 }
      };

      await dataFlowManager.initialize(config, mockMonitor);
    });

    it('should add routing rule', () => {
      const rule = {
        name: 'test-rule',
        condition: (data: any) => data.symbol === 'BTCUSDT',
        targetChannels: ['test-channel'],
        enabled: true,
        priority: 10
      };

      dataFlowManager.addRoutingRule(rule);
      
      const stats = dataFlowManager.getStats();
      expect(stats.routingRules).toBe(1);
    });

    it('should remove routing rule', () => {
      const rule = {
        name: 'test-rule',
        condition: (data: any) => data.symbol === 'BTCUSDT',
        targetChannels: ['test-channel'],
        enabled: true,
        priority: 10
      };

      dataFlowManager.addRoutingRule(rule);
      expect(dataFlowManager.getStats().routingRules).toBe(1);
      
      dataFlowManager.removeRoutingRule('test-rule');
      expect(dataFlowManager.getStats().routingRules).toBe(0);
    });
  });

  describe('data processing', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        batching: { enabled: false, batchSize: 10, flushTimeout: 1000 },
        performance: { maxQueueSize: 1000, processingTimeout: 5000, enableBackpressure: false, backpressureThreshold: 800 },
        monitoring: { enableMetrics: false, metricsInterval: 5000, enableLatencyTracking: false },
        errorHandling: { retryCount: 3, retryDelay: 1000, enableCircuitBreaker: false, circuitBreakerThreshold: 10 }
      };

      await dataFlowManager.initialize(config, mockMonitor);
      dataFlowManager.start();
    });

    it('should process market data', async () => {
      const mockChannel = {
        id: 'test-channel',
        name: 'Test Channel',
        type: 'custom' as const,
        enabled: true,
        output: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({
          id: 'test-channel',
          name: 'Test Channel',
          type: 'custom',
          enabled: true,
          connected: true,
          messagesSent: 0,
          errors: 0,
          lastActivity: Date.now(),
          health: 'healthy' as const
        })
      };

      const rule = {
        name: 'test-rule',
        condition: () => true,
        targetChannels: ['test-channel'],
        enabled: true,
        priority: 10
      };

      dataFlowManager.registerChannel(mockChannel);
      dataFlowManager.addRoutingRule(rule);

      const testData = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'trade',
        timestamp: Date.now(),
        data: {
          price: 50000,
          quantity: 0.1,
          side: 'buy'
        }
      };

      await dataFlowManager.processData(testData);
      
      // Allow some time for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockChannel.output).toHaveBeenCalled();
    });

    it('should handle backpressure', async () => {
      const config = {
        enabled: true,
        batching: { enabled: false, batchSize: 10, flushTimeout: 1000 },
        performance: { maxQueueSize: 10, processingTimeout: 5000, enableBackpressure: true, backpressureThreshold: 5 },
        monitoring: { enableMetrics: false, metricsInterval: 5000, enableLatencyTracking: false },
        errorHandling: { retryCount: 3, retryDelay: 1000, enableCircuitBreaker: false, circuitBreakerThreshold: 10 }
      };

      const newManager = new DataFlowManager();
      await newManager.initialize(config, mockMonitor);
      newManager.start();

      let backpressureActivated = false;
      newManager.on('backpressureActivated', () => {
        backpressureActivated = true;
      });

      // Fill the queue beyond threshold
      for (let i = 0; i < 10; i++) {
        await newManager.processData({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: 'trade',
          timestamp: Date.now(),
          data: { price: 50000, quantity: 0.1 }
        });
      }

      expect(backpressureActivated).toBe(true);
      await newManager.stop();
    });
  });

  describe('stats', () => {
    it('should return initial stats', () => {
      const stats = dataFlowManager.getStats();
      
      expect(stats).toEqual({
        totalProcessed: 0,
        totalSent: 0,
        totalErrors: 0,
        averageLatency: 0,
        currentQueueSize: 0,
        backpressureActive: false,
        activeChannels: 0,
        routingRules: 0,
        lastActivity: expect.any(Number)
      });
    });

    it('should update stats after processing', async () => {
      const config = {
        enabled: true,
        batching: { enabled: false, batchSize: 10, flushTimeout: 1000 },
        performance: { maxQueueSize: 1000, processingTimeout: 5000, enableBackpressure: false, backpressureThreshold: 800 },
        monitoring: { enableMetrics: false, metricsInterval: 5000, enableLatencyTracking: false },
        errorHandling: { retryCount: 3, retryDelay: 1000, enableCircuitBreaker: false, circuitBreakerThreshold: 10 }
      };

      await dataFlowManager.initialize(config, mockMonitor);
      dataFlowManager.start();

      const mockChannel = {
        id: 'test-channel',
        name: 'Test Channel',
        type: 'custom' as const,
        enabled: true,
        output: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({
          id: 'test-channel',
          name: 'Test Channel',
          type: 'custom',
          enabled: true,
          connected: true,
          messagesSent: 0,
          errors: 0,
          lastActivity: Date.now(),
          health: 'healthy' as const
        })
      };

      dataFlowManager.registerChannel(mockChannel);
      dataFlowManager.addRoutingRule({
        name: 'test-rule',
        condition: () => true,
        targetChannels: ['test-channel'],
        enabled: true,
        priority: 10
      });

      await dataFlowManager.processData({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        type: 'trade',
        timestamp: Date.now(),
        data: { price: 50000, quantity: 0.1 }
      });

      // Allow processing time
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = dataFlowManager.getStats();
      expect(stats.totalProcessed).toBeGreaterThan(0);
    });
  });
});

afterAll(async () => {
  // Clean up any global state
  jest.clearAllMocks();
});