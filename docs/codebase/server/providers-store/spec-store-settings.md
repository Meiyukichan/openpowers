# Store Settings Flags

> Source files:
> - `src/server/providers-store.ts` : 349-416

## Overview

Store Settings Flags 是 `providers-store.ts` 中与 provider CRUD 平级的全局配置项管理模块。它将三个与 provider 无直接关联的全局开关/偏好设置与 provider 数据一起存储在 `~/.furina/providers.json` 文件中，复用同一套 `readStoreData()` / `writeStoreData()` 的读写基础设施。

三个设置标志分别为：

- **enableFurinaProxy**：Furina 代理开关，控制 Anthropic API 代理是否拦截并转发请求。
- **neverClaudeSettings**：Claude 设置备份守卫标志，确保首次写入 `~/.claude/settings.json` 前先备份原文件。
- **language**：UI 界面语言偏好，支持 `'chinese'` 或 `'english'`。

这种设计将应用的全局状态集中到单个 JSON 文件，避免分散配置源带来的同步问题。每个标志都遵循 getter/setter 成对设计模式，getter 中使用空值合并运算符（`??`）提供合理的默认值，确保即使 JSON 文件中缺少对应字段也能返回安全的初始状态。

**使用场景**：
- CLI 命令 `furina enable` / `furina disable` 通过 proxy 标志控制代理开关，并通过 neverClaudeSettings 标志管理 Claude 设置备份时机。
- Web UI 前端通过 `/furina/api/providers/proxy` 路由读写 proxy 标志，通过 `/furina/api/config` 路由读写 language 设置。
- Anthropic 代理处理器在每个请求入口检查 proxy 标志，未启用则返回 503。

## Architecture / Flow

三个设置标志的读写流程完全对称，遵循统一的模式：

```
调用者 (CLI commands / API routes / proxy handler)
    |
    v
getter/setter 函数 (providers-store.ts:349-416)
    |
    v
readStoreData() -- 读取 ~/.furina/providers.json + Zod safeParse 验证
    |
    v (setter)
修改 StoreData 对象对应字段
    |
    v
writeStoreData() -- JSON.stringify(indent=2) 写回文件
```

**neverClaudeSettings 的特殊使用模式**（"首次写入备份守卫"）：

```
首次写入 Claude settings 前:
  if (getNeverClaudeSettings() === true):
      backupClaudeSettings()     // 备份 ~/.claude/settings.json
      setNeverClaudeSettings(false)  // 关闭守卫，后续写入不再备份
  writeEnvToClaudeSettings(...)
```

此模式在三个位置被使用：CLI `enable` 命令、`providers` 路由的 `ensureFirstWriteBackup()` 辅助函数、以及 `providers` 路由的 proxy PUT 处理器。

## Functionality / Interface Details

### `getEnableFurinaProxy() -> boolean`

**Source**: `src/server/providers-store.ts`:357-359

**Functionality**: 读取当前 Furina 代理的启用状态。此标志决定了 Anthropic API 代理是否对传入请求进行拦截和转发。当代理处理器 (`proxyRequestHandler`) 收到请求时，首先调用此函数检查代理是否启用，若返回 `false` 则直接返回 HTTP 503 响应。CLI 的 `agents` 命令也依赖此标志判断是否应该启用代理模式的 agent 功能。

**Parameters**: 无。

**Return Value**:
- `boolean`: 当前代理启用状态。当 JSON 文件中该字段为 `null` 或未定义时，返回 `false`（代理默认关闭）。

**Core Logic**:
调用 `readStoreData()` 读取并验证完整的 store 数据，提取 `enableFurinaProxy` 字段。使用空值合并运算符 `??` 处理 `null`/`undefined` 情况，默认返回 `false`。这是一个简单的读取操作，不涉及任何副作用。

**Core Code**:
```typescript
export function getEnableFurinaProxy(): boolean {
  return readStoreData().enableFurinaProxy ?? false;
}
```
Source: `src/server/providers-store.ts`:357-359

