# Changes API Router & Cross-Project Aggregation

> Source files:
> - `src/server/changes/index.ts` : 1-79
> - `src/server/changes/shared.ts` : 1-124
> - `src/commands/change/shared.ts` : 148-169 (upstream dependency)
> - `src/utils/memory.ts` : 33-35, 96-122 (upstream dependency)

## Overview

Changes API 是 Furina 的 HTTP 层入口，为前端 UI 以及跨工具集成提供变更（Change）数据的读取能力。该 spec 覆盖两个核心源文件：

- **`src/server/changes/index.ts`**：Express Router 定义，负责三条 GET 路由的请求校验与响应组装，是连接 HTTP 层与底层数据读取逻辑的薄层。
- **`src/server/changes/shared.ts`**：跨项目变更聚合的核心实现，扫描全局 Memory 目录，实现并发读取、cwd 注入、多维过滤和排序的完整数据管道。

设计动机：每个项目在独立目录下维护自身的 `changes.json`，但 UI 仪表盘需要一次请求看到所有项目的变更情况。因此 `shared.ts` 实现了全局扫描能力，而 `index.ts` 同时支持单项目查询和跨项目聚合两种查询范式。

## Architecture / Flow

```
HTTP Request
│
├─ GET /furina/api/changes
│   ├─ loadOrCreateChangesJson()   ← 读本地 ./furina/changes.json
│   └─ 返回 { ok, data: { framework, version, changes[], archive[] } }
│
├─ GET /furina/api/changes/all?status=&cwd=&query=
│   ├─ getAllChanges(options)
│   │   ├─ fs.readdir(MEMORY_DIR)
│   │   ├─ 按 cwd 参数筛选目录（或全量 Memory_* 目录）
│   │   ├─ Promise.allSettled(并发读取每个目录的 changes.json)
│   │   ├─ 注入 cwd 字段到每个 ChangeEntry
│   │   ├─ status 过滤 → query 模糊搜索 → updateAt 降序排序
│   │   └─ 返回 ChangeEntryWithCwd[]
│   └─ 返回 { ok, data: ChangeEntryWithCwd[] }
│
└─ GET /furina/api/changes/:name
    ├─ loadOrCreateChangesJson()
    ├─ 先查 changes[]，再查 archive[]（?? 合并）
    └─ 返回 { ok, data } 或 404
```

## Functionality / Interface Details

### `changesRouter` (Express Router)

**Source**: `src/server/changes/index.ts`:17

**Functionality**: 使用 `express.default.Router()` 创建的路由实例，挂载三条 GET 路由，用于处理 `/furina/api/changes` 前缀下的所有请求。路由器本身不包含中间件，保持最简职责。

```typescript
export const changesRouter = express.default.Router();
```

---

### `GET /` — 读取当前项目的 changes.json

**Source**: `src/server/changes/index.ts`:27-34

**Functionality**: 返回当前工作目录下 `./furina/changes.json` 的完整内容。该文件包含 `framework`、`version`、`changes[]`（活跃变更）和 `archive[]`（已归档变更）四个顶级字段。当文件不存在时，`loadOrCreateChangesJson()` 会自动用默认结构创建。

**Parameters**: 无。

**Return Value**:
- 成功：`{ ok: true, data: { framework, version, changes, archive } }`
- 失败：`{ ok: false, error: "Failed to load changes data" }`（HTTP 500）

**Core Logic**:
1. 调用 `loadOrCreateChangesJson()` 同步读取本地 `changes.json`。
2. 成功时返回 200 + JSON；捕获任何异常则返回 500。

**Core Code**:
```typescript
changesRouter.get('/', (_req, res) => {
  try {
    const data = loadOrCreateChangesJson();
    res.status(200).json({ ok: true, data });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to load changes data' });
  }
});
```
Source: `src/server/changes/index.ts`:27-34

**Usage Example**:
```bash
curl http://localhost:3000/furina/api/changes
# => { ok: true, data: { framework: "furina", version: "0.1.0", changes: [...], archive: [...] } }
```
Explanation: UI 仪表盘在项目详情页中调用此接口，获取单个项目的完整变更历史。

---

### `GET /all` — 跨项目变更聚合查询

**Source**: `src/server/changes/index.ts`:42-56

**Functionality**: 聚合所有项目的变更数据，支持可选的多维过滤。这是仪表盘全局视图的核心接口，一次请求即可获取所有项目的变更列表，支持按状态、项目路径、关键词过滤。

