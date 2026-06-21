---
name: openpowers-cleancode
description: >
  Use before generating, writing, or modifying code — queries the relevant coding standards based on the target language and outputs focused coding guidelines in Markdown.
  Required parameter:
    - instruction: clean-ts (TypeScript/JavaScript), clean-python (Python)
    - context: the specific requirement or changed files
---

# OpenPowers CleanCode

Query coding standards for the target language and output focused coding guidelines in Markdown for the specific requirement or change at hand.

## Language Adaptation

Query the skill's required language using the following script:

```bash
openpowers config show language
```

- `language`: This skill **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Input Parameters

1. `instruction` <required>: which language-specific coding standards to query, with the following choices:
2. `context` <required>: the specific requirement or changed files
   - `clean-ts`: TypeScript coding standards
   - `clean-python`: Python coding standards

When required parameters are missing, you MUST use `AskUserQuestion` to ask the user. Do not ask about optional parameters.

## Execute Instructions

You **MUST** strictly and accurately execute the following steps:

### Step 1: Resolve the instruction document

Map the `instruction` parameter to its instruction document:

| instruction    | Language   | Instruction Document                                                             |
| -------------- | ---------- | -------------------------------------------------------------------------------- |
| `clean-ts`     | TypeScript | `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/instructions/clean-ts.md`     |
| `clean-python` | Python     | `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-cleancode/instructions/clean-python.md` |

### Step 2: Execute the instruction document

Strictly and accurately execute the resolved instruction document step by step.

## RED LAW

- Progressive Document Reading: ONLY ALLOW reading the instruction document WHEN you are about to execute that instruction.
- Strictly prohibited to read any documents other than the current instruction document.
