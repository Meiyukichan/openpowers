# Furina

> 从 [OpenSpec](https://github.com/Fission-AI/OpenSpec) + [SuperPowers](https://github.com/obra/superpowers) 演进而来，专为 Claude Code 打造，在同一个会话中自由切换不同供应商模型，并提供结构化 SDD+TDD 开发工作流的插件系统。

[Furina](https://github.com/Meiyukichan/furina) 是一个面向 **Claude Code** 的插件化开发工具包。它在 Claude Code 中提供一套完整的 **SDD（规范驱动开发）+ TDD（测试驱动开发）** 工作流，并通过内置的 **Anthropic API 代理**，实现在**同一个会话**中自由切换多个 AI 模型供应商的能力。

---

## 目录

- [安装与初始化](#安装与初始化)
- [快速开始](#快速开始)
- [四大核心模块](#四大核心模块)
  - [1. Marketplace — Claude Code 插件](#1-marketplace--claude-code-插件)
  - [2. CLI 命令行系统](#2-cli-命令行系统)
  - [3. Web UI 管理面板](#3-web-ui-管理面板)
  - [4. 多模型供应商代理](#4-多模型供应商代理)
- [CLI 命令参考](#cli-命令参考)
- [工作流详解](#工作流详解)
- [配置系统](#配置系统)
- [许可证](#许可证)

---

## 安装与初始化

### 环境要求

- **Node.js** >= 20
- **Claude Code**（需提前安装）

### 安装

```bash
npm i -g @meiyukichan/furina
```

### 初始化

```bash
furina init
```

一行命令即可完成插件安装。初始化完成后，打开 Claude Code，输入 `/furina:workflow` 即可开始使用。

---

## 快速开始

### 第 1 步：打开 Web UI 管理面板

```bash
furina ui
```

浏览器将自动打开 `http://localhost:3939`。

### 第 2 步：添加你的模型供应商

在 Web UI 中点击 **添加供应商**，填写：

- **供应商名称**（如 DeepSeek、Kimi）
- **API Key**
- **Base URL**
- **模型映射**（Sonnet 模型名、Opus 模型名、Haiku 模型名）

也可以从预置模板中一键导入。

### 第 3 步：启用供应商

在供应商卡片上点击 **启用**，该供应商将作为默认调用目标。

### 第 4 步：启用代理

在 Web UI 中点击 **开启代理**，或者使用下面的CLI命令：

```bash
furina enable
```

启用后，Claude Code 的所有 API 请求将通过 Furina 代理自动转发到你选择的活跃供应商。

注意！Furina 不同阶段自动切换模型功能，必须**先开启**代理。

### 第 5 步：启动工作流

在 Claude Code 中输入：

```
/furina:workflow {你的需求}
```

然后工作流将引导你完成从探索到归档的完整开发流程。

---

## 四大核心模块

### 1. Marketplace — Claude Code 插件

Furina 作为一个 Claude Code 插件安装后，会向 Claude Code 注入 **12 个技能（Skills）**、**生命周期钩子（Hooks）** 以及核心的 **工作流命令**。

#### 核心命令

| 命令 | 说明 |
|------|------|
| `/furina:workflow` | 启动 6 阶段结构化开发工作流 |

#### 12 个技能一览

| 技能 | 类型 | 说明 |
|------|------|------|
| `furina-workflow` | 命令 | 6 阶段 SDD+TDD 工作流入口 |
| `furina-explore` | 探索 | 并发分派多个探索子代理，深入调查代码库、仓库资料、参考文档、已有规格等 |
| `furina-brainstorm` | 思考 | 头脑风暴助手，梳理需求与方案思路 |
| `furina-propose` | 提案 | 一键生成提案、设计文档与规格说明 |
| `furina-plan` | 规划 | 补充技术规格 Schema 文档，基于规格生成可执行实施计划 |
| `furina-review` | 审查 | 分派审查子代理，依次审查提案和计划的完整性与可行性，自动修复问题 |
| `furina-sdd` | 实现 | 子代理驱动开发，按拓扑顺序逐个派发实现子代理并经过两阶段复审 |
| `furina-tdd` | 测试 | TDD 强制执行，先写测试再写实现 |
| `furina-finalize` | 收尾 | 自动 Git 提交、推送并同步 Codebase 文档 |
| `furina-codebase` | 文档 | Codebase 集成，提供 explore、generate、synchronize 三大指令 |
| `furina-cleancode` | 质量 | 查询编码规范，在生成代码前输出聚焦的规范指南 |
| `furina-commit` | 工具 | 自动暂存、生成 Conventional Commits 消息并安全推送 |

#### furina-codebase 详解

`furina-codebase` 将项目的源代码组织为分层结构化的**代码文档树**（Codebase），支持大模型按层级导航检索。文档树结构如下：

```
{codebaseDir}/
├── toc.md                          ← 总索引（Overview，≤500 行）
├── {module-a}/
│   ├── toc.md                      ← 模块索引
│   ├── {submodule-1}/
│   │   ├── toc.md                  ← 子模块索引
│   │   ├── spec-xxx.md
│   │   └── spec-yyy.md
│   ├── {submodule-2}/
│   │   └── ...
│   └── spec-zzz.md                 ← 模块直属 Spec
└── ...
```

通过 `instruction` 参数选择三大操作：

| 指令 | 用途 | 核心流程 |
|------|------|------|
| `explore` | 按业务/功能/代码关键词查询相关实现 | 模块定位 → 子模块匹配 → Spec 验证 → 输出源码摘要 + 上下游调用链 |
| `generate` | 从零生成项目 Codebase 文档树 | 全局扫描分模块 → 逐模块发现子模块/Spec → 生成 Spec 文档 → 逐级生成 toc.md → 综合审查 |
| `synchronize` | 将增量代码变更同步回文档树 | 确定 Codebase 状态 → 定位目标 Spec → 创建/更新/删除 Spec → 自底向上更新 toc → 索引可达性校验 |

- **explore** 依赖已生成的文档树，不生成新文档；查询结果包含 Spec 摘要 + 直接源码 + 上游调用方 + 下游依赖
- **generate** 自动跳过测试文件（`*.test.ts`、`__tests__/**` 等），模块/子模块规模有上限控制（≤50 子项 / 5-50 Spec）
- **synchronize** 严格增量原则，仅处理用户提供的变更文件列表，不扩大范围；首次初始化时自动切换到 `generate` 流程

#### Hooks 生命周期钩子

Furina 通过 Claude Code 的 Hook 机制，在 Agent 工具调用前后自动干预：

- **PreToolUse**：在子代理启动前，根据当前工作流阶段自动切换对应的模型供应商
- **PostToolUse**：在子代理完成后，捕获输出并记录日志
- **UserPromptSubmit**：用户提交提示词时自动初始化会话

这意味着 **你无需手动切换模型** —— 工作流在探索、提案、规划、编码等不同阶段会自动选择配置的 AI 模型。

---

### 2. CLI 命令行系统

`furina` CLI 是工作流的命令行支撑系统，提供初始化、配置管理、变更追踪、会话调度等全套工具。

```bash
furina [command] [options]
```

#### 命令总览

| 命令 | 说明 |
|------|------|
| `furina init` | 初始化 Furina 插件，安装完成后自动启动 UI 服务 |
| `furina ui [--restart]` | 启动 Web UI 管理面板并在浏览器中打开 |
| `furina launch` | 启动后端服务（不打开浏览器） |
| `furina active` | 探测后端服务状态，若未运行则自动启动（自愈） |
| `furina enable` | 开启 Anthropic API 代理，将 Claude Code 请求路由至活跃供应商 |
| `furina disable` | 关闭代理，恢复原始 Claude Code 设置 |
| `furina remove [-y]` | 卸载 Furina 插件及其所有配置 |
| `furina recover` | 当 Claude Code 配置出现问题时，恢复默认设置 |
| `furina config list` | 列出当前完整合并配置（JSON 格式） |
| `furina config show <key...>` | 按路径查询配置项（支持 `codebases` 虚拟键） |
| `furina config mode <lite\|standard\|max>` | 一键应用实验性功能预设 |
| `furina config set <key> <value> [--global]` | 写入单键配置（自动推断类型） |
| `furina agents list [--session <id>]` | 列出模型供应商表格或会话阶段-模型映射 |
| `furina agents show <stage> --session <id>` | 查看某阶段的模型名称 |
| `furina agents switch <name> [--session <id>]` | 全局/会话级切换模型供应商 |
| `furina agents init --session <id> --cwd <path>` | 初始化会话配置文件 |
| `furina change list` | 列出所有活跃变更及其进度 |
| `furina change new <name> --desc <描述>` | 创建新的变更目录 |
| `furina change status <name>` | 查看变更的制品管线状态（JSON） |
| `furina change archive <name>` | 归档已完成变更 |
| `furina change instruction <name> --proposal\|--design\|--specs` | 获取制品生成指令 |
| `furina change feature <name> --status\|--next\|--start\|--complete` | 功能生命周期管理 |
| `furina change stage <name> --session <id> --status <st> [--title\|--input\|--output]` | 更新变更的阶段进度 |
| `furina schedule restart` | 重启 cron 调度器 |
| `furina schedule stop` | 停止 cron 调度器 |

---

### 3. Web UI 管理面板

```bash
furina ui [--restart]
```

一个可视化的 Web 管理界面，运行在 `http://localhost:3939`，提供：

- **模型供应商管理** — 添加、编辑、删除、搜索模型供应商
- **活跃供应商切换** — 一键设为首选供应商
- **供应商模板系统** — 预置 12 个供应商模板，开箱即用
- **代理开关控制** — 可视化启用/禁用 Anthropic API 代理
- **一键重置** — 恢复到默认配置

---

### 4. 多模型供应商代理

这是 Furina 最核心的能力 —— 在 Claude Code 的**同一个会话**中实现**真正的多供应商多代理协同**架构。

#### 它如何为你工作

在 `/furina:workflow` 工作流中，不同阶段会自动切换到你预先配置的模型供应商。比如：

- **探索阶段**：可使用性价比高的模型（如 DeepSeek）
- **提案 / 审查阶段**：可切换到最强的推理模型（如 Claude Opus）
- **编码实现阶段**：可使用平衡型的模型，甚至为每个子代理指定不同供应商
- **收尾归档阶段**：可使用轻量快速的模型

你只需在 Web UI 和配置中预设好各阶段想用的供应商，之后一切自动切换，无需手动干预。

#### 核心特性

- **不同阶段，不同模型**：探索、提案、编码等各阶段自动选用最合适的供应商模型
- **一个会话，多个供应商**：无需切换工具，在同一对话中即可调度 DeepSeek、Claude、Kimi 等多家 AI
- **即开即用，无需改代码**：开启代理后 Claude Code 体验完全不变，供应商切换在后台自动完成

#### 配置的阶段-模型映射

```json
{
  "switchProviders": {
    "workflow": "deepseek-v4-pro",
    "explore": "MiniMax-M2.7",
    "propose": "glm-5.0",
    "plan": "MiniMax-M2.7",
    "review": "mimo-v2.5-pro",
    "coding": "deepseek-v4-pro",
    "finalize": "deepseek-v4-pro"
  }
}
```

- 模型名来自你在Web UI配置的供应商的模型名，默认为default，使用启用供应商的默认模型
- 配置文件路径为 `{当前项目}/.claude/furina.json`

---

## CLI 命令参考

### `furina init`

```bash
furina init
```

初始化 Furina 插件。自动完成插件安装和 UI 服务启动，安装后可直接使用 `/furina:workflow`。

---

### `furina ui`

```bash
# 启动 UI 管理面板
furina ui

# 重启 UI 管理面板
furina ui --restart
```

在 `http://localhost:3939/furina/ui` 启动 Web 管理面板。`--restart` 会先终止已有进程再重新启动。

---

### `furina launch`

```bash
furina launch
```

在后台启动 Furina 后端服务，不打开浏览器。若服务已在运行则提示。

---

### `furina active`

```bash
furina active
```

探测后端服务状态。若服务已在运行，输出 "active"；若未运行，自动启动服务（自愈机制）。

---

### `furina enable`

```bash
furina enable
```

启用 Anthropic API 代理。自动同步 Claude Code 设置，将所有 API 请求路由至本地代理。

---

### `furina disable`

```bash
furina disable
```

禁用代理，恢复原始 Claude Code 设置或回退至直接供应商配置。

---

### `furina remove`

```bash
# 交互式卸载
furina remove

# 跳过确认
furina remove -y
```

卸载 Furina 插件及其所有配置。

---

### `furina recover`

```bash
furina recover
```

当 Claude Code 配置出现问题时，恢复默认设置。

---

### `furina config`

```bash
# 查看完整配置（合并默认+项目覆盖）
furina config list

# 按路径查询
furina config show language
furina config show project.sourcecode
furina config show project.codebase
furina config show exploration.repository
furina config show codebases

# 一键应用功能预设（lite / standard / max）
furina config mode standard

# 写入配置（自动推断类型：字符串、数字、布尔）
furina config set experimental.review.code true
furina config set language english --global
```

`config show codebases` 是虚拟键，自动将 `project.codebase.path` 和 `exploration.codebase` 合并为一个统一列表。

`config mode` 预设：
| 模式 | explore | furina review | specs review | code review |
|------|---------|-------------------|--------------|-------------|
| `lite` | 关闭 | 关闭 | 关闭 | 关闭 |
| `standard` | 开启 | 关闭 | 关闭 | 开启 |
| `max` | 开启 | 开启 | 开启 | 开启 |

---

### `furina agents`

```bash
# 列出所有模型供应商（表格）
furina agents list

# 查看会话的阶段-模型映射
furina agents list --session <session-id>

# 查看某阶段使用的模型
furina agents show plan --session <session-id>

# 全局切换供应商（按供应商名或模型名）
furina agents switch DeepSeek

# 会话级切换
furina agents switch kimi2.6 --session <session-id>

# 初始化会话设置
furina agents init --session <session-id> --cwd /path/to/project
  [--change <change-name>] [--prompt <text>]
```

---

### `furina change`

```bash
# 列出所有活跃变更及其进度
furina change list

# 创建新变更
furina change new my-feature --desc "添加用户登录功能"

# 查看变更状态
furina change status my-feature

# 获取制品生成指令
furina change instruction my-feature --proposal

# 管理功能生命周期
furina change feature my-feature --status
furina change feature my-feature --next
furina change feature my-feature --start feat-1
furina change feature my-feature --complete feat-1

# 更新阶段进度（由 Hook 调用）
furina change stage explore --session <id> --status done --title "探索结果"

# 归档已完成变更
furina change archive my-feature
```

---

### `furina schedule`

```bash
# 重启 cron 调度器
furina schedule restart

# 停止 cron 调度器
furina schedule stop
```

需要在 Furina 后端服务运行的状态下使用。

---

## 工作流详解

`/furina:workflow` 提供从创意到交付的 6 阶段完整开发流程：

```
创意 → 1.Explore → 2.Propose → 3.Plan → 4.Review → 5.SDD → 6.Finalize
```

### 阶段 1：Explore（探索）

使用 `furina-explore` 技能根据 `exploreType` 并发分派多个探索子代理，深入调查项目的代码结构、参考文档、仓库资料、已有规格等。

**产出**：探索结果写入 `explore-design/` 目录

**供应商**：自动使用 `explore` 阶段配置的模型

---

### 阶段 2：Propose（提案）

先使用 `furina-brainstorm` 进行需求头脑风暴与对齐，然后使用 `furina-propose` 一键生成完整提案制品：
- `proposal.md` — 变更的目的、范围和影响
- `design.md` — 技术设计决策
- `specs/**/*.md` — 详细功能规格说明

此阶段结束后会让用户选择工作流模式（Lite / Standard / Max）以控制后续阶段的审查级别。

**产出**：提案三件套

**供应商**：自动使用 `propose` 阶段配置的模型

---

### 阶段 3：Plan（规划）

分派规划子代理，基于规格文档生成可执行的实施计划 `plan.json`，支持依赖拓扑排序。

**产出**：`plan.json`（可选 `api.yaml`、`database.md`）

**供应商**：自动使用 `plan` 阶段配置的模型

---

### 阶段 4：Review Furina Artifacts（审查制品）

使用 `furina-review` 技能审查提案、设计、规格和计划的完整性与可行性。

**产出**：审查反馈与修改建议

**供应商**：自动使用 `review` 阶段配置的模型

---

### 阶段 5：SDD — 子代理驱动开发

使用 `furina-sdd` 技能，按 `plan.json` 中的特征（Feature）列表，依拓扑顺序为每个特征独立分派实现子代理。每个子代理内部强制执行 `furina-tdd`（先写测试再写实现），并经过**规格合规审查**和**代码质量审查**两阶段复审。

**产出**：测试用例 + 实现代码 + 审查通过报告

**供应商**：每个子代理可独立配置不同供应商模型

---

### 阶段 6：Finalize（收尾）

使用 `furina-finalize` 技能自动完成：
- 集成测试
- Codebase 文档同步
- 变更归档
- Git 提交与推送

**供应商**：自动使用 `finalize` 阶段配置的模型

---

### 从中断处恢复

工作流支持中断恢复。启动时会自动检测已有制品，跳过已完成的阶段，从当前进度继续执行，不丢失已有产出物。

---

## 配置系统

Furina 支持全局默认配置和项目级覆盖配置：

- **项目配置**：在项目根目录的 `.claude/furina.json` 中编写，仅对当前项目生效
- **默认配置**：未在项目配置中覆盖的项，自动使用全局默认值

### 配置项参考

```jsonc
{
  // 输出语言
  "language": "chinese",

  // 各阶段自动切换的模型供应商
  "switchProviders": {
    "workflow": "default",          // 工作流调度
    "explore": "default",           // 探索阶段
    "propose": "default",           // 提案阶段
    "plan": "default",              // 规划阶段
    "review": "default",            // 审查阶段
    "coding": "default",            // 编码阶段
    "finalize": "default"           // 收尾阶段
  },

  // 项目设置
  "project": {
    "sourcecode": "./",            // 源码目录
    "codebase": {                  // 项目 Codebase 设置
      "enable": false,
      "path": "docs/codebase"
    }
  },

  // 探索配置
  "exploration": {
    "codebase": [],                // 探索时查询的额外 Codebase 路径列表
    "repository": [                // 探索时参考的项目仓库列表
      {
        "type": "directory",
        "path": "./furina/",
        "description": "Furina 制品目录，用于跨变更全局历史参考"
      }
    ],
    "reference": [],               // 探索时参考的外部资料列表
    "specification": []            // 探索时参考的规格文档列表
  },

  // 实验性特性
  "experimental": {
    "explore": true,               // 是否开启探索阶段
    "websearch": true,             // 是否开启 Web 搜索
    "context7": true,              // 是否开启 Context7
    "review": {
      "furina": false,         // 是否审查 Furina 制品
      "propose": false,            // 是否开启提案审查
      "plan": false,               // 是否开启计划审查
      "specs": false,              // 是否开启规格审查
      "code": true,                // 是否开启代码检视
      "acceptance": true           // 是否开启验收审查
    },
    "prompt": {
      "reviewCode": null           // 代码检视自定义提示词（skill 名或内容）
    },
    "coverage": "70%",             // 要求项目达到的测试覆盖率
    "budget": true,                // 是否开启预算管理
    "factor": 1                    // 计划文档生成的特性个数因子（features < factor * specs）
  },

  // 增强配置
  "enhancement": {
    "context": null,               // 增强上下文
    "rules": {
      "design": [],                // 设计阶段增强规则
      "specs": [],                 // 规格阶段增强规则
      "implement": []              // 实现阶段增强规则
    },
    "memory": {
      "schedule": "14 18 * * *"    // 记忆调度 cron 表达式
    }
  }
}
```

---

## 许可证

[MIT](LICENSE) © 2026 Meiyukichan

---

*Furina — 让 Claude Code 拥有同一会话多供应商模型切换调度能力，用结构化工作流交付高质量代码。*
