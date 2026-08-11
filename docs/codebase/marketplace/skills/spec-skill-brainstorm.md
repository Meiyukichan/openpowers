# Skill: furina-brainstorm

> Source files:
> - `marketplace/skills/furina-brainstorm/SKILL.md` : 1-317

## Overview

furina-brainstorm 是 Furina 工作流中的**思考伙伴技能（Thinking Partner Skill）**，用于在需求探索阶段提供头脑风暴能力。它不遵循固定的工作流程，而是一种**姿态（stance）**：以好奇、开放、可视化、适应性强且耐心的方式，帮助用户厘清需求、调查问题、比较方案。

**在系统中的定位**：brainstorm 是 Furina 6 阶段工作流中 **Phase 2: Propose** 的前置步骤。当工作流进入 propose 阶段时，系统首先调用 furina-brainstorm 对齐需求，然后才调用 furina-propose 创建正式的变更提案。在 hooks 层面，`--before-propose` hook 会在 propose 阶段开始时自动将 `settings.json` 中的 `brainstorm` 标志设为 `true`，并在 change 管理系统中记录 brainstorm 阶段状态。

**设计动机**：软件开发中最昂贵的浪费是"构建了错误的东西"。brainstorm 技能通过在正式化之前花时间思考、提问和可视化，确保后续的 proposal、design、specs 都建立在正确的理解之上。

**使用场景**：
- 用户有一个模糊的想法，需要探索问题空间
- 用户遇到具体问题，需要调查代码库、比较方案
- 用户在实现过程中遇到阻塞，需要讨论替代路径
- 用户想要对比技术选型（如数据库选择、框架选择）
- workflow 的 propose 阶段自动触发（作为需求对齐步骤）

**涉及文件及职责**：
- `marketplace/skills/furina-brainstorm/SKILL.md`：完整的技能定义，包含姿态定义、行为规则、Furina 集成、守卫规则等所有内容
- `marketplace/scripts/furina_hooks.js`：hooks 层面的 brainstorm 模式管理（启用/禁用 brainstorm 标志、问题捕获）
- `marketplace/hooks/hooks.json`：hook 触发配置（`--before-propose` 触发 brainstorm 启用）
- `marketplace/commands/workflow.md`：workflow 层面的 brainstorm 调用编排

## Architecture / Flow

### 整体调用链

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Phase 2: Propose                     │
│                  (workflow.md - Phase Execution)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               markBeginPropose MCP Tool Call                     │
│         ┌───────────────────────────────────────┐               │
│         │  PreToolUse Hook: --before-propose     │               │
│         │  1. agents init (session初始化)         │               │
│         │  2. agents switch (切换到propose阶段)   │               │
│         │  3. settings.json: brainstorm = true   │               │
│         │  4. change stage brainstorm            │               │
│         └───────────────────────────────────────┘               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Skill: furina-brainstorm (SKILL.md)             │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │  姿态层   │  │  行为指南层   │  │  Furina 集成层     │    │
│  │          │  │              │  │                        │    │
│  │· 好奇    │  │· 探索问题空间 │  │· 检查活跃change         │    │
│  │· 开放    │  │· 调查代码库   │  │· 读取exploration.md     │    │
│  │· 可视化  │  │· 比较方案     │  │· 读取已有制品            │    │
│  │· 适应    │  │· 可视化思考   │  │· 提议捕获决策            │    │
│  │· 耐心    │  │· 发现风险     │  │· 对齐后提议proposal     │    │
│  │· 接地    │  │              │  │                        │    │
│  └──────────┘  └──────────────┘  └────────────────────────┘    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  守卫规则层                                                │   │
│  │  · 不写代码  · 不假装理解  · 不猜测  · 不催促              │   │
│  │  · 不强制结构 · 不自动捕获 · 要可视化 · 要检查exploration  │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              AskUserQuestion (是否继续创建制品)                   │
│         ┌───────────────────────────────────────┐               │
│         │  PreToolUse Hook: --before-question    │               │
│         │  检查 brainstorm 标志                   │               │
│         │  如为 true: 捕获问题到 question.json    │               │
│         └───────────────────────────────────────┘               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Skill: furina-propose                           │
│         ┌───────────────────────────────────────┐               │
│         │  handleChangeInstructionProposal       │               │
│         │  settings.json: brainstorm = false     │               │
│         │  change stage propose                  │               │
│         └───────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

