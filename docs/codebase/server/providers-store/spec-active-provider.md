# Active Provider Management

> Source files:
> - `src/server/providers-store.ts` : 293-347
> - `src/server/providers-store.ts` : 245-265 (cascade in updateProvider)
> - `src/server/providers-store.ts` : 273-292 (cascade in deleteProvider)

## Overview

Active Provider 是 Furina 系统中"当前正在使用哪个 LLM 供应商"的核心状态。这个状态决定了 Claude CLI 在执行任务时应连接哪个供应商的 API，也决定了 Web UI 上显示的当前选中供应商。

本 spec 覆盖以下职责：

- **读取当前活跃供应商**：提供 ID 级别 (`getActiveProviderId`) 和完整对象级别 (`getActiveProvider`) 两种读取方式，后者额外做 `enabled` 检查——已禁用的供应商视为不存在。
- **设置当前活跃供应商**：`setActiveProviderId` 在写入前做存在性校验和启用状态校验，防止将已删除或已禁用的供应商设为活跃。
- **清除当前活跃供应商**：`clearActiveProviderId` 将状态置为 null，用于重置场景。
- **级联清除（cascade）**：当用户通过 `updateProvider` 禁用一个供应商或通过 `deleteProvider` 删除一个供应商时，如果该供应商恰好是当前活跃供应商，系统会自动将 `activeProviderId` 置为 null，保持数据一致性。

设计动机：活跃供应商状态与供应商列表存储在同一个 JSON 文件（`~/.furina/providers.json`）中的 `activeProviderId` 字段。这种同文件存储避免了跨文件事务问题，所有读写都遵循 read-modify-write 模式。

使用场景：
- Web UI 通过 REST API 调用 `GET /furina/api/providers/active` 获取当前活跃供应商，通过 `PUT /furina/api/providers/active` 设置。
- CLI 命令 `agents switch` 通过 `setActiveProviderId` 切换全局活跃供应商。
- `disable` 命令通过 `getActiveProvider` 获取当前活跃供应商以同步 Claude settings。
- 用户在 Web UI 禁用/删除供应商时，store 层自动级联清除活跃供应商状态。

## Architecture / Flow

活跃供应商状态管理涉及两条数据流路径：

### 路径一：主动读写流程

```
用户/UI操作
  |
  v
getActiveProviderId() / setActiveProviderId() / clearActiveProviderId()
  |
  v
readStoreData() -> 修改 activeProviderId -> writeStoreData()
```

### 路径二：级联清除流程

```
用户禁用/删除供应商
  |
  v
updateProvider(id, {enabled: false}) / deleteProvider(id)
  |
  v
检查 data.activeProviderId === id ?
  |-- 是 --> data.activeProviderId = null  (级联清除)
  |-- 否 --> 不修改
  |
  v
writeStoreData()
```

关键设计点：`getActiveProvider()` 与其他三个函数不同，它不仅读取 `activeProviderId`，还会在供应商列表中查找完整的 Provider 对象，并额外检查 `enabled !== false`。这意味着即使 `activeProviderId` 指向一个已被禁用的供应商（尚未被级联清除的极端情况），`getActiveProvider()` 也会返回 null，保证上层不会拿到一个不可用的供应商。

## Functionality / Interface Details

### `getActiveProviderId() -> string | null`

**Source**: `src/server/providers-store.ts`:303-305

**Functionality**: 从持久化存储中读取当前活跃供应商的 UUID 字符串。这是一个轻量级的只读操作，仅返回 ID 值，不做任何额外校验。当系统需要快速判断"是否有活跃供应商"或需要获取 ID 用于比较判断时使用此函数（例如 REST API 路由中判断某个被操作的供应商是否为当前活跃供应商）。

**Parameters**: 无参数。

**Return Value**:
- `string`: 活跃供应商的 UUID 字符串。
- `null`: 未设置任何活跃供应商。

**Core Logic**:
调用 `readStoreData()` 读取整个 store 数据，直接返回 `activeProviderId` 字段。`readStoreData` 内部处理了文件不存在、JSON 解析失败、Schema 校验失败等边界情况，在这些情况下会返回默认数据（`activeProviderId: null`）。

**Core Code**:
```typescript
export function getActiveProviderId(): string | null {
  return readStoreData().activeProviderId;
}
```
Source: `src/server/providers-store.ts`:303-305

