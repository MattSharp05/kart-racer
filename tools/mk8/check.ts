// `pnpm mk8:check` (MK-93): the manifest matches the files in the output folder and every
// budget in budgets.json holds. No download, no conversion. Not in CI until the assets'
// hosting is decided.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readManifest, sha256, sizeReport, type Manifest } from './manifest.ts';
import { outDir } from './paths.ts';

export interface Budgets {
  totalBytes: number;
  /** A group name; a prefix ending in `*` (each matching group on its own); or one ending in `/**` (all of them together). */
  groups: Record<string, number>;
}

export function loadBudgets(file = join(import.meta.dirname, 'budgets.json')): Budgets {
  return JSON.parse(readFileSync(file, 'utf8')) as Budgets;
}

/** Problems found, one line each; empty when everything matches. */
export function checkAssets(root: string, manifest: Manifest, budgets: Budgets): string[] {
  const problems: string[] = [];
  const groups = new Map<string, number>();
  let total = 0;
  for (const e of manifest.files) {
    // Budgets count what the manifest says, so a missing file doesn't hide an overrun.
    groups.set(e.group, (groups.get(e.group) ?? 0) + e.bytes);
    total += e.bytes;
    const file = join(root, e.path);
    if (!existsSync(file)) {
      problems.push(`missing file: ${e.path}`);
      continue;
    }
    const bytes = readFileSync(file);
    if (bytes.byteLength !== e.bytes)
      problems.push(
        `size mismatch: ${e.path} is ${bytes.byteLength} B, manifest says ${e.bytes} B`,
      );
    else if (sha256(bytes) !== e.sha256) problems.push(`hash mismatch: ${e.path}`);
  }
  const sorted = [...groups].sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [pattern, limit] of Object.entries(budgets.groups)) {
    if (pattern.endsWith('/**')) {
      // `audio/**`: every group under the prefix together.
      const prefix = pattern.slice(0, -2);
      const bytes = sorted.filter(([g]) => g.startsWith(prefix)).reduce((sum, [, b]) => sum + b, 0);
      if (bytes > limit) problems.push(`over budget: ${pattern} is ${bytes} B, budget ${limit} B`);
      continue;
    }
    for (const [group, bytes] of sorted) {
      const matches = pattern.endsWith('*')
        ? group.startsWith(pattern.slice(0, -1))
        : group === pattern;
      if (matches && bytes > limit)
        problems.push(`over budget: ${group} is ${bytes} B, budget ${pattern} = ${limit} B`);
    }
  }
  if (total > budgets.totalBytes)
    problems.push(`over budget: total is ${total} B, budget ${budgets.totalBytes} B`);
  return problems;
}

function main(): number {
  const root = outDir();
  const manifest = readManifest(root);
  if (!manifest) {
    console.log(`mk8:check: no manifest in ${root} (no assets built), nothing to check.`);
    return 0;
  }
  console.log(sizeReport(manifest));
  const problems = checkAssets(root, manifest, loadBudgets());
  for (const p of problems) console.error(`✗ ${p}`);
  console.log(problems.length ? `mk8:check: ${problems.length} problem(s).` : 'mk8:check: OK');
  return problems.length ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();