### brainstorm 会话生命周期

1. **激活**：当 workflow 进入 propose 阶段，`--before-propose` hook 将 `settings.json` 的 `brainstorm` 字段设为 `true`，并将 change 阶段记录为 `brainstorm`。
2. **执行**：brainstorm 技能按照其姿态规则与用户交互，自由探索、提问、可视化。
3. **问题捕获**：在 brainstorm 模式激活期间，每当 `AskUserQuestion` 工具被调用，`--before-question` hook 会自动将问题追加到 `question.json` 中，形成对话记录。
4. **结束**：当用户确认对齐完成，workflow 调用 furina-propose 时，`handleChangeInstructionProposal` 将 brainstorm 标志设为 `false`，结束 brainstorm 模式。

## Functionality / Interface Details

### `Stance Definition` (姿态定义)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:18-27

**Functionality**: 定义了 brainstorm 技能的六项核心姿态，这些姿态决定了 AI 在 brainstorm 模式下的行为方式。这不是一个工作流步骤，而是一种持续性的人格特质，贯穿整个交互过程。

**六项姿态**:
- **Curious（好奇，非说教）**：自然地提出从对话中涌现的问题，而非遵循脚本
- **Open threads（开放线索，非审讯）**：呈现多个有趣的方向，让用户选择共鸣的路径，不将用户限制在单一提问路径中
- **Align first, ask before assuming（先对齐，问而不猜）**：最重要的姿态。主要职责是对齐用户需求，而非自行推断。不确定时必须使用 `AskUserQuestion` 工具，提供 2-3 个具体候选选项并允许用户自定义回答。欢迎用户挑战 AI 的理解
- **Visual（可视化）**：自由使用 ASCII 图表帮助厘清思考
- **Adaptive（适应性）**：跟随有趣的线索，在新信息出现时转换方向
- **Patient（耐心）**：不急于下结论，让问题的形状自然浮现
- **Grounded（接地）**：先检查 exploration.md，再根据需要探索实际代码库，而非纯理论推演

**Core Logic**:
这些姿态通过 SKILL.md 的 The Stance 章节定义，在技能激活时作为 system prompt 的一部分注入到 AI agent 的行为约束中。其中 "Align first, ask before assuming" 被独立强化为一个红色法则（REA LAW），在 SKILL.md 的开头（第 14 行）单独声明，要求 AI 在做任何设计决策或实现选择时必须通过 `AskUserQuestion` 询问用户。

**Core Code** (SKILL.md 姿态定义):
```markdown
- **Curious, not prescriptive** - Ask questions that emerge naturally, don't follow a script
- **Open threads, not interrogations** - Surface multiple interesting directions and let the user follow what resonates. Don't funnel them through a single path of questions.
- **Align first, ask before assuming** - This is the most important stance. Your primary job is to align with the user's needs, not to infer them yourself. **Ask plenty of questions. Seek clarification relentlessly.** Guessing is the biggest waste of the user's time — any time you are uncertain about the user's intent, goals, constraints, or preferences, you **must** use `AskUserQuestion` directly. Provide 2-3 concrete candidate options and let the user also type a custom answer. Actively invite discussion and feedback, and **welcome the user to challenge your understanding**.
- **Visual** - Use ASCII diagrams liberally when they'd help clarify thinking
- **Adaptive** - Follow interesting threads, pivot when new information emerges
- **Patient** - Don't rush to conclusions, let the shape of the problem emerge
- **Grounded** - Check exploration.md first, then explore the actual codebase when needed — don't just theorize
```
Source: `marketplace/skills/furina-brainstorm/SKILL.md`:20-27

---

### `REA LAW` (红色法则)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:14

**Functionality**: 一条强制性约束，在技能定义的最前端声明，确保 AI 不会自行做出设计决策或实现选择。此法则独立于姿态定义存在，因为它的重要性需要超越常规姿态强调。

**Core Logic**:
REA LAW 要求：AI 不得自行做出设计决策或实现选择，必须使用 `AskUserQuestion` 询问用户，提供 2-3 个候选选项，同时允许用户自定义回答。此法则确保 brainstorm 过程中的所有关键决策都经过用户确认。

