# Skill: furina-sdd (Subagent-Driven Development)

> Source files:
> - `marketplace/skills/furina-sdd/SKILL.md` : 1-153
> - `marketplace/skills/furina-sdd/instructions/complete-feature.md` : 1-99
> - `marketplace/skills/furina-sdd/references/code-implementer.md` : 1-171
> - `marketplace/skills/furina-sdd/references/code-implementer-prompt.md` : 1-45
> - `marketplace/skills/furina-sdd/references/example-workflow.md` : 1-124
> - `marketplace/skills/furina-sdd/references/important-matters.md` : 1-79
> - `marketplace/skills/furina-sdd/references/quality-reviewer.md` : 1-180
> - `marketplace/skills/furina-sdd/references/quality-reviewer-prompt.md` : 1-45
> - `marketplace/skills/furina-sdd/references/reference-explorer-prompt.md` : 1-23
> - `marketplace/skills/furina-sdd/references/specs-reviewer.md` : 1-93
> - `marketplace/skills/furina-sdd/references/specs-reviewer-prompt.md` : 1-43

## Overview

furina-sdd 是 Furina 工作流中 **第 5 阶段（Subagent-Driven Development）** 的核心技能，负责将 `furina-plan` 生成的 `plan.json` 特性列表逐一分发给独立的子代理执行，实现"每个 Feature 使用全新子代理 + 两阶段审查（先规格合规，再代码质量）"的高质量快速迭代开发模式。

**设计动机：** 传统开发中，单一代理上下文窗口会随着功能实现不断膨胀，导致后期决策质量下降、遗忘关键约束。SDD 通过为每个 Feature 分配全新的子代理，保证每个功能实现在干净的上下文中开始，结合两阶段审查机制（规格合规审查 + 代码质量审查）确保产出既符合需求规格又达到工程质量标准。

**使用场景：**
- 当 `furina-plan` 生成 `plan.json` 后，用户或 workflow 命令需要执行该特性列表时
- 当 workflow 命令进入第 5 阶段（Subagent-Driven Development）时自动调用
- 用户也可以手动触发此技能来执行已有的 plan.json

**核心原则：** 每个 Feature 使用全新子代理 + 两阶段审查（先规格合规，再代码质量） = 高质量 + 快速迭代

**涉及源文件及各自职责：**

| 源文件 | 职责 |
|--------|------|
| `SKILL.md` | 技能入口：定义 SDD 主循环流程、配置查询、Feature 管理策略、红线规则、集成关系 |
| `instructions/complete-feature.md` | 单 Feature 处理流程指令：定义 9 步处理流程（标记进度 -> 参考探索 -> 实现 -> 规格审查 -> 质量审查 -> 完成） |
| `references/code-implementer-prompt.md` | 实现者子代理的提示模板：定义分发格式、参数填充规则、执行流程引用 |
| `references/code-implementer.md` | 实现者子代理的工作指南：定义 TDD 流程、代码组织、自我审查、状态报告格式 |
| `references/specs-reviewer-prompt.md` | 规格合规审查子代理的提示模板：定义分发格式和执行流程引用 |
| `references/specs-reviewer.md` | 规格合规审查子代理的工作指南：定义验收标准逐项验证、TDD 验证、不信任报告原则 |
| `references/quality-reviewer-prompt.md` | 代码质量审查子代理的提示模板：定义分发格式和执行流程引用 |
| `references/quality-reviewer.md` | 代码质量审查子代理的工作指南：定义代码质量/架构/测试/覆盖率审查清单和输出格式 |
| `references/reference-explorer-prompt.md` | 参考探索子代理的提示模板：定义分发格式和 furina-explore 技能调用参数 |
| `references/important-matters.md` | 策略与优势文档：定义懒加载策略、实现者状态处理、效率收益和质量门禁 |
| `references/example-workflow.md` | 示例工作流：演示完整的多 Feature 执行流程，包括审查循环和状态管理 |

## Architecture / Flow

### SDD 主循环（SKILL.md）

SDD 主循环是一个简单的"获取-执行-重复"循环，每次迭代处理一个 Feature，直到所有 Feature 完成后调用 `furina-finalize`。

```
[开始 SDD]
  |
  v
检查 SDD Plan 状态 (furina change feature <name> --status)
  |
  v
获取下一个 Feature (furina change feature <name> --next)
  |
  v
是否有待处理 Feature? ---否---> 调用 furina-finalize 结束
  |
  是
  |
  v
执行 Feature 处理流程 (complete-feature.md)
  |
  v
回到"获取下一个 Feature"
```

**依赖顺序约束：** Feature 数组按拓扑排序（依赖在前，被依赖在后）。处理时按数组顺序，跳过依赖未完成的 Feature，待依赖完成后返回处理。

**前置条件：** `furina/changes/<name>/plan.json` 必须存在，否则提醒用户先执行 `furina-plan`。

### 单 Feature 处理流程（complete-feature.md）

每个 Feature 的处理是一个包含子代理分发和审查循环的 9 步流程：

