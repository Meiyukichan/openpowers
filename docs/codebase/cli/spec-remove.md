# Plugin Removal (remove)

> Source files:
> - `src/commands/remove.ts` : 1-151

## Overview

`spec-remove` covers the Furina plugin and marketplace uninstallation flow within the CLI. This spec provides the `furina remove` command, which cleanly removes the Furina plugin and its associated marketplace from the user's Claude environment.

**Design motivation**: Furina installs itself into Claude via a two-step mechanism: (1) a marketplace that serves as the plugin source, and (2) the plugin itself that extends Claude's capabilities. When a user wants to uninstall Furina, both components must be removed. The remove command handles this in a single invocation with user confirmation, ensuring a clean uninstall even if one or both components were already absent.

**Key design decisions**:
- **Error-tolerant removal**: Both the plugin uninstall and marketplace removal are wrapped in try/catch blocks. If either component is not installed, the command succeeds rather than failing. This makes the command idempotent and safe to run multiple times.
- **Confirmation prompt with bypass**: By default, the command prompts the user for confirmation (y/N) via readline in TTY environments. The `--yes` flag skips this prompt, and non-TTY environments (e.g., CI pipelines, piped input) also skip the prompt automatically.
- **Human-readable summary**: After removal, the command builds a summary message that accurately describes what was actually removed versus what was not found, using color-coded output (green for removed, yellow for not found).
- **Mirror of init steps 2-3**: The removal logic directly mirrors the cleanup steps performed in `init.ts` (steps 2 and 3), using the same plugin/marketplace identifiers and the same error-tolerant pattern.

**Usage scenarios**:
- Uninstalling Furina from a project: `furina remove`
- Non-interactive removal in CI/CD: `furina remove --yes`
- Programmatic removal in scripts: `furina remove -y`

**Involved source files**:
| File | Responsibility |
|------|---------------|
| `src/commands/remove.ts` | Entry point: orchestrates confirmation prompt, plugin uninstall, marketplace removal, and summary display |
| `src/cli/index.ts` | Registers the `remove` subcommand on the root Commander program via `registerRemoveCommand()` |
| `src/utils/logger.ts` | Provides the shared `logger` instance for info/warn logging to `~/.furina/logs/furina.log` |

## Architecture / Flow

The `remove` command follows a linear execution flow with an initial conditional branch for the confirmation prompt:

```
CLI Input (furina remove [--yes])
        |
        v
[1] Check: options.yes === true?
        |
        |-- true --> log "--yes flag: skipping confirmation"
        |            |
        |            v
        |       performRemoval()
        |
        v (false)
[2] Check: process.stdin.isTTY?
        |
        |-- false --> log "Non-TTY mode: skipping confirmation"
        |             |
        |             v
        |        performRemoval()
        |
        v (true, TTY mode)
[3] readline.question("Are you sure? (y/N)")
        |
        |-- answer !== "y" --> log "User declined" + process.exit(0)
        |
        v (answer === "y")
[4] performRemoval()
        |
        v
[5] ora spinner: "Uninstalling Furina plugin..."
        |
        |-- success --> green "Furina plugin uninstalled"
        |-- catch   --> yellow "Furina plugin not installed, skipping"
        |
        v
[6] ora spinner: "Removing Furina marketplace..."
        |
        |-- success --> green "Furina marketplace removed"
        |-- catch   --> yellow "Furina marketplace not found, skipping"
        |
        v
[7] buildSummary(pluginRemoved, marketplaceRemoved)
        |
        v
[8] ora spinner: display summary message
```

The two removal steps (plugin uninstall, marketplace removal) are independent and sequential. Each uses `execSync` to invoke the corresponding `claude` CLI subcommand (`claude plugin uninstall` and `claude plugin marketplace remove`). The `stdio: 'pipe'` option suppresses the child process output from the terminal.

## Functionality / Interface Details

### `runRemove(options: RemoveOptions = {}) -> void`

**Source**: `src/commands/remove.ts`:38-64

**Functionality**: This is the main entry point for the `furina remove` CLI command. It determines whether to show a confirmation prompt based on the `--yes` flag and TTY detection, then delegates to `performRemoval()` for the actual uninstallation. The function handles three distinct paths: (1) `--yes` flag present -- skip prompt and proceed; (2) TTY mode -- show interactive readline prompt; (3) non-TTY mode -- skip prompt and proceed. In TTY mode, if the user enters anything other than "y" (case-insensitive), the process exits with code 0 (success, not an error).

