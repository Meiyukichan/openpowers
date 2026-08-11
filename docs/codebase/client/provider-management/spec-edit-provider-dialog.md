# Edit Provider Dialog

> Source files:
> - `src/client/components/EditProviderDialog.tsx` : 1-463

## Overview

EditProviderDialog 是一个用于编辑现有 provider 配置的模态对话框组件。当用户在 ProviderCard 上点击编辑按钮时，App 根组件将当前 provider 数据传入此对话框，对话框预填所有表单字段供用户修改，提交时通过 PUT 请求更新后端数据。

**在系统中的定位**：属于 Provider 管理子系统中的 CRUD 对话框之一，与 AddProviderDialog（新增）、DeleteConfirmDialog（删除）并列。EditProviderDialog 复用了 AddProviderDialog 的表单布局（字段名称、输入类型、验证规则），但移除了预设模板选择器（preset selector），因为编辑场景下模板已确定，无需重新选择。

**设计动机**：提供一个独立的编辑入口，使用户可以修改 provider 的名称、备注、网站地址、API Key、Base URL 和各模型配置，而无需删除后重建。编辑对话框独立于新增对话框，职责清晰。

**使用场景**：
- 用户在 ProviderCard 悬停时点击编辑（Pencil）图标
- App 组件将 `editingProvider` 设为当前 provider 对象，触发 `isOpen` 为 true
- 用户修改字段后点击保存，组件调用 PUT API 更新 provider
- 更新成功后触发 `onSuccess` 回调刷新列表并显示成功 toast

**涉及源文件**：
- `src/client/components/EditProviderDialog.tsx`：主组件，包含表单状态、验证、API 调用和渲染逻辑

## Architecture / Flow

```
用户点击编辑按钮
    ↓
App 设置 editingProvider state → EditProviderDialog 收到 isOpen=true + provider 数据
    ↓
useEffect 同步表单值（预填 provider 所有字段）+ 重置 showApiKey/errors/validationResult
    ↓
用户修改字段 → handleChange 更新 form state + 清除对应错误 + 若修改 baseUrl/apiKey 则重置验证结果
    ↓
用户点击验证按钮 → handleValidateApiKey → POST /furina/api/providers/validate
    ↓ (验证通过)
显示模型数量提示
    ↓
用户点击保存 → validate() 客户端验证 → handleSubmit → PUT /furina/api/providers/:id
    ↓ (成功)
onSuccess() + onClose() → App 刷新列表 + 显示成功 toast
    ↓ (失败)
showToast 显示错误信息
```

关闭方式：
- ESC 键（keydown 事件监听）
- 点击遮罩层（backdrop click-to-close，通过 e.target === e.currentTarget 判断）
- 点击取消按钮

## Functionality / Interface Details

### `EditProviderDialog(props: EditProviderDialogProps) -> React.ReactElement | null`

**Source**: `src/client/components/EditProviderDialog.tsx`:43-462

**Functionality**：主组件函数。渲染一个通过 React Portal 挂载到 `document.body` 的模态对话框，包含预填的 provider 编辑表单。当 `isOpen` 为 false 或 `provider` 为 null 时返回 null 不渲染任何内容。表单包含 name、notes、websiteUrl、apiKey（含可见性切换）、baseUrl、defaultModel、sonnetModel、opusModel、haikuModel 共 9 个字段。支持 API Key 验证、客户端必填校验和 PUT 提交。

**Parameters**：
- `isOpen` (`boolean`): 控制对话框是否可见。由父组件 App 通过 `editingProvider !== null` 计算得出。
- `provider` (`Provider | null`): 当前要编辑的 provider 对象。当不为 null 时，表单字段从该对象预填。
- `onClose` (`() => void`): 关闭对话框的回调。App 组件中对应 `handleCloseEditDialog`，将 `editingProvider` 设为 null。
- `onSuccess` (`() => void`): 编辑成功后的回调。App 组件中对应 `handleEditSuccess`，触发列表刷新并显示成功 toast。
- `showToast` (`(text: string, type?: 'success' | 'error') => void`): 显示 toast 消息的回调，用于在验证失败或提交失败时通知用户。

**Return Value**：
- `React.ReactElement | null`: 当 `isOpen` 为 true 且 `provider` 不为 null 时返回 Portal 渲染的模态对话框；否则返回 null。

**Core Logic**：

