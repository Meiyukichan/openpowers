# Skill: furina-plan -- 规划技能（Schema 补全与实施计划生成）

> Source files:
> - `marketplace/skills/furina-plan/SKILL.md` : 1-35
> - `marketplace/skills/furina-plan/instructions/schema.md` : 1-43
> - `marketplace/skills/furina-plan/instructions/plan.md` : 1-152
> - `marketplace/skills/furina-plan/references/template-api.md` : 1-289
> - `marketplace/skills/furina-plan/references/template-database.md` : 1-82

## Overview

`spec-skill-plan` 是 Furina 工作流中的**规划技能**，位于 Propose 阶段之后、SDD 阶段之前。它的核心职责是在 Proposal / Design / Specs 三大产物完成后，**补充技术规范 Schema 文档**（API 规范、数据库设计）并**生成结构化的实施计划**（`plan.json`），将工作分解为可独立追踪的 Feature。

**系统定位**：furina-plan 是工作流中的"桥梁"技能 -- 它读取上游 Propose 阶段产生的提案/设计/规格说明，输出下游 SDD 阶段所需的 Feature 列表和可选的 API/数据库 Schema 文档。它确保了"设计决策"到"可执行任务"的精确转换。

**设计动机**：
- **Schema 补全**：Propose 阶段的 Design 文档通常停留在"如何设计"的层面，缺少正式的 API 规范（Swagger YAML）和数据库设计文档（表结构、关系、迁移策略），这些对后端开发和前后端联调至关重要。
- **任务分解**：Specs 文档是需求级别的，不能直接作为开发任务执行。plan 技能将需求转化为独立、可测试、有依赖关系的 Feature 列表，使 SDD 技能可以为每个 Feature 启动独立的 SubAgent 进行 TDD 实现。
- **执行契约**：`plan.json` 作为执行契约，明确记录每个 Feature 的状态（pending/in_progress/done/skipped/blocked），支持跨会话恢复和进度追踪。

**使用场景**：
- 在 Propose 阶段完成后，作为工作流的下一个阶段执行
- 通过 `furina:furina-plan` 斜杠命令直接调用
- 通过 `/furina:workflow` 工作流命令自动触发

**涉及源文件及职责**：

| 文件 | 职责 |
|------|------|
| `SKILL.md` | 技能入口：语言适配、顺序执行两个指令、RED LAW 定义 |
| `instructions/schema.md` | Schema Instruction：分析需求决定是否生成 API/Database Schema 文档 |
| `instructions/plan.md` | Plan Instruction：分解 Feature、生成 plan.json、自审 |
| `references/template-api.md` | API Schema 模板：Swagger 2.0 YAML 规范模板 |
| `references/template-database.md` | Database Schema 模板：关系型数据库设计文档模板 |

## Architecture / Flow

furina-plan 采用**两阶段顺序执行**架构，由 `SKILL.md` 作为编排入口：

```
SKILL.md (入口 + 编排)
  |
  v
[Phase 1] Schema Instruction (instructions/schema.md)
  |
  |-- [1] 读取 furina/changes/<name>/ 下的 proposal.md, design.md, specs/
  |        (缺失则终止，提示用户运行 furina-propose)
  |
  |-- [2] 根据 Schema Selection Advice 判断需要哪些 Schema
  |        - API Schema: 涉及后端 HTTP/RPC/GraphQL 接口、前端调用、CLI 远程调用等
  |        - Database Schema: 当且仅当涉及数据库或 SQL
  |
  |-- [3] 读取对应的 reference template (template-api.md / template-database.md)
  |
  |-- [4] 生成 Schema 文档到 furina/changes/<name>/
  |        可能的输出: api.yaml, database.md
  |
  v
[Phase 2] Plan Instruction (instructions/plan.md)
  |
  |-- [1] 读取所有 Furina Artifacts (proposal, design, specs, api.yaml, database.md)
  |
  |-- [2] 任务分解大纲 (不写入文件，仅内部使用)
  |
  |-- [3] 生成 plan.json
  |        - 文件结构规划 (哪些文件需要创建/修改)
  |        - Feature 粒度控制 (30-500 行代码增量)
  |        - 依赖拓扑排序 (无环 DAG)
  |        - RED LAW: Feature 数量 <= feature factor × spec 文件数
  |
  |-- [4] 自审 (Spec 覆盖率、依赖合法性、文件路径一致性、验收标准质量)
  |
  v
输出: furina/changes/<name>/plan.json
      furina/changes/<name>/api.yaml (可选)
      furina/changes/<name>/database.md (可选)
```

