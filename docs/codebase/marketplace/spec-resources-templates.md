# Resource Templates & Configuration

> Source files:
> - `resources/furina.json` : 1-61
> - `resources/claude-providers-template.json` : 1-134
> - `resources/proposal-template.json` : 1-9
> - `resources/design-template.json` : 1-16
> - `resources/specs-template.json` : 1-22
> - `resources/agents/backgroud-designer.md` : 1-20
> - `resources/agents/backgroud-grouper.md` : 1-21
> - `resources/skills/compose-design/SKILL.md` : 1-72
> - `resources/skills/group-design/SKILL.md` : 1-204

## 概述

本 Spec 覆盖 Furina 插件随附的全部静态资源文件。这些资源在运行时由插件各模块加载，为配置管理、LLM 提供者注册、变更制品生成、定时记忆同步等核心功能提供默认数据和指令模板。

**设计动机**：Furina 的工作流（Workflow）覆盖从探索（Explore）、提案（Propose）、计划（Plan）到编码（Coding）、终稿（Finalize）的完整软件开发生命周期。每个阶段需要：(1) 一套可覆盖的项目配置来控制行为开关和阶段级 LLM 提供者映射；(2) 一组内置 LLM 提供者预设，让用户快速接入不同模型；(3) 标准化的制品模板（proposal/design/specs），定义各阶段产物的结构、生成指令和依赖关系；(4) Agent 与 Skill 定义，用于定时记忆同步中的设计文档整合和项目群聚类。

**资源文件总览**：

| 文件 | 类型 | 职责 |
|------|------|------|
| `furina.json` | 配置 | 项目级默认配置：语言、阶段级 Provider 映射、探索目标、实验性开关、增强规则、记忆调度 |
| `claude-providers-template.json` | 模板 | 内置 LLM 提供者注册表，包含 12 个提供者的 baseUrl、模型名、图标映射 |
| `proposal-template.json` | 模板 | proposal.md 制品模板，定义 WHY 变更的指令与 Markdown 骨架 |
| `design-template.json` | 模板 | design.md 制品模板，定义 HOW 实现的指令与 Markdown 骨架 |
| `specs-template.json` | 模板 | specs 制品模板，支持 ADDED/MODIFIED/REMOVED/RENAMED 四种 Delta 操作 |
| `agents/backgroud-designer.md` | Agent 定义 | 设计文档整合助手，调用 compose-design 技能合并多份变更设计文档 |
| `agents/backgroud-grouper.md` | Agent 定义 | 项目群聚类助手，调用 group-design 技能从设计文档中划定项目群 |
| `skills/compose-design/SKILL.md` | Skill 定义 | 设计文档合并技能，含新建/增量更新两套流程和一致性规则 |
| `skills/group-design/SKILL.md` | Skill 定义 | 项目群聚类技能，含四阶段流程（解析、聚类、文档生成、JSON 注册）和多维相似度模型 |

## 架构 / 数据流

资源文件在系统中的加载和使用路径可分为三条主线：

**主线一：配置加载与覆盖**（由 `src/utils/config.ts` 驱动）

```
resources/furina.json (默认配置)
        |
        v
    loadConfig()
        |
        +-- deepMerge(default, override)
        |       |
        |       +-- {cwd}/.claude/furina.json (项目级覆盖，可选)
        |
        v
    FurinaConfigSchema.safeParse()  -- Zod 验证
        |
        v
    FurinaConfig (合并后的配置对象)
```

`loadConfig()` 每次调用都从磁盘重新读取，不做缓存，确保始终反映最新文件状态。项目级覆盖文件缺失时不报错，JSON 格式错误时降级为默认配置。Zod 验证失败的叶子节点会被剥离，后续 `queryConfig()` 查询返回 `undefined`。

**主线二：制品模板填充**（由 `src/commands/change/instruction.ts` 驱动）

```
resources/{artifactId}-template.json
        |
        v
    readTemplateFile(artifactId)  -- 读取 JSON 模板
        |
        v
    替换 [change-name] 占位符
        |
        v
    检查依赖文件存在性 (proposal.md / design.md)
        |
        v
    输出 instruction JSON 到 stdout
```

模板中的 `[change-name]` 占位符在 `changeName`、`outputPath` 字段中被全局替换为实际变更名称。依赖文件的 `done` 字段根据文件系统中是否存在对应文件动态更新。

**主线三：定时记忆同步**（由 `src/server/memory/scheduler.ts` 驱动）

```
resources/agents/  ──┐
                     ├─ fs.cpSync() ──> 项目 .claude/ 目录
resources/skills/  ──┘
                              |
                              v
                    claude --agent backgroud-designer
                              |
                              v
                    compose-design 技能执行 (合并设计文档)
                              |
                              v
                    claude --agent backgroud-grouper
                              |
                              v
                    group-design 技能执行 (项目群聚类)
                              |
                              v
                    project-groups.json + project-groups.md
```

调度器从 `furina.json` 的 `enhancement.memory.schedule` 读取 cron 表达式，每天扫描 `~/.furina/memory/` 下的 `Memory_*` 目录，对有 `designs/` 的目录执行上述流程。

## 功能 / 接口详情

### `furina.json` -- 项目默认配置

**源文件**: `resources/furina.json`:1-61

