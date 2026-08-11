# Store Schemas & File I/O

> Source files:
> - `src/server/providers-store.ts` : 1-167

## Overview

本 spec 覆盖 `providers-store.ts` 文件中与 Zod schema 定义和底层文件读写相关的基础层逻辑。这是整个 providers-store 子模块的基础支撑层，所有上层的 CRUD 操作、活动 provider 管理、设置标志读写和查询操作都建立在此层之上。

**在系统中的角色与定位**：providers-store 是整个 Furina 服务端的配置数据持久层，采用 JSON 文件存储（`~/.furina/providers.json`），所有数据通过同步文件 I/O 进行读写。本 spec 定义了数据的 schema 约束和文件操作原语，确保数据在读取时经过严格的 Zod 校验，写入时自动创建必要的目录结构。

**设计动机**：
- 使用 Zod schema 实现运行时类型校验，保证从 JSON 文件读取的数据结构始终符合预期，防止因手动编辑或版本升级导致的数据损坏
- `readStoreData()` 采用 safeParse + 默认值回退策略，确保在文件不存在、JSON 格式错误或 schema 校验失败时，系统不会崩溃，而是返回安全的默认数据
- `writeStoreData()` 自动创建目录结构，简化部署和首次运行的初始化流程
- `ensureProvidersFile()` 提供显式的初始化入口，供应用启动时调用

**使用场景**：
- 应用启动时调用 `ensureProvidersFile()` 确保数据文件存在
- 所有 CRUD 操作、查询操作内部调用 `readStoreData()` 读取当前状态
- 所有写操作内部调用 `writeStoreData()` 持久化修改

**涉及的源文件及职责**：
- `src/server/providers-store.ts`（1-167 行）：Zod schema 定义、类型推导、默认数据常量、`readStoreData()`/`writeStoreData()`/`ensureProvidersFile()` 三个底层文件操作函数

## Architecture / Flow

数据读写的整体流程是一个经典的 **read-modify-write** 模式：

```
                     ┌─────────────────────┐
                     │  providers.json      │
                     │  (~/.furina/)    │
                     └────────┬────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        readStoreData()  writeStoreData()  ensureProvidersFile()
              │               │               │
              ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────────────┐
     │ existsSync │  │ mkdirSync  │  │ existsSync (file)  │
     │ readFileSync│  │ writeFile  │  │ + writeStoreData() │
     │ JSON.parse │  │ JSON.stringify   └────────────────────┘
     │ safeParse  │  └────────────┘
     │ ↘ fallback │
     └────────────┘
```

**readStoreData() 校验流程**：
1. 检查文件是否存在 -> 不存在则返回默认数据
2. 读取文件内容 -> JSON.parse 解析 -> StoreDataSchema.safeParse 校验
3. 校验成功 -> 返回校验后的数据（带 Zod default 值填充）
4. 校验失败 -> 记录 warn 日志，返回默认数据
5. 文件读取/解析异常 -> 记录 error 日志，返回默认数据

## Functionality / Interface Details

### `ProviderSchema` (Zod Schema)

**Source**: `src/server/providers-store.ts`:29-46

**Functionality**: 定义单个 provider 对象的完整结构，是整个 provider 数据模型的核心 schema。该 schema 同时用于存储层（provider CRUD 操作的数据校验）和 API 层（前后端共享的类型定义）。包含服务端生成的字段（id、createdAt）和客户端提供的字段（name、apiKey 等），以及模型配置字段和状态标志。

**Schema 字段**:
- `id` (`z.string()`): Provider 唯一标识符，由服务端在创建时生成 UUID
- `name` (`z.string()`): Provider 名称，必填，不允许重复
- `notes` (`z.string().optional()`): 可选的备注信息
- `websiteUrl` (`z.string().optional()`): 可选的网站 URL
- `apiKey` (`z.string().optional()`): 可选的 API 密钥
- `baseUrl` (`z.string().optional()`): 可选的 API 基础 URL
- `icon` (`z.string().optional()`): 可选的图标标识
- `iconColor` (`z.string().optional()`): 可选的图标颜色
- `usedTemplate` (`z.string().optional()`): 可选的模板来源标识
- `defaultModel` (`z.string().default('')`): 默认模型名称，空字符串默认值
- `sonnetModel` (`z.string().default('')`): Sonnet 系列模型名称
- `opusModel` (`z.string().default('')`): Opus 系列模型名称
- `haikuModel` (`z.string().default('')`): Haiku 系列模型名称
- `enabled` (`z.boolean().default(true)`): 是否启用，默认 true
- `createdAt` (`z.string()`): 创建时间 ISO 字符串，必填
- `updatedAt` (`z.string().optional()`): 最后更新时间 ISO 字符串

