import { describe, expect, it } from 'vitest';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { scenarios } from '../../scenarios';
import { ALL_ITEMS_SKIP_SECONDS, racerBalanceRace } from '../../scenarios/race';
import { aiInput } from '../ai/driver';
import { lineOffsetAt } from '../ai/racingLine';
import { KART_IDS } from '../data/karts';
import { raceTrackIds } from '../items/balance';
import { kartPhysics } from '../kartStats';
import { raceTime } from '../raceFlow';
import { createSimState } from '../state';
import { trackGeometry } from '../track';
import { tuning } from '../tuning';
import type { AiState } from '../types';
import {
  BALANCE_CLASSES,
  BALANCE_KARTS,
  balanceRace,
  balanceRacePlan,
  tallyRaces,
} from './racerBalance';

describe('racer balance simulation (MK-88)', () => {
  it('puts every racer on the grid equally often, over every track and class', () => {
    const races = 100;
    const entered = new Map<string, number>();
    const combos = new Set<string>();
    for (let i = 0; i < races; i += 1) {
      const plan = balanceRacePlan(i);
      expect(new Set(plan.kartIds).size).toBe(BALANCE_KARTS);
      for (const id of plan.kartIds) entered.set(id, (entered.get(id) ?? 0) + 1);
      combos.add(`${plan.trackId}@${plan.engineClass}`);
    }
    expect([...entered.keys()].sort()).toEqual([...KART_IDS].sort());
    for (const count of entered.values())
      expect(count).toBe((races * BALANCE_KARTS) / KART_IDS.length);
    expect(combos.size).toBe(raceTrackIds().length * BALANCE_CLASSES.length);
    // The CI smoke's 20 races are even too.
    const smoke = new Map<string, number>();
    for (let i = 0; i < 20; i += 1)
      for (const id of balanceRacePlan(i).kartIds) smoke.set(id, (smoke.get(id) ?? 0) + 1);
    expect(new Set(smoke.values())).toEqual(new Set([16]));
  });

  it('a balance race: 8 AI on a seeded grid, items on or off, deterministic', () => {
    const state = balanceRace(7, { itemsOn: false });
    const plan = balanceRacePlan(7);
    expect(state.trackId).toBe(plan.trackId);
    expect(state.engineClass).toBe(plan.engineClass);
    expect(state.karts.map((k) => k.kartType).sort()).toEqual([...plan.kartIds].sort());
    expect(state.karts.every((k) => k.controller === 'ai' && k.ai)).toBe(true);
    expect(state.entities.some((e) => e.kind === 'itemBox')).toBe(false);
    expect(balanceRace(7, { itemsOn: false })).toEqual(state);
    expect(balanceRace(7, { itemsOn: true }).entities.some((e) => e.kind === 'itemBox')).toBe(true);
  });

  it('tallies wins, podiums and mean places; a kart still racing counts as last', () => {
    const entries = [
      ['a', 'b', 'c', 'd'],
      ['a', 'b', 'c', 'd'],
    ];
    const summary = tallyRaces(
      [
        ['a', 'b', 'c', 'd'],
        ['b', 'c', 'd'],
      ],
      entries,
      ['a', 'b', 'c', 'd'],
    );
    const a = summary.find((r) => r.id === 'a')!;
    const b = summary.find((r) => r.id === 'b')!;
    expect(a).toMatchObject({ races: 2, wins: 1, podiums: 1, placeSum: 1 + 4 });
    expect(a.meanPlace).toBe(2.5);
    expect(b).toMatchObject({ races: 2, wins: 1, podiums: 2, winShare: 0.5, podiumShare: 1 });
    expect(b.meanPlace).toBe(1.5);
  });

  it('race-balance: 8 different racers, all AI, fast-forwarded into the race', () => {
    const state = racerBalanceRace(1);
    expect(state.phase).toBe('racing');
    expect(raceTime(state)).toBeGreaterThanOrEqual(ALL_ITEMS_SKIP_SECONDS);
    expect(new Set(state.karts.map((k) => k.kartType)).size).toBe(BALANCE_KARTS);
    expect(state.karts.every((k) => k.controller === 'ai')).toBe(true);
    const setup = scenarios.get('race-balance')!.setup(1);
    expect(setup.follow).toBe(setup.state.positions[0]);
  });
});

describe('AI cornering uses handling (MK-88)', () => {
  const geometry = trackGeometry(sunnyCircuit);
  const line = sunnyCircuit.aiLine ?? [];

  /** Highest speed (m/s, 0.25 steps) at which the AI still holds the throttle at lap fraction `t`. */
  function throttleLimit(kartType: string, t: number): number {
    for (let speed = 1; speed < 40; speed += 0.25) {
      const kart = createSimState({
        seed: 1,
        trackId: sunnyCircuit.id,
        karts: [
          {
            kartType,
            position: geometry.pointAt(t, lineOffsetAt(line, t)),
            heading: geometry.headingAt(t),
            speed,
          },
        ],
      }).karts[0]!;
      const ai: AiState = {
        lineOffset: 0,
        skill: 0.93,
        aggression: 0,
        stuckTime: 0,
        recoverTime: 0,
      };
      if (aiInput(kart, ai, geometry, line, 150, true).throttle === 0) return speed - 0.25;
    }
    return 40;
  }

  it('a nimbler kart (same top speed) carries more speed into corners; a clumsier one less', () => {
    // Swoop (handling 5) and Maple (3) share a top speed.
    expect(kartPhysics('swoop', 150).topSpeed).toBe(kartPhysics('maple', 150).topSpeed);
    expect(tuning.ai.cornerHandling).toBeGreaterThan(0);
    const faster: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const t = i / 40;
      const swoop = throttleLimit('swoop', t);
      const maple = throttleLimit('maple', t);
      expect(swoop).toBeGreaterThanOrEqual(maple);
      if (swoop > maple) faster.push(t);
    }
    // Somewhere on the lap a corner (not the cruising speed) sets the limit…
    expect(faster.length).toBeGreaterThan(0);
    // …and it's the handling: an AI that ignores it plans those corners the same for both.
    const saved = tuning.ai.cornerHandling;
    try {
      tuning.ai.cornerHandling = 0;
      for (const t of faster) expect(throttleLimit('swoop', t)).toBe(throttleLimit('maple', t));
    } finally {
      tuning.ai.cornerHandling = saved;
    }
  });
});
