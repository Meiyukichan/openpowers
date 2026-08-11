# Marketplace -- Plugin Marketplace Definition

> Furina 的 Claude Code 插件市场定义模块，包含技能定义、Hook 生命周期引擎、工作流编排、插件清单和资源模板。该模块是 Furina 的智能层，通过 11 个技能定义（brainstorm、cleancode、codebase、commit、explore、finalize、plan、propose、review、sdd、tdd）编排完整的软件开发生命周期，通过 Hook Runner 管理 Agent 会话生命周期，通过 workflow 斜杠命令串联 6 个阶段（Explore -> Propose -> Plan -> Review -> SDD -> Finalize），并通过静态资源文件（配置模板、Provider 预设、制品模板、Agent 定义）提供运行时所需的默认数据和指令模板。

## Module Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Workflow Slash Command                       │
│            顶层编排器：串联 6 阶段工作流，驱动所有技能调用            │
│  Phase 1:Explore  Phase 2:Propose  Phase 3:Plan  Phase 4:Review    │
│  Phase 5:SDD  Phase 6:Finalize                                     │
└──────────┬──────────────────────────────────┬───────────────────────┘
           │ 驱动技能调用                      │ 依赖 MCP 标记工具
           ▼                                   ▼
┌─────────────────────────┐      ┌──────────────────────────────┐
│       Skills            │      │    Plugin Manifest           │
│ 11 个技能定义            │      │ marketplace.json             │
│ 编排各开发阶段的具体逻辑  │      │ plugin.json                  │
│ explore/propose/plan/   │      │ 注册 MCP 服务器              │
│ review/sdd/finalize/    │      │ 暴露 markBegin/EndPropose    │
│ tdd/cleancode/codebase/ │      └──────────┬───────────────────┘
│ brainstorm/commit       │                 │ MCP 工具注册
└──────────┬──────────────┘                 │
           │ skills 消费资源模板              │
           ▼                                │
┌────────────────────────────────────────────┴──────────────────────┐
│                      Resources & Templates                        │
│ furina.json (默认配置) / claude-providers-template.json       │
│ proposal/design/specs-template.json (制品模板)                    │
│ agents/ (backgroud-designer/grouper) / skills/ (compose/group)   │
└──────────┬───────────────────────────────────────────────────────┘
           │ 配置读取 / Provider 切换 / session 管理
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                          Hooks                                    │
│ hooks.json (7 条声明式规则) -> furina_hooks.js                │
│ Agent 生命周期 / Propose 标记 / Bash 拦截 / Question 捕获        │
│ 共享工具层 + Vitest 测试套件 (127 用例)                           │
└──────────────────────────────────────────────────────────────────┘
```

## Submodules

| Submodule | Description | Spec Count | Index |
|-----------|-------------|------------|-------|
| [hooks/](./hooks/) | Hook Runner 运行时基础设施。管理 Agent 会话在工作流各阶段间的生命周期，实现自动 Provider 切换、会话状态管理和变更阶段追踪。通过 `hooks.json` 注册 7 条声明式触发规则（5 PreToolUse + 1 PostToolUse + 1 UserPromptSubmit），`furina_hooks.js` 拦截工具调用（Agent、Bash、AskUserQuestion、MCP propose），采用 regex-first / JSON-fallback 双策略解析 stdin 数据，分发至 `furina` CLI 命令完成会话管理。覆盖 6 个正则模式常量、4 个专用处理器（propose/bash/question/init）、Agent 生命周期双处理器（before/after）和 127 个 Vitest 测试用例。 | 6 specs | [toc.md](./hooks/toc.md) |
| [skills/](./skills/) | Furina 技能定义集。包含 13 个技能（11 个 spec 文档），每个技能是自包含的指令集（SKILL.md + instructions/ + references/），编排软件开发生命周期的特定阶段。工作流主线技能（explore -> brainstorm -> propose -> plan -> review -> sdd -> finalize）按 6 阶段顺序执行，横切技能（tdd、cleancode、codebase、commit）被主线技能按需调用。涵盖多维代码库探索、立场式 brainstorm、制品生成（proposal/design/specs）、Schema 补充与拓扑排序计划、双阶段审查、SubAgent 驱动开发（9 步 per-feature 流程）、TDD 纪律、编码规范查询、代码库文档树管理和 Git 自动提交推送。 | 11 specs | [toc.md](./skills/toc.md) |

## Direct Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-plugin-manifest.md](./spec-plugin-manifest.md) | 插件清单与注册规范。覆盖两个 JSON 清单文件：`marketplace.json` 定义插件市场条目（市场名称、描述、所有者、可安装插件列表），`plugin.json` 定义插件本体（名称、版本、许可证、MCP 服务器配置，将 `furina-mcp-server` 注册为 HTTP 端点 `localhost:3939`）。详述 `furina init` 的 6 步注册流程（版本检查 -> 容错清理 -> 市场注册 -> 插件安装 -> UI 启动）和 `furina remove` 的反向卸载流程，以及 MCP 工具命名空间规则（`mcp__plugin_furina_furina-mcp-server__*`）。 | `marketplace/.claude-plugin/marketplace.json`, `marketplace/.claude-plugin/plugin.json`, `src/commands/init.ts`, `src/commands/remove.ts` |
| [spec-resources-templates.md](./spec-resources-templates.md) | 资源模板与配置规范。覆盖 9 个静态资源文件：`furina.json`（项目默认配置，含语言、阶段级 Provider 映射、探索目标、实验性开关、增强规则、记忆调度 cron）；`claude-providers-template.json`（12 个内置 LLM 提供者注册表，含 baseUrl/模型映射/图标）；3 个制品模板（proposal/design/specs，定义变更产物的生成指令、Markdown 骨架和依赖 DAG）；2 个 Agent 定义（backgroud-designer 设计文档整合、backgroud-grouper 项目群聚类）；2 个 Skill 定义（compose-design 设计文档合并、group-design 多维度加权聚类）。详述三条数据流主线：配置加载与深度合并、制品模板占位符替换、定时记忆同步调度。 | `resources/furina.json`, `resources/claude-providers-template.json`, `resources/proposal-template.json`, `resources/design-template.json`, `resources/specs-template.json`, `resources/agents/backgroud-designer.md`, `resources/agents/backgroud-grouper.md`, `resources/skills/compose-design/SKILL.md`, `resources/skills/group-design/SKILL.md`, `src/utils/config.ts`, `src/utils/provider-templates.ts`, `src/commands/change/instruction.ts`, `src/server/memory/scheduler.ts` |
| [spec-slash-command-workflow.md](./spec-slash-command-workflow.md) | Workflow 斜杠命令规范。定义 `/furina:workflow` 的完整技术规格，覆盖 6 阶段顺序工作流（Explore -> Propose -> Plan -> Review -> SDD -> Finalize）、基于产物的阶段检测与恢复逻辑（产物映射表决定从哪个阶段恢复）、Hooks 集成流程（UserPromptSubmit 拦截、Agent 生命周期管理、Bash 命令分发、Question 捕获）、RED LAW 约束（kebab-case 命名、变更目录确定、自动过渡）、三种工作流模式预设（Lite/Standard/Max 及其 experimental 配置组合）、Feature 计数因子控制、MCP 标记工具（markBeginPropose/markEndPropose）、红线警告列表（13 项绝对禁止行为）。 | `marketplace/commands/workflow.md`, `marketplace/hooks/hooks.json`, `marketplace/scripts/furina_hooks.js`, `src/commands/change/new.ts`, `src/commands/change/shared.ts`, `src/commands/config.ts`, `src/server/mcp/index.ts` |
