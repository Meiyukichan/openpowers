# Agents Command Module

> Source files:
> - `src/commands/agents.ts` : 1-411

## Overview

Agents 命令模块是 Furina CLI 的核心命令之一，负责管理 AI Agent 的 Provider 配置和会话级别的模型路由。该模块解决的核心问题是：在多 Provider（模型供应商）环境下，用户需要为不同的工作流阶段（workflow、explore、propose、plan、review、coding、finalize）指定不同的模型，并且这些配置需要在会话级别持久化。

**设计动机：**
- Furina 支持多个 AI Provider，每个 Provider 配置了 defaultModel、sonnetModel、opusModel、haikuModel 四种模型
- 不同工作流阶段可能需要不同级别的模型（如 coding 阶段用 sonnet，review 阶段用 opus）
- 需要在会话级别管理这些模型路由映射，同时支持全局 Provider 切换

**使用场景：**
- CLI 用户通过 `furina agents list` 查看所有已配置的 Provider 及其模型
- CLI 用户通过 `furina agents list --session <id>` 查看某个会话的阶段-模型映射
- CLI 用户通过 `furina agents show <stage>` 查看某阶段对应的模型名称
- CLI 用户通过 `furina agents switch <name>` 切换当前 Provider（会话级或全局）
- 工作流引擎在会话初始化时通过 `furina agents init` 创建会话配置文件

**涉及的源文件及职责：**
- `src/commands/agents.ts`：命令注册入口，包含所有子命令（list、show、switch、init）的实现逻辑

## Architecture / Flow

### 命令结构

```
furina agents
  ├── list [--session <id>]          # 列出 Provider 或会话阶段映射
  ├── show <name> --session <id>     # 查看某阶段的模型名称
  ├── switch <name> [--session <id>] # 切换 Provider（会话级/全局）
  └── init --session <id> --cwd <path> [--change <name>] [--prompt <text>]
```

### 数据流

```
1. init 流程:
   CLI 参数 --> 校验 sessionId/cwd --> loadConfig(cwd) 获取 switchProviders
   --> validateSwitchProviders() 校验模型 --> writeSessionSettings() 持久化

2. list 流程:
   loadProviders() --> 格式化表格输出（Name/default/sonnet/opus/haiku 列）

3. show 流程:
   readSessionSettings() --> loadAndValidateSessionSettings() --> resolveModelValue() --> 输出

4. switch 流程:
   会话级: readSessionSettings() --> 设置 currentProvider --> writeSessionSettings()
   全局: loadProviders() --> 按名称/模型名查找 --> setActiveProviderId()
```

## Functionality / Interface Details

### `registerAgentsCommand(program: Command) -> void`

**Source**: `src/commands/agents.ts`:358-410

**Functionality**: 模块的唯一导出入口函数。在 commander.js 的 Command 实例上注册 `agents` 父命令及其四个子命令（list、show、switch、init）。每个子命令的 options 和 action 处理函数在此定义。被 CLI 入口文件 `src/cli/index.ts` 调用，是整个 agents 命令组的注册点。

**Parameters**:
- `program` (`Command`): commander.js 的根 Command 实例，所有子命令注册到此对象上

**Return Value**:
- `void`: 无返回值，副作用是向 program 注册命令

**Core Logic**:
1. 创建 `agents` 父命令，描述为 "Manage AI agents and session model configuration"
2. 注册 `list` 子命令，支持 `--session <id>` option：有 session 参数时调用 `runAgentsListSession`，否则调用 `runAgentsListProviders`
3. 注册 `show <name>` 子命令，`--session` 为 requiredOption：调用 `runAgentsShow`
4. 注册 `switch <name>` 子命令，支持 `--session` 和 `--mark` option：`--mark` 时输出 "Marked" 并返回；有 session 时调用 `runAgentsSwitch`（会话级切换），否则调用 `runAgentsGlobalSwitch`（全局切换）
5. 注册 `init` 子命令，`--session` 和 `--cwd` 为 requiredOption，`--change` 和 `--prompt` 为可选：调用 `runAgentsInit`

