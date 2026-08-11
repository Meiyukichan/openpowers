# Changes.json I/O and Seeding

> Source files:
> - `src/utils/memory.ts` : 125-400

## Overview

本 spec 文档描述 Furina 全局内存系统中 `changes.json` 文件的读写与播种(seeding)机制。该机制是全局内存子系统的核心数据层，负责：

- **路径解析**：将 `cwd` 工作目录映射到 `~/.furina/memory/{flatCwd}/changes.json` 的全局存储路径
- **读写 I/O**：提供 `readMemoryChangesJson`（读取）和 `writeMemoryChangesJson`（写入，按 `updateAt` 降序排序）两个核心 I/O 函数
- **确保存在**：`ensureMemoryChangesJson` 在读取后执行路径存在性校验、归档检测、阶段状态归一化，确保内存文件与文件系统状态一致
- **项目播种**：`seedFromProjectChangesJson` 在内存文件不存在时，从项目本地的 `furina/changes.json`（含 `changes` + `archive` 数组）合并并写入全局内存

**设计动机**：Furina 采用双层存储架构——项目本地的 `furina/changes.json` 记录变更原始数据，全局内存 `~/.furina/memory/` 保存经过验证和增强的副本。该机制确保内存文件能在任何时刻被正确恢复，同时自动处理文件系统变更（目录被删除或移至归档）。

**使用场景**：
- 命令执行时（如 `change list`、`change stage`）读取变更数据
- 创建或更新变更条目时写回内存文件
- 确保内存文件与文件系统同步时（路径校验、归档检测）

**涉及源文件**：`src/utils/memory.ts`（125-400 行，含路径解析、I/O、播种、校验等核心逻辑）

## Architecture / Flow

### 数据流概览

```
项目本地文件                    全局内存文件
furina/changes.json  -->  ~/.furina/memory/{flatCwd}/changes.json
  { changes: [...],            { framework, version, cwd,
    archive: [...] }              changes: [...] }

                    seedFromProjectChangesJson()
                           (合并 active + archived)

                    ensureMemoryChangesJson()
                           (校验路径 → 归档检测 → 状态归一化)
```

### ensureMemoryChangesJson 执行流程

```
1. getMemoryChangesJsonPath(cwd) -> filePath
2. 文件不存在? → seedFromProjectChangesJson(cwd)
3. 文件存在? → 读取并解析 JSON
4. checkPathsExist(): 遍历所有条目，检查 path.join(cwd, entry.path) 是否存在
   - 不存在 → 标记 entry.status = 'removed'
5. 归档检测: 对 status='removed' 的条目调用 tryFindArchiveDir()
   - 找到归档目录 → status='archived', path=归档路径, normalizeStageStatuses()
6. 特性同步: 对非 'removed' 条目调用 syncEntryFeatures()
7. writeMemoryChangesJson(): 排序并写回磁盘
8. 返回结果
```

### seedFromProjectChangesJson 执行流程

```
1. 构造默认值 defaults (framework, version, cwd, changes=[])
2. 项目文件不存在? → 返回 defaults
3. 读取并解析项目 JSON
4. 合并 active changes (projectData.changes → status='active')
5. 合并 archived entries (projectData.archive → status='archived')
6. checkPathsExist() 校验路径
7. writeMemoryChangesJson() 写入全局内存
8. 返回结果
```

## Functionality / Interface Details

### `readMemoryChangesJson(cwd: string) -> ChangesJson`

**Source**: `src/utils/memory.ts`:165-177

**Functionality**: 读取全局内存 changes.json 文件。如果文件不存在或解析失败，自动从项目本地的 `furina/changes.json` 播种数据。该函数是只读的，不修改内存文件——路径校验和归档检测由 `ensureMemoryChangesJson` 负责。

**Parameters**:
- `cwd` (`string`): 当前工作目录的绝对路径，用于定位全局内存文件和项目本地文件

**Return Value**:
- `ChangesJson`: 包含 `framework`、`version`、`cwd`、`changes` 数组的完整数据对象
- 文件不存在时返回播种结果
- JSON 解析失败时打印警告并返回播种结果

**Core Logic**:
1. 通过 `getMemoryChangesJsonPath(cwd)` 获取内存文件路径
2. 若文件不存在，直接调用 `seedFromProjectChangesJson(cwd)` 返回
3. 若文件存在，读取并 `JSON.parse` 解析
4. 若解析失败（catch 分支），打印 `console.warn` 并回退到播种