**Parameters**（均为 Query String，可选）:
- `status` (`string`): 按变更状态过滤，可选值为 `"active"` / `"archived"` / `"removed"`。空字符串时忽略。
- `cwd` (`string`): 按项目 cwd 路径过滤（内部转换为 Memory_ 目录名进行精确匹配）。空字符串时忽略。
- `query` (`string`): 不区分大小写的模糊搜索，在 `name`、`description`、`cwd` 三个字段中匹配。空字符串时忽略。

**Return Value**:
- 成功：`{ ok: true, data: ChangeEntryWithCwd[] }` — 按 `updateAt` 降序排列，无 `updateAt` 的条目排在末尾。
- 失败：`{ ok: false, error: "Failed to load aggregated changes data" }`（HTTP 500）

**Core Logic**:
1. 从 `req.query` 提取 `status`、`cwd`、`query`，过滤空字符串后组装 `options` 对象。
2. 调用 `getAllChanges(options)` 获取聚合结果。
3. 返回 200 或捕获异常后返回 500。

**Core Code**:
```typescript
changesRouter.get('/all', async (req, res) => {
  try {
    const options: Record<string, string> = {};
    const { status, cwd, query } = req.query as Record<string, string | undefined>;

    if (status && status !== '') options.status = status;
    if (cwd && cwd !== '') options.cwd = cwd;
    if (query && query !== '') options.query = query;

    const data = await getAllChanges(options);
    res.status(200).json({ ok: true, data });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to load aggregated changes data' });
  }
});
```
Source: `src/server/changes/index.ts`:42-56

**Usage Example**:
```bash
# 查询所有项目的活跃变更
curl "http://localhost:3000/furina/api/changes/all?status=active"

# 按项目路径过滤
curl "http://localhost:3000/furina/api/changes/all?cwd=D:/project-code/llm/furina"

# 关键词搜索
curl "http://localhost:3000/furina/api/changes/all?query=refactor"

# 组合过滤
curl "http://localhost:3000/furina/api/changes/all?status=active&query=bugfix"
```
Explanation: 前端全局仪表盘使用第一个请求渲染所有活跃变更；带 `cwd` 参数的请求用于筛选特定项目的变更。

---

### `GET /:name` — 按名称查询单个变更详情

**Source**: `src/server/changes/index.ts`:63-79

**Functionality**: 根据变更名称（`name`）查询单个变更的详细信息。搜索范围覆盖本地 `changes.json` 的 `changes[]` 和 `archive[]` 两个数组，优先返回活跃变更（`changes`），未命中时回退到归档（`archive`）。这是 `??` 运算符实现的短路逻辑。

**Parameters**:
- `:name`（URL Path）：变更名称，需要与 ChangeEntry 的 `name` 字段精确匹配。

**Return Value**:
- 找到：`{ ok: true, data: ChangeEntry }`（HTTP 200）
- 未找到：`{ ok: false, error: "Change not found" }`（HTTP 404）
- 异常：`{ ok: false, error: "Failed to load changes data" }`（HTTP 500）

**Core Logic**:
1. 调用 `loadOrCreateChangesJson()` 读取本地数据。
2. 先在 `changes[]` 中查找，再在 `archive[]` 中查找，`??` 运算符实现优先级。
3. 找到则返回数据，未找到则返回 404。

**Core Code**:
```typescript
changesRouter.get('/:name', (req, res) => {
  try {
    const data = loadOrCreateChangesJson();
    const found =
      data.changes.find((c) => c.name === req.params.name) ??
      data.archive.find((a) => a.name === req.params.name);

    if (!found) {
      res.status(404).json({ ok: false, error: 'Change not found' });
      return;
    }

    res.status(200).json({ ok: true, data: found });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to load changes data' });
  }
});
```
Source: `src/server/changes/index.ts`:63-79

**Usage Example**:
```bash
curl http://localhost:3000/furina/api/changes/my-feature
# => { ok: true, data: { name: "my-feature", path: "furina/changes/my-feature", ... } }

curl http://localhost:3000/furina/api/changes/nonexistent
# => { ok: false, error: "Change not found" }  (404)
```
Explanation: 前端变更详情页调用此接口，通过路由参数中的名称加载单个变更的完整信息。

---

### `getAllChanges(options?) -> Promise<ChangeEntryWithCwd[]>`

**Source**: `src/server/changes/shared.ts`:52-124