**Usage Example**:
```typescript
import { getEnableFurinaProxy } from './providers-store.js';

// 在代理处理器中检查代理是否启用
if (!getEnableFurinaProxy()) {
  res.status(503).json({ error: 'Furina proxy is disabled' });
  return;
}
// 继续处理代理请求...
```
Explanation: 代理处理器在每个请求开始时检查此标志。若代理未启用，返回 503 Service Unavailable，阻止请求转发到上游 provider。

---

### `setEnableFurinaProxy(enabled: boolean) -> void`

**Source**: `src/server/providers-store.ts`:365-370

**Functionality**: 设置 Furina 代理的启用状态。CLI 命令和 Web UI 的 proxy 路由通过此函数切换代理开关。设置后，后续所有到达代理处理器的请求将根据新状态决定是否被转发。

**Parameters**:
- `enabled` (`boolean`): 新的代理启用状态。`true` 启用代理，`false` 禁用代理。

**Return Value**: 无 (`void`)。

**Core Logic**:
读取当前完整的 store 数据对象，修改 `enableFurinaProxy` 字段为传入值，然后通过 `writeStoreData()` 将完整数据写回 JSON 文件。写入后通过 logger 记录状态变更日志。

**Core Code**:
```typescript
export function setEnableFurinaProxy(enabled: boolean): void {
  const data = readStoreData();
  data.enableFurinaProxy = enabled;
  writeStoreData(data);
  logger.info(`Furina proxy ${enabled ? 'enabled' : 'disabled'}`);
}
```
Source: `src/server/providers-store.ts`:365-370

**Usage Example**:
```typescript
import { setEnableFurinaProxy } from './providers-store.js';

// CLI enable 命令：启动代理
setEnableFurinaProxy(true);

// CLI disable 命令：关闭代理
setEnableFurinaProxy(false);
```
Explanation: `furina enable` 命令在启动后端服务后调用 `setEnableFurinaProxy(true)` 开启代理；`furina disable` 命令调用 `setEnableFurinaProxy(false)` 关闭代理。

---

### `getNeverClaudeSettings() -> boolean`

**Source**: `src/server/providers-store.ts`:380-382

**Functionality**: 读取 Claude 设置备份守卫标志。此标志作为"一次性备份守卫"使用：初始值为 `true`，表示 `~/.claude/settings.json` 尚未被 Furina 修改过。当首次需要写入 Claude 设置时，调用者检查此标志，若为 `true` 则先备份原始设置文件，然后将此标志设为 `false` 以阻止后续重复备份。这种设计确保了用户的原始 Claude 配置在 Furina 首次介入时被安全保存。

**Parameters**: 无。

**Return Value**:
- `boolean`: 当前守卫状态。`true` 表示 Claude 设置尚未被 Furina 修改（需要在下次写入前备份）；`false` 表示已经备份过。默认值为 `true`。

**Core Logic**:
调用 `readStoreData()` 读取 store 数据，提取 `neverClaudeSettings` 字段。使用 `??` 运算符处理空值，默认返回 `true`（保守策略：假设未备份过，确保首次写入前一定备份）。

**Core Code**:
```typescript
export function getNeverClaudeSettings(): boolean {
  return readStoreData().neverClaudeSettings ?? true;
}
```
Source: `src/server/providers-store.ts`:380-382

**Usage Example**:
```typescript
import { getNeverClaudeSettings, setNeverClaudeSettings } from './providers-store.js';
import { backupClaudeSettings, writeEnvToClaudeSettings, getProxyEnv } from './claude-settings.js';

// 首次写入 Claude 设置前的备份守卫检查
if (getNeverClaudeSettings()) {
  backupClaudeSettings();          // 备份原始 ~/.claude/settings.json
  setNeverClaudeSettings(false);   // 关闭守卫，后续写入跳过备份
}
writeEnvToClaudeSettings(getProxyEnv());
```
Explanation: 在 `furina enable` 命令中，首次将代理环境变量写入 Claude 设置前，通过此守卫确保原始配置被备份到 `~/.furina/settings.bak.json`。备份完成后立即将守卫设为 `false`，后续的设置写入操作（如切换 provider）不再触发备份。

