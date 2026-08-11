# Environment Variable Generation

> Source files:
> - `src/server/claude-settings.ts` : 14-51, 129-182

## Overview

本 spec 文档描述 `claude-settings.ts` 中的环境变量配置生成功能。该模块位于 Furina 服务端 Claude 设置管理子系统中，负责根据当前运行模式（代理模式 / 直连模式）生成正确的 ANTHROPIC_* 环境变量配置对象，并将其写入 `~/.claude/settings.json`。

**设计动机：** Claude CLI 通过读取 `~/.claude/settings.json` 中的 `env` 键获取连接配置（API 地址、密钥、模型映射等）。Furina 需要在两种工作模式之间切换：代理模式（所有请求经本地代理转发）和直连模式（直接连接第三方 Provider API）。本模块将两种模式的环境变量配置逻辑封装为纯函数，确保调用方只需关心模式选择，不需了解具体的环境变量名称和映射规则。

**使用场景：**
- **启用代理模式**：`furina enable` CLI 命令或 Web UI 启用代理开关时，调用 `getProxyEnv()` 生成代理模式的固定配置。
- **切换/更新活跃 Provider**：Web UI 中切换活跃 Provider、更新 Provider 配置、禁用 Provider 时，根据 proxy 开关状态选择 `getProxyEnv()` 或 `getProviderEnv()` 再写入 Claude 设置。
- **禁用代理模式**：`furina disable` CLI 命令或 Web UI 关闭代理开关时，调用 `getProviderEnv(activeProvider)` 恢复直连配置。

**涉及源文件及其职责：**
- `src/server/claude-settings.ts`：定义 `TELEMETRY_SUPPRESSION` 常量、`PROXY_BASE_URL` / `PROXY_AUTH_TOKEN` 常量、`EnvObject` / `ProviderEnvInput` 类型，以及 `getProxyEnv()` / `getProviderEnv()` / `writeEnvToClaudeSettings()` 三个核心函数。

## Architecture / Flow

环境变量配置的生成与写入遵循以下流程：

```
调用方（routes/providers.ts / commands/enable.ts / commands/disable.ts）
    │
    ├─ 代理模式 ──> getProxyEnv()
    │                   │
    │                   ├─ 合并固定值: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN
    │                   ├─ 合并 TELEMETRY_SUPPRESSION 标志
    │                   └─ 设置 NO_PROXY=localhost
    │
    └─ 直连模式 ──> getProviderEnv(provider)
                        │
                        ├─ 映射 provider.baseUrl       → ANTHROPIC_BASE_URL
                        ├─ 映射 provider.apiKey         → ANTHROPIC_AUTH_TOKEN
                        ├─ 映射 provider.defaultModel   → ANTHROPIC_MODEL
                        ├─ 映射 provider.haikuModel      → ANTHROPIC_DEFAULT_HAIKU_MODEL
                        ├─ 映射 provider.sonnetModel     → ANTHROPIC_DEFAULT_SONNET_MODEL
                        ├─ 映射 provider.opusModel       → ANTHROPIC_DEFAULT_OPUS_MODEL
                        ├─ 合并 TELEMETRY_SUPPRESSION 标志
                        └─ 设置 NO_PROXY=localhost
    │
    ▼
writeEnvToClaudeSettings(env)
    │
    ├─ readClaudeSettings() 读取现有配置
    ├─ 替换 settings.env 字段
    └─ writeClaudeSettings() 写回文件（保留其他顶层键）
```

两种模式的关键区别：
1. **代理模式**使用固定值（`http://localhost:3939`、`sk-1234`），不接受参数，不映射模型字段。
2. **直连模式**从 `ProviderEnvInput` 接口映射全部 Provider 配置字段到 ANTHROPIC_* 环境变量，未定义的字段回退为空字符串。
3. 两者都共享 `TELEMETRY_SUPPRESSION` 标志集和 `NO_PROXY=localhost` 设置。

## Functionality / Interface Details

### `getProxyEnv() -> EnvObject`

**Source**: `src/server/claude-settings.ts` : 139-146

