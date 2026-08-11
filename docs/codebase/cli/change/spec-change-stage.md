# Stage Progress Dispatch

> Source files:
> - `src/commands/change/stage.ts` : 1-599

## Overview

`stage.ts` 实现了 Furina 的智能阶段进度路由系统。当工作流 agent 完成某个阶段任务后，通过 `furina change stage <stageName>` CLI 命令更新该阶段的进度状态。模块的核心价值在于**智能路由分发**——根据当前 change 的状态（是否已结束、plan.json 是否存在、feature 进度如何），将同一个 CLI 调用路由到内存中不同的存储位置。

**设计动机**：Furina 的 change 生命周期包含多个阶段（explore, brainstorm, propose, plan, review, coding, integration, codecheck, archive），但这些阶段并非简单的线性映射。例如，explore 阶段在 plan.json 存在时会自动路由到 coding 流程；coding 阶段在所有 feature 完成时路由到 finalize.integration[]，否则路由到 subAgentDev[]。这种智能路由避免了上层调用者（工作流 agent）需要了解底层存储结构。

**使用场景**：每次工作流 agent 完成一个阶段任务时，都会调用此命令来记录进度。命令行调用形式为：
```
furina change stage <stageName> --session <sessionId> --status <status> [--title] [--input] [--output]
```

**涉及源文件及职责**：
- `src/commands/change/stage.ts`：主逻辑文件，包含参数验证、阶段路由分发、合并策略等全部逻辑
- `src/commands/change/index.ts`：Commander 注册入口，将 stage 子命令注册到 change 命令下
- `src/utils/memory.ts`：下游依赖，提供 `readMemoryChangesJson` 和 `createOrUpdateChange` 用于读写全局内存
- `src/utils/session.ts`：下游依赖，提供 `readSessionSettings` 用于读取会话配置

## Architecture / Flow

### 整体执行流程

```
CLI 入口 (runChangeStage)
  |
  v
参数验证 (session, status, stageName)
  |
  v
读取 Session Settings -> 获取 cwd 和 changeName
  |
  v
构建 StageStep 数据 (title, inputPath, outputPath, from, to, status)
  |
  v
读取当前 memory 中的 stage 上下文
  |
  v
读取 plan.json 的 features 列表
  |
  v
判断 change 是否已结束 -> 已结束则仅允许 integration/codecheck/archive
  |
  v
根据 stageName 分发到对应 handler:
  - workflow  -> 直接返回 (acknowledge)
  - explore   -> handleExploreStageDispatch (智能路由)
  - brainstorm -> handleBrainstormStageDispatch (直接写入)
  - propose   -> handleProposeStageDispatch (直接写入)
  - plan      -> handlePlanStageDispatch (直接写入)
  - review    -> handleReviewStageDispatch (智能路由)
  - coding    -> handleCodingStageDispatch (智能路由)
  - integration -> handleIntegrationStageDispatch (数组合并)
  - codecheck -> handleCodecheckStageDispatch (merge)
  - archive   -> handleArchiveStageDispatch (merge)
  |
  v
调用 createOrUpdateChange 写入全局内存
```

### 智能路由决策树

**explore 阶段路由**：
```
explore 请求
  |
  +-- stage 为空/只有 explore 且未完成? --> 写入 explore
  |
  +-- plan.json 不存在? --> 写入 explore
  |
  +-- 其他情况 --> 转发到 coding 路由
```

**coding 阶段路由**：
```
coding 请求
  |
  +-- 所有 features 都 done? --> 写入 finalize.integration[]
  |     (按 title 查找已有条目，找到则 merge，否则追加)
  |
  +-- 否则 --> 写入 subAgentDev[featureId].progress[]
        (通过 inferFeatureId 获取第一个 in_progress 的 featureId)
```

**review 阶段路由**：
```
review 请求
  |
  +-- 所有 features 都 pending 且 reviewArtifacts 未完成?
  |     --> 写入 reviewArtifacts
  |
  +-- 否则 --> 写入 subAgentDev[featureId].progress[]
```

### 合并策略

阶段数据合并采用**非空覆盖 (non-empty overwrite)** 策略：
- `title`, `inputPath`, `outputPath`, `from`, `to`：仅当新值为非空字符串时覆盖已有值
- `status`：无条件覆盖

这一策略确保了增量更新不会丢失已有数据，同时 status 始终反映最新状态。

## Functionality / Interface Details

### `runChangeStage(stageName: string, options: {...}) -> void`

**Source**: `src/commands/change/stage.ts`:484-599

**Functionality**: 这是整个模块的主入口函数，由 Commander 注册的 `furina change stage <stageName>` 命令触发。它负责完整的执行流程：参数验证、会话读取、StageStep 数据构建、change 结束状态检查、以及最终的智能路由分发。

**Parameters**:
- `stageName` (`string`): 阶段名称，必须是 VALID_STAGES 中的值之一。作为 Commander 的位置参数传入。
- `options` (`{ session?: string; status?: string; title?: string; input?: string; output?: string }`):
  - `session` (`string`, **必需**): 会话 ID，用于读取 SessionSettings 获取 cwd 和 changeName。
  - `status` (`string`, **必需**): 阶段状态，必须为 `in_progress`、`done` 或 `skipped` 之一。
  - `title` (`string`, 可选): 阶段标题，用于标识具体的阶段步骤。
  - `input` (`string`, 可选): 输入路径，指向该阶段的输入文件。
  - `output` (`string`, 可选): 输出路径，指向该阶段的输出文件。

