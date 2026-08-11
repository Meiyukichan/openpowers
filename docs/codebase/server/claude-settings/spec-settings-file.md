# Claude Settings File 读写与备份恢复

> Source files:
> - `src/server/claude-settings.ts` : 1-182

## Overview

本 spec 文档详细描述 `~/.claude/settings.json` 文件的读写操作、备份恢复机制，以及环境变量配置生成与写入功能。该模块是 Furina 系统中 Claude Code 配置管理的核心底层工具层。

**设计动机**：Furina 需要在运行时动态修改 Claude Code 的 `settings.json` 中的 `env` 字段（例如切换代理模式或直连 Provider 模式），同时需要确保用户的原始配置在修改前被备份，以便后续恢复。该模块将所有文件级操作封装为独立、可测试的函数，避免在业务逻辑（CLI 命令、API 路由）中直接操作文件系统。

**使用场景**：
- `enable` 命令启用代理时，备份原始配置并写入代理环境变量
- `disable` 命令禁用代理时，恢复原始配置或写入 Provider 环境变量
- `recover` 命令直接从备份恢复原始配置
- Provider API 路由在切换活跃 Provider、切换代理开关、删除 Provider 时同步 Claude 配置
- Provider API 路由在重置配置时恢复备份

**涉及源文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/server/claude-settings.ts` | 提供 `settings.json` 的读写、备份恢复、环境变量生成和写入等全部底层工具函数 |

## Architecture / Flow

### 配置同步流程

```
业务层 (CLI 命令 / API 路由)
    │
    ├── enable / PUT /proxy { true }
    │       ├── [首次] backupClaudeSettings()   ← 备份原始配置
    │       ├── getProxyEnv()                   ← 生成代理 env
    │       └── writeEnvToClaudeSettings(env)    ← 写入 env 字段
    │
    ├── disable / PUT /proxy { false }
    │       ├── [有活跃 Provider] getProviderEnv() + writeEnvToClaudeSettings()
    │       └── [无活跃 Provider] restoreClaudeSettings()  ← 恢复备份
    │
    └── recover / POST /reset
            └── restoreClaudeSettings()