**Core Code**:
```typescript
export function readMemoryChangesJson(cwd: string): ChangesJson {
  const filePath = getMemoryChangesJsonPath(cwd);
  if (!fs.existsSync(filePath)) {
    return seedFromProjectChangesJson(cwd);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw) as ChangesJson;
  } catch {
    console.warn(`[memory] Failed to parse ${filePath}, falling back to project changes.json`);
    return seedFromProjectChangesJson(cwd);
  }
}
```
Source: `src/utils/memory.ts`:165-177

**Usage Example**:
```typescript
import { readMemoryChangesJson } from './utils/memory.js';

// 读取当前项目的全局内存变更数据
const data = readMemoryChangesJson(process.cwd());
console.log(`已加载 ${data.changes.length} 个变更条目`);

// 遍历所有活跃变更
for (const change of data.changes) {
  if (change.status === 'active') {
    console.log(`${change.name}: ${change.description}`);
  }
}
```
Explanation: 调用 `readMemoryChangesJson` 读取当前工作目录对应的全局内存文件。如果该文件不存在（首次运行），会自动从项目本地的 `furina/changes.json` 播种。

---

### `writeMemoryChangesJson(cwd: string, data: ChangesJson) -> void`

**Source**: `src/utils/memory.ts`:384-400

**Functionality**: 将 `ChangesJson` 数据写入全局内存文件。写入前按 `updateAt` 字段降序排序 changes 数组——最近更新的条目排在最前，没有 `updateAt` 的条目排在最后。自动创建不存在的目录结构。排序使用浅拷贝，不修改调用方传入的原始数组。

**Parameters**:
- `cwd` (`string`): 当前工作目录的绝对路径，用于定位内存文件路径
- `data` (`ChangesJson`): 要写入的完整数据对象

**Return Value**:
- `void`: 无返回值

**Core Logic**:
1. 浅拷贝 `data.changes` 数组
2. 对拷贝后的数组排序：双方都有 `updateAt` 时用 `localeCompare` 降序比较；缺失 `updateAt` 的条目排至末尾
3. 获取文件路径，若父目录不存在则用 `fs.mkdirSync(dir, { recursive: true })` 递归创建
4. 以 2 空格缩进的 JSON 格式写入文件

**Core Code**:
```typescript
export function writeMemoryChangesJson(cwd: string, data: ChangesJson): void {
  // Sort by updateAt descending; entries without updateAt go last
  const sorted = [...data.changes].sort((a, b) => {
    if (!a.updateAt && !b.updateAt) return 0;
    if (!a.updateAt) return 1;
    if (!b.updateAt) return -1;
    return b.updateAt.localeCompare(a.updateAt);
  });

  const filePath = getMemoryChangesJsonPath(cwd);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify({ ...data, changes: sorted }, null, 2), 'utf-8');
}
```
Source: `src/utils/memory.ts`:384-400

**Usage Example**:
```typescript
import { writeMemoryChangesJson } from './utils/memory.js';

// 写入排序后的数据
writeMemoryChangesJson(process.cwd(), {
  framework: 'furina',
  version: '1.0.0',
  cwd: process.cwd(),
  changes: [
    { name: 'my-change', path: 'furina/changes/my-change', description: '...', createdAt: '2026-01-01T00:00:00Z', updateAt: '2026-07-01T00:00:00Z', status: 'active', features: 3, todo: 1, artifacts: [] },
    { name: 'old-change', path: 'furina/changes/old-change', description: '...', createdAt: '2026-01-01T00:00:00Z', updateAt: '2026-06-01T00:00:00Z', status: 'archived', features: 5, todo: 0, artifacts: [] },
  ],
});
// 结果文件中 my-change 排在 old-change 前面（updateAt 更近）
```
Explanation: 写入数据后，文件中的 changes 数组按 `updateAt` 降序排列。即使传入时顺序相反，输出文件中也会自动纠正。

---

### `ensureMemoryChangesJson(cwd: string) -> ChangesJson`

**Source**: `src/utils/memory.ts`:262-297

**Functionality**: 确保全局内存 changes.json 存在且与文件系统状态同步。相比 `readMemoryChangesJson` 的纯读取，此函数还执行三项关键的维护操作：(1) 路径存在性校验——将文件系统中已删除的目录标记为 `removed`；(2) 归档检测——对 `removed` 状态的条目检查是否被移至 `furina/archive/` 目录；(3) 阶段状态归一化——将已归档条目的所有工作流阶段步骤状态设为 `done`。校验完成后将结果写回磁盘，保持内存文件始终反映最新状态。

