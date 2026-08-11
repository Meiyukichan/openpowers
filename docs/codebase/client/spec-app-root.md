# Application Entry & Root Component

> Source files:
> - `src/client/main.tsx` : 1-37
> - `src/client/App.tsx` : 1-337
> - `src/client/index.html` : 1-13
> - `src/client/index.css` : 1-51

## Overview

本 spec 覆盖 Furina 客户端应用的启动入口和根组件，是整个前端 UI 的基础设施层。

**角色与定位**：作为客户端的"地基"，本 spec 负责三件事——HTML 外壳加载、应用异步引导（i18n 初始化 + React 挂载）、以及根组件 `App` 对所有顶层状态的集中编排。`App` 是 UI 中唯一同时拥有 Provider CRUD 操作状态、对话框开闭状态、视图切换状态、Toast 消息状态的组件，它将这些状态通过回调 props 分发给子组件（`Layout`、`ProviderList`、`DetailPanel`、各对话框组件）。

**设计动机**：将所有顶层状态提升到 `App` 单一组件，避免 props drilling 多层嵌套，同时确保 Provider 的增删改查和状态同步（active provider、enabled、proxy）通过统一的 `refreshTrigger` 机制保持 UI 一致性。这种"状态提升 + 刷新触发器"模式在整个应用中是一致的。

**使用场景**：用户打开浏览器访问 Furina 管理界面时，从 `index.html` 加载开始，经 `main.tsx` 异步引导完成后渲染 `App` 组件，随后用户的所有交互（切换 Provider、编辑配置、查看项目变更等）均由 `App` 编排处理。

**涉及源文件及职责**：
- `index.html`：HTML 外壳，定义 `<div id="root">` 挂载点和 `<script>` 模块入口
- `index.css`：Tailwind 指令、CSS 自定义属性（主题色 token）、关键帧动画
- `main.tsx`：异步引导函数，先初始化 i18n 再挂载 React 应用
- `App.tsx`：根组件，管理所有顶层状态和 Provider REST API 操作

## Architecture / Flow

### 启动引导流程

```
index.html 加载
  └─> <script type="module" src="./main.tsx">
        └─> bootstrap() 异步函数
              ├─> await initI18n()          // 从后端获取语言配置，初始化 i18next
              └─> ReactDOM.createRoot().render(
                    <StrictMode>
                      <I18nextProvider>
                        <App />             // 根组件挂载
                      </I18nextProvider>
                    </StrictMode>
                  )
```

### App 组件状态流转

```
App 组件挂载
  ├─> useEffect: fetchActiveProvider()     // 依赖 refreshTrigger
  ├─> useEffect: fetchProxyState()         // 仅挂载时执行一次
  └─> useEffect: 同步 <html lang>          // 依赖 i18n.language

用户操作触发 handler
  ├─> handleAddSuccess / handleEditSuccess / handleDeleteSuccess
  │     └─> triggerRefresh() + showToast()
  ├─> handleSetActive / handleToggleEnabled / handleToggleProxy
  │     └─> fetch API → triggerRefresh() + showToast()
  └─> handleReset
        └─> fetch API → triggerRefresh() + showToast()
```

### 渲染树结构

```
App
├── Layout
│   ├── ActivityBar (activeView / onViewChange)
│   ├── [sidebar] ProjectSidebar (当 activeView === 'projects')
│   └── [children]
│       ├── ProviderList (当 activeView === 'providers')
│       └── DetailPanel (当 activeView === 'projects')
├── AddProviderDialog
├── EditProviderDialog
├── DeleteConfirmDialog
└── [Toast] inline div (条件渲染)
```

## Functionality / Interface Details

### `bootstrap(): Promise<void>`

**Source**: `src/client/main.tsx` : 18-34

**Functionality**: 应用异步引导函数。在 React 渲染之前先完成 i18n 初始化，确保整个组件树渲染时翻译资源已就绪。这是前端应用的唯一入口点，采用 async/await 模式处理 i18n 的异步加载（i18next 需要从后端 `/furina/api/config` 获取默认语言配置）。初始化完成后使用 `ReactDOM.createRoot` 挂载 React 18 并发模式渲染树。