**关键设计决策**：
- **严格顺序执行**：Schema Instruction 必须先于 Plan Instruction 完成，因为 Plan 阶段需要读取 Schema 产物（如 `api.yaml`）作为输入。
- **渐进式文档读取**（RED LAW）：每个指令只在即将执行时才读取对应的 instruction 文档，避免提前加载未使用的上下文。
- **语言适配**：所有用户面向的输出（计划文档、说明信息）使用 `furina config show language` 查询到的语言（默认中文）。

## Functionality / Interface Details

### `SKILL.md -- 技能入口与编排`

**Source**: `marketplace/skills/furina-plan/SKILL.md`:1-35

**Functionality**: SKILL.md 是 furina-plan 技能的入口文件，定义了技能的元数据（名称、描述）、语言适配机制和两阶段顺序执行编排逻辑。它负责：
1. 查询语言配置（通过 `furina config show language` 脚本），确保所有输出使用正确语言。
2. 严格按照先 Schema Instruction 后 Plan Instruction 的顺序执行两个指令文档。
3. 定义 RED LAW 规则：渐进式文档读取，只在即将执行某个指令时才读取该指令文档。

**Parameters**:
- 无显式参数输入。技能通过 `furina/changes/<name>/` 目录下的已有产物自动推断上下文。
- `language`（隐式）：通过 `furina config show language` 脚本查询，用于确定输出语言。

**Return Value**:
- 无显式返回值。副作用为生成文件到 `furina/changes/<name>/` 目录。

**Core Logic**:
SKILL.md 的编排逻辑非常简洁，核心是一个严格的顺序依赖链：

```
1. 执行 Schema Instruction (instructions/schema.md)，等待其完全执行
2. Schema Instruction 完成后，执行 Plan Instruction (instructions/plan.md)
```

**Core Code**:
```markdown
## Execute Instructions

You **MUST** strictly and accurately execute the following instruction document step by step:

1. execute `Schema Instruction`, and wait util this instruction executes completely.
2. execute `Plan Instruction` after the completation of `Schema Instruction`.

### Instruction Documents

- `Schema Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-plan/instructions/schema.md`
- `Plan Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-plan/instructions/plan.md`
```
Source: `marketplace/skills/furina-plan/SKILL.md`:20-31

**Usage Example**:
```markdown
# 用户在工作流中触发 Plan 阶段
# Claude Agent 读取 SKILL.md，识别需要执行两个指令
# 1. 先读取并执行 instructions/schema.md（此时才真正读取）
# 2. 等待 Schema 阶段完成后，读取并执行 instructions/plan.md
```
说明：SKILL.md 本身不包含任何业务逻辑，仅作为编排入口。实际逻辑分散在两个 instruction 文档中。

---

### `Schema Instruction -- Schema 文档生成`

**Source**: `marketplace/skills/furina-plan/instructions/schema.md`:1-43

**Functionality**: Schema Instruction 是规划阶段的第一个子指令，负责分析当前 change 的需求，判断是否需要生成 API 或 Database 的技术规范文档。它不是必须执行的 -- 只有当 change 涉及接口设计或数据库操作时才生成对应的 Schema。该指令读取上游 Propose 阶段的三件产物（proposal、design、specs），基于 Schema Selection Advice 做出决策，然后使用对应模板生成文档。

**Core Logic**:

1. **理解阶段**：读取 `furina/changes/<name>/` 下的三个核心产物（proposal.md, design.md, specs/）。如果任何一个缺失，停止执行并提示用户先运行 `furina-propose`。
2. **选择阶段**：基于 Schema Selection Advice 判断需要生成哪些 Schema：
   - **API Schema**（6 种触发条件）：后端 HTTP API、RPC/GraphQL 接口、前端/移动/服务调用、CLI 远程 API、桌面应用网络通信、设计文档提及接口细节。
   - **Database Schema**（唯一条件）：当且仅当 change 涉及数据库或 SQL。
   - 决策基于 design.md 和 specs/ 中的实际内容，而非固定的规则列表。
3. **读取模板**：仅在确定要生成某个 Schema 时，才读取对应的模板文档（RED LAW）。
4. **生成 Schema**：按照模板格式生成文档到 `furina/changes/<name>/`。

