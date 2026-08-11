# Agent Lifecycle Handlers (Before/After Agent)

> Source files:
> - `marketplace/scripts/furina_hooks.js` : 295-433

## Overview

Agent Lifecycle Handlers 是 Furina hooks 系统的核心组件，负责在 Claude Code Agent 工具调用前后自动管理会话生命周期。该 spec 覆盖两个主要处理函数：`runBeforeAgent`（Agent PreToolUse 事件处理）和 `runAfterAgent`（Agent PostToolUse 事件处理）。

**在系统中的定位**：这两个处理函数是 Claude Code 与 Furina 工作流引擎之间的桥梁。当 Claude Code 执行 Agent 子代理调用时，hooks 系统通过 `hooks.json` 中的 PreToolUse/PostToolUse 匹配器自动触发对应的生命周期处理器，确保 agent 会话在整个工作流阶段（explore、plan、design、coding 等）中被正确初始化、切换上下文、记录输入输出。

**设计动机**：Furina 工作流需要追踪每个 Agent 子代理调用的生命周期阶段，包括：会话初始化（建立 session 关联）、阶段切换（将 provider 配置映射到正确的 LLM）、输入提取（记录 prompt 和描述信息到文件）、输出捕获（记录 tool_response 到文件）、状态更新（通知 change 管理系统阶段开始/完成）。这些逻辑集中在 agent lifecycle handlers 中，避免在工作流指令中重复实现。

**使用场景**：
- `runBeforeAgent`：在 Claude Code 的 `Agent` 工具被调用前触发（`hooks.json` 中 `PreToolUse` 匹配器 `"Agent"`）
- `runAfterAgent`：在 Claude Code 的 `Agent` 工具调用完成后触发（`hooks.json` 中 `PostToolUse` 匹配器 `"Agent"`，同时也在 `PreToolUse` 中匹配 `markEndPropose` MCP 工具时触发）

**涉及的源文件及职责**：
- `marketplace/scripts/furina_hooks.js`（第 295-433 行）：包含 `runBeforeAgent` 和 `runAfterAgent` 两个核心处理函数
- `marketplace/hooks/hooks.json`：定义了 hooks 触发配置，将 PreToolUse/PostToolUse 事件映射到 `--before-agent` / `--after-agent` 模式标志

## Architecture / Flow

### runBeforeAgent 完整流程

```
PreToolUse(Agent) 事件
    |
    v
1. 从 rawInput 提取 purpose (PURPOSE_PATTERN)
    |
    v
2. validateBeforeAgent(sessionId, purpose, cwd) 校验必填字段
    |-- 失败 --> 静默退出
    v
3. writeLog: 记录接受请求 (session-id, purpose, cwd)
    |
    v
4. buildInitCommand --> executeCommand: 初始化 agent 会话
    |
    v
5. purpose 映射: integration --> coding (用于 switch), 原始 purpose 保留给 change stage
    |
    v
6. buildBeforeAgentCommand --> executeCommand: 切换到目标阶段
    |
    v
7. extractToolInput(rawInput): 提取 prompt, description, toolUseId
    |
    v
8. [如果 prompt && toolUseId] writePromptFile: 写入 prompt 文件
    |
    v
9. furina change stage {purpose} --status in_progress [--title] [--input]
```

### runAfterAgent 完整流程

```
PostToolUse(Agent) 事件
    |
    v
1. 从 rawInput 提取 purpose (PURPOSE_PATTERN)
    |
    v
2. 校验 sessionId, cwd 存在性及 cwd 路径有效性
    |-- 失败 --> 静默退出
    v
3. writeLog: 记录接受请求 (session-id, cwd)
    |
    v
4. buildInitCommand --> executeCommand: 初始化 agent 会话
    |
    v
5. buildWorkflowCommand --> executeCommand: 切换到 workflow 阶段
    |
    v
6. extractToolInput(rawInput): 提取 prompt, description, toolUseId
    |
    v
7. extractToolResponse(rawInput): 提取 tool_response 对象
    |
    v
8. [如果 toolResponse && toolUseId] writeOutputFile: 写入输出文件
    |
    v
9. [如果 purpose 存在] furina change stage {purpose} --status done [--title] [--output]
```

### 关键设计决策

**integration 到 coding 的映射**：`runBeforeAgent` 在执行 `agents switch` 时将 `integration` purpose 映射为 `coding`，但在执行 `change stage` 时保留原始 `integration`。这是因为 Furina 的 provider 切换系统中没有独立的 `integration` 阶段，而 change 管理系统需要精确记录原始阶段名。

**after-agent 中 purpose 为可选**：`runAfterAgent` 不要求 purpose 必须存在（不同于 `runBeforeAgent`），但如果没有 purpose，将跳过最后的 `change stage` 调用。这允许在某些上下文中（如 `markEndPropose` 触发时）无需记录 change 阶段状态。

**验证策略差异**：`runBeforeAgent` 使用 `validateBeforeAgent` 进行完整的三字段校验（sessionId/purpose/cwd），而 `runAfterAgent` 直接内联校验 sessionId 和 cwd 存在性（purpose 为可选）。这种差异源于两者在验证严格性上的不同需求。

## Functionality / Interface Details

### `runBeforeAgent(parsed, rawInput) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:301-361

**Functionality**: Agent PreToolUse 事件的核心处理器。在 Claude Code 即将调用 Agent 子代理工具时执行，负责完成整个"启动 agent 会话"的准备工作：解析目的阶段、校验输入完整性、初始化会话、切换到目标 LLM provider 阶段、提取并持久化 prompt 内容、通知 change 管理系统开始新阶段。这是 Furina 工作流自动化启动的关键入口点。

