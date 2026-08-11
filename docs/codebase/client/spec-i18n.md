# Internationalization (i18n)

> Source files:
> - `src/client/i18n/index.ts` : 1-77
> - `src/client/i18n/locales/en-US.json` : 1-187
> - `src/client/i18n/locales/zh-CN.json` : 1-187
> - `src/client/components/LanguageSwitcher.tsx` : 1-55

## Overview

本 spec 覆盖 Furina 客户端的国际化（i18n）子系统。该子系统基于 `i18next` + `react-i18next` 构建，为整个前端 UI 提供中文（zh-CN）和英文（en-US）双语言支持。

**设计动机**：Furina 面向中英文双语用户群体，需要在不修改业务组件代码的前提下，通过统一的翻译资源文件管理所有 UI 文案，同时支持用户在运行时动态切换语言并将偏好持久化到后端配置。

**使用场景**：
- 应用启动时：从后端 API 获取语言配置，初始化 i18next 实例
- 组件渲染时：通过 `useTranslation()` hook 获取 `t()` 函数翻译 UI 文本
- 用户切换语言时：通过 LanguageSwitcher 组件切换语言并同步到后端
- HTML 文档属性同步：App 根组件监听语言变化，同步更新 `<html lang>` 属性

**涉及源文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/client/i18n/index.ts` | i18next 初始化、语言映射工具函数、类型定义 |
| `src/client/i18n/locales/zh-CN.json` | 中文翻译资源（187 行，覆盖全部 UI 文案） |
| `src/client/i18n/locales/en-US.json` | 英文翻译资源（187 行，覆盖全部 UI 文案） |
| `src/client/components/LanguageSwitcher.tsx` | 语言切换按钮组件，负责切换语言并持久化到后端 |

## Architecture / Flow

### 启动初始化流程

```
main.tsx bootstrap()
  -> initI18n()
    -> fetch('/furina/api/config')   // 从后端获取语言配置
    -> backendLangToLocale(backendLang)  // 映射 'chinese'/'english' -> 'zh-CN'/'en-US'
    -> i18next.use(initReactI18next).init({
         lng: locale,
         fallbackLng: 'zh-CN',
         resources: { 'zh-CN': {...}, 'en-US': {...} }
       })
    -> return i18next 实例
  -> ReactDOM.createRoot().render(
       <I18nextProvider i18n={i18n}>
         <App />
       </I18nextProvider>
     )
```

### 语言切换流程

```
LanguageSwitcher 点击
  -> i18n.changeLanguage(newLocale)        // 立即切换 i18next 语言
  -> fetch PUT '/furina/api/config'    // 持久化到后端配置
  -> App useEffect 监听 i18n.language 变化
    -> document.documentElement.lang = localeToHtmlLang(locale)  // 更新 HTML lang 属性
  -> 所有使用 useTranslation() 的组件自动 re-render
```

### 翻译资源键结构

```
{
  app.brandName                          // 应用品牌名
  toast.*                                // Toast 提示消息（15 个键）
  layout.*                               // 布局壳层文案（12 个键 + activityBar 子级 4 个键）
  projectSidebar.*                       // 项目侧边栏（9 个键）
  providerList.*                         // 供应商列表（5 个键）
  providerCard.*                         // 供应商卡片（12 个键）
  common.form.*                          // 通用表单标签（24 个键）
  common.validate.*                      // API Key 验证（7 个键）
  addProvider.*                          // 添加供应商对话框（17 个键）
  editProvider.*                         // 编辑供应商对话框（6 个键）
  deleteConfirm.*                        // 删除确认对话框（6 个键）
  confirmDialog.*                        // 通用确认对话框（2 个键）
  progressAxis.*                         // 进度轴（4 个键 + stageName 子级 7 个键）
  detailPanel.*                          // 详情面板（6 个键 + subStage 子级 3 个键）
}
```

## Functionality / Interface Details

### `backendLangToLocale(lang: BackendLang | string) -> Locale`

**Source**: `src/client/i18n/index.ts`:25-28

**功能**: 将后端配置 API 中存储的语言值（`'chinese'` / `'english'`）映射为 i18next 使用的 locale 标识符（`'zh-CN'` / `'en-US'`）。这是因为后端使用简单的英文单词存储语言偏好，而 i18next 需要标准的 BCP 47 locale 标识符。

**参数**:
- `lang` (`BackendLang | string`): 后端存储的语言值。当值为 `'english'` 时返回 `'en-US'`，其他任何值（包括 `'chinese'` 或未知字符串）均返回 `'zh-CN'`（即中文作为默认回退）。

**返回值**:
- `Locale`: `'zh-CN'` 或 `'en-US'`
- 边界情况：对未知字符串不做报错处理，直接回退到 `'zh-CN'`

**核心逻辑**:
函数采用"非英文即中文"的二元判断策略。只有当 `lang` 严格等于 `'english'` 时才返回 `'en-US'`，否则一律返回 `'zh-CN'`。这种设计保证了即使后端返回了非预期值，UI 也能正常显示（以中文作为兜底）。

**核心代码**:
```typescript
export function backendLangToLocale(lang: BackendLang | string): Locale {
  if (lang === 'english') return 'en-US';
  return 'zh-CN';
}
```
Source: `src/client/i18n/index.ts`:25-28

**使用示例**:
```typescript
import { backendLangToLocale } from './i18n/index.js';

