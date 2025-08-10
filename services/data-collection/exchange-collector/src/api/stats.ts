import { Router, Request, Response } from 'express';
import { BaseMonitor } from '@pixiu/shared-core';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';
import { DataStreamCache } from '../cache';

// 简化连接器适配器接口
export interface SimpleConnectorAdapter {
  isConnectedToBinance(): boolean;
  getSubscribedStreams(): string[];
  getStreamStats(): Record<string, { count: number; lastUpdate: string | null }>;
}

export interface RealTimeStats {
  adapters: {
    [exchangeName: string]: {
      status: 'connected' | 'disconnected' | 'error';
      subscriptions: number;
      messagesPerSecond: number;
      bytesPerSecond: number;
      errorRate: number;
      uptime: number;
      lastUpdate: string;
    };
  };
  system: {
    totalSubscriptions: number;
    totalAdapters: number;
    activeAdapters: number;
    totalMessagesReceived: number;
    totalBytesReceived: number;
    systemUptime: number;
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
  };
  cache: {
    totalEntries: number;
    hitRate: number;
    memoryUsage: number;
    keyCount: number;
  };
  timestamp: string;
}

export interface HistoricalData {
  timeRange: {
    start: string;
    end: string;
    interval: string;
  };
  data: Array<{
    timestamp: string;
    metrics: {
      messagesPerSecond: number;
      bytesPerSecond: number;
      errorRate: number;
      activeConnections: number;
      cacheHitRate: number;
    };
  }>;
}

/**
 * 创建实时统计 API 路由
 */
