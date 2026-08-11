# Provider Templates

> Source files:
> - `src/utils/provider-templates.ts` : 1-117

## Overview

本 spec 覆盖 `src/utils/provider-templates.ts` 中的 Provider 预设模板 CRUD 工具集。提供从 JSON 资源文件读取、新增和删除 Provider 预设模板的能力，是 Furina Provider 管理系统的模板数据层。

**设计动机**：Furina 支持多种 AI Provider（如 Claude 官方、DeepSeek、Zhipu 等），每个 Provider 需要配置 API 地址、默认模型、图标等信息。为降低用户配置成本，系统将常见 Provider 的配置预设为"模板"，用户只需选择模板即可快速添加 Provider。同时支持用户自定义模板以满足个性化需求。模板数据存储在独立的 JSON 资源文件中，与运行时配置分离。

**使用场景**：
- **GET /furina/api/providers/templates**：读取全部模板列表供前端选择
- **POST /furina/api/providers/templates**：添加自定义模板
- **DELETE /furina/api/providers/templates/:name**：删除自定义模板
- **GET /furina/api/providers**（图标解析）：读取模板列表以解析 Provider 的 `usedTemplate` 字段对应的品牌图标

**涉及的源文件**：
- `src/utils/provider-templates.ts`：提供 `ProviderTemplate` 接口、`ProviderTemplateInput` 类型，以及 `readProviderTemplates`、`addProviderTemplate`、`deleteProviderTemplate` 三个核心函数
- `resources/claude-providers-template.json`：内置模板的持久化 JSON 文件，包含所有 `source: 'builtin'` 的预设模板

## Architecture / Flow

### 模板数据流

```
resources/claude-providers-template.json
        │
        ▼
readProviderTemplates()  ←── 读取：返回 ProviderTemplate[]
        │
        ├── GET /templates ──→ 前端模板列表
        ├── GET /providers ──→ 图标解析（usedTemplate → iconSvg）
        │
        ▼
addProviderTemplate()    ←── 写入：追加自定义模板
        │                     （先 read → 校验重名 → push → write）
        │
        ▼
deleteProviderTemplate() ←── 写入：删除自定义模板
                              （先 read → 查找 → 校验 source → splice → write）
```

### 核心设计决策

1. **读-改-写模式（Read-Modify-Write）**：所有写操作均遵循"读取全量 → 内存修改 → 写回全量"模式，不存在增量写入。这保持了实现的简洁性，但对于频繁写入场景，需注意并发写入可能导致数据丢失（当前为单进程服务，无此风险）。
2. **source 字段由服务端强制赋值**：`addProviderTemplate` 接受的输入类型 `ProviderTemplateInput` 不包含 `source` 字段，函数内部强制设定为 `'custom'`，确保客户端无法伪造内置模板。
3. **防御性读取**：`readProviderTemplates` 对文件不存在和 JSON 解析失败两种情况均返回空数组，避免调用方需要处理异常。
4. **模板文件路径基于模块位置**：使用 `import.meta.url` 结合 `path.dirname` 计算当前模块目录，再向上两级定位 `resources/` 目录，确保无论进程的工作目录如何变化，路径解析始终正确。

## Functionality / Interface Details

### `readProviderTemplates() -> ProviderTemplate[]`

**Source**: `src/utils/provider-templates.ts`:54-64

**功能描述**：从 `resources/claude-providers-template.json` 文件读取并返回完整的 Provider 模板列表。该函数是整个模板系统的数据入口，所有其他操作（新增、删除、查询）均依赖它获取当前模板快照。函数对异常情况采取静默降级策略——文件不存在或 JSON 格式损坏时返回空数组而非抛出异常，确保调用链不会因为模板文件问题而中断。

**参数**：无

**返回值**：
- `ProviderTemplate[]`: 解析后的模板数组。正常情况下返回文件中存储的全部模板对象
- 文件不存在时：返回 `[]`
- JSON 解析失败时：返回 `[]`（`JSON.parse` 抛出 SyntaxError，被 catch 捕获）

