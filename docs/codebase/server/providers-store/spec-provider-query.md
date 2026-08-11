# Provider Query Operations

> Source files:
> - `src/server/providers-store.ts` : 418-467

## Overview

Provider Query Operations 提供两个只读查询函数，用于从 `~/.furina/providers.json` 持久化存储中查找和解析 Provider 对象。

**在系统中的定位**：这两个函数位于 `providers-store` 子模块的查询层，与 CRUD 操作和设置标志并列，是上层业务获取 Provider 信息的核心入口。它们不修改存储数据，只读取并返回 Provider 对象引用。

**设计动机**：系统需要在多种场景中解析"当前应该使用哪个 Provider"以及"某个模型名称属于哪个 Provider"。这两个问题分别是：
- **默认 Provider 解析**：用户未显式指定 Provider 时，需要一个可靠的回退链（activeProvider -> 第一个 enabled Provider -> null）。
- **模型到 Provider 的反查**：代理请求和 CLI 命令中，客户端传入的是模型名称（如 `claude-sonnet-4-20250514`），需要反查到对应的 Provider 配置以获取 API key、baseUrl 等信息。

**使用场景**：
- Anthropic API 代理 handler 在处理请求时调用 `getDefaultProvider()` 获取默认 Provider 作为兜底。
- `session.ts` 中的 `getProviderBySessionId()` 在会话未配置特定模型或配置为 "default" 时调用 `getDefaultProvider()`，在配置了特定模型时调用 `getProviderByModels()` 进行反查。
- CLI 命令 `agents.ts` 中的 `validateSwitchProviders()` 调用 `getProviderByModels()` 验证模型名称是否有效；`resolveModelValue()` 和 `runAgentsShow()` 调用 `getDefaultProvider()` 将 "default" 解析为实际模型名称。

**涉及的源文件及职责**：
- `src/server/providers-store.ts`（418-467 行）：定义 `getDefaultProvider()`、`getProviderByModels()` 及常量 `MODEL_FIELDS`。
- `src/server/providers-store.ts`（1-174 行）：提供底层依赖 — `readStoreData()`、`loadProviders()`、`ProviderSchema`、`StoreDataSchema`。
- `src/utils/session.ts`：上游调用者，通过 `getProviderBySessionId()` 桥接会话级 Provider 解析。
- `src/server/anthropic/handler.ts`：上游调用者，代理请求处理中获取默认 Provider。
- `src/commands/agents.ts`：上游调用者，CLI agents 命令中的模型验证和解析。

## Architecture / Flow

Provider 查询操作的调用链路如下：

```
上层调用者 (session.ts / handler.ts / agents.ts)
    │
    ├─ getDefaultProvider()
    │      │
    │      └─ readStoreData()              ← 读取 providers.json 并 Zod 校验
    │           │
    │           ├─ 有 activeProviderId?
    │           │    ├─ 是 → 查找匹配 Provider 且 enabled ≠ false?
    │           │    │       ├─ 是 → 返回该 Provider
    │           │    │       └─ 否 → 进入 fallback
    │           │    └─ 否 → 进入 fallback
    │           └─ fallback → 返回第一个 enabled ≠ false 的 Provider，或 null
    │
    └─ getProviderByModels(models[])
           │
           ├─ loadProviders()              ← readStoreData().providers
           ├─ filter enabled ≠ false       ← 只搜索已启用的 Provider
           └─ 三重循环匹配：
                  for model in models:
                    for provider in enabledProviders:
                      for field in [defaultModel, sonnetModel, opusModel, haikuModel]:
                        if provider[field] === model → 匹配成功
```

**关键设计决策**：
- 两个函数均使用 `enabled !== false` 而非 `enabled === true` 进行过滤，以兼容 `enabled` 字段缺失（undefined）的旧数据格式，此时视为已启用。
- `getDefaultProvider()` 使用 `readStoreData()` 直接访问完整 StoreData（获取 `activeProviderId`），而 `getProviderByModels()` 使用 `loadProviders()` 仅获取 providers 数组。
- 匹配采用"先到先得"策略：多个 Provider 配置相同模型名称时，返回 Provider 数组中第一个匹配的。

## Functionality / Interface Details

### `getDefaultProvider() -> Provider | null`

**Source**: `src/server/providers-store.ts` : 427-434

