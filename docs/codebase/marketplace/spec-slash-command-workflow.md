# Workflow Slash Command

> Source files:
> - `marketplace/commands/workflow.md` : 1-322

## Overview

`spec-slash-command-workflow.md` 是 Furina 的顶层编排器规范，定义了 `/furina:workflow` 斜杠命令的完整技术规格。该命令是将用户初始想法（如 "I want to..." 或 "I have a requirement..."）转化为完整实现、测试通过的功能的唯一入口。

**系统中的定位：** Workflow 命令是 Furina 所有技能的顶层编排者。它本身不执行任何具体的编码、设计或测试工作，而是负责按正确顺序调度 6 个阶段的技能调用，管理阶段之间的检测、恢复和过渡逻辑，并协调用户交互。所有下游技能（explore、propose、plan、review、sdd、finalize）都由 workflow 命令驱动。

**设计动机：** 软件开发流程涉及多个相互依赖的阶段，每个阶段产出下一阶段所需的输入。手工调度容易遗漏步骤、跳过阶段或在错误的时刻恢复。Workflow 命令通过声明式的 6 阶段顺序、基于产物的阶段检测、RED LAW 约束和自动过渡机制，确保开发流程的完整性和一致性。

**使用场景：**
- 用户输入 `/furina:workflow <需求描述>` 启动新的完整开发工作流
- Claude Code session 重启后，workflow 命令检测已有变更目录并从中断的阶段恢复
- 用户通过 `FORCE_RESTART` 参数强制从阶段 1 重新开始（在已有变更的基础上重新设计）

**涉及源文件及各自职责：**

| 源文件 | 职责 |
|--------|------|
| `marketplace/commands/workflow.md` | Workflow 斜杠命令的完整定义：6 阶段流程、配置、阶段检测/恢复、模式选择、RED LAW、核心原则、红线警告 |
| `marketplace/hooks/hooks.json` | 注册 workflow 相关的 hooks：`UserPromptSubmit` 触发 `init-agent` 模式识别 `/furina:workflow` 前缀，`PreToolUse/PostToolUse` 管理 Agent 子代理生命周期 |
| `marketplace/scripts/furina_hooks.js` | Hooks 运行时实现：`runInitAgent` 解析 workflow prompt 并调用 `agents init`，`runBeforeAgent/runAfterAgent` 管理子代理 stage 切换 |
| `src/commands/change/new.ts` | `furina change new` 命令实现：验证 kebab-case 命名、创建变更目录、注册到 changes.json |
| `src/commands/change/shared.ts` | 变更命令共享工具：KEBAB_CASE 正则验证、变更名验证、changes.json 同步、产物检测 |
| `src/commands/config.ts` | `furina config` 命令实现：`mode` 子命令应用 Lite/Standard/Max 预设、`set` 子命令写入配置值、`show` 子命令查询配置 |
| `src/server/mcp/index.ts` | MCP 工具注册：`markBeginPropose` 和 `markEndPropose` 标记工具，用于标记 propose 阶段的开始和结束 |

## Architecture / Flow

### 6 阶段工作流总览

Workflow 命令定义了一个严格顺序的 6 阶段流程，每个阶段产出下一阶段所需的产物：

```
[用户输入 /furina:workflow <需求>]
  |
  v
[Workflow Configuration]
  - 检查 furina 是否已安装
  - 查询输出语言配置
  |
  v
[Phase Detection / Resume]
  - 检查已有变更目录 (furina change list / ls furina/changes/)
  - 根据产物映射表确定当前阶段
  - 或使用 FORCE_RESTART 强制从阶段 1 开始
  - 确定变更目录名称 (kebab-case)
  - 调用 furina change new <name> 激活变更
  |
  v
[Phase 1: Explore] -- 调用 furina-explore (exploreType: for-design)
  |                  -- 产出: explore-design/
  v
[Phase 2: Propose] -- 1. 调用 markBeginPropose MCP 工具
  |                  -- 2. 调用 furina-brainstorm 技能
  |                  -- 3. AskUserQuestion 确认继续
  |                  -- 4. 调用 furina-propose 技能
  |                  -- 5. AskUserQuestion 选择工作流模式 (Lite/Standard/Max)
  |                  -- 6. AskUserQuestion 选择 feature 计数因子
  |                  -- 7. 调用 markEndPropose MCP 工具
  |                  -- 产出: proposal.md, design.md, specs/**/*.md
  v
[Phase 3: Plan] -- 分发 Planning Phase Subagent
  |               -- 子代理调用 furina-plan 技能
  |               -- 产出: plan.json, api.yaml (可选), database.md (可选)
  v
[Phase 4: Review Furina Artifacts] -- 调用 furina-review 技能
  |                                      -- AskUserQuestion 确认是否进入 SDD
  v
[Phase 5: Subagent-Driven Development] -- 调用 furina-sdd 技能
  |                                      -- 逐 Feature 执行: 实现 -> TDD -> 审查
  v
[Phase 6: Finalize] -- 调用 furina-finalize 技能
  |                   -- 集成测试 + 代码库同步 + 归档
  v
[Workflow Ended]
```

