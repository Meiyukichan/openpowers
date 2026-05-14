---
name: openpowers-review
description: >
  Review the quality of work outputs by dispatching specialized review sub-agents to catch issues and suggest improvements.
  Supports three review types: propose, plan, and code.
  Use this skill when the user mentions "review", "check", "look for issues", or similar intent.
---

# Openpowers Review

Dispatch specialized review sub-agents to catch issues that implementers tend to overlook — requirement deviations, design flaws, plan omissions, and code quality problems. Reviewers provide a quality check line independent of the implementer, and passing review gives confidence for the next step.

**Important**: The openpowers-review MUST NOT read the `review template documents`. Other documents should only be read when necessary.

## Input Parameters

1. **Review Type (review)** <required>:
   - `propose`: Review the proposal document
   - `plan`: Review the plan document
   - `code`: Review code changes
2. **Change Directory (change)** <required when review is `propose` or `plan`>: `openspec/changes/<name>/`

If required parameters are missing, you MUST use the `AskUserQuestion` tool to ask the user for them.

## Skill Configuration

After determining the review type (propose/plan/code), query the following configuration, replacing `<type>` with the actual review type:

```bash
python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py {current project path} language experimental.review.\<type\>
```

Returns two values in order:

1. `language` — Output language. Use this as the language for all user-facing answers and outputs in this skill. If None, default to Chinese.
2. `experimental.review.<type>` — Review toggle. If this value is not `True`, **you MUST immediately terminate the openpowers-review skill** and not perform any review operations (this is a mandatory user configuration).

## Review Dispatch Flow

Dispatch the `review sub-agent` strictly following the parameter format below:

```
Task tool (general-purpose):
  description: "Review {review type}: {change name <name>}"
  prompt: |
    You are reviewing {review type}: {change name <name>}

    ## Language Adaptation
    Output language for this review: {`language` or Chinese}

    ## openspec change
    {`openspec/changes/<name>/`}

    ## Current project path
    {current project path}

    ## Script path
    {${CLAUDE_PLUGIN_ROOT}/scripts/config.py}

    ## Execution flow
    Strictly follow the steps below:
    1. Read the explorer template document: {`review template document`}
    2. Strictly follow the explorer template's steps and requirements to execute the exploration task
```

## Review Template Documents

- When `review = propose`, template document: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-review/references/propose-reviewer.md`
- When `review = plan`, template document: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-review/references/plan-reviewer.md`
- When `review = code`, template document: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-review/references/code-reviewer.md`

## Red Warnings

- **openpowers-review MUST NOT read the `review template documents`. Other documents should only be read when necessary.**
- **openpowers-review MUST NOT run git commands**: openpowers-review itself must never run any git commands, especially when the review type is code!
- `optional.review.<type>` is the skill toggle. If it is not `True`, stop executing this skill.