**Parameters**:
- `cwd` (`string`): 当前工作目录的绝对路径

**Return Value**:
- `ChangesJson`: 经过路径校验和归档检测的完整数据对象
- 文件不存在或解析失败时返回播种结果

**Core Logic**:
1. 文件不存在 → 直接调用 `seedFromProjectChangesJson(cwd)` 返回
2. 读取并解析 JSON
3. `checkPathsExist(result.changes, cwd)` — 遍历所有条目，`fs.existsSync(path.join(cwd, entry.path))` 检查路径，不存在则 `entry.status = 'removed'`
4. 对 `status === 'removed'` 的条目调用 `tryFindArchiveDir(cwd, entry.name)` 检测归档：
   - 找到 → 设 `status='archived'`、`path=archivePath`、调用 `normalizeStageStatuses(entry)`
   - 未找到 → 保持 `removed` 状态
5. 对非 `removed` 条目调用 `syncEntryFeatures(entry, cwd)` 同步 `features/todo` 计数
6. 调用 `writeMemoryChangesJson(cwd, result)` 写回磁盘
7. 解析失败 → 打印警告并回退到播种

**Core Code**:
```typescript
export function ensureMemoryChangesJson(cwd: string): ChangesJson {
  const filePath = getMemoryChangesJsonPath(cwd);
  if (!fs.existsSync(filePath)) {
    return seedFromProjectChangesJson(cwd);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    const result = JSON.parse(raw) as ChangesJson;
    result.changes = checkPathsExist(result.changes, cwd);

    // For entries marked as 'removed', check if they've been archived
    for (const entry of result.changes) {
      if (entry.status === 'removed') {
        const archivePath = tryFindArchiveDir(cwd, entry.name);
        if (archivePath) {
          entry.status = 'archived';
          entry.path = archivePath;
          normalizeStageStatuses(entry);
        }
      }
    }

    // Sync features/todo from plan.json for all entries whose path exists
    for (const entry of result.changes) {
      if (entry.status !== 'removed') {
        syncEntryFeatures(entry, cwd);
      }
    }

    writeMemoryChangesJson(cwd, result);
    return result;
  } catch {
    console.warn(`[memory] Failed to parse ${filePath}, falling back to project changes.json`);
    return seedFromProjectChangesJson(cwd);
  }
}
```
Source: `src/utils/memory.ts`:262-297

**Usage Example**:
```typescript
import { ensureMemoryChangesJson } from './utils/memory.js';

// 在执行变更列表命令时，先确保内存文件同步
const data = ensureMemoryChangesJson(process.cwd());

// 此时 data 中的每一条目都已过路径校验
for (const entry of data.changes) {
  console.log(`${entry.name} [${entry.status}]`);
  // removed: 目录已不存在且未归档
  // archived: 目录已移至 furina/archive/ 下
  // active: 目录仍然存在
}
```
Explanation: `ensureMemoryChangesJson` 通常在命令开始时调用，确保读取到的数据准确反映文件系统当前状态。例如 `change list` 命令在列出变更前会调用此函数，以保证显示的状态信息是实时的。

---

### `seedFromProjectChangesJson(cwd: string) -> ChangesJson`

**Source**: `src/utils/memory.ts`:306-375

**Functionality**: 从项目本地的 `furina/changes.json` 播种全局内存文件。该函数在内存文件不存在或损坏时作为自动恢复机制。它读取项目文件中的 `changes`（活跃变更）和 `archive`（已归档变更）两个数组，分别赋予 `active` 和 `archived` 状态后合并为统一的 `ChangeEntry[]`，校验路径后写入全局内存。

**Parameters**:
- `cwd` (`string`): 当前工作目录的绝对路径

**Return Value**:
- `ChangesJson`: 播种后的完整数据对象
- 项目文件不存在时返回仅含框架信息和空 `changes` 数组的默认结构
- 读取/解析失败时打印警告并返回默认结构

**Core Logic**:
1. 构造默认数据 `defaults`：`framework` 取 `pkg.name`，`version` 取 `pkg.version`，`changes` 为空数组
2. 若 `furina/changes.json` 不存在，返回 `defaults`
3. 读取并解析项目 JSON，结构为 `{ changes?: Record[], archive?: Record[] }`
4. 遍历 `projectData.changes`：每条映射为 `status='active'` 的 `ChangeEntry`，`updateAt` 保留原值或回退到当前时间
5. 遍历 `projectData.archive`：每条映射为 `status='archived'` 的 `ChangeEntry`，`updateAt` 优先取 `closedAt`，其次 `updateAt`，最后回退到当前时间；`todo` 固定为 `0`
6. 对合并后的数组调用 `checkPathsExist()` 校验路径
7. 调用 `writeMemoryChangesJson()` 写入全局内存
8. 解析失败 → 返回 `defaults`