**Usage Example**:
```typescript
import { getActiveProviderId } from './providers-store.js';

// 在 REST 路由中检查当前活跃供应商
const activeId = getActiveProviderId();
if (activeId === req.params.id) {
  // 该供应商是当前活跃供应商，需要额外处理 Claude settings 同步
}
```
Explanation: 典型用法是在 REST API 路由中，判断正在被更新或删除的供应商是否为当前活跃供应商，以决定是否需要同步 Claude settings。例如 `PUT /:id/enabled` 和 `DELETE /:id` 路由都在操作前调用此函数做判断。

---

### `getActiveProvider() -> Provider | null`

**Source**: `src/server/providers-store.ts`:312-318

**Functionality**: 获取当前活跃供应商的完整 Provider 对象。与 `getActiveProviderId` 不同，此函数不仅返回 ID，还执行完整的供应商查找和状态校验。如果 `activeProviderId` 为 null、对应的供应商不存在、或供应商已被禁用（`enabled === false`），都返回 null。这是上层代码获取"当前真正可用的活跃供应商"的推荐方式。

设计意图：即使底层 `activeProviderId` 字段仍指向某个 ID（例如在级联清除之前存在极短的时间窗口），此函数也会通过检查 `enabled` 状态来保证返回值一定是可用的供应商。

**Parameters**: 无参数。

**Return Value**:
- `Provider`: 完整的供应商对象，包含 id、name、apiKey、baseUrl、模型配置等所有字段。
- `null`: 以下任一情况返回 null：
  - `activeProviderId` 未设置（为 null）
  - `activeProviderId` 指向的供应商在列表中不存在
  - 对应供应商的 `enabled` 字段为 `false`

**Core Logic**:
1. 调用 `readStoreData()` 获取完整 store 数据。
2. 检查 `activeProviderId` 是否为 null，如果是则直接返回 null。
3. 在供应商列表中用 `Array.find` 按 ID 匹配查找供应商。
4. 如果找到的供应商 `enabled === false`，返回 null（防止上层使用已禁用的供应商）。
5. 以上校验全部通过后返回完整的 Provider 对象。

**Core Code**:
```typescript
export function getActiveProvider(): Provider | null {
  const data = readStoreData();
  if (data.activeProviderId === null) return null;
  const provider = data.providers.find((p) => p.id === data.activeProviderId);
  if (!provider || provider.enabled === false) return null;
  return provider;
}
```
Source: `src/server/providers-store.ts`:312-318

**Usage Example**:
```typescript
import { getActiveProvider } from './providers-store.js';
import { getProviderEnv, writeEnvToClaudeSettings } from './claude-settings.js';

// 获取当前活跃供应商并同步 Claude settings
const activeProvider = getActiveProvider();
if (activeProvider) {
  writeEnvToClaudeSettings(getProviderEnv(activeProvider));
} else {
  restoreClaudeSettings();
}
```
Explanation: 在 `disable` 命令中，关闭代理后需要根据当前活跃供应商同步 Claude settings。使用 `getActiveProvider` 而非 `getActiveProviderId` + `getProviderById` 的组合，因为此函数内置了 `enabled` 检查，避免使用已禁用的供应商配置。

---

### `setActiveProviderId(providerId: string) -> void`

**Source**: `src/server/providers-store.ts`:325-337

**Functionality**: 设置当前活跃供应商。在写入 `activeProviderId` 之前执行两项验证：(1) 检查指定 ID 的供应商确实存在于列表中；(2) 检查该供应商的 `enabled` 字段不为 false。只有两项验证都通过才会执行写入。这是一种防御性设计，防止上层误将不存在或已禁用的供应商设为活跃状态。

**Parameters**:
- `providerId` (`string`): 要设为活跃状态的供应商 UUID。必须是已存在的、处于启用状态的供应商 ID。

**Return Value**:
- `void`: 设置成功时无返回值。

**Throws**:
- `Error("Provider not found: {providerId}")`: 指定 ID 的供应商在列表中不存在。
- `Error("Cannot activate disabled provider: {providerId}")`: 供应商存在但其 `enabled` 字段为 false。

