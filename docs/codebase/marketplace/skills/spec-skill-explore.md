# Spec: Skill furina-explore — 多维度代码库探索技能

> Source files:
> - `marketplace/skills/furina-explore/SKILL.md` : 1-102
> - `marketplace/skills/furina-explore/instructions/cleancode.md` : 1-110
> - `marketplace/skills/furina-explore/instructions/codebase.md` : 1-140
> - `marketplace/skills/furina-explore/instructions/memory.md` : (空文件，预留接口)
> - `marketplace/skills/furina-explore/instructions/reference.md` : 1-158
> - `marketplace/skills/furina-explore/instructions/repository.md` : 1-132
> - `marketplace/skills/furina-explore/instructions/specification.md` : 1-131
> - `marketplace/skills/furina-explore/references/explore-dimensions.md` : 1-305

## 概述

furina-explore 是 Furina 工作流中的**多维度代码库探索技能**，负责在变更开发之前深度调研项目的现有实现、架构模式和集成点，为后续的设计与编码决策提供事实依据。

### 设计动机

在软件开发流程中，盲目编码或设计往往导致返工。furina-explore 的设计目标是：在用户提出需求后、进入方案设计或编码之前，通过多维度并行探索（代码库、仓库、参考资料、编码规范、规范文档、记忆），自动收集与需求直接相关的技术上下文，确保后续阶段（propose、plan、sdd）拥有充足的事实基础。

### 定位与角色

- **工作流阶段**：在 `workflow.md` 定义的 6 阶段工作流中，explore 是**第 1 阶段**（Explore），在 Propose 之前执行。
- **上游调用者**：`marketplace/commands/workflow.md` 通过 `Invoke Skill: furina-explore` 调用此技能，传入 `exploreType`、`exploreContent`、`outputDir` 三个参数。
- **下游依赖**：探索过程中会分别调用 `furina-codebase`（代码库文档树查询）和 `furina-cleancode`（编码规范查询）两个子技能。

### 使用场景

- 用户提及"探索"、"了解"、"查一下"、"研究一下"、"explore"、"look into"、"investigate" 等意图时触发。
- 在执行变更前需要理解现有代码结构、相关实现或当前业务逻辑时使用。
- 工作流 Explore 阶段的自动调用。

### 涉及的源文件及其职责

| 文件 | 职责 |
| --- | --- |
| `SKILL.md` | 技能入口。定义输入参数、exploreType 路由逻辑、子代理并发派发模板、RED LAW 约束和 Key Rules |
| `instructions/codebase.md` | codebase 探索指令。通过 furina-codebase 查询代码库文档树，并进行补充探索 |
| `instructions/repository.md` | repository 探索指令。通过配置获取本地仓库资料并探索 |
| `instructions/reference.md` | reference 探索指令。探索参考资料（目录/技能/URL 三种类型），支持 websearch 和 context7 补充探索 |
| `instructions/specification.md` | specification 探索指令。探索规范文档资料（目录/技能/URL 三种类型） |
| `instructions/cleancode.md` | cleancode 探索指令。检测项目主要编程语言并调用 furina-cleancode 获取编码规范 |
| `instructions/memory.md` | memory 探索指令（当前为空文件，预留接口） |
| `references/explore-dimensions.md` | 探索维度参考指南。定义 11 个维度（需求分析、方案设计、数据模型、API 规划等）的详细调查清单 |

## 架构 / 流程

### 整体执行流程

```
用户输入 exploreContent
        |
        v
[SKILL.md 入口] -- 参数校验 + 语言适配(furina config show language)
        |
        v
[Step 1: 解析批量指令任务]
  根据 exploreType 确定指令列表:
    for-design  --> [codebase, repository, memory, specification]
    for-coding  --> [codebase, reference, cleancode, specification]
        |
        v
[Step 2: 并发派发 instruction executing subagent]
  对每个指令并行派发子代理（Agent tool），每个子代理:
    1. 接收标准化 prompt（exploreType, exploreContent, outputDir, key rules, language）
    2. 读取对应的 Instruction Document
    3. 按指令文档的执行流程独立完成探索
        |
        v
[各子代理返回探索结果]
```

