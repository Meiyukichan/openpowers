# Add Provider Dialog

> Source files:
> - `src/client/components/AddProviderDialog.tsx` : 1-715

## Overview

AddProviderDialog 是一个模态对话框组件，用于创建新的 AI Provider（供应商）。它是 Provider 管理子系统中的核心入口之一，用户通过该对话框完成从选择预设模板、填写表单、验证 API Key 到最终提交创建 Provider 的完整流程。

**设计动机**：新建 Provider 需要填写较多配置项（名称、API Key、多个模型名称等），且不同供应商有不同的默认配置。通过预设模板（Preset）机制，用户可以选择常用供应商快速填充表单，也可以完全自定义配置。同时提供"保存为模板"功能，让用户将自定义配置复用。

**使用场景**：
- 用户在 Provider 列表页面点击"添加 Provider"按钮时打开此对话框
- 用户选择预设模板（如 Anthropic、OpenAI 等）快速填充表单字段
- 用户填写 API Key 后可先进行验证，确认连接和可用模型数
- 用户可将当前配置保存为自定义模板供后续复用

**涉及源文件及职责**：
- `src/client/components/AddProviderDialog.tsx`：组件完整实现，包含状态管理、表单验证、API 交互、模板管理、模态框行为控制

## Architecture / Flow

```
┌──────────────────────────────────────────────────────────┐
│                    AddProviderDialog                       │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │               Preset Selector Grid                   │ │
│  │  [Custom Config] [Anthropic] [OpenAI] [DeepSeek] ... │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                          │ handlePresetSelect              │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │                  Form Fields                         │ │
│  │  Name + Notes │ WebsiteURL │ API Key (toggle vis)    │ │
│  │  [Validate API Key] → POST /providers/validate       │ │
│  │  BaseURL │ DefaultModel │ SonnetModel │ OpusModel    │ │
│  │  HaikuModel                                          │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                          │                                │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │               Footer Buttons                         │ │
│  │  [Cancel]  [Add as Template]  [Submit Add]           │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘

Data Flow:
1. Dialog open → reset form → fetch templates (GET /providers/templates)
2. User selects preset → auto-fill form fields
3. User edits fields → client-side validation clears per-field errors
4. User clicks "Validate" → POST /providers/validate → show result
5. User clicks "Add as Template" → POST /providers/templates → refresh list
6. User clicks "Submit" → validate() → POST /providers → onSuccess + close
```

## Functionality / Interface Details

### `AddProviderDialog(props: AddProviderDialogProps)`

**Source**: `src/client/components/AddProviderDialog.tsx`:94-714

**Functionality**: 顶层 React 函数组件，渲染一个通过 React Portal 挂载到 `document.body` 的模态对话框。该组件管理全部内部状态，包括表单数据、模板列表、验证结果、提交状态等。对话框包含三个主要区域：顶部的预设模板选择网格、中间的表单字段区域、底部的操作按钮栏。组件使用 `React.createElement` 而非 JSX 语法进行渲染。

**Parameters**:
- `isOpen` (`boolean`): 控制对话框是否可见。当为 `false` 时组件返回 `null`。
- `onClose` (`() => void`): 关闭对话框的回调函数，由 ESC 键、背景点击、取消按钮或提交成功后触发。
- `onSuccess` (`() => void`): Provider 创建成功后的回调，通常触发列表刷新。
- `showToast` (`(text: string, type?: 'success' | 'error') => void`): 显示 Toast 通知的回调，用于模板操作结果和错误提示。

**Return Value**:
- `React.ReactElement | null`: 当 `isOpen` 为 `false` 时返回 `null`；否则返回通过 `createPortal` 渲染的模态框 DOM。

**Core Logic**:

组件内部维护以下关键状态：
- `form: FormValues` — 表单字段值，默认为 `EMPTY_FORM`
- `selectedPreset: string | null` — 当前选中的预设 ID，默认为 `CUSTOM_PRESET_ID`
- `templates: ProviderPreset[]` — 从 API 获取的模板列表
- `validationResult` — API Key 验证结果，类型为联合类型 `{ valid: true; models: string[] } | { valid: false; error: string; upstreamError?: string } | null`
- `usedTemplate: string | null` — 记录用户所选模板的名称，提交时作为 `usedTemplate` 字段传给后端

