# Project Groups Schema Validation

> Source files:
> - `src/server/memory/project-group-schema.ts` : 1-61

## Overview

本 spec 覆盖 `project-group-schema.ts` 模块，提供对 `project-groups.json` 文件的 Zod schema 定义与运行时验证功能。

**在系统中的定位**：该模块是 Memory Scheduler 子系统（memory-subsystem）的一部分，作为数据质量守门层存在。当 background-grouper agent 生成 `project-groups.json` 后，scheduler 调用本模块的 `validateProjectGroupsFile()` 对其进行严格校验，校验失败则拒绝接受输出并删除无效文件，防止畸形数据污染下游消费方。

**设计动机**：grouper agent 以 LLM 生成 JSON 输出，天然存在格式不确定性（多余字段、类型错误、缺省值等）。通过 Zod schema 的 `.strict()` 模式，可以精确拒绝任何不符合契约的输出，同时为 TypeScript 端提供类型推导（`z.infer`），消除手动类型维护。

**使用场景**：
- `scheduler.ts` 的 `syncProjectGroup()` 流程中，grouper agent 执行完毕后立即调用 `validateProjectGroupsFile()` 校验产物
- 校验失败时 scheduler 记录错误日志并删除无效文件
- 校验成功后数据进入下游消费流程

**涉及源文件及职责**：
- `src/server/memory/project-group-schema.ts`：定义 Zod schema、导出类型、提供文件级验证函数

## Architecture / Flow

验证流程为三阶段顺序处理：

```
文件路径 → fs.readFileSync (读取文件)
         → JSON.parse (解析 JSON)
         → ProjectGroupsSchema.safeParse (Zod schema 校验)
         → 返回 { ok: true, data } 或 { ok: false, error }
```

每个阶段独立 try-catch，错误信息携带文件路径上下文，便于调试定位。

## Functionality / Interface Details

### `ProjectGroupEntrySchema`

**Source**: `src/server/memory/project-group-schema.ts`:8-15

**Functionality**: 定义单个项目群条目的数据结构 schema。这是 `project-groups.json` 中 `groups` 数组内每个元素的校验规则。使用 `.strict()` 模式拒绝任何未声明的额外字段（如 LLM 可能幻觉生成的 `similarityDimensions` 等），确保数据契约的严格性。

**字段约束**：
- `projectGroup` (`string`): 项目群名称，必须非空（`.min(1)`）
- `projectDesc` (`string`): 项目群描述，允许空字符串
- `projectPortrait` (`string`): 项目群画像描述，必须非空（`.min(1)`）
- `members` (`string[]`): 成员设计文档文件名列表，元素为字符串
- `tags` (`string[]`): 标签列表，元素为字符串
- `status` (`'active' | 'proposed' | 'deprecated'`): 状态枚举，默认值 `'active'`

**Core Code**:
```typescript
const ProjectGroupEntrySchema = z.object({
  projectGroup: z.string().min(1),
  projectDesc: z.string(),
  projectPortrait: z.string().min(1),
  members: z.array(z.string()),
  tags: z.array(z.string()),
  status: z.enum(['active', 'proposed', 'deprecated']).default('active'),
}).strict();
```
Source: `src/server/memory/project-group-schema.ts`:8-15

---

### `ProjectGroupsSchema`

**Source**: `src/server/memory/project-group-schema.ts`:17-21

**Functionality**: 定义完整的 `project-groups.json` 文件顶层结构 schema。同样使用 `.strict()` 模式，防止顶层出现如 `generatedAt` 等未声明字段。

**字段约束**：
- `version` (`string`): 数据格式版本号
- `lastUpdated` (`string`): 最后更新时间戳字符串
- `groups` (`ProjectGroupEntry[]`): 项目群条目数组，每个元素符合 `ProjectGroupEntrySchema`

**Core Code**:
```typescript
export const ProjectGroupsSchema = z.object({
  version: z.string(),
  lastUpdated: z.string(),
  groups: z.array(ProjectGroupEntrySchema),
}).strict();
```
Source: `src/server/memory/project-group-schema.ts`:17-21

---

### `validateProjectGroupsFile(filePath: string) -> { ok: true; data: ProjectGroups } | { ok: false; error: string }`

**Source**: `src/server/memory/project-group-schema.ts`:30-60

