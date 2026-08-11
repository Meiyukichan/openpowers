# Hook Runner Utility Functions

> Source files:
> - `marketplace/scripts/furina_hooks.js` : 1-293

## Overview

Hook Runner Utilities 是 `furina_hooks.js` 中被所有 hook handler（before-agent、after-agent、init-agent、before-propose、before-bash、before-question）共享的基础工具函数集合。这些函数覆盖以下几类能力：

- **输入验证**：`validateBeforeAgent` 校验 before-agent 模式所需的 sessionId、purpose、cwd 字段
- **命令构建**：`buildBeforeAgentCommand`、`buildInitCommand`、`buildWorkflowCommand`、`buildBeforeProposeCommand` 构建 furina CLI 命令数组
- **命令执行**：`executeCommand` 封装 execSync，支持 silent 模式，返回结构化结果
- **日志记录**：`writeLog` 写入带时间戳的日志到 `~/.furina/logs/hooks/`
- **工具输入提取**：`extractToolInput` 从 stdin rawInput 中提取 prompt、description、toolUseId（JSON-parse-first + regex fallback 双策略）
- **工具响应提取**：`extractToolResponse` 从 stdin rawInput 中提取 tool_response 对象（同双策略）
- **会话文件持久化**：`writeOutputFile` 和 `writePromptFile` 将数据写入 `~/.furina/sessions/{sessionId}/` 目录

**设计动机：**
- 所有 hook handler 都需要解析 stdin、执行 CLI 命令、写日志，提取这些公共逻辑避免重复代码
- stdin 输入可能含有 BOM、编码问题、畸形 JSON 等，采用 regex-first 提取策略保证健壮性
- 命令构建与执行分离，便于单元测试

**使用场景：**
- `runBeforeAgent` 调用 `validateBeforeAgent` 校验输入，调用 `buildBeforeAgentCommand`/`buildInitCommand` 构建命令，调用 `executeCommand` 执行，调用 `writeLog` 记录日志
- `runAfterAgent` 调用 `extractToolInput`/`extractToolResponse` 提取工具数据，调用 `writeOutputFile` 持久化
- `runBeforePropose` 调用 `buildBeforeProposeCommand` 构建 propose 阶段切换命令
- `runBeforeBash` 调用 `extractCommandFromRawInput`/`extractChangeName`/`executeChangeNewInit`（定义在行 543-685，属 spec-hooks-runner-propose-bash-question.md）
- `runBeforeQuestion` 内部使用 JSON-parse-first 策略提取 questions 数据

**涉及的源文件及职责：**
- `marketplace/scripts/furina_hooks.js`：单文件实现所有工具函数。行 1-14 为模块导入；行 16-36 为全局正则常量；行 38-293 为工具函数定义

## Architecture / Flow

### 工具函数调用关系

```
main()
  ├── parseStdin(rawInput)           ── 提取 sessionId、cwd
  │       ↓
  ├── runBeforeAgent(parsed, rawInput)
  │     ├── validateBeforeAgent(parsed, purpose)
  │     ├── buildInitCommand(sessionId, cwd)
  │     ├── buildBeforeAgentCommand(sessionId, purpose)
  │     ├── extractToolInput(rawInput)
  │     │     ├── JSON.parse(rawInput)          ── 首选策略
  │     │     └── regex fallback (RAW_PROMPT_PATTERN, DESCRIPTION_PATTERN, TOOL_USE_ID_PATTERN)
  │     ├── writePromptFile(sessionId, toolUseId, prompt)
  │     ├── executeCommand(commandArgs, cwd)
  │     └── writeLog(sessionId, message)
  │
  ├── runAfterAgent(parsed, rawInput)
  │     ├── extractToolInput(rawInput)
  │     ├── extractToolResponse(rawInput)
  │     │     ├── JSON.parse(rawInput)          ── 首选策略
  │     │     └── regex fallback
  │     ├── writeOutputFile(sessionId, toolUseId, toolResponse)
  │     └── writeLog(sessionId, message)
  │
  ├── runBeforePropose(parsed)
  │     ├── buildBeforeProposeCommand(sessionId)
  │     └── writeLog(sessionId, message)
  │
  ├── runInitAgent(parsed, rawInput)
  │     ├── buildInitCommand(sessionId, cwd, prompt)
  │     └── buildWorkflowCommand(sessionId)
  │
  ├── runBeforeBash(parsed, rawInput)
  │     └── extractCommandFromRawInput(rawInput)   (行 543-563)
  │
  └── runBeforeQuestion(parsed, rawInput)
        └── (内部 JSON.parse + regex fallback)
```

### 双策略提取流程（JSON-first + Regex Fallback）

