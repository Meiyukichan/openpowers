# Schedule API Routes

> Source files:
> - `src/server/routes/schedule.ts` : 1-73

## Overview

Schedule Routes 是 Furina 服务端 Express REST API 路由层中专门负责调度器生命周期控制的路由模块。该模块为 Web UI 前端提供通过 HTTP 协议启动、停止和重启内存调度器的接口。

**在系统中的角色与定位**：本模块是 Express 路由层（routes-api 子模块）的一部分，与 providers routes（provider 管理）和 config routes（配置管理）并列，共同构成服务端对外暴露的 REST API。Schedule Routes 本身不包含任何调度业务逻辑，而是作为薄代理层（thin delegation layer），将 HTTP 请求委托给底层的 `memory/scheduler.ts` 中的调度器生命周期函数（`startScheduler`、`stopScheduler`、`isSchedulerRunning`），并通过 `memory/schedule-logger.ts` 的 `appendLog()` 为每次 API 调用记录审计日志。

**设计动机**：
- **远程控制调度器**：调度器作为后台 Cron 任务运行，需要一个 HTTP 接口供前端 UI 和外部系统（如 `syncDesignToMemory` 的 HTTP PUT 调用）远程控制其启停，而非依赖进程内直接调用
- **幂等性设计**：PUT 和 DELETE 路由采用幂等语义——重复启动或停止不会产生副作用，调用方可安全重试
- **审计追踪**：每次 API 调用都通过 `appendLog()` 写入日志，使得运维人员可以通过 `dreamwork.log` 追溯所有调度器控制操作的时间和具体内容
- **分离关注点**：路由层只负责请求解析和响应格式化，调度器的实际启停逻辑完全封装在 `scheduler.ts` 中，保持单一职责

**使用场景**：
- Web UI 前端通过 PUT 请求启动调度器（如用户在界面中点击"启用调度"按钮）
- Web UI 前端通过 DELETE 请求停止调度器（如用户点击"停止调度"按钮）
- Web UI 前端通过 POST 请求重启调度器（如用户点击"重启调度"按钮）
- `syncDesignToMemory()` 函数在同步设计文件到全局内存后，自动发送 HTTP PUT 请求确保调度器处于运行状态
- 服务器关闭流程中通过 `stopScheduler()` 停止调度器（不经过本路由，直接调用 scheduler 模块）

**涉及源文件及职责**：
- `src/server/routes/schedule.ts`（1-73 行）：Express Router 定义和三个路由处理函数（PUT `/`、DELETE `/`、POST `/restart`），委托给 scheduler 模块的生命周期函数

## Architecture / Flow

Schedule Routes 的调用流程遵循经典的 Express 路由委托模式：

```
Web UI 前端 / syncDesignToMemory()
    │
    │  HTTP PUT / DELETE / POST
    ▼
Express app.use('/furina/api/schedule', scheduleRouter)
    │
    ├─ PUT ────────────────► scheduleRouter.put('/')
    │                            │
    │                            ├── isSchedulerRunning() → 已运行 → { ok: true, started: false }
    │                            │
    │                            └── 未运行 → startScheduler() → { ok: true, started: true }
    │
    ├─ DELETE ──────────────► scheduleRouter.delete('/')
    │                            │
    │                            ├── isSchedulerRunning() → 已运行 → stopScheduler() → { ok: true, stopped: true }
    │                            │
    │                            └── 未运行 → { ok: true, stopped: false }
    │
    └─ POST /restart ──────► scheduleRouter.post('/restart')
                                 │
                                 └── try { stopScheduler() + startScheduler() } → { ok: true, restarted: true }
                                     catch → { ok: false, error: <message> }
```

**路由挂载位置**：在 `src/server/index.ts` 的 `createApp()` 函数中，`scheduleRouter` 被挂载到 `/furina/api/schedule` 路径下，位于 providers routes 和 config routes 之后、changes routes 之前。

**请求处理链**：
1. Express JSON body parser 解析请求体（50mb 限制）
2. 请求路由到 `scheduleRouter`
3. 路由处理函数调用 `isSchedulerRunning()` 查询当前状态
4. 根据路由类型和当前状态执行相应操作（启动/停止/重启）
5. 调用 `appendLog()` 记录操作日志
6. 返回 JSON 响应