### exploreType 路由表

| exploreType | 派发的指令 | 设计意图 |
| --- | --- | --- |
| `for-design` | `codebase`, `repository`, `memory`, `specification` | 面向设计：需要理解代码库实现、仓库资料、历史记忆和规范文档 |
| `for-coding` | `codebase`, `reference`, `cleancode`, `specification` | 面向编码：需要理解代码库实现、参考资料、编码规范和规范文档 |

### 子代理派发模板

每个子代理遵循统一的 prompt 模板，包含以下标准段：

- **Language Adaptation**: 输出语言（来自 `furina config show language`，默认中文）
- **Current Project Path**: `{cwd}`
- **Explore Content**: 用户的探索内容
- **Key Rules**: 不实现代码、只探索不提方案、不捏造信息、严格绑定 exploreContent
- **Output Directory**: 输出目录（可选）
- **Execution Flow**: 先读取 Instruction Document，再严格按指令执行

### 各指令内部执行流程（共性模式）

除 cleancode 外，其余 5 个指令（codebase、repository、reference、specification、memory）共享相似的多阶段执行模式：

1. **Phase 1 - 获取配置**: 通过 `furina config show` 获取对应类型的资料配置列表
2. **Phase 2 - 理解需求**: 将 exploreContent 解析为 What/Boundaries/Goal 三元组
3. **Phase 3 - 探索资料**: 根据资料类型（directory/skill/url）分发探索策略
4. **Phase 4 - 补充探索**（仅 codebase 和 reference）: 当 Phase 3 结果不足时，进行手动补充探索
5. **写入探索文件**: 当 outputDir 提供时，将结果写入对应的 `{outputDir}/{instruction}.md`
6. **返回探索结果**: 按标准化格式返回

## 功能 / 接口详情

### `SKILL.md` 入口定义

**Source**: `marketplace/skills/furina-explore/SKILL.md`:1-102

**功能**: 作为 furina-explore 技能的总入口，负责参数校验、语言适配、exploreType 路由、子代理并发派发。这是整个探索技能的编排层，自身不执行具体探索逻辑，而是将探索任务拆分后分配给各专用指令子代理。

**输入参数**:
- `exploreType` (必填, `for-design` | `for-coding`): 决定探索维度组合。`for-design` 面向设计阶段，侧重代码库+仓库+记忆+规范；`for-coding` 面向编码阶段，侧重代码库+参考+编码规范+规范。
- `exploreContent` (必填, string): 要探索的具体功能、模块或问题描述。会传递给所有子代理作为探索目标。
- `outputDir` (可选, string): 输出目录路径。未提供时子代理不生成文件输出，仅返回结果。

**语言适配逻辑**:
通过执行 `furina config show language` 获取语言配置，作为所有子代理的默认输出语言。若脚本无输出或执行失败，回退为中文。

**核心逻辑**:

SKILL.md 定义了严格的两步编排流程。Step 1 根据 exploreType 查路由表确定指令列表。Step 2 对每个指令并发派发子代理，每个子代理接收标准化 prompt 并独立执行。关键约束是 RED LAW——禁止 SKILL.md 在派发前读取 Instruction Documents，所有指令文档必须由子代理自行读取。

**核心代码**:
```
Agent tool (general-purpose):
  description: "Furina:explore:Purpose Explore {instruction} for {`exploreContent`}"
  prompt: |
    You are exploring {instruction}: {`exploreContent`}

    ## Language Adaptation
    Language required for this exploration: {`language` or Chinese}

    ## Current Project Path
    {cwd}

    ## Explore Content
    {`exploreContent`}

    ## Key Rules
    {`key rules`}

    ## Output Directory
    {`outputDir`}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Read the explorer instruction document: {`Determined Instruction Document`}
    2. Strictly follow the instruction's steps and requirements to execute the exploration task
```
Source: `marketplace/skills/furina-explore/SKILL.md`:53-78

