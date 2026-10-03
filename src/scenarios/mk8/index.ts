// MK8 Mode's scenarios (`/dev` → MK8 Mode), one file per feature area in this folder, each
// default-exporting its `Scenario[]` and listed by one line in `groups.ts` (a plain re-export, so
// Vite, Vitest and Playwright's Node loader all read it). Helpers shared between groups live in
// `lib/`. README.md has the how-to.
import type { Scenario } from '../registry';
import * as groups from './groups';

/** Every MK8 scenario, groups in name order. */
export const mk8Scenarios: Scenario[] = Object.values(groups).flat();
