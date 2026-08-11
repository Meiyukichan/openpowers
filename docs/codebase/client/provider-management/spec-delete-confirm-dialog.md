# DeleteConfirmDialog

> Source files:
> - `src/client/components/DeleteConfirmDialog.tsx` : 1-156

## Overview

DeleteConfirmDialog 是 Provider 删除确认对话框组件，在用户请求删除某个 provider 之前弹出二次确认模态框，防止误操作导致数据丢失。该组件在系统中位于 provider 管理流程的最后一个环节：用户在 ProviderList 中点击删除按钮后，App 组件将待删除的 provider 设置到 `deletingProvider` 状态，进而打开 DeleteConfirmDialog。

**设计动机**：Provider 的删除是不可逆操作，需要在执行前提供明确的确认步骤。对话框中展示待删除 provider 的名称，让用户清楚知道即将被删除的对象，同时在确认按钮上提供 loading 状态以防止重复提交。

**使用场景**：
- 用户在 ProviderList 中点击某个 provider 的删除操作时触发
- App 组件通过 `deletingProvider !== null` 控制对话框的打开/关闭

**涉及文件及职责**：
- `src/client/components/DeleteConfirmDialog.tsx`：删除确认对话框的核心组件，负责 UI 渲染、键盘事件处理、滚动锁定以及删除 API 调用
- `src/client/App.tsx`：父组件，管理 `deletingProvider` 状态，传入 dialog props 并处理删除成功后的刷新和 toast 提示

## Architecture / Flow

```
用户点击删除
      │
      ▼
App: setDeletingProvider(provider)
      │
      ▼
DeleteConfirmDialog 打开 (isOpen=true)
      │
      ├── 用户点击「取消」/ ESC / 背景遮罩 ──→ onClose() ──→ App: setDeletingProvider(null)
      │
      └── 用户点击「确认删除」
              │
              ▼
      handleConfirm() 异步调用
              │
              ├── setDeleting(true)  ──→ 按钮变为 loading 状态（disabled + 文字变更）
              │
              ├── fetch DELETE /furina/api/providers/:id
              │       │
              │       ├── 成功 (response.ok) ──→ onSuccess() + onClose()
              │       │                              │
              │       │                              ▼
              │       │                     App: 刷新列表 + 显示成功 toast
              │       │
              │       └── 失败 ──→ logger.error + showToast(error)
              │
              └── setDeleting(false)  ──→ 恢复按钮状态
```

## Functionality / Interface Details

### `DeleteConfirmDialog({ isOpen, provider, onClose, onSuccess, showToast }) -> ReactElement | null`

**Source**: `src/client/components/DeleteConfirmDialog.tsx`:30-155

**Functionality**: 渲染一个删除确认模态对话框。当 `isOpen` 为 true 且 `provider` 不为 null 时，通过 React Portal 挂载到 `document.body`，展示警告图标、确认标题、包含 provider 名称的确认消息，以及取消/确认两个操作按钮。确认操作会异步调用 DELETE API，成功后触发 `onSuccess` 和 `onClose` 回调，失败时通过 `showToast` 显示错误提示。组件内部处理 ESC 键关闭、背景点击关闭和 body 滚动锁定。

**Parameters**:
- `isOpen` (`boolean`): 控制对话框是否打开。当为 `false` 或 `provider` 为 `null` 时，组件返回 `null`（不渲染）。由父组件 App 通过 `deletingProvider !== null` 计算得出。
- `provider` (`Provider | null`): 待删除的 provider 对象，包含 `id` 和 `name` 等字段。为 `null` 时不渲染。`id` 用于拼接 DELETE API URL，`name` 用于显示在确认消息中。
- `onClose` (`() => void`): 关闭对话框的回调函数。在以下场景被调用：用户点击取消按钮、点击背景遮罩、按 ESC 键、删除成功后。父组件 App 在此回调中将 `deletingProvider` 设为 `null`。
- `onSuccess` (`() => void`): 删除成功后的回调函数。在 DELETE API 返回成功（`response.ok`）后调用，父组件 App 在此回调中刷新 provider 列表并显示成功 toast。
- `showToast` (`(text: string, type?: 'success' | 'error') => void`): 显示 toast 通知的回调函数。删除失败时用于显示错误信息，`type` 设为 `'error'`。

**Return Value**:
- `React.ReactElement | null`: 当 `isOpen` 为 false 或 `provider` 为 null 时返回 `null`，否则返回通过 `createPortal` 渲染到 `document.body` 的模态对话框元素。

