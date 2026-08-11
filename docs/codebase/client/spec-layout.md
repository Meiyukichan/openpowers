# Layout Shell & ActivityBar

> Source files:
> - `src/client/components/Layout.tsx` : 1-222
> - `src/client/components/ActivityBar.tsx` : 1-72

## Overview

本 Spec 涵盖 Furina 应用程序的整体外壳布局（Layout Shell）和左侧活动栏（ActivityBar）组件。这两个组件共同构成了 VSCode 风格的主界面骨架，是应用视觉结构的基础设施层。

**定位与职责**：
- **Layout** 是应用的顶层外壳组件，负责渲染固定顶部 Header 和下方内容区域的整体结构。Header 承载品牌标识、设置占位、重置按钮、Anthropic API 代理开关、会话管理占位、语言切换器以及条件渲染的「添加 Provider」按钮。内容区域左侧为 ActivityBar，中间为可选的侧边栏插槽，右侧为主内容区域。
- **ActivityBar** 是 48px 宽的垂直图标栏，提供 Providers（服务器视图）与 Projects（项目视图）之间的视图切换功能。

**设计动机**：
采用 VSCode 风格布局是为了在有限屏幕空间内实现高效的内容组织——左侧活动栏提供快速视图切换，Header 区域集中放置全局操作，主内容区保持最大化的信息展示面积。这种分层结构使得 Provider 管理和 Project 导航两个核心功能可以在同一界面内无缝切换，而无需页面跳转。

**使用场景**：
- 应用启动时，`App.tsx` 渲染 `Layout` 作为根布局组件
- 用户通过 ActivityBar 在 Providers 和 Projects 视图间切换
- Header 中的代理开关控制 Anthropic API 代理的启用/禁用
- Header 中的重置按钮触发 Provider 配置恢复到默认状态

**文件职责**：
- `Layout.tsx`：应用外壳组件，渲染 Header（品牌、设置、重置、代理开关、会话管理、语言切换、添加按钮）+ 内容区域（ActivityBar + sidebar 插槽 + main 区域）+ ConfirmResetDialog
- `ActivityBar.tsx`：48px 垂直图标栏，包含 Providers 和 Projects 两个视图切换按钮，活跃状态有蓝色高亮和左侧边框指示器。导出 `ActivityBarView` 类型

## Architecture / Flow

### 布局层级结构

```
+----------------------------------------------------------+
|  Header (sticky, z-50)                                    |
|  [Claude SVG] [Furina] [Settings] [Reset] [Proxy]    |
|  [Session] [LanguageSwitcher] [Add Provider (conditional)]|
+----------------------------------------------------------+
| ActivityBar | Sidebar (optional) | Main Content           |
| (48px)      | (ProjectSidebar)   | (max-w-5xl, scroll)    |
|             |                    |                         |
| [Providers] |                    |  children (ProviderList |
| [Projects]  |                    |   or DetailPanel)       |
+-------------+--------------------+-------------------------+
+----------------------------------------------------------+
|  ConfirmResetDialog (portal, conditional)                 |
+----------------------------------------------------------+
```

### 视图切换数据流

1. `App.tsx` 管理 `activeView` 状态（`'providers' | 'projects'`），持久化到 `localStorage`
2. `Layout` 接收 `activeView` 和 `onViewChange` props，传递给 `ActivityBar`
3. `ActivityBar` 渲染两个图标按钮，点击时调用 `onViewChange` 通知父组件
4. `App.tsx` 根据 `activeView` 决定：
   - sidebar：`'projects'` 时渲染 `ProjectSidebar`，否则为 `null`
   - children：`'providers'` 时渲染 `ProviderList`，`'projects'` 时渲染 `DetailPanel`

### Header 代理开关交互流程

1. `App.tsx` 从 `/furina/api/providers/proxy` 获取初始代理状态
2. 用户点击 toggle -> `onToggleProxy` 回调 -> `App.tsx` 调用 `PUT /furina/api/providers/proxy`
3. 成功后更新 `enableFurinaProxy` 状态，`Layout` 中 `Radio` 图标颜色和开关样式相应变化

## Functionality / Interface Details

### `Layout(props: LayoutProps) -> React.ReactElement`

**Source**: `src/client/components/Layout.tsx`:36-221

