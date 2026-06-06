/**
 * Agents command module - registers agents parent command with list, show, switch, init subcommands
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { Command } from 'commander';
import fs from 'fs';
import { loadConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import {
  loadProviders,
  getDefaultProvider,
  getProviderByModels,
  getEnableOpenpowersProxy,
  setActiveProviderId,
} from '../server/providers-store.js';
import {
  readSessionSettings,
  writeSessionSettings,
  getSessionFilePath,
} from '../utils/session.js';

// Valid stage names that can be used with show and switch commands
const VALID_STAGES = ['workflow', 'explore', 'propose', 'plan', 'review', 'coding', 'finalize'];

/**
 * Checks whether a stage name is valid.
 * @param name - The stage name to validate
 * @returns true if the name is a valid stage
 */
function isValidStage(name: string): boolean {
  return VALID_STAGES.includes(name);
}

/**
 * Validates switchProviders values against existing providers.
 * Model names not found in any provider are replaced with 'default'.
 * @param rawSwitchProviders - The raw stage-to-model mapping
 * @returns The validated mapping with invalid models replaced by 'default'
 */
function validateSwitchProviders(rawSwitchProviders: Record<string, string>): Record<string, string> {
  const modelNames = Object.values(rawSwitchProviders).filter((v) => v !== 'default');

  if (modelNames.length === 0) {
    return { ...rawSwitchProviders };
  }

  const providerByModels = getProviderByModels(modelNames);
  const validated: Record<string, string> = {};

  for (const [stage, modelValue] of Object.entries(rawSwitchProviders)) {
    if (modelValue === 'default') {
      validated[stage] = 'default';
    } else if (providerByModels[modelValue] !== null && providerByModels[modelValue] !== undefined) {
      validated[stage] = modelValue;
    } else {
      validated[stage] = 'default';
      logger.warn(`Model '${modelValue}' for stage '${stage}' not found in providers, replaced with 'default'`);
    }
  }

  return validated;
}

/**
 * Reads session settings, reloads switchProviders from project config,
 * validates model names, and writes back the updated settings.
 * Checks proxy is enabled and cwd directory exists before proceeding.
 * @param sessionId - The session identifier
 * @returns The session settings with refreshed switchProviders, or null if not found
 */
function loadAndValidateSessionSettings(sessionId: string): ReturnType<typeof readSessionSettings> {
  const settings = readSessionSettings(sessionId);
  if (!settings) return null;

  // Check proxy is enabled
  if (!getEnableOpenpowersProxy()) {
    process.stderr.write('Proxy is not enabled, this feature is not supported\n');
    process.exit(1);
  }

  // Check cwd directory exists
  if (!fs.existsSync(settings.cwd)) {
    process.stderr.write(`Directory does not exist: ${settings.cwd}\n`);
    process.exit(1);
  }

  const config = loadConfig(settings.cwd);
  const rawSwitchProviders: Record<string, string> = (config as Record<string, unknown>).switchProviders as Record<string, string> || {};

  const validated = validateSwitchProviders(rawSwitchProviders);
  settings.switchProviders = validated;
  writeSessionSettings(sessionId, settings);

  return settings;
}

/**
 * Outputs the provider table with columns Name, default, sonnet, opus, haiku.
 * Column widths are dynamically calculated from the data.
 */
function runAgentsListProviders(): void {
  const providers = loadProviders();

  // Compute column widths
  const nameWidth = Math.max(4, ...providers.map((p) => p.name.length));
  const defaultWidth = Math.max(7, ...providers.map((p) => p.defaultModel.length));
  const sonnetWidth = Math.max(6, ...providers.map((p) => p.sonnetModel.length));
  const opusWidth = Math.max(4, ...providers.map((p) => p.opusModel.length));
  const haikuWidth = Math.max(5, ...providers.map((p) => p.haikuModel.length));

  // Print header
  const headerName = 'Name'.padEnd(nameWidth);
  const headerDefault = 'default'.padEnd(defaultWidth);
  const headerSonnet = 'sonnet'.padEnd(sonnetWidth);
  const headerOpus = 'opus'.padEnd(opusWidth);
  const headerHaiku = 'haiku'.padEnd(haikuWidth);
  process.stdout.write(`${headerName}  ${headerDefault}  ${headerSonnet}  ${headerOpus}  ${headerHaiku}\n`);

  // Print separator
  const sep = '-'.repeat(nameWidth + defaultWidth + sonnetWidth + opusWidth + haikuWidth + 8);
  process.stdout.write(`${sep}\n`);

  // Print data rows
  for (const provider of providers) {
    const name = provider.name.padEnd(nameWidth);
    const defaultModel = provider.defaultModel.padEnd(defaultWidth);
    const sonnetModel = provider.sonnetModel.padEnd(sonnetWidth);
    const opusModel = provider.opusModel.padEnd(opusWidth);
    const haikuModel = provider.haikuModel.padEnd(haikuWidth);
    process.stdout.write(`${name}  ${defaultModel}  ${sonnetModel}  ${opusModel}  ${haikuModel}\n`);
  }

  logger.info(`Listed ${providers.length} providers`);
}

