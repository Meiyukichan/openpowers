# spec-launch-active

> Source files:
> - `src/commands/launch.ts` : 1-43
> - `src/commands/active.ts` : 1-42
> - `src/utils/port-manager.ts` : 20-37
> - `src/server/service-manager.ts` : 14-64

## Overview

`spec-launch-active` covers two service lifecycle commands in the Furina CLI: `launch` and `active`. Both commands manage the backend Express server's availability, but serve different usage scenarios and have distinct behavioral contracts.

**Design motivation**: The Furina system relies on a persistent backend server (Express) running on a fixed port (3939). Different integration scenarios require different lifecycle semantics. The `launch` command is a straightforward "ensure server is running" primitive for user-initiated startup, while `active` is designed as a health-check + self-heal primitive for automated workflow agents that need to verify service availability before invoking APIs, with explicit exit-code signaling to indicate whether a retry is needed.

**Key design decisions**:
- **No browser opening**: Unlike the `ui` command, both `launch` and `active` deliberately avoid opening a browser. They are designed for headless/automation scenarios where the caller does not need UI access.
- **Port-based existence check**: Both commands use `isPortInUse()` as a non-invasive probe to determine if the server is already running. If the port is occupied, they assume the service is healthy and avoid spawning a duplicate.
- **Exit code signaling in `active`**: The `active` command uses `process.exitCode = 1` when it initiates a new service instance. This signals to the calling workflow that the service was not immediately available and needs to be retried after startup completes. This is a deliberate contract for automated orchestration.
- **Fire-and-forget spawning**: Both commands call `startBackendService()` which spawns the server as a detached background process and returns immediately. The server startup is asynchronous and completes independently.

**Usage scenarios**:
- **`launch`**: Manual CLI invocation or script-based startup of the backend service -- `furina launch`. Used when a user or automation needs to ensure the server is running before proceeding.
- **`active`**: Workflow agent health-check before making API calls -- `furina active`. The exit code tells the workflow whether to retry: exit 0 means the service is ready now, exit 1 means the service was just started and the caller should retry.
- Both commands are idempotent: running them when the service is already active is a no-op (outputs a message and exits cleanly).

**Involved source files**:
| File | Responsibility |
|------|---------------|
| `src/commands/launch.ts` | Defines `runLaunch()` logic and `registerLaunchCommand()` for Commander.js registration |
| `src/commands/active.ts` | Defines `runActive()` logic and `registerActiveCommand()` for Commander.js registration |
| `src/utils/port-manager.ts` | Provides `isPortInUse()` -- the port availability probe used by both commands |
| `src/server/service-manager.ts` | Provides `startBackendService()` and `UI_PORT` -- the server spawning and port constant |
| `src/cli/index.ts` | Registers both commands on the root Commander program at bootstrap time |

## Architecture / Flow

### `launch` command flow

```
User/System invokes: furina launch
        |
        v
[1] isPortInUse(UI_PORT)
        |
        |-- true (port occupied) --> stdout: "Furina server is already running"
        |                           --> return (exit 0)
        |
        v (port free)
[2] startBackendService(UI_PORT)
        |
        v
[3] Server spawned as detached child process
    stdout: "UI server started at http://localhost:3939/furina/ui"
    --> return (exit 0)
```

### `active` command flow

```
Workflow agent invokes: furina active
        |
        v
[1] isPortInUse(UI_PORT)
        |
        |-- true (port occupied) --> stdout: "Furina service is active"
        |                           --> return (exit 0, signal: ready)
        |
        v (port free)
[2] startBackendService(UI_PORT)
        |
        v
[3] stderr: "Furina service is starting, please exit the workflow and retry"
    process.exitCode = 1 (signal: not ready, caller must retry)
```

The critical difference between the two flows is in the "port free" branch: `launch` returns exit 0 after starting the service (fire-and-forget), while `active` sets `exitCode = 1` to explicitly tell the caller that the service is not yet available for use and the workflow should be retried.

## Functionality / Interface Details

### `runLaunch(): Promise<void>`

**Source**: `src/commands/launch.ts`:15-25

