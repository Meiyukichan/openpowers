---
name: openpowers-explore
description: >
  对代码库进行探索性调查，理解现有实现、架构模式和集成点。
  当用户提到"探索"、"了解"、"查一下"、"研究一下"、"explore"、"look into"、"investigate"等意图，
  或者想理解某个功能/模块的实现方式时使用此技能。
  也适用于在实施变更前需要摸清现有代码结构、与需求相关的现有实现、现有业务逻辑的场景。
---

# Openpowers Explore — 代码探索器

深入理解项目中与用户需求相关的现有实现，为后续决策提供事实依据。

**红线禁告**：openpowers-explore 禁止读取任何文件，尤其是`当前探索器模板文档`。

## 输入参数

1. **探索类型`explore_type`**<必选>：
   - `project`：探索当前项目内的代码实现
   - `references`：探索外部参考资料（文档、API 规范等）
2. **探索内容`explore_content`**<必选>：具体要探索的功能、模块或问题描述
3. **输出文件路径`output_file`**<可选>：具体的文件路径。不提供则默认不输出文件。不需要询问用户，只有用户主动提供输出路径时才设置（见"输出文件"章节）

必选参数缺少时，必须用 `AskUserQuestion` 工具询问用户获取。可选参数不需要询问。

## 语言适应

通过以下脚本查询插件要求的输出语言：

```bash
python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py {当前项目路径} language
```

将脚本返回的语言作为本次技能所有面向用户的回答和输出的默认语言。如果脚本无输出或执行失败，回退使用中文。

## 执行流程

严格按照如下参数格式，分发`代码库探索器子代理`(**红线禁告**: 在分发子代理前不要读取`当前探索器模板文档`，子代理会自行读取模板文件)：

```
Task tool (general-purpose):
  description: "探索{`explore_content`}"
  prompt: |
    你正在探索{探索类型}：{`explore_content`}

    ## 语言适配
    本次探索需要输出的语言：{`language` or 中文}

    ## 探索类型
    {`explore_type`}

    ## 当前项目路径
    {当前项目路径}

    ## 脚本路径
    {${CLAUDE_PLUGIN_ROOT}/scripts/config.py}

    ## 探索内容
    {`explore_content`}

    ## 关键规则
    {`关键规则`}

    ## 输出文件
    {`output_file`}

    ## 执行流程
    严格准确按照以下步骤执行：
    1. 读取探索器模板文档：{`当前探索器模板文档`}
    2. 严格遵循探索器模板的步骤和要求，执行探索任务
```

## 当前探索器模板文档

- 当`explore_type = project`时模板文档：`${CLAUDE_PLUGIN_ROOT}/skills/openpowers-explore/references/explore-project.md`
- 当`explore_type = references`时模板文档：`${CLAUDE_PLUGIN_ROOT}/skills/openpowers-explore/references/explore-references.md`

**红线禁告**：openpowers-explore 禁止读取任何文件，尤其是`当前探索器模板文档`。

## 关键规则

1. **不要实现**：本技能只做调研和理解，不写任何实现代码。
2. **只探索，不做方案**：本技能严格只探索和记录项目现状，绝对不要针对用户输入的需求生成任何提案、计划、实现方案、建议或下一步行动。如果用户输入中包含需求描述或功能请求，只提取用于探索所需的技术上下文——不要分析可行性、不要建议方案、不要拟定实施步骤。
3. **不臆造信息**：探索结果必须基于实际代码，不要编造不存在的实现。
4. **🔴 红线 — 严格关联 explore_content**：只查询和报告与 `explore_content` **直接或较相关**的内容。输出中的每一条信息都必须直接服务于对 `explore_content` 的理解。绝对不要包含无关或弱相关的发现、观察、代码片段。禁止出现杂七杂八的、沾边的、"顺便看看"的内容。拿不准的，宁可不放。
