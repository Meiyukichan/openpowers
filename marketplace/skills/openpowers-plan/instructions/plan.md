# Plan Instruction

Break implementation work into independent, trackable features. Each feature describes WHAT to implement, not HOW — implementation details are left to the executing agent.
Output is a feature list JSON file that serves as the execution contract: agents pick up features by status, know what's done, and can resume seamlessly across sessions.

## Feature Factor

Feature budget multiplier (**default 0.5**), controls the MAXIMUM number of features in the generated plan. This factor has a maximum value of 3.

Query the `feature factor` using the following script:

```bash
openpowers config show experimental.factor
```

## Workflow

### 1. Collect OpenPowers Artifacts

**Read existing artifacts for context (SKIP if you ALREADY read)**:

- `openpowers/changes/<name>/specs/**/*.md`
- `openpowers/changes/<name>/proposal.md`
- `openpowers/changes/<name>/design.md`
- `openpowers/changes/<name>/api.yaml`
- `openpowers/changes/<name>/database.md`

All planning decisions must reference specific sections/sentences from these specs.

### 2. Task Breakdown

Before writing the plan, you MUST first break down the implementation work into a task list based on the OpenPowers artifacts you read, following this template:

```
## 1. <!-- Task group name -->

1.1 <!-- Task description -->
1.2 <!-- Task description -->
...
```

**IMPORTANT: must NOT write this task list to any tasks.md file.**

### 3. Generate Plan

As rules of following, template of `JSON Schema` and the law of `First Principle` to generate a `plan.json` for implementation work.

#### Feature Granularity

Each feature must be an independently testable unit of work — completable by an agent in a single focused session while delivering meaningful business value.

**Handling too large or too fine-grained specs**:
- **Too large**: If a spec covers multiple independent subsystems, split it into multiple plans (one per subsystem) and split the spec documents accordingly. Each plan should independently deliver working, testable software.
- **Too fine-grained**: If the granularity is so small that the plan would contain too many features or become unreasonable, merge related specs to form more meaningful, self-contained feature units.

**Examples:**:
- Good feature: "User login with email and password, returns JWT token"
- Bad (too large): "Authentication system"
- Bad (too small): "Add `import jwt` to auth module"

**First principle**:
- plan.json MUST NOT contain more than `feature factor` × (number of spec files in `openpowers/changes/<name>/specs/`) features (minimum of features: 1).
- A single feature is scoped to an `estimated` delta of `30–500` lines of new or modified code (excluding blanks and comments).

#### File Structure

Before defining features, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- New or modified code in a single file should not exceed 300 lines (excluding blanks and comments). If a file grows too large, split its responsibilities.
- Prefer smaller, focused files over large ones that do too much — this helps you hold the entire context in a single session.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure — but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs feature decomposition. Each feature should produce self-contained, meaningful changes with an estimated code delta of 30–500 lines (excluding blanks and comments).

#### Dependency Ordering

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

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique identifier for the feature, used in dependency references. Format: `{category-prefix}-{number}` (e.g., `auth-01`, `db-03`). |
| `category` | yes | The module or subsystem this feature belongs to (e.g., `auth`, `database`, `frontend`). |
| `function` | yes | Concise and specific name of the feature (e.g., `User Login`, `Export Report`). |
| `description` | yes | What to implement — provides enough context for an agent to make sound implementation decisions. **Do not include code.** Focus on purpose, scope, and key behavior. |
| `acceptance_criteria` | yes | A list of verifiable conditions that must be satisfied for the feature to be considered complete. Used by spec reviewers to validate the implementation. |
| `tasks` | yes | A list of concrete tasks to be completed for this feature. Each task should be actionable and testable. |
| `files` | yes | Specific file paths that this feature will create or modify. Use absolute or relative paths from the project root. **Do not use patterns or wildcards** (e.g., `src/auth/login.ts`, `docs/api.md`). |
| `dependencies` | yes | A list of feature IDs that must be completed before this feature can be started. Use an empty array (`[]`) if there are no dependencies. |
| `spec_refs` | yes | References to upstream specification documents. Must accurately point to relevant parts of specs under `specs/`, or to other artifacts like `design.md`, `api.yaml`, `database.md`. Use anchors or line references where applicable (e.g., `openpowers/changes/<name>/specs/auth/spec.md#login`, `openpowers/changes/<name>/design.md#authentication-flow`). |
| `status` | yes | Current state of the feature. Allowed values: `pending`, `in_progress`, `done`, `skipped`, `blocked`. Default: `pending`. |

## Self-Review

1. `Spec coverage`: Skim each section/requirement in the specs and design. Can you point to a feature that implements it? List any gaps.
2. `Dependency validity`: Every ID in a `dependencies` array must exist as another feature's `id`. No circular dependencies.
3. `File path consistency`: Do the files referenced across features align? If feature A creates a module that feature B uses, do the paths match?
4. `Acceptance criteria quality`: Each criterion must be objectively verifiable — not vague ("works correctly"), but specific ("returns 401 for invalid password").

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a requirement from specs/design with no feature, add the feature.

## First Principle

- plan.json MUST NOT contain more than `feature factor` × (number of spec files in `openpowers/changes/<name>/specs/`) features (minimum of features: 1).
- A single feature is scoped to an `estimated` delta of `30–500` lines of new/modified code (excluding blanks and comments).

## Output

- `openpowers/changes/<name>/plan.json`

## Completion

After saving the plan, inform the user that all preparation is complete and they can use `openpowers-sdd` to execute the change.