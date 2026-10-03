// MK8 Mode's menu screens (MK-104 UI kit, MK-116 title and modes, MK-117 characters, MK-118 kart
// builder, MK-119 engine class and cups), each opened over the screens that lead to it. Pack
// sprites when a local pack is built, stand-ins otherwise.
import type { Scenario } from '../registry';
import { openMk8 } from './lib/menus';

const scenarios: Scenario[] = [
  {
    name: 'mk8-ui-kit',
    group: 'MK8 Mode',
    description:
      "The MK8 UI kit's style guide (MK-104): mode tiles, colours and type → character grid → ready, with the stripe wipe, A/B button bar and menu sounds. Pack sprites when a local pack is built, stand-ins otherwise.",
    defaultSeed: 1,
    setup: openMk8('ui-kit'),
  },
  {
    name: 'mk8-ui-title',
    group: 'MK8 Mode',
    description:
      "MK8 Mode's title (MK-116): the logo pops in, Press start blinks, the 12 racers bob. Enter or a tap wipes to the mode select; Back returns to the Kart Racer title. The real logo and racers with a local pack, stand-ins otherwise.",
    defaultSeed: 1,
    setup: openMk8('title'),
  },
  {
    name: 'mk8-ui-mode',
    group: 'MK8 Mode',
    description:
      'MK8 mode select (MK-116): Grand Prix, VS Race, Time Trial and Online, the selected one pulsing with its art at the side. OK goes on to character select with the mode; Back wipes to the MK8 title.',
    defaultSeed: 1,
    setup: openMk8('mode'),
  },
  {
    name: 'mk8-ui-char',
    group: 'MK8 Mode',
    description:
      "MK8 character select for a Grand Prix (MK-117): the 12 racers in a 4×3 grid (P1 badge on the selected one), the selected racer in the Standard Kart turning slowly on the left with the name plate and weight class. Arrows (4 across) or taps move it with the name-appear sound and the racer's voice line (silent until the pack's voice clips exist); OK goes on to the kart builder and is remembered next time; Back returns to the mode select. 3D racers and the real icons with a local pack; stand-in initials otherwise.",
    defaultSeed: 1,
    setup: openMk8('char'),
  },
  {
    name: 'mk8-ui-kart',
    group: 'MK8 Mode',
    description:
      "MK8 kart builder for a Grand Prix (MK-118): Body, Tires and Glider reels (←→ column, ↑↓ part; tap the arrows or swipe a reel) and the stats panel, whose 5 bars slide to the loadout's MK8 stats. Starts on the last saved kart (Mario in the standard kart the first time). With a local pack the panel shows the racer in the kart in 3D, glider open on the Glider column. OK saves the kart and goes on to the engine class.",
    defaultSeed: 1,
    setup: openMk8('kart'),
  },
  {
    name: 'mk8-ui-cc',
    group: 'MK8 Mode',
    description:
      'MK8 engine class (MK-119): the 50/100/150/200cc shields (200cc NEW) for a Grand Prix, 150cc selected. OK goes on to the cup select; Back walks back through the kart builder, character select and the mode select. The real shields with a local pack, stand-ins otherwise.',
    defaultSeed: 1,
    setup: openMk8('cc'),
  },
  {
    name: 'mk8-ui-cup',
    group: 'MK8 Mode',
    description:
      'MK8 cup select for a 150cc Grand Prix (MK-119): the Mushroom Cup and its 4 course cards (preview, map, anti-gravity tag, Time Trial best "—"); Flower, Star and Special Cups locked ("Later"). OK on the Mushroom Cup loads Mario Kart Stadium (our Sunny Circuit stands in until it is drivable) and starts the race.',
    defaultSeed: 1,
    setup: openMk8('cup'),
  },
  {
    name: 'mk8-ui-course',
    group: 'MK8 Mode',
    description:
      'MK8 cup and course select for a 150cc VS Race (MK-119): OK on the Mushroom Cup moves the cursor to its courses (roulette sound on each move); OK on a course loads it and starts the race on it (our tracks stand in until the MK8 courses are drivable). Back returns to the cups.',
    defaultSeed: 1,
    setup: openMk8('course'),
  },
];
export default scenarios;
