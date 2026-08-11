# StageSummary Component

> Source files:
> - `src/client/components/StageSummary.tsx` : 1-225

## Overview

StageSummary 是工作流阶段详情面板的核心展示组件，负责根据当前选中的工作流阶段（`selectedStageKey`）条件渲染对应阶段的详细信息。

**设计动机：** Furina 工作流包含多种结构差异显著的阶段类型——通用阶段（单条 `StageStep`）、Finalize 阶段（三段子阶段：integration / codecheck / archive）、subAgentDev 阶段（按 featureId 分组的嵌套进度列表）。单一组件统一处理这些异构渲染逻辑，使调用方 `DetailPanel` 只需传入 `stage` 和 `selectedStageKey` 即可，无需关心各阶段的内部结构差异。

**使用场景：**
- 用户在 `StageProgressAxis` 时间轴中点击某一阶段节点后，`DetailPanel` 将 `selectedStageKey` 传递给 StageSummary，触发对应阶段信息的展示。
- 当 `ChangeStage` 数据缺失或用户尚未选择阶段时，组件展示相应的空态提示。

**涉及文件与职责：**

| 文件 | 职责 |
|------|------|
| `src/client/components/StageSummary.tsx` | 主组件及全部子组件、辅助函数 |
| `src/utils/memory.ts` | 提供 `ChangeStage`、`StageStep`、`FinalizeStage`、`SubAgentDevProgress` 等数据类型定义 |

## Architecture / Flow

StageSummary 采用 **分支渲染架构**，核心决策树如下：

```
StageSummary(props)
│
├── stage 为空？  ──→ 显示 "noData" 空态
│
├── selectedStageKey 为空？  ──→ 显示 "guideText" 引导文案
│
├── selectedStageKey === 'finalize'
│   └── stage.finalize 为空？ ──→ "noData"
│   └── 遍历 [integration, codecheck, archive] 三个子阶段
│       ├── 子阶段是数组 → 渲染 StageStepRow 列表（或空态）
│       └── 子阶段是对象 → 渲染单个 StageStepRow
│
├── selectedStageKey === 'subAgentDev'
│   └── dev 为空或长度为 0？ ──→ "noFeatureData" 空态
│   └── 遍历 feature 列表
│       └── 每个 feature：featureId 标题 + 嵌套 StageStepRow 列表
│
└── 其他（通用阶段：explore / brainstorm / propose / plan / reviewArtifacts）
    └── getStageData() 提取 StageStep → 渲染单个 StageStepRow（或 "noData"）
```

## Functionality / Interface Details

### `StageSummary({ stage, selectedStageKey }) -> React.ReactElement`

**Source**: `src/client/components/StageSummary.tsx`:100-224

**Functionality**: 主组件入口。根据 `selectedStageKey` 的值分发到三种渲染分支：finalize 子阶段列表、subAgentDev 特性进度列表、通用阶段单行展示。每条分支在数据缺失时均有对应的空态兜底。

**Parameters**:
- `stage` (`ChangeStage | undefined`): 当前选中变更（change）的完整阶段数据。包含所有七个工作流阶段的结构化信息。可选参数，为空时展示 "noData" 提示。
- `selectedStageKey` (`string | undefined`): 当前用户选中的阶段标识键。取值范围为 `'explore' | 'brainstorm' | 'propose' | 'plan' | 'reviewArtifacts' | 'finalize' | 'subAgentDev'`。可选参数，为空时展示引导文案。

**Return Value**:
- `React.ReactElement`: 渲染后的 DOM 结构，包含阶段详情内容或空态提示。

**Core Logic**:
组件使用三段 `if` 分支依次判断 `selectedStageKey` 的值，优先处理 `finalize` 和 `subAgentDev` 两个特殊阶段，最后 fallthrough 到通用阶段处理。`finalize` 分支将三个子阶段映射为 `{ labelKey, item }` 数组统一渲染，每个子阶段支持 `StageStep`（单条）和 `StageStep[]`（多条数组）两种数据形态。`subAgentDev` 分支通过双层 `.map()` 实现 feature 分组与嵌套进度步骤的平铺。

