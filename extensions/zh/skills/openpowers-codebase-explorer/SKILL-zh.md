---
name: openpowers-codebase-explorer
description: >
  仅当用户明确说"使用 openpowers-codebase-explorer"、"用openpowers-codebase-explorer查询"或"/openpowers-codebase-explorer"时触发。
  在已有 openpowers-codebase-generator 文档树的基础上，按业务/功能/代码关键词查询相关实现。
  输入：文档树路径 + 查询描述（如"工具注册模块"、"MCP实现"）。
  输出：匹配的 spec 文档 + 相关源码片段。
---

# Openpowers Codebase Explorer — 基于文档树的代码功能查询器

在 openpowers-codebase-generator 生成的结构化文档树中，按用户提供的业务/功能描述，
逐层导航定位到相关 spec 文档和源码实现。

## 语言适配

使用以下脚本查询插件要求的输出语言：

```bash
python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py {当前项目路径} language
```

以脚本返回的语言作为所有用户界面输出和回复的默认语言。如果脚本无输出或执行失败，回退到中文。

## 输入参数

用户需提供以下两个参数：

1. **文档树路径**：openpowers-codebase-generator 生成的文档树根目录（包含 `toc.md` 总纲）。
2. **查询描述**：要查找的业务、功能或代码模块的简要描述，如"工具注册模块"、"MCP协议实现"。

如果用户未明确指定，使用 AskUserQuestion 工具询问用户确认。

## 前置条件

本 skill 依赖 openpowers-codebase-generator 已生成的文档树。文档树结构如下：

```
{文档树路径}/
├── toc.md                          ← 总纲（入口）
├── {模块-a}/
│   ├── toc.md                      ← 模块索引
│   ├── {子模块-1}/
│   │   ├── toc.md                  ← 子模块索引
│   │   ├── spec-xxx.md
│   │   └── spec-yyy.md
│   └── spec-zzz.md
├── {模块-b}/
│   ├── toc.md
│   └── ...
```

文档树中各级 toc.md 均包含详细的功能描述，用于逐层导航：

- **总纲 toc.md**：列出所有模块、子模块、直接 spec 的详细介绍
- **模块 toc.md**：列出该模块下所有子模块和直接 spec 的详细介绍
- **子模块 toc.md**：列出该子模块下所有 spec 的详细介绍

## 执行阶段

严格按以下阶段执行。

### 路径转换规则

toc.md 中的链接均为相对路径（如 `./module-a/toc.md`、`./submodule-1/spec-xxx.md`），需要拼接为绝对路径才能读取。

- 总纲 `toc.md` 中的链接：相对于 `{文档树路径}/`
- 模块 `toc.md` 中的链接：相对于 `{文档树路径}/{模块}/`
- 子模块 `toc.md` 中的链接：相对于 `{文档树路径}/{模块}/{子模块}/`

读取任何 toc.md 中的链接前，必须先将其转换为绝对路径。例如总纲中的 `./module-a/toc.md` → `{文档树路径}/module-a/toc.md`。

### 结果列表

从阶段一开始，维护一个**结果列表** `matched_specs`，所有找到的 spec 统一追加到该列表中，最终阶段四基于此列表输出。**`matched_specs` 最多保留 4 个 spec**，超过时优先保留与查询描述最相关的。

```
matched_specs = [
  {
    "spec_path": "spec文档的路径",
    "match_source": "总纲直接命中 | 模块直接spec | 子模块spec",
    "match_reason": "匹配原因"
  },
  ...
]
```

### 阶段一：读取总纲 — 定位候选模块和直接 spec

1. 读取 `{文档树路径}/toc.md`。
2. 将用户的查询描述与总纲中每个模块的介绍、子模块介绍、spec 介绍进行匹配。
3. 总纲中每个模块都有索引链接（如 `[模块A/toc.md](./module-a/toc.md)`），直接提取相对路径并按路径转换规则转为绝对路径。
4. 识别出所有较为相关的模块或者直接 spec（一个查询可能命中多个）（不宜命中过多，不超过3个模块）。
5. 对于总纲中直接命中的 spec（总纲中有 spec 描述和路径链接），提取相对路径并转为绝对路径，立即追加到 `matched_specs`（`match_source` 为 `总纲直接命中`）。
6. 输出内部日志（用于追踪查找过程，不是最终用户输出）：

```
[探索] 查询："{查询描述}"
[探索] 总纲命中模块：
  - {模块名}：索引路径 {转换后的绝对路径}，匹配原因：{说明}
[探索] 总纲命中直接spec（如有，已加入matched_specs）：
  - {转换后的绝对路径}：{匹配原因}
```

7. 如果总纲中没有找到任何匹配项，直接进入阶段四输出"无结果"提示。

### 阶段二：逐层深入 — 从模块到 spec

对阶段一中识别出的每个候选模块，依次深入查找。本阶段分为两部分：**模块级匹配**和**子模块级匹配**。

#### 2A. 模块级匹配

