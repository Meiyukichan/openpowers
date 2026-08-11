# Change Shared Utilities

> Source files:
> - `src/commands/change/shared.ts` : 1-314

## Overview

`shared.ts` 是 change 子系统的基础设施层，为所有其他 change 命令（new、list、status、archive、instruction、feature、stage）提供共用的路径常量、校验逻辑、JSON 同步机制和工具函数。

**设计动机**：change 子系统中的多个命令都需要访问相同的目录路径、校验 change 名称、读写 `changes.json` 注册表、扫描工件文件和计算进度。将这些逻辑抽取到 shared 模块中，避免了代码重复，并确保所有命令对文件系统状态和 JSON 注册表的交互方式一致。

**职责范围**：
- 定义路径常量（CHANGES_DIR、ARCHIVE_DIR、CHANGES_JSON_PATH）
- kebab-case 命名校验
- `changes.json` 的加载/创建/同步（协调文件系统与 JSON 注册表的一致性）
- 工件存在性扫描（buildArtifacts）
- `plan.json` 进度计算（features/todo 计数）
- 相对路径转换和相对时间格式化

**使用场景**：每次执行 change 相关命令时，都需要先通过此模块获取路径、加载或同步 changes.json，然后才能执行具体的业务逻辑。

## Architecture / Flow

### changes.json 同步流程

`syncChangesJson()` 是本模块最核心的函数，它实现了文件系统与 JSON 注册表之间的双向同步：

```
syncChangesJson()
  |
  +-- loadOrCreateChangesJson()          // 加载或创建 changes.json
  |     |
  |     +-- [文件不存在] -> 创建默认 JSON + 写入磁盘
  |     +-- [文件存在] -> 读取 + 补全缺失字段 + 强制更新 framework/version
  |
  +-- 扫描 furina/changes/ 目录     // 获取活跃 change 目录列表
  |     +-- 过滤：仅目录、排除 archive、排除隐藏目录(.开头)
  |
  +-- 建立现有 changes Map（按 name 索引）
  |
  +-- 重建 changes 数组
  |     +-- 遍历每个目录：构建 entry (name, path, description, createdAt, features, todo, artifacts)
  |     +-- computeProgress(plan.json)    // 计算进度
  |     +-- buildArtifacts(changePath)    // 扫描工件
  |     +-- 保留已有的 description 和 createdAt
  |
  +-- 扫描 furina/archive/ 目录     // 获取归档 change 目录列表
  |     +-- 过滤：仅目录、排除隐藏目录
  |
  +-- 建立现有 archive Map（按 name 索引）
  |
  +-- 重建 archive 数组
  |     +-- extractArchiveName() 去除日期前缀
  |     +-- 优先级：archive 现有 > changes 现有 > 默认值
  |     +-- 为新增归档补充 closedAt
  |
  +-- 写回 changes.json 到磁盘
  +-- 返回同步后的数据
```

### 工件扫描机制

`buildArtifacts()` 根据预定义的 ARTIFACT_IDS 和 ARTIFACT_EXTENSIONS 映射关系，在指定目录中检测工件文件是否存在：

```
ARTIFACT_IDS = ['proposal', 'design', 'specs', 'api', 'database', 'plan']

文件映射:
  proposal -> proposal.md
  design   -> design.md
  specs    -> specs/**/*.md  (特殊：检查 specs/ 目录是否存在)
  api      -> api.yaml
  database -> database.md
  plan     -> plan.json
```

## Functionality / Interface Details

### `toRelativePath(absolutePath: string) -> string`

**Source**: `src/commands/change/shared.ts`:28-31

**Functionality**: 将绝对路径转换为相对于 `process.cwd()` 的路径，并统一使用正斜杠分隔符。这是为了确保在 Windows 和 Linux/macOS 上生成的路径格式一致，避免 JSON 注册表中出现平台相关的路径分隔符。

**Parameters**:
- `absolutePath` (`string`): 需要转换的绝对文件系统路径

**Return Value**:
- `string`: 相对于当前工作目录的路径，使用正斜杠分隔（如 `furina/changes/my-feature`）

