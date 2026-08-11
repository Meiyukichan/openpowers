# Configuration Zod Schemas

> Source files:
> - `src/utils/config.ts` : 14-116

## Overview

本 spec 覆盖 Furina 配置树的全部 Zod schema 定义，是整个配置子系统的**类型与验证单一真相源**。所有 schema 定义在 `src/utils/config.ts` 的第 14-116 行，形成一棵从叶子节点到根节点的完整配置树。

**在系统中的角色与定位：**
- 为 Furina 的全局配置提供结构化的类型约束、运行时验证和 TypeScript 类型推导
- 作为 `loadConfig` 加载和验证配置数据的基准；`safeParse` 失败时会摘除无效叶子节点，保证系统始终能返回可消费的配置对象
- 作为 `config` 命令（show/mode/set）的类型基础，所有命令对配置字段的读写都依赖于此处推导出的 `FurinaConfig` 类型
- 作为 `MODE_PRESETS` 常量的类型约束（`DeepPartial<FurinaConfig>`），确保模式预设只覆盖合法字段

**设计动机：**
- 使用 Zod 而非纯 TypeScript 接口定义配置结构，使得同一份 schema 同时承担**结构定义**、**类型推导**、**运行时验证**三重职责，消除了手写接口与运行时校验之间的不一致风险
- 根 schema 使用 `.loose()` 修饰符，允许项目级覆盖配置携带额外字段而不触发验证失败，保证可扩展性

**涉及的源文件及职责：**
- `src/utils/config.ts`（第 14-116 行）：全部 Zod schema 定义、`FurinaConfig` 推导类型、`DeepPartial` 工具类型

**配置树层级结构：**
```
FurinaConfigSchema (root, .loose())
├── language: string
├── switchProviders: ProviderSwitchSchema
├── project: ProjectSchema
│   ├── sourcecode: string
│   └── codebase: CodebaseSchema
│       ├── enable: boolean
│       └── path: string
├── exploration: ExplorationSchema
│   ├── codebase: ExplorationItemSchema[]
│   ├── repository: ExplorationItemSchema[]
│   ├── reference: ExplorationItemSchema[]
│   └── specification: ExplorationItemSchema[]
├── experimental: ExperimentalSchema
│   ├── explore: boolean
│   ├── websearch: boolean
│   ├── context7: boolean
│   ├── review: ReviewSchema
│   ├── prompt: PromptSchema
│   ├── coverage: string
│   ├── budget: boolean
│   └── factor: number
└── enhancement?: EnhancementSchema (optional)
    ├── context: unknown | null
    ├── rules: EnhancementRulesSchema
    └── memory?: MemorySchema (optional)
```

## Architecture / Flow

本 spec 不涉及运行时流程，而是定义配置的**静态数据结构**。以下是 schema 的组合关系说明：

```
叶子 schema（不可再分）          组合 schema                 根 schema
─────────────────────          ─────────────               ─────────────
CodebaseSchema                ProjectSchema               FurinaConfigSchema
ExplorationItemSchema         ExplorationSchema            (含 .loose() 修饰符)
ProviderSwitchSchema          ReviewSchema
                              PromptSchema
                              ExperimentalSchema
                              EnhancementRulesSchema
                              MemorySchema
                              EnhancementSchema
```

组合关系链路：
1. `CodebaseSchema` 被 `ProjectSchema` 内嵌
2. `ExplorationItemSchema` 被 `ExplorationSchema` 以数组形式内嵌
3. `ReviewSchema` 和 `PromptSchema` 被 `ExperimentalSchema` 内嵌
4. `EnhancementRulesSchema` 和 `MemorySchema` 被 `EnhancementSchema` 内嵌
5. 所有一级 schema 最终被根 `FurinaConfigSchema` 组合

**类型推导链路：**
`FurinaConfigSchema`（Zod schema）→ `z.infer<>` → `FurinaConfig`（TS 类型）→ `DeepPartial<>` → 模式预设的不完整配置类型

## Functionality / Interface Details

### `ProviderSwitchSchema`

**Source**: `src/utils/config.ts`:18-26

**功能描述**: 定义各工作流阶段对应的 AI provider 名称映射。Furina 支持为不同的工作流阶段（workflow、explore、propose、plan、review、coding、finalize）分别指定不同的 AI provider。该 schema 确保所有七个阶段字段均为必填字符串。