**Core Code**:
```markdown
**REA LAW**: You should not make design decisions or implementation choices on your own. You MUST use `AskUserQuestion` to ask for the user's opinion, providing 2-2 candidate options, while also allowing the user to provide a custom answer. For example: 'Which framework do you prefer? What features should be implemented? Should the backend use a database?...'
```
Source: `marketplace/skills/furina-brainstorm/SKILL.md`:14

---

### `Language Adaptation` (语言适配)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:30-38

**Functionality**: 通过执行 `furina config show language` 命令获取项目配置的语言设置，确保 brainstorm 的所有用户面向输出使用正确的语言。如果命令失败或无输出，回退到中文。

**Core Logic**:
1. 通过 Bash 工具执行 `furina config show language`
2. 读取返回的 `language` 值
3. 将该语言作为所有用户面向响应和输出的默认语言
4. 如果获取失败，回退到中文

**Core Code**:
```markdown
## Language Adaptation

Query the plugin's required output language using the following script:

```bash
furina config show language
```

- `language`: This skill **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or falls back to Chinese.
```
Source: `marketplace/skills/furina-brainstorm/SKILL.md`:30-38

---

### `Brainstorm Activities` (头脑风暴活动)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:40-91

**Functionality**: 定义了 brainstorm 模式下 AI 可能执行的四大类活动，每类活动包含多个具体行为。这些不是必须执行的步骤，而是根据用户带来的内容自然选择的活动集合。

**四类活动**:

1. **Brainstorm the problem space（探索问题空间）**
   - 提出从用户描述中涌现的澄清性问题
   - 挑战假设
   - 重新构建问题
   - 寻找类比

2. **Investigate the codebase（调查代码库）**
   - 先检查 `furina/changes/<name>/exploration.md` 获取已有上下文
   - 映射与讨论相关的现有架构
   - 发现集成点
   - 识别已在使用的模式
   - 发现隐藏的复杂性

3. **Compare options（比较方案）**
   - 头脑风暴多种实现路径
   - 检查技术栈和技术细节
   - 构建比较表格
   - 草拟权衡分析
   - 推荐路径（仅在被要求时）

4. **Visualize（可视化）**
   - 使用 ASCII 图表进行系统图、状态机、数据流、架构草图、依赖图、比较表格等可视化表达

**Core Code**:
```markdown
## What You Might Do

Depending on what the user brings, you might:

**Brainstorm the problem space**
- Ask clarifying questions that emerge from what they said
- Challenge assumptions
- Reframe the problem
- Find analogies

**Investigate the codebase**
- Check `furina/changes/<name>/exploration.md` first ...
- Map existing architecture relevant to the discussion
- Find integration points
- Identify patterns already in use
- Surface hidden complexity
```
Source: `marketplace/skills/furina-brainstorm/SKILL.md`:40-91

---

### `Furina Awareness` (Furina 感知)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:94-154

**Functionality**: 定义了 brainstorm 技能如何感知和集成 Furina 系统上下文。这包括检查活跃变更、读取已有制品、引用已有上下文、以及在决策形成后提议捕获到合适的制品中。

**Core Logic**:

该功能分为两个分支路径：

**路径 A —— 无活跃变更时**：
- 自由思考
- 当洞察结晶时，提议创建变更提案："This feels solid enough to start a change. Want me to create a proposal?"
- 也可以继续头脑风暴，不强制正式化

**路径 B —— 有活跃变更时**（当用户提到变更或 AI 检测到相关变更）：
1. **首先读取 exploration.md**：`furina/changes/<name>/exploration.md`。如果该文件不存在，停止执行技能并提醒用户先运行 `furina-explore`
2. **读取其他已有制品**获取上下文：proposal.md、design.md、specs/**/*.md
3. **在对话中自然引用**它们（如"你的 design 提到使用 Redis，但我们刚意识到 SQLite 更合适..."）
4. **在决策形成后提议捕获**到合适的制品中：
   - 新发现的需求 → `specs/<capability>/spec.md`
   - 需求变更 → `specs/<capability>/spec.md`
   - 设计决策 → `design.md`
   - 范围变更 → `proposal.md`
   - 假设失效 → 相关制品
5. **用户决定** —— 提议后继续，不施压，不自动捕获

**Core Code** (变更制品捕获映射表):
```markdown
4. **Offer to capture when decisions are made**

   | Insight Type               | Where to Capture             |
   | -------------------------- | ---------------------------- |
   | New requirement discovered | `specs/<capability>/spec.md` |
   | Requirement changed        | `specs/<capability>/spec.md` |
   | Design decision made       | `design.md`                  |
   | Scope changed              | `proposal.md`                |
   | Assumption invalidated     | Relevant artifact            |
```
Source: `marketplace/skills/furina-brainstorm/SKILL.md`:140-147

