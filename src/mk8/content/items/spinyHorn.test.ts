import { beforeAll, describe, expect, it } from 'vitest';
import { mk8HornVsSpiny, mk8Spiny, SPINY_FLYING } from '../../../scenarios/mk8/items';
import { homingOn } from '../../../sim/items/entities';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { tuning } from '../../../sim/tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemEntity,
  type SimEvent,
  type SimState,
} from '../../../sim/types';
import { routeGeometry } from '../../../sim/route';
import { headingOf } from '../../../sim/math';
import { registerTestRamp } from '../courses/test-ramp/register';
import { testRampTrack } from '../courses/test-ramp';
import { registerMk8Content } from '../../register';
import { MK8_ITEM_SET } from './id';
import { SPINY, SPINY_BLAST, SpinyPhase, spinyPhase } from './spiny-shell/sim';
import { HORN, HORN_WAVE } from './super-horn/sim';

beforeAll(() => {
  registerMk8Content();
  registerTestRamp();
});

/** Steps `ticks` ticks, the player with `input`, everyone else idle; collects events. */
function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const inputs = s.karts.map((k) =>
      k.id === 0 ? { ...NEUTRAL_INPUT, ...input } : NEUTRAL_INPUT,
    );
    const result = step(s, inputs);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Steps until `done` (at most `max` ticks), the player with `input`. */
function runUntil(
  state: SimState,
  done: (s: SimState, events: SimEvent[]) => boolean,
  max: number,
  input: Partial<InputFrame> = {},
) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < max; i += 1) {
    const r = run(s, 1, input);
    s = r.state;
    events.push(...r.events);
    if (done(s, r.events)) return { state: s, events, ticks: i + 1 };
  }
  throw new Error(`not done in ${max} ticks`);
}

/** Presses and releases the item button once (2 ticks). */
function press(state: SimState) {
  const down = run(state, 1, { item: true });
  const up = run(down.state, 1);
  return { state: up.state, events: [...down.events, ...up.events] };
}

const spinies = (s: SimState) =>
  s.entities.filter((e): e is ItemEntity => e.kind === 'item' && e.spec === SPINY);
const hitsBy = (events: SimEvent[], kind: string) =>
  events.flatMap((e) => (e.type === 'kartHit' && e.kind === kind ? [e.kartId] : []));
const exploded = (_s: SimState, events: SimEvent[]) =>
  events.some((e) => e.type === 'itemFx' && e.item === SPINY && e.fx === 'explode');

