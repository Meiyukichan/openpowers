# ProviderCard Component

> Source files:
> - `src/client/components/ProviderCard.tsx` : 1-258

## Overview

ProviderCard 是 Furina 客户端中负责渲染单个供应商卡片的核心 UI 组件。它承担以下职责：

- **信息展示**：以卡片形式展示供应商的品牌图标、名称、备注和网站链接
- **状态视觉反馈**：通过不同的 CSS 类名反映供应商的活跃状态（蓝色渐变背景 + 蓝色边框）、已禁用状态（opacity-50 + 灰度滤镜）
- **悬停操作按钮**：仅在鼠标悬停时显示，提供"设为活跃"、"编辑"、"启用/禁用切换"、"删除"四个操作入口，避免默认状态下界面过于拥挤
- **异步操作状态管理**：对"设为活跃"和"启用/禁用切换"两个异步操作使用 `enablePending` / `togglePending` 本地状态进行加载指示，防止重复点击

**设计动机**：ProviderCard 是 ProviderList 的子组件，通过 `onEdit` / `onDelete` / `onSetActive` / `onToggleEnabled` 回调将用户操作冒泡至 App 根组件（App.tsx 负责实际 API 调用）。组件自身不发起任何网络请求，保持纯展示 + 事件转发的单一职责。

**使用场景**：当用户在"供应商管理"视图下查看供应商列表时，ProviderList 为每个 Provider 数据渲染一张 ProviderCard。

**涉及源文件及其职责**：
- `src/client/components/ProviderCard.tsx`（第 1-258 行）：完整的组件实现，包含 `ProviderIcon` 子组件、`getEnableButtonState` 辅助函数和 `ProviderCard` 主组件

## Architecture / Flow

ProviderCard 的内部架构由三个独立单元组成，形成清晰的层次结构：

```
ProviderCard (主组件)
├── ProviderIcon (子组件) ── 负责品牌图标渲染
├── getEnableButtonState (辅助函数) ── 确定"启用"按钮状态配置
└── 渲染结构
    ├── 根容器 div（含状态 CSS 类名 + 渐变遮罩层）
    └── 内容区 div
        ├── 左侧：ProviderIcon + 名称 + 备注 + 网站链接
        └── 右侧：悬停操作按钮组（启用 / 编辑 / 切换启用 / 删除）
```

**状态流转**：
1. 父组件传入 `provider` 数据和 `isActive` 标志
2. 组件根据 `isActive` 和 `provider.enabled === false` 计算视觉样式
3. 用户触发操作按钮 → 调用本地异步 handler → 设置 pending 状态 → 调用父组件回调 → pending 重置
4. 父组件（App.tsx）通过 API 调用后触发列表刷新，新数据流入 ProviderCard

**SVG 图标解析流程**：
1. Provider 对象的 `icon` 字段存储 SVG 文件名（如 `anthropic.svg`）
2. `ICON_MAP` 将文件名映射为 Vite `?url` 导入的模块 URL
3. `ProviderIcon` 组件使用映射后的 URL 渲染 `<img>` 标签

## Functionality / Interface Details

### `ProviderIcon({ icon }: { icon?: string }) -> React.ReactElement | null`

**Source**: `src/client/components/ProviderCard.tsx`:52-65

**Functionality**：渲染供应商品牌 SVG 图标。该子组件负责将 Provider 数据中的 SVG 文件名（如 `anthropic.svg`）通过 `ICON_MAP` 映射为 Vite 构建时的 `?url` 导入模块 URL，再以 `<img>` 标签方式渲染。当 `icon` 字段为空或文件名不在 `ICON_MAP` 中时，返回 `null`（不显示任何图标）。

**参数**：
- `icon` (`string | undefined`): Provider 对象的 icon 字段，格式为 SVG 文件名（如 `'openai.svg'`），对应 `ICON_MAP` 的 key

**返回值**：
- `React.ReactElement | null`: 带有 `src`、`alt`、`width`、`height`、`loading` 属性的 `<img>` 元素，或 `null`