const locale1 = backendLangToLocale('chinese'); // 'zh-CN'
const locale2 = backendLangToLocale('english'); // 'en-US'
const locale3 = backendLangToLocale('unknown'); // 'zh-CN' (fallback)
```
解释: 在 `initI18n()` 函数内部调用，将从后端获取的 `language` 字段值转换为 i18next 的 locale 标识符。

---

### `localeToHtmlLang(locale: Locale | string) -> string`

**Source**: `src/client/i18n/index.ts`:34-37

**功能**: 将 i18next 的 locale 标识符转换为 HTML `lang` 属性值。遵循 HTML 规范：中文保持 `'zh-CN'`，英文简化为 `'en'`（而非完整的 `'en-US'`）。这个转换由 App 组件在语言变化时调用，确保 `<html>` 元素的 `lang` 属性始终正确。

**参数**:
- `locale` (`Locale | string`): i18next 的 locale 标识符或任意字符串。

**返回值**:
- `string`: HTML lang 属性值。`'zh-CN'` 保持不变，其他任何值返回 `'en'`。

**核心逻辑**:
与 `backendLangToLocale` 类似，采用二元判断。只有 `'zh-CN'` 保持原样返回，其他所有值（包括 `'en-US'`、`'fr'` 等）均简化为 `'en'`。这符合 HTML `lang` 属性的惯例 —— 区域子标签对英文通常可省略。

**核心代码**:
```typescript
export function localeToHtmlLang(locale: Locale | string): string {
  if (locale === 'zh-CN') return 'zh-CN';
  return 'en';
}
```
Source: `src/client/i18n/index.ts`:34-37

**使用示例**:
```typescript
import { localeToHtmlLang } from './i18n/index.js';