组件通过四个 `useEffect` 副作用管理模态框行为：
1. **表单重置** (L109-118): 当 `isOpen` 变为 `true` 时重置所有状态到初始值
2. **ESC 键处理** (L121-130): 监听 `keydown` 事件，按下 Escape 时调用 `onClose`
3. **Body 滚动锁定** (L133-140): 打开时设置 `document.body.style.overflow = 'hidden'`，关闭时恢复
4. **模板获取** (L143-154): 打开时发起 `GET /furina/api/providers/templates` 请求

预设列表由硬编码的 `CUSTOM_PRESET`（自定义配置）和 API 获取的 `templates` 合并组成，`CUSTOM_PRESET` 始终排在首位。

模态框使用三层嵌套的 `div` 结构：外层固定全屏容器（`fixed inset-0 z-50`）、中层居中包装器（带背景点击关闭逻辑）、内层对话框面板（`max-w-3xl max-h-[90vh]`，带 `e.stopPropagation()` 阻止事件冒泡）。

**Core Code**:
```tsx
// Form reset effect
useEffect(() => {
  if (isOpen) {
    setForm(EMPTY_FORM);
    setShowApiKey(false);
    setErrors({});
    setSelectedPreset(CUSTOM_PRESET_ID);
    setUsedTemplate(null);
    setValidationResult(null);
  }
}, [isOpen]);

// ESC key + body scroll lock
useEffect(() => {
  if (!isOpen) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isOpen, onClose]);

useEffect(() => {
  if (isOpen) { document.body.style.overflow = 'hidden'; }
  return () => { document.body.style.overflow = ''; };
}, [isOpen]);

// Template fetching
useEffect(() => {
  if (!isOpen) return;
  fetch('/furina/api/providers/templates')
    .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
    .then((data: ProviderPreset[]) => setTemplates(data))
    .catch((err) => { logger.error(`Failed to fetch provider templates: ${...}`); });
}, [isOpen]);
```
Source: `src/client/components/AddProviderDialog.tsx`:109-154

**Usage Example**:
```tsx
// 在 App.tsx 中的典型使用方式
const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

React.createElement(AddProviderDialog, {
  isOpen: isAddDialogOpen,
  onClose: () => setIsAddDialogOpen(false),
  onSuccess: () => { setIsAddDialogOpen(false); setRefreshTrigger((t) => t + 1); },
  showToast,
})
```
Explanation: App 组件控制对话框的开关状态，`onSuccess` 回调中关闭对话框并递增 `refreshTrigger` 以触发 Provider 列表重新获取。

---

### `handleChange(field: keyof FormValues) -> (e: ChangeEvent) => void`

**Source**: `src/client/components/AddProviderDialog.tsx`:156-170

**Functionality**: 高阶函数，为每个表单字段生成变更处理函数。除了更新表单值外，还负责清除该字段的验证错误，并在 `baseUrl` 或 `apiKey` 字段变更时重置 API Key 验证结果（因为验证依赖这两个字段的值）。

**Parameters**:
- `field` (`keyof FormValues`): 表单字段名，如 `'name'`、`'apiKey'`、`'defaultModel'` 等。

**Return Value**:
- `(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void`: 输入事件处理器。

**Core Logic**:
1. 从事件中提取新值
2. 使用函数式 `setForm` 更新对应字段（展开拷贝模式）
3. 如果该字段存在错误消息，从 `errors` 对象中删除
4. 如果是 `baseUrl` 或 `apiKey` 字段变更，将 `validationResult` 重置为 `null`

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
Source: `src/client/components/AddProviderDialog.tsx`:156-170

**Usage Example**:
```tsx
React.createElement('input', {
  value: form.name,
  onChange: handleChange('name'),
  // ...
})
```
Explanation: 在表单字段的 `onChange` 属性中直接调用，柯里化模式使得可以简洁地绑定字段名。

---

### `handlePresetSelect(preset: ProviderPreset) => void`

**Source**: `src/client/components/AddProviderDialog.tsx`:172-192

**Functionality**: 预设模板选择处理函数。当用户点击预设网格中的某个选项时，根据预设类型执行不同的表单填充逻辑。选择"自定义配置"会清空表单；选择其他预设会将预设中的字段值填充到表单中（apiKey 不会被填充，需要用户手动输入）。

