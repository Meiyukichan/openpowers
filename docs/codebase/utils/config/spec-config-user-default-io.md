# User and Default Config I/O

> Source files:
> - `src/utils/config.ts` : 260-365

## Overview

本 spec 覆盖 `src/utils/config.ts` 中负责配置文件读写的五个函数，分为两组：**用户覆盖配置**（per-project）和**全局默认配置**（global defaults）。

**系统定位**：Furina 的配置采用双层 JSON 文件架构。全局默认配置存储在 `resources/furina.json`（与源码捆绑，控制所有项目的基础行为），项目级覆盖配置存储在 `{cwd}/.claude/furina.json`（允许开发者针对特定项目覆盖默认值）。本 spec 的函数是这两层配置的直接 I/O 入口，负责文件的读取、写入和按 dot-path 更新。

**设计动机**：

1. **`readUserConfig` 的 "永不抛出" 设计**：用户覆盖文件可能不存在（用户从未设置过覆盖）、可能权限不足、可能格式损坏。采用 catch-all 策略，任何错误都返回空对象 `{}`，消除调用方的异常处理负担。
2. **`writeUserConfig` 的目录自建**：`.claude` 目录可能不存在，写入前递归创建父目录，确保调用方无需预先检查路径。
3. **`setUserConfigValue` / `setDefaultConfigValue` 的 dot-path setter**：将 "读取 -> 解析 -> 按路径修改 -> 写回" 的常见模式封装为原子操作，避免调用方手动实现路径遍历和对象变异。
4. **中间对象自动创建**：当 dot-path 中间节点不存在或不是 plain object 时，自动创建空对象，确保 `a.b.c` 三层路径不会因 `a.b` 不存在而失败。

**使用场景**：
- `furina config set <key> <value>` 命令调用 `setUserConfigValue` 设置项目级覆盖
- `furina config set <key> <value> --global` 命令调用 `setDefaultConfigValue` 修改全局默认值
- `furina config mode <name>` 命令调用 `readUserConfig` + 批量内存修改 + `writeUserConfig` 实现原子性预设模式切换
- `loadConfig` 读取默认配置和用户覆盖配置（使用独立的内部实现，非本 spec 的 `readUserConfig`）

**涉及的源文件**：
- `src/utils/config.ts`：提供所有五个函数，其中 `getUserConfigPath` 为内部辅助函数，其余四个均为导出函数

## Architecture / Flow

### 用户配置读写流程

```
setUserConfigValue(cwd, keyPath, value)
  │
  ├─ readUserConfig(cwd)
  │     ├─ getUserConfigPath(cwd)  →  "{cwd}/.claude/furina.json"
  │     ├─ fs.readFileSync(filePath, 'utf-8')
  │     ├─ JSON.parse(raw)
  │     ├─ isPlainObject(parsed) ? parsed : {}
  │     └─ catch → {}
  │
  ├─ keyPath.split('.') → parts[]
  │
  ├─ 遍历 parts[0..n-2]:
  │     └─ 如果 node[key] 不是 plain object → node[key] = {}
  │     └─ node = node[key]
  │
  ├─ node[parts[n-1]] = value
  │
  └─ writeUserConfig(cwd, data)
        ├─ getUserConfigPath(cwd)  →  "{cwd}/.claude/furina.json"
        ├─ fs.mkdirSync(dir, { recursive: true })
        └─ fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
```

### 全局默认配置写入流程

```
setDefaultConfigValue(keyPath, value)
  │
  ├─ moduleDirname = path.dirname(url.fileURLToPath(import.meta.url))
  ├─ configPath = "{project}/resources/furina.json"
  ├─ fs.readFileSync(configPath, 'utf-8')
  ├─ JSON.parse(raw)
  │
  ├─ keyPath.split('.') → parts[]
  ├─ 遍历 parts[0..n-2]（同上，自动创建中间对象）
  ├─ node[parts[n-1]] = value
  │
  └─ fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
```

### 关键设计决策