```

### 备份/恢复生命周期

```
~/.claude/settings.json  ──backup──>  ~/.furina/settings.bak.json
~/.claude/settings.json  <──restore── ~/.furina/settings.bak.json
```

备份仅在 `neverClaudeSettings` 标志为 `true` 时执行一次（首次写入保护），之后该标志被置为 `false`，后续写入不再重复备份。此设计确保用户原始配置仅被备份一次。

### writeEnvToClaudeSettings 保留策略

```
读取现有 settings.json ──> 合并 env 字段 ──> 写回文件
（非 env 顶层 key 保留不变）
```

## Functionality / Interface Details

### `readClaudeSettings() -> Record<string, unknown>`

**Source**: `src/server/claude-settings.ts`:62-77

**Functionality**: 读取 `~/.claude/settings.json` 并返回解析后的 JSON 对象。该函数是所有配置读取操作的基础入口，被 `writeEnvToClaudeSettings` 内部调用以获取现有配置内容。当文件不存在或 JSON 格式损坏时，不抛出异常，而是返回空对象 `{}`，确保调用方无需处理异常情况。

**Parameters**: 无参数

**Return Value**:
- `Record<string, unknown>`: 解析后的设置对象。正常情况下为完整的 JSON 对象；文件不存在或解析失败时返回 `{}`。
- 文件不存在时返回 `{}`（非异常路径）
- JSON 语法错误（`SyntaxError`）时，记录 warn 日志并返回 `{}`
- 其他 IO 错误时，记录 error 日志并返回 `{}`

**Core Logic**:

首先通过 `fs.existsSync` 检查文件是否存在，不存在则直接返回 `{}`。存在则用 `fs.readFileSync` 以 UTF-8 编码读取文件内容，再用 `JSON.parse` 解析。错误处理分为两类：`SyntaxError`（JSON 格式错误）记录警告日志，其他 IO 错误记录错误日志，两种情况均返回空对象。

**Core Code**:
```typescript
export function readClaudeSettings(): Record<string, unknown> {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      logger.warn(`Invalid JSON in ${CLAUDE_SETTINGS_FILE}, returning empty object`);
    } else {
      logger.error(`Failed to read ${CLAUDE_SETTINGS_FILE}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return {};
  }
}
```
Source: `src/server/claude-settings.ts`:62-77

**Usage Example**:
```typescript
import { readClaudeSettings } from './claude-settings.js';

const settings = readClaudeSettings();
console.log('Current env:', settings.env);
// 输出: Current env: { ANTHROPIC_BASE_URL: 'http://localhost:3939', ... }
// 如果文件不存在: Current env: undefined
```
Explanation: 读取当前 Claude 配置并访问 `env` 字段。文件不存在时 `settings` 为空对象，`settings.env` 为 `undefined`。

---

### `writeClaudeSettings(data: Record<string, unknown>) -> void`

**Source**: `src/server/claude-settings.ts`:84-90

**Functionality**: 将完整的 JSON 对象写入 `~/.claude/settings.json`，使用 2 空格缩进的格式化输出。该函数自动创建不存在的父目录（通过 `fs.mkdirSync` 的 `recursive` 选项），因此在全新安装环境下也能正常工作。这是所有配置写入操作的底层入口。

**Parameters**:
- `data` (`Record<string, unknown>`): 要写入的完整设置对象。该对象将被 `JSON.stringify(data, null, 2)` 序列化后写入文件。

**Return Value**: `void`

**Core Logic**:

先通过 `path.dirname` 获取文件所在目录路径，使用 `fs.existsSync` 检查目录是否存在，不存在则通过 `fs.mkdirSync(dir, { recursive: true })` 递归创建。然后使用 `fs.writeFileSync` 以 UTF-8 编码写入 JSON 字符串（2 空格缩进格式化）。

**Core Code**:
```typescript
export function writeClaudeSettings(data: Record<string, unknown>): void {
  const dir = path.dirname(CLAUDE_SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
```
Source: `src/server/claude-settings.ts`:84-90

**Usage Example**:
```typescript
import { writeClaudeSettings } from './claude-settings.js';

writeClaudeSettings({
  env: { ANTHROPIC_BASE_URL: 'http://localhost:3939' },
  permissions: { allow: ['Read', 'Write'] }
});
// 文件 ~/.claude/settings.json 被写入（目录不存在时自动创建）
```
Explanation: 写入一个包含 `env` 和 `permissions` 的完整配置对象。如果 `~/.claude/` 目录不存在，会自动递归创建。

---

### `backupClaudeSettings() -> void`

**Source**: `src/server/claude-settings.ts`:100-110

**Functionality**: 将 `~/.claude/settings.json` 复制到 `~/.furina/settings.bak.json` 作为备份。这是首次写入保护机制的关键步骤：在 Furina 修改用户的 Claude 配置之前，先备份原始配置，以便后续可以通过 `restoreClaudeSettings` 恢复。如果源文件不存在，仅记录警告日志并静默返回，不抛出异常。

**Parameters**: 无参数

**Return Value**: `void`

**Core Logic**:

首先检查源文件 `CLAUDE_SETTINGS_FILE` 是否存在，不存在则记录警告并返回。然后检查备份目标目录 `~/.furina/` 是否存在，不存在则递归创建。最后使用 `fs.copyFileSync` 将源文件复制到备份路径。

**Core Code**:
```typescript
export function backupClaudeSettings(): void {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) {
    logger.warn(`Cannot backup: ${CLAUDE_SETTINGS_FILE} does not exist`);
    return;
  }
  const bakDir = path.dirname(BACKUP_FILE);
  if (!fs.existsSync(bakDir)) {
    fs.mkdirSync(bakDir, { recursive: true });
  }
  fs.copyFileSync(CLAUDE_SETTINGS_FILE, BACKUP_FILE);
}
```
Source: `src/server/claude-settings.ts`:100-110

**Usage Example**:
```typescript
import { backupClaudeSettings } from './claude-settings.js';

// 在修改 Claude 配置前先备份原始配置
backupClaudeSettings();
// ~/.claude/settings.json 已复制到 ~/.furina/settings.bak.json
```
Explanation: 通常在首次写入 Claude 配置前调用，确保用户的原始配置被安全备份。调用方一般通过 `neverClaudeSettings` 标志控制只备份一次。

---

### `restoreClaudeSettings() -> boolean`

**Source**: `src/server/claude-settings.ts`:117-128

**Functionality**: 将 `~/.furina/settings.bak.json` 复制回 `~/.claude/settings.json`，恢复 Furina 修改前的原始配置。这是备份恢复的逆操作，被 `disable`、`recover` 命令和多个 API 路由调用。返回布尔值指示恢复是否成功，供调用方判断后续逻辑。

**Parameters**: 无参数

**Return Value**:
- `boolean`: `true` 表示恢复成功，`false` 表示备份文件不存在（无法恢复）。
- 备份文件不存在时记录警告日志并返回 `false`

**Core Logic**:

检查备份文件 `BACKUP_FILE` 是否存在，不存在则记录警告并返回 `false`。检查目标目录 `~/.claude/` 是否存在，不存在则递归创建。最后使用 `fs.copyFileSync` 将备份文件复制回原始路径，返回 `true`。

**Core Code**:
```typescript
export function restoreClaudeSettings(): boolean {
  if (!fs.existsSync(BACKUP_FILE)) {
    logger.warn(`Cannot restore: backup file ${BACKUP_FILE} not found`);
    return false;
  }
  const destDir = path.dirname(CLAUDE_SETTINGS_FILE);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(BACKUP_FILE, CLAUDE_SETTINGS_FILE);
  return true;
}
```
Source: `src/server/claude-settings.ts`:117-128

**Usage Example**:
```typescript
import { restoreClaudeSettings } from './claude-settings.js';

const restored = restoreClaudeSettings();
if (restored) {
  console.log('Claude configuration restored successfully');
} else {
  console.log('No backup found. Nothing to restore.');
}
```
Explanation: 尝试恢复原始配置。`recover` 命令和 `disable` 命令（无活跃 Provider 时）使用此模式判断恢复结果并向用户反馈。

---

### `getProxyEnv() -> EnvObject`

**Source**: `src/server/claude-settings.ts`:139-146

**Functionality**: 生成代理模式下的环境变量配置对象。代理模式下，Claude Code 的所有请求将通过 `http://localhost:3939` 本地代理转发，并使用固定认证令牌 `sk-1234`。同时包含遥测抑制标志和 `NO_PROXY` 配置，确保本地通信不走代理。

**Parameters**: 无参数

**Return Value**:
- `EnvObject`（`Record<string, string>`): 包含 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、遥测抑制标志和 `NO_PROXY` 的键值对对象。

**Core Logic**:

返回一个固定配置对象，包含三个部分：1) 代理连接信息（`ANTHROPIC_BASE_URL` 指向本地代理，`ANTHROPIC_AUTH_TOKEN` 使用固定令牌）；2) 展开 `TELEMETRY_SUPPRESSION` 常量中的四个遥测抑制标志；3) `NO_PROXY: 'localhost'` 排除本地流量。