**Core Code**:
```tsx
export function StageSummary({ stage, selectedStageKey }: StageSummaryProps): React.ReactElement {
  const { t } = useTranslation();

  if (!stage) {
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center py-6 text-sm text-muted-foreground' },
      t('detailPanel.noData'),
    );
  }

  if (!selectedStageKey) {
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center py-6 text-sm text-muted-foreground' },
      t('detailPanel.guideText'),
    );
  }

  // --- Finalize ---
  if (selectedStageKey === 'finalize') {
    const finalize = stage.finalize;
    if (!finalize) { /* noData */ }

    const subStages: { labelKey: string; item: StageStep | StageStep[] }[] = [
      { labelKey: 'detailPanel.subStage.integration', item: finalize.integration },
      { labelKey: 'detailPanel.subStage.codecheck', item: finalize.codecheck },
      { labelKey: 'detailPanel.subStage.archive', item: finalize.archive },
    ];
    // 渲染 subStages...
  }

  // --- subAgentDev ---
  if (selectedStageKey === 'subAgentDev') {
    const dev = stage.subAgentDev;
    if (!dev || dev.length === 0) { /* noFeatureData */ }
    // 双层 map: feature → progress steps...
  }

  // --- Generic stage ---
  const step = getStageData(stage, selectedStageKey);
  // 渲染单个 StageStepRow...
}
```
Source: `src/client/components/StageSummary.tsx`:100-224

**Usage Example**:
```tsx
// 在 DetailPanel 中的典型调用
React.createElement(StageSummary, {
  stage: selectedChange.stage,    // ChangeStage 对象
  selectedStageKey,               // 例如 'explore' / 'finalize' / 'subAgentDev'
});
```
Explanation: `DetailPanel` 将当前选中变更的 `stage` 数据和用户点击的阶段键传入 StageSummary，组件内部根据 key 值自动选择正确的渲染分支。

---

### `StageStepRow({ step }) -> React.ReactElement`

**Source**: `src/client/components/StageSummary.tsx`:66-90

**Functionality**: 渲染单条阶段步骤信息行，包含标题（title）、时间范围（from → to）和状态徽章（StatusBadge）三个信息区域。是 StageSummary 中所有阶段展示的最小渲染单元，被三种渲染分支共同复用。

**Parameters**:
- `step` (`StageStep`): 单条阶段步骤数据，包含 title、from、to、status 等字段。

**Return Value**:
- `React.ReactElement`: 包裹在 `rounded-lg bg-muted/30` 容器中的信息行 DOM。

**Core Logic**:
组件通过 `React.createElement` 生成两层布局：第一层是标题与状态徽章的 flex 横排（`justify-between`），标题使用 `truncate` 防溢出，当 `title` 为空时显示 `t('detailPanel.noData')` 兜底；第二层是时间范围行，仅在 `step.from` 或 `step.to` 至少有一个有值时渲染，使用 i18n 的 `fromTo` 模板将 from/to 插值显示。

**Core Code**:
```tsx
function StageStepRow({ step }: { step: StageStep }): React.ReactElement {
  const { t } = useTranslation();
  return React.createElement(
    'div',
    { className: 'rounded-lg bg-muted/30 px-3 py-2.5' },
    React.createElement(
      'div',
      { className: 'flex items-center justify-between mb-1' },
      React.createElement(
        'span',
        { className: 'text-sm font-medium text-foreground truncate', title: step.title },
        step.title || t('detailPanel.noData'),
      ),
      React.createElement(StatusBadge, { status: step.status }),
    ),
    (step.from || step.to) &&
      React.createElement(
        'div',
        { className: 'text-[11px] text-muted-foreground' },
        t('detailPanel.fromTo', { from: step.from || '-', to: step.to || '-' }),
      ),
  );
}
```
Source: `src/client/components/StageSummary.tsx`:66-90

**Usage Example**:
```tsx
// 在 finalize 分支中渲染单条步骤
React.createElement(StageStepRow, { step: finalize.codecheck });

// 在 subAgentDev 分支中渲染 feature 进度步骤
...feature.progress.map((step, i) =>
  React.createElement(StageStepRow, { key: i, step }),
);
```
Explanation: StageStepRow 被三种渲染路径复用——通用阶段直接传入 `getStageData()` 返回的单条 step；finalize 分支的 `codecheck` 和 `archive` 子阶段传入单条 step，`integration` 传入数组中的每个 step；subAgentDev 分支遍历 `feature.progress` 数组逐条传入。

