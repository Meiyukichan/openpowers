# Skill: furina-finalize

> Source files:
> - `marketplace/skills/furina-finalize/SKILL.md` : 1-33
> - `marketplace/skills/furina-finalize/instructions/archive.md` : 1-93
> - `marketplace/skills/furina-finalize/instructions/integration.md` : 1-31
> - `marketplace/skills/furina-finalize/instructions/syncbase.md` : 1-88
> - `marketplace/skills/furina-finalize/references/integration-testing.md` : 1-233
> - `src/commands/change/archive.ts` : 1-149
> - `src/commands/change/status.ts` : 1-158
> - `src/commands/change/shared.ts` : 1-315
> - `src/commands/change/list.ts` : 1-57

## Overview

`furina-finalize` 是 Furina 开发工作流的终结技能，负责在完成所有功能开发后，对变更进行收尾处理。它在 Furina 工作流中位于最后一个阶段（Phase 6: Finalize），是整个 `Explore -> Propose -> Plan -> Review -> SDD -> Finalize` 流水线的终态。

**设计动机**: 开发完成不等于交付完成。在代码开发结束到正式归档之间，需要经过集成测试验证功能可用性、代码库文档同步保持知识库一致性、变更归档管理变更生命周期、以及 Git 提交推送保存工作成果。`furina-finalize` 将这四个收尾步骤编排为严格的顺序流水线，确保每次开发变更都经过完整的质量关卡。

**使用场景**:
- 工作流命令 `workflow.md` 在 Phase 5（SDD）所有功能完成后自动进入 Finalize 阶段
- SDD 技能在所有 feature 完成后调用 `furina-finalize` 结束开发流程
- 用户也可以独立调用此技能对已完成的变更进行收尾

**涉及源文件及职责**:

| 源文件 | 职责 |
|--------|------|
| `SKILL.md` | 技能入口，定义输入参数和四步顺序执行流程 |
| `instructions/integration.md` | 集成测试指令，编排集成测试子代理的调度和失败重修流程 |
| `instructions/syncbase.md` | 代码库同步指令，读取暂存文件变更并按模块分组调用 furina-codebase 同步 |
| `instructions/archive.md` | 变更归档指令（独立子指令），验证完成度后将变更目录移入归档目录 |
| `references/integration-testing.md` | 集成测试参考模板，定义完整的集成测试工程师角色、验证流程和修复策略 |
| `src/commands/change/archive.ts` | 归档命令的 TypeScript 实现，执行目录移动和 changes.json 更新 |
| `src/commands/change/status.ts` | 状态命令实现，计算制品流水线状态 |
| `src/commands/change/shared.ts` | change 命令的共享工具：路径常量、changes.json 同步、制品构建 |
| `src/commands/change/list.ts` | 列表命令实现，展示所有活跃变更 |

## Architecture / Flow

### 四步顺序执行流水线

`furina-finalize` 的核心设计是一个严格顺序的四步流水线，每一步必须完全执行完毕后才能进入下一步：

```
Step 1: Integration Testing
   |
   v  (完成)
Step 2: Codebase Sync
   |
   v  (完成)
Step 3: Archive Change (furina change archive <name>)
   |
   v  (完成)
Step 4: Git Commit & Push (furina-commit skill)
   |
   v
Done
```

**RED LAW（渐进式文档读取）**: 每个步骤的指令文档仅在即将执行该步骤时才被读取，避免提前加载不需要的上下文。

### 集成测试子流程

Step 1 的集成测试本身是一个包含重试循环的复杂子流程：

```
Dispatch integration testing subagent
   |
   v
Run test suite -> Environment check -> Define checklist -> Execute verification
   |
   v
All pass? --Yes--> Integration complete
   |No
   v
Diagnose root cause -> Fix (dispatch implementer subagent) -> Re-verify
   |
   v
Loop until pass (max 3 rounds per feature)
```

### 代码库同步子流程

Step 2 的代码库同步按文件路径分组后串行调用：

