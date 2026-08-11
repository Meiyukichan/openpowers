# Stage Merge Handlers

> Source files:
> - `src/utils/memory.ts` : 470-843

## Overview

Stage Merge Handlers 是 Furina 全局内存系统中 change 条目阶段进度的核心合并逻辑。当 CLI 命令（`furina stage`）或内部流程需要更新某个 change 的工作流阶段时，系统通过 `createOrUpdateStage` 调度器将 `StageUpdate` 对象分发到七个阶段专用处理函数，每个处理函数负责将输入数据与已有条目进行智能合并。

**设计动机**：工作流包含 explore -> brainstorm -> propose -> plan -> reviewArtifacts -> coding(subAgentDev) -> finalize 七个阶段，每个阶段的数据结构和合并策略不同。将合并逻辑拆分为独立 handler 可以：
- 为每个阶段实现专属的字段优先级规则（如 explore 的 done 路径保留已有 from/title）
- 自动管理前置阶段的关闭（如进入 brainstorm 时自动关闭 explore）
- 支持复杂的数据结构合并（如 coding 阶段的 featureId + title 双重匹配）

**使用场景**：
- CLI `furina stage` 命令更新阶段进度
- 工作流自动化流程推进阶段
- 同步或恢复阶段状态

**涉及源文件及职责**：
- `src/utils/memory.ts` (470-843): 包含全部七个 handler 函数、`closeIfInProgress` 辅助函数和 `createOrUpdateStage` 调度器

## Architecture / Flow

### 调度流程

`createOrUpdateStage` 是唯一对外导出的入口函数，它接收一个 `ChangeEntry` 和 `StageUpdate`，按工作流顺序依次检查并分发到对应的 handler：

```
createOrUpdateStage(entry, changeStage)
  |
  +-- if changeStage.explore       --> handleExploreStage
  +-- if changeStage.brainstorm    --> handleBrainstormStage
  +-- if changeStage.propose       --> handleProposeStage
  +-- if changeStage.plan          --> handlePlanStage
  +-- if changeStage.reviewArtifacts || changeStage.review --> handleReviewArtifactsStage
  +-- if changeStage.subAgentDev || changeStage.coding     --> handleCodingStage
  +-- if changeStage.finalize      --> handleFinalizeStage
```

### 前置阶段自动关闭机制

每个 handler（explore 除外）在处理自身数据前，会调用 `closeIfInProgress` 自动关闭其直接前置阶段：

| Handler | 自动关闭的前置阶段 |
|---|---|
| handleBrainstormStage | explore |
| handleProposeStage | brainstorm |
| handlePlanStage | propose |
| handleReviewArtifactsStage | plan |
| handleCodingStage | plan + reviewArtifacts |
| handleFinalizeStage | 所有 subAgentDev 进度项 |

### 字段合并策略

系统中存在两种主要的合并策略：

1. **已存在值优先（title/from/inputPath）**：探索已有字段非空时，保留已有值，新数据仅在已有值为空时填充。这是为了防止后续阶段更新意外覆盖探索阶段记录的初始信息。

2. **新值覆盖（to/status/outputPath）**：新数据的非空值直接覆盖已有值，用于反映最新的进度状态。

## Functionality / Interface Details

### `closeIfInProgress(step: StageStep | undefined) -> void`

**Source**: `src/utils/memory.ts`:476-481

**Functionality**: 将处于 `in_progress` 状态的阶段步骤标记为 `done` 并记录完成时间戳。这是前置阶段自动关闭机制的核心辅助函数，被所有后续 handler 广泛调用。如果传入 `undefined` 或步骤已完成/已跳过，则不做任何操作。

**Parameters**:
- `step` (`StageStep | undefined`): 要检查和关闭的阶段步骤对象。允许 undefined 以简化调用方的判空逻辑。

**Return Value**:
- `void`: 直接修改传入对象的 `status` 和 `to` 字段。

**Core Logic**:
- 检查 `step?.status === 'in_progress'` 条件
- 条件满足时，将 `status` 设为 `'done'`，将 `to` 设为当前 ISO 时间戳
- 条件不满足时（undefined、已 done、已 skipped）不做任何修改

**Core Code**:
```typescript
function closeIfInProgress(step: StageStep | undefined): void {
  if (step?.status === 'in_progress') {
    step.status = 'done';
    step.to = new Date().toISOString();
  }
}
```
Source: `src/utils/memory.ts`:476-481

**Usage Example**:
```typescript
// 前置阶段完成后自动关闭
closeIfInProgress(entry.stage.explore);
// 安全调用，step 为 undefined 时不报错
closeIfInProgress(entry.stage.brainstorm?.nonExistent);
```
Explanation: handler 在进入自身逻辑前调用，确保前置阶段不会停留在 `in_progress` 状态。

---

### `handleExploreStage(entry: ChangeEntry, exploreData: Partial<StageStep>) -> void`

