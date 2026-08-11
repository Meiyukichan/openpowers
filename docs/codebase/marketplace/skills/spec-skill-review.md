# Skill: furina-review

> Source files:
> - `marketplace/skills/furina-review/SKILL.md` : 1-69
> - `marketplace/skills/furina-review/instructions/review-propose.md` : 1-166
> - `marketplace/skills/furina-review/instructions/review-plan.md` : 1-243

## Overview

furina-review 是 Furina 工作流中的制品质量审查技能。它通过调度一个独立的 review 子代理（SubAgent），对 `furina/changes/<name>/` 目录下的变更制品进行系统性质量审查，捕获实施者容易忽略的问题 -- 需求偏差、设计缺陷、计划遗漏、代码质量问题，并自动修复这些问题。

**系统中的定位与作用：**
- 该技能位于 Furina 工作流的 Propose 和 Plan 两个阶段之后，是进入实际实施（SDD/TDD）之前的最后一道质量关卡。
- 审查者提供独立于实施者的质量检查线，通过审查后可对下一步操作充满信心。
- 该技能不直接读取任何文档，而是将所有文档读取和审查工作委托给独立的 review 子代理执行。

**设计动机：**
- 在进入代码实施之前，需要一个自动化的质量门禁来确保提案、设计和计划的完整性和一致性。
- 审查采用"审查即修复"模式：不仅发现问题，还自动创建修复任务并逐一修复，确保产出的制品质量达标。
- 通过父技能不读取文档的红线规则，强制文档读取在子代理上下文中发生，确保审查上下文的隔离性。

**涉及的源文件及各自职责：**
- `SKILL.md`（1-69）：技能入口，负责参数校验、配置查询、审查子代理调度
- `instructions/review-propose.md`（1-166）：提案审查指令，定义对 proposal.md、design.md、specs 的审查清单和修复流程
- `instructions/review-plan.md`（1-243）：计划审查指令，定义对 plan.json 的字段合规性、依赖排序、上游一致性等审查清单和修复流程

## Architecture / Flow

### 整体执行流程

```
用户触发 review 技能
    |
    v
[SKILL.md] 参数校验 (change 目录)
    |
    v
[SKILL.md] 配置查询 (furina config show language experimental.review.furina)
    |
    v
[SKILL.md] 检查 experimental.review.furina 开关
    |--- 非 true --> 立即终止，不执行审查
    |
    v
[SKILL.md] 调度 review 子代理 (Agent tool, description: "Furina:review:Purpose ...")
    |
    v
[子代理] 顺序执行两条指令:
    |
    |--- 1. 执行 review-propose.md (提案审查)
    |       |
    |       v
    |    读取 proposal.md, design.md, specs/**/*.md
    |       |
    |       v
    |    按审查清单逐项检查 (4大类)
    |       |
    |       v
    |    校准: 仅标记会导致后续规划偏离的问题
    |       |
    |       v
    |    收集 Critical + Medium 问题
    |       |
    |       v
    |    创建修复任务列表 --> 逐一修复 --> 输出 "All passed"
    |
    |--- 2. 执行 review-plan.md (计划审查)
            |
            v
         读取 plan.json (主要) + proposal.md, design.md, specs (参考)
            |
            v
         按审查清单逐项检查 (7大类)
            |
            v
         校准: 仅标记会在实施中导致实际问题的问题
            |
            v
         收集 Critical + Medium 问题
            |
            v
         创建修复任务列表 --> 逐一修复 --> 输出 "All passed"
```

### 关键设计决策

1. **两阶段顺序审查**：先审查提案制品（方向正确性），再审查计划制品（执行可行性）。提案审查通过后才进入计划审查，确保"方向正确"优先于"执行细节"。
2. **审查即修复**：不只输出审查报告，而是自动创建修复任务并逐一修复，最终只能输出 "All passed"。
3. **三级严重性分类**：Critical（必须修复）、Medium（应当修复）、Minor（跳过不修）。自动修复仅覆盖 Critical 和 Medium。
4. **校准原则**：两份审查指令都明确给出了"会触发的问题"和"不会触发的问题"示例，避免过度审查导致不必要的返工。
5. **父技能不读文档**：SKILL.md 红线规则强制所有文档读取在子代理上下文中进行。

