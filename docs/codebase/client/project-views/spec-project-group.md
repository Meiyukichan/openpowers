# ProjectGroup Component

> Source files:
> - `src/client/components/ProjectGroup.tsx` : 1-163

## Overview

ProjectGroup 是一个可折叠的分组容器组件，用于将同一 `cwd`（工作目录）路径下的变更条目（changes）进行可视化聚合展示。它在系统中的定位是 `ProjectSidebar` 的 "项目" 选项卡视图中的核心渲染单元——每个 `cwd` 对应一个 ProjectGroup 实例。

**设计动机**：用户可能在多个项目目录下同时有变更在进行中，将变更按项目目录分组能让用户快速定位特定项目的变更集合，而非在扁平列表中逐个查找。可折叠设计允许用户在大量项目中聚焦当前关心的项目，同时 localStorage 持久化折叠状态确保页面刷新后用户的工作视图不被重置。

**使用场景**：
- 当用户在 `ProjectSidebar` 中切换到 "项目" 选项卡时，`ProjectSidebar` 会按 `cwd` 对数据进行分组，然后为每个分组渲染一个 `ProjectGroup`。
- 每个 `ProjectGroup` 展示该分组下所有变更，按更新时间降序排列。

**源文件职责**：
- `ProjectGroup.tsx`：ProjectGroup 组件的完整实现，包含折叠状态管理（localStorage）、排序逻辑、路径解析、以及 React 渲染。

## Architecture / Flow

```
ProjectSidebar ("项目" Tab)
  │
  ├── 按 cwd 分组 Map<string, ChangeEntryWithCwd[]>
  ├── 按最新 updateAt 降序排列各分组
  │
  └── 为每个 [cwd, changes] 渲染 ProjectGroup
        │
        ├── Header (可点击折叠/展开)
        │     ├── FolderGit2 图标
        │     ├── 项目名称 (projectName 提取)
        │     ├── 完整 cwd 路径
        │     ├── active/archived 数量徽章
        │     └── ChevronDown 折叠指示器
        │
        └── Body (展开时)
              └── sortByUpdateAtDesc(changes) → ChangeCard 列表
                    └── showCwd=false (因 cwd 已在 header 展示)
```

**折叠状态持久化流程**：
1. 组件初始化时，从 `localStorage` 读取 `furina:expandedGroups` 键，解析为 JSON 数组并构造 `Set<string>`。
2. 若当前 `cwd` 在该集合中，则初始状态为展开。
3. 用户点击 header 触发 `toggleExpanded`，该函数立即从 localStorage 重新读取最新集合（避免多实例并发写入导致覆盖），添加或删除 `cwd`，写回 localStorage。
4. localStorage 格式：`["D:\\project-code\\llm\\furina", "C:\\Users\\dev\\other-project"]`

## Functionality / Interface Details

### `ProjectGroup` (组件)

**Source**: `src/client/components/ProjectGroup.tsx`:68-162

**Functionality**: 渲染一个可折叠的项目分组卡片。Header 区域显示项目图标、名称、路径和状态统计，点击后展开/折叠 Body 区域。Body 区域在展开时渲染按更新时间排序的 ChangeCard 列表。折叠状态通过 localStorage 持久化，确保跨会话一致性。

**Props** (`ProjectGroupProps`):
- `cwd` (`string`, 必需): 项目工作目录的完整路径，如 `"D:\\project-code\\llm\\furina"`。同时用作折叠状态的 localStorage 键标识符。
- `changes` (`ChangeEntryWithCwd[]`, 必需): 该 cwd 下的所有变更条目数组，由 `ProjectSidebar` 按 cwd 分组后传入。
- `onChangeClick` (`(change: ChangeEntryWithCwd) => void`, 可选): 当用户点击某个 ChangeCard 时触发的回调，用于将选中变更传递给上层组件（如 DetailPanel）。
- `selectedChange` (`ChangeEntryWithCwd | null`, 可选): 当前选中的变更条目，用于向 ChangeCard 传递选中状态以实现视觉高亮。

**Return Value**:
- `React.ReactElement`: 渲染的分组组件 DOM 结构。

**Core Logic**:

