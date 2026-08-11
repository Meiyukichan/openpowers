# spec-recover

> Source files:
> - `src/commands/recover.ts` : 1-28
> - `src/server/claude-settings.ts` : 117-128

## Overview

`spec-recover` covers the `furina recover` CLI command, which provides a user-facing mechanism to restore the original Claude configuration (`~/.claude/settings.json`) from a previously created backup file (`~/.furina/settings.bak.json`). This command is a critical safety net in the Furina plugin lifecycle -- when Furina modifies Claude's settings (e.g., injecting proxy environment variables via `enable`), users can always recover their original configuration using this command.

**Design motivation**: Furina, as a Claude plugin management toolkit, needs to modify Claude's `settings.json` to inject proxy configurations, environment variables, and other settings. Before making such modifications, the `backupClaudeSettings()` function creates a backup. The `recover` command exists to undo these modifications, restoring the exact pre-Furina configuration. This one-command restoration avoids manual file manipulation and guarantees users a clean escape hatch.

**Key design decisions**:
- **Thin command layer**: The `recover` command itself contains zero business logic -- it delegates entirely to `restoreClaudeSettings()` from the `claude-settings` utility module. This follows the separation of concerns pattern where command registration and CLI output handling are separated from core file operations.
- **Boolean return-based control flow**: `restoreClaudeSettings()` returns a boolean (`true` for success, `false` for no backup found) rather than throwing exceptions. The command uses this return value to select the appropriate user-facing message.
- **Graceful degradation**: When no backup file exists, the command does not exit with an error code. It prints a friendly message and exits normally (code 0). This prevents scripts from breaking when there is nothing to restore.
- **Dual output channels**: Success is reported through both the logger (for file-based audit trails) and stdout (for immediate user feedback). The "no backup" path only writes to stdout since it is informational, not an error.

**Usage scenarios**:
- After running `furina enable` and wanting to revert proxy configuration changes
- After running `furina disable` (which itself calls `restoreClaudeSettings()` internally) if the user wants to ensure a clean state
- When troubleshooting Claude configuration issues and wanting to return to a known-good baseline
- As part of cleanup before uninstalling Furina

**Involved source files**:
| File | Responsibility |
|------|---------------|
| `src/commands/recover.ts` | Entry point: registers the `recover` subcommand on Commander program, handles CLI output |
| `src/server/claude-settings.ts` | Core logic: `restoreClaudeSettings()` performs the actual file copy from backup to destination |
| `src/cli/index.ts` | Registration: calls `registerRecoverCommand(program)` during CLI bootstrap |
| `src/utils/logger.ts` | Logging: provides the `logger` instance for audit trail output |

## Architecture / Flow

The `recover` command follows a minimal linear flow with a single conditional branch based on the backup file existence:

```
User Input: furina recover
        |
        v
[1] restoreClaudeSettings()
        |
        |--- Check: ~/.furina/settings.bak.json exists?
        |         |
        |         |-- false --> log warning, return false
        |         |
        |         v (true)
        |    Ensure ~/.claude/ directory exists
        |    Copy backup -> ~/.claude/settings.json
        |    return true
        |
        v
[2] Check return value
        |
        |-- true  --> logger.info("...restored successfully")
        |           --> stdout: "Claude configuration restored successfully."
        |
        |-- false --> stdout: "No backup found. Nothing to restore."
```

The command never calls `process.exit()` -- in both the success and no-backup cases, the process terminates naturally after the action handler completes. This is verified by test assertions that ensure `process.exit` is not called in either scenario.

## Functionality / Interface Details

### `registerRecoverCommand(program: Command) -> void`

**Source**: `src/commands/recover.ts`:15-28

**Functionality**: Registers the `recover` subcommand on the given Commander.js program instance. This function is called once during CLI bootstrap (from `src/cli/index.ts`) and sets up the command descriptor, description text, and action handler. The action handler invokes the core `restoreClaudeSettings()` function and produces user-facing output based on the result. This function follows the same registration pattern used by all other Furina CLI commands (init, ui, remove, etc.).

