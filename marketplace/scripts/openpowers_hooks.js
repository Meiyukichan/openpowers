/**
 * OpenPowers hooks script - handles PreToolUse and PostToolUse events
 * to switch agent sessions between workflow stages.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import url from 'url';
import child_process from 'child_process';
const { fileURLToPath } = url;
const { execSync } = child_process;

// Regex patterns matching the original Python implementation:
// Uses regex extraction from raw text to avoid JSON.parse failures
// caused by encoding issues, malformed JSON, BOM characters, etc.

/** Extract session_id: matches "session_id"\s*:\s*"([a-zA-Z0-9-]+)" */
const SESSION_ID_PATTERN = /"session_id"\s*:\s*"([a-zA-Z0-9-]+)"/i;

/** Extract OpenPowers:*:Purpose stage: matches OpenPowers:\s*([a-zA-Z]+)\s*:Purpose */
const PURPOSE_PATTERN = /OpenPowers:\s*([a-zA-Z]+)\s*:Purpose/i;

/** Extract cwd: matches "cwd"\s*:\s*"([^"]+)" */
const CWD_PATTERN = /"cwd"\s*:\s*"([^"]+)"/i;

/** Extract prompt: matches only /openpowers:workflow prefix */
const PROMPT_PATTERN = /"prompt"\s*:\s*"(\/openpowers:workflow[^"]*)"/i;

/**
 * Parse stdin raw text to extract session_id, purpose, cwd, and prompt using regex.
 * Uses regex-based extraction (not JSON.parse) to avoid failures caused
 * by encoding issues, malformed JSON, BOM characters, or non-JSON content.
 * Matches the original Python openpowers_hooks.py logic exactly.
 * @param {string} rawInput - Raw stdin text
 * @returns {{ sessionId: string|undefined, purpose: string|undefined, cwd: string|undefined, prompt: string|undefined }}
 */
export function parseStdin(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return { sessionId: undefined, purpose: undefined, cwd: undefined, prompt: undefined };
  }

  const sessionMatch = rawInput.match(SESSION_ID_PATTERN);
  const purposeMatch = rawInput.match(PURPOSE_PATTERN);
  const cwdMatch = rawInput.match(CWD_PATTERN);
  const promptMatch = rawInput.match(PROMPT_PATTERN);

  return {
    sessionId: sessionMatch ? sessionMatch[1] : undefined,
    purpose: purposeMatch ? purposeMatch[1].toLowerCase() : undefined,
    cwd: cwdMatch ? cwdMatch[1] : undefined,
    prompt: promptMatch ? promptMatch[1] : undefined,
  };
}

/**
 * Validate data for --before-agent mode
 * @param {{ sessionId?: string, purpose?: string, cwd?: string }} parsed
 * @returns {string|null} Error message if invalid, null if valid
 */
export function validateBeforeAgent(parsed) {
  if (!parsed.sessionId) {
    return 'Missing required field: session_id';
  }
  if (!parsed.purpose) {
    return 'Missing required field: purpose (OpenPowers:*:Purpose)';
  }
  if (!parsed.cwd) {
    return 'Missing required field: cwd';
  }
  if (!fs.existsSync(parsed.cwd)) {
    return `cwd path does not exist: ${parsed.cwd}`;
  }
  return null;
}

/**
 * Build the command array for --before-agent mode
 * @param {string} sessionId - The session ID
 * @param {string} purpose - The agent purpose (e.g. explore, plan)
 * @returns {string[]} Command array
 */
export function buildBeforeAgentCommand(sessionId, purpose) {
  return ['openpowers', 'agents', 'switch', purpose, '--session', sessionId];
}

/**
 * Build the init command array
 * @param {string} sessionId - The session ID
 * @param {string} cwd - The working directory
 * @returns {string[]} Command array
 */
export function buildInitCommand(sessionId, cwd) {
  return ['openpowers', 'agents', 'init', '--session', sessionId, '--cwd', cwd];
}

/**
 * Build the command array for --after-agent mode
 * @param {string} sessionId - The session ID
 * @returns {string[]} Command array
 */
export function buildAfterAgentCommand(sessionId) {
  return ['openpowers', 'agents', 'switch', 'workflow', '--session', sessionId];
}

/**
 * Execute a command via execSync and return the captured result.
 * Mirrors Python's subprocess.run with capture_output=True.
 * @param {string[]} commandArgs - Command arguments array
 * @param {string} cwd - Working directory for the command
 * @param {{ silent?: boolean }} [options] - Options
 * @param {boolean} [options.silent=false] - If true, suppress stderr output on failure
 * @returns {{ stdout: string, stderr: string, status: number } | null} Result or null on failure
 */
export function executeCommand(commandArgs, cwd, options) {
  const silent = options && options.silent ? options.silent : false;
  const command = commandArgs.join(' ');
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    });
    return {
      stdout: stdout.trimEnd(),
      stderr: '',
      status: 0,
    };
  } catch (e) {
    if (!silent) {
      process.stderr.write(`Hook command failed: ${e.message}\n`);
    }
    // e.stdout / e.stderr are available on ExecSyncError when stdio is piped
    if (e.stdout !== undefined || e.stderr !== undefined || e.status !== undefined) {
      return {
        stdout: (typeof e.stdout === 'string' ? e.stdout : '').trimEnd(),
        stderr: (typeof e.stderr === 'string' ? e.stderr : '').trimEnd(),
        status: e.status,
      };
    }
    return null;
  }
}

