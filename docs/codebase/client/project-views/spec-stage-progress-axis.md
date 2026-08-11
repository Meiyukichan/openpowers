# StageProgressAxis Component

> Source files:
> - `src/client/components/StageProgressAxis.tsx` : 1-341

## Overview

StageProgressAxis 是 Furina 客户端工作流进度可视化组件，渲染一条水平可滚动的 7 阶段工作流节点行（Explore / Brainstorm / Propose / Plan / Review / Develop / Finalize）。

**系统定位**: 该组件位于 DetailPanel 内部，作为变更（Change）详情面板的核心导航元素。当用户在 ProjectSidebar 中选中一个变更后，DetailPanel 会将 `selectedChange.stage` 传给 StageProgressAxis，由它负责可视化当前工作流的进度状态。

**设计动机**: 工作流共有 7 个阶段，但水平空间有限无法一次全部展示。因此采用"视口窗口"设计——可见区域仅展示 3 个节点，通过 CSS transform 平移实现居中聚焦效果，用户可通过点击节点或左右箭头导航。这种方式在有限空间内保持了良好的可读性和交互体验。

**使用场景**:
- 用户在 ProjectSidebar 中选择变更卡片后，DetailPanel 渲染 StageProgressAxis 展示该变更的阶段进度
- 用户点击 StageProgressAxis 中的阶段节点，会联动更新 StageSummary 显示的详情内容

**文件职责**:
- `src/client/components/StageProgressAxis.tsx`: 组件主体，包含静态配置（STAGE_CONFIG）、辅助函数（getStageStep、findActiveIndex）和组件实现

## Architecture / Flow

### 数据流

```
ChangeStage (memory 数据)
    |
    v
getStageStep(stage, key)  -- 将 ChangeStage 映射为 StageStep
    |
    v
STAGE_CONFIG (7 个阶段静态配置) -- 提供 key、图标、翻译键
    |
    v
StageProgressAxis 组件
    |
    +-- 视口 (overflow: hidden, 宽度 = 3 * NODE_STEP)
    |   +-- 轨道 (translateX 平移居中聚焦节点)
    |       +-- 7 个阶段按钮节点 (状态着色 + 动画)
    |
    +-- 导航栏 (左箭头 | 指标文字 "3/7" | 右箭头)
```

### 焦点索引优先级

组件的 focusedIndex 有三种来源，按优先级从高到低：
1. **受控模式**: 外部传入 `controlledIndex` prop（由 `onFocusedIndexChange` 回调更新）
2. **selectedStageKey 派生**: 若传入 `selectedStageKey`，则自动计算对应的索引
3. **内部状态**: 使用 `internalIndex`，初始值由 `findActiveIndex()` 计算（首个 `in_progress` 阶段索引，若无则为最后一个）

## Functionality / Interface Details

### `STAGE_CONFIG: StageConfigItem[]`

**Source**: `src/client/components/StageProgressAxis.tsx`:28-36

**功能**: 静态导出的 7 个阶段配置数组，定义了工作流阶段的固定显示顺序。每个阶段包含 key（数据标识）、displayNameKey（i18n 翻译键）、icon（lucide-react 图标组件）。该数组被 `getStageStep`、`findActiveIndex` 以及组件渲染逻辑共同使用，是整个组件的数据基准。

**数据结构**:
```typescript
export interface StageConfigItem {
  key: string;
  displayNameKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}
```

**阶段映射关系**:

| 索引 | key | 图标 | 翻译键 |
|------|-----|------|--------|
| 0 | explore | Compass | progressAxis.stageName.explore |
| 1 | brainstorm | Lightbulb | progressAxis.stageName.brainstorm |
| 2 | propose | FileText | progressAxis.stageName.propose |
| 3 | plan | ListChecks | progressAxis.stageName.plan |
| 4 | reviewArtifacts | Eye | progressAxis.stageName.review |
| 5 | subAgentDev | Code2 | progressAxis.stageName.develop |
| 6 | finalize | Flag | progressAxis.stageName.finalize |

**使用示例**:
```typescript
import { STAGE_CONFIG } from './StageProgressAxis.js';

// 遍历所有阶段获取 key 列表
const stageKeys = STAGE_CONFIG.map(cfg => cfg.key);
// => ['explore', 'brainstorm', 'propose', 'plan', 'reviewArtifacts', 'subAgentDev', 'finalize']
```
Explanation: STAGE_CONFIG 是常量数组，外部模块（如 StageSummary）也可以引用它来获取阶段顺序信息。