```
git diff --staged --name-only
   |
   v
Group by module path (2nd-level dir, or 3rd-level if <=2 files)
   |
   v
For each group (serial):
   Dispatch sync codebase subagent with furina-codebase synchronize
   |
   v
All groups done -> Proceed to archive
```

## Functionality / Interface Details

### `SKILL.md` — 技能入口与四步编排

**Source**: `marketplace/skills/furina-finalize/SKILL.md`:1-33

**Functionality**: 作为 `furina-finalize` 技能的入口文档，定义了输入参数和四步顺序执行流程。它不包含具体业务逻辑，而是作为编排器，按顺序调用四个子指令/命令。该文档同时定义了 RED LAW 约束——禁止提前读取尚未执行的指令文档。

**Parameters**:
- `Change Directory (change)` (`string`, required): 变更目录路径，格式为 `furina/changes/<name>/`。如果缺失，必须通过 `AskUserQuestion` 工具向用户询问。

**Core Logic**:
1. 验证必填参数 `change` 是否存在，缺失则提示用户输入
2. 按严格顺序执行四个步骤，每步必须完全完成后才进入下一步
3. Step 1 调用 `instructions/integration.md` 指令并等待完成
4. Step 2 调用 `instructions/syncbase.md` 指令并等待完成
5. Step 3 执行 bash 命令 `furina change archive <change-name>`
6. Step 4 调用 `furina-commit` 技能提交变更

**Core Code**:
```markdown
## Execute Instructions

You **MUST** strictly and accurately execute the following instruction document step by step:

1. execute `Integration Testing Instruction`, and wait util this instruction executes completely.
2. execute `Codebase Sync Instruction` after the `Integration Testing Instruction`.
3. execute bash command to archive Furina change: `furina change archive <change-name>`.
4. call skill: furina-commit to commit changes to remote branch.

### Instruction Documents

- `Integration Testing Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-finalize/instructions/integration.md`
- `Codebase Sync Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-finalize/instructions/syncbase.md`

## RED LAW

- Progressive Document Reading: ONLY ALLOW reading the instruction document WHEN you are about to execute that instruction.
```
Source: `marketplace/skills/furina-finalize/SKILL.md`:18-33

**Usage Example**:
```markdown
# 由工作流命令在 SDD 完成后调用
Invoke Skill: furina-finalize
  - Change directory: `furina/changes/my-feature/`
```
Explanation: 工作流命令在 Phase 5 所有功能完成后，自动调用 finalize 技能进行收尾。传入变更目录路径作为唯一必填参数。

---

### `instructions/integration.md` — 集成测试指令

**Source**: `marketplace/skills/furina-finalize/instructions/integration.md`:1-31

**Functionality**: 定义如何调度集成测试子代理来验证项目的全部功能可用性。该指令的核心是通过 Agent 工具派遣一个 general-purpose 子代理，该子代理会读取 `references/integration-testing.md` 中的完整测试模板并执行。如果集成测试失败，指令定义了失败重修机制——派遣 implementer 子代理修复后重新测试。

**Parameters**:
- 无显式参数，使用当前上下文中的变更名称

**Core Logic**:
1. 通过 Agent 工具派遣集成测试子代理，使用标准化的 prompt 模板
2. prompt 中包含变更目录路径、当前项目路径
3. 子代理读取 `references/integration-testing.md` 并严格按模板执行
4. 如果子代理最终报告失败，则派遣 implementer 子代理（通过 `code-implementer-prompt.md`）修复问题
5. 修复完成后重新派遣集成测试子代理验证

**Core Code**:
```markdown
You **MUST** dispatch the `integration testing subagent` strictly in the following parameter format:

```
Agent tool (general-purpose):
  description: "Furina:integration:Purpose Execute integration testing: {change name}"
  prompt: |
    You are executing integration testing for {`furina/changes/<name>`}

    ## Furina Change
    {`furina/changes/<name>`}

    ## Current Project Path
    {current project path}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Read the integration testing template document.
    2. Strictly follow the template's steps and requirements to execute the integration testing task.
