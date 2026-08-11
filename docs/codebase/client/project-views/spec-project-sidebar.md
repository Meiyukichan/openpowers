# ProjectSidebar Component

> Source files:
> - `src/client/components/ProjectSidebar.tsx` : 1-407

## Overview

ProjectSidebar 是应用左侧的容器组件（固定宽度 360px），负责展示和管理所有 Change 项目条目。它提供双 Tab 界面：**Active**（活跃变更）和 **Projects**（按项目分组的所有变更），允许用户浏览、搜索和选择不同的变更条目。

**设计动机**：用户需要一个统一的侧边栏来查看跨项目的变更状态。Active 标签页快速展示正在进行的变更，Projects 标签页则按 cwd（工作目录）分组展示所有项目，便于用户定位特定项目下的变更。

**使用场景**：
- 当 `App` 组件的 `activeView` 为 `'projects'` 时，ProjectSidebar 被渲染在左侧布局中
- 用户切换标签页浏览不同视图的变更数据
- 用户在搜索框输入关键词进行模糊搜索
- 用户点击变更卡片触发回调，将选中的变更传递给 DetailPanel 展示详情

**源文件职责**：
- `src/client/components/ProjectSidebar.tsx`：包含主组件 `ProjectSidebar` 以及辅助组件 `LoadingSkeleton`、`EmptyState`、`ErrorState`，和工具函数 `getApiUrl`、`changeKey`

## Architecture / Flow

### 数据获取流程

```
用户操作（Tab切换 / 搜索输入）
       |
       v
useEffect 监听 [activeTab, searchTerm]
       |
       v
检查缓存是否新鲜（cache.fetched && cache.query === searchTerm）
       |
   +---+---+
   |       |
 缓存新鲜  缓存过期
   |       |
   v       v
delay=0   delay=300ms（防抖）
   |       |
   +---+---+
       |
       v
fetch(getApiUrl(params)) → /furina/api/changes/all?status=active&query=xxx
       |
       v
解析 JSON → 过滤 removed（仅 Projects 标签页）→ 更新缓存
```

### 标签页状态管理

每个标签页维护独立的状态：
- **搜索词**：`activeSearch` / `projectsSearch`
- **数据缓存**：`activeCache` / `projectsCache`（类型为 `TabCache`）
- **当前活跃标签页**：`activeTab`（通过 `localStorage` 持久化）

切换标签页时，当前搜索词和缓存数据由 `activeTab` 派生选择对应的状态变量。

### 缓存策略

`TabCache` 包含三个字段：
- `data`：已获取的变更数据数组
- `query`：获取数据时使用的搜索词
- `fetched`：是否已完成过至少一次请求

当 `currentCache.fetched === true && currentCache.query === searchTerm` 时，视为缓存新鲜，跳过 loading 指示器直接展示数据，延迟设为 0ms 但仍会触发一次请求（确保数据最新）。

## Functionality / Interface Details

### `getApiUrl(params: Record<string, string>) -> string`

**Source**: `src/client/components/ProjectSidebar.tsx`:27-36

**Functionality**: 构建变更查询 API 的完整 URL。将参数对象转换为 URL 查询字符串，拼接到 `/furina/api/changes/all` 路径上。空字符串和 undefined 的参数值会被自动过滤，不会出现在最终 URL 中。

**Parameters**:
- `params` (`Record<string, string>`): 查询参数键值对，支持 `status`（如 `'active'`）、`query`（搜索词）等字段

**Return Value**:
- `string`: 完整的 API 路径，如 `/furina/api/changes/all?status=active&query=xxx`；无有效参数时返回 `/furina/api/changes/all`

**Core Logic**:
遍历 `params` 对象，使用 `URLSearchParams` 逐个添加非空键值对。通过 `searchParams.toString()` 生成查询字符串，仅在非空时追加 `?` 前缀。

**Core Code**:
```typescript
function getApiUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined) {
      searchParams.set(key, value);
    }
  }
  const qs = searchParams.toString();
  return `/furina/api/changes/all${qs ? `?${qs}` : ''}`;
}
```
Source: `src/client/components/ProjectSidebar.tsx`:27-36

**Usage Example**:
```typescript
// Active 标签页带搜索词
const url = getApiUrl({ status: 'active', query: 'fix bug' });
// => "/furina/api/changes/all?status=active&query=fix+bug"

// Projects 标签页无搜索词
const url = getApiUrl({});
// => "/furina/api/changes/all"
```

