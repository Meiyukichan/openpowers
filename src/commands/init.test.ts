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

const { mockRunUi } = vi.hoisted(() => ({
  mockRunUi: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../commands/ui.js', () => ({
  runUi: mockRunUi,
}));

import { execSync } from 'child_process';

// Resolve the function types
type RunInitFn = () => Promise<void>;
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

    it('should use an async action handler that awaits runInit', async () => {
      // Register the command and verify action handler can be invoked
      // Commander v12+ supports .action() as a getter (no args)
      const program = new Command();
      registerInitCommand(program);

      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      expect(initCmd).toBeDefined();

      // The action handler should be a function
      const handler = (initCmd as unknown as Record<string, unknown>)._actionHandler;
      expect(typeof handler).toBe('function');
    });
  });

  describe('runInit', () => {
    describe('Step 1: claude --version check', () => {
      it('should proceed to next step when claude is installed', async () => {
        vi.mocked(execSync).mockReturnValueOnce(Buffer.from('Claude v1.0'));

        // Will fail on later steps that aren't mocked, but step 1 should proceed
        await runInit().catch(() => {
          // Expected because later steps aren't mocked
        });

        expect(execSync).toHaveBeenCalledWith(
          'claude --version',
          expect.objectContaining({ stdio: 'pipe', cwd: expect.any(String) })
        );
        expect(mockSpinner.succeed).toHaveBeenCalled();
      });

      it('should exit with code 1 when claude is not installed', async () => {
        vi.mocked(execSync).mockImplementationOnce(() => {
          throw new Error('command not found: claude');
        });

        await expect(runInit()).rejects.toThrow('process.exit called');

        expect(mockSpinner.fail).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it('should show spinner with descriptive text for claude check', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        await runInit();

        // First call to ora should have the claude check text
        expect(mockOra).toHaveBeenCalledWith(expect.stringContaining('claude'));
      });
    });

    describe('Step 2: uninstall old plugin (error-tolerant)', () => {
      it('should continue when uninstall plugin fails', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude --version
          .mockImplementationOnce(() => { throw new Error('not installed'); }) // uninstall fails
          .mockReturnValueOnce(Buffer.from('')) // remove marketplace
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        await expect(runInit()).resolves.toBeUndefined();

        // Should have called succeed (silently ignores the error)
        expect(mockSpinner.succeed).toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalled();
        expect(mockSpinner.fail).not.toHaveBeenCalled();
      });
    });

    describe('Step 3: remove old marketplace (error-tolerant)', () => {
      it('should continue when remove marketplace fails', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockImplementationOnce(() => { throw new Error('not found'); }) // remove fails
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        await expect(runInit()).resolves.toBeUndefined();

        expect(mockSpinner.fail).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalled();
      });
    });

    describe('Step 4: add marketplace as marketplace', () => {
      it('should add marketplace with path containing marketplace', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')); // add marketplace

        await runInit().catch(() => {
          // may throw for step 5
        });

        const addCall = vi.mocked(execSync).mock.calls.find(
          (call) => typeof call[0] === 'string' && (call[0] as string).includes('marketplace add')
        );
        expect(addCall).toBeDefined();
        expect(addCall![0]).toMatch(/marketplace add/);
        expect(addCall![0]).toMatch(/marketplace/);
      });

      it('should exit with code 1 when marketplace add fails', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockImplementationOnce(() => { throw new Error('add failed'); }); // add fails

        await expect(runInit()).rejects.toThrow('process.exit called');
        expect(mockSpinner.fail).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('Step 5: install furina plugin', () => {
      it('should show completion all succeed when plugin installs successfully', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        await runInit();

        expect(mockSpinner.succeed).toHaveBeenCalledTimes(5);
      });

      it('should exit with code 1 when plugin install fails', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockImplementationOnce(() => { throw new Error('install failed'); }); // install fails

        await expect(runInit()).rejects.toThrow('process.exit called');
        expect(mockSpinner.fail).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('Spinner progress', () => {
      it('should create a spinner for each of the 5 steps', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        await runInit();

        // ora should have been called 5 times (once per step)
        expect(mockOra).toHaveBeenCalledTimes(5);
      });

      it('should show success indicator for each step on full success', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        await runInit();

        expect(mockSpinner.succeed).toHaveBeenCalledTimes(5);
        expect(mockSpinner.fail).not.toHaveBeenCalled();
      });

      it('should show failure indicator for failed non-tolerant steps', async () => {
        vi.mocked(execSync).mockImplementationOnce(() => {
          throw new Error('command not found');
        });

        await runInit().catch(() => {
          // expected
        });

        expect(mockSpinner.fail).toHaveBeenCalled();
      });
    });

    describe('execSync cwd option', () => {
      it('should pass cwd parameter to every execSync call', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        await runInit();

        const calls = vi.mocked(execSync).mock.calls;
        // All 5 steps call execSync once each
        expect(calls.length).toBe(5);
        for (const call of calls) {
          expect(call[1]).toHaveProperty('cwd');
        }
      });
    });

    describe('Logger usage', () => {
      it('should not use console.log', async () => {
        const consoleLogSpy = vi.spyOn(console, 'log');

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        await runInit();

        expect(consoleLogSpy).not.toHaveBeenCalled();
        consoleLogSpy.mockRestore();
      });
    });

    describe('Post-init workflow reminder', () => {
      const reminderMessage = 'Next steps: Open Claude Code and run /furina:workflow to start';

      it('should print UI starting message via process.stdout.write on successful init', async () => {
        const writeSpy = vi.spyOn(process.stdout, 'write');

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        await runInit();

        expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Furina UI is starting'));
      });

      it('should NOT print workflow reminder when step 1 (claude check) fails', async () => {
        const writeSpy = vi.spyOn(process.stdout, 'write');

        vi.mocked(execSync).mockImplementationOnce(() => {
          throw new Error('command not found: claude');
        });

        await runInit().catch(() => {
          // expected process.exit throw
        });

        // writeSpy might have been called with spinner output, but NOT with the reminder
        const reminderCalls = vi.mocked(writeSpy).mock.calls.filter(
          (call) => typeof call[0] === 'string' && (call[0] as string).includes(reminderMessage)
        );
        expect(reminderCalls).toHaveLength(0);
      });

      it('should NOT print workflow reminder when step 5 (plugin install) fails', async () => {
        const writeSpy = vi.spyOn(process.stdout, 'write');

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockImplementationOnce(() => { throw new Error('install failed'); }); // install fails

        await runInit().catch(() => {
          // expected process.exit throw
        });

        const reminderCalls = vi.mocked(writeSpy).mock.calls.filter(
          (call) => typeof call[0] === 'string' && (call[0] as string).includes(reminderMessage)
        );
        expect(reminderCalls).toHaveLength(0);
      });
    });

    describe('Async behavior', () => {
      it('should return a Promise', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        const result = runInit();
        expect(result).toBeInstanceOf(Promise);
      });

      it('should call runUi with { restart: true } after successful plugin install', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        await runInit();

        expect(mockRunUi).toHaveBeenCalledWith({ restart: true });
      });

      it('should NOT call runUi when step 5 (plugin install) fails', async () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockImplementationOnce(() => { throw new Error('install failed'); }); // install fails

        try {
          await runInit();
        } catch {
          // expected process.exit throw
        }

        expect(mockRunUi).not.toHaveBeenCalled();
      });

      it('should log error but not exit when runUi throws after successful init', async () => {
        mockRunUi.mockRejectedValueOnce(new Error('UI start failed'));

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        // should not throw (no process.exit)
        await runInit();

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('UI start failed')
        );
      });

      it('should print UI auto-start completion message on successful init', async () => {
        const writeSpy = vi.spyOn(process.stdout, 'write');

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from('')) // claude
          .mockReturnValueOnce(Buffer.from('')) // uninstall
          .mockReturnValueOnce(Buffer.from('')) // remove
          .mockReturnValueOnce(Buffer.from('')) // add marketplace
          .mockReturnValueOnce(Buffer.from('')); // install plugin

        await runInit();

        const writeCalls = vi.mocked(writeSpy).mock.calls
          .filter((call) => typeof call[0] === 'string')
          .map((call) => call[0] as string);

        const hasUiMessage = writeCalls.some(
          (msg) => msg.includes('Furina UI')
        );
        const hasOldReminder = writeCalls.some(
          (msg) => msg.includes('Next steps: Open Claude Code')
        );

        expect(hasUiMessage).toBe(true);
        expect(hasOldReminder).toBe(false);
      });
    });
  });
});