**Core Code**:
```typescript
export function registerAgentsCommand(program: Command): void {
  const agentsCmd = program
    .command('agents')
    .description('Manage AI agents and session model configuration');

  agentsCmd
    .command('list')
    .description('List provider models or session stage-model mappings')
    .option('--session <id>', 'Session ID for stage-model table')
    .action((options: { session?: string }) => {
      if (options.session) {
        runAgentsListSession(options.session);
      } else {
        runAgentsListProviders();
      }
    });

  agentsCmd
    .command('switch <name>')
    .description('Switch current provider for a session')
    .option('--session <id>', 'Session ID')
    .option('--mark', 'Mark the switch')
    .action((name: string, options: { session?: string; mark?: boolean }) => {
      if (options.mark) {
        process.stdout.write('Marked\n');
        return;
      }
      if (options.session) {
        runAgentsSwitch(name, options.session);
        return;
      }
      runAgentsGlobalSwitch(name);
    });
  // ... init subcommand registration
}
```
Source: `src/commands/agents.ts`:358-410

**Usage Example**:
```typescript
import { Command } from 'commander';
import { registerAgentsCommand } from '../commands/agents.js';

const program = new Command();
registerAgentsCommand(program);
program.parse(['node', 'cli', 'agents', 'list']);
```
Explanation: 在 CLI 入口中注册 agents 命令并解析命令行参数。

---

### `runAgentsListProviders() -> void`

**Source**: `src/commands/agents.ts`:104-137

**Functionality**: 以表格形式输出所有已配置的 Provider 信息。表格包含五列：Name（Provider 名称）、default（默认模型）、sonnet（sonnet 模型）、opus（opus 模型）、haiku（haiku 模型）。列宽根据数据动态计算，确保对齐。这是 `agents list` 不带 `--session` 参数时的行为。

**Parameters**: 无

**Return Value**:
- `void`: 直接向 stdout 输出格式化表格，向 stderr 输出日志

**Core Logic**:
1. 调用 `loadProviders()` 加载所有 Provider
2. 动态计算每列宽度：取列标题长度和所有数据行中该列值长度的最大值
3. 输出表头（Name / default / sonnet / opus / haiku）
4. 输出分隔线（总宽度 = 所有列宽之和 + 列间距）
5. 遍历 Provider 数组输出每行数据，使用 `padEnd` 对齐

**Core Code**:
```typescript
function runAgentsListProviders(): void {
  const providers = loadProviders();

  const nameWidth = Math.max(4, ...providers.map((p) => p.name.length));
  const defaultWidth = Math.max(7, ...providers.map((p) => p.defaultModel.length));
  const sonnetWidth = Math.max(6, ...providers.map((p) => p.sonnetModel.length));
  const opusWidth = Math.max(4, ...providers.map((p) => p.opusModel.length));
  const haikuWidth = Math.max(5, ...providers.map((p) => p.haikuModel.length));

  // Print header
  const headerName = 'Name'.padEnd(nameWidth);
  const headerDefault = 'default'.padEnd(defaultWidth);
  const headerSonnet = 'sonnet'.padEnd(sonnetWidth);
  const headerOpus = 'opus'.padEnd(opusWidth);
  const headerHaiku = 'haiku'.padEnd(haikuWidth);
  process.stdout.write(`${headerName}  ${headerDefault}  ${headerSonnet}  ${headerOpus}  ${headerHaiku}\n`);

  // Print separator
  const sep = '-'.repeat(nameWidth + defaultWidth + sonnetWidth + opusWidth + haikuWidth + 8);
  process.stdout.write(`${sep}\n`);

  // Print data rows
  for (const provider of providers) {
    // ... padEnd each column and write to stdout
  }
}
```
Source: `src/commands/agents.ts`:104-137

**Usage Example**:
```bash
furina agents list
# 输出示例:
# Name       default                sonnet                 opus                   haiku
# ------------------------------------------------------------------------------------------------
# openai     gpt-4o                 gpt-4o-2024-11-20      o1                     gpt-4o-mini
# anthropic  claude-sonnet-4-20250514  claude-sonnet-4-20250514  claude-opus-4-20250514  claude-haiku-35-20241022
```
Explanation: 输出所有 Provider 的模型配置表格，列宽自动对齐。

---

### `runAgentsListSession(sessionId: string) -> void`

**Source**: `src/commands/agents.ts`:161-195

