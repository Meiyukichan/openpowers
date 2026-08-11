# Change Listing and Status

> Source files:
> - `src/commands/change/list.ts` : 1-57
> - `src/commands/change/status.ts` : 1-159

## Overview

本 Spec 文档覆盖 change 子系统中的两个互补命令：**change list** 和 **change status**。

**change list** 用于展示所有活跃变更的概览表格，包含名称、进度比、描述和相对时间四列。该命令在列出信息的同时，还会触发 `syncChangesJson()` 同步文件系统与 changes.json 的状态，并调用 `ensureMemoryChangesJson()` 将变更列表同步到全局 memory 中，确保 Claude 工作流中始终可获取最新的变更列表信息。

**change status** 用于查询某个特定变更的制品流水线状态。它实现了顺序依赖的制品状态机逻辑（proposal -> design -> specs），采用 `ready`/`done`/`blocked` 三种状态标识每个制品的完成程度。此外还评估 plan.json 中所有 feature 的完成情况，最终以 JSON 格式输出变更状态，包含 `isArtsComplete` 标志位。该标志位仅在三个核心制品全部 `done` 时才为 `true`，是判断变更能否进行归档操作的关键依据。

**设计动机**：change 的生命周期涉及多个顺序制品，每个制品依赖前一个的完成。`list` 提供全局视图让开发者快速了解所有变更进度，`status` 提供深度视图让工作流系统（特别是 archive 命令和 stage 命令）准确判断变更的制品完成状态。

**涉及源文件职责**：
- `src/commands/change/list.ts`：格式化表格输出逻辑，同步全局 memory
- `src/commands/change/status.ts`：制品流水线状态计算逻辑，plan.json 完成度评估，JSON 状态输出

## Architecture / Flow

### change list 执行流程

```
runChangeList()
  ├── syncChangesJson()          // 同步文件系统 → changes.json
  │     ├── loadOrCreateChangesJson()
  │     ├── 扫描 furina/changes/ 目录
  │     ├── 扫描 furina/archive/ 目录
  │     └── 写回 changes.json
  ├── 计算列宽（name, progress, description, time）
  ├── 输出表头 + 分隔线
  ├── 遍历输出每行
  └── ensureMemoryChangesJson()  // 同步到全局 memory
```

### change status 执行流程

```
runChangeStatus(name)
  ├── syncChangesJson()
  ├── 在 changes 中查找，未找到则在 archive 中查找
  ├── computeArtifactStatus(changeDirPath)
  │     ├── 检查 proposal.md / design.md / specs/ 存在性
  │     ├── 按顺序确定三个核心制品状态（ready/done/blocked）
  │     ├── buildArtifacts() 获取非核心制品
  │     ├── 对 plan 制品调用 computePlanStatus()
  │     └── 合并核心 + 非核心制品状态列表
  ├── 计算 isArtsComplete（三个核心制品全部 done）
  └── JSON 输出到 stdout
```

### 制品状态机（核心逻辑）

```
proposal 不存在  →  proposal: ready,   design: blocked, specs: blocked
proposal 存在    →  proposal: done,    design: ready,   specs: blocked
design 存在      →  proposal: done,    design: done,    specs: ready
specs 存在       →  proposal: done,    design: done,    specs: done
```

状态按**顺序依赖**计算：前一个制品未完成时，后续制品永远为 `blocked`；前一个完成后，当前变为 `ready`；当前制品自身完成后变为 `done`。

## Functionality / Interface Details

### `runChangeList(): void`

**Source**: `src/commands/change/list.ts`:17-57

**Functionality**: 列出所有活跃变更的格式化表格。这是 `furina change list` 命令的入口函数。它首先调用 `syncChangesJson()` 确保 changes.json 与文件系统同步，然后计算所有列的最优宽度，输出表头、分隔线和每一行变更数据，最后调用 `ensureMemoryChangesJson()` 将变更列表同步到全局 memory 中。当没有活跃变更时，输出 "No changes found" 并提前返回。

**Parameters**: 无

**Return Value**: `void` -- 所有输出通过 `process.stdout.write()` 写入标准输出。