**Parameters**:
- `options` (`RemoveOptions`): Optional options object. Defaults to `{}`.
  - `yes` (`boolean`, optional): When `true`, skips the confirmation prompt entirely. Mapped from the CLI flag `-y, --yes`.

**Return Value**:
- `void`: The function performs side effects (terminal interaction, subprocess execution, process exit) and does not return a value.

**Core Logic**:
1. If `options.yes` is truthy, logs the skip reason and immediately calls `performRemoval()`.
2. If `process.stdin.isTTY` is true (interactive terminal), creates a readline interface and prompts the user with a yellow-colored confirmation message. The prompt text is `"Are you sure you want to remove Furina? (y/N) "`, where the uppercase "N" indicates the default answer. If the user's normalized input is not exactly `"y"`, the process exits with code 0.
3. If neither condition is met (non-TTY environment, no `--yes` flag), logs the skip reason and calls `performRemoval()`.

**Core Code**:
```typescript
export function runRemove(options: RemoveOptions = {}): void {
  // Step 1: Confirmation prompt (skip with --yes flag or in non-interactive mode)
  if (options.yes) {
    logger.info('--yes flag: skipping confirmation');
    performRemoval();
  } else if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      chalk.yellow('Are you sure you want to remove Furina? (y/N) '),
      (answer: string) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        if (normalized !== 'y') {
          logger.info('User declined removal');
          process.exit(0);
        }
        performRemoval();
      },
    );
  } else {
    logger.info('Non-TTY mode: skipping confirmation');
    performRemoval();
  }
}
```
Source: `src/commands/remove.ts`:38-64

**Usage Example**:
```typescript
// Called by Commander.js action handler
program
  .command('remove')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action((options: RemoveOptions) => {
    runRemove(options);
  });
```
Explanation: Commander.js parses `furina remove --yes` and invokes `runRemove({ yes: true })`. Since `options.yes` is true, the confirmation prompt is skipped and the removal proceeds immediately.

---

### `performRemoval() -> void`

**Source**: `src/commands/remove.ts`:70-109

**Functionality**: Executes the two-step removal process: uninstalling the Furina plugin and removing the Furina marketplace. Both operations use `execSync` to invoke the `claude` CLI and are fully error-tolerant -- if either operation fails (typically because the component is not installed), the error is caught, logged as a warning, and the spinner is shown with a yellow "not found" message rather than a red failure. After both steps, the function calls `buildSummary()` and displays the result via an ora spinner.

**Parameters**:
- None (module-level private function).

**Return Value**:
- `void`: Side effects only (subprocess execution, terminal output, logging).

**Core Logic**:
1. **Plugin uninstall**: Starts an ora spinner with text `"Uninstalling Furina plugin..."`. Runs `claude plugin uninstall furina@furina-plugins` via `execSync` with `stdio: 'pipe'` and `cwd: process.cwd()`. On success, sets `pluginRemoved = true` and shows a green success message. On failure (caught error), shows a yellow "not installed, skipping" message and logs a warning.
2. **Marketplace removal**: Starts a new ora spinner with text `"Removing Furina marketplace..."`. Runs `claude plugin marketplace remove furina-plugins` via `execSync` with the same options. On success, sets `marketplaceRemoved = true` and shows a green success message. On failure, shows a yellow "not found, skipping" message and logs a warning.
3. **Summary display**: Calls `buildSummary(pluginRemoved, marketplaceRemoved)` to generate a human-readable summary. Creates an ora spinner, starts it, then immediately succeeds it with the summary text (a visual pattern to show the summary as a completed step). Also logs the summary via the logger.

