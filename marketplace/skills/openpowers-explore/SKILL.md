---
name: openpowers-explore
description: >
  Conduct exploratory investigation of the codebase to understand existing implementations, architectural patterns, and integration points.
  Use this skill when the user mentions intents such as "探索", "了解", "查一下", "研究一下", "explore", "look into", "investigate",
  or wants to understand how a feature/module is implemented.
  Also applicable before making changes when you need to understand the existing code structure, related implementations, or current business logic.
---

# Openpowers Explore — Code Explorer

Deeply understand existing implementations in the project that are relevant to the user's needs, providing factual basis for subsequent decisions.

**RED LAW**: the openpowers-explore is forbidden from reading the any documents, especially the `Current Instruction Documents`.

## Input Parameters

1. **Explore type `explore_type`** <required>:
   - `project`: Explore code implementations within the current project
   - `references`: Explore external reference materials (docs, API specs, etc.)
2. **Explore content `explore_content`** <required>: The specific feature, module, or problem description to explore
3. **Output file path `output_file`** <optional>: A specific file path. If not provided, no file is output by default. Do not ask the user — only set this when the user proactively provides an output path (see "Output" section)

When required parameters are missing, you MUST use `AskUserQuestion` to ask the user. Do not ask about optional parameters.

## Language Adaptation

Query the output language required by the plugin via the following script:

```bash
openpowers config show language
```

- `language`: This skill **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Execute Instruction

You **MUST** dispatch the `codebase explorer subagent` strictly in the following parameter format:

```
Task tool (general-purpose):
  description: "OpenPowers:explore:Purpose Explore {`explore_content`}"
  prompt: |
    You are exploring {explore type}: {`explore_content`}

    ## Language Adaptation
    Language required for this exploration: {`language` or Chinese}

    ## Explore Type
    {`explore_type`}

    ## Current Project Path
    {current project path}

    ## Explore Content
    {`explore_content`}

    ## Key Rules
    {`key rules`}

    ## Output File
    {`output_file`}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Read the explorer template document: {`Current Instruction Documents`}
    2. Strictly follow the template's steps and requirements to execute the exploration task
```

### Current Instruction Documents

- When `explore_type = project`, current instruction document: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-explore/instructions/project.md`
- When `explore_type = references`, current instruction document: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-explore/instructions/references.md`

## RED LAW

- Forbid openpowers-explore to read `Current Instruction Documents` before dispatching the subagent. The subagent will read the template document.
- The openpowers-explore is forbidden from reading any documents, especially the `Current Instruction Documents`.
- `OpenPowers:explore:Purpose` is the **critical** description marker of `codebase explorer subagent`, do NOT mistake it.

## Key Rules

1. **Do not implement**: This skill only does research and understanding, never writes any implementation code.
2. **Only explore, do not propose solutions**: This skill strictly only explores and documents the current state of the project. Absolutely do NOT generate any proposals, plans, implementation approaches, suggestions, or next steps for the user's input requirements. If the user's input contains requirement descriptions or feature requests, only extract the technical context needed for exploration — do not analyze feasibility, do not suggest approaches, do not draft implementation steps.
3. **Do not fabricate information**: Exploration results must be based on actual code. Do not fabricate implementations that do not exist.
4. **Red line — strictly tied to explore_content**: Only query and report content that is **directly or closely related** to `explore_content`. Every piece of information in the output must directly serve the understanding of `explore_content`. Absolutely do NOT include irrelevant or weakly related findings, observations, or code snippets. No miscellaneous, tangential, or "by the way" content is allowed. If unsure, leave it out.