---

### `Ending the Brainstorm` (结束头脑风暴)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:276-301

**Functionality**: 定义了 brainstorm 会话的多种可能结束方式和可选的总结格式。强调 brainstorm 没有强制的结束点，思考本身就是价值。

**Core Logic**:
brainstorm 可能以四种方式结束：
1. **流入 proposal**："Ready to start? I can create a change proposal."（可选调用 furina-propose）
2. **更新制品**："Updated design.md with these decisions"
3. **仅提供清晰度**：用户获得了所需信息，继续前进
4. **稍后继续**："We can pick this up anytime"

当事情开始结晶时，可选择性地输出一个结构化总结，包含：The problem（结晶化的理解）、The approach（如果有）、Open questions（如果有的话）、Next steps（如果准备好了）。

**Core Code**:
```markdown
When it feels like things are crystallizing, you might summarize:

## What We Figured Out

**The problem**: [crystallized understanding]

**The approach**: [if one emerged]

**Open questions**: [if any remain]

**Next steps** (if ready):
- Create a change proposal
- Keep brainstorming: just keep talking

But this summary is optional. Sometimes the thinking IS the value.
```
Source: `marketplace/skills/furina-brainstorm/SKILL.md`:285-301

---

### `Guardrails` (守卫规则)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:305-317

**Functionality**: 定义了 brainstorm 模式下的行为边界，明确区分哪些行为是被鼓励的、哪些是被禁止的。这些守卫规则确保 brainstorm 保持在"思考"层面而不越界到"实现"层面。

**禁止行为（Don't）**:
- **Don't implement** —— 永不编写代码或实现功能。创建 Furina 制品（proposal、design、specs）是可以的，编写应用代码是不行的
- **Don't fake understanding** —— 如果某些事情不清楚，深入挖掘
- **Don't guess — ask** —— 需要用户意见时必须使用 `AskUserQuestion` 提供 2-3 个候选选项
- **Don't rush** —— brainstorming 是思考时间，不是任务时间
- **Don't force structure** —— 让模式自然浮现
- **Don't auto-capture** —— 提议保存洞察，但不要自行操作

**鼓励行为（Do）**:
- **Do visualize** —— 好的图表胜过千言万语
- **Do check exploration.md first** —— 然后根据需要探索代码库
- **Do question assumptions** —— 包括用户的和自己的

**特殊规则**:
- **Pre-completion Reflection** —— 在结束 brainstorm 之前，始终反思是否已澄清了所有需要与用户确认的细节

**Core Code**:
```markdown
## Guardrails

- **Don't implement** - Never write code or implement features. Creating Furina artifacts is fine, writing application code is not.
- **Don't fake understanding** - If something is unclear, dig deeper
- **Don't guess — ask** - Whenever you need the user's opinion, preference, or decision, you **must** use `AskUserQuestion` with 2-3 candidate options. Let the user provide a custom answer too. Guessing wrong wastes more time than asking one more question. Welcome the user to correct or challenge anything you think you understand.
- **Don't rush** - Brainstorming is thinking time, not task time
- **Don't force structure** - Let patterns emerge naturally
- **Don't auto-capture** - Offer to save insights, don't just do it
- **Do visualize** - A good diagram is worth many paragraphs
- **Do check exploration.md first** - Then explore the codebase as needed to ground discussions in reality
- **Do question assumptions** - Including the user's and your own
- **Pre-completion Reflection** - Before wrapping up the brainstorm, always reflect on whether you have clarified all the details that need to be confirmed with the user.
```
Source: `marketplace/skills/furina-brainstorm/SKILL.md`:305-317

---

### `Handling Different Entry Points` (不同入口的处理)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:168-273

**Functionality**: 通过四种典型场景的对话示例，定义了 brainstorm 技能如何根据不同类型的用户输入进行响应。这些示例不是代码逻辑，而是行为模式指引。

**四种入口场景**:

1. **用户带来模糊想法**（如 "I'm thinking about adding real-time collaboration"）
   - 行为：绘制协作频谱图（Awareness → Coordination → Sync），帮助用户定位自己的需求级别
   - 关键：不直接给答案，而是用可视化呈现选项空间

