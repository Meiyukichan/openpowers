# Spec: furina-cleancode (CleanCode Skill)

> Source files:
> - `marketplace/skills/furina-cleancode/SKILL.md` : 1-79
> - `marketplace/skills/furina-cleancode/instructions/clean-ts.md` : 1-117
> - `marketplace/skills/furina-cleancode/instructions/clean-python.md` : 1-1 (empty placeholder)
> - `marketplace/skills/furina-cleancode/references/cleancode-format.md` : 1-27
> - `marketplace/skills/furina-cleancode/references/ts/toc.md` : 1-304
> - `marketplace/skills/furina-cleancode/references/ts/naming.md` : 1-137
> - `marketplace/skills/furina-cleancode/references/ts/source-file-basics.md` : 1-33
> - `marketplace/skills/furina-cleancode/references/ts/source-file-structure.md` : 1-323
> - `marketplace/skills/furina-cleancode/references/ts/type-system.md` : 1-414
> - `marketplace/skills/furina-cleancode/references/ts/language-features.md` : 1-1663
> - `marketplace/skills/furina-cleancode/references/ts/comments-and-documentation.md` : 1-244
> - `marketplace/skills/furina-cleancode/references/ts/policies.md` : 1-36
> - `marketplace/skills/furina-cleancode/references/ts/toolchain-requirements.md` : 1-31
> - `marketplace/skills/furina-cleancode/references/ts/typescript-core-style.md` : 1-31

## Overview

furina-cleancode 是 Furina 平台的编码规范查询技能（Skill）。它的核心职责是：在用户生成、编写或修改代码之前，根据目标编程语言查询对应的编码规范，并输出聚焦于当前需求的编码指南（Markdown 格式）。

**设计动机**：不同编程语言有不同的编码规范（如 TypeScript 基于 Google TypeScript Style Guide，Python 基于 PEP 等），手动查阅规范成本高且容易遗漏。此技能通过自动化的方式，根据用户的具体需求或变更文件上下文，筛选并输出相关的编码规范条目，确保生成的代码始终符合项目的编码标准。

**使用场景**：
- 用户编写 TypeScript/JavaScript 代码之前，需要获取针对性的编码规范
- 用户编写 Python 代码之前，需要获取针对性的编码规范
- `furina-explore` 技能的 cleancode 探索维度会调用此技能来获取编码规范

**源文件职责划分**：
| 文件 | 职责 |
|------|------|
| `SKILL.md` | 技能入口定义：参数声明、语言适配、指令映射表、子代理（Subagent）调度模式、RED LAW 约束 |
| `instructions/clean-ts.md` | TypeScript 编码规范的完整查询执行流程（5 阶段流水线） |
| `instructions/clean-python.md` | Python 编码规范的查询执行流程（当前为空占位符，尚未实现） |
| `references/cleancode-format.md` | 输出指南文档的标准化格式模板 |
| `references/ts/toc.md` | TypeScript 规范总目录，包含 9 大章节的概要条目（规范详情导航入口） |
| `references/ts/naming.md` | 命名规范详细规则（标识符、命名风格、CamelCase、常量、别名等） |
| `references/ts/source-file-basics.md` | 源文件基础规则（UTF-8 编码、空白字符、转义序列、非 ASCII 字符） |
| `references/ts/source-file-structure.md` | 源文件结构规则（文件顺序、导入、导出、命名空间 vs 模块等） |
| `references/ts/type-system.md` | 类型系统规则（类型推断、null/undefined、结构类型、接口、any 类型等） |
| `references/ts/language-features.md` | 语言特性规则（变量声明、数组、对象、类、函数、控制结构、异常处理等，本技能最大的参考文件） |
| `references/ts/comments-and-documentation.md` | 注释与文档规则（JSDoc、Markdown 格式、标签、装饰器文档位置等） |
| `references/ts/policies.md` | 策略规则（一致性、代码重新格式化、弃用标记、生成代码豁免等） |
| `references/ts/toolchain-requirements.md` | 工具链要求（TypeScript 编译器、@ts-ignore 限制、一致性框架） |
| `references/ts/typescript-core-style.md` | 核心代码风格（缩进、引号、分号、console.log 限制、文件行数等项目级约束） |