**Core Logic**:

组件内部有三个核心逻辑块：

1. **ESC 键关闭监听**：通过 `useEffect` 在 `isOpen` 为 true 时注册 `keydown` 事件监听器，按下 Escape 键时调用 `onClose()`。依赖数组为 `[isOpen, onClose]`，确保在对话框关闭或回调变更时正确清理和重建监听器。

2. **Body 滚动锁定**：通过 `useEffect` 在 `isOpen` 为 true 时将 `document.body.style.overflow` 设为 `'hidden'`，防止背景页面滚动。清理函数将其恢复为空字符串（默认值）。

3. **删除确认处理** (`handleConfirm`)：异步函数，先检查 `provider` 是否存在，然后设置 `deleting` 为 true 以进入 loading 状态。调用 `fetch` 发送 DELETE 请求到 `/furina/api/providers/${provider.id}`。成功时依次调用 `onSuccess()` 和 `onClose()`；失败时通过 `logger.error` 记录错误并通过 `showToast` 显示国际化错误消息。无论成功失败，`finally` 块都将 `deleting` 恢复为 false。

4. **Portal 渲染**：使用 `React.createElement` 而非 JSX 语法构建 DOM 结构。通过 `createPortal` 将模态框渲染到 `document.body`，确保其脱离父组件 DOM 层级。对话框面板设置了 `role="dialog"` 和 `aria-modal=true` 属性以支持无障碍访问，背景遮罩的点击事件调用 `onClose()`，对话框面板自身的点击事件通过 `e.stopPropagation()` 阻止冒泡到遮罩层。

