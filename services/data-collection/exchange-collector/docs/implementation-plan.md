# Binance 数据接入项目执行计划

## 项目目标
基于解耦架构设计，实现 Binance 交易所的实时市场数据接入，包括成交数据(trade)、K线数据(kline)和价格数据(ticker)的采集、标准化和发送到 Google Cloud Pub/Sub。

## 总体架构
```
services/
├── adapters/
│   └── binance-adapter/              # Binance 适配器（独立模块）
└── data-collection/
    └── exchange-collector/           # 通用数据收集器
```

## 阶段1：基础架构搭建（2-3天）

### 1.1 创建项目结构
- [ ] 创建 `services/adapters/binance-adapter/` 目录结构
- [ ] 设置 TypeScript 项目配置（package.json, tsconfig.json）
- [ ] 创建基础的 README 和文档结构
- [ ] 配置 Google Cloud SDK 和认证

### 1.2 定义核心接口
- [ ] 定义 `ExchangeAdapter` 统一接口
- [ ] 定义 `DataSubscription` 订阅模型
- [ ] 定义 `MarketData` 标准化数据格式
- [ ] 创建错误处理类型定义
- [ ] 设计 Google Cloud 相关接口（Pub/Sub、Monitoring）

### 1.3 配置系统设计
- [ ] 设计 Binance 适配器配置结构
- [ ] 实现配置加载和验证逻辑
- [ ] 创建开发环境配置文件
- [ ] 集成 Google Secret Manager 配置管理

**交付物：**
- 完整的项目结构和配置
- 核心接口定义
- 基础文档

## 阶段2：Binance 适配器实现（3-4天）

### 2.1 连接管理器
- [ ] 实现 WebSocket 连接池管理
- [ ] 实现自动重连机制（指数退避）
- [ ] 实现心跳检测和保活机制
- [ ] 处理连接状态管理和监控

### 2.2 订阅管理器
- [ ] 实现 Binance 流名称构建逻辑
- [ ] 实现多流组合订阅（Combined Streams）
- [ ] 实现订阅/取消订阅功能
- [ ] 处理流的动态管理

### 2.3 数据解析器
- [ ] 实现 Binance Trade 数据解析
- [ ] 实现 Binance Kline 数据解析
- [ ] 实现 Binance Ticker 数据解析
- [ ] 实现数据标准化转换

### 2.4 错误处理和监控
- [ ] 实现连接错误处理
- [ ] 实现数据解析错误处理
- [ ] 实现延迟计算和统计
- [ ] 实现适配器状态监控

**交付物：**
- 完整的 Binance 适配器实现
- 支持 Trade、Kline、Ticker 数据类型
- 完善的错误处理和重连机制

## 阶段3：Exchange Collector 重构（2-3天）

### 3.1 适配器注册系统
- [ ] 实现适配器动态加载机制
- [ ] 实现适配器注册管理器
- [ ] 实现适配器生命周期管理
- [ ] 实现适配器状态监控

### 3.2 配置系统重构
- [ ] 移除交易所特定配置
- [ ] 实现通用订阅配置格式
- [ ] 实现配置验证和合并逻辑
- [ ] 支持多适配器配置管理

### 3.3 数据管道重构
- [ ] 实现通用数据接收管道
- [ ] 实现数据路由和分发逻辑
- [ ] 实现数据缓冲和批处理
- [ ] 优化内存使用和性能

**交付物：**
- 解耦的 Exchange Collector 核心
- 支持插件化适配器架构
- 通用的配置和数据处理系统

## 阶段4：Google Cloud Pub/Sub 集成和数据发送（2天）

### 4.1 Google Cloud Pub/Sub 发布者实现
- [ ] 实现高性能 Google Cloud Pub/Sub 发布者
- [ ] 实现批量发送和压缩
- [ ] 实现发送失败重试机制
- [ ] 实现背压控制