## Architecture / Flow

furina-cleancode 采用**主技能调度 + 子代理执行**的两层架构。主技能（SKILL.md）负责参数校验和指令路由，不直接读取任何参考文档；实际的规范查询和指南生成由子代理（Subagent）完成。这是一个核心设计约束，称为 **RED LAW**。

### 整体调用流程

```
调用方（用户/explore skill）
        |
        v
  furina-cleancode (SKILL.md)
        |
        |-- Step 1: 解析 instruction 参数 → 映射到指令文档路径
        |-- Step 2: 语言适配（furina config show language）
        |-- Step 3: 校验必需参数（缺失时用 AskUserQuestion 询问用户）
        |-- Step 4: 调度 cleancode subagent（Agent tool）
        |
        v
  Cleancode Subagent（clean-ts.md / clean-python.md）
        |
        |-- Phase 1: 分析上下文 → 识别相关章节
        |-- Phase 2: 阅读规范文档
        |-- Phase 3: 生成编码指南（完整草稿）
        |-- Phase 4: 相关性过滤（High/Medium/Low 三级分类）
        |-- Phase 5: 验证（完整性、准确性、去重、行数限制）
        |
        v
  输出结果（outputFile 或内存中的指南内容）
```

### clean-ts.md 五阶段流水线

TypeScript 规范查询采用严格的 5 阶段流水线，每阶段的输出作为下一阶段的输入：

1. **Phase 1（分析上下文）**：读取 `toc.md` 了解全部规范目录，然后根据用户输入类型（需求描述 vs 文件内容）推断涉及的 TypeScript 代码特性，匹配到需要查阅的章节列表。
2. **Phase 2（阅读规范）**：逐个读取 Phase 1 识别的章节详细文档，同时读取 `typescript-core-style.md` 核心风格文档，按上下文相关性过滤规则。
3. **Phase 3（生成指南）**：将 Phase 2 收集的规范合成编码指南文档，严格遵循 `cleancode-format.md` 格式模板。规则描述必须逐字复制原文，禁止编造代码示例。
4. **Phase 4（相关性过滤）**：对每条规则评估与上下文的相关性，分为 High/Medium/Low 三级。High 保留完整描述和合规模例；Medium 仅保留 1-2 句摘要；Low 直接移除。最终文档不超过 300 行。
5. **Phase 5（验证）**：6 项强制检查——相关性分类正确性、High 规则描述完整性、High 规则代码示例准确性、Medium 规则无代码示例、无重复规则、行数限制。验证通过后写入 `outputFile`。

## Functionality / Interface Details

### Skill Entry Point: `SKILL.md`

**Source**: `marketplace/skills/furina-cleancode/SKILL.md`:1-79

**Functionality**: 定义 furina-cleancode 技能的元数据、输入参数、语言适配逻辑、指令映射、子代理调度格式以及 RED LAW 约束。这是技能的唯一入口，所有调用都从此文件开始。

**Parameters (Input)**:

- `instruction` (string, required): 指定要查询的编码规范语言类型。
  - 可选值: `clean-ts`（TypeScript）、`clean-python`（Python）
  - 约束: 必须为已定义的值之一；缺失时通过 `AskUserQuestion` 询问用户
- `context` (string, required): 具体的需求描述或变更文件内容。
  - 用途: 作为子代理分析上下文、筛选相关规范条目的核心输入
  - 约束: 缺失时通过 `AskUserQuestion` 询问用户
- `outputFile` (string, optional): 指定输出文件路径。
  - 默认值: 不提供时不输出文件
  - 用途: 控制最终指南是否写入磁盘

**Return Value**: 无显式返回值。子代理执行结果通过 `Exploration Result` 格式封装输出，包含 `Explore Content`、`Explore Type`（cleancode）和 `Exploration Result`（文件路径或完整内容）。

**Core Logic**:

主技能执行严格的两步流程：

1. **Step 1 - 解析指令文档**：将 `instruction` 参数映射到对应的指令文档路径。映射关系通过硬编码表格定义：

| instruction | 语言 | 指令文档路径 |
|-------------|------|------------|
| `clean-ts` | TypeScript | `${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/instructions/clean-ts.md` |
| `clean-python` | Python | `${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/instructions/clean-python.md` |

