# UI 命令 -- 启动 Express 后端服务器与浏览器打开

> Source files:
> - `src/commands/ui.ts` : 1-81
> - `src/server/service-manager.ts` : 1-65
> - `src/utils/port-manager.ts` : 1-289

## 概述

本 spec 文档详细描述 Furina CLI 中 `ui` 子命令的完整实现，包括后端 Express 服务器的启动、浏览器自动打开、`--restart` 优雅重启、以及端口占用检测等核心功能。

### 定位与职责

`ui` 命令是 Furina CLI 中用于启动 Web UI 的核心入口。它承担以下职责：

- **服务启动**：通过 `service-manager` 在后台以 detached 子进程方式 spawn Express 后端服务器
- **浏览器打开**：根据操作系统平台（Windows/macOS/Linux）使用对应的系统命令打开默认浏览器
- **重复启动防护**：通过端口检测判断服务是否已运行，避免重复启动；若已运行则仅打开浏览器
- **优雅重启**：通过 `--restart` 参数触发优雅关停流程（先发 HTTP shutdown 请求，再轮询端口释放，最后强制 kill 兜底），然后启动新服务
- **命令注册**：通过 Commander.js 注册 `ui` 子命令及其选项

### 使用场景

- 用户在终端执行 `furina ui` 启动 Web UI
- 用户执行 `furina ui --restart` 强制重启 UI 服务
- `init` 命令在初始化完成后自动调用 `runUi({ restart: true })` 启动 UI

### 涉及源文件

| 文件 | 职责 |
|------|------|
| `src/commands/ui.ts` | UI 命令的核心逻辑：浏览器打开、重启流程编排、命令注册 |
| `src/server/service-manager.ts` | 后端服务生命周期管理：spawn detached 子进程、PID 文件写入、返回 UI URL |
| `src/utils/port-manager.ts` | 端口管理工具：端口占用检测、进程终止、优雅关停、端口释放轮询 |
| `src/utils/logger.ts` | 日志工具：基于 winston 的文件日志记录 |

## 架构 / 流程

### 整体调用流程

```
CLI (src/cli/index.ts)
  └─ registerUiCommand(program)
       └─ Commander action handler
            └─ runUi(options)
                 ├─ [options.restart === true]
                 │    ├─ gracefulShutdown(port)          // 优雅关停现有服务
                 │    ├─ startBackendService(port)       // spawn 新服务
                 │    └─ openBrowser(url)                // 打开浏览器
                 ├─ [port 已占用]
                 │    ├─ openBrowser(url)                // 仅打开浏览器
                 │    └─ stdout 提示已运行
                 └─ [port 空闲]
                      ├─ startBackendService(port)       // spawn 服务
                      └─ openBrowser(url)                // 打开浏览器
```

### 优雅关停流程（gracefulShutdown）

```
gracefulShutdown(port)
  ├─ isPortInUse(port) == false → 直接返回
  ├─ sendShutdownRequest(port)  // HTTP POST /furina/api/shutdown
  │    ├─ 成功 → 轮询 isPortInUse（最多 3s，每 300ms）
  │    │    └─ 端口释放 → 返回
  │    └─ 端口未释放 → fallback: force kill
  └─ HTTP 请求失败 → fallback: force kill
       └─ killPortProcess(port) + waitForPortFree(port)
```

## 功能 / 接口详情

### `openBrowser(url: string): void`

**Source**: `src/commands/ui.ts`:19-33

**功能描述**：在用户操作系统的默认浏览器中打开指定 URL。该函数是一个跨平台浏览器打开工具，根据 `os.platform()` 的返回值选择对应的系统命令：Windows 使用 `start`，macOS 使用 `open`，Linux 使用 `xdg-open`。命令通过 `execSync` 同步执行，`stdio` 设为 `'ignore'` 以抑制子进程输出。如果打开失败，仅记录警告日志而不抛出异常，确保不影响主流程。

**参数**：
- `url` (`string`): 要在浏览器中打开的完整 URL，例如 `http://localhost:3939/furina/ui`

**返回值**：
- `void`：无返回值。错误被 catch 并记录到 logger.warn

