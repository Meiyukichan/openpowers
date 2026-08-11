# Configuration Management (config)

> Source files:
> - `src/commands/config.ts` : 1-216
> - `src/utils/config.ts` : 1-366

## Overview

本 spec 覆盖 Furina CLI 的 `config` 命令模块，负责以结构化子命令方式管理配置系统。配置系统采用"默认配置 + 项目覆盖"的双层合并模型：底层为 `resources/furina.json`（全局默认），上层为 `{cwd}/.claude/furina.json`（项目级覆盖），通过 Zod schema 进行运行时类型校验与容错降级。

**设计动机**：开发者在不同项目、不同实验阶段需要灵活调整配置（如切换 experimental 开关、设置 provider 路由等）。`config` 命令提供四个子命令覆盖配置生命周期的全部场景——查看全量合并结果（`list`）、按路径精确查询（`show`）、批量应用预设档位（`mode`）、逐条写入具体值（`set`），实现从只读到读写的完整配置操作链路。

**使用场景**：
- 调试或排查配置问题时，使用 `config list` 查看当前合并后的完整配置
- 工作流集成时，使用 `config show <keys...>` 获取单个或多个配置值，支持特殊的 `codebases` 聚合键
- 快速切换实验性功能档位时，使用 `config mode <lite|standard|max>` 批量设置 experimental 相关开关
- 脚本或手动微调单个配置项时，使用 `config set <key> <value>` 进行精确写入，支持 `--global` 作用到全局默认配置

**涉及的源文件**：
- `src/commands/config.ts`：命令注册层，包含子命令定义、辅助函数（`deepSetInPlace`、`formatValue`、`inferValue`）、MODE_PRESETS 常量
- `src/utils/config.ts`：底层配置工具层，提供 `loadConfig`、`queryConfig`、`readUserConfig`、`writeUserConfig`、`setUserConfigValue`、`setDefaultConfigValue` 等函数

## Architecture / Flow

### 命令注册层次

```
furina config                  # 父命令 (Commander parent)
  ├── list                         # 输出完整合并配置 JSON
  ├── show <keys...>               # 按 dot-path 查询，支持 codebases 特殊聚合
  ├── mode <mode>                  # 应用预设（lite/standard/max）到 experimental.* 标志
  └── set <key> <value> [-g|--global]  # 写入单个键值（类型推断），可选全局
```

### config mode 执行流程

```
1. 验证 mode 是否为 lite/standard/max 之一
2. 读取当前用户配置 (readUserConfig(cwd))
3. 从 MODE_PRESETS[mode] 中取出 4 个目标字段的预设值
4. 对每个字段调用 deepSetInPlace，原子式原地修改数据对象
   （不影响其他已有键值）
5. 写回用户配置文件 (writeUserConfig(cwd, data))
6. 输出确认信息到 stdout
```

### config set 执行流程

```
1. 对原始字符串参数调用 inferValue 进行类型推断
2. 根据 --global 标志选择写入目标：
   - 有 --global：调用 setDefaultConfigValue(key, value) 写入 resources/furina.json
   - 无 --global：调用 setUserConfigValue(cwd, key, value) 写入 .claude/furina.json
3. 输出已存储的 key=value 对到 stdout（全局时附带 "(global)" 标记）
```

## Functionality / Interface Details

### `MODE_PRESETS`

**Source**: `src/commands/config.ts`:34-53

**功能描述**：内置模式预设常量，是 `config mode` 子命令的数据源。定义了三个档位（lite / standard / max），每个档位是一个 `DeepPartial<FurinaConfig>` 对象，精确覆盖四个目标字段。MODE_PRESETS 作为导出常量，也允许外部模块（如 `src/commands/agents.ts`）在初始化会话设置时读取当前模式配置。

**预设字段与档位对照表**：

