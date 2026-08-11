# Project Initialization (init)

> Source files:
> - `src/commands/init.ts` : 1-136

## Overview

`spec-init` 规范了 Furina CLI 的项目初始化流程。当用户首次使用 Furina 或需要重新配置环境时，通过 `furina init` 命令触发一个五步初始化流程，自动完成 Claude CLI 插件市场的注册和 Furina 插件的安装。

**设计动机**：Furina 作为 Claude CLI 的插件运行，依赖 Claude 的插件市场机制进行分发和安装。初始化过程需要确保 Claude CLI 已就绪、清理旧版本残留、注册本地 marketplace 路径、安装插件，最后自动启动 UI 服务以便用户立即使用。整个流程采用"容错优先"的设计思路：对于可能出现的非致命错误（如旧插件不存在），静默跳过；对于关键步骤（Claude 未安装、marketplace 添加失败、插件安装失败），则终止进程。

**使用场景**：
- 用户首次安装 Furina 后，运行 `furina init` 完成环境配置
- Furina 升级后，重新运行 `init` 以更新插件版本
- 插件损坏或配置丢失时，运行 `init` 进行修复

**涉及源文件及职责**：

| 文件 | 职责 |
|------|------|
| `src/commands/init.ts` | 包含核心初始化逻辑 `runInit()` 和命令注册函数 `registerInitCommand()` |

**依赖关系**：
- 向下调用 `src/commands/ui.ts` 中的 `runUi()` 在初始化完成后自动启动 UI 服务
- 向下调用 `src/utils/logger.ts` 中的 `logger` 进行日志记录
- 向上被 `src/cli/index.ts` 通过 `registerInitCommand(program)` 注册到 Commander 命令行程序

## Architecture / Flow

初始化流程是一个严格的顺序执行管线，共五步加一个后置自动操作。每一步都通过 `ora` 加载动画提供即时反馈，通过 `chalk` 进行彩色状态指示，通过 `logger` 记录日志。

```
furina init
  |
  v
[Step 1] Check claude --version ──── 失败 → process.exit(1)
  | 成功
  v
[Step 2] Uninstall old plugin ────── 失败 → 静默跳过（黄色提示）
  | 成功或跳过
  v
[Step 3] Remove old marketplace ──── 失败 → 静默跳过（黄色提示）
  | 成功或跳过
  v
[Step 4] Add marketplace ─────────── 失败 → process.exit(1)
  | 成功
  v
[Step 5] Install furina plugin ─ 失败 → process.exit(1)
  | 成功
  v
[Post] Auto-start UI (restart=true) ── 失败 → 日志记录，不影响初始化结果
```

**步骤容错分级**：
- **致命步骤**（Step 1, 4, 5）：调用 `process.exit(1)` 终止进程
- **容错步骤**（Step 2, 3）：捕获异常后用黄色文字显示"跳过"提示，继续执行下一步

**执行模式**：所有外部命令通过 `execSync` 同步执行，使用 `stdio: 'pipe'` 抑制子进程输出，避免干扰 spinner 动画。UI 启动步骤使用 `await runUi()` 异步执行。

## Functionality / Interface Details

### `runInit(): Promise<void>`

**Source**: `src/commands/init.ts`:34-117

**Functionality**: 执行完整的五步初始化流程并在成功后自动启动 UI 服务。这是初始化逻辑的核心函数，协调整个引导过程。每一步都通过 ora spinner 向用户展示当前进度，通过 chalk 着色区分成功（绿色）、跳过（黄色）和失败（红色）状态。所有关键事件通过 winston logger 记录到 `~/.furina/logs/furina.log`。

**Parameters**: 无参数。

**Return Value**:
- `Promise<void>`: 正常情况下无返回值。如果初始化成功，函数正常返回；如果在致命步骤失败，通过 `process.exit(1)` 直接终止进程，不会返回。

**Core Logic**:

函数内部严格按照五步顺序执行：

1. **Claude 安装检查**（致命）：通过 `execSync('claude --version')` 检测 Claude CLI 是否已安装。如果命令执行失败（Claude 未安装或不在 PATH 中），显示红色错误提示并调用 `process.exit(1)` 终止。

2. **卸载旧插件**（容错）：执行 `claude plugin uninstall furina@furina-plugins`。这一步可能失败（如旧插件未安装），失败时不会终止进程，而是显示黄色"跳过"提示。成功时显示绿色提示。

3. **移除旧 marketplace**（容错）：执行 `claude plugin marketplace remove furina-plugins`。同样为容错步骤，失败时静默跳过。用于清理可能残留的旧版本 marketplace 配置。

4. **添加 marketplace**（致命）：计算本地 marketplace 的绝对路径（相对于 `src/commands/init.ts` 文件位置，向上两级到项目根目录下的 `marketplace/` 文件夹），然后执行 `claude plugin marketplace add <path>`。路径计算使用 `import.meta.url` + `fileURLToPath` + `path.resolve` 来确保在任何工作目录下都能正确找到 marketplace。失败时终止进程。

