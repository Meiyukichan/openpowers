---
name: openpowers-propose
description: 创建新的变更提案，一步生成所有产物。当用户想要快速描述他们想构建的东西并获得包含设计、规格和任务的完整提案（准备进入实现阶段）时使用。
---

创建新变更提案——一步生成变更和所有产物。

我将创建包含以下产物的变更：

- proposal.md（做什么 & 为什么）
- design.md（怎么做）
- tasks.md（实现步骤）

---

**输入**：用户的请求应包含变更名称（kebab-case 格式）或对想要构建的内容的描述。

**语言适应**

通过以下脚本查询插件要求的输出语言：

```bash
python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py {当前项目路径} language
```

将脚本返回的语言作为本次技能所有面向用户的回答和输出的默认语言。如果脚本无输出或执行失败，回退使用中文。

**步骤**

1. **如果没有清晰的输入，询问他们想构建什么**

   使用 **AskUserQuestion 工具**（开放式，无预设选项）询问：

   > "你想做什么变更？描述一下你想构建或修复的内容。"

   根据用户的描述，推导出 kebab-case 名称（例如，"添加用户认证" → `add-user-auth`）。

   **重要**：在理解用户想要构建什么之前，不要继续。

2. **创建变更目录**

   ```bash
   openspec new change "<name>"
   ```

   这将在 `openspec/changes/<name>/` 创建一个包含 `.openspec.yaml` 的脚手架变更。

3. **获取产物构建顺序**

   ```bash
   openspec status --change "<name>" --json
   ```

   解析 JSON 以获取：
   - `applyRequires`：实现之前所需的产物 ID 数组（例如 `["tasks"]`）
   - `artifacts`：所有产物的列表，包含状态和依赖关系

4. **按顺序创建产物直到准备就绪**

   使用 **TodoWrite 工具**跟踪产物创建进度。

   按依赖顺序循环处理产物（首先处理没有未满足依赖的产物）：

   a. **对于每个 `ready` 状态的产物（依赖已满足）**：
   - 获取指令：
     ```bash
     openspec instructions <artifact-id> --change "<name>" --json
     ```
   - 指令 JSON 包含：
     - `context`：项目背景（给你的约束——不要包含在输出中）
     - `rules`：产物特定的规则（给你的约束——不要包含在输出中）
     - `template`：输出文件的结构模板
     - `instruction`：针对此类产物的模式特定指导
     - `outputPath`：产物文件写入路径
     - `dependencies`：需要读取以获取上下文的已完成产物
   - 读取任何已完成的依赖文件以获取上下文
   - 使用 `template` 作为结构创建产物文件
   - 将 `context` 和 `rules` 作为约束——但不要复制到文件中
   - 显示简要进度："已创建 <artifact-id>"

   b. **继续直到所有 `applyRequires` 产物完成**
   - 创建每个产物后，重新运行 `openspec status --change "<name>" --json`
   - 检查 `applyRequires` 中的每个产物 ID 在产物数组中是否 `status: "done"`
   - 当所有 `applyRequires` 产物完成时停止

   c. **如果产物需要用户输入**（上下文不清晰）：
   - 使用 **AskUserQuestion 工具**进行澄清
   - 然后继续创建

5. **显示最终状态**
   ```bash
   openspec status --change "<name>"
   ```

**输出**

完成所有产物后，总结：

- 变更名称和位置
- 已创建的产物列表及简要描述
- 准备就绪提醒用户："所有产物已创建！可以运行技能 `openpowers-schema` 来生成schema文档。"

**产物创建指南**

- 遵循 `openspec instructions` 中每种产物类型的 `instruction` 字段
- 模式定义了每个产物应包含的内容——遵循它
- 创建新产物前先读取依赖产物以获取上下文
- 使用 `template` 作为输出文件的结构——填充其各个部分
- **重要**：`context` 和 `rules` 是给你的约束，不是要写进文件的内容
  - 不要将 `<context>`、`<rules>`、`<project_context>` 块复制到产物中
  - 这些指导你写什么，但绝不应出现在输出中

**防护规则**

- 创建实现所需的所有产物（如模式 `apply.requires` 所定义）
- 创建新产物前始终先读取依赖产物
- 如果上下文严重不清晰，询问用户——但更倾向于做出合理决策以保持进展
- 如果同名变更已存在，询问用户是继续还是创建新的
- 在继续下一个产物之前，验证每个产物文件已成功写入