**Core Code**:
```typescript
function performRemoval(): void {
  let pluginRemoved = false;
  let marketplaceRemoved = false;

  // Step 2: Uninstall Furina plugin (error-tolerant)
  const step2 = ora('Uninstalling Furina plugin...').start();
  try {
    execSync(`claude plugin uninstall ${PLUGIN_NAME}`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    pluginRemoved = true;
    step2.succeed(chalk.green('Furina plugin uninstalled'));
    logger.info('Plugin uninstalled successfully');
  } catch {
    step2.succeed(chalk.yellow('Furina plugin not installed, skipping'));
    logger.warn('Plugin uninstall failed (ignored): plugin may not be installed');
  }

  // Step 3: Remove Furina marketplace (error-tolerant)
  const step3 = ora('Removing Furina marketplace...').start();
  try {
    execSync(`claude plugin marketplace remove ${MARKETPLACE_NAME}`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    marketplaceRemoved = true;
    step3.succeed(chalk.green('Furina marketplace removed'));
    logger.info('Marketplace removed successfully');
  } catch {
    step3.succeed(chalk.yellow('Furina marketplace not found, skipping'));
    logger.warn('Marketplace removal failed (ignored): marketplace may not exist');
  }

  // Step 4: Display summary
  const summary = buildSummary(pluginRemoved, marketplaceRemoved);
  const summarySpinner = ora(summary).start();
  summarySpinner.succeed(summary);
  logger.info(`Removal complete: ${summary}`);
}
```
Source: `src/commands/remove.ts`:70-109

**Usage Example**:
```typescript
// Internal function, not exported. Called by runRemove() after confirmation.
// Example flow when plugin is installed but marketplace is not:

// ora output:
//   ✔ Furina plugin uninstalled
//   ✔ Furina marketplace not found, skipping
//   ✔ Furina plugin has been removed, marketplace was not found.
```
Explanation: The function runs both removal steps independently. If the plugin was previously uninstalled but the marketplace remains, the first spinner shows yellow "not installed" and the second shows green "removed". The summary accurately reflects the mixed result.

---

### `buildSummary(pluginRemoved: boolean, marketplaceRemoved: boolean) -> string`

**Source**: `src/commands/remove.ts`:117-137

**Functionality**: Constructs a human-readable, color-coded summary message based on the results of the two removal operations. The summary describes which components were successfully removed and which were not found. This function is responsible for the final user-facing output that confirms the overall result of the removal process.

**Parameters**:
- `pluginRemoved` (`boolean`): Whether the Furina plugin was successfully uninstalled (`true`) or was not installed (`false`).
- `marketplaceRemoved` (`boolean`): Whether the Furina marketplace was successfully removed (`true`) or was not found (`false`).

**Return Value**:
- `string`: A chalk-formatted summary string. Three possible outcomes:
  - Both removed: green message `"Furina plugin and marketplace have been removed."`
  - Neither found: yellow message `"No Furina components were installed. Nothing to remove."`
  - Mixed result: green message with individual status for each component, e.g., `"Furina plugin has been removed, marketplace was not found."`

**Core Logic**:
1. If both `pluginRemoved` and `marketplaceRemoved` are true, returns a green success message indicating both components were removed.
2. If both are false, returns a yellow message indicating no components were installed.
3. For mixed results, builds a parts array with individual status strings for each component:
   - Plugin removed: `"Furina plugin has been removed"`
   - Plugin not removed: `"Furina plugin was not installed"`
   - Marketplace removed: `"marketplace has been removed"`
   - Marketplace not removed: `"marketplace was not found"`
   The parts are joined with `", "` and terminated with a period. The entire message is wrapped in `chalk.green()`.

**Core Code**:
```typescript
function buildSummary(pluginRemoved: boolean, marketplaceRemoved: boolean): string {
  if (pluginRemoved && marketplaceRemoved) {
    return chalk.green('Furina plugin and marketplace have been removed.');
  }
  if (!pluginRemoved && !marketplaceRemoved) {
    return chalk.yellow('No Furina components were installed. Nothing to remove.');
  }
  // One removed, one skipped
  const parts: string[] = [];
  if (pluginRemoved) {
    parts.push('Furina plugin has been removed');
  } else {
    parts.push('Furina plugin was not installed');
  }
  if (marketplaceRemoved) {
    parts.push('marketplace has been removed');
  } else {
    parts.push('marketplace was not found');
  }
  return chalk.green(`${parts.join(', ')}.`);
}
```
Source: `src/commands/remove.ts`:117-137

