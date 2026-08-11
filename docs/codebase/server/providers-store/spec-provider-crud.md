# Provider CRUD Operations

> Source files:
> - `src/server/providers-store.ts` : 167-292

## Overview

本 spec 文档描述 `providers-store.ts` 中 Provider 的完整增删改查 (CRUD) 操作，覆盖 `loadProviders()`、`saveProviders()`、`getProviderById()`、`createProvider()`、`updateProvider()`、`deleteProvider()` 六个导出函数。

这些函数是 Provider 管理的核心业务层，位于底层文件 I/O（`readStoreData()` / `writeStoreData()`）之上，对外暴露给 Express 路由层（`routes/providers.ts`）。所有函数均遵循"读取-修改-写回"（read-modify-write）的同步事务模式，通过 Zod schema 保证数据类型安全。

设计要点：
- **服务端生成字段**：`id`（UUID v4）和 `createdAt` 由服务端在创建时自动生成，客户端不传入
- **名称唯一性约束**：`createProvider()` 在写入前检查 `name` 是否重复，重复则抛出 `Error`
- **级联清理**：`updateProvider()` 在禁用当前活跃 provider 时自动清除 `activeProviderId`；`deleteProvider()` 在删除当前活跃 provider 时同样自动清除
- **部分更新语义**：`updateProvider()` 采用 spread merge，只覆盖传入字段，未传字段保持原值，并自动追加 `updatedAt` 时间戳

## Architecture / Flow

```
  Client Request (HTTP)
         |
         v
  routes/providers.ts  (Zod validation + HTTP response mapping)
         |
         v
  CRUD Functions  <-- 本 spec 覆盖的层级
  (loadProviders, createProvider, updateProvider, deleteProvider, ...)
         |
         v
  readStoreData() / writeStoreData()  (底层文件 I/O)
         |
         v
  ~/.furina/providers.json  (JSON 文件持久化)
```

所有写操作（create / update / delete）的内部流程均为：
1. 调用 `readStoreData()` 读取当前 JSON 文件内容（含 Zod 解析）
2. 在内存中执行业务逻辑（检查约束、生成字段、数组操作等）
3. 调用 `writeStoreData(data)` 将修改后的完整数据写回文件

## Functionality / Interface Details

### `loadProviders() -> Provider[]`

**Source**: `src/server/providers-store.ts`:172-174

**Functionality**: 从 `providers.json` 文件中加载所有已配置的 provider 列表。这是一个简单的读操作，内部调用 `readStoreData()` 完成文件读取和 Zod 验证，然后直接返回 `providers` 数组。当文件不存在或格式损坏时，`readStoreData()` 返回默认数据（空数组），因此本函数永远不会抛出异常。

**Parameters**: 无参数

**Return Value**:
- `Provider[]`: 从存储文件解析出的 provider 对象数组。如果文件不存在或内容无效，返回空数组 `[]`

**Core Logic**:
直接委托给 `readStoreData()`，读取文件后返回其中的 `providers` 数组字段。`readStoreData()` 内部会进行三层容错处理：
1. 文件不存在 → 返回默认数据
2. JSON 解析失败 → 返回默认数据
3. Zod safeParse 失败 → 日志警告并返回默认数据

**Core Code**:
```typescript
export function loadProviders(): Provider[] {
  return readStoreData().providers;
}
```
Source: `src/server/providers-store.ts`:172-174

**Usage Example**:
```typescript
import { loadProviders } from './providers-store.js';

// 加载所有 provider 并遍历
const providers = loadProviders();
console.log(`当前配置了 ${providers.length} 个 provider`);
for (const p of providers) {
  console.log(`- ${p.name} (${p.id}), enabled: ${p.enabled}`);
}
```
Explanation: 典型用法是在路由 GET 处理器中获取全部 provider 列表并返回给前端，或在查询逻辑中筛选特定条件的 provider。

---

### `saveProviders(providers: Provider[]) -> void`

**Source**: `src/server/providers-store.ts`:180-184

**Functionality**: 将一个 provider 数组完整写回存储文件，同时保留文件中的其他字段（如 `activeProviderId`、`enableFurinaProxy` 等）。这是一种批量替换 provider 列表的方式，内部先读取当前完整 store 数据，替换 `providers` 字段后再写回。