1. 读取该模块的 `toc.md`（使用阶段一转换后的绝对路径）。
2. 模块索引中包含子模块索引链接（如 `[submodule-1/toc.md](./submodule-1/toc.md)`）和直接 spec 链接（如 `[spec-zzz.md](./spec-zzz.md)`），提取相对路径并按路径转换规则转为绝对路径。
3. 用查询描述匹配子模块介绍和直接 spec 介绍。
4. 对于匹配到的**子模块**，提取其索引绝对路径，标记为待深入，进入 2B 处理。
5. 对于匹配到的**直接 spec**（模块下直接挂载的 spec），提取 spec 绝对路径，追加到 `matched_specs`（`match_source` 为 `模块直接spec`）。
6. 输出内部日志：

```
[探索] 模块 {模块名}
  读取模块索引：{路径}
  命中子模块（待深入）：
    - {子模块名}：索引路径 {转换后的绝对路径}，匹配原因：{说明}
  命中直接spec（已加入matched_specs）：
    - {转换后的绝对路径}：{匹配原因}
```

#### 2B. 子模块级匹配

对 2A 中标记为待深入的每个子模块，依次处理：

1. 读取该子模块的 `toc.md`（使用 2A 中转换后的绝对路径）。
2. 子模块索引中包含 spec 链接（如 `[spec-xxx.md](./spec-xxx.md)`），提取相对路径并按路径转换规则转为绝对路径。
3. 用查询描述匹配 spec 介绍。
4. 对于匹配到的 spec，提取 spec 绝对路径，追加到 `matched_specs`（`match_source` 为 `子模块spec`）。
5. 输出内部日志：

```
[探索] 子模块 {子模块名}
  读取子模块索引：{路径}
  命中spec（已加入matched_specs）：
    - {转换后的绝对路径}：{匹配原因}
```

### 阶段三：读取 spec 文档 + 源码 + 上下游追溯 + 相关性验证

对 `matched_specs` 列表中的所有 spec，逐一处理：

1. 读取 spec 文档全文。
2. 从 spec 文档头部提取源文件路径和行号范围。
3. 使用读取工具读取 spec 直接关联的源代码文件。**【强制】必须识别并优先选取该功能最核心的承载文件**，不得随意选取边支文件或罗列所有相关文件，应判断哪个文件是核心逻辑的主要实现。**【强制】源码必须读取和输出，不得跳过，即使需要大量省略也必须保留核心片段，绝不能空缺。**
   - **源码长度规则**：本段摘录 ≤ 100 行时，必须完整读取，不得精简；本段摘录 > 100 行时，可对不重要的代码进行适当省略，但必须保留足够丰富的代码细节，尤其是核心代码逻辑，不得出现注释占主体而实际代码寥寥无几的情况。
   - **【强制】省略标注要求**（针对源码片段）：省略代码时必须同时满足：① 在省略处写注释说明省略了第几行到第几行、以及原本代码的逻辑和功能；② 注释行下方另起一行单独写 `...`，不得将省略号写在注释里；③ 原始源码中的无关注释应一并省略（删除），只保留模型生成的省略标注。示例：`// （省略第 25-80 行：schema校验逻辑）` 下一行 `...`
   - **【强制】上下游调用方**（针对源码片段）：属于功能性参考，应当尽量保留有参考价值的核心片段，不得省略。
4. **上下游追溯**：
   - **向上**：查找哪些代码调用了这些源文件中的函数/接口（查看 import、函数调用处），读取调用方的关键代码片段
   - **向下**：查找这些源文件依赖了哪些其他模块/函数（查看 import、被调用处），读取被依赖方的关键代码片段
   - 将追溯到的上下游源文件也记录下来，一并输出
5. **相关性判断**：结合 spec 文档内容（概述、功能详情）、实际源码以及上下游代码，判断该 spec 是否与用户的查询描述真正相关。判断依据包括：
   - spec 的概述和功能描述是否覆盖了查询的业务/功能
   - 源码中是否包含与查询相关的核心逻辑、接口、数据结构
   - 如果相关，保留该条目
   - 如果不相关（仅是 toc.md 描述中的关键词偶然命中），从 `matched_specs` 中移除该条目
6. 输出内部日志：

```
[验证] spec-{名}.md
  判断：相关 / 不相关
  理由：{简要说明为什么相关或不相关}
  涉及源文件：{spec直接源文件 + 追溯到的上下游源文件}
```

### 阶段四：输出结果

根据验证后保留的 `matched_specs`（最多取前 4 个，按相关性排序），将最终结果呈现给用户（无需写入文件）。

**【强制】输出前必须先阅读引用文档**。在生成任何结果之前，必须先读取 `references/OUTPUT-GUIDE.md`，严格按照其中的格式规范和自检清单输出，不得跳过。

引用文档路径：`./references/OUTPUT-GUIDE.md`（相对于 openpowers-codebase-explorer skill 目录）。

输出结构概览（详见引用文档）：

1. 无结果提示（或）
2. 查询摘要 → 导航路径 → Spec 摘要 → 源码片段
3. 每个 spec 包含源码三部分：**直接源码** + **上游调用方** + **下游依赖**，不得空缺

