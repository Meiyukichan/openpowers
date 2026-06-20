## Codebases Exploration

Phase 3 skipped: project.codebases.enable is false and project.codebases.path (`docs/codebases`) does not exist on disk. Proceeded directly to Phase 4 supplementary exploration.

## Project Supplementary Exploration

### 1. Understanding the Request in Context

The user wants to extend `src/server/memory/scheduler.ts` so that, after the existing `await processProject(projectDir);` loop completes for all pending project memory directories, an additional "project-group memory sync" pass runs. The new pass should:

- Operate only when `pendingDirs` is non-empty.
- Mirror `copyClaudeResources` to copy `resources/agents` and `resources/skills` into `~/.openpowers/memory/Project_Group/.claude/`.
- For each `pendingDirs` element, copy its `project-design.md` to `~/.openpowers/memory/Project_Group/{pendingDirName}.md`.
- Build a list of `Memory_*` md filenames in `~/.openpowers/memory/Project_Group/` and invoke a `claude --add-dir ... --agent backgroud-grouper` command analogous to `executeClaudeDesigner`.
- Delete the listed md files once the command finishes.

### 2. Key Code Locations Examined

#### `src/server/memory/scheduler.ts` (the target file)

- **Imports / setup (lines 11-28)**: imports `cron`, `child_process.exec` (promisified as `execAsync`), `fs`, `os`, `path`, `fileURLToPath`. Resolves `resourcesDir` as `path.resolve(moduleDirname, '..', '..', '..', 'resources')`. Sets `MEMORY_DIR = path.join(os.homedir(), '.openpowers', 'memory')`.

- **`copyClaudeResources(claudeDir)` (lines 80-88)**: Copies `resourcesDir/agents` → `claudeDir/agents` and `resourcesDir/skills` → `claudeDir/skills` via `fs.cpSync(..., { recursive: true })`. This is the exact pattern to replicate for `~/.openpowers/memory/Project_Group/.claude`.

- **`executeClaudeDesigner(designsDir, projectDir, designMdNames)` (lines 93-104)**: Builds a command string of the form:
  ```
  claude --add-dir "${designsDir}" --agent backgroud-designer --permission-mode bypassPermissions -p "使用子代理：backgroud-designer 按照它的要求和步骤处理。变更设计文档列表为： ${designMdList}"
  ```
  Then `appendLog(...)` and `await execAsync(command, { cwd: projectDir, timeout: 600000, env: process.env, windowsHide: true })`. On success logs `Claude execution succeeded: ${projectDir}`.

- **`processProject(projectDir)` (lines 151-177)**: Per-project pipeline — copies resources, executes the claude command, conditionally cleans `designs/` files (only if both `project-design.md` and `project-portrait.md` exist), and unconditionally cleans `.claude/` in a `finally`.

- **Cron callback body (lines 196-227)**: The full `startScheduler()` cron callback.
  1. Reads `MEMORY_DIR` entries.
  2. Builds `pendingDirs` by filtering: directory AND name starts with `Memory_` AND `hasNonEmptyDesigns(subDir)` is true (lines 67-75).
  3. If empty, returns early with log "Scheduler: no directories with pending designs found".
  4. Otherwise, serially `await processProject(projectDir);` for each pending directory.
  5. Logs `Scheduler task finished`.

  This is the precise insertion point for the new project-group sync step — immediately after the for-loop on lines 222-224.

#### `src/server/memory/schedule-logger.ts`

- `appendLog(message)` writes timestamped lines to `~/.openpowers/memory/dreamwork.log`, creating the dir if missing. Used throughout `scheduler.ts`.

#### `src/server/memory/sync-design.ts`

- `syncDesignToMemory(changeName, cwd)`: existing helper that copies a single change's `design.md` to `~/.openpowers/memory/{flatCwd}/designs/{changeName}.md`, then PUTs `/openpowers/api/schedule` to ensure the scheduler is running. Demonstrates the established pattern of where change designs land in `~/.openpowers/memory/`.

#### `src/utils/memory.ts`

- `flattenCwdPath(cwd)` (lines 33-35): produces the `Memory_<sanitized-path>` directory name used by `syncDesignToMemory`. This explains why `pendingDirs` entries already carry names like `Memory_D__project-code_llm_openpowers`, which matches the naming convention the new code should reuse.

#### `resources/openpowers.json`

- Currently `enhancement.memory.schedule = "0 21 * * *"`. No memory-related config keys beyond `schedule` exist today.

#### `resources/agents/backgroud-designer.md` (existing reference agent)

