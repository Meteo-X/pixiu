/**
 * 数据流管理器工厂
 * 提供便捷的创建和配置方法
 */

import { PubSubClientImpl, BaseMonitor } from '@pixiu/shared-core';
import { DataFlowManager } from './data-flow-manager';
import { DataFlowConfig, RoutingRule } from './interfaces';
import { MessageRouter, RoutingRuleFactory } from './routing/message-router';
import { 
  PubSubOutputChannel, 
  WebSocketOutputChannel, 
  CacheOutputChannel,
  BatchOutputChannel 
} from './channels/output-channels';
import { CollectorWebSocketServer } from '../websocket';
import { DataStreamCache } from '../cache';

export interface DataFlowSetupOptions {
  // 核心组件
  pubsubClient: PubSubClientImpl;
  webSocketServer?: CollectorWebSocketServer;
  dataStreamCache?: DataStreamCache;
  monitor: BaseMonitor;
  
  // 配置选项
  config?: Partial<DataFlowConfig>;
  pubsubConfig?: {
    topicPrefix?: string;
    enableBatching?: boolean;
    batchSize?: number;
  };
  
  // 通道启用配置
  enabledChannels?: {
    pubsub?: boolean;
    websocket?: boolean;
    cache?: boolean;
  };
  
  // 路由规则预设
  routingPresets?: 'default' | 'high-performance' | 'comprehensive' | 'custom';
  customRules?: RoutingRule[];
}

/**
 * 数据流管理器工厂类
 */
export class DataFlowManagerFactory {
  
  /**
   * 创建完整配置的数据流管理器
   */
  static async create(options: DataFlowSetupOptions): Promise<DataFlowManager> {
    const {
      pubsubClient,
      webSocketServer,
      dataStreamCache,
      monitor,
      config = {},
      pubsubConfig = {},
      enabledChannels = {},
      routingPresets = 'default',
      customRules = []
    } = options;

    // 创建数据流管理器
    const dataFlowManager = new DataFlowManager();
    
    // 构建完整配置
    const fullConfig = this.buildDataFlowConfig(config);
    
    // 初始化管理器
    await dataFlowManager.initialize(fullConfig, monitor);

    // 注册输出通道
    await this.setupOutputChannels(dataFlowManager, {
      pubsubClient,
      webSocketServer,
      dataStreamCache,
      monitor,
      pubsubConfig,
      enabledChannels
    });

    // 设置路由规则
    this.setupRoutingRules(dataFlowManager, routingPresets, customRules, pubsubConfig);

    monitor.log('info', 'DataFlowManager created with factory', {
      enabledChannels,
      routingPresets,
      customRulesCount: customRules.length
    });

    return dataFlowManager;
  }

  /**
   * 构建默认数据流配置
   */
  private static buildDataFlowConfig(userConfig: Partial<DataFlowConfig>): DataFlowConfig {
    return {
      enabled: true,
      batching: {
        enabled: userConfig.batching?.enabled ?? true,
        batchSize: userConfig.batching?.batchSize ?? 20,
        flushTimeout: userConfig.batching?.flushTimeout ?? 1000
      },
      performance: {
        maxQueueSize: userConfig.performance?.maxQueueSize ?? 10000,
        processingTimeout: userConfig.performance?.processingTimeout ?? 5000,
        enableBackpressure: userConfig.performance?.enableBackpressure ?? true,
        backpressureThreshold: userConfig.performance?.backpressureThreshold ?? 8000
      },
      monitoring: {
        enableMetrics: userConfig.monitoring?.enableMetrics ?? true,
        metricsInterval: userConfig.monitoring?.metricsInterval ?? 30000,
        enableLatencyTracking: userConfig.monitoring?.enableLatencyTracking ?? true
      },
      errorHandling: {
        retryCount: userConfig.errorHandling?.retryCount ?? 3,
        retryDelay: userConfig.errorHandling?.retryDelay ?? 1000,
        enableCircuitBreaker: userConfig.errorHandling?.enableCircuitBreaker ?? true,
        circuitBreakerThreshold: userConfig.errorHandling?.circuitBreakerThreshold ?? 10
      }
    };
  }

