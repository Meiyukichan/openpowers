/**
 * Tests for common utility functions.
 * @vitest-environment node
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect } from 'vitest';
import { normalizePath } from './common.js';

describe('normalizePath', () => {
  it('should unify backslashes to forward slashes', () => {
    expect(normalizePath('D:\\project-code\\llm\\furina')).toBe('D:/project-code/llm/furina');
  });

  it('should collapse doubled backslashes from JSON-encoded paths', () => {
    expect(normalizePath('D:\\\\project-code\\\\llm\\\\furina')).toBe('D:/project-code/llm/furina');
  });

  it('should collapse triple or more consecutive slashes', () => {
    expect(normalizePath('D:///project-code///llm////furina')).toBe('D:/project-code/llm/furina');
  });

  it('should strip trailing slash', () => {
    expect(normalizePath('/home/user/project/')).toBe('/home/user/project');
  });

  it('should handle already-normal Unix paths unchanged', () => {
    expect(normalizePath('/home/user/project')).toBe('/home/user/project');
  });

  it('should handle already-normal Windows paths (forward slash)', () => {
    expect(normalizePath('D:/project-code/llm/furina')).toBe('D:/project-code/llm/furina');
  });

  it('should handle mixed backslash and forward slash', () => {
    expect(normalizePath('D:\\project-code/llm\\furina')).toBe('D:/project-code/llm/furina');
  });

  it('should preserve drive letter colon', () => {
    expect(normalizePath('C:\\Users\\test')).toBe('C:/Users/test');
  });
});
