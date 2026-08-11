# Propose, Init-Agent, Bash, and Question Handlers

> Source files:
> - `marketplace/scripts/furina_hooks.js` : 435-813
> - `marketplace/hooks/hooks.json` : 1-72

## Overview

本文档详细描述 `furina_hooks.js` 中的四个专用 hook 处理器：`runBeforePropose`、`runInitAgent`、`runBeforeBash` 和 `runBeforeQuestion`。这些处理器由主入口函数 `main()` 根据 `--before-propose`、`--init-agent`、`--before-bash`、`--before-question` 命令行标志分发调用。

**在系统中的角色与定位：**
- 这四个处理器分别对应 Claude Code 生命周期中不同工具的拦截点，负责在工具执行前后管理 Furina 的会话状态、阶段切换和 brainstorm 模式
- 它们与 `runBeforeAgent`/`runAfterAgent`（Agent 工具拦截）共同构成完整的 hook 处理器集合

**设计动机：**
- `runBeforePropose`：在用户触发 MCP propose 工具时，初始化会话并启动 brainstorm 模式，为头脑风暴阶段做准备
- `runInitAgent`：在用户提交 `/furina:workflow` 前缀的提示时，静默初始化 agent 会话并切换到 workflow 阶段，确保后续工作流正常运行
- `runBeforeBash`：在 Bash 工具执行前拦截命令，识别 `furina change new`、`furina change instruction --proposal`、`furina change archive` 三种 Furina 命令并执行相应的副作用（初始化、阶段切换、brainstorm 开关）
- `runBeforeQuestion`：在 `AskUserQuestion` 工具执行前，当 brainstorm 模式启用时捕获问题并持久化到 `question.json`，用于后续分析

**使用场景：**
- `runBeforePropose`：当 Claude Code 触发 `mcp__plugin_furina_furina-mcp-server__markBeginPropose` 工具时
- `runInitAgent`：当用户提交包含 `/furina:workflow` 前缀的提示时（`UserPromptSubmit` 事件）
- `runBeforeBash`：当 Claude Code 执行 `Bash` 工具时
- `runBeforeQuestion`：当 Claude Code 触发 `AskUserQuestion` 工具时

**涉及的源文件及职责：**
- `marketplace/scripts/furina_hooks.js`（435-813 行）：四个处理器的实现、辅助函数（`extractCommandFromRawInput`、`extractChangeName`、`executeChangeNewInit`）以及主入口的分发逻辑
- `marketplace/hooks/hooks.json`：hook 注册配置，将 Claude Code 事件映射到对应的处理器模式标志

## Architecture / Flow

### 处理器分发流程

```
main() 接收 stdin + process.argv
       |
       v
  parseStdin(rawInput) ──→ { sessionId, cwd }
       |
       v
  根据 process.argv 标志分发:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ --before-propose ──→ runBeforePropose(parsed)                          │
  │ --init-agent     ──→ runInitAgent(parsed, rawInput)                    │
  │ --before-bash    ──→ runBeforeBash(parsed, rawInput)                   │
  │ --before-question──→ runBeforeQuestion(parsed, rawInput)               │
  └─────────────────────────────────────────────────────────────────────────┘
```

### runBeforePropose 执行流程

```
输入: parsed { sessionId, cwd }
       |
       ├─ [校验] sessionId / cwd 存在性 + cwd 目录有效性
       |
       ├─ [1] buildInitCommand + executeCommand ──→ agents init
       |
       ├─ [2] buildBeforeProposeCommand + executeCommand ──→ agents switch propose
       |
       ├─ [3] 读取 settings.json → 设置 brainstorm=true → 写回
       |
       └─ [4] 执行 change stage brainstorm --status in_progress
```

### runInitAgent 执行流程

```
输入: parsed { sessionId, cwd }, rawInput
       |
       ├─ [解析] 从 rawInput 提取 prompt (匹配 /furina:workflow 前缀)
       |
       ├─ [校验] prompt / sessionId / cwd 存在性 + cwd 有效性 ──→ 任一缺失则静默退出
       |
       ├─ [1] buildInitCommand(sessionId, cwd, prompt) + executeCommand(silent)
       |
       └─ [2] buildWorkflowCommand(sessionId) + executeCommand(silent)
```

### runBeforeBash 执行流程

```
输入: parsed { sessionId, cwd }, rawInput
       |
       ├─ [校验] sessionId / cwd 存在性 + cwd 目录有效性
       |
       ├─ [提取] extractCommandFromRawInput(rawInput) ──→ rawCommand
       |
       ├─ [过滤] rawCommand 不含 "furina" ──→ 直接退出
       |
       └─ [分发] if-else 链:
            ├─ "furina change new"      ──→ extractChangeName + executeChangeNewInit
            ├─ "furina change instruction" + "--proposal" ──→ handleChangeInstructionProposal
            ├─ "furina change archive"  ──→ handleChangeArchive
            └─ 其他 furina 命令          ──→ 静默忽略
```