**Core Logic**:
模型字段（defaultModel/sonnetModel/opusModel/haikuModel）使用 `.default('')` 而非 `.optional()`，这意味着即使 JSON 文件中缺少这些字段，safeParse 也会自动填充空字符串。`enabled` 字段同样使用 `.default(true)`，确保旧数据中没有此字段时默认启用。这些 default 值在 `StoreDataSchema.safeParse()` 解析整个 store 数据时会自动生效。

**Core Code**:
```typescript
export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
  usedTemplate: z.string().optional(),
  defaultModel: z.string().default(''),
  sonnetModel: z.string().default(''),
  opusModel: z.string().default(''),
  haikuModel: z.string().default(''),
  enabled: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
```
Source: `src/server/providers-store.ts`:29-46

**Usage Example**:
```typescript
import { ProviderSchema, type Provider } from './providers-store.js';

// 校验一个 provider 对象
const raw = JSON.parse('{"id":"uuid-123","name":"My Provider","createdAt":"2026-01-01T00:00:00Z"}');
const result = ProviderSchema.safeParse(raw);
if (result.success) {
  // result.data 中 defaultModel、sonnetModel 等字段会被自动填充为空字符串
  console.log(result.data.defaultModel); // ""
  console.log(result.data.enabled);       // true
}
```
Explanation: 对一个只包含必填字段的原始对象进行 safeParse，缺少的模型字段会被 Zod 的 `.default('')` 自动填充，`enabled` 字段被填充为 `true`。

---

### `StoreDataSchema` (Zod Schema)

**Source**: `src/server/providers-store.ts`:52-58

**Functionality**: 定义整个 `providers.json` 文件的顶层数据结构。该 schema 描述了存储文件的完整形态：全局配置标志（活动 provider、代理开关、Claude 设置守卫、语言偏好）加上 provider 数组。所有字段均为必填但通过 `.nullable().default()` 实现了向后兼容。

**Schema 字段**:
- `activeProviderId` (`z.string().nullable()`): 当前激活的 provider ID，null 表示未设置
- `enableFurinaProxy` (`z.boolean().nullable().default(false)`): 是否启用 Furina 代理，默认 false
- `neverClaudeSettings` (`z.boolean().nullable().default(true)`): Claude 设置备份守卫标志，默认 true
- `language` (`z.enum(['chinese', 'english']).nullable().default('chinese')`) UI 语言设置，默认 'chinese'
- `providers` (`z.array(ProviderSchema)`): Provider 对象数组

**Core Logic**:
所有全局配置标志使用 `.nullable().default()` 模式，允许值为 null（旧数据兼容）同时提供非 null 的默认值。这种设计确保了：当旧版本的 providers.json 缺少某个新字段时，safeParse 会自动填充默认值而不是报错。`language` 字段使用 `z.enum(['chinese', 'english'])` 限制取值范围。

**Core Code**:
```typescript
const StoreDataSchema = z.object({
  activeProviderId: z.string().nullable(),
  enableFurinaProxy: z.boolean().nullable().default(false),
  neverClaudeSettings: z.boolean().nullable().default(true),
  language: z.enum(['chinese', 'english']).nullable().default('chinese'),
  providers: z.array(ProviderSchema),
});
```
Source: `src/server/providers-store.ts`:52-58

**Usage Example**:
```typescript
// 解析一个旧版本的 providers.json（缺少 language 和 neverClaudeSettings 字段）
const oldData = { activeProviderId: null, providers: [] };
const result = StoreDataSchema.safeParse(oldData);
if (result.success) {
  console.log(result.data.language);            // "chinese" (default)
  console.log(result.data.enableFurinaProxy); // false (default)
  console.log(result.data.neverClaudeSettings);   // true (default)
}
```
Explanation: 即使旧数据中缺少 `language`、`enableFurinaProxy`、`neverClaudeSettings` 字段，Zod 的 default 值机制会自动填充安全的默认值，确保向后兼容。