| 字段 | lite | standard | max |
|------|------|----------|-----|
| `experimental.explore` | `false` | `true` | `true` |
| `experimental.review.furina` | `false` | `false` | `true` |
| `experimental.review.specs` | `false` | `false` | `true` |
| `experimental.review.code` | `false` | `true` | `true` |

**类型签名**：
```typescript
export const MODE_PRESETS: Record<'lite' | 'standard' | 'max', DeepPartial<FurinaConfig>>
```

**核心代码**：
```typescript
export const MODE_PRESETS: Record<'lite' | 'standard' | 'max', DeepPartial<FurinaConfig>> = {
  lite: {
    experimental: {
      explore: false,
      review: { furina: false, specs: false, code: false },
    },
  },
  standard: {
    experimental: {
      explore: true,
      review: { furina: false, specs: false, code: true },
    },
  },
  max: {
    experimental: {
      explore: true,
      review: { furina: true, specs: true, code: true },
    },
  },
};
```
Source: `src/commands/config.ts`:34-53

**使用示例**：
```typescript
import { MODE_PRESETS } from './commands/config.js';

// 获取 max 模式下 experimental.explore 的预设值
const exploreEnabled = MODE_PRESETS.max.experimental?.explore; // true
```
说明：直接读取预设对象，不触发任何磁盘操作。外部模块可在初始化时使用此常量校验当前模式。

---

### `deepSetInPlace(target, keyPath, value) -> void`

**Source**: `src/commands/config.ts`:76-88

**功能描述**：在目标对象上按 dot-path 原地设置嵌套值。当路径中的中间节点不存在或是非对象类型时，自动创建空对象覆盖。此函数专门服务于 `config mode` 的批量写入场景——对同一个数据对象执行多次 `deepSetInPlace` 调用，避免了每写一个键就触发一次完整的 read/modify/write 磁盘 I/O 循环。

**参数**：
- `target` (`Record<string, unknown>`): 被修改的根对象，原地修改
- `keyPath` (`string`): 以 `.` 分隔的键路径，例如 `'experimental.review.furina'`
- `value` (`unknown`): 写入叶子节点的值

**返回值**：`void`（原地修改 target）

**核心逻辑**：
1. 将 `keyPath` 按 `.` 拆分为路径片段数组
2. 从第一个片段开始逐级遍历，直到倒数第二个片段（中间路径）
3. 对每个中间路径：若 `node[key]` 不是普通对象（null、数组、基本类型），则用 `{}` 覆盖，确保路径可达
4. 在最后一个片段上赋值 `value`

**核心代码**：
```typescript
function deepSetInPlace(target: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split('.');
  let node: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = node[key];
    if (!isPlainObject(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}
```
Source: `src/commands/config.ts`:76-88

**使用示例**：
```typescript
const data: Record<string, unknown> = { language: 'chinese' };
deepSetInPlace(data, 'experimental.review.furina', true);
// data 现在为: { language: 'chinese', experimental: { review: { furina: true } } }
```
说明：创建了 `experimental` 和 `review` 中间对象，且不影响已有的 `language` 键。

---

### `formatValue(value) -> string`

**Source**: `src/commands/config.ts`:94-102

**功能描述**：将配置值格式化为可读字符串，用于 `config show` 子命令的输出。遵循以下规则：`undefined` 和 `null` 输出为 `"None"`；普通对象和数组输出为 JSON 序列化字符串；其他类型通过 `String()` 转换。

**参数**：
- `value` (`unknown`): 待格式化的配置值

**返回值**：`string` — 格式化后的字符串

**核心逻辑**：
1. `undefined` 或 `null` → `"None"`
2. 普通对象或数组 → `JSON.stringify(value)`
3. 其他 → `String(value)`

**核心代码**：
```typescript
function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return 'None';
  }
  if (isPlainObject(value) || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}
```
Source: `src/commands/config.ts`:94-102