**Parameters**: 无参数。

**Return Value**:
- `Promise<void>`：引导完成后 resolve，无返回值。
- 边界情况：若 `initI18n()` 内部 fetch 失败，i18n 会 fallback 到 `'zh-CN'`，引导仍会成功完成。

**Core Logic**:
1. 调用 `initI18n()` 获取已初始化的 i18next 实例，该实例内含翻译资源和从后端读取的语言设置
2. 获取 DOM 中 `#root` 元素
3. 若元素存在，使用 `ReactDOM.createRoot` 创建并发模式根节点
4. 通过 `React.createElement` 而非 JSX 构建渲染树：`StrictMode` > `I18nextProvider` > `App`
5. 使用 `void bootstrap()` 立即执行，忽略返回的 Promise

**Core Code**:
```tsx
const rootElement = document.getElementById('root');

async function bootstrap(): Promise<void> {
  const i18n = await initI18n();

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          I18nextProvider,
          { i18n },
          React.createElement(App),
        ),
      ),
    );
  }
}

void bootstrap();
```
Source: `src/client/main.tsx` : 16-36

**Usage Example**:
```tsx
// main.tsx 是 index.html 中声明的模块入口，无需手动调用
// <script type="module" src="./main.tsx"></script>
// Vite 开发服务器或构建工具会自动处理模块加载
```
Explanation: 该函数由浏览器通过 `<script type="module">` 自动执行，开发者无需手动调用。引导顺序保证了 i18n 在 React 渲染前就绪。

---

### `App(): React.ReactElement`

**Source**: `src/client/App.tsx` : 31-336

**Functionality**: 根组件，承担三重职责：(1) 管理所有顶层 UI 状态（对话框、活跃视图、选中变更、Toast）；(2) 封装所有 Provider 相关的 REST API 操作（增删改查、激活、启用/禁用、代理开关、重置）；(3) 根据 `activeView` 状态条件渲染不同的主内容区域，并将回调函数分发给子组件。

**Parameters**: 无参数（React 组件）。

**Return Value**:
- `React.ReactElement`：完整的应用 UI 树，包含 `Layout`（含侧边栏和主内容区）、三个对话框组件、以及条件渲染的 Toast 通知。

**Core Logic**:

**状态声明**：组件使用 8 个 `useState` 管理顶层状态：
- `isAddDialogOpen` (boolean)：添加对话框开闭
- `editingProvider` (Provider | null)：正在编辑的 Provider，非 null 时打开编辑对话框
- `deletingProvider` (Provider | null)：正在删除的 Provider，非 null 时打开删除确认对话框
- `refreshTrigger` (number)：递增计数器，变更时触发 `fetchActiveProvider` effect 重新拉取服务端状态
- `activeProviderId` (string | null)：当前激活的 Provider ID
- `enableFurinaProxy` (boolean)：代理开关状态
- `toastMessage` ({text, type} | null)：Toast 消息，2.5 秒后自动消失
- `selectedChange` (ChangeEntryWithCwd | null)：在项目视图中选中的变更条目
- `activeView` (ActivityBarView)：当前活跃视图，从 `localStorage` 初始化，支持 `'providers'` | `'projects'`

**activeView 持久化**：使用 `persistActiveView` 函数，先写入 `localStorage`（key: `furina:activeView`），再更新状态。切换到非 projects 视图时自动清除 `selectedChange`。

**refreshTrigger 同步机制**：所有变更操作（add/edit/delete/setActive/toggleEnabled/reset）完成后都调用 `triggerRefresh()` 使 `refreshTrigger` 递增，触发 `fetchActiveProvider` effect 重新从服务端获取活跃 Provider 状态，确保 UI 与服务端一致。