```
rawInput 字符串
      │
      ├── [1] 尝试 JSON.parse(rawInput)
      │         ├── 成功 → 从解析后的对象中取字段
      │         │         (tool_input.prompt, tool_input.description,
      │         │          tool_use_id, tool_response 等)
      │         └── 失败（SyntaxError, BOM, 编码问题等）
      │                  │
      │                  v
      │             [2] 使用预编译的正则匹配
      │                   ├── RAW_PROMPT_PATTERN
      │                   ├── DESCRIPTION_PATTERN
      │                   ├── TOOL_USE_ID_PATTERN
      │                   └── tool_response regex
      │
      └── 返回提取结果（字段可能为 undefined）
```

## Functionality / Interface Details

### `parseStdin(rawInput: string) -> { sessionId: string|undefined, cwd: string|undefined }`

**Source**: `marketplace/scripts/furina_hooks.js` : 47-59

**Functionality**: 从原始 stdin 文本中提取 `session_id` 和 `cwd` 两个公共字段。这是所有 handler 共享的入口解析函数，只负责提取被多个 handler 共同需要的基础字段。使用正则提取（非 JSON.parse）以避免编码问题、畸形 JSON、BOM 字符等导致的解析失败。purpose 和 prompt 等特定字段由各 handler 自行按需解析。

**Parameters**:
- `rawInput` (`string`): 原始 stdin 文本。可能为 undefined、空字符串或含有 BOM/编码问题的文本

**Return Value**:
- `{ sessionId: string|undefined, cwd: string|undefined }`: 提取到的字段。匹配失败时对应字段为 undefined

**Core Logic**:
1. 检查 rawInput 是否为空或纯空白，若是则直接返回两个 undefined
2. 使用 `SESSION_ID_PATTERN` (`/"session_id"\s*:\s*"([a-zA-Z0-9-]+)"/i`) 匹配 sessionId
3. 使用 `CWD_PATTERN` (`/"cwd"\s*:\s*"([^"]+)"/i`) 匹配 cwd
4. 从正则匹配组 [1] 中提取值，匹配失败则返回 undefined

**Core Code**:
```javascript
export function parseStdin(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return { sessionId: undefined, cwd: undefined };
  }

  const sessionMatch = rawInput.match(SESSION_ID_PATTERN);
  const cwdMatch = rawInput.match(CWD_PATTERN);

  return {
    sessionId: sessionMatch ? sessionMatch[1] : undefined,
    cwd: cwdMatch ? cwdMatch[1] : undefined,
  };
}
```
Source: `marketplace/scripts/furina_hooks.js` : 47-59

**Usage Example**:
```javascript
const rawInput = '{"session_id":"abc-123","cwd":"/home/user/project"}';
const parsed = parseStdin(rawInput);
console.log(parsed.sessionId); // "abc-123"
console.log(parsed.cwd);       // "/home/user/project"
```
Explanation: 从包含 JSON 结构的 stdin 文本中提取 session_id 和 cwd。正则模式对空白和引号变化具有容错性，即使 JSON 有额外空格也能匹配。

---

### `validateBeforeAgent(parsed: { sessionId?: string, cwd?: string }, purpose: string|undefined) -> string|null`

**Source**: `marketplace/scripts/furina_hooks.js` : 67-81

**Functionality**: 校验 before-agent 模式所需的核心输入字段。此函数在 `runBeforeAgent` 流程的最前端被调用，确保后续的 CLI 命令执行不会因缺失必要参数而失败。校验 sessionId、purpose、cwd 三个必填字段，以及 cwd 路径是否真实存在。校验失败时返回可读的错误消息字符串，成功时返回 null。

**Parameters**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 由 `parseStdin` 解析出的字段对象
- `purpose` (`string|undefined`): 由 handler 解析出的 purpose 值（如 explore、plan、coding 等），作为显式参数传入而非从 parsed 中取

**Return Value**:
- `string|null`: 校验失败返回错误消息字符串（如 `'Missing required field: session_id'`），校验通过返回 `null`

**Core Logic**:
1. 依次检查 `parsed.sessionId`、`purpose`、`parsed.cwd` 是否为 falsy
2. 任何一项缺失则立即返回对应错误消息
3. 最后通过 `fs.existsSync(parsed.cwd)` 验证 cwd 路径存在性
4. 全部通过则返回 null

**Core Code**:
```javascript
export function validateBeforeAgent(parsed, purpose) {
  if (!parsed.sessionId) {
    return 'Missing required field: session_id';
  }
  if (!purpose) {
    return 'Missing required field: purpose (Furina:*:Purpose)';
  }
  if (!parsed.cwd) {
    return 'Missing required field: cwd';
  }
  if (!fs.existsSync(parsed.cwd)) {
    return `cwd path does not exist: ${parsed.cwd}`;
  }
  return null;
}
```
Source: `marketplace/scripts/furina_hooks.js` : 67-81