### 4.2 Topic 管理
- [ ] 实现动态 Topic 路由
- [ ] 实现 Topic 命名规则（`market.{type}.{exchange}.{symbol}`）
- [ ] 实现 Topic 自动创建
- [ ] 实现消息分区策略

### 4.3 数据序列化
- [ ] 实现 JSON 序列化
- [ ] 实现数据压缩
- [ ] 实现消息头管理
- [ ] 优化序列化性能

### 4.4 Google Cloud Pub/Sub 集成（可选）
- [ ] 实现可配置的消息后端支持（主要使用 Pub/Sub）
- [ ] 实现 Pub/Sub 生产者适配器
- [ ] 配置 Topic 和订阅
- [ ] 实现消息批处理和确认机制

**交付物：**
- 完整的 Google Cloud Pub/Sub 集成
- 支持多种数据类型的 Topic 路由
- 高性能的数据发送机制

## 阶段5：监控和API服务（2天）

### 5.1 监控指标实现
- [ ] 实现 Prometheus 指标暴露
- [ ] 集成 Google Cloud Monitoring
- [ ] 配置自定义指标和仪表板
- [ ] 实现连接状态监控
- [ ] 实现数据延迟监控
- [ ] 实现吞吐量监控

### 5.2 健康检查API
- [ ] 实现服务健康检查端点
- [ ] 配置 GKE 健康检查探针
- [ ] 实现适配器状态查询
- [ ] 实现运行时指标查询
- [ ] 实现配置查询接口

### 5.3 管理API
- [ ] 实现订阅管理API
- [ ] 实现适配器控制API
- [ ] 实现日志级别动态调整
- [ ] 集成 Cloud Logging
- [ ] 实现graceful shutdown

**交付物：**
- 完整的监控指标系统
- REST API 管理接口
- 运维友好的状态查询

## 阶段6：测试和优化（2-3天）

### 6.1 单元测试
- [ ] Binance 适配器单元测试
- [ ] 数据解析器测试
- [ ] 配置系统测试
- [ ] 错误处理测试

### 6.2 集成测试
- [ ] 端到端数据流测试
- [ ] Google Cloud Pub/Sub 集成测试
- [ ] 重连机制测试
- [ ] 并发压力测试

### 6.3 性能优化
- [ ] 内存使用优化
- [ ] CPU 使用优化
- [ ] 网络连接优化
- [ ] 数据处理性能优化

### 6.4 生产就绪
- [ ] Docker 镜像构建和推送到 Google Container Registry
- [ ] Cloud Build 自动化构建流程
- [ ] GKE 部署文档编写
- [ ] 运维手册编写（包含 Google Cloud 特定操作）
- [ ] 性能基准测试
- [ ] Cloud Load Balancing 配置

**交付物：**
- 完整的测试套件
- 性能优化报告
- 生产部署方案

## 阶段7：文档和部署（1天）

### 7.1 文档完善
- [ ] API 文档生成
- [ ] 配置文档编写
- [ ] 架构文档更新
- [ ] 故障排查指南

### 7.2 部署配置
- [ ] Google Kubernetes Engine (GKE) 部署配置
- [ ] Cloud Build 配置文件
- [ ] Docker Compose 本地开发环境
- [ ] Google Secret Manager 集成
- [ ] Cloud Logging 配置

**交付物：**
- 完整的项目文档
- 生产级部署配置
- 开发环境快速启动方案

## 关键里程碑

| 里程碑 | 时间节点 | 验收标准 |
|--------|----------|----------|
| M1: 架构搭建完成 | 第3天 | 接口定义完成，项目结构就绪 |
| M2: Binance适配器完成 | 第7天 | 能稳定接收Binance数据 |
| M3: Collector重构完成 | 第10天 | 支持插件化适配器架构 |
| M4: Pub/Sub集成完成 | 第12天 | 数据能发送到Pub/Sub Topic |
| M5: 监控API完成 | 第14天 | 具备生产监控能力 |
| M6: 测试优化完成 | 第17天 | 通过所有测试，性能达标 |
| M7: 生产就绪 | 第18天 | 可部署到生产环境 |

