/**
 * 适配器管理 API 路由
 */

import { Router, Request, Response } from 'express';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';
import { BaseMonitor } from '@pixiu/shared-core';
import { IntegrationConfig } from '../adapters/base/adapter-integration';

export function createAdapterRouter(
  adapterRegistry: AdapterRegistry,
  monitor: BaseMonitor
): Router {
  const router = Router();

  /**
   * 获取所有适配器状态
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const status = adapterRegistry.getStatus();
      
      const adapters = status.registeredAdapters.map(name => {
        const entry = adapterRegistry.getRegistryEntry(name);
        const instance = adapterRegistry.getInstance(name);
        const instanceStatus = status.instanceStatuses.find(s => s.name === name);
        
        return {
          name,
          version: entry?.version,
          description: entry?.description,
          enabled: entry?.enabled,
          running: !!instance,
          status: instanceStatus?.status || 'stopped',
          healthy: instanceStatus?.healthy || false,
          metrics: instanceStatus?.metrics
        };
      });

      res.json({
        total: adapters.length,
        running: status.runningInstances.length,
        adapters
      });
    } catch (error) {
      monitor.log('error', 'Failed to get adapters', { error });
      res.status(500).json({ error: 'Failed to get adapters' });
    }
  });

  /**
   * 获取特定适配器状态
   */
  router.get('/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      
      if (!adapterRegistry.hasAdapter(name)) {
        res.status(404).json({ error: 'Adapter not found' });
        return;
      }

      const entry = adapterRegistry.getRegistryEntry(name);
      const instance = adapterRegistry.getInstance(name);
      const status = adapterRegistry.getStatus();
      const instanceStatus = status.instanceStatuses.find(s => s.name === name);

      res.json({
        name,
        version: entry?.version,
        description: entry?.description,
        enabled: entry?.enabled,
        supportedFeatures: entry?.supportedFeatures,
        running: !!instance,
        status: instanceStatus?.status || 'stopped',
        healthy: instanceStatus?.healthy || false,
        metrics: instanceStatus?.metrics,
        metadata: entry?.metadata
      });
    } catch (error) {
      monitor.log('error', 'Failed to get adapter', { error, name: req.params.name });
      res.status(500).json({ error: 'Failed to get adapter' });
    }
  });

  /**
   * 启动适配器
   */
  router.post('/:name/start', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const config: IntegrationConfig = req.body;
      
      if (!adapterRegistry.hasAdapter(name)) {
        res.status(404).json({ error: 'Adapter not found' });
        return;
      }

      if (adapterRegistry.getInstance(name)) {
        res.status(400).json({ error: 'Adapter is already running' });
        return;
      }

      if (!config || !config.adapterConfig) {
        res.status(400).json({ error: 'Invalid configuration' });
        return;
      }

      await adapterRegistry.createInstance(name, config);
      await adapterRegistry.startInstance(name);

      monitor.log('info', 'Adapter started via API', { name });
      
      res.json({
        success: true,
        message: `Adapter ${name} started successfully`
      });
    } catch (error) {
      monitor.log('error', 'Failed to start adapter', { error, name: req.params.name });
      res.status(500).json({ error: 'Failed to start adapter' });
    }
  });

  /**
   * 停止适配器
   */
  router.post('/:name/stop', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      
      if (!adapterRegistry.hasAdapter(name)) {
        res.status(404).json({ error: 'Adapter not found' });
        return;
      }

      if (!adapterRegistry.getInstance(name)) {
        res.status(400).json({ error: 'Adapter is not running' });
        return;
      }

      await adapterRegistry.stopInstance(name);
      await adapterRegistry.destroyInstance(name);

      monitor.log('info', 'Adapter stopped via API', { name });
      
      res.json({
        success: true,
        message: `Adapter ${name} stopped successfully`
      });
    } catch (error) {
      monitor.log('error', 'Failed to stop adapter', { error, name: req.params.name });
      res.status(500).json({ error: 'Failed to stop adapter' });
    }
  });

  /**
   * 重启适配器
   */
  router.post('/:name/restart', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      
      if (!adapterRegistry.hasAdapter(name)) {
        res.status(404).json({ error: 'Adapter not found' });
        return;
      }

      const instance = adapterRegistry.getInstance(name);
      if (!instance) {
        res.status(400).json({ error: 'Adapter is not running' });
        return;
      }

      // 保存当前配置
      const currentMetrics = instance.getMetrics();
      
      // 停止实例
      await adapterRegistry.stopInstance(name);
      
      // 短暂延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 重新启动
      await adapterRegistry.startInstance(name);

      monitor.log('info', 'Adapter restarted via API', { name });
      
      res.json({
        success: true,
        message: `Adapter ${name} restarted successfully`,
        previousMetrics: currentMetrics
      });
    } catch (error) {
      monitor.log('error', 'Failed to restart adapter', { error, name: req.params.name });
      res.status(500).json({ error: 'Failed to restart adapter' });
    }
  });

  /**
   * 启用/禁用适配器
   */
  router.patch('/:name/enabled', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body;
      
      if (!adapterRegistry.hasAdapter(name)) {
        res.status(404).json({ error: 'Adapter not found' });
        return;
      }

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'Invalid enabled value' });
        return;
      }

      adapterRegistry.setAdapterEnabled(name, enabled);

      monitor.log('info', 'Adapter enabled status changed', { name, enabled });
      
      res.json({
        success: true,
        message: `Adapter ${name} ${enabled ? 'enabled' : 'disabled'} successfully`
      });
    } catch (error) {
      monitor.log('error', 'Failed to change adapter enabled status', { 
        error, 
        name: req.params.name 
      });
      res.status(500).json({ error: 'Failed to change adapter enabled status' });
    }
  });

  return router;
}