/**
 * @fileoverview Init command - initializes openpowers in the current project
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';

/**
 * Registers the `init` subcommand on the given program.
 * @param program - The commander Command instance
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize openpowers in the current project')
    .action(() => {
      console.log('openpowers 初始化成功（mock）');
    });
}
