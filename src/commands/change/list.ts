/**
 * List subcommand for the change command
 * Outputs a table of all active changes with progress
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { syncChangesJson, formatRelativeTime } from './shared.js';

/**
 * Formats and prints the change list as a table to stdout.
 * Columns: name (left-aligned), progress, description, relative time (right-aligned).
 * Prints 'No changes found' if there are no change directories.
 */
export function runChangeList(): void {
  const data = syncChangesJson();

  if (data.changes.length === 0) {
    process.stdout.write('No changes found\n');
    return;
  }

  const allEntries = data.changes;

  // Compute column widths
  const nameWidth = Math.max(4, ...allEntries.map((e) => String(e.name || '').length));
  const progressWidth = Math.max(8, ...allEntries.map((e) => {
    const progressStr = `${Number(e.features ?? 0) - Number(e.todo ?? 0)}/${Number(e.features ?? 0)} features`;
    return progressStr.length;
  }));
  const descWidth = Math.max(11, ...allEntries.map((e) => String(e.description || '').length));

  // Print header
  const headerName = 'Name'.padEnd(nameWidth);
  const headerProg = 'Progress'.padEnd(progressWidth);
  const headerDesc = 'Description'.padEnd(descWidth);
  const headerTime = 'Time';
  process.stdout.write(`${headerName}  ${headerProg}  ${headerDesc}  ${headerTime}\n`);

  // Print separator
  const sep = '-'.repeat(nameWidth + progressWidth + descWidth + 20);
  process.stdout.write(`${sep}\n`);

  // Print each entry
  for (const entry of allEntries) {
    const name = String(entry.name || '').padEnd(nameWidth);
    const progress = `${Number(entry.features ?? 0) - Number(entry.todo ?? 0)}/${Number(entry.features ?? 0)} features`.padEnd(progressWidth);
    const description = String(entry.description || '').padEnd(descWidth);
    const time = formatRelativeTime(String(entry.createdAt || ''));

    process.stdout.write(`${name}  ${progress}  ${description}  ${time}\n`);
  }
}