**Core Logic**:
使用 `path.relative()` 计算相对路径后，通过正则表达式将所有反斜杠 `\` 替换为正斜杠 `/`，实现跨平台路径规范化。

**Core Code**:
```typescript
export function toRelativePath(absolutePath: string): string {
  const relative = path.relative(process.cwd(), absolutePath);
  return relative.replace(/\\/g, '/');
}
```
Source: `src/commands/change/shared.ts`:28-31

**Usage Example**:
```typescript
// 在 Windows 上将绝对路径转换为统一格式
const relative = toRelativePath('D:\\project\\furina\\changes\\my-feature');
// 结果: 'furina/changes/my-feature'

// 在 Linux 上同样正常工作
const relative = toRelativePath('/home/user/project/furina/changes/my-feature');
// 结果: 'furina/changes/my-feature'
```
Explanation: 所有写入 changes.json 的路径都通过此函数标准化，确保跨平台一致性。

---

### `formatRelativeTime(isoDate: string) -> string`

**Source**: `src/commands/change/shared.ts`:64-74

**Functionality**: 将 ISO 8601 日期字符串格式化为人类可读的相对时间。用于 change list 命令中展示 change 的创建时间，让用户快速了解每个 change 的活跃程度。

**Parameters**:
- `isoDate` (`string`): ISO 8601 格式的日期字符串（如 `2026-05-17T10:30:00.000Z`）

**Return Value**:
- `string`: 格式化的相对时间字符串，可能的值：
  - `"just now"` — 不到 1 分钟前
  - `"Xm ago"` — 1-59 分钟前
  - `"Xh ago"` — 1-23 小时前
  - `"Xd ago"` — 1-30 天前
  - 本地化的日期字符串（超过 30 天，使用 `toLocaleDateString()`）

**Core Logic**:
计算当前时间与输入时间的毫秒差，逐步转换为分钟、小时、天数，然后根据阈值判断返回格式。优先返回更精确的单位（分钟 > 小时 > 天 > 日期）。

**Core Code**:
```typescript
export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return new Date(isoDate).toLocaleDateString();
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}
```
Source: `src/commands/change/shared.ts`:64-74

**Usage Example**:
```typescript
// change list 命令中展示时间
const createdAt = '2026-07-04T10:30:00.000Z';
console.log(formatRelativeTime(createdAt));
// 结果: "1d ago"（假设当前是 2026-07-05）
```
Explanation: 在 change list 的表格输出中，用相对时间替代完整日期字符串，更直观地展示 change 的新旧程度。

---

### `validateChangeName(name: string) -> { valid: boolean; error?: string }`

**Source**: `src/commands/change/shared.ts`:81-86

**Functionality**: 校验 change 名称是否符合 kebab-case 命名规范。change 名称用于目录名，因此必须符合文件系统安全的命名要求。此函数被 new、archive、instruction、feature 等多个命令使用，在执行任何操作前先验证名称合法性。

**Parameters**:
- `name` (`string`): 待校验的 change 名称

**Return Value**:
- `{ valid: boolean; error?: string }`: 校验结果对象
  - `valid: true` — 名称合法
  - `valid: false, error: '...'` — 名称不合法，附带错误提示

**Core Logic**:
使用正则表达式 `KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` 进行匹配：
- 必须以小写字母开头
- 后续字符可以是小写字母或数字
- 允许使用连字符 `-` 分隔多个单词，但连字符后必须紧跟字母或数字
- 不允许连续连字符、尾部连字符或大写字母

**Core Code**:
```typescript
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validateChangeName(name: string): { valid: boolean; error?: string } {
  if (!KEBAB_CASE.test(name)) {
    return { valid: false, error: 'Change name must be kebab-case (e.g., my-change)' };
  }
  return { valid: true };
}
```
Source: `src/commands/change/shared.ts`:45, 81-86

**Usage Example**:
```typescript
// 合法的 change 名称
validateChangeName('my-feature');       // { valid: true }
validateChangeName('fix-login-bug');    // { valid: true }
validateChangeName('v2');               // { valid: true }