**Parameters**:
- `providers` (`Provider[]`): 要保存的 provider 数组，将完全替换现有的 providers 列表

**Return Value**: 无返回值（`void`）

**Core Logic**:
1. 调用 `readStoreData()` 读取当前完整存储数据
2. 用传入的 `providers` 数组替换 `data.providers`
3. 调用 `writeStoreData(data)` 写回文件

**Core Code**:
```typescript
export function saveProviders(providers: Provider[]): void {
  const data = readStoreData();
  data.providers = providers;
  writeStoreData(data);
}
```
Source: `src/server/providers-store.ts`:180-184

**Usage Example**:
```typescript
import { loadProviders, saveProviders } from './providers-store.js';

// 禁用所有 provider 的示例
const providers = loadProviders();
const disabled = providers.map(p => ({ ...p, enabled: false }));
saveProviders(disabled);
```
Explanation: 当需要对 provider 列表进行批量操作时使用。注意此函数会保留 store 中的 `activeProviderId` 等其他字段不变。

---

### `getProviderById(id: string) -> Provider | undefined`

**Source**: `src/server/providers-store.ts`:191-194

**Functionality**: 根据 provider 的 UUID 查找并返回单个 provider 对象。如果找不到匹配的 provider，返回 `undefined`。这是一个只读查询函数，不修改任何数据。

**Parameters**:
- `id` (`string`): 要查找的 provider UUID，格式为 `crypto.randomUUID()` 生成的标准 UUID 字符串

**Return Value**:
- `Provider`: 找到时返回 provider 对象
- `undefined`: 未找到匹配 ID 的 provider

**Core Logic**:
调用 `loadProviders()` 获取全部 provider，然后使用 `Array.find()` 按 `id` 字段精确匹配查找。

**Core Code**:
```typescript
export function getProviderById(id: string): Provider | undefined {
  const providers = loadProviders();
  return providers.find((p) => p.id === id);
}
```
Source: `src/server/providers-store.ts`:191-194

**Usage Example**:
```typescript
import { getProviderById } from './providers-store.js';

// 查找特定 provider 用于构建 Claude 环境变量
const provider = getProviderById('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
if (provider) {
  console.log(`Found provider: ${provider.name}, baseUrl: ${provider.baseUrl}`);
} else {
  console.log('Provider not found');
}
```
Explanation: 典型用法是在路由层（如 `PUT /active` 设置活跃 provider 后）获取 provider 详情用于 Claude settings 同步，或在其他业务逻辑中按 ID 精确查询。

---

### `createProvider(input: ProviderInput) -> Provider`

**Source**: `src/server/providers-store.ts`:203-235

**Functionality**: 创建一个新的 provider 配置。服务端自动为新 provider 生成 UUID（`id` 字段）和创建时间戳（`createdAt` 字段），客户端传入的字段通过 `ProviderInput` schema 约束。写入前检查名称唯一性，如果已存在同名 provider 则抛出异常。创建成功后记录日志并返回完整的 provider 对象。

**Parameters**:
- `input` (`ProviderInput`): 客户端传入的 provider 数据，包含以下字段：
  - `name` (`string`, 必填): provider 名称，须在所有 provider 中唯一
  - `apiKey` (`string`, 必填): API 密钥
  - `defaultModel` (`string`, 必填): 默认模型名称
  - `sonnetModel` (`string`, 必填): Sonnet 模型名称
  - `opusModel` (`string`, 必填): Opus 模型名称
  - `haikuModel` (`string`, 必填): Haiku 模型名称
  - `notes` (`string`, 可选): 备注信息
  - `websiteUrl` (`string`, 可选): 官网地址
  - `baseUrl` (`string`, 可选): API 基础 URL
  - `icon` (`string`, 可选): 图标 SVG 或路径
  - `iconColor` (`string`, 可选): 图标颜色
  - `usedTemplate` (`string`, 可选): 使用的模板名称
  - `enabled` (`boolean`, 默认 `true`): 是否启用

**Return Value**:
- `Provider`: 完整的 provider 对象，包含服务端生成的 `id` 和 `createdAt`

**错误/边界情况**:
- 抛出 `Error`：当 `input.name` 与已有 provider 名称重复时，抛出 `Error("Provider name \"xxx\" already exists")`