**Functionality**: 以表格形式输出指定会话的阶段-模型映射。包含 stage 和 model 两列，其中 'default' 值会被解析为活跃 Provider 的 defaultModel。这是 `agents list --session <id>` 的行为。

**Parameters**:
- `sessionId` (`string`): 会话标识符，用于查找会话配置文件

**Return Value**:
- `void`: 直接向 stdout 输出格式化表格

**Core Logic**:
1. 调用 `loadAndValidateSessionSettings(sessionId)` 加载并验证会话配置
2. 如果配置不存在，输出错误到 stderr 并 exit(1)
3. 获取 `settings.switchProviders` 的所有键值对
4. 动态计算 stage 和 model 列宽度，其中 model 值通过 `resolveModelValue()` 解析 'default'
5. 输出表头、分隔线和数据行

**Core Code**:
```typescript
function runAgentsListSession(sessionId: string): void {
  const settings = loadAndValidateSessionSettings(sessionId);
  if (!settings) {
    process.stderr.write(`Session configuration not found for session: ${sessionId}\n`);
    process.exit(1);
  }

  const entries = Object.entries(settings.switchProviders);

  const stageWidth = Math.max(5, ...entries.map(([stage]) => stage.length));
  const modelWidth = Math.max(5, ...entries.map(([, model]) => {
    const resolved = resolveModelValue(model);
    return resolved.length;
  }));

  // Print header, separator, and data rows with resolveModelValue applied...
}
```
Source: `src/commands/agents.ts`:161-195

**Usage Example**:
```bash
furina agents list --session abc123
# 输出示例:
# stage     model
# ----------------------------------
# workflow  claude-sonnet-4-20250514
# explore   claude-sonnet-4-20250514
# propose   claude-sonnet-4-20250514
# plan      claude-opus-4-20250514
# review    claude-opus-4-20250514
# coding    claude-sonnet-4-20250514
# finalize  claude-sonnet-4-20250514
```
Explanation: 输出会话中各工作流阶段映射的模型名称，'default' 值被解析为实际模型名。

---

### `runAgentsShow(name: string, sessionId: string) -> void`

**Source**: `src/commands/agents.ts`:202-234

**Functionality**: 显示指定阶段或 'default' 对应的模型名称。当 name 为 'default' 时，解析为活跃 Provider 的 defaultModel；否则从会话配置中查找对应阶段的模型值并解析。这是 `agents show <name> --session <id>` 的行为。

**Parameters**:
- `name` (`string`): 阶段名称或 'default'。有效阶段值为 VALID_STAGES 中的任一项
- `sessionId` (`string`): 会话标识符

**Return Value**:
- `void`: 向 stdout 输出解析后的模型名称

**Core Logic**:
1. 如果 name === 'default'，获取活跃 Provider 的 defaultModel 并输出，如果没有活跃 Provider 则输出 'default'
2. 调用 `isValidStage(name)` 验证阶段名，无效则 exit(1)
3. 调用 `loadAndValidateSessionSettings(sessionId)` 加载配置
4. 从 `settings.switchProviders[name]` 获取模型值
5. 通过 `resolveModelValue()` 解析后输出

**Core Code**:
```typescript
function runAgentsShow(name: string, sessionId: string): void {
  if (name === 'default') {
    const defaultProvider = getDefaultProvider();
    if (defaultProvider) {
      process.stdout.write(`${defaultProvider.defaultModel}\n`);
    } else {
      process.stdout.write('default\n');
    }
    return;
  }

  if (!isValidStage(name)) {
    process.stderr.write(`Stage name not supported: ${name}\n`);
    process.exit(1);
  }

  const settings = loadAndValidateSessionSettings(sessionId);
  if (!settings) {
    process.stderr.write(`Session configuration not found for session: ${sessionId}\n`);
    process.exit(1);
  }

  const modelValue = settings.switchProviders[name];
  if (modelValue === undefined) {
    process.stderr.write(`Stage name not supported: ${name}\n`);
    process.exit(1);
  }

  const resolved = resolveModelValue(modelValue);
  process.stdout.write(`${resolved}\n`);
}
```
Source: `src/commands/agents.ts`:202-234

