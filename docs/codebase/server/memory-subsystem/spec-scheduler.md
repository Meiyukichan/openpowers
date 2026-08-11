# Cron Scheduler & Project Processing

> Source files:
> - `src/server/memory/scheduler.ts` : 1-342

## Overview

`scheduler.ts` 是 Furina 全局内存调度器的核心实现，负责在后台以 cron 定时任务的形式扫描 `~/.furina/memory/` 目录下的待处理设计文档，调用 Claude CLI 进行自动化的项目设计处理和跨项目记忆同步。

**在系统中的角色和定位：**
该模块是 memory-subsystem（内存调度子系统）的核心执行引擎。它将离散的"设计文档写入"事件（由 `syncDesignToMemory` 触发）与定时的批量处理任务连接起来，形成了一个完整的"写入-处理-聚合-清理"流水线。调度器通过 `node-cron` 库实现定时调度，支持从配置文件动态读取 cron 表达式，并提供完整的生命周期管理接口供服务器启动/关闭及 REST API 调用。

**设计动机：**
用户的项目探索（explore）操作会产生设计文档（design.md），这些文档需要被 Claude CLI 处理以生成项目画像（project-portrait.md）和项目设计汇总（project-design.md）。处理需要后台异步进行，因为 Claude CLI 调用可能需要数分钟。调度器将这些处理任务批量收集后统一调度执行，避免阻塞用户界面。

**使用场景：**
1. 服务器启动时自动注册 cron 任务（`entry.ts` 中调用 `startScheduler()`）
2. 服务器关闭时销毁 cron 任务（`entry.ts` 中调用 `stopScheduler()`）
3. REST API 通过 `/furina/api/schedule` 路由控制调度器的启动/停止/重启
4. `syncDesignToMemory()` 在将设计文档同步到内存目录后，通过 HTTP PUT 调用 schedule API 确保调度器正在运行

**涉及的源文件及各自职责：**
- `scheduler.ts`：本文件，调度器的全部核心逻辑
- `schedule-logger.ts`：提供 `appendLog()` 用于记录调度器操作日志到 `~/.furina/memory/dreamwork.log`
- `project-group-schema.ts`：提供 `validateProjectGroupsFile()` 用于验证 grouper agent 生成的 `project-groups.json` 的 Zod schema 合法性
- `entry.ts`：服务器启动时调用 `startScheduler()`，关闭时调用 `stopScheduler()`
- `routes/schedule.ts`：通过 REST API 暴露调度器生命周期控制

## Architecture / Flow

### 调度器生命周期

```
entry.ts (服务器启动)
  |
  v
startScheduler()
  |-- readCronFromConfig()  读取 cron 表达式
  |-- cron.schedule()        注册定时任务
  |-- cronTask.start()       启动定时任务
  |
  v
[Cron 触发] -----> 扫描 ~/.furina/memory/
  |                    |
  |                    v
  |              筛选 Memory_* 目录
  |                    |
  |                    v
  |              hasNonEmptyDesigns() 过滤
  |                    |
  |                    v
  |              串行处理每个项目目录:
  |                    |
  |                    v
  |              processProject(projectDir)
  |                |-- copyClaudeResources()   复制 agents/skills
  |                |-- executeClaudeDesigner()  执行 Claude CLI
  |                |-- tryCleanupDesigns()      条件清理设计文件
  |                |-- tryCleanupClaude()       清理 .claude 目录
  |                    |
  |                    v
  |              syncProjectGroup(pendingDirs)
  |                |-- 复制 agents/skills 到 Project_Group
  |                |-- 聚合 project-design.md 文件
  |                |-- executeClaudeGrouper()    执行 grouper
  |                |-- validateProjectGroupsFile() 校验输出
  |                |-- 清理聚合文件 + .claude 目录
  |
  v
[服务器关闭]
  |
  v
stopScheduler()
  |-- cronTask.stop()
  |-- cronTask.destroy()
  |-- cronTask = null
```

### 定时任务执行流程（Cron Callback 内部）

1. 读取 `~/.furina/memory/` 目录，获取所有子目录条目
2. 筛选出以 `Memory_` 开头且 `designs/` 子目录包含 `.md` 文件的目录
3. 如果没有待处理目录，直接结束
4. **串行**处理每个待处理目录（`processProject`）：
   - 复制 `resources/agents` 和 `resources/skills` 到项目的 `.claude` 目录
   - 调用 `claude --agent backgroud-designer` CLI 处理设计文档
   - 如果 `project-design.md` 和 `project-portrait.md` 都已生成，删除原始设计文件
   - 无论成功失败，最终清理 `.claude` 目录
