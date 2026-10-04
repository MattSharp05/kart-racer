// MK8 Mode online (MK-132): races in a room on an MK8 course, every kart on an MK8 loadout with
// MK8's items, over `?net=local` (BroadcastChannel, no server). On the synthetic test ramp, so
// they need no pack (CI's e2e drives them); listed under Online on /dev with host and client links.
import { tracks } from '../../content/tracks';
import { MK8_ITEM_SET } from '../../mk8/content/items/id';
import type { CreateRaceOptions, RacerSlot } from '../../sim/race/createRace';
import { createRace } from '../../sim/race/createRace';
import type { Loadout } from '../../sim/types';
import { attractMode } from '../menus';
import { ONLINE_GROUP } from '../online';
import type { Scenario, ScenarioSetup } from '../registry';
import { openMk8 } from './lib/menus';
import { TEST_RAMP } from './testRamp';

const KARTS = 8;
const ENGINE_CLASS = 150;
const LAPS = 3;

/** The humans' karts (host first), then the AI's in turn: MK8 racers on MK8 parts (MK-102). */
export const MK8_ONLINE_LOADOUTS: readonly Loadout[] = [
  { racer: 'mk8-mario', body: 'standard-kart', tires: 'standard-tires', glider: 'paper-glider' },
  { racer: 'mk8-peach', body: 'pipe-frame', tires: 'slim-tires', glider: 'peach-parasol' },
  { racer: 'mk8-bowser', body: 'b-dasher', tires: 'slick-tires', glider: 'paper-glider' },
  { racer: 'mk8-toad', body: 'pipe-frame', tires: 'standard-tires', glider: 'cloud-glider' },
  { racer: 'mk8-luigi', body: 'mach-8', tires: 'standard-tires', glider: 'paper-glider' },
  { racer: 'mk8-yoshi', body: 'cat-cruiser', tires: 'monster-tires', glider: 'cloud-glider' },
  { racer: 'mk8-donkey-kong', body: 'sports-coupe', tires: 'slick-tires', glider: 'paper-glider' },
  { racer: 'mk8-daisy', body: 'standard-kart', tires: 'slim-tires', glider: 'peach-parasol' },
];

const DEFAULT: Loadout = {
  racer: 'mk8-mario',
  body: 'standard-kart',
  tires: 'standard-tires',
  glider: 'paper-glider',
};

/** The host's race on the test ramp: kart 0 the host, 1…players−1 the clients, the rest AI. */
export function mk8OnlineRaceOptions(seed: number, players: number): CreateRaceOptions {
  const racers = Array.from({ length: KARTS }, (_, i): RacerSlot => {
    const loadout = MK8_ONLINE_LOADOUTS[i % MK8_ONLINE_LOADOUTS.length] ?? DEFAULT;
    return {
      kartId: loadout.racer,
      controller: i === 0 ? 'local' : i < players ? 'remote' : 'ai',
      loadout,
      ...(i < players ? { name: `Player ${i + 1}` } : {}),
    };
  });
  return {
    trackId: TEST_RAMP.id,
    racers,
    engineClass: ENGINE_CLASS,
    itemsOn: true,
    seed,
    laps: LAPS,
    itemSet: MK8_ITEM_SET,
  };
}

/** The online race, or "pack not installed" if the course isn't registered (never: no pack). */
function mk8OnlineRace(seed: number, players: number): ScenarioSetup {
  if (!tracks.has(TEST_RAMP.id)) {
    return { state: attractMode(seed), screen: 'mk8', mk8Start: 'not-installed' };
  }
  const race = mk8OnlineRaceOptions(seed, players);
  return { state: createRace(race), view: 'chase', online: { race } };
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-online-race-2p',
    group: ONLINE_GROUP,
    description:
      'MK8 Mode online (MK-132): host + 1 client + 6 AI race 3 laps of the MK8 test ramp at 150cc, everyone on an MK8 racer and kart, MK8 items and HUD (no pack needed). Open the host link, then the client link in a second window.',
    defaultSeed: 1,
    mk8Course: TEST_RAMP.id,
    setup: (seed) => mk8OnlineRace(seed, 2),
  },
  {
    name: 'mk8-online-lobby',
    group: ONLINE_GROUP,
    description:
      'An MK8 room’s lobby over BroadcastChannel (MK-132): the host link creates it, the client link joins in another window. MK8 courses (plus the test ramp here, no pack needed) and 50–200cc; each player’s MK8 kart (MK8 Mode’s last pick) and course loading shows by their name; Start waits until everyone has the course.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), view: 'chase', screen: 'title', lobby: 'mk8' }),
  },
  {
    name: 'mk8-ui-online',
    group: 'MK8 Mode',
    description:
      'MK8 Mode’s Online (MK-132), after character select and the kart builder: the Rooms tile. OK opens the rooms (Create room / Join room); a room created here is an MK8 room racing the kart you built. Add &net=local to use BroadcastChannel rooms without Supabase.',
    defaultSeed: 1,
    setup: openMk8('online'),
  },
];
export default scenarios;