**Core Logic**:
1. 调用 `syncChangesJson()` 获取最新的变更数据，该函数会扫描文件系统并同步 changes.json
2. 如果 `data.changes` 为空数组，输出 "No changes found" 并返回
3. 计算四列的最优宽度：取所有数据中该列最大长度与最小表头长度（Name=4, Progress=8, Description=11）的较大值
4. Progress 列格式为 `{features - todo}/{features} features`，例如 "3/5 features"
5. Time 列使用 `formatRelativeTime()` 将 ISO 时间戳转为相对时间（如 "2d ago"）
6. 每列间使用两个空格分隔，name 和 description 左对齐
7. 最后调用 `ensureMemoryChangesJson(process.cwd())` 同步全局 memory

**Core Code**:
```typescript
export function runChangeList(): void {
  const data = syncChangesJson();

  if (data.changes.length === 0) {
    process.stdout.write('No changes found\n');
    return;
  }

  const allEntries = data.changes;

  // Compute column widths
  const nameWidth = Math.max(4, ...allEntries.map((e) => String(e.name || '').length));
  const progressWidth = Math.max(8, ...allEntries.map((e) => {
    const progressStr = `${Number(e.features ?? 0) - Number(e.todo ?? 0)}/${Number(e.features ?? 0)} features`;
    return progressStr.length;
  }));
  const descWidth = Math.max(11, ...allEntries.map((e) => String(e.description || '').length));

  // Print header
  const headerName = 'Name'.padEnd(nameWidth);
  const headerProg = 'Progress'.padEnd(progressWidth);
  const headerDesc = 'Description'.padEnd(descWidth);
  const headerTime = 'Time';
  process.stdout.write(`${headerName}  ${headerProg}  ${headerDesc}  ${headerTime}\n`);

  // Print separator
  const sep = '-'.repeat(nameWidth + progressWidth + descWidth + 20);
  process.stdout.write(`${sep}\n`);

  // Print each entry
  for (const entry of allEntries) {
    const name = String(entry.name || '').padEnd(nameWidth);
    const progress = `${Number(entry.features ?? 0) - Number(entry.todo ?? 0)}/${Number(entry.features ?? 0)} features`.padEnd(progressWidth);
    const description = String(entry.description || '').padEnd(descWidth);
    const time = formatRelativeTime(String(entry.createdAt || ''));
    process.stdout.write(`${name}  ${progress}  ${description}  ${time}\n`);
  }
  logger.info(`Listed ${allEntries.length} changes`);
  ensureMemoryChangesJson(process.cwd());
}
```
Source: `src/commands/change/list.ts`:17-57

**Usage Example**:
```bash
furina change list
```
输出示例：
```
Name              Progress     Description              Time
----------------------------------------------------------------------
add-auth          3/5 features Implement authentication  2d ago
refactor-ui       0/3 features Refactor frontend layout  5h ago
```
Explanation: 展示所有活跃变更的名称、进度、描述和创建时间。进度比中分子为已完成的 feature 数量，分母为 plan.json 中的总 feature 数量。

---

### `runChangeStatus(name: string): void`

**Source**: `src/commands/change/status.ts`:121-158

**Functionality**: 查询指定变更的制品流水线状态并以 JSON 格式输出到标准输出。这是 `furina change status <name>` 命令的入口函数。它先同步 changes.json，然后在 changes 数组和 archive 数组中依次查找目标变更（先查活跃变更，再查归档变更）。找到后，调用 `computeArtifactStatus()` 计算所有制品的状态，计算 `isArtsComplete` 标志位，最终输出结构化的 JSON。如果变更名不存在，输出错误信息到 stderr 并以 exit code 1 退出。

**Parameters**:
- `name` (`string`): 要查询的变更名称，必须是已存在的 kebab-case 名称。

**Return Value**: `void` -- JSON 结果通过 `process.stdout.write()` 输出到标准输出。

**Core Logic**:
1. 调用 `syncChangesJson()` 同步数据
2. 在 `data.changes` 中查找匹配名称的条目，找到则标记 `status = 'active'`
3. 若未找到，在 `data.archive` 中查找，找到则标记 `status = 'archived'`
4. 若仍未找到，输出错误到 stderr 并 `process.exit(1)`
5. 将条目的相对路径解析为绝对路径
6. 调用 `computeArtifactStatus(changeDirPath)` 获取制品状态数组
7. 计算 `isArtsComplete`：三个核心制品（proposal、design、specs）全部 `done` 时为 `true`
8. 组装输出对象并 JSON 序列化到 stdout

