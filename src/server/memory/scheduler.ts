/**
 * Global memory scheduler: runs a daily task at 2 AM to copy resources/agents
 * and resources/skills into project .claude directories and clean up .opencode.
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

let cronTask: cron.ScheduledTask | null = null;

/**
 * Returns whether the scheduler cron task is currently registered.
 */
export function isSchedulerRunning(): boolean {
  return cronTask !== null;
}

/**
 * Starts the daily scheduler.
 * Registers a cron job for 2 AM daily that processes dreamwork.json projects.
 * No-op if already running.
 */
export function startScheduler(): void {
  if (cronTask) {
    return;
  }

  cronTask = cron.schedule('0 2 * * *', () => {
    appendLog('Scheduler task started');

    // 1) Validate workAt is yesterday
    const config = readDreamworkConfig();
    const yesterday = formatYesterday();

    if (config.workAt !== yesterday) {
      appendLog(`Scheduler aborted: workAt mismatch (expected ${yesterday}, got ${config.workAt})`);
      // Reset dreamwork config to default
      writeDreamworkConfig({
        status: 'ready',
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
    cronTask.stop();
    cronTask.destroy();
    cronTask = null;
  }
}