**Functionality**: Core logic of the `launch` command. Checks whether the backend server's port is already in use; if so, outputs a message and returns without action. If the port is free, spawns the backend service as a detached background process. This function is the primary orchestrator of the launch command and embodies the "ensure running, no browser" semantic.

**Parameters**: None.

**Return Value**:
- `Promise<void>`: Resolves when the check/start action is complete. Does not reject under normal conditions; errors are caught by the caller `registerLaunchCommand`.

**Core Logic**:
1. Reads the port constant `UI_PORT` (3939) from `service-manager.ts`.
2. Calls `isPortInUse(port)` to probe the port. This uses a non-invasive technique: it attempts to create a temporary `net.Server` listening on the port. If the `listen` succeeds, the port is free and the server is immediately closed. If the listen fails with `EADDRINUSE`, the port is occupied.
3. If port is in use: writes `"Furina server is already running\n"` to stdout and returns.
4. If port is free: calls `startBackendService(port)` which spawns a detached Node.js child process running the Express server entry point, writes a PID file to `~/.furina/.furina.pid`, and writes the UI URL to stdout.

**Core Code**:
```typescript
export async function runLaunch(): Promise<void> {
  const port = UI_PORT;

  const portInUse = await isPortInUse(port);
  if (portInUse) {
    process.stdout.write('Furina server is already running\n');
    return;
  }

  startBackendService(port);
}
```
Source: `src/commands/launch.ts`:15-25

**Usage Example**:
```typescript
import { runLaunch } from './commands/launch.js';

// Ensure backend is running before making API calls
await runLaunch();
// If port was free, stdout shows: "UI server started at http://localhost:3939/furina/ui"
// If port was occupied, stdout shows: "Furina server is already running"
```
Explanation: Directly calling `runLaunch()` programmatically. In practice, this is invoked via the CLI through Commander.js.

---

### `registerLaunchCommand(program: Command): void`

**Source**: `src/commands/launch.ts`:31-43

**Functionality**: Registers the `launch` subcommand on the Commander.js root program instance. Wraps `runLaunch()` in a try/catch that writes errors to stderr and sets `process.exitCode = 1` on failure.

**Parameters**:
- `program` (`Command`): The Commander.js root `Command` instance, created in `src/cli/index.ts`.

**Return Value**:
- `void`: This function has no return value; it mutates the `program` instance by adding a new subcommand.

**Core Logic**:
1. Calls `program.command('launch')` to register the subcommand name.
2. Sets `.description('Start the Furina backend server')`.
3. In the `.action()` handler, calls `await runLaunch()` inside a try/catch.
4. On catch: formats the error message and writes to stderr, sets `process.exitCode = 1`.

**Core Code**:
```typescript
export function registerLaunchCommand(program: Command): void {
  program
    .command('launch')
    .description('Start the Furina backend server')
    .action(async () => {
      try {
        await runLaunch();
      } catch (err) {
        process.stderr.write(`Failed to start service: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
```
Source: `src/commands/launch.ts`:31-43

**Usage Example**:
```typescript
import { Command } from 'commander';
import { registerLaunchCommand } from './commands/launch.js';

const program = new Command().name('furina');
registerLaunchCommand(program);
// Now "furina launch" is available
```
Explanation: Called during CLI bootstrap in `src/cli/index.ts` to register the `launch` subcommand.

---

### `runActive(): Promise<void>`

**Source**: `src/commands/active.ts`:14-24

**Functionality**: Core logic of the `active` command. This is the health-check and self-healing entry point designed for automated workflow agents. It probes the backend service status and, if the service is not running, attempts to start it. The distinguishing feature is its use of exit codes as a signaling mechanism: exit 0 means the service is ready for use now, exit 1 means the service was just started and the caller must retry.

**Parameters**: None.

**Return Value**:
- `Promise<void>`: Resolves when the check/start action is complete. Does not reject; errors are caught by the caller.

**Core Logic**:
1. Calls `isPortInUse(UI_PORT)` to probe the port.
2. If port is in use: writes `"Furina service is active\n"` to stdout and returns (exit 0). This is the "service is healthy" signal.
3. If port is free: calls `startBackendService(UI_PORT)` to spawn the server, then writes `"Furina service is starting, please exit the workflow and retry\n"` to stderr, and sets `process.exitCode = 1`. This is the "service was not ready, started it, caller must retry" signal.
4. The exit code 1 is the key contract: workflow agents that invoke `furina active` check the exit code and, upon receiving 1, exit and retry the entire workflow on a subsequent invocation where the port will be occupied.

**Core Code**:
```typescript
export async function runActive(): Promise<void> {
  const portInUse = await isPortInUse(UI_PORT);
  if (portInUse) {
    process.stdout.write('Furina service is active\n');
    return;
  }

  startBackendService(UI_PORT);
  process.stderr.write('Furina service is starting, please exit the workflow and retry\n');
  process.exitCode = 1;
}
```
Source: `src/commands/active.ts`:14-24

**Usage Example**:
```typescript
import { runActive } from './commands/active.js';