**Parameters**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 由 `parseStdin(rawInput)` 解析出的通用字段。`sessionId` 是 Claude Code 会话唯一标识（UUID 格式），`cwd` 是当前工作目录绝对路径。
- `rawInput` (`string`): 从 stdin 读取的原始 JSON 文本，包含 Claude Code 传递的完整 tool_use 上下文。用于提取 purpose、prompt、description、toolUseId 等 handler 特定字段。

**Return Value**: 无返回值 (`void`)。函数通过副作用（execSync 命令执行、文件写入、日志记录）完成工作。验证失败时静默退出。

**Core Logic**:

1. **Purpose 提取**：使用 `PURPOSE_PATTERN` 正则从 rawInput 中匹配 `Furina:\s*([a-zA-Z]+)\s*:Purpose` 格式的阶段标识，并转换为小写。purpose 通常包含 `explore`、`plan`、`design`、`coding`、`integration` 等阶段名。

2. **输入验证**：调用 `validateBeforeAgent(parsed, purpose)` 校验三个必填字段。任一缺失或 cwd 路径不存在则静默返回（不写日志、不输出错误）。

3. **会话初始化**：通过 `buildInitCommand` 构建 `furina agents init --session {sessionId} --cwd {cwd}` 命令，然后 `executeCommand` 执行。此步骤确保 furina CLI 在 session 目录中创建必要的初始化状态。

4. **阶段切换（带 integration 映射）**：
   - 创建 `switchPurpose` 变量：当 `purpose === 'integration'` 时映射为 `'coding'`，否则保持原值
   - 保留原始 `purpose` 作为 `stagePurpose` 用于后续 change stage
   - 通过 `buildBeforeAgentCommand` 构建 `furina agents switch {switchPurpose} --session {sessionId}` 命令并执行

5. **Tool Input 提取与持久化**：调用 `extractToolInput(rawInput)` 提取 `prompt`、`description`、`toolUseId` 三个字段。当 `prompt` 和 `toolUseId` 都存在时，调用 `writePromptFile` 将 prompt 内容写入 `~/.furina/sessions/{sessionId}/{toolUseId}.txt`，并构建 `inputPath` 用于 change stage 命令。

6. **Change Stage 通知**：构建 `furina change stage {stagePurpose} --session {sessionId} --status in_progress` 命令，附加可选参数 `--title`（来自 description，双引号替换为单引号）和 `--input`（prompt 文件路径），然后执行。

7. **全程日志**：每个步骤都通过 `writeLog` 记录详细的执行日志，包括接受请求信息、命令内容、执行结果（returncode/stdout/stderr）。

**Core Code**:
```javascript
export function runBeforeAgent(parsed, rawInput) {
  // Parse purpose internally
  const purposeMatch = (rawInput || '').match(PURPOSE_PATTERN);
  const purpose = purposeMatch ? purposeMatch[1].toLowerCase() : undefined;

  const error = validateBeforeAgent(parsed, purpose);
  if (error) {
    return;
  }

  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- furina-purpose: ${purpose}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  // Initialize the agent session first
  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  const initCommandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${initCommandStr} (cwd: ${parsed.cwd})`);
  const initResult = executeCommand(initCommand, parsed.cwd);

  // Map integration→coding for agents switch, keep original for change stage
  const switchPurpose = purpose === 'integration' ? 'coding' : purpose;
  const stagePurpose = purpose;

  // Then switch to the target stage
  const command = buildBeforeAgentCommand(parsed.sessionId, switchPurpose);
  const commandStr = command.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(command, parsed.cwd);

  // Extract prompt/description/tool_use_id from stdin
  const { prompt, description, toolUseId } = extractToolInput(rawInput);

  // Write prompt to file if both prompt and toolUseId are present
  let inputPath;
  if (prompt && toolUseId) {
    writePromptFile(parsed.sessionId, toolUseId, prompt);
    inputPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, `${toolUseId}.txt`);
  }

  // Call change stage command
  const stageArgs = ['furina', 'change', 'stage', stagePurpose, '--session', parsed.sessionId, '--status', 'in_progress'];
  if (description) {
    stageArgs.push('--title', `"${description.replace(/"/g, "'")}"`);
  }
  if (inputPath) {
    stageArgs.push('--input', `"${inputPath}"`);
  }
  const stageCommandStr = stageArgs.join(' ');
  writeLog(parsed.sessionId, `Running command: ${stageCommandStr} (cwd: ${parsed.cwd})`);
  const stageResult = executeCommand(stageArgs, parsed.cwd);
}
```
Source: `marketplace/scripts/furina_hooks.js`:301-361

**Usage Example**:
```javascript
// 由 main() 函数自动调用，不直接调用
// 调用路径：main() --> runBeforeAgent(parsed, rawInput)
//
// stdin 输入示例（Claude Code PreToolUse 事件）：
// {
//   "session_id": "abc-123-def",
//   "cwd": "/home/user/project",
//   "tool_input": {
//     "prompt": "Design the API endpoints",
//     "description": "API Design Phase"
//   },
//   "tool_use_id": "tool-xyz-789",
//   "Furina: design: Purpose": ""
// }
//
// 执行结果：
// 1. furina agents init --session abc-123-def --cwd /home/user/project
// 2. furina agents switch design --session abc-123-def
// 3. 写入 ~/.furina/sessions/abc-123-def/tool-xyz-789.txt (prompt 内容)
// 4. furina change stage design --session abc-123-def --status in_progress --title "API Design Phase" --input "~/.furina/sessions/abc-123-def/tool-xyz-789.txt"
```
Explanation: 此示例展示了当 Claude Code 准备启动一个 Agent 子代理（以 design 阶段为目的）时，`runBeforeAgent` 如何按顺序执行初始化、阶段切换、prompt 持久化和 change 状态通知的完整流程。

---

### `runAfterAgent(parsed, rawInput) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:370-433

