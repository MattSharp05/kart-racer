import { describe, expect, it } from 'vitest';
import { resultLines } from '../../game/results';
import { localKart3Race, sunnyRace } from '../../scenarios/race';
import { rubberBandScale } from '../ai/rubberBand';
import { autopilotInput } from '../autopilot';
import { sunnyCircuit } from '../data/tracks/sunnyCircuit';
import { forwardFromHeading } from '../math';
import { raceResults } from '../raceFlow';
import { step } from '../step';
import { trackGeometry } from '../track';
import { DT, tuning } from '../tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../types';
import { createRace, type RacerSlot } from './createRace';

const geometry = trackGeometry(sunnyCircuit);

function racers(controllers: RacerSlot['controller'][]): RacerSlot[] {
  return controllers.map((controller) => ({ kartId: 'maple', controller }));
}

function race(controllers: RacerSlot['controller'][], itemsOn = true): SimState {
  return createRace({
    trackId: sunnyCircuit.id,
    racers: racers(controllers),
    engineClass: 100,
    itemsOn,
    seed: 3,
  });
}

function run(state: SimState, ticks: number, inputs: (s: SimState) => InputFrame[]) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(s, inputs(s));
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Puts kart `id` 100 m before the line on the final lap, at speed. */
function onFinalStraight(state: SimState, id: number): void {
  const kart = state.karts[id]!;
  const t = 1 - 100 / geometry.length;
  kart.position = geometry.pointAt(t);
  kart.heading = geometry.headingAt(t);
  const speed = tuning.topSpeed[100] * 0.9;
  const forward = forwardFromHeading(kart.heading);
  kart.velocity = { x: forward.x * speed, y: 0, z: forward.z * speed };
  kart.speed = speed;
  kart.race = { ...kart.race, lap: state.race.laps, nextCheckpoint: 0, lastT: t };
}

/** Starts the race `secondsAgo` seconds ago. */
function racing(state: SimState, secondsAgo = 10): SimState {
  state.phase = 'racing';
  state.race.goTick = -Math.round(secondsAgo / DT);
  return state;
}

describe('createRace', () => {
  it('puts 8 racers on the track grid slots in order, in countdown', () => {
    const state = race(['local', 'ai', 'ai', 'remote', 'ai', 'ai', 'ai', 'ai']);
    const slots = sunnyCircuit.gridSlots!;
    expect(state.phase).toBe('countdown');
    expect(state.karts).toHaveLength(8);
    state.karts.forEach((kart, i) => {
      const expected = geometry.pointAt(slots[i]!.t, slots[i]!.lateral);
      expect(kart.id).toBe(i);
      expect(kart.position.x).toBeCloseTo(expected.x, 6);
      expect(kart.position.z).toBeCloseTo(expected.z, 6);
      expect(kart.heading).toBeCloseTo(geometry.headingAt(slots[i]!.t), 6);
    });
  });

  it('carries each racer’s kart, controller and name', () => {
    const state = createRace({
      trackId: sunnyCircuit.id,
      racers: [
        { kartId: 'boulder', controller: 'remote', name: 'Ada' },
        { kartId: 'pixie', controller: 'local' },
        { kartId: 'swoop', controller: 'ai' },
      ],
      engineClass: 150,
      itemsOn: true,
      seed: 1,
    });
    expect(state.karts.map((k) => [k.kartType, k.controller, k.name])).toEqual([
      ['boulder', 'remote', 'Ada'],
      ['pixie', 'local', undefined],
      ['swoop', 'ai', undefined],
    ]);
    expect(state.engineClass).toBe(150);
    // Only AI karts get a driver; rubber-banding is on because an AI is racing.
    expect(state.karts.map((k) => k.ai !== undefined)).toEqual([false, false, true]);
    expect(state.race.rubberBand).toBe(true);
  });

  it('has item boxes with items on, and none with items off', () => {
    expect(race(['local', 'ai']).entities.some((e) => e.kind === 'itemBox')).toBe(true);
    expect(race(['local', 'ai'], false).entities).toEqual([]);
  });

  it('is deterministic for a seed', () => {
    const controllers: RacerSlot['controller'][] = ['local', 'ai', 'ai', 'ai'];
    expect(race(controllers)).toEqual(race(controllers));
  });

  it('keeps sunnyRace unchanged: the player on a shuffled back-half slot, AI elsewhere', () => {
    const state = sunnyRace(1, { karts: 8, ai: true });
    expect(state.karts[0]!.controller).toBe('local');
    expect(state.karts.slice(1).every((k) => k.controller === 'ai' && k.ai)).toBe(true);
    const onGrid = sunnyCircuit.gridSlots!.map((s) => geometry.pointAt(s.t, s.lateral));
    const playerSlot = onGrid.findIndex(
      (p) => Math.hypot(p.x - state.karts[0]!.position.x, p.z - state.karts[0]!.position.z) < 1e-6,
    );
    expect(playerSlot).toBeGreaterThanOrEqual(4);
  });
});