**Source**: `src/utils/memory.ts`:491-528

**Functionality**: 处理探索（explore）阶段的更新。该 handler 与其他 handler 的关键区别在于：当状态为 `done` 时采用**选择性更新**策略，仅更新 `outputPath`、`to`、`status` 三个字段，保留已有的 `from`、`title`、`inputPath`。这确保了探索阶段记录的初始信息（谁发起的、什么标题）不会在阶段完成时被意外覆盖。当状态为 `in_progress` 时则执行完整的赋值初始化。`skipped` 状态为 no-op。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change 条目
- `exploreData` (`Partial<StageStep>`): 探索阶段的更新数据

**Return Value**:
- `void`: 直接修改 `entry.stage.explore`

**Core Logic**:

- **空值保护**：`exploreData` 为空时直接返回
- **stage 初始化**：确保 `entry.stage` 存在
- **done 路径**：
  - 如果已有 `entry.stage.explore`：仅在新数据中对应字段非 undefined 时更新 `outputPath` 和 `to`，强制将 `status` 设为 `'done'`
  - 如果无已有 explore：创建最小化条目，用 `??` 运算符填充默认值
- **in_progress 路径**：直接构造完整对象并赋值，所有字段使用 `??` 提供默认值
- **skipped 路径**：不做任何修改

**Core Code**:
```typescript
function handleExploreStage(entry: ChangeEntry, exploreData: Partial<StageStep>): void {
  if (!exploreData) return;
  if (!entry.stage) entry.stage = {} as ChangeStage;

  if (exploreData.status === 'done') {
    if (entry.stage.explore) {
      if (exploreData.outputPath !== undefined) entry.stage.explore.outputPath = exploreData.outputPath;
      if (exploreData.to !== undefined) entry.stage.explore.to = exploreData.to;
      entry.stage.explore.status = 'done';
    } else {
      entry.stage.explore = {
        title: exploreData.title ?? '',
        from: exploreData.from ?? new Date().toISOString(),
        to: exploreData.to ?? new Date().toISOString(),
        status: 'done',
        inputPath: exploreData.inputPath ?? '',
        outputPath: exploreData.outputPath ?? '',
      };
    }
  } else if (exploreData.status === 'in_progress') {
    entry.stage.explore = {
      title: exploreData.title ?? '',
      from: exploreData.from ?? new Date().toISOString(),
      to: exploreData.to ?? new Date().toISOString(),
      status: 'in_progress',
      inputPath: exploreData.inputPath ?? '',
      outputPath: exploreData.outputPath ?? '',
    };
  }
}
```
Source: `src/utils/memory.ts`:491-528

**Usage Example**:
```typescript
// 开始探索阶段
handleExploreStage(entry, {
  title: '探索项目架构',
  from: '2026-07-05T10:00:00Z',
  status: 'in_progress',
  inputPath: 'README.md',
});

// 完成探索阶段 — 保留已有的 title/from/inputPath
handleExploreStage(entry, {
  status: 'done',
  outputPath: 'furina/changes/my-change/explore.md',
  to: '2026-07-05T11:00:00Z',
});
```
Explanation: 第一次调用初始化 explore 阶段；第二次调用完成阶段，只更新 outputPath/to/status，title 和 from 保持原值。

---

### `handleBrainstormStage(entry: ChangeEntry, data?: Partial<StageStep>) -> void`

**Source**: `src/utils/memory.ts`:535-551

**Functionality**: 处理头脑风暴（brainstorm）阶段的更新。进入此阶段时自动关闭 explore 前置阶段。合并策略为**已存在值优先**：`title`、`from`、`inputPath` 优先保留已有值；`to`、`status`、`outputPath` 优先取新数据值。这保证了探索阶段记录的元数据在后续阶段中不被覆盖。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change 条目
- `data` (`Partial<StageStep> | undefined`): 头脑风暴阶段的更新数据，undefined 时不做任何操作

**Return Value**:
- `void`: 直接修改 `entry.stage.brainstorm`

**Core Logic**:
- `data` 为空时直接返回
- 确保 `entry.stage` 存在
- 调用 `closeIfInProgress(entry.stage.explore)` 关闭前置阶段
- 构造合并后的 brainstorm 对象，使用三元表达式实现字段优先级：
  - `title`/`from`/`inputPath`: 已有非空值 > 新数据非空值 > 默认值
  - `to`/`outputPath`: 新数据非空值 > 已有值 > 默认值
  - `status`: 新数据值 > 已有值 > 默认 `'in_progress'`

