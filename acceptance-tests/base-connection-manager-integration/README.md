# BaseConnectionManager集成功能测试套件

这是一个全面的测试套件，用于验证BaseConnectionManager及其BinanceConnectionManager实现的集成功能。测试套件涵盖连接管理、错误处理、性能监控、资源管理等关键功能。

## 测试架构

### 测试框架
- **测试运行器**: Jest
- **语言**: TypeScript 
- **Mock框架**: 自定义WebSocket Mock
- **覆盖率工具**: Jest内置覆盖率
- **性能监控**: 自定义性能监控工具

### 测试结构
```
acceptance-tests/base-connection-manager-integration/
├── tests/
│   ├── connection-management/          # 连接管理测试
│   │   ├── basic-connection.test.ts    # 基础连接功能
│   │   ├── stream-management.test.ts   # 流管理功能
│   │   └── binance-metrics.test.ts     # Binance指标收集
│   ├── error-handling/                 # 错误处理测试
│   │   ├── error-classification.test.ts # 错误分类
│   │   ├── recovery-strategies.test.ts  # 恢复策略
│   │   └── circuit-breaker.test.ts     # 断路器模式
│   ├── performance-monitoring/         # 性能监控测试
│   │   ├── resource-monitoring.test.ts # 资源监控
│   │   ├── performance-optimization.test.ts # 性能优化
│   │   └── health-checks.test.ts       # 健康检查
│   ├── integration/                    # 集成测试
│   │   ├── framework-integration.test.ts # 框架集成
│   │   ├── lifecycle-management.test.ts # 生命周期管理
│   │   └── event-system.test.ts        # 事件系统
│   └── stress-testing/                 # 压力测试
│       ├── connection-limits.test.ts   # 连接限制
│       ├── memory-management.test.ts   # 内存管理
│       └── concurrent-operations.test.ts # 并发操作
├── mocks/                             # Mock实现
│   └── websocket-mock.ts              # WebSocket Mock
├── helpers/                           # 测试辅助工具
│   └── test-helpers.ts                # 测试工具函数
├── fixtures/                          # 测试数据
├── reports/                           # 测试报告
└── coverage/                          # 覆盖率报告
```

## 功能测试覆盖

### 1. 连接管理功能
- **基础连接**: 建立/断开WebSocket连接
- **连接生命周期**: 状态管理和状态转换
- **心跳机制**: ping/pong和超时处理
- **配置验证**: 连接参数验证
- **连接指标**: 延迟、吞吐量、错误计数

### 2. 流管理功能
- **单流操作**: 添加/移除单个数据流
- **批量操作**: 批量流管理和调度优化
- **组合流URL**: 单流/组合流URL构建
- **流限制**: 最大流数量限制检查
- **自动重连**: 流变更时的自动重连

### 3. 错误处理和恢复
- **错误分类**: 网络、限频、认证、数据解析错误
- **恢复策略**: 指数退避、最大重连间隔、抖动机制
- **断路器**: 频繁错误时的保护机制
- **降级服务**: 错误状态下的基本功能维持
- **错误指标**: 错误统计和时间戳跟踪

### 4. 性能监控
- **资源监控**: 内存、CPU、网络、缓存指标
- **健康检查**: 系统健康状态评估
- **自动优化**: 资源使用优化和清理
- **性能基准**: 连接时间、延迟、吞吐量基准
- **内存管理**: 内存泄漏检测和清理

### 5. 集成兼容性
- **框架集成**: 与BaseAdapter正确集成
- **生命周期**: 标准化组件生命周期
- **事件系统**: 事件发射和监听机制
- **向后兼容**: 迁移后功能兼容性
- **并发安全**: 多线程/实例安全性

## 测试工具和Mock

### WebSocket Mock
- **连接模拟**: 成功/失败连接模拟
- **网络条件**: 延迟、丢包、中断模拟
- **消息处理**: 发送/接收消息模拟
- **心跳响应**: 自动ping/pong响应
- **错误注入**: 各种错误场景模拟

### 性能监控工具
- **计时器**: 高精度操作计时
- **内存监控**: 内存使用和泄漏检测
- **统计分析**: 平均值、百分位数计算
- **基准测试**: 性能阈值验证
- **趋势分析**: 性能趋势监控

