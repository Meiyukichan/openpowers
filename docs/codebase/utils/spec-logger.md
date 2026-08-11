# Logger

> Source files:
> - `src/utils/logger.ts` : 1-87

## Overview

Logger 是 Furina 项目的全局日志工具模块，基于 Winston 日志库实现文件日志记录功能。该模块在系统中承担统一日志输出的角色，确保所有服务端、客户端及命令行模块都能通过一致的接口记录运行日志。

**设计动机**：项目中存在大量模块（配置加载、端口管理、服务启动、代理请求、命令执行等）需要记录运行信息、警告和错误。为了统一日志格式、管理日志文件生命周期（自动按日归档），同时避免日志模块本身成为系统启动的障碍，设计了这个轻量级的日志工具。

**核心设计决策**：
- 采用模块顶层单例模式：logger 在模块加载时即创建并导出，整个应用生命周期共享同一个实例
- 启动时执行一次性日志轮转：将前一天的日志文件归档为 `furina-YYYY-MM-DD.log`，当前日志继续写入 `furina.log`
- 优雅降级：当日志目录不可写时（权限问题、磁盘满等），静默切换为 no-op logger，不阻塞应用启动

**日志格式**：`YYYY-MM-DD HH:mm:ss,SSS LEVEL MESSAGE`，其中 level 固定占 7 字符、右对齐。

**涉及源文件及职责**：
- `src/utils/logger.ts`：日志目录创建、日志轮转、Winston logger 实例创建、logger 单例导出

## Architecture / Flow

```
模块加载 (import { logger })
    |
    v
createWinstonLogger()
    |
    +---> ensureLogDir()          // 确保 ~/.furina/logs/ 目录存在
    |         |
    |         +---> fs.mkdirSync (recursive: true)
    |
    +---> rotateLogIfNeeded()     // 检查并执行日志轮转
    |         |
    |         +---> 比较 furina.log 的 mtime 与当前日期
    |         +---> 若不同日，重命名为 furina-{mtime}.log
    |
    +---> winston.createLogger()  // 创建带 File transport 的 logger
    |
    +---> (catch) 若以上任何步骤失败
              |
              +---> winston.createLogger({ silent: true })  // 静默 no-op logger
    |
    v
export const logger   // 导出单例，供全项目使用
```

## Functionality / Interface Details

### `ensureLogDir(): void`

**Source**: `src/utils/logger.ts`:21-25

**Functionality**: 确保日志目录 `~/.furina/logs/` 存在。如果目录不存在，使用 `recursive: true` 选项创建完整的目录路径（包括所有中间目录）。该函数是 logger 初始化流程的第一步，为后续的日志文件写入和轮转提供前提条件。

**参数**: 无

**Return Value**:
- `void`：成功时不返回任何值
- 可能的错误：如果目录创建失败（如权限不足），会抛出异常，由调用方 `createWinstonLogger` 的 try-catch 捕获并降级

**Core Logic**:
函数首先使用 `fs.existsSync` 检查目录是否已存在，若不存在则调用 `fs.mkdirSync` 以 `recursive: true` 方式创建完整目录链。使用 `existsSync` 而非直接 `mkdirSync` 是为了在目录已存在的常见情况下避免不必要的系统调用。

**Core Code**:
```typescript
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
```
Source: `src/utils/logger.ts`:21-25

**Usage Example**:
```typescript
// 该函数为内部函数，不直接导出。通常由 createWinstonLogger 自动调用：
import { logger } from './utils/logger.js';
// logger 模块加载时会自动确保日志目录存在
```
Explanation: `ensureLogDir` 是模块内部辅助函数，不对外暴露。它在 logger 创建过程中被自动调用，无需用户手动执行。

---

### `formatDate(d: Date): string`

**Source**: `src/utils/logger.ts`:30-35

**Functionality**: 将 `Date` 对象格式化为 `YYYY-MM-DD` 格式的字符串。该函数为日志轮转逻辑提供日期比较的基础，确保文件名中的日期格式统一。