5. 执行跨项目记忆同步（`syncProjectGroup`）：
   - 聚合各项目的 `project-design.md` 到 `Project_Group` 目录
   - 调用 `claude --agent backgroud-grouper` CLI 进行跨项目分组
   - 使用 Zod schema 验证生成的 `project-groups.json`
   - 验证失败则删除输出文件，下次重试
   - 验证通过则清理聚合的 `Memory_*.md` 文件

## Functionality / Interface Details

### `startScheduler(): void`

**Source**: `src/server/memory/scheduler.ts`:283-328

**Functionality**: 启动全局内存调度器。读取配置文件中的 cron 表达式，使用 `node-cron` 注册一个定时任务。该定时任务的核心回调执行上述完整扫描-处理-同步流程。如果调度器已在运行（`cronTask !== null`），则跳过启动，确保幂等性。

这是调度器生命周期的入口，被服务器启动流程（`entry.ts`）和 REST API（`routes/schedule.ts`）共同调用。

**Parameters**: 无

**Return Value**: `void`

**Core Logic**:
1. 检查模块级变量 `cronTask` 是否已存在，若已存在则记录日志并返回（幂等保护）
2. 调用 `readCronFromConfig()` 获取 cron 表达式
3. 使用 `cron.schedule()` 注册异步回调函数
4. 回调内部执行完整的扫描流程：
   - 读取 `MEMORY_DIR`（`~/.furina/memory/`）获取目录列表
   - 过滤以 `Memory_` 开头的目录
   - 再通过 `hasNonEmptyDesigns()` 过滤有非空 designs 的目录
   - 串行调用 `processProject()` 处理每个项目
   - 最后调用 `syncProjectGroup()` 进行跨项目同步
5. 调用 `cronTask.start()` 启动定时任务

**Core Code**:
```typescript
export function startScheduler(): void {
  if (cronTask) {
    appendLog('Scheduler start skipped: already running');
    return;
  }

  const cronExpression = readCronFromConfig();
  appendLog(`Scheduler cron registered (${cronExpression})`);
  cronTask = cron.schedule(cronExpression, async () => {
    appendLog('Scheduler task started');

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(MEMORY_DIR, { withFileTypes: true });
    } catch {
      appendLog('Scheduler: could not read memory directory, skipping');
      appendLog('Scheduler task finished');
      return;
    }

    const pendingDirs = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('Memory_'))
      .map((entry) => path.join(MEMORY_DIR, entry.name))
      .filter((subDir) => hasNonEmptyDesigns(subDir));

    if (pendingDirs.length === 0) {
      appendLog('Scheduler: no directories with pending designs found');
      appendLog('Scheduler task finished');
      return;
    }

    for (const projectDir of pendingDirs) {
      await processProject(projectDir);
    }

    await syncProjectGroup(pendingDirs);

    appendLog('Scheduler task finished');
  });

  cronTask.start();
}
```
Source: `src/server/memory/scheduler.ts`:283-328

**Usage Example**:
```typescript
// 在服务器启动时调用（entry.ts）
import { startScheduler } from './memory/scheduler.js';

server = app.listen(port, () => {
  startScheduler();
});
```
Explanation: 服务器监听端口成功后启动调度器，注册 cron 任务等待定时执行。

---

### `stopScheduler(): void`

**Source**: `src/server/memory/scheduler.ts`:334-341

**Functionality**: 停止并销毁调度器的 cron 任务。调用 `cronTask.stop()` 停止任务调度，然后调用 `cronTask.destroy()` 释放底层资源，最后将 `cronTask` 置为 `null` 以便后续可以重新启动。如果调度器未在运行（`cronTask` 为 `null`），则不执行任何操作，确保幂等性。

该函数在服务器关闭流程中被调用（`entry.ts` 中的 shutdown 路由），也在 REST API 的 DELETE 和 restart 端点中被调用。

**Parameters**: 无

**Return Value**: `void`

**Core Logic**:
1. 检查 `cronTask` 是否存在
2. 若存在：记录日志，调用 `stop()` 停止调度，调用 `destroy()` 释放资源，置 `null`

**Core Code**:
```typescript
export function stopScheduler(): void {
  if (cronTask) {
    appendLog('Scheduler stopped');
    cronTask.stop();
    cronTask.destroy();
    cronTask = null;
  }
}
```
Source: `src/server/memory/scheduler.ts`:334-341

**Usage Example**:
```typescript
// 在服务器关闭时调用（entry.ts 的 shutdown 路由）
import { stopScheduler } from './memory/scheduler.js';

app.post('/furina/api/shutdown', (_req, res) => {
  res.json({ ok: true });
  stopScheduler();
  server.close(() => process.exit(0));
});
```
Explanation: 关闭服务器前先停止调度器，防止在进程退出过程中 cron 回调仍在执行。

---

