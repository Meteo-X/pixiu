/**
 * 数据路由阶段实现
 * 提供高性能的数据路由和分发功能
 */

import { MarketData } from '@pixiu/adapter-base';
import { BasePipelineStage } from '../core/pipeline-stage';
import {
  PipelineStageType,
  PipelineData,
  PipelineContext,
  StageConfig
} from '../core/data-pipeline';

/**
 * 路由规则
 */
export interface RoutingRule {
  id: string;
  name: string;
  condition: RoutingCondition;
  target: RoutingTarget;
  enabled: boolean;
  priority: number;
  metadata?: Record<string, any>;
}

/**
 * 路由条件
 */
export interface RoutingCondition {
  type: 'exact' | 'pattern' | 'function' | 'composite';
  field: 'exchange' | 'symbol' | 'dataType' | 'custom';
  value?: string | string[];
  pattern?: RegExp;
  function?: (data: MarketData) => boolean;
  conditions?: RoutingCondition[]; // 用于composite类型
  operator?: 'AND' | 'OR'; // 用于composite类型
}

/**
 * 路由目标
 */
export interface RoutingTarget {
  type: 'topic' | 'queue' | 'pipeline' | 'function';
  destination: string | string[];
  properties?: Record<string, any>;
  transform?: (data: MarketData) => MarketData;
}

/**
 * 路由阶段配置
 */
export interface RouterStageConfig extends StageConfig {
  rules: RoutingRule[];
  defaultTarget?: RoutingTarget;
  enableFallback: boolean;
  fallbackTarget?: RoutingTarget;
  topicTemplate?: string;
  enableDuplication: boolean;
  routingStrategy: 'first_match' | 'all_matches' | 'priority_based';
  enableCaching: boolean;
  cacheSize?: number;
  cacheTtl?: number;
}

/**
 * 路由结果
 */
export interface RoutingResult {
  data: PipelineData;
  targets: RoutingTarget[];
  appliedRules: string[];
  routingKeys: string[];
  metadata: Record<string, any>;
}

/**
 * 路由缓存项
 */
interface RouteCacheItem {
  targets: RoutingTarget[];
  appliedRules: string[];
  timestamp: number;
  hitCount: number;
}

/**
 * 路由阶段实现
 */
export class RouterStage extends BasePipelineStage {
  private routerConfig: RouterStageConfig;
  private compiledRules: RoutingRule[] = [];
  private routeCache = new Map<string, RouteCacheItem>();
  private cacheCleanupTimer?: NodeJS.Timeout;
  private routingMetrics = {
    totalRouted: 0,
    cacheHits: 0,
    cacheMisses: 0,
    fallbackUsed: 0,
    duplications: 0
  };

  constructor(config: RouterStageConfig) {
    super(config.name || 'router', PipelineStageType.ROUTER, config);
    this.routerConfig = config;
  }

  protected async doInitialize(config: StageConfig): Promise<void> {
    this.routerConfig = config as RouterStageConfig;
    
    // 编译和排序路由规则
    this.compileRoutingRules();
    
    // 启动缓存清理定时器
    if (this.routerConfig.enableCaching) {
      this.startCacheCleanup();
    }

    this.emit('routerInitialized', {
      rulesCount: this.compiledRules.length,
      cachingEnabled: this.routerConfig.enableCaching,
      strategy: this.routerConfig.routingStrategy
    });
  }

  protected async doProcess(data: PipelineData, _context: PipelineContext): Promise<PipelineData | null> {
    try {
      const routingResult = await this.routeData(data);
      
      // 更新数据的路由信息
      const routedData: PipelineData = {
        ...data,
        metadata: {
          ...data.metadata,
          routingKeys: routingResult.routingKeys
        },
        attributes: {
          ...data.attributes,
          routingTargets: routingResult.targets,
          appliedRules: routingResult.appliedRules,
          routingMetadata: routingResult.metadata
        }
      };

      this.routingMetrics.totalRouted++;

      this.emit('dataRouted', {
        dataId: data.id,
        targets: routingResult.targets,
        appliedRules: routingResult.appliedRules,
        routingKeys: routingResult.routingKeys
      });

      // 如果启用了复制，为每个目标创建单独的数据副本
      if (this.routerConfig.enableDuplication && routingResult.targets.length > 1) {
        this.routingMetrics.duplications += routingResult.targets.length - 1;
        return this.createDuplicatedData(routedData, routingResult.targets);
      }

      return routedData;
    } catch (error) {
      this.emit('routingError', error, data);
      throw error;
    }
  }