**Core Code**:
```typescript
function handleBrainstormStage(entry: ChangeEntry, data?: Partial<StageStep>): void {
  if (!data) return;
  if (!entry.stage) entry.stage = {} as ChangeStage;

  // Auto-close predecessor: explore
  closeIfInProgress(entry.stage.explore);

  const existing = entry.stage.brainstorm;
  entry.stage.brainstorm = {
    title: (existing?.title && existing.title !== '') ? existing.title : ((data.title && data.title !== '') ? data.title : ''),
    from: (existing?.from && existing.from !== '') ? existing.from : ((data.from && data.from !== '') ? data.from : new Date().toISOString()),
    to: (data.to && data.to !== '') ? data.to : (existing?.to ?? new Date().toISOString()),
    status: data.status ?? (existing?.status ?? 'in_progress'),
    inputPath: (existing?.inputPath && existing.inputPath !== '') ? existing.inputPath : ((data.inputPath && data.inputPath !== '') ? data.inputPath : ''),
    outputPath: (data.outputPath && data.outputPath !== '') ? data.outputPath : (existing?.outputPath ?? ''),
  };
}
```
Source: `src/utils/memory.ts`:535-551

**Usage Example**:
```typescript
handleBrainstormStage(entry, {
  title: '功能需求头脑风暴',
  from: '2026-07-05T12:00:00Z',
  status: 'in_progress',
  inputPath: 'furina/changes/my-change/explore.md',
});
// 此时 entry.stage.explore 的 status 已自动变为 'done'
```
Explanation: 进入 brainstorm 阶段时，explore 阶段会被自动关闭，brainstorm 数据以已存在值优先的策略合并。

---

### `handleProposeStage(entry: ChangeEntry, data?: Partial<StageStep>) -> void`

**Source**: `src/utils/memory.ts`:558-574

**Functionality**: 处理提案（propose）阶段的更新。进入此阶段时自动关闭 brainstorm 前置阶段。合并策略与 brainstorm 完全一致：`title`/`from`/`inputPath` 已存在值优先，`to`/`status`/`outputPath` 新值优先。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change 条目
- `data` (`Partial<StageStep> | undefined`): 提案阶段的更新数据

**Return Value**:
- `void`: 直接修改 `entry.stage.propose`

**Core Logic**:
- `data` 为空时直接返回
- 确保 `entry.stage` 存在
- 调用 `closeIfInProgress(entry.stage.brainstorm)` 关闭前置阶段
- 与 `handleBrainstormStage` 使用完全相同的三元表达式合并模式

**Core Code**:
```typescript
function handleProposeStage(entry: ChangeEntry, data?: Partial<StageStep>): void {
  if (!data) return;
  if (!entry.stage) entry.stage = {} as ChangeStage;

  // Auto-close predecessor: brainstorm
  closeIfInProgress(entry.stage.brainstorm);

  const existing = entry.stage.propose;
  entry.stage.propose = {
    title: (existing?.title && existing.title !== '') ? existing.title : ((data.title && data.title !== '') ? data.title : ''),
    from: (existing?.from && existing.from !== '') ? existing.from : ((data.from && data.from !== '') ? data.from : new Date().toISOString()),
    to: (data.to && data.to !== '') ? data.to : (existing?.to ?? new Date().toISOString()),
    status: data.status ?? (existing?.status ?? 'in_progress'),
    inputPath: (existing?.inputPath && existing.inputPath !== '') ? existing.inputPath : ((data.inputPath && data.inputPath !== '') ? data.inputPath : ''),
    outputPath: (data.outputPath && data.outputPath !== '') ? data.outputPath : (existing?.outputPath ?? ''),
  };
}
```
Source: `src/utils/memory.ts`:558-574

**Usage Example**:
```typescript
handleProposeStage(entry, {
  title: '提交设计方案',
  status: 'in_progress',
  inputPath: 'furina/changes/my-change/brainstorm.md',
});
// brainstorm 阶段自动关闭
```
Explanation: propose 阶段启动时自动关闭 brainstorm，合并逻辑遵循已存在值优先原则。

---

### `handlePlanStage(entry: ChangeEntry, data?: Partial<StageStep>) -> void`

**Source**: `src/utils/memory.ts`:581-597

**Functionality**: 处理计划（plan）阶段的更新。进入此阶段时自动关闭 propose 前置阶段。合并策略与 brainstorm/propose 一致。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change 条目
- `data` (`Partial<StageStep> | undefined`): 计划阶段的更新数据

**Return Value**:
- `void`: 直接修改 `entry.stage.plan`

**Core Logic**:
- `data` 为空时直接返回
- 确保 `entry.stage` 存在
- 调用 `closeIfInProgress(entry.stage.propose)` 关闭前置阶段
- 使用相同的三元表达式合并模式

