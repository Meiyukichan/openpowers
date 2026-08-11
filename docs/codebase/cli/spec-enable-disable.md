# Proxy Enable/Disable Lifecycle

> Source files:
> - `src/commands/enable.ts` : 1-105
> - `src/commands/disable.ts` : 1-59
> - `src/server/providers-store.ts` : 349-393 (proxy and ClaudeSettings flag operations)
> - `src/server/claude-settings.ts` : 1-181 (full file, env generation, backup/restore, settings read/write)
> - `src/server/service-manager.ts` : 1-64 (backend service startup)
> - `src/utils/port-manager.ts` : 20-37 (port detection)

## Overview

Enable/Disable 是 Furina CLI 中管理代理(proxy)生命周期的一对顶层命令。它们共同解决一个核心问题：如何在不影响用户原有 Claude 配置的前提下，透明地将 Claude CLI 的 API 流量路由到 Furina 代理服务器。

**设计动机**：Furina 的代理服务器运行在 `localhost:3939`，通过篡改 Claude CLI 的环境变量 (`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`) 将请求路由到代理层。Enable/Disable 命令将这一过程封装为原子操作，确保：
1. 启用代理前，后端服务已就绪（端口轮询确认）
2. 首次启用时备份用户原始 `~/.claude/settings.json`
3. 代理环境变量写入 Claude 配置文件
4. 禁用时恢复原始提供商配置或还原备份

**使用场景**：
- 用户首次配置完 Provider 后，执行 `furina enable` 开启代理
- 切换不同 Provider 后重新 enable 以同步新的环境变量
- 遇到问题时执行 `furina disable` 恢复原始 Claude 配置
- 与 `recover` 命令配合使用：disable 恢复 Provider 环境变量，recover 完全还原备份文件

**文件职责**：
- `src/commands/enable.ts`：enable 命令实现，包含端口等待、代理标志写入、Claude 设置备份与同步
- `src/commands/disable.ts`：disable 命令实现，包含代理标志清除、Claude 设置恢复
- `src/server/providers-store.ts`：提供代理标志 (`enableFurinaProxy`) 和备份守卫 (`neverClaudeSettings`) 的持久化读写
- `src/server/claude-settings.ts`：提供 Claude settings.json 的读写、备份/恢复、环境变量生成
- `src/server/service-manager.ts`：提供后端服务启动能力
- `src/utils/port-manager.ts`：提供端口占用检测

## Architecture / Flow

### Enable 流程

```
furina enable
       |
       v
[Step 1] 检查 UI_PORT(3939) 是否已占用
       |--- 已占用 ---> 跳过启动，进入 Step 2
       |--- 未占用 ---> startBackendService(3939)
                        ---> waitForPortInUse() 轮询(2000ms间隔, 10000ms超时)
                        |--- 端口就绪 ---> 进入 Step 2
                        |--- 超时 ---> stderr 输出错误 + process.exit(1)
       v
[Step 2] setEnableFurinaProxy(true) 写入 providers.json
       |--- 失败 ---> stderr 输出错误 + process.exit(1)
       v
[Step 3] Claude Settings 同步
       |--- neverClaudeSettings === true?
       |      |--- 是 ---> backupClaudeSettings() + setNeverClaudeSettings(false)
       |--- getProxyEnv() -> writeEnvToClaudeSettings()
       |--- 失败 ---> logger.error 记录（不影响命令成功）
       v
stdout: "Furina proxy enabled"
```

### Disable 流程

```
furina disable
       |
       v
[Step 1] setEnableFurinaProxy(false) 清除 providers.json 中的代理标志
       |--- 失败 ---> stderr 输出错误 + process.exit(1)
       v
[Step 2] Claude Settings 恢复
       |--- getActiveProvider() 返回非 null?
       |      |--- 是 ---> writeEnvToClaudeSettings(getProviderEnv(provider))
       |                   将活跃 Provider 的环境变量写入 settings.json
       |      |--- 否 ---> restoreClaudeSettings()
       |                   从备份文件还原原始 settings.json
       |--- 失败 ---> logger.error 记录（不影响命令成功）
       v
stdout: "Furina proxy disabled"
```

