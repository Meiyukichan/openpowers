# Config Dot-Path Query

> Source files:
> - `src/utils/config.ts` : 238-258

## Overview

`queryConfig` 是配置系统中用于按点分隔路径查询嵌套配置值的核心工具函数。它提供了一种简洁、安全的方式从多层嵌套的配置对象中提取任意深度的值，是 `config show <keys...>` 命令的底层实现基础。

设计动机：配置对象（`FurinaConfig`）通常具有多层嵌套结构（如 `experimental.review.furina`、`project.codebase.path`），直接逐级访问需要编写冗长且易出错的可选链代码。`queryConfig` 将点分隔路径字符串统一转化为安全的逐级遍历，遇到任何不可遍历的中间节点时立即返回 `undefined`，避免抛出异常。

使用场景：
- `furina config show <keys...>` 命令中，用户通过 CLI 传入点分隔键路径查询配置值
- 需要安全读取可能存在也可能缺失的深层配置字段时
- 与 `loadConfig` 配合，查询经过 Zod 验证后的合并配置（验证失败的叶子字段已被 `deleteByPath` 删除，`queryConfig` 对这些字段返回 `undefined`）

## Architecture / Flow

`queryConfig` 的调用链路非常直接：

```
CLI (config show <keys...>)
  -> loadConfig()           // 加载并验证合并配置
  -> queryConfig(config, key) // 按点分隔路径查询
  -> formatValue(value)      // 格式化输出（undefined 显示为 None）
```

内部执行流程：

```
输入: config 对象, keyPath = "experimental.review.furina"

1. 按 "." 分割 keyPath -> ["experimental", "review", "furina"]
2. 初始化 node = config
3. 遍历每个 part:
   - 若 node 为 null/undefined -> 返回 undefined
   - 若 node 非对象（含数组）-> 返回 undefined
   - 否则 node = node[part]
4. 返回最终 node 值
```

## Functionality / Interface Details

### `queryConfig(config: Record<string, unknown>, keyPath: string) -> unknown`

**Source**: `src/utils/config.ts`:245-258

**Functionality**: 通过点分隔的键路径从配置对象中查询嵌套值。函数将路径字符串按 `.` 分割为多个段，从配置根对象开始逐级向下遍历。在每一级遍历中，它检查当前节点是否可继续遍历（非 null/undefined、是对象且非数组）。若任一中间段不可遍历或不存在对应键，则立即返回 `undefined`，不会抛出异常。这种设计确保了对任意路径的安全查询，即使配置对象缺少某些层级也不会导致运行时错误。

**Parameters**:
- `config` (`Record<string, unknown>`): 要查询的配置对象，通常是 `loadConfig()` 返回的合并后配置。要求根层为普通对象。
- `keyPath` (`string`): 点分隔的键路径，例如 `'project.sourcecode'`、`'experimental.review.furina'`。每一段对应配置对象的一层嵌套键名。

**Return Value**:
- `unknown`: 路径对应的值。可以是任意类型（字符串、数字、布尔值、对象、数组等），取决于配置树中该叶子节点的实际类型。
- `undefined`: 当路径中任一段不存在、或遇到不可遍历的节点（null、undefined、非对象值、数组）时返回。对于经过 Zod 验证且被 `deleteByPath` 清除的无效字段，同样返回 `undefined`。

**Core Logic**:

函数采用简单的迭代遍历策略，不使用递归：

1. 使用 `keyPath.split('.')` 将路径字符串分割为字符串数组。
2. 维护一个 `node` 变量，初始化为 `config` 根对象。
3. 对数组中每个段执行以下检查：
   - 若 `node` 为 `null` 或 `undefined`，返回 `undefined`（短路退出）
   - 若 `node` 不是对象类型或为数组，返回 `undefined`（无法继续向下遍历）
   - 否则，将 `node` 更新为 `(node as Record<string, unknown>)[part]`
4. 遍历完成后返回最终的 `node` 值。

关键设计决策：
- **非对象终止**：当遍历过程中遇到数组时，不再尝试索引访问，直接返回 `undefined`。这意味着路径中的段始终被解释为对象键名，而非数组索引。
- **无异常抛出**：函数始终返回值（包括 `undefined`），不抛出任何异常，调用方可放心使用。
- **不修改输入**：函数是纯读取操作，不修改传入的 `config` 对象。

**Core Code**:
```typescript
export function queryConfig(config: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split('.');
  let node: unknown = config;
  for (const part of parts) {
    if (node === null || node === undefined) {
      return undefined;
    }
    if (typeof node !== 'object' || Array.isArray(node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}
```
Source: `src/utils/config.ts`:245-258

