# ProviderList Component

> Source files:
> - `src/client/components/ProviderList.tsx` : 1-205

## Overview

`ProviderList` 是供应商管理子系统的核心列表组件，负责从后端 API 获取供应商列表数据并将其渲染为卡片列表。它在应用的主内容区域（由 `App` 根组件在 `activeView === 'providers'` 时渲染）中占据中心位置，是用户进入供应商管理界面后的第一个视觉入口。

**设计动机**：将数据获取、三种渲染状态（加载中、错误、空列表）与卡片映射逻辑封装在单一组件中，保持 `App` 根组件的简洁性。父组件只需传入回调和状态标识，无需关心内部的数据获取流程。

**使用场景**：当用户切换到 "Providers" 视图时，`App` 组件渲染 `ProviderList`；当用户完成新增、编辑、删除或切换供应商后，`App` 递增 `refreshTrigger` 触发 `ProviderList` 重新拉取数据。

**涉及源文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/client/components/ProviderList.tsx` | 主组件：数据获取、状态管理、条件渲染（骨架屏/错误/空状态/卡片列表）；包含内部子组件 `LoadingSkeleton`、`EmptyState`；以及辅助函数 `getApiUrl` |

## Architecture / Flow

`ProviderList` 的数据流和渲染决策如下：

```
组件挂载 / refreshTrigger 变更
        │
        ▼
   fetchProviders()
   GET /furina/api/providers
        │
        ├─ loading=true ──► 渲染 LoadingSkeleton（3 个脉冲占位卡片）
        │
        ├─ 请求成功 ──► setProviders(data)
        │                    │
        │                    ├─ providers.length === 0 ──► 渲染 EmptyState（带"添加第一个供应商"按钮）
        │                    │
        │                    └─ providers.length > 0 ──► 渲染 ProviderCard 列表
        │
        └─ 请求失败 ──► setErrorKey('providerList.failedToLoad')
                             │
                             └─ 渲染错误状态（错误信息 + 重试按钮）