## Functionality / Interface Details

### `SKILL.md: Skill Entry & Review Dispatch`

**Source**: `marketplace/skills/furina-review/SKILL.md`:1-69

**Functionality**: 技能的入口文件。负责接收用户输入、查询配置、校验开关状态，并调度 review 子代理执行实际审查工作。该文件本身不包含任何审查逻辑，仅作为调度器存在。

#### 参数校验

技能接收一个必需参数：

**Parameters**:
- `Change Directory (change)` (`String`, 必需): 变更目录路径，格式为 `furina/changes/<name>/`。如果缺失，必须使用 `AskUserQuestion` 工具向用户询问。

#### 配置查询机制

通过 `furina config show` 命令查询技能配置：

```bash
furina config show language experimental.review.furina
```

**返回值**（按顺序）：
- `language` (`String | None`): 输出语言，用于技能中所有面向用户的输出。如果为 None，默认使用中文。
- `experimental.review.furina` (`Boolean`): 审查开关。如果此值不是 `true`，必须立即终止技能，不执行任何审查操作。这是强制性的用户配置项。

**Core Logic**:
1. 解析返回的两个配置值。
2. 如果 `experimental.review.furina` 不为 `true`，立即终止整个审查流程。
3. 将 `language` 值传递给子代理，用于所有输出的语言适配。

**Usage Example**:
```bash
# 查询配置
furina config show language experimental.review.furina
# 返回示例: "English" "true"
# 表示: 输出语言为 English，审查开关已启用
```
Explanation: 查询两个配置值，确认审查功能已启用，并获取输出语言偏好。

---

### `SKILL.md: Review SubAgent Dispatch`

**Source**: `marketplace/skills/furina-review/SKILL.md`:33-63

**Functionality**: 构造 review 子代理的调度参数，通过 Agent tool 发起子代理调用。子代理接收完整的审查上下文和指令，顺序执行提案审查和计划审查。

**Parameters**（通过 Agent tool prompt 传递）:
- `language` (`String`): 输出语言，从配置查询获得
- `change name` (`String`): 变更名称，从 change 目录路径中提取
- `furina/changes/<name>/` (`String`): 变更目录完整路径
- `current project path` (`String`): 当前项目路径

**Core Logic**:
调度子代理时，prompt 中包含以下关键部分：

1. **Language Adaptation**：将 `language` 值传递给子代理，用于输出语言适配。
2. **Execution Instructions**：严格指示子代理先执行 `review-propose.md`，完成后才执行 `review-plan.md`。
3. **Instruction Documents**：通过 `${CLAUDE_PLUGIN_ROOT}` 变量引用指令文件路径。
4. **RED LAW**：两条红线规则：
   - 渐进式文档读取：仅在即将执行某条指令时才允许读取该指令文档
   - 禁止运行任何 git 命令

**Core Code**:
```markdown
Agent tool (general-purpose):
  description: "Furina:review:Purpose Review Furina Artifacts: {change name <name>}"
  prompt: |
    You are reviewing Furina artifacts: {change name <name>}

    ## Language Adaptation
    Output language for this review: {`language` or Chinese}

    ## furina change
    {`furina/changes/<name>/`}

    ## Current project path
    {current project path}

    ## Execution Instructions
    You **MUST** strictly and accurately execute the following instruction document step by step:

    1. execute `Propose Review Instruction`, and wait util this instruction executes completely.
    2. execute `Plan Review Instruction` after the completation of `Propose Review Instruction`.

    ### Instruction Documents
    - `Propose Review Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-review/instructions/review-propose.md`
    - `Plan Review Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-review/instructions/review-plan.md`

    ## RED LAW
    - Progressive Document Reading: ONLY ALLOW reading the instruction document WHEN you are about to execute that instruction.
    - MUST NOT run ANY git commands: you must never run any git commands.
```
Source: `marketplace/skills/furina-review/SKILL.md`:36-63

**Usage Example**:
```
用户输入: "review furina artifacts for change my-feature"
技能调度: Agent tool with description "Furina:review:Purpose Review Furina Artifacts: my-feature"
子代理接收完整 prompt 后，依次执行 review-propose.md 和 review-plan.md
```
Explanation: 用户触发审查后，技能构造子代理调度参数，子代理独立执行两个阶段的审查和修复。

