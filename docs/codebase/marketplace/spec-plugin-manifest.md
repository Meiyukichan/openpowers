# Plugin Manifest & Registration

> Source files:
> - `marketplace/.claude-plugin/marketplace.json` : 1-19
> - `marketplace/.claude-plugin/plugin.json` : 1-19

## Overview

Plugin Manifest & Registration 是 Furina 项目中负责将自身注册为 Claude Code 可安装插件的声明式配置层。该 spec 覆盖两个 JSON 清单文件，它们共同构成了 Claude Code 插件系统的入口点：

- **marketplace.json** — 定义插件市场条目（marketplace entry），告诉 Claude Code 存在一个名为 `furina-plugins` 的本地市场，其中包含可安装的插件列表。
- **plugin.json** — 定义插件本体（plugin identity），描述 `furina` 插件的元信息（名称、版本、许可证、仓库地址），并声明其 MCP 服务器配置，使 Claude Code 在插件安装后能够发现并连接到 `furina-mcp-server`。

**设计动机**：Claude Code 的插件系统要求通过 `claude plugin marketplace add <path>` 注册一个本地 marketplace 目录，再通过 `claude plugin install <plugin>@<marketplace>` 安装具体的插件。这两个 JSON 文件正是 Claude CLI 读取的约定文件，位于 marketplace 根目录的 `.claude-plugin/` 子目录下。没有它们，CLI 无法识别 Furina 为合法的插件源。

**使用场景**：
1. `furina init` 命令执行时，CLI 通过 `claude plugin marketplace add <marketplacePath>` 注册 marketplace，Claude CLI 读取 `marketplace.json` 获取市场元信息和插件列表。
2. 随后 `claude plugin install furina@furina-plugins` 安装插件时，Claude CLI 读取 `plugin.json` 获取插件详情和 MCP 服务器配置。
3. `furina remove` 命令执行反向操作：`claude plugin uninstall furina@furina-plugins` 卸载插件，`claude plugin marketplace remove furina-plugins` 移除市场。
4. 插件安装后，Claude Code 根据 `plugin.json` 中的 `mcpServers` 配置自动启动 MCP 连接，使得 `mcp__plugin_furina_furina-mcp-server__markBeginPropose` 等 MCP 工具对 agent 可用。

**涉及源文件及职责**：
- `marketplace/.claude-plugin/marketplace.json` — 市场条目定义：市场名称、描述、所有者信息、可安装插件列表
- `marketplace/.claude-plugin/plugin.json` — 插件本体定义：插件名称、版本、描述、作者、许可证、仓库地址、MCP 服务器配置

## Architecture / Flow

插件注册流程是一个由 CLI 命令驱动的顺序执行链，manifest 文件在其中作为静态配置被 Claude CLI 读取：

```
furina init
  |
  v
Step 1: claude --version           (检查 Claude CLI 是否安装)
  |
  v
Step 2: claude plugin uninstall    (容错清理旧插件)
  |       furina@furina-plugins
  v
Step 3: claude plugin marketplace  (容错清理旧市场)
  |       remove furina-plugins
  v
Step 4: claude plugin marketplace add <marketplacePath>
  |       --> Claude CLI 读取 marketplace.json
  |       --> 注册 furina-plugins 市场
  v
Step 5: claude plugin install furina@furina-plugins
  |       --> Claude CLI 读取 plugin.json
  |       --> 安装 furina 插件，注册 MCP 服务器
  v
Step 6: 启动 UI 服务 (runUi)
  |
  v
完成: agent 可使用 mcp__plugin_furina_furina-mcp-server__* 工具
```

**反向卸载流程** (`furina remove`)：
```
furina remove
  |
  v
Step 1: claude plugin uninstall furina@furina-plugins
  |
  v
Step 2: claude plugin marketplace remove furina-plugins
  |
  v
完成: 插件和市场均已移除
```