---

### `ProviderInputSchema` (Zod Schema)

**Source**: `src/server/providers-store.ts`:64-78

**Functionality**: 定义创建新 provider 时客户端提交的输入数据结构。与 `ProviderSchema` 的区别在于：不含服务端生成的字段（id、createdAt、updatedAt），且 name 和 apiKey 为必填项。该 schema 用于 API 层的输入校验，确保客户端提交的数据满足创建 provider 的最低要求。

**Schema 字段**:
- `name` (`z.string()`): Provider 名称，必填
- `apiKey` (`z.string()`): API 密钥，必填
- `defaultModel` (`z.string()`): 默认模型，必填
- `sonnetModel` (`z.string()`): Sonnet 模型，必填
- `opusModel` (`z.string()`): Opus 模型，必填
- `haikuModel` (`z.string()`): Haiku 模型，必填
- `notes` (`z.string().optional()`): 可选备注
- `websiteUrl` (`z.string().optional()`): 可选网站 URL
- `baseUrl` (`z.string().optional()`): 可选 API 基础 URL
- `icon` (`z.string().optional()`): 可选图标
- `iconColor` (`z.string().optional()`): 可选图标颜色
- `usedTemplate` (`z.string().optional()`): 可选模板来源
- `enabled` (`z.boolean().default(true)`): 是否启用，默认 true

**Core Logic**:
与 `ProviderSchema` 相比，`ProviderInputSchema` 的模型字段（defaultModel/sonnetModel/opusModel/haikuModel）没有 `.default('')`，而是必填的 `z.string()`。这意味着创建 provider 时必须显式提供所有模型名称，不允许省略。`apiKey` 也是必填的（而在 `ProviderSchema` 中是 optional），因为创建时必须提供密钥。

**Core Code**:
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
```
Source: `src/server/providers-store.ts`:64-78

**Usage Example**:
```typescript
import { ProviderInputSchema } from './providers-store.js';

// API 路由中校验客户端请求体
const input = req.body;
const result = ProviderInputSchema.safeParse(input);
if (!result.success) {
  return res.status(400).json({ error: result.error.flatten() });
}
// result.data 已校验通过，可以直接传给 createProvider()
```
Explanation: 在 API 路由处理器中，使用 ProviderInputSchema 对客户端提交的请求体进行校验，确保所有必填字段都已提供，然后将校验后的数据传递给 `createProvider()` 函数。

---

### `ProviderUpdateSchema` (Zod Schema)

**Source**: `src/server/providers-store.ts`:84-97

**Functionality**: 定义更新现有 provider 时客户端提交的部分更新数据结构。所有字段均为 optional，允许客户端只提交需要修改的字段。该 schema 不包含 `id`（id 通过 URL 路径参数传递）和 `createdAt`/`updatedAt`（服务端管理），也不包含 `usedTemplate`（模板来源在创建后不可修改）。

**Schema 字段**:
- `name` (`z.string().optional()`): 可选的新名称
- `apiKey` (`z.string().optional()`): 可选的新 API 密钥
- `defaultModel` (`z.string().optional()`): 可选的新默认模型
- `sonnetModel` (`z.string().optional()`): 可选的新 Sonnet 模型
- `opusModel` (`z.string().optional()`): 可选的新 Opus 模型
- `haikuModel` (`z.string().optional()`): 可选的新 Haiku 模型
- `notes` (`z.string().optional()`): 可选的新备注
- `websiteUrl` (`z.string().optional()`): 可选的新网站 URL
- `baseUrl` (`z.string().optional()`): 可选的新 API 基础 URL
- `icon` (`z.string().optional()`): 可选的新图标
- `iconColor` (`z.string().optional()`): 可选的新图标颜色
- `enabled` (`z.boolean().optional()`): 可选的新启用状态

**Core Logic**:
所有字段均为 optional，支持部分更新语义。在 `updateProvider()` 中，update 对象通过展开运算符 `{ ...existing, ...update }` 与现有 provider 合并，只有提交的字段会覆盖原有值。注意此 schema 不包含 `usedTemplate` 字段，这意味着模板来源在创建后不可通过更新接口修改。

**Core Code**:
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
```
Source: `src/server/providers-store.ts`:84-97