**Functionality**: 获取系统默认 Provider。这是 Provider 解析的核心兜底函数。当上层代码不确定应该使用哪个 Provider 时（例如会话未配置特定 Provider、代理请求无元数据指定），都调用此函数。它实现了一个两级回退策略：首先尝试使用用户手动设置的 `activeProviderId`；如果该 ID 未设置、对应的 Provider 不存在、或该 Provider 已被禁用，则回退到 Provider 数组中第一个处于启用状态的 Provider；如果没有任何 Provider 存在或所有 Provider 均被禁用，返回 `null`。

**Parameters**: 无参数。

**Return Value**:
- `Provider | null`: 匹配的 Provider 对象，或 `null`（当无可用 Provider 时）。
- 当返回非 null 时，保证 `provider.enabled !== false`。
- 注意：返回的 Provider 对象是 `readStoreData()` 返回的数据中的引用，不是深拷贝。

**Core Logic**:

函数执行以下步骤：
1. 调用 `readStoreData()` 读取并解析 `providers.json` 文件，获取包含 `activeProviderId` 和 `providers` 数组的完整 StoreData 对象。
2. 检查 `data.activeProviderId` 是否非 null。
3. 如果非 null，在 `data.providers` 数组中查找 `id` 匹配的 Provider。若找到且 `enabled !== false`，直接返回该 Provider。
4. 如果 `activeProviderId` 为 null，或未找到匹配的 Provider，或匹配的 Provider 被禁用，则进入 fallback 逻辑：使用 `Array.find()` 返回 Provider 数组中第一个 `enabled !== false` 的 Provider。
5. 如果没有任何 Provider 满足条件，返回 `null`。

注意：当 `activeProviderId` 指向的 Provider 存在但被禁用时，函数不会返回该 Provider，而是 fallback 到第一个启用的 Provider。这意味着即使用户手动设置了 active provider，一旦该 provider 被禁用（通过 `updateProvider()` 的级联逻辑），`getDefaultProvider()` 的行为会自动切换。

**Core Code**:
```typescript
export function getDefaultProvider(): Provider | null {
  const data = readStoreData();
  if (data.activeProviderId !== null) {
    const provider = data.providers.find((p) => p.id === data.activeProviderId);
    if (provider && provider.enabled !== false) return provider;
  }
  return data.providers.find((p) => p.enabled !== false) ?? null;
}
```
Source: `src/server/providers-store.ts`:427-434

**Usage Example**:
```typescript
import { getDefaultProvider } from '../server/providers-store.js';

// 场景 1: 代理请求中获取默认 Provider
const provider = getDefaultProvider();
if (!provider) {
  // 没有可用 Provider，返回 503 错误
  res.status(503).json({ error: 'No active provider configured' });
  return;
}
// 使用 provider.apiKey、provider.baseUrl 等字段发起上游请求

// 场景 2: 解析 "default" 模型名称
if (modelValue === 'default') {
  const defaultProvider = getDefaultProvider();
  if (defaultProvider) {
    return defaultProvider.defaultModel; // 实际的模型名称
  }
  return 'default';
}
```
Explanation: 场景 1 展示了代理 handler 中的典型用法 — 获取默认 Provider 作为请求转发的目标配置。场景 2 展示了 CLI 中将 "default" 字面量解析为实际模型名称的用法。

---

### `getProviderByModels(models: string[]) -> Record<string, Provider | null>`

**Source**: `src/server/providers-store.ts` : 446-466

**Functionality**: 批量模型名称反查函数。接受一个模型名称列表，返回每个模型名称到对应 Provider 的映射。搜索范围覆盖每个 Provider 的四个模型字段（`defaultModel`、`sonnetModel`、`opusModel`、`haikuModel`）。这是系统中将"模型名称"转换为"Provider 配置"的唯一正式途径，用于验证模型名称是否有效、以及获取模型所属 Provider 的连接信息。

**Parameters**:
- `models` (`string[]`): 待查找的模型名称数组。可以为空数组（返回空对象）。数组中的重复值不会导致额外匹配（但不影响正确性）。每个模型名称通过精确字符串匹配（`===`）与 Provider 的模型字段比较。

**Return Value**:
- `Record<string, Provider | null>`: 以输入的模型名称为 key 的映射。如果某个模型名称在任何已启用的 Provider 中都没有找到匹配，对应的 value 为 `null`。
- 返回的 Provider 对象来自 `loadProviders()` 返回的数组元素引用。
- 空输入数组返回空对象 `{}`。