**marketplace.json 与 plugin.json 的关系**：
- `marketplace.json` 是市场级配置，其中的 `plugins` 数组通过 `source: "./"` 指向当前 marketplace 根目录下的插件。Claude CLI 根据这个 `source` 路径找到插件目录并读取其中的 `plugin.json`。
- `plugin.json` 是插件级配置，定义了插件本身的完整身份和能力声明，特别是 `mcpServers` 字段决定了插件安装后暴露的 MCP 工具。

## Functionality / Interface Details

由于这两个文件是声明式 JSON 配置（非函数/方法），本节以数据结构为单位进行详细说明。

### `marketplace.json` — 市场条目定义

**Source**: `marketplace/.claude-plugin/marketplace.json`:1-19

**Functionality**: 定义 Claude Code 插件市场的入口信息。当执行 `claude plugin marketplace add <path>` 时，Claude CLI 会在 `<path>/.claude-plugin/marketplace.json` 中读取此文件，将其注册为一个合法的插件市场。市场名称 `furina-plugins` 是唯一的市场标识符，后续所有 `claude plugin install/uninstall` 命令都需要通过 `@furina-plugins` 后缀引用此市场。

**Core Code**:
```json
{
    "name": "furina-plugins",
    "description": "Development marketplace for Furina core skills library",
    "owner": {
        "name": "Meiyukichan",
        "email": "Meiyukichan@163.com"
    },
    "plugins": [
        {
            "name": "furina",
            "description": "Core skills library for Claude Code: TDD, debugging, collaboration patterns, and proven techniques",
            "version": "1.0.0",
            "source": "./",
            "author": {
                "name": "Meiyukichan",
                "email": "Meiyukichan@163.com"
            }
        }
    ]
}
```
Source: `marketplace/.claude-plugin/marketplace.json`:1-19

**字段详解**：
- `name` (`string`): 市场的唯一标识名，值为 `"furina-plugins"`。此名称在 CLI 中用于 `claude plugin marketplace remove furina-plugins` 和 `claude plugin install <plugin>@furina-plugins` 中的市场引用。
- `description` (`string`): 市场的人类可读描述，说明这是 Furina 核心技能库的开发市场。
- `owner` (`object`): 市场所有者信息。
  - `name` (`string`): 所有者名称。
  - `email` (`string`): 所有者联系邮箱。
- `plugins` (`array`): 市场中可安装的插件列表。当前仅包含一个插件 `furina`。
  - `name` (`string`): 插件名称，与 `plugin.json` 中的 `name` 对应。Claude CLI 使用 `name@marketplaceName` 格式（即 `furina@furina-plugins`）标识已安装的插件。
  - `description` (`string`): 插件功能描述，说明其包含 TDD、调试、协作模式等核心技能。
  - `version` (`string`): 插件版本号，遵循语义化版本规范，当前为 `"1.0.0"`。
  - `source` (`string`): 插件源路径，相对于 marketplace 目录。值 `"./"` 表示插件文件位于 marketplace 根目录本身，Claude CLI 会从该路径读取 `plugin.json`。
  - `author` (`object`): 插件作者信息，包含 `name` 和 `email`。

**Usage Example**:
在 `furina init` 命令中，CLI 计算 marketplace 绝对路径后执行注册：
```typescript
// src/commands/init.ts:76-87
const marketplacePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../marketplace',
);
execSync(`claude plugin marketplace add ${marketplacePath}`, {
  stdio: 'pipe',
  cwd: process.cwd(),
});
```
Explanation: 此代码通过 `import.meta.url` 向上两级定位到项目根目录的 `marketplace/` 文件夹，然后调用 `claude plugin marketplace add` 将其注册为本地市场。Claude CLI 会读取 `marketplace/.claude-plugin/marketplace.json` 完成注册。

---

### `plugin.json` — 插件本体定义

**Source**: `marketplace/.claude-plugin/plugin.json`:1-19