```

**IMPORTANT NOTE**:
- If `integration testing subagent` finally gives failure conclusion, you MUST use `code-implementer-prompt.md` to dispatch the `implementer subagent` to fix these failures.
- After `implementer subagent` fixed `integration testing failure`, you should dispatch the `integration testing subagent` again.
```
Source: `marketplace/skills/furina-finalize/instructions/integration.md`:8-31

**Usage Example**:
```markdown
# finalize 技能在 Step 1 中调用此指令
# 子代理描述中 "Furina:integration:Purpose" 是关键标识标记
Agent tool (general-purpose):
  description: "Furina:integration:Purpose Execute integration testing: my-feature"
  prompt: |
    You are executing integration testing for furina/changes/my-feature
    ...
```
Explanation: finalize 技能在第一步通过 Agent 工具派遣集成测试子代理。`Furina:integration:Purpose` 描述标记用于 hooks 系统识别和管理子代理生命周期。

---

### `references/integration-testing.md` — 集成测试参考模板

**Source**: `marketplace/skills/furina-finalize/references/integration-testing.md`:1-233

**Functionality**: 定义集成测试工程师角色的完整工作流程和行为准则。该模板面向集成测试子代理，规定了从项目测试套件运行到最终报告输出的完整验证流程。它不包含具体项目的测试用例，而是定义了通用的验证框架——如何检测和运行测试、如何检查环境就绪状态、如何定义功能验证清单、如何诊断和修复问题、以及如何输出最终报告。

**核心原则** (8条):
1. **全功能验证** — 验证项目承诺的每个功能，不遗漏
2. **外部行为断言** — 只关注用户/调用者可感知的结果，不依赖内部实现细节
3. **根因优先** — 不绕过问题，深度定位真实原因后再修复
4. **可逆修复** — 所有修复通过版本控制管理，确保可撤销可审查
5. **闭环验证** — 测试 -> 发现问题 -> 定位根因 -> 修复 -> 回归 -> 全量重验证
6. **最小变更** — 修复精确克制，只改必要内容
7. **测试用例先行** — 所有测试用例必须先通过自检
8. **基线测试绿** — 项目现有测试套件必须全部通过作为基线

**Workflow (6步)**:
1. **运行项目测试套件并修复**: 检测测试命令 (`package.json`, `pyproject.toml`, `Makefile` 等)，运行全量测试套件，将每个失败视为 P0 修复，直到全部通过
2. **环境就绪检查**: 确认应用进程运行状态、端口监听、数据库连接、缓存服务、消息队列、外部依赖健康检查
3. **定义全功能验证清单**: 从 `furina/changes/<name>` 收集功能信息，包含功能名称、优先级（P0/P1/P2）、验收标准、验证方法
4. **执行全量验证**: 按优先级顺序（P0 -> P1 -> P2）逐项验证，任何 P0 失败即暂停 P1/P2
5. **问题诊断与修复**: 包含诊断流程（复现 -> 收集证据 -> 定位根因 -> 确定修复范围）和修复范围（配置层/数据层/依赖层/代码层），每个功能最多 3 轮修复
6. **回归与全量重验证**: 修复后重验原失败项及其直接关联功能，所有失败修复后执行完整重验证

**验证方法参考**:
- 后端 API: `curl`/`httpie` 验证状态码和响应体
- 前端应用: Playwright 访问页面，检查元素渲染和交互，自动检测 Network API 错误和 Console 错误日志
- 桌面应用: Playwright (Electron) 或 WinAppDriver/XCUITest
- 移动应用: Appium/XCUITest/Espresso
- CLI 工具: 直接执行命令，检查退出码、stdout、stderr
- gRPC/RPC/SSE: `grpcurl`/`ghz`/`curl`
- WebSocket: `wscat` 或脚本
- 消息队列/事件流: `kafka-console-*`/`rabbitadmin`

**最终报告模板**: 包含环境信息、验证结果概览（总计/通过/失败/需人工干预，按 P0/P1/P2 分类）、自修复记录、人工干预记录、结论。

---

### `instructions/syncbase.md` — 代码库同步指令

