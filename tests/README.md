# 全局测试目录

这个目录现在专门用于跨服务的集成测试和端到端测试。

## 目录结构

```
tests/
├── e2e/                    # 端到端测试
├── integration/            # 跨服务集成测试  
├── fixtures/               # 测试数据和模拟对象
├── setup/                  # 全局测试配置
└── README.md
```

## 单元测试位置

单元测试现在分布在各自的项目中：

- `services/infrastructure/shared-core/tests/` - 共享核心库测试
- `services/infrastructure/adapter-base/tests/` - 适配器基础框架测试
- `services/adapters/binance-adapter/tests/` - Binance适配器测试
- `services/data-collection/exchange-collector/tests/` - 数据收集服务测试

## 运行测试

### 运行所有项目的单元测试
```bash
# 从根目录运行
npm test

# 或分类运行
npm run test:infrastructure  # 基础设施层测试
npm run test:adapters       # 适配器层测试
npm run test:services       # 服务层测试
```

### 运行特定项目的测试
```bash
# 进入项目目录运行
cd services/infrastructure/shared-core
npm test

# 或从根目录使用workspace
npm test -w @pixiu/shared-core
```

### 运行覆盖率测试
```bash
npm run test:coverage
```

### 监视模式
```bash
npm run test:watch
```

## E2E 测试说明

E2E 测试应该测试完整的业务流程，例如：
- 从交易所接收数据到发布到消息队列的完整流程
- 多个服务协同工作的场景
- 系统性能和稳定性测试

## 集成测试说明

集成测试应该测试服务之间的交互，例如：
- Exchange Collector 与 Pub/Sub 的集成
- 适配器与监控系统的集成
- 配置系统与各个服务的集成