### `isSchedulerRunning(): boolean`

**Source**: `src/server/memory/scheduler.ts`:63-65

**Functionality**: 查询调度器是否正在运行。通过检查模块级变量 `cronTask` 是否为 `null` 来判断。该函数是无副作用的纯查询，用于 REST API 端点判断当前调度器状态，避免重复启动或停止。

**Parameters**: 无

**Return Value**: `boolean` - `true` 表示调度器已注册且正在运行，`false` 表示未运行

**Core Code**:
```typescript
export function isSchedulerRunning(): boolean {
  return cronTask !== null;
}
```
Source: `src/server/memory/scheduler.ts`:63-65

**Usage Example**:
```typescript
// 在 REST API 中使用（routes/schedule.ts）
scheduleRouter.put('/', (_req, res) => {
  if (isSchedulerRunning()) {
    res.status(200).json({ ok: true, started: false });
    return;
  }
  startScheduler();
  res.status(200).json({ ok: true, started: true });
});
```
Explanation: PUT /schedule 路由先检查调度器状态，如果已在运行则返回 `started: false`，否则启动并返回 `started: true`，实现幂等启动。

---

### `readCronFromConfig(): string`

**Source**: `src/server/memory/scheduler.ts`:38-56

**Functionality**: 从 `resources/furina.json` 配置文件中读取 cron 表达式。按照 `enhancement.memory.schedule` 路径读取配置值。如果配置文件不存在、JSON 解析失败、或配置路径上任何一级缺失，都回退到默认值 `'0 2 * * *'`（每天凌晨 2 点执行）。所有读取和解析错误都被静默捕获，不影响调度器的正常启动。

**Parameters**: 无

**Return Value**: `string` - 有效的 cron 表达式（5 字段格式），如 `'0 2 * * *'`

**Core Logic**:
1. 定义默认回退值 `'0 2 * * *'`
2. 尝试读取 `resources/furina.json`（路径相对于编译后的 `dist/server/memory/scheduler.js` 向上三级到 `resources/`）
3. 解析 JSON，逐级访问 `enhancement` -> `memory` -> `schedule`
4. 如果 `schedule` 是非空字符串则使用它
5. 任何异常或路径缺失都记录日志并返回回退值

**Core Code**:
```typescript
function readCronFromConfig(): string {
  const fallback = '0 2 * * *';
  try {
    const configPath = path.join(resourcesDir, 'furina.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const enhancement = parsed?.['enhancement'] as Record<string, unknown> | undefined;
    const memory = enhancement?.['memory'] as Record<string, unknown> | undefined;
    const schedule = memory?.['schedule'];
    if (typeof schedule === 'string' && schedule.length > 0) {
      appendLog(`Scheduler using cron from config: ${schedule}`);
      return schedule;
    }
    appendLog(`Scheduler using default cron: ${fallback} (enhancement.memory.schedule not found)`);
  } catch {
    appendLog(`Scheduler using default cron: ${fallback} (could not read config)`);
  }
  return fallback;
}
```
Source: `src/server/memory/scheduler.ts`:38-56

**Usage Example**:
```typescript
// 在 startScheduler 内部调用
const cronExpression = readCronFromConfig();
// 可能返回 '0 2 * * *'（默认）或用户配置的值如 '30 1 * * *'
cronTask = cron.schedule(cronExpression, async () => { /* ... */ });
```
Explanation: `startScheduler()` 在注册 cron 任务前调用此函数获取 cron 表达式。

---

### `processProject(projectDir: string): Promise<void>`

**Source**: `src/server/memory/scheduler.ts`:171-197

**Functionality**: 处理单个项目目录的完整流水线。这是调度器对单个 `Memory_*` 目录执行的核心操作序列：复制 Claude 所需资源、执行 Claude CLI 处理设计文档、条件清理已处理的设计文件、最终清理临时资源目录。

该函数负责将用户的"待处理设计文档"转化为"项目画像"和"项目设计汇总"，是整个调度器的核心业务逻辑单元。

**Parameters**:
- `projectDir` (`string`): 项目内存目录的绝对路径，如 `~/.furina/memory/Memory_C__Users_foo_project`

**Return Value**: `Promise<void>`

**Core Logic**:
1. 计算 `.claude` 目录和 `designs` 目录的路径
2. 读取 `designs/` 目录中的所有 `.md` 文件名列表
3. 如果读取失败（目录不存在），记录日志并返回
4. 在 try-catch-finally 块中执行：
   - `copyClaudeResources(claudeDir)`：复制 agents 和 skills 资源
   - `executeClaudeDesigner(designsDir, projectDir, designMdNames)`：执行 Claude CLI
   - `tryCleanupDesigns(projectDir, designMdPaths)`：条件清理设计文件
   - finally: `tryCleanupClaude(claudeDir)`：确保清理 `.claude` 目录
