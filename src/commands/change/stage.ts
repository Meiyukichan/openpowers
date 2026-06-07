/**
 * Change stage command — updates the stage progress of a change via CLI
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { readSessionSettings } from '../../utils/session.js';
import { createOrUpdateChange } from '../../utils/memory.js';
import type { StageUpdate } from '../../utils/memory.js';
import { logger } from '../../utils/logger.js';

/** Valid stage names that can be passed to the CLI */
const VALID_STAGES = [
  'explore',
  'brainstorm',
  'propose',
  'plan',
  'reviewArtifacts',
  'subAgentDev',
  'finalize',
  'integration',
] as const;

/** Type for valid stage names */
type ValidStage = (typeof VALID_STAGES)[number];

/**
 * Runs the `change stage` command.
 *
 * Reads session settings via sessionId to obtain cwd and change name,
 * validates the stage name, and combines all parameters into a changeStage
 * structure before passing it to createOrUpdateChange.
 *
 * @param stageName - The stage name (e.g. 'explore', 'brainstorm')
 * @param options - CLI options: session, status, and optional title/input/output
 */
export function runChangeStage(
  stageName: string,
  options: { session?: string; status?: string; title?: string; input?: string; output?: string },
): void {
  // Validate required options
  if (!options.session) {
    process.stderr.write('Error: Required option --session <sessionId> is missing\n');
    logger.error('Required option --session <sessionId> is missing');
    process.exit(1);
  }

  if (!options.status) {
    process.stderr.write('Error: Required option --status <status> is missing\n');
    logger.error('Required option --status <status> is missing');
    process.exit(1);
  }

  // Validate status value
  const validStatuses = ['in_progress', 'done', 'skipped'];
  if (!validStatuses.includes(options.status)) {
    process.stderr.write(`Error: Invalid status '${options.status}'. Must be one of: ${validStatuses.join(', ')}\n`);
    logger.error(`Invalid status '${options.status}'`);
    process.exit(1);
  }

  // Validate stage name
  if (!VALID_STAGES.includes(stageName as ValidStage)) {
    process.stderr.write(`Error: Invalid stage name '${stageName}'. Valid stages: ${VALID_STAGES.join(', ')}\n`);
    logger.error(`Invalid stage name '${stageName}'`);
    process.exit(1);
  }

  // Read session settings
  const session = readSessionSettings(options.session);
  if (!session) {
    process.stderr.write(`Error: Session '${options.session}' not found\n`);
    logger.error(`Session '${options.session}' not found`);
    process.exit(1);
  }

  // Validate session has change field
  if (!session.change) {
    process.stderr.write(`Error: Session '${options.session}' has no associated change\n`);
    logger.error(`Session '${options.session}' has no associated change`);
    process.exit(1);
  }

  // Build the StageStep data
  const now = new Date().toISOString();
  const stageData = {
    title: options.title ?? '',
    inputPath: options.input ?? '',
    outputPath: options.output ?? '',
    from: now,
    to: now,
    status: options.status as 'in_progress' | 'done' | 'skipped',
  };

  // Build the changeStage structure
  let changeStage: StageUpdate;

  if (stageName === 'integration') {
    // integration is an alias for finalize.integration
    changeStage = {
      finalize: {
        integration: stageData,
      },
    };
  } else if (stageName === 'subAgentDev') {
    // subAgentDev wraps the stage step in an array
    changeStage = {
      subAgentDev: [stageData],
    };
  } else {
    changeStage = {
      [stageName]: stageData,
    };
  }

  // Call memory utility
  createOrUpdateChange(session.cwd, session.change, undefined, changeStage);

  process.stdout.write(`Stage '${stageName}' updated to '${options.status}' for change '${session.change}'\n`);
  logger.info(`Stage '${stageName}' updated to '${options.status}' for change '${session.change}'`);
}
