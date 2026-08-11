# Provider API Routes

> Source files:
> - `src/server/routes/providers.ts` : 1-587

## Overview

本 spec 文档详细描述 `/furina/api/providers` 路由模块的完整实现。该模块是 Furina Web UI 后端的核心 API 路由层，负责 LLM 提供商（Provider）的全生命周期管理，包括 CRUD 操作、活跃提供商选择与 Claude CLI 设置同步、代理模式切换、预设模板管理以及 API Key 有效性验证。

**在系统中的角色与定位**：`providersRouter` 是 Express Router 实例，由 `src/server/index.ts` 中的 `createApp()` 挂载到 `/furina/api/providers` 路径下。它作为 Web UI 前端与后端存储/设置层之间的 HTTP 接口层，将所有业务逻辑委托给 `providers-store`（数据持久化）和 `claude-settings`（Claude CLI 配置同步）两个下游模块。

**设计动机**：
- 提供商 CRUD 通过 RESTful 风格暴露给前端，前端 UI 可以管理多个 LLM 提供商配置
- 活跃提供商切换时自动同步 Claude CLI 的 `~/.claude/settings.json` 环境变量，实现无缝切换
- 代理模式（Furina Proxy）允许所有请求通过本地代理转发，直连模式则将提供商凭据直接写入 Claude 设置
- 首次写入 Claude 设置前进行备份（`neverClaudeSettings` 守卫），确保用户原始设置可恢复
- API Key 验证支持多种认证策略（`x-api-key`、`Authorization: Bearer`、裸 Authorization），兼容 Anthropic、OpenAI、DeepSeek、智谱等不同提供商格式

**涉及的源文件及其职责**：

| 文件 | 职责 |
|------|------|
| `src/server/routes/providers.ts` | 本模块核心：Express 路由定义、Zod 请求校验、业务编排（调用 store 和 settings 模块）、403 错误歧义消解 |
| `src/server/providers-store.ts` | 提供商数据持久化存储（JSON 文件）、CRUD 操作、活跃提供商状态管理、全局设置标志 |
| `src/server/claude-settings.ts` | Claude CLI 设置文件读写、备份/恢复、环境变量对象生成（代理模式/直连模式） |
| `src/utils/provider-templates.ts` | 提供商预设模板的读取、新增、删除（JSON 资源文件） |
| `src/utils/logger.ts` | 全局日志工具，用于记录错误和警告 |

## Architecture / Flow

### 路由注册与请求处理流程

```
前端 UI
  │
  ▼
Express App (createApp)
  │
  ├── /furina/api/providers ──── providersRouter
  │     ├── GET  /                  → loadProviders + icon 解析
  │     ├── POST /                  → Zod 校验 → createProvider
  │     ├── PUT  /:id               → Zod 校验 → updateProvider → 条件同步 Claude 设置
  │     ├── DELETE /:id             → deleteProvider → 条件恢复 Claude 设置
  │     ├── GET  /active            → getActiveProviderId
  │     ├── PUT  /active            → Zod 校验 → setActiveProviderId → 同步 Claude 设置
  │     ├── GET  /proxy             → getEnableFurinaProxy
  │     ├── PUT  /proxy             → Zod 校验 → setEnableFurinaProxy → 同步/恢复 Claude 设置
  │     ├── PUT  /:id/enabled       → Zod 校验 → updateProvider(enabled) → 条件恢复/写入 Claude 设置
  │     ├── POST /reset             → restoreClaudeSettings → clearActiveProviderId
  │     ├── GET  /templates         → readProviderTemplates
  │     ├── POST /templates         → Zod 校验 → addProviderTemplate
  │     ├── DELETE /templates/:name → deleteProviderTemplate
  │     └── POST /validate          → Zod 校验 → 3 种认证策略尝试 → 403 歧义消解
  │
  └── 其他路由...
```

### Claude 设置同步决策树

当修改活跃提供商或代理状态时，路由需要决定如何同步 Claude CLI 设置：

```
操作类型判断:
  │
  ├── 设置活跃提供商 (PUT /active)
  │     ├── 代理开启 → writeEnvToClaudeSettings(getProxyEnv())
  │     └── 代理关闭 → writeEnvToClaudeSettings(getProviderEnv(provider))
  │
  ├── 切换代理模式 (PUT /proxy)
  │     ├── 开启代理 → ensureFirstWriteBackup → writeEnvToClaudeSettings(getProxyEnv())
  │     └── 关闭代理
  │           ├── 有活跃提供商 → writeEnvToClaudeSettings(getProviderEnv(activeProvider))
  │           └── 无活跃提供商 → restoreClaudeSettings()
  │
  ├── 切换提供商启用状态 (PUT /:id/enabled)
  │     └── 禁用且是当前活跃提供商
  │           ├── 代理关闭 → restoreClaudeSettings()
  │           └── 代理开启 → writeEnvToClaudeSettings(getProxyEnv())
  │
  ├── 更新提供商 (PUT /:id)
  │     └── 是当前活跃提供商且代理关闭 → writeEnvToClaudeSettings(getProviderEnv(provider))
  │
  └── 删除提供商 (DELETE /:id)
        └── 是当前活跃提供商且代理关闭 → restoreClaudeSettings()
```

### API Key 验证流程

```
POST /validate
  │
  ├── 请求体大小检查 (> 1KB → 413)
  ├── Zod 校验 (baseUrl + apiKey)
  │
  └── 依次尝试 3 种认证头组合:
        1. { 'x-api-key': apiKey }            → Anthropic 格式
        2. { 'authorization': Bearer apiKey }  → OpenAI/DeepSeek/智谱格式
        3. { 'authorization': apiKey }          → 裸 authorization
        │
        └── 每次请求 /v1/messages (5s 超时)
              │
              ├── 非 401/403 → 停止尝试
              └── 401/403 → 尝试下一组合
              │
              ▼
        最终响应状态码判断:
              ├── 200/400 → valid: true (key 有效)
              ├── 401     → valid: false (key 无效)
              ├── 403     → isUpstreamAuthError() 歧义消解
              │               ├── authentication_error → valid: false
              │               └── permission_error 等 → valid: true (key 有效但无模型权限)
              └── 其他     → valid: false (附带上游错误信息)
```

