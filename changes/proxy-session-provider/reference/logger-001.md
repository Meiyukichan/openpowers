# Feature: logger-001

**Description**: 修改 `src/server/anthropic/logger.ts`:
- 将 `PROXY_LOG_DIR` 路径从 `~/.openpowers/logs/proxy/` 改为 `~/.openpowers/logs/`
- 新增 `createSessionLogger(sessionId)` 函数，创建写入 `~/.openpowers/sessions/<id>/anthropic.log` 的 logger
- 维护全局 `Map<string, {logger, expiresAt}>` 实现 1 小时缓存，检索时惰性清理过期条目

---

## 1. 文件结构

```
src/server/anthropic/
  logger.ts         -- PROXY_LOG_DIR 常量, createProxyLogger, proxyLogger 导出
  logger.test.ts    -- 测试文件 (同目录, logger.test.ts)
```

---

## 2. 当前 logger.ts 实现分析

**文件**: `D:\project-code\llm\openpowers\src\server\anthropic\logger.ts`

### 2.1 常量定义

```typescript
import os from 'os';
import path from 'path';
import fs from 'fs';
import * as winston from 'winston';

const PROXY_LOG_DIR = path.join(os.homedir(), '.openpowers', 'logs', 'proxy');
const PROXY_LOG_FILE = path.join(PROXY_LOG_DIR, 'anthropic.log');
```

- 使用 Node.js 内置模块的 **默认导入** (符合 CLAUDE.md 规范): `import os from 'os'`, `import path from 'path'`, `import fs from 'fs'`
- 第三方库 winston 使用 **命名空间导入**: `import * as winston from 'winston'`
- `PROXY_LOG_DIR` 当前为 `~/.openpowers/logs/proxy/`

### 2.2 目录创建

```typescript
function ensureProxyLogDir(): void {
  if (!fs.existsSync(PROXY_LOG_DIR)) {
    fs.mkdirSync(PROXY_LOG_DIR, { recursive: true });
  }
}
```

- 私有函数, 同步检查 + 创建目录
- `{ recursive: true }` 确保父目录也被创建

### 2.3 winston Logger 创建 (createProxyLogger)

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
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss,SSS' }),
            winston.format.printf((info) => {
              const level = String(info.level).padStart(7).slice(0, 7);
              return `${info.timestamp} ${level} ${info.message}`;
            }),
          ),
        }),
      ],
    });
  } catch {
    return winston.createLogger({ silent: true });
  }
}

export const proxyLogger = createProxyLogger();
```

**关键模式**:
- `exitOnError: false` -- 防止 winston 错误崩溃进程
- `level: 'info'` -- 日志级别
- **format**: `winston.format.combine( timestamp('YYYY-MM-DD HH:mm:ss,SSS'), printf(...) )`
  - 时间戳格式: `'YYYY-MM-DD HH:mm:ss,SSS'`
  - printf 输出格式: `${timestamp} ${level.padStart(7).slice(0, 7)} ${message}`
- **transports**: File + Console
  - File 写入 `PROXY_LOG_FILE`
  - Console 输出到 stdout (重复了相同的 format, 没有复用)
- **降级**: 任何异常则返回 `winston.createLogger({ silent: true })` -- 静默无操作 logger
- **单例导出**: `export const proxyLogger = createProxyLogger()` 在模块加载时执行

### 2.4 和主 Logger 的一致性

**文件**: `D:\project-code\llm\openpowers\src\utils\logger.ts`

主 logger 使用相同的 winston 创建模式:
- 相同 `exitOnError: false`, `level: 'info'`
- 完全相同的 timestamp/printf format
- 但是主 logger 只有 File transport (没有 Console)

---

## 3. 测试分析 (logger.test.ts)

**文件**: `D:\project-code\llm\openpowers\src\server\anthropic\logger.test.ts`

### 3.1 Mock 策略

#### 3.1.1 winston mock (vi.hoisted + vi.mock)

```typescript
const { mockWinstonLogger, createLoggerMock } = vi.hoisted(() => ({
  mockWinstonLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createLoggerMock: vi.fn(),
}));

