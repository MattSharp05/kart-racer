import { expect, it } from 'vitest';
import { KART_IDS } from '../src/sim/data/karts';
import { BALANCE_MAX_RACE_SECONDS, raceTrackIds } from '../src/sim/items/balance';
import { createRace, raceSetupRng, type RacerSlot } from '../src/sim/race/createRace';
import { raceTime } from '../src/sim/raceFlow';
import { rngInt, rngPick } from '../src/sim/rng';
import { step } from '../src/sim/step';
import { NEUTRAL_INPUT, type SimState } from '../src/sim/types';

/**
 * The racer balance smoke test (MK-63): `pnpm racer-balance`. 20 seeded 8-AI races with items on,
 * spread over every race track, each with every racer on the grid (plus one seeded extra), then
 * checks that no racer wins more than 40% of them. Minutes of CPU, so never part of `pnpm test`.
 * `RACES=6` runs fewer; `RACERS=maple,pixie,boulder,swoop` races only those.
 */
const RACES = Number(process.env.RACES ?? 20);
const RACERS = process.env.RACERS ? process.env.RACERS.split(',') : KART_IDS;
/** Most of the races one racer may win. */
const MAX_WIN_SHARE = 0.4;
const KARTS = 8;

/** Every racer once, seeded extras up to 8, on a shuffled grid. */
function mixedRace(seed: number, trackId: string): SimState {
  const rng = raceSetupRng(seed);
  const kartIds = [...RACERS];
  while (kartIds.length < KARTS) kartIds.push(rngPick(rng, RACERS));
  const slots = Array.from({ length: KARTS }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = rngInt(rng, 0, i);
    [slots[i], slots[j]] = [slots[j] ?? j, slots[i] ?? i];
  }
  const racers = kartIds
    .slice(0, KARTS)
    .map((kartId, i): RacerSlot => ({ kartId, controller: 'ai', gridSlot: slots[i] ?? i }));
  return createRace({ trackId, racers, engineClass: 100, itemsOn: true, seed, rng });
}

/** Racer ids in finishing order (karts still racing at the time limit left out). */
function finishOrder(state: SimState): string[] {
  const order: string[] = [];
  let s = state;
  while (order.length < s.karts.length) {
    const result = step(s, [NEUTRAL_INPUT]);
    s = result.state;
    for (const event of result.events) {
      if (event.type === 'finish') order.push(s.karts[event.kartId]?.kartType ?? '?');
    }
    if (s.phase === 'racing' && raceTime(s) > BALANCE_MAX_RACE_SECONDS) break;
  }
  return order;
}

it(`racer balance over ${RACES} races`, { timeout: 30 * 60_000 }, () => {
  const trackIds = raceTrackIds();
  const wins: Record<string, number> = {};
  const places: Record<string, number[]> = {};
  for (let i = 0; i < RACES; i += 1) {
    const seed = i + 1;
    const trackId = trackIds[i % trackIds.length] ?? 'sunny-circuit';
    const order = finishOrder(mixedRace(seed, trackId));
    expect(order, `race ${seed} on ${trackId}: everyone finishes`).toHaveLength(KARTS);
    const winner = order[0] ?? '?';
    wins[winner] = (wins[winner] ?? 0) + 1;
    order.forEach((id, place) => (places[id] ??= []).push(place + 1));
  }
  const lines = [
    `races: ${RACES} on ${trackIds.join(', ')}`,
    'racer | wins | share | mean place',
    ...RACERS.map((id) => {
      const mine = places[id] ?? [];
      const mean = mine.reduce((a, b) => a + b, 0) / Math.max(mine.length, 1);
      return `${id} | ${wins[id] ?? 0} | ${(((wins[id] ?? 0) / RACES) * 100).toFixed(0)}% | ${mean.toFixed(2)}`;
    }),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  for (const id of RACERS) {
    expect((wins[id] ?? 0) / RACES, `${id} win share`).toBeLessThanOrEqual(MAX_WIN_SHARE);
  }
});