---

### `setNeverClaudeSettings(value: boolean) -> void`

**Source**: `src/server/providers-store.ts`:388-393

**Functionality**: 设置 Claude 设置备份守卫标志。通常在完成首次备份后调用，将标志从 `true` 改为 `false` 以标记备份已完成。此函数在三个场景中被调用：CLI `enable` 命令、providers 路由的 `ensureFirstWriteBackup()` 辅助函数、以及 proxy PUT 路由处理器。

**Parameters**:
- `value` (`boolean`): 新的守卫状态。正常流程中传入 `false` 表示备份已完成。

**Return Value**: 无 (`void`)。

**Core Logic**:
读取完整 store 数据，修改 `neverClaudeSettings` 字段，写回文件并记录日志。

**Core Code**:
```typescript
export function setNeverClaudeSettings(value: boolean): void {
  const data = readStoreData();
  data.neverClaudeSettings = value;
  writeStoreData(data);
  logger.info(`ClaudeSettings backup guard set to ${value}`);
}
```
Source: `src/server/providers-store.ts`:388-393

**Usage Example**:
```typescript
import { setNeverClaudeSettings } from './providers-store.js';

// 备份完成后关闭守卫
setNeverClaudeSettings(false);
```
Explanation: 将守卫标志设为 `false`，标记 Claude 设置的原始备份已完成。后续任何写入 Claude 设置的操作不会再触发备份流程。

---

### `getLanguage() -> 'chinese' | 'english'`

**Source**: `src/server/providers-store.ts`:403-405

**Functionality**: 读取当前 UI 界面语言偏好设置。Web UI 前端通过 `/furina/api/config` GET 路由获取此值以决定渲染中文还是英文界面。默认语言为 `'chinese'`。

**Parameters**: 无。

**Return Value**:
- `'chinese' | 'english'`: 当前语言设置。当字段为 `null` 或未定义时，返回 `'chinese'`。

**Core Logic**:
读取 store 数据并提取 `language` 字段，使用 `??` 运算符将空值默认为 `'chinese'`。

**Core Code**:
```typescript
export function getLanguage(): 'chinese' | 'english' {
  return readStoreData().language ?? 'chinese';
}
```
Source: `src/server/providers-store.ts`:403-405

**Usage Example**:
```typescript
import { getLanguage } from './providers-store.js';

// Express 路由中返回当前语言设置
configRouter.get('/', (_req, res) => {
  const language = getLanguage();
  res.status(200).json({ language });
});
```
Explanation: Config API 路由的 GET 处理器调用此函数获取当前语言设置，并以 JSON 格式返回给前端。

---

### `setLanguage(value: 'chinese' | 'english') -> void`

**Source**: `src/server/providers-store.ts`:411-416

**Functionality**: 设置 UI 界面语言偏好。Web UI 前端通过 `/furina/api/config` PUT 路由调用此函数切换界面语言。输入值经过 Zod 枚举验证后才传递到此函数，因此不会接收到非法值。

**Parameters**:
- `value` (`'chinese' | 'english'`): 新的语言设置。只能是 `'chinese'` 或 `'english'` 两个字符串字面量之一。

**Return Value**: 无 (`void`)。

**Core Logic**:
读取完整 store 数据，修改 `language` 字段，写回文件并记录日志。类型安全由调用方的 Zod 验证和 TypeScript 枚举类型共同保证。

**Core Code**:
```typescript
export function setLanguage(value: 'chinese' | 'english'): void {
  const data = readStoreData();
  data.language = value;
  writeStoreData(data);
  logger.info(`Language set to ${value}`);
}
```
Source: `src/server/providers-store.ts`:411-416

