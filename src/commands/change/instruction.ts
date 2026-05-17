/**
 * Instruction subcommand for the change command
 * Generates artifact creation instructions from templates
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import url from 'url';
import { logger } from '../../utils/logger.js';
import { validateChangeName } from './shared.js';

// Resolve the directory of this module for reading template files
const changeCommandDirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * Reads an artifact template JSON file from the data/ directory.
 * Resolved relative to this source file's location using import.meta.url.
 * @param artifactId - The artifact identifier (proposal, design, or specs)
 * @returns Parsed template object
 */
export function readTemplateFile(artifactId: string): Record<string, unknown> {
  const templatePath = path.join(changeCommandDirname, '..', '..', '..', 'resources', `${artifactId}-template.json`);
  const raw = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Outputs the instruction JSON for a given artifact type.
 * Reads the corresponding template from data/, fills in changeName and outputPath
 * (replacing [change-name] placeholders), checks dependency file existence for
 * --design and --specs flags, and outputs the resulting JSON to stdout.
 * @param name - The change name (must be kebab-case)
 * @param options - Options containing exactly one of --proposal, --design, or --specs
 */
export function runChangeInstruction(name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }): void {
  // Validate change name
  const validation = validateChangeName(name);
  if (!validation.valid) {
    logger.error(validation.error);
    process.exit(1);
  }

  // Ensure exactly one flag is set
  const flags = [options.proposal, options.design, options.specs].filter(Boolean);
  if (flags.length !== 1) {
    logger.error('Exactly one of --proposal, --design, or --specs is required');
    process.exit(1);
  }

  // Determine artifact type from flag
  let artifactId: string;
  if (options.proposal) {
    artifactId = 'proposal';
  } else if (options.design) {
    artifactId = 'design';
  } else {
    artifactId = 'specs';
  }

  // Read the template file and replace [change-name] placeholders
  const templateRaw = JSON.stringify(readTemplateFile(artifactId));
  const filledRaw = templateRaw.replace(/\[change-name\]/g, name);
  const result = JSON.parse(filledRaw);

  // Check dependency file existence for --design and --specs
  if (artifactId === 'design' || artifactId === 'specs') {
    const deps: Array<Record<string, unknown>> = result.dependencies as Array<Record<string, unknown>> || [];
    if (deps.length > 0) {
      const proposalPath = path.join(process.cwd(), 'openpowers', 'changes', name, 'proposal.md');
      deps[0].done = fs.existsSync(proposalPath);
    }
    if (artifactId === 'specs' && deps.length > 1) {
      const designPath = path.join(process.cwd(), 'openpowers', 'changes', name, 'design.md');
      deps[1].done = fs.existsSync(designPath);
    }
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