**Core Logic**:

函数执行以下步骤：
1. 调用 `loadProviders()` 从 `providers.json` 读取所有 Provider 对象。
2. 使用 `filter(p => p.enabled !== false)` 过滤出已启用的 Provider 列表（`enabledProviders`）。
3. 初始化空结果对象 `result`。
4. 对 `models` 数组中的每个模型名称，进行三层嵌套搜索：
   - 外层：遍历每个模型名称
   - 中层：遍历每个已启用的 Provider
   - 内层：遍历 Provider 的四个模型字段（通过 `MODEL_FIELDS` 常量：`defaultModel`、`sonnetModel`、`opusModel`、`haikuModel`）
5. 使用精确字符串匹配（`===`）比较 `provider[field]` 与模型名称。
6. 一旦找到匹配，立即 `break` 退出中层和内层循环，确保每个模型名称只返回第一个匹配的 Provider（"先到先得"策略）。
7. 未找到匹配的模型名称在结果中映射为 `null`。

`MODEL_FIELDS` 常量定义为 `['defaultModel', 'sonnetModel', 'opusModel', 'haikuModel'] as const`，搜索顺序即为该数组的顺序。这意味着如果一个 Provider 在 `defaultModel` 和 `sonnetModel` 中配置了相同名称（虽然不太可能），`defaultModel` 会先被匹配到——但这不影响 Provider 归属结果。

**Core Code**:
```typescript
// Model field names used by getProviderByModels for matching
const MODEL_FIELDS = ['defaultModel', 'sonnetModel', 'opusModel', 'haikuModel'] as const;

export function getProviderByModels(models: string[]): Record<string, Provider | null> {
  const providers = loadProviders();
  const enabledProviders = providers.filter((p) => p.enabled !== false);
  const result: Record<string, Provider | null> = {};

  for (const model of models) {
    let found: Provider | null = null;
    for (const provider of enabledProviders) {
      for (const field of MODEL_FIELDS) {
        if (provider[field] === model) {
          found = provider;
          break;
        }
      }
      if (found) break;
    }
    result[model] = found;
  }

  return result;
}
```
Source: `src/server/providers-store.ts`:436-466

**Usage Example**:
```typescript
import { getProviderByModels } from '../server/providers-store.js';

// 场景 1: CLI 中验证 switchProviders 中的模型名称是否有效
const modelNames = Object.values(rawSwitchProviders).filter((v) => v !== 'default');
const providerByModels = getProviderByModels(modelNames);

for (const [stage, modelValue] of Object.entries(rawSwitchProviders)) {
  if (modelValue === 'default') {
    validated[stage] = 'default';
  } else if (providerByModels[modelValue] !== null) {
    validated[stage] = modelValue; // 模型有效，保留
  } else {
    validated[stage] = 'default'; // 模型无效，回退到 default
    logger.warn(`Model '${modelValue}' not found in providers, replaced with 'default'`);
  }
}

// 场景 2: 会话中解析特定模型到 Provider
const result = getProviderByModels([modelValue]);
const provider = result[modelValue]; // Provider 对象或 null
if (!provider) {
  return null; // 无法解析该模型
}
// 使用 provider.baseUrl、provider.apiKey 发起请求
```
Explanation: 场景 1 来自 `agents.ts` 的 `validateSwitchProviders()`，用于验证用户配置的 switchProviders 映射中的模型名称是否在某个已启用的 Provider 中存在。场景 2 来自 `session.ts` 的 `getProviderBySessionId()`，用于将会话配置的模型名称解析为对应的 Provider 对象。

---

### `MODEL_FIELDS` 常量

**Source**: `src/server/providers-store.ts` : 437

**Functionality**: `getProviderByModels()` 内部使用的模型字段名列表常量，定义了搜索 Provider 时需要检查的四个字段名。使用 `as const` 断言确保类型为只读元组 `readonly ['defaultModel', 'sonnetModel', 'opusModel', 'haikuModel']`，从而在 `provider[field]` 索引访问时获得正确的类型推断。

```typescript
const MODEL_FIELDS = ['defaultModel', 'sonnetModel', 'opusModel', 'haikuModel'] as const;
```

## Data Structures

