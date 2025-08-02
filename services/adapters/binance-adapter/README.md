# @pixiu/binance-adapter

Binance交易所适配器SDK，基于@pixiu/adapter-base框架实现。

## 功能特性

- 🚀 基于统一适配器框架
- 📡 WebSocket实时数据流
- 🔄 自动重连和错误恢复
- 📊 支持多种数据类型
- 🔧 简单易用的API
- 📦 轻量级SDK设计

## 安装

```bash
npm install @pixiu/binance-adapter
```

## 快速开始

### 基本使用

```typescript
import { createBinanceAdapter, DataType } from '@pixiu/binance-adapter';

// 创建适配器实例
const adapter = createBinanceAdapter({
  exchange: 'binance',
  endpoints: {
    ws: 'wss://stream.binance.com:9443/ws',
    rest: 'https://api.binance.com/api'
  },
  connection: {
    timeout: 10000,
    maxRetries: 3,
    retryInterval: 5000,
    heartbeatInterval: 30000
  },
  binance: {
    testnet: false,
    enableCompression: true
  }
});

// 监听事件
adapter.on('connected', () => {
  console.log('Connected to Binance');
});

adapter.on('data', (marketData) => {
  console.log('Market data:', marketData);
});

adapter.on('error', (error) => {
  console.error('Adapter error:', error);
});

// 连接
await adapter.connect();

// 订阅数据
await adapter.subscribe({
  symbols: ['BTC/USDT', 'ETH/USDT'],
  dataTypes: [DataType.TRADE, DataType.TICKER, DataType.KLINE_1M]
});
```

### 高级用法

```typescript
import { BinanceAdapter, BinanceConfig } from '@pixiu/binance-adapter';

// 自定义配置
const config: BinanceConfig = {
  exchange: 'binance',
  endpoints: {
    ws: 'wss://stream.binance.com:9443/ws',
    rest: 'https://api.binance.com/api'
  },
  connection: {
    timeout: 15000,
    maxRetries: 5,
    retryInterval: 3000,
    heartbeatInterval: 30000
  },
  auth: {
    apiKey: 'your-api-key',
    apiSecret: 'your-api-secret'
  },
  binance: {
    testnet: false,
    enableCompression: true,
    batchSize: 100
  }
};

// 手动创建适配器
const adapter = new BinanceAdapter();
await adapter.initialize(config);

// 监听状态变化
adapter.on('statusChange', (newStatus, oldStatus) => {
  console.log(`Status changed: ${oldStatus} -> ${newStatus}`);
});

// 监听订阅事件
adapter.on('subscribed', (subscription) => {
  console.log('Subscribed:', subscription);
});

// 连接和订阅
await adapter.connect();

const subscriptions = await adapter.subscribe({
  symbols: ['BTC/USDT', 'ETH/USDT', 'ADA/USDT'],
  dataTypes: [DataType.TRADE, DataType.DEPTH]
});

console.log('Active subscriptions:', subscriptions);

// 获取适配器指标
const metrics = adapter.getMetrics();
console.log('Adapter metrics:', metrics);

// 发送心跳
await adapter.sendHeartbeat();

// 断开连接
await adapter.disconnect();
```

## 配置选项

### BinanceConfig

```typescript
interface BinanceConfig extends AdapterConfig {
  binance?: {
    /** 是否使用测试网 */
    testnet?: boolean;
    /** 是否启用数据压缩 */
    enableCompression?: boolean;
    /** 批量订阅大小 */
    batchSize?: number;
  };
}
```

### 默认配置

```typescript
const defaultConfig = {
  connection: {
    timeout: 10000,
    maxRetries: 3,
    retryInterval: 5000,
    heartbeatInterval: 30000
  },
  binance: {
    testnet: false,
    enableCompression: true,
    batchSize: 100
  }
};
```

## 支持的数据类型

| 数据类型 | 说明 | Binance流名称 |
|---------|------|---------------|
| `TRADE` | 实时成交数据 | `@trade` |
| `TICKER` | 24小时价格统计 | `@ticker` |
| `KLINE_1M` | 1分钟K线 | `@kline_1m` |
| `KLINE_5M` | 5分钟K线 | `@kline_5m` |
| `KLINE_1H` | 1小时K线 | `@kline_1h` |
| `KLINE_1D` | 1日K线 | `@kline_1d` |
| `DEPTH` | 深度数据 | `@depth` |
| `ORDER_BOOK` | 订单簿快照 | `@depth20@100ms` |

## 数据格式

### 交易数据 (TradeData)

```typescript
interface TradeData {
  id: string;        // 交易ID
  price: number;     // 成交价格
  quantity: number;  // 成交数量
  side: 'buy' | 'sell'; // 买卖方向
  timestamp: number; // 交易时间戳
}
```

### 行情数据 (TickerData)

```typescript
interface TickerData {
  lastPrice: number;  // 最新价格
  bidPrice: number;   // 买一价
  askPrice: number;   // 卖一价
  change24h: number;  // 24小时涨跌幅
  volume24h: number;  // 24小时成交量
  high24h: number;    // 24小时最高价
  low24h: number;     // 24小时最低价
}
```

### K线数据 (KlineData)

```typescript
interface KlineData {
  open: number;      // 开盘价
  high: number;      // 最高价
  low: number;       // 最低价
  close: number;     // 收盘价
  volume: number;    // 成交量
  openTime: number;  // 开盘时间
  closeTime: number; // 收盘时间
  interval: string;  // 时间间隔
}
```

### 深度数据 (DepthData)

```typescript
interface DepthData {
  bids: Array<[number, number]>; // 买盘 [价格, 数量]
  asks: Array<[number, number]>; // 卖盘 [价格, 数量]
  updateTime: number;            // 更新时间
}
```

## 事件系统

适配器继承自EventEmitter，支持以下事件：

- `connected` - 连接建立
- `disconnected` - 连接断开
- `statusChange` - 状态变化
- `data` - 接收到市场数据
- `error` - 发生错误
- `reconnecting` - 开始重连
- `heartbeat` - 心跳检测
- `subscribed` - 订阅成功
- `unsubscribed` - 取消订阅

## 工具函数

### 生成签名

```typescript
import { BinanceAdapter } from '@pixiu/binance-adapter';

const signature = BinanceAdapter.generateSignature(queryString, apiSecret);
```

### 创建认证头部

```typescript
const headers = BinanceAdapter.createAuthHeaders(apiKey, timestamp, signature);
```

## 错误处理

适配器内置了错误处理和自动恢复机制：

- 自动重连
- 订阅恢复
- 错误分类和处理
- 熔断器保护

```typescript
adapter.on('error', (error) => {
  console.error('Error:', error);
  // 错误会自动处理，无需手动干预
});
```

## 性能监控

```typescript
// 获取适配器指标
const metrics = adapter.getMetrics();
console.log('Metrics:', {
  status: metrics.status,
  messagesReceived: metrics.messagesReceived,
  averageLatency: metrics.averageLatency,
  errorCount: metrics.errorCount,
  reconnectCount: metrics.reconnectCount
});
```

## 许可证

MIT License