**Usage Example**:
```javascript
const parsed = { sessionId: 'abc-123', cwd: '/home/user/project' };
const error = validateBeforeAgent(parsed, 'explore');
if (error) {
  process.stderr.write(error);
  return;
}
// error === null, 校验通过，继续执行
```
Explanation: 在 before-agent handler 中，先调用此函数校验。若返回非 null，说明输入不完整，handler 直接 return 终止。purpose 是从 rawInput 中单独解析的，因此作为独立参数传入。

---

### `buildBeforeAgentCommand(sessionId: string, purpose: string) -> string[]`

**Source**: `marketplace/scripts/furina_hooks.js` : 89-91

**Functionality**: 构建 `furina agents switch <purpose>` 命令数组，用于在 before-agent 模式下将 agent 切换到目标阶段（如 explore、plan、coding）。此函数是纯函数，仅负责命令数组的组装。

**Parameters**:
- `sessionId` (`string`): 会话 ID，作为 `--session` 参数传入
- `purpose` (`string`): 目标阶段名称（如 explore、plan、coding）

**Return Value**:
- `string[]`: CLI 命令参数数组，可直接传给 `executeCommand` 执行

**Core Code**:
```javascript
export function buildBeforeAgentCommand(sessionId, purpose) {
  return ['furina', 'agents', 'switch', purpose, '--session', sessionId];
}
```
Source: `marketplace/scripts/furina_hooks.js` : 89-91

**Usage Example**:
```javascript
const cmd = buildBeforeAgentCommand('abc-123', 'explore');
// cmd = ['furina', 'agents', 'switch', 'explore', '--session', 'abc-123']
```
Explanation: 构建切换 agent 阶段的命令数组。调用者需注意 purpose 映射逻辑（如 integration 映射为 coding）在此函数外部处理。

---

### `buildInitCommand(sessionId: string, cwd: string, prompt?: string) -> string[]`

**Source**: `marketplace/scripts/furina_hooks.js` : 100-106

**Functionality**: 构建 `furina agents init` 命令数组，用于初始化 agent 会话。几乎所有 handler 在执行核心逻辑前都需要先初始化会话，此函数是最高频使用的命令构建函数。支持可选的 `--prompt` 参数，用于传递用户提示文本。

**Parameters**:
- `sessionId` (`string`): 会话 ID
- `cwd` (`string`): 工作目录路径
- `prompt` (`string|undefined`, 可选): 用户提示文本，若提供则追加 `--prompt "<prompt>"` 参数

**Return Value**:
- `string[]`: CLI 命令参数数组

**Core Logic**:
1. 基础命令固定为 `['furina', 'agents', 'init', '--session', sessionId, '--cwd', cwd]`
2. 若 prompt 参数为 truthy，追加 `'--prompt'` 和带双引号包裹的 prompt 字符串

**Core Code**:
```javascript
export function buildInitCommand(sessionId, cwd, prompt) {
  const command = ['furina', 'agents', 'init', '--session', sessionId, '--cwd', cwd];
  if (prompt) {
    command.push('--prompt', `"${prompt}"`);
  }
  return command;
}
```
Source: `marketplace/scripts/furina_hooks.js` : 100-106

**Usage Example**:
```javascript
// 不带 prompt
const cmd1 = buildInitCommand('abc-123', '/home/user/project');
// cmd1 = ['furina', 'agents', 'init', '--session', 'abc-123', '--cwd', '/home/user/project']

// 带 prompt
const cmd2 = buildInitCommand('abc-123', '/home/user/project', '/furina:workflow build a feature');
// cmd2 = [..., '--prompt', '"/furina:workflow build a feature"']
```
Explanation: 基础用法不含 prompt，init-agent 模式（UserPromptSubmit 事件）下会传入 prompt 以将用户输入的 workflow 命令传递给 init 流程。

---

### `buildWorkflowCommand(sessionId: string) -> string[]`

**Source**: `marketplace/scripts/furina_hooks.js` : 113-115

**Functionality**: 构建 `furina agents switch workflow` 命令数组，用于将 agent 切换回 workflow 阶段。在 after-agent 和 init-agent handler 中使用，将 agent 从特定阶段（如 explore、plan）切换回默认的 workflow 阶段。

**Parameters**:
- `sessionId` (`string`): 会话 ID

**Return Value**:
- `string[]`: CLI 命令参数数组

**Core Code**:
```javascript
export function buildWorkflowCommand(sessionId) {
  return ['furina', 'agents', 'switch', 'workflow', '--session', sessionId];
}
```
Source: `marketplace/scripts/furina_hooks.js` : 113-115

**Usage Example**:
```javascript
const cmd = buildWorkflowCommand('abc-123');
// cmd = ['furina', 'agents', 'switch', 'workflow', '--session', 'abc-123']
```
Explanation: 在 after-agent 流程中，agent 完成特定阶段任务后，通过此命令切回 workflow 阶段，恢复默认行为。

---

### `buildBeforeProposeCommand(sessionId: string) -> string[]`