**Parameters**:
- `program` (`Command`): The Commander.js `Command` instance representing the root `furina` program. The `recover` subcommand is registered as a direct child of this program. Typically passed from `src/cli/index.ts` where the root program is created with `name('furina')`, `description(...)`, and `version(...)`.

**Return Value**:
- `void`: The function performs side effects only -- it mutates the Commander program by adding a new subcommand. It does not return a value.

**Core Logic**:

1. **Command registration**: Calls `program.command('recover')` to create a new subcommand named `recover`. This makes it accessible as `furina recover` from the CLI.

2. **Description assignment**: Sets `.description('Restore original claude configuration')` which appears in the `--help` output alongside other commands.

3. **Action handler**: The `.action()` callback executes when the user invokes `furina recover`:
   - Calls `restoreClaudeSettings()` which attempts to copy `~/.furina/settings.bak.json` back to `~/.claude/settings.json`
   - If the return value is `true` (backup existed and was restored):
     - Logs an info message via `logger.info()` for the audit trail
     - Writes a success message to stdout for the user
   - If the return value is `false` (no backup file found):
     - Writes an informational message to stdout indicating no backup was found
     - No logger call is made for this case (it is not an error condition)

**Core Code**:
```typescript
export function registerRecoverCommand(program: Command): void {
  program
    .command('recover')
    .description('Restore original claude configuration')
    .action(() => {
      const restored = restoreClaudeSettings();
      if (restored) {
        logger.info('Claude configuration restored successfully');
        process.stdout.write('Claude configuration restored successfully.\n');
      } else {
        process.stdout.write('No backup found. Nothing to restore.\n');
      }
    });
}
```
Source: `src/commands/recover.ts`:15-28

**Usage Example**:
```typescript
import { Command } from 'commander';
import { registerRecoverCommand } from './commands/recover.js';

const program = new Command()
  .name('furina')
  .description('Furina CLI')
  .version('1.0.0');

registerRecoverCommand(program);
program.parse(['node', 'furina', 'recover']);
```
Explanation: Creates a Commander program, registers the recover command, and parses the CLI arguments. When the action fires, it calls `restoreClaudeSettings()` and prints the appropriate message to stdout. In the normal CLI flow, this registration happens inside `src/cli/index.ts`.

---

### `restoreClaudeSettings() -> boolean`

**Source**: `src/server/claude-settings.ts`:117-128

**Functionality**: Restores the Claude configuration file (`~/.claude/settings.json`) by copying the backup file (`~/.furina/settings.bak.json`) back to its original location. This is the core file operation that underpins the `recover` command. The function handles directory creation (ensuring `~/.claude/` exists before writing) and reports success/failure through its boolean return value rather than throwing exceptions. The backup file is created by `backupClaudeSettings()` when Furina first modifies Claude's settings (e.g., during `enable`).

**Parameters**:
- None. The function uses hardcoded path constants:
  - `BACKUP_FILE` = `~/.furina/settings.bak.json` -- the backup source
  - `CLAUDE_SETTINGS_FILE` = `~/.claude/settings.json` -- the restore destination

**Return Value**:
- `boolean`:
  - `true`: The backup file existed and was successfully copied to `~/.claude/settings.json`. The Claude configuration is now restored to its pre-Furina state.
  - `false`: The backup file (`~/.furina/settings.bak.json`) does not exist. No file operations were performed. A warning is logged.

**Core Logic**:

1. **Backup existence check**: Calls `fs.existsSync(BACKUP_FILE)` to check whether the backup file exists at `~/.furina/settings.bak.json`. If the file does not exist, logs a warning via `logger.warn()` and returns `false` immediately. No exception is thrown.