**Source**: `marketplace/skills/furina-finalize/instructions/syncbase.md`:1-88

**Functionality**: 定义如何读取暂存文件变更、按模块路径分组、并串行调用 `furina-codebase` 技能的 synchronize 指令来同步代码库文档。该指令是 finalize 流水线的第二步，确保代码库文档（spec 文档、toc.md 索引）与实际源码变更保持一致。

**Configuration**: 通过 `furina config show` 获取三个配置项:
- `project.sourcecode` (`string`): 项目的主源码目录
- `project.codebase.enable` (`boolean`): 是否启用代码库同步
- `project.codebase.path` (`string`): 项目代码库路径

**Core Logic (三阶段)**:

**Stage 1 — 获取变更文件列表**: 运行 `git diff --staged --name-only` 获取暂存文件列表。如果为空，输出提示并结束。

**Stage 2 — 路径分组**: 如果 `project.codebases.enable != true`，直接结束。对所有以主源码目录开头的文件按以下规则分组:
1. 提取二级目录（`src/xxx/...` -> `xxx`）
2. 如果某二级目录下文件数 <=2 且存在三级目录，进一步按三级目录细分
3. 不在主源码目录下的文件不参与分组，但记录在变更摘要中

**Stage 3 — 串行调用 furina-codebase 同步**: 对 Stage 2 中的每个分组，**串行**派遣同步子代理。使用 Agent 工具的标准模板，描述标记为 `Furina:finalize:Purpose`。每个子代理调用 `furina-codebase` 技能的 `synchronize` 指令，传入 `codebaseDir`、`instruction: synchronize`、修改文件路径和变更描述。

**Core Code**:
```markdown
### Stage 3: Call furina-codebase to Sync Codebase

For each group from Stage 2, **serially invoke** the sync codebase subagent using the Task tool:

```
Agent tool (general-purpose):
  description: "Furina:finalize:Purpose Sync [group brief description] codebase"
  prompt: |
    You are syncing the codebase for [group brief description]

    ## Current Project Directory
    {cwd}

    ## Work steps
    1. Call Skill: furina-codebase with the following arguments:
       - `codebaseDir`: {`project.codebase.path`}
       - `instruction`: synchronize
       - `Modified file paths`: [all file paths in this group, comma separated]
       - `Change description`: [group brief description]
    2. Ignore the skill's return value, whether success or failure
```

**Must execute serially**: wait for one group's invocation to complete before invoking the next group, parallel invocation is forbidden.
```
Source: `marketplace/skills/furina-finalize/instructions/syncbase.md`:56-80

**Usage Example**:
```bash
# 获取暂存文件列表
git diff --staged --name-only
# 输出:
# src/electron/main/ipc/handler.ts
# src/electron/main/ipc/registry.ts
# src/renderer/components/App.vue
# docs/design/PROPOSAL.md

# 分组结果:
# Group 1 (src/electron/main/ipc): handler.ts, registry.ts  -> 串行调用 sync subagent
# Group 2 (src/renderer/components): App.vue                 -> 串行调用 sync subagent
# Other: docs/design/PROPOSAL.md                             -> 不参与分组，但包含在 commit 中
```
Explanation: 对暂存文件按模块路径分组后，依次串行调用 furina-codebase 的 synchronize 指令同步每个分组的代码库文档。

---

### `instructions/archive.md` — 变更归档指令

**Source**: `marketplace/skills/furina-finalize/instructions/archive.md`:1-93

**Functionality**: 定义归档已完成变更的完整流程。该指令是一个独立的子指令（也可被独立调用），负责验证变更的制品完成度和任务完成度，然后将变更目录移入归档目录并显示摘要。**注意**: 在 finalize 流水线中，Step 3 直接调用 `furina change archive <change-name>` CLI 命令，而非此指令文档。此指令文档定义的是由 AI agent 执行的更详细的归档流程（包含交互式确认），适用于独立调用场景。

**Parameters**:
- `Change name` (`string`, optional): 变更名称。如果未提供，必须通过 `furina change list` 获取列表并通过 `AskUserQuestion` 让用户选择。