**字段说明**:
- `workflow` (`string`): 全局工作流阶段使用的 provider 名称
- `explore` (`string`): 探索阶段使用的 provider 名称
- `propose` (`string`): 提案阶段使用的 provider 名称
- `plan` (`string`): 计划阶段使用的 provider 名称
- `review` (`string`): 审查阶段使用的 provider 名称
- `coding` (`string`): 编码阶段使用的 provider 名称
- `finalize` (`string`): 收尾阶段使用的 provider 名称

**核心代码**:
```typescript
const ProviderSwitchSchema = z.object({
  workflow: z.string(),
  explore: z.string(),
  propose: z.string(),
  plan: z.string(),
  review: z.string(),
  coding: z.string(),
  finalize: z.string(),
});
```
Source: `src/utils/config.ts`:18-26

**使用示例**:
```typescript
// 典型默认值（来自 resources/furina.json）
{
  workflow: "default",
  explore: "default",
  propose: "default",
  plan: "default",
  review: "default",
  coding: "default",
  finalize: "default"
}
```
说明: 所有阶段默认使用 `"default"` provider。用户可通过 `config set switchProviders.coding claude-code` 等命令为特定阶段切换 provider。

---

### `CodebaseSchema`

**Source**: `src/utils/config.ts`:28-31

**功能描述**: 定义项目代码库文档（codebase）的配置。codebase 是 Furina 的代码知识库功能，当启用后，系统会利用 codebase 文档辅助工作流中的各个阶段。

**字段说明**:
- `enable` (`boolean`): 是否启用 codebase 功能
- `path` (`string`): codebase 文档的相对路径

**核心代码**:
```typescript
const CodebaseSchema = z.object({
  enable: z.boolean(),
  path: z.string(),
});
```
Source: `src/utils/config.ts`:28-31

**使用示例**:
```typescript
// 默认值
{ enable: false, path: "docs/codebase" }
```
说明: 默认禁用 codebase 功能。当用户通过 `furina codebase` 命令生成 codebase 文档后，会将 `enable` 设为 `true`。

---

### `ExplorationItemSchema`

**Source**: `src/utils/config.ts`:33-37

**功能描述**: 定义探索阶段中单个探索条目的结构。每个条目描述一个需要在工作流探索阶段被分析的目标路径（可以是目录或文件）。`type` 和 `description` 是可选字段，用于提供额外的上下文信息帮助 AI 理解该探索目标的用途。

**字段说明**:
- `path` (`string`): 探索目标的路径（必填）
- `type` (`string`, optional): 目标类型描述，如 `"directory"`、`"file"` 等
- `description` (`string`, optional): 对该探索目标的文字描述，用于指导 AI 理解其业务含义

**核心代码**:
```typescript
const ExplorationItemSchema = z.object({
  path: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
});
```
Source: `src/utils/config.ts`:33-37

**使用示例**:
```typescript
// 典型探索条目
{
  type: "directory",
  path: "./furina/",
  description: "The location of Furina Artifacts, you shall viewing archived changes and ongoing changes to achieve a global historical reference when starting a new Furina change."
}
```
说明: 探索条目在 `ExplorationSchema` 中按类别（codebase、repository、reference、specification）分组存放，工作流的 explore 阶段会依次分析这些目标。

---

### `ProjectSchema`

**Source**: `src/utils/config.ts`:39-42

**功能描述**: 定义项目级别的配置，包括源码目录和 codebase 子配置。该 schema 组合了 `CodebaseSchema`，将项目源码路径与代码知识库配置关联在一起。

**字段说明**:
- `sourcecode` (`string`): 项目源代码的根目录路径，相对于工作区根目录
- `codebase` (`CodebaseSchema`): 代码库文档配置，包含 `enable` 和 `path` 两个字段

**核心代码**:
```typescript
const ProjectSchema = z.object({
  sourcecode: z.string(),
  codebase: CodebaseSchema,
});
```
Source: `src/utils/config.ts`:39-42

**使用示例**:
```typescript
// 默认值
{
  sourcecode: "./",
  codebase: { enable: false, path: "docs/codebase" }
}
```
说明: `sourcecode` 默认为 `"./"`，表示项目源码在工作区根目录。`codebase` 内嵌了 `CodebaseSchema` 的完整结构。

---

### `ExplorationSchema`

**Source**: `src/utils/config.ts`:44-49

