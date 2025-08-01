# Binance WebSocket 连接管理器架构设计

## 设计目标

基于 Binance 官方 WebSocket 文档规范，设计高可靠、高性能的连接管理器，确保：
1. 严格遵循官方 ping/pong 心跳协议
2. 实现健壮的重连机制和错误处理
3. 支持连接池管理和负载均衡
4. 提供全面的监控和状态管理

## 核心架构

### 1. 层次结构

```
ConnectionManager (连接管理器)
├── ConnectionPool (连接池)
│   ├── BinanceConnection (单个连接)
│   │   ├── HeartbeatManager (心跳管理)
│   │   ├── ReconnectStrategy (重连策略)
│   │   └── ConnectionMonitor (连接监控)
│   └── LoadBalancer (负载均衡器)
├── SubscriptionManager (订阅管理器)
└── EventEmitter (事件发射器)
```

### 2. 核心组件设计

#### ConnectionManager (连接管理器)
- **职责**: 统一管理所有 WebSocket 连接
- **功能**: 连接创建、销毁、订阅分发、状态监控
- **接口**: 对外提供统一的连接管理 API

#### BinanceConnection (单个连接)
- **职责**: 管理单个 WebSocket 连接的完整生命周期
- **功能**: 连接建立、数据收发、心跳处理、错误处理
- **特性**: 支持最多 1024 个数据流

#### HeartbeatManager (心跳管理器)
- **职责**: 严格按照 Binance 官方规范处理心跳
- **功能**: Ping/Pong 处理、超时检测、健康评估
- **规范**: 
  - 服务器每 20 秒发送 ping
  - 客户端必须立即回复 pong 并复制 payload
  - 60 秒无 pong 响应则服务器断开连接

#### ReconnectStrategy (重连策略)
- **职责**: 处理连接断开后的重连逻辑
- **功能**: 指数退避、重试限制、状态恢复
- **配置**: 可配置的重连参数和策略

#### ConnectionMonitor (连接监控器)
- **职责**: 监控连接状态和性能指标
- **功能**: 统计收集、健康检查、告警触发
- **指标**: 延迟、吞吐量、错误率、连接质量

## 详细设计

### 1. 心跳机制设计 (严格按照官方规范)

#### Ping/Pong 处理流程
```typescript
// 服务器 → 客户端: Ping (每 20 秒)
onPing(payload: Buffer) {
  // 1. 记录收到 ping 的时间
  this.lastPingTime = Date.now();
  
  // 2. 立即发送 pong，复制完整 payload
  this.ws.pong(payload);
  
  // 3. 更新心跳统计
  this.heartbeatStats.pingsReceived++;
  this.heartbeatStats.lastPongSentAt = Date.now();
}
```

#### 心跳超时检测
```typescript
// 检测服务器 ping 超时 (25 秒无 ping 视为异常)
private detectPingTimeout() {
  const timeSinceLastPing = Date.now() - this.lastPingTime;
  
  if (timeSinceLastPing > 25000) { // 25 秒
    this.emit('heartbeat_timeout', {
      lastPingTime: this.lastPingTime,
      timeoutDuration: timeSinceLastPing
    });
    
    // 触发重连
    this.scheduleReconnect('HEARTBEAT_TIMEOUT');
  }
}
```

#### 主动 Pong (可选优化)
```typescript
// 每 15 秒发送空 payload 的主动 pong (官方允许)
private sendUnsolicitedPong() {
  if (this.ws.readyState === WebSocket.OPEN) {
    this.ws.pong(); // 空 payload
    this.heartbeatStats.unsolicitedPongsSent++;
  }
}
```

### 2. 连接生命周期管理

#### 状态机设计
```typescript
enum ConnectionState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATING = 'authenticating',  // 如果需要认证
  SUBSCRIBING = 'subscribing',
  ACTIVE = 'active',
  HEARTBEAT_FAILED = 'heartbeat_failed',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  TERMINATED = 'terminated'
}
```

#### 状态转换逻辑
```typescript
// 连接建立成功
CONNECTING → CONNECTED → SUBSCRIBING → ACTIVE

// 心跳失败
ACTIVE → HEARTBEAT_FAILED → RECONNECTING → CONNECTING

// 正常断开
ACTIVE → DISCONNECTING → DISCONNECTED

// 异常断开
ACTIVE → ERROR → RECONNECTING → CONNECTING
```

### 3. 重连策略设计