describe('Spiny Shell (MK-113)', () => {
  it('keeps the scenario copy of its flight data in step', () => {
    expect(SPINY_FLYING).toBe(SpinyPhase.air);
  });

  it('flies from last place to the leader on Sunny Circuit and blows it up', () => {
    const start = mk8Spiny(1);
    const thrown = press(start);
    expect(thrown.state.karts[0]!.item.held).toBeNull();
    const [spiny] = spinies(thrown.state);
    expect(spiny?.targetId).toBe(1);
    expect(
      thrown.events.some((e) => e.type === 'itemFx' && e.fx === 'incoming' && e.kartId === 1),
    ).toBe(true);

    const done = runUntil(thrown.state, exploded, 20 * 60);
    const hit = hitsBy([...thrown.events, ...done.events], SPINY);
    // The leader, blown up and thrown into the air.
    expect(hit).toContain(1);
    const leader = done.state.karts[1]!;
    expect(leader.spinTimer).toBeGreaterThan(tuning.spinSeconds);
    expect(leader.velocity.y).toBeGreaterThan(0);
    expect(leader.grounded).toBe(false);
    expect(spinies(done.state)).toHaveLength(0);
    expect(done.state.entities.some((e) => e.kind === 'item' && e.spec === SPINY_BLAST)).toBe(true);
  });

  it(`hits every kart within tuning.mk8.spinyRadius (${tuning.mk8.spinyRadius} m) of the leader, and none further`, () => {
    const thrown = press(mk8Spiny(1));
    const done = runUntil(thrown.state, exploded, 20 * 60);
    const hit = new Set(hitsBy(done.events, SPINY));
    const leader = done.state.karts[1]!;
    const near = done.state.karts.filter((k) => {
      const d = Math.hypot(
        k.position.x - leader.position.x,
        k.position.y - leader.position.y,
        k.position.z - leader.position.z,
      );
      return d <= tuning.mk8.spinyRadius;
    });
    // Karts 3 and 4 park beside the leader, kart 5 12 m behind it.
    expect(near.map((k) => k.id).sort()).toEqual([1, 3, 4]);
    for (const kart of done.state.karts) {
      if (kart.id === 0 || kart.id === 2) continue;
      expect(hit.has(kart.id), `kart ${kart.id}`).toBe([1, 3, 4].includes(kart.id));
    }
  });

  it('hits karts in its path on the ground leg, then flies over everyone', () => {
    const thrown = press(mk8Spiny(1));
    // Kart 2 is parked 10 m ahead of the player, on the centreline.
    const ground = run(thrown.state, Math.round(tuning.mk8.spinyGroundSeconds * 60) - 2);
    expect(hitsBy([...thrown.events, ...ground.events], SPINY)).toEqual([2]);
    const air = run(ground.state, 10);
    const spiny = spinies(air.state)[0]!;
    expect(spinyPhase(spiny)).toBe(SpinyPhase.air);
    // Karts 6 and 7 are on its way, off its line: flown over, untouched.
    const done = runUntil(air.state, exploded, 20 * 60);
    expect(hitsBy([...air.events, ...done.events], SPINY)).not.toContain(6);
    expect(hitsBy([...air.events, ...done.events], SPINY)).not.toContain(7);
  });

  it('warns its target through the HUD (homingOn) until it lands', () => {
    const thrown = press(mk8Spiny(1));
    expect(homingOn(thrown.state, 1)).toEqual([SPINY]);
    expect(homingOn(thrown.state, 0)).toEqual([]);
  });

  it('dives (hovers, then drops) before it explodes', () => {
    const thrown = press(mk8Spiny(1));
    const dive = runUntil(
      thrown.state,
      (s) => spinies(s).some((e) => spinyPhase(e) === SpinyPhase.dive),
      20 * 60,
    );
    expect(dive.events.some((e) => e.type === 'itemFx' && e.fx === 'dive')).toBe(true);
    const rest = runUntil(dive.state, exploded, 5 * 60);
    // The dive's first tick is the one it started on.
    expect(rest.ticks).toBe(Math.round(tuning.mk8.spinyDiveSeconds * 60) - 1);
  });

  it('follows a mesh track’s route (the MK8 test ramp) to the leader half a lap ahead', () => {
    const track = testRampTrack();
    const route = routeGeometry(track.route);
    const at = (t: number) => {
      const f = route.frameAt(t);
      return { position: f.position, heading: headingOf(f.tangent, 0), up: f.up };
    };
    const state = createSimState({
      seed: 1,
      trackId: track.id,
      engineClass: 150,
      itemsOn: false,
      itemSet: MK8_ITEM_SET,
      itemSlots: 2,
      // The thrower just past the start line, and the leader on C (the far straight), so the
      // leader is ahead by lap progress (mesh tracks rank karts by route progress since MK-105).
      karts: [at(0.1), at(0.55)],
    });
    state.positions = [1, 0];
    state.karts[0]!.item.held = SPINY;
    state.karts[0]!.item.uses = 1;
    const thrown = press(state);
    let maxRouteDistance = 0;
    const done = runUntil(
      thrown.state,
      (s, events) => {
        for (const e of spinies(s)) {
          if (spinyPhase(e) === SpinyPhase.dive) continue;
          maxRouteDistance = Math.max(maxRouteDistance, route.project(e.position).distance);
        }
        return exploded(s, events);
      },
      30 * 60,
    );
    expect(hitsBy(done.events, SPINY)).toContain(1);
    // It stayed over the route (never further than its flying height from the centreline).
    expect(maxRouteDistance).toBeLessThanOrEqual(tuning.mk8.spinyAirHeight + 0.5);
  });

  it('is deterministic', () => {
    const a = run(press(mk8Spiny(3)).state, 240).state;
    const b = run(press(mk8Spiny(3)).state, 240).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('Super Horn (MK-113)', () => {
  it('destroys a Spiny Shell diving on the user, who is left unhurt', () => {
    const start = mk8HornVsSpiny(1);
    // Wait until it hovers over the player, within the horn's reach.
    const over = runUntil(
      start,
      (s) =>
        spinies(s).some((e) => {
          const p = s.karts[0]!.position;
          const d = Math.hypot(e.position.x - p.x, e.position.y - p.y, e.position.z - p.z);
          return spinyPhase(e) === SpinyPhase.dive && d <= tuning.mk8.hornRadius;
        }),
      10 * 60,
    );
    const honked = press(over.state);
    expect(spinies(honked.state)).toHaveLength(0);
    expect(
      honked.events.some((e) => e.type === 'itemFx' && e.item === HORN && e.fx === 'spinyDown'),
    ).toBe(true);
    const after = run(honked.state, 5 * 60);
    expect(hitsBy([...over.events, ...honked.events, ...after.events], SPINY)).toEqual([]);
    expect(after.state.karts[0]!.spinTimer).toBe(0);
    expect(after.state.karts[0]!.item.held).toBeNull();
  });

  it('too early (the spiny out of reach), and the user is blown up anyway', () => {
    const honked = press(mk8HornVsSpiny(1));
    expect(spinies(honked.state)).toHaveLength(1);
    const done = runUntil(honked.state, exploded, 10 * 60);
    expect(hitsBy(done.events, SPINY)).toContain(0);
  });

  it('destroys bananas and shells near the user, and spins out karts near it', () => {
    const state = mk8HornVsSpiny(1);
    state.entities = state.entities.filter((e) => e.kind !== 'item');
    const user = state.karts[0]!;
    const p = user.position;
    const near = (dx: number, dz: number) => ({ x: p.x + dx, y: p.y, z: p.z + dz });
    const far = tuning.mk8.hornRadius + 3;
    let id = 1000;
    const banana = (x: number, z: number) =>
      state.entities.push({
        id: (id += 1),
        kind: 'banana',
        position: near(x, z),
        from: near(x, z),
        flightTimer: 0,
        ownerId: 1,
        ownerImmune: 0,
      });
    const shell = (x: number, z: number) =>
      state.entities.push({
        id: (id += 1),
        kind: 'shell',
        colour: 'green',
        position: near(x, z),
        direction: { x: 1, z: 0 },
        speed: 0,
        bounces: 0,
        life: 999,
        ownerId: 1,
        ownerImmune: 0,
        targetId: -1,
      });
    banana(3, 2);
    banana(far, 0);
    shell(-4, 4);
    shell(0, -far);
    // The other kart, parked beside the user.
    state.karts[1]!.position = near(4, 0);
    const before = state.entities.filter((e) => e.kind === 'banana' || e.kind === 'shell');
    expect(before).toHaveLength(4);

    const events: SimEvent[] = [];
    const honked = press(state);
    events.push(...honked.events);
    const left = honked.state.entities.filter((e) => e.kind === 'banana' || e.kind === 'shell');
    expect(left.map((e) => e.id).sort()).toEqual([before[1]!.id, before[3]!.id].sort());
    expect(hitsBy(events, HORN)).toEqual([1]);
    expect(honked.state.karts[0]!.spinTimer).toBe(0);
    // The shockwave is drawn round the user for a moment.
    expect(honked.state.entities.some((e) => e.kind === 'item' && e.spec === HORN_WAVE)).toBe(true);
    const later = run(honked.state, Math.round(tuning.mk8.hornWaveSeconds * 60) + 2);
    expect(later.state.entities.some((e) => e.kind === 'item' && e.spec === HORN_WAVE)).toBe(false);
  });

  it("knocks out another kart's triple shells for good", () => {
    const state = mk8HornVsSpiny(1);
    state.entities = state.entities.filter((e) => e.kind !== 'item');
    const other = state.karts[1]!;
    other.position = { ...state.karts[0]!.position, x: state.karts[0]!.position.x + 3 };
    other.item.held = 'triple-green';
    other.item.uses = 3;
    const ready = run(state, 1).state;
    expect(ready.entities.filter((e) => e.kind === 'item' && e.ownerId === 1)).toHaveLength(3);
    const honked = press(ready);
    const after = run(honked.state, 3).state;
    expect(after.entities.filter((e) => e.kind === 'item' && e.ownerId === 1)).toHaveLength(0);
    expect(after.karts[1]!.item.held).toBeNull();
  });
});