---

### `getStageStep(stage: ChangeStage | undefined, key: string) -> StageStep | undefined`

**Source**: `src/client/components/StageProgressAxis.tsx`:43-92

**功能**: 将 ChangeStage 数据映射为特定阶段的 StageStep。对于普通阶段（explore、brainstorm、propose、plan、reviewArtifacts），直接返回对应的 StageStep 字段；对于两个特殊阶段（subAgentDev 和 finalize），需要聚合子数据后合成一个虚拟的 StageStep。该函数是组件的数据桥梁层，统一了不同结构的阶段数据为统一的 StageStep 接口。

**参数**:
- `stage` (`ChangeStage | undefined`): 完整的变更阶段数据，可能为 undefined（新变更尚未有任何阶段数据时）
- `key` (`string`): 阶段标识 key，对应 STAGE_CONFIG 中的 key 值

**返回值**:
- `StageStep | undefined`: 对应阶段的步骤数据。若 stage 为 undefined 或该阶段无数据，返回 undefined

**核心逻辑**:

1. **通用阶段**（explore/brainstorm/propose/plan/reviewArtifacts）: 通过 if-else 链直接返回 `stage[key]` 字段
2. **subAgentDev 阶段**: 从 `stage.subAgentDev` 数组中提取所有 feature 的所有 progress 项的状态，聚合判定整体状态
3. **finalize 阶段**: 从 `stage.finalize` 对象中提取 codecheck、archive 以及 integration 数组的状态，聚合判定整体状态

聚合判定规则（适用于 subAgentDev 和 finalize）:
- 所有子状态均为 `done` -> 整体状态为 `done`
- 所有子状态均为 `skipped` -> 整体状态为 `skipped`
- 否则 -> 整体状态为 `in_progress`
- 若子数据为空或不存在，返回 undefined

**核心代码**:
```typescript
function getStageStep(stage: ChangeStage | undefined, key: string): StageStep | undefined {
  if (!stage) return undefined;
  if (key === 'subAgentDev' || key === 'finalize') {
    if (key === 'finalize') {
      const f = stage.finalize;
      if (!f) return undefined;
      const subStatuses = [
        f.codecheck?.status,
        f.archive?.status,
        ...f.integration.map((i) => i.status),
      ];
      const allDone = subStatuses.length > 0 && subStatuses.every((s) => s === 'done');
      const allSkipped = subStatuses.length > 0 && subStatuses.every((s) => s === 'skipped');
      const status: StageStep['status'] = allDone ? 'done' : allSkipped ? 'skipped' : 'in_progress';
      return { title: '', from: '', to: '', status, inputPath: '', outputPath: '' };
    }
    if (key === 'subAgentDev') {
      const dev = stage.subAgentDev;
      if (!dev || dev.length === 0) return undefined;
      const allStatuses = dev.flatMap((d) => d.progress.map((p) => p.status));
      const allDone = allStatuses.length > 0 && allStatuses.every((s) => s === 'done');
      const allSkipped = allStatuses.length > 0 && allStatuses.every((s) => s === 'skipped');
      const status: StageStep['status'] = allDone ? 'done' : allSkipped ? 'skipped' : 'in_progress';
      return { title: '', from: '', to: '', status, inputPath: '', outputPath: '' };
    }
  }
  if (key === 'explore') return stage.explore;
  if (key === 'brainstorm') return stage.brainstorm;
  if (key === 'propose') return stage.propose;
  if (key === 'plan') return stage.plan;
  if (key === 'reviewArtifacts') return stage.reviewArtifacts;
  return undefined;
}
```
Source: `src/client/components/StageProgressAxis.tsx`:43-92

**使用示例**:
```typescript
// 获取某个变更的 develop 阶段状态
const step = getStageStep(changeEntry.stage, 'subAgentDev');
if (step) {
  console.log(step.status); // 'in_progress' | 'done' | 'skipped'
}
```
Explanation: 函数内部判断 key 是否为特殊阶段，决定是直接取字段还是聚合子数据。合成的 StageStep 的 title/from/to 等字段为空字符串，仅 status 字段有意义。

---

### `findActiveIndex(stage: ChangeStage | undefined) -> number`

**Source**: `src/client/components/StageProgressAxis.tsx`:95-103

**功能**: 查找第一个处于 `in_progress` 状态的阶段索引，用于组件初始化时自动居中到活动阶段。若没有处于 in_progress 的阶段（全部为 done 或 skipped），则返回最后一个阶段的索引（即 6）。该函数决定了组件首次渲染时的默认焦点位置。

