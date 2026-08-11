---
name: furina-cleancode
description: >
  Use before generating, writing, or modifying code — queries the relevant coding standards based on the target language and outputs focused coding guidelines in Markdown.
  Required parameter:
    - instruction: clean-ts (TypeScript/JavaScript), clean-python (Python)
    - context: the specific requirement or changed files
---

# Furina CleanCode

Query coding standards for the target language and output focused coding guidelines in Markdown for the specific requirement or change at hand.

## Language Adaptation

Query the skill's required language using the following script:

```bash
furina config show language
```

- `language`: This skill **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Input Parameters

1. `instruction` <required>: which language-specific coding standards to query, with the following choices:
   - `clean-ts`: TypeScript coding standards
   - `clean-python`: Python coding standards
2. `context` <required>: the specific requirement or changed files
3. `outputFile` <optional>: A specific file path. If not provided, no file is output by default

When required parameters are missing, you MUST use `AskUserQuestion` to ask the user. Do not ask about optional parameters.

## Execute Instructions

You **MUST** strictly and accurately execute the following steps:

### Step 1: Resolve current instruction document

Map the `instruction` parameter to its instruction document to get `current instruction document`:

| instruction    | Language   | Instruction Document                                                             |
| -------------- | ---------- | -------------------------------------------------------------------------------- |
| `clean-ts`     | TypeScript | `${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/instructions/clean-ts.md`     |
| `clean-python` | Python     | `${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/instructions/clean-python.md` |

### Step 2: Execute the instruction document

You **MUST** dispatch the `cleancode subagent` strictly in the following parameter format(**RED LAW**: Forbid furina-cleancode to read `Current Instruction Document` before dispatching the subagent. The subagent will read the template document. `Furina:explore:Purpose` is the critical description marker of `cleancode subagent`, do NOT mistake it):

```
Agent tool (general-purpose):
  description: "Furina:explore:Purpose Explore coding standards for {`context`}"
  prompt: |
    You are exploring coding standards for {`context`}

    ## Language Adaptation
    Language required for this exploration: {`language` or Chinese}

    ## Current Project Path
    {cwd}

    ## Context Parameter
    {`context`}

    ## Output File
    {`outputFile`}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Read current instruction document: {`Current Instruction Documents`}
    2. Strictly and accurately execute the `current instruction document` step by step.
```

## RED LAW

- Forbid furina-cleancode to read `Current Instruction Document` before dispatching the subagent. The subagent will read the template document.
- The furina-cleancode is forbidden from reading any documents, especially the `Current Instruction Document`.
