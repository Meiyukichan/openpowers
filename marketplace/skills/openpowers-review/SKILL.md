---
name: openpowers-review
description: >
  Review the quality of OpenPowers Artifacts by dispatching review SubAgent to catch issues and automatically fix.
  Use this skill when the user mentions "review openpowers artifacts", "review openpowers propose/plan", or similar intent.
---

# OpenPowers Review

Dispatch review SubAgent for OpenPowers Artifacts of `openpowers/changes/<name>/` to catch issues that implementers tend to overlook — requirement deviations, design flaws, plan omissions, and code quality problems, and automatically fix them. Reviewers provide a quality check line independent of the implementer, and passing review gives confidence for the next step.

## Input Parameters

- `Change Directory (change)`<required>: `openpowers/changes/<name>/`

If required parameters are missing, you MUST use the `AskUserQuestion` tool to ask user for them.

## Skill Configuration

Query skill configuration using following script:

```bash
openpowers config show language experimental.review.openpowers
```

Returns two values in order:

1. `language` — Output language. Use this as the language for all user-facing answers and outputs in this skill. If None, default to Chinese.
2. `experimental.review.openpowers` — Review toggle. If this value is not `true`, **you MUST immediately terminate the openpowers-review skill** and not perform any review operations (this is a mandatory user configuration).

## Review Dispatch Flow

Dispatch the `review subagent` strictly following the parameter format below (`OpenPowers:review:Purpose` is the critical description marker of `review subagent`, do NOT mistake it):

```
Task tool (general-purpose):
  description: "OpenPowers:review:Purpose Review OpenPowers Artifacts: {change name <name>}"
  prompt: |
    You are reviewing OpenPowers artifacts: {change name <name>}

    ## Language Adaptation
    Output language for this review: {`language` or Chinese}

    ## openpowers change
    {`openpowers/changes/<name>/`}

    ## Current project path
    {current project path}

    ## Execution Instructions
    You **MUST** strictly and accurately execute the following instruction document step by step:

    1. execute `Propose Review Instruction`, and wait util this instruction executes completely.
    2. execute `Plan Review Instruction` after the completation of `Propose Review Instruction`.

    ### Instruction Documents
    - `Propose Review Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-review/instructions/review-propose.md`
    - `Plan Review Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-review/instructions/review-plan.md`

    ## RED LAW
    - Progressive Document Reading: ONLY ALLOW reading the instruction document WHEN you are about to execute that instruction.
    - MUST NOT run ANY git commands: you must never run any git commands.
```

## Red Warnings

- **openpowers-review MUST NOT read ANY documents. Related documents will be read in the review subagent**.
- `optional.review.openpowers` is the skill toggle. If it is not `true`, stop executing this skill.