**使用示例**：
```typescript
formatValue(undefined);          // "None"
formatValue(null);               // "None"
formatValue({ path: '/test' });  // '{"path":"/test"}'
formatValue(true);               // "true"
formatValue('chinese');          // "chinese"
```

---

### `inferValue(raw) -> unknown`

**Source**: `src/commands/config.ts`:115-122

**功能描述**：将命令行传入的原始字符串参数推断为相应的 JavaScript 原生类型。这是 `config set` 子命令的关键逻辑，确保 `false` 被存储为 JSON boolean 而非字符串 `"false"`，`42` 被存储为 JSON number 而非字符串 `"42"`。输入会先经过 `trim()` 处理。

**类型推断规则**：
| 输入模式 | 推断结果 | 示例 |
|----------|----------|------|
| `"true"` | `true` (boolean) | `"true"` -> `true` |
| `"false"` | `false` (boolean) | `"false"` -> `false` |
| 整数模式 `/^-?(0\|[1-9]\d*)$/` | `Number(trimmed)` | `"-42"` -> `-42` |
| 浮点模式 `/^-?\d+\.\d+$/` | `Number(trimmed)` | `"3.14"` -> `3.14` |
| 其他所有字符串 | 原样字符串 | `"01"` -> `"01"`，`"2026-06-01"` -> `"2026-06-01"` |

**参数**：
- `raw` (`string`): CLI 传入的原始字符串值

**返回值**：`unknown` — 推断后的 JavaScript 值

**核心代码**：
```typescript
function inferValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}
```
Source: `src/commands/config.ts`:115-122

**使用示例**：
```typescript
inferValue('true');        // true
inferValue('false');       // false
inferValue('42');          // 42 (number)
inferValue('-7');          // -7 (number)
inferValue('3.14');        // 3.14 (number)
inferValue('chinese');     // "chinese" (string)
inferValue('01');          // "01" (string, 前导零不转数字)
inferValue('v1.2.3-rc');   // "v1.2.3-rc" (string)
```

---

### `isPlainObject(value) -> boolean`

**Source**: `src/commands/config.ts`:62-64

**功能描述**：判断一个值是否为普通对象（非 null、非数组、是 object 类型）。此类型守卫在 `deepSetInPlace`、`formatValue` 中均被使用。

**参数**：
- `value` (`unknown`): 待判断的值

**返回值**：`value is Record<string, unknown>` — 当且仅当 `typeof value === 'object' && value !== null && !Array.isArray(value)` 时返回 `true`

---

### `registerConfigCommand(program) -> void`

**Source**: `src/commands/config.ts`:133-216

**功能描述**：在 Commander 程序实例上注册 `config` 父命令及其四个子命令（`list`、`show`、`mode`、`set`）。这是模块的唯一公开 API，由 `src/cli/index.ts` 的 `registerConfigCommand(program)` 调用。

**参数**：
- `program` (`Command`): Commander 根程序实例

**返回值**：`void`

#### 子命令 `config list`

**功能**：加载完整合并配置（默认 + 覆盖），输出为格式化的 JSON（2 空格缩进 + 尾部换行）。

**核心代码**：
```typescript
configCmd
  .command('list')
  .description('List full merged configuration as formatted JSON')
  .action(() => {
    const config = loadConfig();
    process.stdout.write(JSON.stringify(config, null, 2) + '\n');
  });
```
Source: `src/commands/config.ts`:138-144

**输出格式**：完整的 JSON 对象，2 空格缩进，末尾换行符。

---

#### 子命令 `config show <keys...>`

**功能**：按 dot-path 键路径查询配置值，支持多个键同时查询。对于特殊键名 `'codebases'`，执行聚合逻辑——从 `project.codebase.path` 和 `exploration.codebase` 两个来源组装结果列表。

**参数**：
- `keys` (`string[]`): 一个或多个 dot-path 配置键，如 `language`、`experimental.explore`、`codebases`

**输出格式**：每行一个 `key=value` 对，通过 `formatValue` 格式化。不存在的键输出 `key=None`。