---

### `StatusBadge({ status }) -> React.ReactElement`

**Source**: `src/client/components/StageSummary.tsx`:54-63

**Functionality**: 根据状态字符串渲染带颜色标识的圆角徽章标签。状态值决定徽章的背景色、文字色和边框色，用于直观标识阶段的当前执行状态。

**Parameters**:
- `status` (`string`): 状态标识字符串，取值为 `'in_progress'`、`'done'`、`'skipped'` 之一。

**Return Value**:
- `React.ReactElement`: 圆角 `span` 元素，内含状态文本。

**Core Logic**:
从 `STATUS_COLORS` 映射表中查找 `status` 对应的 Tailwind CSS 类名字符串。若 `status` 不在映射表中（未知状态值），则 fallback 到 `STATUS_COLORS.skipped` 的灰调样式，确保始终有合理展示。徽章使用 `inline-flex items-center rounded-full border` 基础样式，字号为 `text-[10px]`。

**Core Code**:
```tsx
const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  done: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  skipped: 'bg-muted text-muted-foreground border-muted-foreground/20',
};

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colorClass = STATUS_COLORS[status] ?? STATUS_COLORS.skipped;
  return React.createElement(
    'span',
    {
      className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${colorClass}`,
    },
    status,
  );
}
```
Source: `src/client/components/StageSummary.tsx`:43-63

**Usage Example**:
```tsx
React.createElement(StatusBadge, { status: 'in_progress' });
// 渲染结果：<span class="... bg-blue-500/10 text-blue-600 ...">in_progress</span>

React.createElement(StatusBadge, { status: 'done' });
// 渲染结果：<span class="... bg-emerald-500/10 text-emerald-600 ...">done</span>
```
Explanation: StatusBadge 内嵌在 StageStepRow 的标题行右侧，状态颜色遵循语义化约定：蓝色=进行中，绿色=已完成，灰色=已跳过。

---

### `getStageData(stage, key) -> StageStep | undefined`

**Source**: `src/client/components/StageSummary.tsx`:30-40

**Functionality**: 从 `ChangeStage` 对象中按 key 提取对应的 `StageStep` 数据。仅处理五种通用阶段（explore / brainstorm / propose / plan / reviewArtifacts），对 `subAgentDev` 和 `finalize` 两个复合阶段直接返回 `undefined`，由主组件中对应的专用分支处理。

**Parameters**:
- `stage` (`ChangeStage | undefined`): 完整阶段数据对象。
- `key` (`string`): 阶段标识键。

**Return Value**:
- `StageStep | undefined`: 匹配到的阶段步骤数据，未匹配则返回 `undefined`。

**Core Logic**:
函数通过逐个 `if` 键值比较实现显式类型收窄（TypeScript 的类型收窄依赖字面量类型），避免使用 `stage[key]` 的动态索引访问（`ChangeStage` 类型的 key 联合类型不支持通用索引签名）。对 `subAgentDev` 和 `finalize` 的提前返回防止它们被 fallthrough 到未定义的通用逻辑。

**Core Code**:
```tsx
function getStageData(stage: ChangeStage | undefined, key: string): StageStep | undefined {
  if (!stage) return undefined;
  if (key === 'subAgentDev' || key === 'finalize') return undefined;
  if (key === 'explore') return stage.explore;
  if (key === 'brainstorm') return stage.brainstorm;
  if (key === 'propose') return stage.propose;
  if (key === 'plan') return stage.plan;
  if (key === 'reviewArtifacts') return stage.reviewArtifacts;
  return undefined;
}
```
Source: `src/client/components/StageSummary.tsx`:30-40

**Usage Example**:
```tsx
// 在主组件的通用阶段分支中调用
const step = getStageData(stage, selectedStageKey);
if (!step) {
  return /* noData 空态 */;
}
return React.createElement(StageStepRow, { step });
```
Explanation: `getStageData` 是通用阶段渲染分支的数据提取入口，返回值为 `undefined` 时触发空态兜底，确保组件不会因缺少某阶段数据而崩溃。

## Data Structures

### `StageSummaryProps`

```tsx
export interface StageSummaryProps {
  stage?: ChangeStage;
  selectedStageKey?: string;
}
```
- `stage` (`ChangeStage | undefined`): 当前选中变更的完整阶段数据对象，包含七个工作流阶段的结构化信息。可选，为空时组件展示 "noData" 空态。
- `selectedStageKey` (`string | undefined`): 用户当前选中的阶段标识，用于决定渲染哪个分支。可选，为空时展示引导文案 "guideText"。

### `StageStep`（依赖于 `src/utils/memory.ts`）

```tsx
export const StageStepSchema = z.object({
  title: z.string(),
  from: z.string(),
  to: z.string(),
  status: z.enum(['in_progress', 'skipped', 'done']),
  inputPath: z.string().default(''),
  outputPath: z.string().default(''),
});
```
- `title` (`string`): 阶段标题，展示在 StageStepRow 的左侧。
- `from` (`string`): 阶段开始时间，ISO 格式或空字符串。
- `to` (`string`): 阶段结束时间，ISO 格式或空字符串。
- `status` (`'in_progress' | 'skipped' | 'done'`): 阶段执行状态，决定 StatusBadge 的颜色。
- `inputPath` (`string`): 阶段输入文件路径（StageSummary 中未使用，由其他组件消费）。
- `outputPath` (`string`): 阶段输出文件路径（StageSummary 中未使用，由其他组件消费）。

### `FinalizeStage`（依赖于 `src/utils/memory.ts`）

```tsx
export const FinalizeStageSchema = z.object({
  integration: z.array(StageStepSchema),
  codecheck: StageStepSchema,
  archive: StageStepSchema,
});
```
- `integration` (`StageStep[]`): 集成测试子阶段步骤列表，可包含多条步骤。
- `codecheck` (`StageStep`): 代码检查子阶段，单条步骤。
- `archive` (`StageStep`): 归档子阶段，单条步骤。

### `SubAgentDevProgress`（依赖于 `src/utils/memory.ts`）

```tsx
export const SubAgentDevProgressSchema = z.object({
  featureId: z.string(),
  progress: z.array(StageStepSchema),
});
```
- `featureId` (`string`): 特性标识，展示为该特性分组的标题。
- `progress` (`StageStep[]`): 该特性下的开发进度步骤列表。

### `ChangeStage`（依赖于 `src/utils/memory.ts`）

```tsx
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
- `explore` / `brainstorm` / `propose` / `plan` / `reviewArtifacts` (`StageStep`): 五种通用阶段，各为单条 StageStep。
- `subAgentDev` (`SubAgentDevProgress[]`): 开发阶段，按 featureId 分组的进度列表。
- `finalize` (`FinalizeStage`): 收尾阶段，包含 integration（数组）、codecheck、archive 三个子阶段。