**Core Logic**：
1. 通过 `icon ? ICON_MAP[icon] : undefined` 查找映射 URL
2. 若查找到有效 URL，使用 `React.createElement('img', ...)` 创建带 20x20 尺寸的懒加载图片
3. `alt` 文本使用 i18n 翻译键 `providerCard.providerIcon`，确保无障碍访问

**Core Code**:
```tsx
function ProviderIcon({ icon }: { icon?: string }): React.ReactElement | null {
  const { t } = useTranslation();
  const svgUrl = icon ? ICON_MAP[icon] : undefined;
  if (svgUrl) {
    return React.createElement('img', {
      src: svgUrl,
      alt: t('providerCard.providerIcon'),
      width: 20,
      height: 20,
      loading: 'lazy',
    });
  }
  return null;
}
```
Source: `src/client/components/ProviderCard.tsx`:52-65

**Usage Example**:
```tsx
// 在 ProviderCard 内部使用
React.createElement(
  'div',
  { className: 'h-10 w-10 rounded-lg bg-muted flex items-center justify-center border flex-shrink-0' },
  React.createElement(ProviderIcon, { icon: provider.icon }),
)
```
Explanation: 在 40x40 的容器内渲染 ProviderIcon，当 `icon` 为有效 SVG 文件名时显示品牌图标，否则容器保持空状态。

---

### `getEnableButtonState(isActive: boolean, t: TFunction) -> EnableButtonState`

**Source**: `src/client/components/ProviderCard.tsx`:72-92

**Functionality**：根据供应商是否为当前活跃状态，返回"启用"按钮的配置对象。该函数是一个纯函数，将活跃状态映射为按钮的视觉表现和交互行为，实现了"活跃 = 已完成（灰色禁用 Check 图标）"与"非活跃 = 可操作（蓝色 Play 图标）"两种模式的切换。

**参数**：
- `isActive` (`boolean`): 该供应商是否为当前活跃的供应商
- `t` (`TFunction`): react-i18next 的翻译函数，用于获取按钮文案

**返回值**：
- `{ disabled: boolean; icon: ComponentType; text: string }`:
  - `disabled`: 按钮是否禁用（active 时为 `true`，防止重复点击已活跃的供应商）
  - `icon`: lucide-react 图标组件（`Check` 表示已活跃，`Play` 表示可启用）
  - `text`: 按钮文案（使用 i18n 键 `providerCard.active` 或 `providerCard.enable`）

**Core Logic**：
- `isActive === true` → 返回禁用状态 + Check 图标 + "使用中"文案
- `isActive === false` → 返回可点击状态 + Play 图标 + "启用"文案

**Core Code**:
```tsx
function getEnableButtonState(
  isActive: boolean,
  t: (key: string, options?: Record<string, unknown>) => string,
): {
  disabled: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  text: string;
} {
  if (isActive) {
    return { disabled: true, icon: Check, text: t('providerCard.active') };
  }
  return { disabled: false, icon: Play, text: t('providerCard.enable') };
}
```
Source: `src/client/components/ProviderCard.tsx`:72-92

**Usage Example**:
```tsx
// 在 ProviderCard 主组件中
const buttonState = getEnableButtonState(isActive, t);
// buttonState.disabled → false
// buttonState.icon → Play
// buttonState.text → "启用"（zh-CN）/ "Enable"（en-US）
```
Explanation: 在渲染前调用此函数获取按钮配置，然后在按钮元素上使用 `disabled`、图标组件和文案。

---

### `ProviderCard({ provider, onEdit, onDelete, onSetActive, onToggleEnabled, isActive }) -> React.ReactElement`

**Source**: `src/client/components/ProviderCard.tsx`:98-258

**Functionality**：主组件，负责渲染完整的供应商卡片，包括品牌图标区域、信息展示区、悬停操作按钮组，以及基于状态的视觉样式。这是 ProviderList 中每个供应商条目的渲染单元，通过 `group` CSS 类实现悬停时按钮组渐显的效果。