2. **Step 2 - 调度子代理**：通过 Agent tool 调度 cleancode 子代理。调度时，主技能**禁止**预先读取指令文档，指令文档的读取完全由子代理负责（RED LAW）。

**Language Adaptation（语言适配）**:

通过执行 `furina config show language` 获取用户配置的语言偏好。该语言用于：
- 所有面向用户的响应和输出的默认语言
- 如果命令无输出或失败，回退到中文

**RED LAW**:

- 禁止 furina-cleancode 在调度子代理前读取「当前指令文档」
- furina-cleancode 禁止读取任何文档，特别是「当前指令文档」
- 这一约束确保主技能保持轻量，避免在调度层引入不必要的上下文

**Core Code**:

```markdown
### Step 2: Execute the instruction document

You **MUST** dispatch the `cleancode subagent` strictly in the following parameter format:

Agent tool (general-purpose):
  description: "Furina:explore:Purpose Explore coding standards for {`context`}"
  prompt: |
    You are exploring coding standards for {`context`}

    ## Language Adaptation
    Language required for this exploration: {`language` or Chinese}

    ## Current Project Path
    {cwd}

    ## Context Parameter
    {`context`}

    ## Output File
    {`outputFile`}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Read current instruction document: {`Current Instruction Documents`}
    2. Strictly and accurately execute the `current instruction document` step by step.
```

Source: `marketplace/skills/furina-cleancode/SKILL.md`:49-73

**Usage Example**:

当 `furina-explore` 技能执行 cleancode 维度探索时，会调用此技能：

```
skill: furina-cleancode
args:
  instruction: clean-ts
  context: "实现一个用户认证模块，包含登录、登出、token 刷新功能"
  outputFile: null
```

Explanation: 该调用会调度子代理执行 clean-ts.md 的五阶段流水线，子代理读取 toc.md 识别出需要查阅的章节（如"类与对象"、"异常处理"、"命名规范"等），然后读取对应详细文档，生成聚焦于认证模块实现的编码指南。

---

### Subagent Dispatch: `clean-ts.md`

**Source**: `marketplace/skills/furina-cleancode/instructions/clean-ts.md`:1-117

**Functionality**: 定义 TypeScript 编码规范查询的完整子代理执行流程。这是 cleancode 子代理在接收到调度后读取并执行的指令文档。它包含一个严格的 5 阶段流水线，每个阶段都必须输出结果后才能进入下一阶段。

**Parameters (Input, via subagent prompt)**:

- `language` (string): 输出语言，由主技能的语言适配机制决定
- `context` (string): 用户的具体需求或变更文件内容
- `outputFile` (string, optional): 输出文件路径

**Return Value**: 以 `Furina CleanCode Exploration Result` 格式封装的结果。

**Core Logic**:

五阶段流水线的核心设计决策：

**Phase 1 - 分析上下文 → 识别相关章节**：

首先读取 `references/ts/toc.md` 获取全部规范目录。然后根据输入类型分两条路径：
- **Case A（需求描述）**：理解需求 → 推断可能涉及的 TypeScript 代码特性 → 匹配章节
- **Case B（文件内容/文件列表）**：分析变更 → 提取代码特性 → 匹配章节

章节匹配示例：
- 类定义 → "类与对象"、"命名"、"类型声明"
- 导入/导出 → "模块"、"作用域"
- 异常处理 → "异常"、"外部数据验证"
- Node.js 后端代码 → "Nodejs 后端"、"外部数据验证"

**Phase 2 - 阅读规范**：

逐个读取 Phase 1 识别的章节详细文档 + `typescript-core-style.md` 核心风格文档。从每个章节文档中按上下文相关性提取规则。

**Phase 3 - 生成编码指南**：

在开始 Phase 3 前必须先输出 Phase 2 结果（提取的规则清单）。然后：
- 严格遵循 `references/cleancode-format.md` 格式模板
- 规则描述**必须逐字复制**原文，不得改写、缩写或省略任何部分
- 代码示例**必须逐字复制**，不得编造或改编以匹配上下文
- 保留规则级别（Required/Recommended）
- 此阶段包含**所有**匹配规则，不做相关性过滤

