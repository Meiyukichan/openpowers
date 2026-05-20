/**
 * Vite build configuration for the React SPA frontend.
 * Builds src/client/ into dist/client/, served by the Express backend at /ui.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/ui/',
  root: path.resolve(__dirname, 'src', 'client'),
  build: {
    outDir: path.resolve(__dirname, 'dist', 'client'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3939',
        changeOrigin: true,
      },
    },
  },
});