**Core Code**:
```typescript
const handleConfirm = async () => {
  if (!provider) return;

  setDeleting(true);
  try {
    const response = await fetch(`/furina/api/providers/${provider.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    onSuccess();
    onClose();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to delete provider: ${message}`);
    showToast(t('toast.deleteFailed', { message }), 'error');
  } finally {
    setDeleting(false);
  }
};
```
Source: `src/client/components/DeleteConfirmDialog.tsx`:56-76

**Usage Example**:
```tsx
// 在 App 组件中使用 DeleteConfirmDialog
const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);

const handleCloseDeleteDialog = () => {
  setDeletingProvider(null);
};

const handleDeleteSuccess = () => {
  triggerRefresh();  // 刷新 provider 列表
  showToast(t('toast.providerDeleted'));  // 显示成功提示
};

// 渲染
React.createElement(DeleteConfirmDialog, {
  isOpen: deletingProvider !== null,
  provider: deletingProvider,
  onClose: handleCloseDeleteDialog,
  onSuccess: handleDeleteSuccess,
  showToast,
});
```
Explanation: App 组件通过 `deletingProvider` 状态控制对话框的打开和关闭。当 `deletingProvider` 不为 null 时 `isOpen` 为 true，对话框打开。关闭时将状态重置为 null。删除成功后触发列表刷新和 toast 提示。

---

### `DeleteConfirmDialogProps` (Interface)

**Source**: `src/client/components/DeleteConfirmDialog.tsx`:18-24

**Functionality**: 定义 DeleteConfirmDialog 组件的 props 类型，约束组件的输入参数。

**Parameters**:
- `isOpen` (`boolean`): 对话框打开状态
- `provider` (`Provider | null`): 待删除的 provider 对象
- `onClose` (`() => void`): 关闭回调
- `onSuccess` (`() => void`): 删除成功回调
- `showToast` (`(text: string, type?: 'success' | 'error') => void`): Toast 通知回调

## Data Structures

### `Provider`

定义在 `src/server/providers-store.ts`，通过 Zod schema 推断得出：

```typescript
export const ProviderSchema = z.object({
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
});

export type Provider = z.infer<typeof ProviderSchema>;
```
- `id` (`string`): Provider 唯一标识符（UUID），用于 DELETE API URL 中的路径参数
- `name` (`string`): Provider 名称，显示在确认消息中
- 其他字段：apiKey、baseUrl、各种 model 字段等配置信息，在删除确认对话框中不直接使用

### i18n 键值

DeleteConfirmDialog 使用以下国际化键值：

| 键 | 中文 | 英文 |
|---|---|---|
| `deleteConfirm.dialogAriaLabel` | 删除确认对话框 | Delete confirmation dialog |
| `deleteConfirm.closeAriaLabel` | 关闭对话框 | Close dialog |
| `deleteConfirm.confirmTitle` | 确定要删除该供应商吗？ | Delete this provider? |
| `deleteConfirm.confirmMessage` | "{{name}}" 将被永久删除，此操作无法撤销。 | "{{name}}" will be permanently removed. This action cannot be undone. |
| `deleteConfirm.cancel` | 取消 | Cancel |
| `deleteConfirm.deleting` | 正在删除... | Deleting... |
| `deleteConfirm.confirmDelete` | 确认删除 | Confirm Delete |

## Error Handling and Edge Cases

**API 调用错误处理**：
- `fetch` 请求失败（网络错误、非 2xx 响应）时，通过 `catch` 块捕获错误
- 使用 `logger.error` 记录错误日志
- 通过 `showToast` 向用户显示国际化错误消息（`toast.deleteFailed`，包含具体错误信息）
- `finally` 块确保无论成功失败都重置 `deleting` 状态，避免按钮永久卡在 loading 状态

**防护性逻辑**：
- `handleConfirm` 开头检查 `if (!provider) return`，防止空 provider 时发起请求
- 组件渲染时检查 `if (!isOpen || !provider) return null`，双重条件保护
- 确认和取消按钮在 `deleting` 为 true 时均设置为 `disabled`，防止重复提交或在删除过程中关闭对话框

**键盘和交互处理**：
- ESC 键通过 `useEffect` 注册全局事件监听，仅在 `isOpen` 时生效，关闭时自动清理
- 背景遮罩点击调用 `onClose()` 关闭对话框
- 对话框面板通过 `e.stopPropagation()` 阻止点击事件冒泡到背景遮罩
- Body 滚动锁定通过 `useEffect` + cleanup 确保在组件卸载时恢复

## Dependencies

**Depends on**:
- `react` (React, useState, useEffect)：核心 React hooks
- `react-dom` (createPortal)：Portal 渲染
- `react-i18next` (useTranslation)：国际化
- `lucide-react` (Trash2)：删除图标
- `../../server/providers-store.js` (Provider 类型)：provider 数据类型定义
- `../utils/logger.js` (logger)：浏览器端日志工具

**Depended by**:
- `src/client/App.tsx`：父组件，在 provider 管理布局中渲染此对话框，管理 `deletingProvider` 状态并传入 props

**服务端关联**:
- `DELETE /furina/api/providers/:id`（`src/server/routes/providers.ts`:371-383）：对应的服务端路由，调用 `deleteProvider()` 从存储中移除 provider，并在删除的是活跃 provider 且代理未启用时恢复 Claude 设置

## Usage Examples

### 基本使用方式

```tsx
// 1. 在 App 组件中管理状态
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog.js';
import type { Provider } from '../server/providers-store.js';

function App() {
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);

  // 2. 打开对话框（通常由 ProviderList 的 onDelete 回调触发）
  const handleOpenDeleteDialog = (provider: Provider) => {
    setDeletingProvider(provider);
  };

  // 3. 关闭对话框
  const handleCloseDeleteDialog = () => {
    setDeletingProvider(null);
  };

  // 4. 删除成功后的处理
  const handleDeleteSuccess = () => {
    triggerRefresh();  // 刷新 provider 列表
    showToast(t('toast.providerDeleted'));  // 显示成功 toast
  };

  // 5. 渲染对话框
  return React.createElement(DeleteConfirmDialog, {
    isOpen: deletingProvider !== null,
    provider: deletingProvider,
    onClose: handleCloseDeleteDialog,
    onSuccess: handleDeleteSuccess,
    showToast,
  });
}
```

**完整流程说明**：

1. 用户在 ProviderList 中点击某个 provider 的删除按钮，触发 `onDelete` 回调
2. App 组件的 `handleOpenDeleteDialog(provider)` 将该 provider 存入 `deletingProvider` 状态
3. `deletingProvider !== null` 使 `isOpen` 为 true，DeleteConfirmDialog 渲染并显示模态框
4. 对话框展示警告图标、确认标题和包含 provider 名称的确认消息
5. 用户有两种选择：
   - 点击「取消」/ ESC 键 / 背景遮罩 → 调用 `onClose()` → 对话框关闭
   - 点击「确认删除」→ 调用 `handleConfirm()` → 发送 DELETE 请求
6. DELETE 成功：调用 `onSuccess()`（刷新列表 + toast）和 `onClose()`（关闭对话框）
7. DELETE 失败：显示错误 toast，对话框保持打开，用户可重试
