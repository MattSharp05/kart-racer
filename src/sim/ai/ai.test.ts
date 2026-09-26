import { describe, expect, it } from 'vitest';
import { sunnyRace } from '../../scenarios/race';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { kartPhysics } from '../kartStats';
import { step } from '../step';
import { trackGeometry } from '../track';
import { DT, type EngineClass } from '../tuning';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from '../types';
import { lineOffsetAt } from './racingLine';

const geometry = trackGeometry(sunnyCircuit);
const line = sunnyCircuit.aiLine ?? [];

/** Runs until every kart has finished or `maxTicks`; the player (kart 0) just sits still. */
function race(state: SimState, maxTicks: number) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < maxTicks; i += 1) {
    const result = step(s, [NEUTRAL_INPUT]);
    s = result.state;
    events.push(...result.events);
    if (s.karts.slice(1).every((k) => k.race.finishTick !== undefined)) break;
  }
  return { state: s, events };
}

/** An AI-only race: the player is removed so it doesn't block the grid. */
function aiOnly(seed: number, karts: number, engineClass: EngineClass = 100): SimState {
  const state = sunnyRace(seed, { karts: karts + 1, ai: true, engineClass });
  const player = state.karts[0]!;
  // Park the (idle) player far off the racing line, inside the grass, so it's not an obstacle.
  player.position = geometry.pointAt(0.5, -geometry.wallOffset(16) + 1);
  // A parked player would pull every AI back; these tests are about the driving itself.
  state.race.rubberBand = false;
  return state;
}

/** Length of the racing line, m. */
function racingLineLength(): number {
  let total = 0;
  const n = 800;
  let prev = geometry.pointAt(0, lineOffsetAt(line, 0));
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const p = geometry.pointAt(t, lineOffsetAt(line, t));
    total += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return total;
}

describe('racing line', () => {
  it('stays on the road and is shorter than the centreline', () => {
    for (let i = 0; i < line.length; i += 1) {
      const t = i / line.length;
      const p = geometry.project(geometry.pointAt(t, line[i] ?? 0));
      expect(p.surface).not.toBe('out');
      expect(Math.abs(line[i] ?? 0)).toBeLessThan(p.width / 2);
    }
    expect(racingLineLength()).toBeLessThan(geometry.length);
  });
});

describe('AI racers', () => {
  it.each([50, 100, 150] as const)(
    'a single AI completes 3 laps at %icc, never leaving the track',
    (cc) => {
      let s = aiOnly(1, 1, cc);
      for (let i = 0; i < 60 * 60 * 4 && s.karts[1]!.race.finishTick === undefined; i += 1) {
        s = step(s, [NEUTRAL_INPUT]).state;
        expect(geometry.project(s.karts[1]!.position).surface).not.toBe('out');
      }
      expect(s.karts[1]!.race.finishTick).toBeDefined();
    },
  );

  it.each([1, 2, 3, 4, 5])(
    '7 AI race 3 laps with nobody stuck for more than 3 s (seed %i)',
    (seed) => {
      let s = aiOnly(seed, 7);
      const stuckFor = new Map<number, number>();
      let worst = 0;
      for (let i = 0; i < 60 * 60 * 4; i += 1) {
        s = step(s, [NEUTRAL_INPUT]).state;
        if (s.phase === 'countdown') continue;
        for (const kart of s.karts.slice(1)) {
          if (kart.race.finishTick !== undefined) continue;
          const t = Math.abs(kart.speed) < 1 ? (stuckFor.get(kart.id) ?? 0) + DT : 0;
          stuckFor.set(kart.id, t);
          worst = Math.max(worst, t);
        }
        if (s.karts.slice(1).every((k) => k.race.finishTick !== undefined)) break;
      }
      expect(s.karts.slice(1).every((k) => k.race.finishTick !== undefined)).toBe(true);
      expect(worst).toBeLessThanOrEqual(3);
    },
  );

  it('best AI lap at 100cc is 5–15% slower than an ideal flat-out lap of the racing line', () => {
    const { state } = race(aiOnly(1, 7), 60 * 60 * 4);
    const best = Math.min(...state.karts.slice(1).flatMap((k) => k.race.lapTimes));
    const ideal = racingLineLength() / kartPhysics('boulder', 100).topSpeed;
    const slower = best / ideal - 1;
    expect(slower).toBeGreaterThanOrEqual(0.05);
    expect(slower).toBeLessThanOrEqual(0.15);
  });

  it('same seed ⇒ same race result', () => {
    const a = race(aiOnly(7, 7), 60 * 60 * 4).state;
    const b = race(aiOnly(7, 7), 60 * 60 * 4).state;
    expect(a.positions).toEqual(b.positions);
    expect(a.karts.map((k) => k.race.finishTick)).toEqual(b.karts.map((k) => k.race.finishTick));
  }, 60_000); // Two full AI races: ~10 s of CPU, up to 20 s on CI's 2-core runner.

  it('the player starts 5th–8th in an AI race', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const state = sunnyRace(seed, { karts: 8, ai: true });
      const s = step(step(state, [NEUTRAL_INPUT]).state, [NEUTRAL_INPUT]).state;
      // On the grid everyone is behind the line; order by distance to it.
      const behind = (k: SimState['karts'][number]) => 1 - geometry.project(k.position).t;
      const order = [...s.karts].sort((x, y) => behind(x) - behind(y)).map((k) => k.id);
      expect(order.indexOf(0) + 1).toBeGreaterThanOrEqual(5);
    }
  });

  it('after a respawn the AI drives off forwards (no reversing out of "stuck")', () => {
    let s = aiOnly(3, 1);
    for (let i = 0; i < 400; i += 1) s = step(s, [NEUTRAL_INPUT]).state; // racing
    // Drop the AI kart off the edge, beyond the wall.
    const ai = s.karts[1]!;
    const t = geometry.project(ai.position).t;
    const outside = geometry.pointAt(t, geometry.wallOffset(16) + 8);
    ai.position = { ...outside, y: outside.y + 2 };
    ai.grounded = false;
    for (let i = 0; i < 60 && s.karts[1]!.respawnTimer === 0; i += 1)
      s = step(s, [NEUTRAL_INPUT]).state;
    expect(s.karts[1]!.respawnTimer).toBeGreaterThan(0);
    for (let i = 0; i < 150; i += 1) s = step(s, [NEUTRAL_INPUT]).state; // carried, then released
    expect(s.karts[1]!.ai!.recoverTime).toBe(0);
    for (let i = 0; i < 60; i += 1) s = step(s, [NEUTRAL_INPUT]).state;
    expect(s.karts[1]!.speed).toBeGreaterThan(3);
  });
});
