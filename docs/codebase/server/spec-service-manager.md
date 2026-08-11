# Service Manager (Background Process Control)

> Source files:
> - `src/server/service-manager.ts` : 1-64

## Overview

本 spec 覆盖后端服务的进程生命周期管理模块 `service-manager.ts`，负责将 Express UI/代理服务器作为**分离的后台子进程**启动，并提供进程标识信息持久化能力。

### 在系统中的角色与定位

Service Manager 是 CLI 命令层与后端服务器进程之间的**桥梁模块**。CLI 命令（如 `ui`、`launch`、`active`、`enable`）通过调用本模块的 `startBackendService()` 函数，将 `dist/server/entry.js` 启动为独立的 Node.js 子进程，使得 CLI 主进程可以在启动服务后立即返回，而服务器在后台持续运行。

### 设计动机

- **进程分离**：使用 Node.js `spawn()` 的 `detached: true` 选项将服务器子进程与 CLI 父进程分离，避免 CLI 退出时子进程被终止。
- **优雅关闭支持**：通过将 PID 和端口号写入 `~/.furina/.furina.pid` 文件，使其他工具（如 `gracefulShutdown()`）能够通过 PID 找到并终止服务器进程。
- **客户端构建产物预检**：在启动服务前检查 `dist/client/` 是否存在，若缺失则输出警告提示用户先执行构建命令，但不会阻断服务启动。
- **跨平台兼容**：使用 `windowsHide: true` 防止 Windows 平台上弹出命令行窗口。

### 涉及的源文件

| 文件 | 职责 |
|------|------|
| `src/server/service-manager.ts` | 后台服务启动与 PID 文件管理 |
| `src/utils/logger.ts` | 提供共享 winston 日志记录器（依赖项） |

## Architecture / Flow

```
CLI Commands (ui/launch/active/enable)
        |
        v
 startBackendService(port)
        |
        +---> 检查 dist/client/ 是否存在
        |         |
        |         +---> 不存在: 输出 stdout 警告（不阻断）
        |
        +---> spawnServer(port)
        |         |
        |         +---> spawn(process.execPath, [dist/server/entry.js])
        |         |         detached: true
        |         |         windowsHide: true
        |         |         env: FURINA_UI_PORT={port}
        |         |
        |         +---> 确保 ~/.furina/ 目录存在
        |         |
        |         +---> 写入 PID 文件 (JSON: { pid, port })
        |         |
        |         +---> child.unref() -- 允许父进程独立退出
        |
        +---> logger.info("UI server spawned on port {port}")
        |
        +---> 输出 "UI server started at http://localhost:{port}/furina/ui"
        |
        +---> 返回 UI URL 字符串
```

## Functionality / Interface Details

### `startBackendService(port: number) -> string`

**Source**: `src/server/service-manager.ts`:53-64

**Functionality**: 启动后端服务的主入口函数。此函数是本模块唯一的公开接口，由 CLI 命令层调用以在后台启动 Express 服务器。它执行以下操作序列：(1) 检查前端构建产物目录是否存在；(2) 调用内部 `spawnServer()` 将 `dist/server/entry.js` 作为分离子进程启动；(3) 记录日志；(4) 输出用户提示信息；(5) 返回 UI 访问 URL。此函数**不负责打开浏览器**——浏览器打开由调用方（如 `ui.ts`）自行处理。

**Parameters**:
- `port` (`number`): 服务器监听的端口号。通常使用 `UI_PORT` 常量（3939），但也支持自定义端口。此端口号会通过环境变量 `FURINA_UI_PORT` 传递给子进程。

**Return Value**:
- `string`: 完整的 UI 访问 URL，格式为 `http://localhost:{port}/furina/ui`。调用方可直接用于打开浏览器或输出给用户。
- 即使 `dist/client/` 不存在（前端未构建），函数仍会正常启动服务并返回 URL，不会抛出异常。

**Core Logic**:

