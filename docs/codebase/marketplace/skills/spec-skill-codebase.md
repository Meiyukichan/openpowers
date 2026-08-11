# Skill: furina-codebase

> Source files:
> - `marketplace/skills/furina-codebase/SKILL.md` : 1-47
> - `marketplace/skills/furina-codebase/instructions/explore.md` : 1-276
> - `marketplace/skills/furina-codebase/instructions/generate.md` : 1-159
> - `marketplace/skills/furina-codebase/instructions/synchronize.md` : 1-176
> - `marketplace/skills/furina-codebase/references/guidance-codebase.md` : 1-60
> - `marketplace/skills/furina-codebase/references/guidance-specs.md` : 1-185
> - `marketplace/skills/furina-codebase/references/guidance-specs-incremental.md` : 1-193
> - `marketplace/skills/furina-codebase/references/guidance-toc-incremental.md` : 1-224
> - `marketplace/skills/furina-codebase/references/prompt-codebase-checker.md` : 1-33
> - `marketplace/skills/furina-codebase/references/prompt-codebase-moduletoc.md` : 1-45
> - `marketplace/skills/furina-codebase/references/prompt-codebase-reviewer.md` : 1-55
> - `marketplace/skills/furina-codebase/references/prompt-codebase-spec.md` : 1-44
> - `marketplace/skills/furina-codebase/references/prompt-codebase-submoduletoc.md` : 1-43
> - `marketplace/skills/furina-codebase/references/prompt-codebase-toc-sync.md` : 1-64
> - `marketplace/skills/furina-codebase/references/prompt-codebase-toptoc.md` : 1-27
> - `marketplace/skills/furina-codebase/references/prompt-modules-partitioner.md` : 1-72
> - `marketplace/skills/furina-codebase/references/prompt-submodules-partitioner.md` : 1-87
> - `marketplace/skills/furina-codebase/references/prompt-submodules-validator.md` : 1-56
> - `marketplace/skills/furina-codebase/references/template-explore-output.md` : 1-170
> - `marketplace/skills/furina-codebase/references/template-module-toc.md` : 1-33
> - `marketplace/skills/furina-codebase/references/template-submodule-toc.md` : 1-27
> - `marketplace/skills/furina-codebase/references/template-top-toc.md` : 1-28

## Overview

本 spec 覆盖 Furina 的 `furina-codebase` 技能，它是项目文档化基础设施的核心组件。该技能提供对"代码库文档树"（code-document tree）的全生命周期管理能力，包括三大核心功能：

- **explore**（探索）：在已生成的文档树中通过业务、功能或代码关键词进行层次化导航查询，最终定位到相关的 spec 文档及其源代码
- **generate**（生成）：从零开始为中大型代码库构建层次化的结构化文档树（toc.md 索引 + spec 文档）
- **synchronize**（同步）：将源代码的增量变更同步回已有文档树，保持文档与代码的一致性

**设计动机**：LLM 在处理大型代码库时面临上下文窗口限制和结构理解困难。代码库技能通过将代码组织为层次化的文档树（模块 -> 子模块 -> spec 文档 -> 源码），为 LLM 提供高效的代码理解路径。文档树的 toc.md 索引充当检索器（retriever）的导航入口，使得用户查询可以沿 "总索引 -> 模块索引 -> 子模块索 -> spec 文档 -> 源码" 的路径精确定位。

**使用场景**：
- 开发者需要了解项目中某个功能的实现时（如"MCP 协议实现"），使用 `explore` 查询文档树并获取关联源码
- 新项目需要完整文档化时，使用 `generate` 生成层次化的代码库文档
- 源代码发生变更后，使用 `synchronize` 将变更同步到已有文档树

**涉及的源文件及职责**：
- `SKILL.md`：技能入口，定义输入参数（`codebaseDir`、`instruction`）、语言适配、指令路由逻辑和渐进式文档读取规则（RED LAW）
- `instructions/explore.md`：explore 指令的完整执行流程定义（4 个阶段）
- `instructions/generate.md`：generate 指令的完整执行流程定义（5 个阶段，含子阶段）
- `instructions/synchronize.md`：synchronize 指令的完整执行流程定义（5 个阶段）
- `references/guidance-codebase.md`：文档树概念规范（概述、模块、子模块、spec 的定义与约束）
- `references/guidance-specs.md`：spec 文档生成标准规范（内容要求、格式模板）
- `references/guidance-specs-incremental.md`：增量模式下 spec 文档的生成/更新规范
- `references/guidance-toc-incremental.md`：增量模式下 toc.md 的更新规范（三级格式、更新规则）
- `references/prompt-*.md`：9 个 SubAgent 提示模板，覆盖 partitioner、generator、reviewer、checker 等角色
- `references/template-*.md`：4 个格式模板，定义 explore 输出和三级 toc.md 的具体格式

## Architecture / Flow

### 技能入口路由

```
SKILL.md (入口)
  │
  ├── 输入参数: codebaseDir (required), instruction (required)
  ├── 语言适配: furina config show language → {language}
  │
  ├── instruction = explore
  │     └── 执行 instructions/explore.md（4 阶段层次化导航）
  │
  ├── instruction = generate
  │     └── 执行 instructions/generate.md（5 阶段文档树生成）
  │
  └── instruction = synchronize
        └── 执行 instructions/synchronize.md（5 阶段增量同步）
```

### Explore 执行流程