**Phase 4 - 相关性过滤**：

三级分类体系：

| 相关性级别 | 判定标准 | 输出处理 |
|-----------|---------|---------|
| **High** | 直接针对上下文的安全风险或核心功能关注 | 完整输出：保留完整描述 + 仅合规模例（移除不合规示例） |
| **Medium** | 适用于代码结构的通用最佳实践，但非上下文特定 | 精简输出：仅保留 1-2 句摘要 + 规则 ID 和级别，移除所有代码示例 |
| **Low** | 与上下文几乎无关联 | 完全移除 |

行数限制：最终文档**不得超过 300 行**。超出时按相关性从低到高移除 High 规则的合规模例，再压缩描述。

**Phase 5 - 验证**：

6 项强制质量检查：
1. 相关性分类正确性检查
2. High 规则描述完整性检查（逐句对照原文）
3. High 规则合规模例准确性检查（逐字对照原文）
4. Medium 规则无代码示例检查
5. 无重复规则检查
6. 行数限制检查（`wc -l <outputFile>`）

验证通过后写入 `outputFile`（如果提供了的话）。

**Return Instruction Result**:

```markdown
Furina CleanCode Exploration Result
# Explore Content
{Context}
# Explore Type
cleancode
# Exploration Result
{outputFile 路径或完整的 Phase 5 输出内容}
```

Source: `marketplace/skills/furina-cleancode/instructions/clean-ts.md`:105-117

**Usage Example**:

子代理被调度后，按 Phase 1-5 顺序执行。例如用户需求"实现 REST API 中间件的错误处理"：
1. Phase 1 识别章节：异常处理、控制结构、类、函数
2. Phase 2 读取 `language-features.md`（异常处理部分）、`comments-and-documentation.md` 等
3. Phase 3 生成包含所有相关规则的完整草稿
4. Phase 4 过滤：异常处理规则→High，命名规范→Medium/Low
5. Phase 5 验证通过后输出

---

### Output Format Template: `cleancode-format.md`

**Source**: `marketplace/skills/furina-cleancode/references/cleancode-format.md`:1-27

**Functionality**: 定义编码指南输出文档的标准化格式模板。所有由 clean-ts.md（及未来的 clean-python.md）Phase 3 生成的编码指南必须严格遵循此格式。

**Core Logic**:

模板包含三个标准节：

1. **Scope（范围）**：
   - 需求摘要（一句话描述）
   - 受影响的代码特性（Phase 1 识别的特性列表）

2. **Guidelines（指南）**：
   - 按具体代码特性作为子标题组织（非章节名称）
   - 每个特性下列出相关规则，每条规则包含：
     - 规则 ID + 标题 + 级别
     - Description（从参考文档中保留关键细节）
     - Compliant 示例（从参考文档逐字复制）

3. **Security & production notes（安全与生产注意事项）**：
   - 对安全敏感规则提供上下文特定的安全说明
   - 仅 1-2 句话总结规则如何具体应用于当前需求
   - 不重复 Section 2 中已展示的规则描述或代码示例

---

### TypeScript Standards TOC: `references/ts/toc.md`

**Source**: `marketplace/skills/furina-cleancode/references/ts/toc.md`:1-304

**Functionality**: TypeScript 编码规范的总目录文件。它不是简单的索引，而是包含全部 9 大章节的概要条目和详细规则说明的综合文档。Phase 1 通过读取此文件来了解完整的规范结构，然后确定需要深入阅读哪些章节。

**覆盖的 9 大章节**：