**Functionality**: 应用外壳组件，负责渲染整个应用的顶层布局结构。分为三个主要区域：(1) 粘性 Header 区域，包含品牌标识、全局操作按钮和工具栏；(2) 内容区域，由 ActivityBar、可选 sidebar 和主内容区横向排列组成；(3) 条件渲染的 ConfirmResetDialog 弹窗。Layout 本身不管理业务数据状态，仅管理确认弹窗的显示/隐藏状态 (`showConfirmReset`)，其余状态通过 props 从 App 层注入。

**Parameters**:
- `onAddProvider` (`() => void`): 点击 Header 右侧「添加 Provider」橙色圆形按钮时的回调，通知父组件打开添加 Provider 弹窗
- `onReset` (`() => void`): 用户在 ConfirmResetDialog 中确认重置后的回调，通知父组件执行重置操作
- `showToast` (`(text: string, type?: 'success' | 'error') => void`): Toast 通知函数，目前在 Layout 内部未直接使用，但作为 props 保留供未来扩展
- `enableFurinaProxy` (`boolean`): Anthropic API 代理的启用状态，控制 Radio 图标颜色（启用时 emerald-500 + animate-pulse）和 toggle 开关的视觉状态
- `onToggleProxy` (`() => void`): 代理开关 toggle 的回调，通知父组件切换代理状态
- `children` (`React.ReactNode`): 主内容区域的子组件，由 App 根据 `activeView` 传入 `ProviderList` 或 `DetailPanel`
- `activeView` (`ActivityBarView`): 当前活跃的视图类型，决定 add-provider 按钮是否显示（仅 `'providers'` 视图时显示），同时传递给 ActivityBar 用于高亮当前选中的图标
- `onViewChange` (`(view: ActivityBarView) => void`): 视图切换回调，传递给 ActivityBar
- `sidebar` (`React.ReactNode`): 侧边栏插槽，当 `activeView === 'projects'` 时 App 传入 `ProjectSidebar`，否则传入 `null`

**Return Value**:
- `React.ReactElement`: 完整的应用外壳 JSX 树

**Core Logic**:
1. **状态管理**: 使用 `useState` 管理 `showConfirmReset` 状态，控制 ConfirmResetDialog 的显示/隐藏
2. **Header 左侧区域**: 渲染 Claude SVG 图标 + "Furina" 品牌标题（使用 i18n 的 `app.brandName`）+ Settings 按钮（占位，无 onClick）+ Reset 按钮（RotateCcw 图标，点击设置 `showConfirmReset = true`）+ 代理开关区域（Radio 图标 + toggle switch）
3. **Header 右侧区域**: 渲染会话管理按钮（占位，SVG 时钟图标，onClick 为空函数）+ LanguageSwitcher + 条件渲染的 add-provider 按钮（仅 `activeView === 'providers'` 时显示，橙色圆形 + Plus 图标，支持 Enter/Space 键盘触发）
4. **内容区域**: 横向 flex 布局，左侧 ActivityBar（接收 `activeView` 和 `onViewChange`），中间 `sidebar` 插槽（直接渲染传入的 ReactNode），右侧 `main` 区域（`max-w-5xl` 居中、可纵向滚动）
5. **Header 样式**: `sticky top-0 z-50`，使用 `backdrop-blur-md` 实现毛玻璃效果，左侧 padding 为 48px（与 ActivityBar 宽度对齐）

**Core Code**:
```tsx
// Header 内容区域布局 (line 64-196)
return React.createElement(
  'div',
  { className: 'flex flex-col h-screen bg-background text-foreground overflow-hidden' },
  // Header (full width, top)
  React.createElement(
    'header',
    { className: 'sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md' },
    React.createElement(
      'div',
      { className: 'flex items-center justify-between h-16 pl-[48px] pr-6' },
      // Left: brand + settings + reset + proxy toggle
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('img', { src: ClaudeSvg, alt: 'Claude', width: 24, height: 24, loading: 'lazy' }),
        React.createElement('h1', { className: 'text-xl font-semibold text-blue-500 dark:text-blue-400' }, t('app.brandName')),
        // ... settings, reset, proxy toggle
      ),
      // Right: session + language + add button
      React.createElement('div', { className: 'flex items-center gap-1.5' },
        // ... session button, LanguageSwitcher
        activeView === 'providers' && React.createElement(/* add provider button */),
      ),
    ),
  ),
  // Content area (ActivityBar + sidebar + main)
  React.createElement(
    'div',
    { className: 'flex flex-row flex-1 min-h-0' },
    React.createElement(ActivityBar, { activeView, onViewChange }),
    sidebar,
    React.createElement('main', { className: 'flex-1 px-6 py-8 mx-auto w-full max-w-5xl overflow-y-auto' }, children),
  ),
  React.createElement(ConfirmResetDialog, { /* ... */ }),
);
```
Source: `src/client/components/Layout.tsx`:64-220

