# Comprehensive Reviewer Prompt Template

Dispatch the `Comprehensive Reviewer Subagent` strictly according to the following parameter format:

```
Agent tool (general-purpose):
  description: "Comprehensive Review — Refine Overview Document"
  prompt: |
    You are performing a comprehensive review and optimization for generated codebase of project.

    ## Codebase Directory
    {codebaseDir} --- root directory of codebase.

    ## Execution Flow
    Follow these steps strictly and accurately:

    1. **Content Review**: Carefully read all generated spec documents under `Codebase Directory` to understand the connections and dependencies between modules and submodules.
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

    3. **Overview Optimization**: Update `{codebaseDir}/toc.md`, supplementing:
      - Detailed project introduction (project background, business goals, overall design philosophy)
      - **Module dependency diagram** (layered ASCII diagram showing each layer's responsibilities and inter-layer dependencies)
      - Entry point description
      - **Concise yet informative**: 500 lines is a suggested upper limit, but the overview serves a retriever navigation role — information completeness takes priority over line count. If trade-offs are needed within 500 lines, prioritize keeping key navigation information (module relationships, entry descriptions, call chains) complete.
    4. **Partition Adjustments (if needed)**: After fully understanding the project, allow revisions to existing spec content and boundaries;
      if module/submodule partitioning is found to be unreasonable, adjustments are allowed, but reasons must be explained to the user before adjusting.

    > Note: The value of this phase is that during per-spec generation, our understanding of the project is local;
    > now that all specs are generated, revisiting from a global perspective often reveals more accurate architectural descriptions and module partitioning.
```
