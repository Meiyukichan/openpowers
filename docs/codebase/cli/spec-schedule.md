# Scheduler Commands (schedule)

> Source files:
> - `src/commands/schedule/index.ts` : 1-77
> - `src/commands/schedule/request.ts` : 1-54

## Overview

schedule 子命令是 Furina CLI 中用于管理后台定时调度器（cron scheduler）的命令模块。它提供两个子命令：

- `schedule restart`：重启调度器，向后端服务发送 POST 请求到 `/furina/api/schedule/restart`。
- `schedule stop`：停止调度器，向后端服务发送 DELETE 请求到 `/furina/api/schedule`。

两个命令在执行 API 调用前都会检查后端服务器是否正在运行（通过端口检测），确保不会向不存在的服务发送请求。HTTP 请求通过一个轻量级的 `sendApiRequest` 辅助函数完成，超时时间为 5 秒。

**设计动机**：Furina 的后端服务（Express）运行在本地端口上，并承载了一个定时任务调度器。CLI 需要一种方式让用户在不访问 Web UI 的情况下控制调度器的启停，因此通过 HTTP API 调用来远程控制后端的调度器状态。

**使用场景**：当用户需要重启调度器（例如修改了定时任务配置后需要重载）或临时停止调度器时，通过 CLI 执行 `furina schedule restart` 或 `furina schedule stop`。

**涉及源文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/commands/schedule/index.ts` | 命令注册入口，定义 `restart` 和 `stop` 两个子命令，封装端口检测和业务逻辑 |
| `src/commands/schedule/request.ts` | HTTP 请求辅助函数，封装向后端发送 API 请求的通用逻辑 |

## Architecture / Flow

schedule 命令的执行流程非常直接，采用"检测 → 请求 → 输出"的三步模式：

```
用户执行命令
    |
    v
[端口检测] isPortInUse(UI_PORT)
    |
    +--- 端口未占用 --> 输出错误信息 "server is not running"，退出码=1
    |
    +--- 端口已占用
            |
            v
      [发送HTTP请求] sendApiRequest(port, method, path)
            |
            +--- 成功 (2xx) --> 输出成功信息
            |
            +--- 失败/超时 --> 抛出异常，被 catch 捕获
                                    |
                                    v
                              输出错误信息到 stderr，退出码=1