### 阶段检测与恢复逻辑

Workflow 命令使用基于产物的阶段检测机制。通过检查 `furina/changes/<name>/` 目录中是否存在特定产物文件来确定当前所处阶段，而非依赖内存状态或进度计数器。这确保了即使 Claude Code session 中断，也能准确恢复到正确的阶段。

```
[启动 Workflow]
  |
  v
FORCE_RESTART? ---是---> 从 Phase 1 开始（但参考已有设计文档重新设计）
  |
  否
  |
  v
检查 furina/changes/ 目录
  |
  v
存在活跃变更? ---否---> 从 Phase 1 开始
  |
  是（有多个? --是-> AskUserQuestion 选择一个）
  |
  v
检查变更目录中的产物文件
  |
  +-- exploration.md 不存在 --------> Phase 1: Explore
  +-- exploration.md 存在,
      proposal.md 不存在 -----------> Phase 2: Propose
  +-- proposal.md 存在,
      design.md 或 specs/ 部分缺失 --> Phase 2: Propose (继续)
  +-- proposal.md + design.md +
      specs/ 完整, plan.json 不存在 -> Phase 3: Plan
  +-- plan.json 存在,
      部分 features 未完成 ---------> Phase 5: SDD (恢复)
  +-- 所有 features 完成 ------------> Phase 6: Finalize
  +-- 已归档 ------------------------> 工作流已结束
```

**RED LAW - 变更目录确定：** 在任何阶段恢复路径上，必须先确定最终的 `furina/changes/<name>/` 目录。名称必须满足 kebab-case 正则 `KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`。如果目录不存在，由 workflow 自行创建（不询问用户）。确定后必须执行 `furina change new <name> --desc <描述>` 激活变更。

### Hooks 集成流程

Workflow 命令与 Claude Code hooks 系统深度集成。当用户输入 `/furina:workflow <需求>` 时：

1. **UserPromptSubmit hook**（`init-agent` 模式）拦截输入，识别 `/furina:workflow` 前缀，调用 `agents init` 初始化会话，然后切换到 `workflow` stage
2. **PreToolUse:Agent hook**（`before-agent` 模式）在子代理分发前拦截，调用 `agents init` + `agents switch` 切换到目标 stage
3. **PostToolUse:Agent hook**（`after-agent` 模式）在子代理完成后拦截，切换回 `workflow` stage
4. **PreToolUse:Bash hook**（`before-bash` 模式）拦截 Bash 工具调用，识别 `furina change new/instruction/archive` 命令并执行相应 stage 切换
5. **PreToolUse:AskUserQuestion hook**（`before-question` 模式）在 brainstorm 模式下捕获问题到 question.json

## Functionality / Interface Details

### Workflow Configuration - Dependency Check

**Source**: `marketplace/commands/workflow.md` : 17-35

**Functionality**: 在工作流开始前验证 `furina` CLI 工具是否已安装。这是所有后续阶段的前置条件，因为阶段执行依赖多个 `furina` CLI 命令（`change new`、`config show`、`config mode`、`config set` 等）。

**Core Logic**:
1. 执行 `furina --version` 检查安装状态
2. 如果未安装，执行 `npm install -g furina@latest` 安装
3. 安装成功后提醒用户关闭并重新打开 CLI 窗口

**Core Code**:
```bash
furina --version
# If not installed:
npm install -g furina@latest
```
Source: `marketplace/commands/workflow.md` : 21-35

---

### Workflow Configuration - Language Adaptation

**Source**: `marketplace/commands/workflow.md` : 37-45

**Functionality**: 查询项目配置的语言设置，确定所有用户面向的响应和输出使用的语言。如果查询失败或无输出，则回退为中文。语言配置通过 `furina config show language` 命令获取，存储在 `furina.json` 的 `language` 字段中。

**Core Code**:
```bash
furina config show language
```
Source: `marketplace/commands/workflow.md` : 41-45

---

### Phase Detection - Resume Logic

**Source**: `marketplace/commands/workflow.md` : 74-104

**Functionality**: 核心阶段检测逻辑。在工作流启动时，通过检查 `furina/changes/` 目录下的产物文件来确定当前应从哪个阶段恢复执行。该逻辑是工作流可恢复性的基础，确保 Claude Code session 中断后不会重复已完成的工作，也不会跳过未完成的阶段。