**Source**: `marketplace/scripts/furina_hooks.js` : 122-124

**Functionality**: 构建 `furina agents switch propose` 命令数组，用于将 agent 切换到 propose 阶段。仅在 before-propose handler（MCP propose 工具调用前）使用。

**Parameters**:
- `sessionId` (`string`): 会话 ID

**Return Value**:
- `string[]`: CLI 命令参数数组

**Core Code**:
```javascript
export function buildBeforeProposeCommand(sessionId) {
  return ['furina', 'agents', 'switch', 'propose', '--session', sessionId];
}
```
Source: `marketplace/scripts/furina_hooks.js` : 122-124

**Usage Example**:
```javascript
const cmd = buildBeforeProposeCommand('abc-123');
// cmd = ['furina', 'agents', 'switch', 'propose', '--session', 'abc-123']
```
Explanation: 在 before-propose 流程中，agent init 完成后调用此命令将 agent 切换到 propose 阶段以准备生成提案。

---

### `executeCommand(commandArgs: string[], cwd: string, options?: { silent?: boolean }) -> { stdout: string, stderr: string, status: number } | null`

**Source**: `marketplace/scripts/furina_hooks.js` : 135-163

**Functionality**: 封装 Node.js `child_process.execSync` 的命令执行器，是所有 CLI 命令执行的统一出口。将命令参数数组拼接为字符串后执行，支持 silent 模式（失败时不向 stderr 输出错误信息），返回结构化的执行结果。镜像 Python 的 `subprocess.run(capture_output=True)` 行为。

**Parameters**:
- `commandArgs` (`string[]`): 命令参数数组，会被 `.join(' ')` 拼接为字符串执行
- `cwd` (`string`): 命令执行的工作目录
- `options` (`{ silent?: boolean }`, 可选): 执行选项
  - `options.silent` (`boolean`, 默认 `false`): 若为 true，命令失败时不向 process.stderr 输出错误信息

**Return Value**:
- `{ stdout: string, stderr: string, status: number }`: 成功时返回 stdout（已 trimEnd）、空 stderr、status=0；命令执行失败但捕获到 ExecSyncError 时返回 stdout/stderr/status（均可能为空字符串）
- `null`: 命令执行失败且无法提取 ExecSyncError 的 stdout/stderr/status 时返回 null

**Core Logic**:
1. 将 commandArgs 数组 join 为字符串（空格分隔）
2. 调用 `execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd })`
3. 成功时 trimEnd stdout 后返回 `{ stdout, stderr: '', status: 0 }`
4. 捕获异常时：若 silent 为 false，向 stderr 写入错误消息；若异常对象有 stdout/stderr/status 属性（ExecSyncError），返回结构化结果；否则返回 null

**Core Code**:
```javascript
export function executeCommand(commandArgs, cwd, options) {
  const silent = options && options.silent ? options.silent : false;
  const command = commandArgs.join(' ');
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    });
    return {
      stdout: stdout.trimEnd(),
      stderr: '',
      status: 0,
    };
  } catch (e) {
    if (!silent) {
      process.stderr.write(`Hook command failed: ${e.message}\n`);
    }
    if (e.stdout !== undefined || e.stderr !== undefined || e.status !== undefined) {
      return {
        stdout: (typeof e.stdout === 'string' ? e.stdout : '').trimEnd(),
        stderr: (typeof e.stderr === 'string' ? e.stderr : '').trimEnd(),
        status: e.status,
      };
    }
    return null;
  }
}
```
Source: `marketplace/scripts/furina_hooks.js` : 135-163

**Usage Example**:
```javascript
// 正常执行
const result = executeCommand(
  ['furina', 'agents', 'init', '--session', 'abc-123', '--cwd', '/home/user/project'],
  '/home/user/project'
);
console.log(result.status); // 0
console.log(result.stdout); // "Session initialized"

// silent 模式（用于 runInitAgent，避免非关键错误干扰用户）
const result2 = executeCommand(command, cwd, { silent: true });
```
Explanation: silent 模式主要用于 init-agent 等后台静默场景，避免 hook 执行失败时向用户输出无关错误。正常模式下失败会输出 `Hook command failed: <message>` 到 stderr。

---

### `writeLog(sessionId: string, message: string) -> void`

**Source**: `marketplace/scripts/furina_hooks.js` : 170-183

**Functionality**: 向 hooks 日志文件追加带时间戳的日志条目。日志文件位于 `~/.furina/logs/hooks/hooks-{sessionId}.log`。如果日志目录不存在会自动创建。此函数被所有 handler 频繁调用，用于记录接受的请求、执行的命令、命令执行结果等关键信息，便于调试和问题排查。

**Parameters**:
- `sessionId` (`string`): 会话 ID，用作日志文件名的一部分
- `message` (`string`): 日志消息内容

**Return Value**:
- `void`: 无返回值

