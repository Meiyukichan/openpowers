/**
 * Change command barrel file - registers all change subcommands
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import { runChangeList } from './list.js';
import { runChangeNew } from './new.js';
import { runChangeStatus } from './status.js';
import { runChangeInstruction } from './instruction.js';
import { runFeatureStatus, runFeatureNext, runFeatureStart, runFeatureComplete } from './feature.js';
import { runChangeArchive } from './archive.js';

/**
 * Registers the `change` command and its subcommands on the given program.
 * Subcommands: list, new <name> --desc <description>, status <name>,
 * archive <name>,
 * instruction <name> --proposal|--design|--specs,
 * feature <changeName> (status|next|start <featureId>|complete <featureId>)
 * @param program - The commander Command instance
 */
export function registerChangeCommand(program: Command): void {
  const changeCmd = program
    .command('change')
    .description('Manage OpenPowers change artifacts');

  changeCmd
    .command('list')
    .description('List all changes with progress')
    .action(() => {
      runChangeList();
    });

  changeCmd
    .command('new <name>')
    .description('Create a new change')
    .requiredOption('--desc <description>', 'Brief description of the change')
    .action((name: string, options: { desc: string }) => {
      runChangeNew(name, options);
    });

  changeCmd
    .command('status <name>')
    .description('Show status of a specific change')
    .action((name: string) => {
      runChangeStatus(name);
    });

  changeCmd
    .command('archive <name>')
    .description('Archive a completed change')
    .action((name: string) => {
      runChangeArchive(name);
    });

  changeCmd
    .command('instruction <name>')
    .description('Get artifact generation instructions')
    .option('--proposal', 'Get proposal generation instructions')
    .option('--design', 'Get design generation instructions')
    .option('--specs', 'Get specs generation instructions')
    .action((name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }) => {
      runChangeInstruction(name, options);
    });

  // Feature lifecycle management subcommands
  changeCmd
    .command('feature <changeName>')
    .description('Manage features for a change')
    .option('--status', 'Display feature status summary')
    .option('--next', 'Find the next actionable feature')
    .option('--start <featureId>', 'Start a pending feature')
    .option('--complete <featureId>', 'Complete an in-progress feature')
    .action((changeName: string, options: { status?: boolean; next?: boolean; start?: string; complete?: string }) => {
      if (options.status) {
        runFeatureStatus(changeName);
      } else if (options.next) {
        runFeatureNext(changeName);
      } else if (options.start) {
        runFeatureStart(changeName, options.start);
      } else if (options.complete) {
        runFeatureComplete(changeName, options.complete);
      } else {
        process.stderr.write('Error: No action specified. Use --status, --next, --start <featureId>, or --complete <featureId>\n');
        process.exit(1);
      }
    });
}
