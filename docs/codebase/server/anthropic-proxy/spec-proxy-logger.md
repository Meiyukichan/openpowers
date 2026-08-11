# Proxy Logger & Session Loggers

> Source files:
> - `src/server/anthropic/logger.ts` : 1-119

## Overview

本 spec 文档覆盖 Anthropic 代理专用的日志模块，提供两种独立的 winston 日志实例：

- **proxyLogger**：全局单例日志器，所有代理请求共享，日志写入 `~/.furina/logs/anthropic.log`。
- **createSessionLogger()**：会话级日志器工厂函数，为每个 session 创建独立的日志实例，日志写入 `~/.furina/sessions/<sessionId>/anthropic.log`。

**设计动机**：代理请求需要与主应用日志隔离，避免不同来源的日志混杂。同时，部分请求绑定了特定会话（通过 `metadata.user_id` 中的 `session_id`），需要将会话日志写入独立文件以便按会话追踪调试信息。session logger 通过 1 小时 TTL 缓存避免重复创建 winston 实例，通过懒清理（lazy cleanup）机制在检索时自动移除过期缓存条目。

**使用场景**：
- `proxyRequestHandler()` 中，当请求没有 `session_id` 或 session provider 解析失败时，使用 `proxyLogger` 记录请求日志和错误。
- `proxyRequestHandler()` 中，当请求包含有效的 `session_id` 且匹配到 session provider 时，使用 `createSessionLogger(sessionId)` 创建会话日志器，将后续所有日志（请求体、响应状态、错误信息）写入会话独立文件。
- `logRequest()` 中，作为默认日志器回退，记录 uvicorn 风格的请求日志条目。
- `createProxyRouter()` 中，用于记录路由级错误。

**涉及源文件及职责**：

| 源文件 | 职责 |
|--------|------|
| `src/server/anthropic/logger.ts` | 定义并导出 `proxyLogger` 全局实例和 `createSessionLogger()` 工厂函数，包含日志格式、目录创建、缓存管理和静默降级逻辑 |

## Architecture / Flow

### 日志器创建与缓存流程

```
proxyLogger (模块加载时立即创建)
  |
  +-- ensureProxyLogDir()
  |     |-- 检查 ~/.furina/logs/ 是否存在
  |     |-- 不存在则 fs.mkdirSync({ recursive: true })
  |
  +-- winston.createLogger({ level: 'info', transports: [File] })
  |     |-- 格式: timestamp + padded level + message
  |     |-- 目标: ~/.furina/logs/anthropic.log
  |
  +-- catch: 返回 silent: true 的空日志器

createSessionLogger(sessionId)
  |
  +-- 懒清理: 遍历 sessionLoggerCache，删除 expiresAt <= now 的条目
  |
  +-- 缓存命中? (expiresAt > now)
  |     |-- 是: 直接返回缓存的 logger
  |     |-- 否: 继续创建
  |
  +-- fs.mkdirSync ~/.furina/sessions/<sessionId>/
  |
  +-- winston.createLogger({ level: 'info', transports: [File] })
  |     |-- 格式: 同 proxyLogger
  |     |-- 目标: ~/.furina/sessions/<sessionId>/anthropic.log
  |
  +-- 缓存: sessionLoggerCache.set(sessionId, { logger, expiresAt: now + 1h })
  |
  +-- catch: 返回 silent: true 的空日志器
```

### 调用链路

```
createProxyRouter() ─────┐
  HEAD / → logRequest() ─┤── proxyLogger (全局回退)
  Error handler ──────────┘
                            │
proxyRequestHandler() ───┐
  sessionId 无效或缺失 ───┤── proxyLogger
  sessionId 有效 ─────────┤── createSessionLogger(sessionId)
  tryLogLastMessage() ────┤── activeLogger.info()
  handleAxiosError() ─────┘── activeLogger.error() / activeLogger.warn()
```

## Functionality / Interface Details

### `ensureProxyLogDir() -> void`

**Source**: `src/server/anthropic/logger.ts`:23-27

**Functionality**: 确保全局代理日志目录 `~/.furina/logs/` 存在。如果目录不存在则递归创建。此函数是 `createProxyLogger()` 的内部辅助函数，不对外导出。调用 `fs.mkdirSync` 的 `{ recursive: true }` 选项确保父目录链也会被自动创建。