// 不合法的 change 名称
validateChangeName('MyFeature');        // { valid: false, error: '...' } — 大写字母
validateChangeName('-my-feature');      // { valid: false, error: '...' } — 以连字符开头
validateChangeName('my--feature');      // { valid: false, error: '...' } — 连续连字符
validateChangeName('');                 // { valid: false, error: '...' } — 空字符串
```
Explanation: 在 `change new`、`change archive` 等命令执行前调用此函数，确保 change 名称可以安全用作目录名。

---

### `buildArtifacts(dirPath: string) -> Array<{ id: string; outputPath: string }>`

**Source**: `src/commands/change/shared.ts`:94-112

**Functionality**: 扫描指定 change 目录中实际存在的工件文件，返回存在的工件列表。每种工件类型有预定义的文件扩展名映射。此函数不创建任何文件，仅做存在性检测。它被 `syncChangesJson()` 调用来更新每个 change 的 artifacts 字段，也被 `change status` 命令直接调用来计算工件完成状态。

**Parameters**:
- `dirPath` (`string`): change 目录的绝对路径（如 `D:\project\furina\changes\my-feature`）

**Return Value**:
- `Array<{ id: string; outputPath: string }>`: 存在的工件数组
  - `id`: 工件标识符，取值范围为 `ARTIFACT_IDS` 中的值（`proposal`、`design`、`specs`、`api`、`database`、`plan`）
  - `outputPath`: 工件的相对路径（经 `toRelativePath` 标准化）

**Core Logic**:
1. 遍历 `ARTIFACT_IDS` 数组，根据 `ARTIFACT_EXTENSIONS` 映射构建每个工件的预期文件路径
2. 对于 `specs` 类型，路径模式为 `specs/**/*.md`，但实际检测的是 `specs/` 目录是否存在
3. 对于其他类型，直接检测对应文件是否存在（如 `proposal.md`、`api.yaml`）
4. 只返回通过存在性检测的工件

**Core Code**:
```typescript
export function buildArtifacts(dirPath: string): Array<{ id: string; outputPath: string }> {
  return ARTIFACT_IDS
    .map((id) => {
      const fileName = id === 'specs' ? `specs${ARTIFACT_EXTENSIONS[id]}` : `${id}${ARTIFACT_EXTENSIONS[id]}`;
      const filePath = path.join(dirPath, fileName);
      const outputPath = toRelativePath(path.resolve(filePath));
      return { id, outputPath, filePath, fileName };
    })
    .filter(({ filePath, id }) => {
      if (id === 'specs') {
        const specsDir = path.join(dirPath, 'specs');
        return fs.existsSync(specsDir);
      }
      return fs.existsSync(filePath);
    })
    .map(({ id, outputPath }) => ({ id, outputPath }));
}
```
Source: `src/commands/change/shared.ts`:94-112

**Usage Example**:
```typescript
// 扫描一个 change 目录中的工件
const artifacts = buildArtifacts('D:\\project\\furina\\changes\\my-feature');
// 假设目录中存在 proposal.md 和 specs/ 目录：
// 结果: [
//   { id: 'proposal', outputPath: 'furina/changes/my-feature/proposal.md' },
//   { id: 'specs', outputPath: 'furina/changes/my-feature/specs/**/*.md' }
// ]
```
Explanation: 此函数通过文件系统实际状态判断工件是否已生成，用于同步 changes.json 和展示 change 状态。

---

### `extractArchiveName(dirName: string) -> string`

**Source**: `src/commands/change/shared.ts`:119-121

**Functionality**: 从归档目录名中提取原始 change 名称，去除 `YYYY-MM-DD-` 日期前缀。归档时目录会被重命名为 `2026-05-17-my-feature` 格式，此函数用于从这种格式中恢复原始的 change 名称。

**Parameters**:
- `dirName` (`string`): 归档目录名（如 `2026-05-17-remove-command`）

**Return Value**:
- `string`: 去除日期前缀后的 change 名称（如 `remove-command`）

**Core Logic**:
使用正则表达式 `^\d{4}-\d{2}-\d{2}-` 匹配并移除开头的日期前缀部分。

**Core Code**:
```typescript
export function extractArchiveName(dirName: string): string {
  return dirName.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}