**Usage Example**:
```typescript
import { ProviderUpdateSchema } from './providers-store.js';

// API 路由中校验更新请求体
const update = req.body;
const result = ProviderUpdateSchema.safeParse(update);
if (!result.success) {
  return res.status(400).json({ error: result.error.flatten() });
}
// result.data 只包含客户端实际提交的字段
// 例如 { name: "New Name" } 只更新名称
```
Explanation: 客户端可以只提交部分字段进行更新，ProviderUpdateSchema 确保提交的字段类型正确，未提交的字段不影响原有数据。

---

### `readStoreData() -> StoreData`

**Source**: `src/server/providers-store.ts`:124-141

**Functionality**: 从 `~/.furina/providers.json` 文件读取并解析全部 store 数据。这是整个 providers-store 子模块最核心的读操作，所有上层函数（loadProviders、getActiveProviderId、getLanguage 等）都依赖此函数获取当前数据。该函数实现了三层容错机制：文件不存在返回默认数据、Zod 校验失败返回默认数据、文件读取/解析异常返回默认数据。

**Parameters**: 无参数

**Return Value**:
- `StoreData`: 经过 Zod safeParse 校验后的 store 数据对象
- 在任何异常情况下（文件不存在、数据损坏、解析失败），均返回安全的默认数据副本

**Core Logic**:
函数内部实现了一个三层防御体系：

1. **文件存在性检查**：使用 `fs.existsSync()` 检查 `PROVIDERS_FILE` 是否存在。如果文件不存在，直接返回 DEFAULT_STORE_DATA 的浅拷贝（使用展开运算符确保每次返回独立对象）。

2. **数据解析与校验**：文件存在时，使用 `fs.readFileSync()` 同步读取文件内容，`JSON.parse()` 解析为 JavaScript 对象，然后通过 `StoreDataSchema.safeParse()` 进行 Zod 校验。safeParse 的优势在于不会抛出异常，而是返回 `{ success: true, data }` 或 `{ success: false, error }` 的结果对象。校验成功时返回 `result.data`（已自动填充 default 值），校验失败时记录 warn 日志并返回默认数据。

3. **异常捕获**：整个读取和解析过程包裹在 try-catch 中，捕获任何未预料的异常（如权限错误、磁盘 I/O 错误），记录 error 日志后返回默认数据。

**Core Code**:
```typescript
function readStoreData(): StoreData {
  if (!fs.existsSync(PROVIDERS_FILE)) {
    return { ...DEFAULT_STORE_DATA, activeProviderId: null, providers: [] };
  }
  try {
    const raw = fs.readFileSync(PROVIDERS_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    const result = StoreDataSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn('providers.json contains invalid data, returning defaults');
      return { ...DEFAULT_STORE_DATA, activeProviderId: null, providers: [] };
    }
    return result.data;
  } catch (err) {
    logger.error(`Failed to read providers.json: ${err instanceof Error ? err.message : String(err)}`);
    return { ...DEFAULT_STORE_DATA, activeProviderId: null, providers: [] };
  }
}
```
Source: `src/server/providers-store.ts`:124-141

**Usage Example**:
```typescript
// readStoreData 是内部函数，不直接导出
// 上层函数通过它读取数据：
function loadProviders(): Provider[] {
  return readStoreData().providers;
}

function getActiveProviderId(): string | null {
  return readStoreData().activeProviderId;
}

function getLanguage(): 'chinese' | 'english' {
  return readStoreData().language ?? 'chinese';
}
```
Explanation: `readStoreData()` 是一个模块内部函数（非导出），所有需要读取 store 数据的公开函数都通过它获取最新数据。每次调用都会重新从文件读取，确保获取到最新的数据状态。

---

### `writeStoreData(data: StoreData) -> void`

**Source**: `src/server/providers-store.ts`:147-152

**Functionality**: 将 store 数据对象序列化为格式化的 JSON 并写入 `~/.furina/providers.json` 文件。这是整个 providers-store 子模块唯一的写操作原语，所有上层修改操作（saveProviders、setActiveProviderId、setLanguage 等）都依赖此函数持久化数据。函数在写入前自动检查并创建数据目录。

**Parameters**:
- `data` (`StoreData`): 要持久化的 store 数据对象，结构必须符合 StoreDataSchema

**Return Value**: `void`

