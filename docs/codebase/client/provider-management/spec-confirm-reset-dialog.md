# ConfirmResetDialog

> Source files:
> - `src/client/components/ConfirmResetDialog.tsx` : 1-133

## Overview

ConfirmResetDialog 是一个通用的模态确认对话框组件，用于在用户执行破坏性或重要操作前进行二次确认。当前主要用于 Layout 组件中的"重置供应商配置"操作，但其设计具有通用性，可适用于任何需要用户确认的场景。

**设计动机**：破坏性操作（如重置配置、删除数据）一旦执行难以撤销，因此需要在执行前通过明确的模态对话框向用户展示操作说明，并等待用户主动确认。ConfirmResetDialog 通过 Props 接收标题、消息内容和按钮标签，将"展示确认 UI"这一通用关注点从业务组件中剥离出来，实现可复用。

**使用场景**：
- Layout 组件中，用户点击"重置供应商"按钮后弹出对话框，确认是否还原 Claude 默认配置
- 任何需要二次确认的破坏性/重要操作

**文件职责**：
- `src/client/components/ConfirmResetDialog.tsx` — 对话框组件实现，包括 Portal 渲染、ESC 键关闭、背景遮罩点击关闭、body 滚动锁定

## Architecture / Flow

```
User action (e.g. click reset button)
       │
       ▼
Parent component sets isOpen = true
       │
       ▼
ConfirmResetDialog renders via createPortal into document.body
  ├── Background overlay (click to cancel)
  ├── Dialog card (role="dialog", aria-modal="true")
  │   ├── Header section (title)
  │   ├── Body section (message)
  │   └── Footer section (Cancel / Confirm buttons)
  └── Side effects: ESC key listener, body scroll lock
       │
       ▼
User clicks Confirm → onConfirm() called
User clicks Cancel / ESC / overlay → onCancel() called
       │
       ▼
Parent component sets isOpen = false → dialog unmounts
```

## Functionality / Interface Details

### `ConfirmResetDialog(props: ConfirmResetDialogProps) -> React.ReactElement | null`

**Source**: `src/client/components/ConfirmResetDialog.tsx` : 28-132

**Functionality**: ConfirmResetDialog 是一个函数式 React 组件，渲染一个居中的小型模态对话框。当 `isOpen` 为 `false` 时返回 `null`，不渲染任何 DOM 节点。当 `isOpen` 为 `true` 时，通过 React Portal 将对话框渲染到 `document.body`，确保其在 DOM 层级上覆盖所有内容。

该组件的核心职责是：
1. 提供清晰的确认/取消交互，避免用户误操作
2. 遵循无障碍访问规范（`role="dialog"`、`aria-modal`、`aria-label`）
3. 支持键盘 ESC 快捷取消
4. 开启时锁定页面背景滚动
5. 支持自定义标题、消息和按钮文案（含 i18n 回退）

**Parameters**:
- `isOpen` (`boolean`): 控制对话框是否显示。为 `false` 时组件不渲染任何内容（返回 `null`）。
- `title` (`string`): 对话框标题，显示在顶部 header 区域。同时作为 `aria-label` 用于无障碍访问。
- `message` (`string`): 对话框正文消息，显示在标题下方，用于说明即将执行的操作。
- `confirmLabel` (`string`, 可选): 确认按钮文案。未提供时回退到 i18n 翻译键 `confirmDialog.confirm`（中文为"确定"，英文为"Confirm"）。
- `cancelLabel` (`string`, 可选): 取消按钮文案。未提供时回退到 i18n 翻译键 `confirmDialog.cancel`（中文为"取消"，英文为"Cancel"）。
- `onConfirm` (`() => void`): 用户点击确认按钮时的回调函数。
- `onCancel` (`() => void`): 用户点击取消按钮、按 ESC 键或点击背景遮罩时的回调函数。

**Return Value**:
- `React.ReactElement | null`: 当 `isOpen` 为 `false` 时返回 `null`；为 `true` 时返回 Portal 渲染的对话框元素。

**Core Logic**:

组件内部包含三个核心逻辑块：

1. **按钮文案回退**：使用 `useTranslation` 获取 i18n 的 `t` 函数，将 `confirmLabel` 和 `cancelLabel` 通过空值合并运算符 `??` 进行回退，确保即使父组件未传入按钮文案也能展示默认翻译。

2. **ESC 键监听**：通过 `useEffect` 注册 `keydown` 事件监听器。仅在 `isOpen` 为 `true` 时注册，组件卸载或 `isOpen` 变化时自动清理。按 ESC 键触发 `onCancel()`。