**Parameters**: 无

**Return Value**: 无返回值。如果目录创建失败（如权限不足），会抛出异常，由调用方 `createProxyLogger()` 的 try-catch 捕获。

**Core Logic**:
- 使用 `fs.existsSync()` 检查目录是否已存在，避免重复创建。
- 使用 `fs.mkdirSync()` 的 `recursive: true` 模式递归创建目录链（`~/.furina/logs/` 可能涉及多级不存在的目录）。

**Core Code**:
```typescript
function ensureProxyLogDir(): void {
  if (!fs.existsSync(PROXY_LOG_DIR)) {
    fs.mkdirSync(PROXY_LOG_DIR, { recursive: true });
  }
}
```
Source: `src/server/anthropic/logger.ts`:23-27

**Usage Example**:
```typescript
// 内部调用，不直接使用
// 在 createProxyLogger() 中：
ensureProxyLogDir();
```
Explanation: 此函数为模块内部辅助函数，不导出。在 `createProxyLogger()` 执行时自动调用，确保日志目录存在。

---

### `createProxyLogger() -> winston.Logger`

**Source**: `src/server/anthropic/logger.ts`:34-55

**Functionality**: 创建并返回一个独立的 winston 日志实例，用于全局代理日志记录。日志写入 `~/.furina/logs/anthropic.log`。如果目录创建或日志器初始化失败（如权限错误），则静默降级返回一个 `silent: true` 的空日志器，确保不会因为日志系统故障影响代理主流程。

**Parameters**: 无

**Return Value**:
- `winston.Logger`: 配置好的 winston 日志实例，日志级别为 `info`，使用文件传输。
- 降级情况：返回 `winston.createLogger({ silent: true })`，所有日志调用会被静默忽略。

**Core Logic**:
1. 调用 `ensureProxyLogDir()` 确保日志目录存在。
2. 使用 `winston.createLogger()` 创建日志器：
   - `exitOnError: false`：日志错误不会导致进程退出。
   - `level: 'info'`：记录 info 及以上级别（info、warn、error）。
   - 格式组合：先添加 `timestamp`（格式 `YYYY-MM-DD HH:mm:ss,SSS`），再通过 `printf` 自定义输出格式。
   - 传输层：单一 `File` 传输，写入 `PROXY_LOG_FILE` 常量指定的路径。
3. `printf` 格式器中，对日志级别字符串执行 `padStart(7).slice(0, 7)` 操作，将级别名称填充到固定 7 字符宽度（如 `"  info "`、`"  error"`），确保日志文件中各列对齐。
4. 如果 `try` 块中发生任何异常，捕获后返回静默日志器。

**Core Code**:
```typescript
function createProxyLogger(): winston.Logger {
  try {
    ensureProxyLogDir();
    return winston.createLogger({
      exitOnError: false,
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss,SSS' }),
        winston.format.printf((info) => {
          const level = String(info.level).padStart(7).slice(0, 7);
          return `${info.timestamp} ${level} ${info.message}`;
        }),
      ),
      transports: [
        new winston.transports.File({ filename: PROXY_LOG_FILE }),
      ],
    });
  } catch {
    // Permission error or other failure; use silent logger
    return winston.createLogger({ silent: true });
  }
}
```
Source: `src/server/anthropic/logger.ts`:34-55

**Usage Example**:
```typescript
// 模块加载时立即创建全局单例
export const proxyLogger = createProxyLogger();

// 后续使用
proxyLogger.info('Some info message');
proxyLogger.error('Something went wrong');
```
Explanation: `createProxyLogger()` 在模块加载时被调用一次，返回的实例赋值给 `proxyLogger` 导出常量。整个应用生命周期中只存在一个全局代理日志实例。

---

### `proxyLogger: winston.Logger` (导出常量)

**Source**: `src/server/anthropic/logger.ts`:57

**Functionality**: 全局代理日志器单例，在模块加载时通过 `createProxyLogger()` 创建。作为所有不绑定特定 session 的代理日志的统一输出点。写入 `~/.furina/logs/anthropic.log`。

**导出方式**: `export const proxyLogger = createProxyLogger();`