---

### `ProjectSidebar(props: ProjectSidebarProps) -> React.ReactElement`

**Source**: `src/client/components/ProjectSidebar.tsx`:117-406

**Functionality**: 主容器组件，管理双标签页切换、搜索、数据获取、缓存、错误处理和内容渲染。这是整个侧边栏的核心入口，协调所有子组件和状态逻辑。

**Parameters**:
- `props.onChangeClick` (`(change: ChangeEntryWithCwd) => void`, 可选): 用户点击变更卡片时的回调，将被传递给 `ChangeCard` 和 `ProjectGroup`
- `props.selectedChange` (`ChangeEntryWithCwd | null`, 可选): 当前选中的变更条目，用于高亮对应的卡片

**Return Value**:
- `React.ReactElement`: 包含标题栏、标签页切换按钮、搜索框和内容区域的完整侧边栏 UI

**Core Logic**:

1. **初始化标签页**：从 `localStorage`（key: `furina:sidebarTab`）读取上次保存的标签页，仅接受 `'projects'`，其余均默认为 `'active'`

2. **数据获取 useEffect**：监听 `[activeTab, searchTerm, currentCache.fetched, currentCache.query, setCurrentCache]`，通过防抖机制发起 fetch 请求。Active 标签页附加 `status=active` 参数；Projects 标签页不传 status 但在客户端过滤 `status !== 'removed'` 的条目。请求中使用 `cancelled` 标志防止组件卸载后的状态更新。

3. **标签页持久化 useEffect**：当 `activeTab` 变化时，将其写入 `localStorage`，包含 try-catch 处理存储不可用的情况。

4. **防抖卸载清理 useEffect**：在组件卸载时清除 `debounceRef` 中残留的定时器。

5. **handleRetry**：将当前标签页缓存的 `fetched` 标记设为 `false`，触发 useEffect 重新获取数据。

6. **sortedGroups**（useMemo）：仅在 Projects 标签页有数据时计算。将 `currentCache.data` 按 `cwd` 字段分组到 Map 中，然后按每个分组内最新的 `updateAt` 时间戳降序排序。

7. **renderContent**：根据 loading/error/empty/data 四种状态渲染对应的 UI 子树。Active 标签页渲染 `ChangeCard` 列表，Projects 标签页渲染 `ProjectGroup` 列表。

**Core Code**（数据获取 useEffect 核心逻辑）:
```typescript
useEffect(() => {
  let cancelled = false;
  const params: Record<string, string> = {};
  if (activeTab === 'active') {
    params.status = 'active';
  }
  if (searchTerm !== '') {
    params.query = searchTerm;
  }
  const isProjectTab = activeTab === 'projects';
  const isCacheFresh = currentCache.fetched && currentCache.query === searchTerm;

  if (debounceRef.current) {
    clearTimeout(debounceRef.current);
  }
  if (!isCacheFresh) {
    setLoading(true);
  }
  setErrorKey(null);

  debounceRef.current = setTimeout(async () => {
    try {
      const response = await fetch(getApiUrl(params));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json() as { ok: boolean; data: ChangeEntryWithCwd[] };
      let data = json.data;
      if (isProjectTab) {
        data = data.filter((c) => c.status !== 'removed');
      }
      if (!cancelled) {
        setCurrentCache(() => ({ data, query: searchTerm, fetched: true }));
        setLoading(false);
      }
    } catch {
      if (!cancelled) {
        setErrorKey('projectSidebar.failedToLoad');
        setLoading(false);
      }
    }
  }, isCacheFresh ? 0 : 300);

  return () => {
    cancelled = true;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  };
}, [activeTab, searchTerm, currentCache.fetched, currentCache.query, setCurrentCache]);
```
Source: `src/client/components/ProjectSidebar.tsx`:156-210

**Usage Example**:
```tsx
// 在 App.tsx 中使用
import { ProjectSidebar } from './components/ProjectSidebar.js';

// 当 activeView === 'projects' 时渲染侧边栏
React.createElement(ProjectSidebar, {
  onChangeClick: handleChangeClick,   // 点击卡片时更新选中状态
  selectedChange,                     // 当前选中的变更条目
})
```
Explanation: App 组件根据 `activeView` 状态条件渲染 ProjectSidebar，传入 `onChangeClick` 回调用于处理卡片点击事件（通常会更新 `selectedChange` 状态，进而触发 DetailPanel 展示详情），以及 `selectedChange` 用于高亮当前选中的卡片。

