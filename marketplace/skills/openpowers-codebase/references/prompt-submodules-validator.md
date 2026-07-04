# SubModules Validator Prompt Template

Dispatch the `SubModules Partitioner Subagent` strictly according to the following parameter format:

```
Agent tool (general-purpose):
  description: "Module Validate — Verify and Supplement submodule plan of {module-name}"
  prompt: |
    You are verifying and supplementing submodule plan of {module-name}.

    ## Project Directory
    {projectDir} --- root directory of project you should explore.

    ## Codebase Directory
    {codebaseDir} --- root directory of codebase.

    ## Module Plan Path
    {`{codebaseDir}/.tmp/module-{module-name}-plan.json`}

    ## Execution Flow
    Follow these steps strictly and accurately:

    Process each submodule sequentially (one submodule at a time):

    1. Read the `{codebaseDir}/.tmp/module-{module-name}-plan.json`, and locate the planning information for the current submodule (an entry in `children` with `type: "submodule"` and matching `name`).

    2. **Deep scan the source code**:
      - Read enough source code files under the directories listed in the submodule's `source_paths`.
      - For multilingual projects, scan files with various extensions (`.c`, `.cpp`, `.h`, `.hpp`, `.rs`, `.go`, `.py`, `.java`, `.ts`, etc.).
      - Also read upstream interfaces that the submodule depends on (e.g., header files, public API modules) and downstream calls (optional, if necessary) to fully understand the true boundaries of the submodule.

    3. **Verify the accuracy of the planning information**, checking and correcting each item:

      | Verification Item | Action |
      |------------------|--------|
      | **Submodule name (`name`)** | Ensure the name matches the directory name or logical grouping. If the actual code organization differs from the plan, update `name` and `display_name`. |
      | **Submodule description (`description`)** | Compare against actual code responsibilities; supplement or rewrite the description to cover the submodule's core functionality, interfaces, and boundaries. |
      | **Source file paths (`source_paths`)** | If any source directories are missing (e.g., additional `src/`, `include/`, or binding code directories), add them immediately. Remove irrelevant paths. |
      | **Spec list (`specs`)** | Verify each planned spec:<br> - `name`: Does it accurately reflect the functionality of the source files?<br> - `description`: Does it match the actual code logic?<br> - `source_files`: Are all relevant source files (implementation + headers) completely listed?<br> - `line_range_hint`: Is it within a reasonable range? If the line range is completely wrong, remove it so later stages can regenerate it. |
      | **Missing specs** | If source files or functional points are not covered by the plan, add new spec entries, filling in `type: "spec"` and basic information. |
      | **Unnecessary specs** | If a planned spec corresponds to source files that do not exist or are irrelevant to the submodule, delete that spec entry. |
      | **Reasonableness of submodule splitting** | If the current submodule actually contains far more than 40 spec documents or fewer than 5, consider adjusting: split it into multiple submodules, or demote it to direct spec documents. After modification, adjust the structure in `module-plan.json` accordingly. |

    4. **Update the intermediate file**: Write back all verification and supplementation results to `{codebaseDir}/.tmp/module-{module-name}-plan.json`, preserving the original file structure and modifying only the corresponding submodule section.

    5. **Notes**:
      - This stage **does not generate final documentation**; it only revises the planning file. Subsequent Stage 5 will generate `toc.md` and spec documents based on the revised plan.
      - For large submodules, verification can be done in batches, but the JSON file must still be updated after each batch.
      - If module‑level planning issues (e.g., needing to add or delete an entire submodule) are discovered during verification, the `children` structure of `module-plan.json` may be adjusted upward, but the reason must be noted in the output.

    ## Key Rules
    1. **No scripts.** All analysis and generation is done by directly reading source files. Do not write or execute auxiliary scripts.
    2. **Holistic judgment, do not over-rely on directory structure.** When partitioning modules and submodules, holistically consider architecture (code organization, responsibility separation), business (domain logic, functional boundaries), directory structure, and holistic perspective. Directory structure is just one reference; the key is understanding the actual business and architectural essence of the code.
    3. **Core code requires careful judgment.** Not all code deserves to be included in spec documents. Determine which code truly represents core logic, key algorithms, and important interface implementations. Avoid including simple wrappers, duplicated code, or glue code without critical logic.
    4. **Module/submodule scale.** Total child items (submodules + direct specs) per module ≤ 50. Each submodule contains 5–50 spec documents. If a domain has fewer than 5 specs, it should be a direct spec under the module, not a submodule.
```