#### 指数退避算法 (基于官方建议)
```typescript
interface ReconnectConfig {
  initialDelay: 1000,      // 初始延迟 1 秒
  maxDelay: 30000,         // 最大延迟 30 秒  
  backoffMultiplier: 2.0,  // 退避倍数
  maxRetries: 50,          // 最大重试次数
  jitter: true,            // 添加随机性避免雷群效应
  resetAfter: 300000       // 5 分钟成功连接后重置计数器
}
```

#### 重连触发条件
1. **网络错误**: 连接断开、网络超时
2. **心跳超时**: 25 秒未收到服务器 ping
3. **协议错误**: WebSocket 协议级别错误
4. **服务器断开**: 正常的服务器主动断开

### 4. 连接池管理

#### 池化策略
```typescript
interface ConnectionPoolConfig {
  maxConnections: 10,           // 最大连接数
  maxStreamsPerConnection: 1000, // 每连接最大流数 (低于 1024 限制)
  connectionTimeout: 30000,      // 连接超时
  idleTimeout: 300000,          // 空闲超时 (5 分钟)
  healthCheckInterval: 60000    // 健康检查间隔
}
```

#### 负载均衡算法
1. **最少连接**: 选择订阅数最少的连接
2. **连接质量**: 优先选择延迟低、稳定性好的连接  
3. **流量均衡**: 避免单个连接过载

### 5. 监控和指标

#### 核心指标
```typescript
interface ConnectionMetrics {
  // 连接指标
  connectionAttempts: number;
  successfulConnections: number;
  failedConnections: number;
  currentConnections: number;
  
  // 心跳指标
  pingsReceived: number;
  pongsSent: number;
  unsolicitedPongsSent: number;
  heartbeatTimeouts: number;
  avgPongResponseTime: number;
  
  // 性能指标
  messagesReceived: number;
  bytesReceived: number;
  avgLatency: number;
  p95Latency: number;
  
  // 错误指标
  reconnectAttempts: number;
  totalErrors: number;
  errorsByType: Record<string, number>;
}
```

#### 健康评分算法
```typescript
function calculateConnectionHealth(stats: ConnectionStats): number {
  const factors = {
    uptime: Math.min(stats.uptime / 3600000, 1.0),        // 运行时间 (小时)
    latency: Math.max(0, 1 - stats.avgLatency / 200),     // 延迟质量
    heartbeat: 1 - stats.heartbeatTimeouts / 100,         // 心跳质量
    errors: Math.max(0, 1 - stats.errorRate)              // 错误率
  };
  
  const weights = { uptime: 0.2, latency: 0.3, heartbeat: 0.3, errors: 0.2 };
  
  return Object.entries(factors).reduce(
    (score, [key, value]) => score + value * weights[key], 0
  );
}
```

## 实现计划

### Phase 1: 核心接口定义
- [ ] 定义 ConnectionManager 接口
- [ ] 定义 BinanceConnection 接口
- [ ] 定义事件系统和错误类型

### Phase 2: HeartbeatManager 实现
- [ ] 实现严格的 Ping/Pong 处理
- [ ] 实现超时检测机制
- [ ] 实现健康状态评估

### Phase 3: 连接生命周期管理
- [ ] 实现状态机
- [ ] 实现重连策略
- [ ] 实现优雅关闭

### Phase 4: 连接池和负载均衡
- [ ] 实现连接池管理
- [ ] 实现负载均衡算法
- [ ] 实现订阅管理

### Phase 5: 监控和优化
- [ ] 实现指标收集
- [ ] 实现健康检查
- [ ] 性能调优和测试

## 配置示例

```yaml
connectionManager:
  pool:
    maxConnections: 5
    maxStreamsPerConnection: 1000
    connectionTimeout: 30000
    
  heartbeat:
    pingTimeoutThreshold: 25000  # 25 秒无 ping 视为超时
    unsolicitedPongInterval: 15000  # 15 秒发送主动 pong
    healthCheckInterval: 5000    # 5 秒检查一次心跳健康
    
  reconnect:
    initialDelay: 1000
    maxDelay: 30000
    backoffMultiplier: 2.0
    maxRetries: 50
    jitter: true
    
  monitoring:
    metricsInterval: 10000       # 10 秒更新一次指标
    healthScoreThreshold: 0.8    # 健康分数阈值
    alertOnHealthDrop: true      # 健康状况下降时告警
```

## 总结

这个重新设计的架构确保了：
1. ✅ **严格遵循官方规范** - 准确的 ping/pong 处理
2. ✅ **高可靠性** - 完善的重连和错误处理
3. ✅ **高性能** - 连接池和负载均衡
4. ✅ **可观测性** - 全面的监控和指标
5. ✅ **可扩展性** - 模块化设计，易于扩展和维护

基于这个设计，我们可以构建一个生产级别的 WebSocket 连接管理器。