5. **安装 Furina 插件**（致命）：执行 `claude plugin install furina@furina-plugins`。安装成功后，立即调用 `runUi({ restart: true })` 启动 UI 服务（带 restart 参数确保强制重启）。UI 启动失败时仅记录日志，不影响初始化的成功判定。

**Core Code**:
```typescript
// Step 4: Add marketplace as marketplace
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

// Step 5: Install furina plugin
const step5 = ora('Installing furina plugin...').start();
try {
  execSync('claude plugin install furina@furina-plugins', {
    stdio: 'pipe',
    cwd: process.cwd(),
  });
  step5.succeed(chalk.green('Furina initialized successfully!'));
  logger.info('Plugin installed successfully');
  process.stdout.write('Furina UI is starting...\n');

  // Auto-start UI after successful plugin installation
  try {
    await runUi({ restart: true });
  } catch (err) {
    logger.error(`UI auto-start failed after init: ${err instanceof Error ? err.message : String(err)}`);
    process.stdout.write(`Furina UI failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  }
} catch (err) {
  step5.fail(chalk.red('Failed to install furina plugin'));
  logger.error(`Plugin install failed: ${err}`);
  process.exit(1);
}
```
Source: `src/commands/init.ts`:75-116

**Usage Example**:
```typescript
// 在 CLI 入口直接调用
import { runInit } from './commands/init.js';