**功能描述**: 这是整个 Furina 插件的根配置文件，定义所有可配置项的默认值。它不直接暴露 API，而是通过 `src/utils/config.ts` 的 `loadConfig()` 函数加载，并与项目级覆盖（`{cwd}/.claude/furina.json`）做深度合并后对外提供。每个字段都有对应的 Zod schema 定义，用于运行时验证。

**配置结构详解**:

顶层字段分为六大块：

**1. `language`** (`string`): 界面语言设置，默认 `"chinese"`。控制 Agent/Skill 执行时的输出语言。

**2. `switchProviders`** (`object`): 阶段级 LLM Provider 映射表，将工作流的每个阶段映射到一个提供者配置。七个阶段键分别为：
- `workflow`: 工作流主循环阶段
- `explore`: 探索阶段
- `propose`: 提案生成阶段
- `plan`: 计划阶段
- `review`: 审查阶段
- `coding`: 编码阶段
- `finalize`: 终稿阶段

每个值为字符串，`"default"` 表示使用 Claude Code 默认提供者，其他值对应 `claude-providers-template.json` 中的提供者名称。Hooks 模块（`furina_hooks.js`）在 `before-agent`/`after-agent` 事件中读取此映射来执行动态 Provider 切换。

**3. `project`** (`object`): 项目路径配置：
- `sourcecode` (`string`): 源码目录路径，默认 `"./"`
- `codebase.enable` (`boolean`): 是否启用 codebase 文档功能，默认 `false`
- `codebase.path` (`string`): codebase 文档存储路径，默认 `"docs/codebase"`

**4. `exploration`** (`object`): 探索目标配置，包含四个分类数组：
- `codebase`: codebase 目录列表
- `repository`: 仓库目录列表，每项含 `path`、`type`（可选）、`description`（可选）
- `reference`: 参考资料列表
- `specification`: 规范文档列表

默认配置在 `repository` 下预设了 `./furina/` 目录，描述为查看已归档和进行中的变更以获取全局历史参考。

**5. `experimental`** (`object`): 实验性功能开关：
- `explore` (`boolean`): 是否启用探索功能，默认 `true`
- `websearch` (`boolean`): 是否启用网页搜索，默认 `true`
- `context7` (`boolean`): 是否启用 Context7，默认 `true`
- `review` (`object`): 六个审查开关
  - `furina` (`boolean`): Furina 制品审查，默认 `false`
  - `propose` (`boolean`): 提案审查，默认 `false`
  - `plan` (`boolean`): 计划审查，默认 `false`
  - `specs` (`boolean`): 规格审查，默认 `false`
  - `code` (`boolean`): 代码审查，默认 `true`
  - `acceptance` (`boolean`): 验收审查，默认 `true`
- `prompt.reviewCode` (`string|null`): 自定义代码审查提示词，默认 `null`
- `coverage` (`string`): 测试覆盖率目标，默认 `"70%"`
- `budget` (`boolean`): 是否启用预算控制，默认 `true`
- `factor` (`number`): 功能数量因子，用于工作流模式判断，默认 `1`

**6. `enhancement`** (`object`, 可选): 增强配置：
- `context` (`null`): 增强上下文，默认 `null`
- `rules` (`object`): 三个分类的增强规则数组 — `design`、`specs`、`implement`，均默认为空数组
- `memory.schedule` (`string`): 定时记忆同步的 cron 表达式，默认 `"14 18 * * *"`（每天 18:14）

**核心代码**:

```json
{
  "language": "chinese",
  "switchProviders": {
    "workflow": "default",
    "explore": "default",
    "propose": "default",
    "plan": "default",
    "review": "default",
    "coding": "default",
    "finalize": "default"
  },
  "project": {
    "sourcecode": "./",
    "codebase": { "enable": false, "path": "docs/codebase" }
  },
  "experimental": {
    "explore": true,
    "websearch": true,
    "context7": true,
    "review": {
      "furina": false,
      "propose": false,
      "plan": false,
      "specs": false,
      "code": true,
      "acceptance": true
    },
    "coverage": "70%",
    "budget": true,
    "factor": 1
  }
}
```
Source: `resources/furina.json`:1-61

**使用示例**:

```typescript
// config.ts 中的 loadConfig() 加载流程
const config = loadConfig(process.cwd());
// 合并后查询单个配置值
const lang = queryConfig(config, 'language');              // "chinese"
const provider = queryConfig(config, 'switchProviders.coding'); // "default"
const coverage = queryConfig(config, 'experimental.coverage');  // "70%"
```
Explanation: `loadConfig()` 先读取 `resources/furina.json`，再尝试读取 `{cwd}/.claude/furina.json`，两者深度合并后经 Zod 验证返回。`queryConfig()` 通过点分路径访问嵌套值。

---

### `claude-providers-template.json` -- 内置 LLM Provider 注册表

**源文件**: `resources/claude-providers-template.json`:1-134

**功能描述**: 存储所有内置 LLM 提供者预设配置的 JSON 数组文件。每个提供者定义了 API 端点、模型映射和品牌图标信息。该文件同时支持通过 `addProviderTemplate()` 追加自定义提供者和通过 `deleteProviderTemplate()` 删除自定义提供者（内置提供者不可删除）。UI 层读取此文件展示 Provider 选择列表。

