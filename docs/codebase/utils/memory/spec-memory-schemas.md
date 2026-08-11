# Memory Zod Schemas and Types

> Source files:
> - `src/utils/memory.ts` : 1-123

## Overview

本 Spec 定义了 Furina 全局记忆系统（Global Memory System）的**数据模型层**，涵盖所有 Zod schema 定义、推导的 TypeScript 类型，以及一个路径扁平化工具函数 `flattenCwdPath`。

**在系统中的定位**：memory.ts 模块是全局记忆系统的核心，而本 Spec 覆盖的是其最底层的"骨架"——数据结构定义。这些 schema 和类型被 memory.ts 内部的 I/O 函数（`readMemoryChangesJson`、`writeMemoryChangesJson`）、stage 合并处理器（`handleExploreStage` 等）、变更生命周期函数（`createOrUpdateChange`）以及外部命令模块（`commands/change/stage.ts`、`commands/change/new.ts`）、服务端模块（`server/changes/shared.ts`）、前端组件（`StageSummary`、`StageProgressAxis`）广泛引用。

**设计动机**：Furina 的变更管理遵循一条 7 阶段工作流（explore -> brainstorm -> propose -> plan -> reviewArtifacts -> subAgentDev -> finalize），每个阶段有独立的状态和进度记录。数据模型需要精确表达这种多层级、可嵌套的阶段结构，同时支持从 CLI 接收"宽松格式"的部分更新数据。Zod schema 在这里起到运行时类型校验 + TypeScript 类型推导的双重作用。

**使用场景**：
- 读写 `~/.furina/memory/{flatCwd}/changes.json` 时，通过 `ChangesJson` 类型约束数据格式
- CLI `furina change stage` 命令通过 `StageUpdate` 接口传入部分阶段数据
- 服务端 `getAllChanges()` 扫描所有 Memory_ 目录时使用 `ChangeEntry` 类型
- 前端组件渲染阶段进度轴和变更摘要时依赖这些类型

**涉及文件与职责**：

| 文件 | 职责 |
|------|------|
| `src/utils/memory.ts:1-123` | Zod schema 定义、类型推导、StageUpdate 接口、flattenCwdPath |
| `src/utils/common.ts:15-20` | normalizePath（flattenCwdPath 的依赖） |

## Architecture / Flow

数据模型的 schema 采用自底向上的组合式设计：

```
StageStepSchema (单个阶段步骤)
    |
    +-- SubAgentDevProgressSchema (子代理开发进度: featureId + StageStep[])
    |
    +-- FinalizeStageSchema (收尾阶段: integration[] + codecheck + archive)
    |
    +-- ChangeStageSchema (完整变更阶段: 5个StageStep + SubAgentDevProgress[] + FinalizeStage)
            |
            +-- ChangeEntrySchema (单个变更条目: 元数据 + 可选的ChangeStage)
                    |
                    +-- ChangesJsonSchema (顶层结构: framework + version + cwd + ChangeEntry[])
```

同时定义了一个"宽松输入"接口 `StageUpdate`，用于接收来自 CLI 的部分更新数据。该接口使用 `Partial<StageStep>` 和 `unknown[]`，使得调用方可以只提供需要更新的字段。

`flattenCwdPath` 将文件系统路径转换为安全的目录名，是全局记忆目录寻址的基础。转换链路：`cwd` -> `normalizePath()` -> 替换 `:` -> 替换 `/` -> 加 `Memory_` 前缀。

## Functionality / Interface Details

### `flattenCwdPath(cwd: string) -> string`

**Source**: `src/utils/memory.ts`:33-35

**Functionality**: 将当前工作目录（cwd）路径转换为一个安全的、可用于文件系统目录名的扁平化字符串。这是全局记忆目录寻址的核心函数——每个项目工作目录对应 `~/.furina/memory/` 下的一个唯一子目录，子目录名就是 `flattenCwdPath(cwd)` 的结果。设计上确保不同路径不会产生冲突：Windows 盘符 `:` 被替换为 `_`，路径分隔符 `/` 被替换为 `_`，最终加上 `Memory_` 前缀以标识这是记忆目录。

**Parameters**:
- `cwd` (`string`): 当前工作目录的文件系统路径，可以是 Windows 风格（`D:\project-code\llm\furina`）或 Unix 风格（`/home/user/project`）