## Functionality / Interface Details

### `PUT /furina/api/schedule` - 启动调度器（幂等）

**Source**: `src/server/routes/schedule.ts`:29-39

**Functionality**: 检查调度器是否正在运行，如果未运行则启动它，如果已运行则不做任何操作。这是一个幂等操作——无论调用多少次，结果都相同（调度器处于运行状态）。该接口是 `syncDesignToMemory()` 在设计文件同步完成后确保调度器运行的关键触发点。

**参数**:
- `_req` (`express.Request`): Express 请求对象，不使用请求体或查询参数
- `res` (`express.Response`): Express 响应对象，用于返回 JSON 结果

**返回值**:
- `200 OK` + `{ ok: true, started: true }`：调度器之前未运行，本次请求成功启动
- `200 OK` + `{ ok: true, started: false }`：调度器已经在运行，本次请求未做任何操作
- 该路由不会返回错误状态码（`startScheduler()` 和 `isSchedulerRunning()` 内部会自行处理异常）

**Core Logic**:

路由处理函数首先调用 `isSchedulerRunning()` 判断调度器是否处于运行状态。`isSchedulerRunning()` 检查的是 `scheduler.ts` 中的模块级变量 `cronTask`（类型为 `cron.ScheduledTask | null`）是否为非空。如果调度器已在运行，直接记录日志并返回 `{ started: false }` 的响应。如果调度器未运行，先通过 `appendLog()` 记录"正在启动调度器"的操作日志，然后调用 `startScheduler()` 启动 Cron 任务，最后返回 `{ started: true }` 的响应。

`startScheduler()` 内部会再次检查 `cronTask` 是否已存在（双重检查），并从 `resources/furina.json` 读取 Cron 表达式（默认 `0 2 * * *`），注册并启动 Cron 任务。

**Core Code**:
```typescript
scheduleRouter.put('/', (_req, res) => {
  if (isSchedulerRunning()) {
    appendLog('PUT /schedule: scheduler already running');
    res.status(200).json({ ok: true, started: false });
    return;
  }

  appendLog('PUT /schedule: starting scheduler');
  startScheduler();
  res.status(200).json({ ok: true, started: true });
});
```
Source: `src/server/routes/schedule.ts`:29-39

**Usage Example**:
```typescript
// 从 Web UI 前端发送请求
const response = await fetch('/furina/api/schedule', { method: 'PUT' });
const data = await response.json();
console.log(data); // { ok: true, started: true } 或 { ok: true, started: false }
```
Explanation: 前端调用 PUT 接口启动调度器。如果调度器未运行，返回 `{ started: true }`；如果已运行，返回 `{ started: false }`。无论哪种情况，HTTP 状态码都是 200，调用方可以根据 `started` 字段判断是否有状态变化。

---

### `DELETE /furina/api/schedule` - 停止调度器（幂等）

**Source**: `src/server/routes/schedule.ts`:47-57

**Functionality**: 检查调度器是否正在运行，如果正在运行则停止它，如果未运行则不做任何操作。这是一个幂等操作——无论调用多少次，结果都相同（调度器处于停止状态）。停止操作会销毁底层的 `node-cron` ScheduledTask 实例，释放 Cron 调度资源。

**参数**:
- `_req` (`express.Request`): Express 请求对象，不使用请求体或查询参数
- `res` (`express.Response`): Express 响应对象，用于返回 JSON 结果

**返回值**:
- `200 OK` + `{ ok: true, stopped: true }`：调度器之前正在运行，本次请求成功停止
- `200 OK` + `{ ok: true, stopped: false }`：调度器未运行，本次请求未做任何操作

**Core Logic**:

路由处理函数首先调用 `isSchedulerRunning()` 检查调度器状态。如果调度器正在运行，通过 `appendLog()` 记录停止操作日志，然后调用 `stopScheduler()` 停止并销毁 Cron 任务。`stopScheduler()` 内部依次调用 `cronTask.stop()`（停止调度）、`cronTask.destroy()`（销毁任务实例），并将 `cronTask` 置为 `null`，最后返回 `{ stopped: true }`。如果调度器未运行，记录日志并返回 `{ stopped: false }`。