**Core Code**:
```typescript
function handlePlanStage(entry: ChangeEntry, data?: Partial<StageStep>): void {
  if (!data) return;
  if (!entry.stage) entry.stage = {} as ChangeStage;

  // Auto-close predecessor: propose
  closeIfInProgress(entry.stage.propose);

  const existing = entry.stage.plan;
  entry.stage.plan = {
    title: (existing?.title && existing.title !== '') ? existing.title : ((data.title && data.title !== '') ? data.title : ''),
    from: (existing?.from && existing.from !== '') ? existing.from : ((data.from && data.from !== '') ? data.from : new Date().toISOString()),
    to: (data.to && data.to !== '') ? data.to : (existing?.to ?? new Date().toISOString()),
    status: data.status ?? (existing?.status ?? 'in_progress'),
    inputPath: (existing?.inputPath && existing.inputPath !== '') ? existing.inputPath : ((data.inputPath && data.inputPath !== '') ? data.inputPath : ''),
    outputPath: (data.outputPath && data.outputPath !== '') ? data.outputPath : (existing?.outputPath ?? ''),
  };
}
```
Source: `src/utils/memory.ts`:581-597

**Usage Example**:
```typescript
handlePlanStage(entry, {
  title: '制定实施计划',
  status: 'done',
  outputPath: 'furina/changes/my-change/plan.json',
  to: '2026-07-05T14:00:00Z',
});
// propose 阶段自动关闭
```
Explanation: plan 阶段完成时，propose 被自动关闭。

---

### `handleReviewArtifactsStage(entry: ChangeEntry, data?: Partial<StageStep>) -> void`

**Source**: `src/utils/memory.ts`:604-620

**Functionality**: 处制品审查（reviewArtifacts）阶段的更新。进入此阶段时自动关闭 plan 前置阶段。合并策略与前述三个 handler 一致。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change 条目
- `data` (`Partial<StageStep> | undefined`): 制品审查阶段的更新数据

**Return Value**:
- `void`: 直接修改 `entry.stage.reviewArtifacts`

**Core Logic**:
- `data` 为空时直接返回
- 确保 `entry.stage` 存在
- 调用 `closeIfInProgress(entry.stage.plan)` 关闭前置阶段
- 使用相同的三元表达式合并模式

**Core Code**:
```typescript
function handleReviewArtifactsStage(entry: ChangeEntry, data?: Partial<StageStep>): void {
  if (!data) return;
  if (!entry.stage) entry.stage = {} as ChangeStage;

  // Auto-close predecessor: plan
  closeIfInProgress(entry.stage.plan);

  const existing = entry.stage.reviewArtifacts;
  entry.stage.reviewArtifacts = {
    title: (existing?.title && existing.title !== '') ? existing.title : ((data.title && data.title !== '') ? data.title : ''),
    from: (existing?.from && existing.from !== '') ? existing.from : ((data.from && data.from !== '') ? data.from : new Date().toISOString()),
    to: (data.to && data.to !== '') ? data.to : (existing?.to ?? new Date().toISOString()),
    status: data.status ?? (existing?.status ?? 'in_progress'),
    inputPath: (existing?.inputPath && existing.inputPath !== '') ? existing.inputPath : ((data.inputPath && data.inputPath !== '') ? data.inputPath : ''),
    outputPath: (data.outputPath && data.outputPath !== '') ? data.outputPath : (existing?.outputPath ?? ''),
  };
}
```
Source: `src/utils/memory.ts`:604-620

**Usage Example**:
```typescript
handleReviewArtifactsStage(entry, {
  title: '审查设计制品',
  status: 'in_progress',
  inputPath: 'furina/changes/my-change/plan.json',
});
// plan 阶段自动关闭
```
Explanation: reviewArtifacts 启动时自动关闭 plan 阶段。

---

### `handleCodingStage(entry: ChangeEntry, codingData?: unknown[]) -> void`

**Source**: `src/utils/memory.ts`:637-723

**Functionality**: 处理编码（coding/subAgentDev）阶段的更新。这是所有 handler 中最复杂的，因为它处理的是**数组型数据结构**（`SubAgentDevProgress[]`），支持按 `featureId` 匹配 feature，再按 `title` 匹配 progress 项的双重匹配合并逻辑。进入此阶段时同时关闭 plan 和 reviewArtifacts 两个前置阶段。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change 条目
- `codingData` (`unknown[] | undefined`): 类似 `SubAgentDevProgress` 的对象数组，每个元素包含 `featureId` 和 `progress` 数组

**Return Value**:
- `void`: 直接修改 `entry.stage.subAgentDev`

**Core Logic**:

1. **输入验证**：`codingData` 为空/非数组/空数组时直接返回
2. **初始化**：确保 `entry.stage` 和 `entry.stage.subAgentDev` 数组存在
3. **自动关闭前置阶段**：同时关闭 `plan` 和 `reviewArtifacts`
4. **遍历 codingData 中的每个 item**：
   - 提取 `featureId` 和 `progress` 数组
   - 在已有 `subAgentDev` 中查找匹配的 `featureId`
   - **匹配到 featureId**：遍历新 progress 项：
     - 按 `title` 查找已有 progress 项
     - **匹配到 title**：合并，`title`/`from`/`inputPath` 保留已有值，`to`/`status`/`outputPath` 用新值覆盖
     - **未匹配到 title**：先关闭同 feature 中最后一个 in_progress 的 progress 项，再追加新 progress
   - **未匹配到 featureId**：先关闭上一个 feature 的所有 in_progress progress，再创建新的 `SubAgentDevProgress` 并追加