**Functionality**: Agent PostToolUse 事件的核心处理器。在 Claude Code 的 Agent 子代理调用完成后执行，负责完成"关闭 agent 会话"的收尾工作：重新初始化会话（确保状态同步）、切换回 workflow 阶段（恢复到主工作流 LLM provider）、提取并持久化 toolResponse 输出、通知 change 管理系统阶段完成。同时也在 `markEndPropose` MCP 工具的 PreToolUse 事件中被触发（通过 `hooks.json` 配置）。

**Parameters**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 由 `parseStdin(rawInput)` 解析出的通用字段。`sessionId` 是 Claude Code 会话唯一标识，`cwd` 是当前工作目录。
- `rawInput` (`string`): 从 stdin 读取的原始 JSON 文本。用于提取 purpose、tool_input（prompt/description/toolUseId）和 tool_response 对象。

**Return Value**: 无返回值 (`void`)。函数通过副作用完成工作。验证失败或 purpose 不存在时静默退出。

**Core Logic**:

1. **Purpose 提取**：与 `runBeforeAgent` 相同，使用 `PURPOSE_PATTERN` 正则从 rawInput 提取并转为小写。

2. **输入验证**：直接内联校验 `sessionId` 存在、`cwd` 存在且路径有效。与 `runBeforeAgent` 不同的是，purpose 不作为必填校验项（仅在最后的 change stage 步骤中作为条件判断）。

3. **会话初始化**：与 `runBeforeAgent` 相同，调用 `buildInitCommand` + `executeCommand` 初始化会话。

4. **切换回 workflow 阶段**：调用 `buildWorkflowCommand` 构建 `furina agents switch workflow --session {sessionId}` 命令并执行。注意这里始终切换到 `workflow` 阶段（不使用 purpose），因为 agent 完成后应恢复到主工作流的 LLM provider 配置。

5. **Tool Input 提取**：调用 `extractToolInput(rawInput)` 提取 `prompt`、`description`、`toolUseId`。虽然这些字段在 after-agent 中主要用于获取 `description`（用于 change stage 的 title），但统一调用以确保一致性。

6. **Tool Response 提取与持久化**：调用 `extractToolResponse(rawInput)` 提取 `tool_response` 对象。当 `toolResponse` 和 `toolUseId` 都存在时，调用 `writeOutputFile` 将 JSON 写入 `~/.furina/sessions/{sessionId}/{toolUseId}.json`，并构建 `outputPath`。

7. **Change Stage 通知（条件性）**：仅当 `purpose` 存在时执行。构建 `furina change stage {purpose} --session {sessionId} --status done` 命令，附加可选参数 `--title`（来自 description）和 `--output`（输出文件路径），然后执行。与 `runBeforeAgent` 的关键区别是 `--status done` 而非 `in_progress`，以及使用 `--output` 而非 `--input`。

