# @pixiu/test-utils

Pixiu项目共享测试工具包，提供统一的测试工具、Mock和设置功能，减少重复的测试代码。

## 功能特性

- 🚀 **一键式测试设置** - 统一的测试环境配置
- 🎭 **标准化Mock** - PubSub、WebSocket、环境变量等Mock
- 🔇 **控制台噪音过滤** - 减少测试时的无关输出
- 🧹 **自动资源清理** - 防止Jest挂起和内存泄露
- ⚙️ **灵活配置** - 支持多种预设和自定义配置

## 安装

```bash
npm install @pixiu/test-utils --save-dev
```

## 快速开始

### 基础用法

在测试设置文件中：

```typescript
// tests/setup.ts
import { setupTests } from '@pixiu/test-utils';

// 使用默认配置
setupTests();
```

### Jest配置

在 `jest.config.js` 中添加：

```javascript
module.exports = {
  // ... 其他配置
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
```

## 配置选项

### 预定义配置

```typescript
import { setupTests, SETUP_CONFIGS } from '@pixiu/test-utils';

// 基础配置（推荐）
setupTests(SETUP_CONFIGS.BASIC);

// 静默配置（完全静默）
setupTests(SETUP_CONFIGS.SILENT);

// 最小配置（只设置环境变量）
setupTests(SETUP_CONFIGS.MINIMAL);
```

### 自定义配置

```typescript
import { setupTests } from '@pixiu/test-utils';

setupTests({
  timeout: 15000,
  console: 'errors-only',
  enablePubSubMock: true,
  enableWebSocketMock: false,
  env: {
    NODE_ENV: 'test',
    CUSTOM_VAR: 'test-value'
  },
  customCleanup: () => {
    // 自定义清理逻辑
  }
});
```

## 单独使用Mock

### PubSub Mock

```typescript
import { mockPubSub, createPubSubMock } from '@pixiu/test-utils';

// 自动Mock整个@google-cloud/pubsub模块
mockPubSub();

// 或者手动创建Mock实例
const pubsubMock = createPubSubMock();
```

### WebSocket Mock

```typescript
import { mockWebSocket, createWebSocketMock, createControllableWebSocketMock } from '@pixiu/test-utils';

// 自动Mock ws模块
mockWebSocket();

// 手动创建Mock
const wsMock = createWebSocketMock();

// 创建可控制的Mock（用于测试事件）
const { mock, setState, triggerEvent } = createControllableWebSocketMock();
setState(WS_STATES.CONNECTED);
triggerEvent('message', 'test data');
```

### 环境变量Mock

```typescript
import { envMock, createEnvMock } from '@pixiu/test-utils';

// 使用全局实例
envMock.setup({ NODE_ENV: 'test' });
envMock.set('CUSTOM_VAR', 'value');
envMock.restore();

// 临时设置
envMock.withEnv({ NODE_ENV: 'production' }, () => {
  // 在这个作用域内NODE_ENV为production
});
```

### 控制台Mock

```typescript
import { createConsoleMock, CONSOLE_MOCK_CONFIGS } from '@pixiu/test-utils';

const consoleMock = createConsoleMock(CONSOLE_MOCK_CONFIGS.QUIET);
consoleMock.enable();

// 执行测试...

consoleMock.disable();
```

## 高级用法

### 自定义测试设置类

```typescript
import { createUnifiedSetup } from '@pixiu/test-utils';

const setup = createUnifiedSetup({
  console: 'quiet',
  customCleanup: () => {
    // 项目特定的清理逻辑
  }
});

beforeAll(() => setup.setup());
afterAll(() => setup.cleanup());
```

### 动态配置更新

```typescript
import { globalTestSetup } from '@pixiu/test-utils';

describe('Database Tests', () => {
  beforeAll(() => {
    globalTestSetup.updateConfig({
      env: { DATABASE_URL: 'test-db-url' }
    });
  });
});
```

## API参考

### setupTests(config?)

一键式测试环境设置。

**参数:**
- `config` (可选): `UnifiedSetupConfig` - 配置对象

### UnifiedSetupConfig

```typescript
interface UnifiedSetupConfig {
  timeout?: number;                    // Jest超时时间
  env?: Record<string, string>;        // 环境变量
  enablePubSubMock?: boolean;          // 启用PubSub Mock
  enableWebSocketMock?: boolean;       // 启用WebSocket Mock
  console?: 'quiet' | 'errors-only' | 'silent' | 'normal';
  enableGlobalCacheCleanup?: boolean;  // 启用全局缓存清理
  customCleanup?: () => void;          // 自定义清理函数
}
```

### 预定义配置

- `SETUP_CONFIGS.BASIC` - 基础配置，适用于大部分测试
- `SETUP_CONFIGS.SILENT` - 完全静默的测试环境
- `SETUP_CONFIGS.MINIMAL` - 最小配置，只设置环境变量

## 最佳实践

1. **使用预定义配置**: 优先使用 `SETUP_CONFIGS.BASIC`
2. **避免全局污染**: 在需要特殊配置的测试套件中使用局部设置
3. **及时清理**: 依赖自动清理，但可添加自定义清理逻辑
4. **控制台输出**: 在CI环境中使用 `'silent'` 模式

## 迁移指南

### 从现有测试设置迁移

替换现有的 `tests/setup.ts`:

```typescript
// 之前
jest.setTimeout(10000);
jest.mock('@google-cloud/pubsub', () => ({ /* ... */ }));
process.env.NODE_ENV = 'test';
// ... 更多设置

// 现在
import { setupTests } from '@pixiu/test-utils';
setupTests();
```

## 故障排除

### Jest挂起问题

确保启用了全局缓存清理：

```typescript
setupTests({ enableGlobalCacheCleanup: true });
```

### Mock不生效

确保在导入被Mock的模块之前调用了相应的Mock函数：

```typescript
// 错误
import { PubSub } from '@google-cloud/pubsub';
import { mockPubSub } from '@pixiu/test-utils';
mockPubSub(); // 太晚了

// 正确
import { mockPubSub } from '@pixiu/test-utils';
mockPubSub();
import { PubSub } from '@google-cloud/pubsub';
```

## 贡献

欢迎提交Issue和Pull Request来改进这个工具包。

## 许可证

MIT