组件内部通过三个 `useEffect` 管理副作用：
1. **表单同步**（line 63-80）：当 `isOpen` 或 `provider` 变化时，将 provider 的所有字段映射到 form state，同时重置 `showApiKey`、`errors` 和 `validationResult`。字段使用 `|| ''` 处理可选字段的 undefined 情况。
2. **ESC 键监听**（line 83-92）：仅在 `isOpen` 为 true 时注册 keydown 事件，Escape 键触发 `onClose()`。
3. **Body 滚动锁定**（line 95-102）：打开时设置 `document.body.style.overflow = 'hidden'`，关闭时（cleanup）恢复为空字符串。

表单提交流程中，`handleSubmit` 先调用 `validate()` 进行客户端校验（name 和 apiKey 为必填），通过后发送 PUT 请求。请求体中 `notes`、`websiteUrl`、`baseUrl` 在为空时设为 `undefined`（而非空字符串），避免后端存储空值。

API Key 验证通过 `handleValidateApiKey` 调用 POST `/furina/api/providers/validate`，验证成功时显示模型数量，失败时显示错误信息和可选的上游错误详情。

渲染使用 `React.createElement` 而非 JSX，通过 `createPortal` 挂载到 `document.body`。对话框结构为：固定全屏容器 → 居中对齐 wrapper（点击可关闭） → 遮罩层 → 对话框面板（role="dialog"，aria-modal）。

**Core Code**:

```tsx
// 表单同步：预填 provider 数据
useEffect(() => {
  if (isOpen && provider) {
    setForm({
      name: provider.name,
      notes: provider.notes || '',
      websiteUrl: provider.websiteUrl || '',
      apiKey: provider.apiKey || '',
      baseUrl: provider.baseUrl || '',
      defaultModel: provider.defaultModel || '',
      sonnetModel: provider.sonnetModel || '',
      opusModel: provider.opusModel || '',
      haikuModel: provider.haikuModel || '',
    });
    setShowApiKey(false);
    setErrors({});
    setValidationResult(null);
  }
}, [isOpen, provider]);
```
Source: `src/client/components/EditProviderDialog.tsx`:63-80

