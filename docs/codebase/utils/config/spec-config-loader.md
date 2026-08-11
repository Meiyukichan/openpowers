# Config Loading and Validation

> Source files:
> - `src/utils/config.ts` : 171-236

## Overview

`spec-config-loader` 负责配置的**加载、合并与验证**流程，是 Furina 配置子系统的入口环节。它将全局默认配置（`resources/furina.json`）与项目级覆盖配置（`{cwd}/.claude/furina.json`）合并为一份完整的运行时配置对象，再经 Zod schema 校验后返回给上层调用者。

**在系统中的定位**：`loadConfig` 是所有需要读取配置的命令（如 `config list`、`config show`、`agents` 子命令）的统一入口。它确保各命令获得一份经过合并、类型校验、且格式一致的 `FurinaConfig` 对象。

**设计动机**：
- **分层配置**：用户可以在项目目录下创建 `.claude/furina.json` 覆盖全局默认值，无需修改共享资源文件，实现项目级定制化。
- **弹性验证**：即使用户覆盖文件中存在无效字段，系统也不会崩溃。无效叶子节点被静默删除，`queryConfig` 对该路径返回 `undefined`，由上层渲染为 `None`。
- **无缓存策略**：每次调用都重新读取磁盘，保证配置始终反映文件的最新状态，避免编辑配置后需要重启进程的问题。

**使用场景**：
- CLI 命令 `furina config list` 和 `furina config show <keys...>` — 展示合并后的配置
- CLI 命令 `furina agents add` 和 `furina agents init` — 读取 `switchProviders` 写入会话设置
- 任何需要访问运行时配置的模块

**涉及源文件及职责**：
| 文件 | 职责 |
|------|------|
| `src/utils/config.ts` (行 171-212) | `loadConfig` — 配置加载、合并与验证主函数 |
| `src/utils/config.ts` (行 222-236) | `deleteByPath` — 内部辅助函数，按路径删除无效叶子节点 |
| `resources/furina.json` | 全局默认配置文件（只读依赖） |

## Architecture / Flow

`loadConfig` 的执行流程分为三个阶段：

```
1. 读取阶段
   resources/furina.json ──read──> config (base)
   {cwd}/.claude/furina.json ──read──> config (override, optional)
        |
        v
2. 合并阶段
   deepMerge(config, defaultParsed)
   deepMerge(config, overrideParsed)
        |
        v
3. 验证阶段
   FurinaConfigSchema.safeParse(config)
        |
        +── success ──> 返回 parsed.data
        |
        +── failure ──> 遍历 issues:
                         logger.warn(...)
                         deleteByPath(config, issue.path)
                         返回 config (已剥离无效叶子)
```

**关键设计决策**：
- 默认配置文件缺失时直接抛出异常（`fs.readFileSync` 不做容错），因为这是安装完整性问题。
- 覆盖配置文件缺失时静默跳过（`fs.existsSync` 检查），这是正常情况。
- 覆盖配置文件 JSON 格式错误时记录警告并回退到默认配置，而非崩溃。
- Zod 验证失败时不抛出异常，而是剥离无效叶子后返回部分配置，保持系统韧性。

## Functionality / Interface Details

### `loadConfig(cwd?: string) -> FurinaConfig`

**Source**: `src/utils/config.ts`:171-212

**Functionality**: 配置加载的主入口函数。从磁盘读取全局默认配置和项目级覆盖配置，通过 `deepMerge` 合并两层配置，再使用 Zod schema 对合并结果进行运行时校验。校验通过时返回 `parsed.data`；校验失败时对每个 schema 拒绝的字段记录警告日志并删除对应的叶子节点，最终返回一个"部分有效"的配置对象。此函数**不使用缓存**，每次调用都重新读取磁盘文件。

**Parameters**:
- `cwd` (`string | undefined`): 工作目录路径，用于定位项目覆盖配置文件 `{cwd}/.claude/furina.json`。可选参数，默认值为 `process.cwd()`。传入显式路径时用于 CLI 命令在指定目录下运行的场景（如 `agents add --cwd /path/to/project`）。

