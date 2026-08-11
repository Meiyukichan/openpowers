# Artifact Instruction Generation

> Source files:
> - `src/commands/change/instruction.ts` : 1-87

## Overview

`spec-change-instruction` 实现了 `furina change instruction` 命令，负责根据 JSON 模板文件生成制品（artifact）的创建指令。该功能在 Furina 的 Change 工作流中处于"制品准备"阶段——在用户创建一个 change 之后、实际编写 proposal/design/specs 之前，由工作流代理（workflow agent）调用，以获取标准化的制品创建指令。

**设计动机**：Furina 要求每个 change 按固定顺序产出 proposal.md、design.md、specs/ 等制品。每种制品的结构和内容要求各不相同，且依赖关系明确（design 依赖 proposal，specs 依赖 proposal 和 design）。通过将制品模板和依赖检查逻辑集中到 instruction 命令中，工作流代理可以一次性获取完整的生成指令（包含模板内容、输出路径、依赖状态），无需自行管理模板和依赖逻辑。

**使用场景**：
- 工作流代理在准备好生成 proposal 时，调用 `furina change instruction <name> --proposal`
- 工作流代理在 proposal 完成后准备生成 design 时，调用 `furina change instruction <name> --design`
- 工作流代理在 design 完成后准备生成 specs 时，调用 `furina change instruction <name> --specs`

**源文件职责**：
- `src/commands/change/instruction.ts`：包含模板读取函数 `readTemplateFile` 和主执行函数 `runChangeInstruction`，负责模板加载、占位符替换、依赖检查和 JSON 输出。

## Architecture / Flow

```
CLI 输入: furina change instruction <name> --proposal|--design|--specs
         │
         ▼
  ┌──────────────────────────┐
  │ validateChangeName(name) │  ← shared.ts: 校验 kebab-case 格式
  └──────────┬───────────────┘
             │ valid?
             ▼
  ┌──────────────────────────┐
  │ 检查 change 目录是否存在   │  ← fs.existsSync(CHANGES_DIR/name)
  └──────────┬───────────────┘
             │ exists?
             ▼
  ┌──────────────────────────┐
  │ 校验恰好一个 flag 被指定   │  ← --proposal / --design / --specs
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │ readTemplateFile()       │  ← 读取 resources/<artifactId>-template.json
  │ → JSON.stringify → 全局   │
  │   替换 [change-name]     │
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │ 依赖检查 (仅 design/specs)│  ← 检查 proposal.md / design.md 是否存在
  │ → 设置 deps[].done       │
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │ stdout 输出 JSON          │  ← JSON.stringify(result, null, 2)
  └──────────────────────────┘
```

模板文件存储在项目的 `resources/` 目录下，包含三种 JSON 文件：
- `proposal-template.json`：proposal 制品模板（无依赖）
- `design-template.json`：design 制品模板（依赖 proposal）
- `specs-template.json`：specs 制品模板（依赖 proposal 和 design）

每个模板 JSON 包含 `changeName`、`artifactId`、`outputPath`、`description`、`instruction`、`template`、`dependencies` 等字段，其中 `changeName` 和 `outputPath` 包含 `[change-name]` 占位符，运行时会被实际的 change 名称替换。

## Functionality / Interface Details

### `readTemplateFile(artifactId: string) -> Record<string, unknown>`

**Source**: `src/commands/change/instruction.ts`:23-27

**Functionality**: 从项目的 `resources/` 目录读取指定制品类型对应的 JSON 模板文件并解析返回。该函数通过 `import.meta.url` 解析当前源文件位置，然后向上回溯三级目录（`../../..`）到达项目根目录，再定位 `resources/<artifactId>-template.json` 文件。这种相对路径解析方式确保了无论从哪个工作目录运行 CLI，都能正确找到模板文件。

**Parameters**:
- `artifactId` (`string`): 制品标识符，取值为 `'proposal'`、`'design'` 或 `'specs'`，对应 `resources/` 目录下的 `<artifactId>-template.json` 文件名前缀。

