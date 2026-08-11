# spec-change-new

> Source files:
> - `src/commands/change/new.ts` : 1-91
> - `src/commands/change/shared.ts` : 1-314
> - `src/utils/memory.ts` : 856-895

## Overview

`spec-change-new` covers the "create new change" functionality within the Furina CLI change management system. This spec is responsible for the complete lifecycle of creating a new change entry: validating the change name against kebab-case naming conventions, creating the change directory under `furina/changes/`, registering the change entry in the project-local `changes.json`, and synchronizing the entry to the global memory `changes.json`.

**Design motivation**: Furina organizes work items as "changes" -- discrete units of work tracked through a structured artifact workflow (proposal -> design -> specs -> plan -> implementation). Each change needs a filesystem directory to hold its artifacts and a registry entry for tracking progress. The `new` command bootstraps both of these in one atomic operation.

**Key design decisions**:
- **Duplicate handling**: When a change with the same name already exists in `changes.json`, the command does not fail. Instead, it updates the description and `updateAt` timestamp of the existing entry. This makes the command idempotent and safe for repeated invocations.
- **Two-tier storage**: Changes are tracked in both a project-local `changes.json` (inside `furina/`) and a global memory file (inside `~/.furina/memory/`). Both are updated on creation.
- **Sync-first approach**: Before checking for duplicates, the command calls `syncChangesJson()` to reconcile the `changes.json` file with the actual filesystem state, ensuring the duplicate check operates on up-to-date data.

**Usage scenarios**:
- Starting a new feature or bugfix: `furina change new my-feature --desc "Add user authentication"`
- Re-running to update a description: `furina change new my-feature --desc "Updated description"`
- Called by workflow automation scripts that need to ensure a change exists before proceeding

**Involved source files**:
| File | Responsibility |
|------|---------------|
| `src/commands/change/new.ts` | Entry point: orchestrates validation, directory creation, JSON registration, and memory sync |
| `src/commands/change/shared.ts` | Provides path constants (`CHANGES_DIR`, `CHANGES_JSON_PATH`), `validateChangeName()`, `syncChangesJson()`, and `toRelativePath()` |
| `src/utils/memory.ts` | Provides `createOrUpdateChange()` for global memory synchronization |
| `src/commands/change/index.ts` | Registers the `change new <name>` CLI command with Commander.js |

## Architecture / Flow

The `runChangeNew` function follows a linear execution flow with one conditional branch for duplicate detection:

```
User Input (name, --desc)
        |
        v
[1] validateChangeName(name)
        |
        |-- invalid --> stderr + process.exit(1)
        |
        v (valid)
[2] syncChangesJson()
        |
        v
[3] Check: existing = data.changes.find(c => c.name === name)?
        |
        |-- exists --> [3a] Update description + updateAt
        |              [3b] Write changes.json
        |              [3c] createOrUpdateChange() (global memory)
        |              [3d] Print "already exists, description updated"
        |              [3e] return
        |
        v (new)
[4] mkdirSync(changeDir)
        |
        v
[5] Build newEntry object (name, path, description, createdAt, features, todo, artifacts)
        |
        v
[6] Push to data.changes[]
        |
        v
[7] Write changes.json
        |
        v
[8] createOrUpdateChange() (global memory)
        |
        v
[9] Print "created successfully"
```

The two-tier write ensures both project-local and global memory registries are consistent. The project-local `changes.json` serves as the source of truth for the CLI, while the global memory enables cross-session awareness (e.g., UI dashboards, memory sync).

## Functionality / Interface Details

### `runChangeNew(name: string, options: { desc: string }) -> void`

**Source**: `src/commands/change/new.ts`:25-91

**Functionality**: This is the main entry point for the `furina change new` CLI command. It orchestrates the entire creation flow: validates the change name, ensures `changes.json` is synchronized with the filesystem, handles duplicate detection, creates the filesystem directory, builds and registers the change entry in `changes.json`, and syncs to global memory. The function writes directly to stdout/stderr and may call `process.exit(1)` on validation failure.

