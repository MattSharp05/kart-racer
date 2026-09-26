import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { MSG, applySnapshot, decodeMessage, encodeSnapshot } from '../../../net/protocol';
import { aiItemInput } from '../../../sim/ai/items';
import { giveItem } from '../../../sim/items';
import { applyEffect, getEffect } from '../../../sim/items/effects';
import { forwardFromHeading } from '../../../sim/math';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { trackGeometry } from '../../../sim/track';
import { tuning } from '../../../sim/tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemEntity,
  type SimEvent,
  type SimState,
} from '../../../sim/types';
import { sunnyCircuit } from '../../tracks/sunny-circuit/sim';
import { SHIELD_TICKS } from '../bubble-shield/sim';
import { PHASE_TICKS } from '../phase/sim';
import { GAP } from './scenarios';
import boomerang, {
  BACK_OUT_TICKS,
  BOOMERANG_RADIUS,
  LIFE_TICKS,
  OUT_TICKS,
  THROWS,
  hitOnThisThrow,
  throwBoomerang,
  throwNumber,
} from './sim';

type Inputs = Partial<InputFrame> | ((state: SimState) => Partial<InputFrame>);

/**
 * Steps `ticks` ticks with kart 0 on `input` (the AI drives itself), collecting events. `each`
 * runs on the state after every tick (to move karts about).
 */
function run(state: SimState, ticks: number, input: Inputs = {}, each?: (s: SimState) => void) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const frame = typeof input === 'function' ? input(state) : input;
    const result = step(state, [{ ...NEUTRAL_INPUT, ...frame }]);
    state = result.state;
    events.push(...result.events);
    each?.(state);
  }
  return { state, events };
}

const flying = (state: SimState) =>
  state.entities.filter(
    (e): e is ItemEntity => e.kind === 'item' && e.spec.startsWith('boomerang'),
  );
const hitsOn = (events: readonly SimEvent[], kartId: number) =>
  events.filter((e) => e.type === 'kartHit' && e.kartId === kartId && e.kind === 'boomerang');
const catches = (events: readonly SimEvent[]) =>
  events.filter((e) => e.type === 'itemFx' && e.item === 'boomerang' && e.fx === 'catch');

/** Keeps a kart hittable (no spin-out, no invulnerability): only the boomerang's own rule stops a second hit. */
function hittable(kart: SimState['karts'][number]) {
  kart.spinTimer = 0;
  kart.invulnerableTimer = 0;
}

/** The test pad: kart 0 (the thrower) driving along −Z at 15 m/s, holding a Boomerang, and kart 1 far off. */
function pad(): SimState {
  const state = createSimState({
    seed: 1,
    karts: [{ speed: 15 }, { position: { x: 200, y: 0, z: 0 } }],
  });
  giveItem(state.karts[0]!, 'boomerang');
  return state;
}

/** Throws (a 1-tick press) and lets go of the button. */
function throwIt(state: SimState, input: Partial<InputFrame> = { throttle: 1 }) {
  const thrown = run(state, 1, { ...input, item: true });
  return { state: thrown.state, events: thrown.events };
}