**核心逻辑**：
1. 使用 `fs.existsSync` 检查模板文件是否存在，不存在则直接返回空数组
2. 使用 `fs.readFileSync` 同步读取文件内容（UTF-8 编码）
3. 使用 `JSON.parse` 解析内容，通过 `as ProviderTemplate[]` 类型断言（不做运行时校验，信任内置资源文件的格式正确性）
4. 若 `JSON.parse` 抛出异常（SyntaxError），catch 块返回空数组

**核心代码**：
```typescript
export function readProviderTemplates(): ProviderTemplate[] {
  if (!fs.existsSync(TEMPLATES_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(TEMPLATES_PATH, 'utf-8');
  try {
    return JSON.parse(raw) as ProviderTemplate[];
  } catch {
    return [];
  }
}
```
Source: `src/utils/provider-templates.ts`:54-64

**使用示例**：
```typescript
import { readProviderTemplates } from './utils/provider-templates.js';

// 获取全部模板
const templates = readProviderTemplates();
console.log(`共 ${templates.length} 个模板`);
// => "共 12 个模板"（内置资源文件包含 12 个模板）

// 按名称查找模板
const deepseek = templates.find(t => t.name === 'DeepSeek');
console.log(deepseek?.baseUrl);
// => "https://api.deepseek.com/anthropic"

// 筛选自定义模板
const customTemplates = templates.filter(t => t.source === 'custom');
```
说明：`readProviderTemplates` 是同步函数，适用于服务启动时加载和请求处理中的快速查询。返回的数组是对 `JSON.parse` 结果的直接引用，调用方应注意不要直接修改返回值（当前调用方如 `addProviderTemplate` 和 `deleteProviderTemplate` 内部均会复制后操作）。

---

### `addProviderTemplate(template: ProviderTemplateInput) -> ProviderTemplate`

**Source**: `src/utils/provider-templates.ts`:74-91

**功能描述**：向模板资源文件追加一个新的自定义 Provider 模板。函数在写入前执行重名校验——若已存在同名模板（无论 builtin 还是 custom），抛出异常拒绝写入。写入时强制将 `source` 字段设为 `'custom'`，防止客户端通过输入参数伪造内置模板身份。

**参数**：
- `template` (`ProviderTemplateInput`): 待添加的模板数据。类型为 `Omit<ProviderTemplate, 'source'>`，即不包含 `source` 字段的模板对象。必须包含 `name`（唯一标识）和 `baseUrl`（API 地址），其余字段均为可选

**返回值**：
- `ProviderTemplate`: 新添加的完整模板对象（包含由服务端赋值的 `source: 'custom'` 字段）
- 同时该模板已追加写入到 `TEMPLATES_PATH` 文件中

**异常**：
- `Error("Template name \"xxx\" already exists")`: 名称与已有模板重复时抛出。调用方（`providers.ts` 路由层）捕获此异常并返回 HTTP 409

**核心逻辑**：
1. 调用 `readProviderTemplates()` 获取当前全量模板快照
2. 使用 `Array.some` 检查是否存在同名模板（精确匹配 `name` 字段），存在则抛出 `Error`
3. 使用展开运算符 `...template` 复制输入数据，附加 `source: 'custom'`，构造完整的 `ProviderTemplate` 对象
4. 使用 `Array.push` 将新模板追加到数组末尾
5. 使用 `fs.writeFileSync` 将修改后的完整数组写回文件（`JSON.stringify` 带 2 空格缩进）

**核心代码**：
```typescript
export function addProviderTemplate(template: ProviderTemplateInput): ProviderTemplate {
  const templates = readProviderTemplates();

  // Validate duplicate name
  const isDuplicate = templates.some((t) => t.name === template.name);
  if (isDuplicate) {
    throw new Error(`Template name "${template.name}" already exists`);
  }

  // Force source to 'custom' regardless of any client-provided value
  const newTemplate: ProviderTemplate = {
    ...template,
    source: 'custom',
  };
  templates.push(newTemplate);
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8');
  return newTemplate;
}
```
Source: `src/utils/provider-templates.ts`:74-91

