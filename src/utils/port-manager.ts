/**
 * @fileoverview Cross-platform port detection and process termination.
 * Uses Node.js net module for port availability checking.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import net from 'net';
import os from 'os';
import { execSync } from 'child_process';
import { logger } from './logger.js';

/**
 * Checks whether a given port is currently in use by attempting to create
 * a temporary server that listens on that port.
 * @param port - The port number to check
 * @returns A promise that resolves to true if the port is occupied, false if free
 */
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

/**
 * Terminates processes occupying the specified port.
 * On Windows uses netstat + taskkill; on Unix uses lsof + kill -9.
 * Multiple PIDs are all terminated. Permission errors are logged and skipped.
 * If no process occupies the port, proceeds without error.
 * @param port - The port number whose occupying processes will be killed
 */
export async function killPortProcess(port: number): Promise<void> {
  logger.info(`Attempting to kill processes on port ${port}`);
  const platform = os.platform();

  if (platform === 'win32') {
    await killPortProcessWindows(port);
  } else {
    await killPortProcessUnix(port);
  }
  logger.info(`Finished killing processes on port ${port}`);
}

/** Default maximum wait time for port to become free (15 seconds). */
const PORT_FREE_MAX_WAIT_MS = 15000;

/** Polling interval between port checks (500ms). */
const PORT_FREE_POLL_INTERVAL_MS = 500;

/**
 * Polls isPortInUse until the port is free, then resolves.
 * Used after killPortProcess to ensure the OS has released the port
 * (e.g. TCP WAITING/TIME_WAIT states) before starting a new server.
 * @param port - The port number to wait for
 * @param maxWaitMs - Maximum time to wait in milliseconds (default 15s)
 * @returns A promise that resolves when the port is free
 * @throws Error if the port is still occupied after maxWaitMs
 */
export async function waitForPortFree(port: number, maxWaitMs: number = PORT_FREE_MAX_WAIT_MS): Promise<void> {
  const platform = os.platform();
  const discoverCommand = platform === 'win32'
    ? `netstat -ano | findstr :${port}`
    : `lsof -ti :${port}`;

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const output = execSync(discoverCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });
      if (!output.trim()) {
        logger.info(`Port ${port} is now free`);
        return;
      }
    } catch {
      // Command returned no matches (findstr returns error on no match, lsof returns error on empty)
      logger.info(`Port ${port} is now free`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, PORT_FREE_POLL_INTERVAL_MS));
  }
  throw new Error(`Port ${port} is still occupied after ${maxWaitMs}ms`);
}

/**
 * Common process termination logic: discovers PIDs via a platform-specific
 * command, parses the output, and terminates each PID with a kill command.
 * Permission errors are logged and skipped.
 * @param port - The port number
 * @param discoverCommand - Platform command to discover PIDs on the port
 * @param parsePids - Function to extract PID strings from discovery command output
 * @param buildKillCommand - Function to build the kill command for a given PID
 */
async function killPortWithCommand(
  port: number,
  discoverCommand: string,
  parsePids: (output: string) => string[],
  buildKillCommand: (pid: string) => string,
): Promise<void> {
  try {
    const output = execSync(discoverCommand, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    if (!output.trim()) {
      return;
    }

    const pids = parsePids(output);
    for (const pid of pids) {
      try {
        execSync(buildKillCommand(pid), {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd(),
        });
        logger.info(`Killed process on port ${port} (PID: ${pid})`);
      } catch (err) {
        logger.error(`Failed to kill process on port ${port} (PID: ${pid}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    logger.warn(`Failed to discover processes on port ${port}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
}

/**
 * Windows implementation: uses netstat to find PIDs and taskkill to terminate.
 */
async function killPortProcessWindows(port: number): Promise<void> {
  await killPortWithCommand(
    port,
    `netstat -ano | findstr :${port}`,
    parseWindowsNetstatOutput,
    (pid) => `taskkill /PID ${pid} /F`,
  );
}

/**
 * Unix implementation: uses lsof to find PIDs and kill -9 to terminate.
 */
async function killPortProcessUnix(port: number): Promise<void> {
  await killPortWithCommand(
    port,
    `lsof -ti :${port}`,
    (output) => output.trim().split('\n').map((s) => s.trim()).filter(Boolean),
    (pid) => `kill -9 ${pid}`,
  );
}

/**
 * Parses Windows netstat output to extract unique PIDs.
 * netstat -ano format example:
 *   TCP    0.0.0.0:3939    0.0.0.0:0    LISTENING    45678
 * @param output - Raw output from netstat -ano | findstr
 * @returns Array of unique PID strings
 */
function parseWindowsNetstatOutput(output: string): string[] {
  const pidSet = new Set<string>();
  const lines = output.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    // Last column is the PID
    const pid = parts[parts.length - 1];
    // PID 0 is the System Idle Process and cannot be terminated
    if (pid && /^\d+$/.test(pid) && pid !== '0') {
      pidSet.add(pid);
    }
  }

  return Array.from(pidSet);
}
