---
name: openpowers-codebase-generator
description: >
  Generate structured documentation trees for medium-to-large projects.
  Use when the user asks to generate a project doc tree, documentation directory,
  codebase documentation structure, or wants to systematically document a medium-to-large
  project architecture with modules, submodules, and spec documents.
  Trigger words: generate doc tree, project documentation tree, codebase docs,
  生成项目文档树, 项目文档目录, 代码文档, 模块文档.
---

# Codebase Generator — Structured Documentation Tree Generator

Generate a hierarchical structured documentation tree for medium-to-large codebases. The output is not a single file but a structured directory containing index files (toc.md) and spec documents at each level.

## Input Parameters

The user must provide the following two parameters:

1. **Project path**: The root directory of the source code to analyze (i.e., the root path of the medium-to-large project).
2. **Doc tree path**: The output directory for the generated documentation tree.

If the user does not specify these explicitly, ask for confirmation.

## Language Adaptation

Query the plugin's required output language via the following script:

```bash
openpowers config show language
```

Use the script's returned language as the default language for all user-facing responses and outputs in this skill invocation. If the script returns nothing or fails, fall back to English.

## Document Collection Concepts

### Index File (toc.md)

Index files are navigation files at each level. They should be relatively concise, **no more than 500 lines**, as they are essentially indexes.
All levels (overview, module, submodule) have their own index files.

### Overview

- **Path**: `{doc_tree_path}/toc.md`
- **Constraint**: Index file, no more than 500 lines
- **Contents**:
  - Detailed project introduction (project background, business goals, overall design philosophy)
  - Introduction to all `modules` in the project, including:
  - Detailed description of each module (responsibilities, business domains covered, key features)
  - Detailed description of each module's `submodules` (name + responsibility description, coverage scope)
  - Detailed description of each module's `spec` documents (name + functionality/interface coverage)
  - Path links to each `module` index file
  - **Important**: The overview serves as the entry point for the retriever. Descriptions must be detailed enough to support smooth navigation. For example: if a user searches for "mcp implementation", the module/submodule/spec descriptions in the overview should accurately point to the correct next-level index, ensuring the query path is: overview → module index → submodule index → spec document.

### Module

- **Definition**: A large domain cluster, such as a tools module, plugin module, or hook module.
- **Partitioning principle**: Module划分 should holistically consider **architecture** (code organization, responsibility separation), **business** (domain logic, functional boundaries), **directory structure** (source code directory layout), and **holistic perspective** (inter-module relationships and dependencies). Do not over-rely on directory structure — directories are just one reference; the key is understanding the actual business and architectural essence of the code.
- **Constraint**: A module can contain many `submodule` folders or `spec` documents, but the total count of `submodules` + `specs` must not exceed 30.
- **Path**: `{doc_tree_path}/{module_name}/`, e.g., tools module → `{doc_tree_path}/tools/`

### Module Index File

- **Path**: `{doc_tree_path}/{module}/toc.md`
- **Constraint**: Index file, no more than 500 lines
- **Contents**:
  - **Module relationship diagram** (ASCII diagram showing call/dependency relationships between submodules within this module)
  - Detailed descriptions of all `submodules`/`spec` documents in this module (responsibility description, coverage scope), along with `submodule` index file paths (e.g., `./submodule/toc.md`) / `spec` document paths
  - Descriptions must be detailed enough to support retriever navigation

### Submodule

- **Definition**: A smaller domain cluster.
- **Partitioning principle**: Submodule划分 should also holistically consider **architecture**, **business**, **directory structure**, and **holistic perspective**. Do not over-rely on directory structure; judge based on actual business logic and architectural cohesion of the code.
- **Constraint**: Contains 5–40 `spec` documents (note: only spec documents, no further nesting of submodules).
- **Path**: `{doc_tree_path}/{module}/{submodule}/`

### Submodule Index File

- **Path**: `{doc_tree_path}/{module}/{submodule}/toc.md`
- **Constraint**: Index file, no more than 500 lines
- **Contents**:
  - **Spec relationship diagram** (ASCII diagram showing call/dependency relationships between specs within this submodule)
  - Detailed descriptions of all `spec` documents in this submodule (functionality/interface coverage) and `spec` document paths
  - Descriptions must be detailed enough to support retriever navigation