**Return Value**: 无返回值 (`void`)。通过 `process.stdout.write` 输出结果，`process.stderr.write` 输出错误。

**Core Logic**:

1. **参数验证**：依次检查 `session`、`status`、`stageName` 是否合法。status 必须在 `['in_progress', 'done', 'skipped']` 中，stageName 必须在 VALID_STAGES 中。任何验证失败都输出错误并 `process.exit(1)`。

2. **会话读取**：调用 `readSessionSettings(options.session)` 获取 SessionSettings，从中提取 `cwd` 和 `change`。如果会话不存在或没有关联的 change，输出错误并退出。

3. **构建 StageStep 数据**：使用当前时间的 ISO 字符串填充 `from` 和 `to` 字段（均为当前时间），`title`/`inputPath`/`outputPath` 使用 CLI 传入的值或空字符串。

4. **读取上下文**：调用 `readMemoryChangesJson` 获取当前内存中所有 change 的数据，找到目标 change 的 `stage` 对象。调用 `readPlanFeatures` 获取 plan.json 中的 features 列表。

5. **Change 结束检查**：调用 `isChangeEnded` 判断 change 是否已结束。如果已结束，仅允许 `integration`/`codecheck`/`archive`（以及当所有 features 都 done 时的 `coding`）通过。

6. **路由分发**：workflow 阶段直接 acknowledge 返回；explore 走独立的 `handleExploreStageDispatch` 逻辑；其余阶段通过 switch-case 分发到各自的 handler 函数。

**Core Code**:
```typescript
// Build the StageStep data
const now = new Date().toISOString();
const stageData = {
  title: options.title ?? '',
  inputPath: options.input ?? '',
  outputPath: options.output ?? '',
  from: now,
  to: now,
  status: options.status as 'in_progress' | 'done' | 'skipped',
};

// Read the current stage context from memory for all dispatch functions to share
const memoryData = readMemoryChangesJson(session.cwd);
const entry = memoryData.changes.find((c) => c.name === session.change);
const stage = entry?.stage as Record<string, unknown> | undefined;

// Read plan features once for all dispatch functions and change-end check
const features = readPlanFeatures(session.cwd, session.change);

// Check if the change has ended; only integration/codecheck/archive are allowed through.
const changeEnded = isChangeEnded(session.cwd, session.change);
const isCodingAllDone = stageName === 'coding' && features.every((f) => f.status === 'done');
if (changeEnded && !ENDED_ALLOWED_STAGES.includes(stageName) && !isCodingAllDone) {
  process.stdout.write(`Change '${session.change}' has ended, only integration/codecheck/archive is allowed\n`);
  logger.info(`Change '${session.change}' has ended, only integration/codecheck/archive is allowed`);
  return;
}
```
Source: `src/commands/change/stage.ts`:531-558

**Usage Example**:
```bash
# 开始 explore 阶段
furina change stage explore --session my-session-id --status in_progress --title "探索项目结构" --input "docs/requirements.md"

# 完成 coding 阶段的某个 feature
furina change stage coding --session my-session-id --status done --title "feat-user-login" --output "src/auth/login.ts"

# 结束时触发 integration
furina change stage coding --session my-session-id --status in_progress --title "集成测试" --input "src/"
```
Explanation: 每次调用都通过 `--session` 指定会话（包含 cwd 和 changeName），通过 `--status` 指定当前状态。智能路由确保数据被写入正确的内存位置。

---

### `isChangeEnded(cwd: string, changeName: string) -> boolean`

**Source**: `src/commands/change/stage.ts`:44-80

**Functionality**: 判断一个 change 是否已经结束。change 结束的判断标准有两个层次：(1) 该 change 在项目级 `furina/changes.json` 中不存在（可能已被删除）；(2) plan.json 存在且所有 feature 的 status 都为 `done`。这个函数是路由分发的关键前置判断——已结束的 change 只允许少数后期阶段（integration, codecheck, archive）继续操作。

**Parameters**:
- `cwd` (`string`): 项目工作目录的绝对路径。
- `changeName` (`string`): change 的 kebab-case 名称。

**Return Value**:
- `boolean`: `true` 表示 change 已结束，`false` 表示仍在进行中。

**Core Logic**:

1. 首先读取项目级 `{cwd}/furina/changes.json`，检查该 change 是否存在于 changes 数组中。如果文件不存在或 change 不在列表中，返回 `true`（视为已结束）。

2. 如果 change 存在于 changes.json 中，进一步读取 `{cwd}/furina/changes/{changeName}/plan.json`。如果 plan.json 不存在，返回 `false`（change 尚未到达 feature 阶段）。

3. 如果 plan.json 存在且 features 数组非空，检查是否所有 feature 的 status 都为 `'done'`。全部 done 则返回 `true`，否则返回 `false`。

**Core Code**:
```typescript
function isChangeEnded(cwd: string, changeName: string): boolean {
  // Check project-level changes.json for the change name
  const projectChangesPath = path.join(cwd, 'furina', 'changes.json');
  if (!fs.existsSync(projectChangesPath)) {
    return true;
  }
  try {
    const raw = fs.readFileSync(projectChangesPath, 'utf-8');
    const data = JSON.parse(raw) as { changes?: Array<{ name: string }> };
    const changes = Array.isArray(data.changes) ? data.changes : [];
    const found = changes.some((c) => c.name === changeName);
    if (!found) {
      return true;
    }
  } catch {
    return true;
  }
  // Check plan.json features
  const planPath = path.join(cwd, 'furina', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    return false;
  }
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features) || features.length === 0) {
      return false;
    }
    return features.every((f: { status?: string }) => f.status === 'done');
  } catch {
    return false;
  }
}
```
Source: `src/commands/change/stage.ts`:44-80