**使用方式**: 直接通过 `proxyLogger.info()`、`proxyLogger.error()`、`proxyLogger.warn()` 调用。

---

### `createSessionLogger(sessionId: string) -> winston.Logger`

**Source**: `src/server/anthropic/logger.ts`:73-118

**Functionality**: 创建或从缓存中获取一个会话级 winston 日志实例。每个 session 的日志写入独立文件 `~/.furina/sessions/<sessionId>/anthropic.log`，实现请求日志的会话隔离。

缓存机制使用模块级 `Map<string, { logger, expiresAt }>` 实现 1 小时 TTL。每次调用时，先执行懒清理（lazy cleanup）遍历并删除所有过期条目，然后检查目标 sessionId 是否有未过期的缓存。命中缓存则直接返回，未命中则创建新的日志器并缓存。

如果目录创建或日志器初始化失败，静默降级返回 `silent: true` 的空日志器。

**Parameters**:
- `sessionId` (`string`): 唯一会话标识符。来源于请求体中 `metadata.user_id` JSON 字段解析出的 `session_id`。用作日志目录名和缓存键。

**Return Value**:
- `winston.Logger`: 配置好的 winston 日志实例，日志级别为 `info`，使用文件传输写入会话独立日志文件。
- 降级情况：返回 `winston.createLogger({ silent: true })`，所有日志调用被静默忽略。

**Core Logic**:

1. **懒清理阶段**：遍历 `sessionLoggerCache` Map，删除所有 `expiresAt <= Date.now()` 的条目。这是一种惰性 GC 策略——不依赖定时器，只在调用时触发清理，降低维护复杂度。

2. **缓存查找阶段**：检查 `sessionLoggerCache` 中是否存在目标 `sessionId` 且未过期的条目（`expiresAt > now`）。命中则直接返回缓存的 logger 实例。

3. **创建阶段**（缓存未命中时）：
   - 构建会话日志目录路径：`~/.furina/sessions/<sessionId>/`
   - 构建日志文件路径：`~/.furina/sessions/<sessionId>/anthropic.log`
   - 如果目录不存在，使用 `fs.mkdirSync({ recursive: true })` 创建
   - 使用 `winston.createLogger()` 创建日志器，配置与 `createProxyLogger()` 完全一致（相同的格式、级别、transport 类型）
   - 将新创建的 logger 缓存到 `sessionLoggerCache`，TTL 为 `CACHE_TTL_MS`（1 小时 = 3600000 毫秒）

4. **异常处理**：如果任何步骤抛出异常，捕获后返回 `silent: true` 的空日志器。

**Core Code**:
```typescript
const sessionLoggerCache = new Map<string, { logger: winston.Logger; expiresAt: number }>();
const CACHE_TTL_MS = 3600000; // 1 hour

export function createSessionLogger(sessionId: string): winston.Logger {
  // Lazy cleanup: remove expired entries from cache
  const now = Date.now();
  for (const [cachedId, cached] of sessionLoggerCache) {
    if (cached.expiresAt <= now) {
      sessionLoggerCache.delete(cachedId);
    }
  }

  // Return cached logger if valid
  const cached = sessionLoggerCache.get(sessionId);
  if (cached && cached.expiresAt > now) {
    return cached.logger;
  }

  try {
    const sessionLogDir = path.join(os.homedir(), '.furina', 'sessions', sessionId);
    const sessionLogFile = path.join(sessionLogDir, 'anthropic.log');

    if (!fs.existsSync(sessionLogDir)) {
      fs.mkdirSync(sessionLogDir, { recursive: true });
    }

    const logger = winston.createLogger({
      exitOnError: false,
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss,SSS' }),
        winston.format.printf((info) => {
          const level = String(info.level).padStart(7).slice(0, 7);
          return `${info.timestamp} ${level} ${info.message}`;
        }),
      ),
      transports: [
        new winston.transports.File({ filename: sessionLogFile }),
      ],
    });

    sessionLoggerCache.set(sessionId, { logger, expiresAt: now + CACHE_TTL_MS });
    return logger;
  } catch {
    return winston.createLogger({ silent: true });
  }
}
```
Source: `src/server/anthropic/logger.ts`:59-118

