/**
 * Binance 订阅管理器主实现
 * 
 * 功能:
 * - 管理所有订阅的生命周期
 * - 支持多流组合订阅
 * - 处理订阅/取消订阅逻辑
 * - 动态流管理和负载均衡
 * - 订阅迁移和故障恢复
 */

import { EventEmitter } from 'events';
import {
  ISubscriptionManager,
  IStreamNameBuilder,
  SubscriptionManagerConfig,
  BinanceStreamSubscription,
  SubscriptionResult,
  SubscriptionStats,
  SubscriptionStatus,
  SubscriptionEvent,
  SubscriptionError,
  SubscriptionErrorCode,
  SubscriptionEventData
} from './interfaces';
import { StreamNameBuilder } from './StreamNameBuilder';
import { DataSubscription } from '../types';

export class SubscriptionManager extends EventEmitter implements ISubscriptionManager {
  private config!: SubscriptionManagerConfig;
  private streamBuilder: IStreamNameBuilder;
  private isInitialized = false;

  // 订阅存储
  private subscriptions = new Map<string, BinanceStreamSubscription>();
  private subscriptionsByConnection = new Map<string, Set<string>>();
  private subscriptionsByStream = new Map<string, string>(); // streamName -> subscriptionId

  // 统计和监控
  private stats: SubscriptionStats = this.createEmptyStats();
  