export function createStatsRouter(
  adapterRegistry: AdapterRegistry,
  monitor: BaseMonitor,
  dataStreamCache: DataStreamCache,
  simpleConnector?: SimpleConnectorAdapter,
  simpleConnectorStats?: {
    messageCount: number;
    bytesReceived: number;
    startTime: number;
    status: string;
    lastUpdate?: string;
  }
): Router {
  const router = Router();
  const statsHistory: Array<RealTimeStats> = [];
  const maxHistorySize = 1000;
  const startTime = Date.now();

  /**
   * 获取实时统计
   * GET /api/stats
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const stats = await collectRealTimeStats();
      
      // 保存到历史记录
      statsHistory.push(stats);
      if (statsHistory.length > maxHistorySize) {
        statsHistory.shift();
      }

      res.json(stats);

      monitor.log('debug', 'Real-time stats retrieved', {
        adaptersCount: Object.keys(stats.adapters).length,
        totalSubscriptions: stats.system.totalSubscriptions
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error retrieving real-time stats', { error: message });
      
      res.status(500).json({
        error: 'Failed to retrieve real-time stats',
        message
      });
    }
  });

  /**
   * 获取历史统计数据
   * GET /api/stats/history
   */
  router.get('/history', async (req: Request, res: Response) => {
    try {
      const { start, end, interval = '1m' } = req.query;
      
      let startTime: Date;
      let endTime: Date;

      if (start && end) {
        startTime = new Date(start as string);
        endTime = new Date(end as string);
      } else {
        endTime = new Date();
        startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
      }

      const historicalData = getHistoricalData(startTime, endTime, interval as string);
      
      res.json(historicalData);

      monitor.log('debug', 'Historical stats retrieved', {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        dataPoints: historicalData.data.length
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error retrieving historical stats', { error: message });
      
      res.status(500).json({
        error: 'Failed to retrieve historical stats',
        message
      });
    }
  });

  /**
   * Server-Sent Events 实时数据流
   * GET /api/stats/stream
   */
  router.get('/stream', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const clientId = Date.now().toString();
    let isConnected = true;

    res.write(`event: connected\n`);
    res.write(`data: {"clientId": "${clientId}", "timestamp": "${new Date().toISOString()}"}\n\n`);

    const interval = setInterval(async () => {
      if (!isConnected) {
        clearInterval(interval);
        return;
      }

      try {
        const stats = await collectRealTimeStats();
        
        res.write(`event: stats\n`);
        res.write(`data: ${JSON.stringify(stats)}\n\n`);

      } catch (error) {
        const errorData = {
          error: 'Failed to collect stats',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        };
        
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify(errorData)}\n\n`);
      }
    }, 5000);

    req.on('close', () => {
      isConnected = false;
      clearInterval(interval);
      monitor.log('info', 'SSE client disconnected', { clientId });
    });

    monitor.log('info', 'SSE client connected', { clientId });
  });

  /**
   * 收集实时统计数据
   */
  async function collectRealTimeStats(): Promise<RealTimeStats> {
    const adapters: RealTimeStats['adapters'] = {};
    let totalSubscriptions = 0;
    let totalMessagesReceived = 0;
    let totalBytesReceived = 0;
    let activeAdapters = 0;

    // 简单连接器模式
    if (simpleConnector && simpleConnectorStats) {
      const isConnected = simpleConnector.isConnectedToBinance();
      const subscribedStreams = simpleConnector.getSubscribedStreams();
      
      if (isConnected) {
        activeAdapters = 1;
      }

      adapters.binance = {
        status: simpleConnectorStats.status as 'connected' | 'disconnected' | 'error',
        subscriptions: subscribedStreams.length,
        messagesPerSecond: simpleConnectorStats.messageCount > 0 ? 
          ((simpleConnectorStats.messageCount * 1000) / (Date.now() - simpleConnectorStats.startTime)) : 0,
        bytesPerSecond: simpleConnectorStats.bytesReceived > 0 ? 
          ((simpleConnectorStats.bytesReceived * 1000) / (Date.now() - simpleConnectorStats.startTime)) : 0,
        errorRate: 0,
        uptime: Date.now() - simpleConnectorStats.startTime,
        lastUpdate: simpleConnectorStats.lastUpdate || new Date().toISOString()
      };

      totalSubscriptions = subscribedStreams.length;
      totalMessagesReceived = simpleConnectorStats.messageCount;
      totalBytesReceived = simpleConnectorStats.bytesReceived;
    } else {
      // 标准适配器注册表模式
      const adaptersMap = adapterRegistry.getAllInstances();

      for (const [exchangeName, adapter] of adaptersMap) {
        try {
          const metrics = adapter.getMetrics();
          const isHealthy = adapter.isHealthy();
          
          if (isHealthy) {
            activeAdapters++;
          }

          const adapterStats = {
            status: isHealthy ? 'connected' as const : 'error' as const,
            subscriptions: 0,
            messagesPerSecond: calculateRate((metrics as any).messagesReceived || 0, 'messages'),
            bytesPerSecond: calculateRate((metrics as any).bytesReceived || 0, 'bytes'),
            errorRate: calculateErrorRate((metrics as any).errorCount || 0, (metrics as any).messagesReceived || 0),
            uptime: Date.now() - startTime,
            lastUpdate: new Date().toISOString()
          };

          adapters[exchangeName] = adapterStats;
          totalMessagesReceived += (metrics as any).messagesReceived || 0;
          totalBytesReceived += (metrics as any).bytesReceived || 0;
          
        } catch (error) {
          adapters[exchangeName] = {
            status: 'error',
            subscriptions: 0,
            messagesPerSecond: 0,
            bytesPerSecond: 0,
            errorRate: 1.0,
            uptime: 0,
            lastUpdate: new Date().toISOString()
          };
        }
      }
    }

    const memoryUsage = process.memoryUsage();
    const cacheMetrics = simpleConnector ? 
      { totalEntries: 0, hitCount: 0, missCount: 0, memoryUsage: 0, totalKeys: 0 } : 
      dataStreamCache.getMetrics();

    return {
      adapters,
      system: {
        totalSubscriptions,
        totalAdapters: simpleConnector ? 1 : adapterRegistry.getAllInstances().size,
        activeAdapters,
        totalMessagesReceived,
        totalBytesReceived,
        systemUptime: simpleConnector && simpleConnectorStats ? 
          Date.now() - simpleConnectorStats.startTime : 
          Date.now() - startTime,
        memoryUsage: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
        }
      },
      cache: {
        totalEntries: cacheMetrics.totalEntries,
        hitRate: cacheMetrics.hitCount > 0 ? 
          cacheMetrics.hitCount / (cacheMetrics.hitCount + cacheMetrics.missCount) : 0,
        memoryUsage: cacheMetrics.memoryUsage,
        keyCount: cacheMetrics.totalKeys
      },
      timestamp: new Date().toISOString()
    };
  }

  function getHistoricalData(start: Date, end: Date, interval: string): HistoricalData {
    const filteredHistory = statsHistory.filter(stat => {
      const statTime = new Date(stat.timestamp);
      return statTime >= start && statTime <= end;
    });

    const aggregatedData = aggregateDataByInterval(filteredHistory, interval);

    return {
      timeRange: {
        start: start.toISOString(),
        end: end.toISOString(),
        interval
      },
      data: aggregatedData
    };
  }

  function calculateRate(total: number, _type: 'messages' | 'bytes'): number {
    const uptimeSeconds = (Date.now() - startTime) / 1000;
    return uptimeSeconds > 0 ? total / uptimeSeconds : 0;
  }

  function calculateErrorRate(errorCount: number, totalCount: number): number {
    return totalCount > 0 ? errorCount / totalCount : 0;
  }

  function aggregateDataByInterval(data: RealTimeStats[], _interval: string) {
    return data.map(stat => ({
      timestamp: stat.timestamp,
      metrics: {
        messagesPerSecond: Object.values(stat.adapters)
          .reduce((sum, adapter) => sum + adapter.messagesPerSecond, 0),
        bytesPerSecond: Object.values(stat.adapters)
          .reduce((sum, adapter) => sum + adapter.bytesPerSecond, 0),
        errorRate: Object.values(stat.adapters)
          .reduce((sum, adapter) => sum + adapter.errorRate, 0) / Object.keys(stat.adapters).length,
        activeConnections: stat.system.activeAdapters,
        cacheHitRate: stat.cache.hitRate
      }
    }));
  }

  return router;
}