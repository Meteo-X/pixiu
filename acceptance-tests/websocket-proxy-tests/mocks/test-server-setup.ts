/**
 * 测试服务器设置
 * 为WebSocket代理测试提供完整的服务器环境
 */

import express from 'express';
import { createServer, Server } from 'http';
import { WebSocketProxy } from '../../../../services/data-collection/exchange-collector/src/websocket/websocket-proxy';
import { MockMonitor, MockDataFlowManager, MockWebSocketOutputChannel } from './dataflow-mock';

export interface TestServerConfig {
  port?: number;
  host?: string;
  enableCors?: boolean;
  enableLogging?: boolean;
  websocketConfig?: {
    heartbeatInterval?: number;
    connectionTimeout?: number;
    maxConnections?: number;
  };
  dataflowConfig?: {
    enableLatencySimulation?: boolean;
    minLatency?: number;
    maxLatency?: number;
  };
}

export interface TestServerInstance {
  server: Server;
  app: express.Application;
  proxy: WebSocketProxy;
  monitor: MockMonitor;
  dataflowManager: MockDataFlowManager;
  outputChannel: MockWebSocketOutputChannel;
  port: number;
  url: string;
  wsUrl: string;
}

/**
 * 测试服务器工厂
 * 创建和管理测试用的WebSocket代理服务器
 */
export class TestServerFactory {
  private static instances: Map<string, TestServerInstance> = new Map();
  private static portCounter = 3000;

  /**
   * 创建测试服务器实例
   */
  static async createTestServer(
    instanceId: string = 'default',
    config: TestServerConfig = {}
  ): Promise<TestServerInstance> {
    if (this.instances.has(instanceId)) {
      throw new Error(`Test server instance '${instanceId}' already exists`);
    }

    const serverConfig: Required<TestServerConfig> = {
      port: this.getNextAvailablePort(),
      host: 'localhost',
      enableCors: true,
      enableLogging: false,
      websocketConfig: {
        heartbeatInterval: 30000,
        connectionTimeout: 60000,
        maxConnections: 1000,
        ...config.websocketConfig
      },
      dataflowConfig: {
        enableLatencySimulation: false,
        minLatency: 1,
        maxLatency: 10,
        ...config.dataflowConfig
      },
      ...config
    };

    // 创建Express应用
    const app = express();
    
    if (serverConfig.enableCors) {
      app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
      });
    }

    // 健康检查端点
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // 状态端点
    app.get('/status', (req, res) => {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        return res.status(404).json({ error: 'Instance not found' });
      }

      res.json({
        connections: instance.proxy.getConnectionStats(),
        dataflow: instance.dataflowManager.getStats(),
        monitor: {
          logs: instance.monitor.getLogs().length,
          errors: instance.monitor.getErrorCount(),
          warnings: instance.monitor.getWarningCount()
        }
      });
    });

    // 创建HTTP服务器
    const server = createServer(app);

    // 创建Mock组件
    const monitor = new MockMonitor();
    const dataflowManager = new MockDataFlowManager(serverConfig.dataflowConfig);
    const outputChannel = new MockWebSocketOutputChannel(`test_channel_${instanceId}`);

    // 创建WebSocket代理
    const proxy = new WebSocketProxy(server, monitor as any, {
      ...serverConfig.websocketConfig
    });

    // 连接组件
    outputChannel.connect(proxy as any);

    // 启动服务器
    await new Promise<void>((resolve, reject) => {
      server.listen(serverConfig.port, serverConfig.host, () => {
        resolve();
      });

      server.on('error', reject);
    });

    // 启动代理和DataFlow管理器
    proxy.start();
    dataflowManager.start();

    const instance: TestServerInstance = {
      server,
      app,
      proxy,
      monitor,
      dataflowManager,
      outputChannel,
      port: serverConfig.port,
      url: `http://${serverConfig.host}:${serverConfig.port}`,
      wsUrl: `ws://${serverConfig.host}:${serverConfig.port}/ws`
    };

    this.instances.set(instanceId, instance);

    if (serverConfig.enableLogging) {
      console.log(`🚀 测试服务器 '${instanceId}' 已启动: ${instance.url}`);
    }

    return instance;
  }

  /**
   * 获取测试服务器实例
   */
  static getTestServer(instanceId: string = 'default'): TestServerInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * 关闭测试服务器
   */
  static async closeTestServer(instanceId: string = 'default'): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    // 停止WebSocket代理
    await instance.proxy.stop();
    
    // 停止DataFlow管理器
    instance.dataflowManager.stop();
    
    // 断开输出通道
    instance.outputChannel.disconnect();

    // 关闭HTTP服务器
    await new Promise<void>((resolve, reject) => {
      instance.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    this.instances.delete(instanceId);
  }

  /**
   * 关闭所有测试服务器
   */
  static async closeAllTestServers(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    
    for (const instanceId of this.instances.keys()) {
      closePromises.push(this.closeTestServer(instanceId));
    }

    await Promise.all(closePromises);
  }

  /**
   * 获取下一个可用端口
   */
  private static getNextAvailablePort(): number {
    return this.portCounter++;
  }

  /**
   * 重置端口计数器
   */
  static resetPortCounter(): void {
    this.portCounter = 3000;
  }
}

