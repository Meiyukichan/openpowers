# Integration Testing Instruction

Break implementation work into independent, trackable features. Each feature describes WHAT to implement, not HOW — implementation details are left to the executing agent.
Output is a feature list JSON file that serves as the execution contract: agents pick up features by status, know what's done, and can resume seamlessly across sessions.

## Execute Integration

You **MUST** dispatch the `integration testing subagent` strictly in the following parameter format (`Furina:integration:Purpose` is the critical description marker of `integration testing subagent`, do NOT mistake it):

```
Agent tool (general-purpose):
  description: "Furina:integration:Purpose Execute integration testing: {change name}"
  prompt: |
    You are executing integration testing for {`furina/changes/<name>`}

    ## Furina Change
    {`furina/changes/<name>`}

    ## Current Project Path
    {current project path}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Read the integration testing template document: `${CLAUDE_PLUGIN_ROOT}/skills/furina-finalize/references/integration-testing.md`.
    2. Strictly follow the template's steps and requirements to execute the integration testing task.
```

**IMPORTANT NOTE**: 
- If `integration testing subagent` finally gives failure conclusion, you MUST use `code-implementer-prompt.md` to dispatch the `implementer subagent` to fix these failures.
- After `implementer subagent` fixed `integration testing failure`, you should dispatch the `integration testing subagent` again.
