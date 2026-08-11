# Session Settings

> Source files:
> - `src/utils/session.ts` : 1-124

## Overview

Session Settings 是 Furina 的会话级配置管理子系统，负责为每个代理会话（session）维护独立的配置状态。每个会话通过唯一的 `sessionId` 标识，其配置存储在 `~/.furina/sessions/<id>/settings.json` 文件中。

**设计动机与定位**：Furina 作为多代理（multi-agent）框架，不同代理会话需要独立的 provider 路由配置（例如不同阶段使用不同的 AI 模型）。Session Settings 提供了这种会话级隔离能力，使得每个代理可以独立配置当前使用的 provider、阶段路由映射、关联的 change 名称等，而不会相互干扰。

**使用场景**：
- 代理初始化时读取会话配置，确定当前应使用的 AI provider
- 用户通过 CLI 命令（如 `agents switch`）切换会话的 provider 配置
- API 请求转发时，通过 sessionId 解析实际应路由到的 provider
- 调试时将请求体（request body）快照写入会话目录

**涉及源文件及职责**：
- `src/utils/session.ts`：本 spec 的唯一源文件，封装了会话配置的完整生命周期——数据结构定义、读写 I/O、provider 解析、调试日志写入

## Architecture / Flow

Session Settings 的核心数据流如下：

```
CLI / API 请求
      │
      ▼
  getSessionFilePath(sessionId)    ← 拼接路径 ~/.furina/sessions/<id>/settings.json
      │
      ▼
  readSessionSettings(sessionId)   ← 读取并解析 JSON，标准化 cwd 路径
      │
      ▼
  getProviderBySessionId(sessionId) ← 根据 switchProviders 映射解析实际 Provider
      │
      ▼
  Provider 对象 → 用于 API 转发或 CLI 操作
```

Provider 解析的决策链：
1. 会话文件不存在 → 回退到 `getDefaultProvider()`
2. `currentProvider === 'default'` → 回退到 `getDefaultProvider()`
3. `switchProviders[currentProvider]` 为 `'default'` 或 `undefined` → 回退到 `getDefaultProvider()`
4. 通过 `getProviderByModels([modelValue])` 从 providers-store 中精确匹配 Provider

## Functionality / Interface Details

### `getSessionFilePath(sessionId: string) -> string`

**Source**: `src/utils/session.ts`:44-46

**Functionality**: 计算指定 session 的 `settings.json` 文件的绝对路径。路径格式为 `~/.furina/sessions/<sessionId>/settings.json`，使用 `os.homedir()` 获取用户主目录，确保跨平台兼容性。

**Parameters**:
- `sessionId` (`string`): 会话唯一标识符，不能为空

**Return Value**:
- `string`: `settings.json` 文件的绝对路径

**Core Logic**:
通过模块级常量 `SESSIONS_DIR`（`path.join(os.homedir(), '.furina', 'sessions')`）与 `sessionId` 和 `'settings.json'` 拼接成完整路径。

**Core Code**:
```typescript
const SESSIONS_DIR = path.join(os.homedir(), '.furina', 'sessions');

export function getSessionFilePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, 'settings.json');
}
```
Source: `src/utils/session.ts`:16-46

**Usage Example**:
```typescript
const filePath = getSessionFilePath('abc-123');
// → 'C:\Users\username\.furina\sessions\abc-123\settings.json'  (Windows)
// → '/home/username/.furina/sessions/abc-123/settings.json'     (Linux)
```
Explanation: 获取会话配置文件路径，可用于检查文件是否存在或手动读写操作。

---

### `readSessionSettings(sessionId: string) -> SessionSettings | null`

**Source**: `src/utils/session.ts`:53-64

**Functionality**: 读取并解析指定会话的 `settings.json` 配置文件。如果文件不存在则返回 `null`，不抛出异常。读取成功后会对 `cwd` 字段进行反斜杠标准化处理，解决 JSON 存储时反斜杠被双重转义的问题。

**Parameters**:
- `sessionId` (`string`): 会话唯一标识符

**Return Value**:
- `SessionSettings | null`: 解析后的会话配置对象，文件不存在时返回 `null`
- 文件解析异常（如 JSON 格式错误）会直接向上抛出

