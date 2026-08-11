# Hooks Configuration (hooks.json)

> Source files:
> - `marketplace/hooks/hooks.json` : 1-72

## Overview

`hooks.json` 是 Furina 插件的 **Claude Code Hooks 注册配置文件**，它声明式地定义了所有生命周期钩子（Hook）的触发规则。该文件是 Furina 与 Claude Code 运行时之间的"接口契约"——它告诉 Claude Code：**在哪个生命周期事件发生、匹配哪个工具时，调用哪个外部脚本**。

**在系统中的定位**：`hooks.json` 位于 Claude Code 插件的根目录 `marketplace/hooks/` 下，是插件 manifest（`plugin.json`）自动加载的标准位置。Claude Code 运行时在启动时读取此文件，将其 hook 规则注册到内部事件分发系统中。之后，每当匹配的工具被调用（或用户提交 prompt），Claude Code 会按照此文件中的规则调用 `furina_hooks.js` 脚本。

**设计动机**：Furina 需要在 Claude Code 代理执行过程中自动完成以下任务：
- **Provider 切换**：在子代理启动前/完成后，根据工作流阶段切换到配置的 LLM 提供商
- **会话管理**：初始化 agent 会话、切换到正确的工作流阶段
- **状态追踪**：在 change 管理系统中记录阶段状态（in_progress / done）
- **Brainstorm 模式管理**：在 propose 阶段自动启用/禁用 brainstorm 模式
- **问题捕获**：在 brainstorm 模式下，将用户问题自动记录到 question.json
- **命令拦截**：检测特定的 Bash 命令（如 `furina change new`、`furina change archive`）并触发相应处理

这些任务无法通过 Claude Code 的内置配置实现，必须借助 hook 机制在工具调用的前后插入自定义逻辑。

**使用场景**：此文件在以下时刻被 Claude Code 运行时读取和执行：
- 插件安装/加载时：Claude Code 解析 `hooks.json` 并注册所有 hook 规则
- 用户每次提交 prompt 时：触发 `UserPromptSubmit` hook
- Agent 工具调用前/后：触发 `PreToolUse`/`PostToolUse` hook
- Bash 工具调用前：触发 `PreToolUse` hook
- MCP propose 工具调用前/后：触发 `PreToolUse` hook
- AskUserQuestion 工具调用前：触发 `PreToolUse` hook

**涉及文件及职责**：
- `marketplace/hooks/hooks.json`：hook 触发配置，声明所有 hook 规则（本 spec 的主体）
- `marketplace/scripts/furina_hooks.js`：hook 执行脚本，接收 mode flag 参数后执行实际逻辑

## Architecture / Flow

### hooks.json 在系统中的位置

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code Runtime                          │
│                                                                 │
│  ┌──────────────────┐     ┌─────────────────────────────────┐  │
│  │  plugin.json      │────▶│  hooks.json (本文件)             │  │
│  │  (插件清单)       │     │  注册所有 hook 规则              │  │
│  └──────────────────┘     └──────────────┬──────────────────┘  │
│                                          │                      │
│                                          ▼                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Hook Event Dispatcher                        │  │
│  │                                                           │  │
│  │  Tool Invoke ──┬── PreToolUse  ──┬── matcher match? ──┐   │  │
│  │                │                 │                     │   │  │
│  │                └── PostToolUse ──┼── matcher match? ──┤   │  │
│  │                                  │                     │   │  │
│  │  User Prompt ─── UserPromptSubmit── (no matcher) ──────┤   │  │
│  │                                  │                     │   │  │
│  │                                  ▼                     │   │  │
│  │                     ┌──────────────────────┐           │   │  │
│  │                     │  Execute hook command │           │   │  │
│  │                     │  stdin = tool context │           │   │  │
│  │                     └──────────┬───────────┘           │   │  │
│  └────────────────────────────────┼───────────────────────┘   │  │
│                                   │                            │  │
└───────────────────────────────────┼────────────────────────────┘  │
                                    ▼
                    ┌──────────────────────────────────┐
                    │  furina_hooks.js              │
                    │  根据 mode flag 分派到对应处理器   │
                    │                                   │
                    │  --before-agent  → runBeforeAgent │
                    │  --after-agent   → runAfterAgent  │
                    │  --init-agent    → runInitAgent   │
                    │  --before-propose → runBeforePropose │
                    │  --before-bash   → runBeforeBash  │
                    │  --before-question → runBeforeQuestion │
                    └──────────────────────────────────┘
