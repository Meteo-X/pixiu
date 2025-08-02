/**
 * Binance适配器集成实现
 */

import { ExchangeAdapter, DataType } from '@pixiu/adapter-base';
import { BinanceAdapter, BinanceConfig } from '@pixiu/binance-adapter';
import { AdapterIntegration, IntegrationConfig } from '../base/adapter-integration';

export interface BinanceIntegrationConfig extends IntegrationConfig {
  /** Binance适配器配置 */
  adapterConfig: BinanceConfig;
  /** 订阅配置 */
  subscriptionConfig: {
    symbols: string[];
    dataTypes: DataType[];
    enableAllTickers?: boolean;
    klineIntervals?: string[];
  };
}

/**
 * Binance适配器集成
 */
export class BinanceIntegration extends AdapterIntegration {
  private binanceConfig!: BinanceIntegrationConfig;

  /**
   * 创建Binance适配器
   */
  protected async createAdapter(config: BinanceConfig): Promise<ExchangeAdapter> {
    // 设置默认的Binance WebSocket端点
    const defaultEndpoints = {
      ws: config.binance?.testnet 
        ? 'wss://testnet.binance.vision/ws-api/v3'
        : 'wss://stream.binance.com:9443/ws',
      rest: config.binance?.testnet
        ? 'https://testnet.binance.vision/api'
        : 'https://api.binance.com/api'
    };
    
    const defaultConnection = {
      timeout: 10000,
      maxRetries: 3,
      retryInterval: 5000,
      heartbeatInterval: 30000
    };

    const adapterConfig: BinanceConfig = {
      ...config,
      exchange: 'binance',
      endpoints: {
        ...defaultEndpoints,
        ...config.endpoints
      },
      connection: {
        ...defaultConnection,
        ...config.connection
      }
    };

    const adapter = new BinanceAdapter();
    await adapter.initialize(adapterConfig);
    
    return adapter;
  }

  /**
   * 获取交易所名称
   */
  protected getExchangeName(): string {
    return 'binance';
  }

  /**
   * 开始订阅
   */
  protected async startSubscriptions(): Promise<void> {
    if (!this.binanceConfig) {
      this.binanceConfig = this.config as BinanceIntegrationConfig;
    }

    const { symbols, dataTypes } = this.binanceConfig.subscriptionConfig;

    try {
      // 订阅指定的交易对和数据类型
      if (symbols.length > 0 && dataTypes.length > 0) {
        const subscriptions = await this.adapter.subscribe({
          symbols,
          dataTypes
        });

        this.monitor.log('info', 'Binance subscriptions created', {
          subscriptions: subscriptions.map(sub => ({
            symbol: sub.symbol,
            dataType: sub.dataType
          })),
          count: subscriptions.length
        });
      }

      // 如果启用了全市场行情
      if (this.binanceConfig.subscriptionConfig.enableAllTickers) {
        await this.subscribeAllTickers();
      }

      this.emit('subscriptionsStarted', {
        exchange: 'binance',
        symbolCount: symbols.length,
        dataTypeCount: dataTypes.length
      });

    } catch (error) {
      this.monitor.log('error', 'Failed to start Binance subscriptions', { error });
      throw error;
    }
  }

  /**
   * 订阅全市场行情
   */
  private async subscribeAllTickers(): Promise<void> {
    try {
      // Binance全市场行情流
      await this.adapter.subscribe({
        symbols: ['!ticker@arr'], // Binance特殊格式，表示所有交易对
        dataTypes: [DataType.TICKER]
      });

      this.monitor.log('info', 'Subscribed to all Binance tickers');
    } catch (error) {
      this.monitor.log('warn', 'Failed to subscribe to all tickers', { error });
    }
  }

  /**
   * 添加自定义订阅
   */
  async addSubscription(symbol: string, dataType: DataType): Promise<void> {
    try {
      const subscriptions = await this.adapter.subscribe({
        symbols: [symbol],
        dataTypes: [dataType]
      });

      this.monitor.log('info', 'Added Binance subscription', {
        symbol,
        dataType,
        subscriptionId: subscriptions[0]?.id
      });

      this.emit('subscriptionAdded', { symbol, dataType });
    } catch (error) {
      this.monitor.log('error', 'Failed to add Binance subscription', {
        symbol,
        dataType,
        error
      });
      throw error;
    }
  }

  /**
   * 移除订阅
   */
  async removeSubscription(symbol: string, dataType: DataType): Promise<void> {
    try {
      const activeSubscriptions = this.adapter.getSubscriptions();
      const targetSubscription = activeSubscriptions.find(
        sub => sub.symbol === symbol && sub.dataType === dataType
      );

      if (targetSubscription) {
        await this.adapter.unsubscribe([targetSubscription.id]);
        
        this.monitor.log('info', 'Removed Binance subscription', {
          symbol,
          dataType,
          subscriptionId: targetSubscription.id
        });

        this.emit('subscriptionRemoved', { symbol, dataType });
      }
    } catch (error) {
      this.monitor.log('error', 'Failed to remove Binance subscription', {
        symbol,
        dataType,
        error
      });
      throw error;
    }
  }

  /**
   * 获取活跃订阅列表
   */
  getActiveSubscriptions(): Array<{ symbol: string; dataType: DataType; subscriptionId: string }> {
    return this.adapter.getSubscriptions().map(sub => ({
      symbol: sub.symbol,
      dataType: sub.dataType,
      subscriptionId: sub.id
    }));
  }

  /**
   * 获取Binance特定指标
   */
  getBinanceMetrics() {
    const baseMetrics = this.getMetrics();
    const adapterMetrics = this.adapter.getMetrics();
    
    return {
      ...baseMetrics,
      adapterMetrics: {
        messagesReceived: adapterMetrics.messagesReceived,
        messagesSent: adapterMetrics.messagesSent,
        averageLatency: adapterMetrics.averageLatency,
        reconnectCount: adapterMetrics.reconnectCount,
        connectedAt: adapterMetrics.connectedAt,
        lastHeartbeat: adapterMetrics.lastHeartbeat
      },
      activeSubscriptions: this.getActiveSubscriptions().length
    };
  }

  /**
   * 重置连接
   */
  async resetConnection(): Promise<void> {
    try {
      this.monitor.log('info', 'Resetting Binance connection');
      
      await this.adapter.reconnect();
      
      this.monitor.log('info', 'Binance connection reset completed');
      this.emit('connectionReset');
    } catch (error) {
      this.monitor.log('error', 'Failed to reset Binance connection', { error });
      throw error;
    }
  }

  /**
   * 更新订阅配置
   */
  async updateSubscriptions(newConfig: BinanceIntegrationConfig['subscriptionConfig']): Promise<void> {
    try {
      this.monitor.log('info', 'Updating Binance subscriptions', { newConfig });
      
      // 取消所有现有订阅
      await this.adapter.unsubscribeAll();
      
      // 更新配置
      this.binanceConfig.subscriptionConfig = newConfig;
      
      // 重新开始订阅
      await this.startSubscriptions();
      
      this.monitor.log('info', 'Binance subscriptions updated successfully');
      this.emit('subscriptionsUpdated', newConfig);
    } catch (error) {
      this.monitor.log('error', 'Failed to update Binance subscriptions', { error });
      throw error;
    }
  }
}

/**
 * 创建Binance集成实例的工厂函数
 */
export function createBinanceIntegration(): BinanceIntegration {
  return new BinanceIntegration();
}