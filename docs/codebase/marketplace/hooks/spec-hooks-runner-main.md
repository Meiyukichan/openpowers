# Hook Runner Main Entry & Stdin Parsing

> Source files:
> - `marketplace/scripts/furina_hooks.js` : 21-36 (regex pattern constants)
> - `marketplace/scripts/furina_hooks.js` : 47-59 (parseStdin)
> - `marketplace/scripts/furina_hooks.js` : 768-819 (main entry & ESM guard)

## Overview

本 spec 覆盖 `furina_hooks.js` 的三大核心部分：

1. **正则表达式模式常量**（6 个）——定义了整个 hooks 系统中所有字段提取所依赖的 regex 模式，是所有 handler 共享的基础设施。
2. **`parseStdin` 函数**——将 raw stdin 文本通过 regex 提取为结构化的 `{ sessionId, cwd }` 对象，供所有 handler 使用的公共解析入口。
3. **`main()` 函数及 ESM 模块守卫**——整个脚本的执行入口，负责模式标志分发、同步 stdin 读取、解析及条件委派。

### 设计动机

Claude Code 的 hook 机制通过 stdin 向脚本传递 JSON 格式的事件数据。然而在实际运行中，由于编码问题（中文路径、emoji、BOM）、管道传输异常等原因，JSON 可能损坏或无法解析。因此系统采用 **regex-first 提取策略**：先用正则从原始文本中提取关键字段，避免 `JSON.parse` 直接失败导致整个 hook 中断。

`main()` 函数作为统一入口，通过 `process.argv` 中的模式标志（如 `--before-agent`）决定将解析后的数据委派给哪个 handler，实现了单一入口、多路分发的架构。

### 使用场景

- Claude Code 在 PreToolUse/PostToolUse/UserPromptSubmit 事件时调用本脚本
- 通过命令行标志指定 hook 类型（如 `node furina_hooks.js --before-agent`）
- 通过 stdin 管道传入 JSON 事件数据
- `parseStdin` 也被各 handler 内部间接依赖，作为公共解析层

## Architecture / Flow

```
Claude Code Event
       |
       v
main()
  |
  +-- 1. 解析 process.argv -> 确定 mode 标志
  |
  +-- 2. 无有效标志 -> 输出 Usage 信息, exitCode=1
  |
  +-- 3. 同步读取 stdin (64KB buffer 循环, fs.readSync)
  |
  +-- 4. parseStdin(rawInput) -> { sessionId, cwd }
  |       |
  |       +-- SESSION_ID_PATTERN 正则匹配
  |       +-- CWD_PATTERN 正则匹配
  |
  +-- 5. 条件委派 (if-else chain):
        |-- --before-agent   -> runBeforeAgent(parsed, rawInput)
        |-- --after-agent    -> runAfterAgent(parsed, rawInput)
        |-- --init-agent     -> runInitAgent(parsed, rawInput)
        |-- --before-propose -> runBeforePropose(parsed)
        |-- --before-bash    -> runBeforeBash(parsed, rawInput)
        |-- --before-question-> runBeforeQuestion(parsed, rawInput)

ESM Guard:
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
    -> 仅直接执行时调用 main()
```

## Functionality / Interface Details

### 正则表达式模式常量

以下 6 个常量定义在模块顶层，作为所有 handler 共享的提取基础。

#### `SESSION_ID_PATTERN`

**Source**: `marketplace/scripts/furina_hooks.js`:21

```javascript
const SESSION_ID_PATTERN = /"session_id"\s*:\s*"([a-zA-Z0-9-]+)"/i;
```

**功能**: 从原始 stdin 文本中提取 `session_id` 字段值。匹配 JSON 键值对 `"session_id": "..."` 格式，值仅允许字母、数字和连字符。大小写不敏感（`/i` 标志）。

**捕获组**: `match[1]` 为 session ID 字符串。

---

#### `PURPOSE_PATTERN`

**Source**: `marketplace/scripts/furina_hooks.js`:24

```javascript
const PURPOSE_PATTERN = /Furina:\s*([a-zA-Z]+)\s*:Purpose/i;
```