**特殊键 `'codebases'` 的聚合逻辑**：
1. 读取 `project.codebase.path`，若存在则作为第一个元素推入结果数组，附加固定描述
2. 读取 `exploration.codebase`（预期为数组），若存在则展开追加到结果数组
3. 最终输出序列化的 JSON 数组

**核心代码**：
```typescript
if (key === 'codebases') {
  const projectPath = queryConfig(config, 'project.codebase.path');
  const explorationCodebase = queryConfig(config, 'exploration.codebase');
  const assembled: unknown[] = [];
  if (projectPath !== undefined) {
    assembled.push({
      path: projectPath,
      description: 'codebase dir of current project, you MUST explore it when using optix-explore skill',
    });
  }
  if (Array.isArray(explorationCodebase)) {
    assembled.push(...explorationCodebase);
  }
  value = assembled;
} else {
  value = queryConfig(config, key);
}
```
Source: `src/commands/config.ts`:153-171

**使用示例**：
```bash
# 查询单个键
furina config show language
# 输出: language=chinese

# 查询多个键
furina config show experimental.explore experimental.review.code
# 输出:
# experimental.explore=true
# experimental.review.code=true

# 使用特殊 codebases 键
furina config show codebases
# 输出: codebases=[{"path":"docs/codebase","description":"codebase dir of current project..."}]

# 查询不存在的键
furina config show nonexistent.key
# 输出: nonexistent.key=None
```

---

#### 子命令 `config mode <mode>`

**功能**：将预设模式（lite / standard / max）应用到 `experimental.*` 相关标志。采用原子式原地修改策略——先读取当前用户配置，在内存中对四个目标字段执行 `deepSetInPlace`，然后一次性写回磁盘，保证无关键值不被覆盖。

**参数**：
- `mode` (`string`): 必须为 `'lite'`、`'standard'` 或 `'max'` 之一

**错误处理**：
- 若 mode 无效，调用 `configCmd.error()` 输出错误信息（列出有效值），Commander 自动抛出 `CommanderError`，不会写入任何文件

**输出格式**：确认信息，包含应用的 mode 名称和每个字段的最终值，以及目标文件路径。

**核心代码**：
```typescript
const cwd = process.cwd();
const preset = MODE_PRESETS[mode];
const review = preset.experimental?.review;
const data = readUserConfig(cwd);
deepSetInPlace(data, 'experimental.explore', preset.experimental?.explore);
deepSetInPlace(data, 'experimental.review.furina', review?.furina);
deepSetInPlace(data, 'experimental.review.specs', review?.specs);
deepSetInPlace(data, 'experimental.review.code', review?.code);
writeUserConfig(cwd, data);
process.stdout.write(
  `Applied mode=${mode} (experimental.explore=${preset.experimental?.explore}, `
    + `experimental.review.furina=${review?.furina}, `
    + `experimental.review.specs=${review?.specs}, `
    + `experimental.review.code=${review?.code}) to `
    + `${path.join(cwd, '.claude', 'furina.json')}\n`,
);
```
Source: `src/commands/config.ts`:183-198

**使用示例**：
```bash
# 切换到 lite 模式（关闭所有实验性功能）
furina config mode lite
# 输出: Applied mode=lite (experimental.explore=false, experimental.review.furina=false, ...) to /path/.claude/furina.json

# 无效模式值会被拒绝
furina config mode ultra
# 错误: invalid mode 'ultra'. Valid values: lite, standard, max
```

---

#### 子命令 `config set <key> <value> [--global|-g]`

**功能**：将单个键值写入配置文件，值会通过 `inferValue` 自动推断类型。默认写入项目级用户配置（`.claude/furina.json`）；使用 `--global` 时写入全局默认配置（`resources/furina.json`）。