1. **折叠状态初始化**：使用 `useState` 的函数初始化形式，在组件挂载时调用 `loadExpandedSet()` 读取 localStorage，判断当前 `cwd` 是否在展开集合中。此初始化仅执行一次。

2. **数据排序**：每次渲染时调用 `sortByUpdateAtDesc(changes)` 对变更数组按 `updateAt` 降序排列（最新的在前面）。返回新数组，不修改原始数据。

3. **状态统计**：通过两次 `filter` 操作分别统计 `status === 'active'` 和 `status === 'archived'` 的数量，用于在 header 显示颜色徽章。

4. **选中判断**：通过 `${change.cwd}::${change.path}` 拼接键值来判断 ChangeCard 是否为当前选中项，避免仅依赖引用相等性。

**Core Code**:
```tsx
export function ProjectGroup({ cwd, changes, onChangeClick, selectedChange }: ProjectGroupProps): React.ReactElement {
  const [expanded, setExpanded] = useState(() => loadExpandedSet().has(cwd));
  const sorted = sortByUpdateAtDesc(changes);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      const set = loadExpandedSet();
      if (next) {
        set.add(cwd);
      } else {
        set.delete(cwd);
      }
      saveExpandedSet(set);
      return next;
    });
  };

  const activeCount = changes.filter((c) => c.status === 'active').length;
  const archivedCount = changes.filter((c) => c.status === 'archived').length;

  return React.createElement(
    'div',
    { className: 'rounded-xl border border-l-[3px] border-l-blue-500/40 bg-card/60 overflow-hidden transition-all duration-200' },
    // Header with toggle click
    React.createElement('div', { onClick: toggleExpanded, ... },
      React.createElement(FolderGit2, { size: 15, className: 'text-blue-500/70 flex-shrink-0' }),
      // project name + cwd path
      // active/archived badges
      // chevron rotation
    ),
    // Body - sorted ChangeCards
    expanded &&
      React.createElement('div', { className: 'px-2.5 pb-2.5 space-y-2' },
        ...sorted.map((change) =>
          React.createElement(ChangeCard, {
            key: `${change.cwd}::${change.path}`,
            change,
            showCwd: false,
            onClick: onChangeClick,
            isSelected: selectedChange
              ? `${selectedChange.cwd}::${selectedChange.path}` === `${change.cwd}::${change.path}`
              : false,
          }),
        ),
      ),
  );
}
```
Source: `src/client/components/ProjectGroup.tsx`:68-162

**Usage Example**:
```tsx
// ProjectSidebar 在渲染 "项目" 视图时调用 ProjectGroup
React.createElement(
  'div',
  { className: 'flex-1 overflow-y-auto p-2 space-y-1.5' },
  ...sortedGroups.map(([cwd, groupChanges]) =>
    React.createElement(ProjectGroup, {
      key: cwd,
      cwd,
      changes: groupChanges,
      onChangeClick,
      selectedChange,
    }),
  ),
);
```
Explanation: `ProjectSidebar` 将按 `cwd` 分组的数据遍历渲染，每个分组对应一个 `ProjectGroup` 实例。`key` 使用 `cwd` 确保列表更新时组件稳定。`onChangeClick` 和 `selectedChange` 由 `ProjectSidebar` 的父组件（`App`）管理并逐层传递。

---

### `loadExpandedSet() -> Set<string>`

**Source**: `src/client/components/ProjectGroup.tsx`:25-34

**Functionality**: 从浏览器 localStorage 中读取所有已展开的项目分组 cwd 集合。该函数是折叠状态持久化的核心读取接口，每次调用都直接从 localStorage 读取最新值（而非缓存），确保多组件实例间的读写一致性。

**Parameters**: 无参数。

**Return Value**:
- `Set<string>`: 已展开分组的 cwd 路径集合。若 localStorage 中无数据、数据格式非法或 JSON 解析失败，返回空集合。

**Core Logic**:
1. 尝试从 localStorage 读取键 `furina:expandedGroups` 的值。
2. 若值为空字符串或 null，返回空 `Set`。
3. 将 JSON 字符串解析为 `string[]`，构造 `Set` 返回。
4. 若 JSON 解析失败（数据损坏等），catch 捕获异常并返回空 `Set`，保证组件不会因脏数据崩溃。