**功能**: 从 stdin 文本中提取 Furina Purpose 阶段标记（如 `Furina: explore :Purpose`）。该模式存在于 tool_input 的 prompt 字段中，用于标识当前 agent 所属的工作流阶段。

**捕获组**: `match[1]` 为阶段名称（如 `explore`、`coding`、`plan`）。

---

#### `CWD_PATTERN`

**Source**: `marketplace/scripts/furina_hooks.js`:27

```javascript
const CWD_PATTERN = /"cwd"\s*:\s*"([^"]+)"/i;
```

**功能**: 从 stdin 文本中提取 `cwd`（当前工作目录）字段。捕获双引号之间的所有内容，兼容中文路径、空格路径等。

**捕获组**: `match[1]` 为工作目录路径字符串。

---

#### `PROMPT_PATTERN`

**Source**: `marketplace/scripts/furina_hooks.js`:30

```javascript
const PROMPT_PATTERN = /"prompt"\s*:\s*"(\/furina:workflow[^"]*)"/i;
```

**功能**: 从 stdin 文本中提取以 `/furina:workflow` 开头的 prompt 字段。仅匹配 workflow 前缀的 prompt，用于 `--init-agent` 模式判断用户是否发起了 workflow 命令。

**捕获组**: `match[1]` 为完整的 prompt 文本。

---

#### `COMMAND_PATTERN`

**Source**: `marketplace/scripts/furina_hooks.js`:33

```javascript
const COMMAND_PATTERN = /"command"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description":/;
```

**功能**: 从 Bash 工具的 stdin 中提取 `command` 字段内容。模式通过要求 `command` 后紧跟 `"description":` 来精确定位，避免误匹配。支持转义字符（`\\.` 匹配 `\"` 等）。

**捕获组**: `match[1]` 为命令字符串。

---

#### `CHANGE_NEW_PATTERN`

**Source**: `marketplace/scripts/furina_hooks.js`:36

```javascript
const CHANGE_NEW_PATTERN = /furina change new\s+(\S+)/;
```

**功能**: 从命令字符串中提取 `furina change new <name>` 的 change 名称部分。

**捕获组**: `match[1]` 为 change 名称（如 `feature-auth`）。

---

### `parseStdin(rawInput: string) -> { sessionId: string|undefined, cwd: string|undefined }`

**Source**: `marketplace/scripts/furina_hooks.js`:47-59

**功能**: 将 raw stdin 文本解析为包含 `sessionId` 和 `cwd` 的结构化对象。这是所有 handler 的公共解析入口，使用 regex-first 策略而非 `JSON.parse`，以确保在 BOM 字符、中文路径、编码错误、畸形 JSON 等场景下的健壮性。只提取所有 handler 共同需要的基础字段（sessionId、cwd），其余字段（如 purpose、prompt）由各 handler 自行按需解析。

**参数**:
- `rawInput` (`string`): 原始 stdin 文本内容，可能包含 BOM、非 ASCII 字符、畸形 JSON 等

**返回值**:
- `{ sessionId: string|undefined, cwd: string|undefined }`: 提取出的 session ID 和工作目录。字段不存在或无法匹配时返回 `undefined`

**核心逻辑**:
1. 先检查 `rawInput` 是否为空或纯空白，若是则直接返回 `{ sessionId: undefined, cwd: undefined }`
2. 分别使用 `SESSION_ID_PATTERN` 和 `CWD_PATTERN` 对 rawInput 进行正则匹配
3. 提取捕获组 `match[1]`，匹配失败则返回 `undefined`

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
Source: `marketplace/scripts/furina_hooks.js`:47-59

