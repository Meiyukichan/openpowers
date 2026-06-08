/**
 * @fileoverview Tests for getAllChanges() aggregate changes query function
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';
import fsPromises from 'fs/promises';

// ---- mocks ----

vi.mock('fs/promises');
vi.mock('os');

// ---- helpers ----

function createChangesJson(overrides: {
  cwd?: string;
  changes?: Array<Record<string, unknown>>;
} = {}): Record<string, unknown> {
  return {
    framework: 'openpowers',
    version: '1.0.0',
    cwd: overrides.cwd ?? 'D:\\test-project',
    changes: overrides.changes ?? [],
  };
}

function createChangeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: overrides.name ?? 'test-change',
    path: overrides.path ?? 'openpowers/changes/test-change',
    description: overrides.description ?? 'Test change',
    createdAt: overrides.createdAt ?? '2026-06-08T10:00:00Z',
    updateAt: overrides.updateAt ?? '2026-06-08T12:00:00Z',
    status: overrides.status ?? 'active',
    features: overrides.features ?? 0,
    todo: overrides.todo ?? 0,
    artifacts: overrides.artifacts ?? [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- helper to import fresh (bypass ESM cache) ----

async function importFresh() {
  return await import('./shared.js?t=' + Date.now());
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

describe('getAllChanges', () => {
  const memoryDir = 'D:\\home\\.openpowers\\memory';
  const memoryDirA = 'D:\\home\\.openpowers\\memory\\Memory_D__project_a';
  const memoryDirB = 'D:\\home\\.openpowers\\memory\\Memory_D__project_b';

  function setupMemoryDir(entries: Array<{ name: string; isDirectory: () => boolean }>) {
    vi.mocked(os.homedir).mockReturnValue('D:\\home');
    vi.mocked(fsPromises.readdir).mockImplementation(async (p: any) => {
      if (p === memoryDir) return entries as any;
      return [];
    });
    vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
      for (const entry of entries) {
        if (p === `${memoryDir}\\${entry.name}\\changes.json`) {
          return '{}';
        }
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
  }

  it('should return empty array when no Memory_ directories exist', async () => {
    vi.mocked(os.homedir).mockReturnValue('D:\\home');
    vi.mocked(fsPromises.readdir).mockResolvedValue([]);

    const { getAllChanges } = await importFresh();
    const result = await getAllChanges();
    expect(result).toEqual([]);
  });

  it('should aggregate changes from multiple Memory_ directories', async () => {
    const changeA = createChangeEntry({ name: 'change-a', updateAt: '2026-06-09T10:00:00Z' });
    const changeB = createChangeEntry({ name: 'change-b', updateAt: '2026-06-08T10:00:00Z' });
    const changeC = createChangeEntry({ name: 'change-c', updateAt: '2026-06-07T10:00:00Z' });

    const jsonA = createChangesJson({ cwd: 'D:\\project_a', changes: [changeA] });
    const jsonB = createChangesJson({ cwd: 'D:\\project_b', changes: [changeB, changeC] });

    vi.mocked(os.homedir).mockReturnValue('D:\\home');
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'Memory_D__project_a', isDirectory: () => true },
      { name: 'Memory_D__project_b', isDirectory: () => true },
    ] as any);
    vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
      if (p === `${memoryDirA}\\changes.json`) return JSON.stringify(jsonA, null, 2);
      if (p === `${memoryDirB}\\changes.json`) return JSON.stringify(jsonB, null, 2);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const { getAllChanges } = await importFresh();
    const result = await getAllChanges();
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('change-a');
    expect(result[1].name).toBe('change-b');
    expect(result[2].name).toBe('change-c');
  });

  it('should inject cwd field into each change entry', async () => {
    const changeA = createChangeEntry({ name: 'change-a', updateAt: '2026-06-09T10:00:00Z' });
    const jsonA = createChangesJson({ cwd: 'D:\\project_a', changes: [changeA] });

    vi.mocked(os.homedir).mockReturnValue('D:\\home');
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'Memory_D__project_a', isDirectory: () => true },
    ] as any);
    vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
      if (p === `${memoryDirA}\\changes.json`) return JSON.stringify(jsonA, null, 2);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const { getAllChanges } = await importFresh();
    const result = await getAllChanges();
    expect(result[0].cwd).toBe('D:\\project_a');
  });

  it('should skip Memory_ directories without changes.json', async () => {
    const changeA = createChangeEntry({ name: 'change-a', updateAt: '2026-06-09T10:00:00Z' });
    const jsonA = createChangesJson({ cwd: 'D:\\project_a', changes: [changeA] });

    vi.mocked(os.homedir).mockReturnValue('D:\\home');
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'Memory_D__project_a', isDirectory: () => true },
      { name: 'Memory_D__project_b', isDirectory: () => true },
    ] as any);
    vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
      if (p === `${memoryDirA}\\changes.json`) return JSON.stringify(jsonA, null, 2);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const { getAllChanges } = await importFresh();
    const result = await getAllChanges();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('change-a');
  });

  describe('filtering', () => {
    const activeChange = createChangeEntry({ name: 'active-change', status: 'active', updateAt: '2026-06-09T10:00:00Z' });
    const archivedChange = createChangeEntry({ name: 'archived-change', status: 'archived', updateAt: '2026-06-08T10:00:00Z' });
    const removedChange = createChangeEntry({ name: 'removed-change', status: 'removed', updateAt: '2026-06-07T10:00:00Z' });

    const jsonA = createChangesJson({
      cwd: 'D:\\project_a',
      changes: [activeChange, archivedChange, removedChange],
    });

    beforeEach(() => {
      vi.mocked(os.homedir).mockReturnValue('D:\\home');
      vi.mocked(fsPromises.readdir).mockResolvedValue([
        { name: 'Memory_D__project_a', isDirectory: () => true },
      ] as any);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(jsonA, null, 2));
    });

    it('should filter by status=active', async () => {
      const { getAllChanges } = await importFresh();
      const result = await getAllChanges({ status: 'active' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('active-change');
    });

    it('should filter by status=archived', async () => {
      const { getAllChanges } = await importFresh();
      const result = await getAllChanges({ status: 'archived' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('archived-change');
    });

    it('should filter by cwd parameter', async () => {
      vi.clearAllMocks();

      const changeA = createChangeEntry({ name: 'change-a', updateAt: '2026-06-09T10:00:00Z' });
      const changeB = createChangeEntry({ name: 'change-b', updateAt: '2026-06-08T10:00:00Z' });

      const jsonA = createChangesJson({ cwd: 'D:\\target-project', changes: [changeA] });
      const jsonB = createChangesJson({ cwd: 'D:\\other-project', changes: [changeB] });

      const targetDirName = 'Memory_D__target-project';
      const otherDirName = 'Memory_D__other-project';

      vi.mocked(os.homedir).mockReturnValue('D:\\home');
      vi.mocked(fsPromises.readdir).mockResolvedValue([
        { name: targetDirName, isDirectory: () => true },
        { name: otherDirName, isDirectory: () => true },
      ] as any);
      vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
        if (p === `${memoryDir}\\${targetDirName}\\changes.json`) return JSON.stringify(jsonA, null, 2);
        if (p === `${memoryDir}\\${otherDirName}\\changes.json`) return JSON.stringify(jsonB, null, 2);
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const { getAllChanges } = await importFresh();
      const result = await getAllChanges({ cwd: 'D:\\target-project' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('change-a');
    });

    it('should filter by cwd with no matching directory returns empty', async () => {
      vi.mocked(os.homedir).mockReturnValue('D:\\home');
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const { getAllChanges } = await importFresh();
      const result = await getAllChanges({ cwd: 'D:\\nonexistent' });
      expect(result).toEqual([]);
    });

    it('should filter by query matching name (case-insensitive)', async () => {
      const { getAllChanges } = await importFresh();
      const result = await getAllChanges({ query: 'ACTIVE' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('active-change');
    });

    it('should filter by query matching description (case-insensitive)', async () => {
      vi.clearAllMocks();

      const changeWithDesc = createChangeEntry({ name: 'ui-change', description: '实现UI前端页面', updateAt: '2026-06-09T10:00:00Z' });
      const otherChange = createChangeEntry({ name: 'other', description: '其他功能', updateAt: '2026-06-08T10:00:00Z' });

      const json = createChangesJson({ cwd: 'D:\\project_a', changes: [changeWithDesc, otherChange] });

      vi.mocked(os.homedir).mockReturnValue('D:\\home');
      vi.mocked(fsPromises.readdir).mockResolvedValue([
        { name: 'Memory_D__project_a', isDirectory: () => true },
      ] as any);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(json, null, 2));

      const { getAllChanges } = await importFresh();
      const result = await getAllChanges({ query: 'UI' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ui-change');
    });

    it('should filter by query matching cwd (case-insensitive)', async () => {
      const { getAllChanges } = await importFresh();
      const result = await getAllChanges({ query: 'PROJECT' });
      expect(result).toHaveLength(3);
    });

    it('should combine multiple filters with AND logic', async () => {
      vi.clearAllMocks();

      const activeUiChange = createChangeEntry({ name: 'ui-change', status: 'active', description: 'UI相关', updateAt: '2026-06-09T10:00:00Z' });
      const activeBackendChange = createChangeEntry({ name: 'backend-change', status: 'active', description: '后端功能', updateAt: '2026-06-08T10:00:00Z' });
      const archivedUiChange = createChangeEntry({ name: 'archived-ui', status: 'archived', description: 'UI归档', updateAt: '2026-06-07T10:00:00Z' });

      const jsonA = createChangesJson({ cwd: 'D:\\project_a', changes: [activeUiChange, activeBackendChange] });
      const jsonB = createChangesJson({ cwd: 'D:\\project_b', changes: [archivedUiChange] });

      const targetDirA = 'Memory_D__project_a';
      const targetDirB = 'Memory_D__project_b';

      vi.mocked(os.homedir).mockReturnValue('D:\\home');
      vi.mocked(fsPromises.readdir).mockResolvedValue([
        { name: targetDirA, isDirectory: () => true },
        { name: targetDirB, isDirectory: () => true },
      ] as any);
      vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
        if (p === `${memoryDir}\\${targetDirA}\\changes.json`) return JSON.stringify(jsonA, null, 2);
        if (p === `${memoryDir}\\${targetDirB}\\changes.json`) return JSON.stringify(jsonB, null, 2);
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const { getAllChanges } = await importFresh();
      const result = await getAllChanges({ status: 'active', query: 'ui' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ui-change');
    });
  });

  describe('sorting', () => {
    const newest = createChangeEntry({ name: 'newest', updateAt: '2026-06-09T10:00:00Z' });
    const middle = createChangeEntry({ name: 'middle', updateAt: '2026-06-08T10:00:00Z' });
    const oldest = createChangeEntry({ name: 'oldest', updateAt: '2026-06-07T10:00:00Z' });

    it('should sort by updateAt descending', async () => {
      const json = createChangesJson({
        cwd: 'D:\\project_a',
        changes: [middle, oldest, newest],
      });

      vi.mocked(os.homedir).mockReturnValue('D:\\home');
      vi.mocked(fsPromises.readdir).mockResolvedValue([
        { name: 'Memory_D__project_a', isDirectory: () => true },
      ] as any);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(json, null, 2));

      const { getAllChanges } = await importFresh();
      const result = await getAllChanges();
      expect(result[0].name).toBe('newest');
      expect(result[1].name).toBe('middle');
      expect(result[2].name).toBe('oldest');
    });

    it('should place entries without updateAt last', async () => {
      const withUpdate = createChangeEntry({ name: 'with-update', updateAt: '2026-06-08T10:00:00Z' });
      const withoutUpdate = createChangeEntry({ name: 'without-update' });
      delete withoutUpdate.updateAt;

      const json = createChangesJson({
        cwd: 'D:\\project_a',
        changes: [withoutUpdate, withUpdate],
      });

      vi.mocked(os.homedir).mockReturnValue('D:\\home');
      vi.mocked(fsPromises.readdir).mockResolvedValue([
        { name: 'Memory_D__project_a', isDirectory: () => true },
      ] as any);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(json, null, 2));

      const { getAllChanges } = await importFresh();
      const result = await getAllChanges();
      expect(result[0].name).toBe('with-update');
      expect(result[1].name).toBe('without-update');
    });

    it('should keep relative order between entries without updateAt', async () => {
      const a = createChangeEntry({ name: 'no-update-a' });
      const b = createChangeEntry({ name: 'no-update-b' });
      delete a.updateAt;
      delete b.updateAt;

      const json = createChangesJson({
        cwd: 'D:\\project_a',
        changes: [a, b],
      });

      vi.mocked(os.homedir).mockReturnValue('D:\\home');
      vi.mocked(fsPromises.readdir).mockResolvedValue([
        { name: 'Memory_D__project_a', isDirectory: () => true },
      ] as any);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(json, null, 2));

      const { getAllChanges } = await importFresh();
      const result = await getAllChanges();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('no-update-a');
      expect(result[1].name).toBe('no-update-b');
    });
  });
});