**Usage Example**:
在 workflow.md 的 Explore 阶段中，skill 被如下调用：
```
Invoke Skill: furina-explore
  exploreType: for-design
  exploreContent: $ARGUMENTS
  outputDir: {cwd}/furina/changes/<name>/explore-design
```
解释：workflow 在 Explore 阶段以 `for-design` 类型调用此技能，探索结果输出到变更目录的 `explore-design` 子目录下。此调用将并发派发 codebase、repository、memory、specification 四个子代理。

---

### `instructions/codebase.md` — Codebase 探索指令

**Source**: `marketplace/skills/furina-explore/instructions/codebase.md`:1-140

**功能**: 通过 furina-codebase 技能查询项目的代码库文档树（toc.md 层级索引），定位与探索内容相关的 spec 文档和源代码。这是最核心的探索指令，依赖已生成的代码库文档树进行结构化导航，同时在文档树结果不足时进行手动补充探索。

**参数**（由 SKILL.md 子代理模板传入）:
- `exploreContent` (string): 探索目标描述
- `language` (string): 输出语言
- `cwd` (string): 当前项目路径
- `outputDir` (string): 输出目录

**执行流程（4 个阶段）**:

**Phase 1 — 获取代码库列表**: 执行 `furina config show project.sourcecode codebases` 获取代码库配置列表，每个元素包含 `path`（文档树路径）和 `description`（描述）。当 `description` 非空时，仅当需求理解与该 description 相关时才探索对应代码库。

**Phase 2 — 理解需求**: 将 exploreContent 解析为结构化理解：What（用户想了解什么）、Boundaries（探索范围）、Goal（探索目标）、Project Context（项目整体架构设计和框架模式，将探索内容定位到具体的架构层）。

**Phase 3 — 使用 furina-codebase 探索**: 遍历代码库列表，对每个元素调用 `furina-codebase` 技能，传入 `codebaseDir`、`instruction: explore`、`userQuery`（需求理解）。

**Phase 4 — 补充探索**: 当 Phase 3 无结果或结果不足以覆盖 exploreContent 时，在限定文件范围内进行手动探索（使用 Grep、Glob、Read 工具）。允许的文件范围包括：`{cwd}/{project.sourcecode}`、`{cwd}/*.md`、`{cwd}/docs`、`{cwd}/**/proposal.md`、`{cwd}/**/design.md`、`README.md`，且必须遵守 `.gitignore` 配置。

**探索策略**（优先级排序）:
1. 关键词搜索：使用 Grep 搜索探索内容的关键词
2. 文件匹配：使用 Glob 匹配潜在相关文件
3. 结构理解：读取关键文件理解架构和实现细节
4. 调用链追踪：从入口点向上/向下追踪调用关系

**探索结果格式**:
```md
## Exploration Result
{Phase 3: furina-codebase 返回的结果}
## Supplementary Exploration Result
{Phase 4: 补充探索的结果}
```

**Usage Example**:
当 exploreType 为 `for-design` 时，codebase 指令会被自动派发。子代理首先通过 `furina config show project.sourcecode codebases` 获取文档树路径列表，然后对每个代码库调用 `furina-codebase` 的 explore 指令进行层级导航查询。

---

### `instructions/reference.md` — Reference 探索指令

**Source**: `marketplace/skills/furina-explore/instructions/reference.md`:1-158

**功能**: 探索参考资料资料，支持三种资料类型（本地目录、技能调用、在线 URL），并在本地结果不足时通过 websearch 和 context7 进行补充探索。此指令仅在 `for-coding` 模式下使用，面向编码任务提供第三方文档、最佳实践和使用示例。

**执行流程（4 个阶段）**:

**Phase 1 — 获取参考资料配置**: 执行 `furina config show exploration.reference` 获取参考资料配置列表。

