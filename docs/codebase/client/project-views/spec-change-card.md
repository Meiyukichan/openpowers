# ChangeCard 组件

> Source files:
> - `src/client/components/ChangeCard.tsx` : 1-105

## Overview

ChangeCard 是一个纯展示型 React 函数组件，用于渲染单条变更记录的卡片视图。它是项目侧边栏（ProjectSidebar）和项目分组（ProjectGroup）两个容器组件共享的基础 UI 单元，承担着变更状态可视化、交互选择反馈的核心职责。

**设计动机**：变更记录在 UI 中需要以一致的视觉风格呈现，同时根据变更所处状态（active / archived）给予不同的图标和颜色语义。ChangeCard 通过统一的组件抽象，将状态图标、名称、描述、工作目录路径等信息封装在一张带有交互动效的卡片中，避免了在多处容器组件中重复编写样式逻辑。

**使用场景**：
- 在 ProjectSidebar 的"变更中"（active）标签页中，直接渲染所有活跃变更卡片
- 在 ProjectSidebar 的"项目"（projects）标签页中，通过 ProjectGroup 间接渲染按 cwd 分组的变更卡片
- 两处调用均通过 `isSelected` 和 `onClick` 实现单选高亮交互

**涉及源文件**：
- `src/client/components/ChangeCard.tsx`：ChangeCard 组件定义、Props 接口、边框颜色常量

## Architecture / Flow

ChangeCard 本身不管理业务状态，它是一个受控展示组件，仅维护一个局部 `hovered` 状态用于边框颜色动画。数据流方向为单向：

```
ProjectSidebar / ProjectGroup
        │
        ▼  props: { change, showCwd, onClick, isSelected }
    ChangeCard
        │
        ▼  渲染: 状态图标 + 名称 + 描述 + cwd 标签
       DOM
```

**边框颜色状态机**（三种视觉状态按优先级依次判定）：

```
isSelected = true  ──▶  蓝色选中边框 (#3b82f6)
hovered = true     ──▶  状态对应色 (active→绿色, archived→琥珀色)
default            ──▶  柔和灰色 (muted-foreground/25)
```

优先级：`isSelected` > `hovered` > `default`。选中状态始终覆盖悬停状态，保证视觉层次清晰。

## Functionality / Interface Details

### `ChangeCardProps` 接口

```typescript
export interface ChangeCardProps {
  change: ChangeEntryWithCwd;
  showCwd?: boolean;
  onClick?: (change: ChangeEntryWithCwd) => void;
  isSelected?: boolean;
}
```

**Source**: `src/client/components/ChangeCard.tsx`:13-21

- `change` (`ChangeEntryWithCwd`): 必填。变更条目数据，包含 `name`、`description`、`status`、`cwd` 等字段。组件从中提取状态来决定图标类型和颜色方案。
- `showCwd` (`boolean`, 默认 `true`): 是否显示 cwd 路径标签。在 ProjectGroup 中渲染时传入 `false`，因为分组头已展示 cwd 信息，避免重复。
- `onClick` (`(change: ChangeEntryWithCwd) => void`, 可选): 卡片点击回调，将当前变更条目作为参数回传给父组件。父组件通常用它来切换右侧 DetailPanel 的内容。
- `isSelected` (`boolean`, 默认 `false`): 标记此卡片是否为当前选中状态。为 `true` 时边框变为蓝色、背景叠加蓝色透明度，提供视觉高亮反馈。

---

### `ChangeCard({ change, showCwd = true, onClick, isSelected = false })`

**Source**: `src/client/components/ChangeCard.tsx`:40-104

**功能**: 渲染单张变更卡片，包含三行布局：第一行是状态图标加名称，第二行是描述文本（限两行），第三行是 cwd 路径的等宽字体标签。整个卡片支持鼠标悬停边框色变化和点击选中高亮。

**参数**: 与上述 `ChangeCardProps` 接口一致。

**返回值**: `React.ReactElement` —— 一个 `div` 容器元素，包含嵌套的图标区、文本区和路径标签。

**核心逻辑**:

1. **状态判定**：通过 `change.status === 'active'` 确定是否为活跃状态，进而选择绿色 Zap 图标或琥珀色 Archive 图标，以及对应的背景色样式（`bg-green-500/10 text-green-500` 或 `bg-amber-500/10 text-amber-500`）。

2. **边框颜色计算**：使用三元链判定边框颜色。`isSelected` 为最高优先级（蓝色），其次是悬停状态（按 status 取对应色），最后是默认灰色。颜色值通过 `style` 内联注入 `borderLeftColor`，实现 CSS transition 的平滑过渡。