```
标记 Feature 为 'in_progress'
  |
  v
分发参考探索子代理 (experimental.explore=true 时)
  |
  v
分发实现者子代理
  |
  v
实现者有疑问? ---是---> 回答问题，重新分发实现者
  |                         |
  否                        v
  |                    回到"实现者有疑问?"
  v
分发规格合规审查子代理 (experimental.review.specs=true 时)
  |
  v
规格合规通过? ---否---> 分发实现者修复规格差距 -> 重新规格审查
  |
  是
  v
分发代码质量审查子代理 (experimental.review.code=true 时)
  |
  v
代码质量通过? ---否---> 分发实现者修复质量问题 -> 重新质量审查
  |
  是
  v
标记 Feature 为 'done'，git add 所有变更
```

### 子代理角色关系

SDD 涉及 4 种子代理角色，每种角色有独立的 prompt 模板和工作指南：

1. **参考探索子代理（Reference Explorer）** -- 调用 `furina-explore` 技能，为实现者生成参考文档
2. **实现者子代理（Implementer）** -- 执行 TDD 编码，遵循 `code-implementer.md` 工作指南
3. **规格合规审查子代理（Spec Reviewer）** -- 逐项验证验收标准，遵循 `specs-reviewer.md` 工作指南
4. **代码质量审查子代理（Code Quality Reviewer）** -- 审查代码质量、架构、测试覆盖率，遵循 `quality-reviewer.md` 工作指南

所有子代理均在前台运行，不允许后台化。每个子代理有专用的描述标记（`Furina:explore:Purpose`、`Furina:coding:Purpose`、`Furina:review:Purpose`），供 hooks 系统识别和路由。

## Functionality / Interface Details

### SDD 主入口流程 (SKILL.md)

**Source**: `marketplace/skills/furina-sdd/SKILL.md` : 1-153

**Functionality**: SDD 技能的顶层入口，定义了完整的 Subagent-Driven Development 执行流程。当技能被触发时，首先查询配置确定哪些子代理可以分发，然后进入主循环逐个处理 Feature。该技能还定义了 Feature 持久化管理策略（用 `furina change feature` 替代 TodoWrite）、严格的红线规则、以及与其他技能的集成关系。

**配置查询**:

执行以下命令获取技能所需配置：
```bash
furina config show language experimental.explore experimental.review.specs experimental.review.code
```

**Parameters** (返回的配置值):
- `language` (string): 输出语言。如果 `None`，默认中文。
- `experimental.explore` (boolean): 是否允许分发参考探索子代理。非 `true` 时禁止分发。
- `experimental.review.specs` (boolean): 是否允许分发规格合规审查子代理。非 `true` 时禁止分发。
- `experimental.review.code` (boolean): 是否允许分发代码质量审查子代理。非 `true` 时禁止分发。

**Core Logic**:

SDD 主流程的核心逻辑为：
1. 检查 `furina/changes/<name>/plan.json` 是否存在（前置条件验证）
2. 通过 `furina config show` 查询配置确定可用子代理
3. 进入循环：`--status` 查状态 -> `--next` 获取下一个 Feature -> 执行完整 Feature 处理流程 -> 重复
4. 当 `--next` 返回空时，调用 `furina-finalize` 结束