**Parameters**:
- `FORCE_RESTART` (boolean): 当用户提供 `- FORCE_RESTART` 参数时启用。启用后强制从阶段 1 开始，但必须参考已有设计文档重新设计。

**Core Logic**:

阶段检测使用产物映射表确定当前阶段：

| 已有产物 | 当前阶段 | 恢复动作 |
|----------|----------|----------|
| 无变更目录或目录为空 | Phase 1: Explore | 开始探索 |
| `exploration.md` 存在（无 `proposal.md`） | Phase 1: Explore 完成 | 开始 Phase 2: Propose |
| `proposal.md` + `design.md` + `specs/` 部分缺失 | Phase 2: Propose 部分完成 | 继续 Phase 2: Propose |
| `proposal.md` + `design.md` + `specs/` 完整 | Phase 2: Propose 完成 | 开始 Phase 3: Plan |
| `plan.json` 存在，无 features 完成 | Phase 3: Plan 完成 | 开始 Phase 4: Review |
| `plan.json`: 部分 features 完成/in_progress | Phase 5: SDD 进行中 | 恢复下一个 feature |
| 所有 features 完成 | Phase 5: SDD 完成 | 开始 Phase 6: Finalize |
| 工作已集成（merged/PR）且在归档目录中 | Phase 6: Finalize 完成 | 工作流已结束 |

当存在多个活跃变更时，通过 `AskUserQuestion` 工具让用户选择要恢复的变更。

**RED LAW**:
1. 必须在恢复之前确定最终的 `furina/changes/<name>/` 目录（自行创建，不询问用户）
2. `<name>` 必须满足 `KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`
3. 无论从哪个阶段恢复，都必须先执行 `furina change new <name> --desc <简述>` 激活变更
4. 完成每个阶段后立即开始下一阶段，不得暂停询问用户确认

**Core Code**:
```markdown
**RED LAW: At this point, the final furina change directory:
`furina/changes/<name>/` must be determined (or create one by yourself,
do NOT ask user) before follow phases**.
`<name>` MUST satisfy `KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`.

**Regardless of which phase you ultimately detect for recovery, you MUST
first perform the following script to declare that the change <name> is
being created or activated:**
  furina change new <name> --desc <brief description [15-30 words] in `language`>
```
Source: `marketplace/commands/workflow.md` : 96-104

---

### Phase 1: Explore

**Source**: `marketplace/commands/workflow.md` : 106-123

**Functionality**: 工作流的第一阶段，负责深度探索用户想法、理解项目上下文、调查代码库、澄清需求。此阶段严禁编写代码，专注于理解而非实现。

**Parameters**:
- `exploreType` (string): 固定值 `for-design`，表示为设计目的的探索
- `exploreContent` (string): 用户的原始需求描述（`$ARGUMENTS`）
- `outputDir` (string): 探索结果输出目录 `{cwd}/furina/changes/<name>/explore-design`

**Core Logic**:
1. 调用 `furina-explore` 技能，传入上述参数
2. 技能内部并发分发多个子代理执行不同维度的探索（codebase、repository、memory、specification、reference、cleancode）
3. 探索完成后自动进入 Propose 阶段

**Core Code**:
```markdown
1. Invoke Skill: furina-explore to explore the project, with parameters:
  - `exploreType`: for-design
  - `exploreContent`: $ARGUMENTS
  - `outputDir`: `{cwd}/furina/changes/<name>/explore-design`
```
Source: `marketplace/commands/workflow.md` : 114-118

---

### Phase 2: Propose

**Source**: `marketplace/commands/workflow.md` : 125-179

**Functionality**: 工作流的第二阶段，负责创建正式的变更提案及所有产物。这是工作流中用户交互最密集的阶段，包含 brainstorm 对齐、提案生成、工作流模式选择和 feature 计数因子配置四个交互节点。此阶段禁止分发子代理，所有工作在主会话中完成。

**Core Logic**:

执行分为三个子步骤：

#### 1. Pre-Execution（前置标记）

调用 MCP 工具 `markBeginPropose` 标记 propose 阶段开始。此标记会触发 `PreToolUse` hook（`before-propose` 模式），使 hooks 系统将 session 切换到 `propose` stage 并启用 brainstorm 模式（写入 `settings.json`）。

#### 2. Phase Execution（阶段执行）

1. 调用 `furina-brainstorm` 技能进行需求对齐，等待技能完成
2. 使用 `AskUserQuestion` 工具询问用户是否需要进一步澄清：
   - 选项: "Continue to create Furina artifacts" / "Pause for further discussion"
3. 用户选择 "continue" 后，自动调用 `furina-propose` 技能创建变更提案

#### 3. Post-Execution（后置配置）