```
Phase 1: 读取总索引 toc.md → 匹配查询 → 识别候选模块和直接命中 spec
  │
Phase 2: 层次下钻
  ├── 2A: 模块级匹配 → 读模块 toc.md → 匹配子模块和直接 spec
  └── 2B: 子模块级匹配 → 读子模块 toc.md → 匹配 spec
  │
Phase 3: 读取 spec 文档 + 源码 + 上下游追溯 + 相关性验证
  │
Phase 4: 输出结果（查询摘要 + 导航路径 + spec 摘要 + 源码片段）
```

### Generate 执行流程

```
Phase 1: 全局扫描 → Modules Partitioner SubAgent → 输出模块划分方案 → 等待用户确认
  │
Phase 2: 逐模块扫描 → SubModules Partitioner SubAgent × N → 输出子模块/spec 划分方案
  │
Phase 3: 逐模块验证 → SubModules Validator SubAgent × N → 验证并修正方案
  │
Phase 4: 初始概览文档 → Init-Top-Toc SubAgent → 生成骨架版 toc.md
  │
Phase 5: 严格按模块顺序处理
  ├── 5.1-5.3: 逐子模块 → 并行 spec 生成（10 个一批）
  ├── 5.4: 子模块 toc.md 生成
  ├── 5.5: 模块 toc.md 生成
  ├── 5.6: 更新总 toc.md（完整信息）
  ├── 5.7: 清理 .tmp/ 中间文件
  ├── 5.8: 综合评审（Reviewer SubAgent）
  ├── 5.9: 最终检查（Checker SubAgent → 索引可追溯性）
  └── 5.10: 修复不合格 spec 文档
```

### Synchronize 执行流程

```
Phase 1: 判断代码库状态
  ├── 分支 A: 代码库为空 → 切换到完整 generate 流程
  └── 分支 B: 代码库已存在 → 增量更新
        │
Phase 2: 定位目标 spec（基于变更文件路径 → 模块 → 子模块 → spec）
  │
Phase 3: 创建或更新 spec 文档（遵循 guidance-specs-incremental.md）
  │
Phase 4: 自底向上索引更新（Toc Sync SubAgent）
  │       子模块 toc.md → 模块 toc.md → 根 toc.md
  │
Phase 5: 验证索引可追溯性（仅验证变更范围）
```

## Functionality / Interface Details

### `SKILL.md` — 技能入口与指令路由

**Source**: `marketplace/skills/furina-codebase/SKILL.md`:1-47

**功能描述**：技能的顶层入口文件，定义了技能的元数据、输入参数、语言适配机制和指令路由逻辑。作为 Claude Code 插件系统识别和加载技能的入口点，它将用户请求分发到三个指令文档之一。

**输入参数**：
- `codebaseDir` (`string`, required): 项目代码库的根目录路径，同时也是 generate/synchronize 指令的输出目录
- `instruction` (`string`, required): 要调用的指令类型，取值为 `explore`、`generate` 或 `synchronize`

**语言适配机制**：通过执行 `furina config show language` 获取用户配置的语言偏好。该语言将作为所有用户面向的响应和输出的默认语言。若脚本无输出或执行失败，则回退到中文。

**指令路由逻辑**：根据 `instruction` 参数值路由到对应的指令文档：
- `explore` → `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/instructions/explore.md`
- `generate` → `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/instructions/generate.md`
- `synchronize` → `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/instructions/synchronize.md`

**核心代码**：
```markdown
## Execute Instructions

You **MUST** strictly and accurately execute the following instruction document:

1. execute `Current Instruction`, and wait until this instruction executes completely.

### Current Instruction

- When `instruction = explore`, current instruction is: `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/instructions/explore.md`
- When `instruction = generate`, current instruction is: `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/instructions/generate.md`
- When `instruction = synchronize`, current instruction is: `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/instructions/synchronize.md`
```
Source: `marketplace/skills/furina-codebase/SKILL.md`:31-41

**RED LAW（渐进式文档读取规则）**：技能入口定义了一条关键约束——仅在即将执行某个指令时才允许读取该指令文档，严格禁止读取当前指令文档以外的任何文档。这条规则确保 LLM 在执行过程中不会被无关上下文干扰，降低 token 消耗并提升执行准确性。

**使用示例**：
```
# 用户通过 Claude Code 调用 codebase 技能
/furina:furina-codebase

# 技能询问必要参数
AskUserQuestion: "请提供 codebaseDir 和 instruction"
# 用户回答
codebaseDir: D:/project-docs/
instruction: explore
# 技能读取 instructions/explore.md 并执行
```

---

### `explore.md` — Explore 指令定义

**Source**: `marketplace/skills/furina-codebase/instructions/explore.md`:1-276

**功能描述**：定义 explore 指令的完整执行流程。explore 指令在已生成的文档树中执行层次化导航查询，通过 4 个阶段从总索引逐层下钻到具体的 spec 文档，并读取关联的源代码片段（含上下游追溯），最终向用户呈现结构化的查询结果。

**输入参数**：
- `userQuery` (`string`, required): 用户要查找的业务、功能或代码模块描述，如"工具注册模块"或"MCP 协议实现"
- `codebaseDir` (`string`, required): 项目代码库的根目录，同时也是文档树的根路径

**前提条件**：依赖于 `furina-codebase` 的 `generate` 指令已生成的文档树。文档树结构为：
```
{codebaseDir}/
├── toc.md                    ← 总索引（≤500 行）
├── {module-a}/
│   ├── toc.md                ← 模块索引（≤500 行）
│   ├── {submodule-1}/
│   │   ├── toc.md            ← 子模块索引（≤500 行）
│   │   ├── spec-xxx.md
│   │   └── spec-yyy.md
│   └── spec-zzz.md           ← 模块下的直接 spec
```

