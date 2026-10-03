import { beforeAll, describe, expect, it } from 'vitest';
import { mk8HornVsSpiny } from '../../../scenarios/mk8/items';
import { giveRotation, mk8AllItemsRace, mk8ItemRotation } from '../../../scenarios/mk8/allItems';
import { driveByAi } from '../../../sim/race/takeover';
import { step } from '../../../sim/step';
import { tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type ItemEntity, type SimEvent, type SimState } from '../../../sim/types';
import { getTrack } from '../../../sim/track';
import { registerMk8Content } from '../../register';
import { testRampTrack } from '../courses/test-ramp';
import { registerTestRamp } from '../courses/test-ramp/register';
import { SPINY } from './spiny-shell/sim';
import { HORN } from './super-horn/sim';

beforeAll(() => {
  registerMk8Content();
  registerTestRamp();
});

/**
 * Steps up to `ticks` ticks (the AI drive themselves), collecting events; `each` runs after every
 * tick and stops the run by returning true.
 */
function run(
  state: SimState,
  ticks: number,
  each?: (s: SimState, events: readonly SimEvent[]) => unknown,
) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(
      s,
      s.karts.map(() => NEUTRAL_INPUT),
    );
    s = result.state;
    events.push(...result.events);
    if (each?.(s, result.events) === true) break;
  }
  return { state: s, events };
}

const spinies = (s: SimState) =>
  s.entities.filter((e): e is ItemEntity => e.kind === 'item' && e.spec === SPINY);

describe('AI Super Horn (MK-129)', () => {
  /** MK-113's horn scenario with the leader driven by the AI, its thinking time already over. */
  function aiLeader(): SimState {
    const state = mk8HornVsSpiny(1);
    state.phase = 'racing';
    const kart = state.karts[0]!;
    driveByAi(kart);
    kart.ai!.itemDelay = 0;
    return state;
  }

  it('saves the horn while the Spiny Shell is out of reach, then destroys it, unhurt', () => {
    let heldWhileFar = true;
    const done = run(aiLeader(), 8 * 60, (s) => {
      const p = s.karts[0]!.position;
      const far = spinies(s).every(
        (e) =>
          Math.hypot(e.position.x - p.x, e.position.y - p.y, e.position.z - p.z) >
          tuning.mk8.hornRadius,
      );
      if (far && spinies(s).length > 0 && s.karts[0]!.item.held !== HORN) heldWhileFar = false;
    });
    expect(heldWhileFar).toBe(true);
    const fx = done.events.filter((e) => e.type === 'itemFx' && e.item === HORN);
    expect(fx.map((e) => (e.type === 'itemFx' ? e.fx : ''))).toContain('spinyDown');
    expect(spinies(done.state)).toHaveLength(0);
    const blown = done.events.filter(
      (e) => e.type === 'kartHit' && e.kartId === 0 && e.kind === SPINY,
    );
    expect(blown).toEqual([]);
  });
});

describe('AI use of every MK8 item (MK-129)', () => {
  it('uses every MK8 item: each handed out again (to a kart with empty slots) until used', () => {
    const def = getTrack(testRampTrack().id);
    if (def.kind !== 'mesh') throw new Error('mesh track expected');
    const used = new Set<string>();
    let turn = 0;
    run(mk8AllItemsRace(def, 1), 240 * 60, (s, events) => {
      for (const e of events) if (e.type === 'itemUsed') used.add(e.item);
      // Lightning (from a box, or the rotation) empties everyone else's slots: whatever hasn't
      // been used yet goes round again.
      const left = mk8ItemRotation().filter((id) => !used.has(id));
      for (const kart of s.karts) {
        if (left.length === 0 || kart.item.held !== null || kart.item.roulette > 0) continue;
        giveRotation(kart, left, turn);
        turn += 2;
      }
      return left.length === 0;
    });
    expect(mk8ItemRotation().filter((id) => !used.has(id))).toEqual([]);
  });
});