**Parameters**:
- `name` (`string`): The change name, which must follow kebab-case convention (lowercase alphanumeric with hyphens, starting with a lowercase letter). Examples: `my-feature`, `fix-login-bug`, `v2-migration`. Validated by `validateChangeName()` using the regex `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`.
- `options` (`{ desc: string }`): Command options object. `desc` is a required CLI option (`--desc`) containing a human-readable description of the change. If `desc` is undefined at runtime (defensive fallback), the change name itself is used as the description.

**Return Value**:
- `void`: The function performs side effects (filesystem writes, stdout output) and does not return a value. On validation failure, it terminates the process with exit code 1.

**Core Logic**:

1. **Validation phase**: Calls `validateChangeName(name)` from `shared.ts`. If validation fails, writes the error to both stderr and the logger, then exits with code 1.

2. **Sync phase**: Calls `syncChangesJson()` which reads the current `changes.json`, scans the `furina/changes/` and `furina/archive/` directories, rebuilds the entries from the filesystem state (computing features/todo from `plan.json`, scanning for artifacts), and writes the updated JSON back to disk. This ensures the subsequent duplicate check operates on fresh data.

3. **Duplicate detection**: Searches the synced `data.changes` array for an entry with a matching `name`. If found:
   - Updates the `description` field to the new `options.desc` value
   - Sets `updateAt` to the current ISO timestamp
   - Writes the updated JSON back to `changes.json`
   - Calls `createOrUpdateChange()` to sync to global memory
   - Outputs a message to stdout: `Change '<name>' already exists, description updated`
   - Returns early without creating a directory or new entry

4. **Creation phase** (for new changes):
   - Creates `furina/changes/<name>` directory (skips silently if it already exists)
   - Constructs a new entry object with: `name`, `path` (relative, forward-slash normalized), `description`, `createdAt` (ISO timestamp), `features: 0`, `todo: 0`, `artifacts: []`
   - Appends the entry to `data.changes`
   - Writes the updated JSON to `changes.json`
   - Calls `createOrUpdateChange()` to sync to global memory
   - Outputs to stdout: `Change '<name>' created successfully`

**Core Code**:
```typescript
export function runChangeNew(name: string, options: { desc: string }): void {
  // Validate name format
  const validation = validateChangeName(name);
  if (!validation.valid) {
    process.stderr.write(`${validation.error}\n`);
    logger.error(validation.error);
    process.exit(1);
  }

  // Sync changes.json from filesystem, then check for duplicate
  const data = syncChangesJson();
  const existing = data.changes.find((c) => c.name === name);
  if (existing) {
    existing.description = options.desc ?? name;
    existing.updateAt = new Date().toISOString();

    // Write back
    const dir = path.dirname(CHANGES_JSON_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CHANGES_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');

    // Sync to global memory changes.json
    createOrUpdateChange(process.cwd(), name, options.desc ?? name);

    process.stdout.write(`Change '${name}' already exists, description updated\n`);
    return;
  }

  const changeDir = path.join(CHANGES_DIR, name);

  // Create the change directory (silently skip if exists)
  if (!fs.existsSync(changeDir)) {
    fs.mkdirSync(changeDir, { recursive: true });
    logger.info(`Created directory: ${changeDir}`);
  } else {
    logger.info(`Directory already exists: ${changeDir}`);
  }

  // Create new entry
  const newEntry = {
    name,
    path: toRelativePath(changeDir),
    description: options.desc ?? name,
    createdAt: new Date().toISOString(),
    features: 0,
    todo: 0,
    artifacts: [],
  };

  // Append to changes array
  data.changes.push(newEntry);

  // Write back
  const dir = path.dirname(CHANGES_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CHANGES_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');

  // Sync to global memory changes.json
  createOrUpdateChange(process.cwd(), name, options.desc ?? name);

  logger.info(`Change '${name}' registered in changes.json`);
  process.stdout.write(`Change '${name}' created successfully\n`);
}
```
Source: `src/commands/change/new.ts`:25-91

