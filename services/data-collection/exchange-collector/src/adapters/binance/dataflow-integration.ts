/**
 * Binance适配器DataFlow集成
 * 使用新的DataFlowManager系统
 */

import { BinanceAdapter } from '@pixiu/binance-adapter';
import { ExchangeAdapter } from '@pixiu/adapter-base';
import { PipelineAdapterIntegration, PipelineIntegrationConfig } from '../base/pipeline-adapter-integration';

/**
 * Binance DataFlow适配器集成
 */
export class BinanceDataFlowIntegration extends PipelineAdapterIntegration {
  
  /**
   * 创建适配器实例
   */
  protected async createAdapter(config: any): Promise<ExchangeAdapter> {
    const binanceAdapter = new BinanceAdapter();
    await binanceAdapter.initialize({
      name: 'binance',
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      baseURL: config.baseURL || 'wss://stream.binance.com:9443',
      enableReconnect: config.enableReconnect !== false,
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      connectionTimeout: config.connectionTimeout || 10000
    });

    return binanceAdapter;
  }

  /**
   * 获取交易所名称
   */
  protected getExchangeName(): string {
    return 'binance';
  }

  /**
   * 开始数据订阅
   */
  protected async startSubscriptions(): Promise<void> {
    const config = this.config.adapterConfig;
    
    if (!config.subscription) {
      this.monitor.log('warn', 'No subscription configuration found for Binance adapter');
      return;
    }

    const { symbols, streams } = config.subscription;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      this.monitor.log('warn', 'No symbols configured for Binance subscription');
      return;
    }

    if (!streams || !Array.isArray(streams) || streams.length === 0) {
      this.monitor.log('warn', 'No streams configured for Binance subscription');
      return;
    }

    try {
      // 订阅配置的数据流
      for (const symbol of symbols) {
        for (const stream of streams) {
          await this.subscribeToStream(symbol, stream);
        }
      }

      this.monitor.log('info', 'Binance subscriptions started', {
        symbols: symbols.length,
        streams: streams.length,
        totalSubscriptions: symbols.length * streams.length
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.monitor.log('error', 'Failed to start Binance subscriptions', { 
        error: errorMessage,
        symbols,
        streams
      });
      throw error;
    }
  }

  /**
   * 订阅特定数据流
   */
  private async subscribeToStream(symbol: string, stream: string): Promise<void> {
    try {
      switch (stream) {
        case 'trade':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['trade'] });
          break;
        case 'ticker':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['ticker'] });
          break;
        case 'depth':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['depth'] });
          break;
        case 'kline_1m':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['kline_1m'] });
          break;
        case 'kline_5m':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['kline_5m'] });
          break;
        case 'kline_15m':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['kline_15m'] });
          break;
        case 'kline_1h':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['kline_1h'] });
          break;
        case 'kline_4h':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['kline_4h'] });
          break;
        case 'kline_1d':
          await this.adapter.subscribe({ symbols: [symbol], dataTypes: ['kline_1d'] });
          break;
        default:
          this.monitor.log('warn', 'Unknown stream type for Binance', { 
            symbol, 
            stream 
          });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.monitor.log('error', 'Failed to subscribe to stream', {
        symbol,
        stream,
        error: errorMessage
      });
      throw error;
    }
  }
}

/**
 * 创建Binance DataFlow集成实例的工厂函数
 */
export function createBinanceDataFlowIntegration(): BinanceDataFlowIntegration {
  return new BinanceDataFlowIntegration();
}