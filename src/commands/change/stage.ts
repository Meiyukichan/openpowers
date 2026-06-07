/**
 * Change stage command — updates the stage progress of a change via CLI
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import { readSessionSettings } from '../../utils/session.js';
import { createOrUpdateChange, readMemoryChangesJson } from '../../utils/memory.js';
import type { StageUpdate } from '../../utils/memory.js';
import { logger } from '../../utils/logger.js';

/** Valid stage names that can be passed to the CLI */
const VALID_STAGES = [
  'workflow',
  'explore',
  'propose',
  'plan',
  'review',
  'coding',
  'finalize',
  'integration',
] as const;

/** Type for valid stage names */
type ValidStage = (typeof VALID_STAGES)[number];

/**
 * Maps CLI stage names to ChangeStageSchema internal field names.
 * review → reviewArtifacts, coding → subAgentDev.
 * workflow is intentionally excluded — it does not generate a changeStage structure.
 */
const STAGE_TO_FIELD_MAP: Partial<Record<ValidStage, string>> = {
  review: 'reviewArtifacts',
  coding: 'subAgentDev',
};

/** Stages that are allowed even when a change has ended */
const ENDED_ALLOWED_STAGES: string[] = ['finalize', 'integration'];

/**
 * Checks whether the change has ended.
 * A change is considered ended if:
 * 1. The change name is not found in the project-level openpowers/changes.json, or
 * 2. The plan.json file exists and all features have status 'done'.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @returns true if the change has ended
 */
function isChangeEnded(cwd: string, changeName: string): boolean {
  // Check project-level changes.json for the change name
  const projectChangesPath = path.join(cwd, 'openpowers', 'changes.json');
  if (!fs.existsSync(projectChangesPath)) {
    return true;
  }

  try {
    const raw = fs.readFileSync(projectChangesPath, 'utf-8');
    const data = JSON.parse(raw) as { changes?: Array<{ name: string }> };
    const changes = Array.isArray(data.changes) ? data.changes : [];
    const found = changes.some((c) => c.name === changeName);
    if (!found) {
      return true;
    }
  } catch {
    return true;
  }

  // Check plan.json features
  const planPath = path.join(cwd, 'openpowers', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    return false; // No plan.json means the change hasn't reached feature stage yet
  }

  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features) || features.length === 0) {
      return false;
    }
    // All features must be done for the change to be ended
    return features.every((f: { status?: string }) => f.status === 'done');
  } catch {
    return false;
  }
}

/**
 * Infers the featureId from plan.json.
 * Returns the id of the first feature with status 'in_progress', or empty string if none found.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @returns The featureId or empty string
 */
function inferFeatureId(cwd: string, changeName: string): string {
  const planPath = path.join(cwd, 'openpowers', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    return '';
  }
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features)) return '';
    const inProgress = features.find((f: { status?: string; featureId?: string; id?: string }) => f.status === 'in_progress');
    return inProgress?.featureId ?? inProgress?.id ?? '';
  } catch {
    return '';
  }
}

/**
 * Dispatches coding stage: infers featureId from plan.json and creates
 * the SubAgentDevProgress structure, then calls createOrUpdateChange.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 */
function handleCodingStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): void {
  const featureId = inferFeatureId(cwd, changeName);
  const changeStage: StageUpdate = {
    subAgentDev: [{ featureId, progress: [stageData] }],
  };
  createOrUpdateChange(cwd, changeName, undefined, changeStage);
  process.stdout.write(`Stage 'coding' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'coding' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Handles the explore stage dispatch with smart inference.
 *
 * Decision logic:
 * 1. If entry.stage is empty/undefined or only explore has data and status !== 'done' → explore
 * 2. If plan.json does not exist → explore
 * 3. Otherwise → coding (via handleCodingStageDispatch)
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 */
function handleExploreStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): void {
  // Read the entry from memory to inspect stage state
  const memoryData = readMemoryChangesJson(cwd);
  const entry = memoryData.changes.find((c) => c.name === changeName);
  const stage = entry?.stage as Record<string, unknown> | undefined;

  // Condition 1: entry.stage is empty or only explore has data and status !== 'done'
  if (!stage || Object.keys(stage).length === 0) {
    // No stage at all → actual is explore
    createOrUpdateChange(cwd, changeName, undefined, { explore: stageData });
    process.stdout.write(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'\n`);
    logger.info(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'`);
    return;
  }

  const stageKeys = Object.keys(stage);
  const onlyExplore = stageKeys.length === 1 && stageKeys[0] === 'explore';
  if (onlyExplore) {
    const exploreStage = stage.explore as { status?: string } | undefined;
    if (!exploreStage || exploreStage.status !== 'done') {
      // Only explore exists and it's not done → actual is explore
      createOrUpdateChange(cwd, changeName, undefined, { explore: stageData });
      process.stdout.write(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'\n`);
      logger.info(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'`);
      return;
    }
  }

  // Condition 2: plan.json doesn't exist → actual is explore
  const planPath = path.join(cwd, 'openpowers', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    createOrUpdateChange(cwd, changeName, undefined, { explore: stageData });
    process.stdout.write(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'\n`);
    logger.info(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'`);
    return;
  }

  // Condition 3: Otherwise → actual is coding
  handleCodingStageDispatch(cwd, changeName, stageData);
}

/**
 * Placeholder handler for propose stage — passes stageData directly as { propose: stageData }.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 */
function handleProposeStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): void {
  createOrUpdateChange(cwd, changeName, undefined, { propose: stageData });
  process.stdout.write(`Stage 'propose' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'propose' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Placeholder handler for plan stage — passes stageData directly as { plan: stageData }.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 */
function handlePlanStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): void {
  createOrUpdateChange(cwd, changeName, undefined, { plan: stageData });
  process.stdout.write(`Stage 'plan' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'plan' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Placeholder handler for review stage — maps to reviewArtifacts field.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 */
function handleReviewStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): void {
  createOrUpdateChange(cwd, changeName, undefined, { reviewArtifacts: stageData });
  process.stdout.write(`Stage 'review' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'review' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Placeholder handler for finalize stage — passes stageData directly as { finalize: { ... } }.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 */
function handleFinalizeStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): void {
  createOrUpdateChange(cwd, changeName, undefined, { finalize: { archive: stageData } });
  process.stdout.write(`Stage 'finalize' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'finalize' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Placeholder handler for integration stage — maps to finalize.integration.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 */
function handleIntegrationStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): void {
  createOrUpdateChange(cwd, changeName, undefined, { finalize: { integration: stageData } });
  process.stdout.write(`Stage 'integration' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'integration' updated to '${stageData.status}' for change '${changeName}'`);
}

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

  // Check if the change has ended; only finalize/integration are allowed through
  if (isChangeEnded(session.cwd, session.change) && !ENDED_ALLOWED_STAGES.includes(stageName)) {
    process.stdout.write(`Change '${session.change}' has ended, only finalize/integration is allowed\n`);
    logger.info(`Change '${session.change}' has ended, only finalize/integration is allowed`);
    return;
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

  if (stageName === 'workflow') {
    // workflow stage passes validation but does not generate changeStage
    process.stdout.write(`Stage 'workflow' acknowledged for change '${session.change}'\n`);
    logger.info(`Stage 'workflow' acknowledged for change '${session.change}'`);
    return;
  }

  if (stageName === 'explore') {
    handleExploreStageDispatch(session.cwd, session.change, stageData);
    return;
  }

  if (stageName === 'coding') {
    handleCodingStageDispatch(session.cwd, session.change, stageData);
    return;
  }

  // Dispatch remaining stages to their placeholder handlers
  switch (stageName) {
    case 'propose':
      handleProposeStageDispatch(session.cwd, session.change, stageData);
      break;
    case 'plan':
      handlePlanStageDispatch(session.cwd, session.change, stageData);
      break;
    case 'review':
      handleReviewStageDispatch(session.cwd, session.change, stageData);
      break;
    case 'finalize':
      handleFinalizeStageDispatch(session.cwd, session.change, stageData);
      break;
    case 'integration':
      handleIntegrationStageDispatch(session.cwd, session.change, stageData);
      break;
    default: {
      // Fallback for stages without dedicated handlers (uses STAGE_TO_FIELD_MAP)
      const schemaField = STAGE_TO_FIELD_MAP[stageName as ValidStage] ?? stageName;
      changeStage = { [schemaField]: stageData };
      createOrUpdateChange(session.cwd, session.change, undefined, changeStage);
      process.stdout.write(`Stage '${stageName}' updated to '${options.status}' for change '${session.change}'\n`);
      logger.info(`Stage '${stageName}' updated to '${options.status}' for change '${session.change}'`);
      break;
    }
  }
}
