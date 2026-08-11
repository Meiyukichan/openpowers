# Proxy Router & Request Logging

> Source files:
> - `src/server/anthropic/router.ts` : 1-101

## Overview

`router.ts` 是 Anthropic API 代理子系统的路由入口模块，负责将客户端 HTTP 请求映射到代理转发处理器。该模块在系统中的定位是：作为 Express Router，统一注册所有代理路由规则，并提供请求/响应日志格式化工具。

**设计动机**：Furina 需要将客户端（如 Claude CLI）发出的 Anthropic API 请求透明地转发到上游 LLM 提供商。代理层需要对不同 API 路径进行差异化处理（例如 `/v1/messages` 有 600 秒超时，其他路径 120 秒），同时需要统一的日志记录格式以便运维排查。将路由注册和日志格式化封装在独立模块中，实现了路由配置与实际代理处理逻辑（`handler.ts`）的解耦。

**使用场景**：
- 服务启动时（`src/server/index.ts` 的 `createApp()` 函数），将 `createProxyRouter()` 返回的 Router 挂载到 Express app 根路径
- 代理处理器（`handler.ts` 的 `proxyRequestHandler()`）在请求处理完成后通过回调调用 `logRequest()` 记录日志
- 健康检查端点（`HEAD /`）供外部监控系统探测代理服务存活状态

**涉及的源文件及职责**：
- `src/server/anthropic/router.ts`：定义 `LogRequestOptions` 接口、`STATUS_PHRASES` 常量映射、`logRequest()` 日志格式化函数、`createProxyRouter()` 路由工厂函数

## Architecture / Flow

```
客户端请求
    |
    v
Express App (src/server/index.ts)
    |
    v
createProxyRouter() 返回的 Router
    |
    +-- HEAD /           --> 200 + logRequest (健康检查)
    +-- (error middleware) --> 500 JSON 错误响应
    +-- POST /v1/messages --> proxyRequestHandler(req, res, logRequest callback)
    +-- POST /v1/messages/:path --> proxyRequestHandler(req, res, logRequest callback)
    +-- router.all(/*)   --> proxyRequestHandler(req, res, logRequest callback)
                                  |
                                  v
                          handler.ts: proxyRequestHandler()
                          (代理转发 + 流处理 + 错误处理)
                                  |
                                  v  (请求完成后通过回调)
                          router.ts: logRequest()
                          (格式化并写入日志)
```

**路由注册顺序说明**：

1. `HEAD /` 健康检查路由最先注册，不经过任何中间件
2. 错误处理中间件紧随其后，捕获后续路由中的同步异常
3. `POST /v1/messages` 专用路由，对应 Anthropic Messages API 主端点
4. `POST /v1/messages/:path` 子路径路由（如 `count_tokens`），用于 Messages API 的子功能
5. `router.all('/{*catchall}')` 兜底路由，覆盖所有其他 Anthropic API 端点

这种从精确到宽泛的注册顺序保证了路由匹配的正确性——Express 按注册顺序匹配，精确路径优先于通配符。

## Functionality / Interface Details

### `logRequest(options: LogRequestOptions): void`

**Source**: `src/server/anthropic/router.ts`:49-63

**Functionality**: 格式化并记录请求/响应日志条目，采用类似 uvicorn 的日志格式。该函数是代理层统一的日志出口，所有代理请求（包括健康检查和实际 API 代理）的日志都通过此函数记录。它根据 HTTP 状态码自动选择日志级别：状态码 < 400 使用 `info` 级别（表示正常响应），状态码 >= 400 使用 `error` 级别（表示客户端或服务端错误）。日志格式中使用 provider host 替代传统 web 服务器中的 client IP，以便在多提供商环境下快速定位上游来源。

**Parameters**:
- `options` (`LogRequestOptions`): 聚合所有日志参数的对象，包含以下字段：
  - `providerHost` (`string`): 上游提供商主机名（如 `api.anthropic.com`）。健康检查时传 `'-'` 占位。
  - `method` (`string`): HTTP 方法（如 `POST`、`GET`、`HEAD`）。
  - `url` (`string`): 请求路径（如 `/v1/messages`）。
  - `status` (`number`): HTTP 状态码，决定日志级别和状态短语。
  - `providerModel` (`string`, 可选): 映射后的提供商模型名。若存在，会以 `host:model` 格式拼接进日志。
  - `clientModel` (`string`, 可选): 客户端原始请求模型名。若存在，会以 `model:method` 格式拼接进日志。
  - `errorMsg` (`string`, 可选): 错误描述信息。仅在错误场景下附加到日志末尾。
  - `logger` (`{ info, error }`, 可选): 自定义日志实例。若未提供，使用全局 `proxyLogger`。