**Core Code**:
```typescript
export function runChangeStatus(name: string): void {
  const data = syncChangesJson();

  let status = 'active';
  let entry = data.changes.find((c) => c.name === name);
  if (!entry) {
    entry = data.archive.find((a) => a.name === name);
    status = 'archived';
  }

  if (!entry) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  logger.info(`Status queried for '${name}' (${status})`);

  const changeDirPath = path.resolve(process.cwd(), String(entry.path));
  const artifacts = computeArtifactStatus(changeDirPath);

  const isArtsComplete = CORE_ARTIFACTS.every((id) => {
    const artifact = artifacts.find((a) => a.id === id);
    return artifact && artifact.status === 'done';
  });

  const output = {
    name: entry.name,
    status,
    isArtsComplete,
    artifacts,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}
```
Source: `src/commands/change/status.ts`:121-158

**Usage Example**:
```bash
furina change status add-auth
```
输出示例：
```json
{
  "name": "add-auth",
  "status": "active",
  "isArtsComplete": false,
  "artifacts": [
    { "id": "proposal", "outputPath": "proposal.md", "status": "done" },
    { "id": "design", "outputPath": "design.md", "status": "ready" },
    { "id": "specs", "outputPath": "specs/**/*.md", "status": "blocked" }
  ]
}
```
Explanation: 表示变更 `add-auth` 处于活跃状态，proposal 已完成，design 可以开始，specs 被阻塞。`isArtsComplete` 为 false 因为 design 和 specs 未完成。

---

### `computeArtifactStatus(changeDirPath: string): Array<{ id: string; outputPath: string; status: string }>`

**Source**: `src/commands/change/status.ts`:43-110

**Functionality**: 计算指定变更目录下所有制品的流水线状态。这是 `change status` 命令的核心计算逻辑，也被 `change archive` 命令复用来判断变更是否可以归档。该函数实现了一个**顺序制品状态机**：三个核心制品（proposal -> design -> specs）按严格顺序评估状态，前一个未完成后一个永远 blocked。非核心制品（api、database、plan）中，plan 根据 plan.json 中 feature 完成情况动态计算状态，其余非核心制品在文件存在时无条件标记为 done。

**Parameters**:
- `changeDirPath` (`string`): 变更目录的绝对路径，例如 `D:/project/furina/changes/add-auth`

**Return Value**: `Array<{ id: string; outputPath: string; status: string }>` -- 制品状态数组。每个元素包含：
  - `id`: 制品标识符（如 "proposal"、"design"、"specs"、"plan" 等）
  - `outputPath`: 相对于变更目录的文件路径（正斜杠分隔）
  - `status`: 状态值，核心制品为 "ready"/"done"/"blocked"，plan 为 "done"/"in_progress"，其他非核心为 "done"

**Core Logic**:
1. **文件存在性检查**：依次检查 `proposal.md`、`design.md` 文件是否存在于变更目录，检查 `specs/` 目录是否存在且包含 `.md` 文件（递归扫描子目录）
2. **顺序状态计算**：使用 if-else 链按严格顺序决定三个核心制品的状态：
   - proposal 不存在 -> proposal: ready, design: blocked, specs: blocked
   - proposal 存在但 design 不存在 -> proposal: done, design: ready, specs: blocked
   - design 存在但 specs 不存在 -> proposal: done, design: done, specs: ready
   - 三者均存在 -> 全部 done
3. **非核心制品合并**：调用 `buildArtifacts()` 获取文件系统中存在的所有制品，对不在 `CORE_ARTIFACTS` 中的制品追加到结果。plan 制品调用 `computePlanStatus()` 评估，其余标记为 done
4. **specs 递归检查**：specs 的存在性不是简单的 `fs.existsSync`，而是递归扫描 specs 目录下的所有子目录，查找任何 `.md` 文件的存在