**Core Code**:
```typescript
function handleCodingStage(entry: ChangeEntry, codingData?: unknown[]): void {
  if (!codingData || !Array.isArray(codingData) || codingData.length === 0) return;
  if (!entry.stage) entry.stage = {} as ChangeStage;

  // Auto-close predecessors: plan and reviewArtifacts
  closeIfInProgress(entry.stage.plan);
  closeIfInProgress(entry.stage.reviewArtifacts);

  if (!Array.isArray(entry.stage.subAgentDev)) {
    entry.stage.subAgentDev = [];
  }

  for (const item of codingData) {
    const itemObj = item as Record<string, unknown>;
    const featureId = typeof itemObj.featureId === 'string' ? itemObj.featureId : '';
    const newProgress = Array.isArray(itemObj.progress) ? (itemObj.progress as Partial<StageStep>[]) : [];

    if (newProgress.length === 0) continue;

    const existingSAD = entry.stage.subAgentDev.find(
      (sad) => (sad as SubAgentDevProgress).featureId === featureId,
    ) as SubAgentDevProgress | undefined;

    if (existingSAD) {
      for (const newItem of newProgress) {
        const newTitle = newItem.title ?? '';
        const matchIndex = newTitle
          ? existingSAD.progress.findIndex((p) => p.title === newTitle)
          : -1;

        if (matchIndex >= 0) {
          // Merge: existing values for title/from/inputPath take priority
          const existing = existingSAD.progress[matchIndex];
          existing.title = (existing.title && existing.title !== '') ? existing.title : (newItem.title ?? '');
          existing.from = (existing.from && existing.from !== '') ? existing.from : ((newItem.from && newItem.from !== '') ? newItem.from : new Date().toISOString());
          if (newItem.to && newItem.to !== '') existing.to = newItem.to;
          if (newItem.status) existing.status = newItem.status;
          existing.inputPath = (existing.inputPath && existing.inputPath !== '') ? existing.inputPath : ((newItem.inputPath && newItem.inputPath !== '') ? newItem.inputPath : '');
          if (newItem.outputPath && newItem.outputPath !== '') existing.outputPath = newItem.outputPath;
        } else {
          closeIfInProgress(existingSAD.progress[existingSAD.progress.length - 1]);
          // ... append new progress entry
        }
      }
    } else {
      // Close all in_progress progresses of previous feature
      const prevFeature = entry.stage.subAgentDev[entry.stage.subAgentDev.length - 1];
      if (prevFeature) {
        for (const p of prevFeature.progress) {
          closeIfInProgress(p);
        }
      }
      // ... create new SubAgentDevProgress
    }
  }
}
```
Source: `src/utils/memory.ts`:637-723

**Usage Example**:
```typescript
// 更新已有 feature 的 progress
handleCodingStage(entry, [
  {
    featureId: 'feat-001',
    progress: [
      {
        title: '实现登录功能',
        status: 'done',
        to: '2026-07-05T16:00:00Z',
        outputPath: 'furina/changes/my-change/features/feat-001/tdd-report.md',
      },
    ],
  },
]);

// 新增 feature 及其 progress
handleCodingStage(entry, [
  {
    featureId: 'feat-002',
    progress: [
      {
        title: '实现注册功能',
        from: '2026-07-05T16:30:00Z',
        status: 'in_progress',
        inputPath: 'furina/changes/my-change/features/feat-002/spec.md',
      },
    ],
  },
]);
```
Explanation: 第一次调用匹配到已有的 feat-001，通过 title 找到 "实现登录功能" 并合并（更新 status/to/outputPath）。第二次调用未匹配到 feat-002，创建新的 SubAgentDevProgress，同时自动关闭上一个 feature（feat-001）的所有 in_progress progress。

---

### `handleFinalizeStage(entry: ChangeEntry, data?: { integration?: Partial<StageStep>[]; codecheck?: Partial<StageStep>; archive?: Partial<StageStep> }) -> void`

**Source**: `src/utils/memory.ts`:733-812

**Functionality**: 处理终态（finalize）阶段的更新。finalize 是工作流的最后一个阶段，包含三个子阶段：`integration`（集成测试数组）、`codecheck`（代码审查）、`archive`（归档）。该 handler 实现了级联自动关闭机制：archive 到来时关闭 codecheck，codecheck 到来时关闭所有 integration 项。同时，它也负责关闭所有上游 subAgentDev 中仍在进行的 progress。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change 条目
- `data` (`{ integration?: Partial<StageStep>[]; codecheck?: Partial<StageStep>; archive?: Partial<StageStep> } | undefined`): 终态阶段更新数据，三个子字段均可选

