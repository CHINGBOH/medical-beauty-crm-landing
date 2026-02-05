# 医美 CRM 落地增补实施方案（PostgreSQL 版本）

> 说明：基于当前仓库已有 CRM、内容营销、AI 对话能力，补齐数据库升级、预约排期、AI 复盘、登录注册、短信通知、集成测试等能力。Airtable 当前仅为试用工具，本方案将其降级为“可选导入源”，核心业务数据统一沉淀到 PostgreSQL。企业微信“真实接入”本轮暂缓，仅预留接口与开关。

## 0. 架构要点与技术栈（优化版）

### 0.1 架构要点（架构师视角）

- **单体优先，模块化分层**：保持当前 Node.js + React 单体架构，按领域拆分模块（CRM、Content、Conversation、Schedule、Auth、Notification、Review）。
- **事件驱动与异步优先**：长耗时任务统一走队列（短信发送、AI 复盘、批量提醒、向量化）。
- **可观测性内建**：统一结构化日志（request_id / tenant_id / user_id / trace_id），并埋点核心业务指标。
- **数据一致性分层**：交易链路（预约、注册、支付前后状态）强一致；分析链路（复盘、报表）弱一致；检索链路（向量召回）最终一致。
- **高并发确定性**：写接口支持 `Idempotency-Key`，消息投递采用 outbox + 重试 + 去重。
- **灰度与可回滚发布**：新能力全部加 feature flag（如 `enable_new_auth`, `enable_sms`），支持按门店灰度。

### 0.2 技术栈（推荐组合）

- 后端：TypeScript + Node.js（保持现有 Express/tRPC）
- API：REST + OpenAPI（兼容现有 tRPC）
- 数据库：**PostgreSQL 15+ + pgvector**（替换当前 MySQL/TiDB 路径）
- 缓存与队列：Redis + BullMQ
- 搜索：先用 PostgreSQL FTS，后续可接 OpenSearch
- 对象存储：S3 兼容
- 前端：React + Vite（保持现状）
- 可观测：OpenTelemetry + Prometheus + Grafana（按阶段引入）

### 0.3 数据传输稳定性与效率（必须落地）

- 所有写 API：支持幂等键 + 请求签名校验。
- 批量任务：分批（默认 100）+ 指数退避重试。
- 可靠消息：Outbox 表 + job worker 双通道保障。
- 限流削峰：网关限流 + 队列缓冲 + 延迟任务。

### 0.4 异步架构与开源工具（GitHub 生态优先）

- 任务队列：BullMQ
- 调度：node-cron（短期），后续可迁 Temporal（中长期）
- API 文档：OpenAPI + Swagger UI
- 配置管理：环境变量 + DB 配置表 + feature flag

---

## 1. PostgreSQL + pgvector 数据库迁移方案

### 1.1 迁移目标

- 将当前数据库从 MySQL/TiDB 路径迁移为 PostgreSQL。
- 为知识库与对话语义检索接入 pgvector。
- 保持现有业务接口尽量无感迁移（Repository 层隔离 SQL 方言差异）。

### 1.2 分阶段迁移

1. **准备期**：
   - 新建 PostgreSQL 实例，启用 `pgvector` 扩展。
   - 在 Drizzle schema 中补齐 PostgreSQL 类型映射（jsonb、timestamptz、vector）。
2. **双写期**：
   - 核心写链路（leads/messages/conversations）双写 MySQL + PostgreSQL。
   - 增加数据对账任务（行数、校验和、抽样字段比对）。
3. **切读期**：
   - 灰度切换读请求到 PostgreSQL（按租户/门店）。
4. **收口期**：
   - 下线 MySQL 写路径，保留只读回滚窗口 1~2 周。

### 1.3 关键表改造建议

- `knowledge_base` 增加：
  - `embedding vector(1536)`
  - `embedding_model varchar(64)`
  - `embedding_updated_at timestamptz`
- 新建索引：
  - `CREATE INDEX idx_kb_embedding_ivfflat ON knowledge_base USING ivfflat (embedding vector_cosine_ops);`
  - 业务常用联合索引（如 `(lead_id, created_at DESC)`）

### 1.4 回滚策略

- 迁移全程保留 binlog/CDC 或应用层审计日志。
- 切读后保留回滚开关，支持一分钟内切回旧库。

### 1.5 Airtable（试用）退场与替代策略

- Airtable 定位调整：
  - 从“主业务库”降级为“临时导入/运营协作工具”。
  - 生产链路禁止依赖 Airtable 可用性。
- 数据主权策略：
  - 线索、会话、预约、复盘、触发日志全部以 PostgreSQL 为唯一事实来源（SoT）。
  - Airtable 数据通过定时任务或手动任务导入，写入内部标准表后再参与业务流程。
- 接口兼容策略：
  - 保留 `airtable-*` 路由但改为适配层，失败不阻塞主流程。
  - 新增 `source_type` 字段（`native|airtable_import`）用于审计来源。
