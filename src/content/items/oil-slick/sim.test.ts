import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { applyEffect, getEffect, hasEffect } from '../../../sim/items/effects';
import { spawnEntity } from '../../../sim/items/entities';
import { forwardFromHeading, wrapAngleDelta } from '../../../sim/math';
import { trackGeometry } from '../../../sim/track';
import { tuning } from '../../../sim/tuning';
import { sunnyCircuit } from '../../tracks/sunny-circuit/sim';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemEntity,
  type KartState,
  type SimEvent,
  type SimState,
} from '../../../sim/types';
import oilSlick, { SLICK_TICKS, SLIDE_TICKS } from './sim';

/** Steps `ticks` ticks with kart 0 on `input` (the AI drives itself), collecting events. */
function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(state, [{ ...NEUTRAL_INPUT, ...input }]);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const slicks = (state: SimState) =>
  state.entities.filter((e): e is ItemEntity => e.kind === 'item' && e.spec === 'oil-slick');

/** Angle between where the kart points and where it's going, rad. */
function slipAngle(kart: KartState): number {
  const forward = forwardFromHeading(kart.heading);
  const along = Math.atan2(forward.x, forward.z);
  return Math.abs(wrapAngleDelta(Math.atan2(kart.velocity.x, kart.velocity.z) - along));
}

/** The oil scenario after you drop the slick at full throttle. */
function dropped() {
  const start = scenarios.get('item-oil-slick')!.setup(1).state;
  const pressed = run(start, 1, { throttle: 1, item: true });
  return run(pressed.state, 1, { throttle: 1 });
}

/** A kart on the flat test pad going `speed` m/s along heading 0 (−Z). */
function padKart(speed = 20) {
  return createSimState({ seed: 1, karts: [{ speed }] });
}

