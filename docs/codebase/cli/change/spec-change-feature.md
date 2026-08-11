# Feature Lifecycle Management (spec-change-feature)

> Source files:
> - `src/commands/change/feature.ts` : 1-418
> - `src/commands/change/shared.ts` : 1-315
> - `src/server/memory/sync-design.ts` : 1-80

## Overview

本 spec 覆盖 Furina CLI 中 `change feature` 子命令的功能生命周期管理模块。该模块负责对单个 change 的 `plan.json` 文件中的 feature 条目进行状态查询与状态流转操作，是 change 工作流中任务编排与进度追踪的核心组件。

**在系统中的定位**：`change feature` 命令位于 CLI 命令层，是 `change` 命令组的子命令。它向上对接 Commander.js 的命令注册（通过 `index.ts`），向下操作 `furina/changes/<changeName>/plan.json` 文件中的 feature 数据，并在 `status` 子命令中触发 `syncDesignToMemory` 将设计文档同步至全局内存。

**设计动机**：Furina 采用 plan.json 作为变更计划的持久化存储，每个 plan.json 包含一个 feature 数组，每个 feature 具有 `pending` -> `in_progress` -> `done` 的生命周期。该模块提供了管理此生命周期的全套操作，并支持 feature 之间的依赖关系校验和循环依赖检测，确保任务按照依赖拓扑正确执行。

**使用场景**：
- 开发者通过 `furina change feature <changeName> --status` 查看整体进度
- 开发者通过 `furina change feature <changeName> --next` 获取下一个应处理的 feature
- 开发者通过 `furina change feature <changeName> --start <featureId>` 开始一个 pending 状态的 feature
- 开发者通过 `furina change feature <changeName> --complete <featureId>` 完成一个 in_progress 状态的 feature
- CI/Agent 工作流中通过 `next` 命令自动获取下一个可执行任务

**涉及的源文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/commands/change/feature.ts` | 核心实现：Feature 接口定义、plan.json 读写、依赖检测、循环依赖检测、四个子命令的执行逻辑 |
| `src/commands/change/shared.ts` | 提供 `CHANGES_DIR` 路径常量、`validateChangeName` 名称校验函数 |
| `src/commands/change/index.ts` | 命令注册层：将 feature 子命令通过 Commander.js 注册到 CLI |
| `src/server/memory/sync-design.ts` | 设计文档同步：`runFeatureStatus` 执行时触发 `syncDesignToMemory` 将 design.md 同步至全局内存 |

## Architecture / Flow

### Feature 状态机

```
pending  ──start──>  in_progress  ──complete──>  done
  │
  │ (can also be)
  └──────────────────>  skipped
```

**状态转换规则**：
- `pending` -> `in_progress`：通过 `runFeatureStart` 触发，要求所有依赖项为 `done` 或 `skipped`
- `in_progress` -> `done`：通过 `runFeatureComplete` 触发，仅要求当前状态为 `in_progress`
- `pending` -> `skipped`：不在此模块管理范围内（由外部工具/手动修改 plan.json）

### 命令执行流程

```
CLI (index.ts)
  └── feature <changeName> [options]
        ├── --status          -> runFeatureStatus()
        │     ├── requireValidChangeName()
        │     ├── syncDesignToMemory()   ← 额外副作用
        │     ├── loadPlan()
        │     ├── 遍历统计各状态计数
        │     └── 输出摘要
        ├── --next            -> runFeatureNext()
        │     ├── requireValidChangeName()
        │     ├── loadPlan()
        │     ├── detectCycles()         ← DFS 循环检测
        │     ├── getNextFeature()
        │     └── printFeatureDetails()
        ├── --start <id>      -> runFeatureStart()
        │     ├── requireValidChangeName()
        │     ├── loadPlan()
        │     ├── 校验 pending + 依赖满足
        │     └── savePlan()
        └── --complete <id>   -> runFeatureComplete()
              ├── requireValidChangeName()
              ├── loadPlan()
              ├── 校验 in_progress
              └── savePlan()