---

### `changeKey(change: ChangeEntryWithCwd) -> string`

**Source**: `src/client/components/ProjectSidebar.tsx`:101-103

**Functionality**: 为变更条目生成唯一标识键，格式为 `cwd::path`。用作 React 列表渲染的 key 属性，以及判断两个变更条目是否为同一变更的比较依据。

**Parameters**:
- `change` (`ChangeEntryWithCwd`): 变更条目对象，需包含 `cwd` 和 `path` 字段

**Return Value**:
- `string`: 格式为 `${change.cwd}::${change.path}` 的唯一键字符串

**Core Code**:
```typescript
function changeKey(change: ChangeEntryWithCwd): string {
  return `${change.cwd}::${change.path}`;
}
```
Source: `src/client/components/ProjectSidebar.tsx`:101-103

**Usage Example**:
```typescript
const change = { cwd: 'D:\\project-code\\llm\\furina', path: 'changes/my-feature', ... };
const key = changeKey(change);
// => "D:\\project-code\\llm\\furina::changes/my-feature"

// 用于 React key 和 selectedChange 比较
React.createElement(ChangeCard, {
  key: changeKey(change),
  isSelected: selectedChange ? changeKey(selectedChange) === changeKey(change) : false,
})
```

---

### `LoadingSkeleton() -> React.ReactElement`

**Source**: `src/client/components/ProjectSidebar.tsx`:41-52

**Functionality**: 渲染加载占位骨架屏，展示 3 个带动画脉冲效果的卡片占位块。在数据首次加载时显示，避免空白闪烁。

**Return Value**:
- `React.ReactElement`: 包含 3 个动画占位 div 的容器

**Core Code**:
```typescript
function LoadingSkeleton(): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'space-y-1.5 p-2' },
    ...[0, 1, 2].map((index) =>
      React.createElement('div', {
        key: index,
        className: 'animate-pulse rounded-xl border bg-muted/40 p-4 h-20',
      }),
    ),
  );
}
```
Source: `src/client/components/ProjectSidebar.tsx`:41-52

---

### `EmptyState({ message: string }) -> React.ReactElement`

**Source**: `src/client/components/ProjectSidebar.tsx`:57-72

**Functionality**: 渲染空状态界面，展示居中的闪电图标和提示消息文本。当数据加载完成但结果为空时显示。

**Parameters**:
- `message` (`string`): 显示的空状态提示文本，由调用方根据标签页类型传入不同的 i18n key（Active 标签页为 `'projectSidebar.emptyActive'`，Projects 标签页为 `'projectSidebar.emptyProject'`）

**Return Value**:
- `React.ReactElement`: 包含图标和消息文本的居中布局

---

### `ErrorState({ message: string; onRetry: () => void }) -> React.ReactElement`

**Source**: `src/client/components/ProjectSidebar.tsx`:77-98

**Functionality**: 渲染错误状态界面，展示错误消息和重试按钮。当数据请求失败时显示。重试按钮调用 `onRetry` 回调使缓存失效并重新发起请求。

**Parameters**:
- `message` (`string`): 错误提示文本（i18n key: `'projectSidebar.failedToLoad'`）
- `onRetry` (`() => void`): 点击重试按钮的回调函数

**Return Value**:
- `React.ReactElement`: 包含错误消息和重试按钮的居中布局

**Core Code**:
```typescript
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }): React.ReactElement {
  const { t } = useTranslation();
  return React.createElement(
    'div',
    { className: 'flex flex-col items-center justify-center flex-1 p-6 text-center' },
    React.createElement('p', { className: 'text-sm text-destructive font-medium mb-3' }, message),
    React.createElement(
      'button',
      { type: 'button', onClick: onRetry, className: '...' },
      t('projectSidebar.retry'),
    ),
  );
}
```
Source: `src/client/components/ProjectSidebar.tsx`:77-98

---

### `sortedGroups` (useMemo)

**Source**: `src/client/components/ProjectSidebar.tsx`:255-272

**Functionality**: 将 Projects 标签页的变更数据按 `cwd` 分组并按最新更新时间降序排序。仅在 Projects 标签页且缓存中有数据时计算。这是 ProjectGroup 列表渲染的数据基础。

