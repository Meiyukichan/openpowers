# Change Command Registration (Barrel File)

> Source files:
> - `src/commands/change/index.ts` : 1-103

## Overview

`spec-change-barrel.md` 是 change 子命令模块的入口注册文件（barrel file），负责在 Commander.js 的程序实例上注册 `change` 父命令及其全部 7 个子命令。

**在系统中的定位**：该文件是 CLI 命令树中 change 模块的唯一注册入口。上层的 `src/cli/index.ts` 通过调用 `registerChangeCommand(program)` 将整个 change 命令族挂载到根 Commander 实例上。该文件不包含任何业务逻辑，纯粹作为命令定义层，将 CLI 参数解析结果委托给对应的 `run*` 函数。

**设计动机**：采用 barrel pattern 集中管理所有子命令注册，使得：
- 每个子命令的业务逻辑可以独立实现并放置在各自的模块文件中（list.ts、new.ts、status.ts 等）
- 入口文件只负责命令结构定义（命令名、参数、选项），实现关注点分离
- 新增子命令只需在此文件追加注册代码，无需修改上层调用者

**使用场景**：当 CLI 启动时，`src/cli/index.ts` 调用 `registerChangeCommand(program)` 注册 change 命令族，之后用户执行 `furina change <subcommand>` 时，Commander.js 根据此处注册的命令定义进行参数解析并路由到对应的 action handler。

**涉及的源文件及其职责**：

| 文件 | 职责 |
|------|------|
| `src/commands/change/index.ts` | 本文件。注册 change 父命令及 7 个子命令的 Commander 定义 |
| `src/commands/change/list.ts` | `runChangeList()` - 列出所有变更及进度 |
| `src/commands/change/new.ts` | `runChangeNew(name, options)` - 创建新变更 |
| `src/commands/change/status.ts` | `runChangeStatus(name)` - 查询变更状态 |
| `src/commands/change/archive.ts` | `runChangeArchive(name)` - 归档已完成的变更 |
| `src/commands/change/instruction.ts` | `runChangeInstruction(name, options)` - 生成制品指令 |
| `src/commands/change/feature.ts` | 4 个 feature 生命周期函数（status/next/start/complete） |
| `src/commands/change/stage.ts` | `runChangeStage(stageName, options)` - 更新阶段进度 |
| `src/cli/index.ts` | 上层调用者，调用 `registerChangeCommand(program)` |

## Architecture / Flow

该文件的注册结构为一棵二级命令树：

```
furina
  └── change                          (父命令)
        ├── list                      (无参数)
        ├── new <name> --desc         (必填参数 + 必填选项)
        ├── status <name>             (必填参数)
        ├── archive <name>            (必填参数)
        ├── instruction <name>        (必填参数 + 三选一选项)
        │     ├── --proposal
        │     ├── --design
        │     └── --specs
        ├── feature <changeName>      (必填参数 + 四选一选项)
        │     ├── --status
        │     ├── --next
        │     ├── --start <featureId>
        │     └── --complete <featureId>
        └── stage <stageName>         (必填参数 + 必填选项 + 可选选项)
              ├── --session <sessionId>  (必填)
              ├── --status <status>      (必填)
              ├── --title <title>        (可选)
              ├── --input <inputPath>    (可选)
              └── --output <outputPath>  (可选)
```

**注册流程**：
1. 创建 `change` 父命令实例（`changeCmd`），描述为 "Manage Furina change artifacts"
2. 依次在 `changeCmd` 上注册 7 个子命令
3. 每个子命令通过 `.action()` 回调将解析后的参数委托给对应的 `run*` 函数
4. `feature` 子命令的 action 内含互斥选项分发逻辑（无脚本执行，纯条件分支）

## Functionality / Interface Details

### `registerChangeCommand(program: Command): void`

**Source**: `src/commands/change/index.ts`:24-103