vi.mock('winston', () => ({
  createLogger: createLoggerMock,
  format: {
    combine: vi.fn((...args: unknown[]) => args),
    timestamp: vi.fn(() => 'mocked-timestamp'),
    printf: vi.fn(() => 'mocked-printf'),
  },
  transports: {
    File: vi.fn(),
    Console: vi.fn(),
  },
}));
```

- `createLoggerMock.mockReturnValue(mockWinstonLogger)` 在模块加载前执行 (第 51 行)
- **关键**: mock 的 `createLogger` 返回一个具有所有日志方法 (info/warn/error/debug) 的对象
- `vi.hoisted()` 确保 mock 变量在 `vi.mock()` 之前被提升定义

#### 3.1.2 fs mock

```typescript
const { existsSyncMock, mkdirSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
  },
}));
```

- ES 模块下 fs 使用 `default` 对象 (因为 `import fs from 'fs'` 是默认导入)
- mock 默认行为: `existsSyncMock` 返回 `true` (目录已存在)

#### 3.1.3 os mock

```typescript
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/mock/home'),
  },
}));
```

- 固定 home 目录为 `/mock/home`

### 3.2 路径常量 (测试中复现)

```typescript
const PROXY_LOG_DIR = path.join('/mock/home', '.openpowers', 'logs', 'proxy');
const PROXY_LOG_FILE = path.join(PROXY_LOG_DIR, 'anthropic.log');
```

- 测试中手动计算路径以验证 mkdirSync 参数

### 3.3 beforeEach / afterEach 模式

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  createLoggerMock.mockReturnValue(mockWinstonLogger);
  // Default: log dir exists
  existsSyncMock.mockImplementation((p: string) => p === PROXY_LOG_DIR);
});

afterEach(() => {
  vi.resetModules();  // 关键：清除模块缓存, 使下次 import 重新执行模块代码
});
```

- `clearAllMocks()` 在 `beforeEach` 中清除所有 mock 调用记录
- `resetModules()` 在 `afterEach` 中清除模块缓存, 确保每个测试重新执行 `createProxyLogger()`
- `existsSyncMock.mockImplementation(...)` 设置默认行为: 只有 mock home 下的日志目录存在

### 3.4 测试用例分类

#### Chunk 1: 命名导出 + 日志方法

| 测试 | 验证点 |
|------|--------|
| 导出 proxyLogger | `import('./logger.js')` 后 `proxyLogger` 有定义 |
| info 方法 | `typeof proxyLogger.info === 'function'` |
| warn 方法 | 同 info |
| error 方法 | 同 info |
| debug 方法 | 同 info |

#### Chunk 2: Logger 写入 proxy/anthropic.log

| 测试 | 验证点 |
|------|--------|
| File transport | `createLoggerMock` 被调用 1 次, transports 有定义且长度 >= 1 |
| timestamp + printf format | `callArgs.format` 有定义 |
| exitOnError | `callArgs.exitOnError === false` |

#### Chunk 3: 自动创建目录

| 测试 | Mock 设置 | 验证点 |
|------|-----------|--------|
| 目录不存在时创建 | `existsSyncMock` 返回 false | `mkdirSyncMock` 被调用, 参数为 `PROXY_LOG_DIR` + `{ recursive: true }` |
| 目录已存在时不创建 | `existsSyncMock` 匹配 `PROXY_LOG_DIR` | `mkdirSyncMock` 未被调用 |

#### Chunk 4: 优雅降级

| 测试 | Mock 设置 | 验证点 |
|------|-----------|--------|
| 目录不可写不抛异常 | `existsSyncMock` 返回 false, `mkdirSyncMock` 抛出 EACCES | `import('./logger.js')` resolve 成功 (不抛) |
| 返回静默 logger | 同上 | `createLoggerMock` 被调用, `callArgs.silent === true` |