函数首先通过 `path.join(moduleDirname, '..', '..', 'dist', 'client')` 构建前端构建产物的绝对路径。`moduleDirname` 在模块顶层通过 `fileURLToPath(import.meta.url)` 解析得到，指向当前源文件编译后所在的 `dist/server/` 目录。然后检查该目录是否存在，若不存在则通过 `process.stdout.write()` 输出警告信息，但**不中断执行流程**——这是一个有意的设计决策，允许后端 API 在没有前端资源的情况下仍可独立运行。

随后调用 `spawnServer(port)` 启动子进程，记录日志到 winston 文件日志，构建并返回 UI URL，同时向标准输出写入启动确认信息。

**Core Code**:
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

**Usage Example**:
```typescript
import { startBackendService, UI_PORT } from '../server/service-manager.js';
import { isPortInUse } from '../utils/port-manager.js';

const port = UI_PORT;
const portInUse = await isPortInUse(port);
if (portInUse) {
  process.stdout.write('UI server is already running\n');
} else {
  const uiUrl = startBackendService(port);
  openBrowser(uiUrl); // 调用方自行决定是否打开浏览器
}
```
Explanation: 先通过端口检测判断服务是否已运行，未运行时调用 `startBackendService()` 启动服务并获取 URL，然后由调用方决定是否打开浏览器。这是 `ui.ts` 命令的典型使用模式。

---

### `spawnServer(port: number) -> void` (内部函数)

**Source**: `src/server/service-manager.ts`:29-45

**Functionality**: 核心进程生成函数，负责实际的子进程创建和 PID 文件写入。此函数为模块内部函数，不对外导出，仅由 `startBackendService()` 调用。它使用 Node.js `child_process.spawn()` 以分离（detached）模式启动服务器入口文件，并将进程标识信息持久化到磁盘以支持优雅关闭。

**Parameters**:
- `port` (`number`): 服务器监听的端口号，会被序列化为字符串注入到子进程的环境变量 `FURINA_UI_PORT` 中。

**Return Value**:
- `void`: 无返回值。子进程在后台独立运行，父进程通过 `child.unref()` 放弃对子进程的引用。

**Core Logic**:

1. **进程生成**：使用 `spawn(process.execPath, [serverEntryPath], ...)` 启动子进程。`process.execPath` 确保子进程使用与当前进程相同的 Node.js 运行时。`serverEntryPath` 在模块顶层计算为 `dist/server/entry.js` 的绝对路径。spawn 选项配置：
   - `detached: true`：将子进程置于新的进程组中，使父进程退出后子进程继续运行。
   - `stdio: ['ignore', 'inherit', 'inherit']`：忽略子进程的 stdin，但让 stdout/stderr 继承父进程的流，这样服务器的日志输出仍可被用户看到。
   - `env: { ...process.env, FURINA_UI_PORT: String(port) }`：继承父进程全部环境变量，同时注入 `FURINA_UI_PORT` 端口配置。
   - `windowsHide: true`：在 Windows 上隐藏子进程的控制台窗口，提供更清洁的用户体验。

2. **PID 文件写入**：确保 `~/.furina/` 目录存在（使用 `fs.mkdirSync` 的 `recursive: true` 选项），然后将 `{ pid, port }` 对象以格式化 JSON 写入 `~/.furina/.furina.pid` 文件。每次调用都会覆盖前一次的 PID 文件。

3. **进程引用释放**：调用 `child.unref()` 使 Node.js 事件循环不再等待子进程退出，允许 CLI 父进程正常退出而不被阻塞。

**Core Code**:
```typescript
function spawnServer(port: number): void {
  const child = spawn(process.execPath, [serverEntryPath], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, FURINA_UI_PORT: String(port) },
    windowsHide: true,
  });

  // Write PID file for graceful shutdown support
  const pidDir = path.dirname(PID_FILE);
  if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
  }
  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, port }, null, 2), 'utf-8');

  child.unref();
}
```
Source: `src/server/service-manager.ts`:29-45