**Schema Selection Advice（核心决策规则）**:
```
API Schema 触发条件（满足任一即可）：
1. 添加或修改后端 HTTP API
2. 添加或修改 RPC / GraphQL 接口
3. 前端、移动或其他服务需要调用这些 API
4. CLI 工具涉及远程 API 调用
5. 桌面应用与后端有网络通信
6. 设计文档或规格说明提及接口细节

Database Schema 触发条件（严格限制）：
- 当且仅当 change 涉及数据库或 SQL
```
Source: `marketplace/skills/furina-plan/instructions/schema.md`:14-25

**可能的输出文件**:
| 输出文件 | 说明 |
|----------|------|
| `furina/changes/<name>/api.yaml` | Swagger 2.0 API 规范文件 |
| `furina/changes/<name>/database.md` | 数据库设计文档 |

**Usage Example**:
```markdown
# 场景 1：change 涉及用户登录 API + 用户表
# → 生成 api.yaml（登录端点定义）+ database.md（users 表设计）

# 场景 2：change 仅涉及前端 UI 组件重构
# → 不生成任何 Schema 文档

# 场景 3：change 涉及数据库迁移但无 API 变更
# → 仅生成 database.md
```

---

### `Plan Instruction -- 实施计划生成`

**Source**: `marketplace/skills/furina-plan/instructions/plan.md`:1-152

**Functionality**: Plan Instruction 是规划阶段的第二个子指令，负责将 Propose 阶段的需求文档分解为结构化的、可独立追踪的 Feature 列表（`plan.json`）。这是 furina-plan 技能的核心产出，直接驱动下游 SDD 阶段的执行。每个 Feature 描述"做什么"（WHAT），而非"怎么做"（HOW），实现细节留给执行阶段的 Agent。

**Core Logic**:

该指令的执行流程分为四个阶段：

**阶段 1 -- 收集 Furina Artifacts**：
读取 `furina/changes/<name>/` 下的所有产物作为规划上下文：
- `specs/**/*.md` -- 需求规格说明
- `proposal.md` -- 提案文档
- `design.md` -- 设计文档
- `api.yaml` -- API Schema（Schema 阶段生成，可能不存在）
- `database.md` -- Database Schema（Schema 阶段生成，可能不存在）

所有规划决策必须引用这些文档的具体章节/语句。

**阶段 2 -- 任务分解大纲**：
在写入 plan.json 之前，先基于 Artifacts 将实现工作分解为任务列表大纲。此大纲**不会写入任何文件**，仅用于内部规划。大纲模板：
```
## 1. <任务组名称>
1.1 <任务描述>
1.2 <任务描述>
```

**阶段 3 -- 生成 plan.json**：
按照 JSON Schema 模板、Feature 粒度规则、依赖排序规则和 RED LAW 生成 plan.json。此阶段包含三个关键设计决策：

**Feature 粒度控制**（`marketplace/skills/furina-plan/instructions/plan.md`:49-63）：
- 每个 Feature 必须是独立可测试的工作单元
- 单个 Feature 估算代码增量在 30-500 行（不含空行和注释）
- 过大的 Spec：拆分为多个 plan（每个子系统一个 plan）
- 过小的 Spec：合并相关 Spec 形成有意义的 Feature 单元
- RED LAW：plan.json 中 Feature 数量 <= `feature factor` × spec 文件数量（最少 1 个）

**文件结构规划**（`marketplace/skills/furina-plan/instructions/plan.md`:67-75）：
- 定义哪些文件将被创建或修改及各自的职责
- 单个文件新增/修改代码不超过 300 行
- 优先小而聚焦的文件
- 共同变更的文件应放在一起
- 遵循现有代码库模式

**依赖拓扑排序**（`marketplace/skills/furina-plan/instructions/plan.md`:79-86）：
- Features 必须按拓扑排序顺序排列
- 无依赖的 Feature 排在最前
- 每个 Feature 的所有依赖必须出现在它之前
- 确保消费者可以顺序处理 Features 而无需重新排序

**阶段 4 -- 自审**（`marketplace/skills/furina-plan/instructions/plan.md`:132-139）：
四维质量检查，发现问题则就地修复：
1. **Spec 覆盖率**：逐节扫描 Specs 和 Design，确保每个需求都有对应的 Feature
2. **依赖合法性**：所有 dependency ID 必须作为其他 Feature 的 id 存在，无循环依赖
3. **文件路径一致性**：跨 Feature 的文件引用必须对齐（如 Feature A 创建的模块，Feature B 引用的路径必须匹配）
4. **验收标准质量**：每条标准必须可客观验证，不允许模糊表述（如"正常工作"）

