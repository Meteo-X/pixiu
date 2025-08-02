/**
 * 健康检查 API 路由
 */

import { Router, Request, Response } from 'express';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';
import { BaseMonitor } from '@pixiu/shared-core';

export function createHealthRouter(
  adapterRegistry: AdapterRegistry,
  monitor: BaseMonitor
): Router {
  const router = Router();

  /**
   * 基础健康检查
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const status = adapterRegistry.getStatus();
      const isHealthy = status.initialized && status.instanceStatuses.every(s => s.healthy);
      
      const healthStatus = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'exchange-collector',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        checks: {
          adapters: {
            status: isHealthy ? 'pass' : 'fail',
            registeredCount: status.registeredAdapters.length,
            runningCount: status.runningInstances.length,
            details: status.instanceStatuses.map(s => ({
              name: s.name,
              status: s.status,
              healthy: s.healthy
            }))
          }
        }
      };

      res.status(isHealthy ? 200 : 503).json(healthStatus);
    } catch (error) {
      monitor.log('error', 'Health check failed', { error });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  });

  /**
   * 就绪检查
   */
  router.get('/ready', async (_req: Request, res: Response) => {
    try {
      const status = adapterRegistry.getStatus();
      const isReady = status.initialized && status.runningInstances.length > 0;
      
      res.status(isReady ? 200 : 503).json({
        ready: isReady,
        timestamp: new Date().toISOString(),
        details: {
          initialized: status.initialized,
          runningAdapters: status.runningInstances
        }
      });
    } catch (error) {
      monitor.log('error', 'Readiness check failed', { error });
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        error: 'Readiness check failed'
      });
    }
  });

  /**
   * 存活检查
   */
  router.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({
      alive: true,
      timestamp: new Date().toISOString()
    });
  });

  return router;
}