**Core Code**:
```ts
function loadExpandedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}
```
Source: `src/client/components/ProjectGroup.tsx`:25-34

**Usage Example**:
```ts
// 组件初始化时判断当前 cwd 是否展开
const [expanded, setExpanded] = useState(() => loadExpandedSet().has(cwd));
```
Explanation: 通过函数形式传给 `useState`，确保只在组件挂载时执行一次 localStorage 读取。后续读取发生在 `toggleExpanded` 中。

---

### `saveExpandedSet(cwds: Set<string>) -> void`

**Source**: `src/client/components/ProjectGroup.tsx`:37-39

**Functionality**: 将已展开的项目分组 cwd 集合持久化到浏览器 localStorage。与 `loadExpandedSet` 配对使用，构成折叠状态的读写闭环。

**Parameters**:
- `cwds` (`Set<string>`): 当前所有展开分组的 cwd 路径集合。

**Return Value**: `void`。

**Core Logic**:
将 `Set` 展开为数组（`[...cwds]`），序列化为 JSON 字符串后写入 localStorage 键 `furina:expandedGroups`。使用展开运算符而非 `Array.from` 是该代码库的惯用写法。

**Core Code**:
```ts
function saveExpandedSet(cwds: Set<string>): void {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...cwds]));
}
```
Source: `src/client/components/ProjectGroup.tsx`:37-39

**Usage Example**:
```ts
// toggleExpanded 中写入更新后的集合
const set = loadExpandedSet();
set.add(cwd);  // 或 set.delete(cwd)
saveExpandedSet(set);
```
Explanation: 在 `toggleExpanded` 回调中，先重新读取最新集合（`loadExpandedSet`），修改后立即写回，确保不会因并发操作丢失其他实例的展开状态。

---

### `sortByUpdateAtDesc(changes: ChangeEntryWithCwd[]) -> ChangeEntryWithCwd[]`

**Source**: `src/client/components/ProjectGroup.tsx`:45-52

**Functionality**: 将变更条目按更新时间降序排列（最新更新的排在最前面），同时将没有 `updateAt` 字段的条目排到最后。此排序逻辑确保用户在项目分组内首先看到最近活跃的变更。

**Parameters**:
- `changes` (`ChangeEntryWithCwd[]`): 待排序的变更条目数组。不会被修改（内部使用展开运算符创建副本）。

**Return Value**:
- `ChangeEntryWithCwd[]`: 排序后的新数组。原始数组不受影响。

**Core Logic**:
1. 使用 `[...changes]` 创建浅拷贝，避免就地修改。
2. `updateAt` 字段是可选的（`z.string().optional()`）。排序比较器处理三种情况：
   - 两者均无 `updateAt`：保持原顺序（返回 0）。
   - 仅 `a` 无 `updateAt`：`a` 排后（返回 1）。
   - 仅 `b` 无 `updateAt`：`b` 排后（返回 -1）。
   - 两者都有：按 `new Date(updateAt).getTime()` 数值降序比较。

**Core Code**:
```ts
function sortByUpdateAtDesc(changes: ChangeEntryWithCwd[]): ChangeEntryWithCwd[] {
  return [...changes].sort((a, b) => {
    if (!a.updateAt && !b.updateAt) return 0;
    if (!a.updateAt) return 1;
    if (!b.updateAt) return -1;
    return new Date(b.updateAt).getTime() - new Date(a.updateAt).getTime();
  });
}
```
Source: `src/client/components/ProjectGroup.tsx`:45-52

**Usage Example**:
```ts
const sorted = sortByUpdateAtDesc(changes);
// sorted[0] 是最近更新的变更
// 没有 updateAt 的变更排在最后
```
Explanation: 在组件渲染体中调用，每次渲染都会重新排序。由于数据量通常较小（单个项目的变更数），未做 `useMemo` 优化。

---

### `projectName(cwd: string) -> string`

**Source**: `src/client/components/ProjectGroup.tsx`:58-61

