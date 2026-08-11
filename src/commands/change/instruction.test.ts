/**
 * @fileoverview Tests for change/instruction.ts runChangeInstruction
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import path from 'path';
import url from 'url';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type DirEntry = { name: string; isDirectory: () => boolean; isFile: () => boolean };

// Resources directory resolved relative to this test file (depth 3 from project root)
const RESOURCES_DIR = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../../resources');

// Hoisted mocks
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { mockFs } = vi.hoisted(() => {
  const fileSystem: Record<string, string> = {};
  const dirSet = new Set<string>();

  function setFile(pathStr: string, content: string) {
    fileSystem[pathStr.replace(/\\/g, '/')] = content;
    const parts = pathStr.replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join('/'));
    }
  }

  function setDir(dirPath: string) {
    dirSet.add(dirPath.replace(/\\/g, '/'));
  }

  function reset() {
    Object.keys(fileSystem).forEach((k) => delete fileSystem[k]);
    dirSet.clear();
  }

  return {
    mockFs: {
      fileSystem,
      dirSet,
      setFile,
      setDir,
      reset,
      existsSync: vi.fn((p: string) => {
        const normalized = p.replace(/\\/g, '/');
        return normalized in fileSystem || dirSet.has(normalized);
      }),
      readFileSync: vi.fn((p: string, _encoding?: string) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized in fileSystem) return fileSystem[normalized];
        throw new Error(`ENOENT: ${p}`);
      }),
      writeFileSync: vi.fn((p: string, content: string) => {
        fileSystem[p.replace(/\\/g, '/')] = content;
      }),
      mkdirSync: vi.fn((p: string) => {
        setDir(p);
      }),
      readdirSync: vi.fn((_p: string, _options?: unknown) => {
        return [] as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
      }),
    },
  };
});

vi.mock('fs', () => ({
  default: mockFs,
}));

vi.mock('../../utils/logger.js', () => ({
  logger: mockLogger,
}));

describe('src/commands/change/instruction.ts', () => {
  let runChangeInstruction: (name: string, options: { proposal?: boolean; design?: boolean; specs?: boolean }) => void;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFs.reset();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const mod = await import('./instruction.js');
    runChangeInstruction = mod.runChangeInstruction;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: set up the change directory so existence check passes
  function setupChangeDir(name: string): void {
    mockFs.setDir(path.join(process.cwd(), 'furina', 'changes', name));
  }

  it('should exit with error when change directory does not exist', () => {
    expect(() => runChangeInstruction('my-feature', { proposal: true })).toThrow('process.exit called');
  });

  it('should return proposal instruction with filled changeName and outputPath', () => {
    setupChangeDir('my-feature');
    const templatePath = path.join(RESOURCES_DIR, 'proposal-template.json');
    mockFs.setFile(templatePath, JSON.stringify({
      changeName: '[change-name]',
      artifactId: 'proposal',
      outputPath: 'furina/changes/[change-name]/proposal.md',
      description: 'Initial proposal document outlining the change',
      instruction: 'Create the proposal',
      template: '## Why',
      dependencies: [],
    }));

    runChangeInstruction('my-feature', { proposal: true });

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls[stdoutCalls.length - 1];
    const parsed = JSON.parse(output);
    expect(parsed.changeName).toBe('my-feature');
    expect(parsed.outputPath).toBe('furina/changes/my-feature/proposal.md');
  });

  it('should return proposal instruction with empty dependencies array', () => {
    setupChangeDir('my-feature');
    const templatePath = path.join(RESOURCES_DIR, 'proposal-template.json');
    mockFs.setFile(templatePath, JSON.stringify({
      changeName: '[change-name]',
      artifactId: 'proposal',
      outputPath: 'furina/changes/[change-name]/proposal.md',
      description: 'Initial proposal document outlining the change',
      instruction: 'Create the proposal',
      template: '## Why',
      dependencies: [],
    }));

    runChangeInstruction('my-feature', { proposal: true });

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls[stdoutCalls.length - 1];
    const parsed = JSON.parse(output);
    expect(parsed.dependencies).toEqual([]);
  });

  it('should preserve static fields from template for --proposal', () => {
    setupChangeDir('my-feature');
    const templatePath = path.join(RESOURCES_DIR, 'proposal-template.json');
    mockFs.setFile(templatePath, JSON.stringify({
      changeName: '[change-name]',
      artifactId: 'proposal',
      outputPath: 'furina/changes/[change-name]/proposal.md',
      description: 'Initial proposal document outlining the change',
      instruction: 'Create the proposal',
      template: '## Why',
      dependencies: [],
    }));

    runChangeInstruction('my-feature', { proposal: true });

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls[stdoutCalls.length - 1];
    const parsed = JSON.parse(output);
    expect(parsed.artifactId).toBe('proposal');
    expect(parsed.description).toBe('Initial proposal document outlining the change');
    expect(parsed.instruction).toBe('Create the proposal');
    expect(parsed.template).toBe('## Why');
  });

  it('should return design instruction with proposal dependency done when proposal.md exists', () => {
    const templatePath = path.join(RESOURCES_DIR, 'design-template.json');
    mockFs.setFile(templatePath, JSON.stringify({
      changeName: '[change-name]',
      artifactId: 'design',
      outputPath: 'furina/changes/[change-name]/design.md',
      description: 'Technical design document with implementation details',
      instruction: 'Create the design',
      template: '## Context',
      dependencies: [
        { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
      ],
    }));
    // Set up proposal.md to exist
    const proposalPath = path.join(process.cwd(), 'furina', 'changes', 'my-feature', 'proposal.md');
    mockFs.setFile(proposalPath, '');

    runChangeInstruction('my-feature', { design: true });

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls[stdoutCalls.length - 1];
    const parsed = JSON.parse(output);
    expect(parsed.artifactId).toBe('design');
    expect(parsed.outputPath).toBe('furina/changes/my-feature/design.md');
    expect(parsed.dependencies.length).toBe(1);
    expect(parsed.dependencies[0].id).toBe('proposal');
    expect(parsed.dependencies[0].done).toBe(true);
  });

  it('should return design instruction with proposal dependency not done when proposal.md is missing', () => {
    setupChangeDir('my-feature');
    const templatePath = path.join(RESOURCES_DIR, 'design-template.json');
    mockFs.setFile(templatePath, JSON.stringify({
      changeName: '[change-name]',
      artifactId: 'design',
      outputPath: 'furina/changes/[change-name]/design.md',
      description: 'Technical design document with implementation details',
      instruction: 'Create the design',
      template: '## Context',
      dependencies: [
        { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
      ],
    }));
    // Do NOT set up proposal.md

    runChangeInstruction('my-feature', { design: true });

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls[stdoutCalls.length - 1];
    const parsed = JSON.parse(output);
    expect(parsed.dependencies[0].done).toBe(false);
  });

  it('should return specs instruction with both deps done when files exist', () => {
    const templatePath = path.join(RESOURCES_DIR, 'specs-template.json');
    mockFs.setFile(templatePath, JSON.stringify({
      changeName: '[change-name]',
      artifactId: 'specs',
      outputPath: 'furina/changes/[change-name]/specs/**/*.md',
      description: 'Detailed specifications for the change',
      instruction: 'Create the specs',
      template: '## ADDED Requirements',
      dependencies: [
        { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
        { id: 'design', done: false, path: 'design.md', description: 'Technical design document with implementation details' },
      ],
    }));
    // Set up both files
    mockFs.setFile(path.join(process.cwd(), 'furina', 'changes', 'my-feature', 'proposal.md'), '');
    mockFs.setFile(path.join(process.cwd(), 'furina', 'changes', 'my-feature', 'design.md'), '');

    runChangeInstruction('my-feature', { specs: true });

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls[stdoutCalls.length - 1];
    const parsed = JSON.parse(output);
    expect(parsed.artifactId).toBe('specs');
    expect(parsed.outputPath).toBe('furina/changes/my-feature/specs/**/*.md');
    expect(parsed.dependencies.length).toBe(2);
    expect(parsed.dependencies[0].done).toBe(true);
    expect(parsed.dependencies[1].done).toBe(true);
  });

  it('should return specs instruction with design dep not done when design.md missing', () => {
    const templatePath = path.join(RESOURCES_DIR, 'specs-template.json');
    mockFs.setFile(templatePath, JSON.stringify({
      changeName: '[change-name]',
      artifactId: 'specs',
      outputPath: 'furina/changes/[change-name]/specs/**/*.md',
      description: 'Detailed specifications for the change',
      instruction: 'Create the specs',
      template: '## ADDED Requirements',
      dependencies: [
        { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
        { id: 'design', done: false, path: 'design.md', description: 'Technical design document with implementation details' },
      ],
    }));
    // Only set up proposal.md, not design.md
    mockFs.setFile(path.join(process.cwd(), 'furina', 'changes', 'my-feature', 'proposal.md'), '');

    runChangeInstruction('my-feature', { specs: true });

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls[stdoutCalls.length - 1];
    const parsed = JSON.parse(output);
    expect(parsed.dependencies[0].done).toBe(true);
    expect(parsed.dependencies[1].done).toBe(false);
  });

  it('should preserve dependency static fields for --specs', () => {
    const templatePath = path.join(RESOURCES_DIR, 'specs-template.json');
    mockFs.setFile(templatePath, JSON.stringify({
      changeName: '[change-name]',
      artifactId: 'specs',
      outputPath: 'furina/changes/[change-name]/specs/**/*.md',
      description: 'Detailed specifications for the change',
      instruction: 'Create the specs',
      template: '## ADDED Requirements',
      dependencies: [
        { id: 'proposal', done: true, path: 'proposal.md', description: 'Initial proposal document outlining the change' },
        { id: 'design', done: false, path: 'design.md', description: 'Technical design document with implementation details' },
      ],
    }));
    mockFs.setFile(path.join(process.cwd(), 'furina', 'changes', 'my-feature', 'proposal.md'), '');
    mockFs.setFile(path.join(process.cwd(), 'furina', 'changes', 'my-feature', 'design.md'), '');

    runChangeInstruction('my-feature', { specs: true });

    const stdoutCalls = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const output = stdoutCalls[stdoutCalls.length - 1];
    const parsed = JSON.parse(output);
    expect(parsed.dependencies[0].id).toBe('proposal');
    expect(parsed.dependencies[0].path).toBe('proposal.md');
    expect(parsed.dependencies[0].description).toBe('Initial proposal document outlining the change');
    expect(parsed.dependencies[1].id).toBe('design');
    expect(parsed.dependencies[1].path).toBe('design.md');
    expect(parsed.dependencies[1].description).toBe('Technical design document with implementation details');
  });

  it('should exit with error on invalid change name', () => {
    expect(() => runChangeInstruction('InvalidName', { proposal: true })).toThrow('process.exit called');
  });

  it('should exit with error when no flag is provided', () => {
    setupChangeDir('my-feature');
    expect(() => runChangeInstruction('my-feature', {})).toThrow('process.exit called');
  });

  it('should exit with error when multiple flags are provided', () => {
    setupChangeDir('my-feature');
    expect(() => runChangeInstruction('my-feature', { proposal: true, design: true })).toThrow('process.exit called');
  });
});
