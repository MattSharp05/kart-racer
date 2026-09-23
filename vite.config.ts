import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // three.js alone is ~520 kB minified; the real budget (≤ 700 kB gzipped) is enforced in MK-28.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        dev: resolve(import.meta.dirname, 'dev.html'),
      },
    },
  },
});