3. **Body 滚动锁定**：通过 `useEffect` 在 `isOpen` 为 `true` 时设置 `document.body.style.overflow = 'hidden'`，在 effect cleanup 时恢复为空字符串，防止对话框打开时背景页面可滚动。

渲染结构使用 `React.createElement` 而非 JSX，通过 `createPortal` 挂载到 `document.body`。对话框外层有一个全屏覆盖层，点击覆盖层（通过检测 `e.target === e.currentTarget`）触发 `onCancel()`，实现"点击背景关闭"。对话框卡片自身通过 `e.stopPropagation()` 阻止事件冒泡，防止点击对话框内容时误触关闭。

**Core Code**:
```tsx
// ESC key cancels
useEffect(() => {
  if (!isOpen) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isOpen, onCancel]);

// Lock body scroll when open
useEffect(() => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  }
  return () => {
    document.body.style.overflow = '';
  };
}, [isOpen]);
```
Source: `src/client/components/ConfirmResetDialog.tsx` : 42-61

**Usage Example**:
```tsx
// 在父组件中使用 ConfirmResetDialog
const [showConfirmReset, setShowConfirmReset] = useState(false);

const handleResetClick = () => {
  setShowConfirmReset(true);
};

const handleResetConfirm = () => {
  setShowConfirmReset(false);
  onReset();
};

const handleResetCancel = () => {
  setShowConfirmReset(false);
};

// 渲染（使用 React.createElement 语法）
React.createElement(ConfirmResetDialog, {
  isOpen: showConfirmReset,
  title: t('layout.confirmResetTitle'),       // "确认还原" / "Confirm Reset"
  message: t('layout.confirmResetMessage'),    // "是否还原Claude配置？" / "Reset to Claude default configuration?"
  onConfirm: handleResetConfirm,
  onCancel: handleResetCancel,
});
```
Explanation: 父组件通过 `showConfirmReset` 状态控制对话框的显示/隐藏。点击重置按钮时将状态设为 `true`，对话框弹出。用户确认后先关闭对话框再执行 `onReset()` 业务逻辑，用户取消则仅关闭对话框。此处未传入 `confirmLabel` 和 `cancelLabel`，组件会自动使用 i18n 默认翻译。

---

### `ConfirmResetDialogProps` 接口

**Source**: `src/client/components/ConfirmResetDialog.tsx` : 14-22

**Functionality**: 定义 ConfirmResetDialog 组件的 Props 类型，明确组件的外部契约。

**Fields**:
- `isOpen` (`boolean`): 必填，控制对话框可见性。
- `title` (`string`): 必填，对话框标题文本。
- `message` (`string`): 必填，对话框正文说明文本。
- `confirmLabel` (`string`, 可选): 确认按钮文本，有 i18n 回退默认值。
- `cancelLabel` (`string`, 可选): 取消按钮文本，有 i18n 回退默认值。
- `onConfirm` (`() => void`): 必填，确认操作回调。
- `onCancel` (`() => void`): 必填，取消操作回调。

## Data Structures

### `ConfirmResetDialogProps`
```tsx
interface ConfirmResetDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```
- `isOpen` (`boolean`): 控制对话框是否渲染和显示。`false` 时组件返回 `null`，不产生任何 DOM 节点。
- `title` (`string`): 对话框标题，显示在 header 区域的 `<h2>` 元素中，同时用作 `aria-label`。
- `message` (`string`): 对话框消息正文，显示在 body 区域的 `<p>` 元素中。
- `confirmLabel` (`string?`): 可选的确认按钮文本。未提供时使用 `t('confirmDialog.confirm')` 回退。
- `cancelLabel` (`string?`): 可选的取消按钮文本。未提供时使用 `t('confirmDialog.cancel')` 回退。
- `onConfirm` (`() => void`): 确认回调。由确认按钮的 `onClick` 触发。
- `onCancel` (`() => void`): 取消回调。由取消按钮点击、ESC 键按下、或背景遮罩点击触发。

### i18n 翻译键

| 翻译键 | 中文 (zh-CN) | 英文 (en-US) |
|---|---|---|
| `confirmDialog.confirm` | 确定 | Confirm |
| `confirmDialog.cancel` | 取消 | Cancel |
| `layout.confirmResetTitle` | 确认还原 | Confirm Reset |
| `layout.confirmResetMessage` | 是否还原Claude配置？ | Reset to Claude default configuration? |

## Error Handling and Edge Cases