**Core Logic**:
1. 使用 `Map<string, ChangeEntryWithCwd[]>` 按 `cwd` 字段对变更条目进行分组
2. 将 Map 转换为数组，对每个分组计算内部所有变更条目的 `updateAt` 最大时间戳
3. 按该最大时间戳降序排序，确保最近有更新的项目排在前面

**Core Code**:
```typescript
const sortedGroups = useMemo(() => {
  if (activeTab !== 'projects' || currentCache.data.length === 0) return [];
  const groups: Map<string, ChangeEntryWithCwd[]> = new Map();
  for (const change of currentCache.data) {
    const existing = groups.get(change.cwd);
    if (existing) {
      existing.push(change);
    } else {
      groups.set(change.cwd, [change]);
    }
  }
  return Array.from(groups.entries()).sort(([, a], [, b]) => {
    const aLatest = Math.max(...a.map((c) => (c.updateAt ? new Date(c.updateAt).getTime() : 0)));
    const bLatest = Math.max(...b.map((c) => (c.updateAt ? new Date(c.updateAt).getTime() : 0)));
    return bLatest - aLatest;
  });
}, [currentCache.data, activeTab]);
```
Source: `src/client/components/ProjectSidebar.tsx`:255-272

**Usage Example**:
```typescript
// sortedGroups 的输出结构
// [
//   ["D:\\project-code\\llm\\furina", [change1, change2, ...]],
//   ["D:\\project-code\\llm\\another", [change3, ...]],
// ]

// 用于渲染 ProjectGroup 列表
sortedGroups.map(([cwd, groupChanges]) =>
  React.createElement(ProjectGroup, { key: cwd, cwd, changes: groupChanges, ... })
)
```

## Data Structures

### `SidebarTab`
```typescript
type SidebarTab = 'active' | 'projects';
```
- `'active'`: 展示活跃变更的标签页
- `'projects'`: 展示按项目分组的所有变更的标签页

### `TabCache`
```typescript
interface TabCache {
  data: ChangeEntryWithCwd[];
  query: string;
  fetched: boolean;
}
```
- `data` (`ChangeEntryWithCwd[]`): 缓存的变更数据数组
- `query` (`string`): 获取此数据时使用的搜索关键词，用于判断缓存是否与当前搜索词匹配
- `fetched` (`boolean`): 标记是否已完成过至少一次数据请求，初始为 `false`

### `ProjectSidebarProps`
```typescript
export interface ProjectSidebarProps {
  onChangeClick?: (change: ChangeEntryWithCwd) => void;
  selectedChange?: ChangeEntryWithCwd | null;
}
```
- `onChangeClick` (`(change: ChangeEntryWithCwd) => void`, 可选): 变更卡片点击回调
- `selectedChange` (`ChangeEntryWithCwd | null`, 可选): 当前选中的变更条目

### `ChangeEntryWithCwd`（来自 `src/server/changes/shared.ts`）
```typescript
type ChangeEntryWithCwd = ChangeEntry & { cwd: string };
```
- 继承 `ChangeEntry` 的所有字段（`name`, `path`, `description`, `createdAt`, `updateAt`, `status`, `features`, `todo`, `artifacts`, `stage`）
- `cwd` (`string`): 变更条目所属项目的工作目录路径

### `ChangeEntry`（来自 `src/utils/memory.ts`）
```typescript
// Zod Schema 推断类型
interface ChangeEntry {
  name: string;
  path: string;
  description: string;
  createdAt: string;
  updateAt?: string;
  status: 'active' | 'archived' | 'removed';
  features: number;
  todo: number;
  artifacts: Array<{ id: string; outputPath: string }>;
  stage?: ChangeStage;
}
```
- `name` (`string`): 变更名称
- `path` (`string`): 变更在内存中的路径标识
- `description` (`string`): 变更描述
- `createdAt` (`string`): 创建时间
- `updateAt` (`string`, 可选): 最后更新时间
- `status` (`'active' | 'archived' | 'removed'`): 变更状态
- `features` (`number`): 特性数量
- `todo` (`number`): 待办数量
- `artifacts` (`Array<{ id: string; outputPath: string }>`): 产出物列表
- `stage` (`ChangeStage`, 可选): 变更的流程阶段数据

## Error Handling and Edge Cases