**Functionality**: 在传入的 Commander 程序实例上注册 `change` 父命令及其所有子命令。这是整个 change 子系统的唯一命令注册入口。函数内部创建一个 `change` 父 Command，然后依次调用 `.command()`、`.description()`、`.option()` 和 `.action()` 链式 API 注册 7 个子命令。每个子命令的 action handler 直接调用对应模块导出的 `run*` 函数，不包含任何业务逻辑。

**Parameters**:
- `program` (`Command`): Commander.js 根程序实例。来自 `src/cli/index.ts` 中 `const program = new Command()` 创建的实例。该实例已设置了 name、description 和 version。

**Return Value**:
- `void`: 无返回值。该函数通过副作用在 program 上注册命令。

**Core Logic**:

该函数按以下顺序注册 7 个子命令：

1. **`change list`** (line 29-34): 最简单的子命令，无参数、无选项。action 直接调用 `runChangeList()`。

2. **`change new <name>`** (line 36-42): 定义一个必填的位置参数 `<name>` 和一个必填选项 `--desc <description>`。Commander 的 `.requiredOption()` 确保 `--desc` 必须提供，否则 Commander 自动报错并退出。action 回调将 `(name, options)` 传递给 `runChangeNew()`。

3. **`change status <name>`** (line 44-49): 定义必填位置参数 `<name>`，委托给 `runChangeStatus(name)`。

4. **`change archive <name>`** (line 51-56): 定义必填位置参数 `<name>`，委托给 `runChangeArchive(name)`。

5. **`change instruction <name>`** (line 58-66): 定义必填位置参数 `<name>`，以及三个可选的布尔选项 `--proposal`、`--design`、`--specs`。这三个选项的互斥约束由 `runChangeInstruction()` 内部校验（检查恰好一个 flag 为 true）。

6. **`change feature <changeName>`** (line 68-89): 定义必填位置参数 `<changeName>`，以及四个互斥选项 `--status`、`--next`、`--start <featureId>`、`--complete <featureId>`。action 内部使用 `if-else if` 链进行分发，按优先级检查每个选项标志。当四个选项均未提供时，输出错误信息到 stderr 并以 exit code 1 退出。

7. **`change stage <stageName>`** (line 91-102): 定义必填位置参数 `<stageName>`，两个必填选项 `--session <sessionId>` 和 `--status <status>`（均使用 `.requiredOption()`），以及三个可选选项 `--title`、`--input`、`--output`。所有参数打包为 options 对象传递给 `runChangeStage()`。

**Core Code**:
```typescript
export function registerChangeCommand(program: Command): void {
  const changeCmd = program
    .command('change')
    .description('Manage Furina change artifacts');

  changeCmd
    .command('list')
    .description('List all changes with progress')
    .action(() => {
      runChangeList();
    });

  changeCmd
    .command('new <name>')
    .description('Create a new change')
    .requiredOption('--desc <description>', 'Brief description of the change')
    .action((name: string, options: { desc: string }) => {
      runChangeNew(name, options);
    });

  // ... status, archive, instruction registrations ...

  // Feature lifecycle management subcommands
  changeCmd
    .command('feature <changeName>')
    .description('Manage features for a change')
    .option('--status', 'Display feature status summary')
    .option('--next', 'Find the next actionable feature')
    .option('--start <featureId>', 'Start a pending feature')
    .option('--complete <featureId>', 'Complete an in-progress feature')
    .action((changeName: string, options: { status?: boolean; next?: boolean; start?: string; complete?: string }) => {
      if (options.status) {
        runFeatureStatus(changeName);
      } else if (options.next) {
        runFeatureNext(changeName);
      } else if (options.start) {
        runFeatureStart(changeName, options.start);
      } else if (options.complete) {
        runFeatureComplete(changeName, options.complete);
      } else {
        process.stderr.write('Error: No action specified. Use --status, --next, --start <featureId>, or --complete <featureId>\n');
        process.exit(1);
      }
    });
}
```
Source: `src/commands/change/index.ts`:24-89