**Usage Example**:
```typescript
const ended = isChangeEnded('/path/to/project', 'user-auth');
if (ended) {
  console.log('该 change 已结束，只允许后期阶段操作');
}
```
Explanation: 这是一个内部函数，不对外导出。在 `runChangeStage` 中被调用以决定是否允许当前阶段的更新操作。

---

### `handleExploreStageDispatch(cwd, changeName, stageData, stage, features) -> void`

**Source**: `src/commands/change/stage.ts`:173-213

**Functionality**: explore 阶段的智能路由处理器。根据当前 change 的状态决定 stageData 应该写入 `explore` 字段还是转发到 coding 流程。核心设计理念是：当 change 已经完成了 explore 阶段并进入了 coding 阶段（plan.json 存在），后续的 explore 调用应该自动路由到 coding 流程，避免上层 agent 需要手动判断。

**Parameters**:
- `cwd` (`string`): 项目工作目录。
- `changeName` (`string`): change 名称。
- `stageData` (`StageStepData`): 已构建好的阶段步数据。
- `stage` (`Record<string, unknown> | undefined`): 当前内存中的 stage 上下文对象。
- `features` (`Array<{ featureId?: string; id?: string; status?: string }>`): plan.json 中的 features 列表。

**Return Value**: 无返回值 (`void`)。

**Core Logic**:

三层决策判断：
1. **stage 为空**：内存中没有任何阶段数据，直接写入 `explore` 字段。
2. **仅有 explore 且未完成**：stage 中只有 `explore` 键且其 status 不是 `done`，直接写入 `explore` 字段。
3. **plan.json 不存在**：说明 change 还没有进入 feature 规划阶段，写入 `explore`。
4. **其他情况**（plan.json 存在且 stage 有其他阶段数据）：说明 explore 已完成，转发到 `handleCodingStageDispatch`。

