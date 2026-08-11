# Deep Merge Utility

> Source files:
> - `src/utils/config.ts` : 121-150

## Overview

本 spec 覆盖 `src/utils/config.ts` 中的深合并工具函数 `deepMerge` 及其类型守卫 `isPlainObject`，二者构成配置系统"默认 + 覆盖"双层合并模型的核心引擎。

**设计动机**：Furina 的配置采用双层 JSON 文件架构——全局默认配置（`resources/furina.json`）提供基础值，项目级覆盖配置（`{cwd}/.claude/furina.json`）允许开发者按项目定制。合并时需要按语义递归：嵌套对象逐字段叠加（而非整体替换），数组追加（而非覆盖），但类型不匹配的叶子节点直接替换。`deepMerge` 正是实现这一语义的唯一合并函数。

**使用场景**：
- `loadConfig` 内部首次合并默认配置到空对象：`deepMerge(config, JSON.parse(defaultRaw))`
- `loadConfig` 内部第二次合并项目覆盖配置：`deepMerge(config, JSON.parse(overrideRaw))`
- 任何需要"递归叠加两个配置对象"的场景均可复用此函数

**涉及的源文件**：
- `src/utils/config.ts`：提供 `isPlainObject` 类型守卫和 `deepMerge` 合并函数，二者均为模块内部函数（`isPlainObject` 未导出，`deepMerge` 导出但主要服务于 `loadConfig`）

## Architecture / Flow

### 合并算法决策流程

```
对于 override 中的每个 key:
  ├── key 在 base 中存在，且 base[key] 和 override[key] 都是 plain object
  │     └── 递归调用 deepMerge(base[key], override[key])（原地修改 base 子树）
  │
  ├── key 在 base 中存在，且 base[key] 和 override[key] 都是 Array
  │     └── base[key].push(...override[key])（数组追加，非替换）
  │
  └── 其他情况（key 不在 base 中，或类型不匹配，或值是基本类型）
        └── base[key] = override[key]（直接替换/新增）
```

### 关键设计决策

1. **原地变异（mutate in place）**：`deepMerge` 直接修改并返回 `base` 对象，不创建新对象。这避免了大规模配置对象的深拷贝开销，调用方在 `loadConfig` 中以空对象 `{}` 为起点逐步构建最终配置。
2. **`isPlainObject` 作为类型分派器**：合并算法的核心判断依赖 `isPlainObject` 区分三种情况——plain object（递归合并）、Array（追加）、其他（替换）。`null` 不是 plain object，因此遇到 `null` 值会走替换分支。
3. **"key in base" 前置条件**：递归合并和数组追加仅在 `key` 已存在于 `base` 时触发。若 `base` 中不存在该 `key`，即使 `override` 值是 plain object 或数组，也直接赋值（无需合并目标）。这确保了首次加载时从空对象到完整配置的正确构建。

## Functionality / Interface Details

### `isPlainObject(value: unknown) -> value is Record<string, unknown>`

**Source**: `src/utils/config.ts`:121-123

**功能描述**：类型守卫函数，判断一个值是否为"普通对象"——即 JavaScript 中通过 `{}` 字面量或 `new Object()` 创建的对象，排除 `null`、数组和其他特殊对象类型。此函数是 `deepMerge` 合并算法的核心分派依据：只有当某个 key 在 base 和 override 中的值都是 plain object 时，才会触发递归合并；否则走数组追加或直接替换路径。

**参数**：
- `value` (`unknown`): 待判断的值，可以是任意类型

**返回值**：
- `value is Record<string, unknown>`: TypeScript 类型谓词。当 `typeof value === 'object' && value !== null && !Array.isArray(value)` 时返回 `true`，此时编译器将 `value` 的类型收窄为 `Record<string, unknown>`

**核心逻辑**：
三层短路判断，依次排除非 object 类型、null、数组，全部通过后才认定为 plain object。此实现不检查原型链（不区分 `Object.create(null)` 与普通对象），在配置合并的场景下足够可靠。

**核心代码**：
```typescript
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```
Source: `src/utils/config.ts`:121-123

**使用示例**：
```typescript
isPlainObject({ a: 1 });           // true
isPlainObject([1, 2]);             // false (数组)
isPlainObject(null);               // false
isPlainObject('string');           // false
isPlainObject(new Date());         // true (注意：Date 也会返回 true，因为未检查原型链)
isPlainObject(Object.create(null));// true (纯净对象，原型为 null)
```
说明：此函数的设计目标是服务于配置合并中的类型分派，而非通用的原型链检查。在配置 JSON 反序列化的场景中，所有对象都满足 plain object 的条件，因此无需更严格的检查。

---

### `deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>) -> T`

**Source**: `src/utils/config.ts`:133-150