**使用示例**：
```typescript
import { addProviderTemplate } from './utils/provider-templates.js';

// 添加自定义模板
const newTemplate = addProviderTemplate({
  name: 'My Provider',
  baseUrl: 'https://my-provider.com/anthropic',
  websiteUrl: 'https://my-provider.com',
  iconSvg: 'my-provider.svg',
  defaultModel: 'my-model-v1',
  sonnetModel: 'my-model-v1',
  opusModel: 'my-model-v1',
  haikuModel: 'my-model-lite',
});

console.log(newTemplate.source);
// => "custom"（无论输入中是否包含 source，均被强制覆盖）

// 重名时抛出异常
try {
  addProviderTemplate({ name: 'My Provider', baseUrl: 'https://other.com/api' });
} catch (err) {
  console.log(err.message);
  // => 'Template name "My Provider" already exists'
}
```
说明：`addProviderTemplate` 不执行字段级别的运行时校验（如 `baseUrl` 是否为合法 URL），仅校验名称唯一性。字段校验由调用方（`providers.ts` 路由层中的 Zod schema `ProviderTemplateInputSchema`）在调用前完成。

---

### `deleteProviderTemplate(name: string) -> boolean`

**Source**: `src/utils/provider-templates.ts`:101-116

**功能描述**：按名称删除一个自定义 Provider 模板。函数执行两层检查：首先验证目标模板是否存在（不存在返回 `false`），然后验证目标模板的 `source` 是否为 `'custom'`（builtin 模板禁止删除，抛出异常）。删除操作通过 `splice` 从数组中移除目标元素，随后将修改后的完整数组写回文件。

**参数**：
- `name` (`string`): 待删除模板的名称，精确匹配 `ProviderTemplate.name` 字段

**返回值**：
- `true`: 模板已找到并成功删除，文件已更新
- `false`: 未找到匹配名称的模板，文件未修改

**异常**：
- `Error("Cannot delete builtin template: \"xxx\"")`: 尝试删除 `source: 'builtin'` 的模板时抛出。调用方（`providers.ts` 路由层）捕获此异常并返回 HTTP 403

**核心逻辑**：
1. 调用 `readProviderTemplates()` 获取当前全量模板快照
2. 使用 `Array.findIndex` 查找匹配名称的模板索引，未找到返回 `-1` 则函数返回 `false`
3. 检查目标模板的 `source` 字段，若为 `'builtin'` 则抛出 `Error`（内置模板受保护）
4. 使用 `Array.splice(index, 1)` 从数组中移除该模板
5. 使用 `fs.writeFileSync` 将修改后的完整数组写回文件
6. 返回 `true`

**核心代码**：
```typescript
export function deleteProviderTemplate(name: string): boolean {
  const templates = readProviderTemplates();

  const index = templates.findIndex((t) => t.name === name);
  if (index === -1) {
    return false;
  }

  if (templates[index].source === 'builtin') {
    throw new Error(`Cannot delete builtin template: "${name}"`);
  }

  templates.splice(index, 1);
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8');
  return true;
}
```
Source: `src/utils/provider-templates.ts`:101-116

**使用示例**：
```typescript
import { deleteProviderTemplate } from './utils/provider-templates.js';

// 删除自定义模板
const deleted = deleteProviderTemplate('My Custom Provider');
console.log(deleted); // => true

// 删除不存在的模板
const notFound = deleteProviderTemplate('Non Existent');
console.log(notFound); // => false（静默返回，不抛异常）

// 尝试删除内置模板
try {
  deleteProviderTemplate('DeepSeek');
} catch (err) {
  console.log(err.message);
  // => 'Cannot delete builtin template: "DeepSeek"'
}
```
说明：删除操作按名称匹配，不区分大小写——实际代码使用 `===` 严格相等比较，因此名称匹配是大小写敏感的。

## Data Structures

### `ProviderTemplate`