2. **Destination directory preparation**: Checks whether the destination directory (`~/.claude/`) exists using `fs.existsSync(destDir)`. If not, creates it recursively with `fs.mkdirSync(destDir, { recursive: true })`. This handles the edge case where the `~/.claude/` directory was deleted or never existed.

3. **File copy**: Performs an atomic file copy from `BACKUP_FILE` to `CLAUDE_SETTINGS_FILE` using `fs.copyFileSync()`. This overwrites the current `settings.json` entirely with the backup content, ensuring a clean restoration.

4. **Success return**: Returns `true` to indicate the restoration succeeded.

**Core Code**:
```typescript
export function restoreClaudeSettings(): boolean {
  if (!fs.existsSync(BACKUP_FILE)) {
    logger.warn(`Cannot restore: backup file ${BACKUP_FILE} not found`);
    return false;
  }
  const destDir = path.dirname(CLAUDE_SETTINGS_FILE);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(BACKUP_FILE, CLAUDE_SETTINGS_FILE);
  return true;
}
```
Source: `src/server/claude-settings.ts`:117-128

**Usage Example**:
```typescript
import { restoreClaudeSettings } from './server/claude-settings.js';

// Attempt to restore
const success = restoreClaudeSettings();
if (success) {
  console.log('Settings restored to original state');
} else {
  console.log('No backup available -- nothing was changed');
}
```
Explanation: Calls `restoreClaudeSettings()` and checks the boolean return value. If `true`, the original Claude configuration has been restored from backup. If `false`, no backup file existed (perhaps `backupClaudeSettings()` was never called, or the backup was already deleted).

---

### `backupClaudeSettings() -> void` (related context)

**Source**: `src/server/claude-settings.ts`:100-110

**Functionality**: This is the complementary function to `restoreClaudeSettings()`. It copies `~/.claude/settings.json` to `~/.furina/settings.bak.json`, creating the backup that `restoreClaudeSettings()` later restores. It is included here for context because the `recover` command depends on the existence of this backup. The backup is typically created during `furina enable` before modifying Claude's settings.

**Parameters**:
- None. Uses the same hardcoded path constants.

**Return Value**:
- `void`: No return value. If the source file does not exist, logs a warning and does nothing.

**Core Code**:
```typescript
export function backupClaudeSettings(): void {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) {
    logger.warn(`Cannot backup: ${CLAUDE_SETTINGS_FILE} does not exist`);
    return;
  }
  const bakDir = path.dirname(BACKUP_FILE);
  if (!fs.existsSync(bakDir)) {
    fs.mkdirSync(bakDir, { recursive: true });
  }
  fs.copyFileSync(CLAUDE_SETTINGS_FILE, BACKUP_FILE);
}
```
Source: `src/server/claude-settings.ts`:100-110

## Data Structures

### Path Constants (from `claude-settings.ts`)
```typescript
const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const BACKUP_FILE = path.join(os.homedir(), '.furina', 'settings.bak.json');
```
- `CLAUDE_SETTINGS_FILE`: The target Claude configuration file at `~/.claude/settings.json`. This is both the source for backup and the destination for restore.
- `BACKUP_FILE`: The backup location at `~/.furina/settings.bak.json`. This is the destination for backup and the source for restore.

### `Command` (from Commander.js)
```typescript
import { Command } from 'commander';
```
- The Commander.js `Command` class used for CLI subcommand registration. The `program` parameter in `registerRecoverCommand` is an instance of this class.

## Error Handling and Edge Cases

### No Backup File Exists
When `~/.furina/settings.bak.json` does not exist (e.g., `backupClaudeSettings()` was never called, or the file was manually deleted):
- `restoreClaudeSettings()` logs a warning: `Cannot restore: backup file ~/.furina/settings.bak.json not found`
- Returns `false`
- The recover command prints `No backup found. Nothing to restore.` to stdout
- Process exits normally with code 0 (no `process.exit()` call)
- No file operations are performed -- the current `settings.json` is left untouched