**Usage Example**:
```typescript
import { setLanguage } from './providers-store.js';

// Express 路由中更新语言设置（调用前已通过 Zod 验证）
configRouter.put('/', (req, res) => {
  const parsed = SetLanguageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }
  setLanguage(parsed.data.language);
  res.status(200).json({ language: parsed.data.language });
});
```
Explanation: Config API 路由的 PUT 处理器先用 Zod schema 验证请求体中的 `language` 字段是否为合法枚举值，验证通过后调用 `setLanguage()` 持久化新的语言偏好。

## Data Structures

### `StoreData`（settings 相关字段）

```typescript
const StoreDataSchema = z.object({
  activeProviderId: z.string().nullable(),
  enableFurinaProxy: z.boolean().nullable().default(false),    // 代理开关，默认关闭
  neverClaudeSettings: z.boolean().nullable().default(true),       // 备份守卫，默认未备份
  language: z.enum(['chinese', 'english']).nullable().default('chinese'),  // UI 语言，默认中文
  providers: z.array(ProviderSchema),
});
```
Source: `src/server/providers-store.ts`:52-58

- `enableFurinaProxy` (`boolean | null`): Furina 代理开关。`true` 表示代理启用，`false` 或 `null` 表示禁用。默认值 `false`。
- `neverClaudeSettings` (`boolean | null`): Claude 设置备份守卫。`true` 表示尚未修改过 Claude 设置（下次写入前需备份），`false` 表示已备份。默认值 `true`。
- `language` (`'chinese' | 'english' | null`): UI 界面语言偏好。默认值 `'chinese'`。

### `DEFAULT_STORE_DATA`（settings 默认值）

```typescript
const DEFAULT_STORE_DATA: StoreData = {
  activeProviderId: null,
  enableFurinaProxy: false,      // 代理默认关闭
  neverClaudeSettings: true,         // 守卫默认启用（未备份状态）
  language: 'chinese',               // 默认中文
  providers: [],
};
```
Source: `src/server/providers-store.ts`:107-113

默认值设计体现了安全保守策略：代理默认关闭（避免意外转发），备份守卫默认启用（确保首次写入前一定备份），语言默认中文。

## Error Handling and Edge Cases

1. **文件不存在或数据损坏**：`readStoreData()` 在文件不存在或 JSON 解析/Zod 验证失败时返回 `DEFAULT_STORE_DATA` 的副本。这意味着所有 getter 函数在异常情况下也能返回安全的默认值，不会抛出异常。

2. **null 值处理**：`StoreDataSchema` 中三个设置字段都声明为 `.nullable()`，getter 函数通过 `??` 运算符将 `null` 映射到安全默认值（`false`、`true`、`'chinese'`）。

3. **并发写入风险**：所有读写操作使用同步文件 I/O（`fs.readFileSync` / `fs.writeFileSync`），Node.js 单线程模型下在同一进程内是安全的。但如果多个进程同时写入同一文件，存在数据覆盖风险。当前设计未引入文件锁机制。

4. **neverClaudeSettings 与 setNeverClaudeSettings 的默认值不一致**：`StoreDataSchema` 中默认值为 `true`，而 `DEFAULT_STORE_DATA` 也显式设置为 `true`，getter 使用 `?? true`。三处一致，确保新安装时首次写入 Claude 设置前一定会备份。

5. **language 字段的类型安全**：`setLanguage()` 接受 `'chinese' | 'english'` 字面量类型，TypeScript 编译期即可阻止非法值。但运行时传入非法字符串的风险由调用方的 Zod 验证（如 config 路由的 `SetLanguageSchema`）或 CLI 层的参数校验来防范。

## Dependencies

- **Depends on**:
  - `readStoreData()` / `writeStoreData()`（`src/server/providers-store.ts`:124-152）：底层文件读写基础设施，负责 JSON 文件的读取、Zod 验证和写入。
  - `StoreDataSchema` / `DEFAULT_STORE_DATA`（`src/server/providers-store.ts`:52-58, 107-113）：数据模型定义和默认值。
  - `logger`（`src/utils/logger.ts`）：日志记录。