**参数**:
- `stage` (`ChangeStage | undefined`): 完整的变更阶段数据

**返回值**:
- `number`: 0-6 的索引值

**核心逻辑**: 遍历 STAGE_CONFIG，依次调用 getStageStep 获取每个阶段的状态，找到第一个 `in_progress` 的阶段即返回其索引。若 stage 为 undefined 或无 in_progress 阶段，返回 `STAGE_CONFIG.length - 1`。

**核心代码**:
```typescript
function findActiveIndex(stage: ChangeStage | undefined): number {
  if (!stage) return 0;
  for (let i = 0; i < STAGE_CONFIG.length; i++) {
    const step = getStageStep(stage, STAGE_CONFIG[i].key);
    if (step && step.status === 'in_progress') return i;
  }
  return STAGE_CONFIG.length - 1;
}
```
Source: `src/client/components/StageProgressAxis.tsx`:95-103

**使用示例**:
```typescript
// 找到活动阶段索引
const activeIdx = findActiveIndex(changeEntry.stage);
// 若 stage.propose 为 in_progress 且前面的阶段都是 done，则返回 2
```
Explanation: 遍历顺序与 STAGE_CONFIG 一致（0=explore 到 6=finalize），返回第一个正在执行的阶段索引。全 undefined 时返回 0，全部完成时返回 6。

---

### `StageProgressAxis(props: StageProgressAxisProps) -> React.ReactElement`

**Source**: `src/client/components/StageProgressAxis.tsx`:130-340

**功能**: 主组件函数，渲染水平可滚动的 7 阶段节点行与底部导航控件。实现以下核心交互：

1. **视口窗口化**: 使用 3 节点宽度的 overflow:hidden 视口裁剪，通过 CSS `translateX` 移动内部轨道实现"聚焦"效果
2. **平滑过渡**: 轨道使用 `transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)` 实现平滑的滑动动画
3. **状态视觉**: done（emerald-500 绿色）、in_progress（blue-500 蓝色 + 脉冲动画 + 光环）、skipped（muted-foreground/50 灰色）
4. **焦点管理**: 支持受控（controlledIndex）、selectedStageKey 派生、内部状态三种焦点模式
5. **导航按钮**: 左右箭头控制焦点移动，中间显示 `focusedIndex+1/7` 指示器

**参数**:
- `stage` (`ChangeStage | undefined`): 变更阶段数据。为 undefined 时显示空状态提示（"暂无阶段数据"）
- `onStageClick` (`(stageKey: string) => void`, 可选): 阶段节点点击回调。由 DetailPanel 用于更新 selectedStageKey
- `focusedIndex` (`number`, 可选): 受控焦点索引。传入后组件焦点完全由外部控制
- `onFocusedIndexChange` (`(index: number) => void`, 可选): 焦点变化回调，仅在受控模式下使用
- `selectedStageKey` (`string`, 可选): 选中的阶段 key，用于派生焦点索引

**返回值**:
- `React.ReactElement`: 渲染结果，包含视口容器 + 导航栏。空状态时返回居中文字提示

**核心逻辑**:

*translateX 居中计算*: 组件定义了 `NODE_WIDTH=88px` 和 `NODE_GAP=4px`，因此 `NODE_STEP=92px`。视口宽度 = `3 * NODE_STEP = 276px`。居中偏移量 = `(viewportWidth - NODE_WIDTH) / 2 = 94px`。当焦点在索引 i 时，translateX = `-(i * NODE_STEP - centerOffset)`。这确保焦点节点始终位于视口中央。

*状态着色映射*: 每个节点根据其 status 属性计算四种 CSS 类:
- `iconColorClass`: 图标颜色（done=emerald-500, in_progress=blue-500, skipped=muted-foreground/50）
- `bgColorClass`: 背景色（done=emerald-500/10, in_progress=blue-500/10, skipped=muted/30）
- `ringClass`: in_progress 时的蓝色光环动画（ring-2 ring-blue-500/30 animate-stage-ring-glow）
- `pulseClass`: in_progress 时的脉冲缩放动画（animate-stage-pulse）

*节点点击行为*: 点击节点时，首先更新焦点索引使其居中（若不同于当前焦点），然后调用 `onStageClick` 回调通知父组件。

