# Serverless 平台调研会议记录

**会议时间：** 2025-07-31  
**会议主题：** Serverless 平台消息队列服务调研及架构决策  
**参与人员：** 开发团队  

## 调研背景

针对 Pixiu 加密货币量化交易系统的消息队列需求，调研主流 serverless 平台的 Kafka 类似服务，评估替代方案的可行性。

## 调研结果

### 1. Supabase - Realtime 服务

**功能特性：**
- 实时数据同步服务
- 支持多人协作场景  
- 最大消息大小：250KB (免费版) / 3MB (付费版)

**定价结构：**
- **免费版：** 200万消息/月，200并发连接
- **Pro版：** 500万消息/月，500并发连接，超出部分 $10/1000连接
- **企业版：** 自定义配置和批量折扣

**评估：** 更适合实时同步场景，不是传统消息队列

### 2. Cloudflare Queues

**功能特性：**
- 保证消息传递
- 支持批处理、重试、延迟消息
- 死信队列支持
- 拉取式消费者模式
- 与 Workers 和 R2 Storage 深度集成
- 无出口带宽费用

**定价结构：**
- 仅在付费计划中提供
- 具体价格需要联系销售团队

**评估：** 功能完整，适合边缘计算场景

### 3. Google Firebase/Cloud Pub/Sub

**功能特性：**
- Firebase Cloud Messaging (FCM) - 免费无限制推送通知
- Google Cloud Pub/Sub - 企业级消息传递
- 支持与 BigQuery、Cloud Storage 等服务集成
- 高可用性和全球分布

**定价结构：**
- **Firebase Cloud Messaging：** 完全免费
- **Google Cloud Pub/Sub：** 
  - 前 10 GiB/月 免费
  - 超出后 $40/TiB
  - 消息存储 $0.27/GiB-月
  - 特殊集成服务 $50-80/TiB

**评估：** 功能最完整，企业级特性齐全

### 4. Vercel Queues (限量 Beta)

**功能特性：**
- 基于主题的发布/订阅模式
- 流式处理支持，避免内存溢出
- OIDC 自动身份认证
- TypeScript SDK，类型安全
- 专为后台任务处理设计
- 基于 append-only log，确保消息持久化

**定价结构：**
- 目前处于限量 Beta 阶段
- 正式定价暂未公布

**评估：** 新兴服务，前景良好但仍在测试阶段

## 架构方案对比

### 方案1：Google Cloud 全栈部署

**服务映射：**
```
现有架构 → Google Cloud 服务
├── Apache Kafka → Cloud Pub/Sub
├── PostgreSQL → Cloud SQL (PostgreSQL)
├── TimescaleDB → BigQuery (时序分析)
├── Redis → Memorystore (Redis)
├── 微服务 → Cloud Run / GKE
└── API网关 → Cloud Endpoints
```

**优势：**
- 服务生态完整，无缝集成
- 企业级可靠性和性能
- 统一的监控、日志、安全体系
- 避免厂商锁定风险

**成本分析：**
- Pub/Sub: 前10GiB免费，后续按量付费
- 按需扩展，避免资源浪费
- 区域内数据传输免费

### 方案2：多厂商 Serverless 混合

**架构设计：**
```
计算层: Vercel + Cloudflare Workers
数据层: PlanetScale + Upstash  
消息层: Google Pub/Sub + Supabase
```

**延迟分析：**
- 跨厂商通信延迟：50-150ms
- 累积延迟可能达到：200-500ms
- 对高频交易场景不适用

**风险评估：**
- 延迟不可控
- 故障传播复杂
- 调试和运维困难

### 方案3：渐进式混合架构

**核心系统集中：**
- 交易执行、风控、策略计算保持在单一区域
- 使用 Google Cloud 确保低延迟和强一致性

**辅助服务分布：**
- 用户界面：Vercel/Cloudflare
- 静态资源：CDN加速
- 监控日志：第三方服务

## 边缘计算应用场景澄清

**适用场景：**
- ✅ 用户界面响应加速
- ✅ 市场数据缓存分发
- ✅ 静态资源CDN加速
- ✅ API网关和路由

**不适用场景：**
- ❌ 交易执行引擎 (需要强一致性)
- ❌ 风控实时检查 (需要全局状态)
- ❌ 策略核心计算 (需要完整数据)
- ❌ 资金清算结算 (需要事务保证)

## 最终决策

### 选择方案：Google Cloud 全栈部署

**决策理由：**
1. **延迟可控：** 单一区域部署，避免跨厂商网络延迟
2. **架构简化：** 减少系统复杂性，便于开发和运维
3. **成本透明：** 统一计费，易于成本控制和预算
4. **风险可控：** 避免多厂商依赖带来的故障风险
5. **迁移平滑：** 与现有 Kafka 架构相似，迁移成本低

### 实施计划

**Phase 1 - 核心服务迁移**
- 将 Apache Kafka 替换为 Cloud Pub/Sub
- 数据库迁移至 Cloud SQL 和 BigQuery
- 微服务部署至 Cloud Run

**Phase 2 - 性能优化**  
- 配置 Cloud CDN 加速静态资源
- 实施 Cloud Endpoints API 管理
- 接入 Cloud Monitoring 监控体系

**Phase 3 - 扩展优化**
- 根据业务发展评估多区域部署
- 考虑边缘计算场景的渐进式接入

## 后续行动项

- [ ] Google Cloud 账户设置和项目初始化
- [ ] Cloud Pub/Sub 替换 Kafka 的详细技术方案
- [ ] 数据库迁移计划制定
- [ ] 成本预算和监控方案设计
- [ ] 团队 Google Cloud 技术培训安排

---
**会议结论：** 确定使用 Google Cloud 全栈方案，优先保证系统稳定性和延迟可控性，为后续业务扩展奠定基础。