**Usage Example**:
```typescript
const summary1 = buildSummary(true, true);
// "Furina plugin and marketplace have been removed." (green)

const summary2 = buildSummary(false, false);
// "No Furina components were installed. Nothing to remove." (yellow)

const summary3 = buildSummary(true, false);
// "Furina plugin has been removed, marketplace was not found." (green)

const summary4 = buildSummary(false, true);
// "Furina plugin was not installed, marketplace has been removed." (green)
```
Explanation: Each combination of boolean inputs produces a distinct, grammatically correct summary message. The mixed-result cases use a join pattern to compose individual component statuses into a single sentence.

---

### `registerRemoveCommand(program: Command) -> void`

**Source**: `src/commands/remove.ts`:143-151

**Functionality**: Registers the `remove` subcommand on the given Commander.js `Command` instance. This is the standard registration pattern used by all CLI commands in Furina. The registered command has the name `remove`, a description, one optional flag (`-y, --yes`), and an action handler that delegates to `runRemove()`.

**Parameters**:
- `program` (`Command`): The root Commander.js `Command` instance, typically created in `src/cli/index.ts`. The command is registered as a direct subcommand of this program.

**Return Value**:
- `void`: Side effect only (modifies the Commander program's command tree).

**Core Logic**:
1. Calls `program.command('remove')` to create a new subcommand named `remove`.
2. Sets the description to `"Uninstall furina plugin and marketplace"`.
3. Adds the `-y, --yes` option with description `"Skip confirmation prompt"`.
4. Attaches an action handler that receives the parsed options and calls `runRemove(options)`.

**Core Code**:
```typescript
export function registerRemoveCommand(program: Command): void {
  program
    .command('remove')
    .description('Uninstall furina plugin and marketplace')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action((options: RemoveOptions) => {
      runRemove(options);
    });
}
```
Source: `src/commands/remove.ts`:143-151

**Usage Example**:
```typescript
import { Command } from 'commander';
import { registerRemoveCommand } from './commands/remove.js';

const program = new Command();
program.name('furina').version('1.0.0');

registerRemoveCommand(program);

// Now the program supports:
//   furina remove
//   furina remove --yes
//   furina remove -y
```
Explanation: `registerRemoveCommand` follows the standard Furina CLI registration pattern. It is called once during CLI bootstrap (in `src/cli/index.ts`) to make the `remove` command available. The Commander.js framework handles argument parsing and option extraction, then invokes `runRemove()` with the parsed options.

## Data Structures

### `RemoveOptions`
```typescript
export interface RemoveOptions {
  yes?: boolean;
}
```
- `yes` (`boolean`, optional): When set to `true`, the confirmation prompt is skipped. Default behavior (when absent or `false`) is to show the prompt in TTY environments. Mapped from the CLI flag `-y, --yes`.

### Constants
```typescript
const PLUGIN_NAME = 'furina@furina-plugins';
const MARKETPLACE_NAME = 'furina-plugins';
```
- `PLUGIN_NAME` (`string`): The fully qualified plugin identifier used in `claude plugin uninstall`. The `@` format denotes `pluginName@marketplaceName`, matching the Claude CLI plugin identifier convention.
- `MARKETPLACE_NAME` (`string`): The marketplace name used in `claude plugin marketplace remove`. This must match the name that was used during `claude plugin marketplace add` in the init flow.

## Error Handling and Edge Cases

### Plugin Not Installed
When `claude plugin uninstall furina@furina-plugins` fails (plugin is not installed):
- The error is caught silently (empty `catch` block)
- The ora spinner shows a yellow success message: `"Furina plugin not installed, skipping"`
- A warning is logged: `"Plugin uninstall failed (ignored): plugin may not be installed"`
- `pluginRemoved` remains `false`
- The command continues to the marketplace removal step

### Marketplace Not Found
When `claude plugin marketplace remove furina-plugins` fails (marketplace does not exist):
- Same error-tolerant pattern as plugin uninstall
- Yellow spinner message: `"Furina marketplace not found, skipping"`
- Warning log: `"Marketplace removal failed (ignored): marketplace may not exist"`
- `marketplaceRemoved` remains `false`

### User Declines Confirmation
When running in TTY mode without `--yes` and the user enters anything other than "y":
- The input is trimmed and lowercased before comparison (so "Y", " yes ", "YES" all normalize to "y", "yes", "yes" -- only exact "y" after normalization triggers removal)
- The process exits with code 0 (success), not an error code
- A log message is recorded: `"User declined removal"`
- No removal operations are performed

### Non-TTY Environment (CI/Piped Input)
When `process.stdin.isTTY` is `false` (e.g., running in a CI pipeline, piped input, or non-interactive shell):
- The confirmation prompt is skipped automatically without needing `--yes`
- A log message records: `"Non-TTY mode: skipping confirmation"`
- Removal proceeds immediately

### Claude CLI Not Installed
If the `claude` CLI is not available on the system:
- `execSync` will throw an error (command not found)
- The error is caught by the error-tolerant try/catch blocks
- Both steps will show yellow "not found" messages
- The summary will report `"No Furina components were installed. Nothing to remove."`

### Both Components Already Removed (Idempotency)
When neither the plugin nor the marketplace is installed:
- Both `execSync` calls throw errors, both are caught
- Both spinners show yellow "not found" messages
- Summary: yellow `"No Furina components were installed. Nothing to remove."`
- The command exits successfully -- running `furina remove` multiple times is safe

## Dependencies

- **Depends on**:
  - `commander` -- Provides the `Command` class for CLI registration and option parsing.
  - `child_process` -- Provides `execSync` for synchronous subprocess execution of `claude` CLI commands.
  - `readline` -- Node.js built-in module for interactive terminal input (confirmation prompt).
  - `ora` -- Terminal spinner library for showing progress indicators during removal steps.
  - `chalk` -- Terminal color library for green (success) and yellow (warning/skip) output formatting.
  - `src/utils/logger.ts` -- Provides the `logger` instance (winston-based file logger) for info/warn logging.

- **Depended by**:
  - `src/cli/index.ts` -- Imports and calls `registerRemoveCommand(program)` during CLI bootstrap to register the `remove` subcommand on the root Commander program.
  - CLI consumers -- Any user or automation running `furina remove [--yes]` from the terminal.
  - `src/commands/init.ts` -- While `init.ts` does not directly call `remove.ts`, it performs the same operations (steps 2 and 3) using the same plugin/marketplace identifiers. The `remove` command can be seen as the standalone extraction of init's cleanup logic.

## Usage Examples

### Basic Interactive Removal

```bash
# Run the remove command (will prompt for confirmation in TTY)
furina remove

# Terminal interaction:
# ? Are you sure you want to remove Furina? (y/N) y
#   ✔ Furina plugin uninstalled
#   ✔ Furina marketplace removed
#   ✔ Furina plugin and marketplace have been removed.
```

Explanation: In a standard terminal (TTY mode), the command prompts for confirmation. After the user types "y" and presses Enter, both the plugin and marketplace are removed. Green spinners indicate success, and the final summary confirms both components were removed.

### Non-Interactive Removal

```bash
# Skip confirmation with --yes flag
furina remove --yes

# Or short form
furina remove -y

# Expected output:
#   ✔ Furina plugin uninstalled
#   ✔ Furina marketplace removed
#   ✔ Furina plugin and marketplace have been removed.
```

Explanation: The `--yes` (or `-y`) flag bypasses the confirmation prompt. This is useful for scripts, CI/CD pipelines, or when the user is certain they want to proceed.

### Partial Removal (Component Not Found)

```bash
# If the plugin was already uninstalled but marketplace remains
furina remove --yes

# Expected output:
#   ✔ Furina plugin not installed, skipping
#   ✔ Furina marketplace removed
#   ✔ Furina plugin was not installed, marketplace has been removed.
```

Explanation: When only one component is present, the command removes what it can and reports the mixed status. The missing component is shown with a yellow "not installed/not found" message, while the removed component shows green. The summary accurately describes the partial result.

### Programmatic Usage

```typescript
import { runRemove } from './commands/remove.js';

// Non-interactive removal (no confirmation prompt)
runRemove({ yes: true });

// With confirmation (for TTY environments only)
runRemove({});  // or runRemove()
```

Explanation: `runRemove()` can be called programmatically. When `yes: true` is passed, no confirmation is needed. When called with `{}` or no arguments, the TTY detection determines whether to show the prompt. The function always completes -- it never throws or exits with an error code due to missing components.