```typescript
export interface ProviderTemplate {
  name: string;
  websiteUrl?: string;
  baseUrl: string;
  iconSvg?: string;
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
  source: 'builtin' | 'custom';
}
```
- `name` (`string`): 模板唯一显示名称，作为主键用于查找、重名校验和删除匹配。同一文件中不允许重复
- `websiteUrl` (`string`, 可选): Provider 官方网站 URL，用于前端外链展示。内置模板如 `"https://www.anthropic.com/claude-code"`
- `baseUrl` (`string`, 必填): Provider 的 API 基础地址，是创建 Provider 时的核心配置。如 `"https://api.deepseek.com/anthropic"`
- `iconSvg` (`string`, 可选): SVG 图标文件名（非完整路径），如 `"anthropic.svg"`、`"deepseek.svg"`。前端通过此文件名渲染 Provider 品牌图标
- `defaultModel` (`string`, 可选): 默认模型标识符。部分 Provider（如 Claude 官方）留空，表示使用系统默认值
- `sonnetModel` (`string`, 可选): Sonnet 级别模型标识符，对应 Claude Code 的 Sonnet 类请求
- `opusModel` (`string`, 可选): Opus 级别模型标识符，对应 Claude Code 的 Opus 类请求
- `haikuModel` (`string`, 可选): Haiku 级别模型标识符，对应 Claude Code 的 Haiku 类请求
- `source` (`'builtin' | 'custom'`): 模板来源标识。`'builtin'` 表示来自内置 JSON 资源文件（随应用分发），`'custom'` 表示用户通过 API 添加的自定义模板。该字段由服务端赋值，客户端不可控

### `ProviderTemplateInput`

```typescript
export type ProviderTemplateInput = Omit<ProviderTemplate, 'source'>;
```
- 添加模板时的输入类型，与 `ProviderTemplate` 结构相同但省略 `source` 字段
- `source` 字段在 `addProviderTemplate` 内部强制赋值为 `'custom'`，确保客户端无法通过输入参数伪造模板来源
- 等价于：`{ name: string; websiteUrl?: string; baseUrl: string; iconSvg?: string; defaultModel?: string; sonnetModel?: string; opusModel?: string; haikuModel?: string; }`

### 模板文件路径常量

```typescript
const moduleDirname = path.dirname(url.fileURLToPath(import.meta.url));
const TEMPLATES_PATH = path.join(moduleDirname, '..', '..', 'resources', 'claude-providers-template.json');
```
- `moduleDirname`: 当前模块文件所在目录的绝对路径，通过 `import.meta.url` 转换得到
- `TEMPLATES_PATH`: 模板 JSON 文件的绝对路径，基于模块位置向上两级定位 `resources/` 目录。此设计确保无论进程工作目录如何变化，路径解析始终正确（与 Node.js 的 `__dirname` 等价，但适用于 ESM 模块系统）

## Error Handling and Edge Cases

### 读取异常处理

| 场景 | 行为 | 设计意图 |
|------|------|----------|
| 模板文件不存在 | `readProviderTemplates` 返回 `[]` | 应用首次安装或资源文件被误删时不崩溃，允许后续写入创建文件 |
| JSON 格式损坏 | `readProviderTemplates` 返回 `[]` | 资源文件被手动编辑导致格式错误时不崩溃 |
| 文件读取权限不足 | 抛出 `EACCES` 异常（未捕获） | 权限问题属于系统级错误，应由调用方处理 |

### 写入异常处理

| 场景 | 行为 | 设计意图 |
|------|------|----------|
| 模板名重复 | `addProviderTemplate` 抛出 `Error` | 名称作为主键必须唯一，调用方返回 HTTP 409 |
| 删除内置模板 | `deleteProviderTemplate` 抛出 `Error` | 内置模板受保护不可删除，调用方返回 HTTP 403 |
| 删除不存在的模板 | `deleteProviderTemplate` 返回 `false` | 幂等操作，不视为错误，调用方返回 HTTP 404 |

### 边界情况

| 场景 | 行为 | 说明 |
|------|------|------|
| 模板文件首次不存在时调用 `addProviderTemplate` | 写入失败（`writeFileSync` 无法创建不存在的路径中的中间目录） | 当前实现假设 `resources/` 目录始终存在，由应用打包保证 |
| 并发调用多个写操作 | 后写入的覆盖先写入的结果（丢失中间状态） | 当前为单进程 HTTP 服务，路由层为串行处理，无此风险 |
| `name` 包含特殊字符 | 正常写入和匹配，无特殊处理 | `name` 仅作为字符串比较使用，不参与文件路径或正则构造 |
| 内置模板文件中有重复名称 | `readProviderTemplates` 正常返回，不报错 | 运行时不做内置数据一致性校验，由资源文件维护者保证 |

## Dependencies

