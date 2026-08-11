# Schedule Logger

> Source files:
> - `src/server/memory/schedule-logger.ts` : 1-29

## Overview

Schedule Logger 是 memory 子系统中的专用追加式日志模块，为内存调度器（scheduler）及其相关流程提供统一的日志记录能力。

**设计动机**：内存调度器在运行过程中涉及大量异步操作（Cron 调度、Claude 命令执行、设计文件同步、分组聚合等），这些操作需要一个持久化的、不侵入主控制台输出的日志通道，以便事后排查调度流程中的问题。该模块采用追加写入（append-only）模式，将带时间戳的日志写入用户主目录下的固定文件，保证所有调度相关操作均可追溯。

**使用场景**：
- 服务器启动/关闭时记录生命周期事件
- 调度器 Cron 任务的启停、配置读取
- 项目设计文件的复制、同步、清理等操作
- Claude CLI 命令的执行结果
- 分组聚合流程中的校验和错误信息
- API 路由层对调度器的控制操作（PUT/DELETE/POST）

**涉及源文件及职责**：
- `src/server/memory/schedule-logger.ts`：核心模块，提供 `appendLog()` 函数，负责目录自动创建和日志追加写入

## Architecture / Flow

Schedule Logger 的调用流程非常简单，属于无状态的工具函数模式：

```
调用方（scheduler / sync-design / routes / entry）
    │
    ▼
appendLog(message: string)
    │
    ├── 1. 检查日志目录是否存在，不存在则递归创建
    │
    ├── 2. 生成 ISO 8601 时间戳
    │
    └── 3. 同步追加写入一行日志到 dreamwork.log
```

日志目录固定为 `~/.furina/memory/`，日志文件固定为 `dreamwork.log`。每次写入均为同步操作（`appendFileSync`），保证写入顺序与调用顺序一致。

## Functionality / Interface Details

### `appendLog(message: string) -> void`

**Source**: `src/server/memory/schedule-logger.ts`:23-29

**Functionality**: 向 dreamwork.log 日志文件追加一行带时间戳的消息。这是该模块唯一对外暴露的接口，也是整个调度日志子系统的核心入口。该函数在首次调用时会自动创建日志目录（如果目录尚不存在），随后所有调用直接追加写入。日志采用追加模式（append），不会覆盖已有内容，保证历史记录完整。每行日志格式为 `[ISO8601时间戳] 消息内容`，时间精度为毫秒级。

**参数**:
- `message` (`string`): 需要记录的日志消息文本。无长度限制，但实践中一般为简洁的状态描述，例如 `"Scheduler cron registered (0 2 * * *)"` 或 `"Claude execution failed for /path/to/project: timeout"`。

**返回值**:
- `void`: 该函数无返回值。
- 可能的错误/边界情况：
  - 如果 `~/.furina/memory/` 目录不存在且创建失败（如权限不足），`mkdirSync` 会抛出异常。
  - 如果文件写入失败（如磁盘已满、文件被锁定），`appendFileSync` 会抛出异常。
  - 该函数不做 try-catch，异常会直接冒泡到调用方。

**Core Logic**:

函数内部逻辑分为三个步骤：

1. **目录存在性检查**：使用 `fs.existsSync()` 检查日志目录 `~/.furina/memory/` 是否存在。如果不存在，调用 `fs.mkdirSync()` 并传入 `{ recursive: true }` 参数递归创建完整路径。这个设计使得模块在首次调用时自动初始化存储目录，调用方无需关心目录创建问题。

2. **时间戳生成**：使用 `new Date().toISOString()` 生成 ISO 8601 格式的 UTC 时间戳，精度为毫秒。例如 `"2026-07-05T12:30:45.123Z"`。使用 UTC 时间（Z 后缀）避免了时区歧义，方便跨时区的团队成员阅读。

3. **同步追加写入**：使用 `fs.appendFileSync()` 以 UTF-8 编码将格式化后的日志行追加到文件末尾。每行以换行符 `\n` 结尾。使用同步写入保证了多条日志的写入顺序严格按调用顺序排列，这在并发场景下尤为重要（Node.js 单线程模型中，同步操作不会被其他代码插入）。

**Core Code**:
```typescript
export function appendLog(message: string): void {
  if (!fs.existsSync(DREAMWORK_LOG_DIR)) {
    fs.mkdirSync(DREAMWORK_LOG_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(DREAMWORK_LOG_FILE, `[${timestamp}] ${message}\n`, 'utf-8');
}
```
Source: `src/server/memory/schedule-logger.ts`:23-29

**Usage Example**:
```typescript
import { appendLog } from './memory/schedule-logger.js';

// 记录调度器启动事件
appendLog(`Scheduler cron registered (${cronExpression})`);

// 记录执行结果
appendLog(`Claude execution succeeded: ${projectDir}`);

// 记录错误
appendLog(`Failed to cleanup design file ${mdPath}: ${errorMessage}`);
```
Explanation: 以上展示了三种典型调用场景——正常状态记录、成功操作记录、错误记录。所有消息都会自动带上 UTC 时间戳前缀。

