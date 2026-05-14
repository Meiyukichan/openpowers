---
name: openpowers-plan
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Break implementation work into independent, trackable features. Each feature describes WHAT to build, not HOW — implementation details are left to the executing agent.

Output is a feature list JSON file that serves as the execution contract: agents pick up features by status, know what's done, and can resume seamlessly across sessions.

**Save plans to:** `openspec/changes/<name>/plan.json`

## Skill Configuration

Query the skill configuration using the following script:

```bash
python ${CLAUDE_PLUGIN_ROOT}/scripts/config.py {current_project_path} language experimental.plan-factor
```

Returns two values in order:

1. `language` — Output language. Use this as the language for all user-facing answers and outputs in this skill. If None, default to Chinese.
2. `experimental.plan-factor` — Feature budget multiplier, controls the maximum number of features in the generated plan. Maximum value: 3.

## openspec Artifacts Location

**Read existing artifacts for context** (skip if already read):

- `openspec/changes/<name>/specs/**/*.md`
- `openspec/changes/<name>/proposal.md`
- `openspec/changes/<name>/design.md`
- `openspec/changes/<name>/tasks.md` (your most direct basis for planning)
- `openspec/changes/<name>/api.yaml`
- `openspec/changes/<name>/database.md`
- etc.

**All four artifact types (proposal.md, design.md, tasks.md, specs/) must exist.** If any is missing, the previous phase is incomplete — stop executing this skill and remind the user to run `openpowers-propose` first.

All planning decisions must reference specific sections/sentences from these specs.

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

**First principle:** the generated plan MUST NOT contain more than `experimental.plan-factor` × (number of spec files in `openspec/changes/<name>/specs/`(minimum: 1)) features.

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
    "files": ["src/auth/login.ts", "src/auth/login.test.ts"],
    "dependencies": [],
    "spec_refs": [
      "openspec/changes/<name>/specs/auth/spec.md#login",
      "openspec/changes/<name>/design.md#auth",
      "openspec/changes/<name>/tasks.md#auth-001"
    ],
    "status": "pending"
  }
]
```

### Field Definitions

| Field                 | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | yes      | Unique identifier, used in dependencies references. Format: `{category-prefix}-{number}`                                                                                                                                                                                                                                                                                                                                           |
| `category`            | yes      | Module/subsystem this feature belongs to                                                                                                                                                                                                                                                                                                                                                                                           |
| `function`            | yes      | Feature name, concise and specific                                                                                                                                                                                                                                                                                                                                                                                                 |
| `description`         | yes      | What to build — enough context for an agent to make good implementation decisions, but NO code                                                                                                                                                                                                                                                                                                                                     |
| `acceptance_criteria` | yes      | List of verifiable conditions. Spec reviewers check against these.                                                                                                                                                                                                                                                                                                                                                                 |
| `files`               | yes      | File paths this feature will create or modify. Must be specific paths, not patterns.                                                                                                                                                                                                                                                                                                                                               |
| `dependencies`        | yes      | List of feature IDs that must be completed first. Empty array if none.                                                                                                                                                                                                                                                                                                                                                             |
| `spec_refs`           | yes      | References to upstream spec documents. **Should** accurately include relevant spec documents under `specs/` that this feature touches; for other artifacts like `design.md`, `tasks.md`, `api.yaml`, `database.md`, accurately reference the specific parts this feature touches. (e.g. `openspec/changes/<name>/specs/auth/spec.md#login`, `openspec/changes/<name>/design.md#auth`, `openspec/changes/<name>/tasks.md#auth-001`) |
| `status`              | yes      | `pending` / `in_progress` / `done` / `skipped` / `blocked`. Default: `pending`                                                                                                                                                                                                                                                                                                                                                     |

## Self-Review

After writing the complete feature list, check against the design, tasks, and specs. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the specs, design, and tasks. Can you point to a feature that implements it? List any gaps.

**2. Dependency validity:** Every ID in a `dependencies` array must exist as another feature's `id`. No circular dependencies.

**3. File path consistency:** Do the files referenced across features align? If feature A creates a module that feature B uses, do the paths match?

**4. Acceptance criteria quality:** Each criterion must be objectively verifiable — not vague ("works correctly"), but specific ("returns 401 for invalid password").

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a requirement from specs/design/tasks with no feature, add the feature.

## Completion

After saving the plan, inform the user that all preparation is complete and they can use `openpowers-sdd` to execute the change.
