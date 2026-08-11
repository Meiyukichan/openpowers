# CLI 模块

> Furina 的完整命令行界面系统。基于 Commander.js 构建，提供 12 个顶层命令（init、ui、active、launch、remove、recover、change、config、enable、disable、agents、schedule），覆盖插件安装初始化、UI 服务生命周期管理（启动/重启/探活/停止）、代理开关与 Claude 设置备份恢复、会话级模型路由、全局配置的分层读写与模式预设，以及完整的变更制品生命周期管理（创建/列表/状态/归档/指令/feature/智能阶段路由）。入口采用 barrel 模式集中注册所有命令，change 子命令拆分为独立子模块（8 个 spec），其余命令各自对应一个 spec 文档。

## Module Relationship Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    entry-barrel                          │
│   bin/furina.js → src/cli/index.ts                  │
│   Commander 实例创建, 注册全部 12 个命令模块               │
└─┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──────────────────────┘
  │  │  │  │  │  │  │  │  │  │  │  │
  │  │  │  │  │  │  │  │  │  │  │  └──►┌────────────────┐
  │  │  │  │  │  │  │  │  │  │  │      │ schedule       │
  │  │  │  │  │  │  │  │  │  │  │      │ 定时任务管理     │
  │  │  │  │  │  │  │  │  │  │  │      └────────────────┘
  │  │  │  │  │  │  │  │  │  │  └──►┌────────────────────┐
  │  │  │  │  │  │  │  │  │  │      │ config             │
  │  │  │  │  │  │  │  │  │  │      │ 配置读写与模式预设   │
  │  │  │  │  │  │  │  │  │  │      └────────────────────┘
  │  │  │  │  │  │  │  │  │  └──►┌────────────────────┐
  │  │  │  │  │  │  │  │  │      │ agents             │
  │  │  │  │  │  │  │  │  │      │ 会话级模型路由       │
  │  │  │  │  │  │  │  │  │      └────────────────────┘
  │  │  │  │  │  │  │  │  └──►┌────────────────────────────────┐
  │  │  │  │  │  │  │  │      │ disable                       │
  │  │  │  │  │  │  │  │      │ 清除代理标志 / 恢复 Claude 设置 │
  │  │  │  │  │  │  │  │      └──────────────┬────────────────┘
  │  │  │  │  │  │  │  └──►┌─────────────────┴───────────────┐
  │  │  │  │  │  │  │      │ enable                          │
  │  │  │  │  │  │  │      │ 启动服务 / 写入代理标志 / 同步设置 │
  │  │  │  │  │  │  │      └─────────────────────────────────┘
  │  │  │  │  │  │  │         共享: providers-store / claude-settings / service-manager
  │  │  │  │  │  │  └──►┌────────────────────────────────┐
  │  │  │  │  │  │      │ recover                       │
  │  │  │  │  │  │      │ 恢复 Claude 设置 (从备份)       │
  │  │  │  │  │  │      └───────────────────────────────┘
  │  │  │  │  │  └──►┌────────────────────────────────────┐
  │  │  │  │  │      │ remove                             │
  │  │  │  │  │      │ 卸载插件与 marketplace (--yes 跳过) │
  │  │  │  │  │      └────────────────────────────────────┘
  │  │  │  │  └──►┌──────────────────────────────────────┐
  │  │  │  │      │ launch / active                      │
  │  │  │  │      │ launch: 防火即忘启动 (exit 0)         │
  │  │  │  │      │ active: 健康探活+自愈 (exit 1=重试)   │
  │  │  │  │      └──────────────────────────────────────┘
  │  │  │  └──►┌──────────────────────────────────────────┐
  │  │  │      │ ui                                       │
  │  │  │      │ UI 服务管理: 启动/重启/浏览器打开          │
  │  │  │      │ 含 gracefulShutdown 级联关闭              │
  │  │  │      └──────────────────────────────────────────┘
  │  │  └──►┌──────────────────────────────────────────────┐
  │  │      │ init                                         │
  │  │      │ 插件初始化: 检查→卸载旧→添加仓库→安装→启动 UI │
  │  │      └──────────────────────────────────────────────┘
  │  └──►┌──────────────────────────────────────────────────────────┐
  │      │ change/ (子模块)                                         │
  │      │ 变更制品生命周期: new→list→status→feature→stage→archive   │
  │      │ 含指令生成、智能阶段路由、feature DAG 调度                 │
  │      │ 8 个 spec 文档 → 详见 change/toc.md                      │
  │      └──────────────────────────────────────────────────────────┘
  │
  ▼ (所有命令共享以下基础设施)