describe('Boomerang (MK-69)', () => {
  it('flies out straight, turns back and is caught at the thrower’s moving position', () => {
    let { state } = throwIt(pad());
    const start = state.karts[0]!.position;
    expect(state.karts[0]!.item.held).toBeNull();
    const [thrown] = flying(state);
    expect(thrown).toBeDefined();
    expect(throwNumber(thrown!)).toBe(1);
    // Out: straight ahead (−Z) for OUT_TICKS, about 40 m.
    state = run(state, OUT_TICKS - 1, { throttle: 1 }).state;
    const out = flying(state)[0]!;
    expect(out.returning).toBe(0);
    expect(Math.abs(out.position.x - start.x)).toBeLessThan(0.01);
    const outward = Math.hypot(out.position.x - start.x, out.position.z - start.z);
    expect(outward).toBeGreaterThan(35);
    expect(outward).toBeLessThan(45);

    // Back: the thrower swerves hard left the whole time; it still comes back to them.
    const swerve = { throttle: 1, steer: -1 };
    let caughtAt: { x: number; z: number } | undefined;
    let events: SimEvent[] = [];
    for (let i = 0; i < LIFE_TICKS && !caughtAt; i += 1) {
      const before = flying(state)[0];
      const next = run(state, 1, swerve);
      state = next.state;
      events = next.events;
      if (catches(events).length) caughtAt = before?.position;
      else expect(flying(state)).toHaveLength(1);
    }
    expect(caughtAt).toBeDefined();
    const you = state.karts[0]!.position;
    // Caught within its touch radius of where the thrower is now (plus one tick of travel).
    const step1 = (tuning.topSpeed[100] * 1.8) / 60;
    expect(Math.hypot(you.x - caughtAt!.x, you.z - caughtAt!.z)).toBeLessThan(
      BOOMERANG_RADIUS + step1 + 0.5,
    );
    // …which is well off the straight line it was thrown along.
    expect(Math.abs(you.x - start.x)).toBeGreaterThan(5);
    expect(flying(state)).toHaveLength(0);
  });

  it('on the way back it heads for the thrower wherever they are now', () => {
    let { state } = throwIt(pad());
    state = run(state, OUT_TICKS + 30, { throttle: 1 }).state;
    const b = flying(state)[0]!;
    expect(b.returning).toBe(1);
    // Move the thrower 30 m to the side: within a few ticks it's heading their way.
    const you = state.karts[0]!;
    you.position = { x: b.position.x + 30, y: 0, z: b.position.z };
    you.velocity = { x: 0, y: 0, z: 0 };
    you.speed = 0;
    state = run(state, 20, { brake: 1 }).state;
    const after = flying(state)[0]!;
    const want = Math.atan2(
      state.karts[0]!.position.z - after.position.z,
      state.karts[0]!.position.x - after.position.x,
    );
    const have = Math.atan2(after.direction.z, after.direction.x);
    expect(Math.abs(Math.atan2(Math.sin(want - have), Math.cos(want - have)))).toBeLessThan(0.1);
  });

  it('a catch allows exactly one more throw; the second is gone for good', () => {
    const pickup = pad();
    expect(pickup.karts[0]!.item.uses).toBe(THROWS);
    let { state } = throwIt(pickup);
    let caught = run(state, LIFE_TICKS, { throttle: 1 });
    expect(catches(caught.events)).toHaveLength(1);
    state = caught.state;
    expect(state.karts[0]!.item).toMatchObject({ held: 'boomerang', uses: 1 });

    // The second throw: the slot empties, and catching it gives nothing back.
    state = throwIt(state).state;
    expect(state.karts[0]!.item).toMatchObject({ held: null, uses: 0 });
    expect(throwNumber(flying(state)[0]!)).toBe(2);
    caught = run(state, LIFE_TICKS, { throttle: 1 });
    expect(catches(caught.events)).toHaveLength(1);
    state = caught.state;
    expect(state.karts[0]!.item.held).toBeNull();
    expect(flying(state)).toHaveLength(0);
    // Pressing again does nothing.
    const again = throwIt(state);
    expect(flying(again.state)).toHaveLength(0);
    expect(again.events.some((e) => e.type === 'itemUsed')).toBe(false);
  });

  it('without a catch there is no second throw', () => {
    let { state } = throwIt(pad());
    // The thrower vanishes far away: it can't be caught, and is gone within 4 s.
    state.karts[0]!.position = { x: -500, y: 0, z: 500 };
    // Spawned with age 0, it lives LIFE_TICKS ticks.
    const later = run(state, LIFE_TICKS + 1, { throttle: 0 });
    expect(catches(later.events)).toHaveLength(0);
    expect(flying(later.state)).toHaveLength(0);
    expect(later.state.karts[0]!.item.held).toBeNull();
  });

  it('a caught first throw only refills an empty slot', () => {
    let { state } = throwIt(pad());
    state.karts[0]!.item = { ...state.karts[0]!.item, held: 'banana', uses: 1 };
    const caught = run(state, LIFE_TICKS, { throttle: 1 });
    expect(catches(caught.events)).toHaveLength(1);
    expect(caught.state.karts[0]!.item).toMatchObject({ held: 'banana', uses: 1 });
  });

  it('flying past the thrower on the way back is a miss: it’s gone', () => {
    let { state } = throwIt(pad());
    state = run(state, OUT_TICKS + 40, { throttle: 1 }).state;
    const b = flying(state)[0]!;
    // It's coming back, facing the thrower…
    expect(b.returning).toBe(1);
    expect(b.data[1]).toBe(1);
    // …and the thrower is suddenly just behind it, out of reach: it has flown past them.
    state.karts[0]!.position = {
      x: b.position.x - b.direction.x * 5 + b.direction.z * 3,
      y: 0,
      z: b.position.z - b.direction.z * 5 - b.direction.x * 3,
    };
    const next = run(state, 1, { throttle: 0 });
    expect(flying(next.state)).toHaveLength(0);
    expect(catches(next.events)).toHaveLength(0);
  });

  it('each throw is gone 4 s after it leaves the hand', () => {
    const state = pad();
    const b = throwBoomerang(state.karts[0]!, state, 2, false);
    // Keep the thrower out of reach so it can't be caught.
    state.karts[0]!.position = { x: 0, y: 0, z: 1000 };
    b.returning = 0;
    let s = run(state, LIFE_TICKS, {}, (st) => {
      const e = flying(st)[0];
      // Pin it out, facing away (no miss, no catch): only its life ends it.
      if (e) e.returning = 0;
    }).state;
    expect(flying(s)).toHaveLength(1);
    s = run(s, 1).state;
    expect(flying(s)).toHaveLength(0);
  });

  it('thrown backwards while braking: leaves behind you, flying the other way, and comes back', () => {
    const state = pad();
    const forward = forwardFromHeading(state.karts[0]!.heading);
    const thrown = throwIt(state, { brake: 1 });
    const b = flying(thrown.state)[0]!;
    expect(b.spec).toBe('boomerang-back');
    expect(b.direction.x * forward.x + b.direction.z * forward.z).toBeCloseTo(-1, 3);
    const you = thrown.state.karts[0]!.position;
    expect((b.position.x - you.x) * forward.x + (b.position.z - you.z) * forward.z).toBeLessThan(0);
    const later = run(thrown.state, BACK_OUT_TICKS + 1, { throttle: 1 });
    expect(flying(later.state)[0]!.returning).toBe(1);
    const back = run(later.state, LIFE_TICKS, { throttle: 1 });
    expect(catches(back.events)).toHaveLength(1);
    expect(back.state.karts[0]!.item.held).toBe('boomerang');
  });

  it('a wall turns it back early', () => {
    // On Sunny's main straight, thrown straight at the right-hand wall.
    const state = scenarios.get('item-boomerang')!.setup(1).state;
    const you = state.karts[0]!;
    you.heading += Math.PI / 2;
    you.velocity = { x: 0, y: 0, z: 0 };
    you.speed = 0;
    let s = throwIt(state, {}).state;
    let bounced = -1;
    for (let i = 1; i < OUT_TICKS && bounced < 0; i += 1) {
      s = run(s, 1).state;
      const b = flying(s)[0];
      if (b && b.bounces > 0) {
        bounced = i;
        expect(b.returning).toBe(1);
      }
    }
    expect(bounced).toBeGreaterThan(0);
    expect(bounced).toBeLessThan(OUT_TICKS);
    const back = run(s, LIFE_TICKS);
    expect(catches(back.events)).toHaveLength(1);
  });

  describe('hits', () => {
    /** The pad with kart 1 `metres` straight ahead of the thrower, standing still. */
    function withTarget(metres: number): SimState {
      const state = pad();
      state.karts[0]!.speed = 0;
      state.karts[0]!.velocity = { x: 0, y: 0, z: 0 };
      state.karts[1]!.position = { x: 0, y: 0, z: -metres };
      return state;
    }

    it('spins out a kart on the way out (a green shell’s hit) and flies on', () => {
      const { state } = throwIt(withTarget(12), {});
      const out = run(state, 30);
      expect(hitsOn(out.events, 1)).toHaveLength(1);
      expect(out.state.karts[1]!.spinTimer).toBeGreaterThan(0);
      expect(flying(out.state)).toHaveLength(1);
      expect(hitOnThisThrow(flying(out.state)[0]!)).toEqual([1]);
    });

    it('hits a kart on the way back too', () => {
      let { state } = throwIt(withTarget(200), {});
      state = run(state, OUT_TICKS + 30).state;
      const b = flying(state)[0]!;
      expect(b.returning).toBe(1);
      // Kart 1 right in its way home.
      state.karts[1]!.position = {
        x: b.position.x + b.direction.x * 4,
        y: 0,
        z: b.position.z + b.direction.z * 4,
      };
      const back = run(state, 10);
      expect(hitsOn(back.events, 1)).toHaveLength(1);
    });

    it('hits each kart at most once per throw, and again on the next throw', () => {
      let { state } = throwIt(withTarget(12), {});
      // Kart 1 keeps getting in its way, always hittable: still only one hit this throw.
      const glue = (s: SimState) => {
        const b = flying(s)[0];
        const target = s.karts[1]!;
        hittable(target);
        if (b) target.position = { ...b.position };
      };
      const first = run(state, LIFE_TICKS, {}, glue);
      expect(hitsOn(first.events, 1)).toHaveLength(1);
      expect(catches(first.events)).toHaveLength(1);
      state = first.state;
      // The second throw is a new throw: it can hit kart 1 again (once).
      state = throwIt(state, {}).state;
      const second = run(state, LIFE_TICKS, {}, glue);
      expect(hitsOn(second.events, 1)).toHaveLength(1);
    });

    it('never hits its thrower, on the way out or back', () => {
      let { state, events } = throwIt(withTarget(200), {});
      // The thrower sits on it for its whole outward flight (hittable): no hit, no catch.
      const out = run(state, OUT_TICKS - 2, {}, (s) => {
        const b = flying(s)[0];
        const you = s.karts[0]!;
        hittable(you);
        if (b) you.position = { ...b.position };
      });
      events = [...events, ...out.events];
      expect(hitsOn(events, 0)).toHaveLength(0);
      expect(catches(events)).toHaveLength(0);
      expect(flying(out.state)).toHaveLength(1);
      state = out.state;
      const back = run(state, LIFE_TICKS);
      expect(hitsOn(back.events, 0)).toHaveLength(0);
      expect(back.state.karts[0]!.spinTimer).toBe(0);
    });

    it('is blocked by a Bubble Shield: the bubble pops, no spin-out, and no second hit', () => {
      const state = withTarget(12);
      applyEffect(state.karts[1]!, 'bubble-shield', SHIELD_TICKS, state, []);
      const out = run(throwIt(state, {}).state, LIFE_TICKS, {}, (s) => {
        const b = flying(s)[0];
        if (b?.returning) s.karts[1]!.position = { ...b.position };
        hittable(s.karts[1]!);
      });
      expect(hitsOn(out.events, 1)).toHaveLength(0);
      expect(out.events).toContainEqual({
        type: 'itemFx',
        kartId: 1,
        item: 'bubble-shield',
        fx: 'pop',
      });
      expect(getEffect(out.state.karts[1]!, 'bubble-shield')).toBeUndefined();
      expect(out.state.karts[1]!.spinTimer).toBe(0);
    });

    it('passes through a phased kart untouched', () => {
      const state = withTarget(12);
      applyEffect(state.karts[1]!, 'phase', PHASE_TICKS, state, []);
      const out = run(throwIt(state, {}).state, 30);
      expect(hitsOn(out.events, 1)).toHaveLength(0);
      expect(out.state.karts[1]!.spinTimer).toBe(0);
      expect(hitOnThisThrow(flying(out.state)[0]!)).toEqual([]);
    });
  });

  it('item-boomerang: an outbound hit on the AI ahead, then the catch', () => {
    const state = scenarios.get('item-boomerang')!.setup(1).state;
    expect(GAP).toBe(15);
    const thrown = throwIt(state);
    const flight = run(thrown.state, LIFE_TICKS, { throttle: 1 });
    expect(hitsOn(flight.events, 1)).toHaveLength(1);
    expect(hitsOn(flight.events, 0)).toHaveLength(0);
    expect(catches(flight.events)).toHaveLength(1);
    const hitAt = flight.events.findIndex((e) => e.type === 'kartHit');
    const caughtAt = flight.events.findIndex((e) => e.type === 'itemFx' && e.fx === 'catch');
    expect(hitAt).toBeLessThan(caughtAt);
    expect(flight.state.karts[0]!.item).toMatchObject({ held: 'boomerang', uses: 1 });
  });

  it('rides in the online snapshot (spec, returning, hit list)', () => {
    let { state } = throwIt(scenarios.get('item-boomerang')!.setup(1).state);
    state = run(state, OUT_TICKS + 5, { throttle: 1 }).state;
    const b = flying(state)[0]!;
    expect(b.returning).toBe(1);
    expect(hitOnThisThrow(b)).toEqual([1]);
    const msg = decodeMessage(encodeSnapshot(state, 0, []));
    if (msg.type !== MSG.snapshot) throw new Error('not a snapshot');
    const copy = applySnapshot(structuredClone(state), msg.tick, msg.bytes);
    const got = flying(copy)[0]!;
    expect(got).toMatchObject({ spec: 'boomerang', returning: 1, age: b.age, data: b.data });
  });

  it('is deterministic', () => {
    const go = () =>
      run(throwIt(scenarios.get('item-boomerang')!.setup(3).state).state, 200, { throttle: 1 })
        .state;
    expect(JSON.stringify(go())).toEqual(JSON.stringify(go()));
  }, 30_000);

  describe('AI', () => {
    const geometry = trackGeometry(sunnyCircuit);
    const line = sunnyCircuit.aiLine ?? [];
    /** The scenario with the roles swapped: the AI (kart 1) holds it, you `metres` ahead of it. */
    function aiHolding(metres: number, sideways = 0): SimState {
      const state = scenarios.get('item-boomerang')!.setup(1).state;
      const [you, ai] = [state.karts[0]!, state.karts[1]!];
      you.item = { ...you.item, held: null, uses: 0 };
      ai.position = { ...you.position };
      ai.heading = you.heading;
      const f = forwardFromHeading(ai.heading);
      you.position = {
        x: ai.position.x + f.x * metres - f.z * sideways,
        y: ai.position.y,
        z: ai.position.z + f.z * metres + f.x * sideways,
      };
      giveItem(ai, 'boomerang');
      ai.ai!.itemDelay = 0;
      return state;
    }
    const decide = (state: SimState) =>
      aiItemInput(state.karts[1]!, state.karts[1]!.ai!, state, geometry, line, 1 / 60, () => 0)
        .item ?? false;

    it('throws at a kart 10–40 m ahead in line', () => {
      expect(decide(aiHolding(12))).toBe(true);
      expect(decide(aiHolding(38))).toBe(true);
      expect(decide(aiHolding(25, 1.5))).toBe(true);
    });

    it('holds it when the kart ahead is too close, too far or off the line', () => {
      expect(decide(aiHolding(6))).toBe(false);
      expect(decide(aiHolding(50))).toBe(false);
      expect(decide(aiHolding(25, 8))).toBe(false);
    });
  });

  it('is in the roulette for front and mid places', () => {
    expect(boomerang.odds.slice(0, 5).every((w) => w > 0)).toBe(true);
    expect(boomerang.odds.slice(6)).toEqual([0, 0]);
  });
});
