/**
 * Binance 适配器集成实现
 */

import { AdapterIntegration } from '../base/adapter-integration';
import { BinanceAdapter } from '@pixiu/binance-adapter';
import { ExchangeAdapter } from '@pixiu/adapter-base';

/**
 * Binance 适配器集成类
 */
export class BinanceIntegration extends AdapterIntegration {
  /**
   * 创建 Binance 适配器实例
   */
  protected async createAdapter(config: any): Promise<ExchangeAdapter> {
    const adapter = new BinanceAdapter();
    await adapter.initialize(config);
    return adapter;
  }

  /**
   * 获取交易所名称
   */
  protected getExchangeName(): string {
    return 'binance';
  }

  /**
   * 启动订阅
   */
  protected async startSubscriptions(): Promise<void> {
    const config = this.config.adapterConfig;
    
    if (!config.subscription) {
      throw new Error('No subscription configuration found');
    }

    const { symbols, dataTypes } = config.subscription;
    
    // 订阅所有配置的数据类型和交易对
    for (const symbol of symbols) {
      for (const dataType of dataTypes) {
        await this.adapter.subscribe({
          symbols: [symbol],
          dataTypes: [dataType]
        });
      }
    }

    this.monitor.log('info', 'Binance subscriptions started', {
      symbols,
      dataTypes,
      totalSubscriptions: symbols.length * dataTypes.length
    });
  }
}

/**
 * 创建 Binance 集成实例的工厂函数
 */
export function createBinanceIntegration(): AdapterIntegration {
  return new BinanceIntegration();
}