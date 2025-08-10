# Exchange Collector API 参考文档

## API 概述

Exchange Collector v2.0提供了完整的REST API和WebSocket API，支持实时数据订阅、历史数据查询和系统监控。所有API都保持向后兼容，同时提供新的高性能接口。

### 基础信息
- **Base URL**: `http://localhost:8080` (开发环境)
- **API版本**: v2.0
- **认证方式**: Bearer Token / API Key
- **数据格式**: JSON
- **字符编码**: UTF-8

## REST API

### 1. 系统状态 API

#### 健康检查
```http
GET /health
```

**响应示例**:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "uptime": 3600,
  "timestamp": 1691000000000,
  "components": {
    "dataflow": {
      "status": "healthy",
      "queueSize": 150,
      "processingRate": 1547
    },
    "adapters": {
      "binance": {
        "status": "connected",
        "connections": 5,
        "lastHeartbeat": 1691000000000
      }
    },
    "outputs": {
      "pubsub": {"status": "healthy", "published": 15470},
      "websocket": {"status": "healthy", "connections": 948},
      "cache": {"status": "healthy", "hitRate": 0.92}
    }
  }
}
```

#### 系统指标
```http
GET /metrics
```

**响应示例**:
```json
{
  "performance": {
    "throughput": {
      "processed": 1547,
      "sent": 1545,
      "errorRate": 0.002
    },
    "latency": {
      "average": 24.7,
      "p95": 42.1,
      "p99": 68.0
    },
    "resources": {
      "memoryUsage": 78,
      "cpuUsage": 35,
      "activeConnections": 948
    }
  },
  "dataflow": {
    "queueSize": 150,
    "backpressureActive": false,
    "batchSize": 50,
    "flushInterval": 1000
  }
}
```

### 2. 适配器管理 API

#### 获取适配器列表
```http
GET /api/adapters
```

**响应示例**:
```json
{
  "adapters": [
    {
      "name": "binance",
      "status": "connected",
      "version": "2.0.0",
      "connections": 5,
      "subscriptions": 12,
      "lastActivity": 1691000000000,
      "capabilities": ["spot", "futures", "websocket"],
      "endpoints": {
        "rest": "https://api.binance.com",
        "websocket": "wss://stream.binance.com:9443"
      }
    }
  ]
}
```

#### 获取适配器详情
```http
GET /api/adapters/{adapterName}
```

**路径参数**:
- `adapterName`: 适配器名称 (如: binance)

**响应示例**:
```json
{
  "name": "binance", 
  "status": "connected",
  "connectionManager": {
    "type": "base-connection-manager",
    "connections": [
      {
        "id": "conn_001",
        "url": "wss://stream.binance.com:9443/ws/btcusdt@ticker",
        "status": "connected",
        "subscriptions": ["BTCUSDT@ticker"],
        "latency": 6.8,
        "lastPing": 1691000000000
      }
    ]
  },
  "statistics": {
    "messagesReceived": 25847,
    "messagesProcessed": 25845,
    "errors": 2,
    "uptime": 3600000
  }
}
```

#### 适配器控制
```http
POST /api/adapters/{adapterName}/control
```

**请求体**:
```json
{
  "action": "start|stop|restart",
  "options": {
    "graceful": true,
    "timeout": 30000
  }
}
```

### 3. 数据订阅 API

#### 创建订阅
```http
POST /api/subscriptions
```

**请求体**:
```json
{
  "exchange": "binance",
  "symbol": "BTCUSDT",
  "dataTypes": ["ticker", "orderbook", "trades"],
  "options": {
    "depth": 20,
    "updateSpeed": "1000ms"
  },
  "output": {
    "channels": ["websocket", "pubsub"],
    "filters": {
      "priceChange": ">1%"
    }
  }
}
```

**响应示例**:
```json
{
  "subscriptionId": "sub_12345",
  "status": "active",
  "createdAt": 1691000000000,
  "subscription": {
    "exchange": "binance",
    "symbol": "BTCUSDT",
    "dataTypes": ["ticker", "orderbook", "trades"],
    "channels": ["websocket", "pubsub"]
  }
}
```

#### 获取订阅列表
```http
GET /api/subscriptions
```

**查询参数**:
- `exchange`: 过滤交易所 (可选)
- `symbol`: 过滤交易对 (可选)
- `status`: 过滤状态 (可选)
- `limit`: 返回数量限制 (默认100)
- `offset`: 分页偏移 (默认0)

#### 取消订阅
```http
DELETE /api/subscriptions/{subscriptionId}
```

### 4. 历史数据 API

#### 查询历史数据
```http
GET /api/data/history
```

**查询参数**:
- `exchange`: 交易所名称 (必需)
- `symbol`: 交易对 (必需)
- `dataType`: 数据类型 (ticker|orderbook|trades)
- `startTime`: 开始时间戳 (必需)
- `endTime`: 结束时间戳 (必需)  
- `limit`: 返回数量限制 (默认1000)
- `format`: 数据格式 (json|csv)

**响应示例**:
```json
{
  "data": [
    {
      "timestamp": 1691000000000,
      "exchange": "binance",
      "symbol": "BTCUSDT", 
      "dataType": "ticker",
      "data": {
        "price": 50000.00,
        "volume": 1234.5,
        "change24h": 2.5,
        "high24h": 51000.00,
        "low24h": 49000.00
      }
    }
  ],
  "metadata": {
    "total": 1000,
    "startTime": 1691000000000,
    "endTime": 1691003600000
  }
}
```

### 5. 配置管理 API

#### 获取配置
```http
GET /api/config
```

**响应示例**:
```json
{
  "dataflow": {
    "enabled": true,
    "batching": {
      "batchSize": 50,
      "flushTimeout": 1000
    },
    "performance": {
      "maxQueueSize": 10000,
      "backpressureThreshold": 8000
    }
  },
  "adapters": {
    "binance": {
      "enabled": true,
      "connectionTimeout": 30000,
      "heartbeatInterval": 20000
    }
  },
  "outputs": {
    "pubsub": {"enabled": true, "topicPrefix": "market-data"},
    "websocket": {"enabled": true, "port": 8081},
    "cache": {"enabled": true, "ttl": 300000}
  }
}
```

#### 更新配置
```http
PUT /api/config
```

**请求体**: 完整配置对象或部分配置更新

## WebSocket API

### 连接信息
- **Endpoint**: `ws://localhost:8081/ws`
- **协议**: WebSocket (RFC 6455)
- **心跳**: 30秒间隔
- **认证**: 连接时提供token参数