### 网络请求错误
- fetch 请求失败或 HTTP 状态码非 2xx 时，捕获异常并设置 `errorKey` 为 `'projectSidebar.failedToLoad'`
- `ErrorState` 组件展示错误消息和重试按钮
- 重试通过将缓存的 `fetched` 设为 `false` 触发 useEffect 重新请求

### 组件卸载竞争条件
- 使用 `cancelled` 标志变量防止异步请求完成时组件已卸载的状态更新
- `debounceRef` 的清理函数确保卸载时清除残留的定时器

### localStorage 不可用
- 标签页持久化写入 `localStorage` 时包裹 try-catch，静默处理存储满或不可用的情况
- 初始化时读取 `localStorage` 仅接受 `'projects'` 值，其他值（包括 null）均回退为 `'active'`

### 防抖机制
- 300ms 防抖延迟防止用户快速输入时频繁发起请求
- 缓存命中时延迟设为 0ms（立即执行），但仍通过 setTimeout 异步化避免阻塞渲染
- 每次新的 useEffect 触发时清除之前的定时器，确保只有最新的请求生效

### 缓存新鲜度判断
- `isCacheFresh = currentCache.fetched && currentCache.query === searchTerm` 仅在已获取且搜索词相同时跳过 loading 指示器
- 注意：即使缓存新鲜，仍会发起请求确保数据最新，只是用户不会看到 loading 闪烁

### Projects 标签页过滤
- 后端返回的数据包含所有状态的变更条目
- Projects 标签页在客户端额外过滤 `status !== 'removed'`，确保用户不会看到已删除的变更

## Dependencies

### Depends on
- **`src/server/changes/shared.ts`**: 提供 `ChangeEntryWithCwd` 类型定义
- **`src/utils/memory.ts`**: 提供 `ChangeEntry` 类型定义（通过 `shared.ts` 间接依赖）
- **`src/client/components/ChangeCard.tsx`**: Active 标签页渲染单个变更卡片
- **`src/client/components/ProjectGroup.tsx`**: Projects 标签页渲染按 cwd 分组的变更组
- **`react-i18next`**: 国际化翻译支持（标题、标签页、搜索占位符、空状态提示、重试按钮文案）
- **`lucide-react`**: 图标组件（`FolderKanban`、`Zap`、`Sparkles`）
- **`/furina/api/changes/all`** 后端 API：提供变更数据查询接口

### Depended by
- **`src/client/App.tsx`**: 当 `activeView === 'projects'` 时渲染 ProjectSidebar，传入 `onChangeClick` 和 `selectedChange` 属性

## Usage Examples

### 在 App 组件中集成

```tsx
// src/client/App.tsx 中的使用方式
import { ProjectSidebar } from './components/ProjectSidebar.js';

// 当用户切换到 projects 视图时，侧边栏作为布局的左侧部分渲染
React.createElement(
  AppLayout,
  {
    sidebar:
      activeView === 'projects'
        ? React.createElement(ProjectSidebar, {
            onChangeClick: handleChangeClick,  // 点击卡片时更新 selectedChange
            selectedChange,                     // 传递当前选中的变更
          })
        : null,
  },
  // 右侧内容区根据 selectedChange 展示详情
  React.createElement(DetailPanel, { selectedChange }),
)
```

Explanation: App 组件根据 `activeView` 状态条件渲染 ProjectSidebar。`handleChangeClick` 回调接收用户点击的变更条目并更新 `selectedChange` 状态，该状态同时传递给 ProjectSidebar（用于高亮卡片）和 DetailPanel（用于展示详情）。

### 标签页切换与搜索的完整交互流程

```
1. 组件挂载 → 从 localStorage 读取上次标签页（默认 'active'）
2. 首次请求 → loading=true，显示骨架屏 → 数据返回 → loading=false，显示 ChangeCard 列表
3. 用户输入搜索词 → 300ms 防抖 → 发起带 query 参数的请求 → 更新列表
4. 用户切换到 Projects 标签页 → 检查缓存：
   - 若缓存命中 → 立即显示数据，同时后台刷新
   - 若缓存未命中 → 显示骨架屏 → 请求返回后显示 ProjectGroup 列表
5. 请求失败 → 显示错误状态 → 用户点击重试 → 缓存失效 → 重新请求
6. 标签页状态写入 localStorage，下次加载时自动恢复
```