```

### Hook 触发时序与工作流阶段映射

下图展示 hooks.json 中注册的各个 hook 在一个典型工作流执行周期中的触发顺序：

```
用户提交 prompt
    │
    ▼
UserPromptSubmit ─── init-agent ──── agents init + agents switch (workflow)
    │
    ▼
Agent 工具调用 (子代理启动)
    │
    ▼
PreToolUse[Agent] ─── before-agent ── agents init + agents switch (target stage) + change stage in_progress
    │
    ▼ (子代理执行中，调用 Bash 工具)
PreToolUse[Bash] ─── before-bash ─── 检测 change new / change archive 命令并处理
    │
    ▼ (子代理调用 AskUserQuestion)
PreToolUse[AskUserQuestion] ─── before-question ─── brainstorm 模式下捕获问题
    │
    ▼ (子代理调用 markBeginPropose MCP 工具)
PreToolUse[markBeginPropose] ─── before-propose ─── 切换到 propose 阶段 + 启用 brainstorm
    │
    ▼ (子代理调用 markEndPropose MCP 工具)
PreToolUse[markEndPropose] ─── after-agent ─── 切换到 workflow 阶段 + change stage done
    │
    ▼ (子代理完成)
PostToolUse[Agent] ─── after-agent ─── agents switch (workflow) + change stage done
```

### Hook 事件类型说明

Claude Code 定义了三种 hook 事件类型，`hooks.json` 中使用了全部三种：

| 事件类型 | 触发时机 | 可用 matcher | stdin 数据 |
|---------|---------|-------------|-----------|
| `PreToolUse` | 工具调用**之前** | 工具名称 | 工具输入参数（tool_input） |
| `PostToolUse` | 工具调用**之后** | 工具名称 | 工具输出结果（tool_response） |
| `UserPromptSubmit` | 用户提交 prompt 时 | 无（全局触发） | prompt 内容、session_id、cwd |

## Functionality / Interface Details

### `PreToolUse[0]` - Agent 前置钩子 (before-agent)

**Source**: `marketplace/hooks/hooks.json`:3-12

**功能描述**：当 Claude Code 即将调用 `Agent` 工具（子代理工具）时，此 hook 在调用之前触发。Agent 工具是 Claude Code 中用于启动子代理的核心工具，Furina 利用此 hook 在子代理启动前完成会话初始化和阶段切换。具体执行的操作包括：验证 sessionId、purpose、cwd 参数，调用 `agents init` 初始化代理会话，调用 `agents switch` 切换到目标阶段（如 coding 阶段），以及调用 `change stage` 将变更状态设为 `in_progress`。

**配置结构**：

```json
{
  "matcher": "Agent",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --before-agent"
    }
  ]
}
```

**配置字段说明**：
- `matcher` (`string`): 工具匹配器，值为 `"Agent"` 表示精确匹配 Claude Code 的 Agent 工具。当 Claude Code 准备调用名为 `Agent` 的工具时，此规则被激活。
- `hooks` (`Array<HookEntry>`): hook 执行体数组。当前每个 matcher 只注册一个 hook 命令。
- `hooks[].type` (`string`): hook 类型，`"command"` 表示执行外部命令。
- `hooks[].command` (`string`): 要执行的命令行。使用 `${CLAUDE_PLUGIN_ROOT}` 变量引用插件根目录，`--before-agent` 为传递给 `furina_hooks.js` 的模式标志。

**触发条件**：Claude Code 准备调用 `Agent` 工具（PreToolUse 事件 + matcher 为 `"Agent"`）。

**传递给 furina_hooks.js 的 stdin 数据**：Claude Code 通过 stdin 以 JSON 格式传递工具输入参数，包含 `session_id`（会话标识）、`cwd`（工作目录）、`tool_input`（Agent 工具的输入参数，包含 prompt、description 等字段）。

---

### `PreToolUse[1]` - MCP markBeginPropose 前置钩子 (before-propose)

**Source**: `marketplace/hooks/hooks.json`:13-22

**功能描述**：当 Claude Code 即将调用 MCP 工具 `markBeginPropose` 时，此 hook 在调用之前触发。`markBeginPropose` 是 Furina MCP 服务器提供的工具，用于标记 propose 阶段的开始。此 hook 将 `furina_hooks.js` 以 `--before-propose` 模式调用，触发 `runBeforePropose` 处理器，该处理器执行以下操作：
1. 初始化 agent 会话（`agents init`）
2. 切换到 propose 阶段（`agents switch`）
3. 将 `settings.json` 中的 `brainstorm` 标志设为 `true`
4. 调用 `change stage brainstorm`

**配置结构**：

```json
{
  "matcher": "mcp__plugin_furina_furina-mcp-server__markBeginPropose",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --before-propose"
    }
  ]
}
```

**配置字段说明**：
- `matcher` (`string`): MCP 工具的完全限定名，格式为 `mcp__{plugin}__{server}__{toolName}`。此值匹配 Furina MCP 服务器暴露的 `markBeginPropose` 工具。
- 其余字段同 `PreToolUse[0]`。

**触发条件**：Claude Code 准备调用 `markBeginPropose` MCP 工具。

**与 workflow 的关系**：在 workflow 的 Phase 2 (Propose) 阶段，workflow 指令会先调用 `markBeginPropose` MCP 工具，此时此 hook 自动将环境切换到 propose 阶段并启用 brainstorm 模式，为后续的 brainstorm 技能执行做好准备。

---

### `PreToolUse[2]` - Bash 前置钩子 (before-bash)

**Source**: `marketplace/hooks/hooks.json`:23-30

**功能描述**：当 Claude Code 即将调用 `Bash` 工具执行 shell 命令时，此 hook 在命令执行之前触发。此 hook 主要用于**命令拦截**——通过解析即将执行的 Bash 命令，检测 Furina 特有的 CLI 命令并触发相应的处理逻辑。`runBeforeBash` 处理器通过 `extractCommandFromRawInput` 从 stdin 的 `rawInput` 中提取 `command` 字段，然后执行以下三种命令检测：

1. **`furina change new <name>`**：检测到新建变更命令时，调用 `handleChangeNewInit`，提取变更名称并通过 `agents init --change` 初始化变更上下文。
2. **`furina change instruction proposal`**：检测到提交提案指令时，调用 `handleChangeInstructionProposal`，将 brainstorm 标志设为 `false` 并调用 `change stage propose`。
3. **`furina change archive`**：检测到归档命令时，调用 `handleChangeArchive`，调用 `change stage archive`。

**配置结构**：

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --before-bash"
    }
  ]
}
```