**Core Logic**:
1. 使用 `new Date().toISOString()` 生成当前时间作为 `createdAt`
2. 使用 `crypto.randomUUID()` 生成 UUID v4 作为 `id`
3. 将 input 字段与生成字段组合为完整的 `Provider` 对象
4. 读取当前 store 数据，使用 `Array.some()` 检查 `providers` 数组中是否已有同名 provider
5. 若名称重复，抛出 `Error`
6. 将新 provider 追加到 `providers` 数组末尾
7. 写回文件并记录日志

**Core Code**:
```typescript
export function createProvider(input: ProviderInput): Provider {
  const now = new Date().toISOString();
  const provider: Provider = {
    id: crypto.randomUUID(),
    name: input.name,
    apiKey: input.apiKey,
    defaultModel: input.defaultModel,
    sonnetModel: input.sonnetModel,
    opusModel: input.opusModel,
    haikuModel: input.haikuModel,
    notes: input.notes,
    websiteUrl: input.websiteUrl,
    baseUrl: input.baseUrl,
    icon: input.icon,
    iconColor: input.iconColor,
    usedTemplate: input.usedTemplate,
    enabled: input.enabled,
    createdAt: now,
  };

  const data = readStoreData();

  const isDuplicate = data.providers.some((p) => p.name === input.name);
  if (isDuplicate) {
    throw new Error(`Provider name "${input.name}" already exists`);
  }

  data.providers.push(provider);
  writeStoreData(data);
  logger.info(`Provider created: ${provider.name} (${provider.id})`);

  return provider;
}
```
Source: `src/server/providers-store.ts`:203-235

**Usage Example**:
```typescript
import { createProvider } from './providers-store.js';

// 创建一个新的 Anthropic provider
const provider = createProvider({
  name: 'Anthropic',
  apiKey: 'sk-ant-xxx',
  defaultModel: 'claude-3-5-sonnet',
  sonnetModel: 'claude-3-5-sonnet',
  opusModel: 'claude-3-opus',
  haikuModel: 'claude-3-5-haiku',
  baseUrl: 'https://api.anthropic.com',
});
console.log(`Created: ${provider.id} at ${provider.createdAt}`);

// 名称重复时会抛出异常
try {
  createProvider({ name: 'Anthropic', apiKey: 'xxx', ... });
} catch (err) {
  console.error(err.message); // "Provider name "Anthropic" already exists"
}
```
Explanation: 典型调用场景是 `POST /furina/api/providers` 路由处理器，客户端发送 provider 配置数据，服务端验证后调用此函数创建。路由层会捕获 "already exists" 错误并返回 409 状态码。

---

### `updateProvider(id: string, update: ProviderUpdate) -> Provider`

**Source**: `src/server/providers-store.ts`:245-265

**Functionality**: 更新已有 provider 的部分字段。采用部分合并（partial merge）语义：只有 `update` 对象中显式传入的字段会被覆盖，其余字段保持原值不变。每次更新都会自动追加 `updatedAt` 时间戳。当更新将 provider 禁用（`enabled: false`）且该 provider 恰好是当前活跃 provider 时，会级联清除 `activeProviderId`，防止系统依赖一个已被禁用的 provider。

**Parameters**:
- `id` (`string`): 要更新的 provider UUID
- `update` (`ProviderUpdate`): 部分更新对象，所有字段均为可选：
  - `name` (`string`, 可选): 新名称
  - `apiKey` (`string`, 可选): 新 API 密钥
  - `defaultModel` / `sonnetModel` / `opusModel` / `haikuModel` (`string`, 可选): 模型名称
  - `notes` / `websiteUrl` / `baseUrl` / `icon` / `iconColor` (`string`, 可选): 配置信息
  - `enabled` (`boolean`, 可选): 启用/禁用状态

**Return Value**:
- `Provider`: 更新后的完整 provider 对象

**错误/边界情况**:
- 抛出 `Error`：当指定 `id` 的 provider 不存在时，抛出 `Error("Provider not found: xxx")`