**Core Code**:
```javascript
export function runAfterAgent(parsed, rawInput) {
  // Parse purpose internally from rawInput
  const purposeMatch = (rawInput || '').match(PURPOSE_PATTERN);
  const purpose = purposeMatch ? purposeMatch[1].toLowerCase() : undefined;

  // Validate required fields (purpose is optional for after-agent)
  if (!parsed.sessionId || !parsed.cwd || !fs.existsSync(parsed.cwd)) {
    return;
  }

  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  // Initialize the agent session first
  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  const initCommandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${initCommandStr} (cwd: ${parsed.cwd})`);
  const initResult = executeCommand(initCommand, parsed.cwd);

  // Then switch to workflow stage
  const command = buildWorkflowCommand(parsed.sessionId);
  const commandStr = command.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(command, parsed.cwd);

  // Extract prompt/description/tool_use_id from stdin
  const { prompt, description, toolUseId } = extractToolInput(rawInput);

  // Extract tool_response from stdin
  const toolResponse = extractToolResponse(rawInput);

  // Write toolResponse to file if both toolResponse and toolUseId are present
  let outputPath;
  if (toolResponse && toolUseId) {
    writeOutputFile(parsed.sessionId, toolUseId, toolResponse);
    outputPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, `${toolUseId}.json`);
  }

  // Call change stage command with --status done
  if (!purpose) {
    return;
  }
  const stagePurpose = purpose;

  const stageArgs = ['furina', 'change', 'stage', stagePurpose, '--session', parsed.sessionId, '--status', 'done'];
  if (description) {
    stageArgs.push('--title', `"${description.replace(/"/g, "'")}"`);
  }
  if (outputPath) {
    stageArgs.push('--output', `"${outputPath}"`);
  }
  const stageCommandStr = stageArgs.join(' ');
  writeLog(parsed.sessionId, `Running command: ${stageCommandStr} (cwd: ${parsed.cwd})`);
  const stageResult = executeCommand(stageArgs, parsed.cwd);
}
```
Source: `marketplace/scripts/furina_hooks.js`:370-433

**Usage Example**:
```javascript
// 由 main() 函数自动调用
// 调用路径：main() --> runAfterAgent(parsed, rawInput)
//
// stdin 输入示例（Claude Code PostToolUse 事件）：
// {
//   "session_id": "abc-123-def",
//   "cwd": "/home/user/project",
//   "tool_input": {
//     "prompt": "Design the API endpoints",
//     "description": "API Design Phase"
//   },
//   "tool_use_id": "tool-xyz-789",
//   "tool_response": {
//     "content": "...",
//     "artifacts": ["design.md"]
//   },
//   "Furina: design: Purpose": ""
// }
//
// 执行结果：
// 1. furina agents init --session abc-123-def --cwd /home/user/project
// 2. furina agents switch workflow --session abc-123-def
// 3. 写入 ~/.furina/sessions/abc-123-def/tool-xyz-789.json (toolResponse)
// 4. furina change stage design --session abc-123-def --status done --title "API Design Phase" --output "~/.furina/sessions/abc-123-def/tool-xyz-789.json"
```
Explanation: 此示例展示了当 Agent 子代理完成设计阶段后，`runAfterAgent` 如何重新初始化会话、切换回 workflow 阶段、持久化 agent 输出、并通知 change 管理系统该阶段已完成。

---

### `extractToolInput(rawInput) -> { prompt, description, toolUseId }`

**Source**: `marketplace/scripts/furina_hooks.js`:200-221

**Functionality**: 从 stdin 原始输入中提取 agent 工具调用的三个关键字段：`prompt`（发送给子代理的提示内容）、`description`（调用的人类可读描述）、`toolUseId`（工具调用的唯一标识符）。采用 JSON-parse-first 策略，优先使用 `JSON.parse` 解析 `tool_input` 对象，解析失败时回退到正则表达式提取。这种双重策略确保在遇到编码问题、BOM 字符、畸形 JSON 等异常情况时仍能正确提取数据。

**Parameters**:
- `rawInput` (`string`): 从 stdin 读取的原始文本，预期为 JSON 格式但可能包含各种异常情况。

**Return Value**:
- `{ prompt: string|undefined, description: string|undefined, toolUseId: string|undefined }`: 提取出的三个字段。未找到的字段值为 `undefined`。
- 当 rawInput 为空或畸形时，所有字段为 `undefined`。

**Core Logic**:

1. 尝试 `JSON.parse(rawInput)`，成功后从 `data.tool_input?.prompt`、`data.tool_input?.description`、`data.tool_use_id` 提取字段。
2. JSON.parse 失败时（catch 块），使用三个正则模式匹配：
   - `RAW_PROMPT_PATTERN`：匹配 `"prompt": "..."` 格式，支持转义字符
   - `DESCRIPTION_PATTERN`：匹配 `"description": "..."` 格式
   - `TOOL_USE_ID_PATTERN`：匹配 `"tool_use_id": "..."` 格式（仅字母数字和连字符）

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
Source: `marketplace/scripts/furina_hooks.js`:200-221

**Usage Example**:
```javascript
// 典型调用（在 runBeforeAgent / runAfterAgent 中）
const { prompt, description, toolUseId } = extractToolInput(rawInput);

// rawInput 示例：
// {"tool_input":{"prompt":"Analyze the API","description":"API Analysis"},"tool_use_id":"abc-123"}

// 返回结果：
// { prompt: "Analyze the API", description: "API Analysis", toolUseId: "abc-123" }
```
Explanation: `extractToolInput` 被 `runBeforeAgent` 和 `runAfterAgent` 共同调用，用于从 Claude Code 传递的 stdin JSON 中提取工具输入信息。提取结果分别用于 prompt 文件写入（before-agent）和 change stage title 设置（两者）。

---

### `extractToolResponse(rawInput) -> object|undefined`

**Source**: `marketplace/scripts/furina_hooks.js`:229-249

**Functionality**: 从 stdin 原始输入中提取 `tool_response` 对象。与 `extractToolInput` 相同采用 JSON-parse-first 策略。此函数专门用于 `runAfterAgent`，捕获 Agent 子代理执行完成后的返回结果（如生成的文件内容、执行摘要等）。提取到的 toolResponse 将被序列化为 JSON 并写入会话目录下的输出文件。

**Parameters**:
- `rawInput` (`string`): 从 stdin 读取的原始文本。

**Return Value**:
- `object|undefined`: 解析出的 tool_response 对象，或在提取失败时返回 `undefined`。
- 边界情况：rawInput 为空时返回 `undefined`；JSON 中无 `tool_response` 字段时返回 `undefined`；正则回退匹配到的 JSON 片段解析失败时返回 `undefined`。

**Core Logic**:

1. 空输入检查：rawInput 为空或仅空白时直接返回 `undefined`。
2. 尝试 `JSON.parse(rawInput)`，成功后返回 `data.tool_response`。
3. JSON.parse 失败时，使用正则 `/"tool_response"\s*:\s*(\{[\s\S]*?\})\s*,\s*"tool_use_id"/` 匹配 tool_response JSON 对象。正则使用非贪婪匹配 `\{[\s\S]*?\}` 捕获从 `{` 到最近的 `}` 之间的内容。
4. 正则匹配成功后尝试 `JSON.parse(match[1])` 解析捕获的 JSON 片段，失败则返回 `undefined`。

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
Source: `marketplace/scripts/furina_hooks.js`:229-249

**Usage Example**:
```javascript
// 在 runAfterAgent 中调用
const toolResponse = extractToolResponse(rawInput);

// rawInput 示例：
// {"tool_response":{"summary":"Analysis complete","files":["design.md"]},"tool_use_id":"abc-123"}

// 返回结果：
// { summary: "Analysis complete", files: ["design.md"] }
```
Explanation: 用于提取 Agent 子代理的执行结果。结果会被 `writeOutputFile` 持久化为 JSON 文件，路径为 `~/.furina/sessions/{sessionId}/{toolUseId}.json`，并作为 `--output` 参数传递给 `change stage` 命令。

---

### `writePromptFile(sessionId, toolUseId, prompt) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:282-293

