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

// Purpose key regex pattern: matches "OpenPowers:<stage>:Purpose"
const PURPOSE_KEY_PATTERN = /^OpenPowers:\s*([a-zA-Z]+)\s*:Purpose$/;

/**
 * Recursively search an object for a key matching OpenPowers:*:Purpose
 * @param {object} obj - The object to search
 * @returns {string|null} The lowercase purpose stage, or null if not found
 */
function extractPurpose(obj) {
  if (typeof obj !== 'object' || obj === null) return null;

  for (const key of Object.keys(obj)) {
    const match = key.match(PURPOSE_KEY_PATTERN);
    if (match) return match[1].toLowerCase();
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const result = extractPurpose(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Parse stdin JSON string to extract session_id, purpose, and cwd
 * @param {string} rawInput - Raw stdin text (JSON string)
 * @returns {{ sessionId: string|undefined, purpose: string|undefined, cwd: string|undefined }}
 */
export function parseStdin(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return { sessionId: undefined, purpose: undefined, cwd: undefined };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    return { sessionId: undefined, purpose: undefined, cwd: undefined };
  }

  return {
    sessionId: parsed.session_id,
    purpose: extractPurpose(parsed) ?? undefined,
    cwd: parsed.cwd,
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
 * Validate data for --after-agent mode
 * @param {{ sessionId?: string, cwd?: string }} parsed
 * @returns {string|null} Error message if invalid, null if valid
 */
export function validateAfterAgent(parsed) {
  if (!parsed.sessionId) {
    return 'Missing required field: session_id';
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
 * Build the command array for --after-agent mode
 * @param {string} sessionId - The session ID
 * @returns {string[]} Command array
 */
export function buildAfterAgentCommand(sessionId) {
  return ['openpowers', 'agents', 'switch', 'workflow', '--session', sessionId];
}

/**
 * Execute a command via execSync
 * @param {string[]} commandArgs - Command arguments array
 * @param {string} cwd - Working directory for the command
 */
export function executeCommand(commandArgs, cwd) {
  const command = commandArgs.join(' ');
  try {
    execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    });
  } catch (e) {
    process.stderr.write(`Hook command failed: ${e.message}\n`);
  }
}

/**
 * Write log entry to the hooks log file
 * @param {string} sessionId - The session ID for the log file name
 * @param {string} message - The log message
 */
export function writeLog(sessionId, message) {
  try {
    const logDir = path.join(os.homedir(), '.openpowers', 'logs');
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
 * Main entry point - reads stdin, determines mode, and executes
 */
export function main() {
  const isBeforeAgent = process.argv.includes('--before-agent');
  const isAfterAgent = process.argv.includes('--after-agent');

  if (!isBeforeAgent && !isAfterAgent) {
    process.stderr.write('Usage: node openpowers_hooks.js --before-agent|--after-agent\n');
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

  let error;
  if (isBeforeAgent) {
    error = validateBeforeAgent(parsed);
    if (!error) {
      writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
      writeLog(parsed.sessionId, `Accepted hook request --- openpowers-purpose: ${parsed.purpose}`);
      writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);
      const command = buildBeforeAgentCommand(parsed.sessionId, parsed.purpose);
      executeCommand(command, parsed.cwd);
      writeLog(parsed.sessionId, `Result of switch-agent hook: completed`);
    }
  } else if (isAfterAgent) {
    error = validateAfterAgent(parsed);
    if (!error) {
      writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
      writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);
      const command = buildAfterAgentCommand(parsed.sessionId);
      executeCommand(command, parsed.cwd);
      writeLog(parsed.sessionId, `Result of switch-agent hook: completed`);
    }
  }

  if (error) {
    process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  }
}

// Run main only when executed directly (not when imported for testing)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