**提供者清单**（12 个内置条目）:

| 名称 | baseUrl | 默认模型 | source |
|------|---------|---------|--------|
| Claude Official | `https://api.anthropic.com` | *(空，使用客户端默认)* | builtin |
| DeepSeek | `https://api.deepseek.com/anthropic` | `deepseek-v4-pro` | builtin |
| Xiaomi MiMo | `https://api.xiaomimimo.com/anthropic` | `mimo-v2.5-pro` | builtin |
| Xiaomi MiMo Token Plan (China) | `https://token-plan-cn.xiaomimimo.com/anthropic` | `mimo-v2.5-pro` | builtin |
| Zhipu GLM | `https://open.bigmodel.cn/api/anthropic` | `glm-5.1` | builtin |
| Zhipu GLM en | `https://api.z.ai/api/anthropic` | `glm-5.1` | builtin |
| MiniMax | `https://api.minimaxi.com/anthropic` | `MiniMax-M2.7` | builtin |
| MiniMax en | `https://api.minimax.io/anthropic` | `MiniMax-M2.7` | builtin |
| Kimi | `https://api.moonshot.cn/anthropic` | `kimi-k2.6` | builtin |
| Kimi For Coding | `https://api.kimi.com/coding/` | *(空)* | builtin |
| Bailian | `https://dashscope.aliyuncs.com/apps/anthropic` | *(空)* | builtin |
| Bailian For Coding | `https://coding.dashscope.aliyuncs.com/apps/anthropic` | *(空)* | builtin |

**核心代码**:

```json
{
  "name": "DeepSeek",
  "websiteUrl": "https://platform.deepseek.com",
  "baseUrl": "https://api.deepseek.com/anthropic",
  "iconSvg": "deepseek.svg",
  "defaultModel": "deepseek-v4-pro",
  "sonnetModel": "deepseek-v4-pro",
  "opusModel": "deepseek-v4-pro",
  "haikuModel": "deepseek-v4-flash",
  "source": "builtin"
}
```
Source: `resources/claude-providers-template.json`:14-23

**关键设计决策**:
- 模型字段分为四档（`defaultModel`、`sonnetModel`、`opusModel`、`haikuModel`），映射到 Claude 的三个智能等级。部分提供者（如 Claude Official、Kimi For Coding、Bailian）的模型字段留空，表示由客户端或 API 端自动选择。
- `source` 字段区分 `"builtin"`（来自资源文件）和 `"custom"`（通过 API 添加）。`addProviderTemplate()` 强制将新模板标记为 `"custom"`，`deleteProviderTemplate()` 仅允许删除 `"custom"` 模板。
- 提供者名称在模板列表中必须唯一，`addProviderTemplate()` 会在写入前检查重名。

**使用示例**:

```typescript
// provider-templates.ts 中的读写操作
const templates = readProviderTemplates();
// templates 包含 12 个内置提供者

// 添加自定义提供者
const newProvider = addProviderTemplate({
  name: "My Provider",
  baseUrl: "https://my-api.com/anthropic",
  defaultModel: "my-model-v1",
});
// newProvider.source === "custom"

// 删除自定义提供者
deleteProviderTemplate("My Provider"); // true

// 尝试删除内置提供者
deleteProviderTemplate("DeepSeek"); // throws Error: Cannot delete builtin template
```
Explanation: `readProviderTemplates()` 从磁盘读取 JSON 文件并解析为 `ProviderTemplate[]`。`addProviderTemplate()` 强制 `source='custom'` 并在重名时抛出异常。`deleteProviderTemplate()` 仅允许删除 `source='custom'` 的模板。

---

### `proposal-template.json` -- 提案制品模板

**源文件**: `resources/proposal-template.json`:1-9

**功能描述**: 定义 `proposal.md` 制品的生成指令和 Markdown 骨架。这是变更生命周期中的第一个制品，回答 **WHY** 这个变更需要发生。该模板由 `src/commands/change/instruction.ts` 的 `readTemplateFile('proposal')` 加载，`[change-name]` 占位符被替换后输出给 Agent（如 `furina-propose` skill）使用。

**模板字段详解**:

| 字段 | 类型 | 含义 |
|------|------|------|
| `changeName` | `string` | 占位符 `[change-name]`，运行时被替换为实际变更名 |
| `artifactId` | `string` | 制品标识，固定为 `"proposal"` |
| `outputPath` | `string` | 输出路径模板 `furina/changes/[change-name]/proposal.md` |
| `description` | `string` | 制品描述：`"Initial proposal document outlining the change"` |
| `instruction` | `string` | 详细的生成指令，指导 Agent 创建提案文档 |
| `template` | `string` | Markdown 骨架模板 |
| `dependencies` | `array` | 依赖列表，proposal 无依赖（空数组） |

**instruction 指令要点**:
- 为什么需要此变更（1-2 句话说明问题或机会）
- 什么会改变（变更列表，标记 BREAKING）
- **Capabilities 章节**（关键）：标识将创建或修改哪些 specs，区分 New Capabilities 和 Modified Capabilities
- 影响范围（受影响的代码、API、依赖）

**核心代码**:

