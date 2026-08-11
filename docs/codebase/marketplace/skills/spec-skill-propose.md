# Skill: furina-propose

> Source files:
> - `marketplace/skills/furina-propose/SKILL.md` : 1-126
> - `src/commands/change/status.ts` : 1-159
> - `src/commands/change/instruction.ts` : 1-87
> - `src/commands/change/new.ts` : 1-91
> - `resources/proposal-template.json` : 1-8
> - `resources/design-template.json` : 1-15
> - `resources/specs-template.json` : 1-22

## Overview

`furina-propose` 是 Furina 开发工作流中的提案生成技能，负责 Phase 2（Propose 阶段）的核心执行。它的设计目标是**一次性生成变更所需的所有提案工件**（proposal.md、design.md、specs/**/*.md），避免用户手动逐步创建每个文件。

**角色与定位**：
- 在 6 阶段工作流中（Explore -> Propose -> Plan -> Review -> SDD -> Finalize），propose 技能紧接在 explore 之后执行
- 它是"文档驱动开发"理念的起点 -- 先产出提案和设计文档，再进入规划和实现
- 通过 CLI 命令（`furina change new/status/instruction`）与 Furina 变更管理系统深度集成
- 使用 MCP 标记工具（`markBeginPropose`/`markEndPropose`）与钩子系统配合，实现 propose 阶段的生命周期管理

**设计动机**：
- 统一的工件创建管道，确保 proposal -> design -> specs 之间的依赖关系被严格遵守
- 模板驱动的生成方式，保证所有变更的工件格式一致
- 通过 `isArtsComplete` 循环控制，防止遗漏任何工件

**涉及源文件及职责**：

| 源文件 | 职责 |
|--------|------|
| `marketplace/skills/furina-propose/SKILL.md` | 技能定义文件，包含完整的执行步骤、输入输出规范、护栏规则 |
| `src/commands/change/new.ts` | `furina change new` 命令实现，创建变更目录并注册到 changes.json |
| `src/commands/change/status.ts` | `furina change status` 命令实现，计算工件管道状态和 `isArtsComplete` |
| `src/commands/change/instruction.ts` | `furina change instruction` 命令实现，从模板生成工件创建指令 JSON |
| `resources/proposal-template.json` | proposal.md 工件模板（context/rules/instruction/template/dependencies） |
| `resources/design-template.json` | design.md 工件模板 |
| `resources/specs-template.json` | specs 工件模板（支持 ADDED/MODIFIED/REMOVED/RENAMED delta 操作） |

## Architecture / Flow

### 整体执行流

furina-propose 技能的执行是一个**串行管道**，核心循环如下：

```
用户输入 (change name + description)
    |
    v
[Step 1] 语言适配: furina config show language
    |
    v
[Step 2] 创建变更: furina change new <name> --desc <description>
    |
    v
[Step 3] 获取工件构建顺序: furina change status <name>
    |
    v
[Step 4] 工件创建循环:
    +----------------------------------------+
    |                                        |
    |   furina change status <name>      |
    |         |                              |
    |         v                              |
    |   遍历 artifacts 列表                  |
    |   找到 status === "ready" 的工件       |
    |         |                              |
    |         v                              |
    |   furina change instruction <name> |
    |   --<artifact-id>                      |
    |         |                              |
    |         v                              |
    |   解析 instruction JSON:               |
    |   - context (约束，不写入文件)          |
    |   - rules (约束，不写入文件)            |
    |   - template (输出文件结构)             |
    |   - instruction (生成指南)              |
    |   - outputPath (写入路径)               |
    |   - dependencies (已完成的依赖文件)     |
    |         |                              |
    |         v                              |
    |   读取依赖文件获取上下文                |
    |   按 template 结构创建工件文件          |
    |   写入 outputPath                       |
    |         |                              |
    |         v                              |
    |   isArtsComplete === true ?            |
    |     |           |                      |
    |    Yes         No -> 继续循环          |
    |     |                                  |
    +-----+----------------------------------+
          |
          v
[Step 5] 展示最终状态并输出摘要
```

### 工件依赖图（DAG）

