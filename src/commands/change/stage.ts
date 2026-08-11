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
  'brainstorm',
  'propose',
  'plan',
  'review',
  'coding',
  'integration',
  'codecheck',
  'archive',
] as const;

/** Type for valid stage names */
type ValidStage = (typeof VALID_STAGES)[number];

/** Stages that are allowed even when a change has ended */
const ENDED_ALLOWED_STAGES: string[] = ['integration', 'codecheck', 'archive'];

/**
 * Checks whether the change has ended.
 * A change is considered ended if:
 * 1. The change name is not found in the project-level furina/changes.json, or
 * 2. The plan.json file exists and all features have status 'done'.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @returns true if the change has ended
 */
function isChangeEnded(cwd: string, changeName: string): boolean {
  // Check project-level changes.json for the change name
  const projectChangesPath = path.join(cwd, 'furina', 'changes.json');
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
  const planPath = path.join(cwd, 'furina', 'changes', changeName, 'plan.json');
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
  const planPath = path.join(cwd, 'furina', 'changes', changeName, 'plan.json');
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
 * Smart routing for coding stage: routes to subAgentDev or finalize.integration[]
 * based on plan.json feature status.
 *
 * Decision logic:
 * 1. If all features in plan.json are done → finalize.integration[] (append or merge by title)
 * 2. Otherwise → subAgentDev with first in_progress featureId
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 * @param stage - Current stage context
 */
function handleCodingStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
  features: Array<{ featureId?: string; id?: string; status?: string }>,
): void {
  const allDone = features.length > 0 && features.every((f) => f.status === 'done');

  if (allDone) {
    // Route to finalize.integration[]
    const finalize = stage?.finalize as Record<string, unknown> | undefined;
    const existingIntegration = (finalize?.integration as Array<Record<string, unknown>> | undefined) ?? [];

    // Find existing entry by title
    const existingIdx = existingIntegration.findIndex((item) => item.title === stageData.title);
    if (existingIdx >= 0) {
      // Merge with non-empty overwrite
      const merged = mergeStageStep(existingIntegration[existingIdx], stageData);
      const updated = [...existingIntegration];
      updated[existingIdx] = merged;
      createOrUpdateChange(cwd, changeName, undefined, { finalize: { integration: updated } });
    } else {
      // Append
      createOrUpdateChange(cwd, changeName, undefined, {
        finalize: { integration: [...existingIntegration, stageData as unknown as Record<string, unknown>] },
      });
    }
    process.stdout.write(`Stage 'coding' updated to '${stageData.status}' for change '${changeName}'\n`);
    logger.info(`Stage 'coding' updated to '${stageData.status}' for change '${changeName}'`);
    return;
  }

  // Route to subAgentDev
  const featureId = inferFeatureId(cwd, changeName);
  const stageUpdate = mergeSubAgentDevEntry(stage, featureId, stageData);
  createOrUpdateChange(cwd, changeName, undefined, stageUpdate);

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
  stage: Record<string, unknown> | undefined,
  features: Array<{ featureId?: string; id?: string; status?: string }>,
): void {
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
  const planPath = path.join(cwd, 'furina', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    createOrUpdateChange(cwd, changeName, undefined, { explore: stageData });
    process.stdout.write(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'\n`);
    logger.info(`Stage 'explore' updated to '${stageData.status}' for change '${changeName}'`);
    return;
  }

  // Condition 3: Otherwise → actual is coding
  handleCodingStageDispatch(cwd, changeName, stageData, stage, features);
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
  _stage: Record<string, unknown> | undefined,
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
  _stage: Record<string, unknown> | undefined,
): void {
  createOrUpdateChange(cwd, changeName, undefined, { plan: stageData });
  process.stdout.write(`Stage 'plan' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'plan' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Reads plan.json and returns the features array, or empty array on error/not found.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @returns Array of features from plan.json
 */
function readPlanFeatures(cwd: string, changeName: string): Array<{ featureId?: string; id?: string; status?: string }> {
  const planPath = path.join(cwd, 'furina', 'changes', changeName, 'plan.json');
  if (!fs.existsSync(planPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features)) return [];
    return features;
  } catch {
    return [];
  }
}

/**
 * Merges stageData into stage.subAgentDev for the given featureId.
 * Finds the existing entry by featureId, then finds/merges/appends progress by title.
 * Returns the StageUpdate to be passed to createOrUpdateChange.
 *
 * @param stage - Current stage context
 * @param featureId - The feature ID to target
 * @param stageData - The stage step data from CLI
 * @returns StageUpdate containing the updated subAgentDev array
 */
function mergeSubAgentDevEntry(
  stage: Record<string, unknown> | undefined,
  featureId: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
): StageUpdate {
  const subAgentDevArray = (stage?.subAgentDev as Array<{ featureId?: string; progress?: Array<Record<string, unknown>> }> | undefined) ?? [];

  // Find existing entry by featureId
  const existingEntry = subAgentDevArray.find((e) => e.featureId === featureId);
  if (existingEntry && existingEntry.progress) {
    // Find existing progress by title
    const existingProgress = existingEntry.progress.find((p) => p.title === stageData.title);
    if (existingProgress) {
      // Merge with non-empty overwrite
      const merged = mergeStageStep(existingProgress, stageData);
      const updatedProgress = existingEntry.progress.map((p) => (p.title === stageData.title ? merged : p));
      const updatedSubAgentDev = subAgentDevArray.map((e) =>
        e.featureId === featureId ? { ...e, progress: updatedProgress } : e,
      );
      return { subAgentDev: updatedSubAgentDev };
    } else {
      // Append new progress
      const updatedProgress = [...existingEntry.progress, stageData as unknown as Record<string, unknown>];
      const updatedSubAgentDev = subAgentDevArray.map((e) =>
        e.featureId === featureId ? { ...e, progress: updatedProgress } : e,
      );
      return { subAgentDev: updatedSubAgentDev };
    }
  } else {
    // Create new entry
    const newEntry = { featureId, progress: [stageData as unknown as Record<string, unknown>] };
    return { subAgentDev: [...subAgentDevArray, newEntry] };
  }
}

/**
 * Smart routing for review stage: routes to reviewArtifacts or subAgentDev
 * based on plan.json feature status and existing stage data.
 *
 * Decision logic:
 * 1. If plan.json all features pending AND (no reviewArtifacts or status !== 'done') → reviewArtifacts
 * 2. Otherwise → subAgentDev with first in_progress featureId (or empty string)
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 * @param stage - Current stage context
 */
function handleReviewStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
  features: Array<{ featureId?: string; id?: string; status?: string }>,
): void {
  const allPending = features.length > 0 && features.every((f) => f.status === 'pending');
  const reviewArtifacts = stage?.reviewArtifacts as { status?: string } | undefined;

  if (allPending && (!reviewArtifacts || reviewArtifacts.status !== 'done')) {
    // Route to reviewArtifacts
    createOrUpdateChange(cwd, changeName, undefined, { reviewArtifacts: stageData });
    process.stdout.write(`Stage 'review' updated to '${stageData.status}' for change '${changeName}'\n`);
    logger.info(`Stage 'review' updated to '${stageData.status}' for change '${changeName}'`);
    return;
  }

  // Route to subAgentDev
  const featureId = inferFeatureId(cwd, changeName);
  const stageUpdate = mergeSubAgentDevEntry(stage, featureId, stageData);
  createOrUpdateChange(cwd, changeName, undefined, stageUpdate);

  process.stdout.write(`Stage 'review' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'review' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Handler for integration stage — writes to finalize.integration[] with array merge.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 */
function handleIntegrationStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
): void {
  const finalize = stage?.finalize as Record<string, unknown> | undefined;
  const existingIntegration = (finalize?.integration as Array<Record<string, unknown>> | undefined) ?? [];

  // Find existing entry by title
  const existingIdx = existingIntegration.findIndex((item) => item.title === stageData.title);
  if (existingIdx >= 0) {
    // Merge with non-empty overwrite
    const merged = mergeStageStep(existingIntegration[existingIdx], stageData);
    const updated = [...existingIntegration];
    updated[existingIdx] = merged;
    createOrUpdateChange(cwd, changeName, undefined, { finalize: { integration: updated } });
  } else {
    // Append new entry
    createOrUpdateChange(cwd, changeName, undefined, {
      finalize: { integration: [...existingIntegration, stageData as unknown as Record<string, unknown>] },
    });
  }

  process.stdout.write(`Stage 'integration' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'integration' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Handler for brainstorm stage — writes directly to the brainstorm field.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 * @param _stage - Current stage context (unused for simple dispatch)
 */
function handleBrainstormStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  _stage: Record<string, unknown> | undefined,
): void {
  createOrUpdateChange(cwd, changeName, undefined, { brainstorm: stageData });
  process.stdout.write(`Stage 'brainstorm' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'brainstorm' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Non-empty overwrite merge: overwrites existing fields only if the new value
 * is truthy and not an empty string. Status field overwrites unconditionally.
 */
function mergeStageStep(
  existing: Record<string, unknown> | undefined,
  incoming: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: string },
): Record<string, unknown> {
  const base = existing ? { ...existing } : {};
  if (incoming.title && incoming.title !== '') base.title = incoming.title;
  if (incoming.inputPath && incoming.inputPath !== '') base.inputPath = incoming.inputPath;
  if (incoming.outputPath && incoming.outputPath !== '') base.outputPath = incoming.outputPath;
  if (incoming.from && incoming.from !== '') base.from = incoming.from;
  if (incoming.to && incoming.to !== '') base.to = incoming.to;
  base.status = incoming.status;
  return base;
}

/**
 * Handler for codecheck stage — writes to finalize.codecheck with merge.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 * @param stage - Current stage context
 */
function handleCodecheckStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
): void {
  const finalize = stage?.finalize as Record<string, unknown> | undefined;
  const existing = finalize?.codecheck as Record<string, unknown> | undefined;
  const merged = mergeStageStep(existing, stageData);
  createOrUpdateChange(cwd, changeName, undefined, { finalize: { codecheck: merged } });
  process.stdout.write(`Stage 'codecheck' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'codecheck' updated to '${stageData.status}' for change '${changeName}'`);
}

/**
 * Handler for archive stage — writes to finalize.archive with merge.
 *
 * @param cwd - The working directory
 * @param changeName - The change name
 * @param stageData - The stage step data from CLI
 * @param stage - Current stage context
 */
function handleArchiveStageDispatch(
  cwd: string,
  changeName: string,
  stageData: { title: string; inputPath: string; outputPath: string; from: string; to: string; status: 'in_progress' | 'done' | 'skipped' },
  stage: Record<string, unknown> | undefined,
): void {
  const finalize = stage?.finalize as Record<string, unknown> | undefined;
  const existing = finalize?.archive as Record<string, unknown> | undefined;
  const merged = mergeStageStep(existing, stageData);
  createOrUpdateChange(cwd, changeName, undefined, { finalize: { archive: merged } });
  process.stdout.write(`Stage 'archive' updated to '${stageData.status}' for change '${changeName}'\n`);
  logger.info(`Stage 'archive' updated to '${stageData.status}' for change '${changeName}'`);
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

  // Read the current stage context from memory for all dispatch functions to share
  const memoryData = readMemoryChangesJson(session.cwd);
  const entry = memoryData.changes.find((c) => c.name === session.change);
  const stage = entry?.stage as Record<string, unknown> | undefined;

  // Read plan features once for all dispatch functions and change-end check
  const features = readPlanFeatures(session.cwd, session.change);

  // Check if the change has ended; only integration/codecheck/archive are allowed through.
  // coding is also allowed when all features are done (it routes to finalize.integration).
  const changeEnded = isChangeEnded(session.cwd, session.change);
  const isCodingAllDone = stageName === 'coding' && features.every((f) => f.status === 'done');
  if (changeEnded && !ENDED_ALLOWED_STAGES.includes(stageName) && !isCodingAllDone) {
    process.stdout.write(`Change '${session.change}' has ended, only integration/codecheck/archive is allowed\n`);
    logger.info(`Change '${session.change}' has ended, only integration/codecheck/archive is allowed`);
    return;
  }

  if (stageName === 'workflow') {
    // workflow stage passes validation but does not generate changeStage
    process.stdout.write(`Stage 'workflow' acknowledged for change '${session.change}'\n`);
    logger.info(`Stage 'workflow' acknowledged for change '${session.change}'`);
    return;
  }

  if (stageName === 'explore') {
    handleExploreStageDispatch(session.cwd, session.change, stageData, stage, features);
    return;
  }

  // Dispatch remaining stages to their handlers
  switch (stageName) {
    case 'brainstorm':
      handleBrainstormStageDispatch(session.cwd, session.change, stageData, stage);
      break;
    case 'propose':
      handleProposeStageDispatch(session.cwd, session.change, stageData, stage);
      break;
    case 'plan':
      handlePlanStageDispatch(session.cwd, session.change, stageData, stage);
      break;
    case 'review':
      handleReviewStageDispatch(session.cwd, session.change, stageData, stage, features);
      break;
    case 'coding':
      handleCodingStageDispatch(session.cwd, session.change, stageData, stage, features);
      break;
    case 'integration':
      handleIntegrationStageDispatch(session.cwd, session.change, stageData, stage);
      break;
    case 'codecheck':
      handleCodecheckStageDispatch(session.cwd, session.change, stageData, stage);
      break;
    case 'archive':
      handleArchiveStageDispatch(session.cwd, session.change, stageData, stage);
      break;
  }
}