3. **选中背景叠加**：当 `isSelected` 为 `true` 时，在边框颜色之外还叠加 `backgroundColor: 'hsla(217, 91%, 60%, 0.06)'`（极淡蓝色），提供双重视觉反馈。

4. **条件渲染**：描述文本和 cwd 标签均使用短路求值（`change.description && ...`、`showCwd && ...`）进行条件渲染，避免渲染空元素。

5. **文本截断**：名称使用 `truncate`（单行省略号），描述使用 `line-clamp-2`（两行截断），cwd 使用 `truncate max-w-full`。三处均设置 `title` 属性以支持鼠标悬停查看完整内容。

**核心代码**:

```tsx
export function ChangeCard({ change, showCwd = true, onClick, isSelected = false }: ChangeCardProps): React.ReactElement {
  const isActive = change.status === 'active';
  const iconBg = isActive ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500';
  const [hovered, setHovered] = useState(false);

  let borderLeftColor = DEFAULT_BORDER_COLOR;
  if (isSelected) {
    borderLeftColor = SELECTED_BORDER_COLOR;
  } else if (hovered) {
    borderLeftColor = HOVER_BORDER_COLORS[change.status] ?? DEFAULT_BORDER_COLOR;
  }

  const handleClick = () => {
    onClick?.(change);
  };

  return React.createElement(
    'div',
    {
      className:
        'relative overflow-hidden rounded-xl border border-l-[3px] bg-card text-card-foreground px-3.5 py-3 transition-all duration-200 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.1)] cursor-pointer active:scale-[0.98]',
      style: { borderLeftColor, ...(isSelected ? { backgroundColor: 'hsla(217, 91%, 60%, 0.06)' } : {}) },
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onClick: handleClick,
    },
    // ... 子元素省略
  );
}
```
Source: `src/client/components/ChangeCard.tsx`:40-104

**使用示例**:

```tsx
import { ChangeCard } from './ChangeCard';

// 在 ProjectSidebar 的 active 标签页中使用
function renderActiveList(changes, selectedChange, onChangeClick) {
  return changes.map((change) => (
    <ChangeCard
      key={`${change.cwd}::${change.path}`}
      change={change}
      onClick={onChangeClick}
      isSelected={
        selectedChange
          ? `${selectedChange.cwd}::${selectedChange.path}` === `${change.cwd}::${change.path}`
          : false
      }
    />
  ));
}
```
说明：在 ProjectSidebar 的 active 标签页中，`showCwd` 默认为 `true`，会显示 cwd 路径标签。`isSelected` 通过比较 `cwd::path` 组合键来判断是否为当前选中项。

```tsx
// 在 ProjectGroup 中使用（已按 cwd 分组，无需重复显示 cwd）
function renderGroupCards(changes, onChangeClick, selectedChange) {
  return sorted.map((change) => (
    <ChangeCard
      key={`${change.cwd}::${change.path}`}
      change={change}
      showCwd={false}
      onClick={onChangeClick}
      isSelected={
        selectedChange
          ? `${selectedChange.cwd}::${selectedChange.path}` === `${change.cwd}::${change.path}`
          : false
      }
    />
  ));
}
```
说明：在 ProjectGroup 中 `showCwd` 显式传入 `false`，因为分组头部已经展示了 cwd 信息。

---

### 边框颜色常量

**Source**: `src/client/components/ChangeCard.tsx`:23-33

组件定义了三组颜色常量，用于控制左边界在不同交互状态下的视觉表现：

```typescript
const DEFAULT_BORDER_COLOR = 'hsl(240 3.8% 46.1% / 0.25)'; // muted-foreground/25

const HOVER_BORDER_COLORS: Record<string, string> = {
  active: '#22c55e',   // green-500
  archived: '#f59e0b', // amber-500
};

const SELECTED_BORDER_COLOR = '#3b82f6'; // blue-500
```

- `DEFAULT_BORDER_COLOR`：非悬停、非选中时的默认左边界色，使用 HSL 格式的柔和灰色（muted-foreground 25% 透明度）。
- `HOVER_BORDER_COLORS`：悬停时按 `change.status` 索引的颜色映射。active 状态显示绿色（green-500），archived 状态显示琥珀色（amber-500）。若 status 不在映射中则回退到默认色。
- `SELECTED_BORDER_COLOR`：选中状态的蓝色边框（blue-500），覆盖悬停颜色。

---

### 悬停状态管理

**Source**: `src/client/components/ChangeCard.tsx`:43,62-63

组件通过 `useState(false)` 维护一个局部 `hovered` 布尔状态。当鼠标进入卡片区域时 `onMouseEnter` 将其设为 `true`，离开时 `onMouseLeave` 将其重置为 `false`。此状态仅用于驱动边框颜色的切换，不影响任何外部状态。

## Data Structures