1. **读写分离**：`readUserConfig` 和 `writeUserConfig` 作为独立的基础 I/O 函数导出，允许调用方在需要批量修改（如 `mode` 命令）时使用 `readUserConfig` 加载、内存修改、再 `writeUserConfig` 写回的模式，避免每个字段修改都触发完整的文件 I/O。
2. **路径解析策略不同**：用户配置路径由 `cwd` 参数动态确定（`{cwd}/.claude/furina.json`），全局默认配置路径由 `import.meta.url` 定位到项目根目录的 `resources/furina.json`。二者使用不同的路径解析策略，反映了不同的作用域语义。
3. **`isPlainObject` 保护**：`readUserConfig` 使用 `isPlainObject` 校验解析结果，排除 JSON 文件中顶层为数组或 `null` 的异常情况。`setUserConfigValue` / `setDefaultConfigValue` 在路径遍历时使用 `isPlainObject` 检查中间节点，自动替换非对象节点为空对象。

## Functionality / Interface Details

### `getUserConfigPath(cwd: string) -> string`

**Source**: `src/utils/config.ts`:265-267

**功能描述**：内部辅助函数，将工作目录路径转换为用户覆盖配置文件的绝对路径。返回 `{cwd}/.claude/furina.json`。此函数未导出，仅供 `readUserConfig` 和 `writeUserConfig` 内部调用，统一路径计算逻辑，避免路径拼接代码重复。

**参数**：
- `cwd` (`string`): 工作目录的绝对路径，如 `/home/user/my-project`

**返回值**：
- `string`: 用户配置文件的绝对路径，如 `/home/user/my-project/.claude/furina.json`

**核心逻辑**：
直接调用 `path.join(cwd, '.claude', 'furina.json')` 进行路径拼接。`path.join` 会处理路径分隔符差异（Windows 反斜杠 vs Unix 正斜杠），确保跨平台兼容。

**核心代码**：
```typescript
function getUserConfigPath(cwd: string): string {
  return path.join(cwd, '.claude', 'furina.json');
}
```
Source: `src/utils/config.ts`:265-267

**使用示例**：
```typescript
// 此函数未导出，仅通过 readUserConfig / writeUserConfig 间接使用
// 内部调用示例：
getUserConfigPath('/home/user/my-project')
// => '/home/user/my-project/.claude/furina.json'
```

---

### `readUserConfig(cwd: string) -> Record<string, unknown>`

**Source**: `src/utils/config.ts`:277-289

**功能描述**：读取并解析用户覆盖配置文件 `{cwd}/.claude/furina.json`。采用 "永不抛出" 设计——无论文件不存在、权限被拒、JSON 格式损坏还是顶层值不是对象，均返回空对象 `{}`。调用方可放心依赖此函数始终返回一个可操作的对象，无需 try/catch 或存在性检查。这是配置系统中唯一采用防御性读取策略的函数，因为用户配置文件的状态完全不可控。

**参数**：
- `cwd` (`string`): 工作目录的绝对路径，用于定位 `{cwd}/.claude/furina.json`

**返回值**：
- `Record<string, unknown>`: 解析后的配置对象。正常情况下返回文件内容解析结果；文件不存在、读取失败、JSON 解析失败、顶层值非对象时均返回 `{}`

**核心逻辑**：

1. 通过 `getUserConfigPath(cwd)` 计算文件路径
2. 在 try 块内同步读取文件内容（`fs.readFileSync`，UTF-8 编码）
3. 使用 `JSON.parse` 解析为 `unknown`，再用 `isPlainObject` 类型守卫校验：只有当解析结果是 plain object 时才返回；否则返回 `{}`
4. catch 块捕获所有异常（`ENOENT`、`SyntaxError`、`EACCES` 等），统一返回 `{}`

关键设计：`isPlainObject` 检查覆盖了 "JSON 文件顶层值是数组 `[1,2,3]` 或 `null`" 的边缘情况，确保返回值始终是可安全遍历的普通对象。

**核心代码**：
```typescript
export function readUserConfig(cwd: string): Record<string, unknown> {
  const filePath = getUserConfigPath(cwd);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (isPlainObject(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}
```
Source: `src/utils/config.ts`:277-289

**使用示例**：
```typescript
import { readUserConfig } from './utils/config.js';

// 1. 文件存在且格式正确
const config = readUserConfig('/home/user/my-project');
// config = { experimental: { explore: true }, language: 'chinese' }

// 2. 文件不存在
const empty = readUserConfig('/nonexistent/path');
// empty = {}（不抛出异常）

// 3. 文件内容为非法 JSON
// 若 /path/.claude/furina.json 内容为 "invalid json{"
const fallback = readUserConfig('/path');
// fallback = {}（JSON.parse 失败，catch 返回空对象）
```