**Core Logic**:
1. 读取当前 store 数据
2. 使用 `Array.findIndex()` 按 `id` 查找 provider 的数组索引
3. 若未找到（`index === -1`），抛出 `Error`
4. 使用对象 spread 语法 `{ ...existing, ...update, updatedAt: new Date().toISOString() }` 合并现有字段与更新字段
5. **级联规则**：检查 `update.enabled === false` 且 `data.activeProviderId === id`，若同时满足则将 `data.activeProviderId` 设为 `null`
6. 将更新后的 provider 写回数组原位置
7. 写回文件并记录日志

**Core Code**:
```typescript
export function updateProvider(id: string, update: ProviderUpdate): Provider {
  const data = readStoreData();
  const index = data.providers.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Provider not found: ${id}`);
  }

  const existing = data.providers[index];
  const updated: Provider = { ...existing, ...update, updatedAt: new Date().toISOString() };
  data.providers[index] = updated;

  // Cascade: clear active provider if the provider is being disabled and was active
  if (update.enabled === false && data.activeProviderId === id) {
    data.activeProviderId = null;
  }

  writeStoreData(data);
  logger.info(`Provider updated: ${updated.name} (${updated.id})`);

  return updated;
}
```
Source: `src/server/providers-store.ts`:245-265

**Usage Example**:
```typescript
import { updateProvider } from './providers-store.js';

// 更新 provider 的模型配置（部分更新，只传入需要修改的字段）
const updated = updateProvider('a1b2c3d4-...', {
  defaultModel: 'claude-3-5-sonnet-latest',
  sonnetModel: 'claude-3-5-sonnet-latest',
});
console.log(`Updated at: ${updated.updatedAt}`);

// 禁用 provider — 如果它是当前活跃 provider，activeProviderId 会被自动清除
const disabled = updateProvider('a1b2c3d4-...', { enabled: false });
console.log(`Provider ${disabled.name} disabled at ${disabled.updatedAt}`);
```
Explanation: 典型调用场景是 `PUT /furina/api/providers/:id` 路由处理器。路由层先使用 `ProviderUpdateSchema` 验证请求体，通过后调用此函数。更新活跃 provider 的模型配置后，路由层还会同步 Claude settings 环境变量。

---

### `deleteProvider(id: string) -> boolean`

**Source**: `src/server/providers-store.ts`:273-292

**Functionality**: 根据 UUID 删除一个 provider 配置。如果被删除的 provider 恰好是当前活跃 provider，会级联清除 `activeProviderId`。使用布尔返回值而非抛出异常来表示 provider 不存在的情况，这与 `updateProvider()` 的行为不同——delete 操作对于"未找到"情况更宽容，调用方可根据返回值自行决定如何响应。

**Parameters**:
- `id` (`string`): 要删除的 provider UUID

**Return Value**:
- `boolean`:
  - `true`: provider 被成功找到并删除
  - `false`: 未找到匹配 ID 的 provider，未执行任何操作

**Core Logic**:
1. 读取当前 store 数据
2. 使用 `Array.findIndex()` 按 `id` 查找 provider 的数组索引
3. 若未找到（`index === -1`），直接返回 `false`
4. 使用 `Array.splice(index, 1)` 从数组中移除该 provider
5. **级联规则**：检查 `data.activeProviderId === id`，若匹配则将 `data.activeProviderId` 设为 `null`
6. 写回文件，记录日志，返回 `true`

**Core Code**:
```typescript
export function deleteProvider(id: string): boolean {
  const data = readStoreData();
  const index = data.providers.findIndex((p) => p.id === id);
  if (index === -1) {
    return false;
  }

  const deleted = data.providers[index];
  data.providers.splice(index, 1);

  // Cascade: clear active provider if the deleted provider was active
  if (data.activeProviderId === id) {
    data.activeProviderId = null;
  }

  writeStoreData(data);
  logger.info(`Provider deleted: ${deleted.name} (${deleted.id})`);

  return true;
}
```
Source: `src/server/providers-store.ts`:273-292

**Usage Example**:
```typescript
import { deleteProvider } from './providers-store.js';

// 删除 provider 并处理不存在的情况
const deleted = deleteProvider('a1b2c3d4-...');
if (!deleted) {
  console.error('Provider not found');
}

