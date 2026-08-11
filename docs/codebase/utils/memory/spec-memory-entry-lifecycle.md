# Change Entry Lifecycle (createOrUpdateChange)

> Source files:
> - `src/utils/memory.ts` : 402-895

## Overview

本 Spec 记录 change entry 的完整生命周期管理逻辑，核心入口函数为 `createOrUpdateChange`。该函数是所有 change 创建和更新操作的唯一入口，被 `commands/change/new.ts`（新建 change）和 `commands/change/stage.ts`（阶段状态更新）广泛调用。

**职责定位**：作为 memory 系统中 change entry 的写入网关，`createOrUpdateChange` 负责：
- 判断 change 是否已存在：不存在则创建新 `ChangeEntry`，存在则更新 `description`/`updateAt`
- 将阶段更新数据（`StageUpdate`）委托给 `createOrUpdateStage` 进行分阶段合并
- 从文件系统同步进度信息（`features`/`todo`/`artifacts`），确保 JSON 记录与磁盘上的 `plan.json` 及产物文件保持一致
- 最终将完整数据写入全局 memory `changes.json`

**设计动机**：将 entry 的创建、更新、阶段合并、文件系统同步集中在一个函数中，确保每次写入都经过统一的校验和同步流程，避免数据不一致。

**使用场景**：
- `furina change new` 命令创建新 change 时
- `furina change stage` 命令更新各阶段状态时
- 任何需要写入 change entry 数据的场景

**内部辅助函数**：
- `buildArtifactsForEntry` — 扫描文件系统中的已知产物文件
- `syncEntryFeatures` — 从 `plan.json` 读取 features/todo 计数（轻量版，不更新 artifacts）
- `syncEntryProgress` — 从 `plan.json` 同步 features/todo 并扫描产物（完整版）
- `createOrUpdateStage` — 阶段合并调度器，按工作流顺序分派到各阶段 handler

## Architecture / Flow

```
createOrUpdateChange(cwd, changeName, desc?, changeStage?)
    |
    +-- ensureMemoryChangesJson(cwd)          // 确保 changes.json 存在并校验路径
    |
    +-- 查找现有 entry (data.changes.find)
    |
    +-- [存在] 更新 description + updateAt
    |    |
    |    +-- createOrUpdateStage(entry, changeStage?)   // 阶段合并（如提供）
    |    +-- syncEntryProgress(entry, cwd, changeName)  // 文件系统同步
    |
    +-- [不存在] 创建新 ChangeEntry（带默认值）
    |    |
    |    +-- createOrUpdateStage(entry, changeStage?)   // 阶段合并（如提供）
    |    +-- syncEntryProgress(entry, cwd, changeName)  // 文件系统同步
    |
    +-- writeMemoryChangesJson(cwd, data)               // 持久化写入

createOrUpdateStage(entry, changeStage)
    |
    +-- handleExploreStage()          // explore 阶段：特殊 done 路径保留已有字段
    +-- handleBrainstormStage()       // brainstorm：自动关闭 explore
    +-- handleProposeStage()          // propose：自动关闭 brainstorm
    +-- handlePlanStage()             // plan：自动关闭 propose
    +-- handleReviewArtifactsStage()  // reviewArtifacts：自动关闭 plan
    +-- handleCodingStage()           // subAgentDev：featureId 匹配 + title 匹配合并
    +-- handleFinalizeStage()         // finalize：integration 数组 + codecheck + archive

syncEntryProgress(entry, cwd, changeName)
    |
    +-- 读取 plan.json → 计算 features/todo
    +-- buildArtifactsForEntry(entryPath, changeName) → 扫描产物文件
```

## Functionality / Interface Details

### `createOrUpdateChange(cwd: string, changeName: string, desc?: string, changeStage?: StageUpdate) -> void`

**Source**: `src/utils/memory.ts`:856-895

**Functionality**: 全局 memory changes.json 中 change entry 的创建或更新入口。每次调用都会：1) 通过 `ensureMemoryChangesJson` 确保 changes.json 存在且路径已校验；2) 按 `changeName` 查找已有 entry；3) 更新或新建 entry 并合并阶段数据；4) 从文件系统同步进度；5) 持久化写入。

**Parameters**:
- `cwd` (`string`): 当前工作目录的绝对路径，用于定位 memory 目录和 change 文件。
- `changeName` (`string`): kebab-case 格式的 change 名称，同时用作目录名和查找键。
- `desc` (`string`, optional): change 的描述文本。更新已有 entry 时可传 `undefined`（仅更新阶段时）。
- `changeStage` (`StageUpdate`, optional): 阶段更新数据，包含需要合并的一个或多个阶段字段。

