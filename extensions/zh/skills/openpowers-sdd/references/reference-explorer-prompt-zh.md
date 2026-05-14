# 参考资料探索器子代理

严格按照如下参数格式，派发`参考资料探索器子代理`：

```
Task tool (general-purpose):
  description: "探索 {feature-id}: {功能名称} 的参考资料"
  prompt: |
    你正在探索 {feature-id}: {功能名称} 的参考资料。

    ## 语言适配
    本次任务输出的语言：{`language` or 中文}

    ## 探索内容
    {当前变更 feature-id 的功能描述和功能涉及的信息}

    ## 执行流程
    严格准确按照以下步骤执行：
    1. 调用技能 `openpowers-explore` 获取到功能的参考文档或者实现，技能参数如下：
        - 探索类型：references
        - 探索内容：{探索内容}
        - 输出文件路径：`openspec/changes/<name>/reference/{feature-id}.md`
```
