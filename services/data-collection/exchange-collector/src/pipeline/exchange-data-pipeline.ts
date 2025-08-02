/**
 * Exchange数据管道实现
 * 集成适配器数据处理管道到Exchange Collector中
 */

import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor, BaseErrorHandler, PubSubClientImpl } from '@pixiu/shared-core';
import { DataPipeline, PipelineConfig, PipelineStage, StageConfig } from './core/data-pipeline';
import { InputStage, TransformStage, FilterStage, OutputStage } from './core/pipeline-stage';
import { BufferStage, BufferStageConfig } from './stages/buffer-stage';
import { RouterStage as RouterStageImpl, RouterStageConfig } from './stages/router-stage';

/**
 * Exchange数据管道配置
 */
export interface ExchangeDataPipelineConfig extends PipelineConfig {
  pubsubClient: PubSubClientImpl;
  topicPrefix: string;
  enableDataValidation: boolean;
  enableDataTransformation: boolean;
  enableRouting: boolean;
  enableBuffering: boolean;
  bufferConfig?: BufferStageConfig;
  routerConfig?: RouterStageConfig;
}

/**
 * Exchange数据管道实现
 */
export class ExchangeDataPipeline extends DataPipeline {
  private pubsubClient: PubSubClientImpl;
  private pipelineConfig: ExchangeDataPipelineConfig;

  constructor(
    config: ExchangeDataPipelineConfig,
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ) {
    super(config, monitor, errorHandler);
    this.pubsubClient = config.pubsubClient;
    this.pipelineConfig = config;
  }

  /**
   * 创建管道阶段
   */
  protected async createStage(config: StageConfig): Promise<PipelineStage> {
    switch (config.name) {
      case 'input':
        return new InputStage(config);
        
      case 'validation':
        return new TransformStage({
          ...config,
          transformer: this.createDataValidator()
        });
        
      case 'transformation':
        return new TransformStage({
          ...config,
          transformer: this.createDataTransformer()
        });
        
      case 'filtering':
        return new FilterStage({
          ...config,
          filter: this.createDataFilter()
        });
        
      case 'routing':
        return new RouterStageImpl(this.pipelineConfig.routerConfig || {
          ...config,
          rules: [],
          enableFallback: true,
          routingStrategy: 'first_match',
          enableCaching: true,
          enableDuplication: false
        } as RouterStageConfig);
        
      case 'buffering':
        return new BufferStage(this.pipelineConfig.bufferConfig || {
          ...config,
          bufferPolicy: {
            maxSize: 1000,
            maxAge: 5000,
            flushInterval: 1000,
            backpressureThreshold: 0.8
          },
          partitionBy: 'symbol',
          enableBackpressure: true,
          backpressureStrategy: 'BLOCK',
          enableCompression: false,
          flushCallback: this.createBatchPublisher()
        } as BufferStageConfig);
        
      case 'output':
        return new OutputStage({
          ...config,
          publisher: this.createSinglePublisher()
        });
        
      default:
        throw new Error(`Unknown stage type: ${config.name}`);
    }
  }

  /**
   * 创建数据验证器
   */
  private createDataValidator() {
    return async (data: MarketData): Promise<MarketData> => {
      // 基本数据验证
      if (!data.exchange || !data.symbol || !data.type || !data.timestamp) {
        throw new Error('Invalid market data: missing required fields');
      }

      // 时间戳验证
      const now = Date.now();
      if (data.timestamp > now + 60000 || data.timestamp < now - 300000) {
        throw new Error('Invalid timestamp: data too old or from future');
      }

      // 数据完整性验证
      if (!data.data || typeof data.data !== 'object') {
        throw new Error('Invalid market data: data field is required');
      }

      return data;
    };
  }

  /**
   * 创建数据转换器
   */
  private createDataTransformer() {
    return async (data: MarketData): Promise<MarketData> => {
      // 标准化交易所名称
      const normalizedExchange = data.exchange.toLowerCase();
      
      // 标准化交易对
      const normalizedSymbol = data.symbol.toUpperCase();
      
      // 添加处理时间戳
      const transformedData: MarketData = {
        ...data,
        exchange: normalizedExchange,
        symbol: normalizedSymbol,
        receivedAt: data.receivedAt || Date.now()
      };

      return transformedData;
    };
  }