**Usage Example**:
```typescript
// Called by Commander.js action handler in index.ts
changeCmd
  .command('new <name>')
  .description('Create a new change')
  .requiredOption('--desc <description>', 'Brief description of the change')
  .action((name: string, options: { desc: string }) => {
    runChangeNew(name, options);
  });
```
Explanation: Commander.js parses the CLI input `furina change new my-feature --desc "Add auth"` and invokes `runChangeNew("my-feature", { desc: "Add auth" })`. The function validates `my-feature` as valid kebab-case, creates the directory `furina/changes/my-feature/`, registers the entry in `changes.json`, and syncs to global memory.

---

### `validateChangeName(name: string) -> { valid: boolean; error?: string }`

**Source**: `src/commands/change/shared.ts`:81-86

**Functionality**: Validates that a change name conforms to the kebab-case naming convention. The kebab-case pattern enforces that the name starts with a lowercase letter, followed by lowercase letters, digits, or hyphens, with no consecutive hyphens and no trailing hyphens. This ensures change names are filesystem-safe (no special characters), URL-friendly, and consistent across the project.

**Parameters**:
- `name` (`string`): The change name string to validate. Typically provided as the first positional argument in the CLI command.

**Return Value**:
- `{ valid: boolean; error?: string }`: An object with `valid: true` if the name passes validation, or `valid: false` with an `error` message string if it fails.

**Core Logic**:
The function tests the name against the `KEBAB_CASE` regex pattern `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`. This pattern means:
- Must start with a lowercase letter (`[a-z]`)
- First segment: lowercase letters or digits (`[a-z0-9]*`)
- Subsequent segments: hyphen followed by lowercase letters/digits (`-[a-z0-9]+`)
- No consecutive hyphens, no trailing hyphens, no uppercase letters, no underscores

**Core Code**:
```typescript
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validateChangeName(name: string): { valid: boolean; error?: string } {
  if (!KEBAB_CASE.test(name)) {
    return { valid: false, error: 'Change name must be kebab-case (e.g., my-change)' };
  }
  return { valid: true };
}
```
Source: `src/commands/change/shared.ts`:45-86

**Usage Example**:
```typescript
const result = validateChangeName('my-feature');
// result: { valid: true }

const result2 = validateChangeName('Invalid_Name');
// result2: { valid: false, error: 'Change name must be kebab-case (e.g., my-change)' }

const result3 = validateChangeName('123-start');
// result3: { valid: false, error: '...' } -- must start with a letter
```
Explanation: Valid names like `my-feature`, `fix-login`, `v2-migration` pass validation. Names with uppercase, underscores, consecutive hyphens, or leading digits are rejected.

---

### `syncChangesJson() -> { framework: string; version: string; changes: Array<Record<string, unknown>>; archive: Array<Record<string, unknown>> }`

**Source**: `src/commands/change/shared.ts`:177-304

**Functionality**: Synchronizes the project-local `furina/changes.json` with the actual filesystem state. This is a critical reconciliation function that ensures the JSON registry accurately reflects what exists on disk. It scans both active changes (in `furina/changes/`) and archived changes (in `furina/archive/`), recomputes `features`/`todo` counts from `plan.json` files, rebuilds artifact lists by checking for file existence, and writes the reconciled data back to disk. This function is called at the start of `runChangeNew` to ensure the duplicate detection operates on current data.

**Parameters**:
- None (uses `process.cwd()` implicitly for path resolution).

**Return Value**:
- `{ framework, version, changes, archive }`: The synchronized changes.json structure. `framework` and `version` are sourced from `package.json`. `changes` is an array of active change entries, `archive` is an array of archived change entries.

**Core Logic**:
1. Loads or creates `changes.json` via `loadOrCreateChangesJson()`
2. Scans `furina/changes/` for subdirectories (excluding `archive` and dotfiles)
3. For each active directory, builds an entry preserving existing `description` and `createdAt` from the JSON, and recomputing `features`/`todo` from `plan.json` and `artifacts` from filesystem scan
4. Scans `furina/archive/` similarly, stripping the `YYYY-MM-DD-` prefix from directory names
5. Replaces the `changes` and `archive` arrays in the data object with the rebuilt arrays
6. Writes the result back to `changes.json`