**Core Code**:
```typescript
const CORE_ARTIFACTS = ['proposal', 'design', 'specs'];

export function computeArtifactStatus(changeDirPath: string): Array<{ id: string; outputPath: string; status: string }> {
  const proposalMdExists = fs.existsSync(path.join(changeDirPath, 'proposal.md'));
  const designMdExists = fs.existsSync(path.join(changeDirPath, 'design.md'));
  const specsDir = path.join(changeDirPath, 'specs');
  const specsExist = ((): boolean => {
    if (!fs.existsSync(specsDir)) return false;
    const scan = (dir: string): boolean => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries.some((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? scan(full) : e.name.endsWith('.md');
      });
    };
    return scan(specsDir);
  })();

  let proposalStatus: string;
  let designStatus: string;
  let specsStatus: string;
  if (!proposalMdExists) {
    proposalStatus = 'ready';
    designStatus = 'blocked';
    specsStatus = 'blocked';
  } else if (!designMdExists) {
    proposalStatus = 'done';
    designStatus = 'ready';
    specsStatus = 'blocked';
  } else if (!specsExist) {
    proposalStatus = 'done';
    designStatus = 'done';
    specsStatus = 'ready';
  } else {
    proposalStatus = 'done';
    designStatus = 'done';
    specsStatus = 'done';
  }

  const coreStatusMap: Record<string, string> = {
    proposal: proposalStatus,
    design: designStatus,
    specs: specsStatus,
  };

  const existingArtifacts = buildArtifacts(changeDirPath);
  const results: Array<{ id: string; outputPath: string; status: string }> = CORE_ARTIFACTS.map((id) => {
    const fileName = id === 'specs' ? `specs${ARTIFACT_EXTENSIONS[id]}` : `${id}${ARTIFACT_EXTENSIONS[id]}`;
    return { id, outputPath: fileName, status: coreStatusMap[id] };
  });

  for (const artifact of existingArtifacts) {
    if (!CORE_ARTIFACTS.includes(artifact.id)) {
      const fileName = `${artifact.id}${ARTIFACT_EXTENSIONS[artifact.id]}`;
      const artifactStatus = artifact.id === 'plan'
        ? computePlanStatus(path.join(changeDirPath, 'plan.json'))
        : 'done';
      results.push({ id: artifact.id, outputPath: fileName, status: artifactStatus });
    }
  }

  return results;
}
```
Source: `src/commands/change/status.ts`:14-110

**Usage Example**:
```typescript
import { computeArtifactStatus } from './status.js';

// 假设目录 furina/changes/add-auth/ 下存在 proposal.md 和 design.md
const artifacts = computeArtifactStatus('/project/furina/changes/add-auth');
// 结果:
// [
//   { id: 'proposal', outputPath: 'proposal.md',       status: 'done' },
//   { id: 'design',   outputPath: 'design.md',         status: 'done' },
//   { id: 'specs',    outputPath: 'specs/**/*.md',     status: 'ready' },
// ]
```
Explanation: 当 proposal.md 和 design.md 都存在但 specs/ 目录为空或不存在时，proposal 和 design 为 done，specs 为 ready（表示可以开始编写）。

---

### `computePlanStatus(planPath: string): string`

**Source**: `src/commands/change/status.ts`:22-32

**Functionality**: 评估 plan.json 中所有 feature 的完成状态。当 plan.json 文件不存在、解析失败、或不是数组时返回 `'in_progress'`；当 feature 数组为空时返回 `'done'`；否则仅在所有 feature 的 status 都为 `'done'` 时返回 `'done'`，否则返回 `'in_progress'`。

**Parameters**:
- `planPath` (`string`): plan.json 文件的绝对路径

**Return Value**: `string` -- `'done'` 或 `'in_progress'`。不会返回 `'ready'` 或 `'blocked'`，因为 plan 不参与顺序制品状态机。

**Core Logic**:
1. 尝试读取 plan.json 文件内容
2. JSON 解析后检查是否为数组，非数组返回 `'in_progress'`
3. 空数组视为全部完成，返回 `'done'`
4. 遍历所有 feature，使用 `Array.every()` 检查是否所有 feature 的 `status === 'done'`
5. 任何读取或解析异常均返回 `'in_progress'`（安全默认值）

**Core Code**:
```typescript
function computePlanStatus(planPath: string): string {
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features)) return 'in_progress';
    if (features.length === 0) return 'done';
    return features.every((f: { status?: string }) => f.status === 'done') ? 'done' : 'in_progress';
  } catch {
    return 'in_progress';
  }
}
```
Source: `src/commands/change/status.ts`:22-32