```
proposal.md  (无依赖)
    |
    +---> design.md  (依赖: proposal.md)
              |
              +---> specs/**/*.md  (依赖: proposal.md, design.md)
```

工件的创建严格遵循此 DAG 顺序，由 `computeArtifactStatus` 函数在服务端保证 `ready`/`blocked` 状态的正确流转。

### 生命周期钩子集成

在 workflow 上下文中，propose 阶段的执行受 hooks 系统管理：

1. **Pre-Phase**：workflow 调用 `markBeginPropose` MCP 工具 -> 触发 `--before-propose` 钩子 -> 执行 `runBeforePropose` 初始化会话、切换到 propose 阶段
2. **During-Phase**：propose 技能执行工件创建循环
3. **Post-Phase**：workflow 调用 `markEndPropose` MCP 工具 -> 触发 `--after-agent` 钩子 -> 记录 propose 阶段完成

## Functionality / Interface Details

### `Step 1: Language Adaptation`

**Source**: `marketplace/skills/furina-propose/SKILL.md` : 18-24

**Functionality**: 查询插件配置中的输出语言设置，确保后续所有用户面向的输出和工件使用正确语言。这是 propose 技能的第一个执行步骤，语言设置影响工件描述的生成质量。

**核心逻辑**：
- 执行 `furina config show language` CLI 命令
- 命令内部调用 `queryConfig(config, 'language')` 从合并后的配置中读取 `language` 字段
- 如果命令无输出或失败，回退到中文（Chinese）

**相关实现** (`src/commands/config.ts` : 149-172):
```typescript
configCmd
  .command('show <keys...>')
  .description('Show specific configuration values by dot-path keys')
  .action((keys: string[]) => {
    const config = loadConfig();
    for (const key of keys) {
      let value: unknown;
      // ... special handling for 'codebases' key ...
      value = queryConfig(config, key);
      process.stdout.write(key + '=' + formatValue(value) + '\n');
    }
  });
```
Source: `src/commands/config.ts` : 146-173

**Usage Example**:
```bash
furina config show language
# 输出: language=zh-CN
```
Explanation: 查询当前项目的输出语言配置，后续工件生成将使用该语言。

---

### `Step 2: Create Change Directory`

**Source**: `marketplace/skills/furina-propose/SKILL.md` : 42-48

**Functionality**: 通过 `furina change new` 命令创建一个新的变更目录，并将其注册到 Furina 变更管理系统中。这一步是所有后续操作的前提 -- 工件的创建和状态查询都依赖于变更目录的存在。

**核心逻辑** (`src/commands/change/new.ts` : 25-91):
1. 验证变更名称格式（必须满足 kebab-case 正则 `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`）
2. 调用 `syncChangesJson()` 从文件系统同步 changes.json 数据
3. 检查是否已存在同名变更：
   - 若存在：更新描述和 `updateAt` 时间戳，写回 changes.json，同步到全局记忆
   - 若不存在：创建目录 `furina/changes/<name>/`，构建新条目（name, path, description, createdAt, features, todo, artifacts），追加到 changes.json，同步到全局记忆
4. 输出创建成功消息

**核心代码**:
```typescript
export function runChangeNew(name: string, options: { desc: string }): void {
  const validation = validateChangeName(name);
  if (!validation.valid) {
    process.stderr.write(`${validation.error}\n`);
    logger.error(validation.error);
    process.exit(1);
  }

  const data = syncChangesJson();
  const existing = data.changes.find((c) => c.name === name);
  if (existing) {
    existing.description = options.desc ?? name;
    existing.updateAt = new Date().toISOString();
    // Write back and sync
    // ...
    process.stdout.write(`Change '${name}' already exists, description updated\n`);
    return;
  }

  const changeDir = path.join(CHANGES_DIR, name);
  if (!fs.existsSync(changeDir)) {
    fs.mkdirSync(changeDir, { recursive: true });
  }

  const newEntry = {
    name,
    path: toRelativePath(changeDir),
    description: options.desc ?? name,
    createdAt: new Date().toISOString(),
    features: 0,
    todo: 0,
    artifacts: [],
  };
  data.changes.push(newEntry);
  // Write back to changes.json and sync to global memory
}
```
Source: `src/commands/change/new.ts` : 25-91

