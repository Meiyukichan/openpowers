/**
 * Status subcommand for the change command
 * Computes artifact pipeline status and outputs change status as JSON
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { syncChangesJson, buildArtifacts, ARTIFACT_EXTENSIONS } from './shared.js';

// Core artifact IDs in pipeline order
const CORE_ARTIFACTS = ['proposal', 'design', 'specs'];

/**
 * Computes plan.json status: 'done' only when all features have status 'done',
 * otherwise 'in_progress' (meaning at least one feature is still pending or in progress).
 * @param planPath - Absolute path to plan.json
 * @returns 'done' if all features are done, 'in_progress' otherwise
 */
function computePlanStatus(planPath: string): string {
  try {
    const raw = fs.readFileSync(planPath, 'utf-8');
    const features = JSON.parse(raw);
    if (!Array.isArray(features)) return 'in_progress';
    if (features.length === 0) return 'done';
    return features.every((f: { status?: string }) => f.status === 'done') ? 'done' : 'in_progress';
  } catch {
    return 'in_progress';
  }
}

/**
 * Computes artifact pipeline status for all existing artifacts in a change directory.
 * Status follows sequential order: proposal -> design -> specs.
 * Non-core artifacts (api, database) are assigned 'done' unconditionally when present.
 * Plan status depends on all features being done; otherwise it is 'in_progress'.
 * Output paths are relative to the change directory with forward slashes.
 * @param changeDirPath - The absolute path to the change directory
 * @returns Array of { id, outputPath, status } for each existing artifact
 */
export function computeArtifactStatus(changeDirPath: string): Array<{ id: string; outputPath: string; status: string }> {
  // Check existence of the three core artifacts in sequential order
  const proposalMdExists = fs.existsSync(path.join(changeDirPath, 'proposal.md'));
  const designMdExists = fs.existsSync(path.join(changeDirPath, 'design.md'));
  const specsDir = path.join(changeDirPath, 'specs');
  const specsExist = ((): boolean => {
    // Recursively check specs/ for any .md files (directories may contain nested spec files)
    if (!fs.existsSync(specsDir)) return false;
    const scan = (dir: string): boolean => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries.some((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? scan(full) : e.name.endsWith('.md');
      });
    };
    return scan(specsDir);
  })();

  // Compute core artifact statuses using sequential pipeline logic
  let proposalStatus: string;
  let designStatus: string;
  let specsStatus: string;
  if (!proposalMdExists) {
    proposalStatus = 'ready';
    designStatus = 'blocked';
    specsStatus = 'blocked';
  } else if (!designMdExists) {
    proposalStatus = 'done';
    designStatus = 'ready';
    specsStatus = 'blocked';
  } else if (!specsExist) {
    proposalStatus = 'done';
    designStatus = 'done';
    specsStatus = 'ready';
  } else {
    proposalStatus = 'done';
    designStatus = 'done';
    specsStatus = 'done';
  }

  const coreStatusMap: Record<string, string> = {
    proposal: proposalStatus,
    design: designStatus,
    specs: specsStatus,
  };

  // Build result: core artifacts always included, non-core only when they exist on disk
  const existingArtifacts = buildArtifacts(changeDirPath);

  // Always include the three core artifacts
  const results: Array<{ id: string; outputPath: string; status: string }> = CORE_ARTIFACTS.map((id) => {
    const fileName = id === 'specs' ? `specs${ARTIFACT_EXTENSIONS[id]}` : `${id}${ARTIFACT_EXTENSIONS[id]}`;
    return { id, outputPath: fileName, status: coreStatusMap[id] };
  });

  // Append non-core artifacts that exist on disk, with change-relative outputPath
  for (const artifact of existingArtifacts) {
    if (!CORE_ARTIFACTS.includes(artifact.id)) {
      const fileName = `${artifact.id}${ARTIFACT_EXTENSIONS[artifact.id]}`;
      const artifactStatus = artifact.id === 'plan'
        ? computePlanStatus(path.join(changeDirPath, 'plan.json'))
        : 'done';
      results.push({ id: artifact.id, outputPath: fileName, status: artifactStatus });
    }
  }

  return results;
}

/**
 * Outputs the status of a specific change as JSON.
 * Syncs changes.json first, then searches both changes and archive arrays.
 * Computes artifact pipeline status using computeArtifactStatus and
 * determines isArtsComplete as true only when all three core artifacts (proposal, design, specs) are done.
 * Artifact outputPath values are relative to the change directory.
 * Exits with error if the change name is not found.
 * @param name - The change name to query
 */
export function runChangeStatus(name: string): void {
  // Sync changes.json first
  const data = syncChangesJson();

  // Search in changes array first, then archive
  let status = 'active';
  let entry = data.changes.find((c) => c.name === name);
  if (!entry) {
    entry = data.archive.find((a) => a.name === name);
    status = 'archived';
  }

  if (!entry) {
    process.stderr.write(`Change '${name}' not found\n`);
    process.exit(1);
  }

  logger.info(`Status queried for '${name}' (${status})`);

  // Resolve change directory path and compute artifact pipeline status
  const changeDirPath = path.resolve(process.cwd(), String(entry.path));
  const artifacts = computeArtifactStatus(changeDirPath);

  // isArtsComplete is true only when all three core artifacts are done
  const isArtsComplete = CORE_ARTIFACTS.every((id) => {
    const artifact = artifacts.find((a) => a.id === id);
    return artifact && artifact.status === 'done';
  });

  const output = {
    name: entry.name,
    status,
    isArtsComplete,
    artifacts,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}
