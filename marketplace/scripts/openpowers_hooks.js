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

/** Extract command field from rawInput: matches "command": "...","description": */
const COMMAND_PATTERN = /"command"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description":/;

/** Extract change name from openpowers change new command */
const CHANGE_NEW_PATTERN = /openpowers change new\s+(\S+)/;

/**
 * Parse stdin raw text to extract session_id and cwd using regex.
 * Uses regex-based extraction (not JSON.parse) to avoid failures caused
 * by encoding issues, malformed JSON, BOM characters, or non-JSON content.
 * Only extracts common fields needed by all handlers (sessionId, cwd).
 * Purpose and prompt are parsed by individual handler functions as needed.
 * @param {string} rawInput - Raw stdin text
 * @returns {{ sessionId: string|undefined, cwd: string|undefined }}
 */
export function parseStdin(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return { sessionId: undefined, cwd: undefined };
  }

  const sessionMatch = rawInput.match(SESSION_ID_PATTERN);
  const cwdMatch = rawInput.match(CWD_PATTERN);

  return {
    sessionId: sessionMatch ? sessionMatch[1] : undefined,
    cwd: cwdMatch ? cwdMatch[1] : undefined,
  };
}

/**
 * Validate data for --before-agent mode
 * @param {{ sessionId?: string, cwd?: string }} parsed
 * @param {string|undefined} purpose - The parsed purpose (explicit parameter)
 * @returns {string|null} Error message if invalid, null if valid
 */