**Usage Example**:
```bash
furina change new add-user-auth --desc "Add user authentication system with JWT tokens and role-based access control"
# 输出: Change 'add-user-auth' created successfully
```
Explanation: 创建名为 `add-user-auth` 的变更目录，并附带描述。描述应为 15-30 词。

---

### `Step 3: Get Artifact Build Order`

**Source**: `marketplace/skills/furina-propose/SKILL.md` : 50-59

**Functionality**: 通过 `furina change status` 命令获取变更的工件管道状态，确定哪些工件是 `ready`（可创建）、`done`（已完成）或 `blocked`（被阻塞）。这是工件创建循环的驱动信号。

**核心逻辑** (`src/commands/change/status.ts` : 43-110):
`computeArtifactStatus` 函数实现了工件状态的串行管道逻辑：
1. 检查三个核心工件（proposal, design, specs）的文件是否存在
2. 按串行顺序确定状态：
   - proposal.md 不存在 -> proposal: ready, design: blocked, specs: blocked
   - proposal.md 存在但 design.md 不存在 -> proposal: done, design: ready, specs: blocked
   - proposal.md + design.md 存在但 specs/ 无 .md 文件 -> proposal: done, design: done, specs: ready
   - 三者都存在 -> 全部 done
3. 非核心工件（api, database, plan）仅在文件存在时出现
4. plan 工件的状态取决于所有 feature 是否全部 done

**核心代码**:
```typescript
export function computeArtifactStatus(changeDirPath: string): Array<{ id: string; outputPath: string; status: string }> {
  const proposalMdExists = fs.existsSync(path.join(changeDirPath, 'proposal.md'));
  const designMdExists = fs.existsSync(path.join(changeDirPath, 'design.md'));
  const specsDir = path.join(changeDirPath, 'specs');
  const specsExist = ((): boolean => {
    if (!fs.existsSync(specsDir)) return false;
    const scan = (dir: string): boolean => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries.some((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? scan(full) : e.name.endsWith('.md');
      });
    };
    return scan(specsDir);
  })();

  // Sequential pipeline logic
  let proposalStatus: string;
  let designStatus: string;
  let specsStatus: string;
  if (!proposalMdExists) {
    proposalStatus = 'ready'; designStatus = 'blocked'; specsStatus = 'blocked';
  } else if (!designMdExists) {
    proposalStatus = 'done'; designStatus = 'ready'; specsStatus = 'blocked';
  } else if (!specsExist) {
    proposalStatus = 'done'; designStatus = 'done'; specsStatus = 'ready';
  } else {
    proposalStatus = 'done'; designStatus = 'done'; specsStatus = 'done';
  }
  // ... build results array ...
}
```
Source: `src/commands/change/status.ts` : 43-110

**返回值格式**（JSON 输出）:
```json
{
  "name": "add-user-auth",
  "status": "active",
  "isArtsComplete": false,
  "artifacts": [
    { "id": "proposal", "outputPath": "proposal.md", "status": "ready" },
    { "id": "design", "outputPath": "design.md", "status": "blocked" },
    { "id": "specs", "outputPath": "specs/**/*.md", "status": "blocked" }
  ]
}
```

**Usage Example**:
```bash
furina change status add-user-auth
```
Explanation: 查询 `add-user-auth` 变更的工件状态，返回 JSON 格式的管道状态。`isArtsComplete` 为 `true` 时三个核心工件（proposal, design, specs）全部为 `done`。

---

### `Step 4a: Process Artifacts in Ready Status`

**Source**: `marketplace/skills/furina-propose/SKILL.md` : 61-81

**Functionality**: 对于每个处于 `ready` 状态的工件，通过 `furina change instruction` 命令获取该工件的完整创建指令（模板、约束、指南、输出路径、依赖），然后按照指令生成工件文件。这是 propose 技能的核心逻辑步骤。