**Core Code** (SDD 流程定义):
```markdown
## SDD Process

1. Check SDD Plan status
2. Get next Feature from SDD Plan — if none, invoke `furina-finalize` to end the SDD process
3. Execute Feature processing flow: strictly follow the steps in `### Execute Feature Processing Flow`
4. Repeat from step 2 until there are no more pending features, then invoke `furina-finalize` to end the SDD process
```
Source: `marketplace/skills/furina-sdd/SKILL.md` : 51-56

---

### 完整 Feature 处理指令 (complete-feature.md)

**Source**: `marketplace/skills/furina-sdd/instructions/complete-feature.md` : 1-99

**Functionality**: 定义单个 Feature 从标记 `in_progress` 到标记 `done` 的完整处理流程。这是 SDD 核心循环中每个迭代的具体执行内容，包含 9 个强制执行步骤，涵盖参考探索、编码实现、两阶段审查和状态更新。该指令被称为"RED LAW"，禁止任意简化流程。

**执行步骤** (严格按序执行):

#### 步骤 1：标记 Feature 为 'in_progress'

```bash
furina change feature <name> --start <feature-id>
```

#### 步骤 2：分发参考探索子代理

- **前置条件**: `experimental.explore = true`；否则跳过此步骤
- 使用 `reference-explorer-prompt.md` 模板分发子代理

#### 步骤 3：分发实现者子代理

- 使用 `code-implementer-prompt.md` 模板分发子代理
- 无前置条件限制（实现是必须步骤）

#### 步骤 4：处理实现者疑问

- 如果实现者提出问题，回答后重新分发实现者子代理（使用全新实例）
- 循环直到实现者无疑问

#### 步骤 5：分发规格合规审查子代理

- **前置条件**: `experimental.review.specs = true`；否则跳过此步骤
- 使用 `specs-reviewer-prompt.md` 模板分发子代理

#### 步骤 6：处理规格审查问题

- 如果规格审查未通过，分发新的实现者子代理修复差距
- 修复后重新分发规格审查子代理审查
- 循环直到通过

#### 步骤 7：分发代码质量审查子代理

- **前置条件**: `experimental.review.code = true`；否则跳过此步骤
- **关键约束**: 必须在规格合规审查通过后才能执行
- 使用 `quality-reviewer-prompt.md` 模板分发子代理

#### 步骤 8：处理质量审查问题

- 如果质量审查未通过，分发新的实现者子代理修复问题
- 修复后重新分发质量审查子代理审查
- 循环直到通过

#### 步骤 9：结束 Feature 处理流程

1. 标记 Feature 为 'done':
   ```bash
   furina change feature <name> --complete <feature-id>
   ```
2. 将所有未暂存变更添加到暂存区:
   ```bash
   git add --all
   ```

**Core Code** (RED LAW 定义):
```markdown
**RED LAW**: during feature processing workflow, it is forbidden to arbitrarily simplify the process.
All 9 feature processing flow tasks listed above must be executed one by one accurately in order and completely.
```
Source: `marketplace/skills/furina-sdd/instructions/complete-feature.md` : 53

**Git 操作约束** (REA LAW):
- 仅允许 `git add` 命令，且必须在 End Feature Processing Flow 步骤中执行
- `git commit` 和 `git push` 绝对禁止

---

### 实现者子代理提示模板 (code-implementer-prompt.md)

**Source**: `marketplace/skills/furina-sdd/references/code-implementer-prompt.md` : 1-45

**Functionality**: 定义分发实现者子代理时使用的 Agent 工具参数格式和 prompt 内容模板。该模板是控制器（SDD 主代理）与实现者子代理之间的接口契约，规定了所有必须传递的参数、占位符替换规则以及子代理的执行入口。

**子代理描述标记**: `Furina:coding:Purpose`（供 hooks 识别，不可更改）

**模板参数**:
- `{feature-id}` (string): Feature 唯一标识符（如 `auth-001`）
- `{feature name}` (string): Feature 功能名称
- `{language}` (string): 输出语言配置
- `{feature.id}` (string): Feature ID（同 feature-id）
- `{feature.function}` (string): Feature 功能描述
- `{feature.description}` (string): Feature 详细说明
- `{feature.acceptance_criteria}` (string[]): 验收标准列表
- `{feature.tasks}` (string[]): 任务列表
- `{feature.files}` (string[]): 可能涉及的文件列表
- `{feature.spec_refs}` (string[]): 规格引用文档路径列表
- `${CLAUDE_PLUGIN_ROOT}` (string): 插件安装目录
- `{cwd}` (string): 当前工作目录

**Core Logic**:
模板要求子代理执行两步流程：首先读取 `code-implementer.md` 实现者工作指南，然后严格按照该指南执行编码任务。这种两层结构将"如何分发"（prompt template）与"如何工作"（work guide）解耦。

**Core Code**:
```
Agent tool (general-purpose):
  description: "Furina:coding:Purpose Implement {feature-id}: {feature name}"
  prompt: |
    You are implementing feature {feature-id}: {feature name}

    ## Execution Flow
    Follow these steps strictly and accurately:
    1. Read the implementer template document: `${CLAUDE_PLUGIN_ROOT}/skills/furina-sdd/references/code-implementer.md`
    2. Strictly follow the steps and requirements of the implementer template to execute the code implementation task
```
Source: `marketplace/skills/furina-sdd/references/code-implementer-prompt.md` : 6-45

---

### 实现者子代理工作指南 (code-implementer.md)

**Source**: `marketplace/skills/furina-sdd/references/code-implementer.md` : 1-171

**Functionality**: 定义实现者子代理的完整工作规范，包括 TDD 强制调用、编码流程（读取理解 -> 代码研究 -> 加载 TDD -> TDD 循环编码 -> 验收检查 -> 提交 -> 自我审查 -> 报告）、代码组织原则、升级机制和报告格式。这是实现者子代理执行编码任务时必须遵循的核心行为准则。

**Parameters** (由 prompt 模板注入):
- Feature 描述、验收标准、任务列表
- 可能涉及的文件列表
- 上下文信息（系统中的位置、依赖关系、架构约定）
- 规格引用文档路径
- Feature 参考文档路径（`{cwd}/furina/changes/<name>/reference/{feature-id}.md`）

**Core Logic**:

实现者的工作流程分为 8 个步骤：

1. **读取与理解**: 读取 Feature 参考文档、规格文档、设计文档，理解完整上下文和约束
2. **代码研究**: 读取现有代码文件，理解代码库模式、命名约定、架构风格
3. **加载 TDD**: 通过 Skill 工具调用 `furina-tdd`，加载完整的测试驱动开发工作流（此步骤强制执行，不可跳过）
4. **TDD 循环编码**: 将 Feature 分解为小块，每块严格遵循 Red-Green-Refactor 循环：
   - Red: 先写失败的测试
   - Verify Red: 运行测试确认因预期原因失败
   - Green: 写最少的代码使测试通过
   - Verify Green: 运行测试确认通过且无回归
   - Refactor: 在测试保护下重构代码
5. **验收检查**: 逐项验证所有验收标准
6. **提交代码**: 执行 `git commit`（注意：此处的 git commit 由子代理内部执行，但 complete-feature.md 层面禁止 git commit）
7. **自我审查**: 按完整性、质量、纪律、测试四个维度审查自身代码
8. **报告**: 按规定格式报告状态和结果

**状态报告格式**:
- `DONE`: 功能完成
- `DONE_WITH_CONCERNS`: 完成但有疑虑
- `BLOCKED`: 无法完成，需要帮助
- `NEEDS_CONTEXT`: 缺少信息，需要更多上下文

**REA LAW**:
- 禁止执行任何 Git 写操作（`git commit/push/merge/rebase/add/checkout`），仅允许只读 Git 命令
- 如果 `.gitignore` 不存在，必须创建；如果存在，应补充必要内容

**Core Code** (TDD 强制要求):
```markdown
## Mandatory: Use TDD Skill