**Usage Example**:
```typescript
import { createSessionLogger } from './logger.js';

// 在 proxyRequestHandler 中，当请求包含有效 session_id 时
const sessionId = 'abc123-session';
const sessionLogger = createSessionLogger(sessionId);

// 后续对该 session 的所有日志写入独立文件
sessionLogger.info('Request forwarded to upstream');
sessionLogger.error('Upstream connection refused');

// 同一 sessionId 在 1 小时内重复调用会返回缓存的实例
const sameLogger = createSessionLogger(sessionId);
// sameLogger === sessionLogger  (同一实例)
```
Explanation: `createSessionLogger()` 在 `proxyRequestHandler()` 中被调用，当请求体的 `metadata.user_id` 解析出有效 `session_id` 且匹配到 session provider 时，创建会话日志器。之后该请求的所有日志（请求体记录、上游响应状态、错误信息）都写入会话独立文件。同一 session 在 1 小时内的后续请求会复用缓存的日志实例。

---

## Data Structures

### 常量 `PROXY_LOG_DIR`

```typescript
const PROXY_LOG_DIR = path.join(os.homedir(), '.furina', 'logs');
```
- 全局代理日志目录路径。使用 `os.homedir()` 获取用户主目录，拼接 `~/.furina/logs/`。

### 常量 `PROXY_LOG_FILE`

```typescript
const PROXY_LOG_FILE = path.join(PROXY_LOG_DIR, 'anthropic.log');
```
- 全局代理日志文件完整路径：`~/.furina/logs/anthropic.log`。

### 常量 `CACHE_TTL_MS`

```typescript
const CACHE_TTL_MS = 3600000; // 1 hour
```
- 会话日志器缓存的 TTL 时长，单位毫秒。1 小时 = 3,600,000 毫秒。

### 缓存结构 `sessionLoggerCache`

```typescript
const sessionLoggerCache = new Map<string, { logger: winston.Logger; expiresAt: number }>();
```
- 模块级 `Map`，键为 `sessionId`（string），值为包含 `logger` 实例和 `expiresAt` 过期时间戳的对象。
- `expiresAt` 为 `Date.now() + CACHE_TTL_MS` 计算的绝对过期时间戳。

### 日志输出格式

```
YYYY-MM-DD HH:mm:ss,SSS {padded_level} {message}
```
示例：
```
2026-07-05 14:30:25,123    info Request forwarded to upstream
2026-07-05 14:30:25,456   error Upstream connection refused: ECONNREFUSED
```
- 时间戳格式 `YYYY-MM-DD HH:mm:ss,SSS`（毫秒精度）
- 级别字符串固定 7 字符宽度，右对齐（通过 `padStart(7).slice(0, 7)` 实现）

## Error Handling and Edge Cases

### 目录创建失败

当 `ensureProxyLogDir()` 或 `createSessionLogger()` 中的 `fs.mkdirSync()` 因权限不足等原因抛出异常时，`try-catch` 捕获异常并返回 `winston.createLogger({ silent: true })`。这确保了日志系统的故障不会影响代理主流程——所有对静默日志器的 `info()`、`error()`、`warn()` 调用都会被静默忽略。

### 文件写入失败

如果 winston 的 `File` transport 在运行时遇到写入错误（如磁盘满、文件被删除），winston 内部会处理这些错误。由于设置了 `exitOnError: false`，写入失败不会导致进程退出。

### sessionId 包含特殊字符

`createSessionLogger()` 直接将 `sessionId` 用作文件路径的一部分（`path.join(os.homedir(), '.furina', 'sessions', sessionId)`）。如果 `sessionId` 包含路径分隔符或其他特殊字符，可能导致非预期的目录结构或路径遍历问题。当前代码未对此做额外校验——上游 `proxyRequestHandler()` 中 `sessionId` 来源于客户端请求体中的 `metadata.user_id` JSON 字段。

### 缓存条目泄漏

懒清理策略在每次 `createSessionLogger()` 调用时遍历整个 Map。如果大量不同 sessionId 被使用且很少重复调用，Map 可能积累较多过期条目。但由于懒清理在每次调用时都会执行全量清理，实际上过期条目不会长期驻留。唯一的边界情况是：如果一个 sessionId 创建后再也没有被请求过，它的缓存条目会在下一次任意 sessionId 的 `createSessionLogger()` 调用时被清理。