**参数**：
- `key` (`string`): dot-path 配置键，例如 `experimental.explore`、`language`
- `value` (`string`): 原始字符串值，自动推断为 boolean / number / string
- `options.global` (`boolean`, optional): 是否写入全局配置，默认 `false`

**核心逻辑**：
1. 调用 `inferValue(value)` 将字符串推断为对应 JS 类型
2. 根据 `options.global` 分支：
   - `true` → 调用 `setDefaultConfigValue(key, inferred)`，写入 `resources/furina.json`
   - `false` → 调用 `setUserConfigValue(cwd, key, inferred)`，写入 `{cwd}/.claude/furina.json`
3. 输出 `key=value` 到 stdout，全局时附带 `(global)` 标记

**核心代码**：
```typescript
const inferred = inferValue(value);
if (options.global) {
  setDefaultConfigValue(key, inferred);
  process.stdout.write(`${key}=${formatValue(inferred)} (global)\n`);
} else {
  const cwd = process.cwd();
  setUserConfigValue(cwd, key, inferred);
  process.stdout.write(`${key}=${formatValue(inferred)}\n`);
}
```
Source: `src/commands/config.ts`:206-214

**使用示例**：
```bash
# 设置布尔值
furina config set experimental.explore false
# 输出: experimental.explore=false
# JSON 中存储为: {"experimental": {"explore": false}}（boolean，非字符串）

# 设置数字
furina config set experimental.budget 0
# 输出: experimental.budget=0
# JSON 中存储为: {"experimental": {"budget": 0}}（number）

# 设置字符串
furina config set language chinese
# 输出: language=chinese

# 创建中间对象路径
furina config set experimental.review.furina true
# 输出: experimental.review.furina=true

# 设置浮点数
furina config set experimental.factor 3.14
# 输出: experimental.factor=3.14

# 设置全局配置
furina config set -g enhancement.memory.schedule "0 3 * * *"
# 输出: enhancement.memory.schedule=0 3 * * * (global)
```

## Data Structures

### `DeepPartial<T>`

```typescript
export type DeepPartial<T> = T extends ReadonlyArray<unknown>
  ? T
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
```
- `T`: 原始类型
- 递归地将所有属性标记为可选（包括嵌套对象），但数组保持原始类型不变（不进入数组元素做 partial）
- 用于 `MODE_PRESETS` 的类型声明，允许预设只覆盖部分字段

### `FurinaConfig`

由 `src/utils/config.ts` 的 Zod schema 推断而来，关键顶层字段包括：

```typescript
{
  language: string;
  switchProviders: {
    workflow: string; explore: string; propose: string;
    plan: string; review: string; coding: string; finalize: string;
  };
  project: {
    sourcecode: string;
    codebase: { enable: boolean; path: string };
  };
  exploration: {
    codebase: Array<{ path: string; type?: string; description?: string }>;
    repository: Array<{ path: string; type?: string; description?: string }>;
    reference: Array<{ path: string; type?: string; description?: string }>;
    specification: Array<{ path: string; type?: string; description?: string }>;
  };
  experimental: {
    explore: boolean; websearch: boolean; context7: boolean;
    review: {
      propose: boolean; plan: boolean; specs: boolean;
      code: boolean; acceptance: boolean; furina: boolean;
    };
    prompt: { reviewCode: string | null };
    coverage: string; budget: boolean; factor: number;
  };
  enhancement?: {
    context: unknown | null;
    rules: { design: unknown[]; specs: unknown[]; implement: unknown[] };
    memory?: { schedule: string };
  };
}
```

### 文件路径约定

| 路径 | 说明 |
|------|------|
| `resources/furina.json` | 全局默认配置，打包在 CLI 安装目录中 |
| `{cwd}/.claude/furina.json` | 项目级覆盖配置，位于工作目录下 |

## Error Handling and Edge Cases