### `STATUS_COLORS`

```tsx
const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  done: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  skipped: 'bg-muted text-muted-foreground border-muted-foreground/20',
};
```
- `in_progress`: 蓝色调，半透明蓝底 + 蓝色文字，表示阶段正在执行。
- `done`: 翠绿色调，半透明绿底 + 绿色文字，表示阶段已完成。
- `skipped`: 灰色调，muted 背景 + muted 前景色，表示阶段已跳过。

## Error Handling and Edge Cases

1. **stage 为 undefined**：当上层未传入 stage 数据时，主组件第一个 `if (!stage)` 分支捕获，渲染居中的 "noData" 空态文案，不会访问 stage 的任何属性。

2. **selectedStageKey 为 undefined**：当用户未在时间轴上点击任何阶段时，第二个 `if (!selectedStageKey)` 分支捕获，渲染 "guideText" 引导文案提示用户选择阶段。

3. **finalize 子阶段数据缺失**：`stage.finalize` 整体为空时返回 "noData"。三个子阶段各自独立渲染——`integration` 为 `StageStep[]`，当空数组时显示 "noData" 子文案；`codecheck` 和 `archive` 为 `StageStep` 对象，通过 StageStepRow 内部的 `step.title || t('detailPanel.noData')` 兜底空标题。

4. **subAgentDev 为空数组**：`!dev || dev.length === 0` 检查覆盖了 `undefined`、`null` 和空数组三种情况，统一展示 "noFeatureData" 空态。

5. **StatusBadge 未知状态值**：使用 `STATUS_COLORS[status] ?? STATUS_COLORS.skipped` 的 nullish coalescing 兜底，确保任意未知状态字符串都不会导致渲染异常，而是以灰调样式展示。