**Functionality**: 跨项目变更聚合的核心函数。扫描全局 `~/.furina/memory/` 目录下所有 `Memory_*` 子目录，异步读取每个项目的 `changes.json`，将项目 cwd 注入每条变更条目，然后应用状态过滤、关键词模糊搜索，并按 `updateAt` 降序排序返回结果。

该函数解决了核心痛点：每个项目独立维护 `changes.json`，但 UI 仪表盘需要跨项目聚合视图。设计上采用 `Promise.allSettled` 并发读取，既保证性能，又能容忍个别目录读取失败。

**Parameters**:
- `options`（`GetAllChangesOptions`，可选，默认 `{}`）：
  - `status`（`string`，可选）：按 ChangeEntry 的 `status` 字段精确过滤，可选值 `"active"` / `"archived"` / `"removed"`。
  - `cwd`（`string`，可选）：按项目路径过滤。传入的路径会通过 `flattenCwdPath()` 转换为 `Memory_` 目录名，仅扫描匹配的目录（而非全量扫描后过滤），起到优化作用。
  - `query`（`string`，可选）：不区分大小写的模糊搜索，对 `name`、`description`、`cwd` 三个字段执行 `includes` 匹配。

**Return Value**:
- `ChangeEntryWithCwd[]`：聚合后的变更条目数组，每个条目额外包含 `cwd` 字段（标识所属项目路径）。按 `updateAt` 降序排列，无 `updateAt` 的条目排在数组末尾。

**Core Logic**:

1. **目录扫描阶段**：
   - 读取 `~/.furina/memory/` 目录。
   - 若指定 `cwd`，使用 `flattenCwdPath()` 转换路径后精确匹配单个目录（提前短路，避免全量扫描）。
   - 若未指定 `cwd`，收集所有以 `Memory_` 开头的子目录。
   - 目录读取失败时直接返回空数组（静默容错）。

2. **并发读取阶段**：
   - 使用 `Promise.allSettled` 并发读取每个目录下的 `changes.json`。
   - 从文件中解析 `cwd` 和 `changes[]` 字段。
   - 将 `cwd` 注入每个 ChangeEntry（扩展为 `ChangeEntryWithCwd`）。
   - 读取失败（文件缺失、JSON 解析错误）的目录被静默跳过，不影响其他目录的结果。

3. **过滤与排序阶段**：
   - 按 `status` 精确过滤（如有）。
   - 按 `query` 对 `name`、`description`、`cwd` 执行不区分大小写的 `includes` 匹配（如有）。
   - 按 `updateAt` 降序排序，无 `updateAt` 的条目排在末尾（`localeCompare` 字符串比较，时间戳格式应为 ISO 8601）。

**Core Code**:
```typescript
export async function getAllChanges(options: GetAllChangesOptions = {}): Promise<ChangeEntryWithCwd[]> {
  const allChanges: ChangeEntryWithCwd[] = [];

  let dirEntries: string[];
  try {
    const entries = await fs.readdir(MEMORY_DIR, { withFileTypes: true });
    dirEntries = [];
    if (options.cwd) {
      const targetDirName = flattenCwdPath(options.cwd);
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name === targetDirName) {
          dirEntries.push(path.join(MEMORY_DIR, entry.name));
          break;
        }
      }
    } else {
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('Memory_')) {
          dirEntries.push(path.join(MEMORY_DIR, entry.name));
        }
      }
    }
  } catch {
    return allChanges;
  }

  const results = await Promise.allSettled(
    dirEntries.map(async (dir) => {
      const changesJsonPath = path.join(dir, 'changes.json');
      const raw = await fs.readFile(changesJsonPath, 'utf-8');
      const data: { cwd?: string; changes?: ChangeEntry[] } = JSON.parse(raw);
      const cwd = data.cwd ?? '';
      const changes = Array.isArray(data.changes) ? data.changes : [];
      return changes.map((entry) => ({ ...entry, cwd }));
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allChanges.push(...result.value);
    }
  }

  let filtered = allChanges;
  if (options.status) {
    filtered = filtered.filter((c) => c.status === options.status);
  }
  if (options.query) {
    const q = options.query.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.cwd.toLowerCase().includes(q),
    );
  }

  filtered.sort((a, b) => {
    if (!a.updateAt && !b.updateAt) return 0;
    if (!a.updateAt) return 1;
    if (!b.updateAt) return -1;
    return b.updateAt.localeCompare(a.updateAt);
  });

  return filtered;
}
```
Source: `src/server/changes/shared.ts`:52-124