**核心逻辑——4 阶段执行流程**：

**Phase 1（读取总索引 — 识别候选模块和直接 spec）**：读取 `{codebaseDir}/toc.md`，将用户查询与每个模块、子模块和 spec 的介绍进行语义匹配。提取模块的索引链接（相对路径转绝对路径），识别所有相关模块和直接命中的 spec。直接命中的 spec 立即加入 `matched_specs` 列表。

**Phase 2（层次下钻 — 从模块到 spec）**：分两个子阶段。2A 模块级匹配：读取模块的 `toc.md`，匹配子模块介绍和直接 spec 介绍。2B 子模块级匹配：对每个命中子模块读取其 `toc.md`，匹配 spec 介绍。所有匹配结果追加到 `matched_specs` 列表。

**Phase 3（读取 spec 文档 + 源码 + 上下游追溯 + 相关性验证）**：对 `matched_specs` 中的每个 spec：(1) 读取完整 spec 文档；(2) 提取源文件路径和行号范围；(3) 读取源代码（≤100 行全量，>100 行可适当省略但必须保留核心代码）；(4) 上溯查找调用方代码；(5) 下溯查找依赖代码；(6) 基于 spec 内容和源码进行相关性判断，过滤不相关条目。

**Phase 4（输出结果）**：按 `template-explore-output.md` 的格式输出：查询摘要 → 导航路径 → spec 摘要 → 源码片段（直接源码 + 上游调用方 + 下游依赖，三部分缺一不可）。

**路径转换规则**：文档树中所有链接均为相对路径，读取前必须转换为绝对路径。总索引中的路径相对于 `{codebaseDir}/`，模块索引中的路径相对于 `{codebaseDir}/{module}/`，子模块索引中的路径相对于 `{codebaseDir}/{module}/{submodule}/`。

**结果列表数据结构**：
```json
matched_specs = [
  {
    "spec_path": "path to the spec document",
    "match_source": "master-index-direct-hit | module-direct-spec | submodule-spec",
    "match_reason": "reason for the match"
  }
]
```

**使用示例**：
```
# explore 查询
userQuery: "工具注册模块"
codebaseDir: D:/project-docs/

# 执行 Phase 1
[Explore] Query: "工具注册模块"
[Explore] Master index hit modules:
  - tools: index path D:/project-docs/tools/toc.md, match reason: 涵盖工具系统

# 执行 Phase 2
[Explore] Module tools
  Hit direct specs (added to matched_specs):
    - D:/project-docs/tools/spec-register.md: 工具注册与管理

# 执行 Phase 3
[Verify] spec-register.md
  Judgment: relevant
  Reason: 覆盖工具注册、查询和生命周期管理

# 执行 Phase 4 — 输出结构化结果
========================================
Query: "工具注册模块"
Document tree: D:/project-docs/
Match results: 1 relevant specs found
========================================
```

---

### `generate.md` — Generate 指令定义

**Source**: `marketplace/skills/furina-codebase/instructions/generate.md`:1-159

**功能描述**：定义 generate 指令的完整执行流程，为中大型代码库从零开始构建层次化的结构化文档树。通过 5 个阶段将代码组织为"总索引 → 模块 → 子模块 → spec 文档"的层次结构，每个层次都有 toc.md 索引文件和详细的 spec 文档。

**输入参数**：
- `projectDir` (`string`, required): 要分析的源代码根目录
- `codebaseDir` (`string`, required): 文档树的根目录（输出目录）

**核心逻辑——5 阶段执行流程**：

**Phase 1（全局扫描 — 发现所有模块）**：使用 `prompt-modules-partitioner.md` 模板分派 Modules Partitioner SubAgent。该 SubAgent 读取项目顶层结构（目录列表、构建配置文件），综合考虑架构、业务、目录结构和全局视角进行模块划分，输出 `module-plan.json`。结果需展示给用户确认后方可继续。

**Phase 2（逐模块扫描 — 发现子模块和 spec）**：读取 Module Plan，对每个模块分批并行（每批 10 个）分派 SubModules Partitioner SubAgent。每个 SubAgent 深度扫描模块源码，确定子模块和独立 spec 的划分，输出 `module-{name}-plan.json`。

**Phase 3（逐子模块验证 — 校验并补充 Phase 2 方案）**：分批并行（每批 10 个）分派 SubModules Validator SubAgent。每个 Validator 深度扫描源码，验证规划信息的准确性（子模块名称、描述、源文件路径、spec 列表），并修正不准确的内容。

**Phase 4（初始概览文档）**：使用 `prompt-codebase-toptoc.md` 模板分派 Init-Top-Toc SubAgent，生成骨架版 `{codebaseDir}/toc.md`。

**Phase 5（按模块顺序处理）**：严格按模块顺序执行，包含以下子阶段：
- 5.1-5.3：逐子模块并行生成 spec 文档（每批 10 个，使用 `prompt-codebase-spec.md`）
- 5.4：子模块 spec 全部生成后，生成子模块 toc.md（使用 `prompt-codebase-submoduletoc.md`）
- 5.5：模块子项全部处理后，生成模块 toc.md（使用 `prompt-codebase-moduletoc.md`）
- 5.6：所有模块处理完毕后，用完整信息更新总 toc.md（使用 `template-top-toc.md`）
- 5.7：清理 `{codebaseDir}/.tmp/` 中间文件
- 5.8：综合评审（使用 `prompt-codebase-reviewer.md`，从全局视角优化总 toc.md）
- 5.9：最终检查索引可追溯性（使用 `prompt-codebase-checker.md`）
- 5.10：通过行数初筛 + 质量审查 + 源文件列表检查修复不合格 spec 文档

