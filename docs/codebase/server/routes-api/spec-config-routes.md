# Config API Routes

> Source files:
> - `src/server/routes/config.ts` : 1-59
> - `src/server/providers-store.ts` : 399-416 (language operations)

## Overview

Config API Routes 提供 `/furina/api/config` 端点的 Express 路由，负责读取和更新 Furina 的语言配置（`language`）。当前该路由仅管理语言设置一项配置项，为前端 UI 提供语言切换的 HTTP 接口。

**在系统中的角色与定位**：Config 路由是 server 模块中 routes-api 子模块的一部分，作为配置管理的 HTTP 入口。它被 `src/server/index.ts` 中挂载到 `/furina/api/config` 路径下，与其他 API 路由（providers、schedule、changes 等）并列。

**设计动机**：语言配置需要在前端运行时动态切换，因此需要一个简单的 RESTful 接口。该路由将 HTTP 层的请求校验与数据存储层分离，路由本身只负责请求校验和响应格式化，实际的存储读写委托给 `providers-store` 的 `getLanguage()` / `setLanguage()` 函数。

**使用场景**：
- 前端在页面加载时通过 GET 请求获取当前语言设置
- 用户在设置页面切换语言时通过 PUT 请求更新语言
- 语言设置持久化在 `~/.furina/providers.json` 文件的 `language` 字段中

**涉及的源文件及职责**：
- `src/server/routes/config.ts`：定义 Express Router，包含 GET 和 PUT 路由处理器，以及 Zod 校验 schema
- `src/server/providers-store.ts`（Language operations 区域）：提供 `getLanguage()` 和 `setLanguage()` 函数，负责从 JSON 文件读取和写入语言设置
- `src/server/index.ts`：将 `configRouter` 挂载到 `/furina/api/config` 路径

## Architecture / Flow

### GET 请求流程

```
客户端 GET /furina/api/config
  --> configRouter.get('/')
    --> getLanguage()                   (providers-store)
      --> readStoreData()              (读取 ~/.furina/providers.json)
        --> return data.language ?? 'chinese'
    --> res.status(200).json({ language })
```

### PUT 请求流程

```
客户端 PUT /furina/api/config  { language: "english" }
  --> configRouter.put('/')
    --> SetLanguageSchema.safeParse(req.body)
      --> 校验失败? --> res.status(400).json({ error, details })
      --> 校验成功?
        --> setLanguage(parsed.data.language)    (providers-store)
          --> readStoreData() + data.language = value + writeStoreData(data)
        --> res.status(200).json({ language: parsed.data.language })
```

## Functionality / Interface Details

### `configRouter.get('/', handler)`

**Source**: `src/server/routes/config.ts` : 36-39

**Functionality**: 处理 GET `/furina/api/config` 请求，返回当前系统的语言配置。这是一个只读接口，不接受任何请求参数，从 providers-store 中读取当前语言设置并以 JSON 格式返回。

**Parameters**:
- `_req` (`express.Request`): Express 请求对象，未使用任何请求参数
- `res` (`express.Response`): Express 响应对象

**Return Value**:
- HTTP 200 响应，JSON body: `{ language: 'chinese' | 'english' }`
- 无错误分支，`getLanguage()` 在内部处理了所有异常情况，始终返回有效值

**Core Logic**:
路由处理器非常简洁——直接调用 `getLanguage()` 从 providers-store 获取当前语言值，然后以 HTTP 200 状态码返回 `{ language }` 对象。`getLanguage()` 内部通过 `readStoreData()` 读取 `~/.furina/providers.json` 文件，如果文件不存在或 `language` 字段为空，则默认返回 `'chinese'`。

**Core Code**:
```typescript
configRouter.get('/', (_req, res) => {
  const language = getLanguage();
  res.status(200).json({ language });
});
```
Source: `src/server/routes/config.ts` : 36-39

**Usage Example**:
```typescript
// 前端获取当前语言设置
const response = await fetch('/furina/api/config');
const data = await response.json();
// data => { language: 'chinese' }
console.log(`当前语言: ${data.language}`);
```
Explanation: 向 `/furina/api/config` 发送 GET 请求，服务器返回包含当前语言设置的 JSON 对象。

