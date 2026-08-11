# change archive -- Change Archiving and Lifecycle Closure

> Source files:
> - `src/commands/change/archive.ts` : 1-149

## Overview

`spec-change-archive` covers the archival workflow for completed changes in the Furina CLI. When a change's development lifecycle is finished -- all core artifacts (proposal, design, specs) and non-core artifacts (plan, api, database) are in `done` status -- the `change archive` command finalizes the change by:

1. **Validating readiness**: Confirming the change exists, is active (not already archived), and all artifacts reported by `computeArtifactStatus` are in `done` state.
2. **Atomically moving the directory**: Using `fs.renameSync` to move the change directory from `furina/changes/<name>/` to `furina/archive/YYYY-MM-DD-<name>/`.
3. **Updating project-level `changes.json`**: Removing the entry from the `changes` array and appending it to the `archive` array with a `closedAt` timestamp.
4. **Synchronizing global memory**: Updating the user-level `~/.furina/memory/<flatCwd>/changes.json` to mark the change's `status` as `archived` and its `stage.finalize.archive` step as `done`.

This spec's role in the system is to provide the definitive closure mechanism for change lifecycle management. It acts as the bridge between the active development phase (where changes live in `furina/changes/`) and the historical record (where archived changes live in `furina/archive/`).

**Design motivation**: Archiving enforces a quality gate -- only changes with all artifacts completed can be archived. This prevents premature closure of incomplete work. The atomic rename ensures no data loss during the move. The dual-write to both project-level and global memory `changes.json` keeps both local and cross-project state consistent.

**Usage scenarios**:
- End of a change development cycle, when all features are implemented and all artifacts are done
- CLI invocation: `furina change archive <name>`
- Called by the `furina:furina-finalize` skill as the final step of change finalization

**Involved source files and responsibilities**:

| File | Responsibility |
|------|---------------|
| `src/commands/change/archive.ts` | Core archival logic: validation, directory move, JSON updates, memory sync |
| `src/commands/change/shared.ts` | Path constants (`CHANGES_DIR`, `ARCHIVE_DIR`, `CHANGES_JSON_PATH`), `syncChangesJson()` for loading current state |
| `src/commands/change/status.ts` | `computeArtifactStatus()` for computing the pipeline status of all artifacts in a change directory |
| `src/utils/memory.ts` | `flattenCwdPath()` for converting cwd to safe directory name, `writeMemoryChangesJson()` for persisting global memory, `ChangesJson` type |
| `src/commands/change/index.ts` | Upstream caller: registers `archive <name>` subcommand on the commander CLI |
| `src/utils/logger.ts` | `logger` for info/warn/error messages |

## Architecture / Flow

The archival process follows a strict sequential flow with validation gates at each step:

```
runChangeArchive(name)
  |
  v
[1] syncChangesJson() -- load current project state
  |
  v
[2] Check archive array: is name already archived?
  |-- YES --> stderr "already archived" --> exit(1)
  |-- NO  --> continue
  |
  v
[3] Check changes array: does name exist as active change?
  |-- NO  --> stderr "not found" --> exit(1)
  |-- YES --> continue
  |
  v
[4] computeArtifactStatus(changeDirPath) -- compute artifact pipeline
  |
  v
[5] Filter artifacts where status !== 'done'
  |-- HAS NOT-DONE --> stderr "not all artifacts are done" + list --> exit(1)
  |-- ALL DONE     --> continue
  |
  v
[6] Build target path: ARCHIVE_DIR/YYYY-MM-DD-<name>
  |
  v
[7] Ensure ARCHIVE_DIR exists (mkdir if needed)
  |
  v
[8] fs.renameSync(changeDirPath, targetDir) -- atomic move
  |
  v
[9] Update changes.json: remove from changes[], add to archive[] with closedAt
  |
  v
[10] Sync global memory changes.json:
     |-- Read ~/.furina/memory/<flatCwd>/changes.json
     |-- Find matching change entry
     |-- Set status = 'archived'
     |-- Set stage.finalize.archive.status = 'done'
     |-- Set stage.finalize.archive.to = current ISO timestamp
     |-- Write back via writeMemoryChangesJson()
  |
  v
[11] stdout: "Change '<name>' archived successfully to furina/archive/YYYY-MM-DD-<name>/"
```

