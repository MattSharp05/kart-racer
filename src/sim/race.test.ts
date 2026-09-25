import { describe, expect, it } from 'vitest';
import { kartOnTrack, sunnyStart } from '../scenarios/tracks';
import { scenarios } from '../scenarios';
import { autopilotInput } from './autopilot';
import { SUNNY_INFIELD, sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { crossing, positionOf } from './race';
import { step } from './step';
import { trackGeometry } from './track';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from './types';

const geometry = trackGeometry(sunnyCircuit);

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

const autopilot = (s: SimState) => autopilotInput(s.karts[0]!, geometry);

/** Moves kart 0 to lap fraction `t` (on the centreline, facing along the track), keeping race state. */
function teleport(state: SimState, t: number): SimState {
  const next = structuredClone(state);
  const kart = next.karts[0]!;
  kart.position = geometry.pointAt(t);
  kart.heading = geometry.headingAt(t);
  return next;
}

describe('crossing()', () => {
  it('detects forward, backward and no crossing, including across the finish line', () => {
    expect(crossing(0.99, 0.01, 0)).toBe(1);
    expect(crossing(0.01, 0.99, 0)).toBe(-1);
    expect(crossing(0.24, 0.26, 0.25)).toBe(1);
    expect(crossing(0.26, 0.24, 0.25)).toBe(-1);
    expect(crossing(0.1, 0.12, 0.25)).toBe(0);
  });

  it('ignores big jumps (teleports / projection jumps)', () => {
    expect(crossing(0.1, 0.4, 0.25)).toBe(0);
  });
});

describe('laps', () => {
  it('three autopilot laps from the grid: 3 laps completed with 3 lap times', () => {
    const { state, events } = run(sunnyStart(1), 60 * 60 * 3, autopilot);
    const race = state.karts[0]!.race;
    expect(race.lap - 1).toBe(3);
    expect(race.lapTimes).toHaveLength(3);
    for (const time of race.lapTimes) expect(time).toBeGreaterThan(40);
    // Every intermediate checkpoint of each completed lap, plus any already passed on the current lap.
    const perLap = sunnyCircuit.checkpoints.length - 1;
    const onCurrentLap = race.nextCheckpoint === 0 ? perLap : race.nextCheckpoint - 1;
    expect(events.filter((e) => e.type === 'checkpoint')).toHaveLength(3 * perLap + onCurrentLap);
  });

  it('reversing over the line then driving forward again does not add a lap', () => {
    const start = scenarios.get('sunny-last-checkpoint')!.setup(1).state;
    // Cross the line (lap 2), then brake straight away…
    let state = start;
    while (state.karts[0]!.race.lap < 2) state = run(state, 1, autopilot).state;
    // …reverse back over it (undo) and forward again (lap 2 once more, not 3).
    const back = run(state, 300, () => ({ brake: 1 }));
    expect(back.state.karts[0]!.race.lap).toBe(1);
    ({ state } = run(back.state, 150, autopilot));
    expect(state.karts[0]!.race.lap).toBe(2);
  });

  it('driving backwards across the line from the start does not count a lap', () => {
    const start = kartOnTrack(1, 'sunny-circuit', 0.01, { speed: 15, headingOffset: Math.PI });
    const { state } = run(start, 90, () => ({ throttle: 1 }));
    expect(state.karts[0]!.race.lap).toBe(0);
  });

  it('skipping a checkpoint (illegal cut) means crossing the line does not count', () => {
    const start = scenarios.get('sunny-last-checkpoint')!.setup(1).state;
    start.karts[0]!.race.nextCheckpoint = 2; // still owes checkpoints 2..4
    const { state } = run(start, 120, autopilot);
    expect(state.karts[0]!.race.lap).toBe(1);
  });

  it('a teleport across the lap never passes a checkpoint', () => {
    let state = sunnyStart(1);
    state = run(state, 60, autopilot).state; // across the line: lap 1
    const before = state.karts[0]!.race.nextCheckpoint;
    state = run(teleport(state, 0.5), 2, () => ({})).state;
    expect(state.karts[0]!.race.nextCheckpoint).toBe(before);
  });

  it('the infield shortcut is a legal route: the lap still counts', () => {
    // Start just before the U-turn on lap 1 with checkpoints 1–2 done.
    const t = geometry.project({ x: SUNNY_INFIELD.x + 20, y: 0, z: -75 }).t;
    const start = kartOnTrack(1, 'sunny-circuit', t, { speed: 24, boost: 1.5 });
    start.karts[0]!.race = { ...start.karts[0]!.race, lap: 1, nextCheckpoint: 3, lastT: t };
    let crossed = false;
    const { state } = run(start, 60 * 40, (s) => {
      const k = s.karts[0]!;
      if (!crossed) {
        if (k.position.z > SUNNY_INFIELD.z + SUNNY_INFIELD.radius) crossed = true;
        const desired = Math.atan2(-(SUNNY_INFIELD.x - k.position.x), -(-2 - k.position.z));
        let error = desired - k.heading;
        while (error > Math.PI) error -= 2 * Math.PI;
        while (error < -Math.PI) error += 2 * Math.PI;
        return { throttle: 1, steer: Math.max(-1, Math.min(1, -error * 3)) };
      }
      return autopilot(s);
    });
    expect(state.karts[0]!.race.lap).toBe(2);
  });
});

describe('positions and wrong way', () => {
  it('orders 8 karts by lap, then by distance round the lap', () => {
    const start = scenarios.get('sunny-positions')!.setup(1).state;
    const { state } = run(start, 1, () => ({}));
    // Lap 2 karts first (spots 0.7, 0.5, 0.3, 0.1 → ids 3, 2, 1, 0), then lap 1 (0.8, 0.6, 0.4, 0.2 → 7, 6, 5, 4).
    expect(state.positions).toEqual([3, 2, 1, 0, 7, 6, 5, 4]);
    expect(positionOf(state, 3)).toBe(1);
  });

  it('shows wrong way after 1.5 s of driving backwards, and clears when turned round', () => {
    const start = scenarios.get('sunny-wrong-way')!.setup(1).state;
    const early = run(start, 60, () => ({ throttle: 1 }));
    expect(early.state.karts[0]!.race.wrongWay).toBe(false);
    const later = run(early.state, 45, () => ({ throttle: 1 }));
    expect(later.state.karts[0]!.race.wrongWay).toBe(true);
    const stopped = run(later.state, 90, () => ({ brake: 1 }));
    expect(stopped.state.karts[0]!.race.wrongWay).toBe(false);
  });
});