**Functionality**: 定义 Furina 插件的完整身份和能力声明。当执行 `claude plugin install furina@furina-plugins` 时，Claude CLI 根据 `marketplace.json` 中的 `source` 路径找到此文件，读取插件元信息并注册其 MCP 服务器配置。特别是 `mcpServers` 字段使 Claude Code 在运行时能够发现并连接到 Furina 的 MCP 服务端，从而为 agent 提供 `markBeginPropose`、`markEndPropose` 等 MCP 工具。

**Core Code**:
```json
{
    "name": "furina",
    "version": "1.0.0",
    "description": "Brief plugin description",
    "author": {
        "name": "Meiyukichan",
        "email": "Meiyukichan@163.com",
        "url": "https://github.com/Meiyukichan"
    },
    "homepage": "https://github.com/Meiyukichan/furina",
    "repository": "https://github.com/Meiyukichan/furina",
    "license": "MIT",
    "mcpServers": {
        "furina-mcp-server": {
            "type": "http",
            "url": "http://localhost:3939/furina/mcp"
        }
    }
}
```
Source: `marketplace/.claude-plugin/plugin.json`:1-19

**字段详解**：
- `name` (`string`): 插件名称，值为 `"furina"`。与 `marketplace.json` 中 `plugins[].name` 对应，用于 `claude plugin install/uninstall` 命令中的插件引用。
- `version` (`string`): 插件版本号，与 marketplace 中的版本保持一致，当前为 `"1.0.0"`。
- `description` (`string`): 插件的简短描述。当前值为占位文本 `"Brief plugin description"`。
- `author` (`object`): 插件作者信息。
  - `name` (`string`): 作者名称。
  - `email` (`string`): 作者邮箱。
  - `url` (`string`): 作者 GitHub 主页 URL。
- `homepage` (`string`): 项目主页 URL，指向 GitHub 仓库页面。
- `repository` (`string`): 源码仓库 URL，与 homepage 一致。
- `license` (`string`): 开源许可证类型，值为 `"MIT"`。
- `mcpServers` (`object`): MCP 服务器配置映射。键为服务器名称，值为连接配置。此字段是插件能力声明的核心——它使 Claude Code 在插件安装后能够建立 MCP 连接。
  - `furina-mcp-server` (`object`): Furina MCP 服务器配置。
    - `type` (`string`): 传输类型，值为 `"http"`，表示使用 HTTP 传输协议连接 MCP 服务器。
    - `url` (`string`): MCP 服务器的 HTTP 端点地址，值为 `"http://localhost:3939/furina/mcp"`。此 URL 由 Furina UI 服务在本地监听，端口 3939 是 Furina 的默认服务端口。

**MCP 服务器注册的影响**：当 `plugin.json` 中的 `mcpServers` 被 Claude Code 读取后，插件名称和服务器名称组合生成 MCP 工具的命名空间前缀：`mcp__plugin_furina_furina-mcp-server__`。这使得 `furina-mcp-server` 暴露的 MCP 工具（如 `markBeginPropose`、`markEndPropose`）在 agent 中以 `mcp__plugin_furina_furina-mcp-server__markBeginPropose` 的完整名称可用。

**Usage Example**:
在 `furina init` 流程中，marketplace 注册成功后安装插件：
```typescript
// src/commands/init.ts:94-101
const step5 = ora('Installing furina plugin...').start();
try {
  execSync('claude plugin install furina@furina-plugins', {
    stdio: 'pipe',
    cwd: process.cwd(),
  });
  step5.succeed(chalk.green('Furina initialized successfully!'));
```
Explanation: 此命令使用 `pluginName@marketplaceName` 格式引用插件。Claude CLI 根据 marketplace 注册信息找到 `plugin.json`，安装插件并注册 MCP 服务器。安装完成后，agent 的 hooks 系统和 workflow 命令即可使用 `mcp__plugin_furina_furina-mcp-server__*` 系列工具。

---