**Key design decisions**:
- Validation happens **before** any filesystem mutation, preventing partial state.
- The archive check (step 2) happens before the active change check (step 3), providing a more specific error message for duplicate archive attempts.
- Global memory sync (step 10) is wrapped in a try-catch -- failures are logged but do not prevent the archival from completing. This ensures project-level archival always succeeds even if the global memory system is in a bad state.

## Functionality / Interface Details

### `runChangeArchive(name: string) -> void`

**Source**: `src/commands/change/archive.ts`:29-149

**Functionality**: The main entry point for the change archive command. It performs the complete archival lifecycle: validating the change exists and is active, checking that all artifacts are done, atomically moving the change directory to the archive location, updating the project-level `changes.json`, and synchronizing the global memory `changes.json`. On any validation failure, the function writes an error message to stderr and exits with code 1. On success, it writes a confirmation message to stdout.

**Parameters**:
- `name` (`string`): The kebab-case name of the change to archive. Must match an existing active change in `changes.json`.

**Return Value**:
- `void`: The function either completes successfully (printing a success message to stdout) or terminates the process with `process.exit(1)` on failure.
- Possible errors: All error conditions result in `process.exit(1)`. No exceptions are thrown to the caller.

**Core Logic**:

The function performs five logical phases:

**Phase 1 -- State Loading and Validation (lines 31-62)**:
Loads the current `changes.json` state via `syncChangesJson()`, which also synchronizes the JSON file with the filesystem. It first checks if the change already exists in the archive array (rejecting with "already archived"), then checks if it exists in the active changes array (rejecting with "not found"). If found, it resolves the absolute path to the change directory and calls `computeArtifactStatus()` to determine the status of all artifacts. Any artifact not in `done` status causes the function to reject, listing the incomplete artifact IDs.

**Phase 2 -- Directory Move (lines 64-76)**:
Builds the target archive path by combining `ARCHIVE_DIR` with a directory name of the format `YYYY-MM-DD-<name>` where the date is today's ISO date (YYYY-MM-DD format). Ensures the archive directory exists (creating it with `recursive: true` if needed), then uses `fs.renameSync` for an atomic move operation.

**Phase 3 -- Project JSON Update (lines 78-102)**:
Constructs the archive entry object with the original change's metadata plus a new `closedAt` timestamp and updated path. Removes the change from the `changes` array, adds it to the `archive` array (also removing any pre-existing entry with the same name in archive), and writes the complete updated JSON back to `CHANGES_JSON_PATH`.

**Phase 4 -- Global Memory Sync (lines 104-146)**:
Reads the global memory `changes.json` at `~/.furina/memory/<flatCwd>/changes.json`. If the file exists and the change entry is found, it updates the entry's `status` to `archived` and marks `stage.finalize.archive.status` as `done` with a `to` timestamp. The entire sync is wrapped in a try-catch to ensure global memory failures never block project-level archival.

**Phase 5 -- Success Output (line 148)**:
Writes a confirmation message to stdout indicating the change was archived successfully with the target path.

**Core Code**:

```typescript
export function runChangeArchive(name: string): void {
  const data = syncChangesJson();

  // Check if change exists in archive (already archived)
  const archivedEntry = data.archive.find((a) => a.name === name);
  if (archivedEntry) {
    process.stderr.write(`Change '${name}' is already archived\n`);
    process.exit(1);
  }

  // Check if change exists in active changes
  const changeEntry = data.changes.find((c) => c.name === name);
  if (!changeEntry) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  // Resolve the change directory path
  const changeDirPath = path.resolve(process.cwd(), String(changeEntry.path));

  // Compute artifact status for the change directory
  const artifacts = computeArtifactStatus(changeDirPath);

  // Check if ALL artifacts returned by computeArtifactStatus are done
  const notDoneArtifacts = artifacts
    .filter((a) => a.status !== 'done')
    .map((a) => a.id);

  if (notDoneArtifacts.length > 0) {
    process.stderr.write(`Change '${name}' not all artifacts are done\n`);
    process.stderr.write(`Artifacts not done: ${notDoneArtifacts.join(', ')}\n`);
    process.exit(1);
  }
```

Source: `src/commands/change/archive.ts`:29-62