**Functionality**: 生成代理模式下的固定环境变量配置对象。当 Furina 以代理模式运行时，Claude CLI 的所有 API 请求都应指向本地代理服务（`localhost:3939`），并使用固定的模拟认证令牌 `sk-1234`。此函数不接受任何参数，始终返回相同的配置对象，确保代理模式配置的确定性和一致性。

**Parameters**: 无。

**Return Value**:
- `EnvObject` (`Record<string, string>`): 包含以下键值对的环境变量对象：
  - `ANTHROPIC_BASE_URL`：固定为 `http://localhost:3939`（本地代理地址）
  - `ANTHROPIC_AUTH_TOKEN`：固定为 `sk-1234`（代理验证用模拟令牌）
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`：`'1'`
  - `DISABLE_ERROR_REPORTING`：`'1'`
  - `DISABLE_NON_ESSENTIAL_MODEL_CALLS`：`'1'`
  - `DISABLE_TELEMETRY`：`'1'`
  - `NO_PROXY`：`'localhost'`（确保 localhost 通信不经过代理）

**Core Logic**:
函数通过对象展开运算符合并三部分配置：1) 固定的 `PROXY_BASE_URL` 和 `PROXY_AUTH_TOKEN` 常量；2) `TELEMETRY_SUPPRESSION` 对象中四项遥测抑制标志；3) `NO_PROXY: 'localhost'` 防止本地代理自身通信被错误代理。由于对象展开顺序，`NO_PROXY` 始终位于对象末尾，但在语义上优先级最高（如有键冲突）。

**Core Code**:
```typescript
export function getProxyEnv(): EnvObject {
  return {
    ANTHROPIC_BASE_URL: PROXY_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: PROXY_AUTH_TOKEN,
    ...TELEMETRY_SUPPRESSION,
    NO_PROXY: 'localhost',
  };
}
```
Source: `src/server/claude-settings.ts` : 139-146

**Usage Example**:
```typescript
import { getProxyEnv, writeEnvToClaudeSettings } from './claude-settings.js';

// 启用代理模式时生成并写入环境变量配置
const proxyEnv = getProxyEnv();
// proxyEnv = {
//   ANTHROPIC_BASE_URL: 'http://localhost:3939',
//   ANTHROPIC_AUTH_TOKEN: 'sk-1234',
//   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
//   DISABLE_ERROR_REPORTING: '1',
//   DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
//   DISABLE_TELEMETRY: '1',
//   NO_PROXY: 'localhost',
// }
writeEnvToClaudeSettings(proxyEnv);
```
Explanation: 获取代理模式的固定环境变量配置，然后写入 `~/.claude/settings.json` 的 `env` 字段。Claude CLI 下次启动时将读取这些变量，将 API 请求指向本地代理。

---

### `getProviderEnv(provider: ProviderEnvInput) -> EnvObject`

**Source**: `src/server/claude-settings.ts` : 154-165

**Functionality**: 根据 Provider 配置生成直连模式下的环境变量对象。将 Provider 的连接信息（API 地址、密钥）和模型配置（默认模型、Haiku/Sonnet/Opus 专用模型）映射到 Claude CLI 识别的 `ANTHROPIC_*` 环境变量。当用户在 Furina 中配置或切换第三方 LLM Provider（如 OpenRouter、自定义 API）时，此函数负责将 Provider 的业务字段转换为 Claude CLI 能理解的标准环境变量格式。

**Parameters**:
- `provider` (`ProviderEnvInput`): Provider 配置对象，所有字段均可选：
  - `baseUrl` (`string?`): Provider API 基础地址，映射到 `ANTHROPIC_BASE_URL`
  - `apiKey` (`string?`): Provider API 密钥，映射到 `ANTHROPIC_AUTH_TOKEN`
  - `defaultModel` (`string?`): 默认模型标识，映射到 `ANTHROPIC_MODEL`
  - `haikuModel` (`string?`): Haiku 级别模型标识，映射到 `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `sonnetModel` (`string?`): Sonnet 级别模型标识，映射到 `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `opusModel` (`string?`): Opus 级别模型标识，映射到 `ANTHROPIC_DEFAULT_OPUS_MODEL`

**Return Value**:
- `EnvObject` (`Record<string, string>`): 包含 10 个键值对的环境变量对象：
  - 6 个来自 Provider 字段映射（未定义字段回退为空字符串 `''`）
  - 4 个来自 `TELEMETRY_SUPPRESSION` 遥测抑制标志
  - `NO_PROXY: 'localhost'`

**Core Logic**:
函数对每个 Provider 字段使用空值合并运算符 `??`，当字段为 `undefined` 或 `null` 时回退为空字符串 `''`。这意味着未配置的模型字段仍会写入设置文件（值为空字符串），Claude CLI 会忽略空值配置。环境变量的键名严格遵循 Anthropic 官方规范：`ANTHROPIC_MODEL` 控制默认对话模型，`ANTHROPIC_DEFAULT_HAIKU_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` / `ANTHROPIC_DEFAULT_OPUS_MODEL` 分别控制不同能力层级的模型选择。

**Core Code**:
```typescript
export function getProviderEnv(provider: ProviderEnvInput): EnvObject {
  return {
    ANTHROPIC_BASE_URL: provider.baseUrl ?? '',
    ANTHROPIC_AUTH_TOKEN: provider.apiKey ?? '',
    ANTHROPIC_MODEL: provider.defaultModel ?? '',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.haikuModel ?? '',
    ANTHROPIC_DEFAULT_SONNET_MODEL: provider.sonnetModel ?? '',
    ANTHROPIC_DEFAULT_OPUS_MODEL: provider.opusModel ?? '',
    ...TELEMETRY_SUPPRESSION,
    NO_PROXY: 'localhost',
  };
}
```
Source: `src/server/claude-settings.ts` : 154-165

**Usage Example**:
```typescript
import { getProviderEnv, writeEnvToClaudeSettings } from './claude-settings.js';