---

### `configRouter.put('/', handler)`

**Source**: `src/server/routes/config.ts` : 45-59

**Functionality**: 处理 PUT `/furina/api/config` 请求，更新系统的语言配置。请求体必须包含 `language` 字段，值为 `'chinese'` 或 `'english'`。该路由使用 Zod 进行输入校验，校验失败时返回 400 错误及详细的字段级错误信息。

**Parameters**:
- `req` (`express.Request`): Express 请求对象
  - `req.body` (`unknown`): 请求体，期望格式为 `{ language: 'chinese' | 'english' }`
- `res` (`express.Response`): Express 响应对象

**Return Value**:
- 成功：HTTP 200 响应，JSON body: `{ language: 'chinese' | 'english' }`（返回更新后的语言值）
- 校验失败：HTTP 400 响应，JSON body:
  ```json
  {
    "error": "Validation failed",
    "details": [
      { "field": "language", "message": "Invalid enum value..." }
    ]
  }
  ```

**Core Logic**:
1. 使用 `SetLanguageSchema.safeParse(req.body)` 对请求体进行 Zod 校验
2. 校验失败时（`!parsed.success`），构造 400 错误响应，将 Zod 的 `issues` 数组映射为 `{ field, message }` 格式的 `details` 数组返回给客户端，然后通过 `return` 提前退出
3. 校验成功时，调用 `setLanguage(parsed.data.language)` 将新语言值写入 `~/.furina/providers.json`
4. 返回 200 响应，body 中包含更新后的语言值

关于错误详情的 `field` 字段生成：使用 `issue.path.map(String).join('.')` 将 Zod 的路径数组转换为点分字符串。对于本路由的简单 schema（单层对象 + 单字段），path 通常为 `['language']`，结果为 `"language"`。

**Core Code**:
```typescript
configRouter.put('/', (req, res) => {
  const parsed = SetLanguageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
    return;
  }
  setLanguage(parsed.data.language);
  res.status(200).json({ language: parsed.data.language });
});
```
Source: `src/server/routes/config.ts` : 45-59

**Usage Example**:
```typescript
// 前端切换语言为英文
const response = await fetch('/furina/api/config', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ language: 'english' }),
});
const data = await response.json();
// data => { language: 'english' }
```
Explanation: 向 `/furina/api/config` 发送 PUT 请求，将语言从当前值切换为 `'english'`。服务器验证请求体后更新持久化存储并返回更新后的语言值。

---

### `SetLanguageSchema` (Zod Schema)

**Source**: `src/server/routes/config.ts` : 24-26

**Functionality**: 用于校验 PUT 请求体的 Zod schema。确保请求体是一个包含 `language` 字段的对象，且 `language` 值为枚举类型 `'chinese' | 'english'`。这是路由层的输入校验屏障，防止非法数据进入存储层。

**Schema Definition**:
```typescript
const SetLanguageSchema = z.object({
  language: z.enum(['chinese', 'english']),
});
```

**校验规则**:
- `language` 字段：必填，类型必须为字符串，值只能是 `'chinese'` 或 `'english'`
- 任何其他值（如 `'french'`、`null`、数字等）都会导致校验失败
- 缺少 `language` 字段也会导致校验失败

## Data Structures

### 语言值类型

```typescript
'chinese' | 'english'
```
- `'chinese'`：中文语言设置，也是系统默认值
- `'english'`：英文语言设置

此类型在 `providers-store.ts` 的 `StoreDataSchema` 中定义为 `z.enum(['chinese', 'english']).nullable().default('chinese')`。

### SetLanguageSchema 输入格式

```typescript
{
  language: 'chinese' | 'english'  // 必填，语言枚举值
}
```

### GET 响应格式

```typescript
{
  language: 'chinese' | 'english'  // 当前语言设置
}
```

### PUT 响应格式（成功）

```typescript
{
  language: 'chinese' | 'english'  // 更新后的语言设置
}
```

### PUT 响应格式（校验失败）

```typescript
{
  error: 'Validation failed',
  details: Array<{
    field: string,     // 错误字段的点分路径，如 "language"
    message: string    // Zod 错误消息
  }>
}
```