**参数**:
- `d` (`Date`): 需要格式化的日期对象

**Return Value**:
- `string`: 格式化后的日期字符串，格式为 `YYYY-MM-DD`（月份和日期均补零至两位）

**Core Logic**:
提取年份后，对月份和日期使用 `String.padStart(2, '0')` 补零，确保始终输出两位数字（如 `01`、`09`）。月份需先 `+1`，因为 `Date.getMonth()` 返回 0-11。

**Core Code**:
```typescript
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```
Source: `src/utils/logger.ts`:30-35

**Usage Example**:
```typescript
// 该函数为内部函数，供 rotateLogIfNeeded 使用
const today = formatDate(new Date()); // => "2026-07-05"
```
Explanation: `formatDate` 是模块内部辅助函数，仅用于生成日志归档文件名中的日期部分以及进行日期比较。

---

### `rotateLogIfNeeded(): void`

**Source**: `src/utils/logger.ts`:41-55

**Functionality**: 检查当前活跃日志文件 `furina.log` 是否属于前一天的日志，如果是则将其重命名为 `furina-YYYY-MM-DD.log` 形式的归档文件。这是日志按日归档的核心逻辑，仅在 logger 初始化时执行一次。

**参数**: 无

**Return Value**:
- `void`：成功或无需轮转时不返回任何值
- 可能的错误：如果文件操作失败，异常会传播到 `createWinstonLogger` 的 try-catch 捕获

**Core Logic**:
1. 若 `furina.log` 不存在，直接返回（首次启动场景）
2. 通过 `fs.statSync` 获取文件元数据，读取 `mtime`（最后修改时间）
3. 将 `mtime` 格式化为日期字符串，与当前日期比较
4. 若两者不同（即文件是前一天或更早写的），构造归档文件名 `furina-{mtime}.log`
5. 为避免覆盖已有归档，先检查归档文件是否已存在，仅在不存在时执行 `renameSync`

**Core Code**:
```typescript
function rotateLogIfNeeded(): void {
  if (!fs.existsSync(LOG_FILE)) {
    return;
  }
  const stat = fs.statSync(LOG_FILE);
  const mtimeDate = formatDate(stat.mtime);
  const todayDate = formatDate(new Date());
  if (mtimeDate !== todayDate) {
    const archiveFile = path.join(LOG_DIR, `furina-${mtimeDate}.log`);
    if (!fs.existsSync(archiveFile)) {
      fs.renameSync(LOG_FILE, archiveFile);
    }
  }
}
```
Source: `src/utils/logger.ts`:41-55

**Usage Example**:
```typescript
// 该函数为内部函数，不直接导出。在 createWinstonLogger 中自动调用：
// 场景：今天是 2026-07-05，furina.log 最后修改日期是 2026-07-04
// => 自动重命名为 furina-2026-07-04.log
// => 新的日志继续写入新的 furina.log
```
Explanation: 日志轮转在每次应用启动时执行一次。使用 `mtime`（最后修改时间）而非文件创建时间来决定归档日期，确保即使跨午夜运行也不会误归档当天日志。

---

### `createWinstonLogger(): winston.Logger`

**Source**: `src/utils/logger.ts`:62-84

**Functionality**: 创建并返回配置好的 Winston logger 实例。这是模块的核心工厂函数，整合了目录准备、日志轮转、日志格式配置和 transport 设置。整个初始化过程被 try-catch 包裹，任何步骤失败都会降级为静默 logger。

**参数**: 无

**Return Value**:
- `winston.Logger`: 配置完成的 Winston logger 实例
- 降级场景：当日志目录创建失败、日志轮转失败、或 File transport 创建失败时，返回 `{ silent: true }` 的静默 logger，所有日志调用将被静默丢弃