**Core Logic**:
1. 调用 `readStoreData()` 获取当前 store 数据。
2. 在供应商列表中按 ID 查找目标供应商。
3. 如果未找到，抛出 "Provider not found" 错误。
4. 如果找到但 `enabled === false`，抛出 "Cannot activate disabled provider" 错误。
5. 将 `data.activeProviderId` 设为传入的 `providerId`。
6. 调用 `writeStoreData(data)` 持久化。
7. 记录 info 日志。

注意：此函数只修改 `activeProviderId` 字段，不会修改供应商自身的任何字段。上层调用方（如 REST 路由）在成功设置后通常还需要同步 Claude settings（写入供应商环境变量或代理环境变量）。

**Core Code**:
```typescript
export function setActiveProviderId(providerId: string): void {
  const data = readStoreData();
  const provider = data.providers.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }
  if (provider.enabled === false) {
    throw new Error(`Cannot activate disabled provider: ${providerId}`);
  }
  data.activeProviderId = providerId;
  writeStoreData(data);
  logger.info(`Active provider set: ${providerId}`);
}
```
Source: `src/server/providers-store.ts`:325-337

**Usage Example**:
```typescript
import { setActiveProviderId } from './providers-store.js';

// CLI 命令中切换全局活跃供应商
try {
  setActiveProviderId(provider.id);
  process.stdout.write(`Switched global active provider to: ${provider.name}\n`);
} catch (err) {
  if (err instanceof Error && err.message.includes('disabled')) {
    process.stderr.write(`Provider "${provider.name}" is disabled. Enable it first.\n`);
  } else {
    process.stderr.write(`Provider not found.\n`);
  }
}
```
Explanation: 在 `agents switch` 命令中，通过供应商名称或模型名称查找后，调用 `setActiveProviderId` 设置全局活跃供应商。如果供应商已禁用，函数会抛出带 "disabled" 关键字的错误，上层据此给出特定的错误提示。

---

### `clearActiveProviderId() -> void`

**Source**: `src/server/providers-store.ts`:342-347

**Functionality**: 清除当前活跃供应商状态，将 `activeProviderId` 设为 null。用于系统重置场景，例如用户通过 Web UI 的"重置"功能恢复原始 Claude settings 时，需要同时清除活跃供应商。

**Parameters**: 无参数。

**Return Value**:
- `void`: 无返回值。

**Core Logic**:
1. 调用 `readStoreData()` 获取当前 store 数据。
2. 将 `data.activeProviderId` 设为 `null`。
3. 调用 `writeStoreData(data)` 持久化。
4. 记录 info 日志 "Active provider cleared"。

注意：此函数不做任何前置检查（如当前是否有活跃供应商），即使当前 `activeProviderId` 已经是 null 也会执行写入（幂等操作）。

**Core Code**:
```typescript
export function clearActiveProviderId(): void {
  const data = readStoreData();
  data.activeProviderId = null;
  writeStoreData(data);
  logger.info('Active provider cleared');
}
```
Source: `src/server/providers-store.ts`:342-347

**Usage Example**:
```typescript
import { clearActiveProviderId } from './providers-store.js';
import { restoreClaudeSettings } from './claude-settings.js';

// 重置操作：恢复 Claude settings 并清除活跃供应商
try {
  restoreClaudeSettings();
} catch (err) {
  logger.error(`Failed to restore Claude settings: ${err}`);
}
clearActiveProviderId();
```
Explanation: 在 REST 路由 `POST /furina/api/providers/reset` 中，先尝试恢复 Claude settings 备份，然后清除活跃供应商。即使恢复失败，仍然清除活跃供应商状态。

---

### 级联清除：`updateProvider` 中的禁用级联

**Source**: `src/server/providers-store.ts`:256-259

**Functionality**: 当通过 `updateProvider` 将某个供应商的 `enabled` 字段设为 `false` 时，如果该供应商恰好是当前的活跃供应商，系统自动将 `activeProviderId` 置为 null。这是一个写入时的一致性保障机制，确保系统不会持有指向已禁用供应商的活跃引用。

**Core Logic**:
在 `updateProvider` 完成字段合并更新后、写入文件前，检查两个条件：
1. `update.enabled === false` —— 本次更新将供应商设为禁用。
2. `data.activeProviderId === id` —— 被禁用的供应商正是当前活跃供应商。

两个条件同时满足时，将 `data.activeProviderId` 置为 `null`。随后 `writeStoreData` 会将供应商更新和活跃状态清除原子地写入同一个文件。

