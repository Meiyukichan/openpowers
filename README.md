# OpenPowers

> 从 [OpenSpec](https://github.com/anthropics/openspec) + [SuperPowers](https://github.com/obra/superpowers) 演进而来，专为 Claude Code 打造，在同一个会话中自由切换不同供应商模型，并提供结构化 SDD+TDD 开发工作流的插件系统。

[OpenPowers](https://github.com/Meiyukichan/openpowers) 是一个面向 **Claude Code** 的插件化开发工具包。它在 Claude Code 中提供一套完整的 **SDD（规范驱动开发）+ TDD（测试驱动开发）** 工作流，并通过内置的 **Anthropic API 代理**，实现在**同一个会话**中自由切换多个 AI 模型供应商的能力。

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
npm i -g @meiyukichan/openpowers
```

### 初始化

```bash
openpowers init
```

一行命令即可完成插件安装。初始化完成后，打开 Claude Code，输入 `/openpowers:workflow` 即可开始使用。

---

## 快速开始

### 第 1 步：打开 Web UI 管理面板

```bash
openpowers ui
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
openpowers enable
```

启用后，Claude Code 的所有 API 请求将通过 OpenPowers 代理自动转发到你选择的活跃供应商。

注意！OpenPowers 不同阶段自动切换模型功能，必须**先开启**代理。

### 第 5 步：启动工作流

在 Claude Code 中输入：

```
/openpowers:workflow {你的需求}
```

然后工作流将引导你完成从探索到归档的完整开发流程。

---

## 四大核心模块

### 1. Marketplace — Claude Code 插件

OpenPowers 作为一个 Claude Code 插件安装后，会向 Claude Code 注入 **13 个技能（Skills）**、**生命周期钩子（Hooks）** 以及核心的 **工作流命令**。

#### 核心命令

| 命令 | 说明 |
|------|------|
| `/openpowers:workflow` | 启动 8 阶段结构化开发工作流 |

#### 13 个技能一览

| 技能 | 类型 | 说明 |
|------|------|------|
| `openpowers-workflow` | 命令 | 8 阶段 SDD+TDD 工作流入口 |
| `openpowers-explore` | 探索 | 代码库探索性调查，了解现有实现与架构 |
| `openpowers-brainstorm` | 思考 | 头脑风暴助手，梳理需求与方案思路 |
| `openpowers-propose` | 提案 | 一键生成提案、设计文档与规格说明 |
| `openpowers-schema` | 设计 | 生成 API 或数据库 Schema 文档 |
| `openpowers-plan` | 规划 | 基于规格生成可执行实施计划 |
| `openpowers-review` | 审查 | 分派 3 个子审查 Agent 审查提案/计划/代码质量 |
| `openpowers-sdd` | 实现 | 子代理驱动开发，按功能并发派发实现任务 |
| `openpowers-tdd` | 测试 | TDD 强制执行，先写测试再写实现 |
| `openpowers-finalize` | 收尾 | 自动 Git 提交、推送，完成代码保存 |
| `openpowers-archive` | 归档 | 归档已完成的变更至历史记录 |
| `openpowers-codebase-generator` | 文档 | 生成结构化项目文档树 |
| `openpowers-codebase-explorer` | 查询 | 按业务/功能关键词查询代码库 |
| `openpowers-codebase-sync` | 同步 | 随代码变更同步文档 |

#### Hooks 生命周期钩子

OpenPowers 通过 Claude Code 的 Hook 机制，在 Agent 工具调用前后自动干预：

- **PreToolUse**：在子代理启动前，根据当前工作流阶段自动切换对应的模型供应商
- **PostToolUse**：在子代理完成后，捕获输出并记录日志
- **UserPromptSubmit**：用户提交提示词时自动初始化会话

这意味着 **你无需手动切换模型** —— 工作流在探索、提案、规划、编码等不同阶段会自动选择配置的 AI 模型。

---

### 2. CLI 命令行系统

`openpowers` CLI 是工作流的命令行支撑系统，提供初始化、配置管理、变更追踪、会话调度等全套工具。

```bash
openpowers [command] [options]
```

#### 命令总览

| 命令 | 说明 |
|------|------|
| `openpowers init` | 初始化 OpenPowers 插件（仅需执行一次），安装完成后自动启动 UI 服务 |
| `openpowers ui [--restart]` | 启动 Web UI 管理面板并在浏览器中打开 |
| `openpowers enable` | 开启 Anthropic API 代理，将 Claude Code 请求路由至活跃供应商 |
| `openpowers disable` | 关闭代理，恢复原始 Claude Code 设置 |
| `openpowers remove [-y]` | 卸载 OpenPowers 插件及其所有配置 |
| `openpowers recover` | 当 Claude Code 配置出现问题时，恢复默认设置 |
| `openpowers config list` | 列出当前完整配置（JSON 格式） |
| `openpowers config show <key...>` | 按路径查询配置项 |
| `openpowers agents list [--session <id>]` | 列出模型供应商或会话阶段-模型映射 |
| `openpowers agents show <name> --session <id>` | 查看会话中某工作流阶段使用的模型 |
| `openpowers agents switch <name> [--session <id>]` | 切换会话或全局的模型供应商 |
| `openpowers agents init --session <id>` | 初始化会话设置文件 |
| `openpowers change list` | 列出所有活跃变更及其进度 |
| `openpowers change new <name> --desc <描述>` | 创建新的变更目录 |
| `openpowers change status <name>` | 输出变更的制品管线状态（JSON） |
| `openpowers change archive <name>` | 归档已完成变更 |
| `openpowers change instruction <name> --proposal\|--design\|--specs` | 从模板生成制品创建指令 |
| `openpowers change feature <name> --status\|--next\|--start\|--complete` | 功能生命周期管理 |

---

### 3. Web UI 管理面板

```bash
openpowers ui [--restart]
```

一个可视化的 Web 管理界面，运行在 `http://localhost:3939`，提供：

- **模型供应商管理** — 添加、编辑、删除、搜索模型供应商
- **活跃供应商切换** — 一键设为首选供应商
- **供应商模板系统** — 预置 12 个供应商模板，开箱即用
- **代理开关控制** — 可视化启用/禁用 Anthropic API 代理
- **一键重置** — 恢复到默认配置

---

### 4. 多模型供应商代理

这是 OpenPowers 最核心的能力 —— 在 Claude Code 的**同一个会话**中实现**真正的多供应商多代理协同**架构。

#### 它如何为你工作

在 `/openpowers:workflow` 工作流中，不同阶段会自动切换到你预先配置的模型供应商。比如：

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
- 配置文件路径为 `{当前项目}/.claude/openpowers.json`

---

## CLI 命令参考

### `openpowers init`

```bash
openpowers init
```

初始化 OpenPowers 插件。自动完成插件安装和 UI 服务启动，安装后可直接使用 `/openpowers:workflow`。

---

### `openpowers ui`

```bash
# 启动 UI 管理面板
openpowers ui

# 重启 UI 管理面板
openpowers ui --restart
```

在 `http://localhost:3939` 启动 Web 管理面板。`--restart` 会先终止已有进程再重新启动。

---

### `openpowers enable`

```bash
openpowers enable
```

启用 Anthropic API 代理。自动同步 Claude Code 设置，将所有 API 请求路由至本地代理。

---

### `openpowers disable`

```bash
openpowers disable
```

禁用代理，恢复原始 Claude Code 设置或回退至直接供应商配置。

---

### `openpowers remove`

```bash
# 交互式卸载
openpowers remove

# 跳过确认
openpowers remove -y
```

卸载 OpenPowers 插件及其所有配置。

---

### `openpowers recover`

```bash
openpowers recover
```

当 Claude Code 配置出现问题时，恢复默认设置。

---

### `openpowers config`

```bash
# 查看完整配置
openpowers config list

# 按路径查询
openpowers config show language
openpowers config show project.sourcecode
openpowers config show switchProviders.plan switchProviders.coding
```

---

### `openpowers agents`

```bash
# 列出所有模型供应商
openpowers agents list

# 查看会话的阶段-模型映射
openpowers agents list --session <session-id>

# 查看某阶段的模型
openpowers agents show plan --session <session-id>

# 全局切换供应商（模型名或供应商名称）
openpowers agents switch DeepSeek

# 会话级切换供应商
openpowers agents switch kimi2.6 --session <session-id>

# 初始化会话设置
openpowers agents init --session <session-id> --cwd /path/to/project
```

---

### `openpowers change`

```bash
# 列出所有活跃变更
openpowers change list

# 创建新变更
openpowers change new my-feature --desc "添加用户登录功能"

# 查看变更状态
openpowers change status my-feature

# 归档已完成变更
openpowers change archive my-feature
```

---

## 工作流详解

`/openpowers:workflow` 提供从创意到交付的 8 阶段完整开发流程：

```
创意 → 1.Explore → 2.Propose → 3.Review → 4.Plan → 5.Review → 6.SDD实现 → 7.Finalize → 8.Archive
```

### 阶段 1：Explore（探索）

使用 `openpowers-explore` 技能深入调查代码库，理解现有实现、架构模式与集成点。

**产出**：`exploration.md`

**供应商**：自动使用 `explore` 阶段配置的模型

---

### 阶段 2：Propose（提案）

生成完整变更提案，包括：
- `proposal.md` — 变更的目的、范围和影响
- `design.md` — 技术设计决策文档
- `specs/**/*.md` — 详细功能规格说明

**产出**：提案三件套

**供应商**：自动使用 `propose` 阶段配置的模型

---

### 阶段 3：Review Propose（审查提案）

使用 `openpowers-review` 技能，分派 3 个专业子审查 Agent：
- 完整性审查
- 一致性审查
- 可行性审查

**产出**：审查反馈与修改建议

**供应商**：自动使用 `review` 阶段配置的模型

---

### 阶段 4：Plan（规划）

基于规格文档生成可执行的实施计划。

**产出**：`plan.json`（可选 `api.yaml`、`database.md`）

**供应商**：自动使用 `plan` 阶段配置的模型

---

### 阶段 5：Review Plan（审查计划）

再次使用 `openpowers-review`，验证实施计划的可行性与完整性。

**供应商**：自动使用 `review` 阶段配置的模型

---

### 阶段 6：SDD Implementation（子代理驱动开发）

使用 `openpowers-sdd` 技能，将实施计划按功能点拆分为独立任务，并发分派**全新的子代理**执行。

**产出**：测试用例 + 实现代码 + 审查报告

**供应商**：每个子代理可独立配置不同供应商模型

---

### 阶段 7：Finalize（收尾）

使用 `openpowers-finalize` 技能自动完成：
- `git add` 所有变更
- `git commit` 提交代码
- `git push` 推送至远程仓库

**供应商**：自动使用 `finalize` 阶段配置的模型

---

### 阶段 8：Archive（归档）

使用 `openpowers-archive` 技能将完成的变更移动至：

```
openpowers/archive/YYYY-MM-DD-<name>/
```

保留完整的历史记录，支持随时回溯查看。

---

### 从任意阶段恢复

工作流支持中断恢复。如果在某个阶段中断，下次运行时可以从该阶段继续，不会丢失已有的产出物。

---

## 配置系统

OpenPowers 支持全局默认配置和项目级覆盖配置：

- **项目配置**：在项目根目录的 `.claude/openpowers.json` 中编写，仅对当前项目生效
- **默认配置**：未在项目配置中覆盖的项，自动使用全局默认值

### 配置项参考

```jsonc
{
  // 输出语言
  "language": "chinese",

  // 各阶段自动切换的模型供应商
  "switchProviders": {
    "workflow": "deepseek-v4-pro",  // 工作流调度
    "explore": "MiniMax-M2.7",      // 探索阶段
    "propose": "default",           // 提案阶段
    "plan": "deepseek-v4-pro",      // 规划阶段
    "review": "deepseek-v4-pro",    // 审查阶段
    "coding": "MiniMax-M2.7",       // 编码阶段
    "finalize": "MiniMax-M2.7"      // 收尾阶段
  },

  // 项目设置
  "project": {
    "sourcecode": "src",           // 源码目录
    "codebases": {                 // 代码库文档设置
      "enabled": false,
      "path": "codebases"
    },
    // 项目额外仓库，比如前后端分离的前端仓库
    "repositories": [
      {
        "path": "path/to/some-project1",
        "description": "description about project1"
      },
      {
        "path": "path/to/some-project2",
        "description": "description about project2"
      }
    ],
    // 外部参考仓库
    "references": [
      {
        "type": "repository",
        "path": "path/to/repository",
        "description": "description about this repository"
      },
      {
        "type": "codebases",
        "path": "path/to/codebases",
        "description": "description about this codebases"
      },
      {
        "type": "skill",
        "path": "path/to/skill or skill name",
        "description": "description about this skill"
      }
    ]
  },

  // 实验性特性
  "experimental": {
    "codebases": false,         // 是否开启codebase功能
    "websearch": true,          // 是否开启websearch功能
    "context7": true,           // 是否开启context7功能
    "review": {
        "propose": true,        // 是否开启提案审查阶段
        "plan": true,           // 是否开启计划审查阶段
        "specs": true,          // 是否开启规格审查阶段
        "code": true            // 是否开启代码检视阶段
    },
    "prompt": {
        "review-code": null     // 代码检视自定义提示词，可以是skill name
    },
    "coverage": "70%",          // 要求项目达到的测试覆盖率
    "factor": 1                 // 计划文档生成的特性个数因子（features < factor * specs）
  }
}
```

---

## 许可证

[MIT](LICENSE) © 2026 Meiyukichan

---

*OpenPowers — 让 Claude Code 拥有同一会话多供应商模型切换调度能力，用结构化工作流交付高质量代码。*