**Core Code** (excerpt showing active changes scan):
```typescript
export function syncChangesJson() {
  const data = loadOrCreateChangesJson();

  // --- Scan active changes ---
  const activeDirs: string[] = [];
  if (fs.existsSync(CHANGES_DIR)) {
    const entries = fs.readdirSync(CHANGES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.')) {
        activeDirs.push(entry.name);
      }
    }
  }

  // Index existing changes by name for fast lookup
  const existingChangesMap = new Map<string, Record<string, unknown>>();
  for (const ch of data.changes) {
    if (ch.name && typeof ch.name === 'string') {
      existingChangesMap.set(ch.name, ch as Record<string, unknown>);
    }
  }

  // Rebuild changes array from filesystem scan
  const newChanges: Array<Record<string, unknown>> = [];
  for (const dirName of activeDirs) {
    const changePath = path.join(CHANGES_DIR, dirName);
    const planPath = path.join(changePath, 'plan.json');
    const existing = existingChangesMap.get(dirName);

    const entry: Record<string, unknown> = {
      name: dirName,
      path: toRelativePath(changePath),
      description: (existing?.description as string) ?? '',
      createdAt: (existing?.createdAt as string) ?? new Date().toISOString(),
      features: 0,
      todo: 0,
      artifacts: buildArtifacts(changePath),
    };

    const progress = computeProgress(planPath);
    entry.features = progress.features;
    entry.todo = progress.todo;
    // ... preserve existing fields, push to newChanges
  }
  data.changes = newChanges;
  // ... scan archive, write back
}
```
Source: `src/commands/change/shared.ts`:177-304

**Usage Example**:
```typescript
// Called at the start of runChangeNew to ensure fresh data
const data = syncChangesJson();
const existing = data.changes.find((c) => c.name === name);
if (existing) {
  // Handle duplicate
}
```
Explanation: `syncChangesJson()` is called before the duplicate check in `runChangeNew`. This ensures that even if the filesystem state has changed since the last write to `changes.json` (e.g., manual directory creation/deletion), the duplicate check is performed against the current reality.

---

### `createOrUpdateChange(cwd: string, changeName: string, desc?: string, changeStage?: StageUpdate) -> void`

**Source**: `src/utils/memory.ts`:856-895

**Functionality**: Creates or updates a change entry in the global memory `changes.json` file located at `~/.furina/memory/<flattenedCwd>/changes.json`. This is the global counterpart to the project-local `changes.json`. The function first ensures the memory file exists (seeding from the project file if needed), then either updates an existing entry or creates a new one. In the context of `runChangeNew`, this function is called with `cwd` and `changeName` only (no `changeStage`), performing a simple create-or-update-description operation.

**Parameters**:
- `cwd` (`string`): The current working directory, used to derive the memory file path. Passed as `process.cwd()` from `runChangeNew`.
- `changeName` (`string`): The kebab-case change name, used to find or create the entry.
- `desc` (`string`, optional): The change description. When provided, updates the existing entry's description field.
- `changeStage` (`StageUpdate`, optional): Partial stage data to merge. Not used by `runChangeNew`.

**Return Value**:
- `void`: Side effects only (writes to global memory file).

**Core Logic**:
1. Calls `ensureMemoryChangesJson(cwd)` to load or seed the global memory
2. Searches for an existing entry by `changeName`
3. If found: updates `description` (if provided), sets `updateAt` to current timestamp, syncs progress from filesystem
4. If not found: creates a new `ChangeEntry` with `status: 'active'`, default zero counts, and empty artifacts, then syncs progress
5. Writes the updated data back via `writeMemoryChangesJson()`

**Core Code** (from `memory.ts`):
```typescript
export function createOrUpdateChange(
  cwd: string,
  changeName: string,
  desc?: string,
  changeStage?: StageUpdate,
): void {
  const data = ensureMemoryChangesJson(cwd);
  const existing = data.changes.find((c) => c.name === changeName);

  if (existing) {
    if (desc !== undefined) {
      existing.description = desc;
    }
    existing.updateAt = new Date().toISOString();
    if (changeStage) {
      createOrUpdateStage(existing, changeStage);
    }
    syncEntryProgress(existing, cwd, changeName);
  } else {
    const newChange: ChangeEntry = {
      name: changeName,
      path: `furina/changes/${changeName}`,
      description: desc ?? '',
      createdAt: new Date().toISOString(),
      updateAt: new Date().toISOString(),
      status: 'active',
      features: 0,
      todo: 0,
      artifacts: [],
    };
    if (changeStage) {
      createOrUpdateStage(newChange, changeStage);
    }
    syncEntryProgress(newChange, cwd, changeName);
    data.changes.push(newChange);
  }

  writeMemoryChangesJson(cwd, data);
}
```
Source: `src/utils/memory.ts`:856-895