5. 如果 Claude 执行失败，记录错误日志但不抛出异常

**Core Code**:
```typescript
async function processProject(projectDir: string): Promise<void> {
  appendLog(`Processing: ${projectDir}`);

  const claudeDir = path.join(projectDir, '.claude');
  const designsDir = path.join(projectDir, 'designs');

  let designMdNames: string[];
  try {
    designMdNames = fs.readdirSync(designsDir).filter((entry) => entry.endsWith('.md'));
  } catch {
    appendLog(`Could not read designs directory: ${designsDir}`);
    return;
  }
  const designMdPaths = designMdNames.map((name) => path.join(designsDir, name));

  try {
    copyClaudeResources(claudeDir);
    await executeClaudeDesigner(designsDir, projectDir, designMdNames);
    tryCleanupDesigns(projectDir, designMdPaths);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`Claude execution failed for ${projectDir}: ${message}`);
  } finally {
    tryCleanupClaude(claudeDir);
  }
}
```
Source: `src/server/memory/scheduler.ts`:171-197

**Usage Example**:
```typescript
// 在 startScheduler 的 cron 回调中串行调用
for (const projectDir of pendingDirs) {
  await processProject(projectDir);
}
```
Explanation: 调度器扫描到待处理目录后，逐个调用 `processProject` 进行串行处理。

---

### `syncProjectGroup(pendingDirs: string[]): Promise<void>`

**Source**: `src/server/memory/scheduler.ts`:204-272

**Functionality**: 执行跨项目记忆同步。在所有项目各自处理完成后，将各项目的 `project-design.md` 聚合到 `Project_Group` 目录，然后调用 `backgroud-grouper` agent 进行跨项目分组分析，最终验证输出的 `project-groups.json` 合法性。

该函数实现了"个体处理 -> 跨项目聚合"的两级处理架构。聚合不仅包含当前批次的项目，还会读取 `Project_Group` 目录中遗留的 `Memory_*.md` 文件（来自之前失败的运行），确保数据不丢失。

**Parameters**:
- `pendingDirs` (`string[]`): 本轮扫描发现的待处理项目目录的绝对路径列表

**Return Value**: `Promise<void>`

**Core Logic**:
1. 复制 agents/skills 资源到 `~/.furina/memory/Project_Group/.claude`
2. 遍历 `pendingDirs`，将每个项目的 `project-design.md` 复制到 `Project_Group/{项目名}.md`
3. 读取 `Project_Group` 目录中所有 `Memory_*.md` 文件（包括历史残留）
4. 如果没有 `Memory_*.md` 文件，记录日志并返回
5. 调用 `executeClaudeGrouper()` 执行 grouper agent
6. 使用 `validateProjectGroupsFile()` 校验生成的 `project-groups.json`
7. 如果校验失败：删除无效的 `project-groups.json`，记录日志，返回（下次重试）
8. 校验通过：清理所有 `Memory_*.md` 聚合文件
9. finally 块中清理 `.claude` 目录

