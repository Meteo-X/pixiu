/**
 * DataFlow测试工具类
 * 提供数据流测试所需的通用工具和辅助函数
 */

import { EventEmitter } from 'events';
import { MarketData } from '@pixiu/adapter-base';
import { 
  DataFlowManager, 
  OutputChannel, 
  RoutingRule, 
  ChannelStatus,
  DataFlowConfig 
} from '../../../services/data-collection/exchange-collector/src/dataflow';

/**
 * 测试数据生成器
 */
export class TestDataGenerator {
  private static instance: TestDataGenerator;
  private sequenceNumber = 0;

  static getInstance(): TestDataGenerator {
    if (!TestDataGenerator.instance) {
      TestDataGenerator.instance = new TestDataGenerator();
    }
    return TestDataGenerator.instance;
  }

  /**
   * 生成单个市场数据
   */
  generateMarketData(overrides: Partial<MarketData> = {}): MarketData {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT'];
    const types = ['trade', 'ticker', 'depth', 'kline_1m'];
    const exchanges = ['binance', 'coinbase', 'kraken'];

    const baseData: MarketData = {
      exchange: exchanges[Math.floor(Math.random() * exchanges.length)],
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      type: types[Math.floor(Math.random() * types.length)],
      timestamp: Date.now() + this.sequenceNumber++,
      receivedAt: Date.now(),
      data: this.generateDataByType(types[Math.floor(Math.random() * types.length)]),
      metadata: {
        source: 'test-generator',
        sequence: this.sequenceNumber
      }
    };

    return { ...baseData, ...overrides };
  }

  /**
   * 生成批量市场数据
   */
  generateBulkMarketData(
    count: number, 
    template: Partial<MarketData> = {},
    options: {
      sequential?: boolean;
      timeGap?: number;
      symbolDistribution?: string[];
      typeDistribution?: string[];
    } = {}
  ): MarketData[] {
    const data: MarketData[] = [];
    const { sequential = true, timeGap = 1, symbolDistribution, typeDistribution } = options;
    
    for (let i = 0; i < count; i++) {
      const overrides: Partial<MarketData> = { ...template };
      
      if (sequential) {
        overrides.timestamp = (template.timestamp || Date.now()) + (i * timeGap);
      }
      
      if (symbolDistribution) {
        overrides.symbol = symbolDistribution[i % symbolDistribution.length];
      }
      
      if (typeDistribution) {
        overrides.type = typeDistribution[i % typeDistribution.length];
      }
      
      data.push(this.generateMarketData(overrides));
    }
    
    return data;
  }

  /**
   * 生成高频测试数据流
   */
  generateHighFrequencyStream(
    duration: number, 
    frequency: number,
    template: Partial<MarketData> = {}
  ): MarketData[] {
    const count = Math.floor((duration / 1000) * frequency);
    const timeGap = 1000 / frequency;
    
    return this.generateBulkMarketData(count, template, {
      sequential: true,
      timeGap
    });
  }

  /**
   * 根据数据类型生成相应的数据结构
   */
  private generateDataByType(type: string): any {
    switch (type) {
      case 'trade':
        return {
          price: 50000 + Math.random() * 10000,
          quantity: Math.random() * 1,
          side: Math.random() > 0.5 ? 'buy' : 'sell',
          tradeId: Math.floor(Math.random() * 1000000),
          timestamp: Date.now()
        };
      
      case 'ticker':
        return {
          price: 50000 + Math.random() * 10000,
          volume: Math.random() * 1000,
          high: 55000,
          low: 45000,
          change: Math.random() * 1000 - 500,
          changePercent: Math.random() * 0.1 - 0.05
        };
      
      case 'depth':
        return {
          bids: Array.from({ length: 20 }, (_, i) => [
            50000 - i * 10,
            Math.random() * 10
          ]),
          asks: Array.from({ length: 20 }, (_, i) => [
            50000 + i * 10,
            Math.random() * 10
          ]),
          lastUpdateId: Math.floor(Math.random() * 1000000)
        };
      
      case 'kline_1m':
        return {
          openTime: Date.now() - 60000,
          closeTime: Date.now(),
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: Math.random() * 100,
          trades: Math.floor(Math.random() * 1000)
        };
      
      default:
        return {
          value: Math.random() * 1000,
          timestamp: Date.now()
        };
    }
  }