**Usage Example**:
```typescript
// spawnServer 是内部函数，不直接调用。调用链如下：
// CLI 命令 -> startBackendService(port) -> spawnServer(port)

// 子进程启动后，其他模块可通过读取 PID 文件获取进程信息：
import fs from 'fs';
import os from 'os';
const pidFile = path.join(os.homedir(), '.furina', '.furina.pid');
const { pid, port } = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
process.kill(pid); // 通过 PID 终止服务器进程
```
Explanation: `spawnServer()` 不对外暴露，但写入的 PID 文件可被其他模块（如端口管理器的 `gracefulShutdown()`）读取，用于优雅关闭服务器进程。

---

### `UI_PORT` (常量)

**Source**: `src/server/service-manager.ts`:15

**Functionality**: 导出的默认端口常量，定义后端服务器的标准监听端口。所有 CLI 命令在调用 `startBackendService()` 时使用此常量作为端口参数，确保一致性。

**Type**: `number`

**Value**: `3939`

**Usage Example**:
```typescript
import { UI_PORT } from '../server/service-manager.js';

const portInUse = await isPortInUse(UI_PORT);
if (!portInUse) {
  startBackendService(UI_PORT);
}
```
Explanation: 直接引用 `UI_PORT` 常量而非硬编码端口号，确保所有调用点使用统一的默认端口。

## Data Structures

### PID 文件结构 (`~/.furina/.furina.pid`)

```typescript
interface PidFileInfo {
  pid: number;   // 子进程的进程 ID
  port: number;  // 服务器监听的端口号
}
```

文件以格式化 JSON 存储（`JSON.stringify(data, null, 2)`），示例内容：
```json
{
  "pid": 12345,
  "port": 3939
}
```
- `pid` (`number`): 由 `child_process.spawn()` 返回的子进程 PID，用于后续通过 `process.kill(pid)` 实现优雅关闭。
- `port` (`number`): 服务器监听的端口号，与 `FURINA_UI_PORT` 环境变量一致，用于端口冲突检测和 URL 构建。

### 模块级常量

| 常量 | 类型 | 值 | 说明 |
|------|------|-----|------|
| `UI_PORT` | `number` | `3939` | 默认服务器端口（导出） |
| `PID_FILE` | `string` | `~/.furina/.furina.pid` | PID 文件绝对路径（内部） |
| `serverEntryPath` | `string` | `dist/server/entry.js` 的绝对路径 | 子进程入口文件（内部） |
| `moduleDirname` | `string` | 当前模块所在目录的绝对路径 | 用于计算相对路径（内部） |

## Error Handling and Edge Cases

### 前端构建产物缺失

当 `dist/client/` 目录不存在时，`startBackendService()` 仅输出警告到 stdout，**不会抛出异常或终止启动流程**。这是一个有意的设计：后端 API 服务器可以在没有前端资源的情况下独立运行，前端的缺失只影响 Web UI 的访问，不影响 API 功能。

### PID 文件目录自动创建

`spawnServer()` 在写入 PID 文件前检查 `~/.furina/` 目录是否存在，若不存在则使用 `fs.mkdirSync({ recursive: true })` 自动创建。这处理了首次运行时目录尚未建立的场景。

### PID 文件覆盖

每次调用 `spawnServer()` 都会覆盖 PID 文件。如果多次调用 `startBackendService()`，文件中只保留最后一次启动的进程信息。从测试用例可以看出，这是预期行为——测试验证了重新启动时 PID 文件被正确更新。

### 子进程 stdio 配置

子进程的 stdin 设置为 `'ignore'`（避免子进程等待输入），stdout 和 stderr 设置为 `'inherit'`（继承父进程的输出流）。这意味着子进程（服务器）的日志输出会直接显示在用户终端中。

### Windows 平台兼容

`windowsHide: true` 选项防止在 Windows 上为子进程弹出新的命令行窗口，提供"无头"运行体验。

## Dependencies

### Depends on