**Functionality**: 将 prompt 文本内容写入会话目录下的文件。在 `runBeforeAgent` 中调用，用于持久化 Agent 子代理的输入提示内容。文件路径为 `~/.furina/sessions/{sessionId}/{toolUseId}.txt`，与 `writeOutputFile` 使用相同的目录结构但不同的扩展名（`.txt` vs `.json`）。

**Parameters**:
- `sessionId` (`string`): 会话标识符，用于构建会话目录路径。
- `toolUseId` (`string`): 工具调用标识符，用作文件名（不含扩展名）。
- `prompt` (`string`): 要写入的 prompt 文本内容。

**Return Value**: 无返回值。写入失败时静默忽略。

**Core Logic**:

1. 构建会话目录路径 `~/.furina/sessions/{sessionId}`。
2. 若目录不存在则递归创建（`mkdirSync({ recursive: true })`）。
3. 使用 `writeFileSync` 将 prompt 内容以 UTF-8 编码写入 `{toolUseId}.txt` 文件。
4. 整个过程在 try-catch 中执行，失败时静默跳过。

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
Source: `marketplace/scripts/furina_hooks.js`:282-293

**Usage Example**:
```javascript
// 在 runBeforeAgent 中调用
if (prompt && toolUseId) {
  writePromptFile(parsed.sessionId, toolUseId, prompt);
  inputPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, `${toolUseId}.txt`);
}

// 文件写入示例：
// sessionId = "abc-123"
// toolUseId = "tool-xyz"
// prompt = "Design the REST API endpoints for user management"
// 写入位置：~/.furina/sessions/abc-123/tool-xyz.txt
```
Explanation: prompt 文件被持久化后，其路径通过 `--input` 参数传递给 `change stage` 命令，使 change 管理系统能够关联阶段记录与其原始输入。

---

### `writeOutputFile(sessionId, toolUseId, toolResponse) -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:258-273

**Functionality**: 将 toolResponse 对象序列化为格式化 JSON 并写入会话目录下的文件。在 `runAfterAgent` 中调用，用于持久化 Agent 子代理的执行结果。文件路径为 `~/.furina/sessions/{sessionId}/{toolUseId}.json`，使用 2 空格缩进的 JSON 格式。此函数是 exported 的，因为它在 `runBeforePropose` 等其他 handler 中也可能被使用。

**Parameters**:
- `sessionId` (`string`): 会话标识符。
- `toolUseId` (`string`): 工具调用标识符，用作文件名。
- `toolResponse` (`object`): 要序列化写入的 tool response 对象。

**Return Value**: 无返回值。当 toolResponse 或 toolUseId 为 falsy 时静默跳过；写入失败时静默忽略。

**Core Logic**:

1. 前置检查：`toolResponse` 或 `toolUseId` 为 falsy 时直接返回。
2. 构建会话目录路径并确保目录存在。
3. 使用 `JSON.stringify(toolResponse, null, 2)` 格式化输出，通过 `writeFileSync` 写入 `{toolUseId}.json`。

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
Source: `marketplace/scripts/furina_hooks.js`:258-273

**Usage Example**:
```javascript
// 在 runAfterAgent 中调用
if (toolResponse && toolUseId) {
  writeOutputFile(parsed.sessionId, toolUseId, toolResponse);
  outputPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, `${toolUseId}.json`);
}

// 写入结果示例（~/.furina/sessions/abc-123/tool-xyz.json）：
// {
//   "summary": "API design complete",
//   "files": ["design.md", "specs.md"]
// }
```
Explanation: 输出文件路径通过 `--output` 参数传递给 `change stage` 命令，使 change 管理系统能够存储阶段的执行结果，供后续工作流阶段查询和参考。

---

### `validateBeforeAgent(parsed, purpose) -> string|null`

**Source**: `marketplace/scripts/furina_hooks.js`:67-81

**Functionality**: 为 `--before-agent` 模式验证输入数据的完整性。检查三个必填字段：`sessionId`（Claude Code 会话标识）、`purpose`（Furina 阶段标识）、`cwd`（工作目录路径），并验证 cwd 路径在文件系统中确实存在。此函数仅被 `runBeforeAgent` 使用；`runAfterAgent` 使用内联校验，因为 purpose 对它而言是可选的。

**Parameters**:
- `parsed` (`{ sessionId?: string, cwd?: string }`): 解析后的 stdin 通用字段。
- `purpose` (`string|undefined`): 已解析的阶段标识（小写），由调用方从 rawInput 中提取。

**Return Value**:
- `string|null`: 校验通过返回 `null`；校验失败返回具体的错误信息字符串。
  - `'Missing required field: session_id'` - sessionId 缺失
  - `'Missing required field: purpose (Furina:*:Purpose)'` - purpose 缺失
  - `'Missing required field: cwd'` - cwd 缺失
  - `'cwd path does not exist: {cwd}'` - cwd 路径不存在

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
Source: `marketplace/scripts/furina_hooks.js`:67-81

**Usage Example**:
```javascript
const purpose = 'explore';
const parsed = { sessionId: 'abc-123', cwd: '/home/user/project' };
const error = validateBeforeAgent(parsed, purpose);
// error === null (校验通过)

const parsed2 = { sessionId: undefined, cwd: '/home/user/project' };
const error2 = validateBeforeAgent(parsed2, purpose);
// error2 === 'Missing required field: session_id'
```
Explanation: 此函数在 `runBeforeAgent` 开头调用，确保所有必填条件满足后才继续执行后续的初始化和切换操作。校验失败时 `runBeforeAgent` 静默退出（不输出错误），因为 hooks 系统设计为在任何异常情况下都不应中断 Claude Code 的正常执行。