  /**
   * 重置序列号
   */
  reset(): void {
    this.sequenceNumber = 0;
  }
}

/**
 * Mock输出通道
 */
export class MockOutputChannel extends EventEmitter implements OutputChannel {
  id: string;
  name: string;
  type: 'pubsub' | 'websocket' | 'cache' | 'custom';
  enabled: boolean;

  private outputHistory: Array<{ data: MarketData; metadata?: any; timestamp: number }> = [];
  private errorCount = 0;
  private latencies: number[] = [];
  private shouldFail = false;
  private failureRate = 0;
  private processingDelay = 0;

  constructor(
    id: string,
    options: {
      name?: string;
      type?: 'pubsub' | 'websocket' | 'cache' | 'custom';
      enabled?: boolean;
      shouldFail?: boolean;
      failureRate?: number;
      processingDelay?: number;
    } = {}
  ) {
    super();
    this.id = id;
    this.name = options.name || `mock-channel-${id}`;
    this.type = options.type || 'custom';
    this.enabled = options.enabled !== false;
    this.shouldFail = options.shouldFail || false;
    this.failureRate = options.failureRate || 0;
    this.processingDelay = options.processingDelay || 0;
  }

  async output(data: MarketData, metadata?: Record<string, any>): Promise<void> {
    const startTime = Date.now();

    // 模拟处理延迟
    if (this.processingDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.processingDelay));
    }

    // 模拟随机失败
    if (this.shouldFail || (this.failureRate > 0 && Math.random() < this.failureRate)) {
      this.errorCount++;
      const error = new Error(`Mock channel ${this.id} simulated failure`);
      this.emit('error', error);
      throw error;
    }

    // 记录输出历史
    const outputRecord = {
      data,
      metadata,
      timestamp: Date.now()
    };
    
    this.outputHistory.push(outputRecord);
    
    // 计算并记录延迟
    const latency = Date.now() - startTime;
    this.latencies.push(latency);
    
    // 限制历史记录大小
    if (this.outputHistory.length > 10000) {
      this.outputHistory = this.outputHistory.slice(-5000);
    }
    
    if (this.latencies.length > 1000) {
      this.latencies = this.latencies.slice(-500);
    }

    this.emit('output', outputRecord);
  }

  async close(): Promise<void> {
    this.enabled = false;
    this.emit('closed');
  }

  getStatus(): ChannelStatus {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      connected: this.enabled,
      messagesSent: this.outputHistory.length,
      errors: this.errorCount,
      lastActivity: this.outputHistory.length > 0 ? 
        this.outputHistory[this.outputHistory.length - 1].timestamp : 0,
      health: this.errorCount === 0 ? 'healthy' : 
              this.errorCount < 10 ? 'degraded' : 'unhealthy'
    };
  }

  // 测试专用方法
  getOutputHistory(): Array<{ data: MarketData; metadata?: any; timestamp: number }> {
    return [...this.outputHistory];
  }

  getLatencyStats() {
    if (this.latencies.length === 0) {
      return { min: 0, max: 0, avg: 0, p95: 0 };
    }
    
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return {
      min: Math.min(...this.latencies),
      max: Math.max(...this.latencies),
      avg: this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length,
      p95: sorted[Math.floor(sorted.length * 0.95)]
    };
  }

  clearHistory(): void {
    this.outputHistory = [];
    this.latencies = [];
    this.errorCount = 0;
  }

  setFailureMode(shouldFail: boolean, failureRate = 0): void {
    this.shouldFail = shouldFail;
    this.failureRate = failureRate;
  }

  setProcessingDelay(delay: number): void {
    this.processingDelay = delay;
  }
}

/**
 * DataFlow测试管理器
 */
export class DataFlowTestManager {
  private dataFlowManager?: DataFlowManager;
  private mockChannels: Map<string, MockOutputChannel> = new Map();
  private rules: RoutingRule[] = [];

