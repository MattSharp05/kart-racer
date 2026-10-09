import { localRace } from './local';
import { attractMode } from './menus';
import { racingSince, sunnyRace } from './race';
import type { Scenario } from './registry';

/**
 * Phone controllers (MK-146). On the site the panel's QR codes pair a real phone (Supabase
 * signaling + WebRTC); with `&net=local` a tab of the same browser opening
 * `/remote?room=<code>&slot=<n>&net=local` pairs instead. `&pair=<code>` fixes the code.
 */
export const remoteScenarios: Scenario[] = [
  {
    name: 'add-controllers',
    group: 'Phone controllers',
    description: 'Add Controllers over the title: a QR code per player for a phone to scan.',
    defaultSeed: 1,
    addControllers: true,
    setup: (seed) => ({ state: attractMode(seed), screen: 'title' }),
  },
  {
    name: 'remote-race',
    group: 'Phone controllers',
    description:
      'A solo race on Sunny Circuit, paused under Add Controllers: scan Player 1, press Done, ' +
      'Continue, and drive with the phone. Closing the phone page pauses the race.',
    defaultSeed: 1,
    addControllers: true,
    setup: (seed) => ({ state: racingSince(sunnyRace(seed), 1) }),
  },
  {
    name: 'remote-2p',
    group: 'Phone controllers',
    description:
      "A 2-player race in countdown under Add Controllers (MK-147): P2's kart drives itself " +
      "until a phone scans Player 2's code, then that phone drives it. Player 1's phone (or " +
      'the keyboard) drives P1.',
    defaultSeed: 1,
    addControllers: true,
    setup: (seed) => ({ state: localRace(seed, 2), players: 2 }),
  },
];
