/**
 * 指标 API 路由
 */

import { Router, Request, Response } from 'express';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';
import { BaseMonitor } from '@pixiu/shared-core';

export function createMetricsRouter(
  adapterRegistry: AdapterRegistry,
  monitor: BaseMonitor
): Router {
  const router = Router();

  /**
   * Prometheus 格式的指标
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const status = adapterRegistry.getStatus();
      const metrics: string[] = [];

      // 服务级别指标
      metrics.push('# HELP exchange_collector_up Exchange collector service status');
      metrics.push('# TYPE exchange_collector_up gauge');
      metrics.push(`exchange_collector_up 1`);

      metrics.push('# HELP exchange_collector_uptime_seconds Service uptime in seconds');
      metrics.push('# TYPE exchange_collector_uptime_seconds gauge');
      metrics.push(`exchange_collector_uptime_seconds ${process.uptime()}`);

      // 适配器指标
      metrics.push('# HELP exchange_collector_adapters_registered Number of registered adapters');
      metrics.push('# TYPE exchange_collector_adapters_registered gauge');
      metrics.push(`exchange_collector_adapters_registered ${status.registeredAdapters.length}`);

      metrics.push('# HELP exchange_collector_adapters_running Number of running adapters');
      metrics.push('# TYPE exchange_collector_adapters_running gauge');
      metrics.push(`exchange_collector_adapters_running ${status.runningInstances.length}`);

      // 各适配器的详细指标
      for (const instance of status.instanceStatuses) {
        const labels = `exchange="${instance.name}"`;
        
        metrics.push(`# HELP exchange_collector_adapter_healthy Adapter health status`);
        metrics.push(`# TYPE exchange_collector_adapter_healthy gauge`);
        metrics.push(`exchange_collector_adapter_healthy{${labels}} ${instance.healthy ? 1 : 0}`);

        if (instance.metrics) {
          metrics.push(`# HELP exchange_collector_messages_processed_total Total messages processed`);
          metrics.push(`# TYPE exchange_collector_messages_processed_total counter`);
          metrics.push(`exchange_collector_messages_processed_total{${labels}} ${instance.metrics.messagesProcessed}`);

          metrics.push(`# HELP exchange_collector_messages_published_total Total messages published`);
          metrics.push(`# TYPE exchange_collector_messages_published_total counter`);
          metrics.push(`exchange_collector_messages_published_total{${labels}} ${instance.metrics.messagesPublished}`);

          metrics.push(`# HELP exchange_collector_processing_errors_total Total processing errors`);
          metrics.push(`# TYPE exchange_collector_processing_errors_total counter`);
          metrics.push(`exchange_collector_processing_errors_total{${labels}} ${instance.metrics.processingErrors}`);

          metrics.push(`# HELP exchange_collector_publish_errors_total Total publish errors`);
          metrics.push(`# TYPE exchange_collector_publish_errors_total counter`);
          metrics.push(`exchange_collector_publish_errors_total{${labels}} ${instance.metrics.publishErrors}`);

          metrics.push(`# HELP exchange_collector_average_latency_ms Average processing latency`);
          metrics.push(`# TYPE exchange_collector_average_latency_ms gauge`);
          metrics.push(`exchange_collector_average_latency_ms{${labels}} ${instance.metrics.averageProcessingLatency}`);
        }
      }

      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(metrics.join('\n'));
    } catch (error) {
      monitor.log('error', 'Failed to generate metrics', { error });
      res.status(500).json({ error: 'Failed to generate metrics' });
    }
  });

  /**
   * JSON 格式的指标
   */
  router.get('/json', async (_req: Request, res: Response) => {
    try {
      const status = adapterRegistry.getStatus();
      
      const metrics = {
        service: {
          name: 'exchange-collector',
          version: process.env.npm_package_version || '1.0.0',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        adapters: {
          registered: status.registeredAdapters.length,
          enabled: status.enabledAdapters.length,
          running: status.runningInstances.length,
          instances: status.instanceStatuses.map(s => ({
            name: s.name,
            status: s.status,
            healthy: s.healthy,
            metrics: s.metrics
          }))
        },
        timestamp: new Date().toISOString()
      };

      res.json(metrics);
    } catch (error) {
      monitor.log('error', 'Failed to get metrics', { error });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  return router;
}