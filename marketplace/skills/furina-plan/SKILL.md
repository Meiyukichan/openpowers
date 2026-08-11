---
name: furina-plan
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Furina Plan

Supplement the technical specification schema documents and formulate an implementation plan for `furina/changes/<name>`.

## Language Adaptation

Query the skill's required language using the following script:

```bash
furina config show language
```

- `language`: This skill **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Execute Instructions

You **MUST** strictly and accurately execute the following instruction document step by step:

1. execute `Schema Instruction`, and wait util this instruction executes completely.
2. execute `Plan Instruction` after the completation of `Schema Instruction`.

### Instruction Documents

- `Schema Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-plan/instructions/schema.md`
- `Plan Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-plan/instructions/plan.md`

## RED LAW

- Progressive Document Reading: ONLY ALLOW reading the instruction document WHEN you are about to execute that instruction.