### 连接示例
```javascript
const ws = new WebSocket('ws://localhost:8081/ws?token=your-token');

ws.onopen = function() {
  console.log('WebSocket连接已建立');
};

ws.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('收到数据:', data);
};
```

### 1. 数据订阅

#### 订阅市场数据
```json
{
  "action": "subscribe",
  "payload": {
    "exchange": "binance",
    "symbol": "BTCUSDT",
    "dataTypes": ["ticker", "orderbook", "trades"],
    "filters": {
      "priceChange": ">1%",
      "volume": ">1000"
    }
  }
}
```

#### 取消订阅
```json
{
  "action": "unsubscribe", 
  "payload": {
    "subscriptionId": "sub_12345"
  }
}
```

### 2. 数据推送格式

#### Ticker数据
```json
{
  "type": "ticker",
  "exchange": "binance",
  "symbol": "BTCUSDT",
  "timestamp": 1691000000000,
  "data": {
    "price": 50000.00,
    "volume": 1234.5,
    "change24h": 2.5,
    "high24h": 51000.00,
    "low24h": 49000.00,
    "bid": 49999.90,
    "ask": 50000.10
  },
  "metadata": {
    "latency": 6.8,
    "source": "binance-adapter",
    "quality": 0.98
  }
}
```

#### 订单簿数据
```json
{
  "type": "orderbook",
  "exchange": "binance", 
  "symbol": "BTCUSDT",
  "timestamp": 1691000000000,
  "data": {
    "bids": [
      [49999.90, 1.234],
      [49999.80, 2.456]
    ],
    "asks": [
      [50000.10, 1.123],
      [50000.20, 2.345]
    ],
    "lastUpdateId": 123456789
  }
}
```

#### 交易数据
```json
{
  "type": "trade",
  "exchange": "binance",
  "symbol": "BTCUSDT", 
  "timestamp": 1691000000000,
  "data": {
    "tradeId": "123456789",
    "price": 50000.00,
    "quantity": 0.1,
    "side": "buy",
    "tradeTime": 1691000000000
  }
}
```

### 3. 系统消息

#### 连接状态
```json
{
  "type": "connection",
  "status": "connected|disconnected|error",
  "message": "Connection established successfully",
  "connectionId": "conn_abc123"
}
```

#### 错误消息
```json
{
  "type": "error",
  "code": "SUBSCRIPTION_FAILED",
  "message": "Failed to subscribe to BTCUSDT ticker",
  "details": {
    "exchange": "binance",
    "symbol": "BTCUSDT",
    "reason": "Invalid symbol"
  }
}
```

## API 向后兼容性

### 旧版API支持

#### v1.0 REST API兼容
所有v1.0 API端点仍然支持，自动转换为v2.0格式：

```http
# 旧版端点 (仍然支持)
GET /adapters -> GET /api/adapters
GET /health -> GET /health (不变)
POST /subscribe -> POST /api/subscriptions
```