  /**
   * 创建数据过滤器
   */
  private createDataFilter() {
    return async (data: MarketData): Promise<boolean> => {
      // 过滤测试数据
      if (data.exchange.includes('test') || data.symbol.includes('TEST')) {
        return false;
      }

      // 过滤无效价格数据
      if (data.type === 'ticker' && data.data.price && data.data.price <= 0) {
        return false;
      }

      // 过滤重复数据（简化实现）
      // 实际应该基于更复杂的去重逻辑
      return true;
    };
  }

  /**
   * 创建批量发布器
   */
  private createBatchPublisher() {
    return async (dataList: any[]): Promise<void> => {
      if (dataList.length === 0) {
        return;
      }

      try {
        // 按路由键分组
        const groupedData = this.groupDataByRoutingKeys(dataList);
        
        // 并发发布到不同的主题
        const publishPromises = Array.from(groupedData.entries()).map(
          ([routingKey, data]) => this.publishBatchToTopic(routingKey, data)
        );

        await Promise.all(publishPromises);

        this.monitor.log('debug', 'Batch published successfully', {
          totalData: dataList.length,
          topics: groupedData.size
        });
      } catch (error) {
        this.monitor.log('error', 'Batch publish failed', { error, dataCount: dataList.length });
        throw error;
      }
    };
  }

  /**
   * 创建单个发布器
   */
  private createSinglePublisher() {
    return async (dataList: any[]): Promise<void> => {
      for (const pipelineData of dataList) {
        await this.publishSingleData(pipelineData);
      }
    };
  }

  /**
   * 按路由键分组数据
   */
  private groupDataByRoutingKeys(dataList: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const pipelineData of dataList) {
      const routingKeys = pipelineData.metadata?.routingKeys || ['default'];
      
      for (const routingKey of routingKeys) {
        const topicName = this.buildTopicName(routingKey, pipelineData.marketData);
        
        if (!grouped.has(topicName)) {
          grouped.set(topicName, []);
        }
        
        grouped.get(topicName)!.push(pipelineData);
      }
    }

    return grouped;
  }

  /**
   * 批量发布到主题
   */
  private async publishBatchToTopic(topicName: string, dataList: any[]): Promise<void> {
    const messages = dataList.map(pipelineData => ({
      data: pipelineData.marketData,
      options: {
        attributes: this.buildMessageAttributes(pipelineData.marketData, pipelineData.source)
      }
    }));

    const result = await this.pubsubClient.publishBatch(topicName, messages);
    
    this.monitor.log('debug', 'Published batch to topic', {
      topic: topicName,
      successCount: result.successCount,
      failureCount: result.failureCount
    });

    if (result.failureCount > 0) {
      throw new Error(`Failed to publish ${result.failureCount} messages to topic ${topicName}`);
    }
  }

  /**
   * 发布单个数据
   */
  private async publishSingleData(pipelineData: any): Promise<void> {
    const routingKeys = pipelineData.metadata?.routingKeys || ['default'];
    
    for (const routingKey of routingKeys) {
      const topicName = this.buildTopicName(routingKey, pipelineData.marketData);
      
      await this.pubsubClient.publish(
        topicName,
        pipelineData.marketData,
        {
          attributes: this.buildMessageAttributes(pipelineData.marketData, pipelineData.source)
        }
      );
    }
  }

  /**
   * 构建主题名称
   */
  private buildTopicName(routingKey: string, marketData: MarketData): string {
    if (routingKey === 'default') {
      return `${this.pipelineConfig.topicPrefix}-market-data-${marketData.exchange}`;
    }
    
    // 如果routingKey已经是完整的主题名称，直接使用
    if (routingKey.includes(this.pipelineConfig.topicPrefix)) {
      return routingKey;
    }
    
    // 否则构建主题名称
    return `${this.pipelineConfig.topicPrefix}-${routingKey}`;
  }

  /**
   * 构建消息属性
   */
  private buildMessageAttributes(marketData: MarketData, source: string): Record<string, string> {
    return {
      exchange: marketData.exchange,
      symbol: marketData.symbol,
      type: marketData.type,
      timestamp: marketData.timestamp.toString(),
      source: source,
      processedAt: Date.now().toString()
    };
  }
}

/**
 * 数据管道工厂
 */