### runBeforeQuestion 执行流程

```
输入: parsed { sessionId }, rawInput
       |
       ├─ [校验] sessionId 存在性
       |
       ├─ [读取] settings.json → brainstorm 标志
       │     └─ brainstorm=false ──→ process.exitCode=0, 退出
       |
       ├─ [解析] rawInput:
       │     ├─ JSON.parse 优先: data.tool_use_id + data.tool_input.questions
       │     └─ 正则降级: TOOL_USE_ID_PATTERN + /"questions"\s*:\s*(\[[\s\S]*?\])\s*\}/
       |
       ├─ [校验] toolUseId / questions 存在性
       |
       ├─ [读取] question.json (已有条目或空数组)
       |
       └─ [追加] push({ tool_use_id, questions }) → 写回 question.json
```

## Functionality / Interface Details

### `runBeforePropose(parsed: { sessionId?: string, cwd?: string }) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:439-491

**功能**: 处理 `--before-propose` 模式，在 MCP propose 工具（`markBeginPropose`）执行前进行会话初始化和 brainstorm 模式启动。该处理器执行四步操作：初始化 agent 会话、切换到 propose 阶段、在 settings.json 中启用 brainstorm 模式、调用 change stage brainstorm 记录阶段状态。

**参数**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 由 `parseStdin` 从 stdin 提取的解析结果。`sessionId` 是会话唯一标识，`cwd` 是当前工作目录路径

**返回值**: `void`，无返回值

**核心逻辑**:

1. **前置校验**：依次检查 `sessionId` 和 `cwd` 是否存在，`cwd` 对应的目录是否在文件系统中存在。任一校验失败则静默返回（无错误输出）

2. **日志记录**：通过 `writeLog` 记录接收到的 hook 请求参数（sessionId、purpose、cwd）

3. **会话初始化**：调用 `buildInitCommand(sessionId, cwd)` 构建 `furina agents init` 命令，通过 `executeCommand` 执行。该步骤确保会话目录和配置文件已创建

4. **阶段切换**：调用 `buildBeforeProposeCommand(sessionId)` 构建 `furina agents switch propose` 命令，将 agent 切换到 propose 阶段

5. **启用 brainstorm 模式**：读取 `~/.furina/sessions/{sessionId}/settings.json`，将 `brainstorm` 字段设为 `true`，写回文件。读写操作包裹在 try-catch 中，异常时静默忽略

6. **记录 brainstorm 阶段**：执行 `furina change stage brainstorm --session {sessionId} --status in_progress`

**核心代码**:
```javascript
export function runBeforePropose(parsed) {
  if (!parsed.sessionId) { return; }
  if (!parsed.cwd) { return; }
  if (!fs.existsSync(parsed.cwd)) { return; }

  // ... logging omitted for brevity ...

  // Initialize the agent session first
  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  const initResult = executeCommand(initCommand, parsed.cwd);

  // Then switch to propose stage
  const command = buildBeforeProposeCommand(parsed.sessionId);
  const result = executeCommand(command, parsed.cwd);

  // Enable brainstorm mode: update settings.json and call change stage
  const settingsPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings.brainstorm = true;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    }
  } catch { /* Silent */ }

  const brainstormArgs = ['furina', 'change', 'stage', 'brainstorm', '--session', parsed.sessionId, '--status', 'in_progress'];
  const brainstormResult = executeCommand(brainstormArgs, parsed.cwd);
}
```
Source: `marketplace/scripts/furina_hooks.js`:439-491

**使用示例**:
```javascript
// 由 main() 在 --before-propose 模式下调用
const parsed = parseStdin(rawInput);
runBeforePropose(parsed);
// 内部依次执行: agents init -> agents switch propose -> settings.brainstorm=true -> change stage brainstorm
```
说明：`main()` 根据 `process.argv` 中的 `--before-propose` 标志调用此函数。`parsed` 对象由 `parseStdin` 从 stdin 原始文本中提取。

---

### `runInitAgent(parsed: { sessionId?: string, cwd?: string }, rawInput: string) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:501-534

**功能**: 处理 `--init-agent` 模式（`UserPromptSubmit` 事件），在用户提交匹配 `/furina:workflow` 前缀的提示时静默初始化 agent 会话并切换到 workflow 阶段。该处理器不输出任何 stdout/stderr，所有执行日志写入 hooks 日志文件。当提示不匹配前缀、sessionId/cwd 缺失或 cwd 路径不存在时，静默退出不做任何处理。