**Usage Example**:
```typescript
// plan.json 中所有 feature 都是 done 时
computePlanStatus('/project/furina/changes/add-auth/plan.json');
// => 'done'

// plan.json 存在但某些 feature 未完成时
computePlanStatus('/project/furina/changes/add-auth/plan.json');
// => 'in_progress'

// plan.json 不存在时
computePlanStatus('/project/furina/changes/new-feature/plan.json');
// => 'in_progress'
```

---

### `ensureMemoryChangesJson(cwd: string): ChangesJson`

**Source**: `src/utils/memory.ts`:262+

**Functionality**: 确保全局 memory 中的 changes.json 文件存在且路径有效。此函数在 `runChangeList()` 末尾调用，将项目本地的变更列表同步到 Claude 的全局 memory 中。当 memory 中不存在 changes.json 时，从项目本地 furina/changes.json 种子创建。对每个条目校验路径是否存在，标记路径已消失的条目为 `'removed'`。对已归档的变更，规范化其 stage 状态为 `'done'`。

**Parameters**:
- `cwd` (`string`): 工作目录路径，通常传入 `process.cwd()`

**Return Value**: `ChangesJson` -- 解析后的全局 memory 变更数据对象

**Usage Example**:
```typescript
import { ensureMemoryChangesJson } from '../../utils/memory.js';

// 在列出变更列表后同步到全局 memory
ensureMemoryChangesJson(process.cwd());
```
Explanation: 此函数是 `runChangeList()` 的最后一步调用，确保 AI 工作流在读取全局 memory 时能获取最新的变更列表。

## Data Structures

### `CORE_ARTIFACTS`
```typescript
const CORE_ARTIFACTS = ['proposal', 'design', 'specs'];
```
- 核心制品标识符的有序数组，定义了顺序制品状态机的评估顺序
- 所有三个核心制品都 `done` 时 `isArtsComplete` 才为 `true`

### 制品状态枚举（非显式定义）

制品状态采用字符串字面量，无独立枚举类型：
- `'ready'`: 制品可以开始创建（前序制品已完成）
- `'done'`: 制品已完成（文件存在）
- `'blocked'`: 制品被阻塞（前序制品未完成）
- `'in_progress'`: 仅用于 plan 制品，表示有 feature 未完成

### 状态输出 JSON 结构
```typescript
{
  name: string;           // 变更名称
  status: 'active' | 'archived';  // 变更生命周期状态
  isArtsComplete: boolean; // 三个核心制品是否全部 done
  artifacts: Array<{
    id: string;           // 制品标识符
    outputPath: string;   // 相对于变更目录的路径
    status: string;       // 制品状态
  }>;
}
```

### 列表条目结构（来自 changes.json）
```typescript
{
  name: string;          // 变更名称（kebab-case）
  path: string;          // 相对于 cwd 的路径
  description: string;   // 变更描述
  createdAt: string;     // ISO 8601 创建时间
  features: number;      // plan.json 中总 feature 数
  todo: number;          // 未完成的 feature 数
  artifacts: Array<{ id: string; outputPath: string }>;
}
```

## Error Handling and Edge Cases

1. **变更名不存在**：`runChangeStatus()` 在 changes 和 archive 中均未找到时，输出 `Change '<name>' not found` 到 stderr 并 `process.exit(1)` 退出。

2. **无活跃变更**：`runChangeList()` 在 `data.changes` 为空数组时输出 `No changes found` 到 stdout 并提前返回，不调用 `ensureMemoryChangesJson()`。

3. **plan.json 不存在或损坏**：`computePlanStatus()` 使用 try-catch 包裹所有文件读取和 JSON 解析操作，任何异常均安全返回 `'in_progress'`。当 JSON 解析结果不是数组时也返回 `'in_progress'`。`computeProgress()`（来自 shared.ts）同样对缺失或损坏的 plan.json 返回 `{ features: 0, todo: 0 }` 安全默认值。

4. **specs 目录递归检查**：specs 的存在性检查不是简单的目录存在性测试，而是递归扫描所有子目录查找 `.md` 文件。空的 specs 目录不被视为 specs 存在，保证状态机不会误判空目录为已完成。