**功能描述**: 定义探索阶段的整体配置，将探索条目按四个类别组织：codebase（代码库文档）、repository（代码仓库）、reference（参考资料）、specification（规格说明）。每个类别都是 `ExplorationItemSchema` 的数组。这种分类设计使得工作流的 explore 阶段可以按类别顺序、有针对性地分析不同类型的探索目标。

**字段说明**:
- `codebase` (`ExplorationItemSchema[]`): 代码库文档类探索目标
- `repository` (`ExplorationItemSchema[]`): 代码仓库类探索目标
- `reference` (`ExplorationItemSchema[]`): 参考资料类探索目标
- `specification` (`ExplorationItemSchema[]`): 规格说明类探索目标

**核心代码**:
```typescript
const ExplorationSchema = z.object({
  codebase: z.array(ExplorationItemSchema),
  repository: z.array(ExplorationItemSchema),
  reference: z.array(ExplorationItemSchema),
  specification: z.array(ExplorationItemSchema),
});
```
Source: `src/utils/config.ts`:44-49

**使用示例**:
```typescript
// 默认值（仅 repository 有预置条目）
{
  codebase: [],
  repository: [
    { type: "directory", path: "./furina/", description: "..." }
  ],
  reference: [],
  specification: []
}
```
说明: 默认配置只在 `repository` 类别中预置了一个条目，指向 `.furina/` 目录（Furina Artifacts 存放位置），用于在新 change 启动时提供历史上下文。

---

### `ReviewSchema`

**Source**: `src/utils/config.ts`:51-58

**功能描述**: 定义各审查环节的开关配置。Furina 在工作流的不同阶段可以执行质量审查，该 schema 控制哪些审查环节是启用状态。六个布尔字段分别对应工作流中的不同审查点。

**字段说明**:
- `propose` (`boolean`): 是否在提案阶段执行审查
- `plan` (`boolean`): 是否在计划阶段执行审查
- `specs` (`boolean`): 是否在规格文档阶段执行审查
- `code` (`boolean`): 是否在代码阶段执行审查
- `acceptance` (`boolean`): 是否执行验收审查
- `furina` (`boolean`): 是否执行 Furina 整体审查

**核心代码**:
```typescript
const ReviewSchema = z.object({
  propose: z.boolean(),
  plan: z.boolean(),
  specs: z.boolean(),
  code: z.boolean(),
  acceptance: z.boolean(),
  furina: z.boolean(),
});
```
Source: `src/utils/config.ts`:51-58

**使用示例**:
```typescript
// 默认值
{
  furina: false,
  propose: false,
  plan: false,
  specs: false,
  code: true,
  acceptance: true
}
```
说明: 默认仅启用 `code` 和 `acceptance` 审查。用户可通过 `config mode max` 启用全部审查，或通过 `config set` 单独控制。

---

### `PromptSchema`

**Source**: `src/utils/config.ts`:60-62

**功能描述**: 定义自定义 prompt 配置。当前仅包含 `reviewCode` 一个字段，用于覆盖代码审查阶段的默认 prompt。该字段为 `nullable`，当为 `null` 时使用系统默认 prompt，当有值时使用自定义 prompt。

**字段说明**:
- `reviewCode` (`string | null`): 代码审查阶段的自定义 prompt 文本。`null` 表示使用默认值

**核心代码**:
```typescript
const PromptSchema = z.object({
  reviewCode: z.string().nullable(),
});
```
Source: `src/utils/config.ts`:60-62

**使用示例**:
```typescript
// 默认值
{ reviewCode: null }
```
说明: 用户可通过 `config set experimental.prompt.reviewCode "..."` 设置自定义的代码审查 prompt。

---

### `ExperimentalSchema`

**Source**: `src/utils/config.ts`:64-73

**功能描述**: 定义实验性功能的配置集合。这是配置树中最复杂的组合 schema 之一，包含探索功能开关、外部工具集成开关、审查配置（内嵌 `ReviewSchema`）、prompt 配置（内嵌 `PromptSchema`）、覆盖率阈值、预算控制和计算因子。"experimental" 命名表明这些功能可能在未来版本中被调整、移除或升级为正式功能。