**资料配置格式**:
```json
[
    { "type": "directory", "path": "path/to/reference", "description": "..." },
    { "type": "skill", "path": "skill name or content", "description": "..." },
    { "type": "url", "path": "url", "description": "..." }
]
```

**资料类型说明**:
- `directory`: 本地参考资料目录，使用 Grep/Glob/Read 工具探索
- `skill`: 通过技能查询参考资料，`path` 可以是文件路径、技能名或技能内容
- `url`: 从在线 URL 下载并探索参考资料

**Phase 2 — 理解需求**: 标准 What/Boundaries/Goal 三元组解析。

**Phase 3 — 探索参考资料**: 根据 type 分发到三种场景，每种场景遵循统一的探索策略（关键词搜索 -> 文件匹配 -> 结构理解 -> 调用链追踪）。

**Phase 4 — 补充探索**: 执行 `furina config show experimental.websearch experimental.context7` 获取补充探索配置。当 Phase 3 结果为空或信息不足时：
- 若 `experimental.websearch` 为 True，使用 websearch 查询需求相关的示例或用法
- 若 `experimental.context7` 为 True，使用 context7 自动搜索并引用需求相关库的最新官方文档

**description 过滤规则**: 若元素的 `description` 为空则默认探索；若 `description` 非空，仅当需求理解与该 description 相关时才探索。

**Usage Example**:
当 exploreType 为 `for-coding` 时，reference 指令自动派发。子代理从配置中读取参考资料列表，按类型逐个探索，最后根据 experimental 配置决定是否进行 websearch/context7 补充探索。

---

### `instructions/repository.md` — Repository 探索指令

**Source**: `marketplace/skills/furina-explore/instructions/repository.md`:1-132

**功能**: 探索仓库资料，与 reference 指令结构类似，但面向的是项目仓库级别的资料（如仓库文档、项目说明等）。仅在 `for-design` 模式下使用。

**执行流程（3 个阶段）**:

**Phase 1 — 获取仓库资料配置**: 执行 `furina config show exploration.repository` 获取仓库资料配置列表。配置格式与 reference 相同（type/path/description 三元组），支持 directory、skill、url 三种类型。

**Phase 2 — 理解需求**: 标准 What/Boundaries/Goal 三元组。

**Phase 3 — 探索仓库资料**: 根据 type 分发探索。对于 `directory` 类型，探索策略包括关键词搜索、文件匹配、结构理解、调用链追踪。

与 reference 指令的主要区别：repository 指令没有 Phase 4 补充探索阶段（无 websearch/context7），且无 Exploration Result Format 的结构化分段。

**Usage Example**:
当 exploreType 为 `for-design` 时，repository 指令自动派发。适用于探索项目的仓库文档、README、changelog 等仓库级别的资料。

---

### `instructions/specification.md` — Specification 探索指令

**Source**: `marketplace/skills/furina-explore/instructions/specification.md`:1-131

**功能**: 探索规范文档资料，支持三种资料类型（本地目录、技能调用、在线 URL）。同时在 `for-design` 和 `for-coding` 模式下均使用，确保设计方案和编码实现都遵循项目规范。

**执行流程（3 个阶段）**:

**Phase 1 — 获取规范资料配置**: 执行 `furina config show exploration.specification` 获取规范资料配置列表。

**Phase 2 — 理解需求**: 标准 What/Boundaries/Goal 三元组。

**Phase 3 — 探索规范资料**: 根据 type 分发。对于 `directory` 类型，探索策略聚焦于**规范相关性判断**——必须准确识别与需求相关的规范，确保足够相关性的同时不遗漏任何规范。

与 reference 指令的主要区别：specification 探索策略强调"规范相关性"（Specification Relevance），不包含调用链追踪，也没有补充探索阶段。

**Usage Example**:
两种 exploreType 下均会派发 specification 指令，确保探索结果中包含与需求相关的项目规范、技术标准和约束定义。

---

### `instructions/cleancode.md` — CleanCode 探索指令

**Source**: `marketplace/skills/furina-explore/instructions/cleancode.md`:1-110