**Return Value**:
- `Record<string, unknown>`: 解析后的模板 JSON 对象，包含 `changeName`、`artifactId`、`outputPath`、`description`、`instruction`、`template`、`dependencies` 等字段。
- 错误情况：若模板文件不存在或 JSON 解析失败，将抛出未捕获异常（`ENOENT` 或 `SyntaxError`），导致进程崩溃退出。

**Core Logic**:
1. 通过 `path.dirname(url.fileURLToPath(import.meta.url))` 获取当前模块文件所在目录（编译后的 `dist/commands/change/` 目录）。
2. 通过 `path.join(changeCommandDirname, '..', '..', '..', 'resources', ...)` 向上回溯三级到项目根目录，拼接 `resources/<artifactId>-template.json` 路径。
3. 使用 `fs.readFileSync` 同步读取文件内容，再用 `JSON.parse` 解析为对象返回。

**Core Code**:
```typescript
const changeCommandDirname = path.dirname(url.fileURLToPath(import.meta.url));

export function readTemplateFile(artifactId: string): Record<string, unknown> {
  const templatePath = path.join(changeCommandDirname, '..', '..', '..', 'resources', `${artifactId}-template.json`);
  const raw = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(raw);
}
```
Source: `src/commands/change/instruction.ts`:15-27

**Usage Example**:
```typescript
import { readTemplateFile } from './instruction.js';

// 读取 design 模板
const designTemplate = readTemplateFile('design');
console.log(designTemplate.artifactId);  // 'design'
console.log(designTemplate.dependencies); // [{ id: 'proposal', done: true, ... }]
```
Explanation: 直接传入制品标识符即可获取对应模板对象。返回的对象中 `[change-name]` 占位符尚未被替换，需要在调用方（`runChangeInstruction`）中完成替换。

---

### `runChangeInstruction(name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }) -> void`

**Source**: `src/commands/change/instruction.ts`:37-87

**Functionality**: `change instruction` 子命令的主执行函数。接收 change 名称和制品类型选项，执行完整的指令生成流程：校验输入、读取模板、替换占位符、检查依赖文件是否存在、将最终结果以格式化 JSON 输出到 stdout。该函数是面向 Commander action 的入口，被 `index.ts` 中的 `registerChangeCommand` 直接调用。

**Parameters**:
- `name` (`string`): change 名称，必须符合 kebab-case 格式（如 `add-user-auth`），由 Commander 从 `<name>` 位置参数中提取。
- `options` (`{ proposal?: boolean; design?: boolean; specs?: boolean }`): 命令选项对象，由 Commander 解析 `--proposal`、`--design`、`--specs` 三个互斥布尔选项得到。**必须且只能指定其中一个为 `true`**。

**Return Value**:
- `void`：无返回值。结果通过 `process.stdout.write()` 输出为 JSON 字符串，日志信息通过 `logger.info()` 写入日志文件。
- 退出行为：校验失败时调用 `process.exit(1)` 终止进程（change 名称非法、change 目录不存在、未指定或指定了多个 flag）。

**Core Logic**:

函数内部执行以下五个阶段：

**阶段 1 - 输入校验**：
- 调用 `validateChangeName(name)` 检查 change 名称是否符合 kebab-case 正则 `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`。
- 检查 `path.join(CHANGES_DIR, name)` 对应的目录是否存在（`CHANGES_DIR` = `<cwd>/furina/changes`）。
- 检查 `options` 中恰好有且仅有一个 flag 为 `true`（`[options.proposal, options.design, options.specs].filter(Boolean).length === 1`）。

**阶段 2 - 制品类型确定**：
- 根据 `options.proposal`、`options.design`、`options.specs` 三个布尔值确定 `artifactId` 字符串，映射为 `'proposal'`、`'design'` 或 `'specs'`。

**阶段 3 - 模板读取与占位符替换**：
- 调用 `readTemplateFile(artifactId)` 读取对应模板 JSON。
- 通过 `JSON.stringify` 将整个模板对象序列化为字符串，然后使用全局正则 `/\[change-name\]/g` 替换所有 `[change-name]` 占位符为实际的 change 名称。这种"先序列化再替换再解析"的方式确保了嵌套在 `instruction`、`template`、`outputPath`、`changeName` 等深层字段中的占位符都能被正确替换。
- 替换后再 `JSON.parse` 回对象。

