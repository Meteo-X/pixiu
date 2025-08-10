/**
 * 消息路由器实现
 * 根据路由规则将数据路由到不同的输出通道
 */

import { EventEmitter } from 'events';
import { MarketData } from '@pixiu/adapter-base';
import { BaseMonitor } from '@pixiu/shared-core';
import { RoutingRule, OutputChannel } from '../interfaces';

export interface RouterStats {
  totalRoutedMessages: number;
  routingErrors: number;
  averageRoutingLatency: number;
  ruleMatchCounts: Map<string, number>;
  lastActivity: number;
}

/**
 * 智能消息路由器
 */
export class MessageRouter extends EventEmitter {
  private rules: Map<string, RoutingRule> = new Map();
  private channels: Map<string, OutputChannel> = new Map();
  private monitor: BaseMonitor;
  private stats: RouterStats;

  constructor(monitor: BaseMonitor) {
    super();
    this.monitor = monitor;
    this.stats = {
      totalRoutedMessages: 0,
      routingErrors: 0,
      averageRoutingLatency: 0,
      ruleMatchCounts: new Map(),
      lastActivity: 0
    };
  }

  /**
   * 添加路由规则
   */
  addRule(rule: RoutingRule): void {
    // 验证规则
    if (!rule.name || typeof rule.condition !== 'function') {
      throw new Error('Invalid routing rule: name and condition are required');
    }

    if (!rule.targetChannels || rule.targetChannels.length === 0) {
      throw new Error('Invalid routing rule: targetChannels cannot be empty');
    }

    this.rules.set(rule.name, rule);
    this.stats.ruleMatchCounts.set(rule.name, 0);
    
    this.monitor.log('debug', 'Routing rule added', { 
      ruleName: rule.name, 
      targets: rule.targetChannels,
      priority: rule.priority 
    });
    
    this.emit('ruleAdded', rule);
  }

  /**
   * 移除路由规则
   */
  removeRule(ruleName: string): void {
    if (this.rules.has(ruleName)) {
      this.rules.delete(ruleName);
      this.stats.ruleMatchCounts.delete(ruleName);
      
      this.monitor.log('debug', 'Routing rule removed', { ruleName });
      this.emit('ruleRemoved', ruleName);
    }
  }

  /**
   * 注册输出通道
   */
  registerChannel(channel: OutputChannel): void {
    this.channels.set(channel.id, channel);
    
    this.monitor.log('debug', 'Output channel registered', { 
      channelId: channel.id, 
      type: channel.type,
      name: channel.name
    });
    
    this.emit('channelRegistered', channel);
  }

  /**
   * 注销输出通道
   */
  unregisterChannel(channelId: string): void {
    if (this.channels.has(channelId)) {
      const channel = this.channels.get(channelId)!;
      this.channels.delete(channelId);
      
      this.monitor.log('debug', 'Output channel unregistered', { channelId });
      this.emit('channelUnregistered', channel);
    }
  }

  /**
   * 路由数据到匹配的通道
   */
  async route(data: MarketData): Promise<void> {
    const startTime = Date.now();
    
    try {
      // 获取匹配的规则（按优先级排序）
      const matchedRules = this.getMatchingRules(data);
      
      if (matchedRules.length === 0) {
        this.monitor.log('debug', 'No routing rules matched for data', {
          exchange: data.exchange,
          symbol: data.symbol,
          type: data.type
        });
        return;
      }

      // 收集所有目标通道（去重）
      const targetChannelIds = new Set<string>();
      const transformedData = new Map<string, MarketData>();

      for (const rule of matchedRules) {
        // 应用数据转换
        const processedData = rule.transform ? rule.transform(data) : data;
        
        // 添加目标通道
        rule.targetChannels.forEach(channelId => {
          targetChannelIds.add(channelId);
          transformedData.set(channelId, processedData);
        });

        // 更新规则匹配计数
        const currentCount = this.stats.ruleMatchCounts.get(rule.name) || 0;
        this.stats.ruleMatchCounts.set(rule.name, currentCount + 1);
        
        this.emit('ruleMatched', rule.name, data);
      }

      // 并发发送到所有目标通道
      const routingPromises = Array.from(targetChannelIds).map(async (channelId) => {
        const channel = this.channels.get(channelId);
        if (!channel) {
          this.monitor.log('warn', 'Target channel not found', { channelId });
          return;
        }

        if (!channel.enabled) {
          this.monitor.log('debug', 'Target channel disabled, skipping', { channelId });
          return;
        }

        try {
          const dataToSend = transformedData.get(channelId) || data;
          await channel.output(dataToSend, { 
            routedBy: 'message-router',
            routedAt: Date.now() 
          });
          
          this.monitor.log('debug', 'Data routed successfully', {
            channelId: channel.id,
            channelType: channel.type,
            exchange: data.exchange,
            symbol: data.symbol,
            type: data.type
          });
        } catch (error) {
          this.stats.routingErrors++;
          this.monitor.log('error', 'Failed to route data to channel', {
            channelId,
            error: error.message,
            data: { exchange: data.exchange, symbol: data.symbol, type: data.type }
          });
          
          this.emit('channelError', channelId, error);
        }
      });

      await Promise.allSettled(routingPromises);
      
      // 更新统计信息
      this.updateStats(Date.now() - startTime);
      
      this.emit('dataRouted', data, Array.from(targetChannelIds));
      
    } catch (error) {
      this.stats.routingErrors++;
      this.monitor.log('error', 'Routing error', { 
        error: error.message,
        data: { exchange: data.exchange, symbol: data.symbol, type: data.type }
      });
      
      this.emit('routingError', error, data);
      throw error;
    }
  }