### Destination Directory Missing
When `~/.claude/` does not exist at restore time:
- `restoreClaudeSettings()` creates it with `fs.mkdirSync(destDir, { recursive: true })`
- The restore proceeds normally
- This handles rare cases where the `.claude` directory was deleted

### Overwrite Behavior
When the destination file (`~/.claude/settings.json`) already exists:
- `fs.copyFileSync()` silently overwrites it with the backup content
- Any changes made since the backup was created are lost
- This is the intended behavior -- the `recover` command is designed to fully revert to the backed-up state

### Process Exit Behavior
The `recover` command notably does **not** call `process.exit()` in any code path. This is verified by tests and is intentional:
- Success: process exits naturally after the action handler
- No backup: process exits naturally after printing the informational message
- This contrasts with other commands (e.g., `init`) that call `process.exit(1)` on failure

### Concurrent/Parallel Modifications
If another process modifies `~/.claude/settings.json` between the `existsSync` check and the `copyFileSync` call, there is no locking mechanism. This is an inherent limitation of the simple file-copy approach and is acceptable given that CLI commands are typically run sequentially by a single user.

## Dependencies

- **Depends on**:
  - `src/server/claude-settings.ts` -- Provides `restoreClaudeSettings()`, the core function that performs the actual backup-to-destination file copy. Also provides `backupClaudeSettings()`, `readClaudeSettings()`, and `writeClaudeSettings()` used by other commands in the ecosystem.
  - `src/utils/logger.ts` -- Provides the `logger` instance (winston-based) for writing info/warn messages to the log file at `~/.furina/logs/furina.log`.
  - `commander` (npm package) -- Provides the `Command` class for CLI subcommand registration.

- **Depended by**:
  - `src/cli/index.ts` -- Imports and calls `registerRecoverCommand(program)` during CLI bootstrap, making the `recover` command available as `furina recover`.
  - CLI consumers: Any user or script running `furina recover`.

## Usage Examples

### Restoring Claude Configuration from CLI

```bash
# Restore the original Claude configuration
furina recover

# Output when backup exists:
# Claude configuration restored successfully.

# Output when no backup exists:
# No backup found. Nothing to restore.
```

Explanation: The command is the simplest CLI interface -- no arguments, no options. It checks for the backup file and either restores or reports that no backup was found. Users run this command after enabling/disabling Furina proxy mode, or when they want to return to their original Claude settings.

### Programmatic Registration

```typescript
import { Command } from 'commander';
import { registerRecoverCommand } from './commands/recover.js';

// Create the root program
const program = new Command()
  .name('furina')
  .description('Furina CLI - plugin-based development toolkit')
  .version('1.0.0');

// Register recover alongside other commands
registerRecoverCommand(program);
// ... register other commands ...

// Parse CLI arguments
program.parse(process.argv);
```

Explanation: The registration pattern follows the standard Furina CLI architecture. Each command module exports a `register*Command` function that accepts the root Commander program and adds its subcommand. In production, this happens inside `src/cli/index.ts` where all 12 command modules are registered.

### Typical Workflow: Enable, Use, Recover

```bash
# Step 1: Enable Furina proxy (backs up settings first)
furina enable
# -> backupClaudeSettings() copies ~/.claude/settings.json to ~/.furina/settings.bak.json
# -> Modifies ~/.claude/settings.json with proxy env vars

# Step 2: Use Claude with Furina proxy configuration
# ... normal usage ...

# Step 3: Recover original settings
furina recover
# -> restoreClaudeSettings() copies backup back to ~/.claude/settings.json
# Output: Claude configuration restored successfully.
```

Explanation: This shows the typical lifecycle where `enable` creates the backup and modifies settings, and `recover` undoes those modifications. The backup file persists after recovery, so the user can run `enable` again later without losing their original settings. The backup is only overwritten when `enable` is run again (since `backupClaudeSettings()` copies the current settings to the backup location).