**参数**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 由 `parseStdin` 从 stdin 提取的解析结果
- `rawInput` (`string`): stdin 的原始文本，用于内部解析 prompt 字段

**返回值**: `void`

**核心逻辑**:

1. **Prompt 提取**：使用 `PROMPT_PATTERN`（`/"prompt"\s*:\s*"(\/furina:workflow[^"]*)"/i`）从 rawInput 中提取 prompt。仅匹配 `/furina:workflow` 前缀的 prompt

2. **多层校验**：依次检查 prompt 是否存在、sessionId 是否存在、cwd 是否存在且非空、cwd 路径是否在文件系统中存在。任一失败立即返回

3. **会话初始化**：调用 `buildInitCommand(sessionId, cwd, prompt)` 构建命令，注意此调用传入了 prompt 参数（与 `runBeforePropose` 不同）。通过 `executeCommand` 执行，使用 `{ silent: true }` 选项抑制 stderr 输出

4. **Workflow 阶段切换**：调用 `buildWorkflowCommand(sessionId)` 构建 `furina agents switch workflow` 命令，同样使用 `executeCommand` 执行（silent 模式）

**核心代码**:
```javascript
export function runInitAgent(parsed, rawInput) {
  const promptMatch = (rawInput || '').match(PROMPT_PATTERN);
  const prompt = promptMatch ? promptMatch[1] : undefined;

  if (!prompt) { return; }
  if (!parsed.sessionId) { return; }
  if (!parsed.cwd || !parsed.cwd.trim()) { return; }
  if (!fs.existsSync(parsed.cwd)) { return; }

  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd, prompt);
  let result = executeCommand(initCommand, parsed.cwd, { silent: true });

  const command = buildWorkflowCommand(parsed.sessionId);
  result = executeCommand(command, parsed.cwd, { silent: true });
}
```
Source: `marketplace/scripts/furina_hooks.js`:501-534

**使用示例**:
```javascript
// 由 main() 在 --init-agent 模式下调用（UserPromptSubmit 事件）
const parsed = parseStdin(rawInput);
runInitAgent(parsed, rawInput);
// 仅当 rawInput 包含 "prompt": "/furina:workflow ..." 时才执行
// 执行: agents init --prompt "/furina:workflow ..." -> agents switch workflow
```
说明：该处理器专为 `UserPromptSubmit` 生命周期事件设计。`PROMPT_PATTERN` 正则仅匹配以 `/furina:workflow` 开头的 prompt，其他用户输入会被忽略。

---

### `extractCommandFromRawInput(rawInput: string) -> string | undefined`

**Source**: `marketplace/scripts/furina_hooks.js`:543-563

**功能**: 从 Bash 工具的 stdin 原始文本中提取 `command` 字段内容。采用 JSON-first 策略（先尝试 `JSON.parse` 解析 `tool_input.command`），解析失败或字段缺失时降级为正则表达式 `COMMAND_PATTERN` 提取。这种双策略设计确保在 JSON 编码问题、BOM 字符、畸形 JSON 等异常情况下仍能正确提取命令。

**参数**:
- `rawInput` (`string`): stdin 原始文本，包含 Bash 工具调用的完整 JSON 数据

**返回值**:
- `string | undefined`: 提取到的命令字符串；当 rawInput 为空、JSON 解析失败且正则不匹配时返回 `undefined`

**核心逻辑**:

1. **空值校验**：rawInput 为空或仅含空白时返回 undefined

2. **JSON-first 策略**：调用 `JSON.parse(rawInput)` 解析数据，尝试访问 `data.tool_input?.command`。若成功提取到 command 值则直接返回

3. **正则降级**：当 JSON 解析抛出异常（畸形 JSON、编码问题）或解析成功但 `tool_input.command` 不存在时，使用 `COMMAND_PATTERN`（`/"command"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description":/`）从原始文本中匹配。该正则要求 `"description"` 紧跟在 `"command"` 之后，确保匹配的准确性

**核心代码**:
```javascript
export function extractCommandFromRawInput(rawInput) {
  if (!rawInput || !rawInput.trim()) { return undefined; }

  try {
    const data = JSON.parse(rawInput);
    const command = data.tool_input?.command;
    if (command) { return command; }
  } catch { /* fall through to regex fallback */ }

  const match = rawInput.match(COMMAND_PATTERN);
  return match ? match[1] : undefined;
}
```
Source: `marketplace/scripts/furina_hooks.js`:543-563

**使用示例**:
```javascript
// 从 Bash 工具的 stdin 中提取命令
const rawInput = '{"tool_input":{"command":"furina change new feature-x","description":"Create new change"},"tool_use_id":"abc-123"}';
const command = extractCommandFromRawInput(rawInput);
// command === "furina change new feature-x"
```

