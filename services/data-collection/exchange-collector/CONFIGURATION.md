# Exchange Collector 配置说明

本文档说明Exchange Collector服务的配置选项，包括环境变量和配置文件的使用。

## 🚀 快速启动命令

### 在项目根目录运行（推荐）：
```bash
# 预览模式 - 启动Web界面，连接真实Binance数据（推荐用于演示）
npm run preview:exchange-collector

# 开发模式 - 自动重启，适合开发调试
npm run dev:exchange-collector  

# 生产模式 - 启动完整服务，包含PubSub
npm run start:exchange-collector
```

### 在exchange-collector目录运行：
```bash
cd services/data-collection/exchange-collector

# 预览模式
npm run preview

# 开发模式  
npm run dev:standalone

# 标准启动
npm run start:standalone
```

### 访问地址
- **Web界面**: http://localhost:8080
- **健康检查**: http://localhost:8080/health  
- **API接口**: http://localhost:8080/api
- **WebSocket**: ws://localhost:8080/ws

## 🔧 核心配置

### PubSub输出控制

Exchange Collector支持通过环境变量控制是否向Google Cloud Pub/Sub发布数据。

#### 环境变量配置

```bash
# 启用PubSub输出（默认）
PUBSUB_ENABLED=true

# 禁用PubSub输出
PUBSUB_ENABLED=false

# 或使用数字值
PUBSUB_ENABLED=1  # 启用
PUBSUB_ENABLED=0  # 禁用
```

#### 配置优先级

1. **环境变量**: `PUBSUB_ENABLED`
2. **默认值**: `true` (启用)

### 使用示例

#### 1. 启用PubSub输出（默认行为）

```bash
# 方式1: 不设置环境变量（默认启用）
npx ts-node src/standalone.ts

# 方式2: 明确启用
PUBSUB_ENABLED=true npx ts-node src/standalone.ts
```

#### 2. 禁用PubSub输出

```bash
# 禁用PubSub，仅使用WebSocket输出
PUBSUB_ENABLED=false npx ts-node src/standalone.ts
```

#### 3. 使用配置文件

创建 `.env` 文件：

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置
vim .env
```

在 `.env` 文件中设置：

```bash
PUBSUB_ENABLED=false
GOOGLE_CLOUD_PROJECT=your-project-id
PORT=8080
```

然后正常启动服务：

```bash
npx ts-node src/standalone.ts
```

## 📊 运行时状态监控

### API端点检查PubSub状态

```bash
# 检查PubSub配置和状态
curl http://localhost:8080/api/pubsub/status

# 响应示例
{
  "status": {
    "enabled": false,
    "connected": true,
    "messagesPublished": 0,
    "controlledBy": "environment variable",
    "environmentConfig": {
      "PUBSUB_ENABLED": "false",
      "GOOGLE_CLOUD_PROJECT": "pixiu-trading-dev"
    }
  }
}
```

### 运行时切换PubSub状态

```bash
# 运行时禁用PubSub
curl -X POST http://localhost:8080/api/pubsub/toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": false, "reason": "testing"}'

# 运行时启用PubSub
curl -X POST http://localhost:8080/api/pubsub/toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "reason": "production"}'
```

## 🚀 部署场景

### 1. 开发环境 - 仅本地预览

```bash
# 禁用PubSub，减少云服务依赖
PUBSUB_ENABLED=false \
PORT=8080 \
npx ts-node src/standalone.ts
```

### 2. 测试环境 - 部分集成

```bash
# 启用PubSub用于集成测试
PUBSUB_ENABLED=true \
GOOGLE_CLOUD_PROJECT=test-project \
npx ts-node src/standalone.ts
```

### 3. 生产环境 - 完整功能

```bash
# 完整功能，包含PubSub输出
PUBSUB_ENABLED=true \
GOOGLE_CLOUD_PROJECT=production-project \
PORT=8080 \
npx ts-node src/standalone.ts
```

## 📝 日志输出说明

### PubSub启用时

```
🔧 PubSub Output: ENABLED (controlled by PUBSUB_ENABLED=true)
📊 Received 100 messages from Binance (15.2KB total)
📡 Published 100 messages to PubSub
```

### PubSub禁用时

```
🔧 PubSub Output: DISABLED (controlled by PUBSUB_ENABLED=false)
📊 Received 100 messages from Binance (15.2KB total)
⚠️  PubSub output DISABLED - 100 messages skipped
```

## 🔄 配置更新

配置更改需要重启服务才能生效：

```bash
# 停止服务 (Ctrl+C)
# 修改环境变量或.env文件
# 重新启动服务
PUBSUB_ENABLED=false npx ts-node src/standalone.ts
```

## 📋 配置验证

启动服务后，可以通过以下方式验证配置：

1. **查看启动日志**：
   ```
   🔧 PubSub Output: ENABLED/DISABLED (controlled by PUBSUB_ENABLED=...)
   ```

2. **调用API端点**：
   ```bash
   curl http://localhost:8080/api/pubsub/status
   ```

3. **检查消息统计**：
   - PubSub启用：会看到发布消息数量
   - PubSub禁用：会看到跳过的消息提示

## ❗ 注意事项

1. **环境变量优先级**：环境变量会覆盖配置文件设置
2. **默认行为**：如未设置`PUBSUB_ENABLED`，默认启用PubSub输出
3. **运行时切换**：使用API切换的状态不会持久化，重启后恢复配置值
4. **性能影响**：禁用PubSub可以减少云服务调用和网络延迟

## 🔧 故障排除

### 问题1：PubSub认证失败
```bash
# 设置Google Cloud认证
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### 问题2：配置不生效
```bash
# 确认环境变量设置
echo $PUBSUB_ENABLED

# 检查.env文件
cat .env | grep PUBSUB_ENABLED
```

### 问题3：API调用失败
```bash
# 检查服务状态
curl http://localhost:8080/health
```