**Core Code**:
```typescript
function seedFromProjectChangesJson(cwd: string): ChangesJson {
  const projectPath = path.join(cwd, 'furina', 'changes.json');
  const defaults: ChangesJson = {
    framework: pkg.name,
    version: pkg.version,
    cwd,
    changes: [],
  };

  if (!fs.existsSync(projectPath)) {
    return defaults;
  }

  try {
    const raw = fs.readFileSync(projectPath, 'utf-8');
    const projectData = JSON.parse(raw) as {
      changes?: Array<Record<string, unknown>>;
      archive?: Array<Record<string, unknown>>;
    };

    const merged: ChangeEntry[] = [];

    // Active changes: status = 'active'
    if (Array.isArray(projectData.changes)) {
      for (const entry of projectData.changes) {
        merged.push({
          name: String(entry.name ?? ''),
          path: String(entry.path ?? ''),
          description: String(entry.description ?? ''),
          createdAt: String(entry.createdAt ?? new Date().toISOString()),
          updateAt: (entry.updateAt as string) ?? new Date().toISOString(),
          status: 'active',
          features: Number(entry.features ?? 0),
          todo: Number(entry.todo ?? 0),
          artifacts: Array.isArray(entry.artifacts) ? (entry.artifacts as Array<{ id: string; outputPath: string }>) : [],
        });
      }
    }

    // Archived changes: status = 'archived'
    if (Array.isArray(projectData.archive)) {
      for (const entry of projectData.archive) {
        merged.push({
          name: String(entry.name ?? ''),
          path: String(entry.path ?? ''),
          description: String(entry.description ?? ''),
          createdAt: String(entry.createdAt ?? new Date().toISOString()),
          updateAt: (entry.closedAt as string) ?? (entry.updateAt as string) ?? new Date().toISOString(),
          status: 'archived',
          features: Number(entry.features ?? 0),
          todo: 0,
          artifacts: Array.isArray(entry.artifacts) ? (entry.artifacts as Array<{ id: string; outputPath: string }>) : [],
        });
      }
    }

    const result: ChangesJson = {
      framework: pkg.name,
      version: pkg.version,
      cwd,
      changes: checkPathsExist(merged, cwd),
    };
    writeMemoryChangesJson(cwd, result);
    return result;
  } catch {
    console.warn(`[memory] Failed to read ${projectPath}, returning default structure`);
    return defaults;
  }
}
```
Source: `src/utils/memory.ts`:306-375

**Usage Example**:
```typescript
// seedFromProjectChangesJson 是内部函数，不直接导出
// 它通过 readMemoryChangesJson 和 ensureMemoryChangesJson 间接调用

// 场景: 首次运行，内存文件不存在
const data = readMemoryChangesJson('/home/user/my-project');
// → 内部检测到 ~/.furina/memory/Memory_home_user_my-project/changes.json 不存在
// → 调用 seedFromProjectChangesJson('/home/user/my-project')
// → 读取 /home/user/my-project/furina/changes.json
// → 合并 changes + archive，写入全局内存
// → 返回合并后的 ChangesJson
```
Explanation: `seedFromProjectChangesJson` 作为自动恢复机制，确保即使全局内存文件丢失，系统也能从项目本地数据重建。用户通常无需手动调用此函数。

---

### `getMemoryDir(cwd: string) -> string` (internal)

**Source**: `src/utils/memory.ts`:129-131

**Functionality**: 计算给定工作目录对应的全局内存目录路径。通过 `flattenCwdPath` 将路径扁平化为安全的目录名，然后拼接到 `~/.furina/memory/` 下。

**Parameters**:
- `cwd` (`string`): 当前工作目录路径

**Return Value**:
- `string`: 全局内存目录的绝对路径，格式为 `~/.furina/memory/Memory_{flattened_path}`

**Core Logic**:
调用 `path.join(os.homedir(), '.furina', 'memory', flattenCwdPath(cwd))`，其中 `flattenCwdPath` 先 `normalizePath`（统一斜杠），再将 `:` 和 `/` 替换为 `_`，最后加 `Memory_` 前缀。