**阶段 4 - 依赖检查**（仅 `design` 和 `specs`）：
- 对于 `design` 类型：检查 `furina/changes/<name>/proposal.md` 是否存在，将结果写入 `result.dependencies[0].done`。
- 对于 `specs` 类型：除了检查 `proposal.md`（`deps[0].done`）外，还检查 `furina/changes/<name>/design.md` 是否存在，将结果写入 `deps[1].done`。
- 注意：模板文件中 `dependencies` 数组的 `done` 字段有默认值（proposal 模板中为 `true`，design 模板中为 `true`，specs 模板中第一个为 `true`、第二个为 `false`），但运行时会被文件系统实际检查结果覆盖。

**阶段 5 - 输出**：
- 使用 `JSON.stringify(result, null, 2)` 格式化输出到 stdout，末尾追加换行符。
- 通过 `logger.info` 记录生成日志。

**Core Code**:
```typescript
export function runChangeInstruction(name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }): void {
  // Validate change name
  const validation = validateChangeName(name);
  if (!validation.valid) {
    logger.error(validation.error);
    process.exit(1);
  }

  // Check change directory exists
  const changeDir = path.join(CHANGES_DIR, name);
  if (!fs.existsSync(changeDir)) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  // Ensure exactly one flag is set
  const flags = [options.proposal, options.design, options.specs].filter(Boolean);
  if (flags.length !== 1) {
    logger.error('Exactly one of --proposal, --design, or --specs is required');
    process.exit(1);
  }

  // Determine artifact type from flag
  let artifactId: string;
  if (options.proposal) {
    artifactId = 'proposal';
  } else if (options.design) {
    artifactId = 'design';
  } else {
    artifactId = 'specs';
  }

  // Read the template file and replace [change-name] placeholders
  const templateRaw = JSON.stringify(readTemplateFile(artifactId));
  const filledRaw = templateRaw.replace(/\[change-name\]/g, name);
  const result = JSON.parse(filledRaw);
  if (artifactId === 'design' || artifactId === 'specs') {
    const deps: Array<Record<string, unknown>> = result.dependencies as Array<Record<string, unknown>> || [];
    if (deps.length > 0) {
      const proposalPath = path.join(process.cwd(), 'furina', 'changes', name, 'proposal.md');
      deps[0].done = fs.existsSync(proposalPath);
    }
    if (artifactId === 'specs' && deps.length > 1) {
      const designPath = path.join(process.cwd(), 'furina', 'changes', name, 'design.md');
      deps[1].done = fs.existsSync(designPath);
    }
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  logger.info(`Generated ${artifactId} instruction for '${name}'`);
}
```
Source: `src/commands/change/instruction.ts`:37-87

**Usage Example**:
```typescript
import { runChangeInstruction } from './instruction.js';

// 生成 proposal 指令（无依赖检查）
runChangeInstruction('add-user-auth', { proposal: true });

// 生成 design 指令（检查 proposal.md 是否存在）
runChangeInstruction('add-user-auth', { design: true });

// 生成 specs 指令（检查 proposal.md 和 design.md 是否存在）
runChangeInstruction('add-user-auth', { specs: true });
```
Explanation: 三种调用分别对应三种制品类型的指令生成。每次调用都会输出完整的 JSON 指令到 stdout。对于 design 和 specs，输出中的 `dependencies[].done` 字段反映了实际的依赖文件是否存在。

---

## Data Structures

### Template JSON 结构

所有三种模板文件（`proposal-template.json`、`design-template.json`、`specs-template.json`）共享相同的顶层结构：

