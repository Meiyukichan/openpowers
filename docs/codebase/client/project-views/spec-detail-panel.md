# DetailPanel Component

> Source files:
> - `src/client/components/DetailPanel.tsx` : 1-106

## Overview

DetailPanel 是项目视图（Project Views）中的主内容区容器组件，负责展示当前选中变更（Change）的阶段进度详情。它在应用架构中扮演着「变更详情视图」的角色 -- 当用户在左侧 ProjectSidebar 中点击某个变更卡片后，DetailPanel 承接该变更数据，并将其呈现为阶段进度轴（StageProgressAxis）与阶段摘要（StageSummary）的组合视图。

**设计动机**：将变更详情的查看从侧边栏中解耦，为主内容区提供完整的阶段浏览体验。采用「选中驱动渲染」的设计模式：组件内部维护 `selectedStageKey` 状态，在 StageProgressAxis（允许用户点击选择阶段）和 StageSummary（展示所选阶段的详情）之间进行桥接，实现「点击进度轴节点 -> 自动切换底部详情面板」的交互。

**使用场景**：
- 当 ActivityBar 切换至「Projects」视图时，App 将 DetailPanel 渲染为主内容区
- 当用户在 ProjectSidebar 中选中某个 ChangeCard 时，App 通过 `selectedChange` prop 将对应的 `ChangeEntryWithCwd` 传入
- 当无变更被选中时，展示引导提示（Sparkles 图标 + 引导文案）

**涉及文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/client/components/DetailPanel.tsx` | DetailPanel 组件实现，包含空状态引导、头部信息、StageProgressAxis 和 StageSummary 的组合渲染 |

## Architecture / Flow

DetailPanel 的渲染流程如下：

```
App (selectedChange state)
  |
  v
DetailPanel({ selectedChange })
  |
  +-- selectedChange === null ?
  |     |
  |     +-- YES --> 渲染引导提示（Sparkles 图标 + detailPanel.guideText 国际化文案）
  |     |
  |     +-- NO  --> 渲染详情视图：
  |                    |
  |                    +-- Header: 变更名称（h2）+ 描述（p，可选）
  |                    |
  |                    +-- StageProgressAxis({ stage, onStageClick, selectedStageKey })
  |                    |       |
  |                    |       +-- 用户点击某阶段节点 --> onStageClick(stageKey)
  |                    |                                   |
  |                    |                                   v
  |                    |                           setSelectedStageKey(stageKey)
  |                    |
  |                    +-- Divider (hr)
  |                    |
  |                    +-- StageSummary({ stage, selectedStageKey })
  |                            |
  |                            +-- 根据 selectedStageKey 展示对应阶段的详细信息
