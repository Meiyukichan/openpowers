# Reference Explorer Subagent

Strictly dispatch the `reference explorer subagent` using the following parameter format:

```
Task tool (general-purpose):
  description: "Explore references for {feature-id}: {feature name}"
  prompt: |
    You are exploring references for {feature-id}: {feature name}.

    ## Language Adaptation
    Output language for this task: {`language` or Chinese}

    ## Exploration Content
    {Feature description and related information for the current change feature-id}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Invoke the skill `openpowers-explore` to obtain the feature's reference documentation or implementation, with the following skill parameters:
        - Exploration type: references
        - Exploration content: {exploration content}
        - Output file path: `openpowers/changes/<name>/reference/{feature-id}.md`
```
