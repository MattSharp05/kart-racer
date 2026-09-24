// MK-28: the JavaScript loaded at startup must stay ≤ 700 KB gzipped.
// Lazy chunks (the ?tune=1 panel, lil-gui) don't count. Run after `pnpm build`.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT = 700 * 1024;
const html = readFileSync('dist/index.html', 'utf8');
const entry = [...html.matchAll(/src="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const preload = [...html.matchAll(/href="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const initial = [...new Set([...entry, ...preload])];
if (initial.length === 0) throw new Error('No script tags found in dist/index.html');
let total = 0;
for (const file of initial) {
  const size = gzipSync(readFileSync(`dist/assets/${file}`)).length;
  total += size;
  console.log(`${file}: ${(size / 1024).toFixed(1)} KB gzipped`);
}
const all = readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
console.log(
  `Initial JS: ${(total / 1024).toFixed(1)} KB gzipped (limit 700 KB); ${all.length} JS files in total`,
);
if (total > LIMIT) {
  console.error('Initial JS is over the 700 KB budget.');
  process.exit(1);
}