---

### `writeUserConfig(cwd: string, data: Record<string, unknown>) -> void`

**Source**: `src/utils/config.ts`:299-305

**功能描述**：将配置对象序列化并写入用户覆盖配置文件 `{cwd}/.claude/furina.json`。写入前自动创建父目录 `.claude`（递归创建），JSON 序列化采用 2 空格缩进并追加一个尾部换行符，确保文件格式统一。此函数是 `setUserConfigValue` 的底层写入实现，也可被调用方直接用于批量修改场景（如 `mode` 命令的一次性写入多个字段）。

**参数**：
- `cwd` (`string`): 工作目录的绝对路径
- `data` (`Record<string, unknown>`): 要写入的配置对象，必须是可 JSON 序列化的普通对象

**返回值**：
- `void`: 无返回值。写入失败时直接抛出异常（`ENOENT`、`EACCES`、磁盘空间不足等）

**核心逻辑**：

1. 通过 `getUserConfigPath(cwd)` 计算目标文件路径
2. 使用 `path.dirname` 获取父目录路径
3. `fs.mkdirSync(dir, { recursive: true })` 递归创建父目录（若 `.claude` 目录已存在则无操作）
4. `JSON.stringify(data, null, 2)` 序列化为 2 空格缩进的 JSON 字符串，并拼接尾部换行符 `\n`
5. `fs.writeFileSync(filePath, body, 'utf-8')` 同步写入文件（UTF-8 编码）

关键设计：尾部换行符 `\n` 使得文件符合 POSIX 文本文件规范，便于 `git diff` 等工具正确处理。

**核心代码**：
```typescript
export function writeUserConfig(cwd: string, data: Record<string, unknown>): void {
  const filePath = getUserConfigPath(cwd);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const body = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(filePath, body, 'utf-8');
}
```
Source: `src/utils/config.ts`:299-305

**使用示例**：
```typescript
import { writeUserConfig } from './utils/config.js';

// 写入用户配置（.claude 目录不存在时自动创建）
writeUserConfig('/home/user/my-project', {
  experimental: { explore: true, review: { code: true } },
  language: 'chinese',
});
// 创建文件：/home/user/my-project/.claude/furina.json
// 内容：
// {
//   "experimental": {
//     "explore": true,
//     "review": {
//       "code": true
//     }
//   },
//   "language": "chinese"
// }
```

---

### `setUserConfigValue(cwd: string, keyPath: string, value: unknown) -> unknown`

**Source**: `src/utils/config.ts`:318-333

**功能描述**：在用户覆盖配置文件中设置一个嵌套值，通过 dot-separated 路径定位目标位置。封装了 "读取现有配置 -> 按路径遍历/创建中间节点 -> 设置叶子值 -> 写回文件" 的完整流程，是 `furina config set <key> <value>` 命令的核心实现。路径中的中间节点若不存在或不是 plain object，会被自动替换为空对象 `{}`，确保深层路径写入不会因中间层缺失而失败。写入后文件中所有未涉及的顶层键保持不变。

**参数**：
- `cwd` (`string`): 工作目录的绝对路径，用于定位用户配置文件
- `keyPath` (`string`): dot-separated 键路径，如 `'experimental.review.furina'`。至少包含一个键（单个键无点号时直接设置顶层属性）
- `value` (`unknown`): 要设置的值，可以是任意类型（string、number、boolean、object、array、null）

**返回值**：
- `unknown`: 返回写入的 `value` 本身，便于调用方在设置后立即使用该值（无需额外读取）

**核心逻辑**：

1. 调用 `readUserConfig(cwd)` 加载现有用户配置（失败返回空对象）
2. `keyPath.split('.')` 将路径拆分为段数组 `parts`
3. 遍历 `parts[0]` 到 `parts[n-2]`（中间节点）：
   - 若当前节点 `node[key]` 不是 plain object（可能是 `undefined`、数字、字符串、数组等），强制设为 `{}`
   - 将 `node` 指针推进到 `node[key]`
4. 将最后一个段 `parts[n-1]` 对应的值设为 `value`
5. 调用 `writeUserConfig(cwd, data)` 将修改后的完整配置写回文件

