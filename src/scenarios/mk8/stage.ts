// MK8 models on the 3D stage (MK-101 racers and Lakitu, MK-102 kart bodies). Need a local pack.
import type { Scenario } from '../registry';
import { openMk8 } from './lib/menus';

const scenarios: Scenario[] = [
  ...(
    [
      [
        'mk8-racers-lineup',
        'racers-lineup',
        'MK8\'s 12 racers in a row in the Standard Kart, names underneath (MK-101). Needs a local pack; "not installed" without one.',
      ],
      [
        'mk8-racer-motion',
        'racer-motion',
        'Mario in the Standard Kart running a loop of moves: leaning into turns, a jump and landing (squash, bob), a hit spin, a ramp trick and looking back at a shell (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-countdown',
        'lakitu-countdown',
        'Lakitu flies in with the start light: a red lamp each second, green, then he leaves; looping (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-lap',
        'lakitu-lap',
        'Lakitu shows the lap sign, "2" then "FINAL LAP", looping (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-respawn',
        'lakitu-respawn',
        'Lakitu fishes a kart out: comes down, lifts it on his line, drops it; looping (MK-101). Needs a local pack.',
      ],
      [
        'mk8-karts-lineup',
        'karts-lineup',
        "MK8's 6 kart bodies in a row (MK-102), each on its own tires (all 4 kinds) on the body's wheel anchors, gliders folded away; parts named underneath. Needs a local pack.",
      ],
    ] as const
  ).map(([name, start, description]): Scenario => ({
    name,
    group: 'MK8 Mode',
    description,
    defaultSeed: 1,
    setup: openMk8(start),
  })),
];
export default scenarios;