**字段说明**:
- `explore` (`boolean`): 是否启用探索功能（explore 阶段）
- `websearch` (`boolean`): 是否启用 Web 搜索集成
- `context7` (`boolean`): 是否启用 Context7 工具集成
- `review` (`ReviewSchema`): 审查配置，包含各审查环节的开关
- `prompt` (`PromptSchema`): 自定义 prompt 配置
- `coverage` (`string`): 测试覆盖率阈值（字符串格式，如 `"70%"`）
- `budget` (`boolean`): 是否启用预算控制
- `factor` (`number`): 计算因子，用于预算或资源消耗的倍率调节

**核心代码**:
```typescript
const ExperimentalSchema = z.object({
  explore: z.boolean(),
  websearch: z.boolean(),
  context7: z.boolean(),
  review: ReviewSchema,
  prompt: PromptSchema,
  coverage: z.string(),
  budget: z.boolean(),
  factor: z.number(),
});
```
Source: `src/utils/config.ts`:64-73

**使用示例**:
```typescript
// 默认值
{
  explore: true,
  websearch: true,
  context7: true,
  review: { furina: false, propose: false, plan: false, specs: false, code: true, acceptance: true },
  prompt: { reviewCode: null },
  coverage: "70%",
  budget: true,
  factor: 1
}
```
说明: 该 schema 是模式预设（MODE_PRESETS）的主要操作对象。`lite` 模式会关闭 explore 和大部分 review；`standard` 模式开启 explore 和 code review；`max` 模式开启全部功能。

---

### `EnhancementRulesSchema`

**Source**: `src/utils/config.ts`:75-79

**功能描述**: 定义增强规则的配置结构。增强规则按工作流阶段分为三组：design（设计阶段规则）、specs（规格阶段规则）、implement（实现阶段规则）。每组规则的数组元素类型为 `z.unknown()`，允许存放任意结构的规则对象，为未来规则格式的扩展保留了灵活性。

**字段说明**:
- `design` (`unknown[]`): 设计阶段的增强规则数组
- `specs` (`unknown[]`): 规格文档阶段的增强规则数组
- `implement` (`unknown[]`): 实现阶段的增强规则数组

**核心代码**:
```typescript
const EnhancementRulesSchema = z.object({
  design: z.array(z.unknown()),
  specs: z.array(z.unknown()),
  implement: z.array(z.unknown()),
});
```
Source: `src/utils/config.ts`:75-79

**使用示例**:
```typescript
// 默认值
{ design: [], specs: [], implement: [] }
```
说明: 默认三个阶段的规则数组均为空。用户可在项目配置中添加自定义规则来增强对应阶段的行为。

---

### `MemorySchema`

**Source**: `src/utils/config.ts`:81-83

**功能描述**: 定义记忆系统的调度配置。当前仅包含一个 `schedule` 字段，采用 cron 表达式格式，用于控制记忆维护任务的执行周期。

**字段说明**:
- `schedule` (`string`): cron 格式的调度表达式，用于记忆维护任务的时间调度

**核心代码**:
```typescript
const MemorySchema = z.object({
  schedule: z.string(),
});
```
Source: `src/utils/config.ts`:81-83

**使用示例**:
```typescript
// 默认值
{ schedule: "14 18 * * *" }
```
说明: 默认值 `"14 18 * * *"` 表示每天 18:14 执行记忆维护。该 schema 在 `EnhancementSchema` 中以 `.optional()` 形式内嵌。

---

### `EnhancementSchema`

**Source**: `src/utils/config.ts`:85-89

**功能描述**: 定义增强功能的整体配置。该 schema 组合了三个子结构：`context`（增强上下文，允许任意值或 null）、`rules`（增强规则，内嵌 `EnhancementRulesSchema`）、`memory`（记忆调度，内嵌 `MemorySchema`，可选）。`EnhancementSchema` 在根 schema 中也是可选的（`.optional()`），意味着整个增强功能块可以不配置。

**字段说明**:
- `context` (`unknown | null`): 增强上下文信息，可为任意类型或 `null`
- `rules` (`EnhancementRulesSchema`): 增强规则配置，包含 design/specs/implement 三组规则
- `memory` (`MemorySchema`, optional): 记忆调度配置，可选

**核心代码**:
```typescript
const EnhancementSchema = z.object({
  context: z.nullable(z.unknown()),
  rules: EnhancementRulesSchema,
  memory: MemorySchema.optional(),
});
```
Source: `src/utils/config.ts`:85-89

**使用示例**:
```typescript
// 默认值
{
  context: null,
  rules: { design: [], specs: [], implement: [] },
  memory: { schedule: "14 18 * * *" }
}
```
说明: `context` 字段设计为 `nullable(z.unknown())`，为用户提供了一个自由存放任意增强上下文数据的容器。`memory` 是可选的，不配置时记忆调度功能不生效。