/**
 * Resolves a model value: if the value is 'default', resolve to the active provider's
 * defaultModel. If no active provider, returns 'default'.
 * @param modelValue - The model name or 'default'
 * @returns The resolved model name
 */
function resolveModelValue(modelValue: string): string {
  if (modelValue === 'default') {
    const defaultProvider = getDefaultProvider();
    if (defaultProvider) {
      return defaultProvider.defaultModel;
    }
    return 'default';
  }
  return modelValue;
}

/**
 * Outputs the session stage-model table with columns stage, model.
 * Resolves 'default' values to the active provider's defaultModel.
 * @param sessionId - The session identifier
 */
function runAgentsListSession(sessionId: string): void {
  const settings = loadAndValidateSessionSettings(sessionId);
  if (!settings) {
    process.stderr.write(`Session configuration not found for session: ${sessionId}\n`);
    process.exit(1);
  }

  const entries = Object.entries(settings.switchProviders);

  // Compute column widths
  const stageWidth = Math.max(5, ...entries.map(([stage]) => stage.length));
  const modelWidth = Math.max(5, ...entries.map(([, model]) => {
    const resolved = resolveModelValue(model);
    return resolved.length;
  }));

  // Print header
  const headerStage = 'stage'.padEnd(stageWidth);
  const headerModel = 'model'.padEnd(modelWidth);
  process.stdout.write(`${headerStage}  ${headerModel}\n`);

  // Print separator
  const sep = '-'.repeat(stageWidth + modelWidth + 2);
  process.stdout.write(`${sep}\n`);

  // Print data rows
  for (const [stage, model] of entries) {
    const stageCol = stage.padEnd(stageWidth);
    const resolved = resolveModelValue(model);
    const modelCol = resolved.padEnd(modelWidth);
    process.stdout.write(`${stageCol}  ${modelCol}\n`);
  }

  logger.info(`Listed session stages for session: ${sessionId}`);
}

/**
 * Shows the model name for a specific stage.
 * @param name - The stage name or 'default'
 * @param sessionId - The session identifier
 */
function runAgentsShow(name: string, sessionId: string): void {
  // Handle 'default' special case — resolve to active provider's defaultModel
  if (name === 'default') {
    const defaultProvider = getDefaultProvider();
    if (defaultProvider) {
      process.stdout.write(`${defaultProvider.defaultModel}\n`);
    } else {
      process.stdout.write('default\n');
    }
    return;
  }

  // Validate stage name
  if (!isValidStage(name)) {
    process.stderr.write(`Stage name not supported: ${name}\n`);
    process.exit(1);
  }

  const settings = loadAndValidateSessionSettings(sessionId);
  if (!settings) {
    process.stderr.write(`Session configuration not found for session: ${sessionId}\n`);
    process.exit(1);
  }

  const modelValue = settings.switchProviders[name];
  if (modelValue === undefined) {
    process.stderr.write(`Stage name not supported: ${name}\n`);
    process.exit(1);
  }

  const resolved = resolveModelValue(modelValue);
  process.stdout.write(`${resolved}\n`);
}

/**
 * Switches the current provider for a session.
 * Validates the name, updates currentProvider in session settings.
 * @param name - The stage name to switch to
 * @param sessionId - The session identifier
 */