describe('Oil Slick (MK-65)', () => {
  it('drops a 3 m puddle behind you, which lasts 15 s', () => {
    let { state } = dropped();
    const [slick] = slicks(state);
    expect(slick).toBeDefined();
    const you = state.karts[0]!;
    const forward = forwardFromHeading(you.heading);
    const toSlick = {
      x: slick!.position.x - you.position.x,
      z: slick!.position.z - you.position.z,
    };
    expect(toSlick.x * forward.x + toSlick.z * forward.z).toBeLessThan(0);
    expect(state.karts[0]!.item.held).toBeNull();

    // Age 1 now; it's still there on its last tick, gone the tick after.
    state = run(state, SLICK_TICKS - 1, { throttle: 1 }).state;
    expect(slicks(state)).toHaveLength(1);
    state = run(state, 1, { throttle: 1 }).state;
    expect(slicks(state)).toHaveLength(0);
  });

  it('the AI behind drives through: it slides for exactly the tuned time, without spinning out, then recovers', () => {
    let { state } = dropped();
    let ticks = 0;
    while (!hasEffect(state.karts[1]!, 'oil-slick') && ticks < 120) {
      const result = run(state, 1, { throttle: 1 });
      state = result.state;
      ticks += 1;
      if (hasEffect(state.karts[1]!, 'oil-slick')) {
        expect(result.events).toContainEqual({
          type: 'itemFx',
          kartId: 1,
          item: 'oil-slick',
          fx: 'slip',
        });
      }
    }
    const ai = state.karts[1]!;
    expect(getEffect(ai, 'oil-slick')).toMatchObject({ ticksLeft: SLIDE_TICKS, by: 0 });
    // The puddle isn't used up by it.
    expect(slicks(state)).toHaveLength(1);

    let maxSlip = 0;
    let slid = 0;
    while (hasEffect(state.karts[1]!, 'oil-slick')) {
      state = run(state, 1, { throttle: 1 }).state;
      slid += 1;
      maxSlip = Math.max(maxSlip, slipAngle(state.karts[1]!));
      expect(state.karts[1]!.spinTimer).toBe(0);
    }
    expect(slid).toBe(SLIDE_TICKS);
    // It visibly slid (the nose swung well off its path)…
    expect(maxSlip).toBeGreaterThan(0.2);
    // …kept most of its speed (no spin-out), and grips again after (clear of the puddle by then).
    expect(state.karts[1]!.speed).toBeGreaterThan(tuning.topSpeed[100] * 0.4);
    state = run(state, 30, { throttle: 1 }).state;
    expect(hasEffect(state.karts[1]!, 'oil-slick')).toBe(false);
    expect(slipAngle(state.karts[1]!)).toBeLessThan(0.1);
  });

  it('loses most grip: steering hard barely turns the kart’s path while it slides', () => {
    /** How far the kart's path turns in `ticks` ticks of full steering. */
    const pathTurn = (oiled: boolean) => {
      let state = padKart();
      if (oiled) applyEffect(state.karts[0]!, 'oil-slick', SLIDE_TICKS, state, []);
      const v0 = state.karts[0]!.velocity;
      state = run(state, 30, { throttle: 1, steer: 1 }).state;
      const v1 = state.karts[0]!.velocity;
      return Math.abs(wrapAngleDelta(Math.atan2(v1.x, v1.z) - Math.atan2(v0.x, v0.z)));
    };
    const normal = pathTurn(false);
    const oiled = pathTurn(true);
    expect(normal).toBeGreaterThan(0.3);
    expect(oiled).toBeLessThan(normal * 0.35);
  });

  it('can’t get its owner in the first second, nor a kart with a star', () => {
    // Owner: parked on its own fresh puddle.
    let state = padKart(0);
    spawnEntity(state, 'oil-slick', state.karts[0]!, { direction: { x: 0, z: -1 } });
    slicks(state)[0]!.position = { ...state.karts[0]!.position };
    state = run(state, 30).state;
    expect(hasEffect(state.karts[0]!, 'oil-slick')).toBe(false);
    state = run(state, 60).state;
    expect(hasEffect(state.karts[0]!, 'oil-slick')).toBe(true);

    // Star: someone else's puddle, no effect.
    let starred = createSimState({ seed: 1, karts: [{}, { position: { x: 30, y: 0, z: 0 } }] });
    starred.karts[0]!.starTimer = 5;
    spawnEntity(starred, 'oil-slick', starred.karts[1]!);
    slicks(starred)[0]!.position = { ...starred.karts[0]!.position };
    starred = run(starred, 5).state;
    expect(hasEffect(starred.karts[0]!, 'oil-slick')).toBe(false);
  });

  it('doesn’t affect a kart whose effect blocks hits (a shield): the shield takes it instead', () => {
    let state = createSimState({ seed: 1, karts: [{}, { position: { x: 30, y: 0, z: 0 } }] });
    // The test kit's shield (MK-52) stands in for any blocking effect (Bubble Shield, Phase).
    applyEffect(state.karts[0]!, 'test-kit-shield', 600, state, [], { data: [1] });
    spawnEntity(state, 'oil-slick', state.karts[1]!);
    slicks(state)[0]!.position = { ...state.karts[0]!.position };
    state = run(state, 2).state;
    const kart = state.karts[0]!;
    expect(hasEffect(kart, 'oil-slick')).toBe(false);
    expect(hasEffect(kart, 'test-kit-shield')).toBe(false);
    expect(kart.invulnerableTimer).toBeGreaterThan(0);
  });

  it('the AI drops it when someone is close behind, not otherwise', () => {
    const state = scenarios.get('item-oil-slick')!.setup(1).state;
    const geometry = trackGeometry(sunnyCircuit);
    const ctx = {
      geometry,
      aheadMetres: (from: number, to: number) => {
        let d = to - from;
        if (d > geometry.length / 2) d -= geometry.length;
        if (d <= -geometry.length / 2) d += geometry.length;
        return d;
      },
    } as unknown as Parameters<typeof oilSlick.aiUse>[2];
    const you = state.karts[0]!;
    const follower = state.karts[1]!;
    // 12 m behind (the scenario).
    expect(oilSlick.aiUse(you, state, ctx)).toBe(true);
    // Far behind.
    follower.position = geometry.pointAt(0.5, 0);
    expect(oilSlick.aiUse(you, state, ctx)).toBe(false);
    // Just ahead instead.
    const t = geometry.project(you.position).t + 8 / geometry.length;
    follower.position = geometry.pointAt(t, 0);
    expect(oilSlick.aiUse(you, state, ctx)).toBe(false);
  });

  it('is deterministic', () => {
    const a = run(dropped().state, 120, { throttle: 1 }).state;
    const b = run(dropped().state, 120, { throttle: 1 }).state;
    expect(a).toEqual(b);
  });
});