**Usage Example**:
```typescript
// In runChangeNew, after writing project-local changes.json:
createOrUpdateChange(process.cwd(), name, options.desc ?? name);
// This creates/updates the entry in ~/.furina/memory/<flattenedCwd>/changes.json
```
Explanation: Called from `runChangeNew` to ensure the global memory registry is kept in sync. The `process.cwd()` argument determines which project's memory file to update.

---

## Data Structures

### Project-local `changes.json` Entry (inline in `runChangeNew`)
```typescript
{
  name: string;           // Kebab-case change identifier
  path: string;           // Relative path with forward slashes (e.g., "furina/changes/my-feature")
  description: string;    // Human-readable description from --desc option
  createdAt: string;      // ISO 8601 timestamp of creation
  features: number;       // Total feature count (initialized to 0)
  todo: number;           // Incomplete feature count (initialized to 0)
  artifacts: Array<never>; // Empty array for newly created changes
}
```
- `name`: Derived from CLI positional argument, validated as kebab-case
- `path`: Computed by `toRelativePath(changeDir)`, converts absolute path to relative with forward slashes for cross-platform portability
- `description`: Falls back to `name` if `options.desc` is undefined
- `createdAt`: Set once at creation time, never modified by `runChangeNew`
- `features` / `todo`: Initialized to 0; will be populated when `plan.json` is created during the planning phase
- `artifacts`: Empty at creation; populated by `syncChangesJson()` on subsequent reads

### Duplicate Entry Update Fields
When an existing change is detected, only two fields are modified:
```typescript
{
  description: string;  // Updated to new options.desc value
  updateAt: string;     // ISO 8601 timestamp, set to current time
}
```
- `createdAt` is preserved from the original entry
- `features`, `todo`, `artifacts` are not modified during the duplicate update path

### Global Memory `ChangeEntry` (from `memory.ts`)
```typescript
interface ChangeEntry {
  name: string;
  path: string;
  description: string;
  createdAt: string;
  updateAt?: string;
  status: 'active' | 'archived' | 'removed';
  features: number;
  todo: number;
  artifacts: Array<{ id: string; outputPath: string }>;
  stage?: ChangeStage;
}
```
- `status`: Always `'active'` when created via `createOrUpdateChange`
- `updateAt`: Set on both create and update operations
- `stage`: Not set by `runChangeNew`; populated by `furina change stage` commands

### Path Constants (from `shared.ts`)
```typescript
const CHANGES_DIR = path.join(process.cwd(), 'furina', 'changes');
const CHANGES_JSON_PATH = path.join(process.cwd(), 'furina', 'changes.json');
```
- `CHANGES_DIR`: Absolute path to the active changes directory. Each subdirectory represents one change.
- `CHANGES_JSON_PATH`: Absolute path to the project-local change registry file.

### Kebab-case Validation Pattern (from `shared.ts`)
```typescript
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
```
- Allows: `my-feature`, `fix-bug`, `v2`, `add-user-auth`
- Rejects: `MyFeature`, `my_feature`, `my--feature`, `-my-feature`, `123-start`

## Error Handling and Edge Cases

### Validation Failure
When the change name fails kebab-case validation:
- Error message is written to both `process.stderr` and the logger
- Process exits with code 1 (`process.exit(1)`)
- No filesystem side effects occur (no directory creation, no JSON writes)

### Duplicate Change Name
When a change with the same name already exists in `changes.json`:
- The command does **not** fail or exit with an error
- Instead, it updates `description` and `updateAt` of the existing entry
- The project-local and global memory are both updated
- A descriptive message is printed: `Change '<name>' already exists, description updated`
- The function returns early without attempting directory creation or new entry registration