**关键设计决策**：
- Enable 和 Disable 的 Claude Settings 同步步骤采用容错设计：即使同步失败，命令本身仍然输出成功消息（因为代理标志已正确写入/清除）
- Enable 的 `neverClaudeSettings` 守卫确保备份只发生一次，后续 enable 不会覆盖已有的备份
- Disable 时根据是否存在活跃 Provider 决定恢复策略：有 Provider 则写入 Provider 环境变量（保留 Provider 配置），无 Provider 则完全还原备份

## Functionality / Interface Details

### `runEnable() -> Promise<void>`

**Source**: `src/commands/enable.ts`:51-92

**Functionality**: Enable 命令的核心执行函数。协调三个步骤来完整启用 Furina 代理：(1) 确保后端服务正在运行；(2) 写入代理启用标志；(3) 同步 Claude 设置文件中的环境变量。这是一个异步函数，因为端口等待需要异步轮询。

**Parameters**: 无参数。

**Return Value**:
- `Promise<void>`: 无返回值。成功时向 stdout 输出 "Furina proxy enabled"
- 可能的错误：后端服务启动超时（Step 1）、代理标志写入失败（Step 2），这两种情况会调用 `process.exit(1)` 终止进程
- Claude Settings 同步失败（Step 3）不会导致进程退出，仅记录日志

**Core Logic**:

Step 1 — 后端服务就绪保障：首先调用 `isPortInUse(UI_PORT)` 检查端口 3939 是否已被占用。如果端口空闲（服务未运行），调用 `startBackendService(UI_PORT)` 启动后端服务进程，然后进入轮询等待 `waitForPortInUse(UI_PORT, 10000)`。轮询使用 2 秒间隔，总共等待 10 秒。如果超时仍未检测到端口被占用，输出错误信息并 `process.exit(1)`。这一步确保后续写入的代理环境变量指向一个实际运行的服务。

Step 2 — 代理标志持久化：调用 `setEnableFurinaProxy(true)` 将 `providers.json` 中的 `enableFurinaProxy` 字段设为 `true`。代理服务端在每个请求中会检查此标志，因此无需重启服务。写入失败则输出错误并 `process.exit(1)`。

Step 3 — Claude Settings 环境变量同步：首先检查 `getNeverClaudeSettings()` 标志。如果为 `true`（表示从未备份过），执行 `backupClaudeSettings()` 将 `~/.claude/settings.json` 复制到 `~/.furina/settings.bak.json`，然后将标志设为 `false`（`setNeverClaudeSettings(false)`）。接着调用 `writeEnvToClaudeSettings(getProxyEnv())` 将代理环境变量写入 Claude 设置。这一步的异常被捕获但不会导致进程退出。

**Core Code**:
```typescript
export async function runEnable(): Promise<void> {
  // Step 1: ensure the backend service is running
  if (!(await isPortInUse(UI_PORT))) {
    startBackendService(UI_PORT);
    const started = await waitForPortInUse(UI_PORT, SERVICE_START_TIMEOUT_MS);
    if (!started) {
      const msg = 'Backend service did not start. Please check the logs for details.';
      process.stderr.write(`${msg}\n`);
      logger.error(msg);
      process.exit(1);
      return;
    }
  }

  // Step 2: write the proxy configuration flag
  try {
    setEnableFurinaProxy(true);
  } catch (err) {
    process.stderr.write(`Failed to enable proxy: ${err}\n`);
    logger.error(`Failed to enable proxy: ${err}`);
    process.exit(1);
    return;
  }

  // Step 3: sync Claude settings with proxy env
  try {
    if (getNeverClaudeSettings()) {
      backupClaudeSettings();
      setNeverClaudeSettings(false);
    }
    writeEnvToClaudeSettings(getProxyEnv());
  } catch (err) {
    logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
  }

  process.stdout.write('Furina proxy enabled\n');
}
```
Source: `src/commands/enable.ts`:51-92

**Usage Example**:
```typescript
// 在 CLI 注册时绑定到 commander action
program
  .command('enable')
  .description('Enable the Furina proxy')
  .action(() => {
    void runEnable();
  });
```
Explanation: `runEnable` 返回 Promise，但 commander action 不需要等待完成，使用 `void` 前缀表明这是 fire-and-forget 调用。实际使用中通过 `furina enable` 命令触发。

---

### `runDisable() -> void`

