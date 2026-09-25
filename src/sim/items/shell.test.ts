import { describe, expect, it } from 'vitest';
import { kartOnTrack, shellTarget } from '../../scenarios/tracks';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { step } from '../step';
import { trackGeometry } from '../track';
import { DT, tuning } from '../tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ShellEntity,
  type SimEvent,
  type SimState,
} from '../types';
import { nextEntityId } from './banana';

const geometry = trackGeometry(sunnyCircuit);
const shells = (s: SimState) => s.entities.filter((e): e is ShellEntity => e.kind === 'shell');

function run(state: SimState, ticks: number, input: Partial<InputFrame>[] = [{}]) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const r = step(
      s,
      input.map((f) => ({ ...NEUTRAL_INPUT, ...f })),
    );
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('green shell', () => {
  it('fired along the straight, hits a parked kart 30 m ahead in the expected time', () => {
    const state = shellTarget(1, 'green', 30);
    const speed = tuning.topSpeed[100] * tuning.greenShellSpeed;
    const expected = (30 - tuning.shellSpawnDistance - tuning.shellHitRadius) / speed;
    let s = run(state, 1, [{ item: true }]).state;
    let hitAt = -1;
    for (let i = 1; i < 120 && hitAt < 0; i += 1) {
      const r = step(s, [NEUTRAL_INPUT]);
      s = r.state;
      if (r.events.some((e) => e.type === 'kartHit' && e.kartId === 1 && e.by === 0)) hitAt = i;
    }
    expect(hitAt).toBeGreaterThan(0);
    expect(hitAt * DT).toBeGreaterThan(expected - 0.1);
    expect(hitAt * DT).toBeLessThan(expected + 0.25);
    expect(shells(s)).toHaveLength(0);
  });

  it('fires backwards while braking', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02);
    state.karts[0]!.item.held = 'green';
    const s = run(state, 1, [{ item: true, brake: 1 }]).state;
    const shell = shells(s)[0]!;
    expect(geometry.project(shell.position).t).toBeLessThan(
      geometry.project(s.karts[0]!.position).t,
    );
  });

  it('reflects off a wall at the same angle, and is gone after the 5th bounce', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02, { headingOffset: -Math.PI / 4 });
    state.karts[0]!.item.held = 'green';
    let s = run(state, 1, [{ item: true }]).state;
    const before = shells(s)[0]!;
    const p0 = geometry.project(before.position);
    const angleIn = Math.atan2(
      before.direction.x * p0.normal.x + before.direction.z * p0.normal.z,
      before.direction.x * p0.tangent.x + before.direction.z * p0.tangent.z,
    );
    let firstBounce: ShellEntity | undefined;
    for (let i = 0; i < 200 && !firstBounce; i += 1) {
      s = step(s, [NEUTRAL_INPUT]).state;
      const shell = shells(s)[0];
      if (shell && shell.bounces === 1) firstBounce = shell;
    }
    expect(firstBounce).toBeDefined();
    const p1 = geometry.project(firstBounce!.position);
    const angleOut = Math.atan2(
      firstBounce!.direction.x * p1.normal.x + firstBounce!.direction.z * p1.normal.z,
      firstBounce!.direction.x * p1.tangent.x + firstBounce!.direction.z * p1.tangent.z,
    );
    // Same angle to the track, mirrored across it (±5° for track curvature).
    expect(Math.abs(Math.abs(angleOut) - Math.abs(angleIn))).toBeLessThan((5 * Math.PI) / 180);
    expect(Math.sign(angleOut)).toBe(-Math.sign(angleIn));
    let maxBounces = 0;
    for (let i = 0; i < 60 * tuning.greenShellLife && shells(s).length; i += 1) {
      s = step(s, [NEUTRAL_INPUT]).state;
      maxBounces = Math.max(maxBounces, shells(s)[0]?.bounces ?? 0);
    }
    expect(shells(s)).toHaveLength(0);
    expect(maxBounces).toBeLessThanOrEqual(tuning.greenShellBounces);
  });

  it('a shell and a banana knock each other out', () => {
    const state = shellTarget(1, 'green', 60);
    const position = geometry.pointAt(0.02 + 15 / geometry.length, 0);
    state.entities.push({
      id: nextEntityId(state),
      kind: 'banana',
      position,
      from: position,
      flightTimer: 0,
      ownerId: -1,
      ownerImmune: 0,
    });
    const { state: s, events } = run(state, 90, [{ item: true }]);
    expect(s.entities.filter((e) => e.kind === 'banana' || e.kind === 'shell')).toHaveLength(0);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  });

  it("the thrower isn't hit by their own shell in the first 0.3 s", () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02, { speed: 0 });
    state.karts[0]!.item.held = 'green';
    // Fire backwards while reversing into it.
    const { events } = run(state, Math.round(tuning.shellOwnerImmuneSeconds / DT), [
      { item: true, brake: 1 },
    ]);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  });

  it('disappears after 8 s', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02);
    state.karts[0]!.item.held = 'green';
    let s = run(state, 1, [{ item: true }]).state;
    s = run(s, Math.round(tuning.greenShellLife / DT) + 2).state;
    expect(shells(s)).toHaveLength(0);
  });
});