**Core Code**:
```typescript
function getMemoryDir(cwd: string): string {
  return path.join(os.homedir(), '.furina', 'memory', flattenCwdPath(cwd));
}
```
Source: `src/utils/memory.ts`:129-131

**Usage Example**:
```typescript
// Windows: D:\project-code\llm\furina
// → ~/.furina/memory/Memory_D_project-code_llm_furina

// Linux: /home/user/projects/my-app
// → ~/.furina/memory/Memory_home_user_projects_my-app
```
Explanation: 路径扁平化确保每个工作目录在全局内存中对应唯一的目录名，避免路径分隔符冲突。

---

### `getMemoryChangesJsonPath(cwd: string) -> string` (internal)

**Source**: `src/utils/memory.ts`:138-140

**Functionality**: 返回全局内存 changes.json 文件的完整路径。在 `getMemoryDir` 返回的目录下追加 `changes.json` 文件名。

**Parameters**:
- `cwd` (`string`): 当前工作目录路径

**Return Value**:
- `string`: changes.json 文件的绝对路径，格式为 `~/.furina/memory/Memory_{flattened_path}/changes.json`

**Core Code**:
```typescript
function getMemoryChangesJsonPath(cwd: string): string {
  return path.join(getMemoryDir(cwd), 'changes.json');
}
```
Source: `src/utils/memory.ts`:138-140

---

### `checkPathsExist(changes: ChangeEntry[], cwd: string) -> ChangeEntry[]` (internal)

**Source**: `src/utils/memory.ts`:149-157

**Functionality**: 遍历所有变更条目，检查每个条目对应的目录是否在文件系统中存在。将 `cwd` 与 `entry.path` 拼接后使用 `fs.existsSync` 检测；若目录不存在，将该条目的 `status` 标记为 `'removed'`。该函数直接修改传入的数组（in-place mutation），同时也返回修改后的数组引用。

**Parameters**:
- `changes` (`ChangeEntry[]`): 要校验的变更条目数组
- `cwd` (`string`): 当前工作目录路径，用于拼接 `entry.path` 构造完整路径

**Return Value**:
- `ChangeEntry[]`: 校验后的数组，部分条目的 `status` 可能已被修改为 `'removed'`

**Core Code**:
```typescript
function checkPathsExist(changes: ChangeEntry[], cwd: string): ChangeEntry[] {
  for (const entry of changes) {
    const fullPath = path.join(cwd, entry.path);
    if (!fs.existsSync(fullPath)) {
      entry.status = 'removed';
    }
  }
  return changes;
}
```
Source: `src/utils/memory.ts`:149-157

**Usage Example**:
```typescript
// checkPathsExist 是内部函数
// 在 ensureMemoryChangesJson 和 seedFromProjectChangesJson 中使用

// 示例效果:
// entry.path = "furina/changes/my-feature"
// cwd = "/home/user/project"
// → 检查 /home/user/project/furina/changes/my-feature 是否存在
// → 不存在则 entry.status = 'removed'
```
Explanation: 此函数是路径校验的核心，确保内存数据不会引用文件系统中已不存在的目录。

---

### `tryFindArchiveDir(cwd: string, changeName: string) -> string | null` (internal)

**Source**: `src/utils/memory.ts`:186-205

**Functionality**: 在 `furina/archive/` 目录下搜索匹配指定变更名称的归档目录。归档目录采用 `YYYY-MM-DD-<changeName>` 的命名格式。该函数检查目录是否存在，遍历所有子目录（跳过以 `.` 开头的隐藏目录），查找名称以 `-{changeName}` 结尾的目录。找到后返回相对路径 `furina/archive/{dirName}`，未找到返回 `null`。

**Parameters**:
- `cwd` (`string`): 当前工作目录路径
- `changeName` (`string`): 要搜索的变更名称（kebab-case 格式）

**Return Value**:
- `string | null`: 找到时返回相对归档路径（如 `furina/archive/2026-07-01-my-feature`），未找到或出错时返回 `null`

**Core Logic**:
1. 拼接 `furina/archive` 目录路径，检查是否存在
2. 使用 `fs.readdirSync` 读取目录内容（`withFileTypes: true`）
3. 遍历 entries：跳过非目录和以 `.` 开头的条目
4. 检查目录名是否以 `-{changeName}` 结尾
5. `readdirSync` 抛出异常时静默返回 `null`

