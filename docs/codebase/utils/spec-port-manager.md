# Port Manager

> Source files:
> - `src/utils/port-manager.ts` : 1-288

## Overview

Port Manager 是 Furina 项目中负责跨平台端口检测和进程管理的底层工具模块。它为 CLI 命令层提供端口占用判断、进程终止、端口释放等待和优雅关停等能力，是服务生命周期管理的基础设施。

**设计动机**：Furina 启动后端服务时需要确保目标端口未被占用；重启场景需要先关停旧实例再启动新实例。由于 Windows 与 Unix 系统在端口查询和进程终止命令上存在显著差异，本模块封装了平台相关的命令调用细节，对上层暴露统一的异步 API。

**使用场景**：
- `ui` 命令启动前检查端口是否已占用，若已占用则提示用户或执行重启
- `ui --restart` 场景下优雅关停旧服务（先 HTTP 通知，超时后强制终止）
- `launch`、`active`、`enable`、`schedule` 等命令在启动服务前检查端口状态

**源文件职责**：
- `src/utils/port-manager.ts`：所有端口检测、进程终止、端口等待、优雅关停功能的完整实现

## Architecture / Flow

### 调用链路概览

```
CLI Commands (ui, launch, active, enable, schedule)
        |
        v
+-------------------+     +---------------------+
| isPortInUse()     |     | gracefulShutdown()  |
| (net.createServer |     | (HTTP POST -> poll  |
|  probe)           |     |  -> force kill)     |
+-------------------+     +-----+-------+-------+
                                |       |
                        +-------+   +---+--------+
                        |           |              |
                   sendShutdown  killPortProcess  waitForPortFree
                   Request()     (platform split) (polling loop)
                                     |
                            +--------+--------+
                            |                 |
                   killPortProcess   killPortProcess
                   Windows()         Unix()
                            |                 |
                            +--------+--------+
                                     |
                            killPortWithCommand()
                            (execSync + PID parsing)
```

### gracefulShutdown 两阶段策略

1. **优雅阶段**：先调用 `isPortInUse` 检测端口状态，若被占用则通过 HTTP POST `/furina/api/shutdown` 通知服务自行退出，随后轮询等待端口释放（最多 3 秒）
2. **强制阶段**：若 HTTP 请求失败或端口在超时时间内未释放，回退到 `killPortProcess` 强制终止占用进程，再通过 `waitForPortFree` 等待端口完全释放

## Functionality / Interface Details

### `isPortInUse(port: number) -> Promise<boolean>`

**Source**: `src/utils/port-manager.ts`:20-37

**Functionality**: 检测指定端口是否被占用。通过创建一个临时的 `net.Server` 尝试监听目标端口来判断：如果监听成功说明端口空闲，立即关闭临时服务器并返回 `false`；如果收到 `EADDRINUSE` 错误说明端口已被占用，返回 `true`。这是一种非侵入式的端口检测方式，不会影响端口上已有的服务。

**Parameters**:
- `port` (`number`): 要检测的端口号

**Return Value**:
- `Promise<boolean>`: 端口被占用返回 `true`，端口空闲返回 `false`
- 对于非 `EADDRINUSE` 类型的错误（如权限不足 `EACCES`），视为端口未占用，返回 `false`

**Core Logic**:
函数创建一个 `net.Server`，调用 `server.listen(port)` 尝试绑定端口。Node.js 的 `net` 模块在端口已被占用时会触发 `error` 事件并附带 `EADDRINUSE` 错误码；端口空闲时触发 `listening` 事件。函数通过 Promise 封装这两个事件回调，将结果异步返回。监听成功后立即调用 `server.close()` 释放临时服务器。

**Core Code**:
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

**Usage Example**:
```typescript
import { isPortInUse } from '../utils/port-manager.js';

const port = 3000;
const occupied = await isPortInUse(port);
if (occupied) {
  console.log(`端口 ${port} 已被占用`);
} else {
  console.log(`端口 ${port} 空闲，可以启动服务`);
}
```
Explanation: 检测 3000 端口是否被占用，根据结果输出不同信息。