export function validateBeforeAgent(parsed, purpose) {
  if (!parsed.sessionId) {
    return 'Missing required field: session_id';
  }
  if (!purpose) {
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
 * Build the workflow switch command array
 * @param {string} sessionId - The session ID
 * @returns {string[]} Command array
 */
export function buildWorkflowCommand(sessionId) {
  return ['openpowers', 'agents', 'switch', 'workflow', '--session', sessionId];
}

/**
 * Build the before-propose switch command array
 * @param {string} sessionId - The session ID
 * @returns {string[]} Command array
 */
export function buildBeforeProposeCommand(sessionId) {
  return ['openpowers', 'agents', 'switch', 'propose', '--session', sessionId];
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

/** Extract prompt from rawInput regex (for JSON.parse fallback) */
const RAW_PROMPT_PATTERN = /"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/;

/** Extract description from rawInput regex (for JSON.parse fallback) */
const DESCRIPTION_PATTERN = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/;

/** Extract tool_use_id from rawInput regex (similar to SESSION_ID_PATTERN) */
const TOOL_USE_ID_PATTERN = /"tool_use_id"\s*:\s*"([a-zA-Z0-9-]+)"/;

/**
 * Extract prompt, description, and tool_use_id from rawInput.
 * Tries JSON.parse first, falls back to regex extraction.
 * @param {string} rawInput - Raw stdin text
 * @returns {{ prompt: string|undefined, description: string|undefined, toolUseId: string|undefined }}
 */
function extractToolInput(rawInput) {
  let prompt;
  let description;
  let toolUseId;

  try {
    const data = JSON.parse(rawInput);
    prompt = data.tool_input?.prompt;
    description = data.tool_input?.description;
    toolUseId = data.tool_use_id;
  } catch {
    // JSON.parse failed, fall back to regex
    const promptMatch = rawInput.match(RAW_PROMPT_PATTERN);
    const descMatch = rawInput.match(DESCRIPTION_PATTERN);
    const tidMatch = rawInput.match(TOOL_USE_ID_PATTERN);
    prompt = promptMatch ? promptMatch[1] : undefined;
    description = descMatch ? descMatch[1] : undefined;
    toolUseId = tidMatch ? tidMatch[1] : undefined;
  }

  return { prompt, description, toolUseId };
}

/**
 * Extract tool_response from rawInput.
 * Tries JSON.parse first, falls back to regex extraction.
 * @param {string} rawInput - Raw stdin text
 * @returns {object|undefined} The parsed tool_response object, or undefined
 */
export function extractToolResponse(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return undefined;
  }

  try {
    const data = JSON.parse(rawInput);
    return data.tool_response;
  } catch {
    // JSON.parse failed, fall back to regex
    const match = rawInput.match(/"tool_response"\s*:\s*(\{[\s\S]*?\})\s*,\s*"tool_use_id"/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/**
 * Write toolResponse JSON to a file in the session directory.
 * Creates directory if it does not exist. Silently skips if toolResponse or toolUseId is missing.
 * @param {string} sessionId - The session ID
 * @param {string} toolUseId - The tool use ID (used as filename)
 * @param {object} toolResponse - The tool response object to write
 */
export function writeOutputFile(sessionId, toolUseId, toolResponse) {
  if (!toolResponse || !toolUseId) {
    return;
  }

  try {
    const sessionDir = path.join(os.homedir(), '.openpowers', 'sessions', sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const filePath = path.join(sessionDir, `${toolUseId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(toolResponse, null, 2), 'utf-8');
  } catch {
    // Silently fail if writing output file is not available
  }
}

/**
 * Write prompt content to a file in the session directory.
 * Creates directory if it does not exist. Silently logs on failure.
 * @param {string} sessionId - The session ID
 * @param {string} toolUseId - The tool use ID (used as filename)
 * @param {string} prompt - The prompt content to write
 */
function writePromptFile(sessionId, toolUseId, prompt) {
  try {
    const sessionDir = path.join(os.homedir(), '.openpowers', 'sessions', sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const filePath = path.join(sessionDir, `${toolUseId}.txt`);
    fs.writeFileSync(filePath, prompt, 'utf-8');
  } catch {
    // Silently fail if writing prompt file is not available
  }
}

/**
 * Handle --before-agent mode: validate input, init session, switch to target stage,
 * extract tool input, write prompt file, and call change stage.
 * @param {{ sessionId?: string, cwd?: string }} parsed
 * @param {string} rawInput - Raw stdin text
 */
export function runBeforeAgent(parsed, rawInput) {
  // Parse purpose internally
  const purposeMatch = (rawInput || '').match(PURPOSE_PATTERN);
  const purpose = purposeMatch ? purposeMatch[1].toLowerCase() : undefined;

  const error = validateBeforeAgent(parsed, purpose);
  if (error) {
    return;
  }

  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- openpowers-purpose: ${purpose}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  // Initialize the agent session first
  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  const initCommandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${initCommandStr} (cwd: ${parsed.cwd})`);
  const initResult = executeCommand(initCommand, parsed.cwd);
  if (initResult !== null) {
    writeLog(parsed.sessionId, `Result of init-agent hook: returncode=${initResult.status}, stdout='${initResult.stdout}', stderr='${initResult.stderr}'`);
  }

  // Map integration→coding for agents switch, keep original for change stage
  const switchPurpose = purpose === 'integration' ? 'coding' : purpose;
  const stagePurpose = purpose;

  // Then switch to the target stage
  const command = buildBeforeAgentCommand(parsed.sessionId, switchPurpose);
  const commandStr = command.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(command, parsed.cwd);
  if (result !== null) {
    writeLog(parsed.sessionId, `Result of switch-agent hook: returncode=${result.status}, stdout='${result.stdout}', stderr='${result.stderr}'`);
  }

  // Extract prompt/description/tool_use_id from stdin
  const { prompt, description, toolUseId } = extractToolInput(rawInput);

  // Write prompt to file if both prompt and toolUseId are present
  let inputPath;
  if (prompt && toolUseId) {
    writePromptFile(parsed.sessionId, toolUseId, prompt);
    inputPath = path.join(os.homedir(), '.openpowers', 'sessions', parsed.sessionId, `${toolUseId}.txt`);
  }

  // Call change stage command
  const stageArgs = ['openpowers', 'change', 'stage', stagePurpose, '--session', parsed.sessionId, '--status', 'in_progress'];
  if (description) {
    stageArgs.push('--title', `"${description.replace(/"/g, "'")}"`);
  }
  if (inputPath) {
    stageArgs.push('--input', `"${inputPath}"`);
  }
  const stageCommandStr = stageArgs.join(' ');
  writeLog(parsed.sessionId, `Running command: ${stageCommandStr} (cwd: ${parsed.cwd})`);
  const stageResult = executeCommand(stageArgs, parsed.cwd);
  if (stageResult !== null) {
    writeLog(parsed.sessionId, `Result of change-stage hook: returncode=${stageResult.status}, stdout='${stageResult.stdout}', stderr='${stageResult.stderr}'`);
  }
}

/**
 * Handle --after-agent mode: validate input, init session, switch to workflow stage,
 * extract tool_input and tool_response, write toolResponse to output file,
 * and call change stage to record completion status.
 * @param {{ sessionId?: string, cwd?: string }} parsed
 * @param {string} rawInput - Raw stdin text
 */
export function runAfterAgent(parsed, rawInput) {
  // Parse purpose internally from rawInput
  const purposeMatch = (rawInput || '').match(PURPOSE_PATTERN);
  const purpose = purposeMatch ? purposeMatch[1].toLowerCase() : undefined;

  // Validate required fields (purpose is optional for after-agent)
  if (!parsed.sessionId || !parsed.cwd || !fs.existsSync(parsed.cwd)) {
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
  const command = buildWorkflowCommand(parsed.sessionId);
  const commandStr = command.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(command, parsed.cwd);
  if (result !== null) {
    writeLog(parsed.sessionId, `Result of switch-agent hook: returncode=${result.status}, stdout='${result.stdout}', stderr='${result.stderr}'`);
  }

  // Extract prompt/description/tool_use_id from stdin
  const { prompt, description, toolUseId } = extractToolInput(rawInput);

  // Extract tool_response from stdin
  const toolResponse = extractToolResponse(rawInput);

  // Write toolResponse to file if both toolResponse and toolUseId are present
  let outputPath;
  if (toolResponse && toolUseId) {
    writeOutputFile(parsed.sessionId, toolUseId, toolResponse);
    outputPath = path.join(os.homedir(), '.openpowers', 'sessions', parsed.sessionId, `${toolUseId}.json`);
  }

  // Call change stage command with --status done
  if (!purpose) {
    return;
  }
  const stagePurpose = purpose;

  const stageArgs = ['openpowers', 'change', 'stage', stagePurpose, '--session', parsed.sessionId, '--status', 'done'];
  if (description) {
    stageArgs.push('--title', `"${description.replace(/"/g, "'")}"`);
  }
  if (outputPath) {
    stageArgs.push('--output', `"${outputPath}"`);
  }
  const stageCommandStr = stageArgs.join(' ');
  writeLog(parsed.sessionId, `Running command: ${stageCommandStr} (cwd: ${parsed.cwd})`);
  const stageResult = executeCommand(stageArgs, parsed.cwd);
  if (stageResult !== null) {
    writeLog(parsed.sessionId, `Result of change-stage hook: returncode=${stageResult.status}, stdout='${stageResult.stdout}', stderr='${stageResult.stderr}'`);
  }
}

/**
 * Handle --before-propose mode: validate input, init session, and switch to propose stage.
 * @param {{ sessionId?: string, purpose?: string, cwd?: string, prompt?: string }} parsed
 */
export function runBeforePropose(parsed) {
  if (!parsed.sessionId) {
    return;
  }
  if (!parsed.cwd) {
    return;
  }
  if (!fs.existsSync(parsed.cwd)) {
    return;
  }

  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- openpowers-purpose: propose`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  // Initialize the agent session first
  const initCommand = buildInitCommand(parsed.sessionId, parsed.cwd);
  const initCommandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${initCommandStr} (cwd: ${parsed.cwd})`);
  const initResult = executeCommand(initCommand, parsed.cwd);
  if (initResult !== null) {
    writeLog(parsed.sessionId, `Result of init-agent hook: returncode=${initResult.status}, stdout='${initResult.stdout}', stderr='${initResult.stderr}'`);
  }

  // Then switch to propose stage
  const command = buildBeforeProposeCommand(parsed.sessionId);
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
 * No stdout/stderr output; writes execution log to the hooks log file.
 * @param {{ sessionId?: string, cwd?: string }} parsed
 * @param {string} rawInput - Raw stdin text
 */
export function runInitAgent(parsed, rawInput) {
  // Parse prompt internally from rawInput
  const promptMatch = (rawInput || '').match(PROMPT_PATTERN);
  const prompt = promptMatch ? promptMatch[1] : undefined;

  if (!prompt) {
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
  let commandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  let result = executeCommand(initCommand, parsed.cwd, { silent: true });
  if (result !== null) {
    writeLog(parsed.sessionId, `Result of init-agent hook: returncode=${result.status}, stdout='${result.stdout}', stderr='${result.stderr}'`);
  }

  const command = buildWorkflowCommand(parsed.sessionId);
  commandStr = command.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  result = executeCommand(command, parsed.cwd, { silent: true });
  if (result !== null) {
    writeLog(parsed.sessionId, `Result of switch-agent hook: returncode=${result.status}, stdout='${result.stdout}', stderr='${result.stderr}'`);
  }
}

/**
 * Extract the command field content from rawInput using regex.
 * @param {string} rawInput - Raw stdin text
 * @returns {string|undefined} The extracted command string, or undefined if not found
 */
export function extractCommandFromRawInput(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    return undefined;
  }
  const match = rawInput.match(COMMAND_PATTERN);
  return match ? match[1] : undefined;
}

/**
 * Extract the change name from an openpowers change new command string.
 * @param {string} rawCommand - The raw command string
 * @returns {string|null} The change name, or null if not a change new command
 */
export function extractChangeName(rawCommand) {
  if (!rawCommand || !rawCommand.includes('openpowers change new')) {
    return null;
  }
  const match = rawCommand.match(CHANGE_NEW_PATTERN);
  return match ? match[1] : null;
}

/**
 * Build and execute agents init command with --change for the "change new" case.
 * @param {{ sessionId?: string, cwd?: string }} parsed
 * @param {string} changeName - The change name extracted from the command
 */
export function executeChangeNewInit(parsed, changeName) {
  writeLog(parsed.sessionId, `Accepted hook request --- session-id: ${parsed.sessionId}`);
  writeLog(parsed.sessionId, `Accepted hook request --- change-name: ${changeName}`);
  writeLog(parsed.sessionId, `Accepted hook request --- cwd: ${parsed.cwd}`);

  const initCommand = [...buildInitCommand(parsed.sessionId, parsed.cwd), '--change', changeName];
  const commandStr = initCommand.join(' ');
  writeLog(parsed.sessionId, `Running command: ${commandStr} (cwd: ${parsed.cwd})`);
  const result = executeCommand(initCommand, parsed.cwd, { silent: true });
  if (result !== null) {
    writeLog(parsed.sessionId, `Result of before-bash hook: returncode=${result.status}, stdout='${result.stdout}', stderr='${result.stderr}'`);
  }
}

/**
 * Handle --before-bash mode: extract command from rawInput, detect openpowers commands,
 * and dispatch to the appropriate case handler.
 * @param {{ sessionId?: string, purpose?: string, cwd?: string, prompt?: string }} parsed
 * @param {string} rawInput - Raw stdin text (needed to extract command field)
 */
export function runBeforeBash(parsed, rawInput) {
  if (!parsed.sessionId) {
    return;
  }
  if (!parsed.cwd) {
    return;
  }
  if (!fs.existsSync(parsed.cwd)) {
    return;
  }

  const rawCommand = extractCommandFromRawInput(rawInput);
  if (!rawCommand) {
    return;
  }

  // Non-openpowers commands: exit(0) without further processing
  if (!rawCommand.includes('openpowers')) {
    return;
  }

  // Case dispatch for openpowers commands
  const changeName = extractChangeName(rawCommand);
  if (changeName) {
    // Case: openpowers change new <name> --desc <desc>
    executeChangeNewInit(parsed, changeName);
    return;
  }

  // Future cases can be added here
}

/**
 * Main entry point - reads stdin, determines mode, and delegates to handlers.
 */
export function main() {
  const isBeforeAgent = process.argv.includes('--before-agent');
  const isAfterAgent = process.argv.includes('--after-agent');
  const isInitAgent = process.argv.includes('--init-agent');
  const isBeforePropose = process.argv.includes('--before-propose');
  const isBeforeBash = process.argv.includes('--before-bash');
  const isBeforeQuestion = process.argv.includes('--before-question');

  if (!isBeforeAgent && !isAfterAgent && !isInitAgent && !isBeforePropose && !isBeforeBash && !isBeforeQuestion) {
    process.stderr.write('Usage: node openpowers_hooks.js --before-agent|--after-agent|--init-agent|--before-propose|--before-bash|--before-question\n');
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
    runBeforeAgent(parsed, rawInput);
  } else if (isAfterAgent) {
    runAfterAgent(parsed, rawInput);
  } else if (isInitAgent) {
    runInitAgent(parsed, rawInput);
  } else if (isBeforePropose) {
    runBeforePropose(parsed);
  } else if (isBeforeBash) {
    fs.writeFileSync('b.txt', rawInput)
    runBeforeBash(parsed, rawInput);
  } else if (isBeforeQuestion) {
    fs.writeFileSync('a.txt', rawInput)
  }
}

// Run main only when executed directly (not when imported for testing)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