**Return Value**:
- `string`: 扁平化后的目录名，格式为 `Memory_` + 路径各段以下划线连接。例如 `D:\project-code\llm\furina` 转换为 `Memory_D__project-code_llm_furina`

**Core Logic**:
函数分三步进行转换：
1. 先调用 `normalizePath(cwd)` 统一路径分隔符（反斜杠转正斜杠、合并连续斜杠、去除尾部斜杠）
2. 将所有冒号 `:` 替换为下划线 `_`（处理 Windows 盘符 `C:` -> `C_`）
3. 将所有正斜杠 `/` 替换为下划线 `_`
4. 在结果前加 `Memory_` 前缀

**Core Code**:
```typescript
export function flattenCwdPath(cwd: string): string {
  return 'Memory_' + normalizePath(cwd).replace(/:/g, '_').replace(/\//g, '_');
}
```
Source: `src/utils/memory.ts`:33-35

**Usage Example**:
```typescript
import { flattenCwdPath } from './utils/memory.js';

// Windows 路径
const dir1 = flattenCwdPath('D:\\project-code\\llm\\furina');
// => 'Memory_D__project-code_llm_furina'

// Unix 路径
const dir2 = flattenCwdPath('/home/user/project');
// => 'Memory_home_user_project'

// 用于构建记忆目录完整路径
const memoryPath = path.join(os.homedir(), '.furina', 'memory', flattenCwdPath(process.cwd()));
```
Explanation: `flattenCwdPath` 将任意文件系统路径转换为唯一的目录名。外部模块 `server/changes/shared.ts` 使用它来定位特定项目的 Memory_ 目录，内部函数 `getMemoryDir` 也使用它来构建 `~/.furina/memory/` 下的完整路径。

---

### `StageStepSchema`

**Source**: `src/utils/memory.ts`:38-45

**Functionality**: 定义单个阶段步骤（Stage Step）的数据结构。每个阶段步骤记录了工作流中某个阶段的一次执行实例，包括标题、起止时间戳、状态和输入/输出路径。这是整个数据模型中最基础的原子单元，被后续所有 schema 组合使用。

**Schema 定义**:
```typescript
export const StageStepSchema = z.object({
  title: z.string(),
  from: z.string(),
  to: z.string(),
  status: z.enum(['in_progress', 'skipped', 'done']),
  inputPath: z.string().default(''),
  outputPath: z.string().default(''),
});
```

**字段说明**:
- `title` (`string`): 阶段步骤的描述性标题，标识这次执行的具体内容
- `from` (`string`): 阶段开始的时间戳（ISO 8601 格式）
- `to` (`string`): 阶段结束的时间戳（ISO 8601 格式），进行中时可能与 from 相同
- `status` (`'in_progress' | 'skipped' | 'done'`): 步骤状态。`in_progress` 表示正在执行，`done` 表示已完成，`skipped` 表示被跳过
- `inputPath` (`string`, 默认 `''`): 输入产物的相对路径（如 spec 文档、探索报告等）
- `outputPath` (`string`, 默认 `''`): 输出产物的相对路径（如生成的设计文档、代码文件等）

**推导类型**:
```typescript
export type StageStep = z.infer<typeof StageStepSchema>;
```

---

### `SubAgentDevProgressSchema`

**Source**: `src/utils/memory.ts`:51-54

**Functionality**: 定义子代理开发进度的数据结构。在 subAgentDev 阶段，系统按 featureId 维度跟踪开发进度，每个 feature 可以有多个顺序执行的进度步骤（progress array）。这支持了"一个变更包含多个 feature，每个 feature 独立开发和跟踪进度"的业务场景。

**Schema 定义**:
```typescript
export const SubAgentDevProgressSchema = z.object({
  featureId: z.string(),
  progress: z.array(StageStepSchema),
});
```

**字段说明**:
- `featureId` (`string`): 对应 plan.json 中的 feature id，标识正在开发的功能特性
- `progress` (`StageStep[]`): 该 feature 的开发进度步骤数组，按时间顺序排列。每个元素是一个 `StageStep`

**推导类型**:
```typescript
export type SubAgentDevProgress = z.infer<typeof SubAgentDevProgressSchema>;
```

---

### `FinalizeStageSchema`