**参数**（通过 `ProviderCardProps` 接口）：
- `provider` (`Provider`): 供应商数据对象，包含 `id`、`name`、`notes`、`websiteUrl`、`icon`、`enabled` 等字段
- `onEdit` (`(provider: Provider) => void`): 编辑按钮点击回调，由父组件处理（打开 EditProviderDialog）
- `onDelete` (`(provider: Provider) => void`): 删除按钮点击回调，由父组件处理（打开 DeleteConfirmDialog）
- `onSetActive` (`(provider: Provider) => void`): 设为活跃回调（可返回 Promise），由父组件调用 API 并刷新列表
- `onToggleEnabled` (`(provider: Provider) => void | undefined`): 启用/禁用切换回调（可选，可返回 Promise），由父组件调用 API
- `isActive` (`boolean`): 该供应商是否为当前活跃供应商，决定视觉样式和按钮状态

**返回值**：
- `React.ReactElement`: 完整的卡片 DOM 结构，使用 `React.createElement` 纯函数式调用（无 JSX）

**Core Logic**：

1. **状态计算**：
   - `enablePending` / `togglePending`: 两个独立的 `useState<boolean>` 用于异步操作的 loading 状态
   - `buttonState`: 调用 `getEnableButtonState` 获取启用按钮配置
   - `isDisabled`: 由 `provider.enabled === false` 判断

2. **异步操作处理**：
   - `handleEnable`: 先检查 `isActive`（防止重复操作），设置 `enablePending = true`，`await onSetActive(provider)`，最后在 `finally` 块中重置 pending
   - `handleToggleEnabled`: 先检查 `onToggleEnabled` 是否存在，设置 `togglePending = true`，`await onToggleEnabled(provider)`，最后在 `finally` 块中重置 pending

3. **CSS 样式逻辑**：
   - 活跃状态：`border-blue-500/60 shadow-sm shadow-blue-500/10`（蓝色边框 + 阴影）
   - 非活跃状态：`border-border hover:border-blue-500/50`（默认边框，悬停时蓝色）
   - 禁用状态：追加 `opacity-50 grayscale`
   - 渐变遮罩：活跃时 `opacity-100`，否则 `opacity-0`，配合 `transition-all duration-300`

4. **按钮组渲染**：
   - 启用按钮：使用 `buttonState.disabled || enablePending` 作为 disabled 条件
   - 切换启用按钮：仅在 `onToggleEnabled` 存在时渲染（条件渲染），使用 `isDisabled` 决定图标（Power/PowerOff）
   - 操作按钮组容器：`opacity-0 group-hover:opacity-100 transition-opacity duration-200` 实现悬停渐显

5. **信息展示**：
   - `provider.notes` 仅在存在时渲染（条件渲染）
   - `provider.websiteUrl` 仅在存在时渲染为可点击的 `<a>` 链接（`target="_blank"`）

**Core Code**:
```tsx
export function ProviderCard({ provider, onEdit, onDelete, onSetActive, onToggleEnabled, isActive }: ProviderCardProps): React.ReactElement {
  const { t } = useTranslation();
  const [enablePending, setEnablePending] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const buttonState = getEnableButtonState(isActive, t);
  const isDisabled = provider.enabled === false;

  const handleEnable = async () => {
    if (isActive) return;
    setEnablePending(true);
    try {
      await onSetActive(provider);
    } finally {
      setEnablePending(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!onToggleEnabled) return;
    setTogglePending(true);
    try {
      await onToggleEnabled(provider);
    } finally {
      setTogglePending(false);
    }
  };

  return React.createElement(
    'div',
    {
      className: `relative overflow-hidden rounded-xl border bg-card text-card-foreground px-4 py-4 transition-all duration-300 group flex items-center ${
        isActive ? 'border-blue-500/60 shadow-sm shadow-blue-500/10' : 'border-border hover:border-blue-500/50'
      }${isDisabled ? ' opacity-50 grayscale' : ''}`,
    },
    React.createElement('div', {
      className: `absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none ${
        isActive ? 'opacity-100' : 'opacity-0'
      }`,
    }),
    // ... 左侧信息区 + 右侧操作按钮组
  );
}
```
Source: `src/client/components/ProviderCard.tsx`:98-258