**Core Code**:
```typescript
export function getProxyEnv(): EnvObject {
  return {
    ANTHROPIC_BASE_URL: PROXY_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: PROXY_AUTH_TOKEN,
    ...TELEMETRY_SUPPRESSION,
    NO_PROXY: 'localhost',
  };
}
```
Source: `src/server/claude-settings.ts`:139-146

**Usage Example**:
```typescript
import { getProxyEnv, writeEnvToClaudeSettings } from './claude-settings.js';

const proxyEnv = getProxyEnv();
writeEnvToClaudeSettings(proxyEnv);
// settings.json 的 env 字段被写入:
// { ANTHROPIC_BASE_URL: "http://localhost:3939", ANTHROPIC_AUTH_TOKEN: "sk-1234", ... }
```
Explanation: 获取代理环境变量并写入 Claude 配置。`enable` 命令和代理相关的 API 路由使用此模式。

---

### `getProviderEnv(provider: ProviderEnvInput) -> EnvObject`

**Source**: `src/server/claude-settings.ts`:154-165

**Functionality**: 根据 Provider 配置生成直连模式下的环境变量对象。直连模式下，Claude Code 直接连接 Provider 的 API 端点，使用 Provider 提供的 API Key 和模型配置。未配置的模型字段默认为空字符串，遥测抑制标志和 `NO_PROXY` 配置与代理模式一致。