5. **路径兼容性**：所有 outputPath 使用 `toRelativePath()` 将绝对路径转为相对路径并统一使用正斜杠分隔，确保跨平台兼容性。

## Dependencies

### Depends on
- **spec-change-shared.md** (`src/commands/change/shared.ts`)：提供 `syncChangesJson()` 同步文件系统与 changes.json、`formatRelativeTime()` 相对时间格式化、`buildArtifacts()` 制品存在性扫描、`ARTIFACT_EXTENSIONS` 文件扩展名映射
- **memory.ts** (`src/utils/memory.ts`)：提供 `ensureMemoryChangesJson()` 全局 memory 同步功能
- **logger.ts** (`src/utils/logger.ts`)：提供 `logger.info()` 日志输出

### Depended by
- **spec-change-archive.md** (`src/commands/change/archive.ts`)：归档命令调用 `computeArtifactStatus()` 来判断变更的所有制品是否完成，只有全部 done 时才允许归档
- **spec-change-barrel.md** (`src/commands/change/index.ts`)：barrel 文件导入并注册 `runChangeList()` 和 `runChangeStatus()` 到 Commander 命令树

## Usage Examples

### 场景一：查看所有活跃变更

```bash
# 列出所有活跃变更
furina change list
```

输出示例：
```
Name              Progress     Description                    Time
------------------------------------------------------------------------
add-auth          3/5 features Implement user authentication  2d ago
refactor-ui       0/3 features Refactor frontend layout       5h ago
fix-bug-123       5/5 features Fix login timeout bug          just now
```

Explanation:
- `add-auth`: 5 个 feature 中完成了 3 个，创建于 2 天前
- `refactor-ui`: 3 个 feature 都未完成，创建于 5 小时前
- `fix-bug-123`: 全部完成，刚刚创建

该命令同时将变更列表同步到全局 memory，后续 AI 工作流可直接引用。

### 场景二：查询特定变更的制品状态

```bash
# 查询进行中变更的制品状态
furina change status add-auth
```

输出示例：
```json
{
  "name": "add-auth",
  "status": "active",
  "isArtsComplete": false,
  "artifacts": [
    { "id": "proposal", "outputPath": "proposal.md", "status": "done" },
    { "id": "design", "outputPath": "design.md", "status": "done" },
    { "id": "specs", "outputPath": "specs/**/*.md", "status": "ready" },
    { "id": "plan", "outputPath": "plan.json", "status": "in_progress" }
  ]
}
```

Explanation:
- proposal 和 design 已完成（文件存在）
- specs 处于 ready 状态（design 已完成，可以开始编写 specs）
- plan 处于 in_progress（plan.json 中有未完成的 feature）
- `isArtsComplete` 为 false（specs 未完成）

### 场景三：查询完全归档的变更

```bash
furina change status fix-bug-123
```

输出示例：
```json
{
  "name": "fix-bug-123",
  "status": "archived",
  "isArtsComplete": true,
  "artifacts": [
    { "id": "proposal", "outputPath": "proposal.md", "status": "done" },
    { "id": "design", "outputPath": "design.md", "status": "done" },
    { "id": "specs", "outputPath": "specs/**/*.md", "status": "done" },
    { "id": "plan", "outputPath": "plan.json", "status": "done" }
  ]
}
```

Explanation: 已归档的变更所有制品都已完成，`isArtsComplete` 为 true。这符合预期，因为只有所有制品完成的变更才能执行归档操作。

### 场景四：程序化调用 computeArtifactStatus

```typescript
import { computeArtifactStatus } from './status.js';

// 在 archive 命令中，判断变更是否可以归档
const artifacts = computeArtifactStatus(changeDirPath);
const notDoneArtifacts = artifacts.filter((a) => a.status !== 'done');

if (notDoneArtifacts.length > 0) {
  console.error(`Cannot archive: artifacts not done: ${notDoneArtifacts.map(a => a.id).join(', ')}`);
  process.exit(1);
}
```

Explanation: `computeArtifactStatus()` 被 `change archive` 命令复用来判断变更是否满足归档条件。只有当返回数组中所有制品的 status 都为 `'done'` 时，变更才被允许归档。