```javascript
// 正则降级场景：JSON 格式有轻微异常
const malformedInput = '"command": "furina change new feature-x", "description": "test"';
const command = extractCommandFromRawInput(malformedInput);
// command === "furina change new feature-x" (通过 COMMAND_PATTERN 正则提取)
```
说明：JSON-first 策略优先处理标准格式，正则降级则处理编码异常或格式问题。

---

### `extractChangeName(rawCommand: string) -> string | null`

**Source**: `marketplace/scripts/furina_hooks.js`:570-576

**功能**: 从 `furina change new` 命令字符串中提取 change 名称。该函数先检查命令是否包含 `furina change new` 子串，不包含则返回 null；然后使用 `CHANGE_NEW_PATTERN`（`/furina change new\s+(\S+)/`）提取紧跟在 `new` 后面的第一个非空白 token 作为 change 名称。

**参数**:
- `rawCommand` (`string`): 从 Bash 工具 stdin 提取的原始命令字符串

**返回值**:
- `string | null`: 提取到的 change 名称（kebab-case 格式）；当命令不匹配 `furina change new` 或正则未捕获到名称时返回 `null`

**核心逻辑**:

1. **快速过滤**：检查 rawCommand 是否包含 `'furina change new'` 子串，不包含则直接返回 null（避免不必要的正则匹配）

2. **正则提取**：使用 `CHANGE_NEW_PATTERN` 匹配 `furina change new` 后面的第一个非空白序列（`\S+`），该序列即为 change 名称

**核心代码**:
```javascript
export function extractChangeName(rawCommand) {
  if (!rawCommand || !rawCommand.includes('furina change new')) {
    return null;
  }
  const match = rawCommand.match(CHANGE_NEW_PATTERN);
  return match ? match[1] : null;
}
```
Source: `marketplace/scripts/furina_hooks.js`:570-576

**使用示例**:
```javascript
const name = extractChangeName('furina change new add-user-auth');
// name === "add-user-auth"

const notMatch = extractChangeName('furina change instruction --proposal');
// notMatch === null (不包含 "furina change new")
```
说明：change 名称通常为 kebab-case 格式，如 `add-user-auth`、`fix-login-bug`。

---

### `executeChangeNewInit(parsed: { sessionId?: string, cwd?: string }, changeName: string) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:583-595

**功能**: 为 `furina change new` 命令场景构建并执行带 `--change` 参数的 `agents init` 命令。该函数在日志中记录会话信息和 change 名称，然后构建 `furina agents init --session {sessionId} --cwd {cwd} --change {changeName}` 命令并执行。

**参数**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 解析后的会话信息
- `changeName` (`string`): 从 `furina change new` 命令中提取的 change 名称

**返回值**: `void`

**核心逻辑**:

1. **日志记录**：记录 sessionId、changeName 和 cwd

2. **构建命令**：调用 `buildInitCommand(sessionId, cwd)` 获取基础 init 命令，追加 `'--change'` 和 `changeName` 参数

3. **执行命令**：通过 `executeCommand` 执行，使用 `{ silent: true }` 选项

**核心代码**:
```javascript
export function executeChangeNewInit(parsed, changeName) {
  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- change-name: ${changeName}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  const initCommand = [...buildInitCommand(parsed.sessionId, parsed.cwd), '--change', changeName];
  const commandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(initCommand, parsed.cwd, { silent: true });
}
```
Source: `marketplace/scripts/furina_hooks.js`:583-595

**使用示例**:
```javascript
// 由 runBeforeBash 在检测到 "furina change new" 命令时调用
const parsed = { sessionId: 'abc-123', cwd: '/home/user/project' };
executeChangeNewInit(parsed, 'add-user-auth');
// 执行: furina agents init --session abc-123 --cwd /home/user/project --change add-user-auth
```
说明：`--change` 参数告知 `agents init` 为指定的 change 创建初始化上下文，包括 change 目录结构和元数据。

---

### `handleChangeInstructionProposal(parsed: { sessionId: string, cwd: string }) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:602-626

**功能**: 处理 `furina change instruction --proposal` 命令的副作用。该函数执行两个操作：将 settings.json 中的 `brainstorm` 设为 `false`（关闭 brainstorm 模式），然后调用 `furina change stage propose --status in_progress` 切换到 propose 阶段。

**参数**:
- `parsed` (`{ sessionId: string, cwd: string }`): 解析后的会话信息

**返回值**: `void`

**核心逻辑**:

1. **日志记录**：记录 sessionId 和 cwd

2. **关闭 brainstorm 模式**：读取 `~/.furina/sessions/{sessionId}/settings.json`，将 `brainstorm` 设为 `false`，写回文件。读写操作包裹在 try-catch 中，异常时静默忽略

