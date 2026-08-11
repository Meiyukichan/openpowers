# Provider Brand Icons

> Source files:
> - `src/client/icons/anthropic.svg` : 1-1
> - `src/client/icons/bailian.svg` : 1-2
> - `src/client/icons/chatglm.svg` : 1-1
> - `src/client/icons/claude.svg` : 1-1
> - `src/client/icons/deepseek.svg` : 1-1
> - `src/client/icons/kimi.svg` : 1-1
> - `src/client/icons/minimax.svg` : 1-1
> - `src/client/icons/openai.svg` : 1-1
> - `src/client/icons/xiaomimimo.svg` : 1-1
> - `src/client/components/ProviderCard.tsx` : 14-65
> - `src/client/components/AddProviderDialog.tsx` : 17-88

## Overview

本 spec 文档定义了 Furina 客户端中 AI 服务提供商品牌图标的完整技术规范。涵盖 9 个 SVG 图标资产文件以及它们在 UI 组件中的使用方式。

**系统定位**：图标资产是 Provider Management 子系统中的视觉基础层，为 ProviderCard 卡片列表和 AddProviderDialog 模板选择器提供品牌标识。同时，`claude.svg` 具有双重用途——既作为 Provider 品牌图标，也作为整个应用的品牌标识出现在 Layout 头部和浏览器 favicon 中。

**设计动机**：采用独立的 SVG 文件 + Vite `?url` 导入模式，而非内联 SVG 组件，原因是：
1. SVG 文件可以被 Vite 构建管线独立优化和哈希处理
2. `?url` 导入在构建时返回静态资源 URL，避免将大量 SVG 标记嵌入 JavaScript bundle
3. 通过 `<img>` 标签加载 SVG 可以利用浏览器缓存机制
4. SVG 统一使用 `1em` 尺寸 + `viewBox`，天然支持按需缩放

**涉及源文件职责**：
- `src/client/icons/*.svg` — 9 个 SVG 图标资产文件，每个对应一个 AI 服务提供商
- `src/client/components/ProviderCard.tsx` — 定义 `ICON_MAP` 和 `ProviderIcon` 组件，在 Provider 卡片中渲染品牌图标
- `src/client/components/AddProviderDialog.tsx` — 定义 `ICON_MAP`（与 ProviderCard 重复），在预设选择器网格中渲染图标
- `src/client/components/Layout.tsx` — 直接导入 `claude.svg?url`，在应用头部品牌区域渲染 Claude 图标
- `src/client/index.html` — 引用 `claude.svg` 作为浏览器标签页 favicon

## Architecture / Flow

### 图标资产流

```
SVG 文件 (src/client/icons/*.svg)
    │
    ├─ Vite ?url 导入 ─→ 模块 URL 字符串 (构建时哈希路径)
    │       │
    │       ├─ ICON_MAP 映射 (filename → URL)
    │       │       │
    │       │       ├─ ProviderCard.tsx: <img src={url} width={20} height={20} />
    │       │       │       ↑ 从 provider.icon 字段查找
    │       │       │
    │       │       └─ AddProviderDialog.tsx: <img src={url} width={16} height={16} />
    │       │               ↑ 从 preset.iconSvg 字段查找
    │       │
    │       └─ Layout.tsx: <img src={ClaudeSvg} width={24} height={24} />
    │                       ↑ 直接导入 claude.svg?url，用于应用品牌标识
    │
    └─ index.html: <link rel="icon" href="./icons/claude.svg" />
                    ↑ 相对路径引用，用于浏览器标签页 favicon
```

### ICON_MAP 查找流程

1. 服务端存储的 Provider 对象包含 `icon` 字段（如 `"openai.svg"`）
2. 组件通过 `ICON_MAP[provider.icon]` 查找对应的 Vite 导入 URL
3. 如果找到匹配，渲染 `<img>` 元素；否则返回 `null`（不显示图标）
4. 模板的 `iconSvg` 字段与 `icon` 字段遵循相同的命名规范

## Functionality / Interface Details

### SVG 文件规范

所有 9 个 SVG 文件遵循以下统一规范：