**Source**: `src/commands/disable.ts`:24-46

**Functionality**: Disable 命令的核心执行函数。与 enable 不同，这是一个同步函数，因为不需要等待端口检测。负责清除代理标志并恢复 Claude 设置文件中的环境变量。

**Parameters**: 无参数。

**Return Value**:
- `void`: 无返回值。成功时向 stdout 输出 "Furina proxy disabled"
- 可能的错误：代理标志清除失败（`setEnableFurinaProxy(false)` 抛出异常），调用 `process.exit(1)` 终止进程
- Claude Settings 同步失败不会导致进程退出，仅记录日志

**Core Logic**:

Step 1 — 代理标志清除：调用 `setEnableFurinaProxy(false)` 将 `providers.json` 中的代理标志设为 `false`。代理服务端在下一个请求中检测到标志为 false 后将不再拦截流量。失败则输出错误并 `process.exit(1)`。

Step 2 — Claude Settings 恢复：根据是否存在活跃 Provider 采取不同策略：
- **有活跃 Provider**（`getActiveProvider()` 返回非 null）：调用 `writeEnvToClaudeSettings(getProviderEnv(activeProvider))` 将 Provider 的直连环境变量（baseUrl、apiKey、模型名等）写入 Claude 设置。这样 Claude CLI 将直接连接 Provider 而不经过代理。
- **无活跃 Provider**（返回 null）：调用 `restoreClaudeSettings()` 从备份文件 `~/.furina/settings.bak.json` 还原原始 Claude 设置。如果没有备份文件，`restoreClaudeSettings` 会记录警告并返回 `false`。

**Core Code**:
```typescript
export function runDisable(): void {
  try {
    setEnableFurinaProxy(false);

    // Sync Claude settings based on active provider existence
    try {
      const activeProvider = getActiveProvider();
      if (activeProvider) {
        writeEnvToClaudeSettings(getProviderEnv(activeProvider));
      } else {
        restoreClaudeSettings();
      }
    } catch (err) {
      logger.error(`Failed to sync Claude settings: ${err instanceof Error ? err.message : String(err)}`);
    }

    process.stdout.write('Furina proxy disabled\n');
  } catch (err) {
    process.stderr.write(`Failed to disable proxy: ${err}\n`);
    logger.error(`Failed to disable proxy: ${err}`);
    process.exit(1);
  }
}
```
Source: `src/commands/disable.ts`:24-46

**Usage Example**:
```typescript
// 在 CLI 注册时绑定到 commander action
program
  .command('disable')
  .description('Disable the Furina proxy')
  .action(() => {
    runDisable();
  });
```
Explanation: `runDisable` 是同步函数，直接调用即可。实际使用中通过 `furina disable` 命令触发。

---

### `waitForPortInUse(port: number, timeoutMs: number) -> Promise<boolean>`

**Source**: `src/commands/enable.ts`:33-42

**Functionality**: 异步轮询指定端口，直到端口被占用或超时。用于 enable 命令中确认后端服务已启动并开始监听。通过定期调用 `isPortInUse` 实现，避免一次性检查可能的竞态条件（服务进程已 spawn 但尚未开始 listen）。

**Parameters**:
- `port` (`number`): 要检查的端口号
- `timeoutMs` (`number`): 最大等待时间（毫秒）。在 enable 流程中固定传入 `SERVICE_START_TIMEOUT_MS` (10000)

**Return Value**:
- `Promise<boolean>`: `true` 表示端口在超时前被占用（服务已就绪），`false` 表示超时未检测到端口占用

**Core Logic**: 记录起始时间 `Date.now()`，在 while 循环中反复调用 `isPortInUse(port)`。如果检测到端口被占用立即返回 `true`，否则使用 `setTimeout` 等待 `PORT_CHECK_INTERVAL_MS`（2000ms）后重试。当 `Date.now() - start >= timeoutMs` 时退出循环返回 `false`。

**Core Code**:
```typescript
async function waitForPortInUse(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, PORT_CHECK_INTERVAL_MS));
  }
  return false;
}
```
Source: `src/commands/enable.ts`:33-42

**Usage Example**:
```typescript
const started = await waitForPortInUse(3939, 10000);
if (!started) {
  console.error('Service failed to start within 10 seconds');
}
```
Explanation: 在 10 秒内每 2 秒检查一次端口 3939 是否被占用。典型场景下后端服务在 2-4 秒内启动完成。