**配置字段说明**：
- `matcher` (`string`): 值为 `"Bash"`，匹配 Claude Code 的 Bash 工具。
- 其余字段同 `PreToolUse[0]`。

**触发条件**：Claude Code 准备调用 `Bash` 工具执行任意 shell 命令。注意：此 hook 在**每次** Bash 工具调用时都会触发，不仅仅是 Furina 命令。对于非 Furina 命令，hook 脚本会快速跳过不做任何处理。

---

### `PreToolUse[3]` - MCP markEndPropose 前置钩子 (after-agent)

**Source**: `marketplace/hooks/hooks.json`:31-40

**功能描述**：当 Claude Code 即将调用 MCP 工具 `markEndPropose` 时，此 hook 在调用之前触发。`markEndPropose` 用于标记 propose 阶段的结束。尽管事件类型为 `PreToolUse`，但此 hook 使用 `--after-agent` 模式标志调用 `furina_hooks.js`，触发 `runAfterAgent` 处理器。该处理器执行以下操作：
1. 切换回 workflow 阶段（`agents switch`）
2. 捕获工具响应输出（`extractToolResponse`）
3. 调用 `change stage done` 将变更状态设为完成

**设计说明**：此 hook 使用 `--after-agent` 模式标志（而非 `--after-propose`）的原因是 `runAfterAgent` 处理器的逻辑（切换回 workflow 阶段 + 记录 done 状态）恰好与 markEndPropose 场景的需求一致。复用 `--after-agent` 模式避免了不必要的处理器重复。

**配置结构**：

```json
{
  "matcher": "mcp__plugin_furina_furina-mcp-server__markEndPropose",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --after-agent"
    }
  ]
}
```

**配置字段说明**：
- `matcher` (`string`): MCP 工具完全限定名，匹配 `markEndPropose` 工具。
- 其余字段同 `PreToolUse[0]`。

**触发条件**：Claude Code 准备调用 `markEndPropose` MCP 工具。

---

### `PreToolUse[4]` - AskUserQuestion 前置钩子 (before-question)

**Source**: `marketplace/hooks/hooks.json`:41-48