### config mode 错误处理
- **无效 mode 值**：调用 `configCmd.error()` 抛出 `CommanderError`，错误信息列出有效值 `lite, standard, max`，不会写入任何文件
- **目录不存在**：`writeUserConfig` 内部调用 `fs.mkdirSync(dir, { recursive: true })`，自动创建 `.claude` 父目录

### config set 类型推断边界情况
- **前导零数字**：`"01"` 被存储为字符串 `"01"`（正则 `/^-?(?:0|[1-9]\d*)$/` 不匹配前导零）
- **日期格式**：`"2026-06-01"` 被存储为字符串（不匹配整数或浮点正则）
- **空白填充**：`"  true  "` 通过 `trim()` 处理后正确推断为 `true`
- **版本号**：`"v1.2.3-rc"` 被存储为字符串

### config show 边界情况
- **不存在的键**：输出 `key=None`（`queryConfig` 返回 `undefined`，`formatValue` 转为 `"None"`）
- **对象值**：输出 JSON 序列化字符串（通过 `formatValue` 的 `isPlainObject` 分支）
- **null/undefined 值**：输出 `None`

### 全局配置写入（--global）
- `setDefaultConfigValue` 直接修改 `resources/furina.json`，通过 `import.meta.url` 计算模块目录定位文件路径
- 若配置文件不存在或无法解析，会抛出异常（不同于 `readUserConfig` 的静默容错）

## Dependencies

### Depends on
- **`src/utils/config.ts`**：提供 `loadConfig`（完整配置加载与合并）、`queryConfig`（dot-path 查询）、`readUserConfig` / `writeUserConfig`（用户配置读写）、`setUserConfigValue` / `setDefaultConfigValue`（键值写入）、`FurinaConfig` / `DeepPartial` 类型
- **`commander`**：Commander.js 框架，提供 `Command` 类用于子命令注册和参数解析
- **`path`**（Node.js 内置）：用于拼接配置文件路径

### Depended by
- **`src/cli/index.ts`**：调用 `registerConfigCommand(program)` 注册 config 命令到根 Commander 实例
- **`marketplace/skills/furina-explore/`** 等工作流 skill：通过 `config show` 获取项目配置（如 codebase 路径、language 等）
- **`marketplace/skills/furina-finalize/instructions/syncbase.md`**：使用 `config show codebases` 获取聚合的 codebase 列表用于同步

## Usage Examples

### 完整使用场景

```bash
# 1. 查看当前完整合并配置（用于调试）
furina config list
# 输出: { "language": "chinese", "switchProviders": { ... }, ... }

# 2. 查询特定配置值
furina config show language experimental.explore experimental.review.code
# 输出:
# language=chinese
# experimental.explore=true
# experimental.review.code=true

# 3. 查询聚合的 codebase 列表
furina config show codebases
# 输出: codebases=[{"path":"docs/codebase","description":"codebase dir of current project..."}]

# 4. 快速切换到轻量模式（关闭所有实验性功能）
furina config mode lite
# 输出: Applied mode=lite (...) to /path/.claude/furina.json

# 5. 逐条调整配置
furina config set experimental.explore true
furina config set experimental.factor 2

# 6. 修改全局默认配置（影响所有项目）
furina config set -g enhancement.memory.schedule "0 9 * * 1-5"
```

### 程序化调用模式

```typescript
import { registerConfigCommand, MODE_PRESETS } from './commands/config.js';
import { Command } from 'commander';

// 注册到自定义 Commander 实例
const program = new Command();
registerConfigCommand(program);

// 读取当前预设值（不触发磁盘操作）
const currentPreset = MODE_PRESETS.standard;
console.log(currentPreset.experimental?.explore); // true

// 手动使用底层工具函数
import { loadConfig, queryConfig, setUserConfigValue } from '../utils/config.js';

// 加载合并配置并查询
const config = loadConfig('/my/workspace');
const lang = queryConfig(config, 'language'); // "chinese"

// 程序化写入配置值
setUserConfigValue('/my/workspace', 'experimental.explore', true);
```