---

### `registerEnableCommand(program: Command) -> void`

**Source**: `src/commands/enable.ts`:98-105

**Functionality**: 将 `enable` 命令注册到 Commander 程序实例上。这是 CLI 入口文件 `src/cli/index.ts` 调用的注册函数。

**Parameters**:
- `program` (`Command`): Commander 的根 Command 实例

**Return Value**: `void`

**Core Code**:
```typescript
export function registerEnableCommand(program: Command): void {
  program
    .command('enable')
    .description('Enable the Furina proxy')
    .action(() => {
      void runEnable();
    });
}
```
Source: `src/commands/enable.ts`:98-105

---

### `registerDisableCommand(program: Command) -> void`

**Source**: `src/commands/disable.ts`:52-59

**Functionality**: 将 `disable` 命令注册到 Commander 程序实例上。

**Parameters**:
- `program` (`Command`): Commander 的根 Command 实例

**Return Value**: `void`

**Core Code**:
```typescript
export function registerDisableCommand(program: Command): void {
  program
    .command('disable')
    .description('Disable the Furina proxy')
    .action(() => {
      runDisable();
    });
}
```
Source: `src/commands/disable.ts`:52-59

---

### `setEnableFurinaProxy(enabled: boolean) -> void`

**Source**: `src/server/providers-store.ts`:365-370

**Functionality**: 设置 `providers.json` 中的 `enableFurinaProxy` 标志。代理服务端在每个请求处理中读取此标志来决定是否将流量路由到实际的 AI Provider，因此修改标志后无需重启服务即可生效。

**Parameters**:
- `enabled` (`boolean`): `true` 启用代理, `false` 禁用代理

**Return Value**: `void`

**Core Logic**: 读取整个 `providers.json` 文件，修改 `enableFurinaProxy` 字段，然后写回文件。如果文件不存在则创建默认数据结构。

---

### `getProxyEnv() -> EnvObject`

**Source**: `src/server/claude-settings.ts`:139-146

**Functionality**: 生成代理模式下的环境变量对象。包含固定的代理地址 (`http://localhost:3939`)、认证令牌 (`sk-1234`)、遥测抑制标志和 NO_PROXY 设置。这些环境变量写入 Claude settings.json 后，Claude CLI 的所有 API 请求将通过本地代理服务器。

**Parameters**: 无。

**Return Value**:
- `EnvObject` (`Record<string, string>`): 包含 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、遥测标志、`NO_PROXY` 的键值对

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
Source: `src/server/claude-settings.ts`:139-146

---

### `getProviderEnv(provider: ProviderEnvInput) -> EnvObject`

**Source**: `src/server/claude-settings.ts`:154-165

**Functionality**: 从 Provider 配置生成直连模式的环境变量对象。用于 disable 命令中，当存在活跃 Provider 时将 Provider 的连接信息写入 Claude settings，使 Claude CLI 直连 Provider 而不经过代理。

**Parameters**:
- `provider` (`ProviderEnvInput`): 包含 `baseUrl`、`apiKey`、`defaultModel`、`sonnetModel`、`opusModel`、`haikuModel` 的对象

