## Exploration Results

### 1. openpowers_hooks.js 完整实现

文件路径: `marketplace/scripts/openpowers_hooks.js`

#### main() 函数

入口函数，负责:
1. 从 `process.argv` 判断运行模式: `--before-agent` | `--after-agent` | `--init-agent` | `--before-propose`
2. 无模式标志时输出 Usage 并设置 `exitCode = 1`
3. 通过 `fs.readSync(0, buffer)` 同步读取 stdin（65536 字节缓冲区循环读取）
4. 调用 `parseStdin(rawInput)` 解析原始文本
5. 根据模式分派到对应 handler: `runBeforeAgent()` / `runAfterAgent()` / `runInitAgent()` / `runBeforePropose()`

#### parseStdin() 函数

使用**正则表达式**（非 JSON.parse）从原始 stdin 文本中提取字段，避免编码问题、BOM 字符、畸形 JSON 导致的解析失败。

返回结构:
```typescript
{
  sessionId: string | undefined,  // 从 "session_id":"xxx" 提取
  purpose: string | undefined,    // 从 OpenPowers:*:Purpose 提取，自动转小写
  cwd: string | undefined,        // 从 "cwd":"xxx" 提取
  prompt: string | undefined,     // 仅匹配 /openpowers:workflow 前缀
}
```

正则模式:
- `SESSION_ID_PATTERN = /"session_id"\s*:\s*"([a-zA-Z0-9-]+)"/i`
- `PURPOSE_PATTERN = /OpenPowers:\s*([a-zA-Z]+)\s*:Purpose/i`
- `CWD_PATTERN = /"cwd"\s*:\s*"([^"]+)"/i`
- `PROMPT_PATTERN = /"prompt"\s*:\s*"(\/openpowers:workflow[^"]*)"/i`

#### executeCommand() 函数

```typescript
executeCommand(commandArgs: string[], cwd: string, options?: { silent?: boolean })
  => { stdout: string, stderr: string, status: number } | null
```

- 将 `commandArgs` join 为字符串后通过 `execSync` 执行
- 成功时返回 `{ stdout, stderr: '', status: 0 }`
- 失败时（ExecSyncError）返回 `{ stdout, stderr, status }`，非 silent 模式下写 stderr
- 非 ExecSyncError 异常返回 `null`

#### buildInitCommand() 函数

```typescript
buildInitCommand(sessionId, cwd)
  => ['openpowers', 'agents', 'init', '--session', sessionId, '--cwd', cwd]
```

---

### 2. 四种 Hook 模式的处理分支

#### --before-agent（runBeforeAgent）

触发时机: PreToolUse 事件，matcher = "Agent"

流程:
1. `validateBeforeAgent()` 校验 sessionId、purpose、cwd 必填 + cwd 路径存在
2. 写入 3 条 Accepted 日志（session-id、purpose、cwd）
3. 执行 `openpowers agents init --session <id> --cwd <path>`（初始化会话）
4. 执行 `openpowers agents switch <purpose> --session <id>`（切换到目标阶段）

#### --after-agent（runAfterAgent）

触发时机: PostToolUse 事件 matcher = "Agent"，以及 PreToolUse 事件 matcher = "markEndPropose"

流程:
1. 复用 `validateBeforeAgent()` 校验
2. 写入 2 条 Accepted 日志（session-id、cwd）
3. 执行 `openpowers agents init --session <id> --cwd <path>`
4. 执行 `openpowers agents switch workflow --session <id>`（切回 workflow 阶段）

#### --init-agent（runInitAgent）

触发时机: UserPromptSubmit 事件（每次用户提交 prompt）

流程:
1. 校验 prompt 存在且匹配 `/openpowers:workflow` 前缀
2. 校验 sessionId 存在、cwd 非空且路径存在
3. 执行 `openpowers agents init --session <id> --cwd <path>`（silent 模式）
4. 执行 `openpowers agents switch workflow --session <id>`（silent 模式）
5. 不写 Accepted 日志，仅写命令执行日志

