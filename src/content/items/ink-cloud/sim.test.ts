import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { aiInput } from '../../../sim/ai/driver';
import { applyEffect, effectsAiDriving, getEffect, hasEffect } from '../../../sim/items/effects';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { trackGeometry } from '../../../sim/track';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { sunnyCircuit } from '../../tracks/sunny-circuit/sim';
import { INK_BLOTS } from './render';
import { INK_AFTER_SECONDS } from './scenarios';
import inkCloud, {
  INK_BOOST_CLEAR,
  INK_LOOK_AHEAD,
  INK_STEER_NOISE,
  INK_TICKS,
  inkOpacity,
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

const inked = (state: SimState) =>
  state.karts.filter((k) => hasEffect(k, 'ink-cloud')).map((k) => k.id);

/** `item-ink` stepped until the AI at the back has used its Ink Cloud. */
function afterInk(seed = 1) {
  let state = scenarios.get('item-ink')!.setup(seed).state;
  const events: SimEvent[] = [];
  for (let i = 0; i < 4 * 60 && inked(state).length === 0; i += 1) {
    const next = run(state, 1, { throttle: 1 });
    state = next.state;
    events.push(...next.events);
  }
  return { state, events };
}

/** Three karts on the test pad in race order 1, 0, 2 (kart 0 in the middle). */
function field(): SimState {
  const state = createSimState({
    seed: 1,
    karts: [{}, { position: { x: 0, y: 0, z: -10 } }, { position: { x: 0, y: 0, z: 10 } }],
  });
  state.positions = [1, 0, 2];
  return state;
}

describe('Ink Cloud (MK-68)', () => {
  it('item-ink: the AI at the back inks both karts ahead of it, and nobody else', () => {
    const { state, events } = afterInk();
    expect(state.tick).toBeGreaterThanOrEqual(INK_AFTER_SECONDS * 60);
    expect(state.karts[2]!.item.held).toBeNull();
    expect(inked(state).sort()).toEqual([0, 1]);
    expect(getEffect(state.karts[0]!, 'ink-cloud')!.by).toBe(2);
    const splats = events.filter((e) => e.type === 'itemFx' && e.item === 'ink-cloud');
    expect(splats.map((e) => (e.type === 'itemFx' ? e.kartId : -1)).sort()).toEqual([0, 1]);
    // Not a hit.
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  });

  it('only karts ahead of the user are inked', () => {
    const state = field();
    inkCloud.onUse(state.karts[0]!, state, []);
    expect(inked(state)).toEqual([1]);
    // From 1st: nobody.
    const leader = field();
    inkCloud.onUse(leader.karts[1]!, leader, []);
    expect(inked(leader)).toEqual([]);
  });

  it('lasts 4 s', () => {
    const state = field();
    applyEffect(state.karts[0]!, 'ink-cloud', INK_TICKS, state, [], { data: [0, 0] });
    const almost = run(state, INK_TICKS - 1).state;
    expect(hasEffect(almost.karts[0]!, 'ink-cloud')).toBe(true);
    expect(hasEffect(run(almost, 1).state.karts[0]!, 'ink-cloud')).toBe(false);
  });

  it('a boost clears it faster', () => {
    const state = field();
    applyEffect(state.karts[0]!, 'ink-cloud', INK_TICKS, state, [], { data: [0, 0] });
    state.karts[0]!.boostTimer = 10;
    const ticks = Math.ceil(INK_TICKS / INK_BOOST_CLEAR) + 1;
    expect(hasEffect(run(state, ticks).state.karts[0]!, 'ink-cloud')).toBe(false);
  });

  it('the splats fade out at the end', () => {
    const effect = { kind: 'ink-cloud', ticksLeft: INK_TICKS, by: 1, data: [0, 0] };
    expect(inkOpacity(effect)).toBe(1);
    expect(inkOpacity({ ...effect, ticksLeft: 30 })).toBeGreaterThan(0);
    expect(inkOpacity({ ...effect, ticksLeft: 30 })).toBeLessThan(0.5);
    expect(inkOpacity({ ...effect, ticksLeft: 0 })).toBe(0);
  });

  it('AI inked karts get the tuned, seeded steering noise and a shorter look-ahead for 4 s', () => {
    let { state } = afterInk();
    const ai = state.karts[1]!;
    expect(ai.controller).toBe('ai');
    const nudges = new Set<number>();
    for (let t = 0; t < INK_TICKS - 5; t += 1) {
      const driving = effectsAiDriving(state.karts[1]!);
      expect(driving.lookAhead).toBe(INK_LOOK_AHEAD);
      expect(Math.abs(driving.steer)).toBeLessThanOrEqual(INK_STEER_NOISE);
      nudges.add(driving.steer);
      state = run(state, 1, { throttle: 1 }).state;
    }
    // A new nudge every ~0.35 s: several different values.
    expect(nudges.size).toBeGreaterThan(5);
    state = run(state, 10, { throttle: 1 }).state;
    expect(effectsAiDriving(state.karts[1]!)).toEqual({ steer: 0, lookAhead: 1 });
    // The player's kart is inked too, but its steering is its own.
    expect(effectsAiDriving(afterInk().state.karts[0]!).steer).toBe(0);
  });

  it('the noise changes what the AI steers', () => {
    const { state } = afterInk();
    const kart = state.karts[1]!;
    const geometry = trackGeometry(sunnyCircuit);
    const line = sunnyCircuit.aiLine ?? [];
    const drive = (k: typeof kart) =>
      aiInput(structuredClone(k), structuredClone(k.ai!), geometry, line, 100, true).steer;
    const clean = { ...kart, effects: [] };
    const effect = getEffect(kart, 'ink-cloud')!;
    const nudged = { ...kart, effects: [{ ...effect, data: [INK_STEER_NOISE, 10] }] };
    expect(drive(nudged)).not.toBeCloseTo(drive(clean), 3);
  });

  it('AI: uses it in the back half of the field', () => {
    const state = field();
    const aiUse = inkCloud.aiUse!;
    expect(aiUse(state.karts[2]!, state)).toBe(true);
    expect(aiUse(state.karts[1]!, state)).toBe(false);
  });

  it('is deterministic (the noise comes from the seeded RNG)', () => {
    const a = run(afterInk().state, 120, { throttle: 1 });
    const b = run(afterInk().state, 120, { throttle: 1 });
    expect(a.state).toEqual(b.state);
  });

  describe('the overlay', () => {
    /** Share of a 200×200 grid over the screen that `inside` covers. */
    const coverage = (inside: (x: number, y: number) => boolean) => {
      const n = 200;
      let hit = 0;
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          const [x, y] = [((i + 0.5) / n) * 100, ((j + 0.5) / n) * 100];
          if (inside(x, y) && INK_BLOTS.some((b) => (x - b.x) ** 2 + (y - b.y) ** 2 <= b.r ** 2)) {
            hit += 1;
          }
        }
      }
      return hit / (n * n);
    };

    it('covers about 40% of the screen', () => {
      const share = coverage(() => true);
      expect(share).toBeGreaterThan(0.35);
      expect(share).toBeLessThan(0.45);
    });

    it('stays clear of the touch buttons (bottom right), stick (bottom left) and pause (right)', () => {
      expect(coverage((x, y) => x > 72 && y > 55)).toBe(0);
      expect(coverage((x, y) => x < 30 && y > 70)).toBe(0);
      expect(coverage((x) => x > 88)).toBe(0);
    });
  });
});