Before writing any code, you must invoke the TDD skill to load the full test-driven development workflow:

Use the Skill tool to call: `furina-tdd`

This is not optional. The skill provides the complete Red-Green-Refactor cycle
with specific verification gates that you must follow.
Do not attempt TDD from memory — load the skill first.
```
Source: `marketplace/skills/furina-sdd/references/code-implementer.md` : 60-66

**Core Code** (报告格式):
```markdown
## Report Format

When done, report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented (or what you attempted if blocked)
- What you tested and test results
- Which files were changed
- Self-review findings (if any)
- Any issues or concerns
```
Source: `marketplace/skills/furina-sdd/references/code-implementer.md` : 157-165

---

### 参考探索子代理提示模板 (reference-explorer-prompt.md)

**Source**: `marketplace/skills/furina-sdd/references/reference-explorer-prompt.md` : 1-23

**Functionality**: 定义分发参考探索子代理时使用的 Agent 工具参数格式。该子代理的任务是在编码前调用 `furina-explore` 技能，为当前 Feature 生成参考文档或相关实现的探索结果，帮助实现者子代理更好地理解代码库上下文。

**子代理描述标记**: `Furina:explore:Purpose`（供 hooks 识别，不可更改）

**模板参数**:
- `{feature-id}` (string): Feature 唯一标识符
- `{feature name}` (string): Feature 功能名称
- `{language}` (string): 输出语言配置
- `{detailed requirement exploration content}` (string): 当前 Feature 的详细需求探索内容
- `{cwd}` (string): 当前工作目录

**Core Logic**:
子代理执行单一操作：调用 `furina-explore` 技能，传入以下参数：
- `exploreType`: `for-coding`（编码导向的探索模式）
- `exploreContent`: 当前 Feature 的详细需求探索内容
- `outputDir`: `{cwd}/furina/changes/<name>/explore-coding/{feature-id}`（探索结果输出目录）

**Core Code**:
```
Agent tool (general-purpose):
  description: "Furina:explore:Purpose Explore references for {feature-id}: {feature name}"
  prompt: |
    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Invoke the skill `furina-explore` to obtain the feature's reference documentation
        or implementation, with the following skill parameters:
        - `exploreType`: for-coding
        - `exploreContent`: {detailed requirement exploration content of this feature}
        - `outputDir`: `{cwd}/furina/changes/<name>/explore-coding/{feature-id}`
```
Source: `marketplace/skills/furina-sdd/references/reference-explorer-prompt.md` : 6-23

---

### 规格合规审查子代理提示模板 (specs-reviewer-prompt.md)

**Source**: `marketplace/skills/furina-sdd/references/specs-reviewer-prompt.md` : 1-43

**Functionality**: 定义分发规格合规审查子代理时使用的 Agent 工具参数格式。该子代理的任务是验证实现者的代码是否严格符合规格要求——不多不少。这是两阶段审查中的第一阶段。

**子代理描述标记**: `Furina:review:Purpose`（供 hooks 识别，不可更改）

**模板参数**:
- `{feature-id}` (string): Feature 唯一标识符
- `{feature name}` (string): Feature 功能名称
- `{language}` (string): 输出语言配置
- `{feature.id}`, `{feature.function}`, `{feature.description}`: Feature 基本信息
- `{feature.acceptance_criteria}` (string[]): 验收标准列表
- `{feature.tasks}` (string[]): 任务列表
- `{feature.spec_refs}` (string[]): 规格引用文档路径
- `{feature.files}` (string[]): 可能涉及的文件列表
- `{report from the implementer subagent}` (string): 实现者的报告内容

**Core Logic**:
模板要求子代理执行两步流程：首先读取 `specs-reviewer.md` 规格审查工作指南，然后严格按照该指南执行审查任务。

**Core Code**:
```
Agent tool (general-purpose):
  description: "Furina:review:Purpose Review spec compliance for {feature-id}: {feature name}"
  prompt: |
    You are reviewing spec compliance for {feature-id}: {feature name}.

    **Purpose:** Verify that the implementer built what the spec requires
    — no more, no less. Check against acceptance criteria.

    ## Execution Flow
    Follow these steps strictly and accurately:
    1. Read the spec review template document:
       `${CLAUDE_PLUGIN_ROOT}/skills/furina-sdd/references/specs-reviewer.md`
    2. Strictly follow the steps and requirements of the spec review template to execute the review task