**尺寸与视口**：

| 属性 | 值 |
|------|-----|
| `width` | `"1em"` |
| `height` | `"1em"` |
| `style` | `"flex:none;line-height:1"` |
| `xmlns` | `"http://www.w3.org/2000/svg"` |

- 绝大多数 SVG 使用 `viewBox="0 0 24 24"`（标准 24x24 图标画布）
- `xiaomimimo.svg` 使用 `viewBox="0 0 152 132"`（宽幅非标准画布，因为 Xiaomi 的 Logo 是横向排列的文字 "xiaomi"）

**填充策略分类**：

| 类型 | SVG 文件 | 填充方式 |
|------|----------|---------|
| `currentColor`（继承父元素颜色） | anthropic.svg, openai.svg, kimi.svg, bailian.svg, xiaomimimo.svg | `fill="currentColor"` |
| 硬编码品牌色 | claude.svg | `fill="#D97757"` |
| 硬编码品牌色 | deepseek.svg | `fill="#4D6BFE"` |
| CSS 渐变 | minimax.svg | `fill="url(#lobe-icons-minimax-fill)"` (从 `#E2167E` 到 `#FE603C`) |
| CSS 渐变 | chatglm.svg | `fill="url(#lobe-icons-chat-glm-fill)"` (从 `#504AF4` 到 `#3485FF`) |

**架构说明**：
- 所有 SVG 为单 `<path>` 结构（`minimax.svg` 除外，额外包含 `<defs>` 中的 `<linearGradient>` 定义）
- 所有 SVG 包含 `<title>` 元素用于无障碍访问（如 `<title>Anthropic</title>`）
- `fill-rule` 属性：大多数使用 `"evenodd"`，deepseek.svg 和 minimax.svg 使用 `"nonzero"`

---

### `ICON_MAP: Record<string, string>`

**Source**: `src/client/components/ProviderCard.tsx`:37-46
**Source**: `src/client/components/AddProviderDialog.tsx`:79-88

**功能说明**：ICON_MAP 是一个将 SVG 文件名映射到 Vite `?url` 导入的模块 URL 的记录对象。它是图标资产系统的核心桥梁，将服务端存储的图标文件名字符串解析为客户端可渲染的静态资源 URL。该映射在 ProviderCard 和 AddProviderDialog 中各有一份完全相同的定义（代码重复）。

**映射表**：

| 键（SVG 文件名） | 值（Vite 导入变量） | 对应提供商 |
|------------------|---------------------|-----------|
| `'anthropic.svg'` | `AnthropicSvg` | Anthropic |
| `'deepseek.svg'` | `DeepSeekSvg` | DeepSeek |
| `'xiaomimimo.svg'` | `XiaomimimoSvg` | Xiaomi MiMo |
| `'chatglm.svg'` | `ChatglmSvg` | ChatGLM |
| `'minimax.svg'` | `MinimaxSvg` | MiniMax |
| `'kimi.svg'` | `KimiSvg` | Kimi (Moonshot) |
| `'bailian.svg'` | `BailianSvg` | 百炼 (Bailian) |
| `'openai.svg'` | `OpenAISvg` | OpenAI |

**核心代码**：
```typescript
// Map of SVG filenames to Vite ?url imported module URLs
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

**注意**：`claude.svg` 未包含在 ICON_MAP 中。Claude 图标在应用中仅用于品牌标识（Layout 头部和 favicon），而非作为可选的 Provider 图标选项。如果服务端 Provider 的 `icon` 字段存储了 `'claude.svg'`，在 ProviderCard 中将无法匹配 ICON_MAP，图标将不会渲染。

**Usage Example**：
```typescript
import AnthropicSvg from '../icons/anthropic.svg?url';
// AnthropicSvg 的值在构建后类似: "/assets/anthropic-abc123.svg"