**Return Value**:
- `FurinaConfig`: 合并后的配置对象。类型由 Zod schema 推断而来（即 `z.infer<typeof FurinaConfigSchema>`）。当验证完全通过时返回 `parsed.data`；当验证存在失败字段时返回经过 `deleteByPath` 清理的 `config` 对象（强制类型断言为 `FurinaConfig`），其中无效叶子已被移除。
- 可能的异常：默认配置文件不存在或读取失败时抛出 I/O 异常；覆盖配置 JSON 解析失败时仅 warn 不抛出；覆盖配置读取时非 JSON 的 I/O 错误（如权限不足）会重新抛出。

**Core Logic**:

1. **路径解析**：通过 `import.meta.url` 定位模块所在目录，向上两级到达项目根目录，拼接 `resources/furina.json` 得到默认配置路径。覆盖配置路径为 `{cwd}/.claude/furina.json`。

2. **默认配置读取**：使用 `fs.readFileSync` 同步读取 `resources/furina.json`，`JSON.parse` 解析后通过 `deepMerge` 合并到空对象。此步骤**不做容错**，文件缺失直接抛出异常。

3. **覆盖配置读取**：先用 `fs.existsSync` 检查覆盖文件是否存在。存在时用 `try/catch` 包裹读取和解析过程：`SyntaxError`（JSON 格式错误）时调用 `logger.warn` 记录警告并跳过；其他 I/O 错误（如 `EACCES`）直接重新抛出。

4. **Zod 验证**：调用 `FurinaConfigSchema.safeParse(config)` 进行非抛出式验证。验证成功时直接返回 `parsed.data`。

5. **失败处理**：验证失败时遍历 `parsed.error.issues` 数组。对每个 issue：先用 `logger.warn` 输出 `{path} -- {message}` 格式的警告；再调用 `deleteByPath` 从原始 `config` 对象中删除对应的叶子节点。遍历完成后返回经过清理的 `config` 对象。

**Core Code**:
```typescript
export function loadConfig(cwd?: string): FurinaConfig {
  const moduleDirname = path.dirname(url.fileURLToPath(import.meta.url));
  const defaultConfigPath = path.join(moduleDirname, '..', '..', 'resources', 'furina.json');
  const workspace = cwd ?? process.cwd();
  const overrideConfigPath = path.join(workspace, '.claude', 'furina.json');

  const config: Record<string, unknown> = {};

  // Load default config (required)
  const defaultRaw = fs.readFileSync(defaultConfigPath, 'utf-8');
  deepMerge(config, JSON.parse(defaultRaw));

  // Load override config (optional)
  if (fs.existsSync(overrideConfigPath)) {
    try {
      const overrideRaw = fs.readFileSync(overrideConfigPath, 'utf-8');
      deepMerge(config, JSON.parse(overrideRaw));
    } catch (err) {
      if (err instanceof SyntaxError) {
        logger.warn('Failed to parse override config: invalid JSON, falling back to defaults');
      } else {
        throw err;
      }
    }
  }

  // Validate known fields with Zod (resilient — always returns config)
  const parsed = FurinaConfigSchema.safeParse(config);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      logger.warn(`Config validation: ${issue.path.join('.')} — ${issue.message}`);
      deleteByPath(config, issue.path as (string | number)[]);
    }
    return config as FurinaConfig;
  }

  return parsed.data;
}
```
Source: `src/utils/config.ts`:171-212

**Usage Example**:
```typescript
import { loadConfig } from './utils/config.js';

// 使用默认工作目录加载配置
const config = loadConfig();

// 指定项目目录加载配置（CLI 场景）
const config = loadConfig('/path/to/project');

// 结合 queryConfig 读取具体值
import { queryConfig } from './utils/config.js';
const sourcecode = queryConfig(config, 'project.sourcecode'); // "./"
const coverage = queryConfig(config, 'experimental.coverage');  // "70%"
```
Explanation: 第一个调用使用 `process.cwd()` 作为工作目录；第二个调用显式指定项目路径，适用于 `--cwd` 参数场景。后续展示了如何结合 `queryConfig` 读取具体配置值。

---

### `deleteByPath(target: Record<string, unknown>, keyPath: (string | number)[]) -> void`

**Source**: `src/utils/config.ts`:222-236