**Return Value**:
- `EnvObject` (`Record<string, string>`): 包含 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL`、模型变体、遥测标志、`NO_PROXY` 的键值对

---

### `writeEnvToClaudeSettings(env: EnvObject) -> void`

**Source**: `src/server/claude-settings.ts`:177-181

**Functionality**: 读取现有 `~/.claude/settings.json`，仅替换 `env` 字段，然后写回。保留 settings.json 中其他顶级字段（如 `permissions`、`hooks` 等）不变。如果文件不存在则创建新文件只包含 `env` 字段。

**Parameters**:
- `env` (`EnvObject`): 要写入的环境变量对象

**Return Value**: `void`

**Core Code**:
```typescript
export function writeEnvToClaudeSettings(env: EnvObject): void {
  const settings = readClaudeSettings();
  settings.env = env;
  writeClaudeSettings(settings);
}
```
Source: `src/server/claude-settings.ts`:177-181

---

### `backupClaudeSettings() -> void`

**Source**: `src/server/claude-settings.ts`:100-110

**Functionality**: 将 `~/.claude/settings.json` 复制到 `~/.furina/settings.bak.json` 作为备份。仅在首次启用代理时调用（由 `neverClaudeSettings` 守卫控制）。如果源文件不存在则记录警告但不抛出异常。

**Parameters**: 无。

**Return Value**: `void`

---

### `restoreClaudeSettings() -> boolean`

**Source**: `src/server/claude-settings.ts`:117-128

**Functionality**: 从备份文件 `~/.furina/settings.bak.json` 还原 `~/.claude/settings.json`。在 disable 命令中当没有活跃 Provider 时调用，完全恢复用户原始的 Claude 配置。

**Parameters**: 无。

**Return Value**:
- `boolean`: `true` 表示还原成功，`false` 表示备份文件不存在

---

### `getNeverClaudeSettings() -> boolean` / `setNeverClaudeSettings(value: boolean) -> void`

**Source**: `src/server/providers-store.ts`:380-393

**Functionality**: 读写 `providers.json` 中的 `neverClaudeSettings` 标志。该标志作为"备份守卫"，确保 Claude settings 的备份操作只执行一次。默认值为 `true`（表示从未执行过备份）。enable 流程中首次检测到 `true` 时执行备份，然后立即将标志设为 `false`。

---

### `getActiveProvider() -> Provider | null`

**Source**: `src/server/providers-store.ts`:312-318

**Functionality**: 获取当前活跃 Provider 的完整对象。在 disable 命令中用于判断恢复策略：如果有活跃 Provider 则写入 Provider 环境变量，否则还原备份。返回 `null` 的情况包括：未设置活跃 Provider ID、Provider 被禁用、Provider 被删除。

**Parameters**: 无。

**Return Value**:
- `Provider | null`: Provider 对象或 null

---

## Data Structures

### `EnvObject`
```typescript
export type EnvObject = Record<string, string>;
```
- 键值对形式的环境变量对象，用于写入 Claude settings.json 的 `env` 字段

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
- `baseUrl` (`string`, 可选): Provider API 基础地址
- `apiKey` (`string`, 可选): Provider API 密钥
- `defaultModel` (`string`, 可选): 默认模型名称
- `sonnetModel` (`string`, 可选): Sonnet 变体模型名称
- `opusModel` (`string`, 可选): Opus 变体模型名称
- `haikuModel` (`string`, 可选): Haiku 变体模型名称

### `StoreData` (providers.json 结构，相关字段)
```typescript
{
  activeProviderId: string | null;
  enableFurinaProxy: boolean | null;  // 默认 false
  neverClaudeSettings: boolean | null;    // 默认 true
  // ... 其他字段
}
```
- `enableFurinaProxy`: 代理启用标志，enable/disable 命令的核心状态
- `neverClaudeSettings`: 备份守卫标志，控制 Claude settings 备份是否已执行

### 关键常量

| 常量 | 值 | 定义位置 | 说明 |
|---|---|---|---|
| `SERVICE_START_TIMEOUT_MS` | 10000 | `enable.ts:24` | 等待后端服务启动的最大时间 |
| `PORT_CHECK_INTERVAL_MS` | 2000 | `enable.ts:27` | 端口检查轮询间隔 |
| `UI_PORT` | 3939 | `service-manager.ts:15` | 后端服务默认端口 |
| `PROXY_BASE_URL` | `http://localhost:3939` | `claude-settings.ts:25` | 代理环境变量中的基地址 |
| `PROXY_AUTH_TOKEN` | `sk-1234` | `claude-settings.ts:26` | 代理环境变量中的认证令牌 |

## Error Handling and Edge Cases

### Enable 命令错误处理

1. **后端服务启动超时**：`waitForPortInUse` 超时后，输出错误到 stderr 并调用 `process.exit(1)`。这是致命错误，因为没有运行的后端服务，代理环境变量将指向空端口。

2. **代理标志写入失败**：`setEnableFurinaProxy(true)` 异常时，输出错误到 stderr 并调用 `process.exit(1)`。这是致命错误，因为标志未写入则代理不会生效。

