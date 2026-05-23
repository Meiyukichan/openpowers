---
name: openpowers-plan
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Break implementation work into independent, trackable features. Each feature describes WHAT to build, not HOW — implementation details are left to the executing agent.

Output is a feature list JSON file that serves as the execution contract: agents pick up features by status, know what's done, and can resume seamlessly across sessions.

**Save plans to:** `openpowers/changes/<name>/plan.json`

## Skill Configuration

Query the skill configuration using the following script:

```bash
openpowers config show language experimental.factor
```

Returns two values in order:

1. `language` — Output language. This skill **MUST** use this language as the default language for all user-facing responses and outputs. If the script returns no output or fails, fall back to Chinese.
2. `experimental.factor` — Feature budget multiplier, controls the maximum number of features in the generated plan. This factor has a maximum value of 3.

## openpowers Artifacts Location

**Read existing artifacts for context** (skip if already read):

- `openpowers/changes/<name>/specs/**/*.md`
- `openpowers/changes/<name>/proposal.md`
- `openpowers/changes/<name>/design.md`
- `openpowers/changes/<name>/api.yaml`
- `openpowers/changes/<name>/database.md`
- etc.

**These artifact types (proposal.md, design.md, specs/) must all exist.** If any is missing, the previous phase is incomplete — stop executing this skill and remind the user to run `openpowers-propose` first.

All planning decisions must reference specific sections/sentences from these specs.

## Task Breakdown for Implementation Work

Before writing the plan, you must first create a task list breaking down the implementation work based on the openpowers artifacts you read, following this template:

```
## 1. <!-- Task group name -->

1.1 <!-- Task description -->
1.2 <!-- Task description -->

## 2. <!-- Task group name -->

2.1 <!-- Task description -->
2.2 <!-- Task description -->
```

**Important: This task list must NOT be written to a file. It serves only as intermediate context for generating the plan JSON. (This task list is the direct reference for generating the plan.)**

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem, with corresponding specs split accordingly. Each plan should produce working, testable software on its own.

## File Structure

Before defining features, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the feature decomposition. Each feature should produce self-contained changes that make sense independently.

## Feature Granularity

**First principle:** the generated plan MUST NOT contain more than `experimental.factor` × (number of spec files in `openpowers/changes/<name>/specs/`) features (minimum of features: 1).

Each feature is one independently testable unit of work — completable by an agent in a single focused session, while delivering meaningful value.

**Good feature:** "User login with email and password, returns JWT token"
**Bad feature:** "Authentication system" (too large)
**Bad feature:** "Add `import jwt` to auth module" (too small, no independent value)

## Dependency Ordering

Features must be ordered in topological sort order — a feature appears before any feature that depends on it. When writing the JSON array:

1. Start with features that have no dependencies
2. Follow with features whose dependencies are already listed
3. Continue until all features are placed
4. Verify: no feature references a dependency that appears later in the array

This ordering ensures consumers can process features sequentially without re-sorting.

## JSON Schema

```json
[
  {
    "id": "auth-001",
    "category": "authentication",
    "function": "user-login",
    "description": "Implement email/password login. Validate credentials against database, return JWT token on success.",
    "acceptance_criteria": [
      "Valid email+password returns 200 with JWT token",
      "Wrong password returns 401 Unauthorized",
      "Non-existent email returns 401 (must not reveal whether user exists)"
    ],
    "tasks": [
      "1.1 Create new module structure",
      "1.2 Add dependency to package.json"
    ],
    "files": ["src/auth/login.ts", "src/auth/login.test.ts"],
    "dependencies": [],
    "spec_refs": [
      "openpowers/changes/<name>/specs/auth/spec.md#login",
      "openpowers/changes/<name>/design.md#auth"
    ],
    "status": "pending"
  }
]
```

### Field Definitions

| Field                 | Required | Description                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | yes      | Unique identifier, used in dependencies references. Format: `{category-prefix}-{number}`                                                                                                                                                                                                                                                                                      |
| `category`            | yes      | Module/subsystem this feature belongs to                                                                                                                                                                                                                                                                                                                                      |
| `function`            | yes      | Feature name, concise and specific                                                                                                                                                                                                                                                                                                                                            |
| `description`         | yes      | What to build — enough context for an agent to make good implementation decisions, but NO code                                                                                                                                                                                                                                                                                |
| `acceptance_criteria` | yes      | List of verifiable conditions. Spec reviewers check against these.                                                                                                                                                                                                                                                                                                            |
| `tasks`               | yes      | List of tasks to be completed for this feature                                                                                                                                                                                                                                                                                                                                |
| `files`               | yes      | File paths this feature will create or modify. Must be specific paths, not patterns.                                                                                                                                                                                                                                                                                          |
| `dependencies`        | yes      | List of feature IDs that must be completed first. Empty array if none.                                                                                                                                                                                                                                                                                                        |
| `spec_refs`           | yes      | References to upstream spec documents. **Should** accurately include relevant spec documents under `specs/` that this feature touches; for other artifacts like `design.md`, `api.yaml`, `database.md`, accurately reference the specific parts this feature touches. (e.g. `openpowers/changes/<name>/specs/auth/spec.md#login`, `openpowers/changes/<name>/design.md#auth`) |
| `status`              | yes      | `pending` / `in_progress` / `done` / `skipped` / `blocked`. Default: `pending`                                                                                                                                                                                                                                                                                                |

## Self-Review

After writing the complete feature list, check against the design and specs. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the specs and design. Can you point to a feature that implements it? List any gaps.

**2. Dependency validity:** Every ID in a `dependencies` array must exist as another feature's `id`. No circular dependencies.

**3. File path consistency:** Do the files referenced across features align? If feature A creates a module that feature B uses, do the paths match?

**4. Acceptance criteria quality:** Each criterion must be objectively verifiable — not vague ("works correctly"), but specific ("returns 401 for invalid password").

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a requirement from specs/design with no feature, add the feature.

## Completion

After saving the plan, inform the user that all preparation is complete and they can use `openpowers-sdd` to execute the change.