关键设计：中间节点自动创建意味着 `setUserConfigValue(cwd, 'a.b.c.d', 42)` 即使在配置为空对象 `{}` 时也能正确写入 `{"a":{"b":{"c":{"d":42}}}}`。但副作用是：如果路径中间节点在默认配置中是基本类型（如 `"a": "string"`），会被强制替换为空对象，覆盖掉原有的类型。

**核心代码**：
```typescript
export function setUserConfigValue(cwd: string, keyPath: string, value: unknown): unknown {
  const data = readUserConfig(cwd);
  const parts = keyPath.split('.');
  let node: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = node[key];
    if (!isPlainObject(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
  writeUserConfig(cwd, data);
  return value;
}
```
Source: `src/utils/config.ts`:318-333

**使用示例**：
```typescript
import { setUserConfigValue } from './utils/config.js';

const cwd = '/home/user/my-project';

// 1. 设置单层键（根级别字段）
setUserConfigValue(cwd, 'language', 'chinese');
// .claude/furina.json → { "language": "chinese" }

// 2. 设置深层嵌套键（中间节点自动创建）
setUserConfigValue(cwd, 'experimental.review.furina', true);
// .claude/furina.json → { "language": "chinese", "experimental": { "review": { "furina": true } } }

// 3. 覆盖已有值
setUserConfigValue(cwd, 'experimental.review.furina', false);
// experimental.review.furina 从 true 变为 false

// 4. 返回值用法
const value = setUserConfigValue(cwd, 'experimental.explore', true);
// value === true（返回写入的值本身）
```

---

### `setDefaultConfigValue(keyPath: string, value: unknown) -> unknown`

**Source**: `src/utils/config.ts`:346-365

**功能描述**：在全局默认配置文件（`resources/furina.json`）中设置一个嵌套值。功能和逻辑与 `setUserConfigValue` 完全对称，但操作对象是项目源码中捆绑的全局默认配置文件，而非项目级覆盖配置。此函数通常只在需要调整所有项目的基础默认行为时调用，例如 `furina config set <key> <value> --global`。路径解析使用 `import.meta.url` 定位当前模块所在目录，再向上两级到项目根目录的 `resources/` 文件夹。

**参数**：
- `keyPath` (`string`): dot-separated 键路径，如 `'enhancement.memory.schedule'`。语义与 `setUserConfigValue` 的 `keyPath` 完全一致
- `value` (`unknown`): 要设置的值，任意类型

**返回值**：
- `unknown`: 返回写入的 `value` 本身

**核心逻辑**：

1. 通过 `import.meta.url` 获取当前模块文件的 URL，使用 `url.fileURLToPath` 转为文件路径，再 `path.dirname` 得到模块所在目录（即 `src/utils/`）
2. 向上两级拼接 `resources/furina.json`，得到全局默认配置的绝对路径：`{projectRoot}/resources/furina.json`
3. `fs.readFileSync` 读取并 `JSON.parse` 解析为对象
4. 与 `setUserConfigValue` 相同的 dot-path 遍历和中间节点创建逻辑
5. 设置叶子值后序列化（2 空格缩进 + 尾部换行），写回文件

关键设计差异：与 `setUserConfigValue` 不同，此函数**不使用** `readUserConfig`/`writeUserConfig`，而是直接读写 `resources/furina.json`。这是因为全局默认配置的路径由模块位置（`import.meta.url`）决定，而非 `cwd` 参数。路径解析使用 ESM 标准的 `import.meta.url`，在 Node.js 的 ESM 模块系统中可靠工作。函数没有 try/catch 保护——如果全局配置文件不存在或无法读写，直接抛出异常，因为这是一个异常的开发环境状态（源码捆绑的资源文件丢失）。

**核心代码**：
```typescript
export function setDefaultConfigValue(keyPath: string, value: unknown): unknown {
  const moduleDirname = path.dirname(url.fileURLToPath(import.meta.url));
  const configPath = path.join(moduleDirname, '..', '..', 'resources', 'furina.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const data = JSON.parse(raw) as Record<string, unknown>;
  const parts = keyPath.split('.');
  let node: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = node[key];
    if (!isPlainObject(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
  const body = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(configPath, body, 'utf-8');
  return value;
}
```
Source: `src/utils/config.ts`:346-365