**Return Value**:
- `void`: 无返回值，副作用为向 logger 写入一条格式化日志。

**Core Logic**:

1. 从 `STATUS_PHRASES` 映射表中查找状态码对应的短语（如 `200 -> 'OK'`），未命中则为空字符串
2. 拼接 provider host 部分：若存在 `providerModel`，格式为 `providerHost:providerModel`；否则仅 `providerHost`
3. 拼接 method 部分：若存在 `clientModel`，格式为 `clientModel:method`；否则仅 `method`
4. 组装日志条目：基本格式为 `hostPart - "methodPart url HTTP/1.1" status phrase`；若有 `errorMsg` 则追加 ` - errorMsg`
5. 选择 logger：使用传入的 `logger` 参数或默认的全局 `proxyLogger`
6. 根据状态码分发日志级别：`status < 400` 调用 `logger.info()`，`status >= 400` 调用 `logger.error()`

**Core Code**:
```typescript
export function logRequest(options: LogRequestOptions): void {
  const { providerHost, method, url, status, providerModel, clientModel, errorMsg, logger } = options;
  const phrase = STATUS_PHRASES[status] || '';
  const hostPart = providerModel ? `${providerHost}:${providerModel}` : providerHost;
  const methodPart = clientModel ? `${clientModel}:${method}` : method;
  const entry = errorMsg
    ? `${hostPart} - "${methodPart} ${url} HTTP/1.1" ${status} ${phrase} - ${errorMsg}`
    : `${hostPart} - "${methodPart} ${url} HTTP/1.1" ${status} ${phrase}`;
  const activeLogger = logger || proxyLogger;
  if (status < 400) {
    activeLogger.info(entry);
  } else {
    activeLogger.error(entry);
  }
}
```
Source: `src/server/anthropic/router.ts`:49-63

**Usage Example**:
```typescript
// 记录一次成功的 API 代理请求
logRequest({
  providerHost: 'api.anthropic.com',
  method: 'POST',
  url: '/v1/messages',
  status: 200,
  providerModel: 'claude-3-5-sonnet-20241022',
  clientModel: 'claude-sonnet-4-20250514',
});
// 输出: api.anthropic.com:claude-3-5-sonnet-20241022 - "claude-sonnet-4-20250514:POST /v1/messages HTTP/1.1" 200 OK

// 记录一次超时错误
logRequest({
  providerHost: 'api.example.com',
  method: 'POST',
  url: '/v1/messages',
  status: 502,
  errorMsg: 'Connection refused: connect ECONNREFUSED',
  logger: customLogger,
});
// 输出: api.example.com - "POST /v1/messages HTTP/1.1" 502 Bad Gateway - Connection refused: connect ECONNREFUSED
```
Explanation: 第一个示例展示了正常代理请求的日志记录，provider 和 client 模型名均被包含在日志中。第二个示例展示了错误场景，通过自定义 logger 和 errorMsg 字段记录连接失败。

---

### `createProxyRouter(): express.Router`

**Source**: `src/server/anthropic/router.ts`:70-101

**Functionality**: 工厂函数，创建并返回一个配置好所有代理路由的 Express Router 实例。该函数是代理子系统的路由注册中心，将 HTTP 路径映射到对应的请求处理器。返回的 Router 使用 `mergeParams: true` 选项以正确传播父级路由参数。所有路由使用绝对路径，必须挂载在 Express app 的根路径（`/`）上才能正确匹配。

**Parameters**:
- 无参数。

**Return Value**:
- `express.Router`: 已配置完整路由规则的 Express Router 实例。
  - 路由匹配顺序：HEAD `/` -> 错误中间件 -> POST `/v1/messages` -> POST `/v1/messages/:path` -> ALL `/{*catchall}`

**Core Logic**:

1. 创建 Router 实例，启用 `mergeParams: true`（确保路由参数从父级正确传递）
2. 注册 `HEAD /` 健康检查路由：直接返回 `200`，并以 `providerHost: '-'` 记录日志
3. 注册 Express 错误处理中间件（4 参数函数签名）：捕获后续路由中的同步异常，返回 `500` JSON 错误响应
4. 注册 `POST /v1/messages` 专用路由：将请求委托给 `proxyRequestHandler()`，并传入 `logRequest` 作为回调。此路由对应 Anthropic Messages API 主端点，由 handler 内部的 `getTimeoutForPath()` 函数分配 600 秒超时
5. 注册 `POST /v1/messages/:path` 子路径路由：同样委托给 `proxyRequestHandler()`。`:path` 参数捕获子功能路径（如 `count_tokens`），由 handler 分配 120 秒超时
6. 注册 `router.all('/{*catchall}')` 兜底路由：匹配所有未被前面路由捕获的请求，覆盖其他 Anthropic API 端点（如 `/v1/complete`）
7. 返回配置好的 Router 实例

**Core Code**:
```typescript
export function createProxyRouter(): express.Router {
  const router = express.default.Router({ mergeParams: true });

  // Health check
  router.head('/', (_req, res) => {
    res.sendStatus(200);
    logRequest({ providerHost: '-', method: 'HEAD', url: '/', status: 200 });
  });

  // Error handler
  router.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    proxyLogger.error(`${err.message}`);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  });

  // Dedicated Messages API route (600s timeout via handler's getTimeoutForPath)
  router.post('/v1/messages', (req, res) => {
    proxyRequestHandler(req, res, (options) => logRequest(options));
  });

  // Messages sub-path routes (e.g. count_tokens) — 120s timeout via handler
  router.post('/v1/messages/:path', (req, res) => {
    proxyRequestHandler(req, res, (options) => logRequest(options));
  });

  // Catch-all dynamic proxy for all other Anthropic API endpoints
  router.all('/{*catchall}', (req, res) => {
    proxyRequestHandler(req, res, (options) => logRequest(options));
  });

  return router;
}
```
Source: `src/server/anthropic/router.ts`:70-101

**Usage Example**:
```typescript
// 在 Express app 中挂载代理路由（来源: src/server/index.ts:67）
import { createProxyRouter } from './anthropic/router.js';

const app = express.default();
// ... 挂载其他路由 ...
app.use(createProxyRouter()); // 必须最后挂载，作为请求的最终兜底
```
Explanation: `createProxyRouter()` 返回的 Router 被挂载到 Express app 根路径。由于包含 `router.all()` 兜底路由，它必须在所有其他业务路由（如 `/furina/api/*`）之后挂载，避免代理路由拦截非代理请求。

## Data Structures

### `LogRequestOptions`

```typescript
export interface LogRequestOptions {
  providerHost: string;
  method: string;
  url: string;
  status: number;
  providerModel?: string;
  clientModel?: string;
  errorMsg?: string;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
}
```

- `providerHost` (`string`): 上游提供商主机名，去除协议前缀（如 `api.anthropic.com`）。健康检查时传 `'-'`。
- `method` (`string`): HTTP 请求方法。
- `url` (`string`): 请求路径，包含查询字符串。
- `status` (`number`): HTTP 响应状态码，同时用于日志级别判断（< 400 为 info，>= 400 为 error）和状态短语查找。
- `providerModel` (`string`, 可选): 映射后的提供商模型名。传入时，日志中 host 部分变为 `host:model` 格式。
- `clientModel` (`string`, 可选): 客户端原始请求模型名。传入时，日志中 method 部分变为 `model:method` 格式。
- `errorMsg` (`string`, 可选): 错误描述信息。传入时追加到日志条目末尾。
- `logger` (`{ info, error }`, 可选): 日志实例，需同时实现 `info()` 和 `error()` 方法。未传入时使用模块级 `proxyLogger`。该接口兼容 winston Logger 以及测试中常用的 mock 对象。

### `STATUS_PHRASES`

```typescript
const STATUS_PHRASES: Record<number, string> = {
  200: 'OK',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};
```

- 模块内部常量，未导出。仅用于 `logRequest()` 中将状态码映射为人类可读的 HTTP 短语。
- 覆盖了代理场景中最常见的 9 种状态码。未映射的状态码（如 `201`、`302`）会得到空字符串作为短语。
- `200`（成功）、`400`（请求格式错误）、`401/403`（认证/授权失败）、`404`（路径不存在）、`500`（内部错误）、`502`（上游连接失败）、`503`（服务不可用，代理禁用或无提供商）、`504`（上游超时）。

## Error Handling and Edge Cases

1. **状态码未映射**：当 `status` 不在 `STATUS_PHRASES` 中时（如 `201`、`302`），`phrase` 为空字符串，日志条目中状态短语部分为空但不影响格式完整性。