**Core Code**:
```typescript
function tryFindArchiveDir(cwd: string, changeName: string): string | null {
  const archiveDir = path.join(cwd, 'furina', 'archive');
  if (!fs.existsSync(archiveDir)) {
    return null;
  }
  try {
    const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const suffix = `-${changeName}`;
      if (entry.name.endsWith(suffix)) {
        return `furina/archive/${entry.name}`;
      }
    }
  } catch {
    // If readdir fails, treat as not found
  }
  return null;
}
```
Source: `src/utils/memory.ts`:186-205

**Usage Example**:
```typescript
// tryFindArchiveDir 是内部函数，在 ensureMemoryChangesJson 中使用

// 假设目录结构:
//   furina/archive/2026-07-01-my-feature/
//   furina/archive/2026-06-15-old-task/

// tryFindArchiveDir('/home/user/project', 'my-feature')
// → 返回 'furina/archive/2026-07-01-my-feature'

// tryFindArchiveDir('/home/user/project', 'nonexistent')
// → 返回 null
```
Explanation: 归档检测使系统能自动识别已被用户移动到归档目录的变更，将其状态从 `removed` 更新为 `archived`。

---

### `normalizeStageStatuses(entry: ChangeEntry) -> void` (internal)

**Source**: `src/utils/memory.ts`:214-250

**Functionality**: 将一个已归档条目的所有工作流阶段步骤的 `status` 字段归一化为 `'done'`。覆盖所有七个工作流阶段的步骤：顶层的 `explore`、`brainstorm`、`propose`、`plan`、`reviewArtifacts`；`finalize` 子阶段的 `integration` 数组、`codecheck`、`archive`；以及 `subAgentDev` 中每个 feature 的 `progress` 数组。不修改 `updateAt` 字段。

**Parameters**:
- `entry` (`ChangeEntry`): 要归一化的变更条目（会直接修改该对象）

**Return Value**:
- `void`: 无返回值，直接修改传入的 `entry` 对象

**Core Logic**:
1. 若 `entry.stage` 不存在，直接返回
2. 收集所有顶层 `StageStep` 引用到 `stageSteps` 数组
3. 收集 `finalize.integration` 数组中的步骤、`finalize.codecheck`、`finalize.archive`
4. 遍历 `stageSteps`，将每个步骤的 `status` 设为 `'done'`
5. 遍历 `subAgentDev` 数组中每个 feature 的 `progress` 数组，将每个步骤的 `status` 设为 `'done'`

**Core Code**:
```typescript
function normalizeStageStatuses(entry: ChangeEntry): void {
  if (!entry.stage) return;

  const stage = entry.stage;
  const stageSteps: StageStep[] = [];

  // Top-level StageStep fields
  if (stage.explore) stageSteps.push(stage.explore);
  if (stage.brainstorm) stageSteps.push(stage.brainstorm);
  if (stage.propose) stageSteps.push(stage.propose);
  if (stage.plan) stageSteps.push(stage.plan);
  if (stage.reviewArtifacts) stageSteps.push(stage.reviewArtifacts);

  // Finalize sub-steps
  if (Array.isArray(stage.finalize?.integration)) {
    for (const step of stage.finalize.integration) {
      stageSteps.push(step);
    }
  }
  if (stage.finalize?.codecheck) stageSteps.push(stage.finalize.codecheck);
  if (stage.finalize?.archive) stageSteps.push(stage.finalize.archive);

  for (const step of stageSteps) {
    step.status = 'done';
  }

  // subAgentDev progress items
  if (Array.isArray(stage.subAgentDev)) {
    for (const sad of stage.subAgentDev) {
      if (Array.isArray(sad.progress)) {
        for (const prog of sad.progress) {
          prog.status = 'done';
        }
      }
    }
  }
}
```
Source: `src/utils/memory.ts`:214-250

**Usage Example**:
```typescript
// normalizeStageStatuses 是内部函数，在 ensureMemoryChangesJson 中使用

// 归档前：某个变更的 stage 可能有中间状态
// entry.stage.explore.status = 'done'
// entry.stage.brainstorm.status = 'done'
// entry.stage.plan.status = 'in_progress'  ← 未完成
// entry.stage.subAgentDev[0].progress[0].status = 'in_progress'  ← 未完成

// normalizeStageStatuses(entry) 后：
// entry.stage.plan.status = 'done'  ← 已归一化
// entry.stage.subAgentDev[0].progress[0].status = 'done'  ← 已归一化
```
Explanation: 已归档的变更意味着整个工作流已完成，因此所有阶段步骤都应被标记为 `'done'`。这避免了 UI 展示已归档变更时出现误导性的"进行中"状态。

## Data Structures

