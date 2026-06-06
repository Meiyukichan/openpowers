/**
 * Global memory scheduler: runs a daily task to scan .openpowers/memory
 * directories for pending designs, copy agents/skills, execute claude CLI,
 * and clean up.
 * Cron expression is read from enhancement.memory.schedule in
 * resources/openpowers.json, falling back to '0 2 * * *'.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendLog } from './schedule-logger.js';

const execAsync = promisify(exec);

// Resolve resources directory relative to compiled output:
//   dist/server/memory/scheduler.js -> ../../../resources
const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.resolve(moduleDirname, '..', '..', '..', 'resources');

// Memory root directory for scanning
const MEMORY_DIR = path.join(os.homedir(), '.openpowers', 'memory');

/**
 * Reads the cron expression from resources/openpowers.json,
 * falling back to '0 2 * * *' on any failure.
 */
function readCronFromConfig(): string {
  const fallback = '0 2 * * *';
  try {
    const configPath = path.join(resourcesDir, 'openpowers.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const enhancement = parsed?.['enhancement'] as Record<string, unknown> | undefined;
    const memory = enhancement?.['memory'] as Record<string, unknown> | undefined;
    const schedule = memory?.['schedule'];
    if (typeof schedule === 'string' && schedule.length > 0) {
      appendLog(`Scheduler using cron from config: ${schedule}`);
      return schedule;
    }
    appendLog(`Scheduler using default cron: ${fallback} (enhancement.memory.schedule not found)`);
  } catch {
    appendLog(`Scheduler using default cron: ${fallback} (could not read config)`);
  }
  return fallback;
}

let cronTask: cron.ScheduledTask | null = null;

/**
 * Returns whether the scheduler cron task is currently registered.
 */
export function isSchedulerRunning(): boolean {
  return cronTask !== null;
}

/**
 * Checks if a directory's designs/ subdirectory exists and is non-empty
 * (contains at least one .md file).
 */
function hasNonEmptyDesigns(memorySubDir: string): boolean {
  const designsDir = path.join(memorySubDir, 'designs');
  try {
    const entries = fs.readdirSync(designsDir);
    return entries.some((entry) => entry.endsWith('.md'));
  } catch {
    return false;
  }
}

/**
 * Copies resources/agents and resources/skills to the target .claude directory.
 */
function copyClaudeResources(claudeDir: string): void {
  const srcAgents = path.join(resourcesDir, 'agents');
  const destAgents = path.join(claudeDir, 'agents');
  fs.cpSync(srcAgents, destAgents, { recursive: true });

  const srcSkills = path.join(resourcesDir, 'skills');
  const destSkills = path.join(claudeDir, 'skills');
  fs.cpSync(srcSkills, destSkills, { recursive: true });
}

/**
 * Builds and executes the claude CLI command for the given project.
 */
async function executeClaudeDesigner(designsDir: string, projectDir: string, designMdNames: string[]): Promise<void> {
  const designMdList = designMdNames.join('、');
  const command = `claude --add-dir "${designsDir}" --agent backgroud-designer --permission-mode bypassPermissions -p "使用子代理：backgroud-designer 按照它的要求和步骤处理。变更设计文档列表为： ${designMdList}"`;
  appendLog(`Executing: ${command}`);
  await execAsync(command, {
    cwd: projectDir,
    timeout: 600000, // 10 minutes
    env: process.env,
    windowsHide: true,
  });
  appendLog(`Claude execution succeeded: ${projectDir}`);
}

/**
 * Deletes the designs/ directory only when both project-design.md
 * and project-portrait.md exist after claude execution.
 */
function tryCleanupDesigns(projectDir: string, designMdPaths: string[]): void {
  const projectDesignExists = fs.existsSync(path.join(projectDir, 'project-design.md'));
  const projectPortraitExists = fs.existsSync(path.join(projectDir, 'project-portrait.md'));
  if (projectDesignExists && projectPortraitExists) {
    for (const mdPath of designMdPaths) {
      try {
        if (fs.existsSync(mdPath)) {
          fs.rmSync(mdPath);
          appendLog(`Cleaned up design file: ${mdPath}`);
        }
      } catch (cleanupErr) {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        appendLog(`Failed to cleanup design file ${mdPath}: ${msg}`);
      }
    }
  } else {
    appendLog(
      `Skipping designs cleanup: project-design.md=${projectDesignExists}, project-portrait.md=${projectPortraitExists}`,
    );
  }
}

/**
 * Deletes the .claude/ directory, logging failures without throwing.
 */
function tryCleanupClaude(claudeDir: string): void {
  try {
    if (fs.existsSync(claudeDir)) {
      fs.rmSync(claudeDir, { recursive: true, force: true });
      appendLog(`Cleaned up .claude: ${claudeDir}`);
    }
  } catch (cleanupErr) {
    const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
    appendLog(`Failed to cleanup .claude ${claudeDir}: ${msg}`);
  }
}

/**
 * Processes a single project directory: copies agents/skills, executes
 * claude CLI, conditionally cleans up designs/, and cleans up .claude/.
 */
async function processProject(projectDir: string): Promise<void> {
  appendLog(`Processing: ${projectDir}`);

  const claudeDir = path.join(projectDir, '.claude');
  const designsDir = path.join(projectDir, 'designs');

  // Read the list of .md files in designs/
  let designMdNames: string[];
  try {
    designMdNames = fs.readdirSync(designsDir).filter((entry) => entry.endsWith('.md'));
  } catch {
    appendLog(`Could not read designs directory: ${designsDir}`);
    return;
  }
  const designMdPaths = designMdNames.map((name) => path.join(designsDir, name));

  try {
    copyClaudeResources(claudeDir);
    await executeClaudeDesigner(designsDir, projectDir, designMdNames);
    tryCleanupDesigns(projectDir, designMdPaths);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`Claude execution failed for ${projectDir}: ${message}`);
  } finally {
    tryCleanupClaude(claudeDir);
  }
}

