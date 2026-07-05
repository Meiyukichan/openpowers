# Toc Sync Subagent Template

Dispatch the `Toc Sync Subagent` strictly according to the following parameter format:

```
Agent tool (general-purpose):
  description: "Sync toc indices after spec changes"
  prompt: |
    You are updating index files (toc.md) after incremental spec changes in codebase of project.

    ## Output language
    {`language`}

    ## Project Directory
    {projectDir}

    ## Codebase Directory
    {codebaseDir} --- root directory of codebase.

    ## Change Information
    - Changed spec paths: {list of spec file paths under codebaseDir that were created, updated, or deleted}
    - Operation types per spec: {add-spec | update-spec | delete-spec}
    - Structural changes: {none | add-submodule: {details} | delete-submodule: {details}}
    - Source files involved: {list of source file paths}

    ## Execution Flow
    Follow these steps strictly and accurately in **bottom-up order**:

    1. You **MUST** read `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/guidance-codebase.md`, and then comprehensively understand the concepts, constraints, and content requirements of **Module, Module Index File, Submodule, Submodule Index File, and Spec Document**.
    2. You **MUST** read `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/guidance-toc-incremental.md` for the detailed toc.md format specification and update rules.
    3. Read **ALL** changed spec files listed in Change Information to thoroughly understand their content, responsibilities, and key interfaces.
    4. **Bottom-up Phase 1 — Update Submodule toc.md**:
       - Identify which submodule toc.md files are affected by the changes.
       - Read each affected submodule toc.md.
       - For add-spec: add a new row to the Spec Documents table with detailed description and source file paths.
       - For update-spec: update the corresponding row's description and/or source file paths.
       - For delete-spec: remove the corresponding row.
       - Update the Spec Relationship Diagram if dependencies changed.
       - **Only modify entries related to the changes. Preserve all unrelated entries unchanged.**
    5. **Bottom-up Phase 2 — Update Module toc.md**:
       - Identify which module toc.md files are affected (modules containing changed submodules or direct specs).
       - Read each affected module toc.md.
       - For changes to submodule specs: update the submodule's spec count and description if needed.
       - For changes to direct specs: add/update/delete rows in the Direct Spec Documents table.
       - Update the Module Relationship Diagram if dependencies changed.
       - **Only modify entries related to the changes. Preserve all unrelated entries unchanged.**
    6. **Bottom-up Phase 3 — Update Root toc.md**:
       - Read root `{codebaseDir}/toc.md`.
       - Update the corresponding module entry's submodule descriptions, spec descriptions, and counts.
       - **Only modify entries related to the changes. Preserve all unrelated entries unchanged.**
    7. **Structural Changes** (if any) — index updates only; directory creation, file moves, and deletion are already handled in Phase 3:
       - add-submodule: create a new submodule `toc.md` from scratch using the format template `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/template-submodule-toc.md`, including all specs that were moved into the new submodule.
       - delete-submodule: after specs are promoted to the module directory (done in Phase 3), update the module toc.md accordingly (remove submodule row, add promoted specs as direct specs).

    ## Key Rules
    1. **No scripts.** All analysis and generation is done by directly reading spec and source files. Do not write or execute auxiliary scripts.
    2. **Bottom-up order is mandatory.** submodule toc.md → module toc.md → root toc.md. Each level's descriptions must be consistent with the level below.
    3. **Only update changed entries.** Do not rewrite entire toc.md files. Use precise edits — only add, modify, or delete lines related to the changes. Preserve all unrelated entries unchanged.
    4. **Each entry description must be detailed:** responsibilities, coverage scope, key features — not just a name. Descriptions should be 2-4 sentences.
    5. **Descriptions must support retriever navigation.** Given a query, a user should be able to navigate: root toc → module toc → submodule toc → correct spec document.
    6. **Index files ≤ 500 lines.** Check line count after updates; if approaching the limit, condense descriptions without losing key navigation information.
    7. **Spec counts must be accurate.** Recount actual spec files after structural changes.
    8. **Relationship diagrams must be updated** if the changes affect dependencies between specs or submodules.
```