  /**
   * 创建配置好的DataFlowManager实例
   */
  async createDataFlowManager(config: Partial<DataFlowConfig> = {}): Promise<DataFlowManager> {
    const mockMonitor = this.createMockMonitor();
    
    const defaultConfig: DataFlowConfig = {
      enabled: true,
      batching: {
        enabled: false,
        batchSize: 10,
        flushTimeout: 1000
      },
      performance: {
        maxQueueSize: 10000,
        processingTimeout: 5000,
        enableBackpressure: true,
        backpressureThreshold: 8000
      },
      monitoring: {
        enableMetrics: false,
        metricsInterval: 1000,
        enableLatencyTracking: true
      },
      errorHandling: {
        retryCount: 3,
        retryDelay: 100,
        enableCircuitBreaker: false,
        circuitBreakerThreshold: 10
      }
    };

    const finalConfig = this.mergeConfig(defaultConfig, config);
    
    this.dataFlowManager = new DataFlowManager();
    await this.dataFlowManager.initialize(finalConfig, mockMonitor);
    
    return this.dataFlowManager;
  }

  /**
   * 创建Mock输出通道
   */
  createMockChannel(
    id: string, 
    options: Parameters<typeof MockOutputChannel.prototype.constructor>[1] = {}
  ): MockOutputChannel {
    const channel = new MockOutputChannel(id, options);
    this.mockChannels.set(id, channel);
    return channel;
  }

  /**
   * 创建常用路由规则
   */
  createRoutingRule(
    name: string,
    condition: (data: MarketData) => boolean,
    targetChannels: string[],
    options: { priority?: number; enabled?: boolean; transform?: (data: MarketData) => MarketData } = {}
  ): RoutingRule {
    const rule: RoutingRule = {
      name,
      condition,
      targetChannels,
      enabled: options.enabled !== false,
      priority: options.priority || 1,
      transform: options.transform
    };

    this.rules.push(rule);
    return rule;
  }

  /**
   * 创建基于交易所的路由规则
   */
  createExchangeRule(exchange: string, targetChannels: string[]): RoutingRule {
    return this.createRoutingRule(
      `exchange-${exchange}`,
      (data: MarketData) => data.exchange.toLowerCase() === exchange.toLowerCase(),
      targetChannels,
      { priority: 10 }
    );
  }

  /**
   * 创建基于数据类型的路由规则
   */
  createTypeRule(dataType: string, targetChannels: string[]): RoutingRule {
    return this.createRoutingRule(
      `type-${dataType}`,
      (data: MarketData) => data.type === dataType,
      targetChannels,
      { priority: 5 }
    );
  }

  /**
   * 创建通配符路由规则
   */
  createCatchAllRule(targetChannels: string[]): RoutingRule {
    return this.createRoutingRule(
      'catch-all',
      () => true,
      targetChannels,
      { priority: 1 }
    );
  }

  /**
   * 获取所有Mock通道
   */
  getMockChannels(): Map<string, MockOutputChannel> {
    return new Map(this.mockChannels);
  }

  /**
   * 清理所有Mock通道历史
   */
  clearAllChannelHistory(): void {
    this.mockChannels.forEach(channel => channel.clearHistory());
  }

  /**
   * 等待数据处理完成
   */
  async waitForProcessing(timeout = 5000): Promise<void> {
    if (!this.dataFlowManager) {
      return;
    }

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const stats = this.dataFlowManager.getStats();
      
      // 如果队列为空，说明处理完成
      if (stats.currentQueueSize === 0) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    throw new Error(`等待处理超时 (${timeout}ms)`);
  }