**Usage Example**:
```typescript
import { Command } from 'commander';
import { registerChangeCommand } from './commands/change/index.js';

const program = new Command();
program.name('furina').description('CLI toolkit').version('1.0.0');

// 注册 change 命令族
registerChangeCommand(program);

// 解析用户输入
program.parse(process.argv);
// 用户输入: furina change list
// 用户输入: furina change new my-feature --desc "Add auth module"
// 用户输入: furina change feature my-feature --start feat-001
```
Explanation: 创建 Commander 实例后调用 `registerChangeCommand` 注册 change 命令。之后用户可以通过 CLI 执行 `furina change list`、`furina change new my-feature --desc "..."` 等命令。

## Command Registration Details

### 子命令注册参数对照表

| 子命令 | Commander API | 位置参数 | 必填选项 | 可选选项 | action handler |
|--------|--------------|----------|---------|---------|----------------|
| `list` | `.command('list')` | 无 | 无 | 无 | `runChangeList()` |
| `new` | `.command('new <name>')` | `<name>` | `--desc <description>` | 无 | `runChangeNew(name, options)` |
| `status` | `.command('status <name>')` | `<name>` | 无 | 无 | `runChangeStatus(name)` |
| `archive` | `.command('archive <name>')` | `<name>` | 无 | 无 | `runChangeArchive(name)` |
| `instruction` | `.command('instruction <name>')` | `<name>` | 无 | `--proposal`, `--design`, `--specs` | `runChangeInstruction(name, options)` |
| `feature` | `.command('feature <changeName>')` | `<changeName>` | 无 | `--status`, `--next`, `--start <fid>`, `--complete <fid>` | 内部分发 (见下) |
| `stage` | `.command('stage <stageName>')` | `<stageName>` | `--session <sid>`, `--status <s>` | `--title`, `--input`, `--output` | `runChangeStage(stageName, options)` |

### feature 子命令内部分发逻辑

`feature` 子命令的 action handler 是本文件中唯一包含条件逻辑的地方。Commander.js 将 `--status` 解析为 `boolean` 类型，`--start <featureId>` 和 `--complete <featureId>` 解析为 `string` 类型（选项值）。分发优先级：

1. `options.status` (boolean) -> `runFeatureStatus(changeName)`
2. `options.next` (boolean) -> `runFeatureNext(changeName)`
3. `options.start` (string) -> `runFeatureStart(changeName, options.start)`
4. `options.complete` (string) -> `runFeatureComplete(changeName, options.complete)`
5. 均未提供 -> 输出错误到 stderr，`process.exit(1)`

由于使用 `if-else if` 链，当同时提供多个选项时，按上述优先级只执行第一个匹配的分支。这是有意为之的设计：Commander 不原生支持互斥选项组，因此通过分发优先级隐式实现互斥。

### Commander 选项类型推导

Commander.js 对选项的类型推导规则如下（影响 TypeScript 类型注解）：
- `--flag` (无值) -> `boolean`
- `--flag <value>` -> `string`（必填值的选项）
- `.requiredOption()` -> Commander 在解析时自动校验，缺失时输出帮助信息并 `process.exit(1)`

## Data Structures

本文件不定义任何自定义数据结构。涉及的类型均为 Commander.js 内置类型或通过 TypeScript 注解内联定义。

### `feature` action options 类型

```typescript
{
  status?: boolean;     // --status 标志
  next?: boolean;       // --next 标志
  start?: string;       // --start <featureId>，值为 featureId 字符串
  complete?: string;    // --complete <featureId>，值为 featureId 字符串
}
```

### `stage` action options 类型

```typescript
{
  session: string;      // --session <sessionId>，必填
  status: string;       // --status <status>，必填，值为 'in_progress' | 'done' | 'skipped'
  title?: string;       // --title <title>，可选
  input?: string;       // --input <inputPath>，可选
  output?: string;      // --output <outputPath>，可选
}
```

### `instruction` action options 类型

```typescript
{
  proposal?: boolean;   // --proposal 标志
  design?: boolean;     // --design 标志
  specs?: boolean;      // --specs 标志
}
```

