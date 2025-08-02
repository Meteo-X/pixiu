/**
 * Binance 管道适配器集成实现
 * 使用新的数据管道系统
 */

import { PipelineAdapterIntegration } from '../base/pipeline-adapter-integration';
import { BinanceAdapter } from '@pixiu/binance-adapter';
import { ExchangeAdapter } from '@pixiu/adapter-base';

/**
 * Binance 管道适配器集成类
 */
export class BinancePipelineIntegration extends PipelineAdapterIntegration {
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
      symbolCount: symbols.length,
      dataTypeCount: dataTypes.length,
      totalSubscriptions: symbols.length * dataTypes.length
    });
  }
}