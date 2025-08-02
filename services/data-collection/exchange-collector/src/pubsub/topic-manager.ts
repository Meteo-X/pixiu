/**
 * Topic 管理器
 * Task 4.2: 实现动态 Topic 路由和 Topic 命名规则
 * 
 * 功能特性：
 * - 动态 Topic 路由
 * - Topic 命名规则管理
 * - Topic 自动创建
 * - 消息分区策略
 */

import { EventEmitter } from 'events';
import { PubSub, Topic } from '@google-cloud/pubsub';
import { BaseMonitor, BaseErrorHandler } from '@pixiu/shared-core';
import { MarketData, DataType } from '@pixiu/adapter-base';

/**
 * Topic 命名规则配置
 */
export interface TopicNamingConfig {
  // 基础配置
  prefix: string;                    // Topic 前缀，如 "market"
  separator: string;                 // 分隔符，如 "."
  includeEnvironment: boolean;       // 是否包含环境信息
  environment?: string;              // 环境名称，如 "dev", "prod"
  
  // 命名模式
  pattern: TopicNamingPattern;       // 命名模式
  customPatterns?: Map<string, string>; // 自定义模式映射
  
  // 规范化选项
  normalization: {
    toLowerCase: boolean;            // 是否转换为小写
    removeSpecialChars: boolean;     // 是否移除特殊字符
    maxLength: number;               // 最大长度限制
    replaceSpaces: string;           // 空格替换字符
  };
}

/**
 * Topic 命名模式
 */
export enum TopicNamingPattern {
  // market.{type}.{exchange}.{symbol}
  TYPE_EXCHANGE_SYMBOL = 'type_exchange_symbol',
  
  // market.{exchange}.{type}.{symbol}
  EXCHANGE_TYPE_SYMBOL = 'exchange_type_symbol',
  
  // market.{exchange}.{symbol}.{type}
  EXCHANGE_SYMBOL_TYPE = 'exchange_symbol_type',
  
  // market.{type}.{symbol}
  TYPE_SYMBOL = 'type_symbol',
  
  // market.{exchange}.{symbol}
  EXCHANGE_SYMBOL = 'exchange_symbol',
  
  // market.{exchange}
  EXCHANGE_ONLY = 'exchange_only',
  
  // 自定义模式
  CUSTOM = 'custom'
}

/**
 * Topic 路由规则
 */
export interface TopicRoutingRule {
  id: string;
  name: string;
  description?: string;
  
  // 条件匹配
  conditions: {
    exchanges?: string[];           // 交易所白名单
    excludeExchanges?: string[];    // 交易所黑名单
    symbols?: string[];             // 交易对白名单
    excludeSymbols?: string[];      // 交易对黑名单
    dataTypes?: DataType[];         // 数据类型白名单
    excludeDataTypes?: DataType[];  // 数据类型黑名单
    customFilter?: (data: MarketData) => boolean; // 自定义过滤器
  };
  
  // 路由目标
  target: {
    topicPattern?: TopicNamingPattern; // 使用特定命名模式
    topicName?: string;               // 固定 Topic 名称
    dynamicTopicGenerator?: (data: MarketData) => string; // 动态生成器
  };
  
  // 规则配置
  enabled: boolean;
  priority: number;                 // 优先级，数字越大优先级越高
  fallthrough: boolean;             // 是否继续匹配其他规则
}

/**
 * Topic 配置
 */
export interface TopicConfig {
  name: string;
  
  // 消息保留配置
  messageRetentionDuration?: number; // 消息保留时间（秒）
  
  // 分区配置
  partitions?: {
    enabled: boolean;
    partitionCount: number;
    partitionKey: 'exchange' | 'symbol' | 'type' | 'custom';
    customPartitioner?: (data: MarketData) => string;
  };
  
  // 消息排序
  messageOrdering?: {
    enabled: boolean;
    orderingKey: 'exchange' | 'symbol' | 'timestamp' | 'custom';
    customOrderingKey?: (data: MarketData) => string;
  };
  