3. **调用 change stage propose**：执行 `furina change stage propose --session {sessionId} --status in_progress`，使用 `{ silent: true }` 选项

**核心代码**:
```javascript
function handleChangeInstructionProposal(parsed) {
  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  const settingsPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings.brainstorm = false;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    }
  } catch { /* Silent */ }

  const stageArgs = ['furina', 'change', 'stage', 'propose', '--session', parsed.sessionId, '--status', 'in_progress'];
  const result = executeCommand(stageArgs, parsed.cwd, { silent: true });
}
```
Source: `marketplace/scripts/furina_hooks.js`:602-626

**使用示例**:
```javascript
// 由 runBeforeBash 在检测到 "furina change instruction --proposal" 时调用
// 命令示例: furina change instruction --proposal
handleChangeInstructionProposal({ sessionId: 'abc-123', cwd: '/home/user/project' });
// 效果: brainstorm=false, change stage propose --status in_progress
```
说明：该函数是 brainstorm 阶段到 propose 阶段的关键切换点。brainstorm 模式在 `runBeforePropose` 中开启，在此处关闭，形成完整的 brainstorm-propose 生命周期。

---

### `handleChangeArchive(parsed: { sessionId: string, cwd: string }) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:633-644

**功能**: 处理 `furina change archive` 命令的副作用，调用 `furina change stage archive --status in_progress` 记录归档阶段的开始状态。

**参数**:
- `parsed` (`{ sessionId: string, cwd: string }`): 解析后的会话信息

**返回值**: `void`

**核心逻辑**:

1. **日志记录**：记录 sessionId 和 cwd

2. **调用 change stage archive**：执行 `furina change stage archive --session {sessionId} --status in_progress`

**核心代码**:
```javascript
function handleChangeArchive(parsed) {
  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  const stageArgs = ['furina', 'change', 'stage', 'archive', '--session', parsed.sessionId, '--status', 'in_progress'];
  const commandStr = stageArgs.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(stageArgs, parsed.cwd, { silent: true });
}
```
Source: `marketplace/scripts/furina_hooks.js`:633-644

**使用示例**:
```javascript
// 由 runBeforeBash 在检测到 "furina change archive" 时调用
// 命令示例: furina change archive
handleChangeArchive({ sessionId: 'abc-123', cwd: '/home/user/project' });
// 效果: change stage archive --status in_progress
```
说明：归档是 Furina change 生命周期的最后阶段，该函数仅记录归档开始，实际归档逻辑由 `change stage archive` 命令处理。

---

### `runBeforeBash(parsed: { sessionId?: string, cwd?: string }, rawInput: string) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:652-685

**功能**: 处理 `--before-bash` 模式，在 Bash 工具执行前拦截命令。从 stdin 提取 command 字段，过滤非 furina 命令，然后通过 if-else 链分发到三个子处理器。这是 Bash 工具 hook 的核心调度器，协调 change new、change instruction --proposal、change archive 三种命令的副作用处理。

**参数**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 解析后的会话信息
- `rawInput` (`string`): stdin 原始文本

**返回值**: `void`

**核心逻辑**:

1. **前置校验**：检查 sessionId、cwd 存在性及 cwd 目录有效性

2. **命令提取**：调用 `extractCommandFromRawInput(rawInput)` 获取 rawCommand

3. **非 furina 命令过滤**：rawCommand 不包含 `'furina'` 子串时直接退出

4. **if-else 分发链**：
   - `rawCommand.includes('furina change new')`：调用 `extractChangeName` 提取 change 名称，成功则调用 `executeChangeNewInit`
   - `rawCommand.includes('furina change instruction') && rawCommand.includes('--proposal')`：调用 `handleChangeInstructionProposal`
   - `rawCommand.includes('furina change archive')`：调用 `handleChangeArchive`
   - 未匹配的 furina 命令静默忽略

**核心代码**:
```javascript
export function runBeforeBash(parsed, rawInput) {
  if (!parsed.sessionId) { return; }
  if (!parsed.cwd) { return; }
  if (!fs.existsSync(parsed.cwd)) { return; }

  const rawCommand = extractCommandFromRawInput(rawInput);
  if (!rawCommand) { return; }

  if (!rawCommand.includes('furina')) { return; }

  if (rawCommand.includes('furina change new')) {
    const changeName = extractChangeName(rawCommand);
    if (changeName) { executeChangeNewInit(parsed, changeName); }
  } else if (rawCommand.includes('furina change instruction') && rawCommand.includes('--proposal')) {
    handleChangeInstructionProposal(parsed);
  } else if (rawCommand.includes('furina change archive')) {
    handleChangeArchive(parsed);
  }
}
```
Source: `marketplace/scripts/furina_hooks.js`:652-685