**Parameters**:
- `preset` (`ProviderPreset`): 被选中的预设模板对象。

**Return Value**: `void`

**Core Logic**:
1. 确定 `presetId`：优先使用 `preset.id`，否则使用 `preset.name`
2. 更新 `selectedPreset` 状态
3. 如果选择的是自定义配置（`CUSTOM_PRESET_ID`），重置表单为 `EMPTY_FORM`，清空 `usedTemplate`
4. 否则，记录 `usedTemplate` 为预设名称，并将预设中的 `name`、`baseUrl`、`websiteUrl`、`defaultModel`、`sonnetModel`、`opusModel`、`haikuModel` 填充到表单中
5. 清空所有字段错误

**Core Code**:
```tsx
const handlePresetSelect = (preset: ProviderPreset) => {
  const presetId = preset.id ?? preset.name;
  setSelectedPreset(presetId);
  if (preset.id === CUSTOM_PRESET_ID) {
    setForm(EMPTY_FORM);
    setUsedTemplate(null);
  } else {
    setUsedTemplate(preset.name);
    setForm((prev) => ({
      ...prev,
      name: preset.name,
      baseUrl: preset.baseUrl,
      websiteUrl: preset.websiteUrl || prev.websiteUrl,
      defaultModel: preset.defaultModel || '',
      sonnetModel: preset.sonnetModel || '',
      opusModel: preset.opusModel || '',
      haikuModel: preset.haikuModel || '',
    }));
  }
  setErrors({});
};
```
Source: `src/client/components/AddProviderDialog.tsx`:172-192

**Usage Example**:
```tsx
// 在预设网格按钮中
React.createElement('button', {
  type: 'button',
  onClick: () => handlePresetSelect(preset),
  className: `... ${selectedPreset === (preset.id ?? preset.name) ? 'bg-blue-100 text-blue-700' : '...'}`,
}, preset.name)
```
Explanation: 预设网格中每个按钮的点击处理器，选中状态通过比较 `selectedPreset` 与预设 ID 来高亮显示。

---

### `validate() => boolean`

**Source**: `src/client/components/AddProviderDialog.tsx`:194-216

**Functionality**: 客户端表单验证函数，在提交表单前检查所有必填字段。验证的字段包括：name、apiKey、defaultModel、sonnetModel、opusModel、haikuModel。notes、websiteUrl、baseUrl 为可选字段，不参与必填验证。验证失败时设置错误消息（使用 i18n 翻译键），验证通过时清空所有错误。

**Parameters**: 无

**Return Value**:
- `boolean`: `true` 表示验证通过，`false` 表示存在验证错误。

**Core Logic**:
1. 创建 `newErrors` 对象
2. 依次检查每个必填字段的 `.trim()` 结果是否为空
3. 为空则设置对应的 i18n 错误消息
4. 使用 `setErrors` 更新错误状态
5. 通过 `Object.keys(newErrors).length === 0` 返回验证结果

**Core Code**:
```tsx
const validate = (): boolean => {
  const newErrors: Record<string, string> = {};
  if (!form.name.trim()) {
    newErrors.name = t('addProvider.validationNameRequired');
  }
  if (!form.apiKey.trim()) {
    newErrors.apiKey = t('addProvider.validationApiKeyRequired');
  }
  if (!form.defaultModel.trim()) {
    newErrors.defaultModel = t('addProvider.validationDefaultModelRequired');
  }
  if (!form.sonnetModel.trim()) {
    newErrors.sonnetModel = t('addProvider.validationSonnetModelRequired');
  }
  if (!form.opusModel.trim()) {
    newErrors.opusModel = t('addProvider.validationOpusModelRequired');
  }
  if (!form.haikuModel.trim()) {
    newErrors.haikuModel = t('addProvider.validationHaikuModelRequired');
  }
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```
Source: `src/client/components/AddProviderDialog.tsx`:194-216