1. 使用 `AskUserQuestion` 工具让用户选择工作流模式，同时根据需求规模给出推荐：
   - **Lite**: 极速模式 — 代码探索 ✅ | 提案与计划 ✅ | 产物审查 ❌ | 参考探索 ❌ | 功能实现 ✅ | 规格审查 ❌ | 代码审查 ❌ | 最终集成 ✅
   - **Standard**: 标准模式 — 代码探索 ✅ | 提案与计划 ✅ | 产物审查 ❌ | 参考探索 ✅ | 功能实现 ✅ | 规格审查 ❌ | 代码审查 ✅ | 最终集成 ✅
   - **Max**: 完整模式 — 代码探索 ✅ | 提案与计划 ✅ | 产物审查 ✅ | 参考探索 ✅ | 功能实现 ✅ | 规格审查 ✅ | 代码审查 ✅ | 最终集成 ✅
   - 推荐逻辑: lite < 300（spec 数量），300 < standard < 1000，max > 1000；默认推荐 standard
   - 执行 `furina config mode <lite/standard/max>` 写入配置
2. 使用 `AskUserQuestion` 工具让用户选择 feature 计数因子：
   - 选项: `0.5`（默认）、`1`、`1.5`
   - 计算公式: `sum(features) <= factor * count(specs)`
   - 执行 `furina config set experimental.factor <factor>` 写入配置
3. 调用 MCP 工具 `markEndPropose` 标记 propose 阶段结束

**Core Code**:
```markdown
#### 1. Pre-Execution
- You **MSUT** use mcp tool: `mcp__plugin_furina_furina-mcp-server__markBeginPropose`

#### 2. Phase Execution
1. Invoke Skill: furina-brainstorm to brainstorm and align on user requirements
2. You MUST use `AskUserQuestion` tool to ask user 'Are there any further details
   that need clarification?', with following selections:
  - Continue to create Furina artifacts
  - Pause for further discussion
3. When user selects 'continue', then **automatically** invoke Skill: furina-propose

#### 3. Post-Execution
1. After completing furina-brainstorm and furina-propose, you **MUST** use
   the AskUserQuestion tool to ask the user to choose a workflow mode:
   - Lite / Standard / Max
   Then: furina config mode <lite/standard/max>
2. Limit feature count:
   Then: furina config set experimental.factor <factor: 0.5/...>
3. You **MSUT** use mcp tool: `mcp__plugin_furina_furina-mcp-server__markEndPropose`
```
Source: `marketplace/commands/workflow.md` : 133-170

---

### Phase 3: Plan

**Source**: `marketplace/commands/workflow.md` : 181-220

**Functionality**: 工作流的第三阶段，负责将提案分解为独立、可跟踪、带依赖关系的 feature 列表。此阶段禁止直接调用 `furina-plan` 技能，而是通过分发专用的 Planning Phase Subagent 来执行。子代理通过 Agent 工具（general-purpose）分发，描述标记为 `Furina:plan:Purpose`（供 hooks 系统识别和路由）。

**Parameters** (子代理模板参数):
- `[change name]` (string): 变更名称
- `[output language]` (string): 输出语言
- `[furina/changes/<name>/]` (string): 变更目录路径
- `[current project path]` (string): 当前项目路径

**Core Logic**:

1. 分发 Planning Phase Subagent，使用 Agent 工具模板
2. 子代理执行流程：
   - 读取变更目录中的产物（proposal.md、design.md、specs/）
   - 调用 `furina-plan` 技能生成补充开发文档和变更计划
3. 产出 `plan.json`（feature ID、描述、验收标准、文件路径、依赖关系、状态跟踪），以及可选的 `api.yaml` 和 `database.md`

**Core Code**:
```markdown
Agent tool (general-purpose):
  description: "Furina:plan:Purpose Create change plan: [change name]"
  prompt: |
    You are generating supplementary pre-dev docs and creating a change plan: [change name]

    ## Output Language
    [`output language`]

    ## furina change
    [`furina/changes/<name>/`]

    ## Project Path
    [current project path]

    ## Work Steps
    1. Invoke Skill: furina-plan to generate supplementary pre-dev docs
       and create the change plan
```
Source: `marketplace/commands/workflow.md` : 191-209

---

### Phase 4: Review Furina Artifacts

**Source**: `marketplace/commands/workflow.md` : 222-240

**Functionality**: 工作流的第四阶段，负责审查 Furina 产物的完整性和可行性。通过调用 `furina-review` 技能，分发审查子代理验证需求偏差、设计缺陷和计划遗漏。审查完成后，使用 `AskUserQuestion` 工具询问用户是否自动进入 Subagent-Driven Development 阶段。

**Parameters**:
- Change Directory (string): `furina/changes/<name>/`