/**
 * Write log entry to the hooks log file
 * @param {string} sessionId - The session ID for the log file name
 * @param {string} message - The log message
 */
export function writeLog(sessionId, message) {
  try {
    const logDir = path.join(os.homedir(), '.openpowers', 'logs', 'hooks');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logFile = path.join(logDir, `hooks-${sessionId}.log`);
    const logLine = `${timestamp} INFO ${message}\n`;
    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch {
    // Silently fail if logging is not available
  }
}

/**
 * Handle --before-agent mode: validate input, init session, and switch to target stage.
 * @param {{ sessionId?: string, purpose?: string, cwd?: string, prompt?: string }} parsed
 */
export function runBeforeAgent(parsed) {
  const error = validateBeforeAgent(parsed);
  if (error) {
    return;
  }

  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- openpowers-purpose: ${parsed.purpose}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  // Initialize the agent session first
  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  const initCommandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${initCommandStr} (cwd: ${parsed.cwd})`);
  const initResult = executeCommand(initCommand, parsed.cwd);
  if (initResult !== null) {
    writeLog(parsed.sessionId, `Result of init-agent hook: returncode=${initResult.status}, stdout='${initResult.stdout}', stderr='${initResult.stderr}'`);
  }

  // Then switch to the target stage
  const command = buildBeforeAgentCommand(parsed.sessionId, parsed.purpose);
  const commandStr = command.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(command, parsed.cwd);
  if (result !== null) {
    writeLog(parsed.sessionId, `Result of switch-agent hook: returncode=${result.status}, stdout='${result.stdout}', stderr='${result.stderr}'`);
  }
}

/**
 * Handle --after-agent mode: validate input, init session, and switch to workflow stage.
 * @param {{ sessionId?: string, purpose?: string, cwd?: string, prompt?: string }} parsed
 */
export function runAfterAgent(parsed) {
  const error = validateBeforeAgent(parsed);
  if (error) {
    return;
  }

  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  // Initialize the agent session first
  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  const initCommandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${initCommandStr} (cwd: ${parsed.cwd})`);
  const initResult = executeCommand(initCommand, parsed.cwd);
  if (initResult !== null) {
    writeLog(parsed.sessionId, `Result of init-agent hook: returncode=${initResult.status}, stdout='${initResult.stdout}', stderr='${initResult.stderr}'`);
  }

  // Then switch to workflow stage
  const command = buildAfterAgentCommand(parsed.sessionId);
  const commandStr = command.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(command, parsed.cwd);
  if (result !== null) {
    writeLog(parsed.sessionId, `Result of switch-agent hook: returncode=${result.status}, stdout='${result.stdout}', stderr='${result.stderr}'`);
  }
}

/**
 * Handle --init-agent mode: silently init agent session on UserPromptSubmit.
 * Only processes when prompt matches /openpowers:workflow prefix and all
 * required fields (session_id, cwd) are present and cwd path exists.
 * Completely silent — no stdout, stderr, or log output.
 * @param {{ sessionId?: string, purpose?: string, cwd?: string, prompt?: string }} parsed
 */
export function runInitAgent(parsed) {
  if (!parsed.prompt) {
    return;
  }
  if (!parsed.sessionId) {
    return;
  }
  if (!parsed.cwd || !parsed.cwd.trim()) {
    return;
  }
  if (!fs.existsSync(parsed.cwd)) {
    return;
  }

  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  executeCommand(initCommand, parsed.cwd, { silent: true });
}

/**
 * Main entry point - reads stdin, determines mode, and delegates to handlers.
 */
export function main() {
  const isBeforeAgent = process.argv.includes('--before-agent');
  const isAfterAgent = process.argv.includes('--after-agent');
  const isInitAgent = process.argv.includes('--init-agent');

  if (!isBeforeAgent && !isAfterAgent && !isInitAgent) {
    process.stderr.write('Usage: node openpowers_hooks.js --before-agent|--after-agent|--init-agent\n');
    process.exitCode = 1;
    return;
  }

  // Read all data from stdin synchronously
  let rawInput = '';
  try {
    const buffer = Buffer.alloc(65536);
    let bytesRead;
    const fd = 0; // stdin file descriptor
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) !== 0) {
      rawInput += buffer.toString('utf-8', 0, bytesRead);
    }
  } catch {
    // stdin may not be piped (e.g. manual invocation), use empty input
  }

  const parsed = parseStdin(rawInput);

  if (isBeforeAgent) {
    runBeforeAgent(parsed);
  } else if (isAfterAgent) {
    runAfterAgent(parsed);
  } else if (isInitAgent) {
    runInitAgent(parsed);
  }
}

// Run main only when executed directly (not when imported for testing)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