```json
{
  "changeName": "[change-name]",
  "artifactId": "proposal",
  "outputPath": "furina/changes/[change-name]/proposal.md",
  "description": "Initial proposal document outlining the change",
  "instruction": "Create the proposal document that establishes WHY this change is needed.\n\nSections:\n- **Why**: 1-2 sentences on the problem or opportunity...\n- **What Changes**: Bullet list of changes...\n- **Capabilities**: Identify which specs will be created or modified...\n- **Impact**: Affected code, APIs, dependencies, or systems.",
  "template": "## Why\n\n<!-- Explain the motivation -->\n\n## What Changes\n\n<!-- Describe what will change -->\n\n## Capabilities\n\n### New Capabilities\n- `<name>`: <brief description>\n\n### Modified Capabilities\n- `<existing-name>`: <what requirement is changing>\n\n## Impact\n\n<!-- Affected code, APIs, dependencies, systems -->",
  "dependencies": []
}
```
Source: `resources/proposal-template.json`:1-9

**使用示例**:

```typescript
// instruction.ts 中的模板加载与填充
const templateRaw = JSON.stringify(readTemplateFile('proposal'));
const filledRaw = templateRaw.replace(/\[change-name\]/g, 'my-feature');
const result = JSON.parse(filledRaw);
// result.changeName === "my-feature"
// result.outputPath === "furina/changes/my-feature/proposal.md"
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
```
Explanation: 读取模板 JSON，将所有 `[change-name]` 替换为实际变更名 `my-feature`，然后输出完整的 instruction JSON 供 Agent 消费。

---

### `design-template.json` -- 设计制品模板

**源文件**: `resources/design-template.json`:1-16

**功能描述**: 定义 `design.md` 制品的生成指令和 Markdown 骨架。这是变更生命周期中的第二个制品，回答 **HOW** 实现此变更。依赖于 `proposal` 制品已完成。

**模板字段详解**:

与 proposal-template 相同的基础结构，但有以下区别：
- `artifactId`: `"design"`
- `outputPath`: `furina/changes/[change-name]/design.md`
- `dependencies`: 包含一个 proposal 依赖项

**instruction 指令要点**:
- 何时创建 design.md（跨模块变更、新架构模式、新外部依赖、安全/性能/迁移复杂性等）
- 章节结构：Context、Goals/Non-Goals、Decisions（关键技术选择及理由）、Risks/Trade-offs、Migration Plan、Open Questions
- 强调关注架构和方法论，而非逐行实现细节
- 好的设计文档要解释技术决策背后的 "why"

**核心代码**:

```json
{
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
Source: `resources/design-template.json`:8-15

`done: true` 是模板中的默认值。在 `runChangeInstruction()` 运行时，系统检查 `furina/changes/{name}/proposal.md` 是否实际存在，将 `done` 字段动态更新为 `true` 或 `false`。

**使用示例**:

```typescript
// instruction.ts 中的依赖检查逻辑
if (artifactId === 'design') {
  const deps = result.dependencies;
  if (deps.length > 0) {
    const proposalPath = path.join(process.cwd(), 'furina', 'changes', name, 'proposal.md');
    deps[0].done = fs.existsSync(proposalPath);
  }
}
```
Explanation: 读取 design 模板后，检查 proposal.md 是否存在于变更目录中，动态更新依赖的完成状态。这使得 Agent 在执行时能知道前置制品是否已就绪。

---

### `specs-template.json` -- 规格制品模板

**源文件**: `resources/specs-template.json`:1-22

**功能描述**: 定义 specs 制品的生成指令和 Markdown 骨架。这是变更生命周期中定义 **WHAT** 系统应该做的制品。支持四种 Delta 操作（ADDED/MODIFIED/REMOVED/RENAMED），用于增量规格管理。

**Delta 操作说明**:

| 操作 | 用途 | 关键要求 |
|------|------|---------|
| ADDED | 新增能力 | 直接描述需求和场景 |
| MODIFIED | 修改行为 | **必须**包含完整更新内容（不是增量片段） |
| REMOVED | 废弃功能 | **必须**包含 Reason 和 Migration |
| RENAMED | 重命名 | 使用 FROM:/TO: 格式 |

**格式规范**:
- 每个需求：`### Requirement: <name>` 后跟描述
- 使用 SHALL/MUST 作为规范性要求词（避免 should/may）
- 每个场景：`#### Scenario: <name>` 使用 WHEN/THEN 格式
- **关键**：场景标题必须使用四个 `#`（`####`），使用三个 `#` 或列表会导致静默失败
- 每个需求**必须**至少有一个场景

**依赖关系**: specs 依赖 proposal 和 design 两个制品：

```json
{
  "dependencies": [
    { "id": "proposal", "done": true, "path": "proposal.md", "description": "Initial proposal document outlining the change" },
    { "id": "design", "done": false, "path": "design.md", "description": "Technical design document with implementation details" }
  ]
}
```
Source: `resources/specs-template.json`:8-21

**核心代码**（template 字段）:

```markdown
## ADDED Requirements

### Requirement: <!-- requirement name -->
<!-- requirement text -->

#### Scenario: <!-- scenario name -->
- **WHEN** <!-- condition -->
- **THEN** <!-- expected outcome -->
```
Source: `resources/specs-template.json`:7

**使用示例**:

```typescript
// instruction.ts 中 specs 的双重依赖检查
if (artifactId === 'specs' && deps.length > 1) {
  const proposalPath = path.join(process.cwd(), 'furina', 'changes', name, 'proposal.md');
  deps[0].done = fs.existsSync(proposalPath);
  const designPath = path.join(process.cwd(), 'furina', 'changes', name, 'design.md');
  deps[1].done = fs.existsSync(designPath);
}
```
Explanation: specs 模板依赖 proposal 和 design 两个前置制品。运行时分别检查两者是否存在，更新 `done` 状态。注意 design 的模板默认 `done: false`，因为 design 通常在 proposal 之后才创建。

---

### `agents/backgroud-designer.md` -- 设计文档整合 Agent

**源文件**: `resources/agents/backgroud-designer.md`:1-20

**功能描述**: 定义一个专门用于设计文档整合的 Claude Code Agent。当定时记忆调度器（`scheduler.ts`）扫描到 `~/.furina/memory/Memory_*/` 目录下有 `designs/` 文件夹时，会将 `resources/agents/` 复制到项目的 `.claude/agents/` 目录，然后通过 `claude --agent backgroud-designer` 命令启动此 Agent。

**Agent 配置**:
- `name`: `backgroud-designer`
- `description`: 仅在用户明确说"使用 backgroud-designer"时触发
- `tools`: Read, Grep, Glob, Bash, Edit, Write
- `skills`: compose-design

**执行流程**: 接收变更设计文档列表后，调用 `compose-design` 技能将多份变更设计文档合并到项目的主设计文档中。

**核心代码**:

```markdown
---
name: backgroud-designer
description: 仅在用户明确说"使用 backgroud-designer"时触发。专业的设计文档整合助手。
tools: Read, Grep, Glob, Bash, Edit, Write
skills:
  - compose-design
---

你是一个设计文档整合助手。你的任务是将用户提供的多个变更设计文档合并到项目的主设计文档中。

## 输入
- `变更设计文档列表` <必填>：需要合并的变更设计文档列表

## 执行步骤
你必须严格、准确地按照以下步骤执行：
1. 调用技能：compose-design
```
Source: `resources/agents/backgroud-designer.md`:1-20

**使用场景**: `scheduler.ts` 中的 `executeClaudeDesigner()` 函数构造命令：

```typescript
const command = `claude --add-dir "${designsDir}" --agent backgroud-designer --permission-mode bypassPermissions -p "使用子代理：backgroud-designer 按照它的要求和步骤处理。变更设计文档列表为： ${designMdList}"`;
```

---

### `agents/backgroud-grouper.md` -- 项目群聚类 Agent

**源文件**: `resources/agents/backgroud-grouper.md`:1-21

**功能描述**: 定义一个专门用于项目群聚类的 Claude Code Agent。在所有单项目的设计文档整合完成后，调度器会收集各项目的 `project-design.md`，复制到 `~/.furina/memory/Project_Group/` 目录，然后通过 `claude --agent backgroud-grouper` 启动此 Agent 进行跨项目聚类。

**Agent 配置**:
- `name`: `backgroud-grouper`
- `description`: 仅在用户明确说"使用 backgroud-grouper"时触发
- `tools`: Read, Grep, Glob, Bash, Edit, Write
- `skills`: group-design

**执行要点**:
1. 调用 `group-design` 技能完成四阶段聚类
2. 落盘 `project-groups.json` 前必须严格核对字段结构与模板一致 — `members` 是 `string[]` 非对象数组，`projectPortrait` 含排除项，不添加模板外字段

**核心代码**:

```markdown
---
name: backgroud-grouper
description: 仅在用户明确说"使用 backgroud-grouper"时触发。
tools: Read, Grep, Glob, Bash, Edit, Write
skills:
  - 调用技能：group-design
---

从一批设计文档中识别共性、划定**项目群**，把人的架构直觉转化为可量化的相似度 + 可解释的画像。

## 输入
- `设计文档列表` <必填>：要归并的设计文档列表

## 执行步骤
你必须严格、准确地按照以下步骤执行：
1. 调用技能：group-design
2. 落盘 `project-groups.json` 前务必核对：字段结构与技能阶段4模板**严格一致**
```
Source: `resources/agents/backgroud-grouper.md`:1-21

---

### `skills/compose-design/SKILL.md` -- 设计文档合并技能

**源文件**: `resources/skills/compose-design/SKILL.md`:1-72

**功能描述**: 定义将多份变更设计文档合并到项目主设计文档（`project-design.md`）的完整流程。支持两种模式：首次创建（文件不存在）和增量更新（文件已存在）。是 `backgroud-designer` Agent 的核心技能。

**执行流程**:

**步骤 1**: 检查主设计文档是否已存在

**步骤 2 - 创建模式**（文件不存在）:
- 读取所有变更设计文档
- 识别核心架构章节：概述、组件、数据模型、接口、非功能性需求、流程图
- 智能合并：去除重复、合并相关章节、冲突时保留更详细内容
- 使用 Markdown 标题层级组织后写入

**步骤 3 - 更新模式**（文件已存在）:
- 读取主设计文档和所有变更设计文档
- 分析新增章节、已有章节更新、冲突内容（优先采用较新信息）
- 使用 Edit 工具做精确编辑：插入新章节、替换整个章节、在已有章节内添加细节
- 仅当更新涉及大部分内容且 Edit 不可行时才使用 Write 完整重写
- 编辑后重新读取确认结构和 Markdown 语法正确

