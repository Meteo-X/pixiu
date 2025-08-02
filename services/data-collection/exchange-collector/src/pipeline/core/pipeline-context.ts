/**
 * 管道上下文和工具类
 * 提供管道执行过程中的上下文管理和工具函数
 */

import { MarketData } from '@pixiu/adapter-base';
import { PipelineData, PipelineContext, DataMetadata } from './data-pipeline';

/**
 * 管道上下文工厂
 */
export class PipelineContextFactory {
  /**
   * 创建新的管道上下文
   */
  static create(
    pipelineId: string,
    totalStages: number,
    correlationId?: string
  ): PipelineContext {
    return {
      pipelineId,
      stageIndex: 0,
      totalStages,
      startTime: Date.now(),
      correlationId: correlationId || this.generateCorrelationId(),
      properties: {},
      metrics: {
        processedStages: 0,
        errors: 0,
        warnings: 0,
        totalLatency: 0,
        stageLatencies: new Map()
      }
    };
  }

  /**
   * 克隆上下文
   */
  static clone(context: PipelineContext): PipelineContext {
    return {
      ...context,
      properties: { ...context.properties },
      metrics: {
        ...context.metrics,
        stageLatencies: new Map(context.metrics.stageLatencies)
      }
    };
  }

  /**
   * 生成关联ID
   */
  private static generateCorrelationId(): string {
    return `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 管道数据工厂
 */
export class PipelineDataFactory {
  /**
   * 创建管道数据
   */
  static create(
    marketData: MarketData,
    source: string,
    metadata?: Partial<DataMetadata>
  ): PipelineData {
    return {
      id: this.generateDataId(),
      marketData,
      metadata: {
        exchange: marketData.exchange,
        symbol: marketData.symbol,
        dataType: marketData.type,
        priority: 1,
        retryCount: 0,
        ...metadata
      },
      timestamp: Date.now(),
      source,
      attributes: {}
    };
  }

  /**
   * 克隆管道数据
   */
  static clone(data: PipelineData): PipelineData {
    return {
      ...data,
      metadata: { ...data.metadata },
      attributes: { ...data.attributes }
    };
  }

  /**
   * 更新市场数据
   */
  static updateMarketData(data: PipelineData, marketData: MarketData): PipelineData {
    return {
      ...data,
      marketData,
      metadata: {
        ...data.metadata,
        exchange: marketData.exchange,
        symbol: marketData.symbol,
        dataType: marketData.type
      }
    };
  }

  /**
   * 添加属性
   */
  static addAttribute(data: PipelineData, key: string, value: any): PipelineData {
    return {
      ...data,
      attributes: {
        ...data.attributes,
        [key]: value
      }
    };
  }

  /**
   * 添加多个属性
   */
  static addAttributes(data: PipelineData, attributes: Record<string, any>): PipelineData {
    return {
      ...data,
      attributes: {
        ...data.attributes,
        ...attributes
      }
    };
  }

  /**
   * 设置路由键
   */
  static setRoutingKeys(data: PipelineData, routingKeys: string[]): PipelineData {
    return {
      ...data,
      metadata: {
        ...data.metadata,
        routingKeys
      }
    };
  }

  /**
   * 增加重试次数
   */
  static incrementRetryCount(data: PipelineData): PipelineData {
    return {
      ...data,
      metadata: {
        ...data.metadata,
        retryCount: data.metadata.retryCount + 1
      }
    };
  }

  /**
   * 生成数据ID
   */
  private static generateDataId(): string {
    return `data-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 上下文属性管理器
 */
export class ContextPropertyManager {
  /**
   * 获取属性
   */
  static getProperty<T>(context: PipelineContext, key: string, defaultValue?: T): T | undefined {
    return context.properties[key] ?? defaultValue;
  }

  /**
   * 设置属性
   */
  static setProperty<T>(context: PipelineContext, key: string, value: T): void {
    context.properties[key] = value;
  }

  /**
   * 删除属性
   */
  static removeProperty(context: PipelineContext, key: string): void {
    delete context.properties[key];
  }

  /**
   * 检查属性是否存在
   */
  static hasProperty(context: PipelineContext, key: string): boolean {
    return key in context.properties;
  }

  /**
   * 获取所有属性
   */
  static getAllProperties(context: PipelineContext): Record<string, any> {
    return { ...context.properties };
  }

  /**
   * 清空所有属性
   */
  static clearProperties(context: PipelineContext): void {
    context.properties = {};
  }
}

/**
 * 指标收集器
 */
export class MetricsCollector {
  /**
   * 记录阶段开始
   */
  static recordStageStart(context: PipelineContext, stageName: string): void {
    const startTime = Date.now();
    ContextPropertyManager.setProperty(context, `stage_${stageName}_start`, startTime);
  }

  /**
   * 记录阶段结束
   */
  static recordStageEnd(context: PipelineContext, stageName: string): number {
    const endTime = Date.now();
    const startTime = ContextPropertyManager.getProperty<number>(context, `stage_${stageName}_start`);
    
    if (startTime) {
      const latency = endTime - startTime;
      context.metrics.stageLatencies.set(stageName, latency);
      ContextPropertyManager.removeProperty(context, `stage_${stageName}_start`);
      return latency;
    }
    
    return 0;
  }

  /**
   * 记录错误
   */
  static recordError(context: PipelineContext, error: Error, stageName?: string): void {
    context.metrics.errors++;
    
    if (stageName) {
      ContextPropertyManager.setProperty(context, `error_${stageName}`, {
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 记录警告
   */
  static recordWarning(context: PipelineContext, message: string, stageName?: string): void {
    context.metrics.warnings++;
    
    if (stageName) {
      ContextPropertyManager.setProperty(context, `warning_${stageName}`, {
        message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 计算总延迟
   */
  static calculateTotalLatency(context: PipelineContext): number {
    return Date.now() - context.startTime;
  }

  /**
   * 获取阶段延迟
   */
  static getStageLatency(context: PipelineContext, stageName: string): number | undefined {
    return context.metrics.stageLatencies.get(stageName);
  }

  /**
   * 获取所有阶段延迟
   */
  static getAllStageLatencies(context: PipelineContext): Map<string, number> {
    return new Map(context.metrics.stageLatencies);
  }

  /**
   * 获取指标摘要
   */
  static getMetricsSummary(context: PipelineContext): {
    totalLatency: number;
    processedStages: number;
    errors: number;
    warnings: number;
    stageLatencies: Record<string, number>;
  } {
    return {
      totalLatency: this.calculateTotalLatency(context),
      processedStages: context.metrics.processedStages,
      errors: context.metrics.errors,
      warnings: context.metrics.warnings,
      stageLatencies: Object.fromEntries(context.metrics.stageLatencies)
    };
  }
}

/**
 * 数据验证器
 */
export class DataValidator {
  /**
   * 验证市场数据
   */
  static validateMarketData(marketData: MarketData): boolean {
    return !!(
      marketData &&
      marketData.exchange &&
      marketData.symbol &&
      marketData.type &&
      marketData.timestamp &&
      marketData.data
    );
  }

  /**
   * 验证管道数据
   */
  static validatePipelineData(data: PipelineData): boolean {
    return !!(
      data &&
      data.id &&
      data.timestamp &&
      data.source &&
      data.metadata &&
      this.validateMarketData(data.marketData)
    );
  }

  /**
   * 验证管道上下文
   */
  static validatePipelineContext(context: PipelineContext): boolean {
    return !!(
      context &&
      context.pipelineId &&
      context.correlationId &&
      context.startTime &&
      context.totalStages >= 0 &&
      context.stageIndex >= 0 &&
      context.stageIndex <= context.totalStages &&
      context.metrics
    );
  }

  /**
   * 验证数据元数据
   */
  static validateDataMetadata(metadata: DataMetadata): boolean {
    return !!(
      metadata &&
      metadata.exchange &&
      metadata.symbol &&
      metadata.dataType &&
      typeof metadata.priority === 'number' &&
      typeof metadata.retryCount === 'number' &&
      metadata.priority >= 0 &&
      metadata.retryCount >= 0
    );
  }
}

/**
 * 上下文工具类
 */
export class ContextUtils {
  /**
   * 创建子上下文
   */
  static createChildContext(
    parent: PipelineContext,
    childPipelineId: string
  ): PipelineContext {
    return {
      ...parent,
      pipelineId: childPipelineId,
      stageIndex: 0,
      correlationId: `${parent.correlationId}-child-${Date.now()}`,
      properties: { ...parent.properties },
      metrics: {
        processedStages: 0,
        errors: 0,
        warnings: 0,
        totalLatency: 0,
        stageLatencies: new Map()
      }
    };
  }

  /**
   * 合并上下文指标
   */
  static mergeMetrics(target: PipelineContext, source: PipelineContext): void {
    target.metrics.errors += source.metrics.errors;
    target.metrics.warnings += source.metrics.warnings;
    target.metrics.processedStages += source.metrics.processedStages;

    // 合并阶段延迟
    for (const [stageName, latency] of source.metrics.stageLatencies) {
      target.metrics.stageLatencies.set(stageName, latency);
    }
  }

  /**
   * 格式化上下文信息
   */
  static formatContextInfo(context: PipelineContext): string {
    const metrics = MetricsCollector.getMetricsSummary(context);
    return `Pipeline[${context.pipelineId}] Stage[${context.stageIndex}/${context.totalStages}] ` +
           `Correlation[${context.correlationId}] ` +
           `Latency[${metrics.totalLatency}ms] ` +
           `Errors[${metrics.errors}] Warnings[${metrics.warnings}]`;
  }

  /**
   * 生成跟踪ID
   */
  static generateTraceId(context: PipelineContext): string {
    return `trace-${context.pipelineId}-${context.correlationId}-${Date.now()}`;
  }

  /**
   * 检查是否为最后阶段
   */
  static isLastStage(context: PipelineContext): boolean {
    return context.stageIndex === context.totalStages - 1;
  }

  /**
   * 检查是否为第一阶段
   */
  static isFirstStage(context: PipelineContext): boolean {
    return context.stageIndex === 0;
  }

  /**
   * 获取进度百分比
   */
  static getProgress(context: PipelineContext): number {
    if (context.totalStages === 0) {
      return 100;
    }
    return Math.round((context.stageIndex / context.totalStages) * 100);
  }
}