```

### 循环依赖检测算法

`detectCycles` 使用经典的 DFS + 递归栈（recursion stack）方法检测有向图中的环：

1. 构建邻接表：`adj[feature.id] = feature.dependencies`
2. 对每个未访问节点执行 DFS：
   - 将节点加入 `visited` 和 `recStack`
   - 遍历邻居：若邻居在 `recStack` 中则发现环，从路径中截取环路径
   - 递归完成后从 `recStack` 和 `path` 中移除节点
3. 返回所有发现的环的描述字符串

### 下一个 Feature 选择策略（getNextFeature）

```
优先级 1: 查找 status === 'in_progress' 的 feature → 返回第一个
优先级 2: 查找 status === 'pending' 且依赖满足的 feature → 返回第一个
否则:     返回 undefined
```

## Functionality / Interface Details

### `requireValidChangeName(changeName: string): void`

**Source**: `src/commands/change/feature.ts`:33-39

**Functionality**: 校验 change 名称是否符合 kebab-case 规范。若不符合，向 stderr 输出错误信息并调用 `process.exit(1)` 终止进程。这是所有 feature 子命令的入口守卫，确保下游操作使用合法的路径名。

**Parameters**:
- `changeName` (`string`): 待校验的 change 名称

**Return Value**:
- `void`：校验失败时直接退出进程，不会返回

**Core Logic**:
委托 `shared.ts` 中的 `validateChangeName` 函数执行正则匹配 `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`。校验失败时通过 `process.stderr.write` 输出错误，并调用 `process.exit(1)` 确保命令不会在无效状态下继续执行。

**Core Code**:
```typescript
function requireValidChangeName(changeName: string): void {
  const result = validateChangeName(changeName);
  if (!result.valid) {
    process.stderr.write(`Error: ${result.error}\n`);
    process.exit(1);
  }
}
```
Source: `src/commands/change/feature.ts`:33-39

**Usage Example**:
```typescript
requireValidChangeName('my-feature');  // 正常通过
requireValidChangeName('Invalid_Name'); // 输出错误并退出进程
```
Explanation: 内部辅助函数，所有四个导出的 `run*` 函数在入口处调用。

---

### `loadPlan(planPath: string): Feature[]`

**Source**: `src/commands/change/feature.ts`:46-59

**Functionality**: 从磁盘加载 plan.json 文件并解析为 Feature 数组。该函数是所有 feature 操作的数据入口，处理文件不存在和 JSON 解析异常等边界情况，确保调用方始终获得合法的数组（可能为空）。

**Parameters**:
- `planPath` (`string`): plan.json 的绝对路径

**Return Value**:
- `Feature[]`: 解析后的 Feature 对象数组。文件不存在时返回空数组 `[]`；JSON 解析失败或数据不是数组时也返回 `[]`。

**Core Logic**:
1. 使用 `fs.existsSync` 检查文件是否存在，不存在则返回空数组
2. 使用 `fs.readFileSync` 同步读取文件内容
3. 使用 `JSON.parse` 解析后验证是否为数组
4. 任何异常被 catch 捕获后通过 `logger.error` 记录日志并返回空数组

**Core Code**:
```typescript
function loadPlan(planPath: string): Feature[] {
  if (!fs.existsSync(planPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data as Feature[];
  } catch (err) {
    logger.error(`Failed to load plan from ${planPath}: ${String(err)}`);
    return [];
  }
}
```
Source: `src/commands/change/feature.ts`:46-59

**Usage Example**:
```typescript
const planPath = path.join(CHANGES_DIR, 'my-change', 'plan.json');
const features = loadPlan(planPath);
console.log(`Loaded ${features.length} features`);
```
Explanation: 从 `furina/changes/my-change/plan.json` 加载 feature 数组。

---

### `savePlan(planPath: string, features: Feature[]): void`

**Source**: `src/commands/change/feature.ts`:66-74

**Functionality**: 将 Feature 数组序列化为 JSON 并写入 plan.json 文件。采用 2 空格缩进格式化。在写入前自动创建父目录（如果不存在）。

**Parameters**:
- `planPath` (`string`): plan.json 的绝对路径
- `features` (`Feature[]`): 待保存的 Feature 对象数组

**Return Value**:
- `void`

**Core Logic**:
1. 使用 `path.dirname` 获取父目录路径
2. 若父目录不存在，使用 `fs.mkdirSync({ recursive: true })` 递归创建
3. 使用 `JSON.stringify(features, null, 2)` 格式化为 2 空格缩进的 JSON
4. 使用 `fs.writeFileSync` 写入文件
5. 通过 `logger.info` 记录相对路径的日志

**Core Code**:
```typescript
function savePlan(planPath: string, features: Feature[]): void {
  const dir = path.dirname(planPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = JSON.stringify(features, null, 2);
  fs.writeFileSync(planPath, content, 'utf-8');
  logger.info(`Saved plan to ${path.relative(process.cwd(), planPath)}`);
}
```
Source: `src/commands/change/feature.ts`:66-74

**Usage Example**:
```typescript
feature.status = 'in_progress';
savePlan(planPath, features);
// plan.json 已更新，格式为 2 空格缩进的 JSON
```
Explanation: 修改 feature 状态后调用 `savePlan` 将变更持久化到磁盘。

---

### `getFeatureById(features: Feature[], id: string): Feature | undefined`

**Source**: `src/commands/change/feature.ts`:82-84

**Functionality**: 在 Feature 数组中按 `id` 字段查找指定的 feature 对象。这是一个简单的查找辅助函数，被 `runFeatureStart`、`runFeatureComplete` 等函数使用来定位目标 feature。

**Parameters**:
- `features` (`Feature[]`): Feature 对象数组
- `id` (`string`): 要查找的 feature ID

**Return Value**:
- `Feature | undefined`: 找到时返回 Feature 对象，未找到返回 `undefined`

**Core Code**:
```typescript
function getFeatureById(features: Feature[], id: string): Feature | undefined {
  return features.find((f) => f.id === id);
}
```
Source: `src/commands/change/feature.ts`:82-84

**Usage Example**:
```typescript
const feature = getFeatureById(features, 'auth-module');
if (!feature) {
  console.error('Feature not found');
}
```
Explanation: 按 ID 精确匹配 feature，用于 start/complete 操作的前置查找。

---

### `getDependenciesSatisfied(feature: Feature, features: Feature[]): boolean`

**Source**: `src/commands/change/feature.ts`:92-99

**Functionality**: 检查一个 feature 的所有依赖项是否已满足（状态为 `done` 或 `skipped`）。这是 feature 状态转换的核心约束检查函数，确保有向无环图（DAG）中的执行顺序被正确遵守。

**Parameters**:
- `feature` (`Feature`): 待检查的 feature 对象
- `features` (`Feature[]`): 全部 feature 数组，用于按 ID 查找依赖项

**Return Value**:
- `boolean`:
  - `true`：所有依赖项状态为 `done` 或 `skipped`，或该 feature 无依赖
  - `false`：存在未满足的依赖（依赖未找到或状态非 `done`/`skipped`）

**Core Logic**:
1. 若 feature 无 `dependencies` 字段或依赖数组为空，直接返回 `true`
2. 使用 `Array.every` 遍历每个依赖 ID：
   - 通过 `getFeatureById` 查找依赖 feature 对象
   - 若依赖 feature 不存在，返回 `false`
   - 若依赖 feature 状态为 `done` 或 `skipped`，该依赖满足
3. 所有依赖均满足时返回 `true`

**Core Code**:
```typescript
function getDependenciesSatisfied(feature: Feature, features: Feature[]): boolean {
  if (!feature.dependencies || feature.dependencies.length === 0) return true;
  return feature.dependencies.every((depId) => {
    const dep = getFeatureById(features, depId);
    if (!dep) return false;
    return dep.status === 'done' || dep.status === 'skipped';
  });
}
```
Source: `src/commands/change/feature.ts`:92-99

**Usage Example**:
```typescript
const features = loadPlan(planPath);
const feature = features[0];
if (getDependenciesSatisfied(feature, features)) {
  console.log('Feature is ready to start');
} else {
  console.log('Feature has unmet dependencies');
}
```
Explanation: 在启动 feature 前检查其依赖是否全部完成。

---

### `detectCycles(features: Feature[]): string[]`

**Source**: `src/commands/change/feature.ts`:106-145

**Functionality**: 使用 DFS（深度优先搜索）检测 feature 依赖关系图中的循环依赖。当 feature 之间形成环形依赖链时（如 A -> B -> C -> A），任务将永远无法满足前置条件。该函数通过构建邻接表和递归栈来检测所有环，并提取完整的环路径用于错误报告。

**Parameters**:
- `features` (`Feature[]`): 全部 feature 数组

**Return Value**:
- `string[]`: 循环依赖的描述字符串数组。每个字符串格式为 `"A -> B -> C -> A"`，清晰展示环路径。若无循环依赖，返回空数组 `[]`。

**Core Logic**:
1. **构建邻接表**：遍历 features，建立 `adj[feature.id] = feature.dependencies` 映射
2. **DFS 遍历**：使用三个数据结构：
   - `visited` (`Set<string>`): 记录所有已访问节点，避免重复遍历
   - `recStack` (`Set<string>`): 记录当前递归路径上的节点，用于检测回边
   - `path` (`string[]`): 记录当前 DFS 路径，用于提取环的完整路径
3. **环检测**：在遍历邻居节点时，若邻居已在 `recStack` 中（即在当前递归路径上），说明存在环。从 `path` 中找到环起点的位置，截取环路径并闭合
4. **清理**：递归完成后将节点从 `recStack` 和 `path` 中移除
5. **遍历所有节点**：确保检测到所有连通分量中的环

**Core Code**:
```typescript
function detectCycles(features: Feature[]): string[] {
  const adj: Record<string, string[]> = {};
  for (const f of features) {
    adj[f.id] = f.dependencies || [];
  }

  const cycles: string[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    for (const neighbor of (adj[node] || [])) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        const cyclePath = path.slice(cycleStart);
        cyclePath.push(neighbor);
        cycles.push(cyclePath.join(' -> '));
      }
    }

    path.pop();
    recStack.delete(node);
  }

  for (const f of features) {
    if (!visited.has(f.id)) {
      dfs(f.id);
    }
  }

  return cycles;
}
```
Source: `src/commands/change/feature.ts`:106-145

**Usage Example**:
```typescript
const features = loadPlan(planPath);
const cycles = detectCycles(features);
if (cycles.length > 0) {
  console.error('Circular dependencies detected:');
  for (const cycle of cycles) {
    console.error(`  ${cycle}`);
    // 输出示例: "auth -> user-model -> auth"
  }
  process.exit(1);
}
```
Explanation: 在执行 `next` 命令前检测循环依赖，若发现环则报告并终止。

---

### `getNextFeature(features: Feature[]): Feature | undefined`

**Source**: `src/commands/change/feature.ts`:153-165

**Functionality**: 查找下一个应当执行的 feature。采用优先级策略：优先返回已在进行中的 feature，其次返回第一个依赖已满足的 pending feature。该函数是 `runFeatureNext` 的核心调度逻辑。

**Parameters**:
- `features` (`Feature[]`): 全部 feature 数组

**Return Value**:
- `Feature | undefined`:
  - 返回应当处理的下一个 feature
  - 无可用 feature 时返回 `undefined`（可能所有 pending feature 依赖未满足，或所有 feature 已完成）

**Core Logic**:
1. **优先级 1**：使用 `Array.find` 查找 `status === 'in_progress'` 的 feature。若存在，说明有正在进行的任务，应继续完成它
2. **优先级 2**：使用 `Array.find` 查找 `status === 'pending'` 且 `getDependenciesSatisfied` 返回 `true` 的 feature。返回第一个满足条件的（即依赖拓扑序中最靠前的）
3. 两者都未找到时返回 `undefined`

**Core Code**:
```typescript
function getNextFeature(features: Feature[]): Feature | undefined {
  // Priority 1: in_progress feature
  const inProgress = features.find((f) => f.status === 'in_progress');
  if (inProgress) return inProgress;

  // Priority 2: first pending with satisfied deps
  const nextPending = features.find(
    (f) => f.status === 'pending' && getDependenciesSatisfied(f, features),
  );
  if (nextPending) return nextPending;

  return undefined;
}
```
Source: `src/commands/change/feature.ts`:153-165

**Usage Example**:
```typescript
const features = loadPlan(planPath);
const next = getNextFeature(features);
if (next) {
  console.log(`Next feature: ${next.id} (${next.function})`);
} else {
  console.log('No actionable features available');
}
```
Explanation: 获取下一个应当执行的 feature，用于 `next` 命令和自动化工作流调度。

---

### `printFeatureDetails(feature: Feature): void`

**Source**: `src/commands/change/feature.ts`:172-209

**Functionality**: 将 feature 的完整详情格式化输出到 stdout。输出内容包括 ID、类别、功能名称、描述、验收标准、任务列表、依赖项、spec 引用和涉及文件。输出格式与 Python 版 `feature-manager.py` 的 `cmd_next` 输出保持一致。

**Parameters**:
- `feature` (`Feature`): 待输出的 feature 对象

**Return Value**:
- `void`

**Core Logic**:
1. 首先输出 feature 的核心信息（id, category, function, description）
2. 输出验收标准列表（带编号）
3. 仅在相关字段存在且非空时输出 tasks、dependencies、spec_refs、files

**Core Code**:
```typescript
function printFeatureDetails(feature: Feature): void {
  process.stdout.write(`Next feature id: ${feature.id}\n`);
  process.stdout.write(`  Category: ${feature.category}\n`);
  process.stdout.write(`  Function: ${feature.function}\n`);
  process.stdout.write(`  Description: ${feature.description}\n`);

  process.stdout.write(`\nAcceptance Criteria:\n`);
  if (feature.acceptance_criteria && feature.acceptance_criteria.length > 0) {
    feature.acceptance_criteria.forEach((ac, i) => {
      process.stdout.write(`  ${i + 1}. ${ac}\n`);
    });
  }

  if (feature.tasks && feature.tasks.length > 0) {
    process.stdout.write(`\nTasks:\n`);
    feature.tasks.forEach((t) => {
      process.stdout.write(`  - ${t}\n`);
    });
  }

  if (feature.dependencies && feature.dependencies.length > 0) {
    process.stdout.write(`\nDependencies: ${feature.dependencies.join(', ')}\n`);
  }

  if (feature.spec_refs && feature.spec_refs.length > 0) {
    process.stdout.write(`\nSpec Refs:\n`);
    for (const ref of feature.spec_refs) {
      process.stdout.write(`  - ${ref}\n`);
    }
  }

  if (feature.files && feature.files.length > 0) {
    process.stdout.write(`\nFiles:\n`);
    for (const file of feature.files) {
      process.stdout.write(`  - ${file}\n`);
    }
  }
}
```
Source: `src/commands/change/feature.ts`:172-209

**Usage Example**:
```typescript
const next = getNextFeature(features);
if (next) printFeatureDetails(next);
// 输出:
// Next feature id: auth-module
//   Category: backend
//   Function: Authentication
//   Description: Implement JWT authentication
//
// Acceptance Criteria:
//   1. User can login with email/password
//   2. JWT token is issued on successful login
//
// Dependencies: user-model
```
Explanation: 格式化输出 feature 的完整信息，供开发者或 Agent 了解任务详情。

---

### `runFeatureStatus(changeName: string, cwd?: string): void`

**Source**: `src/commands/change/feature.ts`:219-280

**Functionality**: 执行 `feature --status` 子命令，展示指定 change 的 feature 状态摘要。统计各状态（done, in_progress, pending, blocked, skipped）的计数，计算完成进度百分比，并列出当前正在进行的 feature。此命令还具有副作用：在执行时触发 `syncDesignToMemory` 将 design.md 同步至全局内存。

`blocked` 的定义是一个与 `pending` 互斥的子分类：如果一个 pending feature 的依赖未满足，它被计为 `blocked` 而非 `pending`。

**Parameters**:
- `changeName` (`string`): kebab-case 格式的 change 名称
- `cwd` (`string`, optional, default: `process.cwd()`): 工作目录路径，用于计算 `CHANGES_DIR` 路径和传递给 `syncDesignToMemory`

**Return Value**:
- `void`

**Error Handling**:
- change 名称不符合 kebab-case 规范 -> `process.exit(1)`
- plan.json 不存在且 features 为空 -> `process.exit(1)`
- plan.json 存在但为空数组 -> 输出提示信息并正常返回

**Core Logic**:
1. 调用 `requireValidChangeName` 校验名称
2. 调用 `syncDesignToMemory(changeName, cwd)` 同步设计文档（副作用）
3. 加载 plan.json 并检查边界条件
4. 遍历 features，按状态分类计数：
   - `done` -> done 计数
   - `in_progress` -> inProgress 计数 + 加入 inProgressFeatures 列表
   - `pending` -> pending 计数，若依赖未满足则额外计入 blocked
   - `skipped` -> skipped 计数
5. 计算进度百分比：`(done / total) * 100`
6. 输出格式化摘要

**Core Code**:
```typescript
export function runFeatureStatus(changeName: string, cwd: string = process.cwd()): void {
  requireValidChangeName(changeName);
  syncDesignToMemory(changeName, cwd);

  const planPath = path.join(CHANGES_DIR, changeName, 'plan.json');
  const features = loadPlan(planPath);

  if (features.length === 0 && !fs.existsSync(planPath)) {
    process.stderr.write(`Error: No plan.json found for change '${changeName}'\n`);
    process.exit(1);
  }

  if (features.length === 0) {
    process.stdout.write(`No features found in plan.json for change '${changeName}'\n`);
    return;
  }

  const total = features.length;
  let done = 0, inProgress = 0, pending = 0, blocked = 0, skipped = 0;
  const inProgressFeatures: Feature[] = [];

  for (const f of features) {
    if (f.status === 'done') {
      done++;
    } else if (f.status === 'in_progress') {
      inProgress++;
      inProgressFeatures.push(f);
    } else if (f.status === 'pending') {
      pending++;
      if (!getDependenciesSatisfied(f, features)) {
        blocked++;
      }
    } else if (f.status === 'skipped') {
      skipped++;
    }
  }

  const progress = total > 0 ? (done / total) * 100 : 0;
  // ... output formatting
}
```
Source: `src/commands/change/feature.ts`:219-280

**Usage Example**:
```bash
furina change feature my-feature --status
```
输出示例：
```
Feature List Status: /project/furina/changes/my-feature/plan.json
  Total: 5
  Done: 2
  In Progress: 1
  Pending: 2
  Blocked: 1
  Skipped: 0