describe('controllers', () => {
  it('computes AI input only for ai karts; local and remote karts just read their inputs', () => {
    const start = racing(race(['local', 'ai', 'remote', 'ai']));
    const { state } = run(start, 60, () => []); // no inputs at all
    const moved = state.karts.map((k) => Math.abs(k.speed) > 1);
    expect(moved).toEqual([false, true, false, true]);
  });

  it('a local kart with a leftover AI driver is still driven by its player', () => {
    const start = racing(race(['ai', 'ai']));
    start.karts[0]!.controller = 'local';
    const { state } = run(start, 60, () => []);
    expect(Math.abs(state.karts[0]!.speed)).toBeLessThan(1);
    expect(Math.abs(state.karts[1]!.speed)).toBeGreaterThan(1);
  });

  it('remote karts drive from their inputs like local ones', () => {
    const start = racing(race(['local', 'remote']));
    const push = { ...NEUTRAL_INPUT, throttle: 1 };
    const { state } = run(start, 60, () => [NEUTRAL_INPUT, push]);
    expect(state.karts[1]!.speed).toBeGreaterThan(5);
    expect(Math.abs(state.karts[0]!.speed)).toBeLessThan(1);
  });
});

describe('finishing with the local player on kart 3', () => {
  it('ends the race when kart 3 finishes and builds the results for kart 3', () => {
    const start = racing(localKart3Race(1), 150);
    onFinalStraight(start, 3);
    const { state, events } = run(start, 360, (s) => {
      const inputs: InputFrame[] = [];
      inputs[3] = autopilotInput(s.karts[3]!, geometry);
      return inputs;
    });
    expect(state.phase).toBe('finished');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'finish', kartId: 3, position: 1 }),
    );
    const mine = raceResults(state).find((r) => r.kartId === 3);
    expect(mine).toMatchObject({ position: 1 });
    expect(mine?.time).toBeGreaterThan(150);

    const lines = resultLines(state, 3);
    expect(lines.filter((l) => l.you)).toEqual([
      { position: 1, name: 'Swoop', you: true, time: mine!.time },
    ]);
    expect(lines[0]).toMatchObject({ you: true });
  });

  it('with two people racing, the race ends only when both have finished', () => {
    const start = racing(race(['local', 'remote', 'ai']), 150);
    onFinalStraight(start, 0);
    const drive0 = (s: SimState) => [autopilotInput(s.karts[0]!, geometry)];
    const first = run(start, 360, drive0);
    expect(first.events.some((e) => e.type === 'finish' && e.kartId === 0)).toBe(true);
    expect(first.state.phase).toBe('racing');

    onFinalStraight(first.state, 1);
    const both = run(first.state, 360, (s) => [
      autopilotInput(s.karts[0]!, geometry),
      autopilotInput(s.karts[1]!, geometry),
    ]);
    expect(both.state.phase).toBe('finished');
  });
});

describe('rubber-banding', () => {
  it('measures the gap to the human player wherever they are on the kart list', () => {
    const state = racing(race(['ai', 'ai', 'ai', 'local']), 30);
    const place = (id: number, metres: number) => {
      const t = 0.5 + metres / geometry.length;
      const kart = state.karts[id]!;
      kart.position = geometry.pointAt(t);
      kart.race = { ...kart.race, lap: 2, lastT: t };
    };
    place(3, 0);
    place(0, -400); // far behind the player: speeds up
    place(1, 400); // far ahead: eases off
    state.positions = [1, 3, 2, 0];
    expect(rubberBandScale(state.karts[0]!, state, geometry)).toBeGreaterThan(1);
    expect(rubberBandScale(state.karts[1]!, state, geometry)).toBeLessThan(1);
  });

  it('once one person has finished, measures the gap to the next one still racing', () => {
    const state = racing(race(['local', 'remote', 'ai']), 30);
    const place = (id: number, metres: number, lap = 2) => {
      const t = 0.5 + metres / geometry.length;
      const kart = state.karts[id]!;
      kart.position = geometry.pointAt(t);
      kart.race = { ...kart.race, lap, lastT: t };
    };
    state.karts[0]!.race.finishTick = 0; // finished, top of the order
    place(1, 0);
    place(2, 400);
    state.positions = [0, 2, 1];
    expect(rubberBandScale(state.karts[2]!, state, geometry)).toBeLessThan(1);
  });

  it('is off without a human in the race', () => {
    const state = racing(race(['ai', 'ai']), 30);
    expect(rubberBandScale(state.karts[0]!, state, geometry)).toBe(1);
  });
});

describe('race-local-kart-3', () => {
  it('has the local player on kart 3, 4th on the grid, with AI elsewhere', () => {
    const state = localKart3Race(1);
    expect(state.karts.map((k) => k.controller)).toEqual([
      'ai',
      'ai',
      'ai',
      'local',
      'ai',
      'ai',
      'ai',
      'ai',
    ]);
    expect(state.positions.indexOf(3) + 1).toBe(4);
  });
});
