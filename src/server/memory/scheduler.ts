/**
 * Global memory scheduler: runs a daily task to copy resources/agents
 * and resources/skills into project .claude directories and clean up .opencode.
 * Cron expression is read from enhancement.memory.schedule in
 * resources/openpowers.json, falling back to '0 2 * * *'.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendLog } from './schedule-logger.js';
import { readDreamworkConfig, writeDreamworkConfig, formatYesterday } from './dreamwork.js';

// Resolve resources directory relative to compiled output:
//   dist/server/memory/scheduler.js -> ../../resources
const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.resolve(moduleDirname, '..', '..', 'resources');

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
 * Starts the daily scheduler.
 * Reads the cron expression from enhancement.memory.schedule in
 * resources/openpowers.json (fallback to '0 2 * * *').
 * Registers a cron job that processes dreamwork.json projects,
 * then writes back each project with status='done' and changes=[].
 * No-op if already running.
 */
export function startScheduler(): void {
  if (cronTask) {
    appendLog('Scheduler start skipped: already running');
    return;
  }

  const cronExpression = readCronFromConfig();
  appendLog(`Scheduler cron registered (${cronExpression})`);
  cronTask = cron.schedule(cronExpression, () => {
    appendLog('Scheduler task started');

    // 1) Validate workAt is yesterday
    const config = readDreamworkConfig();
    const yesterday = formatYesterday();

    if (config.workAt !== yesterday) {
      appendLog(`Scheduler aborted: workAt mismatch (expected ${yesterday}, got ${config.workAt})`);
      // Reset dreamwork config to default
      writeDreamworkConfig({
        workAt: formatYesterday(),
        projects: [],
      });
      appendLog('Scheduler task finished');
      return;
    }

    // 2) Serial processing of projects
    for (const project of config.projects) {
      appendLog(`Processing project: ${project.project}`);

      const claudeDir = path.join(project.project, '.claude');

      // Copy resources/agents to {project.project}/.claude/agents
      const srcAgents = path.join(resourcesDir, 'agents');
      const destAgents = path.join(claudeDir, 'agents');
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }
      fs.cpSync(srcAgents, destAgents, { recursive: true });

      // Copy resources/skills to {project.project}/.claude/skills
      const srcSkills = path.join(resourcesDir, 'skills');
      const destSkills = path.join(claudeDir, 'skills');
      fs.cpSync(srcSkills, destSkills, { recursive: true });

      // Delete .opencode directory if exists
      const opencodeDir = path.join(project.project, '.opencode');
      if (fs.existsSync(opencodeDir)) {
        fs.rmSync(opencodeDir, { recursive: true, force: true });
      }

      appendLog(`Project done: ${project.project}`);

      // 3) Write back: mark project as done and clear changes
      project.status = 'done';
      project.changes = [];
    }

    // Persist writeback
    writeDreamworkConfig(config);
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