**Functionality**: 从完整的 cwd 路径中提取项目名称（最后一段路径），用于在 header 中简洁显示项目标识。兼容 Windows（`\`）和 Unix（`/`）路径分隔符。

**Parameters**:
- `cwd` (`string`): 完整工作目录路径，如 `"D:\\project-code\\llm\\furina"` 或 `"/home/dev/myproject"`。

**Return Value**:
- `string`: 最后一段路径。若路径为空或仅含分隔符导致提取结果为空字符串，则返回原始 `cwd` 作为兜底。

**Core Logic**:
1. 使用正则 `/[\\/]/` 同时按反斜杠和正斜杠分割路径。
2. 取数组最后一段作为项目名。
3. 若最后一段为空（如路径以分隔符结尾），返回原始 `cwd`。

**Core Code**:
```ts
function projectName(cwd: string): string {
  const parts = cwd.split(/[\\/]/);
  return parts[parts.length - 1] || cwd;
}
```
Source: `src/client/components/ProjectGroup.tsx`:58-61

**Usage Example**:
```ts
projectName("D:\\project-code\\llm\\furina");  // => "furina"
projectName("/home/dev/my-app/");                    // => "/home/dev/my-app/"
projectName("C:\\workspace\\");                      // => "C:\\workspace\\"
```
Explanation: 用于 header 主标题的 `textContent` 和 `title` 属性。长项目名会被 CSS `truncate` 截断，`title` 属性提供鼠标悬停时的完整文本提示。

## Data Structures

### `ProjectGroupProps`
```ts
export interface ProjectGroupProps {
  cwd: string;
  changes: ChangeEntryWithCwd[];
  onChangeClick?: (change: ChangeEntryWithCwd) => void;
  selectedChange?: ChangeEntryWithCwd | null;
}
```
- `cwd` (`string`): 项目工作目录完整路径，同时用作分组标识和 localStorage 键。
- `changes` (`ChangeEntryWithCwd[]`): 该 cwd 下的全部变更条目，由 ProjectSidebar 分组传入。
- `onChangeClick` (`(change: ChangeEntryWithCwd) => void`, 可选): ChangeCard 点击回调，将选中的变更传递给上层。
- `selectedChange` (`ChangeEntryWithCwd | null`, 可选): 当前选中的变更，用于子组件的选中状态视觉反馈。

### `ChangeEntryWithCwd`
```ts
export type ChangeEntryWithCwd = ChangeEntry & { cwd: string };
```
- 继承 `ChangeEntry` 的所有字段（`name`, `path`, `description`, `createdAt`, `updateAt`, `status`, `features`, `todo`, `artifacts`, `stage`）。
- 额外的 `cwd` 字段标注该变更所属的项目工作目录。

### `ChangeEntry` (关键字段)
```ts
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
- `name` (`string`): 变更名称，ChangeCard 中作为主标题显示。
- `path` (`string`): 变更路径，与 `cwd` 组合为 ChangeCard 的唯一标识键。
- `status` (`'active' | 'archived' | 'removed'`): 变更状态，决定 header 徽章颜色和 Count。
- `updateAt` (`string`, 可选): 最后更新时间，用于组内排序依据。
- `description` (`string`): 变更描述，ChangeCard 中作为副标题显示。

### 常量
```ts
const EXPANDED_KEY = 'furina:expandedGroups';
```
- localStorage 键名，存储展开分组的 cwd 路径 JSON 数组。

## Error Handling and Edge Cases

1. **localStorage 数据损坏**：`loadExpandedSet` 使用 try-catch 包裹 JSON 解析，若数据格式非法则静默返回空集合，不会导致组件崩溃或用户可见错误。

2. **localStorage 不可用**：在隐私模式或 localStorage 被禁用的环境下，`getItem` 返回 null，`setItem` 可能抛出异常。当前实现未对 `saveExpandedSet` 做 try-catch 保护，这种情况下保存操作会静默失败（浏览器通常不会抛出，而是忽略写入）。

3. **空变更数组**：当 `changes` 为空数组时，`sortByUpdateAtDesc` 返回空数组，`activeCount` 和 `archivedCount` 均为 0，两个徽章都不会渲染（`> 0` 条件守卫），Body 为空但 Header 仍然显示。

4. **updateAt 缺失**：`sortByUpdateAtDesc` 专门处理了 `updateAt` 可选的情况，缺失的条目被排到末尾。