**Usage Example**:
```tsx
// App.tsx 中 Layout 的实际使用方式 (简化)
React.createElement(
  Layout,
  {
    onAddProvider: handleOpenAddDialog,
    onReset: handleReset,
    showToast,
    enableFurinaProxy,
    onToggleProxy: handleToggleProxy,
    activeView,
    onViewChange: persistActiveView,
    sidebar: activeView === 'projects'
      ? React.createElement(ProjectSidebar, { onChangeClick: handleChangeClick, selectedChange })
      : null,
  },
  activeView === 'providers'
    ? React.createElement(ProviderList, { /* provider list props */ })
    : React.createElement(DetailPanel, { selectedChange }),
);
```
解释: App.tsx 将所有状态管理和 API 交互逻辑集中在顶层，Layout 仅负责布局渲染。`sidebar` 根据 `activeView` 条件注入 ProjectSidebar 或 null，`children` 根据视图类型切换 ProviderList 和 DetailPanel。

---

### `ActivityBar(props: ActivityBarProps) -> React.ReactElement`

**Source**: `src/client/components/ActivityBar.tsx`:21-71

**Functionality**: VSCode 风格的 48px 宽垂直活动栏组件，提供 Providers 和 Projects 两个视图之间的切换功能。活跃的视图按钮有蓝色半透明背景高亮、蓝色阴影和左侧 3px 宽的蓝色边框指示器。未活跃按钮显示为 muted-foreground 颜色，hover 时有浅色背景和微缩放效果。组件内部不持有任何状态，完全受控于父组件传入的 `activeView` 和 `onViewChange`。

**Parameters**:
- `activeView` (`ActivityBarView`): 当前活跃的视图类型，决定哪个图标按钮显示高亮状态。取值为 `'providers'` 或 `'projects'`
- `onViewChange` (`(view: ActivityBarView) => void`): 视图切换回调，用户点击某个图标按钮时调用，传入对应的视图类型

**Return Value**:
- `React.ReactElement`: 垂直图标栏的 JSX 元素

**Core Logic**:
1. **样式定义**: 定义三组样式常量——`iconBtnBase`（基础样式：40x40 圆角矩形，flex 居中，过渡动画）、`iconBtnActive`（激活状态：蓝色半透明背景 + 蓝色文字 + 蓝色阴影）、`iconBtnInactive`（未激活状态：muted 前景色，hover 时有背景、文字色变化和微缩放）
2. **容器**: 宽度 `w-12`（48px），`h-full` 占满父容器高度，右侧边框，顶部 padding，使用 CSS 线性渐变背景（从 `muted/0.5` 到 `muted/0.2`）
3. **Providers 按钮**: 使用 lucide-react 的 `Server` 图标（20px），点击调用 `onViewChange('providers')`，活跃时渲染左侧蓝色边框指示器（3px 宽，`rounded-r-full`，带蓝色阴影）
4. **Projects 按钮**: 使用 lucide-react 的 `FolderKanban` 图标（20px），点击调用 `onViewChange('projects')`，同样有活跃状态的左侧边框指示器
5. **无障碍**: 两个按钮都有 `aria-label`（使用 i18n 翻译）和 `title` 属性

**Core Code**:
```tsx
// ActivityBar 核心实现
export function ActivityBar({ activeView, onViewChange }: ActivityBarProps): React.ReactElement {
  const { t } = useTranslation();

  const iconBtnBase = 'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200';
  const iconBtnActive = 'bg-blue-500/10 text-blue-500 shadow-md shadow-blue-500/20';
  const iconBtnInactive = 'text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:shadow-sm hover:scale-105';

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center w-12 h-full border-r pt-3 gap-1.5',
      style: { background: 'linear-gradient(180deg, hsl(var(--muted)/0.5) 0%, hsl(var(--muted)/0.2) 100%)' } },
    // Server (providers) icon button
    React.createElement('button', {
      onClick: () => onViewChange('providers'),
      className: `${iconBtnBase} ${activeView === 'providers' ? iconBtnActive : iconBtnInactive}`,
    },
      activeView === 'providers' && React.createElement('div', {
        className: 'absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] bg-blue-500 rounded-r-full shadow-md shadow-blue-500/50',
      }),
      React.createElement(Server, { size: 20 }),
    ),
    // FolderKanban (projects) icon button
    React.createElement('button', {
      onClick: () => onViewChange('projects'),
      className: `${iconBtnBase} ${activeView === 'projects' ? iconBtnActive : iconBtnInactive}`,
    },
      activeView === 'projects' && React.createElement('div', {
        className: 'absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] bg-blue-500 rounded-r-full shadow-md shadow-blue-500/50',
      }),
      React.createElement(FolderKanban, { size: 20 }),
    ),
  );
}
```
Source: `src/client/components/ActivityBar.tsx`:21-71