**Core Logic**:
1. 构建日志目录路径 `~/.furina/logs/hooks/`
2. 若目录不存在，使用 `fs.mkdirSync(dir, { recursive: true })` 递归创建
3. 生成 ISO 时间戳，格式化为 `YYYY-MM-DD HH:mm:ss`（替换 T 为空格，截取前 19 字符）
4. 以追加模式写入 `{timestamp} INFO {message}\n`
5. 整个过程包裹在 try-catch 中，失败时静默忽略（不中断 hook 执行）

**Core Code**:
```javascript
export function writeLog(sessionId, message) {
  try {
    const logDir = path.join(os.homedir(), '.furina', 'logs', 'hooks');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logFile = path.join(logDir, `hooks-${sessionId}.log`);
    const logLine = `${timestamp} INFO ${message}\n`;
    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch {
    // Silently fail if logging is not available
  }
}
```
Source: `marketplace/scripts/furina_hooks.js` : 170-183

**Usage Example**:
```javascript
writeLog('abc-123', 'Accepted hook request --- session-id: abc-123');
writeLog('abc-123', 'Running command: furina agents init --session abc-123 --cwd /project');
writeLog('abc-123', 'Result of init-agent hook: returncode=0, stdout=\'Session initialized\', stderr=\'\'');
```
Explanation: 每条日志格式为 `{timestamp} INFO {message}`。handler 在关键节点（接受请求、执行命令、获取结果）各写入一条日志，形成完整的执行轨迹。

---

### `extractToolInput(rawInput: string) -> { prompt: string|undefined, description: string|undefined, toolUseId: string|undefined }`

**Source**: `marketplace/scripts/furina_hooks.js` : 200-221

**Functionality**: 从 stdin rawInput 中提取工具输入字段（prompt、description、toolUseId），供 before-agent 和 after-agent handler 使用。采用 JSON-parse-first 策略：优先尝试 JSON.parse 解析整个 rawInput 以获得结构化数据，失败时（BOM、编码问题、畸形 JSON）退回到正则匹配。prompt 对应 `tool_input.prompt`（workflow 命令文本），description 对应 `tool_input.description`（任务描述），toolUseId 对应 `tool_use_id`（工具调用唯一标识）。

**Parameters**:
- `rawInput` (`string`): 原始 stdin 文本

**Return Value**:
- `{ prompt: string|undefined, description: string|undefined, toolUseId: string|undefined }`: 提取到的三个字段。JSON.parse 成功时从 `data.tool_input.prompt`、`data.tool_input.description`、`data.tool_use_id` 取值；regex fallback 时分别用 `RAW_PROMPT_PATTERN`、`DESCRIPTION_PATTERN`、`TOOL_USE_ID_PATTERN` 匹配

**Core Logic**:
1. **JSON 首选路径**：调用 `JSON.parse(rawInput)`，成功后从 `data.tool_input?.prompt`、`data.tool_input?.description`、`data.tool_use_id` 取值
2. **Regex 回退路径**：JSON.parse 抛出异常时，分别用三个预编译正则从 rawInput 字符串匹配
3. 两种路径都可能返回 undefined（字段不存在或正则不匹配）

**Core Code**:
```javascript
function extractToolInput(rawInput) {
  let prompt;
  let description;
  let toolUseId;

  try {
    const data = JSON.parse(rawInput);
    prompt = data.tool_input?.prompt;
    description = data.tool_input?.description;
    toolUseId = data.tool_use_id;
  } catch {
    // JSON.parse failed, fall back to regex
    const promptMatch = rawInput.match(RAW_PROMPT_PATTERN);
    const descMatch = rawInput.match(DESCRIPTION_PATTERN);
    const tidMatch = rawInput.match(TOOL_USE_ID_PATTERN);
    prompt = promptMatch ? promptMatch[1] : undefined;
    description = descMatch ? descMatch[1] : undefined;
    toolUseId = tidMatch ? tidMatch[1] : undefined;
  }

  return { prompt, description, toolUseId };
}
```
Source: `marketplace/scripts/furina_hooks.js` : 200-221

**Usage Example**:
```javascript
const rawInput = JSON.stringify({
  tool_input: { prompt: '/furina:workflow build auth', description: 'Build authentication' },
  tool_use_id: 'tool-abc-456'
});

const { prompt, description, toolUseId } = extractToolInput(rawInput);
// prompt = '/furina:workflow build auth'
// description = 'Build authentication'
// toolUseId = 'tool-abc-456'
```
Explanation: before-agent handler 使用此函数提取三个字段：prompt 写入 promptFile 供后续读取，description 作为 change stage 的 title，toolUseId 作为文件名标识。注意此函数为非导出函数（无 export），仅在文件内部使用。

---

### `extractToolResponse(rawInput: string) -> object|undefined`

**Source**: `marketplace/scripts/furina_hooks.js` : 229-249