Currently in progress:
  - auth-module: Authentication
Progress: 40.0%
```
Explanation: 展示 feature 进度概览，`blocked` 显示依赖未满足的 pending feature 数量。

---

### `runFeatureNext(changeName: string): void`

**Source**: `src/commands/change/feature.ts`:288-326

**Functionality**: 执行 `feature --next` 子命令，查找并输出下一个可操作的 feature。在查找前先执行循环依赖检测，若发现循环依赖则报错退出。该命令是 Agent 自动化工作流的核心接口，用于获取"接下来应当做什么"。

**Parameters**:
- `changeName` (`string`): kebab-case 格式的 change 名称

**Return Value**:
- `void`

**Error Handling**:
- change 名称不符合 kebab-case 规范 -> `process.exit(1)`
- 发现循环依赖 -> 输出所有环路径到 stderr，`process.exit(1)`
- plan.json 不存在 -> 输出提示信息并正常返回（非错误退出）

**Core Logic**:
1. 校验 change 名称，加载 plan.json
2. 调用 `detectCycles(features)` 检测循环依赖，发现环时输出到 stderr 并退出
3. 调用 `getNextFeature(features)` 获取下一个 feature
4. 若无可用 feature：
   - 若仍有未完成（非 done/skipped）的 feature -> 提示"所有 pending feature 依赖未满足"
   - 否则 -> 提示"所有 feature 已完成"
5. 找到 feature 时调用 `printFeatureDetails` 输出详情

**Core Code**:
```typescript
export function runFeatureNext(changeName: string): void {
  requireValidChangeName(changeName);

  const planPath = path.join(CHANGES_DIR, changeName, 'plan.json');
  const features = loadPlan(planPath);

  if (features.length === 0 && !fs.existsSync(planPath)) {
    process.stdout.write(`No plan.json found for change '${changeName}'\n`);
    return;
  }

  if (features.length === 0) {
    process.stdout.write('No features found in plan.json\n');
    return;
  }

  const cycles = detectCycles(features);
  if (cycles.length > 0) {
    process.stderr.write(`Circular dependencies detected:\n`);
    for (const cycle of cycles) {
      process.stderr.write(`  ${cycle}\n`);
    }
    process.exit(1);
  }

  const next = getNextFeature(features);
  if (!next) {
    const remaining = features.filter((f) => f.status !== 'done' && f.status !== 'skipped').length;
    if (remaining > 0) {
      process.stdout.write(`No more features to work on (all pending features have unmet dependencies)\n`);
    } else {
      process.stdout.write('All features completed!\n');
    }
    return;
  }

  printFeatureDetails(next);
}
```
Source: `src/commands/change/feature.ts`:288-326

**Usage Example**:
```bash
furina change feature my-feature --next
```
输出示例：
```
Next feature id: auth-module
  Category: backend
  Function: Authentication
  Description: Implement JWT authentication

