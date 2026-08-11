/**
 * @fileoverview Tests for remove command module
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Use vi.hoisted() for mocks that need to be referenced before vi.mock hoisting
const { setReadlineAnswer, mockRlInterface } = vi.hoisted(() => {
  let pendingAnswer = 'n';
  const rl = {
    question: vi.fn((_query: string, callback: (answer: string) => void) => {
      callback(pendingAnswer);
    }),
    close: vi.fn(),
  };
  return {
    setReadlineAnswer: (ans: string) => { pendingAnswer = ans; },
    mockRlInterface: rl,
  };
});

const { mockOra, mockSpinner } = vi.hoisted(() => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    stopAndPersist: vi.fn().mockReturnThis(),
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

vi.mock('readline', () => ({
  default: { createInterface: vi.fn(() => mockRlInterface) },
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

import type { RemoveOptions } from './remove.js';

// Resolve the function types
type RunRemoveFn = (options?: RemoveOptions) => void;
type RegisterRemoveCmdFn = (program: Command) => void;

describe('src/commands/remove.ts', () => {
  let runRemove: RunRemoveFn;
  let registerRemoveCommand: RegisterRemoveCmdFn;
  // Default to TTY mode; individual tests can override
  let isTTYValue = true;

  beforeEach(async () => {
    vi.clearAllMocks();
    isTTYValue = true;
    // Define isTTY on process.stdin if it doesn't exist (vitest may not have it)
    Object.defineProperty(process.stdin, 'isTTY', {
      get: () => isTTYValue,
      configurable: true,
    });
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const mod = await import('./remove.js');
    runRemove = mod.runRemove;
    registerRemoveCommand = mod.registerRemoveCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerRemoveCommand', () => {
    it('should export registerRemoveCommand as a named function', () => {
      expect(registerRemoveCommand).toBeDefined();
      expect(typeof registerRemoveCommand).toBe('function');
    });

    it('should register remove command on the program with --yes option', () => {
      const program = new Command();
      registerRemoveCommand(program);
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('remove');
      const removeCmd = program.commands.find((cmd) => cmd.name() === 'remove');
      expect(removeCmd?.options.map((o) => o.short)).toContain('-y');
    });
  });

  describe('runRemove', () => {
    describe('User confirmation prompt (TTY mode)', () => {
      it('should prompt user and proceed with removal when answering y', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        expect(mockRlInterface.question).toHaveBeenCalledWith(
          expect.stringContaining('y/N'),
          expect.any(Function)
        );
        expect(mockRlInterface.close).toHaveBeenCalled();
        expect(execSync).toHaveBeenCalledTimes(2);
      });

      it('should exit without making changes when answering n', () => {
        setReadlineAnswer('n');

        expect(() => runRemove()).toThrow('process.exit called');
        expect(execSync).not.toHaveBeenCalled();
        expect(process.exit).toHaveBeenCalledWith(0);
      });

      it('should exit without changes when answering anything other than y', () => {
        setReadlineAnswer('no');

        expect(() => runRemove()).toThrow('process.exit called');
        expect(execSync).not.toHaveBeenCalled();
        expect(process.exit).toHaveBeenCalledWith(0);
      });

      it('should proceed with removal when answering Y (uppercase yes)', () => {
        setReadlineAnswer('Y');

        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        expect(execSync).toHaveBeenCalledTimes(2);
      });
    });

    describe('Non-TTY mode', () => {
      it('should skip confirmation prompt and proceed automatically', () => {
        isTTYValue = false;
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        expect(mockRlInterface.question).not.toHaveBeenCalled();
        expect(mockRlInterface.close).not.toHaveBeenCalled();
        expect(execSync).toHaveBeenCalledTimes(2);
      });
    });

    describe('--yes flag', () => {
      it('should skip confirmation and proceed when --yes flag is passed', () => {
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove({ yes: true });

        expect(mockRlInterface.question).not.toHaveBeenCalled();
        expect(execSync).toHaveBeenCalledTimes(2);
      });

      it('should still work with explicit yes: false', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove({ yes: false });

        expect(mockRlInterface.question).toHaveBeenCalled();
        expect(execSync).toHaveBeenCalledTimes(2);
      });
    });

    describe('Plugin uninstall with fault tolerance', () => {
      it('should call execSync to uninstall plugin and show green success message', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        expect(execSync).toHaveBeenNthCalledWith(
          1,
          'claude plugin uninstall furina@furina-plugins',
          expect.objectContaining({ stdio: 'pipe', cwd: process.cwd() })
        );
        // There should be a succeed call with a string (from chalk)
        const succeedCalls = mockSpinner.succeed.mock.calls;
        expect(succeedCalls.length).toBeGreaterThanOrEqual(1);
      });

      it('should skip gracefully when plugin uninstall fails', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockImplementationOnce(() => { throw new Error('not installed'); })
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        // Should continue to marketplace removal (second execSync call)
        expect(execSync).toHaveBeenCalledTimes(2);
        // Should log a warning
        expect(mockLogger.warn).toHaveBeenCalled();
        // Should not fail (no process.exit with error)
        expect(mockSpinner.fail).not.toHaveBeenCalled();
      });
    });

    describe('Marketplace removal with fault tolerance', () => {
      it('should call execSync to remove marketplace and show green success message', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        expect(execSync).toHaveBeenNthCalledWith(
          2,
          'claude plugin marketplace remove furina-plugins',
          expect.objectContaining({ stdio: 'pipe', cwd: process.cwd() })
        );
      });

      it('should skip gracefully when marketplace removal fails', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockImplementationOnce(() => { throw new Error('not found'); });

        runRemove();

        expect(execSync).toHaveBeenCalledTimes(2);
        expect(mockLogger.warn).toHaveBeenCalled();
        expect(mockSpinner.fail).not.toHaveBeenCalled();
      });
    });

    describe('Summary output after completion', () => {
      it('should display summary message after both successful steps', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        // Should have called succeed on the summary spinner
        // Ora is called 3 times: plugin step, marketplace step, summary
        expect(mockOra).toHaveBeenCalledTimes(3);
        // The last succeed call should be on the summary spinner
        expect(mockSpinner.succeed).toHaveBeenCalledTimes(3);
      });

      it('should display summary indicating skipped components when nothing found', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockImplementationOnce(() => { throw new Error('not installed'); })
          .mockImplementationOnce(() => { throw new Error('not found'); });

        runRemove();

        // Both skipped, summary still shown
        expect(mockOra).toHaveBeenCalledTimes(3);
        expect(mockSpinner.succeed).toHaveBeenCalledTimes(3);
        expect(mockSpinner.fail).not.toHaveBeenCalled();
        // Verify summary message content
        const lastSucceedCall = mockSpinner.succeed.mock.calls[2];
        expect(lastSucceedCall[0]).toContain('Nothing to remove');
      });

      it('should display summary when plugin removed but marketplace skipped', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockImplementationOnce(() => { throw new Error('not found'); });

        runRemove();

        expect(mockOra).toHaveBeenCalledTimes(3);
        expect(mockSpinner.succeed).toHaveBeenCalledTimes(3);
        expect(mockSpinner.fail).not.toHaveBeenCalled();
        // Verify summary content for mixed scenario
        const lastSucceedCall = mockSpinner.succeed.mock.calls[2];
        expect(lastSucceedCall[0]).toContain('plugin has been removed');
        expect(lastSucceedCall[0]).toContain('marketplace was not found');
      });

      it('should display summary when plugin skipped but marketplace removed', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockImplementationOnce(() => { throw new Error('not installed'); })
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        expect(mockOra).toHaveBeenCalledTimes(3);
        expect(mockSpinner.succeed).toHaveBeenCalledTimes(3);
        expect(mockSpinner.fail).not.toHaveBeenCalled();
        // Verify summary content for mixed scenario
        const lastSucceedCall = mockSpinner.succeed.mock.calls[2];
        expect(lastSucceedCall[0]).toContain('plugin was not installed');
        expect(lastSucceedCall[0]).toContain('marketplace has been removed');
      });
    });

    describe('execSync cwd option', () => {
      it('should pass cwd parameter equal to process.cwd() for every execSync call', () => {
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        const calls = vi.mocked(execSync).mock.calls;
        expect(calls.length).toBe(2);
        for (const call of calls) {
          const options = call[1]!;
          expect(options).toHaveProperty('cwd');
          expect(options.cwd).toBe(process.cwd());
          expect(options).toHaveProperty('stdio', 'pipe');
        }
      });
    });

    describe('No console.log usage', () => {
      it('should not use console.log', () => {
        const consoleLogSpy = vi.spyOn(console, 'log');
        setReadlineAnswer('y');
        vi.mocked(execSync)
          .mockReturnValueOnce(Buffer.from(''))
          .mockReturnValueOnce(Buffer.from(''));

        runRemove();

        expect(consoleLogSpy).not.toHaveBeenCalled();
        consoleLogSpy.mockRestore();
      });
    });
  });
});