### Spec Document

- **Definition**: The smallest domain granularity. A spec details one or several closely related source files covering the same minimal business logic, with a collection of related `functionalities/interfaces`. **Must thoroughly document these functionalities and interfaces.**
- **Example**: `spec-read.md` is the spec document for the read tool.
- **Content requirements**:
  - Functionality details / interface details
  - Core code of the functionality/interface
  - Code range of the functionality/interface: `{source_path}:start_line-end_line`

## Documentation Tree Structure

```
{doc_tree_path}/
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

## References

### Spec Document Generation Guide

> **!!! IMPORTANT !!! Before generating any spec document, you MUST re-read the following file and strictly follow its specifications.**
>
> **`references/SPEC-GENERATION-GUIDE.md`** — Standard specification for spec document generation, including core principles, source file reading scope, required content sections, and complete format template.
>
> **Do not skip this step.** Even if you have read it before, you must re-read it when processing subsequent spec documents to ensure consistent compliance.

## Execution Phases

Execute strictly in the following phases. Do not skip or merge phases.

### Phase 1: Global Scan — Discover All Modules (Record with Temporary Intermediate Files)

1. Read the project's top-level structure: directory listing, key configuration files (package.json, Cargo.toml, go.mod, etc.), README.
2. Identify the project's major domain areas. **When partitioning modules, do not over-rely on directory structure.** Holistically consider architecture (code organization, responsibility separation), business (domain logic, functional boundaries), directory structure, and holistic perspective (inter-module relationships and dependencies). Each domain area corresponds to a **module**.
3. Record collected information in temporary intermediate files. Create `{doc_tree_path}/.tmp/module-plan.json`:
   ```json
   {
     "modules": [
       {
         "name": "module-folder-name",
         "display_name": "Human-readable Name",
         "description": "Detailed description of the module's responsibilities, business domains covered, and key features",
         "source_paths": ["src/module-folder/"],
         "estimated_children": "number of submodules + specs"
       }
     ]
   }
   ```
4. Present the module plan to the user and wait for confirmation before proceeding.

### Phase 2: Per-Module Scan — Discover Submodules and Specs (Record with Temporary Intermediate Files)

Process each module **sequentially** (one module at a time):

1. Deep-scan the module's source code paths. Read key files to understand the domain.
2. Determine which child items should be **submodules** (collections of 5–40 related specs) and which should be standalone **spec documents** (directly under the module). When partitioning, holistically consider architecture, business, directory structure, and holistic perspective; do not over-rely on directory structure.
3. Create/update intermediate file `{doc_tree_path}/.tmp/module-{name}-plan.json`:
   ```json
   {
     "module": "module-name",
     "children": [
       {
         "type": "submodule",
         "name": "submodule-folder-name",
         "display_name": "Human-readable Name",
         "description": "Detailed description",
         "source_paths": ["src/module-folder/subfolder/"],
         "specs": [
           {
             "name": "spec-filename.md",
             "display_name": "Feature Name",
             "description": "Detailed description of covered functionality/interfaces",
             "source_files": ["src/module-folder/subfolder/file.ts"],
             "line_range_hint": "approximate start-end line"
           }
         ]
       },
       {
         "type": "spec",
         "name": "spec-feature.md",
         "display_name": "Feature Name",
         "description": "Detailed description of covered functionality/interfaces",
         "source_files": ["src/module-folder/standalone-file.ts"],
         "line_range_hint": "approximate start-end line"
       }
     ]
   }
   ```

### Phase 3: Per-Submodule Scan — Verify and Supplement Phase 2 Plans (Record with Temporary Intermediate Files)

Process each submodule **sequentially**:

1. Read the intermediate file (module-{name}-plan.json) generated in Phase 2 for the submodule and its spec planning information.
2. Deep-scan the submodule's source code paths to verify the accuracy of the planned submodule name, spec names, descriptions, source file paths, etc. Supplement any gaps.

### Phase 4: Initial Processing — Generate Overview Document First

Before entering module processing, generate the initial version of `{doc_tree_path}/toc.md` based on the module information collected in Phase 1:

```markdown
# {Project Name} — Documentation Tree

> Project documentation for `{project_path}`.

{Brief project description}

