---
name: furina-explore
description: >
  Conduct exploratory investigation of the project to understand existing implementations, architectural patterns, and integration points.
  Use this skill when the user mentions intents such as "探索", "了解", "查一下", "研究一下", "explore", "look into", "investigate",
  or wants to understand how a feature/module is implemented.
  Also applicable before making changes when you need to understand the existing code structure, related implementations, or current business logic.
---

# Furina Explore — Code Explorer

Deeply understand existing implementations, codebases and documents in the project that are relevant to the user's needs, providing factual basis for subsequent decisions.

## Input Parameters

1. `exploreType` <required>:
   - `for-design`: Explore for design task
   - `for-coding`: Explore for coding task
2. `exploreContent` <required>: The specific feature, module, or problem description to explore
3. `outputDir` <optional>: A specific directory path. If not provided, no file is output by default

When required parameters are missing, you MUST use `question` to ask the user. Do not ask about optional parameters.

## Language Adaptation

Query the output language required by the plugin via the following script:

```bash
furina config show language
```

- `language`: This skill **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Execute Instruction

### Step 1: Resolve batch instruction tasks

Based on `exploreType`, determine the instruction list to execute concurrently in `Step 2`:

| exploreType  | Instructions                                          |
| ------------ | ----------------------------------------------------- |
| `for-design` | `codebase`, `repository`, `memory`, `specification`   |
| `for-coding` | `codebase`, `reference`, `cleancode`, `specification` |

For each instruction in the resolved list, **concurrently** dispatch a separate `instruction executing subagent` in Step 2.

### Step 2: Concurrently dispatch instruction executing subagent

For each instruction resolved in Step 1, you **MUST** concurrently dispatch a separate `instruction executing subagent` strictly in the following format:

(**RED LAW**: Forbid furina-explore to read `Instruction Documents` before dispatching the subagent. The subagent will read the template documents. `Furina:explore:Purpose` is the critical description marker of each `instruction executing subagent`, do NOT mistake it)

```
Agent tool (general-purpose):
  description: "Furina:explore:Purpose Explore {instruction} for {`exploreContent`}"
  prompt: |
    You are exploring {instruction}: {`exploreContent`}

    ## Language Adaptation
    Language required for this exploration: {`language` or Chinese}

    ## Current Project Path
    {cwd}

    ## Explore Content
    {`exploreContent`}

    ## Key Rules
    {`key rules`}

    ## Output Directory
    {`outputDir`}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Read the explorer instruction document: {`Determined Instruction Document`}
    2. Strictly follow the instruction's steps and requirements to execute the exploration task
```

## Instruction Documents

| Instruction     | Instruction Document                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `cleancode`     | `${CLAUDE_PLUGIN_ROOT}/skills/furina-explore/instructions/cleancode.md`     |
| `codebase`      | `${CLAUDE_PLUGIN_ROOT}/skills/furina-explore/instructions/codebase.md`      |
| `repository`    | `${CLAUDE_PLUGIN_ROOT}/skills/furina-explore/instructions/repository.md`    |
| `reference`     | `${CLAUDE_PLUGIN_ROOT}/skills/furina-explore/instructions/reference.md`     |
| `memory`        | `${CLAUDE_PLUGIN_ROOT}/skills/furina-explore/instructions/memory.md`        |
| `specification` | `${CLAUDE_PLUGIN_ROOT}/skills/furina-explore/instructions/specification.md` |

## RED LAW

- Forbid furina-explore to read `Instruction Documents` before dispatching the subagent. The subagent will read the instruction documents.
- The furina-explore is forbidden from reading any documents, especially the `Instruction Documents`.

## Key Rules

1. **Do not implement**: This skill only does research and understanding, never writes any implementation code.
2. **Only explore, do not propose solutions**: This skill strictly only explores and documents the current state of the project. Absolutely do NOT generate any proposals, plans, implementation approaches, suggestions, or next steps for the user's input requirements. If the user's input contains requirement descriptions or feature requests, only extract the technical context needed for exploration — do not analyze feasibility, do not suggest approaches, do not draft implementation steps.
3. **Do not fabricate information**: Exploration results must be based on actual code. Do not fabricate implementations that do not exist.
4. **Red line — strictly tied to exploreContent**: Only query and report content that is **directly or closely related** to `exploreContent`. Every piece of information in the output must directly serve the understanding of `exploreContent`. Absolutely do NOT include irrelevant or weakly related findings, observations, or code snippets. No miscellaneous, tangential, or "by the way" content is allowed. If unsure, leave it out.