**核心代码**：
```markdown
### Phase 1: Global Scan — Discover All Modules

1. Strictly follow the template: `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/references/prompt-modules-partitioner.md` to dispatch the `Modules Partitioner Subagent`.
2. Present the module partitioning result given by `Modules Partitioner Subagent` to the user and wait for confirmation before proceeding to subsequent phases.
```
Source: `marketplace/skills/furina-codebase/instructions/generate.md`:44-47

**使用示例**：
```
# generate 指令调用
projectDir: D:/project-code/my-app/
codebaseDir: D:/project-docs/

# Phase 1: Modules Partitioner 输出模块划分
[module] 确认模块划分方案:
  - cli: CLI 命令层
  - server: 服务端核心
  - client: 客户端 UI
  - utils: 工具函数库

# 确认后继续
# Phase 2-5: 逐步生成完整文档树
[spec] server/anthropic-proxy/spec-proxy-handler.md — done
[toc] server/anthropic-proxy/toc.md — done
[toc] server/toc.md — done
```

---

### `synchronize.md` — Synchronize 指令定义

**Source**: `marketplace/skills/furina-codebase/instructions/synchronize.md`:1-176

**功能描述**：定义 synchronize 指令的完整执行流程，将源代码的增量变更同步回已有文档树。synchronize 指令与 generate 指令共享完全相同的文档生成规则和格式规范，确保通过 synchronize 创建或更新的文档可被 explore 天然检索。

**输入参数**：
- `codebaseDir` (`string`, required): 项目代码库的根目录
- 至少提供以下变更信息之一：
  - 修改文件路径（如 `src/electron/main/ipc/handler.ts`）
  - 修改代码内容（具体代码变更或 diff）
  - 变更描述（如"新增 IPC 文件读取处理器"）

**核心原则——严格增量，不扩大范围**：同步的唯一目的是处理用户提供的变更文件列表。具体约束包括：
1. 只创建/更新与变更文件直接对应的 spec，不修改无关 spec
2. 对已有 toc.md 只修改涉及变更的条目行，不重写整个文件
3. 除非变更文件明确属于新领域（需用户确认），否则不创建新模块/子模块
4. 增量更新模式下不执行全局依赖分析
5. 只读取变更文件及其直接依赖（一层），不追溯所有调用方

**核心逻辑——5 阶段执行流程**：

**Phase 1（判断代码库状态）**：检查 `{codebaseDir}` 是否存在且非空。分支 A（空）：切换到完整 generate 流程。分支 B（已存在）：执行增量更新——读取变更信息、定位受影响的 toc.md、执行范围自检、继续后续阶段。

**Phase 2（定位目标 spec）**：基于变更文件路径和根 toc.md 确定所属模块，再通过模块 toc.md 确定子模块或直接 spec。确定操作类型：添加 spec / 更新 spec / 删除 spec / 添加子模块 / 删除子模块。

**Phase 3（创建或更新 spec 文档）**：在更新前必须重新阅读 `guidance-specs-incremental.md`。关键约束：(1) 必须重新读取实际源文件；(2) 仅读取变更文件本身，不扩大范围；(3) 如果不影响外部接口则无需读取依赖文件；(4) 更新已有 spec 时只修改变更内容对应的段落，保留其他部分不变。

**Phase 4（自底向上索引更新）**：使用 `prompt-codebase-toc-sync.md` 模板分派 Toc Sync SubAgent，按 子模块 toc.md → 模块 toc.md → 根 toc.md 的顺序自底向上更新。

**Phase 5（验证索引可追溯性）**：仅验证本次变更涉及的条目范围（非全量检查），确保 spec 在 toc.md 中有对应条目，链接路径正确，源文件路径匹配。

**使用示例**：
```
# synchronize 指令调用（增量更新）
codebaseDir: D:/project-docs/
修改文件: src/tools/registry.ts

# Phase 2: 定位
[locate] Source file: src/tools/registry.ts
[locate] Owning module: tools
[locate] Owning submodule: tool-registry
[locate] Operation type: update-spec
[locate] Target spec: tools/tool-registry/spec-register.md

# Phase 3: 更新 spec
[spec] tools/tool-registry/spec-register.md — done

# Phase 4: 更新索引
[toc] tools/tool-registry/toc.md — updated
[toc] tools/toc.md — updated
[toc] toc.md — updated

# Phase 5: 验证
[check] tools/tool-registry/spec-register.md — passed
```

---

### `guidance-codebase.md` — 文档树概念规范

**Source**: `marketplace/skills/furina-codebase/references/guidance-codebase.md`:1-60

**功能描述**：定义文档树的核心概念和约束规范，是 generate 和 synchronize 指令的基础参考文档。规定了文档树各层级（概述、模块、子模块、spec 文档）的定义、路径规范、内容要求和规模约束。

**核心概念定义**：

**概述（Overview）**：路径 `{codebaseDir}/toc.md`，索引文件，建议不超过 500 行。包含项目详细介绍和所有模块的详细说明。概述是检索器的入口，描述必须足够详细以支持导航——例如用户搜索"MCP 实现"时，概述中的模块/子模块/spec 描述应能准确指向正确的下一级索引。

**模块（Module）**：大型领域集群，如工具模块、插件模块。路径 `{codebaseDir}/{moduleName}/`。划分原则：综合考虑架构、业务、目录结构和全局视角，不要过度依赖目录结构。约束：子模块 + spec 总数不超过 50。