- 下线建议：
  - 连续 2~4 周无关键依赖后，逐步关闭 Airtable 写入与 webhook 回调。

---

## 2. 企业微信真实接入实施方案（本轮暂缓）

- 本轮不接入企业微信真实 API。
- 保留 `notification_provider` 抽象层与 webhook 配置表结构。
- 所有触发规则中的企业微信动作统一 fallback 为“站内消息 + 操作日志”。

---

## 3. 预约排期系统实施方案

### 3.1 目标

实现咨询师/医生排班、客户预约、冲突检测、提醒通知、改约/取消闭环。

### 3.2 数据模型

- `staff_schedules`：排班模板
- `appointment_slots`：可预约时隙
- `appointments`：预约单（状态：pending/confirmed/completed/cancelled/no_show）
- `appointment_events`：状态流转审计

### 3.3 核心规则

- 同一咨询师同一时段不可重复预约（唯一索引控制）。
- 预约确认后写入 outbox 事件触发提醒任务。
- 改约必须保留原预约历史（不可硬覆盖）。

### 3.4 接口清单

- `POST /api/appointments`
- `POST /api/appointments/:id/confirm`
- `POST /api/appointments/:id/reschedule`
- `POST /api/appointments/:id/cancel`
- `GET /api/appointments/calendar?start=...&end=...`

---

## 4. AI 服务复盘系统实施方案

### 4.1 目标

将对话、线索跟进、预约结果聚合成可追踪的“服务复盘记录”，用于培训与流程优化。

### 4.2 复盘流程

1. 每日定时任务抓取前一日会话与结果数据。
2. LLM 生成：问题摘要、风险点、建议动作、标准话术偏差。
3. 写入 `service_reviews` 与 `service_review_items`。
4. 管理后台支持人工修订与“已采纳/已忽略”标记。

### 4.3 质量与安全

- 引入“提示词模板版本号”用于可追溯。
- 对敏感信息脱敏后再进入模型。
- 失败任务进入死信队列，支持重放。

---

## 5. 注册登录策略实施方案

### 5.1 目标

从“基础登录”升级为“可扩展认证体系”，支持账号密码 + 手机验证码登录，并满足后台安全要求。

### 5.2 方案要点

- 用户表新增：`password_hash`, `password_algo`, `last_login_at`, `login_fail_count`, `locked_until`。
- Session/JWT 双模式：
  - 后台管理端优先 HttpOnly Cookie Session。
  - 对外 API 可选 JWT（短期）+ refresh token（长期）。
- 安全策略：
  - 密码强度校验；
  - 连续失败锁定；
  - 异地登录提醒（后续）。

### 5.3 接口

- `POST /api/auth/register`
- `POST /api/auth/login/password`
- `POST /api/auth/login/sms`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`

---

## 6. 短信通知系统实施方案

### 6.1 目标

支撑注册登录验证码、预约提醒、营销触达三类短信能力。

### 6.2 架构

- `sms_providers`：供应商配置（阿里云/腾讯云）
- `sms_templates`：模板管理（变量、签名、审核状态）
- `sms_messages`：发送记录（状态机）
- 发送链路：API -> Outbox -> BullMQ Worker -> Provider -> 回执更新

### 6.3 风控与稳定性

- 单用户/单 IP/单设备限频。
- 验证码短期有效（默认 5 分钟）。
- 供应商失败自动切换（主备路由）。

---

## 7. 系统集成测试方案

### 7.1 测试分层

- **单元测试**：规则引擎、预约冲突检测、认证策略。
- **集成测试**：数据库读写、事务 outbox、短信 worker。
- **E2E 测试**：线索创建 -> 对话 -> 预约 -> 提醒 -> 复盘闭环。

### 7.2 验收场景（最小闭环）

1. 新用户注册并登录成功。
2. 创建预约并触发提醒任务。
3. 对话结束后自动进入次日复盘。
4. 后台可查看复盘建议并标记处理状态。

### 7.3 非功能指标

- 核心 API P95 < 300ms（不含 AI 推理）
- 预约写入成功率 >= 99.9%
- 短信到达成功率（供应商回执）>= 98%

---

## 8. 建议实施排期（不含企业微信）

### Sprint 1（1 周）
- PostgreSQL 基础迁移 + 双写框架
- 认证体系改造（密码登录）

### Sprint 2（1 周）
- 预约排期主链路 + 日历视图
- 短信验证码与预约提醒

### Sprint 3（1 周）
- AI 复盘系统 + 管理后台复盘页
- 集成测试与灰度发布

---

## 9. 与现有仓库的衔接说明

- 保持现有 `server/routers` 风格，新增 `appointments/auth/sms/review` 路由模块。
- 保持现有前端管理后台结构，新增“预约排期”“复盘中心”“认证安全”菜单。
- 复用现有 AI 与知识库能力，优先补齐向量化与离线任务，不影响线上对话主链路。

---

*最后更新：2026-02-05*