**Usage Example**:
```typescript
import { getAllChanges } from './shared.js';

// 获取所有项目的所有变更（全量聚合）
const all = await getAllChanges();

// 仅查询活跃变更
const active = await getAllChanges({ status: 'active' });

// 按项目路径过滤（内部只扫描一个 Memory_ 目录）
const projectChanges = await getAllChanges({ cwd: 'D:/project-code/llm/furina' });

// 关键词搜索
const searchResults = await getAllChanges({ query: 'refactor' });

// 组合过滤
const filtered = await getAllChanges({ status: 'active', query: 'bugfix' });
```
Explanation: 直接在后端逻辑中调用，无需 HTTP 层。第一个示例获取所有项目的全部变更；第三个示例利用 `cwd` 参数跳过全量目录扫描，直接定位目标目录，有性能优势。

---

### `flattenCwdPath(cwd: string) -> string`

**Source**: `src/utils/memory.ts`:33-35

**Functionality**: 将文件系统路径转换为安全的目录名。这是 Furina 记忆系统的核心命名规则：每个项目的记忆数据存储在 `~/.furina/memory/Memory_{flatPath}/` 目录下。此函数是 `getAllChanges` 在 `cwd` 过滤模式下的关键依赖。

**Parameters**:
- `cwd`（`string`）：文件系统绝对路径，如 `"D:/project-code/llm/furina"`。

**Return Value**:
- `string`：以 `Memory_` 为前缀的扁平化目录名，如 `"Memory_D__project-code_llm_furina"`。

**Core Logic**:
1. 标准化路径（统一正斜杠、合并重复分隔符）。
2. 将 `:` 替换为 `_`（兼容 Windows 盘符）。
3. 将 `/` 替换为 `_`。
4. 前缀 `Memory_`。

**Core Code**:
```typescript
export function flattenCwdPath(cwd: string): string {
  return 'Memory_' + normalizePath(cwd).replace(/:/g, '_').replace(/\//g, '_');
}
```
Source: `src/utils/memory.ts`:33-35

**Usage Example**:
```typescript
flattenCwdPath('D:/project-code/llm/furina')
// => "Memory_D__project-code_llm_furina"
```

---

### `loadOrCreateChangesJson() -> object`

**Source**: `src/commands/change/shared.ts`:148-169

**Functionality**: 同步读取当前工作目录下 `./furina/changes.json`，若文件不存在则自动创建（含默认结构）。这是 `GET /` 和 `GET /:name` 路由的数据来源。注意：此函数每次调用都会重新读取文件（无缓存），确保数据实时性。

**Parameters**: 无（使用 `process.cwd()` 定位文件）。

**Return Value**:
- `{ framework: string; version: string; changes: Record<string, unknown>[]; archive: Record<string, unknown>[] }`
- `framework` 和 `version` 始终被强制更新为当前 `package.json` 的值，确保一致性。

**Core Logic**:
1. 文件不存在时：创建父目录 → 写入默认 JSON → 返回深拷贝默认值。
2. 文件存在时：读取文件 → 填充缺失的 `changes`/`archive` 字段 → 覆写 `framework`/`version` → 返回。

**Core Code**:
```typescript
export function loadOrCreateChangesJson(): {
  framework: string; version: string;
  changes: Array<Record<string, unknown>>; archive: Array<Record<string, unknown>>;
} {
  if (!fs.existsSync(CHANGES_JSON_PATH)) {
    const jsonContent = JSON.stringify(DEFAULT_CHANGES_JSON, null, 2);
    const dir = path.dirname(CHANGES_JSON_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CHANGES_JSON_PATH, jsonContent, 'utf-8');
    return JSON.parse(JSON.stringify(DEFAULT_CHANGES_JSON));
  }
  const raw = fs.readFileSync(CHANGES_JSON_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed.changes) parsed.changes = [];
  if (!parsed.archive) parsed.archive = [];
  parsed.framework = pkg.name;
  parsed.version = pkg.version;
  return parsed;
}
```
Source: `src/commands/change/shared.ts`:148-169

---

## Data Structures

### `ChangeEntry`

```typescript
export const ChangeEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updateAt: z.string().optional(),
  status: z.enum(['active', 'archived', 'removed']),
  features: z.number(),
  todo: z.number(),
  artifacts: z.array(z.object({ id: z.string(), outputPath: z.string() })),
  stage: ChangeStageSchema.optional(),
});
export type ChangeEntry = z.infer<typeof ChangeEntrySchema>;
```
Source: `src/utils/memory.ts`:96-111