---

### `review-propose.md: Proposal Review Instruction`

**Source**: `marketplace/skills/furina-review/instructions/review-propose.md`:1-166

**Functionality**: 定义提案审查的完整指令集。审查子代理按照此指令对提案阶段的三类制品（proposal.md、design.md、specs/**/*.md）进行系统性质量检查，并自动修复发现的问题。审查目标是确保方向正确、需求清晰、设计可行，使后续的详细规划不会偏离方向。

**审查范围**（必须全部读取）：
1. `furina/changes/<name>/proposal.md` -- 提案：做什么 & 为什么做
2. `furina/changes/<name>/design.md` -- 设计：怎么做、技术方案
3. `furina/changes/<name>/specs/**/*.md` -- 各功能模块的详细规格

**审查清单结构**（4 大类）：

**I. proposal.md 审查维度**：
- **动机与背景**：变更原因是否清晰、利益相关者是否识别、是否有量化成功指标
- **范围定义**：边界是否明确、是否有非目标声明、是否存在范围蔓延
- **影响分析**：对现有系统的影响、破坏性变更及迁移策略、上下游依赖
- **风险与替代方案**：关键技术风险及缓解计划、替代方案的权衡分析

**II. design.md 审查维度**：
- **技术方案**：架构是否合理、核心数据结构和算法描述、关键接口定义
- **约束与权衡**：非功能需求（性能、安全、可扩展性）、技术权衡记录、与现有系统的集成方案
- **可行性**：设计是否具体到足以直接指导实施、是否存在模糊部分、是否存在明显不可行的设计决策

**III. specs/**/*.md 审查维度**：
- **需求完整性**：是否覆盖所有必要场景（正常流、异常流、边界情况）
- **可验证性**：每个需求是否有客观可测的验收条件
- **一致性**：不同 spec 之间的概念定义和术语是否统一

**IV. 跨文档一致性**：
- proposal.md 与 design.md 的技术方案是否一致
- design.md 与 specs 的接口/行为定义是否一致
- 命名和定义在不同文档间是否统一

**Core Logic -- 校准原则**:

审查指令明确定义了"会标记的问题"和"不会标记的问题"，防止过度审查：

会标记的问题示例：
- 模糊的需求导致不同实施者有不同理解
- 设计存在明显技术缺陷或不可行性
- 文档间矛盾（设计说用 A，规格描述 B）
- 关键边界情况未考虑（空数据、并发冲突、权限等）

不会标记的问题示例：
- 措辞可以更优雅
- 文档风格偏好
- "增加更多细节总是更好"类型的建议
- 不影响理解的轻微错别字
- 非关键的功能建议
- design.md 中缺少 API 或数据库表设计细节（提案阶段一般不涉及这些）

**Core Logic -- 严重性分类**:

| 级别 | 定义 | 示例 |
|------|------|------|
| Critical | 必须修复，否则规划必然偏离 | 需求矛盾、设计不可行、关键功能完全遗漏 |
| Medium | 应当修复，会影响后续规划或实施质量 | 需求模糊、设计缺陷、任务遗漏、跨文档不一致 |
| Minor | 可有可无，不阻碍进入规划 | 措辞清晰度、文档组织、补充建议 |

**Core Logic -- 修复后处理流程**:

1. **收集问题**：自动收集所有 Medium 及以上问题（Critical + Medium），Minor 问题跳过不修
2. **创建修复任务列表**：使用任务管理工具，每个修复项为独立任务
3. **逐一修复**：按任务列表顺序，定位对应文件 -> 读取上下文 -> 执行修改 -> 标记完成
4. **完成审查**：所有修复任务完成后，输出审查总结。**注意：子代理只能输出 "All passed"，不允许输出失败结果**

**Output Format**:
```markdown
### Review Result
All passed

### Review Issues and Fix Results
{逐个列出: 简要问题描述 (文档引用), 应用了什么修复, 修复成功}
```

---

### `review-plan.md: Plan Review Instruction`

**Source**: `marketplace/skills/furina-review/instructions/review-plan.md`:1-243

**Functionality**: 定义计划审查的完整指令集。审查子代理按照此指令对 plan.json 进行逐字段合规性检查、与上游制品的一致性交叉验证、依赖拓扑排序正确性验证等，并自动修复发现的问题。审查目标是确保计划完整、可执行、与上游制品一致。