**Usage Example**:
```bash
furina agents show coding --session abc123
# 输出: claude-sonnet-4-20250514

furina agents show default
# 输出: claude-sonnet-4-20250514  (活跃 Provider 的 defaultModel)
```
Explanation: 查询某阶段或 'default' 对应的实际模型名称，'default' 会被解析为活跃 Provider 的默认模型。

---

### `runAgentsSwitch(name: string, sessionId: string) -> void`

**Source**: `src/commands/agents.ts`:242-262

**Functionality**: 切换指定会话的当前 Provider。将 `settings.currentProvider` 设置为传入的 name（阶段名或 'default'），然后持久化到会话配置文件。这是 `agents switch <name> --session <id>` 的行为。

**Parameters**:
- `name` (`string`): 要切换到的阶段名或 'default'
- `sessionId` (`string`): 会话标识符

**Return Value**:
- `void`: 向 stdout 输出切换结果，向 stderr 输出日志

**Core Logic**:
1. 验证 name 是否为 'default' 或 VALID_STAGES 中的有效阶段
2. 调用 `loadAndValidateSessionSettings(sessionId)` 加载配置
3. 将 `settings.currentProvider` 设为 name
4. 调用 `writeSessionSettings()` 持久化
5. 输出切换结果和配置文件路径

**Core Code**:
```typescript
function runAgentsSwitch(name: string, sessionId: string): void {
  if (name !== 'default' && !isValidStage(name)) {
    process.stderr.write(`Stage name not supported: ${name}\n`);
    process.exit(1);
  }

  const settings = loadAndValidateSessionSettings(sessionId);
  if (!settings) {
    process.stderr.write('Switch failed, no configuration file\n');
    process.exit(1);
  }

  settings.currentProvider = name;
  writeSessionSettings(sessionId, settings);

  const filePath = getSessionFilePath(sessionId);
  process.stdout.write(`Switched current provider to ${name} for session ${sessionId}\n`);
}
```
Source: `src/commands/agents.ts`:242-262

**Usage Example**:
```bash
furina agents switch plan --session abc123
# 输出: Switched current provider to plan for session abc123
```
Explanation: 将会话 abc123 的当前 Provider 切换为 plan 阶段对应的模型配置。

---

### `runAgentsGlobalSwitch(name: string) -> void`

**Source**: `src/commands/agents.ts`:269-297

**Functionality**: 全局切换活跃 Provider（不需要会话上下文）。支持通过 Provider 名称或模型名称查找 Provider。当 name 为 'default' 时，恢复为配置的默认 Provider。这是 `agents switch <name>` 不带 `--session` 参数时的行为。

**Parameters**:
- `name` (`string`): Provider 名称、模型名称或 'default'

**Return Value**:
- `void`: 向 stdout 输出切换结果

**Core Logic**:
1. 如果 name === 'default'，调用 `getDefaultProvider()` 获取默认 Provider，然后 `setActiveProviderId()` 设置为活跃 Provider
2. 加载所有 Provider，先按 `p.name === name` 精确匹配
3. 若未找到，再调用 `getProviderByModels([name])` 按模型名查找
4. 找到后调用 `setActiveProviderId(found.id)` 设置为全局活跃 Provider
5. 未找到则输出错误并 exit(1)

**Core Code**:
```typescript
function runAgentsGlobalSwitch(name: string): void {
  if (name === 'default') {
    const defaultProvider = getDefaultProvider();
    if (defaultProvider) {
      setActiveProviderId(defaultProvider.id);
      process.stdout.write(`Switched global active provider to: ${defaultProvider.name}\n`);
    } else {
      process.stderr.write('No providers configured\n');
      process.exit(1);
    }
    return;
  }

  const providers = loadProviders();
  let found = providers.find((p) => p.name === name) ?? null;

  if (!found) {
    const byModels = getProviderByModels([name]);
    found = byModels[name] ?? null;
  }

  if (found) {
    setActiveProviderId(found.id);
    process.stdout.write(`Switched global active provider to: ${found.name}\n`);
  } else {
    process.stderr.write(`Provider not found: ${name}\n`);
    process.exit(1);
  }
}
```
Source: `src/commands/agents.ts`:269-297