#### 4.1 ~ 4.4（详见 `references/OUTPUT-GUIDE.md`）

4.1 查询摘要、4.2 导航路径、4.3 Spec 摘要、4.4 源码片段的详细格式规范见引用文档 `references/OUTPUT-GUIDE.md`，输出前必须阅读。

#### 4.5 完整结果输出格式示例

````
========================================
查询："工具注册模块"
文档树：D:/project-docs/
匹配结果：共找到 2 个相关spec
========================================

路径 1（模块级直接spec）：
  总纲 → tools → spec-register.md
  匹配原因：tools 模块索引中直接spec spec-register.md 的描述"工具注册、工具管理"命中了查询

路径 2（子模块级spec）：
  总纲 → tools → tool-registry → spec-lifecycle.md
  匹配原因：tool-registry 子模块索引中 spec-lifecycle.md 描述覆盖了工具生命周期管理

---
## Spec: 工具注册

源文件：
- `src/tools/registry.ts` : 10-120

概述：该 spec 覆盖工具注册模块，负责管理所有可用工具的注册、查询和生命周期。与查询"工具注册模块"直接相关，核心功能是 registerTool——接收一个 ToolDef 定义对象，经过 schema 校验后写入注册表；以及 getTool——按名称从注册表中查询已注册的工具定义。该模块是整个工具系统的基础，所有工具必须先注册才能被调用。

关键功能/接口：
- `registerTool(def: ToolDef)`：注册一个新工具定义
- `getTool(name: string)`：按名称查询已注册的工具

核心数据结构：
- `ToolDef`：工具定义对象，包含名称、描述、参数schema

---
## 源码：工具注册

### 直接源码

来源：src/tools/registry.ts:10-50（共 41 行）

```typescript
export async function registerTool(def: ToolDef): Promise<void> {
  // 参数校验
  if (!def.name || typeof def.name !== 'string') {
    throw new Error('tool name must be a non-empty string');
  }
// （省略第 15-30 行：schema 校验和默认值填充逻辑）
...
  // 写入注册表
  registry.set(def.name, def);
}
```

说明：registerTool 接收工具定义对象，校验参数合法性后写入注册表。

### 上游调用方

来源：src/server/init.ts:30-45（共 16 行）

```typescript
import { registerTool } from '../tools/registry';
import { builtinTools } from './builtin-tools';

export async function initTools() {
  for (const tool of builtinTools) {
    await registerTool(tool);
  }
}
```

说明：服务初始化时批量注册内置工具，展示了 registerTool 的调用方式。

### 下游依赖

来源：src/tools/validator.ts:5-25（共 21 行）

```typescript
export function validateToolSchema(def: unknown): ToolDef {
  if (!isObject(def)) throw new Error('tool must be an object');
  if (!isNonEmptyString(def.name)) throw new Error('tool.name is required');
  if (!isString(def.description)) throw new Error('tool.description is required');
  return def as ToolDef;
}
```

说明：validateToolSchema 对工具定义进行 schema 校验，registerTool 在写入前调用此函数。
````

## 关键规则

1. **依赖现有文档树**。本 skill 只读取 openpowers-codebase-generator 已生成的文档树，不生成新文档。
2. **逐层导航**。严格按照 总纲 → 模块 → 子模块 → spec 的层级逐层查找。阶段一只做模块级定位，阶段二再分别处理模块下的直接 spec（2A）和子模块下的 spec（2B），不跳级。
3. **支持多结果**。一个查询可能匹配多个模块/子模块/spec，最多收集 4 个最相关的 spec 输出。
4. **模糊匹配**。查询描述不要求精确匹配，应在各级 toc.md 的描述中查找语义相关的条目。
5. **【强制】带源码**。每个匹配的 spec 必须同时输出其关联的源码片段，不能只输出 spec 文档摘要。即使需要大量省略，也必须保留核心代码片段，绝不能空缺。
6. **中文输出**。所有输出内容必须使用中文。
7. **不修改文档树**。本 skill 是只读操作，不修改任何文档树文件。
8. **源码长度规则**。本段摘录 ≤ 100 行时，必须完整读取/输出，不得精简；本段摘录 > 100 行时，可对不重要的代码进行适当省略，但必须保留足够丰富的代码细节，尤其是核心代码逻辑，不得出现注释占主体而实际代码寥寥无几的情况。
   **【强制】省略代码时必须同时满足以下三点，缺一不可**（均针对源码片段输出）：① 在省略处写注释说明省略了第几行到第几行、以及原本代码的逻辑和功能；② 注释行下方另起一行单独写 `...`，不得省略号混在注释里；③ 原始源码中的无关注释应一并省略（删除），只保留模型生成的省略标注。示例：`// （省略第 15-30 行：schema 校验和默认值填充逻辑）\n...`
   **【强制】上下游调用方的源码片段属于功能性参考，应当尽量保留有参考价值的核心片段，不得省略**。