**Core Code**:
```typescript
scheduleRouter.delete('/', (_req, res) => {
  if (isSchedulerRunning()) {
    appendLog('DELETE /schedule: stopping scheduler');
    stopScheduler();
    res.status(200).json({ ok: true, stopped: true });
    return;
  }

  appendLog('DELETE /schedule: scheduler not running');
  res.status(200).json({ ok: true, stopped: false });
});
```
Source: `src/server/routes/schedule.ts`:47-57

**Usage Example**:
```typescript
// 从 Web UI 前端发送请求
const response = await fetch('/furina/api/schedule', { method: 'DELETE' });
const data = await response.json();
console.log(data); // { ok: true, stopped: true } 或 { ok: true, stopped: false }
```
Explanation: 前端调用 DELETE 接口停止调度器。如果调度器正在运行，返回 `{ stopped: true }`；如果未运行，返回 `{ stopped: false }`。注意：即使调度器未运行，请求仍然成功（200），不会返回错误。

---

### `POST /furina/api/schedule/restart` - 重启调度器

**Source**: `src/server/routes/schedule.ts`:64-73

**Functionality**: 无条件地先停止调度器再重新启动它，实现调度器的重启操作。与 PUT 和 DELETE 的幂等设计不同，restart 路由不检查当前状态——无论调度器是否在运行，都执行 stop + start 的完整重启序列。该操作使用 try-catch 包裹，捕获重启过程中可能出现的异常并返回错误信息。

**参数**:
- `_req` (`express.Request`): Express 请求对象，不使用请求体或查询参数
- `res` (`express.Response`): Express 响应对象，用于返回 JSON 结果

**返回值**:
- `200 OK` + `{ ok: true, restarted: true }`：重启成功
- `500 Internal Server Error` + `{ ok: false, error: string }`：重启过程中发生异常，`error` 字段包含原始错误消息

**Core Logic**:

路由处理函数首先通过 `appendLog()` 记录重启操作日志，然后依次调用 `stopScheduler()` 和 `startScheduler()`。`stopScheduler()` 在调度器未运行时是一个空操作（检查 `cronTask` 是否为 null），因此即使调度器原本未运行，stop 调用也是安全的。`startScheduler()` 同样内置了幂等检查（`if (cronTask) return`），但因为前面已经执行了 stop，此时 `cronTask` 必为 null。

整个过程被 try-catch 包裹。如果 `startScheduler()` 内部的 `readCronFromConfig()` 在读取配置文件时发生不可恢复的异常（如配置文件格式错误且没有合法的 fallback），异常会被捕获，返回 500 错误响应和错误消息。这是本模块中唯一一个有显式错误处理的路由。

**Core Code**:
```typescript
scheduleRouter.post('/restart', (_req, res) => {
  try {
    appendLog('POST /schedule/restart: restarting scheduler');
    stopScheduler();
    startScheduler();
    res.status(200).json({ ok: true, restarted: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
```
Source: `src/server/routes/schedule.ts`:64-73

**Usage Example**:
```typescript
// 从 Web UI 前端发送请求
const response = await fetch('/furina/api/schedule/restart', { method: 'POST' });
const data = await response.json();
if (data.ok) {
  console.log('调度器已重启');
} else {
  console.error('重启失败:', data.error);
}
```
Explanation: 前端调用 POST /restart 接口重启调度器。成功时返回 `{ ok: true, restarted: true }`；失败时返回 500 状态码和错误详情。前端应检查 `ok` 字段决定是否提示用户操作成功或失败。

---

### `scheduleRouter` (Express Router 实例)

**Source**: `src/server/routes/schedule.ts`:17

**Functionality**: 模块导出的 Express Router 实例，封装了所有三个调度器控制路由。该 Router 在 `createApp()` 中被挂载到 `/furina/api/schedule` 路径前缀下。

**Core Code**:
```typescript
export const scheduleRouter = express.default.Router();
```
Source: `src/server/routes/schedule.ts`:17

