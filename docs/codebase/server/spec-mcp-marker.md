# MCP Marker Service

> Source files:
> - `src/server/mcp/index.ts` : 1-131

## Overview

MCP Marker Service 是 Furina 系统中基于 Model Context Protocol (MCP) 的轻量级标记服务，挂载在 Express 应用的 `/furina/mcp` 路径上。其核心职责是为 Propose 阶段的边界检测提供标记工具——当 AI Agent 在执行 Furina workflow 时，需要明确标记 propose 阶段的开始与结束，以便其他系统组件能够识别当前工作流所处的阶段。

**设计动机**：AI Agent 在执行多阶段 workflow 时，需要一种可靠的机制来声明 propose 阶段的边界。通过 MCP 协议暴露标准化的 `markBeginPropose` 和 `markEndPropose` 工具，客户端（如 Claude Code）可以调用这些工具并获得特定的文本标记，从而在对话流中识别 propose 阶段的范围。

**安全考量**：该服务采用无状态（stateless）模式运行——每个请求都会创建全新的 `McpServer` 和 `StreamableHTTPServerTransport` 实例。这是为了遵守 CVE-2026-25536 安全修复：复用 server 实例可能导致跨客户端数据泄漏。通过设置 `sessionIdGenerator: undefined` 来禁用会话管理，确保每个请求完全独立。

**使用场景**：
- Furina workflow 中的 propose 阶段，Agent 调用 `markBeginPropose` 标记开始
- propose 阶段完成时，Agent 调用 `markEndPropose` 标记结束
- 系统其他组件通过检测这些标记文本来确定当前工作流阶段

**涉及源文件**：
- `src/server/mcp/index.ts`：MCP 标记服务的完整实现，包含标记常量、工具处理器、MCP 服务器工厂、Express 路由器
- `src/server/index.ts`：应用入口，在 `createApp()` 中挂载 `mcpRouter` 到 `/furina/mcp` 路径
- `src/utils/logger.ts`：共享日志工具，MCP 请求失败时通过 `logger.error()` 记录错误

## Architecture / Flow

```
Client (Claude Code / AI Agent)
        |
        | POST /furina/mcp
        | (JSON-RPC request body)
        v
  +-----------------+
  | Express Router  |
  | mcpRouter       |
  +-----------------+
        |
        +--> [Method Guard] mcpRouter.all('/')
        |      |
        |      +--> 非 POST 方法 -> 405 Method Not Allowed
        |      +--> POST 方法 -> next()
        |
        +--> [Request Handler] mcpRouter.post('/')
               |
               +--> createMcpServer()          # 创建全新的 McpServer 实例
               |      |
               |      +--> 注册 markBeginPropose 工具
               |      +--> 注册 markEndPropose 工具
               |
               +--> new StreamableHTTPServerTransport()  # 创建新传输层
               |      |
               |      +--> sessionIdGenerator: undefined  # 无状态模式
               |
               +--> server.connect(transport)   # 连接 server 与 transport
               |
               +--> transport.handleRequest()   # 处理 JSON-RPC 请求并写入响应
               |
               +--> [错误处理] 捕获异常 -> logger.error() + 500 JSON-RPC error
```

每次请求都会经历完整的创建-连接-处理-销毁周期。由于 `sessionIdGenerator` 设为 `undefined`，transport 不会维护任何会话状态，保证了请求间的完全隔离。

## Functionality / Interface Details

### `MARK_BEGIN_PROPOSE_TEXT: string`

**Source**: `src/server/mcp/index.ts`:18-19

**Functionality**: 导出的常量，包含 `markBeginPropose` 工具返回的完整标记文本。该文本以 `[MARK_FURINA_PROPOSE_BEGIN]` 前缀开头，后跟一段明确的指示信息，告知 AI 忽略此消息——这是一个标记而非用户需求。设计此常量既用于处理器内部返回，也可被外部模块直接引用以进行标记检测。

