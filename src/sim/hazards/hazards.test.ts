import { describe, expect, it } from 'vitest';
import { HAZARD_TEST, hazardTest } from '../../content/tracks/hazard-test/sim';
import { createSimState, type KartSpawn } from '../state';
import { step } from '../step';
import { tuning } from '../tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../types';
import { hazardGrip, hazardKinds, hazardPose, trackHazards } from '.';
import type { MoverHazard, PeriodicHazard, ZoneEffectHazard } from './types';

const hazards = trackHazards(hazardTest);
const byKind = <K extends string>(kind: K) => hazards.find((h) => h.kind === kind)!;
const crusher = byKind('periodic') as PeriodicHazard;
const storm = byKind('zoneEffect') as ZoneEffectHazard;

function race(karts: KartSpawn[]): SimState {
  return createSimState({ seed: 3, trackId: 'hazard-test', karts });
}

/** Steps `ticks` times; returns the final state and every event. */
function run(state: SimState, ticks: number, inputs: InputFrame[] = []) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(state, inputs);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const hazardHits = (events: SimEvent[], kartId = 0) =>
  events.filter((e) => e.type === 'kartHit' && e.kartId === kartId && e.kind === 'hazard');

describe('track hazards (MK-49)', () => {
  it('registers the four kinds, and unknown kinds throw', () => {
    expect(hazardKinds.ids()).toEqual(['mover', 'periodic', 'rotator', 'zoneEffect']);
    expect(() => hazardKinds.get('volcano')).toThrow(/Unknown hazard kind/);
  });

  it('poses are a pure function of the tick: identical across runs and calls', () => {
    const poses = () =>
      [0, 1, 59, 60, 237, 1000, 12345].map((t) => hazards.map((h) => hazardPose(h, t)));
    expect(JSON.stringify(poses())).toBe(JSON.stringify(poses()));
    // Fractional ticks (drawing between ticks) fall between the whole ones for the mover.
    const mover = byKind('mover');
    const a = hazardPose(mover, 10);
    const b = hazardPose(mover, 11);
    const mid = hazardPose(mover, 10.5);
    expect(mid.z).toBeCloseTo((a.z + b.z) / 2, 6);
  });

  it('an open-path mover runs start → end in its active share of the period, then is gone (MK-59)', () => {
    // 60 m straight at 30 m/s: 2 s of every 4.
    const ball: MoverHazard = {
      kind: 'mover',
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 30 },
        { x: 0, y: 0, z: 60 },
      ],
      period: 4,
      activeFraction: 0.5,
      radius: 1,
    };
    const kind = hazardKinds.get('mover');
    expect(hazardPose(ball, 0).amount).toBe(1);
    expect(hazardPose(ball, 0).z).toBeCloseTo(0, 6);
    expect(hazardPose(ball, 60).z).toBeCloseTo(30, 6);
    expect(hazardPose(ball, 119).z).toBeCloseTo(59.5, 6);
    // Off for the rest of the period: parked at the end, and it touches nothing.
    for (const tick of [120, 180, 239]) {
      const pose = hazardPose(ball, tick);
      expect(pose).toMatchObject({ z: 60, amount: 0 });
      expect(kind.contact?.(ball, pose, { x: 0, y: 0, z: 60 }, 1)).toBeUndefined();
    }
    // Back at the start next period, never joining the end back to the start.
    expect(hazardPose(ball, 240).amount).toBe(1);
    expect(hazardPose(ball, 240).z).toBeCloseTo(0, 6);
    for (let tick = 0; tick < 120; tick += 1) {
      expect(hazardPose(ball, tick + 1).z).toBeGreaterThan(hazardPose(ball, tick).z);
    }
    expect(kind.contact?.(ball, hazardPose(ball, 60), { x: 1.5, y: 0, z: 30 }, 1)).toBeDefined();
  });

  it('a race on the hazard track is deterministic (same seed + inputs → same state)', () => {
    const go = () =>
      run(
        race([{}, {}].map((_, i) => ({ position: { x: 45 - i * 4, y: 0, z: 70 }, heading: 0 }))),
        600,
        [
          { ...NEUTRAL_INPUT, throttle: 1 },
          { ...NEUTRAL_INPUT, throttle: 1, steer: 0.1 },
        ],
      ).state;
    expect(JSON.stringify(go())).toBe(JSON.stringify(go()));
  });

  it('the mover: driving into oncoming traffic spins the kart out', () => {
    const start = race([{ position: { x: 45, y: 0, z: 60 }, heading: 0, speed: 15 }]);
    const { state, events } = run(start, 300, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
    expect(hazardHits(events)).toHaveLength(1);
    expect(events).toContainEqual({ type: 'kartHit', kartId: 0, by: -1, kind: 'hazard' });
    // Pushed clear: never ends up inside the traffic kart.
    const pose = hazardPose(byKind('mover'), state.tick);
    const kart = state.karts[0]!;
    expect(Math.hypot(kart.position.x - pose.x, kart.position.z - pose.z)).toBeGreaterThan(1.5);
  });

  it('the crusher squashes a kart under it when it closes: stopped, long spin', () => {
    const start = race([{ position: { ...HAZARD_TEST.crusher }, heading: 0 }]);
    let state = start;
    let squashedAt = -1;
    for (let i = 0; i < 240 && squashedAt < 0; i += 1) {
      const result = step(state, []);
      state = result.state;
      if (hazardHits(result.events).length) squashedAt = state.tick;
    }
    expect(squashedAt).toBeGreaterThan(0);
    // Only once it's (nearly) closed.
    expect(hazardPose(crusher, squashedAt).amount).toBeGreaterThanOrEqual(
      tuning.hazards.crusherSquashAt,
    );
    expect(hazardPose(crusher, squashedAt - 1).amount).toBeLessThan(tuning.hazards.crusherSquashAt);
    const kart = state.karts[0]!;
    expect(kart.speed).toBe(0);
    // Minus the one tick already counted down this step.
    expect(kart.spinTimer).toBeCloseTo(
      tuning.spinSeconds * tuning.hazards.squashSpinFactor - 1 / 60,
      6,
    );
  });

  it('the crusher never squashes a kart outside it, even right beside it', () => {
    // Beside the long side (half width 3): 4.5 m from the centre, touching distance included.
    for (const dx of [-4.5, 4.5, -3.2, 3.2]) {
      const start = race([{ position: { ...HAZARD_TEST.crusher, x: HAZARD_TEST.crusher.x + dx } }]);
      const { events } = run(start, 480);
      expect(hazardHits(events)).toEqual([]);
    }
  });

  it('a kart flying high over a hazard clears it', () => {
    // Just before the crusher closes (at ~2.32 s of its 4 s cycle), with a kart under it.
    const at = (y: number) => {
      const start = race([{ position: { ...HAZARD_TEST.crusher, y }, heading: 0 }]);
      start.tick = 130;
      return hazardHits(run(start, 20).events);
    };
    expect(at(0)).toHaveLength(1);
    expect(at(tuning.hazards.clearance + 5)).toEqual([]);
  });

  it('the spinning bar bumps a parked kart out of its way (no spin-out)', () => {
    const { x, z } = HAZARD_TEST.spinner;
    const start = race([{ position: { x: x + 4, y: 0, z } }]);
    const { state, events } = run(start, 300);
    expect(hazardHits(events)).toEqual([]);
    expect(events.some((e) => e.type === 'wallHit' && e.kartId === 0)).toBe(true);
    expect(
      Math.hypot(state.karts[0]!.position.x - x, state.karts[0]!.position.z - z),
    ).toBeGreaterThan(4);
  });

  it('the sandstorm lowers grip inside while it is on, and only then', () => {
    const inside = { ...storm.centre, x: storm.centre.x + 5 };
    const outside = { ...storm.centre, x: storm.centre.x + storm.radius + 5 };
    const onTick = 1;
    const offTick = Math.round(storm.period * storm.activeFraction * 60) + 30;
    expect(hazardGrip(hazards, onTick, inside)).toBe(storm.grip);
    expect(hazardGrip(hazards, onTick, outside)).toBe(1);
    expect(hazardGrip(hazards, offTick, inside)).toBe(1);
  });

  it('karts on tracks without hazards are untouched (no grip change, no events)', () => {
    expect(trackHazards({ id: 'x', kind: 'arena', halfSize: 10, groundHeight: 0 })).toEqual([]);
  });
});