  /**
   * 设置输出通道
   */
  private static async setupOutputChannels(
    dataFlowManager: DataFlowManager,
    options: {
      pubsubClient: PubSubClientImpl;
      webSocketServer?: CollectorWebSocketServer;
      dataStreamCache?: DataStreamCache;
      monitor: BaseMonitor;
      pubsubConfig: any;
      enabledChannels: any;
    }
  ): Promise<void> {
    const {
      pubsubClient,
      webSocketServer,
      dataStreamCache,
      monitor,
      pubsubConfig,
      enabledChannels
    } = options;

    // 注册PubSub通道
    if (enabledChannels.pubsub !== false) {
      const pubsubChannel = new PubSubOutputChannel(
        'pubsub-main',
        pubsubClient,
        monitor,
        {
          name: 'Main PubSub Channel',
          topicPrefix: pubsubConfig.topicPrefix || 'market-data',
          enabled: true
        }
      );

      // 如果启用批处理，包装在批处理通道中
      if (pubsubConfig.enableBatching) {
        const batchChannel = new BatchOutputChannel(
          'pubsub-batch',
          pubsubChannel,
          monitor,
          {
            name: 'Batched PubSub Channel',
            batchSize: pubsubConfig.batchSize || 20,
            flushTimeout: 1000,
            enabled: true
          }
        );
        dataFlowManager.registerChannel(batchChannel);
      } else {
        dataFlowManager.registerChannel(pubsubChannel);
      }
    }

    // 注册WebSocket通道
    if (enabledChannels.websocket !== false && webSocketServer) {
      const websocketChannel = new WebSocketOutputChannel(
        'websocket-main',
        webSocketServer,
        monitor,
        {
          name: 'Main WebSocket Channel',
          enabled: true
        }
      );
      dataFlowManager.registerChannel(websocketChannel);
    }

    // 注册缓存通道
    if (enabledChannels.cache !== false && dataStreamCache) {
      const cacheChannel = new CacheOutputChannel(
        'cache-main',
        dataStreamCache,
        monitor,
        {
          name: 'Main Cache Channel',
          enabled: true
        }
      );
      dataFlowManager.registerChannel(cacheChannel);
    }
  }

  /**
   * 设置路由规则
   */
  private static setupRoutingRules(
    dataFlowManager: DataFlowManager,
    preset: string,
    customRules: RoutingRule[],
    pubsubConfig: any
  ): void {
    // 添加预设规则
    const presetRules = this.getPresetRules(preset, pubsubConfig);
    presetRules.forEach(rule => dataFlowManager.addRoutingRule(rule));

    // 添加自定义规则
    customRules.forEach(rule => dataFlowManager.addRoutingRule(rule));
  }

  /**
   * 获取预设路由规则
   */
  private static getPresetRules(preset: string, pubsubConfig: any): RoutingRule[] {
    const rules: RoutingRule[] = [];

    // 确定可用的通道
    const availableChannels = ['pubsub-main', 'pubsub-batch'].filter(Boolean);
    if (pubsubConfig.enableBatching) {
      availableChannels.push('pubsub-batch');
    }
    availableChannels.push('websocket-main', 'cache-main');

    switch (preset) {
      case 'default':
        // 所有数据路由到所有可用通道
        rules.push(RoutingRuleFactory.createCatchAllRule(availableChannels, 1));
        break;

      case 'high-performance':
        // 高频数据只发送到缓存和WebSocket，低频数据发送到PubSub
        rules.push({
          name: 'high-frequency-data',
          condition: (data) => ['trade', 'ticker'].includes(data.type),
          targetChannels: ['websocket-main', 'cache-main'],
          enabled: true,
          priority: 10
        });
        
        rules.push({
          name: 'low-frequency-data',
          condition: (data) => !['trade', 'ticker'].includes(data.type),
          targetChannels: pubsubConfig.enableBatching ? ['pubsub-batch'] : ['pubsub-main'],
          enabled: true,
          priority: 5
        });
        break;

      case 'comprehensive':
        // 按数据类型分别路由
        rules.push(RoutingRuleFactory.createDataTypeRule('trade', availableChannels, 10));
        rules.push(RoutingRuleFactory.createDataTypeRule('ticker', availableChannels, 9));
        rules.push(RoutingRuleFactory.createDataTypeRule('depth', 
          pubsubConfig.enableBatching ? ['pubsub-batch', 'cache-main'] : ['pubsub-main', 'cache-main'], 8));
        
        // 按交易所路由
        rules.push(RoutingRuleFactory.createExchangeRule('binance', availableChannels, 7));
        
        // Kline数据特殊处理
        rules.push({
          name: 'kline-data',
          condition: (data) => data.type.startsWith('kline_'),
          targetChannels: pubsubConfig.enableBatching ? ['pubsub-batch'] : ['pubsub-main'],
          enabled: true,
          priority: 6
        });
        
        // 兜底规则
        rules.push(RoutingRuleFactory.createCatchAllRule(['cache-main'], 1));
        break;

      case 'custom':
        // 不添加预设规则，只使用用户提供的自定义规则
        break;

      default:
        // 默认规则
        rules.push(RoutingRuleFactory.createCatchAllRule(availableChannels, 1));
        break;
    }

    return rules;
  }

  /**
   * 创建简化的数据流管理器（仅用于测试）
   */
  static async createSimple(
    monitor: BaseMonitor, 
    config: Partial<DataFlowConfig> = {}
  ): Promise<DataFlowManager> {
    const dataFlowManager = new DataFlowManager();
    const fullConfig = this.buildDataFlowConfig(config);
    
    await dataFlowManager.initialize(fullConfig, monitor);
    
    return dataFlowManager;
  }
}

/**
 * 便捷的工厂函数
 */
export async function createDataFlowManager(options: DataFlowSetupOptions): Promise<DataFlowManager> {
  return DataFlowManagerFactory.create(options);
}