**Parameters**:
- `provider` (`ProviderEnvInput`): Provider 配置对象，包含以下可选字段：
  - `baseUrl` (`string`, 可选): Provider 的 API 端点 URL
  - `apiKey` (`string`, 可选): Provider 的 API 认证密钥
  - `defaultModel` (`string`, 可选): 默认模型名称
  - `sonnetModel` (`string`, 可选): Sonnet 系列模型名称
  - `opusModel` (`string`, 可选): Opus 系列模型名称
  - `haikuModel` (`string`, 可选): Haiku 系列模型名称

**Return Value**:
- `EnvObject`（`Record<string, string>`): 包含 Provider 连接信息、模型配置、遥测抑制标志和 `NO_PROXY` 的键值对对象。未提供的字段值默认为空字符串 `''`。

**Core Logic**:

将 `ProviderEnvInput` 的各字段映射到对应的 Anthropic 环境变量名。`baseUrl` 映射为 `ANTHROPIC_BASE_URL`，`apiKey` 映射为 `ANTHROPIC_AUTH_TOKEN`，`defaultModel` 映射为 `ANTHROPIC_MODEL`，三个特定模型字段分别映射为 `ANTHROPIC_DEFAULT_HAIKU_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`。所有字段使用空值合并运算符 `??` 提供空字符串默认值。

**Core Code**:
```typescript
export function getProviderEnv(provider: ProviderEnvInput): EnvObject {
  return {
    ANTHROPIC_BASE_URL: provider.baseUrl ?? '',
    ANTHROPIC_AUTH_TOKEN: provider.apiKey ?? '',
    ANTHROPIC_MODEL: provider.defaultModel ?? '',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.haikuModel ?? '',
    ANTHROPIC_DEFAULT_SONNET_MODEL: provider.sonnetModel ?? '',
    ANTHROPIC_DEFAULT_OPUS_MODEL: provider.opusModel ?? '',
    ...TELEMETRY_SUPPRESSION,
    NO_PROXY: 'localhost',
  };
}
```
Source: `src/server/claude-settings.ts`:154-165

**Usage Example**:
```typescript
import { getProviderEnv, writeEnvToClaudeSettings } from './claude-settings.js';

const provider = {
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-xxx',
  defaultModel: 'claude-sonnet-4-20250514',
  sonnetModel: 'claude-sonnet-4-20250514',
  opusModel: 'claude-opus-4-20250514',
};
const env = getProviderEnv(provider);
writeEnvToClaudeSettings(env);
// settings.json 的 env 字段包含 Provider 的连接信息和模型配置
```
Explanation: 根据 Provider 信息生成环境变量并写入 Claude 配置。`disable` 命令（有活跃 Provider 时）和相关 API 路由使用此模式。

---

### `writeEnvToClaudeSettings(env: EnvObject) -> void`

**Source**: `src/server/claude-settings.ts`:177-181

