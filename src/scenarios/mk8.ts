import { attractMode } from './menus';
import type { Scenario } from './registry';

/**
 * MK8 Mode (MK-97). The pack is local only (ADR 0009): `mk8-mode` loads it under `pnpm dev` with a
 * built pack, and shows "MK8 pack not installed" anywhere else (previews, production, CI).
 */
export const mk8Scenarios: Scenario[] = [
  {
    name: 'mk8-entry',
    group: 'MK8 Mode',
    description: 'The title with the MK8 Mode button (NEW badge) selected: Enter opens MK8 Mode.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8Entry' }),
  },
  {
    name: 'mk8-loading',
    group: 'MK8 Mode',
    description: "MK8 Mode's loading screen held at 50 % (nothing is fetched).",
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8Loading' }),
  },
  {
    name: 'mk8-not-installed',
    group: 'MK8 Mode',
    description:
      'The "MK8 pack not installed" screen with the commands to build the pack, and Back.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8NotInstalled' }),
  },
  {
    name: 'mk8-mode',
    group: 'MK8 Mode',
    description:
      'MK8 Mode as the title button opens it: loads the pack (progress bar), then the placeholder screen; "not installed" without a local pack.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8' }),
  },
];