/**
 * 测试环境管理器
 * 管理多个测试服务器实例的生命周期
 */
export class TestEnvironmentManager {
  private servers: Map<string, TestServerInstance> = new Map();
  private isSetup = false;

  /**
   * 设置测试环境
   */
  async setup(configurations: Map<string, TestServerConfig> = new Map()): Promise<void> {
    if (this.isSetup) {
      throw new Error('Test environment is already set up');
    }

    // 如果没有提供配置，创建默认服务器
    if (configurations.size === 0) {
      configurations.set('default', {});
    }

    for (const [instanceId, config] of configurations) {
      try {
        const server = await TestServerFactory.createTestServer(instanceId, config);
        this.servers.set(instanceId, server);
      } catch (error) {
        console.error(`Failed to create test server '${instanceId}':`, error);
        // 清理已创建的服务器
        await this.cleanup();
        throw error;
      }
    }

    this.isSetup = true;
  }

  /**
   * 清理测试环境
   */
  async cleanup(): Promise<void> {
    if (!this.isSetup) {
      return;
    }

    await TestServerFactory.closeAllTestServers();
    this.servers.clear();
    this.isSetup = false;
  }

  /**
   * 获取服务器实例
   */
  getServer(instanceId: string = 'default'): TestServerInstance | undefined {
    return this.servers.get(instanceId);
  }

  /**
   * 获取所有服务器实例
   */
  getAllServers(): Map<string, TestServerInstance> {
    return new Map(this.servers);
  }

  /**
   * 重启服务器
   */
  async restartServer(instanceId: string, config?: TestServerConfig): Promise<void> {
    await TestServerFactory.closeTestServer(instanceId);
    const server = await TestServerFactory.createTestServer(instanceId, config);
    this.servers.set(instanceId, server);
  }

  /**
   * 检查环境是否已设置
   */
  isEnvironmentSetup(): boolean {
    return this.isSetup;
  }

  /**
   * 获取环境状态
   */
  getEnvironmentStatus(): {
    isSetup: boolean;
    serverCount: number;
    servers: Array<{
      instanceId: string;
      url: string;
      wsUrl: string;
      connections: number;
    }>;
  } {
    const servers: Array<{
      instanceId: string;
      url: string;
      wsUrl: string;
      connections: number;
    }> = [];

    for (const [instanceId, server] of this.servers) {
      servers.push({
        instanceId,
        url: server.url,
        wsUrl: server.wsUrl,
        connections: server.proxy.getConnectionStats().activeConnections
      });
    }

    return {
      isSetup: this.isSetup,
      serverCount: this.servers.size,
      servers
    };
  }
}

// 全局测试环境管理器实例
export const testEnvironment = new TestEnvironmentManager();