const iconUrl = ICON_MAP['anthropic.svg']; // → AnthropicSvg 的值
// 如果 icon 不在 ICON_MAP 中：
const unknown = ICON_MAP['custom.svg']; // → undefined
```
解释：Vite 在构建时将 `?url` 后缀的 SVG 导入替换为带哈希的静态资源路径字符串。运行时通过 ICON_MAP 字典查找即可获得可直接用于 `<img src>` 的 URL。

---

### `ProviderIcon({ icon }: { icon?: string }) -> ReactElement | null`

**Source**: `src/client/components/ProviderCard.tsx`:52-65

**功能说明**：一个内部 React 函数组件，负责根据 Provider 的 `icon` 字段值渲染对应的品牌 SVG 图标。该组件是 ICON_MAP 的直接消费者，将文件名字符串解析为 `<img>` 元素。当 icon 为空或不在 ICON_MAP 中时返回 null，实现优雅降级。

**参数**：
- `icon` (`string | undefined`): Provider 对象的 icon 字段值，即 SVG 文件名（如 `"openai.svg"`）。可选参数，未提供时图标不渲染。

**返回值**：
- `React.ReactElement | null`: 匹配成功时返回 20x20 的 `<img>` 元素，失败时返回 null

**核心逻辑**：
1. 从 props 接收 icon 文件名
2. 通过 `ICON_MAP[icon]` 查找对应的 Vite 导入 URL
3. 如果 `svgUrl` 存在，使用 `React.createElement('img', ...)` 创建图片元素
4. 图片设置 `loading="lazy"` 以延迟加载，`width/height={20}` 控制显示尺寸
5. alt 文本使用 i18n 翻译 key `'providerCard.providerIcon'`

**核心代码**：
```typescript
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

**Usage Example**：
```typescript
// 在 ProviderCard 组件的 JSX 中使用
React.createElement(
  'div',
  { className: 'h-10 w-10 rounded-lg bg-muted flex items-center justify-center border flex-shrink-0' },
  React.createElement(ProviderIcon, { icon: provider.icon }),
);
```
解释：ProviderIcon 被放置在一个 40x40 的圆角容器中，容器有背景色和边框。图标本身 20x20，居中显示在容器内。当 `provider.icon` 为 `undefined` 或不匹配任何已知文件名时，容器将显示为空的占位区域。

---

### AddProviderDialog 中的图标渲染

**Source**: `src/client/components/AddProviderDialog.tsx`:443-455

**功能说明**：AddProviderDialog 的预设选择器网格中，每个模板按钮左侧显示对应的品牌图标。通过模板数据的 `iconSvg` 字段（即 ProviderPreset 接口中的 `iconSvg?: string`）查找 ICON_MAP 中的 URL 并渲染。渲染逻辑与 ProviderIcon 相似，但使用 16x16 的较小尺寸以适配网格按钮布局。

**核心代码**：
```typescript
(() => {
  const svgUrl = preset.iconSvg ? ICON_MAP[preset.iconSvg] : undefined;
  if (svgUrl) {
    return React.createElement('img', {
      src: svgUrl,
      alt: t('addProvider.providerIcon'),
      width: 16,
      height: 16,
      loading: 'lazy',
    });
  }
  return null;
})(),
```
Source: `src/client/components/AddProviderDialog.tsx`:443-455

**Usage Example**：
```typescript
// 模板数据结构
const preset: ProviderPreset = {
  name: 'Anthropic',
  baseUrl: 'https://api.anthropic.com',
  iconSvg: 'anthropic.svg',  // 此值用于 ICON_MAP 查找
  source: 'builtin',
};

// ICON_MAP[preset.iconSvg] → AnthropicSvg → URL
// 渲染为：<img src="/assets/anthropic-abc123.svg" width={16} height={16} />
```
解释：模板配置中的 `iconSvg` 字段存储 SVG 文件名，与 Provider 的 `icon` 字段遵循相同的命名规范。该值在预设选择器网格的每个按钮中用于渲染对应的图标。

---

### Layout 中的 Claude 品牌图标

**Source**: `src/client/components/Layout.tsx`:17, 81-87

**功能说明**：Layout 组件直接导入 `claude.svg?url` 并在应用头部品牌区域渲染为 24x24 的图片。这是 claude.svg 在应用中的主要品牌用途，不经过 ICON_MAP 昡射。