---

### `killPortProcess(port: number) -> Promise<void>`

**Source**: `src/utils/port-manager.ts`:46-56

**Functionality**: 终止占用指定端口的所有进程。根据当前操作系统平台自动选择不同的实现：Windows 使用 `netstat + taskkill`，Unix/Linux/macOS 使用 `lsof + kill -9`。即使端口上没有进程，也不会抛出错误。

**Parameters**:
- `port` (`number`): 要终止进程的端口号

**Return Value**:
- `Promise<void>`: 无返回值，操作完成即 resolve
- 注意：内部的进程发现失败和单个 PID 终止失败都不会向外抛出，仅通过 logger 记录

**Core Logic**:
函数首先通过 `os.platform()` 判断操作系统平台，然后分发到对应的平台实现函数。Windows 平台调用 `killPortProcessWindows`，Unix 平台调用 `killPortProcessUnix`。两个实现都委托给内部的 `killPortWithCommand` 抽象函数，只是传入不同的命令和解析器。

**Core Code**:
```typescript
export async function killPortProcess(port: number): Promise<void> {
  logger.info(`Attempting to kill processes on port ${port}`);
  const platform = os.platform();

  if (platform === 'win32') {
    await killPortProcessWindows(port);
  } else {
    await killPortProcessUnix(port);
  }
  logger.info(`Finished killing processes on port ${port}`);
}
```
Source: `src/utils/port-manager.ts`:46-56

**Usage Example**:
```typescript
import { killPortProcess } from '../utils/port-manager.js';

// 终止占用 3000 端口的所有进程
await killPortProcess(3000);
console.log('进程终止完成');
```
Explanation: 强制终止所有占用 3000 端口的进程，适用于需要释放端口的场景。

---

### `waitForPortFree(port: number, maxWaitMs?: number) -> Promise<void>`

**Source**: `src/utils/port-manager.ts`:73-99

**Functionality**: 轮询等待指定端口变为可用状态。在 `killPortProcess` 之后调用，用于确保操作系统已完全释放端口（例如 TCP 的 WAITING/TIME_WAIT 状态）。使用平台相关的命令（Windows `netstat + findstr`，Unix `lsof`）来检测端口是否仍有进程占用。

**Parameters**:
- `port` (`number`): 要等待的端口号
- `maxWaitMs` (`number`, 可选): 最大等待时间（毫秒），默认为 15000（15 秒）

**Return Value**:
- `Promise<void>`: 端口释放后 resolve
- 超时后抛出 `Error`，消息格式为 `Port ${port} is still occupied after ${maxWaitMs}ms`

**Core Logic**:
函数在一个 `while` 循环中以 500ms 间隔轮询端口状态。每次轮询使用 `execSync` 执行平台相关的命令来检查端口是否仍有进程占用。如果命令输出为空或命令执行失败（`findstr` 在无匹配时返回错误码，`lsof` 在无进程时返回错误），则认为端口已释放并 resolve。循环超过 `maxWaitMs` 仍未释放时抛出超时错误。

**Core Code**:
```typescript
export async function waitForPortFree(port: number, maxWaitMs: number = PORT_FREE_MAX_WAIT_MS): Promise<void> {
  const platform = os.platform();
  const discoverCommand = platform === 'win32'
    ? `netstat -ano | findstr :${port}`
    : `lsof -ti :${port}`;

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const output = execSync(discoverCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });
      if (!output.trim()) {
        logger.info(`Port ${port} is now free`);
        return;
      }
    } catch {
      logger.info(`Port ${port} is now free`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, PORT_FREE_POLL_INTERVAL_MS));
  }
  throw new Error(`Port ${port} is still occupied after ${maxWaitMs}ms`);
}
```
Source: `src/utils/port-manager.ts`:73-99

