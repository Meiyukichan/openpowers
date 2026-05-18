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

/**
 * Registers the `change` command and its subcommands on the given program.
 * Subcommands: list, new <name> --desc <description>, status <name>,
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
    .command('instruction <name>')
    .description('Get artifact generation instructions')
    .option('--proposal', 'Get proposal generation instructions')
    .option('--design', 'Get design generation instructions')
    .option('--specs', 'Get specs generation instructions')
    .action((name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }) => {
      runChangeInstruction(name, options);
    });

  // Feature lifecycle management sub-subcommands
  const featureCmd = changeCmd
    .command('feature <changeName>')
    .description('Manage features for a change');

  featureCmd
    .command('status')
    .description('Display feature status summary')
    .action((_opts: Record<string, unknown>, command: Command) => {
      const changeName = command.parent?.processedArgs?.[0] as string;
      runFeatureStatus(changeName);
    });

  featureCmd
    .command('next')
    .description('Find the next actionable feature')
    .action((_opts: Record<string, unknown>, command: Command) => {
      const changeName = command.parent?.processedArgs?.[0] as string;
      runFeatureNext(changeName);
    });

  featureCmd
    .command('start <featureId>')
    .description('Start a pending feature')
    .action((featureId: string, _opts: Record<string, unknown>, command: Command) => {
      const changeName = command.parent?.processedArgs?.[0] as string;
      runFeatureStart(changeName, featureId);
    });

  featureCmd
    .command('complete <featureId>')
    .description('Complete an in-progress feature')
    .action((featureId: string, _opts: Record<string, unknown>, command: Command) => {
      const changeName = command.parent?.processedArgs?.[0] as string;
      runFeatureComplete(changeName, featureId);
    });
}