### `ChangesJson`

```typescript
export const ChangesJsonSchema = z.object({
  framework: z.string(),
  version: z.string(),
  cwd: z.string(),
  changes: z.array(ChangeEntrySchema),
});
export type ChangesJson = z.infer<typeof ChangesJsonSchema>;
```
- `framework` (`string`): 框架名称，取自 `package.json` 的 `name` 字段
- `version` (`string`): 框架版本号，取自 `package.json` 的 `version` 字段
- `cwd` (`string`): 该内存文件对应的工作目录路径
- `changes` (`ChangeEntry[]`): 变更条目数组，写入时按 `updateAt` 降序排序

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
- `name` (`string`): 变更名称（kebab-case 格式）
- `path` (`string`): 变更目录的相对路径（如 `furina/changes/my-feature`）
- `description` (`string`): 变更描述
- `createdAt` (`string`): 创建时间 ISO 8601 字符串
- `updateAt` (`string | undefined`): 最后更新时间，排序依据
- `status` (`'active' | 'archived' | 'removed'`): 变更状态，由路径校验和归档检测自动维护
- `features` (`number`): 功能特性数量，由 `plan.json` 同步
- `todo` (`number`): 未完成功能数量，由 `plan.json` 同步
- `artifacts` (`Array<{ id: string; outputPath: string }>`): 产出物列表
- `stage` (`ChangeStage | undefined`): 工作流阶段数据（7 个阶段）

### 项目本地 changes.json 结构

播种时读取的项目本地文件 (`furina/changes.json`) 结构与 `ChangesJson` 不同：

```typescript
{
  changes?: Array<Record<string, unknown>>;   // 活跃变更，播种时 status 强制为 'active'
  archive?: Array<Record<string, unknown>>;   // 已归档变更，播种时 status 强制为 'archived'
}
```
- `archive` 条目的 `updateAt` 优先取 `closedAt` 字段，其次 `updateAt`，最后回退到当前时间
- `archive` 条目的 `todo` 固定为 `0`（已完成的归档变更无待办）

## Error Handling and Edge Cases

### 文件不存在的自动恢复

当全局内存文件不存在时，`readMemoryChangesJson` 和 `ensureMemoryChangesJson` 都会自动调用 `seedFromProjectChangesJson` 从项目本地数据恢复。如果项目本地文件也不存在，则返回仅含框架信息的默认结构（空 `changes` 数组）。

### JSON 解析失败处理

`readMemoryChangesJson`、`ensureMemoryChangesJson` 和 `seedFromProjectChangesJson` 都包含 `try/catch` 处理 JSON 解析错误。解析失败时打印 `console.warn` 日志并回退到默认行为（播种或返回空结构）。

### 归档目录检测的静默失败

`tryFindArchiveDir` 在 `readdirSync` 抛出异常时静默返回 `null`（不打印日志、不抛出异常）。这意味着即使归档目录存在但权限不足，系统也不会崩溃——该条目将保持 `removed` 状态。

### checkPathsExist 的 in-place 修改

`checkPathsExist` 直接修改传入的数组中条目的 `status` 字段。调用方需注意该副作用。在 `ensureMemoryChangesJson` 中，修改后的数据随后被写入磁盘，所以这个副作用是预期行为。

### 路径不存在时的 removed 标记

`checkPathsExist` 只检查路径是否存在，不检查路径是否是目录还是文件。理论上如果 `entry.path` 指向一个文件而非目录，也会被认为存在。这是设计上的简化——变更路径在实际使用中始终指向目录。

### seedFromProjectChangesJson 的字段回退策略

播种时每个字段都有默认值回退：
- `name`、`path`、`description`：回退为空字符串
- `createdAt`：回退到 `new Date().toISOString()`
- `updateAt`：活跃变更回退到当前时间，归档变更优先取 `closedAt` → `updateAt` → 当前时间
- `features`、`todo`：回退为 `0`
- `artifacts`：回退为空数组

## Dependencies

### Depends on

- **`src/utils/common.ts`** — `normalizePath` 函数，用于 `flattenCwdPath` 中的路径规范化
- **`fs` (Node.js)** — 文件系统操作：`existsSync`、`readFileSync`、`writeFileSync`、`mkdirSync`、`readdirSync`
- **`os` (Node.js)** — `os.homedir()` 获取用户主目录
- **`path` (Node.js)** — 路径拼接和处理
- **`zod`** — 用于 `ChangesJson`、`ChangeEntry` 等 schema 验证（schema 定义在 spec-memory-schemas.md 中）
- **`package.json`** — 通过 `createRequire` 读取 `name` 和 `version` 字段用于 `framework` 和 `version`