function runAgentsSwitch(name: string, sessionId: string): void {
  // Validate name is 'default' or a supported stage
  if (name !== 'default' && !isValidStage(name)) {
    process.stderr.write(`Stage name not supported: ${name}\n`);
    process.exit(1);
  }

  const settings = loadAndValidateSessionSettings(sessionId);
  if (!settings) {
    process.stderr.write('Switch failed, no configuration file\n');
    process.exit(1);
  }

  settings.currentProvider = name;
  writeSessionSettings(sessionId, settings);

  const filePath = getSessionFilePath(sessionId);
  process.stdout.write(`Switched current provider to ${name} for session ${sessionId}\n`);

  logger.info(`Switched current provider to ${name} for session ${sessionId} at ${filePath}`);
}

/**
 * Switches the global active provider without a session context.
 * Looks up the provider by name first, then falls back to model name matching.
 * @param name - The provider name, model name, or 'default'
 */
function runAgentsGlobalSwitch(name: string): void {
  if (name === 'default') {
    const defaultProvider = getDefaultProvider();
    if (defaultProvider) {
      setActiveProviderId(defaultProvider.id);
      process.stdout.write(`Switched global active provider to: ${defaultProvider.name}\n`);
    } else {
      process.stderr.write('No providers configured\n');
      process.exit(1);
    }
    return;
  }

  const providers = loadProviders();
  let found = providers.find((p) => p.name === name) ?? null;

  if (!found) {
    const byModels = getProviderByModels([name]);
    found = byModels[name] ?? null;
  }

  if (found) {
    setActiveProviderId(found.id);
    process.stdout.write(`Switched global active provider to: ${found.name}\n`);
  } else {
    process.stderr.write(`Provider not found: ${name}\n`);
    process.exit(1);
  }
}

/**
 * Initializes a session settings file with validation.
 * Validates sessionId, cwd directory, and model names.
 * @param sessionId - The session identifier
 * @param cwd - The working directory path
 */
function runAgentsInit(sessionId: string, cwd: string): void {
  // Validate sessionId is not empty
  if (!sessionId || sessionId.trim() === '') {
    process.stderr.write('Session ID is required and cannot be empty\n');
    process.exit(1);
  }

  // Validate cwd directory exists
  if (!fs.existsSync(cwd)) {
    process.stderr.write(`Directory does not exist: ${cwd}\n`);
    process.exit(1);
  }

  // Load switchProviders from config
  const config = loadConfig(cwd);
  const rawSwitchProviders: Record<string, string> = (config as Record<string, unknown>).switchProviders as Record<string, string> || {};

  // Validate model names against providers
  const validatedSwitchProviders = validateSwitchProviders(rawSwitchProviders);

  // Create session settings
  const settings = {
    sessionId,
    cwd,
    currentProvider: 'default',
    switchProviders: validatedSwitchProviders,
    change: '',
  };

  writeSessionSettings(sessionId, settings);

  const filePath = getSessionFilePath(sessionId);
  process.stdout.write(`Session initialized successfully: ${filePath}\n`);

  logger.info(`Session initialized: ${sessionId} at ${filePath}`);
}

/**
 * Registers the `agents` parent command and its subcommands on the given program.
 * Subcommands: list, show, switch, init.
 * @param program - The commander Command instance
 */
export function registerAgentsCommand(program: Command): void {
  const agentsCmd = program
    .command('agents')
    .description('Manage AI agents and session model configuration');

  agentsCmd
    .command('list')
    .description('List provider models or session stage-model mappings')
    .option('--session <id>', 'Session ID for stage-model table')
    .action((options: { session?: string }) => {
      if (options.session) {
        runAgentsListSession(options.session);
      } else {
        runAgentsListProviders();
      }
    });

  agentsCmd
    .command('show <name>')
    .description('Show model name for a specific stage')
    .requiredOption('--session <id>', 'Session ID')
    .action((name: string, options: { session: string }) => {
      runAgentsShow(name, options.session);
    });

  agentsCmd
    .command('switch <name>')
    .description('Switch current provider for a session')
    .option('--session <id>', 'Session ID')
    .option('--mark', 'Mark the switch')
    .action((name: string, options: { session?: string; mark?: boolean }) => {
      if (options.mark) {
        process.stdout.write('Marked\n');
        return;
      }
      if (options.session) {
        runAgentsSwitch(name, options.session);
        return;
      }
      runAgentsGlobalSwitch(name);
    });

  agentsCmd
    .command('init')
    .description('Initialize session settings file')
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--cwd <path>', 'Working directory path')
    .action((options: { session: string; cwd: string }) => {
      runAgentsInit(options.session, options.cwd);
    });
}
