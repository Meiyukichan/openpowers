---
description: Furina workflow command to help users take an initial idea (e.g., "I want to…" or "I have a requirement…") through complete project exploration, spec design, planning, and finally execution using TDD.
---

# Furina Workflow

Transform initial ideas into fully implemented, tested features through a structured process: Explore → Propose → Plan → Review Furina Artifacts → Subagent-Driven Development → Finalize.

<HARD-GATE>
Skipping any phase is forbidden. Each phase builds on the previous one. Skipping exploration leads to unclear requirements. Skipping proposal leads to inadequate design. Skipping planning leads to chaotic implementation.
</HARD-GATE>

## Force Restart

**Force Restart**: The `FORCE_RESTART` parameter is enabled only when the user provides the argument - `FORCE_RESTART`.

## Workflow Configuration

### Dependency Check

**Before starting the workflow, verify that furina is installed:**

```bash
furina --version
```

**If furina is not installed:**

```bash
npm install -g furina@latest
```

**After successful installation:**

Remind the user: "Furina installed successfully. Please close the CLI window and reopen to continue."

### Language Adaptation

You SHOULD query the `output language` required by the plugin via the following script:

```bash
furina config show language
```

- `language`: **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Phase Execution Rules

1. **Sequential Execution:** Execute phases strictly in order: Explore → Propose → Plan → Review Furina Artifacts → Subagent-Driven Development → Finalize. Skipping or executing out of order is forbidden.

2. **Auto Transition:** After completing a phase, immediately start the next phase — do NOT pause and ask the user to confirm. Do not output prompts like "Phase complete, continue?"

## Workflow Overview

```dot
digraph workflow {
    rankdir=TB;

    "1. Explore" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "2. Propose" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "3. Plan" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "4. Review Furina Artifacts" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "5. Subagent-Driven Development" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "6. Finalize" [shape=box, style=filled, fillcolor="#e6f3ff"];

    "1. Explore" -> "2. Propose";
    "2. Propose" -> "3. Plan";
    "3. Plan" -> "4. Review Furina Artifacts";
    "4. Review Furina Artifacts" -> "5. Subagent-Driven Development";
    "5. Subagent-Driven Development" -> "6. Finalize";
}
```

## Phase Detection - Resume from Current State

**Critical: Do not start from phase 1 if changes already exist.**

**Critical: When `Force Restart` is enabled, absolutely must start from phase 1.**

- When `Force Restart` is enabled, start from phase 1
- Otherwise, check active changes via `furina change list` or `ls furina/changes/`, then determine the phase using the artifact mapping below:

| Existing Artifacts | Current Phase | Resume Action |
|-------------------|---------------|---------------|
| No change directory or change directory is empty | Phase 1: Explore | Start exploration |
| `exploration.md` exists (no `proposal.md`) | Phase 1: Explore complete | Start Phase 2: Propose |
| `proposal.md` + `design.md` + `specs/` partially missing | Phase 2: Propose partially complete | Continue Phase 2: Propose |
| `proposal.md` + `design.md` + `specs/` complete | Phase 2: Propose complete | Start Phase 3: Plan |
| `plan.json` exists, no features completed yet | Phase 3: Plan complete | Start Phase 4: Review Furina Artifacts |
| `plan.json`: some features completed/in_progress, some pending | Phase 5: Subagent-Driven Development in progress | Resume next feature |
| All features completed | Phase 5: Subagent-Driven Development complete | Start Phase 6: Finalize |
| Work integrated (merged/PR) and In archive directory | Phase 6: Finalize complete | Workflow ended |

When multiple active changes exist, ask the user to choose which one to resume.

**RED LAW: At this point, the final furina change directory: `furina/changes/<name>/` must be determined (or create one by yourself, do NOT ask user) before follow phases**. `<name>` MUST satisfy `KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`.

**RED LAW: After completing each phase, immediately start the next phase — do NOT pause and ask the user to confirm. Do not output prompts like "Phase complete, continue?"**.

**Regardless of which phase you ultimately detect for recovery, you MUST first perform the following script to declare that the change <name> is being created or activated.**
**NOTE AGAGIN! Regardless of which phase you ultimately detect for recovery, you MUST first perform the following script to declare that the change <name> is being created or activated:**
```bash
  furina change new <name> --desc <brief description of this change [15-30 words] in `language`>
```

