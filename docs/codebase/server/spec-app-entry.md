# App Entry & Server Bootstrap

> Source files:
> - `src/server/index.ts` : 1-71
> - `src/server/entry.ts` : 1-75

## Overview

本 spec 文档覆盖 Furina 服务端的 **应用工厂** 和 **服务器引导** 两个核心职责，分别由 `index.ts` 和 `entry.ts` 承担。

- **`index.ts`** — 负责创建并配置 Express 应用实例（工厂模式）。它挂载所有业务路由模块、提供 React SPA 静态文件服务、支持 `beforeProxy` 钩子用于在代理 catch-all 之前注入自定义路由，并始终挂载 Anthropic API 代理路由。`createApp()` 作为一个纯工厂函数，不包含任何服务端口监听或进程管理逻辑，便于测试和不同部署场景下的复用。

- **`entry.ts`** — 负责服务器的完整引导流程。它调用 `createApp()` 获取应用实例，注册优雅关闭路由（通过 `beforeProxy` 钩子），启动 HTTP 监听，启动定时调度器，并安装全局异常处理。这是 `service-manager.ts` 通过 `spawn()` 以子进程方式启动的入口脚本。

### 设计动机

将应用配置（`index.ts`）与服务器引导（`entry.ts`）分离，实现了关注点分离：
- `createApp()` 可被测试直接调用，无需启动真实 HTTP 服务器
- `entry.ts` 只处理进程级的启动/关闭/异常逻辑
- `beforeProxy` 钩子使得在代理路由之前注册额外路由成为可能（如关闭路由），同时保持 `index.ts` 的通用性

### 调用链路

```
service-manager.ts  (spawn 子进程)
        |
        v
    entry.ts  (服务器引导)
        |
        |--> createApp({ beforeProxy })  <-- index.ts (应用工厂)
        |       |--> providersRouter     (/furina/api/providers)
        |       |--> configRouter        (/furina/api/config)
        |       |--> scheduleRouter      (/furina/api/schedule)
        |       |--> changesRouter       (/furina/api/changes)
        |       |--> mcpRouter           (/furina/mcp)
        |       |--> express.static      (/furina/ui)
        |       |--> SPA fallback        (/furina/ui/*)
        |       |--> beforeProxy hook    (shutdown route)
        |       |--> createProxyRouter   (catch-all proxy)
        |
        |--> app.listen(port)
        |--> startScheduler()
        |--> process.on('uncaughtException' / 'unhandledRejection')
```

## Architecture / Flow

### 应用初始化流程 (`createApp`)

1. 创建 Express 实例，配置 JSON body parser（50MB 限制）
2. 按顺序挂载 5 个业务路由模块（providers、config、schedule、changes、mcp）
3. 解析前端静态文件目录，若存在则提供静态服务 + SPA fallback，否则返回提示信息
4. 调用 `beforeProxy` 钩子（若提供），允许注入额外路由
5. 挂载 Anthropic 代理 catch-all 路由（始终挂载，具体代理逻辑在 handler 中按需判断是否启用）

### 服务器引导流程 (`entry.ts`)

1. 从环境变量 `FURINA_UI_PORT` 读取端口（默认 3939）
2. 调用 `createApp()` 并通过 `beforeProxy` 注册 `/furina/api/shutdown` 路由
3. 调用 `app.listen(port)` 启动 HTTP 监听
4. 监听成功后启动定时调度器 `startScheduler()`
5. 安装 `uncaughtException` 和 `unhandledRejection` 全局处理器

### 关闭流程

1. 收到 `POST /furina/api/shutdown` 请求
2. 立即返回 `{ ok: true }` 给客户端
3. 停止定时调度器 `stopScheduler()`
4. 调用 `server.close()` 等待现有连接关闭
5. 刷新并关闭 proxyLogger
6. 调用 `process.exit()` 退出（成功 0 / 失败 1）

## Functionality / Interface Details

### `createApp(options?) -> express.Application`

**Source**: `src/server/index.ts`:32-70