```
Source: `marketplace/skills/furina-sdd/references/specs-reviewer-prompt.md` : 6-43

---

### 规格合规审查子代理工作指南 (specs-reviewer.md)

**Source**: `marketplace/skills/furina-sdd/references/specs-reviewer.md` : 1-93

**Functionality**: 定义规格合规审查子代理的完整审查规范。核心原则是"不信任实现者的报告"——必须独立阅读实际代码并与验收标准逐项对比。审查范围涵盖缺失需求、多余工作、理解偏差和测试覆盖缺口四个维度。

**Parameters** (由 prompt 模板注入):
- Feature 基本信息（ID、名称、描述）
- 验收标准列表
- 任务列表
- 规格引用文档路径
- 变更文件列表
- 实现者报告内容

**Core Logic**:

审查流程的关键原则：

1. **不信任报告原则**: 实现者的报告可能不完整、不准确或过于乐观。审查者必须独立验证一切。
2. **逐项验收标准对比**: 读取实际代码，逐条验收标准检查是否满足
3. **TDD 验证**: 验证每个可测试的验收标准是否有对应测试，测试是否验证行为而非实现
4. **四维度审查**:
   - **缺失需求**: 是否每个验收标准都完全满足？是否有跳过或部分实现的？
   - **多余工作**: 是否构建了验收标准未涵盖的功能？是否过度工程化？
   - **理解偏差**: 是否对某个标准的理解与意图不同？
   - **测试缺口**: 是否有可测试的验收标准没有测试覆盖？

**审查结果**:
- `Spec compliant + tests covered` (所有可测试验收标准满足且有测试覆盖)
- `Issues found` (列出未满足的标准、未测试的标准或多余工作，含 file:line 引用)

**REA LAW**: 禁止执行任何 Git 写操作，仅允许只读 Git 命令

**Core Code**:
```markdown
## Key: Do Not Trust the Report

The implementer finished suspiciously fast. Their report may be incomplete,
inaccurate, or overly optimistic. You must independently verify everything.

**Do NOT:**
- Take their word for what they implemented
- Trust their claims of completeness
- Accept their interpretation of requirements

**MUST:**
- Read the actual code they wrote
- Compare actual implementation against acceptance criteria item by item
- Check for things they claim to have implemented but are missing
- Look for extra features they did not mention
```
Source: `marketplace/skills/furina-sdd/references/specs-reviewer.md` : 28-43

---

### 代码质量审查子代理提示模板 (quality-reviewer-prompt.md)

**Source**: `marketplace/skills/furina-sdd/references/quality-reviewer-prompt.md` : 1-45

**Functionality**: 定义分发代码质量审查子代理时使用的 Agent 工具参数格式。该子代理在规格合规审查通过后执行，专注于代码工程质量——清洁性、可维护性、测试覆盖率。这是两阶段审查中的第二阶段。

**子代理描述标记**: `Furina:review:Purpose`（与规格审查共用同一标记）

**关键约束**: **仅在规格合规审查通过后才能分发。**

**模板参数**: 与规格审查子代理相同，额外包含实现者报告用于上下文。

**Core Logic**:
模板要求子代理执行两步流程：首先读取 `quality-reviewer.md` 代码质量审查工作指南，然后严格按照该指南执行审查任务。

**Core Code**:
```
Agent tool (general-purpose):
  description: "Furina:review:Purpose Review code quality for {feature-id}: {feature name}"
  prompt: |
    You are reviewing the code quality of {feature-id}: {feature name}.

    **Purpose:** Verify that the implementation is well-built (clean, tested, maintainable).
    **Dispatch only after spec compliance review has passed.**

    ## Execution Flow
    Follow these steps strictly and accurately:
    1. Read the code quality review template document:
       `${CLAUDE_PLUGIN_ROOT}/skills/furina-sdd/references/quality-reviewer.md`
    2. Strictly follow the steps and requirements of the code quality review template to execute the review task
```
Source: `marketplace/skills/furina-sdd/references/quality-reviewer-prompt.md` : 6-45

---

### 代码质量审查子代理工作指南 (quality-reviewer.md)

**Source**: `marketplace/skills/furina-sdd/references/quality-reviewer.md` : 1-180

**Functionality**: 定义代码质量审查子代理的完整审查规范，涵盖代码质量、架构、测试、需求、生产就绪性五大维度的审查清单，以及覆盖率验证、TDD 验证和标准化输出格式。

**Core Logic**:

审查流程包含以下核心环节：

1. **用户自定义审查标准获取**:
   ```bash
   furina config show experimental.prompt.reviewCode
   ```
   返回值可能是：路径（读取为技能文件）、技能名称（调用该技能）、或字符串（直接使用）。此值为最高优先级的审查标准。

2. **代码审查范围确定**: 通过 `git diff --name-only` 和 `git ls-files --others --exclude-standard` 获取所有未暂存文件，过滤出当前 Feature 相关文件，使用 `git diff -- <file path>` 获取变更内容。

3. **五维度审查清单**:
   - **代码质量**: 关注分离、错误处理、类型安全、DRY 原则、边界情况
   - **架构**: 设计决策、可扩展性、性能影响、安全漏洞
   - **测试**: 测试是否真正验证逻辑（而非仅 mock）、边界覆盖、集成测试
   - **需求**: 所有计划需求是否满足、是否有范围蔓延、是否有破坏性变更
   - **生产就绪**: 迁移策略、向后兼容、文档完整性、明显 bug

4. **覆盖率验证**: 根据项目类型自动检测并运行覆盖率工具
   - JavaScript/TypeScript: `npm test -- --coverage`
   - Rust: `cargo tarpaulin --out Stdout`
   - Python: `pytest --cov --cov-report=term-missing`
   - Go: `go test -coverprofile=coverage.out ./...`
   - 最低要求：新代码 80% 行覆盖率

5. **TDD 验证**:
   - 能否识别驱动每段实现的失败测试？
   - 测试是否验证行为而非仅验证 mock 交互？
   - 边界情况和错误路径是否被测试？

6. **标准化输出格式**: 包含 Strengths（优势）、Issues（按 Critical/Medium/Minor 分级）、Coverage Verification Result、Suggestions、Assessment（能否合并 + 理由）

**REA LAW**: 禁止执行任何 Git 写操作，仅允许只读 Git 命令

**Core Code** (覆盖率验证):
```bash
# Detect and run the appropriate coverage command
if [ -f "package.json" ]; then
  npm test -- --coverage
