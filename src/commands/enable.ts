/**
 * @fileoverview Enable command - enables the OpenPowers proxy
 * by checking port availability, writing config, and starting the backend service
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { setEnableOpenpowersProxy } from '../server/providers-store.js';
import { startBackendService, UI_PORT } from '../server/service-manager.js';
import { isPortInUse } from '../utils/port-manager.js';
import { logger } from '../utils/logger.js';

/** Max wait time for the backend service to start listening (10 seconds). */
const SERVICE_START_TIMEOUT_MS = 10000;

/** Polling interval between port checks (200ms). */
const PORT_CHECK_INTERVAL_MS = 2000;

/**
 * Polls isPortInUse until the port is occupied or the timeout expires.
 * @returns true if the port became occupied, false on timeout
 */
async function waitForPortInUse(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, PORT_CHECK_INTERVAL_MS));
  }
  return false;
}

/**
 * Enables the OpenPowers proxy: ensures the backend service is running first,
 * then writes the proxy configuration flag.
 * The proxy handler checks the flag per-request, so no restart is needed.
 * On failure, logs the error and exits with code 1.
 */
export async function runEnable(): Promise<void> {
  // Step 1: ensure the backend service is running
  if (!(await isPortInUse(UI_PORT))) {
    // Service is not running — start it
    startBackendService(UI_PORT);

    // Wait for the service to start listening
    const started = await waitForPortInUse(UI_PORT, SERVICE_START_TIMEOUT_MS);
    if (!started) {
      const msg = 'Backend service did not start. Please check the logs for details.';
      process.stderr.write(`${msg}\n`);
      logger.error(msg);
      process.exit(1);
    }
  }

  // Step 2: write the proxy configuration flag
  try {
    setEnableOpenpowersProxy(true);
  } catch (err) {
    process.stderr.write(`Failed to enable proxy: ${err}\n`);
    logger.error(`Failed to enable proxy: ${err}`);
    process.exit(1);
  }

  process.stdout.write('OpenPowers proxy enabled\n');
}

/**
 * Registers the `enable` top-level command on the given program.
 * @param program - The commander Command instance
 */
export function registerEnableCommand(program: Command): void {
  program
    .command('enable')
    .description('Enable the OpenPowers proxy')
    .action(() => {
      void runEnable();
    });
}