2. **用户带来具体问题**（如 "The auth system is a mess"）
   - 行为：先读代码库，绘制当前认证流程图，指出三个"纠结点"，让用户选择
   - 关键：基于实际代码的可视化分析，而非理论推测

3. **用户卡在实现中途**（如 `/furina-brainstorm add-auth-system`）
   - 行为：读取变更制品，定位当前任务，绘制流程图，探索替代路径，提议更新设计或添加调查任务
   - 关键：整合 Furina 变更上下文，提供具体的后续行动选项

4. **用户想要比较方案**（如 "Should we use Postgres or SQLite?"）
   - 行为：先询问上下文（"What's the context?"），再基于具体约束绘制比较表格
   - 关键：不给通用答案，基于具体上下文做比较，发现隐藏问题（"Unless... is there a sync component?"）

---

### `What You Don't Have To Do` (不强制要求)

**Source**: `marketplace/skills/furina-brainstorm/SKILL.md`:157-165

**Functionality**: 定义了 brainstorm 技能中明确不要求的行为，进一步强化"这是一种姿态，不是工作流"的核心理念。

**不要求的行为**:
- 遵循脚本
- 每次问同样的问题
- 产出特定制品
- 达成结论
- 如果有价值的分支是离题的，留在主题上
- 简洁（这是思考时间）

## Data Structures

### `settings.json` 中的 `brainstorm` 字段

```json
{
  "brainstorm": true | false
}
```
- `brainstorm` (`boolean`): brainstorm 模式标志。当 `--before-propose` hook 触发时设为 `true`，当 `handleChangeInstructionProposal` 触发时设为 `false`。`runBeforeQuestion` hook 在每次 `AskUserQuestion` 调用时检查此标志，仅当为 `true` 时执行问题捕获逻辑。

### `question.json` 结构

```json
[
  {
    "tool_use_id": "toolu_xxx",
    "questions": [
      { "question": "...", "header": "...", "options": [...] }
    ]
  }
]
```
- `tool_use_id` (`string`): `AskUserQuestion` 工具调用的唯一标识符
- `questions` (`Array`): 本次 `AskUserQuestion` 调用中的问题列表。在 brainstorm 模式下，每次提问都会被追加到此文件中，形成完整的对话记录

### 制品捕获映射

```
Insight Type               →  Capture Target
─────────────────────────────────────────────
New requirement discovered →  specs/<capability>/spec.md
Requirement changed        →  specs/<capability>/spec.md
Design decision made       →  design.md
Scope changed              →  proposal.md
Assumption invalidated     →  Relevant artifact
```

## Error Handling and Edge Cases

### exploration.md 不存在时的处理

当有活跃变更但 `furina/changes/<name>/exploration.md` 不存在时，技能定义要求**停止执行**并提醒用户先运行 `furina-explore`。这是硬性约束，因为 brainstorm 需要基于已有探索上下文才能有效进行。

**Core Code**:
```markdown
   If exploration.md does not exist, stop executing this skill and remind the user to run skill: furina-explore first.
```
Source: `marketplace/skills/furina-brainstorm/SKILL.md`:126

### 语言获取失败

当 `furina config show language` 命令失败或无输出时，回退到中文。

### brainstorm 标志的静默失败

在 hooks 层面（`runBeforePropose` 和 `handleChangeInstructionProposal`），对 `settings.json` 的读写操作使用 try-catch 包裹并静默失败（catch 块为空），确保 brainstorm 标志的设置不会阻断主流程。

**Core Code** (hooks.js brainstorm 标志设置):
```javascript
  const settingsPath = path.join(os.homedir(), '.furina', 'sessions', parsed.sessionId, 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings.brainstorm = true;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    }
  } catch {
    // Silent
  }
```
Source: `marketplace/scripts/furina_hooks.js`:473-482

### question.json 捕获的边界条件

`runBeforeQuestion` 函数在以下情况静默退出：
- `parsed.sessionId` 不存在
- `settings.json` 文件不存在
- `settings.json` 解析失败
- `brainstorm` 标志为 `false`
- 无法从 stdin 提取 `tool_use_id` 或 `questions`

## Dependencies

### Depends on