- `name`（`string`）：变更的唯一标识名称，kebab-case 格式，如 `"memory-sync"`。
- `path`（`string`）：变更目录的相对路径，如 `"furina/changes/memory-sync"`。
- `description`（`string`）：变更的简短描述，用于 UI 展示和模糊搜索。
- `createdAt`（`string`）：ISO 8601 格式的创建时间戳。
- `updateAt`（`string`，可选）：ISO 8601 格式的最后更新时间戳，排序时缺失值排在末尾。
- `status`（`"active" | "archived" | "removed"`）：变更状态，用于过滤。
- `features`（`number`）：已实现的功能特性数量。
- `todo`（`number`）：待完成的任务数量。
- `artifacts`（`Array<{ id, outputPath }>`）：生成的工件列表（proposal、design、specs 等）。
- `stage`（`ChangeStage`，可选）：工作流阶段信息。

### `ChangeEntryWithCwd`

```typescript
export type ChangeEntryWithCwd = ChangeEntry & { cwd: string };
```
Source: `src/server/changes/shared.ts`:19

- 继承 `ChangeEntry` 的所有字段。
- `cwd`（`string`）：运行时注入的项目工作目录路径，标识该变更所属的项目。从 `changes.json` 的顶级 `cwd` 字段读取，若缺失则为空字符串。

### `GetAllChangesOptions`

```typescript
export interface GetAllChangesOptions {
  status?: string;
  cwd?: string;
  query?: string;
}
```
Source: `src/server/changes/shared.ts`:22-29

- `status`（`string`，可选）：精确匹配 `ChangeEntry.status` 的过滤条件。
- `cwd`（`string`，可选）：项目路径，用于精确匹配单个 `Memory_` 目录（非模糊匹配）。
- `query`（`string`，可选）：跨字段（`name`、`description`、`cwd`）的不区分大小写模糊搜索关键词。

### `ChangesJson`（本地项目格式）

```typescript
// loadOrCreateChangesJson 返回的结构（本地 changes.json）
{
  framework: string;   // package.json 的 name，强制覆写
  version: string;     // package.json 的 version，强制覆写
  changes: ChangeEntry[];  // 活跃变更列表
  archive: ChangeEntry[];  // 已归档变更列表
}
```

### `ChangesJson`（记忆目录格式）

```typescript
// ~/.furina/memory/{flatPath}/changes.json 的结构
export const ChangesJsonSchema = z.object({
  framework: z.string(),
  version: z.string(),
  cwd: z.string(),
  changes: z.array(ChangeEntrySchema),
});
```
Source: `src/utils/memory.ts`:114-122

- 与本地格式的区别：记忆目录格式有 `cwd` 字段（标识项目路径），没有 `archive` 字段。
- `cwd` 字段在 `getAllChanges()` 读取时被提取并注入到每个 `ChangeEntryWithCwd` 条目中。

### 常量 `MEMORY_DIR`

```typescript
const MEMORY_DIR = path.join(os.homedir(), '.furina', 'memory');
```
Source: `src/server/changes/shared.ts`:36

全局记忆数据的根目录，所有项目的 `Memory_*` 子目录均位于此。

---

## Error Handling and Edge Cases

### 路由层错误处理（index.ts）

三条路由均采用 `try/catch` 包裹，捕获任何未预期的异常后返回 HTTP 500 + `{ ok: false, error }`。这是一种防御性策略，确保不会因未捕获异常导致 Express 进程崩溃。