**核心逻辑 -- 获取指令** (`src/commands/change/instruction.ts` : 37-87):
1. 验证变更名称和变更目录存在
2. 确定工件类型（proposal/design/specs）
3. 从 `resources/<artifactId>-template.json` 读取模板文件
4. 将模板中的 `[change-name]` 占位符替换为实际变更名
5. 对于 design 和 specs 工件，检查依赖文件的实际存在状态并更新 `done` 字段
6. 输出填充后的指令 JSON

**核心代码**:
```typescript
export function runChangeInstruction(name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }): void {
  const validation = validateChangeName(name);
  if (!validation.valid) { logger.error(validation.error); process.exit(1); }

  const changeDir = path.join(CHANGES_DIR, name);
  if (!fs.existsSync(changeDir)) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  // Determine artifact type from flag
  let artifactId: string;
  if (options.proposal) { artifactId = 'proposal'; }
  else if (options.design) { artifactId = 'design'; }
  else { artifactId = 'specs'; }

  // Read template and replace placeholders
  const templateRaw = JSON.stringify(readTemplateFile(artifactId));
  const filledRaw = templateRaw.replace(/\[change-name\]/g, name);
  const result = JSON.parse(filledRaw);

  // Check dependency file existence for design and specs
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
}
```
Source: `src/commands/change/instruction.ts` : 37-87

**指令 JSON 输出格式**（以 proposal 为例）:
```json
{
  "changeName": "add-user-auth",
  "artifactId": "proposal",
  "outputPath": "furina/changes/add-user-auth/proposal.md",
  "description": "Initial proposal document outlining the change",
  "instruction": "Create the proposal document that establishes WHY this change is needed...",
  "template": "## Why\n\n<!-- ... -->\n## What Changes\n\n<!-- ... -->",
  "dependencies": []
}
```

**Usage Example**:
```bash
furina change instruction add-user-auth --proposal
```
Explanation: 获取 `proposal` 工件的创建指令 JSON，包含模板结构和生成指南。AI 根据这些信息生成 proposal.md 文件。

---

### `Step 4b: Loop Until isArtsComplete`

**Source**: `marketplace/skills/furina-propose/SKILL.md` : 82-84

**Functionality**: 在创建完每个工件后，重新执行 `furina change status` 查询最新状态，直到 `isArtsComplete` 为 `true`。这个循环确保所有三个核心工件都被创建，不会因为中途错误而遗漏。

**核心逻辑**:
1. 创建一个 ready 工件后，立即调用 `furina change status <name>` 重新查询
2. 解析返回的 JSON，检查 `isArtsComplete` 字段
3. `isArtsComplete` 的计算逻辑（`src/commands/change/status.ts` : 144-148）：仅当三个核心工件（proposal, design, specs）全部 `done` 时才为 `true`
4. 如果 `isArtsComplete === false`，继续处理下一个 `ready` 工件
5. 如果 `isArtsComplete === true`，退出循环

**相关实现**:
```typescript
const isArtsComplete = CORE_ARTIFACTS.every((id) => {
  const artifact = artifacts.find((a) => a.id === id);
  return artifact && artifact.status === 'done';
});
```
Source: `src/commands/change/status.ts` : 144-148

**Usage Example**:
```json
// 循环过程中的状态变化:
// 第1次查询: { isArtsComplete: false, artifacts: [{id: "proposal", status: "ready"}, ...] }
// 创建 proposal.md 后...
// 第2次查询: { isArtsComplete: false, artifacts: [{id: "proposal", status: "done"}, {id: "design", status: "ready"}, ...] }
// 创建 design.md 后...
// 第3次查询: { isArtsComplete: false, artifacts: [..., {id: "specs", status: "ready"}] }
// 创建 specs/*.md 后...
// 第4次查询: { isArtsComplete: true, artifacts: [{id: "proposal", status: "done"}, ...] }
```
Explanation: 通过状态循环驱动工件的逐个创建，每步都重新查询以确认当前状态，保证管道的正确推进。

---

### `Step 4c: Handle User Input for Unclear Context`

**Source**: `marketplace/skills/furina-propose/SKILL.md` : 86-88