---

### `buildBeforeAgentCommand(sessionId, purpose) -> string[]`

**Source**: `marketplace/scripts/furina_hooks.js`:89-91

**Functionality**: 构建 agent 阶段切换命令参数数组。返回的数组可直接传递给 `executeCommand` 执行，或通过 `join(' ')` 转换为命令字符串用于日志记录。

**Parameters**:
- `sessionId` (`string`): 会话标识符。
- `purpose` (`string`): 目标阶段名（注意：在 `runBeforeAgent` 中传入的是经过 integration->coding 映射后的 switchPurpose）。

**Return Value**:
- `string[]`: 命令参数数组 `['furina', 'agents', 'switch', purpose, '--session', sessionId]`。

**Core Code**:
```javascript
export function buildBeforeAgentCommand(sessionId, purpose) {
  return ['furina', 'agents', 'switch', purpose, '--session', sessionId];
}
```
Source: `marketplace/scripts/furina_hooks.js`:89-91

**Usage Example**:
```javascript
const cmd = buildBeforeAgentCommand('abc-123', 'coding');
// ['furina', 'agents', 'switch', 'coding', '--session', 'abc-123']

// 在 runBeforeAgent 中的使用方式：
const command = buildBeforeAgentCommand(parsed.sessionId, switchPurpose);
const result = executeCommand(command, parsed.cwd);
```

---

### `buildWorkflowCommand(sessionId) -> string[]`

**Source**: `marketplace/scripts/furina_hooks.js`:113-115

**Functionality**: 构建切换回 workflow 阶段的命令参数数组。与 `buildBeforeAgentCommand` 不同，此函数始终切换到固定的 `workflow` 阶段，用于 agent 完成后恢复主工作流的 LLM provider 配置。

**Parameters**:
- `sessionId` (`string`): 会话标识符。

**Return Value**:
- `string[]`: 命令参数数组 `['furina', 'agents', 'switch', 'workflow', '--session', sessionId]`。

**Core Code**:
```javascript
export function buildWorkflowCommand(sessionId) {
  return ['furina', 'agents', 'switch', 'workflow', '--session', sessionId];
}
```
Source: `marketplace/scripts/furina_hooks.js`:113-115

**Usage Example**:
```javascript
const cmd = buildWorkflowCommand('abc-123');
// ['furina', 'agents', 'switch', 'workflow', '--session', 'abc-123']

// 在 runAfterAgent 中的使用方式：
const command = buildWorkflowCommand(parsed.sessionId);
const result = executeCommand(command, parsed.cwd);
```

---

### `buildInitCommand(sessionId, cwd, prompt?) -> string[]`

**Source**: `marketplace/scripts/furina_hooks.js`:100-106

**Functionality**: 构建 agent 会话初始化命令参数数组。初始化确保 furina CLI 在 session 目录中创建必要的状态文件和配置。可选的 `prompt` 参数用于在初始化时注入初始提示内容（仅在 `runInitAgent` 中使用）。

**Parameters**:
- `sessionId` (`string`): 会话标识符。
- `cwd` (`string`): 工作目录路径。
- `prompt` (`string`, optional): 可选的初始 prompt 文本。当提供时会被双引号包裹后追加到命令参数中。

**Return Value**:
- `string[]`: 命令参数数组。基础格式为 `['furina', 'agents', 'init', '--session', sessionId, '--cwd', cwd]`，带 prompt 时追加 `['--prompt', '"{prompt}"']`。

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
Source: `marketplace/scripts/furina_hooks.js`:100-106

**Usage Example**:
```javascript
// 无 prompt（在 runBeforeAgent / runAfterAgent 中使用）
const cmd1 = buildInitCommand('abc-123', '/home/user/project');
// ['furina', 'agents', 'init', '--session', 'abc-123', '--cwd', '/home/user/project']

// 带 prompt（在 runInitAgent 中使用）
const cmd2 = buildInitCommand('abc-123', '/home/user/project', '/furina:workflow build feature');
// ['furina', 'agents', 'init', '--session', 'abc-123', '--cwd', '/home/user/project', '--prompt', '"/furina:workflow build feature"']
```

## Data Structures

### `ParsedStdin`

```javascript
// 由 parseStdin(rawInput) 返回的解析结果
{ sessionId: string|undefined, cwd: string|undefined }
```
- `sessionId` (`string|undefined`): Claude Code 会话唯一标识符，UUID 格式（如 `abc-123-def-456`）。
- `cwd` (`string|undefined`): 当前工作目录的绝对路径。

### `ToolInput`

```javascript
// 由 extractToolInput(rawInput) 返回的提取结果
{ prompt: string|undefined, description: string|undefined, toolUseId: string|undefined }
```
- `prompt` (`string|undefined`): 发送给 Agent 子代理的提示文本内容。通常包含工作流指令和上下文信息。
- `description` (`string|undefined`): Agent 工具调用的人类可读描述。用于 change stage 的 `--title` 参数。
- `toolUseId` (`string|undefined`): Claude Code 为此次工具调用分配的唯一标识符。用于关联输入文件（`.txt`）和输出文件（`.json`）。

### `CommandResult`

```javascript
// 由 executeCommand(commandArgs, cwd, options) 返回的执行结果
{ stdout: string, stderr: string, status: number } | null
```
- `stdout` (`string`): 标准输出内容（已 trimEnd）。
- `stderr` (`string`): 标准错误内容（已 trimEnd）。
- `status` (`number`): 进程退出码，0 表示成功。
- `null`: 命令执行异常且非 ExecSyncError 时返回。