```

关键设计要点：
- `fetchProviders` 使用 `useCallback` 包裹，依赖数组为空，保证引用稳定性；仅在 `refreshTrigger` 变化时由 `useEffect` 触发执行。
- 错误状态使用 i18n key 而非硬编码文本，支持多语言。
- 三个状态的渲染优先级：`loading` > `error` > `empty` > `list`。

## Functionality / Interface Details

### `ProviderList(props: ProviderListProps) -> React.ReactElement`

**Source**: `src/client/components/ProviderList.tsx`:132-204

**Functionality**: `ProviderList` 是一个 React 函数组件，作为供应商列表的数据获取和渲染容器。它内部管理三个状态变量（`providers`、`loading`、`errorKey`），通过 `fetchProviders` 异步函数从 `/furina/api/providers` 获取数据，并根据当前状态条件渲染四种 UI：加载骨架屏、错误提示、空状态引导、或供应商卡片列表。当 `refreshTrigger` 属性变化时，`useEffect` 会自动重新触发数据获取，确保 UI 与服务端数据保持同步。

**Parameters**:
- `onEdit` (`(provider: Provider) => void`): 必需。点击编辑按钮时调用的回调函数，将当前 provider 对象传递给父组件以打开编辑对话框。
- `onDelete` (`(provider: Provider) => void`): 必需。点击删除按钮时调用的回调函数，将当前 provider 对象传递给父组件以打开删除确认对话框。
- `onAddProvider` (`() => void`): 必需。在空状态下点击"添加第一个供应商"按钮时调用的回调函数，由父组件打开新增对话框。
- `onSetActive` (`(provider: Provider) => void`): 必需。设置某个供应商为当前活跃供应商的回调函数。
- `onToggleEnabled` (`(provider: Provider) => void`, 可选): 切换供应商启用/禁用状态的回调函数。
- `activeProviderId` (`string | null`, 可选): 当前活跃供应商的 ID。用于在 `ProviderCard` 上标记活跃状态（蓝色高亮）。
- `refreshTrigger` (`number`, 可选): 刷新触发器。父组件每次递增该值时，`ProviderList` 会重新发起 API 请求获取最新数据。

**Return Value**:
- `React.ReactElement`: 根据当前状态返回以下四种渲染结果之一：
  - `loading === true`: `LoadingSkeleton` 组件（3 个动画占位卡片）
  - `errorKey !== null`: 错误状态 UI（红色边框容器 + 错误信息 + 重试按钮）
  - `providers.length === 0`: `EmptyState` 组件（虚线边框容器 + 图标 + 引导文案 + 添加按钮）
  - `providers.length > 0`: 卡片列表容器（`space-y-3` 布局，每个 provider 渲染为 `ProviderCard`）

**Core Logic**:

组件内部通过 `useState` 管理三个状态：
1. `providers: Provider[]` — 存储从 API 获取的供应商列表，默认为空数组。
2. `loading: boolean` — 标识是否正在加载，默认为 `true`（组件挂载即开始请求）。
3. `errorKey: string | null` — 存储 i18n 错误消息的 key，默认为 `null`。

`fetchProviders` 是核心数据获取函数，使用 `useCallback(fn, [])` 包裹确保引用稳定。它依次执行：(1) 设置 `loading=true` 和清除 `errorKey`；(2) 发起 `fetch` 请求；(3) 检查 HTTP 响应状态码；(4) 解析 JSON 并更新 `providers`；(5) 在 `finally` 块中设置 `loading=false`。

`useEffect` 依赖 `[fetchProviders, refreshTrigger]`，当 `refreshTrigger` 变化时自动重新执行 `fetchProviders`。

渲染列表时，`providers.map` 将每个 `Provider` 对象映射为 `ProviderCard` 组件，并通过 `isActive: activeProviderId === provider.id` 计算当前卡片是否为活跃状态，将结果传递给 `ProviderCard`。

**Core Code**:
```typescript
const [providers, setProviders] = useState<Provider[]>([]);
const [loading, setLoading] = useState(true);
const [errorKey, setErrorKey] = useState<string | null>(null);