**Core Logic**:
1. 调用 `furina-review` 技能，传入变更目录路径
2. Review 技能内部创建审查子代理，依次执行 Propose Review Instruction 和 Plan Review Instruction
3. 审查通过或返回修改建议
4. 使用 `AskUserQuestion` 询问用户是否自动进入 SDD

**Core Code**:
```markdown
1. Invoke Skill: furina-review to review the Furina artifacts, with parameters:
  - Change Directory: `furina/changes/<name>/`
```
Source: `marketplace/commands/workflow.md` : 230-231

**注意**: 此阶段的执行受工作流模式（Lite/Standard/Max）控制。在 Lite 和 Standard 模式下，`experimental.review.furina` 为 `false`，审查步骤被跳过。

---

### Phase 5: Subagent-Driven Development

**Source**: `marketplace/commands/workflow.md` : 242-259

**Functionality**: 工作流的第五阶段，负责按拓扑排序逐个执行 `plan.json` 中的 feature。每个 feature 由全新子代理实现，结合 TDD（测试驱动开发）和两阶段审查（先规格合规，再代码质量）。这是工作流中执行时间最长、资源消耗最多的阶段。

**Core Logic**:

1. 调用 `furina-sdd` 技能执行 SDD 主循环
2. SDD 主循环：检查状态 -> 获取下一个 Feature -> 执行 Feature 处理流程 -> 重复
3. 每个 Feature 的处理流程（9 步）：
   - 标记 `in_progress`
   - 分发参考探索子代理（`experimental.explore=true` 时）
   - 分发实现者子代理（加载 TDD 技能 -> Red-Green-Refactor 循环）
   - 处理实现者疑问（循环直到无疑问）
   - 分发规格合规审查子代理（`experimental.review.specs=true` 时）
   - 处理规格审查问题（循环直到通过）
   - 分发代码质量审查子代理（`experimental.review.code=true` 时）
   - 处理质量审查问题（循环直到通过）
   - 标记 `done`，`git add --all`
4. 所有 Feature 完成后自动进入 Finalize 阶段

**Core Code**:
```markdown
1. Invoke Skill: furina-sdd to execute the subagent-driven development phase.
   This skill processes features in full topological order. For each feature:
   dispatch implementer -> implementer must use `furina-tdd` ->
   spec compliance review -> code quality review -> mark feature complete.
```
Source: `marketplace/commands/workflow.md` : 250

---

### Phase 6: Finalize

**Source**: `marketplace/commands/workflow.md` : 261-279

**Functionality**: 工作流的最后阶段，负责完成开发工作的集成、测试和归档。调用 `furina-finalize` 技能依次执行集成测试、代码库同步、变更归档和 git 提交。

**Parameters**:
- Change Directory (string): `furina/changes/<name>/`

**Core Logic**:
1. 调用 `furina-finalize` 技能，传入变更目录
2. Finalize 内部执行：集成测试（integration instruction）-> 代码库同步（syncbase instruction）-> 归档（`furina change archive`）-> 提交（`furina-commit`）

**Core Code**:
```markdown
1. Invoke Skill: furina-finalize to finalize this change:
  - Change directory: `furina/changes/<name>/`
```
Source: `marketplace/commands/workflow.md` : 269-270

---

### MCP Tool: markBeginPropose / markEndPropose

**Source**: `src/server/mcp/index.ts` : 17-77

**Functionality**: 两个 MCP 标记工具，用于标记 propose 阶段的开始和结束。它们不执行任何业务逻辑，仅返回固定的文本标记。这些标记被 hooks 系统拦截（通过 `PreToolUse` matcher），触发相应的 stage 切换和 brainstorm 模式管理。

**markBeginPropose 返回值**:
```
[MARK_FURINA_PROPOSE_BEGIN]: ignore this message, this is just an MCP marker
and has nothing to do with the user's needs.
```

**markEndPropose 返回值**:
```
[MARK_FURINA_PROPOSE_END]: ignore this message, this is just an MCP marker
and has nothing to do with the user's needs.
```

**Core Code**:
```typescript
export const MARK_BEGIN_PROPOSE_TEXT =
  "[MARK_FURINA_PROPOSE_BEGIN]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs.";

export const MARK_END_PROPOSE_TEXT =
  "[MARK_FURINA_PROPOSE_END]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs.";

export function handleMarkBeginPropose(): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: MARK_BEGIN_PROPOSE_TEXT }],
  };
}

export function handleMarkEndPropose(): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: MARK_END_PROPOSE_TEXT }],
  };
}
```
Source: `src/server/mcp/index.ts` : 17-50