**Source**: `src/utils/memory.ts`:60-64

**Functionality**: 定义收尾阶段（finalize）的数据结构。收尾阶段是工作流的最后阶段，包含三个子阶段：集成测试（integration，可包含多个步骤）、代码检查（codecheck，单步）和归档（archive，单步）。集成测试支持多步骤是因为一次变更可能涉及多个 feature 的集成验证。

**Schema 定义**:
```typescript
export const FinalizeStageSchema = z.object({
  integration: z.array(StageStepSchema),
  codecheck: StageStepSchema,
  archive: StageStepSchema,
});
```

**字段说明**:
- `integration` (`StageStep[]`): 集成测试步骤数组，支持多次集成验证
- `codecheck` (`StageStep`): 代码检查步骤，单个步骤
- `archive` (`StageStep`): 归档步骤，单个步骤

**推导类型**:
```typescript
export type FinalizeStage = z.infer<typeof FinalizeStageSchema>;
```

---

### `ChangeStageSchema`

**Source**: `src/utils/memory.ts`:70-78

**Functionality**: 定义变更的完整工作流阶段数据结构。一个变更经历 7 个工作流阶段：探索（explore）、头脑风暴（brainstorm）、提案（propose）、计划（plan）、产物审查（reviewArtifacts）、子代理开发（subAgentDev）、收尾（finalize）。其中前 5 个阶段各为单个 `StageStep`，subAgentDev 为 `SubAgentDevProgress[]`（支持多 feature 并行/顺序开发），finalize 为 `FinalizeStage`（包含 integration/codecheck/archive 三个子阶段）。

**Schema 定义**:
```typescript
export const ChangeStageSchema = z.object({
  explore: StageStepSchema,
  brainstorm: StageStepSchema,
  propose: StageStepSchema,
  plan: StageStepSchema,
  reviewArtifacts: StageStepSchema,
  subAgentDev: z.array(SubAgentDevProgressSchema),
  finalize: FinalizeStageSchema,
});
```

**字段说明**:
- `explore` (`StageStep`): 探索阶段，理解现有实现和架构
- `brainstorm` (`StageStep`): 头脑风暴阶段，讨论方案可能性
- `propose` (`StageStep`): 提案阶段，生成提案文档
- `plan` (`StageStep`): 计划阶段，拆分 feature 任务
- `reviewArtifacts` (`StageStep`): 产物审查阶段，审查生成的设计文档和规范
- `subAgentDev` (`SubAgentDevProgress[]`): 子代理开发阶段，按 feature 维度跟踪开发进度
- `finalize` (`FinalizeStage`): 收尾阶段，包含集成测试、代码检查和归档

**推导类型**:
```typescript
export type ChangeStage = z.infer<typeof ChangeStageSchema>;
```

---

### `StageUpdate` (Interface)

**Source**: `src/utils/memory.ts`:84-94

**Functionality**: 阶段更新的"宽松输入"接口。与 `ChangeStageSchema` 的严格结构不同，`StageUpdate` 使用 `Partial<StageStep>` 和可选字段，使得 CLI 命令和上游调用方可以只传入需要更新的阶段数据，无需构造完整的 `ChangeStage` 对象。这是连接外部输入与内部严格数据模型的适配层。

**接口定义**:
```typescript
export interface StageUpdate {
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

**字段说明**:
- `explore` (`Partial<StageStep>?`): 探索阶段部分数据
- `brainstorm` (`Partial<StageStep>?`): 头脑风暴阶段部分数据
- `propose` (`Partial<StageStep>?`): 提案阶段部分数据
- `plan` (`Partial<StageStep>?`): 计划阶段部分数据
- `reviewArtifacts` (`Partial<StageStep>?`): 产物审查阶段部分数据
- `subAgentDev` (`unknown[]?`): 子代理开发阶段数据，使用 `unknown[]` 以支持灵活的输入格式
- `finalize` (`{ integration?, codecheck?, archive? }?`): 收尾阶段部分数据，内部字段也是 Partial
- `review` (`Partial<StageStep>?`): reviewArtifacts 的别名，`createOrUpdateStage` 中会将其映射到 `reviewArtifacts`
- `coding` (`unknown[]?`): subAgentDev 的别名，`createOrUpdateStage` 中会将其映射到 `subAgentDev`

**设计说明**: `review` 和 `coding` 是为了兼容 CLI 命令中使用更简洁的阶段名称而保留的别名字段。在 `createOrUpdateStage` 分发器中，优先使用正式名称（`reviewArtifacts`/`subAgentDev`），回退到别名（`review`/`coding`）。

---

### `ChangeEntrySchema`

**Source**: `src/utils/memory.ts`:97-108

**Functionality**: 定义单个变更条目的完整数据结构。每个变更条目记录了变更的基本元数据（名称、路径、描述、时间戳、状态）以及可选的工作流阶段数据。这是 `changes.json` 文件中 `changes` 数组的元素类型。

**Schema 定义**:
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
```

