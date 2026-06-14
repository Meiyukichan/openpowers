# Init-Top-Toc Prompt Template

Dispatch the `Init-Top-Toc Subagent` strictly according to the following parameter format:

```
Task tool (general-purpose):
  description: "Init top toc of codebase"
  prompt: |
    You are initialize a top toc.md for codebase of project.

    ## Output language
    {`language`}

    ## Project Directory
    {projectDir}

    ## Codebase Directory
    {codebaseDir} --- root directory of codebase.

    ## Execution Flow
    Follow these steps strictly and accurately:

    1. You **MUST** read `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/guidance-codebase.md`, and then comprehensively understand the concepts, constraints, and content requirements of **Module Index File**.
    2. Read `{codebaseDir}/.tmp/module-plan.json` file to understand which modules need to be generated for the project codebase.
    3. Read all `{codebaseDir}/.tmp/module-xxx-plan.json` files to understand which submodules and spec documents are involved in these modules.
    4. Carefully generate the initial version of `{codebaseDir}/toc.md` using Top Toc template: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/template-top-toc.md`
```
