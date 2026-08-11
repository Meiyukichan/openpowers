# CLI Entry Point and Program Registration

> Source files:
> - `bin/furina.js` : 1-8
> - `src/cli/index.ts` : 1-45

## Overview

本 spec 文档描述 Furina CLI 的启动架构，涵盖从 Node.js 进程入口到 Commander 程序实例化的完整引导流程。

**角色与定位**：这是整个 CLI 的最顶层模块，承担两个核心职责：
1. **进程入口**（`bin/furina.js`）：作为 `package.json` 中 `"bin"` 字段声明的可执行文件，由 npm/yarn 安装后在终端直接调用，负责导入并解析 Commander 程序。
2. **程序注册**（`src/cli/index.ts`）：作为 CLI barrel 文件，创建根 Commander 实例并从 `package.json` 读取名称、描述、版本号，随后逐一注册全部 12 个命令模块。

**设计动机**：将入口文件与程序注册逻辑分离是 Commander.js 应用的标准模式。`bin/` 目录下的 JS 文件仅做最少的胶水工作（导入 + parse），实际的命令构建逻辑集中在 `src/cli/index.ts`，使得测试和维护更加清晰。barrel 文件同时导出 `program` 实例，供测试或其他外部代码直接使用。

**使用场景**：
- 用户在终端执行 `furina <command>` 时，npm 通过 bin shim 调用 `bin/furina.js`
- 开发测试中可直接从 `src/cli/index.ts` 导入 `program` 实例进行单元测试

**涉及源文件及职责**：
- `bin/furina.js`：Node.js 可执行入口，导入编译后的 program 并调用 `parse()`
- `src/cli/index.ts`：CLI barrel 文件，创建 Commander 根实例，配置元信息，注册全部命令模块

## Architecture / Flow

CLI 启动的调用流程如下：

```
用户终端输入 "furina <command>"
       │
       ▼
  npm bin shim (node_modules/.bin/furina)
       │
       ▼
  bin/furina.js          ← 进程入口
       │  import { program } from '../dist/cli/index.js'
       │  program.parse()
       ▼
  src/cli/index.ts           ← barrel 注册文件
       │  1. 创建 Commander 实例
       │  2. 从 package.json 读取版本号
       │  3. 设置 name/description/version
       │  4. 依次注册 12 个命令模块
       ▼
  Commander 匹配并执行对应命令的 action handler
```

整个流程分为两层：进程入口层（`bin/`）和程序注册层（`src/cli/`）。编译产物位于 `dist/cli/index.js`，`bin/furina.js` 直接引用编译后的路径。

## Functionality / Interface Details

### `bin/furina.js` — 进程入口

**Source**: `bin/furina.js`:1-8

**Functionality**: 作为 `package.json` `"bin"` 字段指向的可执行文件，这是用户在终端执行 `furina` 命令时操作系统实际运行的脚本。文件首行包含 `#!/usr/bin/env node` shebang，确保在 Unix/Linux/macOS 系统上由 Node.js 解释执行。该文件仅执行两个操作：导入编译后的 Commander `program` 实例，然后调用 `program.parse()` 让 Commander 解析 `process.argv` 并分发到对应的命令 handler。

**Parameters**: 无。该文件作为脚本直接执行，不接受参数。

**Return Value**: 无显式返回值。Commander 的 `parse()` 会根据匹配到的命令异步执行对应的 action handler。

**Core Logic**:
- 通过 ES module 的 `import` 语法从编译产物路径 `../dist/cli/index.js` 导入 `program` 实例
- 调用 `program.parse()` 时 Commander 自动读取 `process.argv`，匹配注册的命令，执行对应的 action
- 如果没有匹配到任何命令，Commander 会输出帮助信息

**Core Code**:
```javascript
#!/usr/bin/env node
/**
 * @fileoverview CLI entry point
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */
import { program } from '../dist/cli/index.js';
program.parse();
```
Source: `bin/furina.js`:1-8

**Usage Example**:
```bash
# 通过 npm 全局安装后直接使用
furina init
furina ui --restart
furina change list
```
Explanation: 当用户在终端输入 `furina` 命令时，npm 的 bin shim 会调用此脚本。Commander 根据第一个参数（如 `init`、`ui`）匹配到对应的注册命令并执行。

---

### `registerProgram()` — 创建 Commander 根实例并注册全部命令

**Source**: `src/cli/index.ts`:1-45