```typescript
interface ArtifactTemplate {
  changeName: string;       // "[change-name]" 占位符，运行时替换为实际 change 名
  artifactId: string;       // 制品标识: 'proposal' | 'design' | 'specs'
  outputPath: string;       // 制品输出路径，含 "[change-name]" 占位符
                            // proposal: "furina/changes/[change-name]/proposal.md"
                            // design:   "furina/changes/[change-name]/design.md"
                            // specs:    "furina/changes/[change-name]/specs/**/*.md"
  description: string;      // 制品的简要描述
  instruction: string;      // 详细的生成指令文本，指导工作流代理如何创建该制品
  template: string;         // 制品文件的 Markdown 模板骨架
  dependencies: Dependency[]; // 前置依赖制品列表
}
```

### `Dependency`

```typescript
interface Dependency {
  id: string;          // 依赖的制品标识: 'proposal' | 'design'
  done: boolean;       // 依赖是否已完成（运行时根据文件存在性设置）
  path: string;        // 依赖文件的相对路径
  description: string; // 依赖制品的简要描述
}
```

**各模板的依赖关系**：

| 模板 | dependencies | 说明 |
|------|-------------|------|
| `proposal-template.json` | `[]` (空数组) | 无前置依赖 |
| `design-template.json` | `[{ id: 'proposal', done: true, ... }]` | 依赖 proposal.md |
| `specs-template.json` | `[{ id: 'proposal', done: true, ... }, { id: 'design', done: false, ... }]` | 依赖 proposal.md 和 design.md |

### 输出 JSON 结构

命令输出的 JSON 是模板对象经过占位符替换和依赖状态更新后的完整对象。以 `design` 为例：

```json
{
  "changeName": "add-user-auth",
  "artifactId": "design",
  "outputPath": "furina/changes/add-user-auth/design.md",
  "description": "Technical design document with implementation details",
  "instruction": "Create the design document that explains HOW to implement the change...",
  "template": "## Context\n\n<!-- Background and current state -->\n...",
  "dependencies": [
    {
      "id": "proposal",
      "done": true,
      "path": "proposal.md",
      "description": "Initial proposal document outlining the change"
    }
  ]
}
```

其中 `dependencies[0].done` 的值取决于 `furina/changes/add-user-auth/proposal.md` 文件是否实际存在于当前工作目录下。

## Error Handling and Edge Cases

**输入校验错误（process.exit(1)）**：
- change 名称不符合 kebab-case 格式：通过 `logger.error` 输出错误信息 `"Change name must be kebab-case (e.g., my-change)"`，然后 `process.exit(1)`。
- change 目录不存在：通过 `process.stderr.write` 输出 `"Change '<name>' not found\n"`，然后 `process.exit(1)`。注意此处使用 `process.stderr.write` 而非 `logger.error`，与其他错误处理方式不一致。
- 未指定或指定了多个 flag：通过 `logger.error` 输出 `"Exactly one of --proposal, --design, or --specs is required"`，然后 `process.exit(1)`。

**未捕获异常**：
- 模板文件不存在（`ENOENT`）：`readTemplateFile` 中的 `fs.readFileSync` 会抛出异常，进程因未捕获异常崩溃。这属于运行时环境异常（模板文件应始终随项目分发）。
- JSON 解析失败（`SyntaxError`）：模板文件内容非法时，`JSON.parse` 抛出异常。

**依赖检查的边界情况**：
- `design` 模板的 `dependencies` 数组为空：`deps.length > 0` 条件不满足，不会进行依赖检查，直接输出原始 `done` 值。
- `specs` 模板的 `dependencies` 数组只有 1 个元素：仅检查 `deps[0].done`（proposal），不会尝试检查 `deps[1].done`（design）。
- 依赖文件路径基于 `process.cwd()`：依赖检查路径为 `<cwd>/furina/changes/<name>/proposal.md`，与 `CHANGES_DIR`（`<cwd>/furina/changes`）的定义一致。如果 CLI 在非项目根目录执行，`CHANGES_DIR` 和依赖检查路径都会指向错误位置。

## Dependencies

