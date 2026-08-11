# Client Utilities & Test Mocks

> Source files:
> - `src/client/utils/logger.ts` : 1-16
> - `src/client/__mocks__/svg-url-mock.ts` : 1-8
> - `src/client/test-setup.ts` : 1-14

## Overview

Client Utilities & Test Mocks 是客户端（浏览器侧）的基础设施层，提供三类轻量级支撑能力：

1. **浏览器兼容日志器**（`utils/logger.ts`）：为客户端代码提供与服务端 Winston logger 相同接口的日志对象，但基于 `console` API 实现，避免在浏览器环境中引入 Node.js 专有依赖（`fs`、`os`、`path`）。
2. **SVG URL Mock**（`__mocks__/svg-url-mock.ts`）：为 Vitest 测试环境提供 Vite `?url` 后缀导入的桩实现，解决测试运行器无法处理 Vite 特有语法的问题。
3. **测试环境初始化**（`test-setup.ts`）：为客户端 React 组件测试注册 `jest-dom` 匹配器和 DOM 自动清理逻辑。

**设计动机**：服务端日志器 `src/utils/logger.ts` 使用 Winston 库将日志写入文件系统，依赖 Node.js 内置模块（`fs`、`os`、`path`）。这些模块在浏览器环境中不可用，直接导入会导致打包或运行时报错。因此需要一个仅使用浏览器原生 `console` API 的轻量替代品，保持相同的 `logger.error()` / `logger.warn()` / `logger.info()` / `logger.debug()` 接口签名，使客户端代码无需关心底层实现差异。

**使用场景**：
- 所有客户端组件在 catch 块中调用 `logger.error()` 记录错误信息（如 API 请求失败、表单验证错误等）
- Vitest 测试环境中自动加载 `test-setup.ts`，注册 `toBeInTheDocument()` 等 DOM 匹配器
- Vitest 测试环境中 SVG `?url` 导入被自动替换为 mock 路径字符串

**文件职责**：
- `src/client/utils/logger.ts` — 浏览器兼容日志对象，`error` 和 `warn` 委托给 `console.error` / `console.warn`，`info` 和 `debug` 为空操作（no-op）
- `src/client/__mocks__/svg-url-mock.ts` — 返回固定占位 URL 字符串的默认导出模块，用于替代 Vite 的 `?url` 导入行为
- `src/client/test-setup.ts` — 导入 `@testing-library/jest-dom/vitest` 匹配器扩展，并注册 `afterEach` 钩子调用 `cleanup()` 清理 DOM 状态

## Architecture / Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  服务端 (Node.js)                                                     │
│  src/utils/logger.ts                                                 │
│  ┌──────────────────────────────────────────────┐                    │
│  │ winston.createLogger()                        │                    │
│  │  ├── File transport (furina.log)          │                    │
│  │  ├── logger.error()  → 写文件                 │                    │
│  │  ├── logger.warn()   → 写文件                 │                    │
│  │  ├── logger.info()   → 写文件                 │                    │
│  │  └── logger.debug()  → 写文件                 │                    │
│  └──────────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘
                            │
               统一接口 { error, warn, info, debug }
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  客户端 (Browser)                                                     │
│  src/client/utils/logger.ts                                          │
│  ┌──────────────────────────────────────────────┐                    │
│  │ logger = {                                    │                    │
│  │   error: console.error.bind(console),         │ ← 实际输出到浏览器 │
│  │   warn:  console.warn.bind(console),          │ ← 实际输出到浏览器 │
│  │   info:  () => {},                            │ ← 无操作          │
│  │   debug: () => {},                            │ ← 无操作          │
│  │ }                                             │                    │
│  └──────────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘
```

```
Vitest 测试执行流程：

vitest.config.ts
  ├── setupFiles: ['./src/client/test-setup.ts']
  │     ├── import '@testing-library/jest-dom/vitest'  → 注册 DOM 匹配器
  │     └── afterEach(() => cleanup())                 → 每个测试后清理 DOM
  │
  └── resolve.alias
        └── /^(.*\/icons\/.*\.svg)\?url$/
              → src/client/__mocks__/svg-url-mock.ts
              → 返回 '/test-fixtures/mock-icon.svg'