## Error Handling and Edge Cases

### 输入校验错误（HTTP 400）

PUT 路由使用 `SetLanguageSchema.safeParse()` 进行输入校验，以下情况会触发 400 错误：

1. **缺少 `language` 字段**：请求体为 `{}` 时，Zod 报告 `invalid_type` 错误
2. **`language` 值不在枚举范围内**：如 `{ language: 'french' }`，Zod 报告 `invalid_enum_value` 错误
3. **请求体不是合法 JSON**：如发送纯字符串 `'not-json'`，Express 的 JSON 中间件会解析失败

### 错误响应格式

错误响应包含结构化的 `details` 数组，每个元素包含 `field`（字段路径）和 `message`（错误描述），方便前端定位具体的校验失败原因。

### 存储层容错

`getLanguage()` 和 `setLanguage()` 底层的 `readStoreData()` 函数已实现全面容错：
- `providers.json` 文件不存在时返回默认数据（`language: 'chinese'`）
- 文件内容为非法 JSON 时记录警告日志并返回默认数据
- JSON 解析失败时记录错误日志并返回默认数据
- `language` 字段为 `null` 时默认返回 `'chinese'`

因此 GET 路由永远不会抛出异常，始终能返回有效的语言值。

### 未使用 catch 的场景

PUT 路由调用 `setLanguage()` 时没有 try-catch 包裹。但 `setLanguage()` 内部只进行读取-修改-写入操作，理论上 `writeStoreData()` 在写入文件时可能因磁盘空间不足等原因抛出异常，这种情况下 Express 会将其作为 500 内部服务器错误处理。

## Dependencies

### Depended by

- **前端 UI 设置页面**：通过 fetch/axios 调用 GET/PUT 接口读取和切换语言
- **`src/server/index.ts`**：将 `configRouter` 挂载到 `/furina/api/config` 路径

### Depends on

- **`src/server/providers-store.ts`**（Language operations 区域）：
  - `getLanguage()`: 从 `~/.furina/providers.json` 读取当前语言设置
  - `setLanguage(value)`: 将语言设置写入 `~/.furina/providers.json`
- **`express`**：Express Router 基础设施
- **`zod`**：请求体校验

## Usage Examples

### 完整的路由挂载与使用

以下展示 configRouter 如何在服务器中挂载并被前端调用：

```typescript
// ===== 服务器端：src/server/index.ts 中的挂载 =====
import express from 'express';
import { configRouter } from './routes/config.js';

const app = express();
app.use(express.json());

// 挂载 config 路由到 /furina/api/config 路径
app.use('/furina/api/config', configRouter);

app.listen(3000);
```

Explanation: 在 Express 应用中通过 `app.use()` 将 `configRouter` 挂载到 `/furina/api/config` 路径。注意需要先挂载 `express.json()` 中间件以解析 PUT 请求的 JSON body。

### 前端获取语言设置

```typescript
// GET 请求：获取当前语言设置
const response = await fetch('/furina/api/config');
const { language } = await response.json();
// language => 'chinese' 或 'english'
```
Explanation: 发送 GET 请求获取当前语言设置，返回值始终为 `'chinese'` 或 `'english'`。

### 前端切换语言

```typescript
// PUT 请求：切换到英文
const response = await fetch('/furina/api/config', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ language: 'english' }),
});

if (response.ok) {
  const { language } = await response.json();
  // language => 'english'，语言切换成功
  // 此处可以更新前端 UI 语言状态
} else {
  const error = await response.json();
  // error => { error: 'Validation failed', details: [...] }
  console.error('语言切换失败:', error.details);
}
```
Explanation: 发送 PUT 请求切换语言。成功时返回 200 和更新后的语言值；校验失败时返回 400 和结构化的错误详情。

### 错误处理示例

```typescript
// 发送非法语言值
const response = await fetch('/furina/api/config', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ language: 'french' }),
});

// response.status === 400
const error = await response.json();
// error => {
//   error: 'Validation failed',
//   details: [{ field: 'language', message: 'Invalid enum value...' }]
// }
```
Explanation: 当发送不在枚举范围内的语言值时，Zod 校验失败，服务器返回 400 错误和详细的字段级错误信息。