- **Depends on**:
  - `spec-change-shared.md`：提供 `validateChangeName()` 函数（kebab-case 校验）和 `CHANGES_DIR` 常量（change 目录的绝对路径）。
  - `../../utils/logger.js`（`spec-logger`）：提供 `logger` 实例，用于记录 `info` 和 `error` 级别日志。
  - Node.js 内置模块：`fs`（文件读取和存在性检查）、`path`（路径拼接）、`url`（`fileURLToPath` 用于 ESM 模块路径解析）。
  - 项目 `resources/` 目录下的 JSON 模板文件：`proposal-template.json`、`design-template.json`、`specs-template.json`。

- **Depended by**:
  - `spec-change-barrel.md`（`src/commands/change/index.ts`）：通过 `registerChangeCommand` 注册 `instruction` 子命令，将 Commander 解析的参数传递给 `runChangeInstruction`。
  - 工作流代理（外部调用方）：通过 CLI 命令 `furina change instruction <name> --proposal|--design|--specs` 调用，读取 stdout 输出的 JSON 指令。

## Usage Examples

### 场景 1：生成 proposal 指令

```bash
furina change instruction add-user-auth --proposal
```

**输出**（stdout JSON）：
```json
{
  "changeName": "add-user-auth",
  "artifactId": "proposal",
  "outputPath": "furina/changes/add-user-auth/proposal.md",
  "description": "Initial proposal document outlining the change",
  "instruction": "Create the proposal document that establishes WHY this change is needed...",
  "template": "## Why\n\n<!-- Explain the motivation... -->\n...",
  "dependencies": []
}
```

Explanation: proposal 是制品链的第一级，没有依赖项。`dependencies` 为空数组，工作流代理可以直接开始生成 proposal.md。

### 场景 2：生成 design 指令（依赖已满足）

```bash
# 假设 proposal.md 已存在
furina change instruction add-user-auth --design
```

**输出**：
```json
{
  "changeName": "add-user-auth",
  "artifactId": "design",
  "outputPath": "furina/changes/add-user-auth/design.md",
  "dependencies": [
    {
      "id": "proposal",
      "done": true,
      "path": "proposal.md",
      "description": "Initial proposal document outlining the change"
    }
  ],
  ...
}
```

Explanation: `dependencies[0].done` 为 `true`，表明 proposal.md 已存在，工作流代理可以继续生成 design.md。

### 场景 3：生成 design 指令（依赖未满足）

```bash
# 假设 proposal.md 不存在
furina change instruction add-user-auth --design
```

**输出**：
```json
{
  "dependencies": [
    {
      "id": "proposal",
      "done": false,
      ...
    }
  ],
  ...
}
```

Explanation: `dependencies[0].done` 为 `false`，表明 proposal.md 尚未创建。工作流代理应先生成 proposal，再回来生成 design。

### 场景 4：生成 specs 指令（检查两个依赖）

```bash
furina change instruction add-user-auth --specs
```

**输出**：
```json
{
  "changeName": "add-user-auth",
  "artifactId": "specs",
  "outputPath": "furina/changes/add-user-auth/specs/**/*.md",
  "dependencies": [
    {
      "id": "proposal",
      "done": true,
      "path": "proposal.md",
      "description": "Initial proposal document outlining the change"
    },
    {
      "id": "design",
      "done": false,
      "path": "design.md",
      "description": "Technical design document with implementation details"
    }
  ],
  ...
}
```

Explanation: specs 的依赖数组包含两项。`proposal.done` 为 `true`（已存在），`design.done` 为 `false`（尚未创建）。工作流代理应先确保 design.md 完成，再生成 specs 文件。

### 场景 5：错误输入

```bash
# 非法名称
furina change instruction My_Change --proposal
# stderr: "Change name must be kebab-case (e.g., my-change)"
# exit code: 1

# change 不存在
furina change instruction nonexistent --proposal
# stderr: "Change 'nonexistent' not found"
# exit code: 1

# 未指定 flag
furina change instruction add-user-auth
# stderr: "Exactly one of --proposal, --design, or --specs is required"
# exit code: 1

# 指定多个 flag
furina change instruction add-user-auth --proposal --design
# stderr: "Exactly one of --proposal, --design, or --specs is required"
# exit code: 1
```

Explanation: 所有输入校验失败都会导致进程以 exit code 1 退出，错误信息写入 stderr 或通过 logger 输出。
