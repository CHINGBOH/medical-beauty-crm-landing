# 项目结构与覆盖率摘要

本文档基于 `plan_parsed_files.json` 生成，反映当前实现与实施计划的一致性。

## 📁 项目结构

```
medical-aesthetic-marketing-system/
├── backend
│   ├── Dockerfile
│   └── src
│       ├── controllers
│       │   └── async.controller.ts
│       ├── core
│       │   └── queue
│       │       └── core-queue.service.ts
│       ├── models
│       │   ├── content.model.ts
│       │   └── trigger.model.ts
│       ├── pipelines
│       │   └── data-pipeline.ts
│       ├── routes
│       │   ├── rag.route.ts
│       │   └── trpc
│       │       ├── admin.ts
│       │       ├── airtable.ts
│       │       ├── analytics.ts
│       │       ├── auth.ts
│       │       ├── chat.ts
│       │       ├── content.ts
│       │       ├── customers.ts
│       │       ├── knowledge.ts
│       │       ├── router.ts
│       │       ├── triggers.ts
│       │       └── xiaohongshu.ts
│       ├── services
│       │   ├── advanced-rag.service.ts
│       │   ├── ai.service.ts
│       │   ├── airtable.service.ts
│       │   ├── buffer.service.ts
│       │   ├── data-pipeline-engine.service.ts
│       │   ├── image.service.ts
│       │   ├── knowledge-sync.service.ts
│       │   ├── queue
│       │   │   └── business-queue.service.ts
│       │   ├── queue.service.ts
│       │   ├── rag.service.ts
│       │   ├── schema-registry.service.ts
│       │   ├── semantic-understanding.service.ts
│       │   ├── trigger-engine.service.ts
│       │   ├── trigger.service.ts
│       │   ├── weather.service.ts
│       │   ├── websocket
│       │   │   └── queue-status.service.ts
│       │   └── wechat.service.ts
│       └── utils
│           └── logger.ts
├── database
│   ├── init.sql
│   └── migrate.sql
├── docker-compose.data-pipeline.yml
├── docker-compose.yml
├── ecosystem.config.js
├── frontend
│   ├── Dockerfile
│   └── src
│       ├── components
│       │   ├── async
│       │   │   └── AsyncTaskMonitor.tsx
│       │   ├── content
│       │   │   └── ImageGenerator.tsx
│       │   ├── data-pipeline
│       │   │   └── DataPipelineManager.tsx
│       │   ├── layout
│       │   │   └── DashboardLayout.tsx
│       │   └── rag
│       │       └── RAGManagement.tsx
│       └── pages
│           └── dashboard
│               ├── admin.tsx
│               ├── analytics.tsx
│               ├── config.tsx
│               ├── content
│               │   ├── index.tsx
│               │   └── templates.tsx
│               ├── conversations.tsx
│               ├── customers.tsx
│               ├── index.tsx
│               ├── knowledge.tsx
│               ├── triggers.tsx
│               ├── wechat.tsx
│               └── xiaohongshu.tsx
└── prometheus
    ├── alerts.yml
    └── prometheus.yml
```

## ✅ 实施计划覆盖率摘要

- 总文件数：61
- 缺失项：0

按模块分布：

- 前端：18
- 后端：36
- 数据库：2
- 配置/部署：5

按类型分布：

- TypeScript：35
- TSX：17
- YAML：4
- SQL：2
- Dockerfile：2
- JavaScript：1