6. **StageStep 字段为空字符串**：`from` 和 `to` 字段默认值为空字符串，StageStepRow 通过 `step.from || step.to` 的短路判断避免渲染无意义的时间行；时间行内的插值使用 `step.from || '-'` 和 `step.to || '-'` 将空字符串替换为占位符。

7. **未知的 selectedStageKey**：当 key 值不属于 `finalize`、`subAgentDev` 及五种通用阶段中的任何一种时，`getStageData` 返回 `undefined`，触发通用分支的 "noData" 空态，不会抛出异常。

## Dependencies

- **Depends on**:
  - `src/utils/memory.ts`（`ChangeStage`、`StageStep` 类型定义）：提供所有阶段数据的 TypeScript 类型，是组件的数据契约基础。
  - `react-i18next`（`useTranslation` hook）：提供国际化文案能力，组件内所有用户可见文案均通过 `t()` 翻译函数获取。
  - `react`：渲染基础，组件完全使用 `React.createElement` 而非 JSX 语法。

- **Depended by**:
  - `src/client/components/DetailPanel.tsx`（`StageSummary` 唯一调用方）：`DetailPanel` 在其内部渲染结构的底部区域调用 `StageSummary`，传入 `selectedChange.stage` 和 `selectedStageKey` 两个 props。

## Usage Examples

### 在 DetailPanel 中集成 StageSummary

```tsx
// DetailPanel.tsx 中的完整渲染上下文
import { StageSummary } from './StageSummary.js';

// 假设 selectedChange 包含完整的 ChangeEntry 数据，selectedStageKey 由 StageProgressAxis 管理
React.createElement(
  'div',
  { className: 'flex-1 px-6 py-4 overflow-y-auto' },
  React.createElement(StageSummary, {
    stage: selectedChange.stage,   // ChangeStage 对象，包含所有七个工作流阶段
    selectedStageKey,              // 字符串键，如 'explore' / 'finalize' / 'subAgentDev'
  }),
);
```
Explanation: `DetailPanel` 将 `selectedChange.stage`（完整 `ChangeStage` 对象）和当前选中的阶段键 `selectedStageKey` 传递给 StageSummary。StageSummary 内部根据 key 的值自动分支到对应的渲染逻辑。`overflow-y-auto` 确保当 finalize 的多条 integration 步骤或 subAgentDev 的多个 feature 进度超出可视区域时支持滚动。

### 典型数据流转示例

```tsx
// 假设数据如下
const stage: ChangeStage = {
  explore: { title: 'Explore codebase', from: '2026-07-05T10:00', to: '2026-07-05T11:30', status: 'done', inputPath: '', outputPath: '' },
  brainstorm: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  propose: { title: 'Propose changes', from: '2026-07-05T12:00', to: '', status: 'in_progress', inputPath: '', outputPath: '' },
  plan: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  reviewArtifacts: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  subAgentDev: [
    {
      featureId: 'feature-auth',
      progress: [
        { title: 'Write auth module', from: '2026-07-05T14:00', to: '2026-07-05T16:00', status: 'done', inputPath: '', outputPath: '' },
        { title: 'Write auth tests', from: '2026-07-05T16:00', to: '', status: 'in_progress', inputPath: '', outputPath: '' },
      ],
    },
  ],
  finalize: {
    integration: [
      { title: 'Run integration tests', from: '2026-07-05T18:00', to: '', status: 'in_progress', inputPath: '', outputPath: '' },
    ],
    codecheck: { title: 'ESLint check', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
    archive: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  },
};

// selectedStageKey = 'propose'  → 渲染通用分支：StageStepRow 显示 "Propose changes" + 蓝色 in_progress 徽章
// selectedStageKey = 'finalize' → 渲染 finalize 分支：三个子阶段标题（INTEGRATION / CODECHECK / ARCHIVE）+ 各自 StageStepRow
// selectedStageKey = 'subAgentDev' → 渲染 feature 列表："feature-auth" 标题 + 两条嵌套 StageStepRow
```
Explanation: 上例展示了三种典型渲染路径下的数据形态。`explore` 的 status 为 `done` 展示绿色徽章；`propose` 的 `to` 为空导致时间行显示 "from -> -"；`brainstorm` 的 `title` 为空导致显示 "noData" 兜底文案。