**字段说明**:
- `name` (`string`): 变更名称，kebab-case 格式，唯一标识一个变更
- `path` (`string`): 变更目录的相对路径（如 `furina/changes/my-feature`），归档后可能指向 `furina/archive/YYYY-MM-DD-name`
- `description` (`string`): 变更描述
- `createdAt` (`string`): 创建时间（ISO 8601 格式）
- `updateAt` (`string?`): 最后更新时间（ISO 8601 格式），可选
- `status` (`'active' | 'archived' | 'removed'`): 变更状态。`active` 表示进行中，`archived` 表示已归档，`removed` 表示目录已不存在
- `features` (`number`): 总 feature 数量，从 plan.json 同步
- `todo` (`number`): 未完成的 feature 数量，从 plan.json 同步
- `artifacts` (`Array<{ id: string; outputPath: string }>`): 变更关联的产物列表，id 标识产物类型（如 `proposal`、`design`、`plan`），outputPath 为相对路径
- `stage` (`ChangeStage?`): 可选的工作流阶段数据，包含完整的 7 阶段信息

**推导类型**:
```typescript
export type ChangeEntry = z.infer<typeof ChangeEntrySchema>;
```

---

### `ChangesJsonSchema`

**Source**: `src/utils/memory.ts`:114-119

**Functionality**: 定义 `changes.json` 文件的顶层数据结构。每个项目工作目录在 `~/.furina/memory/` 下有一个对应的 `changes.json` 文件，记录该项目的框架信息、版本号、工作目录和所有变更条目。

**Schema 定义**:
```typescript
export const ChangesJsonSchema = z.object({
  framework: z.string(),
  version: z.string(),
  cwd: z.string(),
  changes: z.array(ChangeEntrySchema),
});
```

**字段说明**:
- `framework` (`string`): 框架名称，取自 package.json 的 name 字段（即 `furina`）
- `version` (`string`): 框架版本号，取自 package.json 的 version 字段
- `cwd` (`string`): 关联的项目工作目录路径
- `changes` (`ChangeEntry[]`): 该项目下所有变更条目数组

**推导类型**:
```typescript
export type ChangesJson = z.infer<typeof ChangesJsonSchema>;
```

## Data Structures

### `StageStep`
```typescript
{
  title: string;        // 阶段步骤标题
  from: string;         // 开始时间 ISO 8601
  to: string;           // 结束时间 ISO 8601
  status: 'in_progress' | 'skipped' | 'done';  // 步骤状态
  inputPath: string;    // 输入产物路径（默认 ''）
  outputPath: string;   // 输出产物路径（默认 ''）
}
```

### `SubAgentDevProgress`
```typescript
{
  featureId: string;    // feature 标识符（对应 plan.json 中的 id）
  progress: StageStep[];// 开发进度步骤数组
}
```

### `FinalizeStage`
```typescript
{
  integration: StageStep[];  // 集成测试步骤数组
  codecheck: StageStep;      // 代码检查步骤
  archive: StageStep;        // 归档步骤
}
```

### `ChangeStage`
```typescript
{
  explore: StageStep;              // 探索阶段
  brainstorm: StageStep;           // 头脑风暴阶段
  propose: StageStep;              // 提案阶段
  plan: StageStep;                 // 计划阶段
  reviewArtifacts: StageStep;      // 产物审查阶段
  subAgentDev: SubAgentDevProgress[];  // 子代理开发阶段
  finalize: FinalizeStage;         // 收尾阶段
}
```