**Functionality**: 内部辅助函数，按照给定的键路径数组从嵌套对象中删除叶子节点。被 `loadConfig` 在 Zod 验证失败时调用，用于从配置对象中剥离被 schema 拒绝的字段。设计为"安全删除"：路径中任何一段不存在或不可遍历时直接静默返回（no-op），不会抛出异常。

**Parameters**:
- `target` (`Record<string, unknown>`): 要操作的配置对象，会被原地修改（mutate in place）。
- `keyPath` (`(string | number)[]`): 描述叶子节点位置的键路径数组。Zod 的 `issue.path` 本身即为 `(string | number)[]` 类型，如 `['experimental', 'review', 'code']` 表示删除 `config.experimental.review.code`。

**Return Value**:
- `void`: 无返回值，通过副作用修改 `target` 对象。

**Core Logic**:

1. **空路径保护**：如果 `keyPath` 为空数组，直接返回，不做任何操作。

2. **路径遍历**：从 `target` 根节点开始，沿 `keyPath` 逐层向下遍历。对路径中除最后一个元素外的每个 segment：
   - 通过 `isPlainObject(next)` 检查下一层节点是否为普通对象。
   - 如果不是普通对象（为 `null`、数组、原始值或 `undefined`），说明路径不可遍历，直接返回。
   - 如果是普通对象，将 `node` 指针推进到下一层。

3. **叶子删除**：遍历到倒数第二层后，使用 `delete node[keyPath[lastIndex]]` 删除目标叶子节点。

**Core Code**:
```typescript
function deleteByPath(target: Record<string, unknown>, keyPath: (string | number)[]): void {
  if (keyPath.length === 0) {
    return;
  }
  let node: Record<string, unknown> = target;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const segment = keyPath[i];
    const next = node[segment as string];
    if (!isPlainObject(next)) {
      return;
    }
    node = next;
  }
  delete node[keyPath[keyPath.length - 1] as string];
}
```
Source: `src/utils/config.ts`:222-236

**Usage Example**:
```typescript
// deleteByPath 是内部函数，不直接导出。
// 它仅在 loadConfig 内部被调用，用于处理 Zod 验证失败的情况：

const config = { experimental: { review: { code: 'invalid' } } };
deleteByPath(config, ['experimental', 'review', 'code']);
// 结果: config.experimental.review.code 已被删除
// queryConfig(config, 'experimental.review.code') 将返回 undefined

// 安全的路径不存在情况
deleteByPath(config, ['nonexistent', 'path']);
// 结果: 无任何修改，静默返回
```
Explanation: 展示了 `deleteByPath` 的典型使用场景。在 `loadConfig` 内部，当 Zod 校验发现 `experimental.review.code` 字段类型不匹配时，会以此路径调用 `deleteByPath` 将该叶子节点从配置对象中移除。路径不存在时安全返回。

---

## Data Structures

### `FurinaConfig`（由 Zod schema 推断）

```typescript
export type FurinaConfig = z.infer<typeof FurinaConfigSchema>;
```
- 由 `FurinaConfigSchema` 推断的 TypeScript 类型。
- `FurinaConfigSchema` 使用 `.loose()` 修饰，允许通过覆盖配置传入未知字段（这些字段在验证时不会被拒绝）。
- 详细 schema 定义见 `spec-config-schemas.md`。

### Zod 验证错误结构（`ZodError.issue`）

```typescript
{
  path: (string | number)[],  // 到达无效字段的路径，如 ['experimental', 'coverage']
  message: string,            // 错误描述，如 "Expected string, received number"
  code: string,               // 错误类型码，如 "invalid_type"
}
```
- `path` 被传递给 `deleteByPath` 用于定位并删除无效叶子节点。
- `message` 被拼接到日志警告中。

## Error Handling and Edge Cases