elif [ -f "Cargo.toml" ]; then
  cargo tarpaulin --out Stdout
elif [ -f "requirements.txt" ]; then
  pytest --cov --cov-report=term-missing
elif [ -f "go.mod" ]; then
  go test -coverprofile=coverage.out ./...
  go tool cover -func=coverage.out
fi
```
Source: `marketplace/skills/furina-sdd/references/quality-reviewer.md` : 101-114

**Core Code** (输出格式):
```markdown
### Strengths
{What was done well? Be specific.}

### Issues
#### Critical (must fix, otherwise affects system correctness or security)
#### Medium (should fix, otherwise affects code quality or maintainability)
#### Minor (nice to have, does not block merge)

### Coverage Verification Result

### Suggestions

### Assessment
**Can it be merged?** {Yes/No/After fixes}
**Rationale:** {1-2 sentence technical assessment}
```
Source: `marketplace/skills/furina-sdd/references/quality-reviewer.md` : 147-179

---

### 实现者状态处理策略 (important-matters.md)

**Source**: `marketplace/skills/furina-sdd/references/important-matters.md` : 1-79

**Functionality**: 定义了 SDD 的核心设计策略，包括懒加载策略、实现者四种状态的处理方式、以及 SDD 模式的优势分析。

**实现者状态处理**:

实现者子代理可能返回四种状态，控制器必须按以下策略处理：

| 状态 | 含义 | 处理方式 |
|------|------|----------|
| `DONE` | 工作完成 | 进入规格合规审查 |
| `DONE_WITH_CONCERNS` | 完成但有疑虑 | 读取疑虑内容。若涉及正确性/范围则解决后再审查；若为观察性内容则记录后继续 |
| `NEEDS_CONTEXT` | 缺少信息 | 提供缺失上下文后重新分发 |
| `BLOCKED` | 无法完成 | 评估阻塞原因：上下文不足 -> 提供更多上下文重发；需要更强推理 -> 用更强模型重发；功能过大 -> 拆分；计划有误 -> 升级给用户 |

**关键规则**: 永远不要忽略升级请求，不要在不改变任何条件的情况下强制同一模型重试。

**懒加载策略**: 控制器只提供规格文档路径（"地图"），不预加载内容。子代理自行决定何时读取哪些部分（"领地"）。这节省了控制器的 token 消耗，加快了分发速度，并避免信息过载。

**Core Code** (状态处理):
```markdown
**BLOCKED:** The implementer could not complete the feature. Evaluate the blockage:
1. If it's a context issue, provide more context and re-dispatch with the same model
2. If the feature requires more reasoning, re-dispatch with a stronger model
3. If the feature is too large, break it into smaller pieces
4. If the plan itself is wrong, escalate to the human user

**Never** ignore an escalation or force the same model to retry without changes.
```
Source: `marketplace/skills/furina-sdd/references/important-matters.md` : 32-38

---

### 示例工作流 (example-workflow.md)

**Source**: `marketplace/skills/furina-sdd/references/example-workflow.md` : 1-124

**Functionality**: 提供完整的 SDD 执行示例，演示从初始化配置查询到多个 Feature 完整处理的端到端流程。该示例涵盖：配置查询、状态检查、Feature 获取与执行、实现者疑问处理、规格审查循环、质量审查循环、以及最终状态确认。在 SKILL.md 中被标记为执行前必读文档。

**示例覆盖的关键场景**:

1. **配置查询与状态检查**: 展示 `furina config show` 和 `--status/--next` 命令的使用
2. **实现者疑问处理** (auth-001): 实现者询问 token 过期时间 -> 控制者回答 -> 重新分发
3. **规格审查不通过** (auth-001): 审查者发现缺少统一错误消息和多余日志记录 -> 修复 -> 重新审查通过
4. **质量审查通过** (auth-001): 直接通过，无问题
5. **质量审查不通过** (auth-002): 审查者发现魔法数字 3600 -> 提取常量 -> 重新审查通过
6. **完成确认**: 所有 Feature done 后状态显示 100%

## Data Structures

### Feature 数据结构

Feature 数据在 `plan.json` 中定义，由 `furina change feature` 命令管理。SDD 各子代理模板中引用的字段如下：

```
feature:
  id: string           -- Feature 唯一标识符（如 "auth-001"）
  function: string     -- Feature 功能名称（如 "user-login"）
  description: string  -- Feature 详细描述
  acceptance_criteria: string[]  -- 验收标准列表
  tasks: string[]      -- 任务列表
  files: string[]      -- 可能涉及的文件列表（仅为预估，非完整列表）
  spec_refs: string[]  -- 规格引用文档路径列表（如 "furina/changes/<name>/specs/auth/spec.md#login"）
  status: string       -- Feature 状态（pending / in_progress / done / blocked / skipped）