- **`isOpen = false` 时无副作用**：组件在 `isOpen` 为 `false` 时直接返回 `null`，两个 `useEffect` 均不会注册事件监听或修改 body 样式（ESC 监听的 effect 通过 `if (!isOpen) return` 提前退出，body 滚动锁定的 effect 在 `isOpen` 为 `false` 时不设置 `overflow`）。
- **ESC 键清理**：`keydown` 事件监听器在 effect cleanup 中正确移除，防止内存泄漏或多次触发。`onCancel` 函数在 useEffect 依赖数组中，确保使用最新的回调引用。
- **Body 滚动恢复**：scroll lock effect 的 cleanup 函数会将 `document.body.style.overflow` 恢复为空字符串，无论对话框是通过确认、取消还是其他方式关闭。
- **背景点击判定**：通过 `e.target === e.currentTarget` 精确判断用户点击的是覆盖层而非对话框内容，避免误关闭。对话框卡片通过 `e.stopPropagation()` 阻止冒泡。
- **无障碍访问**：对话框设置了 `role="dialog"`、`aria-modal="true"` 和 `aria-label={title}`，覆盖层设置了 `aria-hidden="true"`，符合 WAI-ARIA 模态对话框规范。

## Dependencies

- **Depends on**:
  - `react` — `useEffect` Hook、`React.createElement`、`createPortal`
  - `react-dom` — `createPortal`，用于将对话框挂载到 `document.body`
  - `react-i18next` — `useTranslation` Hook，用于获取 `t` 翻译函数并回退按钮文案默认值
  - i18n 翻译文件（`src/client/i18n/locales/en-US.json`、`src/client/i18n/locales/zh-CN.json`） — 提供 `confirmDialog.confirm`、`confirmDialog.cancel` 等翻译键

- **Depended by**:
  - `spec-layout.md`（Layout 组件） — Layout 在头部"重置供应商"按钮点击后控制 ConfirmResetDialog 的 `isOpen` 状态，传入标题和消息文案

## Usage Examples

### 基本用法：带默认按钮文案

```tsx
import { ConfirmResetDialog } from './ConfirmResetDialog.js';

function ParentComponent() {
  const [showDialog, setShowDialog] = useState(false);

  return React.createElement('div', null,
    React.createElement('button', {
      onClick: () => setShowDialog(true),
    }, '重置配置'),
    React.createElement(ConfirmResetDialog, {
      isOpen: showDialog,
      title: '确认重置',
      message: '此操作将清除所有自定义配置，恢复默认状态。',
      onConfirm: () => {
        setShowDialog(false);
        // 执行重置逻辑
      },
      onCancel: () => setShowDialog(false),
    }),
  );
}
```
Explanation: 此示例展示最基本的使用方式。`confirmLabel` 和 `cancelLabel` 均未传入，组件会自动使用 i18n 翻译的默认按钮文案（中文环境下为"确定"/"取消"）。

### 自定义按钮文案

```tsx
React.createElement(ConfirmResetDialog, {
  isOpen: showDeleteDialog,
  title: '删除确认',
  message: '删除后无法恢复，确定要继续吗？',
  confirmLabel: '删除',
  cancelLabel: '再想想',
  onConfirm: handleDelete,
  onCancel: () => setShowDeleteDialog(false),
});
```
Explanation: 通过 `confirmLabel` 和 `cancelLabel` 覆盖默认按钮文案，使按钮语义更贴合具体操作场景。此例中确认按钮显示为"删除"，取消按钮显示为"再想想"。

### Layout 中的实际用法

```tsx
// Layout 组件中的完整使用链路
export function Layout({ onReset, ... }: LayoutProps) {
  const { t } = useTranslation();
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const handleResetClick = () => setShowConfirmReset(true);
  const handleResetConfirm = () => {
    setShowConfirmReset(false);
    onReset();
  };
  const handleResetCancel = () => setShowConfirmReset(false);

  return React.createElement('div', { ... },
    // ... header with reset button that calls handleResetClick ...
    React.createElement(ConfirmResetDialog, {
      isOpen: showConfirmReset,
      title: t('layout.confirmResetTitle'),
      message: t('layout.confirmResetMessage'),
      onConfirm: handleResetConfirm,
      onCancel: handleResetCancel,
    }),
  );
}
```
Explanation: Layout 组件通过 `useState(false)` 管理对话框显示状态。用户点击头部的"重置供应商"按钮后，`handleResetClick` 将状态设为 `true`，对话框弹出。确认时先关闭对话框再调用父组件传入的 `onReset()` 回调执行实际重置操作；取消时仅关闭对话框。标题和消息均通过 i18n 翻译键获取，支持中英文切换。