**Functionality**: 当工件创建过程中遇到上下文不清晰的情况时，通过 `AskUserQuestion` 工具向用户提问澄清，然后继续创建。这是一个容错机制，确保工件质量。

**核心逻辑**:
- 在生成工件内容时，如果发现 `instruction` 中的指导不足以确定具体实现细节
- 使用 `AskUserQuestion` 工具（开放式，无预设选项）向用户提问
- 获得用户回答后，将答案融入工件内容
- 继续后续工件的创建

---

### `Step 5: Show Final Status`

**Source**: `marketplace/skills/furina-propose/SKILL.md` : 90-101

**Functionality**: 所有工件创建完成后，展示最终状态并输出摘要信息，包括变更名称、位置、已创建的工件列表，以及引导用户进入下一阶段（furina-plan）的提示。

**输出内容**:
- 变更名称和位置
- 已创建工件的简要描述列表
- 提醒用户："All artifacts created! You can run skill `furina-plan` to generate schema docs and make work plan."

---

### `Guardrails`

**Source**: `marketplace/skills/furina-propose/SKILL.md` : 113-120

**Functionality**: 定义 propose 技能的护栏规则，确保工件创建的完整性和正确性。

**关键规则**:
1. 必须创建 `artifacts` 字段中列出的所有工件
2. 创建新工件前必须读取依赖工件文件获取上下文
3. 如果上下文极其不清晰，应向用户提问 -- 但优先做出合理判断以保持推进动量
4. 如果同名变更已存在，询问用户是继续还是创建新的
5. 每次写入工件文件后必须验证文件存在，再继续下一步

**Artifact Checklist**:
- [ ] `furina/changes/<name>/proposal.md`
- [ ] `furina/changes/<name>/design.md`
- [ ] `furina/changes/<name>/spec/**/*.md`

---

### `RunBeforePropose Hook Handler`

**Source**: `marketplace/scripts/furina_hooks.js` : 436-468

**Functionality**: 当 workflow 调用 `markBeginPropose` MCP 工具时，`hooks.json` 中注册的 `--before-propose` 钩子被触发，执行 `runBeforePropose` 函数。该函数初始化 agent 会话并切换到 propose 阶段。

**核心逻辑**:
1. 验证 `sessionId` 存在且 `cwd` 有效
2. 调用 `buildInitCommand(sessionId, cwd)` 构建 `furina agents init` 命令并执行
3. 调用 `buildBeforeProposeCommand(sessionId)` 构建 `furina agents switch propose --session <sessionId>` 命令并执行
4. 记录日志

