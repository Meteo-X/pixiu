# @pixiu/adapter-base

Pixiu交易适配器基础框架，提供统一的适配器接口和基础实现。

## 功能特性

### 统一接口设计
- 标准化的适配器接口
- 统一的连接管理
- 标准化的数据解析
- 事件驱动架构

### 基础实现
- WebSocket连接管理
- 自动重连机制
- 心跳检测
- 错误处理和恢复

### 工厂模式
- 适配器注册中心
- 动态适配器创建
- 配置验证
- 别名支持

## 安装

```bash
npm install @pixiu/adapter-base
```

## 快速开始

### 创建自定义适配器

```typescript
import { 
  BaseAdapter, 
  BaseConnectionManager,
  AdapterConfig,
  DataType,
  SubscriptionInfo,
  MarketData,
  ConnectionManager
} from '@pixiu/adapter-base';

class MyExchangeAdapter extends BaseAdapter {
  public readonly exchange = 'myexchange';

  protected async createConnectionManager(): Promise<ConnectionManager> {
    return new BaseConnectionManager();
  }

  protected async createSubscription(symbol: string, dataType: DataType): Promise<SubscriptionInfo> {
    const subscriptionId = `${symbol}:${dataType}`;
    
    // 发送订阅消息到交易所
    await this.connectionManager?.send({
      method: 'SUBSCRIBE',
      params: [`${symbol.toLowerCase()}@${dataType}`]
    });

    return {
      id: subscriptionId,
      symbol,
      dataType,
      subscribedAt: Date.now(),
      active: true
    };
  }

  protected async removeSubscription(subscription: SubscriptionInfo): Promise<void> {
    // 发送取消订阅消息
    await this.connectionManager?.send({
      method: 'UNSUBSCRIBE',
      params: [`${subscription.symbol.toLowerCase()}@${subscription.dataType}`]
    });
  }

  protected parseMessage(message: any): MarketData | null {
    // 解析交易所消息格式
    if (message.stream && message.data) {
      const [symbol, dataType] = message.stream.split('@');
      
      return {
        exchange: this.exchange,
        symbol: symbol.toUpperCase(),
        type: dataType as DataType,
        timestamp: message.data.E || Date.now(),
        data: message.data,
        receivedAt: Date.now()
      };
    }
    
    return null;
  }
}
```

### 使用适配器工厂

```typescript
import { AdapterFactory, globalAdapterFactory } from '@pixiu/adapter-base';

// 注册适配器
globalAdapterFactory.register('myexchange', MyExchangeAdapter, {
  version: '1.0.0',
  description: 'My Exchange Adapter',
  supportedFeatures: ['websocket', 'trades', 'tickers']
});

// 创建适配器实例
const config = {
  exchange: 'myexchange',
  endpoints: {
    ws: 'wss://api.myexchange.com/ws',
    rest: 'https://api.myexchange.com'
  },
  connection: {
    timeout: 10000,
    maxRetries: 3,
    retryInterval: 5000,
    heartbeatInterval: 30000
  }
};

const adapter = await globalAdapterFactory.create('myexchange', config);

// 监听事件
adapter.on('connected', () => {
  console.log('Connected to exchange');
});

adapter.on('data', (marketData) => {
  console.log('Received market data:', marketData);
});

adapter.on('error', (error) => {
  console.error('Adapter error:', error);
});

// 连接和订阅
await adapter.connect();

await adapter.subscribe({
  symbols: ['BTCUSDT', 'ETHUSDT'],
  dataTypes: ['trade', 'ticker']
});
```

### 使用连接管理器

```typescript
import { BaseConnectionManager } from '@pixiu/adapter-base';

const connectionManager = new BaseConnectionManager();

// 监听连接事件
connectionManager.on('connected', () => {
  console.log('WebSocket connected');
});

connectionManager.on('message', (message) => {
  console.log('Received:', message);
});

connectionManager.on('error', (error) => {
  console.error('Connection error:', error);
});

// 连接
await connectionManager.connect({
  url: 'wss://api.example.com/ws',
  timeout: 10000,
  maxRetries: 3,
  retryInterval: 5000,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000
});

// 发送消息
await connectionManager.send({
  method: 'subscribe',
  params: ['btcusdt@trade']
});

// 心跳检测
const latency = await connectionManager.ping();
console.log('Latency:', latency, 'ms');
```

## 接口定义

### ExchangeAdapter接口

```typescript
interface ExchangeAdapter {
  readonly exchange: string;
  
  getStatus(): AdapterStatus;
  getConfig(): AdapterConfig;
  getMetrics(): AdapterMetrics;
  
  initialize(config: AdapterConfig): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  subscribe(config: SubscriptionConfig): Promise<SubscriptionInfo[]>;
  unsubscribe(subscriptionIds: string[]): Promise<void>;
  unsubscribeAll(): Promise<void>;
  
  sendHeartbeat(): Promise<void>;
  reconnect(): Promise<void>;
  destroy(): Promise<void>;
}
```

### ConnectionManager接口

```typescript
interface ConnectionManager {
  getState(): ConnectionState;
  getConfig(): ConnectionConfig;
  getMetrics(): ConnectionMetrics;
  
  isConnected(): boolean;
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  
  send(message: any): Promise<void>;
  sendRaw(data: string | Buffer): Promise<void>;
  ping(): Promise<number>;
  
  destroy(): Promise<void>;
}
```

## 配置选项

### AdapterConfig

```typescript
interface AdapterConfig {
  exchange: string;
  endpoints: {
    ws: string;
    rest: string;
  };
  connection: {
    timeout: number;
    maxRetries: number;
    retryInterval: number;
    heartbeatInterval: number;
  };
  auth?: {
    apiKey?: string;
    apiSecret?: string;
  };
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  labels?: Record<string, string>;
}
```

### SubscriptionConfig

```typescript
interface SubscriptionConfig {
  symbols: string[];
  dataTypes: DataType[];
  enableCompression?: boolean;
  enableAggregation?: boolean;
  batchSize?: number;
}
```

## 事件系统

### 适配器事件

- `statusChange` - 状态变化
- `connected` - 连接建立
- `disconnected` - 连接断开
- `data` - 接收到市场数据
- `error` - 发生错误
- `reconnecting` - 开始重连
- `heartbeat` - 心跳检测
- `subscribed` - 订阅成功
- `unsubscribed` - 取消订阅

### 连接事件

- `stateChange` - 连接状态变化
- `connected` - 连接建立
- `disconnected` - 连接断开
- `message` - 接收到消息
- `error` - 连接错误
- `reconnecting` - 开始重连
- `heartbeat` - 心跳响应

## 数据类型

支持的市场数据类型：

- `trade` - 成交数据
- `ticker` - 行情数据
- `kline_1m` - 1分钟K线
- `kline_5m` - 5分钟K线
- `kline_1h` - 1小时K线
- `kline_1d` - 1日K线
- `depth` - 深度数据
- `orderbook` - 订单簿

## 许可证

MIT License