## Phase 1: Explore

### Purpose
Deeply explore ideas, understand context, investigate the codebase, clarify requirements.

### Execution Steps
At this point, the final furina change directory: `furina/changes/<name>/` must be determined (or create one by yourself, do NOT ask user). In this phase, you must strictly and accurately follow these steps:

1. Invoke Skill: furina-explore to explore the project, with parameters:
  - `exploreType`: for-design
  - `exploreContent`: $ARGUMENTS
  - `outputDir`: `{cwd}/furina/changes/<name>/explore-design`

### Principle
Exploration time, not implementation time. Do not write code.

### Transition
Exploration completed. Auto entering propose.

## Phase 2: Propose

### Purpose
Create a formal change proposal with all artifacts.

### Execution Steps
In this phase, you must strictly and accurately follow these steps (do NOT dispatch a subagent in this phase: propose and do NOT stop after completing brainstorm to ask user whether to proceed to propose --- just go straight into propose (furina-propose)):

#### 1. Pre-Execution

- You **MSUT** use mcp tool: `mcp__plugin_furina_furina-mcp-server__markBeginPropose` to make a beiginning mark.

#### 2. Phase Execution

1. Invoke Skill: furina-brainstorm to brainstorm and align on user requirements. And wait util this skill complete.
2. You MUST use `AskUserQuestion` tool to ask user 'Are there any further details that need clarification?', with following selections:
  - Continue to create Furina artifacts
  - Pause for further discussion
3. When user selects 'continue', then **automatically** invoke Skill: furina-propose to create a new change proposal.

#### 3. Post-Execution

1. After completing furina-brainstorm and furina-propose, you **MUST** use the AskUserQuestion tool to ask the user to choose a workflow mode from the following options:
   - Lite     (Extreme mode,  Code exploration ✅ | Propose & Plan ✅ | Artifacts review ❌ | Reference exploration ❌ | Feature Implement ✅ | Spec review ❌ | Code review ❌ | Final Integration ✅)
   - Standard (Standard mode, Code exploration ✅ | Propose & Plan ✅ | Artifacts review ❌ | Reference exploration ✅ | Feature Implement ✅ | Spec review ❌ | Code review ✅ | Final Integration ✅)
   - Max      (Full mode,     Code exploration ✅ | Propose & Plan ✅ | Artifacts review ✅ | Reference exploration ✅ | Feature Implement ✅ | Spec review ✅ | Code review ✅ | Final Integration ✅)

  You need to determine a recommended option based on the scale of the demand (lite < 300, 300 < standard < 1000, max > 1000, standard is prefered defaultly).

  Then you **MUST** use following script to write Furina config:
  ```
  furina config mode <lite/standard/max>
  ```
2. Limit feature count, you **MUST** use the AskUserQuestion tool to ask the user to limit the maximum number of plan features, with the following options:
   - 0.5 (default, sum(features) <= 0.5 * ?(count of specs) = ?)
   - 1   (sum(features) <= 1 * ?(count of specs) = ?)
   - 1.5 (sum(features) <= 1.5 * ?(count of specs) = ?)
  
  You need to determine a recommended option based on the scale of the demand.

  Then you **MUST** use following script to write Furina config:
  ```
  furina config set experimental.factor <factor: 0.5/...>
  ```

3. You **MSUT** use mcp tool: `mcp__plugin_furina_furina-mcp-server__markEndPropose` to make a ending mark.

### Output
`furina/changes/<name>/` containing `proposal.md`, `design.md`, `specs/**/*.md`

### Principle
Generate all propose artifacts in one step.

### Transition
"All propose proposes created! Auto entering plan."

## Phase 3: Plan

### Purpose
Decompose implementation tasks into independent, trackable features with their dependencies, managing the execution plan in JSON format.

### Execution Steps
In this phase, you must strictly and accurately follow these steps (Note! directly invoking the skill furina-plan is forbidden):