  // Schema 配置
  schema?: {
    type: 'avro' | 'protobuf' | 'json';
    definition: string;
  };
}

/**
 * Topic 统计信息
 */
export interface TopicStats {
  name: string;
  messageCount: number;
  subscriptionCount: number;
  lastMessageTime?: number;
  averageMessageSize: number;
  totalBytes: number;
  errorCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 路由结果
 */
export interface RoutingResult {
  topics: string[];
  orderingKeys?: Map<string, string>;
  partitionKeys?: Map<string, string>;
  metadata: {
    appliedRules: string[];
    routingTime: number;
    fallbackUsed: boolean;
  };
}

/**
 * Topic 管理器
 */
export class TopicManager extends EventEmitter {
  private client: PubSub;
  private topics: Map<string, Topic> = new Map();
  private topicConfigs: Map<string, TopicConfig> = new Map();
  private routingRules: TopicRoutingRule[] = [];
  private topicStats: Map<string, TopicStats> = new Map();
  
  // 路由缓存
  private routingCache: Map<string, RoutingResult> = new Map();
  private cacheSize = 10000;
  private cacheHitCount = 0;
  private cacheMissCount = 0;
  
  constructor(
    private config: TopicNamingConfig,
    private pubsubClient: PubSub,
    private monitor: BaseMonitor,
    private errorHandler: BaseErrorHandler
  ) {
    super();
    this.client = pubsubClient;
    this.startStatsCollection();
  }

  /**
   * 根据市场数据路由到相应的 Topic
   */
  async routeMessage(data: MarketData): Promise<RoutingResult> {
    const startTime = Date.now();
    
    // 生成缓存键
    const cacheKey = this.generateCacheKey(data);
    
    // 检查缓存
    const cachedResult = this.routingCache.get(cacheKey);
    if (cachedResult) {
      this.cacheHitCount++;
      return {
        ...cachedResult,
        metadata: {
          ...cachedResult.metadata,
          routingTime: Date.now() - startTime
        }
      };
    }
    
    this.cacheMissCount++;
    
    try {
      const result = await this.performRouting(data, startTime);
      
      // 缓存结果
      this.cacheRoutingResult(cacheKey, result);
      
      this.emit('messageRouted', {
        data,
        result,
        cacheHit: false
      });
      
      return result;
    } catch (error) {
      this.monitor.log('error', 'Message routing failed', { data, error });
      throw error;
    }
  }

  /**
   * 批量路由消息
   */
  async routeMessages(dataList: MarketData[]): Promise<Map<string, MarketData[]>> {
    const routedMessages = new Map<string, MarketData[]>();
    
    const routingPromises = dataList.map(async (data) => {
      try {
        const result = await this.routeMessage(data);
        
        for (const topic of result.topics) {
          if (!routedMessages.has(topic)) {
            routedMessages.set(topic, []);
          }
          routedMessages.get(topic)!.push(data);
        }
      } catch (error) {
        this.monitor.log('error', 'Failed to route message in batch', { data, error });
      }
    });
    
    await Promise.all(routingPromises);
    
    this.emit('batchRouted', {
      totalMessages: dataList.length,
      topicCount: routedMessages.size,
      routedMessages
    });
    
    return routedMessages;
  }

