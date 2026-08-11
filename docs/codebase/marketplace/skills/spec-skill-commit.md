# Skill: furina-commit

> Source files:
> - `marketplace/skills/furina-commit/SKILL.md` : 1-108

## Overview

furina-commit 是 Furina 的 Git 自动提交与推送技能。该技能定义了一套完整的 Git 自动化操作流程：环境检查、暂存变更、生成标准化提交信息、用户确认后提交、以及推送到远程仓库。

**设计动机：**
- 开发者在日常工作中频繁进行"暂存所有变更 -> 编写提交信息 -> 提交 -> 推送"的重复操作，该技能将这一流程自动化
- 提交信息遵循 Conventional Commits 规范，确保提交历史整洁、可追溯
- 内置安全策略防止意外的破坏性操作（强制推送、泄露密钥等）

**使用场景：**
- 用户提及 "auto commit and push"、"smart push"、"自动提交并推送"、"快速提交推送"、"commit & push" 等意图时触发
- 快速保存工作进度，同时保持规范的提交历史
- 多人协作项目中需要标准化提交格式时

**涉及的源文件及职责：**
- `marketplace/skills/furina-commit/SKILL.md`：技能的完整定义文件，包含输入参数、前置条件、五步执行流程、安全策略、异常处理规则和 RED LAW 约束

## Architecture / Flow

### 执行流程总览

```
用户触发 (意图匹配)
       |
       v
 [1] 环境检查 ─── git status --porcelain -uall
       |                    |
       | (空输出)           | (有变更)
       v                    v
   终止并通知           [2] 暂存变更
                        git add . / git add <files>
                              |
                              v
                       [3] 生成提交信息
                        git diff --cached --stat + git diff --cached
                        Conventional Commits 格式
                        敏感内容扫描
                              |
                              v
                        用户确认提交信息
                              |
                              v
                       [4] 执行提交
                        git commit -m "<message>"
                              |
                              v
                       [5] 推送到远程  (push=false 时跳过)
                        git push origin <branch>
                              |
                        ┌─────┴─────┐
                     (成功)       (失败)
                        |            |
                     通知成功     提示拉取/手动推送
```

### 安全检查点

```
安全策略嵌入在执行流程中:
  - 步骤 3: 敏感内容扫描 (API keys, tokens, passwords, private keys)
  - 步骤 3: 用户确认提交信息 (强制等待)
  - 步骤 4: amend 操作风险警告
  - 步骤 5: 受保护分支额外确认 (main, master, release/*)
  - 全局: 禁止 force push (除非双次确认 --force-with-lease)
```

## Functionality / Interface Details

### 输入参数（Input Parameters）

技能通过 AI Agent 上下文接收以下可选输入参数，而非传统的函数调用参数。这些参数控制技能的执行行为。

---

#### `branch` (Target Branch)

**类型**: `string`（可选）

**功能**: 指定推送的目标分支。当用户希望将提交推送到非当前分支时使用此参数。若未提供，技能使用当前分支（`HEAD`）作为目标。

**约束**: 分支必须存在于本地仓库且已设置上游跟踪分支。

**默认值**: 当前分支

---

#### `type` (Commit Type)

**类型**: `string`（可选）

**功能**: 覆盖自动生成的 Conventional Commits `type` 前缀。当用户希望强制使用特定的提交类型（如 `feat`、`fix`、`refactor`）时使用。

**有效值**: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`, `perf`, `ci`

**默认值**: 由技能根据 `git diff --cached` 内容自动推断

---

#### `scope` (Commit Scope)

**类型**: `string`（可选）

**功能**: 覆盖自动生成的 Conventional Commits `scope` 部分。当用户希望指定变更的影响范围（如模块名、组件名）时使用。

**约束**: 建议使用简短的小写标识符（如 `auth`, `ui`, `api`）

**默认值**: 由技能根据变更文件路径和内容自动推断

---

#### `push` (Push Enabled)

**类型**: `boolean`（可选）

**功能**: 控制提交后是否自动推送到远程仓库。设为 `false` 时，技能在完成提交后即终止，不执行推送操作。

**默认值**: `true`

---

#### `stage` (Stage Scope)

**类型**: `string`（可选）

**功能**: 控制暂存变更的范围。默认暂存工作目录中的所有变更文件；也可以指定仅暂存特定文件。

**有效值**:
- `all`：暂存所有变更（执行 `git add .`）
- `specific:<file1,file2,...>`：仅暂存指定文件列表（执行 `git add <file1> <file2> ...`）

**默认值**: `all`

---

### 执行步骤 1: 环境检查 (Environment Check)

**功能**: 在执行任何 Git 操作前，检查当前工作目录是否为 Git 仓库，并获取工作树状态。这是流程的第一道门控，确保后续操作有变更可处理。

**执行命令**:
```bash
git status --porcelain -uall
```

**核心逻辑**:
1. 运行 `git status --porcelain -uall` 获取所有文件状态（包括未跟踪文件），使用 porcelain 格式便于机器解析
2. 检查输出是否为空：
   - **输出为空**: 说明工作目录干净（clean），没有未提交的变更。回复 `✅ Working directory clean, nothing to commit.` 并终止流程
   - **输出非空**: 存在待处理的变更，继续进入步骤 2

**Code Source**: `marketplace/skills/furina-commit/SKILL.md`:29-33

---

### 执行步骤 2: 暂存变更 (Stage Changes)

**功能**: 将工作目录中的变更添加到 Git 暂存区（staging area）。暂存操作决定哪些文件的变更会被包含在下一步的提交中。

**执行命令**:
```bash
# 默认模式: 暂存所有变更
git add .