// 使用 Provider 配置生成直连模式环境变量
const provider = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-v1-abc123',
  defaultModel: 'anthropic/claude-sonnet-4-20250514',
  sonnetModel: 'anthropic/claude-sonnet-4-20250514',
  opusModel: 'anthropic/claude-opus-4-20250514',
  // haikuModel 未定义，将回退为空字符串
};
const env = getProviderEnv(provider);
// env = {
//   ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
//   ANTHROPIC_AUTH_TOKEN: 'sk-or-v1-abc123',
//   ANTHROPIC_MODEL: 'anthropic/claude-sonnet-4-20250514',
//   ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
//   ANTHROPIC_DEFAULT_SONNET_MODEL: 'anthropic/claude-sonnet-4-20250514',
//   ANTHROPIC_DEFAULT_OPUS_MODEL: 'anthropic/claude-opus-4-20250514',
//   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
//   DISABLE_ERROR_REPORTING: '1',
//   DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
//   DISABLE_TELEMETRY: '1',
//   NO_PROXY: 'localhost',
// }
writeEnvToClaudeSettings(env);
```
Explanation: 将 OpenRouter Provider 的连接信息和模型配置映射为 Claude CLI 环境变量，然后写入 `~/.claude/settings.json`。Claude CLI 将使用 OpenRouter 的 API 地址和密钥进行通信，并根据配置选择对应的能力级别模型。

---

### `writeEnvToClaudeSettings(env: EnvObject) -> void`

**Source**: `src/server/claude-settings.ts` : 177-181

**Functionality**: 将环境变量配置对象写入 `~/.claude/settings.json` 的 `env` 字段。此函数是 `getProxyEnv()` / `getProviderEnv()` 与文件系统之间的桥梁：先读取现有的 Claude 设置，仅替换其中的 `env` 键，保留所有其他顶层键（如 `permissions`、`hooks` 等 Claude CLI 配置），然后写回文件。若设置文件不存在，则创建一个仅含 `env` 键的新文件。

**Parameters**:
- `env` (`EnvObject`): 由 `getProxyEnv()` 或 `getProviderEnv()` 生成的环境变量配置对象。

**Return Value**: `void`

**Core Logic**:
函数委托给同文件中的 `readClaudeSettings()` 和 `writeClaudeSettings()` 两个辅助函数。`readClaudeSettings()` 读取并 JSON 解析现有配置文件（不存在或解析失败时返回 `{}`），然后函数在解析结果上设置 `env` 属性覆盖原有值，最后 `writeClaudeSettings()` 以 2 空格缩进格式写回文件（自动创建目录）。这种"读取-修改-写回"模式确保用户在 `settings.json` 中手动添加的其他配置项不会丢失。

**Core Code**:
```typescript
export function writeEnvToClaudeSettings(env: EnvObject): void {
  const settings = readClaudeSettings();
  settings.env = env;
  writeClaudeSettings(settings);
}
```
Source: `src/server/claude-settings.ts` : 177-181

**Usage Example**:
```typescript
import { getProxyEnv, writeEnvToClaudeSettings } from './claude-settings.js';