### `furina init` — CLI 初始化命令（消费者）

**Source**: `src/commands/init.ts`:34-117

**Functionality**: `furina init` 是 plugin manifest 文件的直接消费者，负责将声明式 JSON 配置转化为 Claude CLI 的实际注册操作。它执行一个 6 步流程：检查 Claude CLI 安装、容错卸载旧插件、容错移除旧市场、添加市场（致命步骤）、安装插件（致命步骤）、自动启动 UI 服务。

**Core Logic**:
1. **版本检查**（Step 1）：执行 `claude --version` 确认 Claude CLI 已安装，失败则终止。
2. **容错清理**（Step 2-3）：依次执行旧插件卸载和旧市场移除，使用 try-catch 包裹，失败时显示黄色跳过提示而非终止。这确保了重复执行 `init` 的幂等性。
3. **市场注册**（Step 4）：通过 `import.meta.url` + `fileURLToPath` + `path.resolve` 计算 marketplace 目录的绝对路径（从 `src/commands/init.ts` 向上两级），然后执行 `claude plugin marketplace add <path>`。此步骤为致命步骤，失败时 `process.exit(1)` 终止。
4. **插件安装**（Step 5）：执行 `claude plugin install furina@furina-plugins`，同样为致命步骤。安装成功后自动调用 `runUi({ restart: true })` 启动 UI 服务（UI 启动失败不影响初始化成功判定）。

**Core Code**:
```typescript
// src/commands/init.ts:75-92 (关键注册步骤)
const marketplacePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../marketplace',
);
const step4 = ora('Adding marketplace...').start();
try {
  execSync(`claude plugin marketplace add ${marketplacePath}`, {
    stdio: 'pipe',
    cwd: process.cwd(),
  });
  step4.succeed(chalk.green('Marketplace added'));
  logger.info(`Marketplace added from ${marketplacePath}`);
} catch (err) {
  step4.fail(chalk.red('Failed to add marketplace'));
  logger.error(`Marketplace add failed: ${err}`);
  process.exit(1);
}
```
Source: `src/commands/init.ts`:75-92

**Usage Example**:
```bash
# 用户在项目目录下执行初始化
furina init

# 等效的 Claude CLI 命令序列：
claude plugin uninstall furina@furina-plugins   # 容错
claude plugin marketplace remove furina-plugins      # 容错
claude plugin marketplace add /path/to/furina/marketplace  # 注册市场
claude plugin install furina@furina-plugins       # 安装插件
```
Explanation: `furina init` 将上述 Claude CLI 命令封装为一个带 spinner 和日志的自动化流程。路径计算确保无论用户在哪个目录执行命令，都能正确定位到 marketplace 目录。

---

### `furina remove` — CLI 卸载命令（消费者）

**Source**: `src/commands/remove.ts`:38-109

**Functionality**: `furina remove` 是 plugin manifest 的反向消费者，执行插件和市场的卸载操作。支持交互式确认（默认）和 `--yes` 跳过确认模式。两个卸载步骤均为容错设计。

**Core Logic**:
1. **确认提示**：在 TTY 环境下使用 readline 交互询问用户确认，`--yes` 标志或非 TTY 环境下跳过确认。
2. **插件卸载**（Step 2）：执行 `claude plugin uninstall furina@furina-plugins`，使用 `PLUGIN_NAME` 常量引用完整标识符。
3. **市场移除**（Step 3）：执行 `claude plugin marketplace remove furina-plugins`，使用 `MARKETPLACE_NAME` 常量。
4. **结果汇总**：根据两个步骤的执行结果（`pluginRemoved`、`marketplaceRemoved`）构建人类可读的汇总消息。