**子模块（Submodule）**：较小的领域集群。路径 `{codebaseDir}/{moduleName}/{submodule}/`。包含 5-50 个 spec 文档（不再嵌套子模块）。

**Spec 文档（Spec Document）**：最小领域粒度，详细描述一个或几个紧密关联的源文件覆盖的最小业务逻辑。内容要求包括功能详情、接口详情、核心代码（来自实际源文件的代码片段）和代码范围标注（`{source_path}:start_line-end_line`）。

**使用示例**：
```markdown
# 文档树结构示例
docs/codebase/
├── toc.md                    ← 概述（≤500 行）
├── tools/
│   ├── toc.md                ← 模块索引（≤500 行）
│   ├── tool-registry/
│   │   ├── toc.md            ← 子模块索引（≤500 行）
│   │   ├── spec-register.md  ← spec 文档
│   │   └── spec-lifecycle.md
│   └── spec-config.md        ← 直接 spec
```

---

### `guidance-specs.md` — Spec 文档生成标准规范

**Source**: `marketplace/skills/furina-codebase/references/guidance-specs.md`:1-185

**功能描述**：定义 spec 文档生成的完整标准规范，是所有 spec 生成/更新操作（generate 和 synchronize）的核心参考文档。规定了核心原则、源文件读取范围、必须包含的内容章节和格式模板。

**核心原则**：
1. 必须全面、完整、专业——spec 不是功能清单，而是完整技术规范
2. 每个 spec 必须重新扫描源文件——规划文件仅是指导，源码是真相
3. 核心代码需要仔细判断——优先选择真正体现核心逻辑、关键算法和重要接口实现的代码
4. 内容长度要充足——不要草率或过于简洁

**源文件读取范围**：除了直接关联的源文件外，还需向上（查看谁调用了此代码）和向下（查看此代码依赖什么）扩展阅读，并将相关上下文补充到 spec 文档中。

**必须包含的内容章节**：
- **概述**：角色定位、设计动机、使用场景、涉及的源文件列表
- **架构/流程**：多步骤流程、状态机、调用链（如适用）
- **功能/接口详情**：每个重要函数/接口/方法的功能描述、参数详情、返回值详情、核心逻辑解释、核心代码（15-30 行）、代码来源标注、使用示例
- **数据结构**：关键类型、接口、枚举、常量
- **错误处理和边界情况**：错误处理策略、异常类型、边界条件
- **依赖关系**：依赖哪些其他模块/spec，被哪些模块/spec 依赖
- **使用示例**：完整的使用场景代码

---

### `guidance-specs-incremental.md` — 增量 Spec 生成规范

**Source**: `marketplace/skills/furina-codebase/references/guidance-specs-incremental.md`:1-193

**功能描述**：synchronize 指令专用的 spec 文档生成/更新规范。与 `guidance-specs.md` 内容完全一致，确保通过 synchronize 生成的 spec 与 generate 生成的 spec 可被 explore 无缝检索。增加了增量模式下的读取范围例外规则。

**增量模式例外规则**：
- 只读取变更文件本身，不扩大范围
- 如果变更不影响外部接口，无需读取依赖文件
- 如果影响外部接口，可读取直接导入的模块（仅一层），但不追溯调用方
- 更新已有 spec 时只修改变更内容对应的段落，保留其他部分不变

---

### `guidance-toc-incremental.md` — 增量 toc.md 更新规范

**Source**: `marketplace/skills/furina-codebase/references/guidance-toc-incremental.md`:1-224

**功能描述**：synchronize 指令专用的 toc.md 索引文件更新规范。定义了三级 toc.md 的格式规范（根 toc.md、模块 toc.md、子模块 toc.md）和增量更新规则。

**核心原则**：
1. 索引文件是检索器的导航入口，描述必须足够详细
2. 自底向上更新：子模块 toc.md → 模块 toc.md → 根 toc.md
3. 索引文件 ≤ 500 行
4. 每个条目必须有详细描述（不能只有名称）
5. 所有链接使用相对路径

**三级 toc.md 格式规范**：

根 toc.md 使用 `# {ProjectName} — Codebase` 标题，每个模块包含子模块列表（带详细描述和 spec 数量）和直接 spec 列表，附模块索引文件链接。

模块 toc.md 使用 `# {Module Readable Name}` 标题，包含模块关系图（ASCII 框图）、子模块表格（名称、描述、spec 数量、索引链接）和直接 spec 文档表格。

子模块 toc.md 使用 `# {Submodule Readable Name}` 标题，包含 spec 关系图（ASCII 框图）和 spec 文档表格。

**增量更新规则**：
- 添加 spec：在子模块 toc.md 添加行、更新模块 toc.md 的 spec 数量、在根 toc.md 补充描述
- 更新 spec：更新对应条目的描述和/或源文件路径
- 添加子模块：创建子模块目录和 toc.md、在模块 toc.md 添加行、在根 toc.md 添加条目
- 删除 spec：删除 spec 文件、移除三级 toc.md 中的对应条目
- 删除子模块：当子模块 spec 少于 5 个时提升为模块直接 spec

---

### `template-explore-output.md` — Explore 输出格式模板

**Source**: `marketplace/skills/furina-codebase/references/template-explore-output.md`:1-170

**功能描述**：定义 explore 指令 Phase 4 输出结果的格式规范。包含无结果处理格式、有结果时的输出结构（查询摘要、导航路径、spec 摘要、源码片段）以及强制性自检清单。