**功能描述**：当 Claude Code 即将调用 `AskUserQuestion` 工具（用于向用户提问的内置工具）时，此 hook 在提问之前触发。此 hook 主要用于 **brainstorm 模式下的问题捕获**。`runBeforeQuestion` 处理器读取 `settings.json` 中的 `brainstorm` 标志，如果 brainstorm 模式处于激活状态，则从 stdin 中提取问题内容并追加到 `question.json` 文件中，形成完整的对话记录。

**配置结构**：

```json
{
  "matcher": "AskUserQuestion",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --before-question"
    }
  ]
}
```

**配置字段说明**：
- `matcher` (`string`): 值为 `"AskUserQuestion"`，匹配 Claude Code 的提问工具。
- 其余字段同 `PreToolUse[0]`。

**触发条件**：Claude Code 准备调用 `AskUserQuestion` 工具向用户提问。

**与 brainstorm 的协作**：此 hook 是 brainstorm 技能的问题捕获机制的关键环节。当 brainstorm 模式未激活时，hook 脚本快速退出不做任何处理；当 brainstorm 模式激活时（由 `--before-propose` hook 设置），问题会被自动记录。

---

### `PostToolUse[0]` - Agent 后置钩子 (after-agent)

**Source**: `marketplace/hooks/hooks.json`:50-59

**功能描述**：当 Claude Code 的 `Agent` 工具调用**完成后**，此 hook 在调用之后触发。这是整个 hook 系统中唯一的 `PostToolUse` hook，负责在子代理完成后清理会话状态。`runAfterAgent` 处理器执行以下操作：
1. 切换回 workflow 阶段（`agents switch`）
2. 从 stdin 中提取工具响应输出（`extractToolResponse`）
3. 将输出写入会话范围的输出文件（`writeOutputFile`）
4. 调用 `change stage done` 将变更状态设为完成

**配置结构**：

```json
{
  "matcher": "Agent",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --after-agent"
    }
  ]
}
```

**配置字段说明**：
- `matcher` (`string`): 值为 `"Agent"`，匹配 Claude Code 的 Agent 工具。在 `PostToolUse` 事件中，表示 Agent 工具调用完成后触发。
- 其余字段同 `PreToolUse[0]`。

**触发条件**：Claude Code 的 `Agent` 工具调用完成后（PostToolUse 事件 + matcher 为 `"Agent"`）。

**与 PreToolUse[Agent] 的关系**：`PreToolUse[Agent]`（before-agent）和 `PostToolUse[Agent]`（after-agent）构成一对生命周期钩子，分别在子代理的启动前和完成后执行，形成完整的会话管理闭环：
- before-agent: 初始化会话 → 切换到目标阶段 → 记录 in_progress
- after-agent: 切换回 workflow → 捕获输出 → 记录 done

---

### `UserPromptSubmit[0]` - 用户 Prompt 提交钩子 (init-agent)

**Source**: `marketplace/hooks/hooks.json`:61-70

**功能描述**：当用户在 Claude Code 中提交 prompt 时，此 hook 触发。这是整个 hook 系统中唯一的 `UserPromptSubmit` hook，负责**会话初始化**。`runInitAgent` 处理器解析 prompt 内容，检查是否匹配 `/furina:workflow` 前缀，如果匹配则执行以下操作：
1. 调用 `agents init` 初始化代理会话
2. 调用 `agents switch` 切换到 workflow 阶段

如果 prompt 不匹配 `/furina:workflow` 前缀、sessionId 缺失、cwd 缺失或 cwd 无效，则静默退出不做任何处理。