**Core Code**:
```typescript
// src/commands/remove.ts:70-108
function performRemoval(): void {
  let pluginRemoved = false;
  let marketplaceRemoved = false;

  const step2 = ora('Uninstalling Furina plugin...').start();
  try {
    execSync(`claude plugin uninstall ${PLUGIN_NAME}`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    pluginRemoved = true;
    step2.succeed(chalk.green('Furina plugin uninstalled'));
  } catch {
    step2.succeed(chalk.yellow('Furina plugin not installed, skipping'));
  }

  const step3 = ora('Removing Furina marketplace...').start();
  try {
    execSync(`claude plugin marketplace remove ${MARKETPLACE_NAME}`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    marketplaceRemoved = true;
    step3.succeed(chalk.green('Furina marketplace removed'));
  } catch {
    step3.succeed(chalk.yellow('Furina marketplace not found, skipping'));
  }

  const summary = buildSummary(pluginRemoved, marketplaceRemoved);
  // ...
}
```
Source: `src/commands/remove.ts`:70-108

## Data Structures

### `marketplace.json` Schema

```json
{
    "name": "string",           // 市场唯一标识名
    "description": "string",    // 市场描述
    "owner": {
        "name": "string",       // 所有者名称
        "email": "string"       // 所有者邮箱
    },
    "plugins": [                // 可安装插件列表
        {
            "name": "string",       // 插件名称
            "description": "string", // 插件描述
            "version": "string",    // 语义化版本号
            "source": "string",     // 相对于marketplace目录的插件源路径
            "author": {
                "name": "string",   // 插件作者名称
                "email": "string"   // 插件作者邮箱
            }
        }
    ]
}
```

### `plugin.json` Schema

```json
{
    "name": "string",           // 插件名称
    "version": "string",        // 语义化版本号
    "description": "string",    // 插件描述
    "author": {
        "name": "string",       // 作者名称
        "email": "string",      // 作者邮箱
        "url": "string"         // 作者主页URL
    },
    "homepage": "string",       // 项目主页URL
    "repository": "string",     // 源码仓库URL
    "license": "string",        // 开源许可证类型
    "mcpServers": {             // MCP服务器配置映射
        "<server-name>": {
            "type": "string",   // 传输协议类型 (http/sse/stdio)
            "url": "string"     // MCP服务器端点地址
        }
    }
}
```

### CLI 标识符常量

```typescript
// src/commands/remove.ts:15-16
const PLUGIN_NAME = 'furina@furina-plugins';
const MARKETPLACE_NAME = 'furina-plugins';
```
- `PLUGIN_NAME` (`string`): 完整的插件标识符，格式为 `pluginName@marketplaceName`，用于 `claude plugin uninstall` 和 `claude plugin install` 命令。
- `MARKETPLACE_NAME` (`string`): 市场标识符，用于 `claude plugin marketplace add` 和 `claude plugin marketplace remove` 命令。

### MCP 工具命名空间

插件安装后，MCP 工具的完整名称遵循以下命名规则：
```
mcp__plugin_{marketplaceName}_{pluginName}_{serverName}__{toolName}
```

当前已注册的 MCP 工具：
- `mcp__plugin_furina_furina-mcp-server__markBeginPropose` — 标记 propose 阶段开始
- `mcp__plugin_furina_furina-mcp-server__markEndPropose` — 标记 propose 阶段结束

## Error Handling and Edge Cases

### init 命令错误处理策略

| 步骤 | 操作 | 错误策略 | 行为 |
|------|------|----------|------|
| Step 1 | `claude --version` | 致命 | 红色错误提示，`process.exit(1)` |
| Step 2 | 卸载旧插件 | 容错 | 黄色跳过提示，继续执行 |
| Step 3 | 移除旧市场 | 容错 | 黄色跳过提示，继续执行 |
| Step 4 | 添加市场 | 致命 | 红色错误提示，`process.exit(1)` |
| Step 5 | 安装插件 | 致命 | 红色错误提示，`process.exit(1)` |
| Step 6 | 启动 UI | 容错 | 日志记录错误，不影响初始化结果 |