### Directory Already Exists
When `furina/changes/<name>` already exists on disk but is not yet registered in `changes.json`:
- `mkdirSync` with `{ recursive: true }` silently succeeds (no `EEXIST` error)
- A log message is emitted: `Directory already exists: <path>`
- The entry is still registered in `changes.json` as a new entry

### Missing `changes.json`
When `furina/changes.json` does not exist:
- `syncChangesJson()` calls `loadOrCreateChangesJson()` which auto-creates it with default structure
- The parent directory (`furina/`) is also created if missing
- This ensures `runChangeNew` never fails due to a missing registry file

### Missing `options.desc`
If `options.desc` is undefined at runtime (despite being a required CLI option):
- The code falls back to `options.desc ?? name`, using the change name as the description
- This is a defensive guard; Commander.js enforces the `--desc` option as required at the CLI level

### Two-Phase Write Consistency
The function writes to two separate locations (project-local `changes.json` and global memory):
- If the first write succeeds but the second fails (e.g., disk full, permission error on home directory), the project-local state will be updated but global memory will be stale
- On next invocation, `syncChangesJson()` will reconcile the project-local state, and `ensureMemoryChangesJson()` will re-seed from the project file if the global memory is corrupted

## Dependencies

- **Depends on**:
  - `src/commands/change/shared.ts` -- Provides path constants, `validateChangeName()`, `syncChangesJson()`, `toRelativePath()`, and `buildArtifacts()`. This is the primary dependency for all change-related utilities.
  - `src/utils/memory.ts` -- Provides `createOrUpdateChange()` for global memory synchronization. Depends on `ensureMemoryChangesJson()`, `writeMemoryChangesJson()`, and `syncEntryProgress()` internally.
  - `src/utils/logger.ts` -- Provides the `logger` instance for info/error logging.
  - Node.js built-in modules: `fs` (filesystem operations), `path` (path manipulation).

- **Depended by**:
  - `src/commands/change/index.ts` -- Registers the `change new <name>` Commander.js command and calls `runChangeNew()` in its action handler.
  - CLI consumers: Any user or automation script running `furina change new <name> --desc <description>`.
  - Workflow automation: The Furina workflow system may invoke this command as part of the propose/change-initiation phase.

## Usage Examples

### Creating a New Change from CLI

```bash
# Basic usage: create a new change with a description
furina change new add-user-auth --desc "Implement JWT-based user authentication"

# Expected output:
# Change 'add-user-auth' created successfully

# This creates:
# - Directory: furina/changes/add-user-auth/
# - Entry in: furina/changes.json
# - Entry in: ~/.furina/memory/<project>/changes.json
```

### Updating Description of Existing Change

```bash
# Run again with a different description
furina change new add-user-auth --desc "Implement OAuth2 and JWT authentication"

# Expected output:
# Change 'add-user-auth' already exists, description updated
```

### Programmatic Usage

```typescript
import { runChangeNew } from './commands/change/new.js';

// Create a new change
runChangeNew('refactor-database', {
  desc: 'Migrate from SQLite to PostgreSQL'
});

// Idempotent: run again to update description
runChangeNew('refactor-database', {
  desc: 'Migrate from SQLite to PostgreSQL with connection pooling'
});
```

Explanation: The function is idempotent -- calling it multiple times with the same name but different descriptions will update the description rather than creating duplicate entries or failing. The first call creates the directory and entry; subsequent calls only update `description` and `updateAt`.

### Typical Integration in Workflow

```typescript
// In a workflow script that orchestrates the full change lifecycle:
// Step 1: Create the change
runChangeNew('feature-name', { desc: 'Feature description' });

// Step 2: Generate proposal (separate command)
// furina change instruction feature-name --proposal

// Step 3: Track stage progress (separate command)
// furina change stage propose --session <id> --status in_progress
```

Explanation: `runChangeNew` is the first step in the Furina change workflow. It bootstraps the change directory and registry, after which other commands (instruction, stage, feature) can operate on the change.