**核心代码**:
```javascript
export function runBeforePropose(parsed) {
  if (!parsed.sessionId) { return; }
  // ... validation ...
  if (!fs.existsSync(parsed.cwd)) { return; }

  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- furina-purpose: propose`);

  // Initialize the agent session first
  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  const initResult = executeCommand(initCommand, parsed.cwd);

  // Then switch to propose stage
  const command = buildBeforeProposeCommand(parsed.sessionId);
  const result = executeCommand(command, parsed.cwd);
  // ... logging ...
}
```
Source: `marketplace/scripts/furina_hooks.js` : 439-468

**Usage Example**: 此函数不直接被用户调用，而是通过 hooks 系统自动触发：
```
用户执行 workflow Phase 2 -> 调用 markBeginPropose -> hooks.json 触发 --before-propose
-> runBeforePropose -> furina agents init + furina agents switch propose
```

---

### `handleChangeInstructionProposal Hook Handler`

**Source**: `marketplace/scripts/furina_hooks.js` : 597-624

**Functionality**: 当 propose 技能执行 `furina change instruction <name> --proposal` 命令时，`--before-bash` 钩子检测到命令模式并调用此处理器。它负责关闭 brainstorm 模式并将变更阶段切换到 propose。

**核心逻辑**:
1. 从 settings.json 中读取 brainstorm 标志
2. 将 brainstorm 设置为 false（写回 settings.json）
3. 调用 `furina change stage propose --session <sessionId> --status in_progress` 将变更阶段标记为 propose 进行中

**核心代码**:
```javascript
function handleChangeInstructionProposal(parsed) {
  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  // Disable brainstorm mode in settings.json
  try {
    const settingsPath = path.join(parsed.cwd, '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.brainstorm !== undefined) {
        settings.brainstorm = false;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    }
  } catch { /* Silent */ }

  // Call change stage propose
  const stageArgs = ['furina', 'change', 'stage', 'propose', '--session', parsed.sessionId, '--status', 'in_progress'];
  const result = executeCommand(stageArgs, parsed.cwd, { silent: true });
}
```
Source: `marketplace/scripts/furina_hooks.js` : 602-624

## Data Structures

### `Change Status Output` (JSON)
```json
{
  "name": "string",           // 变更名称（kebab-case）
  "status": "active | archived",  // 变更状态
  "isArtsComplete": boolean,  // 三个核心工件是否全部 done
  "artifacts": [
    {
      "id": "string",         // 工件 ID: proposal | design | specs
      "outputPath": "string", // 输出路径（相对于变更目录）
      "status": "string"      // ready | done | blocked | in_progress
    }
  ]
}
```
- `name`: 变更的 kebab-case 标识符
- `status`: 从 changes.json 的 changes 数组（active）或 archive 数组（archived）中确定
- `isArtsComplete`: 仅当 proposal + design + specs 三者状态全部为 `done` 时为 `true`
- `artifacts`: 核心工件始终包含，非核心工件（api, database, plan）仅在文件存在时包含

### `Artifact Instruction Output` (JSON)
```json
{
  "changeName": "string",     // 变更名称
  "artifactId": "string",     // proposal | design | specs
  "outputPath": "string",     // 完整输出路径（已替换占位符）
  "description": "string",    // 工件描述
  "instruction": "string",    // 生成指南（详细说明如何创建该工件）
  "template": "string",       // 输出文件的 Markdown 模板结构
  "dependencies": [           // 依赖工件列表
    {
      "id": "string",         // 依赖工件 ID
      "done": boolean,        // 依赖是否已完成（文件是否存在）
      "path": "string",       // 依赖文件相对路径
      "description": "string" // 依赖描述
    }
  ]
}
```
- `instruction`: 包含详细的内容要求（如 proposal 需要 Why/What Changes/Capabilities/Impact 等章节）
- `template`: Markdown 模板，定义了输出文件的骨架结构，AI 需要填充模板中的注释占位符
- `dependencies`: 对于 proposal 无依赖；design 依赖 proposal；specs 依赖 proposal 和 design

### `CORE_ARTIFACTS` (常量)
```typescript
const CORE_ARTIFACTS = ['proposal', 'design', 'specs'];
```
- 定义了工件管道的串行创建顺序
- `isArtsComplete` 的判定依据
- 三个核心工件始终出现在 status 输出中

### `ARTIFACT_EXTENSIONS` (常量)
```typescript
const ARTIFACT_EXTENSIONS: Record<string, string> = {
  proposal: '.md',
  design: '.md',
  specs: '/**/*.md',
  api: '.yaml',
  database: '.md',
  plan: '.json',
};
```
- 定义各工件类型的文件扩展名/模式
- specs 使用 glob 模式 `/**/*.md`，支持嵌套目录结构

### `KEBAB_CASE` (常量)
```typescript
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
```
- 变更名称的验证正则
- 要求以小写字母开头，后跟小写字母、数字和连字符
- 用于 `validateChangeName` 和 `extractChangeName` 函数

## Error Handling and Edge Cases

### 变更名称验证
- **kebab-case 格式**: 变更名称必须匹配 `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`，不合规的名称会导致 `process.exit(1)`
- **重复名称**: `furina change new` 检测到同名变更时不会失败，而是更新描述并返回 `"Change '<name>' already exists, description updated"`。propose 技能层面则使用 `AskUserQuestion` 询问用户是继续还是创建新的

### 变更目录不存在
- `furina change instruction` 和 `furina change status` 命令在变更目录不存在时会输出错误消息到 stderr 并以 exit code 1 退出
- SKILL.md 中的护栏规则要求"每次写入工件文件后必须验证文件存在"

### 模板文件读取失败
- `readTemplateFile` 使用 `fs.readFileSync` 读取模板文件，如果文件不存在会抛出未捕获异常
- 模板路径通过 `import.meta.url` 相对定位，确保在不同安装位置下都能正确解析

### 状态查询的竞态条件
- `syncChangesJson()` 在 status 查询前执行，从文件系统重新扫描变更目录以同步 changes.json
- 这确保了即使 changes.json 被手动修改或外部进程影响，status 查询仍能获得准确数据

### specs 目录递归扫描
- `computeArtifactStatus` 使用递归函数扫描 specs 目录中是否存在 .md 文件
- 只要 specs 目录下有任何 .md 文件（包括嵌套子目录中的），就认为 specs 工件为 done
- 空的 specs 目录（无 .md 文件）被视为未完成

### 工件创建中的用户交互
- 当上下文不清晰时，propose 技能使用 `AskUserQuestion` 工具向用户提问
- 在 workflow 上下文中，这会触发 `--before-question` 钩子，如果 brainstorm 模式启用则将问题记录到 question.json

## Dependencies

### Depends on

- **`furina change new` CLI 命令** (`src/commands/change/new.ts`): 创建变更目录和注册变更条目。依赖 `validateChangeName`、`syncChangesJson`、`toRelativePath`（来自 `shared.ts`）和 `createOrUpdateChange`（来自 `utils/memory.ts`）
- **`furina change status` CLI 命令** (`src/commands/change/status.ts`): 计算工件管道状态。依赖 `syncChangesJson`、`buildArtifacts`、`ARTIFACT_EXTENSIONS`（来自 `shared.ts`）
- **`furina change instruction` CLI 命令** (`src/commands/change/instruction.ts`): 从模板生成工件指令。依赖 `validateChangeName`、`CHANGES_DIR`（来自 `shared.ts`）和 `resources/*.json` 模板文件
- **`furina config show language` CLI 命令** (`src/commands/config.ts`): 查询输出语言配置。依赖 `loadConfig`、`queryConfig`（来自 `utils/config.ts`）
- **资源模板文件** (`resources/proposal-template.json`, `resources/design-template.json`, `resources/specs-template.json`): 定义工件的 instruction、template 和 dependencies
- **MCP 标记工具** (`src/server/mcp/index.ts`): `markBeginPropose` 和 `markEndPropose` 工具，在 workflow 上下文中标记 propose 阶段边界
- **钩子处理器** (`marketplace/scripts/furina_hooks.js`): `runBeforePropose`（会话初始化和阶段切换）和 `handleChangeInstructionProposal`（关闭 brainstorm 并标记 propose 阶段）
- **`shared.ts` 公共工具** (`src/commands/change/shared.ts`): `validateChangeName`、`syncChangesJson`、`buildArtifacts`、`toRelativePath`、`CHANGES_DIR`、`ARTIFACT_EXTENSIONS`、`KEBAB_CASE`

### Depended by

- **Workflow Phase 2** (`marketplace/commands/workflow.md`): workflow 命令在 Phase 2 中调用 furina-propose 技能创建所有提案工件。workflow 负责前后调用 `markBeginPropose`/`markEndPropose` MCP 工具，以及在 propose 前先执行 brainstorm
- **furina-plan 技能** (`marketplace/skills/furina-plan/SKILL.md`): Plan 技能依赖 propose 阶段产出的 proposal.md、design.md 和 specs/*.md 作为输入，生成补充技术规范文档和实施计划
- **furina-review 技能** (`marketplace/skills/furina-review/SKILL.md`): Review 技能的 Propose Review Instruction 评审 propose 阶段产出的工件质量
- **furina-sdd 技能** (`marketplace/skills/furina-sdd/SKILL.md`): SDD 技能间接受 propose 影响，因为工件质量决定了后续实施的规格明确性
- **hooks.json** (`marketplace/hooks/hooks.json`): 注册了 `markBeginPropose` -> `--before-propose` 和 `markEndPropose` -> `--after-agent` 的钩子映射
- **hooks `--before-bash` 处理器**: 检测 `furina change instruction` 命令中的 `--proposal` 标志并触发 `handleChangeInstructionProposal`

## Usage Examples

### 完整使用场景（独立使用 propose 技能）

```bash
# 1. 确保 Furina 已安装
furina --version

# 2. 查询输出语言
furina config show language
# 输出: language=zh-CN

# 3. 创建变更目录
furina change new add-user-auth --desc "添加基于JWT的用户认证系统，包含角色权限控制"
# 输出: Change 'add-user-auth' created successfully

# 4. 查询工件状态（此时应为 proposal: ready）
furina change status add-user-auth
# 输出:
# {
#   "name": "add-user-auth",
#   "status": "active",
#   "isArtsComplete": false,
#   "artifacts": [
#     { "id": "proposal", "outputPath": "proposal.md", "status": "ready" },
#     { "id": "design", "outputPath": "design.md", "status": "blocked" },
#     { "id": "specs", "outputPath": "specs/**/*.md", "status": "blocked" }
#   ]
# }