**Core Code**:
```typescript
async function syncProjectGroup(pendingDirs: string[]): Promise<void> {
  appendLog('Starting project group sync');

  const claudeDir = path.join(PROJECT_GROUP_DIR, '.claude');

  try {
    copyClaudeResources(claudeDir);

    for (const projectDir of pendingDirs) {
      const srcDesign = path.join(projectDir, 'project-design.md');
      if (!fs.existsSync(srcDesign)) {
        appendLog(`project-design.md not found for ${projectDir}, skipping`);
        continue;
      }
      const basename = path.basename(projectDir);
      const destMd = path.join(PROJECT_GROUP_DIR, `${basename}.md`);
      fs.cpSync(srcDesign, destMd);
      appendLog(`Aggregated: ${srcDesign} -> ${destMd}`);
    }

    let projectMdNames: string[];
    try {
      projectMdNames = fs.readdirSync(PROJECT_GROUP_DIR)
        .filter((entry) => entry.startsWith('Memory_') && entry.endsWith('.md'));
    } catch {
      appendLog('Could not read Project_Group directory, skipping grouper execution');
      return;
    }
    if (projectMdNames.length === 0) {
      appendLog('No Memory_*.md files found in Project_Group, skipping grouper execution');
      return;
    }

    await executeClaudeGrouper(PROJECT_GROUP_DIR, projectMdNames);

    const groupsJsonPath = path.join(PROJECT_GROUP_DIR, 'project-groups.json');
    const validation = validateProjectGroupsFile(groupsJsonPath);
    if (!validation.ok) {
      appendLog(`project-groups.json validation FAILED — rejecting output:\n${validation.error}`);
      try { fs.rmSync(groupsJsonPath); } catch {}
      appendLog('Deleted invalid project-groups.json, will retry on next schedule');
      return;
    }
    appendLog('project-groups.json schema validation passed');

    for (const mdName of projectMdNames) {
      const mdPath = path.join(PROJECT_GROUP_DIR, mdName);
      try {
        if (fs.existsSync(mdPath)) {
          fs.rmSync(mdPath);
          appendLog(`Cleaned up aggregated file: ${mdPath}`);
        }
      } catch (cleanupErr) {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        appendLog(`Failed to cleanup aggregated file ${mdPath}: ${msg}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`Group sync failed: ${message}`);
  } finally {
    tryCleanupClaude(claudeDir);
  }
}
```
Source: `src/server/memory/scheduler.ts`:204-272

**Usage Example**:
```typescript
// 在 startScheduler 的 cron 回调中，项目处理完成后调用
for (const projectDir of pendingDirs) {
  await processProject(projectDir);
}
await syncProjectGroup(pendingDirs);
```
Explanation: 所有项目各自处理完成后，执行跨项目聚合同步。

---

### `executeClaudeDesigner(designsDir: string, projectDir: string, designMdNames: string[]): Promise<void>`

**Source**: `src/server/memory/scheduler.ts`:97-108

**Functionality**: 构建并执行 Claude CLI 命令，调用 `backgroud-designer` agent 处理指定项目的设计文档。命令使用 `--add-dir` 将设计文档目录挂载到 Claude 的工作上下文中，使用 `--permission-mode bypassPermissions` 跳过权限确认，使用 `--agent backgroud-designer` 指定处理 agent。处理超时设为 10 分钟。

**Parameters**:
- `designsDir` (`string`): 设计文档目录的绝对路径，如 `~/.furina/memory/Memory_xxx/designs`
- `projectDir` (`string`): 项目根目录的绝对路径，作为 CLI 的工作目录（`cwd`）
- `designMdNames` (`string[]`): 设计文档的文件名列表（不含路径），如 `['my-feature.md', 'another-change.md']`

**Return Value**: `Promise<void>` - 成功时 resolve，失败时 reject（由调用方的 try-catch 处理）

**Core Logic**:
1. 将文件名列表用中文顿号 `、` 连接为提示文本
2. 构建 `claude` CLI 命令，包含所有必要参数
3. 使用 `execAsync` 异步执行，设置 10 分钟超时和 `windowsHide: true`

**Core Code**:
```typescript
async function executeClaudeDesigner(designsDir: string, projectDir: string, designMdNames: string[]): Promise<void> {
  const designMdList = designMdNames.join('、');
  const command = `claude --add-dir "${designsDir}" --agent backgroud-designer --permission-mode bypassPermissions -p "使用子代理：backgroud-designer 按照它的要求和步骤处理。变更设计文档列表为： ${designMdList}"`;
  appendLog(`Executing: ${command}`);
  await execAsync(command, {
    cwd: projectDir,
    timeout: 600000,
    env: process.env,
    windowsHide: true,
  });
  appendLog(`Claude execution succeeded: ${projectDir}`);
}
```
Source: `src/server/memory/scheduler.ts`:97-108

**Usage Example**:
```typescript
// 在 processProject 内部调用
await executeClaudeDesigner(designsDir, projectDir, designMdNames);
```
Explanation: `processProject` 在复制资源后调用此函数，让 Claude 处理设计文档并生成 project-design.md 和 project-portrait.md。

---

### `executeClaudeGrouper(projectsDir: string, projectMdNames: string[]): Promise<void>`

**Source**: `src/server/memory/scheduler.ts`:113-124

**Functionality**: 构建并执行 Claude CLI 命令，调用 `backgroud-grouper` agent 进行跨项目记忆分组。与 `executeClaudeDesigner` 类似但使用不同的 agent 和提示词。该命令在 `Project_Group` 目录下执行，读取聚合的 `Memory_*.md` 文件，生成 `project-groups.json`。

**Parameters**:
- `projectsDir` (`string`): 项目分组目录的绝对路径（`~/.furina/memory/Project_Group`），作为 CLI 的工作目录
- `projectMdNames` (`string[]`): 待处理的项目设计文档文件名列表，如 `['Memory_C__Users_foo.md', 'Memory_D__project.md']`

**Return Value**: `Promise<void>`

**Core Logic**:
与 `executeClaudeDesigner` 结构一致，区别在于使用 `backgroud-grouper` agent 和不同的提示文本。

**Core Code**:
```typescript
async function executeClaudeGrouper(projectsDir: string, projectMdNames: string[]): Promise<void> {
  const projectMdList = projectMdNames.join('、');
  const command = `claude --add-dir "${projectsDir}" --agent backgroud-grouper --permission-mode bypassPermissions -p "使用子代理：backgroud-grouper 按照它的要求和步骤处理。项目设计文档列表为： ${projectMdList}"`;
  appendLog(`Executing: ${command}`);
  await execAsync(command, {
    cwd: projectsDir,
    timeout: 600000,
    env: process.env,
    windowsHide: true,
  });
  appendLog(`Claude grouper execution succeeded: ${projectsDir}`);
}
```
Source: `src/server/memory/scheduler.ts`:113-124

**Usage Example**:
```typescript
// 在 syncProjectGroup 内部调用
await executeClaudeGrouper(PROJECT_GROUP_DIR, projectMdNames);
```
Explanation: 聚合完所有项目设计文档后，调用 grouper agent 生成跨项目分组。

---

### `copyClaudeResources(claudeDir: string): void`

**Source**: `src/server/memory/scheduler.ts`:84-92

**Functionality**: 将 `resources/agents` 和 `resources/skills` 目录递归复制到目标 `.claude` 目录。这确保 Claude CLI 在执行 agent 时能访问到所需的 agent 定义和 skill 配置。该函数在项目处理和项目分组两个流程中都会被调用。

**Parameters**:
- `claudeDir` (`string`): 目标 `.claude` 目录的绝对路径

**Return Value**: `void` - 同步操作

**Core Code**:
```typescript
function copyClaudeResources(claudeDir: string): void {
  const srcAgents = path.join(resourcesDir, 'agents');
  const destAgents = path.join(claudeDir, 'agents');
  fs.cpSync(srcAgents, destAgents, { recursive: true });

  const srcSkills = path.join(resourcesDir, 'skills');
  const destSkills = path.join(claudeDir, 'skills');
  fs.cpSync(srcSkills, destSkills, { recursive: true });
}
```
Source: `src/server/memory/scheduler.ts`:84-92

---

### `hasNonEmptyDesigns(memorySubDir: string): boolean`

**Source**: `src/server/memory/scheduler.ts`:71-79

**Functionality**: 判断一个内存子目录的 `designs/` 子目录是否存在且包含至少一个 `.md` 文件。这是扫描阶段的核心过滤函数，用于识别有待处理设计文档的目录。如果 `designs/` 目录不存在或为空，返回 `false`。

**Parameters**:
- `memorySubDir` (`string`): 内存子目录的绝对路径，如 `~/.furina/memory/Memory_xxx`

**Return Value**: `boolean` - `true` 表示存在非空的 designs 目录

**Core Logic**:
1. 拼接 `designs` 子目录路径
2. 使用 `readdirSync` 读取目录内容
3. 检查是否有任何条目以 `.md` 结尾
4. 读取失败（目录不存在等）时静默返回 `false`

**Core Code**:
```typescript
function hasNonEmptyDesigns(memorySubDir: string): boolean {
  const designsDir = path.join(memorySubDir, 'designs');
  try {
    const entries = fs.readdirSync(designsDir);
    return entries.some((entry) => entry.endsWith('.md'));
  } catch {
    return false;
  }
}
```
Source: `src/server/memory/scheduler.ts`:71-79

---

### `tryCleanupDesigns(projectDir: string, designMdPaths: string[]): void`

**Source**: `src/server/memory/scheduler.ts`:130-150

**Functionality**: 条件清理已处理的设计文件。只有当 `project-design.md` 和 `project-portrait.md` **都**存在时才删除原始设计文件，这表示 Claude CLI 已成功完成设计处理。如果任一输出文件缺失，说明处理可能不完整，保留设计文件以便下次重试。

该函数体现了"先验证再清理"的安全策略，避免因 Claude 执行部分失败而丢失设计文档。

**Parameters**:
- `projectDir` (`string`): 项目目录的绝对路径，用于检查 `project-design.md` 和 `project-portrait.md` 是否存在
- `designMdPaths` (`string[]`): 待清理的设计文件的绝对路径列表

**Return Value**: `void`

**Core Logic**:
1. 检查 `project-design.md` 和 `project-portrait.md` 是否同时存在
2. 若都存在：逐一删除设计文件，记录日志；单个文件删除失败不中断其他文件的清理
3. 若不全存在：记录日志，跳过清理

**Core Code**:
```typescript
function tryCleanupDesigns(projectDir: string, designMdPaths: string[]): void {
  const projectDesignExists = fs.existsSync(path.join(projectDir, 'project-design.md'));
  const projectPortraitExists = fs.existsSync(path.join(projectDir, 'project-portrait.md'));
  if (projectDesignExists && projectPortraitExists) {
    for (const mdPath of designMdPaths) {
      try {
        if (fs.existsSync(mdPath)) {
          fs.rmSync(mdPath);
          appendLog(`Cleaned up design file: ${mdPath}`);
        }
      } catch (cleanupErr) {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        appendLog(`Failed to cleanup design file ${mdPath}: ${msg}`);
      }
    }
  } else {
    appendLog(
      `Skipping designs cleanup: project-design.md=${projectDesignExists}, project-portrait.md=${projectPortraitExists}`,
    );
  }
}
```
Source: `src/server/memory/scheduler.ts`:130-150

---

### `tryCleanupClaude(claudeDir: string): void`

**Source**: `src/server/memory/scheduler.ts`:155-165

**Functionality**: 删除项目的 `.claude` 临时资源目录。该目录是在处理过程中由 `copyClaudeResources` 创建的，包含 agents 和 skills 副本，处理完成后应被清理。使用 `recursive: true` 和 `force: true` 确保强制递归删除，删除失败时记录日志但不抛出异常。

**Parameters**:
- `claudeDir` (`string`): `.claude` 目录的绝对路径

**Return Value**: `void`

**Core Code**:
```typescript
function tryCleanupClaude(claudeDir: string): void {
  try {
    if (fs.existsSync(claudeDir)) {
      fs.rmSync(claudeDir, { recursive: true, force: true });
      appendLog(`Cleaned up .claude: ${claudeDir}`);
    }
  } catch (cleanupErr) {
    const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
    appendLog(`Failed to cleanup .claude ${claudeDir}: ${msg}`);
  }
}
```
Source: `src/server/memory/scheduler.ts`:155-165

## Data Structures

### 模块级变量

```typescript
const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.resolve(moduleDirname, '..', '..', '..', 'resources');
```
- `moduleDirname` (`string`): 当前模块编译后文件的所在目录，用于相对路径解析
- `resourcesDir` (`string`): 资源目录的绝对路径，指向 `dist/resources/`（编译产物结构为 `dist/server/memory/scheduler.js` -> 三级向上到 `dist/resources`）

```typescript
const MEMORY_DIR = path.join(os.homedir(), '.furina', 'memory');
```
- `MEMORY_DIR` (`string`): 全局内存根目录 `~/.furina/memory/`，所有 `Memory_*` 项目目录的父目录

```typescript
const PROJECT_GROUP_DIR = path.join(MEMORY_DIR, 'Project_Group');
```
- `PROJECT_GROUP_DIR` (`string`): 跨项目记忆分组工作目录 `~/.furina/memory/Project_Group/`，用于存放聚合的项目设计文档和最终的 `project-groups.json`

```typescript
let cronTask: cron.ScheduledTask | null = null;
```
- `cronTask` (`cron.ScheduledTask | null`): 当前已注册的 cron 任务实例。`null` 表示调度器未运行。该变量是调度器生命周期管理的核心状态，`startScheduler` 将其赋值，`stopScheduler` 将其置为 `null`。

### `cron.ScheduledTask`

来自 `node-cron` 库的类型，表示已注册的 cron 定时任务。提供以下方法：
- `start()`: 启动任务调度
- `stop()`: 停止任务调度
- `destroy()`: 销毁任务实例，释放底层资源

## Error Handling and Edge Cases

### 错误处理策略

调度器采用"记录日志、静默失败、不中断主流程"的错误处理策略：

1. **配置读取失败（`readCronFromConfig`）**：所有异常被 catch 捕获，回退到默认 cron 表达式 `'0 2 * * *'`，不影响调度器启动。

2. **内存目录读取失败（cron 回调中）**：如果 `readdirSync(MEMORY_DIR)` 失败，记录日志后直接返回，等待下次 cron 触发。

3. **单个设计目录读取失败（`processProject`）**：如果 `designs/` 目录不存在，记录日志后跳过该项目。

4. **Claude CLI 执行失败（`executeClaudeDesigner` / `executeClaudeGrouper`）**：超时 10 分钟或命令执行失败时抛出异常，被 `processProject`/`syncProjectGroup` 的 try-catch 捕获，记录错误日志后继续处理下一个项目。

5. **设计文件清理失败（`tryCleanupDesigns`）**：单个文件删除失败时记录日志但不中断其他文件的清理。

6. **`.claude` 目录清理失败（`tryCleanupClaude`）**：在 finally 块中执行，确保无论成功失败都会尝试清理；失败时记录日志但不抛出异常。

7. **project-groups.json 校验失败（`syncProjectGroup`）**：Zod schema 验证失败时删除无效文件，记录日志，等待下次 cron 触发重试。这是一种"最终一致性"策略。

### 关键边界条件

- **幂等启动/停止**：`startScheduler` 和 `stopScheduler` 都有幂等保护，多次调用不会出错
- **串行处理**：项目目录按串行顺序处理，避免并发 Claude CLI 调用导致资源竞争
- **finally 保证清理**：`.claude` 目录的清理在 finally 块中执行，确保即使 Claude 执行失败也能清理临时资源
- **遗留数据处理**：`syncProjectGroup` 读取 `Project_Group` 目录中所有 `Memory_*.md` 文件（包括前次运行失败遗留的），确保数据不丢失

## Dependencies

### Depends on

- **`node-cron`**：提供 `cron.schedule()` 和 `ScheduledTask` 类型，是调度器的定时任务基础设施
- **`child_process`**：提供 `exec`（通过 `promisify` 转为 `execAsync`），用于执行 Claude CLI 命令
- **`fs` / `os` / `path`**：Node.js 内置模块，用于文件系统操作、获取用户主目录、路径拼接
- **`schedule-logger`**（`src/server/memory/schedule-logger.ts`）：提供 `appendLog()` 用于记录调度器操作日志
- **`project-group-schema`**（`src/server/memory/project-group-schema.ts`）：提供 `validateProjectGroupsFile()` 用于验证 grouper 输出
- **`resources/agents` 和 `resources/skills`**：Claude CLI 执行所需的 agent 定义和 skill 配置文件
- **`resources/furina.json`**：调度器配置文件，提供 cron 表达式

### Depended by

- **`entry.ts`**（`src/server/entry.ts`）：服务器启动/关闭流程中调用 `startScheduler()` / `stopScheduler()`
- **`routes/schedule.ts`**（`src/server/routes/schedule.ts`）：REST API 路由暴露调度器生命周期控制（PUT 启动、DELETE 停止、POST restart）
- **`sync-design.ts`**（`src/server/memory/sync-design.ts`）：虽然不直接导入 scheduler 模块，但通过 HTTP PUT 调用 `/furina/api/schedule` 间接触发 `startScheduler()`

## Usage Examples

### 完整使用场景：服务器启动与关闭

```typescript
// === entry.ts 中的使用方式 ===