### 全局实例的模块加载时序

`proxyLogger` 在模块首次被 import 时立即创建。如果此时用户主目录不可访问（如网络挂载的 home 目录暂不可用），会导致全局日志器降级为静默模式，且在进程生命周期内无法恢复。

## Dependencies

### Depends on

| 依赖 | 类型 | 说明 |
|------|------|------|
| `winston` | npm 包 | 日志框架，提供 `createLogger`、`format`、`transports` 等核心能力 |
| `os` | Node.js 内置模块 | `os.homedir()` 获取用户主目录路径 |
| `path` | Node.js 内置模块 | `path.join()` 构建文件路径 |
| `fs` | Node.js 内置模块 | `fs.existsSync()` 检查目录、`fs.mkdirSync()` 创建目录 |

### Depended by

| 模块/Spec | 文件 | 使用方式 |
|-----------|------|----------|
| spec-proxy-handler | `src/server/anthropic/handler.ts` | 导入 `proxyLogger` 和 `createSessionLogger`。`proxyRequestHandler()` 中根据 session 有效性选择使用 `proxyLogger`（全局回退）或 `createSessionLogger(sessionId)`（会话级日志）。传入 `tryLogLastMessage()` 和 `handleAxiosError()` 作为日志器参数。 |
| spec-proxy-router | `src/server/anthropic/router.ts` | 导入 `proxyLogger`。`logRequest()` 中作为默认日志器回退（当调用方未传入自定义 logger 时），`createProxyRouter()` 中用于记录路由级错误。 |

## Usage Examples

### 场景 1：全局代理日志（无 session）

```typescript
import { proxyLogger } from './logger.js';

// 在 router 的错误处理器中记录全局错误
app.use((err, req, res, next) => {
  proxyLogger.error(`${err.message}`);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// 在 logRequest() 中作为默认日志器
const activeLogger = logger || proxyLogger;
activeLogger.info('provider.com:claude-3 - "POST /v1/messages HTTP/1.1" 200 OK');
```
Explanation: 当请求不包含 `session_id` 时，代理使用 `proxyLogger` 记录所有日志。`logRequest()` 中如果调用方未传入 `logger` 参数，也会回退到 `proxyLogger`。

### 场景 2：会话级日志（有 session）

```typescript
import { createSessionLogger, proxyLogger } from './logger.js';

// 在 proxyRequestHandler() 中
let activeLogger = proxyLogger;  // 默认使用全局日志器

if (sessionId) {
  const sessionProvider = getProviderBySessionId(sessionId);
  if (sessionProvider) {
    provider = sessionProvider;
    activeLogger = createSessionLogger(sessionId);  // 切换到会话日志器
  }
}

// 后续所有日志使用 activeLogger
activeLogger.info('Request forwarded to upstream');
activeLogger.error('Upstream connection refused: ECONNREFUSED');
activeLogger.warn('Upstream returned 500: Internal Server Error');
```
Explanation: `proxyRequestHandler()` 先将 `activeLogger` 初始化为 `proxyLogger`，当解析到有效 `session_id` 且匹配到 session provider 时，用 `createSessionLogger(sessionId)` 替换 `activeLogger`。之后该请求的所有日志写入会话独立文件 `~/.furina/sessions/<sessionId>/anthropic.log`。

### 场景 3：日志文件查看

```bash
# 查看全局代理日志
cat ~/.furina/logs/anthropic.log

# 查看特定会话日志
cat ~/.furina/sessions/abc123-session/anthropic.log

# 日志输出示例
# 2026-07-05 14:30:25,123    info provider.com:claude-3-sonnet - "claude-3-sonnet:POST /v1/messages HTTP/1.1" 200 OK
# 2026-07-05 14:30:25,123    info provider.com:claude-3-sonnet - "claude-3-sonnet:POST /v1/messages HTTP/1.1" last message: {"role":"user","content":"Hello"}
# 2026-07-05 14:31:00,456   error provider.com - "POST /v1/messages HTTP/1.1" 502 Bad Gateway - Connection refused: ECONNREFUSED
```
Explanation: 日志格式为 `时间戳 级别(7字符宽) 消息内容`。时间戳精确到毫秒，级别右对齐填充，便于快速扫描和对齐阅读。