```

## Functionality / Interface Details

### `logger` 对象

**Source**: `src/client/utils/logger.ts` : 9-16

**Functionality**: 导出一个符合 Winston Logger 接口子集的日志对象，包含四个方法：`error`、`warn`、`info`、`debug`。这是客户端代码使用的统一日志入口，与服务端 Winston logger 保持相同的调用方式（`logger.error(message)` 等），使业务代码可以在不区分运行环境的情况下记录日志。

`error` 和 `warn` 方法直接绑定浏览器原生的 `console.error` 和 `console.warn`，在浏览器开发者工具控制台中可以正常看到红色错误和黄色警告输出。`info` 和 `debug` 方法为空函数（no-op），因为在浏览器调试场景中，info/debug 级别的日志通常会带来过多噪音，且不需要像服务端那样持久化到文件。

**Parameters**:
- 每个方法接受与 `console.error` / `console.warn` 相同的参数（`...data: any[]`），支持多参数和格式化字符串。

**Return Value**:
- `error` / `warn`：返回 `void`，实际输出到浏览器控制台
- `info` / `debug`：返回 `void`，无任何副作用

**Core Logic**:

模块通过 `console.error.bind(console)` 和 `console.warn.bind(console)` 将原生 console 方法绑定到 logger 对象上。`bind(console)` 调用确保 `this` 上下文正确指向 `console` 对象，避免在解构赋值或方法传递时丢失上下文。`info` 和 `debug` 定义为箭头函数 `(): void => {}`，确保它们在任何调用场景下都不产生副作用。

注意文件中定义了 `noop` 变量但实际未使用（`info` 和 `debug` 直接内联定义为箭头函数），这可能是一个遗留的冗余代码。

**Core Code**:
```typescript
const noop = (): void => {};

export const logger = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: (): void => {},
  debug: (): void => {},
};
```
Source: `src/client/utils/logger.ts` : 9-16

**Usage Example**:
```typescript
import { logger } from './utils/logger.js';