### Depends on
- **Node.js `fs`**：文件同步读写操作（`existsSync`、`readFileSync`、`writeFileSync`）
- **Node.js `path`**：路径拼接（`join`、`dirname`）
- **Node.js `url`**：ESM 模块的 `fileURLToPath` 转换，用于获取当前模块目录

### Depended by
- **`src/server/routes/providers.ts`**：Provider 路由层，直接导入并调用三个核心函数
  - `GET /furina/api/providers/templates` 调用 `readProviderTemplates()` 返回全部模板
  - `POST /furina/api/providers/templates` 调用 `addProviderTemplate()` 创建自定义模板
  - `DELETE /furina/api/providers/templates/:name` 调用 `deleteProviderTemplate()` 删除自定义模板
  - `GET /furina/api/providers` 调用 `readProviderTemplates()` 解析 Provider 的 `usedTemplate` 对应的 `iconSvg` 图标

## Usage Examples

### 完整的模板管理场景

```typescript
import {
  readProviderTemplates,
  addProviderTemplate,
  deleteProviderTemplate,
} from './utils/provider-templates.js';

// ========== 1. 读取模板列表 ==========
const templates = readProviderTemplates();
console.log(`当前共 ${templates.length} 个模板`);
// => "当前共 12 个模板"

// 筛选内置和自定义模板
const builtin = templates.filter(t => t.source === 'builtin');
const custom = templates.filter(t => t.source === 'custom');
console.log(`内置: ${builtin.length}, 自定义: ${custom.length}`);

// ========== 2. 添加自定义模板 ==========
try {
  const newTemplate = addProviderTemplate({
    name: 'My Custom Provider',
    baseUrl: 'https://custom-api.example.com/anthropic',
    websiteUrl: 'https://example.com',
    iconSvg: 'custom.svg',
    defaultModel: 'custom-model-v2',
    sonnetModel: 'custom-model-v2',
    opusModel: 'custom-model-v2',
    haikuModel: 'custom-model-lite',
  });
  console.log('添加成功:', newTemplate.name, newTemplate.source);
  // => "添加成功: My Custom Provider custom"
} catch (err) {
  if (err instanceof Error && err.message.includes('already exists')) {
    console.error('模板名已存在，请使用其他名称');
  }
}

// ========== 3. 删除自定义模板 ==========
try {
  const deleted = deleteProviderTemplate('My Custom Provider');
  if (deleted) {
    console.log('删除成功');
  } else {
    console.log('模板不存在');
  }
} catch (err) {
  if (err instanceof Error && err.message.includes('Cannot delete builtin')) {
    console.error('内置模板不可删除');
  }
}

// ========== 4. 错误处理汇总 ==========
// 尝试删除内置模板
try {
  deleteProviderTemplate('DeepSeek');
} catch (err) {
  console.error(err.message);
  // => 'Cannot delete builtin template: "DeepSeek"'
}

// 删除不存在的模板（静默返回 false）
const result = deleteProviderTemplate('Does Not Exist');
console.log(result); // => false
```

### 在路由层的使用模式（providers.ts）

```typescript
// GET /templates - 读取全部模板
providersRouter.get('/templates', (_req, res) => {
  try {
    const templates = readProviderTemplates();
    res.status(200).json(templates);
  } catch {
    res.status(500).json({ error: 'Failed to read provider templates' });
  }
});

// POST /templates - 添加模板（Zod 校验后调用）
providersRouter.post('/templates', (req, res) => {
  const parsed = ProviderTemplateInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }
  try {
    const template = addProviderTemplate(parsed.data);
    res.status(201).json(template);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// DELETE /templates/:name - 删除模板
providersRouter.delete('/templates/:name', (req, res) => {
  try {
    const deleted = deleteProviderTemplate(req.params.name);
    if (!deleted) {
      res.status(404).json({ error: `Template not found: ${req.params.name}` });
      return;
    }
    res.status(200).json({ message: `Template "${req.params.name}" deleted successfully` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Cannot delete builtin')) {
      res.status(403).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});
```
说明：路由层负责 Zod 输入校验和 HTTP 状态码映射，`provider-templates.ts` 只负责数据层的读写和业务规则校验（重名检查、builtin 保护）。两层分工明确——数据层抛出语义化 Error，路由层捕获并映射为对应的 HTTP 状态码（409 重名、403 禁止删除、404 未找到）。