await runActive();
// Case 1 - service running: stdout: "Furina service is active", exitCode = 0
// Case 2 - service not running: stderr: "Furina service is starting, please exit the workflow and retry", exitCode = 1
```
Explanation: In workflow automation, the caller inspects the exit code. A zero exit means "proceed", a non-zero exit means "abort and retry later".

---

### `registerActiveCommand(program: Command): void`

**Source**: `src/commands/active.ts`:30-42

**Functionality**: Registers the `active` subcommand on the Commander.js root program instance. Wraps `runActive()` in a try/catch that writes errors to stderr and sets `process.exitCode = 1` on failure.

**Parameters**:
- `program` (`Command`): The Commander.js root `Command` instance.

**Return Value**:
- `void`: Mutates the `program` instance by adding the `active` subcommand.

**Core Logic**:
1. Registers `'active'` subcommand with description `'Probe the backend service status and self-heal if not running'`.
2. In the `.action()` handler, calls `await runActive()` inside a try/catch.
3. On catch: formats the error message and writes to stderr, sets `process.exitCode = 1`.

**Core Code**:
```typescript
export function registerActiveCommand(program: Command): void {
  program
    .command('active')
    .description('Probe the backend service status and self-heal if not running')
    .action(async () => {
      try {
        await runActive();
      } catch (err) {
        process.stderr.write(`Failed to start service: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
```
Source: `src/commands/active.ts`:30-42

**Usage Example**:
```typescript
import { Command } from 'commander';
import { registerActiveCommand } from './commands/active.js';

const program = new Command().name('furina');
registerActiveCommand(program);
// Now "furina active" is available
```
Explanation: Called during CLI bootstrap in `src/cli/index.ts` to register the `active` subcommand.

---

### `isPortInUse(port: number): Promise<boolean>` (downstream dependency)

**Source**: `src/utils/port-manager.ts`:20-37

**Functionality**: Determines whether a given TCP port is currently occupied by attempting to bind a temporary server to it. This is a non-invasive probe -- it does not connect to any existing service, does not send any network traffic, and does not modify system state. Both `launch` and `active` use this function as their first step to avoid spawning duplicate server instances.

**Parameters**:
- `port` (`number`): The TCP port number to probe.

**Return Value**:
- `Promise<boolean>`: `true` if the port is occupied (i.e., another process is listening on it), `false` if the port is free.

**Core Logic**:
1. Creates a `net.Server` instance.
2. Attempts to `server.listen(port)`.
3. If listen succeeds: the port is free. Immediately closes the temporary server and resolves `false`.
4. If listen fails with error code `EADDRINUSE`: the port is occupied. Resolves `true`.
5. For any other error code: resolves `false` (conservative -- assumes free).

**Core Code**:
```typescript
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.listen(port, () => {
      server.close();
      resolve(false);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}
```
Source: `src/utils/port-manager.ts`:20-37

**Usage Example**:
```typescript
import { isPortInUse } from './utils/port-manager.js';

const occupied = await isPortInUse(3939);
if (occupied) {
  console.log('Service is already running');
} else {
  console.log('Port is free, safe to start server');
}
```
Explanation: The standard pattern used by both `launch` and `active` to determine whether the backend server is already running before deciding whether to spawn a new instance.

---

### `startBackendService(port: number): string` (downstream dependency)

**Source**: `src/server/service-manager.ts`:53-64

**Functionality**: Starts the backend Express server by spawning a detached background child process. This function is the actual server bootstrapper used by both `launch` and `active`. It spawns the server entry point (`dist/server/entry.js`) as an independent process, writes a PID file for lifecycle management, and returns the UI URL. It does not open a browser.

**Parameters**:
- `port` (`number`): The TCP port number the server should listen on. Typically `UI_PORT` (3939).

**Return Value**:
- `string`: The full UI URL, e.g., `"http://localhost:3939/furina/ui"`.

**Core Logic**:
1. Checks if the `dist/client` directory exists (frontend assets). If not, prints a warning to stdout but does not fail -- the server can still run without client assets.
2. Calls `spawnServer(port)` which:
   - Spawns `node dist/server/entry.js` as a detached child process with `windowsHide: true`.
   - Passes the port via `FURINA_UI_PORT` environment variable.
   - Writes `{ pid, port }` as JSON to `~/.furina/.furina.pid`.
   - Calls `child.unref()` so the parent process can exit independently.
3. Logs the spawn event and writes the UI URL to stdout.

**Core Code** (from `startBackendService` and internal `spawnServer`):
```typescript
export function startBackendService(port: number): string {
  const clientDir = path.join(moduleDirname, '..', '..', 'dist', 'client');
  if (!fs.existsSync(clientDir)) {
    process.stdout.write('UI has not been built yet. Please run the build command first to generate the frontend assets.\n');
  }

  spawnServer(port);
  logger.info(`UI server spawned on port ${port}`);
  const uiUrl = `http://localhost:${port}/furina/ui`;
  process.stdout.write(`UI server started at ${uiUrl}\n`);
  return uiUrl;
}
```
Source: `src/server/service-manager.ts`:53-64

```typescript
function spawnServer(port: number): void {
  const child = spawn(process.execPath, [serverEntryPath], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, FURINA_UI_PORT: String(port) },
    windowsHide: true,
  });

  const pidDir = path.dirname(PID_FILE);
  if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
  }
  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, port }, null, 2), 'utf-8');

  child.unref();
}
```
Source: `src/server/service-manager.ts`:29-45

**Usage Example**:
```typescript
import { startBackendService, UI_PORT } from './server/service-manager.js';