```

### Feature 状态枚举

```
pending      -- 待处理，尚未开始
in_progress  -- 正在处理中
done         -- 已完成（包括通过两阶段审查）
blocked      -- 被阻塞，等待依赖或用户干预
skipped      -- 被跳过
```

### 子代理描述标记枚举

```
Furina:explore:Purpose   -- 参考探索子代理标记（reference-explorer-prompt.md）
Furina:coding:Purpose    -- 实现者子代理标记（code-implementer-prompt.md）
Furina:review:Purpose    -- 审查子代理标记（specs-reviewer-prompt.md / quality-reviewer-prompt.md）
```

这些标记在 hooks 系统中用于识别子代理类型并执行相应的生命周期管理（如 stage 切换）。

### 实现者报告状态枚举

```
DONE             -- 工作完成，可进入审查
DONE_WITH_CONCERNS -- 完成但有疑虑，需评估后决定
NEEDS_CONTEXT    -- 缺少信息，需要控制器提供额外上下文
BLOCKED          -- 无法完成，需要控制器介入处理
```

### 审查结果结构

```
Spec Review Result:
  status: "compliant" | "issues_found"
  missing_requirements: string[]     -- 未满足的验收标准
  extra_work: string[]               -- 多余的未请求功能
  misunderstandings: string[]        -- 对需求的理解偏差
  test_gaps: string[]                -- 测试覆盖缺口（含 file:line 引用）

Quality Review Result:
  strengths: string[]                -- 代码优势
  issues:
    critical: Issue[]                -- 必须修复（影响正确性/安全性）
    medium: Issue[]                  -- 应修复（影响质量/可维护性）
    minor: Issue[]                   -- 可选修复（不阻塞合并）
  coverage_verification: CoverageResult  -- 覆盖率验证结果
  suggestions: string[]              -- 改进建议
  assessment:
    can_merge: "yes" | "no" | "after_fixes"
    rationale: string                -- 技术评估理由
```

## Error Handling and Edge Cases

### plan.json 不存在

当 `furina/changes/<name>/plan.json` 不存在时，SDD 必须停止执行并提醒用户先执行 `furina-plan` 技能生成 plan.json。

### 实现者子代理 BLOCKED 状态

当实现者报告 BLOCKED 时，控制器必须按以下优先级逐级评估：
1. 上下文不足 -> 提供更多上下文并用相同模型重新分发
2. 需要更强推理能力 -> 用更强的模型重新分发
3. Feature 过大 -> 拆分为更小的 Feature
4. 计划本身有误 -> 升级给用户

**关键**: 不可忽略升级请求，不可在不改变任何条件的情况下强制重试。

### 实现者子代理 NEEDS_CONTEXT 状态

控制器需要提供缺失的上下文信息后重新分发。不可催促实现者进入编码阶段。

### 审查循环不收敛

规格审查或质量审查反复不通过时，控制器必须分发新的实现者子代理修复（不可由控制器自行修复以避免污染上下文）。审查-修复-再审查循环必须持续直到通过。

### 子代理提问

实现者子代理在开始编码前可能提问。控制器必须清晰完整地回答，提供额外上下文，并在回答后重新分发全新的实现者子代理。

### 配置开关控制

三个实验性配置开关（`experimental.explore`、`experimental.review.specs`、`experimental.review.code`）控制是否允许分发对应的子代理。当值非 `true` 时，对应的子代理分发步骤被跳过。这是用户强制配置，SDD 不可覆盖。

### Feature 依赖未完成

当 `--next` 返回的 Feature 的依赖尚未完成时，应跳过该 Feature 继续获取下一个。待依赖完成后返回处理。

### 并行分发限制

禁止并行分发多个实现者子代理（会产生文件冲突）。所有子代理必须在前台运行，不可后台化。

## Dependencies

### Depends on（SDD 依赖的技能/模块）

| 依赖 | 用途 | 关系 |
|------|------|------|
| `furina-plan` | 生成 `plan.json` 特性列表 | 必须在 SDD 之前执行，提供输入数据 |
| `furina-tdd` | 被实现者子代理调用，加载 TDD 工作流 | 实现者子代理内强制调用 |
| `furina-explore` | 被参考探索子代理调用，生成参考文档 | `experimental.explore=true` 时通过参考探索子代理调用 |
| `furina-finalize` | 在所有 Feature 完成后调用，执行集成测试和代码库同步 | SDD 完成后自动调用 |
| `furina change feature` CLI 命令 | Feature 状态管理（`--status`/`--next`/`--start`/`--complete`） | 持久化跨会话的 Feature 状态 |
| `furina config show` | 查询技能配置 | 获取语言、实验性开关等配置 |
| hooks 系统 | 通过子代理描述标记（`Furina:*:Purpose`）识别子代理类型 | 管理子代理生命周期（stage 切换） |

### Depended by（依赖 SDD 的技能/模块）

| 依赖者 | 用途 |
|--------|------|
| `workflow` 命令 (`marketplace/commands/workflow.md`) | 在第 5 阶段（Subagent-Driven Development）调用 `furina-sdd` |
| `furina-plan` | plan 完成后提示用户可使用 `furina-sdd` 执行 |

## Usage Examples

### 示例 1：完整的 SDD 执行流程

以下演示从启动 SDD 到完成第一个 Feature 的完整流程：

```markdown
# 步骤 1：检查配置
$ furina config show language experimental.explore experimental.review.specs experimental.review.code
Language: en
Explore: True
Spec review: True
Code quality review: True

