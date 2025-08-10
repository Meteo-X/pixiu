/**
 * Exchange Collector DataFlow服务
 * 基于DataFlowManager的重构版本
 */

import { BaseErrorHandler, BaseMonitor, PubSubClientImpl, globalCache } from '@pixiu/shared-core';
import { getExchangeCollectorConfigManager } from './config/unified-config';
import { createDataFlowManager, DataFlowManager, DataFlowSetupOptions } from './dataflow';
import { BinanceDataFlowIntegration } from './adapters/binance/dataflow-integration';
import { PipelineIntegrationConfig } from './adapters/base/pipeline-adapter-integration';
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
 * 基于DataFlow的Exchange Collector服务类
 */
export class ExchangeCollectorDataFlowService {
  private app!: express.Application;
  private server: any;
  private dataFlowManager!: DataFlowManager;
  private adapterIntegrations: Map<string, any> = new Map();
  private pubsubClient!: PubSubClientImpl;
  private monitor!: BaseMonitor;
  private errorHandler!: BaseErrorHandler;
  private statsReporter!: StatsReporter;
  private webSocketServer!: CollectorWebSocketServer;
  private dataStreamCache!: DataStreamCache;
  private configManager = getExchangeCollectorConfigManager();
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
      const config = await this.configManager.initialize();
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
          labels: { service: config.name || 'exchange-collector-dataflow' }
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

      // 初始化数据流缓存
      this.initializeDataStreamCache(config);

      // 初始化 Express 应用
      this.initializeExpress(config);

      // 初始化统计报告器
      this.initializeStatsReporter(config);

      this.monitor.log('info', 'Exchange Collector DataFlow service initialized', {
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
      const config = this.configManager.getCurrentConfig();
      if (!config) {
        throw new Error('Configuration not loaded');
      }

      // 初始化DataFlowManager
      await this.initializeDataFlowManager(config);

      // 启动适配器集成
      await this.startAdapterIntegrations();

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

      this.monitor.log('info', 'Exchange Collector DataFlow service started successfully');
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
    this.monitor.log('info', 'Stopping Exchange Collector DataFlow service...');

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

      // 停止所有适配器集成
      await this.stopAllAdapterIntegrations();

      // 停止DataFlowManager
      if (this.dataFlowManager) {
        await this.dataFlowManager.stop();
      }

      // 销毁组件
      await this.cleanup();

      this.monitor.log('info', 'Exchange Collector DataFlow service stopped successfully');
    } catch (error) {
      this.monitor.log('error', 'Error during service shutdown', { error });
      throw error;
    }
  }

  /**
   * 初始化DataFlowManager
   */
  private async initializeDataFlowManager(config: any): Promise<void> {
    const dataFlowOptions: DataFlowSetupOptions = {
      pubsubClient: this.pubsubClient,
      webSocketServer: this.webSocketServer,
      dataStreamCache: this.dataStreamCache,
      monitor: this.monitor,
      config: {
        enabled: true,
        batching: {
          enabled: config.pubsub.publishSettings.enableBatching,
          batchSize: config.pubsub.publishSettings.batchSize,
          flushTimeout: config.pubsub.publishSettings.batchTimeout
        },
        performance: {
          maxQueueSize: 10000,
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 8000
        },
        monitoring: {
          enableMetrics: config.monitoring.enableMetrics,
          metricsInterval: config.monitoring.metricsInterval,
          enableLatencyTracking: true
        },
        errorHandling: {
          retryCount: 3,
          retryDelay: 1000,
          enableCircuitBreaker: true,
          circuitBreakerThreshold: 10
        }
      },
      pubsubConfig: {
        topicPrefix: config.pubsub.topicPrefix,
        enableBatching: config.pubsub.publishSettings.enableBatching,
        batchSize: config.pubsub.publishSettings.batchSize
      },
      enabledChannels: {
        pubsub: true,
        websocket: true,
        cache: true
      },
      routingPresets: 'default'
    };

    this.dataFlowManager = await createDataFlowManager(dataFlowOptions);
    
    // 启动DataFlowManager
    this.dataFlowManager.start();

    this.monitor.log('info', 'DataFlowManager initialized and started', {
      stats: this.dataFlowManager.getStats(),
      channelCount: this.dataFlowManager.getChannelStatuses().length
    });
  }

