import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { aiItemInput } from '../../../sim/ai/items';
import { giveItem } from '../../../sim/items';
import { applyEffect, getEffect, hasEffect } from '../../../sim/items/effects';
import { homingOn, spawnEntity, updateItemEntities } from '../../../sim/items/entities';
import { screenHit } from '../../../sim/items/hit';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemEntity,
  type SimEvent,
  type SimState,
} from '../../../sim/types';
import { sunnyCircuit } from '../../tracks/sunny-circuit/sim';
import { PHASE_TICKS } from '../phase/sim';
import { SHIELD_TICKS } from '../bubble-shield/sim';
import { SWARM_AFTER_SECONDS } from './scenarios';
import hornetSwarm, {
  HORNET_TICKS,
  HORNETS,
  STING_GAP_SECONDS,
  STING_SPEED_FACTOR,
  STING_TICKS,
  hornetTargets,
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

const hornets = (state: SimState) =>
  state.entities.filter((e): e is ItemEntity => e.kind === 'item' && e.spec === 'hornet-swarm');
type ItemFx = Extract<SimEvent, { type: 'itemFx' }>;
const stings = (events: readonly SimEvent[]) =>
  events.filter(
    (e): e is ItemFx => e.type === 'itemFx' && e.item === 'hornet-swarm' && e.fx === 'sting',
  );

/**
 * The test pad: kart 0 (the owner) at the origin and kart 1, the target, 20 m away, with
 * `hornetCount` hornets from kart 0 sitting right on kart 1.
 */
function hornetsOnTarget(hornetCount: number): SimState {
  const state = createSimState({
    seed: 1,
    karts: [{}, { position: { x: 20, y: 0, z: 0 }, speed: 10 }],
  });
  state.positions = [1, 0];
  for (let i = 0; i < hornetCount; i += 1) {
    const hornet = spawnEntity(state, 'hornet-swarm', state.karts[0]!, { targetId: 1 });
    hornet.position = { ...state.karts[1]!.position };
  }
  return state;
}

describe('Hornet Swarm (MK-67)', () => {
  it('sets off 3 hornets at the 1st, 2nd and 3rd kart ahead, and each is stung once', () => {
    const start = scenarios.get('item-hornet-swarm')!.setup(1).state;
    expect(start.positions).toEqual([3, 2, 1, 0]);
    const used = run(start, 1, { throttle: 1, item: true });
    expect(used.state.karts[0]!.item.held).toBeNull();
    expect(hornets(used.state).map((h) => h.targetId)).toEqual([1, 2, 3]);

    const { state, events } = run(used.state, 4 * 60, { throttle: 1 });
    const stung = stings(events).map((e) => e.kartId);
    expect(stung.sort()).toEqual([1, 2, 3]);
    // A sting is not a spin-out.
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
    expect(state.karts.every((k) => k.spinTimer === 0)).toBe(true);
    expect(hornets(state)).toHaveLength(0);
  }, 30_000);

  it('a sting is the tuned bump: speed × 0.7, a 0.6 s wobble, unhittable meanwhile', () => {
    let state = hornetsOnTarget(1);
    const events: SimEvent[] = [];
    const before = state.karts[1]!.speed;
    updateItemEntities(state, DT, events);
    const target = state.karts[1]!;
    expect(stings(events).map((e) => e.kartId)).toEqual([1]);
    expect(getEffect(target, 'hornet-swarm')?.ticksLeft).toBe(STING_TICKS);
    expect(STING_TICKS).toBe(36);
    expect(target.speed).toBeCloseTo(before * STING_SPEED_FACTOR, 6);
    expect(target.spinTimer).toBe(0);
    expect(target.invulnerableTimer).toBe(STING_GAP_SECONDS);
    expect(STING_GAP_SECONDS).toBeGreaterThanOrEqual(0.5);
    expect(hornets(state)).toHaveLength(0);
    // The wobble swings the heading and brings it back, then ends.
    const heading = target.heading;
    let swung = 0;
    for (let i = 0; i < STING_TICKS; i += 1) {
      state = step(state, [NEUTRAL_INPUT, NEUTRAL_INPUT]).state;
      swung = Math.max(swung, Math.abs(state.karts[1]!.heading - heading));
    }
    expect(swung).toBeGreaterThan(0.05);
    expect(state.karts[1]!.heading).toBeCloseTo(heading, 2);
    expect(hasEffect(state.karts[1]!, 'hornet-swarm')).toBe(false);
  });

  it('only stings its own target, never its owner', () => {
    const state = hornetsOnTarget(1);
    const hornet = hornets(state)[0]!;
    hornet.targetId = 1;
    hornet.position = { ...state.karts[0]!.position };
    const events: SimEvent[] = [];
    updateItemEntities(state, DT, events);
    expect(stings(events)).toHaveLength(0);
    expect(hornets(state)).toHaveLength(1);
  });

  it('expires after 6 s', () => {
    const state = createSimState({
      seed: 1,
      karts: [{}, { position: { x: 5000, y: 0, z: 0 } }],
    });
    state.positions = [1, 0];
    spawnEntity(state, 'hornet-swarm', state.karts[0]!, { targetId: 1 });
    // Moved on its own (the arena drops entities that leave it).
    for (let i = 0; i < HORNET_TICKS; i += 1) updateItemEntities(state, DT, []);
    expect(hornets(state)).toHaveLength(1);
    updateItemEntities(state, DT, []);
    expect(hornets(state)).toHaveLength(0);
  });

  describe('targets', () => {
    const pack = (positions: number[], owner: number) => {
      const state = createSimState({ seed: 1, karts: positions.map(() => ({})) });
      state.positions = positions;
      return hornetTargets(state.karts[owner]!, state);
    };
    it('the next 3 ahead, nearest first', () => {
      expect(pack([4, 3, 2, 1, 0], 0)).toEqual([1, 2, 3]);
      expect(pack([4, 3, 2, 1, 0], 1)).toEqual([2, 3, 4]);
    });
    it('with fewer ahead, the extras chase the nearest', () => {
      expect(pack([2, 1, 0], 0)).toEqual([1, 2, 1]);
      expect(pack([1, 0], 0)).toEqual([1, 1, 1]);
    });
    it('from 1st, nobody', () => {
      expect(pack([0, 1], 0)).toEqual([-1, -1, -1]);
    });
  });

  it('with 1 kart ahead all 3 chase it, and stings land at most once per 0.5 s', () => {
    const start = scenarios.get('item-hornet-swarm-incoming')!.setup(1).state;
    let state = start;
    const events: SimEvent[] = [];
    const ticks: number[] = [];
    let chased = false;
    for (let i = 0; i < (SWARM_AFTER_SECONDS + 5) * 60; i += 1) {
      const result = step(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
      state = result.state;
      events.push(...result.events);
      if (stings(result.events).length) ticks.push(state.tick);
      if (hornets(state).length === HORNETS) {
        chased ||= hornets(state).every((h) => h.targetId === 0);
      }
    }
    expect(chased).toBe(true);
    expect(ticks.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]! - ticks[i - 1]!).toBeGreaterThanOrEqual(STING_GAP_SECONDS * 60);
    }
    expect(stings(events).every((e) => e.kartId === 0)).toBe(true);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  }, 30_000);

  it('3 hornets on the same kart in the same tick: one sting, all 3 used up', () => {
    const state = hornetsOnTarget(3);
    const events: SimEvent[] = [];
    updateItemEntities(state, DT, events);
    expect(stings(events)).toHaveLength(1);
    expect(hornets(state)).toHaveLength(0);
  });

  it('is blocked by a Bubble Shield: the bubble pops, no sting', () => {
    const state = hornetsOnTarget(1);
    applyEffect(state.karts[1]!, 'bubble-shield', SHIELD_TICKS, state, []);
    const events: SimEvent[] = [];
    updateItemEntities(state, DT, events);
    expect(stings(events)).toHaveLength(0);
    expect(hasEffect(state.karts[1]!, 'hornet-swarm')).toBe(false);
    expect(events).toContainEqual({ type: 'itemFx', kartId: 1, item: 'bubble-shield', fx: 'pop' });
    expect(getEffect(state.karts[1]!, 'bubble-shield')?.ticksLeft).toBe(0);
    expect(hornets(state)).toHaveLength(0);
  });

  it('ignores a phased kart: flies through it and keeps chasing', () => {
    const state = hornetsOnTarget(1);
    applyEffect(state.karts[1]!, 'phase', PHASE_TICKS, state, []);
    const events: SimEvent[] = [];
    updateItemEntities(state, DT, events);
    expect(stings(events)).toHaveLength(0);
    expect(hasEffect(state.karts[1]!, 'hornet-swarm')).toBe(false);
    expect(hornets(state)).toHaveLength(1);
    expect(hornets(state)[0]!.targetId).toBe(1);
  });

  it('screenHit: tells whether a hit would land without knocking the kart about', () => {
    const state = createSimState({ seed: 1, karts: [{ speed: 10 }] });
    const kart = state.karts[0]!;
    expect(screenHit(kart, -1, 'hornet-swarm', [])).toBe('hit');
    expect(kart.speed).toBe(10);
    expect(kart.spinTimer).toBe(0);
    kart.starTimer = 1;
    expect(screenHit(kart, -1, 'hornet-swarm', [])).toBe('immune');
  });

  it('homingOn lists what is chasing a kart (the HUD incoming warning)', () => {
    const state = hornetsOnTarget(2);
    expect(homingOn(state, 1)).toEqual(['hornet-swarm']);
    expect(homingOn(state, 0)).toEqual([]);
    state.entities.push({
      id: 900,
      kind: 'shell',
      colour: 'red',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 1, z: 0 },
      speed: 10,
      bounces: 0,
      life: 5,
      ownerId: 0,
      ownerImmune: 0,
      targetId: 1,
    });
    expect(homingOn(state, 1)).toEqual(['hornet-swarm', 'red']);
  });

  it('is deterministic', () => {
    const go = () =>
      run(
        run(scenarios.get('item-hornet-swarm')!.setup(3).state, 1, { throttle: 1, item: true })
          .state,
        200,
        { throttle: 1 },
      ).state;
    expect(JSON.stringify(go())).toEqual(JSON.stringify(go()));
  }, 30_000);

  describe('AI', () => {
    const geometry = trackGeometry(sunnyCircuit);
    const line = sunnyCircuit.aiLine ?? [];
    /** The 4-kart scenario with the AI at the back (kart 1 and kart 0 swapped) holding the swarm. */
    function aiHolding(): SimState {
      const state = scenarios.get('item-hornet-swarm')!.setup(1).state;
      const [you, ai] = [state.karts[0]!, state.karts[1]!];
      [you.position, ai.position] = [ai.position, you.position];
      you.item = { ...you.item, held: null, uses: 0 };
      giveItem(ai, 'hornet-swarm');
      ai.ai!.itemDelay = 0;
      state.positions = [3, 2, 0, 1];
      return state;
    }
    const decide = (state: SimState) =>
      aiItemInput(state.karts[1]!, state.karts[1]!.ai!, state, geometry, line, 1 / 60, () => 0)
        .item ?? false;

    it('uses it with 1–3 karts within 60 m ahead', () => {
      expect(decide(aiHolding())).toBe(true);
    });

    it('holds it with nobody within 60 m ahead', () => {
      const state = aiHolding();
      for (const id of [0, 2, 3]) {
        state.karts[id]!.position = geometry.pointAt(0.5, 0);
      }
      expect(decide(state)).toBe(false);
    });

    it('holds it when leading, even with a lapped kart just ahead', () => {
      const state = aiHolding();
      state.positions = [1, 3, 2, 0];
      expect(decide(state)).toBe(false);
    });

    it('having given up, fires with nobody near, but still never from 1st (MK-72)', () => {
      const state = aiHolding();
      for (const id of [0, 2, 3]) state.karts[id]!.position = geometry.pointAt(0.5, 0);
      state.karts[1]!.ai!.itemHeld = tuning.ai.itemGiveUp;
      expect(decide(structuredClone(state))).toBe(true);
      state.positions = [1, 3, 2, 0];
      expect(decide(state)).toBe(false);
    });

    it('holds it with 4 karts within 60 m ahead', () => {
      const state = aiHolding();
      const extra = structuredClone(state.karts[3]!);
      extra.id = 4;
      extra.position = geometry.pointAt(
        geometry.project(state.karts[3]!.position).t + 5 / geometry.length,
        0,
      );
      state.karts.push(extra);
      expect(decide(state)).toBe(false);
    });
  });

  it('is in the roulette for mid and back places only', () => {
    expect(hornetSwarm.odds.slice(0, 2)).toEqual([0, 0]);
    expect(hornetSwarm.odds.slice(2).every((w) => w > 0)).toBe(true);
    expect(tuning.spinSeconds).toBeGreaterThan(STING_TICKS / 60);
  });
});