**Core Code -- Feature Factor 与 RED LAW**:
```markdown
## Feature Factor

Feature budget multiplier (**default 0.5**), controls the MAXIMUM number of features
in the generated plan. This factor has a maximum value of 3.

Query the `feature factor` using the following script:

```bash
furina config show experimental.factor
```
```
Source: `marketplace/skills/furina-plan/instructions/plan.md`:6-14

**Core Code -- plan.json JSON Schema**:
```json
[
  {
    "id": "auth-001",
    "category": "authentication",
    "function": "user-login",
    "description": "Implement email/password login. Validate credentials against database, return JWT token on success.",
    "acceptance_criteria": [
      "Valid email+password returns 200 with JWT token",
      "Wrong password returns 401 Unauthorized",
      "Non-existent email returns 401 (must not reveal whether user exists)"
    ],
    "tasks": [
      "1.1 Create new module structure",
      "1.2 Add dependency to package.json"
    ],
    "files": ["src/auth/login.ts", "src/auth/login.test.ts"],
    "dependencies": [],
    "spec_refs": [
      "furina/changes/<name>/specs/auth/spec.md#login",
      "furina/changes/<name>/design.md#auth"
    ],
    "status": "pending"
  }
]
```
Source: `marketplace/skills/furina-plan/instructions/plan.md`:90-114

**Usage Example**:
```markdown
# 输入：一个包含用户认证需求的 change
# furina/changes/user-auth/
#   proposal.md  -- "为系统添加邮箱密码登录功能"
#   design.md    -- "JWT 认证方案，bcrypt 密码哈希"
#   specs/
#     auth.md    -- 登录/注册/密码重置需求
#     session.md -- 会话管理需求

# 输出 plan.json（简化示例）：
# [
#   { id: "auth-001", category: "auth", function: "user-login", ... },
#   { id: "auth-002", category: "auth", function: "user-register", dependencies: ["auth-001"], ... },
#   { id: "auth-003", category: "auth", function: "password-reset", dependencies: ["auth-001"], ... }
# ]
# Feature 数量: 3 <= 0.5 × 2(spec 文件数) → 触发 RED LAW 上限，需合并或调整
```

---

### `template-api.md -- Swagger 2.0 API 规范模板`

**Source**: `marketplace/skills/furina-plan/references/template-api.md`:1-289

**Functionality**: 提供 Swagger 2.0 格式的 API 规范模板，供 Schema Instruction 在判断需要生成 API Schema 时使用。模板包含了完整的 Swagger 2.0 结构骨架，包括全局配置（info/host/schemes）、安全定义（BearerAuth）、可复用参数（Page/PageSize）、通用响应（Unauthorized/Forbidden/NotFound/InternalError）、数据模型定义（ErrorResponse/Pagination）和示例端点（/health、/users CRUD 的注释示例）。

**模板结构**:
| 区块 | 说明 |
|------|------|
| `info` | API 标题、版本、描述 |
| `host / basePath / schemes` | 服务地址配置 |
| `securityDefinitions` | BearerAuth（API Key 方式）和 OAuth2（注释示例） |
| `parameters` | 可复用查询参数：Page、PageSize |
| `responses` | 可复用通用响应：Unauthorized、Forbidden、NotFound、InternalError |
| `definitions` | 数据模型：ErrorResponse（code/message/data）、Pagination（total/page/page_size）+ 领域模型占位 |
| `paths` | API 端点定义：/health 示例 + /users CRUD 注释示例 |

**Core Code -- 模板骨架**:
```yaml
swagger: "2.0"
info:
  title: "[Product Name] API"
  version: "1.0.0"
  description: |
    [Brief description of what this API provides.]

host: "api.example.com"
basePath: "/v1"
schemes:
  - https

consumes:
  - application/json
produces:
  - application/json
```
Source: `marketplace/skills/furina-plan/references/template-api.md`:6-23