## Module Overview

### {Module A Name}

> {Module A detailed description: responsibilities, business domains covered, key features}

Submodules/specs: (to be supplemented)

Index: [Module A/toc.md](./module-a/toc.md)

### {Module B Name}

> {Module B detailed description: responsibilities, business domains covered, key features}

Submodules/specs: (to be supplemented)

Index: [Module B/toc.md](./module-b/toc.md)
```

This is an initial skeleton version; submodule/spec details will be supplemented after Phase 5 processing (see Phase 5.6).
Note: The overview must list each module's detailed description and module index file path.

### Phase 5: Process Strictly in Module Order

Process **strictly in module order**. Complete one module before processing the next.

#### 5.1 Process Module Children

When processing a module, process its `submodules` and `spec` documents sequentially. Complete one submodule before processing the next submodule or spec.

#### 5.2 Process Submodule Specs

When processing a submodule, process its `spec` documents sequentially. Complete one spec before processing the next.

#### 5.3 Generate Spec Document

> **!!! WARNING !!! Before generating any spec document, you MUST re-read `references/SPEC-GENERATION-GUIDE.md`.**
> Do not rely on memory or previous context. Re-read it every time and strictly follow all specifications.
> This step cannot be skipped.

**When using a subagent for spec tasks**: You MUST explicitly instruct in the subagent's prompt that it must read and strictly follow `references/SPEC-GENERATION-GUIDE.md` before doing any spec work. Subagents do not have main session memory and must be constrained via prompt.

Detailed generation specifications (core principles, source file reading scope, content sections, format template) are in `references/SPEC-GENERATION-GUIDE.md`.

After completing each spec, output progress: `[spec] module/submodule/spec-xxx.md — done`

#### 5.4 Create Submodule Index File After Processing All Submodule Children

After all spec documents under a submodule are written, create `{doc_tree_path}/{module}/{submodule}/toc.md`:

```markdown
# {Submodule Human-readable Name}

> {Submodule detailed description: responsibilities, coverage scope}

## Spec Relationship Diagram
```

┌─────────────────────────┐
│ {Spec A Name} │
│ {Brief feature coverage}│
└───────────┬─────────────┘
│
▼
┌─────────────────────────┐
│ {Spec B Name} │
│ {Brief feature coverage}│
└─────────────────────────┘

```

## Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-xxx.md](./spec-xxx.md) | {Detailed description: covered functionality/interfaces} | `src/.../file.ts` |
| [spec-yyy.md](./spec-yyy.md) | {Detailed description: covered functionality/interfaces} | `src/.../file2.ts` |
```

#### 5.5 Create Module Index File After Processing All Module Children

After all child items (submodules and direct specs) under a module are processed, create `{doc_tree_path}/{module}/toc.md`:

```markdown
# {Module Human-readable Name}

> {Module detailed description: responsibilities, business domains covered, key features}

## Module Relationship Diagram
```

┌──────────────────────────────┐
│ {Submodule A / Direct Spec} │
│ {Description or brief duty} │
└──────────────┬───────────────┘
│
▼
┌──────────────────────────────┐
│ {Submodule B / Direct Spec} │
│ {Description or brief duty} │
└──────────────────────────────┘

```

## Submodules

| Submodule | Description | Spec Count | Index |
|-----------|-------------|------------|-------|
| [submodule-1/](./submodule-1/) | {Detailed description: responsibilities, coverage scope} | N specs | [toc.md](./submodule-1/toc.md) |
| [submodule-2/](./submodule-2/) | {Detailed description: responsibilities, coverage scope} | M specs | [toc.md](./submodule-2/toc.md) |

## Direct Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-zzz.md](./spec-zzz.md) | {Detailed description: covered functionality/interfaces} | `src/.../file.ts` |
```

#### 5.6 Update Overview Document After All Modules Are Processed

After all modules are processed, rewrite `{doc_tree_path}/toc.md` with complete module descriptions, submodule descriptions, spec descriptions, and module index paths, replacing the initial version from Phase 4:

```markdown
# {Project Name} — Documentation Tree

> Auto-generated project documentation for `{project_path}`.

## Module Overview

### {Module A Name}

> {Module A detailed description: responsibilities, business domains covered, key features}

