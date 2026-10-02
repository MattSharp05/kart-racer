import { createReadStream, existsSync, statSync } from 'node:fs';
import { normalize, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.m4a': 'audio/mp4',
};

/**
 * `pnpm dev` only: serves the MK8 pipeline's output (`$MK8_OUT`, default `.mk8-out/`) at `/mk8/`,
 * so converted assets can be tried locally without copying them into `public/` (MK-95).
 * Anything not there falls through to `public/mk8/` (the fonts).
 */
function mk8Assets(): Plugin {
  const root = resolve(import.meta.dirname, process.env.MK8_OUT ?? '.mk8-out');
  return {
    name: 'mk8-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/mk8/', (req, res, next) => {
        const path = normalize(decodeURIComponent((req.url ?? '').split('?')[0] ?? ''));
        const file = resolve(root, `.${path}`);
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        const type = MIME[file.slice(file.lastIndexOf('.'))];
        if (type) res.setHeader('Content-Type', type);
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [mk8Assets()],
  build: {
    target: 'es2022',
    // three.js alone is ~520 kB minified; the real budget (≤ 700 kB gzipped) is enforced in MK-28.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        dev: resolve(import.meta.dirname, 'dev.html'),
        mk8Sprites: resolve(import.meta.dirname, 'dev/mk8-sprites.html'),
      },
    },
  },
});