3. **Claude Settings 同步失败**：整个 Step 3 的异常被捕获并记录到 logger，不会导致进程退出。命令仍然输出 "Furina proxy enabled"。这是因为代理标志已正确写入，服务端可以正确处理请求；环境变量同步失败仅影响 Claude CLI 的直连配置。

4. **重复 enable**：如果代理已启用，再次执行 enable 是安全的。`isPortInUse` 会检测到端口已被占用，跳过启动步骤。`setEnableFurinaProxy(true)` 是幂等的。`neverClaudeSettings` 在首次后已设为 `false`，不会重复备份。

### Disable 命令错误处理

1. **代理标志清除失败**：`setEnableFurinaProxy(false)` 异常时，输出错误到 stderr 并调用 `process.exit(1)`。

2. **Claude Settings 恢复失败**：内部 try-catch 捕获异常并记录到 logger，不导致进程退出。命令仍然输出 "Furina proxy disabled"。

3. **无备份文件**：当没有活跃 Provider 且 `restoreClaudeSettings()` 找不到备份文件时，函数返回 `false` 并记录警告。Claude settings.json 不会被修改，用户需要手动处理或使用 `furina recover`。

4. **重复 disable**：幂等操作，多次执行不会造成问题。

## Dependencies

- **Depends on**:
  - `src/server/providers-store.ts` — 代理标志 (`setEnableFurinaProxy`)、备份守卫 (`getNeverClaudeSettings`/`setNeverClaudeSettings`)、活跃 Provider 查询 (`getActiveProvider`)
  - `src/server/claude-settings.ts` — Claude settings 读写 (`readClaudeSettings`/`writeClaudeSettings`)、备份恢复 (`backupClaudeSettings`/`restoreClaudeSettings`)、环境变量生成 (`getProxyEnv`/`getProviderEnv`)、环境变量写入 (`writeEnvToClaudeSettings`)
  - `src/server/service-manager.ts` — 后端服务启动 (`startBackendService`)、端口常量 (`UI_PORT`)
  - `src/utils/port-manager.ts` — 端口占用检测 (`isPortInUse`)
  - `src/utils/logger.ts` — 日志记录 (`logger`)
  - `commander` — CLI 命令框架 (`Command`)

- **Depended by**:
  - `src/cli/index.ts` — CLI 入口文件调用 `registerEnableCommand` 和 `registerDisableCommand` 注册命令
  - 代理服务端（运行时）：读取 `enableFurinaProxy` 标志决定请求路由策略

## Usage Examples

### 基本使用

```bash
# 启用代理 - 确保后端服务运行，写入代理标志，同步 Claude 设置
furina enable

# 禁用代理 - 清除代理标志，恢复 Claude 设置
furina disable
```

### 完整工作流示例

```bash
# 1. 初始化项目
furina init

# 2. 配置 Provider（通过 UI 或 CLI）
furina agents switch --provider my-provider

# 3. 启用代理 - Claude CLI 的 API 流量将路由到 Furina 代理
furina enable
# stdout: UI server started at http://localhost:3939/furina/ui
# stdout: Furina proxy enabled

# 4. 正常使用 Claude CLI（流量自动经过代理）

# 5. 遇到问题时禁用代理
furina disable
# stdout: Furina proxy disabled

# 6. 如需完全恢复原始配置
furina recover
```

### Enable 后 Claude settings.json 变化

```jsonc
// 启用前 (原始配置或首次使用)
{
  "permissions": { ... }
}

// 启用后
{
  "permissions": { ... },
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:3939",
    "ANTHROPIC_AUTH_TOKEN": "sk-1234",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "DISABLE_ERROR_REPORTING": "1",
    "DISABLE_NON_ESSENTIAL_MODEL_CALLS": "1",
    "DISABLE_TELEMETRY": "1",
    "NO_PROXY": "localhost"
  }
}
```

### Disable 后 Claude settings.json 变化（有活跃 Provider）

```jsonc
{
  "permissions": { ... },
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.provider.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-provider-key",
    "ANTHROPIC_MODEL": "claude-sonnet-4-20250514",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-3-5",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-20250514",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-20250514",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "DISABLE_ERROR_REPORTING": "1",
    "DISABLE_NON_ESSENTIAL_MODEL_CALLS": "1",
    "DISABLE_TELEMETRY": "1",
    "NO_PROXY": "localhost"
  }
}
```
