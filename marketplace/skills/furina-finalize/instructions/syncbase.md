# Git-Sync Instruction

Read staged file changes, group changes under the `main source directory` by module and calls `furina-codebase` to sync the codebase.

## Instruction Configuration

Call the following script to get the `instruction configuration`:

```bash
furina config show project.sourcecode project.codebase.enable project.codebase.path
```

- `project.sourcecode`: `main source directory` of this project
- `project.codebase.enable`: whether to call `furina-codebase` to sync the codebase
- `project.codebase.path`: path of project codebase

## Instruction Execution Stages

Follow the stages below strictly in order, do not skip or merge.

### Stage 1: Get Changed File List

- Run Bash command: `git diff --staged --name-only`

If there are no changed files (list is empty), output "No changed files detected, no commit needed" and end the workflow.

### Stage 2: Path Grouping

if `project.codebases.enable != true`, directly end this instruction.

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

### Stage 3: Call furina-codebase to Sync Codebase

For each group from Stage 2, **serially invoke** the sync codebase subagent using the Task tool with the following template (`Furina:finalize:Purpose` is the critical description marker of `sync codebase subagent`, do NOT mistake it):

```
Agent tool (general-purpose):
  description: "Furina:finalize:Purpose Sync [group brief description] codebase"
  prompt: |
    You are syncing the codebase for [group brief description]

    ## Current Project Directory
    {cwd}

    ## Work steps
    1. Call Skill: furina-codebase with the following arguments:
       - `codebaseDir`: {`project.codebase.path`}
       - `instruction`: synchronize
       - `Modified file paths`: [all file paths in this group, comma separated]
       - `Change description`: [group brief description]
    2. Ignore the skill's return value, whether success or failure
```

**Must execute serially**: wait for one group's invocation to complete before invoking the next group, parallel invocation is forbidden.

Wait for all groups to complete before proceeding to the next stage.

> **Note**: Changed files not under the `main source directory` do not need furina-codebase, but must still be included in the subsequent git commit.

## Key Rules

1. **Serial invocation**. Each group's furina-codebase-sync call must be serial, never parallel.
2. **Grouping granularity**. Prefer second-level directory grouping; if a group has too few files (≤2) and has a third-level directory, subdivide by third-level directory.
