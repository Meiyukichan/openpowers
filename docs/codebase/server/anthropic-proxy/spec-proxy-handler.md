# 代理请求处理器 (Proxy Request Handler)

> Source files:
> - `src/server/anthropic/handler.ts` : 1-477

## 概述

`handler.ts` 是 Anthropic API 代理的核心转发处理器，负责将客户端请求完整地代理到上游 Provider（如 Anthropic 官方 API 或第三方兼容 API）。它是 Furina 代理链路中承上启下的关键环节：上层由 `router.ts` 的 Express 路由调用，下层依赖 `providers-store.ts` 获取 Provider 配置、`session.ts` 解析会话级 Provider、`logger.ts` 记录日志。

**设计动机**：Furina 允许用户配置多个 API Provider，并通过代理层将所有 Anthropic API 请求统一路由到正确的上游服务。代理层需要透明地处理认证注入、模型映射、流式检测、错误分类等复杂逻辑，使客户端无需感知底层 Provider 差异。

**使用场景**：
- 客户端发送 `/v1/messages` 请求时，由 `createProxyRouter()` 注册的路由调用 `proxyRequestHandler()`
- 所有 Anthropic API 端点（包括子路径和 catch-all）均通过该处理器转发
- Session 级请求可通过 `metadata.user_id` 中的 `session_id` 路由到特定 Provider

**涉及的源文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/server/anthropic/handler.ts` | 核心代理转发逻辑：请求预处理、Provider 解析、头部准备、流式检测、模型映射、axios 转发、双层流处理、错误分类 |
| `src/server/anthropic/types.ts` | 常量定义（超时时间、hop-by-hop 头部列表） |
| `src/server/anthropic/router.ts` | Express 路由注册，调用 `proxyRequestHandler()` |
| `src/server/anthropic/logger.ts` | 提供全局 `proxyLogger` 和会话级 `createSessionLogger()` |
| `src/server/providers-store.ts` | Provider 配置存储，提供 `getDefaultProvider()`、`getEnableFurinaProxy()` 等 |
| `src/utils/session.ts` | 会话设置读写，提供 `getProviderBySessionId()`、`writeSessionBodyJson()` |

## 架构 / 流程

`proxyRequestHandler()` 的完整代理生命周期如下：

```
客户端请求
  │
  ▼
① 代理开关检查 (getEnableFurinaProxy)
  │── 禁用 → 503
  ▼
② 获取默认 Provider (getDefaultProvider)
  │── 无 → 503
  ▼
③ 解析请求体 & 提取 session_id
  │── JSON 解析失败 → 400
  │── metadata.user_id → JSON.parse → session_id
  ▼
④ 解析 Provider（Session 级优先于默认）
  │── sessionId 存在 → getProviderBySessionId()
  │── 同时写入 anthropic.json 调试文件
  ▼
⑤ Provider 配置校验 (apiKey / baseUrl)
  │── 缺失 → 503
  ▼
⑥ 准备上游请求
  │── prepareModifiedHeaders()：移除 hop-by-hop，注入 auth
  │── mapModel()：客户端模型名 → Provider 模型名
  │── getTimeoutForPath()：路径级超时
  ▼
⑦ tryLogLastMessage()：记录请求体最后一条消息
  ▼
⑧ axios 转发请求到上游
  │
  ├── 流式请求 (isStreamRequest)
  │     ├── SSE 响应 → pipe 直通 + 错误事件注入
  │     └── 非 SSE 响应 → buffer 后返回 JSON
  │
  └── 非流式请求 → 直接返回 JSON/文本
  │
  ▼
⑨ 错误处理 (handleAxiosError)
  │── AxiosError + response → 原样转发上游状态码
  │── ECONNREFUSED → 502
  │── ETIMEDOUT → 502
  │── 其他 → 502
