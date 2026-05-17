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

/**
 * Registers the `change` command and its subcommands on the given program.
 * Subcommands: list, new <name> --desc <description>, status <name>,
 * instruction <name> --proposal|--design|--specs
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
}
