# Proxy Types & Constants

> Source files:
> - `src/server/anthropic/types.ts` : 1-19

## Overview

本 spec 文档描述 Anthropic API 代理子模块中的共享类型定义与常量文件 `types.ts`。该文件是代理子模块的基础设施层，定义了两个超时常量和一个 hop-by-hop 请求头列表，供代理处理器（handler）在请求转发过程中使用。

**设计动机**：将共享常量集中定义在独立文件中，遵循单一职责原则。handler、router 等模块通过 import 引用这些常量，避免硬编码魔法数字和字符串散布在业务逻辑中，提高可维护性和可读性。

**使用场景**：
- 当代理处理器需要确定上游请求超时时长时，根据请求路径选择 `MESSAGES_TIMEOUT_MS`（600 秒）或 `DEFAULT_TIMEOUT_MS`（120 秒）
- 当代理处理器需要清洗请求头再转发给上游时，使用 `HOP_BY_HOP_HEADERS` 列表过滤不应被代理的 hop-by-hop 头

**涉及源文件及职责**：
- `src/server/anthropic/types.ts` — 定义代理子模块的所有共享常量

## Architecture / Flow

`types.ts` 在代理子模块中的位置如下：

```
router.ts  ──(routes)──>  handler.ts  ──(imports)──>  types.ts
                              |
                              ├── prepareModifiedHeaders()  ← uses HOP_BY_HOP_HEADERS
                              └── getTimeoutForPath()       ← uses MESSAGES_TIMEOUT_MS / DEFAULT_TIMEOUT_MS
```

`types.ts` 是纯常量定义文件，不包含任何函数或类，也不依赖任何外部模块。它被 `handler.ts` 作为唯一消费者导入，为代理请求转发提供超时配置和头过滤规则。

## Functionality / Interface Details

### `MESSAGES_TIMEOUT_MS`

**Source**: `src/server/anthropic/types.ts`:12

**Functionality**: 定义 Anthropic Messages API（`/v1/messages`）端点的上游请求超时时长。Anthropic 的 Messages API 可能涉及大量 token 生成，尤其是流式响应场景下，单次请求可能持续数分钟。因此将超时设置为 600 秒（10 分钟），以覆盖 Claude 模型长文本生成的场景。

该常量被 `handler.ts` 中的 `getTimeoutForPath()` 函数在请求路径精确匹配 `/v1/messages` 时返回使用。

**核心代码**:
```typescript
export const MESSAGES_TIMEOUT_MS = 600_000;
```
Source: `src/server/anthropic/types.ts`:12

**使用示例**:
```typescript
import { MESSAGES_TIMEOUT_MS } from './types.js';

// 在 handler.ts 的 getTimeoutForPath() 中使用
if (pathOnly === '/v1/messages') {
  return MESSAGES_TIMEOUT_MS; // 600,000 ms = 600 秒
}
```
Explanation: 当请求路径为 `/v1/messages` 时，返回 600 秒的超时值，供 axios 请求配置使用。

---

### `DEFAULT_TIMEOUT_MS`

**Source**: `src/server/anthropic/types.ts`:15

**Functionality**: 定义所有非 Messages API 端点的默认上游请求超时时长。除了 `/v1/messages` 之外的代理路由（如 `/v1/messages/:path` 子路径、其他 Anthropic API 端点），通常返回速度较快，因此采用更短的 120 秒（2 分钟）超时。

该常量被 `handler.ts` 中的 `getTimeoutForPath()` 函数在请求路径不匹配 `/v1/messages` 时作为默认返回值使用。

**核心代码**:
```typescript
export const DEFAULT_TIMEOUT_MS = 120_000;
```
Source: `src/server/anthropic/types.ts`:15

**使用示例**:
```typescript
import { DEFAULT_TIMEOUT_MS } from './types.js';

// 在 handler.ts 的 getTimeoutForPath() 中作为默认值
function getTimeoutForPath(reqPath: string): number {
  const pathOnly = reqPath.split('?')[0];
  if (pathOnly === '/v1/messages') {
    return MESSAGES_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS; // 120,000 ms = 120 秒
}
```
Explanation: 对于 `/v1/messages` 以外的所有请求路径（如 `/v1/messages/count_tokens`），返回 120 秒的默认超时值。

---

### `HOP_BY_HOP_HEADERS`

**Source**: `src/server/anthropic/types.ts`:18

**Functionality**: 定义在代理转发请求时必须被移除的 hop-by-hop 请求头列表。Hop-by-hop 头是 HTTP/1.1 规范中定义的仅在单次连接范围内有效的头字段，不应被代理服务器转发给上游服务器：

- `host`：原始请求的主机名，转发时需要替换为上游服务器的主机名
- `content-length`：该头可能与经过处理后的请求体长度不一致（如 header 过滤、model 替换等操作），应由 HTTP 客户端（axios）重新计算
- `transfer-encoding`：表示传输编码方式，属于连接级别的头信息，不应跨连接转发