const fetchProviders = useCallback(async () => {
  setLoading(true);
  setErrorKey(null);
  try {
    const response = await fetch(getApiUrl());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: Provider[] = await response.json();
    setProviders(data);
  } catch (err) {
    setErrorKey('providerList.failedToLoad');
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => {
  void fetchProviders();
}, [fetchProviders, refreshTrigger]);
```
Source: `src/client/components/ProviderList.tsx`:138-157

**Usage Example**:
```typescript
// 在 App 组件中使用 ProviderList
// 当 activeView 为 'providers' 时渲染 ProviderList
React.createElement(ProviderList, {
  onEdit: handleOpenEditDialog,    // 打开编辑对话框
  onDelete: handleOpenDeleteDialog, // 打开删除确认对话框
  onAddProvider: handleOpenAddDialog, // 打开新增对话框
  onSetActive: handleSetActive,    // 切换活跃供应商
  onToggleEnabled: handleToggleEnabled, // 切换启用状态
  activeProviderId,                // 当前活跃供应商 ID
  refreshTrigger,                  // 递增时触发重新获取
})
```
Explanation: `App` 根组件管理所有对话框状态和 API 操作，将操作结果通过 `triggerRefresh()` 递增 `refreshTrigger`，`ProviderList` 监听到变化后自动重新拉取最新数据。这是父子组件间的单向数据流模式。

---

### `getApiUrl() -> string`

**Source**: `src/client/components/ProviderList.tsx`:33-35

**Functionality**: 构建供应商列表的 API 请求 URL。返回固定的相对路径 `/furina/api/providers`，使用相对路径确保应用在任何主机环境下都能正常工作（不依赖 `window.location.origin`）。

**Parameters**: 无

**Return Value**:
- `string`: API 路径字符串 `'/furina/api/providers'`

**Core Logic**:
直接返回硬编码的相对路径字符串。这种设计选择避免了在不同部署环境下（localhost、反向代理、容器化部署）出现跨域或 origin 不一致的问题。

**Core Code**:
```typescript
function getApiUrl(): string {
  return '/furina/api/providers';
}
```
Source: `src/client/components/ProviderList.tsx`:33-35

---

### `LoadingSkeleton() -> React.ReactElement`

**Source**: `src/client/components/ProviderList.tsx`:40-51

**Functionality**: 渲染加载状态下的骨架屏占位组件。在 API 请求进行期间展示 3 个带有脉冲动画的灰色矩形占位卡片，向用户反馈"正在加载"的视觉信号，提升感知性能体验。骨架屏的高度（`h-24`）与实际 `ProviderCard` 高度接近，避免加载完成后出现明显的布局跳动。

**Parameters**: 无

**Return Value**:
- `React.ReactElement`: 包含 3 个动画占位 div 的容器元素

**Core Logic**:
使用 `React.createElement` 手动构建 DOM（项目统一不使用 JSX）。通过 `[0, 1, 2].map` 生成 3 个占位卡片，每个卡片使用 Tailwind CSS 的 `animate-pulse` 实现脉冲动画效果，`rounded-xl border bg-muted/40 p-4 h-24` 实现圆角边框和半透明背景。

**Core Code**:
```typescript
function LoadingSkeleton(): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'space-y-3' },
    ...[0, 1, 2].map((index) =>
      React.createElement('div', {
        key: index,
        className: 'animate-pulse rounded-xl border bg-muted/40 p-4 h-24',
      }),
    ),
  );
}
```
Source: `src/client/components/ProviderList.tsx`:40-51

---

### `EmptyState({ onAdd }: { onAdd: () => void }) -> React.ReactElement`

**Source**: `src/client/components/ProviderList.tsx`:56-126

**Functionality**: 渲染空列表状态的引导界面。当 API 返回的供应商列表为空时，显示一个居中的虚线边框区域，包含用户组图标、"暂无供应商配置"标题、引导文案、以及"添加第一个供应商"按钮。按钮点击触发 `onAdd` 回调，由父组件打开新增对话框。所有文本通过 `useTranslation` 的 `t()` 函数渲染，支持中英文切换。

**Parameters**:
- `onAdd` (`() => void`): 点击"添加第一个供应商"按钮时调用的回调函数

**Return Value**:
- `React.ReactElement`: 空状态引导界面元素

**Core Logic**:
内部渲染结构为：外层 flex 居中容器（虚线边框 `border-dashed`）-> 圆形图标容器（内含 SVG 用户组图标，Users 图标由 `path` 和 `circle` 元素手绘）-> 标题文本（使用 i18n key `providerList.noProviders`）-> 描述文本（使用 i18n key `providerList.getStarted`）-> 按钮容器（包含 SVG 加号图标和按钮文本，使用 i18n key `providerList.addFirstProvider`）。整个组件使用 `React.createElement` 手动构建。

**Core Code**:
```typescript
function EmptyState({ onAdd }: { onAdd: () => void }): React.ReactElement {
  const { t } = useTranslation();
  return React.createElement(
    'div',
    { className: 'flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-10 text-center' },
    // ... 图标容器 ...
    React.createElement(
      'h3',
      { className: 'text-lg font-semibold' },
      t('providerList.noProviders'),
    ),
    React.createElement(
      'p',
      { className: 'mt-2 max-w-lg text-sm text-muted-foreground' },
      t('providerList.getStarted'),
    ),
    React.createElement(
      'div',
      { className: 'mt-6' },
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onAdd,
          className: 'inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors',
        },
        // ... 加号 SVG 图标 ...
        t('providerList.addFirstProvider'),
      ),
    ),
  );
}
```
Source: `src/client/components/ProviderList.tsx`:56-126

**Usage Example**:
```typescript
// EmptyState 内部由 ProviderList 自动在 providers.length === 0 时渲染
// 开发者无需直接调用，只需通过 onAddProvider prop 传入回调
// App 组件中：
const handleOpenAddDialog = () => {
  setIsAddDialogOpen(true);
};
// 传递给 ProviderList：
React.createElement(ProviderList, {
  onAddProvider: handleOpenAddDialog,
  // ... 其他 props
})
```
Explanation: 用户在空列表界面点击"添加第一个供应商"按钮后，`onAdd` 回调链路为：`EmptyState.onAdd` -> `ProviderList.onAddProvider` -> `App.handleOpenAddDialog` -> 设置 `isAddDialogOpen=true` -> 渲染 `AddProviderDialog`。

## Data Structures

### `ProviderListProps`
```typescript
interface ProviderListProps {
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onAddProvider: () => void;
  onSetActive: (provider: Provider) => void;
  onToggleEnabled?: (provider: Provider) => void;
  activeProviderId?: string | null;
  refreshTrigger?: number;
}
```
- `onEdit` (`(provider: Provider) => void`): 编辑操作回调，接收完整的 Provider 对象
- `onDelete` (`(provider: Provider) => void`): 删除操作回调，接收完整的 Provider 对象
- `onAddProvider` (`() => void`): 添加操作回调（在空状态下触发）
- `onSetActive` (`(provider: Provider) => void`): 设置活跃供应商回调
- `onToggleEnabled` (`(provider: Provider) => void`, 可选): 切换启用/禁用状态回调
- `activeProviderId` (`string | null`, 可选): 当前活跃供应商 ID，用于视觉高亮
- `refreshTrigger` (`number`, 可选): 刷新触发器，递增时触发重新获取列表数据

Source: `src/client/components/ProviderList.tsx`:14-27

### `Provider`（外部依赖类型，定义于 `providers-store.ts`）
```typescript
// Zod schema 推导的 TypeScript 类型
type Provider = {
  id: string;
  name: string;
  notes?: string;
  websiteUrl?: string;
  apiKey?: string;
  baseUrl?: string;
  icon?: string;
  iconColor?: string;
  usedTemplate?: string;
  defaultModel: string;   // 默认 ''
  sonnetModel: string;    // 默认 ''
  opusModel: string;      // 默认 ''
  haikuModel: string;     // 默认 ''
  enabled: boolean;       // 默认 true
  createdAt: string;
  updatedAt?: string;
}
```
- `id` (`string`): 供应商唯一标识，由服务端生成
- `name` (`string`): 供应商名称（如 "Anthropic"、"DeepSeek"）
- `notes` (`string`, 可选): 用户自定义备注
- `websiteUrl` (`string`, 可选): 供应商官网地址
- `apiKey` (`string`, 可选): API 密钥
- `baseUrl` (`string`, 可选): API 基础 URL
- `icon` (`string`, 可选): 品牌图标文件名（如 "anthropic.svg"）
- `enabled` (`boolean`): 是否启用，影响 `ProviderCard` 的视觉样式（禁用时半透明+灰度）
- `createdAt` (`string`): 创建时间 ISO 字符串

Source: `src/server/providers-store.ts`:29-49

### i18n 键值（`providerList` 命名空间）
```json
{
  "noProviders": "暂无供应商配置",
  "getStarted": "添加您的第一个 AI 供应商以开始使用。",
  "addFirstProvider": "添加第一个供应商",
  "failedToLoad": "加载供应商失败",
  "retry": "重试"
}
```
- `providerList.noProviders`: 空状态标题
- `providerList.getStarted`: 空状态引导描述
- `providerList.addFirstProvider`: 空状态添加按钮文本
- `providerList.failedToLoad`: 错误状态消息
- `providerList.retry`: 错误状态重试按钮文本

Source: `src/client/i18n/locales/zh-CN.json`:56-62

## Error Handling and Edge Cases

**API 请求错误处理**：
- 当 `fetch` 请求抛出异常（网络错误、DNS 解析失败等）或 HTTP 响应状态码非 2xx 时，`catch` 块将 `errorKey` 设置为 `'providerList.failedToLoad'`，渲染错误状态 UI。
- 错误信息通过 `t(errorKey)` 读取 i18n 翻译，避免硬编码字符串，确保中英文环境下都有正确的错误提示。
- 错误状态 UI 底部提供"重试"按钮，点击后直接调用 `fetchProviders()` 重新发起请求。

**HTTP 状态码检查**：
- `if (!response.ok)` 覆盖所有非 2xx 状态码（4xx、5xx），统一作为错误处理，不区分具体错误类型。

**`refreshTrigger` 边界情况**：
- 当 `refreshTrigger` 未传入（`undefined`）时，`useEffect` 依赖数组中仍包含它，首次挂载时会执行一次 `fetchProviders`。后续若父组件未递增该值，则不会触发额外请求。
- `refreshTrigger` 值从 0 递增到 1 再到 2... 每次变化都会触发 `useEffect`，因为 `useEffect` 对依赖项使用严格相等比较。

**`void fetchProviders()` 模式**：
- `useEffect` 和错误重试按钮中使用 `void fetchProviders()` 调用，`void` 操作符显式忽略 Promise 返回值，避免 ESLint `@typescript-eslint/no-floating-promises` 规则报错。

**加载状态的竞态防护**：
- `fetchProviders` 在开始时设置 `loading=true` 并清除 `errorKey`，确保每次新请求都会重置状态，避免旧的错误状态残留到新请求的渲染中。

## Dependencies

**Depends on**:
- `ProviderCard` 组件（`src/client/components/ProviderCard.tsx`）: 渲染单个供应商卡片，接收 `provider`、`isActive` 及所有操作回调
- `Provider` 类型（`src/server/providers-store.ts`）: 供应商数据结构的 TypeScript 类型定义
- `react-i18next` (`useTranslation`): 国际化文本渲染
- 后端 API `GET /furina/api/providers`: 供应商列表数据源

**Depended by**:
- `App` 根组件（`src/client/App.tsx`）: 在 `activeView === 'providers'` 时渲染 `ProviderList`，通过 `refreshTrigger` 驱动数据刷新，通过回调函数处理用户操作

## Usage Examples

**完整集成场景**（摘自 `App.tsx`）：

```typescript
import { ProviderList } from './components/ProviderList.js';
import type { Provider } from '../server/providers-store.js';

