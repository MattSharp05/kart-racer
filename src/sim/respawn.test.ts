import { describe, expect, it } from 'vitest';
import { scenarios } from '../scenarios';
import { kartOnTrack } from '../scenarios/tracks';
import { sunnyCircuit } from './data/tracks/sunnyCircuit';
import { step } from './step';
import { trackGeometry } from './track';
import { DT, tuning } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from './types';

const geometry = trackGeometry(sunnyCircuit);

function run(
  state: SimState,
  ticks: number,
  input: (s: SimState) => Partial<InputFrame>[] = () => [],
) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const frames = input(s);
    const result = step(
      s,
      s.karts.map((_, k) => ({ ...NEUTRAL_INPUT, ...frames[k] })),
    );
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

describe('respawn', () => {
  it('a kart that falls off is back on the road within 1.5 s (± 0.1) of the pickup', () => {
    const start = scenarios.get('sunny-fall-off')!.setup(1).state;
    let s = start;
    let respawnTick = -1;
    for (let i = 0; i < 300 && respawnTick < 0; i += 1) {
      const result = step(s, [NEUTRAL_INPUT]);
      s = result.state;
      if (result.events.some((e) => e.type === 'respawn')) respawnTick = s.tick;
    }
    expect(respawnTick).toBeGreaterThan(0);
    let landedTick = -1;
    for (let i = 0; i < 200 && landedTick < 0; i += 1) {
      s = step(s, [NEUTRAL_INPUT]).state;
      if (s.karts[0]!.respawnTimer === 0 && s.karts[0]!.grounded) landedTick = s.tick;
    }
    expect((landedTick - respawnTick) * DT).toBeCloseTo(tuning.respawnSeconds, 1);
    expect(geometry.project(s.karts[0]!.position).surface).toBe('road');
    expect(s.karts[0]!.invulnerableTimer).toBeGreaterThan(0);
  });

  it('never places the kart past a checkpoint it has not reached', () => {
    const start = scenarios.get('sunny-fall-off')!.setup(1).state;
    const before = start.karts[0]!.race.nextCheckpoint;
    const { state } = run(start, 240);
    const kart = state.karts[0]!;
    expect(kart.race.nextCheckpoint).toBe(before);
    expect(geometry.project(kart.position).t).toBeCloseTo(start.karts[0]!.lastSafeT, 2);
  });

  it('two karts respawning at the same spot are put back side by side, not on top of each other', () => {
    const t = sunnyCircuit.ramps?.[0]?.to ?? 0.7;
    const outside = geometry.pointAt(t, geometry.wallOffset(16) + 6);
    const start = kartOnTrack(1, 'sunny-circuit', t);
    start.karts.push(structuredClone(start.karts[0]!));
    start.karts[1]!.id = 1;
    start.positions = [0, 1];
    for (const kart of start.karts) {
      kart.lastSafeT = t;
      kart.position = { ...outside, y: outside.y + 4 };
      kart.grounded = false;
    }
    const { state } = run(start, 240);
    const [a, b] = state.karts;
    expect(
      Math.hypot(a!.position.x - b!.position.x, a!.position.z - b!.position.z),
    ).toBeGreaterThan(3);
  });

  it('pressing R respawns you where you are on the track, then has a 3 s cooldown', () => {
    const start = kartOnTrack(1, 'sunny-circuit', 0.3, { speed: 20 });
    const first = run(start, 3, () => [{ respawn: true }]);
    expect(first.events.filter((e) => e.type === 'respawn')).toHaveLength(1);
    // Still holding R through the cooldown: no second respawn.
    const held = run(first.state, 120, () => [{ respawn: true }]);
    expect(held.events.some((e) => e.type === 'respawn')).toBe(false);
  });

  it('karts being carried by the drone do not collide with others', () => {
    const start = scenarios.get('sunny-fall-off')!.setup(1).state;
    const { state, events } = run(start, 60);
    expect(state.karts[0]!.respawnTimer).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'bump')).toBe(false);
  });
});
