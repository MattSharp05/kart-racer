import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { aiItemInput } from '../../../sim/ai/items';
import { resolveKartCollisions } from '../../../sim/collisions';
import { giveItem } from '../../../sim/items';
import { applyEffect, getEffect, hasEffect, isIntangible } from '../../../sim/items/effects';
import { spawnEntity } from '../../../sim/items/entities';
import { tryHit } from '../../../sim/items/hit';
import { fireShell, updateShells } from '../../../sim/items/shell';
import { updateStarLightning, useLightning } from '../../../sim/items/starLightning';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { trackGeometry } from '../../../sim/track';
import { tuning } from '../../../sim/tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ShellEntity,
  type SimEvent,
  type SimState,
} from '../../../sim/types';
import { sunnyCircuit } from '../../tracks/sunny-circuit/sim';
import { BANANA_AHEAD, KART_AHEAD } from './scenarios';
import phase, { PHASE_AI_LATERAL, PHASE_SPEED, PHASE_TICKS } from './sim';

/** Steps `ticks` ticks with kart 0 on `input`, collecting events. */
function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(state, [{ ...NEUTRAL_INPUT, ...input }]);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const bananas = (state: SimState) => state.entities.filter((e) => e.kind === 'banana');

/** Two karts on the test pad, 1 m apart side by side (overlapping), kart 0 phased. */
function phasedPair(): SimState {
  const state = createSimState({
    seed: 1,
    karts: [{ speed: 10 }, { position: { x: 1, y: 0, z: 0 } }],
  });
  applyEffect(state.karts[0]!, 'phase', PHASE_TICKS, state, []);
  return state;
}