**输出结构**：
1. **查询摘要**：包含查询描述、文档树路径、匹配结果数量
2. **导航路径**：从总索引到 spec 的完整路径，附匹配原因
3. **Spec 摘要**：源文件列表、概述、关键函数/接口、核心数据结构
4. **源码片段**：直接源码 + 上游调用方 + 下游依赖（三部分缺一不可）

**源码长度规则**：
- ≤ 100 行：全量输出，不裁剪
- \> 100 行：可适当省略非核心代码，但必须保留核心逻辑的丰富代码细节

**省略标注要求**（三个条件必须全部满足）：
1. 在省略处写注释说明省略了哪些行及其原逻辑
2. 注释下方单独一行写 `...`
3. 删除原始源码中的无关注释

---

### `prompt-modules-partitioner.md` — 模块划分器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-modules-partitioner.md`:1-72

**功能描述**：定义 Modules Partitioner SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 1 中被分派，负责读取项目顶层结构（目录、构建配置文件），综合考虑架构、业务、目录结构和全局视角划分模块，并将结果写入 `{codebaseDir}/.tmp/module-plan.json`。

**输出格式**：
```json
{
  "modules": [
    {
      "name": "module identifier name",
      "display_name": "human-readable name",
      "description": "detailed description...",
      "source_paths": ["path1/", "path2/"],
      "estimated_children": "estimated number"
    }
  ]
}
```

---

### `prompt-submodules-partitioner.md` — 子模块划分器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-submodules-partitioner.md`:1-87

**功能描述**：定义 SubModules Partitioner SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 2 中被逐模块分派，深度扫描模块源码路径，确定子模块和独立 spec 的划分。输出 `{codebaseDir}/.tmp/module-{name}-plan.json`。

**输出格式**：JSON 对象包含 `module`（模块标识名）和 `children` 数组。每个 child 为 `type: "submodule"` 或 `type: "spec"`。submodule 包含 `name`、`display_name`、`description`、`source_paths` 和 `specs` 数组。每个 spec 包含 `name`、`display_name`、`description`、`source_files` 和 `line_range_hint`。

---

### `prompt-submodules-validator.md` — 子模块验证器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-submodules-validator.md`:1-56

**功能描述**：定义 SubModules Validator SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 3 中被分派，深度扫描源码验证 Phase 2 规划的准确性。逐个子模块检查名称、描述、源文件路径、spec 列表，并修正不准确的内容。结果写回原规划文件。

---

### `prompt-codebase-spec.md` — Spec 生成器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-codebase-spec.md`:1-44

**功能描述**：定义 Spec Generator SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 5.3 中被逐 spec 分派，遵循 `guidance-codebase.md` 和 `guidance-specs.md` 的要求生成单个 spec 文档。

**关键规则**：
1. 不允许使用脚本——所有分析和生成通过直接读取源文件完成
2. 每个 spec 必须重新扫描源文件——不能仅依赖中间规划文件
3. 核心代码需要仔细判断
4. spec 文档必须全面、专业

---

### `prompt-codebase-toptoc.md` — 顶部 toc 生成器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-codebase-toptoc.md`:1-27

**功能描述**：定义 Init-Top-Toc SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 4 中被分派，读取 `module-plan.json` 和所有 `module-xxx-plan.json` 文件，使用 `template-top-toc.md` 模板生成骨架版 `{codebaseDir}/toc.md`。

---

### `prompt-codebase-submoduletoc.md` — 子模块 toc 生成器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-codebase-submoduletoc.md`:1-43

**功能描述**：定义 Submodule Toc SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 5.4 中被逐子模块分派，读取子模块下所有 spec 文档和关键源文件，分析 spec 间的关系和依赖，使用 `template-submodule-toc.md` 模板生成子模块 toc.md。

---

### `prompt-codebase-moduletoc.md` — 模块 toc 生成器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-codebase-moduletoc.md`:1-45

**功能描述**：定义 Module Toc SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 5.5 中被逐模块分派，读取模块下所有子模块 toc.md 和直接 spec 文件，分析子模块间的关系和依赖，使用 `template-module-toc.md` 模板生成模块 toc.md。

---

### `prompt-codebase-reviewer.md` — 综合评审器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-codebase-reviewer.md`:1-55

**功能描述**：定义 Comprehensive Reviewer SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 5.8 中被分派，执行三项核心任务：(1) 内容评审——读取所有 spec 文档理解模块间连接和依赖；(2) 架构评审——从全局视角重新审视项目架构，生成模块依赖图（分层 ASCII 框图）；(3) 概述优化——更新总 toc.md，补充项目介绍、依赖图、入口描述等信息。

---

### `prompt-codebase-checker.md` — 索引可追溯性检查器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-codebase-checker.md`:1-33

**功能描述**：定义 Index Traceability Checker SubAgent 的提示模板。该 SubAgent 在 generate 指令 Phase 5.9 和 synchronize 指令 Phase 5 中被分派，执行索引可追溯性验证。验证内容包括：随机抽样描述验证检索路径（概述 → 模块索引 → 子模块索引 → spec 文档），模拟检索流验证 spec 质量和源码路径真实性。发现问题立即修复。

---

### `prompt-codebase-toc-sync.md` — toc 同步器模板

**Source**: `marketplace/skills/furina-codebase/references/prompt-codebase-toc-sync.md`:1-64