**Usage Example**:
```bash
# 按 Provider 名称切换
furina agents switch openai
# 输出: Switched global active provider to: openai

# 按模型名称切换
furina agents switch claude-sonnet-4-20250514
# 输出: Switched global active provider to: anthropic

# 恢复默认 Provider
furina agents switch default
# 输出: Switched global active provider to: anthropic
```
Explanation: 全局切换活跃 Provider，支持按 Provider 名称或模型名称查找。按模型名称查找时会搜索所有 Provider 的 defaultModel/sonnetModel/opusModel/haikuModel 字段。

---

### `runAgentsInit(sessionId: string, cwd: string, change?: string, prompt?: string) -> void`

**Source**: `src/commands/agents.ts`:307-351

**Functionality**: 初始化会话配置文件。验证 sessionId 非空、cwd 目录存在，从项目配置加载 switchProviders 并校验模型名称，创建或更新会话设置文件。支持保留已有会话的 currentProvider、change、brainstorm 和 prompt 字段。

**Parameters**:
- `sessionId` (`string`): 会话标识符，不能为空
- `cwd` (`string`): 工作目录路径，必须是已存在的目录
- `change` (`string`, optional): 关联的变更名称
- `prompt` (`string`, optional): 会话的提示文本

**Return Value**:
- `void`: 向 stdout 输出初始化结果和配置文件路径

**Core Logic**:
1. 验证 sessionId 非空且非纯空白
2. 验证 cwd 目录存在（`fs.existsSync`）
3. 调用 `loadConfig(cwd)` 加载合并后的项目配置
4. 从配置中提取 `switchProviders` 字段
5. 调用 `validateSwitchProviders()` 校验所有模型名称是否存在于已配置的 Provider 中
6. 读取已有会话配置（如果存在），保留 `currentProvider`、`change`、`brainstorm`、`prompt` 等字段
7. 创建 SessionSettings 对象，prompt 仅在显式提供或已有值时设置
8. 调用 `writeSessionSettings()` 持久化

**Core Code**:
```typescript
function runAgentsInit(sessionId: string, cwd: string, change?: string, prompt?: string): void {
  if (!sessionId || sessionId.trim() === '') {
    process.stderr.write('Session ID is required and cannot be empty\n');
    process.exit(1);
  }

  if (!fs.existsSync(cwd)) {
    process.stderr.write(`Directory does not exist: ${cwd}\n`);
    process.exit(1);
  }

  const config = loadConfig(cwd);
  const rawSwitchProviders: Record<string, string> = (config as Record<string, unknown>).switchProviders as Record<string, string> || {};
  const validatedSwitchProviders = validateSwitchProviders(rawSwitchProviders);

  const existing = readSessionSettings(sessionId);
  const settings: SessionSettings = {
    sessionId,
    cwd,
    currentProvider: existing?.currentProvider || 'default',
    switchProviders: validatedSwitchProviders,
    change: change || existing?.change || '',
    brainstorm: existing?.brainstorm,
  };

  if (prompt !== undefined) {
    settings.prompt = prompt;
  } else if (existing?.prompt !== undefined) {
    settings.prompt = existing.prompt;
  }

  writeSessionSettings(sessionId, settings);
}
```
Source: `src/commands/agents.ts`:307-351

**Usage Example**:
```bash
furina agents init --session abc123 --cwd /home/user/project --change "feature-x" --prompt "Implement auth"
# 输出: Session initialized successfully: /home/user/.furina/sessions/abc123/settings.json
```
Explanation: 初始化会话 abc123 的配置文件，从项目配置加载 switchProviders 并校验模型名，关联变更名称和提示文本。

---

### `validateSwitchProviders(rawSwitchProviders: Record<string, string>) -> Record<string, string>`

**Source**: `src/commands/agents.ts`:43-65

**Functionality**: 校验阶段-模型映射中所有非 'default' 的模型名称是否存在于已配置的 Provider 中。无效的模型名称会被替换为 'default' 并输出警告日志。这是保证会话配置中模型名称有效性的核心校验函数。

**Parameters**:
- `rawSwitchProviders` (`Record<string, string>`): 原始的阶段名到模型名映射

**Return Value**:
- `Record<string, string>`: 校验后的映射，无效模型已被替换为 'default'