**Usage Example**:
```tsx
// ProviderList 中遍历供应商列表并渲染 ProviderCard
React.createElement(
  'div',
  { className: 'space-y-3' },
  ...providers.map((provider) =>
    React.createElement(ProviderCard, {
      key: provider.id,
      provider,
      onEdit,
      onDelete,
      onSetActive,
      onToggleEnabled,
      isActive: activeProviderId === provider.id,
    }),
  ),
);
```
Explanation: ProviderList 将从 API 获取的每个 Provider 数据映射为一张 ProviderCard，通过比较 `activeProviderId` 与 `provider.id` 确定 `isActive` 状态。所有回调函数直接从父组件透传。

---

### `ICON_MAP: Record<string, string>`

**Source**: `src/client/components/ProviderCard.tsx`:37-46

**Functionality**：SVG 文件名到 Vite `?url` 导入模块 URL 的静态映射表。该常量将 Provider 数据中存储的 SVG 文件名（如 `anthropic.svg`）转换为构建时打包的资源 URL，解决了在客户端代码中引用 `public/icons/` 下静态 SVG 文件的路径问题。

**Core Code**:
```tsx
const ICON_MAP: Record<string, string> = {
  'anthropic.svg': AnthropicSvg,
  'deepseek.svg': DeepSeekSvg,
  'xiaomimimo.svg': XiaomimimoSvg,
  'chatglm.svg': ChatglmSvg,
  'minimax.svg': MinimaxSvg,
  'kimi.svg': KimiSvg,
  'bailian.svg': BailianSvg,
  'openai.svg': OpenAISvg,
};
```
Source: `src/client/components/ProviderCard.tsx`:37-46

**扩展说明**：新增供应商图标需两步：(1) 将 SVG 文件放入 `src/client/icons/` 目录；(2) 在 `ICON_MAP` 中添加对应的文件名 → `import` 映射。

## Data Structures

### `ProviderCardProps`

```tsx
interface ProviderCardProps {
  provider: Provider;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onSetActive: (provider: Provider) => void;
  onToggleEnabled?: (provider: Provider) => void;
  isActive: boolean;
}
```
Source: `src/client/components/ProviderCard.tsx`:24-34

- `provider` (`Provider`): 供应商完整数据对象（来自 `src/server/providers-store.ts` 的 Zod schema 推导类型）
- `onEdit` (`(provider: Provider) => void`): 编辑操作回调
- `onDelete` (`(provider: Provider) => void`): 删除操作回调
- `onSetActive` (`(provider: Provider) => void`): 设为活跃操作回调，支持 async
- `onToggleEnabled` (`(provider: Provider) => void | undefined`): 启用/禁用切换回调（可选），支持 async
- `isActive` (`boolean`): 该供应商是否为当前活跃供应商

### `Provider`（上游依赖，定义于 `src/server/providers-store.ts`）

```tsx
const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
  usedTemplate: z.string().optional(),
  defaultModel: z.string().default(''),
  sonnetModel: z.string().default(''),
  opusModel: z.string().default(''),
  haikuModel: z.string().default(''),
  enabled: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
type Provider = z.infer<typeof ProviderSchema>;
```

ProviderCard 实际访问的字段：
- `id`: 用于按钮 `key`（由 ProviderList 使用）
- `name`: 卡片标题和 aria-label 插值
- `notes`: 可选备注，显示在名称下方
- `websiteUrl`: 可选网站链接，显示为蓝色 `<a>` 标签
- `icon`: 可选 SVG 文件名，用于 ICON_MAP 查找品牌图标
- `enabled`: 决定 `isDisabled` 状态和灰度样式