**Core Code**:
```typescript
export const MARK_BEGIN_PROPOSE_TEXT =
  "[MARK_FURINA_PROPOSE_BEGIN]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs.";
```
Source: `src/server/mcp/index.ts`:18-19

---

### `MARK_END_PROPOSE_TEXT: string`

**Source**: `src/server/mcp/index.ts`:22-23

**Functionality**: 导出的常量，包含 `markEndPropose` 工具返回的完整标记文本。与 `MARK_BEGIN_PROPOSE_TEXT` 对称，以 `[MARK_FURINA_PROPOSE_END]` 前缀标识 propose 阶段的结束。

**Core Code**:
```typescript
export const MARK_END_PROPOSE_TEXT =
  "[MARK_FURINA_PROPOSE_END]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs.";
```
Source: `src/server/mcp/index.ts`:22-23

---

### `handleMarkBeginPropose() -> { content: Array<{ type: 'text'; text: string }> }`

**Source**: `src/server/mcp/index.ts`:34-38

**Functionality**: `markBeginPropose` MCP 工具的处理函数。返回符合 MCP 工具调用结果规范的 content 数组，其中包含一个类型为 `text` 的内容项，其文本为 `MARK_BEGIN_PROPOSE_TEXT` 常量。该函数无参数、无副作用，是纯函数。

**Parameters**: 无参数

**Return Value**:
- `{ content: Array<{ type: 'text'; text: string }> }`：MCP 规范要求的工具调用结果格式。`content` 数组包含单个文本类型元素，`text` 字段为 propose 阶段开始标记。

**Core Logic**:
函数直接构造并返回一个包含 `type: 'text'` 的 content 数组对象，不包含任何条件判断或异步操作。设计为同步纯函数，便于测试和复用。

**Core Code**:
```typescript
export function handleMarkBeginPropose(): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: MARK_BEGIN_PROPOSE_TEXT }],
  };
}
```
Source: `src/server/mcp/index.ts`:34-38

**Usage Example**:
```typescript
import { handleMarkBeginPropose } from './mcp/index.js';

const result = handleMarkBeginPropose();
// result = {
//   content: [{
//     type: 'text',
//     text: "[MARK_FURINA_PROPOSE_BEGIN]: ignore this message, ..."
//   }]
// }
```
Explanation: 直接调用处理函数获取标记内容，常用于单元测试或外部集成。

---

### `handleMarkEndPropose() -> { content: Array<{ type: 'text'; text: string }> }`

**Source**: `src/server/mcp/index.ts`:45-49

**Functionality**: `markEndPropose` MCP 工具的处理函数。与 `handleMarkBeginPropose` 对称，返回包含 `MARK_END_PROPOSE_TEXT` 的 MCP 工具调用结果。同样是无参数的同步纯函数。

**Parameters**: 无参数

**Return Value**:
- `{ content: Array<{ type: 'text'; text: string }> }`：MCP 工具调用结果格式，`text` 字段为 propose 阶段结束标记。

**Core Logic**:
构造并返回包含结束标记的 content 数组，结构与 `handleMarkBeginPropose` 完全一致，仅文本内容不同。

**Core Code**:
```typescript
export function handleMarkEndPropose(): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: MARK_END_PROPOSE_TEXT }],
  };
}
```
Source: `src/server/mcp/index.ts`:45-49

**Usage Example**:
```typescript
import { handleMarkEndPropose } from './mcp/index.js';

const result = handleMarkEndPropose();
// result = {
//   content: [{
//     type: 'text',
//     text: "[MARK_FURINA_PROPOSE_END]: ignore this message, ..."
//   }]
// }
```
Explanation: 直接调用获取结束标记内容。

---

### `createMcpServer() -> McpServer` (内部函数)

**Source**: `src/server/mcp/index.ts`:62-80