**Functionality**: 从 stdin rawInput 中提取 `tool_response` 对象。此函数用于 after-agent 模式，当 Agent 工具调用完成后需要提取执行结果（如 explore 结果、plan 输出等）。采用与 `extractToolInput` 相同的双策略：JSON-parse-first，regex fallback。

**Parameters**:
- `rawInput` (`string`): 原始 stdin 文本

**Return Value**:
- `object|undefined`: 提取到的 tool_response 对象。可能为任意结构的 JSON 对象，或 undefined（字段不存在/解析失败）

**Core Logic**:
1. 若 rawInput 为空或纯空白，直接返回 undefined
2. **JSON 首选路径**：`JSON.parse(rawInput)` 成功后返回 `data.tool_response`
3. **Regex 回退路径**：使用 `/"tool_response"\s*:\s*(\{[\s\S]*?\})\s*,\s*"tool_use_id"/` 正则匹配 tool_response 的 JSON 片段，再对匹配结果做 `JSON.parse`。此正则利用 `tool_use_id` 字段作为右侧边界锚定

**Core Code**:
```javascript
export function extractToolResponse(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return undefined;
  }

  try {
    const data = JSON.parse(rawInput);
    return data.tool_response;
  } catch {
    // JSON.parse failed, fall back to regex
    const match = rawInput.match(/"tool_response"\s*:\s*(\{[\s\S]*?\})\s*,\s*"tool_use_id"/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
```
Source: `marketplace/scripts/furina_hooks.js` : 229-249

**Usage Example**:
```javascript
const rawInput = JSON.stringify({
  tool_response: { result: 'Exploration complete', files: ['a.ts', 'b.ts'] },
  tool_use_id: 'tool-abc-456'
});

const response = extractToolResponse(rawInput);
// response = { result: 'Exploration complete', files: ['a.ts', 'b.ts'] }
```
Explanation: after-agent handler 使用此函数提取 Agent 工具的执行结果，然后通过 `writeOutputFile` 持久化到会话目录。正则 fallback 路径中使用非贪婪匹配 `{[\s\S]*?}` 配合 `tool_use_id` 作为锚点，避免匹配到后续内容。

---

### `writeOutputFile(sessionId: string, toolUseId: string, toolResponse: object) -> void`

**Source**: `marketplace/scripts/furina_hooks.js` : 258-273

**Functionality**: 将 toolResponse 对象序列化为 JSON 写入会话目录的文件中。文件路径为 `~/.furina/sessions/{sessionId}/{toolUseId}.json`。此函数在 after-agent handler 中使用，将 Agent 工具的执行结果持久化，供后续阶段（如 finalize、codebase sync）读取。自动创建目录（如不存在），使用 2 空格缩进的 JSON 格式。

**Parameters**:
- `sessionId` (`string`): 会话 ID，用作目录名
- `toolUseId` (`string`): 工具调用 ID，用作文件名
- `toolResponse` (`object`): 要写入的 tool_response 对象

**Return Value**:
- `void`: 无返回值

**Core Logic**:
1. 若 toolResponse 或 toolUseId 为 falsy，直接 return（静默跳过）
2. 构建会话目录路径 `~/.furina/sessions/{sessionId}`
3. 目录不存在时 `fs.mkdirSync(dir, { recursive: true })` 递归创建
4. 使用 `fs.writeFileSync` 写入格式化 JSON（2 空格缩进）
5. 整个过程包裹在 try-catch 中，失败时静默忽略