**Usage Example**:
```yaml
# 生成的实际 api.yaml 示例（用户认证 API）：
swagger: "2.0"
info:
  title: "User Auth API"
  version: "1.0.0"
  description: "用户认证服务 API，提供登录、注册、密码重置功能"

paths:
  /auth/login:
    post:
      tags: [Auth]
      summary: "用户登录"
      parameters:
        - in: body
          name: body
          required: true
          schema:
            type: object
            required: [email, password]
            properties:
              email: { type: string, format: email }
              password: { type: string }
      responses:
        200:
          description: "登录成功，返回 JWT token"
          schema:
            type: object
            properties:
              token: { type: string }
        401:
          $ref: "#/responses/Unauthorized"
```
说明：实际生成时根据 design.md 和 specs/ 中的接口需求填充 paths 和 definitions。

---

### `template-database.md -- 数据库设计文档模板`

**Source**: `marketplace/skills/furina-plan/references/template-database.md`:1-82

**Functionality**: 提供关系型数据库设计文档模板，供 Schema Instruction 在判断需要生成 Database Schema 时使用。模板包含完整的数据库设计结构：文档信息、数据库选型理由、Schema 关系图、表定义（含列/索引/外键/示例 SQL）、关系描述、数据完整性规则、迁移策略、备份恢复和性能考量。

**模板结构**:
| 区块 | 说明 |
|------|------|
| Document Information | 版本、更新日期、数据库类型 |
| Database Overview | 选型理由 + Schema 关系图 |
| Table Definitions | 每张表的列定义、索引、外键、示例 SQL |
| Relationships | 表间关系描述（一对多等） |
| Data Integrity Rules | 数据库层面的业务规则 |
| Migration Strategy | Schema 变更管理策略 |
| Backup and Recovery | 备份频率、保留策略 |
| Performance Considerations | 查询优化、缓存策略 |

**Core Code -- 表定义模板**:
```markdown
### Table: `[table_name]`

**Purpose**: [What this table stores]

**Columns:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| name | VARCHAR(255) | NOT NULL | User's name |
| email | VARCHAR(255) | UNIQUE, NOT NULL | User's email |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Indexes:**
- `idx_email` on `email` - For fast email lookups

**Foreign Keys:**
- `user_id` REFERENCES `users(id)` ON DELETE CASCADE

**Example SQL:**
```sql
CREATE TABLE table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  ...
);
```
```
Source: `marketplace/skills/furina-plan/references/template-database.md`:24-58

**Usage Example**:
```markdown
# 生成的实际 database.md 示例（用户认证数据库设计）：

## 1. Database Overview
- Database Type: PostgreSQL
- Schema Diagram:
  users (1) ---> (N) sessions

## 2. Table Definitions

### Table: `users`
| Column     | Type         | Constraints              | Description |
|------------|--------------|--------------------------|-------------|
| id         | UUID         | PRIMARY KEY              | 用户唯一标识 |
| email      | VARCHAR(255) | UNIQUE, NOT NULL         | 用户邮箱    |
| password   | VARCHAR(255) | NOT NULL                 | bcrypt 哈希值|
| created_at | TIMESTAMP    | DEFAULT NOW()            | 创建时间    |

### Table: `sessions`
| Column     | Type         | Constraints              | Description |
|------------|--------------|--------------------------|-------------|
| id         | UUID         | PRIMARY KEY              | 会话唯一标识 |
| user_id    | UUID         | FK -> users(id)          | 关联用户    |
| token      | VARCHAR(512) | UNIQUE, NOT NULL         | JWT token   |
| expires_at | TIMESTAMP    | NOT NULL                 | 过期时间    |
```

## Data Structures

### `plan.json Feature 对象`
```json
{
  "id": "string",
  "category": "string",
  "function": "string",
  "description": "string",
  "acceptance_criteria": ["string"],
  "tasks": ["string"],
  "files": ["string"],
  "dependencies": ["string"],
  "spec_refs": ["string"],
  "status": "pending | in_progress | done | skipped | blocked"
}
```
- `id` (`string`, 必填): Feature 唯一标识符，格式为 `{category-prefix}-{number}`（如 `auth-01`、`db-03`），用于依赖引用。
- `category` (`string`, 必填): Feature 所属模块或子系统（如 `auth`、`database`、`frontend`）。
- `function` (`string`, 必填): Feature 的简洁具体名称（如 `User Login`、`Export Report`）。
- `description` (`string`, 必填): 实现描述 -- 提供足够的上下文让 Agent 做出合理的实现决策。**不得包含代码**，聚焦于目的、范围和关键行为。
- `acceptance_criteria` (`string[]`, 必填): 验收标准列表，每条标准必须可客观验证。用于 spec reviewer 验证实现。
- `tasks` (`string[]`, 必填): 具体任务列表，每个任务应可操作且可测试。
- `files` (`string[]`, 必填): 该 Feature 将创建或修改的具体文件路径。使用项目根目录的相对路径，**不得使用通配符**。
- `dependencies` (`string[]`, 必填): 依赖的 Feature ID 列表，必须在此 Feature 之前完成。无依赖时使用空数组 `[]`。
- `spec_refs` (`string[]`, 必填): 上游规格说明文档的引用路径，指向 `specs/` 下的文档或其他产物（`design.md`、`api.yaml`、`database.md`）。
- `status` (`string`, 必填): 当前状态，默认 `pending`。可选值：`pending`（待开始）、`in_progress`（进行中）、`done`（已完成）、`skipped`（已跳过）、`blocked`（被阻塞）。

