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
import path = require('path');
import { createHealthRouter } from './api/health';
import { createMetricsRouter } from './api/metrics';
import { createAdapterRouter } from './api/adapters';
import { createSubscriptionRouter } from './api/subscriptions';
import { createStatsRouter } from './api/stats';
import { createPubSubControlRouter } from './api/pubsub-control';
import { StatsReporter } from './monitoring/stats-reporter';
import { createWebSocketServer, CollectorWebSocketServer } from './websocket';
import { createDataStreamCache, DataStreamCache } from './cache';

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
  private statsReporter!: StatsReporter;
  private webSocketServer!: CollectorWebSocketServer;
  private dataStreamCache!: DataStreamCache;
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

      // 初始化数据流缓存
      this.initializeDataStreamCache(config);

      // 初始化 Express 应用
      this.initializeExpress(config);

      // 初始化统计报告器
      this.initializeStatsReporter(config);

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

      // 初始化 WebSocket 服务器
      this.initializeWebSocket();

      // 启动统计报告器
      this.statsReporter.start();

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
      // 停止统计报告器
      if (this.statsReporter) {
        this.statsReporter.stop();
      }

      // 停止 WebSocket 服务器
      if (this.webSocketServer) {
        await this.webSocketServer.close();
      }

      // 关闭数据流缓存
      if (this.dataStreamCache) {
        this.dataStreamCache.close();
      }

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
    this.app.use('/api/subscriptions', createSubscriptionRouter(this.adapterRegistry, this.monitor, this.dataStreamCache));
    this.app.use('/api/stats', createStatsRouter(this.adapterRegistry, this.monitor, this.dataStreamCache));
    this.app.use('/api/pubsub', createPubSubControlRouter(this.adapterRegistry, this.monitor));

    // 静态文件服务 - 服务前端构建文件
    const frontendDistPath = path.join(__dirname, '../frontend/dist');
    this.app.use(express.static(frontendDistPath));

    // SPA 路由支持 - 对于非API路由，返回index.html
    this.app.get('*', (req, res, next) => {
      // 跳过API路由、健康检查和WebSocket路由
      if (req.path.startsWith('/api/') || 
          req.path.startsWith('/health') || 
          req.path.startsWith('/metrics') || 
          req.path.startsWith('/ws')) {
        return next();
      }
      
      // 对于其他路由，返回index.html以支持前端路由
      res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
        if (err) {
          this.monitor.log('error', 'Failed to serve index.html', { error: err, path: req.path });
          res.status(404).json({ error: 'Frontend not available' });
        }
      });
    });

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
   * 初始化统计报告器
   */
  private initializeStatsReporter(config: any): void {
    this.statsReporter = new StatsReporter(
      this.adapterRegistry,
      this.monitor,
      {
        reportInterval: config.monitoring?.statsReportInterval || 30000, // 30秒
        verbose: config.monitoring?.verboseStats || false,
        showZeroValues: config.monitoring?.showZeroValues || false,
        logLevel: 'info'
      }
    );

    this.monitor.log('info', 'Stats reporter initialized', {
      reportInterval: this.statsReporter.getConfig().reportInterval
    });
  }

  /**
   * 初始化 WebSocket 服务器
   */
  private initializeWebSocket(): void {
    this.webSocketServer = createWebSocketServer(
      this.server,
      this.monitor,
      this.adapterRegistry,
      {
        connectionPool: {
          maxConnections: 1000,
          idleTimeout: 300000, // 5分钟
          cleanupInterval: 60000, // 1分钟
          enableMetrics: true
        },
        messageHandler: {
          enableRateLimit: true,
          maxMessagesPerMinute: 60,
          enableMessageValidation: true,
          logAllMessages: false
        }
      }
    );

    this.monitor.log('info', 'WebSocket server initialized', {
      path: '/ws',
      maxConnections: 1000
    });

    // 设置适配器数据流到WebSocket的转发
    this.setupDataStreamForwarding();
  }

  /**
   * 设置数据流转发到WebSocket
   */
  private setupDataStreamForwarding(): void {
    // 监听适配器处理的数据
    this.adapterRegistry.on('instanceDataProcessed', (adapterName: string, marketData: any) => {
      try {
        // 构造WebSocket消息格式
        const websocketMessage = {
          type: marketData.type || 'market_data',
          exchange: marketData.exchange || adapterName,
          symbol: marketData.symbol,
          data: marketData.data,
          timestamp: marketData.timestamp || new Date().toISOString()
        };

        // 转发到WebSocket客户端
        this.webSocketServer.broadcast({
          type: websocketMessage.type,
          payload: websocketMessage
        });

        // 缓存数据
        if (this.dataStreamCache) {
          this.dataStreamCache.set(`${adapterName}:${marketData.symbol}:${marketData.type}`, marketData, adapterName);
        }

        this.monitor.log('debug', 'Market data forwarded to WebSocket', {
          adapter: adapterName,
          symbol: marketData.symbol,
          type: marketData.type
        });
      } catch (error) {
        this.monitor.log('error', 'Error forwarding market data to WebSocket', {
          error: error,
          adapter: adapterName,
          data: marketData
        });
      }
    });

    this.monitor.log('info', 'Data stream forwarding to WebSocket configured');
  }

  /**
   * 初始化数据流缓存
   */
  private initializeDataStreamCache(config: any): void {
    this.dataStreamCache = createDataStreamCache(
      this.monitor,
      {
        maxSize: config.cache?.maxSize || 1000,
        ttl: config.cache?.ttl || 300000, // 5分钟
        cleanupInterval: config.cache?.cleanupInterval || 60000, // 1分钟
        enableMetrics: config.monitoring?.enableMetrics || true
      }
    );

    this.monitor.log('info', 'Data stream cache initialized', {
      maxSize: this.dataStreamCache.getMetrics().totalEntries,
      ttl: config.cache?.ttl || 300000
    });
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