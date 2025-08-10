# BinanceAdapter 测试套件使用指南

本文档描述了重构后BinanceAdapter的全面测试套件，包括测试结构、运行方法和覆盖范围。

## 测试套件结构

```
tests/
├── README.md                           # 测试使用指南
├── jest-setup.ts                       # Jest全局设置
├── setup.ts                           # 测试环境设置
├── binance-adapter.test.ts             # 原有基础测试
├── binance-adapter-refactored.test.ts  # 重构后适配器测试
├── backward-compatibility.test.ts      # 向后兼容性测试
├── integration.test.ts                 # 集成和端到端测试
├── error-handling.test.ts              # 错误处理和边界测试
├── performance.test.ts                 # 性能和稳定性测试
├── connection/
│   └── binance-connection-manager.test.ts  # 连接管理器测试
├── mocks/
│   └── websocket-mock.ts               # WebSocket Mock工具
└── fixtures/
    └── test-data.ts                    # 测试数据固件
```

## 测试分类

### 1. 单元测试 (Unit Tests)
- **BinanceConnectionManager**: 测试Binance特定的连接管理功能
- **BinanceAdapter**: 测试重构后的适配器核心功能
- **向后兼容性**: 确保API接口和行为保持兼容
- **错误处理**: 各种错误情况和边界条件

### 2. 集成测试 (Integration Tests)
- **框架集成**: 验证与adapter-base框架的集成
- **端到端流程**: 完整的初始化→连接→订阅→数据流→断开流程
- **多实例测试**: 多个适配器实例并发工作

### 3. 性能测试 (Performance Tests)
- **消息处理性能**: 高频消息流处理能力
- **内存使用**: 长时间运行的内存稳定性
- **连接稳定性**: 长时间连接保持和状态管理
- **并发性能**: 并发操作的处理效率

## 运行测试

### 基本测试命令

```bash
# 运行所有测试
npm test

# 运行特定类别的测试
npm run test:unit          # 单元测试
npm run test:integration   # 集成测试
npm run test:performance   # 性能测试
npm run test:all          # 所有测试

# 运行并生成覆盖率报告
npm run test:coverage

# 监视模式运行测试
npm run test:watch

# CI环境测试（无监视）
npm run test:ci
```

### 高级测试命令

```bash
# 调试模式（串行运行）
npm run test:debug

# 内存分析模式
npm run test:memory

# 运行特定测试文件
npx jest tests/binance-connection-manager.test.ts

# 运行特定测试用例
npx jest --testNamePattern="应该正确解析交易数据"

# 详细输出模式
npx jest --verbose

# 更新快照
npx jest --updateSnapshot
```

## 覆盖率要求

测试套件设定了严格的覆盖率目标：

- **全局覆盖率**: 85% branches, 90% functions, 88% lines/statements
- **BinanceAdapter**: 85% branches, 90% functions, 90% lines/statements
- **BinanceConnectionManager**: 80% branches, 85% functions, 85% lines/statements

## 测试工具和Mock

### WebSocket Mock
提供了完整的WebSocket模拟功能：

```typescript
import { MockWebSocket, setupGlobalWebSocketMock } from './mocks/websocket-mock';

// 设置全局Mock
setupGlobalWebSocketMock({
  connectionDelay: 50,
  shouldFailConnection: false
});

// 使用特定Mock
const ws = new MockWebSocket('wss://test.com', [], {
  shouldFailConnection: true
});
```

### 测试数据固件
包含标准的测试数据：

```typescript
import { BinanceTestMessages, ConfigFixtures } from './fixtures/test-data';

// 使用预定义的消息数据
const tradeMessage = BinanceTestMessages.trade.valid;

// 使用配置固件
const config = ConfigFixtures.basicValid;
```

### 测试工具函数
全局测试工具函数：

```typescript
// 等待指定时间
await global.testUtils.wait(1000);

// 等待条件满足
await global.testUtils.waitFor(() => adapter.getStatus() === 'connected');

// 性能测量
const { result, metrics } = await global.testUtils.measurePerformance(async () => {
  return await adapter.subscribe(config);
});
```

## 测试最佳实践

### 1. 测试隔离
- 每个测试用例都是独立的，不依赖其他测试的状态
- 使用beforeEach/afterEach进行适当的设置和清理
- 避免共享可变状态

### 2. 异步测试
- 正确处理Promise和async/await
- 使用适当的超时设置
- 模拟真实的异步行为

### 3. Mock使用
- 使用提供的Mock工具而不是简单的jest.fn()
- 模拟真实的WebSocket行为和生命周期
- 验证Mock的调用和参数

### 4. 错误测试
- 测试所有可能的错误路径
- 验证错误消息和错误类型
- 确保资源得到正确清理

### 5. 性能测试
- 设置合理的性能基准
- 监控内存使用和CPU占用
- 测试极端情况和边界条件

## 调试测试

### 常见问题排查

1. **测试超时**: 检查异步操作和Mock设置
2. **内存泄漏**: 确保正确清理WebSocket连接和事件监听器
3. **Mock不工作**: 验证Mock的设置顺序和作用域
4. **随机失败**: 检查时间依赖和竞态条件

### 调试技巧

```bash
# 运行单个测试文件并输出详细信息
npx jest tests/integration.test.ts --verbose --no-cache

# 使用Node调试器
node --inspect-brk ./node_modules/.bin/jest tests/performance.test.ts

# 启用详细的Jest输出
DEBUG=jest* npm test
```

## CI/CD集成

测试套件完全支持CI/CD环境：

```bash
# CI环境运行命令
npm run test:ci

# 生成测试报告
npm run test:coverage -- --coverageReporters=lcov --coverageReporters=text-summary
```

### CI环境特殊配置
- 自动检测CI环境并调整超时时间
- 支持并行测试执行
- 生成适合CI的测试报告格式

## 贡献指南

### 添加新测试
1. 选择合适的测试文件或创建新文件
2. 使用提供的Mock工具和测试数据
3. 确保测试覆盖率符合要求
4. 添加适当的文档和注释

### 测试命名约定
- 测试文件: `*.test.ts`
- 测试描述: 使用中文描述预期行为
- 测试分组: 使用describe块进行逻辑分组

### 代码审查要点
- 测试覆盖了所有重要的代码路径
- Mock和测试数据的使用是合适的
- 测试是独立和可重现的
- 性能测试有合理的基准

## 维护和更新

### 定期维护任务
- 更新测试依赖
- 检查和调整性能基准
- 清理过时的测试代码
- 更新文档和示例

### 监控测试质量
- 定期检查测试覆盖率报告
- 分析测试执行时间趋势
- 监控CI中的测试稳定性
- 收集和处理测试反馈

通过遵循这个测试指南，可以确保BinanceAdapter的质量和稳定性，同时为未来的开发和维护提供坚实的基础。