/**
 * Browser-compatible logger fallback.
 * Winston logger depends on Node.js modules (fs, os, path) and cannot run in
 * the browser. This module provides the same interface using console.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

const noop = (): void => {};

export const logger = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: (): void => {},
  debug: (): void => {},
};
