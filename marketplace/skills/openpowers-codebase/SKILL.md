---
name: openpowers-codebase
description: >
  This skill provides Codebase integration with three core capabilities: explore, generate, and synchronize.
---

# OpenPowers Codebase

This skill provides Codebase integration with three core capabilities: explore, generate, and synchronize.

## Input Parameters

1. `codebaseDir` <required>: root dirctory of the project codebase
2. `instruction` <required>: type of instruction to invoke codebase operation, with following choice:
   - `explore`: query relevant implementations from the codebase using business, feature, or code keywords.
   - `generate`: generate a structured codebase for the project.
   - `synchronize`: synchronize modified changes back into the codebase.

When required parameters are missing, you MUST use `AskUserQuestion` to ask the user. Do not ask about optional parameters.

## Language Adaptation

Query the skill's required language using the following script:

```bash
openpowers config show language
```

- `language`: This skill **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Execute Instructions

You **MUST** strictly and accurately execute the following instruction document:

1. execute `Current Instruction`, and wait util this instruction executes completely.

### Current Instruction

- When `instruction = explore`, current instruction is: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/instructions/explore.md`
- When `instruction = generate`, current instruction is: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/instructions/generate.md`
- When `instruction = synchronize`, current instruction is: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-codebase/instructions/synchronize.md`

## RED LAW

- Progressive Document Reading: ONLY ALLOW reading the instruction document WHEN you are about to execute that instruction.
- Strictly prohibited to read any documents other than the current instruction document.
