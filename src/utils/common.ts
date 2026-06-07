/**
 * Common utility functions shared across the project.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

/**
 * Normalizes a filesystem path to a canonical form.
 * - Converts all backslashes to forward slashes
 * - Collapses consecutive slashes into a single slash
 * - Preserves the leading drive letter on Windows (e.g. "C:")
 * @param p - Raw path string (may contain mixed or doubled separators)
 * @returns Normalized path with single forward slashes, no trailing slash
 */
export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')       // unify backslashes
    .replace(/\/+/g, '/')      // collapse consecutive slashes
    .replace(/\/$/, '');       // strip trailing slash
}