**Core Logic**:
1. **目录存在性检查**：使用 `fs.existsSync()` 检查 `DATA_DIR`（`~/.furina/`）是否存在，不存在则使用 `fs.mkdirSync()` 递归创建
2. **序列化写入**：使用 `JSON.stringify(data, null, 2)` 将数据格式化为缩进 2 空格的 JSON 字符串，然后通过 `fs.writeFileSync()` 同步写入文件。缩进格式便于用户手动查看和编辑 providers.json 文件

**Core Code**:
```typescript
function writeStoreData(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
```
Source: `src/server/providers-store.ts`:147-152

**Usage Example**:
```typescript
// writeStoreData 是内部函数，不直接导出
// 上层函数通过它写入数据：
function saveProviders(providers: Provider[]): void {
  const data = readStoreData();    // 读取当前完整数据
  data.providers = providers;       // 修改 providers 数组
  writeStoreData(data);             // 写回文件（保留 activeProviderId 等字段）
}

function setLanguage(value: 'chinese' | 'english'): void {
  const data = readStoreData();    // 读取当前完整数据
  data.language = value;            // 修改 language 字段
  writeStoreData(data);             // 写回文件
}
```
Explanation: `writeStoreData()` 采用 read-modify-write 模式的"write"端。上层函数先通过 `readStoreData()` 读取完整数据，修改目标字段后调用 `writeStoreData()` 写回，确保不会丢失其他字段的数据。

---

### `ensureProvidersFile() -> void`

**Source**: `src/server/providers-store.ts`:158-166

**Functionality**: 确保 `~/.furina/providers.json` 文件存在。如果文件不存在，则创建目录并写入默认的 store 数据。这是应用启动时的初始化入口函数，在服务端启动流程中被调用，确保后续所有读操作不会因文件缺失而返回空数据（虽然 readStoreData 也能处理文件不存在的情况，但 ensureProvidersFile 提供了主动创建的语义）。

**Parameters**: 无参数

**Return Value**: `void`

**Core Logic**:
1. 检查 `DATA_DIR` 是否存在，不存在则递归创建
2. 检查 `PROVIDERS_FILE` 是否存在，不存在则调用 `writeStoreData(DEFAULT_STORE_DATA)` 写入默认数据，并记录 info 日志
3. 如果文件已存在，函数直接返回，不做任何操作（幂等性）

**Core Code**:
```typescript
export function ensureProvidersFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROVIDERS_FILE)) {
    writeStoreData(DEFAULT_STORE_DATA);
    logger.info('Created providers.json with sample data');
  }
}
```
Source: `src/server/providers-store.ts`:158-166

**Usage Example**:
```typescript
import { ensureProvidersFile } from './providers-store.js';

// 服务启动时调用
function startServer() {
  ensureProvidersFile(); // 确保数据文件存在
  // ... 启动 Express 服务器
}
```
Explanation: 在服务启动的初始化阶段调用 `ensureProvidersFile()`，确保 `~/.furina/` 目录和 `providers.json` 文件都已创建。后续的 API 操作可以安全地读取数据文件。

## Data Structures

### `Provider` (Type)
```typescript
export type Provider = z.infer<typeof ProviderSchema>;
```
从 `ProviderSchema` 推导出的 TypeScript 类型，包含以下字段：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | `string` | - | 唯一标识符（UUID） |
| `name` | `string` | - | Provider 名称 |
| `notes` | `string \| undefined` | - | 可选备注 |
| `websiteUrl` | `string \| undefined` | - | 可选网站 URL |
| `apiKey` | `string \| undefined` | - | 可选 API 密钥 |
| `baseUrl` | `string \| undefined` | - | 可选 API 基础 URL |
| `icon` | `string \| undefined` | - | 可选图标 |
| `iconColor` | `string \| undefined` | - | 可选图标颜色 |
| `usedTemplate` | `string \| undefined` | - | 可选模板来源 |
| `defaultModel` | `string` | `''` | 默认模型名称 |
| `sonnetModel` | `string` | `''` | Sonnet 模型名称 |
| `opusModel` | `string` | `''` | Opus 模型名称 |
| `haikuModel` | `string` | `''` | Haiku 模型名称 |
| `enabled` | `boolean` | `true` | 是否启用 |
| `createdAt` | `string` | - | 创建时间 ISO 字符串 |
| `updatedAt` | `string \| undefined` | - | 最后更新时间 |

---