  /**
   * 启动适配器集成
   */
  private async startAdapterIntegrations(): Promise<void> {
    const config = this.configManager.getCurrentConfig();
    if (!config) {
      return;
    }

    // 为每个启用的适配器创建集成实例
    for (const [exchangeName, adapterConfig] of Object.entries(config.adapters)) {
      if (!adapterConfig.config.enabled) {
        continue;
      }

      try {
        const integrationConfig: PipelineIntegrationConfig = {
          adapterConfig: {
            exchange: exchangeName,
            ...adapterConfig.config,
            subscription: adapterConfig.subscription
          },
          monitoringConfig: {
            enableMetrics: config.monitoring.enableMetrics,
            enableHealthCheck: config.monitoring.enableHealthCheck,
            metricsInterval: config.monitoring.metricsInterval
          }
        };

        // 创建适配器集成实例
        let integration: any;
        switch (exchangeName.toLowerCase()) {
          case 'binance':
            integration = new BinanceDataFlowIntegration();
            break;
          default:
            this.monitor.log('warn', 'Unknown exchange, skipping', { exchangeName });
            continue;
        }

        // 初始化和启动集成
        await integration.initialize(
          integrationConfig,
          this.dataFlowManager,
          this.monitor,
          this.errorHandler
        );
        
        await integration.start();
        
        this.adapterIntegrations.set(exchangeName, integration);
        
        this.monitor.log('info', 'Adapter integration started', { 
          exchangeName,
          metrics: integration.getMetrics()
        });
      } catch (error) {
        this.monitor.log('error', 'Failed to start adapter integration', { 
          exchangeName, 
          error: error.message 
        });
      }
    }
  }