```

**关键设计点**：

1. **前置端口检测**：在发送 HTTP 请求之前，先通过 `isPortInUse` 检查后端服务是否正在运行。这是一种防御性设计，避免因服务未启动导致请求超时等待。
2. **错误处理分层**：`runScheduleRestart`/`runScheduleStop` 内部处理端口检测失败的场景，而外层 `action` 回调捕获所有其他异常（如网络错误、超时），确保任何错误都不会导致进程崩溃。
3. **退出码语义**：端口未占用和请求失败均设置 `process.exitCode = 1`，调用方可据此判断命令是否成功。

## Functionality / Interface Details

### `runScheduleRestart(): Promise<void>`

**Source**: `src/commands/schedule/index.ts`:12-24

**Functionality**: 执行调度器重启操作。首先检查后端服务是否在运行，如果未运行则输出提示信息并返回；如果正在运行则向后端发送 POST 请求到 `/furina/api/schedule/restart` 端点，成功后输出 "Scheduler restarted." 确认信息。这是一个内部函数，不对外导出，仅通过 Commander 的 action 回调调用。

**Parameters**: 无

**Return Value**:
- `Promise<void>`: 正常完成时无返回值
- 可能的错误/边界情况：当端口未占用时不会 reject，而是输出信息并设置 `process.exitCode = 1` 后 return；当 HTTP 请求失败时抛出异常

**Core Logic**:

函数执行两阶段逻辑：

1. **端口检测阶段**：调用 `isPortInUse(UI_PORT)` 检查 3939 端口是否被占用。如果端口空闲（服务未运行），输出 "Furina server is not running. Please run `furina launch` first." 并设置退出码为 1 后直接返回。
2. **API 调用阶段**：调用 `sendApiRequest` 发送 POST 请求到 `/furina/api/schedule/restart`，成功后向 stdout 输出 "Scheduler restarted."。

**Core Code**:
```typescript
async function runScheduleRestart(): Promise<void> {
  const portInUse = await isPortInUse(UI_PORT);
  if (!portInUse) {
    process.stdout.write(
      'Furina server is not running. Please run `furina launch` first.\n',
    );
    process.exitCode = 1;
    return;
  }

  await sendApiRequest(UI_PORT, 'POST', '/furina/api/schedule/restart');
  process.stdout.write('Scheduler restarted.\n');
}
```
Source: `src/commands/schedule/index.ts`:12-24

**Usage Example**:
```typescript
// 该函数不对外导出，通过 Commander action 间接调用：
// 用户在终端执行: furina schedule restart
// Commander 调度到对应 action -> runScheduleRestart()
```
Explanation: `runScheduleRestart` 是内部函数，用户通过 CLI 命令 `furina schedule restart` 触发。

---

### `runScheduleStop(): Promise<void>`

**Source**: `src/commands/schedule/index.ts`:26-38

**Functionality**: 执行调度器停止操作。与 `runScheduleRestart` 结构完全对称，区别在于发送的是 DELETE 请求到 `/furina/api/schedule` 端点，成功后输出 "Scheduler stopped."。同样是一个内部函数，仅通过 Commander action 回调调用。

**Parameters**: 无

**Return Value**:
- `Promise<void>`: 正常完成时无返回值
- 可能的错误/边界情况：与 `runScheduleRestart` 相同

**Core Logic**:

1. **端口检测阶段**：调用 `isPortInUse(UI_PORT)` 检查后端服务运行状态。未运行则输出错误提示。
2. **API 调用阶段**：调用 `sendApiRequest` 发送 DELETE 请求到 `/furina/api/schedule`，成功后向 stdout 输出 "Scheduler stopped."。

**Core Code**:
```typescript
async function runScheduleStop(): Promise<void> {
  const portInUse = await isPortInUse(UI_PORT);
  if (!portInUse) {
    process.stdout.write(
      'Furina server is not running. Please run `furina launch` first.\n',
    );
    process.exitCode = 1;
    return;
  }

  await sendApiRequest(UI_PORT, 'DELETE', '/furina/api/schedule');
  process.stdout.write('Scheduler stopped.\n');
}
```
Source: `src/commands/schedule/index.ts`:26-38

**Usage Example**:
```typescript
// 通过 CLI 命令触发: furina schedule stop
// Commander 调度到对应 action -> runScheduleStop()
```
Explanation: `runScheduleStop` 是内部函数，用户通过 CLI 命令 `furina schedule stop` 触发。

---

### `registerScheduleCommand(program: Command): void`

**Source**: `src/commands/schedule/index.ts`:44-76

**Functionality**: 向 Commander 程序实例注册 `schedule` 父命令及其子命令。这是整个模块的对外接口，由 CLI 入口文件 `src/cli/index.ts` 调用。函数创建一个名为 `schedule` 的父命令，描述为 "Manage the Furina cron scheduler"，然后在其上注册两个子命令 `restart` 和 `stop`。

每个子命令的 action 回调都用 try-catch 包裹，捕获运行时异常并输出到 stderr，同时设置退出码为 1。这种设计确保即使发生意外错误，CLI 进程也不会崩溃，而是优雅地输出错误信息。

**Parameters**:
- `program` (`Command`): Commander 的根命令实例，用于挂载子命令

**Return Value**:
- `void`: 无返回值，副作用是向 program 注册了 `schedule` 命令树

**Core Logic**:

1. 在 `program` 上创建 `schedule` 父命令。
2. 在 `scheduleCmd` 上注册 `restart` 子命令，action 中调用 `runScheduleRestart()`。
3. 在 `scheduleCmd` 上注册 `stop` 子命令，action 中调用 `runScheduleStop()`。
4. 每个 action 内部用 try-catch 捕获异常，错误信息格式为 `Failed to {action} scheduler: {message}`。

**Core Code**:
```typescript
export function registerScheduleCommand(program: Command): void {
  const scheduleCmd = program
    .command('schedule')
    .description('Manage the Furina cron scheduler');

  scheduleCmd
    .command('restart')
    .description('Restart the scheduler')
    .action(async () => {
      try {
        await runScheduleRestart();
      } catch (err) {
        process.stderr.write(
          `Failed to restart scheduler: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  scheduleCmd
    .command('stop')
    .description('Stop the scheduler')
    .action(async () => {
      try {
        await runScheduleStop();
      } catch (err) {
        process.stderr.write(
          `Failed to stop scheduler: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```
Source: `src/commands/schedule/index.ts`:44-76

**Usage Example**:
```typescript
import { Command } from 'commander';
import { registerScheduleCommand } from './commands/schedule/index.js';

const program = new Command();
program.name('furina');
registerScheduleCommand(program);

// 注册后，用户可以通过以下命令调用：
// furina schedule restart
// furina schedule stop
```
Explanation: 在 CLI 入口中，将 Commander 根实例传入 `registerScheduleCommand`，之后该实例即可识别 `schedule restart` 和 `schedule stop` 子命令。

---

### `sendApiRequest(port: number, method: string, path: string): Promise<void>`

**Source**: `src/commands/schedule/request.ts`:18-54

**Functionality**: 通用的 HTTP 请求辅助函数，向本地后端服务发送指定方法和路径的 API 请求。该函数封装了 Node.js 原生 `http.request` 的所有细节，包括连接建立、响应体收集、状态码校验、错误处理和超时控制。它是 schedule 命令与后端服务通信的唯一通道。

**Parameters**:
- `port` (`number`): 后端服务的端口号，函数会向 `localhost:{port}` 发起请求
- `method` (`string`): HTTP 方法，如 `"POST"`、`"DELETE"`
- `path` (`string`): API 路径，如 `"/furina/api/schedule/restart"`

**Return Value**:
- `Promise<void>`: 当收到 2xx 响应时 resolve；当请求失败、超时或返回非 2xx 状态码时 reject
- 错误类型：
  - 网络错误：`req.on('error')` 触发的 Error 对象（如连接被拒绝）
  - 超时错误：`"API request timed out"` 消息的 Error 对象
  - 非 2xx 响应：`"API request returned status {code}: {body}"` 消息的 Error 对象

**Core Logic**:

1. **构建请求选项**：创建 `http.RequestOptions` 对象，设置 `hostname: 'localhost'`、传入的 `port`、`path`、`method`、`timeout: 5000`（5 秒超时）以及 `Content-Type: application/json` 请求头。
2. **发起请求**：调用 `http.request` 创建请求对象，在响应回调中通过 `data` 事件拼接响应体，`end` 事件中检查状态码。
3. **状态码校验**：如果 `statusCode` 在 `[200, 300)` 范围内则 resolve；否则 reject 并携带状态码和响应体。
4. **错误处理**：监听 `error` 事件直接 reject；监听 `timeout` 事件后先调用 `req.destroy()` 销毁连接再 reject。

**Core Code**:
```typescript
export function sendApiRequest(port: number, method: string, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port,
      path,
      method,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`API request returned status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timed out'));
    });

    req.end();
  });
}
```
Source: `src/commands/schedule/request.ts`:18-54

**Usage Example**:
```typescript
import { sendApiRequest } from './request.js';

// 重启调度器
await sendApiRequest(3939, 'POST', '/furina/api/schedule/restart');

// 停止调度器
await sendApiRequest(3939, 'DELETE', '/furina/api/schedule');
```
Explanation: 通过 `sendApiRequest` 可以向后端的 schedule API 端点发送请求。第一个参数是后端端口（3939），第二个是 HTTP 方法，第三个是 API 路径。成功时 promise resolve，失败时抛出带详细信息的错误。

## Data Structures

### `http.RequestOptions`（Node.js 内置类型）

函数内部使用的请求配置对象：

```typescript
const options: http.RequestOptions = {
  hostname: 'localhost',  // 目标主机
  port,                   // 目标端口（number 类型）
  path,                   // API 路径
  method,                 // HTTP 方法
  timeout: 5000,          // 超时时间（毫秒）
  headers: {
    'Content-Type': 'application/json',
  },
};
```
- `hostname` (`string`): 固定为 `'localhost'`，仅支持本地通信
- `port` (`number`): 后端服务端口
- `path` (`string`): API 端点路径
- `method` (`string`): HTTP 方法
- `timeout` (`number`): 请求超时时间，硬编码为 5000ms
- `headers` (`Record<string, string>`): 请求头，固定包含 `Content-Type: application/json`

## Error Handling and Edge Cases

### 错误处理策略

schedule 命令采用**两层错误处理**架构：

**第一层（业务逻辑层）**：在 `runScheduleRestart`/`runScheduleStop` 中处理"服务未运行"的预期场景。不抛出异常，而是输出友好提示并设置 `process.exitCode = 1`。

**第二层（命令注册层）**：在 `registerScheduleCommand` 的 action 回调中用 try-catch 捕获所有未预期的异常，输出到 stderr 并设置退出码为 1。

### 具体错误场景

| 错误场景 | 处理方式 | 输出目标 |
|---------|---------|---------|
| 后端服务未运行（端口未占用） | 输出提示信息，设置 exitCode=1 | stdout |
| HTTP 请求超时（5秒内未响应） | `sendApiRequest` reject，被外层 catch 捕获 | stderr |
| 连接被拒绝（服务意外停止） | `req.on('error')` 触发 reject | stderr |
| 后端返回非 2xx 状态码 | reject 携带状态码和响应体 | stderr |
| 后端返回 2xx 但业务失败 | 不做额外处理，按成功处理 | stdout |

### 边界情况

1. **竞态条件**：端口检测通过后、请求发出前，后端可能恰好停止。此时 `sendApiRequest` 会抛出连接错误，被外层 catch 捕获。
2. **超时后连接销毁**：超时事件触发后，调用 `req.destroy()` 确保底层 socket 被正确释放，避免资源泄漏。
3. **响应体拼接**：即使只检查状态码，也会完整读取响应体。这是因为 Node.js HTTP API 要求消费所有数据才能触发 `end` 事件，不消费可能导致连接无法复用。

## Dependencies

### Depends on

- **`src/utils/port-manager.ts`**：提供 `isPortInUse(port: number): Promise<boolean>` 函数，通过尝试在指定端口创建临时服务器来判断端口是否被占用。schedule 命令使用它来检测后端服务是否正在运行。
- **`src/server/service-manager.ts`**：导出 `UI_PORT` 常量（值为 `3939`），作为后端服务的默认端口号。schedule 命令使用此常量来确定要连接的目标端口。
- **`commander`**：第三方命令行框架，提供 `Command` 类型用于命令注册。
- **Node.js `http` 模块**：标准库，`sendApiRequest` 使用 `http.request` 发送 HTTP 请求。

### Depended by

- **`src/cli/index.ts`**：CLI 入口文件，调用 `registerScheduleCommand(program)` 将 schedule 命令注册到根 Commander 实例上。

## Usage Examples

### 完整使用场景

用户在终端中管理 Furina 定时调度器：

**场景 1：重启调度器**

```bash
# 确保后端服务已启动
furina launch

# 重启调度器
furina schedule restart
# 输出: Scheduler restarted.
```

**场景 2：停止调度器**

```bash
furina schedule stop
# 输出: Scheduler stopped.
```

**场景 3：后端未运行时操作**

```bash
# 假设后端服务未启动
furina schedule restart
# 输出: Furina server is not running. Please run `furina launch` first.
# 退出码: 1
```

**场景 4：后端返回错误**

```bash
# 后端运行中但调度器操作失败（如内部错误）
furina schedule restart
# 输出: Failed to restart scheduler: API request returned status 500: {error details}
# 退出码: 1
```

### 代码层面的集成方式

```typescript
// src/cli/index.ts 中的注册方式
import { registerScheduleCommand } from '../commands/schedule/index.js';

const program = new Command();
program.name('furina').description('Furina CLI').version(pkg.version);

// 注册 schedule 命令（与其他 11 个命令模块并列）
registerScheduleCommand(program);

// 注册后，Commander 自动解析以下命令：
// furina schedule restart -> runScheduleRestart()
// furina schedule stop   -> runScheduleStop()
```

Explanation: `registerScheduleCommand` 在 CLI 启动时被调用一次，将 `schedule` 父命令及其子命令注册到 Commander 实例中。之后 Commander 自动处理命令行参数解析、子命令分发和帮助信息生成。用户执行 `furina schedule restart` 时，Commander 将调度到 `runScheduleRestart()`，该函数先检测端口，再发送 POST 请求到后端 API。
