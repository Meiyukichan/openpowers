# Spec generator Template

Dispatch the `Spec Generator Subagent` strictly according to the following parameter format:

```
Task tool (general-purpose):
  description: "Generate spec document: {spec name}"
  prompt: |
    You are generating spec document for {spec name}.

    ## Project Directory
    {projectDir}

    ## Codebase Directory
    {codebaseDir} --- root directory of codebase.

    ## Spec Rough Info
    - spec name: {spec name}
    - spec description: {spec description}
    - source files: {spec source_files}
    - spec line-range hint: {spec line_range_hint}

    ## Module Plan Json
    {`{codebaseDir}/.tmp/module-{module-name}-plan.json`}
    
    ## output path
    {file path where this spec should be written}

    ## Execution Flow
    Follow these steps strictly and accurately:

    1. You **MUST** read `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/guidance-codebase.md`, and then comprehensively understand the concepts, constraints, and content requirements of **Spec Document**. 
    2. Strictly and accurately following the requirements and steps of `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/references/guidance-specs.md` to generate spec document for {spec name}.
    3. Write spec document to `output path`.

    ## Key Rules
    1. **No scripts.** All analysis and generation is done by directly reading source files. Do not write or execute auxiliary scripts.
    2. **Each spec must re-scan source files.** When writing spec documents, you must re-read actual source files — do not rely solely on intermediate planning files. Plans are guidance; source code is truth. Besides directly related source files, also read upward (what code calls these files) and downward (what these files depend on) to fully understand the context.
    3. **Core code requires careful judgment.** Not all code deserves to be included in spec documents. Determine which code truly represents core logic, key algorithms, and important interface implementations. Avoid including simple wrappers, duplicated code, or glue code without critical logic.
    4. **Spec documents must be thorough and professional.** Each spec document is a complete technical specification for one or several related source files. Every important function/interface/method must be thoroughly documented, including functionality description, parameter details, return values, core logic, and core code snippets. Do not be cursory or overly concise. The quality of spec documents is the core value of the entire codebase.
```