**Core Logic**:
1. 提取所有非 'default' 的模型名称
2. 如果全部是 'default'，直接返回原始映射的浅拷贝
3. 调用 `getProviderByModels(modelNames)` 批量查询模型是否存在于 Provider 中
4. 遍历原始映射，'default' 值保留、找到 Provider 的保留、其余替换为 'default' 并输出警告

**Core Code**:
```typescript
function validateSwitchProviders(rawSwitchProviders: Record<string, string>): Record<string, string> {
  const modelNames = Object.values(rawSwitchProviders).filter((v) => v !== 'default');

  if (modelNames.length === 0) {
    return { ...rawSwitchProviders };
  }

  const providerByModels = getProviderByModels(modelNames);
  const validated: Record<string, string> = {};

  for (const [stage, modelValue] of Object.entries(rawSwitchProviders)) {
    if (modelValue === 'default') {
      validated[stage] = 'default';
    } else if (providerByModels[modelValue] !== null && providerByModels[modelValue] !== undefined) {
      validated[stage] = modelValue;
    } else {
      validated[stage] = 'default';
      logger.warn(`Model '${modelValue}' for stage '${stage}' not found in providers, replaced with 'default'`);
    }
  }

  return validated;
}
```
Source: `src/commands/agents.ts`:43-65

**Usage Example**:
```typescript
const raw = { workflow: 'gpt-4o', coding: 'nonexistent-model', review: 'default' };
const validated = validateSwitchProviders(raw);
// validated = { workflow: 'gpt-4o', coding: 'default', review: 'default' }
// 日志: Model 'nonexistent-model' for stage 'coding' not found in providers, replaced with 'default'
```
Explanation: 校验模型名称有效性，'nonexistent-model' 不存在于任何 Provider 中，被替换为 'default'。

---

### `loadAndValidateSessionSettings(sessionId: string) -> SessionSettings | null`

**Source**: `src/commands/agents.ts`:74-98

**Functionality**: 加载会话配置并执行前置校验（Proxy 是否启用、cwd 目录是否存在），然后从项目配置重新加载 switchProviders 并校验模型名称，最后持久化更新后的配置。这是 show 和 switch 子命令共用的加载-校验流程。

**Parameters**:
- `sessionId` (`string`): 会话标识符

**Return Value**:
- `SessionSettings | null`: 校验后的会话配置，如果配置文件不存在则返回 null

**Core Logic**:
1. 调用 `readSessionSettings(sessionId)` 读取已有配置，不存在则返回 null
2. 检查 `getEnableFurinaProxy()` 是否为 true，否则输出错误并 exit(1)
3. 检查 `settings.cwd` 目录是否存在，否则输出错误并 exit(1)
4. 调用 `loadConfig(settings.cwd)` 加载项目配置
5. 提取 `switchProviders` 并调用 `validateSwitchProviders()` 校验
6. 更新 `settings.switchProviders` 并调用 `writeSessionSettings()` 持久化
7. 返回更新后的 settings

**Core Code**:
```typescript
function loadAndValidateSessionSettings(sessionId: string): ReturnType<typeof readSessionSettings> {
  const settings = readSessionSettings(sessionId);
  if (!settings) return null;

  if (!getEnableFurinaProxy()) {
    process.stderr.write('Proxy is not enabled, this feature is not supported\n');
    process.exit(1);
  }

  if (!fs.existsSync(settings.cwd)) {
    process.stderr.write(`Directory does not exist: ${settings.cwd}\n`);
    process.exit(1);
  }

  const config = loadConfig(settings.cwd);
  const rawSwitchProviders: Record<string, string> = (config as Record<string, unknown>).switchProviders as Record<string, string> || {};

  const validated = validateSwitchProviders(rawSwitchProviders);
  settings.switchProviders = validated;
  writeSessionSettings(sessionId, settings);

  return settings;
}
```
Source: `src/commands/agents.ts`:74-98

**Usage Example**:
```typescript
const settings = loadAndValidateSessionSettings('abc123');
if (settings) {
  console.log(settings.switchProviders); // 校验后的阶段-模型映射
}
```
Explanation: 加载会话配置，校验 Proxy 启用状态和 cwd 目录，重新从项目配置加载并校验 switchProviders，然后持久化。

---

### `resolveModelValue(modelValue: string) -> string`

**Source**: `src/commands/agents.ts`:145-154