**Functionality**: 创建并返回一个完整的 Express 应用实例。这是整个 Furina HTTP 服务的应用工厂函数，负责组装所有中间件和路由。它不执行任何端口监听或进程管理操作，纯粹进行应用配置。这种工厂模式允许在测试中直接调用创建应用实例，也允许 `entry.ts` 在调用后注入额外的钩子路由。

**Parameters**:
- `options` (`object`, optional): 可选配置对象
  - `clientDir` (`string`, optional): 前端构建产物目录路径。默认为 `dist/client/`（相对于编译输出位置计算）。用于自定义前端静态文件的查找位置
  - `beforeProxy` (`(app: express.Application) => void`, optional): 在代理 catch-all 路由注册之前调用的钩子函数。接收当前 Express 实例作为参数，可在其中注册自定义路由。用于在不影响 `index.ts` 通用性的前提下注入特定路由（如关闭路由）

**Return Value**:
- `express.Application`: 已完整配置的 Express 应用实例，可直接调用 `app.listen()` 启动服务

**Core Logic**:

函数内部按严格的顺序执行以下步骤：

1. **Body Parser 配置**: 设置 `express.json({ limit: '50mb' })` 以支持大体积请求体（如 MCP 工具调用的大型 payload）

2. **业务路由挂载**: 按固定顺序挂载 5 个路由模块，顺序决定了路由匹配优先级：
   - `/furina/api/providers` — Provider 管理 CRUD API
   - `/furina/api/config` — 配置管理 API（语言等）
   - `/furina/api/schedule` — 调度器控制 API
   - `/furina/api/changes` — 变更管理 API
   - `/furina/mcp` — MCP 工具服务

3. **前端静态文件服务**: 通过 `fs.existsSync()` 检查客户端构建目录是否存在：
   - **存在时**: 先用 `express.static()` 提供静态文件（`redirect: false` 禁用目录重定向），再注册 SPA fallback（对任何未匹配静态文件的 `/furina/ui/*` 子路径返回 `index.html`）
   - **不存在时**: 返回 200 + 纯文本提示信息，告知用户需要先构建前端

4. **beforeProxy 钩子**: 若 options 中提供了 `beforeProxy`，在此时调用它，使调用方能在代理路由之前注册自定义路由

5. **代理路由挂载**: 始终挂载 `createProxyRouter()` 返回的路由。代理路由内部是 catch-all（`router.all('{*catchall}')`），因此必须最后挂载，否则会拦截所有请求

**Core Code**:
```typescript
export function createApp(options?: { clientDir?: string; beforeProxy?: (app: express.Application) => void }): express.Application {
  const app = express.default();
  app.use(express.default.json({ limit: '50mb' }));

  // API routes
  app.use('/furina/api/providers', providersRouter);
  app.use('/furina/api/config', configRouter);
  app.use('/furina/api/schedule', scheduleRouter);
  app.use('/furina/api/changes', changesRouter);
  app.use('/furina/mcp', mcpRouter);

  // Resolve client directory
  const clientDir = options?.clientDir ?? defaultClientDir;

  // UI static files or missing-build message
  if (fs.existsSync(clientDir)) {
    app.use('/furina/ui', express.default.static(clientDir, { redirect: false }));
    app.use('/furina/ui', (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'), { dotfiles: 'allow' });
    });
  } else {
    const message = 'The UI needs to be built first. Please run the build command to generate the frontend assets.';
    app.use('/furina/ui', (_req, res) => {
      res.status(200).type('text/plain').send(message);
    });
  }

  if (options?.beforeProxy) {
    options.beforeProxy(app);
  }

  app.use(createProxyRouter());

  return app;
}
```
Source: `src/server/index.ts`:32-70

**Usage Example**:
```typescript
// 测试中直接创建应用实例（无需启动 HTTP 服务器）
import { createApp } from './server/index.js';
import request from 'supertest';

const app = createApp({ clientDir: '/path/to/test/fixtures/client' });
const res = await request(app).get('/furina/api/config');
// res.status === 200, res.body 包含当前配置

// 带 beforeProxy 钩子创建（entry.ts 的实际用法）
const app = createApp({
  beforeProxy: (app) => {
    app.post('/furina/api/shutdown', (req, res) => {
      res.json({ ok: true });
      server.close();
    });
  },
});
```
Explanation: 第一个示例展示在测试中如何使用 `createApp()` 创建独立的应用实例并发起 HTTP 请求测试。第二个示例展示了 `entry.ts` 的实际用法——通过 `beforeProxy` 钩子注入关闭路由。