**Return Value**:
- `void`: 函数通过副作用（写入文件系统）完成工作，无返回值。

**Core Logic**:

1. 调用 `ensureMemoryChangesJson(cwd)` 获取或创建 changes.json 数据。
2. 使用 `data.changes.find(c => c.name === changeName)` 查找已有 entry。
3. **已有 entry 路径**：
   - 若 `desc` 不为 `undefined`，更新 `existing.description`。
   - 始终更新 `existing.updateAt` 为当前时间戳。
   - 若提供 `changeStage`，调用 `createOrUpdateStage(existing, changeStage)`。
   - 调用 `syncEntryProgress(existing, cwd, changeName)` 从磁盘同步。
4. **新建 entry 路径**：
   - 构造 `ChangeEntry` 对象，设置默认值：`status: 'active'`、`features: 0`、`todo: 0`、`artifacts: []`。
   - `path` 固定为 `furina/changes/${changeName}`。
   - 若提供 `changeStage`，调用 `createOrUpdateStage(newChange, changeStage)`。
   - 调用 `syncEntryProgress(newChange, cwd, changeName)` 从磁盘同步。
   - 将新 entry 推入 `data.changes` 数组。
5. 调用 `writeMemoryChangesJson(cwd, data)` 写入磁盘。

**Core Code**:
```typescript
export function createOrUpdateChange(
  cwd: string,
  changeName: string,
  desc?: string,
  changeStage?: StageUpdate,
): void {
  const data = ensureMemoryChangesJson(cwd);
  const existing = data.changes.find((c) => c.name === changeName);

  if (existing) {
    if (desc !== undefined) {
      existing.description = desc;
    }
    existing.updateAt = new Date().toISOString();
    if (changeStage) {
      createOrUpdateStage(existing, changeStage);
    }
    syncEntryProgress(existing, cwd, changeName);
  } else {
    const newChange: ChangeEntry = {
      name: changeName,
      path: `furina/changes/${changeName}`,
      description: desc ?? '',
      createdAt: new Date().toISOString(),
      updateAt: new Date().toISOString(),
      status: 'active',
      features: 0,
      todo: 0,
      artifacts: [],
    };
    if (changeStage) {
      createOrUpdateStage(newChange, changeStage);
    }
    syncEntryProgress(newChange, cwd, changeName);
    data.changes.push(newChange);
  }

  writeMemoryChangesJson(cwd, data);
}
```
Source: `src/utils/memory.ts`:856-895

**Usage Example**:
```typescript
// 创建新 change
createOrUpdateChange(process.cwd(), 'add-auth-module', '添加认证模块');

// 仅更新阶段（desc 传 undefined）
createOrUpdateChange(process.cwd(), 'add-auth-module', undefined, {
  explore: { title: '代码探索', status: 'done', outputPath: 'furina/changes/add-auth-module/exploration.md' }
});

// 更新描述和阶段
createOrUpdateChange(process.cwd(), 'add-auth-module', '更新后的描述', {
  propose: { title: '提案', status: 'in_progress' }
});
```
Explanation: 第一次调用创建新 entry；第二次仅更新阶段（`desc` 为 `undefined` 不会覆盖已有描述）；第三次同时更新描述和阶段。

---

### `createOrUpdateStage(entry: ChangeEntry, changeStage: StageUpdate) -> void`

**Source**: `src/utils/memory.ts`:821-843

**Functionality**: 阶段合并调度器。按工作流顺序（explore -> brainstorm -> propose -> plan -> reviewArtifacts -> subAgentDev/coding -> finalize）依次检查 `changeStage` 中是否有对应阶段数据，若有则分派到对应的阶段 handler 进行合并处理。这是唯一将 `StageUpdate` 宽松接口数据映射到具体 handler 的函数。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change entry 对象（直接修改）。
- `changeStage` (`StageUpdate`): 阶段更新数据，各字段均为可选。

**Return Value**:
- `void`: 直接修改传入的 `entry` 对象。

**Core Logic**:

按固定工作流顺序依次检查和分派，确保同一请求中的多阶段更新按正确的依赖顺序处理：
1. `explore` -> `handleExploreStage`
2. `brainstorm` -> `handleBrainstormStage`（自动关闭 explore）
3. `propose` -> `handleProposeStage`（自动关闭 brainstorm）
4. `plan` -> `handlePlanStage`（自动关闭 propose）
5. `reviewArtifacts` 或兼容别名 `review` -> `handleReviewArtifactsStage`
6. `subAgentDev` 或兼容别名 `coding` -> `handleCodingStage`
7. `finalize` -> `handleFinalizeStage`

兼容别名处理：`review` 作为 `reviewArtifacts` 的别名，`coding` 作为 `subAgentDev` 的别名，用于兼容不同调用方的命名习惯。

**Core Code**:
```typescript
export function createOrUpdateStage(entry: ChangeEntry, changeStage: StageUpdate): void {
  if (changeStage.explore) {
    handleExploreStage(entry, changeStage.explore);
  }
  if (changeStage.brainstorm) {
    handleBrainstormStage(entry, changeStage.brainstorm);
  }
  if (changeStage.propose) {
    handleProposeStage(entry, changeStage.propose);
  }
  if (changeStage.plan) {
    handlePlanStage(entry, changeStage.plan);
  }
  if (changeStage.reviewArtifacts || changeStage.review) {
    handleReviewArtifactsStage(entry, changeStage.reviewArtifacts ?? changeStage.review);
  }
  if (changeStage.subAgentDev || changeStage.coding) {
    handleCodingStage(entry, changeStage.subAgentDev ?? changeStage.coding);
  }
  if (changeStage.finalize) {
    handleFinalizeStage(entry, changeStage.finalize);
  }
}
```
Source: `src/utils/memory.ts`:821-843

**Usage Example**:
```typescript
// createOrUpdateStage 通常不直接调用，而是通过 createOrUpdateChange 间接调用
// 但也可以直接使用：
createOrUpdateStage(entry, {
  propose: { title: '提案', status: 'done', outputPath: 'furina/changes/my-change/proposal.md' },
  plan: { title: '任务规划', status: 'in_progress' }
});
```
Explanation: 同时更新 propose（完成）和 plan（进行中）两个阶段，propose 的 handler 会先被调用并关闭 brainstorm（如有），然后 plan 的 handler 会关闭 propose。

---

### `syncEntryProgress(entry: ChangeEntry, cwd: string, changeName: string) -> void`

**Source**: `src/utils/memory.ts`:451-469

**Functionality**: 从文件系统同步 change entry 的进度信息（`features`、`todo`、`artifacts`）。读取 `plan.json` 计算 features 总数和未完成数，并扫描 change 目录中的已知产物文件。不修改 `updateAt`，不写入磁盘（由调用方决定何时写入）。

**Parameters**:
- `entry` (`ChangeEntry`): 要同步进度的 change entry 对象（直接修改）。
- `cwd` (`string`): 当前工作目录绝对路径。
- `changeName` (`string`): change 名称，用于定位文件路径。

**Return Value**:
- `void`: 直接修改传入的 `entry` 对象的 `features`、`todo`、`artifacts` 字段。

**Core Logic**:

1. 拼接 entry 的完整路径：`path.join(cwd, 'furina', 'changes', changeName)`。
2. 检查 `plan.json` 是否存在：
   - 存在则解析 JSON，若为数组则设置 `features = plan.length`，`todo = plan.filter(f => f.status !== 'done').length`。
   - 解析失败时静默保留已有值。
3. 调用 `buildArtifactsForEntry(entryPath, changeName)` 扫描产物文件，将结果赋给 `entry.artifacts`。

**Core Code**:
```typescript
function syncEntryProgress(entry: ChangeEntry, cwd: string, changeName: string): void {
  const entryPath = path.join(cwd, 'furina', 'changes', changeName);
  const planPath = path.join(entryPath, 'plan.json');

  try {
    if (fs.existsSync(planPath)) {
      const raw = fs.readFileSync(planPath, 'utf-8');
      const plan = JSON.parse(raw);
      if (Array.isArray(plan)) {
        entry.features = plan.length;
        entry.todo = plan.filter((f: { status?: string }) => f.status !== 'done').length;
      }
    }
  } catch {
    // Keep existing values on parse failure
  }

  entry.artifacts = buildArtifactsForEntry(entryPath, changeName);
}
```
Source: `src/utils/memory.ts`:451-469