```
Source: `src/commands/change/shared.ts`:119-121

**Usage Example**:
```typescript
extractArchiveName('2026-05-17-remove-command');  // 'remove-command'
extractArchiveName('2026-12-01-fix-login');       // 'fix-login'
```
Explanation: 归档目录名带有日期前缀以保证唯一性和时间排序，此函数用于在同步时将目录名映射回 change 名称。

---

### `computeProgress(planPath: string) -> { features: number; todo: number }`

**Source**: `src/commands/change/shared.ts`:129-141

**Functionality**: 读取 `plan.json` 文件并计算特性总数和未完成数。`plan.json` 是一个特性数组，每个特性有 `status` 字段。此函数返回 `features`（总数）和 `todo`（未完成数）两个计数值，用于 change list 和 change status 中展示进度。

**Parameters**:
- `planPath` (`string`): `plan.json` 文件的绝对路径

**Return Value**:
- `{ features: number; todo: number }`:
  - `features`: plan.json 中特性的总数
  - `todo`: 状态不是 `'done'` 的特性数量
  - 文件不存在或解析失败时返回 `{ features: 0, todo: 0 }`

**Core Logic**:
1. 检查文件是否存在，不存在则返回安全默认值
2. 读取并解析 JSON，验证是否为数组
3. 统计总数和 `status !== 'done'` 的数量
4. 任何异常（文件读取、JSON 解析）都静默返回默认值 `{ features: 0, todo: 0 }`

**Core Code**:
```typescript
export function computeProgress(planPath: string): { features: number; todo: number } {
  if (!fs.existsSync(planPath)) return { features: 0, todo: 0 };
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features)) return { features: 0, todo: 0 };
    const total = features.length;
    const todo = features.filter((f: { status?: string }) => f.status !== 'done').length;
    return { features: total, todo };
  } catch {
    return { features: 0, todo: 0 };
  }
}
```
Source: `src/commands/change/shared.ts`:129-141

**Usage Example**:
```typescript
// 计算某个 change 的进度
const progress = computeProgress('/project/furina/changes/my-feature/plan.json');
// 假设 plan.json 有 5 个特性，其中 3 个已完成：
// 结果: { features: 5, todo: 2 }

// change list 中的进度展示
console.log(`${progress.features - progress.todo}/${progress.features} features done`);
// 输出: "3/5 features done"
```
Explanation: 进度信息在 change list 表格和 change status 输出中用于直观展示 change 的完成程度。

---

### `loadOrCreateChangesJson() -> ChangesJsonData`

**Source**: `src/commands/change/shared.ts`:148-169

**Functionality**: 加载 `furina/changes.json` 文件，如果文件不存在则自动创建。此函数是只读操作（不涉及文件系统同步），适用于只需要读取当前注册表数据的场景（如 API 服务端）。它同时会强制更新 `framework` 和 `version` 字段为当前 `package.json` 的值，确保版本信息始终最新。

**Parameters**: 无

**Return Value**:
- `{ framework: string; version: string; changes: Array<Record<string, unknown>>; archive: Array<Record<string, unknown>> }`: changes.json 的完整数据结构
  - `framework`: 框架名称，来自 package.json 的 name 字段
  - `version`: 版本号，来自 package.json 的 version 字段
  - `changes`: 活跃 change 条目数组
  - `archive`: 归档 change 条目数组

**Core Logic**:
1. 检查 `CHANGES_JSON_PATH` 是否存在
2. 不存在时：创建父目录 -> 写入默认 JSON -> 返回默认结构的深拷贝
3. 存在时：读取文件 -> 补全缺失的 `changes`/`archive` 字段为 `[]` -> 强制覆盖 `framework`/`version` 为 package.json 当前值 -> 返回解析后的数据

**Core Code**:
```typescript
export function loadOrCreateChangesJson(): { framework: string; version: string; changes: Array<Record<string, unknown>>; archive: Array<Record<string, unknown>> } {
  if (!fs.existsSync(CHANGES_JSON_PATH)) {
    const jsonContent = JSON.stringify(DEFAULT_CHANGES_JSON, null, 2);
    const dir = path.dirname(CHANGES_JSON_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CHANGES_JSON_PATH, jsonContent, 'utf-8');
    logger.info(`Created default ${path.relative(process.cwd(), CHANGES_JSON_PATH)}`);
    return JSON.parse(JSON.stringify(DEFAULT_CHANGES_JSON));
  }
  const raw = fs.readFileSync(CHANGES_JSON_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed.changes) parsed.changes = [];
  if (!parsed.archive) parsed.archive = [];
  parsed.framework = pkg.name;
  parsed.version = pkg.version;
  return parsed;
}
```
Source: `src/commands/change/shared.ts`:148-169

**Usage Example**:
```typescript
// API 服务端使用此函数加载 changes 数据
const data = loadOrCreateChangesJson();
console.log(`Framework: ${data.framework}, Version: ${data.version}`);
console.log(`Active changes: ${data.changes.length}`);
console.log(`Archived changes: ${data.archive.length}`);
```
Explanation: 此函数被服务端 API（`src/server/changes/index.ts`）直接调用来获取 changes 数据。与 `syncChangesJson()` 不同，它不做文件系统扫描，只加载或创建 JSON 文件本身。

---

### `syncChangesJson() -> ChangesJsonData`

**Source**: `src/commands/change/shared.ts`:177-304

**Functionality**: 将 `changes.json` 与文件系统状态进行完全同步。这是 change 子系统中最核心的数据协调函数，确保 JSON 注册表始终反映文件系统的实际状态。它会扫描活跃目录和归档目录，重建整个 changes 和 archive 数组，重新计算进度，补充工件信息，然后写回磁盘。

**Parameters**: 无

**Return Value**:
- `{ framework: string; version: string; changes: Array<Record<string, unknown>>; archive: Array<Record<string, unknown>> }`: 同步后的完整 changes.json 数据

**Core Logic**:

**阶段一 — 加载现有数据**：
调用 `loadOrCreateChangesJson()` 获取当前 JSON 数据。

**阶段二 — 扫描活跃 changes**：
1. 读取 `CHANGES_DIR` 目录，收集所有子目录（排除 `archive` 和隐藏目录）
2. 将现有 `data.changes` 建立按 `name` 的索引 Map
3. 遍历文件系统中的目录，对每个目录：
   - 构建 entry 对象（name、path、description、createdAt、features、todo、artifacts）
   - 调用 `computeProgress(plan.json)` 计算进度
   - 调用 `buildArtifacts()` 扫描工件
   - 保留现有的 description 和 createdAt（如果存在）
4. 用新数组替换 `data.changes`

**阶段三 — 扫描归档 changes**：
1. 读取 `ARCHIVE_DIR` 目录，收集所有子目录（排除隐藏目录）
2. 将现有 `data.archive` 建立按 `name` 的索引 Map
3. 遍历归档目录，对每个目录：
   - 使用 `extractArchiveName()` 从目录名提取 change 名称
   - 构建 entry 对象，字段优先级：archive 现有数据 > changes 现有数据 > 默认值
   - 对于新增的归档条目，自动补充 `closedAt` 为当前时间
   - 计算 features 总数（不计算 todo，因为归档后都已完成）
4. 用新数组替换 `data.archive`

**阶段四 — 写回磁盘**：
确保父目录存在后，将同步后的数据写入 `CHANGES_JSON_PATH`。

**Core Code**（活跃 changes 扫描与重建部分）:
```typescript
// --- Scan active changes ---
const activeDirs: string[] = [];
if (fs.existsSync(CHANGES_DIR)) {
  const entries = fs.readdirSync(CHANGES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.')) {
      activeDirs.push(entry.name);
    }
  }
}