2. **logger 参数缺失**：当 `options.logger` 未传入时，`logRequest()` 回退到模块导入时初始化的全局 `proxyLogger`。如果 `proxyLogger` 创建失败（如日志目录无写权限），`proxyLogger` 为 winston 的 silent logger，日志将被静默丢弃而不抛出异常。

3. **错误处理中间件的局限**：`router.use(err, req, res, next)` 错误中间件只能捕获同步异常。`proxyRequestHandler()` 内部的异步错误（如 axios 请求失败）由 handler 自身的 try-catch 处理，不会传递到此中间件。

4. **路由冲突**：`/v1/messages` 和 `/v1/messages/:path` 通过精确匹配优先于参数匹配的 Express 规则正确区分。访问 `/v1/messages` 匹配第一个路由，访问 `/v1/messages/count_tokens` 匹配第二个路由。

5. **`/{*catchall}` 通配语法**：使用 Express v5 的通配符语法，匹配所有未被前面路由捕获的路径。这确保了即使客户端请求其他 Anthropic API 端点（如 `/v1/complete`），也能被正确转发。

## Dependencies

- **Depends on**:
  - `src/server/anthropic/handler.ts` — `proxyRequestHandler()` 函数，所有 POST/ALL 路由的实际请求处理器
  - `src/server/anthropic/logger.ts` — `proxyLogger` 全局日志实例，作为 `logRequest()` 的默认 logger
  - `express` — Express 框架，提供 Router、Request、Response 等类型

- **Depended by**:
  - `src/server/index.ts` — `createApp()` 函数导入并调用 `createProxyRouter()`，将其返回的 Router 挂载到 Express app
  - `src/server/anthropic/handler.ts` — 导入 `LogRequestOptions` 类型，用于 `proxyRequestHandler()` 的 `onResponse` 回调参数类型定义

## Usage Examples

### 场景一：在 Express 应用中挂载代理路由

```typescript
import * as express from 'express';
import { createProxyRouter } from './anthropic/router.js';

const app = express.default();
app.use(express.default.json({ limit: '50mb' }));

// 先挂载业务路由
app.use('/furina/api/providers', providersRouter);
app.use('/furina/api/config', configRouter);

// 最后挂载代理路由（必须在业务路由之后，因为包含 catch-all）
app.use(createProxyRouter());

app.listen(3939);
```
Explanation: `createProxyRouter()` 返回的 Router 包含 `router.all()` 兜底路由，必须在所有业务路由之后挂载，否则会拦截非代理请求。

### 场景二：handler 通过回调调用 logRequest

```typescript
// 在 handler.ts 的 proxyRequestHandler 中，请求处理完成后通过回调记录日志
import { logRequest, type LogRequestOptions } from './router.js';

export async function proxyRequestHandler(
  req: Request,
  res: Response,
  onResponse?: (options: LogRequestOptions) => void,
): Promise<void> {
  // ... 代理转发逻辑 ...

  // 请求完成后，通过回调通知 router 记录日志
  onResponse?.({
    providerHost: 'api.anthropic.com',
    method: 'POST',
    url: '/v1/messages',
    status: upstreamRes.status,
    providerModel: 'claude-3-5-sonnet-20241022',
    clientModel: 'claude-sonnet-4-20250514',
    logger: activeLogger,
  });
}
```
Explanation: `proxyRequestHandler()` 接受一个 `onResponse` 回调参数。在 `createProxyRouter()` 中，该回调被绑定为 `(options) => logRequest(options)`，实现了日志记录与代理处理的解耦。handler 可以传入 session 级别的 logger，`logRequest()` 会优先使用传入的 logger 而非全局 logger。

### 场景三：测试中使用 logRequest

```typescript
import { logRequest } from './router.js';

// 使用 mock logger 测试日志级别选择逻辑
const mockLogger = { info: vi.fn(), error: vi.fn() };

// 成功响应 -> info 级别
logRequest({
  providerHost: 'api.example.com',
  method: 'POST',
  url: '/v1/messages',
  status: 200,
  logger: mockLogger,
});
// mockLogger.info 被调用 1 次，mockLogger.error 未被调用

// 错误响应 -> error 级别
logRequest({
  providerHost: 'api.example.com',
  method: 'POST',
  url: '/v1/messages',
  status: 502,
  logger: mockLogger,
});
// mockLogger.error 被调用 1 次
```
Explanation: 在单元测试中，通过传入 mock logger 可以验证日志级别选择逻辑（status < 400 用 info，>= 400 用 error）和日志格式化输出，而不需要依赖文件系统。