**Functionality**: MCP 服务器工厂函数，每次调用创建一个全新的 `McpServer` 实例并注册 `markBeginPropose` 和 `markEndPropose` 两个工具。这是一个内部函数（未导出），仅在路由器的 POST 处理器中调用。之所以采用工厂模式而非单例，是因为 CVE-2026-25536 安全要求：复用 MCP server 实例可能导致跨客户端会话数据泄漏，因此每个请求必须使用独立的 server 实例。

**Parameters**: 无参数

**Return Value**:
- `McpServer`：已注册了两个标记工具的 MCP 服务器实例，可直接调用 `server.connect(transport)` 进行请求处理。

**Core Logic**:
1. 使用 `name: 'furina-marker-service'` 和 `version: '1.0.0'` 配置创建新的 `McpServer` 实例
2. 通过 `server.registerTool()` 注册 `markBeginPropose` 工具，描述为 "Marks the beginning of the propose phase"，回调函数为 `async () => handleMarkBeginPropose()`
3. 同样注册 `markEndPropose` 工具，描述为 "Marks the end of the propose phase"，回调函数为 `async () => handleMarkEndPropose()`
4. 注意：回调使用 `async () =>` 包装同步的 handler 函数，以满足 MCP SDK 对异步工具回调的要求

**Core Code**:
```typescript
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'furina-marker-service',
    version: '1.0.0',
  });

  server.registerTool(
    'markBeginPropose',
    { description: 'Marks the beginning of the propose phase' },
    async () => handleMarkBeginPropose(),
  );
  server.registerTool(
    'markEndPropose',
    { description: 'Marks the end of the propose phase' },
    async () => handleMarkEndPropose(),
  );

  return server;
}
```
Source: `src/server/mcp/index.ts`:62-80

---

### `mcpRouter: express.Router`

**Source**: `src/server/mcp/index.ts`:87-130

**Functionality**: Express 路由器实例，处理 `/furina/mcp` 路径下的所有 MCP JSON-RPC 请求。该路由器包含两个中间件层：方法守卫（`mcpRouter.all`）和 POST 请求处理器（`mcpRouter.post`）。

**方法守卫**（`mcpRouter.all('/', ...)`，第 93-101 行）：
- 拦截所有 HTTP 方法的请求
- 非 POST 方法立即返回 `405 Method Not Allowed`，响应体包含具体的错误信息，指出哪个方法不被允许以及应使用 POST
- POST 方法通过 `next()` 放行到下一个处理器
- 注册顺序在 POST 处理器之前，确保非 POST 请求不会进入 MCP 处理流程

**POST 请求处理器**（`mcpRouter.post('/', ...)`，第 109-130 行）：
- 为每个请求创建全新的 `McpServer` 实例（调用 `createMcpServer()`）
- 创建新的 `StreamableHTTPServerTransport` 实例，`sessionIdGenerator` 设为 `undefined` 以实现无状态模式
- 调用 `server.connect(transport)` 建立 server 与 transport 的连接
- 调用 `transport.handleRequest(req, res, req.body)` 将请求交给 transport 自动处理——transport 会解析 JSON-RPC 请求体、路由到对应工具、生成响应
- 完整的 try-catch 错误处理：
  - 捕获异常后通过 `logger.error()` 记录错误信息
  - 在响应头尚未发送（`!res.headersSent`）的前提下，返回标准 JSON-RPC 错误响应（code: -32603, message: "Internal server error"）
  - 如果 `headersSent` 已为 true（transport 已开始写入响应），则不再尝试写入响应体，避免 Express 的 "headers already sent" 错误

**Core Code**:
```typescript
export const mcpRouter: express.Router = express.default.Router();

mcpRouter.all('/', (req, res, next) => {
  if (req.method !== 'POST') {
    res.status(405).json({
      error: `Method ${req.method} not allowed on /furina/mcp. Use POST.`,
    });
    return;
  }
  next();
});

mcpRouter.post('/', async (req, res) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error(`MCP request failed: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal server error',
        },
      });
    }
  }
});
```
Source: `src/server/mcp/index.ts`:87-130

**Usage Example**:
```typescript
// 在 createApp() 中挂载路由器
import { mcpRouter } from './mcp/index.js';