**核心代码**（translateX 居中计算 + 轨道渲染）:
```typescript
const NODE_WIDTH = 88;
const NODE_GAP = 4;
const NODE_STEP = NODE_WIDTH + NODE_GAP;

// ...
const viewportWidth = 3 * NODE_STEP;
const centerOffset = (viewportWidth - NODE_WIDTH) / 2;
const translateX = -(focusedIndex * NODE_STEP - centerOffset);

// 轨道元素
React.createElement(
  'div',
  {
    'data-stage-track': '',
    className: 'flex items-center gap-1 absolute',
    style: {
      transform: `translateX(${translateX}px)`,
      transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },
  ...STAGE_CONFIG.map((cfg, index) => {
    const step = getStageStep(stage, cfg.key);
    const status = step?.status ?? 'skipped';
    // ... 状态着色计算 ...
  }),
)
```
Source: `src/client/components/StageProgressAxis.tsx`:122-195, 208-294

**使用示例**:
```typescript
// DetailPanel 中的典型使用方式
const [selectedStageKey, setSelectedStageKey] = useState<string | undefined>(undefined);

React.createElement(StageProgressAxis, {
  stage: selectedChange.stage,
  onStageClick: (stageKey) => setSelectedStageKey(stageKey),
  selectedStageKey,
})
```
Explanation: DetailPanel 通过 selectedChange.stage 提供数据，通过 onStageClick 回调接收用户点击的阶段 key，并通过 selectedStageKey 保持视觉选中状态同步。

---

### `StageProgressAxisProps`

**Source**: `src/client/components/StageProgressAxis.tsx`:109-115

**功能**: StageProgressAxis 组件的 Props 接口定义。

```typescript
export interface StageProgressAxisProps {
  stage?: ChangeStage;
  onStageClick?: (stageKey: string) => void;
  focusedIndex?: number;
  onFocusedIndexChange?: (index: number) => void;
  selectedStageKey?: string;
}
```

**参数说明**:
- `stage` (`ChangeStage | undefined`): 变更阶段数据，undefined 时显示空状态
- `onStageClick` (`(stageKey: string) => void`): 节点点击回调，stageKey 为 STAGE_CONFIG 中的 key 值
- `focusedIndex` (`number`): 受控焦点索引（0-6），传入后覆盖内部状态和 selectedStageKey 派生
- `onFocusedIndexChange` (`(index: number) => void`): 焦点变化回调，仅在 focusedIndex 受控时生效
- `selectedStageKey` (`string`): 选中的阶段 key，用于派生焦点索引（优先级低于 focusedIndex）

## Data Structures

### `StageConfigItem`
```typescript
export interface StageConfigItem {
  key: string;
  displayNameKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}
```
- `key` (`string`): 阶段数据标识，对应 ChangeStage 的字段名（如 'explore'、'subAgentDev'）
- `displayNameKey` (`string`): i18n 翻译键，用于显示阶段名称
- `icon` (`React.ComponentType`): lucide-react 图标组件，接受 size 和 className props

### `StageStep`（来自 utils/memory.ts）
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
- `title` (`string`): 阶段标题
- `from` (`string`): 阶段开始时间
- `to` (`string`): 阶段结束时间
- `status` (`'in_progress' | 'skipped' | 'done'`): 阶段状态
- `inputPath` (`string`): 输入路径
- `outputPath` (`string`): 输出路径

### `ChangeStage`（来自 utils/memory.ts）
```typescript
export type ChangeStage = {
  explore: StageStep;
  brainstorm: StageStep;
  propose: StageStep;
  plan: StageStep;
  reviewArtifacts: StageStep;
  subAgentDev: SubAgentDevProgress[];
  finalize: FinalizeStage;
};
```
- 5 个通用阶段字段直接持有 StageStep
- `subAgentDev`: 子代理开发进度数组，每个元素包含 featureId 和 progress（StageStep 数组）
- `finalize`: 终结阶段数据，包含 integration（StageStep 数组）、codecheck（StageStep）、archive（StageStep）

### CSS 常量

| 常量 | 值 | 说明 |
|------|-----|------|
| NODE_WIDTH | 88px | 单个阶段节点宽度 |
| NODE_GAP | 4px | 节点间距（gap-1） |
| NODE_STEP | 92px | 节点步长 = NODE_WIDTH + NODE_GAP |

### CSS 动画（来自 index.css）

- `animate-stage-pulse`: 脉冲缩放动画，0%/100% scale(1) -> 50% scale(1.15)
- `animate-stage-ring-glow`: 光环扩散动画，0%/100% box-shadow 0 -> 50% box-shadow 0 0 0 6px rgba(59,130,246,0)

## Error Handling and Edge Cases