Acceptance Criteria:
  1. User can login with email/password
  2. JWT token is issued on successful login

Tasks:
  - Create auth controller
  - Implement JWT service

Dependencies: user-model

Spec Refs:
  - spec-auth.md

Files:
  - src/auth/controller.ts
  - src/auth/jwt.service.ts
```
Explanation: 获取下一个应执行的 feature 及其完整上下文信息。

---

### `runFeatureStart(changeName: string, featureId: string): void`

**Source**: `src/commands/change/feature.ts`:335-371

**Functionality**: 执行 `feature --start <featureId>` 子命令，将指定 feature 的状态从 `pending` 流转为 `in_progress`。执行前进行多重校验：feature 必须存在、状态必须为 `pending`、所有依赖必须已满足。这是状态机的第一步转换。

**Parameters**:
- `changeName` (`string`): kebab-case 格式的 change 名称
- `featureId` (`string`): 要启动的 feature ID

**Return Value**:
- `void`

**Error Handling**:
- plan.json 不存在 -> `process.exit(1)`
- feature 不存在 -> `process.exit(1)`
- feature 已经是 `in_progress` -> 输出提示信息，正常返回（幂等性，非错误）
- feature 状态不是 `pending`（如 `done`）-> `process.exit(1)`
- 依赖未满足 -> `process.exit(1)`

**Core Logic**:
1. 校验 change 名称
2. 检查 plan.json 是否存在
3. 加载 plan 并按 ID 查找 feature
4. 按优先级校验：已 in_progress -> 幂等返回；非 pending -> 报错退出；依赖未满足 -> 报错退出
5. 设置 `feature.status = 'in_progress'`
6. 调用 `savePlan` 持久化

**Core Code**:
```typescript
export function runFeatureStart(changeName: string, featureId: string): void {
  requireValidChangeName(changeName);

  const planPath = path.join(CHANGES_DIR, changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    process.stderr.write(`Error: No plan.json found for change '${changeName}'\n`);
    process.exit(1);
  }

  const features = loadPlan(planPath);
  const feature = getFeatureById(features, featureId);

  if (!feature) {
    process.stderr.write(`Error: Feature '${featureId}' not found\n`);
    process.exit(1);
  }

  if (feature.status === 'in_progress') {
    process.stdout.write(`Feature '${featureId}' is already in progress\n`);
    return;
  }

  if (feature.status !== 'pending') {
    process.stderr.write(`Error: Feature '${featureId}' is not pending (current: ${feature.status})\n`);
    process.exit(1);
  }

  if (!getDependenciesSatisfied(feature, features)) {
    process.stderr.write(`Error: Feature '${featureId}' has unmet dependencies\n`);
    process.exit(1);
  }

  feature.status = 'in_progress';
  savePlan(planPath, features);
  process.stdout.write(`Started feature: ${featureId}\n`);
  logger.info(`Feature '${featureId}' started in change '${changeName}'`);
}
```
Source: `src/commands/change/feature.ts`:335-371

**Usage Example**:
```bash
furina change feature my-feature --start auth-module
```
输出：`Started feature: auth-module`

调用后 `auth-module` 的 status 在 plan.json 中变为 `in_progress`。

---

### `runFeatureComplete(changeName: string, featureId: string): void`

**Source**: `src/commands/change/feature.ts`:380-406

**Functionality**: 执行 `feature --complete <featureId>` 子命令，将指定 feature 的状态从 `in_progress` 流转为 `done`。这是状态机的第二步转换。完成 feature 后，其依赖者（其他 feature 的 dependencies 中引用该 ID 的）将自动变为可执行状态。

**Parameters**:
- `changeName` (`string`): kebab-case 格式的 change 名称
- `featureId` (`string`): 要完成的 feature ID

**Return Value**:
- `void`

**Error Handling**:
- plan.json 不存在 -> `process.exit(1)`
- feature 不存在 -> `process.exit(1)`
- feature 状态不是 `in_progress` -> `process.exit(1)`

**Core Logic**:
1. 校验 change 名称
2. 检查 plan.json 是否存在
3. 加载 plan 并按 ID 查找 feature
4. 校验 feature 状态必须为 `in_progress`
5. 设置 `feature.status = 'done'`
6. 调用 `savePlan` 持久化

**Core Code**:
```typescript
export function runFeatureComplete(changeName: string, featureId: string): void {
  requireValidChangeName(changeName);

  const planPath = path.join(CHANGES_DIR, changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    process.stderr.write(`Error: No plan.json found for change '${changeName}'\n`);
    process.exit(1);
  }

  const features = loadPlan(planPath);
  const feature = getFeatureById(features, featureId);

  if (!feature) {
    process.stderr.write(`Error: Feature '${featureId}' not found\n`);
    process.exit(1);
  }

  if (feature.status !== 'in_progress') {
    process.stderr.write(`Error: Feature '${featureId}' is not in_progress (current: ${feature.status})\n`);
    process.exit(1);
  }

  feature.status = 'done';
  savePlan(planPath, features);
  process.stdout.write(`Completed feature: ${featureId}\n`);
  logger.info(`Feature '${featureId}' completed in change '${changeName}'`);
}
```
Source: `src/commands/change/feature.ts`:380-406

**Usage Example**:
```bash
furina change feature my-feature --complete auth-module
```
输出：`Completed feature: auth-module`

调用后 `auth-module` 的 status 在 plan.json 中变为 `done`，依赖它的其他 feature 现在可能变为可执行。

## Data Structures

### `Feature`
```typescript
interface Feature {
  id: string;
  status: string;
  category?: string;
  function?: string;
  description?: string;
  acceptance_criteria?: string[];
  tasks?: string[];
  files?: string[];
  dependencies?: string[];
  spec_refs?: string[];
}
```
- `id` (`string`, 必填): Feature 的唯一标识符，用于依赖引用和命令行操作
- `status` (`string`, 必填): 当前状态，有效值为 `'pending'`、`'in_progress'`、`'done'`、`'skipped'`
- `category` (`string`, 可选): 功能分类，如 `'backend'`、`'frontend'`、`'infra'`
- `function` (`string`, 可选): 功能名称的简短描述
- `description` (`string`, 可选): 功能的详细描述
- `acceptance_criteria` (`string[]`, 可选): 验收标准列表，用于判断 feature 是否可被标记为完成
- `tasks` (`string[]`, 可选): 实现该 feature 需要完成的具体任务列表
- `files` (`string[]`, 可选): 该 feature 涉及的源文件路径列表
- `dependencies` (`string[]`, 可选): 依赖的其他 feature ID 列表，所有依赖必须为 `done` 或 `skipped` 才能启动
- `spec_refs` (`string[]`, 可选): 关联的 spec 文档引用路径列表

### 状态常量
feature 状态虽为字符串类型，但遵循以下约定：

| 状态值 | 含义 | 允许的转换目标 |
|--------|------|---------------|
| `pending` | 等待执行 | `in_progress`, `skipped` |
| `in_progress` | 正在执行 | `done` |
| `done` | 已完成 | 无（终态） |
| `skipped` | 已跳过 | 无（终态） |

## Error Handling and Edge Cases

### 错误处理策略

该模块采用 **fail-fast** 策略：遇到不可恢复的错误时向 stderr 输出错误信息并调用 `process.exit(1)` 立即终止进程。可恢复的边界情况（如 feature 已经 in_progress）则输出提示信息并正常返回。

| 场景 | 处理方式 |
|------|---------|
| change 名称不符合 kebab-case | stderr 输出错误 + `process.exit(1)` |
| plan.json 不存在 | `status`/`start`/`complete` -> `process.exit(1)`；`next` -> 输出提示并返回 |
| plan.json 解析失败 | `loadPlan` 返回空数组，后续逻辑根据空数组处理 |
| plan.json 内容非数组 | `loadPlan` 返回空数组 |
| feature ID 不存在 | `start`/`complete` -> `process.exit(1)` |
| start 时 feature 已 in_progress | 输出提示，正常返回（幂等性） |
| start 时 feature 状态非 pending | `process.exit(1)` |
| start 时依赖未满足 | `process.exit(1)` |
| complete 时 feature 非 in_progress | `process.exit(1)` |
| 检测到循环依赖 | `next` 命令 -> stderr 输出所有环路径 + `process.exit(1)` |
| 依赖的 feature 不存在 | `getDependenciesSatisfied` 返回 `false`，视为依赖未满足 |

### 边界条件

- **空 plan.json**：`loadPlan` 返回 `[]`，各命令对空数组的处理各不相同——`status` 和 `start`/`complete` 报错，`next` 输出"无 features"
- **缺少 `dependencies` 字段**：`getDependenciesSatisfied` 将其视为无依赖，返回 `true`
- **依赖指向不存在的 feature**：视为依赖未满足（`getFeatureById` 返回 `undefined`），feature 被视为 blocked
- **多 in_progress feature**：`getNextFeature` 返回第一个找到的；`status` 命令列出所有

## Dependencies

### Depends on

| 模块/文件 | 依赖内容 | 用途 |
|-----------|---------|------|
| `src/commands/change/shared.ts` | `CHANGES_DIR`, `validateChangeName` | 路径常量和名称校验 |
| `src/server/memory/sync-design.ts` | `syncDesignToMemory` | `status` 命令触发的设计文档同步 |
| `src/utils/logger.ts` | `logger` | 日志记录（info, error） |
| Node.js `fs` | 文件系统操作 | plan.json 的读写 |
| Node.js `path` | 路径操作 | 拼接 plan.json 路径 |

### Depended by

| 模块/文件 | 依赖内容 | 用途 |
|-----------|---------|------|
| `src/commands/change/index.ts` | `runFeatureStatus`, `runFeatureNext`, `runFeatureStart`, `runFeatureComplete` | 命令注册层，将四个函数绑定到 Commander.js 子命令 |
| `src/commands/change/feature.test.ts` | 所有导出的内部函数和类型 | 单元测试 |

## Usage Examples

### 完整的 Feature 生命周期工作流

```typescript
import { runFeatureStatus, runFeatureNext, runFeatureStart, runFeatureComplete } from './feature.js';