| 场景 | 处理策略 |
|------|----------|
| 默认配置文件不存在 | `fs.readFileSync` 抛出 `ENOENT` 异常，不捕获，向上传播。这是安装完整性错误，应终止执行。 |
| 默认配置 JSON 格式错误 | `JSON.parse` 抛出 `SyntaxError`，不捕获，向上传播。 |
| 覆盖配置文件不存在 | `fs.existsSync` 返回 `false`，静默跳过，使用默认配置。 |
| 覆盖配置 JSON 格式错误 | 捕获 `SyntaxError`，`logger.warn` 记录警告，回退到默认配置。 |
| 覆盖配置读取权限不足（`EACCES`） | 捕获后重新抛出（非 `SyntaxError` 分支），向上传播。 |
| 合并后已知字段验证失败 | 遍历 `ZodError.issues`，对每个 issue 记录 `logger.warn` 并调用 `deleteByPath` 删除无效叶子。 |
| 覆盖配置包含未知字段 | `FurinaConfigSchema` 使用 `.loose()`，未知字段通过验证，保留不删除。 |
| `deleteByPath` 路径中段不存在 | `isPlainObject(next)` 检查失败时静默返回，不做任何修改。 |
| `deleteByPath` 收到空路径 | `keyPath.length === 0` 时立即返回。 |
| `deleteByPath` 路径中间为数组 | `isPlainObject` 对数组返回 `false`，安全退出不修改。 |

## Dependencies

**Depends on**:
- `fs` / `path` / `url` (Node.js 标准库) — 文件系统读取与路径计算
- `zod` — `safeParse` 非抛出式验证
- `spec-config-deepmerge.md` — `deepMerge` 函数用于合并默认配置和覆盖配置；`isPlainObject` 辅助函数
- `spec-config-schemas.md` — `FurinaConfigSchema` 用于验证；`FurinaConfig` 类型用于返回值
- `spec-logger.md` — `logger.warn` 用于记录验证失败和 JSON 解析错误的警告

**Depended by**:
- `src/commands/config.ts` — `config list` 和 `config show` 命令调用 `loadConfig()` 获取合并配置
- `src/commands/agents.ts` — `agents add` 和 `agents init` 命令调用 `loadConfig(cwd)` 读取 `switchProviders`
- 任何需要读取运行时配置的命令或模块

## Usage Examples

### 完整使用场景：config list 命令

```typescript
import { loadConfig, queryConfig } from '../utils/config.js';

// 1. 加载合并后的配置（无参调用使用 process.cwd()）
const config = loadConfig();

// 2. 输出完整配置（config list 场景）
process.stdout.write(JSON.stringify(config, null, 2) + '\n');

// 3. 查询单个配置值（config show 场景）
const language = queryConfig(config, 'language');       // "chinese"
const codebase = queryConfig(config, 'project.codebase'); // { enable: false, path: "docs/codebase" }
```
Explanation: 展示了 `config list` 和 `config show` 命令的核心逻辑。`loadConfig()` 无参调用时使用当前工作目录，返回的配置对象可直接序列化输出或通过 `queryConfig` 按路径查询具体字段。

### 完整使用场景：agents 命令加载 switchProviders

```typescript
import { loadConfig } from '../utils/config.js';

// agents 命令中，传入显式 cwd 参数
const config = loadConfig(settings.cwd);

// 提取 switchProviders 用于后续 provider 解析
const rawSwitchProviders: Record<string, string> =
  (config as Record<string, unknown>).switchProviders as Record<string, string> || {};
```
Explanation: 展示了 `agents add`/`agents init` 命令如何使用带参数的 `loadConfig`。传入 `settings.cwd` 确保配置从正确的项目目录加载，包括项目级覆盖配置。

### 验证失败时的行为示例

```typescript
// 假设覆盖配置中 experimental.coverage 设为数字 70 而非字符串 "70%"
// 合并后的 config.experimental.coverage = 70
// Zod 验证失败，issue: { path: ['experimental', 'coverage'], message: 'Expected string, received number' }

const config = loadConfig('/project/dir');
// logger.warn 输出: "Config validation: experimental.coverage — Expected string, received number"
// config.experimental.coverage 已被 deleteByPath 删除

const coverage = queryConfig(config, 'experimental.coverage');
// 返回 undefined（上层渲染为 None）
```
Explanation: 展示了配置验证失败时的完整行为链。Zod 发现 `experimental.coverage` 类型不匹配后，`loadConfig` 记录警告并删除该叶子节点。后续 `queryConfig` 查询该路径时返回 `undefined`，由上层的 `formatValue` 渲染为 `None`，而不是崩溃。