## Data Structures

### 常量 `DREAMWORK_LOG_DIR`

```typescript
const DREAMWORK_LOG_DIR = path.join(os.homedir(), '.furina', 'memory');
```

- 类型：`string`
- 含义：日志文件所在目录的绝对路径，始终为当前用户主目录下的 `~/.furina/memory/`。

### 常量 `DREAMWORK_LOG_FILE`

```typescript
const DREAMWORK_LOG_FILE = path.join(DREAMWORK_LOG_DIR, 'dreamwork.log');
```

- 类型：`string`
- 含义：日志文件的完整绝对路径，始终为 `~/.furina/memory/dreamwork.log`。

### 日志行格式

```
[2026-07-05T12:30:45.123Z] Scheduler cron registered (0 2 * * *)
```

- 时间戳部分：方括号包裹的 ISO 8601 UTC 时间戳，`Date.prototype.toISOString()` 输出格式
- 分隔：时间戳与消息之间有一个空格
- 每行以 `\n` 结尾

## Error Handling and Edge Cases

该模块的错误处理策略是 **不做内部处理，异常直接冒泡**：

- **目录创建失败**：如果 `~/.furina/` 或 `~/.furina/memory/` 无法创建（权限问题、路径中存在同名文件等），`fs.mkdirSync()` 会抛出 `Error`，异常传播到调用方。
- **文件写入失败**：如果磁盘空间不足、文件描述符耗尽等，`fs.appendFileSync()` 会抛出 `Error`。
- **目录已存在**：`fs.existsSync()` 返回 `true` 后直接跳过创建，不会出错。`mkdirSync` 的 `recursive: true` 选项也会在目录已存在时不报错。
- **首次调用**：模块设计为首次调用时自动创建目录，无需显式初始化。
- **并发调用**：Node.js 单线程模型下，同步操作不会出现竞态条件。`appendFileSync` 保证每次写入是原子性的。

## Dependencies

### Depends on

- **Node.js `fs` 模块**：用于目录检查（`existsSync`）、目录创建（`mkdirSync`）、文件追加（`appendFileSync`）
- **Node.js `os` 模块**：用于获取用户主目录（`os.homedir()`）
- **Node.js `path` 模块**：用于路径拼接（`path.join()`）

### Depended by

- **scheduler.ts**（`src/server/memory/scheduler.ts`）：调度器核心模块，记录 Cron 配置、任务启停、Claude 命令执行结果、文件清理操作、分组聚合流程等大量日志
- **sync-design.ts**（`src/server/memory/sync-design.ts`）：设计文件同步模块，记录 design.md 的复制、同步触发、API 调用结果等日志
- **entry.ts**（`src/server/entry.ts`）：服务器入口，记录服务器启动和关闭事件
- **routes/schedule.ts**（`src/server/routes/schedule.ts`）：调度 API 路由层，记录 PUT/DELETE/POST 等 HTTP 控制操作的日志

## Usage Examples

### 基本使用

```typescript
import { appendLog } from './memory/schedule-logger.js';

// 直接记录一条简单的状态消息
appendLog('Server started on port 3000, starting scheduler');
```

输出到 `~/.furina/memory/dreamwork.log` 的内容：
```
[2026-07-05T12:30:45.123Z] Server started on port 3000, starting scheduler
```

### 在调度器中记录执行流程

```typescript
import { appendLog } from './memory/schedule-logger.js';

// 记录 Cron 配置
appendLog(`Scheduler using cron from config: ${schedule}`);

// 记录任务开始
appendLog('Scheduler task started');

// 记录正在处理的项目
appendLog(`Processing: ${projectDir}`);

// 记录命令执行
appendLog(`Executing: ${command}`);

// 根据执行结果记录成功或失败
if (success) {
  appendLog(`Claude execution succeeded: ${projectDir}`);
} else {
  appendLog(`Claude execution failed for ${projectDir}: ${error.message}`);
}

// 记录任务结束
appendLog('Scheduler task finished');
```

Explanation: 调度器在每个关键节点调用 `appendLog`，形成完整的执行轨迹。通过查看日志文件可以还原整个调度任务的执行过程，包括读取了哪个 Cron 配置、处理了哪些项目、每步操作的结果如何。

### 在 API 路由层记录控制操作

```typescript
import { appendLog } from '../memory/schedule-logger.js';

// PUT /schedule - 启动调度器
appendLog('PUT /schedule: starting scheduler');

// DELETE /schedule - 停止调度器
appendLog('DELETE /schedule: stopping scheduler');

// POST /schedule/restart - 重启调度器
appendLog('POST /schedule/restart: restarting scheduler');
```

Explanation: 路由层使用统一的日志格式记录用户通过 HTTP API 对调度器进行的控制操作，便于追踪"谁在什么时候对调度器做了什么操作"。