### Depended by

- **`src/utils/memory.ts`** (spec-memory-entry-lifecycle.md) — `createOrUpdateChange` 通过 `ensureMemoryChangesJson` 读取数据，通过 `writeMemoryChangesJson` 写回
- **`src/commands/change/list.ts`** — `change list` 命令调用 `ensureMemoryChangesJson` 同步并列出变更
- **`src/commands/change/stage.ts`** — `change stage` 命令调用 `readMemoryChangesJson` 读取变更数据
- **`src/commands/change/archive.ts`** — `change archive` 命令调用 `writeMemoryChangesJson` 写回归档后的数据

## Usage Examples

### 命令场景：读取变更列表并确保同步

```typescript
import { ensureMemoryChangesJson } from '../../utils/memory.js';

function runChangeList() {
  const cwd = process.cwd();

  // ensureMemoryChangesJson 会：
  // 1. 如果内存文件不存在，从项目本地播种
  // 2. 校验所有变更路径是否存在
  // 3. 检测已移至归档目录的变更
  // 4. 将归档变更的阶段状态归一化为 done
  // 5. 同步 features/todo 计数
  // 6. 写回磁盘
  const data = ensureMemoryChangesJson(cwd);

  // 输出所有变更及其状态
  for (const entry of data.changes) {
    console.log(`[${entry.status}] ${entry.name}: ${entry.description}`);
  }
}
```
Explanation: `change list` 命令先调用 `ensureMemoryChangesJson` 确保数据最新，再展示变更列表。此调用会自动处理用户手动移动变更目录到归档的情况。

### 命令场景：读取变更数据用于阶段更新

```typescript
import { readMemoryChangesJson } from '../../utils/memory.js';

function runChangeStage(session: { cwd: string }) {
  // 使用 readMemoryChangesJson 而非 ensureMemoryChangesJson
  // 因为 stage 命令不需要每次都校验路径和归档
  const memoryData = readMemoryChangesJson(session.cwd);

  // 根据 changeName 查找目标条目
  const target = memoryData.changes.find(c => c.name === 'my-feature');
  if (!target) {
    console.error('变更不存在');
    return;
  }

  console.log(`当前阶段: ${JSON.stringify(target.stage, null, 2)}`);
}
```
Explanation: `change stage` 命令使用 `readMemoryChangesJson` 进行纯读取。相比 `ensureMemoryChangesJson`，它不执行路径校验和归档检测，性能更好，适合频繁调用。

### 归档流程：写回归档后的数据

```typescript
import { writeMemoryChangesJson } from '../../utils/memory.js';

function archiveChange(cwd: string, changeName: string) {
  // ... 执行归档操作（移动目录、更新状态等）...

  // 使用 writeMemoryChangesJson 直接写回修改后的数据
  // 写入前会自动按 updateAt 降序排序
  writeMemoryChangesJson(cwd, memoryData);
}
```
Explanation: 归档命令在修改数据后调用 `writeMemoryChangesJson` 写回。由于排序是隐式的，调用方无需关心 changes 数组的顺序。

### 首次运行的完整播种流程

```typescript
import { readMemoryChangesJson } from './utils/memory.js';

// 场景: 用户首次使用 Furina，全局内存文件不存在
const data = readMemoryChangesJson('/home/user/my-project');

// 内部执行:
// 1. 检查 ~/.furina/memory/Memory_home_user_my-project/changes.json → 不存在
// 2. 调用 seedFromProjectChangesJson('/home/user/my-project')
// 3. 读取 /home/user/my-project/furina/changes.json
//    - changes: [{ name: 'feat-auth', ... }, { name: 'fix-bug', ... }]
//    - archive: [{ name: 'old-feature', closedAt: '2026-06-01T...', ... }]
// 4. 合并:
//    - feat-auth  → status='active'
//    - fix-bug    → status='active'
//    - old-feature → status='archived', updateAt='2026-06-01T...'
// 5. checkPathsExist() 校验路径
// 6. writeMemoryChangesJson() 写入全局内存
// 7. 返回合并后的 ChangesJson

console.log(data.changes.length); // 3
```
Explanation: 播种流程将项目本地的双数组结构（changes + archive）合并为全局内存的单数组结构（统一的 `status` 字段区分），并自动写入全局内存文件。后续读取将直接从全局内存文件获取数据，无需再次播种。