// App.tsx 中的使用
useEffect(() => {
  document.documentElement.lang = localeToHtmlLang(i18n.language);
}, [i18n.language]);
```
解释: App 根组件通过 `useEffect` 监听 `i18n.language` 变化，调用 `localeToHtmlLang` 转换后设置到 `<html>` 元素的 `lang` 属性上，确保无障碍访问工具和搜索引擎能正确识别页面语言。

---

### `initI18n() -> Promise<typeof i18next>`

**Source**: `src/client/i18n/index.ts`:44-76

**功能**: i18next 的完整初始化函数。从后端配置 API 获取用户语言偏好，注册 `react-i18next` 插件，配置翻译资源和回退语言，最终返回初始化完成的 i18next 实例。这是整个 i18n 子系统的入口点，由 `main.tsx` 在应用 bootstrap 阶段调用，必须在 React 渲染之前完成。

**参数**: 无

**返回值**:
- `Promise<typeof i18next>`: 初始化完成的 i18next 实例，包含所有翻译资源和语言配置
- 边界情况：后端不可达时回退到中文（zh-CN），不抛出异常

**核心逻辑**:

1. **语言获取**：默认 `backendLang = 'chinese'`（中文），然后尝试 `fetch('/furina/api/config')` 获取后端配置。仅当 HTTP 响应成功（`response.ok`）且返回的 `data.language` 为合法值（`'chinese'` 或 `'english'`）时才更新 `backendLang`。
2. **错误处理**：fetch 失败时通过 `logger.error` 记录错误详情，但不中断流程，直接使用默认中文。
3. **i18next 初始化**：通过 `.use(initReactI18next)` 注册 React 绑定插件，然后调用 `.init()` 配置语言、回退语言、翻译资源和插值设置。
4. **插值配置**：`escapeValue: false` 是因为 React 本身已对 JSX 输出进行转义，无需 i18next 重复转义。

**核心代码**:
```typescript
export async function initI18n(): Promise<typeof i18next> {
  let backendLang: BackendLang = 'chinese';

  try {
    const response = await fetch('/furina/api/config');
    if (response.ok) {
      const data: { language?: BackendLang } = await response.json();
      if (data.language === 'chinese' || data.language === 'english') {
        backendLang = data.language;
      }
    }
  } catch (err) {
    logger.error(
      `Failed to fetch language config: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const locale = backendLangToLocale(backendLang);

  await i18next.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'zh-CN',
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    interpolation: {
      escapeValue: false,
    },
  });

  return i18next;
}
```
Source: `src/client/i18n/index.ts`:44-76

**使用示例**:
```typescript
// main.tsx 中的 bootstrap 流程
import { I18nextProvider } from 'react-i18next';
import { initI18n } from './i18n/index.js';
import { App } from './App.js';

async function bootstrap(): Promise<void> {
  const i18n = await initI18n();
  ReactDOM.createRoot(rootElement).render(
    React.createElement(I18nextProvider, { i18n }, React.createElement(App))
  );
}

void bootstrap();
```
解释: 在 React 挂载之前先完成 i18next 初始化，确保 App 及其子组件在首次渲染时就能通过 `useTranslation()` 获取正确的翻译文本。初始化完成后通过 `I18nextProvider` 将 i18n 实例注入 React 组件树。

---

### `LanguageSwitcher() -> React.ReactElement`

**Source**: `src/client/components/LanguageSwitcher.tsx`:13-55

**功能**: 语言切换按钮组件。渲染一个紧凑的 28x28px 按钮，根据当前语言显示 `'中'`（中文状态下）或 `'EN'`（英文状态下）。点击后立即切换 i18next 语言并异步将语言偏好持久化到后端配置。被 Layout 头部区域渲染。

**参数**: 无（组件函数无 props）

**返回值**:
- `React.ReactElement`: 一个 `<button>` 元素，带有 `aria-label`、`title` 和 Tailwind CSS 样式类

**核心逻辑**:

1. **状态获取**：通过 `useTranslation()` 获取 `i18n` 实例，根据 `i18n.language === 'zh-CN'` 判断当前是否中文状态。
2. **显示文本**：中文状态显示 `'中'`，英文状态显示 `'EN'`。
3. **无障碍标签**：中文状态显示 `'Switch to English'`（告知用户点击后将切换到英文），英文状态显示 `'切换到中文'`（告知用户点击后将切换到中文）。`aria-label` 和 `title` 均使用此文本。
4. **切换逻辑**（`handleToggle`，useCallback 包裹）：
   - 先调用 `i18n.changeLanguage(newLocale)` 立即切换语言（触发所有组件 re-render）
   - 再通过 `fetch PUT /furina/api/config` 持久化语言偏好
   - 使用反向映射：`newLocale === 'zh-CN' ? 'chinese' : 'english'` 转换为后端格式
   - HTTP 失败或网络错误时仅记录日志，不影响 UI 状态
5. **样式**：使用 `React.createElement` 而非 JSX 语法，应用 Tailwind CSS 的 `inline-flex items-center justify-center w-7 h-7 rounded-md border text-xs font-semibold` 等类名，实现紧凑的边框按钮样式并支持 hover 状态过渡。

**核心代码**:
```typescript
export function LanguageSwitcher(): React.ReactElement {
  const { i18n } = useTranslation();

  const isZh = i18n.language === 'zh-CN';
  const label = isZh ? 'Switch to English' : '切换到中文';
  const displayText = isZh ? '中' : 'EN';

  const handleToggle = useCallback(async () => {
    const newLocale: Locale = isZh ? 'en-US' : 'zh-CN';
    await i18n.changeLanguage(newLocale);

    const backendLang = newLocale === 'zh-CN' ? 'chinese' : 'english';
    try {
      const response = await fetch('/furina/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: backendLang }),
      });
      if (!response.ok) {
        logger.error(
          `Failed to persist language: HTTP ${response.status} ${response.statusText}`,
        );
      }
    } catch (err) {
      logger.error(
        `Failed to persist language: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [i18n, isZh]);

  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: handleToggle,
      'aria-label': label,
      title: label,
      className:
        'inline-flex items-center justify-center w-7 h-7 rounded-md border text-xs font-semibold transition-colors hover:bg-accent text-muted-foreground hover:text-foreground',
    },
    displayText,
  );
}
```
Source: `src/client/components/LanguageSwitcher.tsx`:13-55

**使用示例**:
```tsx
// Layout.tsx 中在头部区域渲染
import { LanguageSwitcher } from './LanguageSwitcher.js';