**功能描述**：定义 Toc Sync SubAgent 的提示模板。该 SubAgent 在 synchronize 指令 Phase 4 中被分派，接收完整的变更信息（spec 路径、操作类型、结构变更、涉及的源文件），按自底向上顺序（子模块 toc.md → 模块 toc.md → 根 toc.md）更新所有受影响的索引文件。核心约束：只更新与变更相关的条目，保留所有无关内容不变。

---

### `template-module-toc.md` — 模块 toc 格式模板

**Source**: `marketplace/skills/furina-codebase/references/template-module-toc.md`:1-33

**功能描述**：定义模块 toc.md 的标准格式模板。包含模块标题、详细描述、模块关系图（ASCII 框图）、子模块表格（Submodule、Description、Spec Count、Index 四列）和直接 spec 文档表格（Spec、Description、Source Files 三列）。

---

### `template-submodule-toc.md` — 子模块 toc 格式模板

**Source**: `marketplace/skills/furina-codebase/references/template-submodule-toc.md`:1-27

**功能描述**：定义子模块 toc.md 的标准格式模板。包含子模块标题、详细描述、spec 关系图（ASCII 框图）和 spec 文档表格（Spec、Description、Source Files 三列）。

---

### `template-top-toc.md` — 总 toc 格式模板

**Source**: `marketplace/skills/furina-codebase/references/template-top-toc.md`:1-28

**功能描述**：定义总 toc.md（概述）的标准格式模板。包含项目名称、项目描述、Module Overview 章节。每个模块包含子模块列表（带详细描述和 spec 数量）、直接 spec 列表和模块索引链接。

## Data Structures

### `matched_specs` — Explore 结果列表

```typescript
matched_specs = [
  {
    "spec_path": string,           // spec 文档的绝对路径
    "match_source": "master-index-direct-hit" | "module-direct-spec" | "submodule-spec",
    "match_reason": string         // 匹配原因说明
  }
]
```
- `spec_path`：匹配到的 spec 文档路径
- `match_source`：匹配来源，标识匹配发生在哪个层级
- `match_reason`：匹配原因，用于输出导航路径的解释

### `module-plan.json` — 模块规划数据

```json
{
  "modules": [
    {
      "name": "string",              // 模块标识名
      "display_name": "string",      // 人类可读名称
      "description": "string",       // 详细描述（职责、业务域、主要功能）
      "source_paths": ["string"],    // 模块源码目录列表
      "estimated_children": "string" // 子项估计数量
    }
  ]
}
```

### `module-{name}-plan.json` — 子模块规划数据

```json
{
  "module": "string",
  "children": [
    {
      "type": "submodule",
      "name": "string",
      "display_name": "string",
      "description": "string",
      "source_paths": ["string"],
      "specs": [
        {
          "name": "string",              // spec 文件名，如 spec-xxx.md
          "display_name": "string",      // 功能名称
          "description": "string",       // 覆盖的功能/接口描述
          "source_files": ["string"],    // 关联源文件路径
          "line_range_hint": "string"    // 行号范围提示，如 "120-350"
        }
      ]
    },
    {
      "type": "spec",
      "name": "string",
      "display_name": "string",
      "description": "string",
      "source_files": ["string"],
      "line_range_hint": "string"
    }
  ]
}
```
- `type: "submodule"`：子模块条目，包含嵌套的 `specs` 数组
- `type: "spec"`：独立 spec 条目，直接位于模块下

### SubAgent 分派模式

所有 SubAgent 通过通用 Agent 工具分派，参数格式统一为：
```
Agent tool (general-purpose):
  description: "{任务描述}"
  prompt: |
    {包含变量占位符的完整提示}
```
占位符包括 `{codebaseDir}`、`{projectDir}`、`{language}`、`{module-name}` 等，在分派时替换为实际值。

## Error Handling and Edge Cases

### 参数缺失处理
- 当 `codebaseDir` 或 `instruction`（SKILL.md）、`userQuery`（explore）、`projectDir`（generate）等必要参数缺失时，**必须**使用 `AskUserQuestion` 工具向用户询问
- 不询问可选参数

### Explore 无结果处理
- 当总索引中未找到匹配时，直接进入 Phase 4 输出"无结果"消息
- 附带可能原因：查询描述不够精确、文档树尚未覆盖此功能模块、功能可能使用不同名称

### Synchronize 代码库为空检测
- 当 `{codebaseDir}` 不存在或为空时，自动切换到完整的 generate 流程（Branch A）
- 执行前需向用户确认

### Synchronize 子模块结构变更
- 添加子模块：当添加 spec 导致某领域超过 5 个 spec 时，创建新子模块（需用户确认）
- 删除子模块：当删除操作导致子模块 spec 少于 5 个时，将剩余 spec 提升为模块直接 spec

### Generate 不合格 spec 修复
- 通过行数初筛（低于平均行数一半的 spec）+ 质量审查（功能描述、核心代码、示例、行号匹配）+ 源文件列表检查（前 5 行是否包含源文件列表）三层过滤
- 修复方式：重新读取源文件并按 guidance-specs.md 重新生成，而非大规模返工

### 文档行数约束
- 所有 toc.md 文件（概述、模块索引、子模块索引）建议不超过 500 行
- 综合评审阶段允许在 500 行内权衡：信息完整性优先于行数控制
- 总 toc.md 不得附加统计章节（如"生成统计"、"文档统计"）

### 测试文件过滤
- 匹配 `*.test.ts`、`*.test.js`、`*.spec.ts`、`*.spec.js`、`__tests__/**`、`**/test/**`、`**/tests/**` 等测试相关模式的文件全部跳过，不生成 spec 文档，不纳入代码库

## Dependencies