**Functionality**: 读取现有 `~/.claude/settings.json`，仅替换其中的 `env` 字段，然后写回文件。**关键特性**：保留所有非 `env` 的顶层键（如 `permissions`、`hooks` 等），仅覆盖 `env` 键。如果 `settings.json` 不存在，`readClaudeSettings` 返回 `{}`，因此会创建一个仅包含 `env` 键的新文件。这是配置同步的核心组合操作，将读取、合并、写入三步封装为一个原子调用。

**Parameters**:
- `env` (`EnvObject`): 要写入的环境变量配置对象。通常由 `getProxyEnv()` 或 `getProviderEnv()` 生成。

**Return Value**: `void`

**Core Logic**:

调用 `readClaudeSettings()` 获取当前完整配置对象（文件不存在时返回 `{}`），将 `env` 属性直接赋值为传入的 env 对象（覆盖已有值），然后调用 `writeClaudeSettings(settings)` 写回文件。整个过程依赖 JavaScript 对象引用的特性：`settings` 是原始对象的直接引用，赋值 `settings.env = env` 会就地修改该对象。

**Core Code**:
```typescript
export function writeEnvToClaudeSettings(env: EnvObject): void {
  const settings = readClaudeSettings();
  settings.env = env;
  writeClaudeSettings(settings);
}
```
Source: `src/server/claude-settings.ts`:177-181

**Usage Example**:
```typescript
import { writeEnvToClaudeSettings, getProxyEnv } from './claude-settings.js';

// 假设 settings.json 现有内容: { "permissions": { "allow": ["Read"] }, "env": { "OLD": "value" } }
writeEnvToClaudeSettings(getProxyEnv());
// 写入后: { "permissions": { "allow": ["Read"] }, "env": { "ANTHROPIC_BASE_URL": "http://localhost:3939", ... } }
// permissions 键被保留，仅 env 被替换
```
Explanation: 替换 `env` 字段的同时保留其他配置。即使文件不存在也能正常工作（创建新文件）。

## Data Structures

### `EnvObject`
```typescript
export type EnvObject = Record<string, string>;
```
- 键（`string`）: 环境变量名称，如 `ANTHROPIC_BASE_URL`、`DISABLE_TELEMETRY`
- 值（`string`）: 环境变量值，未配置时可为空字符串 `''`

### `ProviderEnvInput`
```typescript
export interface ProviderEnvInput {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
}
```
- `baseUrl` (`string`, 可选): Provider 的 API 端点 URL
- `apiKey` (`string`, 可选): API 认证密钥
- `defaultModel` (`string`, 可选): 默认模型标识符（映射为 `ANTHROPIC_MODEL`）
- `sonnetModel` (`string`, 可选): Sonnet 系列模型标识符
- `opusModel` (`string`, 可选): Opus 系列模型标识符
- `haikuModel` (`string`, 可选): Haiku 系列模型标识符

### 内部常量

| 常量 | 值 | 说明 |
|------|------|------|
| `CLAUDE_SETTINGS_FILE` | `~/.claude/settings.json` | Claude Code 配置文件路径 |
| `BACKUP_FILE` | `~/.furina/settings.bak.json` | 备份文件路径 |
| `PROXY_BASE_URL` | `http://localhost:3939` | 本地代理服务地址 |
| `PROXY_AUTH_TOKEN` | `sk-1234` | 本地代理固定认证令牌 |
| `TELEMETRY_SUPPRESSION` | `{ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_ERROR_REPORTING: '1', DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1', DISABLE_TELEMETRY: '1' }` | 遥测抑制标志集合，代理和直连模式共享 |

## Error Handling and Edge Cases

**读取容错策略**：`readClaudeSettings` 采用防御性编程，文件不存在返回 `{}`，JSON 格式错误返回 `{}`，IO 错误返回 `{}`。所有错误均通过 logger 记录但不向上抛出，确保调用方始终能获得一个有效的对象。