const url = startBackendService(UI_PORT);
// stdout: "UI server started at http://localhost:3939/furina/ui"
// Server is now running as a detached background process
// PID file written to ~/.furina/.furina.pid
```
Explanation: This is the common server startup call shared by `launch`, `active`, and `ui` commands. The `ui` command additionally opens a browser after calling this; `launch` and `active` do not.

## Data Structures

### `UI_PORT` (constant)

```typescript
export const UI_PORT = 3939;
```
- **Type**: `number` (literal `3939`)
- **Location**: `src/server/service-manager.ts`:15
- **Purpose**: The default TCP port for the Furina backend Express server. Used by `launch`, `active`, `ui`, `enable`, and `schedule` commands. The port is passed to the spawned child process via the `FURINA_UI_PORT` environment variable.

### PID File (`~/.furina/.furina.pid`)

```json
{
  "pid": 12345,
  "port": 3939
}
```
- **`pid`** (`number`): The process ID of the spawned backend server child process. Used by `gracefulShutdown()` to locate and terminate the process.
- **`port`** (`number`): The port the server is listening on.
- **Location**: `~/.furina/.furina.pid`
- **Written by**: `spawnServer()` in `src/server/service-manager.ts`
- **Used by**: `gracefulShutdown()` in `src/utils/port-manager.ts` and the `ui --restart` command.

## Error Handling and Edge Cases

### Error handling strategy

Both `launch` and `active` use the same error handling pattern:
1. **Core logic (`runLaunch`/`runActive`)**: These functions do not catch errors themselves. They rely on the promise chain to propagate exceptions to the caller.
2. **Command registration wrappers (`registerLaunchCommand`/`registerActiveCommand`)**: These wrap the core logic in a try/catch. On error, they write a formatted error message to stderr and set `process.exitCode = 1`. They never call `process.exit()` -- they allow the Node.js process to exit naturally so that cleanup handlers can run.

### Edge cases

1. **Port occupied by non-Furina process**: If port 3939 is occupied by an unrelated application, `isPortInUse()` returns `true`. Both commands will report the service as "already running" / "active" without verifying that the occupying process is actually an Furina server. This is a known trade-off -- checking via HTTP health probe would be more accurate but adds latency and complexity.

2. **Server spawned but not yet listening**: When `startBackendService()` returns, the child process has been spawned but may not have completed Express initialization and bound to the port yet. For `launch`, this is acceptable (fire-and-forget). For `active`, this is the explicit contract: the exit code 1 signals that the service is not yet ready and the caller must retry.

3. **Missing frontend assets**: `startBackendService()` checks for `dist/client` and prints a warning if missing, but does not prevent server startup. The Express server can serve API endpoints without client assets.

4. **Port check race condition**: There is a small window between `isPortInUse()` returning `false` and `startBackendService()` spawning the server. If two concurrent invocations both pass the port check, they could attempt to spawn duplicate servers. In practice, `spawnServer()` uses `spawn` with `detached: true` and the second server would fail to bind to the port, but this is not explicitly handled.

5. **Error types in catch blocks**: Both command registration wrappers use `err instanceof Error ? err.message : String(err)` to safely extract error messages, handling both Error objects and non-Error thrown values.

## Dependencies

### Depends on

| Dependency | What is used | Purpose |
|------------|-------------|---------|
| `src/utils/port-manager.ts` | `isPortInUse()` | Port availability probe before server startup |
| `src/server/service-manager.ts` | `startBackendService()`, `UI_PORT` | Server spawning and port constant |
| `commander` (npm) | `Command` | CLI subcommand registration |

### Depended by

| Dependent | How it depends |
|-----------|---------------|
| `src/cli/index.ts` | Imports `registerLaunchCommand` and `registerActiveCommand` and calls them during CLI bootstrap |
| Workflow automation agents | Invoke `furina active` as a health-check primitive, relying on exit code signaling |
| `src/commands/enable.ts` | The `enable` command probes the port and may start the service using the same `isPortInUse`/`startBackendService` pattern |

## Usage Examples

### CLI usage: Starting the backend service

```bash
$ furina launch
UI server started at http://localhost:3939/furina/ui
```

Explanation: The simplest usage. If the port is free, the backend server is spawned and the UI URL is printed. If the port is already in use:

```bash
$ furina launch
Furina server is already running
```

### CLI usage: Workflow agent health-check

```bash
$ furina active
Furina service is active
$ echo $?
0
```

Explanation: Exit code 0 means the service is running and ready for use. The workflow agent proceeds with its tasks.

```bash
$ furina active
Furina service is starting, please exit the workflow and retry
$ echo $?
1
```

Explanation: Exit code 1 means the service was just started but is not yet ready. The workflow agent should exit and retry the entire workflow on a subsequent run, at which point the port will be occupied and the command will return exit 0.

### Typical workflow agent integration pattern

```bash
# In a workflow script:
furina active
if [ $? -ne 0 ]; then
  # Service was just started, exit and let the workflow retry
  exit 1
fi
# Service is ready, proceed with API calls
curl http://localhost:3939/furina/api/...
```

Explanation: This shell snippet demonstrates the intended usage pattern for the `active` command in automated workflows. The exit code determines whether to proceed or retry.

### Programmatic usage in TypeScript

```typescript
import { runLaunch } from './commands/launch.js';
import { runActive } from './commands/active.js';
import { isPortInUse } from './utils/port-manager.js';
import { UI_PORT } from './server/service-manager.js';

// Check if service is running
const isRunning = await isPortInUse(UI_PORT);
console.log(`Service running: ${isRunning}`);

// Start the service (launch semantics)
await runLaunch();

// Or start with retry signaling (active semantics)
await runActive();
if (process.exitCode === 1) {
  console.log('Service started but not ready, retry later');
}
```
Explanation: Shows how the core functions can be used programmatically. `isPortInUse` is the shared probe, `runLaunch` is fire-and-forget startup, and `runActive` is startup with exit-code-based retry signaling.