---

### `writeErrorLog(message: string) -> void`

**Source**: `src/server/entry.ts`:23-29

**Functionality**: 将错误信息追加写入 `~/.furina/logs/error.log` 文件。这是 `entry.ts` 的内部工具函数，专门用于记录未捕获异常和服务器错误，确保即使在异常情况下也能持久化错误信息以便后续排查。与 `proxyLogger`（基于 winston，用于代理请求日志）和 `appendLog`（用于调度器日志）不同，此函数使用最简单的同步文件追加方式写入，不依赖任何日志库，保证在任何极端情况下都能可靠工作。

**Parameters**:
- `message` (`string`): 要记录的错误消息文本

**Return Value**:
- `void`: 无返回值

**Core Logic**:

1. 检查日志目录 `~/.furina/logs/` 是否存在，不存在则递归创建
2. 生成 ISO 8601 格式时间戳
3. 以同步追加方式写入文件，格式为 `[ISO时间戳] 消息\n`

**Core Code**:
```typescript
function writeErrorLog(message: string): void {
  if (!fs.existsSync(ERROR_LOG_DIR)) {
    fs.mkdirSync(ERROR_LOG_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(ERROR_LOG_FILE, `[${timestamp}] ${message}\n`, 'utf-8');
}
```
Source: `src/server/entry.ts`:23-29

**Usage Example**:
```typescript
// 在全局异常处理器中调用
process.on('uncaughtException', (err) => {
  writeErrorLog(`Uncaught exception: ${err.message}\n${err.stack || ''}`);
});

// 日志文件内容示例：
// [2026-07-05T08:30:00.123Z] Uncaught exception: Connection refused
// Error: Connection refused
//     at ...
```
Explanation: `writeErrorLog` 仅在 `entry.ts` 内部使用，通过 `process.on` 全局处理器捕获未处理的异常和 Promise 拒绝，以及 `server.close` 回调中的错误。

---

### 服务器启动与监听

**Source**: `src/server/entry.ts`:31-61

**Functionality**: `entry.ts` 的顶层执行逻辑，负责读取端口配置、创建应用实例、启动 HTTP 监听和调度器。这不是一个独立函数，而是模块级别的执行流。

**核心流程**:

1. **端口解析**: 从环境变量 `FURINA_UI_PORT` 读取端口号，默认使用 3939。使用 `parseInt` 进行进制转换

2. **应用创建**: 调用 `createApp()` 并传入 `beforeProxy` 钩子。钩子内部注册 `POST /furina/api/shutdown` 路由，该路由在收到关闭请求后：
   - 记录关闭日志（proxyLogger + schedule-logger）
   - 立即返回 `{ ok: true }` 给客户端
   - 停止调度器 `stopScheduler()`
   - 调用 `server.close()` 启动优雅关闭
   - 刷新 proxyLogger 后调用 `process.exit()`

3. **监听启动**: 调用 `app.listen(port)` 启动 HTTP 服务器，成功后：
   - 记录调度器启动日志
   - 调用 `startScheduler()` 启动内存同步定时调度器

4. **服务器错误处理**: 注册 `server.on('error')` 处理器，将错误写入 error.log

**Core Code**:
```typescript
const port = process.env.FURINA_UI_PORT ? parseInt(process.env.FURINA_UI_PORT, 10) : 3939;

let server: http.Server;

const app = createApp({
  beforeProxy: (app) => {
    app.post('/furina/api/shutdown', (_req, res) => {
      proxyLogger.info('Server shutdown requested, closing connections...');
      appendLog('Server shutdown requested');
      res.json({ ok: true });
      stopScheduler();
      server.close((err?: Error) => {
        if (err) {
          writeErrorLog(`Server close error: ${err.message}`);
          proxyLogger.info('Server shutdown complete');
          proxyLogger.end(() => process.exit(1));
          return;
        }
        proxyLogger.info('Server shutdown complete');
        proxyLogger.end(() => process.exit(0));
      });
    });
  },
});

server = app.listen(port, () => {
  appendLog(`Server started on port ${port}, starting scheduler`);
  startScheduler();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  writeErrorLog(`Server error: ${err.message}`);
});
```
Source: `src/server/entry.ts`:31-65