// 切换到代理模式：生成配置并写入
writeEnvToClaudeSettings(getProxyEnv());

// 等效的完整流程：
// 1. readClaudeSettings() 读取现有 {"permissions": {...}, "hooks": {...}}
// 2. 设置 settings.env = { ANTHROPIC_BASE_URL: '...', ... }
// 3. writeClaudeSettings() 写回 {"permissions": {...}, "hooks": {...}, "env": {...}}
```
Explanation: 展示 `writeEnvToClaudeSettings` 如何作为生成函数与文件系统之间的桥梁。读取现有配置后仅替换 `env` 字段，确保其他 Claude CLI 配置（权限规则、钩子等）不被覆盖。

## Data Structures

### `EnvObject`
```typescript
export type EnvObject = Record<string, string>;
```
- 纯字符串键值对的环境变量对象，用于写入 `~/.claude/settings.json` 的 `env` 字段。
- 所有值均为 `string` 类型（环境变量的天然约束），禁用标志使用 `'1'` 而非布尔值。

### `ProviderEnvInput`
```typescript
export interface ProviderEnvInput {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
}
```
- `baseUrl` (`string?`): Provider API 基础地址，映射到 `ANTHROPIC_BASE_URL`。
- `apiKey` (`string?`): Provider API 密钥，映射到 `ANTHROPIC_AUTH_TOKEN`。
- `defaultModel` (`string?`): 默认对话模型标识，映射到 `ANTHROPIC_MODEL`。
- `sonnetModel` (`string?`): Sonnet 层级模型标识，映射到 `ANTHROPIC_DEFAULT_SONNET_MODEL`。
- `opusModel` (`string?`): Opus 层级模型标识，映射到 `ANTHROPIC_DEFAULT_OPUS_MODEL`。
- `haikuModel` (`string?`): Haiku 层级模型标识，映射到 `ANTHROPIC_DEFAULT_HAIKU_MODEL`。

**设计说明**：这是一个最小化的接口类型，仅包含生成环境变量所需的字段，而非完整的 Provider 数据模型。这意味着任何具有这些字段的对象（如完整的 `Provider` 类型）都可以直接传入 `getProviderEnv()`，无需额外适配。

### `TELEMETRY_SUPPRESSION`（内部常量）
```typescript
const TELEMETRY_SUPPRESSION: Record<string, string> = {
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_ERROR_REPORTING: '1',
  DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
  DISABLE_TELEMETRY: '1',
};
```
- 四项遥测抑制标志，代理模式和直连模式均包含。
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`：禁用 Claude CLI 非必要网络请求。
- `DISABLE_ERROR_REPORTING`：禁用错误上报。
- `DISABLE_NON_ESSENTIAL_MODEL_CALLS`：禁用非必要的模型调用。
- `DISABLE_TELEMETRY`：禁用遥测数据收集。

### `PROXY_BASE_URL` / `PROXY_AUTH_TOKEN`（内部常量）
```typescript
const PROXY_BASE_URL = 'http://localhost:3939';
const PROXY_AUTH_TOKEN = 'sk-1234';
```
- `PROXY_BASE_URL`：Furina 本地代理监听地址，默认端口 3939。
- `PROXY_AUTH_TOKEN`：代理模式下的模拟认证令牌，用于 Claude CLI 与本地代理之间的认证（代理会替换为 Provider 真实密钥后再转发）。

## Error Handling and Edge Cases

本模块的函数均为纯数据转换函数，不涉及 I/O 操作，因此不会抛出异常。以下是关键的边界行为：