**Usage Example**:
```typescript
// syncEntryProgress 是内部函数，由 createOrUpdateChange 自动调用
// 调用后 entry 的进度字段会被更新：
// entry.features = 5   (plan.json 中有 5 个 feature)
// entry.todo = 2       (其中 2 个未完成)
// entry.artifacts = [{ id: 'proposal', outputPath: 'furina/changes/my-change/proposal.md' }, ...]
```
Explanation: 该函数被 `createOrUpdateChange` 在创建和更新路径中都会调用，确保每次写入时 progress 数据都是最新的。

---

### `syncEntryFeatures(entry: ChangeEntry, cwd: string) -> void`

**Source**: `src/utils/memory.ts`:425-441

**Functionality**: 轻量版的进度同步函数，仅从 `plan.json` 同步 `features` 和 `todo` 字段，不更新 `artifacts`，不修改 `updateAt`，不写入磁盘。用于 `ensureMemoryChangesJson` 在读取时批量同步所有 entry 的 feature 计数，避免扫描文件系统产物文件的开销。

**Parameters**:
- `entry` (`ChangeEntry`): 要同步的 change entry 对象（直接修改）。
- `cwd` (`string`): 当前工作目录绝对路径。

**Return Value**:
- `void`: 直接修改传入的 `entry` 对象的 `features` 和 `todo` 字段。

**Core Logic**:

1. 通过 `entry.path` 拼接 entry 的完整路径。
2. 检查 `plan.json` 是否存在并解析：
   - 若为数组：`features = plan.length`，`todo = plan.filter(f => f.status !== 'done').length`。
   - 解析失败时静默保留已有值。

与 `syncEntryProgress` 的区别：不调用 `buildArtifactsForEntry`，不覆盖 `artifacts` 字段。这使得它适用于高频的读取场景（`ensureMemoryChangesJson` 每次读取时都会调用）。

**Core Code**:
```typescript
function syncEntryFeatures(entry: ChangeEntry, cwd: string): void {
  const entryPath = path.join(cwd, entry.path);
  const planPath = path.join(entryPath, 'plan.json');

  try {
    if (fs.existsSync(planPath)) {
      const raw = fs.readFileSync(planPath, 'utf-8');
      const plan = JSON.parse(raw);
      if (Array.isArray(plan)) {
        entry.features = plan.length;
        entry.todo = plan.filter((f: { status?: string }) => f.status !== 'done').length;
      }
    }
  } catch {
    // Keep existing values on parse failure
  }
}
```
Source: `src/utils/memory.ts`:425-441

**Usage Example**:
```typescript
// syncEntryFeatures 是内部函数，在 ensureMemoryChangesJson 中被调用
// 对于每个非 removed 状态的 entry，都会同步 features/todo：
for (const entry of result.changes) {
  if (entry.status !== 'removed') {
    syncEntryFeatures(entry, cwd);
  }
}
```
Explanation: 轻量同步，仅更新计数字段。在 `ensureMemoryChangesJson` 读取 changes.json 时为每个活跃 entry 执行。

---

### `buildArtifactsForEntry(entryPath: string, changeName: string) -> Array<{ id: string; outputPath: string }>`

**Source**: `src/utils/memory.ts`:402-417

**Functionality**: 扫描 change 目录中的已知产物文件，返回存在的产物列表。产物类型是预定义的固定集合，通过检查文件/目录是否存在来确定。产物的 `outputPath` 使用相对路径格式（`furina/changes/{changeName}/...`），便于在 UI 和其他工具中引用。

**Parameters**:
- `entryPath` (`string`): change 目录的绝对路径。
- `changeName` (`string`): change 名称，用于构造 `outputPath`。

**Return Value**:
- `Array<{ id: string; outputPath: string }>`: 已存在的产物列表。每个元素包含：
  - `id` (`string`): 产物标识，如 `'proposal'`、`'design'`、`'specs'`、`'api'`、`'database'`、`'plan'`。
  - `outputPath` (`string`): 产物的相对路径。

**Core Logic**:

按固定顺序检查以下 6 种产物文件是否存在：
1. `proposal.md` -> `{ id: 'proposal', outputPath: 'furina/changes/{changeName}/proposal.md' }`
2. `design.md` -> `{ id: 'design', outputPath: 'furina/changes/{changeName}/design.md' }`
3. `specs/` 目录 -> `{ id: 'specs', outputPath: 'furina/changes/{changeName}/specs/**/*.md' }`（使用 glob 模式匹配目录下的所有 .md 文件）
4. `api.yaml` -> `{ id: 'api', outputPath: 'furina/changes/{changeName}/api.yaml' }`
5. `database.md` -> `{ id: 'database', outputPath: 'furina/changes/{changeName}/database.md' }`
6. `plan.json` -> `{ id: 'plan', outputPath: 'furina/changes/{changeName}/plan.json' }`

