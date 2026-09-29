import { KART_IDS, type KartId } from '../data/karts';
import { BALANCE_MAX_RACE_SECONDS, raceTrackIds } from '../items/balance';
import { raceTime } from '../raceFlow';
import { rngInt } from '../rng';
import { step } from '../step';
import type { EngineClass } from '../tuning';
import { NEUTRAL_INPUT, type SimState } from '../types';
import { createRace, raceSetupRng, type RacerSlot } from './createRace';

/**
 * The racer balance simulation (MK-88): seeded all-AI races where every racer is on the grid
 * equally often, over every race track and engine class. `scripts/racerBalance.lab.ts` runs 100 of
 * them with items on and off (`pnpm racer-balance`); `racerBalance.smoke.test.ts` is the 20-race
 * CI smoke; the `race-balance` scenario is one of these races to watch.
 */

/** Karts on the grid in a balance race. */
export const BALANCE_KARTS = 8;
/** Engine classes, cycled every `raceTrackIds().length` races so every track sees every class. */
export const BALANCE_CLASSES: readonly EngineClass[] = [100, 150, 50];

export interface BalanceRaceOptions {
  itemsOn: boolean;
  /** Racers to draw from (default: the whole roster). */
  roster?: readonly KartId[];
  /** Laps per race (default: the track's own). */
  laps?: number;
}

/** Which race `index` (0-based) is: track, class and the racers sitting it out. */
export function balanceRacePlan(index: number, roster: readonly KartId[] = KART_IDS) {
  const trackIds = raceTrackIds();
  const trackId = trackIds[index % trackIds.length] ?? '';
  const engineClass =
    BALANCE_CLASSES[Math.floor(index / trackIds.length) % BALANCE_CLASSES.length] ?? 100;
  // With more racers than grid slots, a rolling window sits out: over any whole number of turns
  // round the roster, every racer races equally often (10 racers: each sits out 1 race in 5).
  const out = Math.max(0, roster.length - BALANCE_KARTS);
  const sittingOut = new Set<number>();
  for (let j = 0; j < out; j += 1) sittingOut.add((index * out + j) % roster.length);
  const entered = roster.filter((_, i) => !sittingOut.has(i));
  // A roster smaller than the grid repeats from the start.
  while (entered.length < BALANCE_KARTS) entered.push(roster[entered.length % roster.length] ?? '');
  return { trackId, engineClass, kartIds: entered.slice(0, BALANCE_KARTS) };
}

/** Balance race `index` (seed `index + 1`) on a seeded, shuffled grid, in countdown. */
export function balanceRace(index: number, options: BalanceRaceOptions): SimState {
  const { trackId, engineClass, kartIds } = balanceRacePlan(index, options.roster);
  const seed = index + 1;
  const rng = raceSetupRng(seed);
  const slots = kartIds.map((_, i) => i);
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = rngInt(rng, 0, i);
    [slots[i], slots[j]] = [slots[j] ?? j, slots[i] ?? i];
  }
  const racers = kartIds.map((kartId, i): RacerSlot => ({
    kartId,
    controller: 'ai',
    gridSlot: slots[i] ?? i,
  }));
  return createRace({
    trackId,
    racers,
    engineClass,
    itemsOn: options.itemsOn,
    seed,
    rng,
    ...(options.laps !== undefined ? { laps: options.laps } : {}),
  });
}

/** Racer ids in finishing order; karts still racing at the time limit are left out. */
export function finishOrder(state: SimState, maxSeconds = BALANCE_MAX_RACE_SECONDS): KartId[] {
  const order: KartId[] = [];
  let s = state;
  while (order.length < s.karts.length) {
    const result = step(s, [NEUTRAL_INPUT]);
    s = result.state;
    for (const event of result.events) {
      if (event.type === 'finish') order.push(s.karts[event.kartId]?.kartType ?? '?');
    }
    if (s.phase === 'racing' && raceTime(s) > maxSeconds) break;
  }
  return order;
}

/** One racer's results over a set of races. */
export interface RacerRecord {
  id: KartId;
  races: number;
  wins: number;
  podiums: number;
  /** Sum of finishing places (a kart that didn't finish counts as last). */
  placeSum: number;
}

export interface RacerSummary extends RacerRecord {
  winShare: number;
  meanPlace: number;
  podiumShare: number;
}

/** Tallies finishing orders (each at most `BALANCE_KARTS` long) into per-racer records. */
export function tallyRaces(
  orders: readonly (readonly KartId[])[],
  entries: readonly (readonly KartId[])[],
  roster: readonly KartId[] = KART_IDS,
): RacerSummary[] {
  const records = new Map<KartId, RacerRecord>(
    roster.map((id) => [id, { id, races: 0, wins: 0, podiums: 0, placeSum: 0 }]),
  );
  orders.forEach((order, race) => {
    const field = entries[race] ?? [];
    const unplaced = [...field];
    order.forEach((id, i) => {
      const record = records.get(id);
      if (!record) return;
      record.placeSum += i + 1;
      if (i === 0) record.wins += 1;
      if (i < 3) record.podiums += 1;
      unplaced.splice(unplaced.indexOf(id), 1);
    });
    for (const id of unplaced) {
      const record = records.get(id);
      if (record) record.placeSum += field.length;
    }
    for (const id of new Set(field)) {
      const record = records.get(id);
      if (record) record.races += 1;
    }
  });
  const total = orders.length;
  return [...records.values()].map((r) => ({
    ...r,
    winShare: total ? r.wins / total : 0,
    meanPlace: r.races ? r.placeSum / r.races : 0,
    podiumShare: r.races ? r.podiums / r.races : 0,
  }));
}

/** The summary as a plain-text table, one racer per line. */
export function formatSummary(summary: readonly RacerSummary[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);
  return [
    'racer    | races | wins | win % | mean place | podium %',
    ...summary.map(
      (r) =>
        `${r.id.padEnd(8)} | ${String(r.races).padStart(5)} | ${String(r.wins).padStart(4)} |  ${pct(r.winShare)} | ${r.meanPlace.toFixed(2).padStart(10)} |     ${pct(r.podiumShare)}`,
    ),
  ].join('\n');
}