**Usage Example**:
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!validate()) return; // 验证失败则中止提交
  // ... 提交逻辑
};
```
Explanation: 在表单 `onSubmit` 处理函数的开头调用，只有验证通过后才继续执行 API 请求。

---

### `handleDeleteTemplate(preset: ProviderPreset) => Promise<void>`

**Source**: `src/client/components/AddProviderDialog.tsx`:218-235

**Functionality**: 删除自定义模板的异步处理函数。仅针对 `source === 'custom'` 的模板显示删除按钮（内置的 `CUSTOM_PRESET_ID` 除外）。删除成功后从本地模板列表中移除该模板；如果删除的是当前选中的模板，则自动切换到自定义配置。

**Parameters**:
- `preset` (`ProviderPreset`): 要删除的预设模板对象。

**Return Value**: `Promise<void>`

**Core Logic**:
1. 发起 `DELETE /furina/api/providers/templates/{encodedName}` 请求
2. 成功后使用 `setTemplates` 过滤掉被删除的模板
3. 如果被删除的模板恰好是当前选中的预设，重置选中状态为 `CUSTOM_PRESET_ID` 并清空表单
4. 失败时仅记录日志（不显示 Toast）

**Core Code**:
```tsx
const handleDeleteTemplate = async (preset: ProviderPreset) => {
  try {
    const response = await fetch(`/furina/api/providers/templates/${encodeURIComponent(preset.name)}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      setTemplates((prev) => prev.filter((t) => t.name !== preset.name));
      if (selectedPreset === (preset.id ?? preset.name)) {
        setSelectedPreset(CUSTOM_PRESET_ID);
        setForm(EMPTY_FORM);
        setUsedTemplate(null);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to delete provider template: ${message}`);
  }
};
```
Source: `src/client/components/AddProviderDialog.tsx`:218-235

**Usage Example**:
```tsx
// 在预设网格的删除按钮中
(preset.source === 'custom' && preset.id !== CUSTOM_PRESET_ID)
  ? React.createElement('button', {
      type: 'button',
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation(); // 阻止冒泡触发预设选择
        handleDeleteTemplate(preset);
      },
    }, '\u00D7')
  : null