**功能描述**：递归地将 `override` 对象的字段合并到 `base` 对象中。这是 Furina 配置系统"默认 + 覆盖"双层模型的核心合并引擎。合并遵循三条语义规则：（1）嵌套 plain object 递归合并（逐字段叠加，不整体替换）；（2）数组追加（override 中的数组元素拼接到 base 数组末尾）；（3）类型不匹配或基本类型直接替换。函数原地修改 `base` 并返回它，避免深拷贝开销。

**类型参数**：
- `T extends Record<string, unknown>`: base 对象的具体类型，函数返回值保持 `T` 类型，确保调用方不需要类型断言

**参数**：
- `base` (`T`): 基础配置对象，**原地修改**。在 `loadConfig` 中首次调用时传入空对象 `{}`
- `override` (`Record<string, unknown>`): 覆盖配置对象，只读。其字段会根据类型规则合并到 `base` 中

**返回值**：
- `T`: 返回被修改后的 `base` 对象本身（与传入的是同一引用）

**核心逻辑**：

1. **遍历 override 的所有 key**：使用 `Object.keys(override)` 获取待合并的键列表，逐个处理。
2. **分派合并策略**（三条分支）：
   - **递归合并**：当 `key in base` 且 `baseVal` 和 `overrideVal` 都是 `isPlainObject` 时，递归调用 `deepMerge(baseVal, overrideVal)`，原地修改 base 的子树。这确保嵌套对象（如 `experimental.review`）中的字段逐个叠加而非整体替换。
   - **数组追加**：当 `key in base` 且 `baseVal` 和 `overrideVal` 都是 `Array` 时，使用 `push(...overrideVal)` 将 override 数组的元素追加到 base 数组末尾。这允许项目覆盖配置在默认数组的基础上追加元素（如 `exploration.codebase` 列表）。
   - **直接替换**：其他所有情况（key 不在 base 中、类型不匹配、值为基本类型等），直接将 `base[key]` 设为 `overrideVal`。这包括新增 key、null 替换 object、string 替换 number 等所有边缘情况。
3. **返回 base**：返回被原地修改的 base 对象引用。

**核心代码**：
```typescript
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    const baseVal = base[key];

    if (key in base && isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      deepMerge(baseVal, overrideVal);
    } else if (key in base && Array.isArray(baseVal) && Array.isArray(overrideVal)) {
      (baseVal as unknown[]).push(...(overrideVal as unknown[]));
    } else {
      (base as Record<string, unknown>)[key] = overrideVal;
    }
  }
  return base;
}
```
Source: `src/utils/config.ts`:133-150

**使用示例**：
```typescript
// 1. 嵌套对象递归合并
const base = { experimental: { explore: true, budget: false } };
const override = { experimental: { budget: true, factor: 2 } };
deepMerge(base, override);
// base => { experimental: { explore: true, budget: true, factor: 2 } }
// 说明：experimental 是 plain object，递归合并；explore 保留，budget 覆盖，factor 新增

// 2. 数组追加
const base2 = { exploration: { codebase: [{ path: 'docs' }] } };
const override2 = { exploration: { codebase: [{ path: 'src' }] } };
deepMerge(base2, override2);
// base2 => { exploration: { codebase: [{ path: 'docs' }, { path: 'src' }] } }
// 说明：codebase 是数组，override 元素追加到末尾

// 3. 类型不匹配直接替换
const base3 = { experimental: { explore: true } };
const override3 = { experimental: 'invalid' };
deepMerge(base3, override3);
// base3 => { experimental: 'invalid' }
// 说明：experimental 在 base 中是 object，override 中是 string，类型不匹配，直接替换

// 4. 新增 key 直接赋值
const base4 = { language: 'chinese' };
const override4 = { newField: { nested: true } };
deepMerge(base4, override4);
// base4 => { language: 'chinese', newField: { nested: true } }
// 说明：newField 不在 base 中，直接赋值（即使 override 值是 plain object）
```

## Data Structures

### 类型谓词 `isPlainObject`

```typescript
function isPlainObject(value: unknown): value is Record<string, unknown>
```
- TypeScript 类型谓词（type predicate），当返回 `true` 时编译器将参数类型收窄为 `Record<string, unknown>`
- 判定条件：`typeof value === 'object' && value !== null && !Array.isArray(value)`

### 泛型约束 `T extends Record<string, unknown>`

- `deepMerge` 的类型参数 `T` 约束 base 必须是字符串索引的记录类型
- 返回值类型为 `T`，确保调用方拿到的类型与传入 base 的具体类型一致
- 在 `loadConfig` 中，`T` 被推断为 `Record<string, unknown>`（空对象字面量），最终经过 Zod 校验后被断言为 `FurinaConfig`

## Error Handling and Edge Cases

### deepMerge 不会抛出异常

