# Routes API - Express 路由模块

> Routes API 是 Furina 服务端的 HTTP 接口层，负责将 Web UI 前端的请求路由到后端业务逻辑。该子模块包含三个独立的 Express Router 模块：providers 路由（提供商全生命周期管理，包括 CRUD、活跃切换、代理模式、模板管理和 API Key 验证）、config 路由（语言配置读写）和 schedule 路由（调度器启动/停止/重启控制）。所有路由由 `src/server/index.ts` 的 `createApp()` 统一挂载到 `/furina/api/` 路径前缀下，形成完整的 REST API 表面。

## Spec Relationship Diagram

```
                        ┌─────────────────────────────┐
                        │     server/index.ts          │
                        │   (createApp / app.use)      │
                        └──────┬──────────┬──────────┬─┘
                               │          │          │
                    ┌──────────┘          │          └──────────┐
                    ▼                     ▼                     ▼
        ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
        │ Providers Routes  │  │  Config Routes    │  │  Schedule Routes  │
        │ CRUD/活跃/代理/    │  │  语言配置读写      │  │  调度器启停控制    │
        │ 模板/验证          │  │                   │  │                   │
        └───────┬───────────┘  └────────┬──────────┘  └────────┬──────────┘
                │                       │                      │
    ┌───────────┼───────────┐           │                      │
    ▼           ▼           ▼           ▼                      ▼
┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐    ┌──────────────────┐
│providers│ │claude-   │ │provider│ │providers │    │memory/scheduler  │
│-store   │ │settings  │ │-template│ │-store    │    │start/stop/       │
│         │ │          │ │s       │ │(lang ops)│    │isRunning         │
└─────────┘ └──────────┘ └────────┘ └──────────┘    └──────────────────┘
                                                         │
                                                         ▼
                                                ┌──────────────────┐
                                                │memory/schedule-  │
                                                │logger (appendLog)│
                                                └──────────────────┘
```

## Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-providers-routes.md](./spec-providers-routes.md) | 提供商（Provider）API 路由的完整实现文档。覆盖 `/furina/api/providers` 下的 14 个端点：提供商 CRUD（GET/POST/PUT/DELETE）、活跃提供商切换（GET/PUT `/active`）、代理模式管理（GET/PUT `/proxy`）、启用/禁用切换（PUT `/:id/enabled`）、重置（POST `/reset`）、预设模板管理（GET/POST/DELETE `/templates`）、API Key 验证（POST `/validate`）。包含辅助函数 `formatZodError`、`isUpstreamAuthError`（403 响应歧义消解）、`ensureFirstWriteBackup`（首次写入备份守卫）。核心设计特点包括：活跃提供商切换时自动同步 Claude CLI 设置、代理模式/直连模式的环境变量写入策略、三种认证头策略的 API Key 验证、首次写入前的设置备份机制。 | `src/server/routes/providers.ts` |
| [spec-config-routes.md](./spec-config-routes.md) | 配置 API 路由的实现文档。覆盖 `/furina/api/config` 下的 2 个端点：GET 获取当前语言设置（默认 `'chinese'`）、PUT 更新语言设置（`'chinese'` 或 `'english'`）。使用 Zod `SetLanguageSchema` 进行输入校验，实际存储读写委托给 `providers-store` 的 `getLanguage()` / `setLanguage()` 函数。路由本身作为薄接口层，将 HTTP 请求校验与数据存储分离，所有容错逻辑（文件不存在、JSON 解析失败等）均由存储层内部处理。 | `src/server/routes/config.ts`, `src/server/providers-store.ts` (language operations) |
| [spec-schedule-routes.md](./spec-schedule-routes.md) | 调度器 API 路由的实现文档。覆盖 `/furina/api/schedule` 下的 3 个端点：PUT 启动调度器（幂等）、DELETE 停止调度器（幂等）、POST `/restart` 重启调度器。路由作为薄代理层，将 HTTP 请求委托给 `memory/scheduler.ts` 的三个生命周期函数（`startScheduler`、`stopScheduler`、`isSchedulerRunning`），并通过 `memory/schedule-logger.ts` 的 `appendLog()` 记录审计日志。设计要点包括幂等语义（PUT/DELETE 重复调用无副作用）、分层错误处理（PUT/DELETE 无显式 try-catch、POST /restart 有 try-catch）。 | `src/server/routes/schedule.ts` |