const existingChangesMap = new Map<string, Record<string, unknown>>();
for (const ch of data.changes) {
  if (ch.name && typeof ch.name === 'string') {
    existingChangesMap.set(ch.name, ch as Record<string, unknown>);
  }
}

const newChanges: Array<Record<string, unknown>> = [];
for (const dirName of activeDirs) {
  const changePath = path.join(CHANGES_DIR, dirName);
  const planPath = path.join(changePath, 'plan.json');
  const existing = existingChangesMap.get(dirName);

  const entry: Record<string, unknown> = {
    name: dirName,
    path: toRelativePath(changePath),
    description: (existing?.description as string) ?? '',
    createdAt: (existing?.createdAt as string) ?? new Date().toISOString(),
    features: 0,
    todo: 0,
    artifacts: buildArtifacts(changePath),
  };

  const progress = computeProgress(planPath);
  entry.features = progress.features;
  entry.todo = progress.todo;
  newChanges.push(entry);
}

data.changes = newChanges;
```
Source: `src/commands/change/shared.ts`:180-232

**Core Code**（归档 changes 同步部分）:
```typescript
// Rebuild archive array from filesystem scan
const newArchive: Array<Record<string, unknown>> = [];
for (const dirName of archiveDirs) {
  const changeName = extractArchiveName(dirName);
  const archivePath = path.join(ARCHIVE_DIR, dirName);
  const planPath = path.join(archivePath, 'plan.json');
  const existing = existingArchiveMap.get(changeName);
  const previousChange = existingChangesMap.get(changeName);

  const entry: Record<string, unknown> = {
    name: changeName,
    path: toRelativePath(archivePath),
    description: (existing?.description ?? previousChange?.description ?? '') as string,
    createdAt: (existing?.createdAt ?? previousChange?.createdAt as string) ?? new Date().toISOString(),
    closedAt: (existing?.closedAt as string) ?? new Date().toISOString(),
    features: 0,
    artifacts: buildArtifacts(archivePath),
  };

  const progress = computeProgress(planPath);
  entry.features = progress.features;
  newArchive.push(entry);
}