# 5. 获取 proposal 工件指令
furina change instruction add-user-auth --proposal
# 输出: JSON 包含 instruction/template/outputPath/dependencies
# AI 根据 instruction 和 template 生成 proposal.md，写入 outputPath

# 6. 创建 proposal.md 后再次查询状态（此时应为 design: ready）
furina change status add-user-auth
# 输出: isArtsComplete: false, design: ready

# 7. 获取 design 工件指令
furina change instruction add-user-auth --design
# 输出: JSON 包含 design 的指令，dependencies[0].done = true（proposal.md 已存在）
# AI 读取 proposal.md 作为上下文，根据指令生成 design.md

# 8. 创建 design.md 后再次查询状态（此时应为 specs: ready）
furina change status add-user-auth
# 输出: isArtsComplete: false, specs: ready

# 9. 获取 specs 工件指令
furina change instruction add-user-auth --specs
# 输出: JSON 包含 specs 的指令，dependencies[0].done = true, dependencies[1].done = true
# AI 读取 proposal.md 和 design.md 作为上下文，生成 specs/*.md 文件

# 10. 创建 specs 后查询最终状态
furina change status add-user-auth
# 输出: isArtsComplete: true, 全部 done
```

Explanation: 上述流程展示了 propose 技能的完整执行过程。AI agent 按照 SKILL.md 中的步骤自动执行，每步通过 CLI 命令与 Furina 系统交互。核心循环（步骤 4-9）由 `isArtsComplete` 驱动，确保所有三个核心工件都被正确创建。

### 在 Workflow 上下文中使用

```
1. workflow Phase 2 开始
2. 调用 markBeginPropose MCP 工具
   -> hooks 触发 --before-propose
   -> runBeforePropose 初始化会话，切换到 propose 阶段
