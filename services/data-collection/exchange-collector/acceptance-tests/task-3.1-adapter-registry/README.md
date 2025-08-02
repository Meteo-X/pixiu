# Task 3.1 适配器注册系统 - 验收测试套件

这是针对 Task 3.1 "适配器注册系统" 的全面验收测试套件，旨在验证适配器注册中心的所有核心功能和非功能性需求。

## 📋 测试范围

### 核心功能验证
1. **适配器静态加载机制** - 启动时根据配置加载适配器
2. **适配器注册管理器** - 适配器注册、注销和元数据管理
3. **适配器生命周期管理** - 实例创建、启动、停止和销毁
4. **适配器状态监控** - 健康检查、指标收集和状态通知

### API合约验证
- 健康检查 API (`/health`, `/health/ready`, `/health/live`)
- 指标 API (`/metrics`, `/metrics/json`)
- 适配器管理 API (`/api/adapters/*`)

### 质量保证
- **集成测试** - 组件交互和端到端场景
- **性能测试** - 负载测试和性能基准
- **回归测试** - 接口稳定性和向后兼容性
- **安全测试** - 访问控制和输入验证

## 🏗️ 测试架构

```
acceptance-tests/task-3.1-adapter-registry/
├── tests/
│   ├── acceptance/           # 需求验收测试
│   │   ├── requirements.test.ts      # 核心需求验证
│   │   └── api-contracts.test.ts     # API合约测试
│   ├── integration/          # 集成测试
│   │   ├── component-integration.test.ts    # 组件集成
│   │   └── system-integration.test.ts       # 系统集成
│   ├── performance/          # 性能测试
│   │   └── load-tests.test.ts              # 负载测试
│   ├── regression/           # 回归测试
│   │   └── interface-stability.test.ts     # 接口稳定性
│   └── security/             # 安全测试
│       └── access-control.test.ts          # 访问控制
├── fixtures/                 # 测试固件
│   ├── config-samples/       # 配置样本
│   ├── test-data/           # 测试数据
│   ├── helpers/             # 测试辅助工具
│   └── mock-services/       # 模拟服务
├── reports/                 # 测试报告
└── coverage/                # 覆盖率报告
```

## 🚀 快速开始

### 先决条件

1. **Node.js 18+** - JavaScript 运行时
2. **Docker** - 用于运行 Pub/Sub 模拟器
3. **依赖服务** - Exchange Collector 服务及其依赖

### 安装依赖

```bash
cd acceptance-tests/task-3.1-adapter-registry
npm install
```

### 启动依赖服务

```bash
# 启动 Pub/Sub 模拟器
docker run -d --name pubsub-emulator -p 8085:8085 \
  gcr.io/google.com/cloudsdktool/cloud-sdk:emulators \
  gcloud beta emulators pubsub start --host-port=0.0.0.0:8085

# 验证模拟器运行
curl http://localhost:8085
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试套件
npm run test:requirements      # 需求验收测试
npm run test:api-contracts     # API合约测试
npm run test:integration       # 集成测试
npm run test:performance       # 性能测试
npm run test:regression        # 回归测试
npm run test:security          # 安全测试

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监视模式
npm run test:watch

# CI 模式
npm run test:ci
```

## 📊 测试报告

### 覆盖率报告

```bash
npm run test:coverage
# 报告生成在 coverage/ 目录
open coverage/lcov-report/index.html
```

### HTML 测试报告

```bash
npm test
# 报告生成在 reports/ 目录
open reports/test-report.html
```

### 性能基准报告

测试运行时会自动收集性能指标，包括：
- 服务启动时间
- API 响应时间
- 适配器操作延迟
- 内存使用情况

## 🔧 配置选项

### 测试配置文件

测试使用以下配置文件：

- `fixtures/config-samples/test-config.yaml` - 完整功能测试配置
- `fixtures/config-samples/minimal-config.yaml` - 最小配置测试
- `fixtures/config-samples/multi-adapter-config.yaml` - 多适配器配置测试
- `fixtures/config-samples/invalid-config.yaml` - 错误配置测试

### 环境变量

```bash
# 测试环境配置
NODE_ENV=test                           # 测试环境
LOG_LEVEL=error                         # 日志级别
PUBSUB_EMULATOR_HOST=localhost:8085     # Pub/Sub 模拟器

# 测试行为配置
TEST_TIMEOUT=30000                      # 测试超时时间（毫秒）
MAX_CONCURRENT_TESTS=1                  # 最大并发测试数
CLEANUP_AFTER_TESTS=true               # 测试后清理
```

## 📋 测试清单

### ✅ 需求验收测试

**3.1.1 适配器静态加载机制**
- [x] 根据配置文件在启动时加载适配器
- [x] 支持配置驱动的适配器启用/禁用
- [x] 正确处理无效配置
- [x] 支持多种适配器类型的同时加载

