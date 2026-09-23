import { describe, expect, it } from 'vitest';
import { scenarios } from '../../scenarios';
import { kartOnTrack } from '../../scenarios/tracks';
import { sunnyCircuit } from '../data/tracks/sunnyCircuit';
import { length, sub } from '../math';
import { step } from '../step';
import { trackGeometry } from '../track';
import { DT, tuning } from '../tuning';
import {
  NEUTRAL_INPUT,
  type BananaEntity,
  type InputFrame,
  type SimEvent,
  type SimState,
} from '../types';
import { nextEntityId } from './banana';

const geometry = trackGeometry(sunnyCircuit);
const setup = (name: string) => scenarios.get(name)!.setup(1).state;
const bananas = (s: SimState) => s.entities.filter((e): e is BananaEntity => e.kind === 'banana');

function run(state: SimState, ticks: number, input: Partial<InputFrame>[] = [{}]) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(
      s,
      input.map((f) => ({ ...NEUTRAL_INPUT, ...f })),
    );
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

function withBanana(state: SimState, metresAhead: number) {
  const kart = state.karts[0]!;
  const t = geometry.project(kart.position).t + metresAhead / geometry.length;
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
  return state;
}

describe('banana', () => {
  it('dropping places a banana 2 m behind', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02);
    state.karts[0]!.item.held = 'banana';
    const s = run(state, 1, [{ item: true }]).state;
    const [banana] = bananas(s);
    expect(banana).toBeDefined();
    const d = length(sub(banana!.position, s.karts[0]!.position));
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(2.5);
    expect(geometry.project(banana!.position).t).toBeLessThan(
      geometry.project(s.karts[0]!.position).t,
    );
  });

  it('throwing (accelerating) lands 18–22 m ahead on the track', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02);
    state.karts[0]!.item.held = 'banana';
    const start = state.karts[0]!.position;
    const { state: s } = run(state, 1, [{ item: true, throttle: 1 }]);
    const banana = bananas(s)[0]!;
    const d = length(sub(banana.position, start));
    expect(d).toBeGreaterThan(18);
    expect(d).toBeLessThan(22);
    expect(geometry.project(banana.position).surface).not.toBe('out');
  });

  it('driving over a banana: kartHit, speed ≤ 30%, control back after 1 s', () => {
    let s = withBanana(kartOnTrack(1, 'sunny-circuit', 0.02, { speed: 20 }), 6);
    let hitTick = -1;
    let before = 0;
    for (let i = 0; i < 60 && hitTick < 0; i += 1) {
      before = s.karts[0]!.speed;
      const r = step(s, [{ ...NEUTRAL_INPUT, throttle: 1 }]);
      s = r.state;
      if (r.events.some((e) => e.type === 'kartHit' && e.kartId === 0)) hitTick = s.tick;
    }
    expect(hitTick).toBeGreaterThan(0);
    expect(s.karts[0]!.speed).toBeLessThanOrEqual(before * tuning.hitSpeedFactor + 0.5);
    expect(bananas(s)).toHaveLength(0);
    const spinTicks = Math.round(tuning.spinSeconds / DT);
    s = run(s, spinTicks - 2, [{ throttle: 1 }]).state;
    expect(s.karts[0]!.spinTimer).toBeGreaterThan(0);
    s = run(s, 3, [{ throttle: 1 }]).state;
    expect(s.karts[0]!.spinTimer).toBe(0);
  });

  it('an invulnerable kart passes through a banana without being hit', () => {
    const state = withBanana(kartOnTrack(1, 'sunny-circuit', 0.02, { speed: 20 }), 6);
    state.karts[0]!.invulnerableTimer = 2;
    const { state: s, events } = run(state, 40, [{ throttle: 1 }]);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
    expect(bananas(s)).toHaveLength(1);
  });

  it('owner is immune to its own banana for 0.5 s', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02, { speed: 0 });
    state.karts[0]!.item.held = 'banana';
    // Drop, then reverse onto it straight away.
    const { events } = run(state, 20, [{ item: true, brake: 1 }]);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  });

  it('banana-drop: the kart behind hits the dropped banana', () => {
    const { events } = run(setup('banana-drop'), 90, [{ item: true }, { throttle: 1 }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'kartHit', kartId: 1, by: 0 }));
  });

  it('keeps at most 20 bananas (oldest removed)', () => {
    let s = kartOnTrack(1, 'sunny-circuit', 0.02);
    for (let i = 0; i < 22; i += 1) {
      s.karts[0]!.item.held = 'banana';
      s = run(s, 1, [{ item: true }]).state;
      s = run(s, 1).state;
    }
    expect(bananas(s)).toHaveLength(tuning.maxBananas);
  });
});

describe('AI after a spin-out', () => {
  it('does not count the spin as being stuck', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02, { speed: 0.5 });
    const kart = state.karts[0]!;
    kart.ai = { skill: 1, lineOffset: 0, aggression: 0, stuckTime: 0, recoverTime: 0 };
    kart.spinTimer = tuning.spinSeconds;
    state.phase = 'racing';
    const s = run(state, Math.round(tuning.spinSeconds / DT) + 1).state;
    expect(s.karts[0]!.ai!.recoverTime).toBe(0);
  });
});