**审查范围**：

- **主要文件（必须读取）**：
  1. `furina/changes/<name>/plan.json` -- 计划 JSON（核心审查对象）

- **参考文件（必须读取用于一致性校验）**：
  2. `furina/changes/<name>/proposal.md` -- 提案文档
  3. `furina/changes/<name>/design.md` -- 设计文档
  4. `furina/changes/<name>/specs/**/*.md` -- 功能模块规格

- **辅助文件（存在则读取）**：
  5. `furina/changes/<name>/api.yaml` -- API 定义
  6. `furina/changes/<name>/database.md` -- 数据库设计

**Feature Factor（特性预算因子）**：

通过 `furina config show experimental.factor` 查询，默认值 0.5，最大值 3。控制 plan.json 中允许的最大特性数量：

> plan.json 中的特性数量 <= feature factor x specs/ 目录下的 spec 文件数量（最少为 1）

**审查清单结构**（7 大类）：

**I. JSON 结构与字段合规性**：

对 plan.json 中每个特性（feature）的 9 个字段逐一审查：

| 字段 | 必需 | 审查要点 |
|------|------|---------|
| `id` | 是 | 唯一性、格式一致性（如 `{category-prefix}-{number}`）、dependencies 中引用的 id 是否存在 |
| `category` | 是 | 分类合理性、粒度适当性、同类别特性是否形成内聚整体 |
| `function` | 是 | 是否简洁具体、描述"做什么"而非"怎么做" |
| `description` | 是 | 是否为实施代理提供足够上下文、是否过度详细（包含代码级实现细节）、是否有模糊部分 |
| `acceptance_criteria` | 是 | 非空、每条标准是否客观可验证、是否覆盖成功路径和失败路径、与 spec 中的验收条件是否一致 |
| `tasks` | 是 | 完成该特性需要执行的任务列表 |
| `files` | 是 | 非空、路径是否具体（不允许通配符）、数量是否合理（通常 2-5 个）、是否遵循项目目录规范 |
| `dependencies` | 是 | 始终为有效数组、引用的 id 是否存在、依赖关系是否真实需要、是否存在循环依赖 |
| `spec_refs` | 是 | 非空、是否包含所有相关的 specs/ 文档、是否包含 design.md、引用路径是否有效 |
| `status` | 是 | 值是否有效（pending/in_progress/done/skipped/blocked）、新建计划应全部为 pending |

**II. 特性粒度**：
- 每个特性是否为可独立测试的工作单元
- 是否小到足以在一次专注会话中完成，又大到足以交付有意义的独立价值
- 过粗示例："认证系统"（应拆分为登录、注册、密码重置等）
- 过细示例："在 auth 模块添加 `import jwt`"（无独立价值）

**III. 依赖排序（拓扑排序）**：
- 特性是否按拓扑序排列（数组中每个特性的 dependencies id 必须出现在其前面）
- 是否存在循环依赖
- 无依赖的特性是否合理利用并行性

**IV. Spec 覆盖率**：
- 对照 specs/**/*.md 和 design.md，计划是否覆盖所有需求
- 每个重要需求是否在计划中有对应特性
- 设计文档中的关键决策是否体现在相应特性中
- 是否存在范围蔓延（计划中有但 spec 中未追溯的特性）

**V. 文件路径一致性**：
- 不同特性引用的文件路径是否一致（如特性 A 创建 `src/auth/login.ts`，特性 B 使用 `src/auth/login.ts` -- 路径必须精确匹配）
- 每个文件是否有明确的归属（主要由一个特性创建）
- 创建者和消费者路径是否匹配

**VI. 验收标准质量**：
- 每条标准是否客观可验证
- 好示例："错误密码返回 401 Unauthorized"
- 坏示例："认证正常工作"
- 是否避免模糊术语（"正确"、"适当"、"合理"、"快速"等不可量化术语）
- 关键特性是否同时包含正面标准（成功场景）和负面标准（失败/边界场景）

**VII. 与上游制品的一致性**：
- 描述是否与 design.md 中的技术方向一致
- 验收标准是否与 specs 中的需求定义一致
- proposal.md 中定义的范围是否被完整覆盖，无遗漏或溢出

