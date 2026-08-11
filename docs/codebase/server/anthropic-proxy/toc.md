# Anthropic Proxy

> Anthropic 兼容反向代理子模块，负责将客户端（如 Claude CLI）发出的 Anthropic API 请求透明地转发到上游 LLM Provider API。覆盖完整的代理生命周期：路由注册与分发、请求预处理（hop-by-hop 头部剥离、认证注入）、模型名称映射、路径级超时控制、双层流式检测与处理（SSE pipe 直通 vs buffer 回落）、会话级 Provider 解析、请求/响应日志记录，以及全面的错误分类与响应。

## Spec Relationship Diagram

```
┌─────────────────────────────┐
│      spec-proxy-types       │
│  超时常量 + hop-by-hop 列表  │
└──────────────┬──────────────┘
               │ imports constants
               ▼
┌─────────────────────────────┐    ┌──────────────────────────────┐
│      spec-proxy-logger      │    │      spec-proxy-router       │
│  全局日志器 + 会话日志器工厂  │    │  Express 路由注册 + 日志格式化│
└───────┬─────────────┬───────┘    └───────┬──────────┬───────────┘
        │             │                    │          │
        │ imports     │ imports            │ calls    │ imports
        ▼             ▼                    ▼          │
┌─────────────────────────────────────────────────────┘
│                                              │
│      spec-proxy-handler                      │
│  核心代理转发、头部准备、模型映射、            │
│  流处理、Session 解析、错误处理               │
│                                              │
└──────────────────────────────────────────────┘
        │                                  ▲
        │ exports LogRequestOptions type    │
        └──────────────────────────────────┘
```

**依赖关系说明**：

- **spec-proxy-types** 是叶子模块，不依赖任何内部模块，被 `handler.ts` 导入使用（超时常量、hop-by-hop 头部列表）。
- **spec-proxy-logger** 仅依赖外部库（winston），为 `handler.ts` 和 `router.ts` 提供全局和会话级日志实例。
- **spec-proxy-handler** 是核心处理器，导入 types（常量）、logger（日志实例）、router（`LogRequestOptions` 类型），并依赖外部模块 `providers-store.ts` 和 `session.ts` 获取 Provider 配置。
- **spec-proxy-router** 是路由入口，调用 `handler.ts` 的 `proxyRequestHandler()` 处理请求，并使用 `logger.ts` 的 `proxyLogger` 作为默认日志器。`handler.ts` 反向导入 router 中定义的 `LogRequestOptions` 类型用于回调参数。

## Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-proxy-handler.md](./spec-proxy-handler.md) | 核心代理请求处理器，覆盖完整的请求转发生命周期。包括：`prepareModifiedHeaders()` 移除 hop-by-hop 头部并注入 Provider 认证信息；`getTimeoutForPath()` 根据路径（`/v1/messages` vs 其他）分配差异化超时；`detectStreamRequest()` 解析请求体 JSON 检测流式标志；`mapModel()` 通过关键词匹配（haiku/opus/sonnet）将客户端模型名映射为 Provider 配置模型名；`tryLogLastMessage()` 从 messages 数组提取最后一条消息记录到日志；`copyUpstreamHeaders()` 复制上游响应头部到 Express 响应；`proxyRequestHandler()` 作为编排中心协调代理开关检查、默认/Session Provider 解析（通过 `metadata.user_id` 提取 `session_id`）、请求构造、axios 转发、双层流处理（SSE pipe 直通 + 非 SSE buffer 回落）、错误分类；`handleAxiosError()` 将网络错误分类为标准化 HTTP 响应（502/原样转发上游）。 | `src/server/anthropic/handler.ts` |
| [spec-proxy-logger.md](./spec-proxy-logger.md) | 代理专用日志模块，提供全局单例日志器 `proxyLogger` 和会话级日志器工厂 `createSessionLogger()`。`proxyLogger` 在模块加载时创建，日志写入 `~/.furina/logs/anthropic.log`，所有无 session 绑定的代理请求共享该实例。`createSessionLogger()` 为每个 session 创建独立 winston 日志实例，写入 `~/.furina/sessions/<sessionId>/anthropic.log`，实现请求日志的会话隔离。采用 1 小时 TTL 的 `Map` 缓存避免重复创建，通过懒清理（lazy cleanup）在每次调用时自动移除过期条目。目录创建或日志器初始化失败时静默降级为 `silent: true` 空日志器，确保日志系统故障不影响代理主流程。 | `src/server/anthropic/logger.ts` |
| [spec-proxy-router.md](./spec-proxy-router.md) | Express 路由注册与请求日志格式化模块。`createProxyRouter()` 工厂函数创建并返回配置好所有代理路由的 Router 实例，路由注册顺序为：`HEAD /` 健康检查 -> 错误处理中间件 -> `POST /v1/messages`（Messages API 主端点）-> `POST /v1/messages/:path`（子功能如 count_tokens）-> `router.all('/{*catchall}')` 兜底路由（覆盖其他 Anthropic API 端点）。`logRequest()` 函数采用 uvicorn 风格格式化日志（`host - "method url HTTP/1.1" status phrase`），根据状态码自动选择 info/error 级别，支持可选的 provider model、client model 和错误信息字段。所有路由统一通过回调 `onResponse` 将请求转发委托给 `proxyRequestHandler()`。 | `src/server/anthropic/router.ts` |
| [spec-proxy-types.md](./spec-proxy-types.md) | 代理子模块的共享类型定义与常量文件，是基础设施层。定义三个常量：`MESSAGES_TIMEOUT_MS`（600000ms）用于 `/v1/messages` 端点的长超时场景（覆盖大文本生成）；`DEFAULT_TIMEOUT_MS`（120000ms）用于其他 API 路径的默认超时；`HOP_BY_HOP_HEADERS` 使用 `as const` 断言定义 hop-by-hop 头部列表（`host`、`content-length`、`transfer-encoding`），提供类型安全的 `includes()` 调用。该文件为纯常量定义，不包含任何函数或类，不依赖外部模块，是整个代理子模块的叶子依赖。 | `src/server/anthropic/types.ts` |