# 特定文件模式: 仅暂存指定文件
git add <file1> <file2> ...
```

**核心逻辑**:
1. 检查 `stage` 参数：
   - 默认（`all` 或未指定）: 执行 `git add .` 暂存所有新增、修改、删除的文件
   - `specific:<files>` 或用户明确表示"只提交部分文件": 执行 `git add <files>` 仅暂存指定文件
2. 如果 `git add` 失败（文件冲突、权限问题等），打印错误信息并终止

**Code Source**: `marketplace/skills/furina-commit/SKILL.md`:35-38

---

### 执行步骤 3: 生成标准化提交信息 (Generate Commit Message)

**功能**: 基于暂存区的 diff 内容，自动生成符合 Conventional Commits 规范的提交信息。这是技能的核心智能环节，需要分析变更内容并生成准确、简洁的描述。

**执行命令**:
```bash
# 获取暂存区变更概览
git diff --cached --stat

# 获取暂存区详细差异
git diff --cached
```

**核心逻辑**:
1. 使用 `git diff --cached --stat` 获取变更文件列表和增删行数统计
2. 使用 `git diff --cached` 获取详细的代码差异
3. 基于 diff 内容生成 Conventional Commits 格式的提交信息：
   ```
   <type>(<scope>): <short description>
   ```
4. **类型推断规则**：
   - 常见类型: `feat`(新功能), `fix`(修复), `refactor`(重构), `style`(样式), `docs`(文档), `test`(测试), `chore`(杂项), `perf`(性能), `ci`(CI/CD)
   - 如果变更涉及多种类型，选择最重要的类型，并在 message body 中补充详细说明
   - 如果用户提供了 `type` 或 `scope` 参数，优先使用用户指定的值
5. **主体行长度限制**: 保持 subject line 在 72 个字符以内
6. **敏感内容扫描**（MUST）: 在最终确定提交信息之前，必须扫描 diff 内容检查是否包含潜在的密钥、密码、API token 或其他敏感信息。如果发现敏感内容，必须警告用户并暂停等待确认
7. **用户确认**（MUST）: 生成提交信息后，向用户展示提议的提交信息，等待用户确认后才能进入提交步骤

**Code Source**: `marketplace/skills/furina-commit/SKILL.md`:40-53

---

### 执行步骤 4: 提交 (Commit)

**功能**: 在用户确认提交信息后，执行实际的 Git 提交操作。支持单行和多行提交信息，以及 amend 模式。

**执行命令**:
```bash
# 标准提交（单行或短提交信息）
git commit -m "<generated commit message>"

# 多行提交信息（使用 HEREDOC 语法）
git commit -m "$(cat <<'EOF'
<type>(<scope>): <short description>

<body>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**核心逻辑**:
1. 等待用户对步骤 3 生成的提交信息确认（前置条件，不可跳过）
2. 用户确认后执行 `git commit -m "<message>"`
3. **Amend 模式处理**：
   - 如果用户请求修改上一次提交（amend），使用 `--amend` 参数
   - 必须明确警告 amend 操作的风险：会重写已发布的提交历史
   - amend 操作需要用户的额外确认
4. **多行提交信息处理**：
   - 当提交信息包含 body 和 footer 时，使用 HEREDOC 语法确保格式正确
   - HEREDOC 中固定包含 `Co-Authored-By: Claude <noreply@anthropic.com>` 署名
5. 如果 `git commit` 失败，打印错误信息并终止

**Code Source**: `marketplace/skills/furina-commit/SKILL.md`:55-75

---

### 执行步骤 5: 推送 (Push)

**功能**: 将本地提交推送到远程仓库。支持推送到当前分支或指定的目标分支，并处理推送失败的情况。