  protected async doDestroy(): Promise<void> {
    // 停止缓存清理定时器
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = undefined;
    }

    // 清理缓存
    this.routeCache.clear();
  }

  /**
   * 添加路由规则
   */
  addRoutingRule(rule: RoutingRule): void {
    this.routerConfig.rules.push(rule);
    this.compileRoutingRules();
    this.emit('ruleAdded', rule);
  }

  /**
   * 移除路由规则
   */
  removeRoutingRule(ruleId: string): boolean {
    const index = this.routerConfig.rules.findIndex(rule => rule.id === ruleId);
    if (index >= 0) {
      const removedRule = this.routerConfig.rules.splice(index, 1)[0];
      this.compileRoutingRules();
      this.emit('ruleRemoved', removedRule);
      return true;
    }
    return false;
  }

  /**
   * 更新路由规则
   */
  updateRoutingRule(ruleId: string, updates: Partial<RoutingRule>): boolean {
    const rule = this.routerConfig.rules.find(rule => rule.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
      this.compileRoutingRules();
      this.emit('ruleUpdated', rule);
      return true;
    }
    return false;
  }

  /**
   * 获取路由指标
   */
  getRoutingMetrics() {
    return {
      ...this.routingMetrics,
      cacheSize: this.routeCache.size,
      cacheHitRate: this.routingMetrics.totalRouted > 0 
        ? this.routingMetrics.cacheHits / this.routingMetrics.totalRouted 
        : 0,
      rulesCount: this.compiledRules.length
    };
  }

  /**
   * 清理路由缓存
   */
  clearCache(): void {
    this.routeCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * 路由数据
   */
  private async routeData(data: PipelineData): Promise<RoutingResult> {
    const cacheKey = this.generateCacheKey(data);
    
    // 检查缓存
    if (this.routerConfig.enableCaching) {
      const cached = this.routeCache.get(cacheKey);
      if (cached && !this.isCacheExpired(cached)) {
        cached.hitCount++;
        this.routingMetrics.cacheHits++;
        
        return {
          data,
          targets: cached.targets,
          appliedRules: cached.appliedRules,
          routingKeys: this.generateRoutingKeys(cached.targets),
          metadata: {}
        };
      }
      this.routingMetrics.cacheMisses++;
    }

    // 执行路由匹配
    const matchingTargets: RoutingTarget[] = [];
    const appliedRules: string[] = [];

    for (const rule of this.compiledRules) {
      if (!rule.enabled) {
        continue;
      }

      if (await this.evaluateCondition(rule.condition, data.marketData)) {
        matchingTargets.push(rule.target);
        appliedRules.push(rule.id);

        // 根据策略决定是否继续匹配
        if (this.routerConfig.routingStrategy === 'first_match') {
          break;
        }
      }
    }

    // 处理无匹配的情况
    if (matchingTargets.length === 0) {
      if (this.routerConfig.defaultTarget) {
        matchingTargets.push(this.routerConfig.defaultTarget);
      } else if (this.routerConfig.enableFallback && this.routerConfig.fallbackTarget) {
        matchingTargets.push(this.routerConfig.fallbackTarget);
        this.routingMetrics.fallbackUsed++;
      }
    }

    // 生成路由键
    const routingKeys = this.generateRoutingKeys(matchingTargets);

    // 更新缓存
    if (this.routerConfig.enableCaching && matchingTargets.length > 0) {
      this.routeCache.set(cacheKey, {
        targets: matchingTargets,
        appliedRules,
        timestamp: Date.now(),
        hitCount: 0
      });
    }

    return {
      data,
      targets: matchingTargets,
      appliedRules,
      routingKeys,
      metadata: {}
    };
  }

  /**
   * 评估路由条件
   */
  private async evaluateCondition(condition: RoutingCondition, data: MarketData): Promise<boolean> {
    switch (condition.type) {
      case 'exact':
        return this.evaluateExactCondition(condition, data);
        
      case 'pattern':
        return this.evaluatePatternCondition(condition, data);
        
      case 'function':
        return condition.function ? condition.function(data) : false;
        
      case 'composite':
        return this.evaluateCompositeCondition(condition, data);
        
      default:
        return false;
    }
  }

  /**
   * 评估精确匹配条件
   */
  private evaluateExactCondition(condition: RoutingCondition, data: MarketData): boolean {
    const fieldValue = this.getFieldValue(condition.field, data);
    
    if (Array.isArray(condition.value)) {
      return condition.value.includes(fieldValue);
    }
    
    return fieldValue === condition.value;
  }

  /**
   * 评估模式匹配条件
   */
  private evaluatePatternCondition(condition: RoutingCondition, data: MarketData): boolean {
    if (!condition.pattern) {
      return false;
    }
    
    const fieldValue = this.getFieldValue(condition.field, data);
    return condition.pattern.test(fieldValue);
  }

  /**
   * 评估复合条件
   */
  private async evaluateCompositeCondition(condition: RoutingCondition, data: MarketData): Promise<boolean> {
    if (!condition.conditions || condition.conditions.length === 0) {
      return false;
    }

    const results = await Promise.all(
      condition.conditions.map(cond => this.evaluateCondition(cond, data))
    );

    if (condition.operator === 'OR') {
      return results.some(result => result);
    } else {
      return results.every(result => result);
    }
  }

  /**
   * 获取字段值
   */
  private getFieldValue(field: string, data: MarketData): string {
    switch (field) {
      case 'exchange':
        return data.exchange;
      case 'symbol':
        return data.symbol;
      case 'dataType':
        return data.type;
      default:
        return '';
    }
  }

  /**
   * 生成路由键
   */
  private generateRoutingKeys(targets: RoutingTarget[]): string[] {
    const keys: string[] = [];
    
    for (const target of targets) {
      if (target.type === 'topic') {
        if (Array.isArray(target.destination)) {
          keys.push(...target.destination);
        } else {
          keys.push(target.destination);
        }
      }
    }
    
    return keys;
  }

  /**
   * 创建复制数据
   */
  private createDuplicatedData(data: PipelineData, targets: RoutingTarget[]): PipelineData {
    // 简化实现，实际应该为每个目标创建单独的数据副本
    return {
      ...data,
      attributes: {
        ...data.attributes,
        duplicatedTargets: targets
      }
    };
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(data: PipelineData): string {
    return `${data.metadata.exchange}:${data.metadata.symbol}:${data.metadata.dataType}`;
  }

  /**
   * 检查缓存是否过期
   */
  private isCacheExpired(item: RouteCacheItem): boolean {
    if (!this.routerConfig.cacheTtl) {
      return false;
    }
    
    return Date.now() - item.timestamp > this.routerConfig.cacheTtl;
  }

  /**
   * 编译路由规则
   */
  private compileRoutingRules(): void {
    // 按优先级排序规则
    this.compiledRules = [...this.routerConfig.rules]
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    // 预编译正则表达式
    for (const rule of this.compiledRules) {
      this.compileCondition(rule.condition);
    }
  }

  /**
   * 编译条件
   */
  private compileCondition(condition: RoutingCondition): void {
    if (condition.type === 'pattern' && typeof condition.value === 'string') {
      condition.pattern = new RegExp(condition.value);
    }
    
    if (condition.type === 'composite' && condition.conditions) {
      for (const subCondition of condition.conditions) {
        this.compileCondition(subCondition);
      }
    }
  }

  /**
   * 启动缓存清理
   */
  private startCacheCleanup(): void {
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
    }

    this.cacheCleanupTimer = setInterval(() => {
      this.cleanupCache();
    }, this.routerConfig.cacheTtl || 60000);
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache(): void {
    const maxSize = this.routerConfig.cacheSize || 1000;
    
    // 移除过期项
    for (const [key, item] of this.routeCache) {
      if (this.isCacheExpired(item)) {
        this.routeCache.delete(key);
      }
    }

    // 如果缓存仍然太大，移除最少使用的项
    if (this.routeCache.size > maxSize) {
      const entries = Array.from(this.routeCache.entries())
        .sort((a, b) => a[1].hitCount - b[1].hitCount);
      
      const toRemove = entries.slice(0, this.routeCache.size - maxSize);
      for (const [key] of toRemove) {
        this.routeCache.delete(key);
      }
    }
  }
}