┌──────────────────────────────────────────────────────────────┐
│ port-manager.ts / service-manager.ts / providers-store.ts    │
│ claude-settings.ts / config.ts (utils) / session.ts          │
│ 端口探测 / 服务启停 / 代理标志 / 设置备份 / 配置读写 / 会话   │
└──────────────────────────────────────────────────────────────┘
```

## Submodules

| Submodule | Description | Spec Count | Index |
|-----------|-------------|------------|-------|
| [change/](./change/) | 变更制品生命周期管理子模块。管理完整的 change 工作单元：创建（kebab-case 校验+两级存储）、列表展示、制品流水线状态计算（proposal/design/specs 的 ready/done/blocked 状态机）、归档（原子目录移动+注册表更新+全局内存同步）、JSON 模板指令生成（占位符替换+依赖检查）、feature 生命周期管理（pending→in_progress→done 流转、DFS 循环检测、依赖解析、DAG 拓扑调度），以及基于 change 状态和 feature 进度的智能阶段进度路由（10 个阶段、非空覆盖合并、explore→coding 自动转发、coding→finalize.integration 条件路由）。 | 8 specs | [toc.md](./change/toc.md) |

## Direct Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-entry-barrel.md](./spec-entry-barrel.md) | **CLI 入口与命令注册**：定义 `bin/furina.js` Shebang 入口和 `src/cli/index.ts` 的 barrel 注册逻辑。创建 Commander.js 根实例，从 `package.json` 读取版本号，按顺序调用 12 个 `register*Command()` 函数（init、ui、active、launch、remove、recover、change、config、enable、disable、agents、schedule）注册全部子命令，最后导出 `program` 实例供 bin 脚本调用 `parseAsync(process.argv)`。 | `bin/furina.js`, `src/cli/index.ts` |
| [spec-init.md](./spec-init.md) | **插件初始化**：实现 `furina init` 的 5 步安装流程——检查 Claude CLI 是否可用（fatal）、卸载旧版 furina 插件（tolerant，静默跳过）、移除旧版 marketplace（tolerant）、添加 furina marketplace（fatal）、安装插件（fatal）、自动启动 UI 服务。致命步骤失败调用 `process.exit(1)`，容忍步骤失败静默继续。依赖 `@anthropic-ai/claude-code` SDK 执行子进程操作。 | `src/commands/init.ts` |
| [spec-ui.md](./spec-ui.md) | **UI 服务管理**：实现 `furina ui` 命令的三条执行路径——`--restart` 模式（级联关闭再启动）、服务已运行时仅打开浏览器、服务未运行时完整启动流程。`--restart` 的 gracefulShutdown 实现为：先 HTTP POST `/furina/api/shutdown` 优雅关闭，轮询端口释放（最多 5s），最终 force kill PID 文件中记录的进程作为后备。启动后自动在默认浏览器打开 `http://localhost:3939/furina/ui`。依赖 port-manager.ts 的端口探测和 gracefulShutdown，service-manager.ts 的 startBackendService。 | `src/commands/ui.ts`, `src/server/service-manager.ts`, `src/utils/port-manager.ts` |
| [spec-launch-active.md](./spec-launch-active.md) | **服务启动与健康探活**：覆盖两个面向无头/自动化场景的命令。`launch` 防火即忘启动——端口空闲时 spawn 后台进程并 exit 0，端口占用时直接返回。`active` 是工作流 agent 的健康检查+自愈原语——端口占用返回 exit 0（服务就绪），端口空闲则启动服务并返回 exit 1（信号：服务刚启动，caller 需重试）。两者均不打开浏览器，通过 `isPortInUse()` 非侵入式端口探测避免重复启动。 | `src/commands/launch.ts`, `src/commands/active.ts`, `src/utils/port-manager.ts`, `src/server/service-manager.ts` |
| [spec-enable-disable.md](./spec-enable-disable.md) | **代理开关与 Claude 设置同步**：`enable` 命令确保后端服务运行（复用 launch 逻辑）→ 写入 providers-store 代理标志 → 同步 Claude settings.json（首次运行创建备份 `settings.backup.json`）。`disable` 命令清除代理标志 → 恢复 Claude 设置（优先从环境变量 `PROVIDER` 读取，否则从备份文件恢复）。两命令共享 providers-store.ts（代理标志 CRUD）、claude-settings.ts（设置读写与备份/恢复）、service-manager.ts/port-manager.ts（服务生命周期）。 | `src/commands/enable.ts`, `src/commands/disable.ts`, `src/utils/providers-store.ts`, `src/server/claude-settings.ts`, `src/server/service-manager.ts`, `src/utils/port-manager.ts` |
| [spec-recover.md](./spec-recover.md) | **Claude 设置恢复**：`furina recover` 是 `claude-settings.ts` 中 `restoreClaudeSettings()` 函数的薄命令层包装。直接委托给恢复函数，返回布尔值（true=已恢复，false=无备份文件），从不调用 `process.exit()`。用于在 settings.json 被意外损坏或代理标志残留时手动恢复到备份状态。 | `src/commands/recover.ts`, `src/server/claude-settings.ts` |
| [spec-remove.md](./spec-remove.md) | **插件卸载**：`furina remove` 命令实现容错卸载流程——先卸载 furina 插件，再移除 marketplace，两步均容错（单步失败不阻塞后续步骤）。`--yes` 标志跳过交互确认，TTY 检测决定是否输出交互式提示。`buildSummary()` 函数生成人类可读的移除结果摘要（成功/失败项列表）。 | `src/commands/remove.ts` |
| [spec-agents.md](./spec-agents.md) | **会话级模型路由管理**：`furina agents` 命令提供 4 个子命令——`list`（列出可用 provider 或会话映射）、`show`（查看指定会话的 stage→model 映射）、`switch`（切换会话或全局默认模型）、`init`（创建新会话配置）。定义 `VALID_STAGES` 常量（workflow、explore、propose、plan、review、coding、finalize）约束 stage 参数。依赖 providers-store.ts（provider 列表）、config.ts（全局配置读取）、session.ts（会话级映射持久化）。 | `src/commands/agents.ts` |
| [spec-config.md](./spec-config.md) | **全局配置管理**：`furina config` 命令提供 4 个子命令——`list`（输出完整配置 JSON）、`show`（dot-path 查询单值或 codebases 聚合）、`mode`（lite/standard/max 三级预设，通过 `MODE_PRESETS` 控制 `experimental.*` 开关）、`set`（类型推断写入，`--global` 控制写入层级）。采用两层配置模型：`resources/furina.json`（全局默认，不可修改）+ `.claude/furina.json`（项目级覆盖），Zod schema 验证确保类型安全。 | `src/commands/config.ts`, `src/utils/config.ts` |
| [spec-schedule.md](./spec-schedule.md) | **定时任务管理**：`furina schedule` 命令提供 2 个子命令——`restart`（POST `/furina/api/schedule`）、`stop`（DELETE `/furina/api/schedule`）。内部 `sendApiRequest()` 使用原生 `http.request` 发送本地 API 请求，5 秒超时。不直接操作 cron 或定时器，而是通过 HTTP API 委托给后端 Express 服务的 schedule 路由处理实际调度逻辑。 | `src/commands/schedule/index.ts`, `src/commands/schedule/request.ts` |