**Usage Example**:
```typescript
import { killPortProcess, waitForPortFree } from '../utils/port-manager.js';

// 先终止进程，再等待端口完全释放
await killPortProcess(3000);
await waitForPortFree(3000); // 默认最多等待 15 秒
console.log('端口已完全释放，可以启动新服务');

// 自定义超时时间
await waitForPortFree(3000, 30000); // 最多等待 30 秒
```
Explanation: 典型用法是先 `killPortProcess` 终止进程，再 `waitForPortFree` 等待端口完全释放，确保新服务可以安全绑定该端口。

---

### `gracefulShutdown(port: number) -> Promise<void>`

**Source**: `src/utils/port-manager.ts`:209-243

**Functionality**: 优雅关停指定端口上的后端服务。采用两阶段策略：先通过 HTTP POST 请求通知服务自行退出，等待端口释放；如果优雅关停失败（HTTP 请求失败或超时未释放），回退到强制终止进程。这是 `ui --restart` 命令的核心逻辑。

**Parameters**:
- `port` (`number`): 要关停的后端服务的端口号

**Return Value**:
- `Promise<void>`: 关停完成（无论是优雅还是强制）后 resolve
- 不会向外抛出错误——内部所有异常都被捕获和记录

**Core Logic**:
1. 调用 `isPortInUse` 检查端口状态，若未被占用直接返回
2. 调用 `sendShutdownRequest` 发送 HTTP POST 到 `/furina/api/shutdown`，如果失败则记录警告并跳过等待阶段
3. 若 HTTP 请求成功，在 3 秒内以 300ms 间隔轮询端口释放状态（使用 `isPortInUse`）
4. 若轮询超时仍未释放，记录警告并进入强制阶段
5. 调用 `killPortProcess` 强制终止进程，再调用 `waitForPortFree` 等待端口完全释放

**Core Code**:
```typescript
export async function gracefulShutdown(port: number): Promise<void> {
  const inUse = await isPortInUse(port);
  if (!inUse) {
    return;
  }

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
      if (!stillInUse) {
        logger.info(`Port ${port} released after graceful shutdown`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, GRACEFUL_POLL_INTERVAL_MS));
    }
    logger.warn(`Port ${port} not released within ${GRACEFUL_MAX_WAIT_MS}ms, falling back to force kill`);
  }

  await killPortProcess(port);
  await waitForPortFree(port);
}
```
Source: `src/utils/port-manager.ts`:209-243

**Usage Example**:
```typescript
import { gracefulShutdown } from '../utils/port-manager.js';

// 在 UI 命令的 --restart 流程中
async function handleRestart(port: number) {
  await gracefulShutdown(port);
  // 此时端口已完全释放，可以安全启动新服务
  startBackendService(port);
}
```
Explanation: `ui --restart` 场景的典型使用方式——优雅关停旧服务后启动新服务。

---

### `killPortWithCommand(port, discoverCommand, parsePids, buildKillCommand) -> Promise<void>`

**Source**: `src/utils/port-manager.ts`:110-143

**Functionality**: 内部抽象函数，封装了"发现占用端口的进程 -> 终止进程"的通用逻辑。接受平台相关的命令和解析器作为参数，被 `killPortProcessWindows` 和 `killPortProcessUnix` 调用。这种策略模式设计避免了在公共逻辑中重复平台判断代码。

**Parameters**:
- `port` (`number`): 目标端口号，仅用于日志记录
- `discoverCommand` (`string`): 平台相关的进程发现命令（如 `netstat -ano | findstr :3000` 或 `lsof -ti :3000`）
- `parsePids` (`(output: string) => string[]`): 从发现命令输出中提取 PID 列表的解析函数
- `buildKillCommand` (`(pid: string) => string`): 根据 PID 构建终止命令的函数（如 `taskkill /PID xxx /F` 或 `kill -9 xxx`）

**Return Value**:
- `Promise<void>`: 操作完成即 resolve，不向外抛出错误