try {
  await runInit();
} catch (err) {
  console.error(`Init failed: ${err}`);
  process.exitCode = 1;
}
```
Explanation: 直接调用 `runInit()` 执行完整的初始化流程。正常情况下函数不会抛出异常（致命错误在内部通过 `process.exit(1)` 处理），但上层仍建议用 try-catch 包裹以防意外错误。

---

### `registerInitCommand(program: Command): void`

**Source**: `src/commands/init.ts`:123-136

**Functionality**: 将 `init` 子命令注册到 Commander 程序实例上。这是命令注册层的桥梁函数，将 Commander 的命令定义与核心初始化逻辑 `runInit()` 连接起来。注册后的命令通过 `furina init` 触发。函数还包含顶层的异常捕获，确保未预期的错误被记录到日志并输出到标准输出。

**Parameters**:
- `program` (`Command`): Commander 程序实例，由 `src/cli/index.ts` 中创建的根 `Command` 对象传入。

**Return Value**:
- `void`: 无返回值。副作用是在 `program` 上注册了一个名为 `init` 的子命令。

**Core Logic**:
- 调用 `program.command('init')` 注册子命令，描述为 `'Initialize furina in the current project'`
- `.action()` 回调中调用 `runInit()` 执行实际初始化逻辑
- 用 try-catch 包裹整个调用，捕获 `runInit()` 可能抛出的意外异常
- 错误信息同时输出到 `logger.error()` 和 `process.stdout.write()`
- 设置 `process.exitCode = 1` 标记退出码（而非直接调用 `process.exit(1)`，以允许 Node.js 的清理逻辑正常执行）

**Core Code**:
```typescript
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize furina in the current project')
    .action(async () => {
      try {
        await runInit();
      } catch (err) {
        logger.error(`Init command failed: ${err instanceof Error ? err.message : String(err)}`);
        process.stdout.write(`Init failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
```
Source: `src/commands/init.ts`:123-136

**Usage Example**:
```typescript
// 在 CLI 入口注册所有命令
import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';

const program = new Command();
program.name('furina').version('1.0.0');

registerInitCommand(program);

program.parse(process.argv);
```
Explanation: 在 CLI 入口文件中，将 Commander 实例传入 `registerInitCommand()` 完成命令注册。之后用户即可通过 `furina init` 触发初始化流程。

## Data Structures

### `execSync` 调用选项

本模块中所有 `execSync` 调用使用统一的选项模式：

```typescript
{
  stdio: 'pipe',    // 抑制子进程的 stdout/stderr 输出，避免干扰 ora spinner
  cwd: process.cwd() // 使用当前工作目录作为命令执行上下文
}
```
- `stdio: 'pipe'` : 将子进程的输入输出管道化，不直接打印到终端，确保 spinner 动画的视觉效果不被破坏
- `cwd: process.cwd()` : 确保 `claude` 命令在用户执行 `furina init` 的目录下运行

### Spinner 状态指示（chalk 颜色约定）

| 状态 | 方法 | 颜色 | 含义 |
|------|------|------|------|
| 成功 | `spinner.succeed()` | `chalk.green()` | 步骤正常完成 |
| 跳过 | `spinner.succeed()` | `chalk.yellow()` | 步骤失败但容错跳过 |
| 失败 | `spinner.fail()` | `chalk.red()` | 致命错误，流程终止 |

注意：容错步骤（Step 2, 3）在失败时使用 `succeed()`（带黄色文字）而非 `fail()`，视觉上表示"已处理，非错误"。致命步骤（Step 1, 4, 5）使用 `fail()`（带红色文字）表示流程将终止。

### marketplace 路径计算

```typescript
const marketplacePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../marketplace',
);
```
- 基准点：当前模块文件 `init.ts` 的物理路径（通过 `import.meta.url` + `fileURLToPath` 获取）
- 向上两级：从 `src/commands/` 回到项目根目录
- 目标：项目根目录下的 `marketplace/` 文件夹
- 使用 `path.resolve` 确保生成跨平台兼容的绝对路径

## Error Handling and Edge Cases

### 错误分级策略

本模块采用两级错误处理策略：

**致命错误（process.exit(1)）**：
- Step 1 失败（Claude 未安装）：后续步骤全部依赖 Claude CLI，无法继续
- Step 4 失败（marketplace 添加失败）：无法安装插件
- Step 5 失败（插件安装失败）：初始化的核心目标未达成

**容错错误（静默跳过）**：
- Step 2 失败（旧插件不存在）：首次安装时旧插件自然不存在，属于正常场景
- Step 3 失败（旧 marketplace 不存在）：同理，首次安装时属于正常场景

**特殊处理**：
- **UI 自启动失败**：在 Step 5 插件安装成功后，如果 `runUi({ restart: true })` 抛出异常，仅通过 `logger.error()` 和 `process.stdout.write()` 记录错误，不回滚插件安装，不影响初始化的成功判定。这是因为插件安装是初始化的核心目标，UI 启动是后续增值操作。
- **命令注册层捕获**：`registerInitCommand()` 中的 try-catch 作为最后一道防线，捕获 `runInit()` 中可能遗漏的意外异常（如 Node.js 运行时错误），设置 `process.exitCode = 1` 而非 `process.exit(1)`，允许 Node.js 完成清理工作（如刷新 stdout 缓冲区）。

### Edge Cases

- **Claude 安装但不在 PATH 中**：`execSync('claude --version')` 会因找不到命令而抛出 `ENOENT` 错误，被 Step 1 捕获后终止
- **marketplace 路径包含空格**：`execSync` 拼接命令字符串时未对路径加引号，在路径包含空格的系统上可能失败。这是当前实现的一个潜在限制
- **无网络连接**：`claude plugin install` 和 `claude plugin marketplace add` 可能需要网络访问，网络不可用时会在相应步骤失败并正确报告
- **并发执行**：`execSync` 是同步阻塞调用，不存在并发问题。但同一时间不应有另一个 `furina init` 进程同时运行

## Dependencies

### Depends on

| 模块/Spec | 用途 |
|-----------|------|
| `src/commands/ui.ts` / `spec-ui` | 初始化成功后调用 `runUi({ restart: true })` 自动启动 UI 服务 |
| `src/utils/logger.ts` | 提供 `logger` 实例进行日志记录（`info`、`warn`、`error` 级别） |
| `commander` | 提供 `Command` 类用于命令注册 |
| `ora` | 提供终端 spinner 加载动画 |
| `chalk` | 提供终端文字着色（绿色/黄色/红色状态指示） |
| `child_process` | 提供 `execSync` 同步执行外部命令 |
| `node:url` | 提供 `fileURLToPath` 将 ESM 模块 URL 转换为文件路径 |
| `node:path` | 提供路径解析和拼接工具 |

### Depended by

| 模块/Spec | 用途 |
|-----------|------|
| `src/cli/index.ts` / `spec-entry-barrel` | 通过 `registerInitCommand(program)` 注册 init 命令，作为 CLI 入口的一部分 |

## Usage Examples

### 完整使用场景

```typescript
// src/cli/index.ts - CLI 入口注册 init 命令
import { Command } from 'commander';
import { registerInitCommand } from '../commands/init.js';

const program = new Command();
program.name('furina').description('Furina CLI').version('1.0.0');

// 注册 init 命令
registerInitCommand(program);

// 注册其他命令...
// program.parse(process.argv);
```

**终端执行流程**：

```bash
$ furina init

# 终端输出示意：
? Checking claude installation...    ✓ Claude is installed
? Removing old furina plugin...  ✓ No old plugin found, skipping
? Removing old marketplace...        ✓ Old marketplace removed
? Adding marketplace...              ✓ Marketplace added
? Installing furina plugin...    ✓ Furina initialized successfully!
Furina UI is starting...
```

Explanation: 用户在终端运行 `furina init`，CLI 框架路由到 `registerInitCommand` 注册的 action，action 内部调用 `runInit()` 执行五步初始化。每个步骤显示一个 spinner，完成后变为绿色对勾（成功）或黄色对勾（跳过）。全部步骤成功后，UI 服务自动启动并打开浏览器。如果 Claude 未安装，第一步即显示红色叉号并退出：

```bash
$ furina init

# Claude 未安装时的输出：
? Checking claude installation...    ✖ Claude is not installed. Please install claude first.
```

### 单独调用 runInit

```typescript
// 在测试或其他上下文中直接调用核心函数
import { runInit } from './commands/init.js';

async function bootstrap() {
  try {
    await runInit();
    console.log('Furina is ready');
  } catch (err) {
    // runInit 内部已处理致命错误（process.exit），
    // 这里仅捕获意外异常
    console.error('Unexpected init error:', err);
  }
}
```
Explanation: `runInit()` 可以在非 CLI 上下文中直接调用。需要注意的是，致命错误在函数内部通过 `process.exit(1)` 处理，不会抛出到调用方。只有意外的运行时错误（如内存不足）才会进入 catch 分支。