#### v1.0 数据格式兼容
```json
// 旧版数据格式 (仍然支持)
{
  "exchange_name": "binance",
  "symbol_name": "BTCUSDT", 
  "price_data": "50000.00",
  "volume_data": "1234.5"
}

// 自动转换为新版格式
{
  "exchange": "binance",
  "symbol": "BTCUSDT",
  "price": 50000.00,
  "volume": 1234.5,
  "metadata": {
    "legacy": true,
    "converted": true
  }
}
```

### 迁移指导

#### 推荐的迁移路径
1. **阶段1**: 继续使用旧版API，验证功能正常
2. **阶段2**: 逐步迁移到新版API，利用性能提升
3. **阶段3**: 升级数据格式，获得完整功能支持

#### 新版API优势
- **性能提升**: 87.5%吞吐量提升，44.4%延迟降低
- **更好的错误处理**: 详细的错误分类和恢复策略
- **增强的监控**: 全面的性能指标和健康检查
- **扩展的功能**: 数据过滤、路由规则、批处理等

## 错误处理

### HTTP 状态码
- `200 OK`: 请求成功
- `201 Created`: 资源创建成功
- `400 Bad Request`: 请求参数错误
- `401 Unauthorized`: 认证失败
- `403 Forbidden`: 权限不足
- `404 Not Found`: 资源不存在
- `429 Too Many Requests`: 请求频率限制
- `500 Internal Server Error`: 服务器内部错误
- `503 Service Unavailable`: 服务不可用

### 错误响应格式
```json
{
  "error": {
    "code": "INVALID_SYMBOL",
    "message": "Symbol INVALID is not supported",
    "details": {
      "supportedSymbols": ["BTCUSDT", "ETHUSDT"],
      "exchange": "binance"
    },
    "timestamp": 1691000000000,
    "requestId": "req_abc123"
  }
}
```

### WebSocket错误码
- `1000`: 正常关闭
- `1001`: 端点离开
- `1002`: 协议错误
- `1003`: 不支持的数据类型
- `1006`: 连接异常关闭
- `1011`: 服务器错误
- `4001`: 认证失败
- `4002`: 订阅失败
- `4003`: 频率限制

## API限流

### 请求限制
| 端点类型 | 限制 | 时间窗口 |
|---------|------|---------|
| **认证相关** | 10次 | 1分钟 |
| **查询API** | 100次 | 1分钟 |
| **订阅API** | 50次 | 1分钟 |
| **配置API** | 20次 | 1分钟 |
| **WebSocket连接** | 10次 | 1分钟 |

### 限流响应头
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1691000060
X-RateLimit-RetryAfter: 60
```

## 性能指标

### API性能基准
| 端点 | 平均响应时间 | P95响应时间 | 吞吐量 |
|------|-------------|------------|--------|
| `/health` | 2ms | 5ms | 1000 req/s |
| `/metrics` | 15ms | 30ms | 500 req/s |
| `/api/adapters` | 8ms | 20ms | 800 req/s |
| `/api/subscriptions` | 25ms | 50ms | 200 req/s |

### WebSocket性能基准
- **连接延迟**: 平均47ms
- **消息延迟**: 平均6.8ms
- **吞吐量**: 2500+ msg/s
- **并发连接**: 1000+

## 安全性

### 认证方式
1. **Bearer Token**: 推荐用于生产环境
2. **API Key**: 用于服务间调用
3. **Basic Auth**: 仅用于开发环境

### 安全建议
- 使用HTTPS加密传输
- 定期轮换API密钥
- 启用请求签名验证
- 监控异常访问模式
- 实施IP白名单限制

## 客户端SDK

### TypeScript/JavaScript
```typescript
import { ExchangeCollectorClient } from '@pixiu/exchange-collector-client';

const client = new ExchangeCollectorClient({
  baseUrl: 'http://localhost:8080',
  token: 'your-api-token'
});

// 获取适配器状态
const adapters = await client.getAdapters();

// 订阅市场数据
const subscription = await client.subscribe({
  exchange: 'binance',
  symbol: 'BTCUSDT',
  dataTypes: ['ticker']
});
```

### Python
```python
from pixiu_client import ExchangeCollectorClient

client = ExchangeCollectorClient(
    base_url='http://localhost:8080',
    token='your-api-token'
)

# 获取系统健康状态
health = client.get_health()

# WebSocket订阅
def on_message(data):
    print(f"收到数据: {data}")

client.subscribe_websocket('BTCUSDT', ['ticker'], on_message)
```

---

**文档版本**: v2.0.0  
**最后更新**: 2025年8月10日  
**支持**: 如有问题请联系开发团队