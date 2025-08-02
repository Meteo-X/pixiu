/**
 * Exchange Collector 服务主入口
 * 负责初始化服务并启动适配器
 */

import { BaseErrorHandler, BaseMonitor, PubSubClientImpl, globalCache } from '@pixiu/shared-core';
import { configManager } from './config/service-config';
import { AdapterRegistry } from './adapters/registry/adapter-registry';
import { IntegrationConfig } from './adapters/base/adapter-integration';
import express = require('express');
import cors = require('cors');
import { createHealthRouter } from './api/health';
import { createMetricsRouter } from './api/metrics';
import { createAdapterRouter } from './api/adapters';

/**
 * Exchange Collector 服务类
 */
export class ExchangeCollectorService {
  private app!: express.Application;
  private server: any;
  private adapterRegistry!: AdapterRegistry;
  private pubsubClient!: PubSubClientImpl;
  private monitor!: BaseMonitor;
  private errorHandler!: BaseErrorHandler;
  private isShuttingDown = false;

  constructor() {
    this.setupGracefulShutdown();
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      // 加载配置
      await configManager.load();
      const config = configManager.getConfig();
      if (!config) {
        throw new Error('Failed to load configuration');
      }

      // 初始化监控
      this.monitor = new BaseMonitor({
        metrics: {
          enabled: config.monitoring.enableMetrics,
          endpoint: '0.0.0.0',
          port: config.monitoring.prometheus.port,
          path: config.monitoring.prometheus.path,
          labels: { service: config.name || 'exchange-collector' }
        },
        healthCheck: {
          enabled: config.monitoring.enableHealthCheck,
          endpoint: '0.0.0.0',
          port: config.server.port,
          path: '/health',
          interval: config.monitoring.healthCheckInterval
        },
        logging: {
          level: config.logging.level,
          format: config.logging.format,
          output: config.logging.output,
          file: config.logging.file
        }
      });

      // 初始化错误处理器
      this.errorHandler = new BaseErrorHandler({
        enableAutoRetry: true,
        defaultMaxRetries: 3,
        retryInterval: 1000,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 5,
        enableLogging: true
      });

      // 初始化 Pub/Sub 客户端
      this.pubsubClient = new PubSubClientImpl({
        projectId: config.pubsub.projectId,
        emulatorHost: config.pubsub.useEmulator ? config.pubsub.emulatorHost : undefined,
        ...config.pubsub.publishSettings
      });

      // 初始化适配器注册中心
      this.adapterRegistry = new AdapterRegistry();
      const registryConfig = {
        defaultConfig: {
          publishConfig: {
            topicPrefix: config.pubsub.topicPrefix,
            enableBatching: config.pubsub.publishSettings.enableBatching,
            batchSize: config.pubsub.publishSettings.batchSize,
            batchTimeout: config.pubsub.publishSettings.batchTimeout
          },
          monitoringConfig: {
            enableMetrics: config.monitoring.enableMetrics,
            enableHealthCheck: config.monitoring.enableHealthCheck,
            metricsInterval: config.monitoring.metricsInterval
          }
        },
        autoStart: configManager.getEnabledAdapters(),
        monitoring: {
          enableHealthCheck: config.monitoring.enableHealthCheck,
          healthCheckInterval: config.monitoring.healthCheckInterval,
          enableMetrics: config.monitoring.enableMetrics,
          metricsInterval: config.monitoring.metricsInterval
        }
      };
      
      await this.adapterRegistry.initialize(
        registryConfig,
        this.pubsubClient,
        this.monitor,
        this.errorHandler
      );

      // 初始化 Express 应用
      this.initializeExpress(config);

      this.monitor.log('info', 'Exchange Collector service initialized', {
        config: {
          adapters: Object.keys(config.adapters),
          enabledAdapters: configManager.getEnabledAdapters()
        }
      });
    } catch (error) {
      this.monitor?.log('error', 'Failed to initialize service', { error });
      throw error;
    }
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    try {
      const config = configManager.getConfig();
      if (!config) {
        throw new Error('Configuration not loaded');
      }

      // 启动适配器
      await this.startAdapters();

      // 启动 HTTP 服务器
      await new Promise<void>((resolve, reject) => {
        this.server = this.app.listen(config.server.port, config.server.host, () => {
          this.monitor.log('info', 'HTTP server started', {
            host: config.server.host,
            port: config.server.port
          });
          resolve();
        }).on('error', reject);
      });

      this.monitor.log('info', 'Exchange Collector service started successfully');
    } catch (error) {
      this.monitor.log('error', 'Failed to start service', { error });
      throw error;
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.monitor.log('info', 'Stopping Exchange Collector service...');

    try {
      // 停止接收新的 HTTP 请求
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(() => resolve());
        });
      }

      // 停止所有适配器
      if (this.adapterRegistry) {
        await this.adapterRegistry.stopAllInstances();
      }

      // 销毁组件
      await this.cleanup();

      this.monitor.log('info', 'Exchange Collector service stopped successfully');
    } catch (error) {
      this.monitor.log('error', 'Error during service shutdown', { error });
      throw error;
    }
  }

  /**
   * 初始化 Express 应用
   */
  private initializeExpress(config: any): void {
    this.app = express();

    // 中间件
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    if (config.server.enableCors) {
      this.app.use(cors() as any);
    }

    // 请求日志
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.monitor.log('debug', 'HTTP request', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration
        });
      });
      next();
    });

    // API 路由
    this.app.use('/health', createHealthRouter(this.adapterRegistry, this.monitor));
    this.app.use('/metrics', createMetricsRouter(this.adapterRegistry, this.monitor));
    this.app.use('/api/adapters', createAdapterRouter(this.adapterRegistry, this.monitor));

    // 错误处理
    this.app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      this.monitor.log('error', 'Unhandled error in Express', { error: err });
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * 启动适配器
   */
  private async startAdapters(): Promise<void> {
    const config = configManager.getConfig();
    if (!config) {
      return;
    }

    // 准备适配器配置
    const adapterConfigs = new Map<string, IntegrationConfig>();
    
    for (const [exchangeName, adapterConfig] of Object.entries(config.adapters)) {
      if (adapterConfig.config.enabled) {
        const integrationConfig: IntegrationConfig = {
          adapterConfig: {
            exchange: exchangeName,
            ...adapterConfig.config,
            subscription: adapterConfig.subscription
          },
          publishConfig: {
            topicPrefix: config.pubsub.topicPrefix,
            enableBatching: config.pubsub.publishSettings.enableBatching,
            batchSize: config.pubsub.publishSettings.batchSize,
            batchTimeout: config.pubsub.publishSettings.batchTimeout
          },
          monitoringConfig: {
            enableMetrics: config.monitoring.enableMetrics,
            enableHealthCheck: config.monitoring.enableHealthCheck,
            metricsInterval: config.monitoring.metricsInterval
          }
        };
        
        adapterConfigs.set(exchangeName, integrationConfig);
      }
    }

    // 启动自动启动的适配器
    await this.adapterRegistry.startAutoAdapters(adapterConfigs);
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    const cleanupTasks = [];

    if (this.adapterRegistry) {
      cleanupTasks.push(this.adapterRegistry.destroy());
    }

    if (this.pubsubClient) {
      cleanupTasks.push(this.pubsubClient.close());
    }

    // Monitor doesn't need explicit cleanup

    // 清理全局缓存
    globalCache.destroy();

    await Promise.allSettled(cleanupTasks);
  }

  /**
   * 设置优雅关闭
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, starting graceful shutdown...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

/**
 * 主函数
 */
async function main() {
  const service = new ExchangeCollectorService();
  
  try {
    await service.initialize();
    await service.start();
  } catch (error) {
    console.error('Failed to start Exchange Collector service:', error);
    process.exit(1);
  }
}

// 如果是主模块，启动服务
if (require.main === module) {
  main();
}

export default ExchangeCollectorService;