**Functionality**: 这是 CLI 的 barrel 注册文件，负责构建完整的命令行程序。其核心工作分为三步：(1) 创建 Commander `Command` 实例并配置程序元信息；(2) 从 `package.json` 动态读取版本号以保持版本一致性；(3) 依次调用 12 个命令模块的注册函数，将所有子命令挂载到根 Commander 实例上。该文件同时导出 `program` 实例，使其可被 `bin/furina.js` 导入使用，也可在测试中直接引用。

**Parameters**: 无函数参数。该文件作为模块执行时自动完成初始化。

**Return Value**: 导出的 `program`（`Command` 类型实例），包含所有已注册的子命令。

**Core Logic**:

1. **动态读取 package.json 版本号**：使用 Node.js 内置的 `module.createRequire(import.meta.url)` 创建 `require` 函数，在 ES module 上下文中加载 `../../package.json` 以获取 `version` 字段。这种模式是因为 ESM 原生不支持 `require()`，需要通过 `createRequire` 桥接。

2. **配置 Commander 实例**：创建 `new Command()` 后链式调用 `.name('furina')`、`.description('Furina CLI - plugin-based development toolkit')`、`.version(pkg.version)` 设置程序名称、描述和版本。版本号直接从 package.json 读取，避免硬编码。

3. **注册命令模块**：逐一调用 12 个 `register*Command(program)` 函数。每个函数接收根 `program` 实例作为参数，向其添加一个或多个子命令。命令模块涵盖：`init`（初始化）、`ui`（UI 服务）、`active`（服务探活）、`launch`（服务启动）、`remove`（插件卸载）、`recover`（配置恢复）、`change`（变更生命周期管理）、`config`（配置管理）、`enable`/`disable`（代理开关）、`agents`（代理管理）、`schedule`（调度器）。

4. **导出 program**：通过 `export { program }` 将实例暴露给外部消费者。

**Core Code**:
```typescript
import { Command } from 'commander';
import module from 'module';
import { registerInitCommand } from '../commands/init.js';
import { registerUiCommand } from '../commands/ui.js';
import { registerActiveCommand } from '../commands/active.js';
import { registerLaunchCommand } from '../commands/launch.js';
import { registerRemoveCommand } from '../commands/remove.js';
import { registerRecoverCommand } from '../commands/recover.js';
import { registerChangeCommand } from '../commands/change/index.js';
import { registerConfigCommand } from '../commands/config.js';
import { registerEnableCommand } from '../commands/enable.js';
import { registerDisableCommand } from '../commands/disable.js';
import { registerAgentsCommand } from '../commands/agents.js';
import { registerScheduleCommand } from '../commands/schedule/index.js';

const require = module.createRequire(import.meta.url);
const pkg = require('../../package.json');

const program = new Command();

program
  .name('furina')
  .description('Furina CLI - plugin-based development toolkit')
  .version(pkg.version);

registerInitCommand(program);
registerUiCommand(program);
registerActiveCommand(program);
registerLaunchCommand(program);
registerRemoveCommand(program);
registerRecoverCommand(program);
registerChangeCommand(program);
registerConfigCommand(program);
registerEnableCommand(program);
registerDisableCommand(program);
registerAgentsCommand(program);
registerScheduleCommand(program);

export { program };
```
Source: `src/cli/index.ts`:1-45

**Usage Example**:
```typescript
// 在测试中直接导入 program 实例
import { program } from '../cli/index.js';

// 模拟命令行参数并解析
process.argv = ['node', 'furina', 'init'];
program.parse();

// 或直接检查已注册的命令
const commands = program.commands.map(cmd => cmd.name());
// ['init', 'ui', 'active', 'launch', 'remove', 'recover', 'change', 'config', 'enable', 'disable', 'agents', 'schedule']
```
Explanation: 测试代码可以直接导入 `program` 实例来验证命令注册是否正确，或模拟命令行参数进行集成测试。

## Data Structures

### `program`（Commander `Command` 实例）
```typescript
const program = new Command();
```
- Commander.js 库的核心类实例，表示整个 CLI 程序
- 通过链式调用配置 `name`、`description`、`version` 等元信息
- 通过 `register*Command(program)` 模式扩展子命令
- `program.parse()` 读取 `process.argv` 并分发执行

### `pkg`（package.json 内容）
```typescript
const pkg = require('../../package.json');
```
- 通过 `module.createRequire` 在 ESM 上下文中同步加载的 package.json 对象
- 主要使用 `pkg.version` 字段（当前值为 `"1.0.3"`）
- `name` 和 `description` 用于 Commander 的 help 输出