**执行命令**:
```bash
# 获取当前分支名
git rev-parse --abbrev-ref HEAD

# 推送到远程
git push origin <branch>
```

**核心逻辑**:
1. 通过 `git rev-parse --abbrev-ref HEAD` 获取当前分支名称
2. 如果用户提供了 `branch` 参数且与当前分支不同，推送到指定分支
3. 执行 `git push origin <branch>` 推送到远程
4. **结果处理**：
   - **成功**: 回复 `✅ Successfully pushed to origin/<branch>.`
   - **失败**（如远程有新提交）: 提醒用户执行 `git pull --rebase` 解决冲突，并询问是否自动执行
5. **跳过条件**: 如果 `push` 参数为 `false`，完全跳过此步骤

**Code Source**: `marketplace/skills/furina-commit/SKILL.md`:77-85

---

### 安全策略 (Security Policy)

**功能**: 定义技能在执行过程中的安全约束，防止意外的破坏性操作和敏感信息泄露。

**策略详情**:

1. **禁止强制推送 (No Force Push)**
   - 默认情况下禁止使用 `--force` 或 `--force-with-lease` 推送
   - 仅当用户显式请求 `--force-with-lease` 并经过二次确认后才允许

2. **受保护分支检测 (Protected Branches)**
   - 当目标分支为 `main`、`master` 或匹配 `release/*` 模式时，标记为受保护分支
   - 推送到受保护分支前需要额外的用户确认

3. **敏感内容扫描 (Sensitive Content Scan)**
   - 在生成提交信息前扫描 diff 中的敏感内容
   - 检测目标: API keys, tokens, passwords, private keys
   - 发现敏感内容时暂停并警告用户

4. **含凭证变更阻止 (Skip on Uncommitted Secrets)**
   - 如果 diff 中包含凭据信息，拒绝执行提交
   - 指导用户先移除敏感内容或将其迁移到安全位置（如 `.env` 加入 `.gitignore`）

**Code Source**: `marketplace/skills/furina-commit/SKILL.md`:87-92

---

### RED LAW (不可违反的铁律)

**功能**: 定义技能执行中的绝对禁止行为。这些规则是硬性约束，任何时候都不可违反。

**规则详情**:

1. **禁止未经双次确认的强制推送**
   - 绝不执行 `git push --force` 或等效操作
   - 仅允许 `--force-with-lease`，且需用户二次确认

2. **禁止提交敏感信息**
   - 绝不提交 secrets、credentials 或 `.env` 文件
   - 必须扫描 diff 并在检测到时暂停

3. **禁止执行破坏性 Git 操作**
   - 绝不在此技能中执行 `git reset --hard`、`git checkout .`、`git clean -fd`
   - 除非用户有明确的操作指令

4. **禁止跳过用户确认**
   - 提交前必须等待用户确认
   - 推送前必须等待用户确认

**Code Source**: `marketplace/skills/furina-commit/SKILL.md`:102-108

## Data Structures

### 输入参数定义

该技能的输入参数不以传统代码数据结构定义，而是通过技能配置的 frontmatter 和用户意图匹配传入。以下是参数的结构化定义：

```
InputParameters {
  branch?: string       // 目标推送分支，默认: 当前分支
  type?: string         // Conventional Commits type，有效值: feat|fix|refactor|style|docs|test|chore|perf|ci
  scope?: string        // Conventional Commits scope，建议: 小写标识符
  push?: boolean        // 是否推送，默认: true
  stage?: string        // 暂存范围，默认: "all"，或 "specific:<file1,file2,...>"
}
```

### Conventional Commits 提交信息格式

```
CommitMessage {
  type: string          // 变更类型，必填
  scope?: string        // 变更范围，可选
  description: string   // 简短描述，≤72 字符
  body?: string         // 详细说明，可选（混合变更时使用）
  footer?: string       // 脚注，可选（如 BREAKING CHANGE 说明）
}
```