- **Depended by**:
  - **CLI `enable` 命令**（`src/commands/enable.ts`）：调用 `setEnableFurinaProxy(true)` 开启代理，调用 `getNeverClaudeSettings()` / `setNeverClaudeSettings(false)` 管理备份守卫。
  - **CLI `disable` 命令**（`src/commands/disable.ts`）：调用 `setEnableFurinaProxy(false)` 关闭代理。
  - **CLI `agents` 命令**（`src/commands/agents.ts`）：调用 `getEnableFurinaProxy()` 判断是否启用代理模式。
  - **Anthropic 代理处理器**（`src/server/anthropic/handler.ts`）：调用 `getEnableFurinaProxy()` 在请求入口判断是否拦截。
  - **Providers API 路由**（`src/server/routes/providers.ts`）：调用 `getEnableFurinaProxy()` / `setEnableFurinaProxy()` 管理 proxy 状态；调用 `getNeverClaudeSettings()` / `setNeverClaudeSettings()` 在 `ensureFirstWriteBackup()` 中管理备份守卫。
  - **Config API 路由**（`src/server/routes/config.ts`）：调用 `getLanguage()` / `setLanguage()` 管理语言偏好。

## Usage Examples

### 完整场景：启用代理并管理备份守卫

```typescript
import {
  setEnableFurinaProxy,
  getNeverClaudeSettings,
  setNeverClaudeSettings,
} from './providers-store.js';
import {
  backupClaudeSettings,
  writeEnvToClaudeSettings,
  getProxyEnv,
} from './claude-settings.js';

// Step 1: 开启代理
setEnableFurinaProxy(true);

// Step 2: 在写入 Claude 设置前检查备份守卫
if (getNeverClaudeSettings()) {
  // 首次修改 Claude 设置，先备份原始配置
  backupClaudeSettings();
  // 关闭守卫，后续写入不再备份
  setNeverClaudeSettings(false);
}

// Step 3: 写入代理环境变量
writeEnvToClaudeSettings(getProxyEnv());
```
Explanation: 这是 `furina enable` 命令的核心流程。首先开启代理标志，然后检查 Claude 设置是否已被修改过。如果是首次修改（守卫为 `true`），先将原始 `~/.claude/settings.json` 备份到 `~/.furina/settings.bak.json`，再将守卫设为 `false` 以防止重复备份。最后将代理环境变量写入 Claude 设置文件。

### 完整场景：通过 Web API 切换语言

```typescript
import { getLanguage, setLanguage } from './providers-store.js';
import * as express from 'express';

const router = express.default.Router();

// 获取当前语言
router.get('/api/config', (_req, res) => {
  const language = getLanguage();
  res.status(200).json({ language });
  // 响应示例: { "language": "chinese" }
});

// 更新语言（假设已通过 Zod 验证）
router.put('/api/config', (req, res) => {
  setLanguage(req.body.language);
  res.status(200).json({ language: req.body.language });
  // 请求示例: { "language": "english" }
});
```
Explanation: Web UI 前端通过 GET 请求获取当前语言设置以渲染对应语言的界面，通过 PUT 请求切换语言。实际代码中 PUT 路由会先通过 Zod schema 验证 `language` 值是否为合法枚举值。

### 完整场景：禁用代理

```typescript
import {
  setEnableFurinaProxy,
  getActiveProvider,
} from './providers-store.js';
import {
  getProviderEnv,
  writeEnvToClaudeSettings,
  restoreClaudeSettings,
} from './claude-settings.js';

// 关闭代理
setEnableFurinaProxy(false);

// 同步 Claude 设置：切换回直连模式或恢复备份
const activeProvider = getActiveProvider();
if (activeProvider) {
  // 有活跃 provider，写入直连环境变量
  writeEnvToClaudeSettings(getProviderEnv(activeProvider));
} else {
  // 无活跃 provider，恢复原始 Claude 设置
  restoreClaudeSettings();
}
```
Explanation: `furina disable` 命令的核心流程。关闭代理标志后，检查是否存在活跃的 provider。如果有，将 Claude 设置切换为直连模式的环境变量；如果没有，从备份文件恢复原始 Claude 设置。