**Core Code**:
```javascript
export function writeOutputFile(sessionId, toolUseId, toolResponse) {
  if (!toolResponse || !toolUseId) {
    return;
  }

  try {
    const sessionDir = path.join(os.homedir(), '.furina', 'sessions', sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const filePath = path.join(sessionDir, `${toolUseId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(toolResponse, null, 2), 'utf-8');
  } catch {
    // Silently fail if writing output file is not available
  }
}
```
Source: `marketplace/scripts/furina_hooks.js` : 258-273

**Usage Example**:
```javascript
writeOutputFile('session-abc', 'tool-xyz-789', { result: 'done', data: [1, 2, 3] });
// 写入 ~/.furina/sessions/session-abc/tool-xyz-789.json
// 内容: { "result": "done", "data": [1, 2, 3] }
```
Explanation: after-agent handler 调用 `extractToolResponse` 提取结果后，调用此函数持久化。文件以 toolUseId 命名，确保同一会话内不同工具调用的结果互不冲突。

---

### `writePromptFile(sessionId: string, toolUseId: string, prompt: string) -> void`

**Source**: `marketplace/scripts/furina_hooks.js` : 282-293

**Functionality**: 将 prompt 文本内容写入会话目录的文件中。文件路径为 `~/.furina/sessions/{sessionId}/{toolUseId}.txt`。此函数为非导出函数（无 export），仅在 before-agent handler 内部使用。将用户的 workflow 命令文本持久化为文件，随后作为 `--input` 参数传递给 `furina change stage` 命令。

**Parameters**:
- `sessionId` (`string`): 会话 ID
- `toolUseId` (`string`): 工具调用 ID，用作文件名
- `prompt` (`string`): prompt 文本内容

**Return Value**:
- `void`: 无返回值

**Core Logic**:
1. 构建会话目录路径，目录不存在时递归创建
2. 文件扩展名为 `.txt`（区别于 outputFile 的 `.json`）
3. 直接写入 prompt 原始文本（不做 JSON 序列化）
4. try-catch 包裹，失败时静默忽略

**Core Code**:
```javascript
function writePromptFile(sessionId, toolUseId, prompt) {
  try {
    const sessionDir = path.join(os.homedir(), '.furina', 'sessions', sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const filePath = path.join(sessionDir, `${toolUseId}.txt`);
    fs.writeFileSync(filePath, prompt, 'utf-8');
  } catch {
    // Silently fail if writing prompt file is not available
  }
}
```
Source: `marketplace/scripts/furina_hooks.js` : 282-293

**Usage Example**:
```javascript
writePromptFile('session-abc', 'tool-xyz-789', '/furina:workflow build auth module');
// 写入 ~/.furina/sessions/session-abc/tool-xyz-789.txt
// 内容: /furina:workflow build auth module
```
Explanation: before-agent handler 中，当 prompt 和 toolUseId 都存在时调用。随后将文件路径作为 `--input` 参数传给 change stage 命令，使 change 记录中关联用户原始输入。

## Data Structures

### 正则模式常量（Regex Pattern Constants）

```javascript
const SESSION_ID_PATTERN   = /"session_id"\s*:\s*"([a-zA-Z0-9-]+)"/i;
const PURPOSE_PATTERN      = /Furina:\s*([a-zA-Z]+)\s*:Purpose/i;
const CWD_PATTERN          = /"cwd"\s*:\s*"([^"]+)"/i;
const PROMPT_PATTERN       = /"prompt"\s*:\s*"(\/furina:workflow[^"]*)"/i;
const COMMAND_PATTERN      = /"command"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description":/;
const CHANGE_NEW_PATTERN   = /furina change new\s+(\S+)/;
const RAW_PROMPT_PATTERN   = /"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/;
const DESCRIPTION_PATTERN  = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/;
const TOOL_USE_ID_PATTERN  = /"tool_use_id"\s*:\s*"([a-zA-Z0-9-]+)"/;
```

- `SESSION_ID_PATTERN`: 提取 session_id 字段值，仅匹配字母数字和连字符
- `PURPOSE_PATTERN`: 从 `Furina:Explore:Purpose` 格式中提取阶段名称
- `CWD_PATTERN`: 提取 cwd 路径值，匹配任意非引号字符（支持中文路径）
- `PROMPT_PATTERN`: 仅匹配 `/furina:workflow` 开头的 prompt
- `COMMAND_PATTERN`: 提取 Bash 工具的 command 字段，支持转义字符
- `CHANGE_NEW_PATTERN`: 从 `furina change new <name>` 提取 change 名称
- `RAW_PROMPT_PATTERN`: 通用 prompt 提取（支持转义字符），用于 extractToolInput
- `DESCRIPTION_PATTERN`: 通用 description 提取（支持转义字符）
- `TOOL_USE_ID_PATTERN`: 提取 tool_use_id，仅匹配字母数字和连字符

### 执行结果对象（ExecuteResult）

```javascript
{
  stdout: string,   // 标准输出（已 trimEnd）
  stderr: string,   // 标准错误（已 trimEnd，成功时为空字符串）
  status: number    // 进程退出码（0 表示成功）
}
```
- `stdout` (`string`): 命令的标准输出内容
- `stderr` (`string`): 命令的标准错误内容
- `status` (`number`): 进程退出码

## Error Handling and Edge Cases

### 静默失败策略

所有文件 I/O 操作（`writeLog`、`writeOutputFile`、`writePromptFile`）均采用静默失败策略：整个操作包裹在 try-catch 中，catch 块为空或仅有注释。这是 hook 脚本的设计原则——hook 执行不应因日志写入或文件持久化失败而中断主流程（Claude Code 的工具调用）。

### JSON Parse 失败处理

`extractToolInput` 和 `extractToolResponse` 采用双策略设计应对 stdin 输入的不可靠性：
- **BOM 字符**：UTF-8 BOM（`\uFEFF`）会导致 JSON.parse 失败，regex 回退不受影响
- **编码问题**：非 UTF-8 编码文本，JSON.parse 抛出 SyntaxError
- **畸形 JSON**：截断或格式错误的 JSON 文本
- **非 JSON 内容**：理论上不会出现，但 regex 兜底保证了安全性

### 空输入防御

- `parseStdin`: 检查 `!rawInput || !rawInput.trim()` 后直接返回 undefined 字段
- `extractToolResponse`: 检查 `!rawInput || !rawInput.trim()` 后返回 undefined
- `extractCommandFromRawInput`: 检查 `!rawInput || !rawInput.trim()` 后返回 undefined

### execSync 异常分级

`executeCommand` 对 execSync 的异常分三级处理：
1. **ExecSyncError**（有 stdout/stderr/status）：返回结构化结果，调用者可根据 status 判断
2. **其他异常**（无 stdout/stderr/status）：返回 null，表示严重失败
3. **成功**：返回 `{ stdout, stderr: '', status: 0 }`

### 目录创建

`writeLog`、`writeOutputFile`、`writePromptFile` 均使用 `fs.mkdirSync(dir, { recursive: true })` 确保目录层级创建，即使中间目录不存在也能正确创建。

## Dependencies

- **Depends on**:
  - Node.js `fs` 模块：文件读写、目录创建、路径存在性检查
  - Node.js `path` 模块：路径拼接
  - Node.js `os` 模块：`os.homedir()` 获取用户主目录
  - Node.js `child_process` 模块：`execSync` 命令执行
- **Depended by**:
  - `spec-hooks-runner-agent-lifecycle.md`：`runBeforeAgent` 和 `runAfterAgent` 使用 `validateBeforeAgent`、`buildBeforeAgentCommand`、`buildInitCommand`、`buildWorkflowCommand`、`executeCommand`、`writeLog`、`extractToolInput`、`extractToolResponse`、`writeOutputFile`、`writePromptFile`
  - `spec-hooks-runner-propose-bash-question.md`：`runBeforePropose` 使用 `buildInitCommand`、`buildBeforeProposeCommand`、`executeCommand`、`writeLog`；`runInitAgent` 使用 `buildInitCommand`、`buildWorkflowCommand`、`executeCommand`、`writeLog`；`runBeforeBash` 使用 `extractCommandFromRawInput`、`executeChangeNewInit`
  - `spec-hooks-runner-main.md`：`main()` 调用 `parseStdin` 解析 stdin

## Usage Examples

### 完整的 before-agent 工具函数调用流程

```javascript
import {
  parseStdin, validateBeforeAgent, buildInitCommand,
  buildBeforeAgentCommand, executeCommand, writeLog
} from './furina_hooks.js';

