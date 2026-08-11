# sync-design: Change Design.md 全局内存同步

> Source files:
> - `src/server/memory/sync-design.ts` : 1-81

## Overview

`sync-design.ts` 是内存子系统中负责将单个 change 的 `design.md` 文件同步到全局内存目录的模块。它解决的核心问题是：在 Furina 工作流中，每次 change 的 design 文件（位于项目本地目录 `furina/changes/{changeName}/design.md`）需要被同步到全局内存路径 `~/.furina/memory/{flatCwd}/designs/{changeName}.md`，使得调度器（scheduler）能够发现和读取最新的设计文档。

该模块在系统中的定位：
- **角色**：内存同步管线中的一环，专注于 design.md 这一特定 artifact 的同步。
- **设计动机**：feature 状态查询（`feature status`）是开发者高频操作，在每次查询时触发 design 同步，确保全局内存中的设计文档始终与项目本地保持一致。
- **使用场景**：由 `runFeatureStatus()` 在验证 change 名称后调用，作为 feature 状态报告的前置同步步骤。

**涉及的源文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/server/memory/sync-design.ts` | 核心模块：定义 `syncDesignToMemory()` 函数和 `flattenCwdPath` 重导出 |
| `src/utils/memory.ts` | 提供 `flattenCwdPath()` 工具函数，将文件系统路径转换为安全目录名 |
| `src/utils/common.ts` | 提供 `normalizePath()` 底层路径规范化函数 |
| `src/server/memory/schedule-logger.ts` | 提供 `appendLog()` 日志函数，写入 dreamwork.log |
| `src/commands/change/feature.ts` | 上游调用方，在 `runFeatureStatus()` 中调用 `syncDesignToMemory()` |

## Architecture / Flow

`syncDesignToMemory()` 的执行流程分为两个主要步骤：

```
runFeatureStatus(changeName, cwd)
        |
        v
syncDesignToMemory(changeName, cwd)
        |
        v
[1] flattenCwdPath(cwd)  -->  flatCwd (安全目录名)
        |
        v
[2] 构造源路径: furina/changes/{changeName}/design.md
        |
        v
[3] 检查 design.md 是否存在?
        |                         |
     不存在                       存在
        |                         |
        v                         v
  appendLog(skip)          [4] 目标目录: ~/.furina/memory/{flatCwd}/designs/
                                   |
                                   v
                            [5] 创建目录 (如不存在) + fs.cpSync 复制文件
                                   |
                                   v
                            [6] HTTP PUT /furina/api/schedule
                                   |
                                   v
                            [7] 静默处理所有错误 (timeout / error / catch)
```

关键设计决策：
- **单向复制**：使用 `fs.cpSync` 进行同步而非软链接，保证目标文件独立于源文件。
- **静默失败**：schedule API 调用失败不会中断主流程，通过日志记录失败原因。
- **短超时**：HTTP 请求设置 5 秒超时，避免阻塞 feature status 查询。

## Functionality / Interface Details

### `syncDesignToMemory(changeName: string, cwd: string): void`

**Source**: `src/server/memory/sync-design.ts`:32-80

**Functionality**: 将项目本地的 change design 文件同步到全局内存目录，并通知调度器。这是该模块的核心函数，执行两步操作：(1) 将 `furina/changes/{changeName}/design.md` 复制到 `~/.furina/memory/{flatCwd}/designs/{changeName}.md`；(2) 向本地服务器的 schedule API 发送 PUT 请求，确保调度器正在运行。如果源文件 `design.md` 不存在，函数立即返回，不会执行复制操作也不会调用 schedule API。

**Parameters**:
- `changeName` (`string`): kebab-case 格式的 change 名称，例如 `"my-feature"`. 该名称用于构造源路径和目标文件名。
- `cwd` (`string`): 当前工作目录的绝对路径，例如 `"D:\project-code\llm\furina"`. 通过 `flattenCwdPath()` 转换后用于确定全局内存中的子目录。

**Return Value**:
- `void`: 该函数不返回任何值，所有结果通过副作用（文件复制、HTTP 请求、日志写入）体现。
- 无显式错误抛出：所有错误在内部捕获并记录到日志文件 `dreamwork.log`。

**Core Logic**:

函数内部按以下步骤执行：

1. **路径转换**：调用 `flattenCwdPath(cwd)` 将文件系统路径转为安全目录名（如 `D:\project-code\llm\furina` 变为 `Memory_D__project-code_llm_furina`）。

2. **源路径解析**：拼接 `path.join(cwd, 'furina', 'changes', changeName, 'design.md')` 得到 design 文件的绝对路径。

3. **存在性检查**：如果 `design.md` 不存在，通过 `appendLog()` 记录日志后 `return`，跳过后续所有步骤。

4. **目录创建与文件复制**：
   - 目标目录：`~/.furina/memory/{flatCwd}/designs/`
   - 使用 `fs.mkdirSync(designsDir, { recursive: true })` 确保目录存在
   - 使用 `fs.cpSync(designPath, destPath)` 执行文件复制

5. **Schedule API 调用**：
   - 端口从环境变量 `FURINA_UI_PORT` 读取，默认 `3939`
   - 使用 Node.js `http.request` 发送 PUT 请求到 `http://localhost:{port}/furina/api/schedule`
   - 设置 5000ms 超时
   - 通过 `res.resume()` 消费响应体，避免连接泄漏