**3.1.2 适配器注册管理器**
- [x] 提供适配器注册和注销功能
- [x] 管理适配器元数据（版本、描述、功能）
- [x] 支持适配器启用/禁用状态管理
- [x] 提供注册表状态查询功能
- [x] 支持内置适配器自动注册

**3.1.3 适配器生命周期管理**
- [x] 支持适配器实例创建和初始化
- [x] 支持适配器实例停止和销毁
- [x] 支持优雅关闭处理
- [x] 支持自动启动适配器功能
- [x] 正确跟踪实例状态

**3.1.4 适配器状态监控**
- [x] 提供健康检查注册和执行
- [x] 提供指标收集和报告
- [x] 提供状态变更事件通知
- [x] 提供性能监控功能
- [x] 提供错误跟踪和报告

### ✅ API 合约测试

**健康检查 API**
- [x] `GET /health` - 基础健康检查
- [x] `GET /health/ready` - 就绪检查
- [x] `GET /health/live` - 存活检查

**指标 API**
- [x] `GET /metrics` - Prometheus 格式指标
- [x] `GET /metrics/json` - JSON 格式指标

**适配器管理 API**
- [x] `GET /api/adapters` - 获取所有适配器
- [x] `GET /api/adapters/:name` - 获取特定适配器详情
- [x] `POST /api/adapters/:name/start` - 启动适配器
- [x] `POST /api/adapters/:name/stop` - 停止适配器
- [x] `POST /api/adapters/:name/restart` - 重启适配器
- [x] `PATCH /api/adapters/:name/enabled` - 启用/禁用适配器

### ✅ 性能基准

| 指标 | 要求 | 状态 |
|------|------|------|
| 服务启动时间 | < 5秒 | ✅ |
| 健康检查响应时间 | < 50ms | ✅ |
| API 响应时间 | < 200ms | ✅ |
| 适配器启动时间 | < 3秒 | ✅ |
| 适配器停止时间 | < 2秒 | ✅ |
| 并发适配器支持 | ≥ 10个 | ✅ |

### ✅ 安全验证

- [x] 输入验证和清理
- [x] 配置安全性
- [x] 错误信息安全性
- [x] 资源访问控制
- [x] 防护攻击（XSS、注入、路径遍历）

## 🐛 故障排除

### 常见问题

**1. 测试超时**
```bash
# 增加超时时间
jest --testTimeout=60000
```

**2. Pub/Sub 连接失败**
```bash
# 检查 Pub/Sub 模拟器状态
docker ps | grep pubsub-emulator
curl http://localhost:8085

# 重启模拟器
docker restart pubsub-emulator
```

**3. 端口冲突**
```bash
# 检查端口占用
netstat -tuln | grep 18080
lsof -i :18080

# 停止占用进程
kill -9 <PID>
```

**4. 内存不足**
```bash
# 设置 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
```

### 调试选项

```bash
# 启用详细输出
npm run test:verbose

# 运行单个测试文件
npx jest tests/acceptance/requirements.test.ts

# 调试模式
node --inspect-brk ./node_modules/.bin/jest --runInBand
```

## 📈 持续集成

### GitHub Actions

```yaml
name: Task 3.1 Acceptance Tests

on:
  push:
    paths:
      - 'services/data-collection/exchange-collector/**'
  pull_request:
    paths:
      - 'services/data-collection/exchange-collector/**'

jobs:
  acceptance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Start Pub/Sub emulator
        run: |
          docker run -d --name pubsub-emulator -p 8085:8085 \
            gcr.io/google.com/cloudsdktool/cloud-sdk:emulators \
            gcloud beta emulators pubsub start --host-port=0.0.0.0:8085
            
      - name: Run acceptance tests
        run: npm run test:ci
        working-directory: acceptance-tests/task-3.1-adapter-registry
        
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./acceptance-tests/task-3.1-adapter-registry/coverage/lcov.info
```

## 🔄 维护指南

### 更新测试

1. **添加新需求测试**
   - 在相应的测试文件中添加测试用例
   - 更新测试数据固件
   - 验证测试覆盖率

2. **修改 API 合约**
   - 更新 API 合约测试
   - 更新响应格式验证
   - 添加回归测试保护

3. **性能基准调整**
   - 更新性能标准
   - 添加新的性能指标
   - 优化测试执行时间

### 测试数据管理

- 使用 `fixtures/test-data/` 存储测试数据
- 保持测试数据最新和相关
- 使用有意义的测试数据名称

### 最佳实践

1. **测试独立性** - 每个测试应该独立运行
2. **资源清理** - 测试后清理所有资源
3. **明确断言** - 使用清晰具体的断言
4. **错误处理** - 正确处理异步操作和错误
5. **文档更新** - 保持文档与代码同步

## 📞 支持

如有问题或建议，请：

1. 查看[故障排除](#故障排除)部分
2. 检查[已知问题](../../docs/known-issues.md)
3. 创建 Issue 或提交 Pull Request

---

**生成工具**: Claude Code (claude.ai/code)  
**版本**: 1.0.0  
**最后更新**: 2025-08-02