## 风险控制

### 技术风险
- **连接稳定性**：基于实验数据设计重连机制
- **数据解析错误**：完善的错误处理和容错机制
- **性能瓶颈**：基于实验基准设置性能目标
- **Google Cloud 配额限制**：监控 API 调用和资源使用配额
- **网络延迟**：选择合适的 Google Cloud 区域以降低延迟

### 进度风险
- **每个阶段设置明确的交付物**
- **关键里程碑设置验收标准**
- **预留缓冲时间处理意外问题**

## 成功标准

1. **功能完整性**：支持 Trade、Kline、Ticker 三种数据类型
2. **性能指标**：延迟 < 100ms，吞吐量 > 1000 msg/s
3. **稳定性**：连接成功率 > 99.9%，自动重连时间 < 5s
4. **可扩展性**：支持新增适配器，配置驱动
5. **生产就绪**：完整监控、日志、部署方案

总工期：**18个工作日**（约3.5周）

## Google Cloud 开发环境设置

### 本地开发环境
1. **安装 Google Cloud SDK**
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Linux/WSL
   curl https://sdk.cloud.google.com | bash
   ```

2. **认证和项目配置**
   ```bash
   gcloud auth login
   gcloud config set project pixiu-trading
   gcloud auth application-default login
   ```

3. **开发工具配置**
   - VS Code 安装 Cloud Code 插件
   - 配置 Docker Desktop 使用 gcloud 凭据
   - 设置本地 Kubernetes (minikube/kind) 进行测试

### Google Cloud 资源配置
1. **Google Kubernetes Engine (GKE)**
   - 创建 Autopilot 集群以简化管理
   - 配置节点池自动扩缩
   - 设置 Workload Identity 进行安全访问

2. **Cloud Build**
   - 配置自动构建触发器
   - 设置多阶段 Docker 构建
   - 集成漏洞扫描

3. **Container Registry**
   - 使用 Artifact Registry（推荐）
   - 配置镜像生命周期策略
   - 设置漏洞扫描

4. **Cloud Monitoring & Logging**
   - 配置日志路由和保留策略
   - 创建自定义指标和告警
   - 设置 SLO 和 SLI

5. **Secret Manager**
   - 存储 API 密钥和敏感配置
   - 配置访问权限和轮换策略
   - 集成到应用程序中

### 开发工作流
```bash
# 1. 本地开发和测试
npm run dev
npm test

# 2. 构建 Docker 镜像
docker build -t gcr.io/pixiu-trading/exchange-collector:dev .

# 3. 推送到 Container Registry
docker push gcr.io/pixiu-trading/exchange-collector:dev

# 4. 部署到 GKE
kubectl apply -f k8s/
```

## 相关文档

- [架构设计文档](./design.md)
- [实验调研报告](../../../experiments/binance-ws-experiment/EXPERIMENT_SUMMARY.md)
- [技术规范文档](../../../docs/tech-design.md)

## 项目文件结构

```
services/
├── adapters/
│   └── binance-adapter/
│       ├── src/
│       │   ├── connector/          # WebSocket 连接管理
│       │   ├── parser/             # 数据解析器
│       │   ├── config/             # 配置管理
│       │   ├── types/              # 类型定义
│       │   └── index.ts            # 适配器入口
│       ├── config/
│       │   └── default.yaml        # 默认配置
│       ├── tests/
│       └── package.json
│
└── data-collection/
    └── exchange-collector/
        ├── src/
        │   ├── interfaces/         # 适配器接口
        │   ├── registry/           # 适配器注册
        │   ├── pipeline/           # 数据管道
        │   ├── pubsub/             # Google Cloud Pub/Sub 集成
        │   ├── api/                # REST API
        │   └── monitoring/         # 监控指标
        ├── config/
        └── docs/
```