**使用示例**：
```typescript
import { setDefaultConfigValue } from './utils/config.js';

// 1. 设置全局默认语言
setDefaultConfigValue('language', 'chinese');
// resources/furina.json 中 language 字段被设为 "chinese"

// 2. 设置全局默认增强规则
setDefaultConfigValue('enhancement.memory.schedule', 'daily');
// resources/furina.json 中 enhancement.memory.schedule 被设为 "daily"

// 3. 返回值用法
const val = setDefaultConfigValue('experimental.explore', true);
// val === true
```

## Data Structures

### Dot-path 键路径格式

```typescript
keyPath: string  // 例如 'experimental.review.furina'
```
- 使用英文句号 `.` 分隔层级
- 空字符串路径无效（`split('.')` 产生 `['']`，会导致在空字符串键上操作）
- 单层路径如 `'language'` 表示直接设置顶层字段
- 深层路径如 `'experimental.review.furina'` 表示三层嵌套

### 路径解析策略对比

| 函数 | 路径来源 | 解析方式 |
|------|----------|----------|
| `readUserConfig` / `writeUserConfig` | `cwd` 参数 | `path.join(cwd, '.claude', 'furina.json')` |
| `setUserConfigValue` | `cwd` 参数 | 同上（内部调用 `readUserConfig` / `writeUserConfig`） |
| `setDefaultConfigValue` | 模块位置 | `import.meta.url` -> `path.dirname` -> 向上两级 -> `resources/furina.json` |

### 文件写入格式

所有写入操作使用统一格式：
- JSON 序列化：`JSON.stringify(data, null, 2)`（2 空格缩进）
- 编码：UTF-8
- 尾部换行：序列化结果末尾追加 `\n`

## Error Handling and Edge Cases

### readUserConfig 的永不抛出策略

`readUserConfig` 是唯一采用全面防御的函数，catch 块捕获所有异常并返回 `{}`。覆盖的异常类型包括：

| 异常场景 | 原因 | 行为 |
|----------|------|------|
| 文件不存在 | 用户从未创建覆盖配置 | `fs.readFileSync` 抛出 `ENOENT`，catch 返回 `{}` |
| 权限被拒 | 文件系统权限不足 | `fs.readFileSync` 抛出 `EACCES`，catch 返回 `{}` |
| 非法 JSON | 文件内容损坏或手写错误 | `JSON.parse` 抛出 `SyntaxError`，catch 返回 `{}` |
| 顶层值为数组 | 文件内容为 `[1,2,3]` 而非对象 | `isPlainObject` 返回 false，返回 `{}` |
| 顶层值为 `null` | 文件内容为 `null` | `isPlainObject` 返回 false，返回 `{}` |

### writeUserConfig 的异常传播

与 `readUserConfig` 不同，`writeUserConfig` **没有** try/catch 保护，所有 I/O 错误会直接抛给调用方。这是一个有意的设计选择：写入失败通常是严重的系统问题（磁盘满、权限错误），调用方应当感知并处理。

### setDefaultConfigValue 的异常传播

同样没有 try/catch 保护。若 `resources/furina.json` 文件不存在（源码捆绑资源丢失），`fs.readFileSync` 会抛出 `ENOENT`。这是一个开发者环境配置错误，不应被静默忽略。

### 边界情况

| 场景 | 行为 | 说明 |
|------|------|------|
| `keyPath` 为空字符串 `''` | `split('.')` 产生 `['']`，循环体不执行，直接设置 `data['']` = value | 产生一个空字符串键，语义上无意义但不会崩溃 |
| `keyPath` 包含连续点号 `'a..b'` | `split('.')` 产生 `['a', '', 'b']`，空字符串段会创建 `data.a[''] = {}` | 中间节点键名为空字符串，功能上正常但语义异常 |
| 中间路径存在但值为数组 | `isPlainObject` 对数组返回 false，会被强制替换为 `{}` | 原有数组数据丢失，路径覆盖行为激进 |
| 中间路径存在但值为数字/字符串 | 同上，基本类型被替换为空对象 | 叶子节点的类型被覆盖 |
| `cwd` 包含空格或特殊字符 | `path.join` 正确处理，文件系统层面取决于 OS | 正常工作，无特殊处理 |
| 多次快速调用 `setUserConfigValue` | 每次调用都完整读取+写入文件，无并发保护 | 并发调用可能导致数据丢失（后写覆盖先写），当前使用场景为串行 CLI 命令，不存在此问题 |
| `JSON.stringify` 遇到循环引用 | 抛出 `TypeError: Converting circular structure to JSON` | 配置对象来自 `JSON.parse`，不含循环引用，实际不会发生 |