**Core Code**:
```typescript
function buildArtifactsForEntry(entryPath: string, changeName: string): Array<{ id: string; outputPath: string }> {
  const artifacts: Array<{ id: string; outputPath: string }> = [];
  if (fs.existsSync(path.join(entryPath, 'proposal.md'))) artifacts.push({ id: 'proposal', outputPath: `furina/changes/${changeName}/proposal.md` });
  if (fs.existsSync(path.join(entryPath, 'design.md'))) artifacts.push({ id: 'design', outputPath: `furina/changes/${changeName}/design.md` });
  if (fs.existsSync(path.join(entryPath, 'specs'))) artifacts.push({ id: 'specs', outputPath: `furina/changes/${changeName}/specs/**/*.md` });
  if (fs.existsSync(path.join(entryPath, 'api.yaml'))) artifacts.push({ id: 'api', outputPath: `furina/changes/${changeName}/api.yaml` });
  if (fs.existsSync(path.join(entryPath, 'database.md'))) artifacts.push({ id: 'database', outputPath: `furina/changes/${changeName}/database.md` });
  if (fs.existsSync(path.join(entryPath, 'plan.json'))) artifacts.push({ id: 'plan', outputPath: `furina/changes/${changeName}/plan.json` });
  return artifacts;
}
```
Source: `src/utils/memory.ts`:402-417

**Usage Example**:
```typescript
// 内部函数，由 syncEntryProgress 调用
const entryPath = '/home/user/project/furina/changes/my-change';
const artifacts = buildArtifactsForEntry(entryPath, 'my-change');
// 假设目录下有 proposal.md 和 plan.json：
// artifacts = [
//   { id: 'proposal', outputPath: 'furina/changes/my-change/proposal.md' },
//   { id: 'plan', outputPath: 'furina/changes/my-change/plan.json' }
// ]
```
Explanation: 通过 `fs.existsSync` 探测文件是否存在来决定产物列表，这是一种惰性扫描策略，避免了维护额外的产物注册表。

---

## Data Structures

### `StageUpdate`
```typescript
export interface StageUpdate {
  explore?: Partial<StageStep>;
  brainstorm?: Partial<StageStep>;
  propose?: Partial<StageStep>;
  plan?: Partial<StageStep>;
  reviewArtifacts?: Partial<StageStep>;
  subAgentDev?: unknown[];
  finalize?: { integration?: Partial<StageStep>[]; codecheck?: Partial<StageStep>; archive?: Partial<StageStep> };
  review?: Partial<StageStep>;    // reviewArtifacts 的别名
  coding?: unknown[];             // subAgentDev 的别名
}
```
- `explore` / `brainstorm` / `propose` / `plan` / `reviewArtifacts` (`Partial<StageStep>`): 线性阶段的更新数据。
- `subAgentDev` (`unknown[]`): coding 阶段的开发进度数据，按 featureId 分组。
- `finalize` (`{ integration, codecheck, archive }`): 收尾阶段，包含集成测试、代码检查和归档三个子阶段。
- `review` (`Partial<StageStep>`): `reviewArtifacts` 的兼容别名。
- `coding` (`unknown[]`): `subAgentDev` 的兼容别名。

### `ChangeEntry` (相关字段)
```typescript
{
  name: string;           // change 名称（kebab-case）
  path: string;           // 相对于 cwd 的路径，如 'furina/changes/{name}'
  description: string;    // change 描述
  createdAt: string;      // ISO 时间戳
  updateAt?: string;      // ISO 时间戳，最后更新时间
  status: 'active' | 'archived' | 'removed';
  features: number;       // plan.json 中的 feature 总数
  todo: number;           // plan.json 中未完成的 feature 数量
  artifacts: Array<{ id: string; outputPath: string }>;  // 已存在的产物列表
  stage?: ChangeStage;    // 可选的阶段数据
}
```

### `StageStep`
```typescript
{
  title: string;                                              // 步骤标题
  from: string;                                               // 开始时间 ISO 时间戳
  to: string;                                                 // 结束时间 ISO 时间戳
  status: 'in_progress' | 'skipped' | 'done';                // 步骤状态
  inputPath: string;                                          // 输入文件路径
  outputPath: string;                                         // 输出文件路径
}
```