**Core Code**:
```typescript
function handleExploreStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
  features: Array<{ featureId?: string; id?: string; status?: string }>,
): void {
  if (!stage || Object.keys(stage).length === 0) {
    createOrUpdateChange(cwd, changeName, undefined, { explore: stageData });
    process.stdout.write(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'\n`);
    return;
  }
  const stageKeys = Object.keys(stage);
  const onlyExplore = stageKeys.length === 1 && stageKeys[0] === 'explore';
  if (onlyExplore) {
    const exploreStage = stage.explore as { status?: string } | undefined;
    if (!exploreStage || exploreStage.status !== 'done') {
      createOrUpdateChange(cwd, changeName, undefined, { explore: stageData });
      process.stdout.write(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'\n`);
      return;
    }
  }
  const planPath = path.join(cwd, 'furina', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    createOrUpdateChange(cwd, changeName, undefined, { explore: stageData });
    process.stdout.write(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'\n`);
    return;
  }
  handleCodingStageDispatch(cwd, changeName, stageData, stage, features);
}
```
Source: `src/commands/change/stage.ts`:173-213

**Usage Example**:
```typescript
// 当 explore 完成后 plan.json 已存在时，自动路由到 coding 流程
handleExploreStageDispatch(cwd, 'user-auth', stageData, existingStage, features);
// 输出: Stage 'explore' updated to 'done' for change 'user-auth'
// 实际数据写入了 subAgentDev 或 finalize.integration（取决于 features 状态）
```
Explanation: 工作流 agent 可能始终使用 `explore` 作为阶段名称来调用，但底层会根据 change 的进展自动路由到正确的存储位置。

---

### `handleCodingStageDispatch(cwd, changeName, stageData, stage, features) -> void`

**Source**: `src/commands/change/stage.ts`:119-159

**Functionality**: coding 阶段的智能路由处理器。根据 plan.json 中 features 的完成情况，决定 stageData 写入 `subAgentDev[]` 还是 `finalize.integration[]`。这是最重要的路由逻辑之一——当所有 features 都完成后，coding 阶段的数据应该进入集成阶段，而非继续堆积在子 agent 开发进度中。

**Parameters**:
- `cwd` (`string`): 项目工作目录。
- `changeName` (`string`): change 名称。
- `stageData` (`StageStepData`): 已构建好的阶段步数据。
- `stage` (`Record<string, unknown> | undefined`): 当前内存中的 stage 上下文。
- `features` (`Array<{ featureId?: string; id?: string; status?: string }>`): plan.json 中的 features 列表。

**Return Value**: 无返回值 (`void`)。

**Core Logic**:

1. **判断所有 features 是否完成**：`features.length > 0 && features.every(f => f.status === 'done')`

2. **全部完成 -> finalize.integration[]**：
   - 从 stage 中获取已有的 `finalize.integration` 数组
   - 按 `title` 查找已存在的条目
   - 如果找到：使用 `mergeStageStep` 进行非空覆盖合并
   - 如果未找到：直接追加新条目

3. **未全部完成 -> subAgentDev[]**：
   - 调用 `inferFeatureId` 获取当前 in_progress 的 featureId
   - 调用 `mergeSubAgentDevEntry` 将 stageData 写入对应 featureId 的 progress 数组

**Core Code**:
```typescript
function handleCodingStageDispatch(
  cwd: string, changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
  features: Array<{ featureId?: string; id?: string; status?: string }>,
): void {
  const allDone = features.length > 0 && features.every((f) => f.status === 'done');
  if (allDone) {
    const finalize = stage?.finalize as Record<string, unknown> | undefined;
    const existingIntegration = (finalize?.integration as Array<Record<string, unknown>> | undefined) ?? [];
    const existingIdx = existingIntegration.findIndex((item) => item.title === stageData.title);
    if (existingIdx >= 0) {
      const merged = mergeStageStep(existingIntegration[existingIdx], stageData);
      const updated = [...existingIntegration];
      updated[existingIdx] = merged;
      createOrUpdateChange(cwd, changeName, undefined, { finalize: { integration: updated } });
    } else {
      createOrUpdateChange(cwd, changeName, undefined, {
        finalize: { integration: [...existingIntegration, stageData as unknown as Record<string, unknown>] },
      });
    }
    return;
  }
  const featureId = inferFeatureId(cwd, changeName);
  const stageUpdate = mergeSubAgentDevEntry(stage, featureId, stageData);
  createOrUpdateChange(cwd, changeName, undefined, stageUpdate);
}
```
Source: `src/commands/change/stage.ts`:119-159

**Usage Example**:
```typescript
// 当 plan.json 中所有 features 都标记为 done 时
handleCodingStageDispatch(cwd, 'user-auth', stageData, stage, [
  { featureId: 'login', status: 'done' },
  { featureId: 'register', status: 'done' },
]);
// stageData 会写入 finalize.integration[]
```
Explanation: 这个函数也从 `handleExploreStageDispatch` 中被间接调用，实现 explore 到 coding 的自动转发。

---

### `handleReviewStageDispatch(cwd, changeName, stageData, stage, features) -> void`

**Source**: `src/commands/change/stage.ts`:331-356

**Functionality**: review 阶段的智能路由处理器。根据 features 的状态和 reviewArtifacts 的完成情况，决定写入 `reviewArtifacts`（面向所有 features 的整体审查）还是 `subAgentDev[]`（面向单个 feature 的审查进度）。

**Parameters**:
- `cwd` (`string`): 项目工作目录。
- `changeName` (`string`): change 名称。
- `stageData` (`StageStepData`): 已构建好的阶段步数据。
- `stage` (`Record<string, unknown> | undefined`): 当前内存中的 stage 上下文。
- `features` (`Array<{ featureId?: string; id?: string; status?: string }>`): plan.json 中的 features 列表。

**Return Value**: 无返回值 (`void`)。

**Core Logic**:

1. **判断是否全部 pending**：`features.length > 0 && features.every(f => f.status === 'pending')`
2. **检查 reviewArtifacts 状态**：获取 `stage.reviewArtifacts` 的 status
3. 如果所有 features 都是 pending **且** reviewArtifacts 未完成 -> 写入 `reviewArtifacts` 字段
4. 否则 -> 使用 `inferFeatureId` + `mergeSubAgentDevEntry` 写入 `subAgentDev[featureId].progress[]`

**Core Code**:
```typescript
function handleReviewStageDispatch(
  cwd: string, changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
  features: Array<{ featureId?: string; id?: string; status?: string }>,
): void {
  const allPending = features.length > 0 && features.every((f) => f.status === 'pending');
  const reviewArtifacts = stage?.reviewArtifacts as { status?: string } | undefined;
  if (allPending && (!reviewArtifacts || reviewArtifacts.status !== 'done')) {
    createOrUpdateChange(cwd, changeName, undefined, { reviewArtifacts: stageData });
    return;
  }
  const featureId = inferFeatureId(cwd, changeName);
  const stageUpdate = mergeSubAgentDevEntry(stage, featureId, stageData);
  createOrUpdateChange(cwd, changeName, undefined, stageUpdate);
}
```
Source: `src/commands/change/stage.ts`:331-356

**Usage Example**:
```typescript
// 当 features 全部是 pending（还没有开始开发）时，review 结果写入 reviewArtifacts
handleReviewStageDispatch(cwd, 'user-auth', stageData, stage, [
  { featureId: 'login', status: 'pending' },
  { featureId: 'register', status: 'pending' },
]);
// stageData 写入 reviewArtifacts
```
Explanation: reviewArtifacts 是面向整个 change 的审查记录，而 subAgentDev 是面向单个 feature 的开发进度。路由逻辑确保审查记录放在最合适的位置。

---

### `mergeSubAgentDevEntry(stage, featureId, stageData) -> StageUpdate`

**Source**: `src/commands/change/stage.ts`:283-316

**Functionality**: 将 stageData 合并到 `stage.subAgentDev` 数组中，按 featureId 定位目标条目，然后在该条目的 progress 数组中按 title 查找并合并或追加。这是 coding/review 阶段写入 subAgentDev 存储的核心合并逻辑。

**Parameters**:
- `stage` (`Record<string, unknown> | undefined`): 当前内存中的 stage 上下文对象。
- `featureId` (`string`): 目标 feature 的 ID，用于在 subAgentDev 数组中定位条目。
- `stageData` (`StageStepData`): 要合并的阶段步数据。

**Return Value**:
- `StageUpdate`: 包含更新后 `subAgentDev` 数组的对象，可直接传给 `createOrUpdateChange`。

**Core Logic**:

1. 从 stage 中获取已有的 `subAgentDev` 数组（如果不存在则为空数组）
2. 在数组中按 `featureId` 查找已有的 `SubAgentDevProgress` 条目
3. **如果找到匹配的 featureId**：
   - 进一步在该条目的 `progress` 数组中按 `title` 查找
   - 如果找到 title 匹配：使用 `mergeStageStep` 进行非空覆盖合并
   - 如果未找到 title 匹配：追加新的 progress 条目
4. **如果未找到匹配的 featureId**：创建新的 `{ featureId, progress: [stageData] }` 条目并追加到数组

**Core Code**:
```typescript
function mergeSubAgentDevEntry(
  stage: Record<string, unknown> | undefined,
  featureId: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): StageUpdate {
  const subAgentDevArray = (stage?.subAgentDev as Array<{ featureId?: string; progress?: Array<Record<string, unknown>> }> | undefined) ?? [];
  const existingEntry = subAgentDevArray.find((e) => e.featureId === featureId);
  if (existingEntry && existingEntry.progress) {
    const existingProgress = existingEntry.progress.find((p) => p.title === stageData.title);
    if (existingProgress) {
      const merged = mergeStageStep(existingProgress, stageData);
      const updatedProgress = existingEntry.progress.map((p) => (p.title === stageData.title ? merged : p));
      const updatedSubAgentDev = subAgentDevArray.map((e) =>
        e.featureId === featureId ? { ...e, progress: updatedProgress } : e,
      );
      return { subAgentDev: updatedSubAgentDev };
    } else {
      const updatedProgress = [...existingEntry.progress, stageData as unknown as Record<string, unknown>];
      const updatedSubAgentDev = subAgentDevArray.map((e) =>
        e.featureId === featureId ? { ...e, progress: updatedProgress } : e,
      );
      return { subAgentDev: updatedSubAgentDev };
    }
  } else {
    const newEntry = { featureId, progress: [stageData as unknown as Record<string, unknown>] };
    return { subAgentDev: [...subAgentDevArray, newEntry] };
  }
}
```
Source: `src/commands/change/stage.ts`:283-316

**Usage Example**:
```typescript
const stageUpdate = mergeSubAgentDevEntry(stage, 'feat-login', {
  title: '实现登录接口',
  inputPath: 'specs/auth.md',
  outputPath: 'src/auth/login.ts',
  from: '2026-07-01T10:00:00Z',
  to: '2026-07-01T12:00:00Z',
  status: 'done',
});
createOrUpdateChange(cwd, 'user-auth', undefined, stageUpdate);
```
Explanation: 如果 `subAgentDev` 中已存在 `featureId === 'feat-login'` 的条目且 progress 中有 title 匹配的记录，则合并更新；否则追加新记录。

---

### `mergeStageStep(existing, incoming) -> Record<string, unknown>`

**Source**: `src/commands/change/stage.ts`:416-428

**Functionality**: 非空覆盖合并策略的核心实现。将 incoming 的 StageStep 字段合并到已有的 Record 对象上，仅当 incoming 的字段值为非空字符串时才覆盖。`status` 字段例外——无条件覆盖。这个函数被多个路由 handler 使用（`handleCodingStageDispatch`、`handleIntegrationStageDispatch`、`handleCodecheckStageDispatch`、`handleArchiveStageDispatch`），是合并策略的统一入口。

**Parameters**:
- `existing` (`Record<string, unknown> | undefined`): 已有的阶段步数据对象。
- `incoming` (`{ title, inputPath, outputPath, from, to, status }`): 新传入的阶段步数据。

**Return Value**:
- `Record<string, unknown>`: 合并后的阶段步数据对象。

**Core Logic**:

1. 以 `existing` 的浅拷贝为基准（如果 existing 为 undefined 则用空对象）
2. 对 `title`、`inputPath`、`outputPath`、`from`、`to` 五个字段：仅当 incoming 值为真值且不为空字符串时覆盖
3. `status` 字段：无条件使用 incoming 的值覆盖

**Core Code**:
```typescript
function mergeStageStep(
  existing: Record<string, unknown> | undefined,
  incoming: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: string },
): Record<string, unknown> {
  const base = existing ? { ...existing } : {};
  if (incoming.title && incoming.title !== '') base.title = incoming.title;
  if (incoming.inputPath && incoming.inputPath !== '') base.inputPath = incoming.inputPath;
  if (incoming.outputPath && incoming.outputPath !== '') base.outputPath = incoming.outputPath;
  if (incoming.from && incoming.from !== '') base.from = incoming.from;
  if (incoming.to && incoming.to !== '') base.to = incoming.to;
  base.status = incoming.status;
  return base;
}
```
Source: `src/commands/change/stage.ts`:416-428

**Usage Example**:
```typescript
const existing = { title: '旧标题', from: '2026-07-01T10:00:00Z', status: 'in_progress' };
const incoming = { title: '', from: '', to: '2026-07-01T12:00:00Z', status: 'done', inputPath: '', outputPath: 'out.md' };
const merged = mergeStageStep(existing, incoming);
// 结果: { title: '旧标题', from: '2026-07-01T10:00:00Z', to: '2026-07-01T12:00:00Z', status: 'done', outputPath: 'out.md' }
// title 和 from 保留了旧值（incoming 为空），status 被无条件覆盖
```
Explanation: 这个合并策略确保增量更新不会丢失已有的非空数据。当 agent 仅更新 output 和 status 时，title/from 等已有值被安全保留。

---

### `inferFeatureId(cwd: string, changeName: string) -> string`

**Source**: `src/commands/change/stage.ts`:90-104

**Functionality**: 从 plan.json 中推断当前正在开发的 featureId。查找第一个 `status === 'in_progress'` 的 feature，返回其 `featureId` 或 `id` 字段。如果没有找到（所有 feature 都 pending 或 done），返回空字符串。

**Parameters**:
- `cwd` (`string`): 项目工作目录。
- `changeName` (`string`): change 名称。

**Return Value**:
- `string`: 当前 in_progress 的 featureId，或空字符串（未找到时）。

**Core Logic**:

1. 读取 `{cwd}/furina/changes/{changeName}/plan.json`
2. 如果文件不存在或不是数组，返回 `''`
3. 使用 `Array.find` 查找第一个 `status === 'in_progress'` 的条目
4. 返回该条目的 `featureId`（优先）或 `id` 字段，均不存在则返回 `''`

**Core Code**:
```typescript
function inferFeatureId(cwd: string, changeName: string): string {
  const planPath = path.join(cwd, 'furina', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    return '';
  }
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features)) return '';
    const inProgress = features.find((f: { status?: string; featureId?: string; id?: string }) => f.status === 'in_progress');
    return inProgress?.featureId ?? inProgress?.id ?? '';
  } catch {
    return '';
  }
}
```
Source: `src/commands/change/stage.ts`:90-104

**Usage Example**:
```typescript
const featureId = inferFeatureId('/path/to/project', 'user-auth');
// 返回 'feat-login'（如果该 feature 的 status 为 in_progress）
// 返回 ''（如果没有 in_progress 的 feature）
```
Explanation: 此函数在 `handleCodingStageDispatch` 和 `handleReviewStageDispatch` 中被调用，用于确定 stageData 应该关联到哪个 feature 的开发进度。

---

### `readPlanFeatures(cwd: string, changeName: string) -> Array<...>`

**Source**: `src/commands/change/stage.ts`:258-271

**Functionality**: 读取 plan.json 中的 features 数组。与 `inferFeatureId` 不同，这个函数返回完整的 features 列表（而非仅第一个 in_progress 的 ID），供多个路由 handler 使用。

**Parameters**:
- `cwd` (`string`): 项目工作目录。
- `changeName` (`string`): change 名称。

**Return Value**:
- `Array<{ featureId?: string; id?: string; status?: string }>`: features 数组，文件不存在或解析失败时返回空数组。

**Core Logic**:

读取 `{cwd}/furina/changes/{changeName}/plan.json`，解析 JSON 并验证为数组。文件不存在、解析失败、或内容不是数组时均返回空数组。

**Core Code**:
```typescript
function readPlanFeatures(cwd: string, changeName: string): Array<{ featureId?: string; id?: string; status?: string }> {
  const planPath = path.join(cwd, 'furina', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features)) return [];
    return features;
  } catch {
    return [];
  }
}
```
Source: `src/commands/change/stage.ts`:258-271

**Usage Example**:
```typescript
const features = readPlanFeatures('/path/to/project', 'user-auth');
// 返回: [{ featureId: 'feat-login', status: 'in_progress' }, { featureId: 'feat-register', status: 'pending' }]
```
Explanation: 此函数在 `runChangeStage` 中被一次性调用，结果传递给所有后续的路由 handler，避免重复读取文件。

---

### `handleIntegrationStageDispatch(cwd, changeName, stageData, stage) -> void`

**Source**: `src/commands/change/stage.ts`:365-391

**Functionality**: integration 阶段的处理器。将 stageData 写入 `finalize.integration[]` 数组，使用按 title 匹配的数组合并逻辑。与 `handleCodingStageDispatch` 中 allDone 分支的逻辑完全一致。

**Parameters**:
- `cwd` (`string`): 项目工作目录。
- `changeName` (`string`): change 名称。
- `stageData` (`StageStepData`): 阶段步数据。
- `stage` (`Record<string, unknown> | undefined`): 当前 stage 上下文。

**Return Value**: 无 (`void`)。

**Core Logic**:

获取 `stage.finalize.integration` 数组 -> 按 `title` 查找 -> 找到则 `mergeStageStep` 合并 -> 未找到则追加。使用 `createOrUpdateChange` 写入 `{ finalize: { integration: [...] } }`。

**Core Code**:
```typescript
function handleIntegrationStageDispatch(
  cwd: string, changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
): void {
  const finalize = stage?.finalize as Record<string, unknown> | undefined;
  const existingIntegration = (finalize?.integration as Array<Record<string, unknown>> | undefined) ?? [];
  const existingIdx = existingIntegration.findIndex((item) => item.title === stageData.title);
  if (existingIdx >= 0) {
    const merged = mergeStageStep(existingIntegration[existingIdx], stageData);
    const updated = [...existingIntegration];
    updated[existingIdx] = merged;
    createOrUpdateChange(cwd, changeName, undefined, { finalize: { integration: updated } });
  } else {
    createOrUpdateChange(cwd, changeName, undefined, {
      finalize: { integration: [...existingIntegration, stageData as unknown as Record<string, unknown>] },
    });
  }
}
```
Source: `src/commands/change/stage.ts`:365-391

---

### `handleCodecheckStageDispatch(cwd, changeName, stageData, stage) -> void`

**Source**: `src/commands/change/stage.ts`:438-450

**Functionality**: codecheck 阶段的处理器。将 stageData 写入 `finalize.codecheck` 字段，使用 `mergeStageStep` 与已有数据合并。codecheck 是 `finalize` 下的单值字段（非数组），存储代码检查的整体结果。

**Parameters**:
- `cwd` (`string`): 项目工作目录。
- `changeName` (`string`): change 名称。
- `stageData` (`StageStepData`): 阶段步数据。
- `stage` (`Record<string, unknown> | undefined`): 当前 stage 上下文。

**Return Value**: 无 (`void`)。

**Core Logic**:

获取 `stage.finalize.codecheck` -> 使用 `mergeStageStep` 与 stageData 合并 -> 写入 `{ finalize: { codecheck: merged } }`。

---

### `handleArchiveStageDispatch(cwd, changeName, stageData, stage) -> void`

**Source**: `src/commands/change/stage.ts`:460-472

**Functionality**: archive 阶段的处理器。将 stageData 写入 `finalize.archive` 字段，使用 `mergeStageStep` 与已有数据合并。archive 是 `finalize` 下的单值字段，记录归档操作的状态。

**Parameters**: 与 `handleCodecheckStageDispatch` 相同。

**Return Value**: 无 (`void`)。

**Core Logic**: 与 codecheck 处理器结构一致，目标字段为 `finalize.archive`。

---

### 简单处理器: `handleProposeStageDispatch` / `handlePlanStageDispatch` / `handleBrainstormStageDispatch`

**Source**: `src/commands/change/stage.ts`:222-249 (propose), 240-249 (plan), 401-410 (brainstorm)

**Functionality**: 三个简单的直接写入处理器。它们不进行智能路由，直接将 stageData 赋值给对应的 stage 字段：`{ propose: stageData }`、`{ plan: stageData }`、`{ brainstorm: stageData }`。

**Parameters**:
- `cwd` (`string`): 项目工作目录。
- `changeName` (`string`): change 名称。
- `stageData` (`StageStepData`): 阶段步数据。
- `stage` (`Record<string, unknown> | undefined`): 当前 stage 上下文（在此类处理器中未使用）。

**Core Logic**: 仅一行调用 `createOrUpdateChange(cwd, changeName, undefined, { [fieldName]: stageData })`，加 stdout/logger 输出。

## Data Structures

### `VALID_STAGES`

```typescript
const VALID_STAGES = [
  'workflow', 'explore', 'brainstorm', 'propose', 'plan',
  'review', 'coding', 'integration', 'codecheck', 'archive',
] as const;
```
- `workflow`: 工作流启动阶段，仅 acknowledge 不写入数据
- `explore`: 探索阶段，智能路由到 explore 或 coding
- `brainstorm`: 头脑风暴阶段
- `propose`: 提案阶段
- `plan`: 计划阶段
- `review`: 审查阶段，智能路由到 reviewArtifacts 或 subAgentDev
- `coding`: 编码阶段，智能路由到 subAgentDev 或 finalize.integration
- `integration`: 集成阶段，写入 finalize.integration[]
- `codecheck`: 代码检查阶段，写入 finalize.codecheck
- `archive`: 归档阶段，写入 finalize.archive

### `ENDED_ALLOWED_STAGES`

```typescript
const ENDED_ALLOWED_STAGES: string[] = ['integration', 'codecheck', 'archive'];
```
- 当 change 已结束时，仅这三个阶段被允许继续操作。coding 阶段在特殊条件下（所有 features done）也被允许，因为它会路由到 finalize.integration[]。

### `ValidStage`

```typescript
type ValidStage = (typeof VALID_STAGES)[number];
```
- 由 VALID_STAGES 常量数组推导出的联合类型。

### StageStepData (内联类型)

在各 handler 函数中使用的参数类型，结构如下：
```typescript
{
  title: string;        // 阶段步骤标题
  inputPath: string;    // 输入文件路径
  outputPath: string;   // 输出文件路径
  from: string;         // 开始时间 ISO 字符串
  to: string;           // 结束时间 ISO 字符串
  status: 'in_progress' | 'done' | 'skipped';
}
```

### 下游依赖类型 (来自 `src/utils/memory.ts`)

#### `StageUpdate`
```typescript
interface StageUpdate {
  explore?: Partial<StageStep>;
  brainstorm?: Partial<StageStep>;
  propose?: Partial<StageStep>;
  plan?: Partial<StageStep>;
  reviewArtifacts?: Partial<StageStep>;
  subAgentDev?: unknown[];
  finalize?: { integration?: Partial<StageStep>[]; codecheck?: Partial<StageStep>; archive?: Partial<StageStep> };
  review?: Partial<StageStep>;
  coding?: unknown[];
}
```
- 各路由 handler 构建此类型的子集传给 `createOrUpdateChange`。

#### `StageStep`
```typescript
interface StageStep {
  title: string;
  from: string;
  to: string;
  status: 'in_progress' | 'skipped' | 'done';
  inputPath: string;
  outputPath: string;
}
```

#### `ChangeStage`
```typescript
interface ChangeStage {
  explore: StageStep;
  brainstorm: StageStep;
  propose: StageStep;
  plan: StageStep;
  reviewArtifacts: StageStep;
  subAgentDev: SubAgentDevProgress[];
  finalize: FinalizeStage;
}
```

#### `SubAgentDevProgress`
```typescript
interface SubAgentDevProgress {
  featureId: string;
  progress: StageStep[];
}
```

#### `FinalizeStage`
```typescript
interface FinalizeStage {
  integration: StageStep[];
  codecheck: StageStep;
  archive: StageStep;
}
```

## Error Handling and Edge Cases

### 参数验证（致命错误，进程退出）

所有参数验证失败都输出到 `process.stderr` 并调用 `process.exit(1)`：
- `--session` 缺失
- `--status` 缺失
- `--status` 值不在 `['in_progress', 'done', 'skipped']` 中
- `stageName` 不在 `VALID_STAGES` 中
- 会话 ID 对应的 settings.json 不存在
- 会话没有关联的 change

### 文件读取错误（静默降级）

以下场景使用 try-catch 包裹，失败时返回安全的默认值：
- `readPlanFeatures`: plan.json 不存在或解析失败 -> 返回空数组
- `inferFeatureId`: plan.json 不存在或解析失败 -> 返回空字符串
- `isChangeEnded`: changes.json 或 plan.json 解析失败 -> 合理的降级行为（changes.json 失败返回 true，plan.json 失败返回 false）

### Change 已结束保护

当 `isChangeEnded` 返回 `true` 时，仅允许 `integration`/`codecheck`/`archive` 以及特殊条件下（所有 features done）的 `coding` 通过。其他阶段直接输出信息并返回，不修改任何数据。

### 空数据保护

- `mergeStageStep` 中空字符串不会覆盖已有值，确保增量更新的安全性
- `mergeSubAgentDevEntry` 中当 subAgentDev 数组为空时自动创建新条目
- `handleIntegrationStageDispatch` 中当 integration 数组为空时自动追加
- 当 `inferFeatureId` 返回空字符串时，subAgentDev 条目使用空字符串作为 featureId（功能退化但不会报错）

## Dependencies

### Depends on

- **`src/utils/session.ts`** (`readSessionSettings`): 读取会话配置获取 `cwd` 和 `change` 名称
- **`src/utils/memory.ts`** (`readMemoryChangesJson`, `createOrUpdateChange`, `StageUpdate`): 读取全局内存中的 change 数据，以及写入/更新 change 条目
- **`src/utils/logger.ts`** (`logger`): 日志输出
- **Node.js built-in** (`fs`, `path`): 文件系统操作，用于读取 plan.json 和 changes.json

### Depended by

- **`src/commands/change/index.ts`**: Commander 注册入口，调用 `runChangeStage`
- **工作流 agent** (外部调用者): 通过 CLI 命令 `furina change stage` 间接调用

## Usage Examples

### 完整工作流场景

```bash
# 1. 开始 explore 阶段
furina change stage explore \
  --session sess-abc123 \
  --status in_progress \
  --title "探索项目结构" \
  --input "docs/requirements.md"