- **`../utils/logger.ts`**：提供共享的 winston 日志记录器实例 `logger`，用于记录服务启动日志。日志写入 `~/.furina/logs/furina.log`。
- **Node.js 内置模块**：
  - `child_process`：`spawn()` 用于创建子进程。
  - `path`：路径拼接与解析。
  - `fs`：文件系统操作（存在性检查、目录创建、文件写入）。
  - `os`：`homedir()` 获取用户主目录。
  - `url`：`fileURLToPath()` 将 ESM `import.meta.url` 转换为文件系统路径。

### Depended by

- **`src/commands/ui.ts`**：`furina ui` 命令，启动服务后自动打开浏览器。支持 `--restart` 参数先优雅关闭再重启。
- **`src/commands/launch.ts`**：`furina launch` 命令，仅启动服务不打开浏览器。
- **`src/commands/active.ts`**：`furina active` 命令，探测服务是否运行，若端口空闲则自动启动。
- **`src/commands/enable.ts`**：启用功能时可能触发服务启动。
- **`src/server/entry.ts`**（间接）：作为 `serverEntryPath` 指向的子进程入口，读取 `FURINA_UI_PORT` 环境变量来确定监听端口。

## Usage Examples

### 典型 CLI 命令集成模式

以下是 `ui` 命令的完整使用模式，展示了如何将 `startBackendService()` 集成到 CLI 命令中：

```typescript
import { Command } from 'commander';
import { isPortInUse } from '../utils/port-manager.js';
import { startBackendService, UI_PORT } from '../server/service-manager.js';

export async function runUi(options: { restart?: boolean }): Promise<void> {
  const port = UI_PORT;

  // --restart 模式：先优雅关闭再重新启动
  if (options.restart) {
    await gracefulShutdown(port);
    const restartUrl = startBackendService(port);
    openBrowser(restartUrl);
    return;
  }

  // 检查端口是否已被占用（假设已被我们的服务器占用）
  const portInUse = await isPortInUse(port);
  if (portInUse) {
    const url = `http://localhost:${port}/furina/ui`;
    openBrowser(url);
    process.stdout.write(`UI server is already running at ${url}\n`);
    return;
  }

  // 端口空闲，启动新服务
  const uiUrl = startBackendService(port);
  openBrowser(uiUrl);
}
```

Explanation: 这是 `startBackendService()` 最典型的使用场景。命令先检查端口占用情况，避免重复启动；支持 `--restart` 模式进行优雅重启；启动成功后根据命令语义决定是否打开浏览器。注意 `startBackendService()` 仅负责进程启动和 URL 返回，浏览器打开逻辑由调用方控制。

### 端口自检与自愈模式

以下是 `active` 命令的使用模式，展示服务健康检查与自愈能力：

```typescript
import { isPortInUse } from '../utils/port-manager.js';
import { startBackendService, UI_PORT } from '../server/service-manager.js';

export async function runActive(): Promise<void> {
  const portInUse = await isPortInUse(UI_PORT);
  if (portInUse) {
    process.stdout.write('Furina service is active\n');
    return;
  }

  // 服务未运行，自动拉起
  startBackendService(UI_PORT);
  process.stderr.write('Furina service is starting, please exit the workflow and retry\n');
  process.exitCode = 1;
}
```

Explanation: `active` 命令用于检查后端服务是否正在运行。如果端口空闲（服务未运行），则调用 `startBackendService()` 自动拉起服务，但设置非零退出码告知调用方本次操作需要重试，因为新启动的服务可能还未完全就绪。

### PID 文件读取（由其他模块使用）

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

// 读取 PID 文件获取服务器进程信息
const pidFile = path.join(os.homedir(), '.furina', '.furina.pid');
const content = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
// content = { pid: 12345, port: 3939 }

// 通过 PID 终止服务器进程（优雅关闭场景）
try {
  process.kill(content.pid, 'SIGTERM');
} catch {
  // 进程可能已退出
}
```

Explanation: 虽然 `spawnServer()` 是内部函数，但它写入的 PID 文件是模块对外提供的进程标识机制。其他模块（如 `port-manager.ts` 的 `gracefulShutdown()`）通过读取此文件获取服务器进程的 PID 和端口信息，用于优雅关闭或健康检查。