**Core Code**:
```typescript
// Cascade: clear active provider if the provider is being disabled and was active
if (update.enabled === false && data.activeProviderId === id) {
  data.activeProviderId = null;
}
```
Source: `src/server/providers-store.ts`:256-259

**Usage Example**:
```typescript
import { updateProvider } from './providers-store.js';

// 禁用某个供应商，如果是活跃供应商则自动级联清除
const updated = updateProvider(providerId, { enabled: false });
// 此时如果 providerId 之前是活跃供应商，getActiveProviderId() 已返回 null
```
Explanation: `updateProvider` 内部自动处理级联清除，调用方无需额外逻辑。上层 REST 路由 `PUT /:id/enabled` 在调用 `updateProvider` 后，会根据 `wasActive` 标志决定是否需要额外同步 Claude settings。

---

### 级联清除：`deleteProvider` 中的删除级联

**Source**: `src/server/providers-store.ts`:283-286

**Functionality**: 当通过 `deleteProvider` 删除某个供应商时，如果该供应商是当前活跃供应商，系统自动将 `activeProviderId` 置为 null。与禁用级联类似，这确保了 `activeProviderId` 不会指向一个已不存在的供应商。

**Core Logic**:
在 `deleteProvider` 完成 `splice` 操作（从数组中移除供应商）后、写入文件前，检查 `data.activeProviderId === id`，如果匹配则置为 null。

**Core Code**:
```typescript
// Cascade: clear active provider if the deleted provider was active
if (data.activeProviderId === id) {
  data.activeProviderId = null;
}
```
Source: `src/server/providers-store.ts`:283-286

**Usage Example**:
```typescript
import { deleteProvider, getActiveProviderId } from './providers-store.js';

// 删除前记录是否为活跃供应商（用于后续 Claude settings 处理）
const wasActive = getActiveProviderId() === providerId;
const found = deleteProvider(providerId);

if (wasActive) {
  // deleteProvider 内部已级联清除 activeProviderId
  // 此处需额外同步 Claude settings（恢复备份或写入代理配置）
  restoreClaudeSettings();
}
```
Explanation: REST 路由 `DELETE /:id` 在删除前通过 `getActiveProviderId` 记录是否为活跃供应商，删除后根据此标志决定是否恢复 Claude settings 备份。`deleteProvider` 内部已自动完成了 `activeProviderId` 的级联清除。

## Data Structures

### `StoreData`
```typescript
const StoreDataSchema = z.object({
  activeProviderId: z.string().nullable(),
  enableFurinaProxy: z.boolean().nullable().default(false),
  neverClaudeSettings: z.boolean().nullable().default(true),
  language: z.enum(['chinese', 'english']).nullable().default('chinese'),
  providers: z.array(ProviderSchema),
});
```
- `activeProviderId` (`string | null`): 当前活跃供应商的 UUID。null 表示未设置。本 spec 的所有函数都围绕此字段进行读写。
- `providers` (`Provider[]`): 供应商列表，`activeProviderId` 的存在性和有效性都依赖于此数组。

### `Provider`
```typescript
export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  // ... 省略其他字段
  enabled: z.boolean().default(true),
  // ...
});
```
- `id` (`string`): 供应商唯一标识 UUID，`activeProviderId` 存储的就是这个值。
- `enabled` (`boolean`): 是否启用。`getActiveProvider` 会检查此字段，`setActiveProviderId` 会拒绝设为已禁用的供应商。

## Error Handling and Edge Cases

### 文件级容错
所有四个函数都通过 `readStoreData()` 读取数据，该函数处理以下异常情况并返回默认数据（`activeProviderId: null`）：
- `providers.json` 文件不存在
- 文件内容不是有效 JSON
- JSON 内容不符合 `StoreDataSchema` 验证

这意味着即使存储文件损坏，active provider 函数也不会抛出异常，而是返回安全的默认值。

### setActiveProviderId 的防御性校验
- **供应商不存在**：抛出 `Error("Provider not found: {id}")`，由上层捕获处理（REST 路由返回 404）。
- **供应商已禁用**：抛出 `Error("Cannot activate disabled provider: {id}")`，由上层捕获处理（REST 路由返回 400）。错误消息包含 "disabled" 关键字，方便上层区分两种错误场景。

