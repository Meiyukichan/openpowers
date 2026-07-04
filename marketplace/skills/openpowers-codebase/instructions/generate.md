# Codebase Generate Instruction

Generate a hierarchical structured code-document tree for medium-to-large codebases. The output is not a single file but a structured directory containing index files (toc.md) and spec documents at each level.

## Input Parameters

1. `projectDir` <required>: root directory of the source code to analyze
2. `codebaseDir` <required>: root dirctory of the project codebase, also output directory for this generate instruction

When required parameters are missing, you MUST use `AskUserQuestion` to ask the user. Do not ask about optional parameters.

## Output language
{`language`}

## Codebase Collection Concepts

You **MUST** accurately, carefully, and thoroughly read `Codebase Collection Concepts`: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/guidance-codebase.md`, and then comprehensively understand the concepts, constraints, and content requirements of **Module, Module Index File, Submodule, Submodule Index File, and Spec Document**.

## Codebase Structure

```
{codebaseDir}/
├── toc.md                          ← Overview (top-level index, ≤500 lines)
├── {module-a}/
│   ├── toc.md                      ← Module index (module-level index, ≤500 lines)
│   ├── {submodule-1}/
│   │   ├── toc.md                  ← Submodule index (submodule-level index, ≤500 lines)
│   │   ├── spec-xxx.md
│   │   └── spec-yyy.md
│   ├── {submodule-2}/
│   │   ├── toc.md
│   │   └── ...
│   └── spec-zzz.md                 ← Spec directly under module
├── {module-b}/
│   ├── toc.md
│   └── ...
└── ...
```

## Execution Phases

Execute strictly in the following phases. Do not skip or merge phases.

### Phase 1: Global Scan — Discover All Modules

1. Strictly follow the template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/prompt-modules-partitioner.md` to dispatch the `Modules Partitioner Subagent`.
2. Present the module partitioning result given by `Modules Partitioner Subagent` to the user and wait for confirmation before proceeding to subsequent phases.

### Phase 2: Per-Module Scan — Discover Submodules and Specs

Read Module Plan: `{codebaseDir}/.tmp/module-plan.json`, and then process batch (10) modules **sequentially** (you **MUST** concurrently process 10 module at a time, and wait util they all complete):

1. Strictly follow the template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/prompt-submodules-partitioner.md` to dispatch the `SubModules Partitioner Subagent` for ONE module.
2. Present the submodule partitioning result given by `SubModules Partitioner Subagent`.

### Phase 3: Per-Submodule Scan — Verify and Supplement Phase 2 Plans

Process batch (10) module plans **sequentially** (you **MUST** concurrently process 10 module plans at a time, and wait util they all complete):

1. Strictly follow the template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/prompt-submodules-validator.md` to dispatch the `SubModules Validator Subagent` for ONE module plan - `{codebaseDir}/.tmp/module-{name}-plan.json`.
2. Present the submodule partitioning result given by `SubModules Validator Subagent`.

### Phase 4: Initial Processing — Generate Overview Document First

Before entering Phase 5, strictly follow the template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/prompt-codebase-toptoc.md` to dispatch the `Init-Top-Toc Subagent` to generate the initial version of `{codebaseDir}/toc.md`.

This is an initial skeleton version; submodule/spec details will be supplemented after Phase 5 processing (see Phase 5.6).
Note: The overview must list each module's detailed description and module index file path.

### Phase 5: Process Strictly in Module Order

Process **strictly in module order**. Complete one module before processing the next.

#### 5.1 Process Module Children

When processing a module, process its `submodules` (follow `Process Submodule Specs`) and `spec` (follow `Generate Spec Document`) documents sequentially. Complete one submodule before processing the next submodule or spec.

#### 5.2 Process Submodule Specs

When processing a submodule, process its `spec` documents concurrently (follow `Generate Spec Document`). **Process 10 specs in parallel per batch, complete one batch before processing the next**.

#### 5.3 Generate Spec Document

1. Strictly follow the template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/prompt-codebase-spec.md` to dispatch the `Spec Generator Subagent` for ONE spec
2. After completing this spec, output progress: `[spec] module/submodule/spec-xxx.md — done`

#### 5.4 Create Submodule Index File After Processing All Submodule Children

After all spec documents under a submodule are written, create `{codebaseDir}/{moduleName}/{submodule}/toc.md` using template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/template-submodule-toc.md`.

#### 5.5 Create Module Index File After Processing All Module Children

After all child items (submodules and direct specs) under a module are processed, create `{codebaseDir}/{moduleName}/toc.md` using template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/template-module-toc.md`

#### 5.6 Update Overview Document After All Modules Are Processed