5. **路径分隔符差异**：`projectName` 使用 `/[\\/]/` 正则同时兼容 Windows 反斜杠和 Unix 正斜杠。

6. **选择状态判定**：使用 `${cwd}::${path}` 字符串拼接作为唯一键来判断选中状态，避免了引用比较在数据重新请求后失效的问题。

## Dependencies

- **Depends on**:
  - `ChangeCard` 组件（`src/client/components/ChangeCard.tsx`）：Body 区域的子组件，渲染单个变更条目。ProjectGroup 将 `showCwd` 设为 `false`（因 cwd 已在 header 展示），并传递 `onClick` 和 `isSelected`。
  - `ChangeEntryWithCwd` 类型（`src/server/changes/shared.ts` → `src/utils/memory.ts`）：变更条目的数据结构定义。
  - `lucide-react` 图标库：`FolderGit2`（项目文件夹图标）、`ChevronDown`（折叠箭头图标）。
  - React：`useState`、`createElement`。

- **Depended by**:
  - `ProjectSidebar`（`src/client/components/ProjectSidebar.tsx`）：在 "项目" 选项卡视图中，按 cwd 分组后为每个分组渲染一个 `ProjectGroup` 实例，传入 `cwd`、`changes`、`onChangeClick`、`selectedChange` 四个属性。

## Usage Examples

### 基本使用（由 ProjectSidebar 调用）

```tsx
// ProjectSidebar 中的渲染逻辑
import { ProjectGroup } from './ProjectGroup.js';

// 1. 数据已经过按 cwd 分组和组间排序（由 ProjectSidebar 的 sortedGroups 提供）
const sortedGroups: [string, ChangeEntryWithCwd[]][] = [
  ["D:\\project-code\\llm\\furina", [change1, change2, change3]],
  ["C:\\workspace\\other-project", [change4]],
];

// 2. 遍历分组，为每个 cwd 渲染一个 ProjectGroup
React.createElement(
  'div',
  { className: 'flex-1 overflow-y-auto p-2 space-y-1.5' },
  ...sortedGroups.map(([cwd, groupChanges]) =>
    React.createElement(ProjectGroup, {
      key: cwd,               // 使用 cwd 作为 React key
      cwd,                     // 项目目录路径
      changes: groupChanges,   // 该目录下的所有变更
      onChangeClick,            // 点击变更卡片的回调
      selectedChange,           // 当前选中的变更（可为 null）
    }),
  ),
);
```

Explanation:
1. `ProjectSidebar` 先将所有变更按 `cwd` 分组，再按每组最新 `updateAt` 降序排列各组（组间排序）。
2. 每个分组对应一个 `ProjectGroup` 实例。
3. `ProjectGroup` 内部再对组内变更按 `updateAt` 降序排列（组内排序）。
4. 用户点击 header 时，折叠状态立即写入 localStorage，影响所有 ProjectGroup 实例的初始化。
5. 用户点击 ChangeCard 时，`onChangeClick` 将变更数据冒泡到 `App` 组件，`App` 更新 `selectedChange` 后重新渲染，`ProjectGroup` 接收到新的 `selectedChange` 并传递给子 ChangeCard 实现选中高亮。

### localStorage 持久化行为

```ts
// 场景：用户展开项目 A 和项目 B
// localStorage: '["D:\\projectA","D:\\projectB"]'

// 场景：用户刷新页面
// loadExpandedSet().has("D:\\projectA") === true  → 项目 A 展开
// loadExpandedSet().has("D:\\projectC") === false → 项目 C 折叠

// 场景：用户折叠项目 A
// toggleExpanded 重新读取 → 删除 "D:\\projectA" → 写回
// localStorage: '["D:\\projectB"]'
```

Explanation: 折叠状态的读写设计采用"每次从 localStorage 重新读取"而非"组件内存缓存"的策略。这是因为同一页面可能同时存在多个 `ProjectGroup` 实例，如果各实例维护各自的内存缓存，后写入的实例会覆盖先写入的实例的变更。通过 `loadExpandedSet → 修改 → saveExpandedSet` 的原子式读写链路，确保多实例间的写入安全。