## Functionality / Interface Details

### `formatZodError(error) -> { error, details }`

**Source**: `src/server/routes/providers.ts` : 53-64

**功能描述**: 将 Zod 验证库产生的 `ZodError` 对象转换为标准化的 HTTP 错误响应体。所有需要 Zod 校验的路由都使用此函数统一格式化 400 响应，确保前端收到一致的错误结构。错误体包含顶层错误消息和字段级别的详细信息数组，每个详情项包含字段路径（以 `.` 连接）和具体错误描述。

**参数**:
- `error` (`{ issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }`): Zod 校验失败时的错误对象，包含 issues 数组，每个 issue 有 path（字段路径）和 message（错误描述）

**返回值**:
- `{ error: string; details: Array<{ field: string; message: string }> }`: 标准化错误响应体
  - `error`: 固定为 `'Validation failed'`
  - `details`: 每个字段错误的数组，`field` 为 `.` 分隔的字段路径，`message` 为错误描述

**核心逻辑**:
将 ZodError 的 issues 数组映射为前端可消费的结构。`path` 数组通过 `.map(String).join('.')` 转换为点分路径字符串，例如嵌套字段 `['config', 'baseUrl']` 变为 `'config.baseUrl'`。

**核心代码**:
```typescript
function formatZodError(error: { issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }): {
  error: string;
  details: Array<{ field: string; message: string }>;
} {
  return {
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}
```
Source: `src/server/routes/providers.ts` : 53-64

**使用示例**:
```typescript
const parsed = ProviderInputSchema.safeParse(req.body);
if (!parsed.success) {
  res.status(400).json(formatZodError(parsed.error));
  return;
}
```
解释: 在每个路由的 Zod 校验失败分支中调用，将验证错误转为 JSON 响应。

---

### `isUpstreamAuthError(data) -> boolean`

**Source**: `src/server/routes/providers.ts` : 77-100

**功能描述**: 判断上游 403 响应是否表示认证错误（无效/过期密钥）而非权限错误（密钥有效但无模型访问权限）。这是 API Key 验证端点的核心消歧逻辑。不同提供商使用不同的错误格式：Anthropic 返回 `{ type: "error", error: { type: "authentication_error" } }`，OpenAI 返回 `{ error: { type: "invalid_api_key" } }`，部分提供商在 message 字段中包含 `'invalid key'` 字样。

**参数**:
- `data` (`unknown`): 上游 403 响应的 body 数据

**返回值**:
- `boolean`: `true` 表示认证错误（密钥无效），`false` 表示权限错误（密钥有效但无资源访问权限）

**核心逻辑**:
1. `data` 为空或非对象 → 默认视为认证错误（返回 `true`）
2. 检查 Anthropic 错误格式：`body.type === 'error'` 且 `body.error.type === 'authentication_error'`
3. 检查 OpenAI 错误格式：`body.error.type === 'invalid_api_key'` 或 `'invalid_request_error'`
4. 检查字符串 message 是否同时包含 `'invalid'` 和 `'key'`
5. 以上均不匹配 → 默认视为非认证错误（返回 `false`，即密钥有效）

**核心代码**:
```typescript
function isUpstreamAuthError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return true;
  const body = data as Record<string, unknown>;
  if (body.type === 'error' && body.error && typeof body.error === 'object') {
    const errObj = body.error as Record<string, unknown>;
    return errObj.type === 'authentication_error';
  }
  if (body.error && typeof body.error === 'object') {
    const errObj = body.error as Record<string, unknown>;
    if (errObj.type === 'invalid_api_key' || errObj.type === 'invalid_request_error') {
      return true;
    }
  }
  if (typeof body.message === 'string') {
    const msg = body.message.toLowerCase();
    return msg.includes('invalid') && msg.includes('key');
  }
  return false;
}
```
Source: `src/server/routes/providers.ts` : 77-100

**使用示例**:
```typescript
// 在 validate 路由的 403 处理分支中
if (finalRes.status === 403) {
  const isAuthError = isUpstreamAuthError(finalRes.data);
  if (isAuthError) {
    res.status(200).json({ valid: false, error: 'Authentication failed: invalid API key' });
  } else {
    // Key accepted but model/resource not available — key is valid
    res.status(200).json({ valid: true, models: finalRes.data.data || [] });
  }
}
```
解释: 当上游返回 403 时，通过解析错误 body 区分"密钥无效"和"密钥有效但无权限"两种情况。

---

### `ensureFirstWriteBackup() -> void`

**Source**: `src/server/routes/providers.ts` : 111-116

**功能描述**: 实现 Claude 设置的首次写入备份守卫。当 `neverClaudeSettings` 标志为 `true` 时（表示从未写入过 Claude 设置），先备份当前 `~/.claude/settings.json` 到 `~/.furina/settings.bak.json`，然后将标志设为 `false` 以确保后续写入不再重复备份。这保护了用户在 Furina 之前配置的 Claude CLI 设置不被永久覆盖。

**参数**: 无

**返回值**: `void`

**核心逻辑**:
读取 `neverClaudeSettings` 标志（默认 `true`），若为 `true` 则执行备份并将标志置 `false`。该标志存储在 `providers.json` 中，因此持久化跨进程。

**核心代码**:
```typescript
function ensureFirstWriteBackup(): void {
  if (getNeverClaudeSettings()) {
    backupClaudeSettings();
    setNeverClaudeSettings(false);
  }
}
```
Source: `src/server/routes/providers.ts` : 111-116

**使用示例**:
```typescript
// 在 PUT /active 和 PUT /proxy 路由中调用
ensureFirstWriteBackup();
if (getEnableFurinaProxy()) {
  writeEnvToClaudeSettings(getProxyEnv());
} else {
  writeEnvToClaudeSettings(getProviderEnv(provider));
}
```
解释: 在首次修改 Claude 设置前自动备份，确保用户原始配置可恢复。

---

### `GET /furina/api/providers`