After all modules are processed, rewrite `{codebaseDir}/toc.md` with complete module descriptions, submodule descriptions, spec descriptions, and module index paths using template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/template-top-toc.md`

Note: Each module in the overview must include detailed descriptions of its submodules and direct specs — not just counts. **Descriptions should explain responsibilities and coverage scope**, not just names. Descriptions must be detailed enough to support retriever navigation — given a query (e.g., "mcp implementation"), the user should be able to navigate smoothly via: overview → module index → submodule index → spec document.

#### 5.7 Clean Up Temporary Intermediate Files

After all documents are generated, delete the `{codebaseDir}/.tmp/` directory and all intermediate planning files within it.

#### 5.8 Comprehensive Review — Refine Overview Document

After all spec and index documents are generated, strictly follow the template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/prompt-codebase-reviewer.md` to dispatch the `Comprehensive Reviewer Subagent` to perform a comprehensive review and optimization of the entire project documentation.

#### 5.9 Final Check — Verify Index Traceability

After completing all document generation and comprehensive review, strictly follow the template: `${CLAUDE_PLUGIN_ROOT}/skills/optix-codebase/references/prompt-codebase-checker.md` to dispatch the `Index Traceability Checker Subagent` to perform index traceability verification on all toc.md files to ensure that starting from any index level, the final spec and source code can be smoothly located.

#### 5.10 Fix Substandard Spec Documents

After completing the comprehensive review, fix any substandard spec documents found.

**Determination Logic**:

1. **Line Count Preliminary Filter**:
   - Use bash to count lines of all spec documents and calculate the average
   - Filter out spec documents with fewer than half the average lines as primary suspects
   - Output: `[filter] {path} — {line_count} lines (average {average}, threshold {threshold})`

2. **Quality Review**:
   - For each suspected substandard spec, re-read SPEC-GENERATION-GUIDE.md for comparison
   - Check items: whether functionality descriptions are thorough, whether core code is truly core, whether examples are runnable, whether source line numbers are real matches
   - Combine line count information for comprehensive determination

3. **Source File List Check**:
   - Use bash to extract the first five lines of each spec document (do not read the complete file)
   - Check whether it contains a source file list (format reference: SPEC-GENERATION-GUIDE.md document header metadata)
   - Filter out specs without source file lists, output: `[filter] {path} — missing source file list`
   - For specs missing source file lists, supplement with correct source file paths and line number ranges

4. **Fix Processing**:
   - For specs determined to be substandard, re-read the corresponding source files and regenerate according to SPEC-GENERATION-GUIDE.md
   - After fixing, output: `[fix] {path} — fixed`
   - If line count is low but quality is acceptable (just not thorough enough), supplement rather than completely rewrite

**Note**: This phase should not involve large-scale rework; only handle documents confirmed substandard through preliminary filtering and quality review.

## Key Rules

1. **No scripts.** All analysis and generation is done by directly reading source files. Do not write or execute auxiliary scripts.
2. **Holistic judgment, do not over-rely on directory structure.** When partitioning modules and submodules, holistically consider architecture (code organization, responsibility separation), business (domain logic, functional boundaries), directory structure, and holistic perspective. Directory structure is just one reference; the key is understanding the actual business and architectural essence of the code.
3. **Index files ≤ 500 lines.** All toc.md files (overview, module index, submodule index) must remain concise. They are indexes, not detailed documents.
4. **Module/submodule scale.** Total child items (submodules + direct specs) per module ≤ 50. Each submodule contains 5–50 spec documents. If a domain has fewer than 5 specs, it should be a direct spec under the module, not a submodule.
5. **Spec documents must be thorough and professional.** Each spec document is a complete technical specification for one or several related source files. Every important function/interface/method must be thoroughly documented, including functionality description, parameter details, return values, core logic, and core code snippets. Do not be cursory or overly concise. The quality of spec documents is the core value of the entire codebase.
6.  **Progress reporting.** After completing each item, output progress with `[module]`, `[submodule]`, `[spec]` prefixes.
7.  **Confirm before continuing.** After Phase 1 (module planning), present the plan to the user and wait for confirmation before starting Phase 2.
8.  **Overview in two steps.** First generate the initial overview in Phase 4, then update the overview with complete information in Phase 5.6.
9.  **Comprehensive review before overview optimization.** After all specs are generated, you must first read and understand them all, then optimize toc.md from a global perspective. Spec content and module/submodule partitioning may be adjusted. 500 lines is a suggested upper limit, but the overview serves a retriever navigation role — information completeness takes priority over line count. Do not append any statistics sections (e.g., "Generation Statistics", "Document Statistics") to the end of the overview.
10. **Final check for index traceability.** After all documents are generated, perform index traceability verification on all toc.md files: randomly sample descriptions at each level and verify smooth navigation to specs and source code. Fix any issues immediately.
11.  **Process 10 specs in parallel per batch, complete one batch before processing the next**.