**核心代码**：
```typescript
import ClaudeSvg from '../icons/claude.svg?url';

// 在头部品牌区域使用
React.createElement('img', {
  src: ClaudeSvg,
  alt: 'Claude',
  width: 24,
  height: 24,
  loading: 'lazy',
}),
```
Source: `src/client/components/Layout.tsx`:17, 81-87

---

### index.html favicon 配置

**Source**: `src/client/index.html`:7

**功能说明**：应用的 HTML 入口文件通过 `<link>` 标签引用 `claude.svg` 作为浏览器标签页的 favicon。使用相对路径 `./icons/claude.svg`，由 Vite 开发服务器或构建管线解析为正确的资源路径。

**核心代码**：
```html
<link rel="icon" type="image/svg+xml" href="./icons/claude.svg" />
```
Source: `src/client/index.html`:7

---

### svg-url-mock（测试辅助）

**Source**: `src/client/__mocks__/svg-url-mock.ts`:1-8

**功能说明**：Vitest 测试环境中的 SVG `?url` 导入 mock。由于 Vitest 不处理 Vite 的 `?url` 后缀，此 mock 返回一个固定的占位 URL 字符串 `'/test-fixtures/mock-icon.svg'`，使包含 ICON_MAP 的组件能在测试环境中正常运行而无需真实 SVG 资源。

**核心代码**：
```typescript
export default '/test-fixtures/mock-icon.svg';
```
Source: `src/client/__mocks__/svg-url-mock.ts`:1-8

## Data Structures

### `ProviderPreset.iconSvg` 字段

```typescript
interface ProviderPreset {
  id?: string;
  name: string;
  websiteUrl?: string;
  baseUrl: string;
  iconSvg?: string;     // SVG 文件名，用于 ICON_MAP 查找
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
  source: 'builtin' | 'custom';
}
```
Source: `src/client/components/AddProviderDialog.tsx`:51-63

- `iconSvg` (`string | undefined`): SVG 文件名（如 `"anthropic.svg"`），用于在 ICON_MAP 中查找对应的 Vite URL 导入。由后端模板资源定义，builtin 模板通常带有此字段。

### Provider 接口的 `icon` 字段

```typescript
// 服务端 Zod Schema 定义
icon: z.string().optional(),
```
Source: `src/server/providers-store.ts`:36

- `icon` (`string | undefined`): Provider 的品牌图标文件名。当 Provider 从模板创建时，`icon` 值来自模板的 `iconSvg` 字段；用户手动创建时此字段可能为空。

### SVG 文件属性常量

所有 SVG 文件共享以下固定属性：

| 属性 | 值 | 说明 |
|------|-----|------|
| `width` | `"1em"` | 相对于父元素字体大小 |
| `height` | `"1em"` | 与 width 保持正方形比例 |
| `style` | `"flex:none;line-height:1"` | 防止 flex 布局拉伸和行高影响 |
| `fill-rule` | `"evenodd"` 或 `"nonzero"` | 路径填充规则 |

## Error Handling and Edge Cases

### ICON_MAP 查找失败

当 `provider.icon` 或 `preset.iconSvg` 的值不在 ICON_MAP 中时：
- ProviderCard 的 `ProviderIcon` 组件返回 `null`，Provider 卡片的图标容器显示为空的占位区域（40x40 带边框的灰色方块）
- AddProviderDialog 的预设按钮中图标区域为空（24x24 容器无内容）

这属于设计上有意的优雅降级——新增的 Provider 如果使用了未注册的图标文件名，不会导致应用崩溃，只是图标不显示。

### SVG 文件缺失或加载失败

当 SVG 文件路径无效或网络加载失败时：
- `<img>` 兇素会触发浏览器默认的图片加载失败行为（显示破碎图标或空白）
- 不会影响组件的其他部分（名称、操作按钮等正常显示）

### xiaomimimo.svg 的非标准 viewBox

`xiaomimimo.svg` 使用 `viewBox="0 0 152 132"` 而非标准的 `0 0 24 24`。由于所有 SVG 使用 `width="1em" height="1em"`，浏览器会自动将 viewBox 内容缩放到显示尺寸，视觉上不会出现问题，但该图标的原始宽高比为 152:132（约 1.15:1），在正方形容器中可能会有轻微的上下留白。

