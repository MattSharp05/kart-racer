// MK8 Mode's scenarios (`/dev` → MK8 Mode), one file per feature area in this folder, each
// default-exporting its `Scenario[]`. They are collected here automatically, so a new group is a
// new file only (README.md); helpers shared between groups live in `lib/`.
import type { Scenario } from '../registry';

const groups = import.meta.glob<Scenario[]>(['./*.ts', '!./index.ts', '!./*.test.ts'], {
  eager: true,
  import: 'default',
});

/** Every MK8 scenario, group files in name order. */
export const mk8Scenarios: Scenario[] = Object.keys(groups)
  .sort()
  .flatMap((path) => groups[path] ?? []);
