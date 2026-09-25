import type { KartId } from '../sim/data/karts';
import { autopilotInput } from '../sim/autopilot';
import type { RacerSlot } from '../sim/race/createRace';
import { rngFloat, seedRng } from '../sim/rng';
import { getTrack, trackGeometry } from '../sim/track';
import { DT } from '../sim/tuning';
import type { InputFrame, KartState } from '../sim/types';
import { OnlineClient } from './client';
import { OnlineHost } from './host';
import { createLoopbackPair, type NetConditions } from './netsim';

/**
 * Test harness for the net core (unit and perf tests, not shipped): a host and N clients on
 * loopback links under simulated lag, with a hand-cranked clock so every run is deterministic.
 */

export const TICK_MS = DT * 1000;
const KARTS: readonly KartId[] = ['maple', 'pixie', 'boulder', 'swoop'];

/** A deterministic clock and timer queue that loopback links schedule deliveries on. */
export function virtualClock() {
  let time = 0;
  let order = 0;
  const queue: { at: number; order: number; fn: () => void }[] = [];
  return {
    now: () => time,
    schedule: (fn: () => void, ms: number) => queue.push({ at: time + ms, order: order++, fn }),
    advance(ms: number) {
      time += ms;
      queue.sort((a, b) => a.at - b.at || a.order - b.order);
      while (queue[0] && queue[0].at <= time) queue.shift()?.fn();
    },
  };
}

/** The racers of an online test race: the host's kart 0, clients 1..humans-1, the rest AI. */
export function onlineRacers(humans: number, karts = 8): RacerSlot[] {
  return Array.from({ length: karts }, (_, i) => ({
    kartId: KARTS[i % KARTS.length] ?? 'maple',
    controller: i === 0 ? 'local' : i < humans ? 'remote' : 'ai',
  }));
}

/** Host + clients on loopback links with `conditions` both ways (link i seeded with seed + i). */
export function onlineRace({
  clients,
  conditions,
  seed = 7,
  laps = 1,
  itemsOn = true,
}: {
  clients: number;
  conditions: NetConditions;
  seed?: number;
  laps?: number;
  itemsOn?: boolean;
}) {
  const clock = virtualClock();
  const host = new OnlineHost(
    {
      trackId: 'sunny-circuit',
      racers: onlineRacers(clients + 1),
      engineClass: 100,
      itemsOn,
      seed,
      laps,
    },
    0,
  );
  const clientList = Array.from({ length: clients }, (_, i) => {
    const rng = { rngState: seedRng(seed * 31 + i) };
    const [hostEnd, clientEnd] = createLoopbackPair({
      conditions,
      random: () => rngFloat(rng),
      schedule: clock.schedule,
    });
    const client = new OnlineClient(clientEnd, clock.now);
    host.addClient(hostEnd, i + 1);
    return client;
  });
  return { host, clients: clientList, clock };
}

const track = getTrack('sunny-circuit');
if (track.kind !== 'spline') throw new Error('sunny-circuit must be a spline track');
const geometry = trackGeometry(track);

/**
 * Scripted driving for player `player` at `tick`: follows the track with a weaving line, drifts
 * now and then and fires its items, so prediction and the host's events both get exercised.
 */
export function scriptedInput(
  kart: KartState | undefined,
  tick: number,
  player: number,
): InputFrame {
  if (!kart) return { throttle: 0, brake: 0, steer: 0, drift: false, item: false };
  const lateral = Math.sin(tick / 70 + player * 1.7) * 3;
  const input = autopilotInput(kart, geometry, 1, lateral);
  const phase = (tick + player * 40) % 240;
  return { ...input, drift: phase > 150 && phase < 200, item: phase === 100 };
}