**Core Logic**:
1. 通过 `getSessionFilePath` 拼接文件路径
2. 使用 `fs.existsSync` 检查文件是否存在，不存在则返回 `null`
3. 使用 `fs.readFileSync` 同步读取文件内容（UTF-8 编码）
4. 通过 `JSON.parse` 解析为 `SessionSettings` 类型
5. **关键步骤**：对 `cwd` 字段执行 `settings.cwd.replace(/\\\\/g, '\\')`，将 JSON 中被双重转义的 `\\` 还原为单个 `\`（例如 `D:\\project-code\\llm` → `D:\project-code\llm`），确保 Windows 路径正确

**Core Code**:
```typescript
export function readSessionSettings(sessionId: string): SessionSettings | null {
  const filePath = getSessionFilePath(sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const settings = JSON.parse(raw) as SessionSettings;
  // Normalize cwd: resolve double-escaped backslashes from stored JSON
  // (e.g., D:\\project-code\\llm -> D:\project-code\llm)
  settings.cwd = settings.cwd.replace(/\\\\/g, '\\');
  return settings;
}
```
Source: `src/utils/session.ts`:53-64

**Usage Example**:
```typescript
const settings = readSessionSettings('abc-123');
if (settings) {
  console.log(settings.currentProvider);  // 'coding'
  console.log(settings.cwd);              // 'D:\project-code\llm' (already normalized)
} else {
  console.log('Session not found');
}
```
Explanation: 读取会话配置并检查是否成功。`cwd` 路径已被标准化，可直接使用。

---

### `writeSessionSettings(sessionId: string, settings: SessionSettings) -> void`

**Source**: `src/utils/session.ts`:71-78

**Functionality**: 将会话配置对象以格式化 JSON（2 空格缩进）写入磁盘。自动创建缺失的目录结构，确保写入路径可达。

**Parameters**:
- `sessionId` (`string`): 会话唯一标识符
- `settings` (`SessionSettings`): 要写入的会话配置对象，需符合 `SessionSettings` 接口定义

**Return Value**:
- `void`: 无返回值。写入失败时直接抛出文件系统异常

**Core Logic**:
1. 通过 `getSessionFilePath` 拼接目标文件路径
2. 使用 `path.dirname` 提取父目录
3. 若父目录不存在，通过 `fs.mkdirSync(dir, { recursive: true })` 递归创建目录
4. 使用 `fs.writeFileSync` 写入格式化 JSON（`JSON.stringify(settings, null, 2)`）

**Core Code**:
```typescript
export function writeSessionSettings(sessionId: string, settings: SessionSettings): void {
  const filePath = getSessionFilePath(sessionId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
}
```
Source: `src/utils/session.ts`:71-78

**Usage Example**:
```typescript
const settings: SessionSettings = {
  sessionId: 'abc-123',
  cwd: 'D:\\project-code\\llm',
  currentProvider: 'coding',
  switchProviders: { coding: 'claude-sonnet-4-20250514', explore: 'default' },
  change: 'my-feature',
};
writeSessionSettings('abc-123', settings);
// 文件写入 ~/.furina/sessions/abc-123/settings.json
```
Explanation: 创建或更新会话配置文件。目录会自动创建，无需手动 `mkdir`。

---

### `getProviderBySessionId(sessionId: string) -> Provider | null`

**Source**: `src/utils/session.ts`:88-105

**Functionality**: 根据会话 ID 解析出实际应使用的 AI Provider 对象。这是 Session Settings 子系统最核心的函数，将会话配置中的抽象阶段名（如 `coding`、`explore`）映射到具体的 AI 模型，再从 providers-store 中查找匹配的 Provider。该函数是 API 请求代理转发时确定目标 provider 的关键入口。

**Parameters**:
- `sessionId` (`string`): 会话唯一标识符

**Return Value**:
- `Provider | null`: 解析到的 Provider 对象，或在无法匹配时返回 `null`
- 返回 `null` 的场景：会话文件不存在且默认 provider 也未配置；switchProviders 映射的 model 在 providers-store 中找不到匹配的 provider

**Core Logic**:
Provider 解析的完整决策链如下：
1. 调用 `readSessionSettings(sessionId)` 读取会话配置
2. **null 检查**：会话配置不存在 → 调用 `getDefaultProvider()` 返回系统默认 provider
3. **default 检查**：`currentProvider` 为 `'default'` → 调用 `getDefaultProvider()` 返回默认 provider
4. **switchProviders 映射**：从 `switchProviders[currentProvider]` 中获取目标 model 名称
5. **映射值检查**：映射结果为 `'default'` 或 `undefined`（该阶段未配置映射） → 调用 `getDefaultProvider()`
6. **精确匹配**：调用 `getProviderByModels([modelValue])` 从 providers-store 的所有已启用 provider 中，通过 `defaultModel`、`sonnetModel`、`opusModel`、`haikuModel` 四个字段匹配，找到包含目标 model 的 provider

**Core Code**:
```typescript
export function getProviderBySessionId(sessionId: string): Provider | null {
  const settings = readSessionSettings(sessionId);
  if (settings === null) {
    return getDefaultProvider();
  }

  if (settings.currentProvider === 'default') {
    return getDefaultProvider();
  }

  const modelValue = settings.switchProviders[settings.currentProvider];
  if (modelValue === 'default' || modelValue === undefined) {
    return getDefaultProvider();
  }

  const result = getProviderByModels([modelValue]);
  return result[modelValue] ?? null;
}
```
Source: `src/utils/session.ts`:88-105

**Usage Example**:
```typescript
// 在 API 转发 handler 中使用
const sessionId = req.headers['x-session-id'] as string;
const provider = getProviderBySessionId(sessionId);

if (provider && provider.apiKey && provider.baseUrl) {
  // 使用该 provider 转发请求
  const upstreamUrl = `${provider.baseUrl}/v1/messages`;
  // ...
} else {
  res.status(503).json({ error: 'No valid provider available' });
}
```
Explanation: 典型的 API 代理场景。从请求头中提取 sessionId，解析出对应的 provider，然后将请求转发到该 provider 的上游服务。

---

### `writeSessionBodyJson(sessionId: string, rawBody: string) -> void`

**Source**: `src/utils/session.ts`:113-123

**Functionality**: 将 API 请求的原始 body 以格式化 JSON 写入会话目录下的 `anthropic.json` 文件，用于调试目的。这是一个纯辅助功能，旨在帮助开发者追踪代理转发的请求内容。整个函数包裹在 try-catch 中，任何失败都静默忽略。

**Parameters**:
- `sessionId` (`string`): 会话唯一标识符
- `rawBody` (`string`): 原始请求体字符串，预期为合法 JSON

**Return Value**:
- `void`: 无返回值。所有错误静默吞掉，不会影响主流程

**Core Logic**:
1. 拼接会话目录路径 `~/.furina/sessions/<sessionId>/`
2. 若目录不存在，递归创建
3. 将 `rawBody` 解析为 JSON 再重新序列化为格式化字符串（`JSON.stringify(JSON.parse(rawBody), null, 2)`）
4. 写入 `anthropic.json` 文件
5. 整个操作在 try-catch 中执行，catch 为空（静默失败）

**Core Code**:
```typescript
export function writeSessionBodyJson(sessionId: string, rawBody: string): void {
  try {
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    fs.writeFileSync(path.join(sessionDir, 'anthropic.json'), JSON.stringify(JSON.parse(rawBody), null, 2), 'utf-8');
  } catch {
    // Silent fallback
  }
}
```
Source: `src/utils/session.ts`:113-123

**Usage Example**:
```typescript
// 在 proxy handler 中，每次代理请求时记录请求体
writeSessionBodyJson(sessionId, rawBody);
// 文件写入 ~/.furina/sessions/abc-123/anthropic.json
// 内容为格式化的 JSON 请求体，便于调试查看
```
Explanation: 每次 API 代理转发请求时调用，将请求体快照保存到会话目录，方便开发者在调试时查看实际发送给上游的请求内容。

## Data Structures

### `SessionSettings`
```typescript
export interface SessionSettings {
  sessionId: string;
  cwd: string;
  currentProvider: string;
  switchProviders: Record<string, string>;
  change?: string;
  brainstorm?: boolean;
  prompt?: string;
}
```
- `sessionId` (`string`): 会话唯一标识符，作为文件路径的一部分和会话识别键
- `cwd` (`string`): 创建会话时的工作目录路径。读取时会自动标准化 Windows 反斜杠
- `currentProvider` (`string`): 当前激活的 provider 阶段名。值为 `'default'` 时回退到系统默认 provider；其他值（如 `'coding'`、`'explore'`）会通过 `switchProviders` 映射到具体 model
- `switchProviders` (`Record<string, string>`): 阶段名到 model 名称的映射表。键为阶段名（如 `coding`、`explore`、`propose`），值为 model 名称（如 `'claude-sonnet-4-20250514'`）或 `'default'`
- `change` (`string`, 可选): 关联的 change 名称，标识当前会话属于哪个变更流程
- `brainstorm` (`boolean`, 可选): 是否启用 brainstorm 模式
- `prompt` (`string`, 可选): 会话的初始 prompt 文本

### 常量
```typescript
const SESSIONS_DIR = path.join(os.homedir(), '.furina', 'sessions');
```
- 模块级常量，定义会话配置的根目录。使用 `os.homedir()` 保证跨平台兼容

## Error Handling and Edge Cases

1. **会话文件不存在**：`readSessionSettings` 返回 `null`，不抛异常。`getProviderBySessionId` 遇到 `null` 后回退到 `getDefaultProvider()`
2. **JSON 解析失败**：`readSessionSettings` 中的 `JSON.parse` 不在 try-catch 中，若文件内容非法 JSON 会直接向上抛出异常
3. **cwd 双重转义问题**：JSON 存储 Windows 路径时反斜杠会被转义为 `\\`，`readSessionSettings` 通过 `replace(/\\\\/g, '\\')` 将其还原。这是 Windows 平台特有的处理
4. **目录不存在**：`writeSessionSettings` 和 `writeSessionBodyJson` 均在写入前检查并递归创建目录
5. **调试写入静默失败**：`writeSessionBodyJson` 的 try-catch 将所有错误吞掉，确保调试功能不影响主请求流程
6. **switchProviders 映射缺失**：当 `currentProvider` 指向的阶段在 `switchProviders` 中无对应条目时（`undefined`），回退到默认 provider
7. **model 匹配失败**：`getProviderByModels` 找不到包含目标 model 的 provider 时，返回 `null`

## Dependencies

### Depends on
- **`src/server/providers-store.ts`**（spec-provider-templates 所属子系统之外的 provider 管理层）
  - `getDefaultProvider()`: 获取系统默认 Provider（基于 activeProviderId 或第一个已启用的 provider）
  - `getProviderByModels(models)`: 根据 model 名称列表从所有已启用的 provider 中查找匹配项
  - `Provider` 类型: Provider 对象的 TypeScript 类型定义
- **Node.js 内置模块**: `fs`（文件同步读写）、`os`（获取主目录）、`path`（路径拼接）

### Depended by
- **`src/server/anthropic/handler.ts`**: API 代理转发 handler，在处理每个请求时调用 `getProviderBySessionId` 确定目标 provider，调用 `writeSessionBodyJson` 记录请求体
- **`src/commands/agents.ts`**: agents CLI 命令模块，调用 `readSessionSettings`、`writeSessionSettings`、`getSessionFilePath` 实现代理的查看、切换、初始化等操作
- **`src/commands/change/stage.ts`**: change stage CLI 命令，调用 `readSessionSettings` 获取当前会话的 change 信息以执行阶段推进

## Usage Examples

### 完整的会话生命周期示例

```typescript
import {
  readSessionSettings,
  writeSessionSettings,
  getProviderBySessionId,
  writeSessionBodyJson,
  type SessionSettings,
} from './utils/session.js';

// 1. 创建新会话
const sessionId = 'agent-xyz-001';
const settings: SessionSettings = {
  sessionId,
  cwd: process.cwd(),
  currentProvider: 'coding',
  switchProviders: {
    explore: 'claude-haiku-4-20250506',
    coding: 'claude-sonnet-4-20250514',
    propose: 'default',
  },
  change: 'feature-auth',
  brainstorm: false,
};
writeSessionSettings(sessionId, settings);

// 2. 读取会话配置
const loaded = readSessionSettings(sessionId);
console.log(loaded?.currentProvider);  // 'coding'
console.log(loaded?.cwd);             // 已标准化的路径

// 3. 解析 provider（API 代理场景）
const provider = getProviderBySessionId(sessionId);
if (provider) {
  console.log(provider.baseUrl);  // 'https://api.anthropic.com'
  console.log(provider.apiKey);   // 'sk-ant-...'
}

// 4. 调试日志写入
const rawBody = JSON.stringify({ model: 'claude-sonnet-4-20250514', messages: [...] });
writeSessionBodyJson(sessionId, rawBody);
// → ~/.furina/sessions/agent-xyz-001/anthropic.json
```

Explanation:
- 步骤 1：构建 `SessionSettings` 对象并写入磁盘。`switchProviders` 配置了 explore 阶段用 Haiku、coding 阶段用 Sonnet、propose 阶段用默认 provider
- 步骤 2：从磁盘读取配置，`cwd` 已自动标准化
- 步骤 3：通过 `getProviderBySessionId` 解析 provider。此时 `currentProvider` 为 `'coding'`，`switchProviders['coding']` 为 `'claude-sonnet-4-20250514'`，系统会在 providers-store 中找到配置了该 model 的 provider
- 步骤 4：将请求体快照写入会话目录的 `anthropic.json`，失败时静默忽略
