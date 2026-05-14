---
name: openpowers-finalize
description: >
  自动化 Git 提交技能。读取当前工作区变更，按路径分组调用技能 openpowers-codebase-sync 同步codebase，
  然后执行 git add、commit、push 完成一次完整的代码保存流程。
  触发场景：用户说"保存代码"、"save git"、"自动提交"、"提交代码"、"git save"时使用。
  无需任何输入参数，直接调用即可。
---

# Save Git — 自动化 Git 提交 + codebase同步

读取当前工作区的文件变更，对 `主代码目录` 路径下的变更按模块分组调用 `openpowers-codebase-sync` 同步codebase，
然后执行 `git add .` → `git commit` → `git push` 完成完整的代码保存流程。

**无需输入参数**，直接执行即可。

## 执行阶段

严格按以下阶段顺序执行，不得跳过或合并。

### 阶段一：获取变更文件列表

1. 执行 Bash 命令：`git status -uall`
2. 解析输出结果，提取三种变更类型：
   - **modified 文件**：从 `Changes not staged for commit:` 区域提取 `modified:` 行
   - **deleted 文件**：从 `Changes not staged for commit:` 区域提取 `deleted:` 行
   - **added 文件（未跟踪）**：从 `Untracked files:` 区域提取（没有 `modified:`/`deleted:` 前缀的行）

   > 注意：`Changes to be committed:` 区域的内容忽略，只处理上述两个区域。

3. 将所有变更文件整理为列表，记录每条文件的变更类型（modified / deleted / added）。

如果没有变更文件（列表为空），输出"没有检测到变更文件，无需提交"并结束流程。

### 阶段二：路径分组

调用以下脚本获取到`主代码目录`：

```bash
python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py {当前项目路径} project.sourcecode
```

对变更列表中所有以 `主代码目录` 开头的文件，按以下规则分组：

1. 提取文件路径的第二级目录（`{主代码目录}/xxx/...` 中的 `xxx`）
2. 如果第二级目录下的文件数量 ≤ 2 个，且存在第三级目录（`{主代码目录}/xxx/yyy/...`），则按第三级目录 `yyy` 进一步细分（即将 `{主代码目录}/xxx/yyy` 作为分组键）
3. 非 `主代码目录` 路径的文件不参与分组，但记录在变更概要中

**分组示例**：

```
主代码目录: src/

文件列表：
  src/electron/main/ipc/handler.ts
  src/electron/main/ipc/registry.ts
  src/electron/preload/index.ts
  src/renderer/components/App.vue
  docs/design/PROPOSAL.md

分组结果：
  组1 (src/electron/main/ipc): handler.ts, registry.ts
  组2 (src/electron/preload): index.ts
  组3 (src/renderer/components): App.vue
  其他: docs/design/PROPOSAL.md
```

### 阶段三：调用 openpowers-codebase-sync 同步codebase

对于阶段二中分组的每一个组，按照如下模板 **串行调用** Tool工具拉起同步codebase子代理：

```
Task tool (general-purpose):
  description: "同步 [分组简要描述] codebase"
  prompt: |
    你正在同步 [分组简要描述] 的codebase

    ## 变更文件列表
    [该组的所有文件路径以及对应的变更类型，逗号分隔]

    ## 工作步骤
    1. 调用Skill：openpowers-codebase-sync 完成对codebases的更新
    2. 忽略skill的返回，无论成功失败
```

**必须串行执行**：一个组的调用完成后，再调用下一个组，禁止并行调用

3. 等待所有组都调用完成后，再继续下一阶段

> **注意**：非 `主代码目录` 路径的变更文件不需要调用 openpowers-codebase-sync，但仍需包含在后续的 git commit 中。

### 阶段四：Git 提交

1. 执行 Bash 命令：`git add .`
2. 根据阶段一收集的所有变更文件，生成简要的 commit 概述：
   - 统计 modified / deleted / added 各多少个文件
   - 从变更文件路径中提取关键模块信息
   - 生成简洁的 commit message，格式如：`更新 xxx 模块：修改了 N 个文件`
3. 执行 Bash 命令：`git commit -m "{commit message}"`
4. 执行 Bash 命令：`git push`

## 关键规则

1. **无需输入参数**。本 skill 不接受任何外部输入，全部信息从 `git status` 获取。
2. **串行调用**。每个分组调用 openpowers-codebase-sync 必须串行，不得并行。
3. **变更类型区分**。modified 和 deleted 只看 `Changes not staged for commit:` 区域；added 只看 `Untracked files:` 区域。忽略 `Changes to be committed:` 区域。
4. **分组粒度**。优先按二级目录分组；如果某组文件过少（≤2个）且有三级目录，则按三级目录细分。
5. **完整的提交流程**。必须包含 add → commit → push 三个步骤，不可省略。