**Core Logic -- 校准原则**:

会标记的真实问题示例：
- dependencies 引用不存在的特性 id（执行顺序会出错）
- 重复的特性 id（无法唯一标识任务）
- 循环依赖导致"先做什么"的死锁
- 特性过大，涵盖过多文件（15+）-- 实施代理会在中途迷失
- 关键 spec 需求没有对应特性（功能必然遗漏）
- 模糊的验收标准无法验证（"系统正常" -- 实施者不知道何时算完成）
- 依赖排序错误 -- 特性出现在其依赖之前
- 文件路径使用通配符模式，范围不确定

不会标记为问题的示例：
- 缺少一两个 spec_refs（不影响执行）
- 特性顺序可以略有不同（不影响依赖正确性）
- 描述措辞可以更优雅
- 列出了不必要的依赖（多等一步不会破坏任何东西）
- 验收标准措辞可以更精确但已经可验证

**Core Logic -- 严重性分类**:

| 级别 | 定义 | 示例 |
|------|------|------|
| Critical | 必须修复，否则实施必然出错 | 依赖链断裂、循环依赖、缺少/重复 id、关键特性缺失、特性完全不可执行 |
| Medium | 应当修复，影响实施质量和效率 | 粒度不当、验收标准模糊、文件路径问题、上游不一致 |
| Minor | 可有可无，不阻碍进入实施 | 描述措辞、spec_refs 补充、排序调整 |

**Core Logic -- 修复后处理流程**:

与提案审查相同：收集 Medium+ 问题 -> 创建修复任务列表 -> 逐一修复 -> 输出 "All passed"。**注意：子代理只能输出 "All passed"，不允许输出失败结果。**

**Output Format**:
```markdown
### Review Result
All passed

### Review Issues and Fix Results
{逐个列出: 简要问题描述 (特性 id), 如何修复的, 修复成功}
```

---

## Data Structures

### `plan.json Feature Schema`

plan.json 是一个 JSON 数组，每个元素代表一个特性（feature），包含以下字段：

```json
{
  "id": "{category-prefix}-{number}",
  "category": "模块/子系统名称",
  "function": "特性名称（简洁具体）",
  "description": "做什么 -- 为代理提供足够上下文，不含代码",
  "acceptance_criteria": ["可验证的条件列表"],
  "tasks": ["完成该特性需要执行的任务"],
  "files": ["具体文件路径（不允许通配符）"],
  "dependencies": ["特性 id 列表（拓扑排序引用）"],
  "spec_refs": ["上游制品引用路径"],
  "status": "pending | in_progress | done | skipped | blocked"
}
```

- `id` (`String`): 唯一标识符，格式为 `{category-prefix}-{number}`
- `category` (`String`): 特性所属的模块或子系统
- `function` (`String`): 特性名称，描述"做什么"而非"怎么做"
- `description` (`String`): 详细描述，为实施代理提供上下文，但不含代码级实现细节
- `acceptance_criteria` (`String[]`): 客观可验证的验收条件列表
- `tasks` (`String[]`): 任务列表
- `files` (`String[]`): 将创建或修改的具体文件路径
- `dependencies` (`String[]`): 必须先完成的特性 id 列表
- `spec_refs` (`String[]`): 上游制品引用，至少应包含 `design.md`
- `status` (`String`): 特性状态，默认为 `pending`

### `Review Issue Severity Enum`

```markdown
Critical  -- 必须修复，否则后续阶段必然出错
Medium    -- 应当修复，影响实施质量和效率
Minor     -- 可有可无，不阻碍进入下一阶段
```

- `Critical`: 导致后续流程（规划或实施）必然失败的严重问题。自动修复。
- `Medium`: 影响后续流程质量或效率的问题。自动修复。
- `Minor`: 不影响核心流程的改善性建议。跳过不修。

### `Review Output Format`

```markdown
### Review Result
All passed

### Review Issues and Fix Results
{逐个列出: 简要问题描述 (文档引用/特性 id), 修复方式, 修复成功}
```

- 审查结果始终为 "All passed"（审查即修复，修复后一定通过）
- 问题列表记录所有被发现并修复的 Critical 和 Medium 问题

## Error Handling and Edge Cases

### 开关检查
- `experimental.review.furina` 不为 `true` 时，技能必须立即终止，不执行任何审查操作。这是强制性的用户配置检查。

