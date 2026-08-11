# Hook Runner Unit Tests (furina_hooks.test.ts)

> Source files:
> - `marketplace/scripts/furina_hooks.test.ts` : 1-2453

## Overview

`spec-hooks-tests` 规范了 `furina_hooks.js` 钩子脚本的完整 Vitest 测试套件。该测试文件对钩子脚本中所有导出函数进行逐一覆盖，验证 stdin 解析的编码弹性、命令构建器的正确性、各生命周期处理器的调用链完整性，以及 main 入口点的模式分发逻辑。

**设计动机**：`furina_hooks.js` 是 Claude Code 插件生命周期的核心拦截脚本，在 PreToolUse/PostToolUse/UserPromptSubmit 事件中运行。由于该脚本运行在 Claude Code 的 hook 机制中，输入数据（stdin）来自 JSON 序列化，可能遇到 BOM 字符、中文路径、emoji、畸形 JSON 等编码问题。测试套件的核心设计原则是：确保 regex-first/JSON-fallback 提取策略在各种极端编码场景下均能正确工作，同时验证所有 handler 的调用链、日志记录和错误处理行为。

**使用场景**：
- 每次修改 `furina_hooks.js` 后运行回归测试，确保现有功能未被破坏
- 新增 handler 或修改现有 handler 时，验证调用序列的正确性
- CI/CD 流水线中作为插件质量门禁

**涉及源文件及职责**：

| 文件 | 职责 |
|------|------|
| `marketplace/scripts/furina_hooks.test.ts` | 测试主文件，覆盖所有导出函数的单元测试和集成测试 |
| `marketplace/scripts/furina_hooks.js` | 被测试的目标脚本，包含钩子生命周期全部处理逻辑 |

## Architecture / Flow

### Mock 策略

测试套件使用 `vi.hoisted()` 在模块加载前声明所有 mock 函数，然后通过 `vi.mock()` 替换 `child_process`、`fs`、`os` 三个核心 Node.js 模块。Mock 策略如下：

```
vi.hoisted() 声明 mock 函数
  |
  +-- execSyncMock    (child_process.execSync)
  +-- existsSyncMock   (fs.existsSync)
  +-- mkdirSyncMock    (fs.mkdirSync)
  +-- appendFileSyncMock (fs.appendFileSync)
  +-- writeFileSyncMock (fs.writeFileSync)
  +-- readFileSyncMock  (fs.readFileSync)
  +-- readSyncMock      (fs.readSync, stdin 读取)
  +-- homedirMock       (os.homedir, 固定返回 '/mock/home')
  |
vi.mock('child_process', ...) 替换为 default 导出
vi.mock('fs', ...)              替换为 default 导出
vi.mock('os', ...)              替换为 default 导出
  |
  v
const hooksModule = await import('./furina_hooks.js')
  → 确保 mock 生效后再加载被测模块
```

**ESM 模块加载时序**：由于 `furina_hooks.js` 使用 ESM 模块（`import` 语法），测试文件通过顶层 `await import()` 在 mock 注册之后才加载被测模块，确保 mock 生效。

**process.argv 管理**：`main()` 测试组在 `beforeEach` 中重置 `process.argv`，在 `afterAll` 中恢复原始值，避免污染其他测试。

### 测试分组结构

```
describe('parseStdin')              → 21 个用例：基本字段提取 + 编码弹性测试
describe('validateBeforeAgent')     → 5 个用例：字段校验逻辑
describe('buildBeforeAgentCommand') → 2 个用例：命令数组构建
describe('buildInitCommand')        → 3 个用例：init 命令含/不含 prompt
describe('buildWorkflowCommand')    → 1 个用例：workflow 切换命令
describe('buildBeforeProposeCommand') → 1 个用例：propose 切换命令
describe('executeCommand')          → 5 个用例：execSync 封装 + 错误处理 + silent 选项
describe('writeLog')                → 4 个用例：日志目录创建 + 写入 + 错误容错
describe('runAfterAgent')           → 8 个用例：after-agent 完整生命周期
describe('runBeforeAgent')          → 11 个用例：before-agent 完整生命周期
describe('runInitAgent')            → 10 个用例：init-agent 模式处理
describe('runBeforePropose')        → 6 个用例：propose 阶段 + brainstorm 设置
describe('extractCommandFromRawInput') → 8 个用例：命令字段 JSON-first/regex-fallback
describe('extractChangeName')       → 5 个用例：change name 提取
describe('runBeforeBash')           → 11 个用例：Bash 命令分发
describe('extractToolResponse')     → 4 个用例：tool_response 提取
describe('writeOutputFile')         → 6 个用例：输出文件写入
describe('runBeforeQuestion')       → 7 个用例：brainstorm 问题捕获
describe('main')                    → 18 个用例：入口点路由 + stdin 读取 + 模式分发
```

## Functionality / Interface Details

### `parseStdin` 测试组 (21 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:94-349

**功能覆盖**：验证 `parseStdin()` 函数从原始 stdin 文本中提取 `sessionId` 和 `cwd` 字段的能力，是整个测试套件中用例最多、覆盖最全面的测试组。

**基本字段提取**（8 用例）：