## Dependencies

### Depends on
- **Node.js `fs`**：`readFileSync`、`writeFileSync`、`mkdirSync`（同步文件 I/O）
- **Node.js `path`**：`join`、`dirname`（跨平台路径处理）
- **Node.js `url`**：`fileURLToPath`（ESM 模块 URL 到文件路径的转换，仅 `setDefaultConfigValue` 使用）
- **`isPlainObject`（同文件）**：类型守卫函数，用于校验 JSON 解析结果和路径中间节点（`src/utils/config.ts`:121-123）

### Depended by
- **`src/commands/config.ts`**：`config set` 命令直接调用 `setUserConfigValue` 和 `setDefaultConfigValue`；`config mode` 命令使用 `readUserConfig` + 批量内存修改 + `writeUserConfig` 的组合模式
- **测试文件**：`src/utils/config.test.ts` 和 `src/commands/config.test.ts` 覆盖这些函数的单元测试

## Usage Examples

### 场景 1：设置单个用户配置值

```typescript
import { setUserConfigValue } from './utils/config.js';

const cwd = process.cwd();

// 用户通过 CLI 执行：furina config set experimental.explore true
// 底层调用：
setUserConfigValue(cwd, 'experimental.explore', true);

// 若文件原本不存在，创建结果为：
// { "experimental": { "explore": true } }

// 若文件已有 { "language": "chinese", "experimental": { "review": { "code": true } } }，
// 结果为：
// { "language": "chinese", "experimental": { "explore": true, "review": { "code": true } } }
// 说明：只修改 experimental.explore，language 和 experimental.review.code 保持不变
```

### 场景 2：读取、批量修改、写回（mode 命令模式）

```typescript
import { readUserConfig, writeUserConfig } from './utils/config.js';

const cwd = process.cwd();

// 读取现有配置
const data = readUserConfig(cwd);

// 使用外部的 deepSetInPlace 辅助函数批量修改（避免每次修改都读写文件）
deepSetInPlace(data, 'experimental.explore', true);
deepSetInPlace(data, 'experimental.review.furina', true);
deepSetInPlace(data, 'experimental.review.specs', true);
deepSetInPlace(data, 'experimental.review.code', true);

// 一次性写回（原子性最佳，虽然文件系统层面不是真正的原子操作）
writeUserConfig(cwd, data);
```
说明：`mode` 命令采用这种模式是因为需要同时设置 4 个字段，逐一调用 `setUserConfigValue` 会导致 4 次完整的文件读写。通过 `readUserConfig` + 内存修改 + `writeUserConfig`，只需 1 次读 + 1 次写。

### 场景 3：设置全局默认配置

```typescript
import { setDefaultConfigValue } from './utils/config.js';

// 管理员执行：furina config set language chinese --global
setDefaultConfigValue('language', 'chinese');

// 修改 resources/furina.json 中的 language 字段
// 所有项目在 loadConfig 时将继承此默认值（除非被项目级覆盖）
```

### 场景 4：读取用户配置用于查询

```typescript
import { readUserConfig, loadConfig, queryConfig } from './utils/config.js';

const cwd = process.cwd();

// 方式 1：直接读取用户覆盖配置（只看用户自定义的部分，不包含默认值）
const userOnly = readUserConfig(cwd);
console.log(userOnly.experimental?.explore);  // true | undefined

// 方式 2：使用 loadConfig 获取完整的合并配置（默认 + 用户覆盖）
const merged = loadConfig(cwd);
// 经过 Zod 校验，类型安全

// 方式 3：使用 queryConfig 按 dot-path 查询
const value = queryConfig(merged, 'experimental.review.furina');
// value = true | undefined（若该字段未在配置中定义或校验失败）
```
说明：`readUserConfig` 返回的是原始的用户覆盖配置（未合并默认值），适合用于 "用户自定义了哪些字段" 的场景；`loadConfig` 返回的是合并后的完整配置，适合用于 "某个功能的实际行为是什么" 的场景。