// 典型的路由层用法（简化版）
router.delete('/:id', (req, res) => {
  const wasActive = getActiveProviderId() === req.params.id;
  const found = deleteProvider(req.params.id);
  if (!found) {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
    return;
  }
  if (wasActive && !getEnableFurinaProxy()) {
    restoreClaudeSettings();  // 从备份恢复原始 Claude 配置
  }
  res.status(204).send();
});
```
Explanation: 典型调用场景是 `DELETE /furina/api/providers/:id` 路由处理器。路由层先记录"是否删除的是活跃 provider"，调用 `deleteProvider()` 后根据返回值判断是否返回 404，然后根据是否曾为活跃 provider 决定是否恢复 Claude settings 备份。

## Data Structures

### `Provider`
```typescript
export const ProviderSchema = z.object({
  id: z.string(),                     // UUID v4，服务端生成
  name: z.string(),                   // provider 名称，创建时唯一
  notes: z.string().optional(),       // 备注
  websiteUrl: z.string().optional(),  // 官网 URL
  apiKey: z.string().optional(),      // API 密钥
  baseUrl: z.string().optional(),     // API 基础 URL
  icon: z.string().optional(),        // 图标（SVG 或路径）
  iconColor: z.string().optional(),   // 图标颜色
  usedTemplate: z.string().optional(),// 使用的模板名称
  defaultModel: z.string().default(''),  // 默认模型
  sonnetModel: z.string().default(''),   // Sonnet 模型
  opusModel: z.string().default(''),     // Opus 模型
  haikuModel: z.string().default(''),    // Haiku 模型
  enabled: z.boolean().default(true),    // 是否启用
  createdAt: z.string(),              // ISO 8601 创建时间，服务端生成
  updatedAt: z.string().optional(),   // ISO 8601 更新时间，update 时追加
});
export type Provider = z.infer<typeof ProviderSchema>;
```
- `id` (`string`): UUID v4 格式，由 `crypto.randomUUID()` 生成，不可修改
- `name` (`string`): 显示名称，在 create 时唯一
- `enabled` (`boolean`): 是否启用，禁用后该 provider 不参与默认选择和模型匹配
- `createdAt` (`string`): ISO 8601 时间戳，仅在创建时设置
- `updatedAt` (`string`, 可选): ISO 8601 时间戳，仅在 `updateProvider()` 时追加

### `ProviderInput`
```typescript
export const ProviderInputSchema = z.object({
  name: z.string(),
  apiKey: z.string(),
  defaultModel: z.string(),
  sonnetModel: z.string(),
  opusModel: z.string(),
  haikuModel: z.string(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
  usedTemplate: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type ProviderInput = z.infer<typeof ProviderInputSchema>;
```
创建 provider 时的输入 schema。`id`、`createdAt`、`updatedAt` 不在此 schema 中，由服务端自动生成。`name` 和 `apiKey` 为必填项。

### `ProviderUpdate`
```typescript
export const ProviderUpdateSchema = z.object({
  name: z.string().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().optional(),
  sonnetModel: z.string().optional(),
  opusModel: z.string().optional(),
  haikuModel: z.string().optional(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type ProviderUpdate = z.infer<typeof ProviderUpdateSchema>;
```
更新 provider 时的输入 schema。与 `ProviderInputSchema` 的关键区别：所有字段均为可选（partial update 语义），且不包含 `usedTemplate` 字段（模板关联仅在创建时设置）。`updatedAt` 由 `updateProvider()` 自动追加，不在此 schema 中。

### `StoreData`
```typescript
const StoreDataSchema = z.object({
  activeProviderId: z.string().nullable(),
  enableFurinaProxy: z.boolean().nullable().default(false),
  neverClaudeSettings: z.boolean().nullable().default(true),
  language: z.enum(['chinese', 'english']).nullable().default('chinese'),
  providers: z.array(ProviderSchema),
});
type StoreData = z.infer<typeof StoreDataSchema>;
```
存储文件的顶层结构。CRUD 函数通过 `readStoreData()` 读取完整的 `StoreData`，在内存中修改 `providers` 数组或 `activeProviderId`，再通过 `writeStoreData()` 整体写回。

## Error Handling and Edge Cases

### 错误策略

| 场景 | 处理方式 | 行为 |
|------|---------|------|
| `providers.json` 不存在 | `readStoreData()` 返回默认数据 | `loadProviders()` 返回 `[]` |
| 文件内容非合法 JSON | `readStoreData()` catch 解析错误，返回默认数据 | `loadProviders()` 返回 `[]` |
| 文件内容不符合 Zod schema | `readStoreData()` safeParse 失败，返回默认数据 | `loadProviders()` 返回 `[]` |
| `createProvider()` 名称重复 | 抛出 `Error("Provider name \"xxx\" already exists") | 路由层映射为 409 响应 |
| `updateProvider()` ID 不存在 | 抛出 `Error("Provider not found: xxx")` | 路由层映射为 404 响应 |
| `deleteProvider()` ID 不存在 | 返回 `false`（不抛异常） | 路由层映射为 404 响应 |
| 更新禁用活跃 provider | 自动清除 `activeProviderId` | 级联清理，无异常 |
| 删除活跃 provider | 自动清除 `activeProviderId` | 级联清理，无异常 |

### 边界条件

- **并发写入**：所有操作均为同步文件 I/O，不存在并发竞争。但在高并发场景下（如多个 HTTP 请求同时修改 provider），后写入的会覆盖先写入的（last-write-wins）。当前架构中 Express 单线程处理请求，不存在此问题。
- **空数组场景**：当 `providers` 数组为空时，`loadProviders()` 返回 `[]`，`getProviderById()` 返回 `undefined`，`deleteProvider()` 返回 `false`。
- **disabled provider 的级联**：`updateProvider()` 中的级联逻辑仅在 `update.enabled === false`（显式传入 `false`）时触发。如果 `update` 对象中未包含 `enabled` 字段，即使现有 provider 已被禁用，也不会触发级联。这是一个有意的设计——级联只在状态"发生变化"时执行。

## Dependencies

- **Depends on**:
  - `src/server/providers-store.ts` 内部的 `readStoreData()` / `writeStoreData()` 函数（底层文件 I/O 和 Zod 验证）
  - Node.js 内置模块：`crypto`（UUID 生成）
  - `src/utils/logger.js`（日志记录）

- **Depended by**:
  - `src/server/routes/providers.ts`（Express 路由层直接调用所有 CRUD 函数）
  - `spec-provider-query.md`（`getDefaultProvider()` 和 `getProviderByModels()` 依赖 `loadProviders()`）
  - `spec-active-provider.md`（活跃 provider 管理函数依赖 provider 数据的完整性和一致性）

## Usage Examples

### 完整 Provider 生命周期示例

```typescript
import {
  loadProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
} from './providers-store.js';

// 1. 创建新 provider
const newProvider = createProvider({
  name: 'My Anthropic',
  apiKey: 'sk-ant-api-key-xxx',
  defaultModel: 'claude-3-5-sonnet',
  sonnetModel: 'claude-3-5-sonnet',
  opusModel: 'claude-3-opus',
  haikuModel: 'claude-3-5-haiku',
  baseUrl: 'https://api.anthropic.com',
  usedTemplate: 'Anthropic',
});
// newProvider.id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
// newProvider.createdAt = '2026-07-05T12:00:00.000Z'

// 2. 查询单个 provider
const found = getProviderById(newProvider.id);
console.log(found?.name); // 'My Anthropic'

// 3. 更新 provider 配置（部分更新，只修改模型字段）
const updated = updateProvider(newProvider.id, {
  defaultModel: 'claude-3-5-sonnet-latest',
  sonnetModel: 'claude-3-5-sonnet-latest',
});
// updated.updatedAt 现在有值，其他字段不变

// 4. 禁用 provider（会自动清除 activeProviderId 如果该 provider 是活跃的）
const disabled = updateProvider(newProvider.id, { enabled: false });

// 5. 重新启用
const reEnabled = updateProvider(newProvider.id, { enabled: true });

// 6. 删除 provider
const wasDeleted = deleteProvider(newProvider.id);
console.log(wasDeleted); // true

// 7. 验证已删除
const allProviders = loadProviders();
console.log(allProviders.length); // 不再包含已删除的 provider
```

Explanation: 以上代码展示了 provider 从创建到删除的完整生命周期。每一步都演示了对应 CRUD 函数的典型调用方式、输入参数格式和返回值结构。在实际应用中，这些函数通过 Express 路由暴露为 HTTP API，前端通过 RESTful 接口调用。