**Source**: `src/server/routes/providers.ts` : 127-154

**功能描述**: 返回所有已配置提供商的完整列表。除了直接返回存储数据外，还执行图标解析逻辑：对于没有显式 `icon` 字段的提供商，通过三级回退策略从模板系统中解析图标。

**参数**: 无（`_req` 被忽略）

**返回值**:
- `200 OK`: JSON 数组，每个元素为 `Provider` 对象（可能包含从模板解析的 `icon`）

**核心逻辑 - 图标三级回退**:
1. 提供商自身已有 `icon` → 直接返回
2. 提供商有 `usedTemplate` 字段 → 查找匹配模板，使用其 `iconSvg`
3. 名称派生回退：将提供商名称转小写去空格加 `.svg` 后缀 → 查找模板名称匹配或 `iconSvg` 值匹配

**核心代码**:
```typescript
providersRouter.get('/', (_req, res) => {
  const providers = loadProviders();
  const templates = readProviderTemplates();
  const resolved = providers.map((p) => {
    if (p.icon) return p;
    if (p.usedTemplate) {
      const template = templates.find((t) => t.name === p.usedTemplate);
      if (template?.iconSvg) {
        return { ...p, icon: template.iconSvg };
      }
    }
    const nameDerived = `${p.name.toLowerCase().replace(/\s+/g, '')}.svg`;
    const templateByName = templates.find((t) => t.name === p.name);
    if (templateByName?.iconSvg) {
      return { ...p, icon: templateByName.iconSvg };
    }
    for (const t of templates) {
      if (t.iconSvg === nameDerived) {
        return { ...p, icon: t.iconSvg };
      }
    }
    return p;
  });
  res.status(200).json(resolved);
});
```
Source: `src/server/routes/providers.ts` : 127-154

**使用示例**:
```http
GET /furina/api/providers
Response: 200
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Anthropic",
    "icon": "<svg>...</svg>",
    "baseUrl": "https://api.anthropic.com",
    "defaultModel": "claude-sonnet-4-20250514",
    "enabled": true,
    "createdAt": "2026-01-15T08:30:00.000Z"
  }
]
```
解释: 前端首次加载时调用，获取所有提供商列表及其图标以渲染 UI。

---

### `POST /furina/api/providers`

**Source**: `src/server/routes/providers.ts` : 210-227

**功能描述**: 创建新的提供商配置。使用 `ProviderInputSchema` 校验请求体，然后委托 `createProvider()` 执行实际创建（生成 UUID 和 `createdAt` 时间戳）。重复名称会返回 409 Conflict。

**参数**:
- 请求体: 符合 `ProviderInputSchema` 的 JSON 对象（详见数据结构章节）

**返回值**:
- `201 Created`: 完整的 `Provider` 对象（含服务端生成的 `id` 和 `createdAt`）
- `400 Bad Request`: Zod 校验失败，返回 `formatZodError` 格式的错误体
- `409 Conflict`: 提供商名称已存在
- `500 Internal Server Error`: 其他未知错误

**核心逻辑**:
1. Zod 校验请求体
2. 调用 `createProvider()` 创建提供商
3. 捕获错误时根据消息中是否包含 `'already exists'` 判断是 409 还是 500

**核心代码**:
```typescript
providersRouter.post('/', (req, res) => {
  const parsed = ProviderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    const provider = createProvider(parsed.data);
    res.status(201).json(provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});
```
Source: `src/server/routes/providers.ts` : 210-227

**使用示例**:
```http
POST /furina/api/providers
Content-Type: application/json

{
  "name": "OpenAI",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com",
  "defaultModel": "gpt-4o",
  "sonnetModel": "",
  "opusModel": "",
  "haikuModel": "gpt-4o-mini",
  "enabled": true
}
Response: 201
{
  "id": "generated-uuid",
  "name": "OpenAI",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com",
  "defaultModel": "gpt-4o",
  "sonnetModel": "",
  "opusModel": "",
  "haikuModel": "gpt-4o-mini",
  "enabled": true,
  "createdAt": "2026-01-15T08:30:00.000Z"
}
```
解释: 前端在提供商管理页面提交新提供商表单时调用。

---

### `PUT /furina/api/providers/:id`

**Source**: `src/server/routes/providers.ts` : 318-340

**功能描述**: 更新已有提供商的部分字段。使用 `ProviderUpdateSchema`（所有字段可选）校验请求体。当被更新的提供商是当前活跃提供商且代理模式关闭时，自动将更新后的提供商配置同步到 Claude CLI 设置。

**参数**:
- `:id` (路径参数, `string`): 要更新的提供商 UUID
- 请求体: 符合 `ProviderUpdateSchema` 的 JSON 对象（所有字段可选）

**返回值**:
- `200 OK`: 更新后的完整 `Provider` 对象
- `400 Bad Request`: Zod 校验失败
- `404 Not Found`: 提供商 ID 不存在
- `500 Internal Server Error`: Claude 设置同步失败

**核心逻辑**:
1. Zod 校验请求体
2. 调用 `updateProvider()` 执行部分更新
3. 判断条件：是否为活跃提供商 且 代理模式是否关闭
4. 条件满足时调用 `writeEnvToClaudeSettings(getProviderEnv(provider))` 同步环境变量

**核心代码**:
```typescript
providersRouter.put('/:id', (req, res) => {
  const parsed = ProviderUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  let provider;
  try {
    provider = updateProvider(req.params.id, parsed.data);
  } catch {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
    return;
  }
  try {
    if (getActiveProviderId() === req.params.id && !getEnableFurinaProxy()) {
      writeEnvToClaudeSettings(getProviderEnv(provider));
    }
    res.status(200).json(provider);
  } catch (err) {
    logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to sync Claude settings' });
  }
});
```
Source: `src/server/routes/providers.ts` : 318-340

**使用示例**:
```http
PUT /furina/api/providers/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "defaultModel": "claude-sonnet-4-20250514",
  "sonnetModel": "claude-sonnet-4-20250514"
}
Response: 200
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "sonnetModel": "claude-sonnet-4-20250514",
  "updatedAt": "2026-01-15T09:00:00.000Z"
  // ...其他字段不变
}
```
解释: 前端编辑提供商表单保存时调用。如果修改的是当前活跃提供商且未开启代理，Claude CLI 设置会自动同步。