**Return Value**:
- `void`: 直接修改 `entry.stage.finalize`

**Core Logic**:

1. **初始化**：确保 `entry.stage` 和 `entry.stage.finalize` 存在
2. **关闭所有 subAgentDev 进度**：遍历所有 feature 的所有 progress，调用 `closeIfInProgress`
3. **级联关闭 integration**：当 `data.codecheck` 存在时，关闭 `finalize.integration` 中所有 in_progress 项
4. **级联关闭 codecheck**：当 `data.archive` 存在时，关闭 `finalize.codecheck`
5. **合并 integration 数组**：
   - 按 `title` 查找已有项进行匹配合并（新非空值覆盖）
   - 未匹配则追加新项
6. **合并 codecheck**：直接赋值，新值用 `??` 运算符保留已有默认
7. **合并 archive**：与 codecheck 同样逻辑

**Core Code**:
```typescript
function handleFinalizeStage(entry: ChangeEntry, data?: { integration?: Partial<StageStep>[]; codecheck?: Partial<StageStep>; archive?: Partial<StageStep> }): void {
  if (!data) return;
  if (!entry.stage) entry.stage = {} as ChangeStage;
  if (!entry.stage.finalize) entry.stage.finalize = {} as FinalizeStage;

  // Auto-close predecessors: all subAgentDev in_progress progresses
  if (Array.isArray(entry.stage.subAgentDev)) {
    for (const feature of entry.stage.subAgentDev) {
      for (const p of feature.progress) {
        closeIfInProgress(p);
      }
    }
  }

  // Auto-close finalize sub-stage predecessor: codecheck closes integration
  if (data.codecheck && Array.isArray(entry.stage.finalize.integration)) {
    for (const item of entry.stage.finalize.integration) {
      closeIfInProgress(item);
    }
  }

  // Auto-close finalize sub-stage predecessor: archive closes codecheck
  if (data.archive) {
    closeIfInProgress(entry.stage.finalize.codecheck);
  }

  // Merge integration array by title matching
  if (Array.isArray(data.integration)) {
    if (!Array.isArray(entry.stage.finalize.integration)) {
      entry.stage.finalize.integration = [];
    }
    for (const newItem of data.integration) {
      const newTitle = newItem.title ?? '';
      const matchIndex = newTitle
        ? entry.stage.finalize.integration.findIndex((p) => p.title === newTitle)
        : -1;

      if (matchIndex >= 0) {
        // Merge: new non-empty values override
        const existing = entry.stage.finalize.integration[matchIndex];
        if (newItem.title && newItem.title !== '') existing.title = newItem.title;
        if (newItem.from && newItem.from !== '') existing.from = newItem.from;
        if (newItem.to && newItem.to !== '') existing.to = newItem.to;
        if (newItem.status) existing.status = newItem.status;
        if (newItem.inputPath && newItem.inputPath !== '') existing.inputPath = newItem.inputPath;
        if (newItem.outputPath && newItem.outputPath !== '') existing.outputPath = newItem.outputPath;
      } else {
        entry.stage.finalize.integration.push({
          title: newItem.title ?? '',
          from: (newItem.from && newItem.from !== '') ? newItem.from : new Date().toISOString(),
          to: (newItem.to && newItem.to !== '') ? newItem.to : new Date().toISOString(),
          status: newItem.status ?? 'in_progress',
          inputPath: (newItem.inputPath && newItem.inputPath !== '') ? newItem.inputPath : '',
          outputPath: (newItem.outputPath && newItem.outputPath !== '') ? newItem.outputPath : '',
        });
      }
    }
  }
  if (data.codecheck) {
    entry.stage.finalize.codecheck = {
      title: data.codecheck.title ?? (entry.stage.finalize.codecheck?.title ?? ''),
      from: data.codecheck.from ?? (entry.stage.finalize.codecheck?.from ?? new Date().toISOString()),
      // ... other fields with ?? fallback to existing or default
    };
  }
  if (data.archive) {
    entry.stage.finalize.archive = { /* same pattern */ };
  }
}
```
Source: `src/utils/memory.ts`:733-812

**Usage Example**:
```typescript
// 提交集成测试结果
handleFinalizeStage(entry, {
  integration: [{
    title: '端到端测试',
    status: 'done',
    outputPath: 'furina/changes/my-change/finalize/integration-1-report.md',
  }],
});
// 此时所有 subAgentDev 进度已被自动关闭

// 进入代码审查
handleFinalizeStage(entry, {
  codecheck: {
    title: '代码审查',
    status: 'in_progress',
    inputPath: 'furina/changes/my-change/finalize/codecheck.md',
  },
});
// 此时 integration 数组中所有 in_progress 项已被关闭

// 归档
handleFinalizeStage(entry, {
  archive: {
    title: '变更归档',
    status: 'done',
    outputPath: 'furina/changes/my-change/finalize/archive.md',
  },
});
// 此时 codecheck 已被自动关闭
```
Explanation: 演示了 finalize 三个子阶段的级联自动关闭：integration -> codecheck -> archive，每次新子阶段到来时自动关闭前一个。