**功能**: 在编码探索阶段获取目标语言的编码规范。通过自动检测项目的主要编程语言，调用 `furina-cleancode` 技能获取针对性的编码标准和最佳实践。仅在 `for-coding` 模式下使用。

**执行流程（3 个阶段）**:

**Phase 1 — 理解需求**: 标准 What/Boundaries/Goal 三元组，额外派生**代码特征**（可能涉及的目录/文件、代码构造类型、使用的框架/库）。此阶段可通过探索项目代码来获取准确的代码特征。

**Phase 2 — 确定主要语言**: 使用 Glob 扫描项目文件扩展名（`*.ts`/`*.tsx` -> TypeScript, `*.py` -> Python），计数后选择数量较多的语言。默认回退为 TypeScript。若用户在 exploreContent 中明确指定了语言，可覆盖自动检测结果。

**Phase 3 — 调用 furina-cleancode 技能**: 以如下参数调用：
- `instruction`: `clean-ts` 或 `clean-python`（由 Phase 2 决定）
- `context`: 包含 what/boundaries/goal/codeCharacteristics 的结构化对象
- `outputFile`: None（禁止 cleancode 生成输出文件）

**Usage Example**:
当 exploreType 为 `for-coding` 时，cleancode 指令自动派发。子代理先扫描项目文件确定主语言（如 TypeScript），然后调用 `furina-cleancode` 的 `clean-ts` 指令，传入包含代码特征的 context 参数，获取与当前探索相关的 TypeScript 编码规范。

---

### `instructions/memory.md` — Memory 探索指令

**Source**: `marketplace/skills/furina-explore/instructions/memory.md` (空文件)

**功能**: 记忆探索指令的预留接口。当前文件为空，仅在 `for-design` 模式下被路由到，但尚无实际实现。在 exploreType 路由表中作为设计阶段的探索维度之一被规划。

---

### `references/explore-dimensions.md` — 探索维度参考指南

**Source**: `marketplace/skills/furina-explore/references/explore-dimensions.md`:1-305

**功能**: 为 codebase 探索子代理提供多维度调查清单，覆盖软件开发的 11 个核心维度。当 codebase 指令的 Phase 4 补充探索阶段需要探索指导时参考此文档。

**11 个维度**:

| 编号 | 维度 | 覆盖范围 |
| --- | --- | --- |
| 1 | 需求分析 | 业务上下文、功能入口与边界、系统上下文与依赖、逻辑架构、设计约束、代码入口定位 |
| 2 | 整体方案设计 | 现有方案架构、实现模式、组件划分、配置项与功能开关 |
| 3 | 数据模型设计 | 核心实体与关系、表结构定义、存储选型、数据访问层、数据变更与迁移 |
| 4 | API 规划与定义 | API 风格与惯例、接口清单、接口详细定义、限流与兼容性 |
| 5 | 可靠性与可用性设计 | 故障处理、防呆设计、过载保护、降级设计、冗余设计 |
| 6 | 安全与隐私设计 | 信任边界、认证授权、数据保护、安全防护 |
| 7 | 性能设计 | 现有性能特征、性能瓶颈、对现有性能的影响 |
| 8 | 运维设计 | 日志、告警、监控、部署升级、定位与边界检测 |
| 9 | 文档设计 | 文档目录、API 文档自动生成、README/CHANGELOG |
| 10 | UI/页面设计 | 页面结构与路由、交互流程、设计约束 |
| 11 | 测试建议 | 现有测试结构、关键测试场景、测试基础设施 |

**核心原则**: 探索是观察当前状态，不是设计方案。只记录代码中的现有实现，不提出新的方法。

**Usage Example**: 在 codebase 指令的补充探索阶段，子代理可参考此文档的维度清单来组织探索结果，确保覆盖需求相关的所有维度。

## 数据结构

### `ExploreType` 路由枚举