**核心逻辑**：
1. 获取当前操作系统平台类型
2. 根据平台选择对应的打开命令：`win32` → `start "" "${url}"`、`darwin` → `open "${url}"`、其他 → `xdg-open "${url}"`
3. 使用 `execSync` 同步执行命令，设置 `stdio: 'ignore'` 和 `cwd: process.cwd()`
4. 成功时记录 info 日志，失败时捕获异常并记录 warn 日志（不抛出）

**核心代码**：
```typescript
function openBrowser(url: string): void {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', cwd: process.cwd() });
    } else if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore', cwd: process.cwd() });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore', cwd: process.cwd() });
    }
    logger.info(`Browser opened at ${url}`);
  } catch (err) {
    logger.warn(`Failed to open browser: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```
Source: `src/commands/ui.ts`:19-33

**使用示例**：
```typescript
openBrowser('http://localhost:3939/furina/ui');
```
说明：直接调用即可在默认浏览器中打开指定 URL。此函数为内部工具函数，不对外导出。

---

### `runUi(options: { restart?: boolean }): Promise<void>`

**Source**: `src/commands/ui.ts`:35-60

**功能描述**：UI 命令的核心执行函数，负责根据选项决定服务启动策略。该函数实现了三种执行路径：重启模式、服务已运行模式、全新启动模式。它是 UI 命令的主逻辑入口，被 CLI 命令注册和 `init` 命令共同调用。

**参数**：
- `options.restart` (`boolean | undefined`): 是否强制重启。为 `true` 时先优雅关停现有服务再启动新服务；为 `false` 或 `undefined` 时先检测端口是否已占用

**返回值**：
- `Promise<void>`：异步操作，无显式返回值

**核心逻辑**：
该函数按优先级依次判断三条执行路径：

**路径一 -- 重启模式（`options.restart === true`）**：
1. 记录重启请求日志
2. 调用 `gracefulShutdown(port)` 优雅关停现有服务（先发 HTTP shutdown 请求，超时则 force kill）
3. 关停完成后，调用 `startBackendService(port)` spawn 新的后台子进程
4. 调用 `openBrowser(uiUrl)` 打开浏览器
5. `return` 结束

**路径二 -- 服务已运行（`isPortInUse(port) === true`）**：
1. 记录服务已运行日志
2. 构造 URL `http://localhost:${port}/furina/ui`
3. 仅调用 `openBrowser(url)` 打开浏览器
4. 通过 `process.stdout.write` 输出提示信息
5. `return` 结束（不启动新服务）

**路径三 -- 全新启动（端口空闲）**：
1. 调用 `startBackendService(port)` spawn 后台服务
2. 调用 `openBrowser(uiUrl)` 打开浏览器

**核心代码**：
```typescript
export async function runUi(options: { restart?: boolean }): Promise<void> {
  const port = UI_PORT;

  // Handle --restart: gracefully shut down the existing service, then spawn a new one
  if (options.restart) {
    logger.info('Restart requested, shutting down existing service gracefully');
    await gracefulShutdown(port);
    logger.info('Graceful shutdown complete, starting new service');
    const restartUrl = startBackendService(port);
    openBrowser(restartUrl);
    return;
  }

  // Check if port is already occupied (assumed to be our server if --restart not set)
  const portInUse = await isPortInUse(port);
  if (portInUse) {
    logger.info('UI server already running, opening browser');
    const url = `http://localhost:${port}/furina/ui`;
    openBrowser(url);
    process.stdout.write(`UI server is already running at ${url}\n`);
    return;
  }

  const uiUrl = startBackendService(port);
  openBrowser(uiUrl);
}
```
Source: `src/commands/ui.ts`:35-60

**使用示例**：
```typescript
// 正常启动（端口空闲则启动新服务，已占用则仅打开浏览器）
await runUi({ restart: false });