## Error Handling and Edge Cases

1. **plan.json 不存在**：`syncEntryProgress` 和 `syncEntryFeatures` 均通过 `fs.existsSync` 检查，不存在时跳过读取，保留 entry 中已有值。
2. **plan.json 解析失败**：`try/catch` 静默捕获，保留已有 `features`/`todo` 值，不中断流程。
3. **plan.json 非数组格式**：通过 `Array.isArray(plan)` 检查，非数组时跳过更新。
4. **change 不存在时 desc 为 undefined**：新 entry 的 `description` 会使用 `desc ?? ''` 默认为空字符串。
5. **changeStage 为 undefined**：`createOrUpdateStage` 不会被调用，entry 仅更新 `description`/`updateAt` 和文件系统进度。
6. **StageUpdate 中使用别名字段**：`createOrUpdateStage` 同时检查 `review` 和 `reviewArtifacts`、`coding` 和 `subAgentDev`，别名优先级为：`reviewArtifacts` 优先于 `review`，`subAgentDev` 优先于 `coding`（通过 `??` 运算符）。
7. **产物目录完全为空**：`buildArtifactsForEntry` 返回空数组 `[]`。
8. **已关闭的前序阶段**：各 stage handler 通过 `closeIfInProgress` 自动将前序阶段的状态从 `in_progress` 设为 `done` 并记录 `to` 时间戳，确保工作流状态的连续性。

## Dependencies

- **Depends on**:
  - `ensureMemoryChangesJson`（spec-memory-changes-io.md）— 确保 changes.json 存在并校验路径。
  - `writeMemoryChangesJson`（spec-memory-changes-io.md）— 持久化写入 changes.json。
  - `closeIfInProgress`（spec-memory-stage-handlers.md）— 关闭进行中的步骤。
  - `handleExploreStage`、`handleBrainstormStage`、`handleProposeStage`、`handlePlanStage`、`handleReviewArtifactsStage`、`handleCodingStage`、`handleFinalizeStage`（spec-memory-stage-handlers.md）— 各阶段的合并处理逻辑。
  - Node.js `fs` / `path` 模块 — 文件系统操作。
- **Depended by**:
  - `commands/change/new.ts` — 新建 change 时调用 `createOrUpdateChange`。
  - `commands/change/stage.ts` — 更新各阶段状态时大量调用 `createOrUpdateChange`。
  - `ensureMemoryChangesJson`（spec-memory-changes-io.md）— 内部调用 `syncEntryFeatures` 同步计数。

## Usage Examples

### 完整场景：创建 change 并逐步推进阶段

```typescript
import { createOrUpdateChange } from './utils/memory.js';

const cwd = process.cwd();
const changeName = 'add-user-auth';

// Step 1: 创建新 change
createOrUpdateChange(cwd, changeName, '添加用户认证模块');
// changes.json 中新增 entry：{ name, path, description, status: 'active', features: 0, todo: 0, artifacts: [] }

// Step 2: 更新 explore 阶段为 in_progress
createOrUpdateChange(cwd, changeName, undefined, {
  explore: { title: '探索认证模块代码', status: 'in_progress' }
});

// Step 3: explore 完成，开始 brainstorm（explore 自动关闭为 done）
createOrUpdateChange(cwd, changeName, undefined, {
  explore: { status: 'done', outputPath: 'furina/changes/add-user-auth/exploration.md' },
  brainstorm: { title: '头脑风暴认证方案', status: 'in_progress' }
});

// Step 4: 经过 propose/plan 阶段后进入 coding 阶段
createOrUpdateChange(cwd, changeName, undefined, {
  subAgentDev: [
    {
      featureId: 'auth-middleware',
      progress: [{ title: '实现 JWT 中间件', status: 'in_progress' }]
    }
  ]
});

// Step 5: 最终阶段 — finalize
createOrUpdateChange(cwd, changeName, undefined, {
  finalize: {
    integration: [{ title: '集成测试', status: 'in_progress' }],
  }
});
```

Explanation: 展示了从创建 change 到逐步推进各阶段的完整生命周期。每次调用 `createOrUpdateChange` 时，内部都会自动同步文件系统进度（plan.json 计数和产物扫描），确保 `features`/`todo`/`artifacts` 字段始终反映磁盘上的实际状态。各阶段 handler 会自动关闭前序阶段，维护工作流的正确顺序。
