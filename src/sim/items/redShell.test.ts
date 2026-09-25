import { describe, expect, it } from 'vitest';
import { redShellRace } from '../../scenarios/tracks';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { step } from '../step';
import { trackGeometry } from '../track';
import { DT } from '../tuning';
import { NEUTRAL_INPUT, type ShellEntity, type SimEvent, type SimState } from '../types';
import { nextEntityId } from './banana';

const geometry = trackGeometry(sunnyCircuit);
const shells = (s: SimState) => s.entities.filter((e): e is ShellEntity => e.kind === 'shell');

/** Fires on tick 1, then runs up to `seconds`; returns the kartHit events and the end state. */
function fire(state: SimState, seconds: number) {
  const hits: { tick: number; event: SimEvent }[] = [];
  let s = state;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    const r = step(s, [{ ...NEUTRAL_INPUT, item: i === 0 }]);
    s = r.state;
    for (const e of r.events) if (e.type === 'kartHit') hits.push({ tick: i, event: e });
  }
  return { hits, state: s };
}

describe('red shell', () => {
  it('fired from 2nd, homes in on the kart ahead (around a bend) within 6 s', () => {
    const state = redShellRace(1, 2);
    const { hits } = fire(state, 6);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.event).toMatchObject({ kartId: 1, by: 0, kind: 'red' });
  });

  it('stays on the road while it follows the track', () => {
    let s = step(redShellRace(1, 2), [{ ...NEUTRAL_INPUT, item: true }]).state;
    for (let i = 0; i < 240 && shells(s).length; i += 1) {
      const shell = shells(s)[0]!;
      expect(geometry.project(shell.position).surface).not.toBe('out');
      s = step(s, [NEUTRAL_INPUT]).state;
    }
  });

  it('from 1st it has no target and flies straight like a green shell', () => {
    const s = step(redShellRace(1, 1), [{ ...NEUTRAL_INPUT, item: true }]).state;
    const shell = shells(s)[0]!;
    expect(shell.targetId).toBe(-1);
    const dir = { ...shell.direction };
    const later = fire(s, 0.3).state;
    const after = shells(later)[0];
    if (after) {
      expect(after.direction.x).toBeCloseTo(dir.x, 5);
      expect(after.direction.z).toBeCloseTo(dir.z, 5);
    }
  });

  it('a banana between the shell and its target blocks it', () => {
    const state = redShellRace(1, 2);
    const t = 0.14 + 20 / geometry.length;
    const position = geometry.pointAt(t, 0);
    state.entities.push({
      id: nextEntityId(state),
      kind: 'banana',
      position,
      from: position,
      flightTimer: 0,
      ownerId: -1,
      ownerImmune: 0,
    });
    const { hits, state: s } = fire(state, 6);
    expect(hits).toHaveLength(0);
    expect(s.entities.some((e) => e.kind === 'banana' || e.kind === 'shell')).toBe(false);
  });
});