try {
  const response = await fetch('/furina/api/providers');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  setProviders(data);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Failed to fetch providers: ${message}`);
  // 在浏览器控制台输出: "Failed to fetch providers: HTTP 500"（红色错误样式）
}
```
Explanation: 这是客户端组件中最常见的使用模式。在 API 请求的 catch 块中调用 `logger.error()`，错误信息会输出到浏览器控制台。由于 `logger.error` 是 `console.error.bind(console)` 的引用，调用时会保留控制台原生的错误样式（红色背景、堆栈跟踪等）。

---

### SVG URL Mock 默认导出

**Source**: `src/client/__mocks__/svg-url-mock.ts` : 8

**Functionality**: 该模块导出一个固定的 URL 字符串 `/test-fixtures/mock-icon.svg` 作为默认导出值，用于在 Vitest 测试环境中替代 Vite 的 `?url` 后缀导入。

在 Vite 构建环境中，`import iconUrl from './icon.svg?url'` 会被 Vite 处理为返回该 SVG 文件的最终 URL 路径（如 `/assets/icon-abc123.svg`）。但 Vitest 作为测试运行器不经过 Vite 的完整构建管线，无法处理 `?url` 后缀语法，因此需要通过 `resolve.alias` 配置将匹配 `?url` 后缀的 SVG 导入替换为这个 mock 模块。

**Parameters**: 无（纯值导出）

**Return Value**:
- `string`（默认导出）: 固定的占位 URL 路径 `/test-fixtures/mock-icon.svg`，可在测试中用于断言 URL 属性或 img src

**Core Logic**:

该模块仅包含一行默认导出。实际的替换逻辑在 `vitest.config.ts` 中通过 `resolve.alias` 配置实现：

```typescript
// vitest.config.ts 中的配置
const SvgUrlMockPath = path.resolve(__dirname, 'src/client/__mocks__/svg-url-mock.ts');

resolve: {
  alias: [
    {
      find: /^(.*\/icons\/.*\.svg)\?url$/,
      replacement: SvgUrlMockPath,
    },
  ],
},
```

正则表达式 `^(.*\/icons\/.*\.svg)\?url$` 匹配所有位于 `icons` 目录下的 `.svg` 文件且带有 `?url` 后缀的导入路径。匹配成功时，Vitest 将导入重定向到 `svg-url-mock.ts`，返回占位字符串而非尝试解析 SVG 文件内容。

**Core Code**:
```typescript
export default '/test-fixtures/mock-icon.svg';
```
Source: `src/client/__mocks__/svg-url-mock.ts` : 8

**Usage Example**:
```typescript
// 在 ProviderCard.tsx 中的原始导入（Vite 环境下返回真实 URL）
import anthropicIcon from '../icons/anthropic.svg?url';
// → anthropicIcon = '/assets/anthropic-abc123.svg'

// 在 Vitest 测试中，同一导入被 alias 替换
import anthropicIcon from '../icons/anthropic.svg?url';
// → anthropicIcon = '/test-fixtures/mock-icon.svg'

// 测试断言
expect(imgElement).toHaveAttribute('src', '/test-fixtures/mock-icon.svg');
```
Explanation: Vite 生产构建时，`?url` 导入返回带有 hash 的最终资源路径。在测试环境中，由于不经过 Vite 构建管线，该导入被 `resolve.alias` 替换为 mock 模块，返回固定的占位字符串。测试代码可以基于这个固定值进行断言。

---

### 测试环境初始化文件

**Source**: `src/client/test-setup.ts` : 8-14

**Functionality**: Vitest 测试环境的全局 setup 文件，在所有客户端测试运行前自动执行。完成两件初始化工作：

1. **注册 jest-dom 匹配器**：导入 `@testing-library/jest-dom/vitest`，向 Vitest 的 `expect` 全局对象扩展一系列 DOM 专用匹配器（如 `toBeInTheDocument()`、`toHaveTextContent()`、`toBeDisabled()` 等），使测试代码可以用声明式方式断言 DOM 状态。

2. **注册 DOM 自动清理**：通过 `afterEach(() => cleanup())` 在每个测试用例执行后自动调用 `@testing-library/react` 的 `cleanup()` 函数，卸载之前渲染的 React 组件并清理 DOM 节点，防止测试之间的 DOM 状态污染。

**Parameters**: 无（setup 文件不接收参数）

**Return Value**: 无（setup 文件通过副作用生效）

**Core Logic**:

`@testing-library/jest-dom/vitest` 是 jest-dom 库为 Vitest 专门优化的入口点，它自动调用 `expect.extend()` 将 DOM 匹配器注册到 Vitest 的全局 `expect` 对象上。与 Jest 版本不同，Vitest 版本的入口文件处理了 Vitest 特有的匹配器注册机制。

`cleanup()` 函数会卸载所有之前通过 `render()` 渲染的 React 组件，移除附加到 `document.body` 的 DOM 节点。在 Vitest 中，每个测试文件默认共享同一个 `document` 对象，如果不调用 `cleanup()`，前一个测试渲染的 DOM 会影响后续测试。通过 `afterEach` 注册确保每个测试用例结束后自动清理，无需手动调用。

**Core Code**:
```typescript
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```
Source: `src/client/test-setup.ts` : 8-14

**Usage Example**:
```typescript
// vitest.config.ts 中配置 setupFiles
export default defineConfig({
  test: {
    setupFiles: ['./src/client/test-setup.ts'],
  },
});

// 在测试文件中使用扩展后的匹配器
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { MyComponent } from './MyComponent';

test('renders button as disabled', () => {
  render(<MyComponent disabled />);
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();            // 来自 jest-dom
  expect(button).toHaveAttribute('aria-disabled', 'true');
  // afterEach 自动调用 cleanup()，卸载 MyComponent
});
```
Explanation: 测试文件通过 `vitest.config.ts` 的 `setupFiles` 配置在运行前加载 `test-setup.ts`。此后所有测试文件中的 `expect` 都拥有了 DOM 匹配器能力（如 `toBeDisabled()`），且每个测试结束后 DOM 自动清理。

## Data Structures

### `logger` 对象类型

```typescript
{
  error: (...data: any[]) => void;
  warn: (...data: any[]) => void;
  info: () => void;
  debug: () => void;
}
```
- `error` (`(...data: any[]) => void`): 绑定到 `console.error` 的方法。接受任意数量和类型的参数，输出到浏览器控制台的错误通道。
- `warn` (`(...data: any[]) => void`): 绑定到 `console.warn` 的方法。接受任意数量和类型的参数，输出到浏览器控制台的警告通道。
- `info` (`() => void`): 空操作函数，不接受参数，不产生输出。在浏览器客户端中不输出 info 级别日志。
- `debug` (`() => void`): 空操作函数，不接受参数，不产生输出。在浏览器客户端中不输出 debug 级别日志。

该类型与服务端 Winston Logger 的常用方法签名保持兼容，客户端代码可以通过相同的 `logger.error(msg)` 模式记录错误，无需关心底层是 Winston 还是 console。

## Error Handling and Edge Cases

- **logger 无异常路径**：`logger.error` 和 `logger.warn` 直接委托给原生 `console` 方法，浏览器原生 console 不会抛出异常。即使传入 `undefined`、`null` 或循环引用对象，`console.error` 也会安全地将其序列化输出。
- **noop 变量未使用**：`logger.ts` 第 9 行定义了 `const noop = (): void => {}`，但 `info` 和 `debug` 方法直接内联定义为空箭头函数，`noop` 变量未被引用。这是一个无害的冗余声明。
- **SVG Mock 的 URL 固定性**：`svg-url-mock.ts` 返回固定的 `/test-fixtures/mock-icon.svg` 路径。如果测试需要区分不同 SVG 图标的 URL，当前 mock 无法满足（所有 SVG 导入返回相同值）。但项目中的测试通常仅验证图标是否存在（`toHaveAttribute('src', ...)`），不依赖 URL 差异性。
- **cleanup 幂等性**：`@testing-library/react` 的 `cleanup()` 是幂等的，多次调用或在没有已渲染组件时调用均不会报错。即使测试中未调用 `render()`，`afterEach` 中的 `cleanup()` 也安全无副作用。

## Dependencies

- **Depends on**:
  - `console`（浏览器全局对象） — `logger.ts` 通过 `console.error.bind(console)` 和 `console.warn.bind(console)` 使用
  - `@testing-library/jest-dom` — `test-setup.ts` 导入其 `/vitest` 入口以注册 DOM 匹配器
  - `@testing-library/react` — `test-setup.ts` 导入 `cleanup` 函数
  - `vitest` — `test-setup.ts` 导入 `afterEach` 生命周期钩子
  - `vitest.config.ts` — 通过 `setupFiles` 配置引用 `test-setup.ts`，通过 `resolve.alias` 配置引用 `svg-url-mock.ts`

- **Depended by**:
  - `spec-app-root.md`（App.tsx） — 使用 `logger.error()` 记录 API 请求失败（如获取活跃供应商、切换代理状态、重置供应商等）
  - `spec-add-provider-dialog.md`（AddProviderDialog.tsx） — 使用 `logger.error()` 记录模板获取、模板删除、供应商添加、API key 验证等操作失败
  - `spec-edit-provider-dialog.md`（EditProviderDialog.tsx） — 使用 `logger.error()` 记录供应商更新和 API key 验证失败
  - `spec-delete-confirm-dialog.md`（DeleteConfirmDialog.tsx） — 使用 `logger.error()` 记录供应商删除失败
  - `spec-i18n.md`（LanguageSwitcher.tsx） — 使用 `logger.error()` 记录语言切换保存失败
  - `spec-provider-card.md`（ProviderCard.tsx） — 通过 Vite `?url` 导入使用 SVG 图标，测试时使用 svg-url-mock
  - `spec-icons.md` — SVG 图标文件通过 Vite `?url` 导入被组件使用，测试时由 svg-url-mock 替代
  - 所有客户端组件测试文件 — 通过 `test-setup.ts` 获取 jest-dom 匹配器和自动 DOM 清理能力

## Usage Examples

### logger 在组件中的典型使用模式

```typescript
import { logger } from '../utils/logger.js';

// 在异步操作的 catch 块中记录错误
const handleToggleProxy = async () => {
  try {
    const response = await fetch('/furina/api/config/proxy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enableFurinaProxy }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    setEnableFurinaProxy(!enableFurinaProxy);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to toggle proxy: ${message}`);
    // → 浏览器控制台输出: "Failed to toggle proxy: HTTP 500"（红色错误样式）
    showToast(t('layout.toggleProxyFailed'));
  }
};
```
Explanation: 这是客户端组件中 logger 的标准使用模式。try 块中执行 API 请求，catch 块中使用 `logger.error()` 记录错误详情，同时通过 toast 向用户展示友好提示。`logger.error` 的输出仅面向开发者（在浏览器开发者工具中查看），而 toast 消息面向最终用户。

### SVG URL Mock 在 Vitest 配置中的注册

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

const SvgUrlMockPath = path.resolve(__dirname, 'src/client/__mocks__/svg-url-mock.ts');

export default defineConfig({
  test: {
    setupFiles: ['./src/client/test-setup.ts'],
  },
  resolve: {
    alias: [
      {
        find: /^(.*\/icons\/.*\.svg)\?url$/,
        replacement: SvgUrlMockPath,
      },
    ],
  },
});
```
Explanation: 这是将三个基础设施文件连接到 Vitest 测试框架的配置入口。`setupFiles` 指定 `test-setup.ts` 作为全局 setup 文件，`resolve.alias` 将所有 `icons` 目录下的 `?url` SVG 导入替换为 mock 模块。两个配置共同确保客户端组件测试能正常运行：DOM 匹配器已注册、DOM 自动清理已启用、Vite 特有的 SVG 导入语法已被正确模拟。