// 1. 解析 stdin
const rawInput = '{"session_id":"abc-123","cwd":"/home/user/project","tool_input":{...}}';
const parsed = parseStdin(rawInput);

// 2. 校验输入
const purpose = 'explore';
const error = validateBeforeAgent(parsed, purpose);
if (error) { return; }

// 3. 记录接受请求
writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);

// 4. 初始化会话
const initCmd = buildInitCommand(parsed.sessionId, parsed.cwd);
const initResult = executeCommand(initCmd, parsed.cwd);
writeLog(parsed.sessionId, `Result of init-agent hook: returncode=${initResult.status}`);

// 5. 切换到目标阶段
const switchCmd = buildBeforeAgentCommand(parsed.sessionId, purpose);
const switchResult = executeCommand(switchCmd, parsed.cwd);
writeLog(parsed.sessionId, `Result of switch-agent hook: returncode=${switchResult.status}`);
```
Explanation: 展示 before-agent handler 中工具函数的典型调用顺序：parseStdin 解析 -> validateBeforeAgent 校验 -> writeLog 记录 -> buildInitCommand 构建初始化命令 -> executeCommand 执行 -> buildBeforeAgentCommand 构建切换命令 -> executeCommand 执行。所有命令构建函数返回字符串数组，由 executeCommand 统一执行。

### extractToolInput + writePromptFile 联合使用

```javascript
import { extractToolInput, writePromptFile, writeOutputFile, extractToolResponse } from './furina_hooks.js';

// before-agent: 提取输入并写入 prompt 文件
const { prompt, description, toolUseId } = extractToolInput(rawInput);
if (prompt && toolUseId) {
  writePromptFile(parsed.sessionId, toolUseId, prompt);
  const inputPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, `${toolUseId}.txt`);
  // inputPath 传给 furina change stage --input
}

// after-agent: 提取响应并写入 output 文件
const toolResponse = extractToolResponse(rawInput);
if (toolResponse && toolUseId) {
  writeOutputFile(parsed.sessionId, toolUseId, toolResponse);
  const outputPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, `${toolUseId}.json`);
  // outputPath 传给 furina change stage --output
}
```
Explanation: 展示提取与文件持久化的联合模式。before-agent 提取 prompt（用户命令文本）写入 .txt 文件，after-agent 提取 tool_response（执行结果）写入 .json 文件。两个文件路径分别作为 change stage 的 `--input` 和 `--output` 参数。