---

### `FurinaConfigSchema`

**Source**: `src/utils/config.ts`:95-102

**功能描述**: 根配置 schema，组合了所有一级配置模块。这是整个配置子系统的入口 schema，被 `loadConfig` 用于 `safeParse` 验证，也被 `z.infer` 用于推导 `FurinaConfig` 类型。关键设计点是使用了 `.loose()` 修饰符，允许配置中存在 schema 未声明的额外字段——这使得项目级覆盖配置可以携带未来版本新增的字段而不导致验证失败。

**字段说明**:
- `language` (`string`): 界面语言设置，如 `"chinese"`、`"english"`
- `switchProviders` (`ProviderSwitchSchema`): 各工作流阶段的 provider 映射
- `project` (`ProjectSchema`): 项目级配置（源码路径、codebase 配置）
- `exploration` (`ExplorationSchema`): 探索阶段配置（四类探索条目）
- `experimental` (`ExperimentalSchema`): 实验性功能配置集合
- `enhancement` (`EnhancementSchema`, optional): 增强功能配置，可选

**核心逻辑**:
`.loose()` 修饰符是该 schema 的关键设计决策。当 `loadConfig` 读取项目级覆盖配置（`{cwd}/.claude/furina.json`）时，用户可能包含一些默认 schema 尚未声明的字段。`.loose()` 确保 `safeParse` 不会因为这些额外字段而报错，只有已声明字段的类型不匹配才会触发验证失败和叶子摘除。

**核心代码**:
```typescript
export const FurinaConfigSchema = z.object({
  language: z.string(),
  switchProviders: ProviderSwitchSchema,
  project: ProjectSchema,
  exploration: ExplorationSchema,
  experimental: ExperimentalSchema,
  enhancement: EnhancementSchema.optional(),
}).loose();
```
Source: `src/utils/config.ts`:95-102

**使用示例**:
```typescript
import { FurinaConfigSchema } from './utils/config.js';

// 验证一个配置对象
const result = FurinaConfigSchema.safeParse(unknownConfig);
if (result.success) {
  console.log(result.data.language); // "chinese"
} else {
  console.error(result.error.issues);
}
```
说明: `safeParse` 返回 `ZodSafeParseSuccess` 或 `ZodSafeParseError`。`loadConfig` 函数在验证失败时不会抛出异常，而是遍历 `error.issues` 摘除无效叶子后返回原始配置对象。

---

### `FurinaConfig` (type)

**Source**: `src/utils/config.ts`:104-105

**功能描述**: 通过 `z.infer` 从 `FurinaConfigSchema` 推导出的 TypeScript 类型。这是整个配置子系统对外暴露的核心类型，所有读取配置的代码都使用该类型进行类型检查。由于根 schema 使用了 `.loose()`，推导出的类型允许额外的索引签名字段。

**核心代码**:
```typescript
export type FurinaConfig = z.infer<typeof FurinaConfigSchema>;
```
Source: `src/utils/config.ts`:104-105

**使用示例**:
```typescript
import { type FurinaConfig, loadConfig } from './utils/config.js';

const config: FurinaConfig = loadConfig();
console.log(config.language);          // "chinese"
console.log(config.switchProviders.coding); // "default"
console.log(config.experimental.explore);   // true
```
说明: 该类型在项目中被广泛使用——`loadConfig` 的返回值类型、`MODE_PRESETS` 的值约束类型、以及 `config` 命令模块中各种辅助函数的参数类型都依赖于此。

---

### `DeepPartial<T>` (utility type)

**Source**: `src/utils/config.ts`:112-116

**功能描述**: 递归地将类型 `T` 的所有属性变为可选的工具类型。与 TypeScript 内置的 `Partial<T>` 不同，`DeepPartial` 会递归处理嵌套对象，使得深层嵌套的字段也可以省略。唯一的例外是数组类型——数组保持原类型不变（不做 deep partial），这是因为数组元素的类型通常应该保持一致。

**核心逻辑**:
1. 如果 `T` 是 `ReadonlyArray` 的子类型，直接返回 `T`（数组不展开）
2. 如果 `T` 是对象类型，递归地将每个属性变为可选
3. 否则（原始类型），直接返回 `T`