该常量使用 `as const` 断言，使 TypeScript 将其推导为只读元组类型 `readonly ["host", "content-length", "transfer-encoding"]`，从而在 `handler.ts` 的 `prepareModifiedHeaders()` 中实现类型安全的 `includes()` 调用。

**核心代码**:
```typescript
export const HOP_BY_HOP_HEADERS = ['host', 'content-length', 'transfer-encoding'] as const;
```
Source: `src/server/anthropic/types.ts`:18

**使用示例**:
```typescript
import { HOP_BY_HOP_HEADERS } from './types.js';

// 在 handler.ts 的 prepareModifiedHeaders() 中使用
function prepareModifiedHeaders(
  incomingHeaders: Record<string, string | string[] | undefined>,
  providerApiKey: string,
): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(incomingHeaders)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.includes(lowerKey as typeof HOP_BY_HOP_HEADERS[number])) {
      continue; // 跳过 hop-by-hop 头
    }
    headers[key] = value;
  }

  // 注入 provider 的认证信息
  headers['x-api-key'] = providerApiKey;
  headers['authorization'] = `Bearer ${providerApiKey}`;
  return headers;
}
```
Explanation: 遍历客户端请求头，将每个头名转为小写后与 `HOP_BY_HOP_HEADERS` 列表比对，如果匹配则跳过不转发；其余头保留并注入上游 API 认证凭证。

## Data Structures

### `HOP_BY_HOP_HEADERS` 常量类型

```typescript
export const HOP_BY_HOP_HEADERS = ['host', 'content-length', 'transfer-encoding'] as const;
```

由于 `as const` 断言，TypeScript 推导出的类型为：

```typescript
readonly ["host", "content-length", "transfer-encoding"]
```

类型 `typeof HOP_BY_HOP_HEADERS[number]` 即联合类型 `'host' | 'content-length' | 'transfer-encoding'`，确保 `includes()` 方法的参数类型检查是类型安全的。

### 超时常量类型

`MESSAGES_TIMEOUT_MS` 和 `DEFAULT_TIMEOUT_MS` 均为 `number` 类型的常量，值分别为 `600_000` 和 `120_000`。TypeScript 自动将其类型推导为字面量类型 `600000` 和 `120000`。

## Error Handling and Edge Cases

`types.ts` 为纯常量定义文件，不包含运行时逻辑，因此不存在运行时错误处理需求。

需要注意的边界情况：

1. **数字分隔符语法**：`600_000` 和 `120_000` 使用 ES2021 数字分隔符语法（numeric separators），在编译为 JavaScript 后分隔符被移除，不影响运行时值。此语法需要目标环境支持 ES2021 或 TypeScript 编译器正确降级。

2. **`as const` 与 includes 类型安全**：`HOP_BY_HOP_HEADERS` 使用 `as const` 后，`Array.prototype.includes()` 的参数类型被约束为元组成员类型。在 `handler.ts` 中调用时需要进行类型断言 `as typeof HOP_BY_HOP_HEADERS[number]` 才能通过 TypeScript 类型检查，因为 `string.toLowerCase()` 返回的是宽泛的 `string` 类型。

## Dependencies

- **Depends on**: 无。`types.ts` 是叶子模块，不依赖任何内部或外部模块。
- **Depended by**:
  - `src/server/anthropic/handler.ts` — 导入全部三个常量，用于 `prepareModifiedHeaders()`（header 过滤）和 `getTimeoutForPath()`（超时确定）

## Usage Examples

```typescript
// 1. 从 types.ts 导入共享常量
import { HOP_BY_HOP_HEADERS, MESSAGES_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from './types.js';

// 2. 使用超时常量构建 axios 请求配置
import axios from 'axios';

function forwardRequest(reqPath: string, headers: Record<string, string>, body: string) {
  const pathOnly = reqPath.split('?')[0];
  const timeout = pathOnly === '/v1/messages'
    ? MESSAGES_TIMEOUT_MS   // 600s for Messages API
    : DEFAULT_TIMEOUT_MS;   // 120s for other routes

  return axios({
    method: 'POST',
    url: `https://api.anthropic.com${reqPath}`,
    headers,
    data: body,
    timeout,
  });
}

// 3. 使用 HOP_BY_HOP_HEADERS 过滤不应转发的请求头
function sanitizeHeaders(incoming: Record<string, string>, apiKey: string) {
  const cleaned: Record<string, string> = {};

  for (const [key, value] of Object.entries(incoming)) {
    const lower = key.toLowerCase();
    // HOP_BY_HOP_HEADERS 类型安全的 includes 调用
    if (HOP_BY_HOP_HEADERS.includes(lower as typeof HOP_BY_HOP_HEADERS[number])) {
      continue;
    }
    cleaned[key] = value;
  }

  cleaned['x-api-key'] = apiKey;
  cleaned['authorization'] = `Bearer ${apiKey}`;
  return cleaned;
}
```

Explanation: 以上示例展示了 `types.ts` 中三个常量的典型使用模式。超时常量根据请求路径决定 axios 请求的超时配置；`HOP_BY_HOP_HEADERS` 用于在转发请求前过滤掉不应传递给上游服务器的连接级别头信息，同时注入上游 API 的认证凭证。