export class ExchangeDataPipelineFactory {
  /**
   * 创建标准的Exchange数据管道
   */
  static createStandardPipeline(
    config: {
      id: string;
      name: string;
      pubsubClient: PubSubClientImpl;
      topicPrefix: string;
      enableBuffering?: boolean;
      bufferSize?: number;
      batchTimeout?: number;
    },
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ): ExchangeDataPipeline {
    const pipelineConfig: ExchangeDataPipelineConfig = {
      id: config.id,
      name: config.name,
      pubsubClient: config.pubsubClient,
      topicPrefix: config.topicPrefix,
      enableDataValidation: true,
      enableDataTransformation: true,
      enableRouting: false,
      enableBuffering: config.enableBuffering || false,
      stages: [
        {
          enabled: true,
          name: 'input',
          parallel: false,
          timeout: 5000,
          retryCount: 0,
          retryInterval: 1000
        },
        {
          enabled: true,
          name: 'validation',
          parallel: false,
          timeout: 1000,
          retryCount: 3,
          retryInterval: 500
        },
        {
          enabled: true,
          name: 'transformation',
          parallel: false,
          timeout: 1000,
          retryCount: 3,
          retryInterval: 500
        }
      ],
      errorHandling: {
        strategy: 'CONTINUE',
        maxRetries: 3,
        retryInterval: 1000
      },
      monitoring: {
        enableMetrics: true,
        enableTracing: false,
        metricsInterval: 30000,
        healthCheckInterval: 30000,
        alertThresholds: {
          errorRate: 0.05,
          latency: 1000,
          throughput: 100,
          memoryUsage: 0.8
        }
      },
      performance: {
        maxConcurrency: 100,
        queueSize: 1000,
        backpressureStrategy: 'BLOCK',
        memoryLimit: 100 * 1024 * 1024, // 100MB
        gcThreshold: 0.8
      }
    };

    // 添加缓冲阶段
    if (config.enableBuffering) {
      pipelineConfig.stages.push({
        enabled: true,
        name: 'buffering',
        parallel: false,
        timeout: 10000,
        retryCount: 1,
        retryInterval: 1000
      });

      pipelineConfig.bufferConfig = {
        enabled: true,
        name: 'buffering',
        parallel: false,
        timeout: 10000,
        retryCount: 1,
        retryInterval: 1000,
        bufferPolicy: {
          maxSize: config.bufferSize || 1000,
          maxAge: 30000,
          flushInterval: config.batchTimeout || 5000,
          backpressureThreshold: 0.8
        },
        partitionBy: 'symbol',
        enableBackpressure: true,
        backpressureStrategy: 'BLOCK',
        enableCompression: false
      };
    } else {
      // 添加输出阶段
      pipelineConfig.stages.push({
        enabled: true,
        name: 'output',
        parallel: false,
        timeout: 5000,
        retryCount: 3,
        retryInterval: 1000
      });
    }

    return new ExchangeDataPipeline(pipelineConfig, monitor, errorHandler);
  }

  /**
   * 创建高性能缓冲管道
   */
  static createBufferedPipeline(
    config: {
      id: string;
      name: string;
      pubsubClient: PubSubClientImpl;
      topicPrefix: string;
      bufferSize: number;
      batchTimeout: number;
      partitionBy: 'exchange' | 'symbol' | 'dataType';
    },
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ): ExchangeDataPipeline {
    return this.createStandardPipeline({
      ...config,
      enableBuffering: true
    }, monitor, errorHandler);
  }

  /**
   * 创建路由管道
   */
  static createRoutingPipeline(
    config: {
      id: string;
      name: string;
      pubsubClient: PubSubClientImpl;
      topicPrefix: string;
      routingRules: any[];
    },
    monitor: BaseMonitor,
    errorHandler: BaseErrorHandler
  ): ExchangeDataPipeline {
    const pipeline = this.createStandardPipeline(config, monitor, errorHandler);
    
    // 添加路由阶段
    const pipelineConfig = pipeline['pipelineConfig'] as ExchangeDataPipelineConfig;
    pipelineConfig.enableRouting = true;
    pipelineConfig.routerConfig = {
      enabled: true,
      name: 'routing',
      parallel: false,
      timeout: 2000,
      retryCount: 1,
      retryInterval: 500,
      rules: config.routingRules,
      enableFallback: true,
      routingStrategy: 'first_match',
      enableCaching: true,
      enableDuplication: false,
      cacheSize: 1000,
      cacheTtl: 60000
    };

    // 在transformation之后添加routing阶段
    pipelineConfig.stages.splice(2, 0, {
      enabled: true,
      name: 'routing',
      parallel: false,
      timeout: 2000,
      retryCount: 1,
      retryInterval: 500
    });

    return pipeline;
  }
}