export function App() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);

  // 递增刷新触发器，通知 ProviderList 重新获取数据
  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // 各操作回调
  const handleOpenEditDialog = (provider: Provider) => setEditingProvider(provider);
  const handleOpenDeleteDialog = (provider: Provider) => setDeletingProvider(provider);
  const handleOpenAddDialog = () => setIsAddDialogOpen(true);
  const handleSetActive = async (provider: Provider) => {
    await fetch('/furina/api/providers/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.id }),
    });
    triggerRefresh(); // 操作成功后刷新列表
  };
  const handleToggleEnabled = async (provider: Provider) => {
    const nextEnabled = !(provider.enabled ?? true);
    await fetch(`/furina/api/providers/${provider.id}/enabled`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled }),
    });
    triggerRefresh();
  };

  // 条件渲染：仅在 providers 视图下显示
  return activeView === 'providers'
    ? React.createElement(ProviderList, {
        onEdit: handleOpenEditDialog,
        onDelete: handleOpenDeleteDialog,
        onAddProvider: handleOpenAddDialog,
        onSetActive: handleSetActive,
        onToggleEnabled: handleToggleEnabled,
        activeProviderId,
        refreshTrigger,
      })
    : React.createElement(DetailPanel, { /* ... */ });
}
```

Explanation: 这是 `App` 根组件中 `ProviderList` 的典型集成方式。所有 API 操作（set active、toggle enabled、add、edit、delete）在 `App` 层完成后统一调用 `triggerRefresh()` 递增 `refreshTrigger`，`ProviderList` 监听到该值变化后自动重新请求 `/furina/api/providers` 并更新 UI。这种"操作在父组件、刷新在子组件"的模式确保了数据一致性，同时将数据获取逻辑封装在 `ProviderList` 内部，保持 `App` 组件的职责清晰。