```markdown
exploreType:
  - for-design: 面向设计任务的探索
  - for-coding: 面向编码任务的探索
```
- `for-design`: 派发 codebase、repository、memory、specification 四个指令
- `for-coding`: 派发 codebase、reference、cleancode、specification 四个指令

### `InstructionType` 指令类型

```markdown
InstructionType = "cleancode" | "codebase" | "repository" | "reference" | "memory" | "specification"
```
六种指令类型，每种对应一个 Instruction Document 文件。

### `MaterialsConfig` 资料配置格式

用于 repository、reference、specification 三种指令的资料配置：

```json
[
    {
        "type": "directory | skill | url",
        "path": "路径、技能名或 URL",
        "description": "描述（用于相关性过滤）"
    }
]
```
- `type` (string): 资料类型
  - `directory`: 本地目录，使用工具探索
  - `skill`: 通过技能查询，path 可以是文件路径、技能名或技能内容
  - `url`: 在线 URL，下载后探索
- `path` (string): 资料路径
- `description` (string): 描述字段，用于相关性过滤。为空时默认探索，非空时仅在需求相关时探索

### `CodebasesConfig` 代码库配置格式

用于 codebase 指令的代码库列表：

```json
[
    {
        "path": "代码库文档树路径",
        "description": "描述（用于相关性过滤）"
    }
]
```
- `path` (string): 代码库文档树（toc.md 层级索引）的根路径
- `description` (string): 同 MaterialsConfig 的过滤规则

### `SubagentPrompt` 子代理 prompt 结构

```markdown
## Language Adaptation
{language}
## Current Project Path
{cwd}
## Explore Content
{exploreContent}
## Key Rules
{key rules}
## Output Directory
{outputDir}
## Execution Flow
1. Read the explorer instruction document: {instruction document path}
2. Strictly follow the instruction's steps
```

### 探索结果返回格式

所有指令统一返回如下结构：
```markdown
Furina Explore — Exploration Results
# Explore Content
requirement understanding {from Phase 2}
# Explore Type
{instruction type}
# Exploration Results
{outputDir}/{instruction}.md 或实际探索结果
```

### Requirements Understanding 三元组

大多数指令在 Phase 2 中将 exploreContent 解析为：
```markdown
1. What – 用户想了解的功能、模块或流程（技术化表述）
2. Boundaries – 探索范围
3. Goal – 探索目标
```
codebase 指令额外包含第四项 `Project Context`（项目整体架构设计和框架模式）。

### explore-dimensions 维度体系

11 个维度涵盖软件架构的全面视角：
- 需求分析、方案设计、数据模型、API 规划
- 可靠性、安全性、性能、运维
- 文档、UI/页面、测试

每个维度下包含多个子项（如需求分析包含 6 个子项），为 codebase 补充探索提供结构化指导。

## 错误处理与边界情况

### 参数校验

当必填参数（`exploreType`、`exploreContent`）缺失时，SKILL.md 要求使用 `question` 工具向用户询问。不询问可选参数（`outputDir`）。

### RED LAW 约束

SKILL.md 定义了严格的 RED LAW，防止循环依赖和越权读取：
- 禁止 furina-explore 在派发子代理前读取 Instruction Documents
- 所有指令文档必须由子代理自行读取
- 描述标记 `Furina:explore:Purpose` 是子代理的关键标识，不可误用

### 语言回退

当 `furina config show language` 无输出或执行失败时，回退为中文（Chinese）。cleancode 指令中语言检测的回退也为 TypeScript。

### 代码库配置过滤

codebase 指令中，`description` 非空的代码库元素仅在需求理解与其相关时才被探索，避免不必要的代码库遍历。

### 补充探索触发条件

codebase 指令和 reference 指令包含补充探索阶段，仅在以下条件触发：
- 主探索阶段（Phase 3）返回无结果
- 主探索阶段结果不足以完整回应 exploreContent

### 输出文件写入

所有指令均遵循相同规则：仅当 `outputDir` 提供时才写入文件。写入前确保父目录存在，不存在则先创建。若无相关信息可发现，则不强制输出。

### Key Rules（全局约束）