| 测试场景 | 预期行为 |
|----------|----------|
| 有效 JSON 包含 session_id 和 cwd | 正确提取两个字段 |
| 验证不返回 purpose/prompt 字段 | 返回对象只有 sessionId 和 cwd |
| Purpose 深层嵌套 | 仍然提取顶层 session_id 和 cwd |
| 缺少 session_id | sessionId 为 undefined |
| 缺少 cwd | cwd 为 undefined |
| 无 Furina key | 不包含 purpose 属性 |
| 空字符串输入 | 两个字段均为 undefined |
| 纯空白输入 | 两个字段均为 undefined |

**编码弹性测试**（13 用例）：

核心测试逻辑：`parseStdin` 使用正则表达式提取字段（而非 `JSON.parse`），因此在各种编码异常场景下均应工作。

| 测试场景 | 预期行为 | 关键断言 |
|----------|----------|----------|
| BOM + 畸形 JSON 尾部 | 提取 session_id 和 cwd | `\uFEFF` 前缀不影响匹配 |
| 非 JSON 文本但含带引号字段 | 正确提取 | 完全无 JSON 结构也能工作 |
| 中文路径 `/home/用户/项目/我的代码` | 正确提取 cwd | CWD_PATTERN 的 `[^"]+` 匹配多字节字符 |
| Windows 中文路径 `C:\\Users\\小明\\` | 提取转义后的完整路径 | 正则捕获字面量 JSON 转义 |
| JSON 转义 Unicode `\\u8ba1\\u5212` | cwd 正确提取 | Unicode 序列作为字面量被捕获 |
| BOM + 中文内容 | 正确提取 | BOM 不干扰中文路径提取 |
| 不可打印字符（`\x00\x01` 等） | 正确提取 | 控制字符不干扰正则匹配 |
| Emoji + 特殊 Unicode | 正确提取 | Emoji 作为路径部分被保留 |
| 全角字符（`：` 代替 `:`） | 返回 undefined | 全角冒号不匹配半角模式 |
| 超长输入（10000 字符噪声） | 正确提取 | 嵌入在大量噪声中的字段可被找到 |
| 多个 session_id 字段 | 取第一个匹配 | 正则贪婪左匹配特性 |
| JSON.stringify 兼容性 | 正确提取 | 标准序列化输出正常工作 |
| 带空格的 Windows 路径 | 正确提取 | `C:\\Program Files\\` 路径中空格不影响 |