- YAML frontmatter: `name: backgroud-designer`, `description` (zh), `tools: Read, Grep, Glob, Bash, Edit, Write`, `skills: compose-design`. Invokes skill `compose-design` to merge change design docs into a main project design.

#### `resources/agents/backgroud-grouper.md` (the target agent)

- YAML frontmatter: `name: backgroud-grouper`, `description: "仅在用户明确说\"使用 backgroud-grouper\"时触发。"`, `tools: Read, Grep, Glob, Bash, Edit, Write`, `skills: group-design`.
- Body describes the agent as: identifies commonalities across a batch of design documents, delimits **project groups**, transforms architectural intuition into quantifiable similarity + explainable portraits.
- Input: `设计文档列表` (required) — list of design documents to merge/group.
- Execution: strictly follow steps starting with "调用技能：group-design".

#### `resources/skills/group-design/SKILL.md`

- Detailed skill spec for clustering design docs into project groups via multi-dimensional weighted similarity (business domain 0.30, user journey 0.25, core entities 0.20, tech keywords 0.15, organization 0.10).
- Outputs two artifacts (written to current project root):
  - `项目群设计总览.md` — aggregated Markdown overview.
  - `project-groups.json` — registry of project groups (version, lastUpdated, groups[] with `projectGroup`, `projectDesc`, `projectPortrait`, `members`, `tags`, `status`).
- Contains extensive rules on incremental updates vs. full generation,粒度控制 (max 7 members per group), portrait quality criteria, and red lines.

#### `src/server/memory/scheduler.test.ts`

- Tests for `startScheduler`, `stopScheduler`, `isSchedulerRunning`, and the cron callback's directory scanning, copy, claude execution, cleanup behavior, dynamic cron from config, etc. None of these tests cover a project-group sync step today — they would all need new test cases if the change is implemented.

### 3. Reference Project Exploration

- `project.repositories[0].path = "./openpowers/"` (description: location of OpenPowers changes, archived + ongoing).
- The referenced directory `D:/project-code/llm/openpowers/openpowers/` contains only `archive/`, `changes/`, and `changes.json`.
- `openpowers/changes/` currently contains only the empty `memory-group-sync/` subdirectory (no `design.md`, `proposal.md`, etc. inside it yet — confirmed via `ls -la`).
- No other ongoing OpenPowers change contains relevant implementation context for this exploration.

### 4. Other Context Touched

- `src/server/routes/schedule.ts` exposes PUT/DELETE/POST endpoints that wrap `startScheduler`/`stopScheduler`. Not directly relevant to the new memory feature, but confirms how the scheduler is triggered (HTTP PUT from `syncDesignToMemory`).
- `package.json` and `docs/codebases/` are absent or empty per the config, so no codebases integration to query.

### 5. Summary of Files Directly Related to the Request

- **Target for modification**: `D:/project-code/llm/openpowers/src/server/memory/scheduler.ts` (lines 222-224 are the insertion point after the `for (const projectDir of pendingDirs) { await processProject(projectDir); }` loop, inside the cron callback).
- **Existing functions to mirror**:
  - `copyClaudeResources(claudeDir)` at lines 80-88 — use to populate `~/.openpowers/memory/Project_Group/.claude`.
  - `executeClaudeDesigner(designsDir, projectDir, designMdNames)` at lines 93-104 — use as the template for the new `executeClaudeGrouper(projectsDir, projectsMdNames)` (analog). Note differences: target dir name is `~/.openpowers/memory/Project_Group`, agent is `backgroud-grouper`, prompt wording is "项目设计文档列表为：" rather than "变更设计文档列表为：".
- **New file/agent references**:
  - `D:/project-code/llm/openpowers/resources/agents/backgroud-grouper.md` (already exists).
  - `D:/project-code/llm/openpowers/resources/skills/group-design/SKILL.md` (already exists).
- **Logging helper**: `appendLog` from `D:/project-code/llm/openpowers/src/server/memory/schedule-logger.ts`.
- **Naming utility**: `flattenCwdPath` from `D:/project-code/llm/openpowers/src/utils/memory.ts` explains why existing pending dirs already carry `Memory_*` names.
- **Existing sync entry point**: `syncDesignToMemory` in `D:/project-code/llm/openpowers/src/server/memory/sync-design.ts` shows the `~/.openpowers/memory/{flatCwd}/designs/{changeName}.md` destination pattern.
- **Empty change folder**: `D:/project-code/llm/openpowers/openpowers/changes/memory-group-sync/` exists but has no artifacts yet.
- **Tests to update**: `D:/project-code/llm/openpowers/src/server/memory/scheduler.test.ts` will need new cases for the project-group sync step (none exist today).