### `ChangeEntry`
```typescript
{
  name: string;          // kebab-case 变更名称
  path: string;          // 变更目录相对路径
  description: string;   // 变更描述
  createdAt: string;     // 创建时间 ISO 8601
  updateAt?: string;     // 最后更新时间 ISO 8601（可选）
  status: 'active' | 'archived' | 'removed';  // 变更状态
  features: number;      // 总 feature 数
  todo: number;          // 未完成 feature 数
  artifacts: Array<{ id: string; outputPath: string }>;  // 产物列表
  stage?: ChangeStage;   // 工作流阶段数据（可选）
}
```

### `ChangesJson`
```typescript
{
  framework: string;     // 框架名称
  version: string;       // 框架版本号
  cwd: string;           // 项目工作目录路径
  changes: ChangeEntry[];// 变更条目数组
}
```

### `StageUpdate`
```typescript
{
  explore?: Partial<StageStep>;
  brainstorm?: Partial<StageStep>;
  propose?: Partial<StageStep>;
  plan?: Partial<StageStep>;
  reviewArtifacts?: Partial<StageStep>;
  subAgentDev?: unknown[];
  finalize?: { integration?: Partial<StageStep>[]; codecheck?: Partial<StageStep>; archive?: Partial<StageStep> };
  review?: Partial<StageStep>;   // reviewArtifacts 的别名
  coding?: unknown[];            // subAgentDev 的别名
}
```

## Error Handling and Edge Cases

本 Spec 覆盖的数据模型层本身不涉及直接的 I/O 操作或运行时错误处理。但以下边界情况值得关注：

1. **默认值处理**：`StageStepSchema` 中 `inputPath` 和 `outputPath` 使用 `z.string().default('')`，意味着在 Zod parse 时如果缺失这两个字段，会自动填充为空字符串
2. **可选字段**：`ChangeEntrySchema` 中 `updateAt` 使用 `.optional()`，允许变更条目没有更新时间。`stage` 也使用 `.optional()`，允许变更条目在尚未进入工作流阶段时没有 stage 数据
3. **StageUpdate 的宽松性**：`StageUpdate` 不使用 Zod schema 而是使用 TypeScript interface，且 `subAgentDev` 和 `coding` 使用 `unknown[]` 类型。这是因为 CLI 输入的数据格式可能与 schema 不完全一致，需要在各 stage handler 内部做运行时类型检查和默认值填充
4. **别名字段**：`StageUpdate` 中的 `review`/`coding` 是历史兼容别名。在 `createOrUpdateStage` 分发器中，如果 `reviewArtifacts` 和 `review` 同时存在，优先使用 `reviewArtifacts`；同理 `subAgentDev` 优先于 `coding`

## Dependencies

- **Depends on**:
  - `zod` (npm 包)：提供 `z.object()`、`z.string()`、`z.enum()`、`z.array()`、`z.number()` 等 schema 构建器
  - `src/utils/common.ts`：`normalizePath` 函数，被 `flattenCwdPath` 调用用于统一路径分隔符
- **Depended by**:
  - `src/utils/memory.ts`（同文件 124-895 行）：I/O 函数、stage 合并处理器、createOrUpdateChange 入口函数均依赖本 Spec 定义的类型
  - `src/commands/change/stage.ts`：导入 `StageUpdate` 类型用于构造阶段更新数据
  - `src/commands/change/new.ts`、`archive.ts`、`list.ts`、`status.ts`：导入 `ChangeEntry`、`ChangesJson` 等类型
  - `src/server/changes/shared.ts`：导入 `flattenCwdPath` 和 `ChangeEntry` 类型用于跨项目聚合查询
  - `src/server/memory/sync-design.ts`：导入相关类型用于设计文档同步
  - `src/client/components/StageSummary.tsx`、`StageProgressAxis.tsx`、`ChangeCard.tsx`、`DetailPanel.tsx`、`ProjectGroup.tsx`：前端组件使用这些类型渲染 UI
  - `src/client/App.tsx`：顶层应用组件使用变更数据类型

## Usage Examples

### 场景 1：使用 schema 解析和校验 changes.json 数据