data.archive = newArchive;
```
Source: `src/commands/change/shared.ts`:254-293

**Usage Example**:
```typescript
// change list 命令中同步并获取最新数据
const data = syncChangesJson();
console.log(`Found ${data.changes.length} active, ${data.archive.length} archived`);

// change status 命令中获取同步后的工件信息
const data = syncChangesJson();
const change = data.changes.find(c => c.name === 'my-feature');
if (change) {
  console.log(`Progress: ${change.features - change.todo}/${change.features}`);
  console.log(`Artifacts:`, change.artifacts);
}
```
Explanation: `syncChangesJson()` 是 change 子系统中最频繁调用的函数。每次执行 change list、change new、change archive、change status 等命令时都会调用它来确保数据一致性。

## Data Structures

### `DEFAULT_CHANGES_JSON`
```typescript
const DEFAULT_CHANGES_JSON = {
  framework: pkg.name,
  version: pkg.version,
  changes: [],
  archive: [],
};
```
- `framework` (`string`): 框架名称，取自 `package.json` 的 `name` 字段
- `version` (`string`): 版本号，取自 `package.json` 的 `version` 字段
- `changes` (`Array`): 活跃 change 条目数组，初始为空
- `archive` (`Array`): 归档 change 条目数组，初始为空

### `ARTIFACT_IDS`
```typescript
const ARTIFACT_IDS = ['proposal', 'design', 'specs', 'api', 'database', 'plan'] as const;
```
- 定义了 change 工件的完整列表，代表变更生命周期中可能生成的所有产出物
- 使用 `as const` 确保类型推断为字面量联合类型

### `ARTIFACT_EXTENSIONS`
```typescript
const ARTIFACT_EXTENSIONS: Record<string, string> = {
  proposal: '.md',
  design: '.md',
  specs: '/**/*.md',
  api: '.yaml',
  database: '.md',
  plan: '.json',
};
```
- `proposal`: Markdown 文档
- `design`: Markdown 文档
- `specs`: 目录，包含多个 Markdown 文件（使用 glob 模式）
- `api`: YAML API 定义文件
- `database`: Markdown 数据库设计文档
- `plan`: JSON 任务计划文件

### `KEBAB_CASE`
```typescript
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
```
- kebab-case 命名规范正则表达式
- 要求：小写字母开头，允许小写字母、数字和连字符分隔符
- 不允许：大写字母、连续连字符、以连字符开头或结尾

### Path Constants
```typescript
const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');
const ARCHIVE_DIR = path.join(process.cwd(), 'furina', 'archive');
const CHANGES_JSON_PATH = path.join(process.cwd(), 'furina', 'changes.json');
```
- `CHANGES_DIR`: 活跃 change 目录的根路径（`furina/changes/`）
- `ARCHIVE_DIR`: 归档 change 目录的根路径（`furina/archive/`）
- `CHANGES_JSON_PATH`: changes.json 注册表文件路径（`furina/changes.json`）
- 所有路径基于 `process.cwd()` 构建，确保相对于项目根目录

### Change Entry (活跃 change)
```typescript
{
  name: string;           // change 名称（与目录名一致）
  path: string;           // 相对路径
  description: string;    // 描述信息
  createdAt: string;      // ISO 8601 创建时间
  features: number;       // plan.json 中特性总数
  todo: number;           // plan.json 中未完成特性数
  artifacts: Array<{ id: string; outputPath: string }>;  // 存在的工件列表
}
```

### Archive Entry (归档 change)
```typescript
{
  name: string;           // change 名称（去除日期前缀）
  path: string;           // 相对路径
  description: string;    // 描述信息
  createdAt: string;      // ISO 8601 创建时间
  closedAt: string;       // ISO 8601 归档时间
  features: number;       // plan.json 中特性总数
  artifacts: Array<{ id: string; outputPath: string }>;  // 存在的工件列表
}
```

## Error Handling and Edge Cases

### 文件系统容错
- **changes.json 不存在**：`loadOrCreateChangesJson()` 自动创建默认文件，包括创建父目录
- **changes/archive 目录不存在**：`syncChangesJson()` 检查目录存在性后再扫描，不存在时返回空数组
- **plan.json 不存在或格式错误**：`computeProgress()` 返回安全默认值 `{ features: 0, todo: 0 }`，不抛出异常
- **plan.json 内容不是数组**：同样返回默认值

### 数据同步策略
- **JSON 注册表中存在但文件系统中不存在的 change**：被自动移除（同步以文件系统为准）
- **文件系统中存在但 JSON 中不存在的 change**：自动创建新条目，createdAt 使用当前时间
- **description/createdAt 保留策略**：优先保留 JSON 中已有的值，新增条目才使用默认值
- **归档条目的字段继承**：优先级为 archive 已有 > active 已有 > 默认值，确保归档时不会丢失之前记录的信息

### 跨平台兼容
- **路径分隔符**：`toRelativePath()` 统一将 `\` 替换为 `/`，确保 Windows/Linux 一致性
- **路径构建**：使用 `path.join()` 而非字符串拼接，适配不同操作系统

### 隐藏目录过滤
- 扫描 changes 和 archive 目录时，排除以 `.` 开头的目录（如 `.git`、`.DS_Store` 等）
- changes 目录扫描额外排除 `archive` 子目录

## Dependencies

### Depends on
- **`fs` (Node.js)**: 文件系统操作（existsSync、readdirSync、readFileSync、writeFileSync、mkdirSync）
- **`path` (Node.js)**: 路径操作（join、relative、resolve、dirname）
- **`module` (Node.js)**: `createRequire` 用于加载 `package.json`
- **`../../utils/logger.js`**: 日志记录，用于输出创建/同步 changes.json 的信息

### Depended by
- **`src/commands/change/new.ts`**: 导入 `CHANGES_DIR`、`CHANGES_JSON_PATH`、`loadOrCreateChangesJson`、`syncChangesJson`、`validateChangeName`
- **`src/commands/change/list.ts`**: 导入 `syncChangesJson`、`formatRelativeTime`
- **`src/commands/change/status.ts`**: 导入 `syncChangesJson`、`buildArtifacts`、`ARTIFACT_EXTENSIONS`
- **`src/commands/change/archive.ts`**: 导入 `CHANGES_DIR`、`ARCHIVE_DIR`、`CHANGES_JSON_PATH`、`syncChangesJson`、`validateChangeName`
- **`src/commands/change/instruction.ts`**: 导入 `validateChangeName`、`CHANGES_DIR`
- **`src/commands/change/feature.ts`**: 导入 `CHANGES_DIR`、`validateChangeName`
- **`src/server/changes/index.ts`**: 导入 `loadOrCreateChangesJson`（API 服务端直接使用）

## Usage Examples

### 完整场景：创建新 change 并查看状态

```typescript
import {
  CHANGES_DIR,
  validateChangeName,
  loadOrCreateChangesJson,
  syncChangesJson,
  buildArtifacts,
  computeProgress,
  formatRelativeTime,
} from './shared.js';

