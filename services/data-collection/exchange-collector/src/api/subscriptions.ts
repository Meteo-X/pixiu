import { Router, Request, Response } from 'express';
import { BaseMonitor } from '@pixiu/shared-core';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';
import { DataStreamCache } from '../cache';

export interface SubscriptionInfo {
  exchange: string;
  symbol: string;
  dataTypes: string[];
  status: 'active' | 'paused' | 'error';
  metrics: {
    messagesReceived: number;
    lastUpdate: string | null;
    bytesReceived: number;
    errorCount: number;
  };
}

export interface BatchOperation {
  action: 'start' | 'stop' | 'delete';
  subscriptions: Array<{
    exchange: string;
    symbol: string;
  }>;
}

export interface BatchOperationResult {
  success: boolean;
  results: Array<{
    exchange: string;
    symbol: string;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

/**
 * 创建订阅管理路由
 */
export function createSubscriptionRouter(
  adapterRegistry: AdapterRegistry,
  monitor: BaseMonitor,
  dataStreamCache: DataStreamCache
): Router {
  const router = Router();

  /**
   * 获取当前所有订阅
   * GET /api/subscriptions
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const subscriptions: SubscriptionInfo[] = [];
      const adapters = adapterRegistry.getAllInstances();

      for (const [exchangeName, adapter] of adapters) {
        try {
          // const adapterMetrics = adapter.getMetrics();
          const isHealthy = adapter.isHealthy();
          
          // 获取适配器的订阅信息
          // 注意：这里需要适配器实现提供订阅列表的方法
          const adapterSubscriptions = await getAdapterSubscriptions(exchangeName, adapter);
          
          for (const subscription of adapterSubscriptions) {
            const subscriptionInfo: SubscriptionInfo = {
              exchange: exchangeName,
              symbol: subscription.symbol,
              dataTypes: subscription.dataTypes,
              status: isHealthy ? 'active' : 'error',
              metrics: {
                messagesReceived: subscription.metrics?.messagesReceived || 0,
                lastUpdate: subscription.metrics?.lastUpdate || null,
                bytesReceived: subscription.metrics?.bytesReceived || 0,
                errorCount: subscription.metrics?.errorCount || 0
              }
            };
            
            subscriptions.push(subscriptionInfo);
          }
        } catch (error) {
          monitor.log('error', 'Error getting subscriptions for adapter', {
            exchange: exchangeName,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({
        subscriptions,
        summary: {
          total: subscriptions.length,
          active: subscriptions.filter(s => s.status === 'active').length,
          paused: subscriptions.filter(s => s.status === 'paused').length,
          error: subscriptions.filter(s => s.status === 'error').length
        },
        timestamp: new Date().toISOString()
      });

      monitor.log('debug', 'Subscriptions retrieved', {
        totalCount: subscriptions.length
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error retrieving subscriptions', { error: message });
      
      res.status(500).json({
        error: 'Failed to retrieve subscriptions',
        message
      });
    }
  });

  /**
   * 添加新订阅
   * POST /api/subscriptions
   */
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { exchange, symbol, dataTypes } = req.body;

      // 验证输入
      if (!exchange || !symbol || !Array.isArray(dataTypes)) {
        res.status(400).json({
          error: 'Invalid request body',
          message: 'exchange, symbol, and dataTypes are required'
        });
        return;
      }

      const adapter = adapterRegistry.getInstance(exchange);
      if (!adapter) {
        res.status(404).json({
          error: 'Exchange not found',
          message: `No adapter found for exchange: ${exchange}`
        });
        return;
      }

      // 添加订阅
      const result = await addSubscription(adapter, symbol, dataTypes);
      
      if (result.success) {
        res.status(201).json({
          success: true,
          subscription: {
            exchange,
            symbol,
            dataTypes,
            status: 'active'
          },
          message: 'Subscription added successfully'
        });

        monitor.log('info', 'Subscription added', {
          exchange,
          symbol,
          dataTypes
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          message: 'Failed to add subscription'
        });
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error adding subscription', { error: message });
      
      res.status(500).json({
        error: 'Failed to add subscription',
        message
      });
    }
  });