  /**
   * 生成 Topic 名称
   */
  generateTopicName(data: MarketData, pattern?: TopicNamingPattern): string {
    const namingPattern = pattern || this.config.pattern;
    
    // 标准化数据
    const normalizedData = this.normalizeDataForNaming(data);
    
    let topicName: string;
    
    switch (namingPattern) {
      case TopicNamingPattern.TYPE_EXCHANGE_SYMBOL:
        topicName = this.buildTopicName([
          normalizedData.type,
          normalizedData.exchange,
          normalizedData.symbol
        ]);
        break;
        
      case TopicNamingPattern.EXCHANGE_TYPE_SYMBOL:
        topicName = this.buildTopicName([
          normalizedData.exchange,
          normalizedData.type,
          normalizedData.symbol
        ]);
        break;
        
      case TopicNamingPattern.EXCHANGE_SYMBOL_TYPE:
        topicName = this.buildTopicName([
          normalizedData.exchange,
          normalizedData.symbol,
          normalizedData.type
        ]);
        break;
        
      case TopicNamingPattern.TYPE_SYMBOL:
        topicName = this.buildTopicName([
          normalizedData.type,
          normalizedData.symbol
        ]);
        break;
        
      case TopicNamingPattern.EXCHANGE_SYMBOL:
        topicName = this.buildTopicName([
          normalizedData.exchange,
          normalizedData.symbol
        ]);
        break;
        
      case TopicNamingPattern.EXCHANGE_ONLY:
        topicName = this.buildTopicName([
          normalizedData.exchange
        ]);
        break;
        
      case TopicNamingPattern.CUSTOM:
        topicName = this.generateCustomTopicName(data);
        break;
        
      default:
        topicName = this.buildTopicName([
          normalizedData.exchange,
          normalizedData.type,
          normalizedData.symbol
        ]);
    }
    
    return this.applyNormalization(topicName);
  }