# 2. 完成 explore 阶段（此时 plan.json 尚不存在，数据写入 explore）
furina change stage explore \
  --session sess-abc123 \
  --status done \
  --output "furina/changes/user-auth/plan.json"

# 3. 开始 coding 阶段（plan.json 已存在，explore 自动路由到 coding）
# 此时使用 explore 作为 stageName，但会被自动路由到 subAgentDev
furina change stage explore \
  --session sess-abc123 \
  --status in_progress \
  --title "feat-login" \
  --input "specs/auth/login.md"

# 4. 直接使用 coding 阶段名
furina change stage coding \
  --session sess-abc123 \
  --status done \
  --title "feat-login" \
  --output "src/auth/login.ts"

# 5. 所有 features 完成后，coding 自动路由到 finalize.integration
furina change stage coding \
  --session sess-abc123 \
  --status in_progress \
  --title "集成测试" \
  --input "src/"

# 6. 进入 integration 阶段
furina change stage integration \
  --session sess-abc123 \
  --status done \
  --title "集成测试通过"

# 7. 代码检查
furina change stage codecheck \
  --session sess-abc123 \
  --status done \
  --title "ESLint + TypeScript 检查通过"
```

### 内存中的数据结构演变

```json
// 阶段 1: explore 开始
{ "stage": { "explore": { "title": "探索项目结构", "status": "in_progress", ... } } }