### `Feature Factor 配置`
- 查询方式：`furina config show experimental.factor`
- 默认值：`0.5`
- 最大值：`3`
- 用途：控制 plan.json 中 Feature 数量的最大值，公式为 `feature factor × spec 文件数量`（最少 1 个 Feature）

### `Language 配置`
- 查询方式：`furina config show language`
- 默认值：`Chinese`（脚本返回空或失败时回退到中文）
- 用途：确定技能所有用户面向输出的语言

## Error Handling and Edge Cases

### 缺失上游产物
- **场景**：Schema Instruction 读取 `furina/changes/<name>/` 时发现 proposal.md、design.md 或 specs/ 缺失。
- **处理**：立即停止执行，提示用户先运行 `furina-propose` 生成必要的上游产物。
- **依据**：`instructions/schema.md`:7 -- "If any missing, stop and ask user to run `furina-propose` first."

### 过大的 Spec 粒度
- **场景**：某个 Spec 覆盖了多个独立子系统，导致单个 Feature 过大。
- **处理**：将 Spec 拆分为多个 plan（每个子系统一个 plan），同时拆分对应的 spec 文档。每个 plan 应独立交付可工作的、可测试的软件。
- **依据**：`instructions/plan.md`:53

### 过小的 Spec 粒度
- **场景**：Spec 粒度太小，导致 plan 包含过多 Feature 或不合理。
- **处理**：合并相关 Spec，形成更有意义的、自包含的 Feature 单元。
- **依据**：`instructions/plan.md`:54

### RED LAW 违规 -- Feature 数量超限
- **场景**：生成的 Feature 数量超过 `feature factor × spec 文件数量`。
- **处理**：必须合并或调整 Feature 粒度，确保不超过上限。最少保留 1 个 Feature。
- **依据**：`instructions/plan.md`:62

### RED LAW 违规 -- 代码增量超限
- **场景**：单个 Feature 估算代码增量超出 30-500 行范围。
- **处理**：过大的 Feature 需要拆分；过小的 Feature 需要合并。
- **依据**：`instructions/plan.md`:63

### 不需要生成任何 Schema
- **场景**：当前 change 不涉及任何 API 或数据库操作（如纯前端 UI 重构）。
- **处理**：Schema Instruction 正常执行，但判断不需要生成任何 Schema 文档，直接跳到 Plan Instruction。
- **依据**：`instructions/schema.md`:36 -- "do NOT force generation"

### 循环依赖检测
- **场景**：自审阶段发现 Feature 之间存在循环依赖。
- **处理**：自审阶段的依赖合法性检查会发现此问题，就地修复（重新设计依赖关系）。
- **依据**：`instructions/plan.md`:135

## Dependencies

**Depends on**:
- **furina-propose 技能**：上游技能，提供 proposal.md、design.md、specs/ 产物。如果缺失，Schema Instruction 会终止。
- **furina config 系统**：查询 `language`（输出语言）和 `experimental.factor`（Feature 数量上限）配置。
- **template-api.md / template-database.md**：Schema Instruction 使用的参考模板。

**Depended by**:
- **furina-review 技能**：Plan Review 指令会读取 `plan.json` 进行质量审查，检查 Spec 覆盖率、依赖合法性和 Feature 粒度。
- **furina-sdd 技能**：SDD 技能读取 `plan.json` 作为执行契约，逐个获取 `pending` 状态的 Feature 进行 TDD 实现，完成后更新状态为 `done`。
- **furina:workflow 工作流**：工作流编排器在 Propose 阶段完成后自动触发 Plan 阶段。

## Usage Examples