```
Explanation: 删除按钮以覆盖层形式显示在自定义模板卡片的右上角，使用 `e.stopPropagation()` 防止触发外层的预设选择。

---

### `handleAddAsTemplate() => Promise<void>`

**Source**: `src/client/components/AddProviderDialog.tsx`:237-283

**Functionality**: 将当前表单配置保存为可复用模板的异步处理函数。仅要求 `name` 字段非空即可保存（其余字段可选）。保存成功后刷新本地模板列表并自动选中新模板；处理 409 冲突（模板名已存在）和通用错误两种失败情况。

**Parameters**: 无

**Return Value**: `Promise<void>`

**Core Logic**:
1. 前置校验：`name` 为空时显示错误 Toast 并返回
2. 设置 `templateSubmitting` 加载状态
3. 构建请求体：`name` 必填，其余字段（`baseUrl`、`websiteUrl`、`defaultModel`、`sonnetModel`、`opusModel`、`haikuModel`）trim 后为非空才包含
4. 发起 `POST /furina/api/providers/templates` 请求
5. 成功后：显示成功 Toast，将返回的新模板追加到 `templates` 列表，并设置为选中状态
6. 失败后：409 状态码直接显示后端错误消息（名称冲突），其他错误显示通用失败提示
7. `finally` 中重置 `templateSubmitting`

**Core Code**:
```tsx
const handleAddAsTemplate = async () => {
  if (!form.name.trim()) {
    showToast(t('toast.nameRequiredForTemplate'), 'error');
    return;
  }
  setTemplateSubmitting(true);
  try {
    const body: Record<string, string | undefined> = {
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim() || undefined,
      websiteUrl: form.websiteUrl.trim() || undefined,
      defaultModel: form.defaultModel.trim() || undefined,
      sonnetModel: form.sonnetModel.trim() || undefined,
      opusModel: form.opusModel.trim() || undefined,
      haikuModel: form.haikuModel.trim() || undefined,
    };
    const response = await fetch('/furina/api/providers/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      showToast(t('toast.templateAdded'), 'success');
      const newTemplate = await response.json();
      setTemplates((prev) => [...prev, newTemplate]);
      setSelectedPreset(newTemplate.name);
    } else {
      const data = await response.json().catch(() => ({}));
      const errorMsg = data.error || `HTTP ${response.status}`;
      if (response.status === 409) {
        showToast(errorMsg, 'error');
      } else {
        showToast(t('toast.addTemplateFailed', { message: errorMsg }), 'error');
      }
    }
  } catch (err) { /* ... */ }
  finally { setTemplateSubmitting(false); }
};
```
Source: `src/client/components/AddProviderDialog.tsx`:237-283

**Usage Example**:
```tsx
// 在底部按钮栏中
React.createElement('button', {
  type: 'button',
  disabled: submitting || templateSubmitting,
  onClick: handleAddAsTemplate,
}, templateSubmitting ? t('addProvider.addingTemplate') : t('addProvider.addAsTemplate'))
```
Explanation: "Add as Template"按钮在提交中或模板保存中时禁用，显示对应的加载文案。

---

### `handleSubmit(e: React.FormEvent) => Promise<void>`

**Source**: `src/client/components/AddProviderDialog.tsx`:285-320

**Functionality**: 表单提交处理函数，完成 Provider 创建的完整流程。先执行客户端验证，验证通过后将表单数据提交到后端 API。成功时调用 `onSuccess` 回调并关闭对话框；失败时记录日志并显示错误 Toast。

**Parameters**:
- `e` (`React.FormEvent`): 表单提交事件对象。

**Return Value**: `Promise<void>`

**Core Logic**:
1. `e.preventDefault()` 阻止默认表单提交
2. 调用 `validate()` 执行客户端验证，失败则返回
3. 设置 `submitting` 加载状态
4. 构建 JSON 请求体：所有字段 `.trim()` 后，`notes`、`websiteUrl`、`baseUrl` 为空时设为 `undefined`（不发送）；`usedTemplate` 仅在有值时发送
5. 发起 `POST /furina/api/providers` 请求
6. 失败时尝试从响应 JSON 中提取 `error` 字段
7. 成功后调用 `onSuccess()` 和 `onClose()`
8. `finally` 中重置 `submitting`

**Core Code**:
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!validate()) return;
  setSubmitting(true);
  try {
    const response = await fetch('/furina/api/providers', {
      method: 'POST',
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
        usedTemplate: usedTemplate || undefined,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    onSuccess();
    onClose();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to add provider: ${message}`);
    showToast(t('toast.operationFailed', { message }), 'error');
  } finally {
    setSubmitting(false);
  }
};
```
Source: `src/client/components/AddProviderDialog.tsx`:285-320

**Usage Example**:
```tsx
// 绑定到 <form> 的 onSubmit
React.createElement('form', { onSubmit: handleSubmit, className: 'px-6 py-4 space-y-4' },
  // ... 表单字段
)
```
Explanation: 作为 `<form>` 元素的 `onSubmit` 处理器，用户点击"Submit Add"按钮时触发。

---

### `handleValidateApiKey() => Promise<void>`

**Source**: `src/client/components/AddProviderDialog.tsx`:322-353

**Functionality**: API Key 验证处理函数，通过后端代理向供应商 API 发起验证请求。验证成功时显示可用模型数量；验证失败时显示错误信息和上游错误详情。该功能帮助用户在提交创建 Provider 之前确认 API Key 和 Base URL 的有效性。

**Parameters**: 无

**Return Value**: `Promise<void>`

**Core Logic**:
1. 设置 `validating` 加载状态并清空之前的验证结果
2. 发起 `POST /furina/api/providers/validate` 请求，携带 `baseUrl` 和 `apiKey`
3. HTTP 非 200 响应：记录日志并设置 `valid: false` 结果
4. HTTP 200 但 `data.valid === true`：设置 `valid: true` 结果，包含 `models` 数组
5. HTTP 200 但 `data.valid === false`：设置 `valid: false` 结果，包含 `error` 和可选的 `upstreamError`
6. 网络异常（catch）：设置 `valid: false`，显示超时提示
7. `finally` 中重置 `validating`

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
Source: `src/client/components/AddProviderDialog.tsx`:322-353

**Usage Example**:
```tsx
// Validate 按钮的渲染和禁用逻辑
React.createElement('button', {
  type: 'button',
  onClick: handleValidateApiKey,
  disabled: !form.baseUrl.trim() || !form.apiKey.trim() || validating,
}, validating ? t('common.validate.validating') : t('common.validate.validateButton'))
```
Explanation: 验证按钮在 baseUrl 和 apiKey 都未填写时禁用，验证进行中显示加载文案。

## Data Structures

### `AddProviderDialogProps`
```tsx
interface AddProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}
```
- `isOpen` (`boolean`): 控制对话框的显示/隐藏状态
- `onClose` (`() => void`): 对话框关闭回调
- `onSuccess` (`() => void`): Provider 创建成功回调，通常用于刷新列表
- `showToast` (`(text: string, type?: 'success' | 'error') => void`): Toast 通知函数

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
- `notes` (`string`): 备注信息（可选）
- `websiteUrl` (`string`): 供应商官网 URL（可选）
- `apiKey` (`string`): API 密钥（必填，密码输入模式）
- `baseUrl` (`string`): API 基础 URL（可选）
- `defaultModel` (`string`): 默认模型名称（必填）
- `sonnetModel` (`string`): Sonnet 模型名称（必填）
- `opusModel` (`string`): Opus 模型名称（必填）
- `haikuModel` (`string`): Haiku 模型名称（必填）

### `ProviderPreset`
```tsx
interface ProviderPreset {
  id?: string;
  name: string;
  websiteUrl?: string;
  baseUrl: string;
  iconSvg?: string;
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
  source: 'builtin' | 'custom';
}
```
- `id` (`string | undefined`): 预设唯一标识，内置预设可能无此字段
- `name` (`string`): 预设显示名称
- `websiteUrl` (`string | undefined`): 供应商官网 URL
- `baseUrl` (`string`): API 基础 URL
- `iconSvg` (`string | undefined`): SVG 图标文件名，通过 `ICON_MAP` 映射到实际 URL
- `defaultModel` (`string | undefined`): 默认模型名称
- `sonnetModel` (`string | undefined`): Sonnet 模型名称
- `opusModel` (`string | undefined`): Opus 模型名称
- `haikuModel` (`string | undefined`): Haiku 模型名称
- `source` (`'builtin' | 'custom'`): 模板来源，`'builtin'` 为 JSON 资源内置，`'custom'` 为用户通过 API 创建

### `CUSTOM_PRESET_ID`
```tsx
const CUSTOM_PRESET_ID = '__custom__';
```
硬编码的自定义配置预设 ID，用于标识始终存在的"自定义配置"选项。业务逻辑中用于判断是否选择的是自定义配置（此时清空表单）以及排除自定义配置的删除按钮。

### `EMPTY_FORM`
```tsx
const EMPTY_FORM: FormValues = {
  name: '', notes: '', websiteUrl: '', apiKey: '', baseUrl: '',
  defaultModel: '', sonnetModel: '', opusModel: '', haikuModel: '',
};
```
所有字段为空字符串的初始表单值，用于对话框打开时和选择自定义配置时重置表单。

### `ICON_MAP`
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
SVG 文件名到 Vite `?url` 导入的模块 URL 的映射表，用于在预设网格中渲染品牌图标。与 ProviderCard 组件中的 `ICON_MAP` 保持同步。

### Validation Result 联合类型
```tsx
{ valid: true; models: string[] } |
{ valid: false; error: string; upstreamError?: string } |
null
```
- `valid: true` 分支：`models` 为可用模型名称数组
- `valid: false` 分支：`error` 为错误描述，`upstreamError` 为上游供应商返回的原始错误信息（可选，展示在 `<pre>` 标签中）
- `null`：初始状态或用户修改了相关字段后重置

## Error Handling and Edge Cases

### 表单验证
- **必填字段校验**：`validate()` 函数检查 6 个必填字段（name、apiKey、defaultModel、sonnetModel、opusModel、haikuModel），任一为空则阻止提交并在对应字段下方显示红色错误提示
- **实时清除错误**：用户在有错误的字段中输入时，`handleChange` 会立即清除该字段的错误消息，无需等待再次提交

### API 交互错误
- **模板获取失败**：静默处理，仅通过 `logger.error` 记录日志，不中断对话框使用
- **模板删除失败**：静默处理，仅记录日志
- **模板保存失败**：区分 409 冲突（名称重复，直接显示后端错误消息）和其他错误（显示通用失败提示并附带错误详情）
- **Provider 创建失败**：尝试从响应 JSON 提取 `error` 字段，回退到 HTTP 状态码，通过 Toast 显示
- **API Key 验证失败**：区分 HTTP 非 200（网络层面错误）、`valid: false`（业务层面验证失败，可能带 `upstreamError`）和网络异常（显示超时提示）

### 模态框行为
- **ESC 键关闭**：全局监听 `keydown`，仅在对话框打开时生效，组件卸载时自动清理监听器
- **Body 滚动锁定**：打开时设置 `overflow: hidden`，关闭时恢复为空字符串（通过 `useEffect` cleanup）
- **背景点击关闭**：中层包装器的 `onClick` 仅在 `e.target === e.currentTarget` 时触发关闭，内层面板使用 `e.stopPropagation()` 阻止事件冒泡
- **对话框关闭时完全重置**：`isOpen` 从 `false` 变为 `true` 时重置所有状态，确保每次打开都是干净的初始状态

### 验证结果重置
- 用户修改 `baseUrl` 或 `apiKey` 字段时，`handleChange` 自动将 `validationResult` 重置为 `null`，避免显示过期的验证结果

### 提交状态管理
- `submitting` 和 `templateSubmitting` 两个独立的加载状态，互相影响按钮禁用：提交中禁用模板保存按钮，模板保存中禁用提交按钮

## Dependencies

### Depends on
- **react** / **react-dom**: `useState`、`useEffect`、`useRef`、`createPortal`
- **react-i18next**: `useTranslation` 钩子用于国际化文本
- **lucide-react**: `Eye`、`EyeOff` 图标组件用于 API Key 可见性切换
- **../utils/logger.js**: 浏览器端日志工具（`logger.error`）
- **../icons/*.svg?url**: Vite `?url` 导入的 SVG 图标资源（anthropic、deepseek、xiaomimimo、chatglm、minimax、kimi、bailian、openai）
- **后端 API**:
  - `GET /furina/api/providers/templates` — 获取预设模板列表
  - `POST /furina/api/providers/templates` — 保存自定义模板
  - `DELETE /furina/api/providers/templates/{name}` — 删除自定义模板
  - `POST /furina/api/providers/validate` — 验证 API Key
  - `POST /furina/api/providers` — 创建 Provider

### Depended by
- **App.tsx**（`src/client/App.tsx`）: 在根组件中渲染 AddProviderDialog，管理 `isAddDialogOpen` 状态，提供 `handleCloseAddDialog`、`handleAddSuccess`、`showToast` 回调
- **Layout.tsx**（间接）: Layout 中的"添加 Provider"按钮触发 App 中的 `setIsAddDialogOpen(true)`

## Usage Examples

### 完整集成示例

```tsx
// App.tsx 中的集成方式
import { AddProviderDialog } from './components/AddProviderDialog.js';

