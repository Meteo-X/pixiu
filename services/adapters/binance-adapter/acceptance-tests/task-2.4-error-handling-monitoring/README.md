# Task 2.4: 错误处理和监控 - 验收测试套件

本测试套件为 Task 2.4（错误处理和监控）提供全面的验收测试，验证 Binance 适配器的错误处理、延迟监控和状态监控功能。

## 📋 目录

- [测试概述](#测试概述)
- [测试架构](#测试架构)
- [测试分类](#测试分类)
- [快速开始](#快速开始)
- [测试执行](#测试执行)
- [测试数据](#测试数据)
- [性能基准](#性能基准)
- [故障排除](#故障排除)

## 🎯 测试概述

### 测试目标

验证 Task 2.4 实现的错误处理和监控系统满足以下要求：

- **错误处理能力**: 统一错误分类、恢复策略、熔断器机制
- **延迟监控**: 实时延迟计算、统计分析、性能基准比较
- **状态监控**: 适配器状态跟踪、健康度评估、告警系统
- **系统集成**: 组件间协作、数据流监控、事件传播
- **性能要求**: 低延迟、高吞吐量、内存效率

### 覆盖范围

| 组件 | 功能覆盖 | 测试文件 |
|------|----------|----------|
| ErrorHandler | 错误分类、恢复策略、熔断器、统计 | `error-handling.test.ts` |
| LatencyMonitor | 延迟测量、统计计算、趋势分析、告警 | `latency-monitoring.test.ts` |
| AdapterStatusMonitor | 状态跟踪、健康度评估、快照管理 | `status-monitoring.test.ts` |
| 系统集成 | 组件协作、事件传播、数据聚合 | `monitoring-integration.test.ts` |
| 增强适配器 | 端到端集成、生命周期管理 | `enhanced-adapter.test.ts` |

## 🏗️ 测试架构

```
acceptance-tests/task-2.4-error-handling-monitoring/
├── tests/
│   ├── acceptance/           # 验收测试 - 验证功能需求
│   │   ├── error-handling.test.ts
│   │   ├── latency-monitoring.test.ts
│   │   └── status-monitoring.test.ts
│   ├── integration/          # 集成测试 - 验证组件交互
│   │   ├── monitoring-integration.test.ts
│   │   └── enhanced-adapter.test.ts
│   ├── performance/          # 性能测试 - 验证性能要求
│   │   └── monitoring-performance.test.ts
│   ├── regression/           # 回归测试 - 防止功能退化
│   │   └── api-stability.test.ts
│   └── scenario/             # 场景测试 - 真实世界场景
│       └── real-world-scenarios.test.ts
├── fixtures/                 # 测试数据和工具
│   ├── helpers/
│   ├── test-data/
│   └── mock-services/
├── reports/                  # 测试报告
├── coverage/                 # 覆盖率报告
└── 配置文件
```

## 📊 测试分类

### 1. 验收测试 (Acceptance Tests)

验证每个监控组件的核心功能：

**错误处理器测试**:
- 错误分类和增强 (REQ-2.4.1)
- 错误恢复策略 (REQ-2.4.2)
- 熔断器机制 (REQ-2.4.3)
- 错误统计和监控 (REQ-2.4.4)
- 告警系统 (REQ-2.4.5)

**延迟监控器测试**:
- 延迟测量和记录 (REQ-2.4.9)
- 延迟统计计算 (REQ-2.4.10)
- 延迟分布分析 (REQ-2.4.11)
- 性能基准比较 (REQ-2.4.12)
- 延迟趋势分析 (REQ-2.4.13)

**状态监控器测试**:
- 状态监控和快照 (REQ-2.4.18)
- 健康度评估 (REQ-2.4.19)
- 健康度告警 (REQ-2.4.20)

### 2. 集成测试 (Integration Tests)

验证组件间的协作和数据流：

- **组件间事件传播** (REQ-2.4.27)
- **数据流集成** (REQ-2.4.28)
- **错误处理链路集成** (REQ-2.4.29)
- **监控数据聚合** (REQ-2.4.30)

### 3. 性能测试 (Performance Tests)

验证监控系统的性能特征：

- **错误处理性能** (REQ-2.4.43): < 1ms/错误
- **延迟监控性能** (REQ-2.4.44): < 0.1ms/记录
- **状态监控性能** (REQ-2.4.45): < 50ms/快照
- **高负载压力测试** (REQ-2.4.47): 10K 错误/秒，50K 延迟记录/秒

### 4. 场景测试 (Scenario Tests)

模拟真实世界的使用场景：

- **网络中断和恢复** (REQ-2.4.55)
- **高负载和压力情况** (REQ-2.4.56)
- **服务降级场景** (REQ-2.4.57)
- **故障恢复流程** (REQ-2.4.58)
- **长时间运行稳定性** (REQ-2.4.59)

### 5. 回归测试 (Regression Tests)

确保 API 稳定性和向后兼容：

- **API 接口稳定性** (REQ-2.4.49-54)
- **配置向后兼容**
- **数据格式一致性**
- **性能特征稳定性**

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- TypeScript >= 5.3.3
- Jest >= 29.7.0

### 安装依赖

```bash
cd acceptance-tests/task-2.4-error-handling-monitoring
npm install
```

### 运行所有测试

```bash
# 完整测试套件
npm test

# 简化测试（核心功能）
npm run test:simple
```

### 分类测试执行

```bash
# 验收测试
npm run test:acceptance

# 集成测试
npm run test:integration

# 性能测试
npm run test:performance

# 回归测试
npm run test:regression

# 场景测试
npm run test:scenario
```

## 📈 测试执行

### 测试配置

#### 完整配置 (`jest.config.js`)
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  maxWorkers: 4,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

#### 简化配置 (`jest.config.simple.js`)
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/acceptance/error-handling.test.ts',
    '**/acceptance/latency-monitoring.test.ts',
    '**/acceptance/status-monitoring.test.ts'
  ],
  testTimeout: 15000,
  maxWorkers: 1
};
```

### 覆盖率报告

```bash
# 生成覆盖率报告
npm run test:coverage

# 查看 HTML 报告
open coverage/index.html
```

### 测试监控

```bash
# 监控模式（文件变化时自动重新测试）
npm run test:watch
```

## 🎪 测试数据

### 错误样本数据

测试套件包含丰富的错误样本，涵盖所有错误分类：

```typescript
// 连接错误样本
const connectionErrors = [
  {
    error: new Error('Connection timeout'),
    expectedCategory: ErrorCategory.CONNECTION,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RECONNECT
  }
  // ... 更多样本
];
```

### 延迟分布样本

不同网络条件下的延迟分布：

```typescript
const networkLatencyDistributions = {
  excellent: { samples: [10-30ms], expectedMean: 20 },
  good: { samples: [20-60ms], expectedMean: 40 },
  fair: { samples: [50-150ms], expectedMean: 100 },
  poor: { samples: [100-400ms], expectedMean: 250 },
  critical: { samples: [500-2000ms], expectedMean: 1250 }
};
```

### 测试工具

提供丰富的测试工具：

- **TestDataGenerator**: 生成随机测试数据
- **EventCollector**: 收集和分析事件
- **PerformanceTester**: 性能测试工具
- **MonitoringFactory**: 创建监控组件
- **ScenarioSimulator**: 场景模拟器

## 📊 性能基准

### 核心性能指标

| 指标 | 目标值 | 测试方法 |
|------|--------|----------|
| 错误处理延迟 | < 1ms | 1000次错误处理的平均时间 |
| 延迟记录延迟 | < 0.1ms | 10000次延迟记录的平均时间 |
| 状态快照创建 | < 50ms | 复杂状态快照的创建时间 |
| 内存使用增长 | < 50MB | 10000次操作后的内存增长 |
| 错误处理吞吐量 | > 10K/秒 | 每秒可处理的错误数量 |
| 延迟记录吞吐量 | > 50K/秒 | 每秒可记录的延迟测量数量 |

### 连接成功率要求

- **目标**: > 99.9%
- **自动重连时间**: < 5s
- **错误率容忍**: < 1%

### 延迟要求

| 延迟类型 | 警告阈值 | 严重阈值 | P95阈值 | P99阈值 |
|----------|----------|----------|---------|---------|
| 网络延迟 | 100ms | 500ms | 200ms | 1000ms |
| 处理延迟 | 10ms | 50ms | 20ms | 100ms |
| 端到端延迟 | 150ms | 750ms | 300ms | 1500ms |
| 心跳延迟 | 30s | 60s | 45s | 90s |
| 订阅延迟 | 5s | 15s | 10s | 30s |

## 🔧 故障排除

### 常见问题

#### 1. 测试超时

**症状**: 测试运行超过 30 秒被中断

**解决方案**:
```bash
# 使用简化配置
npm run test:simple

# 或增加超时时间
jest --testTimeout=60000
```

#### 2. 内存不足

**症状**: 测试过程中内存使用过高

**解决方案**:
```bash
# 减少并发 workers
jest --maxWorkers=1

# 启用垃圾回收
node --expose-gc $(npm bin)/jest
```

#### 3. 性能测试失败

**症状**: 性能测试不满足基准要求

**排查步骤**:
1. 检查系统负载
2. 关闭其他应用程序
3. 使用 Node.js 性能分析
4. 检查内存泄漏

#### 4. 随机测试失败

**症状**: 某些测试间歇性失败

**解决方案**:
```bash
# 增加测试稳定性
npm run test -- --verbose --no-cache

# 重复运行确认
npm run test -- --repeat=5
```

### 调试技巧

#### 1. 启用详细日志

```typescript
// 在测试中启用调试日志
process.env.LOG_LEVEL = 'debug';
process.env.NODE_ENV = 'test';
```

#### 2. 使用调试模式

```bash
# Node.js 调试
node --inspect-brk $(npm bin)/jest --runInBand

# VS Code 调试配置
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal"
}
```

#### 3. 内存分析

```bash
# 启用内存分析
node --expose-gc --inspect $(npm bin)/jest

# 或使用 clinic.js
npx clinic doctor -- npm test
```

## 📋 测试检查清单

### 功能验证

- [ ] 错误分类准确性
- [ ] 恢复策略执行正确
- [ ] 熔断器机制有效
- [ ] 延迟统计计算准确
- [ ] 健康度评估合理
- [ ] 告警触发及时

### 性能验证

- [ ] 错误处理延迟 < 1ms
- [ ] 延迟记录延迟 < 0.1ms
- [ ] 状态快照创建 < 50ms
- [ ] 内存使用稳定
- [ ] 高负载下稳定运行

### 集成验证

- [ ] 组件间事件传播正常
- [ ] 数据聚合正确
- [ ] 配置更新生效
- [ ] 错误恢复流程完整

### 稳定性验证

- [ ] 长时间运行稳定
- [ ] 内存无泄漏
- [ ] 配置热更新正常
- [ ] 边界条件处理正确

## 📚 相关文档

- [Task 2.4 实现文档](../../src/connector/README.md)
- [错误处理器 API](../../src/connector/ErrorHandler.ts)
- [延迟监控器 API](../../src/connector/LatencyMonitor.ts)
- [状态监控器 API](../../src/connector/AdapterStatusMonitor.ts)
- [增强适配器 API](../../src/BinanceAdapterEnhanced.ts)

## 🤝 贡献指南

### 添加新测试

1. 确定测试分类（验收/集成/性能/回归/场景）
2. 遵循现有命名约定
3. 使用提供的测试工具和数据
4. 添加适当的文档和注释
5. 确保测试稳定可重复

### 测试最佳实践

- 使用描述性的测试名称
- 测试应该独立和可重复
- 使用适当的断言和验证
- 避免硬编码的时间依赖
- 正确清理测试资源

---

**测试套件版本**: 1.0.0  
**最后更新**: 2025-08-02  
**兼容版本**: Task 2.4 Implementation