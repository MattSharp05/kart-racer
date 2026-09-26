import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { giveItem } from '../../../sim/items';
import { applyEffect, effectsSpeedFactor, getEffect, hasEffect } from '../../../sim/items/effects';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { PHASE_TICKS } from '../phase/sim';
import { SHIELD_TICKS } from '../bubble-shield/sim';
import magnet, {
  MAGNET_BONUS_FAR,
  MAGNET_BONUS_NEAR,
  MAGNET_RANGE,
  MAGNET_TICKS,
  magnetTarget,
} from './sim';

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

const gap = (state: SimState) =>
  Math.hypot(
    state.karts[1]!.position.x - state.karts[0]!.position.x,
    state.karts[1]!.position.z - state.karts[0]!.position.z,
  );

/** The test pad (flat, no track): kart 0 at the origin facing −Z, kart 1 `ahead` m in front. */
function pair(ahead: number): SimState {
  return createSimState({ seed: 1, karts: [{}, { position: { x: 0, y: 0, z: -ahead } }] });
}

/** Kart 0 magnetised; kart 1 right in front of it, touching, holding a Mushroom. */
function touching(): SimState {
  const state = pair(1.8);
  giveItem(state.karts[1]!, 'mushroom');
  applyEffect(state.karts[0]!, 'magnet', MAGNET_TICKS, state, [], { data: [-1, 1] });
  return state;
}