**Usage Example**:
```javascript
const rawInput = '{"session_id":"abc-123-def","cwd":"/home/user/project"}';
const parsed = parseStdin(rawInput);
// parsed = { sessionId: "abc-123-def", cwd: "/home/user/project" }

const emptyInput = '';
const emptyParsed = parseStdin(emptyInput);
// emptyParsed = { sessionId: undefined, cwd: undefined }

// BOM + 中文路径场景
const bomInput = '\uFEFF{"session_id":"test-001","cwd":"D:\\\\项目代码\\\\test"}';
const bomParsed = parseStdin(bomInput);
// bomParsed = { sessionId: "test-001", cwd: "D:\\项目代码\\test" }
```
Explanation: `parseStdin` 对正常 JSON、空输入、带 BOM 的中文路径均能正确工作。regex 模式匹配的是 JSON 键值对的文本形式，不受 `JSON.parse` 的严格语法约束。

---

### `main() -> void`

**Source**: `marketplace/scripts/furina_hooks.js`:771-813

**功能**: 脚本的主入口函数。负责三个核心职责：(1) 通过 `process.argv` 解析模式标志确定 hook 类型；(2) 同步读取 stdin 全部数据；(3) 解析输入后条件委派给对应的 handler 函数。该函数是整个 hooks 系统的调度中心。

**参数**: 无（通过 `process.argv` 和 stdin 获取输入）

**返回值**: `void`（副作用：执行对应的 handler 或设置 `process.exitCode`）

**核心逻辑**:

1. **模式标志解析**（772-777）：检查 `process.argv` 是否包含六个已知标志之一。所有标志通过 `Array.includes()` 检测，同一时刻只应有一个有效标志。

2. **无效模式处理**（779-783）：若无任何有效标志匹配，向 stderr 输出 Usage 提示信息并设置 `exitCode = 1`。

3. **同步 stdin 读取**（786-796）：使用 64KB Buffer 循环 + `fs.readSync(fd=0)` 同步读取全部 stdin 数据。`fd=0` 是 stdin 的文件描述符。循环在 `bytesRead === 0`（EOF）时终止。读取失败（如 stdin 未被 pipe）时静默降级为空输入。

4. **输入解析**（798）：调用 `parseStdin(rawInput)` 提取 sessionId 和 cwd。

5. **条件委派**（800-812）：按 if-else 顺序匹配模式标志，调用对应的 handler 函数。注意 `--before-propose` 只传 `parsed`，其余均传 `parsed` 和 `rawInput`。

**Core Code**:
```javascript
export function main() {
  const isBeforeAgent = process.argv.includes('--before-agent');
  const isAfterAgent = process.argv.includes('--after-agent');
  const isInitAgent = process.argv.includes('--init-agent');
  const isBeforePropose = process.argv.includes('--before-propose');
  const isBeforeBash = process.argv.includes('--before-bash');
  const isBeforeQuestion = process.argv.includes('--before-question');

  if (!isBeforeAgent && !isAfterAgent && !isInitAgent && !isBeforePropose && !isBeforeBash && !isBeforeQuestion) {
    process.stderr.write('Usage: node furina_hooks.js --before-agent|--after-agent|--init-agent|--before-propose|--before-bash|--before-question\n');
    process.exitCode = 1;
    return;
  }

  // Read all data from stdin synchronously
  let rawInput = '';
  try {
    const buffer = Buffer.alloc(65536);
    let bytesRead;
    const fd = 0; // stdin file descriptor
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) !== 0) {
      rawInput += buffer.toString('utf-8', 0, bytesRead);
    }
  } catch {
    // stdin may not be piped (e.g. manual invocation), use empty input
  }

  const parsed = parseStdin(rawInput);

  if (isBeforeAgent) {
    runBeforeAgent(parsed, rawInput);
  } else if (isAfterAgent) {
    runAfterAgent(parsed, rawInput);
  } else if (isInitAgent) {
    runInitAgent(parsed, rawInput);
  } else if (isBeforePropose) {
    runBeforePropose(parsed);
  } else if (isBeforeBash) {
    runBeforeBash(parsed, rawInput);
  } else if (isBeforeQuestion) {
    runBeforeQuestion(parsed, rawInput);
  }
}
```
Source: `marketplace/scripts/furina_hooks.js`:771-813