#### --before-propose（runBeforePropose）

触发时机: PreToolUse 事件，matcher = "markBeginPropose"

流程:
1. 校验 sessionId、cwd 存在 + cwd 路径存在（不校验 purpose）
2. 写入 3 条 Accepted 日志（session-id、purpose=propose 硬编码、cwd）
3. 执行 `openpowers agents init --session <id> --cwd <path>`
4. 执行 `openpowers agents switch propose --session <id>`

---

### 3. stdin rawInput 的 JSON 格式结构

Claude Code 通过 stdin 传入的 JSON 结构:

```json
{
  "session_id": "abc-123-def",
  "cwd": "/home/user/project",
  "tool_input": {
    "OpenPowers:explore:Purpose": "explore task description"
  },
  "prompt": "/openpowers:workflow optional additional content"
}
```

字段说明:
- `session_id`: Claude Code 会话唯一标识符，格式为 UUID 风格（字母数字和连字符）
- `cwd`: 当前工作目录的绝对路径
- `tool_input`: 工具输入对象，可能包含 `OpenPowers:<stage>:Purpose` 键值对（stage 为 explore/plan/review/coding/finalize 等）
- `prompt`: 仅在 UserPromptSubmit 事件中出现，包含用户输入的命令文本

注意: parseStdin 使用正则而非 JSON.parse，因此即使输入包含 BOM、编码前缀、畸形 JSON 等也能正确提取字段。

---

### 4. 从 rawInput 解析 sessionId 和 cwd 的方式

解析采用**正则左匹配**策略:

```javascript
// sessionId: 匹配第一个 "session_id" : "xxx" 模式
const SESSION_ID_PATTERN = /"session_id"\s*:\s*"([a-zA-Z0-9-]+)"/i;
const sessionMatch = rawInput.match(SESSION_ID_PATTERN);
// sessionId = sessionMatch[1]

// cwd: 匹配第一个 "cwd" : "xxx" 模式
const CWD_PATTERN = /"cwd"\s*:\s*"([^"]+)"/i;
const cwdMatch = rawInput.match(CWD_PATTERN);
// cwd = cwdMatch[1]
```

关键特性:
- 使用 `String.match()` 返回第一个匹配（左匹配），多个同名字段时取第一个
- `\s*` 允许键值之间有任意空白
- `[^"]+` 匹配 cwd 值中除引号外的任意字符（包括中文、特殊符号、路径分隔符）
- 正则大小写不敏感（`/i` 标志）
- 不依赖 JSON.parse，对畸形输入具有容错性

---

### 5. hooks.json 配置映射

文件路径: `marketplace/hooks/hooks.json`

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Agent",                          "hooks": [{ "command": "... --before-agent" }] },
      { "matcher": "markBeginPropose",               "hooks": [{ "command": "... --before-propose" }] },
      { "matcher": "Bash",                           "hooks": [{ "command": "... --before-bash" }] },
      { "matcher": "markEndPropose",                 "hooks": [{ "command": "... --after-agent" }] }
    ],
    "PostToolUse": [
      { "matcher": "Agent",                          "hooks": [{ "command": "... --after-agent" }] }
    ],
    "UserPromptSubmit": [
      {                                             "hooks": [{ "command": "... --init-agent" }] }
    ]
  }
}
```

---

### 6. agents 命令模块（被 hooks 调用的后端）

文件路径: `src/commands/agents.ts`

有效阶段名: `workflow`, `explore`, `propose`, `plan`, `review`, `coding`, `finalize`

- `agents init --session <id> --cwd <path>`: 创建/初始化 session settings 文件，加载 switchProviders 配置，校验模型名
- `agents switch <name> --session <id>`: 切换当前 provider 为指定阶段，更新 session settings 的 currentProvider 字段