// 1. 校验 change 名称
const name = 'add-user-auth';
const validation = validateChangeName(name);
if (!validation.valid) {
  console.error(validation.error);
  process.exit(1);
}

// 2. 创建 change 目录
const changePath = path.join(CHANGES_DIR, name);
fs.mkdirSync(changePath, { recursive: true });

// 3. 同步 changes.json（将新目录注册到 JSON）
const data = syncChangesJson();

// 4. 查看 change 状态
const change = data.changes.find(c => c.name === name);
if (change) {
  console.log(`Change: ${change.name}`);
  console.log(`Created: ${formatRelativeTime(change.createdAt)}`);
  console.log(`Progress: ${change.features - change.todo}/${change.features} features`);
  console.log(`Artifacts: ${change.artifacts.map(a => a.id).join(', ') || 'none'}`);
}
```
Explanation: 展示了从校验名称、创建目录、同步注册表到查看状态的完整流程。这是 change 子系统中典型的调用模式。

### API 服务端使用 loadOrCreateChangesJson

```typescript
// src/server/changes/index.ts 中的用法
import { loadOrCreateChangesJson } from '../../commands/change/shared.js';

changesRouter.get('/', (_req, res) => {
  try {
    const data = loadOrCreateChangesJson();
    res.status(200).json({ ok: true, data });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to load changes data' });
  }
});
```
Explanation: API 服务端使用 `loadOrCreateChangesJson()` 而非 `syncChangesJson()`，因为 API 层只需要读取数据，不需要执行文件系统同步。同步操作由 CLI 命令在适当时机触发。