---

### `DELETE /furina/api/providers/:id`

**Source**: `src/server/routes/providers.ts` : 371-383

**功能描述**: 删除指定提供商。如果被删除的提供商是当前活跃提供商且代理模式关闭，则从备份恢复 Claude CLI 设置到原始状态。删除操作由 `deleteProvider()` 执行，该函数内部也会清除活跃提供商引用（级联删除）。

**参数**:
- `:id` (路径参数, `string`): 要删除的提供商 UUID

**返回值**:
- `204 No Content`: 删除成功
- `404 Not Found`: 提供商 ID 不存在

**核心逻辑**:
1. 记录当前活跃提供商状态（`wasActive`）和代理状态（`proxyDisabled`）
2. 调用 `deleteProvider()` 删除提供商
3. 若删除的提供商是活跃提供商且代理未开启 → 调用 `restoreClaudeSettings()` 恢复原始设置

**核心代码**:
```typescript
providersRouter.delete('/:id', (req, res) => {
  const wasActive = getActiveProviderId() === req.params.id;
  const proxyDisabled = !getEnableFurinaProxy();
  const found = deleteProvider(req.params.id);
  if (!found) {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
    return;
  }
  if (wasActive && proxyDisabled) {
    restoreClaudeSettings();
  }
  res.status(204).send();
});
```
Source: `src/server/routes/providers.ts` : 371-383

**使用示例**:
```http
DELETE /furina/api/providers/550e8400-e29b-41d4-a716-446655440000
Response: 204
```
解释: 前端在提供商列表中点击删除按钮时调用。如果删除的是当前活跃提供商，Claude 设置会恢复到 Furina 之前的原始状态。

---

### `GET /furina/api/providers/active`

**Source**: `src/server/routes/providers.ts` : 160-163

**功能描述**: 获取当前活跃提供商的 ID。用于前端展示当前选中的提供商。

**参数**: 无

**返回值**:
- `200 OK`: `{ activeProviderId: string | null }`

**核心代码**:
```typescript
providersRouter.get('/active', (_req, res) => {
  const activeProviderId = getActiveProviderId();
  res.status(200).json({ activeProviderId });
});
```
Source: `src/server/routes/providers.ts` : 160-163

**使用示例**:
```http
GET /furina/api/providers/active
Response: 200
{ "activeProviderId": "550e8400-e29b-41d4-a716-446655440000" }
```
解释: 前端加载时获取当前活跃提供商 ID，用于高亮显示或表单默认值。

---

### `PUT /furina/api/providers/active`

**Source**: `src/server/routes/providers.ts` : 171-203

**功能描述**: 设置活跃提供商并同步 Claude CLI 设置。这是路由中最关键的操作之一：它将选定的提供商设为"活跃"，然后根据代理模式的状态决定写入何种环境变量到 `~/.claude/settings.json`。首次写入前会触发 `ensureFirstWriteBackup()` 进行备份。

**参数**:
- 请求体: `{ providerId: string }`（由 `SetActiveProviderSchema` 校验）

**返回值**:
- `200 OK`: `{ activeProviderId: string }`
- `400 Bad Request`: 校验失败，或提供商已禁用
- `404 Not Found`: 提供商 ID 不存在
- `500 Internal Server Error`: Claude 设置同步失败

**核心逻辑**:
1. Zod 校验 `providerId`
2. 调用 `setActiveProviderId()` — 该函数内部校验提供商存在性和启用状态
3. 捕获错误区分"disabled"（400）和"not found"（404）
4. 执行 `ensureFirstWriteBackup()` 首次备份
5. 根据代理模式状态选择写入代理环境变量或提供商环境变量

**核心代码**:
```typescript
providersRouter.put('/active', (req, res) => {
  const parsed = SetActiveProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    setActiveProviderId(parsed.data.providerId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('disabled')) {
      res.status(400).json({ error: message });
    } else {
      res.status(404).json({ error: message });
    }
    return;
  }
  try {
    ensureFirstWriteBackup();
    if (getEnableFurinaProxy()) {
      writeEnvToClaudeSettings(getProxyEnv());
    } else {
      const provider = getProviderById(parsed.data.providerId);
      if (provider) {
        writeEnvToClaudeSettings(getProviderEnv(provider));
      }
    }
    res.status(200).json({ activeProviderId: parsed.data.providerId });
  } catch (err) {
    logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to sync Claude settings' });
  }
});
```
Source: `src/server/routes/providers.ts` : 171-203

**使用示例**:
```http
PUT /furina/api/providers/active
Content-Type: application/json

{ "providerId": "550e8400-e29b-41d4-a716-446655440000" }
Response: 200
{ "activeProviderId": "550e8400-e29b-41d4-a716-446655440000" }
```
解释: 前端在提供商列表中点击"设为活跃"按钮时调用。触发 Claude CLI 设置自动同步。

---

### `GET /furina/api/providers/proxy`

**Source**: `src/server/routes/providers.ts` : 233-236

**功能描述**: 获取当前 Furina 代理模式的启用状态。

**参数**: 无

**返回值**:
- `200 OK`: `{ enableFurinaProxy: boolean }`

**核心代码**:
```typescript
providersRouter.get('/proxy', (_req, res) => {
  const enabled = getEnableFurinaProxy();
  res.status(200).json({ enableFurinaProxy: enabled });
});
```
Source: `src/server/routes/providers.ts` : 233-236

**使用示例**:
```http
GET /furina/api/providers/proxy
Response: 200
{ "enableFurinaProxy": false }
```
解释: 前端加载时获取代理模式状态，用于显示开关控件的初始值。

---

### `PUT /furina/api/providers/proxy`

**Source**: `src/server/routes/providers.ts` : 249-273

**功能描述**: 切换 Furina 代理模式并同步 Claude CLI 设置。开启代理时写入固定代理环境变量（localhost:3939），关闭代理时根据是否有活跃提供商决定写入提供商环境变量或从备份恢复设置。