### Regex Patterns

```javascript
// 用于从 rawInput 提取 purpose 的正则模式
const PURPOSE_PATTERN = /Furina:\s*([a-zA-Z]+)\s*:Purpose/i;

// 用于提取 prompt（支持转义字符）
const RAW_PROMPT_PATTERN = /"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/;

// 用于提取 description（支持转义字符）
const DESCRIPTION_PATTERN = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/;

// 用于提取 tool_use_id（仅字母数字和连字符）
const TOOL_USE_ID_PATTERN = /"tool_use_id"\s*:\s*"([a-zA-Z0-9-]+)"/;
```
- `PURPOSE_PATTERN`: 匹配 `Furina: {stage}:Purpose` 格式，捕获组为阶段名（大小写不敏感，输出转小写）。
- `RAW_PROMPT_PATTERN`: 匹配 `"prompt": "..."` 格式，支持 JSON 转义字符（如 `\"`）。
- `DESCRIPTION_PATTERN`: 匹配 `"description": "..."` 格式，同样支持转义。
- `TOOL_USE_ID_PATTERN`: 匹配 `"tool_use_id": "..."` 格式，仅捕获字母、数字和连字符。

## Error Handling and Edge Cases

### 静默失败策略

Agent lifecycle handlers 采用全面的"静默失败"策略，确保任何异常都不会中断 Claude Code 的正常执行：

1. **输入验证失败**：`runBeforeAgent` 中 `validateBeforeAgent` 返回错误时直接 `return`，不输出任何错误信息。`runAfterAgent` 中 sessionId/cwd 校验失败同样静默退出。

2. **命令执行失败**：`executeCommand` 内部 try-catch 捕获所有 `execSync` 异常。失败时通过 `process.stderr.write` 输出错误（除非 `silent: true`），但不影响后续流程。注意：在 `runBeforeAgent` 和 `runAfterAgent` 中，命令执行失败不会阻止后续步骤（如 change stage 调用仍会执行）。

3. **文件写入失败**：`writePromptFile`、`writeOutputFile`、`writeLog` 都在 try-catch 中执行，写入失败时静默忽略。

4. **JSON 解析失败**：`extractToolInput` 和 `extractToolResponse` 都采用 JSON-parse-first + regex-fallback 双重策略，在解析失败时尝试正则回退。

### 边界条件

1. **purpose 为空**：`runBeforeAgent` 中 purpose 缺失会导致 `validateBeforeAgent` 返回错误并静默退出。`runAfterAgent` 中 purpose 为空时，仅跳过最后的 `change stage` 步骤，其他步骤（初始化、切换、输出写入）仍正常执行。

2. **prompt/toolUseId 缺失**：当 `extractToolInput` 返回的 `prompt` 或 `toolUseId` 为 `undefined` 时，`writePromptFile` 调用被跳过，`inputPath` 保持 `undefined`，change stage 命令不带 `--input` 参数。

3. **toolResponse/toolUseId 缺失**：同上，`writeOutputFile` 调用被跳过，`outputPath` 保持 `undefined`，change stage 命令不带 `--output` 参数。

4. **integration purpose 映射**：`runBeforeAgent` 中当 `purpose === 'integration'` 时，`agents switch` 使用 `coding` 阶段（因为无独立 integration provider），但 `change stage` 保留原始 `integration` 名称。

5. **description 中的双引号**：change stage 的 `--title` 参数中，description 中的双引号会被替换为单引号（`description.replace(/"/g, "'")`），避免 shell 命令解析问题。

6. **cwd 路径不存在**：两个 handler 都使用 `fs.existsSync(cwd)` 校验路径，不存在时静默退出。这防止了在无效目录中执行 CLI 命令。

### after-agent 中的条件性 change stage

`runAfterAgent` 在执行 change stage 前有一个 `if (!purpose) return;` 检查。这意味着如果 stdin 中没有 Furina purpose 标记（例如 `markEndPropose` MCP 工具触发时可能没有 purpose），handler 会完成初始化、切换和输出写入，但跳过 change stage 通知。这种设计允许 handler 在不同触发场景下灵活适配。

## Dependencies

### Depends on

- **`parseStdin`**（spec-hooks-runner-main）：两个 handler 都接收由 `parseStdin` 解析的 `parsed` 对象作为参数。
- **`validateBeforeAgent`**（spec-hooks-runner-utilities）：`runBeforeAgent` 使用此函数进行输入验证。
- **`buildInitCommand`**（spec-hooks-runner-utilities）：两个 handler 都使用此函数构建初始化命令。
- **`buildBeforeAgentCommand`**（spec-hooks-runner-utilities）：`runBeforeAgent` 使用此函数构建阶段切换命令。
- **`buildWorkflowCommand`**（spec-hooks-runner-utilities）：`runAfterAgent` 使用此函数构建 workflow 切换命令。
- **`executeCommand`**（spec-hooks-runner-utilities）：两个 handler 都使用此函数执行 CLI 命令。
- **`writeLog`**（spec-hooks-runner-utilities）：两个 handler 都使用此函数记录执行日志。
- **`extractToolInput`**（spec-hooks-runner-utilities）：两个 handler 都使用此函数提取工具输入。
- **`extractToolResponse`**（spec-hooks-runner-utilities）：`runAfterAgent` 使用此函数提取工具输出。
- **`writePromptFile`**（spec-hooks-runner-utilities）：`runBeforeAgent` 使用此函数持久化 prompt。
- **`writeOutputFile`**（spec-hooks-runner-utilities）：`runAfterAgent` 使用此函数持久化 toolResponse。
- **furina CLI**：`furina agents init`、`furina agents switch`、`furina change stage` 命令。