```

**状态管理**：组件内部使用 `useState<string | undefined>` 管理 `selectedStageKey`，初始值为 `undefined`。当 StageProgressAxis 中用户点击某阶段节点时，触发 `onStageClick` 回调，更新此状态，随后 StageSummary 根据新的 `selectedStageKey` 渲染对应阶段详情。这是一种典型的「受控子组件联动」模式。

## Functionality / Interface Details

### `DetailPanel({ selectedChange }: DetailPanelProps) -> React.ReactElement`

**Source**: `src/client/components/DetailPanel.tsx`:33-105

**Functionality**: DetailPanel 是一个纯展示的容器组件，负责以下三项核心职责：
1. **空状态引导**：当 `selectedChange` 为 `null` 时，渲染一个居中的引导区域，包含 Sparkles 图标和国际化文案（`detailPanel.guideText`），提示用户在左侧点击变更卡片。
2. **变更头部信息**：当有选中变更时，渲染变更名称（`<h2>` 标签，超长截断带 `title` 提示）和可选的描述文字（最多显示 2 行，带 `line-clamp-2`）。
3. **阶段交互协调**：作为 StageProgressAxis 和 StageSummary 之间的状态桥梁，管理 `selectedStageKey` 状态，使得用户点击进度轴节点后自动切换底部详情展示。

**Parameters**:
- `selectedChange` (`ChangeEntryWithCwd | null`): 当前选中的变更条目。包含变更的 `name`、`description`、`stage`（阶段进度数据）、`cwd`（项目路径）等字段。当为 `null` 时组件渲染引导视图；当有值时渲染完整的详情视图。

**Return Value**:
- `React.ReactElement`: 根据 `selectedChange` 是否为空，返回两种不同布局的元素树。

**Core Logic**:

组件首先通过 `useTranslation` 获取 i18n 翻译函数，然后初始化 `selectedStageKey` 状态（`useState<string | undefined>(undefined)`）。

当 `selectedChange` 为 `null` 时，直接返回引导视图 -- 一个 `flex-1` 占满父容器的居中布局，包含蓝色半透明圆角背景的 Sparkles 图标和一行提示文字。

当 `selectedChange` 有值时，返回详情视图的四层垂直结构：
1. **Header 区域**（`px-6 pt-6 pb-2`）：渲染 `selectedChange.name` 作为标题，使用 `text-lg font-bold text-foreground truncate` 样式并设置 `title` 属性确保超长名称可通过原生 tooltip 查看。描述段落使用条件渲染（`selectedChange.description &&`），仅在描述存在时显示，样式为 `text-xs text-muted-foreground mt-1 line-clamp-2`，最多展示两行。
2. **StageProgressAxis 区域**（`px-6 py-4`）：将 `selectedChange.stage`、`handleStageClick` 回调、当前 `selectedStageKey` 传递给 StageProgressAxis 组件。
3. **分隔线**（`<hr>` with `mx-6 border-border`）：视觉分隔进度轴和摘要区域。
4. **StageSummary 区域**（`flex-1 px-6 py-4 overflow-y-auto`）：将 `selectedChange.stage` 和 `selectedStageKey` 传递给 StageSummary，`flex-1` 确保摘要区域占据剩余空间，`overflow-y-auto` 允许内容纵向滚动。

`handleStageClick` 回调使用 `useCallback` 包裹（依赖数组为空），直接调用 `setSelectedStageKey` 更新状态。

**Core Code**:
```tsx
export function DetailPanel({ selectedChange }: DetailPanelProps): React.ReactElement {
  const { t } = useTranslation();

  const [selectedStageKey, setSelectedStageKey] = useState<string | undefined>(undefined);

  const handleStageClick = useCallback((stageKey: string) => {
    setSelectedStageKey(stageKey);
  }, []);

  // No change selected - show guide
  if (!selectedChange) {
    return React.createElement(
      'div',
      { className: 'flex-1 flex items-center justify-center' },
      React.createElement(
        'div',
        { className: 'flex flex-col items-center gap-3 text-center p-8' },
        React.createElement(
          'div',
          { className: 'flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10' },
          React.createElement(Sparkles, { size: 28, className: 'text-blue-500/60' }),
        ),
        React.createElement(
          'p',
          { className: 'text-sm text-muted-foreground max-w-xs' },
          t('detailPanel.guideText'),
        ),
      ),
    );
  }

  return React.createElement(
    'div',
    { className: 'flex-1 flex flex-col overflow-y-auto' },
    // Header with change name
    React.createElement(
      'div',
      { className: 'px-6 pt-6 pb-2' },
      React.createElement(
        'h2',
        { className: 'text-lg font-bold text-foreground truncate', title: selectedChange.name },
        selectedChange.name,
      ),
      selectedChange.description &&
        React.createElement(
          'p',
          { className: 'text-xs text-muted-foreground mt-1 line-clamp-2', title: selectedChange.description },
          selectedChange.description,
        ),
    ),
    // Stage Progress Axis
    React.createElement(
      'div',
      { className: 'px-6 py-4' },
      React.createElement(StageProgressAxis, {
        stage: selectedChange.stage,
        onStageClick: handleStageClick,
        selectedStageKey,
      }),
    ),
    // Divider
    React.createElement('hr', { className: 'mx-6 border-border' }),
    // Stage Summary
    React.createElement(
      'div',
      { className: 'flex-1 px-6 py-4 overflow-y-auto' },
      React.createElement(StageSummary, {
        stage: selectedChange.stage,
        selectedStageKey,
      }),
    ),
  );
}
```
Source: `src/client/components/DetailPanel.tsx`:33-105

**Usage Example**:
```tsx
// App.tsx 中的典型使用方式
import { DetailPanel } from './components/DetailPanel.js';
import type { ChangeEntryWithCwd } from '../server/changes/shared.js';