**Functionality**: 从磁盘读取指定路径的 JSON 文件，完成三层验证（文件读取 → JSON 解析 → schema 校验），返回 Discriminated Union 结果。该函数将文件 I/O、JSON 解析和 schema 校验统一为单次调用，避免调用方处理多种异常路径。返回值使用 `ok` 字段作为判别器，TypeScript 可通过 narrowing 自动推导 `data` 或 `error` 类型。

**Parameters**:
- `filePath` (`string`): 要验证的 `project-groups.json` 文件的绝对路径

**Return Value**:
- 成功时返回 `{ ok: true, data: ProjectGroups }`：`data` 为经过 Zod 解析后的类型安全对象
- 失败时返回 `{ ok: false, error: string }`：`error` 包含带文件路径上下文的详细错误信息

**Core Logic**:

函数内部按三个独立阶段处理，每个阶段有独立的错误捕获：

1. **文件读取阶段**：`fs.readFileSync(filePath, 'utf-8')` 读取文件内容。若文件不存在或无权限，捕获异常并返回包含文件路径的错误信息。
2. **JSON 解析阶段**：`JSON.parse(raw)` 将原始文本解析为 JavaScript 对象。若 JSON 格式非法（如缺少引号、尾部逗号等），捕获语法错误并返回包含文件路径的错误信息。
3. **Schema 校验阶段**：`ProjectGroupsSchema.safeParse(parsed)` 执行 Zod 验证。若校验失败，将所有 issue 的 `path`（字段路径）和 `message`（错误描述）格式化为多行列表，每行以 `  - ` 前缀标注。空 path 显示为 `<root>`。

**Core Code**:
```typescript
export function validateProjectGroupsFile(filePath: string):
  | { ok: true; data: ProjectGroups }
  | { ok: false; error: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to read ${filePath}: ${msg}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid JSON in ${filePath}: ${msg}` };
  }

  const result = ProjectGroupsSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `Schema validation failed:\n${result.error.issues
        .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('\n')}`,
    };
  }

  return { ok: true, data: result.data };
}
```
Source: `src/server/memory/project-group-schema.ts`:30-60

**Usage Example**:
```typescript
import { validateProjectGroupsFile } from './project-group-schema.js';