**Usage Example**:
```bash
# 通过 service-manager 以子进程方式启动（实际调用链）
# service-manager.ts 中：
#   spawn(process.execPath, ['dist/server/entry.js'], {
#     env: { ...process.env, FURINA_UI_PORT: '3939' }
#   })

# 或直接运行：
FURINA_UI_PORT=3939 node dist/server/entry.js

# 关闭服务器：
curl -X POST http://localhost:3939/furina/api/shutdown
# 响应: {"ok": true}
```
Explanation: `entry.ts` 不是被直接 import 的模块，而是作为独立脚本被 `service-manager.ts` 通过 `spawn()` 以子进程方式启动。环境变量 `FURINA_UI_PORT` 由父进程注入。关闭操作通过发送 HTTP POST 请求到 shutdown 路由触发。

---

### 全局异常处理器

**Source**: `src/server/entry.ts`:68-74

**Functionality**: 安装 `uncaughtException` 和 `unhandledRejection` 全局事件处理器，防止因未捕获的异常导致进程崩溃退出。所有未处理的错误都会被记录到 `~/.furina/logs/error.log`，服务器继续运行。

**Core Logic**:
- `uncaughtException`: 捕获未被 try/catch 处理的同步异常，记录错误消息和调用栈
- `unhandledRejection`: 捕获未被 `.catch()` 处理的 Promise 拒绝，记录拒绝原因（兼容 Error 对象和非 Error 值）

**Core Code**:
```typescript
process.on('uncaughtException', (err) => {
  writeErrorLog(`Uncaught exception: ${err.message}\n${err.stack || ''}`);
});

process.on('unhandledRejection', (reason) => {
  writeErrorLog(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
```
Source: `src/server/entry.ts`:68-74

**Usage Example**:
```typescript
// 这些处理器在 entry.ts 加载时自动安装
// 之后任何未捕获的异常都会被记录而不是导致进程退出

// 示例：未处理的异步错误
async function riskyOperation() {
  throw new Error('Something went wrong');
}
riskyOperation(); // 无 .catch() — 被 unhandledRejection 捕获并记录

// 日志文件输出：
// [2026-07-05T10:15:30.456Z] Unhandled rejection: Something went wrong
```
Explanation: 安装这些处理器的目的是保持服务端进程的持续运行。即使发生未预期的错误，服务器也不会崩溃，而是将错误记录到文件中供后续排查。这是一种防御性编程策略，适合长期运行的后台服务。

---

## Data Structures

### 环境变量

- `FURINA_UI_PORT` (`string`): HTTP 服务器监听端口，通过 `parseInt` 转为十进制整数。默认值 `3939`。由 `service-manager.ts` 在 spawn 子进程时注入。

### 文件路径常量

- `ERROR_LOG_DIR` (`string`): `~/.furina/logs/` — 错误日志存储目录
- `ERROR_LOG_FILE` (`string`): `~/.furina/logs/error.log` — 错误日志文件路径

### 模块级变量

- `defaultClientDir` (`string`): 默认的前端构建产物目录，通过 `fileURLToPath(import.meta.url)` 解析当前模块位置后计算得出，指向 `dist/client/`
- `server` (`http.Server`): HTTP 服务器实例，声明在模块顶层以便 `beforeProxy` 闭包中访问（用于 `server.close()`）

## Error Handling and Edge Cases

### 客户端构建目录缺失
当 `dist/client/` 目录不存在时（前端尚未构建），`createApp()` 不会报错，而是在 `/furina/ui` 路径下返回纯文本提示信息（HTTP 200），告知用户需要先构建前端。