**参数**:
- 请求体: `{ enableFurinaProxy: boolean }`（由 `SetProxySchema` 校验）

**返回值**:
- `200 OK`: `{ enableFurinaProxy: boolean }`
- `400 Bad Request`: Zod 校验失败
- `500 Internal Server Error`: Claude 设置同步失败

**核心逻辑**:
1. 校验请求体
2. 调用 `setEnableFurinaProxy()` 持久化标志
3. 开启代理路径：`ensureFirstWriteBackup()` → `writeEnvToClaudeSettings(getProxyEnv())`
4. 关闭代理路径：
   - 有活跃提供商 → `writeEnvToClaudeSettings(getProviderEnv(activeProvider))`
   - 无活跃提供商 → `restoreClaudeSettings()`

**核心代码**:
```typescript
providersRouter.put('/proxy', (req, res) => {
  const parsed = SetProxySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    setEnableFurinaProxy(parsed.data.enableFurinaProxy);
    if (parsed.data.enableFurinaProxy) {
      ensureFirstWriteBackup();
      writeEnvToClaudeSettings(getProxyEnv());
    } else {
      const activeProvider = getActiveProvider();
      if (activeProvider) {
        writeEnvToClaudeSettings(getProviderEnv(activeProvider));
      } else {
        restoreClaudeSettings();
      }
    }
    res.status(200).json({ enableFurinaProxy: parsed.data.enableFurinaProxy });
  } catch (err) {
    logger.error(`Failed to update proxy settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to update proxy settings' });
  }
});
```
Source: `src/server/routes/providers.ts` : 249-273

**使用示例**:
```http
PUT /furina/api/providers/proxy
Content-Type: application/json

{ "enableFurinaProxy": true }
Response: 200
{ "enableFurinaProxy": true }
```
解释: 前端切换代理模式开关时调用。开启代理后所有 Anthropic API 请求将通过本地代理转发。

---

### `PUT /furina/api/providers/:id/enabled`

**Source**: `src/server/routes/providers.ts` : 285-310

**功能描述**: 切换提供商的启用/禁用状态。当禁用的提供商是当前活跃提供商时，需要同步处理 Claude 设置：代理模式关闭时恢复原始设置，代理模式开启时写入代理环境变量。`providers-store` 的 `updateProvider()` 内部也会在禁用活跃提供商时级联清除 `activeProviderId`。

**参数**:
- `:id` (路径参数, `string`): 提供商 UUID
- 请求体: `{ enabled: boolean }`（由 `SetEnabledSchema` 校验）

**返回值**:
- `200 OK`: 更新后的 `Provider` 对象
- `400 Bad Request`: Zod 校验失败
- `404 Not Found`: 提供商不存在
- `500 Internal Server Error`: Claude 设置同步失败

**核心逻辑**:
1. 校验请求体
2. 记录该提供商是否为当前活跃提供商（`wasActive`）
3. 调用 `updateProvider()` 执行更新（内部级联清除活跃状态）
4. 禁用 + 是活跃提供商 + 代理关闭 → `restoreClaudeSettings()`
5. 禁用 + 是活跃提供商 + 代理开启 → `writeEnvToClaudeSettings(getProxyEnv())`

**核心代码**:
```typescript
providersRouter.put('/:id/enabled', (req, res) => {
  const parsed = SetEnabledSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  const wasActive = getActiveProviderId() === req.params.id;
  let provider;
  try {
    provider = updateProvider(req.params.id, { enabled: parsed.data.enabled });
  } catch {
    res.status(404).json({ error: `Provider not found: ${req.params.id}` });
    return;
  }
  try {
    if (parsed.data.enabled === false && wasActive && !getEnableFurinaProxy()) {
      restoreClaudeSettings();
    } else if (parsed.data.enabled === false && wasActive && getEnableFurinaProxy()) {
      writeEnvToClaudeSettings(getProxyEnv());
    }
    res.status(200).json(provider);
  } catch (err) {
    logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to sync Claude settings' });
  }
});
```
Source: `src/server/routes/providers.ts` : 285-310

**使用示例**:
```http
PUT /furina/api/providers/550e8400-e29b-41d4-a716-446655440000/enabled
Content-Type: application/json