```tsx
// 表单提交：PUT 更新 provider
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!validate() || !provider) return;
  setSubmitting(true);
  try {
    const response = await fetch(`/furina/api/providers/${provider.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        apiKey: form.apiKey.trim(),
        defaultModel: form.defaultModel.trim(),
        sonnetModel: form.sonnetModel.trim(),
        opusModel: form.opusModel.trim(),
        haikuModel: form.haikuModel.trim(),
        notes: form.notes.trim() || undefined,
        websiteUrl: form.websiteUrl.trim() || undefined,
        baseUrl: form.baseUrl.trim() || undefined,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    onSuccess();
    onClose();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to update provider: ${message}`);
    showToast(t('toast.saveFailed', { message }), 'error');
  } finally {
    setSubmitting(false);
  }
};
```
Source: `src/client/components/EditProviderDialog.tsx`:132-165

**Usage Example**:

```tsx
// App 根组件中的使用方式（简化的 React.createElement 形式）
const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

// 从 ProviderCard 的编辑按钮触发
const handleEditProvider = (provider: Provider) => {
  setEditingProvider(provider);
};

// 渲染 EditProviderDialog
React.createElement(EditProviderDialog, {
  isOpen: editingProvider !== null,
  provider: editingProvider,
  onClose: () => setEditingProvider(null),
  onSuccess: () => {
    triggerRefresh();  // 刷新 provider 列表
    showToast(t('toast.providerSaved'));
  },
  showToast,
})
```
Explanation: App 组件管理 `editingProvider` 状态，当 ProviderCard 触发编辑时将其设为对应 provider 对象，对话框自动打开并预填数据。编辑成功后刷新列表并显示 toast。

---

### `handleChange(field: keyof FormValues) -> (e: React.ChangeEvent) => void`

**Source**: `src/client/components/EditProviderDialog.tsx`:104-118

**Functionality**：高阶函数，返回一个事件处理器用于更新指定表单字段的值。同时在用户修改字段时清除该字段的错误信息，以及在修改 `baseUrl` 或 `apiKey` 时重置 API Key 验证结果。这是表单字段通用的 onChange 处理器，避免了为每个字段编写独立的处理逻辑。

**Parameters**：
- `field` (`keyof FormValues`): 要更新的表单字段名，可选值为 `'name' | 'notes' | 'websiteUrl' | 'apiKey' | 'baseUrl' | 'defaultModel' | 'sonnetModel' | 'opusModel' | 'haikuModel'`。

**Return Value**：
- `(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void`: 实际的事件处理函数，接收 input/textarea 的 change 事件。

**Core Logic**：

1. 提取事件目标的 `value` 值
2. 通过 `setForm` 函数式更新，将对应字段设为新值
3. 若该字段当前存在错误（`errors[field]` 存在），则从 errors 对象中删除该字段的错误
4. 若修改的字段是 `baseUrl` 或 `apiKey`，则将 `validationResult` 重置为 null（因为验证依赖这两个字段，修改后之前的验证结果失效）

**Core Code**:

```tsx
const handleChange = (field: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const value = e.target.value;
  setForm((prev) => ({ ...prev, [field]: value }));
  if (errors[field]) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }
  // Reset validation result when user modifies baseUrl or apiKey
  if (field === 'baseUrl' || field === 'apiKey') {
    setValidationResult(null);
  }
};
```
Source: `src/client/components/EditProviderDialog.tsx`:104-118

**Usage Example**:

```tsx
// 在表单字段上的使用
React.createElement('input', {
  type: 'text',
  value: form.name,
  onChange: handleChange('name'),
  className: `${inputClass} ${errors.name ? 'border-destructive' : ''}`,
})

// apiKey 字段修改后，validationResult 会被自动重置
React.createElement('input', {
  type: showApiKey ? 'text' : 'password',
  value: form.apiKey,
  onChange: handleChange('apiKey'),
})
```
Explanation: 通过柯里化模式，`handleChange('name')` 返回绑定了 `field='name'` 的事件处理器。用户修改 apiKey 字段时，不仅更新值和清除错误，还会使之前的 API Key 验证结果失效。

---

### `validate() -> boolean`

**Source**: `src/client/components/EditProviderDialog.tsx`:120-130

**Functionality**：客户端表单验证函数。在提交前检查必填字段是否已填写。与 AddProviderDialog 一致，仅验证 `name` 和 `apiKey` 两个必填字段。其他字段（notes、websiteUrl、baseUrl、模型名等）均为可选。

**Parameters**：无

**Return Value**：
- `boolean`: 验证通过返回 true，否则返回 false 并在 `errors` state 中设置对应错误信息。

**Core Logic**：

1. 创建 `newErrors` 空对象
2. 检查 `form.name.trim()` 是否为空，为空则添加 `name` 错误，错误消息使用 i18n key `editProvider.validationNameRequired`
3. 检查 `form.apiKey.trim()` 是否为空，为空则添加 `apiKey` 错误，错误消息使用 i18n key `editProvider.validationApiKeyRequired`
4. 将 newErrors 设置到 `errors` state
5. 返回 `Object.keys(newErrors).length === 0`

**Core Code**:

```tsx
const validate = (): boolean => {
  const newErrors: Record<string, string> = {};
  if (!form.name.trim()) {
    newErrors.name = t('editProvider.validationNameRequired');
  }
  if (!form.apiKey.trim()) {
    newErrors.apiKey = t('editProvider.validationApiKeyRequired');
  }
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```
Source: `src/client/components/EditProviderDialog.tsx`:120-130

**Usage Example**:

```tsx
// 在 handleSubmit 中作为前置校验
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!validate() || !provider) return;  // 校验不通过则直接返回
  // ... 继续提交逻辑
};
```
Explanation: `validate()` 在表单提交时作为第一个守卫条件调用。若返回 false，handleSubmit 直接 return，不会发起 API 请求。验证失败的字段会在输入框下方显示红色错误提示。

---

### `handleValidateApiKey() -> Promise<void>`

**Source**: `src/client/components/EditProviderDialog.tsx`:167-198

**Functionality**：异步函数，调用后端 `/furina/api/providers/validate` 端点验证当前表单中的 baseUrl 和 apiKey 组合是否有效。验证成功时显示可用模型数量，失败时显示错误信息。与 AddProviderDialog 中的验证逻辑一致。

**Parameters**：无（使用表单中的 `form.baseUrl` 和 `form.apiKey`）

**Return Value**：
- `Promise<void>`: 无返回值，结果通过 `validationResult` state 反映。

**Core Logic**：

1. 设置 `validating` 为 true，清除之前的 `validationResult`
2. 发送 POST 请求到 `/furina/api/providers/validate`，body 包含 `baseUrl` 和 `apiKey`（均 trim）
3. 若 HTTP 响应不 OK：
   - 尝试解析 JSON 获取 error 消息
   - 设置 `validationResult` 为 `{ valid: false, error: ... }`
4. 若 HTTP 响应 OK 且 `data.valid` 为 true：
   - 设置 `validationResult` 为 `{ valid: true, models: data.models || [] }`
5. 若 HTTP 响应 OK 但 `data.valid` 为 false：
   - 设置 `validationResult` 为 `{ valid: false, error: ..., upstreamError: ... }`（upstreamError 为可选的上游错误详情）
6. 网络异常（catch）：设置 `validationResult` 为 `{ valid: false, error: t('common.validate.validateTimeout') }`
7. finally 块中设置 `validating` 为 false

**Core Code**:

```tsx
const handleValidateApiKey = async () => {
  setValidating(true);
  setValidationResult(null);
  try {
    const response = await fetch('/furina/api/providers/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      logger.error(`Failed to validate API key: ${data.error || `HTTP ${response.status}`}`);
      setValidationResult({ valid: false, error: data.error || t('common.validate.validateFailed') });
      return;
    }
    const data = await response.json();
    if (data.valid) {
      setValidationResult({ valid: true, models: data.models || [] });
    } else {
      setValidationResult({ valid: false, error: data.error || t('common.validate.validateError'), upstreamError: data.upstreamError });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to validate API key: ${message}`);
    setValidationResult({ valid: false, error: t('common.validate.validateTimeout') });
  } finally {
    setValidating(false);
  }
};
```
Source: `src/client/components/EditProviderDialog.tsx`:167-198

**Usage Example**:

```tsx
// 验证按钮：仅当 baseUrl 和 apiKey 都非空且不在验证中时才可点击
React.createElement(
  'button',
  {
    type: 'button',
    onClick: handleValidateApiKey,
    disabled: !form.baseUrl.trim() || !form.apiKey.trim() || validating,
    className: 'inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
  },
  validating ? t('common.validate.validating') : t('common.validate.validateButton'),
)
// 验证结果展示
// 成功：显示 "验证成功，发现 N 个可用模型"
// 失败：显示红色错误信息 + 可选的 upstreamError 详情（pre 标签）
```
Explanation: 用户填写 baseUrl 和 apiKey 后可点击验证按钮，确认 API 连接是否有效。验证按钮在 baseUrl 或 apiKey 为空时禁用。验证过程中按钮文字变为"验证中..."。

## Data Structures

### `EditProviderDialogProps`

```tsx
interface EditProviderDialogProps {
  isOpen: boolean;
  provider: Provider | null;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}