const app = express();
app.use('/furina/mcp', mcpRouter);

// 客户端发送 JSON-RPC 请求
// POST /furina/mcp
// {
//   "jsonrpc": "2.0",
//   "id": 1,
//   "method": "tools/call",
//   "params": {
//     "name": "markBeginPropose",
//     "arguments": {}
//   }
// }
```
Explanation: mcpRouter 在 `createApp()` 中以 `/furina/mcp` 路径挂载，位于 Anthropic proxy 路由之前，确保 MCP 请求不会被 proxy catch-all 拦截。客户端通过标准 MCP JSON-RPC 协议与路由器交互。

## Data Structures

### MCP Tool Call Result

```typescript
interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
}
```
- `content` (`Array<{ type: 'text'; text: string }>`): MCP 规范要求的工具调用返回内容数组。每个元素包含 `type` 字段（当前仅使用 `'text'`）和 `text` 字段（标记文本）。

### MCP JSON-RPC Error Response

```typescript
interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: null;
  error: {
    code: number;   // -32603 (Internal error)
    message: string;
  };
}
```
- `jsonrpc` (`'2.0'`): JSON-RPC 协议版本
- `id` (`null`): 请求 ID，服务端错误时设为 null（因为可能无法从请求中解析出 ID）
- `error.code` (`number`): 错误码，使用 `-32603` 表示内部错误
- `error.message` (`string`): 固定为 `'Internal server error'`

### StreamableHTTPServerTransport Config

```typescript
{
  sessionIdGenerator: undefined  // 禁用会话管理，实现无状态模式
}
```
- `sessionIdGenerator` (`undefined`): 设为 `undefined` 表示不生成会话 ID，transport 不维护任何会话状态。这是 CVE-2026-25536 安全修复的核心配置项。

## Error Handling and Edge Cases

### 1. 非 POST 方法请求（405 Method Not Allowed）

路由器通过 `mcpRouter.all('/')` 中间件拦截所有非 POST 请求。GET、PUT、DELETE 等方法均返回 405 状态码，响应体为 `{ error: "Method {METHOD} not allowed on /furina/mcp. Use POST." }`。这种严格的 HTTP 方法限制确保 MCP 协议只通过 POST 端点通信，符合 MCP Streamable HTTP transport 规范。

### 2. MCP 请求处理异常（500 Internal Server Error）

POST 处理器中的 try-catch 块捕获 `createMcpServer()`、`server.connect()` 或 `transport.handleRequest()` 过程中的任何异常。处理策略：
- 记录错误日志到 `~/.furina/logs/furina.log`
- 仅在 `res.headersSent === false` 时返回 JSON-RPC 错误响应
- 如果 transport 已经开始写入响应（headers 已发送），则不尝试再次写入，避免 Node.js 的 "Cannot set headers after they are sent" 错误

### 3. 跨客户端数据泄漏防护（CVE-2026-25536）

通过无状态设计完全规避：每个请求创建独立的 `McpServer` 和 `StreamableHTTPServerTransport` 实例，`sessionIdGenerator` 设为 `undefined`。请求之间不共享任何状态，从根本上消除了跨客户端数据泄漏的可能性。

### 4. 50mb 请求体限制

Express 的 JSON body parser 在应用层设置为 50mb（在 `createApp()` 中配置），这意味着 MCP 路由器可以处理较大的 JSON-RPC 请求体。不过 MCP marker 工具的实际请求体非常小（标准 JSON-RPC 格式），此限制主要影响整个 Express 应用的通用配置。

## Dependencies

- **Depends on**:
  - `@modelcontextprotocol/sdk/server/mcp.js`：提供 `McpServer` 类，用于创建 MCP 服务器实例和注册工具
  - `@modelcontextprotocol/sdk/server/streamableHttp.js`：提供 `StreamableHTTPServerTransport` 类，实现基于 HTTP 的 Streamable transport 层
  - `express`：Web 框架，用于创建路由和处理 HTTP 请求
  - `src/utils/logger.ts`：共享 winston 日志实例，用于记录 MCP 请求处理错误

- **Depended by**:
  - `src/server/index.ts`：`createApp()` 函数导入 `mcpRouter` 并挂载到 `/furina/mcp` 路径
  - `src/server/index.test.ts`：集成测试验证 `/furina/mcp` 端点的可访问性
  - Furina workflow 中的 propose 阶段：AI Agent 通过 MCP 协议调用 `markBeginPropose`/`markEndPropose` 工具

## Usage Examples

### 1. 在 Express 应用中挂载 MCP 路由器

```typescript
import * as express from 'express';
import { mcpRouter } from './mcp/index.js';