**Hooks 集成**: `hooks.json` 为这两个 MCP 工具注册了 `PreToolUse` hook：
- `markBeginPropose` 触发 `--before-propose` 模式（初始化 session、切换到 propose stage、启用 brainstorm 模式）
- `markEndPropose` 触发 `--after-agent` 模式（切换回 workflow stage）

---

### CLI Command: `furina config mode`

**Source**: `src/commands/config.ts` : 34-53, 176-196

**Functionality**: 应用预设的工作流模式（Lite/Standard/Max），批量设置 `experimental.*` 配置标志。每个模式预设对应一组固定的实验性开关值。

**Parameters**:
- `mode` (string): 模式名称，可选值 `lite` / `standard` / `max`

**模式预设定义**:

| 模式 | `experimental.explore` | `experimental.review.furina` | `experimental.review.specs` | `experimental.review.code` |
|------|----------------------|--------------------------------|---------------------------|--------------------------|
| `lite` | `false` | `false` | `false` | `false` |
| `standard` | `true` | `false` | `false` | `true` |
| `max` | `true` | `true` | `true` | `true` |

**Core Code**:
```typescript
export const MODE_PRESETS: Record<'lite' | 'standard' | 'max', DeepPartial<FurinaConfig>> = {
  lite: {
    experimental: {
      explore: false,
      review: { furina: false, specs: false, code: false },
    },
  },
  standard: {
    experimental: {
      explore: true,
      review: { furina: false, specs: false, code: true },
    },
  },
  max: {
    experimental: {
      explore: true,
      review: { furina: true, specs: true, code: true },
    },
  },
};
```
Source: `src/commands/config.ts` : 34-53

---

### CLI Command: `furina change new`

**Source**: `src/commands/change/new.ts` : 25-91, `src/commands/change/shared.ts` : 44-86

**Functionality**: 创建新的变更目录并注册到 `changes.json`。验证变更名的 kebab-case 格式，创建物理目录，创建 `changes.json` 条目，并同步到全局 memory。

**Parameters**:
- `name` (string): 变更名称，必须满足 `KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`
- `options.desc` (string): 变更描述

**Core Logic**:
1. 验证名称格式（`validateChangeName`）
2. 同步 `changes.json` 与文件系统
3. 如果变更已存在，更新描述并返回
4. 创建 `furina/changes/<name>/` 目录
5. 在 `changes.json` 中追加新条目
6. 同步到全局 memory

**Core Code** (验证逻辑):
```typescript
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validateChangeName(name: string): { valid: boolean; error?: string } {
  if (!KEBAB_CASE.test(name)) {
    return { valid: false, error: 'Change name must be kebab-case (e.g., my-change)' };
  }
  return { valid: true };
}
```
Source: `src/commands/change/shared.ts` : 44-86

## Data Structures

### Workflow Mode Presets

```
MODE_PRESETS:
  lite: {
    experimental: {
      explore: false,
      review: { furina: false, specs: false, code: false }
    }
  }
  standard: {
    experimental: {
      explore: true,
      review: { furina: false, specs: false, code: true }
    }
  }
  max: {
    experimental: {
      explore: true,
      review: { furina: true, specs: true, code: true }
    }
  }
```
- `lite` (ModePreset): 极速模式 — 禁用所有参考探索和审查步骤，最小化子代理分发
- `standard` (ModePreset): 标准模式 — 启用参考探索和代码质量审查，但禁用产物审查和规格审查
- `max` (ModePreset): 完整模式 — 启用所有探索和审查步骤，最严格的质量门禁

### MCP Marker Texts

```
MARK_BEGIN_PROPOSE_TEXT = "[MARK_FURINA_PROPOSE_BEGIN]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs."
MARK_END_PROPOSE_TEXT   = "[MARK_FURINA_PROPOSE_END]: ignore this message, this is just an MCP marker and has nothing to do with the user's needs."
```
- 两个常量为固定文本标记，用于 hooks 系统识别 propose 阶段的边界

### Phase-Artifact Mapping

```
Phase Detection Table:
  phase_1_explore:      artifacts = [] (无产物或空目录)
  phase_2_propose:      artifacts = [exploration.md]
  phase_2_propose_partial: artifacts = [proposal.md, (design.md), (specs/)]
  phase_3_plan:         artifacts = [proposal.md, design.md, specs/]
  phase_4_review:       artifacts = [...propose, plan.json]
  phase_5_sdd:          artifacts = [...plan, features 部分完成]
  phase_5_sdd_complete: artifacts = [...plan, 所有 features done]
  phase_6_finalize:     artifacts = 所有 features done + 归档
```

### KEBAB_CASE Validation Pattern