3. 调用 furina-brainstorm 技能进行头脑风暴
4. AskUserQuestion: "是否有需要进一步澄清的细节？"
5. 用户选择 "Continue to create Furina artifacts"
6. 调用 furina-propose 技能
   -> 执行上述完整的工件创建循环
7. 调用 markEndPropose MCP 工具
   -> hooks 触发 --after-agent
   -> 记录 propose 阶段完成
8. workflow 自动进入 Phase 3 (Plan)
```

Explanation: 在 workflow 模式下，propose 技能被嵌入更大的工作流中。钩子系统负责会话生命周期管理（阶段切换、日志记录），propose 技能专注于工件创建本身。

### 产物结构示例

```
furina/changes/add-user-auth/
  proposal.md          # 提案文档：Why + What Changes + Capabilities + Impact
  design.md            # 设计文档：Context + Goals/Non-Goals + Decisions + Risks
  specs/
    user-authentication/
      spec.md          # 需求规格：ADDED Requirements + Scenarios (WHEN/THEN)
    role-based-access/
      spec.md          # 需求规格：ADDED Requirements + Scenarios (WHEN/THEN)
```

Explanation: proposal.md 回答"为什么做"和"做什么"，design.md 回答"怎么做"（技术决策和架构），specs/ 目录包含具体的功能需求规格（可测试的 WHEN/THEN 场景）。
