# Server Module

> Express-based background service module that hosts the Web UI backend, Anthropic-compatible API proxy, REST API routes, MCP endpoints, memory scheduling subsystem, providers persistent store, Claude settings management, and background service process control. This module serves as the server-side runtime backbone of Furina, exposing HTTP endpoints for the React SPA frontend, transparently proxying Anthropic API requests to upstream LLM providers, managing provider configurations and Claude CLI settings, and running a background cron scheduler for memory aggregation tasks.

## Module Relationship Diagram

```
                          ┌──────────────────────┐
                          │   app-entry / entry   │
                          │ 应用工厂 & 服务器引导  │
                          └──────────┬───────────┘
                                     │ mounts all routers + starts scheduler
                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         routes-api (REST 路由层)                      │
│  config-routes · providers-routes · schedule-routes · changes-api   │
└────────┬───────────────┬───────────────┬────────────────────────────┘
         │               │               │
         │               │               ▼
         │               │   ┌─────────────────────┐
         │               │   │   memory-subsystem   │
         │               │   │ scheduler · sync     │
         │               │   │ schedule-logger      │
         │               │   └─────────────────────┘
         │               ▼
         │   ┌───────────────────────┐
         │   │   providers-store     │
         │   │ CRUD · active · query │
         │   │ schemas · settings    │
         │   └───────────┬───────────┘
         │               │
         ▼               ▼
┌────────────────┐  ┌──────────────────┐
│ claude-settings│  │ anthropic-proxy  │
│ env generation │  │ handler · router │
│ settings r/w   │  │ logger · types   │
└────────────────┘  └──────────────────┘

         ┌──────────────────┐
         │   mcp-marker     │
         │ MCP 标记服务      │
         └──────────────────┘

         ┌──────────────────┐
         │ service-manager  │
         │ 后台进程生命周期   │
         └──────────────────┘
```

## Submodules

| Submodule | Description | Spec Count | Index |
|-----------|-------------|------------|-------|
| [anthropic-proxy/](./anthropic-proxy/) | Anthropic API 兼容代理子模块，负责将客户端发往 `/v1/messages` 等 Anthropic API 端点的请求透明转发至上游 LLM Provider。核心功能包括：Provider 解析与认证注入、流式响应检测与双层流处理、模型名称映射、hop-by-hop 头部清洗、超时差异化配置（messages 600s / 其他 120s）、全局与会话级独立日志记录。由 `router.ts` 注册 Express 路由，`handler.ts` 执行核心转发，`logger.ts` 提供日志隔离，`types.ts` 定义共享常量。 | 4 specs | [toc.md](./anthropic-proxy/toc.md) |
| [claude-settings/](./claude-settings/) | Claude CLI 配置管理子模块，负责 `~/.claude/settings.json` 文件的读写、备份恢复以及环境变量配置生成。根据运行模式（代理模式 / 直连 Provider 模式）生成正确的 `ANTHROPIC_*` 环境变量对象并写入 Claude 设置文件，同时在首次写入前备份用户原始配置以支持后续恢复。被 `providers-routes` 在 Provider 切换/启用/禁用时调用，也被 CLI 命令层（enable / disable / recover）调用。 | 2 specs | [toc.md](./claude-settings/toc.md) |
| [memory-subsystem/](./memory-subsystem/) | 内存调度子模块，负责后台 cron 定时任务的调度执行，扫描 `~/.furina/memory/` 目录下待处理的设计文档，调用 Claude CLI 进行自动化项目设计处理和跨项目记忆聚合。包含调度器核心（scheduler）、设计文档同步（sync-design）、项目分组校验（project-group-schema）和调度专用日志（schedule-logger）。调度器支持从配置文件动态读取 cron 表达式，提供完整的生命周期管理接口，并通过 REST API 暴露启停控制。 | 4 specs | [toc.md](./memory-subsystem/toc.md) |
| [providers-store/](./providers-store/) | Provider 持久化存储子模块，以 `~/.furina/providers.json` 为单一数据源，管理 LLM Provider 的完整生命周期。包含 Zod schema 定义与文件 I/O 基础层、Provider CRUD 操作、活跃 Provider 状态管理（含级联清除）、默认 Provider 解析与模型反查查询，以及全局设置标志（proxy 开关、Claude 备份守卫、语言偏好）。所有操作遵循 read-modify-write 同步事务模式，通过 Zod 保证类型安全。 | 5 specs | [toc.md](./providers-store/toc.md) |
| [routes-api/](./routes-api/) | Express REST API 路由层，为前端 Web UI 提供 HTTP 接口。包含三条路由模块：`config-routes` 管理语言配置（GET/PUT）；`providers-routes` 覆盖 Provider CRUD、活跃切换、代理模式切换、预设模板和 API Key 验证等全生命周期管理；`schedule-routes` 提供调度器启动/停止/重启控制。路由层本身为薄代理层（thin delegation layer），所有业务逻辑委托给 `providers-store`、`claude-settings`、`memory-subsystem` 等下游模块。 | 3 specs | [toc.md](./routes-api/toc.md) |

## Direct Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-app-entry.md](./spec-app-entry.md) | 应用工厂与服务器引导：`index.ts` 创建并配置 Express 应用实例（挂载所有业务路由、SPA 静态文件服务、beforeProxy 钩子、Anthropic 代理 catch-all），`entry.ts` 执行服务器完整引导流程（调用 createApp、注册优雅关闭路由、启动 HTTP 监听、启动调度器、安装全局异常处理）。两个文件分离了应用配置与进程级启动/关闭逻辑，使得 createApp() 可被测试直接调用。 | `src/server/index.ts`, `src/server/entry.ts` |
| [spec-changes-api.md](./spec-changes-api.md) | Changes API 路由与跨项目变更聚合：提供三条 GET 路由，支持单项目变更查询（读取本地 `changes.json`）、按名称精确查询（查 changes + archive）、以及跨项目全局聚合查询（扫描 Memory 目录下所有项目的 changes.json，支持 cwd/status 过滤、模糊搜索和按时间降序排序）。`shared.ts` 实现并发读取与多维过滤数据管道，`index.ts` 为 Express Router 薄层。 | `src/server/changes/index.ts`, `src/server/changes/shared.ts` |
| [spec-mcp-marker.md](./spec-mcp-marker.md) | MCP 标记服务：基于 Model Context Protocol 的轻量级标记服务，挂载于 `/furina/mcp` 路径，提供 `markBeginPropose` 和 `markEndPropose` 两个 MCP 工具。AI Agent 在 Furina workflow 的 propose 阶段调用这些工具标记阶段边界，系统其他组件通过检测标记文本确定工作流阶段。采用无状态模式运行（每次请求创建全新 McpServer 实例），遵守 CVE-2026-25536 安全修复。 | `src/server/mcp/index.ts` |
| [spec-service-manager.md](./spec-service-manager.md) | 后台服务进程生命周期管理：`service-manager.ts` 将 Express UI/代理服务器作为分离的后台子进程启动（`detached: true`），使 CLI 主进程可在启动服务后立即返回。支持 PID 和端口号持久化到 `~/.furina/.furina.pid`，供优雅关闭使用；启动前预检 `dist/client/` 构建产物是否存在；使用 `windowsHide: true` 防止 Windows 平台弹出命令行窗口。 | `src/server/service-manager.ts` |