**Usage Example**:
```typescript
import { loadConfig, queryConfig } from './utils/config.js';

const config = loadConfig();

// 查询简单的一级路径
const language = queryConfig(config, 'language');
// 返回: "zh-CN"（字符串）

// 查询多层嵌套路径
const sourcecode = queryConfig(config, 'project.sourcecode');
// 返回: "./src"（字符串）

// 查询不存在的路径
const missing = queryConfig(config, 'nonexistent.key');
// 返回: undefined

// 查询经过 Zod 验证删除的无效字段
const invalid = queryConfig(config, 'experimental.coverage');
// 若该字段在 Zod 验证中失败被 deleteByPath 删除，返回 undefined

// 查询对象类型的值
const switchProviders = queryConfig(config, 'switchProviders');
// 返回: { workflow: "openai", explore: "claude", ... }（整个对象）
```
Explanation: 上例展示了 `queryConfig` 的典型调用方式。首先通过 `loadConfig()` 获取合并后的配置对象，然后通过点分隔路径查询不同深度的值。函数安全地处理不存在的路径，返回 `undefined` 而非抛出异常。

---

## Data Structures

本 spec 不定义独立的数据结构。它操作的核心数据结构为 `FurinaConfig`（由 `spec-config-schemas` 定义），查询时将其视为 `Record<string, unknown>` 泛型对象进行遍历。

## Error Handling and Edge Cases

`queryConfig` 的设计哲学是 **永远不抛出异常**：

- **路径段不存在**：当中间或末尾路径段在对象中不存在时，`node[part]` 返回 `undefined`，下一轮循环检测到 `node === undefined` 后返回 `undefined`。
- **中间节点为 null**：与 `undefined` 同等处理，立即返回 `undefined`。
- **中间节点为数组**：`Array.isArray(node)` 检查为 `true` 时返回 `undefined`，不尝试索引访问。
- **中间节点为原始类型**（字符串、数字、布尔值）：`typeof node !== 'object'` 检查为 `true` 时返回 `undefined`。
- **空路径字符串**：`''.split('.')` 返回 `['']`，会尝试访问 `config['']`，通常返回 `undefined`（除非配置对象有空字符串键）。
- **路径包含连续点号**：如 `'a..b'` 分割为 `['a', '', 'b']`，空段会尝试访问空字符串键，通常返回 `undefined`。
- **Zod 验证删除的字段**：`loadConfig` 在验证失败时通过 `deleteByPath` 删除无效叶子节点，后续 `queryConfig` 查询这些路径时自然返回 `undefined`，实现优雅降级。

## Dependencies

- **Depends on**: 无外部依赖。`queryConfig` 是一个纯函数，仅依赖 JavaScript 内置类型操作，不引用任何其他模块。
- **Depended by**:
  - `src/commands/config.ts` — `config show <keys...>` 命令使用 `queryConfig` 从合并配置中按用户指定路径提取值
  - `src/commands/config.ts` — `config show codebases` 特殊路径中使用 `queryConfig` 分别查询 `project.codebase.path` 和 `exploration.codebase`
  - `src/utils/config.ts` 内部注释引用 — `loadConfig` 和 `deleteByPath` 的文档说明其设计目标之一是确保 `queryConfig` 对无效字段返回 `undefined`

## Usage Examples

### 场景一：在 CLI 命令中查询单个配置值

```typescript
import { loadConfig, queryConfig } from '../../utils/config.js';

// furina config show experimental.explore
const config = loadConfig();
const value = queryConfig(config, 'experimental.explore');
// value 可能为 true（布尔值），也可能为 undefined（若验证失败）

if (value !== undefined) {
  console.log(`experimental.explore = ${value}`);
} else {
  console.log('experimental.explore = None');
}
```

Explanation: 这是 `queryConfig` 最典型的使用场景。先通过 `loadConfig()` 加载并验证合并配置，再用点分隔路径查询特定字段。返回值需显式检查 `undefined`，因为路径可能不存在或被验证删除。

### 场景二：查询复合对象字段

```typescript
import { loadConfig, queryConfig } from '../../utils/config.js';

const config = loadConfig();

// 查询整个子对象
const codebase = queryConfig(config, 'project.codebase') as {
  enable: boolean;
  path: string;
} | undefined;

if (codebase && codebase.enable) {
  console.log(`Codebase enabled at: ${codebase.path}`);
}
```

Explanation: 当查询到的值是对象时，可以进行类型断言后访问其属性。注意 `queryConfig` 返回 `unknown`，需要调用方自行做类型收窄。

### 场景三：批量查询多个配置键

```typescript
import { loadConfig, queryConfig } from '../../utils/config.js';

const config = loadConfig();
const keys = ['language', 'project.sourcecode', 'experimental.explore', 'nonexistent'];

for (const key of keys) {
  const value = queryConfig(config, key);
  console.log(`${key}=${value === undefined ? 'None' : JSON.stringify(value)}`);
}
// 输出:
// language="zh-CN"
// project.sourcecode="./src"
// experimental.explore=true
// nonexistent=None
```

Explanation: 模拟 `config show <keys...>` 命令的实际工作方式——遍历用户传入的每个键路径，逐一查询并格式化输出。`undefined` 值统一显示为 `None`。
