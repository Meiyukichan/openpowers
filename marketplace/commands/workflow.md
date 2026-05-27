---
description: OpenPowers workflow command to help users take an initial idea (e.g., "I want to…" or "I have a requirement…") through complete project exploration, spec design, planning, and finally execution using TDD.
---

# OpenPowers Workflow

Transform initial ideas into fully implemented, tested features through a structured process: Explore → Propose → Review Propose → Plan → Review Plan → Subagent-Driven Development → Finalize → Archive.

<HARD-GATE>
Skipping any phase is forbidden. Each phase builds on the previous one. Skipping exploration leads to unclear requirements. Skipping proposal leads to inadequate design. Skipping planning leads to chaotic implementation.
</HARD-GATE>

## Force Restart

**Force Restart**: The `FORCE_RESTART` parameter is enabled only when the user provides the argument - `FORCE_RESTART`.

## Workflow Configuration

### Dependency Check

**Before starting the workflow, verify that openpowers is installed:**

```bash
openpowers --version
```

**If openpowers is not installed:**

```bash
npm install -g openpowers@latest
```

**After successful installation:**

Remind the user: "OpenPowers installed successfully. Please close the CLI window and reopen to continue."

### Language Adaptation

You SHOULD query the `output language` required by the plugin via the following script:

```bash
openpowers config show language
```

- `language`: **MUST** use the language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.

## Phase Execution Rules

1. **Sequential Execution:** Execute phases strictly in order: Explore → Propose → Review Propose → Plan → Review Plan → Subagent-Driven Development → Finalize → Archive. Skipping or executing out of order is forbidden.

2. **Auto Transition:** After completing a phase, immediately start the next phase — do NOT pause and ask the user to confirm. Do not output prompts like "Phase complete, continue?"

## Workflow Overview

```dot
digraph workflow {
    rankdir=TB;

    "1. Explore" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "2. Propose" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "3. Review Propose" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "4. Plan" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "5. Review Plan" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "6. Subagent-Driven Development" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "7. Finalize" [shape=box, style=filled, fillcolor="#e6f3ff"];
    "8. Archive" [shape=box, style=filled, fillcolor="#e6f3ff"];

    "1. Explore" -> "2. Propose";
    "2. Propose" -> "3. Review Propose";
    "3. Review Propose" -> "4. Plan";
    "4. Plan" -> "5. Review Plan";
    "5. Review Plan" -> "6. Subagent-Driven Development";
    "6. Subagent-Driven Development" -> "7. Finalize";
    "7. Finalize" -> "8. Archive";
}
```

## Phase Detection - Resume from Current State

**Critical: Do not start from phase 1 if changes already exist.**

**Critical: When `Force Restart` is enabled, absolutely must start from phase 1.**

- When `Force Restart` is enabled, start from phase 1
- Otherwise, check active changes via `openpowers change list` or `ls openpowers/changes/`, then determine the phase using the artifact mapping below:

| Existing Artifacts | Current Phase | Resume Action |
|-------------------|---------------|---------------|
| No change directory or change directory is empty | Phase 1: Explore | Start exploration |
| `exploration.md` exists (no `proposal.md`) | Phase 1: Explore complete | Start Phase 2: Propose |
| `proposal.md` + `design.md` + `specs/` partially missing | Phase 2: Propose partially complete | Continue Phase 2: Propose |
| `proposal.md` + `design.md` + `specs/` complete | Phase 2: Propose complete | Start Phase 3: Review Propose |
| `plan.json` exists, no features completed yet | Phase 4: Plan complete | Start Phase 5: Review Plan |
| `plan.json`: some features completed/in_progress, some pending | Phase 6: Development in progress | Resume next feature |
| All features completed | Phase 6: Development complete | Start Phase 7: Finalize |
| Work integrated (merged/PR) | Phase 7: Finalize complete | Start Phase 8: Archive |
| In archive directory | Phase 8: Archive complete | Workflow ended |

When multiple active changes exist, ask the user to choose which one to resume.

**RED LAW: At this point, the final openpowers change directory: `openpowers/changes/<name>/` must be determined (or create one by yourself, do NOT ask user) before follow phases**. `<name>` MUST satisfy `KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`.

**RED LAW: After completing each phase, immediately start the next phase — do NOT pause and ask the user to confirm. Do not output prompts like "Phase complete, continue?"**.

## Phase 1: Explore

### Purpose
Deeply explore ideas, understand context, investigate the codebase, clarify requirements.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

#### 1. Pre-Execution

- At this point, the final openpowers change directory: `openpowers/changes/<name>/` must be determined (or create one by yourself, do NOT ask user)

#### 2. Phase Execution

Invoke Skill: openpowers-explore to explore the codebase, with parameters:
  - Exploration type: project
  - Exploration content: $ARGUMENTS
  - Output file path: `{cwd}/openpowers/changes/<name>/exploration.md`

#### 3. Post-Execution

- None

### Output
`{cwd}/openpowers/changes/<name>/exploration.md`

### Principle
Exploration time, not implementation time. Do not write code.

### Transition
Exploration completed. Auto entering propose.

## Phase 2: Propose

### Purpose
Create a formal change proposal with all artifacts.

### Execution Steps
In this phase, you must strictly and accurately follow these steps (do NOT dispatch a subagent in this phase: propose):

#### 1. Pre-Execution

- None

#### 2. Phase Execution

1. Invoke Skill: openpowers-brainstorm to brainstorm and align on user requirements.
2. Invoke Skill: openpowers-propose to create a new change proposal

#### 3. Post-Execution

- None

