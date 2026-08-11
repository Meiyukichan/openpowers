/**
 * @fileoverview Tests for the migrate command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { MigrationSummary } from '../utils/migrate.js';

const {
  mockRunMigration,
  mockRunAutoMigrationIfNeeded,
} = vi.hoisted(() => ({
  mockRunMigration: vi.fn(),
  mockRunAutoMigrationIfNeeded: vi.fn(),
}));

vi.mock('../utils/migrate.js', () => ({
  runMigration: mockRunMigration,
  runAutoMigrationIfNeeded: mockRunAutoMigrationIfNeeded,
}));

type RegisterMigrateCmdFn = (program: Command) => void;
type RegisterAutoMigrationHookFn = (program: Command) => void;

const mockSummary: MigrationSummary = {
  needsMigration: true,
  migratedAt: '2026-08-09T00:00:00.000Z',
  user: [
    { source: '/old/memory', target: '/new/memory', status: 'copied' },
    { source: '/old/providers.json', target: '/new/providers.json', status: 'skipped' },
  ],
  project: [
    { source: '/proj/openpowers/changes', target: '/proj/furina/changes', status: 'copied' },
  ],
  verifiedTargets: ['/new/memory', '/new/providers.json', '/proj/furina/changes'],
  verificationFailures: [],
};

describe('src/commands/migrate.ts', () => {
  let registerMigrateCommand: RegisterMigrateCmdFn;
  let registerAutoMigrationHook: RegisterAutoMigrationHookFn;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRunMigration.mockReset();
    mockRunMigration.mockReturnValue(mockSummary);
    mockRunAutoMigrationIfNeeded.mockReset();
    mockRunAutoMigrationIfNeeded.mockReturnValue(false);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const mod = await import('./migrate.js');
    registerMigrateCommand = mod.registerMigrateCommand;
    registerAutoMigrationHook = mod.registerAutoMigrationHook;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerMigrateCommand', () => {
    it('should export registerMigrateCommand as a named function', () => {
      expect(registerMigrateCommand).toBeDefined();
      expect(typeof registerMigrateCommand).toBe('function');
    });

    it('should register migrate command on the program', () => {
      const program = new Command();
      registerMigrateCommand(program);
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('migrate');
    });
  });

  describe('migrate command action', () => {
    it('should call runMigration and output a summary with source/target/status', () => {
      const program = new Command();
      registerMigrateCommand(program);
      program.parse(['node', 'test', 'migrate']);

      expect(mockRunMigration).toHaveBeenCalledTimes(1);
      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('Data migration completed');
      expect(output).toContain('/old/memory -> /new/memory: copied');
      expect(output).toContain('/proj/openpowers/changes -> /proj/furina/changes: copied');
      expect(output).toContain('/old/providers.json -> /new/providers.json: skipped');
    });

    it('should report verification results in the summary', () => {
      const program = new Command();
      registerMigrateCommand(program);
      program.parse(['node', 'test', 'migrate']);

      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('3');
      expect(output).toContain('verified');
      expect(output).toContain('0');
      expect(output).toContain('failure');
    });

    it('should output a no-data message when needsMigration is false', () => {
      mockRunMigration.mockReturnValue({
        ...mockSummary,
        needsMigration: false,
        user: [],
        project: [],
        verifiedTargets: [],
      });
      const program = new Command();
      registerMigrateCommand(program);
      program.parse(['node', 'test', 'migrate']);

      const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
      expect(output).toContain('No old-brand data');
    });

    it('should not call process.exit on success', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        // do nothing
      }) as never);
      const program = new Command();
      registerMigrateCommand(program);
      program.parse(['node', 'test', 'migrate']);
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });

  describe('registerAutoMigrationHook', () => {
    it('should run auto migration before a non-migrate command action', () => {
      const program = new Command();
      program.command('dummy').action(() => {
        // no-op test action
      });
      registerAutoMigrationHook(program);
      program.parse(['node', 'test', 'dummy']);
      expect(mockRunAutoMigrationIfNeeded).toHaveBeenCalledTimes(1);
    });

    it('should not run auto migration before the migrate command itself', () => {
      const program = new Command();
      registerMigrateCommand(program);
      registerAutoMigrationHook(program);
      program.parse(['node', 'test', 'migrate']);
      expect(mockRunAutoMigrationIfNeeded).not.toHaveBeenCalled();
    });
  });
});