```typescript
import { ChangesJsonSchema, type ChangesJson } from './utils/memory.js';

// 从文件读取原始 JSON 数据
const raw = fs.readFileSync(changesJsonPath, 'utf-8');
const parsed = JSON.parse(raw);

// 使用 Zod schema 进行运行时校验
const result = ChangesJsonSchema.safeParse(parsed);
if (result.success) {
  const data: ChangesJson = result.data;
  console.log(`项目 ${data.cwd} 下有 ${data.changes.length} 个变更`);
  for (const entry of data.changes) {
    console.log(`- ${entry.name} (${entry.status}): ${entry.description}`);
  }
} else {
  console.error('数据格式不合法:', result.error.issues);
}
```
Explanation: 通过 `ChangesJsonSchema.safeParse()` 对原始 JSON 数据做运行时校验，校验成功后获得类型安全的 `ChangesJson` 对象。实际项目中多数场景直接使用 `JSON.parse(...) as ChangesJson` 类型断言，因为数据来源（memory.ts 内部写入）本身就是受控的。

### 场景 2：构造 StageUpdate 传入 createOrUpdateChange

```typescript
import { createOrUpdateChange } from './utils/memory.js';
import type { StageUpdate } from './utils/memory.js';

// 更新探索阶段为 in_progress
const stageUpdate: StageUpdate = {
  explore: {
    title: '探索现有实现',
    from: new Date().toISOString(),
    status: 'in_progress',
    inputPath: '',
    outputPath: '',
  },
};
createOrUpdateChange(cwd, 'my-feature', '实现新功能', stageUpdate);

// 更新探索阶段为 done（只需提供变化的字段）
createOrUpdateChange(cwd, 'my-feature', undefined, {
  explore: {
    outputPath: 'furina/changes/my-feature/exploration.md',
    to: new Date().toISOString(),
    status: 'done',
  },
});
```
Explanation: `StageUpdate` 接口允许只传入需要更新的字段。当 explore 的 status 为 `in_progress` 时，handleExploreStage 会做全量赋值；当 status 为 `done` 时，只更新 `outputPath`、`to`、`status`，保留已有的 `from`、`title`、`inputPath`。

### 场景 3：使用 flattenCwdPath 定位项目记忆目录

```typescript
import { flattenCwdPath } from './utils/memory.js';
import path from 'path';
import os from 'os';

// 获取当前项目的记忆目录路径
const cwd = process.cwd();
const memoryDir = path.join(os.homedir(), '.furina', 'memory', flattenCwdPath(cwd));
// 例如: C:\Users\snowYuki\.furina\memory\Memory_D__project-code_llm_furina

// 在 server/changes/shared.ts 中的使用方式：通过 cwd 过滤特定项目的 Memory_ 目录
const targetDirName = flattenCwdPath(options.cwd);
const entries = await fs.readdir(MEMORY_DIR, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isDirectory() && entry.name === targetDirName) {
    // 找到了目标项目的记忆目录
  }
}
```
Explanation: `flattenCwdPath` 是跨模块共享的工具函数，内部的 `getMemoryDir`、`getMemoryChangesJsonPath` 函数以及外部的 `server/changes/shared.ts` 都依赖它来定位项目的记忆目录。

### 场景 4：类型在前端组件中的使用

```typescript
import type { ChangeEntry, StageStep, ChangeStage } from '../../utils/memory.js';

// 根据 stage 数据渲染阶段进度
function renderStageProgress(stage?: ChangeStage): string {
  if (!stage) return '尚未开始';
  const steps: Array<{ name: string; step: StageStep }> = [
    { name: '探索', step: stage.explore },
    { name: '头脑风暴', step: stage.brainstorm },
    { name: '提案', step: stage.propose },
    { name: '计划', step: stage.plan },
    { name: '审查', step: stage.reviewArtifacts },
  ];
  return steps
    .filter(s => s.step)
    .map(s => `${s.name}: ${s.step.status}`)
    .join(' -> ');
}

// 遍历变更列表显示摘要
function renderChangeSummary(changes: ChangeEntry[]): void {
  for (const entry of changes) {
    console.log(`[${entry.status}] ${entry.name}: ${entry.description}`);
    console.log(`  进度: ${entry.features} features, ${entry.todo} todo`);
    console.log(`  阶段: ${renderStageProgress(entry.stage)}`);
  }
}
```
Explanation: 前端组件和命令行输出通过类型化接口访问变更数据。`ChangeEntry` 提供变更的元数据和可选的阶段数据，`StageStep` 用于单个阶段的状态判断，`ChangeStage` 提供完整的 7 阶段视图。