```typescript
  // Build target archive path: furina/archive/YYYY-MM-DD-<name>/
  const today = new Date().toISOString().slice(0, 10);
  const targetDirName = `${today}-${name}`;
  const targetDir = path.join(ARCHIVE_DIR, targetDirName);

  // Ensure archive directory exists
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  // Move directory using atomic rename
  fs.renameSync(changeDirPath, targetDir);

  // Update changes.json: remove from changes, add to archive
  const updatedChanges = data.changes.filter((c) => c.name !== name);
  const archiveEntry = {
    name,
    path: path.relative(process.cwd(), targetDir).replace(/\\/g, '/'),
    description: changeEntry.description ?? '',
    createdAt: changeEntry.createdAt ?? new Date().toISOString(),
    closedAt: new Date().toISOString(),
    features: changeEntry.features ?? 0,
    artifacts: changeEntry.artifacts ?? [],
  };
```

Source: `src/commands/change/archive.ts`:64-88

```typescript
  // Sync global memory changes.json
  try {
    const cwd = process.cwd();
    const memoryPath = path.join(os.homedir(), '.furina', 'memory', flattenCwdPath(cwd), 'changes.json');

    if (!fs.existsSync(memoryPath)) {
      logger.warn(`Global memory changes.json not found at ${memoryPath}, skipping sync`);
    } else {
      let memoryData: Record<string, unknown> | null = null;
      try {
        const raw = fs.readFileSync(memoryPath, 'utf-8');
        memoryData = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        logger.error(`Failed to parse global memory changes.json at ${memoryPath}, skipping sync`);
      }

      if (memoryData) {
        const changes = memoryData.changes as Array<Record<string, unknown>> | undefined;
        const match = changes?.find((c) => c.name === name);
        if (!match) {
          logger.warn(`Change '${name}' not found in global memory changes.json, skipping sync`);
        } else {
          match.status = 'archived';
          const stage = match.stage as Record<string, unknown> | undefined;
          const finalize = stage?.finalize as Record<string, unknown> | undefined;
          const archive = finalize?.archive as Record<string, unknown> | undefined;
          if (archive) {
            archive.status = 'done';
            archive.to = new Date().toISOString();
          } else {
            logger.warn(`stage.finalize.archive is missing for change '${name}', still persisting status: archived`);
          }
          writeMemoryChangesJson(cwd, memoryData as unknown as ChangesJson);
        }
      }
    }
  } catch (err) {
    logger.error(`Failed to sync global memory changes.json: ${err instanceof Error ? err.message : String(err)}`);
  }
```

Source: `src/commands/change/archive.ts`:104-146

**Usage Example**:

```typescript
// From CLI: furina change archive my-feature
// Internally calls:
import { runChangeArchive } from './commands/change/archive.js';

runChangeArchive('my-feature');
// If successful: stdout "Change 'my-feature' archived successfully to furina/archive/2026-05-22-my-feature/"
// If validation fails: stderr "Change 'my-feature' not all artifacts are done" + exit(1)
```

Explanation: The function is called with a kebab-case change name. It validates the change is ready, moves the directory, and updates all metadata. On failure, it exits immediately with a descriptive error message.

---

## Data Structures

### Archive Entry (constructed inline)

The archive entry is constructed within `runChangeArchive` (lines 80-88) as a plain object that conforms to the archive entry format in `changes.json`:

```typescript
{
  name: string,         // The change name (kebab-case)
  path: string,         // Relative path to the archive directory (forward slashes)
  description: string,  // Original change description
  createdAt: string,    // Original creation timestamp (ISO 8601)
  closedAt: string,     // Archive timestamp (ISO 8601, set at archive time)
  features: number,     // Feature count from plan.json
  artifacts: Array<{ id: string; outputPath: string }>,  // Artifact metadata
}
```

- `name` (`string`): The kebab-case change name, preserved from the active change entry.
- `path` (`string`): The relative path to the new archive directory, using forward slashes for cross-platform portability. Format: `furina/archive/YYYY-MM-DD-<name>`.
- `description` (`string`): The change description, preserved from the active change entry.
- `createdAt` (`string`): Original creation timestamp from the active change entry. Falls back to current ISO timestamp if missing.
- `closedAt` (`string`): The archive timestamp, always set to `new Date().toISOString()` at the moment of archival.
- `features` (`number`): Feature count, preserved from the active change entry.
- `artifacts` (`Array<{ id: string; outputPath: string }>`): Artifact metadata, preserved from the active change entry.