### `StoreData` (Type)
```typescript
type StoreData = z.infer<typeof StoreDataSchema>;
```
从 `StoreDataSchema` 推导出的 TypeScript 类型，描述整个 providers.json 文件的结构：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `activeProviderId` | `string \| null` | - | 当前激活的 provider ID |
| `enableFurinaProxy` | `boolean \| null` | `false` | 是否启用 Furina 代理 |
| `neverClaudeSettings` | `boolean \| null` | `true` | Claude 设置备份守卫 |
| `language` | `'chinese' \| 'english' \| null` | `'chinese'` | UI 语言 |
| `providers` | `Provider[]` | - | Provider 对象数组 |

---

### `ProviderInput` (Type)
```typescript
export type ProviderInput = z.infer<typeof ProviderInputSchema>;
```
从 `ProviderInputSchema` 推导出的创建输入类型。与 `Provider` 的区别：不含 `id`、`createdAt`、`updatedAt`，模型字段和 `apiKey` 为必填。

---

### `ProviderUpdate` (Type)
```typescript
export type ProviderUpdate = z.infer<typeof ProviderUpdateSchema>;
```
从 `ProviderUpdateSchema` 推导出的更新输入类型。所有字段均为 optional，支持部分更新。不含 `id`、`createdAt`、`updatedAt`、`usedTemplate`。

---

### `DEFAULT_STORE_DATA` (常量)
```typescript
const DEFAULT_STORE_DATA: StoreData = {
  activeProviderId: null,
  enableFurinaProxy: false,
  neverClaudeSettings: true,
  language: 'chinese',
  providers: [],
};
```
- `activeProviderId`: `null`，无默认激活 provider
- `enableFurinaProxy`: `false`，默认关闭代理
- `neverClaudeSettings`: `true`，默认启用 Claude 设置备份守卫
- `language`: `'chinese'`，默认中文
- `providers`: `[]`，空 provider 数组

---

### `DATA_DIR` / `PROVIDERS_FILE` (常量)
```typescript
const DATA_DIR = path.join(os.homedir(), '.furina');
const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json');
```
- `DATA_DIR`: 数据存储目录，位于用户主目录下的 `.furina` 文件夹
- `PROVIDERS_FILE`: providers JSON 文件的完整路径

## Error Handling and Edge Cases

**容错策略**：`readStoreData()` 实现了全面的容错机制，确保在任何异常情况下都不会抛出异常，而是返回安全的默认数据。

| 异常场景 | 处理方式 | 日志 |
|----------|----------|------|
| providers.json 文件不存在 | 返回 `DEFAULT_STORE_DATA` 浅拷贝 | 无 |
| 文件内容不是合法 JSON | `JSON.parse` 抛异常，被 catch 捕获，返回默认数据 | `logger.error` |
| JSON 结构不符合 StoreDataSchema | `safeParse` 返回 `success: false`，返回默认数据 | `logger.warn` |
| 文件读取权限错误 | `readFileSync` 抛异常，被 catch 捕获，返回默认数据 | `logger.error` |
| 数据目录不存在 | `writeStoreData` 和 `ensureProvidersFile` 均会递归创建目录 | 无 |

**边界条件**：
- 默认数据返回值使用 `{ ...DEFAULT_STORE_DATA, activeProviderId: null, providers: [] }` 浅拷贝，避免多个调用者共享同一个对象引用导致意外修改
- `writeStoreData` 不对传入数据做校验，依赖调用者确保数据结构正确。这是有意为之——上层函数通过 read-modify-write 模式保证数据完整性
- `ensureProvidersFile` 是幂等的，多次调用不会覆盖已存在的文件

## Dependencies

- **Depends on**:
  - `zod`（npm 包）：运行时 schema 校验库，提供 `z.object()`、`safeParse()`、`.default()` 等 API
  - `fs`（Node.js 内置模块）：同步文件操作，`existsSync`、`readFileSync`、`writeFileSync`、`mkdirSync`
  - `os`（Node.js 内置模块）：`os.homedir()` 获取用户主目录路径
  - `path`（Node.js 内置模块）：`path.join()` 拼接文件路径
  - `../utils/logger.js`：共享日志工具，提供 `logger.warn()` 和 `logger.error()` 方法

