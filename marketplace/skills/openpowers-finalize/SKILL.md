---
name: openpowers-finalize
description: >
  Automated Git commit skill. Reads current workspace changes, groups by path and calls skill openpowers-codebase-sync to sync the codebase,
  then executes git add, commit, push to complete a full code save workflow.
  Trigger: when user says "save code", "save git", "auto commit", "commit code", "git save".
  No input parameters required, just invoke directly.
---

# Save Git — Automated Git Commit + Codebase Sync

Reads current workspace file changes, groups changes under the `main source directory` by module and calls `openpowers-codebase-sync` to sync the codebase,
then executes `git add .` → `git commit` → `git push` to complete a full code save workflow.

**No input parameters required**, just run directly.

## Execution Stages

Follow the stages below strictly in order, do not skip or merge.

### Stage 1: Get Changed File List

1. Run Bash command: `git status -uall`
2. Parse output, extract three types of changes:
   - **modified files**: Extract `modified:` lines from `Changes not staged for commit:` area
   - **deleted files**: Extract `deleted:` lines from `Changes not staged for commit:` area
   - **added files (untracked)**: Extract from `Untracked files:` area (lines without `modified:`/`deleted:` prefix)

   > Note: Ignore content under `Changes to be committed:` area, only process the two areas above.

3. Organize all changed files into a list, recording each file's change type (modified / deleted / added).

If there are no changed files (list is empty), output "No changed files detected, no commit needed" and end the workflow.

### Stage 2: Path Grouping

Call the following script to get the `main source directory`:

```bash
openpowers config show project.sourcecode
```

For all files in the change list starting with the `main source directory`, group by the following rules:

1. Extract the second-level directory (`{main source directory}/xxx/...` → `xxx`)
2. If a second-level directory has ≤ 2 files and has a third-level directory (`{main source directory}/xxx/yyy/...`), further subdivide by the third-level directory `yyy` (use `{main source directory}/xxx/yyy` as the group key)
3. Files not under the `main source directory` do not participate in grouping, but are recorded in the change summary

**Grouping example**:

```
Main source directory: src/

File list:
  src/electron/main/ipc/handler.ts
  src/electron/main/ipc/registry.ts
  src/electron/preload/index.ts
  src/renderer/components/App.vue
  docs/design/PROPOSAL.md

Grouping result:
  Group 1 (src/electron/main/ipc): handler.ts, registry.ts
  Group 2 (src/electron/preload): index.ts
  Group 3 (src/renderer/components): App.vue
  Other: docs/design/PROPOSAL.md
```

### Stage 3: Call openpowers-codebase-sync to Sync Codebase

For each group from Stage 2, **serially invoke** the sync codebase sub-agent using the Task tool with the following template:

```
Task tool (general-purpose):
  description: "Sync [group brief description] codebase"
  prompt: |
    You are syncing the codebase for [group brief description]

    ## Changed file list
    [all file paths in this group with their change types, comma separated]

    ## Work steps
    1. Call Skill: openpowers-codebase-sync to update codebases
    2. Ignore the skill's return value, whether success or failure
```

**Must execute serially**: wait for one group's invocation to complete before invoking the next group, parallel invocation is forbidden.

3. Wait for all groups to complete before proceeding to the next stage.

> **Note**: Changed files not under the `main source directory` do not need openpowers-codebase-sync, but must still be included in the subsequent git commit.

### Stage 4: Git Commit

1. Run Bash command: `git add .`
2. Generate a concise commit summary based on all changed files from Stage 1:
   - Count how many modified / deleted / added files
   - Extract key module information from changed file paths
   - Generate a concise commit message, format: `update xxx module: modified N files`
3. Run Bash command: `git commit -m "{commit message}"`
4. Run Bash command: `git push`

## Key Rules

1. **No input parameters**. This skill accepts no external input; all information is obtained from `git status`.
2. **Serial invocation**. Each group's openpowers-codebase-sync call must be serial, never parallel.
3. **Change type distinction**. modified and deleted only from `Changes not staged for commit:` area; added only from `Untracked files:` area. Ignore `Changes to be committed:` area.
4. **Grouping granularity**. Prefer second-level directory grouping; if a group has too few files (≤2) and has a third-level directory, subdivide by third-level directory.
5. **Complete commit workflow**. Must include add → commit → push all three steps, no omissions.