所有指令和子代理均遵循以下核心约束：
1. **不实现代码**: 只做调研和理解，不写任何实现代码
2. **只探索不提方案**: 严格只探索和记录当前状态，不生成任何提案、方案、实现建议或下一步操作
3. **不捏造信息**: 探索结果必须基于实际代码
4. **红线 — 严格绑定 exploreContent**: 只查询和报告与 exploreContent 直接或紧密相关的内容，绝对不包含无关或弱相关的发现

## 依赖关系

### 依赖（Depends on）

| 依赖项 | 关系说明 |
| --- | --- |
| `furina-codebase` 技能 | codebase 指令调用其 explore 指令，通过代码库文档树进行结构化导航查询 |
| `furina-cleancode` 技能 | cleancode 指令调用其 `clean-ts`/`clean-python` 指令获取编码规范 |
| `furina` CLI | 通过 `furina config show` 获取语言配置、代码库列表、资料配置等运行时配置 |
| Claude Code Agent tool | 子代理通过 Agent tool（general-purpose）并发派发 |

### 被依赖（Depended by）

| 依赖方 | 关系说明 |
| --- | --- |
| `workflow.md`（工作流命令） | 在 Explore 阶段调用 `furina-explore`，传入 exploreType=`for-design`、exploreContent 和 outputDir |

## 使用示例

### 示例 1: 工作流 Explore 阶段自动调用

在 workflow.md 的 Explore 阶段中，furina-explore 被自动调用：

```
Invoke Skill: furina-explore
  exploreType: for-design
  exploreContent: "添加一个新的 MCP 工具，用于管理项目配置"
  outputDir: "./furina/changes/add-config-tool/explore-design"
```

**执行过程**:
1. SKILL.md 检测到 exploreType 为 `for-design`，确定指令列表为 `[codebase, repository, memory, specification]`
2. 查询 `furina config show language` 获取语言配置（如中文）
3. 并发派发 4 个子代理，每个子代理：
   - codebase: 查询代码库文档树，搜索与"MCP 工具"、"项目配置管理"相关的 spec 文档和源代码
   - repository: 获取仓库资料配置，探索与需求相关的仓库级文档
   - memory: （当前为空实现，无输出）
   - specification: 获取规范资料配置，探索与 MCP 工具开发相关的技术规范
4. 各子代理将结果写入 `./furina/changes/add-config-tool/explore-design/` 下的对应文件

### 示例 2: 面向编码的探索

```
Invoke Skill: furina-explore
  exploreType: for-coding
  exploreContent: "修改 skill dispatch 逻辑以支持新的指令类型"
  outputDir: "./furina/changes/add-instruction-type/explore-coding"
```

**执行过程**:
1. exploreType 为 `for-coding`，指令列表为 `[codebase, reference, cleancode, specification]`
2. 并发派发 4 个子代理：
   - codebase: 查询代码库文档树，定位 skill dispatch 相关的 spec 和源代码
   - reference: 获取参考资料配置，查找与"指令类型扩展"相关的参考文档
   - cleancode: 检测项目主语言（如 TypeScript），调用 `furina-cleancode` 获取编码规范
   - specification: 获取规范资料配置，查找相关技术规范
3. 各子代理将结果写入 `./furina/changes/add-instruction-type/explore-coding/` 下的对应文件

### 示例 3: 无输出目录的探索（纯查询）

```
Invoke Skill: furina-explore
  exploreType: for-design
  exploreContent: "项目的整体架构设计是什么样的？"
```

**执行过程**:
1. 未提供 outputDir，子代理不会写入文件
2. 各子代理完成探索后，直接返回标准化格式的探索结果文本
3. 返回格式示例：
```
Furina Explore — Exploration Results
# Explore Content
用户希望了解项目的整体架构设计，包括核心模块划分、分层设计和关键依赖关系
# Explore Type
codebase
# Exploration Results
## Exploration Result
{codebase 探索到的架构相关 spec 文档和源代码摘要}
```