**Core Code**:
```typescript
// 全角冒号测试 — 验证编码敏感性的关键边界
it('should handle mixed full-width and half-width characters', () => {
  const input = '（全角括号）{"session_id"： "full-001"，"cwd" ： "Ｄ：／ｐｒｏｊｅｃｔ／ｍｙｆｏｌｄｅｒ" Furina：coding：Purpose';

  const result = parseStdin(input);

  // Full-width colon ： won't match the pattern : so session_id/cwd won't extract
  expect(result.sessionId).toBeUndefined();
  expect(result.cwd).toBeUndefined();
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:276-284

**Usage Example**:
```typescript
// 验证 parseStdin 在 BOM 前缀 + 畸形 JSON 下仍能提取字段
const input = '\uFEFF{"session_id":"abc-123","cwd":"/tmp/path","trailing":"junk",more:broken}';
const result = parseStdin(input);
expect(result.sessionId).toBe('abc-123');
expect(result.cwd).toBe('/tmp/path');
```
Explanation: BOM 字符（`\uFEFF`）和尾部畸形 JSON 不影响正则表达式对带引号字段的匹配，验证了 regex-first 策略的编码弹性。

---

### `validateBeforeAgent` 测试组 (5 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:351-409

**功能覆盖**：验证 `validateBeforeAgent()` 的字段校验逻辑，覆盖全部四种校验失败路径和一个成功路径。

| 测试场景 | 预期返回 | 关键断言 |
|----------|----------|----------|
| 全部字段有效且 cwd 存在 | `null` | `toBeNull()` |
| session_id 缺失 | 包含 "session_id" 的错误信息 | `toContain('session_id')` |
| purpose 缺失 | 包含 "purpose" 的错误信息 | `toContain('purpose')` |
| cwd 缺失 | 包含 "cwd" 的错误信息 | `toContain('cwd')` |
| cwd 路径不存在 | 包含 "does not exist" 的错误信息 | 验证 `existsSyncMock` 被调用 |

**Core Code**:
```typescript
it('should return error when cwd path does not exist', () => {
  existsSyncMock.mockReturnValue(false);

  const result = validateBeforeAgent({
    sessionId: 'abc-123',
    cwd: '/nonexistent/path',
  }, 'explore');

  expect(result).toContain('does not exist');
  expect(existsSyncMock).toHaveBeenCalledWith('/nonexistent/path');
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:398-408

---

### `buildBeforeAgentCommand` / `buildInitCommand` / `buildWorkflowCommand` / `buildBeforeProposeCommand` 测试组 (7 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:411-464

**功能覆盖**：验证四个命令构建器函数输出的命令数组结构正确性。

- `buildBeforeAgentCommand`：验证 `['furina', 'agents', 'switch', purpose, '--session', sessionId]` 格式，覆盖不同 purpose 值
- `buildInitCommand`：验证有/无 `--prompt` 参数时的命令数组差异，prompt 参数会被双引号包裹
- `buildWorkflowCommand`：验证 workflow 切换命令的固定格式
- `buildBeforeProposeCommand`：验证 propose 切换命令的固定格式

**Core Code**:
```typescript
it('should include --prompt when prompt is provided', () => {
  const result = buildInitCommand('session-003', '/test/cwd', '/furina:workflow explore');

  expect(result).toEqual([
    'furina', 'agents', 'init',
    '--session', 'session-003',
    '--cwd', '/test/cwd',
    '--prompt', '"/furina:workflow explore"',
  ]);
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:432-441

---

### `executeCommand` 测试组 (5 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:466-537

**功能覆盖**：验证 `executeCommand()` 对 `execSync` 的封装，包括正常执行结果、stdout 末尾换行裁剪、execSync 异常的结构化捕获、非 exec 错误返回 null、以及 silent 选项的 stderr 抑制。

| 测试场景 | 预期行为 |
|----------|----------|
| execSync 正常返回 | 返回 `{ stdout, stderr: '', status: 0 }`，stdout 尾部换行被裁剪 |
| execSync 抛出带 stdout/stderr/status 的错误 | 返回结构化错误结果，向 stderr 输出错误信息 |
| execSync 抛出普通 Error（无 stdout/stderr） | 返回 `null` |
| silent 选项为 true 时不输出 stderr | `process.stderr.write` 未被调用 |

**Core Code**:
```typescript
it('should handle execSync errors and return error result with stderr', () => {
  const execError = Object.assign(new Error('command failed'), {
    stdout: '',
    stderr: 'error output from stderr',
    status: 1,
  });
  execSyncMock.mockImplementation(() => {
    throw execError;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  const result = executeCommand(['furina', 'agents', 'switch', 'workflow', '--session', 'abc'], '/cwd');

  expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Hook command failed'));
  expect(result).toEqual({ stdout: '', stderr: 'error output from stderr', status: 1 });

  stderrSpy.mockRestore();
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:493-510

---

### `writeLog` 测试组 (4 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:539-585

**功能覆盖**：验证 `writeLog()` 的日志目录创建、已有目录跳过、日志文件写入路径和内容、以及 fs 操作异常容错。

| 测试场景 | 验证点 |
|----------|--------|
| 日志目录不存在时 | 调用 `mkdirSync` 创建 `~/.furina/logs/hooks/` |
| 日志目录已存在时 | 不调用 `mkdirSync` |
| 写入日志内容 | 文件路径为 `hooks-{sessionId}.log`，内容包含消息，编码 utf-8 |
| fs 操作抛异常时 | 函数不抛出异常（静默容错） |

---

### `runAfterAgent` 测试组 (8 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:587-768

**功能覆盖**：验证 `runAfterAgent()` handler 的完整生命周期，包括验证失败静默跳过、三步命令序列（init -> switch workflow -> change stage done）、日志写入、purpose 解析、toolResponse 文件写入、以及 integration purpose 映射。

**命令调用序列**（核心验证逻辑）：

```
runAfterAgent(parsed, rawInput)
  |
  +-- [验证] sessionId/cwd 存在且 cwd 路径存在 → 否则静默返回
  |
  +-- writeLog("Accepted hook request --- session-id: ...")
  +-- writeLog("Accepted hook request --- cwd: ...")
  |
  +-- [Step 1] buildInitCommand → executeCommand
  |     命令: furina agents init --session {sid} --cwd {cwd}
  |
  +-- [Step 2] buildWorkflowCommand → executeCommand
  |     命令: furina agents switch workflow --session {sid}
  |
  +-- extractToolInput(rawInput) → { prompt, description, toolUseId }
  +-- extractToolResponse(rawInput) → toolResponse
  |
  +-- [条件] toolResponse && toolUseId → writeOutputFile()
  |
  +-- [条件] purpose 存在 → [Step 3] change stage {purpose} --status done
  |     可选: --title "{description}" --output "{outputPath}"
```

**关键测试断言**：

| 用例 | 验证 |
|------|------|
| 验证失败（session_id 缺失） | 不调用 execSync，不输出 stderr |
| 验证通过 | execSync 被调用 3 次（init, switch, change stage） |
| 日志写入 | 8 条日志（2 accept + 2 init + 2 switch + 2 stage） |
| purpose 缺失 | 只调用 2 次 execSync（无 change stage） |
| toolResponse + toolUseId 完整 | writeFileSync 写入 JSON 到 sessions/{sid}/{tid}.json |
| toolUseId 缺失 | writeFileSync 未被调用 |
| description 缺失 | stage 命令不含 `--title` |
| integration purpose | change stage 使用原始 `integration`，agents switch 仍然切到 `workflow` |

**Core Code**:
```typescript
it('should use original purpose for change stage (not mapped)', () => {
  execSyncMock.mockReturnValue('output');

  runAfterAgent({
    sessionId: 'int-123',
    cwd: '/tmp/test',
  }, 'Furina:integration:Purpose');

  expect(execSyncMock).toHaveBeenCalledTimes(3);
  // agents switch always goes to workflow
  expect(execSyncMock.mock.calls[1][0]).toContain('workflow');
  // change stage uses integration purpose
  expect(execSyncMock.mock.calls[2][0]).toContain('change stage');
  expect(execSyncMock.mock.calls[2][0]).toContain('integration');
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:753-767

---

### `runBeforeAgent` 测试组 (11 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:770-989

**功能覆盖**：验证 `runBeforeAgent()` handler 的完整生命周期，重点覆盖 purpose 解析与映射逻辑（integration -> coding）、JSON-first/regex-fallback 双策略提取 prompt/description/toolUseId、prompt 文件写入、以及 change stage 命令的参数组装。

**命令调用序列**：

```
runBeforeAgent(parsed, rawInput)
  |
  +-- PURPOSE_PATTERN 匹配 → purpose
  +-- validateBeforeAgent(parsed, purpose) → 失败则静默返回
  |
  +-- writeLog × 3 (session-id, purpose, cwd)
  |
  +-- [Step 1] buildInitCommand → executeCommand
  |
  +-- purpose === 'integration' → switchPurpose = 'coding'（仅用于 agents switch）
  |   stagePurpose = purpose（原始值用于 change stage）
  |
  +-- [Step 2] buildBeforeAgentCommand(sid, switchPurpose) → executeCommand
  |
  +-- extractToolInput(rawInput) → { prompt, description, toolUseId }
  |   JSON.parse 优先，失败时 regex 回退
  |
  +-- [条件] prompt && toolUseId → writePromptFile()
  |     inputPath = ~/.furina/sessions/{sid}/{tid}.txt
  |
  +-- [Step 3] change stage {stagePurpose} --status in_progress
  |     可选: --title "{description}" --input "{inputPath}"
```

**integration -> coding 映射**：`runBeforeAgent` 的关键设计点。当 purpose 为 `integration` 时，`agents switch` 命令使用 `coding`（因为 agents switch 不识别 integration），而 `change stage` 命令使用原始的 `integration`（因为 change stage 需要记录真实阶段名）。

**Core Code**:
```typescript
it('should map purpose=integration to coding for agents switch but use integration for change stage', () => {
  execSyncMock.mockReturnValue('output');

  runBeforeAgent({
    sessionId: 'int-123',
    cwd: '/valid/path',
  }, 'Furina:integration:Purpose');

  expect(execSyncMock).toHaveBeenCalledTimes(3);
  // agents switch uses coding
  expect(execSyncMock.mock.calls[1][0]).toContain('agents switch');
  expect(execSyncMock.mock.calls[1][0]).toContain('coding');
  expect(execSyncMock.mock.calls[1][0]).not.toContain('integration');
  // change stage uses integration
  expect(execSyncMock.mock.calls[2][0]).toContain('change stage');
  expect(execSyncMock.mock.calls[2][0]).toContain('integration');
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:835-851

**JSON-first / regex-fallback 测试**：

```typescript
it('should fallback to regex when JSON.parse fails for prompt/description/tool_use_id', () => {
  execSyncMock.mockReturnValue('output');
  homedirMock.mockReturnValue('/mock/home');
  const rawInput = '{"session_id":"regex-test","cwd":"/valid/path","tool_use_id":"tid-456","tool_input":{"prompt":"regex prompt","description":"regex desc"Furina:explore:Purpose}';

  runBeforeAgent({
    sessionId: 'regex-test',
    cwd: '/valid/path',
  }, rawInput);

  const expectedPath = path.join('/mock/home', '.furina', 'sessions', 'regex-test', 'tid-456.txt');
  expect(writeFileSyncMock).toHaveBeenCalledWith(expectedPath, 'regex prompt', 'utf-8');
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:883-897

---

### `runInitAgent` 测试组 (10 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:991-1165

**功能覆盖**：验证 `runInitAgent()` handler（UserPromptSubmit 事件触发）的条件过滤和命令执行。该 handler 仅在 prompt 匹配 `/furina:workflow` 前缀时才执行。

**前置条件过滤链**：

```
runInitAgent(parsed, rawInput)
  |
  +-- PROMPT_PATTERN 匹配 → prompt（仅匹配 /furina:workflow 前缀）
  +-- prompt 不存在 → 静默返回
  +-- sessionId 缺失 → 静默返回
  +-- cwd 为空或 undefined → 静默返回
  +-- cwd 路径不存在 → 静默返回
  |
  [全部通过后执行]
  +-- buildInitCommand(sid, cwd, prompt) + {silent: true} → executeCommand
  +-- buildWorkflowCommand(sid) + {silent: true} → executeCommand
```

**关键测试场景**：

| 用例 | 验证 |
|------|------|
| rawInput 无 prompt | 不调用 execSync |
| session_id 缺失 | 不调用 execSync |
| cwd 为 undefined | 不调用 execSync |
| cwd 为空字符串 | 不调用 execSync |
| cwd 路径不存在 | 不调用 execSync |
| 所有条件满足 | execSync 调用 2 次（init + workflow switch） |
| prompt 含额外内容 | init 命令包含 `--prompt` 和完整 prompt 文本 |
| prompt 不匹配 `/furina:workflow` | 不调用 execSync（即使 prompt 字段存在） |
| execSync 失败 | 不写入 stderr（因为 silent: true） |
| 日志写入 | 4 条日志（init 命令/结果 + switch 命令/结果） |

**Core Code**:
```typescript
it('should execute furina agents init with session and cwd when all conditions are met', () => {
  execSyncMock.mockReturnValue('init successful');

  runInitAgent({
    sessionId: 'session-abc',
    cwd: '/valid/project/path',
  }, '{"prompt":"/furina:workflow","session_id":"session-abc"}');

  expect(execSyncMock).toHaveBeenCalledTimes(2);
  const initCallArg = execSyncMock.mock.calls[0][0];
  expect(initCallArg).toContain('furina');
  expect(initCallArg).toContain('agents init');
  expect(initCallArg).toContain('--session');
  expect(initCallArg).toContain('session-abc');
  expect(initCallArg).toContain('--cwd');
  expect(initCallArg).toContain('/valid/project/path');
  const switchCallArg = execSyncMock.mock.calls[1][0];
  expect(switchCallArg).toContain('furina');
  expect(switchCallArg).toContain('agents switch');
  expect(switchCallArg).toContain('workflow');
  expect(switchCallArg).toContain('--session');
  expect(switchCallArg).toContain('session-abc');
  expect(stderrSpy).not.toHaveBeenCalled();
  expect(process.exitCode).toBeUndefined();
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:1063-1099

---

### `runBeforePropose` 测试组 (6 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:1167-1343

**功能覆盖**：验证 `runBeforePropose()` handler 的 propose 阶段处理，重点覆盖 brainstorm 标志管理（settings.json 读写）和三步命令序列。

**命令调用序列**：

```
runBeforePropose(parsed)
  |
  +-- [验证] sessionId 存在
  +-- [验证] cwd 存在且路径存在
  |
  +-- writeLog × 3 (session-id, purpose: propose, cwd)
  |
  +-- [Step 1] buildInitCommand → executeCommand
  +-- [Step 2] buildBeforeProposeCommand → executeCommand
  |
  +-- 读取 settings.json → 解析 JSON → 设置 brainstorm: true → 写回
  |
  +-- [Step 3] change stage brainstorm --status in_progress
```

**Brainstorm 设置管理**：

`runBeforePropose` 的独特功能是在 `~/.furina/sessions/{sid}/settings.json` 中设置 `brainstorm: true`，标记会话进入头脑风暴模式。测试验证：

1. `settings.json` 被读取后解析为 JSON
2. 添加 `brainstorm: true` 字段
3. 所有原有字段被保留（sessionId, cwd, currentProvider, switchProviders, change, prompt 等）
4. 写回的 JSON 格式正确

**Core Code**:
```typescript
it('should preserve existing settings fields when enabling brainstorm', () => {
  execSyncMock.mockReturnValue('output');
  readFileSyncMock.mockReturnValue(JSON.stringify({
    sessionId: 'prop-preserve',
    cwd: '/valid/path',
    currentProvider: 'default',
    switchProviders: { explore: 'claude' },
    change: 'my-change',
    prompt: '/furina:workflow explore',
  }));

  runBeforePropose({
    sessionId: 'prop-preserve',
    purpose: undefined,
    cwd: '/valid/path',
    prompt: undefined,
  });

  const writeFileCalls = writeFileSyncMock.mock.calls.filter(
    (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('settings.json'),
  );
  const settingsWritten = JSON.parse(writeFileCalls[writeFileCalls.length - 1][1] as string);
  expect(settingsWritten.brainstorm).toBe(true);
  expect(settingsWritten.change).toBe('my-change');
  expect(settingsWritten.prompt).toBe('/furina:workflow explore');
  expect(settingsWritten.switchProviders).toEqual({ explore: 'claude' });
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:1263-1289

---

### `extractCommandFromRawInput` 测试组 (8 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:1345-1400

**功能覆盖**：验证 `extractCommandFromRawInput()` 的 JSON-first/regex-fallback 双策略提取 Bash 工具的 command 字段。

**双策略逻辑**：
1. 先尝试 `JSON.parse` → 提取 `data.tool_input?.command`
2. JSON 解析失败或 `tool_input.command` 缺失 → 使用 `COMMAND_PATTERN` 正则回退

| 测试场景 | 预期行为 |
|----------|----------|
| 标准 JSON 格式 | JSON.parse 正确解码转义字符 |
| 含多行内容（`\n`） | JSON.parse 将 `\n` 解码为实际换行 |
| command 字段不存在 | 返回 undefined |
| 空输入 | 返回 undefined |
| 非 furina 命令 | 仍然正确提取（如 `ls -la`） |
| description 在 command 前面 | JSON.parse 处理任意 key 顺序 |
| JSON.parse 失败时 | 正则回退提取 |
| JSON 成功但 tool_input.command 缺失 | 正则回退到其他 tool_input 下的 command |

**Core Code**:
```typescript
it('should extract command via JSON.parse when description comes before command in tool_input', () => {
  // Regex COMMAND_PATTERN requires "command" before "description",
  // but JSON.parse handles any key order
  const rawInput = '{"tool_name":"Bash","tool_input":{"description":"run command","command":"furina change new my-feature"}}';
  const result = extractCommandFromRawInput(rawInput);
  expect(result).toBe('furina change new my-feature');
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:1377-1383

---

### `extractChangeName` 测试组 (5 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:1402-1427

**功能覆盖**：验证 `extractChangeName()` 从 `furina change new` 命令中提取 kebab-case 变更名称的能力。

| 测试场景 | 预期返回 |
|----------|----------|
| 标准 change new 命令 | `'my-feature'` |
| 含额外 flags | `'my-feature'` |
| 非 change new 命令 | `null` |
| 非 furina 命令 | `null` |
| kebab-case 长名称 | `'my-cool-feature'` |

---

### `runBeforeBash` 测试组 (11 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:1429-1646

**功能覆盖**：验证 `runBeforeBash()` handler 的 Bash 工具命令拦截和 if-else 分发链。

**分发逻辑**：

```
runBeforeBash(parsed, rawInput)
  |
  +-- sessionId 缺失 → 静默返回
  +-- cwd 缺失 → 静默返回
  +-- cwd 路径不存在 → 静默返回
  +-- extractCommandFromRawInput(rawInput) → rawCommand
  +-- rawCommand 为空 → 静默返回
  +-- rawCommand 不含 'furina' → 静默返回
  |
  +-- if-else 分发链:
      |
      +-- 'furina change new' → extractChangeName() → executeChangeNewInit()
      |     命令: furina agents init --session {sid} --cwd {cwd} --change {name}
      |
      +-- 'furina change instruction' && '--proposal' → handleChangeInstructionProposal()
      |     设置 brainstorm: false → change stage propose --status in_progress
      |
      +-- 'furina change archive' → handleChangeArchive()
      |     命令: change stage archive --status in_progress
      |
      +-- 其他 furina 命令 → 静默忽略
```

**关键测试断言**：

| 用例 | 验证 |
|------|------|
| sessionId/cwd 缺失或 cwd 不存在 | 不调用 execSync |
| 无 command 字段 | 不调用 execSync |
| 非 furina 命令 | 不调用 execSync |
| `furina change new` 命令 | agents init 带 `--change` 参数 |
| 日志写入 | 包含 session-id, change-name, 命令内容 |
| execSync 失败 | 不写入 stderr，日志记录错误 |
| `furina change instruction --proposal` | brainstorm 设为 false，调用 change stage propose |
| `furina change instruction --design`（无 --proposal） | 不触发 handler |
| `furina change archive` | 调用 change stage archive |
| 未匹配的 furina 命令（如 `furina agents list`） | 不调用 execSync |

**Core Code**:
```typescript
it('should set brainstorm=false and call change stage propose for change instruction --proposal', () => {
  readFileSyncMock.mockReturnValue(JSON.stringify({
    sessionId: 'prop-test',
    cwd: '/project',
    brainstorm: true,
  }));
  execSyncMock.mockReturnValue('output');

  runBeforeBash({
    sessionId: 'prop-test',
    cwd: '/project',
  }, '{"tool_input":{"command":"furina change instruction my-change --proposal","description":"proposal"}}');

  const settingsWriteCall = writeFileSyncMock.mock.calls.find(
    (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('settings.json'),
  );
  expect(settingsWriteCall).toBeDefined();
  const writtenSettings = JSON.parse(settingsWriteCall[1] as string);
  expect(writtenSettings.brainstorm).toBe(false);

  const stageCall = execSyncMock.mock.calls.find(
    (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('change stage propose'),
  );
  expect(stageCall).toBeDefined();
  expect(stageCall[0]).toContain('--status in_progress');
  expect(stageCall[0]).toContain('--session prop-test');
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:1568-1596

---

### `extractToolResponse` 测试组 (4 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:1648-1697

**功能覆盖**：验证 `extractToolResponse()` 的 JSON-first/regex-fallback 双策略提取 tool_response 对象。

| 测试场景 | 预期行为 |
|----------|----------|
| 有效 JSON | JSON.parse 提取 `data.tool_response` |
| JSON 解析失败（BOM 等） | 正则回退提取 `tool_response` 对象 |
| 无 tool_response 字段 | 返回 undefined |
| 空输入 | 返回 undefined |

---

### `writeOutputFile` 测试组 (6 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:1699-1763

**功能覆盖**：验证 `writeOutputFile()` 将 toolResponse JSON 写入 `~/.furina/sessions/{sid}/{tid}.json` 的行为。

| 测试场景 | 验证 |
|----------|------|
| 正常写入 | 写入路径为 `sessions/{sid}/{tid}.json`，内容为格式化 JSON |
| session 目录不存在 | 调用 mkdirSync 创建目录 |
| toolResponse 为 null | 不调用 writeFileSync |
| toolResponse 为 undefined | 不调用 writeFileSync |
| toolUseId 为空字符串 | 不调用 writeFileSync |
| 文件系统错误 | 不抛出异常（静默容错） |

---

### `runBeforeQuestion` 测试组 (7 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:1765-1969

**功能覆盖**：验证 `runBeforeQuestion()` handler 的 brainstorm 问题捕获功能。该 handler 在 brainstorm 模式开启时，将 AskUserQuestion 工具的问题追加到 `question.json` 文件中。

**处理流程**：

```
runBeforeQuestion(parsed, rawInput)
  |
  +-- sessionId 缺失 → 静默返回
  +-- settings.json 不存在 → 静默返回
  +-- settings.json 解析失败 → 静默返回
  +-- brainstorm !== true → exitCode = 0，静默返回
  |
  [brainstorm 为 true]
  +-- JSON.parse(rawInput) → toolUseId + questions
  |   JSON 失败时 → regex 提取 toolUseId 和 questions 数组
  |
  +-- toolUseId 或 questions 缺失 → 静默返回
  |
  +-- 读取 question.json（已存在则解析，否则初始化空数组）
  +-- push({ tool_use_id: toolUseId, questions })
  +-- 写回 question.json
```

**关键测试场景**：

| 用例 | 验证 |
|------|------|
| brainstorm 为 false | exitCode 设为 0，不写入文件 |
| brainstorm 未设置（undefined） | exitCode 设为 0，不写入文件 |
| brainstorm 为 true + question.json 不存在 | 新建 question.json 包含单条记录 |
| brainstorm 为 true + question.json 已存在 | 追加到现有数组 |
| stdin 有效 JSON | 通过 JSON.parse 解析 questions |
| stdin 畸形 JSON | 通过正则回退提取 |
| sessionId 缺失 | 不读取 settings.json，不写入文件 |

**Core Code**:
```typescript
it('should append to existing question.json array when file already exists', () => {
  const settingsJson = JSON.stringify({ brainstorm: true });
  readFileSyncMock.mockReturnValue(settingsJson);

  const existingQuestions = [{
    tool_use_id: 'call-old',
    questions: [{ question: 'Old Q', header: 'Old', options: [], multiSelect: false }],
  }];
  const existingJson = JSON.stringify(existingQuestions);

  let readCount = 0;
  readFileSyncMock.mockImplementation(() => {
    readCount++;
    if (readCount === 1) return settingsJson;
    if (readCount === 2) return existingJson;
    return '';
  });

  existsSyncMock.mockReturnValue(true);

  const questions = [{
    question: 'New question?',
    header: 'New',
    options: [{ label: 'Yes' }],
    multiSelect: false,
  }];

  runBeforeQuestion({
    sessionId: 'test-session',
    cwd: '/test/path',
  }, makeQuestionStdin('test-session', '/test/path', 'call-new', questions));

  const writtenData = JSON.parse(writeFileSyncMock.mock.calls[0][1]);
  expect(writtenData).toHaveLength(2);
  expect(writtenData[0].tool_use_id).toBe('call-old');
  expect(writtenData[1].tool_use_id).toBe('call-new');
  expect(writtenData[1].questions).toEqual(questions);
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:1861-1899

---

### `main` 测试组 (18 用例)

**Source**: `marketplace/scripts/furina_hooks.test.ts`:1971-2453

**功能覆盖**：验证 `main()` 入口点的模式分发逻辑、stdin 读取、以及各模式的端到端调用链。

**stdin 读取 mock 策略**：

```typescript
function mockStdin(jsonData: string) {
  const data = Buffer.from(jsonData);
  readSyncMock
    .mockImplementationOnce((_fd: number, buffer: Buffer) => {
      data.copy(buffer);
      return data.length;
    })
    .mockReturnValue(0);  // 第二次调用返回 0，终止读取循环
}
```

该 helper 模拟 `fs.readSync` 在 64KB buffer 循环中的行为：第一次调用写入数据并返回字节数，第二次调用返回 0 表示 EOF。

**模式分发验证**：

| 测试场景 | 模式标志 | 预期行为 |
|----------|----------|----------|
| 无模式标志 | - | 输出 Usage 到 stderr，exitCode = 1 |
| `--before-agent` + 有效输入 | before-agent | 执行 init + switch + change stage（3 次 execSync） |
| `--after-agent` + 有效输入 | after-agent | 执行 init + workflow + change stage done（3 次 execSync） |
| `--before-agent` + 缺失 session_id | before-agent | 不调用 execSync |
| `--before-agent` + cwd 不存在 | before-agent | 不调用 execSync |
| `--before-agent` + 成功执行 | before-agent | 验证 9 条日志的完整内容 |
| stdin 读取失败（EBADF） | before-agent | 静默跳过 |
| `--after-agent` + 缺失 session_id | after-agent | 不调用 execSync |
| `--init-agent` + 有效 prompt | init-agent | 执行 init + workflow switch（2 次 execSync） |
| `--init-agent` + 非 workflow prompt | init-agent | 不调用 execSync |
| `--init-agent` + 缺失 session_id | init-agent | 不调用 execSync |
| `--init-agent` + cwd 不存在 | init-agent | 不调用 execSync |
| `--before-propose` + 有效输入 | before-propose | 执行 init + switch + brainstorm stage |
| `--before-bash` + change new | before-bash | 执行 agents init --change |
| `--before-bash` + 非 furina 命令 | before-bash | 不调用 execSync |
| `--before-bash` + 无 command | before-bash | 不调用 execSync |
| `--before-bash` + 不匹配 change new | before-bash | 不调用 execSync |
| `--before-question` + brainstorm true | before-question | 写入 question.json |

**Core Code**:
```typescript
it('should print usage and exit with code 1 when no mode flag is provided', () => {
  process.argv = ['node', '/fake/path/script.js'];

  main();

  expect(stderrSpy).toHaveBeenCalledWith(
    expect.stringContaining('Usage: node furina_hooks.js --before-agent|--after-agent|--init-agent|--before-propose|--before-bash'),
  );
  expect(process.exitCode).toBe(1);
});
```
Source: `marketplace/scripts/furina_hooks.test.ts`:2000-2009

---

## Data Structures

### 测试 Mock 函数集合

```typescript
const execSyncMock: Mock       // 替换 child_process.execSync
const existsSyncMock: Mock     // 替换 fs.existsSync
const mkdirSyncMock: Mock      // 替换 fs.mkdirSync
const appendFileSyncMock: Mock // 替换 fs.appendFileSync
const writeFileSyncMock: Mock  // 替换 fs.writeFileSync
const readFileSyncMock: Mock   // 替换 fs.readFileSync
const readSyncMock: Mock       // 替换 fs.readSync (stdin 读取)
const homedirMock: Mock        // 替换 os.homedir，默认返回 '/mock/home'
```

### 测试 Helper 函数

```typescript
// runBeforeQuestion 测试组专用
function makeQuestionStdin(sessionId: string, cwd: string, tool_use_id: string, questions: unknown[]): string

// main 测试组专用
function mockStdin(jsonData: string): void
```

### process.argv 管理

```typescript
const originalArgv = [...process.argv];  // 保存原始 argv
// beforeEach: process.argv = ['node', '/fake/path/script.js']
// afterAll: process.argv = originalArgv
```

## Error Handling and Edge Cases

### 测试覆盖的错误场景

| 场景 | 处理策略 | 测试验证 |
|------|----------|----------|
| execSync 抛出带 stdout/stderr 的错误 | 返回结构化结果 `{ stdout, stderr, status }` | `executeCommand` 测试组 |
| execSync 抛出普通 Error | 返回 `null` | `executeCommand` 测试组 |
| silent 模式下 execSync 失败 | 不向 process.stderr 输出 | `executeCommand` / `runInitAgent` 测试组 |
| fs 操作异常（Permission denied） | 函数不抛出异常 | `writeLog` / `writeOutputFile` 测试组 |
| stdin 读取失败（EBADF） | `main()` 使用空 input 继续运行 | `main` 测试组 |
| JSON.parse 失败 | regex 回退提取字段 | `parseStdin` / `extractCommandFromRawInput` / `extractToolResponse` / `runBeforeQuestion` |
| settings.json 解析失败 | 静默返回 | `runBeforePropose` / `runBeforeQuestion` |
| question.json 解析失败 | 使用空数组初始化 | `runBeforeQuestion` |

### process.exitCode 管理

测试套件通过 `beforeEach` 重置 `process.exitCode = undefined` 和 `afterAll` 恢复，确保 exitCode 状态不跨用例污染。

## Dependencies

- **Depends on**:
  - `marketplace/scripts/furina_hooks.js`：被测试目标，包含所有导出函数
  - `vitest`：测试框架，提供 `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterAll`
  - `path`（Node.js 内置）：用于构建预期文件路径
  - `child_process`（mock）：`execSync` 被替换为 mock
  - `fs`（mock）：文件系统操作全部被替换为 mock
  - `os`（mock）：`homedir()` 返回固定 mock 路径

- **Depended by**：
  - CI/CD 流水线：作为 `furina_hooks.js` 的回归测试保障
  - 其他 hook 相关 spec 文档：测试用例覆盖的功能点即各 handler spec 的行为约束

## Usage Examples

### 运行全部测试

```bash
npx vitest run marketplace/scripts/furina_hooks.test.ts
```

Explanation: 在项目根目录运行 Vitest，执行 `furina_hooks.test.ts` 中全部测试用例。Vitest 会自动识别 `vi.mock()` 注册的 mock 并加载测试文件。

### 运行特定 describe 组

```bash
npx vitest run marketplace/scripts/furina_hooks.test.ts -t "parseStdin"
npx vitest run marketplace/scripts/furina_hooks.test.ts -t "runBeforeBash"
```

Explanation: 通过 `-t` 参数过滤测试名称，仅运行匹配的 describe/it 块。调试特定功能时常用。

### 查看测试覆盖率

```bash
npx vitest run marketplace/scripts/furina_hooks.test.ts --coverage
```

Explanation: 生成 `furina_hooks.js` 的代码覆盖率报告，包括行覆盖率、分支覆盖率和函数覆盖率。

### 编写新测试用例示例

```typescript
// 在 parseStdin describe 块中添加新的编码弹性测试
it('should handle CJK Unified Ideographs Extension B in path', () => {
  const input = `{"session_id":"ext-b","cwd":"/data/𠀀𠀁"}`;
  const result = parseStdin(input);
  expect(result.sessionId).toBe('ext-b');
  expect(result.cwd).toBe('/data/𠀀𠀁');
});
```

Explanation: 新测试用例应遵循已有模式：使用具体的 mock 配置、构造特定场景的输入、断言预期的输出。Mock 函数通过 `vi.clearAllMocks()` 在 `beforeEach` 中自动重置。
