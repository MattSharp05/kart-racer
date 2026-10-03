// MK-135 (ADR 0009 as amended): on Vercel, after `pnpm build`, copies the converted MK8 pack
// (`out/` of the private repo MattSharp05/kart-racer-mk8-assets) into `dist/mk8/`, where the
// Routing Middleware (`middleware.ts`) gates it behind the password. Never into `public/`, never
// committed.
//
// Runs only when both `MK8_ASSETS_TOKEN` (read-only token for that repo) and `MK8_PASSWORD` are
// set; otherwise it does nothing and the site shows "MK8 pack not installed", as before. A sparse,
// shallow clone of `out/` only; the token goes to git through its environment (an HTTP header),
// never on a command line or in a log. Runs nothing from the private repo.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'https://github.com/MattSharp05/kart-racer-mk8-assets';
const PACK_DIR = 'out';
const DEST = 'dist/mk8';

/**
 * The files to copy: the manifest plus every file it lists. Throws on a path that could escape
 * `dist/mk8/` or land on the shipped, ungated font.
 */
export function packFiles(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('MK8 pack: out/manifest.json is not a pack manifest');
  }
  const paths = manifest.files.map((entry) => entry?.path);
  for (const path of paths) {
    const unsafe =
      typeof path !== 'string' ||
      path === '' ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..') ||
      path.startsWith('fonts/');
    if (unsafe) throw new Error(`MK8 pack: refusing manifest path ${JSON.stringify(path)}`);
  }
  return ['manifest.json', ...paths];
}

/** Git's environment for an authenticated, non-interactive clone (the token never hits argv). */
function gitEnv(token) {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

function main() {
  const token = process.env.MK8_ASSETS_TOKEN;
  if (!token) {
    console.log(
      'MK8 pack: MK8_ASSETS_TOKEN not set, skipping (MK8 Mode shows "pack not installed").',
    );
    return;
  }
  if (!process.env.MK8_PASSWORD) {
    console.log('MK8 pack: MK8_PASSWORD not set, skipping (the pack is only deployed behind it).');
    return;
  }
  if (!existsSync('dist/index.html')) throw new Error('MK8 pack: run after the build (no dist/)');
  const work = mkdtempSync(join(tmpdir(), 'mk8-pack-'));
  try {
    const env = gitEnv(token);
    const git = (...args) =>
      execFileSync('git', args, { env, stdio: ['ignore', 'ignore', 'inherit'] });
    git('clone', '--quiet', '--depth=1', '--filter=blob:none', '--sparse', REPO, work);
    git('-C', work, 'sparse-checkout', 'set', PACK_DIR);
    const source = join(work, PACK_DIR);
    const files = packFiles(JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')));
    for (const file of files) {
      const to = join(DEST, file);
      mkdirSync(dirname(to), { recursive: true });
      cpSync(join(source, file), to);
    }
    console.log(`MK8 pack: copied ${files.length} files to ${DEST}/ (password-gated).`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