**Core Logic (5步)**:

1. **变更选择**: 如果未提供变更名称，运行 `furina change list` 获取活跃变更列表，通过 `AskUserQuestion` 让用户选择。绝不自动猜测或选择。
2. **制品完成度检查**: 运行 `furina change status <name>` 获取 JSON，解析 `artifacts` 数组。如果有制品未完成，显示警告并确认是否继续。
3. **任务完成度检查**: 读取 `plan.json` 统计 `status != done` 的任务数。如有未完成任务，显示警告并确认。
4. **执行归档**: 创建 `furina/archive` 目录（如不存在），生成目标名 `YYYY-MM-DD-<change-name>`，检查是否已存在，然后 `mv` 变更目录到归档目录。
5. **显示摘要**: 输出变更名、使用的 schema、归档位置、警告说明。

**Guardrails**:
- 未提供变更名时始终提示选择
- 使用 `furina change status` 做完成度检查
- 警告不阻塞归档，只通知并确认
- 显示清晰的操作摘要

---

### `runChangeArchive(name: string): void` — CLI 归档命令实现

**Source**: `src/commands/change/archive.ts`:29-149

**Functionality**: 归档命令的 TypeScript 实现。验证变更存在性、活跃状态和制品完成度后，将变更目录从 `furina/changes/` 移动到 `furina/archive/YYYY-MM-DD-<name>/`，并同步更新 `changes.json` 和全局 memory 中的状态。在 finalize 流水线的 Step 3 中通过 `furina change archive <name>` 命令调用。

**Parameters**:
- `name` (`string`): 变更名称，遵循 kebab-case 命名规范

**Return Value**: 无返回值（void）。操作结果输出到 stdout/stderr，错误时以 exit code 1 退出。

**Core Logic**:
1. 调用 `syncChangesJson()` 同步 changes.json，获取最新状态
2. 检查变更是否已在归档中（`data.archive`），已归档则报错退出
3. 检查变更是否在活跃列表中（`data.changes`），不存在则报错退出
4. 调用 `computeArtifactStatus(changeDirPath)` 计算制品状态
5. 过滤 `status !== 'done'` 的制品，如有未完成制品则报错退出（列出未完成制品 ID）
6. 生成归档目标路径 `furina/archive/YYYY-MM-DD-<name>/`
7. 使用 `fs.renameSync` 原子移动目录
8. 更新 `changes.json`：从 changes 数组移除，添加到 archive 数组（包含 closedAt 时间戳）
9. 同步全局 memory 中的 `changes.json`，将变更状态更新为 `archived`，并更新 `stage.finalize.archive.status = 'done'`

**Core Code**:
```typescript
export function runChangeArchive(name: string): void {
  const data = syncChangesJson();

  const archivedEntry = data.archive.find((a) => a.name === name);
  if (archivedEntry) {
    process.stderr.write(`Change '${name}' is already archived\n`);
    process.exit(1);
  }

  const changeEntry = data.changes.find((c) => c.name === name);
  if (!changeEntry) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  const changeDirPath = path.resolve(process.cwd(), String(changeEntry.path));
  const artifacts = computeArtifactStatus(changeDirPath);

  const notDoneArtifacts = artifacts
    .filter((a) => a.status !== 'done')
    .map((a) => a.id);

  if (notDoneArtifacts.length > 0) {
    process.stderr.write(`Change '${name}' not all artifacts are done\n`);
    process.stderr.write(`Artifacts not done: ${notDoneArtifacts.join(', ')}\n`);
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const targetDirName = `${today}-${name}`;
  const targetDir = path.join(ARCHIVE_DIR, targetDirName);

  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  fs.renameSync(changeDirPath, targetDir);
  logger.info(`Archived '${name}' to ${path.relative(process.cwd(), targetDir)}`);
  // ... 更新 changes.json 和 global memory ...
}
```
Source: `src/commands/change/archive.ts`:29-102