**Usage Example**:
```typescript
import { scheduleRouter } from './routes/schedule.js';

// 在 Express app 中挂载路由
app.use('/furina/api/schedule', scheduleRouter);
```
Explanation: 在 `createApp()` 中将 `scheduleRouter` 挂载到 `/furina/api/schedule` 路径。挂载后，PUT `/furina/api/schedule`、DELETE `/furina/api/schedule`、POST `/furina/api/schedule/restart` 三个端点自动可用。

## Data Structures

### HTTP 响应格式

所有三个路由返回的 JSON 响应遵循统一格式，通过 `ok` 字段标识操作是否成功：

```typescript
// PUT / 响应 — 成功启动
{ ok: true, started: true }

// PUT / 响应 — 调度器已在运行
{ ok: true, started: false }

// DELETE / 响应 — 成功停止
{ ok: true, stopped: true }

// DELETE / 响应 — 调度器未运行
{ ok: true, stopped: false }

// POST /restart 响应 — 重启成功
{ ok: true, restarted: true }

// POST /restart 响应 — 重启失败
{ ok: false, error: string }
```

- `ok` (`boolean`): 操作是否成功
- `started` / `stopped` / `restarted` (`boolean`): 本次请求是否实际改变了调度器状态（PUT 和 DELETE）或确认重启完成（POST）
- `error` (`string`): 仅在失败时存在，包含原始错误消息

### 导入的依赖接口

```typescript
// 从 scheduler.ts 导入的调度器生命周期函数
import { startScheduler, stopScheduler, isSchedulerRunning } from '../memory/scheduler.js';

// 从 schedule-logger.ts 导入的日志函数
import { appendLog } from '../memory/schedule-logger.js';
```

- `isSchedulerRunning() -> boolean`：检查调度器 Cron 任务是否处于注册状态（`cronTask !== null`）
- `startScheduler() -> void`：从配置读取 Cron 表达式并注册启动 Cron 任务
- `stopScheduler() -> void`：停止并销毁 Cron 任务，将 `cronTask` 置为 null
- `appendLog(message: string) -> void`：向 `~/.furina/memory/dreamwork.log` 追加带时间戳的日志

## Error Handling and Edge Cases

### 错误处理策略

本模块采用**分层错误处理**策略：

1. **PUT 和 DELETE 路由：无显式 try-catch**
   - `isSchedulerRunning()` 是一个简单的 null 检查，不会抛出异常
   - `startScheduler()` 内部有 `if (cronTask) return` 的幂等保护，`readCronFromConfig()` 内部已将所有可能的异常（文件读取、JSON 解析）用 try-catch 捕获并回退到默认值
   - `stopScheduler()` 检查 `cronTask` 是否为 null，不会抛出异常
   - 因此 PUT 和 DELETE 路由不需要显式 try-catch

2. **POST /restart 路由：有显式 try-catch**
   - 由于 restart 组合了 stop + start 两步操作，使用 try-catch 兜底
   - 捕获所有异常后返回 500 状态码和 `err.message`

### 幂等性保证

- **PUT 重复调用**：第一次调用启动调度器，后续调用 `isSchedulerRunning()` 返回 true，直接返回 `{ started: false }`，不会重复启动
- **DELETE 重复调用**：第一次调用停止调度器，后续调用 `isSchedulerRunning()` 返回 false，直接返回 `{ stopped: false }`，不会因停止一个已停止的调度器而出错
- **POST /restart 重复调用**：每次都执行完整的 stop + start 序列，因为 `stopScheduler()` 在未运行时为空操作，`startScheduler()` 在已启动时会再次注册（但前面已执行 stop，所以实际上是从零开始）

### 边界情况

- **服务器启动时**：`entry.ts` 在 `app.listen()` 回调中直接调用 `startScheduler()`，不经过本路由。这意味着服务器一启动调度器就会运行，PUT 路由通常由 `syncDesignToMemory()` 在设计文件同步后调用
- **服务器关闭时**：`entry.ts` 的 `/furina/api/shutdown` 路由直接调用 `stopScheduler()`，不经过本路由
- **并发请求**：Node.js 单线程模型保证路由处理函数的执行是串行的，不存在两个 PUT 请求同时启动调度器的竞态条件

## Dependencies

### Depends on