`deepMerge` 本身不包含 try/catch 或显式错误处理，其安全性依赖于以下设计：
- `isPlainObject` 对 `null`、`undefined`、基本类型安全返回 `false`，不会导致递归进入非对象值
- `Array.isArray` 对非数组值安全返回 `false`，不会误触 `push` 操作
- `key in base` 前置检查确保只在 base 中已存在对应 key 时才进行递归或追加，避免对 `undefined` 调用属性访问

### 边界情况

| 场景 | 行为 | 说明 |
|------|------|------|
| `base` 为空对象 `{}` | override 的所有键直接赋值到 base | 首次合并默认配置的正常路径 |
| override 中有 `null` 值 | 替换 base 中对应字段（`null` 不是 plain object） | `null` 走替换分支 |
| base 中字段是数组，override 中对应字段是对象 | 直接替换（类型不匹配） | override 的对象覆盖 base 的数组 |
| base 中字段是对象，override 中对应字段是数组 | 直接替换（类型不匹配） | override 的数组覆盖 base 的对象 |
| 嵌套超过 3 层 | 递归正确处理，深度无限制 | 配置文件通常不超过 4-5 层嵌套 |
| override 中有 `undefined` 值 | `undefined` 值被赋值到 base（JSON 解析不会产生 `undefined`，但函数调用可以） | 在配置系统中 JSON.parse 不会产出 `undefined`，实际无影响 |
| base 和 override 指向同一对象 | 递归合并时可能导致无限递归 | 调用方应确保 base 和 override 是不同对象（`loadConfig` 中始终满足） |

### 在 loadConfig 中的位置

`deepMerge` 在 `loadConfig` 中被调用两次：
1. `deepMerge(config, JSON.parse(defaultRaw))` — 将默认配置合并到空对象
2. `deepMerge(config, JSON.parse(overrideRaw))` — 将项目覆盖配置合并到已含默认值的 config

`JSON.parse` 保证了传入 `deepMerge` 的值始终是合法的 JSON 对象（plain object / array / 基本类型），不存在循环引用或特殊对象类型的风险。

## Dependencies

### Depends on
- **无外部依赖**：`isPlainObject` 和 `deepMerge` 仅使用 JavaScript 内置的 `typeof`、`Array.isArray`、`Object.keys` 操作，不依赖任何第三方库或项目内部模块

### Depended by
- **`loadConfig`**（同文件 `src/utils/config.ts`:171-212）：配置加载的核心函数，通过两次 `deepMerge` 调用构建完整的合并配置
- **`src/utils/config.test.ts`**：测试文件，直接导入并测试 `deepMerge` 的各种合并语义

## Usage Examples

### 典型配置合并场景

```typescript
import { deepMerge } from './utils/config.js';

// 场景：从 JSON 文件读取默认配置和项目覆盖配置，合并为最终配置
const defaultConfig = {
  language: 'english',
  experimental: {
    explore: false,
    review: { code: false, specs: false },
    factor: 1,
  },
  exploration: {
    codebase: [{ path: 'docs/codebase' }],
  },
};

const projectOverride = {
  language: 'chinese',
  experimental: {
    explore: true,
    review: { furina: true },
  },
  exploration: {
    codebase: [{ path: 'my-custom-docs' }],
  },
};

// 合并到空对象（模拟 loadConfig 的行为）
const config: Record<string, unknown> = {};
deepMerge(config, defaultConfig);
deepMerge(config, projectOverride);

// 最终结果:
// {
//   language: 'chinese',                    // 覆盖：基本类型直接替换
//   experimental: {
//     explore: true,                        // 覆盖：boolean 替换 boolean
//     review: { code: false, specs: false, furina: true }, // 递归合并：furina 新增，其余保留
//     factor: 1,                            // 保留：未在 override 中出现
//   },
//   exploration: {
//     codebase: [                           // 追加：数组元素拼接到末尾
//       { path: 'docs/codebase' },
//       { path: 'my-custom-docs' },
//     ],
//   },
// }
```

### 在 loadConfig 中的使用模式

```typescript
// src/utils/config.ts 中 loadConfig 的核心逻辑（简化版）
export function loadConfig(cwd?: string): FurinaConfig {
  const config: Record<string, unknown> = {};

  // 第一次合并：默认配置 -> 空对象
  const defaultRaw = fs.readFileSync(defaultConfigPath, 'utf-8');
  deepMerge(config, JSON.parse(defaultRaw));

  // 第二次合并：项目覆盖 -> 已含默认值的 config
  if (fs.existsSync(overrideConfigPath)) {
    const overrideRaw = fs.readFileSync(overrideConfigPath, 'utf-8');
    deepMerge(config, JSON.parse(overrideRaw));
  }

  // Zod 校验后返回
  const parsed = FurinaConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : (config as FurinaConfig);
}
```
说明：两次 `deepMerge` 调用构建了"默认 -> 覆盖"的分层合并。`deepMerge` 以空对象为起点，先注入完整的默认配置，再叠加项目覆盖。由于是原地变异，无需额外的变量或赋值操作。