### Project-level `changes.json` Structure

The project-level `changes.json` (at `furina/changes.json`) has the following structure after archival:

```typescript
{
  framework: string,   // Package name (e.g., 'furina')
  version: string,     // Package version
  changes: Array<ChangeEntry>,   // Active changes (archived change removed)
  archive: Array<ArchiveEntry>,  // Archived changes (archived change added)
}
```

### Global Memory ChangesJson (from `src/utils/memory.ts`)

The global memory `changes.json` (at `~/.furina/memory/<flatCwd>/changes.json`) uses a different schema:

```typescript
{
  framework: string,
  version: string,
  cwd: string,
  changes: Array<{
    name: string,
    path: string,
    description: string,
    createdAt: string,
    updateAt?: string,
    status: 'active' | 'archived' | 'removed',
    features: number,
    todo: number,
    artifacts: Array<{ id: string; outputPath: string }>,
    stage?: {
      explore: StageStep,
      brainstorm: StageStep,
      propose: StageStep,
      plan: StageStep,
      reviewArtifacts: StageStep,
      subAgentDev: Array<SubAgentDevProgress>,
      finalize: {
        integration: Array<StageStep>,
        codecheck: StageStep,
        archive: StageStep,
      },
    },
  }>,
}
```

The key difference from the project-level schema is the `status` field on each change entry and the `stage` field for tracking workflow progress. During archival, the `archive` function updates `status` to `'archived'` and sets `stage.finalize.archive.status` to `'done'` with the `to` timestamp.

### StageStep (from `src/utils/memory.ts`)

```typescript
{
  title: string,
  from: string,
  to: string,
  status: 'in_progress' | 'skipped' | 'done',
  inputPath: string,
  outputPath: string,
}
```

- `title` (`string`): Human-readable step title.
- `from` (`string`): ISO timestamp when the step started.
- `to` (`string`): ISO timestamp when the step completed.
- `status` (`'in_progress' | 'skipped' | 'done'`): Current status of the step.
- `inputPath` (`string`): Input artifact path for the step.
- `outputPath` (`string`): Output artifact path for the step.

## Error Handling and Edge Cases

The archive function implements a **fail-fast** strategy with five distinct error conditions, all resulting in `process.exit(1)`:

| Error Condition | Error Message | Exit Code |
|----------------|---------------|-----------|
| Change already archived | `Change '<name>' is already archived` | 1 |
| Change not found in active changes | `Change '<name>' not found` | 1 |
| Not all artifacts done | `Change '<name>' not all artifacts are done` + `Artifacts not done: <list>` | 1 |
| Plan features incomplete (via `computeArtifactStatus`) | Same as above -- `plan` appears in not-done list | 1 |

**Edge cases handled**:

1. **Archive directory does not exist**: The function creates `furina/archive/` with `mkdirSync({ recursive: true })` before the rename operation (line 70-72).

2. **Global memory file missing**: If `~/.furina/memory/<flatCwd>/changes.json` does not exist, the function logs a warning and skips the global memory sync. The project-level archival still succeeds (lines 109-111).

3. **Global memory file has invalid JSON**: If the global memory file cannot be parsed, an error is logged and the sync is skipped. The project-level archival still succeeds (lines 113-118).

4. **Change not found in global memory**: If the change name is not present in the global memory `changes.json`, a warning is logged and the sync is skipped (lines 123-124).

5. **Missing `stage.finalize.archive` in global memory**: If the global memory entry exists but lacks the `stage.finalize.archive` object, a warning is logged but the `status` is still set to `archived` and persisted. The archive sub-step is simply not updated (lines 133-137).

6. **Global memory sync throws unexpectedly**: The entire global memory sync block is wrapped in a try-catch. Any unexpected error is logged but does not prevent the archival from completing (lines 144-146).

7. **Cross-platform path separators**: The archive entry path uses `.replace(/\\/g, '/')` to ensure forward-slash paths regardless of OS (line 82).

8. **Missing changeEntry fields**: The archive entry construction uses nullish coalescing (`??`) for `description`, `createdAt`, `features`, and `artifacts` to handle cases where the active change entry has incomplete metadata (lines 83-87).