### Output
`openpowers/changes/<name>/` containing `proposal.md`, `design.md`, `specs/**/*.md`

### Principle
Generate all artifacts in one step.

### Transition
"All artifacts created! Auto entering proposal review."

## Phase 3: Review Propose

### Purpose
Review the completeness, consistency, and feasibility of proposal artifacts.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

#### 1. Pre-Execution

- None

#### 2. Phase Execution

Invoke Skill: openpowers-review to review the proposal, with parameters:
  - Review type: propose
  - Change directory: `openpowers/changes/<name>/`

#### 3. Post-Execution

- None

### Output
Review passed (or modification suggestions).

### Principle
Proposal quality determines implementation quality. Do not overlook design flaws.

### Transition
"Proposal review passed. Auto entering planning."

## Phase 4: Plan

### Purpose
Decompose implementation tasks into independent, trackable features with their dependencies, managing the execution plan in JSON format.

### Execution Steps
In this phase, you must strictly and accurately follow these steps (Note! In step 2 you must dispatch a subagent; directly invoking the skill openpowers-schema is forbidden):

#### 1. Pre-Execution

- None

#### 2. Phase Execution

In this phase, you must dispatch a `Planning Phase Subagent` using the following Task template:

```
Task tool (general-purpose):
  description: "OpenPowers:plan:Purpose Create change plan: [change name]"
  prompt: |
    You are creating a change plan: [change name]

    ## Output Language
    [`output language`]

    ## openpowers change
    [`openpowers/changes/<name>/`]

    ## Project Path
    [current project path]

    ## Work Steps
    **Must-follow red-line rule**: You must execute the following steps in strict order without skipping or ignoring any skill — this is absolutely intolerable!

    1. Invoke Skill: openpowers-schema to generate supplementary pre-development docs
    2. Invoke Skill: openpowers-plan to create the change plan

    ## Execution Checklist
    - [] Skill: openpowers-schema execution completed
    - [] Skill: openpowers-plan execution completed
```

#### 3. Post-Execution

- None

### Output
- `openpowers/changes/<name>/plan.json`, containing feature IDs, descriptions, acceptance criteria, file paths, dependencies, and status tracking
- `openpowers/changes/<name>/api.yaml` (optional)
- `openpowers/changes/<name>/database.md` (optional)

### Principle
Features should be completable in one session, while delivering meaningful value.

### Transition
"Planning complete. Auto entering plan review."

## Phase 5: Review Plan

### Purpose
Review the feasibility of the development plan, the correctness of feature decomposition and dependencies.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

#### 1. Pre-Execution

- None

#### 2. Phase Execution

Invoke Skill: openpowers-review to review the plan, with parameters:
  - Review type: plan
  - Change directory: `openpowers/changes/<name>/`

#### 3. Post-Execution

- None

### Output
Review passed (or modification suggestions).

### Principle
Plan quality determines development efficiency. Do not overlook unreasonable decomposition and dependencies.

### Transition
"Plan review passed. Use the AskUserQuestion tool to ask the user whether to automatically enter subagent-driven development?"

## Phase 6: Subagent-Driven Development

### Purpose
Execute each feature using a fresh subagent, with TDD and two-phase review.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

#### 1. Pre-Execution

- None

#### 2. Phase Execution

Invoke Skill: openpowers-sdd to execute the subagent-driven development phase. This skill processes features in full topological order. For each feature: dispatch implementer → implementer must use `openpowers-tdd` → spec compliance review → code quality review → mark feature complete.

#### 3. Post-Execution

- None

### Output
All features implemented, tested, reviewed (feature-level).

### Principle
Fresh subagent per feature + TDD + two-phase review = high quality.

### Transition
"All features complete. Auto entering finalize."

## Phase 7: Finalize

### Purpose
Complete the development work — merge, create PR, or clean up.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

#### 1. Pre-Execution

- None

#### 2. Phase Execution

Dispatch a `Finalize Phase Subagent` using the following Task template:

```
Task tool (general-purpose):
  description: "OpenPowers:finalize:Purpose Finalize change: [change name]"
  prompt: |
    You are finalizing change: [change name]

    ## Output Language
    [`output language`]

    ## Project Path
    [current project path]

    ## Work Steps
    1. Invoke Skill: openpowers-finalize to finalize the change
```

#### 3. Post-Execution

- None

### Output
Work integrated or preserved (tracked via git operations).

### Principle
All tests must pass before any integration.

### Transition
"Work complete! Auto entering archive."

## Phase 8: Archive

### Purpose
Archive the completed change, sync specs to main specs, complete the workflow.

### Execution Steps
In this phase, you must strictly and accurately follow these steps:

#### 1. Pre-Execution

- None

#### 2. Phase Execution

Dispatch an `Archive Phase Subagent` using the following Task template:

```
Task tool (general-purpose):
  description: "OpenPowers:finalize:Purpose Archive change: [change name]"
  prompt: |
    You are archiving change: [change name]

    ## Output Language
    [`output language`]

    ## openpowers change directory
    [`openpowers/changes/<name>/`]

    ## Project Path
    [current project path]

    ## Work Steps
    1. Invoke Skill: openpowers-archive to archive the change
```

#### 3. Post-Execution

- None

### Output
`openpowers/archive/YYYY-MM-DD-<name>/`, preserving all artifacts.

### Principle
Archive preserves the complete change history.

### Transition
"Archive complete! Workflow ended."

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
Idea → Explore → Propose → Review Propose → Plan → Review Plan → Subagent-Driven Development (TDD) → Finalize → Archive
```

Every phase. Every feature. Every time.
