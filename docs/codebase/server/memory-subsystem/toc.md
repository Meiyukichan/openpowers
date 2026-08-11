# Memory Subsystem（内存调度子系统）

> 负责后台定时扫描 `~/.furina/memory/` 目录下的待处理设计文档，通过 Claude CLI 执行自动化设计处理和跨项目分组聚合，并提供调度器生命周期管理、日志记录和数据校验能力。该子系统将离散的"设计文档写入"事件与定时的批量处理任务连接起来，形成完整的"写入-处理-聚合-清理"流水线。

## Spec Relationship Diagram

```
                        ┌──────────────────────────────┐
                        │         sync-design           │
                        │  同步 design.md 到全局内存      │
                        │  通知调度器确保运行              │
                        └──────┬───────────┬────────────┘
                               │           │
                  依赖 appendLog│           │ HTTP PUT /schedule
                               │           │(间接触发)
                               ▼           ▼
┌──────────────────────────┐     ┌──────────────────────────────┐
│     schedule-logger      │     │          scheduler            │
│  追加式日志记录到          │◄────│  Cron 定时任务管理              │
│  dreamwork.log           │     │  扫描/处理/聚合/清理流水线       │
└──────────────────────────┘     └──────────────┬───────────────┘
                                                │
                                   调用校验函数    │
                                                ▼
                                 ┌──────────────────────────────┐
                                 │     project-group-schema      │
                                 │  Zod schema 定义与验证          │
                                 │  project-groups.json 校验      │
                                 └──────────────────────────────┘
```

## Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-scheduler.md](./spec-scheduler.md) | 调度器核心模块，基于 node-cron 实现后台定时任务。负责扫描 `~/.furina/memory/` 下的 `Memory_*` 目录，识别有待处理 `.md` 设计文档的项目目录，串行执行 `processProject()` 调用 Claude CLI `backgroud-designer` agent 生成项目画像和设计汇总，执行完毕后调用 `syncProjectGroup()` 聚合各项目的 `project-design.md` 并调用 `backgroud-grouper` agent 进行跨项目分组。导出 `startScheduler()`/`stopScheduler()`/`isSchedulerRunning()` 三个生命周期接口，供服务器启动关闭和 REST API 路由调用。支持从 `furina.json` 配置文件动态读取 cron 表达式，默认每天凌晨 2 点执行。 | `src/server/memory/scheduler.ts` |
| [spec-schedule-logger.md](./spec-schedule-logger.md) | 调度子系统的专用追加式日志模块，提供唯一的 `appendLog()` 函数接口。将带 ISO 8601 UTC 时间戳的日志行同步追加写入 `~/.furina/memory/dreamwork.log` 文件，首次调用时自动创建日志目录。被调度器（scheduler）、设计同步（sync-design）、服务器入口（entry）和 API 路由（routes/schedule）共同调用，形成完整的调度操作追踪链路。不做内部错误处理，异常直接冒泡到调用方。 | `src/server/memory/schedule-logger.ts` |
| [spec-sync-design.md](./spec-sync-design.md) | 设计文档同步模块，提供 `syncDesignToMemory()` 函数。在 feature status 查询时被调用，将项目本地的 `furina/changes/{changeName}/design.md` 文件复制到全局内存路径 `~/.furina/memory/{flatCwd}/designs/`，随后通过 HTTP PUT 调用 `/furina/api/schedule` 确保调度器正在运行。采用静默失败策略（5 秒超时），所有错误通过 `appendLog()` 记录到 dreamwork.log，不阻塞上游 feature status 查询流程。同时 re-export `flattenCwdPath()` 工具函数供向后兼容。 | `src/server/memory/sync-design.ts` |
| [spec-project-group-schema.md](./spec-project-group-schema.md) | 项目群数据校验模块，定义 `project-groups.json` 的 Zod schema 并提供 `validateProjectGroupsFile()` 文件级验证函数。使用 `.strict()` 模式拒绝 LLM 生成的未声明字段，通过三层独立错误捕获（文件读取、JSON 解析、schema 校验）返回 Discriminated Union 结果。在调度器的 `syncProjectGroup()` 流程中被调用，校验 grouper agent 生成的输出，校验失败则删除无效文件等待下次重试。同时通过 `z.infer` 自动导出 `ProjectGroupEntry` 和 `ProjectGroups` 类型定义。 | `src/server/memory/project-group-schema.ts` |