**幂等性**：Steps 2-3 的容错设计确保 `furina init` 可以重复执行。旧插件/市场不存在时静默跳过，然后重新注册最新版本。

### remove 命令错误处理策略

两个卸载步骤均为容错设计：
- 插件未安装时：显示黄色 "not installed, skipping" 提示
- 市场不存在时：显示黄色 "not found, skipping" 提示

无论卸载结果如何，都会生成汇总消息，根据 `pluginRemoved` 和 `marketplaceRemoved` 两个布尔标志组合输出 4 种可能的结果状态。

### 边界条件

1. **路径计算**：`init.ts` 使用 `import.meta.url` + `fileURLToPath` + `path.resolve` 而非 `process.cwd()` 来定位 marketplace 目录，确保在任意工作目录下执行都能正确找到清单文件。
2. **stdio 配置**：所有 `execSync` 调用均使用 `stdio: 'pipe'`，抑制子进程输出，仅通过 spinner 和 logger 展示状态。
3. **marketplace.json 中的 `source: "./"`**：此相对路径指向 marketplace 根目录本身（而非子目录），意味着 `plugin.json` 与 `marketplace.json` 在同一 `.claude-plugin/` 目录层级中由 Claude CLI 一并读取。

## Dependencies

- **Depends on**:
  - Claude Code CLI (`claude` 命令) — 提供 `plugin marketplace add/remove` 和 `plugin install/uninstall` 子命令，是 manifest 文件的实际消费者
  - Furina UI 服务 (`runUi`) — 安装完成后自动启动 UI 服务，监听 `localhost:3939`，为 MCP 服务器提供 HTTP 端点

- **Depended by**:
  - `spec-hooks-config.md` (Hooks Configuration) — hooks 中的 `matcher` 字段引用 `mcp__plugin_furina_furina-mcp-server__*` 工具名，这些工具名由 `plugin.json` 的 `mcpServers` 配置派生而来
  - `spec-slash-command-workflow.md` (Workflow Slash Command) — workflow 命令中使用 `mcp__plugin_furina_furina-mcp-server__markBeginPropose/markEndPropose` 工具
  - CLI `init` 命令 (`src/commands/init.ts`) — 直接消费者，执行 manifest 注册流程
  - CLI `remove` 命令 (`src/commands/remove.ts`) — 直接消费者，执行 manifest 卸载流程

## Usage Examples

### 完整的插件注册与使用流程

```bash
# 1. 初始化 Furina（注册 marketplace + 安装插件）
furina init
# 输出：
# ? Checking claude installation... ✓ Claude is installed
# ? Removing old furina plugin... ✓ No old plugin found, skipping
# ? Removing old marketplace... ✓ No old marketplace found, skipping
# ? Adding marketplace... ✓ Marketplace added
# ? Installing furina plugin... ✓ Furina initialized successfully!
# Furina UI is starting...

# 2. 插件安装后，Claude Code agent 自动获得 MCP 工具
# agent 可以调用以下工具：
# mcp__plugin_furina_furina-mcp-server__markBeginPropose
# mcp__plugin_furina_furina-mcp-server__markEndPropose

# 3. 卸载 Furina
furina remove
# 交互式确认后执行：
# ? Uninstalling Furina plugin... ✓ Furina plugin uninstalled
# ? Removing Furina marketplace... ✓ Furina marketplace removed
# ✓ Furina plugin and marketplace have been removed.

# 4. 静默卸载（跳过确认）
furina remove --yes
```

Explanation: `furina init` 是用户使用 Furina 的第一步。它将 marketplace 目录注册为 Claude Code 的本地插件源，然后安装 `furina` 插件。安装完成后，Claude Code 根据 `plugin.json` 中的 `mcpServers` 配置建立与 `localhost:3939/furina/mcp` 的 HTTP 连接，使 Furina 的 MCP 工具对 agent 可用。`furina remove` 则执行反向操作，移除所有 Claude Code 中的 Furina 注册信息。