- **Submodules**
  - `{submodule-1}` — {Submodule 1 detailed description: responsibilities, coverage scope} (N specs)
  - `{submodule-2}` — {Submodule 2 detailed description: responsibilities, coverage scope} (M specs)
- **Direct Specs**
  - `spec-xxx.md` — {Spec detailed description: covered functionality/interfaces}
  - `spec-yyy.md` — {Spec detailed description: covered functionality/interfaces}
- **Index**: [Module A/toc.md](./module-a/toc.md)

### {Module B Name}

> {Module B detailed description: responsibilities, business domains covered, key features}

- **Submodules**
  - `{submodule-3}` — {Submodule 3 detailed description: responsibilities, coverage scope} (K specs)
- **Direct Specs**
  - `spec-zzz.md` — {Spec detailed description: covered functionality/interfaces}
- **Index**: [Module B/toc.md](./module-b/toc.md)
```

Note: Each module in the overview must include detailed descriptions of its submodules and direct specs — not just counts. Descriptions should explain responsibilities and coverage scope, not just names. Descriptions must be detailed enough to support retriever navigation — given a query (e.g., "mcp implementation"), the user should be able to navigate smoothly via: overview → module index → submodule index → spec document.

#### 5.7 Clean Up Temporary Intermediate Files

After all documents are generated, delete the `{doc_tree_path}/.tmp/` directory and all intermediate planning files within it.

#### 5.8 Comprehensive Review — Refine Overview Document

After all spec and index documents are generated, perform a comprehensive review and optimization of the entire project documentation.

**Core Tasks**:

1. **Content Review**: Carefully read all generated spec documents to understand the connections and dependencies between modules and submodules.
2. **Architecture Review**: Based on understanding of all specs, re-examine the project architecture, including:
   - Core entry points of the project
   - Call relationships between major modules
   - The role of key modules in the overall architecture
   - Produce a **module dependency diagram** (layered ASCII diagram) clearly showing each layer's responsibilities and inter-layer dependencies, e.g.:

     ```
     ┌─────────────────────────────────────┐
     │       Layer 1: Entry                │
     │       main.tsx / CLI entry          │
     └──────────────────┬──────────────────┘
                        │
                        ▼
     ┌─────────────────────────────────────┐
     │       Layer 2: Foundation            │
     │       config / state / migrations   │
     └──────────────────┬──────────────────┘
                        │
                        ▼
     ┌─────────────────────────────────────┐
     │       Layer 3: I/O                  │
     │       ui / cli / bridge             │
     └──────────────────┬──────────────────┘
                        ▼
     ...
     ```

3. **Overview Optimization**: Update `{doc_tree_path}/toc.md`, supplementing:
   - Detailed project introduction (project background, business goals, overall design philosophy)
   - **Module dependency diagram** (layered ASCII diagram showing each layer's responsibilities and inter-layer dependencies)
   - Entry point description
   - **Concise yet informative**: 500 lines is a suggested upper limit, but the overview serves a retriever navigation role — information completeness takes priority over line count. If trade-offs are needed within 500 lines, prioritize keeping key navigation information (module relationships, entry descriptions, call chains) complete.
4. **Partition Adjustments (if needed)**: After fully understanding the project, allow revisions to existing spec content and boundaries;
   if module/submodule partitioning is found to be unreasonable, adjustments are allowed, but reasons must be explained to the user before adjusting.

> Note: The value of this phase is that during per-spec generation, our understanding of the project is local;
> now that all specs are generated, revisiting from a global perspective often reveals more accurate architectural descriptions and module partitioning.

#### 5.9 Final Check — Verify Index Traceability

After completing all document generation and comprehensive review, perform index traceability verification on all toc.md files to ensure that starting from any index level, the final spec and source code can be smoothly located.

**Verification Content**:

1. **toc.md Check**: Starting from the overview, randomly select 3–5 module descriptions and verify whether the corresponding module toc → submodule toc → spec can be accurately located via descriptions.
2. **toc.md Check**: From module indexes, randomly select 2–3 submodule/spec descriptions and verify whether descriptions accurately point to the correct specs.
3. **toc.md Check**: From submodule indexes, randomly select 2–3 spec descriptions and verify whether the correct source files can be located.
4. **Spec Document Check — Simulate Retrieval Flow**: From a practical usage perspective, provide several partial feature descriptions (e.g., "mcp implementation", "file reading", "state management") and verify whether the corresponding spec and source code can be found by navigating from the overview:
   - Partial description → overview → module index → submodule index → spec document
   - After finding the spec, check whether it complies with SPEC-GENERATION-GUIDE.md
   - Verify source code paths and line number ranges are real matches
   - Verify the entire retrieval chain is smooth without breaks

**Pass Criteria**:

- toc: Given any functionality description in a toc.md, the following path should smoothly locate the spec and source code: overview → module index → submodule index → spec document → source file
- spec: Whether specs retrieved from partial descriptions comply with SPEC-GENERATION-GUIDE.md, whether functionality descriptions are thorough, whether core code is truly core, whether examples are runnable, whether source line numbers are real matches
- If issues are found (ambiguous descriptions, broken paths, incorrect targets, substandard spec quality, non-existent source code), immediately fix the corresponding documents

After verifying each toc.md or spec, output: `[check] {path} — passed`

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
2. **Strictly sequential processing.** Modules are processed one at a time (complete one before starting the next). Items within a module are processed one at a time. Specs within a submodule are processed one at a time (complete one spec before starting the next). No parallelization.
3. **Holistic judgment, do not over-rely on directory structure.** When partitioning modules and submodules, holistically consider architecture (code organization, responsibility separation), business (domain logic, functional boundaries), directory structure, and holistic perspective. Directory structure is just one reference; the key is understanding the actual business and architectural essence of the code.
4. **Index files ≤ 500 lines.** All toc.md files (overview, module index, submodule index) must remain concise. They are indexes, not detailed documents.
5. **Each spec must re-scan source files.** When writing spec documents, you must re-read actual source files — do not rely solely on intermediate planning files. Plans are guidance; source code is truth. Besides directly related source files, also read upward (what code calls these files) and downward (what these files depend on) to fully understand the context.
6. **Core code requires careful judgment.** Not all code deserves to be included in spec documents. Determine which code truly represents core logic, key algorithms, and important interface implementations. Avoid including simple wrappers, duplicated code, or glue code without critical logic.
7. **Intermediate files are for planning.** All intermediate JSON planning files go in `{doc_tree_path}/.tmp/`. The `.tmp/` directory is automatically cleaned up after all documents are generated.
8. **Module/submodule scale.** Total child items (submodules + direct specs) per module ≤ 30. Each submodule contains 5–40 spec documents. If a domain has fewer than 5 specs, it should be a direct spec under the module, not a submodule.
9. **Spec documents must be thorough and professional.** Each spec document is a complete technical specification for one or several related source files. Every important function/interface/method must be thoroughly documented, including functionality description, parameter details, return values, core logic, and core code snippets. Do not be cursory or overly concise. The quality of spec documents is the core value of the entire documentation tree.
10. **Progress reporting.** After completing each item, output progress with `[module]`, `[submodule]`, `[spec]` prefixes.
11. **Confirm before continuing.** After Phase 1 (module planning), present the plan to the user and wait for confirmation before starting Phase 2.
12. **Overview in two steps.** First generate the initial overview in Phase 4 (module info to be supplemented), then update the overview with complete information in Phase 5.6.
13. **Re-read the guide before every spec generation.** `references/SPEC-GENERATION-GUIDE.md` is the standard specification for spec document generation. Re-read it before processing any spec document and strictly follow its specifications. Do not rely on memory. When using a subagent for spec tasks, **you MUST explicitly instruct in its prompt that it must read `references/SPEC-GENERATION-GUIDE.md` before generating specs**.
14. **Comprehensive review before overview optimization.** After all specs are generated, you must first read and understand them all, then optimize toc.md from a global perspective. Spec content and module/submodule partitioning may be adjusted. 500 lines is a suggested upper limit, but the overview serves a retriever navigation role — information completeness takes priority over line count. Do not append any statistics sections (e.g., "Generation Statistics", "Document Statistics") to the end of the overview.
15. **Final check for index traceability.** After all documents are generated, perform index traceability verification on all toc.md files: randomly sample descriptions at each level and verify smooth navigation to specs and source code. Fix any issues immediately.