import { createApp } from './index.js';
import { startScheduler, stopScheduler } from './memory/scheduler.js';

const port = process.env.FURINA_UI_PORT
  ? parseInt(process.env.FURINA_UI_PORT, 10)
  : 3939;

let server: http.Server;

const app = createApp({
  beforeProxy: (app) => {
    // 注册关闭路由，在关闭前停止调度器
    app.post('/furina/api/shutdown', (_req, res) => {
      res.json({ ok: true });
      stopScheduler();  // 确保 cron 任务在进程退出前停止
      server.close(() => process.exit(0));
    });
  },
});

server = app.listen(port, () => {
  startScheduler();  // 服务器启动后自动注册并启动 cron 任务
});
```

Explanation:
1. 服务器启动后立即调用 `startScheduler()`，读取配置并注册 cron 任务
2. 默认每天凌晨 2:00 触发一次扫描
3. 如果配置文件中设置了 `enhancement.memory.schedule`，使用自定义 cron 表达式
4. 服务器关闭时先调用 `stopScheduler()` 停止 cron 任务，再关闭 HTTP 服务器

### REST API 控制调度器

```typescript
// === routes/schedule.ts 中的使用方式 ===

import { startScheduler, stopScheduler, isSchedulerRunning } from '../memory/scheduler.js';

