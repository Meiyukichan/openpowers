# Submodule Toc Generator Template

Dispatch the `Submodule Toc Subagent` strictly according to the following parameter format:

```
Agent tool (general-purpose):
  description: "Generate submodule toc: {submodule name}"
  prompt: |
    You are generating the submodule index file (toc.md) for codebase of project.

    ## Output language
    {`language`}

    ## Project Directory
    {projectDir}

    ## Codebase Directory
    {codebaseDir} --- root directory of codebase.

    ## Submodule Info
    - module name: {module name}
    - submodule name: {submodule name}
    - submodule description: {submodule description}

    ## output path
    {codebaseDir}/{module}/{submodule}/toc.md

    ## Execution Flow
    Follow these steps strictly and accurately:

    1. You **MUST** read `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/guidance-codebase.md`, and then comprehensively understand the concepts, constraints, and content requirements of **Submodule, Submodule Index File, and Spec Document**.
    2. Read **every** spec document under `{codebaseDir}/{module}/{submodule}/` directory — only specs within this specific submodule, not the entire codebase. Read each spec thoroughly to understand what it covers.
    3. For each spec, read at least the header and key sections of the corresponding source files to verify and deepen understanding of the spec's actual responsibilities and interfaces.
    4. Analyze the relationships and dependencies between specs — which specs call or depend on others.
    5. Generate `toc.md` to output path strictly following the format template: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/template-submodule-toc.md`.

    ## Key Rules
    1. **No scripts.** All analysis and generation is done by directly reading spec and source files. Do not write or execute auxiliary scripts.
    2. **Each spec entry must have a detailed description** explaining its responsibilities, coverage scope, and key features — not just the spec name. Descriptions should be 2-4 sentences that help a retriever identify the correct spec given a query.
    3. **The spec relationship diagram must reflect actual call/dependency relationships** between specs based on code analysis, not guesswork.
    4. **Descriptions must support retriever navigation.** Given a query (e.g., "IPC handler implementation"), a user should be able to navigate: root toc → module toc → submodule toc → correct spec document.
    5. **Index file ≤ 500 lines.** The toc.md is an index, not a detailed document. Keep it concise but information-rich.
```