### 测试辅助工具
- **配置生成**: 测试配置生成器
- **事件监听**: 事件收集和等待工具
- **网络模拟**: 网络条件模拟器
- **数据生成**: 测试数据生成器

## 运行测试

### 安装依赖
```bash
npm install
```

### 运行所有测试
```bash
npm test
```

### 运行特定测试类别
```bash
# 连接管理测试
npm run test:connection

# 错误处理测试  
npm run test:error-handling

# 性能监控测试
npm run test:performance

# 集成测试
npm run test:integration

# 压力测试
npm run test:stress
```

### 运行覆盖率测试
```bash
npm run test:coverage
```

### 监视模式
```bash
npm run test:watch
```

## 性能基准和阈值

### 连接性能基准
- **连接建立时间**: < 1000ms
- **批量连接时间**: < 5000ms (10个连接)
- **平均延迟**: < 100ms
- **最大延迟**: < 200ms

### 流管理性能基准
- **单流操作**: < 100ms
- **批量流操作**: < 10000ms (200个流)
- **流添加平均时间**: < 50ms/流
- **URL构建时间**: < 1000ms (1000次构建)

### 内存使用基准
- **基础内存占用**: < 50MB
- **内存泄漏阈值**: < 10MB增长
- **资源清理效率**: > 80%内存释放

### 并发性能基准
- **并发连接数**: 50个连接 < 5000ms
- **操作成功率**: > 80%
- **并发效率**: > 10 ops/sec

## 测试报告

测试完成后会生成以下报告：

### 覆盖率报告 (`coverage/`)
- **HTML报告**: 详细的代码覆盖率可视化
- **LCOV报告**: CI/CD集成用的覆盖率数据
- **JSON报告**: 机器可读的覆盖率数据
- **文本报告**: 控制台友好的覆盖率摘要

### 性能报告 (`reports/`)
- **基准测试结果**: 各项性能指标测试结果
- **内存使用分析**: 内存使用趋势和泄漏检测
- **错误统计**: 错误分类和处理统计
- **健康检查报告**: 系统健康状态评估

## CI/CD集成

### 自动化测试
测试套件设计为在CI/CD管道中自动运行：

```yaml
# GitHub Actions示例
- name: Run Integration Tests
  run: |
    npm install
    npm run test:coverage
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

### 测试环境要求
- **Node.js**: >= 18.0.0
- **内存**: >= 512MB可用内存
- **CPU**: >= 2核（推荐）
- **磁盘**: >= 100MB可用空间

## 故障排除

### 常见问题

**Jest挂起不退出**
- 确保所有异步操作都正确清理
- 检查是否调用了`globalCache.destroy()`
- 验证所有定时器都被清理

**内存不足错误**
- 增加Node.js内存限制：`--max-old-space-size=4096`
- 检查测试中的内存泄漏
- 减少并发测试数量

**WebSocket连接失败**
- 检查Mock WebSocket配置
- 验证测试环境网络设置
- 确认防火墙不阻止WebSocket

**测试超时**
- 增加测试超时时间
- 检查异步操作是否正确处理
- 验证测试条件是否可达

### 调试技巧

**启用详细日志**
```bash
LOG_LEVEL=debug npm test
```

**运行单个测试文件**
```bash
npx jest tests/connection-management/basic-connection.test.ts
```

**运行特定测试用例**
```bash
npx jest -t "应该成功建立基础WebSocket连接"
```

**查看内存使用**
```bash
node --expose-gc --max-old-space-size=4096 node_modules/.bin/jest
```

## 贡献指南

### 添加新测试
1. 在相应目录下创建测试文件
2. 使用现有的测试模式和工具
3. 确保测试独立且可重复
4. 添加适当的性能基准
5. 更新README文档

### 测试质量标准
- **独立性**: 测试间无依赖关系
- **可重复**: 多次运行结果一致
- **清晰性**: 测试意图明确
- **完整性**: 覆盖正常和异常流程
- **性能**: 测试执行时间合理

### 代码规范
- 使用TypeScript严格模式
- 遵循项目代码风格
- 添加详细的测试描述
- 使用中文注释和日志
- 包含性能断言和监控

## 许可证

本测试套件遵循项目整体许可证。