  /**
   * 验证数据流路径
   */
  async verifyDataFlow(
    inputData: MarketData,
    expectedChannels: string[],
    timeout = 5000
  ): Promise<boolean> {
    if (!this.dataFlowManager) {
      throw new Error('DataFlowManager未初始化');
    }

    const startTime = Date.now();
    const initialCounts = new Map<string, number>();
    
    // 记录初始计数
    expectedChannels.forEach(channelId => {
      const channel = this.mockChannels.get(channelId);
      if (channel) {
        initialCounts.set(channelId, channel.getOutputHistory().length);
      }
    });

    // 发送数据
    await this.dataFlowManager.processData(inputData);
    
    // 等待处理完成
    await this.waitForProcessing(timeout);

    // 验证每个预期通道都收到了数据
    for (const channelId of expectedChannels) {
      const channel = this.mockChannels.get(channelId);
      if (!channel) {
        return false;
      }

      const initialCount = initialCounts.get(channelId) || 0;
      const currentCount = channel.getOutputHistory().length;
      
      if (currentCount <= initialCount) {
        return false;
      }
    }

    return true;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.dataFlowManager) {
      await this.dataFlowManager.stop();
      this.dataFlowManager = undefined;
    }

    for (const channel of this.mockChannels.values()) {
      await channel.close();
    }
    
    this.mockChannels.clear();
    this.rules = [];
  }

  /**
   * 创建Mock监控器
   */
  private createMockMonitor(): any {
    return {
      log: jest.fn(),
      registerHealthCheck: jest.fn(),
      registerMetric: jest.fn(),
      updateMetric: jest.fn(),
      observeHistogram: jest.fn()
    };
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(default: DataFlowConfig, override: Partial<DataFlowConfig>): DataFlowConfig {
    return {
      enabled: override.enabled !== undefined ? override.enabled : default.enabled,
      batching: { ...default.batching, ...override.batching },
      performance: { ...default.performance, ...override.performance },
      monitoring: { ...default.monitoring, ...override.monitoring },
      errorHandling: { ...default.errorHandling, ...override.errorHandling }
    };
  }
}

/**
 * 测试数据验证工具
 */
export class DataValidationUtils {
  /**
   * 验证市场数据结构
   */
  static validateMarketData(data: MarketData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.exchange) errors.push('缺少exchange字段');
    if (!data.symbol) errors.push('缺少symbol字段');
    if (!data.type) errors.push('缺少type字段');
    if (!data.timestamp) errors.push('缺少timestamp字段');
    if (!data.data) errors.push('缺少data字段');

    if (typeof data.timestamp !== 'number' || data.timestamp <= 0) {
      errors.push('timestamp必须为正数');
    }

    if (typeof data.data !== 'object') {
      errors.push('data必须为对象');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证数据转换结果
   */
  static validateTransformation(
    original: MarketData, 
    transformed: MarketData
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 基本字段应该保持一致
    if (original.exchange !== transformed.exchange) {
      errors.push('exchange字段被意外修改');
    }
    
    if (original.symbol !== transformed.symbol) {
      errors.push('symbol字段被意外修改');
    }
    
    if (original.type !== transformed.type) {
      errors.push('type字段被意外修改');
    }

    // 时间戳应该存在且合理
    if (!transformed.timestamp || transformed.timestamp <= 0) {
      errors.push('转换后timestamp无效');
    }

    // 元数据应该被添加或保持
    if (!transformed.metadata) {
      errors.push('转换后缺少metadata');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证通道输出数据
   */
  static validateChannelOutput(
    outputHistory: Array<{ data: MarketData; metadata?: any; timestamp: number }>,
    expectedCount: number,
    timeWindow?: { start: number; end: number }
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (outputHistory.length !== expectedCount) {
      errors.push(`输出数量不匹配: 期望 ${expectedCount}, 实际 ${outputHistory.length}`);
    }

    if (timeWindow) {
      const invalidTimestamps = outputHistory.filter(
        record => record.timestamp < timeWindow.start || record.timestamp > timeWindow.end
      );
      
      if (invalidTimestamps.length > 0) {
        errors.push(`有 ${invalidTimestamps.length} 条记录的时间戳超出预期范围`);
      }
    }

    // 验证数据完整性
    for (let i = 0; i < outputHistory.length; i++) {
      const record = outputHistory[i];
      const dataValidation = this.validateMarketData(record.data);
      
      if (!dataValidation.valid) {
        errors.push(`第 ${i + 1} 条输出记录数据无效: ${dataValidation.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}