**Usage Example**:
```tsx
// ActivityBar 在 Layout.tsx 中的使用
React.createElement(ActivityBar, { activeView, onViewChange });
```
```tsx
// ActivityBarView 类型在 App.tsx 中的使用
import type { ActivityBarView } from './components/ActivityBar.js';

const [activeView, setActiveView] = useState<ActivityBarView>(() => {
  try {
    const stored = localStorage.getItem('furina:activeView');
    return stored === 'projects' || stored === 'providers' ? stored : 'providers';
  } catch {
    return 'providers';
  }
});
```
解释: ActivityBar 是完全受控组件，不持有自身状态。`activeView` 的状态管理和 localStorage 持久化逻辑位于 App.tsx 层。ActivityBar 通过 `onViewChange` 回调通知 App 切换视图，App 负责更新状态、持久化，并根据新视图切换 sidebar 和 children 内容。

---

### Header 中的代理开关 (Proxy Toggle)

**Source**: `src/client/components/Layout.tsx`:118-148

**Functionality**: Header 中的 Anthropic API 代理开关区域，由 Radio 图标和 toggle switch 两部分组成。Radio 图标作为状态指示器——代理启用时为 emerald-500 绿色并带有脉冲动画，关闭时为 muted-foreground 灰色。Toggle switch 是一个 ARIA `role="switch"` 的按钮，模拟 iOS 风格的滑动开关。整个区域包裹在圆角矩形容器中，带 `title` tooltip 显示当前状态。

**Parameters**:
- `enableFurinaProxy` (`boolean`): 代理启用状态，控制 Radio 图标的颜色/动画和 toggle 的视觉位置
- `onToggleProxy` (`() => void`): toggle 点击回调

**Core Logic**:
1. 外层 `div` 作为容器，使用 `bg-muted/50` 圆角背景
2. Radio 图标的 className 根据 `enableFurinaProxy` 动态切换：启用时 `text-emerald-500 animate-pulse`，关闭时 `text-muted-foreground`
3. Toggle 按钮使用 `role="switch"` 和 `aria-checked` 实现无障碍语义
4. Toggle 轨道颜色：启用时 `bg-emerald-500`，关闭时 `bg-gray-200`
5. 滑块通过 `translate-x-5`（启用）或 `translate-x-0.5`（关闭）实现位置切换
6. 容器 `title` 根据状态显示不同的 i18n 翻译文本