- **GET /`** 和 **GET /:name**：`loadOrCreateChangesJson()` 会在文件缺失时自动创建，因此 500 错误主要出现在磁盘写入失败等极端情况。
- **GET /all**：异步路由，`getAllChanges` 内部已有容错，但路由层仍用 `try/catch` 兜底。
- **GET /:name 的 404 逻辑**：当 `changes[]` 和 `archive[]` 均未找到匹配时返回 404，使用 `return` 提前终止（避免 fall-through）。

### getAllChanges 内部容错（shared.ts）

- **MEMORY_DIR 读取失败**：`catch` 块静默返回空数组，不抛出异常。
- **单目录 changes.json 读取失败**：`Promise.allSettled` 确保一个目录的失败不会影响其他目录；失败的 `rejected` 结果在遍历时被静默跳过。
- **changes.json 中 `changes` 字段缺失或非数组**：通过 `Array.isArray(data.changes) ? data.changes : []` 防御。
- **`cwd` 字段缺失**：`data.cwd ?? ''` 降级为空字符串。
- **`updateAt` 字段缺失**：排序逻辑通过 `if (!a.updateAt)` 三个分支确保无时间戳的条目排在末尾，不会因 `undefined.localeCompare()` 抛出异常。
- **cwd 过滤无匹配目录**：`dirEntries` 为空数组，`Promise.allSettled([])` 立即返回空结果。

### 路由注册顺序的重要约束

`GET /all` 路由必须注册在 `GET /:name` **之前**。由于 Express 按注册顺序匹配路由，`/all` 会被 `/:name` 中的 `name = "all"` 捕获（如果 `:name` 先注册），导致语义错误。当前代码顺序正确：`/` -> `/all` -> `/:name`。

---

## Dependencies

### Depends on（本 spec 依赖）

| 依赖 | 来源 | 用途 |
|---|---|---|
| `loadOrCreateChangesJson()` | `src/commands/change/shared.ts` | `GET /` 和 `GET /:name` 路由的数据源 |
| `flattenCwdPath()` | `src/utils/memory.ts` | `getAllChanges()` 在 `cwd` 过滤时的路径转换 |
| `ChangeEntry` / `ChangeEntrySchema` | `src/utils/memory.ts` | 变更条目的类型定义与验证 |
| `ChangesJsonSchema` | `src/utils/memory.ts` | 记忆目录 changes.json 的结构定义 |
| `express` | 第三方依赖 | Router 基础设施 |
| `fs/promises` / `os` / `path` | Node.js 内置 | 文件系统操作、路径处理 |

### Depended by（依赖本 spec 的模块）

| 依赖方 | 用途 |
|---|---|
| Express 主服务器 | 将 `changesRouter` 挂载到 `/furina/api/changes` 路径 |
| 前端 UI 仪表盘 | 通过 HTTP 调用三条路由获取变更数据 |

---

## Usage Examples

### 场景：在 Express 应用中挂载路由

```typescript
import express from 'express';
import { changesRouter } from './server/changes/index.js';

const app = express.default();
app.use('/furina/api/changes', changesRouter);
app.listen(3000);
```
Explanation: 将 `changesRouter` 挂载到 Express 应用。挂载后三条路由自动生效：`GET /` 读取本地变更、`GET /all` 全局聚合、`GET /:name` 按名称查询。

### 场景：前端全局仪表盘获取所有活跃变更

```typescript
// 前端调用
const response = await fetch('/furina/api/changes/all?status=active');
const { ok, data } = await response.json();
// data: ChangeEntryWithCwd[]
// => [{ name: "feat-auth", cwd: "D:/project-a", description: "...", status: "active", ... }, ...]
```
Explanation: 仪表盘页面通过 `status=active` 参数过滤，仅显示仍在进行中的变更。`cwd` 字段让前端可以按项目分组展示。

### 场景：后端直接调用 getAllChanges 进行内部聚合

```typescript
import { getAllChanges } from './server/changes/shared.js';
import type { ChangeEntryWithCwd } from './server/changes/shared.js';

// 获取所有项目的变更，用于生成跨项目统计报表
const allChanges: ChangeEntryWithCwd[] = await getAllChanges();

// 统计每个项目的活跃变更数
const byProject = allChanges
  .filter(c => c.status === 'active')
  .reduce<Record<string, number>>((acc, c) => {
    acc[c.cwd] = (acc[c.cwd] || 0) + 1;
    return acc;
  }, {});
// => { "D:/project-a": 3, "D:/project-b": 1 }
```
Explanation: 调用 `getAllChanges()` 获取聚合数据后，可以进一步在后端进行统计分析，无需经过 HTTP 层。`cwd` 字段使得按项目维度分组成为可能。

### 场景：查询单个变更详情（含 404 处理）

```typescript
// 前端调用
const name = 'feat-auth';
const response = await fetch(`/furina/api/changes/${name}`);
const { ok, data, error } = await response.json();

if (ok) {
  console.log(`Status: ${data.status}, Features: ${data.features}`);
} else {
  console.error(`Error: ${error}`); // "Change not found" 或 "Failed to load changes data"
}
```
Explanation: 前端变更详情页通过名称参数查询单个变更。404 表示该名称的变更既不在活跃列表也不在归档列表中。