9. **Timestamp from `toISOString().slice(0, 10)`**: The date portion `YYYY-MM-DD` is extracted from the ISO string of `new Date()`. This uses UTC time, which means the date may differ from the user's local timezone by up to one day.

## Dependencies

### Depends on

| Module/Spec | Usage |
|------------|-------|
| `src/commands/change/shared.ts` | `CHANGES_DIR`, `ARCHIVE_DIR`, `CHANGES_JSON_PATH` path constants; `syncChangesJson()` for loading and synchronizing project state with filesystem |
| `src/commands/change/status.ts` | `computeArtifactStatus()` for computing the pipeline status of all artifacts (proposal, design, specs, plan, api, database) in a change directory |
| `src/utils/memory.ts` | `flattenCwdPath()` for converting the cwd path to a safe directory name; `writeMemoryChangesJson()` for persisting global memory; `ChangesJson` type for type annotation |
| `src/utils/logger.ts` | `logger` singleton for info/warn/error logging to `~/.furina/logs/furina.log` |
| `fs` (Node.js built-in) | `existsSync`, `mkdirSync`, `renameSync`, `readFileSync`, `writeFileSync` for filesystem operations |
| `path` (Node.js built-in) | `resolve`, `join`, `relative`, `dirname` for path manipulation |
| `os` (Node.js built-in) | `homedir()` for resolving the global memory directory path |

### Depended by

| Module/Spec | Relationship |
|------------|-------------|
| `src/commands/change/index.ts` | Registers `archive <name>` subcommand, calls `runChangeArchive(name)` on invocation |
| `furina:furina-finalize` skill | Calls the archive command as the final step of change finalization |

## Usage Examples

### CLI Usage

```bash
# Archive a completed change
furina change archive my-feature

# Expected success output (stdout):
# Change 'my-feature' archived successfully to furina/archive/2026-05-22-my-feature/

# Expected error output (stderr) when artifacts are incomplete:
# Change 'my-feature' not all artifacts are done
# Artifacts not done: design, specs
```

### Programmatic Usage (from index.ts)

```typescript
import { runChangeArchive } from './commands/change/archive.js';

// Typical CLI invocation pattern
const changeName = 'my-feature';
runChangeArchive(changeName);
// Side effects:
// 1. Moves furina/changes/my-feature/ to furina/archive/2026-05-22-my-feature/
// 2. Updates furina/changes.json (removes from changes, adds to archive)
// 3. Updates ~/.furina/memory/<flatCwd>/changes.json (status -> archived)
// 4. Prints success message to stdout
```

Explanation: The function is the sole entry point for archiving. It is called from the CLI command registration (`index.ts`) which parses the `<name>` argument from the user. The function handles all validation, mutation, and error reporting internally. No return value is expected -- on success it writes to stdout, on failure it exits the process.

### Full Archival Flow Example

```
# Pre-conditions: change "auth-system" exists with all artifacts done
# Directory structure:
#   furina/changes/auth-system/
#     proposal.md
#     design.md
#     specs/
#       spec-auth.md
#     plan.json  (all features status: 'done')
#
# furina/changes.json contains:
#   { changes: [{ name: "auth-system", path: "furina/changes/auth-system", ... }], archive: [] }

# Execute:
furina change archive auth-system

# Post-conditions:
# Directory moved:
#   furina/archive/2026-05-22-auth-system/
#     proposal.md
#     design.md
#     specs/
#       spec-auth.md
#     plan.json
#
# furina/changes.json updated:
#   { changes: [], archive: [{ name: "auth-system", path: "furina/archive/2026-05-22-auth-system", closedAt: "2026-05-22T...", ... }] }
#
# Global memory updated:
#   ~/.furina/memory/<flatCwd>/changes.json
#     auth-system entry: status = "archived", stage.finalize.archive.status = "done"
```

Explanation: This walkthrough demonstrates the complete before/after state of an archival operation. The change directory is physically moved, the project-level metadata is updated to track the new location with a closure timestamp, and the global memory is synchronized to reflect the archived status. All three mutations are consistent -- if the directory move succeeds but global memory sync fails (caught by try-catch), the project-level state remains valid.