### Depended by

- **`main()`**（spec-hooks-runner-main）：主入口函数根据 `--before-agent` / `--after-agent` 命令行标志分发调用。
- **hooks.json**（spec-hooks-config）：通过 PreToolUse/PostToolUse Agent 匹配器触发 `--before-agent` / `--after-agent`。
- **Furina 工作流引擎**：依赖 change stage 的 `in_progress`/`done` 状态来追踪工作流进度。

## Usage Examples

### 完整的 Agent 生命周期示例

以下示例展示了从 Agent 子代理启动到完成的完整生命周期，包括 `runBeforeAgent` 和 `runAfterAgent` 的协调工作：

```javascript
// === 阶段 1: Agent 子代理启动（PreToolUse 事件触发） ===

// Claude Code stdin 输入：
const beforeStdin = JSON.stringify({
  session_id: "sess-001",
  cwd: "/home/user/myproject",
  tool_input: {
    prompt: "Explore the authentication module and document the API endpoints",
    description: "Explore authentication module"
  },
  tool_use_id: "use-abc-123",
  "Furina: explore:Purpose": ""
});

// main() 解析并调用 runBeforeAgent：
// parseStdin(beforeStdin) => { sessionId: "sess-001", cwd: "/home/user/myproject" }

// 执行的命令序列：
// 1. furina agents init --session sess-001 --cwd /home/user/myproject
// 2. furina agents switch explore --session sess-001
// 3. 写入文件：~/.furina/sessions/sess-001/use-abc-123.txt
//    内容："Explore the authentication module and document the API endpoints"
// 4. furina change stage explore --session sess-001 --status in_progress
//      --title "Explore authentication module"
//      --input "~/.furina/sessions/sess-001/use-abc-123.txt"


// === 阶段 2: Agent 子代理完成（PostToolUse 事件触发） ===

// Claude Code stdin 输入：
const afterStdin = JSON.stringify({
  session_id: "sess-001",
  cwd: "/home/user/myproject",
  tool_input: {
    prompt: "Explore the authentication module and document the API endpoints",
    description: "Explore authentication module"
  },
  tool_use_id: "use-abc-123",
  tool_response: {
    summary: "Found 3 API endpoints",
    endpoints: ["/auth/login", "/auth/register", "/auth/refresh"]
  },
  "Furina: explore:Purpose": ""
});

// main() 解析并调用 runAfterAgent：
// parseStdin(afterStdin) => { sessionId: "sess-001", cwd: "/home/user/myproject" }

// 执行的命令序列：
// 1. furina agents init --session sess-001 --cwd /home/user/myproject
// 2. furina agents switch workflow --session sess-001
// 3. 写入文件：~/.furina/sessions/sess-001/use-abc-123.json
//    内容：{"summary":"Found 3 API endpoints","endpoints":["/auth/login","/auth/register","/auth/refresh"]}
// 4. furina change stage explore --session sess-001 --status done
//      --title "Explore authentication module"
//      --output "~/.furina/sessions/sess-001/use-abc-123.json"
```

Explanation: 此示例展示了 agent 生命周期的完整闭环。`runBeforeAgent` 启动阶段时将 provider 切换到 explore 配置、记录输入并标记 in_progress；`runAfterAgent` 完成阶段时切回 workflow provider、记录输出并标记 done。两个 handler 通过相同的 `sessionId` 和 `toolUseId` 实现输入（`.txt`）和输出（`.json`）文件的关联。

### integration 阶段的映射处理

```javascript
// 当 purpose 为 integration 时，runBeforeAgent 的特殊处理：
// stdin 中包含 "Furina: integration:Purpose"

// runBeforeAgent 内部逻辑：
// switchPurpose = purpose === 'integration' ? 'coding' : purpose;  => 'coding'
// stagePurpose = purpose;  => 'integration'

// 执行的命令：
// 1. furina agents init --session sess-002 --cwd /home/user/project
// 2. furina agents switch coding --session sess-002    <-- 使用 coding provider
// 3. furina change stage integration --session sess-002 --status in_progress  <-- 但记录 integration
```

Explanation: integration 阶段没有独立的 LLM provider 配置，因此复用 coding 的 provider。但 change 管理系统需要精确记录原始阶段名为 integration，以便工作流引擎正确追踪进度。

### 无 purpose 的 after-agent（markEndPropose 场景）

```javascript
// markEndPropose MCP 工具触发的 after-agent 可能没有 purpose：
const stdinNoPurpose = JSON.stringify({
  session_id: "sess-003",
  cwd: "/home/user/project",
  tool_input: { description: "End propose phase" },
  tool_use_id: "use-def-456"
  // 注意：没有 Furina:*:Purpose 字段
});

// runAfterAgent 执行流程：
// 1. purpose = undefined
// 2. sessionId 和 cwd 校验通过
// 3. furina agents init --session sess-003 --cwd /home/user/project
// 4. furina agents switch workflow --session sess-003
// 5. extractToolResponse 返回 undefined（无 tool_response 字段）
// 6. 无输出文件写入
// 7. purpose 为空，跳过 change stage 通知（直接 return）
```

Explanation: 在 markEndPropose 场景中，after-agent 只需要完成会话初始化和 workflow 切换，不需要记录 change 阶段状态。purpose 的可选性设计使 handler 能够灵活适配这种场景。
