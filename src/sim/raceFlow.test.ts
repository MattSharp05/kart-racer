import { describe, expect, it } from 'vitest';
import { scenarios } from '../scenarios';
import { sunnyRace } from '../scenarios/race';
import { positionOf } from './race';
import { autopilotInput } from './autopilot';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { forwardFromHeading } from './math';
import { raceResults } from './raceFlow';
import { step } from './step';
import { trackGeometry } from './track';
import { DT, tuning } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from './types';

const geometry = trackGeometry(sunnyCircuit);
const COUNTDOWN = Math.round(tuning.countdownSeconds / DT);

function run(state: SimState, ticks: number, input: (s: SimState) => Partial<InputFrame>) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(s, [{ ...NEUTRAL_INPUT, ...input(s) }]);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Throttle held from `secondsBeforeGo` before GO onwards (or never, if undefined). */
function startWithThrottleAt(secondsBeforeGo: number | undefined) {
  const pressAt =
    secondsBeforeGo === undefined ? Infinity : COUNTDOWN - Math.round(secondsBeforeGo / DT);
  return run(sunnyRace(1), COUNTDOWN + 30, (s) => ({ throttle: s.tick >= pressAt ? 1 : 0 }));
}

describe('countdown', () => {
  it('lasts exactly 180 ticks, with 3-2-1 then GO', () => {
    const { events, state } = run(sunnyRace(1), COUNTDOWN, () => ({}));
    expect(state.phase).toBe('racing');
    expect(state.tick).toBe(180);
    const beats = events.flatMap((e): (number | string)[] =>
      e.type === 'countdown' ? [e.value] : e.type === 'go' ? ['GO'] : [],
    );
    expect(beats).toEqual([3, 2, 1, 'GO']);
  });

  it('holds karts on the grid while counting down, however hard you press', () => {
    const start = sunnyRace(1);
    const { state } = run(start, COUNTDOWN - 1, () => ({ throttle: 1, steer: 1 }));
    expect(state.phase).toBe('countdown');
    expect(state.karts[0]!.position).toEqual(start.karts[0]!.position);
  });
});

describe('rocket start', () => {
  it('pressing 0.2 s before GO gives a boost at GO', () => {
    const { events } = startWithThrottleAt(0.2);
    expect(events.some((e) => e.type === 'rocketStart')).toBe(true);
    expect(events).toContainEqual({ type: 'boost', kartId: 0, seconds: tuning.rocketBoostSeconds });
  });

  it('pressing 1.5 s before GO stalls the engine for 0.8 s', () => {
    const { events, state } = startWithThrottleAt(1.5);
    expect(events.some((e) => e.type === 'stall')).toBe(true);
    // 30 ticks after GO, still stalled: hardly moving.
    expect(state.karts[0]!.speed).toBeLessThan(1);
  });

  it('not pressing until GO is a normal start (no boost, no stall)', () => {
    const { events, state } = startWithThrottleAt(undefined);
    expect(events.some((e) => e.type === 'rocketStart' || e.type === 'stall')).toBe(false);
    expect(state.karts[0]!.boostTimer).toBe(0);
  });

  it('pressing 0.6 s before GO is neither (the dead zone between the windows)', () => {
    const { events } = startWithThrottleAt(0.6);
    expect(events.some((e) => e.type === 'rocketStart' || e.type === 'stall')).toBe(false);
  });
});

describe('finish and results', () => {
  it('crossing the line on the final lap finishes the race with a time', () => {
    const start = scenarios.get('race-final-straight')!.setup(1).state;
    // 100 m at ~22 m/s ≈ 4.5 s.
    const { state, events } = run(start, 360, (s) => autopilotInput(s.karts[0]!, geometry));
    expect(state.phase).toBe('finished');
    const finish = events.find((e) => e.type === 'finish');
    expect(finish).toMatchObject({ type: 'finish', kartId: 0, position: 1 });
    const [row] = raceResults(state);
    expect(row?.time).toBeGreaterThan(150);
    expect(row?.bestLap).toBeCloseTo(
      state.karts[0]!.race.lapTimes.reduce((a, b) => Math.min(a, b)),
      5,
    );
  });

  it('a full solo 3-lap race from the countdown finishes, with 3 lap times', () => {
    const { state } = run(sunnyRace(1), COUNTDOWN + 60 * 60 * 3, (s) =>
      s.phase === 'countdown' ? {} : autopilotInput(s.karts[0]!, geometry),
    );
    expect(state.phase).toBe('finished');
    expect(state.karts[0]!.race.lapTimes).toHaveLength(3);
  });

  it('the finished kart keeps driving on its own afterwards', () => {
    const start = scenarios.get('race-final-straight')!.setup(1).state;
    const done = run(start, 360, (s) => autopilotInput(s.karts[0]!, geometry)).state;
    const later = run(done, 120, () => ({})).state; // no player input at all
    expect(later.karts[0]!.speed).toBeGreaterThan(5);
  });

  it('two karts crossing the line on the same tick keep their finish places in the results (MK-82)', () => {
    // Two karts side by side on the final straight, kart 1 a few cm behind: both cross on one tick.
    let start = run(sunnyRace(1, 2), COUNTDOWN + 1, () => ({})).state;
    start = structuredClone(start);
    const t = 1 - 0.2 / geometry.length; // ~one tick before the line
    const speed = tuning.topSpeed[100] * 0.9;
    for (const kart of start.karts) {
      const behind = kart.id === 1 ? 0.05 / geometry.length : 0;
      kart.position = geometry.pointAt(t - behind, kart.id === 0 ? -2 : 2);
      kart.heading = geometry.headingAt(t - behind);
      const forward = forwardFromHeading(kart.heading);
      kart.velocity = { x: forward.x * speed, y: 0, z: forward.z * speed };
      kart.speed = speed;
      kart.race = { ...kart.race, lap: start.race.laps, nextCheckpoint: 0, lastT: t - behind };
    }
    // Both held at full throttle until they finish (then they drive themselves).
    const events: SimEvent[] = [];
    let finished = start;
    for (let i = 0; i < 90; i += 1) {
      const throttle = { ...NEUTRAL_INPUT, throttle: 1 };
      const result = step(finished, [throttle, throttle]);
      finished = result.state;
      events.push(...result.events);
    }
    const finishes = events.filter((e) => e.type === 'finish');
    expect(finishes).toHaveLength(2);
    expect(finished.karts[0]!.race.finishTick).toBe(finished.karts[1]!.race.finishTick);
    const place = new Map(finishes.map((e) => [e.kartId, e.position]));
    expect([...place.values()].sort()).toEqual([1, 2]);

    // Afterwards the one placed 2nd races past the other; the places must not swap.
    const second = finishes.find((e) => e.position === 2)!.kartId;
    const boosted = structuredClone(finished);
    boosted.karts[second]!.boostTimer = 3;
    const later = run(boosted, 240, () => ({})).state;
    for (const row of raceResults(later)) expect(row.position).toBe(place.get(row.kartId));
    expect(positionOf(later, second)).toBe(2);
  });

  it('race-finished lists 8 karts with the player 3rd', () => {
    const state = scenarios.get('race-finished')!.setup(1).state;
    const results = raceResults(state);
    expect(results).toHaveLength(8);
    expect(results.find((r) => r.kartId === 0)?.position).toBe(3);
    expect(results.filter((r) => r.time !== undefined)).toHaveLength(3);
  });
});