```
- `isOpen` (`boolean`): 控制对话框显示/隐藏
- `provider` (`Provider | null`): 要编辑的 provider 对象，包含所有字段数据
- `onClose` (`() => void`): 关闭回调
- `onSuccess` (`() => void`): 成功回调，用于触发列表刷新
- `showToast` (`(text: string, type?: 'success' | 'error') => void`): Toast 消息回调

### `FormValues`

```tsx
interface FormValues {
  name: string;
  notes: string;
  websiteUrl: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  sonnetModel: string;
  opusModel: string;
  haikuModel: string;
}
```
- `name` (`string`): Provider 名称（必填）
- `notes` (`string`): 备注说明（可选）
- `websiteUrl` (`string`): Provider 网站地址（可选）
- `apiKey` (`string`): API 密钥（必填，password 输入框，支持可见性切换）
- `baseUrl` (`string`): API 基础地址（可选，用于 API Key 验证和请求路由）
- `defaultModel` (`string`): 默认模型标识（可选）
- `sonnetModel` (`string`): Sonnet 模型标识（可选）
- `opusModel` (`string`): Opus 模型标识（可选）
- `haikuModel` (`string`): Haiku 模型标识（可选）

### `Provider`（外部依赖类型）

```tsx
// 定义于 src/server/providers-store.ts
export type Provider = {
  id: string;
  name: string;
  notes?: string;
  websiteUrl?: string;
  apiKey?: string;
  baseUrl?: string;
  icon?: string;
  iconColor?: string;
  usedTemplate?: string;
  defaultModel: string;
  sonnetModel: string;
  opusModel: string;
  haikuModel: string;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
};
```
- 由 Zod schema `ProviderSchema` 推断而来，定义于 `src/server/providers-store.ts`:29-46
- EditProviderDialog 仅使用其中的表单相关字段（name、notes、websiteUrl、apiKey、baseUrl、defaultModel、sonnetModel、opusModel、haikuModel）和 id

## Error Handling and Edge Cases

**客户端验证**：
- 仅验证 `name` 和 `apiKey` 两个必填字段，使用 trim 后的空字符串判断
- 验证失败时在对应输入框下方显示红色错误提示文字
- 验证错误会在用户修改对应字段时自动清除（`handleChange` 中实现）

**提交错误**：
- HTTP 非 2xx 响应时抛出 `Error('HTTP {status}')`
- 网络异常或其他错误在 catch 块中捕获
- 所有错误通过 `logger.error` 记录日志，并通过 `showToast` 显示错误 toast（使用 i18n key `toast.saveFailed`，包含错误消息参数）
- finally 块确保 `submitting` 状态始终重置

**API Key 验证错误**：
- HTTP 非 OK：尝试解析 JSON 获取 error 消息，解析失败则使用默认错误文案
- 业务验证失败（`data.valid === false`）：显示 error 消息，若有 `upstreamError` 则在下方用 `<pre>` 标签展示详情
- 网络超时或异常：显示超时错误文案（`common.validate.validateTimeout`）

**边界情况**：
- `provider` 为 null 时：组件返回 null，不渲染任何内容
- `isOpen` 为 false 时：组件返回 null
- Provider 的可选字段（notes、websiteUrl、apiKey、baseUrl 等）可能为 undefined，通过 `|| ''` 统一处理为空字符串
- 提交时可选字段 trim 后为空则转为 `undefined`，避免后端存储空字符串
- 修改 baseUrl 或 apiKey 后，之前的 API Key 验证结果自动失效（`handleChange` 中重置 `validationResult` 为 null）
- 提交按钮在 submitting 状态下禁用，防止重复提交
- 取消按钮在 submitting 状态下同样禁用
- 验证按钮在 baseUrl 或 apiKey 为空时禁用

## Dependencies

**Depends on**:
- `Provider` 类型（来自 `src/server/providers-store.ts`）：provider 数据结构定义
- `react`：useState、useEffect、createPortal 等核心 hooks
- `react-dom`：createPortal 用于 Portal 渲染
- `react-i18next`：useTranslation 用于国际化文本
- `lucide-react`：Eye、EyeOff 图标用于 API Key 可见性切换
- `../utils/logger.ts`：浏览器端日志工具（error 级别）
- 后端 API：
  - `PUT /furina/api/providers/:id`：更新 provider
  - `POST /furina/api/providers/validate`：验证 API Key 有效性

**Depended by**：
- `App.tsx`（`src/client/App.tsx`）：根组件渲染 EditProviderDialog，管理其 isOpen/provider 状态
- `ProviderCard.tsx`：通过回调触发 App 设置 editingProvider，间接触发对话框打开

## Usage Examples

### 基本集成（App 组件中的使用）

```tsx
import { EditProviderDialog } from './components/EditProviderDialog.js';
import type { Provider } from '../server/providers-store.js';

function App() {
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 从 ProviderCard 的编辑按钮触发
  const handleEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
  };

  // 关闭对话框
  const handleCloseEditDialog = () => {
    setEditingProvider(null);
  };

  // 编辑成功：刷新列表 + 显示 toast
  const handleEditSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
    showToast(t('toast.providerSaved'));
  };

  return React.createElement(EditProviderDialog, {
    isOpen: editingProvider !== null,
    provider: editingProvider,
    onClose: handleCloseEditDialog,
    onSuccess: handleEditSuccess,
    showToast,
  });
}
```

Explanation:
1. App 组件通过 `editingProvider` state 控制对话框开关：非 null 时打开，null 时关闭
2. ProviderCard 的编辑按钮调用 `handleEditProvider`，将选中的 provider 传入
3. 对话框自动预填 provider 的所有字段，用户修改后提交
4. 成功时 `handleEditSuccess` 递增 `refreshTrigger` 以触发 ProviderList 重新获取数据
5. `handleCloseEditDialog` 将 state 重置为 null 以关闭对话框