1. In this phase, you MUST dispatch a `Planning Phase Subagent` using the following Task template (`Furina:plan:Purpose` is the critical description marker of `Planning Phase Subagent`, do NOT mistake it):

  ```
  Agent tool (general-purpose):
    description: "Furina:plan:Purpose Create change plan: [change name]"
    prompt: |
      You are generating supplementary pre-dev docs and creating a change plan: [change name]

      ## Output Language
      [`output language`]

      ## furina change
      [`furina/changes/<name>/`]

      ## Project Path
      [current project path]

      ## Work Steps

      1. Invoke Skill: furina-plan to generate supplementary pre-dev docs and create the change plan
  ```

### Output
- `furina/changes/<name>/plan.json`, containing feature IDs, descriptions, acceptance criteria, file paths, dependencies, and status tracking
- `furina/changes/<name>/api.yaml` (optional)
- `furina/changes/<name>/database.md` (optional)

### Principle
Features should be completable in one session, while delivering meaningful value.

### Transition
"Planning complete. Auto entering plan review."

## Phase 4: Review Furina Artifacts

### Purpose
Review the completation and feasibility of the Furina artifacts.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

1. Invoke Skill: furina-review to review the Furina artifacts, with parameters:
  - Change Directory: `furina/changes/<name>/`

### Output
Review passed (or modification suggestions).

### Principle
Plan quality determines development efficiency. Do not overlook unreasonable decomposition and dependencies.

### Transition
You MUST Use the AskUserQuestion tool to ask the user whether to automatically enter subagent-driven development

## Phase 5: Subagent-Driven Development

### Purpose
Execute each feature using a fresh subagent, with TDD and two-phase review.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

1. Invoke Skill: furina-sdd to execute the subagent-driven development phase. This skill processes features in full topological order. For each feature: dispatch implementer → implementer must use `furina-tdd` → spec compliance review → code quality review → mark feature complete.

### Output
All features implemented, tested, reviewed (feature-level).

### Principle
Fresh subagent per feature + TDD + two-phase review = high quality.

### Transition
"All features complete. Auto entering finalize."

## Phase 6: Finalize

### Purpose
Complete the development work — merge, create PR, clean up, or archive.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

1. Invoke Skill: furina-finalize to finalize this change:
  - Change directory: `furina/changes/<name>/`

### Output
Work integrated or preserved.

### Principle
All tests must pass before any integration.

### Transition
"Work complete! Workflow ended."

## Core Principles

1. **Detect before start** - Check for existing changes before starting from phase 1.
2. **Resume from current phase** - Determine the phase and resume from there.
3. **Sequential phases** - Phases within the sequence cannot be skipped. After completing each phase, do NOT pause and ask the user to confirm — immediately start the next phase. Do not output prompts like "Phase complete, continue?"
4. **Think before coding** - Explore, propose, document, plan before implementation.
5. **TDD for all features** - Test first, watch it fail, minimal code, refactor.
6. **Fresh subagent per feature** - Isolated context, focused execution.
7. **Two-phase review** - Spec compliance first, then code quality. Both must pass.
8. **Tests must pass** - Before review, merge, integration.
9. **Auto transition** - After completing a phase, do NOT pause and ask the user to confirm — immediately start the next phase. Do not output prompts like "Phase complete, continue?" (except for Phase 5: Review Plan)
10. **Archive to complete workflow** - Preserve history, sync specs.
11. **When `Force Restart` is enabled, absolutely must start from phase 1. And! Must reference existing design, plan, spec documents and redesign more comprehensively and professionally on that basis!**

## Red Warnings - STOP

**Never:**
- Skip any phase
- Start from phase 1 when active changes exist
- Write code during the exploration phase
- Start implementation without a plan
- Skip TDD for any feature
- Continue with failing tests
- Skip spec compliance review before code quality review
- Skip reviews
- Merge without final review
- Delete work without confirmation
- Skip archiving
- Continue after phase detection errors
- Ignore subagent BLOCKED/NEEDS_CONTEXT status
- Force retry with the same model without resolving blockers

**If you find yourself rationalizing or skipping steps: Stop. Return to the correct phase. Follow the workflow.**

## Final Rule

```
Explore → Propose → Plan → Review Furina Artifacts → Subagent-Driven Development → Finalize
```

Every phase. Every feature. Every time.