1. **未定义的 Provider 字段**：`getProviderEnv()` 对所有可选字段使用 `?? ''` 回退，未配置的模型字段会生成空字符串值。Claude CLI 会忽略值为空字符串的环境变量，因此不会导致错误，仅表示该能力层级未配置专用模型。
2. **空 Provider 对象**：传入 `{}` 时，所有字段回退为空字符串，结果为仅含 `TELEMETRY_SUPPRESSION` 和 `NO_PROXY` 的对象加上 6 个空值字段。这是合法但无实际意义的配置。
3. **`writeEnvToClaudeSettings` 的文件不存在情况**：委托给 `readClaudeSettings()` 处理，该函数在文件不存在时返回 `{}`，然后写入仅含 `env` 键的新文件。目录不存在时 `writeClaudeSettings()` 会自动创建。

## Dependencies

- **Depends on**:
  - `src/server/claude-settings.ts` 中的文件操作函数：`readClaudeSettings()` 读取现有配置，`writeClaudeSettings()` 写回配置文件（同文件内依赖，属于 `spec-settings-file.md` 覆盖范围）。
  - `src/utils/logger.js`：日志输出（仅被文件操作函数使用，本 spec 的核心函数不直接依赖）。

- **Depended by**:
  - `src/server/routes/providers.ts`：Provider API 路由层，在设置活跃 Provider（`PUT /active`）、切换代理开关（`PUT /proxy`）、禁用 Provider（`PUT /:id/enabled`）、更新 Provider（`PUT /:id`）时调用 `getProxyEnv()` / `getProviderEnv()` + `writeEnvToClaudeSettings()`。
  - `src/commands/enable.ts`：`furina enable` CLI 命令，启用代理时调用 `getProxyEnv()` + `writeEnvToClaudeSettings()`。
  - `src/commands/disable.ts`：`furina disable` CLI 命令，禁用代理时调用 `getProviderEnv(activeProvider)` + `writeEnvToClaudeSettings()`。

## Usage Examples

### 完整使用场景：代理模式与直连模式切换

```typescript
import {
  getProxyEnv,
  getProviderEnv,
  writeEnvToClaudeSettings,
  restoreClaudeSettings,
} from './claude-settings.js';
import { getEnableFurinaProxy, getActiveProvider } from './providers-store.js';

/**
 * 根据当前模式同步 Claude CLI 的环境变量配置。
 * 这是 Web UI 路由层中 `PUT /active` 端点的核心逻辑。
 */
function syncClaudeEnv(): void {
  if (getEnableFurinaProxy()) {
    // 代理模式：所有请求经 localhost:3939 代理转发
    writeEnvToClaudeSettings(getProxyEnv());
  } else {
    // 直连模式：直接连接第三方 Provider
    const activeProvider = getActiveProvider();
    if (activeProvider) {
      writeEnvToClaudeSettings(getProviderEnv(activeProvider));
    } else {
      // 无活跃 Provider 时恢复原始设置
      restoreClaudeSettings();
    }
  }
}

// 示例 1：启用代理模式
// 生成的 env 对象写入 ~/.claude/settings.json：
// {
//   "env": {
//     "ANTHROPIC_BASE_URL": "http://localhost:3939",
//     "ANTHROPIC_AUTH_TOKEN": "sk-1234",
//     "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
//     ...
//     "NO_PROXY": "localhost"
//   }
// }
writeEnvToClaudeSettings(getProxyEnv());

// 示例 2：切换到 OpenRouter Provider 直连
const openRouterProvider = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-v1-abc123',
  defaultModel: 'anthropic/claude-sonnet-4-20250514',
  sonnetModel: 'anthropic/claude-sonnet-4-20250514',
  opusModel: 'anthropic/claude-opus-4-20250514',
  haikuModel: 'anthropic/claude-3-5-haiku-latest',
};
writeEnvToClaudeSettings(getProviderEnv(openRouterProvider));
// ~/.claude/settings.json 的 env 被替换为直连配置，其他顶层键保留
```

Explanation: 展示了本模块的典型使用模式。路由层和命令层根据当前代理开关状态选择调用 `getProxyEnv()` 还是 `getProviderEnv()`，然后统一通过 `writeEnvToClaudeSettings()` 写入配置文件。`writeEnvToClaudeSettings` 的"读取-修改-写回"模式确保不破坏用户手动添加的 Claude CLI 配置。