**Core Code**:
```tsx
// 状态声明
const [refreshTrigger, setRefreshTrigger] = useState(0);
const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
const [activeView, setActiveView] = useState<ActivityBarView>(() => {
  try {
    const stored = localStorage.getItem('furina:activeView');
    return stored === 'projects' || stored === 'providers' ? stored : 'providers';
  } catch {
    return 'providers';
  }
});

// refreshTrigger 驱动的数据同步
useEffect(() => {
  const fetchActiveProvider = async () => {
    try {
      const response = await fetch('/furina/api/providers/active');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: { activeProviderId: string | null } = await response.json();
      setActiveProviderId(data.activeProviderId);
    } catch (err) {
      logger.error(`Failed to fetch active provider: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  void fetchActiveProvider();
}, [refreshTrigger]);
```
Source: `src/client/App.tsx` : 35-109

**Usage Example**:
```tsx
// App 组件由 main.tsx 的 bootstrap 函数直接渲染，不接受任何 props
// React.createElement(App) 即可启动完整应用
```
Explanation: App 是纯组件，不接受 props，所有状态自管理。它是 Layout、ProviderList、DetailPanel 和对话框组件的直接父级。

---

### `handleSetActive(provider: Provider) -> Promise<void>`

**Source**: `src/client/App.tsx` : 194-211

**Functionality**: 将指定 Provider 设置为当前激活的 Provider。调用 PUT `/furina/api/providers/active` API，成功后触发列表刷新并显示 Toast 提示。激活后所有 LLM 请求将通过该 Provider 的配置进行路由。

**Parameters**:
- `provider` (`Provider`)：要激活的 Provider 对象，函数从中提取 `provider.id` 和 `provider.name`。

**Return Value**:
- `Promise<void>`：异步操作完成后 resolve。

**Core Logic**:
1. 发送 PUT 请求到 `/furina/api/providers/active`，请求体为 `{ providerId: provider.id }`
2. 检查 HTTP 响应状态，非 2xx 抛出错误
3. 成功时调用 `triggerRefresh()` 触发状态同步，`showToast` 显示成功消息
4. 失败时记录日志并显示错误 Toast

**Core Code**:
```tsx
const handleSetActive = async (provider: Provider) => {
  try {
    const response = await fetch('/furina/api/providers/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.id }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    triggerRefresh();
    showToast(t('toast.switchedTo', { name: provider.name }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to set active provider: ${message}`);
    showToast(t('toast.switchFailed', { message }), 'error');
  }
};
```
Source: `src/client/App.tsx` : 194-211

**Usage Example**:
```tsx
// 传递给 ProviderList 组件
React.createElement(ProviderList, {
  onSetActive: handleSetActive,
  // ...other props
})
```
Explanation: ProviderList 中每个 Provider 卡片的"激活"按钮点击时调用此 handler。

---

### `handleToggleEnabled(provider: Provider) -> Promise<void>`

**Source**: `src/client/App.tsx` : 219-237

**Functionality**: 切换 Provider 的启用/禁用状态。通过 PUT `/furina/api/providers/:id/enabled` API 更新 `enabled` 字段。禁用的 Provider 不会参与 LLM 请求路由，但配置仍保留在存储中。

**Parameters**:
- `provider` (`Provider`)：要切换状态的 Provider，函数根据 `provider.enabled`（默认 `true`）计算下一状态。

**Return Value**:
- `Promise<void>`

**Core Logic**:
1. 计算 `nextEnabled = !(provider.enabled ?? true)`，默认 enabled 为 true
2. PUT 请求到 `/furina/api/providers/${provider.id}/enabled`
3. 成功后刷新并显示对应的启用/禁用 Toast

**Core Code**:
```tsx
const handleToggleEnabled = async (provider: Provider) => {
  const nextEnabled = !(provider.enabled ?? true);
  try {
    const response = await fetch(`/furina/api/providers/${provider.id}/enabled`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    triggerRefresh();
    showToast(nextEnabled ? t('toast.providerEnabled') : t('toast.providerDisabled'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to toggle provider enabled state: ${message}`);
    showToast(t('toast.operationFailed', { message }), 'error');
  }
};
```
Source: `src/client/App.tsx` : 219-237

---

### `handleToggleProxy() -> Promise<void>`

**Source**: `src/client/App.tsx` : 239-255

**Functionality**: 切换 Furina 代理（proxy）的全局开关。代理启用时，所有 LLM 请求经过 Furina 代理层进行转发和管理。调用 PUT `/furina/api/providers/proxy` API 切换状态。

**Parameters**: 无参数，函数读取当前 `enableFurinaProxy` 状态并取反。

**Return Value**:
- `Promise<void>`

**Core Logic**:
1. 取反当前 `enableFurinaProxy` 状态
2. PUT 请求到 `/furina/api/providers/proxy`，body 为 `{ enableFurinaProxy: nextState }`
3. 成功时直接更新本地状态（无需 `triggerRefresh`，因为 proxy 状态不涉及 Provider 列表刷新）
4. 失败时记录日志并显示错误 Toast

**Core Code**:
```tsx
const handleToggleProxy = async () => {
  const nextState = !enableFurinaProxy;
  try {
    const response = await fetch('/furina/api/providers/proxy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enableFurinaProxy: nextState }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setEnableFurinaProxy(nextState);
    showToast(nextState ? t('toast.proxyEnabled') : t('toast.proxyDisabled'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to toggle proxy: ${message}`);
    showToast(t('toast.operationFailed', { message }), 'error');
  }
};
```
Source: `src/client/App.tsx` : 239-255

---

### `handleReset() -> Promise<void>`

**Source**: `src/client/App.tsx` : 173-186

**Functionality**: 将 Provider 配置重置为默认值。调用 POST `/furina/api/providers/reset` API，成功后刷新列表并提示用户。

**Parameters**: 无参数。

**Return Value**:
- `Promise<void>`

**Core Logic**:
1. POST 请求到 `/furina/api/providers/reset`
2. 成功时 `triggerRefresh()` + 显示成功 Toast
3. 失败时记录日志并显示错误 Toast

**Core Code**:
```tsx
const handleReset = async () => {
  try {
    const response = await fetch('/furina/api/providers/reset', { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    triggerRefresh();
    showToast(t('toast.configRestored'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to reset providers: ${message}`);
    showToast(t('toast.restoreFailed', { message }), 'error');
  }
};
```
Source: `src/client/App.tsx` : 173-186

---

### `persistActiveView(view: ActivityBarView) -> void`

**Source**: `src/client/App.tsx` : 53-64

**Functionality**: 切换主视图并持久化到 `localStorage`。切换到非 projects 视图时自动清除 `selectedChange`，避免在 providers 视图中残留项目变更数据。

**Parameters**:
- `view` (`ActivityBarView`)：目标视图，`'providers'` 或 `'projects'`。

**Return Value**:
- `void`

**Core Logic**:
1. 尝试写入 `localStorage.setItem('furina:activeView', view)`
2. 若 `localStorage` 不可用（隐私模式等），静默忽略异常
3. 更新 `activeView` 状态
4. 若 `view !== 'projects'`，清除 `selectedChange`

**Core Code**:
```tsx
const persistActiveView = (view: ActivityBarView) => {
  try {
    localStorage.setItem('furina:activeView', view);
  } catch {
    // silent fallback - localStorage unavailable
  }
  setActiveView(view);
  if (view !== 'projects') {
    setSelectedChange(null);
  }
};
```
Source: `src/client/App.tsx` : 53-64

---

### `showToast(text: string, type: ToastType = 'success') -> void`

**Source**: `src/client/App.tsx` : 76-81

**Functionality**: 显示 Toast 通知，2.5 秒后自动消失。用于所有 Provider 操作的结果反馈。

**Parameters**:
- `text` (`string`)：Toast 显示的文本内容，通常来自 i18n 翻译。
- `type` (`ToastType`, 默认 `'success'`)：`'success'` 显示绿色背景 + CheckCircle 图标，`'error'` 显示红色背景 + XCircle 图标。

**Return Value**:
- `void`

**Core Logic**:
1. 设置 `toastMessage` 状态（包含 `text` 和 `type`）
2. 设置 2500ms 后将 `toastMessage` 置为 `null` 的定时器
3. 不清除前一个定时器——快速连续触发时可能产生竞态，但实践中 2.5s 间隔足够覆盖用户感知

**Core Code**:
```tsx
const showToast = useCallback((text: string, type: ToastType = 'success') => {
  setToastMessage({ text, type });
  setTimeout(() => {
    setToastMessage(null);
  }, 2500);
}, []);
```
Source: `src/client/App.tsx` : 76-81

---

### `localeToHtmlLang(locale: Locale | string) -> string`

**Source**: `src/client/i18n/index.ts` : 34-37

**Functionality**: 将 i18next locale 标识符映射为 HTML `lang` 属性值。App 组件通过 `useEffect` 在语言变更时调用此函数同步 `<html lang>`，确保无障碍访问（screen reader）和浏览器语言相关功能正常工作。`'zh-CN'` 映射为 `'zh-CN'`，其他（如 `'en-US'`）映射为 `'en'`。

**Parameters**:
- `locale` (`Locale | string`)：i18next locale 标识符。

**Return Value**:
- `string`：HTML `lang` 属性值。

---

### `initI18n(): Promise<typeof i18next>`

**Source**: `src/client/i18n/index.ts` : 44-76

**Functionality**: 从后端 API 获取默认语言配置，初始化 i18next 并注册翻译资源。是 `bootstrap()` 的前置步骤。若后端不可达，fallback 到 `'chinese'`（`'zh-CN'`）。

**Parameters**: 无参数。

**Return Value**:
- `Promise<typeof i18next>`：已初始化的 i18next 实例。

**Core Logic**:
1. Fetch `/furina/api/config` 获取 `{ language: 'chinese' | 'english' }`
2. 将后端语言映射为 i18next locale（`'chinese'` → `'zh-CN'`，`'english'` → `'en-US'`）
3. 调用 `i18next.use(initReactI18next).init()` 注册中文和英文翻译资源
4. 设置 `fallbackLng: 'zh-CN'`

---

## Data Structures

### `ActivityBarView`
```tsx
export type ActivityBarView = 'providers' | 'projects';
```
- `'providers'`：显示 Provider 管理列表视图
- `'projects'`：显示项目变更管理视图

Source: `src/client/components/ActivityBar.tsx` : 13

### `ToastType`
```tsx
type ToastType = 'success' | 'error';
```
- `'success'`：成功状态，绿色背景 + CheckCircle 图标
- `'error'`：错误状态，红色背景 + XCircle 图标

Source: `src/client/App.tsx` : 25

### `Provider`（客户端引用的类型）
```tsx
export type Provider = z.infer<typeof ProviderSchema>;
// 等价于：
{
  id: string;
  name: string;
  notes?: string;
  websiteUrl?: string;
  apiKey?: string;
  baseUrl?: string;
  icon?: string;
  iconColor?: string;
  usedTemplate?: string;
  defaultModel: string;    // 默认 ''
  sonnetModel: string;     // 默认 ''
  opusModel: string;       // 默认 ''
  haikuModel: string;      // 默认 ''
  enabled: boolean;        // 默认 true
  createdAt: string;
  updatedAt?: string;
}
```
Source: `src/server/providers-store.ts` : 29-49

### `ChangeEntryWithCwd`
```tsx
export type ChangeEntryWithCwd = ChangeEntry & { cwd: string };
```
- 继承 `ChangeEntry` 所有字段，并注入 `cwd` 字段标识所属项目路径。

Source: `src/server/changes/shared.ts` : 19

### CSS Custom Properties（主题色 token）

index.css 在 `:root` 下定义了 shadcn/ui 风格的 HSL 颜色 token，供 Tailwind CSS 通过 `hsl(var(--token))` 引用：

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
}
```
Source: `src/client/index.css` : 31-49

### Keyframe Animations

```css
@keyframes stage-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

@keyframes stage-ring-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
}
```
- `stage-pulse`：Provider 状态指示器的脉冲缩放动画
- `stage-ring-glow`：环形光晕扩散动画，使用蓝色系（`rgba(59, 130, 246, ...)`）

Source: `src/client/index.css` : 13-29

## Error Handling and Edge Cases

**统一错误处理模式**：App 中所有异步操作（fetch API）遵循一致的错误处理模式：
1. 检查 `response.ok`，非 2xx 抛出 `Error(`HTTP ${response.status}`)`
2. catch 块中区分 Error 实例和非 Error 值：`err instanceof Error ? err.message : String(err)`
3. 通过 `logger.error()` 记录日志（浏览器环境下映射到 `console.error`）
4. 通过 `showToast(message, 'error')` 向用户展示错误信息

**localStorage 不可用**：`persistActiveView` 和 `activeView` 初始化函数均用 try-catch 包裹 localStorage 操作。在隐私模式或 localStorage 被禁用的环境下，视图状态降级为内存中的默认值 `'providers'`，不影响应用核心功能。

**后端不可达**：`initI18n` 在后端 API 不可达时 fallback 到 `'zh-CN'`；`fetchActiveProvider` 和 `fetchProxyState` 在后端不可达时仅记录日志，UI 保持默认状态（`activeProviderId: null`，`enableFurinaProxy: false`）。

**Toast 竞态**：`showToast` 使用 `setTimeout` 2.5 秒后清除消息。快速连续触发时，后一个 Toast 会覆盖前一个的显示，但两个定时器都会执行。这意味着最后一个 Toast 显示可能不足 2.5 秒就被清除。当前设计对此不做处理，实际使用中用户操作间隔通常远大于 2.5 秒。

**refreshTrigger 依赖**：`fetchActiveProvider` 的 useEffect 依赖 `refreshTrigger`，每次 Provider 操作成功后递增触发重新拉取。这种"计数器驱动刷新"模式避免了在 effect 中直接依赖多个可变状态导致的多余请求。

## Dependencies

- **Depends on**:
  - `src/client/i18n/index.ts`：i18n 初始化（`initI18n`、`localeToHtmlLang`）
  - `src/client/utils/logger.ts`：浏览器端日志工具
  - `src/client/components/Layout.tsx`：顶层布局容器
  - `src/client/components/ProviderList.tsx`：Provider 列表组件
  - `src/client/components/ProjectSidebar.tsx`：项目侧边栏组件
  - `src/client/components/DetailPanel.tsx`：变更详情面板组件
  - `src/client/components/ActivityBar.tsx`：活动栏（视图切换），提供 `ActivityBarView` 类型
  - `src/client/components/AddProviderDialog.tsx`：添加 Provider 对话框
  - `src/client/components/EditProviderDialog.tsx`：编辑 Provider 对话框
  - `src/client/components/DeleteConfirmDialog.tsx`：删除确认对话框
  - `src/server/providers-store.ts`：`Provider` 类型定义
  - `src/server/changes/shared.ts`：`ChangeEntryWithCwd` 类型定义
  - 外部依赖：`react`、`react-dom/client`、`react-i18next`、`lucide-react`（CheckCircle、XCircle 图标）
- **Depended by**：
  - 本 spec 是应用的根入口，不被其他组件依赖（除 `main.tsx` 直接渲染 `App` 外）

## Usage Examples

### 完整应用启动流程

```tsx
// 1. index.html 定义 HTML 外壳
// <div id="root"></div>
// <script type="module" src="./main.tsx"></script>

// 2. main.tsx 异步引导
import { App } from './App.js';
import { initI18n } from './i18n/index.js';

async function bootstrap(): Promise<void> {
  const i18n = await initI18n();  // 先初始化 i18n
  const rootElement = document.getElementById('root');
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      React.createElement(React.StrictMode, null,
        React.createElement(I18nextProvider, { i18n },
          React.createElement(App)
        )
      )
    );
  }
}
void bootstrap();

// 3. App 组件挂载后自动：
//    - 从后端获取 activeProviderId 和 proxy 状态
//    - 从 localStorage 恢复 activeView
//    - 同步 <html lang> 属性
```

### Provider 操作的典型交互流程

```tsx
// 用户点击"添加 Provider"按钮
handleOpenAddDialog()          // isAddDialogOpen = true
  → AddProviderDialog 渲染
    → 用户填写表单并提交
      → handleAddSuccess()     // triggerRefresh() + showToast('Provider added')
        → fetchActiveProvider() 重新执行，同步 activeProviderId

// 用户点击"设为活跃"按钮
handleSetActive(provider)
  → PUT /furina/api/providers/active { providerId: provider.id }
  → triggerRefresh()
  → showToast('Switched to ProviderName')

// 用户切换视图
persistActiveView('projects')
  → localStorage.setItem('furina:activeView', 'projects')
  → setActiveView('projects')
  → selectedChange 保持 null（用户需在 ProjectSidebar 中选择变更）
```