describe('Magnet (MK-68)', () => {
  it('item-magnet: pulls you to the kart ahead, takes its item on contact and ends', () => {
    const start = scenarios.get('item-magnet')!.setup(1).state;
    expect(start.karts[1]!.item.held).toBe('mushroom');
    let { state, events } = run(start, 1, { throttle: 1, item: true });
    expect(state.karts[0]!.effects.map((e) => e.kind)).toEqual(['magnet']);
    expect(state.karts[0]!.item.held).toBeNull();
    let ticks = 1;
    while (hasEffect(state.karts[0]!, 'magnet') && ticks < MAGNET_TICKS + 5) {
      const next = run(state, 1, { throttle: 1 });
      state = next.state;
      events = [...events, ...next.events];
      ticks += 1;
    }
    expect(ticks).toBeLessThan(MAGNET_TICKS);
    expect(state.karts[0]!.item.held).toBe('mushroom');
    expect(state.karts[1]!.item.held).toBeNull();
    const fx = events.filter((e) => e.type === 'itemFx' && e.item === 'magnet');
    expect(fx).toEqual([
      { type: 'itemFx', kartId: 0, item: 'magnet', fx: 'steal' },
      { type: 'itemFx', kartId: 1, item: 'magnet', fx: 'stolen' },
    ]);
    // Not a hit.
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  });

  it('closes the distance faster than without it', () => {
    const start = scenarios.get('item-magnet')!.setup(1).state;
    const pulled = run(run(start, 1, { throttle: 1, item: true }).state, 60, { throttle: 1 });
    const plain = run(run(start, 1, { throttle: 1 }).state, 60, { throttle: 1 });
    expect(hasEffect(pulled.state.karts[0]!, 'magnet')).toBe(true);
    const [closedPulled, closedPlain] = [
      gap(start) - gap(pulled.state),
      gap(start) - gap(plain.state),
    ];
    expect(closedPulled).toBeGreaterThan(closedPlain + 1);
  });

  it('the pull grows as you close in', () => {
    const factorAt = (ahead: number) => {
      const state = pair(ahead);
      applyEffect(state.karts[0]!, 'magnet', MAGNET_TICKS, state, [], { data: [-1, 1] });
      const after = run(state, 1).state;
      return effectsSpeedFactor(after.karts[0]!);
    };
    const far = factorAt(MAGNET_RANGE - 1);
    const near = factorAt(5);
    expect(far).toBeGreaterThan(1 + MAGNET_BONUS_FAR - 0.01);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(1 + MAGNET_BONUS_NEAR);
    // Nobody within range ahead (or only behind): no pull.
    expect(factorAt(MAGNET_RANGE + 5)).toBe(1);
    expect(factorAt(-10)).toBe(1);
  });

  it('ends after 4 s when it never reaches anyone', () => {
    const state = pair(MAGNET_RANGE + 50);
    applyEffect(state.karts[0]!, 'magnet', MAGNET_TICKS, state, [], { data: [-1, 1] });
    const almost = run(state, MAGNET_TICKS - 1).state;
    expect(hasEffect(almost.karts[0]!, 'magnet')).toBe(true);
    expect(hasEffect(run(almost, 1).state.karts[0]!, 'magnet')).toBe(false);
  });

  it('takes the item with its uses left', () => {
    const state = touching();
    giveItem(state.karts[1]!, 'turbo-trio');
    state.karts[1]!.item.uses = 2;
    const after = run(state, 1).state;
    expect(after.karts[0]!.item).toMatchObject({ held: 'turbo-trio', uses: 2 });
    expect(after.karts[1]!.item).toMatchObject({ held: null, uses: 0 });
  });

  it('holding an item already: nothing is taken, but the contact still ends it', () => {
    const state = touching();
    giveItem(state.karts[0]!, 'banana');
    const after = run(state, 1).state;
    expect(after.karts[0]!.item.held).toBe('banana');
    expect(after.karts[1]!.item.held).toBe('mushroom');
    expect(hasEffect(after.karts[0]!, 'magnet')).toBe(false);
  });

  it("can't touch a phased kart (nor steal while phased itself)", () => {
    for (const phased of [0, 1]) {
      const state = touching();
      applyEffect(state.karts[phased]!, 'phase', PHASE_TICKS, state, []);
      const after = run(state, 1).state;
      expect(after.karts[0]!.item.held).toBeNull();
      expect(after.karts[1]!.item.held).toBe('mushroom');
      expect(hasEffect(after.karts[0]!, 'magnet')).toBe(true);
    }
  });

  it("a Bubble Shield doesn't stop the steal (it isn't a hit), and the bubble stays", () => {
    const state = touching();
    applyEffect(state.karts[1]!, 'bubble-shield', SHIELD_TICKS, state, []);
    const { state: after, events } = run(state, 1);
    expect(after.karts[0]!.item.held).toBe('mushroom');
    expect(hasEffect(after.karts[1]!, 'bubble-shield')).toBe(true);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  });

  it('ignores karts that have finished', () => {
    const state = pair(10);
    expect(magnetTarget(state.karts[0]!, state)?.id).toBe(1);
    state.karts[1]!.race.finishTick = 100;
    expect(magnetTarget(state.karts[0]!, state)).toBeUndefined();
  });

  it("doesn't take an item still in the roulette", () => {
    const state = touching();
    state.karts[1]!.item = { ...state.karts[1]!.item, held: null, roulette: 1 };
    const after = run(state, 1).state;
    expect(after.karts[0]!.item.held).toBeNull();
    expect(getEffect(after.karts[0]!, 'magnet')).toBeUndefined();
  });

  it('AI: uses it when a kart is within 40 m ahead', () => {
    const near = scenarios.get('item-magnet')!.setup(1).state;
    const aiUse = magnet.aiUse!;
    expect(aiUse(near.karts[0]!, near)).toBe(true);
    // The kart in front has no one ahead of it.
    expect(aiUse(near.karts[1]!, near)).toBe(false);
    expect(magnetTarget(pair(MAGNET_RANGE + 1).karts[0]!, pair(MAGNET_RANGE + 1))).toBeUndefined();
  });

  it('is deterministic', () => {
    const start = scenarios.get('item-magnet')!.setup(1).state;
    const a = run(run(start, 1, { throttle: 1, item: true }).state, 120, { throttle: 1 });
    const b = run(run(start, 1, { throttle: 1, item: true }).state, 120, { throttle: 1 });
    expect(a.state).toEqual(b.state);
  });
});