**配置结构**：

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --init-agent"
    }
  ]
}
```

**配置字段说明**：
- 此 hook **没有 `matcher` 字段**，因为 `UserPromptSubmit` 事件不支持 matcher——它在用户每次提交 prompt 时全局触发。
- 其余字段同 `PreToolUse[0]`。

**触发条件**：用户在 Claude Code 中提交任何 prompt。

**设计说明**：此 hook 无条件触发（无 matcher），但内部通过正则匹配 `/furina:workflow` 前缀来过滤非 Furina 的 prompt。这确保了只有当用户启动 Furina workflow 时才会执行初始化逻辑，其他普通的对话 prompt 不会受到影响。

## Data Structures

### hooks.json 顶层结构

```json
{
  "hooks": {
    "PreToolUse": Array<ToolHookEntry>,
    "PostToolUse": Array<ToolHookEntry>,
    "UserPromptSubmit": Array<UserPromptHookEntry>
  }
}
```
- `hooks` (`object`): 顶层对象，键为 Claude Code hook 事件类型。
- `PreToolUse` (`Array<ToolHookEntry>`): 工具调用前触发的 hook 列表，共 5 个条目。
- `PostToolUse` (`Array<ToolHookEntry>`): 工具调用后触发的 hook 列表，共 1 个条目。
- `UserPromptSubmit` (`Array<UserPromptHookEntry>`): 用户提交 prompt 时触发的 hook 列表，共 1 个条目。

### `ToolHookEntry`

```json
{
  "matcher": string,
  "hooks": Array<HookEntry>
}
```
- `matcher` (`string`): 工具名称匹配器。可以是 Claude Code 内置工具名（如 `"Agent"`、`"Bash"`、`"AskUserQuestion"`）或 MCP 工具完全限定名（如 `"mcp__plugin_furina_furina-mcp-server__markBeginPropose"`）。
- `hooks` (`Array<HookEntry>`): 匹配成功时要执行的 hook 命令列表。

### `UserPromptHookEntry`

```json
{
  "hooks": Array<HookEntry>
}
```
- `hooks` (`Array<HookEntry>`): 要执行的 hook 命令列表。注意此结构没有 `matcher` 字段，因为 `UserPromptSubmit` 事件是全局触发的。

### `HookEntry`

```json
{
  "type": "command",
  "command": string
}
```
- `type` (`string`): hook 执行类型，当前固定为 `"command"`，表示执行外部命令。
- `command` (`string`): 要执行的命令行字符串。支持 `${CLAUDE_PLUGIN_ROOT}` 变量插值。

### `${CLAUDE_PLUGIN_ROOT}` 变量

Claude Code 运行时提供的内置变量，在 hook 命令执行时被替换为插件的安装根目录路径。这使得 hook 命令可以在不同环境中使用相同的配置，无需硬编码绝对路径。

**变量替换示例**：
```
命令模板: node "${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js" --before-agent
替换结果: node "/Users/user/.claude/plugins/furina/scripts/furina_hooks.js" --before-agent
```

### 模式标志（Mode Flags）映射表

| hooks.json 中的 matcher | 事件类型 | 传入的 mode flag | 对应处理器 | 说明 |
|------------------------|---------|-----------------|-----------|------|
| `Agent` | PreToolUse | `--before-agent` | `runBeforeAgent` | 子代理启动前：初始化+切换阶段+记录 in_progress |
| `Agent` | PostToolUse | `--after-agent` | `runAfterAgent` | 子代理完成后：切换回 workflow+捕获输出+记录 done |
| （无 matcher） | UserPromptSubmit | `--init-agent` | `runInitAgent` | 用户 prompt 提交：初始化会话（仅 workflow prompt） |
| `markBeginPropose` (MCP) | PreToolUse | `--before-propose` | `runBeforePropose` | propose 开始：切换阶段+启用 brainstorm |
| `markEndPropose` (MCP) | PreToolUse | `--after-agent` | `runAfterAgent` | propose 结束：切换回 workflow+记录 done（复用 after-agent） |
| `Bash` | PreToolUse | `--before-bash` | `runBeforeBash` | Bash 命令前：检测 change new/archive 命令 |
| `AskUserQuestion` | PreToolUse | `--before-question` | `runBeforeQuestion` | 提问前：brainstorm 模式下捕获问题 |

## Error Handling and Edge Cases

### hook 命令执行失败

当 `furina_hooks.js` 脚本执行失败（如 Node.js 运行时错误、文件系统错误等）时，Claude Code 的 hook 机制会捕获错误但**不会中断主工具的调用**。这意味着即使 hook 失败，原始的 Agent/Bash/MCP 工具调用仍会继续执行。

### 无 matcher 的 UserPromptSubmit

`UserPromptSubmit` 事件类型不支持 `matcher` 字段。如果错误地添加了 `matcher` 字段，Claude Code 运行时可能会忽略该字段或产生解析错误。当前配置正确地未在此事件中使用 matcher。

### stdin 数据缺失

当 hook 脚本通过 stdin 接收的数据为空或格式异常时（如手动测试、管道中断等），`parseStdin` 函数会安全地返回 `{ sessionId: undefined, cwd: undefined }`，后续处理器会根据 sessionId 或 cwd 缺失而快速退出，不执行任何操作。

### ${CLAUDE_PLUGIN_ROOT} 未解析

如果 Claude Code 运行时未能正确解析 `${CLAUDE_PLUGIN_ROOT}` 变量（如在非插件环境中手动执行），命令中的路径将包含字面量 `${CLAUDE_PLUGIN_ROOT}`，导致 Node.js 找不到脚本文件而报错。这属于环境配置问题，不会影响插件正常使用。

## Dependencies

- **依赖于**：
  - `marketplace/scripts/furina_hooks.js`：所有 hook 命令的实际执行脚本，hooks.json 中的每条命令都通过 `node` 调用此脚本并传入对应的 mode flag
  - Claude Code 运行时 hook 引擎：解析 hooks.json 并在工具调用时触发 hook
  - `${CLAUDE_PLUGIN_ROOT}` 变量：由 Claude Code 插件系统提供，用于解析插件根目录路径

- **被依赖于**：
  - `marketplace/.claude-plugin/plugin.json`：插件清单文件，通过引用 hooks 目录使 Claude Code 加载 hooks.json
  - Furina workflow（`marketplace/commands/workflow.md`）：workflow 的阶段执行依赖 hooks.json 中注册的 hook 来自动切换 Provider 和管理会话状态
  - furina-brainstorm 技能：依赖 `--before-propose` 和 `--before-question` hook 来管理 brainstorm 模式

## Usage Examples

### hooks.json 的完整配置（当前版本）

以下是 `hooks.json` 的完整内容，展示了所有 7 个 hook 条目的注册方式：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --before-agent"
          }
        ]
      },
      {
        "matcher": "mcp__plugin_furina_furina-mcp-server__markBeginPropose",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --before-propose"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --before-bash"
          }
        ]
      },
      {
        "matcher": "mcp__plugin_furina_furina-mcp-server__markEndPropose",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --after-agent"
          }
        ]
      },
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --before-question"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --after-agent"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --init-agent"
          }
        ]
      }
    ]
  }
}
```