/**
 * Starts the daily scheduler.
 * Reads the cron expression from enhancement.memory.schedule in
 * resources/openpowers.json (fallback to '0 2 * * *').
 * Registers a cron job that scans ~/.openpowers/memory/
 * for subdirectories with non-empty designs/ folders,
 * copies agents/skills, executes claude CLI, and cleans up.
 * No-op if already running.
 */
export function startScheduler(): void {
  if (cronTask) {
    appendLog('Scheduler start skipped: already running');
    return;
  }

  const cronExpression = readCronFromConfig();
  appendLog(`Scheduler cron registered (${cronExpression})`);
  cronTask = cron.schedule(cronExpression, async () => {
    appendLog('Scheduler task started');

    // 1) Scan memory directory for subdirectories
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(MEMORY_DIR, { withFileTypes: true });
    } catch {
      appendLog('Scheduler: could not read memory directory, skipping');
      appendLog('Scheduler task finished');
      return;
    }

    // 2) Filter to directories with non-empty designs/
    const pendingDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(MEMORY_DIR, entry.name))
      .filter((subDir) => hasNonEmptyDesigns(subDir));

    if (pendingDirs.length === 0) {
      appendLog('Scheduler: no directories with pending designs found');
      appendLog('Scheduler task finished');
      return;
    }

    // 3) Serial processing of directories
    for (const projectDir of pendingDirs) {
      await processProject(projectDir);
    }

    appendLog('Scheduler task finished');
  });

  cronTask.start();
}

/**
 * Stops and destroys the scheduler cron task.
 * No-op if not running.
 */
export function stopScheduler(): void {
  if (cronTask) {
    appendLog('Scheduler stopped');
    cronTask.stop();
    cronTask.destroy();
    cronTask = null;
  }
}
