/**
 * @fileoverview Tests for one-time data migration from old brand paths
 * (~/.openpowers/, {cwd}/openpowers/) to new brand paths (~/.furina/, {cwd}/furina/).
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- mocks ----

// Home directory is redirected to a temp dir so migration reads/writes
// isolated filesystem locations and never touches the real user home.
const { mockHomeDirRef } = vi.hoisted(() => ({ mockHomeDirRef: { value: '' } }));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    default: {
      ...actual,
      homedir: vi.fn(() => mockHomeDirRef.value),
    },
  };
});

// ---- helpers ----

function projectDir(): string {
  return path.join(mockHomeDirRef.value, 'project');
}

/**
 * Creates a complete old-brand source layout under the temp home directory:
 * user-level ~/.openpowers/ and project-level <project>/openpowers/.
 */
function createSourceLayout(home: string, proj: string): void {
  // User-level
  fs.mkdirSync(path.join(home, '.openpowers', 'memory', 'Memory_D__mock'), { recursive: true });
  fs.writeFileSync(path.join(home, '.openpowers', 'memory', 'Memory_D__mock', 'changes.json'), '{"changes":[]}', 'utf-8');
  fs.mkdirSync(path.join(home, '.openpowers', 'sessions', 's1'), { recursive: true });
  fs.writeFileSync(path.join(home, '.openpowers', 'sessions', 's1', 'settings.json'), '{"provider":"mimo"}', 'utf-8');
  fs.mkdirSync(path.join(home, '.openpowers', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(home, '.openpowers', 'logs', 'furina.log'), 'log-line', 'utf-8');
  fs.writeFileSync(path.join(home, '.openpowers', 'providers.json'), '{"apiKey":"secret"}', 'utf-8');
  fs.writeFileSync(path.join(home, '.openpowers', 'settings.bak.json'), '{"env":{}}', 'utf-8');
  fs.writeFileSync(path.join(home, '.openpowers', '.openpowers.pid'), '{"pid":123,"port":3939}', 'utf-8');

  // Project-level
  fs.mkdirSync(path.join(proj, 'openpowers', 'changes', 'rebrand-furina', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'openpowers', 'changes', 'rebrand-furina', 'design.md'), '# design', 'utf-8');
  fs.mkdirSync(path.join(proj, 'openpowers', 'archive', '2026-01-01-old'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'openpowers', 'archive', '2026-01-01-old', 'proposal.md'), '# proposal', 'utf-8');
  fs.writeFileSync(path.join(proj, 'openpowers', 'changes.json'), '{"framework":"@meiyukichan/openpowers","changes":[]}', 'utf-8');
}

// ---- tests ----

describe('src/utils/migrate.ts', () => {
  let migrate: typeof import('./migrate.js');

  beforeEach(async () => {
    mockHomeDirRef.value = fs.mkdtempSync(path.join(os.tmpdir(), 'furina-migrate-'));
    fs.mkdirSync(projectDir(), { recursive: true });
    migrate = await import('./migrate.js');
  });

  afterEach(() => {
    fs.rmSync(mockHomeDirRef.value, { recursive: true, force: true });
  });

  describe('detectOldData', () => {
    it('should return true when user-level ~/.openpowers exists', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      expect(migrate.detectOldData(projectDir())).toBe(true);
    });

    it('should return true when project-level openpowers exists even without user dir', () => {
      fs.mkdirSync(path.join(projectDir(), 'openpowers'), { recursive: true });
      expect(migrate.detectOldData(projectDir())).toBe(true);
    });

    it('should return false when no old data exists', () => {
      expect(migrate.detectOldData(projectDir())).toBe(false);
    });
  });

  describe('shouldAutoMigrate', () => {
    it('should return true when old user dir exists and new dir has no migrated data', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      expect(migrate.shouldAutoMigrate(projectDir())).toBe(true);
    });

    it('should return false when new dir already has providers.json (already migrated)', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      fs.mkdirSync(path.join(mockHomeDirRef.value, '.furina'), { recursive: true });
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.furina', 'providers.json'), '{"x":1}', 'utf-8');
      expect(migrate.shouldAutoMigrate(projectDir())).toBe(false);
    });

    it('should return true when new memory dir only holds auto-created files (e.g. dreamwork.log)', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      fs.mkdirSync(path.join(mockHomeDirRef.value, '.furina', 'memory'), { recursive: true });
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.furina', 'memory', 'dreamwork.log'), 'log', 'utf-8');
      expect(migrate.shouldAutoMigrate(projectDir())).toBe(true);
    });

    it('should return false when new memory dir already contains a Memory_* user-data directory', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      fs.mkdirSync(path.join(mockHomeDirRef.value, '.furina', 'memory', 'Memory_D__mock'), { recursive: true });
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.furina', 'memory', 'Memory_D__mock', 'changes.json'), '{}', 'utf-8');
      expect(migrate.shouldAutoMigrate(projectDir())).toBe(false);
    });

    it('should return false when old user dir does not exist', () => {
      expect(migrate.shouldAutoMigrate(projectDir())).toBe(false);
    });
  });

  describe('runMigration user-level data', () => {
    it('should copy memory/sessions/logs directories preserving structure and content', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());

      const summary = migrate.runMigration(projectDir());

      const newHome = path.join(mockHomeDirRef.value, '.furina');
      expect(fs.existsSync(path.join(newHome, 'memory', 'Memory_D__mock', 'changes.json'))).toBe(true);
      expect(fs.readFileSync(path.join(newHome, 'memory', 'Memory_D__mock', 'changes.json'), 'utf-8')).toBe('{"changes":[]}');
      expect(fs.existsSync(path.join(newHome, 'sessions', 's1', 'settings.json'))).toBe(true);
      expect(fs.readFileSync(path.join(newHome, 'sessions', 's1', 'settings.json'), 'utf-8')).toBe('{"provider":"mimo"}');
      expect(fs.existsSync(path.join(newHome, 'logs', 'furina.log'))).toBe(true);
      expect(fs.readFileSync(path.join(newHome, 'logs', 'furina.log'), 'utf-8')).toBe('log-line');
      const userStatuses = summary.user.map((item) => item.status);
      expect(userStatuses).toContain('copied');
    });

    it('should merge memory user data when new memory dir already exists with only auto-created files', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      // Simulate the memory scheduler having already created ~/.furina/memory
      // with an auto-created log before the migration runs.
      fs.mkdirSync(path.join(mockHomeDirRef.value, '.furina', 'memory'), { recursive: true });
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.furina', 'memory', 'dreamwork.log'), 'new-log', 'utf-8');

      const summary = migrate.runMigration(projectDir());

      const newMemory = path.join(mockHomeDirRef.value, '.furina', 'memory');
      // User-data directories must still be migrated into the existing dir
      expect(fs.existsSync(path.join(newMemory, 'Memory_D__mock', 'changes.json'))).toBe(true);
      expect(fs.readFileSync(path.join(newMemory, 'Memory_D__mock', 'changes.json'), 'utf-8')).toBe('{"changes":[]}');
      // The pre-existing auto-created log is preserved, not overwritten
      expect(fs.readFileSync(path.join(newMemory, 'dreamwork.log'), 'utf-8')).toBe('new-log');
      const memoryItem = summary.user.find((item) => item.source.includes('memory'));
      expect(memoryItem?.status).toBe('copied');
    });

    it('should copy providers.json, settings.bak.json and .pid (renamed to .furina.pid)', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());

      const summary = migrate.runMigration(projectDir());

      const newHome = path.join(mockHomeDirRef.value, '.furina');
      expect(fs.existsSync(path.join(newHome, 'providers.json'))).toBe(true);
      expect(fs.readFileSync(path.join(newHome, 'providers.json'), 'utf-8')).toBe('{"apiKey":"secret"}');
      expect(fs.existsSync(path.join(newHome, 'settings.bak.json'))).toBe(true);
      expect(fs.readFileSync(path.join(newHome, 'settings.bak.json'), 'utf-8')).toBe('{"env":{}}');
      expect(fs.existsSync(path.join(newHome, '.furina.pid'))).toBe(true);
      expect(fs.readFileSync(path.join(newHome, '.furina.pid'), 'utf-8')).toBe('{"pid":123,"port":3939}');
      expect(fs.existsSync(path.join(newHome, '.openpowers.pid'))).toBe(false);
      const pidItem = summary.user.find((item) => item.source.includes('.openpowers.pid'));
      expect(pidItem?.target).toContain('.furina.pid');
    });

    it('should preserve the old directory (copy, not move)', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());

      migrate.runMigration(projectDir());

      expect(fs.existsSync(path.join(mockHomeDirRef.value, '.openpowers', 'providers.json'))).toBe(true);
      expect(fs.existsSync(path.join(mockHomeDirRef.value, '.openpowers', 'memory', 'Memory_D__mock'))).toBe(true);
      expect(fs.existsSync(path.join(mockHomeDirRef.value, '.openpowers', '.openpowers.pid'))).toBe(true);
    });
  });

  describe('runMigration project-level data', () => {
    it('should copy changes/archive/changes.json to furina/ and preserve openpowers/', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());

      const summary = migrate.runMigration(projectDir());

      const newProj = path.join(projectDir(), 'furina');
      expect(fs.existsSync(path.join(newProj, 'changes', 'rebrand-furina', 'design.md'))).toBe(true);
      expect(fs.existsSync(path.join(newProj, 'changes', 'rebrand-furina', 'specs'))).toBe(true);
      expect(fs.existsSync(path.join(newProj, 'archive', '2026-01-01-old', 'proposal.md'))).toBe(true);
      expect(fs.existsSync(path.join(newProj, 'changes.json'))).toBe(true);
      expect(fs.readFileSync(path.join(newProj, 'changes.json'), 'utf-8')).toBe('{"framework":"@meiyukichan/openpowers","changes":[]}');
      // Source openpowers/ untouched
      expect(fs.existsSync(path.join(projectDir(), 'openpowers', 'changes', 'rebrand-furina', 'design.md'))).toBe(true);
      expect(summary.project.some((item) => item.status === 'copied')).toBe(true);
    });
  });

  describe('runMigration idempotency and verification', () => {
    it('should skip existing targets on second run and not overwrite them', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());

      migrate.runMigration(projectDir());

      // Change source content after first migration
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.openpowers', 'providers.json'), '{"apiKey":"changed"}', 'utf-8');
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.openpowers', 'memory', 'Memory_D__mock', 'changes.json'), '{"changes":["new"]}', 'utf-8');

      const summary = migrate.runMigration(projectDir());

      // Target contents unchanged (not overwritten)
      expect(fs.readFileSync(path.join(mockHomeDirRef.value, '.furina', 'providers.json'), 'utf-8')).toBe('{"apiKey":"secret"}');
      expect(fs.readFileSync(path.join(mockHomeDirRef.value, '.furina', 'memory', 'Memory_D__mock', 'changes.json'), 'utf-8')).toBe('{"changes":[]}');
      const copied = summary.user.filter((item) => item.status === 'copied');
      const skipped = summary.user.filter((item) => item.status === 'skipped');
      expect(copied).toHaveLength(0);
      expect(skipped.length).toBeGreaterThan(0);
    });

    it('should report verified key targets after a successful migration', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());

      const summary = migrate.runMigration(projectDir());

      const newHome = path.join(mockHomeDirRef.value, '.furina');
      expect(summary.verifiedTargets).toContain(path.join(newHome, 'providers.json'));
      expect(summary.verifiedTargets).toContain(path.join(newHome, 'memory'));
      expect(summary.verificationFailures).toHaveLength(0);
    });

    it('should mark missing sources as missing without erroring', () => {
      // No user-level dir at all; only project-level exists
      fs.mkdirSync(path.join(projectDir(), 'openpowers'), { recursive: true });

      const summary = migrate.runMigration(projectDir());

      expect(summary.user.every((item) => item.status === 'missing')).toBe(true);
      expect(summary.project.some((item) => item.status === 'copied' || item.status === 'missing')).toBe(true);
    });

    it('should set needsMigration based on old data presence', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      const withData = migrate.runMigration(projectDir());
      expect(withData.needsMigration).toBe(true);

      const noData = migrate.runMigration(projectDir());
      expect(noData.needsMigration).toBe(true);
    });
  });

  describe('runMigration failure handling', () => {
    it('should mark failed copy as failed and report verification failure without touching old data', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      // Make ~/.furina a file so creating subdirectories under it fails
      fs.mkdirSync(path.join(mockHomeDirRef.value, '.furina'));
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.furina', 'blocker'), 'x', 'utf-8');
      fs.rmSync(path.join(mockHomeDirRef.value, '.furina'), { recursive: true, force: true });
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.furina'), 'I am a file', 'utf-8');

      const summary = migrate.runMigration(projectDir());

      expect(summary.verificationFailures.length).toBeGreaterThan(0);
      // Old data still intact
      expect(fs.existsSync(path.join(mockHomeDirRef.value, '.openpowers', 'providers.json'))).toBe(true);
    });
  });

  describe('runAutoMigrationIfNeeded', () => {
    it('should run migration and return true when auto-migration is needed', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());

      const ran = migrate.runAutoMigrationIfNeeded(projectDir());

      expect(ran).toBe(true);
      expect(fs.existsSync(path.join(mockHomeDirRef.value, '.furina', 'providers.json'))).toBe(true);
    });

    it('should do nothing and return false when not needed', () => {
      createSourceLayout(mockHomeDirRef.value, projectDir());
      // Simulate already migrated
      fs.mkdirSync(path.join(mockHomeDirRef.value, '.furina'), { recursive: true });
      fs.writeFileSync(path.join(mockHomeDirRef.value, '.furina', 'providers.json'), '{"x":1}', 'utf-8');

      const ran = migrate.runAutoMigrationIfNeeded(projectDir());

      expect(ran).toBe(false);
      expect(fs.existsSync(path.join(mockHomeDirRef.value, '.furina', 'memory'))).toBe(false);
    });
  });
});
