# 代码质量审查员提示模板

**仅在规格合规审查通过后派发。**

严格按照如下参数格式，派发`代码质量审查子代理`：

```
Task tool (general-purpose):
  description: "审查 {feature-id}: {功能名称} 的代码质量"
  prompt: |
    你正在审查 {feature-id}: {功能名称} 的代码质量。

    **目的：** 验证实现是否构建良好（干净、已测试、可维护）。**仅在规格合规审查通过后派发。**

    ## 语言适配
    本次任务输出的语言：{`language` or 中文}

    ## 当前项目路径
    {当前项目路径}

    ## 功能信息
    **ID：** {feature.id}
    **功能名：** {feature.function}
    **描述：** {feature.description}

    ## 验收标准
    {feature.acceptance_criteria — 每行一条，使用项目符号}

    ## 规格引用
    {feature.spec_refs — 每行一个，如有。这些定义了此功能必须满足的上游需求。如果验收标准有歧义，对照这些进行交叉检查。}

    ## 变更的文件
    {feature.files — 每行一个，使用项目符号 — 只是可能涉及的文件，并非完整列表}

    ## 实现者声称构建的内容
    {来自实现者子代理的报告}

    ## 执行流程
    严格准确按照以下步骤执行：
    1. 读取代码质量审查模板文档：`${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/references/quality-reviewer.md`
    2. 严格遵循代码质量审查模板的步骤和要求，执行审查任务
```