// 在 Layout 的头部区域中渲染
React.createElement(LanguageSwitcher)
```
解释: LanguageSwitcher 被放置在 Layout 组件的头部区域，与设置按钮、代理开关等并列。用户点击后，整个应用的 UI 文案会立即切换为对应语言。

## Data Structures

### `BackendLang`
```typescript
export type BackendLang = 'chinese' | 'english';
```
- `'chinese'`: 后端配置中表示中文语言的标识
- `'english'`: 后端配置中表示英文语言的标识

用于与后端 `/furina/api/config` API 的 `language` 字段交互。

### `Locale`
```typescript
export type Locale = 'zh-CN' | 'en-US';
```
- `'zh-CN'`: i18next 的简体中文 locale 标识符
- `'en-US'`: i18next 的美式英语 locale 标识符

用于 i18next 内部语言管理和 `i18n.changeLanguage()` 调用。

### 翻译资源结构（JSON Schema 概述）

翻译 JSON 文件采用嵌套对象结构，顶层按功能域分组：

```json
{
  "app": { "brandName": "..." },
  "toast": { "providerAdded": "...", "providerSaved": "...", ... },
  "layout": {
    "settings": "...",
    "activityBar": { "providers": "...", "projects": "..." },
    ...
  },
  "projectSidebar": { "title": "...", "searchPlaceholder": "...", ... },
  "providerList": { "noProviders": "...", ... },
  "providerCard": { "providerIcon": "...", "active": "...", ... },
  "common": {
    "form": { "nameLabel": "...", "apiKeyLabel": "...", ... },
    "validate": { "validateButton": "...", "validating": "...", ... }
  },
  "addProvider": { "dialogTitle": "...", "submitAdd": "...", ... },
  "editProvider": { "dialogTitle": "...", "submitSave": "...", ... },
  "deleteConfirm": { "confirmTitle": "...", "confirmDelete": "...", ... },
  "confirmDialog": { "confirm": "...", "cancel": "..." },
  "progressAxis": {
    "stageName": { "explore": "...", "brainstorm": "...", ... },
    ...
  },
  "detailPanel": {
    "subStage": { "integration": "...", "codecheck": "...", "archive": "..." },
    ...
  }
}
```

翻译键总数约 130+ 个，覆盖以下 UI 区域：
- **应用级**：品牌名
- **Toast 提示**：15 条操作反馈消息（支持 `{{message}}`、`{{name}}` 插值）
- **布局壳层**：设置、重置、代理、会话管理、ActivityBar、确认对话框
- **项目侧边栏**：搜索、标签页切换、加载/空/错误状态
- **供应商列表**：空状态引导、加载失败、重试
- **供应商卡片**：状态标签、操作按钮 aria-label
- **通用表单**：所有表单字段的 label、placeholder、aria-label
- **API Key 验证**：按钮文本、验证中/成功/失败/超时
- **添加/编辑/删除供应商对话框**：标题、按钮、验证提示
- **进度轴**：滚动按钮、7 个阶段名称
- **详情面板**：引导文本、空数据提示、时间范围格式、子阶段名称

## Error Handling and Edge Cases

### 后端不可达时的语言回退

`initI18n()` 在 fetch 后端配置 API 失败时（网络错误、服务未启动等），捕获异常并通过 `logger.error` 记录详细错误信息，但不中断初始化流程。此时使用默认值 `'chinese'`（映射为 `'zh-CN'`），确保应用始终能正常启动并显示中文 UI。

### 后端返回非预期语言值

当后端 API 返回的 `language` 字段既不是 `'chinese'` 也不是 `'english'` 时，`initI18n()` 保留默认的 `'chinese'`。结合 `backendLangToLocale()` 的"非英文即中文"策略，确保未知值不会导致初始化失败。

### 语言持久化失败的降级处理

`LanguageSwitcher` 在切换语言时先调用 `i18n.changeLanguage()` 立即更新 UI，再异步 PUT 到后端。即使后端写入失败（网络错误、HTTP 非 200），当前会话的语言切换仍然生效（用户体验不受影响），仅记录错误日志。下次启动时如果后端仍保留旧值，会回到上次成功持久化的语言。

### React 插值转义

i18next 配置了 `interpolation.escapeValue: false`，因为 React 的 JSX 渲染机制已自动对内容进行 HTML 转义。如果不禁用 i18next 的转义，翻译文本中的 HTML 实体会被双重转义（如 `&amp;` 变成 `&amp;amp;`）。

## Dependencies

### Depends on

- **i18next**：核心国际化框架，提供 `init()`、`changeLanguage()`、`use()` 等 API
- **react-i18next**：React 绑定层，提供 `useTranslation()` hook、`I18nextProvider`、`initReactI18next` 插件
- **`src/client/utils/logger.ts`**：浏览器端日志工具，`initI18n()` 和 `LanguageSwitcher` 均使用 `logger.error()` 记录错误
- **后端 API `GET /furina/api/config`**：应用启动时获取语言配置
- **后端 API `PUT /furina/api/config`**：LanguageSwitcher 持久化语言偏好

### Depended by

- **`src/client/main.tsx`**：调用 `initI18n()` 完成初始化，并通过 `I18nextProvider` 注入实例
- **`src/client/App.tsx`**：导入 `localeToHtmlLang` 用于同步 `<html lang>` 属性；使用 `useTranslation()` 翻译 Toast 消息
- **`src/client/components/Layout.tsx`**：渲染 `LanguageSwitcher` 组件；使用 `useTranslation()` 翻译布局文案
- **所有使用 `useTranslation()` 的组件**：包括 `ProviderList`、`ProviderCard`、`AddProviderDialog`、`EditProviderDialog`、`DeleteConfirmDialog`、`ProjectSidebar`、`ChangeCard`、`ProjectGroup`、`DetailPanel`、`StageProgressAxis`、`StageSummary`、`ConfirmResetDialog` 等

## Usage Examples

### 在组件中使用翻译

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent(): React.ReactElement {
  const { t } = useTranslation();

  return React.createElement('div', null,
    React.createElement('h1', null, t('layout.settings')),
    React.createElement('p', null, t('toast.switchedTo', { name: 'OpenAI' })),
    // 使用插值: "Switched to OpenAI" 或 "已切换至 OpenAI"
  );
}
```
解释: `useTranslation()` hook 返回 `t` 函数，通过翻译键路径获取对应语言的文案。支持 `{{variable}}` 插值语法，在调用时通过第二个参数传入变量值。

### 添加新的翻译键

```json
// zh-CN.json
{
  "myFeature": {
    "title": "我的功能",
    "description": "这是功能描述"
  }
}

// en-US.json
{
  "myFeature": {
    "title": "My Feature",
    "description": "This is the feature description"
  }
}
```

```typescript
// 在组件中使用
const { t } = useTranslation();
t('myFeature.title')       // 中文: "我的功能", 英文: "My Feature"
t('myFeature.description') // 中文: "这是功能描述", 英文: "This is the feature description"
```
解释: 新增翻译时，必须同时在 zh-CN.json 和 en-US.json 中添加对应的键值对，保持两个文件的键结构完全一致。

### 手动切换语言（程序化）

```typescript
const { i18n } = useTranslation();

// 切换到英文
await i18n.changeLanguage('en-US');

// 切换到中文
await i18n.changeLanguage('zh-CN');
```
解释: 除 LanguageSwitcher 组件外，也可以在代码中通过 `i18n.changeLanguage()` 直接切换语言。切换后所有使用 `useTranslation()` 的组件会自动 re-render。