**使用示例**:
```javascript
// 由 main() 在 --before-bash 模式下调用
// 场景 1: 用户执行 furina change new add-auth
runBeforeBash(parsed, '{"tool_input":{"command":"furina change new add-auth","description":"..."}}');
// → executeChangeNewInit(parsed, "add-auth")

// 场景 2: 用户执行 furina change instruction --proposal
runBeforeBash(parsed, '{"tool_input":{"command":"furina change instruction --proposal","description":"..."}}');
// → handleChangeInstructionProposal(parsed)

// 场景 3: 非 furina 命令
runBeforeBash(parsed, '{"tool_input":{"command":"ls -la","description":"..."}}');
// → 无操作（不包含 "furina"）
```
说明：if-else 链的顺序很重要——`furina change new` 需要在更通用的匹配之前检查，且 `change instruction` 需要同时匹配 `--proposal` 标志以区分其他 `change instruction` 子命令。

---

### `runBeforeQuestion(parsed: { sessionId?: string, cwd?: string }, rawInput: string) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:694-766

**功能**: 处理 `--before-question` 模式，在 `AskUserQuestion` 工具执行前检查 brainstorm 模式是否启用。若 brainstorm 启用，则从 stdin 提取问题数据（`tool_use_id` 和 `questions` 数组），追加到 `~/.furina/sessions/{sessionId}/question.json` 文件中。该功能使 brainstorm 阶段的问题能够被持久化记录，供后续分析或回复使用。

**参数**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 解析后的会话信息
- `rawInput` (`string`): stdin 原始文本，包含 AskUserQuestion 工具调用的 JSON 数据

**返回值**: `void`

**核心逻辑**:

1. **sessionId 校验**：sessionId 缺失时立即返回

2. **读取 settings.json**：路径为 `~/.furina/sessions/{sessionId}/settings.json`。文件不存在时返回；JSON 解析失败时返回

3. **brainstorm 检查**：`settings.brainstorm` 为 falsy 值时，设置 `process.exitCode = 0` 并返回。注意此处显式设置了 exitCode

4. **数据提取（双策略）**：
   - **JSON-parse-first**：调用 `JSON.parse(rawInput)` 解析数据，提取 `data.tool_use_id` 和 `data.tool_input?.questions`
   - **正则降级**：JSON 解析失败时，使用 `TOOL_USE_ID_PATTERN` 提取 `tool_use_id`，使用 `/"questions"\s*:\s*(\[[\s\S]*?\])\s*\}/` 提取 questions 数组，再对数组部分单独 `JSON.parse`

5. **校验**：`toolUseId` 或 `questions` 缺失时返回

6. **追加到 question.json**：读取已有的 `question.json`（或初始化为空数组），push 新条目 `{ tool_use_id, questions }`，写回文件。若 session 目录不存在则递归创建

**核心代码**:
```javascript
export function runBeforeQuestion(parsed, rawInput) {
  if (!parsed.sessionId) { return; }

  const settingsPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, 'settings.json');
  if (!fs.existsSync(settingsPath)) { return; }

  let settings;
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); }
  catch { return; }

  if (!settings.brainstorm) {
    process.exitCode = 0;
    return;
  }

  let toolUseId;
  let questions;

  try {
    const data = JSON.parse(rawInput);
    toolUseId = data.tool_use_id;
    questions = data.tool_input?.questions;
  } catch {
    const tidMatch = rawInput.match(TOOL_USE_ID_PATTERN);
    toolUseId = tidMatch ? tidMatch[1] : undefined;
    const questionsMatch = rawInput.match(/"questions"\s*:\s*(\[[\s\S]*?\])\s*\}/);
    if (questionsMatch) {
      try { questions = JSON.parse(questionsMatch[1]); }
      catch { questions = undefined; }
    }
  }

  if (!toolUseId || !questions) { return; }

  const questionPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, 'question.json');
  let existingQuestions = [];
  if (fs.existsSync(questionPath)) {
    try { existingQuestions = JSON.parse(fs.readFileSync(questionPath, 'utf-8')); }
    catch { existingQuestions = []; }
  }
  existingQuestions.push({ tool_use_id: toolUseId, questions });

  const sessionDir = path.dirname(questionPath);
  if (!fs.existsSync(sessionDir)) { fs.mkdirSync(sessionDir, { recursive: true }); }
  fs.writeFileSync(questionPath, JSON.stringify(existingQuestions, null, 2), 'utf-8');
}
```
Source: `marketplace/scripts/furina_hooks.js`:694-766