**写入自动创建目录**：`writeClaudeSettings` 和 `backupClaudeSettings` 在写入前检查目标目录是否存在，不存在则递归创建。`restoreClaudeSettings` 同样在恢复前确保目标目录存在。这保证了在全新环境下（`~/.claude/` 或 `~/.furina/` 目录尚不存在时）也能正常工作。

**备份不存在时的恢复**：`restoreClaudeSettings` 在备份文件不存在时返回 `false` 并记录警告，调用方可据此决定后续行为（如向用户提示"无备份可恢复"）。

**备份源文件不存在**：`backupClaudeSettings` 在源文件不存在时记录警告并静默返回，不创建空备份。

**writeEnvToClaudeSettings 的文件不存在场景**：当 `settings.json` 不存在时，`readClaudeSettings` 返回 `{}`，赋值 `env` 后 `writeClaudeSettings` 创建一个仅含 `env` 键的新文件。

**同步调用限制**：所有文件操作（`readFileSync`、`writeFileSync`、`copyFileSync`）均为同步阻塞调用，适合 CLI 命令和短时 API 请求场景，但在高并发 API 场景下可能成为性能瓶颈。

## Dependencies

**Depends on**:
- `fs`（Node.js 内置模块）: 文件系统读写操作
- `os`（Node.js 内置模块）: `os.homedir()` 获取用户主目录
- `path`（Node.js 内置模块）: 路径拼接与解析
- `src/utils/logger.js`: 日志记录（warn、error 级别）

**Depended by**:
- `src/commands/enable.ts`: 调用 `backupClaudeSettings`、`getProxyEnv`、`writeEnvToClaudeSettings` 实现代理启用时的配置同步
- `src/commands/disable.ts`: 调用 `getProviderEnv`、`writeEnvToClaudeSettings`、`restoreClaudeSettings` 实现代理禁用时的配置同步
- `src/commands/recover.ts`: 调用 `restoreClaudeSettings` 实现手动恢复原始配置
- `src/server/routes/providers.ts`: 调用全部 7 个导出函数，在 Provider CRUD API 路由中实现配置自动同步

## Usage Examples

### 完整使用场景：代理模式启用与禁用

```typescript
import {
  backupClaudeSettings,
  getProxyEnv,
  getProviderEnv,
  writeEnvToClaudeSettings,
  restoreClaudeSettings,
} from './claude-settings.js';

// ---- 场景 1: 启用代理模式 ----
// 步骤 1: 首次写入前备份原始配置
backupClaudeSettings();
// ~/.claude/settings.json → ~/.furina/settings.bak.json

// 步骤 2: 写入代理环境变量（保留非 env 的顶层键）
writeEnvToClaudeSettings(getProxyEnv());
// settings.json 的 env 字段变为:
// {
//   ANTHROPIC_BASE_URL: "http://localhost:3939",
//   ANTHROPIC_AUTH_TOKEN: "sk-1234",
//   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
//   DISABLE_ERROR_REPORTING: "1",
//   DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
//   DISABLE_TELEMETRY: "1",
//   NO_PROXY: "localhost"
// }

// ---- 场景 2: 禁用代理（有活跃 Provider）----
const provider = {
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-xxx',
  defaultModel: 'claude-sonnet-4-20250514',
};
writeEnvToClaudeSettings(getProviderEnv(provider));
// settings.json 的 env 字段变为 Provider 的直连配置

// ---- 场景 3: 禁用代理（无活跃 Provider，恢复原始配置）----
const restored = restoreClaudeSettings();
if (restored) {
  console.log('已恢复原始 Claude 配置');
} else {
  console.log('无备份可恢复');
}
```

Explanation: 上述代码展示了三个典型场景的完整流程。场景 1 先备份再写入代理配置；场景 2 切换为直连 Provider 模式；场景 3 在无 Provider 时恢复原始配置。`writeEnvToClaudeSettings` 在所有场景中均保留非 `env` 顶层键。