// 1. 查看当前 change 的 feature 进度
runFeatureStatus('auth-system');
// 输出:
// Feature List Status: .../furina/changes/auth-system/plan.json
//   Total: 3
//   Done: 0
//   In Progress: 0
//   Pending: 3
//   Blocked: 2
//   Skipped: 0
// Progress: 0.0%

// 2. 获取下一个应处理的 feature
runFeatureNext('auth-system');
// 输出:
// Next feature id: user-model
//   Category: backend
//   Function: User Model
//   Description: Create user database model
//   ...

// 3. 开始执行该 feature
runFeatureStart('auth-system', 'user-model');
// 输出: Started feature: user-model

// 4. 再次查看进度
runFeatureStatus('auth-system');
// 输出: In Progress: 1, Pending: 2, Blocked: 1 (之前 blocked 的 feature 仍 blocked)

// 5. 完成该 feature
runFeatureComplete('auth-system', 'user-model');
// 输出: Completed feature: user-model

// 6. 获取下一个 feature（之前 blocked 的 auth-module 现在可能变为可执行）
runFeatureNext('auth-system');
// 输出:
// Next feature id: auth-module
//   Category: backend
//   Function: Authentication
//   ...

// 7. 全部完成后查看最终状态
runFeatureStatus('auth-system');
// 输出:
//   Done: 3
//   Pending: 0
//   Progress: 100.0%
```

Explanation: 上述示例展示了一个包含 3 个 feature（user-model -> auth-module -> auth-ui，存在依赖链）的完整生命周期管理流程。从查看进度开始，依次启动、完成 feature，依赖链确保执行顺序正确。

### plan.json 文件格式示例

```json
[
  {
    "id": "user-model",
    "status": "done",
    "category": "backend",
    "function": "User Model",
    "description": "Create user database model",
    "acceptance_criteria": [
      "User table exists with correct schema",
      "CRUD operations work correctly"
    ],
    "tasks": [
      "Create migration file",
      "Implement User entity",
      "Add repository layer"
    ],
    "files": ["src/models/user.ts", "src/migrations/001-create-user.ts"],
    "dependencies": [],
    "spec_refs": ["specs/spec-user-model.md"]
  },
  {
    "id": "auth-module",
    "status": "in_progress",
    "category": "backend",
    "function": "Authentication",
    "description": "Implement JWT authentication",
    "dependencies": ["user-model"],
    "spec_refs": ["specs/spec-auth.md"]
  },
  {
    "id": "auth-ui",
    "status": "pending",
    "category": "frontend",
    "function": "Auth UI",
    "description": "Login/registration pages",
    "dependencies": ["auth-module"]
  }
]
```

Explanation: 展示 plan.json 的典型结构，其中 `auth-module` 依赖 `user-model`，`auth-ui` 依赖 `auth-module`，形成线性依赖链。只有前一个 feature 完成（`done`）后，下一个 feature 才能被 `start`。