### 服务器端口占用
当端口被占用时，`server.on('error')` 捕获 `EADDRINUSE` 错误并写入 error.log。注意 `entry.ts` 中没有端口重试或自动选择备用端口的逻辑——错误被记录但进程不会主动退出（依赖全局异常处理器保持存活）。

### 关闭过程中的错误
`server.close()` 回调中的错误被单独处理：记录到 error.log，然后以 `process.exit(1)` 退出。正常关闭则以 `process.exit(0)` 退出。在两种情况下，都会先刷新 `proxyLogger` 再退出。

### 请求体大小限制
JSON body parser 设置了 50MB 的限制。超过此限制的请求会被 Express 自动拒绝（413 Payload Too Large）。

### SPA Fallback 与 dotfiles
SPA fallback 使用 `{ dotfiles: 'allow' }` 选项，允许访问以点号开头的文件。这确保了某些可能以点号命名的前端资源可以正常访问。

## Dependencies

### Depends on
- `src/server/routes/providers.ts` — Provider CRUD API 路由
- `src/server/routes/config.ts` — 配置管理 API 路由
- `src/server/routes/schedule.ts` — 调度器控制 API 路由
- `src/server/changes/index.ts` — 变更管理 API 路由
- `src/server/mcp/index.ts` — MCP 工具服务路由
- `src/server/anthropic/router.ts` — Anthropic API 代理路由器（`createProxyRouter()`）
- `src/server/anthropic/logger.ts` — 代理日志记录器（`proxyLogger`，用于关闭时刷新）
- `src/server/memory/scheduler.ts` — 定时调度器生命周期（`startScheduler()`, `stopScheduler()`）
- `src/server/memory/schedule-logger.ts` — 调度器日志追加（`appendLog()`）

### Depended by
- `src/server/service-manager.ts` — 通过 `spawn('dist/server/entry.js')` 以子进程方式启动 entry.ts
- 测试代码 — 通过直接调用 `createApp()` 创建应用实例进行集成测试

## Usage Examples

### 完整的服务器启动场景

```typescript
// === service-manager.ts 实际调用方式 ===
import { startBackendService } from './server/service-manager.js';

// 启动后台 UI 服务（内部 spawn entry.ts 子进程）
const uiUrl = startBackendService(3939);
// uiUrl === 'http://localhost:3939/furina/ui'
// 子进程通过环境变量 FURINA_UI_PORT=3939 启动 entry.ts
```

Explanation: `service-manager.ts` 是外部调用入口，它通过 `spawn()` 创建一个独立的子进程来运行 `entry.ts`。端口号通过环境变量传递。子进程启动后会创建 PID 文件用于后续关闭操作。

### 测试中使用 createApp

```typescript
// === 集成测试示例 ===
import { createApp } from '../../src/server/index.js';
import request from 'supertest';

describe('API Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    // 创建独立的应用实例，使用测试专用的客户端目录
    app = createApp({ clientDir: './test/fixtures/client' });
  });

  it('should serve config API', async () => {
    const res = await request(app).get('/furina/api/config');
    expect(res.status).toBe(200);
  });

  it('should serve UI when client dir exists', async () => {
    const res = await request(app).get('/furina/ui');
    expect(res.status).toBe(200);
  });
});
```

Explanation: 测试中可以直接调用 `createApp()` 创建应用实例，无需启动真实 HTTP 服务器。通过 supertest 等库可以在不占用端口的情况下发送 HTTP 请求并验证响应。

### 自定义 beforeProxy 钩子

```typescript
// === 扩展应用 — 在代理之前注册自定义路由 ===
import { createApp } from './server/index.js';

const app = createApp({
  beforeProxy: (app) => {
    // 注册健康检查端点（在代理 catch-all 之前）
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });

    // 注册自定义 API 扩展
    app.post('/furina/api/custom', (req, res) => {
      // 自定义业务逻辑
      res.json({ processed: true });
    });
  },
});

app.listen(3939);
```

Explanation: `beforeProxy` 钩子是扩展应用路由的推荐方式。通过此钩子注册的路由会在代理 catch-all 之前被匹配，确保不会被代理拦截。entry.ts 使用此机制注入关闭路由，第三方代码也可以使用同样的方式注入自定义功能。

---