```

## 功能 / 接口详情

### `prepareModifiedHeaders(incomingHeaders, providerApiKey) -> Record<string, string | string[] | undefined>`

**Source**: `src/server/anthropic/handler.ts`:25-43

**功能**: 准备转发到上游 Provider 的 HTTP 头部。该函数执行两项核心操作：(1) 遍历客户端请求头部，移除 hop-by-hop 头部（`host`、`content-length`、`transfer-encoding`），这些头部是连接特定的，不应转发；(2) 注入 Provider 的 API Key 到 `x-api-key` 和 `authorization` 头部，替代客户端原始的认证信息。这确保了客户端无需知道上游 Provider 的凭证，代理层透明地完成认证替换。

**参数**:
- `incomingHeaders` (`Record<string, string | string[] | undefined>`): 客户端请求的原始头部，key 为头部名（大小写混合），value 为头部值
- `providerApiKey` (`string`): 当前活跃 Provider 的 API Key

**返回值**:
- `Record<string, string | string[] | undefined>`: 修改后的头部对象，已移除 hop-by-hop 头部并注入 Provider 认证信息

**核心逻辑**:
1. 创建新的 headers 对象（不修改原始头部）
2. 遍历所有传入头部，将 key 转为小写后检查是否在 `HOP_BY_HOP_HEADERS` 列表中，是则跳过
3. 设置 `x-api-key` 和 `authorization`（Bearer 格式）为 Provider 的 API Key

**核心代码**:
```typescript
export function prepareModifiedHeaders(
  incomingHeaders: Record<string, string | string[] | undefined>,
  providerApiKey: string,
): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(incomingHeaders)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.includes(lowerKey as typeof HOP_BY_HOP_HEADERS[number])) {
      continue;
    }
    headers[key] = value;
  }

  headers['x-api-key'] = providerApiKey;
  headers['authorization'] = `Bearer ${providerApiKey}`;

  return headers;
}
```
Source: `src/server/anthropic/handler.ts`:25-43

**使用示例**:
```typescript
const modified = prepareModifiedHeaders(req.headers, provider.apiKey);
// modified 不含 host/content-length/transfer-encoding
// x-api-key 和 authorization 已替换为 Provider 的 key
```

---

### `getTimeoutForPath(reqPath) -> number`

**Source**: `src/server/anthropic/handler.ts`:51-58

**功能**: 根据请求路径决定上游请求的超时时间。Anthropic Messages API（`/v1/messages`）通常需要较长的超时时间（600 秒），因为生成式 AI 响应可能较慢；其他路径（如 `/v1/messages/count_tokens` 等子路径）使用默认超时（120 秒）。该函数会先剥离查询字符串再进行精确匹配。

**参数**:
- `reqPath` (`string`): 客户端请求的完整路径（可能包含查询字符串）

**返回值**:
- `number`: 超时毫秒数。`/v1/messages` 返回 `MESSAGES_TIMEOUT_MS`（600000ms），其他路径返回 `DEFAULT_TIMEOUT_MS`（120000ms）

**核心逻辑**:
1. 使用 `split('?')[0]` 剥离查询字符串
2. 精确匹配 `/v1/messages`（不匹配子路径如 `/v1/messages/count_tokens`）
3. 返回对应的超时常量

**核心代码**:
```typescript
export function getTimeoutForPath(reqPath: string): number {
  const pathOnly = reqPath.split('?')[0];
  if (pathOnly === '/v1/messages') {
    return MESSAGES_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}
```
Source: `src/server/anthropic/handler.ts`:51-58

**使用示例**:
```typescript
getTimeoutForPath('/v1/messages')          // => 600000 (10分钟)
getTimeoutForPath('/v1/messages/count_tokens') // => 120000 (2分钟)
getTimeoutForPath('/v1/messages?stream=true')  // => 600000 (查询串被剥离)
```

---

### `detectStreamRequest(contentType, rawBody) -> boolean`

**Source**: `src/server/anthropic/handler.ts`:68-78

**功能**: 检测客户端请求是否为流式请求。该函数是"双层流检测"的第一层：通过解析请求体 JSON 检查 `stream` 字段是否为 `true`。非 JSON 内容类型（如 `multipart/form-data`）直接返回 `false`，避免对非结构化数据的无效解析。

**参数**:
- `contentType` (`string | undefined`): 请求的 `Content-Type` 头部值
- `rawBody` (`string`): 原始请求体字符串

**返回值**:
- `boolean`: 如果请求体 JSON 中 `stream === true` 则返回 `true`，其他情况（包括解析失败、非 JSON 等）返回 `false`

**核心逻辑**:
1. 检查 Content-Type 是否以 `application/json` 开头，不是则直接返回 `false`
2. 使用 `JSON.parse` 解析请求体
3. 检查解析后的对象的 `stream` 字段是否严格等于 `true`

**核心代码**:
```typescript
export function detectStreamRequest(contentType: string | undefined, rawBody: string): boolean {
  if (!contentType || !contentType.startsWith('application/json')) {
    return false;
  }
  try {
    const parsed = JSON.parse(rawBody);
    return parsed.stream === true;
  } catch {
    return false;
  }
}
```
Source: `src/server/anthropic/handler.ts`:68-78

**使用示例**:
```typescript
detectStreamRequest('application/json', '{"stream":true,"model":"claude-3"}') // => true
detectStreamRequest('application/json', '{"stream":false}')                  // => false
detectStreamRequest('multipart/form-data', '...')                            // => false
detectStreamRequest('application/json', 'invalid-json')                      // => false
```

---

### `tryLogLastMessage(logger, providerHost, method, url, bodyData, providerModel?, clientModel?) -> void`

**Source**: `src/server/anthropic/handler.ts`:100-124

**功能**: 从请求体的 `messages` 数组中提取最后一条消息并记录到日志。这用于调试和审计目的：当代理转发请求到上游时，记录最后一次用户交互内容有助于排查问题。该函数是"尽力而为"的——如果请求体不是 JSON、不含 `messages` 字段、或 `messages` 为空数组，均静默跳过。

**参数**:
- `logger` (`{ info: (msg: string) => void; error: (msg: string) => void }`): 日志实例（可以是全局 proxyLogger 或会话级 logger）
- `providerHost` (`string`): Provider 主机地址，用于日志前缀
- `method` (`string`): HTTP 方法，用于日志前缀
- `url` (`string`): 请求 URL 路径，用于日志前缀
- `bodyData` (`string`): 请求体原始字符串
- `providerModel?` (`string`): 映射后的 Provider 模型名，可选，用于日志前缀
- `clientModel?` (`string`): 客户端原始模型名，可选，用于日志前缀

**返回值**: `void`

**核心逻辑**:
1. 解析请求体为 JSON 对象
2. 检查 `messages` 是否为非空数组，不是则直接返回
3. 取 `messages` 数组的最后一个元素作为 lastMessage
4. 构造日志格式：`{hostPart} - "{methodPart} {url} HTTP/1.1" last message: {JSON.stringify(lastMessage)}`
5. hostPart 可选包含 `:providerModel`，methodPart 可选包含 `clientModel:`
6. 解析失败时记录 error 日志

**核心代码**:
```typescript
export function tryLogLastMessage(
  logger: { info: (msg: string) => void; error: (msg: string) => void },
  providerHost: string,
  method: string,
  url: string,
  bodyData: string,
  providerModel?: string,
  clientModel?: string,
): void {
  try {
    const body: Record<string, unknown> = JSON.parse(bodyData);
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }
    const lastMessage = messages[messages.length - 1];
    const hostPart = providerModel ? `${providerHost}:${providerModel}` : providerHost;
    const methodPart = clientModel ? `${clientModel}:${method}` : method;
    const entry = `${hostPart} - "${methodPart} ${url} HTTP/1.1" last message: ${JSON.stringify(lastMessage)}`;
    logger.info(entry);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error(`Failed to extract last message from request body: ${errMsg}`);
  }
}
```
Source: `src/server/anthropic/handler.ts`:100-124

**使用示例**:
```typescript
tryLogLastMessage(
  proxyLogger,
  'api.anthropic.com',
  'POST',
  '/v1/messages',
  '{"messages":[{"role":"user","content":"Hello"}],"model":"claude-3"}',
  'claude-3-sonnet',
  'claude-3-5-sonnet'
);
// 日志输出: api.anthropic.com:claude-3-sonnet - "claude-3-5-sonnet:POST /v1/messages HTTP/1.1" last message: {"role":"user","content":"Hello"}
```

---

### `copyUpstreamHeaders(res, upstreamHeaders) -> void`

**Source**: `src/server/anthropic/handler.ts`:132-145

**功能**: 将上游响应头部复制到 Express 响应对象中，同时排除响应级 hop-by-hop 头部（`content-length`、`transfer-encoding`）。这些头部是连接特定的，Express/Node.js 会自动处理，手动设置可能导致冲突。

**参数**:
- `res` (`Response`): Express 响应对象
- `upstreamHeaders` (`Record<string, string | string[] | undefined>`): 上游响应的头部

**返回值**: `void`

**核心逻辑**:
1. 遍历上游响应头部
2. 将 key 转为小写检查是否在 `RESPONSE_HOP_BY_HOP_HEADERS` 列表中
3. 跳过 hop-by-hop 头部和 value 为 undefined 的头部
4. 使用 `res.setHeader()` 设置剩余头部

**核心代码**:
```typescript
function copyUpstreamHeaders(
  res: Response,
  upstreamHeaders: Record<string, string | string[] | undefined>,
): void {
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    const lowerKey = key.toLowerCase();
    if (RESPONSE_HOP_BY_HOP_HEADERS.includes(lowerKey)) {
      continue;
    }
    if (value !== undefined) {
      res.setHeader(key, value as string | number | string[]);
    }
  }
}
```
Source: `src/server/anthropic/handler.ts`:132-145

---

### `mapModel(model, provider) -> string`

**Source**: `src/server/anthropic/handler.ts`:158-171

**功能**: 将客户端发送的模型名称映射为 Provider 配置的模型名称。采用大小写不敏感的关键词匹配策略：检查客户端模型名中是否包含 `haiku`、`opus`、`sonnet` 关键词，分别映射到 Provider 配置的 `haikuModel`、`opusModel`、`sonnetModel`。不匹配任何关键词时使用 `defaultModel`。如果对应字段为空，回退到 `defaultModel`，再回退到客户端原始模型名。

**参数**:
- `model` (`string`): 客户端请求中的原始模型名（如 `claude-3-5-sonnet-20241022`）
- `provider` (`Provider`): 当前活跃的 Provider 配置对象，包含 `defaultModel`、`sonnetModel`、`opusModel`、`haikuModel` 字段

**返回值**:
- `string`: 映射后的 Provider 模型名。优先级：关键词匹配的专用模型 > `defaultModel` > 原始模型名

**核心逻辑**:
1. 将模型名转为小写
2. 计算 `defaultModel`，为空时回退到原始模型名
3. 按 haiku -> opus -> sonnet 顺序检查关键词匹配
4. 返回对应的 Provider 模型字段，为空时回退到 defaultModel

**核心代码**:
```typescript
export function mapModel(model: string, provider: Provider): string {
  const modelLower = model.toLowerCase();
  const defaultModel = provider.defaultModel || model;
  if (modelLower.includes('haiku')) {
    return provider.haikuModel || defaultModel;
  }
  if (modelLower.includes('opus')) {
    return provider.opusModel || defaultModel;
  }
  if (modelLower.includes('sonnet')) {
    return provider.sonnetModel || defaultModel;
  }
  return defaultModel;
}
```
Source: `src/server/anthropic/handler.ts`:158-171

**使用示例**:
```typescript
const provider: Provider = {
  defaultModel: 'claude-3-sonnet',
  sonnetModel: 'my-custom-sonnet',
  opusModel: '',
  haikuModel: 'my-haiku',
  // ...
};