```
KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
```
- 必须以小写字母开头
- 只能包含小写字母、数字和连字符
- 连字符后必须跟小写字母或数字
- 有效示例: `auth-login`, `user-profile-v2`, `fix-bug-001`
- 无效示例: `AuthLogin`, `-start`, `end-`, `has--double`

### Artifact IDs

```
ARTIFACT_IDS = ['proposal', 'design', 'specs', 'api', 'database', 'plan']

ARTIFACT_EXTENSIONS:
  proposal: '.md'
  design:   '.md'
  specs:    '/**/*.md'   (目录结构)
  api:      '.yaml'
  database: '.md'
  plan:     '.json'
```

## Error Handling and Edge Cases

### furina 未安装

当 `furina --version` 失败时，自动执行 `npm install -g furina@latest` 安装。安装成功后要求用户关闭并重新打开 CLI 窗口，以确保 PATH 环境变量生效。

### 多个活跃变更存在

当 `furina/changes/` 下有多个活跃变更目录时，无法自动确定恢复目标。此时通过 `AskUserQuestion` 工具让用户选择要恢复的变更。这是唯一在阶段检测过程中允许的用户交互。

### FORCE_RESTART 与已有变更

当 `FORCE_RESTART` 启用且存在已有变更时，强制从 Phase 1 开始但有特殊要求：必须参考已有的 design、plan、spec 文档，在其基础上重新设计更全面、更专业的方案。这避免了完全丢弃已有工作成果。

### 阶段检测无匹配

如果已有产物不符合映射表中的任何模式（例如 plan.json 存在但 proposal.md 缺失），这种情况在 workflow.md 中未明确定义处理策略。按照 RED LAW 的约束，应以最保守的方式处理——从最接近的前置阶段恢复。

### Phase 2 用户选择 "Pause for further discussion"

在 Propose 阶段的 brainstorm 之后，如果用户选择 "Pause for further discussion" 而非 "Continue to create Furina artifacts"，workflow 进入讨论模式，用户可以进一步澄清需求后再选择继续。

### Feature 计数因子

`experimental.factor` 配置控制 `furina-plan` 生成的 feature 数量上限。计算公式为 `sum(features) <= factor * count(specs)`，其中 `count(specs)` 是 `specs/` 目录下的规格文档数量。默认因子 0.5 确保 feature 数量不超过 spec 数量的一半，避免过度分解。

### Auto Transition 规则

完成每个阶段后必须立即开始下一阶段，不得暂停询问用户确认，不得输出 "Phase complete, continue?" 类型的提示。唯一例外是 Phase 4（Review）完成后，必须通过 `AskUserQuestion` 询问用户是否进入 Phase 5（SDD）。

### 红线警告

Workflow 命令定义了以下绝对禁止行为：
- 跳过任何阶段
- 当活跃变更存在时从阶段 1 开始（除非 FORCE_RESTART）
- 在探索阶段编写代码
- 没有计划就开始实现
- 跳过任何 feature 的 TDD
- 在测试失败时继续
- 跳过规格合规审查就进行代码质量审查
- 跳过审查步骤
- 没有最终审查就合并
- 未经确认删除工作
- 跳过归档
- 忽略子代理的 BLOCKED/NEEDS_CONTEXT 状态
- 在未解决阻塞的情况下强制同一模型重试

## Dependencies

### Depends on（Workflow 依赖的技能/模块）

| 依赖 | 用途 | 关系 |
|------|------|------|
| `furina-explore` | Phase 1 调用，执行多维代码库探索 | 直接技能调用 |
| `furina-brainstorm` | Phase 2 调用，进行需求对齐 brainstorm | 直接技能调用 |
| `furina-propose` | Phase 2 调用，创建变更提案及所有产物 | 直接技能调用 |
| `furina-plan` | Phase 3 通过子代理调用，生成 plan.json | 通过 Planning Phase Subagent 间接调用 |
| `furina-review` | Phase 4 调用，审查产物质量 | 直接技能调用 |
| `furina-sdd` | Phase 5 调用，执行 Subagent-Driven Development | 直接技能调用 |
| `furina-finalize` | Phase 6 调用，执行集成测试和归档 | 直接技能调用 |
| MCP Server (`markBeginPropose`/`markEndPropose`) | Phase 2 标记 propose 阶段边界 | MCP 工具调用 |
| Hooks System (`hooks.json` + `furina_hooks.js`) | 管理 session 初始化、子代理生命周期、stage 切换 | hook 拦截 |
| `furina` CLI | 变更管理（`change new`/`list`/`feature`）、配置管理（`config show`/`mode`/`set`） | CLI 命令调用 |

### Depended by（依赖 Workflow 的技能/模块）

| 依赖者 | 用途 |
|--------|------|
| Claude Code UserPromptSubmit hook | `runInitAgent` 拦截 `/furina:workflow` 前缀输入，调用 `agents init` 初始化会话 |
| 用户直接交互 | 通过 `/furina:workflow <需求>` 命令启动完整开发工作流 |