1. **stage 为 undefined**: 当 stage prop 为 undefined 时，组件不渲染节点行和导航栏，而是返回居中文字提示 "暂无阶段数据"（i18n key: progressAxis.emptyStage）。这对应新创建的变更或数据加载失败的场景。

2. **单个阶段数据缺失**: getStageStep 对未定义的字段返回 undefined，组件使用 `step?.status ?? 'skipped'` 将缺失状态默认为 skipped，以避免渲染错误。

3. **subAgentDev 空数组**: 当 `stage.subAgentDev` 为空数组时，getStageStep 返回 undefined，该阶段显示为 skipped 状态。

4. **finalize 子数据为空**: 当 finalize 的所有子状态数组为空（subStatuses.length === 0）时，聚合逻辑不会将状态设为 done 或 skipped，而是返回 in_progress（因为 allDone 和 allSkipped 均为 false）。

5. **边界导航**: 导航按钮在到达边界时（focusedIndex === 0 或 6）自动禁用，样式变为 `text-muted-foreground/30 cursor-not-allowed`，点击无效。

6. **焦点溢出防护**: selectedStageKey 在 STAGE_CONFIG 中找不到匹配时，findIndex 返回 -1，焦点回退到 internalIndex 或 findActiveIndex 的默认值。

## Dependencies

- **Depends on**:
  - `react` (useState, useMemo, useCallback): React hooks
  - `react-i18next` (useTranslation): 国际化翻译
  - `lucide-react` (Compass, Lightbulb, FileText, ListChecks, Eye, Code2, Flag): 7 个阶段图标
  - `../../utils/memory.js` (ChangeStage, StageStep): 阶段数据类型定义
  - `src/client/index.css` (animate-stage-pulse, animate-stage-ring-glow): CSS 动画关键帧

- **Depended by**:
  - `src/client/components/DetailPanel.tsx`: 直接使用 StageProgressAxis 渲染阶段进度轴
  - `src/client/components/StageSummary.tsx`: 引用 STAGE_CONFIG 获取阶段顺序

## Usage Examples

### 基本使用（DetailPanel 中的集成）

```typescript
import React, { useState, useCallback } from 'react';
import { StageProgressAxis } from './StageProgressAxis.js';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';

function DetailPanel({ selectedChange }: { selectedChange: ChangeEntryWithCwd | null }) {
  const [selectedStageKey, setSelectedStageKey] = useState<string | undefined>(undefined);

  const handleStageClick = useCallback((stageKey: string) => {
    setSelectedStageKey(stageKey);
  }, []);

  if (!selectedChange) return null;

  return React.createElement('div', { className: 'px-6 py-4' },
    React.createElement(StageProgressAxis, {
      stage: selectedChange.stage,
      onStageClick: handleStageClick,
      selectedStageKey,
    })
  );
}
```
Explanation: DetailPanel 是 StageProgressAxis 的唯一消费者。它将变更数据的 stage 字段传入，监听 onStageClick 更新 selectedStageKey，再将 selectedStageKey 回传给组件以保持视觉选中同步。这种模式使得 StageSummary 可以同时知道用户选中了哪个阶段。

### 受控模式使用

```typescript
import { useState } from 'react';
import { StageProgressAxis, STAGE_CONFIG } from './StageProgressAxis.js';

function ControlledExample({ stage }: { stage: ChangeStage }) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  return React.createElement(StageProgressAxis, {
    stage,
    focusedIndex,
    onFocusedIndexChange: setFocusedIndex,
    onStageClick: (key) => {
      const idx = STAGE_CONFIG.findIndex(cfg => cfg.key === key);
      if (idx >= 0) setFocusedIndex(idx);
    },
  });
}
```
Explanation: 受控模式下，父组件完全管理焦点索引。这在需要与其他 UI 元素联动时有用（例如左右面板同步滚动）。focusedIndex 传入后，组件的内部状态和 selectedStageKey 派生逻辑均被覆盖。

### 引用 STAGE_CONFIG

```typescript
import { STAGE_CONFIG } from './StageProgressAxis.js';

// 获取阶段数量
const totalStages = STAGE_CONFIG.length; // 7

// 根据 key 查找阶段信息
const stageInfo = STAGE_CONFIG.find(cfg => cfg.key === 'propose');
// => { key: 'propose', displayNameKey: 'progressAxis.stageName.propose', icon: FileText }
```
Explanation: STAGE_CONFIG 是导出的常量数组，外部模块可直接引用。StageSummary 也使用该数组来确定阶段显示顺序和名称。