mapModel('claude-3-5-sonnet-20241022', provider) // => 'my-custom-sonnet'
mapModel('claude-3-opus', provider)              // => 'claude-3-sonnet' (opusModel为空,回退default)
mapModel('claude-3-haiku', provider)             // => 'my-haiku'
mapModel('claude-3-turbo', provider)             // => 'claude-3-sonnet' (无匹配,用default)
```

---

### `proxyRequestHandler(req, res, onResponse?) -> Promise<void>`

**Source**: `src/server/anthropic/handler.ts`:187-412

**功能**: Express 请求处理器，是整个代理层的入口和编排中心。它协调完整的代理生命周期：代理开关检查、默认/Session Provider 解析、Session 元数据提取（`metadata.user_id` JSON 解析）、API Key 校验、头部准备（hop-by-hop 移除 + auth 注入）、模型映射、流式检测、axios 转发（含超时）、双层流处理（SSE pipe vs buffer-then-return）、上游头部复制、错误分类，以及 `tryLogLastMessage()` 请求体日志记录。

**参数**:
- `req` (`Request`): Express 请求对象
- `res` (`Response`): Express 响应对象
- `onResponse?` (`(options: LogRequestOptions) => void`): 可选的响应回调，用于日志记录。由 `router.ts` 传入 `logRequest()` 函数

**返回值**: `Promise<void>` — 无显式返回，通过 `res` 发送响应

**核心逻辑**:

**阶段 1：前置校验**
1. 检查 `getEnableFurinaProxy()` 开关，禁用则返回 503
2. 获取默认 Provider（`getDefaultProvider()`），无配置则返回 503

**阶段 2：请求体解析与 Session 提取**
3. 根据 Content-Type 决定如何获取 rawBody（string 或 JSON.stringify）
4. JSON 请求体解析，失败返回 400
5. 调用 `detectStreamRequest()` 检测是否流式
6. 从 `metadata.user_id` 中提取 `session_id`：`metadata.user_id` 是一个 JSON 字符串，内嵌 `{ session_id: "..." }` 结构。提取失败静默跳过
7. 记录客户端原始 `model` 字段

**阶段 3：Provider 解析**
8. 如果存在 `sessionId`，尝试 `getProviderBySessionId()` 获取 Session 级 Provider
9. Session Provider 存在时切换为 Session Logger（`createSessionLogger`）
10. 同时调用 `writeSessionBodyJson()` 将请求体写入调试文件
11. 校验最终 Provider 的 `apiKey` 和 `baseUrl`，缺失返回 503

**阶段 4：请求构造**
12. 构造上游 URL：`baseUrl + reqPath`
13. `prepareModifiedHeaders()` 注入认证
14. `mapModel()` 替换模型名（仅 JSON 请求）
15. `getTimeoutForPath()` 计算超时
16. 构建 axios 请求配置，流式请求设置 `responseType: 'stream'`

**阶段 5：转发与响应处理**
17. `tryLogLastMessage()` 记录最后一条消息
18. `await axios(config)` 发起上游请求
19. **流式 + SSE 响应**：设置状态码，`copyUpstreamHeaders()`，通过 `pipe()` 直通到客户端；监听上游流 `error` 事件注入 SSE 格式错误事件；监听 `req.close` 销毁上游流
20. **流式 + 非 SSE 响应**：buffer 收集所有 chunk，拼接后尝试 JSON 解析返回；非 2xx 状态码记录 warn 日志
21. **非流式响应**：直接返回 axios 自动解析的 JSON 或文本
22. 所有成功路径均调用 `onResponse` 回调

**阶段 6：错误处理**
23. 捕获异常交给 `handleAxiosError()` 分类处理

**核心代码**（Session 提取与 Provider 解析关键段）:
```typescript
// Extract session_id from metadata.user_id (JSON string)
if (parsedBody?.metadata) {
  const metadata = parsedBody.metadata as Record<string, unknown>;
  if (typeof metadata.user_id === 'string') {
    try {
      const userId = JSON.parse(metadata.user_id) as Record<string, unknown>;
      if (typeof userId.session_id === 'string') {
        sessionId = userId.session_id;
      }
    } catch {
      // Silent fallback: invalid JSON in user_id
    }
  }
}