**Usage Example**:
```bash
# finalize 流水线 Step 3 中调用
furina change archive my-feature

# 输出:
# Change 'my-feature' archived successfully to furina/archive/2026-07-05-my-feature/
```
Explanation: 在 finalize 流水线的第三步，执行 `furina change archive <change-name>` 将变更从活跃目录移动到归档目录。命令会验证所有制品（proposal、design、specs、plan）状态为 done，否则拒绝归档。

---

### `computeArtifactStatus(changeDirPath: string): Array<{ id: string; outputPath: string; status: string }>` — 制品状态计算

**Source**: `src/commands/change/status.ts`:43-110

**Functionality**: 计算变更目录中所有制品的流水线状态。核心制品（proposal、design、specs）遵循顺序流水线逻辑——前一个未完成则后续为 blocked/ready。非核心制品（api、database）存在即为 done。plan 制品的状态取决于 plan.json 中所有 feature 是否为 done。

**Parameters**:
- `changeDirPath` (`string`): 变更目录的绝对路径

**Return Value**:
- `Array<{ id: string; outputPath: string; status: string }>`: 每个制品的 ID、输出路径（相对于变更目录）和状态。状态值包括 `ready`、`blocked`、`done`、`in_progress`。

**Core Logic**:
1. 检查三个核心制品文件是否存在：`proposal.md`、`design.md`、`specs/**/*.md`
2. 按顺序流水线逻辑计算状态：
   - proposal.md 不存在 -> proposal: ready, design: blocked, specs: blocked
   - proposal.md 存在但 design.md 不存在 -> proposal: done, design: ready, specs: blocked
   - design.md 存在但 specs/ 无 .md 文件 -> proposal: done, design: done, specs: ready
   - 全部存在 -> 三者均为 done
3. 非核心制品（api、database）存在即状态为 done
4. plan 制品通过 `computePlanStatus()` 计算：plan.json 中所有 feature status 为 done 则 done，否则 in_progress

