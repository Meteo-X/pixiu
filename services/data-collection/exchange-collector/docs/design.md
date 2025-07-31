# Exchange Collector 设计文档

## 概述

Exchange Collector 是一个高性能的实时市场数据采集服务，负责从加密货币交易所（初期支持 Binance）采集实时交易数据并标准化后发送到 Kafka。

## 技术选型

基于实验调研结果，选择 **Node.js + TypeScript** 作为开发语言：

- WebSocket 性能优于 Python asyncio（2-4倍）
- 更低的资源消耗，适合处理大量并发连接
- 成熟的生态系统（ws、kafkajs 等库）

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Exchange Collector                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐               │
│  │ Config Manager  │    │ Health Monitor   │               │
│  └────────┬────────┘    └────────┬────────┘               │
│           │                       │                         │
│  ┌────────▼────────────────────────▼────────┐              │
│  │         Connection Manager                │              │
│  │  ┌──────────┐  ┌──────────┐  ┌────────┐ │              │
│  │  │ WS Pool  │  │Reconnect │  │Backpres│ │              │
│  │  │          │  │Logic     │  │Control  │ │              │
│  │  └──────────┘  └──────────┘  └────────┘ │              │
│  └────────────────────┬─────────────────────┘              │
│                       │                                     │
│  ┌────────────────────▼─────────────────────┐              │
│  │           Data Pipeline                   │              │
│  │  ┌──────────┐  ┌──────────┐  ┌────────┐ │              │
│  │  │ Parser   │  │Normalizer│  │ Buffer │ │              │
│  │  └──────────┘  └──────────┘  └────────┘ │              │
│  └────────────────────┬─────────────────────┘              │
│                       │                                     │
│  ┌────────────────────▼─────────────────────┐              │
│  │         Kafka Producer                    │              │
│  │  ┌──────────┐  ┌──────────┐  ┌────────┐ │              │
│  │  │ Batch    │  │ Router   │  │ Retry  │ │              │
│  │  │ Manager  │  │          │  │ Logic  │ │              │
│  │  └──────────┘  └──────────┘  └────────┘ │              │
│  └───────────────────────────────────────────┘              │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐               │
│  │ Metrics Service │    │   API Server    │               │
│  └─────────────────┘    └─────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## 核心模块设计

### 1. Connection Manager（连接管理器）

负责管理 WebSocket 连接池，实现高效的连接复用和故障恢复。

```typescript
interface ConnectionPoolConfig {
  maxConnectionsPerExchange: number;  // 默认 5
  maxStreamsPerConnection: number;    // 默认 1000
  reconnectDelay: number;             // 初始重连延迟 1000ms
  maxReconnectDelay: number;          // 最大重连延迟 30000ms
  heartbeatInterval: number;          // 心跳间隔 30000ms
}

class ConnectionManager {
  private pools: Map<string, WebSocketPool>;
  
  async subscribe(exchange: string, symbols: string[], dataTypes: DataType[]): Promise<void>;
  async unsubscribe(exchange: string, symbols: string[]): Promise<void>;
  getConnectionStats(): ConnectionStats;
}
```

### 2. Data Pipeline（数据处理管道）

实现流式数据处理，包括解析、标准化和缓冲。

```typescript
// 统一的内部数据格式
interface MarketData {
  exchange: string;
  symbol: string;
  timestamp: number;
  type: 'trade' | 'kline' | 'ticker' | 'depth';
  data: TradeData | KlineData | TickerData | DepthData;
}

interface TradeData {
  price: Decimal;
  quantity: Decimal;
  side: 'buy' | 'sell';
  tradeId: string;
  tradeTime: number;
}

interface KlineData {
  interval: string;
  startTime: number;
  endTime: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  trades: number;
  closed: boolean;
}

class DataPipeline {
  constructor(
    private parser: DataParser,
    private normalizer: DataNormalizer,
    private buffer: DataBuffer
  ) {}
  
  async process(rawData: any): Promise<MarketData>;
}
```

