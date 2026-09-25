import { describe, expect, it } from 'vitest';
import { scenarios } from '../../scenarios';
import { kartOnTrack } from '../../scenarios/tracks';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { step } from '../step';
import { trackGeometry } from '../track';
import { DT, tuning } from '../tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../types';
import { shrinkSeconds } from './starLightning';

const geometry = trackGeometry(sunnyCircuit);
const setup = (name: string) => scenarios.get(name)!.setup(1).state;

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

describe('star', () => {
  it('a starred kart knocks over karts it touches and is not hit itself; ends after 6 s', () => {
    const { state, events } = run(setup('star-active'), 150, [{ throttle: 1 }]);
    const hits = events.filter((e) => e.type === 'kartHit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.type === 'kartHit' && e.by === 0 && e.kind === 'star')).toBe(true);
    expect(hits.some((e) => e.type === 'kartHit' && e.kartId === 0)).toBe(false);
    const rest = run(state, Math.round(tuning.starSeconds / DT) - 150 + 2).state;
    expect(rest.karts[0]!.starTimer).toBe(0);
  });

  it('using a star turns it on', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02);
    state.karts[0]!.item.held = 'star';
    const s = run(state, 1, [{ item: true }]).state;
    expect(s.karts[0]!.starTimer).toBe(tuning.starSeconds);
  });

  it('keeps full star speed on the grass', () => {
    // Drive along the verge (off-road) with and without a star.
    const onGrass = (star: boolean) => {
      const t = 0.03;
      const lateral = geometry.samples[0]!.width / 2 + 2;
      const state = kartOnTrack(1, 'sunny-circuit', t, { lateral, speed: 20 });
      if (star) state.karts[0]!.starTimer = tuning.starSeconds;
      return run(state, 120, [{ throttle: 1 }]).state.karts[0]!.speed;
    };
    expect(onGrass(true)).toBeGreaterThan(tuning.topSpeed[100]);
    expect(onGrass(false)).toBeLessThan(tuning.topSpeed[100] * 0.8);
  });

  it('is immune to banana hits', () => {
    const state = kartOnTrack(1, 'sunny-circuit', 0.02);
    state.karts[0]!.starTimer = 3;
    const position = geometry.pointAt(0.02 + 6 / geometry.length, 0);
    state.entities.push({
      id: 999,
      kind: 'banana',
      position,
      from: position,
      flightTimer: 0,
      ownerId: -1,
      ownerImmune: 0,
    });
    const { events } = run(state, 60, [{ throttle: 1 }]);
    expect(events.some((e) => e.type === 'kartHit')).toBe(false);
  });
});

describe('lightning', () => {
  it('shrink time goes from 8 s for the leader to 3 s for last', () => {
    expect(shrinkSeconds(1, 8)).toBe(8);
    expect(shrinkSeconds(8, 8)).toBe(3);
    expect(shrinkSeconds(4, 8)).toBeGreaterThan(3);
    expect(shrinkSeconds(4, 8)).toBeLessThan(8);
  });

  it('shrinks every opponent except starred ones, by position, and clears their items', () => {
    const state = setup('sunny-positions');
    state.karts[0]!.item.held = 'lightning';
    state.karts[5]!.starTimer = 5;
    state.karts[2]!.item.held = 'banana';
    const positions = [...state.positions];
    const { state: s } = run(state, 1, [{ item: true }]);
    for (const kart of s.karts.slice(1)) {
      if (kart.id === 5) {
        expect(kart.shrinkTimer).toBe(0);
        continue;
      }
      const place = positions.indexOf(kart.id) + 1;
      expect(kart.shrinkTimer).toBeCloseTo(shrinkSeconds(place, 8), 1);
      expect(kart.item.held).toBeNull();
    }
    expect(s.karts[0]!.shrinkTimer).toBe(0);
  });

  it('a full-size kart driving into a shrunk kart runs it over', () => {
    const { events } = run(setup('lightning-shrunk'), 150, [{ throttle: 1 }]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'kartHit', by: 0, kind: 'squash' }),
    );
  });
});