  /**
   * 停止所有适配器集成
   */
  private async stopAllAdapterIntegrations(): Promise<void> {
    const stopPromises = Array.from(this.adapterIntegrations.entries()).map(
      async ([exchangeName, integration]) => {
        try {
          await integration.stop();
          await integration.destroy();
          this.monitor.log('info', 'Adapter integration stopped', { exchangeName });
        } catch (error) {
          this.monitor.log('error', 'Failed to stop adapter integration', { 
            exchangeName, 
            error: error.message 
          });
        }
      }
    );

    await Promise.allSettled(stopPromises);
    this.adapterIntegrations.clear();
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

    // API 路由 - 需要适配新的架构
    this.app.use('/health', this.createHealthRouter());
    this.app.use('/metrics', this.createMetricsRouter());
    this.app.use('/api/dataflow', this.createDataFlowRouter());
    this.app.use('/api/stats', this.createStatsRouter());

    // 静态文件服务
    const frontendDistPath = path.join(__dirname, '../frontend/dist');
    this.app.use(express.static(frontendDistPath));

    // SPA 路由支持
    this.app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || 
          req.path.startsWith('/health') || 
          req.path.startsWith('/metrics') || 
          req.path.startsWith('/ws')) {
        return next();
      }
      
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
   * 创建健康检查路由
   */
  private createHealthRouter() {
    const router = express.Router();
    
    router.get('/', async (req, res) => {
      try {
        const dataFlowStats = this.dataFlowManager?.getStats();
        const channelStatuses = this.dataFlowManager?.getChannelStatuses() || [];
        
        const adapterStatuses = Array.from(this.adapterIntegrations.entries()).map(
          ([name, integration]) => ({
            name,
            healthy: integration.isHealthy(),
            status: integration.getAdapterStatus(),
            metrics: integration.getMetrics()
          })
        );

        const isHealthy = adapterStatuses.every(adapter => adapter.healthy) &&
                         channelStatuses.every(channel => channel.health === 'healthy');

        res.json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: Date.now(),
          service: 'exchange-collector-dataflow',
          dataFlow: {
            stats: dataFlowStats,
            channels: channelStatuses.length,
            healthyChannels: channelStatuses.filter(c => c.health === 'healthy').length
          },
          adapters: adapterStatuses
        });
      } catch (error) {
        this.monitor.log('error', 'Health check failed', { error: error.message });
        res.status(500).json({ 
          status: 'unhealthy', 
          error: error.message,
          timestamp: Date.now()
        });
      }
    });

    return router;
  }

  /**
   * 创建指标路由
   */
  private createMetricsRouter() {
    const router = express.Router();
    
    router.get('/', async (req, res) => {
      try {
        const dataFlowStats = this.dataFlowManager?.getStats();
        const channelStatuses = this.dataFlowManager?.getChannelStatuses() || [];
        
        const adapterMetrics = Array.from(this.adapterIntegrations.entries()).reduce(
          (acc, [name, integration]) => {
            acc[name] = integration.getMetrics();
            return acc;
          },
          {} as any
        );

        res.json({
          timestamp: Date.now(),
          dataFlow: dataFlowStats,
          channels: channelStatuses,
          adapters: adapterMetrics
        });
      } catch (error) {
        this.monitor.log('error', 'Metrics collection failed', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  /**
   * 创建数据流路由
   */
  private createDataFlowRouter() {
    const router = express.Router();
    
    // 获取数据流状态
    router.get('/status', (req, res) => {
      try {
        const stats = this.dataFlowManager?.getStats();
        const channels = this.dataFlowManager?.getChannelStatuses() || [];
        
        res.json({
          stats,
          channels,
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  /**
   * 创建统计路由
   */
  private createStatsRouter() {
    const router = express.Router();
    
    router.get('/', (req, res) => {
      try {
        const stats = {
          dataFlow: this.dataFlowManager?.getStats(),
          adapters: Array.from(this.adapterIntegrations.entries()).reduce(
            (acc, [name, integration]) => {
              acc[name] = integration.getMetrics();
              return acc;
            },
            {} as any
          )
        };
        
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  /**
   * 初始化统计报告器
   */
  private initializeStatsReporter(config: any): void {
    // 创建一个简化的统计报告器
    this.statsReporter = {
      start: () => {
        setInterval(() => {
          if (this.dataFlowManager) {
            const stats = this.dataFlowManager.getStats();
            this.monitor.log('info', 'DataFlow stats', stats);
          }
        }, config.monitoring?.statsReportInterval || 30000);
      },
      stop: () => {
        // 停止统计报告
      },
      getConfig: () => ({ reportInterval: 30000 })
    } as any;
  }

  /**
   * 初始化 WebSocket 服务器
   */
  private initializeWebSocket(): void {
    this.webSocketServer = createWebSocketServer(
      this.server,
      this.monitor,
      null, // 不需要adapterRegistry
      {
        connectionPool: {
          maxConnections: 1000,
          idleTimeout: 300000,
          cleanupInterval: 60000,
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
  }

  /**
   * 初始化数据流缓存
   */
  private initializeDataStreamCache(config: any): void {
    this.dataStreamCache = createDataStreamCache(
      this.monitor,
      {
        maxSize: config.cache?.maxSize || 1000,
        ttl: config.cache?.ttl || 300000,
        cleanupInterval: config.cache?.cleanupInterval || 60000,
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

    if (this.pubsubClient) {
      cleanupTasks.push(this.pubsubClient.close());
    }

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
  const service = new ExchangeCollectorDataFlowService();
  
  try {
    await service.initialize();
    await service.start();
  } catch (error) {
    console.error('Failed to start Exchange Collector DataFlow service:', error);
    process.exit(1);
  }
}

// 如果是主模块，启动服务
if (require.main === module) {
  main();
}

export default ExchangeCollectorDataFlowService;