---
name: openpowers-review
description: >
  审查工作产出的质量，通过派发专门的审查子代理捕获问题并给出改进建议。
  支持三种审查类型：提案（propose）、计划（plan）、代码（code）。
  当用户提到"审查"、"review"、"检查一下"、"看看有没有问题"等意图时使用此技能。
---

# Openpowers 审查

派发专门的审查子代理捕获实施者容易忽视的问题——需求偏差、设计缺陷、计划遗漏、代码质量问题。审查员提供独立于实施者的质量检查线，审查通过则为下一步工作提供信心保障。

**重点注意**：openpowers-review 禁止读取`审查模板文档`，其他文档则是非必要不读取。

## 输入参数

1. **审查类型（review）**<必选>：
   - `propose`：审查提案文档
   - `plan`：审查计划文档
   - `code`：审查代码变更
2. **变更目录（change）**<当 review 为 `propose` 或 `plan` 时必选>：`openspec/changes/<name>/`

必选参数缺少时，必须用 `AskUserQuestion` 工具询问用户获取。

## 技能配置

在确定审查类型（propose/plan/code）后，查询以下配置，将 `<type>` 替换为实际的审查类型：

```bash
python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py {当前项目路径} language experimental.review.\<type\>
```

依次返回两个值：
  1. `language` — 输出语言。作为本次技能所有面向用户的回答和输出的语言，为 None 则默认使用中文
  2. `experimental.review.<type>` — 审查开关。该值不是 `True` 时，**必须立即终止 openpowers-review 技能**，不可继续做任何审查操作（这是用户的强制配置）

## 审查分发流程

严格按照如下参数格式，分发`审查子代理`：

```
Task tool (general-purpose):
  description: "审查{审查类型}: {变更名称<name>}"
  prompt: |
    你正在审查{审查类型}: {变更名称<name>}

    ## 语言适配
    本次审查输出的语言：{`language` or 中文}

    ## openspec 变更
    {`openspec/changes/<name>/`}

    ## 当前项目路径
    {当前项目路径}

    ## 脚本路径
    {${CLAUDE_PLUGIN_ROOT}/scripts/config.py}

    ## 执行流程
    严格准确按照以下步骤执行：
    1. 读取探索器模板文档：{`审查模板文档`}
    2. 严格遵循探索器模板的步骤和要求，执行探索任务
```

## 审查模板文档

- 当`review = propose`时模板文档：`${CLAUDE_PLUGIN_ROOT}/skills/openpowers-review/references/propose-reviewer.md`
- 当`review = plan`时模板文档：`${CLAUDE_PLUGIN_ROOT}/skills/openpowers-review/references/plan-reviewer.md`
- 当`review = code`时模板文档：`${CLAUDE_PLUGIN_ROOT}/skills/openpowers-review/references/code-reviewer.md`

## 红色警告

- **openpowers-review 禁止读取`审查模板文档`，其他文档则是非必要不读取**。
- **openpowers-review 禁止运行 git 命令**：openpowers-review 本身绝不运行任何 git 命令，特别是当 review 类型为 code 时！
- `optional.review.<type>`为技能开关，非`True`则停止执行这个技能