// App 组件中管理 selectedChange 状态
const [selectedChange, setSelectedChange] = useState<ChangeEntryWithCwd | null>(null);

// 当 activeView 为 'projects' 时，渲染 DetailPanel
activeView === 'projects'
  ? React.createElement(DetailPanel, {
      selectedChange,
      key: selectedChange?.path ?? 'empty',  // 使用 key 确保切换变更时重置内部状态
    })
  : React.createElement(ProviderList, { /* ... */ })
```
Explanation: App 组件在 `activeView` 为 `'projects'` 时渲染 DetailPanel，传入 `selectedChange`（由 ProjectSidebar 中的 ChangeCard 点击事件更新）。`key` prop 使用 `selectedChange?.path ?? 'empty'` 是一个关键设计 -- 当用户切换到不同的变更时，React 会因为 key 变化而销毁旧组件实例并创建新实例，从而自动将 `selectedStageKey` 重置为 `undefined`，避免残留上一个变更的阶段选择状态。

---

### `DetailPanelProps` Interface

**Source**: `src/client/components/DetailPanel.tsx`:20-22

**Functionality**: 定义 DetailPanel 组件的属性接口，描述组件接受的外部输入。

**Parameters**:
- `selectedChange` (`ChangeEntryWithCwd | null`): 当前被选中的变更条目。类型为 `ChangeEntryWithCwd`（在 `src/server/changes/shared.ts` 中定义，是 `ChangeEntry & { cwd: string }` 的交叉类型）。为 `null` 表示无变更被选中，组件将展示引导视图。

**Core Code**:
```tsx
export interface DetailPanelProps {
  selectedChange: ChangeEntryWithCwd | null;
}
```
Source: `src/client/components/DetailPanel.tsx`:20-22

**Usage Example**:
```tsx
// 从 ProjectSidebar 选中事件获取变更数据后传入
const handleChangeClick = useCallback((change: ChangeEntryWithCwd) => {
  setSelectedChange(change);
}, []);

// 传入 DetailPanel
React.createElement(DetailPanel, { selectedChange })
```
Explanation: `selectedChange` 的数据来源于 ProjectSidebar 中用户点击 ChangeCard 触发的 `onChangeClick` 回调，由 App 根组件中的 `handleChangeClick` 处理并更新状态。

---

## Data Structures

### `DetailPanelProps`

```tsx
export interface DetailPanelProps {
  selectedChange: ChangeEntryWithCwd | null;
}
```
- `selectedChange` (`ChangeEntryWithCwd | null`): 当前选中的变更条目，包含完整的变更信息和所属项目的 cwd 路径

### `ChangeEntryWithCwd`

```tsx
// src/server/changes/shared.ts:19
export type ChangeEntryWithCwd = ChangeEntry & { cwd: string };
```
- `ChangeEntry`: 来自 `src/utils/memory.ts`，通过 Zod schema 推断得出的类型
- `cwd` (`string`): 该变更所属项目的工作目录绝对路径

### `ChangeEntry`（上游依赖类型，供参考）

```tsx
// src/utils/memory.ts:97-108
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
- `name` (`string`): 变更名称，DetailPanel 用作 `<h2>` 标题
- `description` (`string`): 变更描述，DetailPanel 中最多显示 2 行
- `stage` (`ChangeStage | undefined`): 阶段进度数据，传递给 StageProgressAxis 和 StageSummary 进行渲染

### i18n Keys

DetailPanel 使用以下国际化键：
- `detailPanel.guideText`: 空状态引导文案（中文：「点击左侧变更卡片查看阶段进度详情」）

## Error Handling and Edge Cases

DetailPanel 本身不进行异步数据获取或网络请求，因此没有 API 错误处理逻辑。以下边界情况由组件自身或调用方处理：