### claude.svg 不在 ICON_MAP 中

`claude.svg` 未包含在 ProviderCard 和 AddProviderDialog 的 ICON_MAP 中。如果服务端 Provider 的 `icon` 字段值为 `'claude.svg'`，图标将不会渲染。当前设计下 Claude 仅作为应用品牌标识使用。

## Dependencies

- **Depends on**:
  - Vite 构建管线 — 处理 `?url` 导入并将 SVG 文件转换为带哈希的静态资源 URL
  - `src/server/providers-store.ts` — 定义 Provider 类型的 `icon` 字段
  - i18n 子系统 — 提供图标的 alt 文本翻译（`'providerCard.providerIcon'`、`'addProvider.providerIcon'`）

- **Depended by**:
  - `spec-provider-card.md` — ProviderCard 组件通过 ProviderIcon 和 ICON_MAP 渲染品牌图标
  - `spec-add-provider-dialog.md` — AddProviderDialog 预设选择器网格通过 ICON_MAP 渲染图标
  - `spec-layout.md` — Layout 头部直接导入 claude.svg?url 作为应用品牌标识
  - `spec-app-root.md` — index.html 引用 claude.svg 作为 favicon

## Usage Examples

### 场景 1：在新组件中使用 ICON_MAP 渲染 Provider 图标

```typescript
// 步骤 1: 导入所有需要的 SVG 资源
import AnthropicSvg from '../icons/anthropic.svg?url';
import DeepSeekSvg from '../icons/deepseek.svg?url';
import XiaomimimoSvg from '../icons/xiaomimimo.svg?url';
import ChatglmSvg from '../icons/chatglm.svg?url';
import MinimaxSvg from '../icons/minimax.svg?url';
import KimiSvg from '../icons/kimi.svg?url';
import BailianSvg from '../icons/bailian.svg?url';
import OpenAISvg from '../icons/openai.svg?url';

// 步骤 2: 定义 ICON_MAP
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

// 步骤 3: 根据 icon 字段渲染
function renderProviderIcon(icon?: string) {
  const svgUrl = icon ? ICON_MAP[icon] : undefined;
  if (!svgUrl) return null;
  return React.createElement('img', {
    src: svgUrl,
    alt: 'Provider icon',
    width: 20,
    height: 20,
    loading: 'lazy',
  });
}

// 使用示例
renderProviderIcon('openai.svg');   // → <img src="/assets/openai-xxx.svg" ...>
renderProviderIcon('unknown.svg');  // → null
renderProviderIcon(undefined);      // → null
```
解释：导入所有 SVG 文件并建立文件名到 URL 的映射，然后通过文件名查找并渲染。`?url` 后缀告诉 Vite 将导入解析为资源 URL 而非 SVG 内容。

### 场景 2：添加新的 Provider 品牌图标

```typescript
// 步骤 1: 在 src/client/icons/ 下创建新的 SVG 文件 (e.g., newprovider.svg)
// SVG 遵循统一规范：width="1em" height="1em" viewBox="0 0 24 24"

// 步骤 2: 在 ProviderCard.tsx 中添加导入和映射
import NewProviderSvg from '../icons/newprovider.svg?url';

const ICON_MAP: Record<string, string> = {
  // ... 现有映射
  'newprovider.svg': NewProviderSvg,
};

// 步骤 3: 在 AddProviderDialog.tsx 中添加相同的导入和映射
// （当前两个组件各自维护一份 ICON_MAP，需要同步修改）

// 步骤 4: 在模板 JSON 资源中配置 iconSvg 字段
// { "name": "NewProvider", "baseUrl": "...", "iconSvg": "newprovider.svg", "source": "builtin" }
```
解释：添加新图标需要同时修改两个文件中的 ICON_MAP（ProviderCard.tsx 和 AddProviderDialog.tsx），这是因为当前代码中 ICON_MAP 存在重复定义，未抽取为共享常量。
