import { beforeAll, describe, expect, it } from 'vitest';
import { mk8Bobomb, mk8FireFlower } from '../../../scenarios/mk8/items';
import { kartOnTrack } from '../../../scenarios/tracks';
import { forwardFromHeading } from '../../../sim/math';
import { step } from '../../../sim/step';
import { getTrack, groundAt } from '../../../sim/track';
import { TICK_RATE, tuning } from '../../../sim/tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemEntity,
  type SimEvent,
  type SimState,
} from '../../../sim/types';
import { registerMk8Content } from '../../register';
import { BOBOMB, BOBOMB_BLAST, bobombFlying } from './bob-omb/sim';
import { FIRE, FIREBALL } from './fire-flower/sim';

beforeAll(() => {
  registerMk8Content();
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

/** Presses and releases the item button once (2 ticks), the player with `input` too. */
function press(state: SimState, input: Partial<InputFrame> = {}) {
  const down = run(state, 1, { ...input, item: true });
  const up = run(down.state, 1, input);
  return { state: up.state, events: [...down.events, ...up.events] };
}

const ofSpec = (s: SimState, spec: string) =>
  s.entities.filter((e): e is ItemEntity => e.kind === 'item' && e.spec === spec);
const hitsBy = (events: SimEvent[], kind: string) =>
  events.flatMap((e) => (e.type === 'kartHit' && e.kind === kind ? [e.kartId] : []));
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
const ticks = (seconds: number) => Math.round(seconds * TICK_RATE);

describe('Bob-omb (MK-114)', () => {
  it('is thrown forward, lands ahead and explodes after the fuse', () => {
    const start = mk8Bobomb(1);
    const from = start.karts[0]!.position;
    const forward = forwardFromHeading(start.karts[0]!.heading);
    const thrown = press(start);
    expect(thrown.state.karts[0]!.item.held).toBeNull();
    const [flying] = ofSpec(thrown.state, BOBOMB);
    expect(flying && bobombFlying(flying)).toBe(true);
    // Up in its arc on the way.
    const mid = run(thrown.state, ticks(tuning.mk8.bobombFlightSeconds / 2) - 2).state;
    const [up] = ofSpec(mid, BOBOMB);
    expect(up!.position.y).toBeGreaterThan(from.y + tuning.mk8.bobombArcHeight * 0.8);

    const landed = run(thrown.state, ticks(tuning.mk8.bobombFlightSeconds)).state;
    const [bobomb] = ofSpec(landed, BOBOMB);
    expect(bobomb && bobombFlying(bobomb)).toBe(false);
    expect(flat(bobomb!.position, from)).toBeCloseTo(tuning.mk8.bobombThrowDistance, 0);
    // Ahead of the kart, and on the road.
    const ahead =
      (bobomb!.position.x - from.x) * forward.x + (bobomb!.position.z - from.z) * forward.z;
    expect(ahead).toBeGreaterThan(tuning.mk8.bobombThrowDistance * 0.95);
    expect(bobomb!.position.y).toBeCloseTo(
      groundAt(getTrack(landed.trackId), bobomb!.position).height,
      1,
    );

    // Not before the fuse runs out (1 tick of the press is gone already)…
    const fuse = ticks(tuning.mk8.bobombFuse);
    const before = run(thrown.state, fuse - 3);
    expect(ofSpec(before.state, BOBOMB)).toHaveLength(1);
    expect(ofSpec(before.state, BOBOMB_BLAST)).toHaveLength(0);
    // …then it goes off where it landed.
    const after = run(before.state, 3);
    expect(ofSpec(after.state, BOBOMB)).toHaveLength(0);
    const [blast] = ofSpec(after.state, BOBOMB_BLAST);
    expect(flat(blast!.position, bobomb!.position)).toBeLessThan(0.01);
    expect(
      after.events.some((e) => e.type === 'itemFx' && e.item === BOBOMB && e.fx === 'explode'),
    ).toBe(true);
  });

  it('hits karts within the blast radius (thrown up) and not those outside', () => {
    const thrown = press(mk8Bobomb(1));
    const done = run(thrown.state, ticks(tuning.mk8.bobombFuse) + 5);
    const hit = hitsBy([...thrown.events, ...done.events], BOBOMB);
    // Karts 1 and 2 are 4 m either side of where it lands, kart 3 12 m beyond, the player 20 m back.
    expect(hit.sort()).toEqual([1, 2]);
    for (const id of [1, 2]) {
      const kart = done.state.karts[id]!;
      expect(kart.spinTimer).toBeGreaterThan(0);
    }
    expect(done.state.karts[3]!.spinTimer).toBe(0);
    expect(done.state.karts[0]!.spinTimer).toBe(0);
    // Thrown up: higher than they were parked.
    const launched = run(thrown.state, ticks(tuning.mk8.bobombFuse) + 1).state;
    expect(launched.karts[1]!.velocity.y).toBeGreaterThan(0);
    expect(launched.karts[1]!.grounded).toBe(false);
  });

  it('karts driving into the blast while it is up are hit too', () => {
    const thrown = press(mk8Bobomb(1));
    const exploded = run(thrown.state, ticks(tuning.mk8.bobombFuse));
    expect(ofSpec(exploded.state, BOBOMB_BLAST)).toHaveLength(1);
    const [blast] = ofSpec(exploded.state, BOBOMB_BLAST);
    // Kart 3 "drives in": put next to the blast.
    const s = structuredClone(exploded.state);
    s.karts[3]!.position = { ...blast!.position, x: blast!.position.x + 2 };
    const next = run(s, 2);
    expect(hitsBy(next.events, BOBOMB)).toContain(3);
  });

  it('explodes at once when a kart touches it', () => {
    const thrown = press(mk8Bobomb(1));
    const landed = run(thrown.state, ticks(tuning.mk8.bobombFlightSeconds)).state;
    const [bobomb] = ofSpec(landed, BOBOMB);
    const s = structuredClone(landed);
    s.karts[3]!.position = { ...bobomb!.position };
    const touched = run(s, 1);
    expect(ofSpec(touched.state, BOBOMB)).toHaveLength(0);
    expect(ofSpec(touched.state, BOBOMB_BLAST)).toHaveLength(1);
    expect(hitsBy(touched.events, BOBOMB).sort()).toEqual([1, 2, 3]);
  });

  it('its thrower driving into one it threw ahead does not set it off', () => {
    const thrown = press(mk8Bobomb(1));
    const landed = run(thrown.state, ticks(tuning.mk8.bobombOwnerImmuneSeconds) + 5).state;
    const [bobomb] = ofSpec(landed, BOBOMB);
    const s = structuredClone(landed);
    s.karts[0]!.position = { ...bobomb!.position };
    const next = run(s, 2);
    expect(ofSpec(next.state, BOBOMB)).toHaveLength(1);
    expect(ofSpec(next.state, BOBOMB_BLAST)).toHaveLength(0);
  });

  it('a dropped one is set off by its owner once the owner is no longer immune', () => {
    const dropped = press(mk8Bobomb(1), { brake: 1 });
    const later = run(dropped.state, ticks(tuning.mk8.bobombOwnerImmuneSeconds) + 2).state;
    const [bobomb] = ofSpec(later, BOBOMB);
    const s = structuredClone(later);
    s.karts[0]!.position = { ...bobomb!.position };
    const next = run(s, 1);
    expect(hitsBy(next.events, BOBOMB)).toContain(0);
  });

  it('is dropped just behind while braking', () => {
    const start = mk8Bobomb(1);
    const from = start.karts[0]!.position;
    const forward = forwardFromHeading(start.karts[0]!.heading);
    const dropped = press(start, { brake: 1 });
    const [bobomb] = ofSpec(dropped.state, BOBOMB);
    const behind =
      (bobomb!.position.x - from.x) * forward.x + (bobomb!.position.z - from.z) * forward.z;
    expect(behind).toBeCloseTo(-tuning.mk8.bobombDropDistance, 0);
  });
});

describe('Fire Flower (MK-114)', () => {
  it('shoots a fireball per press within its time, and none after', () => {
    let s = mk8FireFlower(1);
    for (let i = 1; i <= 3; i += 1) {
      const r = press(s);
      s = r.state;
      expect(r.events.filter((e) => e.type === 'itemUsed' && e.item === FIRE)).toHaveLength(1);
      expect(s.karts[0]!.item.held).toBe(FIRE);
      expect(s.karts[0]!.item.uses).toBe(tuning.mk8.fireShots - i);
    }
    // Its time runs out: the slot empties, and a press shoots nothing.
    s = run(s, ticks(tuning.mk8.fireTime)).state;
    expect(s.karts[0]!.item.held).toBeNull();
    const fireballs = ofSpec(s, FIREBALL).length;
    s = press(s).state;
    expect(ofSpec(s, FIREBALL)).toHaveLength(fireballs);
  });

  it('shoots at most fireShots fireballs, then the slot empties', () => {
    let s = mk8FireFlower(1);
    let shot = 0;
    for (let i = 0; i < tuning.mk8.fireShots + 2; i += 1) {
      const r = press(s);
      shot += r.events.filter((e) => e.type === 'itemUsed' && e.item === FIRE).length;
      s = r.state;
    }
    expect(shot).toBe(tuning.mk8.fireShots);
    expect(s.karts[0]!.item.held).toBeNull();
    expect(s.karts[0]!.effects.some((e) => e.kind === FIRE)).toBe(false);
  });

  it("a new flower's first shot starts its own timer, whatever an old one left", () => {
    // Two shots, then the flower is lost (lightning) with its timer still running.
    let s = press(press(mk8FireFlower(1)).state).state;
    s.karts[0]!.item.held = null;
    s.karts[0]!.item.uses = 0;
    s = run(s, ticks(tuning.mk8.fireTime / 2)).state;
    // A new one: its first shot, then most of its own time later it's still held.
    s.karts[0]!.item.held = FIRE;
    s.karts[0]!.item.uses = tuning.mk8.fireShots;
    s = press(s).state;
    s = run(s, ticks(tuning.mk8.fireTime) - 10).state;
    expect(s.karts[0]!.item.held).toBe(FIRE);
    s = run(s, 20).state;
    expect(s.karts[0]!.item.held).toBeNull();
  });

  it('spins out the first kart it hits, and is gone', () => {
    const shot = press(mk8FireFlower(1));
    expect(ofSpec(shot.state, FIREBALL)).toHaveLength(1);
    const done = run(shot.state, ticks(1.5));
    expect(hitsBy(done.events, FIRE)).toEqual([1]);
    expect(done.state.karts[1]!.spinTimer).toBeGreaterThan(0);
    expect(ofSpec(done.state, FIREBALL)).toHaveLength(0);
  });

  it('shoots behind while braking', () => {
    const start = mk8FireFlower(1);
    const forward = forwardFromHeading(start.karts[0]!.heading);
    const shot = press(start, { brake: 1 });
    const [ball] = ofSpec(shot.state, FIREBALL);
    expect(ball!.direction.x * forward.x + ball!.direction.z * forward.z).toBeCloseTo(-1, 5);
  });

  it('bounces off walls and disappears after a few bounces', () => {
    // Steeply across the road, so it meets a wall about once a second.
    const state = kartOnTrack(1, 'sunny-circuit', 0.02, { headingOffset: -0.4 * Math.PI });
    state.karts[0]!.item.held = FIRE;
    state.karts[0]!.item.uses = tuning.mk8.fireShots;
    let s = press(state).state;
    const life = ticks(tuning.mk8.fireballLifeSeconds);
    let maxBounces = 0;
    let lastAge = 0;
    for (let i = 0; i < life && ofSpec(s, FIREBALL).length; i += 1) {
      const [ball] = ofSpec(s, FIREBALL);
      maxBounces = Math.max(maxBounces, ball!.bounces);
      lastAge = ball!.age;
      s = run(s, 1).state;
    }
    expect(maxBounces).toBe(tuning.mk8.fireballBounces);
    expect(ofSpec(s, FIREBALL)).toHaveLength(0);
    // Gone from its bounces, not its life running out.
    expect(lastAge).toBeLessThan(life);
  });
});