describe('Phase (MK-66)', () => {
  it('using it phases the kart for 3 s', () => {
    const state = createSimState({ seed: 1, karts: [{ speed: 10 }] });
    giveItem(state.karts[0]!, 'phase');
    let after = run(state, 1, { item: true }).state;
    expect(after.karts[0]!.item.held).toBeNull();
    expect(getEffect(after.karts[0]!, 'phase')?.ticksLeft).toBe(PHASE_TICKS);
    expect(isIntangible(after.karts[0]!)).toBe(true);
    after = run(after, PHASE_TICKS).state;
    expect(hasEffect(after.karts[0]!, 'phase')).toBe(false);
    expect(isIntangible(after.karts[0]!)).toBe(false);
  });

  it('item-phase: drives through the banana and the stopped kart, untouched', () => {
    const start = scenarios.get('item-phase')!.setup(1).state;
    const parkedAt = { ...start.karts[1]!.position };
    const phased = run(start, 1, { throttle: 1, item: true });
    // Long enough to pass both (≈ 25 m/s), still inside the 3 s.
    const { state, events } = run(phased.state, 150, { throttle: 1 });
    expect(hasEffect(state.karts[0]!, 'phase')).toBe(true);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
    expect(events.some((e) => e.type === 'bump')).toBe(false);
    expect(bananas(state)).toHaveLength(1);
    expect(state.karts[0]!.spinTimer).toBe(0);
    // The stopped kart didn't move, and you're past it.
    expect(state.karts[1]!.position.x).toBeCloseTo(parkedAt.x, 5);
    expect(state.karts[1]!.position.z).toBeCloseTo(parkedAt.z, 5);
    const geometry = trackGeometry(sunnyCircuit);
    const past = geometry.project(state.karts[0]!.position).s - geometry.project(parkedAt).s;
    expect(past).toBeGreaterThan(5);
    expect(KART_AHEAD).toBeGreaterThan(BANANA_AHEAD);
  });

  it('item-phase without phasing: the banana spins you out', () => {
    const start = scenarios.get('item-phase')!.setup(1).state;
    const { events } = run(start, 150, { throttle: 1 });
    expect(events.some((e) => e.type === 'kartHit' && e.kartId === 0 && e.kind === 'banana')).toBe(
      true,
    );
  });

  it('passes through another kart: no bump', () => {
    const state = phasedPair();
    const before = new Map(state.karts.map((k) => [k.id, k.position]));
    const events: SimEvent[] = [];
    resolveKartCollisions(state.karts, before, events);
    expect(events).toHaveLength(0);
    expect(state.karts[1]!.position).toEqual({ x: 1, y: 0, z: 0 });
    // Control: without the effect they're pushed apart.
    state.karts[0]!.effects = [];
    resolveKartCollisions(state.karts, before, events);
    expect(state.karts[1]!.position.x).toBeGreaterThan(1);
  });

  it('a shell flies through it and carries on', () => {
    const state = phasedPair();
    const shell: ShellEntity = {
      id: 50,
      kind: 'shell',
      colour: 'green',
      position: { ...state.karts[0]!.position },
      direction: { x: 0, z: -1 },
      speed: 1,
      bounces: 0,
      life: 5,
      ownerId: 1,
      ownerImmune: 0,
      targetId: -1,
    };
    state.karts[1]!.position = { x: 50, y: 0, z: 0 };
    state.entities.push(shell);
    const events: SimEvent[] = [];
    updateShells(state, 1 / 60, events);
    expect(state.entities.some((e) => e.id === 50)).toBe(true);
    expect(state.karts[0]!.spinTimer).toBe(0);
  });

  it('item entities (the oil slick) pass it by', () => {
    const state = phasedPair();
    state.karts[1]!.position = { x: 50, y: 0, z: 0 };
    // Kart 1 drops a slick right under kart 0.
    spawnEntity(state, 'oil-slick', state.karts[1]!).position = { ...state.karts[0]!.position };
    const after = run(state, 2).state;
    expect(hasEffect(after.karts[0]!, 'oil-slick')).toBe(false);
  });

  it("can't be hit by items, but hazards still hit it", () => {
    for (const kind of ['green', 'banana', 'lightning', 'star', 'squash'] as const) {
      const state = phasedPair();
      expect(tryHit(state.karts[0]!, 1, kind, [])).not.toBe('hit');
      expect(state.karts[0]!.spinTimer).toBe(0);
    }
    const state = phasedPair();
    expect(tryHit(state.karts[0]!, -1, 'hazard', [])).toBe('hit');
    const crushed = phasedPair();
    expect(tryHit(crushed.karts[0]!, -1, 'hazard', [], { crush: true })).toBe('hit');
  });

  it('lightning spares it', () => {
    const state = phasedPair();
    giveItem(state.karts[0]!, 'red');
    useLightning(state.karts[1]!, state, []);
    expect(state.karts[0]!.shrinkTimer).toBe(0);
    expect(state.karts[0]!.item.held).toBe('red');
  });

  it("can't knock others over with a star, nor be knocked", () => {
    const state = phasedPair();
    state.karts[0]!.starTimer = tuning.starSeconds;
    const events: SimEvent[] = [];
    updateStarLightning(state, 1 / 60, events);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
    // The other way round.
    state.karts[0]!.starTimer = 0;
    state.karts[1]!.starTimer = tuning.starSeconds;
    updateStarLightning(state, 1 / 60, events);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  });

  it('gets a small speed boost: top speed × PHASE_SPEED', () => {
    const fast = createSimState({ seed: 1, karts: [{ speed: tuning.topSpeed[100] }] });
    const plain = createSimState({ seed: 1, karts: [{ speed: tuning.topSpeed[100] }] });
    applyEffect(fast.karts[0]!, 'phase', 10 * 60, fast, []);
    const a = run(fast, 150, { throttle: 1 }).state.karts[0]!.speed;
    const b = run(plain, 150, { throttle: 1 }).state.karts[0]!.speed;
    expect(a / b).toBeGreaterThan(1 + (PHASE_SPEED - 1) / 2);
    expect(a / b).toBeLessThan(PHASE_SPEED + 0.01);
  });

  it('is deterministic', () => {
    const start = scenarios.get('item-phase')!.setup(1).state;
    const a = run(run(start, 1, { throttle: 1, item: true }).state, 120, { throttle: 1 });
    const b = run(run(start, 1, { throttle: 1, item: true }).state, 120, { throttle: 1 });
    expect(a.state).toEqual(b.state);
  });

  describe('AI', () => {
    const geometry = trackGeometry(sunnyCircuit);
    const line = sunnyCircuit.aiLine ?? [];
    /** The scenario with kart 0 turned AI (holding Phase, past its thinking time). */
    function aiHolding(): SimState {
      const state = scenarios.get('item-phase')!.setup(1).state;
      state.karts[0]!.ai = {
        ...scenarios.get('item-bubble-shield')!.setup(1).state.karts[1]!.ai!,
        itemDelay: 0,
      };
      state.entities = state.entities.filter((e) => e.kind !== 'banana');
      return state;
    }
    /** `curvature`: of the racing line ahead (0 = a straight). */
    const decide = (state: SimState, curvature = 0) =>
      aiItemInput(
        state.karts[0]!,
        state.karts[0]!.ai!,
        state,
        geometry,
        line,
        1 / 60,
        () => curvature,
      ).item ?? false;
    /** Puts kart 1 `ahead` m in front of kart 0 along the track and `side` m to its side. */
    function kartAt(state: SimState, ahead: number, side: number): SimState {
      const here = geometry.project(state.karts[0]!.position);
      state.karts[1]!.position = geometry.pointAt(
        here.t + ahead / geometry.length,
        here.lateral + side,
      );
      return state;
    }

    it('holds it with nothing within 20 m ahead', () => {
      expect(decide(aiHolding())).toBe(false);
    });

    it('phases when a kart is within 20 m ahead', () => {
      const state = aiHolding();
      const kart = state.karts[0]!;
      const parked = state.karts[1]!;
      // Move the parked kart to 15 m ahead of you, along your heading.
      const dx = parked.position.x - kart.position.x;
      const dz = parked.position.z - kart.position.z;
      const d = Math.hypot(dx, dz);
      parked.position = {
        ...kart.position,
        x: kart.position.x + (dx / d) * 15,
        z: kart.position.z + (dz / d) * 15,
      };
      expect(decide(state)).toBe(true);
    });

    it('holds it when the kart ahead is off to the side, out of its way (MK-72)', () => {
      expect(decide(kartAt(aiHolding(), 15, 0))).toBe(true);
      expect(decide(kartAt(aiHolding(), 15, PHASE_AI_LATERAL + 2))).toBe(false);
    });

    it("doesn't phase through its own shell on the way out (MK-72)", () => {
      const state = kartAt(aiHolding(), 60, 0);
      const kart = state.karts[0]!;
      fireShell(kart, state, NEUTRAL_INPUT, 'green');
      expect(state.entities.some((e) => e.kind === 'shell')).toBe(true);
      expect(decide(state)).toBe(false);
    });

    it('phases through its own banana once the drop grace is over: it can hit its owner then', () => {
      const state = kartAt(aiHolding(), 60, 0);
      const kart = state.karts[0]!;
      const here = geometry.project(kart.position);
      const position = geometry.pointAt(here.t + 12 / geometry.length, here.lateral);
      const banana = {
        id: 900,
        kind: 'banana' as const,
        position,
        from: position,
        flightTimer: 0,
        ownerId: kart.id,
        ownerImmune: 0.5,
      };
      state.entities.push(banana);
      expect(decide(structuredClone(state))).toBe(false);
      banana.ownerImmune = 0;
      expect(decide(state)).toBe(true);
    });

    it('having given up, phases on a straight for the speed, never into a bend (MK-72)', () => {
      const state = aiHolding();
      state.karts[0]!.ai!.itemHeld = tuning.ai.itemGiveUp;
      expect(decide(structuredClone(state), tuning.ai.straightCurvature * 2)).toBe(false);
      expect(decide(state)).toBe(true);
    });

    it('phases when a banana is within 20 m ahead', () => {
      const state = aiHolding();
      state.entities.push(
        scenarios
          .get('item-phase')!
          .setup(1)
          .state.entities.find((e) => e.kind === 'banana')!,
      );
      expect(decide(state)).toBe(true);
    });
  });

  it('is in the roulette for back places only', () => {
    expect(phase.odds.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(phase.odds.slice(-3).every((w) => w > 0)).toBe(true);
  });
});