**Core Code**:
```typescript
export function syncDesignToMemory(changeName: string, cwd: string): void {
  const flatCwd = flattenCwdPath(cwd);

  // Resolve design path
  const CHANGES_DIR = path.join(cwd, 'furina', 'changes');
  const designPath = path.join(CHANGES_DIR, changeName, 'design.md');

  // If design.md does not exist, skip entirely
  if (!fs.existsSync(designPath)) {
    appendLog(`syncDesignToMemory: design.md not found for change "${changeName}", skipping`);
    return;
  }

  // Step 1: Copy design.md to designs/ subdirectory under memory path
  const memoryDesignDir = path.join(os.homedir(), '.furina', 'memory', flatCwd);
  const designsDir = path.join(memoryDesignDir, 'designs');
  try {
    if (!fs.existsSync(designsDir)) {
      fs.mkdirSync(designsDir, { recursive: true });
    }
    const destPath = path.join(designsDir, `${changeName}.md`);
    fs.cpSync(designPath, destPath);
    appendLog(`syncDesignToMemory: copied design.md to ${destPath}`);
  } catch {
    appendLog(`syncDesignToMemory: failed to copy design.md to ${designsDir}`);
  }

  // Step 2: Call schedule API to ensure scheduler is running
  const port = process.env.FURINA_UI_PORT ?? 3939;
  const scheduleUrl = `http://localhost:${port}/furina/api/schedule`;

  try {
    const req = http.request(scheduleUrl, { method: 'PUT', timeout: 5000 }, (res) => {
      res.resume();
      appendLog(`syncDesignToMemory: schedule API responded ${res.statusCode}`);
      logger.info(`Schedule API called: ${res.statusCode}`);
    });
    req.on('timeout', () => {
      req.destroy();
      appendLog('syncDesignToMemory: schedule API call timed out');
    });
    req.on('error', () => {
      appendLog('syncDesignToMemory: schedule API call failed (backend may not be running)');
    });
    req.end();
  } catch {
    appendLog('syncDesignToMemory: schedule API request creation failed');
  }
}
```
Source: `src/server/memory/sync-design.ts`:32-80

**Usage Example**:
```typescript
import { syncDesignToMemory } from './server/memory/sync-design.js';

