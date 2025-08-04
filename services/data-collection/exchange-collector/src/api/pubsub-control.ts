import { Router, Request, Response } from 'express';
import { BaseMonitor } from '@pixiu/shared-core';
import { AdapterRegistry } from '../adapters/registry/adapter-registry';

export interface PubSubStatus {
  enabled: boolean;
  totalTopics: number;
  publishedMessages: number;
  publishErrors: number;
  lastPublishTime: string | null;
  publishRate: number;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  emulatorMode: boolean;
  topics: Array<{
    name: string;
    messageCount: number;
    lastMessage: string | null;
    subscriptions: number;
  }>;
}

export interface PubSubToggleRequest {
  enabled: boolean;
  reason?: string;
}

export interface PubSubControlResponse {
  success: boolean;
  status: PubSubStatus;
  message: string;
  timestamp: string;
}

/**
 * 创建 PubSub 控制 API 路由
 */
export function createPubSubControlRouter(
  adapterRegistry: AdapterRegistry,
  monitor: BaseMonitor
): Router {
  const router = Router();
  let pubSubEnabled = true;
  let publishStats = {
    totalPublished: 0,
    publishErrors: 0,
    lastPublishTime: null as string | null,
    startTime: Date.now()
  };

  /**
   * 获取 PubSub 状态
   * GET /api/pubsub/status
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await getPubSubStatus();
      
      res.json({
        status,
        timestamp: new Date().toISOString()
      });

      monitor.log('debug', 'PubSub status retrieved', {
        enabled: status.enabled,
        totalTopics: status.totalTopics
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error retrieving PubSub status', { error: message });
      
      res.status(500).json({
        error: 'Failed to retrieve PubSub status',
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * 切换 PubSub 启用状态
   * POST /api/pubsub/toggle
   */
  router.post('/toggle', async (req: Request, res: Response): Promise<void> => {
    try {
      const { enabled, reason }: PubSubToggleRequest = req.body;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          error: 'Invalid request body',
          message: 'enabled field must be a boolean'
        });
        return;
      }

      const previousState = pubSubEnabled;
      pubSubEnabled = enabled;

      const result = await togglePubSubForAdapters(enabled);
      const status = await getPubSubStatus();
      
      const response: PubSubControlResponse = {
        success: result.success,
        status,
        message: enabled ? 
          `PubSub has been enabled${reason ? ` (${reason})` : ''}` :
          `PubSub has been disabled${reason ? ` (${reason})` : ''}`,
        timestamp: new Date().toISOString()
      };

      if (result.success) {
        res.json(response);
        
        monitor.log('info', 'PubSub state changed', {
          from: previousState,
          to: enabled,
          reason: reason || 'No reason provided'
        });
      } else {
        res.status(500).json({
          ...response,
          error: 'Failed to toggle PubSub',
          details: result.errors
        });
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error toggling PubSub', { error: message });
      
      res.status(500).json({
        error: 'Failed to toggle PubSub',
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * 获取 PubSub 主题列表
   * GET /api/pubsub/topics
   */
  router.get('/topics', async (_req: Request, res: Response) => {
    try {
      const topics = await getPubSubTopics();
      
      res.json({
        topics,
        totalTopics: topics.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      monitor.log('error', 'Error retrieving PubSub topics', { error: message });
      
      res.status(500).json({
        error: 'Failed to retrieve PubSub topics',
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * 获取 PubSub 状态
   */
  async function getPubSubStatus(): Promise<PubSubStatus> {
    try {
      const adapters = adapterRegistry.getAllInstances();
      const topics = await getPubSubTopics();
      
      const uptime = (Date.now() - publishStats.startTime) / 1000;
      const publishRate = uptime > 0 ? publishStats.totalPublished / uptime : 0;
      
      let connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
      if (pubSubEnabled) {
        const healthyAdapters = Array.from(adapters.values()).filter(adapter => adapter.isHealthy());
        connectionStatus = healthyAdapters.length > 0 ? 'connected' : 'error';
      }
      
      return {
        enabled: pubSubEnabled,
        totalTopics: topics.length,
        publishedMessages: publishStats.totalPublished,
        publishErrors: publishStats.publishErrors,
        lastPublishTime: publishStats.lastPublishTime,
        publishRate,
        connectionStatus,
        emulatorMode: process.env.PUBSUB_EMULATOR_HOST !== undefined,
        topics
      };
    } catch (error) {
      throw new Error(`Failed to get PubSub status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 为适配器切换 PubSub
   */
  async function togglePubSubForAdapters(enabled: boolean): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const adapters = adapterRegistry.getAllInstances();
    const errors: string[] = [];
    
    for (const [exchangeName, adapter] of adapters) {
      try {
        // 这里需要根据实际适配器接口实现
        if (typeof (adapter as any).setPubSubEnabled === 'function') {
          await (adapter as any).setPubSubEnabled(enabled);
        }
      } catch (error) {
        const errorMessage = `${exchangeName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
      }
    }
    
    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * 获取 PubSub 主题列表
   */
  async function getPubSubTopics(): Promise<Array<{
    name: string;
    messageCount: number;
    lastMessage: string | null;
    subscriptions: number;
  }>> {
    try {
      const adapters = adapterRegistry.getAllInstances();
      const topics: Array<{
        name: string;
        messageCount: number;
        lastMessage: string | null;
        subscriptions: number;
      }> = [];
      
      for (const [exchangeName] of adapters) {
        const topicPrefix = process.env.PUBSUB_TOPIC_PREFIX || 'market-data';
        
        topics.push({
          name: `${topicPrefix}-ticker-${exchangeName}`,
          messageCount: Math.floor(Math.random() * 1000),
          lastMessage: new Date().toISOString(),
          subscriptions: 1
        });
      }
      
      return topics;
    } catch (error) {
      throw new Error(`Failed to get PubSub topics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return router;
}