// Resolve provider: use session provider if session_id is present and valid
let provider: Provider = defaultProvider;
let activeLogger = proxyLogger;
if (sessionId) {
  const sessionProvider = getProviderBySessionId(sessionId);
  if (sessionProvider) {
    provider = sessionProvider;
    activeLogger = createSessionLogger(sessionId);
  }
  writeSessionBodyJson(sessionId, rawBody);
}
```
Source: `src/server/anthropic/handler.ts`:223-254

**核心代码**（SSE 流处理关键段）:
```typescript
if (upstreamContentType.includes('text/event-stream')) {
  // Layer 2: upstream returns SSE — pipe directly to client
  res.status(upstreamRes.status);
  copyUpstreamHeaders(res, upstreamRes.headers as Record<string, string | string[] | undefined>);
  const upstreamStream = upstreamRes.data;

  upstreamStream.on('error', (err: Error) => {
    activeLogger.error(`Upstream stream error: ${err.message}`);
    const errorMessage = `Upstream stream interrupted: ${err.message}`;
    if (res.headersSent) {
      const sseEvent = `data: ${JSON.stringify({ type: 'error', error: { type: 'upstream_error', message: errorMessage } })}\n\n`;
      res.write(sseEvent);
      const flushable = res as unknown as { flush?: () => void };
      flushable.flush?.();
      res.end();
    } else {
      res.status(502).json({ error: { type: 'upstream_error', message: errorMessage } });
    }
  });

  req.on('close', () => {
    if (typeof upstreamStream.destroy === 'function') {
      upstreamStream.destroy();
    }
  });

  upstreamStream.pipe(res);
  return;
}
```
Source: `src/server/anthropic/handler.ts`:311-346

**使用示例**:
```typescript
// router.ts 中的典型调用方式
router.post('/v1/messages', (req, res) => {
  proxyRequestHandler(req, res, (options) => logRequest(options));
});
```

---

### `handleAxiosError(err, res, providerHost, method, reqPath, logger, onResponse?, providerModel?, clientModel?) -> void`

**Source**: `src/server/anthropic/handler.ts`:426-476

**功能**: 处理 axios 上游调用中抛出的所有错误，进行分类并返回合适的 HTTP 响应。该函数是错误处理的终端，将不同类型的网络/HTTP 错误映射为标准化的客户端响应。

**参数**:
- `err` (`unknown`): 捕获的异常对象
- `res` (`Response`): Express 响应对象
- `providerHost` (`string`): Provider 主机地址，用于日志
- `method` (`string`): HTTP 方法，用于日志
- `reqPath` (`string`): 请求路径，用于日志
- `logger` (`{ error, warn, info }`): 日志实例
- `onResponse?` (`(options: LogRequestOptions) => void`): 可选响应回调
- `providerModel?` (`string`): Provider 模型名
- `clientModel?` (`string`): 客户端模型名

**返回值**: `void`

**核心逻辑**:

**分支 1：AxiosError + 有 response**（上游返回了 HTTP 错误响应）
1. 提取上游状态码和响应数据
2. 使用 warn 级别记录日志
3. 设置与上游相同的状态码
4. 复制上游头部（如果存在）
5. 根据 response.data 类型决定发送 JSON 或纯文本
6. 调用 `onResponse` 回调

**分支 2：连接/超时错误**（无 response）
1. 根据 `err.code` 分类：
   - `ECONNREFUSED`：上游拒绝连接
   - `ETIMEDOUT`：请求超时
   - 其他：通用请求错误
2. 统一返回 502 Bad Gateway
3. 记录 error 级别日志

**核心代码**:
```typescript
function handleAxiosError(
  err: unknown,
  res: Response,
  providerHost: string,
  method: string,
  reqPath: string,
  logger: { error: (msg: string) => void; warn: (msg: string) => void; info: (msg: string) => void },
  onResponse?: (options: LogRequestOptions) => void,
  providerModel?: string,
  clientModel?: string,
): void {
  if (axios.isAxiosError(err) && err.response) {
    const upstreamStatus = err.response.status;
    logger.warn(`Upstream returned ${upstreamStatus}: ${JSON.stringify(err.response.data)}`);
    res.status(upstreamStatus);
    if (err.response.headers) {
      copyUpstreamHeaders(res, err.response.headers as Record<string, string | string[] | undefined>);
    }
    if (typeof err.response.data === 'string') {
      try {
        res.json(JSON.parse(err.response.data));
      } catch {
        res.send(err.response.data);
      }
    } else {
      res.json(err.response.data);
    }
    onResponse?.({ providerHost, method, url: reqPath, status: upstreamStatus, providerModel, clientModel, logger });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const code = (err as NodeJS.ErrnoException).code;
  let errorMsg = message;

  if (code === 'ECONNREFUSED') {
    logger.error(`Upstream connection refused: ${message}`);
    errorMsg = `Connection refused: ${message}`;
  } else if (code === 'ETIMEDOUT') {
    logger.error(`Upstream timeout: ${message}`);
    errorMsg = `Request timeout: ${message}`;
  } else {
    logger.error(`Upstream request error: ${message}`);
    errorMsg = `Request error: ${message}`;
  }

  res.status(502).json({ error: 'Bad Gateway', message });
  onResponse?.({ providerHost, method, url: reqPath, status: 502, providerModel, clientModel, errorMsg, logger });
}
```
Source: `src/server/anthropic/handler.ts`:426-476

**使用示例**:
```typescript
// 在 proxyRequestHandler 的 catch 块中自动调用
try {
  const upstreamRes = await axios(config);
  // ... handle response
} catch (err: unknown) {
  handleAxiosError(err, res, providerHost, req.method, reqPath, activeLogger, onResponse, providerModel, clientModel);
}
```

---

## 数据结构

### `Provider`
```typescript
// 来自 src/server/providers-store.ts
export type Provider = {
  id: string;                     // Provider UUID
  name: string;                   // 显示名称
  notes?: string;                 // 备注
  websiteUrl?: string;            // 网站 URL
  apiKey?: string;                // API Key（代理校验时必须非空）
  baseUrl?: string;               // 上游基础 URL（代理校验时必须非空）
  icon?: string;                  // 图标标识
  iconColor?: string;             // 图标颜色
  usedTemplate?: string;          // 使用的模板名
  defaultModel: string;           // 默认模型名（mapModel 回退目标）
  sonnetModel: string;            // Sonnet 系列映射目标
  opusModel: string;              // Opus 系列映射目标
  haikuModel: string;             // Haiku 系列映射目标
  enabled: boolean;               // 是否启用
  createdAt: string;              // 创建时间 ISO 字符串
  updatedAt?: string;             // 更新时间 ISO 字符串
};
```
Source: `src/server/providers-store.ts`:29-49

### `LogRequestOptions`
```typescript
// 来自 src/server/anthropic/router.ts
export interface LogRequestOptions {
  providerHost: string;           // Provider 主机地址
  method: string;                 // HTTP 方法
  url: string;                    // 请求路径
  status: number;                 // HTTP 状态码
  providerModel?: string;         // 映射后的 Provider 模型名
  clientModel?: string;           // 客户端原始模型名
  errorMsg?: string;              // 错误信息（仅错误场景）
  logger?: { info: (msg: string) => void; error: (msg: string) => void }; // 可选自定义 logger
}
```
Source: `src/server/anthropic/router.ts`:18-27

### 常量
```typescript
// 来自 src/server/anthropic/types.ts
export const MESSAGES_TIMEOUT_MS = 600_000;    // /v1/messages 超时：600秒
export const DEFAULT_TIMEOUT_MS = 120_000;      // 其他路径超时：120秒
export const HOP_BY_HOP_HEADERS = ['host', 'content-length', 'transfer-encoding'] as const;
```
Source: `src/server/anthropic/types.ts`:12-18

### 响应级 hop-by-hop 头部
```typescript
// handler.ts 内部常量
const RESPONSE_HOP_BY_HOP_HEADERS = ['content-length', 'transfer-encoding'];
```
Source: `src/server/anthropic/handler.ts`:85

---

## 错误处理与边界情况

### HTTP 状态码映射

| 场景 | 状态码 | 响应体 |
|------|--------|--------|
| 代理开关禁用 | 503 | `{ error: 'Furina proxy is disabled' }` |
| 无默认 Provider | 503 | `{ error: 'No active provider configured' }` |
| JSON 解析失败 | 400 | `{ error: 'Invalid JSON in request body' }` |
| Provider 缺少 apiKey | 503 | `{ error: 'Active provider is missing API key' }` |
| Provider 缺少 baseUrl | 503 | `{ error: 'Active provider is missing base URL' }` |
| 上游 HTTP 错误 (4xx/5xx) | 原样转发 | 原样转发上游响应数据 |
| 连接拒绝 ECONNREFUSED | 502 | `{ error: 'Bad Gateway', message: ... }` |
| 请求超时 ETIMEDOUT | 502 | `{ error: 'Bad Gateway', message: ... }` |
| 其他网络错误 | 502 | `{ error: 'Bad Gateway', message: ... }` |
| SSE 流中断（headers 已发送） | 200 | SSE 格式 error event |
| SSE 流中断（headers 未发送） | 502 | `{ error: { type: 'upstream_error', message: ... } }` |

### 边界情况处理

- **metadata.user_id 非法 JSON**：静默跳过，使用默认 Provider
- **metadata.user_id 无 session_id 字段**：静默跳过，使用默认 Provider
- **Session Provider 不存在**：回退到默认 Provider，仍然写入 anthropic.json
- **请求体 messages 为空或不存在**：`tryLogLastMessage()` 静默返回
- **请求体为非 JSON 内容类型**：跳过 JSON 解析，不进行流检测和模型映射
- **流式响应但上游返回非 SSE**：buffer 收集所有 chunk 后返回 JSON，而非直接 pipe
- **上游 SSE 流 error 且 headers 已发送**：写入 SSE 格式 error event，调用 `flush()` 确保推送，然后 `end()`
- **客户端断开连接**：销毁上游流（`upstreamStream.destroy()`）避免资源泄漏
- **validateStatus: () => true**：所有上游 HTTP 状态码均接受，不抛异常；非 2xx 通过 warn 日志记录

---

## 依赖

### 依赖的模块/Spec

| 模块 | 依赖项 | 用途 |
|------|--------|------|
| `providers-store.ts` | `getDefaultProvider()`, `getEnableFurinaProxy()` | 获取默认 Provider 配置和代理开关状态 |
| `providers-store.ts` | `Provider` 类型 | 模型映射函数的类型约束 |
| `session.ts` | `getProviderBySessionId()`, `writeSessionBodyJson()` | Session 级 Provider 解析和请求体调试写入 |
| `logger.ts` | `proxyLogger`, `createSessionLogger()` | 全局和会话级日志实例 |
| `types.ts` | `HOP_BY_HOP_HEADERS`, `MESSAGES_TIMEOUT_MS`, `DEFAULT_TIMEOUT_MS` | 请求头部过滤和超时常量 |
| `router.ts` | `LogRequestOptions` 类型 | 响应回调参数类型 |
| `axios` | `axios`, `AxiosRequestConfig`, `isAxiosError` | HTTP 请求转发和错误类型检查 |

### 被依赖的模块/Spec

| 模块 | 依赖方式 |
|------|----------|
| `router.ts` | 通过 `createProxyRouter()` 注册的路由直接调用 `proxyRequestHandler()` |

---

## 使用示例

### 在 Express 路由中使用

```typescript
import { createProxyRouter } from './router.js';

// 在 Express app 中挂载代理路由
const app = express();
app.use(express.text({ type: '*/*' })); // Body 解析中间件
app.use(createProxyRouter());           // 挂载代理路由到根路径

// 客户端发送请求
// POST http://localhost:3000/v1/messages
// {
//   "model": "claude-3-5-sonnet-20241022",
//   "max_tokens": 1024,
//   "stream": true,
//   "messages": [{"role": "user", "content": "Hello"}],
//   "metadata": {
//     "user_id": "{\"session_id\":\"abc123\"}"
//   }
// }
//
// 代理层内部处理流程：
// 1. 检查代理开关 → 开启
// 2. 获取默认 Provider → { apiKey: "sk-xxx", baseUrl: "https://api.anthropic.com" }
// 3. 解析 metadata.user_id → session_id = "abc123"
// 4. 尝试 getProviderBySessionId("abc123") → 返回 Session Provider 或回退默认
// 5. mapModel("claude-3-5-sonnet-20241022", provider) → Provider 的 sonnetModel
// 6. prepareModifiedHeaders() → 注入 Provider API Key
// 7. axios 转发到 https://api.anthropic.com/v1/messages (600s timeout, stream mode)
// 8. 上游返回 SSE → pipe 直通到客户端
```

### 直接调用 handler 函数

```typescript
import { prepareModifiedHeaders, mapModel, detectStreamRequest, getTimeoutForPath, tryLogLastMessage } from './handler.js';

// 准备头部
const headers = prepareModifiedHeaders(
  { 'content-type': 'application/json', 'x-api-key': 'client-key', 'host': 'localhost' },
  'sk-provider-key'
);
// 结果: { 'content-type': 'application/json', 'x-api-key': 'sk-provider-key', 'authorization': 'Bearer sk-provider-key' }

// 流式检测
const isStream = detectStreamRequest('application/json', '{"stream":true}'); // => true

// 超时计算
const timeout = getTimeoutForPath('/v1/messages'); // => 600000

// 模型映射
const mapped = mapModel('claude-3-5-sonnet', provider); // => provider.sonnetModel

// 日志记录
tryLogLastMessage(logger, 'api.anthropic.com', 'POST', '/v1/messages',
  '{"messages":[{"role":"user","content":"test"}]}');
```