| 章节 | 详细文档 | 规则范围 |
|------|---------|---------|
| 1. 简介 | （内联于 toc.md） | RFC 2119 术语说明、指南说明 |
| 2. 源文件基础 | source-file-basics.md | UTF-8 编码、空白字符、转义序列、非 ASCII 字符 |
| 3. 源文件结构 | source-file-structure.md | 文件顺序、版权、@fileoverview、导入类型、命名空间 vs 具名导入、导出、模块 |
| 4. 语言特性 | language-features.md | 变量声明、数组/对象字面量、类、函数、this、原始字面量、类型转换、控制结构、异常、相等性、断言、装饰器、禁止特性 |
| 5. 命名规范 | naming.md | 标识符规则、命名风格、描述性名称、CamelCase、常量、别名 |
| 6. 类型系统 | type-system.md | 类型推断、返回类型、null/undefined、结构类型、接口 vs 类型别名、数组类型、索引签名、映射/条件类型、any、{}、元组、包装器类型 |
| 7. 工具链要求 | toolchain-requirements.md | TypeScript 编译器、@ts-ignore 限制、一致性框架 |
| 8. 注释与文档 | comments-and-documentation.md | JSDoc vs 普通注释、Markdown 格式、JSDoc 标签、文档位置、参数属性注释 |
| 9. 策略 | policies.md | 一致性、重新格式化、弃用、生成代码、风格指南目标 |

---

### TypeScript Core Style: `references/ts/typescript-core-style.md`

**Source**: `marketplace/skills/furina-cleancode/references/ts/typescript-core-style.md`:1-31

**Functionality**: 项目级的 TypeScript 核心代码风格约束，作为 Google TypeScript Style Guide 的补充。Phase 2 在执行时必须同时读取此文件。这些规则独立于 Google 风格中的章节划分，代表项目自身的编码标准。

**核心规则摘要**：

| 类别 | 规则 |
|------|------|
| 模块系统 | 推荐使用 Node.js ES 模块 |
| 导入风格 | 第三方库或多导出模块使用命名空间导入；Node.js 内置模块必须使用默认导入（`import fs from 'fs'`） |
| 引号 | 使用单引号（`'`） |
| 分号 | 显式使用分号 |
| 日志 | 禁止使用 `console.log`，通过 logger 输出日志 |
| 缩进 | 必须采用 2 个空格缩进 |
| 文档注释 | 使用 JSDoc 注释；文件头部声明 `@author`/`@copyright`；类、main 方法、export 方法必须有 JSDoc |
| 文件行数 | 普通业务 300-500 行，组件/类 200-300 行，工具/配置 100-200 行，大型模块不超过 800 行 |

---

### Clean-Python Instruction Placeholder: `instructions/clean-python.md`

**Source**: `marketplace/skills/furina-cleancode/instructions/clean-python.md`:1-1

**Functionality**: Python 编码规范查询的指令文档占位符。当前文件为空，表示 Python 编码规范查询功能尚未实现。当 `instruction` 参数为 `clean-python` 时，子代理将读取此空文件，无法执行有效的规范查询。

**Status**: 未实现（空文件）

## Data Structures

### Instruction Mapping Table

技能定义中的指令参数到指令文档的映射关系：

```
instruction (string) → Instruction Document Path (string)

"clean-ts"     → "${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/instructions/clean-ts.md"
"clean-python" → "${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/instructions/clean-python.md"
```

### Subagent Prompt Template

子代理调度时使用的标准化 prompt 结构：

```
description: "Furina:explore:Purpose Explore coding standards for {context}"
prompt:
  - Language Adaptation section (language)
  - Current Project Path section (cwd)
  - Context Parameter section (context)
  - Output File section (outputFile)
  - Execution Flow section (指向指令文档的执行步骤)
```

关键字段 `description` 中的 `Furina:explore:Purpose` 是 cleancode 子代理的识别标记，不可更改。

### Relevance Tier Classification

Phase 4 中使用的相关性分级体系：

```
High   → 完整输出（完整描述 + 仅合规模例）
Medium → 精简输出（1-2 句摘要 + 规则 ID + 级别，无代码示例）
Low    → 完全移除
```

### Output Result Format

最终输出的标准封装格式：

```
Furina CleanCode Exploration Result
# Explore Content
{context}
# Explore Type
cleancode
# Exploration Result
{outputFile path or full content}
```

### cleancode-format.md Output Structure

编码指南的标准文档结构：

```
1. Scope
   - 需求摘要
   - 受影响的代码特性

2. Guidelines（按代码特性分组）
   - <Feature name>
     - <Rule ID> <Rule title> [<Level>]
       - [Description]
       - [Compliant] (code example)

3. Security & production notes
   - 安全敏感规则的上下文特定说明
```

## Error Handling and Edge Cases

### 参数缺失处理