## Error Handling and Edge Cases

**异步操作错误处理**：
- `handleEnable` 和 `handleToggleEnabled` 均使用 `try/finally` 模式，确保无论父组件回调是否抛出异常，`enablePending` 和 `togglePending` 状态都会被正确重置。错误的实际处理（如 toast 通知）由 App.tsx 中的回调实现负责。
- `finally` 模式而非 `try/catch`：组件不捕获错误，允许 Promise rejection 向上冒泡，由调用方（App.tsx 的 `handleSetActive` / `handleToggleEnabled`）统一处理并显示错误 toast。

**边界情况**：
- `isActive === true` 时，`handleEnable` 会在入口处直接 `return`，不发起任何请求
- `onToggleEnabled` 为 `undefined` 时，`handleToggleEnabled` 会直接 `return`，且切换按钮不渲染（条件渲染）
- `provider.icon` 为 `undefined` 或不在 `ICON_MAP` 中时，`ProviderIcon` 返回 `null`，图标容器保持空状态
- `provider.notes` / `provider.websiteUrl` 为 falsy 时，对应元素不渲染（条件渲染）

## Dependencies

**Depends on**:
- `src/server/providers-store.ts`：`Provider` 类型定义（Zod schema 推导的 TypeScript 类型）
- `react`：`useState` hook 和 `React.createElement`
- `react-i18next`：`useTranslation` hook，用于所有用户可见文案的国际化
- `lucide-react`：图标库，使用 `Play`、`Check`、`Pencil`、`Trash2`、`Power`、`PowerOff` 图标
- `src/client/icons/*.svg`：8 个供应商品牌 SVG 文件（通过 Vite `?url` 导入）

**Depended by**：
- `src/client/components/ProviderList.tsx`：遍历供应商列表，为每个 Provider 渲染一张 ProviderCard
- `src/client/App.tsx`：间接依赖，通过 ProviderList 传入 `onSetActive`、`onToggleEnabled` 等回调

## Usage Examples

**在 ProviderList 中使用 ProviderCard（典型集成场景）**：

```tsx
// ProviderList 组件中，从 API 获取 providers 后遍历渲染
export function ProviderList({ onEdit, onDelete, onAddProvider, onSetActive, onToggleEnabled, activeProviderId, refreshTrigger }: ProviderListProps) {
  // ... fetchProviders 逻辑省略 ...

  return React.createElement(
    'div',
    { className: 'space-y-3' },
    ...providers.map((provider) =>
      React.createElement(ProviderCard, {
        key: provider.id,          // 使用 provider.id 作为 React key
        provider,                   // 完整的 Provider 数据对象
        onEdit,                     // 直接透传父组件回调
        onDelete,                   // 直接透传父组件回调
        onSetActive,                // App.handleSetActive → PUT /furina/api/providers/active
        onToggleEnabled,            // App.handleToggleEnabled → PUT /furina/api/providers/:id/enabled
        isActive: activeProviderId === provider.id,  // 比较计算 isActive
      }),
    ),
  );
}
```

**回调在 App.tsx 中的实现示例**：

```tsx
// App.tsx 中的 handleSetActive 实现（ProviderCard 的 onSetActive 最终调用此函数）
const handleSetActive = async (provider: Provider) => {
  try {
    const response = await fetch('/furina/api/providers/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.id }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    triggerRefresh();  // 刷新列表，activeProviderId 通过 /furina/api/providers/active 重新获取
    showToast(t('toast.activeProviderSet', { name: provider.name }));
  } catch (err) {
    // 错误 toast 提示
  }
};
```

Explanation: ProviderCard 本身不发起网络请求，所有操作通过回调函数冒泡到 App.tsx。App.tsx 负责 API 调用、成功后的列表刷新和错误处理。这种设计保持了 ProviderCard 的纯展示职责，使测试和复用更加简单。
