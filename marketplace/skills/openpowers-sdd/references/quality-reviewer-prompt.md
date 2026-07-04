# Code Quality Reviewer Prompt Template

**Dispatch only after spec compliance review has passed.**

Dispatch the `Code Quality Review Subagent` strictly according to the following parameter format (`OpenPowers:review:Purpose` is the critical description marker of `Code Quality Review Subagent`, do NOT mistake it):

```
Agent tool (general-purpose):
  description: "OpenPowers:review:Purpose Review code quality for {feature-id}: {feature name}"
  prompt: |
    You are reviewing the code quality of {feature-id}: {feature name}.

    **Purpose:** Verify that the implementation is well-built (clean, tested, maintainable). **Dispatch only after spec compliance review has passed.**

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

    ## Spec References
    {feature.spec_refs — one per line, if any. These define the upstream requirements this feature must satisfy. If acceptance criteria are ambiguous, cross-check against these.}

    ## Changed Files
    {feature.files — one per line, using bullet points — these are only the likely files involved, not a complete list}

    ## What the Implementer Claims to Have Built
    {report from the implementer subagent}

    ## Execution Flow
    Follow these steps strictly and accurately:
    1. Read the code quality review template document: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-sdd/references/quality-reviewer.md`
    2. Strictly follow the steps and requirements of the code quality review template to execute the review task
```