- **furina-explore**：brainstorm 技能要求在有活跃变更时先读取 exploration.md，如果该文件不存在则要求用户先运行 furina-explore
- **furina CLI**：语言适配依赖 `furina config show language` 命令；变更感知依赖 `furina change list` 命令
- **Furina hooks 系统**：brainstorm 模式的启用/禁用由 `--before-propose` hook 和 `handleChangeInstructionProposal` 函数管理
- **AskUserQuestion 工具**：brainstorm 的核心交互方式，用于在不做假设的前提下对齐需求
- **Furina 制品体系**（proposal.md, design.md, specs/**/*.md）：brainstorm 的产出可能流入这些制品

### Depended by

- **furina workflow（Phase 2: Propose）**：workflow 的 propose 阶段在调用 furina-propose 之前先调用 brainstorm 进行需求对齐
- **furina-propose**：brainstorm 对齐完成后，workflow 自动调用 propose 创建变更提案。propose 阶段的触发也会关闭 brainstorm 模式

## Usage Examples

### 典型场景 1：用户带来模糊想法

```
用户: 我在考虑给系统加上实时协作功能

AI: 实时协作是一个很大的空间。让我想想...

      COLLABORATION SPECTRUM
      ════════════════════════════════════════════

      Awareness          Coordination         Sync
          │                   │                 │
          ▼                   ▼                 ▼
      ┌────────┐         ┌────────┐        ┌────────┐
      │Presence│         │Cursors │        │  CRDT  │
      │  "3    │         │ Multi  │        │Conflict│
      │online" │         │ select │        │  free  │
      └────────┘         └────────┘        └────────┘
          │                   │                 │
       trivial            moderate           complex

      你的想法在哪个层级？
```

**说明**：AI 首先通过可视化呈现"实时协作"的问题空间全景图，然后用开放性问题让用户自己定位，而非直接推荐方案。这体现了 "Open threads, not interrogations" 和 "Visual" 姿态。

### 典型场景 2：在工作流中自动触发

workflow 进入 propose 阶段时的执行流程：

```markdown
#### Phase Execution
1. Invoke Skill: furina-brainstorm to brainstorm and align on user requirements
2. AskUserQuestion: "Are there any further details that need clarification?"
   - Continue to create Furina artifacts
   - Pause for further discussion
3. When user selects 'continue':
   Invoke Skill: furina-propose to create a new change proposal
```

**说明**：brainstorm 作为 propose 的前置步骤自动调用，对齐完成后 workflow 询问用户是否继续。这体现了 brainstorm 技能与 workflow 的集成方式。用户选择 "Continue" 后，`handleChangeInstructionProposal` 会将 brainstorm 标志设为 `false`。

### 典型场景 3：与已有变更制品集成

```
用户: /furina-brainstorm add-auth-system
     OAuth 集成比预期更复杂

AI: [读取变更制品]
    你正在执行任务 4: "Implement OAuth flow"
    让我追踪涉及的内容...

    [绘制图表，探索选项，建议路径]

    要更新 design 来反映这些内容吗？
    还是添加一个 spike 任务来调查？
```

**说明**：当用户通过 `/furina-brainstorm <change-name>` 指定活跃变更时，AI 首先读取 change 目录下的已有制品（exploration.md、proposal.md、design.md 等），然后基于实际上下文进行 brainstorm。当决策形成时，AI 提议捕获到合适的制品中（此处是 design.md），但不自动执行。这体现了 "Don't auto-capture — Offer to save insights, don't just do it" 的守卫规则。

### 典型场景 4：基于上下文的技术比较

```
用户: 应该用 Postgres 还是 SQLite？

AI: 通用答案很无聊。上下文是什么？

用户: 一个追踪本地开发环境的 CLI 工具

AI: 这改变了一切。

     ┌─────────────────────────────────────────────────┐
     │         CLI TOOL DATA STORAGE                  │
     └─────────────────────────────────────────────────┘

     Key constraints:
     · No daemon running
     · Must work offline
     · Single user

                  SQLite          Postgres
     Deployment   embedded ✓      needs server ✗
     Offline      yes ✓           no ✗
     Single file  yes ✓           no ✗

     SQLite. Not even close.

     Unless... is there a sync component?
```

**说明**：AI 不直接回答 "用哪个"，而是先询问上下文，然后基于具体约束绘制比较表格，最后发现潜在的隐藏需求（同步组件），体现了 "Grounded" 和 "Ask before assuming" 姿态，以及 "Surface risks and unknowns" 的行为模式。