**Functionality**: 将模型值中的 'default' 解析为活跃 Provider 的 defaultModel。这是表格输出和 show 命令中将 'default' 映射为实际模型名的核心解析函数。

**Parameters**:
- `modelValue` (`string`): 模型名称或 'default'

**Return Value**:
- `string`: 如果输入是 'default' 且存在活跃 Provider，返回其 defaultModel；否则返回原始值

**Core Logic**:
1. 如果 modelValue === 'default'，调用 `getDefaultProvider()` 获取活跃 Provider
2. 如果存在活跃 Provider，返回其 `defaultModel` 字段
3. 如果不存在活跃 Provider，返回 'default'
4. 如果 modelValue 不是 'default'，直接返回原值

**Core Code**:
```typescript
function resolveModelValue(modelValue: string): string {
  if (modelValue === 'default') {
    const defaultProvider = getDefaultProvider();
    if (defaultProvider) {
      return defaultProvider.defaultModel;
    }
    return 'default';
  }
  return modelValue;
}
```
Source: `src/commands/agents.ts`:145-154

**Usage Example**:
```typescript
resolveModelValue('default');           // => 'claude-sonnet-4-20250514' (活跃 Provider 的 defaultModel)
resolveModelValue('claude-opus-4-20250514'); // => 'claude-opus-4-20250514' (原值返回)
resolveModelValue('default');           // => 'default' (无活跃 Provider 时)
```
Explanation: 将 'default' 哨兵值解析为实际的模型名称，用于表格展示和查询输出。

---

### `isValidStage(name: string) -> boolean`

**Source**: `src/commands/agents.ts`:33-35

**Functionality**: 检查给定的阶段名称是否为系统支持的有效阶段。用于 show 和 switch 命令的输入校验。

**Parameters**:
- `name` (`string`): 要检查的阶段名称

**Return Value**:
- `boolean`: 如果 name 在 VALID_STAGES 数组中则返回 true

**Core Logic**: 直接调用 `VALID_STAGES.includes(name)` 进行数组包含检查。

**Core Code**:
```typescript
const VALID_STAGES = ['workflow', 'explore', 'propose', 'plan', 'review', 'coding', 'finalize'];

function isValidStage(name: string): boolean {
  return VALID_STAGES.includes(name);
}
```
Source: `src/commands/agents.ts`:26, 33-35

**Usage Example**:
```typescript
isValidStage('coding');    // => true
isValidStage('deploy');    // => false
isValidStage('default');   // => false (default 不在 VALID_STAGES 中)
```
Explanation: 校验阶段名是否有效。注意 'default' 不是有效阶段名，它在 switch 命令中作为特殊值单独处理。

## Data Structures

### `VALID_STAGES` (常量)
```typescript
const VALID_STAGES = ['workflow', 'explore', 'propose', 'plan', 'review', 'coding', 'finalize'];
```
- `workflow`: 工作流阶段
- `explore`: 探索阶段
- `propose`: 提案阶段
- `plan`: 计划阶段
- `review`: 审查阶段
- `coding`: 编码阶段
- `finalize`: 完成阶段

这些阶段名对应 Furina 工作流的不同环节，每个阶段可映射到不同的 AI 模型。

### `SessionSettings` (接口，定义于 `src/utils/session.ts`)
```typescript
interface SessionSettings {
  sessionId: string;
  cwd: string;
  currentProvider: string;
  switchProviders: Record<string, string>;
  change?: string;
  brainstorm?: boolean;
  prompt?: string;
}
```
- `sessionId`: 会话唯一标识符
- `cwd`: 会话创建时的工作目录
- `currentProvider`: 当前活跃的 Provider 标识（阶段名或 'default'）
- `switchProviders`: 阶段名到模型名的映射表，模型值可以是具体模型名或 'default'
- `change`: 关联的变更名称（可选）
- `brainstorm`: 是否启用头脑风暴模式（可选）
- `prompt`: 会话的提示文本（可选）

## Error Handling and Edge Cases

### 错误处理策略
该模块采用统一的错误处理模式：将错误信息输出到 `process.stderr`，然后调用 `process.exit(1)` 终止进程。不使用 try-catch，不抛出异常。

### 各类错误场景

