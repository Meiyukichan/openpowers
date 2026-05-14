---
name: openpowers-plan
description: 当你拥有规格说明或需求用于多步骤任务时使用，在手写代码之前使用
---

# 编写计划

## 概览

将实现工作分解为独立、可追踪的功能。每个功能描述要构建什么，而不是如何构建——实现细节留给执行代理。

输出是一个功能列表 JSON 文件，作为执行契约：代理按状态拾取功能，知道哪些已完成，并能在多个会话之间无缝恢复。

**保存计划至：** `openspec/changes/<name>/plan.json`

## 技能配置

通过以下脚本查询技能配置：

```bash
python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py {当前项目路径} language experimental.plan-factor
```

脚本按顺序返回两个值：

1. `language` — 输出语言。将脚本返回的语言作为本次技能所有面向用户的回答和输出的默认语言。如果无输出，回退使用中文。
2. `experimental.plan-factor` — 特性预算倍数，控制生成的计划中 feature 数量的上限。最大为3。

## openspec组件位置

**阅读已有产物以获取上下文**（如果之前已读取则不再重复）：
- `openspec/changes/<name>/specs/**/*.md`
- `openspec/changes/<name>/proposal.md`
- `openspec/changes/<name>/design.md`
- `openspec/changes/<name>/tasks.md`（这个是你最直接的依据之一）
- `openspec/changes/<name>/api.yaml`
- `openspec/changes/<name>/database.md`
- 等等

**这四类产物（proposal.md、design.md、tasks.md、specs/）必须全部存在。** 如果任意缺失，则认为之前阶段未完成——停止执行本技能，并提醒用户先执行 `openpowers-propose` 技能。

所有规划决策必须引用这些规格文档中的具体章节/语句。

## 范围检查

如果规格涵盖多个独立子系统，它应该在头脑风暴阶段被分解为子项目规格。如果没有，建议将其拆分为独立的计划——每个子系统一个，对应的 specs 也要拆分为数个。每个计划应能独立产出可工作、可测试的软件。

## 文件结构

在定义功能之前，先规划出将要创建或修改哪些文件以及每个文件的职责。这是将分解决策固定下来的地方。

- 设计具有清晰边界和定义良好的接口的单元。每个文件应有一个清晰的职责。
- 你对能一次性放入上下文的代码推理最好，当文件聚焦时你的编辑更可靠。优先使用更小、聚焦的文件，而不是做得太多的大文件。
- 经常一起更改的文件应该放在一起。按职责而不是按技术层拆分。
- 在现有代码库中，遵循既有模式。如果代码库使用大文件，不要单方面重组——但如果正在修改的文件已经变得臃肿，在计划中包含拆分是合理的。

这个结构为功能分解提供信息。每个功能应该产生自包含的、独立有意义的变更。

## 功能粒度

**第一原则：** 最终生成的计划中，feature 数量 MUST NOT 超过 `experimental.plan-factor` × `openspec/changes/<name>/specs/` 下的 spec 文件数(最小为1)。

每个功能是一个可独立测试的工作单元——可在单个专注会话中由代理完成，同时交付有意义的价值。

**好的功能：** "邮箱+密码用户登录，返回 JWT token"
**不好的功能：** "认证系统"（太大）
**不好的功能：** "在 auth 模块中添加 `import jwt`"（太小，没有独立价值）

## 依赖排序

功能必须按拓扑排序排列——某个功能出现在依赖它的任何功能之前。编写 JSON 数组时：

1. 从没有依赖的功能开始
2. 接着是依赖项已被列出的功能
3. 继续直到所有功能都放置完毕
4. 验证：没有任何功能引用的依赖项出现在数组后面

这种排序确保消费者可以按顺序处理功能，无需重新排序。

## JSON 模式

```json
[
  {
    "id": "auth-001",
    "category": "authentication",
    "function": "user-login",
    "description": "实现邮箱/密码登录。验证凭据与数据库匹配，成功时返回 JWT token。",
    "acceptance_criteria": [
      "有效的邮箱+密码返回 200 及 JWT token",
      "错误的密码返回 401 Unauthorized",
      "不存在的邮箱返回 401（不得透露用户是否存在）"
    ],
    "files": ["src/auth/login.ts", "src/auth/login.test.ts"],
    "dependencies": [],
    "spec_refs": ["openspec/changes/<name>/specs/auth/spec.md#login", "openspec/changes/<name>/design.md#auth", "openspec/changes/<name>/tasks.md#auth-001"],
    "status": "pending"
  }
]
```

### 字段定义

| 字段 | 必需 | 描述 |
|-------|----------|-------------|
| `id` | 是 | 唯一标识符，在依赖引用中使用。格式：`{category-prefix}-{number}` |
| `category` | 是 | 此功能所属的模块/子系统 |
| `function` | 是 | 功能名称，简洁且具体 |
| `description` | 是 | 要构建的内容——为代理提供足够的上下文以做出好的实现决策，但不包含代码 |
| `acceptance_criteria` | 是 | 可验证的条件列表。规格审查员据此检查。 |
| `files` | 是 | 此功能将创建或修改的文件路径。必须是具体路径，不能是模式。 |
| `dependencies` | 是 | 必须先完成的功能 ID 列表。如果没有则为空数组。 |
| `spec_refs` | 是 | 引用上游规格文档。**应该**准确包含本功能所涉及的 `specs/` 下的规格文档；`design.md`、`tasks.md`、`api.yaml`、`database.md` 等其他产物，按本功能实际涉及的部分准确添加引用。（例如 `openspec/changes/<name>/specs/auth/spec.md#login`、`openspec/changes/<name>/design.md#auth`、`openspec/changes/<name>/tasks.md#auth-001`） |
| `status` | 是 | `pending` / `in_progress` / `done` / `skipped` / `blocked`。默认：`pending` |

## 自我审查

编写完整功能列表后，对照 design、tasks 和 specs 检查。这是你自己运行的检查清单——而非派发子代理。

**1. 覆盖检查：** 浏览 specs、design、tasks 中的每个章节/需求。你能指出实现它的功能吗？列出任何缺口。

**2. 依赖有效性：** `dependencies` 数组中的每个 ID 必须作为另一个功能的 `id` 存在。没有循环依赖。

**3. 文件路径一致性：** 各功能引用的文件是否一致？如果功能 A 创建了功能 B 使用的模块，路径是否匹配？

**4. 验收标准质量：** 每个标准必须是客观可验证的——不模糊（"正常工作"），而是具体（"密码无效返回 401"）。

如果你发现问题，直接修复。不需要重新审查——修复然后继续。如果发现 specs/design/tasks 中的需求没有对应的功能，添加该功能。

## 完成提示

保存计划后，提示用户所有准备工作已完成，可以执行 `openpowers-sdd` 进行变更执行。