---

### `createOrUpdateStage(entry: ChangeEntry, changeStage: StageUpdate) -> void`

**Source**: `src/utils/memory.ts`:821-843

**Functionality**: 阶段合并的总调度器，也是本 spec 中唯一对外导出的函数。接收 `StageUpdate` 对象，按工作流顺序（explore -> brainstorm -> propose -> plan -> reviewArtifacts -> subAgentDev -> finalize）依次检查并分发到对应的 handler。支持别名字段映射：`review` 映射到 `reviewArtifacts`，`coding` 映射到 `subAgentDev`。

**Parameters**:
- `entry` (`ChangeEntry`): 要更新的 change 条目
- `changeStage` (`StageUpdate`): 阶段更新数据，各字段均为可选

**Return Value**:
- `void`: 通过修改 `entry` 对象实现就地更新

**Core Logic**:
- 按固定顺序依次检查 `changeStage` 的七个字段
- 非 falsy 时调用对应的 handler
- `reviewArtifacts` 和 `review` 是别名关系（`reviewArtifacts ?? review`）
- `subAgentDev` 和 `coding` 是别名关系（`subAgentDev ?? coding`）

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
// 同时更新多个阶段（工作流快速推进）
createOrUpdateStage(entry, {
  explore: { status: 'done', outputPath: 'explore.md', to: new Date().toISOString() },
  brainstorm: { title: '需求分析', status: 'in_progress', from: new Date().toISOString() },
});
```
Explanation: explore 完成的同时启动 brainstorm。由于分发顺序固定（explore 在 brainstorm 之前），explore handler 先执行完成更新，brainstorm handler 再启动并自动关闭 explore。

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
  finalize?: {
    integration?: Partial<StageStep>[];
    codecheck?: Partial<StageStep>;
    archive?: Partial<StageStep>;
  };
  // 别名字段
  review?: Partial<StageStep>;    // 等价于 reviewArtifacts
  coding?: unknown[];              // 等价于 subAgentDev
}
```
- `explore` (`Partial<StageStep>`): 探索阶段更新数据
- `brainstorm` (`Partial<StageStep>`): 头脑风暴阶段更新数据
- `propose` (`Partial<StageStep>`): 提案阶段更新数据
- `plan` (`Partial<StageStep>`): 计划阶段更新数据
- `reviewArtifacts` / `review` (`Partial<StageStep>`): 制品审查阶段更新数据（互为别名）
- `subAgentDev` / `coding` (`unknown[]`): 编码阶段更新数据（互为别名）
- `finalize` (`object`): 终态阶段更新数据，包含 integration 数组、codecheck 和 archive 三个子字段

### `StageStep`
```typescript
export type StageStep = {
  title: string;
  from: string;
  to: string;
  status: 'in_progress' | 'skipped' | 'done';
  inputPath: string;
  outputPath: string;
};
```
- `title` (`string`): 阶段步骤的标题/描述
- `from` (`string`): 开始时间 ISO 时间戳
- `to` (`string`): 结束时间 ISO 时间戳
- `status` (`'in_progress' | 'skipped' | 'done'`): 阶段状态
- `inputPath` (`string`): 输入文件路径
- `outputPath` (`string`): 输出文件路径

### `SubAgentDevProgress`
```typescript
export type SubAgentDevProgress = {
  featureId: string;
  progress: StageStep[];
};
```
- `featureId` (`string`): 功能特性标识符，与 plan.json 中的 feature 对应
- `progress` (`StageStep[]`): 该功能的开发进度记录数组，按时间顺序排列

### `FinalizeStage`
```typescript
export type FinalizeStage = {
  integration: StageStep[];
  codecheck: StageStep;
  archive: StageStep;
};
```
- `integration` (`StageStep[]`): 集成测试记录数组，支持多个集成测试步骤
- `codecheck` (`StageStep`): 代码审查记录
- `archive` (`StageStep`): 归档记录

## Error Handling and Edge Cases

### 空值和 undefined 防护
- 所有 handler 在 `data` 参数为 falsy（undefined/null）时直接返回，不抛出异常
- `entry.stage` 未初始化时自动创建空对象（`{} as ChangeStage`）
- `entry.stage.subAgentDev` 未初始化时自动创建空数组
- `entry.stage.finalize` 未初始化时自动创建空对象（`{} as FinalizeStage`）

### 类型安全
- `codingData` 使用 `unknown[]` 类型，在 handler 内部通过 `as Record<string, unknown>` 进行类型转换
- `featureId` 提取时做 `typeof` 类型检查，非法值降级为空字符串
- `progress` 数组做 `Array.isArray` 检查