### 参数缺失
- 如果必需参数 `change`（变更目录）缺失，必须使用 `AskUserQuestion` 工具向用户询问，而不是静默失败或使用默认值。

### 渐进式文档读取
- 子代理在 RED LAW 规则下，仅在即将执行某条指令时才允许读取该指令文档。这避免了提前加载所有指令导致的上下文混乱。

### 禁止 git 操作
- 子代理被明确禁止运行任何 git 命令。审查和修复仅涉及文件内容的读取和修改，不涉及版本控制操作。

### 审查结果限制
- 两份审查指令都明确要求子代理只能输出 "All passed"，不允许输出失败结果。这意味着审查的预期行为是：发现问题 -> 自动修复 -> 全部通过。

### 文档不存在
- 审查清单说明：只有实际存在的文件才需要审查。缺失某种类型的文档本身不构成问题（除非 plan.json 引用了该文档）。提案阶段可能不包含独立的 spec 文件、api.yaml 或 database.md。

### 过度审查防护
- 两份指令都通过 Calibration 部分明确列出"会标记的问题"和"不会标记的问题"示例，防止审查者将风格偏好、措辞优化等 Minor 建议升级为阻塞性问题。

## Dependencies

### Depends on
- **furina config**: 通过 `furina config show` 查询 `language`、`experimental.review.furina`、`experimental.factor` 配置
- **Agent tool**: 用于调度 review 子代理
- **AskUserQuestion tool**: 用于在参数缺失时向用户询问
- **Task management tool**: 子代理在修复阶段用于创建和管理修复任务列表
- **变更制品**: `furina/changes/<name>/` 目录下的 proposal.md、design.md、specs/**/*.md、plan.json（由上游技能 furina-propose 和 furina-plan 生成）

### Depended by
- **furina:workflow**: 工作流在 Review Artifacts 阶段调用此技能，作为进入 SDD 实施之前的质量门禁
- **furina-finalize**: 虽然 finalize 不直接依赖 review，但 review 的通过是进入 SDD 的前提，而 SDD 完成后才进入 finalize

## Usage Examples

### 完整审查流程示例

```
# 用户触发审查
用户: "review furina artifacts for change user-auth"

# 1. 技能入口 (SKILL.md) 执行配置查询
$ furina config show language experimental.review.furina
> English true

# 2. 配置校验通过，调度子代理
Agent tool:
  description: "Furina:review:Purpose Review Furina Artifacts: user-auth"
  prompt: |
    You are reviewing Furina artifacts: user-auth
    ## Language Adaptation
    Output language for this review: English
    ## furina change
    furina/changes/user-auth/
    ## Current project path
    D:/project-code/llm/furina/src
    ## Execution Instructions
    1. execute Propose Review Instruction
    2. execute Plan Review Instruction
    ...

# 3. 子代理执行提案审查 (review-propose.md)
#    - 读取 proposal.md, design.md, specs/**/*.md
#    - 按4大类审查清单检查
#    - 发现 1 个 Medium 问题: "proposal.md 中未说明与现有认证模块的集成策略"
#    - 自动修复: 在 proposal.md 的 Impact Analysis 部分补充集成说明
#    - 输出: All passed

# 4. 子代理执行计划审查 (review-plan.md)
#    - 读取 plan.json + 上游制品
#    - 按7大类审查清单检查
#    - 发现 1 个 Critical 问题: "feature auth-3 的 dependencies 引用了不存在的 id auth-5"
#    - 自动修复: 将 dependencies 修正为 ["auth-2"]
#    - 输出: All passed
```

Explanation: 完整展示了从用户触发到两阶段审查再到自动修复的全流程。提案审查确保方向正确，计划审查确保执行可行。两个阶段都采用"审查即修复"模式，最终输出全部通过。

### 开关未启用时的行为

```
# 用户触发审查
用户: "review furina artifacts for change user-auth"

# 配置查询
$ furina config show language experimental.review.furina
> English false

# 审查开关未启用，技能立即终止
# 不执行任何审查操作，不调度子代理
```

Explanation: 当 `experimental.review.furina` 不为 `true` 时，技能在入口处即终止，不会进行任何审查操作。这是用户必须显式启用的配置项。
