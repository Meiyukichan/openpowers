/**
 * @fileoverview Tests for init command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Use vi.hoisted() for mocks that need to be referenced before vi.mock hoisting
const { mockOra, mockSpinner } = vi.hoisted(() => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  };
  return {
    mockSpinner: spinner,
    mockOra: vi.fn(() => spinner),
  };
});

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('ora', () => ({
  default: mockOra,
}));

vi.mock('chalk', () => ({
  default: new Proxy({}, { get: () => (s: string) => s }),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
}));

import { execSync } from 'child_process';

// Resolve the function types
type RunInitFn = () => void;
type RegisterInitCmdFn = (program: Command) => void;

describe('src/commands/init.ts', () => {
  let runInit: RunInitFn;
  let registerInitCommand: RegisterInitCmdFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const mod = await import('./init.js');
    runInit = mod.runInit;
    registerInitCommand = mod.registerInitCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerInitCommand', () => {
    it('should export registerInitCommand as a named function', () => {
      expect(registerInitCommand).toBeDefined();
      expect(typeof registerInitCommand).toBe('function');
    });

    it('should register init command on the program', () => {
      const program = new Command();
      registerInitCommand(program);
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('init');
    });
  });

  describe('runInit', () => {
    describe('Step 1: claude --version check', () => {
      it('should proceed to next step when claude is installed', () => {
        vi.mocked(execSync).mockReturnValueOnce(Buffer.from('Claude v1.0'));

        // Will fail on later steps that aren't mocked, but step 1 should proceed
        try {
          runInit();
        } catch {
          // Expected because later steps aren't mocked
        }

        expect(execSync).toHaveBeenCalledWith(
          'claude --version',
          expect.objectContaining({ stdio: 'pipe', cwd: expect.any(String) })
        );
        expect(mockSpinner.succeed).toHaveBeenCalled();
      });

      it('should exit with code 1 when claude is not installed', () => {
        vi.mocked(execSync).mockImplementationOnce(() => {
          throw new Error('command not found: claude');
        });

        expect(() => runInit()).toThrow('process.exit called');

        expect(mockSpinner.fail).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it('should show spinner with descriptive text for claude check', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runInit();

        // First call to ora should have the claude check text
        expect(mockOra).toHaveBeenCalledWith(expect.stringContaining('claude'));
      });
    });

    describe('Step 2: uninstall old plugin (error-tolerant)', () => {
      it('should continue when uninstall plugin fails', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude --version
          .mockImplementationOnce(() => { throw new Error('not installed'); }) // uninstall fails
          .mockReturnValueOnce(Buffer.from('')) // remove marketplace
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        expect(() => runInit()).not.toThrow();

        // Should have called succeed (silently ignores the error)
        expect(mockSpinner.succeed).toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalled();
        expect(mockSpinner.fail).not.toHaveBeenCalled();
      });
    });

    describe('Step 3: remove old marketplace (error-tolerant)', () => {
      it('should continue when remove marketplace fails', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockImplementationOnce(() => { throw new Error('not found'); }) // remove fails
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        expect(() => runInit()).not.toThrow();

        expect(mockSpinner.fail).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalled();
      });
    });

    describe('Step 4: add marketplace-dev as marketplace', () => {
      it('should add marketplace with path containing marketplace-dev', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')); // add marketplace

        try {
          runInit();
        } catch {
          // may throw for step 5
        }

        const addCall = vi.mocked(execSync).mock.calls.find(
          (call) => typeof call[0] === 'string' && (call[0] as string).includes('marketplace add')
        );
        expect(addCall).toBeDefined();
        expect(addCall![0]).toMatch(/marketplace add/);
        expect(addCall![0]).toMatch(/marketplace-dev/);
      });

      it('should exit with code 1 when marketplace add fails', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockImplementationOnce(() => { throw new Error('add failed'); }); // add fails

        expect(() => runInit()).toThrow('process.exit called');
        expect(mockSpinner.fail).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('Step 5: install openpowers plugin', () => {
      it('should show completion all succeed when plugin installs successfully', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        runInit();

        expect(mockSpinner.succeed).toHaveBeenCalledTimes(5);
      });

      it('should exit with code 1 when plugin install fails', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockImplementationOnce(() => { throw new Error('install failed'); }); // install fails

        expect(() => runInit()).toThrow('process.exit called');
        expect(mockSpinner.fail).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('Spinner progress', () => {
      it('should create a spinner for each of the 5 steps', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runInit();

        // ora should have been called 5 times (once per step)
        expect(mockOra).toHaveBeenCalledTimes(5);
      });

      it('should show success indicator for each step on full success', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runInit();

        expect(mockSpinner.succeed).toHaveBeenCalledTimes(5);
        expect(mockSpinner.fail).not.toHaveBeenCalled();
      });

      it('should show failure indicator for failed non-tolerant steps', () => {
        vi.mocked(execSync).mockImplementationOnce(() => {
          throw new Error('command not found');
        });

        try {
          runInit();
        } catch {
          // expected
        }

        expect(mockSpinner.fail).toHaveBeenCalled();
      });
    });

    describe('execSync cwd option', () => {
      it('should pass cwd parameter to every execSync call', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runInit();

        const calls = vi.mocked(execSync).mock.calls;
        // All 5 steps call execSync once each
        expect(calls.length).toBe(5);
        for (const call of calls) {
          expect(call[1]).toHaveProperty('cwd');
        }
      });
    });

    describe('Logger usage', () => {
      it('should not use console.log', () => {
        const consoleLogSpy = vi.spyOn(console, 'log');

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runInit();

        expect(consoleLogSpy).not.toHaveBeenCalled();
        consoleLogSpy.mockRestore();
      });
    });

    describe('Post-init workflow reminder', () => {
      const reminderMessage = 'Next steps: Open Claude Code and run /openpowers:workflow to start';

      it('should print workflow reminder via process.stdout.write on successful init', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write');

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        runInit();

        expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining(reminderMessage));
      });

      it('should NOT print workflow reminder when step 1 (claude check) fails', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write');

        vi.mocked(execSync).mockImplementationOnce(() => {
          throw new Error('command not found: claude');
        });

        try {
          runInit();
        } catch {
          // expected process.exit throw
        }

        // writeSpy might have been called with spinner output, but NOT with the reminder
        const reminderCalls = vi.mocked(writeSpy).mock.calls.filter(
          (call) => typeof call[0] === 'string' && (call[0] as string).includes(reminderMessage)
        );
        expect(reminderCalls).toHaveLength(0);
      });

      it('should NOT print workflow reminder when step 5 (plugin install) fails', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write');

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockImplementationOnce(() => { throw new Error('install failed'); }); // install fails

        try {
          runInit();
        } catch {
          // expected process.exit throw
        }

        const reminderCalls = vi.mocked(writeSpy).mock.calls.filter(
          (call) => typeof call[0] === 'string' && (call[0] as string).includes(reminderMessage)
        );
        expect(reminderCalls).toHaveLength(0);
      });
    });
  });
});