  /**
   * 删除订阅
   * DELETE /api/subscriptions/:exchange/:symbol
   */
  router.delete('/:exchange/:symbol', async (req: Request, res: Response): Promise<void> => {
    try {
      const { exchange, symbol } = req.params;

      const adapter = adapterRegistry.getInstance(exchange);
      if (!adapter) {
        res.status(404).json({
          error: 'Exchange not found',
          message: `No adapter found for exchange: ${exchange}`
        });
        return;
      }

      // 删除订阅
      const result = await removeSubscription(adapter, symbol);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Subscription removed successfully'
        });

        monitor.log('info', 'Subscription removed', {
          exchange,
          symbol
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          message: 'Failed to remove subscription'
        });
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error removing subscription', { error: message });
      
      res.status(500).json({
        error: 'Failed to remove subscription',
        message
      });
    }
  });

  /**
   * 批量操作
   * POST /api/subscriptions/batch
   */
  router.post('/batch', async (req: Request, res: Response): Promise<void> => {
    try {
      const batchOperation: BatchOperation = req.body;

      // 验证输入
      if (!batchOperation.action || !Array.isArray(batchOperation.subscriptions)) {
        res.status(400).json({
          error: 'Invalid request body',
          message: 'action and subscriptions array are required'
        });
        return;
      }

      const validActions = ['start', 'stop', 'delete'];
      if (!validActions.includes(batchOperation.action)) {
        res.status(400).json({
          error: 'Invalid action',
          message: `Action must be one of: ${validActions.join(', ')}`
        });
        return;
      }

      const results: BatchOperationResult['results'] = [];
      
      for (const subscription of batchOperation.subscriptions) {
        try {
          const { exchange, symbol } = subscription;
          const adapter = adapterRegistry.getInstance(exchange);
          
          if (!adapter) {
            results.push({
              exchange,
              symbol,
              success: false,
              error: `No adapter found for exchange: ${exchange}`
            });
            continue;
          }

          let operationResult: { success: boolean; error?: string };

          switch (batchOperation.action) {
            case 'start':
              operationResult = await startSubscription(adapter, symbol);
              break;
            case 'stop':
              operationResult = await stopSubscription(adapter, symbol);
              break;
            case 'delete':
              operationResult = await removeSubscription(adapter, symbol);
              break;
            default:
              operationResult = { success: false, error: 'Invalid action' };
          }

          results.push({
            exchange,
            symbol,
            success: operationResult.success,
            error: operationResult.error
          });

        } catch (error) {
          results.push({
            exchange: subscription.exchange,
            symbol: subscription.symbol,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      const batchResult: BatchOperationResult = {
        success: failed === 0,
        results,
        summary: {
          total: results.length,
          successful,
          failed
        }
      };

      res.json(batchResult);

      monitor.log('info', 'Batch operation completed', {
        action: batchOperation.action,
        total: results.length,
        successful,
        failed
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error executing batch operation', { error: message });
      
      res.status(500).json({
        error: 'Failed to execute batch operation',
        message
      });
    }
  });

  /**
   * 获取订阅统计信息
   * GET /api/subscriptions/stats
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const stats = {
        totalAdapters: adapterRegistry.getAllInstances().size,
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        errorSubscriptions: 0,
        byExchange: {} as Record<string, any>,
        cacheStats: dataStreamCache.getSummary(),
        timestamp: new Date().toISOString()
      };

      const adapters = adapterRegistry.getAllInstances();
      
      for (const [exchangeName, adapter] of adapters) {
        try {
          const adapterSubscriptions = await getAdapterSubscriptions(exchangeName, adapter);
          const isHealthy = adapter.isHealthy();
          
          stats.totalSubscriptions += adapterSubscriptions.length;
          if (isHealthy) {
            stats.activeSubscriptions += adapterSubscriptions.length;
          } else {
            stats.errorSubscriptions += adapterSubscriptions.length;
          }

          stats.byExchange[exchangeName] = {
            subscriptions: adapterSubscriptions.length,
            status: isHealthy ? 'active' : 'error',
            metrics: adapter.getMetrics()
          };
        } catch (error) {
          stats.byExchange[exchangeName] = {
            subscriptions: 0,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }

      res.json(stats);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error retrieving subscription stats', { error: message });
      
      res.status(500).json({
        error: 'Failed to retrieve subscription stats',
        message
      });
    }
  });

  return router;
}

/**
 * 获取适配器的订阅信息
 * 注意：这是一个示例实现，实际需要根据适配器接口调整
 */
async function getAdapterSubscriptions(_exchangeName: string, _adapter: any): Promise<Array<{
  symbol: string;
  dataTypes: string[];
  metrics?: any;
}>> {
  // 这里需要根据实际的适配器接口实现
  // 目前返回一个示例订阅列表
  try {
    // 假设适配器有一个获取订阅的方法
    // const subscriptions = await adapter.getSubscriptions();
    // return subscriptions;
    
    // 临时示例数据
    return [
      {
        symbol: 'BTCUSDT',
        dataTypes: ['ticker', 'depth'],
        metrics: {
          messagesReceived: 1000,
          lastUpdate: new Date().toISOString(),
          bytesReceived: 50000,
          errorCount: 0
        }
      }
    ];
  } catch (error) {
    return [];
  }
}

/**
 * 添加订阅
 */
async function addSubscription(_adapter: any, symbol: string, dataTypes: string[]): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 这里需要根据实际的适配器接口实现
    // await adapter.addSubscription(symbol, dataTypes);
    
    // 临时实现
    console.log(`Adding subscription for ${symbol} with data types: ${dataTypes.join(', ')}`);
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 删除订阅
 */
async function removeSubscription(_adapter: any, symbol: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 这里需要根据实际的适配器接口实现
    // await adapter.removeSubscription(symbol);
    
    // 临时实现
    console.log(`Removing subscription for ${symbol}`);
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 启动订阅
 */
async function startSubscription(_adapter: any, symbol: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 这里需要根据实际的适配器接口实现
    // await adapter.startSubscription(symbol);
    
    // 临时实现
    console.log(`Starting subscription for ${symbol}`);
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 停止订阅
 */
async function stopSubscription(_adapter: any, symbol: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 这里需要根据实际的适配器接口实现
    // await adapter.stopSubscription(symbol);
    
    // 临时实现
    console.log(`Stopping subscription for ${symbol}`);
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}