**步骤 4 - 合并与一致性规则**:
- 不得删除与本次更新无关的已有章节
- 保持标题层级和格式风格一致
- 新增主要章节作为顶层 `##` 标题在逻辑位置插入
- 每次操作后更新文档顶部日期戳

**步骤 5 - 返回项目设计概要**:
- 从 `project-design.md` 提取 `项目参考指南文档`
- 写入 `project-portrait.md`（不超过 50 行），包含项目关键功能和参考指引

**红线规则**:
- 不得读取 `主设计文档路径` 和 `变更设计文档列表` 以外的任何文档
- `project-portrait.md` 和 `project-design.md` 都必须使用中文

---

### `skills/group-design/SKILL.md` -- 项目群聚类技能

**源文件**: `resources/skills/group-design/SKILL.md`:1-204

**功能描述**: 从一批设计文档中识别共性、划定项目群（Project Group），将架构直觉转化为可量化的相似度和可解释的画像。支持首次划分和基于既有 `project-groups.json` 的增量更新。是 `backgroud-grouper` Agent 的核心技能。

**输入**:
- `设计文档列表`（必填）：文件路径、链接、文本片段或结构化摘要
- `聚类阈值`（可选，默认 `0.6`）：归入已有项目群的相似度门槛

**输出**:
- `project-groups.md`：Markdown 格式的聚合设计文档
- `project-groups.json`：固定格式的项目群注册表

**四阶段流程**:

**阶段 1 - 文档解析与特征提取**:
对每份设计文档提取结构化特征卡片：
```json
{
  "docName": "订单服务重构设计.md",
  "title": "订单服务重构设计文档",
  "businessDomain": ["订单", "履约"],
  "userJourneys": ["消费者下单", "商家发货"],
  "techKeywords": ["Spring Boot", "Kafka", "DDD"],
  "coreEntities": ["Order", "Shipment"],
  "strategicGoal": "提升履约时效",
  "team": "交易中台",
  "summary": "一句话描述"
}
```

**阶段 2 - 项目群聚类**:

多维度加权相似度模型：

| 维度 | 权重 | 判断方式 |
|------|------|---------|
| 业务域 Jaccard 相似度 | 0.30 | 领域名词、流程、角色重合度 |
| 用户旅程重合度 | 0.25 | 用户画像、触达场景、使用链路 |
| 核心实体重合度 | 0.20 | 实体名、事件、数据流向重合度 |
| 技术关键词重叠度 | 0.15 | 技术关键词、架构图相似度 |
| 组织相同加分 | 0.10 | 负责团队、协作团队标记 |

三层聚类策略：
1. **骨架层**：业务域 + 用户旅程作为主要聚类骨架
2. **微调层**：技术方案与数据实体微调
3. **验证层**：组织维度验证可落地性

粒度控制：单群成员建议不超过 7 份，超过时优先拆分。

**阶段 3 - 项目群设计文档生成**:
综合群内所有文档的特征卡，生成包含项目群名称与定位、业务范围与目标、核心业务流程、关键架构决策与边界、数据主权与依赖、子项目清单的聚合段落。

**阶段 4 - 注册 JSON 生成与维护**:

`project-groups.json` 固定结构：

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-06-20T10:00:00Z",
  "groups": [
    {
      "projectGroup": "订单履约项目群",
      "projectDesc": "覆盖从消费者下单到商家发货的全链路",
      "projectPortrait": "面向交易中台团队，采用DDD+CQRS架构...",
      "members": ["订单服务重构设计.md", "履约调度引擎设计.md"],
      "tags": ["交易", "核心域"],
      "status": "active"
    }
  ]
}
```

`projectPortrait` 采用固定句式保证信息密度与可比性，必须包含"不包含[排除项]"。

**增量更新规则**:
- 已存在时**禁止整文件覆写**
- 只对新增文档跑特征提取与归类，不动既有成员
- 新文档归入既有群则更新 `members` 和 `projectPortrait`
- 新文档形成新群则追加到 JSON 和总览文档
- 既有群的归属不得被静默改写

**红线规则**:
- 不得读取设计文档列表以外的文档
- 特征卡字段缺失就留空，禁止编造
- 初始聚类结果必须呈现给用户确认后再落 JSON
- 两份产物都必须使用中文（字段名英文，值中文）

## 数据结构

### `FurinaConfig`
```typescript
interface FurinaConfig {
  language: string;
  switchProviders: {
    workflow: string;
    explore: string;
    propose: string;
    plan: string;
    review: string;
    coding: string;
    finalize: string;
  };
  project: {
    sourcecode: string;
    codebase: {
      enable: boolean;
      path: string;
    };
  };
  exploration: {
    codebase: ExplorationItem[];
    repository: ExplorationItem[];
    reference: ExplorationItem[];
    specification: ExplorationItem[];
  };
  experimental: {
    explore: boolean;
    websearch: boolean;
    context7: boolean;
    review: {
      propose: boolean;
      plan: boolean;
      specs: boolean;
      code: boolean;
      acceptance: boolean;
      furina: boolean;
    };
    prompt: { reviewCode: string | null };
    coverage: string;
    budget: boolean;
    factor: number;
  };
  enhancement?: {
    context: unknown | null;
    rules: { design: unknown[]; specs: unknown[]; implement: unknown[] };
    memory?: { schedule: string };
  };
}
```
由 `src/utils/config.ts` 的 `FurinaConfigSchema` Zod schema 推导。使用 `.loose()` 策略，允许项目覆盖文件中的额外字段通过。

### `ExplorationItem`
```typescript
interface ExplorationItem {
  path: string;
  type?: string;       // 如 "directory"
  description?: string; // 探索目标描述
}
```
定义在 `ExplorationItemSchema` 中（`src/utils/config.ts`:33-37）。

### `ProviderTemplate`
```typescript
interface ProviderTemplate {
  name: string;
  websiteUrl?: string;
  baseUrl: string;
  iconSvg?: string;
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
  source: 'builtin' | 'custom';
}
```
定义在 `src/utils/provider-templates.ts`:19-42。`source` 字段区分内置模板和用户自定义模板。

### `ProviderTemplateInput`
```typescript
type ProviderTemplateInput = Omit<ProviderTemplate, 'source'>;
```
`addProviderTemplate()` 的输入类型，`source` 字段由服务端自动设置为 `'custom'`。

### `ArtifactTemplate`（制品模板结构）
```json
{
  "changeName": "string",      // 占位符 [change-name]
  "artifactId": "string",      // 制品标识: proposal | design | specs
  "outputPath": "string",      // 输出路径模板
  "description": "string",     // 制品描述
  "instruction": "string",     // 详细生成指令（Markdown 文本）
  "template": "string",        // Markdown 骨架模板
  "dependencies": [            // 前置依赖列表
    {
      "id": "string",          // 依赖制品 ID
      "done": true,            // 默认值（运行时动态更新）
      "path": "string",        // 依赖文件相对路径
      "description": "string"  // 依赖描述
    }
  ]
}
```

### `ProjectGroup`（项目群注册结构）
```json
{
  "version": "1.0.0",
  "lastUpdated": "ISO-8601",
  "groups": [
    {
      "projectGroup": "string",
      "projectDesc": "string",
      "projectPortrait": "string",
      "members": ["string"],
      "tags": ["string"],
      "status": "active | proposed | deprecated"
    }
  ]
}
```
顶层 3 字段，每个 group 6 字段。`members` 是纯字符串数组，`projectPortrait` 必须含排除项。

## 错误处理与边界情况

### 配置加载错误处理

1. **覆盖文件不存在**：`loadConfig()` 静默跳过，仅使用默认配置
2. **覆盖文件 JSON 格式错误**：捕获 `SyntaxError`，`logger.warn` 后降级为默认配置
3. **Zod 验证失败**：逐条记录 `logger.warn`，剥离无效叶子节点，返回部分有效配置（不会抛出异常）
4. **路径遍历**：`queryConfig()` 在任意路径段缺失或不可遍历时返回 `undefined`，不会抛出异常
5. **deleteByPath**：路径段不可遍历时静默退出，不做任何操作

### Provider 模板错误处理

1. **文件不存在**：`readProviderTemplates()` 返回空数组
2. **JSON 解析失败**：`try/catch` 捕获后返回空数组
3. **重名添加**：`addProviderTemplate()` 抛出 `Error("Template name \"...\" already exists")`
4. **删除内置模板**：`deleteProviderTemplate()` 抛出 `Error("Cannot delete builtin template: \"...\"")`
5. **删除不存在的模板**：返回 `false`

### 制品模板错误处理

1. **变更名验证失败**：`validateChangeName()` 不通过时 `process.exit(1)`
2. **变更目录不存在**：输出错误到 stderr 后 `process.exit(1)`
3. **标志数量不对**：必须恰好提供 `--proposal`、`--design`、`--specs` 中的一个，否则 `process.exit(1)`
4. **占位符替换**：使用正则 `/\[change-name\]/g` 全局替换，确保 outputPath 中多处出现的占位符都被替换

### 调度器错误处理

1. **记忆目录不可读**：跳过当前周期，记录日志
2. **Claude CLI 执行失败**：记录错误日志，不中断后续项目处理
3. **project-groups.json 验证失败**：删除无效文件，等待下一个调度周期重试
4. **清理失败**：记录日志但不抛出异常，避免影响主流程

## 依赖关系

### 依赖（Depends on）

- **src/utils/config.ts**: 加载和验证 `furina.json`，提供 `loadConfig()`、`queryConfig()`、`deepMerge()`、`readUserConfig()`、`writeUserConfig()`、`setUserConfigValue()`、`setDefaultConfigValue()` 等函数
- **src/utils/provider-templates.ts**: 读写 `claude-providers-template.json`，提供 `readProviderTemplates()`、`addProviderTemplate()`、`deleteProviderTemplate()` 函数
- **src/commands/change/instruction.ts**: 读取制品模板（proposal/design/specs），执行占位符替换和依赖检查，输出 instruction JSON
- **src/server/memory/scheduler.ts**: 定时调度器，从 `furina.json` 读取 cron 表达式，复制 agents/skills 到项目目录，调用 claude CLI 执行 Agent
- **src/commands/config.ts**: CLI config 命令，调用 `loadConfig()` 和 `queryConfig()` 展示配置，调用 `setUserConfigValue()` / `setDefaultConfigValue()` 写入配置

### 被依赖（Depended by）

- **furina-propose skill**: 消费 proposal/design/specs 的 instruction JSON 来创建制品
- **furina-workflow command**: 通过 `config show` 读取 switchProviders、experimental 等配置来控制工作流行为
- **Hooks 模块** (`furina_hooks.js`): 在 agent 生命周期事件中读取 switchProviders 配置执行 Provider 切换
- **UI 层** (Server): 读取 `claude-providers-template.json` 展示 Provider 选择列表，调用 add/delete API 管理自定义模板
- **backgroud-designer Agent**: 调用 compose-design 技能
- **backgroud-grouper Agent**: 调用 group-design 技能

## 使用示例

### 示例 1：加载和查询配置

```typescript
import { loadConfig, queryConfig } from '../utils/config.js';