**核心代码**:
```typescript
export type DeepPartial<T> = T extends ReadonlyArray<unknown>
  ? T
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
```
Source: `src/utils/config.ts`:112-116

**使用示例**:
```typescript
import { type DeepPartial, type FurinaConfig } from './utils/config.js';

// 模式预设只需要覆盖部分字段
const liteMode: DeepPartial<FurinaConfig> = {
  experimental: {
    explore: false,
    review: { furina: false, specs: false, code: false },
  },
};
// 可以只设置 experimental 的部分字段，其余全部可省略
```
说明: `DeepPartial` 主要用于 `MODE_PRESETS`（在 `src/commands/config.ts` 中定义），允许模式预设只声明需要覆盖的字段。注意数组不做 deep partial——如果声明了 `exploration.repository`，其元素仍必须是完整的 `ExplorationItemSchema` 类型。

## Data Structures

### Schema 组合层级汇总

以下是所有 schema 的完整类型结构，基于 Zod 定义和 `resources/furina.json` 中的默认值。

### `ProviderSwitchSchema` 推导类型
```typescript
{
  workflow: string;    // e.g. "default"
  explore: string;     // e.g. "default"
  propose: string;     // e.g. "default"
  plan: string;        // e.g. "default"
  review: string;      // e.g. "default"
  coding: string;      // e.g. "default"
  finalize: string;    // e.g. "default"
}
```

### `CodebaseSchema` 推导类型
```typescript
{
  enable: boolean;     // e.g. false
  path: string;        // e.g. "docs/codebase"
}
```

### `ExplorationItemSchema` 推导类型
```typescript
{
  path: string;             // e.g. "./furina/"
  type?: string | undefined;    // e.g. "directory"
  description?: string | undefined; // e.g. "The location of Furina Artifacts..."
}
```

### `ReviewSchema` 推导类型
```typescript
{
  propose: boolean;     // e.g. false
  plan: boolean;        // e.g. false
  specs: boolean;       // e.g. false
  code: boolean;        // e.g. true
  acceptance: boolean;  // e.g. true
  furina: boolean;  // e.g. false
}
```

### `ExperimentalSchema` 推导类型
```typescript
{
  explore: boolean;     // e.g. true
  websearch: boolean;   // e.g. true
  context7: boolean;    // e.g. true
  review: ReviewSchema; // 内嵌 ReviewSchema
  prompt: PromptSchema; // { reviewCode: string | null }
  coverage: string;     // e.g. "70%"
  budget: boolean;      // e.g. true
  factor: number;       // e.g. 1
}
```

### `EnhancementRulesSchema` 推导类型
```typescript
{
  design: unknown[];
  specs: unknown[];
  implement: unknown[];
}
```

### `FurinaConfigSchema` 推导类型 (FurinaConfig)
```typescript
{
  language: string;                              // e.g. "chinese"
  switchProviders: ProviderSwitchSchema;
  project: ProjectSchema;
  exploration: ExplorationSchema;
  experimental: ExperimentalSchema;
  enhancement?: EnhancementSchema | undefined;   // optional
  [key: string]: unknown;                        // .loose() 允许额外字段
}
```

## Error Handling and Edge Cases

本 spec 覆盖的是**纯 schema 定义**，不涉及直接的错误处理逻辑。但 schema 定义直接影响 `loadConfig` 的验证行为：

1. **字段类型不匹配**：当配置文件中某个已声明字段的类型与 schema 不匹配时（如 `experimental.factor` 应为 `number` 但实际为 `"1"`），`safeParse` 返回失败，`loadConfig` 会通过 `deleteByPath` 摘除该叶子节点，并通过 `logger.warn` 输出路径和错误信息。后续 `queryConfig` 对该路径返回 `undefined`。

2. **必需字段缺失**：所有非 `optional()` 的字段都是必填的。如果默认配置文件（`resources/furina.json`）缺失某个必填字段，且项目覆盖配置也未补充，`safeParse` 会报告该字段缺失。

3. **额外字段**：由于根 schema 使用了 `.loose()`，配置中出现 schema 未声明的额外字段不会触发验证失败。这些额外字段会原封不动地保留在返回的配置对象中。

4. **nullable 字段**：`PromptSchema.reviewCode` 使用 `z.string().nullable()`，允许值为 `null`。`EnhancementSchema.context` 使用 `z.nullable(z.unknown())`，允许值为 `null` 或任意类型。

