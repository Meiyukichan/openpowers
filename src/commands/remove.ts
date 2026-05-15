/**
 * @fileoverview Remove command - uninstalls openpowers plugin
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';

/**
 * Registers the `remove` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerRemoveCommand(program: Command): void {
  program
    .command('remove')
    .description('Uninstall openpowers plugin')
    .action(() => {
      console.log('openpowers 插件已卸载（mock）');
    });
}
