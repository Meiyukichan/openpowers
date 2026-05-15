/**
 * @fileoverview Tests for CLI entry file
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import url from 'url';

const binDir = path.dirname(url.fileURLToPath(import.meta.url));
const binPath = path.resolve(binDir, 'openpowers.js');

describe('bin/openpowers.js', () => {
  it('should exist', () => {
    expect(fs.existsSync(binPath)).toBe(true);
  });

  it('should have #!/usr/bin/env node as the first line', () => {
    const content = fs.readFileSync(binPath, 'utf-8');
    const lines = content.split('\n');
    expect(lines[0]).toBe('#!/usr/bin/env node');
  });

  it('should have an ESModule import statement after the shebang and JSDoc header', () => {
    const content = fs.readFileSync(binPath, 'utf-8');
    expect(content).toMatch(/^#!\/usr\/bin\/env node\n[\s\S]*^import\s+/m);
  });
});