  // 定时器
  private statsUpdateTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.streamBuilder = new StreamNameBuilder();
  }

  /**
   * 初始化订阅管理器
   */
  public async initialize(config: SubscriptionManagerConfig): Promise<void> {
    if (this.isInitialized) {
      throw new Error('SubscriptionManager is already initialized');
    }

    this.config = { ...config };
    
    // 验证配置
    this.validateConfig();

    // 启动定期统计更新
    this.startStatsUpdater();

    this.isInitialized = true;
    
    this.emit('initialized', {
      timestamp: Date.now(),
      config: this.config
    });
  }

  /**
   * 添加订阅
   */
  public async subscribe(subscriptions: DataSubscription[]): Promise<SubscriptionResult> {
    if (!this.isInitialized) {
      throw new Error('SubscriptionManager is not initialized');
    }

    const result: SubscriptionResult = {
      success: true,
      successful: [],
      failed: [],
      existing: [],
      summary: {
        total: subscriptions.length,
        successful: 0,
        failed: 0,
        existing: 0
      }
    };

    // 验证订阅数量限制
    const totalAfterAdd = this.subscriptions.size + subscriptions.length;
    if (totalAfterAdd > this.config.validation.maxSubscriptions) {
      throw new Error(`Would exceed maximum subscriptions: ${totalAfterAdd} > ${this.config.validation.maxSubscriptions}`);
    }

    // 处理每个订阅
    for (const subscription of subscriptions) {
      try {
        const subscriptionResult = await this.addSingleSubscription(subscription);
        
        if (subscriptionResult.isExisting) {
          result.existing.push(subscriptionResult.subscription);
          result.summary.existing++;
        } else {
          result.successful.push(subscriptionResult.subscription);
          result.summary.successful++;
        }
        
      } catch (error) {
        result.failed.push({
          subscription,
          error: this.createSubscriptionError(error, subscription),
          retryCount: 0
        });
        result.summary.failed++;
        result.success = false;
      }
    }

    // 更新统计
    this.updateStats();

    // 发出事件
    this.emit(SubscriptionEvent.SUBSCRIPTION_ADDED, {
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * 取消订阅
   */
  public async unsubscribe(subscriptions: DataSubscription[]): Promise<SubscriptionResult> {
    if (!this.isInitialized) {
      throw new Error('SubscriptionManager is not initialized');
    }

    const result: SubscriptionResult = {
      success: true,
      successful: [],
      failed: [],
      existing: [],
      summary: {
        total: subscriptions.length,
        successful: 0,
        failed: 0,
        existing: 0
      }
    };

    // 处理每个取消订阅请求
    for (const subscription of subscriptions) {
      try {
        const removed = await this.removeSingleSubscription(subscription);
        
        if (removed) {
          result.successful.push(removed);
          result.summary.successful++;
        } else {
          // 订阅不存在，记录为已存在状态
          result.summary.existing++;
        }
        
      } catch (error) {
        result.failed.push({
          subscription,
          error: this.createSubscriptionError(error, subscription),
          retryCount: 0
        });
        result.summary.failed++;
        result.success = false;
      }
    }

    // 更新统计
    this.updateStats();

    // 发出事件
    this.emit(SubscriptionEvent.SUBSCRIPTION_REMOVED, {
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * 获取当前所有活跃订阅
   */
  public getActiveSubscriptions(): BinanceStreamSubscription[] {
    return Array.from(this.subscriptions.values())
      .filter(sub => sub.status === SubscriptionStatus.ACTIVE);
  }

  /**
   * 获取订阅统计信息
   */
  public getSubscriptionStats(): SubscriptionStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * 检查订阅是否存在
   */
  public hasSubscription(subscription: DataSubscription): boolean {
    const key = this.createSubscriptionKey(subscription);
    return this.subscriptions.has(key);
  }

  /**
   * 清空所有订阅
   */
  public async clearAllSubscriptions(): Promise<void> {
    const allSubscriptions = Array.from(this.subscriptions.values())
      .map(sub => sub.original);
    
    if (allSubscriptions.length > 0) {
      await this.unsubscribe(allSubscriptions);
    }
  }

  /**
   * 获取指定连接的订阅列表
   */
  public getSubscriptionsByConnection(connectionId: string): BinanceStreamSubscription[] {
    const subscriptionIds = this.subscriptionsByConnection.get(connectionId);
    if (!subscriptionIds) {
      return [];
    }

    return Array.from(subscriptionIds)
      .map(id => this.subscriptions.get(id))
      .filter(sub => sub !== undefined) as BinanceStreamSubscription[];
  }

  /**
   * 迁移订阅到新连接
   */
  public async migrateSubscriptions(
    fromConnectionId: string,
    toConnectionId: string
  ): Promise<void> {
    const subscriptionsToMigrate = this.getSubscriptionsByConnection(fromConnectionId);
    
    if (subscriptionsToMigrate.length === 0) {
      return;
    }

    this.emit('migration_started', {
      fromConnectionId,
      toConnectionId,
      subscriptionCount: subscriptionsToMigrate.length,
      timestamp: Date.now()
    });

    try {
      // 更新连接映射
      for (const subscription of subscriptionsToMigrate) {
        subscription.connectionId = toConnectionId;
        subscription.lastActiveAt = Date.now();

        // 更新连接索引
        this.removeSubscriptionFromConnection(fromConnectionId, subscription);
        this.addSubscriptionToConnection(toConnectionId, subscription);
      }

      // 发出连接变更事件
      this.emit(SubscriptionEvent.CONNECTION_CHANGED, {
        subscriptions: subscriptionsToMigrate,
        oldConnectionId: fromConnectionId,
        newConnectionId: toConnectionId
      } as SubscriptionEventData['connectionChanged']);

      this.emit('migration_completed', {
        fromConnectionId,
        toConnectionId,
        subscriptionCount: subscriptionsToMigrate.length,
        timestamp: Date.now()
      });

    } catch (error: any) {
      this.emit('migration_failed', {
        fromConnectionId,
        toConnectionId,
        subscriptionCount: subscriptionsToMigrate.length,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  // ============================================================================
  // 私有方法 - 订阅管理
  // ============================================================================

  /**
   * 添加单个订阅
   */
  private async addSingleSubscription(
    subscription: DataSubscription
  ): Promise<{
    subscription: BinanceStreamSubscription;
    isExisting: boolean;
  }> {
    // 检查是否已存在
    const key = this.createSubscriptionKey(subscription);
    const existing = this.subscriptions.get(key);
    
    if (existing) {
      return { subscription: existing, isExisting: true };
    }

    // 验证订阅
    this.validateSubscription(subscription);

    // 构建流名称
    const streamName = this.streamBuilder.buildStreamName(subscription);

    // 选择连接（简化版，实际应该集成连接池）
    const connectionId = await this.selectConnection();

    // 创建订阅对象
    const binanceSubscription: BinanceStreamSubscription = {
      original: subscription,
      streamName,
      connectionId,
      status: SubscriptionStatus.PENDING,
      subscribedAt: Date.now(),
      lastActiveAt: Date.now(),
      messageCount: 0,
      errorCount: 0
    };

    // 存储订阅
    this.subscriptions.set(key, binanceSubscription);
    this.subscriptionsByStream.set(streamName, key);
    this.addSubscriptionToConnection(connectionId, binanceSubscription);

    // 更新状态为活跃
    binanceSubscription.status = SubscriptionStatus.ACTIVE;

    return { subscription: binanceSubscription, isExisting: false };
  }

  /**
   * 移除单个订阅
   */
  private async removeSingleSubscription(
    subscription: DataSubscription
  ): Promise<BinanceStreamSubscription | null> {
    const key = this.createSubscriptionKey(subscription);
    const existing = this.subscriptions.get(key);
    
    if (!existing) {
      return null;
    }

    // 移除订阅
    this.subscriptions.delete(key);
    this.subscriptionsByStream.delete(existing.streamName);
    this.removeSubscriptionFromConnection(existing.connectionId, existing);

    // 更新状态
    existing.status = SubscriptionStatus.CANCELLED;

    return existing;
  }

  /**
   * 验证订阅
   */
  private validateSubscription(subscription: DataSubscription): void {
    const { validation } = this.config;

    // 检查禁用的数据类型
    if (validation.disabledDataTypes.includes(subscription.dataType)) {
      throw new Error(`Data type is disabled: ${subscription.dataType}`);
    }

    // 验证交易对格式
    if (validation.symbolPattern && !validation.symbolPattern.test(subscription.symbol)) {
      throw new Error(`Invalid symbol format: ${subscription.symbol}`);
    }
  }

  /**
   * 选择连接（简化实现）
   */
  private async selectConnection(): Promise<string> {
    // 这里应该集成连接池管理器
    // 暂时返回模拟连接 ID
    return 'connection-1';
  }

  // ============================================================================
  // 私有方法 - 索引管理
  // ============================================================================

  /**
   * 添加订阅到连接索引
   */
  private addSubscriptionToConnection(
    connectionId: string,
    subscription: BinanceStreamSubscription
  ): void {
    if (!this.subscriptionsByConnection.has(connectionId)) {
      this.subscriptionsByConnection.set(connectionId, new Set());
    }
    
    const key = this.createSubscriptionKey(subscription.original);
    this.subscriptionsByConnection.get(connectionId)!.add(key);
  }

  /**
   * 从连接索引移除订阅
   */
  private removeSubscriptionFromConnection(
    connectionId: string,
    subscription: BinanceStreamSubscription
  ): void {
    const connectionSubs = this.subscriptionsByConnection.get(connectionId);
    if (connectionSubs) {
      const key = this.createSubscriptionKey(subscription.original);
      connectionSubs.delete(key);
      
      // 如果连接没有订阅了，移除连接记录
      if (connectionSubs.size === 0) {
        this.subscriptionsByConnection.delete(connectionId);
      }
    }
  }

  /**
   * 创建订阅键
   */
  private createSubscriptionKey(subscription: DataSubscription): string {
    const params = subscription.params ? JSON.stringify(subscription.params) : '';
    return `${subscription.symbol}:${subscription.dataType}:${params}`;
  }

  // ============================================================================
  // 私有方法 - 统计和监控
  // ============================================================================

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    const now = Date.now();
    
    this.stats = {
      total: this.subscriptions.size,
      byStatus: this.groupByStatus(),
      byDataType: this.groupByDataType(),
      bySymbol: this.groupBySymbol(),
      byConnection: this.groupByConnection(),
      averageMessageRate: this.calculateAverageMessageRate(),
      errorRate: this.calculateErrorRate(),
      lastUpdated: now
    };

    // Stats updated
  }

  /**
   * 按状态分组统计
   */
  private groupByStatus(): Record<SubscriptionStatus, number> {
    const groups = {} as Record<SubscriptionStatus, number>;
    
    // 初始化所有状态为 0
    Object.values(SubscriptionStatus).forEach(status => {
      groups[status] = 0;
    });

    // 统计
    for (const subscription of this.subscriptions.values()) {
      groups[subscription.status]++;
    }

    return groups;
  }

  /**
   * 按数据类型分组统计
   */
  private groupByDataType(): Record<string, number> {
    const groups: Record<string, number> = {};
    
    for (const subscription of this.subscriptions.values()) {
      const type = subscription.original.dataType;
      groups[type] = (groups[type] || 0) + 1;
    }

    return groups;
  }

  /**
   * 按交易对分组统计
   */
  private groupBySymbol(): Record<string, number> {
    const groups: Record<string, number> = {};
    
    for (const subscription of this.subscriptions.values()) {
      const symbol = subscription.original.symbol;
      groups[symbol] = (groups[symbol] || 0) + 1;
    }

    return groups;
  }

  /**
   * 按连接分组统计
   */
  private groupByConnection(): Record<string, number> {
    const groups: Record<string, number> = {};
    
    for (const [connectionId, subscriptionIds] of this.subscriptionsByConnection) {
      groups[connectionId] = subscriptionIds.size;
    }

    return groups;
  }

  /**
   * 计算平均消息率
   */
  private calculateAverageMessageRate(): number {
    if (this.subscriptions.size === 0) return 0;
    
    const totalMessages = Array.from(this.subscriptions.values())
      .reduce((sum, sub) => sum + sub.messageCount, 0);
    
    const now = Date.now();
    const oldestSubscription = Math.min(
      ...Array.from(this.subscriptions.values()).map(sub => sub.subscribedAt)
    );
    
    const timeSpanSeconds = (now - oldestSubscription) / 1000;
    return timeSpanSeconds > 0 ? totalMessages / timeSpanSeconds : 0;
  }

  /**
   * 计算错误率
   */
  private calculateErrorRate(): number {
    if (this.subscriptions.size === 0) return 0;
    
    const totalMessages = Array.from(this.subscriptions.values())
      .reduce((sum, sub) => sum + sub.messageCount, 0);
    
    const totalErrors = Array.from(this.subscriptions.values())
      .reduce((sum, sub) => sum + sub.errorCount, 0);
    
    return totalMessages > 0 ? totalErrors / totalMessages : 0;
  }

  /**
   * 创建空统计对象
   */
  private createEmptyStats(): SubscriptionStats {
    const byStatus = {} as Record<SubscriptionStatus, number>;
    Object.values(SubscriptionStatus).forEach(status => {
      byStatus[status] = 0;
    });

    return {
      total: 0,
      byStatus,
      byDataType: {},
      bySymbol: {},
      byConnection: {},
      averageMessageRate: 0,
      errorRate: 0,
      lastUpdated: 0
    };
  }

  /**
   * 启动统计更新器
   */
  private startStatsUpdater(): void {
    this.statsUpdateTimer = setInterval(() => {
      this.updateStats();
      
      this.emit(SubscriptionEvent.STATS_UPDATED, {
        stats: this.stats,
        timestamp: Date.now()
      } as SubscriptionEventData['statsUpdated']);
      
    }, 5000); // 每 5 秒更新一次
  }

  /**
   * 停止统计更新器
   */
  private stopStatsUpdater(): void {
    if (this.statsUpdateTimer) {
      clearInterval(this.statsUpdateTimer);
      this.statsUpdateTimer = null;
    }
  }

  // ============================================================================
  // 私有方法 - 错误处理
  // ============================================================================

  /**
   * 创建订阅错误
   */
  private createSubscriptionError(
    error: any,
    subscription: DataSubscription
  ): SubscriptionError {
    return {
      code: SubscriptionErrorCode.UNKNOWN_ERROR,
      message: error.message || String(error),
      timestamp: Date.now(),
      context: { subscription },
      retryable: true
    };
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    const { validation, maxStreamsPerConnection, subscriptionTimeout } = this.config;

    if (maxStreamsPerConnection <= 0) {
      throw new Error('maxStreamsPerConnection must be positive');
    }

    if (subscriptionTimeout <= 0) {
      throw new Error('subscriptionTimeout must be positive');
    }

    if (validation.maxSubscriptions <= 0) {
      throw new Error('validation.maxSubscriptions must be positive');
    }
  }

  // ============================================================================
  // 清理方法
  // ============================================================================

  /**
   * 销毁订阅管理器
   */
  public async destroy(): Promise<void> {
    this.stopStatsUpdater();
    await this.clearAllSubscriptions();
    this.removeAllListeners();
    this.isInitialized = false;
  }

  /**
   * 处理流数据接收（由连接管理器调用）
   */
  public handleStreamData(streamName: string, data: any, connectionId: string): void {
    const subscriptionId = this.subscriptionsByStream.get(streamName);
    if (!subscriptionId) {
      return;
    }

    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    // 更新统计
    subscription.messageCount++;
    subscription.lastActiveAt = Date.now();

    // 发出数据事件
    this.emit(SubscriptionEvent.STREAM_DATA_RECEIVED, {
      streamName,
      data,
      messageCount: subscription.messageCount,
      connectionId
    } as SubscriptionEventData['streamDataReceived']);
  }

  /**
   * 处理订阅错误（由连接管理器调用）
   */
  public handleSubscriptionError(
    streamName: string,
    error: any,
    connectionId: string
  ): void {
    const subscriptionId = this.subscriptionsByStream.get(streamName);
    if (!subscriptionId) {
      return;
    }

    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    // 更新错误统计
    subscription.errorCount++;
    subscription.lastError = this.createSubscriptionError(error, subscription.original);

    // 发出错误事件
    this.emit(SubscriptionEvent.SUBSCRIPTION_ERROR, {
      subscription: subscription.original,
      error: subscription.lastError,
      connectionId
    } as SubscriptionEventData['subscriptionError']);
  }
}