function App() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const showToast = (text: string, type?: 'success' | 'error') => {
    setToastMessage({ text, type: type || 'success' });
  };

  const handleCloseAddDialog = () => setIsAddDialogOpen(false);

  const handleAddSuccess = () => {
    setIsAddDialogOpen(false);
    setRefreshTrigger((t) => t + 1); // 触发 ProviderList 重新获取
  };

  return (
    <>
      {/* 其他组件 */}
      {React.createElement(AddProviderDialog, {
        isOpen: isAddDialogOpen,
        onClose: handleCloseAddDialog,
        onSuccess: handleAddSuccess,
        showToast,
      })}
    </>
  );
}
```

Explanation: App 组件通过 `isAddDialogOpen` 状态控制对话框显示。`onSuccess` 回调中递增 `refreshTrigger`，ProviderList 组件监听该值变化自动刷新数据。`showToast` 是通用的 Toast 显示函数，传递给对话框用于操作反馈。

### 用户操作流程示例

1. 用户点击"添加 Provider"按钮 -> `isAddDialogOpen = true`
2. 对话框打开，自动获取模板列表，预选"自定义配置"
3. 用户点击"Anthropic"预设 -> 表单自动填充 name、baseUrl、模型名称
4. 用户手动输入 API Key
5. 用户点击"验证"按钮 -> 发起 POST 验证 -> 显示"验证成功，可用模型: 42 个"
6. 用户点击"添加为模板" -> 模板保存成功，Toast 提示，模板出现在网格中
7. 用户点击"提交添加" -> 客户端验证通过 -> POST 创建 -> 成功回调 -> 对话框关闭 -> 列表刷新
