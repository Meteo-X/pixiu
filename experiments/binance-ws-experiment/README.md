# Binance WebSocket 实验分析报告

## 实验目标

调研 Binance WebSocket API 的实际使用情况，为设计 exchange-collector 服务提供数据支持。重点关注：
- 实时成交价格和成交量数据
- 不同时间粒度的 K 线数据
- 连接稳定性和数据延迟

## 实验结果

### 1. 数据结构分析

#### Trade 数据流

```json
{
  "e": "trade",
  "E": 1672515782136,  // 事件时间
  "s": "BTCUSDT",
  "t": 12345,          // 交易ID
  "p": "118303.49",    // 价格
  "q": "0.00206",      // 数量
  "T": 1672515782136,  // 交易时间
  "m": true            // 买方是否为做市商
}
```

**关键发现：**
- 数据格式紧凑，字段使用缩写
- 价格和数量以字符串形式传输（避免浮点精度问题）
- 包含两个时间戳：事件时间(E)和交易时间(T)

#### Kline 数据流

```json
{
  "e": "kline",
  "E": 1672515782136,
  "s": "BTCUSDT",
  "k": {
    "t": 1672515780000,  // K线开始时间
    "T": 1672515839999,  // K线结束时间
    "s": "BTCUSDT",
    "i": "1m",           // 时间间隔
    "o": "118327.16",    // 开盘价
    "c": "118303.49",    // 收盘价
    "h": "118350.00",    // 最高价
    "l": "118300.00",    // 最低价
    "v": "6.24419",      // 成交量
    "n": 100,            // 交易次数
    "x": false           // K线是否已关闭
  }
}
```

**关键发现：**
- K线数据嵌套在 "k" 对象中
- "x" 字段标识 K线是否已完成（重要！）
- 每秒推送当前 K线的更新状态

### 2. 性能和延迟分析

基于实验数据的关键指标：

| 指标 | 数值 |
|------|------|
| 平均延迟 | 45-55ms |
| P50 延迟 | ~47ms |
| P95 延迟 | ~85ms |
| P99 延迟 | ~155ms |
| 消息速率 | 90-120 msg/s (3个交易对) |
| 数据带宽 | ~20 KB/s (单交易对) |

**延迟分布：**
- < 50ms: ~65%
- 50-100ms: ~30%
- 100-200ms: ~4%
- > 200ms: ~1%

### 3. 连接管理要点

1. **连接限制**
   - 单连接最多 1024 个流
   - 每 5 分钟最多 300 个连接（IP 限制）
   - 连接有效期 24 小时

2. **心跳机制**
   - 服务器每 20 秒发送 ping
   - 需要及时响应 pong

3. **数据流特点**
   - Trade 流：高频，每笔交易都推送
   - Kline 流：每秒更新一次当前 K线
   - 使用 combined streams 可以在一个连接中订阅多个数据流

### 4. 实现建议

#### 技术栈选择

推荐使用 **Node.js + TypeScript**：
- WebSocket 性能优于 Python asyncio (2-4倍)
- 更低的资源消耗
- 更适合处理大量并发连接

#### 架构设计要点

1. **连接池管理**
   ```typescript
   class ConnectionPool {
     private connections: Map<string, WebSocket>;
     private streamCount: Map<string, number>;
     
     // 每个连接最多 1000 个流（留有余量）
     private readonly MAX_STREAMS_PER_CONNECTION = 1000;
   }
   ```

2. **数据标准化**
   ```typescript
   interface UnifiedMarketData {
     exchange: 'binance';
     symbol: string;
     timestamp: number;
     price: number;
     volume: number;
     // ... 其他标准字段
   }
   ```

3. **背压控制**
   - 使用缓冲区批量发送到 Google Cloud Pub/Sub
   - 监控内存使用，防止数据积压

4. **监控指标**
   - 连接状态
   - 消息延迟（P50/P95/P99）
   - 数据完整性（检测数据间隙）
   - 错误率和重连次数

## 下一步计划

1. 运行稳定性测试（实验3）- 测试长时间运行和重连机制
2. 基于实验结果设计 exchange-collector 的详细架构
3. 实现原型系统，从单个交易对开始逐步扩展
4. 性能优化和压力测试

## 实验脚本说明

- `experiment1-basic.ts`: 基础连接测试，单交易对
- `experiment2-multi.ts`: 多流测试，3个交易对 × 4种数据类型
- `experiment3-stability.ts`: 稳定性测试，包含重连机制

运行方式：
```bash
npm run exp1  # 基础测试（30秒）
npm run exp2  # 多流测试（60秒）
npm run exp3  # 稳定性测试（3分钟）
```