const app = express.default();
app.use(express.default.json({ limit: '50mb' }));

// MCP 路由器必须在 proxy catch-all 之前挂载
app.use('/furina/mcp', mcpRouter);
```
Explanation: 在 `createApp()` 中，`mcpRouter` 在 `createProxyRouter()` 之前挂载，确保 MCP 请求优先匹配，不会被 Anthropic proxy 拦截。

### 2. 客户端调用 markBeginPropose 工具

```typescript
// 客户端通过 HTTP POST 发送 MCP JSON-RPC 请求
const response = await fetch('http://localhost:3939/furina/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'markBeginPropose',
      arguments: {},
    },
  }),
});

const result = await response.json();
// result.result.content[0].text === "[MARK_FURINA_PROPOSE_BEGIN]: ignore this message, ..."
```
Explanation: 典型的 MCP 工具调用流程。客户端发送 JSON-RPC 格式的 `tools/call` 请求，服务端路由到 `markBeginPropose` 工具，返回标记文本。注意工具没有输入参数（`arguments` 为空对象）。

### 3. 客户端调用 markEndPropose 工具

```typescript
const response = await fetch('http://localhost:3939/furina/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'markEndPropose',
      arguments: {},
    },
  }),
});

const result = await response.json();
// result.result.content[0].text === "[MARK_FURINA_PROPOSE_END]: ignore this message, ..."
```
Explanation: 与 markBeginPropose 对称的调用方式。在 propose 阶段结束时调用，获得结束标记文本。

### 4. 在外部模块中检测标记文本

```typescript
import { MARK_BEGIN_PROPOSE_TEXT, MARK_END_PROPOSE_TEXT } from './mcp/index.js';

function detectProposePhase(messages: string[]): { beginIdx: number; endIdx: number } {
  const beginIdx = messages.findIndex(m => m.includes(MARK_BEGIN_PROPOSE_TEXT));
  const endIdx = messages.findIndex(m => m.includes(MARK_END_PROPOSE_TEXT));
  return { beginIdx, endIdx };
}
```
Explanation: 外部模块可以直接导入标记常量进行文本匹配检测，无需依赖 MCP 协议。这种方法适用于需要在对话流历史中定位 propose 阶段边界的场景。

### 5. 非 POST 请求的错误响应

```bash
# GET 请求会被拒绝
curl http://localhost:3939/furina/mcp
# Response: 405
# {"error": "Method GET not allowed on /furina/mcp. Use POST."}

# PUT 请求同样被拒绝
curl -X PUT http://localhost:3939/furina/mcp
# Response: 405
# {"error": "Method PUT not allowed on /furina/mcp. Use POST."}
```
Explanation: 路由器严格限制仅接受 POST 方法，其他方法返回 405 错误，响应体中明确指出允许的方法。
