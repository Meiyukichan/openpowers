# Hooks - Hook Runner Infrastructure

> Furina 的 Claude Code Hook 运行时基础设施。管理 Agent 会话在工作流各阶段间的生命周期，实现自动 Provider 切换、会话状态管理和变更阶段追踪。通过 `hooks.json` 注册声明式触发规则，`furina_hooks.js` 拦截工具调用（Agent、Bash、AskUserQuestion、MCP propose），采用 regex-first / JSON-fallback 双策略解析 stdin 数据，并分发至 `furina` CLI 命令完成会话管理。

## Spec Relationship Diagram

```
┌───────────────────────────────┐
│      hooks-config             │
│ hooks.json 声明式触发配置     │
│ 定义 7 条 hook 规则映射       │
│ 到 --mode-flag 标志           │
└──────────────┬────────────────┘
               │ Claude Code 事件触发
               ▼
┌───────────────────────────────┐
│      runner-main              │
│ main() 入口 + parseStdin     │
│ 6 个正则常量 + ESM 守卫       │
│ stdin 同步读取 + 模式分发     │
└──────┬────────────┬───────────┘
       │            │
       ▼            ▼
┌──────────────┐  ┌────────────────────────────┐
│ agent-       │  │  propose-bash-question      │
│ lifecycle    │  │  4 个专用处理器              │
│ runBefore-   │  │  runBeforePropose            │
│ Agent        │  │  runInitAgent                │
│ runAfter-    │  │  runBeforeBash               │
│ Agent        │  │  runBeforeQuestion           │
└──────┬───────┘  └──────────────┬─────────────┘
       │                         │
       ▼                         ▼
┌──────────────────────────────────────┐
│          runner-utilities            │
│ 共享基础工具函数层                    │
│ parseStdin / validateBeforeAgent     │
│ build*Command / executeCommand       │
│ writeLog / extract* / write*File     │
└──────────────────────────────────────┘
               ▲
               │ 全面覆盖
┌───────────────────────────────┐
│          hooks-tests          │
│ Vitest 测试套件 (127 用例)    │
│ Mock 策略 + 编码弹性验证       │
│ 全部导出函数 + main 入口       │
└───────────────────────────────┘
```

## Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-hooks-config.md](./spec-hooks-config.md) | 定义 `hooks.json` 的声明式触发配置，覆盖全部 7 条 hook 规则（5 PreToolUse + 1 PostToolUse + 1 UserPromptSubmit）。详述每条规则的 matcher 匹配器（Agent、Bash、AskUserQuestion、MCP markBeginPropose/markEndPropose）、mode flag 映射（`--before-agent`/`--after-agent`/`--init-agent`/`--before-propose`/`--before-bash`/`--before-question`）、触发时序与工作流阶段映射关系。是 Claude Code 运行时与 `furina_hooks.js` 之间的接口契约。 | `marketplace/hooks/hooks.json` |
| [spec-hooks-runner-main.md](./spec-hooks-runner-main.md) | 覆盖 `furina_hooks.js` 的三大核心基础设施：6 个正则模式常量（SESSION_ID_PATTERN、PURPOSE_PATTERN、CWD_PATTERN、PROMPT_PATTERN、COMMAND_PATTERN、CHANGE_NEW_PATTERN）作为所有 handler 共享的字段提取基础；`parseStdin` 函数以 regex-first 策略从原始 stdin 提取 sessionId/cwd；`main()` 入口函数负责同步 stdin 读取（64KB buffer 循环）、模式标志解析和 if-else 条件委派到 6 个 handler。包含 ESM 模块守卫确保仅直接执行时调用 main()。 | `marketplace/scripts/furina_hooks.js` :21-36, 47-59, 768-819 |
| [spec-hooks-runner-utilities.md](./spec-hooks-runner-utilities.md) | 规范所有 hook handler 共享的基础工具函数集合。覆盖四类能力：输入验证（`validateBeforeAgent` 校验 sessionId/purpose/cwd）；命令构建（`buildBeforeAgentCommand`/`buildInitCommand`/`buildWorkflowCommand`/`buildBeforeProposeCommand` 纯函数组装 CLI 参数数组）；命令执行（`executeCommand` 封装 execSync，支持 silent 模式和结构化结果返回）；工具数据提取（`extractToolInput`/`extractToolResponse` 均采用 JSON-parse-first + regex-fallback 双策略应对 BOM、编码问题、畸形 JSON）；文件持久化（`writeOutputFile`/`writePromptFile`/`writeLog` 静默失败策略）。 | `marketplace/scripts/furina_hooks.js` :1-293 |
| [spec-hooks-runner-agent-lifecycle.md](./spec-hooks-runner-agent-lifecycle.md) | 覆盖 Agent 工具生命周期的两个核心处理器：`runBeforeAgent`（PreToolUse 事件）完成子代理启动前的会话初始化、阶段切换（含 integration->coding 映射）、prompt 文件持久化、change stage in_progress 通知；`runAfterAgent`（PostToolUse 事件）完成子代理结束后的会话重初始化、切回 workflow 阶段、toolResponse 文件持久化、change stage done 通知。两个处理器形成完整的 Agent 会话管理闭环，通过 sessionId/toolUseId 关联输入(.txt)和输出(.json)文件。 | `marketplace/scripts/furina_hooks.js` :295-433 |
| [spec-hooks-runner-propose-bash-question.md](./spec-hooks-runner-propose-bash-question.md) | 覆盖四个专用 hook 处理器：`runBeforePropose`（MCP propose 工具前）初始化会话并启用 brainstorm 模式（settings.json brainstorm=true）；`runInitAgent`（UserPromptSubmit 事件）仅在 `/furina:workflow` 前缀 prompt 时静默初始化会话；`runBeforeBash`（Bash 工具前）拦截三种 furina CLI 命令（change new / change instruction --proposal / change archive）并分发到子处理器（`extractChangeName`、`executeChangeNewInit`、`handleChangeInstructionProposal`、`handleChangeArchive`）；`runBeforeQuestion`（AskUserQuestion 工具前）在 brainstorm 模式下捕获问题追加到 question.json。 | `marketplace/scripts/furina_hooks.js` :435-766 |
| [spec-hooks-tests.md](./spec-hooks-tests.md) | 规范 `furina_hooks.js` 的完整 Vitest 测试套件（127 个用例，19 个 describe 组）。采用 vi.hoisted() + vi.mock() 替换 child_process/fs/os 三个 Node.js 核心模块，通过顶层 await import 确保 mock 生效。重点验证：parseStdin 的 13 个编码弹性场景（BOM、中文路径、Windows 路径、emoji、超长输入等）；extractCommandFromRawInput 的 JSON-first/regex-fallback 双策略；runBeforeAgent 的 integration->coding 映射；runBeforeBash 的 if-else 命令分发链；main() 的 6 种模式标志端到端调用链。 | `marketplace/scripts/furina_hooks.test.ts` |