### `Provider`

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
- `id` (`string`): Provider 唯一标识符（UUID v4 格式），由 `createProvider()` 生成。
- `name` (`string`): Provider 显示名称。
- `apiKey` (`string`, optional): 上游 API 密钥。
- `baseUrl` (`string`, optional): 上游 API 基础 URL。
- `defaultModel` (`string`): 默认模型名称，Zod 默认为 `''`。用于通用请求。
- `sonnetModel` (`string`): Sonnet 系列模型名称，Zod 默认为 `''`。用于中等复杂度任务。
- `opusModel` (`string`): Opus 系列模型名称，Zod 默认为 `''`。用于高复杂度任务。
- `haikuModel` (`string`): Haiku 系列模型名称，Zod 默认为 `''`。用于快速轻量任务。
- `enabled` (`boolean`): Provider 是否启用，Zod 默认为 `true`。禁用的 Provider 不参与查询。
- `createdAt` (`string`): 创建时间 ISO 8601 字符串。
- `updatedAt` (`string`, optional): 最后更新时间 ISO 8601 字符串。

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
- `activeProviderId` (`string | null`): 当前激活的 Provider ID。`getDefaultProvider()` 优先使用此字段。为 `null` 时回退到第一个启用的 Provider。
- `providers` (`Provider[]`): 所有 Provider 对象数组。查询操作的数据源。

## Error Handling and Edge Cases

### getDefaultProvider() 的边界条件

| 场景 | 行为 |
|------|------|
| `providers.json` 文件不存在 | `readStoreData()` 返回默认数据（空 providers 数组），函数返回 `null` |
| `providers.json` 文件内容非法（JSON 解析失败或 Zod 校验失败） | `readStoreData()` 返回默认数据，函数返回 `null` |
| `activeProviderId` 非 null，但对应的 Provider 不存在 | 跳过 active 逻辑，进入 fallback 返回第一个启用的 Provider |
| `activeProviderId` 指向的 Provider 存在但 `enabled === false` | 跳过该 Provider，进入 fallback 返回第一个启用的 Provider |
| 所有 Provider 均被禁用 | `Array.find()` 均返回 undefined，最终返回 `null` |
| Provider 数组为空 | 返回 `null` |
| Provider 的 `enabled` 字段为 `undefined`（旧数据） | `enabled !== false` 为 `true`，视为已启用 |

### getProviderByModels() 的边界条件

| 场景 | 行为 |
|------|------|
| `models` 为空数组 | 返回空对象 `{}` |
| 模型名称在所有已启用 Provider 中均无匹配 | 对应 key 映射为 `null` |
| 同一模型名称被多个 Provider 配置 | 返回 Provider 数组中第一个匹配的（先到先得） |
| 匹配的 Provider 被禁用（`enabled === false`） | 跳过该 Provider，继续搜索其他 Provider |
| Provider 的模型字段为 `''`（Zod 默认值） | 空字符串不会与实际模型名称匹配，不影响结果 |
| `providers.json` 文件不存在或损坏 | `loadProviders()` 返回空数组，所有模型均映射为 `null` |
| `models` 包含重复的模型名称 | 每个模型名称独立查询，重复值会产生冗余但正确的一致结果 |

## Dependencies

### Depends on

- **spec-store-schemas** (`spec-store-schemas.md`)：依赖 `readStoreData()` 读取和解析 `providers.json` 文件，依赖 `loadProviders()` 获取 Provider 数组。两个函数通过不同的底层函数访问存储数据 — `getDefaultProvider()` 需要 `activeProviderId` 字段因此使用 `readStoreData()`，`getProviderByModels()` 只需 Provider 列表因此使用 `loadProviders()`。
- **Node.js `fs` 模块**：通过 `readStoreData()` 间接依赖同步文件读取。
- **Zod**：通过 `readStoreData()` 间接依赖 Zod 进行 StoreData 反序列化校验。
- **`utils/logger`**：通过 `readStoreData()` 间接依赖 logger 记录文件读取错误和数据校验警告。

### Depended by

