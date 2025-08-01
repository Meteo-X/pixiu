# Binance 适配器配置系统

这是 Binance 适配器的配置管理系统，提供完整的配置加载、验证、Secret Manager 集成等功能。

## 功能特性

- 📝 **配置结构设计** - 完整的配置类型定义和默认值
- 🔧 **配置加载和验证** - 支持多种配置源和严格验证
- 📁 **多环境支持** - 开发、测试、生产环境预设
- 🔐 **Secret Manager 集成** - 安全的 API 凭据管理
- 🔄 **配置热更新** - 运行时配置更新和事件通知
- 📊 **配置监控** - 配置状态监控和统计

## 文件结构

```
src/config/
├── index.ts           # 核心配置接口和功能
├── validator.ts       # 配置验证器
├── manager.ts         # 配置管理器
├── secret-manager.ts  # Google Secret Manager 集成
├── example.ts         # 使用示例
└── README.md         # 文档
```

## 快速开始

### 1. 基本使用

```typescript
import { loadConfig, getEnvironmentConfig } from './config';

// 自动检测环境并加载配置
const config = getEnvironmentConfig();

// 从文件加载配置
const fileConfig = await loadConfig('./config/development.yaml');
```

### 2. 使用配置管理器

```typescript
import { ConfigManager } from './config/manager';

// 创建配置管理器
const configManager = new ConfigManager({
  configPath: './config/development.yaml',
  enableValidation: true,
  enableSecretManager: true
});

// 初始化
await configManager.initialize();

// 获取配置
const config = configManager.getConfig();

// 获取凭据
const credentials = await configManager.getCredentials();
```

### 3. 配置验证

```typescript
import { validateConfig, validateConfigOrThrow } from './config/validator';

// 验证配置并获取详细结果
const result = validateConfig(config);
if (!result.valid) {
  console.error('配置错误:', result.errors);
}

// 验证配置，失败时抛出异常
validateConfigOrThrow(config);
```

### 4. Secret Manager 集成

```typescript
import { loadCredentialsFromSecretManager } from './config/secret-manager';

// 从 Secret Manager 加载凭据
const credentials = await loadCredentialsFromSecretManager(
  'my-project-id',
  'binance-api-credentials'
);
```

## 配置结构

### 核心配置

```typescript
interface BinanceAdapterConfig {
  wsEndpoint: string;              // WebSocket 端点
  restEndpoint: string;            // REST API 端点
  environment: string;             // 环境标识
  connection: ConnectionConfig;    // 连接配置
  retry: RetryConfig;             // 重试配置
  subscriptions: SubscriptionConfig; // 订阅配置
  logging: LoggingConfig;         // 日志配置
  monitoring: MonitoringConfig;   // 监控配置
  credentials?: BinanceCredentials; // API 凭据
  googleCloud?: GoogleCloudConfig; // Google Cloud 配置
}
```

### 环境变量支持

| 环境变量 | 描述 | 示例 |
|---------|------|------|
| `NODE_ENV` | 环境类型 | `development` |
| `BINANCE_WS_ENDPOINT` | WebSocket 端点 | `wss://stream.binance.com:9443` |
| `BINANCE_REST_ENDPOINT` | REST API 端点 | `https://api.binance.com` |
| `BINANCE_MAX_CONNECTIONS` | 最大连接数 | `5` |
| `BINANCE_MAX_STREAMS_PER_CONNECTION` | 每连接最大流数 | `1000` |
| `BINANCE_USE_SECRET_MANAGER` | 使用 Secret Manager | `true` |
| `BINANCE_SECRET_NAME` | Secret 名称 | `binance-api-credentials` |
| `LOG_LEVEL` | 日志级别 | `debug` |
| `LOG_FORMAT` | 日志格式 | `json` |
| `GOOGLE_CLOUD_PROJECT` | GCP 项目 ID | `pixiu-trading` |
| `PUBSUB_EMULATOR_HOST` | Pub/Sub 模拟器 | `localhost:8085` |

## 配置文件

### development.yaml
```yaml
environment: development
wsEndpoint: 'wss://stream.binance.com:9443'
connection:
  maxConnections: 2
  maxStreamsPerConnection: 50
logging:
  level: debug
  format: text
```

### production.yaml
```yaml
environment: production
wsEndpoint: 'wss://stream.binance.com:9443'
credentials:
  useSecretManager: true
  secretName: binance-api-credentials
logging:
  level: info
  format: json
```

## Secret Manager 配置

### 创建 Secret

```bash
# 创建 secret
gcloud secrets create binance-api-credentials --data-file=credentials.json

# credentials.json 内容示例
{
  "apiKey": "your-api-key",
  "apiSecret": "your-api-secret"
}
```

### Secret 访问权限

```bash
# 授予服务账号访问权限
gcloud secrets add-iam-policy-binding binance-api-credentials \
  --member="serviceAccount:your-service-account@project.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## 配置验证规则

### 连接配置
- `maxConnections`: 1-20
- `maxStreamsPerConnection`: 1-1024 (Binance 限制)
- `heartbeatInterval`: 1000-60000ms
- `connectionTimeout`: 5000-60000ms

### 重试配置
- `maxRetries`: 1-1000
- `initialDelay`: 100-10000ms
- `maxDelay`: 必须 >= initialDelay
- `backoffMultiplier`: 1.0-10.0

### 订阅配置
- `defaultSymbols`: 非空数组，符号格式如 "BTCUSDT"
- `batchSize`: 1-1000
- `batchInterval`: 100-60000ms

## 最佳实践

### 1. 环境分离
- 开发环境：使用本地配置文件，启用详细日志
- 测试环境：使用简化配置，快速失败
- 生产环境：使用 Secret Manager，结构化日志

### 2. 配置验证
- 始终启用配置验证
- 处理验证警告
- 在启动时验证配置

### 3. 凭据管理
- 生产环境使用 Secret Manager
- 开发环境可使用配置文件
- 定期轮换 API 凭据

### 4. 监控配置
- 监听配置更新事件
- 记录配置变更日志
- 设置配置告警

## 常见问题

### Q: 如何在开发环境中使用 Secret Manager？
A: 设置 `GOOGLE_APPLICATION_CREDENTIALS` 环境变量指向服务账号密钥文件，或使用 `gcloud auth application-default login`。

### Q: 配置文件优先级如何？
A: 环境变量 > 配置文件 > 环境预设

### Q: 如何处理配置更新？
A: 使用 ConfigManager 的事件监听器，监听 `CONFIG_UPDATED` 事件。

### Q: 如何调试配置问题？
A: 启用 debug 日志级别，使用 `validateConfig` 获取详细验证信息。

## 示例代码

完整的使用示例请参考 `example.ts` 文件，包含：
- 基本配置加载
- 配置验证
- 配置合并
- 配置管理器使用
- Secret Manager 集成
- 全局配置管理器