5. **可选字段**：`EnhancementSchema` 在根 schema 中是可选的（`.optional()`），`MemorySchema` 在 `EnhancementSchema` 中也是可选的。这意味着最小合法配置可以不包含 `enhancement` 块。

## Dependencies

- **依赖于**:
  - `zod` 库：所有 schema 的基础构建工具
  - `resources/furina.json`：默认配置文件，提供所有字段的初始值（虽然 schema 本身不依赖此文件，但它是 schema 实例化的数据来源）

- **被依赖于**:
  - `src/utils/config.ts` 的 `loadConfig` 函数：使用 `FurinaConfigSchema.safeParse()` 进行运行时验证
  - `src/utils/config.ts` 的 `queryConfig` 函数：返回值类型基于 `FurinaConfig`
  - `src/commands/config.ts` 的 `MODE_PRESETS` 常量：使用 `DeepPartial<FurinaConfig>` 作为值类型约束
  - `src/commands/config.ts` 的各种子命令函数：使用 `FurinaConfig` 类型进行参数和返回值类型检查

## Usage Examples

### 示例 1：验证配置对象

```typescript
import { FurinaConfigSchema } from './utils/config.js';

const rawConfig = {
  language: "chinese",
  switchProviders: {
    workflow: "default", explore: "claude-code", propose: "default",
    plan: "default", review: "default", coding: "default", finalize: "default"
  },
  project: { sourcecode: "./", codebase: { enable: true, path: "docs/codebase" } },
  exploration: { codebase: [], repository: [], reference: [], specification: [] },
  experimental: {
    explore: true, websearch: false, context7: false,
    review: { propose: false, plan: false, specs: false, code: true, acceptance: true, furina: false },
    prompt: { reviewCode: null },
    coverage: "80%", budget: true, factor: 1.5
  }
};

const result = FurinaConfigSchema.safeParse(rawConfig);
if (result.success) {
  // result.data 的类型为 FurinaConfig
  console.log(`语言: ${result.data.language}`);
  console.log(`explore 阶段 provider: ${result.data.switchProviders.explore}`);
} else {
  // result.error.issues 包含所有验证失败的详细信息
  for (const issue of result.error.issues) {
    console.warn(`字段 ${issue.path.join('.')}: ${issue.message}`);
  }
}
```
说明: 此示例展示了如何使用 `FurinaConfigSchema.safeParse` 验证一个手动构造的配置对象。成功时可通过 `result.data` 获取类型安全的配置；失败时可遍历 `issues` 获取每个失败字段的路径和错误信息。

### 示例 2：使用 DeepPartial 构建模式预设

```typescript
import { type DeepPartial, type FurinaConfig } from './utils/config.js';

// 构建 "lite" 模式预设：只覆盖需要修改的字段
const litePreset: DeepPartial<FurinaConfig> = {
  experimental: {
    explore: false,
    review: {
      furina: false,
      specs: false,
      code: false,
      // 其余字段（propose, plan, acceptance）可省略
    },
    // prompt, coverage, budget, factor 等均可省略
  },
  // language, switchProviders, project, exploration 均可省略
};

// 构建 "max" 模式预设
const maxPreset: DeepPartial<FurinaConfig> = {
  experimental: {
    explore: true,
    review: { furina: true, specs: true, code: true },
  },
};
```
说明: `DeepPartial` 允许模式预设只声明需要覆盖的字段。注意数组类型不做 deep partial——如果需要覆盖 `exploration` 中的某个数组，必须传入完整的 `ExplorationItemSchema[]`。

### 示例 3：通过 z.infer 获取精确的嵌套类型

```typescript
import { z } from 'zod';
import {
  FurinaConfigSchema,
  // 以下 schema 未导出，但可通过根 schema 间接访问其推导类型
} from './utils/config.js';

type Config = z.infer<typeof FurinaConfigSchema>;

// 访问嵌套类型
function handleReview(config: Config) {
  const { code, acceptance, furina } = config.experimental.review;
  if (code) {
    console.log("代码审查已启用");
  }
  if (furina) {
    console.log("Furina 审查已启用");
  }
}
```
说明: 虽然中间 schema（如 `ReviewSchema`）未从模块导出，但通过 `z.infer<typeof FurinaConfigSchema>` 推导出的 `FurinaConfig` 类型包含了完整的嵌套结构，可以安全地访问任意层级的字段。
