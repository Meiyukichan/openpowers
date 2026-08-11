# Reference Explorer Subagent

Strictly dispatch the `reference explorer subagent` using the following parameter format (`Furina:explore:Purpose` is the critical description marker of `reference explorer subagent`, do NOT mistake it):

```
Agent tool (general-purpose):
  description: "Furina:explore:Purpose Explore references for {feature-id}: {feature name}"
  prompt: |
    You are exploring references for {feature-id}: {feature name}.

    ## Language Adaptation
    Output language for this task: {`language` or Chinese}

    ## Exploration Content
    {Feature description and related information for the current change feature-id}

    ## Execution Flow
    Strictly and accurately follow these steps:
    1. Invoke the skill `furina-explore` to obtain the feature's reference documentation or implementation, with the following skill parameters:
        - `exploreType`: for-coding
        - `exploreContent`: {detailed requirement exploration content of this feature}
        - `outputDir`: `{cwd}/furina/changes/<name>/explore-coding/{feature-id}`
```
