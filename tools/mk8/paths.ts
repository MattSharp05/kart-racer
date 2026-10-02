// Where the MK8 asset pipeline reads and writes (MK-93). Raw files are whatever the user put in
// `MK8_RAW`; converted files go to `MK8_OUT`. Both default to gitignored folders at the repo
// root, and the pipeline never writes into `public/`.
import { isAbsolute, join, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dirname, '../..');

function fromEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value) return join(REPO_ROOT, fallback);
  return isAbsolute(value) ? value : resolve(REPO_ROOT, value);
}

/** Raw input: `$MK8_RAW` (default `.mk8-raw/`). */
export function rawDir(): string {
  return fromEnv('MK8_RAW', '.mk8-raw');
}

/** Converted output: `$MK8_OUT` (default `.mk8-out/`). */
export function outDir(): string {
  return fromEnv('MK8_OUT', '.mk8-out');
}

/** Forward-slash path relative to `root`, as written in the manifest. */
export function manifestPath(root: string, file: string): string {
  return file
    .slice(root.length + 1)
    .split(/[\\/]/)
    .join('/');
}