当必需参数（`instruction` 或 `context`）缺失时，技能**必须**使用 `AskUserQuestion` 向用户询问。不询问可选参数（`outputFile`）。

### 语言适配降级

`furina config show language` 命令执行失败或无输出时，回退到中文作为默认语言。

### 行数超限处理

当 Phase 4 过滤后的文档仍超过 300 行限制时，采用渐进式降级策略：
1. 按 High 规则相关性从低到高的顺序，逐个移除合规模例
2. 若仍超限，压缩 High 规则描述（缩短但不省略关键约束）
3. 每次缩减后重新计数，直至满足限制

### Phase 输出强制检查

clean-ts.md 强制要求每个 Phase 在开始下一 Phase 前**必须**输出当前 Phase 的结果。这是一个防止跳过或合并阶段的机制，确保流水线的可追溯性。

### 空指令文档处理

`clean-python.md` 当前为空文件。当 `instruction=clean-python` 时，子代理将读取空文件，无法执行规范查询。这是一个已知的功能缺陷。

## Dependencies

- **Depends on**:
  - `furina config show language` 命令 — 获取用户语言偏好
  - Agent tool (general-purpose) — 调度 cleancode 子代理
  - `${CLAUDE_PLUGIN_ROOT}` 环境变量 — 定位技能文件路径
  - TypeScript 编码规范参考文档集（`references/ts/*.md`）— 提供规范内容源

- **Depended by**:
  - `furina-explore` 技能 — 其 `instructions/cleancode.md` 在 cleancode 探索维度中调用此技能
  - 用户直接调用 — 在编写代码前手动触发编码规范查询

## Usage Examples

### 示例 1：用户直接调用查询 TypeScript 编码规范

场景：用户准备实现一个 REST API 错误处理中间件。

```markdown
# 调用方式
skill: furina-cleancode

# 参数
instruction: clean-ts
context: "实现 REST API 错误处理中间件，需要定义自定义错误类、统一错误响应格式、异步错误捕获"
outputFile: ./cleancode-output.md
```

**执行流程**：
1. 主技能（SKILL.md）解析 `instruction=clean-ts`，映射到 `instructions/clean-ts.md`
2. 主技能执行 `furina config show language` 获取语言偏好（假设返回 "中文"）
3. 主技能通过 Agent tool 调度子代理，传递 context、language、outputFile
4. 子代理读取 `clean-ts.md`，开始五阶段流水线：
   - Phase 1：读取 `toc.md` → 识别章节：异常处理、类、函数、控制结构、注释
   - Phase 2：读取 `language-features.md`（异常处理段）、`comments-and-documentation.md` 等
   - Phase 3：生成包含所有相关规则的完整草稿
   - Phase 4：过滤 — 异常处理规则→High，命名规范→Medium，装饰器→Low（移除）
   - Phase 5：验证通过
5. 结果写入 `./cleancode-output.md`

**输出结果格式**：
```markdown
Furina CleanCode Exploration Result
# Explore Content
实现 REST API 错误处理中间件，需要定义自定义错误类、统一错误响应格式、异步错误捕获
# Explore Type
cleancode
# Exploration Result
./cleancode-output.md
```

### 示例 2：furina-explore 技能内部调用

场景：`furina-explore` 在探索维度中需要获取编码规范。

```markdown
# explore/instructions/cleancode.md 的 Phase 3 调用
skill: furina-cleancode

# 参数
instruction: clean-ts
context: {
  "what": "用户认证模块",
  "boundaries": "src/auth/ 目录",
  "goal": "了解实现用户登录/登出/token刷新需要遵循的编码规范",
  "codeCharacteristics": "类定义、异步函数、异常处理、HTTP 客户端调用"
}
outputFile: null  # explore skill 禁止 cleancode 生成输出文件
```

**执行流程**：与示例 1 相同，但 `outputFile` 为 null，结果直接返回给 explore skill 的子代理，不写入磁盘。

### 示例 3：参数缺失时的交互

```markdown
# 用户调用但缺少 context 参数
skill: furina-cleancode
args:
  instruction: clean-ts
  # context 缺失

# 技能行为：使用 AskUserQuestion 询问用户
"请提供 context 参数：具体的需求描述或变更文件内容。"
```
