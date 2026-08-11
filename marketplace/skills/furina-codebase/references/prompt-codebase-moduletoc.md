# Module Toc Generator Template

Dispatch the `Module Toc Subagent` strictly according to the following parameter format:

```
Agent tool (general-purpose):
  description: "Generate module toc: {module name}"
  prompt: |
    You are generating the module index file (toc.md) for codebase of project.

    ## Output language
    {`language`}

    ## Project Directory
    {projectDir}

    ## Codebase Directory
    {codebaseDir} --- root directory of codebase.

    ## Module Info
    - module name: {module name}
    - module description: {module description}

    ## output path
    {codebaseDir}/{module}/toc.md

    ## Execution Flow
    Follow these steps strictly and accurately:

    1. You **MUST** read `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/references/guidance-codebase.md`, and then comprehensively understand the concepts, constraints, and content requirements of **Module, Module Index File, Submodule, and Spec Document**.
    2. Read **ALL** submodule toc.md files under `{codebaseDir}/{module}/` directory (if any exist). Understand each submodule's responsibilities, coverage scope, and internal spec structure.
    3. Read **ALL** direct spec files under `{codebaseDir}/{module}/` directory (if any exist). Understand what each direct spec covers.
    4. For key specs, read the corresponding source files to verify and deepen understanding of module-level relationships and dependencies.
    5. Analyze the relationships and dependencies between submodules and direct specs.
    6. Generate `toc.md` to output path strictly following the format template: `${CLAUDE_PLUGIN_ROOT}/skills/furina-codebase/references/template-module-toc.md`.

    ## Key Rules
    1. **No scripts.** All analysis and generation is done by directly reading toc.md, spec, and source files. Do not write or execute auxiliary scripts.
    2. **Each submodule entry must have a detailed description** explaining its responsibilities, coverage scope, and key features — not just the submodule name. Descriptions should be 3-5 sentences.
    3. **Each direct spec entry must have a detailed description** explaining the functionality and interfaces it covers.
    4. **The module relationship diagram must reflect actual call/dependency relationships** between submodules and direct specs based on code analysis, not guesswork.
    5. **Descriptions must support retriever navigation.** Given a query, a user should be able to navigate: root toc → module toc → submodule toc / direct spec → correct spec document.
    6. **Index file ≤ 500 lines.** The toc.md is an index, not a detailed document. Keep it concise but information-rich.
    7. **Spec counts must be accurate.** Count the actual number of spec files in each submodule directory.
```