// 加载合并后的配置（默认 + 项目覆盖）
const config = loadConfig('/path/to/project');

// 查询语言设置
const lang = queryConfig(config, 'language');
// => "chinese"

// 查询阶段级 Provider 映射
const codingProvider = queryConfig(config, 'switchProviders.coding');
// => "default" 或用户配置的提供者名称

// 查询实验性开关
const exploreEnabled = queryConfig(config, 'experimental.explore');
// => true

// 查询 coverage（注意：返回字符串而非数字）
const coverage = queryConfig(config, 'experimental.coverage');
// => "70%"

// 查询不存在的路径
const missing = queryConfig(config, 'nonexistent.path');
// => undefined
```
Explanation: `loadConfig()` 自动合并默认配置和项目覆盖配置。`queryConfig()` 使用点分路径访问任意深度的配置值，路径不存在时返回 `undefined` 而非抛出异常。

### 示例 2：管理 Provider 模板

```typescript
import {
  readProviderTemplates,
  addProviderTemplate,
  deleteProviderTemplate,
} from '../utils/provider-templates.js';

// 读取所有内置模板
const all = readProviderTemplates();
console.log(all.length); // 12

// 添加自定义 Provider
addProviderTemplate({
  name: 'My Custom LLM',
  baseUrl: 'https://my-llm.com/anthropic',
  iconSvg: 'custom.svg',
  defaultModel: 'custom-v1',
  sonnetModel: 'custom-v1',
  opusModel: 'custom-v1',
  haikuModel: 'custom-v1-fast',
});

// 再次读取，包含新增的 custom 模板
const updated = readProviderTemplates();
console.log(updated.length); // 13

// 删除自定义模板
deleteProviderTemplate('My Custom LLM'); // true

// 无法删除内置模板
try {
  deleteProviderTemplate('DeepSeek');
} catch (e) {
  console.log(e.message); // Cannot delete builtin template: "DeepSeek"
}
```
Explanation: 演示 Provider 模板的完整 CRUD 操作。内置模板（`source='builtin'`）不可删除，自定义模板（`source='custom'`）可自由添加和删除。

### 示例 3：获取制品生成指令

```bash
# CLI 命令：获取 proposal 指令
furina change instruction my-feature --proposal

# CLI 命令：获取 design 指令（检查 proposal.md 是否存在）
furina change instruction my-feature --design

# CLI 命令：获取 specs 指令（检查 proposal.md 和 design.md 是否存在）
furina change instruction my-feature --specs
```

输出示例（proposal）：
```json
{
  "changeName": "my-feature",
  "artifactId": "proposal",
  "outputPath": "furina/changes/my-feature/proposal.md",
  "description": "Initial proposal document outlining the change",
  "instruction": "Create the proposal document that establishes WHY...",
  "template": "## Why\n\n...",
  "dependencies": []
}
```

Explanation: `runChangeInstruction()` 读取对应模板，替换占位符，检查依赖文件存在性，输出完整的 instruction JSON。propose skill 接收此 JSON 后按照 `instruction` 和 `template` 字段生成实际的 Markdown 制品文件。

### 示例 4：定时记忆同步完整流程

```
调度器触发（每天 18:14）
    |
    v
扫描 ~/.furina/memory/Memory_*/designs/
    |
    v
对每个有待处理设计文档的项目：
  1. 复制 resources/agents/ + resources/skills/ 到项目 .claude/
  2. claude --agent backgroud-designer "变更设计文档列表为：designA.md、designB.md"
     -> compose-design 技能 -> 合并到 project-design.md + 生成 project-portrait.md
  3. 清理 designs/ 目录（仅在 project-design.md 和 project-portrait.md 都存在时）
  4. 清理 .claude/ 目录
    |
    v
项目群聚类：
  1. 复制 agents/skills 到 Project_Group/.claude/
  2. 收集各项目的 project-design.md 到 Project_Group/
  3. claude --agent backgroud-grouper "项目设计文档列表为：ProjectA.md、ProjectB.md"
     -> group-design 技能 -> project-groups.json + project-groups.md
  4. 验证 project-groups.json 结构
  5. 清理聚合的 Memory_*.md 文件
```

Explanation: 调度器从 `furina.json` 的 `enhancement.memory.schedule` 读取 cron 表达式，每日执行一次。流程先处理单项目的设计文档整合，再进行跨项目的项目群聚类。每步都有错误隔离和清理逻辑。