### 字段合并中的空字符串判断
- 所有合并逻辑都显式检查空字符串（`!== ''`），确保空字符串被视为"无值"状态
- 这与简单的 `||` 或 `??` 运算符行为不同——空字符串 `''` 在 JavaScript 中是 falsy，但 handler 使用 `&& field !== ''` 双重检查以确保逻辑清晰

### 层叠自动关闭的安全性
- `closeIfInProgress` 对 `undefined` 参数安全，不会抛出异常
- 自动关闭操作是幂等的——已关闭的步骤不会被重复修改
- `handleCodingStage` 中切换 feature 时，只关闭上一个 feature 的 progress，不会影响更早的 feature

### 时间戳默认值
- 当 `from` 或 `to` 字段缺失时，统一使用 `new Date().toISOString()` 作为默认值
- 这确保了即使上游传入不完整的数据，记录中也总有有效的时间戳

## Dependencies

- **Depends on**:
  - `spec-memory-schemas.md` — 提供 `StageStep`、`SubAgentDevProgress`、`FinalizeStage`、`ChangeStage`、`ChangeEntry`、`StageUpdate` 等类型定义
  - `src/utils/common.ts` — `normalizePath` 函数（通过 `flattenCwdPath` 间接使用）

- **Depended by**:
  - `spec-memory-entry-lifecycle.md` — `createOrUpdateChange` 函数在内部调用 `createOrUpdateStage`
  - `src/commands/change/stage.ts` — CLI stage 命令通过 `createOrUpdateChange` 间接使用 stage handlers

## Usage Examples

### 完整工作流推进示例

```typescript
import { createOrUpdateStage } from './utils/memory.js';
import type { ChangeEntry, StageUpdate } from './utils/memory.js';

// 假设 entry 已通过 readMemoryChangesJson 获取或新建
const entry: ChangeEntry = {
  name: 'add-user-auth',
  path: 'furina/changes/add-user-auth',
  description: '实现用户认证功能',
  createdAt: '2026-07-05T08:00:00Z',
  status: 'active',
  features: 0,
  todo: 0,
  artifacts: [],
};

// 1. 启动探索阶段
createOrUpdateStage(entry, {
  explore: {
    title: '探索认证模块实现',
    from: '2026-07-05T08:00:00Z',
    status: 'in_progress',
    inputPath: 'README.md',
  },
});
// entry.stage.explore = { status: 'in_progress', title: '探索认证模块实现', ... }

// 2. 完成探索，启动头脑风暴
createOrUpdateStage(entry, {
  explore: { status: 'done', outputPath: 'explore.md', to: '2026-07-05T09:00:00Z' },
  brainstorm: {
    title: '需求分析',
    from: '2026-07-05T09:00:00Z',
    status: 'in_progress',
    inputPath: 'explore.md',
  },
});
// entry.stage.explore.status 已变为 'done'
// entry.stage.brainstorm.status = 'in_progress'

// 3. 完成头脑风暴，启动提案（brainstorm 自动关闭）
createOrUpdateStage(entry, {
  brainstorm: { status: 'done', to: '2026-07-05T10:00:00Z' },
  propose: { title: '提交设计方案', from: '2026-07-05T10:00:00Z', status: 'in_progress' },
});

// 4. 完成提案，启动计划（propose 自动关闭）
createOrUpdateStage(entry, {
  propose: { status: 'done', to: '2026-07-05T11:00:00Z' },
  plan: { title: '制定实施计划', from: '2026-07-05T11:00:00Z', status: 'in_progress' },
});

// 5. 完成计划，进入编码阶段（plan 自动关闭）
createOrUpdateStage(entry, {
  plan: { status: 'done', to: '2026-07-05T12:00:00Z', outputPath: 'plan.json' },
  subAgentDev: [{
    featureId: 'feat-login',
    progress: [{
      title: '实现登录 API',
      from: '2026-07-05T12:00:00Z',
      status: 'in_progress',
      inputPath: 'plan.json',
    }],
  }],
});

// 6. 切换到新 feature（feat-login 的 progress 自动关闭）
createOrUpdateStage(entry, {
  subAgentDev: [{
    featureId: 'feat-register',
    progress: [{
      title: '实现注册 API',
      from: '2026-07-05T14:00:00Z',
      status: 'in_progress',
      inputPath: 'plan.json',
    }],
  }],
});

// 7. 进入终态阶段（所有 subAgentDev 进度自动关闭）
createOrUpdateStage(entry, {
  finalize: {
    integration: [{
      title: '集成测试',
      from: '2026-07-05T16:00:00Z',
      status: 'in_progress',
    }],
  },
});
```

Explanation: 上述示例完整演示了从 explore 到 finalize 的工作流推进过程。每一步都展示了：
1. 前置阶段如何被自动关闭
2. 新阶段数据如何合并到 entry 中
3. 编码阶段如何在多个 feature 之间切换并保持进度记录
4. 终态阶段如何级联关闭所有子阶段
