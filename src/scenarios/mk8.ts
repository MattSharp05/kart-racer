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
  {
    name: 'mk8-ui-kit',
    group: 'MK8 Mode',
    description:
      "The MK8 UI kit's style guide (MK-104): mode tiles, colours and type → character grid → ready, with the stripe wipe, A/B button bar and menu sounds. Pack sprites when a local pack is built, stand-ins otherwise.",
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8UiKit' }),
  },
  ...(
    [
      [
        'mk8-racers-lineup',
        'mk8RacersLineup',
        'MK8\'s 12 racers in a row in the Standard Kart, names underneath (MK-101). Needs a local pack; "not installed" without one.',
      ],
      [
        'mk8-racer-motion',
        'mk8RacerMotion',
        'Mario in the Standard Kart running a loop of moves: leaning into turns, a jump and landing (squash, bob), a hit spin, a ramp trick and looking back at a shell (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-countdown',
        'mk8LakituCountdown',
        'Lakitu flies in with the start light: a red lamp each second, green, then he leaves; looping (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-lap',
        'mk8LakituLap',
        'Lakitu shows the lap sign, "2" then "FINAL LAP", looping (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-respawn',
        'mk8LakituRespawn',
        'Lakitu fishes a kart out: comes down, lifts it on his line, drops it; looping (MK-101). Needs a local pack.',
      ],
    ] as const
  ).map(([name, screen, description]): Scenario => ({
    name,
    group: 'MK8 Mode',
    description,
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen }),
  })),
];