const result = validateProjectGroupsFile('/home/user/.furina/memory/Project_Group/project-groups.json');
if (result.ok) {
  console.log(`共 ${result.data.groups.length} 个项目群，版本 ${result.data.version}`);
  for (const group of result.data.groups) {
    console.log(`- ${group.projectGroup} [${group.status}]: ${group.members.length} 个成员`);
  }
} else {
  console.error('校验失败:', result.error);
}
```
Explanation: 调用 `validateProjectGroupsFile()` 并通过 `ok` 字段区分成功/失败路径。成功时可安全访问 `result.data` 的完整类型化字段，失败时打印包含字段路径的详细错误信息。

## Data Structures

### `ProjectGroupEntry`
```typescript
type ProjectGroupEntry = {
  projectGroup: string;       // 项目群名称（非空）
  projectDesc: string;        // 项目群描述
  projectPortrait: string;    // 项目群画像（非空）
  members: string[];          // 成员设计文档文件名列表
  tags: string[];             // 标签列表
  status: 'active' | 'proposed' | 'deprecated'; // 状态，默认 'active'
}
```
- `projectGroup`: 项目群的唯一标识名称，由 grouper agent 生成，不可为空字符串
- `projectDesc`: 对项目群的概括性描述，允许为空字符串
- `projectPortrait`: 项目群的详细画像描述（如技术栈、架构、覆盖范围等），不可为空
- `members`: 属于该项目群的设计文档文件名数组（如 `['订单服务重构设计.md']`）
- `tags`: 用于分类的标签数组（如 `['交易', '核心域']`）
- `status`: 项目群生命周期状态，省略时默认为 `active`

由 `z.infer<typeof ProjectGroupEntrySchema>` 自动推导，Source: `src/server/memory/project-group-schema.ts`:23

### `ProjectGroups`
```typescript
type ProjectGroups = {
  version: string;            // 数据格式版本号
  lastUpdated: string;        // 最后更新时间戳
  groups: ProjectGroupEntry[];// 项目群条目数组
}
```
- `version`: 标识 project-groups.json 数据格式版本
- `lastUpdated`: ISO 8601 格式的最后更新时间
- `groups`: 包含所有项目群条目的数组

由 `z.infer<typeof ProjectGroupsSchema>` 自动推导，Source: `src/server/memory/project-group-schema.ts`:24

### Status 枚举

| 值 | 含义 |
|---|---|
| `active` | 活跃状态（默认值，省略 status 字段时自动填充） |
| `proposed` | 提议中，尚未确认 |
| `deprecated` | 已废弃 |

## Error Handling and Edge Cases

**三层错误捕获策略**：

| 阶段 | 可能错误 | 错误信息格式 |
|---|---|---|
| 文件读取 | 文件不存在、无读取权限 | `Failed to read {filePath}: {message}` |
| JSON 解析 | JSON 语法错误、非法字符 | `Invalid JSON in {filePath}: {message}` |
| Schema 校验 | 字段缺失、类型错误、多余字段 | `Schema validation failed:\n  - {path}: {message}` |

**Edge Cases**：
- **LLM 幻觉字段**：`.strict()` 确保 grouper agent 输出中任何 schema 未声明的字段（如 `similarityDimensions`、`generatedAt`）都会被拒绝
- **status 字段省略**：Zod `.default('active')` 自动填充，无需 grouper agent 必须输出该字段
- **空字符串校验**：`projectGroup` 和 `projectPortrait` 通过 `.min(1)` 拒绝空字符串，而 `projectDesc` 允许空字符串（描述可能确实为空）
- **members/tags 类型错误**：若 LLM 将 members 生成为对象数组而非字符串数组，`z.array(z.string())` 会拒绝
- **异常类型**：catch 块中使用 `instanceof Error` 检查确保安全提取 message，兼容非 Error 抛出场景

## Dependencies

- **Depends on**:
  - `zod`（第三方库）：提供 schema 定义、解析、类型推导能力
  - `fs`（Node.js 内置）：提供 `readFileSync` 文件读取
- **Depended by**:
  - `src/server/memory/scheduler.ts`：`syncProjectGroup()` 流程中调用 `validateProjectGroupsFile()` 校验 grouper agent 产物，校验失败则拒绝输出并删除无效文件

## Usage Examples

### 在 Scheduler 中的典型使用

```typescript
import { validateProjectGroupsFile } from './project-group-schema.js';
import path from 'path';

// grouper agent 执行完毕后，校验其产物
const groupsJsonPath = path.join(projectGroupDir, 'project-groups.json');
const validation = validateProjectGroupsFile(groupsJsonPath);

if (!validation.ok) {
  // 校验失败：记录错误日志，删除无效文件
  appendLog(`project-groups.json validation FAILED — rejecting output:\n${validation.error}`);
  fs.rmSync(groupsJsonPath);
  return;
}

// 校验成功：安全使用类型化的数据
const { version, lastUpdated, groups } = validation.data;
appendLog(`Validated project-groups.json: ${groups.length} groups, version ${version}`);
```

Explanation: 这是 `scheduler.ts` 中 `syncProjectGroup()` 的实际调用模式。首先调用验证函数，失败时记录详细错误（包含每个不合规字段的路径和原因）并删除文件防止污染后续流程。成功时通过解构获取类型安全的数据对象。

### 直接使用 Schema 进行数据校验

```typescript
import { ProjectGroupsSchema } from './project-group-schema.js';

// 校验内存中的数据对象（无需文件 I/O）
const raw = {
  version: '1.0.0',
  lastUpdated: '2026-06-21T00:00:00Z',
  groups: [
    {
      projectGroup: '订单履约项目群',
      projectDesc: '覆盖从下单到履约的全链路',
      projectPortrait: '面向交易中台团队...',
      members: ['订单服务重构设计.md', '履约调度引擎设计.md'],
      tags: ['交易', '核心域'],
      // status 省略，将默认为 'active'
    },
  ],
};

const result = ProjectGroupsSchema.safeParse(raw);
if (result.success) {
  console.log(result.data.groups[0].status); // 'active'（default 填充）
}
```

Explanation: 直接使用导出的 `ProjectGroupsSchema` 进行内存中对象的校验。当不需要文件 I/O 时（如测试场景或从网络接收数据），可以直接调用 `safeParse()` 或 `parse()`。