- **`memory/scheduler.ts`**（`src/server/memory/scheduler.ts`）：提供调度器的三个核心生命周期函数
  - `isSchedulerRunning()`：查询调度器运行状态
  - `startScheduler()`：启动 Cron 任务
  - `stopScheduler()`：停止并销毁 Cron 任务
- **`memory/schedule-logger.ts`**（`src/server/memory/schedule-logger.ts`）：提供 `appendLog()` 函数，用于记录审计日志到 `~/.furina/memory/dreamwork.log`
- **`express`**：Web 框架，提供 `Router()` 工厂函数和 Request/Response 类型

### Depended by

- **`server/index.ts`**（`src/server/index.ts`）：`createApp()` 将 `scheduleRouter` 挂载到 `/furina/api/schedule` 路径下
- **Web UI 前端**：通过 HTTP 请求调用本路由提供的三个接口控制调度器
- **`memory/sync-design.ts`**（`src/server/memory/sync-design.ts`）：`syncDesignToMemory()` 在同步设计文件后，发送 HTTP PUT 请求到 `/furina/api/schedule` 确保调度器运行

## Usage Examples

### 完整场景：从 Web UI 前端控制调度器

```typescript
// 1. 启动调度器
async function enableScheduler(): Promise<void> {
  const res = await fetch('/furina/api/schedule', { method: 'PUT' });
  const data = await res.json();

  if (data.ok && data.started) {
    console.log('调度器已成功启动');
  } else if (data.ok && !data.started) {
    console.log('调度器已在运行中');
  }
}

// 2. 停止调度器
async function disableScheduler(): Promise<void> {
  const res = await fetch('/furina/api/schedule', { method: 'DELETE' });
  const data = await res.json();

  if (data.ok && data.stopped) {
    console.log('调度器已成功停止');
  } else if (data.ok && !data.stopped) {
    console.log('调度器未在运行');
  }
}

// 3. 重启调度器
async function restartScheduler(): Promise<void> {
  const res = await fetch('/furina/api/schedule/restart', { method: 'POST' });
  const data = await res.json();

  if (data.ok) {
    console.log('调度器已成功重启');
  } else {
    console.error('重启失败:', data.error);
  }
}
```

Explanation: 以上三个函数分别展示了前端调用 PUT、DELETE、POST /restart 接口的完整流程。PUT 和 DELETE 都是幂等的，前端可以安全重试。POST /restart 需要处理可能的 500 错误。

### 服务端内部调用：syncDesignToMemory 触发调度器

```typescript
// src/server/memory/sync-design.ts 中的实际调用方式
import http from 'http';

const port = process.env.FURINA_UI_PORT || 3939;
const scheduleUrl = `http://localhost:${port}/furina/api/schedule`;

// 设计文件同步完成后，发送 PUT 请求确保调度器运行
const req = http.request(scheduleUrl, { method: 'PUT', timeout: 5000 }, (res) => {
  res.resume();
  appendLog(`syncDesignToMemory: schedule API responded ${res.statusCode}`);
});
req.on('error', () => {
  appendLog('syncDesignToMemory: schedule API call failed (backend may not be running)');
});
req.end();
```

Explanation: `syncDesignToMemory()` 在将 design.md 复制到全局内存目录后，通过 Node.js `http.request` 向本路由发送 PUT 请求，确保调度器处于运行状态以便后续处理新同步的设计文件。注意设置了 5 秒超时和错误静默处理——如果后端服务未运行，不会影响同步操作本身。

### 服务器启动与关闭的调度器生命周期

```typescript
// src/server/entry.ts 中的启动和关闭逻辑

// 服务器启动时直接调用（不经过路由）
server = app.listen(port, () => {
  appendLog(`Server started on port ${port}, starting scheduler`);
  startScheduler();
});

// 服务器关闭时直接调用（不经过路由）
app.post('/furina/api/shutdown', (_req, res) => {
  appendLog('Server shutdown requested');
  res.json({ ok: true });
  stopScheduler();
  server.close();
});
```

Explanation: 服务器的启动和关闭流程直接调用 `startScheduler()` / `stopScheduler()`，不经过本路由。本路由主要用于运行时的远程控制场景（Web UI 操作、设计文件同步触发）。