- **Depended by**:
  - `spec-provider-crud.md`：provider CRUD 操作依赖 `readStoreData()` 和 `writeStoreData()` 实现数据持久化
  - `spec-active-provider.md`：活动 provider 管理依赖底层文件操作
  - `spec-store-settings.md`：设置标志的读写依赖底层文件操作
  - `spec-provider-query.md`：查询操作依赖 `readStoreData()` 获取 provider 数据
  - `src/server/routes/providers.ts`：API 路由使用 `ProviderInputSchema` 和 `ProviderUpdateSchema` 校验请求体
  - `src/server/routes/config.ts`：配置路由调用 `getLanguage()`/`setLanguage()`
  - `src/server/anthropic/handler.ts`：代理处理器使用 `getDefaultProvider()` 和 `Provider` 类型
  - `src/utils/session.ts`：会话管理使用 `getDefaultProvider()`、`getProviderByModels()` 和 `Provider` 类型
  - `src/commands/agents.ts`、`src/commands/enable.ts`、`src/commands/disable.ts`：CLI 命令使用各类 store 函数
  - `src/client/` 下多个 React 组件：使用 `Provider` 类型定义 props

## Usage Examples

### 完整的初始化与数据读写流程

```typescript
import {
  ensureProvidersFile,
  type Provider,
  type ProviderInput,
} from './providers-store.js';

// 步骤 1：应用启动时确保数据文件存在
ensureProvidersFile();
// 如果 ~/.furina/providers.json 不存在，会创建默认文件：
// {
//   "activeProviderId": null,
//   "enableFurinaProxy": false,
//   "neverClaudeSettings": true,
//   "language": "chinese",
//   "providers": []
// }

// 步骤 2：通过上层 CRUD 函数创建 provider
const input: ProviderInput = {
  name: 'My Claude Provider',
  apiKey: 'sk-ant-api-key-xxx',
  defaultModel: 'claude-sonnet-4-20250514',
  sonnetModel: 'claude-sonnet-4-20250514',
  opusModel: 'claude-opus-4-20250514',
  haikuModel: 'claude-haiku-35-20241022',
  baseUrl: 'https://api.anthropic.com',
  enabled: true,
};
// createProvider() 内部调用 readStoreData() + writeStoreData()
// 新 provider 会被添加到 providers 数组中

// 步骤 3：通过上层查询函数读取数据
// loadProviders() 内部调用 readStoreData()
// 返回经过 Zod 校验的数据，所有字段类型安全
```
Explanation: 此示例展示了从文件初始化到数据创建再到数据查询的完整流程。`ensureProvidersFile()` 保证文件存在，上层 CRUD 函数通过 `readStoreData()` 和 `writeStoreData()` 实现 read-modify-write 模式，Zod schema 在读取时自动校验并填充默认值。

### Zod Schema 校验与向后兼容

```typescript
import { ProviderSchema, StoreDataSchema } from './providers-store.js';

// 场景 1：旧版本数据缺少新字段
const legacyProvider = {
  id: 'uuid-1',
  name: 'Old Provider',
  apiKey: 'sk-xxx',
  createdAt: '2026-01-01T00:00:00Z',
  // 缺少 defaultModel, sonnetModel, opusModel, haikuModel, enabled
};
const result1 = ProviderSchema.safeParse(legacyProvider);
// result1.success === true
// result1.data.defaultModel === ''  (Zod default)
// result1.data.enabled === true     (Zod default)

// 场景 2：旧版本 store 文件缺少新的全局字段
const legacyStore = {
  activeProviderId: null,
  providers: [],
  // 缺少 enableFurinaProxy, neverClaudeSettings, language
};
const result2 = StoreDataSchema.safeParse(legacyStore);
// result2.success === true
// result2.data.enableFurinaProxy === false    (Zod default)
// result2.data.neverClaudeSettings === true        (Zod default)
// result2.data.language === 'chinese'              (Zod default)

// 场景 3：schema 校验失败的情况
const invalidData = { activeProviderId: 123, providers: 'not-array' };
const result3 = StoreDataSchema.safeParse(invalidData);
// result3.success === false
// readStoreData() 会记录 warn 日志并返回默认数据
```
Explanation: 此示例演示了 Zod schema 的三个关键场景：旧数据缺少新字段时自动填充默认值（向后兼容）、全局配置字段缺失时自动填充、以及数据结构完全错误时的校验失败处理。这种设计确保了 providers.json 在应用升级时不需要数据迁移。