**Core Code**:
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

  // Sequential pipeline: proposal -> design -> specs
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
  // ... build results including non-core artifacts ...
}
```
Source: `src/commands/change/status.ts`:43-109

**Usage Example**:
```bash
furina change status my-feature
# 输出 JSON:
# {
#   "name": "my-feature",
#   "status": "active",
#   "isArtsComplete": true,
#   "artifacts": [
#     { "id": "proposal", "outputPath": "proposal.md", "status": "done" },
#     { "id": "design", "outputPath": "design.md", "status": "done" },
#     { "id": "specs", "outputPath": "specs/**/*.md", "status": "done" },
#     { "id": "plan", "outputPath": "plan.json", "status": "done" }
#   ]
# }
```
Explanation: `runChangeStatus` 调用 `computeArtifactStatus` 计算制品状态，archive 命令也调用此函数来验证是否所有制品都已完成。`isArtsComplete` 仅当三个核心制品（proposal、design、specs）全部 done 时为 true。

---

### `syncChangesJson(): ChangesJson` — 变更 JSON 同步

**Source**: `src/commands/change/shared.ts`:177-304

**Functionality**: 将 `furina/changes.json` 与文件系统状态同步。扫描 `furina/changes/` 获取活跃变更目录列表和 `furina/archive/` 获取归档变更目录列表，重新计算每个变更的 features/todo 进度，并写回 changes.json。此函数是所有 change 子命令（list、status、archive）的基础，确保数据一致性。

**Parameters**: 无

**Return Value**:
- `{ framework: string; version: string; changes: Array<Record<string, unknown>>; archive: Array<Record<string, unknown>> }`: 同步后的完整 changes.json 对象

**Core Logic**:
1. 调用 `loadOrCreateChangesJson()` 加载或创建默认 changes.json
2. 扫描 `furina/changes/` 目录获取所有活跃变更目录名
3. 为每个活跃变更构建条目：name、path、description、createdAt、features、todo、artifacts
4. 调用 `computeProgress(planPath)` 从 plan.json 计算 features/todo 计数
5. 保留已有的 description 和 createdAt 字段
6. 扫描 `furina/archive/` 目录获取所有归档变更目录名
7. 为每个归档变更构建条目，包含 closedAt 时间戳
8. 写回 changes.json

---

## Data Structures

### `ChangesJson` (changes.json)
```json
{
  "framework": "furina",
  "version": "x.y.z",
  "changes": [
    {
      "name": "my-feature",
      "path": "furina/changes/my-feature",
      "description": "Feature description",
      "createdAt": "2026-07-05T00:00:00.000Z",
      "features": 5,
      "todo": 2,
      "artifacts": [
        { "id": "proposal", "outputPath": "proposal.md" },
        { "id": "design", "outputPath": "design.md" },
        { "id": "specs", "outputPath": "specs/**/*.md" }
      ]
    }
  ],
  "archive": [
    {
      "name": "old-feature",
      "path": "furina/archive/2026-07-01-old-feature",
      "description": "Completed feature",
      "createdAt": "2026-06-28T00:00:00.000Z",
      "closedAt": "2026-07-01T00:00:00.000Z",
      "features": 3,
      "artifacts": []
    }
  ]
}
```
- `framework` (`string`): 框架名称，来自 package.json 的 name 字段
- `version` (`string`): 框架版本号，来自 package.json 的 version 字段
- `changes` (`Array`): 活跃变更列表
  - `name` (`string`): 变更名称（kebab-case）
  - `path` (`string`): 变更目录的相对路径
  - `description` (`string`): 变更描述
  - `createdAt` (`string`): ISO 8601 创建时间
  - `features` (`number`): 总功能数（从 plan.json 计算）
  - `todo` (`number`): 未完成功能数
  - `artifacts` (`Array<{ id: string; outputPath: string }>`): 存在的制品列表
- `archive` (`Array`): 归档变更列表
  - `closedAt` (`string`): ISO 8601 归档时间
  - 其余字段同 changes 条目

### `ArtifactStatus`
```typescript
{ id: string; outputPath: string; status: string }
```
- `id` (`string`): 制品标识符。核心制品: `proposal`, `design`, `specs`；非核心: `api`, `database`, `plan`
- `outputPath` (`string`): 制品输出路径（相对于变更目录）
- `status` (`string`): 制品状态
  - `ready`: 前置制品已完成，可以开始处理
  - `blocked`: 前置制品未完成，无法开始
  - `done`: 制品已完成
  - `in_progress`: 制品处理中（仅 plan 制品使用）

### `ARTIFACT_EXTENSIONS` (常量)
```typescript
{
  proposal: '.md',
  design: '.md',
  specs: '/**/*.md',
  api: '.yaml',
  database: '.md',
  plan: '.json',
}
```
定义每个制品 ID 对应的文件扩展名/路径模式。

### 集成测试优先级枚举

| Priority | Category | Typical Examples | Verification Strategy |
|----------|----------|-----------------|----------------------|
| P0 | Core Flow | Login, Payment, Data Writing | 暂停 P1/P2，优先修复 |
| P1 | Important Feature | Search, List, Filter | P0 全部通过后验证 |
| P2 | Auxiliary Feature | Export, Notifications, Settings | P0/P1 全部通过后验证 |

## Error Handling and Edge Cases

### 归档命令错误处理 (`runChangeArchive`)

1. **变更已归档**: 如果 `name` 已存在于 `data.archive`，输出 `Change '${name}' is already archived` 到 stderr，以 exit code 1 退出
2. **变更不存在**: 如果 `name` 不在 `data.changes` 中，输出 `Change '${name}' not found` 到 stderr，以 exit code 1 退出
3. **制品未完成**: 如果有任何制品 `status !== 'done'`，输出未完成制品 ID 列表到 stderr，以 exit code 1 退出
4. **全局 memory 同步失败**: 如果 global memory 的 changes.json 读取/解析失败，记录 warn/error 日志但不影响归档操作本身

### 集成测试错误处理

1. **基线测试失败**: 现有测试套件有失败被视为 P0 问题，必须先修复才能进行功能验证
2. **功能修复超限**: 同一功能超过 3 轮修复仍未通过，标记为"需人工干预"，继续验证剩余功能
3. **P0 失败阻塞**: 任何 P0 功能失败即暂停 P1/P2 验证，优先进入修复流程

### 代码库同步边界情况

1. **无暂存文件**: `git diff --staged --name-only` 为空时，输出"无变更文件，无需提交"并结束
2. **代码库同步未启用**: `project.codebases.enable != true` 时，直接结束同步指令
3. **非源码目录文件**: 不以主源码目录开头的文件不参与分组同步，但仍包含在后续 git commit 中

### RED LAW 约束

finalize 技能定义了渐进式文档读取规则：只在即将执行某个指令时才读取该指令的文档，禁止提前加载后续步骤的上下文。这确保了 AI agent 不会因为上下文过长而产生混淆。

## Dependencies

- **Depends on**:
  - `furina-codebase` (skill): syncbase 指令调用其 `synchronize` 指令来同步代码库文档
  - `furina-commit` (skill): finalize 流水线 Step 4 调用此技能执行 git 提交和推送
  - `furina change` CLI commands: `archive`, `status`, `list` 子命令
  - `code-implementer-prompt.md`: 集成测试失败时派遣 implementer 子代理修复
- **Depended by**:
  - `workflow.md` (workflow command): Phase 6 Finalize 调用 `furina-finalize` 技能
  - `furina-sdd` (skill): 所有 feature 完成后调用 `furina-finalize` 结束 SDD 流程

## Usage Examples

### 完整 finalize 流程示例

以下是 `furina-finalize` 技能的完整执行流程，展示从集成测试到最终提交的全过程:

```markdown
# 1. 调用 finalize 技能
Invoke Skill: furina-finalize
  - Change directory: furina/changes/my-feature/