## Error Handling and Edge Cases

本文件的错误处理仅限于以下场景：

1. **feature 子命令无选项** (line 86-88): 当用户执行 `furina change feature <name>` 而未指定任何操作选项时，action handler 输出错误信息到 stderr（`Error: No action specified...`）并以 exit code 1 退出。这是本文件唯一需要手动处理的错误场景。

2. **Commander 内置校验**：
   - `.requiredOption()` 声明的选项（`--desc`、`--session`、`--status`）在缺失时由 Commander 自动输出错误信息并退出，无需手动处理。
   - 必填的位置参数（`<name>`、`<changeName>`、`<stageName>`）由 Commander 的 `.command('xxx <arg>')` 定义自动校验，缺失时 Commander 自动报错。

3. **不在此文件处理的错误**：
   - 名称格式校验（kebab-case）-> 由各 `run*` 函数内部通过 `validateChangeName()` 处理
   - 变更不存在 -> 由各 `run*` 函数内部检查
   - 参数值校验（如 status 值范围）-> 由 `runChangeStage()` 内部校验
   - 文件系统错误 -> 由各 `run*` 函数内部处理

## Dependencies

- **Depends on**:
  - `commander` (npm package): 提供 `Command` 类用于命令注册
  - `./list.js` -> `runChangeList`: 列表子命令实现
  - `./new.js` -> `runChangeNew`: 创建子命令实现
  - `./status.js` -> `runChangeStatus`: 状态查询子命令实现
  - `./instruction.js` -> `runChangeInstruction`: 指令生成子命令实现
  - `./feature.js` -> `runFeatureStatus`, `runFeatureNext`, `runFeatureStart`, `runFeatureComplete`: Feature 生命周期管理
  - `./archive.js` -> `runChangeArchive`: 归档子命令实现
  - `./stage.js` -> `runChangeStage`: 阶段进度更新子命令实现

- **Depended by**:
  - `src/cli/index.ts` -> 调用 `registerChangeCommand(program)` 将 change 命令族注册到根 Commander 实例

## Usage Examples

### 完整注册流程

以下展示了从 CLI 入口到 change 命令注册的完整调用链：

```typescript
// src/cli/index.ts
import { Command } from 'commander';
import { registerChangeCommand } from '../commands/change/index.js';

// 创建根 Commander 实例
const program = new Command();
program
  .name('furina')
  .description('Furina CLI - plugin-based development toolkit')
  .version(pkg.version);

// 注册 change 命令族（以及其他命令模块）
registerChangeCommand(program);

// 解析命令行参数并执行
program.parse(process.argv);
```

Explanation: `src/cli/index.ts` 创建 Commander 根实例后，依次调用各模块的 `register*Command()` 函数。`registerChangeCommand` 负责将 change 子命令树挂载到根实例上。当用户执行 `furina change <subcommand> ...` 时，Commander 根据此处注册的命令定义匹配参数并执行对应的 action handler。

### 典型 CLI 调用示例

```bash
# 列出所有变更
furina change list

# 创建新变更
furina change new user-auth --desc "Implement user authentication module"

# 查询变更状态
furina change status user-auth

# 归档已完成的变更
furina change archive user-auth

# 获取制品生成指令
furina change instruction user-auth --proposal
furina change instruction user-auth --design
furina change instruction user-auth --specs

# Feature 生命周期管理
furina change feature user-auth --status
furina change feature user-auth --next
furina change feature user-auth --start feat-001
furina change feature user-auth --complete feat-001

# 更新阶段进度
furina change stage explore --session sess-001 --status in_progress
furina change stage coding --session sess-001 --status done --title "Auth Module" --input "./specs/auth.md" --output "./src/auth.ts"
```

Explanation: 上述命令展示了所有 7 个子命令的典型用法。`new` 和 `stage` 命令有必填选项，`instruction` 和 `feature` 命令需要选择互斥的操作标志。`stage` 命令的可选参数（`--title`、`--input`、`--output`）用于向阶段进度系统传递附加上下文。