1. **`selectedChange` 为 `null`**：组件通过 `if (!selectedChange)` 条件分支完整处理，渲染引导视图而非尝试访问 null 属性。
2. **`selectedChange.description` 为空字符串**：由于使用 `selectedChange.description &&` 条件渲染，空字符串会被 JavaScript falsy 判定跳过，不渲染描述段落。
3. **`selectedChange.stage` 为 `undefined`**：此情况由下游 StageProgressAxis 和 StageSummary 各自处理 -- 当 `stage` 为 `undefined` 时，它们会渲染对应的空状态（如「暂无数据」提示）。
4. **变更切换时的状态残留**：通过 App 中使用 `key: selectedChange?.path ?? 'empty'` 强制 React 在变更切换时销毁并重建 DetailPanel 实例，从而自动重置 `selectedStageKey` 状态至 `undefined`。
5. **超长变更名称/描述**：标题使用 `truncate`（CSS `text-overflow: ellipsis`）和原生 `title` 属性；描述使用 `line-clamp-2` 限制两行并同样设置 `title` 属性。

## Dependencies

**Depends on**:
- `StageProgressAxis`（`src/client/components/StageProgressAxis.tsx`）: 渲染 7 阶段水平进度轴，接受 `stage`、`onStageClick`、`selectedStageKey` props
- `StageSummary`（`src/client/components/StageSummary.tsx`）: 渲染所选阶段的详细信息，接受 `stage`、`selectedStageKey` props
- `ChangeEntryWithCwd`（`src/server/changes/shared.ts`）: 变更条目数据类型
- `react-i18next`（`useTranslation`）: 国际化翻译钩子
- `lucide-react`（`Sparkles`）: 空状态引导图标

**Depended by**:
- `App`（`src/client/App.tsx`）: 根组件在 `activeView === 'projects'` 时渲染 DetailPanel，管理 `selectedChange` 状态并通过 prop 传入

## Usage Examples

### 基本使用（从 App 组件集成）

```tsx
import React, { useState, useCallback } from 'react';
import { DetailPanel } from './components/DetailPanel.js';
import type { ChangeEntryWithCwd } from '../server/changes/shared.js';
import type { ActivityBarView } from './components/ActivityBar.js';

function App() {
  const [selectedChange, setSelectedChange] = useState<ChangeEntryWithCwd | null>(null);
  const [activeView, setActiveView] = useState<ActivityBarView>('providers');

  // 处理 ProjectSidebar 中 ChangeCard 的点击事件
  const handleChangeClick = useCallback((change: ChangeEntryWithCwd) => {
    setSelectedChange(change);
  }, []);

  // 切换视图时清空选中状态
  const handleViewChange = (view: ActivityBarView) => {
    setActiveView(view);
    if (view !== 'projects') {
      setSelectedChange(null);
    }
  };

  // 当切换到 projects 视图时渲染 DetailPanel
  return (
    <div>
      {activeView === 'projects' && (
        <DetailPanel
          selectedChange={selectedChange}
          key={selectedChange?.path ?? 'empty'}
        />
      )}
    </div>
  );
}
```

Explanation:
1. App 组件通过 `useState` 管理 `selectedChange` 状态，初始值为 `null`
2. `handleChangeClick` 回调由 ProjectSidebar 的 ChangeCard 点击事件触发，将选中的变更对象更新到状态中
3. `key` prop 使用 `selectedChange?.path ?? 'empty'`，确保在变更切换时 React 会销毁旧实例并重建新实例，从而重置 `selectedStageKey`
4. 当视图从 projects 切换到 providers 时，`handleViewChange` 会主动将 `selectedChange` 清空为 `null`

### 两种渲染状态

**状态一：无选中变更（引导视图）**

当 `selectedChange` 为 `null` 时，DetailPanel 渲染如下结构：
```
+-------------------------------------------+
|                                           |
|      [Sparkles Icon in blue circle]       |
|                                           |
|  点击左侧变更卡片查看阶段进度详情          |
|                                           |
+-------------------------------------------+
```

**状态二：有选中变更（详情视图）**

当 `selectedChange` 有值时，渲染如下结构：
```
+-------------------------------------------+
| Change Name (h2, bold, truncate)          |
| Description text (xs, muted, 2 lines)    |
|                                           |
| [StageProgressAxis - 7 stage nodes]       |
|                                           |
| ──────────────────────────────────────    |
|                                           |
| [StageSummary - selected stage details]   |
|                                           |
+-------------------------------------------+
```

用户在 StageProgressAxis 中点击任一阶段节点后，下方 StageSummary 自动切换至对应阶段的详情展示。
