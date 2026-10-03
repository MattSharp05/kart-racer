// MK8 Mode's way in (MK-97): the title's button, the loading bar, "not installed" and (MK-135)
// the site's pack password.
import { attractMode } from '../menus';
import type { Scenario } from '../registry';
import { openMk8 } from './lib/menus';

/**
 * MK8 Mode (MK-97). `mk8-mode` loads the pack: under `pnpm dev` from a local build, on the site
 * behind its password (MK-135, ADR 0009 as amended), else "MK8 pack not installed" (CI, a deploy
 * without the pack).
 */
const scenarios: Scenario[] = [
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
    setup: openMk8('loading-demo'),
  },
  {
    name: 'mk8-not-installed',
    group: 'MK8 Mode',
    description:
      'The "MK8 pack not installed" screen with the commands to build the pack, and Back.',
    defaultSeed: 1,
    setup: openMk8('not-installed'),
  },
  {
    name: 'mk8-password',
    group: 'MK8 Mode',
    description:
      "The site's MK8 pack password box (MK-135): the right password loads the pack, a wrong one shows an error. MK8 Mode opens it itself when the pack answers 401.",
    defaultSeed: 1,
    setup: openMk8('password'),
  },
  {
    name: 'mk8-mode',
    group: 'MK8 Mode',
    description:
      'MK8 Mode as the title button opens it: loads the pack (progress bar), then the placeholder screen; "not installed" without a local pack.',
    defaultSeed: 1,
    setup: openMk8('load'),
  },
];
export default scenarios;
