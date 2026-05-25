/**
 * Tests for index.html favicon link path.
 * Ensures the favicon uses a relative path so the browser resolves it
 * relative to the page URL, preventing proxy catch-all forwarding.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const indexPath = path.resolve(__dirname, 'index.html');

function readIndexHtml(): string {
  return fs.readFileSync(indexPath, 'utf-8');
}

describe('index.html favicon link', () => {
  it('uses a relative path for the favicon href to avoid proxy catch-all 404', () => {
    const html = readIndexHtml();

    // Extract the favicon <link> tag
    const match = html.match(/<link\s[^>]*rel=["']icon[^>]*>/i);
    expect(match).not.toBeNull();

    const linkTag = match![0];
    const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
    expect(hrefMatch).not.toBeNull();

    const href = hrefMatch![1];

    // Must be a relative path (starts with './' or '../' or plain filename)
    // Absolute paths like '/src/client/icons/claude.svg' would be caught by
    // the proxy catch-all route and forwarded to the upstream API provider
    expect(href.startsWith('/')).toBe(false);
    expect(href).toBe('./icons/claude.svg');
  });
});