### 3. Kafka Producer（Kafka 生产者）

负责将标准化的数据发送到 Kafka，实现批量发送和错误重试。

```typescript
interface KafkaConfig {
  brokers: string[];
  clientId: string;
  batchSize: number;         // 默认 100
  lingerMs: number;          // 默认 100ms
  compressionType: 'gzip' | 'snappy' | 'lz4';
}

class KafkaProducerService {
  async send(data: MarketData): Promise<void>;
  async sendBatch(data: MarketData[]): Promise<void>;
  
  // Topic 路由规则
  private getTopicName(data: MarketData): string {
    // market.{type}.{exchange}.{symbol}
    return `market.${data.type}.${data.exchange}.${data.symbol.toLowerCase()}`;
  }
}
```

### 4. Metrics Service（监控指标服务）

收集和暴露各种运行指标。

```typescript
interface Metrics {
  // 连接指标
  connections: {
    active: number;
    total: number;
    failures: number;
    reconnects: number;
  };
  
  // 数据指标
  messages: {
    received: number;
    processed: number;
    sent: number;
    errors: number;
  };
  
  // 延迟指标
  latency: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  
  // 吞吐量
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
  };
}
```

## 实现计划

### 第一阶段：核心功能（3-5天）
1. 项目初始化和基础架构
2. Binance WebSocket 连接器实现
3. 数据解析和标准化
4. 基础 Kafka 生产者
5. 简单的健康检查 API

### 第二阶段：稳定性增强（3-5天）
1. 连接池管理
2. 自动重连和故障恢复
3. 背压控制和缓冲管理
4. 批量发送优化
5. 错误处理和日志

### 第三阶段：监控和优化（2-3天）
1. Prometheus 指标暴露
2. 延迟监控和分析
3. 性能优化
4. 管理 API 实现
5. Docker 镜像构建

### 第四阶段：生产就绪（2-3天）
1. 配置管理优化
2. 集成测试
3. 压力测试
4. 文档完善
5. 部署脚本

## 配置示例

```yaml
# config/production.yaml
server:
  port: 8080
  
exchanges:
  binance:
    wsEndpoint: wss://stream.binance.com:9443
    symbols:
      - BTC/USDT
      - ETH/USDT
      - BNB/USDT
    dataTypes:
      - trade
      - kline_1m
      - kline_5m
      - kline_1h
    connections:
      max: 5
      streamsPerConnection: 1000
      
kafka:
  brokers:
    - kafka:9092
  producer:
    batchSize: 100
    lingerMs: 100
    compression: gzip
    
monitoring:
  prometheus:
    enabled: true
    port: 9090
  healthCheck:
    interval: 30000
    
logging:
  level: info
  format: json
```

## 性能目标

基于实验数据，设定以下性能目标：

- 支持 100+ 个交易对的实时数据采集
- 平均延迟 < 100ms（从交易所到 Kafka）
- 消息吞吐量 > 10,000 msg/s
- CPU 使用率 < 50%（4核）
- 内存使用 < 1GB
- 连接稳定性 > 99.9%

## 错误处理策略

1. **连接错误**：指数退避重连，最大延迟 30 秒
2. **数据解析错误**：记录错误日志，跳过错误数据
3. **Kafka 发送错误**：本地缓冲 + 重试，超过阈值告警
4. **内存压力**：触发背压，暂停数据接收

## 监控告警

1. 连接断开超过 1 分钟
2. 数据延迟 P95 > 500ms
3. 错误率 > 1%
4. 内存使用 > 80%
5. Kafka 发送失败率 > 0.1%

## 扩展性考虑

1. **多交易所支持**：通过策略模式实现不同交易所的适配器
2. **水平扩展**：通过交易对分片实现多实例部署
3. **数据类型扩展**：插件化的数据解析器
4. **存储扩展**：除 Kafka 外支持其他消息队列