**Core Code**:
```tsx
React.createElement(
  'div',
  {
    title: enableFurinaProxy ? t('layout.proxyRunning') : t('layout.proxyOff'),
    className: 'flex items-center gap-1 px-1.5 h-8 rounded-lg bg-muted/50 transition-all',
  },
  React.createElement(Radio, {
    size: 14,
    className: enableFurinaProxy ? 'text-emerald-500 animate-pulse' : 'text-muted-foreground',
  }),
  React.createElement(
    'button',
    {
      type: 'button',
      role: 'switch',
      'aria-checked': enableFurinaProxy,
      'aria-label': t('layout.toggleProxyAriaLabel'),
      onClick: onToggleProxy,
      className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enableFurinaProxy ? 'bg-emerald-500' : 'bg-gray-200'
      }`,
    },
    React.createElement('span', {
      className: `inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
        enableFurinaProxy ? 'translate-x-5' : 'translate-x-0.5'
      }`,
    }),
  ),
),
```
Source: `src/client/components/Layout.tsx`:118-148

---

### Header 中的重置按钮与 ConfirmResetDialog 联动

**Source**: `src/client/components/Layout.tsx`:44-55, 106-117, 213-219

**Functionality**: Header 左侧的重置按钮（RotateCcw 图标）与 ConfirmResetDialog 弹窗的联动逻辑。点击重置按钮不会直接执行重置，而是弹出确认对话框，用户确认后才触发实际的 `onReset` 回调。这是一种典型的 destructive action 防误触设计模式。

**Core Logic**:
1. `handleResetClick`: 点击重置按钮时，设置 `showConfirmReset = true`
2. `handleResetConfirm`: 用户在弹窗中点击确认，设置 `showConfirmReset = false` 并调用 `onReset()` 回调（由 App.tsx 实现实际的 `POST /furina/api/providers/reset` 调用）
3. `handleResetCancel`: 用户取消，仅设置 `showConfirmReset = false`
4. ConfirmResetDialog 通过 React Portal 渲染到 `document.body`，支持 ESC 键取消和 backdrop 点击关闭

---

### `ActivityBarView` 类型

**Source**: `src/client/components/ActivityBar.tsx`:13

**Functionality**: 视图类型的字符串字面量联合类型，用于约束 ActivityBar 的视图切换取值，确保类型安全。该类型同时被 Layout 和 App 组件引用，是 ActivityBar 与外部组件之间的类型契约。

**Core Code**:
```tsx
export type ActivityBarView = 'providers' | 'projects';
```
Source: `src/client/components/ActivityBar.tsx`:13

**Usage Example**:
```tsx
// 在 App.tsx 中用于状态声明和 localStorage 持久化
const [activeView, setActiveView] = useState<ActivityBarView>(() => {
  try {
    const stored = localStorage.getItem('furina:activeView');
    return stored === 'projects' || stored === 'providers' ? stored : 'providers';
  } catch {
    return 'providers';
  }
});

// 在 Layout.tsx 中作为 Props 类型约束
import type { ActivityBarView } from './ActivityBar.js';

interface LayoutProps {
  activeView: ActivityBarView;
  onViewChange: (view: ActivityBarView) => void;
  // ...
}
```
解释: `ActivityBarView` 类型是 ActivityBar 导出的唯一类型，作为视图切换的类型契约在 Layout 和 App 之间共享。`'providers'` 对应 Server 图标的 Provider 管理视图，`'projects'` 对应 FolderKanban 图标的项目导航视图。

## Data Structures

### `LayoutProps`
```tsx
interface LayoutProps {
  onAddProvider: () => void;
  onReset: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  enableFurinaProxy: boolean;
  onToggleProxy: () => void;
  children: React.ReactNode;
  activeView: ActivityBarView;
  onViewChange: (view: ActivityBarView) => void;
  sidebar: React.ReactNode;
}
```
- `onAddProvider` (`() => void`): 打开添加 Provider 弹窗的回调
- `onReset` (`() => void`): 确认重置后的回调，由 App 实现 API 调用
- `showToast` (`(text: string, type?: 'success' | 'error') => void`): Toast 通知函数，当前 Layout 内未直接使用
- `enableFurinaProxy` (`boolean`): 代理开关状态
- `onToggleProxy` (`() => void`): 切换代理的回调
- `children` (`React.ReactNode`): 主内容区子组件
- `activeView` (`ActivityBarView`): 当前视图类型
- `onViewChange` (`(view: ActivityBarView) => void`): 视图切换回调
- `sidebar` (`React.ReactNode`): 侧边栏插槽

### `ActivityBarProps`
```tsx
interface ActivityBarProps {
  activeView: ActivityBarView;
  onViewChange: (view: ActivityBarView) => void;
}
```
- `activeView` (`ActivityBarView`): 当前活跃视图，决定哪个图标显示高亮
- `onViewChange` (`(view: ActivityBarView) => void`): 图标点击时的视图切换回调

### `ActivityBarView`
```tsx
type ActivityBarView = 'providers' | 'projects';
```
- `'providers'`: Server 图标视图，显示 ProviderList，Header 显示 add-provider 按钮
- `'projects'`: FolderKanban 图标视图，显示 ProjectSidebar + DetailPanel

## Error Handling and Edge Cases

1. **localStorage 不可用**: `App.tsx` 中 `activeView` 的 localStorage 读写都包裹在 try-catch 中，降级为默认值 `'providers'`。Layout 和 ActivityBar 不涉及 localStorage 操作。
2. **占位功能（Placeholder）**: Header 中的 Settings 按钮和 Session 管理按钮均为占位实现——Settings 按钮无 onClick 处理函数，Session 按钮的 `handleSessionClick` 为空函数。这些预留接口确保未来扩展不需要修改布局结构。
3. **条件渲染的 add-provider 按钮**: 仅在 `activeView === 'providers'` 时显示，避免在 Projects 视图下出现无关操作。按钮支持键盘触发（Enter/Space），通过 `onKeyDown` 处理。
4. **sidebar 插槽为空时**: 当 `activeView !== 'projects'` 时 App 传入 `null` 作为 sidebar，Layout 直接渲染 `null`，flex 布局中 main 区域自动扩展占满空间。
5. **ConfirmResetDialog 的 ESC 和 backdrop 关闭**: 弹窗支持 ESC 键和背景点击关闭，使用 `useEffect` 清理事件监听器，弹窗打开时锁定 body 滚动。

## Dependencies

- **Depends on**:
  - `ConfirmResetDialog` (`spec-confirm-reset-dialog.md`): Layout 内部使用的确认弹窗组件
  - `LanguageSwitcher` (`spec-i18n.md`): Header 中的语言切换器组件
  - `ActivityBar`（本 Spec 内部）: Layout 渲染的活动栏子组件
  - `react-i18next`: 所有 UI 文本通过 `useTranslation()` 翻译
  - `lucide-react`: 图标库（Plus, Settings, RotateCcw, Radio, Server, FolderKanban）
  - `claude.svg`（`spec-icons.md`）: Header 品牌区域的 Claude 图标
- **Depended by**:
  - `App.tsx` (`spec-app-root.md`): 根组件渲染 Layout，注入所有 props 和 children
  - `ProjectSidebar` (`spec-project-sidebar.md`): 作为 sidebar 插槽内容由 App 注入 Layout
  - `ProviderList` (`spec-provider-list.md`): 作为 children 由 App 注入 Layout
  - `DetailPanel` (`spec-detail-panel.md`): 作为 children 由 App 注入 Layout

## Usage Examples

### 完整集成示例

以下是 App.tsx 中 Layout 的完整使用模式，展示了从状态管理到渲染的完整集成：

```tsx
// 1. 状态声明 (App.tsx)
const [activeView, setActiveView] = useState<ActivityBarView>(() => {
  try {
    const stored = localStorage.getItem('furina:activeView');
    return stored === 'projects' || stored === 'providers' ? stored : 'providers';
  } catch {
    return 'providers';
  }
});
const [enableFurinaProxy, setEnableFurinaProxy] = useState(false);
const [selectedChange, setSelectedChange] = useState<ChangeEntryWithCwd | null>(null);