**使用示例**:
```javascript
// 由 main() 在 --before-question 模式下调用
// 假设 brainstorm 模式已启用（runBeforePropose 中设置）
const rawInput = '{"tool_use_id":"q-001","tool_input":{"questions":[{"question":"Which database should we use?","header":"DB Choice"}]}}';
runBeforeQuestion(parsed, rawInput);
// 效果: question.json 中追加 { tool_use_id: "q-001", questions: [...] }

// brainstorm 未启用时：
// runBeforeQuestion 读取 settings.json，发现 brainstorm=false，设置 exitCode=0 后返回
```
说明：`question.json` 的结构为数组，每个元素包含 `tool_use_id`（标识哪次 AskUserQuestion 调用）和 `questions`（问题数组）。多次调用会追加到同一文件。

## Data Structures

### `settings.json` 结构

```json
{
  "brainstorm": true
}
```
- `brainstorm` (`boolean`): brainstorm 模式标志。`true` 表示 brainstorm 阶段激活，`runBeforeQuestion` 会捕获问题；`false` 或不存在时问题不会被捕获
- 路径：`~/.furina/sessions/{sessionId}/settings.json`
- 在 `runBeforePropose` 中设为 `true`，在 `handleChangeInstructionProposal` 中设为 `false`

### `question.json` 结构

```json
[
  {
    "tool_use_id": "q-001",
    "questions": [
      {
        "question": "Which database should we use?",
        "header": "DB Choice"
      }
    ]
  }
]
```
- 类型：`Array<{ tool_use_id: string, questions: Array<object> }>`
- `tool_use_id` (`string`): AskUserQuestion 工具调用的唯一标识
- `questions` (`Array<object>`): 问题数组，每个元素的结构由 AskUserQuestion 工具定义
- 路径：`~/.furina/sessions/{sessionId}/question.json`
- 由 `runBeforeQuestion` 追加写入

### 关键正则模式

| 常量名 | 模式 | 用途 |
|--------|------|------|
| `PROMPT_PATTERN` | `/"prompt"\s*:\s*"(\/furina:workflow[^"]*)"/i` | 从 stdin 提取 `/furina:workflow` 前缀的 prompt |
| `COMMAND_PATTERN` | `/"command"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description":/` | 从 Bash 工具 stdin 提取 command 字段（正则降级） |
| `CHANGE_NEW_PATTERN` | `/furina change new\s+(\S+)/` | 从命令中提取 change 名称 |
| `TOOL_USE_ID_PATTERN` | `/"tool_use_id"\s*:\s*"([a-zA-Z0-9-]+)"/` | 从 stdin 提取 tool_use_id（正则降级） |

## Error Handling and Edge Cases

### 静默退出策略

四个处理器均采用静默退出策略：当输入校验失败时不输出任何 stderr/stdout，直接返回。这是 hooks 设计的核心原则——hook 执行失败不应影响 Claude Code 主进程的正常运行。

| 处理器 | 静默退出条件 |
|--------|-------------|
| `runBeforePropose` | sessionId 缺失、cwd 缺失、cwd 目录不存在 |
| `runInitAgent` | prompt 不匹配 `/furina:workflow`、sessionId 缺失、cwd 缺失或为空、cwd 目录不存在 |
| `runBeforeBash` | sessionId 缺失、cwd 缺失、cwd 目录不存在、rawCommand 为空、rawCommand 不含 `furina` |
| `runBeforeQuestion` | sessionId 缺失、settings.json 不存在、settings.json 解析失败、brainstorm 为 false、toolUseId 或 questions 缺失 |

### settings.json 读写异常处理

`runBeforePropose` 和 `handleChangeInstructionProposal` 中对 `settings.json` 的读写操作均包裹在 try-catch 中：
- `fs.existsSync` 检查文件存在性
- `JSON.parse` 解析失败时 catch 块静默忽略
- `fs.writeFileSync` 写入失败时 catch 块静默忽略
- 如果 `settingsPath` 对应的文件不存在，`runBeforePropose` 会跳过 brainstorm 启用步骤（不创建新文件），而 `handleChangeInstructionProposal` 同样跳过

### question.json 的防御性读取

`runBeforeQuestion` 对 `question.json` 的读取采用防御性编程：
- 文件不存在时初始化为空数组
- JSON 解析失败时重置为空数组
- session 目录不存在时递归创建

### `process.exitCode` 的特殊设置

`runBeforeQuestion` 在 brainstorm 未启用时显式设置 `process.exitCode = 0`，这是一个关键细节：hook 进程需要明确返回成功退出码，否则 Claude Code 可能将其视为 hook 执行失败。

### JSON-first / 正则降级双策略

`extractCommandFromRawInput` 和 `runBeforeQuestion` 均采用相同的双策略模式：
1. 先尝试 `JSON.parse`，这是最可靠的方式
2. JSON 解析失败或目标字段缺失时，使用正则从原始文本中提取
3. 正则的容忍度更高，可处理 BOM 字符、编码问题、部分畸形 JSON