## Usage Examples

### 示例 1：首次启动完整工作流

```markdown
# 用户输入
/furina:workflow I want to add user authentication with JWT tokens

# Workflow 执行流程：

# 1. Dependency Check
$ furina --version
furina v1.2.3

# 2. Language Adaptation
$ furina config show language
Language: zh-CN

# 3. Phase Detection - 无已有变更，从 Phase 1 开始
$ furina change list
# (empty)

# 4. 确定变更名并激活
$ furina change new jwt-auth --desc "Add user authentication system with JWT tokens and refresh token support"
Change 'jwt-auth' created successfully

# 5. Phase 1: Explore
[调用 furina-explore, exploreType: for-design, exploreContent: "Add user authentication..."]
[探索完成，生成 furina/changes/jwt-auth/explore-design/]

# 6. Phase 2: Propose
[MCP: markBeginPropose]
[调用 furina-brainstorm]
[AskUserQuestion: "Are there any further details that need clarification?"]
用户: "Continue to create Furina artifacts"
[调用 furina-propose]
[生成 proposal.md, design.md, specs/auth/*.md]

[AskUserQuestion: 选择工作流模式]
推荐: Standard (需求规模中等)
$ furina config mode standard

[AskUserQuestion: 选择 feature 计数因子]
推荐: 0.5 (specs 数量 4，最大 features = 2)
$ furina config set experimental.factor 0.5
[MCP: markEndPropose]

# 7. Phase 3: Plan
[分发 Planning Phase Subagent (Furina:plan:Purpose)]
[子代理调用 furina-plan，生成 plan.json]
# 产出: plan.json (2 features: auth-001, auth-002)

# 8. Phase 4: Review (Standard 模式下 experimental.review.furina=false，跳过)
[AskUserQuestion: "是否自动进入 Subagent-Driven Development?"]

# 9. Phase 5: SDD
[调用 furina-sdd]
  # Feature auth-001: JWT login endpoint
  # - 参考探索子代理 (experimental.explore=true)
  # - 实现者子代理 (TDD: Red -> Green -> Refactor)
  # - 代码质量审查子代理 (experimental.review.code=true)
  # - 标记 done

  # Feature auth-002: Token refresh
  # - 同上流程
  # - 标记 done

# 10. Phase 6: Finalize
[调用 furina-finalize]
[集成测试 + 代码库同步 + 归档 + git commit]

# Workflow Ended
"Work complete! Workflow ended."
```

Explanation: 此示例展示了完整的端到端工作流执行，从用户输入需求到工作流结束。涵盖配置检查、语言适配、阶段检测（首次无已有变更）、变更目录创建、6 个阶段的顺序执行、MCP 标记工具使用、用户交互节点（模式选择、因子选择）、以及 hooks 系统的隐式工作。

### 示例 2：Session 中断后的恢复

```markdown
# 用户之前执行到 Phase 3 (Plan)，Claude Code session 中断
# 用户重新输入：
/furina:workflow (无参数，或带原参数)

# Workflow 执行流程：

# 1. Dependency Check & Language Adaptation (同上)

# 2. Phase Detection
$ ls furina/changes/
jwt-auth/

$ ls furina/changes/jwt-auth/
exploration.md  proposal.md  design.md  specs/

# 检测到 proposal.md + design.md + specs/ 完整
# 但 plan.json 不存在 -> Phase 2 完成，从 Phase 3 恢复

# 3. 激活变更
$ furina change new jwt-auth --desc "Add user authentication system with JWT tokens"
Change 'jwt-auth' already exists, description updated

# 4. Phase 3: Plan (从这里恢复)
[分发 Planning Phase Subagent]
...
```

Explanation: 此示例展示了 workflow 命令的阶段恢复能力。即使 session 中断，通过检查产物文件可以准确判断应从 Phase 3 恢复，避免重复已完成的 Phase 1 和 Phase 2。

### 示例 3：FORCE_RESTART 强制重新开始

```markdown
# 用户已有进行中的变更 jwt-auth，想重新设计
/furina:workflow - FORCE_RESTART I want to add user authentication...

# Workflow 执行流程：

# 1. FORCE_RESTART 启用，强制从 Phase 1 开始
# 2. 但 RED LAW 要求参考已有 design, plan, spec 文档重新设计
# 3. 从 Phase 1 开始完整流程，产出更全面的方案
```

Explanation: 此示例展示了 FORCE_RESTART 的特殊行为：虽然从 Phase 1 开始，但不是简单丢弃已有工作，而是在已有文档基础上进行更全面、更专业的重新设计。