// 2. 视图切换持久化 (App.tsx)
const persistActiveView = (view: ActivityBarView) => {
  try {
    localStorage.setItem('furina:activeView', view);
  } catch {
    // silent fallback
  }
  setActiveView(view);
  if (view !== 'projects') {
    setSelectedChange(null); // 切换离开 projects 视图时清除选中
  }
};

// 3. 代理切换 (App.tsx)
const handleToggleProxy = async () => {
  const nextState = !enableFurinaProxy;
  await fetch('/furina/api/providers/proxy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enableFurinaProxy: nextState }),
  });
  setEnableFurinaProxy(nextState);
};

// 4. 重置处理 (App.tsx)
const handleReset = async () => {
  await fetch('/furina/api/providers/reset', { method: 'POST' });
  triggerRefresh();
};

// 5. 渲染 (App.tsx)
React.createElement(
  Layout,
  {
    onAddProvider: () => setIsAddDialogOpen(true),
    onReset: handleReset,
    showToast,
    enableFurinaProxy,
    onToggleProxy: handleToggleProxy,
    activeView,
    onViewChange: persistActiveView,
    sidebar: activeView === 'projects'
      ? React.createElement(ProjectSidebar, { onChangeClick: handleChangeClick, selectedChange })
      : null,
  },
  activeView === 'providers'
    ? React.createElement(ProviderList, { /* ... */ })
    : React.createElement(DetailPanel, { selectedChange, key: selectedChange?.path ?? 'empty' }),
);
```

解释:
1. `activeView` 使用 lazy initializer 从 localStorage 恢复，确保页面刷新后保持用户上次的视图选择
2. `persistActiveView` 在切换视图时同时更新 localStorage 和 React 状态，并在离开 projects 视图时清除选中的 change
3. `handleToggleProxy` 通过 PUT API 切换代理状态，成功后更新本地状态触发 UI 更新
4. `handleReset` 在用户通过 ConfirmResetDialog 确认后执行，调用 POST API 恢复默认配置
5. Layout 的 `sidebar` 和 `children` 都根据 `activeView` 条件注入不同组件，实现视图切换