  /**
   * 创建 Topic
   */
  async createTopic(config: TopicConfig): Promise<void> {
    try {
      const [topic] = await this.client.createTopic(config.name);
      
      // 设置 Topic 配置
      if (config.messageRetentionDuration) {
        await topic.setMetadata({
          messageRetentionDuration: {
            seconds: config.messageRetentionDuration
          }
        });
      }
      
      // 保存配置
      this.topicConfigs.set(config.name, config);
      this.topics.set(config.name, topic);
      
      // 初始化统计
      this.topicStats.set(config.name, {
        name: config.name,
        messageCount: 0,
        subscriptionCount: 0,
        averageMessageSize: 0,
        totalBytes: 0,
        errorCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      this.monitor.log('info', 'Topic created', { topic: config.name });
      this.emit('topicCreated', { topic: config.name, config });
      
    } catch (error: any) {
      if (error.code === 6) { // Already exists
        this.monitor.log('debug', 'Topic already exists', { topic: config.name });
        return;
      }
      
      this.monitor.log('error', 'Failed to create topic', { 
        topic: config.name, 
        error 
      });
      throw error;
    }
  }

  /**
   * 删除 Topic
   */
  async deleteTopic(topicName: string): Promise<void> {
    try {
      await this.client.topic(topicName).delete();
      
      // 清理缓存和配置
      this.topics.delete(topicName);
      this.topicConfigs.delete(topicName);
      this.topicStats.delete(topicName);
      this.clearTopicCache(topicName);
      
      this.monitor.log('info', 'Topic deleted', { topic: topicName });
      this.emit('topicDeleted', { topic: topicName });
      
    } catch (error: any) {
      if (error.code === 5) { // Not found
        return;
      }
      
      this.monitor.log('error', 'Failed to delete topic', { 
        topic: topicName, 
        error 
      });
      throw error;
    }
  }

  /**
   * 添加路由规则
   */
  addRoutingRule(rule: TopicRoutingRule): void {
    // 验证规则
    this.validateRoutingRule(rule);
    
    // 添加规则
    this.routingRules.push(rule);
    
    // 按优先级排序
    this.routingRules.sort((a, b) => b.priority - a.priority);
    
    // 清理路由缓存
    this.clearRoutingCache();
    
    this.monitor.log('info', 'Routing rule added', { ruleId: rule.id });
    this.emit('routingRuleAdded', { rule });
  }

  /**
   * 移除路由规则
   */
  removeRoutingRule(ruleId: string): boolean {
    const index = this.routingRules.findIndex(rule => rule.id === ruleId);
    if (index >= 0) {
      const rule = this.routingRules.splice(index, 1)[0];
      this.clearRoutingCache();
      
      this.monitor.log('info', 'Routing rule removed', { ruleId });
      this.emit('routingRuleRemoved', { rule });
      return true;
    }
    return false;
  }

  /**
   * 更新路由规则
   */
  updateRoutingRule(ruleId: string, updates: Partial<TopicRoutingRule>): boolean {
    const rule = this.routingRules.find(r => r.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
      
      // 重新排序
      this.routingRules.sort((a, b) => b.priority - a.priority);
      
      // 清理缓存
      this.clearRoutingCache();
      
      this.monitor.log('info', 'Routing rule updated', { ruleId });
      this.emit('routingRuleUpdated', { rule });
      return true;
    }
    return false;
  }

  /**
   * 获取所有路由规则
   */
  getRoutingRules(): TopicRoutingRule[] {
    return [...this.routingRules];
  }

  /**
   * 获取 Topic 统计信息
   */
  getTopicStats(topicName?: string): TopicStats | Map<string, TopicStats> {
    if (topicName) {
      return this.topicStats.get(topicName)!;
    }
    return new Map(this.topicStats);
  }

  /**
   * 获取路由缓存统计
   */
  getCacheStats(): {
    size: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
  } {
    const totalRequests = this.cacheHitCount + this.cacheMissCount;
    return {
      size: this.routingCache.size,
      hitCount: this.cacheHitCount,
      missCount: this.cacheMissCount,
      hitRate: totalRequests > 0 ? this.cacheHitCount / totalRequests : 0
    };
  }

  /**
   * 清理路由缓存
   */
  clearRoutingCache(): void {
    this.routingCache.clear();
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
  }

  /**
   * 执行路由逻辑
   */
  private async performRouting(data: MarketData, startTime: number): Promise<RoutingResult> {
    const result: RoutingResult = {
      topics: [],
      orderingKeys: new Map(),
      partitionKeys: new Map(),
      metadata: {
        appliedRules: [],
        routingTime: 0,
        fallbackUsed: false
      }
    };

    let matched = false;

    // 遍历路由规则
    for (const rule of this.routingRules) {
      if (!rule.enabled) {
        continue;
      }

      if (this.matchesRule(data, rule)) {
        matched = true;
        
        // 生成 Topic 名称
        const topicName = await this.generateTopicFromRule(data, rule);
        if (topicName && !result.topics.includes(topicName)) {
          result.topics.push(topicName);
          
          // 生成排序键和分区键
          const topicConfig = this.topicConfigs.get(topicName);
          if (topicConfig) {
            this.generateOrderingKey(data, topicConfig, result.orderingKeys, topicName);
            this.generatePartitionKey(data, topicConfig, result.partitionKeys, topicName);
          }
        }
        
        result.metadata.appliedRules.push(rule.id);
        
        // 如果不允许穿透，停止匹配
        if (!rule.fallthrough) {
          break;
        }
      }
    }

    // 如果没有匹配任何规则，使用默认路由
    if (!matched) {
      const defaultTopic = this.generateTopicName(data);
      result.topics.push(defaultTopic);
      result.metadata.fallbackUsed = true;
    }

    // 确保所有 Topic 存在
    await this.ensureTopicsExist(result.topics);

    result.metadata.routingTime = Date.now() - startTime;
    return result;
  }

  /**
   * 检查数据是否匹配规则
   */
  private matchesRule(data: MarketData, rule: TopicRoutingRule): boolean {
    const conditions = rule.conditions;

    // 检查交易所白名单
    if (conditions.exchanges && !conditions.exchanges.includes(data.exchange)) {
      return false;
    }

    // 检查交易所黑名单
    if (conditions.excludeExchanges && conditions.excludeExchanges.includes(data.exchange)) {
      return false;
    }

    // 检查交易对白名单
    if (conditions.symbols && !conditions.symbols.includes(data.symbol)) {
      return false;
    }

    // 检查交易对黑名单
    if (conditions.excludeSymbols && conditions.excludeSymbols.includes(data.symbol)) {
      return false;
    }

    // 检查数据类型白名单
    if (conditions.dataTypes && !conditions.dataTypes.includes(data.type)) {
      return false;
    }

    // 检查数据类型黑名单
    if (conditions.excludeDataTypes && conditions.excludeDataTypes.includes(data.type)) {
      return false;
    }

    // 执行自定义过滤器
    if (conditions.customFilter && !conditions.customFilter(data)) {
      return false;
    }

    return true;
  }

  /**
   * 从规则生成 Topic 名称
   */
  private async generateTopicFromRule(data: MarketData, rule: TopicRoutingRule): Promise<string> {
    const target = rule.target;

    if (target.topicName) {
      return target.topicName;
    }

    if (target.dynamicTopicGenerator) {
      return target.dynamicTopicGenerator(data);
    }

    if (target.topicPattern) {
      return this.generateTopicName(data, target.topicPattern);
    }

    // 默认使用配置的命名模式
    return this.generateTopicName(data);
  }

  /**
   * 生成排序键
   */
  private generateOrderingKey(
    data: MarketData,
    config: TopicConfig,
    orderingKeys: Map<string, string>,
    topicName: string
  ): void {
    if (!config.messageOrdering?.enabled) {
      return;
    }

    let orderingKey: string;
    
    switch (config.messageOrdering.orderingKey) {
      case 'exchange':
        orderingKey = data.exchange;
        break;
      case 'symbol':
        orderingKey = data.symbol;
        break;
      case 'timestamp':
        orderingKey = Math.floor(data.timestamp / 1000).toString(); // 秒级时间戳
        break;
      case 'custom':
        orderingKey = config.messageOrdering.customOrderingKey!(data);
        break;
      default:
        orderingKey = `${data.exchange}-${data.symbol}`;
    }

    orderingKeys.set(topicName, orderingKey);
  }

  /**
   * 生成分区键
   */
  private generatePartitionKey(
    data: MarketData,
    config: TopicConfig,
    partitionKeys: Map<string, string>,
    topicName: string
  ): void {
    if (!config.partitions?.enabled) {
      return;
    }

    let partitionKey: string;
    
    switch (config.partitions.partitionKey) {
      case 'exchange':
        partitionKey = data.exchange;
        break;
      case 'symbol':
        partitionKey = data.symbol;
        break;
      case 'type':
        partitionKey = data.type;
        break;
      case 'custom':
        partitionKey = config.partitions.customPartitioner!(data);
        break;
      default:
        partitionKey = `${data.exchange}-${data.symbol}`;
    }

    partitionKeys.set(topicName, partitionKey);
  }

  /**
   * 确保 Topic 存在
   */
  private async ensureTopicsExist(topicNames: string[]): Promise<void> {
    const createPromises = topicNames.map(async (topicName) => {
      if (!this.topics.has(topicName)) {
        await this.createTopic({
          name: topicName,
          messageRetentionDuration: this.config.topicSettings?.topicRetentionHours ? 
            this.config.topicSettings.topicRetentionHours * 3600 : undefined
        });
      }
    });

    await Promise.all(createPromises);
  }

  /**
   * 标准化数据用于命名
   */
  private normalizeDataForNaming(data: MarketData): {
    exchange: string;
    symbol: string;
    type: string;
  } {
    return {
      exchange: this.normalizeString(data.exchange),
      symbol: this.normalizeString(data.symbol),
      type: this.normalizeString(data.type)
    };
  }

  /**
   * 标准化字符串
   */
  private normalizeString(str: string): string {
    let normalized = str;

    if (this.config.normalization.toLowerCase) {
      normalized = normalized.toLowerCase();
    }

    if (this.config.normalization.removeSpecialChars) {
      normalized = normalized.replace(/[^a-zA-Z0-9_-]/g, '');
    }

    normalized = normalized.replace(/\s+/g, this.config.normalization.replaceSpaces);

    if (normalized.length > this.config.normalization.maxLength) {
      normalized = normalized.substring(0, this.config.normalization.maxLength);
    }

    return normalized;
  }

  /**
   * 构建 Topic 名称
   */
  private buildTopicName(parts: string[]): string {
    const fullParts = [this.config.prefix];

    if (this.config.includeEnvironment && this.config.environment) {
      fullParts.push(this.config.environment);
    }

    fullParts.push(...parts);

    return fullParts.join(this.config.separator);
  }

  /**
   * 生成自定义 Topic 名称
   */
  private generateCustomTopicName(data: MarketData): string {
    if (this.config.customPatterns) {
      const key = `${data.exchange}-${data.type}`;
      const pattern = this.config.customPatterns.get(key);
      if (pattern) {
        return pattern
          .replace('{exchange}', data.exchange)
          .replace('{symbol}', data.symbol)
          .replace('{type}', data.type);
      }
    }
    
    // 默认回退
    return this.generateTopicName(data, TopicNamingPattern.EXCHANGE_TYPE_SYMBOL);
  }

  /**
   * 应用标准化规则
   */
  private applyNormalization(topicName: string): string {
    return this.normalizeString(topicName);
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(data: MarketData): string {
    return `${data.exchange}-${data.symbol}-${data.type}`;
  }

  /**
   * 缓存路由结果
   */
  private cacheRoutingResult(key: string, result: RoutingResult): void {
    // 限制缓存大小
    if (this.routingCache.size >= this.cacheSize) {
      // 删除最早的缓存项
      const firstKey = this.routingCache.keys().next().value;
      this.routingCache.delete(firstKey);
    }

    this.routingCache.set(key, result);
  }

  /**
   * 清理特定 Topic 的缓存
   */
  private clearTopicCache(topicName: string): void {
    for (const [key, result] of this.routingCache.entries()) {
      if (result.topics.includes(topicName)) {
        this.routingCache.delete(key);
      }
    }
  }

  /**
   * 验证路由规则
   */
  private validateRoutingRule(rule: TopicRoutingRule): void {
    if (!rule.id || !rule.name) {
      throw new Error('Routing rule must have id and name');
    }

    if (this.routingRules.some(r => r.id === rule.id)) {
      throw new Error(`Routing rule with id ${rule.id} already exists`);
    }

    if (!rule.target.topicName && !rule.target.topicPattern && !rule.target.dynamicTopicGenerator) {
      throw new Error('Routing rule must have a valid target');
    }
  }

  /**
   * 开始统计收集
   */
  private startStatsCollection(): void {
    // 每分钟更新统计信息
    setInterval(() => {
      this.updateTopicStats();
    }, 60000);
  }

  /**
   * 更新 Topic 统计信息
   */
  private async updateTopicStats(): Promise<void> {
    for (const [topicName, stats] of this.topicStats.entries()) {
      try {
        const topic = this.client.topic(topicName);
        const [metadata] = await topic.getMetadata();
        
        // 更新统计信息
        stats.updatedAt = Date.now();
        // 注意：实际的消息计数和订阅计数需要从 Google Cloud Monitoring API 获取
        // 这里只是示例结构
        
      } catch (error) {
        this.monitor.log('warn', 'Failed to update topic stats', { 
          topic: topicName, 
          error 
        });
      }
    }
  }
}

/**
 * 默认 Topic 命名配置
 */
export const DEFAULT_TOPIC_NAMING_CONFIG: TopicNamingConfig = {
  prefix: 'market',
  separator: '.',
  includeEnvironment: true,
  environment: process.env.NODE_ENV || 'dev',
  pattern: TopicNamingPattern.EXCHANGE_TYPE_SYMBOL,
  normalization: {
    toLowerCase: true,
    removeSpecialChars: true,
    maxLength: 249, // Google Cloud Pub/Sub 限制
    replaceSpaces: '-'
  }
};