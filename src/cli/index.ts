/**
 * @fileoverview CLI command registration main file
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import module from 'module';
import { registerInitCommand } from '../commands/init.js';
import { registerUiCommand } from '../commands/ui.js';
import { registerRemoveCommand } from '../commands/remove.js';
import { registerRecoverCommand } from '../commands/recover.js';
import { registerChangeCommand } from '../commands/change.js';

const require = module.createRequire(import.meta.url);
const pkg = require('../../package.json');

const program = new Command();

program
  .name('openpowers')
  .description('OpenPowers CLI - plugin-based development toolkit')
  .version(pkg.version);

registerInitCommand(program);
registerUiCommand(program);
registerRemoveCommand(program);
registerRecoverCommand(program);
registerChangeCommand(program);

export { program };