# 步骤 2：检查 SDD Plan 状态
$ furina change feature auth --status
Feature List Status:
  Total: 3
  Done: 0
  Pending: 3
Progress: 0.0%

# 步骤 3：获取下一个 Feature
$ furina change feature auth --next
Next feature: auth-001
  Function: user-login
  Description: Implement email/password login

# 步骤 4：标记为 in_progress
$ furina change feature auth --start auth-001

# 步骤 5：分发参考探索子代理 (experimental.explore=true)
[Dispatch reference explorer subagent using reference-explorer-prompt.md]
[Explorer calls furina-explore with exploreType=for-coding]
[Explorer completes, reference docs generated in explore-coding/auth-001/]

# 步骤 6：分发实现者子代理
[Dispatch implementer subagent using code-implementer-prompt.md]
[Implementer reads code-implementer.md, loads furina-tdd, begins TDD cycle]
Implementer: "Before I begin - should tokens expire after 1 hour or 24 hours?"

# 步骤 7：回答疑问，重新分发
You: "1 hour, with refresh token support in a later feature"
[Re-dispatch fresh implementer subagent with answer context]

# 步骤 8：实现者完成
Implementer:
  Status: DONE
  Implemented: login endpoint, 5/5 tests passing
  Self-review: Added brute-force rate limiting
  Files changed: src/auth/login.ts, src/auth/__tests__/login.test.ts

# 步骤 9：分发规格审查 (experimental.review.specs=true)
[Dispatch spec reviewer subagent using specs-reviewer-prompt.md]
Spec reviewer: Issues found:
  - Missing: Unified error message on login failure
  - Extra: Added login logging (not requested)

# 步骤 10：修复并重新审查
[Dispatch fresh implementer to fix spec gaps]
[Re-dispatch spec reviewer]
Spec reviewer: Spec compliant + tests covered

# 步骤 11：分发质量审查 (experimental.review.code=true)
[Dispatch quality reviewer subagent using quality-reviewer-prompt.md]
Code reviewer: Approved. No issues.

# 步骤 12：标记完成
$ furina change feature auth --complete auth-001
$ git add --all
```

Explanation: 此示例展示了 SDD 的完整执行路径，包括配置查询、状态管理、四个子代理的分发顺序、实现者疑问处理、规格审查不通过时的修复循环、以及最终的状态更新。每个 Feature 都经历相同的标准流程。

### 示例 2：控制器与子代理的交互模式

```markdown
# 控制器（SDD 主代理）视角的工作模式：

## 每个 Feature 的标准流程
1. furina change feature <name> --start <id>        # 标记开始
2. Dispatch reference explorer (if explore=true)         # 探索参考
3. Dispatch implementer                                  # 编码实现
4. [Loop if questions] Answer + re-dispatch implementer  # 疑问处理
5. Dispatch spec reviewer (if review.specs=true)         # 规格审查
6. [Loop if issues] Fix implementer + re-dispatch spec   # 修复-审查循环
7. Dispatch quality reviewer (if review.code=true)       # 质量审查
8. [Loop if issues] Fix implementer + re-dispatch quality # 修复-审查循环
9. furina change feature <name> --complete <id>      # 标记完成
10. git add --all                                         # 暂存变更

## 关键约束
- 所有子代理前台运行，不可后台化
- 每次分发使用全新子代理实例（干净上下文）
- 不可自行修复代码（必须通过实现者子代理）
- 审查顺序不可颠倒（先规格后质量）
- 不可跳过已启用的审查步骤
```

Explanation: 此示例从控制器视角展示了 SDD 的交互模式和关键约束，帮助理解控制器如何协调多个子代理角色完成单个 Feature 的处理流程。

### 示例 3：BLOCKED 状态处理

```markdown
# 场景：实现者报告 BLOCKED
Implementer:
  Status: BLOCKED
  Reason: The feature requires choosing between two architectural approaches
  for token storage (in-memory vs Redis). I cannot make this decision.

# 控制器处理策略（按优先级）
# 1. 评估是否为架构决策问题 -> 是
# 2. 架构决策需要用户参与 -> 升级给用户

You: "This is an architectural decision. Which approach do you prefer:
  Option A: In-memory (simpler, not persistent across restarts)
  Option B: Redis (persistent, requires Redis dependency)"

User: "Go with Option A for now."

# 3. 用更新的上下文重新分发实现者
[Re-dispatch implementer with architectural decision context]
```

Explanation: 此示例演示了当实现者报告 BLOCKED 时，控制器如何评估阻塞原因并按优先级策略处理。对于需要架构决策的情况，升级给用户做出选择后重新分发。