**逐步解读**：

1. **PreToolUse 数组（5 个条目）**：按顺序注册了 5 个前置 hook，分别匹配 Agent、markBeginPropose MCP、Bash、markEndPropose MCP、AskUserQuestion 工具。
2. **PostToolUse 数组（1 个条目）**：注册了 1 个后置 hook，匹配 Agent 工具。
3. **UserPromptSubmit 数组（1 个条目）**：注册了 1 个全局 prompt hook，无 matcher。

**注意**：所有 hook 命令共享相同的脚本路径模式 `node "${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js"`，仅通过不同的 mode flag 区分执行逻辑。

### 典型触发场景示例

**场景 1：Workflow 启动**

```
用户输入: "/furina:workflow I want to build a REST API"

→ UserPromptSubmit 触发 → --init-agent
→ furina_hooks.js 解析 prompt，检测到 /furina:workflow 前缀
→ 调用 agents init 初始化会话
→ 调用 agents switch 切换到 workflow 阶段
```

**场景 2：子代理执行**

```
Workflow 调用 Agent 工具（子代理）:
→ PreToolUse[Agent] 触发 → --before-agent
  → 初始化会话，切换到 coding 阶段，记录 in_progress

子代理执行 Bash 命令 "furina change new rest-api":
→ PreToolUse[Bash] 触发 → --before-bash
  → 检测到 change new 命令，提取名称 "rest-api"
  → 调用 agents init --change

Agent 工具完成:
→ PostToolUse[Agent] 触发 → --after-agent
  → 切换回 workflow 阶段，记录 done
```

**场景 3：Propose 阶段（Brainstorm 模式）**

```
Workflow 进入 Phase 2，调用 markBeginPropose:
→ PreToolUse[markBeginPropose] 触发 → --before-propose
  → 切换到 propose 阶段，启用 brainstorm = true

Brainstorm 过程中调用 AskUserQuestion:
→ PreToolUse[AskUserQuestion] 触发 → --before-question
  → 检测 brainstorm = true，将问题追加到 question.json

Brainstorm 结束，调用 markEndPropose:
→ PreToolUse[markEndPropose] 触发 → --after-agent
  → 切换回 workflow 阶段，记录 done
```

### 如何添加新的 hook 规则

如果需要为新的工具添加 hook，按照以下模式在 `hooks.json` 中添加条目：

```json
{
  "matcher": "ToolName",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/furina_hooks.js\" --new-mode-flag"
    }
  ]
}
```

其中：
- `matcher` 替换为要匹配的工具名（内置工具名或 MCP 完全限定名）
- `--new-mode-flag` 替换为 `furina_hooks.js` 中新定义的模式标志
- 同时需要在 `furina_hooks.js` 的 `main()` 函数中添加对应的 `process.argv.includes` 检测和处理器调用
