/**
 * @fileoverview Vitest configuration
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

// Path to SVG ?url mock module for test environment
const SvgUrlMockPath = path.resolve(__dirname, 'src/client/__mocks__/svg-url-mock.ts');

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    setupFiles: ['./src/client/test-setup.ts'],
  },
  resolve: {
    alias: [
      {
        find: /^(.*\/icons\/.*\.svg)\?url$/,
        replacement: SvgUrlMockPath,
      },
    ],
  },
});