  /**
   * 获取匹配的路由规则
   */
  private getMatchingRules(data: MarketData): RoutingRule[] {
    const matchedRules: RoutingRule[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      try {
        if (rule.condition(data)) {
          matchedRules.push(rule);
        }
      } catch (error) {
        this.monitor.log('error', 'Error evaluating routing rule condition', {
          ruleName: rule.name,
          error: error.message
        });
      }
    }

    // 按优先级排序（高优先级在前）
    return matchedRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 获取路由器统计信息
   */
  getStats(): RouterStats {
    return {
      ...this.stats,
      ruleMatchCounts: new Map(this.stats.ruleMatchCounts)
    };
  }

  /**
   * 获取所有路由规则
   */
  getRules(): RoutingRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 获取已注册的通道
   */
  getChannels(): OutputChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * 获取路由器状态
   */
  getStatus() {
    return {
      rulesCount: this.rules.size,
      channelsCount: this.channels.size,
      enabledRulesCount: Array.from(this.rules.values()).filter(r => r.enabled).length,
      enabledChannelsCount: Array.from(this.channels.values()).filter(c => c.enabled).length,
      stats: this.getStats()
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalRoutedMessages: 0,
      routingErrors: 0,
      averageRoutingLatency: 0,
      ruleMatchCounts: new Map(),
      lastActivity: 0
    };
    
    // 重新初始化规则计数
    for (const ruleName of this.rules.keys()) {
      this.stats.ruleMatchCounts.set(ruleName, 0);
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(routingLatency: number): void {
    this.stats.totalRoutedMessages++;
    this.stats.lastActivity = Date.now();
    
    // 更新平均延迟
    const totalLatency = this.stats.averageRoutingLatency * (this.stats.totalRoutedMessages - 1) + routingLatency;
    this.stats.averageRoutingLatency = totalLatency / this.stats.totalRoutedMessages;
  }
}

/**
 * 创建常用的路由规则
 */
export class RoutingRuleFactory {
  /**
   * 创建基于交易所的路由规则
   */
  static createExchangeRule(exchange: string, targetChannels: string[], priority = 1): RoutingRule {
    return {
      name: `exchange-${exchange}`,
      condition: (data: MarketData) => data.exchange.toLowerCase() === exchange.toLowerCase(),
      targetChannels,
      enabled: true,
      priority
    };
  }

  /**
   * 创建基于数据类型的路由规则
   */
  static createDataTypeRule(dataType: string, targetChannels: string[], priority = 1): RoutingRule {
    return {
      name: `datatype-${dataType}`,
      condition: (data: MarketData) => data.type === dataType,
      targetChannels,
      enabled: true,
      priority
    };
  }

  /**
   * 创建基于交易对的路由规则
   */
  static createSymbolRule(symbol: string, targetChannels: string[], priority = 1): RoutingRule {
    return {
      name: `symbol-${symbol}`,
      condition: (data: MarketData) => data.symbol.toUpperCase() === symbol.toUpperCase(),
      targetChannels,
      enabled: true,
      priority
    };
  }

  /**
   * 创建基于多个条件的复合路由规则
   */
  static createCompositeRule(
    name: string,
    conditions: Array<(data: MarketData) => boolean>,
    targetChannels: string[],
    priority = 1
  ): RoutingRule {
    return {
      name,
      condition: (data: MarketData) => conditions.every(condition => condition(data)),
      targetChannels,
      enabled: true,
      priority
    };
  }

  /**
   * 创建通配符路由规则（匹配所有数据）
   */
  static createCatchAllRule(targetChannels: string[], priority = 0): RoutingRule {
    return {
      name: 'catch-all',
      condition: () => true,
      targetChannels,
      enabled: true,
      priority
    };
  }
}