**Usage Example**:
```bash
# Claude Code 在 Agent PreToolUse 事件时调用
echo '{"session_id":"abc-123","cwd":"/home/user/project","tool_input":{"prompt":"Furina: explore :Purpose ..."}}' \
  | node marketplace/scripts/furina_hooks.js --before-agent

# Claude Code 在 UserPromptSubmit 事件时调用
echo '{"session_id":"abc-123","cwd":"/home/user/project","tool_input":{"prompt":"/furina:workflow start"}}' \
  | node marketplace/scripts/furina_hooks.js --init-agent

# 无标志的错误调用
node marketplace/scripts/furina_hooks.js
# stderr: Usage: node furina_hooks.js --before-agent|--after-agent|...
# exitCode: 1
```
Explanation: Claude Code 通过命令行标志指定 hook 类型，通过 stdin 管道传入事件 JSON。`main()` 根据标志分发到对应 handler。

---

### ESM 模块守卫

**Source**: `marketplace/scripts/furina_hooks.js`:815-819

```javascript
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
```

**功能**: 确保 `main()` 仅在脚本被直接执行时调用，而非被 `import` 引入时。这是 ESM 模块下等价于 CommonJS `require.main === module` 的守卫模式。

**核心逻辑**:
1. 使用 `fileURLToPath(import.meta.url)` 将 ESM 的 `file://` URL 转换为文件系统路径
2. 与 `process.argv[1]`（Node.js 实际执行的脚本路径）进行 `path.resolve()` 后比较
3. 仅在两者一致时调用 `main()`

这允许测试文件通过 `import` 引入模块中的各个导出函数（如 `parseStdin`、`runBeforeAgent` 等），而不会触发 `main()` 的副作用执行。

## Data Structures

### `parsed` 对象（parseStdin 返回值）

```typescript
interface ParsedStdin {
  sessionId: string | undefined;  // 通过 SESSION_ID_PATTERN 提取的 session ID
  cwd: string | undefined;        // 通过 CWD_PATTERN 提取的工作目录路径
}
```

- `sessionId`: Claude Code 分配的会话标识符，格式为 UUID（如 `abc-123-def-456`），仅含字母、数字和连字符
- `cwd`: 当前工作目录的绝对路径，可能包含中文、空格等特殊字符

### 模式标志枚举

```
--before-agent    -> PreToolUse: Agent 工具调用前
--after-agent     -> PostToolUse: Agent 工具调用后
--init-agent      -> UserPromptSubmit: 用户提交 prompt 时
--before-propose  -> PreToolUse: MCP propose 工具调用前
--before-bash     -> PreToolUse: Bash 工具调用前
--before-question -> PreToolUse: AskUserQuestion 工具调用前
```

## Error Handling and Edge Cases

### stdin 读取异常

- **stdin 未 pipe**（手动执行时）：`fs.readSync` 抛出异常，被 catch 静默捕获，`rawInput` 保持为空字符串。后续 `parseStdin` 返回 `{ sessionId: undefined, cwd: undefined }`，handler 因缺少必需字段直接 return。
- **超大输入**：64KB buffer 循环读取，无上限限制，理论上支持任意大小的 stdin 输入。
- **EOF 检测**：`bytesRead === 0` 时终止循环，符合 POSIX 标准。

### parseStdin 鲁棒性

- **空输入/null/undefined**：函数开头显式检查，返回全 undefined 对象。
- **BOM 字符**（`\uFEFF`）：正则匹配不受 BOM 影响，因 BOM 出现在 JSON 外部，不影响键值对模式匹配。
- **中文路径/非 ASCII**：`CWD_PATTERN` 使用 `[^"]+` 匹配双引号间的所有内容，自然兼容。
- **畸形 JSON**：regex 不依赖 JSON 语法完整性，只要文本中包含 `"session_id": "xxx"` 格式的子串即可匹配。

### 无效模式标志

- 无任何已知标志时，向 stderr 输出 Usage 信息，设置 `process.exitCode = 1` 后 return。不会抛出异常。

### 委派差异

- `--before-propose` 的 handler 只接收 `parsed` 而不传 `rawInput`，因为它不需要从 stdin 额外提取字段。
- 其余五个 handler 均接收 `parsed` 和 `rawInput` 两个参数。

## Dependencies