---

## 4. proxyLogger 使用方

### 4.1 handler.ts

**文件**: `D:\project-code\llm\openpowers\src\server\anthropic\handler.ts`

```typescript
import { proxyLogger } from './logger.js';
```

使用场景:
- 第 241 行: 上游流错误: `proxyLogger.error(`Upstream stream error: ${err.message}`)`
- 第 298 行: 非 200 响应: `proxyLogger.warn(...)`
- 第 317 行: 非 200 数据: `proxyLogger.warn(...)`
- 第 339 行: 上游错误响应: `proxyLogger.warn(...)`
- 第 363 行: 连接拒绝: `proxyLogger.error(...)`
- 第 366 行: 超时: `proxyLogger.error(...)`
- 第 369 行: 请求错误: `proxyLogger.error(...)`

### 4.2 router.ts

**文件**: `D:\project-code\llm\openpowers\src\server\anthropic\router.ts`

```typescript
import { proxyLogger } from './logger.js';
```

使用场景:
- 第 37 行: 请求日志: `proxyLogger.info(entry)` -- uvicorn 风格日志
- 第 55 行: 错误处理: `proxyLogger.error(`${err.message}`)`

### 4.3 handler.test.ts

- 第 20-29 行: 定义 `proxyLoggerMock` (包含 info/warn/error/debug)
- 第 48 行: mock logger 模块: `proxyLogger: proxyLoggerMock`
- 第 586, 845 行: 验证 `proxyLoggerMock.error` 被调用

---

## 5. Session 目录模式参考

**文件**: `D:\project-code\llm\openpowers\src\utils\session.ts`

现有 session 目录结构: `~/.openpowers/sessions/<id>/settings.json`

```typescript
const SESSIONS_DIR = path.join(os.homedir(), '.openpowers', 'sessions');

export function getSessionFilePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, 'settings.json');
}
```

目录创建模式:
```typescript
const dir = path.dirname(filePath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
```

**注意**: 新功能 createSessionLogger 将使用相同的目录结构, 但文件名为 `anthropic.log` 而不是 `settings.json`。

---

## 6. 变更要点总结

| 项目 | 当前值 | 目标值 |
|------|--------|--------|
| PROXY_LOG_DIR | `~/.openpowers/logs/proxy/` | `~/.openpowers/logs/` |
| PROXY_LOG_FILE | `<PROXY_LOG_DIR>/anthropic.log` | `<PROXY_LOG_DIR>/anthropic.log` |
| createProxyLogger | 写入 `logs/proxy/anthropic.log` | 写入 `logs/anthropic.log` |
| -- | -- | 新增 `createSessionLogger(sessionId)` |
| -- | -- | 写入 `~/.openpowers/sessions/<id>/anthropic.log` |
| -- | -- | 全局 Map 缓存, 1 小时过期, 惰性清理 |

### 5.1 实现注意事项

1. `createSessionLogger(sessionId)` 需要:
   - 复用 winston logger 创建 format (和 createProxyLogger 相同的 timestamp + printf)
   - 使用 `~/.openpowers/sessions/<id>/anthropic.log` 作为文件路径
   - **只需要 File transport (不需要 Console transport)** -- 和主 logger 一致
   - 目录不存在时自动创建 (recursive: true)
   - 错误时返回 silent logger

2. **缓存 Map** 需要:
   - 类型: `Map<string, { logger: winston.Logger, expiresAt: number }>`
   - 缓存时间: 1 小时 (60 * 60 * 1000 ms)
   - `getSessionLogger(sessionId)` 函数:
     - 检查 Map 中是否有未过期的条目
     - 如果有, 直接返回缓存的 logger
     - 如果没有, 创建新的 logger, 存入 Map, 设置 expiresAt
   - **惰性清理**: 在检索时遍历 Map, 删除所有过期的条目
   - 考虑: Map 可能无限增长, 是否需要最大条目限制?