### 完整使用场景：为用户认证 Change 生成计划

```markdown
# 前提：已通过 furina-propose 生成了以下产物
# furina/changes/user-auth/
#   proposal.md  -- "为系统添加邮箱密码登录功能"
#   design.md    -- "JWT 认证方案，bcrypt 密码哈希，PostgreSQL 用户表"
#   specs/
#     auth.md    -- 登录/注册/密码重置需求规格
#     session.md -- 会话管理需求规格

# Step 1: Schema Instruction 执行
# - 读取 proposal.md, design.md, specs/
# - 诊断：design.md 提及"HTTP API"且涉及"PostgreSQL" → 需要生成 API 和 Database Schema
# - 读取 template-api.md，生成 api.yaml（登录、注册、密码重置端点）
# - 读取 template-database.md，生成 database.md（users 表、sessions 表设计）

# Step 2: Plan Instruction 执行
# - 读取所有产物（包括刚生成的 api.yaml 和 database.md）
# - 任务分解大纲（内部）：
#   ## 1. 数据库层
#   1.1 创建 users 表迁移
#   1.2 创建 sessions 表迁移
#   ## 2. 认证服务
#   2.1 实现密码哈希工具
#   2.2 实现用户注册逻辑
#   2.3 实现登录 + JWT 生成
#   ## 3. API 端点
#   3.1 注册端点
#   3.2 登录端点
#   3.3 密码重置端点

# - 生成 plan.json（feature factor = 0.5, spec 文件数 = 2, 最多 1 个 Feature → 合并）
#   → 实际可能生成 2-3 个 Feature（根据实际粒度调整）

# - 自审：检查 Spec 覆盖率、依赖合法性、文件路径、验收标准

# Step 3: 输出
# furina/changes/user-auth/plan.json    ← 实施计划
# furina/changes/user-auth/api.yaml     ← API 规范
# furina/changes/user-auth/database.md  ← 数据库设计
```

### plan.json 输出示例

```json
[
  {
    "id": "auth-01",
    "category": "auth",
    "function": "database-schema",
    "description": "Create database schema for user authentication: users table with email/password fields, sessions table for JWT token tracking. Include migration files and database connection setup.",
    "acceptance_criteria": [
      "users table created with id, email, password, created_at, updated_at columns",
      "sessions table created with id, user_id (FK), token, expires_at columns",
      "Migration runs successfully on fresh database",
      "Indexes created on users.email and sessions.token"
    ],
    "tasks": [
      "1.1 Create migration file for users table",
      "1.2 Create migration file for sessions table",
      "1.3 Add database connection configuration"
    ],
    "files": [
      "src/db/migrations/001_create_users.ts",
      "src/db/migrations/002_create_sessions.ts",
      "src/db/connection.ts"
    ],
    "dependencies": [],
    "spec_refs": [
      "furina/changes/user-auth/specs/auth.md",
      "furina/changes/user-auth/database.md"
    ],
    "status": "pending"
  },
  {
    "id": "auth-02",
    "category": "auth",
    "function": "user-login",
    "description": "Implement email/password login: validate credentials against database using bcrypt comparison, generate JWT token on success, return 401 on failure. Follow the API spec in api.yaml.",
    "acceptance_criteria": [
      "Valid email+password returns 200 with JWT token in response body",
      "Wrong password returns 401 Unauthorized",
      "Non-existent email returns 401 (must not reveal whether user exists)",
      "Password comparison uses bcrypt with proper salt rounds"
    ],
    "tasks": [
      "2.1 Implement password hashing utility (bcrypt wrapper)",
      "2.2 Implement login service (credential validation + JWT generation)",
      "2.3 Implement POST /auth/login endpoint"
    ],
    "files": [
      "src/auth/password.ts",
      "src/auth/login.service.ts",
      "src/auth/login.controller.ts",
      "src/auth/login.test.ts"
    ],
    "dependencies": ["auth-01"],
    "spec_refs": [
      "furina/changes/user-auth/specs/auth.md#login",
      "furina/changes/user-auth/api.yaml#/auth/login",
      "furina/changes/user-auth/design.md#authentication"
    ],
    "status": "pending"
  }
]
```
说明：Feature `auth-01` 无依赖（数据库层），`auth-02` 依赖 `auth-01`（服务层依赖数据层）。每个 Feature 都有明确的验收标准、任务列表和文件路径，确保 SDD 阶段的 SubAgent 可以独立执行。