// 阶段 2: explore 完成
{ "stage": { "explore": { "title": "探索项目结构", "status": "done", ... } } }

// 阶段 4: coding 进行中
{ "stage": {
    "explore": { "title": "探索项目结构", "status": "done", ... },
    "subAgentDev": [
      { "featureId": "feat-login", "progress": [
        { "title": "feat-login", "status": "done", ... }
      ]}
    ]
}}

// 阶段 5: 所有 features 完成，coding 路由到 finalize
{ "stage": {
    "explore": { "status": "done", ... },
    "subAgentDev": [ ... ],
    "finalize": {
      "integration": [{ "title": "集成测试", "status": "in_progress", ... }]
    }
}}
```

### 简单直接写入场景

```bash
# brainstorm 阶段 — 直接写入 stage.brainstorm
furina change stage brainstorm \
  --session sess-abc123 \
  --status in_progress \
  --title "方案讨论"

# propose 阶段 — 直接写入 stage.propose
furina change stage propose \
  --session sess-abc123 \
  --status done \
  --title "提交设计方案" \
  --output "furina/changes/user-auth/proposal.md"

# plan 阶段 — 直接写入 stage.plan
furina change stage plan \
  --session sess-abc123 \
  --status done \
  --title "制定实施计划" \
  --output "furina/changes/user-auth/plan.json"
```

Explanation: brainstorm/propose/plan 阶段不涉及智能路由，直接将 stageData 写入对应的 stage 字段。这简化了工作流 agent 在这些阶段的调用逻辑。