提交信息的标准格式：
```
<type>(<scope>): <description>

<body>

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 受保护分支模式

```
ProtectedBranchPatterns: ["main", "master", "release/*"]
```
匹配这些模式的分支在推送前需要额外的用户确认。

## Error Handling and Edge Cases

### 错误处理策略

技能采用"打印错误 + 终止"的统一错误处理模式。不自动重试，不静默忽略错误，确保用户对每次失败都有明确感知。

### 各类异常场景

| 场景 | 处理方式 |
|------|----------|
| `git add` 失败（文件冲突、权限问题） | 打印原始错误信息，终止流程，不自动重试 |
| `git commit` 失败 | 打印原始错误信息，终止流程 |
| 推送失败（远程有新提交） | 提示用户运行 `git pull --rebase` 解决冲突，询问是否自动执行 |
| 推送失败（网络问题） | 提示用户稍后重试或手动推送 |
| 存在未解决的合并冲突 | 引导用户先解决冲突，再使用此技能 |
| 当前分支无上游跟踪分支 | 指导用户先执行 `git push -u origin <branch>` 设置上游 |
| 工作目录不是 Git 仓库 | 输出明确的错误信息，终止流程，不执行任何 Git 操作 |
| diff 中检测到敏感内容 | 暂停流程，警告用户，等待用户移除或确认 |
| diff 中包含凭据信息 | 拒绝提交，指导用户移除凭据或将其放入安全存储 |

### 边界情况

- **工作目录完全干净**: 步骤 1 检查后立即终止，回复"Working directory clean"
- **仅删除文件**: `git add .` 会正确暂存删除操作
- **混合类型变更**: 选择最重要的 type，在 message body 中补充详细信息
- **amend 已推送的提交**: 明确警告风险（重写已发布历史），需要用户额外确认
- **推送目标与当前分支不同**: 使用 `branch` 参数指定的目标分支而非当前分支

## Dependencies

### Depends on（本技能依赖）

| 依赖项 | 用途 |
|--------|------|
| Git CLI (`git`) | 所有 Git 操作（status, add, diff, commit, push, rev-parse） |
| Shell 执行环境 | 执行 Git 命令、HEREDOC 语法 |
| AI Agent 上下文 | 接收用户意图、输入参数，执行 diff 分析和提交信息生成 |

### Depended by（依赖本技能的模块）

| 模块 | 说明 |
|------|------|
| `furina-finalize` | 最终化技能在完成集成测试和代码库同步后，调用 furina-commit 提交所有变更 |
| `workflow` 命令 | 工作流编排在 finalize 阶段间接触发此技能 |

## Usage Examples

### 基本使用：自动提交并推送所有变更

```text
用户: "帮我自动提交并推送"

流程:
  1. git status --porcelain -uall → 发现 3 个文件有变更
  2. git add . → 暂存所有文件
  3. git diff --cached --stat → 分析变更概览
     git diff --cached → 分析详细差异
  4. 生成提交信息: "feat(auth): add JWT token refresh mechanism"
  5. 展示给用户 → 用户确认
  6. git commit -m "feat(auth): add JWT token refresh mechanism"
  7. git rev-parse --abbrev-ref HEAD → main
  8. ⚠️ 受保护分支 main，需要额外确认
  9. 用户确认 → git push origin main
  10. ✅ Successfully pushed to origin/main.
```

### 指定类型和范围

```text
用户: "commit and push, type=fix, scope=api"

流程:
  1. git status --porcelain -uall → 发现变更
  2. git add . → 暂存所有文件
  3. 生成提交信息（强制使用 type=fix, scope=api）: "fix(api): handle null response in user endpoint"
  4. 用户确认 → git commit
  5. git push origin <current-branch>
```

### 仅提交不推送

```text
用户: "commit only, no push"

参数: push = false

流程:
  1-4. 同基本流程（检查 → 暂存 → 生成信息 → 提交）
  5. 跳过推送步骤
```

### 仅暂存特定文件

```text
用户: "只提交 src/auth.ts 和 src/types.ts"

参数: stage = "specific:src/auth.ts,src/types.ts"

流程:
  1. git status → 发现多个文件有变更
  2. git add src/auth.ts src/types.ts → 仅暂存指定文件
  3. git diff --cached → 仅分析这两个文件的差异
  4. 生成提交信息 → 用户确认 → 提交 → 推送
```

### 敏感内容检测场景

```text
用户: "auto commit"

流程:
  1. git status → 发现变更
  2. git add . → 暂存
  3. git diff --cached → 扫描发现 .env 文件包含 API_KEY=sk-xxxx
  4. ⚠️ 检测到敏感内容: API key 在 .env 文件中
     "请先移除 .env 中的密钥或将其加入 .gitignore"
  5. 暂停流程，等待用户处理
```

### 推送失败场景

```text
流程:
  1-4. 正常完成检查、暂存、提交
  5. git push origin main → 失败: "remote has new commits"
     "远程仓库有新提交，建议执行 git pull --rebase 解决冲突。是否自动执行？"
  6. 用户选择手动处理 → 终止
```

Explanation: 上述示例覆盖了 furina-commit 技能的主要使用场景。基本使用展示了完整的五步流程；指定参数的示例展示了如何控制提交类型和暂存范围；仅提交不推送展示了 push=false 的行为；特定文件暂存展示了 stage=specific 的用法；敏感内容检测展示了安全策略的触发；推送失败展示了异常处理流程。