## Error Handling and Edge Cases

本 spec 涉及的源文件较为简洁，错误处理主要体现在以下方面：

1. **ESM/CJS 兼容性**：`module.createRequire(import.meta.url)` 是在 ESM 模块中使用 `require()` 的标准模式。如果 Node.js 版本不支持 `module` 内置模块的 `createRequire` 方法，导入阶段会抛出错误。项目通过 `package.json` 的 `"engines"` 字段约束最低 Node.js 版本来缓解此风险。

2. **package.json 路径解析**：`require('../../package.json')` 使用相对路径。该路径在编译后的 `dist/cli/index.js` 中解析为项目根目录的 `package.json`。如果项目结构被破坏（如 dist 目录位置异常），会导致模块加载失败。

3. **命令注册顺序**：12 个命令模块的注册是同步且有序的，无异步依赖。如果某个注册函数内部出错（如导入失败），会在模块加载阶段暴露，Commander 不会注册不完整的命令集。

4. **`program.parse()` 的隐式行为**：Commander 的 `parse()` 方法会自动处理 `--help`、`--version` 标志以及未知命令的错误提示。对于异步 action handler，Commander 会捕获 rejected promise 并输出错误。

## Dependencies

### Depends on
- **commander**：第三方命令行框架，提供 `Command` 类用于构建 CLI
- **Node.js `module` 内置模块**：提供 `createRequire` 函数以在 ESM 中使用 `require()`
- **`package.json`**：提供 `version` 字段供 Commander 配置
- **12 个命令注册模块**：
  - `src/commands/init.js` — 项目初始化
  - `src/commands/ui.js` — UI 服务管理
  - `src/commands/active.js` — 服务探活
  - `src/commands/launch.js` — 服务启动
  - `src/commands/remove.js` — 插件卸载
  - `src/commands/recover.js` — 配置恢复
  - `src/commands/change/index.js` — 变更生命周期管理（barrel 文件，内含多个子命令）
  - `src/commands/config.js` — 配置管理
  - `src/commands/enable.js` — 代理启用
  - `src/commands/disable.js` — 代理禁用
  - `src/commands/agents.js` — 代理管理
  - `src/commands/schedule/index.js` — 调度器（barrel 文件）

### Depended by
- **npm bin shim**：用户执行 `furina` 命令时，操作系统通过 npm 安装生成的 shim 脚本调用 `bin/furina.js`
- **测试代码**：可通过 `import { program }` 导入已注册的 Commander 实例进行测试

## Usage Examples

### 完整 CLI 启动流程

```bash
# 1. 用户在终端执行命令
$ furina init

# 2. 系统调用 bin/furina.js
#    → import { program } from '../dist/cli/index.js'
#    → 程序从 package.json 读取版本号 (1.0.3)
#    → 注册 12 个命令模块
#    → Commander 解析 process.argv，匹配到 'init' 命令
#    → 执行 init 命令的 action handler
```

### 查看版本信息

```bash
$ furina --version
# 输出: 1.0.3 (来自 package.json 的 version 字段)
```

### 查看帮助信息

```bash
$ furina --help
# 输出:
# Furina CLI - plugin-based development toolkit
#
# Options:
#   -V, --version   output the version number
#   -h, --help      display help for command
#
# Commands:
#   init            Initialize furina
#   ui              Start UI server
#   active          Check service status
#   launch          Start backend server
#   remove          Remove furina plugin
#   recover         Restore original claude configuration
#   change          Manage changes
#   config          Manage configuration
#   enable          Enable proxy
#   disable         Disable proxy
#   agents          Manage AI agents
#   schedule        Manage scheduler
#   help [command]  display help for command
```

### 在测试中使用 program 实例

```typescript
import { program } from '../../src/cli/index.js';

// 验证已注册的命令数量
const registeredCommands = program.commands.length;
console.log(`已注册 ${registeredCommands} 个命令`);
// 输出: 已注册 12 个命令

// 验证特定命令是否存在
const hasInit = program.commands.some(cmd => cmd.name() === 'init');
console.log(`init 命令已注册: ${hasInit}`);
// 输出: init 命令已注册: true
```
Explanation: 测试代码可以直接导入 `program` 实例来断言命令注册的完整性，无需启动完整的进程。由于 `program` 在模块加载时即完成所有命令注册，导入后即可检查。