{ "enabled": false }
Response: 200
{ "id": "550e8400-...", "name": "Anthropic", "enabled": false, ... }
```
解释: 前端切换提供商启用/禁用开关时调用。禁用活跃提供商会触发 Claude 设置恢复。

---

### `POST /furina/api/providers/reset`

**Source**: `src/server/routes/providers.ts` : 391-405

**功能描述**: 重置操作 — 恢复 Claude CLI 设置到 Furina 之前的原始状态，并清除当前活跃提供商。即使备份恢复失败（例如备份文件不存在），仍然继续清除活跃提供商。这个端点是用户"退出"或"重置"操作的入口。

**参数**: 无

**返回值**:
- `200 OK`: `{ activeProviderId: null }`
- `500 Internal Server Error`: 清除活跃提供商失败

**核心逻辑**:
1. 尝试 `restoreClaudeSettings()` — 失败仅记录日志，不中断
2. 调用 `clearActiveProviderId()` — 失败则返回 500

**核心代码**:
```typescript
providersRouter.post('/reset', (_req, res) => {
  try {
    restoreClaudeSettings();
  } catch (err) {
    logger.error(`Failed to restore Claude settings: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    clearActiveProviderId();
  } catch (err) {
    logger.error(`Failed to clear active provider: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to clear active provider' });
    return;
  }
  res.status(200).json({ activeProviderId: null });
});
```
Source: `src/server/routes/providers.ts` : 391-405

**使用示例**:
```http
POST /furina/api/providers/reset
Response: 200
{ "activeProviderId": null }
```
解释: 用户在 UI 中点击"重置"或"恢复默认设置"时调用，将 Claude CLI 设置恢复到 Furina 之前的原始状态。

---

### `GET /furina/api/providers/templates`

**Source**: `src/server/routes/providers.ts` : 423-430

**功能描述**: 返回所有提供商预设模板列表。模板包含内置（builtin）和自定义（custom）两种来源。

**参数**: 无

**返回值**:
- `200 OK`: `ProviderTemplate[]` 模板数组
- `500 Internal Server Error`: 模板文件读取失败

**核心代码**:
```typescript
providersRouter.get('/templates', (_req, res) => {
  try {
    const templates = readProviderTemplates();
    res.status(200).json(templates);
  } catch {
    res.status(500).json({ error: 'Failed to read provider templates' });
  }
});
```
Source: `src/server/routes/providers.ts` : 423-430

**使用示例**:
```http
GET /furina/api/providers/templates
Response: 200
[
  {
    "name": "Anthropic",
    "baseUrl": "https://api.anthropic.com",
    "websiteUrl": "https://console.anthropic.com",
    "iconSvg": "anthropic.svg",
    "defaultModel": "claude-sonnet-4-20250514",
    "source": "builtin"
  }
]
```
解释: 前端在"创建提供商"表单中展示预设模板列表供用户选择。

---

### `POST /furina/api/providers/templates`

**Source**: `src/server/routes/providers.ts` : 437-454

**功能描述**: 添加自定义提供商模板。校验请求体中的必填字段，委托 `addProviderTemplate()` 写入模板文件。模板的 `source` 字段由服务端强制设为 `'custom'`。重复名称返回 409 Conflict。

**参数**:
- 请求体: 符合 `ProviderTemplateInputSchema` 的 JSON 对象（`name` 必填，其余可选带默认值）

**返回值**:
- `201 Created`: 新创建的 `ProviderTemplate` 对象
- `400 Bad Request`: Zod 校验失败
- `409 Conflict`: 模板名称已存在
- `500 Internal Server Error`: 其他错误

**核心逻辑**:
使用 `ProviderTemplateInputSchema` 校验，其中 `name` 为必填（最少 1 字符），`websiteUrl`、`iconSvg`、各模型字段均为可选（默认空字符串）。`addProviderTemplate()` 内部会强制设置 `source: 'custom'` 并检查重复名称。

**核心代码**:
```typescript
providersRouter.post('/templates', (req, res) => {
  const parsed = ProviderTemplateInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    const template = addProviderTemplate(parsed.data);
    res.status(201).json(template);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});
```
Source: `src/server/routes/providers.ts` : 437-454

**使用示例**:
```http
POST /furina/api/providers/templates
Content-Type: application/json

{
  "name": "My Custom Provider",
  "baseUrl": "https://my-provider.com",
  "defaultModel": "my-model-v1"
}
Response: 201
{
  "name": "My Custom Provider",
  "baseUrl": "https://my-provider.com",
  "defaultModel": "my-model-v1",
  "websiteUrl": "",
  "iconSvg": "",
  "sonnetModel": "",
  "opusModel": "",
  "haikuModel": "",
  "source": "custom"
}
```
解释: 用户在模板管理页面添加自定义提供商模板时调用。

---

### `DELETE /furina/api/providers/templates/:name`

**Source**: `src/server/routes/providers.ts` : 347-363

**功能描述**: 按名称删除自定义提供商模板。内置模板（`source: 'builtin'`）不允许删除，会返回 403 Forbidden。不存在的名称返回 404。

**参数**:
- `:name` (路径参数, `string`): 要删除的模板名称

**返回值**:
- `200 OK`: `{ message: string }` 删除成功消息
- `403 Forbidden`: 尝试删除内置模板
- `404 Not Found`: 模板不存在
- `500 Internal Server Error`: 其他错误

**核心逻辑**:
1. 调用 `deleteProviderTemplate()` — 该函数内部检查 `source === 'builtin'` 时抛出错误
2. 返回 `false` 时返回 404
3. 捕获的错误消息包含 `'Cannot delete builtin'` 时返回 403

**核心代码**:
```typescript
providersRouter.delete('/templates/:name', (req, res) => {
  try {
    const deleted = deleteProviderTemplate(req.params.name);
    if (!deleted) {
      res.status(404).json({ error: `Template not found: ${req.params.name}` });
      return;
    }
    res.status(200).json({ message: `Template "${req.params.name}" deleted successfully` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Cannot delete builtin')) {
      res.status(403).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});
```
Source: `src/server/routes/providers.ts` : 347-363

**使用示例**:
```http
DELETE /furina/api/providers/templates/My Custom Provider
Response: 200
{ "message": "Template \"My Custom Provider\" deleted successfully" }
```
解释: 用户在模板管理页面删除自定义模板时调用。内置模板无法删除。

---

### `POST /furina/api/providers/validate`

**Source**: `src/server/routes/providers.ts` : 471-586

**功能描述**: 验证 API Key 的有效性。通过向提供商的 `/v1/messages` 端点发送一个最小化的测试请求来检查密钥是否被接受。这是路由中最复杂的端点，涉及多策略认证尝试、超时控制和 403 响应歧义消解。验证结果不会持久化存储。

**参数**:
- 请求体: `{ baseUrl: string, apiKey: string }`（由 `ProviderValidateSchema` 校验）

**返回值**:
- `200 OK`: 验证结果（始终返回 200，通过 `valid` 字段表示结果）
  - `{ valid: true, models?: any[] }`: 密钥有效
  - `{ valid: false, error: string, upstreamError?: string }`: 密钥无效或验证失败
- `400 Bad Request`: Zod 校验失败（缺少必填字段）
- `413 Payload Too Large`: 请求体超过 1KB

**核心逻辑**:

1. **请求体大小守卫**: `JSON.stringify(req.body).length > 1024` 时返回 413
2. **Zod 校验**: `baseUrl` 和 `apiKey` 均为必填非空字符串
3. **URL 构建**: `baseUrl` 尾部斜杠清理后拼接 `/v1/messages`
4. **三种认证策略依次尝试**:
   - Anthropic 格式: `{ 'x-api-key': apiKey }`
   - OpenAI/DeepSeek/智谱格式: `{ 'authorization': 'Bearer ' + apiKey }`
   - 裸 authorization: `{ 'authorization': apiKey }`
5. **请求配置**: 发送 `{ model: 'test', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }`，5 秒超时，`validateStatus: () => true`（不抛出 HTTP 错误）
6. **循环中断条件**: 非 401/403 时停止尝试
7. **响应判断**:
   - 200/400 → `valid: true`（400 说明密钥有效但请求格式不对）
   - 401 → `valid: false`（始终为无效密钥）
   - 403 → 通过 `isUpstreamAuthError()` 消歧
   - 其他 → `valid: false`
8. **异常处理**: ETIMEDOUT/ECONNABORTED → 超时错误消息；其他 → 通用错误消息。所有异常均返回 200 状态码 + `valid: false`。

**核心代码**:
```typescript
providersRouter.post('/validate', async (req, res) => {
  if (JSON.stringify(req.body).length > 1024) {
    res.status(413).json({ error: 'Request body too large' });
    return;
  }
  const parsed = ProviderValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing required fields: baseUrl, apiKey' });
    return;
  }
  const { baseUrl, apiKey } = parsed.data;
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;

  const authCombinations: Array<Record<string, string>> = [
    { 'x-api-key': apiKey },
    { 'authorization': `Bearer ${apiKey}` },
    { 'authorization': apiKey },
  ];

  try {
    let upstreamRes: any;
    for (const authHeaders of authCombinations) {
      upstreamRes = await axios({
        method: 'POST',
        url,
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        data: { model: 'test', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] },
        timeout: 5000,
        validateStatus: () => true,
      });
      if (upstreamRes.status !== 401 && upstreamRes.status !== 403) {
        break;
      }
    }
    // ... 响应判断逻辑（详见源文件）
  } catch (err: unknown) {
    // ... 超时/连接错误处理
  }
});
```
Source: `src/server/routes/providers.ts` : 471-586

**使用示例**:
```http
POST /furina/api/providers/validate
Content-Type: application/json

{
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "sk-ant-api03-..."
}
Response: 200
{
  "valid": true,
  "models": []
}
```
```http
POST /furina/api/providers/validate
Content-Type: application/json

{
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "invalid-key"
}
Response: 200
{
  "valid": false,
  "error": "Authentication failed: invalid API key",
  "upstreamError": "{\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",\"message\":\"Invalid API Key\"}}"
}
```
解释: 前端在创建或编辑提供商时提供"验证密钥"按钮，用户点击后调用此端点检查密钥是否有效。返回的 `models` 数据可用于展示可用模型列表。

---

## Data Structures

### `SetActiveProviderSchema`

```typescript
const SetActiveProviderSchema = z.object({
  providerId: z.string(),
});
```
- `providerId` (`string`): 要设为活跃的提供商 UUID

### `SetProxySchema`

```typescript
const SetProxySchema = z.object({
  enableFurinaProxy: z.boolean(),
});
```
- `enableFurinaProxy` (`boolean`): 代理模式开关

### `SetEnabledSchema`

```typescript
const SetEnabledSchema = z.object({
  enabled: z.boolean(),
});
```
- `enabled` (`boolean`): 提供商启用/禁用状态

### `ProviderTemplateInputSchema`

```typescript
const ProviderTemplateInputSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  baseUrl: z.string(),
  websiteUrl: z.string().optional().default(''),
  iconSvg: z.string().optional().default(''),
  defaultModel: z.string().optional().default(''),
  sonnetModel: z.string().optional().default(''),
  opusModel: z.string().optional().default(''),
  haikuModel: z.string().optional().default(''),
});
```
- `name` (`string`): 模板名称，必填，最少 1 字符
- `baseUrl` (`string`): API 基础 URL，必填
- `websiteUrl` (`string`, 可选): 提供商网站 URL，默认空字符串
- `iconSvg` (`string`, 可选): SVG 图标文件名，默认空字符串
- `defaultModel` (`string`, 可选): 默认模型标识符
- `sonnetModel` (`string`, 可选): Sonnet 级模型标识符
- `opusModel` (`string`, 可选): Opus 级模型标识符
- `haikuModel` (`string`, 可选): Haiku 级模型标识符

### `ProviderValidateSchema`

```typescript
const ProviderValidateSchema = z.object({
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
});
```
- `baseUrl` (`string`): 提供商 API 基础 URL，必填非空
- `apiKey` (`string`): 待验证的 API 密钥，必填非空

### `ProviderInputSchema`（来自 providers-store）

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
- `name` (`string`): 提供商名称，必填
- `apiKey` (`string`): API 密钥，必填
- `defaultModel` / `sonnetModel` / `opusModel` / `haikuModel` (`string`): 模型配置字段，必填
- `enabled` (`boolean`, 默认 `true`): 是否启用
- 其余字段可选

### `ProviderUpdateSchema`（来自 providers-store）

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
所有字段均为可选，用于部分更新。

### `ProviderTemplate`（来自 provider-templates）

```typescript
export interface ProviderTemplate {
  name: string;
  websiteUrl?: string;
  baseUrl: string;
  iconSvg?: string;
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
  source: 'builtin' | 'custom';
}
```
- `source`: 模板来源，`'builtin'` 表示内置资源文件中的模板，`'custom'` 表示通过 API 添加的模板

## Error Handling and Edge Cases

### 统一错误响应格式

所有路由使用一致的错误响应格式：
- Zod 校验失败: `{ error: 'Validation failed', details: [{ field, message }] }`（400）
- 业务逻辑错误: `{ error: string }`（404/409/500）
- 验证端点: 始终返回 200，通过 `{ valid: boolean, error?, models? }` 表达结果

### Claude 设置同步失败处理

涉及 Claude 设置同步的路由（`PUT /active`、`PUT /proxy`、`PUT /:id/enabled`、`PUT /:id`）采用两段式 try-catch：
- 第一段: 操作 store 层（设置活跃提供商等）失败 → 返回 404/400
- 第二段: Claude 设置同步失败 → 记录错误日志并返回 500

这种设计确保 store 层操作成功但 Claude 设置同步失败时，前端可以知道发生了部分失败。

### 403 响应歧义消解

`POST /validate` 端点的核心难点是 403 响应的歧义消解。上游返回 403 可能意味着：
1. API Key 无效（应返回 `valid: false`）
2. API Key 有效但无权访问测试模型（应返回 `valid: true`）

通过 `isUpstreamAuthError()` 函数检查上游错误 body 的结构化字段来区分这两种情况。默认策略是"疑罪从无"——无法确定时假定密钥有效。

### 备份守卫机制

`neverClaudeSettings` 标志确保 `~/.claude/settings.json` 只在首次写入时备份。该标志存储在 `providers.json` 中，持久化跨进程生命周期。如果备份文件已存在，`backupClaudeSettings()` 会覆盖它。

### 代理模式关闭时的恢复策略

当关闭代理且无活跃提供商时，调用 `restoreClaudeSettings()` 从 `~/.furina/settings.bak.json` 恢复。如果备份文件不存在，`restoreClaudeSettings()` 返回 `false` 并记录警告，但不会抛出异常。

### 验证端点安全守卫

- 请求体大小限制: `JSON.stringify(req.body).length > 1024` 时返回 413，防止大型请求体
- 5 秒超时: 防止长时间阻塞
- `validateStatus: () => true`: 阻止 axios 对非 2xx 状态码抛出异常，允许自定义处理
- 所有网络错误均返回 200 状态码 + `valid: false`，避免暴露上游信息

## Dependencies

### Depends on

| 模块 | 依赖项 | 用途 |
|------|--------|------|
| `providers-store` | `loadProviders`, `createProvider`, `updateProvider`, `deleteProvider` | 提供商 CRUD 操作 |
| `providers-store` | `getActiveProviderId`, `setActiveProviderId`, `clearActiveProviderId`, `getActiveProvider` | 活跃提供商状态管理 |
| `providers-store` | `getEnableFurinaProxy`, `setEnableFurinaProxy` | 代理开关标志 |
| `providers-store` | `getNeverClaudeSettings`, `setNeverClaudeSettings` | 首次备份守卫标志 |
| `providers-store` | `getProviderById` | 单个提供商查询 |
| `providers-store` | `ProviderInputSchema`, `ProviderUpdateSchema` | Zod 输入校验 schema |
| `claude-settings` | `getProxyEnv`, `getProviderEnv` | 环境变量对象生成 |
| `claude-settings` | `writeEnvToClaudeSettings` | Claude CLI 设置写入 |
| `claude-settings` | `backupClaudeSettings`, `restoreClaudeSettings` | 设置备份与恢复 |
| `provider-templates` | `readProviderTemplates`, `addProviderTemplate`, `deleteProviderTemplate` | 模板 CRUD |
| `logger` | `logger.error` | 错误日志记录 |
| 外部依赖 | `express`, `zod`, `axios` | Web 框架、验证库、HTTP 客户端 |

### Depended by

| 模块 | 依赖方式 |
|------|----------|
| `src/server/index.ts` (App Entry) | 通过 `app.use('/furina/api/providers', providersRouter)` 挂载路由 |
| Web UI 前端 | 通过 HTTP 请求调用所有 API 端点 |

## Usage Examples

### 完整提供商管理流程

```typescript
// 1. 获取所有提供商和模板
const providersRes = await fetch('/furina/api/providers');
const providers = await providersRes.json();