### Depends on
- **`furina config` 命令**（通过 `furina config show language`）：获取用户配置的语言偏好
- **`${CLAUDE_PLUGIN_ROOT}` 变量**：Claude Code 插件系统提供的插件根目录变量，用于定位所有参考文档和模板文件
- **Claude Code Agent 工具**：用于分派 SubAgent（Modules Partitioner、SubModules Partitioner、SubModules Validator、Spec Generator、Init-Top-Toc、Submodule Toc、Module Toc、Comprehensive Reviewer、Index Traceability Checker、Toc Sync）
- **Claude Code AskUserQuestion 工具**：用于在必要参数缺失时询问用户
- **用户确认机制**：Phase 1 模块划分结果需展示给用户确认后方可继续

### Depended by
- **`furina-explore` 技能**：explore 技能在 `instructions/codebase.md` 中调用 codebase explore 指令来查询代码库文档树
- **`furina-finalize` 技能**：finalize 技能在 `instructions/syncbase.md` 中调用 codebase synchronize 指令来同步代码变更
- **`furina:workflow` 工作流命令**：工作流的 Explore 阶段和 Finalize 阶段间接使用 codebase 技能的能力

## Usage Examples

### Explore 完整使用场景

```markdown
# 1. 用户通过 Claude Code 触发 explore
# 输入: codebaseDir = D:/project-docs/, userQuery = "MCP 协议实现"

# 2. Phase 1: 读取总索引
#    匹配到 server 模块（描述包含 "MCP" 关键词）

# 3. Phase 2: 下钻
#    2A: 读取 server/toc.md，匹配到 anthropic-proxy 子模块
#    2B: 读取 server/anthropic-proxy/toc.md，匹配到 spec-proxy-handler.md

# 4. Phase 3: 验证相关性
#    读取 spec-proxy-handler.md → 确认覆盖 MCP 请求处理逻辑
#    读取源码 src/server/anthropic-proxy/handler.ts → 确认包含 MCP 核心实现
#    上溯: src/server/app.ts 中的路由注册
#    下溯: src/server/anthropic-proxy/proxy-types.ts 中的类型定义

# 5. Phase 4: 输出结构化结果
========================================
Query: "MCP 协议实现"
Document tree: D:/project-docs/
Match results: 1 relevant specs found
========================================

Path 1 (submodule spec):
  Master index → server → anthropic-proxy → spec-proxy-handler.md
  Match reason: spec-proxy-handler.md 覆盖 MCP 请求处理器的完整实现

---
## Spec: MCP 请求处理器

Source files:
- `src/server/anthropic-proxy/handler.ts` : 1-180

Overview: 覆盖 MCP 协议的请求处理器...

关键函数/接口:
- `handleMcpRequest(req, res)`: 处理 MCP 协议请求
- `parseMcpPayload(body)`: 解析 MCP 消息体
...
```

### Generate 完整使用场景

```markdown
# 1. 用户通过 Claude Code 触发 generate
# 输入: projectDir = D:/project-code/my-app/, codebaseDir = D:/project-docs/

# 2. Phase 1: 全局扫描
#    Modules Partitioner 扫描项目结构
#    输出模块划分: cli, server, client, utils
#    → 展示给用户确认

# 3. Phase 2: 逐模块扫描（并行，每批 10 个）
#    SubModules Partitioner 为每个模块输出子模块/spec 方案
#    [module] cli — plan complete, containing 1 submodule(s) and 3 standalone spec(s).

# 4. Phase 3: 逐模块验证（并行，每批 10 个）
#    SubModules Validator 验证并修正方案

# 5. Phase 4: 生成骨架版总 toc.md

# 6. Phase 5: 按模块顺序处理
#    [spec] cli/change/spec-change-new.md — done
#    [spec] cli/change/spec-change-stage.md — done
#    [toc] cli/change/toc.md — done
#    [toc] cli/toc.md — done
#    ... (其他模块类似)
#    [toc] toc.md — done (完整更新)

# 7. Phase 5.8: 综合评审 → 优化总 toc.md
# 8. Phase 5.9: 最终检查 → 验证索引可追溯性
# 9. Phase 5.10: 修复不合格 spec
```

### Synchronize 完整使用场景

```markdown
# 1. 用户通过 Claude Code 触发 synchronize
# 输入: codebaseDir = D:/project-docs/, 修改文件: src/server/anthropic-proxy/handler.ts

# 2. Phase 1: 代码库已存在 → Branch B 增量更新
#    读取根 toc.md → 确定受影响模块: server

# 3. Phase 2: 定位
#    读取 server/toc.md → 确定子模块: anthropic-proxy
#    确定操作类型: update-spec
#    目标 spec: server/anthropic-proxy/spec-proxy-handler.md
#    [locate] Source file: src/server/anthropic-proxy/handler.ts
#    [locate] Owning module: server
#    [locate] Owning submodule: anthropic-proxy
#    [locate] Operation type: update-spec

# 4. Phase 3: 更新 spec
#    重新阅读 guidance-specs-incremental.md
#    读取变更的源文件 handler.ts
#    只修改 spec 中与变更对应的函数描述和核心代码段
#    [spec] server/anthropic-proxy/spec-proxy-handler.md — done

# 5. Phase 4: Toc Sync SubAgent 自底向上更新
#    [toc] server/anthropic-proxy/toc.md — updated
#    [toc] server/toc.md — updated
#    [toc] toc.md — updated

# 6. Phase 5: 验证索引可追溯性（仅变更范围）
#    [check] server/anthropic-proxy/spec-proxy-handler.md — passed
```