**Core Logic**:
1. **目录准备**：调用 `ensureLogDir()` 确保日志目录存在
2. **日志轮转**：调用 `rotateLogIfNeeded()` 执行按日归档
3. **Winston 配置**：
   - `exitOnError: false`：日志错误不会导致进程退出
   - `level: 'info'`：默认记录 info 及以上级别（info, warn, error）
   - **格式化**：使用 `combine` 组合 timestamp 和 printf 格式化器
     - timestamp 格式：`YYYY-MM-DD HH:mm:ss,SSS`（与 Java logback 风格一致，精确到毫秒）
     - level 使用 `padStart(7)` 右对齐固定 7 字符宽度，`slice(0, 7)` 截断（防止超过 7 字符的 level 名称破坏对齐）
   - **Transport**：仅使用 `File` transport 写入 `furina.log`，不输出到控制台
4. **降级处理**：catch 块捕获所有异常，返回 `winston.createLogger({ silent: true })`

**Core Code**:
```typescript
function createWinstonLogger(): winston.Logger {
  try {
    ensureLogDir();
    rotateLogIfNeeded();
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
        new winston.transports.File({ filename: LOG_FILE }),
      ],
    });
  } catch {
    return winston.createLogger({ silent: true });
  }
}
```
Source: `src/utils/logger.ts`:62-84

**Usage Example**:
```typescript
// 该函数为内部函数，在模块顶层调用一次：
// export const logger = createWinstonLogger();
// 返回的 logger 实例是整个应用的共享单例
```
Explanation: `createWinstonLogger` 在模块首次被 import 时执行，整个应用生命周期内只执行一次。catch 块中没有记录降级信息，因为此时日志系统本身已不可用，只能静默降级。

---

### `logger` (exported singleton)

**Source**: `src/utils/logger.ts`:86

**Functionality**: 模块导出的 Winston logger 单例实例，供整个项目使用。这是模块唯一的导出，所有使用该模块的代码都通过此单例记录日志。

**类型**: `winston.Logger`

**使用方式**:
```typescript
import { logger } from './utils/logger.js';

logger.info('Server started on port 3000');
logger.warn('Config file not found, using defaults');
logger.error('Failed to connect to database');
```

## Data Structures

### 常量

```typescript
const LOG_DIR = path.join(os.homedir(), '.furina', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'furina.log');
```

- `LOG_DIR` (`string`): 日志文件存放目录，位于用户主目录下的 `.furina/logs/` 路径
- `LOG_FILE` (`string`): 当前活跃日志文件的完整路径，即 `~/.furina/logs/furina.log`

### 日志输出格式

```
2026-07-05 14:30:15,123    info Server started on port 3000
2026-07-05 14:30:15,456    warn Config validation failed for key "experimental.featureX"
2026-07-05 14:30:15,789   error Failed to initialize MCP server
```

- **timestamp**: `YYYY-MM-DD HH:mm:ss,SSS` 格式，精确到毫秒
- **level**: 固定 7 字符宽度，右对齐（`info` -> `    info`，`warn` -> `    warn`，`error` -> `   error`）
- **message**: 日志正文

### 归档文件命名规则

```
furina-2026-07-04.log
furina-2026-07-03.log
furina-2026-07-02.log
```

归档文件名格式为 `furina-{YYYY-MM-DD}.log`，日期取自该文件的 `mtime`（最后修改时间）。

## Error Handling and Edge Cases

### 目录创建失败
- **场景**：用户主目录不可写、磁盘空间不足、路径中包含非法字符
- **处理**：`ensureLogDir()` 抛出的异常被 `createWinstonLogger()` 的 try-catch 捕获，返回静默 logger
- **影响**：所有日志调用被静默丢弃，不会影响应用正常运行

### 日志文件重命名失败
- **场景**：文件被其他进程锁定（Windows 下更常见）、磁盘空间不足
- **处理**：`renameSync` 抛出的异常同样被 try-catch 捕获，降级为静默 logger
- **影响**：日志功能完全失效，但应用不受影响