# 2. Step 1: 集成测试
#    - 派遣集成测试子代理，子代理读取 integration-testing.md 模板
#    - 子代理运行项目测试套件 (e.g., npm test)
#    - 检查环境就绪状态
#    - 从 furina/changes/my-feature/ 收集功能信息定义验证清单
#    - 按 P0->P1->P2 顺序执行验证
#    - 如有失败，派遣 implementer 子代理修复后重新验证
#    - 输出最终测试报告

# 3. Step 2: 代码库同步
#    - 运行: git diff --staged --name-only
#    - 假设输出:
#      src/server/api/handler.ts
#      src/server/api/validator.ts
#      src/client/components/Dialog.vue
#      docs/README.md
#    - 分组:
#      Group 1 (src/server/api): handler.ts, validator.ts
#      Group 2 (src/client/components): Dialog.vue
#      Other: docs/README.md (不参与同步)
#    - 串行调用:
#      Agent 1: furina-codebase synchronize for src/server/api
#      Agent 2: furina-codebase synchronize for src/client/components

# 4. Step 3: 归档变更
#    - 执行: furina change archive my-feature
#    - 验证所有制品 (proposal, design, specs) 状态为 done
#    - 移动 furina/changes/my-feature/ -> furina/archive/2026-07-05-my-feature/
#    - 更新 changes.json

# 5. Step 4: Git 提交与推送
#    - 调用 furina-commit 技能
#    - git add .
#    - 生成 Conventional Commits 格式提交信息
#    - git commit
#    - git push origin main
```

### 独立调用归档指令示例

归档指令也可被独立调用，此时由 AI agent 执行更详细的交互流程:

```markdown
# 用户直接请求归档
User: "归档变更 my-feature"

# Agent 执行 archive.md 指令:
# 1. 运行 furina change list 确认变更存在
# 2. 运行 furina change status my-feature 检查制品完成度
# 3. 读取 plan.json 检查任务完成度
# 4. 如有未完成项，通过 AskUserQuestion 确认是否继续
# 5. 执行 mv 操作归档
# 6. 显示归档摘要
```

Explanation: 归档指令支持两种调用方式：作为 finalize 流水线的一部分直接执行 CLI 命令，或作为独立指令由 AI agent 执行包含交互确认的完整流程。独立调用时会额外检查任务完成度（plan.json），并允许用户在有未完成项时选择是否继续归档。
