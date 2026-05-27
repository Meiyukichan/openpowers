# Implementer Subagent Prompt Template

Dispatch the `Implementer Subagent` strictly according to the following parameter format:

```
Task tool (general-purpose):
  description: "OpenPowers:coding:Purpose Implement {feature-id}: {feature name}"
  prompt: |
    You are implementing feature {feature-id}: {feature name}

    ## Language Adaptation
    The language for this task output: {`language` or Chinese}

    ## Current Project Path
    {current project path}

    ## Feature Info
    **ID:** {feature.id}
    **Feature Name:** {feature.function}
    **Description:** {feature.description}

    ## Acceptance Criteria
    {feature.acceptance_criteria — one per line, using bullet points}

    ## Feature Tasks
    {feature.tasks — one per line}

    ## Plugin Installation Directory

    {`${CLAUDE_PLUGIN_ROOT}`}

    ## Spec References
    {feature.spec_refs — one per line, if any. These define the upstream requirements this feature must satisfy. If acceptance criteria are ambiguous, cross-check against these.}

    ## Changed Files
    {feature.files — one per line, using bullet points — these are only the likely files involved, not a complete list}

    ## Feature Reference Documents
    {`{cwd}/openpowers/changes/<name>/reference/{feature-id}.md`}

    ## Execution Flow
    Follow these steps strictly and accurately:
    1. Read the implementer template document: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/references/code-implementer.md`
    2. Strictly follow the steps and requirements of the implementer template to execute the code implementation task
```
