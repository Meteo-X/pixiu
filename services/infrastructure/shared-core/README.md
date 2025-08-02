# @pixiu/shared-core

Pixiu量化交易系统核心共享库，提供统一的基础设施组件。

## 功能模块

### 配置管理 (Config)
- 统一的配置加载和验证
- 支持多种配置源（文件、环境变量、远程）
- 配置热更新和监控
- 配置版本控制

### 错误处理 (Error)
- 统一的错误分类和处理
- 自动错误恢复策略
- 错误统计和监控
- 熔断器模式支持

### 监控系统 (Monitoring)
- Prometheus指标收集
- 健康检查框架
- 结构化日志记录
- 告警规则引擎

### 消息系统 (PubSub)
- Google Cloud Pub/Sub抽象
- 本地模拟器支持
- 消息批处理
- 指标统计

### 通用工具 (Utils)
- 重试机制 (Retry)
- 内存缓存 (Cache)
- 连接池管理
- 数据验证

## 安装

```bash
npm install @pixiu/shared-core
```

## 快速开始

### 配置管理

```typescript
import { BaseConfigManager } from '@pixiu/shared-core';

class AppConfigManager extends BaseConfigManager {
  protected getDefaultSources() {
    return [
      { type: 'file', source: 'config/app.yaml', priority: 1 },
      { type: 'env', source: 'APP', priority: 2 }
    ];
  }

  protected getDefaultConfig() {
    return {
      name: 'pixiu-app',
      version: '1.0.0'
    };
  }
}

const configManager = new AppConfigManager();
await configManager.load();
const config = configManager.getConfig();
```

### 错误处理

```typescript
import { BaseErrorHandler, ErrorCategory, RecoveryStrategy } from '@pixiu/shared-core';

const errorHandler = new BaseErrorHandler({
  enableAutoRetry: true,
  defaultMaxRetries: 3
});

// 注册特定错误处理器
errorHandler.registerHandler('CONNECTION_ERROR', async (error) => {
  // 自定义恢复逻辑
  return {
    success: true,
    strategy: RecoveryStrategy.RECONNECT,
    recoveryTime: 1000
  };
});

// 处理错误
const result = await errorHandler.handleError(error, {
  component: 'binance-adapter',
  operation: 'connect',
  timestamp: Date.now()
});
```

### 监控系统

```typescript
import { BaseMonitor } from '@pixiu/shared-core';

const monitor = new BaseMonitor({
  metrics: {
    enabled: true,
    endpoint: 'localhost',
    port: 9090,
    path: '/metrics'
  },
  healthCheck: {
    enabled: true,
    endpoint: 'localhost',
    port: 8080,
    path: '/health',
    interval: 30000
  },
  logging: {
    level: 'info',
    format: 'json',
    output: 'console'
  }
});

// 注册指标
monitor.registerMetric({
  name: 'messages_processed_total',
  description: 'Total number of processed messages',
  type: 'counter',
  labels: ['exchange', 'symbol']
});

// 更新指标
monitor.incrementCounter('messages_processed_total', 1, {
  exchange: 'binance',
  symbol: 'BTCUSDT'
});

// 注册健康检查
monitor.registerHealthCheck({
  name: 'database',
  check: async () => {
    // 检查数据库连接
    return {
      name: 'database',
      status: 'healthy',
      timestamp: Date.now(),
      duration: 50
    };
  },
  interval: 30000,
  timeout: 5000,
  critical: true
});
```

### Pub/Sub消息系统

```typescript
import { PubSubClientImpl } from '@pixiu/shared-core';

const pubsub = new PubSubClientImpl({
  projectId: 'pixiu-trading',
  useEmulator: true,
  emulatorHost: 'localhost:8085'
});

// 发布消息
const messageId = await pubsub.publish('market-data', {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  price: 50000,
  timestamp: Date.now()
});

// 订阅消息
await pubsub.subscribe('market-data-subscription', async (message) => {
  console.log('Received message:', message.data);
});
```

### 重试机制

```typescript
import { retry, retryable } from '@pixiu/shared-core';

// 使用重试执行器
const result = await retry.execute(async () => {
  // 可能失败的操作
  return await fetchMarketData();
}, {
  maxRetries: 3,
  initialDelay: 1000,
  backoffStrategy: 'exponential'
});

// 使用装饰器
class DataService {
  @retryable({ maxRetries: 3, initialDelay: 500 })
  async fetchData() {
    // 自动重试的方法
    return await this.apiCall();
  }
}
```

### 缓存系统

```typescript
import { MemoryCache, cacheable } from '@pixiu/shared-core';

const cache = new MemoryCache({
  ttl: 60000, // 1分钟
  maxSize: 1000
});

// 基本使用
cache.set('user:123', userData);
const user = cache.get('user:123');

// 获取或设置
const data = await cache.getOrSet('expensive-data', async () => {
  return await computeExpensiveData();
});

// 使用装饰器
class DataService {
  @cacheable({ ttl: 30000, key: 'market-data' })
  async getMarketData(symbol: string) {
    return await this.fetchFromAPI(symbol);
  }
}
```

## API文档

详细的API文档请参考各模块的TypeScript类型定义。

## 许可证

MIT License