// 在 feature status 查询时同步 design.md 到全局内存
const changeName = 'add-user-auth';
const cwd = process.cwd(); // e.g., '/home/user/my-project'
syncDesignToMemory(changeName, cwd);
// 效果：
// 1. 如果 furina/changes/add-user-auth/design.md 存在，
//    复制到 ~/.furina/memory/Memory__home_user_my_project/designs/add-user-auth.md
// 2. 发送 PUT 请求到 http://localhost:3939/furina/api/schedule
```
Explanation: 该示例展示了最基本的调用方式。`changeName` 采用 kebab-case 格式，`cwd` 为当前工作目录。函数执行后，如果 design.md 存在，文件会被复制到全局内存目录，同时通知调度器。

---

### `flattenCwdPath(cwd: string): string` (re-export)

**Source**: `src/server/memory/sync-design.ts`:16 (re-export), `src/utils/memory.ts`:33-35 (definition)

**Functionality**: 将文件系统路径转换为安全的目录名称，使用 `Memory_` 前缀标识。该函数从 `../../utils/memory.js` 导入后重新导出，目的是保持向后兼容性——历史代码可能直接从 `sync-design` 模块导入此函数。

**Parameters**:
- `cwd` (`string`): 文件系统绝对路径，例如 `"D:\project-code\llm\furina"` 或 `"/home/user/project"`。

**Return Value**:
- `string`: 安全的目录名。转换规则：
  1. 通过 `normalizePath()` 统一路径分隔符为 `/`，合并连续分隔符，去除尾部分隔符
  2. 将 `:` 替换为 `_`（处理 Windows 盘符如 `D:`）
  3. 将 `/` 替换为 `_`
  4. 添加 `Memory_` 前缀

**Core Logic**:
```typescript
export function flattenCwdPath(cwd: string): string {
  return 'Memory_' + normalizePath(cwd).replace(/:/g, '_').replace(/\//g, '_');
}
```
Source: `src/utils/memory.ts`:33-35

**Usage Example**:
```typescript
import { flattenCwdPath } from './server/memory/sync-design.js';

// Windows 路径
flattenCwdPath('D:\\project-code\\llm\\furina');
// => 'Memory_D__project-code_llm_furina'

// Linux 路径
flattenCwdPath('/home/user/project');
// => 'Memory__home_user_project'

// 混合分隔符路径
flattenCwdPath('C:\\Users/test');
// => 'Memory_C__Users_test'
```
Explanation: 该函数是内存路径计算的核心工具。它确保不同操作系统、不同路径格式的 cwd 都能映射为唯一的、文件系统安全的目录名。`Memory_` 前缀将内存目录与其它可能的目录区分开来。

---

### `appendLog(message: string): void` (依赖)

**Source**: `src/server/memory/schedule-logger.ts`:23-29

**Functionality**: 向 `~/.furina/memory/dreamwork.log` 追加日志消息，每条消息以 ISO 8601 时间戳为前缀。在 `syncDesignToMemory` 中用于记录每一步操作的结果，包括文件复制成功/失败、API 调用结果等。该函数会自动创建日志目录（如不存在）。

**Parameters**:
- `message` (`string`): 要追加的日志消息文本。

**Return Value**:
- `void`: 无返回值。日志通过同步文件追加写入。

**Core Logic**:
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
import { appendLog } from './server/memory/schedule-logger.js';

appendLog('syncDesignToMemory: copied design.md to /path/to/dest.md');
// 日志文件 ~/.furina/memory/dreamwork.log 中追加：
// [2026-07-05T12:00:00.000Z] syncDesignToMemory: copied design.md to /path/to/dest.md
```
Explanation: `appendLog` 是同步写入的日志函数，保证日志条目不丢失。在 `syncDesignToMemory` 中，每个关键步骤和错误路径都有对应的日志记录。

## Data Structures

本模块不定义额外的数据结构或类型。函数签名直接使用原始类型 `string` 和 `void`。

**相关环境变量**:

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `FURINA_UI_PORT` | `string` | `"3939"` | UI 服务端口，用于构造 schedule API 的 URL |

**路径常量**:

| 常量 | 值 | 说明 |
|------|-----|------|
| 源目录 | `{cwd}/furina/changes/` | change 文件所在目录 |
| 目标根目录 | `~/.furina/memory/{flatCwd}/` | 全局内存目录 |
| 目标子目录 | `~/.furina/memory/{flatCwd}/designs/` | design 文件存放子目录 |
| Schedule API | `http://localhost:{port}/furina/api/schedule` | 调度器通知端点 |

## Error Handling and Edge Cases

`syncDesignToMemory` 采用了全面的静默错误处理策略，所有错误均不向外抛出：

### 1. design.md 不存在（提前返回）
- **场景**：change 尚未生成 design 文档，或已被删除。
- **处理**：通过 `appendLog()` 记录日志后 `return`，不执行文件复制，不调用 schedule API。
- **设计意图**：这是正常业务场景（design 是可选的 propose 阶段产出），不应视为错误。

### 2. 目标目录创建失败
- **场景**：文件系统权限不足、磁盘空间不足。
- **处理**：`fs.mkdirSync` 抛出异常，被外层 `catch` 捕获，记录日志后继续执行 schedule API 调用。

### 3. 文件复制失败
- **场景**：`fs.cpSync` 失败（权限问题、磁盘满等）。
- **处理**：被同一个 `try-catch` 块捕获，记录失败日志。

### 4. Schedule API 超时
- **场景**：本地服务器未启动，或响应缓慢。
- **处理**：`timeout` 事件触发 `req.destroy()`，记录超时日志。HTTP 请求设置了 5000ms 超时。

### 5. Schedule API 连接错误
- **场景**：本地服务器未运行（端口未监听）。
- **处理**：`error` 事件记录 "backend may not be running" 日志。

### 6. HTTP 请求创建失败
- **场景**：URL 格式异常等极端情况。
- **处理**：外层 `try-catch` 捕获，记录日志。

**关键原则**：该函数是"尽力而为"的同步操作，任何失败都不应阻塞上游的 feature status 查询流程。

## Dependencies

### Depends on

| 模块 | 导入内容 | 用途 |
|------|----------|------|
| `fs` (Node.js built-in) | `existsSync`, `mkdirSync`, `cpSync` | 文件系统操作：存在性检查、目录创建、文件复制 |
| `http` (Node.js built-in) | `request` | 向 schedule API 发送 HTTP PUT 请求 |
| `os` (Node.js built-in) | `homedir` | 获取用户主目录路径（构造 `~/.furina` 路径） |
| `path` (Node.js built-in) | `join` | 路径拼接 |
| `../../utils/logger.js` | `logger` | 应用级日志记录（info 级别记录 API 响应） |
| `../../utils/memory.js` | `flattenCwdPath` | 路径转换为安全目录名 |
| `./schedule-logger.js` | `appendLog` | 内存模块专用日志（写入 dreamwork.log） |

### Depended by

| 模块 | 用途 |
|------|------|
| `src/commands/change/feature.ts` | `runFeatureStatus()` 在查询 feature 状态前调用 `syncDesignToMemory()` 进行同步 |
| 其他从 `sync-design.ts` 导入 `flattenCwdPath` 的模块 | 通过 re-export 获取路径转换函数（向后兼容） |

## Usage Examples

### 基本使用：在 feature status 查询中同步 design

```typescript
import { syncDesignToMemory } from '../../server/memory/sync-design.js';

export function runFeatureStatus(changeName: string, cwd: string = process.cwd()): void {
  // 验证 change 名称后，同步 design.md 到全局内存
  syncDesignToMemory(changeName, cwd);

  // ... 继续 feature status 查询逻辑
}
```
Explanation: 这是 `syncDesignToMemory` 的主要使用场景。`runFeatureStatus` 在验证 change 名称合法性后，立即调用同步函数，确保全局内存中的 design.md 是最新的。函数调用完全异步（HTTP 请求），不会显著阻塞 feature status 的输出。

### 使用 re-export 的 flattenCwdPath

```typescript
// 历史代码可能直接从 sync-design 导入 flattenCwdPath
import { flattenCwdPath } from '../../server/memory/sync-design.js';

const flatCwd = flattenCwdPath(process.cwd());
const memoryPath = path.join(os.homedir(), '.furina', 'memory', flatCwd);
// => ~/.furina/memory/Memory_D__project-code_llm_furina
```
Explanation: `flattenCwdPath` 从 `sync-design.ts` 的 re-export 是历史兼容性设计。新代码应直接从 `../../utils/memory.js` 导入。实际项目中，`flattenCwdPath` 被广泛使用于内存路径计算，包括 `archive.ts`（归档操作）和 `server/changes/shared.ts`（变更共享逻辑）。