// PUT /furina/api/schedule - 幂等启动
scheduleRouter.put('/', (_req, res) => {
  if (isSchedulerRunning()) {
    res.status(200).json({ ok: true, started: false });
    return;
  }
  startScheduler();
  res.status(200).json({ ok: true, started: true });
});

// DELETE /furina/api/schedule - 停止
scheduleRouter.delete('/', (_req, res) => {
  if (isSchedulerRunning()) {
    stopScheduler();
    res.status(200).json({ ok: true, stopped: true });
    return;
  }
  res.status(200).json({ ok: true, stopped: false });
});

// POST /furina/api/schedule/restart - 重启
scheduleRouter.post('/restart', (_req, res) => {
  stopScheduler();
  startScheduler();
  res.status(200).json({ ok: true, restarted: true });
});
```

Explanation: REST API 提供三个端点控制调度器生命周期。PUT 是幂等的（已运行则不重复启动），DELETE 同理，restart 先停再启。`isSchedulerRunning()` 用于查询状态避免无效操作。

### 配置文件示例

```json
// resources/furina.json
{
  "enhancement": {
    "memory": {
      "schedule": "30 1 * * *"
    }
  }
}
```

Explanation: 设置调度器在每天凌晨 1:30 执行。如果不配置或配置路径上任何一级缺失，回退到默认的 `0 2 * * *`（凌晨 2:00）。