| 场景 | 处理方式 |
|------|----------|
| sessionId 为空或纯空白 | stderr 输出错误，exit(1) |
| cwd 目录不存在 | stderr 输出错误，exit(1) |
| Proxy 未启用（`getEnableFurinaProxy()` 返回 false） | stderr 输出错误，exit(1) |
| 会话配置文件不存在 | stderr 输出错误，exit(1) |
| 阶段名不在 VALID_STAGES 中 | stderr 输出 "Stage name not supported"，exit(1) |
| switchProviders 中的模型名在 Provider 中不存在 | logger.warn 输出警告，替换为 'default' |
| 全局 switch 时 Provider 未找到 | stderr 输出错误，exit(1) |
| 全局 switch 时无 Provider 配置 | stderr 输出 "No providers configured"，exit(1) |

### 边界情况
- **switchProviders 为空对象**：`validateSwitchProviders` 直接返回空对象的浅拷贝
- **所有模型值都是 'default'**：跳过 `getProviderByModels` 调用，直接返回映射副本
- **show 命令查询的阶段在 switchProviders 中不存在**：`modelValue === undefined` 时输出 "Stage name not supported" 并 exit(1)
- **init 命令重复调用**：保留已有会话的 `currentProvider`、`change`、`brainstorm`、`prompt` 字段，仅更新 `switchProviders`
- **prompt 参数处理**：仅在显式提供（`prompt !== undefined`）或已有值存在时设置，不会因为未传参而覆盖已有值

## Dependencies

### Depends on（本模块依赖）

| 模块 | 依赖的函数/类型 | 用途 |
|------|----------------|------|
| `src/utils/config.ts` | `loadConfig` | 加载合并后的项目配置（default + 用户覆盖），获取 switchProviders |
| `src/utils/session.ts` | `readSessionSettings`, `writeSessionSettings`, `getSessionFilePath`, `SessionSettings` | 会话配置文件的读写和路径解析 |
| `src/server/providers-store.ts` | `loadProviders`, `getDefaultProvider`, `getProviderByModels`, `getEnableFurinaProxy`, `setActiveProviderId` | Provider 数据的查询和全局活跃 Provider 的切换 |
| `src/utils/logger.ts` | `logger` | 日志输出（warn/info/error） |
| `commander` | `Command` | CLI 命令框架 |
| `fs` | `fs.existsSync` | 文件系统检查 |

### Depended by（依赖本模块的模块）

| 模块 | 说明 |
|------|------|
| `src/cli/index.ts` | CLI 入口文件，调用 `registerAgentsCommand(program)` 注册命令 |

## Usage Examples

### 完整使用场景

```typescript
// 场景 1: 查看所有 Provider
// 命令: furina agents list
// 输出: 格式化的 Provider 表格，包含 Name/default/sonnet/opus/haiku 五列

// 场景 2: 初始化会话
// 命令: furina agents init --session mySession --cwd /home/user/project --change "feat-auth"
// 流程:
//   1. 验证 sessionId 非空
//   2. 验证 /home/user/project 目录存在
//   3. 加载项目配置中的 switchProviders
//   4. 校验所有模型名是否存在于 Provider 中
//   5. 创建 ~/.furina/sessions/mySession/settings.json

// 场景 3: 查看会话的阶段模型映射
// 命令: furina agents list --session mySession
// 输出: stage-model 表格，'default' 值被解析为实际模型名

// 场景 4: 查看某阶段的具体模型
// 命令: furina agents show coding --session mySession
// 输出: claude-sonnet-4-20250514

// 场景 5: 切换会话当前 Provider
// 命令: furina agents switch plan --session mySession
// 效果: settings.currentProvider 设为 'plan'

// 场景 6: 全局切换 Provider（按名称）
// 命令: furina agents switch openai
// 效果: setActiveProviderId(openai 的 id)

// 场景 7: 全局切换 Provider（按模型名）
// 命令: furina agents switch claude-opus-4-20250514
// 效果: 通过 getProviderByModels 查找到 anthropic Provider，setActiveProviderId
```

Explanation: 上述示例覆盖了 agents 命令的所有子命令用法。list 用于查看配置，init 用于初始化会话，show 用于查询单个阶段，switch 用于切换 Provider（会话级或全局）。全局 switch 支持按 Provider 名称或模型名称两种方式查找。