- **`src/utils/session.ts` → `getProviderBySessionId()`**：会话级 Provider 解析函数。当会话文件不存在、`currentProvider` 为 "default"、或 `switchProviders` 解析值为 "default"/`undefined` 时调用 `getDefaultProvider()`；当 `switchProviders` 解析出具体模型名称时调用 `getProviderByModels()` 进行反查。
- **`src/server/anthropic/handler.ts` → `proxyRequestHandler()`**：Anthropic API 代理请求处理入口。在请求处理开始时调用 `getDefaultProvider()` 获取默认 Provider 作为请求转发的兜底配置。如果返回 `null`，直接返回 503 错误。
- **`src/commands/agents.ts` → `validateSwitchProviders()`**：CLI agents 命令的模型名称验证函数。调用 `getProviderByModels()` 批量验证 switchProviders 映射中的模型名称是否在某个已启用 Provider 中存在，无效模型回退为 "default"。
- **`src/commands/agents.ts` → `resolveModelValue()`**：CLI 中将 "default" 解析为实际模型名称的函数。调用 `getDefaultProvider()` 获取 `defaultModel` 字段。
- **`src/commands/agents.ts` → `runAgentsShow()`**：CLI 中显示特定 stage 的模型名称。当 stage 为 "default" 时调用 `getDefaultProvider()` 解析。
- **`src/commands/agents.ts` → `runAgentsUse()`**：CLI 中切换 stage 的模型。当指定 "default" 时调用 `getDefaultProvider()` 解析实际模型名称。
- **spec-active-provider** (`spec-active-provider.md`)：`setActiveProviderId()` 和 `clearActiveProviderId()` 修改 `activeProviderId` 后，`getDefaultProvider()` 的行为随之改变。

## Usage Examples

### 完整场景：代理请求中的 Provider 解析

```typescript
import { getDefaultProvider, getProviderByModels } from '../server/providers-store.js';
import { getProviderBySessionId } from '../utils/session.js';

// 1. 代理请求处理 — 先获取默认 Provider 作为兜底
const defaultProvider = getDefaultProvider();
if (!defaultProvider) {
  res.status(503).json({ error: 'No active provider configured' });
  return;
}

// 2. 尝试从请求元数据中获取 sessionId，解析会话级 Provider
let provider = defaultProvider;
if (sessionId) {
  const sessionProvider = getProviderBySessionId(sessionId);
  if (sessionProvider) {
    provider = sessionProvider; // 会话级配置覆盖默认 Provider
  }
}

// 3. 使用解析到的 Provider 配置发起上游请求
const upstreamUrl = `${provider.baseUrl}/v1/messages`;
const headers = {
  'x-api-key': provider.apiKey,
  'anthropic-version': '2023-06-01',
};
```
Explanation: 这是 Anthropic API 代理 handler 中的典型 Provider 解析流程。先获取默认 Provider 确保系统有可用配置，再尝试通过 sessionId 获取更精确的 Provider（可能来自 `getProviderByModels` 的内部调用），最终使用解析结果配置上游请求。

### 完整场景：CLI agents 命令中的模型验证

```typescript
import { getProviderByModels, getDefaultProvider } from '../server/providers-store.js';

// 1. 验证用户配置的 switchProviders 映射
const rawSwitchProviders = {
  explore: 'claude-sonnet-4-20250514',
  code: 'claude-opus-4-20250514',
  review: 'invalid-model-name',
};

const modelNames = Object.values(rawSwitchProviders).filter((v) => v !== 'default');
const providerByModels = getProviderByModels(modelNames);
// 结果: {
//   'claude-sonnet-4-20250514': Provider 对象,
//   'claude-opus-4-20250514': Provider 对象,
//   'invalid-model-name': null
// }

// 2. 将无效模型替换为 'default'
const validated: Record<string, string> = {};
for (const [stage, modelValue] of Object.entries(rawSwitchProviders)) {
  if (modelValue === 'default') {
    validated[stage] = 'default';
  } else if (providerByModels[modelValue] !== null) {
    validated[stage] = modelValue;
  } else {
    validated[stage] = 'default';
    // review stage 的 'invalid-model-name' 被替换为 'default'
  }
}

// 3. 将 'default' 解析为实际模型名称
for (const [stage, modelValue] of Object.entries(validated)) {
  if (modelValue === 'default') {
    const defaultProvider = getDefaultProvider();
    const resolvedModel = defaultProvider?.defaultModel ?? 'default';
    // resolvedModel = 'test-default-model' (假设 active provider 的 defaultModel)
  }
}
```
Explanation: 这个场景展示了 CLI `agents` 命令中的完整工作流。首先通过 `getProviderByModels()` 批量验证模型名称的有效性，然后将无效模型回退为 "default"，最后通过 `getDefaultProvider()` 将 "default" 解析为实际模型名称。整个流程确保用户的 switchProviders 配置始终指向有效的 Provider 和模型。
