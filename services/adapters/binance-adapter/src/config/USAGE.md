# Binance 适配器配置系统使用指南

## 概述

我们为 Binance 适配器设计并实现了一个完整的配置管理系统，包含以下功能：

✅ **配置结构设计** - 完整的配置类型定义和预设  
✅ **配置加载和验证** - 支持文件、环境变量和自动验证  
✅ **环境配置文件** - 开发、测试、生产环境预设  
✅ **Secret Manager 集成** - 安全的 API 凭据管理  
✅ **配置管理器** - 统一的配置管理接口  
✅ **全面测试** - 单元测试覆盖核心功能  

## 快速开始

### 1. 基本配置使用

```typescript
import { createDevelopmentConfig, getEnvironmentConfig } from './config';

// 使用环境预设
const devConfig = createDevelopmentConfig();
console.log('开发环境配置:', devConfig.environment);

// 自动检测环境
const autoConfig = getEnvironmentConfig();
console.log('当前环境:', autoConfig.environment);
```

### 2. 配置管理器使用

```typescript
import { ConfigManager } from './config/manager';

// 创建配置管理器
const configManager = new ConfigManager({
  enableValidation: true,
  enableSecretManager: false // 开发环境可禁用
});

// 初始化
await configManager.initialize();

// 获取配置
const config = configManager.getConfig();
console.log('WebSocket端点:', config.wsEndpoint);

// 获取配置摘要（隐藏敏感信息）
const summary = configManager.getConfigSummary();
console.log('配置摘要:', summary);

// 销毁
configManager.destroy();
```

### 3. 配置验证

```typescript
import { validateConfig } from './config/validator';

const config = createDevelopmentConfig();
const result = validateConfig(config);

if (result.valid) {
  console.log('配置验证通过');
} else {
  console.error('配置错误:', result.errors);
}

// 输出警告
if (result.warnings.length > 0) {
  console.warn('配置警告:', result.warnings);
}
```

### 4. 从文件加载配置

```typescript
import { loadConfig } from './config';

// 从 YAML 配置文件加载
const config = await loadConfig('./config/development.yaml');
console.log('从文件加载的配置:', config.environment);
```

### 5. 环境变量配置

```bash
# 设置环境变量
export NODE_ENV=development
export BINANCE_WS_ENDPOINT=wss://stream.binance.com:9443
export BINANCE_MAX_CONNECTIONS=3
export LOG_LEVEL=debug
```

```typescript
import { loadConfigFromEnv } from './config';

// 加载环境变量配置
const envConfig = loadConfigFromEnv();
console.log('环境变量配置:', envConfig);
```

### 6. Secret Manager 集成

```typescript
import { loadCredentialsFromSecretManager } from './config/secret-manager';

// 从 Secret Manager 加载凭据
try {
  const credentials = await loadCredentialsFromSecretManager(
    'pixiu-trading',
    'binance-api-credentials'
  );
  console.log('凭据加载成功:', !!credentials.apiKey);
} catch (error) {
  console.error('凭据加载失败:', error);
}
```

## 配置文件示例

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
subscriptions:
  defaultSymbols:
    - BTCUSDT
    - ETHUSDT
```

### production.yaml
```yaml
environment: production
wsEndpoint: 'wss://stream.binance.com:9443'
connection:
  maxConnections: 10
  maxStreamsPerConnection: 1000
credentials:
  useSecretManager: true
  secretName: binance-api-credentials
logging:
  level: info
  format: json
```

## 支持的环境变量

| 变量名 | 描述 | 示例值 |
|--------|------|--------|
| `NODE_ENV` | 环境类型 | `development` |
| `BINANCE_WS_ENDPOINT` | WebSocket端点 | `wss://stream.binance.com:9443` |
| `BINANCE_MAX_CONNECTIONS` | 最大连接数 | `5` |
| `BINANCE_USE_SECRET_MANAGER` | 使用Secret Manager | `true` |
| `LOG_LEVEL` | 日志级别 | `debug` |
| `GOOGLE_CLOUD_PROJECT` | GCP项目ID | `pixiu-trading` |

## 配置验证规则

### 连接配置
- `maxConnections`: 1-20
- `maxStreamsPerConnection`: 1-1024 (Binance限制)
- `heartbeatInterval`: 1000-60000ms
- `connectionTimeout`: 5000-60000ms

### 重试配置
- `maxRetries`: 1-1000
- `initialDelay`: 100-10000ms
- `maxDelay`: 必须≥initialDelay
- `backoffMultiplier`: 1.0-10.0

### 订阅配置
- `defaultSymbols`: 非空数组，符号格式如"BTCUSDT"
- `batchSize`: 1-1000
- `batchInterval`: 100-60000ms

## 测试结果

所有核心功能测试已通过：

```
✓ 环境配置创建
✓ 配置验证
✓ 环境变量加载
✓ 配置合并
✓ 自动环境检测
✓ 配置管理器基本功能
✓ 配置摘要生成
✓ 配置更新处理
```

## 最佳实践

1. **环境分离**：为不同环境使用不同的配置文件
2. **配置验证**：始终启用配置验证以捕获错误
3. **凭据安全**：生产环境使用Secret Manager管理敏感信息
4. **监控配置**：监听配置更新事件，记录配置变更
5. **优雅降级**：Secret Manager不可用时降级到配置文件

## 下一步

配置系统已经完成并验证。接下来可以：

1. 继续实现 Binance 适配器的其他组件（订阅管理器、数据解析器等）
2. 集成这个配置系统到现有的连接管理器中
3. 添加更多的监控和度量指标
4. 编写集成测试验证整个系统

## 相关文件

- `src/config/index.ts` - 核心配置接口
- `src/config/validator.ts` - 配置验证器
- `src/config/manager.ts` - 配置管理器
- `src/config/secret-manager.ts` - Secret Manager集成
- `src/config/__tests__/` - 单元测试
- `config/` - 配置文件示例