### 归档文件已存在
- **场景**：同一天内多次启动应用，或手动创建了同名归档文件
- **处理**：`rotateLogIfNeeded()` 在重命名前先检查目标归档文件是否已存在，若存在则跳过重命名
- **影响**：当前活跃日志文件 `furina.log` 将保留原有内容继续追加写入

### 首次启动（无历史日志）
- **场景**：用户首次运行应用，`furina.log` 尚不存在
- **处理**：`rotateLogIfNeeded()` 中 `fs.existsSync(LOG_FILE)` 返回 false，直接返回，不执行任何操作
- **影响**：后续 Winston 创建 logger 时会自动创建新的日志文件

### 日志级别说明
- 日志级别固定为 `info`，即只记录 `info`、`warn`、`error` 三个级别的日志
- `debug` 和 `verbose` 级别的日志不会被记录到文件中

## Dependencies

- **Depends on**:
  - `winston`：日志库核心依赖，提供 logger 实例创建、格式化、File transport 等能力
  - `fs`（Node.js 内置）：文件系统操作，用于目录创建、文件存在性检查、文件元数据读取、文件重命名
  - `path`（Node.js 内置）：路径拼接
  - `os`（Node.js 内置）：获取用户主目录 `os.homedir()`

- **Depended by**：logger 是项目中最广泛使用的基础设施模块之一，被以下模块依赖：
  - **配置模块** (`src/utils/config.ts`)：配置加载和验证过程中的日志记录
  - **端口管理** (`src/utils/port-manager.ts`)：端口检测和进程管理操作的日志
  - **服务管理** (`src/server/service-manager.ts`)：服务启动、停止、状态检查的日志
  - **MCP 服务** (`src/server/mcp/index.ts`)：MCP server 生命周期日志
  - **Claude 设置** (`src/server/claude-settings.ts`)：Claude CLI 配置操作日志
  - **Provider 路由** (`src/server/routes/providers.ts`、`src/server/providers-store.ts`)：Provider 配置管理日志
  - **命令行模块** (`src/commands/ui.ts`、`src/commands/init.ts`、`src/commands/agents.ts` 等)：CLI 命令执行日志
  - **客户端组件** (`src/client/App.tsx`、`src/client/i18n/index.ts` 等)：前端组件运行日志
  - **Memory 同步** (`src/server/memory/sync-design.ts`)：Memory 数据同步日志

## Usage Examples

### 基本使用

```typescript
import { logger } from './utils/logger.js';

// 记录信息级别日志
logger.info('Application started successfully');

// 记录警告级别日志
logger.warn('Configuration file missing, using defaults');

// 记录错误级别日志
logger.error('Failed to connect to remote service: timeout');
```

Explanation: 直接 import 导出的 `logger` 单例即可使用。logger 在模块首次 import 时自动完成目录创建和日志轮转，无需任何初始化步骤。

### 在服务启动流程中使用

```typescript
import { logger } from '../utils/logger.js';

async function startServer(port: number): Promise<void> {
  try {
    logger.info(`Starting server on port ${port}`);
    // ... 启动逻辑
    logger.info(`Server listening on port ${port}`);
  } catch (err) {
    logger.error(`Server startup failed: ${err}`);
    throw err;
  }
}
```

Explanation: 典型的服务启动日志模式 —— 在关键操作前后记录 info 日志，在异常捕获中记录 error 日志。注意 `throw err` 会重新抛出异常，确保日志记录不影响错误传播。

### 输出文件示例

日志写入 `~/.furina/logs/furina.log`，内容示例：

```
2026-07-05 10:00:01,234    info Starting server on port 3000
2026-07-05 10:00:01,567    info Server listening on port 3000
2026-07-05 10:00:05,890    warn Config validation failed for key "experimental.featureX"
2026-07-05 10:00:06,123   error Failed to connect to remote service: ECONNREFUSED
```

若前一天（2026-07-04）有日志，启动时会自动归档为 `~/.furina/logs/furina-2026-07-04.log`。