// 强制重启（先关停现有服务，再启动新服务）
await runUi({ restart: true });
```
说明：`runUi` 为导出函数，除了被 CLI 命令调用外，`init` 命令在初始化完成后也会调用 `runUi({ restart: true })` 自动启动 UI。

---

### `registerUiCommand(program: Command): void`

**Source**: `src/commands/ui.ts`:66-80

**功能描述**：将 `ui` 子命令注册到 Commander.js 的 `program` 实例上。该函数负责定义命令名称、描述、选项，并绑定 action handler。action handler 中包含完整的错误处理：捕获异常后通过 logger 和 stdout 双重输出错误信息，并设置 `process.exitCode = 1` 表示命令执行失败。

**参数**：
- `program` (`Command`): Commander.js 的 Command 实例，通常为 CLI 入口创建的顶层 program

**返回值**：
- `void`：无返回值，通过副作用注册命令

**核心逻辑**：
1. 调用 `program.command('ui')` 注册名为 `ui` 的子命令
2. 设置命令描述：`'Start the furina UI server and open in browser'`
3. 添加 `--restart` 选项，描述为 `'Force restart the UI server, killing any existing process on port 3939'`
4. 绑定 async action handler，在其中调用 `runUi(options)`
5. action handler 中使用 try-catch 包裹，错误时记录日志、输出到 stdout、设置 exitCode

**核心代码**：
```typescript
export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('Start the furina UI server and open in browser')
    .option('--restart', 'Force restart the UI server, killing any existing process on port 3939')
    .action(async (options: { restart?: boolean }) => {
      try {
        await runUi(options);
      } catch (err) {
        logger.error(`UI command failed: ${err instanceof Error ? err.message : String(err)}`);
        process.stdout.write(`Failed to start UI: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
```
Source: `src/commands/ui.ts`:66-80

**使用示例**：
```typescript
import { Command } from 'commander';
import { registerUiCommand } from '../commands/ui.js';

const program = new Command();
registerUiCommand(program);
program.parse(process.argv);
```
说明：在 CLI 入口文件（`src/cli/index.ts`）中调用，将 `ui` 子命令挂载到全局 program 上。

---

### `startBackendService(port: number): string`

**Source**: `src/server/service-manager.ts`:53-64

**功能描述**：启动后端 Express 服务器的主入口函数。首先检查前端构建产物是否存在（`dist/client` 目录），如果不存在则输出提示信息。然后调用内部 `spawnServer(port)` 以 detached 子进程方式启动服务器，并返回 UI 的完整访问 URL。此函数不负责打开浏览器，由调用方处理。

**参数**：
- `port` (`number`): 服务器监听的端口号

**返回值**：
- `string`: 完整的 UI 访问 URL，格式为 `http://localhost:{port}/furina/ui`

**核心逻辑**：
1. 检查 `dist/client` 目录是否存在，不存在则输出构建提示
2. 调用 `spawnServer(port)` spawn detached 子进程
3. 记录 info 日志
4. 构造并返回 UI URL
5. 通过 stdout 输出启动提示

**核心代码**：
```typescript
export function startBackendService(port: number): string {
  const clientDir = path.join(moduleDirname, '..', '..', 'dist', 'client');
  if (!fs.existsSync(clientDir)) {
    process.stdout.write('UI has not been built yet. Please run the build command first to generate the frontend assets.\n');
  }

  spawnServer(port);
  logger.info(`UI server spawned on port ${port}`);
  const uiUrl = `http://localhost:${port}/furina/ui`;
  process.stdout.write(`UI server started at ${uiUrl}\n`);
  return uiUrl;
}
```
Source: `src/server/service-manager.ts`:53-64

**使用示例**：
```typescript
import { startBackendService, UI_PORT } from '../server/service-manager.js';

const url = startBackendService(UI_PORT); // UI_PORT = 3939
console.log(url); // "http://localhost:3939/furina/ui"
```
说明：该函数仅负责启动服务并返回 URL，不打开浏览器。浏览器打开由 `openBrowser()` 负责。

---

### `isPortInUse(port: number): Promise<boolean>`

**Source**: `src/utils/port-manager.ts`:20-37

**功能描述**：检测指定端口是否被占用。实现原理是尝试在目标端口上创建一个临时 TCP 服务器：如果绑定成功（触发 `listen` 回调），说明端口空闲，立即关闭临时服务器并返回 `false`；如果绑定失败且错误码为 `EADDRINUSE`，说明端口被占用，返回 `true`。

**参数**：
- `port` (`number`): 要检测的端口号

**返回值**：
- `Promise<boolean>`: `true` 表示端口被占用，`false` 表示端口空闲

**核心逻辑**：
1. 创建一个 `net.Server` 临时服务器
2. 尝试在目标端口 `listen`
3. 成功 → 关闭服务器，resolve(`false`)
4. 失败且错误码为 `EADDRINUSE` → resolve(`true`)
5. 其他错误 → resolve(`false`)

**核心代码**：
```typescript
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close();
      resolve(false);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}
```
Source: `src/utils/port-manager.ts`:20-37

**使用示例**：
```typescript
import { isPortInUse } from '../utils/port-manager.js';

const occupied = await isPortInUse(3939);
if (occupied) {
  console.log('Port 3939 is already in use');
} else {
  console.log('Port 3939 is free');
}
```

---

### `gracefulShutdown(port: number): Promise<void>`

**Source**: `src/utils/port-manager.ts`:209-243

**功能描述**：优雅关停指定端口上的后端服务。采用多级降级策略确保服务被可靠终止：首先尝试发送 HTTP POST shutdown 请求，如果成功则轮询等待端口释放；如果 HTTP 请求失败或端口在超时时间内未释放，则降级为强制 kill 占用端口的进程。该函数是 `--restart` 流程的关键环节，确保旧服务被完全关停后再启动新服务。

**参数**：
- `port` (`number`): 要关停的服务端口号

**返回值**：
- `Promise<void>`: 异步操作，完成时端口已被释放

**核心逻辑**：
1. 先检查端口是否被占用（`isPortInUse`），未占用则直接返回
2. 尝试发送 HTTP POST 请求到 `/furina/api/shutdown`（超时 2s）
3. HTTP 成功 → 以 300ms 间隔轮询端口释放（最多 3s）
   - 端口释放 → 正常返回
   - 超时未释放 → 降级为 force kill
4. HTTP 失败 → 降级为 force kill
5. Force kill：调用 `killPortProcess(port)` 终止进程，再调用 `waitForPortFree(port)` 等待端口释放（最多 15s）

**核心代码**：
```typescript
export async function gracefulShutdown(port: number): Promise<void> {
  const inUse = await isPortInUse(port);
  if (!inUse) { return; }

  logger.info(`Attempting graceful shutdown on port ${port}`);
  let httpSucceeded = false;

  try {
    await sendShutdownRequest(port);
    httpSucceeded = true;
  } catch (err) {
    logger.warn(`Graceful shutdown HTTP request failed on port ${port}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (httpSucceeded) {
    const start = Date.now();
    while (Date.now() - start < GRACEFUL_MAX_WAIT_MS) {
      const stillInUse = await isPortInUse(port);
      if (!stillInUse) { return; }
      await new Promise((resolve) => setTimeout(resolve, GRACEFUL_POLL_INTERVAL_MS));
    }
    logger.warn(`Port ${port} not released within ${GRACEFUL_MAX_WAIT_MS}ms, falling back to force kill`);
  }

  await killPortProcess(port);
  await waitForPortFree(port);
}
```
Source: `src/utils/port-manager.ts`:209-243

**使用示例**：
```typescript
import { gracefulShutdown } from '../utils/port-manager.js';

// 优雅关停 3939 端口上的服务
await gracefulShutdown(3939);
console.log('Service shut down, port 3939 is now free');
```
说明：该函数内部已处理端口未占用的情况（直接返回），调用方无需预先检查端口状态。

## 数据结构

### `UI_PORT`

```typescript
export const UI_PORT = 3939;
```
- 类型: `number`（常量）
- 含义: UI 后端服务器的默认端口号，定义在 `service-manager.ts` 中并从 `ui.ts` 导入使用

### `options` 参数对象

```typescript
{ restart?: boolean }
```
- `restart` (`boolean | undefined`): 是否强制重启服务。未提供时为 `undefined`，等效于 `false`

### PID 文件格式

```typescript
{ pid: number, port: number }
```
- 路径: `~/.furina/.furina.pid`
- `pid` (`number`): spawn 的子进程 PID
- `port` (`number`): 服务监听的端口号

## 错误处理与边界情况

### 1. 浏览器打开失败

`openBrowser` 中 `execSync` 的异常被 catch 并记录 warn 日志，不会中断主流程。这意味着即使浏览器打开失败（如无图形界面的 Linux 服务器环境），服务仍正常运行。

### 2. --restart 时服务未运行

`gracefulShutdown` 在入口处先检查端口占用状态，如果端口未被占用则直接返回，不会报错。后续正常执行 `startBackendService` 启动新服务。

### 3. --restart 后端口释放超时

`gracefulShutdown` 采用两级超时策略：
- HTTP 优雅关停：轮询最多 3 秒（每 300ms 检查一次）
- Force kill 后等待：轮询最多 15 秒（每 500ms 检查一次）
- 如果 15 秒后端口仍未释放，`waitForPortFree` 抛出 `Error`，被上层 `registerUiCommand` 的 catch 捕获，设置 `exitCode = 1` 并输出错误信息

### 4. 前端构建产物缺失

`startBackendService` 检查 `dist/client` 目录是否存在，不存在时输出提示但不阻止服务启动（服务仍会 spawn）。

### 5. 命令执行异常

`registerUiCommand` 的 action handler 使用 try-catch 包裹 `runUi` 调用，捕获所有异常后通过 logger 和 stdout 双重输出，并设置 `process.exitCode = 1`。

### 6. 端口检测竞态

`isPortInUse` 使用临时 TCP 服务器方式检测，存在极小的竞态窗口（检测到端口空闲到实际 bind 之间可能被其他进程占用）。在正常使用场景下此竞态风险可忽略。

## 依赖关系

### 依赖（Depends on）

| 模块 | 用途 |
|------|------|
| `commander` | CLI 框架，用于注册子命令和选项 |
| `os` | Node.js 内置模块，用于获取操作系统平台类型 |
| `child_process.execSync` | 同步执行系统命令（浏览器打开、进程发现与终止） |
| `net` | Node.js 内置模块，用于端口占用检测 |
| `http` | Node.js 内置模块，用于发送 shutdown HTTP 请求 |
| `src/utils/port-manager.ts` | 端口管理工具集：`isPortInUse`、`gracefulShutdown`、`killPortProcess`、`waitForPortFree` |
| `src/utils/logger.ts` | 日志工具：winston 文件日志 |
| `src/server/service-manager.ts` | 服务生命周期管理：`startBackendService`、`UI_PORT` |

### 被依赖（Depended by）

| 模块 | 用途 |
|------|------|
| `src/cli/index.ts` | CLI 入口，调用 `registerUiCommand(program)` 注册 `ui` 子命令 |
| `src/commands/init.ts` | init 命令在初始化完成后调用 `runUi({ restart: true })` 自动启动 UI |

## 使用示例

### 场景一：正常启动 UI

```bash
furina ui
```

对应内部执行流程：
```typescript
import { runUi } from './commands/ui.js';

// 端口 3939 空闲时：启动服务 + 打开浏览器
// 端口 3939 已占用时：仅打开浏览器
await runUi({ restart: false });
```

### 场景二：强制重启 UI

```bash
furina ui --restart
```

对应内部执行流程：
```typescript
await runUi({ restart: true });
// 1. gracefulShutdown(3939) — 优雅关停旧服务
// 2. startBackendService(3939) — spawn 新服务
// 3. openBrowser(url) — 打开浏览器
```

### 场景三：init 命令自动启动 UI

```typescript
// src/commands/init.ts 中的调用
import { runUi } from './ui.js';

// 初始化完成后自动以 restart 模式启动 UI
await runUi({ restart: true });
```

### 场景四：在自定义 CLI 中注册 UI 命令

```typescript
import { Command } from 'commander';
import { registerUiCommand } from './commands/ui.js';

const program = new Command();
program.name('my-cli').version('1.0.0');
registerUiCommand(program);
program.parse(process.argv);
```

说明：`registerUiCommand` 将 `ui` 子命令挂载到 program 上，用户即可通过 `my-cli ui [--restart]` 使用。
