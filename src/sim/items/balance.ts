import { items } from '../../content/items';
import { tracks } from '../../content/tracks';
import { KART_IDS } from '../data/karts';
import { createRace, raceSetupRng, type RacerSlot } from '../race/createRace';
import { raceTime } from '../raceFlow';
import { rngInt, rngPick } from '../rng';
import { step } from '../step';
import { NEUTRAL_INPUT, type ItemId, type SimEvent, type SimState } from '../types';

/**
 * The item balance simulation (MK-72): all-AI races with items on, counting what the AI used, what
 * hit whom and how often the lead changed. `scripts/itemBalance.lab.ts` runs 50 of them
 * (`pnpm item-balance`); the `race-all-items` scenario is one of these races to watch.
 */

/** Tracks a real race can be on (not the test fixtures), in menu order. */
export function raceTrackIds(): string[] {
  return tracks
    .list()
    .filter((track) => !track.testOnly)
    .map((track) => track.id);
}

/** 8 AI racers (seeded karts, shuffled grid) with items on, in countdown. */
export function allAiRace(seed: number, trackId: string, karts = 8): SimState {
  const rng = raceSetupRng(seed);
  const slots = Array.from({ length: karts }, (_, i) => i);
  // Seeded Fisher–Yates: nobody always starts on pole.
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = rngInt(rng, 0, i);
    [slots[i], slots[j]] = [slots[j] ?? j, slots[i] ?? i];
  }
  const racers = slots.map((gridSlot): RacerSlot => ({
    kartId: rngPick(rng, KART_IDS),
    controller: 'ai',
    gridSlot,
  }));
  return createRace({ trackId, racers, engineClass: 100, itemsOn: true, seed, rng });
}

/** What one race did with items. */
export interface RaceItemStats {
  trackId: string;
  seed: number;
  /** Uses per item (a Turbo Trio counts each of its 3 boosts). */
  used: Record<ItemId, number>;
  /** Hits that landed, per item: spin-outs (`kartHit`), hornet stings and oil slips. */
  hits: Record<ItemId, number>;
  /** Times 1st place went to another kart after GO. */
  leadChanges: number;
  /** Seconds between the first and the last finisher (every kart finishes, or the race times out). */
  finishSpread: number;
  /** Karts that finished before the time limit. */
  finishers: number;
  ticks: number;
}

/** The item a hit counts for, or undefined when it wasn't an item (a hazard, a squash). */
function hitItem(event: SimEvent, itemIds: ReadonlySet<string>): ItemId | undefined {
  if (event.type === 'kartHit') return itemIds.has(event.kind) ? event.kind : undefined;
  // Lighter item hits that don't spin (MK-65 oil, MK-67 hornets) report an `itemFx` instead.
  if (event.type === 'itemFx' && (event.fx === 'sting' || event.fx === 'slip')) return event.item;
  return undefined;
}

/** Longest race the simulation waits for (s after GO): a stuck AI can't stall the run. */
export const BALANCE_MAX_RACE_SECONDS = 600;

/** Races `state` (all AI) until every kart finishes or `maxSeconds` after GO, counting items. */
export function raceItemStats(
  state: SimState,
  seed: number,
  maxSeconds = BALANCE_MAX_RACE_SECONDS,
): RaceItemStats {
  const itemIds = new Set(items.ids());
  const used: Record<ItemId, number> = {};
  const hits: Record<ItemId, number> = {};
  const finishTimes: number[] = [];
  let leadChanges = 0;
  let leader: number | undefined;
  let s = state;
  while (finishTimes.length < s.karts.length) {
    const result = step(s, [NEUTRAL_INPUT]);
    s = result.state;
    for (const event of result.events) {
      if (event.type === 'itemUsed') used[event.item] = (used[event.item] ?? 0) + 1;
      else if (event.type === 'finish') finishTimes.push(event.time);
      const item = hitItem(event, itemIds);
      if (item !== undefined) hits[item] = (hits[item] ?? 0) + 1;
    }
    if (s.phase !== 'racing') continue;
    const first = s.positions[0];
    if (leader !== undefined && first !== leader) leadChanges += 1;
    leader = first;
    if (raceTime(s) > maxSeconds) break;
  }
  return {
    trackId: s.trackId,
    seed,
    used,
    hits,
    leadChanges,
    finishSpread: finishTimes.length > 1 ? Math.max(...finishTimes) - Math.min(...finishTimes) : 0,
    finishers: finishTimes.length,
    ticks: s.tick,
  };
}