### getActiveProvider 的一致性保障
`getActiveProvider` 返回 null 的三种情况：
1. `activeProviderId === null`（未设置）
2. 供应商在列表中不存在（数据不一致，可能因手动编辑文件导致）
3. 供应商 `enabled === false`（级联清除前的极短窗口，或手动编辑文件）

### 级联操作的原子性
级联清除（置 `activeProviderId = null`）和业务操作（供应商禁用/删除）在同一个 `writeStoreData` 调用中写入，保证了对文件的原子性——不会出现中间状态。

## Dependencies

- **Depends on**:
  - `readStoreData()` / `writeStoreData()` — 底层文件 I/O 和 JSON 解析（本文件内的私有函数）
  - `StoreDataSchema` / `Provider` — Zod schema 和类型定义
  - `logger` (`../utils/logger.ts`) — 日志记录

- **Depended by**:
  - `spec-active-provider.md` 自身的级联逻辑来自 `spec-provider-crud.md` 中的 `updateProvider` 和 `deleteProvider`
  - `src/server/routes/providers.ts` — REST API 路由层，通过 `GET /active`、`PUT /active`、`POST /reset` 等端点暴露这些函数
  - `src/commands/agents.ts` — CLI `agents switch` 命令，调用 `setActiveProviderId` 切换全局活跃供应商
  - `src/commands/disable.ts` — CLI `disable` 命令，调用 `getActiveProvider` 获取活跃供应商以同步 Claude settings

## Usage Examples

### 完整场景：切换活跃供应商并同步 Claude settings

```typescript
import {
  getActiveProviderId,
  setActiveProviderId,
  getActiveProvider,
  clearActiveProviderId,
} from './providers-store.js';
import {
  writeEnvToClaudeSettings,
  getProviderEnv,
  getProxyEnv,
  restoreClaudeSettings,
} from './claude-settings.js';

// 1. 查询当前活跃供应商
const currentId = getActiveProviderId();
console.log('Current active provider ID:', currentId);

// 2. 获取完整的活跃供应商对象（带 enabled 检查）
const activeProvider = getActiveProvider();
if (activeProvider) {
  console.log('Active provider name:', activeProvider.name);
} else {
  console.log('No active provider or active provider is disabled');
}

// 3. 切换到新供应商
try {
  setActiveProviderId('new-provider-uuid');
  console.log('Switched to new provider');

  // 同步 Claude settings
  const provider = getActiveProvider();
  if (provider) {
    writeEnvToClaudeSettings(getProviderEnv(provider));
  }
} catch (err) {
  if (err instanceof Error) {
    if (err.message.includes('not found')) {
      console.error('Provider does not exist');
    } else if (err.message.includes('disabled')) {
      console.error('Cannot activate a disabled provider');
    }
  }
}

// 4. 重置操作：恢复原始设置并清除活跃供应商
restoreClaudeSettings().catch((err) => {
  console.error('Failed to restore settings:', err);
});
clearActiveProviderId();
```

Explanation: 上述示例展示了 active provider 管理的完整生命周期——查询、切换、错误处理、重置。注意切换供应商后需要调用上层 `writeEnvToClaudeSettings` 同步 Claude CLI 配置，这不在 `providers-store` 的职责范围内，而是由 REST 路由层或 CLI 命令层负责。

### 级联场景：禁用活跃供应商

```typescript
import { getActiveProviderId, updateProvider } from './providers-store.js';
import { restoreClaudeSettings } from './claude-settings.js';

// 禁用某个供应商前记录其状态
const providerId = 'some-uuid';
const wasActive = getActiveProviderId() === providerId;

// 执行禁用（内部自动级联清除 activeProviderId）
const updated = updateProvider(providerId, { enabled: false });

// 如果被禁用的恰好是活跃供应商，额外同步 Claude settings
if (wasActive) {
  restoreClaudeSettings();
}

// 验证：此时 getActiveProviderId() 返回 null
console.log(getActiveProviderId()); // null
```

Explanation: 当禁用的供应商恰好是活跃供应商时，`updateProvider` 内部会自动将 `activeProviderId` 置为 null（级联清除）。上层 REST 路由需要根据 `wasActive` 标志决定是否额外同步 Claude settings（恢复备份或写入代理配置）。这种分层设计将数据一致性保障放在 store 层，将外部系统同步放在路由层。