**Core Logic**:
1. 使用 `execSync` 执行 `discoverCommand` 获取进程信息输出
2. 若输出为空，说明无进程占用该端口，直接返回
3. 将输出传入 `parsePids` 提取 PID 列表
4. 逐个 PID 执行 `buildKillCommand(pid)` 生成的终止命令
5. 单个 PID 终止失败时记录错误日志但继续处理剩余 PID
6. 若 `discoverCommand` 执行失败（如命令不存在），记录警告并返回

**Core Code**:
```typescript
async function killPortWithCommand(
  port: number,
  discoverCommand: string,
  parsePids: (output: string) => string[],
  buildKillCommand: (pid: string) => string,
): Promise<void> {
  try {
    const output = execSync(discoverCommand, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    if (!output.trim()) {
      return;
    }

    const pids = parsePids(output);
    for (const pid of pids) {
      try {
        execSync(buildKillCommand(pid), {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd(),
        });
        logger.info(`Killed process on port ${port} (PID: ${pid})`);
      } catch (err) {
        logger.error(`Failed to kill process on port ${port} (PID: ${pid}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    logger.warn(`Failed to discover processes on port ${port}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
}
```
Source: `src/utils/port-manager.ts`:110-143

**Usage Example**:
```typescript
// 内部调用，外部不应直接使用
// Unix 平台的调用方式：
await killPortWithCommand(
  port,
  `lsof -ti :${port}`,
  (output) => output.trim().split('\n').map((s) => s.trim()).filter(Boolean),
  (pid) => `kill -9 ${pid}`,
);
```
Explanation: 这是内部抽象函数，展示了 Unix 平台的调用模式。`parsePids` 将 `lsof` 的换行分隔输出解析为 PID 数组，`buildKillCommand` 为每个 PID 生成 `kill -9` 命令。

---

### `killPortProcessWindows(port: number) -> Promise<void>`

**Source**: `src/utils/port-manager.ts`:148-155

**Functionality**: Windows 平台的进程终止实现。使用 `netstat -ano | findstr :{port}` 发现占用端口的进程，使用 `taskkill /PID {pid} /F` 强制终止进程。

**Parameters**:
- `port` (`number`): 要终止进程的端口号

**Return Value**:
- `Promise<void>`: 操作完成即 resolve

**Core Logic**:
调用 `killPortWithCommand`，传入 Windows 特定的发现命令（`netstat -ano | findstr`）、`parseWindowsNetstatOutput` 解析器和 `taskkill /F` 终止命令。`taskkill /F` 标志表示强制终止（force），不等待进程自行退出。

**Core Code**:
```typescript
async function killPortProcessWindows(port: number): Promise<void> {
  await killPortWithCommand(
    port,
    `netstat -ano | findstr :${port}`,
    parseWindowsNetstatOutput,
    (pid) => `taskkill /PID ${pid} /F`,
  );
}
```
Source: `src/utils/port-manager.ts`:148-155

---

### `killPortProcessUnix(port: number) -> Promise<void>`

**Source**: `src/utils/port-manager.ts`:160-167

**Functionality**: Unix/Linux/macOS 平台的进程终止实现。使用 `lsof -ti :{port}` 发现占用端口的进程，使用 `kill -9` 强制终止进程。

**Parameters**:
- `port` (`number`): 要终止进程的端口号

**Return Value**:
- `Promise<void>`: 操作完成即 resolve

**Core Logic**:
调用 `killPortWithCommand`，传入 Unix 特定的发现命令（`lsof -ti`）、简单的换行分隔解析器和 `kill -9` 终止命令。`lsof -ti` 输出格式简单（每行一个 PID），解析器直接按换行分割并过滤空行。`kill -9` 发送 SIGKILL 信号，强制终止进程。

**Core Code**:
```typescript
async function killPortProcessUnix(port: number): Promise<void> {
  await killPortWithCommand(
    port,
    `lsof -ti :${port}`,
    (output) => output.trim().split('\n').map((s) => s.trim()).filter(Boolean),
    (pid) => `kill -9 ${pid}`,
  );
}
```
Source: `src/utils/port-manager.ts`:160-167

---

### `parseWindowsNetstatOutput(output: string) -> string[]`

**Source**: `src/utils/port-manager.ts`:176-195

**Functionality**: 解析 Windows `netstat -ano` 命令的输出，提取唯一的 PID 列表。`netstat -ano` 输出格式为按空白分隔的多列数据，最后一列为 PID。该函数使用 `Set` 去重，并过滤掉 PID 0（System Idle Process，不可终止）。

**Parameters**:
- `output` (`string`): `netstat -ano | findstr :{port}` 的原始输出文本

**Return Value**:
- `string[]`: 去重后的 PID 字符串数组，不包含 PID "0"

**Core Logic**:
按行分割输出，每行再按空白分割，取最后一个字段作为 PID。通过正则 `/^\d+$/` 验证 PID 为纯数字，排除 PID "0"（Windows 的 System Idle Process），使用 `Set` 自动去重。

**Core Code**:
```typescript
function parseWindowsNetstatOutput(output: string): string[] {
  const pidSet = new Set<string>();
  const lines = output.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== '0') {
      pidSet.add(pid);
    }
  }

  return Array.from(pidSet);
}
```
Source: `src/utils/port-manager.ts`:176-195

**Usage Example**:
```typescript
// netstat 输出示例：
// TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    45678
// TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    12345
const pids = parseWindowsNetstatOutput(netstatOutput);
// 结果: ["45678", "12345"]
```
Explanation: 从 netstat 输出中提取所有占用指定端口的 PID，自动去重并过滤掉 System Idle Process (PID 0)。

---

### `sendShutdownRequest(port: number) -> Promise<void>`

**Source**: `src/utils/port-manager.ts`:251-288

**Functionality**: 向目标端口发送 HTTP POST 关停请求。请求路径为 `/furina/api/shutdown`，设置 2 秒超时。仅当服务返回 200 状态码时视为成功，其他状态码或网络错误均 reject。

**Parameters**:
- `port` (`number`): 目标服务的端口号

**Return Value**:
- `Promise<void>`: 200 响应时 resolve
- 可能的错误：网络连接错误、超时错误、非 200 状态码

**Core Logic**:
使用 Node.js `http.request` 发送 POST 请求到 `localhost:{port}/furina/api/shutdown`。请求头设置 `Content-Type: application/json` 和 `Content-Length: 0`（无请求体）。通过 `timeout: 2000` 设置 2 秒超时，超时后销毁请求并 reject。监听 `error` 事件处理网络错误，监听 `response` 事件检查状态码。

**Core Code**:
```typescript
function sendShutdownRequest(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port,
      path: '/furina/api/shutdown',
      method: 'POST',
      timeout: 2000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': 0,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Shutdown returned status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => { reject(err); });
    req.on('timeout', () => { req.destroy(); reject(new Error('Shutdown request timed out')); });
    req.end();
  });
}
```
Source: `src/utils/port-manager.ts`:251-288

## Data Structures

### 常量定义

```typescript
const PORT_FREE_MAX_WAIT_MS = 15000;     // waitForPortFree 默认最大等待时间：15 秒
const PORT_FREE_POLL_INTERVAL_MS = 500;  // waitForPortFree 轮询间隔：500ms
const GRACEFUL_MAX_WAIT_MS = 3000;       // gracefulShutdown 优雅关停等待时间：3 秒
const GRACEFUL_POLL_INTERVAL_MS = 300;   // gracefulShutdown 轮询间隔：300ms
```

- `PORT_FREE_MAX_WAIT_MS` (`number`): `waitForPortFree` 函数的默认最大等待时长，超过后抛出超时错误
- `PORT_FREE_POLL_INTERVAL_MS` (`number`): `waitForPortFree` 中每次轮询的间隔时间
- `GRACEFUL_MAX_WAIT_MS` (`number`): `gracefulShutdown` 在发送 HTTP 关停请求后等待端口释放的最大时长
- `GRACEFUL_POLL_INTERVAL_MS` (`number`): `gracefulShutdown` 中轮询端口状态的间隔时间

## Error Handling and Edge Cases

### 错误处理策略

本模块采用**吞没非关键错误、记录日志**的策略，所有公共 API（`isPortInUse`、`killPortProcess`、`gracefulShutdown`）均不向调用方抛出异常（`waitForPortFree` 是唯一例外，超时会抛错）。

| 场景 | 处理方式 |
|------|---------|
| `isPortInUse` 收到非 `EADDRINUSE` 错误（如 `EACCES` 权限不足） | 返回 `false`，视为端口未占用 |
| `killPortWithCommand` 进程发现命令执行失败 | 记录 `logger.warn`，静默返回 |
| `killPortWithCommand` 单个 PID 终止失败 | 记录 `logger.error`，继续终止下一个 PID |
| `sendShutdownRequest` 网络错误或超时 | reject 后被 `gracefulShutdown` 捕获，记录 `logger.warn`，进入强制终止阶段 |
| `sendShutdownRequest` 返回非 200 状态码 | reject 后同样触发回退到强制终止 |
| `waitForPortFree` 等待超时 | 抛出 `Error`，是本模块唯一向外传播的异常 |

### 边界条件

- **端口未占用时调用 `gracefulShutdown`**：直接返回，不执行任何操作
- **端口未占用时调用 `killPortProcess`**：进程发现命令输出为空，静默返回
- **多个进程占用同一端口**：`parseWindowsNetstatOutput` 使用 `Set` 去重，`killPortWithCommand` 逐个终止所有 PID
- **PID 0（Windows System Idle Process）**：`parseWindowsNetstatOutput` 显式过滤，避免尝试终止系统进程
- **`lsof` 命令不可用**：`killPortWithCommand` 的 `catch` 分支捕获异常并记录警告

## Dependencies

### Depends on（依赖）

- **Node.js 内置模块**：`net`（端口探测）、`os`（平台判断）、`http`（关停请求）、`child_process`（`execSync` 执行系统命令）
- **`src/utils/logger.ts`**：Winston 文件日志模块，用于记录操作日志和错误信息

### Depended by（被依赖）

- **`src/commands/ui.ts`**：使用 `isPortInUse` 检查端口状态，使用 `gracefulShutdown` 在 `--restart` 时优雅关停服务
- **`src/commands/launch.ts`**：使用 `isPortInUse` 检查端口，若已占用则提示用户
- **`src/commands/active.ts`**：使用 `isPortInUse` 检查服务是否正在运行
- **`src/commands/enable.ts`**：使用 `isPortInUse` 检查端口状态
- **`src/commands/schedule/index.ts`**：使用 `isPortInUse` 检查端口状态

## Usage Examples

### 完整的服务重启流程

```typescript
import { isPortInUse, gracefulShutdown, killPortProcess, waitForPortFree } from '../utils/port-manager.js';
import { startBackendService } from '../server/service-manager.js';

const PORT = 3000;

// 场景 1：UI 命令 --restart 流程
async function restartService() {
  // 1. 优雅关停：先 HTTP 通知，超时后强制终止
  await gracefulShutdown(PORT);

  // 2. 启动新服务
  const url = startBackendService(PORT);
  console.log(`服务已重启: ${url}`);
}

// 场景 2：launch 命令启动前检查
async function launchService() {
  const occupied = await isPortInUse(PORT);
  if (occupied) {
    console.log('服务已在运行');
    return;
  }
  startBackendService(PORT);
}

// 场景 3：手动强制释放端口
async function forceReleasePort() {
  await killPortProcess(PORT);
  await waitForPortFree(PORT, 10000); // 最多等待 10 秒
  console.log('端口已释放');
}
```

Explanation:
1. `restartService` 展示了 `--restart` 的完整流程，`gracefulShutdown` 内部会自动处理优雅和强制两种关停路径
2. `launchService` 展示了 `launch` 命令的典型用法，仅检测端口状态，不执行终止操作
3. `forceReleasePort` 展示了强制释放端口的用法，适用于需要无条件终止占用进程的场景