- **Depends on**:
  - Node.js 内置模块：`fs`（readSync、existsSync）、`path`、`os`、`url`（fileURLToPath）
  - 本文件内部定义的 handler 函数：`runBeforeAgent`、`runAfterAgent`、`runInitAgent`、`runBeforePropose`、`runBeforeBash`、`runBeforeQuestion`（均在 spec-hooks-runner-agent-lifecycle.md 和 spec-hooks-runner-propose-bash-question.md 中记录）
  - 本文件内部定义的 `parseStdin` 函数

- **Depended by**:
  - Claude Code hook 系统：通过 `hooks.json` 配置在事件发生时调用本脚本（详见 spec-hooks-config.md）
  - 所有 handler 函数：间接依赖 `main()` 作为调用入口，直接依赖 `parseStdin` 和正则常量

## Usage Examples

### 完整执行流程示例

```bash
# 场景 1: Agent 工具调用前（PreToolUse: Agent）
# Claude Code 将 Agent 工具的调用信息通过 stdin 传入
echo '{"session_id":"a1b2c3d4","cwd":"/home/dev/myproject","tool_input":{"prompt":"Furina: explore :Purpose\n请帮我分析代码结构"}}' \
  | node marketplace/scripts/furina_hooks.js --before-agent

# main() 内部流程:
# 1. process.argv.includes('--before-agent') === true
# 2. stdin 读取完整 JSON 字符串
# 3. parseStdin 提取 sessionId="a1b2c3d4", cwd="/home/dev/myproject"
# 4. runBeforeAgent(parsed, rawInput) 被调用
#    - 内部用 PURPOSE_PATTERN 从 rawInput 提取 purpose="explore"
#    - 执行 agents init, agents switch, change stage 等命令
```

```bash
# 场景 2: 用户输入 workflow 命令（UserPromptSubmit）
echo '{"session_id":"test-session-01","cwd":"D:\\\\项目代码","tool_input":{"prompt":"/furina:workflow 开始开发认证模块"}}' \
  | node marketplace/scripts/furina_hooks.js --init-agent

# main() 内部流程:
# 1. isInitAgent === true
# 2. parseStdin 提取 sessionId="test-session-01", cwd="D:\\项目代码"
# 3. runInitAgent(parsed, rawInput) 被调用
#    - 内部用 PROMPT_PATTERN 匹配 "/furina:workflow..." 前缀
#    - 匹配成功，执行 agents init + agents switch workflow
```

```bash
# 场景 3: 模块导入场景（测试）
# parseStdin 等函数可被单独 import 而不触发 main()
import { parseStdin, main } from './furina_hooks.js';
// parseStdin 可用，main() 不会被自动执行（ESM 守卫保护）
```

### parseStdin 编码兼容性示例

```javascript
import { parseStdin } from './furina_hooks.js';

// 标准 JSON
parseStdin('{"session_id":"abc","cwd":"/tmp"}');
// -> { sessionId: "abc", cwd: "/tmp" }

// Windows 路径（反斜杠）
parseStdin('{"session_id":"win-01","cwd":"D:\\\\Users\\\\test\\\\project"}');
// -> { sessionId: "win-01", cwd: "D:\\Users\\test\\project" }

// 中文路径
parseStdin('{"session_id":"cn-01","cwd":"/home/用户/项目代码"}');
// -> { sessionId: "cn-01", cwd: "/home/用户/项目代码" }

// 带 BOM 前缀
parseStdin('\uFEFF{"session_id":"bom-01","cwd":"/tmp"}');
// -> { sessionId: "bom-01", cwd: "/tmp" }

// 畸形 JSON（尾部截断）
parseStdin('{"session_id":"trunc-01","cwd":"/va');
// -> { sessionId: "trunc-01", cwd: undefined }  (CWD_PATTERN 无法匹配不完整的值)

// 空输入
parseStdin('');
// -> { sessionId: undefined, cwd: undefined }
```
Explanation: 展示了 `parseStdin` 在各种边界条件下的行为。regex-first 策略使其在 JSON 不完整或包含特殊字符时仍能提取出部分有效字段。