### `ChangeEntryWithCwd`

```typescript
export type ChangeEntryWithCwd = ChangeEntry & { cwd: string };
```
Source: `src/server/changes/shared.ts`:19

在 `ChangeEntry` 基础上追加 `cwd` 字段，标识变更条目所属的项目工作目录路径。`ChangeEntry` 由 `ChangeEntrySchema`（Zod schema）定义：

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
Source: `src/utils/memory.ts`:97-108

ChangeCard 实际使用的字段：
- `name` (`string`): 变更名称，显示在图标右侧，单行截断
- `description` (`string`): 变更描述，显示在第二行，两行截断
- `status` (`'active' | 'archived' | 'removed'`): 变更状态，决定图标类型和边框悬停色
- `cwd` (`string`): 项目工作目录路径，显示在底部的等宽字体标签中

## Error Handling and Edge Cases

1. **空描述**：当 `change.description` 为假值（空字符串、undefined）时，描述行通过短路求值跳过渲染，不产生空白占位。
2. **未知 status 值**：当 `change.status` 不在 `HOVER_BORDER_COLORS` 映射中时，使用 `?? DEFAULT_BORDER_COLOR` 回退到默认灰色边框，避免视觉异常。
3. **onClick 未提供**：当 `onClick` 为 `undefined` 时，`handleClick` 内的 `onClick?.(change)` 安全短路，不会抛出错误。卡片仍可悬停但点击无响应。
4. **showCwd 为 false**：cwd 标签不渲染，底部留白自然收窄，不影响布局。
5. **active:scale-[0.98]**：卡片使用 `active` 伪类实现按压缩放效果，增强点击反馈，属于纯 CSS 层面的交互，无逻辑风险。

## Dependencies

- **Depends on**:
  - `lucide-react`：提供 `Zap` 和 `Archive` 图标组件
  - `react`：`useState` Hook 用于管理悬停状态
  - `src/server/changes/shared.ts`：提供 `ChangeEntryWithCwd` 类型定义
  - `src/utils/memory.ts`：提供底层 `ChangeEntry` 和 `ChangeEntrySchema`（通过 shared.ts 间接依赖）

- **Depended by**:
  - `src/client/components/ProjectSidebar.tsx`：在 active 标签页中直接渲染 ChangeCard 列表
  - `src/client/components/ProjectGroup.tsx`：在可折叠分组中渲染 ChangeCard 列表（`showCwd={false}`）

## Usage Examples

### 基本使用

```tsx
import { ChangeCard } from './ChangeCard';
import type { ChangeEntryWithCwd } from '../../server/changes/shared';

const exampleChange: ChangeEntryWithCwd = {
  name: '重构登录模块',
  path: 'changes/refactor-login',
  description: '将 OAuth 2.0 认证逻辑从旧架构迁移到新的中间件模式',
  createdAt: '2026-07-01T10:00:00Z',
  updateAt: '2026-07-05T08:30:00Z',
  status: 'active',
  features: 3,
  todo: 1,
  artifacts: [{ id: 'spec-1', outputPath: 'docs/spec.md' }],
  cwd: 'D:\\project-code\\llm\\furina',
};

// 渲染一张活跃状态的卡片，带 cwd 标签，非选中状态
<ChangeCard change={exampleChange} onClick={(c) => console.log('点击了:', c.name)} />
```

说明：默认 `showCwd=true` 和 `isSelected=false`，卡片展示绿色 Zap 图标、变更名称、描述（最多两行）、cwd 路径标签。悬停时左边框变为绿色，点击触发 onClick 回调。

### 选中状态与隐藏 cwd

```tsx
// 在 ProjectGroup 内部使用，已按 cwd 分组无需重复显示
<ChangeCard
  change={exampleChange}
  showCwd={false}
  isSelected={true}
  onClick={handleCardClick}
/>
```

说明：`showCwd=false` 隐藏底部路径标签，`isSelected=true` 使左边框显示蓝色并叠加淡蓝背景，表示当前选中项。

### 在完整列表场景中的模式

```tsx
function ChangeList({ changes, selectedChange, onSelect }: Props) {
  return (
    <div className="space-y-1.5">
      {changes.map((change) => (
        <ChangeCard
          key={`${change.cwd}::${change.path}`}
          change={change}
          isSelected={
            selectedChange
              ? `${selectedChange.cwd}::${selectedChange.path}` ===
                `${change.cwd}::${change.path}`
              : false
          }
          onClick={onSelect}
        />
      ))}
    </div>
  );
}
```

说明：这是项目中实际使用的渲染模式。使用 `cwd::path` 组合作为唯一 key 和选中判定依据，确保跨项目目录的变更条目不会发生 key 冲突或选中误判。