const templatesRes = await fetch('/furina/api/providers/templates');
const templates = await templatesRes.json();

// 2. 从模板创建新提供商
const createRes = await fetch('/furina/api/providers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Anthropic',
    apiKey: 'sk-ant-api03-...',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    sonnetModel: 'claude-sonnet-4-20250514',
    opusModel: 'claude-opus-4-20250514',
    haikuModel: 'claude-haiku-3-5-20241022',
    usedTemplate: 'Anthropic',
    enabled: true,
  }),
});
const newProvider = await createRes.json();
// newProvider.id === "generated-uuid"

// 3. 验证 API Key
const validateRes = await fetch('/furina/api/providers/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-api03-...',
  }),
});
const validation = await validateRes.json();
// validation.valid === true

// 4. 设置为活跃提供商（自动同步 Claude 设置）
await fetch('/furina/api/providers/active', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ providerId: newProvider.id }),
});

// 5. 开启代理模式（切换 Claude 设置为代理环境变量）
await fetch('/furina/api/providers/proxy', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ enableFurinaProxy: true }),
});

// 6. 更新提供商模型配置
await fetch(`/furina/api/providers/${newProvider.id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ defaultModel: 'claude-opus-4-20250514' }),
});

// 7. 禁用提供商（触发级联清除活跃状态 + Claude 设置恢复）
await fetch(`/furina/api/providers/${newProvider.id}/enabled`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ enabled: false }),
});

// 8. 重置所有设置
await fetch('/furina/api/providers/reset', { method: 'POST' });
```

**逐步解释**:
1. 前端加载时并行获取提供商列表和模板列表，用于渲染 UI
2. 用户选择模板后填写 API Key 和模型配置，提交创建请求
3. 用户点击"验证密钥"按钮，通过 `/validate` 端点检查密钥有效性
4. 用户点击"设为活跃"，后端自动将提供商环境变量写入 Claude CLI 设置
5. 用户切换代理模式，后端将 Claude CLI 设置切换为固定代理配置
6. 用户编辑提供商模型配置，如果是活跃提供商则自动同步
7. 用户禁用提供商机，触发活跃状态清除和 Claude 设置恢复
8. 用户重置所有配置，恢复 Claude CLI 设置到原始状态并清除活跃提供商

### 自定义模板管理流程

```typescript
// 1. 添加自定义模板
const addRes = await fetch('/furina/api/providers/templates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Provider',
    baseUrl: 'https://my-provider.com',
    websiteUrl: 'https://my-provider.com',
    defaultModel: 'my-model-v1',
  }),
});
const template = await addRes.json();
// template.source === 'custom' (由服务端强制设置)

// 2. 删除自定义模板
await fetch('/furina/api/providers/templates/My Provider', {
  method: 'DELETE',
});
// 尝试删除内置模板会返回 403
```