### Bash 命令分发的 if-else 链顺序

`runBeforeBash` 中的 if-else 链顺序至关重要：
1. `furina change new` 必须在最前面检查，因为它是最具体的匹配
2. `furina change instruction` 需要同时检查 `--proposal` 标志，与其他 `change instruction` 子命令区分
3. `furina change archive` 是独立的匹配
4. 未匹配的 furina 命令被静默忽略，不会产生副作用

## Dependencies

### Depends on（本 spec 依赖）

- **spec-hooks-runner-main.md**：`main()` 函数负责 stdin 读取、`parseStdin` 调用和模式分发。`SESSION_ID_PATTERN`、`CWD_PATTERN`、`PROMPT_PATTERN`、`COMMAND_PATTERN`、`CHANGE_NEW_PATTERN`、`TOOL_USE_ID_PATTERN` 等正则常量在文件顶部定义
- **spec-hooks-runner-utilities.md**：提供 `parseStdin`、`buildInitCommand`、`buildBeforeProposeCommand`、`buildWorkflowCommand`、`executeCommand`、`writeLog` 等基础工具函数
- **spec-hooks-config.md**：`hooks.json` 配置将 Claude Code 事件映射到对应的处理器模式标志

### Depended by（依赖本 spec）

- **hooks.json 配置**：通过命令行标志 `--before-propose`、`--init-agent`、`--before-bash`、`--before-question` 调用本 spec 中的处理器
- **Furina CLI 工具链**：处理器内部调用的 `furina agents init`、`furina agents switch`、`furina change stage` 等命令是外部依赖

## Usage Examples

### 完整使用场景：Propose 阶段初始化

```javascript
// 场景：用户触发 markBeginPropose MCP 工具，Claude Code 通过 hooks.json 调用：
// node furina_hooks.js --before-propose
// stdin 内容：{"session_id":"sess-001","cwd":"/home/user/project","tool_input":{}}

// main() 内部执行:
const rawInput = '{"session_id":"sess-001","cwd":"/home/user/project","tool_input":{}}';
const parsed = parseStdin(rawInput);
// parsed = { sessionId: "sess-001", cwd: "/home/user/project" }

runBeforePropose(parsed);
// 执行序列：
// 1. furina agents init --session sess-001 --cwd /home/user/project
// 2. furina agents switch propose --session sess-001
// 3. settings.json: { brainstorm: true }
// 4. furina change stage brainstorm --session sess-001 --status in_progress
```

### 完整使用场景：Workflow 提示初始化

```javascript
// 场景：用户输入 "/furina:workflow 帮我实现用户认证功能"
// Claude Code 通过 hooks.json 触发 UserPromptSubmit:
// node furina_hooks.js --init-agent
// stdin 内容：{"session_id":"sess-002","cwd":"/home/user/project","prompt":"/furina:workflow 帮我实现用户认证功能"}

runInitAgent(parsed, rawInput);
// 执行序列：
// 1. furina agents init --session sess-002 --cwd /home/user/project --prompt "/furina:workflow 帮我实现用户认证功能"
// 2. furina agents switch workflow --session sess-002
// （均以 silent 模式执行，无 stderr 输出）
```

### 完整使用场景：Bash 命令拦截

```javascript
// 场景：Claude Code 执行 "furina change new add-auth"
// hooks.json 拦截 Bash 工具，调用：
// node furina_hooks.js --before-bash
// stdin: {"session_id":"sess-003","cwd":"/home/user/project","tool_input":{"command":"furina change new add-auth","description":"Add authentication"}}

runBeforeBash(parsed, rawInput);
// 执行序列：
// 1. extractCommandFromRawInput → "furina change new add-auth"
// 2. 命令包含 "furina" → 进入分发
// 3. 匹配 "furina change new" → extractChangeName → "add-auth"
// 4. executeChangeNewInit → furina agents init --session sess-003 --cwd /home/user/project --change add-auth
```

### 完整使用场景：Brainstorm 问题捕获

```javascript
// 场景：brainstorm 模式已启用（runBeforePropose 设置），Claude Code 触发 AskUserQuestion
// node furina_hooks.js --before-question
// stdin: {"tool_use_id":"q-001","tool_input":{"questions":[{"question":"选择数据库?","header":"DB"}]}}

runBeforeQuestion(parsed, rawInput);
// 执行序列：
// 1. 读取 settings.json → brainstorm=true → 继续
// 2. JSON.parse 提取 toolUseId="q-001", questions=[{...}]
// 3. 读取 question.json（不存在 → 空数组）
// 4. 追加 { tool_use_id: "q-001", questions: [...] }
// 5. 写入 question.json
```
